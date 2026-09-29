import { describe, expect, it } from "vitest";
import { evaluatePrinciples, type ScreenSnapshot } from "../e2e/design-principles";

// 화면 사용성 원칙(.claude/rules/frontend.md)의 잴 수 있는 부분 — 판정 로직만. 값은 E2E가 실제 화면에서 잰다.
const clean: ScreenSnapshot = {
  primaryButtons: 1,
  background: [243, 245, 244],
  subtitle: null,
  prose: [],
  rowActionStyles: [],
};

describe("evaluatePrinciples", () => {
  it("원칙을 지킨 화면은 경고가 없다", () => {
    expect(evaluatePrinciples(clean)).toEqual([]);
  });

  it("주 버튼이 둘 이상이면 경고한다", () => {
    expect(evaluatePrinciples({ ...clean, primaryButtons: 2 }).map((w) => w.rule)).toEqual(["주 버튼 하나"]);
  });

  it("바탕이 웜톤이면 경고한다(빨강이 파랑보다 뚜렷이 높음)", () => {
    expect(evaluatePrinciples({ ...clean, background: [245, 244, 240] }).map((w) => w.rule)).toEqual(["웜톤 바탕 금지"]);
    expect(evaluatePrinciples({ ...clean, background: [255, 255, 255] })).toEqual([]);
  });

  it("설명형 부제(숫자 없이 8자 이상)는 경고하고 번호가 든 식별 부제는 둔다", () => {
    expect(evaluatePrinciples({ ...clean, subtitle: "진행 중인 프로젝트 원장" }).map((w) => w.rule)).toEqual(["안내 문구 최소"]);
    expect(evaluatePrinciples({ ...clean, subtitle: "26001 · 상세 견적 1차" })).toEqual([]);
  });

  it("긴 설명 문단(40자 이상)은 경고한다", () => {
    const long = "이 화면에서는 프로젝트를 등록하고 견적 줄을 입력한 뒤 저장 버튼을 눌러 주세요.";
    expect(evaluatePrinciples({ ...clean, prose: [long] }).map((w) => w.rule)).toEqual(["안내 문구 최소"]);
  });

  it("띄어쓰기가 거의 없는 긴 값(이메일·코드)은 설명문이 아니다", () => {
    expect(evaluatePrinciples({ ...clean, prose: ["e2e-26089ba3-d591-4cf2-b5b0-62a1f0c3@example.test"] })).toEqual([]);
  });

  it("한 행의 행동들이 서로 다른 모양이면 경고한다", () => {
    const row = ["13px|underline", "14px|none", "14px|none"];
    expect(evaluatePrinciples({ ...clean, rowActionStyles: [row] }).map((w) => w.rule)).toEqual(["같은 행동은 같은 모양"]);
    expect(evaluatePrinciples({ ...clean, rowActionStyles: [["14px|none", "14px|none"]] })).toEqual([]);
  });
});
