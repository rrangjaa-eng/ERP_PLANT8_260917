import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, files, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { insertTempRole } from "./expense-fixture";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";

// 06-25(EVID-01 카드 몫 · UI-SPEC S7 · S8 · S9 · S13): 카드 전표 — 수정 패널 `증빙` 줄 · 새 건 첫 저장 · S13 첨부 없음 · 폰 사진 축소.
// 사람 · 팀 · 카드는 도메인 함수로 만든다. 업로드는 05 테스트 모드(브라우저 → 서명 PUT → 완료 통보)를 그대로 지난다.
const UPLOAD_WAIT = 20_000;

type Holder = { person: Person; teamId: string; teamName: string; cardId: string; cardLabel: string };

async function makeHolder(): Promise<Holder> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E전표본부-${suffix}` });
  const teamName = `E2E전표팀-${suffix}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
  const person = await makePerson("전표", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const cardLabel = `E2E전표카드-${suffix}`;
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "7788", label: cardLabel, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  return { person, teamId: team.id, teamName, cardId: card.id, cardLabel };
}

async function seedUsage(holder: Holder, amount: number): Promise<string> {
  const input = {
    corpCardId: holder.cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost" as const,
    memo: null,
  };
  const created = await createCardUsage(holder.person.viewer, input, await precheckCardUsage(holder.person.viewer, input));
  return created.id;
}

function editPanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "카드 사용 수정" });
}

function newPanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "카드 사용 등록" });
}

// 목록 표의 `증빙` 열 값(행 하나만 있는 계정) — 머리글 위치로 찾는다.
async function slipCellText(page: Page): Promise<string> {
  const table = page.getByRole("table");
  const headers = await table.locator("thead th").allTextContents();
  const index = headers.findIndex((text) => text.trim() === "증빙");
  expect(index).toBeGreaterThanOrEqual(0);
  return (await table.locator("tbody tr").filter({ has: page.getByRole("cell") }).last().getByRole("cell").nth(index).textContent())?.trim() ?? "";
}

// 05 테스트 모드 업로드가 해시로 중복을 가르므로 호출마다 글자가 다른 그림을 캔버스로 만든다.
async function uniqueImage(page: Page, width = 1200, height = 800): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const tag = randomUUID();
  const base64 = await page.evaluate(
    async ({ label, w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 60px sans-serif";
      ctx.fillText(label, 40, 120);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG를 만들 수 없다");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { label: tag, w: width, h: height },
  );
  return { name: `slip-${tag.slice(0, 8)}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

function fileRows(sheet: Locator): Locator {
  return sheet.locator('[data-ui="attachments"] li');
}

async function slipFileCount(usageId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(files).where(eq(files.ownerId, usageId));
  return row?.n ?? 0;
}

test.describe("카드 전표 (06-25 Task 1 — 수정 패널)", () => {
  test("수정 패널 전표 첨부 → 목록 있음", async ({ browser, baseURL }) => {
    const holder = await makeHolder();
    const usageId = await seedUsage(holder, 33_000);
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards");
    await expect(page.getByRole("table")).toBeVisible();
    expect(await slipCellText(page)).toBe("—");

    const edit = page.getByRole("link", { name: /수정$/ });
    await waitForHydration(edit);
    await edit.click();
    await expect(page).toHaveURL(new RegExp(`editId=${usageId}`));
    const sheet = editPanel(page);
    await expect(sheet).toBeVisible();
    // S9 와이어프레임 — 메모 아래 `증빙` 줄, 첨부 영역 한 줄 `이미지·PDF 10MB`.
    await expect(sheet.getByRole("button", { name: /이미지·PDF/ })).toBeVisible();

    const input = sheet.getByTestId("attachments-input");
    await waitForHydration(input);
    const image = await uniqueImage(page);
    await input.setInputFiles(image);
    const row = fileRows(sheet).filter({ hasText: /^.*slip-.*\.jpg/ });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(row.getByRole("button", { name: "삭제" })).toBeVisible();
    expect(await slipFileCount(usageId)).toBe(1);

    // 즉시 저장 — 같은 패널을 저장해도 동시성 거부가 나지 않고 값은 그대로다.
    const [before] = await db.select({ version: corpCardUsages.version, total: corpCardUsages.totalAmountKrw }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    await sheet.getByLabel("메모").fill("전표 붙임");
    await sheet.getByLabel("메모").press("Control+Enter");
    await expect(sheet).toBeHidden();
    const [after] = await db.select({ version: corpCardUsages.version, total: corpCardUsages.totalAmountKrw }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.total).toBe(before?.total);

    await expect(page.getByRole("table")).toBeVisible();
    await expect.poll(() => slipCellText(page)).toBe("있음");
    await page.context().close();
  });
});

test.describe("카드 전표 (06-25 Task 2 — 새 건 첫 저장 · S13 · 폰)", () => {
  test("새 건 첫 저장 첨부", async ({ browser, baseURL }) => {
    const holder = await makeHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = newPanel(page);
    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await amount.fill("88000");
    await sheet.getByRole("radio", { name: "팀 비용" }).check();

    await sheet.getByTestId("attachments-input").setInputFiles(await uniqueImage(page));

    // 저장이 먼저 돌고 패널이 그 건의 수정 패널로 바뀐다 — 머리 `카드 사용 수정` · 주소 `editId=` · 파일 행.
    const edit = editPanel(page);
    await expect(edit).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page).toHaveURL(/editId=/);
    await expect(fileRows(edit).filter({ hasText: /slip-.*\.jpg/ })).toBeVisible({ timeout: UPLOAD_WAIT });
    const rows = await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.registeredBy, holder.person.viewer.id));
    expect(rows).toHaveLength(1);
    expect(await slipFileCount(rows[0]?.id ?? "")).toBe(1);

    await edit.getByRole("button", { name: /^취소/ }).click();
    await expect(edit).toBeHidden();
    await expect.poll(() => slipCellText(page)).toBe("있음");
    await page.context().close();
  });

  test("막힌 새 건은 파일을 받지 않는다", async ({ browser, baseURL }) => {
    const holder = await makeHolder();
    const page = await loginPage(browser, baseURL, holder.person);
    await page.goto("/cards?new=1");
    const sheet = newPanel(page);
    await waitForHydration(sheet.getByLabel("결제 합계"));
    // 결제 합계가 비어 1차가 막혀 있다 — 1차 막힘 이유 한 줄.
    const reason = sheet.locator("#card-usage-form-reason");
    await expect(reason).toContainText("결제 합계");

    await sheet.getByTestId("attachments-input").setInputFiles(await uniqueImage(page));

    // 같은 이유가 막힘 자리에 서고, 저장된 카드 사용 · 파일 행은 0이다.
    await expect(reason).toContainText("결제 합계");
    await expect(fileRows(sheet).locator("[data-state=done]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/cards\?new=1$/);
    expect(await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.registeredBy, holder.person.viewer.id))).toHaveLength(0);
    await page.context().close();
  });

  test("구매 완료 패널에 첨부 영역 없음", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E구매전표본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E구매전표팀-${suffix}` });
    const requester = await makePerson("구매요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
    await enableOnlineVendorSetting();
    const online = await insertVendor(SYSTEM_VIEWER, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase(), defaultEvidenceType: "tax_invoice" });
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E전표클라이언트-${suffix}`, normalizedName: `e2e전표클라이언트-${suffix}` });
    const year = seoulToday().slice(0, 4);
    const project = await createProject(requester.viewer, { clientId: client.id, teamId: team.id, pmUserId: requester.viewer.id, name: `E2E전표구매-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName: `소모품-${suffix}`,
          vendorId: online.id,
          unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    const request = { linkKind: "quote_line" as const, lineId: line?.id ?? "", itemName: `구매물건-${suffix}`, linkUrl: null, estimate: { currency: "KRW" as const, amount: 110_000, fxRate: 1 }, memo: null };
    const created = await createPurchaseRequest(requester.viewer, request, await precheckPurchaseRequest(requester.viewer, request));

    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E전표구매처리-${suffix}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"]) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    }
    const buyer = await makePerson("구매처리", role.id, team.id, `${year}-01-01`);
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "7790", label: `공용카드-${suffix}`, kind: "shared" });

    const page = await loginPage(browser, baseURL, buyer);
    await page.goto("/cards/purchases");
    const open = page.getByRole("link", { name: `${created.number} 구매 완료`, exact: true });
    await waitForHydration(open);
    await open.click();
    const sheet = page.getByRole("dialog", { name: "구매 완료" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/cards\/purchases\?purchase=/);
    // S13 — 파일 놓기가 되돌릴 수 없는 구매 완료를 부르지 않게 첨부 영역이 없다.
    await expect(sheet.getByTestId("attachments-input")).toHaveCount(0);
    await expect(sheet.locator('input[type="file"]')).toHaveCount(0);
    await expect(sheet.getByText("파일을 끌어 놓거나")).toHaveCount(0);
    await page.context().close();
  });

  test("폰 전표 사진 축소", async ({ browser, baseURL }) => {
    const holder = await makeHolder();
    const usageId = await seedUsage(holder, 21_000);
    const page = await loginPage(browser, baseURL, holder.person, { width: 375, height: 812 });
    await page.goto(`/cards?editId=${usageId}`);
    const sheet = editPanel(page);
    await expect(sheet).toBeVisible();
    // 폰(아래 시트)에서도 첨부 영역이 선다.
    const input = sheet.getByTestId("attachments-input");
    await waitForHydration(input);
    await input.setInputFiles(await uniqueImage(page, 4000, 3000));
    const row = fileRows(sheet).filter({ hasText: /slip-.*\.jpg/ });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    // 올라간 바이트(최대 변 2000 JPEG로 줄인 것)가 파일 행 미리보기다.
    const thumb = row.locator("img");
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const size = await thumb.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    expect(size.w).toBeLessThanOrEqual(2000);
    expect(size.h).toBeLessThanOrEqual(2000);
    expect(Math.max(size.w, size.h)).toBe(2000);
    await page.context().close();
  });
});
