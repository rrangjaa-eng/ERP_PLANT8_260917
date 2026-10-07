import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { createPurchaseRequest, precheckPurchaseRequest, type PurchaseRequestInput } from "@/domain/purchase-requests";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "../approvals-fixtures";

// 06-08 구매 요청 통합 픽스처 — 온라인구매 협력사 줄 · 다른 거래처 줄이 있는 프로젝트(통합 · 누수 스캔이 함께 쓴다).

export const ONLINE_VENDOR = "쿠팡";

export type PurchaseFx = {
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

export async function purchaseProject(onlineEvidence = "tax_invoice"): Promise<PurchaseFx> {
  const team = await makeTeam();
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, ONLINE_VENDOR);
  const online = await insertVendor(SYSTEM_VIEWER, { name: ONLINE_VENDOR, normalizedName: `${ONLINE_VENDOR}-${randomUUID()}`, defaultEvidenceType: onlineEvidence });
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

export function requestInput(lineId: string, estimateKrw = 110_000): PurchaseRequestInput {
  return {
    linkKind: "quote_line",
    lineId,
    itemName: "현수막 3장",
    linkUrl: "https://www.coupang.com/vp/products/1",
    estimate: { currency: "KRW", amount: estimateKrw, fxRate: 1 },
    memo: null,
  };
}

export async function request(fx: PurchaseFx, lineId: string, estimateKrw = 110_000): Promise<{ id: string; number: string }> {
  const input = requestInput(lineId, estimateKrw);
  return createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
}

