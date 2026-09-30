import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select, type SelectProps } from "../../../ui/select/Select";

// G-04-16(UAT 16) — Select에 오류와 설명 있는 옵션이 함께 오면 오류만 보인다. 04-25-SUMMARY:63의 커밋 안 된 임시 테스트를 커밋되는 테스트로 옮긴다.
// jsdom 없이(environment: "node") renderToStaticMarkup 정적 HTML로 단언한다. 옵션 a가 설명을 싣고, 고른 값이 a다.

const OPTIONS: SelectProps["options"] = [{ value: "a", label: "가", description: "설명 가" }];

function renderSelect(props: Partial<SelectProps> = {}) {
  return renderToStaticMarkup(createElement(Select, { id: "s", options: OPTIONS, ...props } as SelectProps));
}

function expectErrorWins(html: string) {
  expect(html).toContain("필수 항목");
  expect(html).not.toContain("설명 가");
  expect(html).toContain('aria-describedby="s-error"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('id="s-error"');
  expect(html).not.toContain('id="s-hint"');
}

function expectHintShows(html: string) {
  expect(html).toContain("설명 가");
  expect(html).toContain('aria-describedby="s-hint"');
  expect(html).toContain('id="s-hint"');
  expect(html).not.toContain("aria-invalid");
  expect(html).not.toContain("s-error");
}

describe("Select — 오류가 설명 힌트를 이긴다 (G-04-16)", () => {
  it("비제어 + error → 오류 문구만 보이고(설명 없음) aria-describedby가 s-error · aria-invalid가 true다", () => {
    expectErrorWins(renderSelect({ defaultValue: "a", error: "필수 항목" }));
  });

  it("제어 + error → 비제어와 같다", () => {
    expectErrorWins(renderSelect({ value: "a", onChange: () => {}, error: "필수 항목" }));
  });

  it("비제어 · error 없음 → 설명 힌트와 s-hint이고 aria-invalid · s-error가 없다", () => {
    expectHintShows(renderSelect({ defaultValue: "a" }));
  });

  it("제어 · error 없음 → 비제어와 같다", () => {
    expectHintShows(renderSelect({ value: "a", onChange: () => {} }));
  });
});
