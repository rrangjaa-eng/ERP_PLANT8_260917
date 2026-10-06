import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances } from "@/db/schema";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { linkedDocumentsByLine, listQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-15 D-66 — 번호 있는(제출된 적이 있는) 지출결의만 견적 줄 금액 셀을 잠근다. 작성 중 문서는 연결이 아니다.
// 연결은 새 차수의 같은 계보 줄에 따라온다. 줄 파생 상태 입력(linkedStatus)은 같은 쿼리 결과에서 나온다.

const LIST_CTX = { status: "in_progress", canWrite: true } as const;

async function draftOf(fx: ExpenseFixture, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했습니다");
  return expenseId;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function lineOf(fx: ExpenseFixture, revisionId: string, lineId: string) {
  const lines = await listQuoteLines(fx.pm, revisionId, LIST_CTX);
  const line = lines.find((row) => row.id === lineId);
  if (!line) throw new Error("견적 줄 없음");
  return line;
}

describe("linkedDocumentsByLine — D-66 연결", () => {
  it("작성 중 문서만 있으면 연결로 세지 않고, 제출(번호 부여)하면 번호가 연결되어 금액 셀이 읽기 전용이 된다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx, fx.lines.withVendor);

    expect((await linkedDocumentsByLine(fx.pm, fx.revisionId)).has(fx.lines.withVendor)).toBe(false);
    const before = await lineOf(fx, fx.revisionId, fx.lines.withVendor);
    expect(before.hasLinkedDocuments).toBe(false);
    expect(before.linkedStatus).toBeNull();

    await submitReadyDraft(fx.pm, expenseId);

    const linked = await linkedDocumentsByLine(fx.pm, fx.revisionId);
    expect(linked.get(fx.lines.withVendor)).toMatchObject([{ number: "26001-0001" }]);
    const after = await lineOf(fx, fx.revisionId, fx.lines.withVendor);
    expect(after.hasLinkedDocuments).toBe(true);
    expect(after.cellEditability.execution).toBe("readonly");
    expect(after.cellEditability.unitPrice).toBe("readonly");
    expect(after.readonlyReason).toBe("지출결의 26001-0001 연결됨 · 고치려면 새 차수");
    const untouched = await lineOf(fx, fx.revisionId, fx.lines.split);
    expect(untouched.hasLinkedDocuments).toBe(false);
  });

  it("2차를 만들면 같은 계보 줄에 같은 연결이 따라온다", async () => {
    const fx = await setupExpenseProject();
    await submitReadyDraft(fx.pm, await draftOf(fx, fx.lines.withVendor));

    const second = await addApprovedRevision(fx, [{ itemName: "추가 줄", vendorId: fx.stageOneId, execution: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }]);
    const followed = second.lineIds.get("무대 제작");
    const added = second.lineIds.get("추가 줄");
    if (!followed || !added) throw new Error("2차 줄 없음");

    const linked = await linkedDocumentsByLine(fx.pm, second.revisionId);
    expect(linked.get(followed)).toMatchObject([{ number: "26001-0001" }]);
    expect(linked.has(added)).toBe(false);
    const line = await lineOf(fx, second.revisionId, followed);
    expect(line.readonlyReason).toBe("지출결의 26001-0001 연결됨 · 고치려면 새 차수");
  });

  it("연결 문서가 있는 차수의 고객 승인 끄기는 Phase 4 막힘 문구로 거부된다", async () => {
    const fx = await setupExpenseProject();
    await submitReadyDraft(fx.pm, await draftOf(fx, fx.lines.withVendor));

    await expect(setCustomerApproval(fx.pm, fx.revisionId, null)).rejects.toThrow("연결 문서 있음 · 고치려면 새 차수");
  });
});

describe("줄 파생 상태 입력 linkedStatus", () => {
  it("결재 중 · 승인이면 active", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx, fx.lines.withVendor);
    await submitReadyDraft(fx.pm, expenseId);
    expect((await lineOf(fx, fx.revisionId, fx.lines.withVendor)).linkedStatus).toBe("active");

    const instance = await instanceOf(expenseId);
    const first = await approveDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
    await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: first.version });
    expect((await instanceOf(expenseId)).status).toBe("approved");
    expect((await lineOf(fx, fx.revisionId, fx.lines.withVendor)).linkedStatus).toBe("active");
  });

  it("반려되면 rejected", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx, fx.lines.withVendor);
    await submitReadyDraft(fx.pm, expenseId);
    const instance = await instanceOf(expenseId);
    await rejectDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version, reason: "증빙 불일치" });

    const line = await lineOf(fx, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBe("rejected");
    expect(line.hasLinkedDocuments).toBe(true);
  });

  it("회수면 파생 없음이지만 번호가 있어 연결은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx, fx.lines.withVendor);
    await submitReadyDraft(fx.pm, expenseId);
    const instance = await instanceOf(expenseId);
    await withdrawDocument(fx.pm, { instanceId: instance.id, expectedVersion: instance.version });
    expect((await instanceOf(expenseId)).status).toBe("withdrawn");

    const line = await lineOf(fx, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBeNull();
    expect(line.hasLinkedDocuments).toBe(true);
  });
});
