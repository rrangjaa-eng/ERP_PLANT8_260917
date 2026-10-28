import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, expenses, files, projects, purchaseRequests } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertApprovalInstance } from "@/repositories/approvals";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { createCardUsageFixture } from "../integration/fixtures/evidence";
import { loginPage, makePerson, setupLeaveOrg, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-23(S19 · UA-611 · O-15): 첫 화면 「내 차례」의 Phase 6 항목. E2E DB는 스펙끼리 초기화 없이 공유한다 — 건수는 시드 전후 상대값으로 본다(E-28).
// 지급 권한자는 팀 업무 범위로 이 스펙 프로젝트 팀의 문서만 본다(payment-batch.spec.ts 꼴).

const DESKTOP = { width: 1280, height: 900 };
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
// 07.1-17(PA2): 상황은 이유 칸으로 옮겨 줄은 `지급 {n}건` + ` · 예정일 지남·오늘` — 줄은 이유로 찾고 건수는 label에서 읽는다.
const PAYMENT_DUE = /예정일 지남·오늘/;
const PAYMENT_COUNT = /지급 (\d+)건/;

test.afterAll(async () => {
  await archiveTempRoles();
});

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E내차례지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 증빙 붙여 제출 → 결재선 넷 승인(결재 통과 · 지급 전). 문서 id를 돌려준다.
async function approvedLine(fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error("결재 인스턴스 없음");
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  return expenseId;
}

async function dueCount(page: Page): Promise<number> {
  const row = page.getByRole("listitem").filter({ hasText: PAYMENT_DUE });
  if ((await row.count()) === 0) return 0;
  const match = PAYMENT_COUNT.exec((await row.first().textContent()) ?? "");
  return Number(match?.[1] ?? 0);
}

test.describe("「내 차례」 Phase 6 — 지급 묶음 (06-23 트레이서)", () => {
  test("지급 묶음 — 지급 대상 보기", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, DESKTOP);
    await page.goto("/");
    const before = await dueCount(page);

    const expenseId = await approvedLine(fx, "tracer");
    await db.update(expenses).set({ scheduledPaymentDate: seoulToday() }).where(eq(expenses.id, expenseId));

    await page.goto("/");
    const row = page.getByRole("listitem").filter({ hasText: PAYMENT_DUE });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("오늘", { exact: true })).toBeVisible();
    expect(await dueCount(page)).toBe(before + 1);

    await row.getByRole("link", { name: "지급 대상 보기" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/expenses");
    expect(new URL(page.url()).searchParams.get("status")).toBe("지급 대상");
  });
});

// #321 재검토(07.1-17): 폰에서 행동 링크의 padding이 밑줄을 이유 글자 쪽으로 내려, 이유 칸이 4번째 칸까지 넓어진 뒤 밑줄이 이유 글자를 가로질렀다.
// 하네스(mobile-next-turn.spec.ts)가 아닌 실제 앱 홈(실제 셸 · 실제 서체)에서 375 · 320 두 폭을 잰다. 줄은 실제 지급(오늘) 줄이고,
// 잘림 크기는 같은 줄의 글자를 최악(건수 두 자리 + 금액 아홉 · 열 자리)으로 바꿔 실제 칸 폭에서 잰다 — 서버에서 열두 건을 만드는 것보다 싸고 칸 폭은 그대로다.
const HOME_PHONE_WIDTHS = [375, 320] as const;
const HOME_CLIPPED_MAX_PX: Record<number, { nine: number; ten: number }> = { 375: { nine: 0, ten: 0 }, 320: { nine: 4, ten: 15 } };

type HomeRowProbe = { rowWidth: number; rowHeight: number; why: { x: number; w: number }; amt: { x: number; w: number }; action: { x: number; w: number; h: number }; whyOver: number; crossings: string[]; overflowX: boolean };

async function probeHomeRow(page: Page, amountText?: string): Promise<HomeRowProbe> {
  const row = page.getByRole("listitem").filter({ hasText: PAYMENT_DUE }).first();
  return row.evaluate((li, amount) => {
    const why = li.querySelector<HTMLElement>(".why, [class*='why']");
    const amt = li.querySelector<HTMLElement>("[class*='amt']");
    const link = li.querySelector<HTMLElement>("a[href]");
    if (!why || !amt || !link) throw new Error("이유 · 금액 · 링크 칸 없음");
    if (amount !== undefined) {
      const inner = amt.querySelector<HTMLElement>("*") ?? amt;
      inner.textContent = amount;
      why.textContent = " · 예정일 지남·오늘 · 확인 전 12건";
    }
    const box = (el: Element) => el.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(link).borderBottomWidth);
    const underline = { left: linkRect.left, right: linkRect.right, top: linkRect.bottom - border, bottom: linkRect.bottom };
    const whyRect = why.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(why);
    const crossings = Array.from(range.getClientRects())
      .map((text) => ({ left: Math.max(text.left, whyRect.left), right: Math.min(text.right, whyRect.right), top: Math.max(text.top, whyRect.top), bottom: Math.min(text.bottom, whyRect.bottom) }))
      .filter((text) => text.right > underline.left && text.left < underline.right && text.bottom > underline.top && text.top < underline.bottom)
      .map((text) => `밑줄 y ${underline.top.toFixed(1)}~${underline.bottom.toFixed(1)} / 이유 글자 y ${text.top.toFixed(1)}~${text.bottom.toFixed(1)}`);
    return {
      rowWidth: Math.round(box(li).width),
      rowHeight: Math.round(box(li).height),
      why: { x: Math.round(whyRect.x), w: Math.round(whyRect.width) },
      amt: { x: Math.round(box(amt).x), w: Math.round(box(amt).width) },
      action: { x: Math.round(linkRect.x), w: Math.round(linkRect.width), h: Math.round(linkRect.height) },
      whyOver: why.scrollWidth - why.clientWidth,
      crossings,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, amountText);
}

function recordHome(kind: string, width: number, probe: HomeRowProbe): void {
  mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
  appendFileSync(path.join(process.cwd(), "test-results", "next-turn-home-phone.jsonl"), `${JSON.stringify({ kind, width, ...probe })}\n`);
}

test.describe("「내 차례」 폰 홈 — 지급 줄 밑줄 · 이유 잘림 (#321 재검토 · 실제 앱)", () => {
  test("375 · 320 — 밑줄이 이유 글자를 가로지르지 않고 가로 넘침 0 · 최악 글자의 잘림 크기가 상한 안이다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const expenseId = await approvedLine(fx, "tracer");
    await db.update(expenses).set({ scheduledPaymentDate: seoulToday() }).where(eq(expenses.id, expenseId));

    const page = await loginPage(browser, baseURL, payer, { width: 375, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("listitem").filter({ hasText: PAYMENT_DUE })).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    for (const width of HOME_PHONE_WIDTHS) {
      // 폭마다 홈을 새로 읽는다 — 앞 폭에서 글자를 최악으로 바꾼 DOM을 그대로 두면 「실제 줄」이 실제가 아니다.
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByRole("listitem").filter({ hasText: PAYMENT_DUE })).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const real = await probeHomeRow(page);
      recordHome("real", width, real);
      expect(real.crossings, `${width} 실제 줄 — 밑줄이 이유 글자와 겹침`).toEqual([]);
      expect(real.overflowX, `${width} 가로 넘침`).toBe(false);
      const nine = await probeHomeRow(page, "123,456,789");
      recordHome("worst-nine", width, nine);
      expect(nine.crossings, `${width} 최악(아홉 자리) — 밑줄이 이유 글자와 겹침`).toEqual([]);
      expect(nine.whyOver, `${width} 아홉 자리 잘림 ${nine.whyOver}px`).toBeLessThanOrEqual(HOME_CLIPPED_MAX_PX[width]?.nine ?? -1);
      const ten = await probeHomeRow(page, "1,234,567,890");
      recordHome("worst-ten", width, ten);
      expect(ten.whyOver, `${width} 열 자리 잘림 ${ten.whyOver}px`).toBeLessThanOrEqual(HOME_CLIPPED_MAX_PX[width]?.ten ?? -1);
    }
    await page.context().close();
  });
});

test.describe("「내 차례」 Phase 6 — 기안자 증빙 · 공급 실패 (06-23 Task 3)", () => {
  test("기안자 — 증빙 없음 · 지급 대기 → 증빙 올리기", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedLine(fx, "hold");
    // 무효 이력 없는 증빙 0(P3) — 제출 게이트 때문에 도메인 경로로는 못 만들어 파일을 지운 표시만 남긴다.
    await db.update(files).set({ removedAt: new Date() }).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto("/");
    const targetText = `${fx.projectName} · ${fx.lines.hold.itemName}`;
    const row = page.getByRole("listitem").filter({ hasText: targetText });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${targetText} — 증빙 없음 · 지급 대기`);
    await expect(row.getByText("막힘", { exact: true })).toBeVisible();
    const upload = row.getByRole("link", { name: "증빙 올리기" });
    expect(await upload.getAttribute("href")).toMatch(new RegExp(`/expenses/${expenseId}#evidence$`));

    await upload.click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}#evidence$`));
    await expect(page.locator("#evidence")).toBeVisible();
  });

  test("공급 실패 — 오류 한 줄", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    // 등록되지 않은 종류의 반려 인스턴스 — 공급 함수가 던진다(05 스펙과 같은 주입).
    await insertApprovalInstance(org.drafter.viewer, { documentKind: `ghost-${randomUUID().slice(0, 8)}`, documentId: randomUUID(), drafterId: org.drafter.viewer.id, status: "rejected", currentRound: 1 }, db);

    const page = await loginPage(browser, baseURL, org.drafter, DESKTOP);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "내 차례" })).toBeVisible();
    await expect(page.getByText("내 차례 불러오지 못함")).toBeVisible();
    const retry = page.getByRole("button", { name: "다시 시도" });
    await waitForHydration(retry);
    await expect(retry).toBeVisible();
    await expect(page.getByText("표시할 항목이 없습니다")).toHaveCount(0);
  });
});

// 07.1-17(PD1 · C-01 · U-11): 전표 대기 줄 — 구매 처리 권한자 홈에만. E2E DB는 공유라 건수는 상대값으로 본다(E-28).
test.describe("「내 차례」 전표 대기 (07.1-17 PD1)", () => {
  const SLIP_LABEL = /전표 대기 (\d+)건/;

  async function slipCount(page: Page): Promise<number> {
    const row = page.getByRole("listitem").filter({ hasText: SLIP_LABEL });
    if ((await row.count()) === 0) return 0;
    return Number(SLIP_LABEL.exec((await row.first().textContent()) ?? "")?.[1] ?? 0);
  }

  async function makePurchaser(fx: ExpenseE2E): Promise<Person> {
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E전표대기구매-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    for (const infoItem of [...INFO_ITEMS, "purchase_request.value", "purchase_request.amount", "card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    return makePerson("구매처리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
  }

  // 구매 완료 요청 + 그 요청에 딸린 카드 사용(구매 경로 고리) — 전표 없음.
  async function purchasedWithoutSlip(fx: ExpenseE2E): Promise<string> {
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: "전표 대기 E2E", kind: "personal", holderUserId: fx.pm.viewer.id });
    if (!card.id) throw new Error("카드 없음");
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `E2E${randomUUID().slice(0, 8)}`, linkKind: "team_cost", requestedBy: fx.pm.viewer.id, itemName: "전표 대기 물건", estimateAmountKrw: 33_000, status: "purchased", completedBy: fx.pm.viewer.id, completedAt: new Date() })
      .returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    const usage = await createCardUsageFixture(fx.pm.viewer, { corpCardId: card.id, usedOn: seoulToday(), totalKrw: 33_000 });
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, usage.id));
    return usage.id;
  }

  test("구매 권한자 홈 — 전표 대기 줄이 구매 요청 줄 다음에 서고 `구매 요청 보기`가 /cards/purchases 구매 완료 보기로 간다 · 전표가 붙으면 줄이 줄어든다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const purchaser = await makePurchaser(fx);
    const page = await loginPage(browser, baseURL, purchaser, DESKTOP);
    await page.goto("/");
    const before = await slipCount(page);
    if (before === 0) await expect(page.getByRole("listitem").filter({ hasText: SLIP_LABEL })).toHaveCount(0);

    const usageId = await purchasedWithoutSlip(fx);
    await page.goto("/");
    const row = page.getByRole("listitem").filter({ hasText: SLIP_LABEL });
    await expect(row).toHaveCount(1);
    expect(await slipCount(page)).toBe(before + 1);
    await expect(row.getByText("대기", { exact: true })).toBeVisible();
    await expect(row).toContainText("결제 완료 · 가장 오래된");

    await row.getByRole("link", { name: "구매 요청 보기" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/cards/purchases");
    expect(new URL(page.url()).searchParams.get("status")).toBe("구매 완료");

    // 전표 파일이 붙으면 다음 렌더에서 줄어든다(0건이면 줄 DOM 0).
    await db.insert(files).values({ ownerKind: "corp_card_usage", ownerId: usageId, objectKey: `evidence/${randomUUID()}`, sha256: "a".repeat(64), sizeBytes: 10, contentType: "image/png", originalName: "전표.png", uploadedBy: fx.pm.viewer.id });
    await page.goto("/");
    expect(await slipCount(page)).toBe(before);
    if (before === 0) await expect(page.getByRole("listitem").filter({ hasText: SLIP_LABEL })).toHaveCount(0);
    await page.context().close();
  });

  test("구매 처리 권한이 없는 사람 홈 — 전표 대기 줄 DOM 0(서버가 안 보낸다)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await purchasedWithoutSlip(fx);
    const person = await makePerson("기안직원", DEFAULT_ROLE_ID, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
    const page = await loginPage(browser, baseURL, person, DESKTOP);
    await page.goto("/");
    await expect(page.getByRole("listitem").filter({ hasText: SLIP_LABEL })).toHaveCount(0);
    await page.context().close();
  });
});

// 06-24 backstop 감사 B-4(06-23 O-2 보류분) — 홈 느린 로드(§7-4 · §7-7 LOADING): 300ms 뒤 제목 + 뼈대 행 2개(aria-busy), 도착하면 홈.
test.describe("「내 차례」 느린 로드 (06-24 backstop B-4)", () => {
  test("홈 이동 RSC를 2.5초 늦춰도 300ms 뒤 제목 + 뼈대 행 2개(aria-busy)가 보이고, 도착하면 뼈대가 사라진다", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const page = await loginPage(browser, baseURL, org.drafter, DESKTOP);
    await page.waitForLoadState("networkidle");

    await page.route(
      (url) => url.pathname === "/",
      async (route) => {
        const headers = route.request().headers();
        if (headers.rsc === "1" && headers["next-router-prefetch"] === undefined) await new Promise((resolve) => setTimeout(resolve, 2_500));
        await route.continue();
      },
    );
    await page.locator('a[href="/"]').first().click();
    const skeleton = page.locator('[data-ui="home-skeleton"]');
    await expect(skeleton).toHaveCSS("opacity", "1", { timeout: 2_000 });
    await expect(skeleton).toHaveAttribute("aria-busy", "true");
    await expect(skeleton.locator('[data-ui="home-skeleton-row"]')).toHaveCount(2);
    await expect(page.getByRole("heading", { level: 1, name: "내 차례" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(skeleton).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByRole("heading", { level: 1, name: "내 차례" })).toBeVisible();
    await page.context().close();
  });
});
