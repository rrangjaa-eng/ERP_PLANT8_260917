import { describe, expect, it } from "vitest";
import { conflictFocusTransition } from "@/ui/table/use-grid-keyboard";

// 04-28(DR-25, UI-SPEC rev 5 S4 「(rev 5) interactive — 충돌 셀 키보드」) —
// 충돌 셀 안 포커스 전이 표. 셀에서 Enter → 첫 3차 버튼(「덮어쓰기」),
// ←/→는 두 버튼 사이(끝에서 멈춤), Enter/Space는 그 버튼을 누르고 셀로,
// Esc는 누르지 않고 셀로. 셀에서 그 밖의 키는 격자 기본 처리(null).
describe("conflictFocusTransition — 충돌 셀 키보드(DR-25)", () => {
  it("셀에서 Enter → 첫 버튼(「덮어쓰기」)", () => {
    expect(conflictFocusTransition({ at: "cell" }, "Enter")).toEqual({ at: "action", index: 0 });
  });

  it("첫 버튼에서 ArrowRight → 둘째 버튼(「그 값으로」)", () => {
    expect(conflictFocusTransition({ at: "action", index: 0 }, "ArrowRight")).toEqual({ at: "action", index: 1 });
  });

  it("둘째 버튼에서 ArrowRight → 끝에서 멈춘다", () => {
    expect(conflictFocusTransition({ at: "action", index: 1 }, "ArrowRight")).toEqual({ at: "action", index: 1 });
  });

  it("둘째 버튼에서 ArrowLeft → 첫 버튼", () => {
    expect(conflictFocusTransition({ at: "action", index: 1 }, "ArrowLeft")).toEqual({ at: "action", index: 0 });
  });

  it("첫 버튼에서 ArrowLeft → 처음에서 멈춘다", () => {
    expect(conflictFocusTransition({ at: "action", index: 0 }, "ArrowLeft")).toEqual({ at: "action", index: 0 });
  });

  it.each([0, 1])("버튼 %i에서 Escape → 누르지 않고 셀로", (index) => {
    expect(conflictFocusTransition({ at: "action", index }, "Escape")).toEqual({ at: "cell" });
  });

  it.each([0, 1])("버튼 %i에서 Enter → 그 버튼을 누르고 셀로", (index) => {
    expect(conflictFocusTransition({ at: "action", index }, "Enter")).toEqual({ at: "cell", pressed: index });
  });

  it.each([0, 1])("버튼 %i에서 Space → 그 버튼을 누르고 셀로", (index) => {
    expect(conflictFocusTransition({ at: "action", index }, " ")).toEqual({ at: "cell", pressed: index });
  });

  it("버튼 위 ArrowUp/ArrowDown은 격자 이동을 일으키지 않고 그 버튼에 머문다", () => {
    expect(conflictFocusTransition({ at: "action", index: 1 }, "ArrowUp")).toEqual({ at: "action", index: 1 });
    expect(conflictFocusTransition({ at: "action", index: 0 }, "ArrowDown")).toEqual({ at: "action", index: 0 });
  });

  it("셀에서 ArrowDown → null(격자 기본 처리에 맡긴다)", () => {
    expect(conflictFocusTransition({ at: "cell" }, "ArrowDown")).toBeNull();
  });

  it("버튼에서 Tab → null(격자 규칙대로)", () => {
    expect(conflictFocusTransition({ at: "action", index: 0 }, "Tab")).toBeNull();
  });
});
