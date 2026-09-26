// 04-49(DR-3 · 계약 3) — 저장 중 잠금에서 허용되는 격자 동작 판정. Table·use-grid-keyboard가 같은 함수를 부른다.
export type GridAction =
  | "enterEdit"
  | "typeChar"
  | "paste"
  | "deleteCell"
  | "deleteRow"
  | "newRow"
  | "duplicateRow"
  | "moveRow"
  | "save"
  | "move"
  | "select"
  | "copy";

// 저장 요청 동안에도 되는 동작 — 보기만 한다(값을 바꾸지 않는다).
const ALLOWED_WHILE_SAVING: ReadonlySet<GridAction> = new Set<GridAction>(["move", "select", "copy"]);

export function isGridActionAllowed(action: GridAction, { saveLocked }: { saveLocked: boolean }): boolean {
  return !saveLocked || ALLOWED_WHILE_SAVING.has(action);
}
