import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, purchaseRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { gate } from "@/domain/rules/gate";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { createPurchaseRequest, precheckPurchaseRequest, type PurchaseRequestInput } from "@/domain/purchase-requests";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";

// 06-08(EXP-10 · D-609 · Q3 · GA-38): 구매 요청 신청 경로 통합 파일 — 06-12 · 06-14가 `describe`를 더한다.

const ONLINE_VENDOR = "쿠팡";

type PurchaseFx = {
  pm: Viewer;
  projectId: string;
  projectNumber: string;
  revisionId: string;
  /** 온라인구매 협력사 줄(실행가 1,000,000 · 거래처 기본 증빙 = 세금계산서 — 부가세 별도). */
  onlineLine: string;
  /** 다른 거래처 줄. */
  otherLine: string;
};

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `구매본부-${randomUUID()}` });
  const name = `구매팀-${randomUUID()}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

async function purchaseProject(): Promise<PurchaseFx> {
  const team = await makeTeam();
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, ONLINE_VENDOR);
  const online = await insertVendor(SYSTEM_VIEWER, { name: ONLINE_VENDOR, normalizedName: `${ONLINE_VENDOR}-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const other = await insertVendor(SYSTEM_VIEWER, { name: "스테이지원", normalizedName: `스테이지원-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.id,
    name: `구매요청-${randomUUID().slice(0, 8)}`,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const onlineLine = randomUUID();
  const otherLine = randomUUID();
  const row = (id: string, itemName: string, vendorId: string) => ({
    id,
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row(onlineLine, "현장 소모품", online.id), row(otherLine, "무대 제작", other.id)] });
  return { pm, projectId: project.id, projectNumber: project.number, revisionId: revision.id, onlineLine, otherLine };
}

function requestInput(lineId: string, estimateKrw = 110_000): PurchaseRequestInput {
  return {
    linkKind: "quote_line",
    lineId,
    itemName: "현수막 3장",
    linkUrl: "https://www.coupang.com/vp/products/1",
    estimate: { currency: "KRW", amount: estimateKrw, fxRate: 1 },
    memo: null,
  };
}

async function request(fx: PurchaseFx, lineId: string, estimateKrw = 110_000): Promise<{ id: string; number: string }> {
  const input = requestInput(lineId, estimateKrw);
  return createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
}

describe("purchase.line-door", () => {
  it("구매 요청 입구 + 지출결의 문 → `온라인구매 협력사 줄 아님 · 지출결의로`", async () => {
    await expect(gate(null, "purchase.line-door", { side: "purchase", door: "expense", vendorName: "스테이지원" })).resolves.toEqual({
      allowed: false,
      reason: "온라인구매 협력사 줄 아님 · 지출결의로",
    });
  });

  it("구매 요청 입구 + 구매 요청 문 → 통과", async () => {
    await expect(gate(null, "purchase.line-door", { side: "purchase", door: "purchase", vendorName: ONLINE_VENDOR })).resolves.toEqual({ allowed: true });
  });

  it("지출결의 입구 + 구매 요청 문 → `온라인구매 협력사 줄 · 구매 요청으로`(호출은 06-13)", async () => {
    await expect(gate(null, "purchase.line-door", { side: "expense", door: "purchase", vendorName: ONLINE_VENDOR })).resolves.toEqual({
      allowed: false,
      reason: "온라인구매 협력사 줄 · 구매 요청으로",
    });
  });

  it("지출결의 입구 + 지출결의 문 → 통과", async () => {
    await expect(gate(null, "purchase.line-door", { side: "expense", door: "expense", vendorName: "스테이지원" })).resolves.toEqual({ allowed: true });
  });
});

describe("구매 요청 신청 — 트레이서(06-08)", () => {
  it("온라인구매 줄 → 저장 + 번호 `{프로젝트 번호}-C0001` + 같은 tx `document_create` 한 줄", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);

    expect(created.number).toBe(`${fx.projectNumber}-C0001`);
    const [row] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    expect(row).toMatchObject({
      number: created.number,
      linkKind: "quote_line",
      projectId: fx.projectId,
      quoteLineId: fx.onlineLine,
      requestedBy: fx.pm.id,
      itemName: "현수막 3장",
      linkUrl: "https://www.coupang.com/vp/products/1",
      estimateCurrency: "KRW",
      estimateAmountKrw: 110_000,
      status: "requested",
    });
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, created.id), eq(actionLog.actionType, "document_create")));
    expect(logs).toHaveLength(1);
  });

  it("같은 프로젝트의 둘째 요청은 `-C0002`", async () => {
    const fx = await purchaseProject();
    await request(fx, fx.onlineLine);
    expect((await request(fx, fx.onlineLine)).number).toBe(`${fx.projectNumber}-C0002`);
  });

  it("다른 거래처 줄 → 서버 거부 `온라인구매 협력사 줄 아님 · 지출결의로` · 요청 0", async () => {
    const fx = await purchaseProject();
    await expect(request(fx, fx.otherLine)).rejects.toThrow("온라인구매 협력사 줄 아님 · 지출결의로");
    expect(await db.select({ id: purchaseRequests.id }).from(purchaseRequests)).toHaveLength(0);
  });
});
