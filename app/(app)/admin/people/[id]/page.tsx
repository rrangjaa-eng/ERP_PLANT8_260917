import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { getPerson } from "@/domain/people";
import { assignableRoleIds, listAssignableRoles } from "@/domain/permissions/roles";
import { GRANT_FORBIDDEN_MESSAGE } from "@/domain/permissions/grant-ceiling";
import { listOrgUnits, listTeams } from "@/domain/org";
import { KvList } from "@/ui/kv-list/KvList";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import type { HistoryEntry } from "@/ui/history-list/HistoryList";
import { PersonRoleChange, PersonHistorySection } from "./person-detail-client";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { getLeaveBalanceForUser, listLeaveAdjustmentsForUser } from "@/domain/leave/balance-service";
import { checkLeaveAdjustment, formatBalanceLines } from "@/domain/leave/balance";
import { formatLeaveDays } from "@/domain/leave/days";
import { resolveLeaveYear } from "@/app/(app)/leave/year-param";
import { LeaveSection, type LeaveAdjustmentRow } from "./leave-section";
import { getPersonPayoutAccount } from "@/domain/people/account";
import { maskTail4 } from "@/lib/mask-tail4";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { PayoutAccountPanel, PayoutAccountSection, type PayoutAccountView } from "./payout-account";

export const dynamic = "force-dynamic";

// settings/page.tsx의 buildSections()와 같은 이유로 별도 함수로 뺀다 —
// 컴포넌트 본문 안에서 클로저 변수를 재할당하면 eslint-plugin-react-hooks의
// immutability 규칙이 발동한다(서버 컴포넌트라 실제로는 안전하지만 규칙이
// 구분하지 않는다).
function buildHistoryEntries(
  assignments: { effectiveFrom: string; teamName: string }[],
  today: string,
): HistoryEntry[] {
  let activeMarked = false;
  return assignments.map((assignment) => {
    if (assignment.effectiveFrom > today) {
      return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "scheduled" };
    }
    if (!activeMarked) {
      activeMarked = true;
      return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "active" };
    }
    return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "past" };
  });
}

// §6-2 상세 화면 — 사람 상세는 이름·이메일·계급·현재 소속(KvList) + 계급
// 변경 + 04.1-06 연차 섹션(S9) + 발령 이력(§7-14 HistoryList, 03-04 산출 컴포넌트 재사용).
export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string | string[]; editAccount?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const { id } = await params;
  const [detail, roles, orgUnits, teams] = await Promise.all([
    getPerson(session.viewer, id),
    listAssignableRoles(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
  ]);
  if (!detail) notFound();

  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: `${orgUnitNameById.get(team.orgUnitId) ?? ""} · ${team.name}`,
  }));

  const entries = buildHistoryEntries(detail.assignments, seoulToday());

  // 04.1-06 S9 연차 섹션(C-N01 · CXF2-C-F2-01 · S9-FY) — 읽기 순서 고정: ① 올해 잔고(입사일 · 퇴직일은 조회 연도와 무관하게
  // 실린다) → 대체 연도(퇴직자 = min(퇴직 연도, 올해), 그 밖 올해)로 섹션 연도를 한 번 정하고 → ② 섹션 연도가 올해와 다를
  // 때만 그 연도 잔고를 한 번 더 → ③ 그 연도 조정 기록. 섹션 연도 하나를 잔고 · 기록 · 연차 조정 fiscalYear · 부제가 같이 쓴다.
  // 읽기 실패는 새 경계 없이 app/(app)/error.tsx가 받는다(CX-R9).
  const today = seoulToday();
  const thisYear = Number(today.slice(0, 4));
  const current = await getLeaveBalanceForUser(session.viewer, id, { fiscalYear: thisYear });
  const fallbackYear = current.resignationDate ? Math.min(Number(current.resignationDate.slice(0, 4)), thisYear) : thisYear;
  const query = await searchParams;
  const leaveYear = resolveLeaveYear(query.year, thisYear, fallbackYear);
  const currentRoleId = detail.person.roleId ?? null;
  const [balance, adjustments, canWrite, assignableCurrent, payoutAccount] = await Promise.all([
    leaveYear === thisYear ? current : getLeaveBalanceForUser(session.viewer, id, { fiscalYear: leaveYear }),
    listLeaveAdjustmentsForUser(session.viewer, { userId: id, fiscalYear: leaveYear }),
    can(session.viewer, "admin.people", "write"),
    currentRoleId === null ? new Set<string>() : assignableRoleIds(session.viewer, [currentRoleId]),
    // 06.5-04(D-6505): 게이트 밖이면 null — 섹션 · 패널을 그리지 않는다(문구 없음).
    getPersonPayoutAccount(session.viewer, id),
  ]);
  // 06.4(D-6414 · D4 · D6) 계급 변경 자리 상태표(서버 한 곳): 쓰기 없음 · 자기 상세 · 계급 노출 꺼짐 → 줄 없음 /
  // C 상한 밖 · 통과 0 → 이유 한 줄 / 그 밖 → select. 노출이 꺼지면 DTO에 roleId 키가 없다.
  const showRoleChange = canWrite && session.viewer.id !== id && "roleId" in detail.person;
  const targetOutOfCeiling = currentRoleId !== null && !assignableCurrent.has(currentRoleId);
  const lockedReason = targetOutOfCeiling || roles.length === 0 ? GRANT_FORBIDDEN_MESSAGE : null;
  const balanceLines = balance.annual
    ? formatBalanceLines({ annual: balance.annual, monthly: balance.monthly ?? null, resignation: balance.resignation ?? null }).map((line) => line.text)
    : [];
  const hireDate = current.hireDate ?? null;
  const blocked =
    "hireDate" in current ? checkLeaveAdjustment({ bucket: "monthly", fiscalYear: null, amountDays: 1, reason: "-", createdOn: today, hireDate }) : null;
  const adjustmentRows: LeaveAdjustmentRow[] = adjustments.map((row, index) => ({
    id: row.id ?? `adjustment-${index}`,
    date: row.createdAt ? kstDateOf(row.createdAt) : "",
    kind: row.kind === "monthly" ? "월차" : row.kind === "annual" ? "연차" : "",
    days: row.quarters !== undefined ? formatLeaveDays(row.quarters) : "",
    reason: row.reason ?? "",
    author: row.createdByName ?? "",
  }));

  // 패널 주소 토글(`?editAccount=1`) — 닫을 곳은 같은 페이지에서 editAccount만 뺀 주소(year는 남긴다).
  const baseHref = typeof query.year === "string" ? `/admin/people/${id}?year=${encodeURIComponent(query.year)}` : `/admin/people/${id}`;
  const editAccountHref = `${baseHref}${baseHref.includes("?") ? "&" : "?"}editAccount=1`;
  const payoutView: PayoutAccountView | null = payoutAccount
    ? { bank: payoutAccount.bank ?? null, holder: payoutAccount.holder ?? null, masked: maskTail4(payoutAccount.last4) }
    : null;

  return (
    <DetailScreen title={detail.person.name} meta={detail.person.email}>

      <div className="single-column">
        <KvList
          items={[
            { label: "이름", value: detail.person.name },
            { label: "이메일", value: detail.person.email },
            { label: "계급", value: detail.person.roleName ?? "—" },
            { label: "현재 소속", value: detail.person.currentTeamName ?? "미배정" },
          ]}
        />

        {showRoleChange ? (
          <PersonRoleChange userId={id} roles={roles} currentRoleId={currentRoleId} lockedReason={lockedReason} />
        ) : null}
      </div>

      <LeaveSection
        userId={id}
        year={leaveYear}
        thisYear={thisYear}
        balanceLines={balanceLines}
        hireDate={hireDate}
        resignationDate={current.resignationDate ?? null}
        datesVisible={"hireDate" in current}
        adjustments={adjustmentRows}
        // 사용자 결정(2026-09-29 A) — 자기 연차 · 입사일 · 퇴직일은 바꾸지 못한다(서버도 거부) — 쓰기 칸을 그리지 않는다.
        canWrite={canWrite && session.viewer.id !== id}
        resignationWritable={!targetOutOfCeiling}
        monthlyBlockedReason={blocked?.field === "bucket" ? blocked.message : null}
      />

      {payoutView ? <PayoutAccountSection account={payoutView} editHref={editAccountHref} /> : null}
      {payoutView && query.editAccount === "1" ? (
        <SidePanel title="지급 계좌 수정" closeHref={baseHref}>
          <PayoutAccountPanel userId={id} account={payoutView} />
        </SidePanel>
      ) : null}

      {/* §3 데이터 표 예외 — 발령 이력 표는 .single-column 밖, 전체 폭(260922-o2b 후속). */}
      <PersonHistorySection userId={detail.person.id} teamOptions={teamOptions} entries={entries} />
    </DetailScreen>
  );
}
