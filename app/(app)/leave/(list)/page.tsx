import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { can } from "@/domain/permissions/can";
import { listMyLeave, myLeaveYearRange } from "@/domain/leave";
import { getMyLeaveBalance, listPeopleLeaveBalances } from "@/domain/leave/balance-service";
import { formatBalanceLines } from "@/domain/leave/balance";
import { peopleLeaveScopeOf } from "@/domain/leave/access";
import { formatLeaveDays } from "@/domain/leave/days";
import type { Viewer } from "@/domain/viewer";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { DayNumbers } from "../day-numbers";
import { formatLeavePeriod, formatTableDate } from "../labels";
import { leaveStatusWord, toLeaveStatusKey } from "../status-display";
import { resolveLeaveYear } from "../year-param";
import { LeaveTable, LeaveYearFilter, type LeaveListRow } from "./leave-table";
import { PeopleBalanceTable, type PeopleBalanceRow } from "./people-balance-table";
import styles from "../leave.module.css";

// 04.1-06 S1(§6-1 목록 · A4): 내 연차 — 머리 잔고 줄(연차 · 월차 따로, 합계 행 없음) · 필터 줄(연도 select ·
// 1차 `연차 신청`) · 상태 그룹 표. 연도는 화면에 한 자리만(옵션 둘 이상 = select, 하나 = 글자, T9). 「올해」는
// seoulToday()의 연도(CEO-11). `leave` view 판정은 (list)/layout.tsx가 로딩 경계 밖에서 먼저 한다 — 여기서는
// 세션 검사(WR-07)와 같은 판정을 한 번 더(바깥 겹) 한다.
export const dynamic = "force-dynamic";

export default async function LeaveListPage({ searchParams }: { searchParams: Promise<{ year?: string | string[]; view?: string | string[] }> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "leave", "view"))) notFound();
  const thisYear = Number(seoulToday().slice(0, 4));
  const params = await searchParams;
  // 07.2-08 S20(D-7261 · 07.2 D-7308): 「전체」 범위는 서버 한 곳(peopleLeaveScopeOf) — null이면 링크 DOM 0 · `?view=all`은 404.
  const scope = await peopleLeaveScopeOf(viewer);
  if (params.view === "all") {
    if (!scope) notFound();
    return <PeopleLeaveView viewer={viewer} rawYear={params.year} thisYear={thisYear} />;
  }
  // 위 끝 = max(올해, 내 신청의 가장 늦은 연도) — 연말에 낸 다음 해 신청을 ?year로 볼 수 있게(사용자 결정 2026-09-29).
  const range = await myLeaveYearRange(viewer);
  const lastYear = Math.max(thisYear, range?.latest ?? thisYear);
  const year = resolveLeaveYear(params.year, lastYear, thisYear);

  const [balance, leaves, canWrite] = await Promise.all([
    getMyLeaveBalance(viewer, { fiscalYear: year }),
    listMyLeave(viewer, { fiscalYear: year }),
    can(viewer, "leave", "write"),
  ]);

  // 옵션 = min(가장 이른 신청 연도, 보는 연도, 올해) ~ 위 끝(계획 가정 1 — 옵션 범위로 조회를 거르지 않는다). 올해는
  // 늘 옵션에 있다 — 다음 해 신청만 있는 사람이 다음 해를 볼 때도 올해로 돌아올 수 있게.
  const firstYear = Math.min(range?.earliest ?? thisYear, year, thisYear);
  const yearOptions: number[] = [];
  for (let y = lastYear; y >= firstYear; y--) yearOptions.push(y);
  const singleYear = yearOptions.length === 1;

  // 보는 연도가 퇴직 연도면 퇴직 줄 하나(관리자 사람 상세와 같은 재료 — Codex P2).
  const lines = balance.annual
    ? formatBalanceLines({ annual: balance.annual, monthly: balance.monthly ?? null, resignation: balance.resignation ?? null })
    : [];
  const rows: LeaveListRow[] = leaves.map((leave) => {
    const key = toLeaveStatusKey(leave.status);
    return {
      id: leave.id ?? "",
      number: leave.number ?? "",
      period: formatLeavePeriod(leave, thisYear),
      startDate: leave.startDate ?? "",
      days: leave.days ?? "",
      statusKey: key,
      status: key ? leaveStatusWord(key) : null,
      requestedOn: leave.createdAt ? formatTableDate(kstDateOf(leave.createdAt), thisYear) : "",
      note: leave.note ?? "",
    };
  });
  const empty = rows.length === 0;
  // 올해 0건이면(DR5 A) 머리 1차를 그리지 않고 빈 화면의 「연차 신청」 하나가 같은 행동을 준다 — `ListScreen.empty`가 머리 1차를 숨긴다.
  // write가 없으면 빈 화면에도 행동이 없다(CX-R5). 다른 해의 빈 화면 「올해 보기」는 등록 행동이 아니라 필터 결과라 머리 1차를 남긴다.
  const emptyThisYear = empty && year === thisYear;

  return (
    <ListScreen
      title="연차"
      primaryAction={canWrite ? { label: "연차 신청", href: "/leave/new" } : undefined}
      filters={
        <>
          {scope ? <ViewLinks current="mine" /> : null}
          <LeaveYearFilter year={year} yearOptions={singleYear ? null : yearOptions} />
        </>
      }
      summaryPlain
      summary={
        lines.length > 0 ? (
          <div className={styles.balanceLines} data-testid="leave-balance">
            {lines.map((line) => (
              <p key={line.text}>
                <DayNumbers text={line.text} />
              </p>
            ))}
          </div>
        ) : undefined
      }
      empty={
        emptyThisYear ? (
          <ListEmpty message="신청한 연차가 없습니다" action={canWrite ? { label: "연차 신청", href: "/leave/new" } : undefined} />
        ) : undefined
      }
    >
      {empty ? <ListEmpty message="신청한 연차가 없습니다" action={{ label: "올해 보기", href: "/leave" }} /> : <LeaveTable rows={rows} />}
    </ListScreen>
  );
}

// 선택 링크 줄(SYSTEM §6-1 DC-11) — 필터 줄 맨 앞 `내 연차` · `전체`, 현재 항목 aria-current + 밑줄. 범위가 있는 사람에게만 그린다.
function ViewLinks({ current }: { current: "mine" | "all" }) {
  return (
    <nav aria-label="연차 보기" className={styles.viewLinks}>
      <Link href="/leave" className={styles.viewLink} aria-current={current === "mine" ? "page" : undefined}>
        내 연차
      </Link>
      <Link href="/leave?view=all" className={styles.viewLink} aria-current={current === "all" ? "page" : undefined}>
        전체
      </Link>
    </nav>
  );
}

// 숨은 값(undefined · 정보 노출) · 없는 월차(null)는 `—`. 음수는 그대로 하이픈(붉은색 없음).
function daysText(quarters: number | null | undefined): string {
  return typeof quarters === "number" ? formatLeaveDays(quarters) : "—";
}

// 07.2-08 S20(PU12): 사람별 연차 잔여 — 범위 · 숫자는 listPeopleLeaveBalances(같은 computeBalance 사슬). 연도 옵션은 올해부터
// 보는 연도 · 지난해 중 이른 쪽까지(대상 0명인 연도에서도 돌아올 수 있게). 합계 행 · 합산 열 없음, 결과 글자 `{N}명`만.
async function PeopleLeaveView({ viewer, rawYear, thisYear }: { viewer: Viewer; rawYear: string | string[] | undefined; thisYear: number }) {
  const year = resolveLeaveYear(rawYear, thisYear, thisYear);
  const { rows, count } = await listPeopleLeaveBalances(viewer, year);
  const yearOptions: number[] = [];
  for (let y = thisYear; y >= Math.min(year, thisYear - 1); y--) yearOptions.push(y);
  const tableRows: PeopleBalanceRow[] = rows.map((row, index) => ({
    id: row.userId ?? String(index),
    name: row.name ?? "—",
    resigned: row.resigned === true,
    team: row.teamName ?? "—",
    granted: daysText(row.grantedQuarters),
    used: daysText(row.usedQuarters),
    pending: daysText(row.pendingQuarters),
    remaining: daysText(row.remainingQuarters),
    monthlyRemaining: daysText(row.monthlyRemainingQuarters),
  }));
  return (
    <ListScreen
      title="연차"
      filters={
        <>
          <ViewLinks current="all" />
          <LeaveYearFilter year={year} yearOptions={yearOptions} allView />
          <span className={styles.resultCount}>{`${count}명`}</span>
        </>
      }
    >
      {count === 0 ? (
        <ListEmpty message="조건에 맞는 사람이 없습니다" action={{ label: "연도 바꾸기", href: year === thisYear ? `/leave?view=all&year=${thisYear - 1}` : "/leave?view=all" }} />
      ) : (
        <PeopleBalanceTable rows={tableRows} />
      )}
    </ListScreen>
  );
}
