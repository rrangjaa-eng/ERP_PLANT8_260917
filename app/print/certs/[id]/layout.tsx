import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { isCertificatePrintable } from "@/domain/certs/review";
import { getSessionId, requireSession } from "@/lib/viewer";

// 04.3-11 — 같은 폴더의 loading.tsx는 이 레이아웃 안쪽에서 페이지만 감싸므로, 게이트가 여기서 먼저 끝나면
// 꺼짐의 notFound()가 로딩 화면이 스트리밍되기 전(헤더 전)에 나서 HTTP 404가 된다(codex final3 C3).
// 웨이브 6 DOM 감사 P5 — 없는 id · 형식 아닌 id · 권한 없음도 같은 이유로 여기서 읽기 전용으로 먼저 판정한다(페이지의 notFound()는
// 스트리밍이 시작된 뒤라 상태가 200으로 굳는다). 세션이 없으면 페이지가 로그인으로 보낸다. 활동 기록 · 비활동 시계는 페이지만 쓴다.
export default async function CertPrintLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await assertCertFeatureEnabled();
  if (await getSessionId()) {
    const { viewer } = await requireSession();
    const { id } = await params;
    if (!(await isCertificatePrintable(viewer, id))) notFound();
  }
  return children;
}
