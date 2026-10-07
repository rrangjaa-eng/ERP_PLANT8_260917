import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { ExpenseLinePaidLockCtx } from "@/domain/rules/register";
import { linkedDocumentReason } from "@/domain/quotes/edit-scope";

// 06-13(EXP-06 · D-609 · D-606) — 지출결의 쪽 지급 완료 잠금. 05 문이 지급 완료 문서로 닫혔을 때만 거부한다 —
// 분할 지급으로 열린 문(남은 금액 > 0)은 막지 않고, 지급 취소된 문서는 지급 전으로 센다.

function decide(ctx: ExpenseLinePaidLockCtx) {
  return gate(null, "expense.line-paid-lock", ctx);
}

describe("expense.line-paid-lock", () => {
  it("문 closed + 문을 닫은 문서에 살아 있는 지급 → `지급 완료 {번호} · 새 지출결의 없음`", async () => {
    await expect(decide({ door: "closed", docs: [{ number: "26001-0004", installment: false, paid: true }] })).resolves.toEqual({
      allowed: false,
      reason: "지급 완료 26001-0004 · 새 지출결의 없음",
    });
  });

  it("문 open(분할 남은 금액 > 0) + 지급된 회차 → 통과", async () => {
    await expect(decide({ door: "open", docs: [{ number: "26001-0004", installment: true, paid: true }] })).resolves.toEqual({ allowed: true });
  });

  it("지급 취소된 문서만(살아 있는 지급 없음) → 이 규칙은 통과 — 05 문 이유가 남는다", async () => {
    await expect(decide({ door: "closed", docs: [{ number: "26001-0004", installment: false, paid: false }] })).resolves.toEqual({ allowed: true });
  });

  it("분할 회차 합이 실행가에 닿아 닫힌 문 — 지급된 마지막 회차의 번호", async () => {
    await expect(
      decide({
        door: "closed",
        docs: [
          { number: "26001-0001", installment: true, paid: true },
          { number: "26001-0002", installment: true, paid: true },
        ],
      }),
    ).resolves.toEqual({ allowed: false, reason: "지급 완료 26001-0002 · 새 지출결의 없음" });
  });
});

describe("linkedDocumentReason — 지급 완료 갈래(S-F4)", () => {
  it("`{ paid: true }` → `지출결의 {번호} 지급 완료 · 고치려면 새 차수`", () => {
    expect(linkedDocumentReason("26001-0004", { paid: true })).toBe("지출결의 26001-0004 지급 완료 · 고치려면 새 차수");
  });

  it("`paid` 없이는 05 문자열 그대로", () => {
    expect(linkedDocumentReason("26001-0004")).toBe("지출결의 26001-0004 연결됨 · 고치려면 새 차수");
    expect(linkedDocumentReason("26001-0004", { paid: false })).toBe("지출결의 26001-0004 연결됨 · 고치려면 새 차수");
  });
});
