import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listCodeItems } from "@/repositories/code-tables";

// 서버는 활성·미보관 소분류만 받는다 — 같은 조건·정렬로 골라 선택이 결정적이다.
export async function firstSelectableSubcategory() {
  const [first] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!first) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  return first;
}
