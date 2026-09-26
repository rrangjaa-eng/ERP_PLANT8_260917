import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { project } from "@/domain/permissions/project";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import type { findVisibility as defaultFindVisibility } from "@/repositories/permissions";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findApprovalGraphByDocument,
  findApprovalGraphById,
  insertApprovalInstance,
  insertApprovalRoute,
  insertApprovalSteps,
  insertFallbackStep,
  listActiveInstances,
  listProcessedInstances,
  recordStepAction,
  updateInstanceStatus,
  type ApprovalGraph,
  type ApprovalInstanceRow,
  type ApprovalStepWithActor,
  type NewApprovalStep,
} from "@/repositories/approvals";
import { listOrgSnapshot as defaultListOrgSnapshot, listRouteLabelNames } from "@/repositories/org-snapshot";
import {
  FALLBACK_LABEL,
  nextStep,
  walkRoute,
  type ApprovalStatus,
  type RouteStep,
  type ScopeKind,
  type SelfApproval,
  type SnapshotPerson,
  type WalkRouteResult,
} from "@/domain/approvals/route";
import { getDocumentKind, type RouteConfigStep } from "@/domain/approvals/kinds";
import { loadActionLogGate as defaultLoadActionLogGate, recordActionInTx, type ActionLogGate, type TxLogDeps } from "@/domain/approvals/tx-log";
import {
  APPROVAL_INBOX_ITEM_DTO_SPEC,
  APPROVAL_VIEW_DTO_SPEC,
  ROUTE_PREVIEW_DTO_SPEC,
  ROUTE_PREVIEW_STEP_DTO_SPEC,
  type RoutePreviewDTO,
  type RoutePreviewStepDTO,
  type ApprovalAction,
  type ApprovalInboxItemDto,
  type ApprovalInboxItemSource,
  type ApprovalStepView,
  type ApprovalViewDto,
} from "@/domain/approvals/dto";

export { registerDocumentKind, getDocumentKind, listDocumentKinds } from "@/domain/approvals/kinds";
export type { DocumentKindDef, RouteConfig, RouteConfigStep, RouteSettingDefs } from "@/domain/approvals/kinds";
export { nextStep, resolveHolders, walkRoute } from "@/domain/approvals/route";
export { loadActionLogGate, recordActionInTx } from "@/domain/approvals/tx-log";
export type { ApprovalInboxItemDto, ApprovalViewDto, RoutePreviewDTO, RoutePreviewStepDTO } from "@/domain/approvals/dto";
export { projectActionResult } from "@/domain/approvals/dto";
export type { ApprovalActionResult } from "@/domain/approvals/dto";

// 04.1(EXP-03·EXP-04): 결재 서비스. 읽기와 쓰기를 나눈다(CEO-2 — ARCHITECTURE
// §4-8 (3)): 설정 · 조직 스냅숏 · 행동 로그 켜짐 여부는 트랜잭션 전에 읽고,
// 트랜잭션 안에서는 tx를 받는 리포지토리 호출만 돈다. 결재 권한은 메뉴 권한이
// 아니라 결재선이다 — 승인은 매번 walkRoute로 후보를 다시 판정한다.

// 대표 폴백 계급(시드 계급 id — domain/permissions/roles.ts는 이 페이즈가 고치지 않는다).
export const FALLBACK_ROLE_ID = "role-ceo";

export class ApprovalConflictError extends UserFacingError {}
export class NotCurrentHolderError extends UserFacingError {}
export class RouteBlockedError extends UserFacingError {}

const NOT_HOLDER_MESSAGE = "지금 담당이 아님 · 새로 고침";
// 04.1-02 Task 3이 관련자에게 처리자 이름 · 시각이 담긴 문구를 조립한다 — 여기는 기본 문구.
const CONFLICT_MESSAGE = "다른 처리가 먼저 끝남 · 새로 고침";
const FINAL_MESSAGES: Record<"approved" | "rejected" | "withdrawn", string> = {
  approved: "최종 승인됨 · 새로 고침",
  rejected: "반려됨 · 새로 고침",
  withdrawn: "회수됨 · 새로 고침",
};
const NO_FALLBACK_MESSAGE = "대표 없음 · 관리자에게 대표 계급 확인 요청";

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

export type ApprovalDeps = {
  now?: Date;
  listOrgSnapshot?: typeof defaultListOrgSnapshot;
  loadActionLogGate?: typeof defaultLoadActionLogGate;
  appendActionLog?: TxLogDeps["appendActionLog"];
  // 노출표 조회 — 테스트가 호출 수를 세려고 주입한다.
  findVisibility?: typeof defaultFindVisibility;
};

// 요청 단위 노출 메모(CEO-17) — 정보 항목마다 visible()을 한 번만 부른다. 요청마다
// 새로 만든다(모듈 전역 캐시를 두지 않는다 — 노출표 변경이 다음 요청에 바로 반영).
export function createVisibleMemo(findVisibility?: typeof defaultFindVisibility): typeof defaultVisible {
  const memo = new Map<string, Promise<boolean>>();
  return (viewer, infoItem) => {
    let result = memo.get(infoItem);
    if (!result) {
      result = defaultVisible(viewer, infoItem, findVisibility ? { findVisibility } : undefined);
      memo.set(infoItem, result);
    }
    return result;
  };
}

function toRouteStep(row: ApprovalStepWithActor): RouteStep {
  return {
    stepIndex: row.stepIndex,
    label: row.label,
    roleId: row.roleId,
    scopeKind: row.scopeKind as ScopeKind,
    scopeTargetId: row.scopeTargetId,
    isFallback: row.isFallback,
    actedBy: row.actedBy,
    actedByName: row.actedByName,
    actedAt: row.actedAt,
    action: row.action === "approved" || row.action === "rejected" ? row.action : null,
    selfApproved: row.selfApproved,
  };
}

async function readSnapshot(viewer: Viewer, deps?: ApprovalDeps): Promise<SnapshotPerson[]> {
  return (deps?.listOrgSnapshot ?? defaultListOrgSnapshot)(viewer, seoulToday(deps?.now));
}

// ── 제출 ────────────────────────────────────────────────────────────────

export type PreparedSubmission = {
  kind: string;
  drafterId: string;
  selfApproval: SelfApproval;
  drafterTeamId: string | null;
  drafterOrgUnitId: string | null;
  steps: NewApprovalStep[];
  walk: WalkRouteResult;
  gate: ActionLogGate;
};

type RouteLabelNames = Awaited<ReturnType<typeof listRouteLabelNames>>;

function nameOf(list: { id: string; name: string }[], id: string | null): string | null {
  return id === null ? null : (list.find((item) => item.id === id)?.name ?? null);
}

function planStep(
  stepIndex: number,
  config: RouteConfigStep,
  drafter: { teamId: string | null; orgUnitId: string | null },
  names: RouteLabelNames,
): NewApprovalStep {
  const roleId = config.roleId === "" ? null : config.roleId;
  let scopeKind: ScopeKind;
  let scopeTargetId: string | null;
  let scopeLabel: string;
  if (config.scope === "drafter_team") {
    scopeKind = "team";
    scopeTargetId = drafter.teamId;
    scopeLabel = nameOf(names.teams, drafter.teamId) ?? "기안자 팀";
  } else if (config.scope === "drafter_org_unit") {
    scopeKind = "org_unit";
    scopeTargetId = drafter.orgUnitId;
    scopeLabel = nameOf(names.orgUnits, drafter.orgUnitId) ?? "기안자 본부";
  } else if (config.scope === "org_unit") {
    scopeKind = "org_unit";
    scopeTargetId = config.orgUnitId === "" ? null : config.orgUnitId;
    scopeLabel = nameOf(names.orgUnits, scopeTargetId) ?? "특정 부서";
  } else {
    scopeKind = "company";
    scopeTargetId = null;
    scopeLabel = "전사";
  }
  const label = (roleId === null ? null : nameOf(names.roles, roleId)) ?? scopeLabel;
  return { stepIndex, label, roleId, scopeKind, scopeTargetId };
}

function unactedSteps(steps: NewApprovalStep[]): RouteStep[] {
  return steps.map((step) => ({
    ...step,
    scopeKind: step.scopeKind as ScopeKind,
    isFallback: false,
    actedBy: null,
    actedByName: null,
    actedAt: null,
    action: null,
    selfApproved: false,
  }));
}

// 지금 설정 · 지금 소속으로 결재선을 조립한다(아무것도 쓰지 않는다).
async function planRoute(
  viewer: Viewer,
  input: { kind: string; drafterId: string },
  deps?: ApprovalDeps,
): Promise<Omit<PreparedSubmission, "gate"> & { drafterName: string | null }> {
  const def = getDocumentKind(input.kind);
  const config = await def.loadRouteConfig();
  const snapshot = await readSnapshot(viewer, deps);
  const names = await listRouteLabelNames(viewer);
  const drafter = snapshot.find((person) => person.id === input.drafterId);
  const drafterTeamId = drafter?.teamId ?? null;
  const drafterOrgUnitId = drafter?.orgUnitId ?? null;

  const steps = config.steps.flatMap((step, i) =>
    step.enabled ? [planStep(i + 1, step, { teamId: drafterTeamId, orgUnitId: drafterOrgUnitId }, names)] : [],
  );
  const walk = walkRoute({
    steps: unactedSteps(steps),
    snapshot,
    selfApproval: config.selfApproval,
    drafterId: input.drafterId,
    fallbackRoleId: FALLBACK_ROLE_ID,
    at: "before_action",
  });
  return {
    kind: input.kind,
    drafterId: input.drafterId,
    drafterName: drafter?.name ?? null,
    selfApproval: config.selfApproval,
    drafterTeamId,
    drafterOrgUnitId,
    steps,
    walk,
  };
}

// 트랜잭션 전 읽기 — 결재선 설정(한 번) · 조직 스냅숏 · 행동 로그 켜짐 여부.
// 결재선이 막히면(대표 없음) 트랜잭션을 열기 전에 제출을 거부한다.
export async function prepareSubmission(
  viewer: Viewer,
  input: { kind: string; drafterId: string },
  deps?: ApprovalDeps,
): Promise<PreparedSubmission> {
  const { drafterName, ...planned } = await planRoute(viewer, input, deps);
  void drafterName;
  if (planned.walk.outcome.kind === "blocked") throw new RouteBlockedError(NO_FALLBACK_MESSAGE);
  const gate = await (deps?.loadActionLogGate ?? defaultLoadActionLogGate)();
  return { ...planned, gate };
}

// 제출 전 결재선 미리보기(CX-R3) — 제출과 같은 도우미(planRoute)로 지금 설정 · 지금
// 소속을 해석하되 아무것도 쓰지 않는다. 빈 자리는 목록에 없고, 자기 승인 건너뜀
// 자리는 skipped. 이름은 approval.value 투영을 통과할 때만 실린다.
export async function previewRoute(
  viewer: Viewer,
  input: { kind: string },
  deps?: ApprovalDeps,
): Promise<RoutePreviewDTO> {
  const planned = await planRoute(viewer, { kind: input.kind, drafterId: viewer.id }, deps);
  if (planned.walk.outcome.kind === "blocked") throw new RouteBlockedError(NO_FALLBACK_MESSAGE);
  const visible = createVisibleMemo(deps?.findVisibility);

  const rows: Partial<RoutePreviewStepDTO>[] = planned.walk.display.flatMap((step): Partial<RoutePreviewStepDTO>[] => {
    if (step.state === "skipped_self") return [{ label: step.label, skipped: true }];
    if (step.state === "current" || step.state === "pending") {
      return [{ label: step.label, holderNames: step.holderNames, skipped: false }];
    }
    return [];
  });
  const steps: Partial<RoutePreviewStepDTO>[] = [];
  for (const [i, row] of rows.entries()) {
    const projected = await project(viewer, row, ROUTE_PREVIEW_STEP_DTO_SPEC, { visible });
    // 자리 이름을 볼 수 없어도 자리는 사라지지 않는다 — 순번으로 둔다(CX2-W1).
    steps.push(projected.label === undefined ? { label: `${i + 1}단`, ...projected } : projected);
  }
  const head = planned.drafterName === null ? {} : await project(viewer, { drafterName: planned.drafterName }, ROUTE_PREVIEW_DTO_SPEC, { visible });
  return { ...head, steps };
}

// 트랜잭션 안 쓰기만 — 인스턴스 · 차수 · 단계 · document_submit 로그(같은 tx).
export async function submitDocument(
  viewer: Viewer,
  prepared: PreparedSubmission,
  input: { documentId: string },
  tx: DbOrTx,
  deps?: TxLogDeps,
): Promise<ApprovalInstanceRow> {
  const instance = await insertApprovalInstance(
    viewer,
    {
      documentKind: prepared.kind,
      documentId: input.documentId,
      drafterId: prepared.drafterId,
      status: nextStep("draft", "submit"),
      currentRound: 1,
    },
    tx,
  );
  const route = await insertApprovalRoute(
    viewer,
    {
      instanceId: instance.id,
      round: 1,
      selfApproval: prepared.selfApproval,
      drafterTeamId: prepared.drafterTeamId,
      drafterOrgUnitId: prepared.drafterOrgUnitId,
    },
    tx,
  );
  await insertApprovalSteps(viewer, route.id, prepared.steps, tx);
  await recordActionInTx(
    viewer,
    {
      actionType: "document_submit",
      entity: "approval_instance",
      entityId: instance.id,
      documentId: input.documentId,
      detail: { kind: prepared.kind, round: 1 },
    },
    tx,
    prepared.gate,
    deps,
  );
  return instance;
}

// ── 승인 ────────────────────────────────────────────────────────────────

type RefusalReason = "conflict" | "not_holder" | "final";

function refuse(
  reason: RefusalReason,
  error: Error,
  fields: { instanceId: string; viewerId: string; expectedVersion: number; actualVersion: number | null },
): Error {
  log.info("approval.refused", { ...fields, reason });
  return error;
}

function currentRouteOf(graph: ApprovalGraph) {
  return graph.routes.find((route) => route.round === graph.instance.currentRound) ?? null;
}

function walkGraph(graph: ApprovalGraph, snapshot: SnapshotPerson[]): WalkRouteResult | null {
  const route = currentRouteOf(graph);
  if (!route) return null;
  return walkRoute({
    steps: route.steps.map(toRouteStep),
    snapshot,
    selfApproval: route.selfApproval as SelfApproval,
    drafterId: graph.instance.drafterId,
    fallbackRoleId: FALLBACK_ROLE_ID,
    at: "before_action",
  });
}

function warnIfBlocked(graph: ApprovalGraph, walk: WalkRouteResult | null): void {
  if (!walk || walk.outcome.kind !== "blocked") return;
  if (!IN_PROGRESS.includes(graph.instance.status)) return;
  log.warn("approval.route_blocked", {
    instanceId: graph.instance.id,
    kind: graph.instance.documentKind,
    round: graph.instance.currentRound,
    stepIndex: walk.outcome.stepIndex,
  });
}

// (1) version 불일치 · (2) 종결 상태 — 후보 판정보다 먼저. 04.1-02 Task 3이 이
// 자리에 관련자 판정(isApprovalParty — 기안자 · 모든 차수 acted_by ·
// walk.currentHolderIds)을 끼워 오류 종류를 가른다. 여기서는 기본 문구다.
function staleOrFinalRefusal(
  viewer: Viewer,
  graph: ApprovalGraph,
  expectedVersion: number,
): Error | null {
  const { instance } = graph;
  const fields = { instanceId: instance.id, viewerId: viewer.id, expectedVersion, actualVersion: instance.version };
  if (instance.version !== expectedVersion) {
    return refuse("conflict", new ApprovalConflictError(CONFLICT_MESSAGE), fields);
  }
  if (instance.status === "approved" || instance.status === "rejected" || instance.status === "withdrawn") {
    return refuse("final", new ApprovalConflictError(FINAL_MESSAGES[instance.status]), fields);
  }
  return null;
}

// 액션 토스트 재료(B-A1) — 투영 전 값이라 액션은 projectActionResult를 지난 뒤에만 돌려준다.
export type ApproveResult = {
  status: ApprovalStatus;
  version: number;
  documentId: string;
  kind: string;
  final: boolean;
  nextHolderNames: string | null;
};

function currentHolderNamesOf(walk: WalkRouteResult | null): string | null {
  if (!walk || walk.outcome.kind !== "actionable") return null;
  return walk.display.find((step) => step.state === "current")?.holderNames || null;
}

// 문서의 지금 단계 담당 이름(없으면 null) — 신청 · 다시 신청 토스트 재료(투영 전).
export async function currentHolderNames(
  viewer: Viewer,
  input: { kind: string; documentId: string },
  deps?: ApprovalDeps,
): Promise<string | null> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: input.kind, documentId: input.documentId });
  if (!graph || !IN_PROGRESS.includes(graph.instance.status)) return null;
  return currentHolderNamesOf(walkGraph(graph, await readSnapshot(viewer, deps)));
}

// 최종 승인 토스트의 차감 일수(B-C2 — 출처는 종류가 준 요약의 daysQuarters · days).
// 요약에 일수가 없거나 0이면(재택 · 일수 없는 종류) null.
export async function describeDeduction(viewer: Viewer, input: { kind: string; documentId: string }): Promise<string | null> {
  const described = await getDocumentKind(input.kind).describeDocuments(viewer, [input.documentId]);
  const summary = described.get(input.documentId);
  if (!summary || !("daysQuarters" in summary) || !("days" in summary)) return null;
  const { daysQuarters, days } = summary;
  return typeof daysQuarters === "number" && daysQuarters > 0 && typeof days === "string" ? days : null;
}

export async function approveDocument(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion: number },
  deps?: ApprovalDeps,
): Promise<ApproveResult> {
  const snapshot = await readSnapshot(viewer, deps);
  const gate = await (deps?.loadActionLogGate ?? defaultLoadActionLogGate)();

  return withTransaction(async (tx) => {
    const graph = await findApprovalGraphById(viewer, input.instanceId, tx);
    const baseFields = { instanceId: input.instanceId, viewerId: viewer.id, expectedVersion: input.expectedVersion };
    if (!graph) throw refuse("not_holder", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), { ...baseFields, actualVersion: null });
    const { instance } = graph;
    const fields = { ...baseFields, actualVersion: instance.version };

    const staleOrFinal = staleOrFinalRefusal(viewer, graph, input.expectedVersion);
    if (staleOrFinal) throw staleOrFinal;

    const route = currentRouteOf(graph);
    const before = walkGraph(graph, snapshot);
    warnIfBlocked(graph, before);
    if (!route || !before || before.outcome.kind !== "actionable" || !before.outcome.candidateIds.includes(viewer.id)) {
      throw refuse("not_holder", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), fields);
    }
    const outcome = before.outcome;
    const selfApproved = viewer.id === instance.drafterId;
    const steps = route.steps.map(toRouteStep);
    const actedAt = new Date();
    const acted = { actedBy: viewer.id, actedByName: null, actedAt, action: "approved" as const, selfApproved };
    const afterSteps: RouteStep[] = outcome.isFallback
      ? [
          ...steps,
          {
            stepIndex: outcome.stepIndex,
            label: FALLBACK_LABEL,
            roleId: FALLBACK_ROLE_ID,
            scopeKind: "company",
            scopeTargetId: null,
            isFallback: true,
            ...acted,
          },
        ]
      : steps.map((step) => (step.stepIndex === outcome.stepIndex ? { ...step, ...acted } : step));
    const after = walkRoute({
      steps: afterSteps,
      snapshot,
      selfApproval: route.selfApproval as SelfApproval,
      drafterId: instance.drafterId,
      fallbackRoleId: FALLBACK_ROLE_ID,
      at: "after_approval",
    });
    const status = nextStep(instance.status as ApprovalStatus, after.outcome.kind === "final" ? "approve_final" : "approve");

    // 상태 UPDATE 먼저(version 조건) — 경쟁자는 이 행 잠금에서 줄을 서고, 진 쪽은
    // 단계 행을 쓰기 전에 0행으로 멈춘다.
    const updated = await updateInstanceStatus(viewer, { id: instance.id, expectedVersion: input.expectedVersion, status }, tx);
    if (!updated) throw refuse("conflict", new ApprovalConflictError(CONFLICT_MESSAGE), fields);

    let stepIndex = outcome.stepIndex;
    if (outcome.isFallback) {
      stepIndex = await insertFallbackStep(
        viewer,
        { routeId: route.id, label: FALLBACK_LABEL, roleId: FALLBACK_ROLE_ID, actedBy: viewer.id, selfApproved },
        tx,
      );
    } else {
      const row = route.steps.find((step) => step.stepIndex === outcome.stepIndex);
      if (!row) throw new Error("지금 단계 행 없음");
      await recordStepAction(viewer, { stepId: row.id, actedBy: viewer.id, action: "approved", selfApproved }, tx);
    }

    await recordActionInTx(
      viewer,
      {
        actionType: "document_approve",
        entity: "approval_instance",
        entityId: instance.id,
        documentId: instance.documentId,
        detail: { kind: instance.documentKind, round: instance.currentRound, stepIndex, final: status === "approved" },
      },
      tx,
      gate,
      { appendActionLog: deps?.appendActionLog },
    );
    return {
      status: updated.status as ApprovalStatus,
      version: updated.version,
      documentId: instance.documentId,
      kind: instance.documentKind,
      final: status === "approved",
      nextHolderNames: currentHolderNamesOf(after),
    };
  });
}

// ── 조회 ────────────────────────────────────────────────────────────────

function toStepView(step: {
  stepIndex: number;
  label: string;
  state: ApprovalStepView["state"];
  isFallback: boolean;
  holderNames: string;
  actedByName: string | null;
  actedAt: Date | null;
  selfApproved: boolean;
}): ApprovalStepView {
  return {
    stepIndex: step.stepIndex,
    label: step.label,
    state: step.state,
    isFallback: step.isFallback,
    holderNames: step.holderNames,
    actedByName: step.actedByName,
    actedAt: step.actedAt,
    selfApproved: step.selfApproved,
  };
}

type ApprovalState = {
  graph: ApprovalGraph;
  // 진행 중일 때만 — 종결 상태는 walkRoute를 부르지 않는다(A-01).
  walk: WalkRouteResult | null;
  isParty: boolean;
  isCandidate: boolean;
};

async function readApprovalState(
  viewer: Viewer,
  graph: ApprovalGraph,
  opts: { today: string; logBlocked: boolean; listOrgSnapshot?: typeof defaultListOrgSnapshot },
): Promise<ApprovalState> {
  const actedByAny = graph.routes.some((route) => route.steps.some((step) => step.actedBy === viewer.id));
  let walk: WalkRouteResult | null = null;
  if (IN_PROGRESS.includes(graph.instance.status)) {
    const snapshot = await (opts.listOrgSnapshot ?? defaultListOrgSnapshot)(viewer, opts.today);
    walk = walkGraph(graph, snapshot);
    if (opts.logBlocked) warnIfBlocked(graph, walk);
  }
  const isCandidate = walk?.outcome.kind === "actionable" && walk.outcome.candidateIds.includes(viewer.id);
  return { graph, walk, isParty: graph.instance.drafterId === viewer.id || actedByAny || isCandidate, isCandidate };
}

// 결재 문서가 보이는 사람 = 기안자 · 이 문서에서 처리한 사람 · 지금 단계 후보(진행
// 중일 때만). 종류 모듈(domain/leave/access.ts)의 보임 규칙이 이것을 그대로 쓴다.
export async function canSeeApprovalDocument(
  viewer: Viewer,
  input: { kind: string; documentId: string },
  deps?: { today?: string; listOrgSnapshot?: typeof defaultListOrgSnapshot },
): Promise<boolean> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: input.kind, documentId: input.documentId });
  if (!graph) return false;
  const state = await readApprovalState(viewer, graph, {
    today: deps?.today ?? seoulToday(),
    logBlocked: false,
    listOrgSnapshot: deps?.listOrgSnapshot,
  });
  return state.isParty;
}

export async function getApprovalView(
  viewer: Viewer,
  input: { kind: string; documentId: string },
  deps?: ApprovalDeps,
): Promise<Partial<ApprovalViewDto> | null> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: input.kind, documentId: input.documentId });
  if (!graph) return null;
  const state = await readApprovalState(viewer, graph, {
    today: seoulToday(deps?.now),
    logBlocked: true,
    listOrgSnapshot: deps?.listOrgSnapshot,
  });
  if (!state.isParty) return null;

  const route = currentRouteOf(graph);
  let steps: ApprovalStepView[];
  let currentStepIndex: number | null = null;
  const actions: ApprovalAction[] = [];
  if (state.walk) {
    steps = state.walk.display.map(toStepView);
    const outcome = state.walk.outcome;
    if (outcome.kind !== "final") currentStepIndex = outcome.stepIndex;
    if (state.isCandidate) actions.push("approve");
  } else {
    // 종결 상태 — 저장된 처리 기록만(스냅숏 해석 없음), 지금 단계 없음.
    steps = (route?.steps ?? [])
      .filter((step) => step.action !== null)
      .map((step) =>
        toStepView({
          stepIndex: step.stepIndex,
          label: step.label,
          state: step.action === "rejected" ? "rejected" : "approved",
          isFallback: step.isFallback,
          holderNames: step.actedByName ?? "",
          actedByName: step.actedByName,
          actedAt: step.actedAt,
          selfApproved: step.selfApproved,
        }),
      );
  }

  const source: ApprovalViewDto = {
    instanceId: graph.instance.id,
    kind: graph.instance.documentKind,
    documentId: graph.instance.documentId,
    status: graph.instance.status as ApprovalStatus,
    version: graph.instance.version,
    round: graph.instance.currentRound,
    drafterName: graph.instance.drafterName,
    steps,
    currentStepIndex,
    actions,
  };
  return project(viewer, source, APPROVAL_VIEW_DTO_SPEC, { visible: createVisibleMemo(deps?.findVisibility) });
}

export type InboxResult = { mine: Partial<ApprovalInboxItemDto>[]; processed: Partial<ApprovalInboxItemDto>[] };

const PROCESSED_LIMIT = 50;

// 결재함 — mine = 지금 단계 후보인 진행 중 문서(제출 오름차순), processed = 내가
// 처리한 문서(처리 내림차순 50건). scopeFor()로 거르지 않는다(Pitfall 3) — 문서마다
// 결재선을 지금 조직으로 다시 풀어 viewer가 후보인지 본다. 읽기 전용이다.
export async function listMyInbox(viewer: Viewer, deps?: ApprovalDeps): Promise<InboxResult> {
  const visible = createVisibleMemo(deps?.findVisibility);
  const snapshot = await readSnapshot(viewer, deps);
  const active = await listActiveInstances(viewer);

  const mineSources: ApprovalInboxItemSource[] = [];
  for (const instance of active) {
    const walk = walkRoute({
      steps: instance.steps.map(toRouteStep),
      snapshot,
      selfApproval: instance.route.selfApproval as SelfApproval,
      drafterId: instance.drafterId,
      fallbackRoleId: FALLBACK_ROLE_ID,
      at: "before_action",
    });
    const outcome = walk.outcome;
    if (outcome.kind === "blocked") {
      log.warn("approval.route_blocked", {
        instanceId: instance.id,
        kind: instance.documentKind,
        round: instance.currentRound,
        stepIndex: outcome.stepIndex,
      });
      continue;
    }
    if (outcome.kind !== "actionable" || !outcome.candidateIds.includes(viewer.id)) continue;
    const current = walk.display.find((step) => step.stepIndex === outcome.stepIndex && step.state === "current");
    const def = getDocumentKind(instance.documentKind);
    mineSources.push({
      instanceId: instance.id,
      kind: instance.documentKind,
      kindLabel: def.label,
      documentId: instance.documentId,
      href: def.href(instance.documentId),
      drafterName: instance.drafterName,
      submittedAt: instance.route.submittedAt,
      status: instance.status as ApprovalStatus,
      version: instance.version,
      stepLabel: current?.label ?? null,
      holderNames: current?.holderNames ?? null,
      actedAt: null,
      actedAction: null,
      summary: null,
    });
  }

  const processedRows = await listProcessedInstances(viewer, viewer.id, PROCESSED_LIMIT);
  const processedSources: ApprovalInboxItemSource[] = processedRows.map((row) => {
    const def = getDocumentKind(row.documentKind);
    return {
      instanceId: row.id,
      kind: row.documentKind,
      kindLabel: def.label,
      documentId: row.documentId,
      href: def.href(row.documentId),
      drafterName: row.drafterName,
      submittedAt: row.submittedAt,
      status: row.status as ApprovalStatus,
      version: row.version,
      stepLabel: null,
      holderNames: null,
      actedAt: row.actedAt,
      actedAction: row.action,
      summary: null,
    };
  });

  // 종류마다 id 목록을 한 번에 요약한다(행마다 따로 읽지 않는다).
  const all = [...mineSources, ...processedSources];
  const idsByKind = new Map<string, string[]>();
  for (const source of all) idsByKind.set(source.kind, [...(idsByKind.get(source.kind) ?? []), source.documentId]);
  const summaries = new Map<string, object>();
  for (const [kind, ids] of idsByKind) {
    const described = await getDocumentKind(kind).describeDocuments(viewer, [...new Set(ids)], { visible });
    for (const [id, summary] of described) summaries.set(`${kind}:${id}`, summary);
  }
  for (const source of all) source.summary = summaries.get(`${source.kind}:${source.documentId}`) ?? null;

  return {
    mine: await Promise.all(mineSources.map((source) => project(viewer, source, APPROVAL_INBOX_ITEM_DTO_SPEC, { visible }))),
    processed: await Promise.all(processedSources.map((source) => project(viewer, source, APPROVAL_INBOX_ITEM_DTO_SPEC, { visible }))),
  };
}
