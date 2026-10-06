import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
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
});
