// 알림 받는 사람 해석 — 경영관리 · 계급 추가(D-748) · 팀장. 읽기는 repositories/notify-sources.ts.
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listPaymentManagerIds } from "@/repositories/notify-sources";
import type { NotifyTx } from "@/repositories/notifications";

// D-702: 경영관리 = 지급 처리 쓰기 권한 보유 활성 사용자.
export function paymentManagers(today: string, tx?: NotifyTx): Promise<string[]> {
  return listPaymentManagerIds(SYSTEM_VIEWER, today, tx);
}
