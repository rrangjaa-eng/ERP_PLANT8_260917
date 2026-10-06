import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, expensePayments, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { seoulToday } from "@/lib/dates";
import { completeExpensePaymentAction, previewPayableAction } from "@/app/(app)/expenses/[id]/actions";
import { setupExpenseProject } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-04(EXP-09 · EVID-02 · EXP-06 · OPS-09) — 지급 섹션 S5: 이체액 · 차이 사유 · 미래 지급일 · 지급일 달력 검증(E-20) ·
// 증빙 · 짝 게이트 · 예정일 저장 · 지급 취소 · 동시성. 통과를 기대하는 케이스는 06-03처럼 증빙 0 · evidence.required = false 문서로 만든다
// (06-06이 「증빙 있음 · 확인 전」을 막는다 — O-2). 액션 경계 케이스는 05 revenue-entries 꼴(세션 · revalidatePath 대역 + 액션 직접 호출).

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeAll(async () => {
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
