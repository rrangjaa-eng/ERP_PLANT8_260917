import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { canSeeSettlementDocument } from "@/domain/settlements";

// 05-11: 보임 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다 — 스트리밍이 시작된 뒤의 notFound()는 HTTP 404가 아니라 200(soft 404)이다
// (Next 16 loading.md 「Status Codes」, 연차 · 지출결의 선례). 읽기 오류는 여기서 던지지 않는다 — page의 같은 읽기가 error.tsx 안에서 다시 던진다.
export default async function SettlementLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const seen = await canSeeSettlementDocument(viewer, { projectId: id }).catch(() => undefined);
  if (seen === false) notFound();
  return children;
}
