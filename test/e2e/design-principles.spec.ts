import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { evaluatePrinciples, type ScreenSnapshot, type Warning } from "./design-principles";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { findUserByEmail } from "@/repositories/users";

// 화면 사용성 원칙 자동 점검(사용자 결정 2026-09-28). 지금은 경고만 남긴다 — 위반은 테스트 주석(annotation)과
// 로그로 보이고 실패시키지 않는다. Phase 4 머지 뒤 DESIGN_PRINCIPLES_STRICT=1로 막는 모드를 켠다.
const STRICT = process.env.DESIGN_PRINCIPLES_STRICT === "1";

async function snapshot(page: Page): Promise<ScreenSnapshot> {
  return page.evaluate(() => {
    // offsetParent는 position: fixed 요소(옆 패널 버튼 등)에서 null이라 쓰지 않는다
    const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const main = document.querySelector("main") ?? document.body;
    const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    let bg = rgb(getComputedStyle(document.body).backgroundColor);
    if (bg.length === 4 && bg[3] === 0) bg = rgb(getComputedStyle(document.documentElement).backgroundColor);
    if (bg.length < 3 || (bg.length === 4 && bg[3] === 0)) bg = [255, 255, 255];
    const subtitle = main.querySelector('[class*="PageHeader-module__"][class*="__subtitle"]');
    const prose = Array.from(main.querySelectorAll("p"))
      .filter((p) => visible(p) && !p.closest('[role="alert"], [role="status"]'))
      .map((p) => (p.textContent ?? "").trim())
      .filter(Boolean);
    const rowActionStyles = Array.from(main.querySelectorAll("td"))
      .map((td) =>
        Array.from(td.querySelectorAll("a, button")).filter(visible).map((el) => {
          const cs = getComputedStyle(el);
          const deco = cs.textDecorationLine !== "none" ? "underline" : parseFloat(cs.borderBottomWidth) > 0 ? "border" : "none";
          return `${cs.fontSize}|${deco}`;
        }),
      )
      .filter((row) => row.length >= 2);
    return {
      primaryButtons: Array.from(main.querySelectorAll('[class*="Button-module__"][class*="__primary"]')).filter(visible).length,
      background: [bg[0], bg[1], bg[2]] as [number, number, number],
      subtitle: subtitle && visible(subtitle) ? (subtitle.textContent ?? "").trim() : null,
      prose,
      rowActionStyles,
    };
  });
}

test("화면 사용성 원칙 점검(경고만)", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID, withTeam: true });
  const user = await findUserByEmail(SYSTEM_VIEWER, admin.email);
  if (!user) throw new Error("픽스처 사용자가 없습니다");
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `원칙점검본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: org.id, name: `원칙점검팀-${randomUUID().slice(0, 6)}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `원칙점검거래처-${randomUUID().slice(0, 6)}`, normalizedName: `원칙점검-${randomUUID()}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: user.id, name: `원칙점검-${randomUUID().slice(0, 6)}` });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);

  const routes = ["/", "/projects", `/projects/${project.id}`, "/admin/vendors", "/admin/vendors?new=1", "/expenses", "/cards", "/approvals", "/notifications", "/account"];
  const report: Array<{ route: string; warnings: Warning[] }> = [];
  for (const route of routes) {
    const res = await page.goto(route);
    const status = res?.status() ?? 0;
    if (status === 0 || status >= 400) {
      // 열리지 않은 화면은 조용히 건너뛰지 않는다 — 경고로 남기고 막는 모드에서는 실패시킨다
      test.info().annotations.push({ type: "원칙 점검 건너뜀", description: `${route} — 응답 ${status}` });
      console.log(`  ${route} · 건너뜀 · 응답 ${status}`);
      if (STRICT) expect.soft(status, `${route} 응답`).toBeLessThan(400);
      continue;
    }
    await page.waitForLoadState("networkidle");
    const warnings = evaluatePrinciples(await snapshot(page));
    report.push({ route, warnings });
    for (const w of warnings) test.info().annotations.push({ type: `원칙 경고 ${w.rule}`, description: `${route} — ${w.detail}` });
  }
  const total = report.reduce((n, r) => n + r.warnings.length, 0);
  console.log(`[화면 사용성 원칙] 화면 ${report.length}개 · 경고 ${total}건${STRICT ? " (막는 모드)" : " (경고만)"}`);
  for (const r of report) for (const w of r.warnings) console.log(`  ${r.route} · ${w.rule} · ${w.detail}`);
  expect(report.length, "점검한 화면이 하나도 없다").toBeGreaterThan(0);
  if (STRICT) for (const r of report) expect.soft(r.warnings, r.route).toEqual([]);
});
