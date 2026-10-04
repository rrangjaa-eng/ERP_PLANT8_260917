import { cache, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { isCertificatePrintable } from "@/domain/certs/review";
import { getSessionId, requireSession } from "@/lib/viewer";

// 04.3-11 — 같은 폴더의 loading.tsx는 이 레이아웃 안쪽에서 페이지만 감싸므로, 게이트가 여기서 먼저 끝나면
// 꺼짐의 notFound()가 로딩 화면이 스트리밍되기 전(헤더 전)에 나서 HTTP 404가 된다(codex final3 C3).
// 웨이브 6 DOM 감사 P5 — 없는 id · 형식 아닌 id · 권한 없음도 같은 이유로 여기서 읽기 전용으로 먼저 판정한다(페이지의 notFound()는
// 스트리밍이 시작된 뒤라 상태가 200으로 굳는다). 세션이 없으면 페이지가 로그인으로 보낸다. 활동 기록 · 비활동 시계는 페이지만 쓴다.
// 레이아웃과 메타데이터가 한 요청 안에서 같은 판정을 한 번만 한다. 세션이 없으면 null(페이지가 로그인으로 보낸다).
const judgePrintable = cache(async (id: string): Promise<boolean | null> => {
  if (!(await getSessionId())) return null;
  const { viewer } = await requireSession();
  return isCertificatePrintable(viewer, id);
});

// 문서 제목은 서버가 낸다 — 클라이언트 효과(document.title)는 하이드레이션이 뒤따라 커밋하는 루트 메타데이터 <title>(「PLANT8 ERP」)이
// 덮어써서 간헐로 졌다(repeat-each 8에서 5/8). 404 변종(없음 · 권한 없음 · 꺼짐)에는 제목을 내지 않아 기본 제목이 남는다(독립 DOM 감사 L3).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return (await judgePrintable(id)) === true ? { title: "확인증 인쇄" } : {};
}

export default async function CertPrintLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await assertCertFeatureEnabled();
  const { id } = await params;
  if ((await judgePrintable(id)) === false) notFound();
  return children;
}
