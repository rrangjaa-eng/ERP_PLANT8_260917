import type { StatusWord } from "@/ui/status-tag/status-map";

// 06-08(C2 · ST-3): 구매 요청 상태 값 → 낱말 한 곳. 색은 여기서 고르지 않는다(`ui/status-tag/status-map.ts`가 정한다).
// 맨 `신청`은 쓰지 않는다 — `신청됨`.
export type PurchaseStatus = "requested" | "purchased" | "cancelled";

const PURCHASE_STATUS_WORD: Record<PurchaseStatus, StatusWord> = {
  requested: "신청됨",
  purchased: "구매 완료",
  cancelled: "취소",
};

export function purchaseStatusWord(status: PurchaseStatus): StatusWord {
  return PURCHASE_STATUS_WORD[status];
}

// 목록 상태 보기 — 서버 페이지와 클라이언트 필터가 함께 쓴다(클라이언트 모듈의 값은 서버에서 못 쓴다).
export const PURCHASE_STATUS_VIEWS = ["신청됨", "구매 완료", "취소", "전체"] as const;
export type PurchaseStatusView = (typeof PURCHASE_STATUS_VIEWS)[number];
