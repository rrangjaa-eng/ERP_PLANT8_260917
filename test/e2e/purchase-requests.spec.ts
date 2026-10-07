import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchaseRequests, quoteLines } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-08(EXP-10 · UI-SPEC S11 · S12): 구매 요청 신청 — 온라인구매 견적 줄 → 옆 패널 → 저장 → 뒤 목록 첫 줄.
// 사람 · 팀 · 프로젝트 · 줄은 도메인 함수로 만든다(스펙마다 전용 본부 · 팀). 온라인구매 협력사 설정은 전역 한 칸이라
// 이 스펙이 켜고 끝에 되돌린다(mobile-projects-error 선례).

type Requester = { person: Person; teamId: string };
type Target = { projectId: string; projectName: string; projectNumber: string; onlineLineId: string; onlineItem: string; otherLineId: string; otherItem: string; vendorName: string };

async function makeRequester(): Promise<Requester> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E구매본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E구매팀-${suffix}` });
  const person = await makePerson("구매", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  return { person, teamId: team.id };
}

// 요청자가 담당 PM인 프로젝트 · 견적 줄 둘(온라인구매 협력사 줄 1,000,000 · 다른 거래처 줄).
async function seedTarget(requester: Requester): Promise<Target> {
  const suffix = randomUUID().slice(0, 8);
  const vendorName = `E2E쿠팡-${suffix}`;
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, vendorName);
  const online = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: `e2e쿠팡-${suffix}`, defaultEvidenceType: "tax_invoice" });
  const other = await insertVendor(SYSTEM_VIEWER, { name: `E2E스테이지-${suffix}`, normalizedName: `e2e스테이지-${suffix}`, defaultEvidenceType: "tax_invoice" });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E구매클라이언트-${suffix}`, normalizedName: `e2e구매클라이언트-${suffix}` });
  const year = seoulToday().slice(0, 4);
  const projectName = `E2E구매요청-${suffix}`;
  const project = await createProject(requester.person.viewer, {
    clientId: client.id,
    teamId: requester.teamId,
    pmUserId: requester.person.viewer.id,
    name: projectName,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const onlineItem = `현장 소모품-${suffix}`;
  const otherItem = `무대 제작-${suffix}`;
  const row = (itemName: string, vendorId: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row(onlineItem, online.id), row(otherItem, other.id)] });
  const lines = await db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
  const idOf = (itemName: string) => {
    const found = lines.find((line) => line.itemName === itemName)?.id;
    if (!found) throw new Error(`견적 줄 없음: ${itemName}`);
    return found;
  };
  return { projectId: project.id, projectName, projectNumber: project.number, onlineLineId: idOf(onlineItem), onlineItem, otherLineId: idOf(otherItem), otherItem, vendorName };
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: "구매 요청" });
}

test.describe.configure({ mode: "serial" });

test.describe("구매 요청 신청 (06-08)", () => {
  let original: Awaited<ReturnType<typeof findSimpleValue>>;
  test.beforeAll(async () => {
    original = await findSimpleValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME.key);
  });
  test.afterAll(async () => {
    if (original) await upsertSimpleValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME.key, original.value, original.updatedBy);
    else await upsertSimpleValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME.key, "", null);
  });

  test("[06-08 트레이서] `?new=1&line={id}` → 패널(연결 텍스트) → 품목 · 링크 · 예상 금액 → Ctrl+Enter → 패널 열린 채 결과 한 줄 · 뒤 목록 첫 줄", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto(`/cards/purchases?new=1&line=${target.onlineLineId}`);

    const sheet = panel(page);
    await expect(sheet).toBeVisible();
    // 연결은 텍스트(라디오 없음) — 프로젝트 · 견적 줄.
    await expect(sheet.getByText(`${target.projectNumber} ${target.projectName}`, { exact: true })).toBeVisible();
    await expect(sheet.getByText(target.onlineItem, { exact: true })).toBeVisible();
    await expect(sheet.getByText("남은 실행가 1,000,000", { exact: true })).toBeVisible();

    const item = sheet.getByLabel("품목");
    await waitForHydration(item);
    await item.fill("현수막 3장");
    const url = "https://www.coupang.com/vp/products/1234?itemId=5";
    await sheet.getByLabel("링크").fill(url);
    const amount = sheet.getByLabel("예상 금액");
    await amount.fill("110000");
    await amount.press("Control+Enter");

    const number = `${target.projectNumber}-C0001`;
    await expect(sheet.getByRole("status")).toHaveText(`구매 요청됨 · ${number}`);
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cards/purchases\\?new=1&line=${target.onlineLineId}$`));
    await expect(sheet.getByLabel("품목")).toBeFocused();
    await expect(sheet.getByLabel("품목")).toHaveValue("");
    await expect(sheet.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
    // 진입 줄은 남는다.
    await expect(sheet.getByText(target.onlineItem, { exact: true })).toBeVisible();

    // 뒤 목록 첫 줄 — 번호 · 상태 `신청됨` · 링크 URL 그대로.
    const firstRow = page.getByRole("table").getByRole("row").nth(1);
    await expect(firstRow.getByText(number, { exact: true })).toHaveCount(1);
    await expect(firstRow.getByText("신청됨", { exact: true })).toHaveCount(1);
    await expect(firstRow.getByRole("link", { name: "현수막 3장 링크 열기" })).toHaveAttribute("href", url);
    await page.context().close();
  });

  test("[막힘] 비온라인 줄로 `line` 진입 → 저장 → 패널 `reason` 줄에 서버 막힘 문구 · 입력은 남는다", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto(`/cards/purchases?new=1&line=${target.otherLineId}`);
    const sheet = panel(page);
    const item = sheet.getByLabel("품목");
    await waitForHydration(item);
    await item.fill("무대 소품");
    const amount = sheet.getByLabel("예상 금액");
    await amount.fill("55000");
    await amount.press("Control+Enter");

    await expect(sheet.getByText("온라인구매 협력사 줄 아님 · 지출결의로", { exact: true })).toBeVisible();
    await expect(sheet.getByLabel("품목")).toHaveValue("무대 소품");
    await expect(sheet.getByLabel("예상 금액")).toHaveValue("55,000");
    await expect(sheet.getByRole("status")).toHaveCount(0);
    await page.context().close();
  });

  test("[구매 요청 모드] 목록 1차 `구매 요청` → 패널 → `견적 줄 바꾸기` → 비온라인 줄 `aria-disabled` + `거래처 … · 지출결의로` · 온라인 줄은 고를 수 있다", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");
    const open = page.getByRole("link", { name: "구매 요청", exact: true }).or(page.getByRole("button", { name: "구매 요청", exact: true })).first();
    await waitForHydration(open);
    await open.click();
    const sheet = panel(page);
    await expect(sheet).toBeVisible();
    await waitForHydration(sheet.getByLabel("품목"));
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByRole("radio", { name: "팀 비용" })).toHaveCount(0);
    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(target.projectName);
    await projects.getByRole("option", { name: new RegExp(target.projectName) }).click();
    await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    const other = lines.getByRole("option", { name: new RegExp(target.otherItem) });
    await expect(other).toHaveAttribute("aria-disabled", "true");
    await expect(other).toContainText("지출결의로");
    const online = lines.getByRole("option", { name: new RegExp(target.onlineItem) });
    await expect(online).not.toHaveAttribute("aria-disabled", "true");
    await online.click();
    await lines.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(lines).toBeHidden();
    await expect(sheet.getByText(target.onlineItem, { exact: true })).toBeVisible();
    await expect(sheet.getByText("남은 실행가 1,000,000", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("[Empty] 전체 0건 → `구매 요청이 없습니다` + `구매 요청` / 신청됨 0건(취소만 있음) → `신청한 구매 요청이 없습니다` + `구매 요청`", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");
    await expect(page.getByText("구매 요청이 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "구매 요청", exact: true }).or(page.getByRole("button", { name: "구매 요청", exact: true }))).toHaveCount(1);

    const target = await seedTarget(requester);
    const input = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: "취소될 물건", linkUrl: null, estimate: { currency: "KRW" as const, amount: 11_000, fxRate: 1 }, memo: null };
    const created = await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input));
    await db.update(purchaseRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: requester.person.viewer.id, cancelReason: "취소" }).where(eq(purchaseRequests.id, created.id));
    await page.goto("/cards/purchases");
    await expect(page.getByText("신청한 구매 요청이 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "구매 요청", exact: true }).or(page.getByRole("button", { name: "구매 요청", exact: true }))).toHaveCount(1);
    await page.context().close();
  });

  test("[로드 오류] 목록 쿼리가 실패 → `구매 요청 목록 불러오지 못함` + `다시 시도` · 고쳐진 요청으로 복귀(표 잠금 없음 — 라우트 가로채기)", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const input = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: "복귀 확인", linkUrl: null, estimate: { currency: "KRW" as const, amount: 11_000, fxRate: 1 }, memo: null };
    await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input));
    const page = await loginPage(browser, baseURL, requester.person);
    // 범위를 벗어난 달(9999-12)은 서버 목록 쿼리를 실패시킨다 — 다른 스펙이 쓰는 표 · 설정은 건드리지 않는다.
    await page.goto("/cards/purchases?month=9999-12");
    await expect(page.getByText("구매 요청 목록 불러오지 못함", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "구매 요청", exact: true })).toBeVisible();
    // `다시 시도`의 서버 재요청을 정상 주소로 돌려 보낸다(가로채기).
    await page.route("**/cards/purchases?month=9999-12*", (route) => route.continue({ url: route.request().url().replace("month=9999-12", "month=") }));
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(page.getByText("복귀 확인", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("[감사 D-1] 폰 375 · 320 긴 품목(95자) + 링크 → 문서 가로 넘침 0 · 품목은 말줄임 + title · 링크 아이콘 44", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const longName = "가".repeat(95);
    const input = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: longName, linkUrl: "https://www.coupang.com/vp/products/9", estimate: { currency: "KRW" as const, amount: 22_000, fxRate: 1 }, memo: null };
    await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input));
    const page = await loginPage(browser, baseURL, requester.person);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/cards/purchases");
      await expect(page.getByRole("link", { name: `${longName} 링크 열기` })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `scrollWidth 초과 @${width}`).toBeLessThanOrEqual(0);
      const box = await page.getByRole("link", { name: `${longName} 링크 열기` }).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      await expect(page.locator(`[title="${longName}"]`).first()).toHaveCount(1);
    }
    await page.context().close();
  });

  test("[감사 O-1] 진입 줄(`&line=`)에서 실행가 초과 막힘 → `다른 줄 고르기` 없이 앞부분만", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto(`/cards/purchases?new=1&line=${target.onlineLineId}`);
    const sheet = panel(page);
    const item = sheet.getByLabel("품목");
    await waitForHydration(item);
    await item.fill("너무 큰 물건");
    await sheet.getByLabel("예상 금액").fill("5000000");
    await expect(sheet.getByText("실행가 초과 · 남은 실행가 1,000,000", { exact: true })).toBeVisible();
    await expect(sheet.getByText("다른 줄 고르기")).toHaveCount(0);
    await page.context().close();
  });

  test("[링크 아이콘] 품목 옆 링크 아이콘 = 44×44 · 새 탭 · `rel` noopener noreferrer · 글자 없음(접근 이름만)", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const url = "https://www.coupang.com/vp/products/777";
    const input = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: "링크 확인 물건", linkUrl: url, estimate: { currency: "KRW" as const, amount: 22_000, fxRate: 1 }, memo: null };
    await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input));
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");
    const icon = page.getByRole("link", { name: "링크 확인 물건 링크 열기" });
    await expect(icon).toHaveAttribute("href", url);
    await expect(icon).toHaveAttribute("target", "_blank");
    const rel = (await icon.getAttribute("rel")) ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    const box = await icon.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.context().close();
  });

  test("[S12 partial] 바뀐 칸 없음 → Esc로 바로 닫힘 · 포커스 = 연 요소 / 품목을 적은 뒤 Esc → 「입력 버리기」", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const input = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: "열기 확인", linkUrl: null, estimate: { currency: "KRW" as const, amount: 11_000, fxRate: 1 }, memo: null };
    await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input));
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");
    const open = page.getByRole("link", { name: "구매 요청", exact: true });
    await waitForHydration(open);

    await open.click();
    await expect(panel(page)).toBeVisible();
    await waitForHydration(panel(page).getByLabel("품목"));
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/cards\/purchases$/);
    await expect(open).toBeFocused();

    await open.click();
    const item = panel(page).getByLabel("품목");
    await waitForHydration(item);
    await item.fill("버릴 입력");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await page.context().close();
  });
});
