// 04.1(EXP-03·EXP-04): 결재 모듈의 순수 함수 — DB·설정·시계를 import하지 않는다.
// 문서 종류 이름으로 분기하지 않는다(종류별 차이는 호출자가 넘기는 입력 —
// 자기 승인 값 · 단계 행 — 으로만 들어온다).

export const APPROVAL_STATUSES = ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_EVENTS = ["submit", "approve", "approve_final", "reject", "withdraw", "resubmit"] as const;
export type ApprovalEvent = (typeof APPROVAL_EVENTS)[number];

export class InvalidTransitionError extends Error {}

// 상태 기계 표 — 표 밖 전이는 예외다. approved·withdrawn은 끝 상태이고,
// rejected에서 나가는 유일한 전이는 resubmit이다.
const TRANSITIONS: Record<ApprovalStatus, Partial<Record<ApprovalEvent, ApprovalStatus>>> = {
  draft: { submit: "submitted" },
  submitted: { approve: "in_review", approve_final: "approved", reject: "rejected", withdraw: "withdrawn" },
  in_review: { approve: "in_review", approve_final: "approved", reject: "rejected", withdraw: "withdrawn" },
  approved: {},
  rejected: { resubmit: "submitted" },
  withdrawn: {},
};

export function nextStep(status: ApprovalStatus, event: ApprovalEvent): ApprovalStatus {
  const next = TRANSITIONS[status][event];
  if (!next) throw new InvalidTransitionError(`허용되지 않는 결재 전이: ${status} → ${event}`);
  return next;
}

export type ScopeKind = "team" | "org_unit" | "company";
export type SelfApproval = "skip" | "self_approve";

// 제출 때 고정된 단계 행(+ 처리 기록). 사람은 처리 기록(actedBy)에만 있다.
export type RouteStep = {
  stepIndex: number;
  label: string;
  roleId: string | null;
  scopeKind: ScopeKind;
  scopeTargetId: string | null;
  isFallback: boolean;
  actedBy: string | null;
  actedByName: string | null;
  actedAt: Date | null;
  action: "approved" | "rejected" | null;
  selfApproved: boolean;
};

// 처리·표시 시점의 조직 스냅숏 — 보관되지 않은 사람 × 계급 × 현재 소속.
export type SnapshotPerson = {
  id: string;
  name: string;
  roleId: string | null;
  teamId: string | null;
  orgUnitId: string | null;
};

export type WalkAt = "before_action" | "after_approval";

export type WalkRouteInput = {
  steps: RouteStep[];
  snapshot: SnapshotPerson[];
  selfApproval: SelfApproval;
  drafterId: string;
  fallbackRoleId: string;
  at: WalkAt;
};

export type WalkOutcome =
  | { kind: "actionable"; stepIndex: number; isFallback: boolean; candidateIds: string[]; selfApprove: boolean }
  | { kind: "final" }
  | { kind: "blocked"; reason: "no_fallback_holder" | "orphan_final"; stepIndex: number };

export type DisplayState = "approved" | "rejected" | "current" | "pending" | "empty" | "skipped_self" | "blocked";

export type DisplayStep = {
  stepIndex: number;
  label: string;
  state: DisplayState;
  isFallback: boolean;
  holderIds: string[];
  holderNames: string;
  actedBy: string | null;
  actedByName: string | null;
  actedAt: Date | null;
  selfApproved: boolean;
};

export type WalkRouteResult = {
  outcome: WalkOutcome;
  display: DisplayStep[];
  // 지금 차수 단계 행 전부를 스냅숏으로 해석한 담당의 합집합(기안자·승인자를
  // 빼기 전) + 지금 대표 폴백 자리면 폴백 후보 — 04.1-02 관련자 판정 재료.
  currentHolderIds: string[];
};

export const FALLBACK_LABEL = "대표";

// 담당 해석 — 계급 조건(null이면 무관) × 범위. 대상 id가 null이면 0명인
// 규칙은 team·org_unit에만 건다 — company는 대상 id를 보지 않는다(ENG-1).
export function resolveHolders(
  step: Pick<RouteStep, "roleId" | "scopeKind" | "scopeTargetId">,
  snapshot: SnapshotPerson[],
): SnapshotPerson[] {
  return snapshot.filter((p) => {
    if (step.roleId !== null && p.roleId !== step.roleId) return false;
    if (step.scopeKind === "company") return true;
    if (step.scopeTargetId === null) return false;
    return step.scopeKind === "team" ? p.teamId === step.scopeTargetId : p.orgUnitId === step.scopeTargetId;
  });
}

function describeHolders(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} · ${names[1]}`;
  return `${names[0]} 외 ${names.length - 1}명`;
}

type WalkContext = {
  input: WalkRouteInput;
  // 이 차수 승인자(본인 승인 포함).
  approvers: Set<string>;
};

type StepBase = Omit<DisplayStep, "state" | "holderIds" | "holderNames">;

// 한 단계의 자리 판정(W1~W6): 처리 가능한 후보 · 통과(skip) · 빈 자리.
// 후보 = 담당 − 기안자 − 이 차수 승인자.
function candidatesFor(
  holders: SnapshotPerson[],
  ctx: WalkContext,
): { kind: "candidates"; people: SnapshotPerson[]; selfApprove: boolean } | { kind: "skipped_self" } | { kind: "empty" } {
  const { drafterId, selfApproval } = ctx.input;
  const candidates = holders.filter((h) => h.id !== drafterId && !ctx.approvers.has(h.id));
  if (candidates.length > 0) return { kind: "candidates", people: candidates, selfApprove: false };
  const drafter = holders.find((h) => h.id === drafterId);
  if (!drafter) return { kind: "empty" };
  // W4 — 자기 승인 없음: 통과(승인으로도 빈 자리로도 세지 않는다).
  if (selfApproval === "skip") return { kind: "skipped_self" };
  // W5 — 본인 승인(아직 이 차수에 승인하지 않았을 때만) · W6 — 이미 승인했으면 빈 자리.
  return ctx.approvers.has(drafter.id) ? { kind: "empty" } : { kind: "candidates", people: [drafter], selfApprove: true };
}

// 처리 기록 · 빈 자리 · 자기 승인 통과를 훑어 첫 처리 가능 단계를 찾는다.
function advance(steps: RouteStep[], ctx: WalkContext) {
  const display: DisplayStep[] = [];
  const holderUnion = new Set<string>();
  let current: WalkOutcome | null = null;
  let emptyAfterLastAction = false;

  for (const step of steps) {
    const holders = resolveHolders(step, ctx.input.snapshot);
    for (const h of holders) holderUnion.add(h.id);
    const base: StepBase = {
      stepIndex: step.stepIndex,
      label: step.label,
      isFallback: step.isFallback,
      actedBy: step.actedBy,
      actedByName: step.actedByName,
      actedAt: step.actedAt,
      selfApproved: step.selfApproved,
    };

    if (step.action !== null) {
      emptyAfterLastAction = false;
      display.push({ ...base, state: step.action, holderIds: [], holderNames: step.actedByName ?? "" });
      continue;
    }

    const slot = candidatesFor(holders, ctx);
    if (slot.kind === "skipped_self") {
      display.push({ ...base, state: "skipped_self", holderIds: [], holderNames: "" });
      continue;
    }
    if (slot.kind === "empty") {
      if (current === null) emptyAfterLastAction = true;
      display.push({ ...base, state: "empty", holderIds: [], holderNames: "" });
      continue;
    }

    const holderIds = slot.people.map((c) => c.id);
    const holderNames = describeHolders(slot.people.map((c) => c.name));
    if (current === null) {
      current = { kind: "actionable", stepIndex: step.stepIndex, isFallback: step.isFallback, candidateIds: holderIds, selfApprove: slot.selfApprove };
      display.push({ ...base, state: "current", holderIds, holderNames });
    } else {
      display.push({ ...base, state: "pending", holderIds, holderNames });
    }
  }
  return { display, holderUnion, current, emptyAfterLastAction };
}

// 처리할 단계가 없을 때의 끝 판정(W7~W13): 대표 폴백 · 본인 승인 · 최종 · 막힘.
function fallback(
  ctx: WalkContext,
  state: { emptyAfterLastAction: boolean; nextIndex: number },
): { outcome: WalkOutcome; entry: DisplayStep | null; fallbackHolderIds: string[] } {
  const { input, approvers } = ctx;
  const entry: StepBase = {
    stepIndex: state.nextIndex,
    label: FALLBACK_LABEL,
    isFallback: true,
    actedBy: null,
    actedByName: null,
    actedAt: null,
    selfApproved: false,
  };
  // 폴백 조건 = 남은 단계가 전부 빈 자리 또는 이 차수 승인 0건(CEO-1).
  const needsFallback = state.emptyAfterLastAction || approvers.size === 0;
  const holders = needsFallback ? input.snapshot.filter((p) => p.roleId === input.fallbackRoleId) : [];
  const remaining = holders.filter((p) => !approvers.has(p.id));
  const others = remaining.filter((p) => p.id !== input.drafterId);
  const drafter = remaining.find((p) => p.id === input.drafterId);

  if (needsFallback && (others.length > 0 || drafter)) {
    // W7 · W8 — 폴백 자리에는 자기 승인 값을 적용하지 않는다(결정 4).
    const chosen = others.length > 0 ? others : [drafter as SnapshotPerson];
    const holderIds = chosen.map((c) => c.id);
    return {
      outcome: { kind: "actionable", stepIndex: state.nextIndex, isFallback: true, candidateIds: holderIds, selfApprove: others.length === 0 },
      entry: { ...entry, state: "current", holderIds, holderNames: describeHolders(chosen.map((c) => c.name)) },
      fallbackHolderIds: holders.map((h) => h.id),
    };
  }
  const blocked = { ...entry, state: "blocked" as const, holderIds: [], holderNames: "" };
  // W11 — 대표 없음(제출 준비면 제출 거부).
  if (approvers.size === 0) {
    return { outcome: { kind: "blocked", reason: "no_fallback_holder", stepIndex: state.nextIndex }, entry: blocked, fallbackHolderIds: [] };
  }
  // W9 · W12 — 승인 반영 뒤면 최종.
  if (input.at === "after_approval") return { outcome: { kind: "final" }, entry: null, fallbackHolderIds: [] };
  // W10 · W13 — 행동 전 최종 = 막힘(고아 최종, ENG-3 · D2).
  return { outcome: { kind: "blocked", reason: "orphan_final", stepIndex: state.nextIndex }, entry: blocked, fallbackHolderIds: [] };
}

// 결재선 한 차수를 처리 기록 뒤 첫 단계부터 훑는다. 동작의 유일한 정의는 04.1-01
// Task 3 ②의 결정표(R1~R6 · W1~W13)다.
export function walkRoute(input: WalkRouteInput): WalkRouteResult {
  const steps = [...input.steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const approvers = new Set(steps.filter((s) => s.action === "approved" && s.actedBy !== null).map((s) => s.actedBy as string));
  const ctx: WalkContext = { input, approvers };
  const walked = advance(steps, ctx);
  if (walked.current !== null) {
    return { outcome: walked.current, display: walked.display, currentHolderIds: [...walked.holderUnion] };
  }
  const nextIndex = steps.reduce((max, s) => Math.max(max, s.stepIndex), 0) + 1;
  const end = fallback(ctx, { emptyAfterLastAction: walked.emptyAfterLastAction, nextIndex });
  for (const id of end.fallbackHolderIds) walked.holderUnion.add(id);
  return {
    outcome: end.outcome,
    display: end.entry ? [...walked.display, end.entry] : walked.display,
    currentHolderIds: [...walked.holderUnion],
  };
}
