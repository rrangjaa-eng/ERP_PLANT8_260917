// 프로젝트 목록 표의 열 이름 — 표(`projects-table.tsx`)와 뼈대(`loading.tsx`)가 같은 낱말을 쓴다(뼈대 머리글 = 진짜 열 이름, UI-SPEC loading).
// 서버 · 클라이언트 양쪽에서 읽을 수 있게 지시문 없는 순수 모듈이다.
export const PROJECT_COLUMN_LABELS = {
  number: "번호",
  clientName: "클라이언트",
  name: "프로젝트명",
  pmUserName: "담당 PM",
  teamName: "팀",
  period: "기간",
  revenueKrw: "매출",
  quoteAmountKrw: "견적",
  executionAmountKrw: "실행가",
  profitBasis: "기준",
  profitKrw: "수익금",
  profitRate: "수익률",
  status: "상태",
} as const;

export type ProjectColumnKey = keyof typeof PROJECT_COLUMN_LABELS;

// 뼈대에 그리는 열 — 어느 계급이든 있는 열만(금액 열은 계급이 갈라 견적 하나만 대표로 둔다).
export const PROJECT_SKELETON_COLUMNS: { key: ProjectColumnKey; align?: "right" }[] = [
  { key: "number" },
  { key: "name" },
  { key: "pmUserName" },
  { key: "period" },
  { key: "quoteAmountKrw", align: "right" },
  { key: "status" },
];
