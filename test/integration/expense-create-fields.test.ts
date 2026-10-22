import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createExpenseFromLines, saveExpenseDraft } from "@/domain/expenses";
import { listCodeItems } from "@/repositories/code-tables";
import { setupExpenseProject } from "./fixtures/expenses";

// 05-16 — `/expenses/new`에서 비고 · 지급 예정일 · 지급 방식을 적은 뒤 견적 줄을 고르면 그 값이 만들어지는 작성 중 문서에 같이 저장된다
// (줄 값만으로 만들고 적은 칸을 지우던 것을 고침). 저장은 insert 한 번이라 값과 문서가 함께 생기거나 함께 안 생긴다.
// 07-01(D-714 · D-742 계약 변경): 지급 예정일 수동 지정은 지급 권한자 길뿐 — 작성자가 보낸 지급 예정일은 형식만 검증하고 칸에 쓰지 않는다.

async function rowOf(expenseId: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!row) throw new Error("문서가 없습니다");
  return row;
}

async function lastPaymentMethod(): Promise<string> {
  const items = await listCodeItems(SYSTEM_VIEWER, { tableKey: "payment_method", scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const value = items.at(-1)?.value;
  if (!value) throw new Error("지급 방식 코드가 없습니다");
  return value;
}

describe("줄에서 만들 때 적어 둔 칸을 같이 저장", () => {
  it("비고 · 지급 방식은 새 작성 중 문서에 저장되고, 지급 예정일을 보내도 칸은 NULL(D-714)", async () => {
    const fx = await setupExpenseProject();
    const paymentMethod = await lastPaymentMethod();
    const result = await createExpenseFromLines(fx.pm, {
      lineIds: [fx.lines.withVendor],
      fields: { note: "현장 정산 건", scheduledPaymentDate: "2026-11-20", paymentMethod },
    });
    const expenseId = result.created[0]?.expenseId ?? "";
    const row = await rowOf(expenseId);
    expect(row.note).toBe("현장 정산 건");
    expect(row.scheduledPaymentDate).toBeNull();
    expect(row.paymentMethod).toBe(paymentMethod);
    expect(row.quoteLineId).toBe(fx.lines.withVendor);
  });

  it("칸 없이 부르면 비고 · 지급 예정일은 비어 있다(기존 동작)", async () => {
    const fx = await setupExpenseProject();
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const row = await rowOf(result.created[0]?.expenseId ?? "");
    expect(row.note).toBeNull();
    expect(row.scheduledPaymentDate).toBeNull();
  });

  it("null · 생략한 칸은 줄 기본값 그대로다(지급 방식은 첫 코드)", async () => {
    const fx = await setupExpenseProject();
    const first = (await listCodeItems(SYSTEM_VIEWER, { tableKey: "payment_method", scope: { rows: "all", includeArchived: false }, includeInactive: false }))[0]?.value;
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "비고만", scheduledPaymentDate: null, paymentMethod: null } });
    const row = await rowOf(result.created[0]?.expenseId ?? "");
    expect(row.note).toBe("비고만");
    expect(row.scheduledPaymentDate).toBeNull();
    expect(row.paymentMethod).toBe(first);
  });

  it("일반 저장과 같은 검증 — 날짜 형식이 틀리거나 비고가 너무 길면 거부하고 문서를 만들지 않는다", async () => {
    const fx = await setupExpenseProject();
    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { scheduledPaymentDate: "2026/11/20" } })).rejects.toThrow();
    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "가".repeat(1001) } })).rejects.toThrow();
    const none = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.quoteLineId, fx.lines.withVendor));
    expect(none).toHaveLength(0);
  });

  it("이미 그 줄의 작성 중 문서가 있으면 그 문서를 그대로 연다(적어 둔 칸으로 덮어쓰지 않는다)", async () => {
    const fx = await setupExpenseProject();
    const first = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "처음 비고" } });
    const second = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "나중 비고" } });
    expect(second.created[0]?.expenseId).toBe(first.created[0]?.expenseId);
    expect((await rowOf(first.created[0]?.expenseId ?? "")).note).toBe("처음 비고");
  });

  it("임시 저장(saveExpenseDraft)에 지급 예정일을 실어도 칸은 그대로 — 새 문서는 NULL, D-740 기존 값은 그 값 · 형식 오류는 여전히 거부", async () => {
    const fx = await setupExpenseProject();
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = result.created[0]?.expenseId ?? "";
    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await rowOf(expenseId)).version, fields: { note: "고친 비고", scheduledPaymentDate: "2026-07-10" } });
    expect(await rowOf(expenseId)).toMatchObject({ note: "고친 비고", scheduledPaymentDate: null });

    await db.update(expenses).set({ scheduledPaymentDate: "2026-07-17" }).where(eq(expenses.id, expenseId));
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: saved.version, fields: { scheduledPaymentDate: "2026-07-10" } });
    expect((await rowOf(expenseId)).scheduledPaymentDate).toBe("2026-07-17");

    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await rowOf(expenseId)).version, fields: { scheduledPaymentDate: "2026/07/10" } })).rejects.toThrow();
  });
});
