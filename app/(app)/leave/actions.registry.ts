// 04.1-02: 연차 액션 등록 — actions.ts("use server", server-only 의존 체인)와 분리(03-03 선례).
// 메뉴 · 동작은 누수 스캔 분류다. 판정은 domain(assertLeaveWrite · 기안자 판정)이 한다.
import { registerAction } from "@/lib/actions/registry";

// 토스트 재료(다음 담당 이름)를 ApprovalActionResultDto로 투영해 돌려준다(B-A1).
registerAction({
  name: "submitLeaveAction",
  menu: "leave",
  action: "write",
  dtoName: "ApprovalActionResultDto",
});
