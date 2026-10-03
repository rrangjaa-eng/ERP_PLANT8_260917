import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluatePrinciples,
  isStrict,
  PRIMARY_BUTTON_SELECTOR,
  PRINCIPLE_SELECTORS,
  type ScreenSnapshot,
} from "../e2e/design-principles";
import { evaluateTypeHierarchy, type TypeSnapshot } from "../e2e/type-hierarchy";

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

describe("isStrict", () => {
  it("값이 없거나 1이면 막는 모드, 0만 경고 모드다", () => {
    expect(isStrict(undefined)).toBe(true);
    expect(isStrict("1")).toBe(true);
    expect(isStrict("0")).toBe(false);
  });
});

describe("수집 선택자(04.6-29 · R11 — 옛 CSS 모듈 대체 삭제)", () => {
  it("1차 버튼 선택자는 data-ui 훅 하나뿐이다", () => {
    expect(PRIMARY_BUTTON_SELECTOR).toBe('[data-ui="primary-button"]');
    expect(PRINCIPLE_SELECTORS.primary).toBe(PRIMARY_BUTTON_SELECTOR);
  });

  it("부제는 새 틀에 없어 선택자 없이 null로 둔다", () => {
    expect(PRINCIPLE_SELECTORS.subtitle).toBeNull();
  });

  it("선택자 상수에 CSS 모듈 클래스 조각(-module__)이 없다", () => {
    expect(JSON.stringify(PRINCIPLE_SELECTORS)).not.toContain("-module__");
    const source = readFileSync(resolve(process.cwd(), "test/e2e/design-principles.ts"), "utf8");
    const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(code).not.toContain("-module__");
    expect(code).not.toContain("LEGACY_");
  });

  it("순수 판정 파일은 Playwright를 import하지 않는다(단위 테스트가 읽는다)", () => {
    const source = readFileSync(resolve(process.cwd(), "test/e2e/design-principles.ts"), "utf8");
    expect(source).not.toContain("@playwright/test");
  });

  it("보임 판정이 [inert] 조상과 dialog:modal 밖 요소를 뺀다", () => {
    const source = readFileSync(resolve(process.cwd(), "test/e2e/design-principles.ts"), "utf8");
    expect(source).toContain('closest("[inert]")');
    expect(source).toContain("dialog:modal");
  });
});

// 글자 위계 판정(04.6-29 · SC 7) — 허용 값은 역할 토큰의 계산 값에서 온다(여기서는 그 값을 직접 넘긴다).
describe("evaluateTypeHierarchy", () => {
  const base: TypeSnapshot = {
    sizes: { title: "22px", subtitle: "18px", body: "14px", aux: "13px", tag: "11px", kpi: "32px" },
    weights: { regular: "400", medium: "600", bold: "700", mark: "800" },
    items: [],
  };
  const item = (over: Partial<TypeSnapshot["items"][number]>): TypeSnapshot["items"][number] => ({
    size: "14px",
    weight: "400",
    where: "p",
    text: "본문",
    inScreenTitle: false,
    ...over,
  });

  it("토큰 값만 쓰면 위반이 없다(제목 크기는 screen-title 안)", () => {
    const snapshot = { ...base, items: [item({}), item({ size: "22px", weight: "700", where: "h1[data-ui=screen-title]", inScreenTitle: true })] };
    expect(evaluateTypeHierarchy(snapshot)).toEqual([]);
  });

  it("토큰 밖 글자 크기를 잡는다", () => {
    expect(evaluateTypeHierarchy({ ...base, items: [item({ size: "17px" })] }).map((v) => v.rule)).toEqual(["글자 크기 토큰 밖"]);
  });

  it("토큰 밖 굵기를 잡는다", () => {
    expect(evaluateTypeHierarchy({ ...base, items: [item({ weight: "500" })] }).map((v) => v.rule)).toEqual(["굵기 토큰 밖"]);
  });

  it("제목 크기가 screen-title 밖에 있으면 잡는다", () => {
    expect(evaluateTypeHierarchy({ ...base, items: [item({ size: "22px", weight: "700" })] }).map((v) => v.rule)).toEqual(["제목 크기는 틀만"]);
  });

  it("외부 수령자 화면은 제목 크기를 틀 밖 h1에 쓸 수 있다", () => {
    const snapshot = { ...base, items: [item({ size: "22px", weight: "700", where: "h1.title" })] };
    expect(evaluateTypeHierarchy(snapshot, { external: true })).toEqual([]);
    expect(evaluateTypeHierarchy(snapshot).map((v) => v.rule)).toEqual(["제목 크기는 틀만"]);
  });

  it("산문 크기는 허용 집합에 넣었을 때만 통과한다(외부 수령자 화면)", () => {
    const withProse = { ...base, sizes: { ...base.sizes, prose: "15px" }, items: [item({ size: "15px" })] };
    expect(evaluateTypeHierarchy(withProse)).toEqual([]);
    expect(evaluateTypeHierarchy({ ...base, items: [item({ size: "15px" })] }).map((v) => v.rule)).toEqual(["글자 크기 토큰 밖"]);
  });
});
