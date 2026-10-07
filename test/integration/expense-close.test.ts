import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, expenses, files, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument, getApprovalView, listMyBlockedDocuments, rejectDocument } from "@/domain/approvals";
import {
  changeExpenseLine,
  changeExpenseVendor,
  closeExpense,
  createExpenseFromLines,
  EXPENSE_ALREADY_CLOSED,
  EXPENSE_DOCUMENT_KIND,
  ExpenseCloseRefusedError,
  ExpenseConflictError,
  ExpenseNotFoundError,
  getExpense,
  listLineDoors,
  previewExpense,
  saveExpenseDraft,
  submitExpense,
  withdrawExpense,
} from "@/domain/expenses";
import { searchLinesForPick } from "@/domain/expenses/pick";
import { listExpenses } from "@/domain/expenses/list";
import { seoulToday } from "@/lib/dates";
import { formatKrw } from "@/lib/format-number";
import { EvidenceCheckError, getEvidenceActions, removeEvidence } from "@/domain/evidence";
import { setSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { listNumberedByLines } from "@/repositories/expenses";
import { deferred, waitForLockWaiter } from "./lock-race";
import { addApprovedRevision, attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { makePaymentManager } from "./fixtures/payments";

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

// 지금 차수의 제출 시각 — 다시 제출하면 새 차수가 생긴다.
async function resubmittedAt(documentId: string): Promise<Date> {
  const instance = await instanceOf(documentId);
  const [route] = await db
    .select({ submittedAt: approvalRoutes.submittedAt })
    .from(approvalRoutes)
    .where(and(eq(approvalRoutes.instanceId, instance.id), eq(approvalRoutes.round, instance.currentRound)));
  if (!route) throw new Error("지금 차수 없음");
  return route.submittedAt;
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

type Fields = Parameters<typeof saveExpenseDraft>[1]["fields"];
const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

async function save(fx: ExpenseFixture, expenseId: string, fields: Fields) {
  const { version } = await expenseRow(expenseId);
  await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields });
}

// 줄 하나에 문서를 만들어(칸을 저장하고) 제출한다 — 인스턴스 id · version을 돌려준다.
async function submittedOn(fx: ExpenseFixture, lineId: string, fields: Fields = {}) {
  const expenseId = await newDraft(fx, lineId);
  if (Object.keys(fields).length > 0) await save(fx, expenseId, fields);
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
  return { expenseId, number: submitted.number, instanceId: submitted.instanceId, version: submitted.version };
}

// 팀장 · 대표 승인 → approved.
async function approveAll(fx: ExpenseFixture, doc: { instanceId: string; version: number }) {
  const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
  await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
}

async function reject(fx: ExpenseFixture, doc: { instanceId: string; version: number }) {
  await rejectDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "금액 확인" });
}

async function closeAs(viewer: ExpenseFixture["pm"], expenseId: string, reason = "업체 취소") {
  const { version } = await expenseRow(expenseId);
  return closeExpense(viewer, { expenseId, expectedVersion: version, reason });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

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

  it("종결 행위자 — 기안자 · 지급 권한자만", async () => {
    const fx = await setupExpenseProject();
    // 기안자 → 됨.
    const byDrafter = await rejectedOn(fx, fx.lines.withVendor);
    await closeAs(fx.pm, byDrafter.expenseId);
    expect((await expenseRow(byDrafter.expenseId)).closedBy).toBe(fx.pm.id);

    // expenses.payments write만 가진 경영관리(기안자 아님) → 됨.
    const payer = await makePaymentManager();
    const byPayer = await rejectedOn(fx, fx.lines.split);
    await closeAs(payer, byPayer.expenseId);
    expect((await expenseRow(byPayer.expenseId)).closedBy).toBe(payer.id);

    const target = await rejectedOn(fx, fx.lines.withVendor);
    // 결재자(그 문서의 반려자 = 팀장) → 없는 문서.
    expect(await caught(closeAs(fx.lead, target.expenseId))).toBeInstanceOf(ExpenseNotFoundError);
    // expenses write만 가진 남 → 없는 문서.
    expect(await caught(closeAs(fx.otherPm, target.expenseId))).toBeInstanceOf(ExpenseNotFoundError);
    // 보이지 않는 문서(지급 권한은 있으나 지출결의 보기 없음) → 없는 문서.
    const blind = await makePaymentManager("안보임");
    await upsertPermission(SYSTEM_VIEWER, { roleId: blind.roleId ?? "", menu: "expenses", action: "view", allowed: false });
    expect(await caught(closeAs(blind, target.expenseId))).toBeInstanceOf(ExpenseNotFoundError);
    // expenses write를 잃은 기안자 → 없는 문서.
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "expenses", action: "write", allowed: false });
    expect(await caught(closeAs(fx.pm, target.expenseId))).toBeInstanceOf(ExpenseNotFoundError);
    expect((await expenseRow(target.expenseId)).closedAt).toBeNull();
  }, 30_000);

  it("종결 모달 부제의 공급가는 금액을 볼 수 있는 사람에게만", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    const amount = formatKrw((await expenseRow(a.expenseId)).supplyAmountKrw ?? 0);
    const subtitleOf = async (viewer: ExpenseFixture["pm"]) => (await getExpense(viewer, { expenseId: a.expenseId }))?.closeDialog?.subtitle;
    // 금액을 볼 수 있는 기안자 → 공급가 조각이 있다.
    const drafterBefore = await subtitleOf(fx.pm);
    expect(drafterBefore?.startsWith(`${a.number} · `)).toBe(true);
    expect(drafterBefore?.endsWith(` · ${amount}`)).toBe(true);

    // 지급 권한자: 문서 칸(expense.value)은 보이고 금액(expense.amount)은 안 보임 → 번호 · 항목만.
    const payer = await makePaymentManager();
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId ?? "", infoItem: "expense.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId ?? "", infoItem: "expense.amount", visible: false });
    const payerSubtitle = await subtitleOf(payer);
    expect(payerSubtitle).toBeDefined();
    expect(payerSubtitle).not.toContain(amount);
    expect(payerSubtitle?.split(" · ")).toHaveLength(2);

    // 기안자도 금액을 못 보게 되면 → 번호 · 항목만.
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "expense.amount", visible: false });
    const drafterSubtitle = await subtitleOf(fx.pm);
    expect(drafterSubtitle).toBeDefined();
    expect(drafterSubtitle).not.toContain(amount);
    expect(drafterSubtitle?.split(" · ")).toHaveLength(2);
  });

  it("종결 상태 — 반려 · 회수만", async () => {
    const fx = await setupExpenseProject();
    // 회수 문서 → 됨(로그 from: withdrawn).
    const withdrawn = await submittedOn(fx, fx.lines.withVendor);
    await withdrawExpense(fx.pm, { expenseId: withdrawn.expenseId, expectedInstanceVersion: withdrawn.version });
    await closeAs(fx.pm, withdrawn.expenseId);
    const log = (await logsOf(withdrawn.expenseId)).find((row) => row.actionType === "status_change");
    expect(log?.detail).toMatchObject({ from: "withdrawn", to: "closed" });

    // 작성 중(번호 없음) → 없는 문서.
    const draft = await newDraft(fx, fx.lines.split);
    expect(await caught(closeAs(fx.pm, draft))).toBeInstanceOf(ExpenseNotFoundError);

    // 결재 중(한 번도 반려되지 않은 제출 · 첫 승인 뒤) → `결재 중 · 새로 고침`.
    const inReview = await submittedOn(fx, fx.lines.withVendor);
    const submittedRefusal = await caught(closeAs(fx.pm, inReview.expenseId));
    expect(submittedRefusal).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(submittedRefusal).toMatchObject({ message: "결재 중 · 새로 고침" });
    const first = await approveDocument(fx.lead, { instanceId: inReview.instanceId, expectedVersion: inReview.version });
    expect(await caught(closeAs(fx.pm, inReview.expenseId))).toMatchObject({ message: "결재 중 · 새로 고침" });
    // 결재 통과 → `최종 승인됨 · 새로 고침`.
    await approveDocument(fx.ceo, { instanceId: inReview.instanceId, expectedVersion: first.version });
    const approvedRefusal = await caught(closeAs(fx.pm, inReview.expenseId));
    expect(approvedRefusal).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(approvedRefusal).toMatchObject({ message: "최종 승인됨 · 새로 고침" });
    expect((await expenseRow(inReview.expenseId)).closedAt).toBeNull();

    // 이미 종결 → `이미 종결 · 새로 고침`.
    const again = await caught(closeAs(fx.pm, withdrawn.expenseId));
    expect(again).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(again).toMatchObject({ message: EXPENSE_ALREADY_CLOSED });
  }, 30_000);

  it("종결 사유 필수", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    expect(await caught(closeAs(fx.pm, a.expenseId, ""))).toMatchObject({ message: "사유 없음 · 사유 적기" });
    expect(await caught(closeAs(fx.pm, a.expenseId, "   "))).toMatchObject({ message: "사유 없음 · 사유 적기" });
    expect(await caught(closeAs(fx.pm, a.expenseId, "가".repeat(501)))).toMatchObject({ message: "사유 500자 넘음 · 줄여 적기" });
    expect((await expenseRow(a.expenseId)).closedAt).toBeNull();
    await closeAs(fx.pm, a.expenseId, `  ${"가".repeat(500)}  `);
    expect((await expenseRow(a.expenseId)).closedReason).toBe("가".repeat(500));
  });

  it("종결 · 다시 제출 동시", async () => {
    const fx = await setupExpenseProject();

    // 종결이 이긴다 — 종결이 잠근 채 멈춘 사이 다시 제출이 잠금을 기다리고, 풀리면 `이미 종결 · 새로 고침`.
    const a = await rejectedOn(fx, fx.lines.withVendor);
    const aRow = await expenseRow(a.expenseId);
    {
      const locked = deferred();
      const release = deferred();
      const closing = closeExpense(
        fx.pm,
        { expenseId: a.expenseId, expectedVersion: aRow.version, reason: "업체 취소" },
        { afterLock: async () => (locked.resolve(), release.promise) },
      );
      await locked.promise;
      const submitting = caught(submitExpense(fx.pm, { expenseId: a.expenseId, expectedVersion: aRow.version }));
      try {
        await waitForLockWaiter(pool);
      } finally {
        release.resolve();
      }
      await closing;
      const lost = await submitting;
      expect(lost).toBeInstanceOf(ExpenseCloseRefusedError);
      expect(lost).toMatchObject({ message: EXPENSE_ALREADY_CLOSED });
      expect((await instanceOf(a.expenseId)).status).toBe("rejected");
    }

    // 다시 제출이 이긴다 — 종결은 `{기안자}이 {HH:MM}에 다시 제출함 · 새로 고침`.
    const b = await rejectedOn(fx, fx.lines.split);
    const bRow = await expenseRow(b.expenseId);
    {
      const locked = deferred();
      const release = deferred();
      const submitting = submitExpense(
        fx.pm,
        { expenseId: b.expenseId, expectedVersion: bRow.version },
        { afterLock: async () => (locked.resolve(), release.promise) },
      );
      await locked.promise;
      const closing = caught(closeExpense(fx.pm, { expenseId: b.expenseId, expectedVersion: bRow.version, reason: "업체 취소" }));
      try {
        await waitForLockWaiter(pool);
      } finally {
        release.resolve();
      }
      expect(await submitting).toMatchObject({ kind: "submitted" });
      const lost = await closing;
      expect(lost).toBeInstanceOf(ExpenseCloseRefusedError);
      expect(lost).toMatchObject({ message: `박서연이 ${SEOUL_HHMM.format(await resubmittedAt(b.expenseId))}에 다시 제출함 · 새로 고침` });
      expect((await expenseRow(b.expenseId)).closedAt).toBeNull();
    }

    // 옛 version으로 부른 종결 → 05 ExpenseConflictError.
    const c = await rejectedOn(fx, fx.lines.withVendor);
    const stale = (await expenseRow(c.expenseId)).version;
    await save(fx, c.expenseId, { supply: krw(1_000_000) });
    expect(await caught(closeExpense(fx.pm, { expenseId: c.expenseId, expectedVersion: stale, reason: "업체 취소" }))).toBeInstanceOf(ExpenseConflictError);
  }, 30_000);

  it("다시 제출 거부 문구의 시각은 지금 차수의 제출 시각", async () => {
    const fx = await setupExpenseProject();
    // 그 뒤 지출결의 행 updated_at이 바뀌어도(06 지급 · 증빙 경로) 그대로.
    const d = await rejectedOn(fx, fx.lines.split);
    const resubmitted = await submitExpense(fx.pm, { expenseId: d.expenseId, expectedVersion: (await expenseRow(d.expenseId)).version });
    expect(resubmitted).toMatchObject({ kind: "submitted" });
    const at = await resubmittedAt(d.expenseId);
    await db
      .update(expenses)
      .set({ updatedAt: new Date(at.getTime() + 2 * 60 * 60 * 1000) })
      .where(eq(expenses.id, d.expenseId));
    expect(await caught(closeAs(fx.pm, d.expenseId))).toMatchObject({ message: `박서연이 ${SEOUL_HHMM.format(at)}에 다시 제출함 · 새로 고침` });
  });

  it("종결 문서는 다시 열리지 않는다", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    expect((await getApprovalView(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: a.expenseId }))?.actions).toContain("resubmit");
    await closeAs(fx.pm, a.expenseId);
    const { version } = await expenseRow(a.expenseId);

    expect((await getApprovalView(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: a.expenseId }))?.actions).not.toContain("resubmit");
    expect(await caught(saveExpenseDraft(fx.pm, { expenseId: a.expenseId, expectedVersion: version, fields: { supply: krw(1_000_000) } }))).toBeInstanceOf(ExpenseNotFoundError);
    expect(await caught(previewExpense(fx.pm, { expenseId: a.expenseId, fields: {} }))).toBeInstanceOf(ExpenseNotFoundError);
    expect(await caught(changeExpenseLine(fx.pm, { expenseId: a.expenseId, lineId: fx.lines.split, expectedVersion: version }))).toBeInstanceOf(ExpenseNotFoundError);
    expect(await caught(changeExpenseVendor(fx.pm, { expenseId: a.expenseId, vendorId: fx.stageOneId, expectedVersion: version }))).toBeInstanceOf(ExpenseNotFoundError);
    expect(await caught(searchLinesForPick(fx.pm, { mode: "change", expenseId: a.expenseId }))).toBeInstanceOf(ExpenseNotFoundError);
    const submitted = await caught(submitExpense(fx.pm, { expenseId: a.expenseId, expectedVersion: version }));
    expect(submitted).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(submitted).toMatchObject({ message: EXPENSE_ALREADY_CLOSED });
    expect(await expenseRow(a.expenseId)).toMatchObject({ number: a.number, version });
  }, 30_000);

  it("종결 문서 증빙 읽기 전용", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    const [file] = await db.select().from(files).where(eq(files.ownerId, a.expenseId));
    if (!file) throw new Error("증빙 없음");
    await closeAs(fx.pm, a.expenseId);

    const add = await caught(attachEvidence(fx.pm, a.expenseId));
    expect(add).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(add).toMatchObject({ message: EXPENSE_ALREADY_CLOSED });
    const remove = await caught(removeEvidence(fx.pm, { fileId: file.id }));
    expect(remove).toBeInstanceOf(ExpenseCloseRefusedError);
    expect(remove).toMatchObject({ message: EXPENSE_ALREADY_CLOSED });
    expect(await getEvidenceActions(fx.pm, { ownerKind: "expense", ownerId: a.expenseId })).toEqual({
      canAdd: false,
      deletableFileIds: [],
      voidableFileIds: [],
      drafterLocked: false,
      completedProjectLocked: false,
    });
    const [still] = await db.select().from(files).where(eq(files.id, file.id));
    expect(still?.removedAt).toBeNull();
  });

  it("종결 문서의 증빙 파일은 새 지출결의에 다시 붙는다", async () => {
    const fx = await setupExpenseProject();
    const sha256 = "a".repeat(64);
    // 종결하지 않은 반려 문서의 같은 파일 → 여전히 중복으로 거부.
    const open = await newDraft(fx, fx.lines.split);
    await attachEvidence(fx.pm, open, undefined, { sha256 });
    const openSubmitted = await submitExpense(fx.pm, { expenseId: open, expectedVersion: (await expenseRow(open)).version });
    if (openSubmitted.kind !== "submitted") throw new Error("제출되지 않음");
    await reject(fx, openSubmitted);
    const blockedByOpen = await newDraft(fx, fx.lines.withVendor);
    const refused = await caught(attachEvidence(fx.pm, blockedByOpen, undefined, { sha256 }));
    expect(refused).toBeInstanceOf(EvidenceCheckError);
    expect(refused).toMatchObject({ message: `같은 파일이 ${openSubmitted.number} 증빙에 있음 · 다른 파일 고르기` });

    // 그 문서를 종결하면 같은 파일을 새 문서에 붙일 수 있다 — 종결 문서의 증빙 기록은 그대로.
    await closeAs(fx.pm, open);
    await attachEvidence(fx.pm, blockedByOpen, undefined, { sha256 });
    const alive = (await db.select().from(files).where(eq(files.sha256, sha256))).filter((file) => file.removedAt === null);
    expect(alive.map((file) => file.ownerId).sort()).toEqual([open, blockedByOpen].sort());
  }, 30_000);

  it("종결 문서는 회차 상한에서 빠진다", async () => {
    const fx = await setupExpenseProject();
    const first = await submittedOn(fx, fx.lines.split, { installment: true, supply: krw(3_000_000) });
    await approveAll(fx, first);
    const second = await submittedOn(fx, fx.lines.split, { supply: krw(3_000_000) });
    await reject(fx, second);
    expect((await expenseRow(second.expenseId)).installmentSeq).toBe(2);

    // 2회차가 열려 있는 동안 — 남은 실행가 4,000,000.
    const next = await newDraft(fx, fx.lines.split);
    expect((await previewExpense(fx.pm, { expenseId: next, fields: { supply: krw(5_000_000) } })).fieldErrors?.supplyAmount).toBe(
      "남은 실행가 4,000,000 넘음 · 공급가액 고치기",
    );

    await closeAs(fx.pm, second.expenseId);
    // 2회차 공급가만큼 늘었다 — 7,000,000.
    expect((await previewExpense(fx.pm, { expenseId: next, fields: { supply: krw(5_000_000) } })).fieldErrors?.supplyAmount).toBeUndefined();
    expect((await previewExpense(fx.pm, { expenseId: next, fields: { supply: krw(8_000_000) } })).fieldErrors?.supplyAmount).toBe(
      "남은 실행가 7,000,000 넘음 · 공급가액 고치기",
    );
    await save(fx, next, { supply: krw(5_000_000) });
    expect(await submitReadyDraft(fx.pm, next)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(next)).installmentSeq).toBe(3);
  }, 30_000);

  it("회차 번호는 종결 문서도 센다", async () => {
    const fx = await setupExpenseProject();
    const extra = await addApprovedRevision(fx, [
      { itemName: "분할 K", vendorId: fx.stageOneId, execution: krw(9_000_000) },
      { itemName: "분할 M", vendorId: fx.stageOneId, execution: krw(9_000_000) },
    ]);
    const lineL = extra.lineIds.get("영상 제작(분할)") ?? "";
    const lineK = extra.lineIds.get("분할 K") ?? "";
    const lineM = extra.lineIds.get("분할 M") ?? "";

    // ⑴ L: A 1회차(결재 통과) · B 2회차(반려) → B 종결 → 새 작성 중 D는 3회차 · 앞 회차 A.
    const a = await submittedOn(fx, lineL, { installment: true, supply: krw(2_000_000) });
    await approveAll(fx, a);
    const b = await submittedOn(fx, lineL, { supply: krw(2_000_000) });
    await reject(fx, b);
    await closeAs(fx.pm, b.expenseId);
    const d = await newDraft(fx, lineL);
    await save(fx, d, { supply: krw(1_000_000) });
    expect((await getExpense(fx.pm, { expenseId: d }))?.installmentText).toMatch(new RegExp(`^3회차 · 앞 회차 ${a.number} · `));
    // ⑵ 고르기 창 — L은 3회차 · 남은 실행가, 문은 열림.
    const picked = await searchLinesForPick(fx.pm, { mode: "pick" });
    expect(picked.rows.find((row) => row.id === lineL)?.installmentText).toMatch(/^3회차 · 남은 실행가 /);
    expect((await listLineDoors(fx.pm, { projectId: fx.projectId })).cells[lineL]?.state).toBe("open");
    // ⑶ D 제출 → 3, B는 2 그대로.
    expect(await submitReadyDraft(fx.pm, d)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(d)).installmentSeq).toBe(3);
    expect((await expenseRow(b.expenseId)).installmentSeq).toBe(2);

    // ⑷ K: A′ 1회차(통과) · B′ 2회차(반려) · C′ 3회차(반려) → C′ 종결 → B′ 다시 제출은 제 회차 2.
    const a2 = await submittedOn(fx, lineK, { installment: true, supply: krw(1_000_000) });
    await approveAll(fx, a2);
    const b2 = await submittedOn(fx, lineK, { supply: krw(1_000_000) });
    await reject(fx, b2);
    const c2 = await submittedOn(fx, lineK, { supply: krw(1_000_000) });
    await reject(fx, c2);
    expect((await expenseRow(c2.expenseId)).installmentSeq).toBe(3);
    await closeAs(fx.pm, c2.expenseId);
    expect(await submitExpense(fx.pm, { expenseId: b2.expenseId, expectedVersion: (await expenseRow(b2.expenseId)).version })).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(b2.expenseId)).installmentSeq).toBe(2);
    // ⑸ K 새 문서 E′ → 4.
    const e2 = await submittedOn(fx, lineK, { supply: krw(1_000_000) });
    expect((await expenseRow(e2.expenseId)).installmentSeq).toBe(4);

    // 비분할 종결은 회차 입력에도 문 판정에도 들지 않는다 — 그 줄에 분할로 낸 첫 문서는 1회차.
    const lineW = extra.lineIds.get("무대 제작") ?? "";
    const plain = await submittedOn(fx, lineW);
    await reject(fx, plain);
    await closeAs(fx.pm, plain.expenseId);
    expect((await listLineDoors(fx.pm, { projectId: fx.projectId })).cells[lineW]?.state).toBe("open");
    const plainNext = await newDraft(fx, lineW);
    await save(fx, plainNext, { installment: true, supply: krw(1_000_000) });
    expect(await submitReadyDraft(fx.pm, plainNext)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(plainNext)).installmentSeq).toBe(1);

    // ⑹ (계보) M: 1회차(통과) · 2회차(반려) → 종결 → 새 차수 M′ → 고르기 창의 M′는 3회차.
    const m1 = await submittedOn(fx, lineM, { installment: true, supply: krw(1_000_000) });
    await approveAll(fx, m1);
    const m2 = await submittedOn(fx, lineM, { supply: krw(1_000_000) });
    await reject(fx, m2);
    await closeAs(fx.pm, m2.expenseId);
    const third = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: extra.revisionId });
    const basis = await approvalBasis(SYSTEM_VIEWER, third.revisionId);
    await setCustomerApproval(fx.pm, third.revisionId, { approvedOn: "2026-09-25", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
    const [lineMPrime] = await db
      .select({ id: quoteLines.id })
      .from(quoteLines)
      .where(and(eq(quoteLines.revisionId, third.revisionId), eq(quoteLines.itemName, "분할 M")));
    if (!lineMPrime) throw new Error("M′ 없음");
    const pickedAgain = await searchLinesForPick(fx.pm, { mode: "pick" });
    expect(pickedAgain.rows.find((row) => row.id === lineMPrime.id)?.installmentText).toMatch(/^3회차 · /);
    // ⑺ M′ 새 작성 중 E → 폼 글자 3회차 · 제출 3.
    const e = await newDraft(fx, lineMPrime.id);
    await save(fx, e, { supply: krw(1_000_000) });
    expect((await getExpense(fx.pm, { expenseId: e }))?.installmentText).toMatch(/^3회차 · /);
    expect(await submitReadyDraft(fx.pm, e)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(e)).installmentSeq).toBe(3);
  }, 90_000);

  it("종결 문서는 홈 막힌 문서에서 빠진다", async () => {
    const fx = await setupExpenseProject();
    const kept = await rejectedOn(fx, fx.lines.withVendor);
    const closed = await rejectedOn(fx, fx.lines.split);
    expect((await listMyBlockedDocuments(fx.pm)).map((doc) => doc.documentId).sort()).toEqual([kept.expenseId, closed.expenseId].sort());
    await closeAs(fx.pm, closed.expenseId);
    const blocked = await listMyBlockedDocuments(fx.pm);
    expect(blocked.map((doc) => doc.documentId)).toEqual([kept.expenseId]);
    expect(blocked[0]?.cause.type).toBe("rejected");
  });

  it("종결 문서가 반려 줄 상한만큼 쌓여도 종결하지 않은 반려 문서가 홈 막힌 문서에 보인다", async () => {
    const fx = await setupExpenseProject();
    const kept = await rejectedOn(fx, fx.lines.withVendor);
    // 더 최근에 반려된 종결 문서 50건(지출결의 · 결재 인스턴스 행만 — 도메인 경로로 50건 반려 · 종결은 느리다).
    const later = new Date(Date.now() + 60_000);
    const closedRows = await db
      .insert(expenses)
      .values(
        Array.from({ length: 50 }, (_, index) => ({
          drafterId: fx.pm.id,
          number: `C-${String(index).padStart(4, "0")}`,
          supplyAmountKrw: 100_000,
          closedAt: later,
          closedBy: fx.pm.id,
          closedReason: "업체 취소",
        })),
      )
      .returning({ id: expenses.id });
    await db.insert(approvalInstances).values(
      closedRows.map((row) => ({
        documentKind: EXPENSE_DOCUMENT_KIND,
        documentId: row.id,
        drafterId: fx.pm.id,
        status: "rejected",
        currentRound: 1,
        createdAt: later,
        updatedAt: later,
      })),
    );

    expect((await listMyBlockedDocuments(fx.pm)).map((doc) => doc.documentId)).toEqual([kept.expenseId]);
  });

  it("종결 문서 목록 낱말", async () => {
    const fx = await setupExpenseProject();
    const kept = await rejectedOn(fx, fx.lines.withVendor);
    const closed = await rejectedOn(fx, fx.lines.split);
    await closeAs(fx.pm, closed.expenseId);
    const closedAt = (await expenseRow(closed.expenseId)).closedAt;
    if (!closedAt) throw new Error("종결 안 됨");
    const groups = (await listExpenses(fx.pm, { status: "all" })).groups;
    const groupOf = (id: string) => groups.find((group) => group.rows.some((row) => row.id === id));
    const rowOf = (id: string) => groupOf(id)?.rows.find((row) => row.id === id);
    expect(rowOf(closed.expenseId)).toMatchObject({ statusWord: "종결", statusDate: seoulToday(closedAt).slice(5) });
    expect(rowOf(kept.expenseId)).toMatchObject({ statusWord: "반려" });
    // 그룹 순위는 05 반려 · 회수 그대로.
    expect(groupOf(closed.expenseId)?.label).toBe("반려 · 회수");
  });

  it("종결 로그는 끌 수 없다", async () => {
    const fx = await setupExpenseProject();
    const a = await rejectedOn(fx, fx.lines.withVendor);
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);
    await closeAs(fx.pm, a.expenseId);
    expect((await logsOf(a.expenseId)).filter((log) => log.actionType === "status_change")).toHaveLength(1);
  });
});
