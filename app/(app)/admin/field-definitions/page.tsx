import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listFieldDefinitionsForAdmin, type FieldDefinitionAdminDto } from "@/domain/custom-fields/admin";
import { nextSortOrder } from "@/domain/custom-fields/targets";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Num } from "@/ui/num/Num";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { FieldDefinitionDeleteButton, FieldDefinitionForm } from "./field-definition-form";
import styles from "./field-definitions.module.css";

// 04.5-01 인증 가드 · 권한 게이트 · 제목 · `?new=1` 등록 폼, 04.5-08 목록 표(UI-SPEC 화면 1 · E1),
// 04.5-04 보관 포함 필터 · 보관 행 · 행 「삭제」 · EMPTY 둘 · ERROR. 04.6-23: 틀은 `ListScreen` + 옆 패널(`SidePanel` — `?new=1` · `?editId=`),
// 표는 읽기 전용 `StaticTable`, 행 행동은 `RowActions`. 문구 · 권한 · 이름 예약은 04.5 그대로.
export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/field-definitions";

// 목록 링크 — 보관 포함 필터와 열린 폼의 쿼리를 함께 지킨다(vendors의 vendorsHref와 같은 결).
function listHref(includeArchived: boolean, opts?: { isNew?: boolean; editId?: string }): string {
  const params = new URLSearchParams();
  if (includeArchived) params.set("includeArchived", "1");
  if (opts?.isNew) params.set("new", "1");
  if (opts?.editId) params.set("editId", opts.editId);
  const query = params.toString();
  return query ? `${LIST_HREF}?${query}` : LIST_HREF;
}

const TYPE_LABELS: Record<FieldDefinitionAdminDto["type"], string> = {
  text: "텍스트",
  number: "숫자",
  date: "날짜",
  select: "선택",
};

// 선택지 열: 타입이 선택일 때만 활성 선택지의 콤마 목록, 그 외 「—」.
function optionsText(def: FieldDefinitionAdminDto): string {
  return def.type === "select" && def.options.length > 0 ? def.options.join(", ") : "—";
}

export default async function FieldDefinitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; editId?: string; includeArchived?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.field-definitions", "view"))) notFound();

  const { new: newParam, editId, includeArchived: includeArchivedParam } = await searchParams;
  const includeArchived = includeArchivedParam === "1";
  const [canWrite, canArchiveWrite, canViewVisibility] = await Promise.all([
    can(session.viewer, "admin.field-definitions", "write"),
    can(session.viewer, "admin.archive", "write"),
    can(session.viewer, "admin.visibility", "view"),
  ]);
  // 행 「삭제」(= 보관)는 보관함 쓰기와 칸 관리 쓰기가 둘 다 있을 때만 — 서버도 같은 둘을 본다(UI-SPEC O21).
  const canDelete = canWrite && canArchiveWrite;

  // 목록을 불러오지 못하면 표 자리에 오류 한 줄 + 같은 주소로 다시 시도(§7-7 ERROR).
  let allDefs: FieldDefinitionAdminDto[];
  try {
    allDefs = await listFieldDefinitionsForAdmin(session.viewer);
  } catch {
    const retryHref = listHref(includeArchived, { isNew: newParam === "1", editId });
    return (
      <ListScreen title="화면 항목">
        <ListEmpty tone="error" message="화면 항목 불러오기 실패" action={{ label: "다시 시도", href: retryHref }} />
      </ListScreen>
    );
  }
  // 정렬은 listFieldDefinitions 순서(정렬 순서, 내부 키) 그대로다. 기본은 보관 제외, `?includeArchived=1`이면 보관 포함.
  const activeDefs = allDefs.filter((def) => !def.archived);
  const defs = includeArchived ? allDefs : activeDefs;
  // 수정 폼은 편집 가능한 칸(대상 상수 안 · 보관 안 됨)을 가리키는 editId일 때만 연다 — 보관된 칸 · 없는 id · 대상 밖
  // 정의는 폼 없이 목록만 보인다(vendors와 같은 조건). 쓰기 권한이 없으면 `?editId=` · `?new=1`로 직접 와도 폼이 없다.
  const editing = canWrite && editId ? (activeDefs.find((def) => def.id === editId) ?? null) : null;
  const showCreateForm = canWrite && editing === null && newParam === "1";
  const showForm = editing !== null || showCreateForm;
  const cancelHref = listHref(includeArchived);
  const openFormQuery = { isNew: showCreateForm, editId: editing?.id };

  // DR5 A — 보관 포함 전체가 0건이면 머리 1차를 그리지 않고 빈 화면의 「화면 항목 추가」 하나가 등록을 맡는다(쓰기 권한 없으면 둘 다 없다).
  const addHref = listHref(false, { isNew: true });
  const primaryAction = canWrite && allDefs.length > 0 ? { label: "화면 항목 추가", href: listHref(includeArchived, { isNew: true }) } : undefined;

  return (
    <ListScreen
      title="화면 항목"
      primaryAction={primaryAction}
      filters={
        allDefs.length > 0 ? (
          // 3차 토글 — 열린 폼의 쿼리를 지킨다.
          <Link href={listHref(!includeArchived, openFormQuery)} scroll={false} className={styles.toggle}>
            {includeArchived ? "보관 제외" : "보관 포함"}
          </Link>
        ) : undefined
      }
      empty={
        allDefs.length === 0 ? (
          <ListEmpty
            message="등록된 화면 항목이 없습니다"
            action={canWrite ? { label: "화면 항목 추가", href: addHref } : undefined}
          />
        ) : undefined
      }
      panel={
        // 수정은 편집 가능한 칸을, 등록은 쓰기 권한이 있을 때만 — 권한 없는 계급에는 `?new=1` · `?editId=`로 와도 패널이 없다.
        showForm ? (
          <SidePanel key={editing?.id ?? "new"} title={editing ? "화면 항목 수정" : "화면 항목 추가"} closeHref={cancelHref}>
            <FieldDefinitionForm
              key={editing ? `${editing.id}:${editing.version}` : "new"}
              cancelHref={cancelHref}
              editing={
                editing
                  ? {
                      id: editing.id,
                      version: editing.version,
                      name: editing.label,
                      type: editing.type,
                      required: editing.required,
                      sortOrder: editing.sortOrder,
                      options: editing.options,
                      archivedOptions: editing.archivedOptions,
                    }
                  : null
              }
              defaultSortOrder={nextSortOrder(activeDefs.map((def) => def.sortOrder))}
              canViewVisibility={canViewVisibility}
            />
          </SidePanel>
        ) : null
      }
    >
      {defs.length === 0 ? (
        // 기본(보관 제외) 0건인데 보관 건이 있다 — 필터를 지우면(보관 포함) 보인다.
        <ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: listHref(true, openFormQuery) }} />
      ) : (
        <StaticTable
          caption="화면 항목"
          columns={[
            { key: "name", header: "이름", priority: "p1", rowHeader: true },
            { key: "type", header: "타입", priority: "p2" },
            { key: "required", header: "필수", priority: "p2" },
            { key: "sortOrder", header: "정렬", priority: "p1", align: "right" },
            { key: "options", header: "선택지", priority: "p2" },
            { key: "status", header: "상태", priority: "p2" },
            { key: "actions", header: "동작", priority: "p1" },
          ]}
          rows={defs.map((def) => ({
            key: def.id,
            headerId: `fd-row-${def.id}`,
            cells: [
              def.label,
              TYPE_LABELS[def.type],
              def.required ? "필수" : "—",
              <Num key="sortOrder" value={def.sortOrder} unit="count" />,
              optionsText(def),
              def.archived ? <StatusTag key="status" status="보관됨" variant="text" /> : "—",
              // 보관 행은 동작이 없다(복원은 보관함) — 폰에서는 접힌 줄의 상태 값이 「보관됨」을 보인다.
              def.archived ? null : (
                <RowActions key="actions">
                  {canWrite ? (
                    <RowAction href={listHref(includeArchived, { editId: def.id })}>
                      <span className="sr-only">{def.label} </span>수정
                    </RowAction>
                  ) : null}
                  {canDelete ? <FieldDefinitionDeleteButton id={def.id} name={def.label} /> : null}
                </RowActions>
              ),
            ],
          }))}
        />
      )}
    </ListScreen>
  );
}
