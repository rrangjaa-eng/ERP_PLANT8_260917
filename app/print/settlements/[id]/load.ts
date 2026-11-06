import { cache } from "react";
import { getSettlement } from "@/domain/settlements";
import { getSessionId, requireSession } from "@/lib/viewer";

// 레이아웃(제목 · 404)과 페이지가 한 요청 안에서 같은 판정을 한 번만 한다. 세션이 없으면 undefined(페이지가 로그인으로 보낸다).
// 라우트 id = 프로젝트 id(정산 화면과 같다). 형식 아닌 id는 getSettlement가 UUID 형식으로 먼저 null이다.
export const loadSettlementForPrint = cache(async (id: string) => {
  if (!(await getSessionId())) return undefined;
  const { viewer } = await requireSession();
  return getSettlement(viewer, { projectId: id });
});
