// 04-12(D-78 · 사용자 D10·D12 · D-66 · D-47 · UI-SPEC rev 5 S4) — 견적 줄 편집 범위를 한 곳에서 판정한다.
// 순수 함수라 리포지토리·`ui`를 import하지 않는다 — 게이트 규칙(`project.line-edit`)·DTO(`cellEditability`)·
// 화면(04-30)이 같은 함수를 부른다. 입력은 객체 하나라 뒤 플랜(04-13 줄 종류 · 04-14 승인)이 필드를 더해도
// 호출자가 바뀌지 않는다.

// `ui/table/types.ts`의 CellEditability와 같은 모양(A-32 — domain은 ui를 import하지 않는다).
export type QuoteCellEditability = "edit" | "readonly" | "locked";

export const QUOTE_LINE_STATUSES = ["not_started", "cancelled"] as const;
export type QuoteLineStatus = (typeof QUOTE_LINE_STATUSES)[number];

export const QUOTE_LINE_FIELDS = [
  "subcategory",
  "itemName",
  "vendorId",
  "quantity",
  "unitPrice",
  "execution",
  "lineStatus",
  "note",
] as const;
export type QuoteLineField = (typeof QUOTE_LINE_FIELDS)[number];

// 정산의 새 줄은 견적 칸(수량·단가)과 상태가 잠긴다(사용자 D12 — 견적가 0).
export const QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT = ["quantity", "unitPrice", "lineStatus"] as const;

// D-66 — 연결 문서가 있는 줄의 금액 칸은 읽기 전용이다(환율은 단가·실행가 칸에 들어 있다).
const LINKED_READONLY_FIELDS: readonly QuoteLineField[] = ["quantity", "unitPrice", "execution"];

export type LineEditScopeInput = {
  status: string;
  canWrite: boolean;
  hasLinkedDocuments: boolean;
  isNewLine: boolean;
};

function cellLevel(input: LineEditScopeInput, field: QuoteLineField): QuoteCellEditability {
  if (!input.canWrite || input.status === "completed") return "locked";
  if (input.hasLinkedDocuments && LINKED_READONLY_FIELDS.includes(field)) return "readonly";
  if (input.status === "settling") {
    if (input.isNewLine) {
      return (QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT as readonly QuoteLineField[]).includes(field) ? "locked" : "edit";
    }
    return field === "execution" ? "edit" : "locked";
  }
  return "edit";
}

export function lineCellEditability(input: LineEditScopeInput): Record<QuoteLineField, QuoteCellEditability> {
  const cells = {} as Record<QuoteLineField, QuoteCellEditability>;
  for (const field of QUOTE_LINE_FIELDS) cells[field] = cellLevel(input, field);
  return cells;
}

// 사용자 D10 — 줄 구조 변경(새 줄·보관·순서 이동·복제·새 차수). 정산은 새 줄만, 완료·쓰기 없음은 전부 막는다.
// `newRevision`은 새 차수 게이트(04-14)의 입력이다.
export type StructuralEditability = { insert: boolean; archive: boolean; reorder: boolean; duplicate: boolean; newRevision: boolean };

export function structuralEditability(input: { status: string; canWrite: boolean }): StructuralEditability {
  const open = input.canWrite && input.status !== "completed" && input.status !== "settling";
  const insert = input.canWrite && input.status !== "completed";
  return { insert, archive: open, reorder: open, duplicate: open, newRevision: open };
}

// 사용자 D12 · 엔지 리뷰 A §2 P1 — 정산 새 줄의 견적 칸 0: 원화 단가 0 · 수량이 비었거나 1(견적가가 0이 되는 조합).
// 수량 0은 받지 않는다(수량 > 0 검증을 느슨하게 하지 않는다). 상태도 새 줄에서 잠김이라 비었거나 기본값이어야 한다
// (QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT와 같은 칸 — 04-12 검토 S2).
export function quoteCellsZero(input: { quantity?: number; unitPrice: { currency: string; amount: number; fxRate: number }; lineStatus?: string }): boolean {
  return (
    input.unitPrice.currency === "KRW" &&
    input.unitPrice.amount === 0 &&
    (input.quantity === undefined || input.quantity === 1) &&
    (input.lineStatus === undefined || input.lineStatus === "not_started")
  );
}

// 엔지 리뷰 A §2 P2 — `order`(저장 뒤 활성 줄 전체의 표시 순서)가 「현재 활성 줄 − 보관 + 새 줄」과 같은 집합인지,
// 기존 줄의 상대 순서가 바뀌었는지. 새 줄은 어디에 끼어도 `insertOnly`다.
export type OrderChange = "mismatch" | "insertOnly" | "reorder";

export function orderChange(current: readonly string[], order: readonly string[], changes: { archivedIds: readonly string[]; newIds: readonly string[] }): OrderChange {
  const archived = new Set(changes.archivedIds);
  const kept = current.filter((id) => !archived.has(id));
  const expected = new Set([...kept, ...changes.newIds]);
  if (order.length !== expected.size || new Set(order).size !== order.length || order.some((id) => !expected.has(id))) return "mismatch";
  const keptSet = new Set(kept);
  const keptInOrder = order.filter((id) => keptSet.has(id));
  return keptInOrder.every((id, index) => id === kept[index]) ? "insertOnly" : "reorder";
}

// DR-2 — 잠긴 칸의 거부 이유 = 표 위 한 줄. 이 문자열은 이 함수만 만든다(우선순위 완료 > 정산 > 승인 — 승인 문구는 04-14).
export function quoteLockReason(input: { status: string }): string | null {
  if (input.status === "completed") return "완료 · 견적 줄 잠김";
  if (input.status === "settling") return "정산 · 실행가와 새 줄만";
  return null;
}

// UI-SPEC rev 5 `Error — 셀(읽기 전용, D-66)`.
export function linkedDocumentReason(number: string): string {
  return `지출결의 ${number} 연결됨 · 고치려면 새 차수`;
}

// 04-30 RED 스텁 — 시그니처만. 구현은 GREEN 커밋.
export type QuoteHintKey = "move" | "paste" | "cancel" | "newRow" | "moveRow" | "duplicateRow" | "save";

export function tableLockLine(input: { status: string; hasEditableCells: boolean; lineCount: number }): string | null {
  void input;
  return null;
}

export type QuoteTableEmptyState = { message: string; action?: { kind: "addLine" | "openPeriodEnd"; label: string } };

export function quoteTableEmptyState(input: {
  status: string;
  canAddLine: boolean;
  periodRights: "lead" | "pm" | "none";
  pmName: string | null;
}): QuoteTableEmptyState {
  void input;
  return { message: "" };
}

export function visibleHintKeys(allKeys: readonly QuoteHintKey[], structural: StructuralEditability): QuoteHintKey[] {
  void structural;
  return [...allKeys];
}
