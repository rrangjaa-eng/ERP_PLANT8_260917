import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { recordAction, type CoreActionType, type RecordActionEntry } from "@/domain/action-log/record";
import { getSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { appendActionLog } from "@/repositories/action-log";

// 04.1(Codex HIGH 원자성 · CEO-2): 결재 전이의 행동 로그는 전이와 같은 tx에 쓴다.
// 기록 켜짐 여부는 트랜잭션 **전에** 한 번 읽어(loadActionLogGate) 판정 함수로
// 넘긴다 — 그래서 로그 쓰기도 켜짐 판정도 풀 연결을 더 잡지 않는다.
// domain/action-log/*는 고치지 않는다(recordAction의 deps 주입 계약만 쓴다).

export type ActionLogGate = (actionType: CoreActionType) => boolean;

// 읽기가 실패하면 전부 켬 — domain/action-log/record.ts의 fail-open과 같다.
export async function loadActionLogGate(deps?: { getSettingValue?: typeof getSettingValue }): Promise<ActionLogGate> {
  try {
    const enabled = await (deps?.getSettingValue ?? getSettingValue)(ACTION_LOG_OPTIONAL_TYPES);
    return (actionType) => enabled.includes(actionType);
  } catch {
    return () => true;
  }
}

export type TxLogDeps = { appendActionLog?: typeof appendActionLog };

export async function recordActionInTx(
  viewer: Viewer,
  entry: RecordActionEntry,
  tx: DbOrTx,
  gate: ActionLogGate,
  deps?: TxLogDeps,
): Promise<void> {
  const append = deps?.appendActionLog ?? appendActionLog;
  await recordAction(viewer, entry, {
    appendActionLog: (v, e) => append(v, e, tx),
    isActionTypeEnabled: (actionType) => Promise.resolve(gate(actionType)),
  });
}
