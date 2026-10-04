import "server-only";
import { notFound } from "next/navigation";
import { isCertFeatureEnabled } from "@/domain/certs/feature";

// 규약 C1 — 이 페이즈의 모든 확인증 페이지 · 라우트 핸들러 · 서버 액션
// (공개 · 내부)이 첫 줄에서 부른다. 거짓이면 notFound()를 던져 페이지는
// 404, 라우트 핸들러는 404, 서버 액션은 next-safe-action이 프레임워크
// 오류로 다시 던져 not-found가 된다. domain은 next/*를 import하지
// 않으므로 이 가드는 lib/에 둔다(선례 lib/viewer.ts).
export async function assertCertFeatureEnabled(): Promise<void> {
  const enabled = await isCertFeatureEnabled();
  if (!enabled) notFound();
}
