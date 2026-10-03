import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

import * as sidePanelModule from "../../../ui/side-panel/SidePanel";
import { SidePanel, isPanelCloseKey } from "../../../ui/side-panel/SidePanel";

// UI-SPEC 「옆 패널 상호작용 계약」(04.6-04 · Q1 A) — 옆 패널은 모든 폭에서 showModal()로 뒤를 막는다. jsdom이 없어
// (environment: "node") 열기 · 닫기 · 포커스는 E2E(side-panel.spec.ts)가 재고, 여기서는 소스 계약과 골격 문자열을 본다
// (confirm-dialog.test.ts 선례). #88의 PC 비모달(show()) · 가림막 없음 · 옛 모달 폭 변수 단언은 Q1 A로 대체돼 지웠다.

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SidePanel 소스 계약 — 모든 폭 모달(Q1 A)", () => {
  const tsx = source("ui/side-panel/SidePanel.tsx");

  it("showModal()을 쓰고 비모달 show() 호출이 없다", () => {
    expect(tsx).toMatch(/\.showModal\(\)/);
    expect(tsx).not.toMatch(/\.show\(\)/);
  });

  it("#88의 여는 · 닫는 함수와 dialog 흉내 타입은 남지 않는다", () => {
    for (const name of ["openSidePanel", "closeSidePanel"]) {
      expect(Object.keys(sidePanelModule)).not.toContain(name);
    }
    expect(tsx).not.toContain("PanelDialogLike");
  });

  it("열 때 스크롤바 폭을 재어 html 안쪽 여백으로 채우고 닫을 때 지운다(스크롤바 없던 쪽은 0)", () => {
    expect(tsx).toMatch(/paddingInlineEnd = `\$\{window\.innerWidth - root\.clientWidth\}px`/);
    expect(tsx).toMatch(/paddingInlineEnd = ""/);
    const css = source("ui/side-panel/SidePanel.module.css");
    expect(css).not.toContain("scrollbar-gutter");
  });

  it("Tab이 패널 안에서 돈다 — 마지막 칸 Tab · 첫 칸 Shift+Tab이 반대쪽 끝으로 간다", () => {
    expect(tsx).toContain("wrapTab");
    expect(tsx).toMatch(/event\.shiftKey && active === first/);
  });

  it("닫기 경로 하나 — closedByUsRef · requestClose · 새로고침 호출 없음", () => {
    expect(tsx).toContain("closedByUsRef");
    expect(tsx).toContain("requestClose");
    expect(tsx).not.toContain("router.refresh");
  });

  it("닫기 요청이 이번 닫기만 포커스 복귀를 건너뛸 수 있다 — 성공 뒤 새 결과로 포커스를 옮기는 URL 패널(04.6-23)", () => {
    expect(tsx).toContain("options?: { returnFocus?: boolean }");
    expect(tsx).toMatch(/options\?\.returnFocus === false\) skipReturnFocusRef\.current = true/);
    expect(tsx).toMatch(/!returnFocusRef\.current \|\| skipReturnFocusRef\.current/);
  });
});

describe("isPanelCloseKey — Esc로 닫힘(조합 중 · 안쪽 컨트롤이 먼저 쓴 Esc는 아님)", () => {
  it.each([
    [{ key: "Escape" }, true],
    [{ key: "Escape", isComposing: true }, false],
    [{ key: "Escape", defaultPrevented: true }, false],
    [{ key: "Enter" }, false],
  ])("%j → %s", (event, expected) => {
    expect(isPanelCloseKey(event)).toBe(expected);
  });
});

describe("SidePanel 골격(renderToStaticMarkup)", () => {
  const html = renderToStaticMarkup(
    createElement(
      SidePanel,
      { title: "거래처 등록", closeHref: "/admin/vendors" },
      createElement("input", { "aria-label": "이름" }),
    ),
  );

  it('<dialog data-ui="side-panel" aria-labelledby> + 제목 + 닫기 x + 본문', () => {
    expect(html).toMatch(/^<dialog /);
    expect(html).toContain('data-ui="side-panel"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="([^"]+)"/);
    expect(html).toMatch(/<h2 [^>]*id="[^"]+"[^>]*>거래처 등록<\/h2>/);
    expect(html).toContain('aria-label="닫기"');
    expect(html).toContain('aria-label="이름"');
  });

  it("제목 id를 aria-labelledby가 가리킨다", () => {
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    const titleId = /<h2 [^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(labelledBy).toBe(titleId);
  });

  it("제어 형태(onClose)도 같은 골격이다", () => {
    const controlled = renderToStaticMarkup(createElement(SidePanel, { title: "결재", onClose: vi.fn() }, createElement("p", null, "본문")));
    expect(controlled).toContain('data-ui="side-panel"');
    expect(controlled).toContain(">결재</h2>");
  });
});

describe("SidePanel.module.css — Q1 A 가림막 · 폭 · 폰 시트", () => {
  const css = source("ui/side-panel/SidePanel.module.css");
  const media = css.indexOf("@media (max-width: 699.98px)");

  it("PC는 --panel-w 480 고정 위치 + ::backdrop --scrim-panel", () => {
    expect(media).toBeGreaterThan(0);
    const pc = css.slice(0, media);
    expect(pc).toContain("var(--panel-w)");
    expect(pc).toMatch(/position:\s*fixed/);
    expect(pc).toMatch(/\.panel::backdrop\s*\{[^}]*var\(--scrim-panel\)/);
  });

  it("폰(700 미만) 시트는 ::backdrop --scrim-dialog + 높이 상한 --sheet-max-h", () => {
    const phone = css.slice(media);
    expect(phone).toMatch(/::backdrop\s*\{[^}]*var\(--scrim-dialog\)/);
    expect(phone).toContain("var(--sheet-max-h)");
  });

  it("옛 이름 --scrim · --modal-w가 없다(경계 패턴)", () => {
    expect(css).not.toMatch(/--scrim(?![\w-])/);
    expect(css).not.toMatch(/--modal-w(?![\w-])/);
  });

  it("뒤 스크롤 잠금 + overscroll-behavior contain · 순서 뒤집기 없음", () => {
    expect(css).toMatch(/overflow:\s*hidden/);
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).not.toMatch(/row-reverse|(?<![-\w])order:/);
  });
});
