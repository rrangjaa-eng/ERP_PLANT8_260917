import { pingDatabase } from "@/repositories/health";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";

export type HealthDeps = { ping: typeof pingDatabase };

// app/api/health/route.ts는 이 함수만 부른다 — app은 repositories/db를 직접
// import하지 않는다(Issue 1, 4계층 준수).
export async function checkHealth(deps?: Partial<HealthDeps>): Promise<{ ok: boolean }> {
  const ping = deps?.ping ?? pingDatabase;
  try {
    await ping(SYSTEM_VIEWER);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("healthz.db_unreachable", { message });
    return { ok: false };
  }
}
