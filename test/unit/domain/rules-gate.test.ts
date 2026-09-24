import { describe, expect, it } from "vitest";
import { gate, registerGateRule, listGateRules, UnknownGateRuleError } from "@/domain/rules/gate";
import "@/domain/rules/register";

// Phase 4 Task 2 ⑫ — 등록·판정·미등록 규칙 오류. register.ts를 side-effect
// import해 실제 등록된 `project.completed-lock` 하나로 판정을 단언한다.
describe("domain/rules/gate", () => {
  it("등록된 규칙 이름으로 부르면 판정 함수를 그대로 실행한다", async () => {
    registerGateRule<{ id: string }, { allow: boolean }>({
      name: "test.always-configurable",
      check: (_doc, ctx) => (ctx.allow ? { allowed: true } : { allowed: false, reason: "막힘" }),
    });

    await expect(gate({ id: "1" }, "test.always-configurable", { allow: true })).resolves.toEqual({
      allowed: true,
    });
    await expect(gate({ id: "1" }, "test.always-configurable", { allow: false })).resolves.toEqual({
      allowed: false,
      reason: "막힘",
    });
  });

  it("등록되지 않은 규칙 이름으로 부르면 조용히 통과하지 않고 던진다", async () => {
    await expect(gate({}, "없는-규칙", {})).rejects.toBeInstanceOf(UnknownGateRuleError);
  });

  it("listGateRules가 등록된 규칙 이름을 돌려준다", () => {
    expect(listGateRules()).toContain("project.completed-lock");
  });

  describe("project.completed-lock (D-47)", () => {
    it("완료(정산) 상태면 거부하고 이유 문자열을 돌려준다", async () => {
      const decision = await gate({}, "project.completed-lock", { status: "settled", actorRole: "role-pm" });
      expect(decision.allowed).toBe(false);
      expect(typeof (decision as { reason: string }).reason).toBe("string");
    });

    it("수주중 상태면 통과한다", async () => {
      const decision = await gate({}, "project.completed-lock", { status: "bidding" });
      expect(decision).toEqual({ allowed: true });
    });

    it("완료(정산)여도 actorCanAddOutOfQuoteLine이 참이면 통과한다(D-47 경영관리 예외 자리)", async () => {
      const decision = await gate({}, "project.completed-lock", {
        status: "settled",
        actorCanAddOutOfQuoteLine: true,
      });
      expect(decision).toEqual({ allowed: true });
    });
  });
});
