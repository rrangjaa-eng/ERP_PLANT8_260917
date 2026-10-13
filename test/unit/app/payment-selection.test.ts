import { describe, expect, it } from "vitest";
import { editReason, editTransfer, nextSumSeq, sumKeyOf, sumRequestRows, type SelectionState } from "@/app/(app)/expenses/payment-selection";

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
