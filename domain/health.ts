import { pingDatabase } from "@/repositories/health";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { decrypt, encrypt } from "@/lib/crypto";
import { log } from "@/lib/log";

export type HealthDeps = { ping: typeof pingDatabase; dataKeyRoundTrip: () => void };

// 04.3-08 RB-P1 — 라우트 번들의 lib/crypto 인스턴스에서 데이터 키가 준비됐는지
// 고정 문자열(비밀 아님)의 encrypt → decrypt 왕복으로 본다. 기동 때 푼 키가 요청
// 경로에 안 보이면 여기서 실패해 /api/health가 503이 되고 배포 스모크가 잡는다.
const HEALTH_PROBE = "plant8-health";

function dataKeyRoundTrip(): void {
  if (decrypt(encrypt(HEALTH_PROBE)) !== HEALTH_PROBE) {
    throw new Error("data key round trip mismatch");
  }
}

// app/api/health/route.ts는 이 함수만 부른다 — app은 repositories/db를 직접
// import하지 않는다(Issue 1, 4계층 준수).
export async function checkHealth(deps?: Partial<HealthDeps>): Promise<{ ok: boolean }> {
  const ping = deps?.ping ?? pingDatabase;
  const roundTrip = deps?.dataKeyRoundTrip ?? dataKeyRoundTrip;
  try {
    await ping(SYSTEM_VIEWER);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("healthz.db_unreachable", { message });
    return { ok: false };
  }
  try {
    roundTrip();
  } catch (error) {
    // 메시지 · 키 · 평문 · 암호문은 남기지 않는다 — 오류 종류만.
    log.error("healthz.data_key_unavailable", { name: error instanceof Error ? error.constructor.name : typeof error });
    return { ok: false };
  }
  return { ok: true };
}
