import { and, eq, isNull, sql } from "drizzle-orm";
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, expensePayments, expenses, files, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import {
  cancelExpensePayment,
  completeExpensePayment,
  decidePayable,
  getPaymentView,
  loadPaymentInputs,
  PayableChangedError,
  PaymentAlreadyDoneError,
  PaymentConflictError,
  PaymentNotFoundError,
  previewPayable,
  saveScheduledPayDate,
} from "@/domain/payments";
import { GateBlockedError } from "@/domain/rules/gate";
import { TRANSFER_FRACTION, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { ACTION_LOG_OPTIONAL_TYPES, PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { markVoided } from "@/repositories/files";
import { ForbiddenError } from "@/domain/permissions/can";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { seoulToday } from "@/lib/dates";
import { cancelExpensePaymentAction, completeExpensePaymentAction, previewPayableAction, saveScheduledPayDateAction } from "@/app/(app)/expenses/[id]/actions";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06-04(EXP-09 · EVID-02 · EXP-06 · OPS-09) — 지급 섹션 S5: 이체액 · 차이 사유 · 미래 지급일 · 지급일 달력 검증(E-20) ·
// 증빙 · 짝 게이트 · 예정일 저장 · 지급 취소 · 동시성. 통과를 기대하는 케이스는 06-03처럼 증빙 0 · evidence.required = false 문서로 만든다
// (06-06이 「증빙 있음 · 확인 전」을 막는다 — O-2). 액션 경계 케이스는 05 revenue-entries 꼴(세션 · revalidatePath 대역 + 액션 직접 호출).

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// setup.ts가 매 테스트 전 TRUNCATE + 시드로 설정을 기본값(evidence.required = true)으로 되돌린다 — beforeAll이면 둘째 테스트부터 증빙 게이트에 막힌다.
beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 06-03 지급 권한자 + 금액 · 값 정보 항목 노출(지급 총액 미리보기 DTO가 expense.amount로 투영된다 — 노출 없는 계급은 금액 칸이 빠진다).
async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function snapshot(expenseId: string) {
  const [row] = await db
    .select({ version: expenses.version, evidenceAmount: expenses.evidenceAmount, supplyAmountKrw: expenses.supplyAmountKrw, scheduledPaymentDate: expenses.scheduledPaymentDate })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  const payments = await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId));
  const [logs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionLog)
    .where(eq(actionLog.entityId, expenseId));
  return { ...row, payments, logCount: logs?.count ?? 0 };
}

async function payableNow(payer: Viewer, doc: ApprovedExpense, payDate = seoulToday()): Promise<number> {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
  return preview.payableKrw;
}

describe("지급 완료 — 이체액 · 차이 사유 · 미래 지급일 (06-04 Task 1)", () => {
  it("지급일 달력 검증 — 달력에 없는 날짜는 05 DATE_FORMAT_ERROR 입력 오류로 DB까지 가지 않고, 미래 지급일은 통과한다(E-20 · Q6)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    session.viewer = payer;
    const before = await snapshot(doc.expenseId);

    for (const payDate of ["2026-02-30", "0000-01-01", "2026-9-7"]) {
      const paid = await completeExpensePaymentAction({ expenseId: doc.expenseId, payDate, expectedPayableKrw: 1, version: doc.version, transferKrw: 1 });
      expect(JSON.stringify(paid?.validationErrors), payDate).toContain(DATE_FORMAT_ERROR);
      expect(paid?.serverError, payDate).toBeUndefined();
      const preview = await previewPayableAction({ expenseId: doc.expenseId, payDate });
      expect(JSON.stringify(preview?.validationErrors), payDate).toContain(DATE_FORMAT_ERROR);
      expect(preview?.serverError, payDate).toBeUndefined();
    }

    const after = await snapshot(doc.expenseId);
    expect(after.payments).toHaveLength(0);
    expect([after.version, after.logCount]).toEqual([before.version, before.logCount]);

    const future = addDays(seoulToday(), 10);
    const preview = await previewPayableAction({ expenseId: doc.expenseId, payDate: future });
    expect(preview?.validationErrors).toBeUndefined();
    expect(preview?.data?.payDate).toBe(future);
  });

  it("이체액 ≠ 지급 총액 · 사유 없음 → `차이 사유 없음 · 사유 적기`로 거부되고 지급 기록이 없다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    session.viewer = payer;
    const payable = await payableNow(payer, doc);

    const result = await completeExpensePaymentAction({ expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version, transferKrw: payable - 3_300 });
    expect(result?.serverError).toBe("차이 사유 없음 · 사유 적기");
    expect((await snapshot(doc.expenseId)).payments).toHaveLength(0);
  });

  it("이체액이 달라도 사유와 함께 미래 지급일로 저장되고 · 차이 = 이체액 − 지급 총액 · 비용 기준 값(증빙 금액 · 공급가액)은 그대로다(D-605 · Q6)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    session.viewer = payer;
    const future = addDays(seoulToday(), 10);
    const payable = await payableNow(payer, doc, future);
    const before = await snapshot(doc.expenseId);

    const result = await completeExpensePaymentAction({
      expenseId: doc.expenseId,
      payDate: future,
      expectedPayableKrw: payable,
      version: doc.version,
      transferKrw: payable - 3_300,
      diffReason: "이체 수수료 차감",
    });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data?.version).toBe(doc.version + 1);

    const after = await snapshot(doc.expenseId);
    expect(after.payments).toHaveLength(1);
    const [payment] = after.payments;
    expect([payment?.payDate, payment?.transferKrw, payment?.payableKrw, payment?.diffKrw, payment?.diffReason]).toEqual([
      future,
      payable - 3_300,
      payable,
      -3_300,
      "이체 수수료 차감",
    ]);
    // 부가세 규칙(세금계산서) — 공급가 역산은 이체액에서(UA-619).
    expect(payment?.grossSupplyKrw).not.toBeNull();
    expect([after.evidenceAmount, after.supplyAmountKrw]).toEqual([before.evidenceAmount, before.supplyAmountKrw]);
  });

  it("차이 0이면 사유 없이 저장되고 diff_reason은 null이다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);

    await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version, transferKrw: payable });
    const [payment] = await db
      .select({ diffKrw: expensePayments.diffKrw, diffReason: expensePayments.diffReason })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, doc.expenseId), isNull(expensePayments.cancelledAt)));
    expect(payment).toEqual({ diffKrw: 0, diffReason: null });
  });

  it("previewPayable은 지급 총액 · 차이만 돌려주고 행동 로그 · 문서 version을 바꾸지 않는다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const before = await snapshot(doc.expenseId);
    const payable = await payableNow(payer, doc);

    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday(), transferKrw: payable + 1_200 });
    expect([preview.payableKrw, preview.diffKrw]).toEqual([payable, 1_200]);
    const after = await snapshot(doc.expenseId);
    expect([after.version, after.logCount, after.payments.length]).toEqual([before.version, before.logCount, 0]);
  });
});

describe("지급 예정일 저장 (06-04 Task 2 · SP-3 ②)", () => {
  it("예정일만 갱신 · 미래 날짜 허용 · 문서 version + 1 · document_update(전후 날짜)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const before = await snapshot(doc.expenseId);
    const future = addDays(seoulToday(), 40);

    const result = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: future, version: doc.version });
    expect(result.version).toBe(doc.version + 1);
    const after = await snapshot(doc.expenseId);
    expect([after.scheduledPaymentDate, after.version, after.payments.length]).toEqual([future, doc.version + 1, 0]);
    expect([after.evidenceAmount, after.supplyAmountKrw]).toEqual([before.evidenceAmount, before.supplyAmountKrw]);
    const logs = await db
      .select({ actionType: actionLog.actionType, actorId: actionLog.actorId, detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, doc.expenseId), eq(actionLog.actionType, "document_update")));
    expect(logs.at(-1)).toMatchObject({ actorId: payer.id, detail: { field: "scheduledPaymentDate", before: before.scheduledPaymentDate, after: future } });
  });

  it("version이 어긋나면 `다른 사람이 {HH:mm}에 바꿈 · 새로 고침`으로 거부되고 예정일은 그대로다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const before = await snapshot(doc.expenseId);

    const error = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: addDays(seoulToday(), 5), version: doc.version - 1 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PaymentConflictError);
    expect((error as Error).message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    const after = await snapshot(doc.expenseId);
    expect([after.scheduledPaymentDate, after.version, after.logCount]).toEqual([before.scheduledPaymentDate, before.version, before.logCount]);
  });

  it("지급 권한(expenses.payments write)이 없으면 ForbiddenError(D-601)", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    for (const viewer of [fx.pm, fx.ceo]) {
      await expect(saveScheduledPayDate(viewer, { expenseId: doc.expenseId, scheduledPayDate: seoulToday(), version: doc.version })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("예정일 달력 검증 — 달력에 없는 날짜는 05 DATE_FORMAT_ERROR 입력 오류로 DB까지 가지 않고, 미래 날짜는 액션으로 저장된다(E-20 · Q6)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    session.viewer = payer;
    const before = await snapshot(doc.expenseId);

    for (const scheduledPayDate of ["2026-02-30", "0000-01-01", "2026-9-7"]) {
      const saved = await saveScheduledPayDateAction({ expenseId: doc.expenseId, scheduledPayDate, version: doc.version });
      expect(JSON.stringify(saved?.validationErrors), scheduledPayDate).toContain(DATE_FORMAT_ERROR);
      expect(saved?.serverError, scheduledPayDate).toBeUndefined();
    }
    const unchanged = await snapshot(doc.expenseId);
    expect([unchanged.scheduledPaymentDate, unchanged.version, unchanged.logCount]).toEqual([before.scheduledPaymentDate, before.version, before.logCount]);

    const future = addDays(seoulToday(), 400);
    const saved = await saveScheduledPayDateAction({ expenseId: doc.expenseId, scheduledPayDate: future, version: doc.version });
    expect(saved?.data).toEqual({ version: doc.version + 1 });
    expect((await snapshot(doc.expenseId)).scheduledPaymentDate).toBe(future);
  });

  it("지급된 문서의 예정일은 저장하지 않는다 — `이미 지급 완료 · 새로 고침`", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);
    const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version });
    await expect(saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: seoulToday(), version: paid.version })).rejects.toThrow("이미 지급 완료 · 새로 고침");
  });
});

// ── Task 3 — 지급 취소 · 동시성 · 권한 · 완료 프로젝트 · 게이트 · 잠금 뒤 재판정 ──────────────────────────

async function payNow(payer: Viewer, doc: ApprovedExpense) {
  return completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: await payableNow(payer, doc), version: doc.version });
}

async function livePayments(expenseId: string) {
  return db
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("지급 취소 (06-04 Task 3 · D-606)", () => {
  it("사유가 비거나 공백이면 `사유 없음 · 사유 적기`로 거부되고 지급 기록 · version은 그대로다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    for (const reason of ["", "   "]) {
      await expect(cancelExpensePayment(payer, { expenseId: doc.expenseId, reason, version: paid.version })).rejects.toThrow("사유 없음 · 사유 적기");
    }
    const after = await snapshot(doc.expenseId);
    expect([after.version, after.payments.length, after.payments[0]?.cancelledAt ?? null]).toEqual([paid.version, 1, null]);
  });

  it("사유와 함께 취소하면 취소 표시만(행 삭제 없음) · 문서 version + 1 · payment_cancel 한 줄 · 문서가 지급 전(1차 `지급 완료`)으로 돌아간다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);

    const result = await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "  계좌 오입력  ", version: paid.version });
    expect(result.version).toBe(paid.version + 1);
    const after = await snapshot(doc.expenseId);
    expect(after.version).toBe(paid.version + 1);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ id: paid.paymentId, cancelledBy: payer.id, cancelReason: "계좌 오입력" });
    expect(after.payments[0]?.cancelledAt).toBeInstanceOf(Date);
    const logs = await db
      .select({ actorId: actionLog.actorId, detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, doc.expenseId), eq(actionLog.actionType, "payment_cancel")));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: payer.id,
      detail: { paymentId: paid.paymentId, reason: "계좌 오입력", payDate: paid.payDate, transferKrw: after.payments[0]?.transferKrw },
    });
    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ row: "P4", primary: "pay" });
  });

  it("지급 기록이 없으면 `이미 지급 취소됨 · 새로 고침`", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    const cancelled = await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "중복", version: paid.version });
    await expect(cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "중복", version: cancelled.version })).rejects.toThrow("이미 지급 취소됨 · 새로 고침");
  });

  it("version이 어긋나면 `다른 사람이 {HH:mm}에 바꿈 · 새로 고침`으로 거부되고 지급 기록은 살아 있다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    const error = await caught(cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "중복", version: paid.version - 1 }));
    expect(error).toBeInstanceOf(PaymentConflictError);
    expect((error as Error).message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(await livePayments(doc.expenseId)).toHaveLength(1);
  });

  it("행동 로그 선택 종류를 전부 꺼도 지급 취소 로그는 남는다(끌 수 없는 종류)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, [], null);
    await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "중복 지급", version: paid.version });
    const logs = await db
      .select({ seq: actionLog.seq })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, doc.expenseId), eq(actionLog.actionType, "payment_cancel")));
    expect(logs).toHaveLength(1);
  });

  it("취소 뒤 다시 지급 완료하면 새 살아 있는 기록 하나(부분 유니크가 취소 행을 세지 않는다)", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    const cancelled = await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "금액 오류", version: paid.version });
    const again = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: await payableNow(payer, doc), version: cancelled.version });
    const live = await livePayments(doc.expenseId);
    expect(live.map((row) => row.id)).toEqual([again.paymentId]);
    const all = await db.select({ id: expensePayments.id }).from(expensePayments).where(eq(expensePayments.expenseId, doc.expenseId));
    expect(all).toHaveLength(2);
  });

  it("완료(completed) 프로젝트의 문서도 지급 완료 · 지급 취소가 된다(U-4)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    // 테스트 준비 전용 — 프로젝트를 완료 상태로(프로덕션 경로 아님).
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const paid = await payNow(payer, doc);
    const cancelled = await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "정산 뒤 정정", version: paid.version });
    expect(cancelled.version).toBe(paid.version + 1);
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("액션 — 사유 · version만 받고 취소한다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const paid = await payNow(payer, doc);
    session.viewer = payer;
    const result = await cancelExpensePaymentAction({ expenseId: doc.expenseId, reason: "계좌 오입력", version: paid.version });
    expect(result?.data).toEqual({ version: paid.version + 1 });
  });
});

describe("지급 동시성 · 권한 · 조작 (06-04 Task 3)", () => {
  it("동시 두 지급 완료 — 장벽: A가 문서 행 잠금을 쥔 동안 B가 기다리고, A가 끝나면 B는 `{사람}이 {HH:mm}에 지급 완료함 · 새로 고침`", async () => {
    const payer = await makePayer("이과장");
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const expectedPayableKrw = await payableNow(payer, doc);
    const locked = deferred();
    const release = deferred();

    const a = completeExpensePayment(
      payer,
      { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    const b = caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version }));
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    await a;
    const error = await b;
    expect(error).toBeInstanceOf(PaymentAlreadyDoneError);
    expect((error as Error).message).toMatch(/^이과장이 \d{2}:\d{2}에 지급 완료함 · 새로 고침$/);
    expect(await livePayments(doc.expenseId)).toHaveLength(1);
  }, 20_000);

  it("지급 권한 없는 계정 · 대표 계정은 지급 완료 · 지급 취소 · 예정일 저장 · 미리보기가 모두 ForbiddenError(D-601 · 06-03 검토 P3-1)", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    for (const viewer of [fx.pm, fx.ceo]) {
      const today = seoulToday();
      await expect(completeExpensePayment(viewer, { expenseId: doc.expenseId, expectedPayableKrw: 1, version: doc.version })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelExpensePayment(viewer, { expenseId: doc.expenseId, reason: "취소", version: doc.version })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveScheduledPayDate(viewer, { expenseId: doc.expenseId, scheduledPayDate: today, version: doc.version })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(previewPayable(viewer, { expenseId: doc.expenseId, payDate: today })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await snapshot(doc.expenseId)).payments).toHaveLength(0);
  });

  it("조작된 페이로드 — 액션 입력에 지급 총액 · 역산 값을 실어도 저장 행은 서버 재계산값이다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);
    session.viewer = payer;
    const tampered = { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version, transferKrw: payable, payableKrw: 1, grossSupplyKrw: 1, diffKrw: 0 };
    const result = await completeExpensePaymentAction(tampered);
    expect(result?.serverError).toBeUndefined();
    const [row] = await livePayments(doc.expenseId);
    const pre = await loadPaymentInputs(payer, { expenseId: doc.expenseId });
    if (!pre.amount || !pre.tax) throw new Error("지급 총액을 셈할 수 없는 문서");
    const server = await decidePayable({ amount: pre.amount, taxRule: pre.tax.taxRule, applyOpts: pre.tax.dates.applyOpts, incomeType: pre.tax.incomeType }, pre.tax.rates);
    expect(server.payableKrw).toBe(payable);
    expect([row?.payableKrw, row?.grossSupplyKrw]).toEqual([server.payableKrw, server.grossSupplyKrw]);
  });

  // 06-04 검토 P3-4 — 액션 zod를 거치지 않는 호출(06-15 일괄 · 06-17)도 DB 오류(500) 대신 화면 문구로 거부된다.
  it("도메인이 이체액(안전한 양의 정수)을 스스로 검증한다 — 소수 · 0 이하 · 숫자 아님은 이체액 칸 문구로 거부 · 지급 기록 0", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const expectedPayableKrw = await payableNow(payer, doc);
    const cases: [number, string][] = [
      [1.5, TRANSFER_FRACTION],
      [0, TRANSFER_NOT_POSITIVE],
      [-3_300, TRANSFER_NOT_POSITIVE],
      [Number.NaN, TRANSFER_NOT_NUMBER],
      [Number.MAX_SAFE_INTEGER + 2, TRANSFER_NOT_NUMBER],
    ];
    for (const [transferKrw, message] of cases) {
      const error = await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version, transferKrw, diffReason: "수수료" }));
      expect(error, String(transferKrw)).toBeInstanceOf(UserFacingError);
      expect((error as Error).message, String(transferKrw)).toBe(message);
    }
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("지급 취소 · 예정일 저장은 UUID 모양이 아닌 문서 id를 PaymentNotFoundError로 거부한다(DB uuid 캐스트 오류 아님)", async () => {
    const payer = await makePayer();
    await expect(cancelExpensePayment(payer, { expenseId: "not-a-uuid", reason: "중복", version: 1 })).rejects.toBeInstanceOf(PaymentNotFoundError);
    await expect(saveScheduledPayDate(payer, { expenseId: "not-a-uuid", scheduledPayDate: seoulToday(), version: 1 })).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("expectedPayableKrw가 서버 재계산값과 다르면 PayableChangedError · 지급 기록 0", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);
    const error = await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable + 1, version: doc.version }));
    expect(error).toBeInstanceOf(PayableChangedError);
    expect((error as PayableChangedError).payableKrw).toBe(payable);
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("결재 통과 전 문서는 `결재 통과 전 · …`으로 거부 · 지급 기록 0", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("지출결의 없음");
    await submitReadyDraft(fx.pm, expenseId);
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    const error = await caught(completeExpensePayment(payer, { expenseId, expectedPayableKrw: 1, version: row?.version ?? 0 }));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toMatch(/^결재 통과 전 · /);
    expect(await livePayments(expenseId)).toHaveLength(0);
  });
});

describe("증빙 · 짝 게이트 (06-04 Task 2 · 3)", () => {
  it("증빙 필수 on이면 증빙 0 문서는 `증빙 없음 · 기안자 박서연`으로 막히고, off면 같은 문서가 지급된다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);
    await setEvidenceRequired(true);
    const error = await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version }));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("증빙 없음 · 기안자 박서연");
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
    await setEvidenceRequired(false);
    await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version });
    expect(await livePayments(doc.expenseId)).toHaveLength(1);
  });

  it("증빙 필수 on · 무효 파일만 남은 문서 → `증빙 없음 · 기안자 박서연`(무효 파일은 세지 않는다)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    const alive = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, doc.expenseId), isNull(files.voidedAt)));
    expect(alive.length).toBeGreaterThan(0);
    for (const file of alive) await markVoided(payer, { id: file.id, voidedBy: payer.id, reason: "다른 건 영수증" }, db);
    await setEvidenceRequired(true);
    const error = await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: 1, version: doc.version }));
    expect((error as Error).message).toBe("증빙 없음 · 기안자 박서연");
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("짝 목록이 있고 문서의 (지급 방식, 증빙 종류)가 목록 밖이면 짝 이유로 거부 · 지급 기록 0, 목록이 비면 통과", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const [row] = await db.select({ method: expenses.paymentMethod, evidenceType: expenses.evidenceType }).from(expenses).where(eq(expenses.id, doc.expenseId));
    if (!row?.method || !row.evidenceType) throw new Error("문서에 지급 방식 · 증빙 종류가 없다");
    const payable = await payableNow(payer, doc);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method: row.method, evidence: `not-${row.evidenceType}` }], null);
    const error = await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version }));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toMatch(/ 짝 아님 · 짝 설정은 관리자$/);
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
    await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version });
    expect(await livePayments(doc.expenseId)).toHaveLength(1);
  });

  // 06-04 검토 P3-1 — 증빙 게이트의 prepaid는 잠근 지출결의 행의 expenses.prepaid(index.ts judgeLockedPayment). false 고정 · 다른 값으로 바꾸면 빨갛다.
  it("증빙 필수 on · 증빙 0이어도 선결제(expenses.prepaid) 문서는 지급된다 — 증빙 게이트가 잠근 행의 prepaid를 읽는다", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(await setupExpenseProject());
    const payable = await payableNow(payer, doc);
    // 테스트 준비 전용 — 이 문서 행만 선결제로 바꾼다(version은 그대로라 화면이 본 문서와 같다).
    await db.update(expenses).set({ prepaid: true, prepaidReason: "현장 선결제" }).where(eq(expenses.id, doc.expenseId));
    await setEvidenceRequired(true);
    await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payable, version: doc.version });
    expect(await livePayments(doc.expenseId)).toHaveLength(1);
  });

  it(
    "잠금 뒤 게이트 재판정 — 증빙 게이트가 기준 재판정보다 먼저: 잠금 대기 중 증빙이 무효되고 증빙일도 바뀌면 PayableChangedError가 아니라 `증빙 없음 · 기안자 박서연`",
    async () => {
      const payer = await makePayer();
      const fx = await setupExpenseProject();
      const doc = await approvedExpenseWithEvidence(fx);
      await setEvidenceRequired(true);
      const expectedPayableKrw = await payableNow(payer, doc);
      const [file] = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, doc.expenseId), isNull(files.voidedAt)));
      if (!file) throw new Error("증빙 파일 없음");

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let txOpen = false;
      let call: Promise<unknown> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        await lockClient.query("SELECT id FROM expenses WHERE id = $1 FOR UPDATE", [doc.expenseId]);
        call = caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version }));

        let blocked = false;
        for (let attempt = 0; attempt < 40 && !blocked; attempt += 1) {
          const { rows } = await lockClient.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
            [lockPid],
          );
          blocked = (rows[0]?.count ?? 0) > 0;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(blocked, "지급 완료가 문서 행 잠금에서 막히지 않았다").toBe(true);

        await lockClient.query("UPDATE files SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1", [file.id, payer.id, "다른 건 영수증"]);
        await lockClient.query("UPDATE expenses SET evidence_date = DATE '2020-01-02' WHERE id = $1", [doc.expenseId]);
        await lockClient.query("COMMIT");
        txOpen = false;

        const error = await call;
        expect(error).not.toBeInstanceOf(PayableChangedError);
        expect(error).toBeInstanceOf(GateBlockedError);
        expect((error as Error).message).toBe("증빙 없음 · 기안자 박서연");
        expect(await livePayments(doc.expenseId)).toHaveLength(0);
      } finally {
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        if (call) await call;
      }
    },
    30_000,
  );
});
