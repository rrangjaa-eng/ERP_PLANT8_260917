import { describe, expect, it } from "vitest";
import { isCtrlCombo } from "@/lib/shortcut";

// D-94 · 엔지 리뷰 C §2 P2 — Ctrl 조합 판정 한 함수. 등록 폼(04-08)과 견적 표
// 키보드(04-28)가 같은 함수를 쓴다. 자동 반복·한글 조합 중이면 거짓이고
// metaKey는 읽지 않는다(맥 커맨드 키로는 동작하지 않는다, D-94).

function event(overrides: Partial<Parameters<typeof isCtrlCombo>[0]> = {}) {
  return {
    ctrlKey: true,
    key: "Enter",
    repeat: false,
    isComposing: false,
    ...overrides,
  };
}

describe("isCtrlCombo", () => {
  it("Ctrl+Enter는 참이다", () => {
    expect(isCtrlCombo(event({ ctrlKey: true, key: "Enter" }), "Enter")).toBe(true);
  });

  it("자동 반복(repeat)이면 거짓이다", () => {
    expect(isCtrlCombo(event({ ctrlKey: true, key: "Enter", repeat: true }), "Enter")).toBe(false);
  });

  it("한글 조합 중(isComposing)이면 거짓이다", () => {
    expect(isCtrlCombo(event({ ctrlKey: true, key: "Enter", isComposing: true }), "Enter")).toBe(false);
  });

  it("React 네이티브 이벤트의 nativeEvent.isComposing이 참이면 거짓이다", () => {
    expect(
      isCtrlCombo(
        event({ ctrlKey: true, key: "Enter", nativeEvent: { isComposing: true } }),
        "Enter",
      ),
    ).toBe(false);
  });

  it("Meta+Enter(ctrlKey 없음)는 거짓이다 — metaKey를 읽지 않는다", () => {
    expect(
      isCtrlCombo(event({ ctrlKey: false, key: "Enter", metaKey: true }), "Enter"),
    ).toBe(false);
  });

  it("Ctrl+Shift+S에서 event.key 'S'와 대상 키 's'는 대소문자 무시로 참이다", () => {
    expect(isCtrlCombo(event({ ctrlKey: true, key: "S" }), "s")).toBe(true);
  });

  it("Ctrl 없음이면 거짓이다", () => {
    expect(isCtrlCombo(event({ ctrlKey: false, key: "Enter" }), "Enter")).toBe(false);
  });
});
