import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, expenses } from "@/db/schema";
import { rejectDocument } from "@/domain/approvals";
import { closeExpense, createExpenseFromLines, EXPENSE_DOCUMENT_KIND, listLineDoors } from "@/domain/expenses";
import { listNumberedByLines } from "@/repositories/expenses";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 06-28(C10 · U-3 · UI-SPEC S23): 반려 · 회수 지출결의 종결 — 기안자 또는 지급 권한자가 사유와 함께 끝낸다. 종결 칸 셋(06-27) ·
// version · 끌 수 없는 status_change 로그가 한 트랜잭션에 남고, 결재 인스턴스 상태는 그대로다. 종결 문서는 번호 문서 목록
// (listNumberedByLines — 줄 문 · 회차 상한의 입력 한 곳)에서 빠져 그 줄의 문이 열린다.

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
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function logsOf(documentId: string) {
  return db.select().from(actionLog).where(eq(actionLog.documentId, documentId));
}

async function newDraft(fx: ExpenseFixture, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

// 견적 줄 하나에 번호 받은 문서를 만들고 팀장이 반려한다.
async function rejectedOn(fx: ExpenseFixture, lineId: string): Promise<{ expenseId: string; number: string }> {
  const expenseId = await newDraft(fx, lineId);
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
  await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "금액 확인" });
  return { expenseId, number: submitted.number };
}

describe("06-28 종결", () => {
  it("종결 트레이서", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    const before = await expenseRow(a.expenseId);

    // 반려 문서 하나가 그 줄의 문을 닫고 있다.
    expect((await listLineDoors(fx.pm, { projectId: fx.projectId })).cells[fx.lines.withVendor]?.state).toBe("closed");

    const closed = await closeExpense(fx.pm, { expenseId: a.expenseId, expectedVersion: before.version, reason: "  업체 취소  " });
    expect(closed.version).toBe(before.version + 1);

    const after = await expenseRow(a.expenseId);
    expect(after).toMatchObject({ closedBy: fx.pm.id, closedReason: "업체 취소", version: before.version + 1, number: a.number });
    expect(after.closedAt).toBeInstanceOf(Date);
    // 결재 공통 모듈의 상태값은 건드리지 않는다.
    expect((await instanceOf(a.expenseId)).status).toBe("rejected");

    const logs = (await logsOf(a.expenseId)).filter((log) => log.actionType === "status_change");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: fx.pm.id, entity: "expense", entityId: a.expenseId });
    expect(logs[0]?.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND, from: "rejected", to: "closed", reason: "업체 취소" });

    // 번호 문서 목록에서 빠지고 그 줄의 문이 열린다.
    expect((await listNumberedByLines(fx.pm, [fx.lines.withVendor])).map((doc) => doc.id)).not.toContain(a.expenseId);
    expect((await listLineDoors(fx.pm, { projectId: fx.projectId })).cells[fx.lines.withVendor]?.state).toBe("open");

    // 같은 줄의 새 문서는 새 번호로 제출된다.
    const b = await newDraft(fx, fx.lines.withVendor);
    const submitted = await submitReadyDraft(fx.pm, b);
    expect(submitted.kind).toBe("submitted");
    expect(submitted.number).not.toBe(a.number);
  });
});
