import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { kstDateTimeOf } from "@/lib/kst-date";
import { listArchive } from "@/domain/archive";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ArchiveTable } from "./archive-table";

// ADMN-12: 보관함 화면 — 여러 표를 훑는 목록 + 복원. D-18과 같은 결: 캐시
// 없음.
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // 07.2-17(D-F3): 프로젝트 삭제 권리(projects.delete 쓰기)만 있어도 자기 범위 `프로젝트` 행을 보러 들어온다(listArchive가 거른다).
  if (!(await can(session.viewer, "admin.archive", "view")) && !(await can(session.viewer, "projects.delete", "write"))) notFound();

  const items = await listArchive(session.viewer);

  return (
    <ListScreen title="보관함">

      {/* rows.length가 0이어도(복원으로 방금 비었어도) 이 컴포넌트 자체는
          항상 마운트한다 — EMPTY/표 갈림과 토스트 수명이 갈리면 안 되는
          이유는 ./archive-table.tsx 머리 주석 참고. */}
      <ArchiveTable
        rows={items.map((item) => ({
          entity: item.entity,
          label: item.label,
          id: item.id,
          name: item.name,
          archivedAtLabel: kstDateTimeOf(new Date(item.archivedAt)),
          archivedBy: item.archivedBy,
          restorable: item.restorable,
        }))}
      />
    </ListScreen>
  );
}
