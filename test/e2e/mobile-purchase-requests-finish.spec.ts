import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "@/db/client";
import { purchaseRequests } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration } from "./leave-org";

// 06-14 폰 구매 요청 목록 — 행동 칸은 폰에서 숨고(06-12 D-1) 행 탭 시트가 본인 `요청 취소`를 맡는다. 그룹 머리 · 합계 줄이 있어도 가로 넘침 0.

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
    // 되돌리기 누르는 영역 44px(--touch-min).
    const box = await undo.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.context().close();
  });
});
