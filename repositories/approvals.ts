import { and, asc, desc, eq, inArray, isNull, max, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1(EXP-03·EXP-04): 결재 세 표의 리포지토리. 모든 쓰기는 호출자가 연
// 트랜잭션(tx)으로만 돈다 — domain/approvals가 트랜잭션 전에 설정·스냅숏을
// 읽고, 여기서는 행만 읽고 쓴다.

export type ApprovalInstanceRow = InferSelectModel<typeof approvalInstances>;
export type ApprovalRouteRow = InferSelectModel<typeof approvalRoutes>;
export type ApprovalStepRow = InferSelectModel<typeof approvalSteps>;

export type ApprovalStepWithActor = ApprovalStepRow & { actedByName: string | null };
export type ApprovalRouteWithSteps = ApprovalRouteRow & { steps: ApprovalStepWithActor[] };
export type ApprovalInstanceWithDrafter = ApprovalInstanceRow & { drafterName: string };
export type ApprovalGraph = { instance: ApprovalInstanceWithDrafter; routes: ApprovalRouteWithSteps[] };

export type NewApprovalStep = {
  stepIndex: number;
  label: string;
  roleId: string | null;
  scopeKind: string;
  scopeTargetId: string | null;
};

export async function insertApprovalInstance(
  viewer: Viewer,
  input: { documentKind: string; documentId: string; drafterId: string; status: string; currentRound: number },
  tx: DbOrTx,
): Promise<ApprovalInstanceRow> {
  const [row] = await tx
    .insert(approvalInstances)
    .values({ ...input, updatedBy: viewer.id })
    .returning();
  if (!row) throw new Error("approval_instances insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function insertApprovalRoute(
  viewer: Viewer,
  input: {
    instanceId: string;
    round: number;
    selfApproval: string;
    drafterTeamId: string | null;
    drafterOrgUnitId: string | null;
  },
  tx: DbOrTx,
): Promise<ApprovalRouteRow> {
  void viewer;
  const [row] = await tx.insert(approvalRoutes).values(input).returning();
  if (!row) throw new Error("approval_routes insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function insertApprovalSteps(
  viewer: Viewer,
  routeId: string,
  steps: NewApprovalStep[],
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  if (steps.length === 0) return;
  await tx.insert(approvalSteps).values(steps.map((step) => ({ ...step, routeId })));
}

const drafters = alias(users, "drafters");
const actors = alias(users, "actors");

async function readGraph(where: SQL | undefined, tx: DbOrTx): Promise<ApprovalGraph | null> {
  const [found] = await tx
    .select({ instance: approvalInstances, drafterName: drafters.name })
    .from(approvalInstances)
    .innerJoin(drafters, eq(drafters.id, approvalInstances.drafterId))
    .where(where)
    .limit(1);
  if (!found) return null;

  const rows = await tx
    .select({ route: approvalRoutes, step: approvalSteps, actedByName: actors.name })
    .from(approvalRoutes)
    .leftJoin(approvalSteps, eq(approvalSteps.routeId, approvalRoutes.id))
    .leftJoin(actors, eq(actors.id, approvalSteps.actedBy))
    .where(eq(approvalRoutes.instanceId, found.instance.id))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));

  const routes = new Map<string, ApprovalRouteWithSteps>();
  for (const row of rows) {
    let route = routes.get(row.route.id);
    if (!route) {
      route = { ...row.route, steps: [] };
      routes.set(row.route.id, route);
    }
    if (row.step) route.steps.push({ ...row.step, actedByName: row.actedByName });
  }
  return { instance: { ...found.instance, drafterName: found.drafterName }, routes: [...routes.values()] };
}

// 인스턴스 · 모든 차수 · 단계를 한 번에 — 관련자 판정(04.1-02)에 모든 차수의 acted_by가 필요하다.
export async function findApprovalGraphById(
  viewer: Viewer,
  instanceId: string,
  tx: DbOrTx = db,
): Promise<ApprovalGraph | null> {
  void viewer;
  return readGraph(eq(approvalInstances.id, instanceId), tx);
}

export async function findApprovalGraphByDocument(
  viewer: Viewer,
  input: { documentKind: string; documentId: string },
  tx: DbOrTx = db,
): Promise<ApprovalGraph | null> {
  void viewer;
  return readGraph(
    and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, input.documentId)),
    tx,
  );
}

// 낙관적 잠금 — version 조건 + version + 1 + RETURNING. 0행(null) = 충돌.
export async function updateInstanceStatus(
  viewer: Viewer,
  input: { id: string; expectedVersion: number; status: string; currentRound?: number },
  tx: DbOrTx,
): Promise<ApprovalInstanceRow | null> {
  const [row] = await tx
    .update(approvalInstances)
    .set({
      status: input.status,
      ...(input.currentRound === undefined ? {} : { currentRound: input.currentRound }),
      version: sql`${approvalInstances.version} + 1`,
      updatedBy: viewer.id,
      updatedAt: new Date(),
    })
    .where(and(eq(approvalInstances.id, input.id), eq(approvalInstances.version, input.expectedVersion)))
    .returning();
  return row ?? null;
}

// 단계 처리 기록 — 아직 처리되지 않은 행에만 쓴다.
export async function recordStepAction(
  viewer: Viewer,
  input: { stepId: string; actedBy: string; action: "approved" | "rejected"; selfApproved: boolean; reason?: string | null },
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  const updated = await tx
    .update(approvalSteps)
    .set({
      actedBy: input.actedBy,
      actedAt: new Date(),
      action: input.action,
      selfApproved: input.selfApproved,
      reason: input.reason ?? null,
    })
    .where(and(eq(approvalSteps.id, input.stepId), isNull(approvalSteps.actedBy)))
    .returning({ id: approvalSteps.id });
  if (updated.length !== 1) throw new Error("approval_steps 처리 기록이 한 행을 갱신하지 않았습니다.");
}

// 대표 폴백 단계 행 — 처리 기록과 함께 삽입한다. step_index는 그 차수 단계 행의
// max(step_index) + 1(행이 0개면 1)을 같은 tx에서 읽어 정한다(A-02 — 설정 단계
// 번호에 빈틈이 있어 「행 수 + 1」은 UNIQUE(route_id, step_index)와 부딪친다).
export async function insertFallbackStep(
  viewer: Viewer,
  input: {
    routeId: string;
    label: string;
    roleId: string;
    actedBy: string;
    selfApproved: boolean;
    // 04.1-02: 대표 폴백 자리의 반려도 같은 행 모양(기본은 승인).
    action?: "approved" | "rejected";
    reason?: string | null;
  },
  tx: DbOrTx,
): Promise<number> {
  void viewer;
  const [agg] = await tx
    .select({ maxIndex: max(approvalSteps.stepIndex) })
    .from(approvalSteps)
    .where(eq(approvalSteps.routeId, input.routeId));
  const stepIndex = (agg?.maxIndex ?? 0) + 1;
  await tx.insert(approvalSteps).values({
    routeId: input.routeId,
    stepIndex,
    label: input.label,
    roleId: input.roleId,
    scopeKind: "company",
    scopeTargetId: null,
    isFallback: true,
    actedBy: input.actedBy,
    actedAt: new Date(),
    action: input.action ?? "approved",
    selfApproved: input.selfApproved,
    reason: input.reason ?? null,
  });
  return stepIndex;
}

export type ActiveInstance = ApprovalInstanceWithDrafter & { route: ApprovalRouteRow; steps: ApprovalStepWithActor[] };

// 진행 중(submitted · in_review) 인스턴스와 지금 차수의 단계 — 결재함 후보 목록.
export async function listActiveInstances(viewer: Viewer): Promise<ActiveInstance[]> {
  void viewer;
  const rows = await db
    .select({ instance: approvalInstances, drafterName: drafters.name, route: approvalRoutes, step: approvalSteps, actedByName: actors.name })
    .from(approvalInstances)
    .innerJoin(drafters, eq(drafters.id, approvalInstances.drafterId))
    .innerJoin(
      approvalRoutes,
      and(eq(approvalRoutes.instanceId, approvalInstances.id), eq(approvalRoutes.round, approvalInstances.currentRound)),
    )
    .leftJoin(approvalSteps, eq(approvalSteps.routeId, approvalRoutes.id))
    .leftJoin(actors, eq(actors.id, approvalSteps.actedBy))
    .where(inArray(approvalInstances.status, ["submitted", "in_review"]))
    .orderBy(asc(approvalRoutes.submittedAt), asc(approvalInstances.id), asc(approvalSteps.stepIndex));

  const result = new Map<string, ActiveInstance>();
  for (const row of rows) {
    let item = result.get(row.instance.id);
    if (!item) {
      item = { ...row.instance, drafterName: row.drafterName, route: row.route, steps: [] };
      result.set(row.instance.id, item);
    }
    if (row.step) item.steps.push({ ...row.step, actedByName: row.actedByName });
  }
  return [...result.values()];
}

export type ProcessedInstance = ApprovalInstanceWithDrafter & { actedAt: Date; action: string; submittedAt: Date };

// 내가 처리한 인스턴스 — 인스턴스마다 가장 최근 처리 한 건, 처리 내림차순 limit건.
export async function listProcessedInstances(viewer: Viewer, userId: string, limit: number): Promise<ProcessedInstance[]> {
  void viewer;
  const rows = await db
    .selectDistinctOn([approvalInstances.id], {
      instance: approvalInstances,
      drafterName: drafters.name,
      actedAt: approvalSteps.actedAt,
      action: approvalSteps.action,
      submittedAt: approvalRoutes.submittedAt,
    })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .innerJoin(drafters, eq(drafters.id, approvalInstances.drafterId))
    .where(eq(approvalSteps.actedBy, userId))
    .orderBy(approvalInstances.id, desc(approvalSteps.actedAt));

  return rows
    .filter((row): row is typeof row & { actedAt: Date; action: string } => row.actedAt !== null && row.action !== null)
    .map((row) => ({ ...row.instance, drafterName: row.drafterName, actedAt: row.actedAt, action: row.action, submittedAt: row.submittedAt }))
    .sort((a, b) => b.actedAt.getTime() - a.actedAt.getTime())
    .slice(0, limit);
}
