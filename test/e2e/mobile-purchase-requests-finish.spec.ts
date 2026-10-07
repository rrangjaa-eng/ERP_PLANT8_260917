import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "@/db/client";
import { purchaseRequests } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-14 폰 구매 요청 목록 — 행동 칸은 폰에서 숨고(06-12 D-1) 행 탭 시트가 본인 `요청 취소`를 맡는다. 그룹 머리 · 합계 줄이 있어도 가로 넘침 0.

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

// 구매 권한자(`cards.purchases` write) — 새 팀.
async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E폰처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰처리팀-${suffix}` });
  return makePerson("폰처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

async function seedRequest(requestedBy: string, number: string, itemName: string): Promise<void> {
  await db.insert(purchaseRequests).values({ number, linkKind: "team_cost", requestedBy, itemName, estimateAmountKrw: 33_000 });
}

test.describe("폰 구매 요청 (06-14)", () => {
  test("320 — 행 탭 시트의 `요청 취소` → 결과 줄 `되돌리기` · 그룹 머리 · 합계 줄 · 가로 넘침 0", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰마감본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰마감팀-${suffix}` });
    const person = await makePerson("폰마감", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
    const number = `TCPH${suffix.slice(0, 6)}`;
    await db.insert(purchaseRequests).values({
      number,
      linkKind: "team_cost",
      requestedBy: person.viewer.id,
      itemName: "폰 마감 물건",
      estimateCurrency: "USD",
      estimateForeignAmount: "900",
      estimateFxRate: "1474.89",
      estimateAmountKrw: 1_327_401,
    });

    const page = await loginPage(browser, baseURL, person, { width: 320, height: 640 });
    await page.goto("/cards/purchases");
    const summary = page.getByRole("region", { name: "합계" });
    await expect(summary).toContainText("합계 (신청됨 · 1건)");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // 행동 칸은 폰에서 숨어 있다 — 표 안 `요청 취소`는 보이지 않는다.
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row.getByRole("button", { name: `${number} 요청 취소` })).toBeHidden();
    const tap = page.getByRole("button", { name: `${number} 상세 보기` });
    await waitForHydration(tap);
    await tap.click();
    const sheet = page.getByRole("dialog", { name: "폰 마감 물건" });
    await expect(sheet).toBeVisible();
    const cancel = sheet.getByRole("button", { name: `${number} 요청 취소` });
    await cancel.click();

    const line = page.getByRole("status").filter({ hasText: `구매 요청 취소됨 · ${number}` });
    await expect(line).toBeVisible();
    await expect(sheet).toBeHidden();
    const undo = line.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeVisible();
    // 시트가 닫힌 뒤 포커스는 `되돌리기`(PC와 같게 — DOM D-2).
    await expect(undo).toBeFocused();
    // 되돌리기 누르는 영역 44px(--touch-min).
    const box = await undo.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // 되돌리기 → 행이 돌아오고 포커스는 그 행(폰은 행동 칸이 숨어 행 탭 자리)으로(DOM D-3a).
    await undo.click();
    await expect(line).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${number} 상세 보기` })).toBeFocused();
    await page.context().close();
  });

  test("375 — 구매 권한자: `신청됨` 행 탭 → S13 패널의 `요청 취소` — 남의 요청은 사유 창 → 성공 뒤 패널 닫힘 · 포커스 화면 제목 / 본인 요청은 즉시 → `되돌리기` 포커스 (검토 I-1 · DOM D-1)", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const buyer = await makePurchaser();
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰요청본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰요청팀-${suffix}` });
    const requester = await makePerson("폰요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
    const othersNumber = `TCPO${suffix.slice(0, 6)}`;
    const ownNumber = `TCPB${suffix.slice(0, 6)}`;
    await seedRequest(requester.viewer.id, othersNumber, "폰 남의 물건");
    await seedRequest(buyer.viewer.id, ownNumber, "폰 내 물건");

    const page = await loginPage(browser, baseURL, buyer, { width: 375, height: 700 });
    await page.goto("/cards/purchases");
    const panel = page.getByRole("dialog", { name: "구매 완료" });

    // 남의 요청 — 탭 = S13(06-12 유지) · 패널 안 `요청 취소` → 사유 창(PC와 같은 흐름).
    const tapOthers = page.getByRole("button", { name: `${othersNumber} 상세 보기` });
    await waitForHydration(tapOthers);
    await tapOthers.click();
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/purchase=/);
    await panel.getByRole("button", { name: `${othersNumber} 요청 취소` }).click();
    const dialog = page.getByRole("dialog", { name: "구매 요청 취소" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: /^구매 요청 취소/ });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    const reason = dialog.getByLabel("사유");
    await reason.fill("폰 중복 요청");
    await reason.press("Control+Enter");
    await expect(dialog).toHaveCount(0);
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${othersNumber} 상세 보기` })).toHaveCount(0);
    await expect(page.locator('[data-ui="screen-title"]')).toBeFocused();
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);

    // 본인 요청 — 확인 창 없이 즉시 · 패널이 닫히고 결과 줄 `되돌리기`가 포커스를 받는다.
    const tapOwn = page.getByRole("button", { name: `${ownNumber} 상세 보기` });
    await tapOwn.click();
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: `${ownNumber} 요청 취소` }).click();
    const line = page.getByRole("status").filter({ hasText: `구매 요청 취소됨 · ${ownNumber}` });
    await expect(line).toBeVisible();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(line.getByRole("button", { name: "되돌리기" })).toBeFocused();
    await page.context().close();
  });

  test("[183 m-4] 375 — S13 패널의 본인 `요청 취소`가 서버에서 거부되면 패널은 열린 채 · 패널 안 오류 한 줄", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const buyer = await makePurchaser();
    const ownNumber = `TCPF${suffix.slice(0, 6)}`;
    await seedRequest(buyer.viewer.id, ownNumber, "폰 실패 물건");

    const page = await loginPage(browser, baseURL, buyer, { width: 375, height: 700 });
    await page.goto("/cards/purchases");
    const panel = page.getByRole("dialog", { name: "구매 완료" });
    const tapOwn = page.getByRole("button", { name: `${ownNumber} 상세 보기` });
    await waitForHydration(tapOwn);
    await tapOwn.click();
    await expect(panel).toBeVisible();
    // 패널을 연 뒤 다른 저장이 먼저 된다(version + 1) — 서버가 `다른 저장이 먼저 됨 · 새로 고침`으로 거부한다.
    await db.update(purchaseRequests).set({ version: sql`${purchaseRequests.version} + 1` }).where(eq(purchaseRequests.number, ownNumber));
    await panel.getByRole("button", { name: `${ownNumber} 요청 취소` }).click();
    await expect(panel.getByRole("alert")).toHaveText("다른 저장이 먼저 됨 · 새로 고침");
    await expect(panel).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await page.context().close();
  });
});

