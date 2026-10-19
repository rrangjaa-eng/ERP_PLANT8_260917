import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { validateRejectReason } from "@/domain/approvals";
import {
  afterEvidenceOwnerChange,
  evidenceAttachRefusal,
  evidenceDetachRefusal,
  evidenceOwnerPhase,
  evidenceRecordRights,
  lockEvidenceOwnerForChange,
  readEvidenceOwner,
  type EvidenceOwnerState,
  type EvidenceOwnerView,
  type EvidenceRecordFlags,
} from "@/domain/evidence";
import { evidenceSourcesOf } from "@/domain/evidence/has-evidence";
import { evidenceAttachBlockOf, getEvidenceRecord, INTAKE_FORBIDDEN, lockEvidenceRecordState, readEvidenceRecordFacts, type EvidenceRecordFacts } from "@/domain/evidence-records";
import { compareCandidates, dayGapOf, type RankedCandidate } from "@/domain/evidence-records/score";
import { autoConfirmOnAttach } from "@/domain/evidence-reviews";
import { codeLabelsOf, EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError } from "@/domain/expenses";
import { visibleExpenseScope } from "@/domain/expenses/access";
import { formatKstTime } from "@/domain/holidays/business-day";
import { pairGateDecision } from "@/domain/payments/action-row";
import type { MethodEvidencePair } from "@/domain/payments/method-evidence-pairs";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { canSeePurchaseRequest, purchaseRequestAuthorOpen, purchaseRequestReadScope, readPurchaseRequestEvidenceFacts } from "@/domain/purchase-requests";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { formatKrw } from "@/lib/format-number";
import { isUniqueViolation } from "@/lib/pg-errors";
import type { DbOrTx } from "@/repositories/document-counters";
import { findLivePayment } from "@/repositories/expense-payments";
import { lockRecordsForUpdate } from "@/repositories/evidence-records";
import {
  detachLink,
  findLinkById,
  findLiveLinkForRecordForUpdate,
  insertLink,
  listLiveLinkOwnersByRecords,
  type EvidenceAttachMode,
  type LiveLinkOwner,
  type EvidenceLinkOwnerKind,
} from "@/repositories/evidence-record-links";
import { CANDIDATE_LIMIT, findExpenseById, hasExpenseAttachTarget, listExpenseAttachCandidates, lockExpenseForUpdate, type ExpenseAttachCandidateRow } from "@/repositories/expenses";
import { hasPurchaseRequestAttachTarget, listPurchaseRequestAttachCandidates, lockPurchaseRequestForUpdate, type PurchaseRequestAttachCandidateRow } from "@/repositories/purchase-requests";

// 06.1-06(RP-4 · RP-5 · E-49): 증빙 기록(엑셀 한 줄)을 번호 있는 지출결의 · 취소 아닌 구매 요청에 붙이고 떼기. 권리는 05 규칙표 위
// evidenceRecordRights 하나(domain/evidence), 잠금 순서는 05 completeEvidenceUpload와 같다 — 문서(사전 판독이 승인이면 프로젝트 → 문서) →
// 증빙 행 → 붙임 행. 06-03 tx 규약: 권한 · 범위 · 설정 · 코드 이름은 트랜잭션 전에 한 번 읽고, 트랜잭션 안은 tx 리포지토리 · 순수 판정 ·
// 05/06.1-12 훅 · recordAction({ tx })뿐이다. 지출결의 금액 칸(공급가액 · 부가세 · 지급액)은 어느 갈래에서도 쓰지 않는다(D-6520).

const LIVE_LINK_UNIQUE = "evidence_record_links_live_uniq";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_NOT_FOUND = "없는 증빙 · 새로 고침";
const LINK_NOT_FOUND = "없는 붙임 · 새로 고침";
const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";
const PURCHASE_REQUEST_CANCELLED = "구매 요청 취소됨 · 새로 고침";
const NONE_SELECTABLE = "붙일 수 있는 문서 없음";
const DRAFT_OWNER_WORD = "작성 중 문서";
const TAKEN_UNSEEN = "다른 사람이 먼저 붙임 · 새로 고침";

/** 다른 문서에 이미 붙은 기록 — 끝 꼬리 ` · 새로 고침`을 PickDialog가 3차 버튼으로 뺀다(재검토 2회차 Codex C). */
export function evidenceTakenMessage(ownerNumber: string | null): string {
  return `다른 사람이 먼저 붙임 · ${ownerNumber ?? DRAFT_OWNER_WORD} · 새로 고침`;
}

/** 경합 거부 — 기본 글자에는 번호가 없다. 번호는 트랜잭션 밖에서 그 문서를 볼 수 있을 때만 싣는다(독립 검토 P3-2 · takenMessage). */
export class EvidenceTakenError extends UserFacingError {
  constructor(readonly owner: LiveLinkOwner | undefined) {
    super(owner && owner.ownerNumber !== null ? TAKEN_UNSEEN : evidenceTakenMessage(null));
  }
}

export type AttachOwnerRef = { kind: "expense" | "purchase_request"; id: string };

export type EvidenceAttachDeps = {
  /** 사전 판독 뒤 · 트랜잭션 전(경합 시험 자리 — 05 EvidenceDeps 꼴). */
  afterPreRead?: () => Promise<void>;
  /** 문서 · 증빙 행을 잠근 뒤 · 붙임 쓰기 전. */
  afterLock?: () => Promise<void>;
  isActionTypeEnabled?: RecordActionDeps["isActionTypeEnabled"];
};

export type ViewerKeys = { intake: boolean; attachKey: boolean; voidKey: boolean; canConfirm: boolean; expensesWrite: boolean };

// 트랜잭션 전 한 번(06-03) — canConfirm은 06.1-12 autoConfirmOnAttach에 넘긴다(카드 R2 「지급 권한자만」).
export async function readKeys(viewer: Viewer): Promise<ViewerKeys> {
  const [intake, attachKey, voidKey, canConfirm, expensesWrite] = await Promise.all([
    can(viewer, "evidence.intake", "write"),
    can(viewer, "expenses.evidence_attach", "write"),
    can(viewer, "expenses.evidence_void", "write"),
    can(viewer, "expenses.payments", "write"),
    can(viewer, "expenses", "write"),
  ]);
  return { intake, attachKey, voidKey, canConfirm, expensesWrite };
}

export function flagsOf(viewer: Viewer, keys: ViewerKeys, owner: EvidenceOwnerState, paid: boolean): EvidenceRecordFlags {
  return { intake: keys.intake, attachKey: keys.attachKey, voidKey: keys.voidKey, isDrafter: owner.drafterId === viewer.id, paid, expensesWrite: keys.expensesWrite };
}

export type PairCodes = { pairs: readonly MethodEvidencePair[]; methodNames: ReadonlyMap<string, string>; typeNames: ReadonlyMap<string, string> };

// 짝 설정 · 코드 이름 — 지급 게이트(06-04 pairGateCtx) · 제출 판정(06.1-12 loadSubmitCodes)과 같은 원천. 트랜잭션 전 한 번.
export async function loadPairCodes(viewer: Viewer): Promise<PairCodes> {
  const [pairs, methodNames, typeNames] = await Promise.all([
    getSettingValue(PAYMENT_METHOD_EVIDENCE_PAIRS),
    codeLabelsOf(viewer, "payment_method"),
    codeLabelsOf(viewer, "evidence_type"),
  ]);
  return { pairs, methodNames, typeNames };
}

export function pairDecision(codes: PairCodes, paymentMethod: string | null, evidenceType: string) {
  return pairGateDecision({
    pairs: codes.pairs,
    paymentMethod,
    evidenceType,
    paymentMethodName: paymentMethod ? (codes.methodNames.get(paymentMethod) ?? null) : null,
    evidenceTypeName: codes.typeNames.get(evidenceType) ?? null,
  });
}

// 붙임 한 행 — 06.1-08 여러 장 붙이기 · 06.1-09 대사가 같은 도우미를 부른다. 증빙 행 잠금 → 살아 있는 붙임(같은 문서면 멱등 ·
// 다른 문서면 경합 거부) → 상태 재검사(보관 · 확인 필요 · 카드 미등록) → INSERT. 부르는 쪽이 문서 행을 먼저 잠근다(E-49).
// 부르는 쪽 의무(독립 검토 P3-4): 문서 잠금 뒤 권리 재판정 → 이 함수 → 지출결의면 afterEvidenceOwnerChange · autoConfirmOnAttach, 트랜잭션 밖에서 EvidenceTakenError · 23505를 takenMessage로.
export async function attachLinkInTx(
  tx: DbOrTx,
  viewer: Viewer,
  input: { recordId: string; owner: { kind: EvidenceLinkOwnerKind; id: string }; mode: EvidenceAttachMode },
  hooks?: { afterLock?: () => Promise<void> },
): Promise<{ created: boolean }> {
  const word = await lockEvidenceRecordState(viewer, input.recordId, tx);
  if (word === null) throw new UserFacingError(RECORD_NOT_FOUND);
  const live = await findLiveLinkForRecordForUpdate(viewer, input.recordId, tx);
  if (live) {
    if (live.ownerKind === input.owner.kind && live.ownerId === input.owner.id) return { created: false };
    const [owner] = await listLiveLinkOwnersByRecords(viewer, [input.recordId], tx);
    throw new EvidenceTakenError(owner);
  }
  const blocked = evidenceAttachBlockOf(word);
  if (blocked) throw new UserFacingError(blocked);
  await hooks?.afterLock?.();
  await insertLink(viewer, { recordId: input.recordId, ownerKind: input.owner.kind, ownerId: input.owner.id, attachMode: input.mode }, tx);
  return { created: true };
}

// 못 보는 지출결의는 05 문서 읽기와 같은 판정(readEvidenceOwner의 범위 거부)으로 가른다 — 트랜잭션 밖에서만 부른다(06-03).
async function canSeeLinkOwner(viewer: Viewer, owner: LiveLinkOwner): Promise<boolean> {
  if (owner.ownerKind === "purchase_request") return canSeePurchaseRequest(viewer, { id: owner.ownerId });
  if (owner.ownerKind !== EXPENSE_DOCUMENT_KIND) return false;
  try {
    await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: owner.ownerId });
    return true;
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) return false;
    throw error;
  }
}

/** 경합 거부 글자 — 붙은 문서를 볼 수 있을 때만 번호, 못 보면 번호 없이 같은 거부(독립 검토 P3-2). 작성 중 문서는 번호가 없어 그 낱말 그대로. */
export async function takenMessage(viewer: Viewer, owner: LiveLinkOwner | undefined): Promise<string> {
  if (!owner || owner.ownerNumber === null) return evidenceTakenMessage(null);
  return (await canSeeLinkOwner(viewer, owner)) ? evidenceTakenMessage(owner.ownerNumber) : TAKEN_UNSEEN;
}

// 부분 유니크 위반(23505)이 난 트랜잭션은 중단 상태라 그 안에서 읽지 않는다 — 밖에서 살아 있는 붙임의 문서 번호를 새로 읽는다(eng B-P3).
async function takenError(viewer: Viewer, recordId: string): Promise<UserFacingError> {
  const [owner] = await listLiveLinkOwnersByRecords(viewer, [recordId]);
  return new UserFacingError(await takenMessage(viewer, owner));
}

// 못 보는 문서의 붙임은 없는 붙임과 같은 글자 — 떼기 · 미리 보기가 같은 판독을 쓴다(독립 검토 P3-6).
async function readLinkedExpense(viewer: Viewer, ownerId: string): Promise<EvidenceOwnerView> {
  try {
    return await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) throw new UserFacingError(LINK_NOT_FOUND);
    throw error;
  }
}

async function readAttachableRecord(viewer: Viewer, keys: ViewerKeys, recordId: string): Promise<EvidenceRecordFacts> {
  if (!keys.intake) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const record = await readEvidenceRecordFacts(viewer, recordId);
  if (!record) throw new UserFacingError(RECORD_NOT_FOUND);
  const blocked = evidenceAttachBlockOf(record.statusWord);
  if (blocked) throw new UserFacingError(blocked);
  return record;
}

export async function attachEvidenceRecord(viewer: Viewer, input: { recordId: string; owner: AttachOwnerRef }, deps?: EvidenceAttachDeps): Promise<{ created: boolean }> {
  const keys = await readKeys(viewer);
  const record = await readAttachableRecord(viewer, keys, input.recordId);
  try {
    if (input.owner.kind === "purchase_request") return await attachToPurchaseRequest(viewer, record, input.owner.id, deps);
    return await attachToExpense(viewer, keys, record, input.owner.id, deps);
  } catch (error) {
    if (error instanceof EvidenceTakenError) throw new UserFacingError(await takenMessage(viewer, error.owner));
    if (isUniqueViolation(error, LIVE_LINK_UNIQUE)) throw await takenError(viewer, record.id);
    throw error;
  }
}

async function attachToExpense(viewer: Viewer, keys: ViewerKeys, record: EvidenceRecordFacts, ownerId: string, deps?: EvidenceAttachDeps): Promise<{ created: boolean }> {
  const before = await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId });
  const paidBefore = (await findLivePayment(viewer, before.id)) !== null;
  if (!evidenceRecordRights(before, flagsOf(viewer, keys, before, paidBefore)).attach) throw new UserFacingError(evidenceAttachRefusal(before));
  const codes = await loadPairCodes(viewer);
  await deps?.afterPreRead?.();

  return withTransaction(async (tx) => {
    // 잠금 뒤 재판정(C-F12 · E32): 사전 판독 뒤 올리기 · 반려 · 승인 · 지급이 커밋됐으면 잠근 상태로 다시 판정한다. 06 지급 생성도 같은 문서 행을 잠근다.
    const owner = await lockEvidenceOwnerForChange(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId, before }, tx);
    const paid = (await findLivePayment(viewer, owner.id, tx)) !== null;
    if (!evidenceRecordRights(owner, flagsOf(viewer, keys, owner, paid)).attach) throw new UserFacingError(evidenceAttachRefusal(owner));
    // 이미 쥔 문서 행(기다림 없음)의 지급 방식으로 짝을 판정한다(E06).
    const row = await lockExpenseForUpdate(viewer, owner.id, tx);
    if (!row) throw new ExpenseNotFoundError();
    const pair = pairDecision(codes, row.paymentMethod, record.evidenceType);
    if (!pair.allowed) throw new UserFacingError(pair.reason);
    const { created } = await attachLinkInTx(tx, viewer, { recordId: record.id, owner: { kind: "expense", id: owner.id }, mode: "registrar" }, { afterLock: deps?.afterLock });
    if (!created) return { created };
    // 차례(06.1-12): 붙임 행 → 05 훅(결재 중 = 인스턴스 version · 승인 = 확인 기록 해제 + 문서 version) → 자동 확인(지급 권한자만 저장).
    const released = await afterEvidenceOwnerChange(viewer, owner, { kind: "add" }, tx);
    await autoConfirmOnAttach(viewer, { expenseId: owner.id, canConfirm: keys.canConfirm }, tx);
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: record.id,
        documentId: owner.id,
        detail: { change: "evidence_record_attach", ownerKind: "expense", ownerId: owner.id, ...(released ? { reviewReleased: released } : {}) },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { created };
  });
}

// ── 06.1-08 여러 장 붙이기(작성자 · 경영관리 · 지출결의) ─────────────────────────────────────────────────────────
// 한 트랜잭션에 전부-아니면-전무(E45). 차례(E-49): 문서 행(승인이면 프로젝트 → 문서) → 증빙 행 id 오름차순 → 붙임 INSERT. 문서 잠금 뒤 권리를
// 다시 판정하고, 증빙 잠금 뒤 version(PA-STALE) · 작성자 모드 음수(A-7)를 다시 본다. 먼저 붙은 증빙은 전부 모아 글자 하나로 던진다(PA-MULTI-CONFLICT).
// 05 훅 · 자동 확인은 반복문 밖 한 번(경영관리만 — 작성자 붙임은 자동 확인 조건에서 늘 거짓). 문서 금액 칸은 쓰지 않는다(D-6520).

/** 한 번에 붙일 수 있는 증빙 수 — 풀 순위 LIMIT과 같은 값(E34 · PA-BATCH). 화면은 풀 DTO의 값을 쓴다. */
export const ATTACH_BATCH_MAX = 20;
export const ATTACH_BATCH_CAP_LINE = `${ATTACH_BATCH_MAX}건 상한 · 나눠 붙이기`;

/** 경합 거부 글자 — `{거래처}`는 먼저 붙은 첫 증빙(id 오름차순) · `{k}`는 나머지 수(0이면 ` 외 {k}건`을 쓰지 않는다). 끝 꼬리 ` · 새로 고침`은 PickDialog가 3차로 뺀다. */
export function evidenceBatchConflictMessage(firstCounterparty: string, others: number): string {
  return `다른 사람이 먼저 붙임 · ${firstCounterparty}${others > 0 ? ` 외 ${others}건` : ""} · 새로 고침`;
}

export type AttachBatchInput = { evidenceIds: readonly string[]; owner: AttachOwnerRef };
type AttachBatchMode = "author" | "registrar";
type BatchPreRead = { id: string; version: number; evidenceType: string; counterparty: string };

function staleMessage(updatedAt: Date): string {
  return `다른 사람이 ${formatKstTime(updatedAt)}에 바꿈 · 새로 고침`;
}

function conflictMessageOf(pre: readonly BatchPreRead[], takenIds: ReadonlySet<string>): string {
  const taken = pre.filter((item) => takenIds.has(item.id));
  const first = taken[0];
  return evidenceBatchConflictMessage(first?.counterparty ?? "—", Math.max(0, taken.length - 1));
}

// 이 문서가 아닌 곳에 살아 있는 붙임이 있는 증빙 id. 같은 문서에 이미 붙은 것은 멱등이라 경합이 아니다.
function takenByOthers(owners: readonly LiveLinkOwner[], doc: AttachOwnerRef): Set<string> {
  return new Set(owners.filter((live) => !(live.ownerKind === doc.kind && live.ownerId === doc.id)).map((live) => live.recordId));
}

type BatchCtx = { viewer: Viewer; mode: AttachBatchMode; keys: ViewerKeys; owner: AttachOwnerRef; ids: readonly string[]; pre: readonly BatchPreRead[]; deps?: EvidenceAttachDeps };

// 증빙 행 잠금(id 오름차순) 뒤 재검사 → 먼저 붙은 것 모으기 → 붙임 INSERT. 지출결의 · 구매 요청이 같은 몸통이다(문서 잠금은 부르는 쪽이 이미 했다 — E-49).
async function lockAndAttachRecords(tx: DbOrTx, ctx: BatchCtx): Promise<string[]> {
  const locked = await lockRecordsForUpdate(ctx.viewer, ctx.ids, tx);
  if (locked.length !== ctx.ids.length) throw new UserFacingError(RECORD_NOT_FOUND);
  for (const record of locked) {
    const read = ctx.pre.find((item) => item.id === record.id);
    if (!read || record.version !== read.version || (ctx.mode === "author" && record.totalKrw < 0)) throw new UserFacingError(staleMessage(record.updatedAt));
  }
  const taken = takenByOthers(await listLiveLinkOwnersByRecords(ctx.viewer, ctx.ids, tx), ctx.owner);
  if (taken.size > 0) throw new UserFacingError(conflictMessageOf(ctx.pre, taken));
  await ctx.deps?.afterLock?.();
  const attachedIds: string[] = [];
  for (const id of ctx.ids) {
    const { created } = await attachLinkInTx(tx, ctx.viewer, { recordId: id, owner: ctx.owner, mode: ctx.mode });
    if (created) attachedIds.push(id);
  }
  return attachedIds;
}

async function preReadRecords(viewer: Viewer, ids: readonly string[]): Promise<BatchPreRead[]> {
  const pre: BatchPreRead[] = [];
  for (const id of ids) {
    const view = await getEvidenceRecord(viewer, id);
    if (!view || view.version === undefined || view.evidenceType === undefined) throw new UserFacingError(RECORD_NOT_FOUND);
    const blocked = view.statusWord ? evidenceAttachBlockOf(view.statusWord) : null;
    if (blocked) throw new UserFacingError(blocked);
    pre.push({ id, version: view.version, evidenceType: view.evidenceType, counterparty: view.counterparty ?? "—" });
  }
  return pre;
}

async function attachBatch(viewer: Viewer, mode: AttachBatchMode, input: AttachBatchInput, deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  if (input.evidenceIds.length === 0) throw new UserFacingError(RECORD_NOT_FOUND);
  if (input.evidenceIds.length > ATTACH_BATCH_MAX) throw new UserFacingError(ATTACH_BATCH_CAP_LINE);
  const ids = [...new Set(input.evidenceIds)].sort();
  if (!ids.every((id) => UUID_SHAPE.test(id))) throw new UserFacingError(RECORD_NOT_FOUND);
  const keys = await readKeys(viewer);
  return input.owner.kind === "purchase_request" ? attachBatchToRequest(viewer, mode, keys, input.owner, ids, deps) : attachBatchToExpense(viewer, mode, keys, input.owner, ids, deps);
}

async function attachBatchToExpense(viewer: Viewer, mode: AttachBatchMode, keys: ViewerKeys, doc: AttachOwnerRef, ids: readonly string[], deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  // 못 보는 문서는 없는 문서와 같은 거부 하나(ExpenseNotFoundError). 작성자 갈래는 기안자 본인만 — 남이면 같은 거부.
  const before = await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.id });
  if (mode === "registrar" && !keys.intake) throw new ForbiddenError(INTAKE_FORBIDDEN);
  if (mode === "author") {
    if (before.drafterId !== viewer.id) throw new ExpenseNotFoundError();
    if (!(await can(viewer, "evidence", "view"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  }
  const paidBefore = (await findLivePayment(viewer, before.id)) !== null;
  const allowed = (owner: EvidenceOwnerState, paid: boolean): boolean => {
    const rights = evidenceRecordRights(owner, flagsOf(viewer, keys, owner, paid));
    return mode === "registrar" ? rights.attach : rights.authorAttach;
  };
  if (!allowed(before, paidBefore)) throw new UserFacingError(evidenceAttachRefusal(before));

  const pre = await preReadRecords(viewer, ids);
  const codes = await loadPairCodes(viewer);
  await deps?.afterPreRead?.();

  try {
    return await withTransaction(async (tx) => {
      const owner = await lockEvidenceOwnerForChange(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.id, before }, tx);
      const paid = (await findLivePayment(viewer, owner.id, tx)) !== null;
      if (!allowed(owner, paid)) throw new UserFacingError(evidenceAttachRefusal(owner));
      const row = await lockExpenseForUpdate(viewer, owner.id, tx);
      if (!row) throw new ExpenseNotFoundError();
      for (const item of pre) {
        const pair = pairDecision(codes, row.paymentMethod, item.evidenceType);
        if (!pair.allowed) throw new UserFacingError(pair.reason);
      }
      const attachedIds = await lockAndAttachRecords(tx, { viewer, mode, keys, owner: { kind: "expense", id: owner.id }, ids, pre, deps });
      const firstId = attachedIds[0];
      if (firstId === undefined) return { attached: 0 };
      // 차례(06.1-12): 붙임 행 → 05 훅(반복문 밖 한 번) → 자동 확인(경영관리 · 지급 권한자만 저장 — 카드 R2) → 행동 로그 한 줄(PA-BATCH).
      const released = await afterEvidenceOwnerChange(viewer, owner, { kind: "add" }, tx);
      if (mode === "registrar") await autoConfirmOnAttach(viewer, { expenseId: owner.id, canConfirm: keys.canConfirm }, tx);
      await recordAction(
        viewer,
        {
          actionType: "document_update",
          entity: "evidence_record",
          entityId: firstId,
          documentId: owner.id,
          detail: { change: "evidence_record_attach", ownerKind: "expense", ownerId: owner.id, attachMode: mode, recordIds: attachedIds, ...(released ? { reviewReleased: released } : {}) },
        },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
      return { attached: attachedIds.length };
    });
  } catch (error) {
    throw await batchConflictOr(error, viewer, doc, ids, pre);
  }
}

// 구매 요청 — 작성자 갈래만(경영관리는 06.1-06 S4 하나 붙이기). 05 규칙표 밖: 결재 · 짝 · 05 훅 없음, 견적 · 확정 실행가 칸은 쓰지 않는다.
async function attachBatchToRequest(viewer: Viewer, mode: AttachBatchMode, keys: ViewerKeys, doc: AttachOwnerRef, ids: readonly string[], deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  if (mode !== "author") throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
  if (!(await can(viewer, "evidence", "view"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const open = (facts: Awaited<ReturnType<typeof readPurchaseRequestEvidenceFacts>>): boolean => facts !== null && purchaseRequestAuthorOpen(facts, viewer.id);
  const before = await readPurchaseRequestEvidenceFacts(viewer, doc.id);
  if (!open(before)) throw new UserFacingError(before?.requestedBy === viewer.id && before.status === "cancelled" ? PURCHASE_REQUEST_CANCELLED : PURCHASE_REQUEST_NOT_FOUND);
  const pre = await preReadRecords(viewer, ids);
  await deps?.afterPreRead?.();

  try {
    return await withTransaction(async (tx) => {
      // 요청 행을 잠근 같은 읽기로 다시 판정한다(잠금 뒤 취소 · 완료 프로젝트 · 먼저 붙음).
      const facts = await readPurchaseRequestEvidenceFacts(viewer, doc.id, tx);
      if (!open(facts)) throw new UserFacingError(facts?.status === "cancelled" ? PURCHASE_REQUEST_CANCELLED : PURCHASE_REQUEST_NOT_FOUND);
      const attachedIds = await lockAndAttachRecords(tx, { viewer, mode, keys, owner: { kind: "purchase_request", id: doc.id }, ids, pre, deps });
      const firstId = attachedIds[0];
      if (firstId === undefined) return { attached: 0 };
      await recordAction(
        viewer,
        {
          actionType: "document_update",
          entity: "evidence_record",
          entityId: firstId,
          documentId: doc.id,
          detail: { change: "evidence_record_attach", ownerKind: "purchase_request", ownerId: doc.id, attachMode: mode, recordIds: attachedIds },
        },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
      return { attached: attachedIds.length };
    });
  } catch (error) {
    throw await batchConflictOr(error, viewer, doc, ids, pre);
  }
}

// 부분 유니크 위반은 트랜잭션이 중단 상태라 밖에서 다시 읽어 같은 글자로 던진다(잠금이 막지만 마지막 안전망).
async function batchConflictOr(error: unknown, viewer: Viewer, doc: AttachOwnerRef, ids: readonly string[], pre: readonly BatchPreRead[]): Promise<unknown> {
  if (!(error instanceof EvidenceTakenError || isUniqueViolation(error, LIVE_LINK_UNIQUE))) return error;
  const taken = takenByOthers(await listLiveLinkOwnersByRecords(viewer, ids), doc);
  return new UserFacingError(taken.size > 0 ? conflictMessageOf(pre, taken) : evidenceBatchConflictMessage(pre[0]?.counterparty ?? "—", 0));
}

/** 작성자 갈래 — 자기 임시 · 반려 · 회수 · 승인 지출결의에 1 ~ ATTACH_BATCH_MAX장(06.1-08 S5). */
export function attachEvidenceAsAuthor(viewer: Viewer, input: AttachBatchInput, deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  return attachBatch(viewer, "author", input, deps);
}

/** 경영관리 갈래 — 번호 있는 지출결의에 1 ~ ATTACH_BATCH_MAX장(06.1-06 하나 붙이기 `attachEvidenceRecord`는 그대로 둔다). */
export function attachEvidenceBatch(viewer: Viewer, input: AttachBatchInput, deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  return attachBatch(viewer, "registrar", input, deps);
}

// 구매 요청은 05 규칙표 밖 — 결재 · 짝 · 05 훅 없음. 06 읽기 범위(listAccess) 안 · 취소 아님 · evidence.intake. 견적 · 실행가 칸은 건드리지 않는다.
async function attachToPurchaseRequest(viewer: Viewer, record: EvidenceRecordFacts, requestId: string, deps?: EvidenceAttachDeps): Promise<{ created: boolean }> {
  if (!(await canSeePurchaseRequest(viewer, { id: requestId }))) throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
  await deps?.afterPreRead?.();
  return withTransaction(async (tx) => {
    const request = await lockPurchaseRequestForUpdate(viewer, requestId, tx);
    if (!request) throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
    if (request.status === "cancelled") throw new UserFacingError(PURCHASE_REQUEST_CANCELLED);
    const { created } = await attachLinkInTx(tx, viewer, { recordId: record.id, owner: { kind: "purchase_request", id: request.id }, mode: "registrar" }, { afterLock: deps?.afterLock });
    if (!created) return { created };
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: record.id,
        documentId: request.id,
        detail: { change: "evidence_record_attach", ownerKind: "purchase_request", ownerId: request.id },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { created };
  });
}

// ── 떼기 · 승인 뒤 무효 처리(S7) ─────────────────────────────────────────────────────────────────────────────
// 반려 · 회수 = 경영관리 떼기(05 X-1 — 문서 version 그대로), 결재 중 = 아무도(D-6110), 승인 = 무효 담당의 무효 처리(05 voidEvidence와 같은 키 ·
// 사유 검증 · onApprovedEvidenceChange만 — 인스턴스 version 그대로). 이미 뗀 붙임(0행)은 훅 · 행동 로그 없이 성공(멱등 — 두 탭).
export async function detachEvidenceRecord(viewer: Viewer, input: { linkId: string; reason: string }, deps?: EvidenceAttachDeps): Promise<{ detached: boolean }> {
  const keys = await readKeys(viewer);
  const link = UUID_SHAPE.test(input.linkId) ? await findLinkById(viewer, input.linkId) : null;
  if (!link) throw new UserFacingError(LINK_NOT_FOUND);
  if (link.ownerKind === "purchase_request") return detachFromPurchaseRequest(viewer, keys, { linkId: link.id, recordId: link.evidenceRecordId, requestId: link.ownerId, reason: input.reason }, deps);
  if (link.ownerKind !== EXPENSE_DOCUMENT_KIND) throw new UserFacingError(LINK_NOT_FOUND);

  const before = await readLinkedExpense(viewer, link.ownerId);
  if (evidenceRecordRights(before, flagsOf(viewer, keys, before, false)).detach === "none") throw new UserFacingError(evidenceDetachRefusal(before));
  const reason = validateRejectReason(input.reason);
  if (link.detachedAt !== null) return { detached: false };
  await deps?.afterPreRead?.();

  return withTransaction(async (tx) => {
    const owner = await lockEvidenceOwnerForChange(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: link.ownerId, before }, tx);
    if (evidenceRecordRights(owner, flagsOf(viewer, keys, owner, false)).detach === "none") throw new UserFacingError(evidenceDetachRefusal(owner));
    await lockEvidenceRecordState(viewer, link.evidenceRecordId, tx);
    await deps?.afterLock?.();
    const detached = await detachLink(viewer, { linkId: link.id, reason }, tx);
    if (!detached) return { detached };
    const released = evidenceOwnerPhase(owner) === "approved" ? await afterEvidenceOwnerChange(viewer, owner, { kind: "void" }, tx) : null;
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: link.evidenceRecordId,
        documentId: owner.id,
        detail: { change: "evidence_record_detach", ownerKind: "expense", ownerId: owner.id, linkId: link.id, reasonLength: reason.length, ...(released ? { reviewReleased: released } : {}) },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { detached };
  });
}

// ── 작성자 자기 떼기(06.1-08 A9 · RP-4 · PA-PRFIX) ───────────────────────────────────────────────────────────
// 자기가 고른 author 붙임만, 편집 가능 상태(임시 · 반려 · 회수)의 지출결의에서만. 결재 중 · 승인은 05 거부 글자 그대로(D-6110 · C5 → RP-4).
// 구매 요청 붙임은 작성자 떼기 갈래가 없다 — 없는 붙임과 같은 거부. 남의 붙임 · 경영관리 붙임도 같은 거부(정보 누설 없음).
async function readOwnAuthorLink(viewer: Viewer, linkId: string) {
  const link = UUID_SHAPE.test(linkId) ? await findLinkById(viewer, linkId) : null;
  if (!link || link.ownerKind !== EXPENSE_DOCUMENT_KIND || link.attachMode !== "author" || link.attachedBy !== viewer.id) throw new UserFacingError(LINK_NOT_FOUND);
  return link;
}

export async function detachOwnEvidence(viewer: Viewer, input: { linkId: string; reason: string }, deps?: EvidenceAttachDeps): Promise<{ detached: boolean }> {
  const keys = await readKeys(viewer);
  const link = await readOwnAuthorLink(viewer, input.linkId);
  const before = await readLinkedExpense(viewer, link.ownerId);
  if (!evidenceRecordRights(before, flagsOf(viewer, keys, before, false)).authorDetach) throw new UserFacingError(evidenceDetachRefusal(before));
  const reason = validateRejectReason(input.reason);
  if (link.detachedAt !== null) return { detached: false };
  await deps?.afterPreRead?.();

  return withTransaction(async (tx) => {
    const owner = await lockEvidenceOwnerForChange(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: link.ownerId, before }, tx);
    if (!evidenceRecordRights(owner, flagsOf(viewer, keys, owner, false)).authorDetach) throw new UserFacingError(evidenceDetachRefusal(owner));
    await lockEvidenceRecordState(viewer, link.evidenceRecordId, tx);
    await deps?.afterLock?.();
    const detached = await detachLink(viewer, { linkId: link.id, reason }, tx);
    if (!detached) return { detached };
    // 편집 가능 상태라 05 훅 · 문서 version 없음(05 X-1).
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: link.evidenceRecordId,
        documentId: owner.id,
        detail: { change: "evidence_record_detach", ownerKind: "expense", ownerId: owner.id, linkId: link.id, attachMode: "author", reasonLength: reason.length },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { detached };
  });
}

async function detachFromPurchaseRequest(
  viewer: Viewer,
  keys: ViewerKeys,
  input: { linkId: string; recordId: string; requestId: string; reason: string },
  deps?: EvidenceAttachDeps,
): Promise<{ detached: boolean }> {
  if (!(await canSeePurchaseRequest(viewer, { id: input.requestId }))) throw new UserFacingError(LINK_NOT_FOUND);
  if (!keys.intake) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const reason = validateRejectReason(input.reason);
  await deps?.afterPreRead?.();
  return withTransaction(async (tx) => {
    const request = await lockPurchaseRequestForUpdate(viewer, input.requestId, tx);
    if (!request) throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
    if (request.status === "cancelled") throw new UserFacingError(PURCHASE_REQUEST_CANCELLED);
    await lockEvidenceRecordState(viewer, input.recordId, tx);
    await deps?.afterLock?.();
    const detached = await detachLink(viewer, { linkId: input.linkId, reason }, tx);
    if (!detached) return { detached };
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: input.recordId,
        documentId: request.id,
        detail: { change: "evidence_record_detach", ownerKind: "purchase_request", ownerId: request.id, linkId: input.linkId, reasonLength: reason.length },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { detached };
  });
}

// PA-PREVIEW: 떼면 문서 비용 기준이 확정(증빙) → 예상(문서 공급가액)으로 바뀌는가 — 남는 05 파일 0 ∧ 다른 붙임 0인 지출결의일 때만
// `expected`. 산술 없음 · 비용 기준 함수 · 견적 줄 실행가를 부르지 않는다. 못 보는 문서 · 떼기 권리 없음은 떼기와 같은 거부(독립 검토 P3-1 · P3-6).
// 금액은 문서 공급가액이라 문서 금액 항목(expense.amount)으로 투영한다 — 문서 금액의 정본은 문서 권한이다(P3-1).
export type EvidenceDetachPreviewDto = { result: "expected" | null; amountKrw: number | null };

export const EVIDENCE_DETACH_PREVIEW_DTO_SPEC: DtoSpec<EvidenceDetachPreviewDto, EvidenceDetachPreviewDto> = {
  fields: [
    { key: "result", from: "result", infoItem: "evidence.value" },
    { key: "amountKrw", from: "amountKrw", infoItem: "expense.amount" },
  ],
};

registerDto({ name: "EvidenceDetachPreviewDto", fields: EVIDENCE_DETACH_PREVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export async function previewDetach(viewer: Viewer, input: { linkId: string }): Promise<Partial<EvidenceDetachPreviewDto>> {
  const keys = await readKeys(viewer);
  const link = UUID_SHAPE.test(input.linkId) ? await findLinkById(viewer, input.linkId) : null;
  if (!link) throw new UserFacingError(LINK_NOT_FOUND);
  const none: EvidenceDetachPreviewDto = { result: null, amountKrw: null };
  if (link.ownerKind === "purchase_request") {
    if (!(await canSeePurchaseRequest(viewer, { id: link.ownerId }))) throw new UserFacingError(LINK_NOT_FOUND);
    if (!keys.intake) throw new ForbiddenError(INTAKE_FORBIDDEN);
    return (await projectMany(viewer, [none], EVIDENCE_DETACH_PREVIEW_DTO_SPEC))[0] ?? {};
  }
  if (link.ownerKind !== EXPENSE_DOCUMENT_KIND) throw new UserFacingError(LINK_NOT_FOUND);
  const owner = await readLinkedExpense(viewer, link.ownerId);
  const rights = evidenceRecordRights(owner, flagsOf(viewer, keys, owner, false));
  // 경영관리 떼기 권리가 없으면 자기 author 붙임의 작성자 떼기 권리로 본다(06.1-08) — 둘 다 없으면 떼기와 같은 거부.
  const ownAuthor = link.attachMode === "author" && link.attachedBy === viewer.id && rights.authorDetach;
  if (rights.detach === "none" && !ownAuthor) throw new UserFacingError(evidenceDetachRefusal(owner));
  const [sources, expense] = await Promise.all([
    evidenceSourcesOf(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: [owner.id] }),
    findExpenseById(viewer, owner.id),
  ]);
  const source = sources.get(owner.id);
  const lastOne = link.detachedAt === null && source !== undefined && source.fileCount === 0 && source.linkCount === 1;
  const supply = expense?.supplyAmountKrw ?? null;
  const preview: EvidenceDetachPreviewDto = lastOne && supply !== null ? { result: "expected", amountKrw: supply } : none;
  return (await projectMany(viewer, [preview], EVIDENCE_DETACH_PREVIEW_DTO_SPEC))[0] ?? {};
}

// ── 붙일 문서 후보(S4 · E34 · RP-5) ───────────────────────────────────────────────────────────────────────────
// 순위는 SQL(ORDER BY — 짝 맞음 → 점수 → 날짜 차 → id)이 매긴다. 여기서는 두 질의(지출결의 · 구매 요청) 결과를 같은 열쇠(compareCandidates)로
// 합쳐 20만 두고, 행마다 권리 · 짝으로 고를 수 있음 · 이유만 판정한다(메모리 판정은 막힘 여부뿐).
export type EvidenceAttachCandidateDto = {
  kind: "expense" | "purchase_request";
  id: string;
  number: string;
  /** `{문서 종류} · {작성자}`. */
  title: string;
  /** 결재 중이면 `결재 중`, 아니면 사용일 · 요청일(서울 날짜). */
  subtitle: string | null;
  /** 지출결의 = 공급가액(expense.amount), 구매 요청 = 견적 원화(purchase_request.amount) — 문서 금액은 문서 권한으로(독립 검토 P3-1). */
  amountKrw: number | null;
  selectable: boolean;
  reason: string | null;
  inReview: boolean;
};

// 두 종류가 한 목록에 섞이지만 금액 항목이 달라 명세를 둘 둔다(지출결의 · 구매 요청). 금액 칸 밖은 같다.
function candidateSpec(amountItem: string): DtoSpec<EvidenceAttachCandidateDto, EvidenceAttachCandidateDto> {
  return {
    fields: [
      { key: "kind", from: "kind", infoItem: "evidence.value" },
      { key: "id", from: "id", infoItem: "evidence.value" },
      { key: "number", from: "number", infoItem: "evidence.value" },
      { key: "title", from: "title", infoItem: "evidence.value" },
      { key: "subtitle", from: "subtitle", infoItem: "evidence.value" },
      { key: "amountKrw", from: "amountKrw", infoItem: amountItem },
      { key: "selectable", from: "selectable", infoItem: "evidence.value" },
      { key: "reason", from: "reason", infoItem: "evidence.value" },
      { key: "inReview", from: "inReview", infoItem: "evidence.value" },
    ],
  };
}

export const EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC = candidateSpec("expense.amount");
export const EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC = candidateSpec("purchase_request.amount");

registerDto({ name: "EvidenceAttachCandidateDto", fields: EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "EvidenceAttachRequestCandidateDto", fields: EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 순위 순서를 지키며 종류마다 제 명세로 투영한다(노출 판정은 명세마다 항목 수만큼 — projectMany).
async function projectCandidates(viewer: Viewer, dtos: readonly EvidenceAttachCandidateDto[]): Promise<Partial<EvidenceAttachCandidateDto>[]> {
  const projected = new Map<EvidenceAttachCandidateDto, Partial<EvidenceAttachCandidateDto>>();
  for (const [kind, spec] of [
    ["expense", EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC],
    ["purchase_request", EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC],
  ] as const) {
    const rows = dtos.filter((dto) => dto.kind === kind);
    (await projectMany(viewer, rows, spec)).forEach((item, index) => {
      const row = rows[index];
      if (row) projected.set(row, item);
    });
  }
  return dtos.map((dto) => projected.get(dto) ?? {});
}

export type EvidenceAttachCandidates = {
  /** `{종류} · {거래처} · {합계} · 후보 {n}` — 합계는 evidence.amount를 볼 수 있을 때만. */
  subtitle: string;
  items: Partial<EvidenceAttachCandidateDto>[];
  preselect: string[];
  truncated: boolean;
  limit: number;
  noneSelectableReason: string | null;
};

const IN_REVIEW_WORD = "결재 중";

type Candidate = RankedCandidate & { dto: EvidenceAttachCandidateDto };

function expenseCandidate(viewer: Viewer, keys: ViewerKeys, codes: PairCodes, record: EvidenceRecordFacts, row: ExpenseAttachCandidateRow): Candidate {
  const owner: EvidenceOwnerState = {
    id: row.id,
    drafterId: row.drafterId,
    number: row.number,
    status: row.status,
    updatedAt: row.updatedAt,
    version: row.version,
    projectId: row.projectId,
    instance: row.instanceId !== null && row.instanceVersion !== null ? { id: row.instanceId, version: row.instanceVersion } : null,
    closed: false,
    projectCompleted: row.projectCompleted,
  };
  const rights = evidenceRecordRights(owner, flagsOf(viewer, keys, owner, row.paid));
  const pair = pairDecision(codes, row.paymentMethod, record.evidenceType);
  const inReview = evidenceOwnerPhase(owner) === "in_review";
  const reason = !rights.attach ? evidenceAttachRefusal(owner) : pair.allowed ? null : pair.reason;
  const doc = { kind: "expense" as const, id: row.id, evidenceType: row.evidenceType, businessNo: row.businessNo, amountKrw: row.supplyAmountKrw, date: row.usageDate, pairOk: row.pairOk };
  return {
    ...doc,
    score: row.score,
    dayGap: dayGapOf(record, doc),
    dto: {
      kind: "expense",
      id: row.id,
      number: row.number,
      title: `지출결의 · ${row.drafterName}`,
      subtitle: inReview ? IN_REVIEW_WORD : row.usageDate,
      amountKrw: row.supplyAmountKrw,
      selectable: reason === null,
      reason,
      inReview,
    },
  };
}

function requestCandidate(record: EvidenceRecordFacts, row: PurchaseRequestAttachCandidateRow): Candidate {
  const doc = { kind: "purchase_request" as const, id: row.id, evidenceType: null, businessNo: null, amountKrw: row.estimateAmountKrw, date: row.requestedOn, pairOk: true };
  return {
    ...doc,
    score: row.score,
    dayGap: dayGapOf(record, doc),
    dto: {
      kind: "purchase_request",
      id: row.id,
      number: row.number,
      title: `구매 요청 · ${row.requestedByName}`,
      subtitle: row.requestedOn,
      amountKrw: row.estimateAmountKrw,
      selectable: true,
      reason: null,
      inReview: false,
    },
  };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export async function listAttachCandidates(viewer: Viewer, input: { recordId: string; query?: string | null }): Promise<EvidenceAttachCandidates> {
  const keys = await readKeys(viewer);
  const record = await readAttachableRecord(viewer, keys, input.recordId);
  const [expenseScope, requestScope, codes, amountShown] = await Promise.all([
    visibleExpenseScope(viewer),
    purchaseRequestReadScope(viewer),
    loadPairCodes(viewer),
    visible(viewer, "evidence.amount"),
  ]);
  const query = input.query?.trim() ? input.query.trim().slice(0, 100) : null;
  const [expenseRows, requestRows] = await Promise.all([
    listExpenseAttachCandidates(viewer, {
      scope: expenseScope,
      documentKind: EXPENSE_DOCUMENT_KIND,
      record,
      query,
      constrainedMethodCodes: distinct(codes.pairs.map((pair) => pair.method)),
      pairedMethodCodes: distinct(codes.pairs.filter((pair) => pair.evidence === record.evidenceType).map((pair) => pair.method)),
    }),
    listPurchaseRequestAttachCandidates(viewer, { scope: requestScope, record, query }),
  ]);
  const merged = [
    ...expenseRows.slice(0, CANDIDATE_LIMIT).map((row) => expenseCandidate(viewer, keys, codes, record, row)),
    ...requestRows.slice(0, CANDIDATE_LIMIT).map((row) => requestCandidate(record, row)),
  ].sort(compareCandidates);
  const kept = merged.slice(0, CANDIDATE_LIMIT);
  const truncated = expenseRows.length > CANDIDATE_LIMIT || requestRows.length > CANDIDATE_LIMIT || merged.length > CANDIDATE_LIMIT;
  const first = kept[0]?.dto;
  const subtitle = [record.typeLabel, record.counterparty, amountShown ? formatKrw(record.totalKrw) : null, `후보 ${kept.length}`].filter((part) => part !== null).join(" · ");
  return {
    subtitle,
    items: await projectCandidates(viewer, kept.map((candidate) => candidate.dto)),
    preselect: first && first.selectable && !first.inReview ? [first.id] : [],
    truncated,
    limit: CANDIDATE_LIMIT,
    noneSelectableReason: kept.length > 0 && kept.every((candidate) => !candidate.dto.selectable) ? NONE_SELECTABLE : null,
  };
}

// S2 행 `붙이기`의 대상 있음(쪽마다 한 번) — 그 사람이 볼 수 있는 번호 있는 지출결의 또는 취소 아닌 구매 요청이 하나라도 있나. 짝 · 권리는
// 행 · 문서마다 달라 넣지 않는다(다 막혔으면 S4의 noneSelectableReason — eng B-P3).
export async function hasAttachTarget(viewer: Viewer): Promise<boolean> {
  const [expenseScope, requestScope] = await Promise.all([visibleExpenseScope(viewer), purchaseRequestReadScope(viewer)]);
  if (await hasExpenseAttachTarget(viewer, { scope: expenseScope, documentKind: EXPENSE_DOCUMENT_KIND })) return true;
  return hasPurchaseRequestAttachTarget(viewer, { scope: requestScope });
}
