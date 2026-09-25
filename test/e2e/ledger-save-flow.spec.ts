import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// 04-22(S19 · DR-6 · D-68) — 저장 흐름. 화면이 본 상태와 서버 상태가 다르면 저장 전체가 거부되고, 화면이
// 새 상태로 다시 그려지며, 편집은 브라우저 보관본에서 복원 줄로 돌아온다. 04-30이 저장 중 잠금 케이스를
// 더한다. 계급 권한·정보 노출을 손으로 켜지 않는다(ENG-D2) — 시드만 쓴다.
//
// 편집하는 사람은 담당 PM이다: 사용자 결정 2026-09-25 「기간만 수정」으로 팀장은 projects 쓰기가 없어
// 견적 줄 셀을 고칠 수 없다. 동료 팀장은 다른 브라우저 컨텍스트에서 같은 프로젝트를 미수주로 닫는다.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeAccount(roleId: string, teamId: string): Promise<Account> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Employee", roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("저장 흐름 (04-22, S19)", () => {
  test("상태가 바뀐 뒤의 저장은 전부 거부 → 태그가 새 상태로 다시 그려지고 → 복원 줄로 편집이 돌아온다", async ({ page, browser }) => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E저장흐름-${randomUUID()}`, normalizedName: `e2e저장흐름-${randomUUID()}` });
    const name = `E2E저장흐름-${randomUUID().slice(0, 8)}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.userId, name });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    const firstItem = `첫 줄-${randomUUID().slice(0, 6)}`;
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: subcategory.value, itemName: firstItem, quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
      { subcategory: subcategory.value, itemName: `둘째 줄-${randomUUID().slice(0, 6)}`, quantity: 1, unitPrice: { currency: "KRW", amount: 2_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 900_000, fxRate: 1 } },
    ]);

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("수주중", { exact: true }).filter({ visible: true })).toBeVisible();

    const firstRow = page.locator("tbody tr").filter({ hasText: firstItem });
    const executionCell = firstRow.getByRole("gridcell").nth(7);
    await executionCell.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("777000");
    await page.keyboard.press("Enter");
    await expect(executionCell).toHaveText("777,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // 동료 팀장이 다른 브라우저 컨텍스트에서 같은 프로젝트를 미수주로 닫는다.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(other, lead);
    await other.goto(`/projects/${project.id}`);
    await other.getByRole("button", { name: "상태 바꾸기" }).click();
    await other.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^미수주/ }).click();
    await other.getByRole("dialog", { name: "미수주로 닫기" }).getByRole("button", { name: /^미수주로 닫기/ }).click();
    await expect(other.getByText(`미수주로 닫기 · ${project.number}`, { exact: true })).toBeVisible();
    await otherContext.close();

    await executionCell.focus();
    await page.keyboard.press("Control+s");

    await expect(page.locator("tfoot").getByText("상태가 미수주로 바뀜 · 전부 거부")).toBeVisible();
    await expect(page.getByText("미수주", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("저장 안 한 편집 1칸")).toBeVisible();
    await expect(executionCell).toHaveText("500,000");

    await page.getByRole("button", { name: "복원" }).click();
    await expect(executionCell).toHaveText("777,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const [saved] = await db.select().from(quoteLines).where(eq(quoteLines.itemName, firstItem));
    expect(Number(saved?.executionAmountKrw)).toBe(500_000);
  });
});
