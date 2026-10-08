import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { ForbiddenError } from "@/domain/permissions/can";
import { approveDocument } from "@/domain/approvals";
import { setSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED } from "@/domain/settings/keys";
import { closeExpense, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError, getExpense, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { getEvidenceActions, listEvidence, voidEvidence } from "@/domain/evidence";
import { confirmEvidence, waiveEvidence } from "@/domain/evidence-reviews";
import { completeExpensePayment } from "@/domain/payments";
import { insertVendor } from "@/repositories/vendors";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 06.2-08 검토 I-2(D-6217): 읽기가 넓어진 만큼 쓰기가 넓어지지 않았다 — 시드 기획 PM(role-pm, 권한 더하지 않음)은 같은 팀 동료의 문서를
// 보게 됐지만(보는 범위 team) 지급 · 증빙 확인 · 면제 · 종결 · 무효 · 증빙 붙이기는 별도 권한(expenses.payments · evidence_void · evidence_attach)을 먼저 본다.
// 쓰기 도달 = 보기 도달 ∧ 별도 권한. 누가 게이트를 「보이면 된다」로 줄이면 여기가 붉어진다.

const NOW = new Date("2026-09-26T03:00:00Z");

type World = { colleague: Viewer; approvedId: string; inReviewId: string; fileId: string };

async function rowVersion(id: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function submittedTeamDoc(viewer: Viewer, vendorId: string, content: string): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(
    viewer,
    { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content } },
    { now: NOW },
  );
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: await rowVersion(expenseId),
    fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(viewer, expenseId, { now: NOW });
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return expenseId;
}

// 결재선은 대표 한 단(1~3단 끔). 박서연(기획1팀) 문서 둘 — 결재 통과 하나 · 결재 중 하나. 동료 = 같은 팀 시드 기획 PM(무관PM).
async function setup(): Promise<World> {
  for (const key of [APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED]) {
    await setSettingValue(SYSTEM_VIEWER, key, false);
  }
  const fx = await setupExpenseProject();
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "더테이블", normalizedName: `더테이블-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const approvedId = await submittedTeamDoc(fx.pm, vendor.id, "팀 회식");
  const inReviewId = await submittedTeamDoc(fx.pm, vendor.id, "팀 다과");
  const [instance] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, approvedId)));
  if (!instance) throw new Error("결재 인스턴스 없음");
  await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: instance.version });
  const fileId = (await listEvidence(fx.pm, { ownerKind: "expense", ownerId: approvedId }))[0]?.id;
  if (!fileId) throw new Error("증빙 없음");
  return { colleague: fx.otherPm, approvedId, inReviewId, fileId };
}

let w: World;
beforeEach(async () => {
  w = await setup();
});

describe("보이지만 쓸 수 없다 — 시드 기획 PM의 같은 팀 문서 (06.2-08 검토 I-2 · D-6217)", () => {
  it("전제: 동료 PM은 두 문서를 본다(보는 범위 team)", async () => {
    expect(await getExpense(w.colleague, { expenseId: w.approvedId })).not.toBeNull();
    expect(await getExpense(w.colleague, { expenseId: w.inReviewId })).not.toBeNull();
  });

  it("지급 처리는 권한 없음", async () => {
    await expect(completeExpensePayment(w.colleague, { expenseId: w.approvedId, expectedPayableKrw: 0, version: await rowVersion(w.approvedId) })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("증빙 확인 · 면제는 권한 없음", async () => {
    const version = await rowVersion(w.approvedId);
    await expect(confirmEvidence(w.colleague, { expenseId: w.approvedId, version })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(waiveEvidence(w.colleague, { expenseId: w.approvedId, version, reason: "원본 분실" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("종결은 없는 문서", async () => {
    await expect(closeExpense(w.colleague, { expenseId: w.approvedId, expectedVersion: await rowVersion(w.approvedId), reason: "중복 기안" })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("증빙 무효는 권한 없음", async () => {
    await expect(voidEvidence(w.colleague, { fileId: w.fileId, reason: "다른 문서 증빙" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("증빙 행동은 하나도 열리지 않는다(결재 통과 · 결재 중 둘 다)", async () => {
    for (const ownerId of [w.approvedId, w.inReviewId]) {
      const actions = await getEvidenceActions(w.colleague, { ownerKind: "expense", ownerId });
      expect(actions.canAdd).toBe(false);
      expect(actions.voidableFileIds).toEqual([]);
      expect(actions.deletableFileIds).toEqual([]);
    }
  });
});
