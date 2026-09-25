import { describe, expect, it } from "vitest";
import {
  QUOTE_LINE_FIELDS,
  QUOTE_LINE_STATUSES,
  lineCellEditability,
  linkedDocumentReason,
  orderChange,
  quoteCellsZero,
  quoteLockReason,
  quoteTableEmptyState,
  structuralEditability,
  tableLockLine,
  visibleHintKeys,
  type QuoteHintKey,
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

describe("structuralEditability — 구조 판정(사용자 D10)", () => {
  const all = { insert: true, archive: true, reorder: true, duplicate: true, newRevision: true };
  const none = { insert: false, archive: false, reorder: false, duplicate: false, newRevision: false };

  it("수주중·진행·미수주 + 쓰기는 전부 참", () => {
    for (const status of ["bidding", "in_progress", "lost"]) {
      expect(structuralEditability({ status, canWrite: true })).toEqual(all);
    }
  });

  it("정산 + 쓰기는 insert만 참", () => {
    expect(structuralEditability({ status: "settling", canWrite: true })).toEqual({ ...none, insert: true });
  });

  it("완료는 전부 거짓", () => {
    expect(structuralEditability({ status: "completed", canWrite: true })).toEqual(none);
  });

  it("쓰기 없음은 전부 거짓", () => {
    for (const status of ["bidding", "in_progress", "lost", "settling"]) {
      expect(structuralEditability({ status, canWrite: false })).toEqual(none);
    }
  });
});

describe("quoteCellsZero — 정산 새 줄의 견적 칸 0(엔지 리뷰 A §2 P1)", () => {
  const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

  it("원화 단가 0 · 수량 없음 → 참", () => {
    expect(quoteCellsZero({ unitPrice: krw(0) })).toBe(true);
  });

  it("원화 단가 0 · 수량 1 → 참", () => {
    expect(quoteCellsZero({ quantity: 1, unitPrice: krw(0) })).toBe(true);
  });

  it("원화 단가 0 · 수량 2 → 거짓", () => {
    expect(quoteCellsZero({ quantity: 2, unitPrice: krw(0) })).toBe(false);
  });

  it("단가 1원 → 거짓", () => {
    expect(quoteCellsZero({ unitPrice: krw(1) })).toBe(false);
  });

  it("USD 단가 0 → 거짓", () => {
    expect(quoteCellsZero({ unitPrice: { currency: "USD", amount: 0, fxRate: 1300 } })).toBe(false);
  });

  it("줄 상태는 없거나 기본값(not_started)일 때만 참 — 취소 → 거짓(검토 S2 · 새 줄 상태 칸 잠김)", () => {
    expect(quoteCellsZero({ unitPrice: krw(0), lineStatus: "not_started" })).toBe(true);
    expect(quoteCellsZero({ unitPrice: krw(0), lineStatus: "cancelled" })).toBe(false);
  });
});

describe("orderChange — 순서 판정(엔지 리뷰 A §2 P2)", () => {
  const none = { archivedIds: [], newIds: [] };

  it("집합이 다르면 mismatch — 빠진 줄 · 모르는 줄 · 보관할 줄이 남음", () => {
    expect(orderChange(["a", "b", "c"], ["a", "b"], none)).toBe("mismatch");
    expect(orderChange(["a", "b"], ["a", "b", "z"], none)).toBe("mismatch");
    expect(orderChange(["a", "b"], ["a", "b"], { archivedIds: ["b"], newIds: [] })).toBe("mismatch");
    expect(orderChange(["a", "b"], ["a", "a", "b"], none)).toBe("mismatch");
  });

  it("기존 줄 상대 순서가 같고 새 줄이 가운데면 insertOnly", () => {
    expect(orderChange(["a", "b", "c"], ["a", "n", "b", "c"], { archivedIds: [], newIds: ["n"] })).toBe("insertOnly");
    expect(orderChange(["a", "b", "c"], ["a", "c"], { archivedIds: ["b"], newIds: [] })).toBe("insertOnly");
  });

  it("기존 줄 상대 순서가 바뀌면 reorder", () => {
    expect(orderChange(["a", "b", "c"], ["b", "a", "c"], none)).toBe("reorder");
    expect(orderChange(["a", "b", "c"], ["c", "n", "a", "b"], { archivedIds: [], newIds: ["n"] })).toBe("reorder");
  });
});

// 04-30(DR-2 · P0 · UI-SPEC rev 5 S4 「표 위 한 줄」) — 표 위 잠김 줄 = 잠긴 셀 이유(quoteLockReason) 한 문자열.
describe("tableLockLine — 표 위 잠김 줄", () => {
  it("정산 + 편집 셀 있음 + 줄 ≥ 1 → 정산 이유(quoteLockReason과 같은 문자열)", () => {
    expect(tableLockLine({ status: "settling", hasEditableCells: true, lineCount: 2 })).toBe("정산 · 실행가와 새 줄만");
    expect(tableLockLine({ status: "settling", hasEditableCells: true, lineCount: 2 })).toBe(quoteLockReason({ status: "settling" }));
  });

  it("완료 + 편집 셀 없음(PM 읽기 표) → null, 완료 + 편집 셀 있음(경영관리 격자) → 완료 이유", () => {
    expect(tableLockLine({ status: "completed", hasEditableCells: false, lineCount: 3 })).toBeNull();
    expect(tableLockLine({ status: "completed", hasEditableCells: true, lineCount: 3 })).toBe("완료 · 견적 줄 잠김");
  });

  it("줄 0개 → null(정산이어도)", () => {
    expect(tableLockLine({ status: "settling", hasEditableCells: true, lineCount: 0 })).toBeNull();
  });

  it("수주중·진행·미수주 → null", () => {
    for (const status of ["bidding", "in_progress", "lost"]) {
      expect(tableLockLine({ status, hasEditableCells: true, lineCount: 2 })).toBeNull();
    }
  });
});

// 04-30(UI-SPEC rev 5 Copywriting `Empty — 견적 줄 표`) — 우선순위 ① 첫 줄 만들기 ③ 기간 바꾸기 ④ 담당 PM ⑤ 완료 사실.
describe("quoteTableEmptyState — 0줄 표의 한 줄", () => {
  const message = "이 프로젝트에 견적 줄이 없습니다";

  it("줄을 추가할 수 있으면(진행·정산의 담당 PM) 「첫 줄 만들기」", () => {
    for (const status of ["in_progress", "settling"]) {
      expect(quoteTableEmptyState({ status, canAddLine: true, periodRights: "pm", pmName: "김담당" })).toEqual({
        message,
        action: { kind: "addLine", label: "첫 줄 만들기" },
      });
    }
  });

  it("줄 추가 가능이 기간 권리보다 우선", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: true, periodRights: "lead", pmName: "김담당" }).action?.kind).toBe("addLine");
  });

  it("진행 + 줄 추가 불가 → 「· 담당 PM {이름}」(버튼 없음)", () => {
    expect(quoteTableEmptyState({ status: "in_progress", canAddLine: false, periodRights: "lead", pmName: "김담당" })).toEqual({
      message: `${message} · 담당 PM 김담당`,
    });
  });

  it("정산 + 줄 추가 불가 + 기간 권리 lead → 「기간 바꾸기」(종료일 칸)", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: false, periodRights: "lead", pmName: "김담당" })).toEqual({
      message,
      action: { kind: "openPeriodEnd", label: "기간 바꾸기" },
    });
  });

  it("정산 + 줄 추가 불가 + 그 밖 → 「· 담당 PM {이름}」", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: false, periodRights: "none", pmName: "김담당" })).toEqual({
      message: `${message} · 담당 PM 김담당`,
    });
  });

  it("완료 → 사실만(버튼·꼬리 없음)", () => {
    expect(quoteTableEmptyState({ status: "completed", canAddLine: false, periodRights: "lead", pmName: "김담당" })).toEqual({ message });
  });
});

// 04-30(C-07 · UI-SPEC rev 5 S4 「힌트 줄」) — 04-28 힌트 항목에서 그 사람에게 없는 구조 동작과 `저장`을 뺀다.
describe("visibleHintKeys — 힌트 줄 거르기", () => {
  const all: QuoteHintKey[] = ["move", "paste", "cancel", "newRow", "moveRow", "duplicateRow", "save"];

  it("정산(새 줄만) → 줄 이동·줄 복제가 빠지고 새 줄은 남는다", () => {
    expect(visibleHintKeys(all, structuralEditability({ status: "settling", canWrite: true }))).toEqual(["move", "paste", "cancel", "newRow"]);
  });

  it("완료(전부 거짓) → 새 줄·줄 이동·줄 복제가 빠진다", () => {
    expect(visibleHintKeys(all, structuralEditability({ status: "completed", canWrite: true }))).toEqual(["move", "paste", "cancel"]);
  });

  it("진행 → 구조 키가 그대로, 어느 경우든 저장은 없다", () => {
    expect(visibleHintKeys(all, structuralEditability({ status: "in_progress", canWrite: true }))).toEqual([
      "move",
      "paste",
      "cancel",
      "newRow",
      "moveRow",
      "duplicateRow",
    ]);
  });
});
