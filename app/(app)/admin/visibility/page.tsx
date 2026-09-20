import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { readVisibilityGrid, ForbiddenError } from "@/domain/permissions/matrix";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { PermissionGridClient } from "../permissions/permission-grid-client";
import { setVisibilityCellAction } from "./actions";

// 권한표 화면(app/(app)/admin/permissions/page.tsx)과 같은 세 게이트 순서 —
// 클라이언트 래퍼도 같은 파일을 재사용한다(같은 배선을 두 번 적지 않는다).
export const dynamic = "force-dynamic";

export default async function VisibilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let errorMessage: string | null = null;
  let rows: { id: string; label: string }[] = [];
  let columns: { id: string; label: string; group?: string }[] = [];
  let values: Record<string, boolean> = {};

  try {
    const grid = await readVisibilityGrid(session.viewer);
    rows = grid.roles;
    columns = grid.columns;
    values = grid.values;
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    errorMessage = "정보 노출표를 불러오지 못했습니다 · 다시 시도";
  }

  return (
    <>
      <PageHeader title="정보 노출표" subtitle="계급 × 정보 항목" />
      <PermissionGridClient
        kind="visibility"
        caption="계급별 정보 노출표"
        rowSelectLabel="계급"
        rows={rows}
        columns={columns}
        values={values}
        errorMessage={errorMessage}
        toggleAction={setVisibilityCellAction}
      />
    </>
  );
}
