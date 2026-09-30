// 04.1-02 ④ · B-A1: 승인 토스트는 액션이 돌려준 투영된 필드로만 조립한다 — 빠진 조각은 뺀다.
export function approveToast(data: { final: boolean; deductedDays?: string | null; nextHolderNames?: string | null }): string {
  if (data.final) return data.deductedDays ? `승인 · 최종 승인 · ${data.deductedDays} 차감` : "승인 · 최종 승인";
  return data.nextHolderNames ? `승인 · 결재 요청됨 → ${data.nextHolderNames}` : "승인 · 결재 요청됨";
}
