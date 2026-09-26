import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { readPermissionGrid, ForbiddenError } from "@/domain/permissions/matrix";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { PermissionGridClient } from "./permission-grid-client";
import { setPermissionCellAction } from "./actions";

// app/(app)/admin/code-tables/page.tsx와 같은 세 게이트 순서(D-36 계약: 화면
// 코드에 계급 이름 분기가 없다). 캐시 없음 — 화면 로드마다 다시 조회한다.
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let errorMessage: string | null = null;
  let rows: { id: string; label: string }[] = [];
  let columns: { id: string; label: string; group?: string }[] = [];
  let values: Record<string, boolean> = {};

  try {
    const grid = await readPermissionGrid(session.viewer);
    rows = grid.roles;
    columns = grid.columns;
    values = grid.values;
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    errorMessage = "권한표 불러오기 실패 · 다시 시도";
  }

  return (
    <>
      <PageHeader title="권한표" subtitle="계급 × 메뉴 × 동작" />
      <PermissionGridClient
        kind="permission"
        caption="계급별 메뉴 접근 권한표"
        rowSelectLabel="계급"
        rows={rows}
        columns={columns}
        values={values}
        errorMessage={errorMessage}
        toggleAction={setPermissionCellAction}
      />
    </>
  );
}
