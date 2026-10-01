import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  SidePanel,
  closeSidePanel,
  isPanelCloseKey,
  openSidePanel,
  type PanelDialogLike,
} from "../../../ui/side-panel/SidePanel";

// SYSTEM.md §7-8 개정 ⑰(04.3-10 · D-d) — 옆 패널. jsdom이 없어(environment: "node") 열기 · 닫기 · 포커스는
// <dialog>와 같은 모양의 가짜 객체로 순수 함수를 부르고, 골격은 renderToStaticMarkup 문자열로 본다
// (confirm-dialog.test.ts 선례).

function fakeDialog() {
  const focused: string[] = [];
  const dialog: PanelDialogLike & { calls: string[] } = {
    open: false,
    calls: [],
    show() {
      this.open = true;
      this.calls.push("show");
    },
    showModal() {
      this.open = true;
      this.calls.push("showModal");
    },
    close() {
      this.open = false;
      this.calls.push("close");
    },
    querySelector(selector: string) {
      return { focus: () => focused.push(selector) };
    },
  };
  return { dialog, focused };
}

describe("openSidePanel — PC는 뒤를 막지 않고(show), 폰은 시트(showModal)", () => {
  it("PC(700 이상): show() — 스크림 · 포커스 가두기 없음 · 첫 칸 포커스", () => {
    const { dialog, focused } = fakeDialog();
    openSidePanel(dialog, true);
    expect(dialog.calls).toEqual(["show"]);
    expect(focused).toHaveLength(1);
  });

  it("폰(700 미만): showModal() — 스크림 · 포커스 가두기 · 첫 칸 포커스", () => {
    const { dialog, focused } = fakeDialog();
    openSidePanel(dialog, false);
    expect(dialog.calls).toEqual(["showModal"]);
    expect(focused).toHaveLength(1);
  });

  it("이미 열렸으면 다시 열지 않는다", () => {
    const { dialog } = fakeDialog();
    dialog.open = true;
    openSidePanel(dialog, true);
    expect(dialog.calls).toEqual([]);
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

describe("closeSidePanel — 닫히면 여는 버튼으로 포커스(성공으로 닫을 때는 호출부가 새 결과로 옮긴다)", () => {
  it("열린 패널을 닫은 뒤 여는 버튼에 포커스", () => {
    const { dialog } = fakeDialog();
    dialog.open = true;
    const order: string[] = [];
    closeSidePanel(dialog, { focus: () => order.push(`focus(open=${dialog.open})`) });
    expect(dialog.calls).toEqual(["close"]);
    expect(order).toEqual(["focus(open=false)"]);
  });

  it("여는 버튼이 없으면(성공 — returnFocus 끔) 닫기만", () => {
    const { dialog } = fakeDialog();
    dialog.open = true;
    closeSidePanel(dialog, null);
    expect(dialog.calls).toEqual(["close"]);
  });
});

describe("SidePanel 골격(renderToStaticMarkup)", () => {
  const html = renderToStaticMarkup(
    createElement(SidePanel, {
      open: true,
      onClose: vi.fn(),
      title: "QR 생성 신청",
      opener: { current: null },
      actions: createElement("span", null, createElement("button", null, "취소"), createElement("button", null, "QR 생성 신청")),
      children: createElement("input", { "aria-label": "행사 이름" }),
    }),
  );

  it("<dialog> + 제목(--fs-lg 머리) + 닫기 × + 본문 + 행동 줄(2차 → 1차 순서)", () => {
    expect(html).toMatch(/^<dialog /);
    expect(html).toContain('aria-labelledby="');
    expect(html).toMatch(/<h2 [^>]*id="[^"]+"[^>]*>QR 생성 신청<\/h2>/);
    expect(html).toContain('aria-label="닫기"');
    expect(html.indexOf("행사 이름")).toBeLessThan(html.indexOf(">취소<"));
    expect(html.indexOf(">취소<")).toBeLessThan(html.lastIndexOf(">QR 생성 신청<"));
  });

  it("PC 모양에는 --scrim이 없고, 폰(700 미만) 시트 골격에만 있다", () => {
    const css = readFileSync(resolve(process.cwd(), "ui/side-panel/SidePanel.module.css"), "utf8");
    const media = css.indexOf("@media (max-width: 699px)");
    expect(media).toBeGreaterThan(0);
    expect(css.slice(0, media)).not.toContain("--scrim");
    expect(css.slice(media)).toMatch(/::backdrop\s*\{[^}]*var\(--scrim\)/);
    // PC 폭 480 = --modal-w(§7-8 모달과 같은 폭) · 목록을 밀지 않는 고정 위치
    expect(css.slice(0, media)).toContain("var(--modal-w)");
    expect(css.slice(0, media)).toMatch(/position:\s*fixed/);
  });
});
