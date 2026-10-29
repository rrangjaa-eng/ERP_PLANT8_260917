import { describe, expect, it } from "vitest";
import { approveDocument } from "@/domain/approvals";
import { insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { expenses, settingsHistorized } from "@/db/schema";
import { createExpenseFromLines, ExpenseConflictError, ExpenseNotFoundError, getExpense, listExpenseFormOptions, previewExpense, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { computeExpenseTax } from "@/domain/expenses/tax";
import { addHistorizedValue, cancelHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seedCodeItem } from "@/repositories/code-tables";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { attachEvidence, ensureDetail, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager } from "./fixtures/payments";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { upsertVisibility } from "@/repositories/permissions";
import { detachOwnEvidence } from "@/domain/evidence-records/attach";
import { waitForLockWaiter } from "./lock-race";

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
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { evidenceType: "test_vat_scheduled" } });
    // 07-01 D-714: 작성자 저장은 지급 예정일을 칸에 쓰지 않는다 — 저장 칸 값(D-740 기존 값 · 지급 권한자 수동 지정)을 시험이 직접 둔다.
    await db.update(expenses).set({ scheduledPaymentDate: addDays(scheduledFrom, 5) }).where(eq(expenses.id, expenseId));
    const before = await computeExpenseTax(fx.pm, { ...(await expenseRow(expenseId)), earliestEvidenceIssuedOn: null });
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

describe("미리보기(쓰기 없음) · 폼 선택지", () => {
  it("저장 전 증빙 종류 · 공급가액을 겹쳐 계산 한 줄을 돌려주고 행은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);

    const preview = await previewExpense(fx.pm, { expenseId, fields: { evidenceType: "other_income", supply: { currency: "KRW", amount: 3_000_000, fxRate: 1 } } });
    // 06.5 D-6501 — 기타소득은 회사 대납 22% 역산: 3,000,000 ÷ 0.78 − 3,000,000 = 846,153.8 → 10원 절사 846,150.
    expect(preview.taxLine?.text).toBe("회사 대납 세금 22% 846,150 · 지급 총액 3,000,000 · 기타소득 규칙");
    expect(await expenseRow(expenseId)).toMatchObject({ evidenceType: "tax_invoice", supplyAmountKrw: 12_400_000, version: 1 });
  });

  it("기안자가 아니면 없는 문서다(남의 초안을 계산하지 않는다)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    await expect(previewExpense(fx.otherPm, { expenseId, fields: {} })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("코드표 메뉴 권한이 없는 PM도 증빙 종류 · 지급 방식 선택지를 받는다", async () => {
    const fx = await setupExpenseProject();
    const options = await listExpenseFormOptions(fx.pm);
    expect(options.evidence.map((option) => option.value)).toEqual(expect.arrayContaining(["tax_invoice", "other_income", "business_income"]));
    expect(options.payment.map((option) => option.value)).toContain("bank_transfer");
  });
});

// 06.5 D-6520(UI-SPEC V8 「고친 뒤 문서 화면」): 증빙 확인에서 공급가액을 고친 문서는 계산 한 줄을 고친 공급가로 지금 기준 다시 셈하고
// `세율 바뀜` 줄을 그리지 않는다(결재 때 값과의 차이가 세율이 아니라 고침에서 온다). 세금 스냅숏 칸은 결재 때 값 그대로.
describe("공급가액 고친 문서 — D-6520 · UI-SPEC V8 고친 뒤 문서 화면", () => {
  async function payer() {
    const viewer = await makePaymentManager();
    if (!viewer.roleId) throw new Error("계급 없음");
    for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: viewer.roleId, infoItem, visible: true });
    return viewer;
  }

  it("고친 문서 — 계산 한 줄은 12,000,000을 지금 기준(12%)으로 다시 셈한 값 · 세율 바뀜 없음 · 세금 스냅숏 칸은 결재 때 값", async () => {
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    await confirmEvidence(await payer(), { expenseId: doc.expenseId, version: doc.version, correctedSupplyAmount: 12_000_000 });

    const view = await getExpense(fx.pm, { expenseId: doc.expenseId });
    expect(view?.taxLine?.text).toBe("부가세 12% 1,440,000 · 지급 총액 13,440,000 · 세금계산서 규칙");
    expect(view?.taxDrift).toBeNull();
    expect(await expenseRow(doc.expenseId)).toMatchObject({
      supplyAmountKrw: 12_000_000,
      taxRuleKind: "vat_surcharge",
      taxRate: "0.100000",
      vatKrw: 1_240_000,
      payableKrw: 13_640_000,
    });
  });

  it("고치지 않은 문서 — `공급가액과 같음` 확인 뒤에도 저장값 한 줄 + 세율 바뀜 글자 그대로", async () => {
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    await confirmEvidence(await payer(), { expenseId: doc.expenseId, version: doc.version });

    const view = await getExpense(fx.pm, { expenseId: doc.expenseId });
    expect(view?.taxLine?.text).toBe("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    expect(view?.taxDrift?.text).toBe("세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000");
  });
});

// 07.1-16(T-07.1-16-02): 증빙 기준일이 붙은 증빙 가장 이른 발행일로 바뀌어도 승인 때 찍힌 스냅숏은 소급해 바뀌지 않는다 — 새 계산만 새 기준일이고
// 다르면 세율 바뀜 한 줄이 드러낸다. 이력 행은 미래(2027)에 둬 다른 시험의 오늘 세율을 건드리지 않고 끝에 취소한다.
describe("07.1-16 — 승인 스냅숏 불변", () => {
  it("수동 증빙일(10-20)로 승인된 문서에 더 이른 발행일(10-05) 기록이 붙어도 스냅숏 칸은 그대로 · 상세는 세율 바뀜", async () => {
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: "test_vat_evidence_0716",
      label: "증빙일 부가세 07.1-16",
      sortOrder: 99,
      taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" },
    });
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { evidenceType: "test_vat_evidence_0716", evidenceDate: "2027-10-20" } });
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2027-10-10", value: 0.17 });
    try {
      const submitted = await submitReadyDraft(fx.pm, expenseId);
      if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
      const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
      await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
      const pick = (row: Awaited<ReturnType<typeof expenseRow>>) => ({
        taxRate: row.taxRate,
        taxBasisDate: row.taxBasisDate,
        taxRateEffectiveFrom: row.taxRateEffectiveFrom,
        vatKrw: row.vatKrw,
        payableKrw: row.payableKrw,
      });
      const stamped = pick(await expenseRow(expenseId));
      expect(stamped).toMatchObject({ taxRate: "0.170000", taxBasisDate: "2027-10-20", vatKrw: 2_108_000, payableKrw: 14_508_000 });

      await insertLinkFixture({ recordId: await insertRecordFixture(fx.pm, { issuedOn: "2027-10-05" }), ownerId: expenseId, attachedBy: fx.pm.id });
      expect(pick(await expenseRow(expenseId))).toEqual(stamped);
      const doc = await getExpense(fx.pm, { expenseId });
      expect(doc?.taxLine?.text).toContain("지급 총액 14,508,000");
      expect(doc?.taxDrift?.text).toContain("17% →");
    } finally {
      await cancelHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, "2027-10-10");
    }
  }, 60_000);
});

// 07.1-16 Codex 검토(PR #324): 제출은 세금을 트랜잭션 전에 붙은 증빙 가장 이른 발행일로 셈한다. 그 사이 가장 이른 기록을 떼면(편집 가능 상태 —
// 문서 version 그대로) 뗀 기록의 날로 셈한 스냅숏이 저장됐다. 별도 연결이 프로젝트 행을 쥐어 제출을 트랜잭션 첫 잠금에서 세우고, 그동안 떼기를 커밋한다.
describe("07.1-16 — 제출 중 가장 이른 증빙 떼기", () => {
  it("사전 판독 뒤 · 잠금 전에 가장 이른 기록(10-05)을 떼면 제출은 충돌로 막히고, 다시 제출하면 남은 기록(10-15) 기준 세율로 찍힌다", async () => {
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: "test_vat_evidence_0716_race",
      label: "증빙일 부가세 07.1-16 경합",
      sortOrder: 99,
      taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" },
    });
    const fx = await setupExpenseProject();
    const expenseId = await draftOnStageLine(fx);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { evidenceType: "test_vat_evidence_0716_race", evidenceDate: "2027-10-20" } });
    const earlyLink = await insertLinkFixture({ recordId: await insertRecordFixture(fx.pm, { issuedOn: "2027-10-05" }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.id });
    await insertLinkFixture({ recordId: await insertRecordFixture(fx.pm, { issuedOn: "2027-10-15" }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.id });
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2027-10-10", value: 0.17 });
    // 붙이기 · 상세 저장은 제출 전에 끝낸다 — 잠금 대기 연결이 제출 하나뿐이게.
    await attachEvidence(fx.pm, expenseId);
    await ensureDetail(fx.pm, expenseId);
    const { version } = await expenseRow(expenseId);
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      const submitting = submitExpense(fx.pm, { expenseId, expectedVersion: version });
      try {
        await waitForLockWaiter(pool);
        expect(await detachOwnEvidence(fx.pm, { linkId: earlyLink, reason: "잘못 붙임" })).toEqual({ detached: true });
      } finally {
        await holder.query("COMMIT");
      }
      await expect(submitting).rejects.toBeInstanceOf(ExpenseConflictError);
      expect(await expenseRow(expenseId)).toMatchObject({ number: null, taxBasisDate: null });

      const again = await submitReadyDraft(fx.pm, expenseId);
      expect(again.kind).toBe("submitted");
      expect(await expenseRow(expenseId)).toMatchObject({ taxBasisDate: "2027-10-15", taxRate: "0.170000" });
    } finally {
      holder.release();
      await cancelHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, "2027-10-10");
    }
  }, 60_000);
});
