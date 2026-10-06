import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-05(EXP-07 · UI-SPEC S8 · S9): 법인카드 사용 — 직원 본인 등록 → 옆 패널 → 뒤 목록 카드 그룹.
// 사람 · 팀 · 카드는 도메인 함수로 만든다(스펙마다 전용 본부 · 팀).

type CardHolder = { person: Person; teamName: string; cardLabel: string };

async function makeCardHolder(cards = 1): Promise<CardHolder> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E카드본부-${suffix}` });
  const teamName = `E2E카드팀-${suffix}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
  const person = await makePerson("카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const cardLabel = `E2E카드-${suffix}`;
  for (let index = 0; index < cards; index += 1) {
    await createCorpCard(SYSTEM_VIEWER, {
      issuer: "신한",
      numberLast4: String(4321 + index),
      label: index === 0 ? cardLabel : `${cardLabel}-${index + 1}`,
      kind: "personal",
      holderUserId: person.viewer.id,
    });
  }
  return { person, teamName, cardLabel };
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: "카드 사용 등록" });
}

test.describe("법인카드 사용 등록 (06-05)", () => {
  test("카드 소지 직원 — 1차 `카드 사용 등록` → 옆 패널 · 팀 비용 · Ctrl+Enter → 패널 유지 · 결과 한 줄 · 뒤 목록 행", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");

    const open = page.getByRole("link", { name: "카드 사용 등록" });
    await waitForHydration(open);
    await open.click();
    await expect(page).toHaveURL(/\/cards\?new=1$/);
    const sheet = panel(page);
    await expect(sheet).toBeVisible();

    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("1240000");
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await expect(sheet.getByText(holder.teamName, { exact: true })).toBeVisible();
    await amount.press("Control+Enter");

    const status = sheet.getByRole("status");
    await expect(status).toHaveText("카드 사용 등록됨 · 1,240,000");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/cards\?new=1$/);
    await expect(sheet.getByLabel("사용일")).toBeFocused();
    await expect(sheet.getByRole("button", { name: "되돌리기" })).toHaveCount(0);

    // 뒤 목록(패널이 열린 동안 inert) — 그 카드 그룹에 행이 서고 연결은 `팀 비용 · {팀}`.
    const table = page.getByRole("table");
    await expect(table.getByText(`${holder.cardLabel} · 신한 4321`)).toHaveCount(1);
    await expect(table.getByText(`팀 비용 · ${holder.teamName}`)).toHaveCount(1);
    await expect(table.getByText("1,240,000", { exact: true })).toHaveCount(1);

    // 결재 없음 · 행동 로그 document_create 한 줄(D-608).
    const logs = await db
      .select({ entity: actionLog.entity })
      .from(actionLog)
      .where(and(eq(actionLog.actorId, holder.person.viewer.id), eq(actionLog.actionType, "document_create")));
    expect(logs).toEqual([{ entity: "corp_card_usage" }]);
    await page.context().close();
  });
});
