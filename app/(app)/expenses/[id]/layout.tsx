import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import "@/app/(app)/document-kinds";
import { getExpense } from "@/domain/expenses";

// 05-05: 보임 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다 — loading.tsx가 있으면 페이지 본문이 스트리밍되고, 스트리밍이 시작된 뒤의
// notFound()는 HTTP 404가 아니라 200(soft 404)이 된다(Next 16 loading.md 「Status Codes」). 작성 중 문서는 기안자 말고 404(D-17).
// 읽기 오류는 여기서 던지지 않는다 — error.tsx는 같은 세그먼트의 layout을 감싸지 않으므로(Next 16 error.md) page의 같은 읽기가
// [id]/error.tsx 안에서 다시 던져 문서 전용 오류 화면이 뜬다(연차 선례).
export default async function ExpenseLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const expense = await getExpense(viewer, { expenseId: id }).catch(() => undefined);
  if (expense === null) notFound();
  return children;
}
