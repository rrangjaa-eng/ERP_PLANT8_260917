import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { expensePayments } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { ForbiddenError } from "@/domain/permissions/can";
import { previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listPaymentTargets } from "@/domain/payments/targets";
import { seoulToday } from "@/lib/dates";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-15(EXP-09 · EXP-06 · AS1 · D-604) — 지급 대상 목록(S1)과 건별 트랜잭션 일괄 지급(S2). 통과를 기대하는 문서는 06-03 · 06-04처럼
// 증빙 0 · evidence.required = false로 만든다(P4). setup.ts가 매 테스트 전 TRUNCATE + 시드로 설정을 기본값으로 되돌린다.

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function livePayments(expenseId: string) {
  return db
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
}

async function payableNow(payer: Viewer, doc: ApprovedExpense, payDate = seoulToday()): Promise<number> {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
  return preview.payableKrw;
}

async function twoPayable(): Promise<{ fx: ExpenseFixture; a: ApprovedExpense; b: ApprovedExpense }> {
  const fx = await setupExpenseProject();
  const a = await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
  const b = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
  return { fx, a, b };
}

function rowsOf(list: Awaited<ReturnType<typeof listPaymentTargets>>) {
  return list.groups.flatMap((group) => group.rows);
}

describe("트레이서 (06-15 Task 1)", () => {
  it("지급 권한자의 지급 대상 = 결재 통과 · 지급 전 · 종결 아님 행만, 행마다 selectable · payableKrw · version / 지급 권한 없음 → ForbiddenError", async () => {
    const payer = await makePayer();
    const { fx, a, b } = await twoPayable();

    const list = await listPaymentTargets(payer, {});
    const rows = rowsOf(list);
    expect(rows.map((row) => row.id).sort()).toEqual([a.expenseId, b.expenseId].sort());
    for (const doc of [a, b]) {
      const row = rows.find((candidate) => candidate.id === doc.expenseId);
      expect(row?.selectable).toBe(true);
      expect(row?.reason).toBeNull();
      expect(row?.version).toBe(doc.version);
      expect(row?.payableKrw).toBe(await payableNow(payer, doc));
    }
    expect(list.total?.count).toBe(2);

    await expect(listPaymentTargets(fx.pm, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("completePaymentsBatch — 두 스냅숏을 건마다 처리해 살아 있는 지급 기록이 하나씩 · 결과 processed 2 · blocked 없음", async () => {
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rows = await Promise.all(
      [a, b].map(async (doc) => ({ expenseId: doc.expenseId, expenseVersion: doc.version, expectedPayableKrw: await payableNow(payer, doc) })),
    );

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(result.processed).toBe(2);
    expect(result.blocked).toEqual([]);
    expect(await livePayments(a.expenseId)).toHaveLength(1);
    expect(await livePayments(b.expenseId)).toHaveLength(1);
    expect(rowsOf(await listPaymentTargets(payer, {}))).toHaveLength(0);
  });
});
