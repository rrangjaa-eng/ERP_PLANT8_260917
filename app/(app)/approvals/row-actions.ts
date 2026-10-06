// 05-10 D4: PC 결재함 행 · 「내 차례」 PC 행의 `승인` 셀 판정 — 두 행이 같은 순수 함수 하나를 쓴다.
// 종류가 준 `승인` 막힘 이유(approveBlockedReason)가 있으면 `승인`은 그리지 않고 그 자리에 서버 원문 그대로의 이유 글자를 둔다(행 셀에는 비활성 버튼 옆 이유가 설 자리가 없다).
// 결재 시트 · 문서 화면은 05-01 E3 그대로 `승인` aria-disabled + 이유다.
export function rowApprovalActions(input: { approveBlockedReason: string | null; canReject: boolean }): {
  showApprove: boolean;
  reasonText: string | null;
  showReject: boolean;
} {
  const reasonText = input.approveBlockedReason ? input.approveBlockedReason : null;
  return { showApprove: reasonText === null, reasonText, showReject: input.canReject };
}
