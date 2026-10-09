import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createCodeItem, setCodeItemActive, setEvidenceTypeTaxRule } from "@/domain/code-tables";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setupExpenseE2E, submitLineExpense, insertTempRole, type ExpenseE2E } from "./expense-fixture";

// 05-13 Task 2(UI-SPEC responsive S2 · S3 · S8 · S9 · overflow S5 backstop): 폭 375(프로젝트) · 320(파일 안 새 컨텍스트)에서
// 지출결의 목록 · 폼(외화 · 회사 대납 · 13자리 계산 한 줄) · 폰 행 시트 · 결재함 · 결재 시트가 가로로 넘치지 않는다(`scrollWidth ≤ clientWidth`).
// 폼 제출 줄은 하단 탭 위에 고정되고 결재선을 가리지 않으며, 목록 · 결재함 행과 3차 행동은 높이 ≥ 44다.

const WIDTHS = [
  { width: 375, height: 800 },
  { width: 320, height: 640 },
] as const;
const TOUCH_MIN = 44;

// 문서가 가로로 넘치면 처음 경계를 넘는 요소(부모는 안 넘고 자신은 넘는 요소)를 실패 메시지에 적는다(mobile-320-no-overflow와 같은 잣대).
async function expectNoOverflow(page: Page, label: string): Promise<void> {
  const measured = await page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth + 0.5;
    const overflows = (el: Element | null): boolean => !!el && el.getBoundingClientRect().right > limit;
    const culprits: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!overflows(el) || overflows(el.parentElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      culprits.push(`${el.tagName.toLowerCase()} right=${Math.round(rect.right)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, culprits };
  });
  expect(measured.scrollWidth, `${label} 가로 넘침\n  ${measured.culprits.join("\n  ")}`).toBeLessThanOrEqual(measured.clientWidth);
}

async function expectTouchHeight(target: Locator, label: string): Promise<void> {
  const box = await target.boundingBox();
  expect(box, `${label} 상자`).toBeTruthy();
  expect(box!.height, `${label} 높이`).toBeGreaterThanOrEqual(TOUCH_MIN - 0.5);
}

async function phone(browser: Browser, baseURL: string | undefined, person: Person, viewport: (typeof WIDTHS)[number]): Promise<Page> {
  return loginPage(browser, baseURL, person, viewport);
}

// 제목 요소가 한 줄인지: 글자 상자가 한 줄(범위 사각형 1개) · white-space nowrap · text-overflow ellipsis · 실제로 잘렸다(scrollWidth > clientWidth).
async function expectOneLineTitle(title: Locator, label: string): Promise<void> {
  const measured = await title.evaluate((el) => {
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).map((r) => `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    return {
      rects,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      overflow: style.overflow,
      lines: new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size,
      clipped: el.scrollWidth > el.clientWidth,
    };
  });
  expect(measured.whiteSpace, `${label} white-space`).toBe("nowrap");
  expect(measured.textOverflow, `${label} text-overflow`).toBe("ellipsis");
  expect(measured.overflow, `${label} overflow`).toBe("hidden");
  expect(measured.lines, `${label} 글자 줄 수 ${measured.rects.join(' | ')}`).toBe(1);
  expect(measured.clipped, `${label} 실제로 잘림`).toBe(true);
}


// 제목 글자 범위의 세로 가운데가 링크 상자의 세로 가운데와 ±1px 안인지(처리함 `.rowLink`의 padding-block 가운데 맞춤).
async function expectTextCentered(title: Locator, label: string): Promise<void> {
  const measured = await title.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { textCenter: text.top + text.height / 2, boxCenter: box.top + box.height / 2 };
  });
  expect(Math.abs(measured.textCenter - measured.boxCenter), `${label} 글자 세로 가운데 (글자 ${measured.textCenter.toFixed(2)} · 상자 ${measured.boxCenter.toFixed(2)})`).toBeLessThanOrEqual(1);
}

// 지급 권한자(팀 업무 범위 · 지출결의 보기 + 지급 처리) — payment-batch.spec의 makeTeamPayer와 같은 구성.
async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const [team] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!team?.teamId) throw new Error("프로젝트 팀 없음");
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E제목지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return makePerson("경영관리", role.id, team.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

// 회사 대납 규칙 증빙 종류(시드에 없다 — 이 스펙만 쓰고 끝에서 끈다). 이름이 길수록 `… 규칙` 조각이 길다.
async function companyBorneEvidenceType(): Promise<{ id: string; value: string; label: string }> {
  const suffix = randomUUID().slice(0, 6);
  const label = `경품 회사 대납 원천세 포함 지급-${suffix}`;
  const item = await createCodeItem(SYSTEM_VIEWER, { tableKey: "evidence_type", value: `e2e_cb_${suffix}`, label });
  await setEvidenceTypeTaxRule(SYSTEM_VIEWER, item.id, { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" });
  return { id: item.id, value: item.value, label };
}

test.describe("지출결의 폭 375 · 320 (05-13)", () => {
  test("목록 · 결재함 · 결재 시트 — 가로 넘침 0 · 행 높이 ≥ 44", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "worst");
    const label = `지출결의 · ${fx.projectName} · ${fx.lines.worst.itemName}`;

    for (const viewport of WIDTHS) {
      const pm = await phone(browser, baseURL, fx.pm, viewport);
      await pm.goto("/expenses");
      const listRow = pm.getByRole("row").filter({ hasText: fx.lines.worst.itemName });
      await expect(listRow).toHaveCount(1);
      await expectNoOverflow(pm, `목록 ${viewport.width}`);
      await expectTouchHeight(listRow, `목록 행 ${viewport.width}`);
      await pm.context().close();

      const lead = await phone(browser, baseURL, fx.lead, viewport);
      await lead.goto("/approvals");
      const trigger = lead.getByRole("button", { name: label });
      await waitForHydration(trigger);
      await expectNoOverflow(lead, `결재함 ${viewport.width}`);
      await expectTouchHeight(lead.getByRole("row").filter({ has: trigger }), `결재함 행 ${viewport.width}`);
      await trigger.click();
      const sheet = lead.getByRole("dialog");
      await expect(sheet.getByRole("button", { name: "승인" })).toBeVisible();
      await expectNoOverflow(lead, `결재 시트 ${viewport.width}`);
      await expectTouchHeight(sheet.getByRole("button", { name: "승인" }), `결재 시트 승인 ${viewport.width}`);
      await lead.context().close();
    }
  });

  test("폰 행 시트 — 긴 항목 · 긴 비고에서 넘침 0, 본문 끝까지 스크롤하면 3차 `지출결의 올리기` 높이 ≥ 44", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    for (const viewport of WIDTHS) {
      const page = await phone(browser, baseURL, fx.pm, viewport);
      await page.goto(`/projects/${fx.projectId}`);
      const tap = page.getByRole("button", { name: `${fx.lines.worst.itemName} 상세 보기` });
      await waitForHydration(tap);
      await expectNoOverflow(page, `프로젝트 견적 줄 ${viewport.width}`);
      await tap.click();
      const sheet = page.getByRole("dialog", { name: fx.lines.worst.itemName });
      await expect(sheet).toBeVisible();
      const action = sheet.getByRole("button", { name: "지출결의 올리기" });
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expectTouchHeight(action, `행 시트 3차 ${viewport.width}`);
      await expectNoOverflow(page, `행 시트 ${viewport.width}`);
      await page.context().close();
    }
  });

  // 05-13 게이트 감사(사용자 확정 10/5 19:52 「끝말도 한 덩어리」): 계산 한 줄 꼬리(`세금계산서 규칙`)는 숫자 조각처럼 한 덩어리 — 줄이 모자라면 통째로 다음 줄로 가고 낱말 중간에서 갈라지지 않는다.
  test("폼 — 계산 한 줄 꼬리는 한 덩어리(통째로 다음 줄로 · 갈라지지 않음)", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const { expenseId } = await createTeamExpenseDraft(fx.pm.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", content: "행사 소품 구매", evidenceType: "tax_invoice", supply: { currency: "KRW", amount: 123_456_789, fxRate: 1 } },
    });
    for (const viewport of WIDTHS) {
      const page = await phone(browser, baseURL, fx.pm, viewport);
      await page.goto(`/expenses/${expenseId}`);
      await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
      const line = page.getByTestId("expense-tax-line");
      await expect(line).toContainText("규칙");
      const tail = await line.evaluate((element) => {
        const segment = element.querySelector(":scope > span:last-child > span:last-child");
        if (!segment) return null;
        const range = document.createRange();
        range.selectNodeContents(segment);
        const lineTops = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)));
        return { text: segment.textContent ?? "", display: getComputedStyle(segment).display, lines: lineTops.size };
      });
      expect(tail?.text, `꼬리 글자 ${viewport.width}`).toMatch(/규칙$/);
      expect(tail?.display, `꼬리는 한 덩어리(inline-block) ${viewport.width}`).toBe("inline-block");
      expect(tail?.lines, `꼬리 「${tail?.text}」 한 줄 ${viewport.width}`).toBe(1);
      await expectNoOverflow(page, `계산 줄 꼬리 ${viewport.width}`);
      await page.context().close();
    }
  });

  // 06-06 DOM 감사 O-2 — 결재 통과 문서의 05 「세율 바뀜」 줄(`부가세 10% 1,240,000 → 1,200,000` 묶음)이 320 값 칸보다 넓어 문서가 12px 넘쳤다.
  // 화살표 앞뒤에서는 꺾일 수 있어 넘침 0. 세율 바뀜은 이 문서 행의 승인 공급가만 바꿔 만든다(전역 세율 · 설정은 그대로).
  test("결재 통과 문서 — 세율 바뀜 줄이 있어도 넘침 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error("결재 인스턴스 없음");
    let version = view.version;
    for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
    const [row] = await db.select({ supplyAmountKrw: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
    if (row?.supplyAmountKrw == null) throw new Error("공급가액 없음");
    await db.update(expenses).set({ supplyAmountKrw: row.supplyAmountKrw - 400_000 }).where(eq(expenses.id, expenseId));

    for (const viewport of WIDTHS) {
      const page = await phone(browser, baseURL, fx.pm, viewport);
      await page.goto(`/expenses/${expenseId}`);
      const drift = page.getByTestId("expense-tax-drift");
      await expect(drift).toBeVisible();
      await expect(drift).toContainText(" → ");
      // 웹 글꼴이 붙기 전 대체 글꼴은 폭이 좁아 넘침이 가려진다 — 글꼴이 다 붙은 뒤 잰다.
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expectNoOverflow(page, `결재 통과 문서 ${viewport.width}`);
      await page.context().close();
    }
  });

  test("폼 — 외화 · 회사 대납 · 13자리 계산 한 줄은 조각 사이에서만 꺾이고 넘침 0, 제출 줄은 하단 탭 위 고정 · 결재선 가림 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const evidence = await companyBorneEvidenceType();
    try {
      // 금액 상한(999,999,999,999원) 바로 아래의 외화 공급가액 — 원화 · 회사 대납 세금 · 지급 총액 조각이 모두 12자리(쉼표 포함 15자)로 가장 길다.
      // 견적 줄 문서는 남은 실행가(픽스처 12,400,000)를 넘는 공급가액이 칸 오류라 상한 없는 팀 비용 문서로 만든다.
      const { expenseId } = await createTeamExpenseDraft(fx.pm.viewer, {
        idempotencyKey: randomUUID(),
        fields: {
          teamExpenseKind: "team_overhead",
          content: "해외 경품 대량 구매 회사 대납",
          evidenceType: evidence.value,
          supply: { currency: "USD", amount: 740_740_740, fxRate: 1_350 },
        },
      });

      for (const viewport of WIDTHS) {
        const page = await phone(browser, baseURL, fx.pm, viewport);
        await page.goto(`/expenses/${expenseId}`);
        await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
        const line = page.getByTestId("expense-tax-line");
        await expect(line).toContainText(/^원화 999,999,999,000 · 회사 대납 세금 22% \d{3}(,\d{3}){3} · 지급 총액 999,999,999,000 · /);
        await expect(line).toContainText(`${evidence.label} 규칙`);
        await expectNoOverflow(page, `폼 ${viewport.width}`);

        // 조각(마지막 `… 규칙` 묶음 제외) 안은 nowrap — 한 줄 높이를 넘지 않는다.
        const segments = await line.evaluate((element) => {
          const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
          return Array.from(element.querySelectorAll(":scope > span > span:last-child"))
            .slice(0, -1)
            .map((segment) => ({ text: segment.textContent ?? "", whiteSpace: getComputedStyle(segment).whiteSpace, height: segment.getBoundingClientRect().height, lineHeight }));
        });
        expect(segments.length).toBeGreaterThanOrEqual(3);
        for (const segment of segments) {
          expect(segment.whiteSpace, `조각 「${segment.text}」`).toBe("nowrap");
          expect(segment.height, `조각 「${segment.text}」 한 줄`).toBeLessThanOrEqual(segment.lineHeight + 1);
        }

        // 제출 줄 — 하단 탭 위 고정, 스크롤 끝에서 결재선(마지막 값 칸)이 가려지지 않는다.
        const bar = page.getByTestId("expense-form-actions");
        await expect(bar).toHaveCSS("position", "fixed");
        const [barBox, tabsBox] = [await bar.boundingBox(), await page.getByRole("navigation", { name: "하단 탭" }).boundingBox()];
        expect(barBox && tabsBox, "제출 줄 · 하단 탭 상자").toBeTruthy();
        expect(barBox!.y + barBox!.height, `제출 줄이 하단 탭 위 ${viewport.width}`).toBeLessThanOrEqual(tabsBox!.y + 1);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const routeBox = await page.locator("dl dd").last().boundingBox();
        const barAfter = await bar.boundingBox();
        expect(routeBox!.y + routeBox!.height, `결재선이 제출 줄에 가려지지 않는다 ${viewport.width}`).toBeLessThanOrEqual(barAfter!.y + 1);
        await page.context().close();
      }
    } finally {
      await setCodeItemActive(SYSTEM_VIEWER, evidence.id, false);
    }
  });

  // 06.2 후속(사용자 결정 2026-10-09 「한 줄로 자름」): 폰에서 지출결의 목록 · 결재함 행의 긴 문서 제목은 줄바꿈하지 않고 한 줄 말줄임이다
  // (폰 행은 최대 두 줄 — 제목 한 줄 + 접힌 줄 한 줄). 전체 제목은 접근성 이름으로 그대로 남는다(링크 · 버튼 이름 = 전체 글자).
  test("긴 문서 제목 — 목록 · 결재함 행의 제목은 한 줄 말줄임 · 전체 이름 유지 · 넘침 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const longName = "2026 하반기 신제품 런칭 팝업스토어 운영 총괄 대행 전국 순회 쇼케이스 및 사후 정산 프로젝트";
    await db.update(projects).set({ name: longName }).where(eq(projects.id, fx.projectId));
    await submitLineExpense(browser, baseURL, fx, "worst");
    const item = fx.lines.worst.itemName;

    for (const viewport of WIDTHS) {
      const pm = await phone(browser, baseURL, fx.pm, viewport);
      await pm.goto("/expenses");
      const link = pm.getByRole("link", { name: new RegExp(item) });
      await expect(link).toHaveCount(1);
      await expect(link).toContainText(longName);
      await expectOneLineTitle(link, `목록 제목 ${viewport.width}`);
      await expectNoOverflow(pm, `목록 ${viewport.width}`);
      await pm.context().close();

      const lead = await phone(browser, baseURL, fx.lead, viewport);
      await lead.goto("/approvals");
      const trigger = lead.getByRole("button", { name: new RegExp(item) });
      await waitForHydration(trigger);
      await expect(trigger).toContainText(longName);
      await expectOneLineTitle(trigger, `결재함 제목 ${viewport.width}`);
      await expectNoOverflow(lead, `결재함 ${viewport.width}`);
      await lead.context().close();
    }
  });

  // 06.2 리뷰 보강 — 처리함 문서 링크(`.rowLink`: inline-flex → block 전환)와 지급 대상 탭 제목(`.titleCell`/`.link`)도 한 줄 말줄임이고,
  // 처리함 링크는 높이 ≥ 44 · 글자가 세로 가운데(±1px)다.
  test("긴 문서 제목 — 처리함 링크 · 지급 대상 탭 제목도 한 줄 말줄임 (처리함은 높이 ≥ 44 · 글자 세로 가운데)", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const longName = "2026 하반기 신제품 런칭 팝업스토어 운영 총괄 대행 전국 순회 쇼케이스 및 사후 정산 프로젝트";
    await db.update(projects).set({ name: longName }).where(eq(projects.id, fx.projectId));
    const expenseId = await submitLineExpense(browser, baseURL, fx, "worst");
    const item = fx.lines.worst.itemName;
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error("결재 인스턴스 없음");
    let version = view.version;
    // 팀장이 먼저 승인 — 팀장 처리함에 문서 링크가 생긴다. 이어서 나머지 결재선을 통과시키고 증빙을 확인해 지급 대상으로 만든다.
    for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
    const [doc] = await db.select({ version: expenses.version, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
    if (!doc?.supply) throw new Error("문서 · 공급가 없음");
    const payer = await makeTeamPayer(fx);
    await confirmEvidence(payer.viewer, { expenseId, version: doc.version, correctedAmountKrw: doc.supply });

    for (const viewport of WIDTHS) {
      const lead = await phone(browser, baseURL, fx.lead, viewport);
      await lead.goto("/approvals");
      const processed = lead.getByRole("link", { name: new RegExp(item) });
      await expect(processed).toHaveCount(1);
      await expect(processed).toContainText(longName);
      await expectOneLineTitle(processed, `처리함 제목 ${viewport.width}`);
      await expectTouchHeight(processed, `처리함 링크 ${viewport.width}`);
      await expectTextCentered(processed, `처리함 링크 ${viewport.width}`);
      await expectNoOverflow(lead, `처리함 ${viewport.width}`);
      await lead.context().close();

      const page = await phone(browser, baseURL, payer, viewport);
      await page.goto("/expenses");
      await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
      const target = page.getByRole("link", { name: new RegExp(item) });
      await expect(target).toHaveCount(1);
      await expect(target).toContainText(longName);
      await expectOneLineTitle(target, `지급 대상 제목 ${viewport.width}`);
      await expectNoOverflow(page, `지급 대상 ${viewport.width}`);
      await page.context().close();
    }
  });
});
