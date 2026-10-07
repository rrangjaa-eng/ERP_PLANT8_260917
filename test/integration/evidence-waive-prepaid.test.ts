import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, ExpenseFieldError, ExpenseNotFoundError, getExpense, listExpenseFormOptions, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { PREPAID_REASON_REQUIRED } from "@/domain/expenses/gate";
import { cancelExpensePayment, completeExpensePayment, previewPayable } from "@/domain/payments";
import { GateBlockedError } from "@/domain/rules/gate";
import { EVIDENCE_PREPAID_DUE_DAYS } from "@/domain/settings/keys";
import { EVIDENCE_AMOUNT_TAX_INCLUSIVE } from "@/domain/evidence-reviews/tax-inclusive";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { seedCodeItem } from "@/repositories/code-tables";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";

// 06-10(EXP-13 · EVID-03 · D-603 · D-611 · O-4 · EA-1): 05 폼의 선결제 · 사유 · 증빙 금액 · 증빙일(기안자 저장)과 경영관리의 증빙 면제.
// 문서는 05 · 04.1 도메인 함수로 만든다(SQL 직접 삽입 없음). 통과를 기대하는 지급은 증빙 필수 on에서 돌려 선결제 · 면제가 게이트를 여는지 본다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function lineDraft(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function save(fx: ExpenseFixture, expenseId: string, fields: Parameters<typeof saveExpenseDraft>[1]["fields"]) {
  const row = await expenseRow(expenseId);
  return saveExpenseDraft(fx.pm, { expenseId, expectedVersion: row.version, fields });
}

// 증빙 없이 선결제로 제출한 문서.
async function submitPrepaid(fx: ExpenseFixture, lineId?: string): Promise<{ expenseId: string; instanceId: string; version: number }> {
  const expenseId = await lineDraft(fx, lineId);
  await save(fx, expenseId, { prepaid: true, prepaidReason: "행사장 선입금 요구" });
  const row = await expenseRow(expenseId);
  const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: row.version });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId, version: submitted.version };
}

async function approveBoth(fx: ExpenseFixture, instanceId: string, version: number): Promise<void> {
  const first = await approveDocument(fx.lead, { instanceId, expectedVersion: version });
  const final = await approveDocument(fx.ceo, { instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

// 지급 권한자 + 금액 · 값 정보 항목 노출(지급 총액 미리보기가 expense.amount로 투영된다).
async function payer(): Promise<Viewer> {
  const manager = await makePaymentManager();
  if (!manager.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: manager.roleId, infoItem, visible: true });
  return manager;
}

describe("선결제 · 사유 (EXP-13 · S6)", () => {
  it("선결제 + 사유가 저장되고 증빙 0이어도 제출된다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submitPrepaid(fx);
    const row = await expenseRow(expenseId);
    expect(row.prepaid).toBe(true);
    expect(row.prepaidReason).toBe("행사장 선입금 요구");
    expect(row.number).not.toBeNull();
  });

  it("선결제가 아니고 증빙이 0이면 제출이 증빙 없음으로 막힌다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const row = await expenseRow(expenseId);
    await expect(submitExpense(fx.pm, { expenseId, expectedVersion: row.version })).rejects.toThrow(GateBlockedError);
    await expect(submitExpense(fx.pm, { expenseId, expectedVersion: row.version })).rejects.toThrow("증빙 없음 · 증빙 올리기 Ctrl+U");
  });

  it("선결제 + 사유 빔 임시 저장은 칸 오류로 거부되고 행은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const before = await expenseRow(expenseId);
    for (const prepaidReason of [null, "", "   "]) {
      const failure = await save(fx, expenseId, { prepaid: true, prepaidReason }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ExpenseFieldError);
      expect(failure).toMatchObject({ field: "prepaidReason", message: PREPAID_REASON_REQUIRED });
    }
    // 사유만 비운 저장도(이미 선결제인 문서) 거부된다.
    await save(fx, expenseId, { prepaid: true, prepaidReason: "선입금" });
    await expect(save(fx, expenseId, { prepaidReason: "  " })).rejects.toBeInstanceOf(ExpenseFieldError);
    const after = await expenseRow(expenseId);
    expect(after.prepaidReason).toBe("선입금");
    expect(after.version).toBe(before.version + 1);
  });

  it("선결제를 끄면 적은 사유는 버려진다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { prepaid: true, prepaidReason: "선입금" });
    await save(fx, expenseId, { prepaid: false, prepaidReason: "남은 사유" });
    const row = await expenseRow(expenseId);
    expect(row.prepaid).toBe(false);
    expect(row.prepaidReason).toBeNull();
  });

  it("폼 재료에 선결제 기한 일수(설정 값)가 실린다", async () => {
    const fx = await setupExpenseProject();
    const options = await listExpenseFormOptions(fx.pm);
    expect(options.prepaidDueDays).toBe(EVIDENCE_PREPAID_DUE_DAYS.default);
  });

  it("문서 DTO가 선결제 · 사유 · 증빙 금액 · 증빙일을 싣는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { prepaid: true, prepaidReason: "선입금", evidenceAmountKrw: 12_400_000, evidenceDate: "2026-09-17" });
    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc).toMatchObject({ prepaid: true, prepaidReason: "선입금", evidenceAmountKrw: 12_400_000, evidenceDate: "2026-09-17" });
  });
});

describe("기안자 증빙 금액 · 증빙일 (C6 · EVID-03 · E-20)", () => {
  it("증빙 금액 · 증빙일이 expenses.evidence_amount · evidence_date로 저장된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { evidenceAmountKrw: 12_400_000, evidenceDate: "2026-09-17" });
    const row = await expenseRow(expenseId);
    expect(row.evidenceAmount).toBe(12_400_000);
    expect(row.evidenceDate).toBe("2026-09-17");
  });

  it("미래 날짜도 저장된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const future = addDays(seoulToday(), 400);
    await save(fx, expenseId, { evidenceDate: future });
    expect((await expenseRow(expenseId)).evidenceDate).toBe(future);
  });

  it.each([
    [0, "증빙 금액 0 이하 · 금액 고치기"],
    [-1, "증빙 금액 0 이하 · 금액 고치기"],
    [1.5, "원화 소수점 · 소수점 없이"],
    ["12,400,000", "숫자 아님 · 12,400,000처럼"],
  ] as const)("증빙 금액 %j → 칸 오류 %s · 행 불변", async (value, message) => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const before = await expenseRow(expenseId);
    const failure = await save(fx, expenseId, { evidenceAmountKrw: value as number }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZodError);
    expect((failure as ZodError).issues[0]?.message).toBe(message);
    expect(await expenseRow(expenseId)).toEqual(before);
  });

  it.each(["2026-9-7", "2026-02-30", "0000-01-01"])("증빙일 %s → 05 날짜 형식 입력 검증 오류 · 행 불변", async (value) => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const before = await expenseRow(expenseId);
    const failure = await save(fx, expenseId, { evidenceDate: value }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZodError);
    expect((failure as ZodError).issues[0]?.message).toBe(DATE_FORMAT_ERROR);
    expect(await expenseRow(expenseId)).toEqual(before);
  });

  it("증빙 금액 · 증빙일이 비어도 제출된다(제출 필수 아님)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted.kind).toBe("submitted");
    const row = await expenseRow(expenseId);
    expect(row.evidenceAmount).toBeNull();
    expect(row.evidenceDate).toBeNull();
  });
});

describe("O-4 — 제출 뒤 선결제 · 증빙 금액은 기안자 경로로 바뀌지 않는다", () => {
  it("결재 중 문서에 기안자 저장을 보내면 편집 불가 거부 · 행 불변", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submitPrepaid(fx);
    const before = await expenseRow(expenseId);
    await expect(save(fx, expenseId, { prepaid: false })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(save(fx, expenseId, { evidenceAmountKrw: 1_000_000 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect(await expenseRow(expenseId)).toEqual(before);
  });

  it("승인된 문서에도 같다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId, version } = await submitPrepaid(fx);
    await approveBoth(fx, instanceId, version);
    const before = await expenseRow(expenseId);
    await expect(save(fx, expenseId, { prepaid: false, prepaidReason: null })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect(await expenseRow(expenseId)).toEqual(before);
  });

  it("반려 문서(편집 가능)는 선결제 · 증빙 금액을 고쳐 다시 제출할 수 있다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submitPrepaid(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "사유 보완" });
    await save(fx, expenseId, { prepaidReason: "선입금 · 계약서 3조", evidenceAmountKrw: 12_400_000 });
    const row = await expenseRow(expenseId);
    expect(row.prepaidReason).toBe("선입금 · 계약서 3조");
    expect(row.evidenceAmount).toBe(12_400_000);
    const resubmitted = await submitExpense(fx.pm, { expenseId, expectedVersion: row.version });
    expect(resubmitted.kind).toBe("submitted");
  });
});

describe("EXP-13 — 선결제 기한은 표시뿐이고 처리를 막지 않는다", () => {
  it("선결제 승인 문서는 증빙 필수 on에서도 지급 완료가 통과하고, 기한이 지나도 지급 취소가 막히지 않는다", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const { expenseId, instanceId, version } = await submitPrepaid(fx);
    await approveBoth(fx, instanceId, version);
    const manager = await payer();
    const longAgo = addDays(seoulToday(), -60);
    const preview = await previewPayable(manager, { expenseId, payDate: longAgo });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const paid = await completeExpensePayment(manager, { expenseId, payDate: longAgo, expectedPayableKrw: preview.payableKrw, version: (await expenseRow(expenseId)).version });
    // 지급일 + 설정 일수(기본 14)가 한참 지났다 — 그래도 지급 취소는 통과한다.
    await expect(cancelExpensePayment(manager, { expenseId, reason: "이중 지급", version: paid.version })).resolves.toBeDefined();
  });
});

describe("부가세 포함 증빙 금액 저장 막힘(EA-1)", () => {
  async function supplyTenMillion(fx: ExpenseFixture, evidenceType?: string): Promise<string> {
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { supply: { currency: "KRW", amount: 10_000_000, fxRate: 1 }, ...(evidenceType ? { evidenceType } : {}) });
    return expenseId;
  }

  it("공급가 + 부가세와 정확히 같은 증빙 금액은 칸 오류로 거부되고 행은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await supplyTenMillion(fx);
    const before = await expenseRow(expenseId);
    const failure = await save(fx, expenseId, { evidenceAmountKrw: 11_000_000 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ExpenseFieldError);
    expect(failure).toMatchObject({ field: "evidenceAmount", message: EVIDENCE_AMOUNT_TAX_INCLUSIVE });
    expect(await expenseRow(expenseId)).toEqual(before);
  });

  it("1원이라도 다르면 저장된다(10,000,000 · 11,000,001)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await supplyTenMillion(fx);
    await save(fx, expenseId, { evidenceAmountKrw: 10_000_000 });
    expect((await expenseRow(expenseId)).evidenceAmount).toBe(10_000_000);
    await save(fx, expenseId, { evidenceAmountKrw: 11_000_001 });
    expect((await expenseRow(expenseId)).evidenceAmount).toBe(11_000_001);
  });

  it("공급가액만 바꾼 저장도 합친 값으로 판정한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { evidenceAmountKrw: 11_000_000 });
    // 공급가를 10,000,000으로 내리면 저장된 증빙 금액이 공급가 + 부가세와 같아진다.
    const failure = await save(fx, expenseId, { supply: { currency: "KRW", amount: 10_000_000, fxRate: 1 } }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ field: "evidenceAmount", message: EVIDENCE_AMOUNT_TAX_INCLUSIVE });
  });

  it("부가세 0 규칙 증빙 종류는 막지 않는다", async () => {
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: "test_no_vat",
      label: "면세 영수증",
      sortOrder: 98,
      taxRule: { ruleKind: "none", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "scheduled_payment_date" },
    });
    const fx = await setupExpenseProject();
    const value = "test_no_vat";
    const expenseId = await supplyTenMillion(fx, value);
    await save(fx, expenseId, { evidenceAmountKrw: 11_000_000 });
    expect((await expenseRow(expenseId)).evidenceAmount).toBe(11_000_000);
  });

  it("증빙 종류가 비어 세금을 셈할 수 없으면 막지 않는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await supplyTenMillion(fx);
    await save(fx, expenseId, { evidenceType: null });
    await save(fx, expenseId, { evidenceAmountKrw: 11_000_000 });
    expect((await expenseRow(expenseId)).evidenceAmount).toBe(11_000_000);
  });
});
