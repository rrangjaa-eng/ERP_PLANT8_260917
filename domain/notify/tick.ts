import { env } from "@/lib/env";
import { emailSenderFromEnv, type EmailSender } from "@/lib/email/sender";
import { log } from "@/lib/log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { toKstDate } from "@/domain/holidays/business-day";
import { isBusinessDayKst } from "@/domain/holidays/calendar";
import { ensureHolidayCandidates } from "@/domain/holidays/candidates";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { NOTIFY_TICK_BATCH_MAX } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import { runEmailPhase, type EmailPhaseResult } from "@/domain/notify/email-phase";
import {
  findExistingDedupKeys,
  insertNotifications,
  insertTickRun,
  markPendingEmailSkipped,
  NOTIFY_TX_DEADLINE_MS,
  recordEmailOutcome,
  withNotifyTickLock,
  type DedupKey,
  type NotificationInsert,
  type NotifyTx,
} from "@/repositories/notifications";
import { findSimpleValue } from "@/repositories/settings";

export type TickDeps = {
  now: () => Date;
  conditionKinds: readonly ConditionKind[];
  isBusinessDay: (kstDate: string) => Promise<boolean>;
  // tick 잠금 트랜잭션 안에서 그 tx로 읽는다(04.2-10 — 문장 한도 안, 풀 연결 하나 더 없음).
  batchMax: (tx: NotifyTx) => Promise<number>;
  // tick 잠금 트랜잭션의 클라이언트 마감(ms) — 테스트가 줄인다. 이메일 선점·결과 트랜잭션에도 쓴다.
  txDeadlineMs: number;
  // null이면 SMTP 미설정(D-711) — 메일 없이 pending을 skipped_no_smtp로.
  emailSender: EmailSender | null;
  serviceUrl: string;
  // 요청 예산의 기준 시각(핸들러 진입) — monotonicNow와 같은 시계.
  requestStartedAtMs: number;
  monotonicNow: () => number;
  // 이메일 결과 기록 — 결과 기록 장애(끊긴 실행)를 테스트가 대체한다(D-4216).
  recordOutcome: typeof recordEmailOutcome;
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
  const isBusinessDay = deps?.isBusinessDay ?? isBusinessDayKst;
  const batchMax =
    deps?.batchMax ??
    ((tx: NotifyTx) =>
      getSettingValue(NOTIFY_TICK_BATCH_MAX, undefined, { findSimpleValue: (v, k) => findSimpleValue(v, k, tx) }));
  const txDeadlineMs = deps?.txDeadlineMs ?? NOTIFY_TX_DEADLINE_MS;
  const emailSender = deps?.emailSender !== undefined ? deps.emailSender : emailSenderFromEnv();
  const serviceUrl = deps?.serviceUrl ?? env.BETTER_AUTH_URL ?? "";
  const monotonicNow = deps?.monotonicNow ?? (() => performance.now());
  const requestStartedAtMs = deps?.requestStartedAtMs ?? monotonicNow();

  const startedAt = now();
  const today = toKstDate(startedAt);
  // 잠금 트랜잭션을 열기 전에 판정한다 — 후보 생성이 tick 잠금 트랜잭션을 늘리지 않게.
  const businessDay = await isBusinessDay(today);
  // 다음 해 후보도 미리 시도한다 — 실패(예: 음력 표 밖)는 경고만 남기고 tick은 계속한다.
  const nextYear = Number(today.slice(0, 4)) + 1;
  try {
    await ensureHolidayCandidates(nextYear);
  } catch (error) {
    log.warn("holiday.candidates_failed", {
      year: nextYear,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const locked = await withNotifyTickLock(
    SYSTEM_VIEWER,
    async (tx) => {
      let sent = 0;
      let skipped = 0;
      let remaining = 0;
      let incompleteRecipientIds: string[] = [];
      let evaluationFailed = false;

      if (businessDay) {
        const max = await batchMax(tx);
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
      return { sent, skipped, remaining, incompleteRecipientIds, runId };
    },
    { deadlineMs: txDeadlineMs },
  );

  if (!locked.acquired) return { status: "locked" };

  const { sent, skipped, remaining, incompleteRecipientIds, runId } = locked.value;

  // 잠금 트랜잭션이 커밋된 뒤 — 영업일에만 이메일 단계(D-709). 선점은 미완 목록을
  // 실행 기록에서 읽는다(Codex 2차 #3).
  let email: EmailPhaseResult = { emailSent: 0, emailFailed: 0, emailUnknown: 0 };
  if (businessDay) {
    if (emailSender === null) {
      await markPendingEmailSkipped(SYSTEM_VIEWER);
    } else {
      email = await runEmailPhase(
        { runId, kstDate: today, dayStart: new Date(`${today}T00:00:00+09:00`), requestStartedAtMs },
        { sender: emailSender, serviceUrl, now, monotonicNow, txDeadlineMs, recordOutcome: deps?.recordOutcome },
      );
    }
  }

  log.info("notify.tick", { ok: true, sent, skipped, remaining, businessDay, ...email });
  return { status: "ok", sent, skipped, remaining, businessDay, incompleteRecipientIds, runId };
}
