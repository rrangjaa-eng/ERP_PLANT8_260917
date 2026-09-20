import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCodeItems } from "@/domain/code-tables";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { CodeItemForm, CodeItemActiveToggle } from "./code-item-form";
import styles from "./code-tables.module.css";

const TABLE_KEY = "project_status";

// D-18과 같은 결: 캐시·별도 저장 없음 — 화면 로드마다 목록을 다시 조회한다.
export const dynamic = "force-dynamic";

// app/(app)/admin/system-status/page.tsx의 세 게이트 순서를 그대로 복제하고
// 세 번째 줄만 코드표 메뉴 보기 판정으로 바꾼다(D-36 계약: 화면 코드에 계급
// 이름 분기가 없다 — can()이 유일한 판정 지점).
export default async function CodeTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.code-tables", "view"))) notFound();

  const { includeInactive: includeInactiveParam } = await searchParams;
  const includeInactive = includeInactiveParam === "1";

  const items = await listCodeItems(session.viewer, TABLE_KEY, { includeInactive });

  return (
    <>
      <PageHeader title="코드표" subtitle="프로젝트 상태" />

      <CodeItemForm tableKey={TABLE_KEY} />

      <div className={styles.filterRow}>
        <a
          href={includeInactive ? "?includeInactive=0" : "?includeInactive=1"}
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
              <tr key={item.id}>
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
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
