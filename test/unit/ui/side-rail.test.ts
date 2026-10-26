import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RAIL_MEDIA, RailAdminLink, RailNav, RailSearchRow } from "../../../ui/shell/SideRail";
import { roleMenu } from "../../../ui/shell/role-menu";

// 왼쪽 레일(2026-10-26 설계안 「폭별 셸」「레일」) — 항목은 role-menu.ts 결과만 그린다(D-23).
const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("RailNav — 주 메뉴", () => {
  const menu = roleMenu({
    roleId: "employee",
    allowedMenus: ["projects", "expenses"],
    canIntakeEvidence: true,
  });

  it("nav 「주 메뉴」에 topBarMenu 항목을 순서대로 그린다(증빙은 3번째)", () => {
    const out = renderToStaticMarkup(createElement(RailNav, { items: menu.topBarMenu, current: null }));
    expect(out).toContain('<nav aria-label="주 메뉴"');
    const labels = [...out.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(labels).toEqual(menu.topBarMenu.map((item) => item.label));
    expect(labels[2]).toBe("증빙");
  });

  it("현재 항목 하나에만 aria-current=page", () => {
    const out = renderToStaticMarkup(createElement(RailNav, { items: menu.topBarMenu, current: "/expenses/evidence" }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>증빙<|href="\/expenses\/evidence"[^>]*aria-current="page"/);
  });

  it("current가 없으면 aria-current가 없다", () => {
    const out = renderToStaticMarkup(createElement(RailNav, { items: menu.topBarMenu, current: null }));
    expect(out).not.toContain("aria-current");
  });
});

describe("RailAdminLink — 관리", () => {
  it("관리 항목이 있으면 링크 한 줄, 없으면 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(createElement(RailAdminLink, { items: [{ label: "관리", href: "/admin" }] }))).toContain(
      'href="/admin"',
    );
    expect(renderToStaticMarkup(createElement(RailAdminLink, { items: [] }))).toBe("");
  });
});

describe("RailSearchRow", () => {
  it("명령 팔레트가 없어 aria-disabled 행이고 Ctrl+K kbd를 갖는다", () => {
    const out = renderToStaticMarkup(createElement(RailSearchRow));
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain("<kbd");
    expect(out).toContain("Ctrl+K");
  });
});

describe("경계", () => {
  it("레일 미디어 쿼리는 tokens.css의 1280 경계와 같다", () => {
    expect(RAIL_MEDIA).toBe("(min-width: 1280px)");
    expect(read("docs/design/tokens.css")).toMatch(/--rail-w:\s*176px/);
    expect(read("docs/design/tokens.css")).toContain("--shell-top");
  });
});
