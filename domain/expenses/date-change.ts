// 07.2-18 X4(D-7290~D-7296): 대표 승인까지 끝난 지출결의의 희망 지급일 변경 요청 · 경영관리 처리 · 이력.
// 요청은 요청일 뿐이다 — 경영관리가 승인해야만 지급 예정일(scheduled_payment_date)에 수동값으로 반영되고(set_by = 처리자), 결재는 다시 돌지 않는다.
// 260907 대조: 요청은 올린 사람 본인만(O:server/src/expenses.ts:5836 early-pay와 같음 · D-7294), 처리는 260907이 경영관리가 직접 당기던 것(:6004)을
// 승인 · 거절(메모)로 바꿨다(D-7292). 희망 사유와 변경 사유를 따로 남긴다(O:db/schema/010_tables.sql:1757 · :1940-1949 · D-7293).
//
// tx 규약(06-03): 권한 · 보임 · 공휴일 달력은 트랜잭션 전. 트랜잭션 안에서는 tx를 받는 저장소와 순수 함수만.
// 잠금 순서는 모든 길에서 지출결의 행(FOR UPDATE) → 요청 행(조건부 UPDATE). 잠금 뒤 지급 기록 · 이체 파일 · 종결 · 결재 상태를 다시 판정한다.
//
// 「이체 파일 확정」(플래너 가정 · RESEARCH A8): 지급 예정일이 마지막으로 정해진 뒤(scheduled_payment_set_at, 없으면 최종 승인 시각)
// 이체 파일 기록(excel_export · bank_transfer)에 그 문서가 담긴 적이 있음. 한계 둘 — ⑴ 그 로그는 정리(prune) 대상이라 관리자가 정리하면 막힘이 풀린다
// ⑵ 이체 파일 만들기는 지출결의 행을 잠그지 않아 같은 순간의 승인과 둘 다 지날 수 있다(위협 T-07.2-18-08 · accept).
import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project, type DtoSpec, type InfoItemRef } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import { canSeeExpense, EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError } from "@/domain/expenses/access";
import { EXPENSE_DOCUMENT_DTO_SPEC, type ExpenseDocumentDto } from "@/domain/expenses/dto";
import { assertSchedulePayer, writeScheduledPayDate } from "@/domain/payments";
import { NOT_BUSINESS_DAY } from "@/domain/payments/action-row";
import { loadPayCalendar } from "@/domain/payments/pay-schedule-load";
import { formatKstTime, isBusinessDay } from "@/domain/holidays/business-day";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { isCalendarDate, seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { isUniqueViolation } from "@/lib/pg-errors";
import type { DbOrTx } from "@/repositories/document-counters";
import { findTransferFileTimes } from "@/repositories/action-log";
import {
  decidePendingDateChange,
  findDateChangeRequestById,
  findPendingDateChange,
  insertDateChangeRequest,
  listDateChangeHistory,
  revertApprovedDateChange,
  type DateChangeRequestRow,
} from "@/repositories/expense-date-change-requests";
import { findLivePayment } from "@/repositories/expense-payments";
import { findExpenseApprovalInstance, findExpenseById, listCurrentRoundApprovedAt, lockExpenseForUpdate, type ExpenseRow } from "@/repositories/expenses";
import { findUserNamesByIds } from "@/repositories/users";

export const DATE_CHANGE_BLOCKED = "지급 진행 중 · 변경 요청 불가";
export const DATE_CHANGE_STALE = "이미 처리됨 · 새로 고침";
export const DATE_CHANGE_REASON_REQUIRED = "사유 없음 · 사유 적기";
export const DATE_CHANGE_DATE_REQUIRED = "새 희망일 없음 · 날짜 고르기";
export const DATE_CHANGE_MEMO_REQUIRED = "거절 메모 없음 · 메모 적기";
export const DATE_CHANGE_TEXT_MAX = 500;
const NOT_DRAFTER = "올린 사람만 변경 요청";
// 승인 되돌리기 창(디자인 D-F4 · 플래너 가정) — 토스트 4초 + 지연 여유.
export const DATE_CHANGE_UNDO_WINDOW_MS = 60_000;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_UNIQ = "expense_date_change_requests_pending_uniq";
const ENTITY = "expense_date_change_request";

// ── 판정(순수 · 화면과 서버 공유) ──────────────────────────────────────
export type DateChangeEligibility = { kind: "none" } | { kind: "blocked"; reason: string } | { kind: "pending" } | { kind: "can" };

export function dateChangeEligibility(input: {
  isDrafter: boolean;
  finalApproved: boolean;
  closed: boolean;
  paid: boolean;
  inTransferFile: boolean;
  pending: boolean;
}): DateChangeEligibility {
  if (!input.isDrafter || !input.finalApproved || input.closed) return { kind: "none" };
  if (input.paid || input.inTransferFile) return { kind: "blocked", reason: DATE_CHANGE_BLOCKED };
  if (input.pending) return { kind: "pending" };
  return { kind: "can" };
}

// ── 사실 읽기(트랜잭션 전) ───────────────────────────────────────────
type DateChangeFacts = {
  row: ExpenseRow;
  finalApproved: boolean;
  paid: boolean;
  inTransferFile: boolean;
  pending: DateChangeRequestRow | null;
};

async function visibleExpense(viewer: Viewer, expenseId: string): Promise<ExpenseRow> {
  const row = UUID_SHAPE.test(expenseId) ? await findExpenseById(viewer, expenseId) : null;
  if (!row || !(await canSeeExpense(viewer, row))) throw new ExpenseNotFoundError();
  return row;
}

// 이체 파일 담김 — 지급 예정일이 마지막으로 정해진 뒤(없으면 최종 승인 시각 뒤) 이체 파일 기록에 담긴 적이 있는가.
async function inTransferFile(viewer: Viewer, row: Pick<ExpenseRow, "id" | "scheduledPaymentSetAt">, tx?: DbOrTx): Promise<boolean> {
  const approvedAt = row.scheduledPaymentSetAt ? null : ((await listCurrentRoundApprovedAt(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, expenseIds: [row.id] }, tx)).get(row.id) ?? null);
  const since = row.scheduledPaymentSetAt ?? approvedAt;
  if (!since) return false;
  return (await findTransferFileTimes(viewer, { expenseIds: [row.id], since }, tx)).length > 0;
}

async function loadDateChangeFacts(viewer: Viewer, expenseId: string): Promise<DateChangeFacts> {
  const row = await visibleExpense(viewer, expenseId);
  const [instance, live, pending] = await Promise.all([
    findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id }),
    findLivePayment(viewer, row.id),
    findPendingDateChange(viewer, row.id),
  ]);
  const finalApproved = instance?.status === "approved";
  const paid = live !== null;
  return { row, finalApproved, paid, inTransferFile: finalApproved && !paid ? await inTransferFile(viewer, row) : false, pending };
}

function eligibilityOf(viewer: Viewer, facts: DateChangeFacts): DateChangeEligibility {
  return dateChangeEligibility({
    isDrafter: facts.row.drafterId === viewer.id,
    finalApproved: facts.finalApproved,
    closed: facts.row.closedAt !== null,
    paid: facts.paid,
    inTransferFile: facts.inTransferFile,
    pending: facts.pending !== null,
  });
}

// 잠금 뒤 재판정 — 결재 통과가 아니거나 종결이면 `이미 처리됨`, 지급 기록 · 이체 파일이면 `지급 진행 중`.
async function lockAndRejudge(viewer: Viewer, expenseId: string, tx: DbOrTx): Promise<ExpenseRow> {
  const locked = await lockExpenseForUpdate(viewer, expenseId, tx);
  if (!locked) throw new ExpenseNotFoundError();
  if (locked.closedAt !== null) throw new UserFacingError(DATE_CHANGE_STALE);
  const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
  if (instance?.status !== "approved") throw new UserFacingError(DATE_CHANGE_STALE);
  if ((await findLivePayment(viewer, locked.id, tx)) !== null) throw new UserFacingError(DATE_CHANGE_BLOCKED);
  if (await inTransferFile(viewer, locked, tx)) throw new UserFacingError(DATE_CHANGE_BLOCKED);
  return locked;
}

function rethrowPendingConflict(error: unknown): never {
  if (isUniqueViolation(error, PENDING_UNIQ)) throw new UserFacingError(DATE_CHANGE_STALE);
  throw error;
}

function cleanText(value: string, emptyMessage: string): string {
  const text = value.trim();
  if (text === "") throw new UserFacingError(emptyMessage);
  if (text.length > DATE_CHANGE_TEXT_MAX) throw new UserFacingError(`${DATE_CHANGE_TEXT_MAX}자 넘음 · 줄여 적기`);
  return text;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

// ── 기안자: 요청 · 철회 ─────────────────────────────────────────────
// 새 희망일(플래너 가정): 오늘(KST) 이후 영업일만 — 승인 때 같은 쓰기가 같은 이유로 막히지 않게.
export async function requestDateChange(
  viewer: Viewer,
  input: { expenseId: string; newDate: string; reason: string },
  deps?: { now?: Date },
): Promise<{ requestId: string; newDate: string }> {
  const now = deps?.now ?? new Date();
  const today = seoulToday(now);
  const reason = cleanText(input.reason, DATE_CHANGE_REASON_REQUIRED);
  if (!isCalendarDate(input.newDate) || input.newDate <= today) throw new UserFacingError(DATE_CHANGE_DATE_REQUIRED);
  const facts = await loadDateChangeFacts(viewer, input.expenseId);
  const eligibility = eligibilityOf(viewer, facts);
  if (facts.row.drafterId !== viewer.id) throw new ForbiddenError(NOT_DRAFTER);
  if (eligibility.kind === "blocked") throw new UserFacingError(eligibility.reason);
  if (eligibility.kind !== "can") throw new UserFacingError(DATE_CHANGE_STALE);
  const { lookup } = await loadPayCalendar([yearOf(today), yearOf(input.newDate)]);
  if (!isBusinessDay(input.newDate, lookup)) throw new UserFacingError(NOT_BUSINESS_DAY);
  try {
    return await withTransaction(async (tx) => {
      const locked = await lockAndRejudge(viewer, facts.row.id, tx);
      if ((await findPendingDateChange(viewer, locked.id, tx)) !== null) throw new UserFacingError(DATE_CHANGE_STALE);
      const inserted = await insertDateChangeRequest(viewer, { expenseId: locked.id, requestedBy: viewer.id, newDate: input.newDate, reason, createdAt: now }, tx);
      await recordAction(
        viewer,
        { actionType: "document_submit", entity: ENTITY, entityId: inserted.id, documentId: locked.id, detail: { newDate: input.newDate } },
        { tx },
      );
      return { requestId: inserted.id, newDate: inserted.newDate };
    });
  } catch (error) {
    rethrowPendingConflict(error);
  }
}

// 철회 — 요청자 본인만, 대기일 때만(처리자 = 요청자 · 처리 시각 = 지금 — 07.2-01 CHECK).
export async function withdrawDateChange(viewer: Viewer, input: { requestId: string }, deps?: { now?: Date }): Promise<{ expenseId: string }> {
  const now = deps?.now ?? new Date();
  const pre = UUID_SHAPE.test(input.requestId) ? await findDateChangeRequestById(viewer, input.requestId) : null;
  if (!pre) throw new UserFacingError(DATE_CHANGE_STALE);
  if (pre.requestedBy !== viewer.id) throw new ForbiddenError(NOT_DRAFTER);
  await visibleExpense(viewer, pre.expenseId);
  if (pre.status !== "pending") throw new UserFacingError(DATE_CHANGE_STALE);
  return withTransaction(async (tx) => {
    const locked = await lockExpenseForUpdate(viewer, pre.expenseId, tx);
    if (!locked) throw new ExpenseNotFoundError();
    const decided = await decidePendingDateChange(viewer, { requestId: pre.id, status: "withdrawn", decidedBy: viewer.id, decidedAt: now, rejectMemo: null }, tx);
    if (!decided) throw new UserFacingError(DATE_CHANGE_STALE);
    await recordAction(viewer, { actionType: "document_withdraw", entity: ENTITY, entityId: pre.id, documentId: locked.id, detail: { newDate: pre.newDate } }, { tx });
    return { expenseId: locked.id };
  });
}

// ── 경영관리: 승인 · 거절 · 승인 되돌리기 ───────────────────────────────
// 처리 권한 = 「지급 예정일 바꾸기」 권한자(expenses.payments 쓰기 — 새 권한 없음, D-7292).
async function decidable(viewer: Viewer, requestId: string): Promise<DateChangeRequestRow> {
  await assertSchedulePayer(viewer);
  const pre = UUID_SHAPE.test(requestId) ? await findDateChangeRequestById(viewer, requestId) : null;
  if (!pre) throw new UserFacingError(DATE_CHANGE_STALE);
  await visibleExpense(viewer, pre.expenseId);
  return pre;
}

// version = 화면이 읽은 **지출결의** version — 요청 뒤 지급 예정일이 손으로 바뀌었으면 쓰기 함수가 `다른 사람이 HH:mm에 바꿈 · 새로 고침`.
// 요청 행 경합은 status = 'pending' 조건부 갱신이 따로 맡는다(eng D-18 P2). 지급 예정일 쓰기가 실패하면 요청도 대기 그대로(한 트랜잭션).
export async function approveDateChange(
  viewer: Viewer,
  input: { requestId: string; version: number },
  deps?: { now?: Date },
): Promise<{ expenseId: string; newDate: string; before: string | null; version: number }> {
  const now = deps?.now ?? new Date();
  const pre = await decidable(viewer, input.requestId);
  if (pre.status !== "pending") throw new UserFacingError(DATE_CHANGE_STALE);
  const { lookup } = await loadPayCalendar([yearOf(seoulToday(now)), yearOf(pre.newDate)]);
  return withTransaction(async (tx) => {
    const locked = await lockAndRejudge(viewer, pre.expenseId, tx);
    const decided = await decidePendingDateChange(viewer, { requestId: pre.id, status: "approved", decidedBy: viewer.id, decidedAt: now, rejectMemo: null }, tx);
    if (!decided) throw new UserFacingError(DATE_CHANGE_STALE);
    // 요청 때와 같은 기준 — 그 사이 날짜가 지났으면 지난 날을 지급 예정일로 쓰지 않는다(쓰기 함수는 지난 날짜를 허용).
    if (decided.newDate <= seoulToday(now)) throw new UserFacingError(DATE_CHANGE_DATE_REQUIRED);
    const written = await writeScheduledPayDate(viewer, { expenseId: locked.id, date: decided.newDate, version: input.version }, { lookup, now }, tx);
    await recordAction(viewer, { actionType: "document_approve", entity: ENTITY, entityId: pre.id, documentId: locked.id, detail: { newDate: decided.newDate } }, { tx });
    return { expenseId: locked.id, newDate: decided.newDate, before: written.before, version: written.version };
  });
}

export async function rejectDateChange(viewer: Viewer, input: { requestId: string; memo: string }, deps?: { now?: Date }): Promise<{ expenseId: string }> {
  const now = deps?.now ?? new Date();
  const memo = cleanText(input.memo, DATE_CHANGE_MEMO_REQUIRED);
  const pre = await decidable(viewer, input.requestId);
  if (pre.status !== "pending") throw new UserFacingError(DATE_CHANGE_STALE);
  return withTransaction(async (tx) => {
    const locked = await lockAndRejudge(viewer, pre.expenseId, tx);
    const decided = await decidePendingDateChange(viewer, { requestId: pre.id, status: "rejected", decidedBy: viewer.id, decidedAt: now, rejectMemo: memo }, tx);
    if (!decided) throw new UserFacingError(DATE_CHANGE_STALE);
    await recordAction(viewer, { actionType: "document_reject", entity: ENTITY, entityId: pre.id, documentId: locked.id, detail: { newDate: pre.newDate } }, { tx });
    return { expenseId: locked.id };
  });
}

// 승인 되돌리기(디자인 D-F4 · CLAUDE.md §7 「확인 창 대신 되돌리기」) — 같은 처리자 · 승인 뒤 60초 안 · 지출결의 version = 승인 결과 version일 때만.
// 요청 행 approved → pending(처리자 · 시각 비움)과 지급 예정일 = 승인 전 값(같은 쓰기 함수 — null이면 자동 복귀)을 한 트랜잭션에서.
// `before`를 입력으로 받는 것은 권한 상승이 아니다 — 처리 권한자는 `지급 예정일 바꾸기`로 어느 영업일이든 쓰고, 쓰기 함수가 영업일 · 지급 · version을 다시 본다.
export async function undoDateChangeApproval(
  viewer: Viewer,
  input: { requestId: string; before: string | null; version: number },
  deps?: { now?: Date },
): Promise<{ expenseId: string; version: number }> {
  const now = deps?.now ?? new Date();
  const pre = await decidable(viewer, input.requestId);
  if (input.before !== null && !isCalendarDate(input.before)) throw new UserFacingError(DATE_CHANGE_STALE);
  const { lookup } = await loadPayCalendar([yearOf(seoulToday(now)), ...(input.before ? [yearOf(input.before)] : [])]);
  try {
    return await withTransaction(async (tx) => {
      const locked = await lockAndRejudge(viewer, pre.expenseId, tx);
      if ((await findPendingDateChange(viewer, locked.id, tx)) !== null) throw new UserFacingError(DATE_CHANGE_STALE);
      const reverted = await revertApprovedDateChange(viewer, { requestId: pre.id, decidedBy: viewer.id, notBefore: new Date(now.getTime() - DATE_CHANGE_UNDO_WINDOW_MS) }, tx);
      if (!reverted) throw new UserFacingError(DATE_CHANGE_STALE);
      const written = await writeScheduledPayDate(viewer, { expenseId: locked.id, date: input.before, version: input.version }, { lookup, now }, tx);
      await recordAction(
        viewer,
        { actionType: "document_update", entity: ENTITY, entityId: pre.id, documentId: locked.id, detail: { changes: buildChanges({ status: STATUS_WORD.approved }, { status: STATUS_WORD.pending }) } },
        { tx },
      );
      return { expenseId: locked.id, version: written.version };
    });
  } catch (error) {
    rethrowPendingConflict(error);
  }
}

// ── 화면 사실 · 이력 DTO ────────────────────────────────────────────
export type DateChangeHistoryDto = {
  id: string;
  newDate: string;
  // 대기 · 승인 · 거절 · 회수(철회 — 새 상태 낱말을 만들지 않고 기존 `회수` muted) — 상태 글자(StatusTag text) 그대로.
  status: string;
  requesterName: string | null;
  requestedAt: string;
  reason: string;
  deciderName: string | null;
  decidedAt: string | null;
  rejectMemo: string | null;
};

export const DATE_CHANGE_DTO_SPEC: DtoSpec<DateChangeHistoryDto, DateChangeHistoryDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "newDate", from: "newDate", infoItem: "expense.value" },
    { key: "status", from: "status", infoItem: "expense.value" },
    { key: "requesterName", from: "requesterName", infoItem: "expense.value" },
    { key: "requestedAt", from: "requestedAt", infoItem: "expense.value" },
    { key: "reason", from: "reason", infoItem: "expense.value" },
    { key: "deciderName", from: "deciderName", infoItem: "expense.value" },
    { key: "decidedAt", from: "decidedAt", infoItem: "expense.value" },
    { key: "rejectMemo", from: "rejectMemo", infoItem: "expense.value" },
  ],
};

registerDto({ name: "dateChangeHistory", fields: DATE_CHANGE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

const STATUS_WORD: Record<string, string> = { pending: "대기", approved: "승인", rejected: "거절", withdrawn: "회수" };

function stamp(at: Date): string {
  return `${kstDateOf(at)} ${formatKstTime(at)}`;
}

export type DateChangeView = {
  // 기안자 입구 — can = 3차 `변경 요청` · pending = `변경 요청 중 · {날짜}` + `요청 철회` · null = DOM 없음.
  entry: "can" | "pending" | null;
  // 대기 요청 한 줄(기안자 pending · 처리 권한자에게만). 지급 완료 · 이체 파일 · 종결 문서면 null.
  pending: Partial<DateChangeHistoryDto> | null;
  // 처리 권한자(지급 예정일 바꾸기)에게만 참 — 요청 줄 끝 `요청 승인` · `요청 거절`.
  canDecide: boolean;
  // 처리 줄 `요청 승인` — 새 희망일이 내일(KST) 이후일 때만. 지난 요청은 승인이 거부되므로(approveDateChange) 버튼을 숨기고 `요청 거절`만 남긴다(QA Q-1).
  canApprove: boolean;
  // 승인 입력의 지출결의 version(화면이 읽은 값).
  version: number;
  history: Partial<DateChangeHistoryDto>[];
};

export async function listDateChangeView(viewer: Viewer, expenseId: string): Promise<DateChangeView> {
  const facts = await loadDateChangeFacts(viewer, expenseId);
  const open = facts.finalApproved && facts.row.closedAt === null && !facts.paid && !facts.inTransferFile;
  const eligibility = eligibilityOf(viewer, facts);
  const canDecide = open && facts.pending !== null && (await can(viewer, "expenses.payments", "write"));
  const rows = await listDateChangeHistory(viewer, facts.row.id);
  const names = await findUserNamesByIds(viewer, [...new Set(rows.flatMap((row) => [row.requestedBy, ...(row.decidedBy ? [row.decidedBy] : [])]))]);
  const history = await Promise.all(
    rows.map((row) =>
      project(
        viewer,
        {
          id: row.id,
          newDate: row.newDate,
          status: STATUS_WORD[row.status] ?? row.status,
          requesterName: names.get(row.requestedBy) ?? null,
          requestedAt: stamp(row.createdAt),
          reason: row.reason,
          deciderName: row.decidedBy ? (names.get(row.decidedBy) ?? null) : null,
          decidedAt: row.decidedAt ? stamp(row.decidedAt) : null,
          rejectMemo: row.rejectMemo,
        },
        DATE_CHANGE_DTO_SPEC,
      ),
    ),
  );
  const visibleHistory = history.filter((row) => row.id !== undefined);
  const showPending = eligibility.kind === "pending" || canDecide;
  const pending = showPending ? (visibleHistory.find((row) => row.id === facts.pending?.id) ?? null) : null;
  return {
    entry: eligibility.kind === "can" || eligibility.kind === "pending" ? eligibility.kind : null,
    pending,
    canDecide: canDecide && pending !== null,
    canApprove: canDecide && pending !== null && facts.pending !== null && facts.pending.newDate > seoulToday(),
    version: facts.row.version,
    history: visibleHistory,
  };
}

// 요청 화면(`/expenses/[id]/date-request`) 재료 — 판정이 can일 때만(아니면 null → notFound).
export async function getDateChangeRequestForm(
  viewer: Viewer,
  expenseId: string,
): Promise<{ expenseId: string; number: string | null; requestedPaymentDate: string | null; today: string } | null> {
  const facts = await loadDateChangeFacts(viewer, expenseId).catch((error: unknown) => {
    if (error instanceof ExpenseNotFoundError) return null;
    throw error;
  });
  if (!facts) return null;
  const eligibility = eligibilityOf(viewer, facts);
  if (eligibility.kind !== "can") return null;
  // 문서 접근(canSeeExpense)만으로는 칸 보기가 걸리지 않는다 — 번호 · 희망 지급일은 상세 문서 DTO와 같은 칸 보기로 거른다(Codex P2).
  const shown = await project(viewer, { number: facts.row.number, requestedPaymentDate: facts.row.requestedPaymentDate }, REQUEST_FORM_DOCUMENT_SPEC);
  return { expenseId: facts.row.id, number: shown.number ?? null, requestedPaymentDate: shown.requestedPaymentDate ?? null, today: seoulToday() };
}

// 요청 화면 머리 · 현재 희망일 칸 — EXPENSE_DOCUMENT_DTO_SPEC의 같은 칸(정보 항목 expense.value)을 그대로 골라 쓴다(두 벌 금지).
type RequestFormDocumentKey = "number" | "requestedPaymentDate";
type RequestFormDocument = Pick<ExpenseDocumentDto, RequestFormDocumentKey>;
const REQUEST_FORM_DOCUMENT_KEYS: readonly string[] = ["number", "requestedPaymentDate"];
const REQUEST_FORM_DOCUMENT_SPEC: DtoSpec<RequestFormDocument, RequestFormDocument> = {
  fields: EXPENSE_DOCUMENT_DTO_SPEC.fields.filter(
    (field): field is { key: RequestFormDocumentKey; from: RequestFormDocumentKey; infoItem: InfoItemRef } =>
      REQUEST_FORM_DOCUMENT_KEYS.includes(field.key) && field.from === field.key,
  ),
};
