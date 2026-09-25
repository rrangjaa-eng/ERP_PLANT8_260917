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
