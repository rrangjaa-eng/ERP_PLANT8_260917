import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, projects, settlementApprovals, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 05-11(D-98): 정산 결재 표. 결재 상태는 approval_instances(호출자가 넘기는 문서 종류 키)에 있어 읽기는 인스턴스를 왼쪽 조인한다.
// 쓰기는 호출자가 연 트랜잭션(tx)으로만 돈다.

export type SettlementApprovalRow = InferSelectModel<typeof settlementApprovals>;

// 프로젝트마다 하나(project_id UNIQUE) — 이미 있으면 아무것도 쓰지 않고 null. 문서 id = 프로젝트 id(결재 종류의 href가 문서 id만으로
// 프로젝트 주소 `/projects/{id}/settlement`를 만든다 — 문서 하나에 프로젝트 하나라 조회 없이 같은 값이다).
export async function insertSettlementIfAbsent(
  viewer: Viewer,
  values: { projectId: string; drafterId: string },
  tx: DbOrTx,
): Promise<SettlementApprovalRow | null> {
  void viewer;
  const [row] = await tx.insert(settlementApprovals).values({ id: values.projectId, ...values }).onConflictDoNothing({ target: settlementApprovals.projectId }).returning();
  return row ?? null;
}

export async function findSettlementByProjectId(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<SettlementApprovalRow | null> {
  void viewer;
  const [row] = await tx.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, projectId)).limit(1);
  return row ?? null;
}

export type SettlementSummaryRow = SettlementApprovalRow & {
  drafterName: string;
  projectName: string;
  projectNumber: string;
  projectStatus: string;
  projectTeamId: string;
  pmUserId: string;
  startDate: string | null;
  endDate: string | null;
  pmName: string | null;
  instanceId: string | null;
  status: string | null;
  approvalVersion: number | null;
  currentRound: number | null;
};

export async function listSettlementSummaries(
  viewer: Viewer,
  input: { ids?: string[]; projectIds?: string[]; documentKind: string },
): Promise<SettlementSummaryRow[]> {
  void viewer;
  const condition = input.ids ? inArray(settlementApprovals.id, input.ids) : inArray(settlementApprovals.projectId, input.projectIds ?? []);
  if ((input.ids ?? input.projectIds ?? []).length === 0) return [];
  const drafter = alias(users, "settlement_drafter");
  const pm = alias(users, "settlement_pm");
  const rows = await db
    .select({
      settlement: settlementApprovals,
      drafterName: drafter.name,
      projectName: projects.name,
      projectNumber: projects.number,
      projectStatus: projects.status,
      projectTeamId: projects.teamId,
      pmUserId: projects.pmUserId,
      startDate: projects.startDate,
      endDate: projects.endDate,
      pmName: pm.name,
      instanceId: approvalInstances.id,
      status: approvalInstances.status,
      approvalVersion: approvalInstances.version,
      currentRound: approvalInstances.currentRound,
    })
    .from(settlementApprovals)
    .innerJoin(drafter, eq(drafter.id, settlementApprovals.drafterId))
    .innerJoin(projects, eq(projects.id, settlementApprovals.projectId))
    .leftJoin(pm, eq(pm.id, projects.pmUserId))
    .leftJoin(approvalInstances, and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, settlementApprovals.id)))
    .where(condition);
  return rows.map((row) => ({
    ...row.settlement,
    drafterName: row.drafterName,
    projectName: row.projectName,
    projectNumber: row.projectNumber,
    projectStatus: row.projectStatus,
    projectTeamId: row.projectTeamId,
    pmUserId: row.pmUserId,
    startDate: row.startDate,
    endDate: row.endDate,
    pmName: row.pmName,
    instanceId: row.instanceId,
    status: row.status,
    approvalVersion: row.approvalVersion,
    currentRound: row.currentRound,
  }));
}

// 05-11(F1 · P3-4): 최종 승인 훅이 같은 tx에서 읽는 사실 하나 — 정산 결재 문서의 project_id와 「이 문서 인스턴스(approved) 지금 차수의
// 마지막 단계 기록이 viewer의 승인」. 마지막 단계 기록 = 지금 차수 단계 행 중 처리 기록(action)이 있는 행의 step_index 최댓값 —
// 대표 폴백 행(is_fallback, step_index = max + 1)도 포함하고 is_fallback으로 거르지 않는다. 처리 기록이 없는 행(자기 승인 건너뜀 ·
// 담당 없는 뒤 단계)은 마지막 기록이 아니다. 아니면 null.
export async function findFinalStepActorInTx(
  viewer: Viewer,
  input: { documentId: string; documentKind: string },
  tx: DbOrTx,
): Promise<{ projectId: string } | null> {
  const [doc] = await tx
    .select({ projectId: settlementApprovals.projectId, instanceId: approvalInstances.id, status: approvalInstances.status, round: approvalInstances.currentRound })
    .from(settlementApprovals)
    .innerJoin(approvalInstances, and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, settlementApprovals.id)))
    .where(eq(settlementApprovals.id, input.documentId))
    .limit(1);
  if (!doc || doc.status !== "approved") return null;
  const [last] = await tx
    .select({ actedBy: approvalSteps.actedBy, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, doc.round), isNotNull(approvalSteps.action)))
    .orderBy(desc(approvalSteps.stepIndex))
    .limit(1);
  if (!last || last.actedBy !== viewer.id || last.action !== "approved") return null;
  return { projectId: doc.projectId };
}
