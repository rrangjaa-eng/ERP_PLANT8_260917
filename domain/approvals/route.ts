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

// 결재선 한 차수를 처리 기록 뒤 첫 단계부터 훑는다. 동작의 유일한 정의는 04.1-01
// Task 3 ②의 결정표(R1~R6 · W1~W13)다. 후보 = 담당 − 기안자 − 이 차수 승인자.
export function walkRoute(input: WalkRouteInput): WalkRouteResult {
  const steps = [...input.steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const approvers = new Set(steps.filter((s) => s.action === "approved" && s.actedBy !== null).map((s) => s.actedBy as string));
  const display: DisplayStep[] = [];
  const holderUnion = new Set<string>();
  let current: WalkOutcome | null = null;
  let emptyAfterLastAction = false;

  for (const step of steps) {
    const holders = resolveHolders(step, input.snapshot);
    for (const h of holders) holderUnion.add(h.id);
    const base = {
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

    const candidates = holders.filter((h) => h.id !== input.drafterId && !approvers.has(h.id));
    const drafter = holders.find((h) => h.id === input.drafterId);
    let chosen: SnapshotPerson[] = candidates;
    let selfApprove = false;
    if (candidates.length === 0) {
      if (drafter && input.selfApproval === "skip") {
        // W4 — 기안자 자기 승인 없음: 통과로 보고 다음 단계로(승인으로도 빈 자리로도 세지 않는다).
        display.push({ ...base, state: "skipped_self", holderIds: [], holderNames: "" });
        continue;
      }
      if (drafter && !approvers.has(drafter.id)) {
        // W5 — 본인 승인: 기안자 단독 후보.
        chosen = [drafter];
        selfApprove = true;
      } else {
        // W2 · W3 · W6 — 빈 자리.
        if (current === null) emptyAfterLastAction = true;
        display.push({ ...base, state: "empty", holderIds: [], holderNames: "" });
        continue;
      }
    }

    const holderIds = chosen.map((c) => c.id);
    const holderNames = describeHolders(chosen.map((c) => c.name));
    if (current === null) {
      current = { kind: "actionable", stepIndex: step.stepIndex, isFallback: step.isFallback, candidateIds: holderIds, selfApprove };
      display.push({ ...base, state: "current", holderIds, holderNames });
    } else {
      display.push({ ...base, state: "pending", holderIds, holderNames });
    }
  }

  const nextIndex = steps.reduce((max, s) => Math.max(max, s.stepIndex), 0) + 1;
  const blockedEntry = { stepIndex: nextIndex, label: FALLBACK_LABEL, isFallback: true, actedBy: null, actedByName: null, actedAt: null, selfApproved: false };

  if (current === null) {
    const needsFallback = emptyAfterLastAction || approvers.size === 0;
    const fallbackHolders = needsFallback ? input.snapshot.filter((p) => p.roleId === input.fallbackRoleId) : [];
    const remaining = fallbackHolders.filter((p) => !approvers.has(p.id));
    const others = remaining.filter((p) => p.id !== input.drafterId);
    const drafter = remaining.find((p) => p.id === input.drafterId);

    if (needsFallback && (others.length > 0 || drafter)) {
      // W7 · W8 — 대표 폴백(자기 승인 값을 적용하지 않는다).
      const chosen = others.length > 0 ? others : [drafter as SnapshotPerson];
      const holderIds = chosen.map((c) => c.id);
      for (const h of fallbackHolders) holderUnion.add(h.id);
      current = { kind: "actionable", stepIndex: nextIndex, isFallback: true, candidateIds: holderIds, selfApprove: others.length === 0 };
      display.push({ ...blockedEntry, state: "current", holderIds, holderNames: describeHolders(chosen.map((c) => c.name)) });
    } else if (approvers.size === 0) {
      // W11 — 대표 없음.
      current = { kind: "blocked", reason: "no_fallback_holder", stepIndex: nextIndex };
      display.push({ ...blockedEntry, state: "blocked", holderIds: [], holderNames: "" });
    } else if (input.at === "after_approval") {
      // W9 · W12 — 최종.
      current = { kind: "final" };
    } else {
      // W10 · W13 — 행동 전 최종 = 막힘(고아 최종, ENG-3 · D2).
      current = { kind: "blocked", reason: "orphan_final", stepIndex: nextIndex };
      display.push({ ...blockedEntry, state: "blocked", holderIds: [], holderNames: "" });
    }
  }

  return { outcome: current, display, currentHolderIds: [...holderUnion] };
}
