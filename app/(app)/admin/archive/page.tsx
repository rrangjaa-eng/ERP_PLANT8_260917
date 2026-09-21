import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listArchive } from "@/domain/archive";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { RestoreButton } from "./delete-to-archive";
import styles from "./archive.module.css";

// ADMN-12: 보관함 화면 — 여러 표를 훑는 목록 + 복원. D-18과 같은 결: 캐시
// 없음.
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.archive", "view"))) notFound();

  const items = await listArchive(session.viewer);

  return (
    <>
      <PageHeader title="보관함" />

      {items.length === 0 ? (
        // §7-7 EMPTY 예외 — 보관함이 비어 있는 것은 해소할 상태가 아니라
        // 정상이다(§7-12 알림함 EMPTY 예외와 같은 논리, DECISIONS.md
        // 2026-09-20 기록). 다음 한 수를 두지 않는다 — action을 생략한다.
        <ListEmpty message="보관함이 비어 있습니다" />
      ) : (
        <table className={styles.table}>
          <caption className={styles.srOnly}>보관함</caption>
          <thead>
            <tr>
              <th scope="col">종류</th>
              <th scope="col">이름</th>
              <th scope="col">보관 시각</th>
              <th scope="col">보관한 사람</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.entity}:${item.id}`}>
                <td>{item.label}</td>
                <td>{item.name}</td>
                <td className={styles.archivedAt}>
                  {new Date(item.archivedAt).toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td>{item.archivedBy ?? "—"}</td>
                <td>
                  <RestoreButton entity={item.entity} id={item.id} name={item.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
