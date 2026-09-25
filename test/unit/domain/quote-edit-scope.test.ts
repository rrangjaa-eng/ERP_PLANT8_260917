import { describe, expect, it } from "vitest";
import {
  QUOTE_LINE_FIELDS,
  QUOTE_LINE_STATUSES,
  lineCellEditability,
  linkedDocumentReason,
  quoteLockReason,
} from "@/domain/quotes/edit-scope";

// 04-12(D-78 · 사용자 D10·D12 · UI-SPEC rev 5 S4) — 셀 단계 결정표. 게이트 규칙과 DTO가 같은 함수를 부른다.
const base = { canWrite: true, hasLinkedDocuments: false, isNewLine: false };

function fieldsAt(cells: Record<string, string>, level: string): string[] {
  return Object.entries(cells)
    .filter(([, value]) => value === level)
    .map(([field]) => field)
    .sort();
}

describe("lineCellEditability — 셀 단계 결정표", () => {
  it("정산 · 기존 줄: 실행가만 edit, 나머지 일곱 칸 locked", () => {
    const cells = lineCellEditability({ ...base, status: "settling" });
    expect(fieldsAt(cells, "edit")).toEqual(["execution"]);
    expect(fieldsAt(cells, "locked")).toHaveLength(7);
  });

  it("정산 · 새 줄: 소분류·항목·거래처·비고·실행가 edit, 수량·단가·상태 locked(D10·D12)", () => {
    const cells = lineCellEditability({ ...base, status: "settling", isNewLine: true });
    expect(fieldsAt(cells, "edit")).toEqual(["execution", "itemName", "note", "subcategory", "vendorId"]);
    expect(fieldsAt(cells, "locked")).toEqual(["lineStatus", "quantity", "unitPrice"]);
  });

  it("완료는 기존 줄·새 줄 모두 전부 locked", () => {
    for (const isNewLine of [false, true]) {
      const cells = lineCellEditability({ ...base, status: "completed", isNewLine });
      expect(fieldsAt(cells, "locked")).toHaveLength(QUOTE_LINE_FIELDS.length);
    }
  });

  it("수주중·진행·미수주는 기존 줄·새 줄 모두 전부 edit(D-45)", () => {
    for (const status of ["bidding", "in_progress", "lost"]) {
      for (const isNewLine of [false, true]) {
        const cells = lineCellEditability({ ...base, status, isNewLine });
        expect(fieldsAt(cells, "edit")).toHaveLength(QUOTE_LINE_FIELDS.length);
      }
    }
  });

  it("진행 + 연결 문서: 수량·단가·실행가 readonly, 항목·비고 edit(D-66)", () => {
    const cells = lineCellEditability({ ...base, status: "in_progress", hasLinkedDocuments: true });
    expect(fieldsAt(cells, "readonly")).toEqual(["execution", "quantity", "unitPrice"]);
    expect(cells.itemName).toBe("edit");
    expect(cells.note).toBe("edit");
  });

  it("정산 + 연결 문서: 실행가도 readonly", () => {
    const cells = lineCellEditability({ ...base, status: "settling", hasLinkedDocuments: true });
    expect(cells.execution).toBe("readonly");
    expect(fieldsAt(cells, "edit")).toEqual([]);
  });

  it("쓰기 권한이 없으면 전부 locked", () => {
    const cells = lineCellEditability({ ...base, status: "in_progress", canWrite: false });
    expect(fieldsAt(cells, "locked")).toHaveLength(QUOTE_LINE_FIELDS.length);
  });
});

describe("잠김 이유 한 문자열(DR-2)", () => {
  it("quoteLockReason: 정산·완료만 문구, 나머지는 null", () => {
    expect(quoteLockReason({ status: "settling" })).toBe("정산 · 실행가와 새 줄만");
    expect(quoteLockReason({ status: "completed" })).toBe("완료 · 견적 줄 잠김");
    for (const status of ["bidding", "in_progress", "lost"]) {
      expect(quoteLockReason({ status })).toBeNull();
    }
  });

  it("linkedDocumentReason: 지출결의 번호를 싣는다(D-66)", () => {
    expect(linkedDocumentReason("26001-0004")).toBe("지출결의 26001-0004 연결됨 · 고치려면 새 차수");
  });
});

describe("줄 상태 상수(엔지 리뷰 A P3)", () => {
  it("QUOTE_LINE_STATUSES는 미착수·취소 두 값", () => {
    expect([...QUOTE_LINE_STATUSES]).toEqual(["not_started", "cancelled"]);
  });
});
