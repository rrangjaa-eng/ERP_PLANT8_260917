import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { appendActionLog as defaultAppendActionLog } from "@/repositories/action-log";

// OPS-05: 핵심 행동 종류 목록의 정본. 단순 조회·화면 이동은 이 목록에 없다 —
// recordAction을 아예 부르지 않는 것이 "잡음을 남기지 않는다"의 구현이다.
// ADMN-10의 「어떤 행동을 핵심으로 남길지 설정에서 고른다」는 이 목록 안에서의
// 선택이며 "전부 남기기"를 고를 수 있는 형태로 만들지 않는다.
export const CORE_ACTION_TYPES = [
  "login",
  "document_create",
  "document_submit",
  "document_approve",
  "document_reject",
  "document_withdraw",
  "document_delete",
  "payment_process",
  "purchase_process",
  "settings_change",
  "permission_change",
  "sensitive_view",
  "archive",
  "restore",
  "excel_export",
  "mask_reveal",
  "action_log_prune",
] as const;

export type CoreActionType = (typeof CORE_ACTION_TYPES)[number];

// OPS-05: Excel 내보내기·마스킹 해제·행동 로그 정리는 설정으로 못 끄는 핵심
// 로그다 — 설정 조회 결과와 무관하게 항상 기록한다.
export const ALWAYS_ON_ACTION_TYPES: CoreActionType[] = ["excel_export", "mask_reveal", "action_log_prune"];

export class UnknownActionTypeError extends Error {}

export type RecordActionEntry = {
  actionType: string;
  entity?: string | null;
  entityId?: string | null;
  documentId?: string | null;
  detail?: Record<string, unknown>;
};

export type RecordActionDeps = {
  appendActionLog: typeof defaultAppendActionLog;
  // 03-04 설정 레지스트리("어떤 행동을 핵심으로 남길지 설정에서 고른다")가 붙는
  // 자리. 이 페이즈는 조회 함수 자체가 아직 없으므로 dep이 주어지지 않으면
  // 기본 켬으로 본다(judgment — SUMMARY "실행자가 판단한 것" 참고).
  isActionTypeEnabled?: (actionType: CoreActionType) => Promise<boolean>;
};

function isCoreActionType(value: string): value is CoreActionType {
  return (CORE_ACTION_TYPES as readonly string[]).includes(value);
}

// 핵심 행동 기록 API. 핵심 목록에 없는 종류를 받으면 행을 만들지 않고
// UnknownActionTypeError를 throw한다 — 조용히 삼키면 호출자가 기록됐다고
// 오해한다. 끌 수 없는 종류는 설정 조회 dep을 아예 부르지 않고 항상 기록한다.
export async function recordAction(
  viewer: Viewer,
  entry: RecordActionEntry,
  deps?: Partial<RecordActionDeps>,
): Promise<void> {
  if (!isCoreActionType(entry.actionType)) {
    throw new UnknownActionTypeError(`핵심 행동 종류가 아닙니다: ${entry.actionType}`);
  }

  if (!ALWAYS_ON_ACTION_TYPES.includes(entry.actionType) && deps?.isActionTypeEnabled) {
    const enabled = await deps.isActionTypeEnabled(entry.actionType);
    if (!enabled) return;
  }

  const appendActionLog = deps?.appendActionLog ?? defaultAppendActionLog;
  await appendActionLog(viewer, {
    // 시스템 주체(SYSTEM_VIEWER)의 행동은 actorId가 null이다 — users 표에 없는
    // id를 FK로 넣지 않는다.
    actorId: viewer.id === SYSTEM_VIEWER.id ? null : viewer.id,
    actorRoleId: viewer.roleId ?? null,
    actionType: entry.actionType,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    documentId: entry.documentId ?? null,
    detail: entry.detail ?? {},
  });
}
