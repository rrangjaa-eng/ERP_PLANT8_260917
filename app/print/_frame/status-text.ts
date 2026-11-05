// 07.4-01 D-7411: 번호 줄 상태 글자 — 승인 완료가 아닌 서류만. 화면과 같은 낱말 · 같은 어순(`{단계} 결재 중`, leaveStatusWord · 지출결의 목록 statusWord)이고
// 보는 사람 기준 낱말(`내 결재` 등)은 종이에 쓰지 않는다. 순수 함수 — import 없음. 단계 이름은 부르는 쪽이 statusStepLabel을 지나 넘긴다.
// closed: 지출결의 종결(상세 화면 statusWord `종결`)은 결재 상태보다 먼저 본다. 연차 · 정산은 넘기지 않는다.
export function documentStatusText(status: string | undefined, currentStepLabel: string | null, closed = false): string | null {
  if (closed) return "종결";
  switch (status) {
    case "approved":
    case "self_approved":
      return null;
    case "submitted":
    case "in_review":
      return currentStepLabel ? `${currentStepLabel} 결재 중` : "결재 중";
    case "rejected":
      return "반려";
    case "withdrawn":
      return "회수";
    default:
      // draft · 결재 인스턴스 없음 · 모르는 값
      return "작성 중";
  }
}
