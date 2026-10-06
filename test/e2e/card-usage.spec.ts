import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { searchLinesForCardLink } from "@/domain/corp-card-usages/link-targets";
import { createExpenseFromLines } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";
import { submitReadyDraft } from "../integration/fixtures/expenses";

// 06-05(EXP-07 · UI-SPEC S8 · S9): 법인카드 사용 — 직원 본인 등록 → 옆 패널 → 뒤 목록 카드 그룹.
// 사람 · 팀 · 카드는 도메인 함수로 만든다(스펙마다 전용 본부 · 팀).

type CardHolder = { person: Person; teamId: string; teamName: string; cardLabel: string; issuer: string; cardIds: string[] };

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
  return { person, teamId: team.id, teamName, cardLabel, issuer, cardIds };
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

// 06-07: 카드 소지자가 담당 PM인 프로젝트 하나 · 견적 줄 하나(실행가 2,000,000) — 도메인 함수로.
async function seedProjectLine(
  holder: CardHolder,
): Promise<{ projectId: string; projectName: string; projectNumber: string; itemName: string; lineId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E카드클라이언트-${suffix}`, normalizedName: `e2e카드클라이언트-${suffix}` });
  const year = seoulToday().slice(0, 4);
  const projectName = `E2E카드연결-${suffix}`;
  const project = await createProject(holder.person.viewer, {
    clientId: client.id,
    teamId: holder.teamId,
    pmUserId: holder.person.viewer.id,
    name: projectName,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const itemName = `현장 소모품-${suffix}`;
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
  if (!line) throw new Error("견적 줄이 없습니다");
  return { projectId: project.id, projectName, projectNumber: project.number, itemName, lineId: line.id };
}

// 06-07: 견적 줄에 이은 카드 사용 한 건(본인 등록 · 카드 전표 — 공급가 = 결제 합계) — 도메인 함수로.
async function seedLineUsage(viewer: Person["viewer"], cardId: string, lineId: string, amount: number): Promise<void> {
  const input = {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "quote_line" as const,
    lineId,
    memo: null,
  };
  await createCardUsage(viewer, input, await precheckCardUsage(viewer, input));
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
  test("[06-07 트레이서] 연결 `견적 줄` → 프로젝트 바꾸기 → 견적 줄 바꾸기 → `이 줄로` → 줄 아래 `남은 실행가` → Ctrl+Enter → 결과 한 줄", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("1100000");
    await sheet.getByRole("radio", { name: "견적 줄" }).check();

    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(target.projectName);
    await projects.getByRole("option", { name: new RegExp(target.projectName) }).click();
    await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await expect(projects).toBeHidden();
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();

    await expect(sheet.getByRole("button", { name: "견적 줄 바꾸기" })).toBeFocused();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await lines.getByRole("option", { name: new RegExp(target.itemName) }).click();
    await lines.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(lines).toBeHidden();
    await expect(sheet.getByText(target.itemName, { exact: true })).toBeVisible();
    // 연결 0건 — `카드 사용` · `구매 요청` 부분 없음.
    await expect(sheet.getByText("남은 실행가 2,000,000", { exact: true })).toBeVisible();

    await amount.press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 1,100,000");
    await expect(page.getByRole("table").getByText("1,100,000", { exact: true })).toHaveCount(1);

    // M-4 — 방금 등록 = 직전 등록: 종류 · 프로젝트는 남고 견적 줄은 빈다 → 1차 비활성 + `연결 없음 · 연결 고르기`.
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "견적 줄 바꾸기" })).toHaveText("고르기");
    await amount.fill("1000");
    await expect(sheet.getByText("연결 없음 · 연결 고르기", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^카드 사용 등록/ })).toBeDisabled();
    await page.context().close();
  });

  test("[06-07 M-4] `?new=1&line={id}` → 그 줄 채움 · `?new=1&project={id}` → 그 프로젝트 · 줄 빔", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const page = await loginPage(browser, baseURL, holder.person);

    await page.goto(`/cards?new=1&line=${target.lineId}`);
    const sheet = panel(page);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await expect(sheet.getByText(target.itemName, { exact: true })).toBeVisible();
    await expect(sheet.getByText("남은 실행가 2,000,000", { exact: true })).toBeVisible();

    await page.goto(`/cards?new=1&project=${target.projectId}`);
    const reopened = panel(page);
    await waitForHydration(reopened.getByLabel("결제 합계"));
    await expect(reopened.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(reopened.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await expect(reopened.getByRole("button", { name: "견적 줄 바꾸기" })).toHaveText("고르기");
    await expect(reopened.getByText(target.itemName, { exact: true })).toHaveCount(0);
    await page.context().close();
  });

  test("[06-07 S10] 견적 줄 고르기 — 반대쪽 지출결의 줄 · 실행가 소진 줄은 `aria-disabled` + 2행 이유", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const card = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `신한-${randomUUID().slice(0, 8)}`,
      numberLast4: "4321",
      label: `E2E카드-${randomUUID().slice(0, 8)}`,
      kind: "personal",
      holderUserId: fx.pm.viewer.id,
    });
    if (!card.id) throw new Error("카드 id 없음");
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
    await submitReadyDraft(fx.pm.viewer, created.created[0]?.expenseId ?? "");
    const before = await searchLinesForCardLink(fx.pm.viewer, { projectId: fx.projectId, query: "", currentLineId: null });
    const hold = before.rows.find((row) => row.id === fx.lines.hold.id);
    await seedLineUsage(fx.pm.viewer, card.id, fx.lines.hold.id, hold?.remainingKrw ?? 0);

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    await sheet.getByRole("radio", { name: "견적 줄" }).check();
    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(fx.projectName);
    await projects.getByRole("option", { name: new RegExp(fx.projectName) }).click();
    await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    const opposite = lines.getByRole("option", { name: new RegExp(fx.lines.tracer.itemName) });
    const exhausted = lines.getByRole("option", { name: new RegExp(fx.lines.hold.itemName) });
    await expect(opposite).toHaveAttribute("aria-disabled", "true");
    await expect(opposite).toContainText("지출결의 ");
    await expect(exhausted).toHaveAttribute("aria-disabled", "true");
    await expect(exhausted).toContainText("실행가 소진 · 다른 줄");
    await page.context().close();
  });

  test("[06-07 견적 외 비용] 고를 수 있는 줄 0 → 3차 `견적 외 비용으로` → 라디오가 바뀌고 목록만 닫힘 → 저장 → 상세 견적 표에 새 줄", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    await seedLineUsage(holder.person.viewer, holder.cardIds[0] ?? "", target.lineId, 2_000_000);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("30000");
    await sheet.getByRole("radio", { name: "견적 줄" }).check();
    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(target.projectName);
    await projects.getByRole("option", { name: new RegExp(target.projectName) }).click();
    await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await expect(lines.getByText("이을 수 있는 줄 없음", { exact: true })).toBeVisible();
    await expect(lines.getByRole("button", { name: /^이 줄로/ })).toBeDisabled();
    await lines.getByRole("button", { name: "견적 외 비용으로" }).click();
    await expect(lines).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("radio", { name: "견적 외 비용" })).toBeChecked();
    await expect(amount).toHaveValue("30,000");

    const item = `현장 다과-${randomUUID().slice(0, 6)}`;
    await sheet.getByLabel("항목").fill(item);
    await expect(sheet.getByText("저장하면 견적 외 비용 줄 생김 · 실행가 30,000", { exact: true })).toBeVisible();
    await amount.press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 30,000");

    await page.goto(`/projects/${target.projectId}`);
    await expect(page.getByText(item).first()).toBeVisible();
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

  test("[DOM 감사 D2] 「가맹점 바꾸기」로 가맹점만 고른 뒤 Esc → 「입력 버리기」", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const vendorName = `E2E가맹점-${randomUUID().slice(0, 8)}`;
    await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const change = sheet.getByRole("button", { name: "가맹점 바꾸기" });
    await waitForHydration(change);
    await change.click();
    const dialog = page.getByRole("dialog", { name: "가맹점 바꾸기" });
    await dialog.getByRole("textbox", { name: "거래처 이름 검색" }).fill(vendorName);
    await dialog.getByRole("option", { name: new RegExp(vendorName) }).click();
    await dialog.getByRole("button", { name: /^이 거래처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(sheet.getByText(vendorName, { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeVisible();
    await expect(sheet).toBeVisible();
    await page.context().close();
  });

  test("[DOM 감사 O2] 아주 긴 카드 이름 — 1280에서 카드 필터 select 폭은 `--field-w-short`(280) 이하 · 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder(0);
    const longLabel = `긴카드${"가".repeat(90)}`;
    await createCorpCard(SYSTEM_VIEWER, { issuer: `국민-${randomUUID().slice(0, 8)}`, numberLast4: "9876", label: longLabel, kind: "personal", holderUserId: holder.person.viewer.id });
    const page = await loginPage(browser, baseURL, holder.person, { width: 1280, height: 800 });
    await page.goto("/cards");
    const cardFilter = page.getByLabel("카드", { exact: true });
    await expect(cardFilter.locator("option", { hasText: longLabel })).toHaveCount(1);
    const width = await cardFilter.evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(280);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.context().close();
  });
});

function cardSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "법인카드 사용", exact: true }) });
}

test.describe("프로젝트 상세 「법인카드 사용」 (06-07 S15)", () => {
  test("견적 줄 · 견적 외 비용 카드 사용 행 + 합계 행 `합계 (N건) · 결제 합계`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    await seedLineUsage(holder.person.viewer, holder.cardIds[0] ?? "", target.lineId, 300_000);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto(`/projects/${target.projectId}`);
    const section = cardSection(page);
    await expect(section.getByRole("cell", { name: `1 ${target.itemName}` })).toBeVisible();
    await expect(section.getByRole("columnheader", { name: "결제 합계" })).toBeVisible();
    await expect(section.locator("tfoot")).toHaveText("합계 (1건) · 결제 합계 300,000");
    await page.context().close();
  });

  test("`quote.amount` 없는 계정 → 금액 열 · 합계 금액 없음", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    await seedLineUsage(holder.person.viewer, holder.cardIds[0] ?? "", target.lineId, 300_000);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E금액숨김-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const viewer = await makePerson("금액숨김", role.id, holder.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const page = await loginPage(browser, baseURL, viewer);
    await page.goto(`/projects/${target.projectId}`);
    const section = cardSection(page);
    await expect(section.getByRole("cell", { name: `1 ${target.itemName}` })).toBeVisible();
    await expect(section.getByRole("columnheader", { name: "결제 합계" })).toHaveCount(0);
    await expect(section.locator("tfoot")).toHaveText("합계 (1건)");
    await expect(section.getByText("300,000")).toHaveCount(0);
    await page.context().close();
  });

  test("빈 섹션 `카드 사용 등록` → `/cards?new=1&project=` 패널이 그 프로젝트로 열림", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto(`/projects/${target.projectId}`);
    const section = cardSection(page);
    await expect(section.getByText("이 프로젝트에 카드 사용이 없습니다")).toBeVisible();
    await section.getByRole("link", { name: "카드 사용 등록" }).click();
    await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&project=${target.projectId}$`));
    const sheet = panel(page);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("섹션 로드 실패(서버 액션 가로채기) → `카드 사용 불러오지 못함 · 다시 시도` · 매출 섹션은 선다 → 다시 시도로 복귀", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    const failActions = (route: import("@playwright/test").Route) =>
      route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.fallback();
    await page.route("**/*", failActions);
    await page.goto(`/projects/${target.projectId}`);
    const section = cardSection(page);
    await expect(section.getByText("카드 사용 불러오지 못함")).toBeVisible();
    await expect(page.getByRole("heading", { name: "매출", exact: true })).toBeVisible();
    await page.unroute("**/*", failActions);
    await section.getByRole("button", { name: "다시 시도" }).click();
    await expect(section.getByText("이 프로젝트에 카드 사용이 없습니다")).toBeVisible();
    await page.context().close();
  });
});

