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

// 뼈대는 늘 있는 앞 세 열만 그린다 — 금액 · 기안 열은 보는 사람에 따라 서버가 빼므로 고정 낱말을 그리면 「뼈대 머리글 = 진짜 열 이름」이 깨진다.
export const EXPENSE_SKELETON_COLUMNS: (keyof typeof EXPENSE_COLUMN_LABELS)[] = ["number", "title", "vendor"];

// 06-15(UI-SPEC S1 · V-1) — 지급 권한자에게만 더하는 보기 값(`?status=지급 대상`). 지급 권한이 없는 사람의 select에는 없다.
export const PAYMENT_TARGET_VIEW = "지급 대상";
export type ExpenseView = ExpenseStatusView | typeof PAYMENT_TARGET_VIEW;

// S1 열 이름 — 표(`payment-targets-table.tsx`)와 뼈대가 같은 낱말을 쓴다.
export const PAYMENT_TARGET_COLUMN_LABELS = {
  number: "번호",
  title: "프로젝트 · 항목",
  vendor: "거래처",
  method: "지급 방식",
  payment: "예정일",
  evidence: "증빙",
  payable: "지급 총액",
  transfer: "이체액",
  diffReason: "차이 사유",
} as const;

// S1 첫 로드 뼈대 — 보는 사람과 관계없이 늘 있는 열만(금액 열은 노출 설정에 따라 빠진다).
export const PAYMENT_TARGET_SKELETON_COLUMNS: (keyof typeof PAYMENT_TARGET_COLUMN_LABELS)[] = ["number", "title", "vendor", "method", "payment", "evidence"];
