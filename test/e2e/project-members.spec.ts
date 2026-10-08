import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { waitForCardUsageSection } from "./fixtures";
import { loginPage, type Person } from "./leave-org";
import { setupMembersE2E, type MembersE2E } from "./project-members-fixture";

// 06.2-12(SC-5 · UI-SPEC S2): 프로젝트 상세 「참여자」 섹션 — 담당 PM 첫 행 · 떼기(확인 창 없음) · 되돌리기(보관 해제) · 퇴직 태그 · 권리 없음 · 완료.
// 세계는 도메인 함수로 만든다(project-members-fixture.ts).

function membersSection(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "참여자", exact: true }) });
}

function memberRow(page: Page, person: Person): Locator {
  return membersSection(page).getByRole("row").filter({ hasText: person.name });
}

async function openDetail(browser: import("@playwright/test").Browser, baseURL: string | undefined, fx: MembersE2E, viewer: Person): Promise<Page> {
  const page = await loginPage(browser, baseURL, viewer);
  await page.goto(`/projects/${fx.projectId}`);
  await waitForCardUsageSection(page);
  return page;
}

test.describe("참여자 섹션(S2)", () => {
  test("팀장 — 섹션은 법인카드 사용 뒤 · 차수 앞, 첫 행은 담당 PM(떼기 없음), 그 아래 참여자 행(이름 · 팀 · 떼기)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const titles = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(titles.indexOf("법인카드 사용")).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf("참여자")).toBe(titles.indexOf("법인카드 사용") + 1);
    expect(titles.indexOf("차수")).toBe(titles.indexOf("참여자") + 1);

    const section = membersSection(page);
    const table = section.getByRole("table", { name: "참여자" });
    const bodyRows = table.locator("tbody > tr");
    const first = bodyRows.first();
    await expect(first).toContainText(fx.pm.name);
    await expect(first).toContainText("담당 PM");
    await expect(first.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    const zRow = memberRow(page, fx.z);
    await expect(zRow).toContainText(fx.otherTeamName);
    await expect(zRow.getByRole("button", { name: /떼기/ })).toBeVisible();
    await page.context().close();
  });

  test("떼기 — 확인 창 없이 행이 사라지고 제목 아래 · 표 위 결과 줄 `{이름} 뗌` + `되돌리기` 포커스 · 새로 고침해도 없다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(memberRow(page, fx.z)).toHaveCount(0);
    const status = section.getByRole("status");
    await expect(status).toContainText(`${fx.z.name} 뗌`);
    const undo = status.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    const heading = await section.getByRole("heading", { name: "참여자", exact: true }).boundingBox();
    const line = await status.boundingBox();
    const table = await section.getByRole("table", { name: "참여자" }).boundingBox();
    expect(heading && line && table).toBeTruthy();
    expect(heading!.y).toBeLessThan(line!.y);
    expect(line!.y).toBeLessThan(table!.y);
    await page.reload();
    await waitForCardUsageSection(page);
    await expect(memberRow(page, fx.z)).toHaveCount(0);
    await page.context().close();
  });

  test("되돌리기 — 같은 자리에 돌아오고 그 행 `떼기`가 포커스 · 결과 줄 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await section.getByRole("status").getByRole("button", { name: "되돌리기" }).click();
    const zRow = memberRow(page, fx.z);
    await expect(zRow).toBeVisible();
    await expect(zRow.getByRole("button", { name: /떼기/ })).toBeFocused();
    await expect(section.getByRole("status")).toHaveCount(0);
    // 붙인 순(담당 PM → Z → R → A)에서 Z는 담당 PM 바로 아래.
    await expect(section.getByRole("table", { name: "참여자" }).locator("tbody > tr").nth(1)).toContainText(fx.z.name);
    await page.context().close();
  });

  test("퇴직 참여자 — 이름 뒤 `퇴직` 글자 태그 · `떼기` 있음 → 떼기 → 되돌리기 → `퇴직` 태그 그대로 같은 자리에 돌아온다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    const rRow = memberRow(page, fx.r);
    await expect(rRow).toContainText("퇴직");
    await expect(rRow.getByRole("button", { name: /떼기/ })).toBeVisible();
    await rRow.getByRole("button", { name: /떼기/ }).click();
    await expect(memberRow(page, fx.r)).toHaveCount(0);
    await section.getByRole("status").getByRole("button", { name: "되돌리기" }).click();
    await expect(memberRow(page, fx.r)).toContainText("퇴직");
    await expect(memberRow(page, fx.r).getByRole("button", { name: /떼기/ })).toBeFocused();
    await page.context().close();
  });

  test("참여자 본인 — 섹션 · 표(담당 PM 행 포함)는 보이고 `떼기` · 표 아래 3차가 없다(D-6213)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.z);
    const section = membersSection(page);
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await expect(section.getByRole("row").filter({ hasText: fx.pm.name })).toContainText("담당 PM");
    await expect(section.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await expect(section.getByRole("columnheader")).toHaveText(["이름", "팀"]);
    await page.context().close();
  });

  test("완료 프로젝트 — 팀장 화면에 `떼기`가 없고 섹션 안에 `완료 · 참여자 잠김` 글자가 없다(D-6212 — 잠김 줄 없음)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await expect(section.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    await expect(section.getByText("완료 · 참여자 잠김")).toHaveCount(0);
    await expect(section.getByText("참여자 잠김")).toHaveCount(0);
    await page.context().close();
  });
});
