import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createExpenseFromLines, createTeamExpenseDraft, ExpenseFieldError, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { REQUESTED_DATE_PASSED, REQUESTED_DATE_PAST, REQUESTED_REASON_REQUIRED } from "@/domain/expenses/gate";
import { seoulToday } from "@/lib/dates";
import { listCodeItems } from "@/repositories/code-tables";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-16 — `/expenses/new`에서 비고 · 지급 예정일 · 지급 방식을 적은 뒤 견적 줄을 고르면 그 값이 만들어지는 작성 중 문서에 같이 저장된다
// (줄 값만으로 만들고 적은 칸을 지우던 것을 고침). 저장은 insert 한 번이라 값과 문서가 함께 생기거나 함께 안 생긴다.
// 07-01(D-714 · D-742 계약 변경): 지급 예정일 수동 지정은 지급 권한자 길뿐. 07-16(B-P1-1): 작성자 입력에는 지급 예정일 키가 없고 희망 지급일 · 희망 사유
// 한 쌍을 싣는다 — 아래 사례는 같은 뜻(작성자 날짜는 예정일 칸에 쓰이지 않는다)을 희망 칸으로 옮긴 것이다.

function daysFromToday(days: number): string {
  const at = new Date(`${seoulToday()}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

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
  it("비고 · 희망 지급일 · 희망 사유 · 지급 방식은 새 작성 중 문서에 저장되고 지급 예정일 칸은 NULL(D-714)", async () => {
    const fx = await setupExpenseProject();
    const paymentMethod = await lastPaymentMethod();
    const hope = daysFromToday(10);
    const result = await createExpenseFromLines(fx.pm, {
      lineIds: [fx.lines.withVendor],
      fields: { note: "현장 정산 건", requestedPaymentDate: hope, requestedPaymentReason: "  행사 전 선금 ", paymentMethod },
    });
    const expenseId = result.created[0]?.expenseId ?? "";
    const row = await rowOf(expenseId);
    expect(row.note).toBe("현장 정산 건");
    expect(row).toMatchObject({ requestedPaymentDate: hope, requestedPaymentReason: "행사 전 선금" });
    expect(row.scheduledPaymentDate).toBeNull();
    expect(row.paymentMethod).toBe(paymentMethod);
    expect(row.quoteLineId).toBe(fx.lines.withVendor);
  });

  it("칸 없이 부르면 비고 · 희망 칸 · 지급 예정일은 비어 있다(기존 동작)", async () => {
    const fx = await setupExpenseProject();
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const row = await rowOf(result.created[0]?.expenseId ?? "");
    expect(row.note).toBeNull();
    expect(row).toMatchObject({ requestedPaymentDate: null, requestedPaymentReason: null });
    expect(row.scheduledPaymentDate).toBeNull();
  });

  it("null · 생략한 칸은 줄 기본값 그대로다(지급 방식은 첫 코드)", async () => {
    const fx = await setupExpenseProject();
    const first = (await listCodeItems(SYSTEM_VIEWER, { tableKey: "payment_method", scope: { rows: "all", includeArchived: false }, includeInactive: false }))[0]?.value;
    const result = await createExpenseFromLines(fx.pm, {
      lineIds: [fx.lines.withVendor],
      fields: { note: "비고만", requestedPaymentDate: null, requestedPaymentReason: null, paymentMethod: null },
    });
    const row = await rowOf(result.created[0]?.expenseId ?? "");
    expect(row.note).toBe("비고만");
    expect(row.requestedPaymentDate).toBeNull();
    expect(row.paymentMethod).toBe(first);
  });

  it("일반 저장과 같은 검증 — 희망일 형식이 틀리거나 · 희망일만 있거나(사유 칸 오류) · 비고가 너무 길면 거부하고 문서를 만들지 않는다", async () => {
    const fx = await setupExpenseProject();
    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { requestedPaymentDate: "2026/11/20" } })).rejects.toThrow();
    const onlyDate = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { requestedPaymentDate: daysFromToday(3) } }).catch((e: unknown) => e);
    expect(onlyDate).toBeInstanceOf(ExpenseFieldError);
    expect(onlyDate).toMatchObject({ field: "requestedPaymentReason", message: REQUESTED_REASON_REQUIRED });
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

  it("임시 저장(saveExpenseDraft)에 희망 두 칸이 저장 · 읽히고 희망일만이면 사유 칸 오류 · 지급 예정일 키는 거부 · D-740 기존 값은 그 값", async () => {
    const fx = await setupExpenseProject();
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = result.created[0]?.expenseId ?? "";
    const hope = daysFromToday(5);
    const saved = await saveExpenseDraft(fx.pm, {
      expenseId,
      expectedVersion: (await rowOf(expenseId)).version,
      fields: { note: "고친 비고", requestedPaymentDate: hope, requestedPaymentReason: "선금" },
    });
    expect(await rowOf(expenseId)).toMatchObject({ note: "고친 비고", requestedPaymentDate: hope, requestedPaymentReason: "선금", scheduledPaymentDate: null });
    expect(await getExpense(fx.pm, { expenseId })).toMatchObject({ requestedPaymentDate: hope, requestedPaymentReason: "선금" });

    const onlyDate = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: saved.version, fields: { requestedPaymentDate: hope, requestedPaymentReason: "   " } }).catch((e: unknown) => e);
    expect(onlyDate).toMatchObject({ field: "requestedPaymentReason", message: REQUESTED_REASON_REQUIRED });

    await db.update(expenses).set({ scheduledPaymentDate: "2026-07-17" }).where(eq(expenses.id, expenseId));
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: saved.version, fields: { note: "다시" } });
    expect((await rowOf(expenseId)).scheduledPaymentDate).toBe("2026-07-17");

    // 작성자 입력에는 지급 예정일 키가 없다(strict 스키마 — 타입 밖 입력도 거부).
    const withSchedule: Record<string, unknown> = { scheduledPaymentDate: "2026-07-10" };
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await rowOf(expenseId)).version, fields: withSchedule })).rejects.toThrow();
  });
});

// 사용자 결정 2026-10-23(AQ-10 완화 · 독립 검토 L-4): 희망 지급일이 지난 지출결의도 다른 칸은 저장 — 날짜를 바꿀 때만 검사.
// 제출은 지난 희망일을 날짜 칸 오류 `희망일 지남`으로 막는다. /review P3 F19: 제출 · 팀 비용 첫 저장의 희망일 검사.
describe("지난 희망 지급일 — 날짜를 바꿀 때만 검사", () => {
  async function lineDraftWithPastHope(): Promise<{ pm: Viewer; expenseId: string; past: string }> {
    const fx = await setupExpenseProject();
    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = result.created[0]?.expenseId ?? "";
    const past = daysFromToday(-2);
    // 저장할 때는 미래였던 희망일이 날이 지나 과거가 된 문서.
    await db.update(expenses).set({ requestedPaymentDate: past, requestedPaymentReason: "행사 전 선금" }).where(eq(expenses.id, expenseId));
    return { pm: fx.pm, expenseId, past };
  }

  it("임시 저장: 희망일을 그대로 두고 비고만 고치면 저장된다(폼처럼 희망 두 칸을 같이 보내도 · 빼고 보내도)", async () => {
    const { pm, expenseId, past } = await lineDraftWithPastHope();
    await saveExpenseDraft(pm, { expenseId, expectedVersion: (await rowOf(expenseId)).version, fields: { note: "비고 고침", requestedPaymentDate: past, requestedPaymentReason: "행사 전 선금" } });
    expect(await rowOf(expenseId)).toMatchObject({ note: "비고 고침", requestedPaymentDate: past });
    await saveExpenseDraft(pm, { expenseId, expectedVersion: (await rowOf(expenseId)).version, fields: { note: "다시 고침" } });
    expect(await rowOf(expenseId)).toMatchObject({ note: "다시 고침", requestedPaymentDate: past });
  });

  it("임시 저장: 다른 지난 날로 바꾸면 희망 지급일 칸 오류 · 저장 안 됨", async () => {
    const { pm, expenseId, past } = await lineDraftWithPastHope();
    const changed = await saveExpenseDraft(pm, {
      expenseId,
      expectedVersion: (await rowOf(expenseId)).version,
      fields: { note: "비고 고침", requestedPaymentDate: daysFromToday(-1), requestedPaymentReason: "행사 전 선금" },
    }).catch((e: unknown) => e);
    expect(changed).toBeInstanceOf(ExpenseFieldError);
    expect(changed).toMatchObject({ field: "requestedPaymentDate", message: REQUESTED_DATE_PAST });
    expect(await rowOf(expenseId)).toMatchObject({ note: null, requestedPaymentDate: past });
  });

  it("제출: 희망일이 지났으면 희망 지급일 칸 오류 `희망일 지남` · 제출 안 됨", async () => {
    const { pm, expenseId } = await lineDraftWithPastHope();
    const submitted = await submitReadyDraft(pm, expenseId).catch((e: unknown) => e);
    expect(submitted).toBeInstanceOf(ExpenseFieldError);
    expect(submitted).toMatchObject({ field: "requestedPaymentDate", message: REQUESTED_DATE_PASSED });
    expect((await rowOf(expenseId)).number).toBeNull();
  });

  it("팀 비용 첫 저장: 지난 희망일은 희망 지급일 칸 오류 · 문서를 만들지 않는다", async () => {
    const fx = await setupExpenseProject();
    const idempotencyKey = randomUUID();
    const created = await createTeamExpenseDraft(fx.pm, {
      idempotencyKey,
      fields: { teamExpenseKind: "team_overhead", usageDate: daysFromToday(0), content: "팀 회식", requestedPaymentDate: daysFromToday(-1), requestedPaymentReason: "선금" },
    }).catch((e: unknown) => e);
    expect(created).toMatchObject({ field: "requestedPaymentDate", message: REQUESTED_DATE_PAST });
    expect(await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.idempotencyKey, idempotencyKey))).toEqual([]);
  });
});
