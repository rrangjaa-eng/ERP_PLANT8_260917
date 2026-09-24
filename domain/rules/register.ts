import { registerGateRule } from "@/domain/rules/gate";

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
