// 06-09(O-11 확정 — U-6): 카드 사용 수정 · 연결 변경 · 삭제 권리. S8 행동 칸 · `?editId=` 열기 · 서버 저장 허락이 모두 이 결과를 쓴다.
// 순수 함수 — 호출자가 사전 조회에서 `proxy`(= `cards.proxy` write) · `projectCompleted`(연결 줄 프로젝트가 `completed` — A-601)를 구해 넘긴다.

export type CardUsageRightsSubject = {
  registeredBy: string;
  registeredVia: string;
  /** 연결 줄의 프로젝트가 완료(`completed`) — 팀 비용 건은 거짓. */
  projectCompleted: boolean;
};

export type CardUsageRightsViewer = { userId: string; proxy: boolean };

export type CardUsageRights = { edit: boolean; changeLink: boolean; delete: boolean };

const NONE: CardUsageRights = { edit: false, changeLink: false, delete: false };

// O-11 답이 바뀌면 이 함수만 고친다.
export function cardUsageRights(usage: CardUsageRightsSubject, viewer: CardUsageRightsViewer): CardUsageRights {
  const registrant = usage.registeredBy === viewer.userId;
  // 등록한 사람 · 대리 등록 권한자, 완료 프로젝트 줄에 이은 건은 대리 등록 권한자만(U-4).
  if (!viewer.proxy && !(registrant && !usage.projectCompleted)) return NONE;
  // 구매 완료로 생긴 건은 연결을 바꿀 수 없고 삭제가 없다.
  if (usage.registeredVia === "purchase") return { edit: true, changeLink: false, delete: false };
  return { edit: true, changeLink: true, delete: true };
}
