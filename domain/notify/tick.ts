import { log } from "@/lib/log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { NOTIFY_TICK_BATCH_MAX } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import {
  findExistingDedupKeys,
  insertNotifications,
  insertTickRun,
  NOTIFY_TX_DEADLINE_MS,
  withNotifyTickLock,
  type DedupKey,
  type NotificationInsert,
} from "@/repositories/notifications";

export type TickDeps = {
  now: () => Date;
  conditionKinds: readonly ConditionKind[];
  isBusinessDay: (kstDate: string) => Promise<boolean>;
  batchMax: () => Promise<number>;
  // tick 잠금 트랜잭션의 클라이언트 마감(ms) — 테스트가 줄인다.
  txDeadlineMs: number;
};

export type TickResult =
  | {
      status: "ok";
      sent: number;
      skipped: number;
      remaining: number;
      businessDay: boolean;
      incompleteRecipientIds: string[];
      runId: number;
    }
  | { status: "locked" };

// KST 날짜 문자열(YYYY-MM-DD). 04.2-06이 04.2-02의 toKstDate로 바꾸고 이 도우미를 지운다.
function kstDateOf(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 이 플랜 시점의 영업일 = KST 월~금. 공휴일 판정은 04.2-06이 이 주입 자리를 바꿔 끼운다.
function isKstWeekday(kstDate: string): Promise<boolean> {
  const day = new Date(`${kstDate}T00:00:00Z`).getUTCDay();
  return Promise.resolve(day >= 1 && day <= 5);
}

function dedupKeyString(key: DedupKey): string {
  return JSON.stringify([key.conditionKind, key.entity, key.entityId, key.recipientId, key.round]);
}

// D-4202: 가장 오래된 reference_date 순, 같으면 recipient_id·entity_id 오름차순.
function oldestFirst(a: NotificationInsert, b: NotificationInsert): number {
  if (a.referenceDate !== b.referenceDate) return a.referenceDate < b.referenceDate ? -1 : 1;
  if (a.recipientId !== b.recipientId) return a.recipientId < b.recipientId ? -1 : 1;
  if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
  return 0;
}

export async function runTick(deps?: Partial<TickDeps>): Promise<TickResult> {
  const now = deps?.now ?? (() => new Date());
  const conditionKinds = deps?.conditionKinds ?? CONDITION_KINDS;
  const isBusinessDay = deps?.isBusinessDay ?? isKstWeekday;
  const batchMax = deps?.batchMax ?? (() => getSettingValue(NOTIFY_TICK_BATCH_MAX));
  const txDeadlineMs = deps?.txDeadlineMs ?? NOTIFY_TX_DEADLINE_MS;

  const startedAt = now();
  const today = kstDateOf(startedAt);
  const max = await batchMax();

  const locked = await withNotifyTickLock(
    SYSTEM_VIEWER,
    async (tx) => {
      const businessDay = await isBusinessDay(today);
      let sent = 0;
      let skipped = 0;
      let remaining = 0;
      let incompleteRecipientIds: string[] = [];
      let evaluationFailed = false;

      if (businessDay) {
        const candidates: NotificationInsert[] = [];
        // 종류별 격리 — 한 종류의 예외가 다른 종류의 후보를 막지 않는다. 실패한 종류가
        // 누구의 알림을 덜 만들었는지 모르므로 실행 기록에 evaluation_failed를 남긴다
        // (04.2-10 이메일 선점이 전원 보류한다).
        for (const kind of conditionKinds) {
          try {
            for (const candidate of await kind.evaluate({ today })) {
              candidates.push({ ...candidate, conditionKind: kind.kind });
            }
          } catch (error) {
            evaluationFailed = true;
            log.error("notify.condition_failed", {
              kind: kind.kind,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const existing = new Set(
          (await findExistingDedupKeys(SYSTEM_VIEWER, candidates, tx)).map(dedupKeyString),
        );
        const fresh = candidates
          .filter((candidate) => !existing.has(dedupKeyString(candidate)))
          .sort(oldestFirst);
        skipped = candidates.length - fresh.length;

        // 상한까지만 넣는다. 이번에 다 들어가지 못한 받는 사람은 이메일 선점에서 빠진다.
        const batch = fresh.slice(0, max);
        const left = fresh.slice(max);
        remaining = left.length;
        incompleteRecipientIds = [...new Set(left.map((candidate) => candidate.recipientId))];

        sent = (await insertNotifications(SYSTEM_VIEWER, batch, tx)).length;
        skipped += batch.length - sent;
      }

      const runId = await insertTickRun(
        SYSTEM_VIEWER,
        {
          startedAt,
          finishedAt: now(),
          kstDate: today,
          businessDay,
          sent,
          skipped,
          remaining,
          incompleteRecipientIds,
          evaluationFailed,
        },
        tx,
      );
      return { sent, skipped, remaining, businessDay, incompleteRecipientIds, runId };
    },
    { deadlineMs: txDeadlineMs },
  );

  if (!locked.acquired) return { status: "locked" };

  const { sent, skipped, remaining, businessDay, incompleteRecipientIds, runId } = locked.value;
  log.info("notify.tick", { ok: true, sent, skipped, remaining, businessDay });
  return { status: "ok", sent, skipped, remaining, businessDay, incompleteRecipientIds, runId };
}
