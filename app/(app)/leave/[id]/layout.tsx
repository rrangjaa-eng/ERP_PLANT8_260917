import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { getLeave } from "@/domain/leave";

// 04.1-05: 보임 규칙 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다. loading.tsx가 있으면 페이지 본문은 스트리밍되고,
// 스트리밍이 시작된 뒤의 notFound()는 HTTP 404가 아니라 200(soft 404)이 된다(Next 16 loading.md 「Status Codes」).
// 관계없는 사람의 404(D-17)를 지키려고 응답 헤더 전에 판정한다 — 없거나 볼 수 없으면 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeaveDocumentLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  if (!UUID.test(id) || !(await getLeave(viewer, id))) notFound();
  return children;
}
