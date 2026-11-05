import { cache } from "react";
import { getLeave } from "@/domain/leave";
import { getSessionId, requireSession } from "@/lib/viewer";

// 연차 상세 화면(app/(app)/leave/[id]/page.tsx)과 같은 UUID 모양 — getLeave · findLeaveRequestById에는 형식 검사가 없어
// 「abc」를 그대로 넘기면 Postgres uuid 형식 오류로 500이 된다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 레이아웃(제목 · 404)과 페이지가 한 요청 안에서 같은 판정을 한 번만 한다. 세션이 없으면 undefined(페이지가 로그인으로 보낸다).
export const loadLeaveForPrint = cache(async (id: string) => {
  if (!(await getSessionId())) return undefined;
  const { viewer } = await requireSession();
  if (!UUID.test(id)) return null;
  return getLeave(viewer, id);
});
