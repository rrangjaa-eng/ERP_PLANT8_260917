import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { queryActionLog, parseActionLogDateBoundary, type ActionLogFilter } from "@/domain/action-log";
import { CORE_ACTION_TYPES, ACTION_TYPE_LABELS, type CoreActionType } from "@/domain/action-log/record";
import { listPeople } from "@/domain/people";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { FilterBar, ExportButton, PruneControl, type ActionLogFilterValues } from "./filter-bar";
import styles from "./action-log.module.css";

// ADMN-10·OPS-05: 사람·기간·행동 종류·문서 네 축 필터 + Excel 내보내기 +
// 관리자 정리. D-18과 같은 결: 캐시 없음.
export const dynamic = "force-dynamic";

type SearchParams = {
  actorId?: string;
  from?: string;
  to?: string;
  actionType?: string;
  documentId?: string;
  includePruned?: string;
};

function isValidDateString(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function ActionLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.action-log", "view"))) notFound();

  const params = await searchParams;
  // 필터 줄은 네이티브 GET 폼이라 한 번 제출되면 빈 칸까지 `actorId=&...`로
  // 실린다. 빈 문자열은 "필터 없음"이므로 여기서 한 번만 undefined로 정규화해
  // filter와 filterValues가 같은 값을 쓰게 한다 — filterValues를 정규화하지
  // 않으면 그 ""가 내보내기·정리 액션의 z.string().min(1)에 걸려, 필터를 화면에서
  // 한 번 건드린 뒤에는 두 기능이 다 막힌다.
  const actorId = params.actorId || undefined;
  const actionType = params.actionType || undefined;
  const documentId = params.documentId || undefined;
  const from = isValidDateString(params.from) ? params.from : undefined;
  const to = isValidDateString(params.to) ? params.to : undefined;
  const includePruned = params.includePruned === "1";

  const filter: ActionLogFilter = {
    actorId,
    actionType,
    documentId,
    from: parseActionLogDateBoundary(from, "start"),
    to: parseActionLogDateBoundary(to, "end"),
    includePruned,
  };

  const hasFilter = Boolean(actorId || actionType || documentId || from || to);

  const [rows, canWrite, people] = await Promise.all([
    queryActionLog(session.viewer, filter),
    can(session.viewer, "admin.action-log", "write"),
    listPeople(session.viewer),
  ]);

  const pruneCount = rows.filter((row) => !row.prunedAt && row.actionType !== "action_log_prune").length;

  const filterValues: ActionLogFilterValues = {
    actorId,
    from,
    to,
    actionType,
    documentId,
    includePruned,
  };

  const actionTypeOptions = CORE_ACTION_TYPES.map((type: CoreActionType) => ({
    value: type,
    label: ACTION_TYPE_LABELS[type],
  }));

  return (
    <>
      <PageHeader title="행동 로그" />

      <FilterBar
        people={people.map((person) => ({ id: person.id, name: person.name }))}
        actionTypes={actionTypeOptions}
        defaultValues={filterValues}
        hasFilter={hasFilter}
      />

      <div className={styles.actionRow}>
        <ExportButton filter={filterValues} />
        {canWrite ? <PruneControl filter={filterValues} count={pruneCount} /> : null}
      </div>

      {rows.length === 0 ? (
        hasFilter ? (
          <ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: "/admin/action-log" }} />
        ) : (
          <ListEmpty
            message="기록된 행동이 없습니다"
            action={{ label: "필터 지우기", href: "/admin/action-log" }}
          />
        )
      ) : (
        <table className={styles.table}>
          <caption className={styles.srOnly}>행동 로그</caption>
          <thead>
            <tr>
              <th scope="col">발생 시각</th>
              <th scope="col">행위자</th>
              <th scope="col">행위자 계급</th>
              <th scope="col">행동 종류</th>
              <th scope="col">대상</th>
              <th scope="col">문서</th>
              <th scope="col">상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seq}>
                <td className={styles.occurredAt}>{row.occurredAt ? new Date(row.occurredAt).toISOString().slice(0, 19).replace("T", " ") : "—"}</td>
                <td>{row.actorName ?? "—"}</td>
                <td>{row.actorRoleName ?? "—"}</td>
                <td>{row.actionTypeLabel ?? row.actionType ?? "—"}</td>
                {/* 대상은 이름으로 보인다 — entityName은 도메인이 읽기 시점에 푼 값이고,
                    풀 수 없으면(삭제된 대상·노출표에서 막힌 계급) entityId로 안전하게
                    내려앉는다. 원시 UUID를 사람에게 그대로 보이지 않는다. */}
                <td>
                  {row.entity
                    ? `${row.entity}${row.entityName ? ` ${row.entityName}` : row.entityId ? ` ${row.entityId}` : ""}`
                    : "—"}
                </td>
                <td>{row.documentId ?? "—"}</td>
                {/* 상세 열은 노출표에서 상세 항목이 꺼진 계급에는 값이 비어
                    있다(project()가 이미 걸렀다 — 필드 부재가 아니라 undefined). */}
                <td>{row.detail && Object.keys(row.detail).length > 0 ? JSON.stringify(row.detail) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
