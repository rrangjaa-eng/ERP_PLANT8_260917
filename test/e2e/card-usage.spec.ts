import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, quoteLines } from "@/db/schema";
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
import { setCorpCardArchived } from "@/repositories/corp-cards";
import { insertTempRole } from "./temp-roles";
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

// 06-07: 견적 줄에 이은 카드 사용 한 건(본인 등록 · 계산서 — 규칙 없음이라 공급가 = 결제 합계, `카드 전표`는 #177부터 부가세 10%) — 도메인 함수로.
async function seedLineUsage(viewer: Person["viewer"], cardId: string, lineId: string, amount: number): Promise<void> {
  const input = {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "invoice",
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
    // [DOM 감사 D-1] 뒤 목록 연결 칸 `{프로젝트} · {줄 번호} {항목}` — 한 줄(nowrap) · title 전문.
    const linkCell = page.getByRole("table").getByText(`${target.projectName} · 1 ${target.itemName}`, { exact: true });
    await expect(linkCell).toHaveCount(1);
    await expect(linkCell).toHaveAttribute("title", `${target.projectName} · 1 ${target.itemName}`);
    await expect(linkCell).toHaveCSS("white-space", "nowrap");

    // M-4 — 방금 등록 = 직전 등록: 종류 · 프로젝트는 남고 견적 줄은 빈다 → 1차 비활성 + `연결 없음 · 연결 고르기`.
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "견적 줄 바꾸기" })).toHaveText("고르기");
    await amount.fill("1000");
    await expect(sheet.getByText("연결 없음 · 연결 고르기", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^카드 사용 등록/ })).toBeDisabled();
    await page.context().close();
  });

  test("[06.5 D-6503 트레이서] 새 프로젝트 줄에 등록 → `/cards` 첫 머리글 `번호` · 그 행 첫 칸 `{프로젝트 번호}-K0001`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto(`/cards?new=1&line=${target.lineId}`);
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await expect(sheet.getByText(target.itemName, { exact: true })).toBeVisible();
    await amount.fill("1100000");
    await amount.press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 1,100,000");

    await page.goto("/cards");
    const table = page.getByRole("table");
    await expect(table.locator("thead th").first()).toHaveText("번호");
    const row = table.getByRole("row").filter({ hasText: "1,100,000" });
    await expect(row.locator("td").first()).toHaveText(`${target.projectNumber}-K0001`);
    await page.context().close();
  });

  test("[06.5 V7] 폰 375 — 권리 없는 행 RowSheet 첫 행 `번호` · 번호 없는 기존 행은 `—`", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const other = await makePerson("대리", DEFAULT_ROLE_ID, holder.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const numbered = `가맹번호-${randomUUID().slice(0, 6)}`;
    const legacy = `가맹옛행-${randomUUID().slice(0, 6)}`;
    const number = `26T-K${randomUUID().slice(0, 6)}`;
    // 남이 등록(권리 없음)한 내 카드 행 둘 — 하나는 번호, 하나는 번호 없는 기존 행.
    for (const [merchantName, value] of [
      [numbered, number],
      [legacy, null],
    ] as const) {
      const vendor = await insertVendor(SYSTEM_VIEWER, { name: merchantName, normalizedName: `${merchantName}-${randomUUID()}` });
      await db.insert(corpCardUsages).values({
        number: value,
        corpCardId: holder.cardIds[0] ?? "",
        usedOn: seoulToday(),
        merchantVendorId: vendor.id,
        totalCurrency: "KRW",
        totalForeignAmount: null,
        totalFxRate: "1",
        totalAmountKrw: 30_000,
        supplyKrw: 30_000,
        vatKrw: 0,
        evidenceTypeCode: "invoice",
        linkKind: "team_cost",
        quoteLineId: null,
        teamId: holder.teamId,
        usedByUserId: holder.person.viewer.id,
        registeredBy: other.viewer.id,
        registeredVia: "proxy",
        memo: null,
      });
    }
    const page = await loginPage(browser, baseURL, holder.person);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/cards");
    for (const [merchantName, value] of [
      [numbered, number],
      [legacy, "—"],
    ] as const) {
      const tap = page.getByRole("row").filter({ hasText: merchantName }).getByRole("button", { name: /상세 보기$/ });
      await waitForHydration(tap);
      await tap.click();
      const rowSheet = page.getByRole("dialog").filter({ hasText: merchantName });
      await expect(rowSheet).toBeVisible();
      await expect(rowSheet.locator("dt").first()).toHaveText("번호");
      await expect(rowSheet.locator("dd").first()).toHaveText(value);
      await rowSheet.getByRole("button", { name: "닫기" }).click();
      await expect(rowSheet).toBeHidden();
    }
    await page.context().close();
  });

  test("[06.5 V7] 1280 — 수정 패널 맨 위 읽기 칸 `번호`(입력 아님 · 그대로 닫으면 입력 버리기 없음) · 등록 패널에는 `번호` 없음", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    await seedLineUsage(holder.person.viewer, holder.cardIds[0] ?? "", target.lineId, 50_000);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");
    const edit = page.getByRole("link", { name: / 수정$/ }).first();
    await waitForHydration(edit);
    await edit.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(sheet).toBeVisible();
    const first = sheet.locator('[data-ui="field-row"]').first();
    await expect(first).toContainText("번호");
    await expect(first).toContainText(`${target.projectNumber}-K0001`);
    await expect(first.locator("input, select, textarea")).toHaveCount(0);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(sheet).toBeHidden();

    await page.goto("/cards?new=1");
    await waitForHydration(panel(page).getByLabel("결제 합계"));
    await expect(panel(page).getByText("번호", { exact: true })).toHaveCount(0);
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
    // 기본 증빙 `카드 전표` — #177부터 부가세 10% 역산이라 견적 외 비용 줄 실행가 = 공급가 27,273.
    await expect(sheet.getByText("저장하면 견적 외 비용 줄 생김 · 실행가 27,273", { exact: true })).toBeVisible();
    await amount.press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 30,000");
    // [DOM 감사 D-1] 뒤 목록 연결 칸 `{프로젝트} · 견적 외 비용 · {항목}`.
    await expect(page.getByRole("table").getByText(`${target.projectName} · 견적 외 비용 · ${item}`, { exact: true })).toHaveCount(1);

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
    // 기본 증빙 `카드 전표` — #177부터 부가세 10% 역산(1,327,401 → 공급가 1,206,728 · 부가세 120,673).
    await expect(sheet.locator('[data-ui="card-calc-line"]')).toHaveText("공급가 1,206,728 · 부가세 120,673 · 카드 전표 규칙");
    await sheet.getByLabel("환율").press("Control+Enter");

    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 1,327,401");
    const table = page.getByRole("table");
    await expect(table.getByText("1,327,401", { exact: true })).toHaveCount(1);
    // 07.1-18 — 같은 글자가 접힌 줄(`secondaryText`)에도 있다(PC에서는 접힌 줄이 숨는다) — 보이는 것만 센다.
    await expect(table.getByText("USD 900.00 @1,474.89 · 공급가 1,206,728", { exact: true }).filter({ visible: true })).toHaveCount(1);
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

  test("[PR #180 Codex P2] 카드 선택지는 고른 사용일 기준 — 오늘 발령된 팀의 팀 카드는 어제를 고르면 빠지고 오늘로 돌리면 다시 생긴다", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E사용일본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E사용일팀-${suffix}` });
    const today = seoulToday();
    const person = await makePerson("사용일", DEFAULT_ROLE_ID, team.id, today);
    const issuer = `신한-${suffix}`;
    const personalLabel = `E2E개인-${suffix}`;
    const teamLabel = `E2E팀카드-${suffix}`;
    await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: "4321", label: personalLabel, kind: "personal", holderUserId: person.viewer.id });
    await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: "4322", label: teamLabel, kind: "team", teamId: team.id });
    const yesterday = seoulToday(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const page = await loginPage(browser, baseURL, person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const card = sheet.getByRole("combobox", { name: "카드", exact: true });
    await waitForHydration(card);
    await expect(card.locator("option", { hasText: teamLabel })).toHaveCount(1);

    await sheet.getByLabel("사용일").fill(yesterday);
    // 어제는 팀 소속이 없어 개인 카드 한 장 — 고를 것이 없으니 읽기 텍스트(할 수 없는 선택지는 숨김).
    await expect(card).toHaveCount(0);
    await expect(sheet.getByText(`${personalLabel} · ${issuer} 4321`, { exact: true })).toBeVisible();

    await sheet.getByLabel("사용일").fill(today);
    await expect(card.locator("option", { hasText: teamLabel })).toHaveCount(1);
    await page.context().close();
  });

  test("[PR #180 Codex P2] `quote.amount` 없는 카드 소지자도 견적 줄을 고를 수 있다 — 남은 실행가 줄 없이 그 줄이 채워진다 · `?new=1&line=` 진입도 같다", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const target = await seedProjectLine(holder);
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E금액숨김카드-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    for (const infoItem of ["project.value", "card_usage.value", "card_usage.amount", "team.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const viewer = await makePerson("금액숨김카드", role.id, holder.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const own = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${randomUUID().slice(0, 8)}`, numberLast4: "4321", label: `E2E숨김카드-${randomUUID().slice(0, 8)}`, kind: "personal", holderUserId: viewer.viewer.id });
    if (!own.id) throw new Error("카드 id 없음");

    const page = await loginPage(browser, baseURL, viewer);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    await sheet.getByRole("radio", { name: "견적 줄" }).check();
    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(target.projectName);
    await projects.getByRole("option", { name: new RegExp(target.projectName) }).click();
    await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await lines.getByRole("option", { name: new RegExp(target.itemName) }).click();
    await lines.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(lines).toBeHidden();
    await expect(sheet.getByText(target.itemName, { exact: true })).toBeVisible();
    await expect(sheet.getByText(/남은 실행가/)).toHaveCount(0);

    await page.goto(`/cards?new=1&line=${target.lineId}`);
    const reopened = panel(page);
    await waitForHydration(reopened.getByLabel("결제 합계"));
    await expect(reopened.getByText(target.itemName, { exact: true })).toBeVisible();
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

  // 06-24 backstop 감사 B-1 · B-2(06-05 S8 · S9 long-text) — 긴 가맹점 · 카드 이름은 한 줄 말줄임 + title(목록 칸 · 옆 패널).
  test("[backstop B-1·B-2] 긴 가맹점 · 카드 이름 — 목록 가맹점 칸과 수정 패널의 가맹점 · 카드 이름이 한 줄 말줄임 + title · 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder(0);
    const suffix = randomUUID().slice(0, 8);
    const longLabel = `긴카드${"가".repeat(90)}`;
    const merchantName = `Overseas Merchant International Trading ${suffix} ${"Very Long Company Name ".repeat(4)}`.trim();
    const merchant = await insertVendor(SYSTEM_VIEWER, { name: merchantName, normalizedName: merchantName.toLowerCase() });
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `국민-${suffix}`, numberLast4: "9871", label: longLabel, kind: "personal", holderUserId: holder.person.viewer.id });
    if (!card.id) throw new Error("카드 id 없음");
    const input = {
      corpCardId: card.id,
      usedOn: seoulToday(),
      merchantVendorId: merchant.id,
      total: { currency: "KRW" as const, amount: 12_000, fxRate: 1 },
      evidenceTypeCode: "card_receipt",
      linkKind: "team_cost" as const,
      memo: null,
    };
    await createCardUsage(holder.person.viewer, input, await precheckCardUsage(holder.person.viewer, input));

    // 한 줄 말줄임 + title — 넘침(scrollWidth > clientWidth)이 실제로 잘리고, 줄 높이가 한 줄이다.
    const expectEllipsis = async (target: import("@playwright/test").Locator, label: string) => {
      await expect(target, `${label} title 있는 칸`).toBeVisible();
      const measured = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return {
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          overflow: style.overflow,
          height: element.getBoundingClientRect().height,
          lineHeight: Number.isNaN(lineHeight) ? Number.parseFloat(style.fontSize) * 1.5 : lineHeight,
        };
      });
      expect(measured.whiteSpace, `${label} white-space`).toBe("nowrap");
      expect(measured.textOverflow, `${label} text-overflow`).toBe("ellipsis");
      expect(measured.overflow, `${label} overflow`).toBe("hidden");
      expect(measured.height, `${label} 한 줄 높이`).toBeLessThanOrEqual(measured.lineHeight * 1.5);
    };

    let editHref: string | null = null;
    for (const width of [1280, 768, 375]) {
      const page = await loginPage(browser, baseURL, holder.person, { width, height: 900 });
      await page.goto("/cards");
      await expectEllipsis(page.getByRole("table").locator(`[title="${merchantName}"]:visible`).first(), `${width}px 목록 가맹점`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px 문서 넘침`).toBe(0);
      if (width === 1280) editHref = await page.locator('a[href*="editId="]').first().getAttribute("href");
      if (!editHref) throw new Error("수정 링크 없음");
      await page.goto(editHref);
      const sheet = page.getByRole("dialog");
      await waitForHydration(sheet.getByLabel("결제 합계"));
      await expectEllipsis(sheet.locator(`[title="${merchantName}"]`), `${width}px 패널 가맹점`);
      await expectEllipsis(sheet.locator(`[title*="${longLabel}"]`), `${width}px 패널 카드 이름`);
      await expect(sheet.getByRole("button", { name: "가맹점 바꾸기" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px 패널 문서 넘침`).toBe(0);
      await page.context().close();
    }
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
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E금액숨김-${randomUUID().slice(0, 8)}`, workScope: "company" });
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


// 06.5 D-6512 L-1 · SP-65-3(UI-SPEC V9): 주소로 직접 연 수정 패널을 저장해 닫으면 포커스가 그 행 `수정` 링크로(행이 필터 밖이면 화면 제목).
async function onlyUsageId(holder: CardHolder): Promise<string> {
  const [row] = await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.registeredBy, holder.person.viewer.id));
  if (!row) throw new Error("카드 사용이 없습니다");
  return row.id;
}

async function saveEditPanel(page: Page, amount: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
  const total = sheet.getByLabel("결제 합계");
  await waitForHydration(total);
  await total.fill(amount);
  await total.press("Control+Enter");
  await expect(sheet).toHaveCount(0);
}

test.describe("카드 사용 수정 딥링크 저장 뒤 포커스 (06.5 V9 L-1)", () => {
  test("`/cards?editId=` 주소로 열어 저장 → 포커스 = 그 행 `수정` 링크 · 목록 `수정`으로 연 경우도 그 링크(기존 경로)", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    await seedUsage(holder, 30_000);
    const id = await onlyUsageId(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto(`/cards?editId=${id}`);
    await saveEditPanel(page, "31000");
    const rowEdit = page.getByRole("link", { name: `${seoulToday().slice(5)} 수정` });
    await expect(rowEdit).toBeFocused();

    await rowEdit.click();
    await saveEditPanel(page, "32000");
    await expect(page.getByRole("link", { name: `${seoulToday().slice(5)} 수정` })).toBeFocused();
    await page.context().close();
  });

  // PR-C DOM 감사 F1: 바로 앞 기록이 같은 목록 URL이지만 다른 문서(같은 탭에서 다시 연 주소 · 새로 고침)면 뒤로 가기가 문서를 건너가 포커스가 body에 남았다.
  test("바로 앞 기록이 같은 목록의 다른 문서(다시 연 주소 · 새로 고침)여도 저장 → 포커스 = 그 행 `수정` 링크", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    await seedUsage(holder, 30_000);
    const id = await onlyUsageId(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    const rowEdit = page.getByRole("link", { name: `${seoulToday().slice(5)} 수정` });
    await page.goto("/cards");
    await page.goto(`/cards?editId=${id}`);
    await saveEditPanel(page, "31000");
    await expect(rowEdit).toBeFocused();
    await expect(page).toHaveURL(/\/cards$/);

    await rowEdit.click();
    await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toBeVisible();
    await page.reload();
    await saveEditPanel(page, "32000");
    await expect(rowEdit).toBeFocused();
    await page.context().close();
  });

  test("그 행이 지금 필터 밖(지난달)인 주소로 열어 저장 → 포커스 = 화면 제목", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    await seedUsage(holder, 30_000);
    const id = await onlyUsageId(holder);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto(`/cards?month=${previousMonth()}&editId=${id}`);
    await saveEditPanel(page, "31000");
    await expect(page.locator('[data-ui="screen-title"]')).toBeFocused();
    await page.context().close();
  });
});

// 06.5 D-6509 · EP1-8: 등록 패널은 성공해도 닫히지 않는다 — 같은 패널에서 이은 두 번째 건이 첫 건으로 돌아오지 않는다(성공마다 새 키).
test("[06.5 D-6509] 같은 등록 패널에서 두 건 연이어 → 행 둘 · 번호 둘(K 겹침 없음)", async ({ browser, baseURL }) => {
  const holder = await makeCardHolder();
  const page = await loginPage(browser, baseURL, holder.person);
  await page.goto("/cards?new=1");
  const sheet = panel(page);
  const amount = sheet.getByLabel("결제 합계");
  await waitForHydration(amount);
  for (const [value, shown] of [["11000", "11,000"], ["22000", "22,000"]] as const) {
    await sheet.getByLabel("결제 합계").fill(value);
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await sheet.getByLabel("결제 합계").press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText(`카드 사용 등록됨 · ${shown}`);
  }
  const rows = await db.select({ number: corpCardUsages.number }).from(corpCardUsages).where(eq(corpCardUsages.registeredBy, holder.person.viewer.id));
  expect(rows).toHaveLength(2);
  const numbers = rows.map((row) => row.number ?? "");
  expect(new Set(numbers).size).toBe(2);
  for (const number of numbers) expect(number).toMatch(/^\d{2}T-K\d{4}$/);
  await page.context().close();
});

// 07.1-11 PC1 · PC3: 파일 올리기가 실패해 열려 있는 저장된 새 건을 두 번 고쳐 다시 저장한다 — 낡은 version 충돌 문구 없이 한 건.
const SLIP_WAIT = 20_000;
const STALE_TEXT = "다른 저장이 먼저 됨";

// 05 테스트 모드 업로드가 해시로 중복을 가르므로 부를 때마다 다른 그림(card-usage-evidence.spec.ts `uniqueImage` 꼴).
async function slipImage(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const tag = randomUUID();
  const base64 = await page.evaluate(async (label) => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들 수 없다");
    ctx.fillStyle = "#eef2f1";
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = "#1f2d29";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(label, 20, 80);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG를 만들 수 없다");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, tag);
  return { name: `slip-${tag.slice(0, 8)}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

async function holderUsages(holder: CardHolder): Promise<{ id: string; total: number; version: number }[]> {
  return db
    .select({ id: corpCardUsages.id, total: corpCardUsages.totalAmountKrw, version: corpCardUsages.version })
    .from(corpCardUsages)
    .where(eq(corpCardUsages.registeredBy, holder.person.viewer.id));
}

// 새 건 · 팀 비용 88,000 → 서명 PUT 실패 → 건은 저장됐고 새 건 패널이 그대로 열려 있다.
async function openSavedNewAfterFailedUpload(page: Page, holder: CardHolder) {
  await page.goto("/cards?new=1");
  const sheet = panel(page);
  const amount = sheet.getByLabel("결제 합계");
  await waitForHydration(amount);
  await amount.fill("88000");
  await sheet.getByRole("radio", { name: "팀 비용" }).check();
  await page.route("**/api/storage-local/**", (route) => route.abort());
  await sheet.getByTestId("attachments-input").setInputFiles(await slipImage(page));
  await expect(sheet.locator('[data-ui="attachments"] li').filter({ hasText: /slip-.*\.jpg/ })).toBeVisible({ timeout: SLIP_WAIT });
  await expect.poll(async () => (await holderUsages(holder)).length).toBe(1);
  return { sheet, amount };
}

test.describe("[07.1-11 PC1 · PC3] 저장된 새 건 다시 저장", () => {
  test("PC1 재현 — 첫 다시 저장 성공 뒤 · 수정 패널 이동이 끝나기 전 두 번째 제출 → 낡은 version 다시 저장 요청 0 · 충돌 문구 없음 · 한 건 · 이어서 수정 저장", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    const { sheet, amount } = await openSavedNewAfterFailedUpload(page, holder);
    const [saved] = await holderUsages(holder);
    const savedId = saved?.id ?? "";

    // 그 건에 version 1을 실은 다시 저장 요청(서버 액션 본문) — 첫 다시 저장 하나만 있어야 한다.
    const staleResaves: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.headers()["next-action"]) return;
      const body = request.postData() ?? "";
      if (body.includes(savedId) && /"version":1(?!\d)/.test(body)) staleResaves.push(body);
    });

    // 첫 다시 저장 성공 뒤의 수정 패널 이동(`?editId=`)을 붙잡아 둔다 — 그사이 새 건 폼이 그대로 남는다.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let reached: () => void = () => {};
    const navigating = new Promise<void>((resolve) => (reached = resolve));
    await page.route(/\/cards\?(?:[^#]*&)?editId=/, async (route) => {
      reached();
      await held;
      await route.continue().catch(() => undefined);
    });

    await amount.fill("99000");
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    await expect.poll(async () => (await holderUsages(holder))[0]?.total).toBe(99_000);
    await navigating;
    await expect(sheet).toBeVisible();

    // 이동 중 두 번째 제출(Ctrl+Enter) — 낡은 version(1)으로 다시 저장하지 않는다.
    await amount.fill("77000");
    await amount.press("Control+Enter");
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);

    release();
    const edit = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(edit).toBeVisible({ timeout: SLIP_WAIT });
    await page.waitForLoadState("networkidle");
    expect(staleResaves).toHaveLength(1);
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);
    expect(await holderUsages(holder)).toMatchObject([{ total: 99_000, version: 2 }]);

    // 수정 패널은 서버 최신 version으로 그려졌다 — 이어서 저장해도 충돌 없이 한 건.
    await saveEditPanel(page, "66000");
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);
    expect(await holderUsages(holder)).toMatchObject([{ total: 66_000, version: 3 }]);
    await page.context().close();
  });

  test("PC1 회귀 — 이동이 끝난 뒤 수정 패널에서 두 번째 저장 → 충돌 문구 없음 · 한 건", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    const { sheet, amount } = await openSavedNewAfterFailedUpload(page, holder);
    await amount.fill("99000");
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    await expect(page).toHaveURL(/editId=/, { timeout: SLIP_WAIT });
    await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toBeVisible();

    await saveEditPanel(page, "66000");
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);
    const rows = await holderUsages(holder);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(66_000);
    await page.context().close();
  });

  test("PC3 — 올리기 성공 뒤(수정 패널로 바뀜) 금액 고침 · 저장 → 충돌 문구 없음 · 한 건", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = panel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("88000");
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await sheet.getByTestId("attachments-input").setInputFiles(await slipImage(page));
    const edit = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(edit).toBeVisible({ timeout: SLIP_WAIT });
    await expect(edit.locator('[data-ui="attachments"] li').filter({ hasText: /slip-.*\.jpg/ })).toBeVisible({ timeout: SLIP_WAIT });

    await saveEditPanel(page, "55000");
    await expect(page.getByText(STALE_TEXT)).toHaveCount(0);
    const rows = await holderUsages(holder);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(55_000);
    await page.context().close();
  });
});

// 07.1-11 D-7112 · U-14 · W12: 보관된 카드는 `{이름} (보관) · {발급사} {뒤4자리}` — 목록 묶음 머리 · 수정 패널 `카드` 줄 · 카드 거르개 옵션(끝 · 사용 있는 것만).
async function seedUsageOn(holder: CardHolder, cardId: string, amount: number): Promise<string> {
  const input = {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost" as const,
    memo: null,
  };
  return (await createCardUsage(holder.person.viewer, input, await precheckCardUsage(holder.person.viewer, input))).id;
}

test.describe("[07.1-11 W12] 보관 카드 표시", () => {
  test("묶음 머리 · 수정 패널 `카드` 줄 `(보관)` · 거르개 옵션 = 전체 → 활성 → 사용 있는 보관 카드(끝) · 사용 없는 보관 카드 0", async ({ browser, baseURL }) => {
    const holder = await makeCardHolder(3);
    const [activeId = "", archivedId = "", emptyArchivedId = ""] = holder.cardIds;
    await seedUsageOn(holder, activeId, 11_000);
    const archivedUsage = await seedUsageOn(holder, archivedId, 22_000);
    await setCorpCardArchived(SYSTEM_VIEWER, archivedId, true);
    await setCorpCardArchived(SYSTEM_VIEWER, emptyArchivedId, true);
    const activeText = `${holder.cardLabel} · ${holder.issuer} 4321`;
    const archivedText = `${holder.cardLabel}-2 (보관) · ${holder.issuer} 4322`;

    const page = await loginPage(browser, baseURL, holder.person, { width: 1280, height: 800 });
    await page.goto("/cards");
    const groups = page.locator("tbody tr[class*='groupRow']");
    await expect(groups).toHaveText([activeText, archivedText]);
    const options = page.getByLabel("카드", { exact: true }).locator("option");
    await expect(options).toHaveText(["전체", activeText, archivedText]);

    await page.goto(`/cards?editId=${archivedUsage}`);
    await expect(page.getByRole("dialog", { name: "카드 사용 수정" }).getByText(archivedText, { exact: true })).toBeVisible();

    // 375 — `(보관)`은 이름 바로 뒤라 말줄임에 잘리지 않는다(그 글자 상자가 묶음 머리 칸 안).
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/cards");
    const header = page.locator("tbody tr[class*='groupRow']").filter({ hasText: "(보관)" }).locator("th, td").first();
    await expect(header).toBeVisible();
    const clipped = await header.evaluate((cell) => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf("(보관)") ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + "(보관)".length);
        const mark = range.getBoundingClientRect();
        const box = cell.getBoundingClientRect();
        return mark.right > box.right + 0.5 || mark.left < box.left - 0.5;
      }
      return true;
    });
    expect(clipped).toBe(false);
    await page.context().close();
  });
});
