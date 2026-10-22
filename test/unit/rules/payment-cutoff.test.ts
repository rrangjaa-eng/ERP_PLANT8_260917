import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { PaymentCutoffCtx } from "@/domain/rules/register";

// 07-01 Task 2(D-703 · J7 · K30 · D-742 · R15): gate `payment.cutoff`는 그 주 소속만 정한다. 원래 지급일의 마감을 넘겼는지는 pushReason으로만 읽고,
// 밀린 뒤 주의 마감(cutoffAt)으로 다시 비교하지 않는다 — 그러면 다음 주로 민 건이 통과한다.
const kst = (at: string) => new Date(`${at}:00+09:00`);
const ctx = (over: Partial<PaymentCutoffCtx>): PaymentCutoffCtx => ({ manual: false, approvedAt: kst("2026-07-09T10:00"), pushReason: null, ...over });

describe("gate payment.cutoff", () => {
  it("K30: 승인 시각은 밀린 날의 마감(07-16 14:00)보다 이르지만 pushReason cutoff → 마감 지나 밀림", async () => {
    await expect(gate({}, "payment.cutoff", ctx({ approvedAt: kst("2026-07-09T14:01"), pushReason: "cutoff" }))).resolves.toEqual({ allowed: false, reason: "마감 지나 밀림" });
  });

  it("수동 지정이면 승인 전 · cutoff여도 통과(D-742)", async () => {
    await expect(gate({}, "payment.cutoff", ctx({ manual: true, approvedAt: null, pushReason: "cutoff" }))).resolves.toEqual({ allowed: true });
  });

  it("승인 전(approvedAt null) → 결재 중", async () => {
    await expect(gate({}, "payment.cutoff", ctx({ approvedAt: null }))).resolves.toEqual({ allowed: false, reason: "결재 중" });
  });

  it("pushReason null · no-slot → 통과", async () => {
    await expect(gate({}, "payment.cutoff", ctx({ pushReason: null }))).resolves.toEqual({ allowed: true });
    await expect(gate({}, "payment.cutoff", ctx({ pushReason: "no-slot" }))).resolves.toEqual({ allowed: true });
  });

  it("R15: 예정일 계산 실패 행 → 예정일 계산 실패(수동이어도)", async () => {
    await expect(gate({}, "payment.cutoff", ctx({ failed: true, manual: true }))).resolves.toEqual({ allowed: false, reason: "예정일 계산 실패" });
  });
});
