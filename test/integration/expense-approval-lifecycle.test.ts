import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, expenses, settingsHistorized } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { isRouteStepSettingKey } from "@/domain/approvals/route-step-settings";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-03 트레이서 — 견적 줄 하나 → 작성 중(자동 채움) → 임시 저장 → 제출(번호 · 세금 스냅숏 · 결재선 고정) → 팀장 ·
// 대표 승인 → 최종 승인. 가장자리 사례(두 번 제출 · 동시 제출 · 회차 상한 · 거부 문자열)는 05-14가 증명한다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  return row ?? null;
}

async function stepsOf(instanceId: string) {
  return db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, roleId: approvalSteps.roleId, label: approvalSteps.label, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

describe("트레이서 — 견적 줄에서 최종 승인까지", () => {
  it("견적 줄 하나 → 작성 중 → 임시 저장 → 제출(26001-0001 · 세금 스냅숏 · 단계 넷) → 팀장 · 대표 승인 → approved · 로그", async () => {
    const fx = await setupExpenseProject();

    // 작성 중 — 자동 채움, 번호 · 인스턴스 없음.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    expect(created.blocked).toEqual([]);
    expect(created.created).toHaveLength(1);
    const expenseId = created.created[0]?.expenseId ?? "";
    const draft = await expenseRow(expenseId);
    expect(draft).toMatchObject({
      number: null,
      projectId: fx.projectId,
      quoteLineId: fx.lines.withVendor,
      vendorId: fx.stageOneId,
      evidenceType: "tax_invoice",
      paymentMethod: "bank_transfer",
      supplyCurrency: "KRW",
      supplyAmountKrw: 12_400_000,
      version: 1,
    });
    expect(await instanceOf(expenseId)).toBeNull();
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("작성 중");

    // 임시 저장.
    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "1차 선금" } });
    expect(saved.version).toBe(2);
    expect((await expenseRow(expenseId)).note).toBe("1차 선금");

    // 제출 — 번호 · 세금 스냅숏 · 결재선 고정.
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted).toMatchObject({ kind: "submitted", number: `${fx.projectNumber}-0001` });
    expect(fx.projectNumber).toBe("26001");
    const [vatRow] = await db.select().from(settingsHistorized).where(eq(settingsHistorized.key, "tax.vat.rate"));
    const row = await expenseRow(expenseId);
    expect(row.submittedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({
      number: "26001-0001",
      taxRuleKind: "vat_surcharge",
      taxRate: "0.100000",
      vatKrw: 1_240_000,
      withholdingKrw: 0,
      companyBorneKrw: 0,
      payableKrw: 13_640_000,
      // 시드가 이력형 키의 기본 행(2000-01-01)을 넣는다 — 그 행의 id · 적용일 값 복사.
      taxRateSettingId: vatRow?.id ?? null,
      taxRateEffectiveFrom: vatRow?.effectiveFrom ?? null,
    });
    const instance = await instanceOf(expenseId);
    expect(instance?.status).toBe("submitted");
    const steps = await stepsOf(instance?.id ?? "");
    expect(steps.map((step) => [step.round, step.stepIndex, step.roleId])).toEqual([
      [1, 1, "role-team-lead"],
      [1, 2, "role-division-head"],
      [1, 3, null],
      [1, 4, "role-ceo"],
    ]);
    expect(steps[2]?.label).toBe("경영관리본부");
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("결재 중");

    // 팀장 승인 → 2 · 3단 빈 자리 건너뜀 → 대표 승인 → 최종.
    const first = await approveDocument(fx.lead, { instanceId: instance?.id ?? "", expectedVersion: 1 });
    await approveDocument(fx.ceo, { instanceId: instance?.id ?? "", expectedVersion: first.version });
    expect((await instanceOf(expenseId))?.status).toBe("approved");
    expect((await expenseRow(expenseId)).number).toBe("26001-0001");

    // OPS-08 — 제출 · 승인이 핵심 행동 로그에 남는다(엔진이 쓴다, 설정 기본값 그대로).
    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId)).orderBy(asc(actionLog.seq));
    const submits = logs.filter((log) => log.actionType === "document_submit");
    const approves = logs.filter((log) => log.actionType === "document_approve");
    expect(submits).toHaveLength(1);
    expect(submits[0]?.detail).toMatchObject({ round: 1, kind: EXPENSE_DOCUMENT_KIND });
    expect(approves.map((log) => log.actorId)).toEqual([fx.lead.id, fx.ceo.id]);
    for (const log of [...submits, ...approves]) {
      expect(log).toMatchObject({ entity: "approval_instance", entityId: instance?.id, documentId: expenseId });
      expect(log.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND });
    }
  });

  it("무관한 기획 PM은 남의 작성 중 지출결의를 볼 수 없다(null → 404)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    expect(await getExpense(fx.otherPm, { expenseId })).toBeNull();
    expect(await getExpense(fx.pm, { expenseId })).not.toBeNull();
  });

  it("지출결의 종류 적재 뒤 결재선 단계 칸 16키는 단계 저장 키이고 자기 승인 키는 아니다(Round 4 D12)", () => {
    for (const step of [1, 2, 3, 4]) {
      for (const field of ["enabled", "role_id", "scope", "org_unit_id"]) {
        expect(isRouteStepSettingKey(`approval_route.expense.step${step}.${field}`)).toBe(true);
      }
    }
    expect(isRouteStepSettingKey("approval_route.expense.self_approval")).toBe(false);
  });
});
