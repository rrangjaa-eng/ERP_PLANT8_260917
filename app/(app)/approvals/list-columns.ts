// 결재함 표의 열 이름 — 표(`inbox-table.tsx`)와 뼈대(`loading.tsx`)가 같은 낱말을 쓴다(뼈대 머리글 = 진짜 열 이름, UI-SPEC loading).
// 서버 · 클라이언트 양쪽에서 읽을 수 있게 지시문 없는 순수 모듈이다.
export const INBOX_COLUMN_LABELS = {
  document: "문서",
  drafter: "기안",
  days: "일수",
  status: "상태",
  actions: "행동",
} as const;

export type InboxColumnKey = keyof typeof INBOX_COLUMN_LABELS;

export const INBOX_SKELETON_COLUMNS: { key: InboxColumnKey; align?: "right" }[] = [
  { key: "document" },
  { key: "drafter" },
  { key: "days", align: "right" },
  { key: "status" },
  { key: "actions" },
];
