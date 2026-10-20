import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select, type SelectProps } from "../../../ui/select/Select";

// 06.1-05 디자인 검토 F7(사용자 결정 2026-10-17 「이 칸만 끄기」) — 첫 `<option value="">—</option>`를 끄는 선택 prop.
// 주지 않으면 지금 마크업 그대로다(다른 호출부는 빈 옵션에 기댄다). renderToStaticMarkup 정적 HTML로 단언한다(select-groups 꼴).

const OPTIONS: SelectProps["options"] = [
  { value: "team:a", label: "기획1팀 공개" },
  { value: "private", label: "미공개" },
];

function renderSelect(props: Partial<SelectProps> = {}) {
  return renderToStaticMarkup(createElement(Select, { id: "s", options: OPTIONS, ...props } as SelectProps));
}

describe("Select — 빈 옵션 끄기(hideEmptyOption)", () => {
  it("주지 않으면 첫 옵션이 `—`(value 빈 글자)다", () => {
    expect(renderSelect()).toMatch(/<select[^>]*><option value="">—<\/option><option value="team:a">/);
  });

  it("hideEmptyOption → `—` 옵션이 없고 첫 옵션이 options[0]이다", () => {
    const html = renderSelect({ hideEmptyOption: true });
    expect(html).not.toContain('<option value="">');
    expect(html).toMatch(/<select[^>]*><option value="team:a">기획1팀 공개<\/option>/);
  });

  it("hideEmptyOption={false}는 주지 않은 것과 같다", () => {
    expect(renderSelect({ hideEmptyOption: false })).toBe(renderSelect());
  });
});
