// 04.6 스킨 A 이관 전: 화면 틀
/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listFieldDefinitionsForAdmin, type FieldDefinitionAdminDto } from "@/domain/custom-fields/admin";
import { nextSortOrder } from "@/domain/custom-fields/targets";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다(pnl 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { FieldDefinitionDeleteButton, FieldDefinitionEditForm, FieldDefinitionForm } from "./field-definition-form";
import styles from "./field-definitions.module.css";

// 04.5-01 인증 가드 · 권한 게이트 · 제목 · `?new=1` 등록 폼, 04.5-08 목록 표(UI-SPEC 화면 1 · E1),
// 04.5-04 보관 포함 필터 · 보관 행 · 행 「삭제」 · EMPTY 둘 · ERROR.
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
      <>
        <PageHeader title="화면 항목" subtitle="거래처" />
        <ListEmpty tone="error" message="화면 항목 불러오기 실패" action={{ label: "다시 시도", href: retryHref }} />
      </>
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

  return (
    <>
      <PageHeader title="화면 항목" subtitle="거래처" />
      {editing ? (
        <FieldDefinitionEditForm
          key={editing.id}
          cancelHref={cancelHref}
          editing={{
            id: editing.id,
            version: editing.version,
            name: editing.label,
            type: editing.type,
            required: editing.required,
            sortOrder: editing.sortOrder,
            options: editing.options,
            archivedOptions: editing.archivedOptions,
          }}
        />
      ) : null}
      {showCreateForm ? (
        <FieldDefinitionForm
          cancelHref={cancelHref}
          defaultSortOrder={nextSortOrder(activeDefs.map((def) => def.sortOrder))}
          canViewVisibility={canViewVisibility}
        />
      ) : null}
      {allDefs.length > 0 ? (
        <div className={styles.filterRow}>
          {/* 3차 토글(왼쪽) — 열린 폼의 쿼리를 지킨다. */}
          <Link
            href={listHref(!includeArchived, openFormQuery)}
            className={`${buttonStyles.btn} ${buttonStyles.tertiary} ${styles.filterToggle}`}
          >
            {includeArchived ? "보관 제외" : "보관 포함"}
          </Link>
          {canWrite && !showForm ? (
            <Link href={listHref(includeArchived, { isNew: true })} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
              화면 항목 추가
            </Link>
          ) : null}
        </div>
      ) : null}
      {allDefs.length === 0 ? (
        // 보관 포함 전체 0건 — 폼이 열려 있거나 쓰기 권한이 없으면 같은 행동을 두 곳에 두지 않고 한 줄만(R8 · D8).
        <ListEmpty
          message="등록된 화면 항목이 없습니다"
          action={canWrite && !showForm ? { label: "화면 항목 추가", href: listHref(false, { isNew: true }) } : undefined}
        />
      ) : defs.length === 0 ? (
        // 기본(보관 제외) 0건인데 보관 건이 있다 — 필터를 지우면(보관 포함) 보인다.
        <ListEmpty
          message="조건에 맞는 건이 없습니다"
          action={{ label: "필터 지우기", href: listHref(true, openFormQuery) }}
        />
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">화면 항목</caption>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col" className={styles.p2}>타입</th>
              <th scope="col" className={styles.p2}>필수</th>
              <th scope="col">정렬</th>
              <th scope="col" className={styles.p2}>선택지</th>
              <th scope="col" className={styles.p2}>상태</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((def) => {
              // §7-3 폰 전략 — P2(타입 · 필수 · 선택지)는 행 아래 접힌 줄 하나로 들어간다.
              const folded = [
                TYPE_LABELS[def.type],
                def.required ? "필수" : null,
                def.type === "select" && def.options.length > 0 ? optionsText(def) : null,
              ].filter((value): value is string => !!value);
              return (
                <Fragment key={def.id}>
                  <tr>
                    <th scope="row">{def.label}</th>
                    <td className={styles.p2}>{TYPE_LABELS[def.type]}</td>
                    <td className={styles.p2}>{def.required ? "필수" : "—"}</td>
                    <td className={styles.number}>{def.sortOrder}</td>
                    <td className={styles.p2}>{optionsText(def)}</td>
                    <td className={styles.p2}>
                      {def.archived ? (
                        <StatusTag kind="muted" variant="text">
                          보관됨
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {def.archived ? (
                        // 보관 행은 동작이 없다(복원은 보관함) — 폰에서는 숨은 상태 열 대신 이 자리에 「보관됨」.
                        <span className={styles.phoneOnly}>
                          <StatusTag kind="muted" variant="text">
                            보관됨
                          </StatusTag>
                        </span>
                      ) : (
                        <span className={styles.rowActions}>
                          {canWrite ? (
                            <Link
                              href={listHref(includeArchived, { editId: def.id })}
                              aria-label={`${def.label} 수정`}
                              className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}
                            >
                              수정
                            </Link>
                          ) : null}
                          {canDelete ? <FieldDefinitionDeleteButton id={def.id} name={def.label} /> : null}
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr className={styles.collapsedRow}>
                    <td colSpan={7} className={styles.collapsedCell}>
                      {folded.join(" · ")}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
