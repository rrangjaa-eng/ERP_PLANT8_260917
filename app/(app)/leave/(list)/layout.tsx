import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";

// 04.1-06(S1 · D-17): `leave` view 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다 — 스트리밍이 시작된 뒤의
// notFound()는 404가 아니라 200(soft 404)이 된다(Next 16 loading.md 「Status Codes」, 04.1-05 [id]/layout.tsx 선례).
// 목록만 이 라우트 그룹에 두어 `/leave/new` · `/leave/[id]`는 이 경계 · 판정 밖이다(문서는 메뉴가 아니라 보임 규칙).
export default async function LeaveListLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "leave", "view"))) notFound();
  return children;
}
