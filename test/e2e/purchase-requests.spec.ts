import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { completePurchaseRequest, createPurchaseRequest, precheckPurchaseCompletion, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createCorpCard } from "@/domain/corp-cards";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";

// 06-08(EXP-10 · UI-SPEC S11 · S12): 구매 요청 신청 — 온라인구매 견적 줄 → 옆 패널 → 저장 → 뒤 목록 첫 줄.
// 사람 · 팀 · 프로젝트 · 줄은 도메인 함수로 만든다(스펙마다 전용 본부 · 팀). 온라인구매 협력사 설정은 전역 한 칸이라
// 모든 스펙이 같은 고정 이름(`online-vendor.ts`)으로 켜 둔다 — 스펙마다 다른 값을 쓰고 되돌리면 병렬 워커가 서로의 값을 덮어쓴다.

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
  const vendorName = E2E_ONLINE_VENDOR_NAME;
  await enableOnlineVendorSetting();
  const online = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName.toLowerCase(), defaultEvidenceType: "tax_invoice" });
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

// ── 06-12 구매 완료(S13 · S11 구매 완료 행 · S8 등록 칸) ─────────────────────────

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

// 구매 권한자(`cards.purchases` write) — 요청자와 다른 새 팀.
async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E구매처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E처리팀-${suffix}` });
  return makePerson("처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

async function requestOn(requester: Requester, lineId: string, itemName: string, amount: number): Promise<string> {
  const input = { linkKind: "quote_line" as const, lineId, itemName, linkUrl: null, estimate: { currency: "KRW" as const, amount, fxRate: 1 }, memo: null };
  return (await createPurchaseRequest(requester.person.viewer, input, await precheckPurchaseRequest(requester.person.viewer, input))).number;
}

function completePanel(page: Page) {
  return page.getByRole("dialog", { name: "구매 완료" });
}

// 활성 카드가 여러 장이면 카드 칸은 기본값 없는 `Select`(UI-SPEC S13 「카드(여러 장일 때)」), 한 장이면 읽기 텍스트 — 다른 스펙이 카드를 더 만들 수 있다.
async function pickCard(sheet: ReturnType<typeof completePanel>, label: string): Promise<void> {
  const select = sheet.getByRole("combobox", { name: "카드" });
  if ((await select.count()) > 0) await select.selectOption({ label });
  else await expect(sheet.getByText(label, { exact: true })).toBeVisible();
}

test.describe("구매 완료 (06-12)", () => {
  test("[06-12 트레이서] `신청됨` 행 `구매 완료` → 패널(머리 · 첫 줄 · 결제 합계 = 예상 금액 · 연결 텍스트) → Ctrl+Enter → 닫힘 · 그 행 `구매 완료` 2행 · 다음 행 포커스 · `/cards` 등록 칸", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const first = await requestOn(requester, target.onlineLineId, "먼저 신청한 물건", 55_000);
    const item = `구매할 물건-${randomUUID().slice(0, 6)}`;
    const number = await requestOn(requester, target.onlineLineId, item, 110_000);
    const buyer = await makePurchaser();
    const suffix = randomUUID().slice(0, 6);
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4401", label: `공용카드-${suffix}`, kind: "shared" });
    const page = await loginPage(browser, baseURL, buyer);
    await page.goto("/cards/purchases");

    const open = page.getByRole("link", { name: `${number} 구매 완료`, exact: true });
    await waitForHydration(open);
    await open.click();
    const sheet = completePanel(page);
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/cards\/purchases\?purchase=/);
    await expect(sheet.getByText(`${number} · ${item}`, { exact: true })).toBeVisible();
    await expect(sheet.getByLabel("결제 합계")).toHaveValue("110,000");
    await expect(sheet.getByText(target.onlineItem, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "견적 줄 바꾸기" })).toHaveCount(0);
    await expect(sheet.getByText(target.vendorName, { exact: true })).toBeVisible();

    const amount = sheet.getByLabel("결제 합계");
    await waitForHydration(amount);
    await pickCard(sheet, `공용카드-${suffix} · 공용사-${suffix} 4401`);
    await amount.press("Control+Enter");

    await expect(sheet).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row.getByText("구매 완료", { exact: true })).toHaveCount(1);
    await expect(row.getByText(`카드 사용 ${seoulToday().slice(5)} · 110,000`, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${number} 구매 완료`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: `${first} 구매 완료`, exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);

    await page.goto("/cards");
    const usageRow = page.getByRole("row").filter({ hasText: `구매 요청 ${number}` });
    await expect(usageRow).toHaveCount(1);
    await expect(usageRow.getByRole("link", { name: /수정$/ })).toHaveCount(1);
    await expect(usageRow.getByRole("button", { name: /삭제$/ })).toHaveCount(0);
    await page.context().close();
  });

  // 구매 권한자 · 공용 카드 · 요청 하나를 세우고 S13을 연다.
  async function openCompletion(browser: Browser, baseURL: string | undefined, amount: number, setup?: (target: Target) => Promise<void>) {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const number = await requestOn(requester, target.onlineLineId, `물건-${randomUUID().slice(0, 6)}`, amount);
    await setup?.(target);
    const buyer = await makePurchaser();
    const suffix = randomUUID().slice(0, 6);
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4402", label: `공용카드-${suffix}`, kind: "shared" });
    const page = await loginPage(browser, baseURL, buyer);
    await page.goto(`/cards/purchases`);
    const open = page.getByRole("link", { name: `${number} 구매 완료`, exact: true });
    await waitForHydration(open);
    await open.click();
    const sheet = completePanel(page);
    const total = sheet.getByLabel("결제 합계");
    await waitForHydration(total);
    await pickCard(sheet, `공용카드-${suffix} · 공용사-${suffix} 4402`);
    return { page, sheet, total, number };
  }

  test("[S13 partial] 예상 금액과 다른 결제 합계 → `예상 금액 · 차이` 줄 → 구매 완료 성공", async ({ browser, baseURL }) => {
    const { page, sheet, total, number } = await openCompletion(browser, baseURL, 110_000);
    await expect(sheet.getByText(/^예상 금액/)).toHaveCount(0);
    await total.fill("99000");
    await total.blur();
    await expect(sheet.getByText("예상 금액 110,000 · 차이 -11,000", { exact: true })).toBeVisible();
    await total.press("Control+Enter");
    await expect(sheet).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row.getByText(`카드 사용 ${seoulToday().slice(5)} · 99,000`, { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("[S13 막힘] 완료 아닌 프로젝트 · 상한 초과 → 고정 갈래 문구(담당 PM) · 1차 비활성", async ({ browser, baseURL }) => {
    const { page, sheet, total } = await openCompletion(browser, baseURL, 110_000);
    // 세금계산서(거래처 기본) — 1,100,011의 공급가 1,000,010 > 실행가 1,000,000.
    await total.fill("1100011");
    await total.blur();
    await expect(sheet.getByText(/^실행가 초과 · 남은 실행가 1,000,000 · 견적 줄은 담당 PM /)).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^구매 완료/ })).toHaveAttribute("aria-disabled", "true");
    await expect(sheet.getByText(/^실행가 초과 [0-9,]+$/)).toHaveCount(0);
    await page.context().close();
  });

  test("[S13 Q-E] 완료 프로젝트 줄 · 초과 결제 합계 → `실행가 초과` 힌트 · 1차 활성 → 처리 뒤 행 2행 끝 ` · 실행가 초과`", async ({ browser, baseURL }) => {
    const { page, sheet, total, number } = await openCompletion(browser, baseURL, 110_000, async (target) => {
      await db.update(projects).set({ status: "completed" }).where(eq(projects.id, target.projectId));
    });
    // 세금계산서 — 1,210,000의 공급가 1,100,000 → 초과 100,000.
    await total.fill("1210000");
    await total.blur();
    await expect(sheet.getByText("실행가 초과 100,000", { exact: true })).toBeVisible();
    const primary = sheet.getByRole("button", { name: /^구매 완료/ });
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await total.press("Control+Enter");
    await expect(sheet).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: number });
    await expect(row).toContainText(`카드 사용 ${seoulToday().slice(5)} · 1,210,000 · 실행가 초과 100,000`);
    await page.context().close();
  });

  test("[06-12 검토 I-1] `전체` 보기에서 구매 완료 → 처리한 행 · 다른 행이 함께 남고 포커스 = 다음 `신청됨` 행", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const first = await requestOn(requester, target.onlineLineId, `먼저-${randomUUID().slice(0, 6)}`, 55_000);
    const number = await requestOn(requester, target.onlineLineId, `나중-${randomUUID().slice(0, 6)}`, 110_000);
    const buyer = await makePurchaser();
    const suffix = randomUUID().slice(0, 6);
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4405", label: `공용카드-${suffix}`, kind: "shared" });
    const page = await loginPage(browser, baseURL, buyer);
    await page.goto(`/cards/purchases?status=${encodeURIComponent("전체")}`);
    const open = page.getByRole("link", { name: `${number} 구매 완료`, exact: true });
    await waitForHydration(open);
    await open.click();
    const sheet = completePanel(page);
    const total = sheet.getByLabel("결제 합계");
    await waitForHydration(total);
    await pickCard(sheet, `공용카드-${suffix} · 공용사-${suffix} 4405`);
    await total.press("Control+Enter");
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/done=/);
    await expect(page.getByRole("row").filter({ hasText: number }).getByText(`카드 사용 ${seoulToday().slice(5)} · 110,000`, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${first} 구매 완료`, exact: true })).toBeFocused();
    await page.context().close();
  });

  test("[06-12 감사 O-2] 결제 합계 칸에서 Enter만 → 구매 완료가 나가지 않는다 · Ctrl+Enter로만 처리", async ({ browser, baseURL }) => {
    const { page, sheet, total, number } = await openCompletion(browser, baseURL, 110_000);
    const submitted = page
      .waitForRequest((request) => request.method() === "POST" && (request.postData() ?? "").includes("corpCardId"), { timeout: 1_500 })
      .then(
        () => true,
        () => false,
      );
    await total.press("Enter");
    expect(await submitted).toBe(false);
    await expect(sheet).toBeVisible();
    const [row] = await db.select({ status: purchaseRequests.status }).from(purchaseRequests).where(eq(purchaseRequests.number, number));
    expect(row?.status).toBe("requested");
    await total.press("Control+Enter");
    await expect(sheet).toHaveCount(0);
    await page.context().close();
  });

  test("[06-12 감사 D-1] 구매 권한자 폰 320 · 375 — `신청됨` · `전체`(외화 행 포함) 문서 가로 넘침 0 · `신청됨` 행 탭 → S13", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const krw = await requestOn(requester, target.onlineLineId, `원화-${randomUUID().slice(0, 6)}`, 55_000);
    const usdInput = { linkKind: "quote_line" as const, lineId: target.onlineLineId, itemName: `외화-${randomUUID().slice(0, 6)}`, linkUrl: null, estimate: { currency: "USD" as const, amount: 100, fxRate: 1350 }, memo: null };
    await createPurchaseRequest(requester.person.viewer, usdInput, await precheckPurchaseRequest(requester.person.viewer, usdInput));
    const buyer = await makePurchaser();
    const page = await loginPage(browser, baseURL, buyer);
    for (const path of ["/cards/purchases", `/cards/purchases?status=${encodeURIComponent("전체")}`]) {
      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        await expect(page.getByText("USD 100.00", { exact: false }).first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `scrollWidth 초과 ${path} @${width}`).toBeLessThanOrEqual(0);
      }
    }
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/cards/purchases");
    const tap = page.getByRole("button", { name: `${krw} 상세 보기`, exact: true });
    await waitForHydration(tap);
    await tap.click();
    await expect(completePanel(page)).toBeVisible();
    await expect(page).toHaveURL(/\?purchase=/);
    await page.context().close();
  });

  test("[M-5 카드 고치기] 구매 완료 건 수정 → 다른 카드 → 힌트 `구매 완료 때 카드` 한 줄 · 되돌리면 없음 → 다른 카드로 저장 → 닫힘 · 카드 묶음 바뀜", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const target = await seedTarget(requester);
    const number = await requestOn(requester, target.onlineLineId, `고칠 물건-${randomUUID().slice(0, 6)}`, 110_000);
    const buyer = await makePurchaser();
    const suffix = randomUUID().slice(0, 6);
    const first = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4403", label: `처음카드-${suffix}`, kind: "shared" });
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4404", label: `고친카드-${suffix}`, kind: "shared" });
    const [requested] = await db.select({ id: purchaseRequests.id, version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.number, number));
    if (!requested || !first.id) throw new Error("요청 · 카드 없음");
    const input = { requestId: requested.id, version: requested.version, corpCardId: first.id, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW" as const, amount: 110_000, fxRate: 1 }, evidenceTypeCode: "invoice", memo: null };
    const done = await completePurchaseRequest(buyer.viewer, input, await precheckPurchaseCompletion(buyer.viewer, input));
    const firstText = `처음카드-${suffix} · 공용사-${suffix} 4403`;
    const nextText = `고친카드-${suffix} · 공용사-${suffix} 4404`;

    const page = await loginPage(browser, baseURL, buyer);
    await page.goto("/cards");
    const edit = page.getByRole("row").filter({ hasText: `구매 요청 ${number}` }).getByRole("link", { name: /수정$/ });
    await waitForHydration(edit);
    await edit.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    const card = sheet.getByRole("combobox", { name: "카드" });
    await waitForHydration(card);
    const hint = sheet.getByText(`구매 완료 때 카드 ${firstText}`, { exact: true });
    await expect(hint).toHaveCount(0);
    await card.selectOption({ label: nextText });
    await expect(hint).toBeVisible();
    await card.selectOption({ label: firstText });
    await expect(hint).toHaveCount(0);
    await card.selectOption({ label: nextText });
    await sheet.getByLabel("결제 합계").press("Control+Enter");

    await expect(sheet).toHaveCount(0);
    const groups = page.getByRole("table").getByRole("rowgroup");
    await expect(groups.filter({ hasText: `고친카드-${suffix}` }).getByText(`구매 요청 ${number}`)).toBeVisible();
    await expect(groups.filter({ hasText: `처음카드-${suffix}` })).toHaveCount(0);
    const [stored] = await db.select({ corpCardId: corpCardUsages.corpCardId }).from(corpCardUsages).where(eq(corpCardUsages.id, done.usageId));
    expect(stored?.corpCardId).not.toBe(first.id);
    await page.context().close();
  });
});
