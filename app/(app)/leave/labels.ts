// 04.1 UI-SPEC Copywriting 「표시 — 결재함 행」 · S3 머리 — 연차 종류 · 기간 글자(`종일 09-18 ~ 09-20` ·
// `반차 오전 09-22` · `재택 09-24`). 결재함 · 신청 폼 · 문서 화면이 같은 글자를 쓴다.
export const LEAVE_KIND_LABELS: Record<string, string> = {
  full_day: "종일",
  half_day: "반차",
  quarter_day: "반반차",
  remote: "재택",
};

export const HALF_LABELS: Record<string, string> = { am: "오전", pm: "오후" };

export type LeavePeriodSource = {
  kind?: string;
  startDate?: string;
  endDate?: string;
  half?: string | null;
};

// 표 · 접힌 줄의 날짜 — 같은 해면 `09-18`, 다른 해면 ISO(UI-SPEC Typography · 04.1-06 DOM 감사 #5).
// 올해를 주지 않으면 늘 `09-18`(올해와 비교하지 않는 호출부).
export function formatTableDate(isoDate: string, thisYear?: number): string {
  return thisYear !== undefined && isoDate.slice(0, 4) !== String(thisYear) ? isoDate : isoDate.slice(5);
}

// 투영에서 칸이 빠지면 빈 문자열.
export function formatLeavePeriod(leave: LeavePeriodSource, thisYear?: number): string {
  if (!leave.kind || !leave.startDate) return "";
  const kind = LEAVE_KIND_LABELS[leave.kind] ?? leave.kind;
  const start = formatTableDate(leave.startDate, thisYear);
  const end = leave.endDate && leave.endDate !== leave.startDate ? ` ~ ${formatTableDate(leave.endDate, thisYear)}` : "";
  const half = leave.half ? ` ${HALF_LABELS[leave.half] ?? leave.half}` : "";
  return `${kind}${half} ${start}${end}`;
}

// 04.6-18: 연차 목록 표의 열 이름 — 표(`(list)/leave-table.tsx`)와 뼈대(`(list)/loading.tsx`)가 같은 낱말을 쓴다(뼈대 머리글 = 진짜 열 이름).
// 서버 · 클라이언트 양쪽에서 읽을 수 있게 이 순수 모듈에 둔다(클라이언트 경계 파일의 상수는 서버가 값으로 읽지 못한다).
export const LEAVE_LIST_COLUMN_LABELS = {
  number: "번호",
  period: "종류 · 기간",
  days: "일수",
  status: "상태",
  requestedOn: "신청일",
  note: "비고",
} as const;

export const LEAVE_LIST_SKELETON_COLUMNS: { key: keyof typeof LEAVE_LIST_COLUMN_LABELS; align?: "right" }[] = [
  { key: "number" },
  { key: "period" },
  { key: "days", align: "right" },
  { key: "status" },
  { key: "requestedOn" },
  { key: "note" },
];
