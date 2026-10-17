import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select, type SelectProps } from "../../../ui/select/Select";

// 06.1-05(PA-OPTGROUP · DA-1) — 증빙 공개 칸의 「다른 팀」 묶음. 평 선택지 뒤에 네이티브 `<optgroup label>`으로 그리고, 묶음을 주지 않으면
// 지금 마크업 그대로다. jsdom 없이(environment: "node") renderToStaticMarkup 정적 HTML로 단언한다(select-error-hint 꼴).

const OPTIONS: SelectProps["options"] = [
  { value: "team:a", label: "기획1팀 공개" },
  { value: "division", label: "기획본부 공개" },
  { value: "private", label: "미공개" },
];

const OTHER_TEAMS: NonNullable<SelectProps["groups"]> = [
  {
    label: "다른 팀",
    options: [
      { value: "team:b", label: "기획2팀 공개" },
      { value: "team:c", label: "영상팀 공개", description: "설명 다" },
    ],
  },
];

function renderSelect(props: Partial<SelectProps> = {}) {
  return renderToStaticMarkup(createElement(Select, { id: "s", options: OPTIONS, ...props } as SelectProps));
}

describe("Select — 묶음 선택지(groups)", () => {
  it("groups → 평 선택지 뒤에 <optgroup label> 하나, 그 안에 묶음 선택지가 준 순서대로", () => {
    const html = renderSelect({ groups: OTHER_TEAMS });
    expect(html).toContain('<optgroup label="다른 팀"><option value="team:b">기획2팀 공개</option><option value="team:c">영상팀 공개</option></optgroup>');
    expect(html.match(/<optgroup/g)).toHaveLength(1);
    expect(html.indexOf('<option value="private">')).toBeLessThan(html.indexOf("<optgroup"));
    expect(html.indexOf("</optgroup>")).toBeLessThan(html.indexOf("</select>"));
  });

  it("groups 없음 · 빈 배열 → optgroup 없이 지금 마크업과 같다", () => {
    const plain = renderSelect();
    expect(plain).not.toContain("<optgroup");
    expect(renderSelect({ groups: [] })).toBe(plain);
  });

  it("묶음 안 선택지가 고른 값이면 그 설명이 평 선택지와 같은 힌트 줄로 선다", () => {
    const html = renderSelect({ groups: OTHER_TEAMS, value: "team:c", onChange: () => {} });
    expect(html).toContain("설명 다");
    expect(html).toContain('aria-describedby="s-hint"');
  });
});
