import { registerGateRule } from "@/domain/rules/gate";
import { ALLOWED_TRANSITIONS } from "@/domain/projects/status-transitions";

// Phase 4의 프로젝트 게이트 규칙을 등록하는 한 곳 — 규칙마다 등록한 플랜을
// 주석 한 줄로 적는다(`project.line-edit` 04-06, 뒤 규칙은 04-20·04-22·
// 04-12·04-26·그룹 B).
//
// side-effect import 모듈 — `import "@/domain/rules/register"`로 불러
// 등록만 일으킨다(도메인 등록 사이드이펙트 모듈 규약).

// 04-06(D-47·D-75) — 완료 프로젝트의 견적 줄을 잠근다. 나머지 네 상태는
// 통과한다 — 미수주도 잠그지 않는다(D-45). 정산의 셀 범위는 04-12가 넓힌다.
export type ProjectLineEditCtx = { status: string };

registerGateRule<unknown, ProjectLineEditCtx>({
  name: "project.line-edit",
  check: (_doc, ctx) => {
    if (ctx.status !== "completed") return { allowed: true };
    return { allowed: false, reason: "완료 · 견적 줄 잠김" };
  },
});

// 04-20(D-46·D-75·D-79 · 사용자 D11·D13·D20) — 사람의 전환. 전이표(04-06)에 없는
// 쌍은 갈 수 없고, 쌍마다 정해진 메뉴 권한이 있어야 하며, 업무 범위가 그 프로젝트
// 팀을 덮어야 한다. 권한 사실(메뉴·팀 범위)은 호출자가 읽어 넘긴다 — 규칙은 판정만.
export type ProjectTransitionCtx = {
  from: string;
  to: string;
  actorMenus: { status: boolean; complete: boolean };
  actorCoversTeam: boolean;
};

registerGateRule<unknown, ProjectTransitionCtx>({
  name: "project.transition",
  check: (_doc, ctx) => {
    const transition = ALLOWED_TRANSITIONS.find((entry) => entry.from === ctx.from && entry.to === ctx.to);
    if (!transition) return { allowed: false, reason: "갈 수 없는 상태 · 새로 고침" };
    const hasMenu = transition.menu === "projects.complete" ? ctx.actorMenus.complete : ctx.actorMenus.status;
    if (!hasMenu) return { allowed: false, reason: "상태 바꾸기 권한 없음" };
    if (!ctx.actorCoversTeam) return { allowed: false, reason: "다른 팀 프로젝트 · 상태 바꾸기 권한 없음" };
    return { allowed: true };
  },
});

// 04-20(D-82) — 진행으로 가는 전환은 시작일이 있어야 한다. 이 문자열은
// statusDestinations의 blockedReason으로 화면에 그대로 간다(UI-SPEC rev 5 원문).
export type ProjectStartDateRequiredCtx = { to: string; startDate: string | null };

registerGateRule<unknown, ProjectStartDateRequiredCtx>({
  name: "project.start-date-required",
  check: (_doc, ctx) => {
    if (ctx.to !== "in_progress" || ctx.startDate) return { allowed: true };
    return { allowed: false, reason: "시작일 없음 · 기간 적기" };
  },
});
