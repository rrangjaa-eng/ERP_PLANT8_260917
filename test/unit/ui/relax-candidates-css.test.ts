import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 04.6-26 — UQ-4 완화 후보 5 · 7 · 8을 `ui/`에 넣은 CSS 소스 단언(04.6-ANSWERS.md 「2026-10-03 답」).
// 선례: test/unit/ui/toast-css.test.ts (주석을 지운 소스를 정규식으로 본다).
function css(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(source)?.[1] ?? "";
}

const toast = css("ui/toast/Toast.module.css");
const topBar = css("ui/shell/TopBar.module.css");
const dialog = css("ui/confirm-dialog/ConfirmDialog.module.css");
const table = css("ui/table/Table.module.css");

describe("후보 5 — 떠 있는 요소 그림자(토스트 · 사용자 메뉴)", () => {
  it("토스트는 --shadow-pop + 1px --border-surface 선이다", () => {
    const body = rule(toast, ".toast");
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-pop\);/);
    expect(body).toMatch(/border:\s*var\(--line-w\) solid var\(--border-surface\);/);
  });

  it("사용자 메뉴는 --shadow-pop 이고 --shadow-surface 가 아니다", () => {
    const body = rule(topBar, ".userMenu");
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-pop\);/);
    expect(body).toMatch(/border:\s*var\(--line-w\) solid var\(--border-surface\);/);
  });

  it("확인 창 · 옆 패널 · 시트는 그림자가 바뀌지 않았다(--shadow-float)", () => {
    expect(rule(dialog, ".dialog")).toMatch(/box-shadow:\s*var\(--shadow-float\);/);
  });
});

describe("후보 8 — 열림 모션 200ms 페이드 + 4px 이동(모달 · 토스트 · 메뉴)", () => {
  it("토스트는 --dur-sheet · --ease-sheet 로 열리고 이동은 --s-1(4px)이다", () => {
    expect(rule(toast, ".toast")).toMatch(/animation:\s*toast-in var\(--dur-sheet\) var\(--ease-sheet\);/);
    expect(toast).toMatch(/@keyframes toast-in\s*\{\s*from\s*\{[^{}]*opacity:\s*0;[^{}]*translateY\(var\(--s-1\)\)/);
  });

  it("사용자 메뉴는 같은 모션이다", () => {
    expect(rule(topBar, ".userMenu")).toMatch(/animation:\s*menu-in var\(--dur-sheet\) var\(--ease-sheet\);/);
    expect(topBar).toMatch(/@keyframes menu-in\s*\{\s*from\s*\{[^{}]*opacity:\s*0;[^{}]*translateY\(var\(--s-1\)\)/);
  });

  it("확인 창은 PC(700 이상)에서만 열림 모션이다 — 폰 시트는 그대로", () => {
    const media = /@media \(min-width:\s*700px\)\s*\{([\s\S]*?)\n\}/.exec(dialog)?.[1] ?? "";
    expect(media).toMatch(/\.dialog\[open\]\s*\{[^{}]*animation:\s*dialog-in var\(--dur-sheet\) var\(--ease-sheet\);/);
    expect(dialog).toMatch(/@keyframes dialog-in\s*\{\s*from\s*\{[^{}]*opacity:\s*0;[^{}]*translateY\(var\(--s-1\)\)/);
    expect(rule(dialog, ".dialog")).not.toMatch(/animation:/);
  });

  it("옆 패널 · 시트 모션은 이 후보가 건드리지 않는다", () => {
    expect(css("ui/side-panel/SidePanel.module.css")).not.toMatch(/dialog-in|menu-in|toast-in/);
  });
});

describe("후보 7 — 편집 칸 포커스 링은 모서리를 따르고 저장 대기 칸은 옅은 초록 면이다", () => {
  it("편집 가능 칸 · 칸 포커스 링의 radius 는 --radius-control 이다", () => {
    expect(rule(table, ".editableCell:focus-visible")).toMatch(/border-radius:\s*var\(--radius-control\);/);
    expect(rule(table, ".cell:focus-visible")).toMatch(/border-radius:\s*var\(--radius-control\);/);
  });

  it("저장 대기 칸은 인셋 선 위에 --surface-dirty 면이 있다", () => {
    const body = rule(table, ".dirtyCell");
    expect(body).toMatch(/box-shadow:\s*var\(--inset-dirty\);/);
    expect(body).toMatch(/background:\s*var\(--surface-dirty\);/);
  });

  it.each([
    "app/(app)/projects/[id]/project-detail.module.css",
    "app/(app)/pnl/reserves/reserves.module.css",
    "app/(app)/certs/events/[id]/event-detail.module.css",
  ])("%s 의 칸 안 입력 포커스 링도 --radius-control 을 따른다", (path) => {
    const source = css(path);
    const body = /(?:^|\})\s*(?:\.cell(?:Select|Input|InputNumeric):focus-visible,?\s*){3}\{([^{}]*)\}/.exec(source)?.[1] ?? "";
    expect(body).toMatch(/border-radius:\s*var\(--radius-control\);/);
  });
});

describe("고르지 않은 후보는 `ui/`에 없다", () => {
  it("아이콘 폴더 · 의존성 변화 없음(후보 4) — ui/icon 이 없다", () => {
    expect(() => readFileSync(join(process.cwd(), "ui/icon/Icon.tsx"), "utf8")).toThrow();
  });
});
