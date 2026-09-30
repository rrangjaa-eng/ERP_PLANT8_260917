import type { ReactNode } from "react";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";

// 04.3-11 — 같은 폴더의 loading.tsx는 이 레이아웃 안쪽에서 페이지만 감싸므로, 게이트가 여기서 먼저 끝나면
// 꺼짐의 notFound()가 로딩 화면이 스트리밍되기 전(헤더 전)에 나서 HTTP 404가 된다(codex final3 C3).
export default async function CertPrintLayout({ children }: { children: ReactNode }) {
  await assertCertFeatureEnabled();
  return children;
}
