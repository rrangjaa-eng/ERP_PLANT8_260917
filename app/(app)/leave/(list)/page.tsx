import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { can } from "@/domain/permissions/can";
import { listMyLeave, myLeaveYearRange } from "@/domain/leave";
import { getMyLeaveBalance } from "@/domain/leave/balance-service";
import { formatBalanceLines } from "@/domain/leave/balance";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { DayNumbers } from "../day-numbers";
import { formatLeavePeriod, formatTableDate } from "../labels";
import { leaveStatusWord, toLeaveStatusKey } from "../status-display";
import { resolveLeaveYear } from "../year-param";
import { LeaveTable, LeaveYearFilter, type LeaveListRow } from "./leave-table";
import styles from "../leave.module.css";

// 04.1-06 S1(§6-1 목록 · A4): 내 연차 — 머리 잔고 줄(연차 · 월차 따로, 합계 행 없음) · 필터 줄(연도 select ·
// 1차 `연차 신청`) · 상태 그룹 표. 연도는 화면에 한 자리만(옵션 둘 이상 = select, 하나 = 글자, T9). 「올해」는
// seoulToday()의 연도(CEO-11). `leave` view 판정은 (list)/layout.tsx가 로딩 경계 밖에서 먼저 한다 — 여기서는
// 세션 검사(WR-07)와 같은 판정을 한 번 더(바깥 겹) 한다.
export const dynamic = "force-dynamic";

export default async function LeaveListPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "leave", "view"))) notFound();
  const thisYear = Number(seoulToday().slice(0, 4));
  // 위 끝 = max(올해, 내 신청의 가장 늦은 연도) — 연말에 낸 다음 해 신청을 ?year로 볼 수 있게(사용자 결정 2026-09-29).
  const range = await myLeaveYearRange(viewer);
  const lastYear = Math.max(thisYear, range?.latest ?? thisYear);
  const year = resolveLeaveYear((await searchParams).year, lastYear, thisYear);

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
      filters={<LeaveYearFilter year={year} yearOptions={singleYear ? null : yearOptions} />}
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
