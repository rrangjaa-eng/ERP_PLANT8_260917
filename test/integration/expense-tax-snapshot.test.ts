import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, settingsHistorized } from "@/db/schema";
import { createExpenseFromLines, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { computeExpenseTax } from "@/domain/expenses/tax";
import { addHistorizedValue, cancelHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seedCodeItem } from "@/repositories/code-tables";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-06 Task 1(기준 7 · Eng OV-5 · B1 Round 2) — 제출 때 세율 스냅숏(세율 · 이력 행 id · 그 행의 적용일 — 값 복사, 외래 키 없음)을
// 저장하고, 문서는 저장값 한 줄을 보이며, 지금 기준 재계산이 다르면 `세율 바뀜` 한 줄이 선다. 판정은 스냅숏 값 대 재계산 값 —
// 이력 행을 다시 읽지 않으므로 문서가 참조한 예정 세율을 취소해도 취소는 성공하고 문서는 그대로 읽힌다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function vatRowAt(effectiveFrom: string) {
  const [row] = await db
    .select()
    .from(settingsHistorized)
    .where(and(eq(settingsHistorized.key, TAX_VAT_RATE.key), eq(settingsHistorized.effectiveFrom, effectiveFrom)));
  return row ?? null;
}

async function draftOnStageLine(fx: ExpenseFixture): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

describe("세율 스냅숏 · 세율 바뀜", () => {
  it("제출 때 기준일(작성일)에 유효한 부가세 이력 행의 세율 · id · 적용일을 저장하고, 더 이른 적용일의 12% 행이 생기면 저장값 한 줄 + 세율 바뀜", async () => {
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    await submitReadyDraft(fx.pm, expenseId);

    const fixtureRow = await vatRowAt("2026-01-01");
    expect(await expenseRow(expenseId)).toMatchObject({
      taxRuleKind: "vat_surcharge",
      taxRate: "0.100000",
      taxRateSettingId: fixtureRow?.id,
      taxRateEffectiveFrom: "2026-01-01",
      vatKrw: 1_240_000,
      payableKrw: 13_640_000,
    });
    expect((await getExpense(fx.pm, { expenseId }))?.taxDrift).toBeNull();

    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc?.taxLine?.text).toBe("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    expect(doc?.taxDrift?.text).toBe("세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000");
  });

  it("새 부가세 행이 기준일 뒤에 적용되면 세율 바뀜이 없다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    await submitReadyDraft(fx.pm, expenseId);

    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: addDays(seoulToday(), 30), value: 0.12 });
    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc?.taxLine?.text).toBe("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    expect(doc?.taxDrift).toBeNull();
  });

  it("제출 문서가 참조한 예정 세율을 관리자가 취소해도 취소는 성공하고 문서는 저장값 한 줄 + 세율 바뀜(B1 · 사용자 결정 E1: A)", async () => {
    // 부가세 가산 · 기준일 = 지급 예정일인 테스트 증빙 종류(코드표 필드가 설정보다 먼저).
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: "test_vat_scheduled",
      label: "예정 부가세",
      sortOrder: 99,
      taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "scheduled_payment_date" },
    });
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    // 예정 행은 실제 서울 오늘 + 30일 — addHistorizedValue · cancelHistorizedValue · 제출 세금 계산이 모두 실제 시계를 본다.
    const scheduledFrom = addDays(seoulToday(), 30);
    await saveExpenseDraft(fx.pm, {
      expenseId,
      expectedVersion: 1,
      fields: { evidenceType: "test_vat_scheduled", scheduledPaymentDate: addDays(scheduledFrom, 5) },
    });
    const before = await computeExpenseTax(fx.pm, await expenseRow(expenseId));
    if (before.unavailable) throw new Error("예정 행 전 계산 불가");

    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: scheduledFrom, value: 0.12 });
    const scheduledRow = await vatRowAt(scheduledFrom);
    await submitReadyDraft(fx.pm, expenseId);
    const snapshot = {
      taxRate: "0.120000",
      taxRateSettingId: scheduledRow?.id,
      taxRateEffectiveFrom: scheduledFrom,
      vatKrw: 1_488_000,
      payableKrw: 13_888_000,
    };
    expect(await expenseRow(expenseId)).toMatchObject(snapshot);

    await expect(cancelHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, scheduledFrom)).resolves.toBeUndefined();
    expect(await vatRowAt(scheduledFrom)).toBeNull();
    expect(await expenseRow(expenseId)).toMatchObject(snapshot);

    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc?.taxLine?.text).toBe("부가세 12% 1,488,000 · 지급 총액 13,888,000 · 예정 부가세 규칙");
    const rateText = `${Math.round((before.rate ?? 0) * 100)}%`;
    expect(doc?.taxDrift?.text).toBe(
      `세율 바뀜 · 부가세 12% → ${rateText} · 지급 총액 13,888,000 → ${before.payableKrw.toLocaleString("en-US")}`,
    );
  });
});
