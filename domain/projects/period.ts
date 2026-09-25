import type { ProjectStatus } from "@/domain/projects/status-transitions";

// 04-22(D-80 · D-82 · S13 · 사용자 D14·D11·D20 · 사용자 결정 2026-09-25 「기간만 수정」) — 상세 기간 칸의
// 순수 함수. 화면(기간 칸 힌트)과 서버(합성 저장)가 같은 함수를 부른다 — 리포지토리·DB를 import하지 않는다.
// 팀장 이상의 권리는 `projects.period` 쓰기(canEditPeriod) + 업무 범위가 프로젝트 팀을 덮을 때(actorCoversTeam)다.
// `projects` 쓰기 전체는 주지 않는다 — 견적 줄·매출 등 나머지 칸은 이 권리와 무관하게 막힌다.

export type PeriodRights = "lead" | "pm" | "none";

export function periodEditRights(input: {
  status: ProjectStatus;
  isAssignedPm: boolean;
  canWrite: boolean;
  canEditPeriod: boolean;
  actorCoversTeam: boolean;
}): PeriodRights {
  if (input.status === "completed") return "none";
  if (input.canEditPeriod && input.actorCoversTeam) return "lead";
  if (input.status !== "settling" && input.isAssignedPm && input.canWrite) return "pm";
  return "none";
}

// D-82 — 진행부터는 시작일이 있어야 하고 비운 종료일은 시작일로 저장된다.
const PROGRESSED: readonly ProjectStatus[] = ["in_progress", "settling", "completed"];

export type PeriodSave = {
  startDate: string | null;
  endDate: string | null;
  statusChange?: { from: "settling"; to: "in_progress" };
};

// 저장될 값. 정산에서 종료일을 오늘(KST) 이후로 늦추면 진행으로 되돌린다(D-80).
export function resolvePeriodSave(input: {
  status: ProjectStatus;
  newStart: string | null;
  newEnd: string | null;
  todayKst: string;
}): PeriodSave {
  const startDate = input.newStart;
  const endDate = input.newEnd ?? (PROGRESSED.includes(input.status) ? startDate : null);
  if (input.status === "settling" && endDate !== null && endDate >= input.todayKst) {
    return { startDate, endDate, statusChange: { from: "settling", to: "in_progress" } };
  }
  return { startDate, endDate };
}

// A-22: 형식(YYYY-MM-DD) 뒤 달력 왕복 — 2026-02-30은 UTC로 3월 2일이 되어 되돌아오지 않는다.
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

export type PeriodFieldError = { field: "start" | "end"; reason: string };

export const FORMAT_ERROR = "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요";

// 칸별 오류 — 형식은 입력 칸 값으로, 나머지는 저장될 값(resolvePeriodSave 결과)으로 판정한다(A-02:
// 종료일을 비워 과거 시작일로 저장되게 하는 우회도 「종료일이 오늘보다 빠름」이다).
export function validatePeriodChange(input: {
  status: ProjectStatus;
  rights: PeriodRights;
  start: string | null;
  end: string | null;
  todayKst: string;
  teamLeadName: string | null;
}): PeriodFieldError[] {
  const formatErrors: PeriodFieldError[] = [];
  if (input.start !== null && !isCalendarDate(input.start)) formatErrors.push({ field: "start", reason: FORMAT_ERROR });
  if (input.end !== null && !isCalendarDate(input.end)) formatErrors.push({ field: "end", reason: FORMAT_ERROR });
  if (formatErrors.length > 0) return formatErrors;

  const resolved = resolvePeriodSave({ status: input.status, newStart: input.start, newEnd: input.end, todayKst: input.todayKst });
  if (PROGRESSED.includes(input.status) && resolved.startDate === null) {
    return [{ field: "start", reason: "진행부터는 시작일이 있어야 합니다 · 시작일을 적어 주세요" }];
  }
  if (resolved.startDate !== null && resolved.endDate !== null && resolved.endDate < resolved.startDate) {
    return [{ field: "end", reason: "종료일이 시작일보다 빠릅니다 · 종료일을 고쳐 주세요" }];
  }
  // 상태 전환은 팀장의 일이다(D-46) — 진행의 PM은 기간 칸으로 정산을 일으킬 수 없다(CEO-D14).
  if (input.status === "in_progress" && input.rights === "pm" && resolved.endDate !== null && resolved.endDate < input.todayKst) {
    const reason = input.teamLeadName
      ? `종료일이 오늘보다 빠름 · 앞당기기는 팀장 ${input.teamLeadName}`
      : "종료일이 오늘보다 빠름";
    return [{ field: "end", reason }];
  }
  return [];
}

// 04-15(PR #38 /qa 「날짜 순서」) — 등록(수주중)의 기간 판정. 상세 기간 칸과 같은 판정 · 같은 문구 한 곳을 쓴다 —
// 수주중에는 진행 이후 규칙(시작일 필수 · PM 종료일 제한)이 걸리지 않아 형식 · 달력 · 순서만 남는다(권리 · 오늘 날짜는 쓰이지 않는다).
export function validateNewProjectPeriod(input: { start: string | null; end: string | null }): PeriodFieldError[] {
  return validatePeriodChange({ status: "bidding", rights: "none", start: input.start, end: input.end, todayKst: "", teamLeadName: null });
}

// 결과 미리보기 한 줄(Form.Hint) — 저장될 값으로 판정한다(서버 저장과 같은 resolvePeriodSave).
export function previewPeriodChange(input: {
  status: ProjectStatus;
  newStart: string | null;
  newEnd: string | null;
  todayKst: string;
}): string | null {
  if ([input.newStart, input.newEnd].some((value) => value !== null && !isCalendarDate(value))) return null;
  const resolved = resolvePeriodSave(input);
  if (resolved.statusChange) return "저장하면 진행으로 돌아감";
  if (input.status === "in_progress" && resolved.endDate !== null && resolved.endDate < input.todayKst) {
    return "저장하면 정산이 됨";
  }
  if (PROGRESSED.includes(input.status) && input.newEnd === null && resolved.endDate !== null) {
    return "종료일이 비어 시작일로 저장됨";
  }
  return null;
}
