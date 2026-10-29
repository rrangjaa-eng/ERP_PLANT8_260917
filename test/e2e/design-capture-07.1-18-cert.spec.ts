import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { measurePhoneRows } from "./helpers/phone-rows";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createCertEvent } from "./helpers/cert";

// 07.1-18 디자인 검토 증거(확인증) — 행사 목록 표의 폰 두 줄을 폭마다 찍는다. 파일명에 cert가 들어가 certs 프로젝트(기능이 켜진 상태)에서만 돈다.
// DESIGN_CAPTURE_DIR이 없으면 건너뛴다. Codex 경로는 CODEX_REVIEW_CERT=1로 cert-setup을 먼저 돈다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-18)");

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("확인증 행사 목록 — 폭마다 PNG와 행 실측", async ({ page }) => {
  test.setTimeout(240_000);
  if (!OUT_DIR) return;
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await createCertEvent();
  await login(page, admin);
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: unknown[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/certs/events");
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await page.screenshot({ path: join(OUT_DIR, `state-cert-events-${viewport.width}.png`), fullPage: true });
    rows.push({ width: viewport.width, rowShape: viewport.width < 700 ? await measurePhoneRows(table) : null });
  }
  writeFileSync(join(OUT_DIR, "measurements-state-cert-events.json"), JSON.stringify(rows, null, 2));
});
