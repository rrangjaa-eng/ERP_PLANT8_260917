import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { archiveTempRoles, insertTempRole } from "./expense-fixture";

// 07-21 독립 DOM 감사(0721-dom-audit) P2 수정 측정 — 비활성 이유 줄(색 · 줄 수) · 폰 권한표(결과 줄 화면 안 · 저장 중 면).

async function loginAdmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 토큰 값을 계산된 rgb로 바꾼다 — 색 단언은 토큰 값과 같음으로 잰다(새 색 금지).
async function tokenColor(page: Page, token: string, prop: "color" | "backgroundColor"): Promise<string> {
  return page.evaluate(
    ([name, property]) => {
      const probe = document.createElement("div");
      if (property === "color") probe.style.color = `var(${name})`;
      else probe.style.background = `var(${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe)[property as "color" | "backgroundColor"];
      probe.remove();
      return value;
    },
    [token, prop],
  );
}

const WIDTHS = [1280, 375, 320] as const;

for (const width of WIDTHS) {
  test.describe(`비활성 이유 줄 ${width}`, () => {
    test.use({ viewport: { width, height: 800 } });
    test.afterAll(async () => {
      await archiveTempRoles();
    });

    test("계급 이유 줄 — `{N}명` 링크는 --text-link · 글자는 --text-muted · 폰은 두 줄 안 · 넘침 없음", async ({ page }) => {
      const roleName = `감사소속남은아주긴계급이름가나다-${randomUUID().slice(0, 6)}`;
      const role = await insertTempRole({ id: `role-${randomUUID()}`, name: roleName, workScope: "team", viewScope: "team" });
      await createFixtureUser({ roleId: role.id });
      await createFixtureUser({ roleId: role.id });
      await loginAdmin(page);
      await page.goto("/admin/people/roles");

      const link = page.locator('a[href*="/admin/people?role=' + role.id + '"]').filter({ visible: true });
      await expect(link).toHaveCount(1);
      const reason = link.locator("xpath=ancestor::span[1]");
      expect.soft(await link.evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, "--text-link", "color"));
      expect.soft(await reason.evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, "--text-muted", "color"));

      if (width < 700) {
        const box = await reason.boundingBox();
        // 44px 링크 줄 + 글자 한 줄(13px 글자 줄 높이 약 20) — 세 줄이면 83 이상이다.
        expect.soft(box!.height, "이유 줄 높이").toBeLessThanOrEqual(70);
        const linkBox = await link.boundingBox();
        expect.soft(linkBox!.width).toBeGreaterThanOrEqual(44);
        expect.soft(linkBox!.height).toBeGreaterThanOrEqual(44);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(overflow).toBeLessThanOrEqual(0);
      }
    });
  });
}

for (const width of [375, 320] as const) {
  test.describe(`폰 ${width} 권한표 딸린 칸`, () => {
    test.use({ viewport: { width, height: 800 } });

    async function tempRole(): Promise<{ id: string; name: string }> {
      const id = `role-e2e-mlinked-${randomUUID()}`;
      const name = `E2E 폰딸림 ${id.slice(-8)}`;
      await insertRole(SYSTEM_VIEWER, { id, name, sortOrder: 97 });
      return { id, name };
    }

    test("아래쪽 칸을 켜면 결과 줄이 화면 안에 서고 · 저장 중 칸 면이 --surface-dirty다", async ({ page }) => {
      const role = await tempRole();
      try {
        await loginAdmin(page);
        await page.goto("/admin/permissions");
        await page.getByRole("combobox").first().selectOption({ label: role.name });

        let release = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route("**/admin/permissions", async (route) => {
          if (route.request().method() === "POST") await gate;
          await route.continue();
        });

        const cell: Locator = page.getByRole("checkbox", { name: `${role.name} · 거래처 계좌 · 서류 수정 · 쓰기`, exact: true });
        await cell.scrollIntoViewIfNeeded();
        await cell.click();

        await expect(cell).toHaveAttribute("aria-busy", "true");
        const dirty = await tokenColor(page, "--surface-dirty", "backgroundColor");
        const surface = await cell.evaluate((el) => {
          for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg !== "rgba(0, 0, 0, 0)") return bg;
            if (node.parentElement?.tagName === "DL" || node.parentElement?.tagName === "UL") break;
          }
          return "rgba(0, 0, 0, 0)";
        });
        expect.soft(surface, "저장 중 칸 면").toBe(dirty);

        release();
        const result = page.getByRole("status").filter({ has: page.getByRole("button", { name: "되돌리기", exact: true }) });
        await expect(result).toBeVisible();
        const rect = await result.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, inner: window.innerHeight };
        });
        expect.soft(rect.top, "결과 줄 위").toBeGreaterThanOrEqual(0);
        expect.soft(rect.bottom, "결과 줄 아래").toBeLessThanOrEqual(rect.inner);
      } finally {
        await setRoleArchived(SYSTEM_VIEWER, role.id, true);
      }
    });
  });
}
