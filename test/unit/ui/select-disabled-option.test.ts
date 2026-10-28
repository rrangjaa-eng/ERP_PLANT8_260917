import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select, type SelectProps } from "../../../ui/select/Select";

// 07.1-14(R2-2): 저장된 값이 보관 · 비활성이라 다시 고를 수 없는 선택지 — `disabled: true`면 네이티브 `<option disabled>`로 그리고
// 고른 값이면 선택된 채 남는다. 주지 않으면 지금 마크업 그대로다(select-groups 꼴 — 정적 HTML 단언).

const OPTIONS: SelectProps["options"] = [
  { value: "", label: "본부 없음" },
  { value: "div-a", label: "기획본부" },
  { value: "div-old", label: "옛본부 (보관)", disabled: true },
];

function renderSelect(props: Partial<SelectProps> = {}) {
  return renderToStaticMarkup(createElement(Select, { id: "s", options: OPTIONS, hideEmptyOption: true, ...props } as SelectProps));
}

describe("Select — 비활성 선택지(disabled)", () => {
  it("disabled 선택지는 disabled 속성으로 그리고 · 고른 값이면 선택된 채 남는다", () => {
    const html = renderSelect({ value: "div-old", onChange: () => {} });
    expect(html).toContain('<option value="div-old" disabled="" selected="">옛본부 (보관)</option>');
  });

  it("묶음 안 disabled 선택지도 disabled 속성으로 그린다", () => {
    const html = renderSelect({ groups: [{ label: "다른 팀", options: [{ value: "team:x", label: "옛팀 공개", disabled: true }] }] });
    expect(html).toContain('<option value="team:x" disabled="">옛팀 공개</option>');
  });

  it("disabled를 주지 않은 선택지는 속성이 없다(기존 호출부 그대로)", () => {
    const html = renderSelect({ value: "div-a", onChange: () => {} });
    expect(html).toContain('<option value="div-a" selected="">기획본부</option>');
    expect(html).toContain('<option value="">본부 없음</option>');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});
