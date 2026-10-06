import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-05 DOM 감사 D1 · O1 — 폰 카드 사용 목록 · 등록 패널 실측(DOM).
// D1: 320에서 외화 행 2행(`USD 900.00 @1,474.89 · 공급가 1,327,401`)이 한 줄 nowrap이라 문서가 34px 넘쳤다 — 묶음 사이에서만 꺾인다.
// O1: 폰 연결 라디오의 눌림 면이 글자 줄(66×18)뿐이었다 — 라벨이 행 높이 44 이상을 채운다.

async function makeHolder(): Promise<{ person: Person; cardId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰카드본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰카드팀-${suffix}` });
  const person = await makePerson("폰카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "4321", label: `E2E폰카드-${suffix}`, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  return { person, cardId: card.id };
}

test.describe("폰 카드 사용 (06-05 DOM 감사)", () => {
  test("[D1] 320 — 외화 행 2행은 묶음 사이에서만 꺾이고 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const { person, cardId } = await makeHolder();
    const input: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "USD", amount: 900, fxRate: 1474.89 },
      evidenceTypeCode: "card_receipt",
      linkKind: "team_cost",
      memo: null,
    };
    await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));

    const page = await loginPage(browser, baseURL, person, { width: 320, height: 640 });
    await page.goto("/cards");
    const table = page.getByRole("table");
    await expect(table.getByText("1,327,401", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    // 묶음 안에서는 꺾이지 않는다 — 각 묶음은 한 줄 높이다.
    for (const segment of ["USD 900.00", "@1,474.89", "공급가 1,327,401"]) {
      const box = table.getByText(segment, { exact: true });
      await expect(box).toHaveCount(1);
      const lines = await box.evaluate((element) => element.getClientRects().length);
      expect(lines, segment).toBe(1);
    }
    await page.context().close();
  });

  test("[O1] 375 — 연결 라디오는 라벨 전체(높이 44 이상)가 눌림 면", async ({ browser, baseURL }) => {
    const { person } = await makeHolder();
    const page = await loginPage(browser, baseURL, person, { width: 375, height: 812 });
    await page.goto("/cards?new=1");
    const radio = page.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(radio);
    const label = page.getByRole("dialog", { name: "카드 사용 등록" }).locator("label", { has: radio });
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // 라벨 아래쪽 가장자리 근처를 눌러도 라디오가 켜진다(글자 줄 밖).
    await page.mouse.click((box?.x ?? 0) + 4, (box?.y ?? 0) + (box?.height ?? 0) - 4);
    await expect(radio).toBeChecked();
    await page.context().close();
  });
});
