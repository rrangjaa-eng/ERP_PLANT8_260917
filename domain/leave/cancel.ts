import "./index";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { GateBlockedError } from "@/domain/rules/gate";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  NOT_HOLDER_MESSAGE,
  NotCurrentHolderError,
  prepareSubmission,
  previewRoute,
  recordActionInTx,
  registerDocumentKind,
  resolveHolders,
  resubmitDocument,
  submitDocument,
  validateRejectReason,
  type PreparedSubmission,
  type RouteConfig,
  type RouteConfigStep,
  type RouteHint,
} from "@/domain/approvals";
import type { DescribeDeps, DocumentDetailRow, DocumentDetailRows, DocumentSummary, LoadDetailsDeps } from "@/domain/approvals/kinds";
import type { TxLogDeps } from "@/domain/approvals/tx-log";
import type { DbOrTx } from "@/repositories/document-counters";
import { findApprovalGraphByDocument, findApprovalGraphById, type ApprovalStepWithActor } from "@/repositories/approvals";
import { findLatestActionFor } from "@/repositories/action-log";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { findLeaveRequestById, findLeaveRequestsByIds, lockLeaveDrafter, type LeaveRequestWithApproval } from "@/repositories/leave-requests";
import { assertLeaveWrite, canWriteLeave, LEAVE_CANCEL_KIND, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { formatLeaveDays, type HalfPeriod, type LeaveKind } from "@/domain/leave/days";
import { leaveSummaryFields } from "@/domain/leave";

export { LEAVE_CANCEL_KIND } from "@/domain/leave/access";

// 07.2-15(PU10 · D-7252~7256 · 07.2 D-7310): 승인된 연차의 취소 요청 — 새 문서 종류 "leave_cancel"(document_id = 원 연차 id)로 결재 엔진을
// 그대로 쓴다. 결재선은 원 연차 최신 차수의 팀장 단계를 엔진 꼴(계급 × 범위)로 복사한 한 단계 — 복사할 단계 · 보유자가 없으면 엔진의
// 대표 대체(FALLBACK_ROLE_ID)가 결재자다(결재 없이 바로 취소되는 길 0). 연차 행 쓰기 0 — 취소 판정은 인스턴스 상태로만이고 잔고 · 겹침
// 조회가 repositories/leave-usage.ts cancelledLeaveFilter 하나로 승인된 취소를 뺀다. 맨 위 `./index`는 resubmit.ts와 같은 이유(콜드 경로 등록).

const STALE_MESSAGE = "이미 처리됨 · 새로 고침";
const KIND_LABEL = "연차 취소 요청";
// 취소 사유는 끌 수 없는 status_change 행동 로그에 남긴다(마이그레이션 0 — approval_instances에 사유 칸이 없다 · 07.2-15 SUMMARY 갈림 1).
const REASON_ACTION_TYPE = "status_change";

// ── 결재선 ───────────────────────────────────────────────────────────────

type StoredStep = Pick<ApprovalStepWithActor, "stepIndex" | "roleId" | "scopeKind" | "scopeTargetId" | "isFallback">;

// 저장된 단계(계급 × 범위 종류 × 대상 id) → 설정 꼴 한 단계. team 범위는 엔진 설정에 「특정 팀」 값이 없어 drafter_team(기안자의 지금 팀)으로
// 옮긴다 — 기안자 팀이 원 연차 때와 같으면 같은 대상이다(07.2-15 SUMMARY ⚠ 1). org_unit은 저장된 본부 id 그대로.
function toConfigStep(step: StoredStep): RouteConfigStep {
  const roleId = step.roleId ?? "";
  switch (step.scopeKind) {
    case "team":
      return { enabled: true, roleId, scope: "drafter_team", orgUnitId: "" };
    case "org_unit":
      return { enabled: true, roleId, scope: "org_unit", orgUnitId: step.scopeTargetId ?? "" };
    case "company":
      return { enabled: true, roleId, scope: "company", orgUnitId: "" };
    default:
      // approval_steps_scope_kind_check가 세 값만 받는다 — 여기 닿으면 저장 값 손상(버그)이다.
      throw new Error(`연차 취소 결재선: 모르는 범위 ${step.scopeKind}`);
  }
}

// 원 연차 최신 차수에서 복사할 한 단계 — 팀장 단계(계급 = 팀장인 첫 비대체 단계 · 없으면 첫 비대체 단계 — 플래너 가정), 기안자가 오늘 그 단계
// 보유자면 그다음 비대체 단계. 없으면 null(→ 단계 0 · 엔진 대표 대체).
async function pickCancelStep(leaveId: string): Promise<StoredStep | null> {
  const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: LEAVE_DOCUMENT_KIND, documentId: leaveId });
  if (!graph) return null;
  const route = graph.routes.find((row) => row.round === graph.instance.currentRound);
  const steps = (route?.steps ?? []).filter((step) => !step.isFallback).sort((a, b) => a.stepIndex - b.stepIndex);
  const lead = steps.find((step) => step.roleId === TEAM_LEAD_ROLE_ID) ?? steps[0];
  if (!lead) return null;
  const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, seoulToday());
  const drafter = snapshot.find((person) => person.id === graph.instance.drafterId);
  const config = toConfigStep(lead);
  const scopeTargetId = config.scope === "drafter_team" ? (drafter?.teamId ?? null) : lead.scopeTargetId;
  const drafterHolds = resolveHolders({ roleId: lead.roleId, scopeKind: lead.scopeKind as "team" | "org_unit" | "company", scopeTargetId }, snapshot).some(
    (person) => person.id === graph.instance.drafterId,
  );
  if (!drafterHolds) return lead;
  return steps.find((step) => step.stepIndex > lead.stepIndex) ?? null;
}

// 엔진 planRoute가 미리보기 · 제출 · 다시 요청에서 같은 힌트로 부른다(미리보기 = 제출). 자기 승인 skip — 대표 밖 기안자의 본인 승인 0.
export async function loadLeaveCancelRouteConfig(hint?: RouteHint): Promise<RouteConfig> {
  // 호출 계약 위반(취소 결재선은 원 연차 없이 조립하지 않는다) — 사용자 오류가 아니다.
  if (!hint?.documentId) throw new Error("연차 취소 결재선: 원 연차 id 없음");
  const step = await pickCancelStep(hint.documentId);
  return { selfApproval: "skip", steps: step ? [toConfigStep(step)] : [] };
}

// ── 요청 · 다시 요청 ─────────────────────────────────────────────────────

export type LeaveCancelDeps = { now?: Date } & TxLogDeps;
export type LeaveCancelResult = { instanceId: string; version: number; approverName: string | null };

function approverNameOf(prepared: PreparedSubmission): string | null {
  return prepared.walk.display.find((step) => step.state === "current")?.holderNames || null;
}

// 기안자 본인 · 승인된 연차만 — 남의 연차는 담당 아님(존재를 드러내지 않는다), 승인 아님 · 이미 취소 결재가 있으면 `이미 처리됨`.
async function ownApprovedLeave(viewer: Viewer, leaveId: string): Promise<LeaveRequestWithApproval> {
  const leave = await findLeaveRequestById(viewer, { id: leaveId, documentKind: LEAVE_DOCUMENT_KIND });
  if (!leave || leave.drafterId !== viewer.id) throw new NotCurrentHolderError(NOT_HOLDER_MESSAGE);
  if (leave.status !== "approved") throw new GateBlockedError(STALE_MESSAGE);
  return leave;
}

// 같은 tx(기안자 잠금 뒤) — 원 연차가 여전히 approved인지 다시 본다(잠금 전 읽기와 사이의 변경).
async function assertStillApprovedInTx(viewer: Viewer, leaveId: string, tx: DbOrTx): Promise<void> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, tx);
  if (graph?.instance.status !== "approved") throw new GateBlockedError(STALE_MESSAGE);
}

async function recordCancelReason(
  viewer: Viewer,
  input: { leaveId: string; reason: string; round: number },
  tx: DbOrTx,
  prepared: PreparedSubmission,
  deps?: TxLogDeps,
): Promise<void> {
  await recordActionInTx(
    viewer,
    {
      actionType: REASON_ACTION_TYPE,
      entity: LEAVE_CANCEL_KIND,
      entityId: input.leaveId,
      documentId: input.leaveId,
      detail: { from: "approved", to: "cancel_requested", round: input.round, reason: input.reason },
    },
    tx,
    prepared.gate,
    deps,
  );
}

function prepareCancel(viewer: Viewer, leaveId: string, deps?: LeaveCancelDeps): Promise<PreparedSubmission> {
  return prepareSubmission(viewer, { kind: LEAVE_CANCEL_KIND, drafterId: viewer.id, hint: { documentId: leaveId } }, { now: deps?.now });
}

export async function requestLeaveCancel(
  viewer: Viewer,
  input: { leaveId: string; reason: string },
  deps?: LeaveCancelDeps,
): Promise<LeaveCancelResult> {
  await assertLeaveWrite(viewer);
  const reason = validateRejectReason(input.reason);
  const leave = await ownApprovedLeave(viewer, input.leaveId);
  // 반려 · 회수된 취소는 `취소 다시 요청`(resubmit) 길로 — 문서당 취소 건 하나(유일키).
  if (leave.cancelStatus !== null) throw new GateBlockedError(STALE_MESSAGE);
  const prepared = await prepareCancel(viewer, leave.id, deps);
  return withTransaction(async (tx) => {
    // 같은 기안자의 요청을 줄 세운다 — 두 번째는 아래 재확인에서 `이미 처리됨`(유일키 위반 0).
    await lockLeaveDrafter(viewer, viewer.id, tx);
    await assertStillApprovedInTx(viewer, leave.id, tx);
    if (await findApprovalGraphByDocument(viewer, { documentKind: LEAVE_CANCEL_KIND, documentId: leave.id }, tx)) {
      throw new GateBlockedError(STALE_MESSAGE);
    }
    const instance = await submitDocument(viewer, prepared, { documentId: leave.id }, tx, { appendActionLog: deps?.appendActionLog });
    await recordCancelReason(viewer, { leaveId: leave.id, reason, round: 1 }, tx, prepared, deps);
    return { instanceId: instance.id, version: instance.version, approverName: approverNameOf(prepared) };
  });
}

// `취소 다시 요청` — 반려 · 회수된 취소 인스턴스에 새 차수(엔진 resubmit · 등록 resubmitFrom). 결재선은 지금 다시 조립한다(같은 힌트).
export async function resubmitLeaveCancel(
  viewer: Viewer,
  input: { leaveId: string; expectedVersion: number; reason: string },
  deps?: LeaveCancelDeps,
): Promise<LeaveCancelResult> {
  await assertLeaveWrite(viewer);
  const reason = validateRejectReason(input.reason);
  const leave = await ownApprovedLeave(viewer, input.leaveId);
  const cancel = await findApprovalGraphByDocument(viewer, { documentKind: LEAVE_CANCEL_KIND, documentId: leave.id });
  if (!cancel) throw new NotCurrentHolderError(NOT_HOLDER_MESSAGE);
  const prepared = await prepareCancel(viewer, leave.id, deps);
  return withTransaction(async (tx) => {
    await lockLeaveDrafter(viewer, viewer.id, tx);
    await assertStillApprovedInTx(viewer, leave.id, tx);
    // 전이 판정(기안자 · rejected/withdrawn · version)은 엔진 — 거부되면 사유 로그도 쓰지 않는다.
    const resubmitted = await resubmitDocument(viewer, prepared, { instanceId: cancel.instance.id, expectedVersion: input.expectedVersion }, tx, {
      appendActionLog: deps?.appendActionLog,
    });
    await recordCancelReason(viewer, { leaveId: leave.id, reason, round: resubmitted.round }, tx, prepared, deps);
    return { instanceId: cancel.instance.id, version: resubmitted.version, approverName: approverNameOf(prepared) };
  });
}

// 창 결과 줄 `결재 → {이름}`의 재료 — 엔진 previewRoute(제출과 같은 힌트 · 같은 planRoute)의 지금 단계 보유자 이름(approval.value 투영 뒤).
export async function previewLeaveCancel(viewer: Viewer, leaveId: string, deps?: { now?: Date }): Promise<{ approverName: string | null }> {
  await ownApprovedLeave(viewer, leaveId);
  const preview = await previewRoute(viewer, { kind: LEAVE_CANCEL_KIND, hint: { documentId: leaveId } }, { now: deps?.now });
  const first = preview.steps.find((step) => !step.skipped);
  return { approverName: first?.holderNames || null };
}

// ── 최종 승인 훅 짝 ─────────────────────────────────────────────────────

type PreparedCancelFinal = { leaveInstanceId: string };

async function prepareLeaveCancelFinalApproval(viewer: Viewer, documentId: string): Promise<PreparedCancelFinal> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: LEAVE_DOCUMENT_KIND, documentId });
  if (!graph) throw new GateBlockedError(STALE_MESSAGE);
  return { leaveInstanceId: graph.instance.id };
}

// 최종 승인과 같은 tx — 원 연차 인스턴스가 여전히 approved인지만 다시 본다. 아니면 승인 전체 롤백(연차 행 쓰기 0).
async function onLeaveCancelFinalApprovalInTx(viewer: Viewer, documentId: string, tx: DbOrTx, prepared: unknown): Promise<void> {
  void documentId;
  const { leaveInstanceId } = prepared as PreparedCancelFinal;
  const graph = await findApprovalGraphById(viewer, leaveInstanceId, tx);
  if (graph?.instance.status !== "approved") throw new GateBlockedError(STALE_MESSAGE);
}

// 다시 요청 가능 = 연차 쓰기 권한 ∧ 원 연차가 여전히 approved(엔진이 기안자 · rejected/withdrawn을 따로 본다).
async function canResubmitLeaveCancel(viewer: Viewer, documentId?: string): Promise<boolean> {
  if (!documentId || !(await canWriteLeave(viewer))) return false;
  const leave = await findLeaveRequestById(viewer, { id: documentId, documentKind: LEAVE_DOCUMENT_KIND });
  return leave?.status === "approved";
}

// ── 결재함 요약 · 결재 시트 상세 ──────────────────────────────────────────

// 결재함 문서 칸 `연차 취소 요청 · {종류} {기간}`(종류 라벨 뒤 조각은 연차와 같은 leaveSummaryFields). 일수 키(daysQuarters · days)는 싣지
// 않는다 — 엔진 describeDeduction이 최종 승인 토스트를 `차감`으로 만들지 않게. 대신 꼬리 `{일수} 복귀`.
async function describeLeaveCancelDocuments(viewer: Viewer, ids: string[], deps?: DescribeDeps): Promise<Map<string, DocumentSummary>> {
  const rows = await findLeaveRequestsByIds(viewer, { ids, documentKind: LEAVE_DOCUMENT_KIND });
  const result = new Map<string, DocumentSummary>();
  for (const row of rows) {
    const projected = await project(viewer, cancelSource(row, null), LEAVE_CANCEL_DETAIL_DTO_SPEC, deps?.visible ? { visible: deps.visible } : undefined);
    const fields = leaveSummaryFields({ ...projected, daysQuarters: row.daysQuarters });
    const summary: DocumentSummary = { ...fields };
    if (projected.number !== undefined) summary.number = projected.number;
    if (projected.days !== undefined) summary.finalApprovalNote = `${projected.days} 복귀`;
    if (projected.drafterName && fields.documentText) summary.nextTurnText = { target: projected.drafterName, situation: `연차 취소 ${fields.documentText}` };
    result.set(row.id, summary);
  }
  return result;
}

export type LeaveCancelDetailDto = {
  number: string | null;
  kind: LeaveKind;
  half: HalfPeriod | null;
  startTime: string | null;
  startDate: string;
  endDate: string;
  days: string;
  cancelReason: string | null;
  drafterName: string;
  requestedAt: Date | null;
};

// 연차 항목은 leave.value(연차 DTO와 같은 항목), 기안 이름 · 요청 시각은 approval.value — 새 정보 항목 없음.
export const LEAVE_CANCEL_DETAIL_DTO_SPEC: DtoSpec<LeaveCancelDetailDto, LeaveCancelDetailDto> = {
  fields: [
    { key: "number", from: "number", infoItem: "leave.value" },
    { key: "kind", from: "kind", infoItem: "leave.value" },
    { key: "half", from: "half", infoItem: "leave.value" },
    { key: "startTime", from: "startTime", infoItem: "leave.value" },
    { key: "startDate", from: "startDate", infoItem: "leave.value" },
    { key: "endDate", from: "endDate", infoItem: "leave.value" },
    { key: "days", from: "days", infoItem: "leave.value" },
    { key: "cancelReason", from: "cancelReason", infoItem: "leave.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "requestedAt", from: "requestedAt", infoItem: "approval.value" },
  ],
};

registerDto({
  name: "leaveCancelDetail",
  fields: LEAVE_CANCEL_DETAIL_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function cancelSource(row: LeaveRequestWithApproval, reason: { text: string | null; at: Date | null } | null): LeaveCancelDetailDto {
  return {
    number: row.number,
    kind: row.kind as LeaveKind,
    half: row.half as HalfPeriod | null,
    startTime: row.startTime ? row.startTime.slice(0, 5) : null,
    startDate: row.startDate,
    endDate: row.endDate,
    days: formatLeaveDays(row.daysQuarters),
    cancelReason: reason?.text ?? null,
    drafterName: row.drafterName,
    requestedAt: reason?.at ?? null,
  };
}

// 지금 차수의 취소 사유 — 그 연차의 마지막 status_change(요청 · 다시 요청마다 한 줄). 정리 표시 행도 읽는다(findLatestActionFor).
export async function findLeaveCancelReason(viewer: Viewer, leaveId: string): Promise<{ text: string | null; at: Date | null }> {
  const row = await findLatestActionFor(viewer, { entity: LEAVE_CANCEL_KIND, entityId: leaveId, actionType: REASON_ACTION_TYPE });
  const reason = row?.detail && typeof row.detail === "object" && "reason" in row.detail ? row.detail.reason : null;
  return { text: typeof reason === "string" ? reason : null, at: row?.occurredAt ?? null };
}

async function loadLeaveCancelDetails(viewer: Viewer, ids: string[], deps: LoadDetailsDeps): Promise<Map<string, LeaveCancelDetailDto>> {
  void deps;
  const rows = await findLeaveRequestsByIds(viewer, { ids, documentKind: LEAVE_DOCUMENT_KIND });
  const result = new Map<string, LeaveCancelDetailDto>();
  // 엔진은 `내 결재` 후보 문서 id만 넘긴다 — 한 화면에 몇 건이라 문서마다 한 번 읽는다.
  for (const row of rows) result.set(row.id, cancelSource(row, await findLeaveCancelReason(viewer, row.id)));
  return result;
}

function buildLeaveCancelDetailRows(projected: Partial<LeaveCancelDetailDto>): DocumentDetailRows {
  const fields = leaveSummaryFields(projected);
  const rows: DocumentDetailRow[] = [];
  if (projected.startDate) {
    const end = projected.endDate && projected.endDate !== projected.startDate ? ` ~ ${projected.endDate}` : "";
    rows.push({ label: "기간", value: `${projected.startDate}${end}`, tone: "default" });
  }
  if (projected.days !== undefined) rows.push({ label: "일수", value: projected.days, tone: "default" });
  if (projected.cancelReason !== undefined) rows.push({ label: "취소 사유", value: projected.cancelReason || "—", tone: "default" });
  const drafted = [projected.drafterName, projected.requestedAt ? kstDateOf(projected.requestedAt) : null].filter(Boolean).join(" · ");
  if (drafted) rows.push({ label: "기안", value: drafted, tone: "default" });
  return {
    title: fields.documentText ? `${KIND_LABEL} — ${fields.documentText}` : KIND_LABEL,
    subtitle: [projected.number, projected.drafterName].filter(Boolean).join(" · "),
    rows,
  };
}

registerDocumentKind({
  kind: LEAVE_CANCEL_KIND,
  label: KIND_LABEL,
  loadRouteConfig: loadLeaveCancelRouteConfig,
  // 취소 문서는 원 연차 문서 화면에서 본다(document_id = 원 연차 id).
  href: (documentId) => `/leave/${documentId}`,
  describeDocuments: describeLeaveCancelDocuments,
  canResubmit: canResubmitLeaveCancel,
  resubmitFrom: ["rejected", "withdrawn"],
  prepareFinalApproval: prepareLeaveCancelFinalApproval,
  onFinalApprovalInTx: onLeaveCancelFinalApprovalInTx,
  loadDetails: loadLeaveCancelDetails,
  detailDto: LEAVE_CANCEL_DETAIL_DTO_SPEC,
  buildDetailRows: buildLeaveCancelDetailRows,
});
