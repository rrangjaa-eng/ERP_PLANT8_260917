import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";

// 04.1-06(S1 · D-17): `leave` view 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다 — 스트리밍이 시작된 뒤의
// notFound()는 404가 아니라 200(soft 404)이 된다(Next 16 loading.md 「Status Codes」, 04.1-05 [id]/layout.tsx 선례).
// 목록만 이 라우트 그룹에 두어 `/leave/new` · `/leave/[id]`는 이 경계 · 판정 밖이다(문서는 메뉴가 아니라 보임 규칙).
export default async function LeaveListLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireSession();
  // 읽기 오류는 여기서 던지지 않는다 — error.tsx는 같은 세그먼트의 layout을 감싸지 않으므로(Next 16 error.md), page의
  // 같은 판정이 (list)/error.tsx 안에서 다시 던져 목록 전용 오류 화면이 뜨게 한다(04.1-06 코드 검토 L6).
  const allowed = await can(viewer, "leave", "view").catch(() => undefined);
  if (allowed === false) notFound();
  return children;
}
