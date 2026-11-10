import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pickReason, selectedOptionOf, OTHER_LABEL } from "../../../ui/reason-field/compose";
import { ReasonField } from "../../../ui/reason-field/ReasonField";

// 07.2-07 X3(D-7288) — 사유 고르기 부품의 순수 부분. 시작말 교체 · 덧붙임 보존 · 다시 열기 판정.
// 이 프로젝트의 단위 시험은 jsdom 없이(node) 도니 부품은 정적 마크업으로 모양만 본다(동작은 E2E 몫).

describe("pickReason — 항목 고르기(D-7288)", () => {
  it("빈 글에 항목을 고르면 글이 그 문구가 된다", () => {
    expect(pickReason({ text: "", prevLabel: null }, "예산 초과")).toEqual({ text: "예산 초과", prevLabel: "예산 초과" });
  });

  it("다른 항목으로 바꾸면 이전 시작말만 교체하고 덧붙인 뒤쪽은 보존한다", () => {
    expect(pickReason({ text: "예산 초과 · 3월분", prevLabel: "예산 초과" }, "증빙 누락")).toEqual({
      text: "증빙 누락 · 3월분",
      prevLabel: "증빙 누락",
    });
  });

  it("직접 쓴 글(이전 시작말로 시작하지 않음)이면 글을 두고 선택만 바뀐다", () => {
    expect(pickReason({ text: "직접 쓴 글", prevLabel: "예산 초과" }, "증빙 누락")).toEqual({
      text: "직접 쓴 글",
      prevLabel: "증빙 누락",
    });
    expect(pickReason({ text: "직접 쓴 글", prevLabel: null }, "증빙 누락")).toEqual({
      text: "직접 쓴 글",
      prevLabel: "증빙 누락",
    });
  });

  it("기타는 글을 비운다", () => {
    expect(pickReason({ text: "예산 초과 · 3월분", prevLabel: "예산 초과" }, OTHER_LABEL)).toEqual({ text: "", prevLabel: null });
  });
});

describe("selectedOptionOf — 다시 열기 판정(D-7287)", () => {
  it("저장 글이 항목 문구와 같으면 그 항목", () => {
    expect(selectedOptionOf("예산 초과", ["예산 초과"])).toBe("예산 초과");
  });

  it("덧붙인 글이거나 다른 글이면 기타", () => {
    expect(selectedOptionOf("예산 초과 · 3월분", ["예산 초과"])).toBe(OTHER_LABEL);
    expect(selectedOptionOf("다른 글", ["예산 초과"])).toBe(OTHER_LABEL);
  });

  it("빈 글이면 아무것도 고르지 않은 상태(자리표시)", () => {
    expect(selectedOptionOf("", ["예산 초과"])).toBe("");
  });
});

describe("ReasonField — 마크업", () => {
  function render(options: string[], value = "") {
    return renderToStaticMarkup(
      createElement(ReasonField, { id: "r", options, value, onChange: () => {} }),
    );
  }

  it("옵션 3개 → 자리표시 + 3 + 기타 · textarea 1", () => {
    const html = render(["가", "나", "다"]);
    expect(html.match(/<option/g)?.length).toBe(5);
    expect(html).toContain("사유 고르기");
    expect(html).toContain(">기타<");
    expect(html.match(/<textarea/g)?.length).toBe(1);
  });

  it("옵션 0개 → select 없이 textarea만", () => {
    const html = render([]);
    expect(html).not.toContain("<select");
    expect(html.match(/<textarea/g)?.length).toBe(1);
  });

  it("처음 값이 항목 문구와 같으면 그 항목이 골라져 보인다", () => {
    expect(render(["가", "나"], "나")).toMatch(/<option value="나" selected/);
  });

  it("처음 값이 다른 글이면 기타가 골라져 보인다", () => {
    expect(render(["가", "나"], "직접")).toMatch(/<option value="기타" selected/);
  });
});
