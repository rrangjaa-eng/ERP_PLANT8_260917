import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { readFundDivision } from "@/domain/permissions/fund-gate";
import { readPermissionGrid, ForbiddenError } from "@/domain/permissions/matrix";
import { FUND_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import buttonStyles from "@/ui/button/Button.module.css";
import { Form } from "@/ui/form/Form";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import type { PermissionGridColumn } from "@/ui/permission-grid/PermissionGrid";
import { PermissionGridClient } from "./permission-grid-client";
import { setPermissionCellAction } from "./actions";
import { withFundNotes } from "./fund-notes";

// app/(app)/admin/code-tables/page.tsx와 같은 세 게이트 순서(D-36 계약: 화면
// 코드에 계급 이름 분기가 없다). 캐시 없음 — 화면 로드마다 다시 조회한다.
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let errorMessage: string | null = null;
  let rows: { id: string; label: string }[] = [];
  let columns: PermissionGridColumn[] = [];
  let values: Record<string, boolean> = {};
  let requires: Record<string, string[]> | undefined;
  let fundUnset = false;
  let canOpenSettings = false;

  try {
    const grid = await readPermissionGrid(session.viewer);
    rows = grid.roles;
    // 07.3-04(D-7318): 자금 키 열의 본부 조건 표지 — 이름은 자금 게이트와 같은 출처(readFundDivision). 설정이 비면 「자금 본부 미지정」.
    const [division, settingsViewable] = await Promise.all([readFundDivision(session.viewer), can(session.viewer, "admin.settings", "view")]);
    columns = withFundNotes(grid.columns, division);
    fundUnset = division === null;
    canOpenSettings = settingsViewable;
    values = grid.values;
    requires = grid.requires;
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    errorMessage = "권한표 불러오기 실패 · 다시 시도";
  }

  return (
    <ListScreen
      title="권한표"
      summaryPlain
      summary={
        fundUnset && !errorMessage ? (
          <Form.Hint>
            자금 기능 본부 미지정
            {canOpenSettings ? (
              <>
                {" · "}
                <Link
                  href={`/admin/settings?group=${encodeURIComponent(FUND_DIVISION_ORG_UNIT.namespace)}#setting-${FUND_DIVISION_ORG_UNIT.key}`}
                  className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}
                >
                  설정
                </Link>
              </>
            ) : null}
          </Form.Hint>
        ) : undefined
      }
    >
      <PermissionGridClient
        kind="permission"
        caption="계급별 메뉴 접근 권한표"
        rowSelectLabel="계급"
        itemHeaderLabel="메뉴"
        rows={rows}
        columns={columns}
        values={values}
        errorMessage={errorMessage}
        toggleAction={setPermissionCellAction}
        requires={requires}
      />
    </ListScreen>
  );
}
