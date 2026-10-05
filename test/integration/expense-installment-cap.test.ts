import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, quoteLines } from "@/db/schema";
import { saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { createExpenseFromLines, ExpenseFieldError, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-14 Task 2 — 분할 회차 · 회차 상한 · 닫힘(UI-SPEC 확정 #1 · RESEARCH Open Q4 RESOLVED). 상한 = 줄의 번호 있는
// 문서(자기 자신 제외) 공급가액 합 + 이번 공급가액 ≤ 실행가. 통화가 모두 같으면 원래 통화로, 하나라도 다르면 원화로.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function newDraft(fx: ExpenseFixture, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function save(fx: ExpenseFixture, expenseId: string, fields: Parameters<typeof saveExpenseDraft>[1]["fields"]) {
  const { version } = await expenseRow(expenseId);
  await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields });
}

describe("회차와 상한", () => {
  it("실행가 10,000,000 줄: 분할 1회차 6,000,000 → 2회차 5,000,000은 남은 실행가로 거부 → 4,000,000으로 2회차 → 줄이 닫힌다", async () => {
    const fx = await setupExpenseProject();

    // 1회차 — 앞 회차가 없으니 `분할 지급`을 켠 문서가 1회차다.
    const first = await newDraft(fx, fx.lines.split);
    expect((await expenseRow(first)).installment).toBe(false);
    await save(fx, first, { installment: true, supply: { currency: "KRW", amount: 6_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, first)).toMatchObject({ kind: "submitted", number: "26001-0001" });
    expect(await expenseRow(first)).toMatchObject({ installment: true, installmentSeq: 1 });

    // 같은 줄 새 작성 중 문서 — 앞 회차가 있어 분할 문서로 만들어지고 남은 실행가 4,000,000이 채워진다.
    const second = await newDraft(fx, fx.lines.split);
    expect(await expenseRow(second)).toMatchObject({ installment: true, supplyAmountKrw: 4_000_000 });

    await save(fx, second, { supply: { currency: "KRW", amount: 5_000_000, fxRate: 1 } });
    const error = await submitReadyDraft(fx.pm, second).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpenseFieldError);
    expect(error).toMatchObject({ field: "supplyAmount", message: "남은 실행가 4,000,000 넘음 · 공급가액 고치기" });
    expect((await expenseRow(second)).number).toBeNull();

    // 체크박스를 꺼도 앞 회차가 있는 줄의 문서는 분할 문서다.
    await save(fx, second, { installment: false, supply: { currency: "KRW", amount: 4_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, second)).toMatchObject({ kind: "submitted", number: "26001-0002" });
    expect(await expenseRow(second)).toMatchObject({ installment: true, installmentSeq: 2 });

    // 남은 실행가 0 — 줄의 문이 닫힌다.
    const closed = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    expect(closed).toEqual({ created: [], blocked: [{ lineId: fx.lines.split, reason: "이 줄에 지출결의 26001-0002 있음 · 지출결의 열기" }] });
  });

  it("분할을 켜지 않은 첫 문서는 회차가 없고 그 줄을 닫는다", async () => {
    const fx = await setupExpenseProject();
    const only = await newDraft(fx, fx.lines.split);
    await save(fx, only, { supply: { currency: "KRW", amount: 3_000_000, fxRate: 1 } });
    await submitReadyDraft(fx.pm, only);
    expect(await expenseRow(only)).toMatchObject({ installment: false, installmentSeq: null });

    const closed = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    expect(closed.blocked).toEqual([{ lineId: fx.lines.split, reason: "이 줄에 지출결의 26001-0001 있음 · 지출결의 열기" }]);
  });
});

describe("외화 줄", () => {
  it("USD 10,000 줄: USD 6,000(1,300) 뒤 USD 4,000(1,400)은 원화 합이 실행가 원화를 넘어도 원래 통화 비교라 통과하고 줄이 닫힌다", async () => {
    const fx = await setupExpenseProject();
    const extra = await addApprovedRevision(fx, [{ itemName: "해외 연사", vendorId: fx.stageOneId, execution: { currency: "USD", amount: 10_000, fxRate: 1_300 } }]);
    const lineId = extra.lineIds.get("해외 연사") ?? "";

    const first = await newDraft(fx, lineId);
    await save(fx, first, { installment: true, supply: { currency: "USD", amount: 6_000, fxRate: 1_300 } });
    expect(await submitReadyDraft(fx.pm, first)).toMatchObject({ kind: "submitted", number: "26001-0001" });

    const second = await newDraft(fx, lineId);
    expect(await expenseRow(second)).toMatchObject({ installment: true, supplyCurrency: "USD", supplyForeignAmount: "4000.00" });
    await save(fx, second, { supply: { currency: "USD", amount: 4_000.01, fxRate: 1_400 } });
    const over = await submitReadyDraft(fx.pm, second).catch((e: unknown) => e);
    expect(over).toMatchObject({ field: "supplyAmount", message: "남은 실행가 USD 4,000.00 넘음 · 공급가액 고치기" });

    await save(fx, second, { supply: { currency: "USD", amount: 4_000, fxRate: 1_400 } });
    expect(await submitReadyDraft(fx.pm, second)).toMatchObject({ kind: "submitted", number: "26001-0002" });
    // 원화로는 7,800,000 + 5,600,000 = 13,400,000 > 실행가 13,000,000 — 원래 통화로 비교했다.
    expect((await expenseRow(second)).supplyAmountKrw).toBe(5_600_000);
    expect(await expenseRow(second)).toMatchObject({ installmentSeq: 2 });

    const closed = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
    expect(closed.blocked).toEqual([{ lineId, reason: "이 줄에 지출결의 26001-0002 있음 · 지출결의 열기" }]);
  });
});

describe("차수 계보(D-66) — 이전 차수 줄의 앞 회차", () => {
  it("1차 줄에 1회차 6,000,000 → 2차(복사된 줄) 문서는 남은 실행가 4,000,000 상한 · 2회차로 제출된다", async () => {
    const fx = await setupExpenseProject();
    const first = await newDraft(fx, fx.lines.split);
    await save(fx, first, { installment: true, supply: { currency: "KRW", amount: 6_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, first)).toMatchObject({ kind: "submitted", number: "26001-0001" });

    const extra = await addApprovedRevision(fx, []);
    const copied = extra.lineIds.get("영상 제작(분할)") ?? "";
    const second = await newDraft(fx, copied);
    expect(await expenseRow(second)).toMatchObject({ installment: true, supplyAmountKrw: 4_000_000 });
    expect((await getExpense(fx.pm, { expenseId: second }))?.installmentText).toBe("2회차 · 앞 회차 26001-0001 · 마지막 회차");

    await save(fx, second, { supply: { currency: "KRW", amount: 10_000_000, fxRate: 1 } });
    const error = await submitReadyDraft(fx.pm, second).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpenseFieldError);
    expect(error).toMatchObject({ field: "supplyAmount", message: "남은 실행가 4,000,000 넘음 · 공급가액 고치기" });

    await save(fx, second, { supply: { currency: "KRW", amount: 4_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, second)).toMatchObject({ kind: "submitted", number: "26001-0002" });
    expect(await expenseRow(second)).toMatchObject({ installment: true, installmentSeq: 2 });
  });

  // 05 /review C7(adversarial F6): 계보 걷기(제출 · 미리보기)와 줄 표 · 골라내기(resolveLinkedDocumentsByLineage)는 둘 다 보관 안 된 줄만 본다.
  // 둘이 어긋나려면 ⓐ 번호 문서가 계보에 있는 줄을 보관하거나 ⓑ 한 줄이 두 줄로 복사돼야 하는데, 두 경로 모두 막혀 있음을 보인다.
  it("번호 문서가 계보에 있는 줄은 보관되지 않고, 차수 복사는 지금 차수에서만이라 한 줄은 한 줄로만 이어진다 (C7)", async () => {
    const fx = await setupExpenseProject();
    const first = await newDraft(fx, fx.lines.split);
    await save(fx, first, { installment: true, supply: { currency: "KRW", amount: 6_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, first)).toMatchObject({ kind: "submitted", number: "26001-0001" });
    const extra = await addApprovedRevision(fx, []);
    const copied = extra.lineIds.get("영상 제작(분할)") ?? "";

    // ⓐ 지금 차수의 복사 줄 — 앞 차수 줄의 번호 문서가 계보로 이어져 보관(삭제)이 막힌다. 앞 차수 줄은 지금 차수가 아니라 저장 자체가 막힌다.
    await expect(saveQuoteLines(fx.pm, extra.revisionId, { rows: [], archivedLineIds: [copied] })).rejects.toMatchObject({ message: "연결 문서 있음 · 삭제 대신 취소" });
    await expect(saveQuoteLines(fx.pm, fx.revisionId, { rows: [], archivedLineIds: [fx.lines.split] })).rejects.toMatchObject({
      message: "다른 사람이 새 차수를 만듦 · 새로 고침",
    });
    expect((await db.select().from(quoteLines).where(eq(quoteLines.id, copied)))[0]?.archivedAt).toBeNull();

    // ⓑ 이전 차수에서 다시 복사할 수 없다 — 차수 복사는 지금 차수에서만이고, 차수를 거듭해도 줄마다 바로 다음 복사본은 하나다.
    await expect(createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId })).rejects.toThrow();
    await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: extra.revisionId });
    for (const lineId of [fx.lines.split, copied]) {
      expect(await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.copiedFromLineId, lineId))).toHaveLength(1);
    }
  });
});
