import { registerGateRule } from "@/domain/rules/gate";

// Phase 4 Task 2 ⑥ — 이 플랜이 등록하는 게이트 규칙은 하나뿐이다
// (`project.completed-lock`). 나머지(고객 승인·기간 필수 등)는 04-06.
//
// D-47: 완료(정산) 뒤에도 경영관리가 '견적 외 비용' 줄로 원가를 보정할 수
// 있다 — 그 예외 자리가 `ctx.actorCanAddOutOfQuoteLine`이다. 실제로 그
// 플래그를 누구에게 참으로 세울지(경영관리 계급 판정)는 04-06이 채운다.
// 이 플랜은 게이트 판정 형태만 잠근다.
export type ProjectCompletedLockCtx = {
  status: string;
  actorCanAddOutOfQuoteLine?: boolean;
};

// side-effect import 모듈 — `import "@/domain/rules/register"`로 불러
// 등록만 일으킨다(도메인 등록 사이드이펙트 모듈 규약).
registerGateRule<unknown, ProjectCompletedLockCtx>({
  name: "project.completed-lock",
  check: (_doc, ctx) => {
    if (ctx.status !== "settled") return { allowed: true };
    if (ctx.actorCanAddOutOfQuoteLine) return { allowed: true };
    return { allowed: false, reason: "완료(정산) · 견적 줄이 잠김" };
  },
});
