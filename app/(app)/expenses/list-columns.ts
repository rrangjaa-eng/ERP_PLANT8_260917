// 지출결의 목록 열 이름 — 표(`expenses-table.tsx`)와 뼈대(`loading.tsx`)가 같은 낱말을 쓴다(뼈대 머리글 = 진짜 열 이름, UI-SPEC S8 로딩).
// 서버 · 클라이언트 양쪽에서 읽을 수 있게 지시문 없는 순수 모듈이다(`approvals/list-columns.ts` 선례).
export const EXPENSE_COLUMN_LABELS = {
  number: "번호",
  title: "프로젝트 · 항목",
  vendor: "거래처",
  amount: "금액",
  payment: "지급 예정",
  drafter: "기안",
  status: "상태",
} as const;

// 상태 보기 select 값 — 보이는 낱말 그대로(`?status=진행 중` · `승인` · `전체`). 견적 줄 표 여러 줄 `Ctrl+E`가 `?status=진행 중`으로 온다.
export const EXPENSE_STATUS_VIEWS = ["진행 중", "승인", "전체"] as const;
export type ExpenseStatusView = (typeof EXPENSE_STATUS_VIEWS)[number];
