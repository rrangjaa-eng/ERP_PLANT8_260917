import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// 04.6-26 — UQ-4 완화 후보 5 · 7 · 8 DOM 실측(04.6-ANSWERS.md 「2026-10-03 답」: 5·7·8 넣음, 4·6·9 뺌).
// /dev/components 표본(토스트 · 모달 · 편집 표)과 상단 바 사용자 메뉴로 잰다. 판정은 계산값으로만 한다.

async function login(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 토큰을 표현식으로 쓴 속성의 계산 값 — 리터럴 대신 역할 토큰이 풀린 값과 비교한다.
function resolved(page: Page, property: string, value: string): Promise<string> {
  return page.evaluate(
    ([prop, val]) => {
      const probe = document.createElement("div");
      probe.style.borderStyle = "solid";
      probe.style.setProperty(prop as string, val as string);
      document.body.appendChild(probe);
      const out = getComputedStyle(probe).getPropertyValue(prop as string);
      probe.remove();
      return out;
    },
    [property, value],
  );
}

function seconds(value: string): number {
  return value.endsWith("ms") ? parseFloat(value) / 1000 : parseFloat(value);
}

test.describe("완화 후보 5 · 7 · 8 (PC 1280)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/components");
  });

  test("후보 5 — 토스트 그림자는 --shadow-pop(--ink-a30) · 테두리는 --border-surface 1px", async ({ page }) => {
    await page.getByRole("button", { name: "토스트 띄우기" }).click();
    const toast = page.getByRole("status").filter({ hasText: "저장됨" });
    await expect(toast).toBeVisible();
    const style = await toast.evaluate((el) => {
      const s = getComputedStyle(el);
      return { shadow: s.boxShadow, borderColor: s.borderTopColor, borderWidth: s.borderTopWidth };
    });
    expect(style.shadow).toBe(await resolved(page, "box-shadow", "var(--shadow-pop)"));
    expect(style.shadow).not.toBe(await resolved(page, "box-shadow", "var(--shadow-surface)"));
    expect(style.borderColor).toBe(await resolved(page, "border-top-color", "var(--border-surface)"));
    expect(style.borderWidth).toBe(await resolved(page, "border-top-width", "var(--line-w)"));
  });

  test("후보 5 — 사용자 메뉴 그림자와 테두리가 토스트와 같다", async ({ page }) => {
    await page.locator('button[aria-haspopup="menu"]').click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const style = await menu.evaluate((el) => {
      const s = getComputedStyle(el);
      return { shadow: s.boxShadow, borderColor: s.borderTopColor, borderWidth: s.borderTopWidth };
    });
    expect(style.shadow).toBe(await resolved(page, "box-shadow", "var(--shadow-pop)"));
    expect(style.borderColor).toBe(await resolved(page, "border-top-color", "var(--border-surface)"));
    expect(style.borderWidth).toBe(await resolved(page, "border-top-width", "var(--line-w)"));
  });

  test("후보 5 — 모달은 그림자가 그대로 --shadow-float 다", async ({ page }) => {
    await page.getByRole("button", { name: "모달 열기" }).click();
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(await resolved(page, "box-shadow", "var(--shadow-float)"));
  });

  test("후보 8 — 토스트 열림 모션은 200ms(--dur-sheet) 페이드 + 4px(--s-1) 이동", async ({ page }) => {
    await page.getByRole("button", { name: "토스트 띄우기" }).click();
    const toast = page.getByRole("status").filter({ hasText: "저장됨" });
    await expect(toast).toBeVisible();
    const motion = await toast.evaluate((el) => {
      const s = getComputedStyle(el);
      const effect = el.getAnimations()[0]?.effect as KeyframeEffect | undefined;
      const from = effect?.getKeyframes()[0];
      return { name: s.animationName, duration: s.animationDuration, easing: s.animationTimingFunction, fromOpacity: from?.opacity, fromTransform: from?.transform };
    });
    expect(motion.name).toContain("toast-in");
    expect(motion.duration).toBe(await resolved(page, "animation-duration", "var(--dur-sheet)"));
    expect(seconds(motion.duration)).toBeCloseTo(0.2, 5);
    expect(motion.easing).toBe(await resolved(page, "animation-timing-function", "var(--ease-sheet)"));
    expect(String(motion.fromOpacity)).toBe("0");
    expect(motion.fromTransform).toBe(`translateY(${parseFloat(await resolved(page, "margin-top", "var(--s-1)"))}px)`);
  });

  test("후보 8 — 사용자 메뉴도 같은 열림 모션", async ({ page }) => {
    await page.locator('button[aria-haspopup="menu"]').click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const motion = await menu.evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: s.animationDuration, easing: s.animationTimingFunction };
    });
    expect(motion.name).toContain("menu-in");
    expect(motion.duration).toBe(await resolved(page, "animation-duration", "var(--dur-sheet)"));
    expect(seconds(motion.duration)).toBeCloseTo(0.2, 5);
    expect(motion.easing).toBe(await resolved(page, "animation-timing-function", "var(--ease-sheet)"));
  });

  test("후보 8 — 확인 창(PC)은 같은 열림 모션 · 옆 패널은 모션이 그대로(panelIn)", async ({ page }) => {
    await page.getByRole("button", { name: "모달 열기" }).click();
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    const motion = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: s.animationDuration };
    });
    expect(motion.name).toContain("dialog-in");
    expect(motion.duration).toBe(await resolved(page, "animation-duration", "var(--dur-sheet)"));
    expect(seconds(motion.duration)).toBeCloseTo(0.2, 5);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    await page.goto("/dev/components?panel=1");
    const panel = page.locator('dialog:modal[data-ui="side-panel"]');
    await expect(panel).toBeVisible();
    const panelMotion = await panel.evaluate((el) => getComputedStyle(el).animationName);
    expect(panelMotion).toContain("panelIn");
    expect(panelMotion).not.toContain("dialog-in");
  });

  test("후보 8 — 줄이기 설정이면 열림 모션이 사실상 없다", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "토스트 띄우기" }).click();
    const toast = page.getByRole("status").filter({ hasText: "저장됨" });
    await expect(toast).toBeVisible();
    const duration = await toast.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(duration)).toBeLessThan(0.001);
  });

  test("후보 7 — 저장 대기 칸 배경은 --surface-dirty(--g-100 계열) 계산 색이다", async ({ page }) => {
    const edit = page.locator('[data-gallery="table-edit"]');
    await expect(edit.locator("td").first()).toBeVisible();
    const probe = await edit.evaluate((root) => {
      const cells = Array.from(root.querySelectorAll("td"));
      const shadowed = cells.filter((cell) => getComputedStyle(cell).boxShadow !== "none" && getComputedStyle(cell).boxShadow.includes("inset"));
      return shadowed.map((cell) => ({ bg: getComputedStyle(cell).backgroundColor, shadow: getComputedStyle(cell).boxShadow }));
    });
    const dirtyShadow = await resolved(page, "box-shadow", "var(--inset-dirty)");
    const dirtyCells = probe.filter((entry) => entry.shadow === dirtyShadow);
    expect(dirtyCells).toHaveLength(1);
    expect(dirtyCells[0]!.bg).toBe(await resolved(page, "background-color", "var(--surface-dirty)"));
    expect(dirtyCells[0]!.bg).toBe(await resolved(page, "background-color", "var(--g-100)"));
  });

  test("후보 7 — 편집 가능 칸 포커스 링이 모서리(--radius-control)를 따른다", async ({ page }) => {
    const edit = page.locator('[data-gallery="table-edit"]');
    const cell = edit.locator("td[tabindex]").first();
    await cell.focus();
    await page.keyboard.press("ArrowRight");
    const focused = page.locator('[data-gallery="table-edit"] td:focus-visible');
    await expect(focused).toHaveCount(1);
    const style = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle };
    });
    expect(style.radius).toBe(await resolved(page, "border-top-left-radius", "var(--radius-control)"));
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe(await resolved(page, "border-top-width", "var(--focus-w)"));
  });
});
