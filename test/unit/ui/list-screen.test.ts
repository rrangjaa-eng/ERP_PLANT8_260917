import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link는 라우터 문맥이 필요하다 — `scroll` 값을 data-scroll로 남기는 앵커로 바꿔 「스크롤을 안 건드린다」를 단언한다.
vi.mock("next/link", () => ({
  default: ({ href, scroll, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode }) =>
    createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => null }));

const { ListScreen } = await import("../../../ui/list-screen/ListScreen");

// UI-SPEC 「화면 틀 계약」 ListScreen — DR5 A(빈 목록이면 머리 1차를 숨기고 빈 화면 버튼 하나) · 부제 없음 · 합계 면 · 페이지 줄.
// 「빈 목록」 = 등록된 대상이 하나도 없음이다. 필터 결과 0건은 빈 목록이 아니다(그때는 children에 필터 빈 화면을 두고 1차를 남긴다).

const primaryAction = { label: "거래처 등록", href: "/admin/vendors?new=1" };

function render(props: Parameters<typeof ListScreen>[0]): string {
  return renderToStaticMarkup(createElement(ListScreen, props));
}

describe("ListScreen — DR5 A 빈 목록 규칙", () => {
  it("empty와 primaryAction을 함께 넘기면 머리 1차가 0개이고 empty가 표 자리에 있다", () => {
    const html = render({
      title: "거래처",
      primaryAction,
      empty: createElement("p", { "data-empty": "" }, "등록된 거래처가 없습니다"),
      children: createElement("table", { "data-table": "" }),
    });
    expect(html.match(/data-ui="primary-button"/g) ?? []).toHaveLength(0);
    expect(html).toContain('data-empty=""');
    expect(html).not.toContain("data-table");
  });

  it("empty 없이 primaryAction만 넘기면 1차가 1개이고 scroll={false} 링크다", () => {
    const html = render({ title: "거래처", primaryAction, children: createElement("table", { "data-table": "" }) });
    expect(html.match(/data-ui="primary-button"/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-scroll="false"');
    expect(html).toContain('href="/admin/vendors?new=1"');
    expect(html).toContain("data-table");
  });
});

describe("ListScreen — 틀", () => {
  it("제목은 h1(data-ui=screen-title · tabIndex -1)이고 부제 자리가 없다", () => {
    const html = render({ title: "거래처", children: null });
    expect(html).toMatch(/<h1 [^>]*data-ui="screen-title"[^>]*tabindex="-1"[^>]*>거래처<\/h1>/);
    expect(html).not.toContain("<h2");
  });

  it("summary(합계 면)는 필터 줄과 표 사이, pagination은 표 뒤에 그려진다", () => {
    const html = render({
      title: "거래처",
      filters: createElement("span", { "data-filters": "" }),
      summary: createElement("div", { "data-summary": "" }),
      pagination: createElement("nav", { "data-pagination": "" }),
      children: createElement("table", { "data-table": "" }),
    });
    const order = ["data-filters", "data-summary", "data-table", "data-pagination"].map((key) => html.indexOf(key));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("panel은 마지막에 그려진다", () => {
    const html = render({ title: "거래처", panel: createElement("dialog", { "data-panel": "" }), children: createElement("table", { "data-table": "" }) });
    expect(html.indexOf("data-panel")).toBeGreaterThan(html.indexOf("data-table"));
  });
});

describe("ListScreen.module.css — 합계 면 역할 토큰", () => {
  const css = readFileSync(resolve(process.cwd(), "ui/list-screen/ListScreen.module.css"), "utf8");
  const summary = /\.summary\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("합계 면은 표 면 · 1px 테두리 · 면 radius · 안쪽 s-3 s-4 · 위 여백 s-3이다", () => {
    expect(summary).toContain("background: var(--surface-base)");
    expect(summary).toMatch(/border:\s*var\(--line-w\) solid var\(--border-surface\)/);
    expect(summary).toContain("border-radius: var(--radius-surface)");
    expect(summary).toContain("padding: var(--s-3) var(--s-4)");
    expect(summary).toContain("margin: var(--s-3) 0 0");
  });
});
