import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes } from "@/db/schema";
import { rejectDocument } from "@/domain/approvals";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { CEO_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { currentApprovalRound } from "@/domain/print/current-round";
import { findProject, loadProjectProfit } from "@/domain/projects";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
} from "@/domain/settings/keys";
import { getSettlement, SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { extendToInProgress, SETTLEMENT_LINES, setupSettlementProject } from "./fixtures/settlements";

// 07.4-03 — 프로젝트 정산서 인쇄의 읽기 재료. 손익 칸은 화면과 같은 SQL(loadProjectProfit)을 그대로 싣고 종이에서 다시 세지 않는다(D-7402).

const QUOTE_TOTAL_KRW = SETTLEMENT_LINES.krw.unitPrice.amount + SETTLEMENT_LINES.usd.unitPrice.amount * SETTLEMENT_LINES.usd.unitPrice.fxRate;

async function grantPnl(roleId: string): Promise<void> {
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "pnl", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "quote.amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "revenue.issued_amount", visible: true });
}

async function expectPnlViewer(viewer: Viewer): Promise<void> {
  expect(await can(viewer, "pnl", "view")).toBe(true);
  expect(await visible(viewer, "quote.amount")).toBe(true);
}

async function routesOf(documentId: string) {
  return db
    .select({ round: approvalRoutes.round, submittedAt: approvalRoutes.submittedAt })
    .from(approvalRoutes)
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)))
    .orderBy(asc(approvalRoutes.round));
}

describe("정산서 손익 칸 — 매출 기준은 같은 SQL의 기준액 (07.4-03 D-7402)", () => {
  it("정산 · 발행 줄이 있으면 매출 기준 = 발행 합계(견적 합과 다름)이고 매출 기준 − 실행가 합 = 수익금이다", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    await grantPnl(CEO_ROLE_ID);
    await expectPnlViewer(fx.ceo);

    const doc = await getSettlement(fx.ceo, { projectId: fx.projectId });
    const profit = await loadProjectProfit(fx.ceo, fx.projectId);
    expect(profit?.kind).toBe("ok");
    if (profit?.kind !== "ok" || doc?.executionTotalKrw === undefined) throw new Error("손익 · 실행가 합 없음");
    // 픽스처의 발행 줄은 1,000,000 하나(clearPreSettleBlockers) — 견적 합(26,900,000)과 다르다.
    expect(profit.basisKrw).toBe(1_000_000);
    expect(profit.basisKrw).not.toBe(doc.quoteTotalKrw);
    expect(profit.basisKrw - doc.executionTotalKrw).toBe(profit.profitKrw);
  });

  it("진행 중 프로젝트는 발행 줄이 있어도 매출 기준 = 견적 합이다", async () => {
    const fx = await setupSettlementProject();
    await extendToInProgress(fx);
    await grantPnl(CEO_ROLE_ID);

    const profit = await loadProjectProfit(fx.ceo, fx.projectId);
    expect(profit).toMatchObject({ kind: "ok", basisKrw: QUOTE_TOTAL_KRW });
  });

  it("프로젝트 행 범위 밖 결재 관련자는 정산 문서를 열지만 손익은 null이다(누수 아님)", async () => {
    const fx = await setupSettlementProject();
    // 보기 범위가 자기 팀인 경영관리팀 팀장을 마지막 단계 후보로 — 기획1팀 프로젝트는 그 사람의 행 범위 밖이다.
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID.key, TEAM_LEAD_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE.key, "org_unit", null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID.key, await orgUnitIdByName("경영관리본부"), null);
    const mgmtHead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
    await grantPnl(TEAM_LEAD_ROLE_ID);
    // 자금 키는 프로젝트 행 범위를 전사로 넓힌다(domain/permissions/scope-for.ts FUND_ROW_SCOPE_KEYS) — 이 사례에서는 끈다.
    for (const [menu, action] of [["projects.adjustment", "write"], ["projects.budget", "view"], ["projects.revenue", "view"]] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu, action, allowed: false });
    }
    await submitSettlement(fx.pm, { projectId: fx.projectId });

    await expectPnlViewer(mgmtHead);
    expect(await findProject(mgmtHead, fx.projectId)).toBeNull();
    expect(await getSettlement(mgmtHead, { projectId: fx.projectId })).not.toBeNull();
    expect(await loadProjectProfit(mgmtHead, fx.projectId)).toBeNull();
  });
});

describe("정산서 결재란 기안 칸 시각 — 지금 차수 결재선 (07.4-03 eng 재검토 R2)", () => {
  it("반려 뒤 다시 올린 정산은 2차 route 시각이고 정산 문서 작성 시각과 다르다", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    const [instance] = await db
      .select({ id: approvalInstances.id, version: approvalInstances.version })
      .from(approvalInstances)
      .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, fx.projectId)));
    if (!instance) throw new Error("결재 인스턴스 없음");
    await rejectDocument(fx.ceo, { instanceId: instance.id, expectedVersion: instance.version, reason: "증빙 다시" });
    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toMatchObject({ round: 2 });

    const [round1, round2] = await routesOf(fx.projectId);
    expect(round2?.round).toBe(2);
    const current = await currentApprovalRound(fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: fx.projectId });
    expect(current?.submittedAt).toEqual(round2?.submittedAt);
    expect(current?.submittedAt.getTime()).toBeGreaterThan(round1?.submittedAt.getTime() ?? Infinity);
    const doc = await getSettlement(fx.pm, { projectId: fx.projectId });
    expect(doc?.createdAt).toBeInstanceOf(Date);
    expect(doc?.createdAt?.getTime()).not.toBe(current?.submittedAt.getTime());
  });
});
