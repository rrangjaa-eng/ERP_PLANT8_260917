import { env } from "@/lib/env";
import { log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  countConnections as defaultCountConnections,
  maxConnections as defaultMaxConnections,
} from "@/repositories/system-status";
import { getLastBackup as defaultGetLastBackup } from "@/lib/gcp/cloud-sql-admin";
import {
  findLastEmailOutcome as defaultGetLastEmailOutcome,
  findLastTickRun as defaultGetLastTickRun,
  findUnresolvedEmail as defaultGetUnresolvedEmail,
} from "@/repositories/notifications";
import { smtpConfigFromEnv } from "@/lib/email/sender";
import { EMAIL_UNKNOWN_AFTER_MS, EMAIL_UNKNOWN_VISIBLE_DAYS } from "@/domain/notify/email-phase";
import { formatKstMinute } from "@/domain/holidays/business-day";

export class NotAdminError extends UserFacingError {}

export type SystemStatus = {
  version: { sha: string; deployedAt: string | null; env: "local" | "staging" | "prod" };
  db:
    | { connections: number; maxConnections: number; ratio: number; banner: boolean }
    | { unavailable: true };
  backup:
    | { kind: "ok"; status: string; endTime: string | null }
    | { kind: "none" }
    | { kind: "unavailable"; reason: string };
  // 18A: 마지막 tick 실행(알림 발송 줄).
  notify:
    | { kind: "none" }
    | { kind: "ok"; at: string; businessDay: boolean; sent: number; skipped: number; remaining: number }
    | { kind: "unavailable" };
  // D-711 · Codex #18: 이메일 설정(지금)과 발송 결과(과거)는 다른 항목이다.
  email: { kind: "unconfigured" } | { kind: "configured"; from: string };
  emailOutcome: EmailOutcomeStatus;
};

// D-4217: 실패는 이메일을 시도한 마지막 tick, 결과 불명은 알림 행 기준 7일 창.
export type EmailOutcomeStatus =
  | { kind: "ok"; failed: number; failedAt: string | null; unknown: number; unknownSince: string | null }
  | { kind: "unavailable" };

export type EmailFailureBanner = {
  failed: number;
  failedAt: string | null;
  unknown: number;
  unknownSince: string | null;
};

export type StatusDeps = {
  countConnections: typeof defaultCountConnections;
  maxConnections: typeof defaultMaxConnections;
  getLastBackup: typeof defaultGetLastBackup;
  can: typeof defaultCan;
  getLastTickRun: typeof defaultGetLastTickRun;
  getLastEmailOutcome: typeof defaultGetLastEmailOutcome;
  getUnresolvedEmail: typeof defaultGetUnresolvedEmail;
  smtpConfig: () => { from: string } | null;
  now?: () => Date;
};

type EmailOutcomeDeps = Pick<StatusDeps, "getLastEmailOutcome" | "getUnresolvedEmail"> & { now: () => Date };

// 두 읽기(마지막 이메일 시도 · 결과 불명 묶음)를 한 모양으로 — 던지면 호출부가 처리한다.
async function readEmailOutcome(viewer: Viewer, deps: EmailOutcomeDeps): Promise<EmailOutcomeStatus> {
  const [last, unresolved] = await Promise.all([
    deps.getLastEmailOutcome(viewer),
    deps.getUnresolvedEmail(viewer, {
      now: deps.now(),
      unknownAfterMs: EMAIL_UNKNOWN_AFTER_MS,
      visibleDays: EMAIL_UNKNOWN_VISIBLE_DAYS,
    }),
  ]);
  const failed = last?.failed ?? 0;
  return {
    kind: "ok",
    failed,
    failedAt: last && failed > 0 ? formatKstMinute(last.at) : null,
    unknown: unresolved.bundles,
    unknownSince: unresolved.bundles > 0 && unresolved.since ? formatKstMinute(unresolved.since) : null,
  };
}

// B2 판정(순수) — /admin과 /admin/system-status가 같이 쓴다. 지금의 SMTP 설정과 무관하다.
export function emailFailureBannerFrom(outcome: EmailOutcomeStatus): EmailFailureBanner | null {
  if (outcome.kind !== "ok" || outcome.failed + outcome.unknown === 0) return null;
  const { failed, failedAt, unknown, unknownSince } = outcome;
  return { failed, failedAt, unknown, unknownSince };
}

// B2 글자(링크 제외, D-4217) — 0건 조각은 쓰지 않고 시각은 조각마다 괄호.
export function emailFailureBannerText(banner: EmailFailureBanner): string {
  const unknownSince = banner.unknownSince ?? "";
  if (banner.failed === 0) return `이메일 결과 불명 ${banner.unknown}건 (${unknownSince})`;
  const failedPart = `이메일 발송 실패 ${banner.failed}건 (${banner.failedAt ?? ""})`;
  return banner.unknown === 0 ? failedPart : `${failedPart} · 결과 불명 ${banner.unknown}건 (${unknownSince})`;
}

// B2(NOTI-02 · D-4217): 「관리」 인덱스용 — admin.system-status view 권한자에게만, 시스템
// 상태와 같은 읽기(readEmailOutcome)와 같은 판정(emailFailureBannerFrom). 권한이 없으면
// null, 조회가 실패하면 경고 로그 뒤 null(S3/error).
export async function emailFailureBanner(
  viewer: Viewer,
  deps?: Partial<Pick<StatusDeps, "can" | "getLastEmailOutcome" | "getUnresolvedEmail" | "now">>,
): Promise<EmailFailureBanner | null> {
  try {
    if (!(await (deps?.can ?? defaultCan)(viewer, "admin.system-status", "view"))) return null;
    const outcome = await readEmailOutcome(viewer, {
      getLastEmailOutcome: deps?.getLastEmailOutcome ?? defaultGetLastEmailOutcome,
      getUnresolvedEmail: deps?.getUnresolvedEmail ?? defaultGetUnresolvedEmail,
      now: deps?.now ?? (() => new Date()),
    });
    return emailFailureBannerFrom(outcome);
  } catch (error) {
    log.warn("admin.banner_failed", {
      banner: "email",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// OPS-06·D-17: 한도 배너 판정. connections/maxConnections >= ratio(정확히 같아도 뜬다).
export function connectionBanner(connections: number, maxConnections: number, ratio: number): boolean {
  if (maxConnections <= 0) return false;
  return connections / maxConnections >= ratio;
}

// OPS-06·D-17·D-18: 시스템 상태 메뉴(admin.system-status)의 보기 권한이 있어야
// 조회 가능(권한표를 읽는다 — 화면의 notFound()와 이중 방어). 캐시 없이 매번
// 커넥션·백업·버전을 합성한다.
export async function getSystemStatus(
  viewer: Viewer,
  deps?: Partial<StatusDeps>,
): Promise<SystemStatus> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, "admin.system-status", "view"))) {
    throw new NotAdminError("관리자만 볼 수 있습니다.");
  }

  const countConnections = deps?.countConnections ?? defaultCountConnections;
  const maxConnectionsFn = deps?.maxConnections ?? defaultMaxConnections;
  const getLastBackupFn = deps?.getLastBackup ?? defaultGetLastBackup;

  const version = {
    sha: env.APP_GIT_SHA ?? "local",
    deployedAt: env.APP_DEPLOYED_AT ?? null,
    env: env.APP_ENV,
  };

  let db: SystemStatus["db"];
  try {
    const [connections, maxConn] = await Promise.all([
      countConnections(viewer),
      maxConnectionsFn(viewer),
    ]);
    db = {
      connections,
      maxConnections: maxConn,
      ratio: maxConn > 0 ? connections / maxConn : 0,
      banner: connectionBanner(connections, maxConn, env.STATUS_CONN_BANNER_RATIO),
    };
  } catch (e) {
    // 화면은 계속 렌더한다(확인 불가) — 대신 조용히 삼키지 않고 로그를 남긴다.
    log.warn("status.db_unavailable", { message: e instanceof Error ? e.message : String(e) });
    db = { unavailable: true };
  }

  const backup = await getLastBackupFn({
    project: env.GCP_PROJECT_ID,
    instance: env.CLOUD_SQL_INSTANCE_ID,
  });

  const getLastTickRunFn = deps?.getLastTickRun ?? defaultGetLastTickRun;
  let notify: SystemStatus["notify"];
  try {
    const run = await getLastTickRunFn(viewer);
    notify = run
      ? {
          kind: "ok",
          at: formatKstMinute(run.startedAt),
          businessDay: run.businessDay,
          sent: run.sent,
          skipped: run.skipped,
          remaining: run.remaining,
        }
      : { kind: "none" };
  } catch (e) {
    log.warn("status.notify_unavailable", { message: e instanceof Error ? e.message : String(e) });
    notify = { kind: "unavailable" };
  }

  // SMTP 설정에서는 발신 주소만 꺼낸다(host·user·password는 화면에 가지 않는다, T-4.2-90).
  const smtp = (deps?.smtpConfig ?? smtpConfigFromEnv)();
  const email: SystemStatus["email"] = smtp ? { kind: "configured", from: smtp.from } : { kind: "unconfigured" };

  let emailOutcome: EmailOutcomeStatus;
  try {
    emailOutcome = await readEmailOutcome(viewer, {
      getLastEmailOutcome: deps?.getLastEmailOutcome ?? defaultGetLastEmailOutcome,
      getUnresolvedEmail: deps?.getUnresolvedEmail ?? defaultGetUnresolvedEmail,
      now: deps?.now ?? (() => new Date()),
    });
  } catch (e) {
    log.warn("status.email_outcome_unavailable", { message: e instanceof Error ? e.message : String(e) });
    emailOutcome = { kind: "unavailable" };
  }

  return { version, db, backup, notify, email, emailOutcome };
}
