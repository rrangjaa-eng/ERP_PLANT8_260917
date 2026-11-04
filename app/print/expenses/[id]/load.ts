import { cache } from "react";
import { getExpense } from "@/domain/expenses";
import { getSessionId, requireSession } from "@/lib/viewer";

// 레이아웃(제목 · 404)과 페이지가 한 요청 안에서 같은 판정을 한 번만 한다. 세션이 없으면 undefined(페이지가 로그인으로 보낸다).
// 형식 아닌 id는 getExpense가 UUID 형식으로 먼저 null이다.
export const loadExpenseForPrint = cache(async (id: string) => {
  if (!(await getSessionId())) return undefined;
  const { viewer } = await requireSession();
  return getExpense(viewer, { expenseId: id });
});
