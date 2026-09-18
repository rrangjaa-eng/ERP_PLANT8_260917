import { sqladmin } from "@googleapis/sqladmin";
import { GoogleAuth } from "google-auth-library";
import { log } from "@/lib/log";
import type { SystemStatus } from "@/domain/system-status";

export type ListBackupRuns = (p: {
  project: string;
  instance: string;
}) => Promise<{ items?: Array<{ status?: string | null; endTime?: string | null }> | null }>;

// Pitfall 5: 서비스 계정에는 Cloud SQL 읽기 권한만 준다(D-18) — roles/cloudsql.viewer가
// 실제로 backupRuns.list를 포함하는지는 회사 GCP 확보 후 확인 필요(A3, [ASSUMED]).
const defaultList: ListBackupRuns = async ({ project, instance }) => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/sqlservice.admin"] });
  const client = sqladmin({ version: "v1", auth });
  const res = await client.backupRuns.list({ project, instance, maxResults: 1 });
  return { items: res.data.items ?? undefined };
};

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Cloud SQL Admin API 호출이 시간 초과됐습니다.")), ms);
  });
}

// D-18: "마지막 백업"은 캐시·저장 없이 화면 로드마다 직접 조회한다. 목록이 비면
// none(첫 자동 백업 전), 조회 자체가 실패하면 unavailable("확인 불가") — 둘은
// 화면에서 구분해 렌더한다.
export async function getLastBackup(
  params: { project?: string; instance?: string },
  options?: { timeoutMs?: number; list?: ListBackupRuns },
): Promise<SystemStatus["backup"]> {
  const { project, instance } = params;
  if (!project || !instance) {
    return { kind: "unavailable", reason: "not-configured" };
  }

  const list = options?.list ?? defaultList;
  const timeoutMs = options?.timeoutMs ?? 5000;

  try {
    const result = await Promise.race([list({ project, instance }), timeout(timeoutMs)]);
    const first = result.items?.[0];
    if (!first) {
      return { kind: "none" };
    }
    return { kind: "ok", status: first.status ?? "UNKNOWN", endTime: first.endTime ?? null };
  } catch (e) {
    const reasonBase = e instanceof Error ? e.constructor.name : "Error";
    const statusCode = (e as { code?: number; status?: number } | undefined)?.code ??
      (e as { code?: number; status?: number } | undefined)?.status;
    const reason = statusCode === 403 ? `${reasonBase}:permission` : reasonBase;
    log.warn("status.backup_unavailable", { reason });
    return { kind: "unavailable", reason };
  }
}
