import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, expenseDateChangeRequests, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import {
  approveDateChange,
  DATE_CHANGE_BLOCKED,
  DATE_CHANGE_DATE_REQUIRED,
  DATE_CHANGE_EXPIRED,
  DATE_CHANGE_MEMO_REQUIRED,
  DATE_CHANGE_REASON_REQUIRED,
  DATE_CHANGE_STALE,
  getDateChangeRequestForm,
  listDateChangeView,
  rejectDateChange,
  requestDateChange,
  undoDateChangeApproval,
  withdrawDateChange,
} from "@/domain/expenses/date-change";
import { completeExpensePayment, previewPayable, saveScheduledPayDate } from "@/domain/payments";
import { listPaymentTargets } from "@/domain/payments/targets";
import { createExpenseFromLines } from "@/domain/expenses";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";
import { NOT_BUSINESS_DAY } from "@/domain/payments/action-row";
import { ForbiddenError } from "@/domain/permissions/can";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { isBusinessDay } from "@/domain/holidays/business-day";
import { seoulToday } from "@/lib/dates";
import { approveDateChangeAction, rejectDateChangeAction, requestDateChangeAction, undoDateChangeApprovalAction, withdrawDateChangeAction } from "@/app/(app)/expenses/[id]/actions";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 07.2-18 X4(D-7290~D-7295) — 승인 뒤 희망 지급일 변경 요청 · 철회 · 경영관리 승인(지급 예정일 한 트랜잭션) · 거절 · 승인 되돌리기 · 이력 DTO.

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
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

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function businessDayFrom(date: string): Promise<string> {
  const year = Number(date.slice(0, 4));
  const lookup = await loadHolidayLookup([year, year + 1]);
  let day = date;
  while (!isBusinessDay(day, lookup)) day = addDays(day, 1);
  return day;
}

async function nonBusinessDayFrom(date: string): Promise<string> {
  const year = Number(date.slice(0, 4));
  const lookup = await loadHolidayLookup([year, year + 1]);
  let day = date;
  while (isBusinessDay(day, lookup)) day = addDays(day, 1);
  return day;
}

async function expenseRow(expenseId: string) {
  const [row] = await db
    .select({
      version: expenses.version,
      scheduled: expenses.scheduledPaymentDate,
      setBy: expenses.scheduledPaymentSetBy,
      requested: expenses.requestedPaymentDate,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function requestRows(expenseId: string) {
  return db.select().from(expenseDateChangeRequests).where(eq(expenseDateChangeRequests.expenseId, expenseId));
}

async function logTypes(entityId: string): Promise<string[]> {
  const rows = await db.select({ type: actionLog.actionType }).from(actionLog).where(eq(actionLog.entityId, entityId)).orderBy(actionLog.seq);
  return rows.map((row) => row.type);
}

async function markInTransferFile(expenseId: string): Promise<void> {
  await db.insert(actionLog).values({ actorId: null, actionType: "excel_export", entity: "bank_transfer", detail: { expenseIds: [expenseId] }, occurredAt: new Date(Date.now() + 1000) });
}

async function payNow(payer: Viewer, doc: ApprovedExpense): Promise<void> {
  const version = (await expenseRow(doc.expenseId)).version;
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
  if (typeof preview.payableKrw !== "number") throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version, transferKrw: preview.payableKrw });
}

async function rejection(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("거부되지 않음");
}

describe("요청 · 철회 (Task 1 · D-7291 · D-7294 · D-7295)", () => {
  let fx: ExpenseFixture;
  let doc: ApprovedExpense;
  let newDate: string;

  beforeEach(async () => {
    fx = await setupExpenseProject();
    doc = await approvedExpenseWithEvidence(fx);
    newDate = await businessDayFrom(addDays(seoulToday(), 3));
  });

  it("기안자가 새 희망일 + 사유 → 요청 행 pending · 희망 지급일 · 지급 예정일 불변 · 로그 document_submit · 두 번째 요청 거부 · 철회 뒤 새 요청", async () => {
    const before = await expenseRow(doc.expenseId);
    const made = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "  행사 일정 연기  " });
    const rows = await requestRows(doc.expenseId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: made.requestId, status: "pending", newDate, reason: "행사 일정 연기", requestedBy: fx.pm.id, decidedAt: null, decidedBy: null });
    const after = await expenseRow(doc.expenseId);
    expect([after.version, after.scheduled, after.requested]).toEqual([before.version, before.scheduled, before.requested]);
    expect(await logTypes(made.requestId)).toEqual(["document_submit"]);

    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "다시" }))).message).toBe(DATE_CHANGE_STALE);
    expect(await requestRows(doc.expenseId)).toHaveLength(1);

    const view = await listDateChangeView(fx.pm, doc.expenseId);
    expect(view.entry).toBe("pending");
    expect(view.pending).toMatchObject({ id: made.requestId, newDate, status: "대기" });
    expect(view.canDecide).toBe(false);

    await withdrawDateChange(fx.pm, { requestId: made.requestId });
    const [withdrawn] = await requestRows(doc.expenseId);
    expect(withdrawn?.status).toBe("withdrawn");
    expect(withdrawn?.decidedBy).toBe(fx.pm.id);
    expect(withdrawn?.decidedAt).not.toBeNull();
    expect(await logTypes(made.requestId)).toEqual(["document_submit", "document_withdraw"]);
    expect((await rejection(() => withdrawDateChange(fx.pm, { requestId: made.requestId }))).message).toBe(DATE_CHANGE_STALE);

    await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "다시 요청" });
    expect((await requestRows(doc.expenseId)).map((row) => row.status).sort()).toEqual(["pending", "withdrawn"]);
    expect((await listDateChangeView(fx.pm, doc.expenseId)).history.map((row) => row.status)).toEqual(["대기", "회수"]);
  });

  it("본인 아닌 팀장 · 대표 → 거부 · 다른 사람이 철회 → 거부", async () => {
    expect(await rejection(() => requestDateChange(fx.lead, { expenseId: doc.expenseId, newDate, reason: "사유" }))).toBeInstanceOf(ForbiddenError);
    expect(await rejection(() => requestDateChange(fx.ceo, { expenseId: doc.expenseId, newDate, reason: "사유" }))).toBeInstanceOf(ForbiddenError);
    const made = await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "사유" });
    expect(await rejection(() => withdrawDateChange(fx.lead, { requestId: made.requestId }))).toBeInstanceOf(ForbiddenError);
    expect((await listDateChangeView(fx.lead, doc.expenseId)).entry).toBeNull();
  });

  it("결재 중 문서 → `이미 처리됨` · 사유 빈 값 · 지난 날짜 · 영업일 아님 → 거부", async () => {
    const other = await setupExpenseProject();
    const created = await createExpenseFromLines(other.pm, { lineIds: [other.lines.withVendor] });
    const draftId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(other.pm, draftId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    expect((await rejection(() => requestDateChange(other.pm, { expenseId: draftId, newDate, reason: "사유" }))).message).toBe(DATE_CHANGE_STALE);
    expect((await listDateChangeView(other.pm, draftId)).entry).toBeNull();

    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "   " }))).message).toBe(DATE_CHANGE_REASON_REQUIRED);
    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate: seoulToday(), reason: "사유" }))).message).toBe(DATE_CHANGE_DATE_REQUIRED);
    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate: addDays(seoulToday(), -3), reason: "사유" }))).message).toBe(
      DATE_CHANGE_DATE_REQUIRED,
    );
    const holiday = await nonBusinessDayFrom(addDays(seoulToday(), 1));
    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate: holiday, reason: "사유" }))).message).toBe(NOT_BUSINESS_DAY);
    expect(await requestRows(doc.expenseId)).toHaveLength(0);
  });

  it("지급 완료 문서 · 이체 파일에 담긴 문서 → `지급 진행 중 · 변경 요청 불가` · 입구 없음", async () => {
    const payer = await makePayer();
    const other = await setupExpenseProject();
    const paidDoc = await approvedExpenseWithoutEvidence(other);
    await payNow(payer, paidDoc);
    expect((await rejection(() => requestDateChange(other.pm, { expenseId: paidDoc.expenseId, newDate, reason: "사유" }))).message).toBe(DATE_CHANGE_BLOCKED);
    expect((await listDateChangeView(other.pm, paidDoc.expenseId)).entry).toBeNull();

    await markInTransferFile(doc.expenseId);
    expect((await rejection(() => requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "사유" }))).message).toBe(DATE_CHANGE_BLOCKED);
    expect((await listDateChangeView(fx.pm, doc.expenseId)).entry).toBeNull();
  });

  it("액션 경계 — 요청 · 철회 액션이 같은 도메인 판정을 지난다", async () => {
    session.viewer = fx.pm;
    const made = await requestDateChangeAction({ expenseId: doc.expenseId, newDate, reason: "사유" });
    expect(made?.serverError).toBeUndefined();
    const requestId = made?.data?.requestId ?? "";
    expect((await requestDateChangeAction({ expenseId: doc.expenseId, newDate, reason: "사유" }))?.serverError).toBe(DATE_CHANGE_STALE);
    expect((await withdrawDateChangeAction({ requestId }))?.serverError).toBeUndefined();
    expect(JSON.stringify((await requestDateChangeAction({ expenseId: doc.expenseId, newDate: "2026-02-30", reason: "사유" }))?.validationErrors)).toContain("newDate");
  });

  it("기안자 계급이 expense.value를 못 보면 요청 폼 재료에 번호 · 희망 지급일 없음 (Codex P2 · 문서 DTO와 같은 칸 보기)", async () => {
    const hope = await businessDayFrom(addDays(seoulToday(), 5));
    await db.update(expenses).set({ requestedPaymentDate: hope, requestedPaymentReason: "행사 일정" }).where(eq(expenses.id, doc.expenseId));
    const seen = await getDateChangeRequestForm(fx.pm, doc.expenseId);
    expect(seen).toMatchObject({ expenseId: doc.expenseId, requestedPaymentDate: hope });
    expect(seen?.number).toBeTruthy();

    if (!fx.pm.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: fx.pm.roleId, infoItem: "expense.value", visible: false });
    const hidden = await getDateChangeRequestForm(fx.pm, doc.expenseId);
    expect(hidden).toMatchObject({ expenseId: doc.expenseId, number: null, requestedPaymentDate: null });
  });
});

describe("경영관리 처리 — 승인 · 거절 · 되돌리기 (Task 2 · D-7292 · D-7293 · D-F4)", () => {
  let fx: ExpenseFixture;
  let doc: ApprovedExpense;
  let payer: Viewer;
  let newDate: string;
  let requestId: string;

  beforeEach(async () => {
    fx = await setupExpenseProject();
    doc = await approvedExpenseWithEvidence(fx);
    payer = await makePayer();
    newDate = await businessDayFrom(addDays(seoulToday(), 5));
    requestId = (await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate, reason: "행사 연기" })).requestId;
  });

  it("승인 → 한 트랜잭션에서 요청 approved · 지급 예정일 = 새 희망일(set_by = 처리자) · 희망 지급일 불변 · 로그 document_approve + payment_schedule_change", async () => {
    const before = await expenseRow(doc.expenseId);
    const view = await listDateChangeView(payer, doc.expenseId);
    expect(view.canDecide).toBe(true);
    expect(view.pending).toMatchObject({ id: requestId, newDate, reason: "행사 연기", requesterName: "박서연" });
    const result = await approveDateChange(payer, { requestId, version: view.version });
    expect(result).toMatchObject({ newDate, before: before.scheduled, version: before.version + 1 });
    const after = await expenseRow(doc.expenseId);
    expect([after.scheduled, after.setBy, after.requested]).toEqual([newDate, payer.id, before.requested]);
    const [row] = await requestRows(doc.expenseId);
    expect(row).toMatchObject({ status: "approved", decidedBy: payer.id });
    expect(await logTypes(requestId)).toEqual(["document_submit", "document_approve"]);
    expect(await logTypes(doc.expenseId)).toContain("payment_schedule_change");
    expect((await listDateChangeView(payer, doc.expenseId)).history.map((item) => item.status)).toEqual(["승인"]);
    // 두 번째 승인 · 거절 → 이미 처리됨
    expect((await rejection(() => approveDateChange(payer, { requestId, version: result.version }))).message).toBe(DATE_CHANGE_STALE);
    expect((await rejection(() => rejectDateChange(payer, { requestId, memo: "늦음" }))).message).toBe(DATE_CHANGE_STALE);
  });

  it("지급 대상 표 — 대기 요청 행에 pendingDateChange MM-DD(묶음 한 번 읽기) · 승인 뒤 null", async () => {
    const rowOf = async () => (await listPaymentTargets(payer, { q: doc.number })).groups.flatMap((group) => group.rows).find((row) => row.id === doc.expenseId);
    expect((await rowOf())?.pendingDateChange).toBe(newDate.slice(5));
    await approveDateChange(payer, { requestId, version: (await expenseRow(doc.expenseId)).version });
    expect((await rowOf())?.pendingDateChange).toBeNull();
  });

  it("지급 예정일 쓰기가 실패하면(지출결의 version 바뀜 · 영업일 아님) 요청도 pending 그대로 — 롤백", async () => {
    const view = await listDateChangeView(payer, doc.expenseId);
    // 요청 뒤 경영관리가 지급 예정일을 손으로 바꿈 → 화면이 읽은 version으로 승인 = 다른 사람이 … · 새로 고침
    await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: await businessDayFrom(addDays(seoulToday(), 9)), version: view.version });
    const conflict = await rejection(() => approveDateChange(payer, { requestId, version: view.version }));
    expect(conflict.message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect((await requestRows(doc.expenseId))[0]?.status).toBe("pending");

    // 요청 뒤 그 날이 공휴일이 된 꼴 — 저장된 요청 날짜를 영업일 아닌 날로 바꿔 쓰기 함수의 영업일 검사로 막히는지 본다.
    const holiday = await nonBusinessDayFrom(addDays(seoulToday(), 1));
    await db.update(expenseDateChangeRequests).set({ newDate: holiday }).where(eq(expenseDateChangeRequests.id, requestId));
    const fresh = await expenseRow(doc.expenseId);
    expect((await rejection(() => approveDateChange(payer, { requestId, version: fresh.version }))).message).toBe(NOT_BUSINESS_DAY);
    expect((await requestRows(doc.expenseId))[0]?.status).toBe("pending");
    expect((await expenseRow(doc.expenseId)).version).toBe(fresh.version);
  });

  it("처리 줄 승인 가능 — 새 희망일이 내일 이후면 canApprove 참, 오늘(KST) 이하로 당겨지면 거짓 · 거절은 그대로 (QA Q-1)", async () => {
    expect(await listDateChangeView(payer, doc.expenseId)).toMatchObject({ canDecide: true, canApprove: true });
    await db.update(expenseDateChangeRequests).set({ newDate: seoulToday() }).where(eq(expenseDateChangeRequests.id, requestId));
    expect(await listDateChangeView(payer, doc.expenseId)).toMatchObject({ canDecide: true, canApprove: false });
    expect((await listDateChangeView(fx.pm, doc.expenseId)).canApprove).toBe(false);
  });

  it("새 희망일이 지난 뒤 승인(그날 · 이틀 뒤) → 거부 · 요청 pending · 지급 예정일 그대로 (review #1)", async () => {
    const before = await expenseRow(doc.expenseId);
    for (const day of [newDate, addDays(newDate, 2)]) {
      const now = new Date(`${day}T03:00:00Z`); // KST 12:00
      expect((await rejection(() => approveDateChange(payer, { requestId, version: before.version }, { now }))).message).toBe(DATE_CHANGE_EXPIRED);
      expect((await requestRows(doc.expenseId))[0]?.status).toBe("pending");
      const after = await expenseRow(doc.expenseId);
      expect([after.scheduled, after.version]).toEqual([before.scheduled, before.version]);
    }
  });

  it("처리 권한 없는 계급(기안자 · 팀장 · 대표) → 거부 · 처리 줄 없음", async () => {
    for (const viewer of [fx.pm, fx.lead, fx.ceo]) {
      expect(await rejection(() => approveDateChange(viewer, { requestId, version: doc.version }))).toBeInstanceOf(ForbiddenError);
      expect(await rejection(() => rejectDateChange(viewer, { requestId, memo: "메모" }))).toBeInstanceOf(ForbiddenError);
      expect((await listDateChangeView(viewer, doc.expenseId)).canDecide).toBe(false);
    }
  });

  it("이체 파일 담긴 뒤 · 지급 완료 뒤 → 승인 · 거절 거부 · 처리 줄 · 대기 줄 없음 · 이력은 `대기` 그대로", async () => {
    await markInTransferFile(doc.expenseId);
    const version = (await expenseRow(doc.expenseId)).version;
    expect((await rejection(() => approveDateChange(payer, { requestId, version }))).message).toBe(DATE_CHANGE_BLOCKED);
    expect((await rejection(() => rejectDateChange(payer, { requestId, memo: "메모" }))).message).toBe(DATE_CHANGE_BLOCKED);
    const view = await listDateChangeView(payer, doc.expenseId);
    expect([view.canDecide, view.pending, view.entry]).toEqual([false, null, null]);
    expect((await listDateChangeView(fx.pm, doc.expenseId)).entry).toBeNull();
    expect(view.history.map((row) => [row.status, row.decidedAt])).toEqual([["대기", null]]);
    expect((await expenseRow(doc.expenseId)).scheduled).not.toBe(newDate);
  });

  it("대기 중 문서가 종결되면 승인 · 거절 = `이미 처리됨` · 지급 예정일 불변", async () => {
    // 승인된 문서를 종결하는 길이 없는 계급 구성일 수 있어 종결 칸을 직접 채운다(잠금 뒤 재판정만 본다).
    await db
      .update(expenses)
      .set({ closedAt: new Date(), closedBy: payer.id, closedReason: "종결" })
      .where(eq(expenses.id, doc.expenseId));
    const version = (await expenseRow(doc.expenseId)).version;
    expect((await rejection(() => approveDateChange(payer, { requestId, version }))).message).toBe(DATE_CHANGE_STALE);
    expect((await rejection(() => rejectDateChange(payer, { requestId, memo: "메모" }))).message).toBe(DATE_CHANGE_STALE);
    expect((await expenseRow(doc.expenseId)).scheduled).not.toBe(newDate);
  });

  it("거절 — 메모 빈 값 거부 · 메모 → rejected + memo · 지급 예정일 불변 · 대표(문서 보는 사람)에게 사유 · 메모 · 볼 수 없는 사람에게 0", async () => {
    const before = await expenseRow(doc.expenseId);
    expect((await rejection(() => rejectDateChange(payer, { requestId, memo: "  " }))).message).toBe(DATE_CHANGE_MEMO_REQUIRED);
    await rejectDateChange(payer, { requestId, memo: "이번 주 지급 확정" });
    const [row] = await requestRows(doc.expenseId);
    expect(row).toMatchObject({ status: "rejected", rejectMemo: "이번 주 지급 확정", decidedBy: payer.id });
    expect((await expenseRow(doc.expenseId)).scheduled).toBe(before.scheduled);
    expect(await logTypes(requestId)).toEqual(["document_submit", "document_reject"]);

    if (fx.ceo.roleId) await upsertVisibility(SYSTEM_VIEWER, { roleId: fx.ceo.roleId, infoItem: "expense.value", visible: true });
    const ceoView = await listDateChangeView(fx.ceo, doc.expenseId);
    expect(ceoView.history).toEqual([expect.objectContaining({ status: "거절", reason: "행사 연기", rejectMemo: "이번 주 지급 확정" })]);

    // 문서를 볼 수 없는 사람(팀 없는 기본 계급 — 상세 화면도 404) → 이력 읽기 자체가 「없는 지출결의」.
    const outsider = await makePerson("외부 사람", DEFAULT_ROLE_ID, null);
    await expect(listDateChangeView(outsider, doc.expenseId)).rejects.toThrow("없는 지출결의");
  });

  it("승인 되돌리기 — 같은 처리자 · 60초 안 · version 같음 → 요청 pending(처리 칸 비움) · 지급 예정일 = 승인 전 값", async () => {
    const before = await expenseRow(doc.expenseId);
    const approved = await approveDateChange(payer, { requestId, version: before.version });
    await undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version });
    const [row] = await requestRows(doc.expenseId);
    expect(row).toMatchObject({ status: "pending", decidedBy: null, decidedAt: null });
    expect((await expenseRow(doc.expenseId)).scheduled).toBe(before.scheduled);
    expect(await logTypes(requestId)).toEqual(["document_submit", "document_approve", "document_update"]);
    expect((await listDateChangeView(payer, doc.expenseId)).canDecide).toBe(true);
  });

  it("되돌리기 거부 — 다른 처리자 · 60초 지남 · 그 사이 version 바뀜 · 이체 파일 담김 · 요청 승인 그대로", async () => {
    const before = await expenseRow(doc.expenseId);
    const approved = await approveDateChange(payer, { requestId, version: before.version });
    const other = await makePayer("다른 경영관리");
    expect((await rejection(() => undoDateChangeApproval(other, { requestId, before: approved.before, version: approved.version }))).message).toBe(DATE_CHANGE_STALE);
    const late = new Date(Date.now() + 61_000);
    expect((await rejection(() => undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version }, { now: late }))).message).toBe(
      DATE_CHANGE_STALE,
    );
    expect((await rejection(() => undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version - 1 }))).message).toMatch(
      /^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/,
    );
    await markInTransferFile(doc.expenseId);
    expect((await rejection(() => undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version }))).message).toBe(DATE_CHANGE_BLOCKED);
    expect((await requestRows(doc.expenseId))[0]?.status).toBe("approved");
    expect((await expenseRow(doc.expenseId)).scheduled).toBe(newDate);
  });

  it("되돌리기 — 그 사이 기안자가 새 요청을 냈으면 `이미 처리됨`", async () => {
    const before = await expenseRow(doc.expenseId);
    const approved = await approveDateChange(payer, { requestId, version: before.version });
    await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate: await businessDayFrom(addDays(seoulToday(), 12)), reason: "또 연기" });
    expect((await rejection(() => undoDateChangeApproval(payer, { requestId, before: approved.before, version: approved.version }))).message).toBe(DATE_CHANGE_STALE);
    const statuses = await db
      .select({ status: expenseDateChangeRequests.status, n: sql<number>`count(*)::int` })
      .from(expenseDateChangeRequests)
      .where(and(eq(expenseDateChangeRequests.expenseId, doc.expenseId)))
      .groupBy(expenseDateChangeRequests.status);
    expect(Object.fromEntries(statuses.map((item) => [item.status, item.n]))).toEqual({ approved: 1, pending: 1 });
  });

  it("두 경영관리가 동시에 승인 → 하나만 성공 · 둘째 `이미 처리됨` 또는 version 충돌 · 승인과 기안자 철회 동시 → 하나만", async () => {
    const other = await makePayer("둘째 경영관리");
    const version = (await expenseRow(doc.expenseId)).version;
    const results = await Promise.allSettled([approveDateChange(payer, { requestId, version }), approveDateChange(other, { requestId, version })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" ? String(failed.reason) : "").toContain(DATE_CHANGE_STALE);
    expect((await expenseRow(doc.expenseId)).version).toBe(version + 1);

    const second = await businessDayFrom(addDays(seoulToday(), 14));
    const nextId = (await requestDateChange(fx.pm, { expenseId: doc.expenseId, newDate: second, reason: "또" })).requestId;
    const fresh = (await expenseRow(doc.expenseId)).version;
    const raced = await Promise.allSettled([approveDateChange(payer, { requestId: nextId, version: fresh }), withdrawDateChange(fx.pm, { requestId: nextId })]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [final] = (await requestRows(doc.expenseId)).filter((row) => row.id === nextId);
    const scheduled = (await expenseRow(doc.expenseId)).scheduled;
    if (final?.status === "approved") expect(scheduled).toBe(second);
    else expect([final?.status, scheduled]).toEqual(["withdrawn", newDate]);
  });

  it("액션 경계 — 승인 결과에 before · version · 되돌리기 · 거절 액션", async () => {
    session.viewer = payer;
    const version = (await expenseRow(doc.expenseId)).version;
    const approved = await approveDateChangeAction({ requestId, version });
    expect(approved?.serverError).toBeUndefined();
    expect(approved?.data).toMatchObject({ newDate, version: version + 1 });
    const undone = await undoDateChangeApprovalAction({ requestId, before: approved?.data?.before ?? null, version: approved?.data?.version ?? 0 });
    expect(undone?.serverError).toBeUndefined();
    expect((await rejectDateChangeAction({ requestId, memo: "" }))?.serverError).toBe(DATE_CHANGE_MEMO_REQUIRED);
    expect((await rejectDateChangeAction({ requestId, memo: "안 됨" }))?.serverError).toBeUndefined();
  });
});
