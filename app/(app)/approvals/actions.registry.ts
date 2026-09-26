// 04.1-02: 결재 액션 등록 — 메뉴 approvals · 동작 approve는 누수 스캔의 분류일 뿐이다.
// 승인 · 반려 권한은 결재선(지금 단계 후보)이고 domain/approvals가 매번 다시 판정한다.
import { registerAction } from "@/lib/actions/registry";

// 토스트 재료(다음 담당 이름 · 차감 일수)를 ApprovalActionResultDto로 투영해 돌려준다(B-A1).
registerAction({
  name: "approveAction",
  menu: "approvals",
  action: "approve",
  dtoName: "ApprovalActionResultDto",
});

// 반려 — 토스트 재료(기안자 이름)를 같은 DTO로 투영한다.
registerAction({
  name: "rejectAction",
  menu: "approvals",
  action: "approve",
  dtoName: "ApprovalActionResultDto",
});
