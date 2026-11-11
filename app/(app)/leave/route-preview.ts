import "@/app/(app)/document-kinds";
import { previewRoute, RouteBlockedError, type RouteHint, type RoutePreviewDTO } from "@/domain/approvals";
import { LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import type { Viewer } from "@/domain/viewer";

// 연차 결재선 미리보기 — 결재선이 막혀도(대표 없음) 화면을 오류로 떨어뜨리지 않고 막힌 이유를 결재선 자리에 준다
// (04.1-06 코드 검토 L3 · /review core). 신청 폼 미리보기와 반려 문서의 다시 신청이 같이 쓴다. 다른 오류는 그대로 던진다.
// 07.2-13(PU9): hint = 연차 종류 — 제출 · 재상신과 같은 힌트로 엔진이 같은 결재선을 조립한다(미리보기 = 제출).
export async function previewRouteOrBlocked(viewer: Viewer, hint?: RouteHint): Promise<{ route: RoutePreviewDTO | null; blocked: string | null }> {
  try {
    return { route: await previewRoute(viewer, { kind: LEAVE_DOCUMENT_KIND, hint }), blocked: null };
  } catch (error) {
    if (!(error instanceof RouteBlockedError)) throw error;
    return { route: null, blocked: error.message };
  }
}
