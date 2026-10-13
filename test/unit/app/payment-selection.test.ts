import { describe, expect, it } from "vitest";
import {
  applyBatchResult,
  diffCount,
  editReason,
  editTransfer,
  firstOffPageIssue,
  nextSumSeq,
  offPageSnapshotRows,
  otherPageCount,
  readStoredSelection,
  reconcileAcrossPages,
  restoreSelection,
  selectionKey,
  sumKeyOf,
  snapshotCounts,
  sumRequestRows,
  writeStoredSelection,
  type SelectionState,
} from "@/app/(app)/expenses/payment-selection";

// 06-17(UI-SPEC S1 「이체액·차이 사유 편집」 · 「합계 줄」) — 선택 상태 순수 함수. 화면은 금액을 셈하지 않는다(O-18) — 여기 함수는
// 고른 id · 사람이 적은 글자만 다루고, 합 · 차이는 서버 액션 응답이다.

const empty: SelectionState = { selectedIds: [], edits: {} };

describe("편집 자동 선택", () => {
  it("고르지 않은 행 이체액을 고치면 selectable 참일 때만 저절로 골라진다", () => {
    const picked = editTransfer(empty, { id: "a", transfer: "13636700", selectable: true });
    expect(picked.selectedIds).toEqual(["a"]);
    expect(picked.edits.a).toEqual({ transfer: "13636700", reason: "" });

    const blocked = editTransfer(empty, { id: "b", transfer: "100", selectable: false });
    expect(blocked.selectedIds).toEqual([]);
  });

  it("이미 고른 행은 한 번만 남고, 사유 편집은 선택을 바꾸지 않는다", () => {
    const once = editTransfer({ selectedIds: ["a"], edits: {} }, { id: "a", transfer: "5", selectable: true });
    expect(once.selectedIds).toEqual(["a"]);
    const reasoned = editReason(once, { id: "a", reason: "이체 수수료" });
    expect(reasoned.selectedIds).toEqual(["a"]);
    expect(reasoned.edits.a).toEqual({ transfer: "5", reason: "이체 수수료" });
  });
});

describe("합계 번호", () => {
  it("고른 id 집합이나 고른 행 이체액이 바뀔 때만 +1 — 사유 · 고르지 않은 행 편집 · 순서는 번호를 올리지 않는다", () => {
    let sum = nextSumSeq({ seq: 0, key: sumKeyOf(empty) }, sumKeyOf(empty));
    expect(sum.seq).toBe(0);

    let state = editTransfer(empty, { id: "a", transfer: "100", selectable: true });
    sum = nextSumSeq(sum, sumKeyOf(state));
    expect(sum.seq).toBe(1);

    state = editReason(state, { id: "a", reason: "수수료" });
    sum = nextSumSeq(sum, sumKeyOf(state));
    expect(sum.seq).toBe(1);

    state = editTransfer(state, { id: "z", transfer: "7", selectable: false });
    sum = nextSumSeq(sum, sumKeyOf(state));
    expect(sum.seq).toBe(1);

    state = { ...state, selectedIds: [...state.selectedIds, "b"] };
    sum = nextSumSeq(sum, sumKeyOf(state));
    expect(sum.seq).toBe(2);

    sum = nextSumSeq(sum, sumKeyOf({ ...state, selectedIds: ["b", "a"] }));
    expect(sum.seq).toBe(2);

    state = editTransfer(state, { id: "b", transfer: "9", selectable: true });
    sum = nextSumSeq(sum, sumKeyOf(state));
    expect(sum.seq).toBe(3);
  });

  it("합 요청 행 — 고른 행마다 id, 이체액은 고친 칸이 양의 정수일 때만 싣는다(아니면 서버가 지급 총액을 쓴다)", () => {
    const state: SelectionState = {
      selectedIds: ["a", "b", "c"],
      edits: { a: { transfer: "13636700", reason: "" }, b: { transfer: "12.5", reason: "" }, z: { transfer: "1", reason: "" } },
    };
    expect(sumRequestRows(state)).toEqual([{ id: "a", transferKrw: 13_636_700 }, { id: "b" }, { id: "c" }]);
  });
});

describe("처리 결과 적용", () => {
  it("처리된 id는 모든 쪽 선택 · 편집에서 지우고, selectable false로 돌아온 막힌 행은 선택 · 편집을 풀고(H-3), selectable true 막힌 행은 둘 다 남긴다", () => {
    const state: SelectionState = {
      selectedIds: ["done", "gate", "tax", "other"],
      edits: {
        done: { transfer: "1", reason: "" },
        gate: { transfer: "2", reason: "수수료" },
        tax: { transfer: "3", reason: "수수료" },
        untouched: { transfer: "4", reason: "" },
      },
    };
    const next = applyBatchResult(state, {
      processedIds: ["done"],
      blocked: [
        { expenseId: "gate", selectable: false },
        { expenseId: "tax", selectable: true },
      ],
    });
    expect(next.selectedIds).toEqual(["tax", "other"]);
    expect(Object.keys(next.edits).sort()).toEqual(["tax", "untouched"]);
    expect(next.edits.tax).toEqual({ transfer: "3", reason: "수수료" });
  });
});

describe("H-5 개수", () => {
  it("지금 쪽에 없는 고른 id 수 · 서버 차이가 0 아닌 고른 행 수 — 금액이 아니라 개수", () => {
    expect(otherPageCount(["a", "b", "c"], ["a"])).toBe(2);
    expect(otherPageCount(["a"], ["a", "b"])).toBe(0);
    expect(diffCount(["a", "b", "c"], { a: -3_300, b: 0, z: 100 })).toBe(1);
    expect(diffCount(["a"], {})).toBe(0);
  });
});

describe("되살리기 · 다른 쪽 id 유지 · 보관 키 (06-17 Task 3)", () => {
  it("되살리기 — 보관한 선택 · 편집 중 rowStates가 selectable: true인 행 것만 남기고(지금 쪽 밖 id 포함), 없거나 거짓이면 버린다", () => {
    const stored: SelectionState = {
      selectedIds: ["page", "other", "paid", "gone"],
      edits: { page: { transfer: "100", reason: "수수료" }, paid: { transfer: "5", reason: "" }, gone: { transfer: "7", reason: "" } },
    };
    // 서버 rowStates 꼴(id · selectable · version · 지급 총액) 그대로 — 판정은 selectable만 본다.
    const rowStates = [
      { id: "page", selectable: true, version: 2, payableKrw: 110 },
      { id: "other", selectable: true, version: 1, payableKrw: 50 },
      { id: "paid", selectable: false, version: 4, payableKrw: 5 },
    ];
    const restored = restoreSelection(stored, rowStates);
    expect(restored.selectedIds).toEqual(["page", "other"]);
    expect(restored.edits).toEqual({ page: { transfer: "100", reason: "수수료" } });
  });

  it("다른 쪽 id 유지 — 지금 쪽 id는 그 쪽 판정으로, 지금 쪽 밖 id는 서버 rowStates가 거짓일 때만 빠진다(지금 쪽 목록으로 거르지 않는다)", () => {
    const pageRows = [
      { id: "a", selectable: true },
      { id: "b", selectable: false },
    ];
    const offPage = new Map([
      ["x", true],
      ["y", false],
    ]);
    expect(reconcileAcrossPages(["a", "b", "x", "y", "unknown"], pageRows, offPage)).toEqual(["a", "x", "unknown"]);
  });

  it("보관 키 = 보기 + 팀 + 증빙(쪽은 들지 않는다) — 필터를 바꾸면 다른 키라 되살릴 것이 없다", () => {
    const base = selectionKey({ status: "지급 대상" });
    expect(selectionKey({ status: "지급 대상" })).toBe(base);
    expect(selectionKey({ status: "지급 대상", evidence: "payable" })).not.toBe(base);
    expect(selectionKey({ status: "지급 대상", team: "t1" })).not.toBe(base);
  });

  it("보관 — 행 id · 사람이 적은 값 · 쪽만 쓰고 읽으며, 같은 보기의 다른 필터 키는 지운다", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    };
    const key = selectionKey({ status: "지급 대상" });
    const other = selectionKey({ status: "지급 대상", evidence: "payable" });
    writeStoredSelection(storage, other, { selectedIds: ["z"], edits: {} }, 1);
    writeStoredSelection(storage, key, { selectedIds: ["a"], edits: { a: { transfer: "100", reason: "" } } }, 2);
    expect(store.has(other)).toBe(false);
    expect(JSON.parse(store.get(key) ?? "{}")).toEqual({ selectedIds: ["a"], edits: { a: { transfer: "100", reason: "" } }, page: 2 });
    // 쪽이 없는 편집은 보관한 쪽(2)에서 고친 것으로 읽는다(검토 M-1).
    expect(readStoredSelection(storage, key)).toEqual({ selectedIds: ["a"], edits: { a: { transfer: "100", reason: "", page: 2 } }, page: 2 });
    expect(readStoredSelection(storage, other)).toBeNull();
    store.set(key, "{깨짐");
    expect(readStoredSelection(storage, key)).toBeNull();
  });
});

describe("검토 반영 (06-17 독립 검토 · DOM 감사)", () => {
  it("편집한 쪽 기억 — 이체액 · 사유를 고친 쪽 번호가 그 행 편집에 남고, 보관에서 쪽이 없는 옛 편집은 보관한 쪽으로 읽는다", () => {
    const edited = editReason(editTransfer(empty, { id: "a", transfer: "100", selectable: true, page: 2 }), { id: "a", reason: "", page: 2 });
    expect(edited.edits.a).toEqual({ transfer: "100", reason: "", page: 2 });
    const store = new Map<string, string>([["k", JSON.stringify({ selectedIds: ["a", "b"], edits: { a: { transfer: "1", reason: "", page: 3 }, b: { transfer: "2", reason: "" } }, page: 4 })]]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    };
    expect(readStoredSelection(storage, "k")?.edits).toEqual({ a: { transfer: "1", reason: "", page: 3 }, b: { transfer: "2", reason: "", page: 4 } });
  });

  it("M-1 지금 쪽 밖 칸 오류 — 고른 행 중 지금 쪽 밖에서 이체액이 양의 정수가 아니거나 지급 총액과 다른데 사유가 빈 첫 행과 그 쪽(같거나 사유 있으면 없음)", () => {
    const state: SelectionState = {
      selectedIds: ["page", "same", "reasoned", "missing", "bad"],
      edits: {
        page: { transfer: "1", reason: "", page: 1 },
        same: { transfer: "500", reason: "", page: 2 },
        reasoned: { transfer: "400", reason: "수수료", page: 2 },
        missing: { transfer: "300", reason: "  ", page: 3 },
        bad: { transfer: "", reason: "", page: 2 },
      },
    };
    const offPage = new Map([
      ["same", { payableKrw: 500 }],
      ["reasoned", { payableKrw: 500 }],
      ["missing", { payableKrw: 500 }],
      ["bad", { payableKrw: 500 }],
    ]);
    expect(firstOffPageIssue(state, ["page"], offPage)).toEqual({ id: "missing", page: 3 });
    expect(firstOffPageIssue({ ...state, selectedIds: ["bad"] }, ["page"], offPage)).toEqual({ id: "bad", page: 2 });
    expect(firstOffPageIssue({ ...state, selectedIds: ["page", "same", "reasoned"] }, ["page"], offPage)).toBeNull();
    // 지급 총액을 아직 모르는 쪽 밖 행은 차이를 판정하지 않는다(서버가 본다).
    expect(firstOffPageIssue({ ...state, selectedIds: ["missing"] }, [], new Map())).toBeNull();
  });

  it("L-1 쪽 밖 스냅숏 행 — 합 응답이 selectable 참이라 한 지금 쪽 밖 id만, 응답 version · 지급 총액 · 견적 줄 · 선결제로", () => {
    const offPage = new Map([
      ["x", { id: "x", selectable: true, version: 3, payableKrw: 100, quoteLineId: "L1", prepaid: false }],
      ["y", { id: "y", selectable: false, version: 9, payableKrw: 200, quoteLineId: "L2", prepaid: true }],
      ["page", { id: "page", selectable: true, version: 1, payableKrw: 300, quoteLineId: "L3", prepaid: false }],
    ]);
    expect(offPageSnapshotRows(["page", "x", "y", "unknown"], ["page"], offPage)).toEqual([{ id: "x", version: 3, payableKrw: 100, quoteLineId: "L1", prepaid: false }]);
  });

  it("D-2 결과 줄 ① · ② 개수 — 모든 쪽 고른 행의 서로 다른 견적 줄 수 · 선결제 수", () => {
    expect(
      snapshotCounts([
        { quoteLineId: "L1", prepaid: false },
        { quoteLineId: "L2", prepaid: true },
        { quoteLineId: "L1", prepaid: true },
        { quoteLineId: null, prepaid: false },
      ]),
    ).toEqual({ lineCount: 2, prepaidCount: 2 });
  });
});
