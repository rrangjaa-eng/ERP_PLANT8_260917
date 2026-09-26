import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { appendActionLog as defaultAppendActionLog } from "@/repositories/action-log";
import { findSimpleValue } from "@/repositories/settings";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";

// OPS-05: 핵심 행동 종류 목록의 정본. 단순 조회·화면 이동은 이 목록에 없다 —
// recordAction을 아예 부르지 않는 것이 "잡음을 남기지 않는다"의 구현이다.
// ADMN-10의 「어떤 행동을 핵심으로 남길지 설정에서 고른다」는 이 목록 안에서의
// 선택이며 "전부 남기기"를 고를 수 있는 형태로 만들지 않는다.
export const CORE_ACTION_TYPES = [
  "login",
  "document_create",
  "document_update",
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
  // Phase 4 Task 1 ③(D-50): 상태 변경 이력은 행동 로그에 이 종류로만 남긴다.
  // ACTION_TYPE_LABELS·ALWAYS_ON_ACTION_TYPES 두 배열도 같은 변경에서 함께
  // 고친다(04-RESEARCH.md Pitfall 2 — 하나만 고치면 조용히 어긋난다).
  "status_change",
] as const;

export type CoreActionType = (typeof CORE_ACTION_TYPES)[number];

// 03-07: 행동 로그 화면·Excel 내보내기가 보여줄 한국어 라벨. 지난 웨이브의
// UI 감사가 "raw SQL INSERT with internal IDs shown to users" 같은 결함을
// 찾았다 — 여기서도 snake_case 내부 토큰을 사용자에게 그대로 보여주지
// 않는다(Rule 2 — 누락된 핵심 기능: 화면에 원문 코드가 새는 것을 막는다).
export const ACTION_TYPE_LABELS: Record<CoreActionType, string> = {
  login: "로그인",
  document_create: "문서 생성",
  document_update: "문서 수정",
  document_submit: "문서 제출",
  document_approve: "문서 승인",
  document_reject: "문서 반려",
  document_withdraw: "문서 철회",
  document_delete: "문서 삭제",
  payment_process: "지급 처리",
  purchase_process: "구매 처리",
  settings_change: "설정 변경",
  permission_change: "권한 변경",
  sensitive_view: "민감정보 열람",
  archive: "보관",
  restore: "복원",
  excel_export: "Excel 내보내기",
  mask_reveal: "마스킹 해제",
  action_log_prune: "행동 로그 정리",
  status_change: "상태 변경",
};

// OPS-05: Excel 내보내기·마스킹 해제·행동 로그 정리는 설정으로 못 끄는 핵심
// 로그다 — 설정 조회 결과와 무관하게 항상 기록한다.
export const ALWAYS_ON_ACTION_TYPES: CoreActionType[] = [
  "excel_export",
  "mask_reveal",
  "action_log_prune",
  // D-50: 상태 변경 이력은 끌 수 없다 — 설정으로 끄면 상세의 「마지막
  // 변경일」이 조용히 빈다.
  "status_change",
];

export class UnknownActionTypeError extends UserFacingError {}

export type RecordActionEntry = {
  actionType: string;
  entity?: string | null;
  entityId?: string | null;
  documentId?: string | null;
  detail?: Record<string, unknown>;
};

export type RecordActionDeps = {
  appendActionLog: typeof defaultAppendActionLog;
  // 03-04: "어떤 행동을 핵심으로 남길지 설정에서 고른다"(ADMN-10)의 실제
  // 조회 지점. 기본 구현은 domain/settings/registry.ts의 getSettingValue를
  // 동적 import로 부른다 — domain/settings/registry.ts가 이 파일의
  // recordAction을 정적으로 import하므로(설정 변경 로그), 정적 상호
  // import는 순환이 되어 이 파일 쪽을 동적 import로 늦춰 끊는다.
  isActionTypeEnabled?: (actionType: CoreActionType) => Promise<boolean>;
  // Phase 4(04-32, ENG-D3 ①): 잠근 트랜잭션 안에서 부르면 로그 쓰기와 끌 수
  // 있는 종류의 설정 조회가 둘 다 이 tx로 돈다 — 인자가 없으면 지금 동작
  // 그대로(풀 db).
  tx?: DbOrTx;
};

function isCoreActionType(value: string): value is CoreActionType {
  return (CORE_ACTION_TYPES as readonly string[]).includes(value);
}

// 레지스트리 읽기가 실패해도 기록이 빠지면 안 된다 — fail-open(항상 켬)이
// 이 방향에서는 안전하다: "기록 안 함"으로 fail-closed하면 설정 레지스트리
// 장애 한 번에 핵심 행동 로그 전체가 조용히 비어 OPS-05·ADMN-10이 요구하는
// 감사 가능성을 정면으로 해친다.
async function defaultIsActionTypeEnabled(actionType: CoreActionType, tx?: DbOrTx): Promise<boolean> {
  try {
    const [{ getSettingValue }, { ACTION_LOG_OPTIONAL_TYPES }] = await Promise.all([
      import("@/domain/settings/registry"),
      import("@/domain/settings/keys"),
    ]);
    // tx가 있으면 registry의 findSimpleValue 주입 자리로 같은 tx를 넘긴다
    // (domain/settings/registry.ts는 고치지 않는다 — 그 파일의 deps 주입
    // 계약을 그대로 쓴다).
    const enabledTypes = await getSettingValue(
      ACTION_LOG_OPTIONAL_TYPES,
      undefined,
      tx ? { findSimpleValue: (v, k) => findSimpleValue(v, k, tx) } : undefined,
    );
    return enabledTypes.includes(actionType);
  } catch {
    return true;
  }
}

// 핵심 행동 기록 API. 핵심 목록에 없는 종류를 받으면 행을 만들지 않고
// UnknownActionTypeError를 throw한다 — 조용히 삼키면 호출자가 기록됐다고
// 오해한다. 끌 수 없는 종류는 설정 조회를 아예 부르지 않고 항상 기록한다.
export async function recordAction(
  viewer: Viewer,
  entry: RecordActionEntry,
  deps?: Partial<RecordActionDeps>,
): Promise<void> {
  if (!isCoreActionType(entry.actionType)) {
    throw new UnknownActionTypeError(`핵심 행동 종류 아님: ${entry.actionType}`);
  }

  if (!ALWAYS_ON_ACTION_TYPES.includes(entry.actionType)) {
    const isEnabled = deps?.isActionTypeEnabled ?? ((type: CoreActionType) => defaultIsActionTypeEnabled(type, deps?.tx));
    const enabled = await isEnabled(entry.actionType);
    if (!enabled) return;
  }

  const appendActionLog = deps?.appendActionLog ?? defaultAppendActionLog;
  await appendActionLog(
    viewer,
    {
      // 시스템 주체(SYSTEM_VIEWER)의 행동은 actorId가 null이다 — users 표에 없는
      // id를 FK로 넣지 않는다.
      actorId: viewer.id === SYSTEM_VIEWER.id ? null : viewer.id,
      actorRoleId: viewer.roleId ?? null,
      actionType: entry.actionType,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      documentId: entry.documentId ?? null,
      detail: entry.detail ?? {},
    },
    deps?.tx,
  );
}
