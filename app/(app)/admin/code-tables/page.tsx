import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCodeItems } from "@/domain/code-tables";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { CodeItemForm, CodeItemActiveToggle } from "./code-item-form";
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

// app/(app)/admin/system-status/page.tsx의 세 게이트 순서를 그대로 복제하고
// 세 번째 줄만 코드표 메뉴 보기 판정으로 바꾼다(D-36 계약: 화면 코드에 계급
// 이름 분기가 없다 — can()이 유일한 판정 지점). 이 세 줄과 기존 열 구성은
// 표가 늘어도 바꾸지 않는다.
export default async function CodeTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string; tableKey?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.code-tables", "view"))) notFound();

  const { includeInactive: includeInactiveParam, tableKey: tableKeyParam } = await searchParams;
  const includeInactive = includeInactiveParam === "1";
  const tableKey = TABLE_OPTIONS.some((option) => option.key === tableKeyParam) ? tableKeyParam! : DEFAULT_TABLE_KEY;
  const isEvidenceType = tableKey === EVIDENCE_TYPE_TABLE_KEY;

  const items = await listCodeItems(session.viewer, tableKey, { includeInactive });
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

      <CodeItemForm tableKey={tableKey} />

      <div className={styles.filterRow}>
        <a
          href={`?tableKey=${tableKey}&${includeInactive ? "includeInactive=0" : "includeInactive=1"}`}
          className={styles.toggle}
        >
          {includeInactive ? "숨김 제외" : "숨김 포함"}
        </a>
      </div>

      {items.length === 0 ? (
        <ListEmpty message="등록된 코드가 없습니다" action={{ label: "코드 추가", href: "#code-item-form" }} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>값</th>
              <th>이름</th>
              <th>정렬</th>
              <th>상태</th>
              <th>동작</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>{item.value}</td>
                  <td>{item.label}</td>
                  <td>{item.sortOrder}</td>
                  <td>
                    {item.active === false ? (
                      <StatusTag kind="muted" variant="text">
                        비활성
                      </StatusTag>
                    ) : null}
                  </td>
                  <td>
                    <CodeItemActiveToggle id={item.id} active={item.active} />
                  </td>
                </tr>
                {isEvidenceType ? (
                  <tr>
                    <td colSpan={5}>
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
