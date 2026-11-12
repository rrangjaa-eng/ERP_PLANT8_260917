// 07.2-17(PU5 · D-7217~D-7219) — 정보 면 4칸(행사명 · 고객사 · 담당 팀 · 담당 PM)의 순수 판정. 화면(입구 · PM 후보 회색)과
// 서버(합성 저장 잠근 tx)가 같은 함수를 부른다 — 리포지토리 · DB를 import하지 않는다(period.ts와 같은 꼴).
// 260907 `O: server/src/projects.ts:3143-3260`(기본 정보 수정)과 같은 방향 — 다름: 상태로 막지 않고(D-7218 완료도 고침),
// 돈 문서가 붙으면 고객사 · 담당 팀만 잠근다(D-7219).

export type InfoRights = "edit" | "none";

export type InfoValues = { name: string; clientId: string; teamId: string; pmUserId: string };

export type InfoField = "name" | "client" | "team" | "pm";

export type InfoFieldError = { field: InfoField; reason: string };

// 등록 검증과 같은 문구(app/(app)/projects/actions.ts createProjectAction) — 등록에 길이 상한이 없어 여기에도 두지 않는다.
export const INFO_NAME_EMPTY = "프로젝트명 필요 · 프로젝트명 입력";
export const INFO_MONEY_LOCKED = "고객사 · 담당 팀 잠김 · 돈 문서 연결";
export const INFO_PM_NOT_MEMBER = "담당 PM 소속 아님 · PM 다시 고르기";

// 권리 = `projects.info` 쓰기 + (담당 PM 또는 업무 범위가 프로젝트 팀을 덮음). 상태와 무관하다(D-7218).
export function infoEditRights(input: { canEditInfo: boolean; isAssignedPm: boolean; actorCoversTeam: boolean }): InfoRights {
  if (!input.canEditInfo) return "none";
  return input.isAssignedPm || input.actorCoversTeam ? "edit" : "none";
}

// PM 자격 = 바뀐 담당 팀에 오늘 발령된 사람 또는 그 프로젝트 참여자.
export function pmEligible(input: { teamIdAfter: string; memberTeamId: string | null; participant: boolean }): boolean {
  return input.participant || input.memberTeamId === input.teamIdAfter;
}

// 칸 오류 목록(빈 배열 = 통과). PM 자격은 팀 또는 PM이 바뀐 때만 잰다 — 행사명만 고치는 저장이 옛 배정 때문에 막히지 않게.
export function validateInfoChange(input: { before: InfoValues; after: InfoValues; moneyCount: number; pmEligibleAfter: boolean }): InfoFieldError[] {
  const { before, after } = input;
  const errors: InfoFieldError[] = [];
  if (after.name.trim() === "") errors.push({ field: "name", reason: INFO_NAME_EMPTY });
  if (input.moneyCount > 0 && after.clientId !== before.clientId) errors.push({ field: "client", reason: INFO_MONEY_LOCKED });
  if (input.moneyCount > 0 && after.teamId !== before.teamId) errors.push({ field: "team", reason: INFO_MONEY_LOCKED });
  const assignmentChanged = after.teamId !== before.teamId || after.pmUserId !== before.pmUserId;
  if (assignmentChanged && !input.pmEligibleAfter) errors.push({ field: "pm", reason: INFO_PM_NOT_MEMBER });
  return errors;
}
