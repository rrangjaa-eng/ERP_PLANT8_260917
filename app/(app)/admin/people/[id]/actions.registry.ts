// 04.1-06 Task 3: 사람 상세 연차 섹션 액션 등록 — actions.ts("use server", server-only 의존 체인)와 분리(03-03 선례).
// 메뉴 · 동작은 누수 스캔 분류다. 판정은 도메인(admin.people write)이 한다. 셋 다 DTO를 돌려주지 않는다.
import { registerAction } from "@/lib/actions/registry";

registerAction({
  name: "setHireDateAction",
  menu: "admin.people",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "setResignationDateAction",
  menu: "admin.people",
  action: "write",
  dtoName: null,
});

registerAction({
  name: "addLeaveAdjustmentAction",
  menu: "admin.people",
  action: "write",
  dtoName: null,
});

// 06.5-04: 분류는 누수 스캔용이다 — 실제 게이트는 도메인 `canManagePayoutAccount`(`expenses.payments` 쓰기 ∧ `admin.people` 보기,
// REVIEWS EP3-B15). `admin.people` 쓰기만으로는 통과하지 않는다.
registerAction({
  name: "updatePersonPayoutAccountAction",
  menu: "admin.people",
  action: "write",
  dtoName: null,
});
