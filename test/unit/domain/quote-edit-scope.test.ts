import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { ProjectLineEditCtx } from "@/domain/rules/register";
import {
  QUOTE_LINE_FIELDS,
  QUOTE_LINE_KINDS,
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

// 04-13(D-83 · D-48 · 사용자 D10·D12) — 줄 종류 × 조정 권한 결정표. 조정 줄은 상태를 보지 않고 조정 권한으로만,
// 견적 외 비용은 견적 줄의 상태 규칙을 따르되 수량·단가가 늘 잠김(견적가 0).
describe("줄 종류 축 결정표(04-13)", () => {
  it("조정 줄 + 조정 권한 + 완료: 항목·거래처·실행가·비고 edit, 소분류·수량·단가·상태 locked", () => {
    const cells = lineCellEditability({ ...base, status: "completed", lineKind: "adjustment", canAdjust: true });
    expect(fieldsAt(cells, "edit")).toEqual(["execution", "itemName", "note", "vendorId"]);
    expect(fieldsAt(cells, "locked")).toEqual(["lineStatus", "quantity", "subcategory", "unitPrice"]);
  });

  it("조정 줄 + 조정 권한 없음(담당 PM): 어느 상태든 전부 locked", () => {
    for (const status of ["bidding", "in_progress", "settling", "completed", "lost"]) {
      const cells = lineCellEditability({ ...base, status, lineKind: "adjustment", canAdjust: false });
      expect(fieldsAt(cells, "locked")).toHaveLength(QUOTE_LINE_FIELDS.length);
    }
  });

  it("조정 줄 구조: 조정 권한 + 정산·완료 → 추가·삭제 가능, 이동·복제 불가 / 권한 없음 → 전부 불가", () => {
    for (const status of ["settling", "completed"]) {
      expect(structuralEditability({ status, canWrite: false, lineKind: "adjustment", canAdjust: true })).toMatchObject({
        insert: true,
        archive: true,
        reorder: false,
        duplicate: false,
      });
    }
    expect(structuralEditability({ status: "in_progress", canWrite: true, lineKind: "adjustment", canAdjust: false })).toMatchObject({
      insert: false,
      archive: false,
      reorder: false,
    });
  });

  it("견적 외 비용 + 진행: 추가 가능, 수량·단가 locked, 나머지 edit", () => {
    expect(structuralEditability({ status: "in_progress", canWrite: true, lineKind: "out_of_quote" }).insert).toBe(true);
    for (const isNewLine of [false, true]) {
      const cells = lineCellEditability({ ...base, status: "in_progress", isNewLine, lineKind: "out_of_quote" });
      expect(fieldsAt(cells, "locked")).toEqual(["quantity", "unitPrice"]);
    }
  });

  it("견적 외 비용 + 정산: 추가 가능 · 실행가 edit · 수량·단가 locked · 삭제·이동 불가(D10·D12)", () => {
    expect(structuralEditability({ status: "settling", canWrite: true, lineKind: "out_of_quote" })).toMatchObject({
      insert: true,
      archive: false,
      reorder: false,
    });
    const existing = lineCellEditability({ ...base, status: "settling", lineKind: "out_of_quote" });
    expect(fieldsAt(existing, "edit")).toEqual(["execution"]);
    const inserted = lineCellEditability({ ...base, status: "settling", isNewLine: true, lineKind: "out_of_quote" });
    expect(inserted.execution).toBe("edit");
    expect(inserted.quantity).toBe("locked");
    expect(inserted.unitPrice).toBe("locked");
  });

  it("견적 외 비용 + 완료: 셀·구조 전부 잠김", () => {
    const cells = lineCellEditability({ ...base, status: "completed", lineKind: "out_of_quote" });
    expect(fieldsAt(cells, "locked")).toHaveLength(QUOTE_LINE_FIELDS.length);
    expect(Object.values(structuralEditability({ status: "completed", canWrite: true, lineKind: "out_of_quote" })).some(Boolean)).toBe(false);
  });

  it("QUOTE_LINE_KINDS는 견적 줄 · 견적 외 비용 · 조정 세 값", () => {
    expect(QUOTE_LINE_KINDS).toEqual(["quote", "out_of_quote", "adjustment"]);
  });
});

describe("project.line-edit 게이트 — 조정 줄(04-13 · D-83)", () => {
  const adjustmentInsert = (status: string, actorCanAdjust: boolean) =>
    gate({}, "project.line-edit", {
      status,
      lineKind: "adjustment",
      actorCanWrite: true,
      actorCanAdjust,
      hasLinkedDocuments: false,
      change: { kind: "insert", quoteCellsZero: true },
    } satisfies ProjectLineEditCtx);

  it("조정 줄 insert + 조정 권한 없음 → 「조정 줄 · 경영관리만」", async () => {
    await expect(adjustmentInsert("in_progress", false)).resolves.toEqual({ allowed: false, reason: "조정 줄 · 경영관리만" });
  });

  it("조정 줄 insert + 조정 권한 + 완료 → 통과(상태를 보지 않는다)", async () => {
    await expect(adjustmentInsert("completed", true)).resolves.toEqual({ allowed: true });
  });
});

// 04-23(D-83 · UI-SPEC rev 5 Copywriting `Empty — 견적 줄 표` · P0) — 표 위 한 줄 · EMPTY · 힌트 줄의 조정 권한 축.
describe("조정 권한 축 — 표 위 한 줄 · EMPTY · 힌트 줄(04-23)", () => {
  const message = "이 프로젝트에 견적 줄이 없습니다";
  const adjustAction = { message, action: { kind: "addAdjustment", label: "조정 줄 추가" } };

  it("완료 + 조정 권한자(조정 행이 편집 셀인 격자) → `완료 · 견적 줄 잠김`, 편집 셀 0인 PM의 읽기 표 → 줄 없음", () => {
    expect(tableLockLine({ status: "completed", hasEditableCells: true, lineCount: 3 })).toBe("완료 · 견적 줄 잠김");
    expect(tableLockLine({ status: "completed", hasEditableCells: false, lineCount: 3 })).toBeNull();
  });

  it("완료 + 조정 권한 → 「조정 줄 추가」", () => {
    expect(quoteTableEmptyState({ status: "completed", canAddLine: false, canAdjust: true, periodRights: "none", pmName: "김담당" })).toEqual(adjustAction);
  });

  it("진행 + 줄 추가 권한 + 조정 권한 → 「첫 줄 만들기」(①이 이긴다)", () => {
    expect(quoteTableEmptyState({ status: "in_progress", canAddLine: true, canAdjust: true, periodRights: "pm", pmName: "김담당" }).action?.kind).toBe("addLine");
  });

  it("정산 + 줄 추가 권한(사용자 D10) + 조정 권한 → 「첫 줄 만들기」(①)", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: true, canAdjust: true, periodRights: "pm", pmName: "김담당" }).action?.kind).toBe("addLine");
  });

  it("정산 + 조정 권한만(쓰기 없음 · 기간 권리 없음) → 「조정 줄 추가」", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: false, canAdjust: true, periodRights: "none", pmName: "김담당" })).toEqual(adjustAction);
  });

  it("조정 권한이 기간 바꾸기(③)보다 앞선다 — 정산 팀장이 조정 권한도 가지면 「조정 줄 추가」", () => {
    expect(quoteTableEmptyState({ status: "settling", canAddLine: false, canAdjust: true, periodRights: "lead", pmName: "김담당" })).toEqual(adjustAction);
  });

  it("조정 권한이 없으면 04-30 규칙 그대로(완료는 사실만)", () => {
    expect(quoteTableEmptyState({ status: "completed", canAddLine: false, canAdjust: false, periodRights: "none", pmName: "김담당" })).toEqual({ message });
  });

  it("조정 권한만 있는 사람의 힌트 줄에 새 줄·줄 이동·줄 복제가 없다(조정 줄은 버튼으로만 추가 · 이동·복제 불가)", () => {
    const all: QuoteHintKey[] = ["move", "paste", "cancel", "newRow", "moveRow", "duplicateRow", "save"];
    expect(visibleHintKeys(all, structuralEditability({ status: "in_progress", canWrite: false }))).toEqual(["move", "paste", "cancel"]);
    expect(structuralEditability({ status: "in_progress", canWrite: false, lineKind: "adjustment", canAdjust: true })).toEqual({
      insert: true,
      archive: true,
      reorder: false,
      duplicate: false,
      newRevision: false,
    });
  });
});
