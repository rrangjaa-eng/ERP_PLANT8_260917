import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextTurn } from "../../../ui/next-turn/NextTurn";
import { buildNextTurnView, type NextTurnItem } from "../../../ui/next-turn/build-next-turn-view";

// 06-23 DOM 감사 D-1 — 긴 대상 글자는 말줄임으로 잘리므로(데스크톱 1줄 · 폰 2줄) 전체 글자를 `title`로 남긴다.
const LONG = "아주 긴 프로젝트 이름이 들어가는 정산 프로젝트 · 무대 철거 및 원상복구 정산 항목 — 증빙 없음 · 지급 대기";

function render(item: NextTurnItem): string {
  return renderToStaticMarkup(createElement(NextTurn, { view: buildNextTurnView([item]) }));
}

describe("NextTurn 대상 글자 title (D-1)", () => {
  it("대상 span이 전체 글자를 title로 가진다", () => {
    const html = render({ tag: "막힘", label: LONG, reason: "", amount: 1000, action: { label: "증빙 올리기", href: "/expenses/1#evidence" } });
    expect(html).toMatch(new RegExp(`<span[^>]*title="${LONG}"[^>]*>${LONG}</span>`));
  });
});
