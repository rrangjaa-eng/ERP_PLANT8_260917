import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { approveDocument } from "@/domain/approvals";
import { addHoliday, deleteHoliday } from "@/domain/holidays/admin";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { listPaymentTargets, type PaymentTargetList } from "@/domain/payments/targets";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject } from "../fixtures/expenses";
import { createInReviewExpenseFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// D-715 · G31: 자동값을 저장하지 않아 공휴일 변경이 트리거 없이 반영된다는 계약의 회귀 시험.
// 기준(증빙 작성일) 2026-06-08 + 60 = 2026-08-07(금) · 오늘 2026-08-06. 08-07을 임시공휴일로 더하면 다음 읽기에서 자동 예정일 08-06(목) ·
// 마감 08-05 14:00으로 앞당겨지고, 지우면 다시 08-07. 수동 지정 값(저장 칸)은 공휴일과 관계없이 그대로.
const TODAY = "2026-08-06";
const kst = (at: string) => new Date(`${at}:00+09:00`);
const NOW = kst("2026-08-06T09:00");

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`재파생-${randomUUID().slice(0, 6)}`);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function makeHolidayAdmin(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `rederive-${randomUUID()}@example.test`, name: "공휴일 관리", roleId: SYSADMIN_ROLE_ID });
  return { id: userId, roleId: SYSADMIN_ROLE_ID };
}

async function approved(payer: Viewer, input: { issuedOn: string; actedAt: Date; manual?: string }): Promise<string> {
  const fx = await setupExpenseProject();
  const doc = await createInReviewExpenseFixture(fx, { linkRecordId: await insertRecordFixture(payer, { issuedOn: input.issuedOn }), linkedBy: payer.id });
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt: input.actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  if (input.manual) await db.update(expenses).set({ scheduledPaymentDate: input.manual }).where(eq(expenses.id, doc.expenseId));
  return doc.expenseId;
}

function rowOf(list: PaymentTargetList, id: string) {
  const row = list.groups.flatMap((group) => group.rows).find((candidate) => candidate.id === id);
  if (!row) throw new Error(`행 없음 ${id}`);
  return row;
}

describe("공휴일 재파생 (07-01 Task 3 · D-705 · J4)", () => {
  it("자동 예정일은 공휴일 추가 · 삭제를 다음 읽기에서 따르고, 수동 지정 값은 그대로", async () => {
    const payer = await makePayer();
    const admin = await makeHolidayAdmin();
    const auto = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00") });
    const manual = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-07" });
    const read = () => listPaymentTargets(payer, {}, { today: TODAY, now: NOW });

    const before = await read();
    expect(rowOf(before, auto)).toMatchObject({ scheduledPaymentDate: "2026-08-07", paymentCutoffAt: kst("2026-08-06T14:00").toISOString() });
    expect(rowOf(before, manual)).toMatchObject({ scheduledPaymentDate: "2026-08-07", scheduledPaymentManual: true });

    const added = await addHoliday(admin, { date: "2026-08-07", kind: "temporary", name: "재파생 시험 임시공휴일" }, { now: NOW });
    const during = await read();
    expect(rowOf(during, auto)).toMatchObject({ scheduledPaymentDate: "2026-08-06", autoPaymentDate: "2026-08-06", paymentCutoffAt: kst("2026-08-05T14:00").toISOString() });
    expect(rowOf(during, manual)).toMatchObject({ scheduledPaymentDate: "2026-08-07", scheduledPaymentManual: true, autoPaymentDate: "2026-08-06" });

    expect(await deleteHoliday(admin, added.id, { now: NOW })).toMatchObject({ deleted: true });
    const after = await read();
    expect(rowOf(after, auto)).toMatchObject({ scheduledPaymentDate: "2026-08-07", paymentCutoffAt: kst("2026-08-06T14:00").toISOString() });
    expect(rowOf(after, manual)).toMatchObject({ scheduledPaymentDate: "2026-08-07", scheduledPaymentManual: true });
  }, 30_000);
});
