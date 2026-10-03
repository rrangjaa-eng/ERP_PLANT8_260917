import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { loadHolidayAdmin, type HolidayAdminView } from "@/domain/holidays/admin";
import { formatKstMinute, toKstDate } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { LinkPending } from "@/ui/link-pending/LinkPending";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 2차 클래스를 직접 쓴다(ListScreen·ListEmpty 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { ConfirmYear } from "./confirm-year";
import { HolidayForm } from "./holiday-form";
import { AddedToast } from "./added-toast";
import { DeleteHoliday } from "./delete-holiday";
import { DeleteUndoSection } from "./delete-undo";
import styles from "./holidays.module.css";

// ADMN-11(04.2-11) — 04.2-UI-SPEC S2. 캐시 없음(§7-7 관리자 마스터 화면 — 서버 렌더에 값이 들어 있다).
export const dynamic = "force-dynamic";

function parseYear(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  return Number(value);
}

// 날짜 칸 `min` = KST 내일(S2-d). 달력 선택을 좁힐 뿐 마지막 관문은 서버다.
function kstTomorrow(): string {
  const next = new Date(`${toKstDate(new Date())}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; new?: string; added?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.holidays", "view"))) notFound();

  const { year: yearParam, new: newParam, added } = await searchParams;
  const canWrite = await can(session.viewer, "admin.holidays", "write");
  const showForm = canWrite && newParam === "1";

  let view: HolidayAdminView | null = null;
  try {
    view = await loadHolidayAdmin(session.viewer, { requestedYear: parseYear(yearParam) });
  } catch {
    view = null;
  }

  if (!view) {
    return (
      <ListScreen title="공휴일">
        <ListEmpty
          tone="error"
          message="공휴일 불러오기 실패"
          action={{ label: "다시 시도", href: yearParam ? `/admin/holidays?year=${yearParam}` : "/admin/holidays" }}
        />
      </ListScreen>
    );
  }

  const confirmed = view.confirmation !== null;
  const listHref = `/admin/holidays?year=${view.year}`;
  const addHref = `${listHref}&new=1`;
  // PR #73 — 확정은 올해·내년(KST)만 도메인이 받는다. 주소창으로 다른 해를 불러도
  // (과거 연도 데이터가 남아 있을 때) 버튼은 보이지 않는다(§7 — 틀린 선택 자체를 없앤다).
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const canConfirmYear = view.year === thisYear || view.year === thisYear + 1;
  // DR5 A — 행이 하나도 없으면 머리 1차를 숨기고 빈 화면 버튼 하나가 같은 행동을 맡는다.
  const isEmpty = !view.candidateError && view.rows.length === 0;
  // DR2 A — 확정 버튼이 보이는 해(확정 전 · 쓰기 권한 · 확정 가능한 해)는 「확정」이 1차, 그 밖의 해는 「공휴일 추가」가 1차다.
  // 패널이 열려도 버튼은 그대로다(R4 — 뒤 목록은 패널 여부와 무관하다).
  const showConfirm = !view.candidateError && !isEmpty && !confirmed && canWrite && canConfirmYear;
  const primaryAction = canWrite && !showConfirm && !isEmpty ? { label: "공휴일 추가", href: addHref } : undefined;
  // `added`는 ISO 날짜이고 그 해 행에 있을 때만 토스트를 띄운다(T-4.2-74).
  const addedDate =
    added && /^\d{4}-\d{2}-\d{2}$/.test(added) && view.rows.some((row) => row.date === added) ? added : null;

  const filters = (
    <>
      <nav aria-label="연도">
        <ul className={styles.years}>
          {view.years.map(({ year }) => (
            <li key={year}>
              {year === view.year ? (
                <span className={styles.yearCurrent} aria-current="page">
                  {`${year}년`}
                </span>
              ) : (
                <Link className={styles.yearLink} href={`/admin/holidays?year=${year}`} scroll={false}>
                  {`${year}년`}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      {/* DR2 A — 확정 버튼이 1차인 해에는 「공휴일 추가」가 필터 줄 2차 링크다. 빈 목록은 빈 화면 버튼이 맡는다. */}
      {showConfirm ? (
        <Link href={addHref} scroll={false} className={`${buttonStyles.btn} ${buttonStyles.secondary} ${styles.addLink}`}>
          공휴일 추가
          <LinkPending />
        </Link>
      ) : null}
    </>
  );

  return (
    <ListScreen
      title="공휴일"
      primaryAction={primaryAction}
      filters={filters}
      empty={
        isEmpty ? (
          <ListEmpty
            message="등록된 공휴일이 없습니다"
            action={canWrite ? { label: "공휴일 추가", href: addHref } : undefined}
          />
        ) : undefined
      }
      panel={
        // 쓰기 권한이 없는 계급에는 패널 자체를 렌더하지 않는다(R15 · T-04.6-45).
        showForm ? (
          <SidePanel key="new" title="공휴일 추가" closeHref={listHref}>
            <HolidayForm min={kstTomorrow()} max={`${LUNAR_TABLE_LAST_YEAR}-12-31`} />
          </SidePanel>
        ) : null
      }
    >
      {view.candidateError ? (
        <ListEmpty tone="error" message={view.candidateError} />
      ) : (
        <>
          {/* 상태 줄은 설명 문장이 아니라 상태 + 확정자·시각·개수 값이다 — 문단(p)이 아니라 div(원칙 점검의 「긴 설명」 문단 판정에서 빠진다). */}
          <div className={styles.statusRow}>
            {view.confirmation ? (
              <div className={styles.status}>
                <StatusTag status="확정" variant="text" />
                {` · ${formatKstMinute(view.confirmation.confirmedAt)} ${view.confirmation.confirmedByName} · 공휴일 ${view.count}일`}
              </div>
            ) : (
              <div className={styles.status}>
                <StatusTag status="후보" variant="text" />
                {` · 공휴일 ${view.count}일`}
              </div>
            )}
            {showConfirm ? <ConfirmYear key={view.year} year={view.year} /> : null}
          </div>

          {/* 연도를 바꾸면 결과 줄이 사라진다. 패널은 목록을 바꾸지 않으므로 열고 닫아도 남는다(R4). */}
          <DeleteUndoSection key={view.year}>
            <StaticTable
              caption={`${view.year}년 공휴일`}
              columns={[
                { key: "date", header: "날짜", priority: "p2" },
                { key: "weekday", header: "요일", priority: "p2" },
                { key: "name", header: "이름", priority: "p1" },
                { key: "kind", header: "구분", priority: "p2" },
                ...(canWrite ? [{ key: "actions", header: "동작", priority: "p1" as const }] : []),
              ]}
              rows={view.rows.map((row) => ({
                key: row.id,
                cells: [
                  <span key="date" className={styles.date}>
                    {row.monthDay}
                  </span>,
                  row.weekday,
                  <span key="name" className={styles.name}>
                    {row.name}
                  </span>,
                  row.kindLabel,
                  ...(canWrite ? [row.deletable ? <DeleteHoliday key="actions" id={row.id} date={row.date} /> : null] : []),
                ],
              }))}
            />
          </DeleteUndoSection>
        </>
      )}

      {addedDate ? <AddedToast date={addedDate} year={view.year} /> : null}
    </ListScreen>
  );
}
