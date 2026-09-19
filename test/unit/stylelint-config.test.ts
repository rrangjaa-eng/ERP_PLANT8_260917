import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config from "../../stylelint.config.mjs";

// D-20 규칙 자체의 단위 테스트 — test/unit/eslint-rules/*.test.ts 전례(규칙에도
// 테스트를 붙인다)를 stylelint의 standalone API로 적용한다.

async function lint(code: string) {
  const { results } = await stylelint.lint({ code, config });
  const [result] = results;
  if (!result) throw new Error("stylelint.lint()가 결과를 반환하지 않았다");
  return result.warnings;
}

describe("stylelint: 색 리터럴 금지", () => {
  it("색 리터럴(#fff)을 쓴 선언은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".x { color: #fff; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("같은 자리에 토큰 참조(var(--bg))를 쓰면 경고가 0개다", async () => {
    const warnings = await lint(".x { color: var(--bg); }");
    expect(warnings).toHaveLength(0);
  });

  it("box-shadow의 inset px 오프셋 + 토큰 색은 경고가 0개다(Pitfall 2)", async () => {
    const warnings = await lint(".x { box-shadow: inset 0 -2px 0 var(--bar-leaf); }");
    expect(warnings).toHaveLength(0);
  });

  it("box-shadow 안에 색 리터럴이 있으면 경고가 1개 이상이다", async () => {
    const warnings = await lint(".x { box-shadow: inset 0 -2px 0 #123456; }");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("stylelint: radius 리터럴 금지", () => {
  it("radius 리터럴 값은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".x { border-radius: 4px; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("radius 0은 경고가 0개다", async () => {
    const warnings = await lint(".x { border-radius: 0; }");
    expect(warnings).toHaveLength(0);
  });

  it("radius 토큰 참조는 경고가 0개다", async () => {
    const warnings = await lint(".x { border-radius: var(--radius); }");
    expect(warnings).toHaveLength(0);
  });
});

describe("stylelint: 서체 리터럴 금지", () => {
  it("서체 리터럴은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".x { font-family: Arial, sans-serif; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("--font-sans 참조는 경고가 0개다", async () => {
    const warnings = await lint(".x { font-family: var(--font-sans); }");
    expect(warnings).toHaveLength(0);
  });
});

describe("stylelint: 간격은 범위 밖이다(D-20 2026-09-19 사용자 비준)", () => {
  it("간격(margin·padding·gap) 리터럴은 경고가 0개다 — 범위 한정이 의도임을 고정한다", async () => {
    const warnings = await lint(
      ".x { margin: 6px; padding: 7px 6px; gap: 9px; row-gap: 2px; column-gap: 3px; }",
    );
    expect(warnings).toHaveLength(0);
  });
});

describe("stylelint: 실물 흰색 리터럴 사례(Pitfall 1)", () => {
  it("실물에서 상시 쓰이는 흰색 리터럴이 걸린다", async () => {
    const warnings = await lint(".mark { color: #fff; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("같은 계산값의 --bg 참조는 통과한다", async () => {
    const warnings = await lint(".mark { color: var(--bg); }");
    expect(warnings).toHaveLength(0);
  });
});

// WR-08: D-20 가드에 뚫린 구멍 — 이름 있는 색, 최신 색 함수, font 축약
describe("stylelint: WR-08 — 이름 있는 색상 리터럴 금지", () => {
  it("named color(white)를 쓴 선언은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".probe { color: white; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("named color(red)를 배경에 쓴 선언은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".probe { background: red; }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("currentColor는 named-color 금지에 걸리지 않는다", async () => {
    const warnings = await lint(".probe { color: currentColor; }");
    expect(warnings).toHaveLength(0);
  });

  it("inherit는 named-color 금지에 걸리지 않는다", async () => {
    const warnings = await lint(".probe { color: inherit; }");
    expect(warnings).toHaveLength(0);
  });
});

describe("stylelint: WR-08 — 최신 색상 함수(oklch 등) 금지", () => {
  it("oklch() 색상 함수는 경고가 1개 이상이다", async () => {
    const warnings = await lint(".probe { color: oklch(50% 0.1 120); }");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("calc()는 색상 함수 금지에 걸리지 않는다(간격 등 다른 용도로 계속 허용)", async () => {
    const warnings = await lint(".probe { margin: calc(1px + 2px); }");
    expect(warnings).toHaveLength(0);
  });
});

describe("stylelint: WR-08 — font 축약 속성 금지", () => {
  it("font 축약(font: 12px Arial)은 경고가 1개 이상이다", async () => {
    const warnings = await lint(".probe { font: 12px Arial; }");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("stylelint: WR-08 — 리뷰가 확인한 전체 프로브 문자열", () => {
  it("리뷰의 프로브 선언 전체가 최소 3개(색·radius·font) 이상 경고를 낸다", async () => {
    const warnings = await lint(
      ".probe{color:white;background:red;border-radius:9px;font:12px Arial}",
    );
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});
