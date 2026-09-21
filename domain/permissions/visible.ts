import type { Viewer } from "@/domain/viewer";
import { findVisibility as defaultFindVisibility } from "@/repositories/permissions";

// ADMN-02: 정보 항목 노출 판정 — can()과 완전 독립(D-35). VisibleDeps 타입에
// 메뉴×동작 판정 함수 필드를 두지 않는 것으로 이 독립성이 타입에도 드러나게
// 한다 — 메뉴 접근 판정과 필드 노출 판정이 각자의 표만 읽는다.
export type VisibleDeps = {
  findVisibility: typeof defaultFindVisibility;
};

export async function visible(
  viewer: Viewer,
  infoItem: string,
  deps?: Partial<VisibleDeps>,
): Promise<boolean> {
  // viewer에 계급 식별자가 없으면 기본 거부 — 노출표를 조회하지도 않는다.
  if (!viewer.roleId) return false;

  const findVisibility = deps?.findVisibility ?? defaultFindVisibility;
  const row = await findVisibility(viewer, viewer.roleId, infoItem);
  // 행이 없으면 false — 새 기능 정보는 기본 숨김이다.
  return row?.visible === true;
}
