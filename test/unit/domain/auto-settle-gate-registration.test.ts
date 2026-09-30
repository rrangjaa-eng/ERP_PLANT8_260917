import { describe, expect, it } from "vitest";
import { listGateRules } from "@/domain/rules/gate";
import "@/domain/projects/auto-transition";

// applyAutoSettlement만 부르는 그래프(Phase 7 예약 작업)에서 규칙이 없으면 gate가 던지고 fail-open이 삼킨다 — 04-53.
describe("자동 정산 규칙 자기 등록 (04-53 · T-04-391)", () => {
  it("auto-transition만 import한 그래프에서 project.auto-settle이 등록돼 있다", () => {
    expect(listGateRules()).toContain("project.auto-settle");
  });
});
