import { log } from "@/lib/log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import {
  findExistingDedupKeys,
  insertNotifications,
  insertTickRun,
  withNotifyTickLock,
  type DedupKey,
  type NotificationInsert,
} from "@/repositories/notifications";

export type TickDeps = {
  now: () => Date;
  conditionKinds: readonly ConditionKind[];
  isBusinessDay: (kstDate: string) => Promise<boolean>;
  batchMax: () => Promise<number>;
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

export async function runTick(deps?: Partial<TickDeps>): Promise<TickResult> {
  const now = deps?.now ?? (() => new Date());
  const conditionKinds = deps?.conditionKinds ?? CONDITION_KINDS;
  const isBusinessDay = deps?.isBusinessDay ?? isKstWeekday;
  const batchMax = deps?.batchMax ?? (() => Promise.resolve(200));

  const startedAt = now();
  const today = kstDateOf(startedAt);

  const locked = await withNotifyTickLock(SYSTEM_VIEWER, async (tx) => {
    const businessDay = await isBusinessDay(today);
    let sent = 0;
    let skipped = 0;
    let remaining = 0;

    if (businessDay) {
      const candidates: NotificationInsert[] = [];
      for (const kind of conditionKinds) {
        for (const candidate of await kind.evaluate({ today })) {
          candidates.push({ ...candidate, conditionKind: kind.kind });
        }
      }

      const existing = new Set(
        (await findExistingDedupKeys(SYSTEM_VIEWER, candidates, tx)).map(dedupKeyString),
      );
      const fresh = candidates.filter((candidate) => !existing.has(dedupKeyString(candidate)));
      skipped = candidates.length - fresh.length;

      const max = await batchMax();
      const batch = fresh.slice(0, max);
      remaining = fresh.length - batch.length;

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
        incompleteRecipientIds: [],
        evaluationFailed: false,
      },
      tx,
    );
    return { sent, skipped, remaining, businessDay, runId };
  });

  if (!locked.acquired) return { status: "locked" };

  const { sent, skipped, remaining, businessDay, runId } = locked.value;
  log.info("notify.tick", { ok: true, sent, skipped, remaining, businessDay });
  return { status: "ok", sent, skipped, remaining, businessDay, incompleteRecipientIds: [], runId };
}
