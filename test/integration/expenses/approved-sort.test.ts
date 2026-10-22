import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expensePayments, expenses, projects } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { approveDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { buildExpenseSearch, listExpenses, type ExpenseList } from "@/domain/expenses/list";
import { addHoliday, deleteHoliday } from "@/domain/holidays/admin";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { listUnpaidApprovedScheduleSources } from "@/repositories/expenses";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject } from "../fixtures/expenses";
import { createInReviewExpenseFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// 07-06 Task 2(AQ-01 · B-P2-1): 승인 묶음 = 미지급 승인 건의 유효 예정일 ↑(도메인 사전 정렬 → SQL array_position) → 지급 끝난 승인 건(실제 지급일 ↑ → 번호 → id).
// 문서마다 프로젝트 이름을 시험 태그로 바꿔 검색으로 이 시험 문서만 본다(검색은 사전 정렬 읽기와 쪽 질의에 같이 걸린다).
// A: 증빙 06-01 → 07-31(금) · 승인 07-29 15:00(마감 07-30 14:00 안) / B: 수동 08-05 / C: 증빙 06-15 → 08-14(금).
// 07-31을 공휴일로 더하면 A의 첫 후보 07-30(마감 07-29 14:00)을 승인 시각이 넘어 다음 지급 가능 요일 08-07로 밀린다 → B, A, C.
const kst = (at: string) => new Date(`${at}:00+09:00`);

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`정렬-${randomUUID().slice(0, 6)}`);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function inReview(payer: Viewer, tag: string, issuedOn: string) {
  const fx = await setupExpenseProject();
  await db.update(projects).set({ name: `정렬${tag}` }).where(eq(projects.id, fx.projectId));
  const doc = await createInReviewExpenseFixture(fx, { linkRecordId: await insertRecordFixture(payer, { issuedOn }), linkedBy: payer.id });
  return { ...doc, fx };
}

async function approved(payer: Viewer, tag: string, input: { issuedOn: string; actedAt: Date; manual?: string; paidOn?: string }): Promise<string> {
  const doc = await inReview(payer, tag, input.issuedOn);
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [doc.fx.lead, doc.fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt: input.actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  if (input.manual) await db.update(expenses).set({ scheduledPaymentDate: input.manual }).where(eq(expenses.id, doc.expenseId));
  if (input.paidOn) {
    await db.insert(expensePayments).values({
      expenseId: doc.expenseId,
      payDate: input.paidOn,
      transferKrw: 1_000,
      payableKrw: 1_000,
      diffKrw: 0,
      paymentMethod: "bank_transfer",
      processedBy: payer.id,
      source: "test",
    });
  }
  return doc.expenseId;
}

function idsOf(list: ExpenseList): string[] {
  return list.groups.flatMap((group) => group.rows.map((row) => row.id ?? ""));
}

describe("승인 묶음 유효 예정일 정렬 (07-06 Task 2 · AQ-01 · B-P2-1)", () => {
  it("미지급 승인 건은 유효 예정일 순(수동 · 자동 섞임) · 쪽 나눔, 지급 끝난 건은 그 뒤 실제 지급일 순, 다른 묶음 순서 그대로 · 공휴일 변경이 다음 읽기에 반영", async () => {
    const payer = await makePayer();
    const tag = randomUUID().slice(0, 8);
    const q = `정렬${tag}`;
    const paidE = await approved(payer, tag, { issuedOn: "2026-06-01", actedAt: kst("2026-06-20T10:00"), paidOn: "2026-07-02" });
    const c = await approved(payer, tag, { issuedOn: "2026-06-15", actedAt: kst("2026-08-01T10:00") });
    const paidD = await approved(payer, tag, { issuedOn: "2026-06-20", actedAt: kst("2026-06-21T10:00"), paidOn: "2026-07-01" });
    const b = await approved(payer, tag, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-05" });
    const a = await approved(payer, tag, { issuedOn: "2026-06-01", actedAt: kst("2026-07-29T15:00") });
    const reviewing = await inReview(payer, tag, "2026-06-01");

    const all = await listExpenses(payer, { status: "approved", q }, { pageSize: 20 });
    expect(idsOf(all)).toEqual([a, b, c, paidD, paidE]);
    const rowOf = (id: string) => all.groups.flatMap((group) => group.rows).find((row) => row.id === id);
    expect(rowOf(a)).toMatchObject({ scheduledPaymentDate: "2026-07-31", scheduledPaymentManual: false });
    expect(rowOf(b)).toMatchObject({ scheduledPaymentDate: "2026-08-05", scheduledPaymentManual: true });
    expect(rowOf(c)).toMatchObject({ scheduledPaymentDate: "2026-08-14", scheduledPaymentManual: false });
    expect(all.groups.map((group) => group.label)).not.toContain("지급 예정일 없음");

    expect(idsOf(await listExpenses(payer, { status: "approved", q, page: 1 }, { pageSize: 2 }))).toEqual([a, b]);
    expect(idsOf(await listExpenses(payer, { status: "approved", q, page: 2 }, { pageSize: 2 }))).toEqual([c, paidD]);
    expect(idsOf(await listExpenses(payer, { status: "approved", q, page: 3 }, { pageSize: 2 }))).toEqual([paidE]);
    expect(idsOf(await listExpenses(payer, { status: "all", q }, { pageSize: 20 }))).toEqual([reviewing.expenseId, a, b, c, paidD, paidE]);

    // B-P2-1: 사전 정렬 읽기는 미지급 승인 건만(지급 끝난 D · E · 결재 중 건 없음).
    const [scope, search] = await Promise.all([visibleExpenseScope(payer), buildExpenseSearch(payer, "list", q)]);
    const sources = await listUnpaidApprovedScheduleSources(payer, { scope, documentKind: EXPENSE_DOCUMENT_KIND, ...(search ? { search } : {}) });
    expect(sources.map((source) => source.id).sort()).toEqual([a, b, c].sort());

    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `sort-${randomUUID()}@example.test`, name: "공휴일 관리", roleId: SYSADMIN_ROLE_ID });
    const admin: Viewer = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const holiday = await addHoliday(admin, { date: "2026-07-31", kind: "temporary", name: "정렬 시험 임시공휴일" }, { now: kst("2026-07-01T09:00") });
    try {
      const moved = await listExpenses(payer, { status: "approved", q }, { pageSize: 20 });
      expect(idsOf(moved)).toEqual([b, a, c, paidD, paidE]);
      expect(moved.groups.flatMap((group) => group.rows).find((row) => row.id === a)).toMatchObject({ scheduledPaymentDate: "2026-08-07" });
    } finally {
      await deleteHoliday(admin, holiday.id, { now: kst("2026-07-01T09:00") });
    }
  }, 120_000);
});
