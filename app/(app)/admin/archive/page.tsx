import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listArchive } from "@/domain/archive";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ArchiveTable } from "./archive-table";

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

      {/* rows.length가 0이어도(복원으로 방금 비었어도) 이 컴포넌트 자체는
          항상 마운트한다 — EMPTY/표 갈림과 토스트 수명이 갈리면 안 되는
          이유는 ./archive-table.tsx 머리 주석 참고. */}
      <ArchiveTable
        rows={items.map((item) => ({
          entity: item.entity,
          label: item.label,
          id: item.id,
          name: item.name,
          archivedAtLabel: new Date(item.archivedAt).toISOString().slice(0, 19).replace("T", " "),
          archivedBy: item.archivedBy,
        }))}
      />
    </>
  );
}
