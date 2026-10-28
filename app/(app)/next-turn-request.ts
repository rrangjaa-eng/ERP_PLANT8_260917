import { cache } from "react";
import type { Viewer } from "@/domain/viewer";
import { listNextTurnItems, type NextTurnEntry } from "@/domain/next-turn";
import { listPhase6NextTurnItems } from "@/domain/next-turn/phase6-items";
import { seoulToday } from "@/lib/dates";

// U1-2(06 교차 검토) → 07.1-17(PF1 · E-P2-45): 레이아웃(폰 탭 `내 차례 N`)과 홈(목록)이 한 요청 안에서 같은 계산을 겹쳐 하지 않는다.
// 두 곳의 viewer 객체가 달라(getSession을 따로 부른다) 열쇠는 사람 id · 계급이다. 요청 memo는 React cache()가 요청마다 새 Map을 준다 —
// 다음 요청은 새로 계산한다(app/c/[token]/page.tsx와 같은 cache 쓰임). 한 Map에 열쇠 앞머리로 세 층을 가른다:
//   phase6 — Phase 6 항목(지급 대상 · 구매 · 발행 · 완료 전 점검, 무거운 몫). 사람마다 한 번. 건수 길 · 목록 길이 둘 다 이것을 받는다.
//   list   — 홈 목록(결재 시트 재료 `withDetails: true` 포함).
//   count  — 레이아웃 건수(시트 재료 없음). 같은 요청에 list가 이미 있으면 그 길이를 쓴다.
// App Router는 레이아웃과 페이지를 병렬로 그리므로 어느 쪽이 먼저든 Phase 6는 한 번이다. 결재함 · 막힘 읽기는 시트 재료 유무가 달라 홈에서 두 번 돌 수 있다(받아들인 비용).
// 오류는 감싸지 않고 그대로 던진다(06-23 PN-3 — 홈의 catch가 한 줄 오류로 바꾸고, 레이아웃은 건수 없이 렌더한다).
const requestMemo = cache(() => new Map<string, Promise<NextTurnEntry[]>>());

type Layer = "phase6" | "list" | "count";

function memoKey(layer: Layer, viewer: Viewer): string {
  return `${layer}\u0000${viewer.id}\u0000${viewer.roleId ?? ""}`;
}

function memoized(layer: Layer, viewer: Viewer, compute: () => Promise<NextTurnEntry[]>): Promise<NextTurnEntry[]> {
  const memo = requestMemo();
  const key = memoKey(layer, viewer);
  let pending = memo.get(key);
  if (!pending) {
    pending = compute();
    memo.set(key, pending);
  }
  return pending;
}

function phase6ForRequest(viewer: Viewer): Promise<NextTurnEntry[]> {
  return memoized("phase6", viewer, () => listPhase6NextTurnItems(viewer, seoulToday()));
}

export function listNextTurnItemsForRequest(viewer: Viewer): Promise<NextTurnEntry[]> {
  return memoized("list", viewer, () => listNextTurnItems(viewer, { withDetails: true }, { phase6: () => phase6ForRequest(viewer) }));
}

// 레이아웃 폰 탭 건수 — 홈 밖 화면에서 결재 시트 재료를 읽지 않는다. 같은 요청에 목록이 이미 있으면(홈) 그 길이다.
export async function countNextTurnItemsForRequest(viewer: Viewer): Promise<number> {
  const existing = requestMemo().get(memoKey("list", viewer));
  if (existing) return (await existing).length;
  return (await memoized("count", viewer, () => listNextTurnItems(viewer, undefined, { phase6: () => phase6ForRequest(viewer) }))).length;
}
