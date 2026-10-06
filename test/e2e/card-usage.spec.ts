import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-05(EXP-07 · UI-SPEC S8 · S9): 법인카드 사용 — 직원 본인 등록 → 옆 패널 → 뒤 목록 카드 그룹.
// 사람 · 팀 · 카드는 도메인 함수로 만든다(스펙마다 전용 본부 · 팀).

type CardHolder = { person: Person; teamName: string; cardLabel: string; issuer: string; cardIds: string[] };

async function makeCardHolder(cards = 1): Promise<CardHolder> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E카드본부-${suffix}` });
  const teamName = `E2E카드팀-${suffix}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
  const person = await makePerson("카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const cardLabel = `E2E카드-${suffix}`;
  // 발급사 + 뒤 4자리는 전역 UNIQUE — 스펙 사이 겹치지 않게 발급사에 접미사.
  const issuer = `신한-${suffix}`;
  const cardIds: string[] = [];
  for (let index = 0; index < cards; index += 1) {
    const card = await createCorpCard(SYSTEM_VIEWER, {
      issuer,
      numberLast4: String(4321 + index),
      label: index === 0 ? cardLabel : `${cardLabel}-${index + 1}`,
      kind: "personal",
      holderUserId: person.viewer.id,
    });
    if (!card.id) throw new Error("카드 id 없음");
    cardIds.push(card.id);
  }
  return { person, teamName, cardLabel, issuer, cardIds };
}

// 목록 화면 상태를 만들 카드 사용 한 건 — 화면이 아니라 도메인 함수로(본인 등록 · 팀 비용).
async function seedUsage(holder: CardHolder, amount: number): Promise<void> {
  const input = {
    corpCardId: holder.cardIds[0] ?? "",
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost" as const,
    memo: null,
  };
  const pre = await precheckCardUsage(holder.person.viewer, input);
  await createCardUsage(holder.person.viewer, input, pre);
}

function previousMonth(): string {
  const [year, month] = seoulToday().slice(0, 7).split("-").map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
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
    await expect(table.getByText(`${holder.cardLabel} · ${holder.issuer} 4321`)).toHaveCount(1);
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
  test("외화 카드 사용 — USD 900.00 @1,474.89 → 서버 원화 1,327,401 · 목록 2행 `USD 900.00 @1,474.89 · 공급가 …`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);

    await sheet.getByLabel("통화").selectOption("USD");
    await sheet.getByLabel("결제 합계").fill("900");
    await sheet.getByLabel("환율").fill("1474.89");
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await expect(sheet.locator('[data-ui="card-calc-line"]')).toHaveText("공급가 1,327,401 · 규칙 없음");
    await sheet.getByLabel("환율").press("Control+Enter");

    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 1,327,401");
    const table = page.getByRole("table");
    await expect(table.getByText("1,327,401", { exact: true })).toHaveCount(1);
    await expect(table.getByText("USD 900.00 @1,474.89 · 공급가 1,327,401", { exact: true })).toHaveCount(1);
    await page.context().close();
  });

  test("사용일 칸 `max` = 오늘(KST — Q6)", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const usedOn = panel(page).getByLabel("사용일");
    await expect(usedOn).toHaveAttribute("max", seoulToday());
    await expect(usedOn).toHaveValue(seoulToday());
    await page.context().close();
  });

  test("쓸 카드 0장 직원 → Empty `쓸 수 있는 법인카드가 없습니다 · 카드 등록은 관리자` · 1차 없음 · `?new=1`에도 패널 없음", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder(0);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");
    await expect(page.getByText("쓸 수 있는 법인카드가 없습니다 · 카드 등록은 관리자")).toBeVisible();
    await expect(page.getByRole("link", { name: "카드 사용 등록" })).toHaveCount(0);
    await page.goto("/cards?new=1");
    await expect(panel(page)).toHaveCount(0);
    await page.context().close();
  });

  test("필터 이동은 GET 쿼리 — 연결 `팀 비용` → `?link=team` · 합계 면 · 지난달 0건 → `조건에 맞는 카드 사용이 없습니다` · `필터 지우기`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    await seedUsage(holder, 48_000);
    await seedUsage(holder, 12_000);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");

    const summary = page.getByRole("region", { name: "합계" });
    await expect(summary).toContainText(`합계 (${seoulToday().slice(0, 7)} · 2건)`);
    await expect(summary).toContainText("결제 합계60,000");

    const link = page.getByLabel("연결", { exact: true });
    await waitForHydration(link);
    await link.selectOption({ label: "팀 비용" });
    await expect(page).toHaveURL(/[?&]link=team(&|$)/);
    await expect(page.getByRole("table").getByText(`팀 비용 · ${holder.teamName}`)).toHaveCount(2);

    const month = page.getByLabel("월", { exact: true });
    await waitForHydration(month);
    await month.selectOption(previousMonth());
    await expect(page).toHaveURL(new RegExp(`[?&]month=${previousMonth()}(&|$)`));
    await expect(page.getByText("조건에 맞는 카드 사용이 없습니다")).toBeVisible();
    // 필터 0건은 빈 목록이 아니다 — 머리 1차가 남는다(ListScreen DR5).
    await expect(page.getByRole("link", { name: "카드 사용 등록" })).toHaveCount(1);
    await page.getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.getByRole("table").getByText(`팀 비용 · ${holder.teamName}`)).toHaveCount(2);
    await page.context().close();
  });

  test("[M-4 · M-5] 처음 쓰는 두 장 직원 → 카드 · 연결 비어 열림 / 카드 B · 팀 비용 등록 → 패널 유지 · 카드 B · 팀 비용 · 오늘 / 다시 열어도 같은 기본값", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder(2);
    const cardB = `${holder.cardLabel}-2 · ${holder.issuer} 4322`;
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const card = sheet.getByRole("combobox", { name: "카드", exact: true });
    const teamCost = sheet.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(card);
    await expect(sheet.getByLabel("사용일")).toHaveValue(seoulToday());
    await expect(card.locator("option:checked")).not.toHaveText(cardB);
    await expect(teamCost).not.toBeChecked();

    await card.selectOption({ label: cardB });
    await sheet.getByLabel("결제 합계").fill("48000");
    await teamCost.check();
    // M-5 — 팀 비용의 팀 이름은 값 텍스트, 연결 묶음 안에 힌트(Form.Hint = <p>)가 없다.
    await expect(sheet.getByText(holder.teamName, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: "연결" }).locator("p")).toHaveCount(0);
    await sheet.getByLabel("결제 합계").press("Control+Enter");

    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 48,000");
    await expect(card.locator("option:checked")).toHaveText(cardB);
    await expect(teamCost).toBeChecked();
    await expect(sheet.getByLabel("사용일")).toHaveValue(seoulToday());

    // 서버 기본값(cardUsageFormDefaults) — 다시 열면 직전 등록의 카드 · 연결.
    await page.goto("/cards");
    await page.goto("/cards?new=1");
    const reopened = panel(page);
    await waitForHydration(reopened.getByRole("combobox", { name: "카드", exact: true }));
    await expect(reopened.getByRole("combobox", { name: "카드", exact: true }).locator("option:checked")).toHaveText(cardB);
    await expect(reopened.getByRole("radio", { name: "팀 비용" })).toBeChecked();
    await expect(reopened.getByLabel("사용일")).toHaveValue(seoulToday());
    await page.context().close();
  });

  test("바뀐 칸 없음 → Esc로 바로 닫힘 · 포커스 = `카드 사용 등록` / 결제 합계를 적은 뒤 Esc → 「입력 버리기」", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");
    const open = page.getByRole("link", { name: "카드 사용 등록" });
    await waitForHydration(open);

    await open.click();
    await expect(panel(page)).toBeVisible();
    await waitForHydration(panel(page).getByLabel("결제 합계"));
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/cards$/);
    await expect(open).toBeFocused();

    await open.click();
    const amount = panel(page).getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("1000");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await page.context().close();
  });

  test("[검토 P3-4] 증빙 종류를 `—`로 비우면 `카드 전표`가 옵션에 있으니 빈 칸 이유 `증빙 종류 1칸 비어 있음 · 증빙 종류 고르기`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("1000");
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await sheet.getByLabel("증빙 종류").selectOption("");
    await expect(sheet.getByText("증빙 종류 1칸 비어 있음 · 증빙 종류 고르기", { exact: true })).toBeVisible();
    await expect(sheet.getByText("카드 전표 카드에 없음 · 증빙 종류 고르기")).toHaveCount(0);
    await page.context().close();
  });
});
