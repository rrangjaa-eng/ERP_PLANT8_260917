import type { EmailSender, SendOutcome } from "@/lib/email/sender";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { composeDigest } from "@/domain/notify/digest";
import {
  claimNextEmailBundle,
  finishEmailPhase,
  recordEmailOutcome,
  type EmailOutcome,
} from "@/repositories/notifications";

// 요청 예산(04.2-10 「실행 예산」): 기준 시각은 핸들러 진입. 새 묶음은
// 경과 + 선점 트랜잭션 최악 + 발송 마감 + 2초 + 결과 트랜잭션 최악 ≤ 160초일 때만 선점한다.
// 끝 표시 10초를 더해 요청 최악 170초 < 스케줄러 시도 마감 180초.
export const NOTIFY_TICK_BUDGET_MS = 160_000;
export const EMAIL_SEND_DEADLINE_MS = 30_000;
// 선점·결과 트랜잭션 각각 — 풀 대기 5 + 클라이언트 마감 25.
export const EMAIL_TX_WORST_MS = 30_000;
// 결과 불명(D-4216): 10분 지난 sending, 7일 창 — 저장소 조회에 인자로 넘긴다.
export const EMAIL_UNKNOWN_AFTER_MS = 600_000;
export const EMAIL_UNKNOWN_VISIBLE_DAYS = 7;

const SEND_GRACE_MS = 2_000;

export type EmailPhaseInput = {
  runId: number;
  kstDate: string;
  dayStart: Date;
  requestStartedAtMs: number;
};

export type EmailPhaseDeps = {
  sender: EmailSender;
  serviceUrl: string;
  now: () => Date;
  monotonicNow: () => number;
  sendDeadlineMs?: number;
  // 선점·결과 트랜잭션의 클라이언트 마감.
  txDeadlineMs?: number;
  claim?: typeof claimNextEmailBundle;
  recordOutcome?: typeof recordEmailOutcome;
  finish?: typeof finishEmailPhase;
};

export type EmailPhaseResult = { emailSent: number; emailFailed: number; emailUnknown: number };

function toOutcome(result: SendOutcome): EmailOutcome {
  return result.outcome === "sent" ? "sent" : "unknown";
}

// D-4203: 예산 안에서 「한 묶음 선점 → 발송(트랜잭션 밖) → 결과 기록」을 되풀이한다.
// 결과 기록이 던지면 전파하고 끝 표시를 하지 않는다 — 행은 sending으로 남는다(D-4216).
export async function runEmailPhase(input: EmailPhaseInput, deps: EmailPhaseDeps): Promise<EmailPhaseResult> {
  const sendDeadlineMs = deps.sendDeadlineMs ?? EMAIL_SEND_DEADLINE_MS;
  const claim = deps.claim ?? claimNextEmailBundle;
  const recordOutcome = deps.recordOutcome ?? recordEmailOutcome;
  const finish = deps.finish ?? finishEmailPhase;
  const result: EmailPhaseResult = { emailSent: 0, emailFailed: 0, emailUnknown: 0 };

  for (;;) {
    const elapsed = deps.monotonicNow() - input.requestStartedAtMs;
    if (elapsed + EMAIL_TX_WORST_MS + sendDeadlineMs + SEND_GRACE_MS + EMAIL_TX_WORST_MS > NOTIFY_TICK_BUDGET_MS) break;

    const bundle = await claim(SYSTEM_VIEWER, {
      runId: input.runId,
      dayStart: input.dayStart,
      now: deps.now(),
      deadlineMs: deps.txDeadlineMs,
    });
    if (!bundle) break;

    const digest = composeDigest({
      kstDate: input.kstDate,
      messages: bundle.rows.map((row) => row.message),
      serviceUrl: deps.serviceUrl,
    });
    const sendResult = await deps.sender.send(
      { to: bundle.email, ...digest },
      { signal: AbortSignal.timeout(sendDeadlineMs) },
    );
    const outcome = toOutcome(sendResult);

    await recordOutcome(SYSTEM_VIEWER, {
      runId: input.runId,
      ids: bundle.rows.map((row) => row.id),
      outcome,
      deadlineMs: deps.txDeadlineMs,
    });
    if (outcome === "sent") result.emailSent += 1;
    else result.emailUnknown += 1;
  }

  await finish(SYSTEM_VIEWER, { runId: input.runId, now: deps.now() });
  return result;
}
