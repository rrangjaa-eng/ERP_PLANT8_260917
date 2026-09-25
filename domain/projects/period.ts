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

// 결과 미리보기 한 줄(Form.Hint) — 저장될 값으로 판정한다(서버 저장과 같은 resolvePeriodSave).
export function previewPeriodChange(input: {
  status: ProjectStatus;
  newStart: string | null;
  newEnd: string | null;
  todayKst: string;
}): string | null {
  const resolved = resolvePeriodSave(input);
  if (resolved.statusChange) return "저장하면 진행으로 돌아감";
  return null;
}
