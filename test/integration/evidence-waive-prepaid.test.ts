import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db, pool } from "@/db/client";
import { actionLog, expenseEvidenceReviews, expensePayments, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, ExpenseFieldError, ExpenseNotFoundError, getExpense, listExpenseFormOptions, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { PREPAID_REASON_REQUIRED } from "@/domain/expenses/gate";
import { cancelExpensePayment, completeExpensePayment, previewPayable } from "@/domain/payments";
import { GateBlockedError } from "@/domain/rules/gate";
import { confirmEvidence, EvidenceReviewConflictError, SUPPLY_CORRECTION_PAID_LOCKED, waiveEvidence } from "@/domain/evidence-reviews";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { ForbiddenError } from "@/domain/permissions/can";
import { getPaymentView } from "@/domain/payments";
import { EVIDENCE_PREPAID_DUE_DAYS } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { upsertVisibility } from "@/repositories/permissions";
import { attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { deferred, waitForLockWaiter } from "./lock-race";

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

  it("문서 DTO가 선결제 · 사유 · 증빙일을 싣고 증빙 금액은 싣지 않는다(06.5 D-6520)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { prepaid: true, prepaidReason: "선입금", evidenceDate: "2026-09-17" });
    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc).toMatchObject({ prepaid: true, prepaidReason: "선입금", evidenceDate: "2026-09-17" });
    expect(doc && "evidenceAmountKrw" in doc).toBe(false);
  });
});

describe("기안자 증빙일 (C6 · EVID-03 · E-20)", () => {
  it("증빙일이 expenses.evidence_date로 저장된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { evidenceDate: "2026-09-17" });
    const row = await expenseRow(expenseId);
    expect(row.evidenceDate).toBe("2026-09-17");
  });

  it("미래 날짜도 저장된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const future = addDays(seoulToday(), 400);
    await save(fx, expenseId, { evidenceDate: future });
    expect((await expenseRow(expenseId)).evidenceDate).toBe(future);
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

  it("증빙일이 비어도 제출된다(제출 필수 아님)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted.kind).toBe("submitted");
    const row = await expenseRow(expenseId);
    expect(row.evidenceDate).toBeNull();
  });
});

describe("O-4 — 제출 뒤 선결제 · 증빙일은 기안자 경로로 바뀌지 않는다", () => {
  it("결재 중 문서에 기안자 저장을 보내면 편집 불가 거부 · 행 불변", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submitPrepaid(fx);
    const before = await expenseRow(expenseId);
    await expect(save(fx, expenseId, { prepaid: false })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(save(fx, expenseId, { evidenceDate: "2026-09-17" })).rejects.toBeInstanceOf(ExpenseNotFoundError);
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

  it("반려 문서(편집 가능)는 선결제 사유를 고쳐 다시 제출할 수 있다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submitPrepaid(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "사유 보완" });
    await save(fx, expenseId, { prepaidReason: "선입금 · 계약서 3조" });
    const row = await expenseRow(expenseId);
    expect(row.prepaidReason).toBe("선입금 · 계약서 3조");
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

// 06.5 D-6520(사용자 카드 10/13 23:44 KST): 기안자 증빙 금액 칸과 그 「부가세 포함」 저장 막힘(EA-1)을 걷었다 — 금액은 공급가액 하나다.
describe("기안자 증빙 금액 칸 없음(06.5 D-6520)", () => {
  it("공급가 + 부가세와 같던 옛 막힘 사례는 칸 스키마에서 거부되고(키 없음) 행은 그대로 · 공급가액 저장은 지금처럼 된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { supply: { currency: "KRW", amount: 10_000_000, fxRate: 1 } });
    expect((await expenseRow(expenseId)).supplyAmountKrw).toBe(10_000_000);
    const before = await expenseRow(expenseId);
    const legacy: Record<string, unknown> = { evidenceAmountKrw: 11_000_000 };
    const failure = await save(fx, expenseId, legacy as Parameters<typeof saveExpenseDraft>[1]["fields"]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZodError);
    expect(await expenseRow(expenseId)).toEqual(before);
  });
});

// 06-10 검토 B-1 · S-3: `/expenses/new` 첫 저장(createTeamExpenseDraft)도 saveExpenseDraft와 같은 선결제 사유 판정을 지난다(EA-1 판정은 06.5 D-6520으로 걷었다).
describe("새 팀 비용 첫 저장 — 선결제 사유", () => {
  async function teamDraftRows(fx: ExpenseFixture): Promise<number> {
    return (await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.drafterId, fx.pm.id))).length;
  }

  it("선결제 · 사유 빔이면 칸 오류로 거부되고 문서가 생기지 않는다", async () => {
    const fx = await setupExpenseProject();
    const before = await teamDraftRows(fx);
    const failure = await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { prepaid: true, prepaidReason: "  " } }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ExpenseFieldError);
    expect(failure).toMatchObject({ field: "prepaidReason", message: PREPAID_REASON_REQUIRED });
    expect(await teamDraftRows(fx)).toBe(before);
  });
});

// 사용자 결정 10/7 09:08(06-06 검토 I-2): 지급 완료된 지출결의는 경영관리도 공급가액을 고칠 수 없다 — 잠금 뒤 판정(260907 expenses.ts:5509 「이미 지급이 나간 건」).
// 기안자 경로(saveExpenseDraft)는 O-4로 이미 편집 가능 상태에서만 열려 지급 완료 문서에는 닿지 않는다.
describe("지급 완료 문서의 공급가액 고침 막힘(I-2 · 06.5 D-6520 카드 ②)", () => {
  async function paidConfirmedDoc() {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    const manager = await payer();
    const confirmed = await confirmEvidence(manager, { expenseId: doc.expenseId, version: doc.version });
    const preview = await previewPayable(manager, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const paid = await completeExpensePayment(manager, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
    return { manager, expenseId: doc.expenseId, version: paid.version };
  }

  async function logCount(expenseId: string, actionType: string): Promise<number> {
    return (await db.select({ entityId: actionLog.entityId }).from(actionLog).where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, actionType)))).length;
  }

  it("지급 완료 뒤 공급가액 고쳐 확인 → LOCKED 거부 · 문서 · 확인 기록 · version · 행동 로그 그대로", async () => {
    const { manager, expenseId, version } = await paidConfirmedDoc();
    const rowBefore = await expenseRow(expenseId);
    const [reviewBefore] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
    const logsBefore = await logCount(expenseId, "evidence_amount_change");

    const failure = await confirmEvidence(manager, { expenseId, version, correctedSupplyAmount: 12_000_000 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EvidenceReviewConflictError);
    expect((failure as Error).message).toBe(SUPPLY_CORRECTION_PAID_LOCKED);
    expect(await expenseRow(expenseId)).toEqual(rowBefore);
    expect((await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId)))[0]).toEqual(reviewBefore);
    expect(await logCount(expenseId, "evidence_amount_change")).toBe(logsBefore);
  });

  it("지급 완료 뒤에도 금액을 바꾸지 않는 확인은 통과한다(P5 — 확인만 기록)", async () => {
    const { manager, expenseId, version } = await paidConfirmedDoc();
    const result = await confirmEvidence(manager, { expenseId, version });
    expect(result.evidenceStatus).toBe("확인됨");
    expect(await expenseRow(expenseId)).toMatchObject({ supplyAmountKrw: 12_400_000 });
  });

  // 06.5 D-6520: 선결제 지급 뒤 들어온 증빙 — 빈 증빙 금액이어도 고침 없이 확인되고(지급액이 공급가에서 나왔다), 공급가를 바꾸는 고침만 막힌다.
  async function paidPrepaidWithLateEvidence() {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId, version } = await submitPrepaid(fx);
    await approveBoth(fx, instanceId, version);
    const manager = await payer();
    const preview = await previewPayable(manager, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    await completeExpensePayment(manager, { expenseId, expectedPayableKrw: preview.payableKrw, version: (await expenseRow(expenseId)).version });
    await attachEvidence(fx.pm, expenseId);
    const [payment] = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId));
    if (!payment?.grossSupplyKrw) throw new Error("지급 공급가 없음");
    const row = await expenseRow(expenseId);
    return { manager, expenseId, version: row.version, grossSupplyKrw: payment.grossSupplyKrw };
  }

  it("선결제 지급 뒤 빈 증빙 금액 · 고침 없는 확인 → 확인됨 · 공급가 그대로(지급 공급가와 같다) · 같은 값 고침도 같음으로 통과", async () => {
    const { manager, expenseId, version, grossSupplyKrw } = await paidPrepaidWithLateEvidence();
    const result = await confirmEvidence(manager, { expenseId, version });
    expect(result.evidenceStatus).toBe("확인됨");
    expect(await expenseRow(expenseId)).toMatchObject({ supplyAmountKrw: grossSupplyKrw });
    const again = await confirmEvidence(manager, { expenseId, version: result.version, correctedSupplyAmount: grossSupplyKrw });
    expect(again.evidenceStatus).toBe("확인됨");
    expect(await logCount(expenseId, "evidence_amount_change")).toBe(0);
  });

  it("선결제 지급 뒤 공급가액을 다른 값으로 고치면 LOCKED 거부 · 문서 · version · 로그 그대로", async () => {
    const { manager, expenseId, version, grossSupplyKrw } = await paidPrepaidWithLateEvidence();
    const rowBefore = await expenseRow(expenseId);
    const logsBefore = await logCount(expenseId, "evidence_amount_change");
    const failure = await confirmEvidence(manager, { expenseId, version, correctedSupplyAmount: grossSupplyKrw - 1 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EvidenceReviewConflictError);
    expect((failure as Error).message).toBe(SUPPLY_CORRECTION_PAID_LOCKED);
    expect(await expenseRow(expenseId)).toEqual(rowBefore);
    expect(await logCount(expenseId, "evidence_amount_change")).toBe(logsBefore);
  });

  it("지급을 취소하면 다시 고칠 수 있다(지급 완료 상태에서만 막는다)", async () => {
    const { manager, expenseId, version } = await paidConfirmedDoc();
    const cancelled = await cancelExpensePayment(manager, { expenseId, reason: "이체 오류", version });
    const result = await confirmEvidence(manager, { expenseId, version: cancelled.version, correctedSupplyAmount: 12_000_000 });
    expect(result.evidenceStatus).toBe("확인됨");
    expect((await expenseRow(expenseId)).supplyAmountKrw).toBe(12_000_000);
  });
});

// ── 증빙 면제(D-603 · D-611 · S4) ────────────────────────────────────────────
describe("증빙 면제 (06-10)", () => {
  async function reviewRows(expenseId: string) {
    return db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  }

  async function waiveLogs(expenseId: string) {
    return db
      .select({ actorId: actionLog.actorId, detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "evidence_waive")));
  }

  async function untouched(expenseId: string, run: () => Promise<unknown>) {
    const rowBefore = await expenseRow(expenseId);
    const reviewsBefore = await reviewRows(expenseId);
    const logsBefore = await waiveLogs(expenseId);
    const failure = await run().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeDefined();
    expect(await expenseRow(expenseId)).toEqual(rowBefore);
    expect(await reviewRows(expenseId)).toEqual(reviewsBefore);
    expect(await waiveLogs(expenseId)).toEqual(logsBefore);
    return failure as Error;
  }

  it("면제 뒤 지급 통과 — P3 문서를 사유와 함께 면제하면 확인 기록 waived · version + 1 · 로그 한 줄 · 응답 actionRow P4, 증빙 필수 on에서도 지급 완료", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const manager = await payer();
    // 면제 전에는 증빙 게이트가 지급을 막는다.
    const view = await getPaymentView(manager, doc.expenseId);
    expect(view?.row).toMatchObject({ row: "P3", primary: "pay", tertiary: "waive" });

    const result = await waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason: "  거래처 폐업 · 영수증 수취 불가  " });

    expect(result.version).toBe(doc.version + 1);
    expect(result.evidenceStatus).toBe("면제");
    expect(result.actionRow).toMatchObject({ row: "P4", primary: "pay", blockReason: null });
    expect((await expenseRow(doc.expenseId)).version).toBe(result.version);
    expect(await reviewRows(doc.expenseId)).toMatchObject([{ status: "waived", waiveReason: "거래처 폐업 · 영수증 수취 불가", reviewedBy: manager.id, amountBeforeKrw: null, amountAfterKrw: null }]);
    expect(await waiveLogs(doc.expenseId)).toEqual([{ actorId: manager.id, detail: { reason: "거래처 폐업 · 영수증 수취 불가" } }]);

    const preview = await previewPayable(manager, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const paid = await completeExpensePayment(manager, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: result.version });
    expect(paid.version).toBe(result.version + 1);
  });

  it("면제가 선결제를 이긴다 — 면제된 선결제 문서는 지급 DTO prepaidDue null · 증빙 상태 면제 · 선결제 표시 · 사유 그대로", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const { expenseId, instanceId, version } = await submitPrepaid(fx);
    await approveBoth(fx, instanceId, version);
    const manager = await payer();
    const longAgo = addDays(seoulToday(), -60);
    const before = await getPaymentView(manager, expenseId);
    expect(before?.row).toMatchObject({ tertiary: "waive" });
    // 지급 뒤에도 면제된다(P6) — 기한은 지급일 + 14일이 한참 지나 경과로 표시되던 문서다.
    const preview = await previewPayable(manager, { expenseId, payDate: longAgo });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const paid = await completeExpensePayment(manager, { expenseId, payDate: longAgo, expectedPayableKrw: preview.payableKrw, version: (await expenseRow(expenseId)).version });
    const paidView = await getPaymentView(manager, expenseId);
    expect(paidView?.evidenceStatus).toBe("선결제");
    expect(typeof paidView?.prepaidDue?.overdueDays).toBe("number");
    const payments = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId));

    const waived = await waiveEvidence(manager, { expenseId, version: paid.version, reason: "증빙 끝내 못 받음" });

    expect(waived.evidenceStatus).toBe("면제");
    expect(waived.actionRow).toMatchObject({ row: "P6", primary: null, tertiary: null });
    const after = await getPaymentView(manager, expenseId);
    expect(after?.evidenceStatus).toBe("면제");
    expect(after?.prepaidDue ?? null).toBeNull();
    // 지급 기록 · 선결제 표시 · 선결제 사유는 그대로다.
    const row = await expenseRow(expenseId);
    expect(row.prepaid).toBe(true);
    expect(row.prepaidReason).toBe("행사장 선입금 요구");
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toEqual(payments);
  });

  it("증빙 필수 off 문서(P4)도 면제된다", async () => {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const manager = await payer();
    const view = await getPaymentView(manager, doc.expenseId);
    expect(view?.row).toMatchObject({ row: "P4", tertiary: "waive" });
    const result = await waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason: "소액 현금 지출" });
    expect(result.evidenceStatus).toBe("면제");
    expect(result.actionRow).toMatchObject({ row: "P4", primary: "pay", tertiary: null });
  });

  it("면제 로그는 끌 수 없다 — action_log.optional_types를 비워도 evidence_waive가 남는다", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, [], null);
    try {
      const fx = await setupExpenseProject();
      const doc = await approvedExpenseWithoutEvidence(fx);
      const manager = await payer();
      await waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason: "증빙 수취 불가" });
      expect(await waiveLogs(doc.expenseId)).toEqual([{ actorId: manager.id, detail: { reason: "증빙 수취 불가" } }]);
    } finally {
      await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, ACTION_LOG_OPTIONAL_TYPES.default ?? [], null);
    }
  });

  it("사유가 비거나 공백뿐이면 거부 `사유 없음 · 사유 적기` — 행 · 로그 불변", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const manager = await payer();
    for (const reason of ["", "   "]) {
      const failure = await untouched(doc.expenseId, () => waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason }));
      expect(failure.message).toBe("사유 없음 · 사유 적기");
    }
  });

  it("지급 권한이 없는 사람(기안자 포함)은 면제할 수 없다(D-601)", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    for (const viewer of [fx.pm, fx.lead, fx.ceo]) {
      const failure = await untouched(doc.expenseId, () => waiveEvidence(viewer, { expenseId: doc.expenseId, version: doc.version, reason: "면제 요청" }));
      expect(failure).toBeInstanceOf(ForbiddenError);
    }
  });

  it("결재 통과 전 문서 · 살아 있는 증빙이 있는 문서 · 이미 면제된 문서 · version이 다른 요청은 거부 — 행 · 로그 불변", async () => {
    const manager = await payer();
    // 결재 중
    const fxA = await setupExpenseProject();
    const pending = await submitPrepaid(fxA);
    const notApproved = await untouched(pending.expenseId, async () => waiveEvidence(manager, { expenseId: pending.expenseId, version: (await expenseRow(pending.expenseId)).version, reason: "이르다" }));
    expect(notApproved).toBeInstanceOf(GateBlockedError);
    // 증빙 있음
    const fxB = await setupExpenseProject();
    const withEvidence = await approvedExpenseWithEvidence(fxB);
    const alive = await untouched(withEvidence.expenseId, () => waiveEvidence(manager, { expenseId: withEvidence.expenseId, version: withEvidence.version, reason: "증빙 있음" }));
    expect(alive.message).toBe("증빙 있음 · 증빙 확인");
    // 이미 면제 · version 불일치
    const fxC = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fxC);
    const stale = await untouched(doc.expenseId, () => waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version + 7, reason: "옛 화면" }));
    expect(stale).toBeInstanceOf(EvidenceReviewConflictError);
    const first = await waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason: "첫 면제" });
    const again = await untouched(doc.expenseId, () => waiveEvidence(manager, { expenseId: doc.expenseId, version: first.version, reason: "두 번째" }));
    expect(again.message).toBe("이미 면제 · 새로 고침");
  });

  it("면제 동시 두 요청 — 장벽: A가 문서 잠금을 쥔 동안 B가 기다리고, A가 끝나면 B는 동시성 거부 · 확인 기록 한 줄 · 로그 한 줄", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const manager = await payer();
    const locked = deferred();
    const release = deferred();

    const a = waiveEvidence(
      manager,
      { expenseId: doc.expenseId, version: doc.version, reason: "첫 요청" },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    const b = waiveEvidence(manager, { expenseId: doc.expenseId, version: doc.version, reason: "둘째 요청" }).then(
      () => undefined,
      (error: unknown) => error,
    );
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    await a;
    const error = await b;
    expect(error).toBeInstanceOf(EvidenceReviewConflictError);
    expect(await reviewRows(doc.expenseId)).toHaveLength(1);
    expect(await waiveLogs(doc.expenseId)).toHaveLength(1);
  }, 20_000);
});

// PR #183 /review B-1 — 사용자 결정(10/7 11:04 「지급액과 같을 때만」): 지급 뒤 빈 증빙 금액은 규칙 종류마다 지급 때의 세전 금액(증빙 금액과
// 같은 기준)과 같을 때만 받는다. 부가세 · 원천징수 · 세금 없음 세 갈래 — 선결제 지급(공급가 12,400,000 기준) → 증빙 첨부 → 확인.
describe("[183 /review B-1] 선결제 지급 뒤 빈 증빙 금액 확인 — 규칙 종류마다(06.5 D-6520)", () => {
  async function paidPrepaid(evidenceType: string) {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx);
    await save(fx, expenseId, { prepaid: true, prepaidReason: "행사장 선입금 요구", evidenceType });
    const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version });
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    await approveBoth(fx, submitted.instanceId, submitted.version);
    const manager = await payer();
    const preview = await previewPayable(manager, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    await completeExpensePayment(manager, { expenseId, expectedPayableKrw: preview.payableKrw, version: (await expenseRow(expenseId)).version });
    await attachEvidence(fx.pm, expenseId);
    const row = await expenseRow(expenseId);
    return { manager, expenseId, version: row.version, supplyKrw: row.supplyAmountKrw ?? 0 };
  }

  it.each([
    ["부가세(세금계산서)", "tax_invoice"],
    ["원천징수(사업소득 3.3%)", "business_income"],
    ["세금 없음(계산서)", "invoice"],
  ])("%s — 공급가를 바꾸는 고침은 LOCKED · 고침 없는 확인은 확인됨 · 공급가 그대로", async (_label, evidenceType) => {
    const { manager, expenseId, version, supplyKrw } = await paidPrepaid(evidenceType);
    expect(supplyKrw).toBe(12_400_000);
    const locked = await confirmEvidence(manager, { expenseId, version, correctedSupplyAmount: supplyKrw - 1 }).catch((error: unknown) => error);
    expect(locked).toBeInstanceOf(EvidenceReviewConflictError);
    expect((locked as Error).message).toBe(SUPPLY_CORRECTION_PAID_LOCKED);
    const result = await confirmEvidence(manager, { expenseId, version });
    expect(result.evidenceStatus).toBe("확인됨");
    expect(await expenseRow(expenseId)).toMatchObject({ supplyAmountKrw: supplyKrw });
  });

  it("사전 조회 뒤 풀 밖 연결이 지급을 취소하고 다른 지급일로 다시 지급 → 잠금 뒤 판정이 살아 있는 지급을 보고 고침 LOCKED · 공급가 그대로", async () => {
    const { manager, expenseId, version, supplyKrw } = await paidPrepaid("business_income");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM expenses WHERE id = $1 FOR UPDATE", [expenseId]);
      const confirming = confirmEvidence(manager, { expenseId, version, correctedSupplyAmount: supplyKrw - 1 }).catch((error: unknown) => error);
      await waitForLockWaiter(pool);
      const { rows } = await client.query<{ id: string; payable_krw: string; payment_method: string; processed_by: string }>(
        "UPDATE expense_payments SET cancelled_at = now(), cancelled_by = processed_by, cancel_reason = '재지급' WHERE expense_id = $1 AND cancelled_at IS NULL RETURNING id, payable_krw, payment_method, processed_by",
        [expenseId],
      );
      const old = rows[0];
      if (!old) throw new Error("지급 없음");
      await client.query(
        "INSERT INTO expense_payments (expense_id, pay_date, transfer_krw, payable_krw, diff_krw, payment_method, processed_by) VALUES ($1, $2, $3, $3, 0, $4, $5)",
        [expenseId, addDays(seoulToday(), -1), old.payable_krw, old.payment_method, old.processed_by],
      );
      await client.query("COMMIT");
      const failure = await confirming;
      expect(failure).toBeInstanceOf(EvidenceReviewConflictError);
      expect((failure as Error).message).toBe(SUPPLY_CORRECTION_PAID_LOCKED);
      expect((await expenseRow(expenseId)).supplyAmountKrw).toBe(supplyKrw);
    } finally {
      client.release();
    }
  });
});
