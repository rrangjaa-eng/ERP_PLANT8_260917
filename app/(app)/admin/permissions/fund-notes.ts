import { isFundScopedMenu } from "@/domain/permissions/fund-scope";
import type { PermissionGridColumn } from "@/ui/permission-grid/PermissionGrid";

// 07.3-04(D-7318): 열 id `${메뉴 키}::${동작}`의 메뉴 키가 자금 메뉴면 그 열에 본부 조건 표지를 붙인다. 이름은 자금 게이트와 같은
// 출처(readFundDivision)에서 받고, 본부가 없으면(설정 비었거나 잘못됨) 「자금 본부 미지정」이다.
export const FUND_UNSET_NOTE = "자금 본부 미지정";

export function withFundNotes(columns: PermissionGridColumn[], division: { name: string } | null): PermissionGridColumn[] {
  const note = division ? `${division.name}만` : FUND_UNSET_NOTE;
  return columns.map((column) => (isFundScopedMenu(column.id.split("::")[0] ?? "") ? { ...column, groupNote: note } : column));
}
