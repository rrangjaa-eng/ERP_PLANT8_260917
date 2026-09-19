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
