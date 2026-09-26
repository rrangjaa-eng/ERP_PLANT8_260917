import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCodeItems } from "@/domain/code-tables";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import {
  CodeItemForm,
  CodeItemLabelInput,
  CodeItemDescriptionInput,
  CodeItemActiveToggle,
  CodeItemDeleteButton,
} from "./code-item-form";
import { EvidenceTypeFields } from "./evidence-type-fields";
import styles from "./code-tables.module.css";

// 03-06: 증빙 종류 코드표(evidence_type)가 두 번째 표로 늘었다 — 표 위
// 전환 링크로 고른다. 기본값은 기존 계약 그대로 project_status다(회귀 없음).
const TABLE_OPTIONS = [
  { key: "project_status", label: "프로젝트 상태" },
  { key: "evidence_type", label: "증빙 종류" },
] as const;
const DEFAULT_TABLE_KEY = "project_status";
const EVIDENCE_TYPE_TABLE_KEY = "evidence_type";

// D-18과 같은 결: 캐시·별도 저장 없음 — 화면 로드마다 목록을 다시 조회한다.
export const dynamic = "force-dynamic";

// 목록 화면의 필터 상태(코드표 선택·숨김 포함 여부)를 유지한 채 등록 폼을
// 열고 닫는 링크를 만든다 — vendors의 ?editId= 토글과 같은 결(§6-1, D-39,
// DECISIONS.md 2026-09-21).
function codeTablesHref(tableKey: string, includeInactive: boolean, opts?: { isNew?: boolean }): string {
  const params = new URLSearchParams({ tableKey });
  if (includeInactive) params.set("includeInactive", "1");
  if (opts?.isNew) params.set("new", "1");
  return `?${params.toString()}#code-item-form`;
}

// app/(app)/admin/system-status/page.tsx의 세 게이트 순서를 그대로 복제하고
// 세 번째 줄만 코드표 메뉴 보기 판정으로 바꾼다(D-36 계약: 화면 코드에 계급
// 이름 분기가 없다 — can()이 유일한 판정 지점). 이 세 줄과 기존 열 구성은
// 표가 늘어도 바꾸지 않는다.
export default async function CodeTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string; tableKey?: string; new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.code-tables", "view"))) notFound();

  const { includeInactive: includeInactiveParam, tableKey: tableKeyParam, new: newParam } = await searchParams;
  const includeInactive = includeInactiveParam === "1";
  const tableKey = TABLE_OPTIONS.some((option) => option.key === tableKeyParam) ? tableKeyParam! : DEFAULT_TABLE_KEY;
  const isEvidenceType = tableKey === EVIDENCE_TYPE_TABLE_KEY;
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는
  // 폼이 없다.
  const showForm = newParam === "1";

  const [items, canWrite, canArchive] = await Promise.all([
    listCodeItems(session.viewer, tableKey, { includeInactive }),
    can(session.viewer, "admin.code-tables", "write"),
    can(session.viewer, "admin.archive", "write"),
  ]);
  const currentLabel = TABLE_OPTIONS.find((option) => option.key === tableKey)?.label ?? tableKey;

  return (
    <>
      <PageHeader title="코드표" subtitle={currentLabel} />

      <nav aria-label="코드표 선택" className={styles.filterRow}>
        {TABLE_OPTIONS.map((option) => (
          <a
            key={option.key}
            href={`?tableKey=${option.key}`}
            className={styles.toggle}
            aria-current={option.key === tableKey ? "page" : undefined}
          >
            {option.label}
          </a>
        ))}
      </nav>

      {/* 쓰기 권한이 없는 계급에는 등록·편집 수단 자체를 렌더하지 않는다 —
          "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md). 거래처·
          법인카드·사람 화면이 이미 하는 것을 이 화면만 빠뜨리고 있었다. */}
      {canWrite && showForm ? (
        <CodeItemForm tableKey={tableKey} cancelHref={codeTablesHref(tableKey, includeInactive)} />
      ) : null}

      <div className={styles.filterRow}>
        <a
          href={`?tableKey=${tableKey}&${includeInactive ? "includeInactive=0" : "includeInactive=1"}`}
          className={styles.toggle}
        >
          {includeInactive ? "숨김 제외" : "숨김 포함"}
        </a>
        {/* §6-1 「새 지출결의」와 같은 자리 — 목록 머리글의 등록 행동. */}
        {canWrite && !showForm && items.length > 0 ? (
          <Link href={codeTablesHref(tableKey, includeInactive, { isNew: true })} className={styles.toggle}>
            코드 추가
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <ListEmpty
          message="등록된 코드가 없습니다"
          action={
            canWrite
              ? { label: "코드 추가", href: codeTablesHref(tableKey, includeInactive, { isNew: true }) }
              : undefined
          }
        />
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">{`코드표 · ${currentLabel}`}</caption>
          <thead>
            <tr>
              <th scope="col">값</th>
              <th scope="col">이름</th>
              <th scope="col">설명</th>
              <th scope="col" className={styles.num}>정렬</th>
              <th scope="col">상태</th>
              {/* 칸을 비우면서 머리글만 남기면 빈 칸이 생긴다 — 법인카드
                  화면과 같은 조건으로 머리글까지 감춘다. */}
              {canWrite || canArchive ? <th scope="col">동작</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>{item.value}</td>
                  {/* MAST-04 「수정」 — 보관된 항목은 도메인이 거부하므로
                      입력칸 대신 글자로 보인다(계급 화면과 같은 결). */}
                  <td>
                    {item.archivedAt || !canWrite ? (
                      item.label
                    ) : (
                      <CodeItemLabelInput id={item.id} label={item.label} />
                    )}
                  </td>
                  {/* 04-10(D-93) — 설명. 보관·쓰기 불가는 이름 칸과 같은
                      결로 글자만(「—」는 값 없음, S14). */}
                  <td>
                    {item.archivedAt || !canWrite ? (
                      (item.description ?? "—")
                    ) : (
                      <CodeItemDescriptionInput id={item.id} label={item.label} description={item.description} />
                    )}
                  </td>
                  <td className={styles.num}>{item.sortOrder}</td>
                  <td>
                    {item.archivedAt ? (
                      <StatusTag kind="muted" variant="text">
                        보관됨
                      </StatusTag>
                    ) : item.active === false ? (
                      <StatusTag kind="muted" variant="text">
                        비활성
                      </StatusTag>
                    ) : "—"}
                  </td>
                  {/* 머리글과 같은 조건이어야 칸이 어긋나지 않는다. */}
                  {canWrite || canArchive ? (
                    <td>
                      {item.archivedAt ? null : (
                        <>
                          {canWrite ? <CodeItemActiveToggle id={item.id} active={item.active} /> : null}
                          {canArchive ? <CodeItemDeleteButton id={item.id} label={item.label} /> : null}
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
                {isEvidenceType && canWrite ? (
                  <tr>
                    <td colSpan={canWrite || canArchive ? 6 : 5}>
                      <EvidenceTypeFields itemId={item.id} initialValue={item.taxRule} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
