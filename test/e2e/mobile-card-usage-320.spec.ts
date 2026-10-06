import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-05 DOM 감사 D1 · O1 — 폰 카드 사용 목록 · 등록 패널 실측(DOM).
// D1: 320에서 외화 행 2행(`USD 900.00 @1,474.89 · 공급가 1,327,401`)이 한 줄 nowrap이라 문서가 34px 넘쳤다 — 묶음 사이에서만 꺾인다.
// O1: 폰 연결 라디오의 눌림 면이 글자 줄(66×18)뿐이었다 — 라벨이 행 높이 44 이상을 채운다.

async function makeHolder(): Promise<{ person: Person; cardId: string; teamId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰카드본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰카드팀-${suffix}` });
  const person = await makePerson("폰카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "4321", label: `E2E폰카드-${suffix}`, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  return { person, cardId: card.id, teamId: team.id };
}

test.describe("폰 카드 사용 (06-05 DOM 감사)", () => {
  test("[D1] 320 — 외화 행 2행은 묶음 사이에서만 꺾이고 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const { person, cardId } = await makeHolder();
    const input: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "USD", amount: 900, fxRate: 1474.89 },
      // 계산서(규칙 없음) — 공급가 = 결제 합계. `카드 전표`는 #177부터 부가세 10%.
      evidenceTypeCode: "invoice",
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

  test("[06-07 DOM 감사 D-1] 320 — 긴 프로젝트 · 항목 이름의 견적 줄 연결 칸은 한 줄 말줄임 + title · 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰클라이언트-${suffix}`, normalizedName: `e2e폰클라이언트-${suffix}` });
    const projectName = `E2E폰카드연결 아주 긴 프로젝트 이름 가을 브랜드 팝업스토어 운영-${suffix}`;
    const project = await createProject(person.viewer, { clientId: client.id, teamId, pmUserId: person.viewer.id, name: projectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    const itemName = `현장 소모품 및 운영 인력 식대 · 다과 · 음료 일체-${suffix}`;
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    if (!line) throw new Error("견적 줄 없음");
    const input: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW", amount: 30_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      lineId: line.id,
      memo: null,
    };
    await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));

    const page = await loginPage(browser, baseURL, person, { width: 320, height: 640 });
    await page.goto("/cards");
    const label = `${projectName} · 1 ${itemName}`;
    const cell = page.getByRole("table").locator(`[title="${label}"]`);
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveText(label);
    // 한 줄 — 칸 안에서 말줄임(scrollWidth > clientWidth), 문서는 넘치지 않는다.
    expect(await cell.evaluate((element) => element.getClientRects().length)).toBe(1);
    expect(await cell.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.context().close();
  });

  test("[O1] 375 — 연결 라디오는 라벨 전체(높이 44 이상)가 눌림 면", async ({ browser, baseURL }) => {
    const { person } = await makeHolder();
    const page = await loginPage(browser, baseURL, person, { width: 375, height: 812 });
    await page.goto("/cards?new=1");
    const radio = page.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(radio);
    const label = page.getByRole("dialog", { name: "카드 사용 등록" }).locator("label", { has: radio });
    // 06-07부터 `팀 비용`은 셋째 라디오라 패널 본문 접힘 아래에 있다 — 화면 안으로 굴린 뒤 잰다(mouse.click은 굴리지 않는다).
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // 라벨 아래쪽 가장자리 근처를 눌러도 라디오가 켜진다(글자 줄 밖).
    await page.mouse.click((box?.x ?? 0) + 4, (box?.y ?? 0) + (box?.height ?? 0) - 4);
    await expect(radio).toBeChecked();
    await page.context().close();
  });
});
