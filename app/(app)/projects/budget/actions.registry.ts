// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
// 누수 스캔(test/integration/leak-scan.test.ts)이 이 파일을 import한다.
import { registerAction } from "@/lib/actions/registry";

// 07-24(SC-21): 예산 이력 읽기 — 금액 줄이라 이력 DTO(budget.amount)를 지난다.
registerAction({
  name: "listBudgetHistoryAction",
  menu: "projects.budget",
  action: "view",
  dtoName: "budgetHistory",
});

// 07-24(D-729): 예산 직접 수정 — 저장 뒤 같은 이력 DTO 첫 쪽을 돌려준다.
registerAction({
  name: "setBudgetManuallyAction",
  menu: "projects.budget",
  action: "write",
  dtoName: "budgetHistory",
});
