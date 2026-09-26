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

// 투영에서 칸이 빠지면 빈 문자열.
export function formatLeavePeriod(leave: LeavePeriodSource): string {
  if (!leave.kind || !leave.startDate) return "";
  const kind = LEAVE_KIND_LABELS[leave.kind] ?? leave.kind;
  const start = leave.startDate.slice(5);
  const end = leave.endDate && leave.endDate !== leave.startDate ? ` ~ ${leave.endDate.slice(5)}` : "";
  const half = leave.half ? ` ${HALF_LABELS[leave.half] ?? leave.half}` : "";
  return `${kind}${half} ${start}${end}`;
}
