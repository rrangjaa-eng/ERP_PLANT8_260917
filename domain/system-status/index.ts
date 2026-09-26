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
};

export type StatusDeps = {
  countConnections: typeof defaultCountConnections;
  maxConnections: typeof defaultMaxConnections;
  getLastBackup: typeof defaultGetLastBackup;
  can: typeof defaultCan;
  now?: () => Date;
};

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
    throw new NotAdminError("관리자만 볼 수 있음");
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

  return { version, db, backup };
}
