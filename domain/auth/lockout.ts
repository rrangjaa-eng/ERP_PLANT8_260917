import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { AUTH_LOCKOUT_THRESHOLD, AUTH_LOCKOUT_WINDOW_MINUTES } from "@/domain/settings/keys";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { countOpenFailures, firstOpenFailureAt, lockLoginEmail, recordAttempt } from "@/repositories/login-attempts";
import { hasAccountLockSince } from "@/repositories/action-log";
import { findUserByEmail } from "@/repositories/users";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { log } from "@/lib/log";

// AUTH-01·Eng Issue 5: 계정 잠금 판정의 순수 함수. DB 접근은
// repositories/login-attempts.ts가, 실제 훅 배선은 domain/auth/hooks.ts가
// 담당한다.
//
// 03-04: lockoutConfig는 env 대신 설정 레지스트리를 읽는다(async·deps
// 주입형, domain/system-status의 StatusDeps 패턴). 레지스트리 읽기가
// throw하면 그 예외를 그대로 전파한다 — 잠금 판정을 건너뛰고 로그인을
// 허용하는 fail-open 경로를 만들지 않는다(DB가 죽었으면 로그인도 어차피
// 실패한다).
export type LockoutConfigDeps = {
  getSettingValue: typeof defaultGetSettingValue;
};

export async function lockoutConfig(
  deps?: Partial<LockoutConfigDeps>,
): Promise<{ threshold: number; windowMinutes: number }> {
  const getSettingValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const [threshold, windowMinutes] = await Promise.all([
    getSettingValue(AUTH_LOCKOUT_THRESHOLD),
    getSettingValue(AUTH_LOCKOUT_WINDOW_MINUTES),
  ]);
  return { threshold, windowMinutes };
}

export function windowStart(now: Date, windowMinutes: number): Date {
  return new Date(now.getTime() - windowMinutes * 60_000);
}

export function isLocked(openFailures: number, threshold: number): boolean {
  return openFailures >= threshold;
}

type LockDeps = { recordAction?: typeof defaultRecordAction; now?: () => Date };
type LockContext = {
  email: string;
  userId: string | null;
  threshold: number;
  windowMinutes: number;
  since: Date;
  recordAction: typeof defaultRecordAction;
};

// eng E5: 전역 db를 쓰는 사용자 조회·설정 읽기는 트랜잭션 전에 끝낸다 —
// 이메일 잠금을 쥔 트랜잭션이 풀에서 두 번째 연결을 기다리면, 같은 이메일
// 대기로 풀이 다 찬 순간 서로 풀리지 않는다. 콜백 안에서는 tx 호출만 한다.
async function loadLockContext(email: string, now: Date, deps?: LockDeps): Promise<LockContext> {
  const { threshold, windowMinutes } = await lockoutConfig();
  const user = await findUserByEmail(SYSTEM_VIEWER, email);
  return {
    email,
    userId: user?.id ?? null,
    threshold,
    windowMinutes,
    since: windowStart(now, windowMinutes),
    recordAction: deps?.recordAction ?? defaultRecordAction,
  };
}

// 07-09 FA-1 「잠금 기록 확인」 — 세 경로(reserve · settle · recordLoginFailure)가 lockLoginEmail을 쥔 tx 안에서
// 부르는 한 곳. 지금 열린 실패의 처음 이후에 같은 이메일의 account_lock이 없을 때만 한 행을 남긴다 — 잠금 한 번에
// 한 행이고, 풀린 뒤 같은 창에서 다시 잠기면 새 행이다. 기록이 롤백돼도 다음 시도가 다시 불러 채운다(D-712).
async function ensureLockRecorded(ctx: LockContext, tx: DbOrTx): Promise<boolean> {
  const first = (await firstOpenFailureAt(SYSTEM_VIEWER, ctx.email, ctx.since, tx)) ?? ctx.since;
  if (await hasAccountLockSince(SYSTEM_VIEWER, ctx.email, first, tx)) return false;
  await ctx.recordAction(
    SYSTEM_VIEWER,
    {
      actionType: "account_lock",
      entity: "user",
      entityId: ctx.userId,
      detail: { email: ctx.email, threshold: ctx.threshold, windowMinutes: ctx.windowMinutes },
    },
    { tx },
  );
  return true;
}

function logLockout(ctx: LockContext, recorded: boolean): void {
  if (recorded) log.info("auth.lockout", { email: ctx.email, threshold: ctx.threshold, windowMinutes: ctx.windowMinutes });
}

// 07-09 FA-1(/cso F1): 로그인 전 훅 — 이메일 잠금 아래에서 열린 실패를 세고, 임계 이상이면 잠금 기록 확인 뒤
// 거부, 아니면 실패 행을 미리 남긴다(성공하면 after가 해소). 동시 시도도 잠금 순서로 줄 서므로 검사되는
// 시도가 임계를 넘지 않는다. 미리 기록 행의 시각은 DB 기본값 — account_lock.occurred_at과 같은 시계.
export async function reserveLoginAttempt(
  email: string,
  ip: string | null,
  deps?: LockDeps,
): Promise<{ locked: boolean; windowMinutes: number }> {
  const ctx = await loadLockContext(email, deps?.now?.() ?? new Date(), deps);
  const result = await withTransaction(async (tx) => {
    await lockLoginEmail(SYSTEM_VIEWER, email, tx);
    const count = await countOpenFailures(SYSTEM_VIEWER, email, ctx.since, tx);
    if (isLocked(count, ctx.threshold)) return { locked: true, recorded: await ensureLockRecorded(ctx, tx) };
    await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip }, tx);
    return { locked: false, recorded: false };
  });
  logLockout(ctx, result.recorded);
  return { locked: result.locked, windowMinutes: ctx.windowMinutes };
}

// 07-09 FA-1(/qa ISSUE-002): 로그인 실패 뒤 훅 — 미리 기록한 행까지 다시 세어(count+1 셈 없음) 임계에 닿았으면
// 잠금 기록 확인 뒤 잠김을 돌려준다. 잠김이면 hooks.ts가 그 시도의 응답을 403 잠금 문구로 낸다(after는 HTTP 경로에서
// Response 반환 · 직접 호출에서 FORBIDDEN, 퇴직 · 보관 거부는 before에서 FORBIDDEN).
export async function settleLoginFailure(
  email: string,
  deps?: LockDeps,
): Promise<{ locked: boolean; windowMinutes: number }> {
  const ctx = await loadLockContext(email, deps?.now?.() ?? new Date(), deps);
  // Codex 지적 (2)(사용자 결정 2026-10-22): 잠금 기록 확인만 실패하면 tx는 롤백되고(다음 시도가 채운다 — D-712)
  // 오류 로그를 남긴 뒤 잠김을 그대로 돌려준다 — N번째 응답이 500이 아니라 403 잠금 문구다. 다른 오류는 그대로 던진다.
  let lockRecordFailed = false;
  try {
    const result = await withTransaction(async (tx) => {
      await lockLoginEmail(SYSTEM_VIEWER, email, tx);
      const count = await countOpenFailures(SYSTEM_VIEWER, email, ctx.since, tx);
      if (!isLocked(count, ctx.threshold)) return { locked: false, recorded: false };
      try {
        return { locked: true, recorded: await ensureLockRecorded(ctx, tx) };
      } catch (e) {
        lockRecordFailed = true;
        throw e;
      }
    });
    logLockout(ctx, result.recorded);
    return { locked: result.locked, windowMinutes: ctx.windowMinutes };
  } catch (e) {
    if (!lockRecordFailed) throw e;
    log.error("auth.lockout_record_failed", { email, name: e instanceof Error ? e.name : typeof e });
    return { locked: true, windowMinutes: ctx.windowMinutes };
  }
}

// D-712·D-4220(Codex #12): 실패 기록·세기·잠금 로그가 한 트랜잭션이다 —
// 잠금 로그 쓰기가 실패하면 N번째 실패 기록도 롤백되어 다음 실패가 다시
// N번째가 된다(「잠겼는데 잠금 기록 0건」 없음). 07-09: 로그인 훅은 reserve · settle을 쓰고, 이 함수는
// 직접 기록 경로(시험 · CLI 사례)로 남는다 — 잠금 기록은 같은 「잠금 기록 확인」을 지난다.
export async function recordLoginFailure(
  email: string,
  ip: string | null,
  deps?: LockDeps,
): Promise<{ locked: boolean }> {
  const now = deps?.now?.() ?? new Date();
  const ctx = await loadLockContext(email, now, deps);
  const result = await withTransaction(async (tx) => {
    await lockLoginEmail(SYSTEM_VIEWER, email, tx);
    await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip, attemptedAt: now }, tx);
    const count = await countOpenFailures(SYSTEM_VIEWER, email, ctx.since, tx);
    if (!isLocked(count, ctx.threshold)) return { locked: false, recorded: false };
    return { locked: true, recorded: await ensureLockRecorded(ctx, tx) };
  });
  logLockout(ctx, result.recorded);
  return { locked: result.locked };
}
