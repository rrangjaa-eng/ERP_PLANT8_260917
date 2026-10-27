import { buildChanges } from "@/domain/action-log/changes";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { validateRejectReason } from "@/domain/approvals";
import {
  CARD_USAGE_ENTITY,
  cardOverwriteSplit,
  cardSlipNotFound,
  cardSlipOwner,
  cardSlipRights,
  cardUsageOverwriteBlocks,
  cardUsageReadScope,
  createCardUsage,
  denyCardSlipWrite,
  loadCardOverwriteBasis,
  precheckCardUsage,
  reusableCardUsage,
  type CardOverwriteBasis,
  type CardOverwriteBlock,
  type CardUsageInput,
  type CreatedCardUsage,
} from "@/domain/corp-card-usages";
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
import { cardStatementOwners, isCardFormat, sameIssuerOfFormat } from "@/domain/evidence-import";
import {
  evidenceAttachBlockOf,
  getEvidenceRecord,
  INTAKE_FORBIDDEN,
  listEvidenceRecordsByIds,
  lockEvidenceRecordState,
  readEvidenceRecordFacts,
  type EvidenceRecordFacts,
} from "@/domain/evidence-records";
import { compareCandidates, dayGapOf, scoreCandidate, type RankedCandidate } from "@/domain/evidence-records/score";
import { fileWinsPatch, isRelaxedHit, overwriteBlockReason, relaxedCandidatesOf, usedOnGapReason, type FileWinsPatch, type RelaxedCandidate, type RelaxedLine } from "@/domain/evidence-records/reconcile";
import { autoConfirmOnAttach } from "@/domain/evidence-reviews";
import { codeLabelsOf, EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError } from "@/domain/expenses";
import { visibleExpenseScope } from "@/domain/expenses/access";
import { formatKstTime } from "@/domain/holidays/business-day";
import { pairGateDecision } from "@/domain/payments/action-row";
import type { MethodEvidencePair } from "@/domain/payments/method-evidence-pairs";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
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
import {
  applyFileWins,
  fillCardUsageApprovalNo,
  findCardUsageForWrite,
  findRelaxedCandidates,
  lockCardUsageForUpdate,
  type CardUsageForWrite,
  type CardUsageScope,
  type RelaxedCandidateRow,
} from "@/repositories/corp-card-usages";
import { bumpRecordVersion, findRecordForScope, lockRecordsForUpdate, type EvidenceRecordListRow } from "@/repositories/evidence-records";
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
import { findLineLinks, lockQuoteLines } from "@/repositories/quote-line-links";
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
const AUTHOR_CARD_WORD = "붙이기는 경영관리";

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
  await bumpRecordVersion(viewer, input.recordId, tx);
  return { created: true };
}

// 못 보는 지출결의는 05 문서 읽기와 같은 판정(readEvidenceOwner의 범위 거부)으로 가른다 — 트랜잭션 밖에서만 부른다(06-03).
export async function canSeeLinkOwner(viewer: Viewer, owner: Pick<LiveLinkOwner, "ownerKind" | "ownerId">): Promise<boolean> {
  if (owner.ownerKind === "purchase_request") return canSeePurchaseRequest(viewer, { id: owner.ownerId });
  // 07.1-04 PE9: 카드 사용은 06 카드 사용 목록 범위(cardSlipRights.read)로 — 못 보면 번호 없는 글자.
  if (owner.ownerKind === "corp_card_usage") {
    const slip = await cardSlipOwner(viewer, owner.ownerId);
    return slip !== null && (await cardSlipRights(viewer, slip)).read;
  }
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

/** 경영관리 S4 하나 붙이기의 문서 — 06.1-09에서 카드 사용이 더해졌다(여러 장 붙이기 · 작성자 갈래는 AttachOwnerRef 그대로). */
export type RegistrarOwnerRef = AttachOwnerRef | { kind: "corp_card_usage"; id: string };

export async function attachEvidenceRecord(viewer: Viewer, input: { recordId: string; owner: RegistrarOwnerRef }, deps?: EvidenceAttachDeps): Promise<{ created: boolean }> {
  const keys = await readKeys(viewer);
  const record = await readAttachableRecord(viewer, keys, input.recordId);
  try {
    if (input.owner.kind === "corp_card_usage") return await attachToCardUsage(viewer, keys, record.id, input.owner.id, deps);
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

// ── 06.1-09 경영관리 → 카드 사용 붙이기(D-6111 · 카드 R3 · P2-C4 · N-6 · N-8 · E32) ─────────────────────────────
// 권리 · 범위 · 설정(덮기 기준) · 보임 칸은 트랜잭션 전에 한 번(06-03). 잠금 순서는 대사와 같다(N-8): 견적 줄(합계가 바뀔 때만 · 저장된 줄 +
// 사슬의 현재 줄) → 카드 사용 행 → 증빙 행(attachLinkInTx) → 붙임. 잠근 뒤 version · 견적 줄 · 보관 · 카드 명세 붙음 · 기록 version을 다시 보고,
// 덮기 막힘(holder · fixed · completed · cap)은 그 글자로 거부한다 — 붙임 · 덮기 · 기록 0. 카드 사용 붙이기에는 지급 방식 짝 판정이 없다(옛 E44 닫음).
// 06.1-12 자동 확인 · 05 훅은 지출결의 갈래 몫이라 여기서는 부르지 않는다(카드 사용은 05 결재 문서가 아니다).

type CardAttachPlan = { usage: CardUsageForWrite; record: EvidenceRecordListRow; patch: FileWinsPatch | null; basis: CardOverwriteBasis | null };

function patchChangesValues(
  patch: FileWinsPatch | null,
): patch is FileWinsPatch & ({ total: NonNullable<FileWinsPatch["total"]> } | { card: NonNullable<FileWinsPatch["card"]> } | { usedOn: NonNullable<FileWinsPatch["usedOn"]> }) {
  // 07.1-04 E-P1-03: 날짜만 다른 붙임도 값을 바꾸는 쓰기다 — 보임 검사 · 바탕 · 막힘 · 덮기 · 로그 갈래로.
  return patch !== null && (patch.total !== null || patch.card !== null || patch.usedOn !== null);
}

async function planCardAttach(viewer: Viewer, recordId: string, usageId: string): Promise<CardAttachPlan> {
  const owner = await cardSlipOwner(viewer, usageId);
  if (!owner || !(await cardSlipRights(viewer, owner)).read) throw cardSlipNotFound();
  if (owner.status !== "open") denyCardSlipWrite();
  const usage = await findCardUsageForWrite(viewer, usageId, { includeArchived: false });
  if (!usage) throw cardSlipNotFound();
  const record = await findRecordForScope(viewer, await evidenceScopeFor(viewer), recordId);
  if (!record) throw new UserFacingError(RECORD_NOT_FOUND);
  // Codex P2: 카드 사용에는 카드 서식 기록만 — S4 후보(cardCandidatesFor) · registrar 풀(cardHitFilter = 같은 카드)과 같은 판정. 카드 서식이 아닌 id를 직접 실어도 후보가 아니다.
  if (!isCardFormat(record.format)) throw new UserFacingError(RECORD_NOT_FOUND);
  if (!sameIssuerOfFormat(record.format, usage.cardIssuer) || record.corpCardId === null) throw new UserFacingError(`카드 다름 · ${usage.cardLast4}`);
  if ((await cardStatementOwners(viewer, [usage.id])).has(usage.id)) throw new UserFacingError(`증빙 있음 · ${usage.number}`);
  // 검토 P2-3: 화면이 보인 후보 조건(같은 승인번호 ∨ 같은 사용일 ∧ 합계 — S4 후보 · registrar S5 풀)을 서버가 다시 본다. 조건 밖 줄은 후보가 아니다.
  if (!isRelaxedHit({ approvalNo: record.approvalNo, usedOn: record.issuedOn, totalKrw: record.totalKrw }, { approvalNo: usage.approvalNo, usedOn: usage.usedOn, totalKrw: usage.totalAmountKrw })) {
    throw new UserFacingError(RECORD_NOT_FOUND);
  }
  const patch = fileWinsPatch(
    { totalKrw: usage.totalAmountKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4, usedOn: usage.usedOn, approvalNo: usage.approvalNo },
    { totalKrw: record.totalKrw, corpCardId: record.corpCardId, cardLast4: record.cardLast4 ?? "", approvalNo: record.approvalNo, usedOn: record.issuedOn },
  );
  // D-E1: 후보가 막힌 행으로 보인 날짜 차(31일 초과)는 서버도 같은 글자로 거부한다.
  const gap = usedOnGapReason(patch);
  if (gap) throw new UserFacingError(gap);
  if (!patchChangesValues(patch)) return { usage, record, patch, basis: null };
  // 값을 바꾸는 쓰기는 두 금액 칸을 다 볼 수 있는 사람만(보이지 않는 금액을 덮어쓰지 않는다).
  const [usageAmount, recordAmount] = await Promise.all([visible(viewer, "card_usage.amount"), visible(viewer, "evidence.amount")]);
  if (!usageAmount || !recordAmount) denyCardSlipWrite();
  // E-P1-04: 덮은 뒤 분할 · 실행가 판정은 새 사용일 세율을 쓴다 — 옛 날짜 · 명세 날짜를 둘 다 읽는다.
  return { usage, record, patch, basis: await loadCardOverwriteBasis(viewer, [usage.usedOn, record.issuedOn]) };
}

async function attachToCardUsage(viewer: Viewer, keys: ViewerKeys, recordId: string, usageId: string, deps?: EvidenceAttachDeps): Promise<{ created: boolean }> {
  if (!keys.intake) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const { usage, record, patch, basis } = await planCardAttach(viewer, recordId, usageId);
  await deps?.afterPreRead?.();

  return withTransaction(async (tx) => {
    if (patch?.total && usage.quoteLineId) {
      const chains = await findLineLinks(viewer, [usage.quoteLineId], tx);
      const current = chains.get(usage.quoteLineId)?.currentLineId;
      await lockQuoteLines(viewer, [...new Set([usage.quoteLineId, ...(current ? [current] : [])])], tx);
    }
    const locked = await lockCardUsageForUpdate(viewer, usage.id, tx);
    if (!locked || locked.archivedAt !== null || locked.version !== usage.version || locked.quoteLineId !== usage.quoteLineId) throw cardSlipNotFound();
    if (patch && (await cardStatementOwners(viewer, [usage.id], tx)).has(usage.id)) throw new UserFacingError(`증빙 있음 · ${usage.number}`);
    const { created } = await attachLinkInTx(tx, viewer, { recordId: record.id, owner: { kind: "corp_card_usage", id: usage.id }, mode: "registrar" }, { afterLock: deps?.afterLock });
    if (!created) return { created };
    const [lockedRecord] = await lockRecordsForUpdate(viewer, [record.id], tx);
    // attachLinkInTx가 잠근 채 붙임과 함께 증빙 version을 하나 올린다(p32 PR-C P3-1) — 사전 판독 뒤 다른 쓰기가 없었으면 정확히 +1이다.
    if (!lockedRecord || lockedRecord.version !== record.version + 1) throw new UserFacingError(RECORD_NOT_FOUND);

    if (patchChangesValues(patch) && basis) {
      const blocks = await cardUsageOverwriteBlocks(
        viewer,
        [{ usageId: usage.id, totalKrw: patch.total?.after ?? null, corpCardId: patch.card?.after.id ?? null, usedOn: patch.usedOn?.after ?? null }],
        basis,
        tx,
      );
      const block = blocks.get(usage.id);
      if (block) throw new UserFacingError(overwriteBlockReason(patch, block) ?? cardSlipNotFound().message);
      const usedOn = patch.usedOn?.after ?? usage.usedOn;
      const approvalNo = patch.approvalNo ?? usage.approvalNo;
      // 분할은 합계가 바뀔 때만, 새 사용일 세율로(PE3 · E-P1-04). 날짜만 바뀌면 돈 칸 · 외화 칸은 그대로다(applyFileWins 합계 갈래 없음).
      const split = patch.total ? cardOverwriteSplit(basis, { evidenceTypeCode: usage.evidenceTypeCode, usedOn, totalKrw: patch.total.after }) : null;
      const before = { totalKrw: usage.totalAmountKrw, supplyKrw: usage.supplyKrw, vatKrw: usage.vatKrw };
      const after = split ? { totalKrw: split.totalKrw, supplyKrw: split.supplyKrw, vatKrw: split.vatKrw } : before;
      const version = await applyFileWins(
        viewer,
        { id: usage.id, version: usage.version, corpCardId: patch.card?.after.id ?? usage.corpCardId, approvalNo, usedOn: patch.usedOn?.after ?? null, total: split ? after : null },
        tx,
      );
      if (version === null) throw cardSlipNotFound();
      // D-6111 · RP-2 · 07.1-04 PE3: 덮은 전 · 후는 끌 수 없는 증빙 기록 금액 변경 종류로 — 대사와 같은 상세 꼴 + 바뀐 칸만 changes.
      await recordAction(
        viewer,
        {
          actionType: "evidence_record_amount_change",
          entity: CARD_USAGE_ENTITY,
          entityId: usage.id,
          detail: {
            before,
            after,
            cardLast4Before: usage.cardLast4,
            cardLast4After: patch.card?.after.last4 ?? usage.cardLast4,
            evidenceRecordId: record.id,
            changes: buildChanges({ usedOn: usage.usedOn, totalKrw: before.totalKrw, approvalNo: usage.approvalNo }, { usedOn, totalKrw: after.totalKrw, approvalNo }),
          },
        },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
    } else if (patch?.approvalNo && patch.approvalNo !== usage.approvalNo) {
      // 값이 같으면 비어 있던 승인번호만 채운다(금액 칸 그대로). PE2: 채운 전 · 후도 같은 종류 로그로 남긴다.
      if ((await applyFileWins(viewer, { id: usage.id, version: usage.version, corpCardId: usage.corpCardId, approvalNo: patch.approvalNo, usedOn: null, total: null }, tx)) === null) throw cardSlipNotFound();
      const amounts = { totalKrw: usage.totalAmountKrw, supplyKrw: usage.supplyKrw, vatKrw: usage.vatKrw };
      await recordAction(
        viewer,
        {
          actionType: "evidence_record_amount_change",
          entity: CARD_USAGE_ENTITY,
          entityId: usage.id,
          detail: {
            before: amounts,
            after: amounts,
            cardLast4Before: usage.cardLast4,
            cardLast4After: usage.cardLast4,
            evidenceRecordId: record.id,
            changes: buildChanges({ approvalNo: usage.approvalNo }, { approvalNo: patch.approvalNo }),
          },
        },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
    }
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: record.id,
        documentId: usage.id,
        detail: { change: "evidence_record_attach", ownerKind: "corp_card_usage", ownerId: usage.id },
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
/** 작성자 갈래의 문서 — 06.1-09에서 카드 사용(S5 단일)이 더해졌다. 경영관리 여러 장 붙이기는 AttachOwnerRef 그대로. */
export type AuthorAttachInput = { evidenceIds: readonly string[]; owner: RegistrarOwnerRef };
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
  // 먼저 붙은 것을 version보다 먼저 본다 — 붙이기가 증빙 version을 올리므로(P3-1) 남이 먼저 붙인 줄은 낡음이 아니라 「먼저 붙임」으로 거부한다.
  const taken = takenByOthers(await listLiveLinkOwnersByRecords(ctx.viewer, ctx.ids, tx), ctx.owner);
  if (taken.size > 0) throw new UserFacingError(conflictMessageOf(ctx.pre, taken));
  for (const record of locked) {
    const read = ctx.pre.find((item) => item.id === record.id);
    if (!read || record.version !== read.version || (ctx.mode === "author" && record.totalKrw < 0)) throw new UserFacingError(staleMessage(record.updatedAt));
  }
  await ctx.deps?.afterLock?.();
  const attachedIds: string[] = [];
  for (const id of ctx.ids) {
    const { created } = await attachLinkInTx(tx, ctx.viewer, { recordId: id, owner: ctx.owner, mode: ctx.mode });
    if (created) attachedIds.push(id);
  }
  return attachedIds;
}

async function preReadRecords(viewer: Viewer, ids: readonly string[]): Promise<BatchPreRead[]> {
  // 한 번의 묶음 읽기(PR-C /review P3-3) — 거부 차례는 그대로 ids(오름차순) 차례다. 범위 밖 · 없는 id는 묶음에 없어 RECORD_NOT_FOUND.
  const views = new Map((await listEvidenceRecordsByIds(viewer, ids)).map((view) => [view.id, view]));
  const pre: BatchPreRead[] = [];
  for (const id of ids) {
    const view = views.get(id);
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
export async function attachEvidenceAsAuthor(viewer: Viewer, input: AuthorAttachInput, deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  const { owner } = input;
  if (owner.kind !== "corp_card_usage") return attachBatch(viewer, "author", { evidenceIds: input.evidenceIds, owner }, deps);
  const ids = [...new Set(input.evidenceIds)];
  if (!ids.every((id) => UUID_SHAPE.test(id))) throw new UserFacingError(RECORD_NOT_FOUND);
  try {
    return await attachAuthorToCardUsage(viewer, ids, owner.id, deps);
  } catch (error) {
    if (error instanceof EvidenceTakenError) throw new UserFacingError(await takenMessage(viewer, error.owner));
    if (isUniqueViolation(error, LIVE_LINK_UNIQUE) && ids[0]) throw await takenError(viewer, ids[0]);
    throw error;
  }
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
  if (link.ownerKind === "corp_card_usage") {
    return detachFromCardUsage(viewer, keys, { linkId: link.id, recordId: link.evidenceRecordId, usageId: link.ownerId, reason: input.reason, detachedAt: link.detachedAt }, deps);
  }
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

// 07.1-04 PE1 · E-P2-16: 카드 사용 붙임 떼기 — 권한은 붙이기와 같은 키(경영관리 attach = 등록 ∧ 범위 안 ∧ 보관 아님). 권리 · 범위는 트랜잭션 밖 한 번,
// 안에서는 붙이기와 같은 차례로 카드 사용 행을 잠근 뒤 잠근 행의 보관 여부로 다시 판정 → 증빙 행 → 붙임 해제. 카드 사용 금액 · 사용일 · 승인번호는
// 되돌리지 않는다(덮은 전 · 후는 evidence_record_amount_change 로그에 있다). 못 보는 · 권리 없는 붙임은 없는 붙임과 같은 글자(P3-6).
async function readCardDetachRights(viewer: Viewer, keys: ViewerKeys, usageId: string): Promise<CardUsageRightsRead> {
  const read = await readCardUsageRights(viewer, usageId, keys);
  if (!read || !read.rights.attach) throw new UserFacingError(LINK_NOT_FOUND);
  return read;
}

async function detachFromCardUsage(
  viewer: Viewer,
  keys: ViewerKeys,
  input: { linkId: string; recordId: string; usageId: string; reason: string; detachedAt: Date | null },
  deps?: EvidenceAttachDeps,
): Promise<{ detached: boolean }> {
  const read = await readCardDetachRights(viewer, keys, input.usageId);
  const reason = validateRejectReason(input.reason);
  if (input.detachedAt !== null) return { detached: false };
  await deps?.afterPreRead?.();
  return withTransaction(async (tx) => {
    const owner = await cardSlipOwner(viewer, input.usageId, tx);
    if (!owner || !cardUsageRecordRights({ ...read.facts, drafterId: owner.drafterId, status: owner.status }, read.flags).attach) throw new UserFacingError(LINK_NOT_FOUND);
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
        documentId: owner.id,
        detail: { change: "evidence_record_detach", ownerKind: "corp_card_usage", ownerId: owner.id, linkId: input.linkId, reasonLength: reason.length },
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
  if (link.ownerKind === "corp_card_usage") {
    // 카드 사용은 문서 비용 기준이 없다 — 떼기와 같은 거부, 권리가 있으면 빈 미리 보기.
    await readCardDetachRights(viewer, keys, link.ownerId);
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
/** 06.1-09 D-6111: 고르면 파일 값으로 바뀌는 카드 사용 칸(전 → 후) — 카드는 끝 4자리. 카드 사용이 아니거나 바뀔 값이 없으면 null. */
export type CardValueChanges = { total: { before: number; after: number } | null; card: { before: string; after: string } | null };

export type EvidenceAttachCandidateDto = {
  kind: "expense" | "purchase_request" | "corp_card_usage";
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
  valueChanges: CardValueChanges | null;
};

// 두 종류가 한 목록에 섞이지만 금액 항목이 달라 명세를 둘 둔다(지출결의 · 구매 요청). 금액 칸 밖은 같다.
function candidateSpec(amountItem: string, changesItem = "evidence.value"): DtoSpec<EvidenceAttachCandidateDto, EvidenceAttachCandidateDto> {
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
      { key: "valueChanges", from: "valueChanges", infoItem: changesItem },
    ],
  };
}

export const EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC = candidateSpec("expense.amount");
export const EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC = candidateSpec("purchase_request.amount");
// 카드 사용 = 합계(card_usage.amount) · 전 → 후도 카드 사용 금액이다.
export const EVIDENCE_ATTACH_CARD_CANDIDATE_DTO_SPEC = candidateSpec("card_usage.amount", "card_usage.amount");

registerDto({ name: "EvidenceAttachCandidateDto", fields: EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "EvidenceAttachRequestCandidateDto", fields: EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "EvidenceAttachCardCandidateDto", fields: EVIDENCE_ATTACH_CARD_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 순위 순서를 지키며 종류마다 제 명세로 투영한다(노출 판정은 명세마다 항목 수만큼 — projectMany).
async function projectCandidates(viewer: Viewer, dtos: readonly EvidenceAttachCandidateDto[]): Promise<Partial<EvidenceAttachCandidateDto>[]> {
  const projected = new Map<EvidenceAttachCandidateDto, Partial<EvidenceAttachCandidateDto>>();
  for (const [kind, spec] of [
    ["expense", EVIDENCE_ATTACH_CANDIDATE_DTO_SPEC],
    ["purchase_request", EVIDENCE_ATTACH_REQUEST_CANDIDATE_DTO_SPEC],
    ["corp_card_usage", EVIDENCE_ATTACH_CARD_CANDIDATE_DTO_SPEC],
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
      valueChanges: null,
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
      valueChanges: null,
    },
  };
}

// 06.1-09 S4 카드 사용 행(DB-9 · E34). 순위 열쇠는 06.1-06 compareCandidates를 그대로 쓴다 — 카드 사용은 합계로 견주므로 구매 요청과 같은 금액
// 열쇠 꼴(문서 종류 칸은 순위에 쓰이지 않는다). 막힌 행은 pairOk 거짓으로 뒤에 두고, 합친 뒤 맨 뒤로 한 번 더 민다(카드 막힌 행 맨 뒤).
function valueChangesOf(patch: FileWinsPatch): CardValueChanges | null {
  if (!patch.total && !patch.card) return null;
  return { total: patch.total, card: patch.card ? { before: patch.card.before.last4, after: patch.card.after.last4 } : null };
}

function cardSubtitle(row: RelaxedCandidateRow, changes: CardValueChanges | null): string {
  const pieces = [
    changes?.total ? `합계 ${formatKrw(changes.total.before)} → ${formatKrw(changes.total.after)}` : null,
    changes?.card ? `카드 ${changes.card.before} → ${changes.card.after}` : null,
  ].filter((piece): piece is string => piece !== null);
  return pieces.length > 0 ? pieces.join(" · ") : `${row.usedOn.slice(5)} · ${row.cardLast4}`;
}

function cardCandidate(record: EvidenceRecordFacts, item: JudgedCardCandidate, amountsShown: boolean): Candidate & { cardBlocked: boolean } {
  const { row, judged } = item;
  const doc = { kind: "purchase_request" as const, id: row.id, evidenceType: null, businessNo: null, amountKrw: row.totalAmountKrw, date: row.usedOn, pairOk: judged.blockedReason === null };
  // 금액을 못 보는 사람에게는 전 → 후를 싣지 않는다(쓰기도 RIGHTS_DENIED — planCardAttach).
  const changes = amountsShown ? valueChangesOf(judged.patch) : null;
  return {
    ...doc,
    score: scoreCandidate(record, doc),
    dayGap: dayGapOf(record, doc),
    cardBlocked: judged.blockedReason !== null,
    dto: {
      kind: "corp_card_usage",
      id: row.id,
      number: row.number ?? "—",
      title: `카드 사용 · ${row.usedByName ?? "—"}`,
      subtitle: cardSubtitle(row, changes),
      amountKrw: row.totalAmountKrw,
      selectable: judged.blockedReason === null,
      reason: judged.blockedReason,
      inReview: false,
      valueChanges: changes,
    },
  };
}

async function cardCandidatesFor(viewer: Viewer, record: EvidenceRecordFacts): Promise<(Candidate & { cardBlocked: boolean })[]> {
  const row = await findRecordForScope(viewer, await evidenceScopeFor(viewer), record.id);
  if (!row || !isCardFormat(row.format) || row.corpCardId === null) return [];
  const judged = (await judgeCardCandidates(viewer, [row], await cardUsageReadScope(viewer))).get(row.id) ?? [];
  if (judged.length === 0) return [];
  const [usageAmount, recordAmount] = await Promise.all([visible(viewer, "card_usage.amount"), visible(viewer, "evidence.amount")]);
  return judged.map((item) => cardCandidate(record, item, usageAmount && recordAmount));
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
  const cardRows = await cardCandidatesFor(viewer, record);
  const ranked = [
    ...expenseRows.slice(0, CANDIDATE_LIMIT).map((row) => ({ ...expenseCandidate(viewer, keys, codes, record, row), cardBlocked: false })),
    ...requestRows.slice(0, CANDIDATE_LIMIT).map((row) => ({ ...requestCandidate(record, row), cardBlocked: false })),
    ...cardRows.slice(0, CANDIDATE_LIMIT),
  ].sort(compareCandidates);
  const merged = [...ranked.filter((candidate) => !candidate.cardBlocked), ...ranked.filter((candidate) => candidate.cardBlocked)];
  const kept = merged.slice(0, CANDIDATE_LIMIT);
  const truncated = expenseRows.length > CANDIDATE_LIMIT || requestRows.length > CANDIDATE_LIMIT || cardRows.length > CANDIDATE_LIMIT || merged.length > CANDIDATE_LIMIT;
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

// ── 06.1-09 카드 사용 권리(RP-4 · PA-CUAUTH) — domain/evidence는 고치지 않는다 ─────────────────────────────────────
// 경영관리(registrar) = evidence.intake ∧ 범위 안 ∧ 보관 아님. 작성자 = 05 카드 전표 쓰기 권리(06-09 수정 권리 — 완료 프로젝트 줄은 대리 등록
// 권한자만, O-11) ∧ 등록한 사람 = 나 ∧ 구매에서 생긴 건 아님(E23) ∧ evidence 보기 ∧ 보관 아님. 팀장 · 대리 등록 권한자라도 등록한 사람이 아니면 작성자가 아니다.
export type CardUsageRightsFacts = { drafterId: string; status: "open" | "closed"; read: boolean; slipWrite: boolean; registeredVia: string };
export type CardUsageRightsFlags = { viewerId: string; intake: boolean; evidenceView: boolean };

export function cardUsageRecordRights(facts: CardUsageRightsFacts, flags: CardUsageRightsFlags): { attach: boolean; authorAttach: boolean } {
  const open = facts.read && facts.status === "open";
  return {
    attach: open && flags.intake,
    authorAttach: open && facts.slipWrite && facts.drafterId === flags.viewerId && facts.registeredVia !== "purchase" && flags.evidenceView,
  };
}

// facts · flags는 트랜잭션 안 재판정이 잠근 행 상태만 바꿔 다시 쓴다(07.1-04 카드 사용 떼기).
export type CardUsageRightsRead = { usage: CardUsageForWrite; rights: { attach: boolean; authorAttach: boolean }; facts: CardUsageRightsFacts; flags: CardUsageRightsFlags };

// 트랜잭션 밖 한 번(06-03) — 못 보는 · 없는 카드 사용은 null(부르는 쪽이 STALE 글자 하나로 — carry-over 4).
export async function readCardUsageRights(viewer: Viewer, usageId: string, keys?: ViewerKeys): Promise<CardUsageRightsRead | null> {
  const owner = await cardSlipOwner(viewer, usageId);
  if (!owner) return null;
  const slip = await cardSlipRights(viewer, owner);
  if (!slip.read) return null;
  const usage = await findCardUsageForWrite(viewer, usageId, { includeArchived: true });
  if (!usage) return null;
  const [intake, evidenceView] = await Promise.all([keys ? Promise.resolve(keys.intake) : can(viewer, "evidence.intake", "write"), can(viewer, "evidence", "view")]);
  const facts: CardUsageRightsFacts = { drafterId: owner.drafterId, status: owner.status, read: slip.read, slipWrite: slip.write, registeredVia: usage.registeredVia };
  const flags: CardUsageRightsFlags = { viewerId: viewer.id, intake, evidenceView };
  return { usage, rights: cardUsageRecordRights(facts, flags), facts, flags };
}

/** 작성자 막힌 행 글자(DB-8) — 값이 다른 줄은 경영관리만 덮는다. 덮을 값이 없으면 null. */
export function authorCardBlock(patch: FileWinsPatch): string | null {
  if (patch.total) return `합계 ${formatKrw(patch.total.before)} → ${formatKrw(patch.total.after)} · ${AUTHOR_CARD_WORD}`;
  if (patch.card) return `카드 ${patch.card.before.last4} → ${patch.card.after.last4} · ${AUTHOR_CARD_WORD}`;
  return null;
}

// ── 06.1-09 작성자 → 카드 사용 붙이기(S5 · E23 · DB-8 · O-6104 닫음) ─────────────────────────────────────────────
// 같은 카드 · 같은 합계 줄 하나만. 값은 바꾸지 않고 비어 있던 승인번호만 채운다(덮기는 경영관리 · 대사만 — applyFileWins를 부르지 않는다).
// 잠금 순서는 경영관리 갈래와 같다(카드 사용 행 → 증빙 행 → 붙임) — 합계가 안 바뀌니 견적 줄 잠금은 없다.
async function attachAuthorToCardUsage(viewer: Viewer, ids: readonly string[], usageId: string, deps?: EvidenceAttachDeps): Promise<{ attached: number }> {
  const read = await readCardUsageRights(viewer, usageId);
  if (!read || !read.rights.authorAttach || read.usage.archivedAt !== null) throw cardSlipNotFound();
  const { usage } = read;
  const [recordId] = ids;
  if (ids.length !== 1 || recordId === undefined) throw new UserFacingError(RECORD_NOT_FOUND);
  const [pre] = await preReadRecords(viewer, [recordId]);
  const record = await findRecordForScope(viewer, await evidenceScopeFor(viewer), recordId);
  if (!pre || !record || !isCardFormat(record.format) || record.corpCardId !== usage.corpCardId || record.totalKrw < 0) throw new UserFacingError(RECORD_NOT_FOUND);
  const patch = fileWinsPatch(
    { totalKrw: usage.totalAmountKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4 },
    { totalKrw: record.totalKrw, corpCardId: record.corpCardId, cardLast4: record.cardLast4 ?? "", approvalNo: record.approvalNo },
  );
  const blocked = authorCardBlock(patch);
  if (blocked) throw new UserFacingError(blocked);
  if ((await cardStatementOwners(viewer, [usage.id])).has(usage.id)) throw new UserFacingError(`증빙 있음 · ${usage.number}`);
  await deps?.afterPreRead?.();

  return withTransaction(async (tx) => {
    const locked = await lockCardUsageForUpdate(viewer, usage.id, tx);
    if (!locked || locked.archivedAt !== null || locked.version !== usage.version) throw cardSlipNotFound();
    if ((await cardStatementOwners(viewer, [usage.id], tx)).has(usage.id)) throw new UserFacingError(`증빙 있음 · ${usage.number}`);
    const { created } = await attachLinkInTx(tx, viewer, { recordId, owner: { kind: "corp_card_usage", id: usage.id }, mode: "author" }, { afterLock: deps?.afterLock });
    if (!created) return { attached: 0 };
    const [lockedRecord] = await lockRecordsForUpdate(viewer, [recordId], tx);
    // 붙임이 version을 하나 올린다(attachLinkInTx) — 사전 판독 version + 1이 아니면 그사이 다른 쓰기가 있었다.
    if (!lockedRecord || lockedRecord.version !== pre.version + 1) throw new UserFacingError(staleMessage(lockedRecord?.updatedAt ?? new Date()));
    // 검토 P3-1: 비어 있던 승인번호만 채운다 — 이미 있는 승인번호는 덮지 않는다.
    if (patch.approvalNo && usage.approvalNo === null) {
      if ((await fillCardUsageApprovalNo(viewer, { id: usage.id, version: usage.version, approvalNo: patch.approvalNo }, tx)) === null) throw cardSlipNotFound();
    }
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "evidence_record",
        entityId: recordId,
        documentId: usage.id,
        detail: { change: "evidence_record_attach", ownerKind: "corp_card_usage", ownerId: usage.id, attachMode: "author", recordIds: [recordId] },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
    return { attached: 1 };
  });
}

// ── 06.1-09 완화 후보 판정(S4 후보 · S2 행 행동 — PA-RELAX · DB-9 · N-6 · 카드 R3 · P2-C4) ─────────────────────
// 트랜잭션 밖(06-03): 후보 질의 한 번 → 카드 명세 붙음 한 번 → 덮기 기준(설정 · 세율) 한 번 → 줄마다 06 cardUsageOverwriteBlocks → 순수 판정.
export type CardLineRow = Pick<EvidenceRecordListRow, "id" | "format" | "corpCardId" | "cardLast4" | "approvalNo" | "issuedOn" | "totalKrw">;
export type JudgedCardCandidate = { row: RelaxedCandidateRow; judged: RelaxedCandidate };

function relaxedLineOf(record: CardLineRow): RelaxedLine | null {
  if (record.corpCardId === null) return null;
  return { corpCardId: record.corpCardId, cardLast4: record.cardLast4 ?? "", approvalNo: record.approvalNo, usedOn: record.issuedOn, totalKrw: record.totalKrw };
}

export async function judgeCardCandidates(viewer: Viewer, records: readonly CardLineRow[], scope: CardUsageScope): Promise<Map<string, JudgedCardCandidate[]>> {
  const lines = records.flatMap((record) => {
    const line = relaxedLineOf(record);
    return line && isCardFormat(record.format) ? [{ record, line }] : [];
  });
  const result = new Map<string, JudgedCardCandidate[]>();
  if (lines.length === 0) return result;
  const rows = await findRelaxedCandidates(viewer, { scope, lines: lines.map(({ line }) => line) });
  const statements = await cardStatementOwners(viewer, rows.map((row) => row.id));
  // E-P1-04: 실행가 판정이 새 사용일(줄 날짜) 세율을 찾는다 — 후보 날짜 + 줄 날짜.
  const basis = rows.length > 0 ? await loadCardOverwriteBasis(viewer, [...new Set([...rows.map((row) => row.usedOn), ...lines.map(({ line }) => line.usedOn)])]) : null;
  for (const { record, line } of lines) {
    const hits = rows.filter((row) => isRelaxedHit(line, { approvalNo: row.approvalNo, usedOn: row.usedOn, totalKrw: row.totalAmountKrw }));
    const patches = hits.map((row) => ({
      row,
      patch: fileWinsPatch({ totalKrw: row.totalAmountKrw, corpCardId: row.corpCardId, cardLast4: row.cardLast4, usedOn: row.usedOn, approvalNo: row.approvalNo }, { ...line, totalKrw: line.totalKrw }),
    }));
    const blocks =
      basis && patches.length > 0
        ? await cardUsageOverwriteBlocks(
            viewer,
            patches.map(({ row, patch }) => ({ usageId: row.id, totalKrw: patch.total?.after ?? null, corpCardId: patch.card?.after.id ?? null, usedOn: patch.usedOn?.after ?? null })),
            basis,
          )
        : new Map<string, CardOverwriteBlock>();
    const judged = relaxedCandidatesOf(
      line,
      hits.map((row) => ({
        id: row.id,
        number: row.number,
        corpCardId: row.corpCardId,
        cardLast4: row.cardLast4,
        sameIssuer: sameIssuerOfFormat(record.format, row.cardIssuer),
        approvalNo: row.approvalNo,
        usedOn: row.usedOn,
        totalKrw: row.totalAmountKrw,
        cardStatementAttached: statements.has(row.id),
        overwriteBlock: blocks.get(row.id) ?? null,
      })),
    );
    const byId = new Map(hits.map((row) => [row.id, row]));
    result.set(record.id, judged.flatMap((item) => { const row = byId.get(item.id); return row ? [{ row, judged: item }] : []; }));
  }
  return result;
}

// ── 06.1-09 S8 대리 등록(C-F14 · PA-S8-KEY · PA-S8-STALE · PA-S8-RACE · E5 · C2) ─────────────────────────────────────────────
// 짝 없는 카드 줄(완화 후보 0 — S2 `canProxy`와 같은 판정)에서 06 카드 사용을 만들고 그 줄을 한 트랜잭션에 붙인다. 카드 · 사용일 · 합계 · 증빙 종류는
// 서버가 증빙에서 다시 읽는다(브라우저 값을 믿지 않는다). 가맹점 거래처는 채우지도 만들지도 않는다 — 260907 `server/src/card-uses.ts:1191`
// 답하기 길이 `purchasePlace: null`로 넣고, `server/src/receipts.ts:3200`이 카드 전표에서 거래처를 만들지 않는다(한 번 쓰고 마는 가맹점이 쌓인다).
// 파일의 가맹점 글자는 폼에 읽기 텍스트로만 보인다. 06 domain은 이 파일을 import하지 않는다(순환 없음).

const CARD_USAGE_EXISTS = "카드 사용 있음 · 붙이기로";
const CARD_PROXY_DENIED = "카드 대리 등록 권한 없음";
const CARD_IDEMPOTENCY_UNIQUE = "corp_card_usages_idempotency_key_uniq";
const RETRY_TAIL = " · 새로 고침";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** 사람이 고르는 칸 — 사용한 사람 · 연결 · 메모뿐(카드 · 사용일 · 합계 · 가맹점 · 증빙 종류는 없다). */
export type CardUsageChosen = DistributiveOmit<CardUsageInput, "corpCardId" | "usedOn" | "merchantVendorId" | "total" | "evidenceTypeCode" | "purchaseRequestId" | "idempotencyKey">;

/** 06 등록 패널의 미리 채움(평범한 값) — `CardUsageEntry.prefill`로 넘긴다. */
export type CardUsagePrefill = { corpCardId: string; cardLast4: string; usedOn: string; totalKrw: number; merchant: string | null; evidenceTypeCode: string };

export type CardProxyDeps = {
  /** 사전 판독 뒤 · 트랜잭션 전(E5 · C2 경합 시험 자리). */
  afterPreRead?: () => Promise<void>;
  /** 트랜잭션 안 06 createCardUsage 뒤(같은 키 동시 저장 시험 자리 — PA-S8-RACE). */
  afterCreate?: () => Promise<void>;
  isActionTypeEnabled?: RecordActionDeps["isActionTypeEnabled"];
};

type ProxyLine = { prefill: CardUsagePrefill; line: RelaxedLine };

async function readProxyLine(viewer: Viewer, evidenceId: string): Promise<ProxyLine | null> {
  const [intake, proxy] = await Promise.all([can(viewer, "evidence.intake", "write"), can(viewer, "cards.proxy", "write")]);
  if (!intake || !proxy) return null;
  // S2 행 행동과 같은 판정 한 자리(canProxy — 카드 등록됨 · 안 붙음 · 음수 아님 · 보관 아님 · 완화 후보 0).
  const view = await getEvidenceRecord(viewer, evidenceId);
  if (view?.canProxy !== true) return null;
  const row = await findRecordForScope(viewer, await evidenceScopeFor(viewer), evidenceId);
  if (!row || row.corpCardId === null || !isCardFormat(row.format)) return null;
  const line = relaxedLineOf(row);
  if (!line) return null;
  return {
    prefill: { corpCardId: row.corpCardId, cardLast4: row.cardLast4 ?? "", usedOn: row.issuedOn, totalKrw: row.totalKrw, merchant: row.merchant, evidenceTypeCode: row.evidenceType },
    line,
  };
}

export async function cardUsagePrefillFromEvidence(viewer: Viewer, evidenceId: string): Promise<CardUsagePrefill | null> {
  return (await readProxyLine(viewer, evidenceId))?.prefill ?? null;
}

// S8 폼 오류 자리(PanelForm reason 평문)는 꼬리를 버튼으로 만들지 않고, 새로 고침하면 PA-S8-STALE 404다 — 꼬리를 뗀다(재검토 3회차 N1).
async function proxyTakenError(viewer: Viewer, owner: LiveLinkOwner | undefined): Promise<UserFacingError> {
  const message = await takenMessage(viewer, owner);
  return new UserFacingError(message.endsWith(RETRY_TAIL) ? message.slice(0, -RETRY_TAIL.length) : message);
}

// 사전 판독이 null일 때의 거부 — 권한 · 붙음(06.1-06 경합 글과 같은 읽기) · 완화 후보 있음 · 그 밖(없음 · 보관 · 범위 밖).
async function proxyRefusal(viewer: Viewer, evidenceId: string): Promise<Error> {
  if (!(await can(viewer, "evidence.intake", "write"))) return new ForbiddenError(INTAKE_FORBIDDEN);
  if (!(await can(viewer, "cards.proxy", "write"))) return new ForbiddenError(CARD_PROXY_DENIED);
  // 검토 P2-2: 금액을 못 보는 사람은 보이지 않는 합계로 카드 사용을 만들지 못한다(S4 planCardAttach와 같은 거부).
  const [usageAmount, recordAmount] = await Promise.all([visible(viewer, "card_usage.amount"), visible(viewer, "evidence.amount")]);
  if (!usageAmount || !recordAmount) denyCardSlipWrite();
  const view = await getEvidenceRecord(viewer, evidenceId);
  if (!view) return new UserFacingError(RECORD_NOT_FOUND);
  const [owner] = await listLiveLinkOwnersByRecords(viewer, [evidenceId]);
  if (owner) return proxyTakenError(viewer, owner);
  if (view.canAttach === true || (view.actionBlockedReason ?? null) !== null) return new UserFacingError(CARD_USAGE_EXISTS);
  return new UserFacingError(RECORD_NOT_FOUND);
}

// 트랜잭션 안 공통 꼬리 — 완화 후보 재조회(E5 — 새로 만든 행 제외) → 승인번호 채움 → 06.1-06 attachLinkInTx(보관 · 붙음 재검사) → 기록.
async function attachProxyLink(tx: DbOrTx, viewer: Viewer, ctx: { evidenceId: string; usage: CreatedCardUsage; line: RelaxedLine; scope: CardUsageScope }, deps: CardProxyDeps): Promise<void> {
  // 전역 차례 카드 사용 → 증빙 행(검토 P3-1 — 경합 재시도의 usage는 이미 커밋된 행이다). 같은 키 재생 · 경합 패자가 받은 행이 이 줄과
  // 카드 · 사용일 · 합계가 다르면 다른 증빙으로 만든 행이다 — 붙이지 않는다(cso D1).
  const locked = await lockCardUsageForUpdate(viewer, ctx.usage.id, tx);
  if (!locked || locked.archivedAt !== null) throw cardSlipNotFound();
  if (locked.corpCardId !== ctx.line.corpCardId || locked.usedOn !== ctx.line.usedOn || locked.totalAmountKrw !== ctx.line.totalKrw) throw cardSlipNotFound();
  const others = await findRelaxedCandidates(viewer, { scope: ctx.scope, lines: [ctx.line], excludeIds: [ctx.usage.id] }, tx);
  if (others.some((row) => isRelaxedHit(ctx.line, { approvalNo: row.approvalNo, usedOn: row.usedOn, totalKrw: row.totalAmountKrw }))) throw new UserFacingError(CARD_USAGE_EXISTS);
  const { created } = await attachLinkInTx(tx, viewer, { recordId: ctx.evidenceId, owner: { kind: "corp_card_usage", id: ctx.usage.id }, mode: "registrar" });
  if (!created) return;
  if (ctx.line.approvalNo && locked.approvalNo === null) {
    if ((await fillCardUsageApprovalNo(viewer, { id: locked.id, version: locked.version, approvalNo: ctx.line.approvalNo }, tx)) === null) throw cardSlipNotFound();
  }
  await recordAction(
    viewer,
    {
      actionType: "document_update",
      entity: "evidence_record",
      entityId: ctx.evidenceId,
      documentId: ctx.usage.id,
      detail: { change: "evidence_record_attach", ownerKind: "corp_card_usage", ownerId: ctx.usage.id, via: "card_proxy" },
    },
    { tx, isActionTypeEnabled: deps.isActionTypeEnabled },
  );
}

export async function createCardUsageFromEvidence(
  viewer: Viewer,
  input: { evidenceId: string; chosen: CardUsageChosen; idempotencyKey: string },
  deps: CardProxyDeps = {},
): Promise<CreatedCardUsage> {
  // 재전송(D-6509)은 사전 판독보다 먼저 — 이미 붙은 줄이라 미리 채움이 null이다.
  const reused = await reusableCardUsage(viewer, input.idempotencyKey);
  if (reused) return reused;
  const read = await readProxyLine(viewer, input.evidenceId);
  if (!read) throw await proxyRefusal(viewer, input.evidenceId);
  const { prefill, line } = read;
  const cardInput: CardUsageInput = {
    ...input.chosen,
    corpCardId: prefill.corpCardId,
    usedOn: prefill.usedOn,
    merchantVendorId: null,
    total: { currency: "KRW", amount: prefill.totalKrw, fxRate: 1 },
    evidenceTypeCode: prefill.evidenceTypeCode,
    idempotencyKey: input.idempotencyKey,
  };
  const pre = await precheckCardUsage(viewer, cardInput);
  const scope = await cardUsageReadScope(viewer);
  await deps.afterPreRead?.();

  const ctx = { evidenceId: input.evidenceId, line, scope };
  try {
    return await withTransaction(async (tx) => {
      const usage = await createCardUsage(viewer, cardInput, pre, tx);
      await deps.afterCreate?.();
      await attachProxyLink(tx, viewer, { ...ctx, usage }, deps);
      return usage;
    });
  } catch (error) {
    if (error instanceof EvidenceTakenError) throw await proxyTakenError(viewer, error.owner);
    if (isUniqueViolation(error, LIVE_LINK_UNIQUE)) {
      const [owner] = await listLiveLinkOwnersByRecords(viewer, [input.evidenceId]);
      throw await proxyTakenError(viewer, owner);
    }
    // PA-S8-RACE: 같은 키 동시 저장에서 진 쪽 — 트랜잭션 밖에서 이긴 행을 읽고, 이 줄이 그 행에 붙어 있지 않으면 새 트랜잭션에서 붙인다.
    if (!isUniqueViolation(error, CARD_IDEMPOTENCY_UNIQUE)) throw error;
    const winner = await reusableCardUsage(viewer, input.idempotencyKey);
    if (!winner) throw error;
    const [owner] = await listLiveLinkOwnersByRecords(viewer, [input.evidenceId]);
    if (owner?.ownerKind === "corp_card_usage" && owner.ownerId === winner.id) return winner;
    try {
      await withTransaction((tx) => attachProxyLink(tx, viewer, { ...ctx, usage: winner }, deps));
    } catch (attachError) {
      if (attachError instanceof EvidenceTakenError) throw await proxyTakenError(viewer, attachError.owner);
      throw attachError;
    }
    return winner;
  }
}
