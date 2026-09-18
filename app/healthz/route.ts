import { checkHealth } from "@/domain/health";
import { env } from "@/lib/env";

// 인증 없음(스모크·Cloud Run 프로브용). ok·sha·deployedAt 외 정보는 노출하지
// 않는다(T-1-03).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const health = await checkHealth();

  if (!health.ok) {
    return Response.json({ ok: false }, { status: 503 });
  }

  return Response.json({
    ok: true,
    sha: env.APP_GIT_SHA ?? "local",
    deployedAt: env.APP_DEPLOYED_AT ?? null,
  });
}
