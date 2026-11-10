import { cache } from "react";
import { ForbiddenError } from "@/domain/quotes/lines";
import { getQuoteClientPrint } from "@/domain/quotes/client-print";
import { getSessionId, requireSession } from "@/lib/viewer";

// 레이아웃(제목 · 404)과 페이지가 한 요청 안에서 같은 판정을 한 번만 한다. 세션이 없으면 undefined(페이지가 로그인으로 보낸다).
// 금액을 볼 수 없는 계정은 ForbiddenError가 아니라 null(404) — 차수가 있다는 사실을 알리지 않는다. 형식 아닌 id는 canOpenRevision이 먼저 거른다.
export const loadQuoteForPrint = cache(async (id: string) => {
  if (!(await getSessionId())) return undefined;
  const { viewer } = await requireSession();
  try {
    return await getQuoteClientPrint(viewer, id);
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
});
