import { UserFacingError } from "@/lib/actions/user-facing-error";

// Phase 4 — 게이트 단일 진입점(`domain/rules.gate`). 이후 페이즈(증빙 필수·
// 마감·legacy 면제)가 전부 이 진입점을 지난다(04-RESEARCH.md Don't Hand-Roll).
// 화면은 이 함수가 돌려준 `reason` 문자열을 그대로 쓰고 상태 이름 분기를
// 두지 않는다.
export type GateDecision = { allowed: true } | { allowed: false; reason: string };

export type GateRule<Doc, Ctx> = {
  name: string;
  check: (doc: Doc, ctx: Ctx) => GateDecision | Promise<GateDecision>;
};

// 등록되지 않은 규칙 이름으로 gate()를 부르면 조용히 통과하지 않고 던진다
// — 규칙 누락이 기본 허용이 되지 않는다.
export class UnknownGateRuleError extends Error {}

// Server Action 층에서 게이트 거부를 사용자에게 그대로 보여줄 때 쓰는
// 표식 오류 — `handleServerError` 화이트리스트(UserFacingError 계열)를 탄다.
export class GateBlockedError extends UserFacingError {}

const registry: GateRule<unknown, unknown>[] = [];

export function registerGateRule<Doc, Ctx>(rule: GateRule<Doc, Ctx>): void {
  registry.push(rule as GateRule<unknown, unknown>);
}

export function listGateRules(): string[] {
  return registry.map((rule) => rule.name);
}

export async function gate<Doc, Ctx>(doc: Doc, ruleName: string, ctx: Ctx): Promise<GateDecision> {
  const rule = registry.find((entry) => entry.name === ruleName) as GateRule<Doc, Ctx> | undefined;
  if (!rule) {
    throw new UnknownGateRuleError(`등록되지 않은 게이트 규칙입니다: ${ruleName}`);
  }
  return rule.check(doc, ctx);
}
