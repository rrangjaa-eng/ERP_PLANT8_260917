import { and, asc, desc, eq, inArray, isNotNull, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses, files, users } from "@/db/schema";
import { unresolvedVoidHaving } from "@/repositories/files";
import type { Viewer } from "@/domain/viewer";

// 04.1(EXP-03·EXP-04): 결재 세 표의 리포지토리. 모든 쓰기는 호출자가 연
// 트랜잭션(tx)으로만 돈다 — domain/approvals가 트랜잭션 전에 설정·스냅숏을
// 읽고, 여기서는 행만 읽고 쓴다.

export type ApprovalInstanceRow = InferSelectModel<typeof approvalInstances>;
export type ApprovalRouteRow = InferSelectModel<typeof approvalRoutes>;
export type ApprovalStepRow = InferSelectModel<typeof approvalSteps>;

export type ApprovalStepWithActor = ApprovalStepRow & { actedByName: string | null };
export type ApprovalRouteWithSteps = ApprovalRouteRow & { steps: ApprovalStepWithActor[] };
// updatedByName — 마지막으로 바꾼 사람(updated_by) 이름. 그래프 읽기만 싣는다(05-09: 결재 중 증빙을 붙인 사람의 충돌 문구).
export type ApprovalInstanceWithDrafter = ApprovalInstanceRow & { drafterName: string; updatedByName?: string | null };
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
const updaters = alias(users, "updaters");

async function readGraph(where: SQL | undefined, tx: DbOrTx): Promise<ApprovalGraph | null> {
  const [found] = await tx
    .select({ instance: approvalInstances, drafterName: drafters.name, updatedByName: updaters.name })
    .from(approvalInstances)
    .innerJoin(drafters, eq(drafters.id, approvalInstances.drafterId))
    .leftJoin(updaters, eq(updaters.id, approvalInstances.updatedBy))
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
  return { instance: { ...found.instance, drafterName: found.drafterName, updatedByName: found.updatedByName }, routes: [...routes.values()] };
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
      // 05-01 E4: 상태가 바뀌면 증빙 변경 표식은 지운다.
      versionReason: null,
    })
    .where(and(eq(approvalInstances.id, input.id), eq(approvalInstances.version, input.expectedVersion)))
    .returning();
  return row ?? null;
}

// 05-01 E4: 상태 · 차수는 그대로 두고 version만 + 1(이유 · 바꾼 사람 · 시각과 함께) — 그 전에 문서를 연 결재자의
// 승인이 version 불일치로 막힌다. expectedVersion이 있으면 조건부(0행 = null).
export async function bumpInstanceVersion(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion?: number; updatedBy: string; reason: "evidence" },
  tx: DbOrTx,
): Promise<ApprovalInstanceRow | null> {
  void viewer;
  const [row] = await tx
    .update(approvalInstances)
    .set({
      version: sql`${approvalInstances.version} + 1`,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
      versionReason: input.reason,
    })
    .where(
      input.expectedVersion === undefined
        ? eq(approvalInstances.id, input.instanceId)
        : and(eq(approvalInstances.id, input.instanceId), eq(approvalInstances.version, input.expectedVersion)),
    )
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
// 인스턴스별 최근 한 건(DISTINCT ON)을 하위 질의로 고른 뒤 바깥에서 정렬 · 자르기를 한다 — 처리 이력 전체를
// 메모리로 가져오지 않는다(/review — 대표처럼 오래 결재한 사람의 이력은 끝없이 늘어난다).
export async function listProcessedInstances(viewer: Viewer, userId: string, limit: number): Promise<ProcessedInstance[]> {
  void viewer;
  const latest = db
    .selectDistinctOn([approvalRoutes.instanceId], {
      instanceId: approvalRoutes.instanceId,
      actedAt: approvalSteps.actedAt,
      action: approvalSteps.action,
      submittedAt: approvalRoutes.submittedAt,
    })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalSteps.actedBy, userId), isNotNull(approvalSteps.actedAt), isNotNull(approvalSteps.action)))
    .orderBy(approvalRoutes.instanceId, desc(approvalSteps.actedAt))
    .as("latest");
  const rows = await db
    .select({
      instance: approvalInstances,
      drafterName: drafters.name,
      actedAt: latest.actedAt,
      action: latest.action,
      submittedAt: latest.submittedAt,
    })
    .from(latest)
    .innerJoin(approvalInstances, eq(approvalInstances.id, latest.instanceId))
    .innerJoin(drafters, eq(drafters.id, approvalInstances.drafterId))
    .orderBy(desc(latest.actedAt))
    .limit(limit);

  return rows
    .filter((row): row is typeof row & { actedAt: Date; action: string } => row.actedAt !== null && row.action !== null)
    .map((row) => ({ ...row.instance, drafterName: row.drafterName, actedAt: row.actedAt, action: row.action, submittedAt: row.submittedAt }));
}

export type DrafterInstance = ApprovalInstanceRow & { rejecterName: string | null };

// 05 /review C6: 승인 뒤 막힘 후보를 LIMIT 전에 거르는 조건 — 종류 등록(blockedAfterApprovalCandidates)이 고른다. 「증빙 무효 뒤 아직 새 증빙 없음」 하나.
export type BlockedCandidateFilter = "unresolved_evidence_void";

function blockedCandidateSql(viewer: Viewer, filter: BlockedCandidateFilter): SQL {
  switch (filter) {
    case "unresolved_evidence_void":
      return sql`exists (select 1 from ${files} where ${files.ownerKind} = ${approvalInstances.documentKind} and ${files.ownerId} = ${approvalInstances.documentId} and ${files.removedAt} is null group by ${files.ownerId} having ${unresolvedVoidHaving(viewer)})`;
  }
}

// 06-28 /review I1: 반려 줄 후보에서 종류가 끝낸 문서를 LIMIT 전에 빼는 조건 — 종류 등록(rejectedCandidates)이 고른다. 「지출결의 종결 아님」 하나.
export type RejectedCandidateFilter = "not_closed_expense";

function rejectedCandidateSql(filter: RejectedCandidateFilter): SQL {
  switch (filter) {
    case "not_closed_expense":
      return sql`not exists (select 1 from ${expenses} where ${expenses.id} = ${approvalInstances.documentId} and ${expenses.closedAt} is not null)`;
  }
}

// 05-10: 내가 기안한 인스턴스 중 한 상태(반려 · 승인)인 것 — 최근 처리 순. 반려는 지금 차수의 반려 단계 처리자 이름을 함께 읽는다.
export async function listDrafterInstances(
  viewer: Viewer,
  input: {
    drafterId: string;
    status: "rejected" | "approved";
    limit: number;
    candidateKinds?: readonly { documentKind: string; filter: BlockedCandidateFilter | null }[];
    // 그 종류의 문서만 조건으로 거르고 다른 종류는 그대로 둔다.
    kindFilters?: readonly { documentKind: string; filter: RejectedCandidateFilter }[];
  },
): Promise<DrafterInstance[]> {
  // 05 /review A9 · C6: 승인 뒤 막힘 후보는 LIMIT 전에 SQL로 거른다 — 종류마다 그 종류가 준 조건(없으면 그 종류 전부)으로(최근 N건만 보면 오래된 문서가 빠진다).
  if (input.candidateKinds?.length === 0) return [];
  const candidateFilter = input.candidateKinds
    ? or(
        ...input.candidateKinds.map((candidate) =>
          and(eq(approvalInstances.documentKind, candidate.documentKind), candidate.filter ? blockedCandidateSql(viewer, candidate.filter) : undefined),
        ),
      )
    : undefined;
  const kindFilter = input.kindFilters?.length
    ? and(...input.kindFilters.map((kind) => or(sql`${approvalInstances.documentKind} <> ${kind.documentKind}`, rejectedCandidateSql(kind.filter))))
    : undefined;
  const rows = await db
    .select({ instance: approvalInstances, rejecterName: actors.name })
    .from(approvalInstances)
    .leftJoin(approvalRoutes, and(eq(approvalRoutes.instanceId, approvalInstances.id), eq(approvalRoutes.round, approvalInstances.currentRound)))
    .leftJoin(approvalSteps, and(eq(approvalSteps.routeId, approvalRoutes.id), eq(approvalSteps.action, "rejected")))
    .leftJoin(actors, eq(actors.id, approvalSteps.actedBy))
    .where(and(eq(approvalInstances.drafterId, input.drafterId), eq(approvalInstances.status, input.status), candidateFilter, kindFilter))
    .orderBy(desc(approvalInstances.updatedAt), asc(approvalInstances.id))
    .limit(input.limit);
  return rows.map((row) => ({ ...row.instance, rejecterName: row.rejecterName }));
}
