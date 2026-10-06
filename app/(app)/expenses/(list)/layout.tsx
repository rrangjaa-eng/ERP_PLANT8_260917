import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";

// 05-08: `expenses` view 판정을 로딩 경계(loading.tsx) 바깥에서 먼저 한다 — 스트리밍이 시작된 뒤의 notFound()는 404가 아니라
// 200(soft 404)이 된다(leave/(list)/layout.tsx 선례). 목록만 이 라우트 그룹에 두어 `/expenses/new` · `/expenses/[id]`는 목록 뼈대 ·
// 목록 오류 경계 밖이다. 읽기 오류는 여기서 던지지 않는다 — page의 같은 판정이 (list)/error.tsx 안에서 다시 던진다.
export default async function ExpensesListLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireSession();
  const allowed = await can(viewer, "expenses", "view").catch(() => undefined);
  if (allowed === false) notFound();
  return children;
}
