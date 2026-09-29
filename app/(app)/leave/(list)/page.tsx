import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { can } from "@/domain/permissions/can";
import { earliestMyLeaveYear, listMyLeave } from "@/domain/leave";
import { getMyLeaveBalance } from "@/domain/leave/balance-service";
import { formatBalanceLines } from "@/domain/leave/balance";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { DayNumbers } from "../day-numbers";
import { formatLeavePeriod } from "../labels";
import { leaveStatusDisplay, toLeaveStatusKey } from "../status-display";
import { resolveLeaveYear } from "../year-param";
import { LeaveFilterRow, LeaveTable, type LeaveListRow } from "./leave-table";
import styles from "../leave.module.css";

// 04.1-06 S1(§6-1 목록 · A4): 내 연차 — 머리 잔고 줄(연차 · 월차 따로, 합계 행 없음) · 필터 줄(연도 select ·
// 1차 `연차 신청`) · 상태 그룹 표. 연도는 화면에 한 자리만(옵션 둘 이상 = select, 하나 = 부제, T9). 「올해」는
// seoulToday()의 연도(CEO-11). `leave` view 판정은 (list)/layout.tsx가 로딩 경계 밖에서 먼저 한다 — 여기서는
// 세션 검사(WR-07)와 같은 판정을 한 번 더(바깥 겹) 한다.
export const dynamic = "force-dynamic";

export default async function LeaveListPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "leave", "view"))) notFound();
  const thisYear = Number(seoulToday().slice(0, 4));
  const year = resolveLeaveYear((await searchParams).year, thisYear);

  const [balance, leaves, earliest, canWrite] = await Promise.all([
    getMyLeaveBalance(viewer, { fiscalYear: year }),
    listMyLeave(viewer, { fiscalYear: year }),
    earliestMyLeaveYear(viewer),
    can(viewer, "leave", "write"),
  ]);

  // 옵션 = min(가장 이른 신청 연도, 보는 연도) ~ 올해(계획 가정 1 — 옵션 범위로 조회를 거르지 않는다).
  const firstYear = Math.min(earliest ?? thisYear, year);
  const yearOptions: number[] = [];
  for (let y = thisYear; y >= firstYear; y--) yearOptions.push(y);
  const singleYear = yearOptions.length === 1;

  const lines = balance.annual ? formatBalanceLines({ annual: balance.annual, monthly: balance.monthly ?? null }) : [];
  const rows: LeaveListRow[] = leaves.map((leave) => {
    const key = toLeaveStatusKey(leave.status);
    return {
      id: leave.id ?? "",
      number: leave.number ?? "",
      period: formatLeavePeriod(leave),
      startDate: leave.startDate ?? "",
      days: leave.days ?? "",
      statusKey: key,
      status: key ? leaveStatusDisplay(key) : null,
      requestedOn: leave.createdAt ? kstDateOf(leave.createdAt).slice(5) : "",
      note: leave.note ?? "",
    };
  });
  const empty = rows.length === 0;
  // 올해 0건이면 EMPTY 한 줄이 같은 행동을 준다 — 머리 1차를 그리지 않는다. write가 없으면 늘 없다(CX-R5).
  const showPrimary = canWrite && !(empty && year === thisYear);

  return (
    <>
      <PageHeader title="연차" subtitle={singleYear ? `${year} 회계연도` : undefined} />
      {lines.length > 0 ? (
        <div className={styles.balanceLines} data-testid="leave-balance">
          {lines.map((line) => (
            <p key={line.text}>
              <DayNumbers text={line.text} />
            </p>
          ))}
        </div>
      ) : null}
      {singleYear && !showPrimary ? null : <LeaveFilterRow year={year} yearOptions={singleYear ? null : yearOptions} showPrimary={showPrimary} />}
      {empty ? (
        year === thisYear ? (
          canWrite ? (
            <ListEmpty message="신청한 연차가 없습니다" action={{ label: "연차 신청", href: "/leave/new" }} />
          ) : (
            <ListEmpty message="신청한 연차가 없습니다" />
          )
        ) : (
          <ListEmpty message="신청한 연차가 없습니다" action={{ label: "올해 보기", href: "/leave" }} />
        )
      ) : (
        <LeaveTable rows={rows} />
      )}
    </>
  );
}
