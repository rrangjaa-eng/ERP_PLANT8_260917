import { cache } from "react";
import type { Viewer } from "@/domain/viewer";
import { listNextTurnItems, type NextTurnEntry } from "@/domain/next-turn";

// U1-2(06 교차 검토): 레이아웃(폰 탭 `내 차례 N`)과 홈(목록)이 한 요청 안에서 같은 계산을 한 번만 한다.
// 두 곳의 viewer 객체가 달라(getSession을 따로 부른다) 열쇠는 사람 id · 계급이다. 홈이 결재 시트 재료를 쓰므로 한 번 계산에 withDetails를 싣는다.
// 요청 memo는 React cache()가 요청마다 새 Map을 준다 — 다음 요청은 새로 계산한다(app/c/[token]/page.tsx와 같은 cache 쓰임).
const requestMemo = cache(() => new Map<string, Promise<NextTurnEntry[]>>());

export function listNextTurnItemsForRequest(viewer: Viewer): Promise<NextTurnEntry[]> {
  const memo = requestMemo();
  const key = `${viewer.id}\u0000${viewer.roleId ?? ""}`;
  let pending = memo.get(key);
  if (!pending) {
    pending = listNextTurnItems(viewer, { withDetails: true });
    memo.set(key, pending);
  }
  return pending;
}
