import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenses } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";
import { loginAsSysadmin } from "./row-actions-helpers";

// 06.1-14 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격: 관리자(코드표) · 기안자(올린 사람) · 경영관리(전사 보는 범위 임시 계급 — 남의 파일을 붙인 사람) · 결재자(팀장 — 남의 파일을 보면 안 된다) ·
// 대표(전사 보는 범위 · 결재 시트 「파일 이름 둘」 판정용 — 넷째 차례 문서 B).
// 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다 — 06.1-14-DOM-AUDIT.md의 원자료다.
// CAPTURE_DIR이 있으면 「캡처」 묶음만 의미가 있다 — BASE(b4cd09a) worktree에도 같은 파일을 복사해 돌려 PNG · DOM 쌍을 만든다(이 묶음은 헤드 전용 모듈을 쓰지 않는다).

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const CAPTURE_WIDTHS = [375, 320, 768, 1280] as const;
// test-results/는 Playwright가 실행마다 비운다 — 원자료는 AUDIT_OUT(실행 밖 경로)으로 받는다.
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-private-type-audit.jsonl";
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? "";
const PRIVATE_VALUE = "personal_card_receipt";
const PRIVATE_LINE = "개인카드 전표 · 경영관리만";
const SHEET_NOTICE = "비공개 증빙 · 경영관리만";
const FIELD_LABEL = "올린 사람 · 경영관리만 보기";
const PHONE_PREFIX = "올린 사람 · 경영관리만 · ";
const UPLOAD_FAILED = "올리지 못함 · 다시 올리기";
const CODE_TABLE_URL = "/admin/code-tables?tableKey=evidence_type&includeInactive=1";

function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: boolean | null): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

async function privateItemId(): Promise<string> {
  const [row] = await db
    .select({ id: codeItems.id })
    .from(codeItems)
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
  if (!row) throw new Error("개인카드 전표 코드 항목 없음");
  return row.id;
}

async function privateFlag(): Promise<boolean> {
  const [row] = await db
    .select({ v: codeItems.privateToOwner })
    .from(codeItems)
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
  return row?.v ?? false;
}

async function setPrivate(value: boolean): Promise<void> {
  await db.update(codeItems).set({ privateToOwner: value }).where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
}

async function overflow(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
}

// 경영관리 — 05-09 임시 계급(전사 보는 범위 · 결재 중 증빙 붙이기) + 06.1 등록(증빙 기록 보기)과 같은 권한.
async function evidenceManager(): Promise<Person> {
  const person = await makeEvidenceManagerE2E();
  const roleId = person.viewer.roleId;
  if (!roleId) throw new Error("계급 없음");
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  for (const infoItem of ["evidence.value", "evidence.amount", "expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  return person;
}

// 경영관리가 결재 중 문서에 자기 파일 하나를 화면으로 붙인다(남의 파일 — 기안자 · 결재자에게는 숨는다).
async function attachAsManager(browser: Browser, baseURL: string | undefined, manager: Person, expenseId: string): Promise<void> {
  const page = await loginPage(browser, baseURL, manager);
  await page.goto(`/expenses/${expenseId}`);
  const input = page.getByTestId("attachments-input");
  await expect(input).toHaveCount(1);
  await waitForHydration(page.locator('[data-ui="attachments"]').first());
  const before = await page.locator('[data-ui="attachments"] li').count();
  await input.setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li')).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toHaveCount(before + 1, { timeout: 30_000 });
  await page.context().close();
}

async function linkPrivateRecord(expenseId: string, by: string): Promise<void> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "감사 개인카드.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [rec] = await db
    .insert(evidenceRecords)
    .values({ batchId: batch.id, format: "hometax-tax-invoice", evidenceType: PRIVATE_VALUE, dedupeKey: `audit14:${randomUUID()}`, issuedOn: "2026-09-20", supplyKrw: 33_000, vatKrw: 0, totalKrw: 33_000, nameOnDocument: "감사개인카드사", createdBy: by })
    .returning({ id: evidenceRecords.id });
  if (!rec) throw new Error("증빙 기록 없음");
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: rec.id, ownerKind: "expense", ownerId: expenseId, attachMode: "registrar", attachedBy: by });
}

type Seed = { fx: ExpenseE2E; manager: Person; a: string; b: string; itemA: string; itemB: string; itemId: string };
let seed: Seed | null = null;

test.describe("06.1-14 감사", () => {
  test.skip(!!CAPTURE_DIR, "캡처 실행에서는 감사 묶음을 건너뛴다");

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    await setPrivate(true);
    const fx = await setupExpenseE2E();
    const manager = await evidenceManager();
    // A — 결재 중(팀장 차례): 기안자 파일 1 + 경영관리 파일 1 + G15 종류 붙은 기록 1.
    const a = await submitLineExpense(browser, baseURL, fx, "tracer");
    await db.update(expenses).set({ evidenceType: PRIVATE_VALUE }).where(eq(expenses.id, a));
    await attachAsManager(browser, baseURL, manager, a);
    await linkPrivateRecord(a, manager.viewer.id);
    // B — 대표 차례(전사 보는 범위 결재자): 기안자 파일 1 + 경영관리 파일 1.
    const b = await submitLineExpense(browser, baseURL, fx, "hold");
    await db.update(expenses).set({ evidenceType: PRIVATE_VALUE }).where(eq(expenses.id, b));
    await attachAsManager(browser, baseURL, manager, b);
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: b });
    if (!view) throw new Error("결재 인스턴스 없음");
    let version = view.version;
    for (const approver of [fx.lead, fx.divisionHead, fx.mgmt]) {
      version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
    }
    seed = { fx, manager, a, b, itemA: fx.lines.tracer.itemName, itemB: fx.lines.hold.itemName, itemId: await privateItemId() };
  });

  test.afterAll(async () => {
    await db
      .update(codeItems)
      .set({ privateToOwner: true, active: false })
      .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
    await archiveTempRoles();
  });

  test("코드표 체크박스 — 관리자 · 폭 여섯", async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    if (!seed) throw new Error("시드 없음");
    const { itemId } = seed;
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await loginAsSysadmin(page);
    const detailSel = `xpath=//th[@id="code-row-${itemId}"]/parent::tr/following-sibling::tr[@data-ui="static-table-detail"][1]`;
    for (const width of WIDTHS) {
      await setPrivate(true);
      await page.setViewportSize({ width, height: 900 });
      const res = await page.goto(CODE_TABLE_URL);
      record("응답 코드", width, "관리자", CODE_TABLE_URL, res?.status(), 200, res?.status() === 200);
      const detail = page.locator(detailSel);
      await expect(detail).toHaveCount(1);
      const dom = await detail.evaluate((tr, id) => {
        const label = tr.querySelector<HTMLLabelElement>(`label[for="private-to-owner-${id}"]`);
        const input = tr.querySelector<HTMLInputElement>(`#private-to-owner-${id}`);
        const visible = (el: Element | null) => !!el && (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        const checkboxes = [...tr.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
        // 화면 밖 좌표는 elementFromPoint가 null이다 — 라벨을 가운데로 굴린 뒤 잰다.
        label?.scrollIntoView({ block: "center" });
        const lr = label?.getBoundingClientRect();
        const hit = lr && lr.width > 0 ? document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2) : null;
        const phoneText = [...tr.querySelectorAll("div")].map((d) => d.textContent ?? "").find((t) => t.startsWith("올린 사람 · 경영관리만 · ")) ?? null;
        const phoneVisible = [...tr.querySelectorAll("div")].some((d) => (d.textContent ?? "").startsWith("올린 사람 · 경영관리만 · ") && d.getClientRects().length > 0 && !d.querySelector("div"));
        return {
          labelText: label?.textContent?.trim() ?? null,
          labelFor: label?.htmlFor ?? null,
          inputType: input?.type ?? null,
          inputChecked: input?.checked ?? null,
          inputLabels: input?.labels ? [...input.labels].map((l) => l.textContent?.trim()) : [],
          visibleCheckboxes: checkboxes.filter(visible).length,
          labelVisible: visible(label),
          labelBox: lr ? ([Math.round(lr.width), Math.round(lr.height)] as [number, number]) : null,
          hitIsLabel: !!hit && !!label && (hit === label || label.contains(hit)),
          hitWhat: hit ? `${hit.tagName.toLowerCase()}#${hit.id}.${typeof hit.className === "string" ? hit.className : ""} «${(hit.textContent ?? "").trim().slice(0, 30)}»` : null,
          phoneText,
          phoneVisible,
        };
      }, itemId);
      record("label[for] 연결", width, "관리자", CODE_TABLE_URL, { for: dom.labelFor, labels: dom.inputLabels }, `private-to-owner-${itemId} · [${FIELD_LABEL}]`, dom.labelFor === `private-to-owner-${itemId}` && dom.inputLabels.length === 1 && dom.inputLabels[0] === FIELD_LABEL);
      record("체크박스 type · 초기 checked", width, "관리자", CODE_TABLE_URL, { type: dom.inputType, checked: dom.inputChecked }, { type: "checkbox", checked: true }, dom.inputType === "checkbox" && dom.inputChecked === true);
      const [sw, cw] = await overflow(page);
      record("문서 scrollWidth <= clientWidth", width, "관리자", CODE_TABLE_URL, `${sw}/${cw}`, "scrollWidth <= clientWidth", sw <= cw);
      if (width < 700) {
        record("700 미만 보이는 체크박스 0", width, "관리자", CODE_TABLE_URL, dom.visibleCheckboxes, 0, dom.visibleCheckboxes === 0);
        record("700 미만 값 글자 `올린 사람 · 경영관리만 · …`", width, "관리자", CODE_TABLE_URL, { text: dom.phoneText, visible: dom.phoneVisible }, `${PHONE_PREFIX}… 보임`, !!dom.phoneText?.startsWith(PHONE_PREFIX) && dom.phoneVisible);
        continue;
      }
      record("700 이상 라벨 보임 · 상자", width, "관리자", CODE_TABLE_URL, { visible: dom.labelVisible, box: dom.labelBox }, "보임 · 넓이 > 0", dom.labelVisible && !!dom.labelBox && dom.labelBox[0] > 0 && dom.labelBox[1] > 0);
      record("라벨 중심 hit = 라벨", width, "관리자", CODE_TABLE_URL, { hit: dom.hitIsLabel, what: dom.hitWhat }, true, dom.hitIsLabel);
      const checkbox = page.locator(`#private-to-owner-${itemId}`);
      await waitForHydration(checkbox);
      // 클릭 영역 = 라벨 상자 — 라벨 중심을 눌러 바뀌는지.
      await page.locator(`label[for="private-to-owner-${itemId}"]`).click();
      const afterClick = await checkbox.isChecked();
      await expect.poll(privateFlag, { timeout: 10_000 }).toBe(false).catch(() => undefined);
      record("라벨 클릭 → 꺼짐(화면 · DB)", width, "관리자", CODE_TABLE_URL, { checked: afterClick, db: await privateFlag() }, { checked: false, db: false }, afterClick === false && (await privateFlag()) === false);
      // Tab으로 들어와 Space — 앞 탭 가능 요소에 포커스를 두고 Tab.
      await page.evaluate((id) => {
        const target = document.getElementById(`private-to-owner-${id}`);
        const tabbables = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && el.tabIndex >= 0,
        );
        const index = target ? tabbables.indexOf(target) : -1;
        tabbables[index - 1]?.focus();
      }, itemId);
      await page.keyboard.press("Tab");
      const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
      record("Tab → 체크박스 포커스", width, "관리자", CODE_TABLE_URL, focusedId, `private-to-owner-${itemId}`, focusedId === `private-to-owner-${itemId}`);
      await page.keyboard.press("Space");
      const afterSpace = await checkbox.isChecked();
      await expect.poll(privateFlag, { timeout: 10_000 }).toBe(true).catch(() => undefined);
      const focusAfter = await page.evaluate(() => document.activeElement?.id ?? "");
      record("Space → 켜짐(화면 · DB)", width, "관리자", CODE_TABLE_URL, { checked: afterSpace, db: await privateFlag() }, { checked: true, db: true }, afterSpace === true && (await privateFlag()) === true);
      record("Space 뒤 포커스 남음", width, "관리자", CODE_TABLE_URL, focusAfter, `private-to-owner-${itemId}`, focusAfter === `private-to-owner-${itemId}`);
    }
    await setPrivate(true);
    await context.close();
  });

  // 문서 화면 — 자격 셋 × 폭 여섯. 기대: 기안자 = 자기 파일 1 · 결재자 = 0 + 잠김 줄 · 경영관리 = 둘 · 잠김 줄 없음.
  async function measureDocument(page: Page, role: "기안자" | "결재자" | "경영관리", width: number, expenseId: string): Promise<void> {
    const url = `/expenses/${expenseId}`;
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto(url);
    record("응답 코드", width, role, url, res?.status(), 200, res?.status() === 200);
    await waitForHydration(page.locator('[data-ui="attachments"]').first());
    const dom = await page.evaluate(() => {
      const root = document.querySelector('[data-ui="attachments"]');
      const lis = root ? root.querySelectorAll("li").length : 0;
      const locked = root ? [...root.querySelectorAll(":scope > p")].map((p) => ({ text: (p.textContent ?? "").trim(), tag: p.tagName.toLowerCase(), cls: p.className })) : [];
      const allText = document.querySelector("main")?.textContent ?? "";
      const privateLines = [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() === "개인카드 전표 · 경영관리만").length;
      const linkIds = new Set([...document.querySelectorAll('[id^="evidence-link-title-"]')].map((el) => el.id));
      return {
        lis,
        locked,
        privateLines,
        linked: linkIds.size,
        linkedText: allText.includes("감사개인카드사"),
        primary: [...document.querySelectorAll('[data-ui="primary-button"]')].filter((el) => !el.closest("dialog")).length,
        input: document.querySelectorAll('[data-testid="attachments-input"]').length,
      };
    });
    const expectLis = role === "기안자" ? 1 : role === "결재자" ? 0 : 2;
    record("[data-ui=attachments] li 수", width, role, url, dom.lis, expectLis, dom.lis === expectLis);
    if (role === "결재자") {
      record("잠김 줄 `개인카드 전표 · 경영관리만` 1", width, role, url, dom.privateLines, 1, dom.privateLines === 1);
      const shape = dom.locked.find((l) => l.text === PRIVATE_LINE);
      record("잠김 줄 요소 꼴(Attachments 직속 p · locked 클래스)", width, role, url, shape ?? null, "p · class*=locked", !!shape && shape.tag === "p" && /locked/.test(shape.cls));
    } else {
      record("잠김 줄 `개인카드 전표 · 경영관리만` 0", width, role, url, dom.privateLines, 0, dom.privateLines === 0);
      record("Attachments 잠김 줄(참고 — 05 잠김 우선)", width, role, url, dom.locked, "참고", null);
    }
    const expectLinked = role === "경영관리" ? 1 : 0;
    record("붙은 G15 기록 행 수", width, role, url, { rows: dom.linked, name: dom.linkedText }, { rows: expectLinked, name: role === "경영관리" }, dom.linked === expectLinked && dom.linkedText === (role === "경영관리"));
    const [sw, cw] = await overflow(page);
    record("문서 scrollWidth <= clientWidth", width, role, url, `${sw}/${cw}`, "scrollWidth <= clientWidth", sw <= cw);
    // 1차 버튼 DOM 수 그대로 — 속성을 끈 같은 화면과 견준다.
    await setPrivate(false);
    await page.reload();
    await waitForHydration(page.locator('[data-ui="attachments"]').first());
    const off = await page.evaluate(() => ({
      primary: [...document.querySelectorAll('[data-ui="primary-button"]')].filter((el) => !el.closest("dialog")).length,
      lis: document.querySelector('[data-ui="attachments"]')?.querySelectorAll("li").length ?? 0,
    }));
    await setPrivate(true);
    record("1차 버튼 수(켬 = 끔)", width, role, url, { on: dom.primary, off: off.primary }, "같음", dom.primary === off.primary);
    record("속성 끔 대조 — li 수(참고)", width, role, url, off.lis, "참고", null);
  }

  for (const role of ["기안자", "결재자", "경영관리"] as const) {
    test(`문서 화면 — ${role} · 폭 여섯`, async ({ browser, baseURL }) => {
      test.setTimeout(600_000);
      if (!seed) throw new Error("시드 없음");
      const person = role === "기안자" ? seed.fx.pm : role === "결재자" ? seed.fx.lead : seed.manager;
      const page = await loginPage(browser, baseURL, person);
      for (const width of WIDTHS) await measureDocument(page, role, width, seed.a);
      await page.context().close();
    });
  }

  test("서명 불일치 올리기 — 경영관리 · 폭 여섯", async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    if (!seed) throw new Error("시드 없음");
    const url = `/expenses/${seed.a}`;
    const page = await loginPage(browser, baseURL, seed.manager);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await waitForHydration(page.locator('[data-ui="attachments"]').first());
      const before = await page.locator('[data-ui="attachments"] li').count();
      const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n%audit\n"), randomBytes(4096), Buffer.from("\n%%EOF\n")]);
      await page.getByTestId("attachments-input").setInputFiles({ name: `서명불일치-${width}.png`, mimeType: "image/png", buffer: pdf });
      const failed = page.locator('[data-ui="attachments"]').getByText(UPLOAD_FAILED, { exact: false });
      await failed.first().waitFor({ timeout: 30_000 }).catch(() => undefined);
      const dom = await page.evaluate(() => {
        const root = document.querySelector('[data-ui="attachments"]');
        const texts = root ? [...root.querySelectorAll("*")].filter((el) => el.children.length === 0).map((el) => (el.textContent ?? "").trim()).filter(Boolean) : [];
        return { failText: texts.filter((t) => t.includes("올리지 못함")), retry: texts.filter((t) => t === "다시 올리기").length, hasName: texts.some((t) => t.includes("서명불일치")) };
      });
      const joined = (await failed.allTextContents()).map((t) => t.trim());
      record("오류 글 `올리지 못함 · 다시 올리기`", width, "경영관리", url, { failText: dom.failText, matched: joined }, UPLOAD_FAILED, joined.some((t) => t.includes(UPLOAD_FAILED)) || (dom.failText.some((t) => t.startsWith("올리지 못함")) && dom.retry > 0));
      const fileRows = await page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/).count();
      record("완료 파일 행 수 그대로(불일치 파일 안 붙음)", width, "경영관리", url, { before, completed: fileRows }, `완료 행 = ${before}`, fileRows === before);
      const [sw, cw] = await overflow(page);
      record("문서 scrollWidth <= clientWidth(오류 뒤)", width, "경영관리", url, `${sw}/${cw}`, "scrollWidth <= clientWidth", sw <= cw);
    }
    await page.context().close();
  });

  async function openSheet(page: Page, itemName: string): Promise<boolean> {
    await page.goto("/approvals");
    const trigger = page.getByRole("button", { name: new RegExp(`지출결의 · .*${itemName}`) }).first();
    // goto 직후 즉시 스냅숏(count)이 아니라 나타남을 기다린다 — 없는 게 정답인 경우만 false.
    await trigger.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    if ((await trigger.count()) === 0) {
      const diag = await page.evaluate(() => ({
        url: location.href,
        body: document.body.innerText.slice(0, 2000),
        buttons: [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()).filter((t) => t.startsWith("지출결의 · ")),
      }));
      await test.info().attach(`approvals-miss-${itemName}`, { body: JSON.stringify(diag, null, 2), contentType: "application/json" });
      return false;
    }
    await waitForHydration(trigger);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").locator("dt", { hasText: /^증빙$/ })).toHaveCount(1, { timeout: 15_000 }).catch(() => undefined);
    return true;
  }

  async function sheetDom(page: Page) {
    return page.getByRole("dialog").evaluate((dialog) => {
      const dt = [...dialog.querySelectorAll("dt")].filter((el) => (el.textContent ?? "").trim() === "증빙");
      const dd = dt.map((el) => el.nextElementSibling).filter((el): el is Element => !!el && el.tagName === "DD");
      return {
        dt: dt.length,
        ddText: dd.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()),
        sheetEvidence: dialog.querySelectorAll('[data-testid="sheet-evidence"]').length,
        names: [...dialog.querySelectorAll('[data-testid="sheet-evidence"] li')].map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()),
        notice: [...dialog.querySelectorAll("*")].filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() === "비공개 증빙 · 경영관리만").length,
        sw: (dialog as HTMLElement).scrollWidth,
        cw: (dialog as HTMLElement).clientWidth,
      };
    });
  }

  test("결재 시트 — 결재자(A) · 대표(B) · 폭 여섯", async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    if (!seed) throw new Error("시드 없음");
    const lead = await loginPage(browser, baseURL, seed.fx.lead);
    const ceo = await loginPage(browser, baseURL, seed.fx.ceo);
    for (const width of WIDTHS) {
      await lead.setViewportSize({ width, height: 900 });
      const opened = await openSheet(lead, seed.itemA);
      record("결재자 시트 열림", width, "결재자", "/approvals", opened, true, opened);
      if (opened) {
        const s = await sheetDom(lead);
        record("결재자 시트 [data-testid=sheet-evidence] 0", width, "결재자", "/approvals", s.sheetEvidence, 0, s.sheetEvidence === 0);
        record("결재자 dt 「증빙」 다음 dd = 비공개 증빙 · 경영관리만", width, "결재자", "/approvals", s.ddText, [SHEET_NOTICE], s.ddText.length === 1 && s.ddText[0] === SHEET_NOTICE);
        record("결재자 시트 파일 이름 · 건수 없음", width, "결재자", "/approvals", s.ddText, "jpg · N건 없음", !s.ddText.some((t) => /\.jpg|\d+건/.test(t)));
        const [sw, cw] = await overflow(lead);
        record("결재자 문서 scrollWidth <= clientWidth(시트)", width, "결재자", "/approvals", `${sw}/${cw} · 시트 ${s.sw}/${s.cw}`, "scrollWidth <= clientWidth", sw <= cw && s.sw <= s.cw);
      }
      await ceo.setViewportSize({ width, height: 900 });
      const ceoOpened = await openSheet(ceo, seed.itemB);
      record("대표 시트 열림", width, "대표(전사)", "/approvals", ceoOpened, true, ceoOpened);
      if (ceoOpened) {
        const s = await sheetDom(ceo);
        record("대표 시트 파일 이름 둘", width, "대표(전사)", "/approvals", s.names, "li 2 · .jpg", s.names.length === 2 && s.names.every((n) => n.includes(".jpg")));
        record("대표 시트 잠김 행 0", width, "대표(전사)", "/approvals", s.notice, 0, s.notice === 0);
        const [sw, cw] = await overflow(ceo);
        record("대표 문서 scrollWidth <= clientWidth(시트)", width, "대표(전사)", "/approvals", `${sw}/${cw} · 시트 ${s.sw}/${s.cw}`, "scrollWidth <= clientWidth", sw <= cw && s.sw <= s.cw);
      }
    }
    await lead.context().close();
    await ceo.context().close();
  });
});

// 캡처 — BASE · 헤드 같은 파일로. 화면 셋(관리 코드표 · 결재자 문서 화면 · 결재 시트) × 폭 넷 PNG + DOM 요소 서명(JSON).
test.describe("06.1-14 캡처", () => {
  test.skip(!CAPTURE_DIR, "CAPTURE_DIR 없음");

  async function signature(page: Page, scope: "main" | "dialog") {
    return page.evaluate((where) => {
      // 네이티브 <dialog>는 role 속성이 없다 — 열린 dialog를 먼저 찾는다.
      const root = where === "dialog" ? document.querySelector('dialog[open], [role="dialog"]') : document.querySelector("main");
      if (!root) return { elements: [] as string[], facts: {} };
      const norm = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[0-9a-f]{4,}|\d+/gi, "#");
      const elements = [...root.querySelectorAll("*")]
        .filter((el) => (el as HTMLElement).getClientRects().length > 0)
        .map((el) => {
          const ui = el.getAttribute("data-ui") ?? el.getAttribute("data-testid");
          const leaf = el.children.length === 0 ? norm(el.textContent ?? "").slice(0, 40) : "";
          return `${el.tagName.toLowerCase()}${ui ? `[${ui}]` : ""}${(el as HTMLInputElement).type === "checkbox" ? "[checkbox]" : ""}${leaf ? ` «${leaf}»` : ""}`;
        });
      const att = document.querySelector('[data-ui="attachments"]');
      return {
        elements,
        facts: {
          checkboxesVisible: [...root.querySelectorAll('input[type="checkbox"]')].filter((el) => (el as HTMLElement).getClientRects().length > 0).length,
          attachmentsLi: att ? att.querySelectorAll("li").length : null,
          lockedLines: att ? [...att.querySelectorAll(":scope > p")].map((p) => (p.textContent ?? "").trim()) : [],
          sheetEvidence: root.querySelectorAll('[data-testid="sheet-evidence"] li').length,
          sheetEvidenceDd: [...root.querySelectorAll("dt")].filter((d) => (d.textContent ?? "").trim() === "증빙").map((d) => (d.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\d+/g, "#")),
          scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
        },
      };
    }, scope);
  }

  test("화면 셋 × 폭 넷", async ({ browser, baseURL }) => {
    test.setTimeout(900_000);
    await setPrivate(true);
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    await db.update(expenses).set({ evidenceType: PRIVATE_VALUE }).where(eq(expenses.id, expenseId));
    const itemId = await privateItemId();
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const dom: Record<string, unknown> = {};

    const admin = await browser.newPage({ baseURL });
    await loginAsSysadmin(admin);
    const lead = await loginPage(browser, baseURL, fx.lead);
    for (const width of CAPTURE_WIDTHS) {
      await admin.setViewportSize({ width, height: 900 });
      await admin.goto(CODE_TABLE_URL);
      const row = admin.locator(`xpath=//th[@id="code-row-${itemId}"]/parent::tr`);
      await row.scrollIntoViewIfNeeded();
      await admin.screenshot({ path: join(CAPTURE_DIR, `code-tables-${width}.png`), fullPage: true });
      dom[`code-tables-${width}`] = await signature(admin, "main");

      await lead.setViewportSize({ width, height: 900 });
      await lead.goto(`/expenses/${expenseId}`);
      await waitForHydration(lead.locator('[data-ui="attachments"]').first());
      await lead.screenshot({ path: join(CAPTURE_DIR, `approver-document-${width}.png`), fullPage: true });
      dom[`approver-document-${width}`] = await signature(lead, "main");

      await lead.goto("/approvals");
      const trigger = lead.getByRole("button", { name: new RegExp(`지출결의 · .*${fx.lines.tracer.itemName}`) }).first();
      await waitForHydration(trigger);
      await trigger.click();
      await expect(lead.getByRole("dialog")).toBeVisible();
      await expect(lead.getByRole("dialog").locator("dt", { hasText: /^증빙$/ })).toHaveCount(1, { timeout: 15_000 }).catch(() => undefined);
      await lead.waitForTimeout(500);
      await lead.screenshot({ path: join(CAPTURE_DIR, `approval-sheet-${width}.png`) });
      dom[`approval-sheet-${width}`] = await signature(lead, "dialog");
    }
    writeFileSync(join(CAPTURE_DIR, "dom.json"), JSON.stringify(dom, null, 1));
    await admin.close();
    await lead.context().close();
    await db
      .update(codeItems)
      .set({ privateToOwner: true, active: false })
      .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
  });
  // Codex 후보(06.1-14-codex-design-evidence-type.md #1~#5) 확인용 DOM 실측 — BASE · 헤드 같은 측정. 판정은 이 값으로만 한다.
  test("Codex 후보 실측", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    await setPrivate(true);
    const itemId = await privateItemId();
    const admin = await browser.newPage({ baseURL });
    await loginAsSysadmin(admin);
    const out: Record<string, unknown> = {};
    for (const width of [1280, 375, 320] as const) {
      await admin.setViewportSize({ width, height: 900 });
      await admin.goto(CODE_TABLE_URL);
      await expect(admin.locator(`th#code-row-${itemId}`)).toHaveCount(1);
      out[String(width)] = await admin.evaluate((id) => {
        const box = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
        };
        const lines = (el: Element) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
        };
        // 첫 증빙 종류(세금계산서)의 전폭 줄 — 후보 #1이 가리킨 tr:nth-of-type(3).
        void id;
        const detail = document.querySelector('main table tbody tr[data-ui="static-table-detail"]');
        const dtd = detail?.querySelector("td") ?? null;
        const section = dtd ? [...dtd.querySelectorAll("div")].find((d) => d.getClientRects().length > 0 && getComputedStyle(d).display !== "contents") ?? null : null;
        const kids = dtd ? [...dtd.querySelectorAll("label, input, select")].filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect()) : [];
        const tbody = document.querySelector("main table tbody");
        const rows = tbody ? [...tbody.children].slice(0, 4) : [];
        const nav = document.querySelector('nav[class*="tableNav"]');
        const navLinks = nav ? [...nav.querySelectorAll("a")].map((a) => a.getBoundingClientRect()) : [];
        return {
          detailUi: detail?.getAttribute("data-ui") ?? null,
          detailTd: box(dtd),
          section: section ? { ...box(section), maxWidth: getComputedStyle(section).maxWidth, cls: section.className } : null,
          contentExtent: kids.length ? { left: Math.round(Math.min(...kids.map((k) => k.left))), right: Math.round(Math.max(...kids.map((k) => k.right))), tops: [...new Set(kids.map((k) => Math.round(k.top)))].length } : null,
          fields: dtd ? [...dtd.querySelectorAll("label, input, select")].filter((el) => el.getClientRects().length > 0).map((el) => { const r = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()} ${Math.round(r.left)}-${Math.round(r.right)} @${Math.round(r.top)}`; }) : [],
          rows: rows.map((tr) => ({
            cls: tr.className,
            ui: tr.getAttribute("data-ui"),
            h: Math.round(tr.getBoundingClientRect().height),
            borderBottom: [getComputedStyle(tr).borderBottomWidth, ...[...tr.children].map((c) => getComputedStyle(c).borderBottomWidth)].join(","),
            cells: [...tr.children].map((c) => ({ text: (c.textContent ?? "").trim().slice(0, 30), h: Math.round(c.getBoundingClientRect().height), lines: lines(c), pad: `${getComputedStyle(c).paddingTop}/${getComputedStyle(c).paddingBottom}` })),
          })),
          nav: nav ? { ...box(nav), linkTops: [...new Set(navLinks.map((r) => Math.round(r.top)))], linkH: [...new Set(navLinks.map((r) => Math.round(r.height)))], rowGap: getComputedStyle(nav).rowGap, display: getComputedStyle(nav).display } : null,
        };
      }, itemId);
    }
    mkdirSync(CAPTURE_DIR, { recursive: true });
    writeFileSync(join(CAPTURE_DIR, "codex-candidates.json"), JSON.stringify(out, null, 1));
    await admin.close();
  });
});
