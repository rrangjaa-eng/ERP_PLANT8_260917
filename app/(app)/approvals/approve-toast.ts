// 04.1-02 ④ · B-A1: 승인 토스트는 액션이 돌려준 투영된 필드로만 조립한다 — 빠진 조각은 뺀다.
// 05-01(Round 4 D8): 최종 갈래 꼬리 = 차감 일수(04.1) → 없으면 종류 요약의 finalNote → 둘 다 없으면 꼬리 없음.
export function approveToast(data: {
  final: boolean;
  deductedDays?: string | null;
  nextHolderNames?: string | null;
  finalNote?: string | null;
}): string {
  if (data.final) {
    if (data.deductedDays) return `승인 · 최종 승인 · ${data.deductedDays} 차감`;
    return data.finalNote ? `승인 · 최종 승인 · ${data.finalNote}` : "승인 · 최종 승인";
  }
  return data.nextHolderNames ? `승인 · 결재 요청됨 → ${data.nextHolderNames}` : "승인 · 결재 요청됨";
}
