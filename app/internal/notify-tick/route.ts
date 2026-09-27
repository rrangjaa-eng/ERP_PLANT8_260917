import { handleNotifyTick } from "./handle";

// Cloud Scheduler 전용 — 인증은 앱 안 OIDC 검증(handle.ts). 라우트 파일은 라우트 필드만 내보낸다.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleNotifyTick(request);
}
