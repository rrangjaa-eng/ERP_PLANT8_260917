import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { loadHolidayAdmin, type HolidayAdminView } from "@/domain/holidays/admin";
import { formatKstMinute, toKstDate } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ConfirmYear } from "./confirm-year";
import { HolidayForm } from "./holiday-form";
import { AddedToast } from "./added-toast";
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
      <>
        <PageHeader title="공휴일" />
        <ListEmpty
          tone="error"
          message="공휴일을 불러오지 못했습니다 · 다시 시도"
          action={{ label: "다시 시도", href: yearParam ? `/admin/holidays?year=${yearParam}` : "/admin/holidays" }}
        />
      </>
    );
  }

  const confirmed = view.confirmation !== null;
  const listHref = `/admin/holidays?year=${view.year}`;
  // `added`는 ISO 날짜이고 그 해 행에 있을 때만 토스트를 띄운다(T-4.2-74).
  const addedDate =
    added && /^\d{4}-\d{2}-\d{2}$/.test(added) && view.rows.some((row) => row.date === added) ? added : null;

  return (
    <>
      <PageHeader title="공휴일" />

      {showForm ? <HolidayForm min={kstTomorrow()} max={`${LUNAR_TABLE_LAST_YEAR}-12-31`} cancelHref={listHref} /> : null}

      <div className={styles.filterRow}>
        <nav aria-label="연도">
          <ul className={styles.years}>
            {view.years.map(({ year }) => (
              <li key={year}>
                {year === view.year ? (
                  <span className={styles.yearCurrent} aria-current="page">
                    {`${year}년`}
                  </span>
                ) : (
                  <a className={styles.yearLink} href={`/admin/holidays?year=${year}`}>
                    {`${year}년`}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {canWrite && !showForm ? (
          <a className={styles.addLink} href={`${listHref}&new=1`}>
            공휴일 추가
          </a>
        ) : null}
      </div>

      {view.candidateError ? (
        <ListEmpty tone="error" message={view.candidateError} />
      ) : (
        <>
          <div className={styles.statusRow}>
            {view.confirmation ? (
              <p className={styles.status}>
                <StatusTag kind="success" variant="text">
                  확정
                </StatusTag>
                {` · ${formatKstMinute(view.confirmation.confirmedAt)} ${view.confirmation.confirmedByName} · 공휴일 ${view.count}일`}
              </p>
            ) : (
              <p className={styles.status}>
                <StatusTag kind="muted" variant="text">
                  후보
                </StatusTag>
                {` · 공휴일 ${view.count}일`}
              </p>
            )}
            {!confirmed && canWrite && !showForm ? <ConfirmYear key={view.year} year={view.year} /> : null}
          </div>

          <table className={styles.table}>
            <caption className="sr-only">{`${view.year}년 공휴일`}</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">요일</th>
                <th scope="col">이름</th>
                <th scope="col">구분</th>
                {canWrite ? <th scope="col">동작</th> : null}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.date}>{row.monthDay}</td>
                  <td>{row.weekday}</td>
                  <td className={styles.name}>{row.name}</td>
                  <td>{row.kindLabel}</td>
                  {canWrite ? <td /> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {addedDate ? <AddedToast date={addedDate} year={view.year} /> : null}
    </>
  );
}
