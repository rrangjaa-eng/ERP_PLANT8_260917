import { describe, expect, it } from "vitest";
import { gate, registerGateRule, listGateRules, UnknownGateRuleError } from "@/domain/rules/gate";
import "@/domain/rules/register";

// Phase 4 Task 2 ⑫ — 등록·판정·미등록 규칙 오류. register.ts를 side-effect
// import해 실제 등록된 `project.line-edit`(04-06 — 옛 이진 규칙 교체)로 판정을 단언한다.
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

  it("listGateRules가 등록된 규칙 이름을 돌려준다 — 옛 이진 규칙 project.completed-lock은 없다", () => {
    expect(listGateRules()).toContain("project.line-edit");
    expect(listGateRules()).not.toContain("project.completed-lock");
  });

  describe("project.line-edit (D-47·D-45·D-75)", () => {
    it("완료 상태면 「완료 · 견적 줄 잠김」으로 거부한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "completed" });
      expect(decision).toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
    });

    it("수주중 상태면 통과한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "bidding" });
      expect(decision).toEqual({ allowed: true });
    });

    it("진행 상태면 통과한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "in_progress" });
      expect(decision).toEqual({ allowed: true });
    });

    it("정산 상태면 통과한다(셀 범위는 04-12)", async () => {
      const decision = await gate({}, "project.line-edit", { status: "settling" });
      expect(decision).toEqual({ allowed: true });
    });

    it("미수주 상태면 잠그지 않고 통과한다(D-45)", async () => {
      const decision = await gate({}, "project.line-edit", { status: "lost" });
      expect(decision).toEqual({ allowed: true });
    });
  });
});
