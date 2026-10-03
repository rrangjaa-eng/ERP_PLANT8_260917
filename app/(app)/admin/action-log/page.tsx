import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { queryActionLog, parseActionLogDateBoundary, type ActionLogFilter } from "@/domain/action-log";
import { CORE_ACTION_TYPES, ACTION_TYPE_LABELS, type CoreActionType } from "@/domain/action-log/record";
import { isPrunableActionType } from "@/domain/action-log/prune-scope";
import { listPeople } from "@/domain/people";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { StaticTable, type StaticTableColumn } from "@/ui/table/StaticTable";
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
  const actionType = params.actionType || undefined;
  const documentId = params.documentId || undefined;
  const from = isValidDateString(params.from) ? params.from : undefined;
  const to = isValidDateString(params.to) ? params.to : undefined;
  const includePruned = params.includePruned === "1";

  // D1(사용자 결정 2026-09-30): 고를 사람이 없는 계급은 「사람」 칸이 없어 끌 수 없으므로 URL actorId를 적용하지 않는다.
  const [people, canWrite] = await Promise.all([listPeople(session.viewer), can(session.viewer, "admin.action-log", "write")]);
  // person.value가 꺼진 계급의 DTO에는 id · 이름 키가 없다 — 고를 수 없는 사람은 선택지에 올리지 않는다.
  const selectablePeople = people.filter((person) => "id" in person).map((person) => ({ id: person.id, name: person.name }));
  const actorId = selectablePeople.length > 0 ? params.actorId || undefined : undefined;

  const filter: ActionLogFilter = {
    actorId,
    actionType,
    documentId,
    from: parseActionLogDateBoundary(from, "start"),
    to: parseActionLogDateBoundary(to, "end"),
    includePruned,
  };

  const hasFilter = Boolean(actorId || actionType || documentId || from || to);

  const rows = await queryActionLog(session.viewer, filter);

  const pruneCount = rows.filter((row) => !row.prunedAt && isPrunableActionType(row.actionType)).length;

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

  const columns: StaticTableColumn[] = [
    { key: "occurredAt", header: "발생 시각", priority: "p1" },
    { key: "actor", header: "행위자", priority: "p2" },
    { key: "actorRole", header: "행위자 계급", priority: "p2" },
    { key: "actionType", header: "행동 종류", priority: "p1" },
    { key: "entity", header: "대상", priority: "p2" },
    { key: "document", header: "문서", priority: "p2" },
    { key: "detail", header: "상세", priority: "p2" },
  ];

  // R1 — 서버 페이지는 클라이언트 표에 함수 prop을 넘기지 않는다. 칸은 서버에서 미리 렌더한 노드만 넘긴다.
  const tableRows = rows.map((row) => {
    // 대상은 이름으로 보인다 — entityName은 도메인이 읽기 시점에 푼 값이고,
    // 풀 수 없으면(삭제된 대상·노출표에서 막힌 계급) entityId로 안전하게
    // 내려앉는다. 원시 UUID를 사람에게 그대로 보이지 않는다.
    const entity = row.entity
      ? `${row.entity}${row.entityName ? ` ${row.entityName}` : row.entityId ? ` ${row.entityId}` : ""}`
      : null;
    // 상세 열은 노출표에서 상세 항목이 꺼진 계급에는 값이 비어
    // 있다(project()가 이미 걸렀다 — 필드 부재가 아니라 undefined).
    const detail = row.detail && Object.keys(row.detail).length > 0 ? JSON.stringify(row.detail) : null;
    return {
      key: String(row.seq),
      // §7-3 폰 전략 — P1(발생 시각·행동 종류)만 열로 남고 나머지는 `StaticTable`이 행 아래 접힌 줄 하나로 넣는다.
      cells: [
        <Num key="occurredAt" value={row.occurredAt ? new Date(row.occurredAt).toISOString().slice(0, 19).replace("T", " ") : null} />,
        row.actorName ?? "—",
        row.actorRoleName ?? "—",
        row.actionTypeLabel ?? row.actionType ?? "—",
        entity ?? "—",
        row.documentId ?? "—",
        detail ? <span key="detail" className={styles.detail}>{detail}</span> : "—",
      ],
    };
  });

  return (
    <ListScreen
      title="행동 로그"
      filters={
        <FilterBar
          people={selectablePeople}
          actionTypes={actionTypeOptions}
          defaultValues={filterValues}
          hasFilter={hasFilter}
        />
      }
    >
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
        <StaticTable caption="행동 로그" columns={columns} rows={tableRows} />
      )}
    </ListScreen>
  );
}
