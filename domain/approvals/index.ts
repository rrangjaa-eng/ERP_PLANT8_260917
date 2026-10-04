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
  type ApprovalRouteWithSteps,
  type ApprovalStepWithActor,
  type NewApprovalStep,
} from "@/repositories/approvals";
import { listOrgSnapshot as defaultListOrgSnapshot, listRouteLabelNames } from "@/repositories/org-snapshot";
import {
  FALLBACK_LABEL,
  InvalidTransitionError,
  nextStep,
  type ApprovalEvent,
  type NextStepOptions,
  walkRoute,
  type ApprovalStatus,
  type RouteStep,
  type ScopeKind,
  type SelfApproval,
  type SnapshotPerson,
  type WalkRouteResult,
} from "@/domain/approvals/route";
import { getDocumentKind, resubmittableStatuses, type DetailFields, type DocumentKindDef, type DocumentSummary, type DocumentDetailRows, type LoadDetailsDeps, type RouteConfigStep } from "@/domain/approvals/kinds";
import { buildConflictMessage, isApprovalParty } from "@/domain/approvals/conflict-message";
import { loadActionLogGate as defaultLoadActionLogGate, recordActionInTx, type ActionLogGate, type TxLogDeps } from "@/domain/approvals/tx-log";
import {
  projectApprovalView,
  projectInboxItem,
  ROUTE_PREVIEW_DTO_SPEC,
  ROUTE_PREVIEW_STEP_DTO_SPEC,
  type RoutePreviewDTO,
  type RoutePreviewStepDTO,
  type ApprovalAction,
  type ApprovalInboxItem,
  type ApprovalInboxItemSource,
  type ApprovalRouteEndLine,
  type ApprovalStepView,
  type ApprovalView,
  type ApprovalViewDto,
} from "@/domain/approvals/dto";

export { registerDocumentKind, getDocumentKind, listDocumentKinds } from "@/domain/approvals/kinds";
export type { DocumentDetailRow, DocumentDetailRows, DocumentKindDef, DocumentMeasure, DocumentSummary, RouteConfig, RouteConfigStep, RouteSettingDefs } from "@/domain/approvals/kinds";
export { nextStep, resolveHolders, walkRoute } from "@/domain/approvals/route";
export { loadActionLogGate, recordActionInTx } from "@/domain/approvals/tx-log";
export type { ApprovalInboxItem, ApprovalInboxItemDto, ApprovalView, ApprovalViewDto, RoutePreviewDTO, RoutePreviewStepDTO } from "@/domain/approvals/dto";
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

export const NOT_HOLDER_MESSAGE = "지금 담당이 아님 · 새로 고침";
// 04.1-05(T14 · UI-SPEC 사용자 확인 대상 #2): 결재할 사람이 없어 멈춘 진행 중 문서 — 기안자에게만 결재선 끝 줄로.
// 다음 행동은 같은 행동 줄의 2차 `회수`다. 화면은 막힘을 따로 추론하지 않고 이 줄을 그리기만 한다.
export const ROUTE_BLOCKED_DRAFTER_LINE = "결재할 사람 없음 · 회수 후 새로 신청";
const NO_FALLBACK_MESSAGE = "대표 없음 · 관리자에게 대표 계급 확인 요청";

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

export type ApprovalDeps = {
  now?: Date;
  listOrgSnapshot?: typeof defaultListOrgSnapshot;
  loadActionLogGate?: typeof defaultLoadActionLogGate;
  appendActionLog?: TxLogDeps["appendActionLog"];
  // 노출표 조회 — 테스트가 호출 수를 세려고 주입한다.
  findVisibility?: typeof defaultFindVisibility;
  // 04.1-05(CEO-17): 결재함 `내 결재` 항목에 결재 시트 재료(종류 상세 · 결재선 · 가능 행동)를 붙인다.
  withDetails?: boolean;
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
  // 다시 신청의 행동 전 판정(관련자 재료)도 같은 스냅숏을 쓴다.
  snapshot: SnapshotPerson[];
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
    snapshot,
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

// ── 전이(승인 · 반려 · 회수 · 다시 신청) ──────────────────────────────────

type RefusalReason = "conflict" | "not_holder" | "final" | "not_drafter" | "invalid_state";
type RefusalFields = { instanceId: string; viewerId: string; expectedVersion: number; actualVersion: number | null };

function refuse(reason: RefusalReason, error: Error, fields: RefusalFields): Error {
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

type TransitionEvent = "approve" | "reject" | "withdraw" | "resubmit";

// 상태 기계 표(nextStep)가 그 사건을 허용하는가 — 승인은 approve · approve_final 둘 중 하나라도.
function allowsEvent(status: ApprovalStatus, event: TransitionEvent, opts?: NextStepOptions): boolean {
  const events: ApprovalEvent[] = event === "approve" ? ["approve", "approve_final"] : [event];
  return events.some((candidate) => {
    try {
      nextStep(status, candidate, opts);
      return true;
    } catch (error) {
      if (error instanceof InvalidTransitionError) return false;
      throw error;
    }
  });
}

// (2) 사건별 종결 검사(CX-B1) — 「(상태, 사건, viewer가 기안자인가) → 이 사건에 닫혔는가」 한 곳.
// nextStep 허용 표에서 읽는다: approved · withdrawn은 모든 사건에 닫혔고, rejected에서 열린 사건은
// resubmit 하나이며 그것도 기안자에게만이다(반려에서 나가는 유일한 전이). 진행 중 상태의 resubmit도 닫힘.
// 05-01 E1: resubmit은 종류의 resubmitFrom(없으면 rejected만)에 지금 상태가 있을 때만 열리고, withdrawn이 있으면
// nextStep에 allowResubmitFromWithdrawn을 준다 — approve · reject · withdraw에는 withdrawn이 여전히 닫혔다.
function closedFor(status: ApprovalStatus, event: TransitionEvent, isDrafter: boolean, kind: string): boolean {
  if (event !== "resubmit") return !allowsEvent(status, event);
  if (!isDrafter) return true;
  const from: readonly string[] = resubmittableStatuses(getDocumentKind(kind));
  if (!from.includes(status)) return true;
  return !allowsEvent(status, event, { allowResubmitFromWithdrawn: from.includes("withdrawn") });
}

// 지금 행으로 만든 상세 문구(관련자에게만) — 마지막으로 바꾼 사람(updated_by)은 기안자이거나 처리 기록의 한 사람이다.
// 이름 · 시각은 approval.value 뒤에 있다(B-A1) — 꺼진 계급에는 이름 없는 `지금 담당이 아님`으로 간다.
async function conflictMessageOf(viewer: Viewer, graph: ApprovalGraph, attempted: TransitionEvent, pre: TransitionPre): Promise<string> {
  const { instance } = graph;
  const namesVisible = await (pre.visible ?? defaultVisible)(viewer, "approval.value");
  const actorName = !namesVisible
    ? null
    : instance.updatedBy === instance.drafterId
      ? instance.drafterName
      : (graph.routes.flatMap((route) => route.steps).find((step) => step.actedBy === instance.updatedBy)?.actedByName ?? null);
  return buildConflictMessage({
    status: instance.status as ApprovalStatus,
    round: instance.currentRound,
    actorName,
    at: instance.updatedAt,
    attempted,
    versionReason: instance.versionReason === "evidence" ? "evidence" : null,
  });
}

// 관련자 판정(ENG-6 · D1) — 기안자 · 모든 차수 acted_by · 지금 차수 단계들을 행동 전 스냅숏으로 해석한 담당
// (walkRoute before_action의 currentHolderIds — 대표 폴백 자리면 폴백 후보 포함, X-1 · X-3).
function isPartyOf(viewer: Viewer, graph: ApprovalGraph, holders: WalkRouteResult | null): boolean {
  return isApprovalParty(viewer.id, {
    drafterId: graph.instance.drafterId,
    actedByIds: graph.routes.flatMap((route) => route.steps.flatMap((step) => (step.actedBy === null ? [] : [step.actedBy]))),
    currentHolderIds: holders?.currentHolderIds ?? [],
  });
}

// (1) version 불일치 · (2) 종결 — 관련자면 지금 상태의 상세 문구, 아니면 이름 · 시각 · 상태가 없는
// `지금 담당이 아님`(handleServerError가 UserFacingError 문구를 그대로 화면에 보낸다). 상세 문구
// (buildConflictMessage)는 이 판정 갈래 안에서만 만든다.
async function refuseStaleOrClosed(
  viewer: Viewer,
  graph: ApprovalGraph,
  holders: WalkRouteResult | null,
  attempted: TransitionEvent,
  reason: "conflict" | "final" | "invalid_state",
  fields: RefusalFields,
  pre: TransitionPre,
): Promise<Error> {
  if (!isPartyOf(viewer, graph, holders)) return refuse("not_holder", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), fields);
  return refuse(reason, new ApprovalConflictError(await conflictMessageOf(viewer, graph, attempted, pre)), fields);
}

type TransitionContext = {
  graph: ApprovalGraph;
  route: ApprovalRouteWithSteps;
  // 행동 전 결재선 해석(진행 중일 때만) — 후보 판정과 관련자 재료(currentHolderIds).
  before: WalkRouteResult | null;
  // (3)을 통과한 승인 · 반려의 지금 자리(후보 판정 결과).
  outcome: Extract<WalkRouteResult["outcome"], { kind: "actionable" }> | null;
};

type TransitionPlan<T> = {
  status: ApprovalStatus;
  currentRound?: number;
  actionType: "document_approve" | "document_reject" | "document_withdraw" | "document_submit";
  // (6) UPDATE가 1행을 얻은 뒤에만 부른다 — 단계 기록 · 폴백 행 · 새 차수 행. 로그 detail 조각과 결과를 돌려준다.
  write: (updated: ApprovalInstanceRow) => Promise<{ detail: Record<string, unknown>; result: T }>;
};

type TransitionPre = {
  snapshot: SnapshotPerson[];
  gate: ActionLogGate;
  appendActionLog?: TxLogDeps["appendActionLog"];
  // 충돌 문구의 이름 노출 판정(없으면 기본 visible).
  visible?: typeof defaultVisible;
};

// 공용 전이 — 고정 순서(CEO-6): 트랜잭션 전 읽기(snapshot · gate — 호출자) → tx로 인스턴스·차수·단계 읽기 →
// (1) version 불일치 → (2) 사건별 종결 → (3) 후보(승인 · 반려 — 반려는 기안자 제외) 또는 기안자(회수 ·
// 다시 신청) → (4) 결과 계산(plan) → (5) 상태 UPDATE 먼저(version 조건) → (6) 단계 · 폴백 · 차수 행 →
// (7) 같은 tx 행동 로그. 재시도 코드를 두지 않는다(진 쪽은 무슨 일이 있었는지 받고 스스로 새로 고친다).
async function runTransition<T>(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion: number; event: TransitionEvent },
  pre: TransitionPre,
  tx: DbOrTx,
  plan: (ctx: TransitionContext) => TransitionPlan<T>,
): Promise<{ updated: ApprovalInstanceRow; result: T }> {
  const baseFields = { instanceId: input.instanceId, viewerId: viewer.id, expectedVersion: input.expectedVersion };
  const graph = await findApprovalGraphById(viewer, input.instanceId, tx);
  if (!graph) throw refuse("not_holder", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), { ...baseFields, actualVersion: null });
  const { instance } = graph;
  const fields = { ...baseFields, actualVersion: instance.version };
  const status = instance.status as ApprovalStatus;
  const isDrafter = viewer.id === instance.drafterId;
  const before = IN_PROGRESS.includes(status) ? walkGraph(graph, pre.snapshot) : null;
  // 관련자 재료 — 끝난 문서도 지금 차수 담당(예: 회수된 문서의 1단 팀장)은 관련자다(CEO-6 순서 B).
  const holders = before ?? walkGraph(graph, pre.snapshot);

  // (1) version 불일치 — 후보 · 기안자 판정보다 먼저(진 쪽 관련자는 무슨 일이 있었는지 받는다).
  if (instance.version !== input.expectedVersion) {
    throw await refuseStaleOrClosed(viewer, graph, holders, input.event, "conflict", fields, pre);
  }
  // (2) 사건별 종결.
  if (closedFor(status, input.event, isDrafter, instance.documentKind)) {
    const reason = IN_PROGRESS.includes(status) ? "invalid_state" : "final";
    throw await refuseStaleOrClosed(viewer, graph, holders, input.event, reason, fields, pre);
  }
  // (3) 후보 또는 기안자.
  const route = currentRouteOf(graph);
  let outcome: TransitionContext["outcome"] = null;
  if (input.event === "approve" || input.event === "reject") {
    warnIfBlocked(graph, before);
    const actionable = before?.outcome.kind === "actionable" ? before.outcome : null;
    const isCandidate = actionable !== null && actionable.candidateIds.includes(viewer.id);
    if (!route || !isCandidate || (input.event === "reject" && isDrafter)) {
      throw refuse("not_holder", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), fields);
    }
    outcome = actionable;
  } else if (!isDrafter) {
    throw refuse("not_drafter", new NotCurrentHolderError(NOT_HOLDER_MESSAGE), fields);
  }
  if (!route) throw new Error("지금 차수 행 없음");

  // (4) 결과 계산.
  const planned = plan({ graph, route, before, outcome });
  // (5) 상태 UPDATE 먼저 — 경쟁자는 이 행 잠금에서 줄을 서고, 진 쪽은 행을 쓰기 전에 0행으로 멈춘다.
  const updated = await updateInstanceStatus(
    viewer,
    { id: instance.id, expectedVersion: input.expectedVersion, status: planned.status, currentRound: planned.currentRound },
    tx,
  );
  if (!updated) {
    // (5) 0행 — 이 viewer는 (3)을 통과한 관련자다. 경쟁자가 커밋한 지금 행을 다시 읽어 상세 문구를 만든다.
    const current = await findApprovalGraphById(viewer, input.instanceId, tx);
    const message = current ? await conflictMessageOf(viewer, current, input.event, pre) : NOT_HOLDER_MESSAGE;
    throw refuse("conflict", new ApprovalConflictError(message), { ...fields, actualVersion: current?.instance.version ?? null });
  }
  // (6) 단계 · 폴백 · 차수 행.
  const written = await planned.write(updated);
  // (7) 같은 tx 행동 로그(Codex HIGH 원자성) — 켜짐 여부는 트랜잭션 전에 읽은 gate.
  await recordActionInTx(
    viewer,
    {
      actionType: planned.actionType,
      entity: "approval_instance",
      entityId: instance.id,
      documentId: instance.documentId,
      detail: { kind: instance.documentKind, round: updated.currentRound, ...written.detail },
    },
    tx,
    pre.gate,
    { appendActionLog: pre.appendActionLog },
  );
  return { updated, result: written.result };
}

async function readTransitionPre(viewer: Viewer, deps?: ApprovalDeps): Promise<TransitionPre> {
  return {
    snapshot: await readSnapshot(viewer, deps),
    gate: await (deps?.loadActionLogGate ?? defaultLoadActionLogGate)(),
    appendActionLog: deps?.appendActionLog,
    visible: createVisibleMemo(deps?.findVisibility),
  };
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

// 문서의 지금 단계 담당 이름(없으면 null) — 신청 토스트 재료(투영 전).
export async function currentHolderNames(
  viewer: Viewer,
  input: { kind: string; documentId: string },
  deps?: ApprovalDeps,
): Promise<string | null> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: input.kind, documentId: input.documentId });
  if (!graph || !IN_PROGRESS.includes(graph.instance.status)) return null;
  return currentHolderNamesOf(walkGraph(graph, await readSnapshot(viewer, deps)));
}

// 05-08: 종류 하나의 진행 중 인스턴스마다 지금 단계 이름과 보는 사람이 지금 단계 후보인지 — 결재함(listMyInbox)과 같은 walk를
// 한 번에 계산한다(문서마다 따로 읽지 않는다). 지출결의 목록의 `{단계} 결재 중` 낱말과 「지금 단계 후보」 보임 갈래의 재료다.
export type CurrentStep = { stepLabel: string | null; viewerIsCandidate: boolean };

export async function listCurrentSteps(viewer: Viewer, input: { kind: string }, deps?: ApprovalDeps): Promise<Map<string, CurrentStep>> {
  const snapshot = await readSnapshot(viewer, deps);
  const result = new Map<string, CurrentStep>();
  for (const instance of await listActiveInstances(viewer)) {
    if (instance.documentKind !== input.kind) continue;
    const walk = walkRoute({
      steps: instance.steps.map(toRouteStep),
      snapshot,
      selfApproval: instance.route.selfApproval as SelfApproval,
      drafterId: instance.drafterId,
      fallbackRoleId: FALLBACK_ROLE_ID,
      at: "before_action",
    });
    const outcome = walk.outcome;
    const actionable = outcome.kind === "actionable";
    const current = actionable ? walk.display.find((step) => step.stepIndex === outcome.stepIndex && step.state === "current") : undefined;
    result.set(instance.id, { stepLabel: current?.label ?? null, viewerIsCandidate: actionable && outcome.candidateIds.includes(viewer.id) });
  }
  return result;
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

// 종류의 최종 승인 훅 짝(등록이 둘 다 있거나 둘 다 없음을 보장한다) — 없으면 null.
function finalApprovalHookOf(kind: string): { prepare: NonNullable<DocumentKindDef["prepareFinalApproval"]>; inTx: NonNullable<DocumentKindDef["onFinalApprovalInTx"]> } | null {
  const def = getDocumentKind(kind);
  return def.prepareFinalApproval && def.onFinalApprovalInTx ? { prepare: def.prepareFinalApproval, inTx: def.onFinalApprovalInTx } : null;
}

// 05-01(Round 4 D8): 최종 승인 토스트 꼬리 — 종류 요약의 finalApprovalNote(없으면 null). 액션이 projectActionResult의
// finalNote(approval.value)로 넘긴다.
export async function describeFinalApprovalNote(viewer: Viewer, input: { kind: string; documentId: string }): Promise<string | null> {
  const described = await getDocumentKind(input.kind).describeDocuments(viewer, [input.documentId]);
  return described.get(input.documentId)?.finalApprovalNote ?? null;
}

// 05-01 E3: 종류의 승인 막힘 이유 — 필드가 없거나 문서가 없으면 부르지 않는다(04.1 결재함 조회 수 범위를 흔들지 않는다).
async function approveBlockedReasonsOf(viewer: Viewer, kind: string, documentIds: string[]): Promise<Map<string, string>> {
  const reasonsOf = getDocumentKind(kind).approveBlockedReason;
  if (!reasonsOf || documentIds.length === 0) return new Map();
  return reasonsOf(viewer, documentIds);
}

export async function approveDocument(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion: number },
  deps?: ApprovalDeps,
): Promise<ApproveResult> {
  const pre = await readTransitionPre(viewer, deps);
  // 05-01 E2(Round 4 D6): 최종 승인 훅의 읽기 짝은 트랜잭션 전 — 입력에 종류 · 문서 id가 없어 풀로 그래프를 한 번 읽는다.
  // 최종 여부는 트랜잭션 안에서야 알므로 훅이 있는 종류면 매 승인마다 읽는다(읽기 전용). 그래프가 없으면 건너뛰고
  // 트랜잭션 안 (1)~(3)이 04.1대로 거부한다. 종류 · 문서 id는 바뀌지 않는 열이라 이 값을 트랜잭션 안에서 그대로 쓴다.
  const target = await findApprovalGraphById(viewer, input.instanceId);
  const finalHook = target ? finalApprovalHookOf(target.instance.documentKind) : null;
  const prepared = target && finalHook ? await finalHook.prepare(viewer, target.instance.documentId) : undefined;
  return withTransaction(async (tx) => {
    const { updated, result } = await runTransition(viewer, { ...input, event: "approve" }, pre, tx, ({ graph, route, outcome }) => {
      if (!outcome) throw new Error("승인 자리 없음");
      const { instance } = graph;
      const selfApproved = viewer.id === instance.drafterId;
      const steps = route.steps.map(toRouteStep);
      const acted = { actedBy: viewer.id, actedByName: null, actedAt: new Date(), action: "approved" as const, selfApproved };
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
      // after_approval은 이 한 곳뿐이다(X-1) — 승인 반영 뒤 최종인지 · 다음 담당이 누구인지.
      const after = walkRoute({
        steps: afterSteps,
        snapshot: pre.snapshot,
        selfApproval: route.selfApproval as SelfApproval,
        drafterId: instance.drafterId,
        fallbackRoleId: FALLBACK_ROLE_ID,
        at: "after_approval",
      });
      const status = nextStep(instance.status as ApprovalStatus, after.outcome.kind === "final" ? "approve_final" : "approve");
      return {
        status,
        actionType: "document_approve",
        write: async () => {
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
          // 05-01 E2: 최종 승인(계산된 status approved)이면 단계 기록 뒤 · 행동 로그 전에 같은 tx로 종류의 훅 — 던지면 전부 롤백.
          if (status === "approved" && finalHook && target) {
            await finalHook.inTx(viewer, target.instance.documentId, tx, prepared);
          }
          return {
            detail: { stepIndex, final: status === "approved" },
            result: { final: status === "approved", nextHolderNames: currentHolderNamesOf(after) },
          };
        },
      };
    });
    return {
      status: updated.status as ApprovalStatus,
      version: updated.version,
      documentId: updated.documentId,
      kind: updated.documentKind,
      ...result,
    };
  });
}

// 반려 사유 규칙 — 화면(반려 확인 막힘 자리)도 이 상수를 받아 쓴다(코디네이터 결정 R1).
export const REJECT_REASON_MAX = 500;
export const REJECT_REASON_EMPTY_MESSAGE = "사유 없음 · 사유 적기";
export const REJECT_REASON_TOO_LONG_MESSAGE = "사유 500자 넘음 · 줄여 적기";

export class RejectReasonError extends UserFacingError {}

export type RejectResult = { status: ApprovalStatus; version: number; documentId: string; kind: string; drafterName: string };

// 반려 — 사유(trim 1~500자)는 트랜잭션 전에 거부한다. 지금 단계 후보(기안자 제외)만. 사유는 그 단계 행에.
export async function rejectDocument(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion: number; reason: string },
  deps?: ApprovalDeps,
): Promise<RejectResult> {
  const reason = input.reason.trim();
  if (reason.length === 0) throw new RejectReasonError(REJECT_REASON_EMPTY_MESSAGE);
  if (reason.length > REJECT_REASON_MAX) throw new RejectReasonError(REJECT_REASON_TOO_LONG_MESSAGE);
  const pre = await readTransitionPre(viewer, deps);
  return withTransaction(async (tx) => {
    const { updated, result } = await runTransition(
      viewer,
      { instanceId: input.instanceId, expectedVersion: input.expectedVersion, event: "reject" },
      pre,
      tx,
      ({ graph, route, outcome }) => {
        if (!outcome) throw new Error("반려 자리 없음");
        return {
          status: nextStep(graph.instance.status as ApprovalStatus, "reject"),
          actionType: "document_reject",
          write: async () => {
            let stepIndex = outcome.stepIndex;
            if (outcome.isFallback) {
              stepIndex = await insertFallbackStep(
                viewer,
                { routeId: route.id, label: FALLBACK_LABEL, roleId: FALLBACK_ROLE_ID, actedBy: viewer.id, selfApproved: false, action: "rejected", reason },
                tx,
              );
            } else {
              const row = route.steps.find((step) => step.stepIndex === outcome.stepIndex);
              if (!row) throw new Error("지금 단계 행 없음");
              await recordStepAction(viewer, { stepId: row.id, actedBy: viewer.id, action: "rejected", selfApproved: false, reason }, tx);
            }
            return { detail: { stepIndex }, result: { drafterName: graph.instance.drafterName } };
          },
        };
      },
    );
    return { status: updated.status as ApprovalStatus, version: updated.version, documentId: updated.documentId, kind: updated.documentKind, ...result };
  });
}

// 회수 — 기안자만, 최종 승인 전(submitted · in_review)만. 막힘 · 고아 최종에서도 된다(기안자 판정만, D2).
export async function withdrawDocument(
  viewer: Viewer,
  input: { instanceId: string; expectedVersion: number },
  deps?: ApprovalDeps,
): Promise<{ status: ApprovalStatus; version: number; documentId: string }> {
  const pre = await readTransitionPre(viewer, deps);
  return withTransaction(async (tx) => {
    const { updated } = await runTransition(viewer, { ...input, event: "withdraw" }, pre, tx, ({ graph }) => ({
      status: nextStep(graph.instance.status as ApprovalStatus, "withdraw"),
      actionType: "document_withdraw",
      write: () => Promise.resolve({ detail: {}, result: null }),
    }));
    return { status: updated.status as ApprovalStatus, version: updated.version, documentId: updated.documentId };
  });
}

// 다시 신청 — 기안자만, rejected에서만. 호출자(종류 모듈)의 트랜잭션 안에서 돈다. 새 차수의 결재선은
// 트랜잭션 전에 prepareSubmission으로 다시 읽은 설정 · 소속(CEO-2)이고, 차수 + 1 행은 상태 UPDATE가
// 1행을 얻은 뒤에만 쓴다 — 다시 신청 두 건이 겹쳐도 두 번째는 0행으로 멈춰 UNIQUE(instance_id, round)
// 위반이 나지 않는다.
export async function resubmitDocument(
  viewer: Viewer,
  prepared: PreparedSubmission,
  input: { instanceId: string; expectedVersion: number },
  tx: DbOrTx,
  deps?: TxLogDeps,
): Promise<{ status: ApprovalStatus; version: number; round: number; nextHolderNames: string | null }> {
  const pre: TransitionPre = { snapshot: prepared.snapshot, gate: prepared.gate, appendActionLog: deps?.appendActionLog };
  const { updated } = await runTransition(viewer, { ...input, event: "resubmit" }, pre, tx, ({ graph }) => {
    const round = graph.instance.currentRound + 1;
    const status = graph.instance.status as ApprovalStatus;
    return {
      // (2)의 closedFor가 종류의 resubmitFrom으로 이미 걸렀다 — withdrawn이면 그 한 칸만 연다(05-01 E1).
      status: nextStep(status, "resubmit", status === "withdrawn" ? { allowResubmitFromWithdrawn: true } : undefined),
      currentRound: round,
      actionType: "document_submit",
      write: async () => {
        const route = await insertApprovalRoute(
          viewer,
          {
            instanceId: graph.instance.id,
            round,
            selfApproval: prepared.selfApproval,
            drafterTeamId: prepared.drafterTeamId,
            drafterOrgUnitId: prepared.drafterOrgUnitId,
          },
          tx,
        );
        await insertApprovalSteps(viewer, route.id, prepared.steps, tx);
        return { detail: {}, result: null };
      },
    };
  });
  return {
    status: updated.status as ApprovalStatus,
    version: updated.version,
    round: updated.currentRound,
    nextHolderNames: currentHolderNamesOf(prepared.walk),
  };
}

// ── 조회 ────────────────────────────────────────────────────────────────

type StepViewInput = {
  stepIndex: number;
  label: string;
  state: ApprovalStepView["state"];
  isFallback: boolean;
  holderNames: string;
  actedByName: string | null;
  actedAt: Date | null;
  selfApproved: boolean;
};

function toStepView(step: StepViewInput, extra?: { reason?: string | null; viewerHolds?: boolean }): ApprovalStepView {
  return {
    stepIndex: step.stepIndex,
    label: step.label,
    state: step.state,
    isFallback: step.isFallback,
    holderNames: step.holderNames,
    actedByName: step.actedByName,
    actedAt: step.actedAt,
    selfApproved: step.selfApproved,
    reason: extra?.reason ?? null,
    viewerHolds: extra?.viewerHolds ?? false,
  };
}

// 진행 중 결재선의 표시 목록(walkRoute before_action) — 보는 사람이 지금 단계 후보면 viewerHolds.
function walkStepViews(viewer: Viewer, walk: WalkRouteResult): ApprovalStepView[] {
  return walk.display.map((step) => toStepView(step, { viewerHolds: step.state === "current" && step.holderIds.includes(viewer.id) }));
}

const SEOUL_MINUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// `09-19 10:00`(서울).
function seoulMinute(at: Date): string {
  const parts = Object.fromEntries(SEOUL_MINUTE.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// S7 끝 줄 — 자기 승인 건너뜀(진행 중 표시 목록에서) · 회수 시각.
function routeEndLines(status: ApprovalStatus, steps: ApprovalStepView[], updatedAt: Date): ApprovalRouteEndLine[] {
  const lines: ApprovalRouteEndLine[] = steps
    .filter((step) => step.state === "skipped_self")
    .map((step) => ({ text: `${step.label} 단계 건너뜀(자기 승인 없음)`, tone: "muted" }));
  if (status === "withdrawn") lines.push({ text: `회수 ${seoulMinute(updatedAt)}`, tone: "muted" });
  return lines;
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

// 가능 행동(X-5) — 서버 판정과 같은 규칙(같은 nextStep 허용 표 · 같은 후보 판정)에서 읽는다. 04.1-05의
// 결재함 상세 · 폰 시트도 이 함수 결과를 싣는다(CXF2-B-RF01). 지금 담당이면 `승인`, 기안자가 아닌 담당이면
// `반려`, 기안자면 진행 중일 때 `회수`(막힘 · 고아 최종이어도, D2), 반려됐고 종류의 다시 신청 권한이 있으면
// `다시 신청`(CX-W1). 기안자 = 지금 담당(W5 · W8)이면 [승인, 회수]이고 `반려`는 없다(CXF-B-F01).
async function possibleActions(
  viewer: Viewer,
  state: { instance: { status: string; drafterId: string; documentKind: string; documentId: string }; isCandidate: boolean },
): Promise<ApprovalAction[]> {
  const { instance } = state;
  const status = instance.status as ApprovalStatus;
  const isDrafter = instance.drafterId === viewer.id;
  const actions: ApprovalAction[] = [];
  const kind = instance.documentKind;
  if (state.isCandidate && !closedFor(status, "approve", isDrafter, kind)) actions.push("approve");
  if (state.isCandidate && !isDrafter && !closedFor(status, "reject", isDrafter, kind)) actions.push("reject");
  if (isDrafter && !closedFor(status, "withdraw", isDrafter, kind)) actions.push("withdraw");
  if (isDrafter && !closedFor(status, "resubmit", isDrafter, kind)) {
    const canResubmit = getDocumentKind(kind).canResubmit;
    if (canResubmit && (await canResubmit(viewer, instance.documentId))) actions.push("resubmit");
  }
  return actions;
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
): Promise<ApprovalView | null> {
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
    steps = walkStepViews(viewer, state.walk);
    const outcome = state.walk.outcome;
    if (outcome.kind !== "final") currentStepIndex = outcome.stepIndex;
  } else {
    // 종결 상태 — 저장된 처리 기록만(스냅숏 해석 없음), 지금 단계 없음.
    steps = (route?.steps ?? [])
      .filter((step) => step.action !== null)
      .map((step) =>
        toStepView(
          {
            stepIndex: step.stepIndex,
            label: step.label,
            state: step.action === "rejected" ? "rejected" : "approved",
            isFallback: step.isFallback,
            holderNames: step.actedByName ?? "",
            actedByName: step.actedByName,
            actedAt: step.actedAt,
            selfApproved: step.selfApproved,
          },
          { reason: step.action === "rejected" ? step.reason : null },
        ),
      );
  }

  actions.push(...(await possibleActions(viewer, { instance: graph.instance, isCandidate: state.isCandidate })));
  const blocked = state.isCandidate
    ? await approveBlockedReasonsOf(viewer, graph.instance.documentKind, [graph.instance.documentId])
    : new Map<string, string>();

  const source: ApprovalViewDto = {
    instanceId: graph.instance.id,
    kind: graph.instance.documentKind,
    documentId: graph.instance.documentId,
    status: graph.instance.status as ApprovalStatus,
    version: graph.instance.version,
    round: graph.instance.currentRound,
    drafterName: graph.instance.drafterName,
    steps,
    endLines: [
      ...routeEndLines(graph.instance.status as ApprovalStatus, steps, graph.instance.updatedAt),
      ...(state.walk?.outcome.kind === "blocked" && graph.instance.drafterId === viewer.id
        ? [{ text: ROUTE_BLOCKED_DRAFTER_LINE, tone: "danger" as const }]
        : []),
    ],
    currentStepIndex,
    actions,
    approveBlockedReason: blocked.get(graph.instance.documentId) ?? null,
  };
  return projectApprovalView(viewer, source, { visible: createVisibleMemo(deps?.findVisibility) });
}

// 04.1-05(Codex MEDIUM · ENG-17): 종류 하나의 상세를 id 목록으로 한 번에 — 원시 구조 필드 → detailDto로
// 정보 항목별 project() → 투영 결과만 buildDetailRows → 문자열 칸만 남긴 행. 원시 결과는 행 조립에 닿지 않는다.
export async function loadKindDetails(
  viewer: Viewer,
  kind: string,
  documentIds: string[],
  deps: LoadDetailsDeps,
): Promise<Map<string, DocumentDetailRows>> {
  const def = getDocumentKind(kind);
  const result = new Map<string, DocumentDetailRows>();
  if (!def.loadDetails || !def.detailDto || !def.buildDetailRows || documentIds.length === 0) return result;
  const raw = await def.loadDetails(viewer, documentIds, { visible: deps.visible, now: deps.now });
  for (const [documentId, fields] of raw) {
    const projected = await project<DetailFields, DetailFields>(viewer, fields, def.detailDto, { visible: deps.visible });
    const built = def.buildDetailRows(projected);
    result.set(documentId, {
      title: built.title,
      subtitle: built.subtitle,
      rows: built.rows.map((row) => ({ label: row.label, value: row.value, tone: row.tone })),
    });
  }
  return result;
}

// 05-01 E5(Round 4 D7): 결재함 숫자 열 머리글 — 목록 단위 구조 값(항목 투영 밖). 지금 목록 요약의 measure 종류로 정한다.
export type InboxMeasureHeader = "금액" | "일수" | "금액 · 일수" | null;

export type InboxResult = { mine: ApprovalInboxItem[]; processed: ApprovalInboxItem[]; measureHeader: InboxMeasureHeader };

function measureHeaderOf(summaries: Iterable<DocumentSummary>): InboxMeasureHeader {
  const kinds = new Set<string>();
  for (const summary of summaries) if (summary.measure) kinds.add(summary.measure.kind);
  if (kinds.has("money") && kinds.has("days")) return "금액 · 일수";
  if (kinds.has("money")) return "금액";
  if (kinds.has("days")) return "일수";
  return null;
}

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
    // 상세의 결재선 · 가능 행동은 `mine`을 가를 때 계산한 이 walk를 그대로 쓴다(다시 계산하지 않는다, X-1).
    const steps = deps?.withDetails ? walkStepViews(viewer, walk) : null;
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
      detail: null,
      steps,
      endLines: steps ? routeEndLines(instance.status as ApprovalStatus, steps, instance.updatedAt) : null,
      actions: deps?.withDetails ? await possibleActions(viewer, { instance, isCandidate: true }) : null,
      approveBlockedReason: null,
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
      detail: null,
      steps: null,
      endLines: null,
      actions: null,
      approveBlockedReason: null,
    };
  });

  // 종류마다 id 목록을 한 번에 요약한다(행마다 따로 읽지 않는다).
  const all = [...mineSources, ...processedSources];
  const idsByKind = new Map<string, string[]>();
  for (const source of all) idsByKind.set(source.kind, [...(idsByKind.get(source.kind) ?? []), source.documentId]);
  const summaries = new Map<string, DocumentSummary>();
  for (const [kind, ids] of idsByKind) {
    const described = await getDocumentKind(kind).describeDocuments(viewer, [...new Set(ids)], { visible });
    for (const [id, summary] of described) summaries.set(`${kind}:${id}`, summary);
  }
  for (const source of all) source.summary = summaries.get(`${source.kind}:${source.documentId}`) ?? null;

  // 05-01 E3: `내 결재` 문서만, 종류마다 id 목록으로 한 번(withDetails와 무관).
  const blockedIdsByKind = new Map<string, string[]>();
  for (const source of mineSources) blockedIdsByKind.set(source.kind, [...(blockedIdsByKind.get(source.kind) ?? []), source.documentId]);
  for (const [kind, ids] of blockedIdsByKind) {
    const reasons = await approveBlockedReasonsOf(viewer, kind, [...new Set(ids)]);
    for (const source of mineSources) {
      if (source.kind === kind) source.approveBlockedReason = reasons.get(source.documentId) ?? null;
    }
  }

  // 04.1-05(CEO-17): `내 결재` 상세 — 종류마다 id 목록으로 loadDetails 한 번, 같은 노출 메모 · 같은 시계.
  if (deps?.withDetails) {
    const mineIdsByKind = new Map<string, string[]>();
    for (const source of mineSources) mineIdsByKind.set(source.kind, [...(mineIdsByKind.get(source.kind) ?? []), source.documentId]);
    for (const [kind, ids] of mineIdsByKind) {
      const details = await loadKindDetails(viewer, kind, [...new Set(ids)], { visible, now: deps.now });
      for (const source of mineSources) {
        if (source.kind === kind) source.detail = details.get(source.documentId) ?? null;
      }
    }
  }

  return {
    mine: await Promise.all(mineSources.map((source) => projectInboxItem(viewer, source, { visible }))),
    processed: await Promise.all(processedSources.map((source) => projectInboxItem(viewer, source, { visible }))),
    measureHeader: measureHeaderOf(summaries.values()),
  };
}
