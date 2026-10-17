import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { log } from "@/lib/log";
import { getObjectStorage, type ObjectStorage } from "@/lib/gcp/storage";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project, projectMany } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { loadActionLogGate, recordActionInTx } from "@/domain/approvals/tx-log";
import { validateRejectReason } from "@/domain/approvals";
import { buildEvidenceVoidedMessage } from "@/domain/approvals/conflict-message";
import { canSeeExpense, EXPENSE_ALREADY_CLOSED, EXPENSE_DOCUMENT_KIND, ExpenseCloseRefusedError, ExpenseConflictError, ExpenseNotFoundError } from "@/domain/expenses";
import { EVIDENCE_FILE_DTO_SPEC, type EvidenceFileDto } from "@/domain/evidence/dto";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { checkEvidenceUpload, duplicateScopeKinds, EVIDENCE_DUPLICATE_HIDDEN, EVIDENCE_UPLOAD_FAILED, type EvidenceDuplicate } from "@/domain/evidence/upload-checks";
import {
  APPROVAL_EVIDENCE_KIND,
  denyRevisionEvidenceWrite,
  revisionEvidenceNotFound,
  revisionEvidenceOwner,
  revisionEvidenceRights,
  revisionEvidenceWriteOpen,
} from "@/domain/quotes/revisions";
import {
  denyReserveEvidenceWrite,
  RESERVE_EVIDENCE_KIND,
  reserveEvidenceNotFound,
  reserveEvidenceOwner,
  reserveEvidenceRights,
  reserveEvidenceWriteOpen,
} from "@/domain/reserves";
import { CARD_USAGE_ENTITY, cardSlipNotFound, cardSlipOwner, cardSlipRights, cardSlipWriteOpen, denyCardSlipWrite, type CardSlipOwner } from "@/domain/corp-card-usages";
import { bumpInstanceVersion } from "@/repositories/approvals";
import { clearEvidenceValues, deleteReviewByExpense, type EvidenceReviewStatus } from "@/repositories/expense-evidence-reviews";
import { bumpExpenseVersion } from "@/repositories/expense-payments";
import { findExpenseApprovalInstance, findExpenseById, lockExpenseForUpdate } from "@/repositories/expenses";
import { findActiveBySha, findAliveFileOfIntent, findFileById, insertFile, listActiveByOwner, markRemoved, markRestored, markVoided, type FileRow } from "@/repositories/files";
import { findProjectById, lockProjectForWrite } from "@/repositories/projects";
import { findUserById } from "@/repositories/users";
import { completeIntentIfOpen, findIntentById, insertIntent } from "@/repositories/upload-intents";

export type { EvidenceFileDto } from "@/domain/evidence/dto";

// 05-04(EVID-01): 증빙 업로드 경로 — 선언(requestEvidenceUpload) → 브라우저가 서명된 PUT 주소로 저장소에 직접 올림 →
// 완료 통보(completeEvidenceUpload)가 메타데이터를 다시 확인하고 `incoming/{의도 id}` → `evidence/{파일 id}`로 옮긴 뒤에만
// 파일 행을 만든다. 객체 키는 이 파일만 만든다. 저장소 호출(메타데이터 · 옮기기 · 보존 표식 · 삭제)은 트랜잭션 밖에서만 한다.
// 잠금 순서: 증빙 추가 · 삭제는 지출결의 행(lockExpenseForUpdate) → 결재 인스턴스(bumpInstanceVersion 조건 UPDATE) — 제출(프로젝트 →
// 지출결의 → 인스턴스 → 카운터)과 같은 쌍을 거꾸로 잡는 경로가 없다. 04.1 승인 · 반려 · 회수는 인스턴스만 잡는다.
// 05-09 제출 뒤 규칙(사용자 결정 2026-10-04): 기안자는 작성 중 · 반려 · 회수 · 승인에서 더하고 작성 중 · 반려 · 회수에서만 뗀다.
// 결재 중에는 아무도 떼지 못하고, 붙이기는 결재 중 증빙 붙이기 권한자만 한다. 결재 중 · 승인 뒤 추가는 같은 tx에서 인스턴스 version을
// 올린다(reason evidence — 그 전에 문서를 연 결재자의 승인이 막힌다). 승인 뒤 잘못 붙은 증빙은 무효 처리(voidEvidence)한다.

const MB = 1024 * 1024;
const SIGNED_PUT_EXPIRES_SEC = 900;
// 의도는 서명 PUT보다 오래 산다 — PUT 만료 직전에 시작한 느린 업로드(폰 · 큰 파일)가 끝난 뒤에도 완료 통보가 열려 있다(05 /review A10 · F7).
const UPLOAD_GRACE_SEC = 15 * 60;
const INTENT_TTL_MS = (SIGNED_PUT_EXPIRES_SEC + UPLOAD_GRACE_SEC) * 1000;
const VIEW_URL_EXPIRES_SEC = 300;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PC 브라우저가 그리지 못할 수 있는 형식은 내려받기로(리뷰 Round 1 P3-6).
const DOWNLOAD_ONLY_TYPES = new Set(["image/heic", "image/heif"]);

// 선언 단계 검사 실패(크기 · 형식 · 중복) — 문구는 upload-checks 상수 그대로.
export class EvidenceCheckError extends UserFacingError {}

// 05-09: 상태 때문에 열리지 않는 증빙 변경(잠금 전 판정 — 잠금 뒤 재판정에서 바뀐 상태는 ExpenseConflictError).
export class EvidenceLockedError extends UserFacingError {}
export const EVIDENCE_LOCKED_IN_REVIEW = "결재 중 · 증빙 잠김";
export const EVIDENCE_REMOVE_LOCKED_APPROVED = "승인 뒤 · 증빙 삭제 잠김";
export const EVIDENCE_VOID_ONLY_APPROVED = "승인 뒤에만 무효 처리";
// 웨이브 11 검토 m1: 결재 중이 아닌 문서(승인 · 반려 · 회수)에 기안자가 아닌 붙이기 권한자가 붙이려 할 때.
export const EVIDENCE_ADD_DRAFTER_ONLY = "결재 중 아님 · 증빙은 작성자";
// 06-11(U-4): 완료 프로젝트의 승인 문서는 기안자에게 닫힌다(붙이기 권한자만 연다).
export const EVIDENCE_COMPLETED_PROJECT_LOCKED = "완료 프로젝트 · 증빙 잠김";

// 완료 통보 거부는 전부 같은 문구 하나 + 서버가 정한 다시 하기 갈래(design-review D3):
// complete = 의도가 열려 있고 메타데이터가 맞았는데 옮기기만 실패(원본이 incoming/에 남음 — 완료 통보만 다시),
// restart = 그 밖 전부(선언부터 다시).
export class EvidenceUploadRefusedError extends UserFacingError {
  constructor(readonly retry: "complete" | "restart") {
    super(EVIDENCE_UPLOAD_FAILED);
  }
}

export type EvidenceDeps = {
  storage?: ObjectStorage;
  now?: Date;
  // 경합 사례용 — 트랜잭션 첫 잠금 직후(lock-race.ts 관례).
  afterLock?: () => Promise<void>;
};

// ── 주인 종류별 판정 ─────────────────────────────────────────────────
// 지금 주인은 지출결의 하나다. Phase 6이 종류를 더할 때 이 표에 한 줄을 더한다.

type OwnerState = {
  id: string;
  drafterId: string;
  number: string | null;
  status: string | null;
  updatedAt: Date;
  // 06-11 — 문서 version(결재 통과 문서의 증빙 변경이 올린다 · B-1). 주인 종류에 문서 version이 없으면 0.
  version: number;
  // 06-11 — 지출결의의 프로젝트(팀 비용 문서는 null). 무효 잠금(X-12)이 프로젝트 행을 먼저 잡는 데 쓴다.
  projectId: string | null;
  instance: { id: string; version: number } | null;
  // 06-28: 종결 문서 — 증빙은 읽기만(기안자도 더하거나 떼지 못한다).
  closed: boolean;
  // 06-11(U-4) — 프로젝트가 완료(completed)인 문서(프로젝트가 없는 팀 비용 문서는 false). 승인 뒤 기안자 추가를 닫는다.
  projectCompleted: boolean;
};

type OwnerRights = { read: boolean; write: boolean };

type OwnerRule = {
  load(viewer: Viewer, ownerId: string): Promise<OwnerState | null>;
  lock(viewer: Viewer, ownerId: string, tx: DbOrTx): Promise<OwnerState | null>;
  canSee(viewer: Viewer, owner: OwnerState): Promise<boolean>;
  // 06-16 — 있으면 05 기안자 판정(adderOf · addOpen · drafterRemoves)을 거치지 않고 { read, write }로 보기 · 붙이기 · 떼기 · 되살리기를 정한다(트랜잭션 밖 풀 읽기).
  // 잠근 뒤에는 순수 판정 writeOpen으로 다시 본다. 권리 밖 직접 호출은 denyWrite가 주인 모듈의 거부로 던진다. expense 줄에는 이 셋이 없어 05 동작이 그대로다.
  rights?(viewer: Viewer, owner: OwnerState): Promise<OwnerRights>;
  writeOpen?(owner: OwnerState, viewerId: string): boolean;
  denyWrite?(viewer: Viewer, owner: OwnerState): never;
  // 기안자가 더하는 상태 · 떼는 상태(05-09).
  drafterAdds(owner: OwnerState): boolean;
  drafterRemoves(owner: OwnerState): boolean;
  // 결재 중(붙이기 권한자만 더함 · 아무도 못 뗌) · 승인(무효 처리만).
  inReview(owner: OwnerState): boolean;
  approved(owner: OwnerState): boolean;
  // 06-11(X-12) — 주인보다 먼저 잡는 상위 행(05 N-3 순서: 프로젝트 → 지출결의 → 파일). 상위 행이 없는 주인은 건너뛴다.
  lockParent?(viewer: Viewer, owner: OwnerState, tx: DbOrTx): Promise<unknown>;
  // 06-11(C4 · B-1) — 결재 통과 문서의 증빙 추가 · 무효가 같은 트랜잭션에서 부른다. 풀린 확인 기록의 status를 돌려준다(없으면 null).
  onApprovedEvidenceChange?(viewer: Viewer, owner: OwnerState, change: { kind: "add" | "void" }, tx: DbOrTx): Promise<EvidenceReviewStatus | null>;
  attachMenu: "expenses.evidence_attach";
  voidMenu?: "expenses.evidence_void";
  notFound(): UserFacingError;
};

const EXPENSE_RETURNED_STATUSES = new Set(["rejected", "withdrawn"]);
const EXPENSE_IN_REVIEW_STATUSES = new Set(["submitted", "in_review"]);

async function expenseState(viewer: Viewer, ownerId: string, tx?: DbOrTx): Promise<OwnerState | null> {
  const row = tx ? await lockExpenseForUpdate(viewer, ownerId, tx) : await findExpenseById(viewer, ownerId);
  if (!row) return null;
  const project = row.projectId ? await findProjectById(viewer, row.projectId, tx) : null;
  const instance = row.number === null ? null : await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id }, tx);
  return {
    id: row.id,
    drafterId: row.drafterId,
    number: row.number,
    status: instance?.status ?? null,
    updatedAt: row.updatedAt,
    version: row.version,
    projectId: row.projectId,
    instance: instance ? { id: instance.id, version: instance.version } : null,
    closed: row.closedAt !== null,
    projectCompleted: project?.status === "completed",
  };
}

const expenseDrafterRemoves = (owner: OwnerState) =>
  !owner.closed && ((owner.number === null && owner.status === null) || (owner.status !== null && EXPENSE_RETURNED_STATUSES.has(owner.status)));

// 승인 문서 — 확인 기록 해제 + 문서 version. 결재 중 `add` — 06.1 자동 확인만 푼다(파일이 더해지면 조건 「파일 0」이 깨진다, 06.1-12 N-1).
// 작성 중 · 결재 중 · 반려 · 회수는 문서 version을 올리지 않는다(X-1 — 결재 중 인스턴스 version은 업로드 tx가 올린다). 승인 문서의 확인 기록 줄은 있을 때만 지우고,
// 문서 version은 기록 유무와 상관없이 올린다 — 보지 않은 증빙은 옛 version으로 확인되지 않는다(B-1). 훅 안에서 권한 · 설정을 읽지 않는다.
// 무효로 살아 있는 파일이 0이 되면 지급 여부와 상관없이 증빙일을 지운다(EVID-04 · 검토 I-1).
async function expenseApprovedEvidenceChange(viewer: Viewer, owner: OwnerState, change: { kind: "add" | "void" }, tx: DbOrTx): Promise<EvidenceReviewStatus | null> {
  // 결재 중 확인 기록은 06.1 자동 확인뿐이다(수동 확인 · 면제는 승인 뒤에만 열린다) — 상태를 가리지 않고 지운다. 돌려준 값은 업로드 로그 reviewReleased가 싣는다.
  if (change.kind === "add" && owner.status !== null && EXPENSE_IN_REVIEW_STATUSES.has(owner.status)) return deleteReviewByExpense(viewer, owner.id, tx);
  if (owner.status !== "approved") return null;
  const released = await deleteReviewByExpense(viewer, owner.id, tx);
  const version = await bumpExpenseVersion(viewer, { expenseId: owner.id, expectedVersion: owner.version, updatedBy: viewer.id }, tx);
  if (version === null) throw new ExpenseNotFoundError();
  if (change.kind === "void" && !(await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: owner.id }, tx))) {
    await clearEvidenceValues(viewer, owner.id, tx);
  }
  return released;
}

type RevisionOwner = NonNullable<Awaited<ReturnType<typeof revisionEvidenceOwner>>>;
type ReserveOwner = NonNullable<Awaited<ReturnType<typeof reserveEvidenceOwner>>>;

// 기안자 · 결재 흐름이 없는 주인(rights가 판정한다) — 05 칸은 쓰이지 않는 자리다.
const NO_DRAFTER_FLOW = {
  drafterAdds: () => false,
  drafterRemoves: () => false,
  inReview: () => false,
  approved: () => false,
  attachMenu: "expenses.evidence_attach",
} as const satisfies Pick<OwnerRule, "drafterAdds" | "drafterRemoves" | "inReview" | "approved" | "attachMenu">;

const OWNER_RULES: Record<string, OwnerRule> = {
  expense: {
    load: (viewer, ownerId) => expenseState(viewer, ownerId),
    lock: (viewer, ownerId, tx) => expenseState(viewer, ownerId, tx),
    canSee: (viewer, owner) => canSeeExpense(viewer, owner),
    drafterAdds: (owner) => expenseDrafterRemoves(owner) || (owner.status === "approved" && !owner.projectCompleted),
    drafterRemoves: expenseDrafterRemoves,
    inReview: (owner) => owner.status !== null && EXPENSE_IN_REVIEW_STATUSES.has(owner.status),
    approved: (owner) => owner.status === "approved",
    lockParent: (viewer, owner, tx) => (owner.projectId ? lockProjectForWrite(viewer, owner.projectId, tx) : Promise.resolve(null)),
    onApprovedEvidenceChange: expenseApprovedEvidenceChange,
    attachMenu: "expenses.evidence_attach",
    voidMenu: "expenses.evidence_void",
    notFound: () => new ExpenseNotFoundError(),
  },
  // 06-16(D-56) 차수 고객 승인 증빙 — 권리는 04 승인 표시와 같은 사실(담당 PM · projects 쓰기 · 표시 켜짐 · 완료 아님 · quote.amount). 결재 인스턴스가 없다(instance: null).
  [APPROVAL_EVIDENCE_KIND]: {
    load: (viewer, ownerId) => revisionEvidenceOwner(viewer, ownerId),
    lock: (viewer, ownerId, tx) => revisionEvidenceOwner(viewer, ownerId, tx),
    canSee: async (viewer, owner) => (await revisionEvidenceRights(viewer, owner as RevisionOwner)).read,
    rights: (viewer, owner) => revisionEvidenceRights(viewer, owner as RevisionOwner),
    writeOpen: (owner, viewerId) => revisionEvidenceWriteOpen(owner as RevisionOwner, viewerId),
    denyWrite: (viewer, owner) => denyRevisionEvidenceWrite(viewer, owner as RevisionOwner),
    ...NO_DRAFTER_FLOW,
    notFound: revisionEvidenceNotFound,
  },
  // 06-16(D-60) 리저브 줄 증빙 — 권리는 04-07 리저브 읽기 · 쓰기(pnl + reserve.amount), 보관된 줄은 읽기만.
  [RESERVE_EVIDENCE_KIND]: {
    load: (viewer, ownerId) => reserveEvidenceOwner(viewer, ownerId),
    lock: (viewer, ownerId, tx) => reserveEvidenceOwner(viewer, ownerId, tx),
    canSee: async (viewer, owner) => (await reserveEvidenceRights(viewer, owner as ReserveOwner)).read,
    rights: (viewer, owner) => reserveEvidenceRights(viewer, owner as ReserveOwner),
    writeOpen: (owner) => reserveEvidenceWriteOpen(owner as ReserveOwner),
    denyWrite: (viewer, owner) => denyReserveEvidenceWrite(viewer, owner as ReserveOwner),
    ...NO_DRAFTER_FLOW,
    notFound: reserveEvidenceNotFound,
  },
  // 06-25(EVID-01 카드 몫 · C4) 카드 전표 — 권리는 06-09 카드 사용 수정 권리 + 보관 아님, 읽기는 S8 목록 범위(보관 무관 — E-46). 결재 인스턴스가 없다(instance: null).
  // 06-11 훅(onApprovedEvidenceChange · lockParent)은 expense 줄의 선택 칸이라 이 줄에 두지 않는다 — 지출결의 행 · version · 확인 기록을 건드리지 않는다(X-2).
  [CARD_USAGE_ENTITY]: {
    load: (viewer, ownerId) => cardSlipOwner(viewer, ownerId),
    lock: (viewer, ownerId, tx) => cardSlipOwner(viewer, ownerId, tx),
    canSee: async (viewer, owner) => (await cardSlipRights(viewer, owner as CardSlipOwner)).read,
    rights: (viewer, owner) => cardSlipRights(viewer, owner as CardSlipOwner),
    writeOpen: (owner) => cardSlipWriteOpen(owner as CardSlipOwner),
    denyWrite: () => denyCardSlipWrite(),
    ...NO_DRAFTER_FLOW,
    notFound: cardSlipNotFound,
  },
};

// 더하는 사람 — 기안자(지출결의 쓰기) · 결재 중 붙이기 권한자. 권한 판정(can)은 풀 읽기라 트랜잭션 밖에서만 부른다.
// 기안자 자신은 붙이기 권한이 있어도 권한자 갈래가 아니다 — 작성자는 결재 끝난 뒤(웨이브 11 검토 m3, 사용자 지시 10/5 00:55 추천안).
type Adder = { drafter: boolean; attacher: boolean };

async function adderOf(viewer: Viewer, rule: OwnerRule, owner: OwnerState): Promise<Adder> {
  const isDrafter = owner.drafterId === viewer.id;
  return {
    drafter: isDrafter && (await can(viewer, "expenses", "write")),
    attacher: !isDrafter && (await can(viewer, rule.attachMenu, "write")),
  };
}

function addOpen(rule: OwnerRule, owner: OwnerState, adder: Adder): boolean {
  return (adder.drafter && rule.drafterAdds(owner)) || (adder.attacher && (rule.inReview(owner) || (rule.approved(owner) && owner.projectCompleted)));
}

// 결재 중 · 승인 뒤 추가만 결재자 판정에 닿는다(반려 · 회수 · 작성 중은 결재 판정이 없다 — 목록 상태 날짜도 움직이지 않는다).
function bumpsInstance(rule: OwnerRule, owner: OwnerState): owner is OwnerState & { instance: { id: string; version: number } } {
  return owner.instance !== null && (rule.inReview(owner) || rule.approved(owner));
}

const OWNER_KINDS = Object.keys(OWNER_RULES) as [string, ...string[]];

function ruleFor(ownerKind: string): OwnerRule | null {
  return Object.hasOwn(OWNER_RULES, ownerKind) ? (OWNER_RULES[ownerKind] ?? null) : null;
}

function storageOf(deps?: EvidenceDeps): ObjectStorage {
  return deps?.storage ?? getObjectStorage();
}

function toDtoSource(row: FileRow & { voidedByName: string | null }): EvidenceFileDto {
  return {
    id: row.id,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    createdAt: row.createdAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    voidedByName: row.voidedByName,
  };
}

// ── 선언 ──────────────────────────────────────────────────────────────

const requestSchema = z
  .object({
    ownerKind: z.enum(OWNER_KINDS),
    ownerId: z.string().uuid(),
    size: z.number().int(),
    contentType: z.string().min(1).max(100),
    sha256: z.string().max(64),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export type EvidenceUploadRequest = z.input<typeof requestSchema>;

export type EvidenceUploadIntent = { intentId: string; url: string; method: "PUT"; headers: Record<string, string>; expiresAt: Date };

// 트랜잭션 없이: 주인 · 보임 · 더하는 사람(기안자 · 결재 중 붙이기 권한자 — 아니면 없는 문서) · 상태 → 한도 설정 → 중복(다른 주인이면 그 문서를 볼 수 있을 때만 번호) → 검사 →
// 의도 행(키 incoming/{id} · 만료 15분) → 서명 PUT.
export async function requestEvidenceUpload(viewer: Viewer, raw: EvidenceUploadRequest, deps?: EvidenceDeps): Promise<EvidenceUploadIntent> {
  const input = requestSchema.parse(raw);
  const rule = ruleFor(input.ownerKind);
  const owner = rule ? await rule.load(viewer, input.ownerId) : null;
  if (!rule || !owner) throw rule?.notFound() ?? new ExpenseNotFoundError();
  if (rule.rights) {
    // 06-16 — rights가 있는 주인: 못 보면 없는 문서, 보지만 못 쓰면 주인 모듈의 거부.
    const rights = await rule.rights(viewer, owner);
    if (!rights.read) throw rule.notFound();
    if (!rights.write) rule.denyWrite?.(viewer, owner);
  } else {
    if (!(await rule.canSee(viewer, owner))) throw rule.notFound();
    const adder = await adderOf(viewer, rule, owner);
    if (owner.drafterId !== viewer.id && !adder.attacher) throw rule.notFound();
    if (!adder.drafter && !adder.attacher) throw new ForbiddenError("지출결의 작성 권한 없음");
    if (!addOpen(rule, owner, adder)) {
      if (owner.closed) throw new ExpenseCloseRefusedError(EXPENSE_ALREADY_CLOSED);
      if (rule.inReview(owner)) throw new EvidenceLockedError(EVIDENCE_LOCKED_IN_REVIEW);
      throw new EvidenceLockedError(rule.approved(owner) && owner.projectCompleted ? EVIDENCE_COMPLETED_PROJECT_LOCKED : EVIDENCE_ADD_DRAFTER_ONLY);
    }
  }

  const maxBytes = (await getSettingValue(EVIDENCE_MAX_SIZE_MB)) * MB;
  const duplicates: EvidenceDuplicate[] = [];
  for (const file of await findActiveBySha(viewer, input.sha256, duplicateScopeKinds(input.ownerKind))) {
    if (file.ownerKind === input.ownerKind && file.ownerId === owner.id) {
      duplicates.push({ sameOwner: true, visibleNumber: null });
      continue;
    }
    // 주인 규칙이 없는 종류(아직 등록 안 된 주인 · 카드 전표)는 번호 없는 문구로 센다.
    const otherRule = ruleFor(file.ownerKind);
    if (!otherRule) {
      duplicates.push({ sameOwner: false, visibleNumber: null });
      continue;
    }
    const other = await otherRule.load(viewer, file.ownerId);
    // 주인이 없으면(지운 작성 중 문서) 중복이 아니다. 종결 문서의 파일도 아니다 — 같은 비용을 새 지출결의로 다시 올린다(06-28 B1).
    if (!other || other.closed) continue;
    const visible = other.number !== null && (await otherRule.canSee(viewer, other));
    duplicates.push({ sameOwner: false, visibleNumber: visible ? other.number : null });
  }
  const check = checkEvidenceUpload(input, { maxBytes, duplicates });
  if (!check.ok) throw new EvidenceCheckError(check.reason);

  const storage = storageOf(deps);
  const now = deps?.now ?? new Date();
  const intentId = randomUUID();
  const objectKey = `incoming/${intentId}`;
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  await insertIntent(viewer, {
    id: intentId,
    ownerKind: input.ownerKind,
    ownerId: owner.id,
    objectKey,
    declaredSize: input.size,
    declaredContentType: input.contentType,
    declaredSha256: input.sha256,
    originalName: input.name,
    createdBy: viewer.id,
    expiresAt,
  });
  const signed = await storage.createSignedPut(objectKey, {
    contentType: input.contentType,
    maxBytes,
    sha256: input.sha256,
    expiresSec: SIGNED_PUT_EXPIRES_SEC,
  });
  return { intentId, url: signed.url, method: signed.method, headers: signed.headers, expiresAt };
}

// ── 완료 통보 ─────────────────────────────────────────────────────────

type MetadataMismatch = "size" | "content_type" | "sha256";

export async function completeEvidenceUpload(
  viewer: Viewer,
  input: { intentId: string },
  deps?: EvidenceDeps,
): Promise<Partial<EvidenceFileDto> & { id: string }> {
  const storage = storageOf(deps);
  const now = deps?.now ?? new Date();

  // 트랜잭션 전: 의도 · 메타데이터 재확인 · 옮기기 · 로그 켜짐 판정.
  const intent = UUID_SHAPE.test(input.intentId) ? await findIntentById(viewer, input.intentId) : null;
  const rule = intent ? ruleFor(intent.ownerKind) : null;
  // 내 의도가 이미 완료됐으면(응답이 유실돼 화면이 다시 부름) 그 의도가 만든 파일이 살아 있는 한 같은 파일로 성공한다(멱등).
  if (intent && rule && intent.createdBy === viewer.id && intent.completedAt !== null) {
    const done = await findAliveFileOfIntent(viewer, {
      ownerKind: intent.ownerKind,
      ownerId: intent.ownerId,
      uploadedBy: viewer.id,
      sha256: intent.declaredSha256,
      sizeBytes: intent.declaredSize,
      createdFrom: intent.createdAt,
    });
    if (done) {
      // E-46 — rights가 있는 주인 종류는 이 갈래에서도 주인을 다시 읽어 읽기 권리가 참일 때만 같은 파일을 돌려준다(권리 읽기는 트랜잭션 전).
      if (rule.rights) {
        const owner = await rule.load(viewer, intent.ownerId);
        if (!owner || !(await rule.rights(viewer, owner)).read) throw new EvidenceUploadRefusedError("restart");
      }
      return { ...(await project(viewer, toDtoSource({ ...done, voidedByName: null }), EVIDENCE_FILE_DTO_SPEC)), id: done.id };
    }
  }
  if (!intent || !rule || intent.createdBy !== viewer.id || intent.completedAt !== null || intent.expiresAt.getTime() <= now.getTime()) {
    throw new EvidenceUploadRefusedError("restart");
  }
  const metadata = await storage.getMetadata(intent.objectKey);
  if (!metadata) throw new EvidenceUploadRefusedError("restart");
  const mismatch: MetadataMismatch | null =
    metadata.size !== intent.declaredSize
      ? "size"
      : metadata.contentType !== intent.declaredContentType
        ? "content_type"
        : metadata.sha256 !== intent.declaredSha256
          ? "sha256"
          : null;
  if (mismatch) {
    log.warn("evidence.upload_metadata_mismatch", { intentId: intent.id, ownerKind: intent.ownerKind, ownerId: intent.ownerId, reason: mismatch });
    await storage.delete(intent.objectKey);
    throw new EvidenceUploadRefusedError("restart");
  }

  // 파일 id가 호출마다 새것이라 같은 의도를 두 번 완료해도 아래 보상 삭제가 먼저 붙은 객체를 지우지 않는다.
  const fileId = randomUUID();
  const objectKey = `evidence/${fileId}`;
  try {
    await storage.move(intent.objectKey, objectKey);
  } catch {
    throw new EvidenceUploadRefusedError("complete");
  }
  const gate = await loadActionLogGate();
  // 의도를 만든 뒤 문서를 볼 수 없게 됐으면(팀 · 범위 · 메뉴 보기) 붙이지 않는다(웨이브 11 검토 m2). 보임 판정도 풀 읽기라 tx 전에 —
  // 잠근 tx 안 전역 풀 읽기는 풀 소진 교착이다. 상태 · version은 tx 안에서 잠근 뒤 다시 본다.
  const before = await rule.load(viewer, intent.ownerId);
  const rights = before && rule.rights ? await rule.rights(viewer, before) : null;
  const adder = before && !rule.rights && (await rule.canSee(viewer, before)) ? await adderOf(viewer, rule, before) : null;

  let row: FileRow;
  try {
    row = await withTransaction(async (tx) => {
      // E-49 — 트랜잭션 전 읽기에서 결재 통과인 문서는 무효와 같이 프로젝트 행을 먼저 잡고(프로젝트 → 문서 → 인스턴스 → 파일) 완료 여부를 그 뒤에 읽는다.
      const approvedBefore = before !== null && rule.approved(before);
      if (approvedBefore) await rule.lockParent?.(viewer, before, tx);
      const locked = await rule.lock(viewer, intent.ownerId, tx);
      await deps?.afterLock?.();
      // 결재(승인 · 반려 · 회수)는 지출결의 행을 잡지 않는다 — 잠근 뒤 결재 상태 · version을 다시 읽고(행은 이미 잡혀 있어 기다리지
      // 않는다), 인스턴스 version 올리기는 그 version 조건으로 건다(그 사이 결재가 커밋하면 0행 → 다시 하기).
      const owner = locked ? await rule.lock(viewer, intent.ownerId, tx) : null;
      if (!owner) throw new EvidenceUploadRefusedError("restart");
      const open = rule.rights ? rights !== null && rights.write && rule.writeOpen?.(owner, viewer.id) === true : adder !== null && addOpen(rule, owner, adder);
      if (!open) throw new EvidenceUploadRefusedError("restart");
      // 잠근 사이 최종 승인이 커밋돼 결재 통과가 된 문서 — 프로젝트 행을 잡지 않았으니 거꾸로 잡지 않고 다시 하기로 거부한다(05 N-3 방향).
      if (rule.approved(owner) && !approvedBefore) throw new EvidenceUploadRefusedError("restart");
      const completed = await completeIntentIfOpen(viewer, { id: intent.id, createdBy: viewer.id, now }, tx);
      if (!completed) throw new EvidenceUploadRefusedError("restart");
      const inserted = await insertFile(
        viewer,
        {
          id: fileId,
          ownerKind: intent.ownerKind,
          ownerId: intent.ownerId,
          objectKey,
          sha256: intent.declaredSha256,
          sizeBytes: intent.declaredSize,
          contentType: intent.declaredContentType,
          originalName: intent.originalName,
          uploadedBy: viewer.id,
        },
        tx,
      );
      if (bumpsInstance(rule, owner)) {
        const bumped = await bumpInstanceVersion(
          viewer,
          { instanceId: owner.instance.id, expectedVersion: owner.instance.version, updatedBy: viewer.id, reason: "evidence" },
          tx,
        );
        if (!bumped) throw new EvidenceUploadRefusedError("restart");
      }
      const released = (await rule.onApprovedEvidenceChange?.(viewer, owner, { kind: "add" }, tx)) ?? null;
      await recordActionInTx(
        viewer,
        {
          actionType: "document_update",
          entity: "file",
          entityId: fileId,
          documentId: intent.ownerId,
          detail: { change: "evidence_add", fileId, ...(released ? { reviewReleased: released } : {}) },
        },
        tx,
        gate,
      );
      return inserted;
    });
  } catch (error) {
    // 옮긴 객체를 지운 뒤 원래 거부를 올린다 — 이 삭제가 실패하면 남은 객체는 Phase 6 F8 고아 정리 대상.
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }

  try {
    await storage.retain(objectKey);
  } catch (error) {
    log.warn("evidence.retain_failed", { fileId, reason: error instanceof Error ? error.name : "unknown" });
  }
  return { ...(await project(viewer, toDtoSource({ ...row, voidedByName: null }), EVIDENCE_FILE_DTO_SPEC)), id: row.id };
}

// ── 삭제 ──────────────────────────────────────────────────────────────

// 같은 파일을 두 탭에서 지우면 결과가 같으므로 둘째는 쓰기 · 로그 없이 성공으로 끝난다. 저장소 객체는 지우지 않는다
// (고아 정리는 Phase 6 F8 — removed_at이 그 쿼리의 재료). 떼기는 기안자만 · 작성 중 · 반려 · 회수에서만(05-09 — 반려 · 회수 뒤에는
// 결재 중 권한자가 붙인 파일도 뗀다). 결재 중 · 승인 뒤에는 잠김 한 줄로 거부한다.
export async function removeEvidence(viewer: Viewer, input: { fileId: string }, deps?: EvidenceDeps): Promise<void> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  const owner = file && rule ? await rule.load(viewer, file.ownerId) : null;
  if (!file || !rule || !owner) throw rule?.notFound() ?? new ExpenseNotFoundError();
  if (rule.rights) {
    // 06-16 — 주인 권리는 파일 행에 저장된 주인으로 서버가 다시 읽어 판정한다.
    const rights = await rule.rights(viewer, owner);
    if (!rights.read) throw rule.notFound();
    if (!rights.write) rule.denyWrite?.(viewer, owner);
  } else {
    if (owner.drafterId !== viewer.id) throw rule.notFound();
    if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  }
  if (file.removedAt !== null) return;
  if (!rule.rights && !rule.drafterRemoves(owner)) {
    if (owner.closed) throw new ExpenseCloseRefusedError(EXPENSE_ALREADY_CLOSED);
    if (rule.inReview(owner)) throw new EvidenceLockedError(EVIDENCE_LOCKED_IN_REVIEW);
    if (rule.approved(owner)) throw new EvidenceLockedError(EVIDENCE_REMOVE_LOCKED_APPROVED);
    throw new ExpenseConflictError(owner.updatedAt);
  }
  const gate = await loadActionLogGate();

  await withTransaction(async (tx) => {
    const locked = await rule.lock(viewer, file.ownerId, tx);
    await deps?.afterLock?.();
    if (!locked) throw rule.notFound();
    if (rule.rights) {
      if (rule.writeOpen?.(locked, viewer.id) !== true) rule.denyWrite?.(viewer, locked);
    } else if (!rule.drafterRemoves(locked)) throw new ExpenseConflictError(locked.updatedAt);
    const current = await findFileById(viewer, file.id, tx);
    if (!current || current.removedAt !== null) return;
    await markRemoved(viewer, { id: file.id, removedBy: viewer.id }, tx);
    await recordActionInTx(
      viewer,
      { actionType: "document_update", entity: "file", entityId: file.id, documentId: file.ownerId, detail: { change: "evidence_remove", fileId: file.id } },
      tx,
      gate,
    );
  });
}

// ── 읽기 ──────────────────────────────────────────────────────────────

// 보기 주소(서명 GET, 5분) — 주인 문서를 볼 수 없으면 null(→ 404). 주소는 저장하지 않는다.
export async function createEvidenceViewUrl(viewer: Viewer, input: { fileId: string }, deps?: EvidenceDeps): Promise<{ url: string } | null> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  if (!file || !rule || file.removedAt !== null) return null;
  const owner = await rule.load(viewer, file.ownerId);
  if (!owner || !(await rule.canSee(viewer, owner))) return null;
  return storageOf(deps).createSignedGet(file.objectKey, {
    expiresSec: VIEW_URL_EXPIRES_SEC,
    filename: file.originalName,
    disposition: DOWNLOAD_ONLY_TYPES.has(file.contentType) ? "attachment" : "inline",
  });
}

// 주인 문서를 볼 수 있는 사람에게만 — 삭제되지 않은 파일(무효 포함) 올린 순.
export async function listEvidence(viewer: Viewer, input: { ownerKind: string; ownerId: string }): Promise<Partial<EvidenceFileDto>[]> {
  const rule = ruleFor(input.ownerKind);
  if (!rule || !UUID_SHAPE.test(input.ownerId)) return [];
  const owner = await rule.load(viewer, input.ownerId);
  if (!owner || !(await rule.canSee(viewer, owner))) return [];
  const rows = await listActiveByOwner(viewer, input.ownerKind, input.ownerId);
  return projectMany(viewer, rows.map(toDtoSource), EVIDENCE_FILE_DTO_SPEC);
}

// 05-09: 파일 행 3차 규칙을 서버가 정한다(화면은 추론하지 않는다) — 하나 더 · 지울 수 있는 파일 · 무효 처리할 수 있는 파일 ·
// 결재 중 기안자 잠김 한 줄. 볼 수 없으면 전부 닫힘.
export type EvidenceActions = { canAdd: boolean; deletableFileIds: string[]; voidableFileIds: string[]; drafterLocked: boolean; completedProjectLocked: boolean };

const NO_EVIDENCE_ACTIONS: EvidenceActions = { canAdd: false, deletableFileIds: [], voidableFileIds: [], drafterLocked: false, completedProjectLocked: false };

export async function getEvidenceActions(viewer: Viewer, input: { ownerKind: string; ownerId: string }): Promise<EvidenceActions> {
  const rule = ruleFor(input.ownerKind);
  if (!rule || !UUID_SHAPE.test(input.ownerId)) return NO_EVIDENCE_ACTIONS;
  const owner = await rule.load(viewer, input.ownerId);
  if (!owner || !(await rule.canSee(viewer, owner))) return NO_EVIDENCE_ACTIONS;
  if (rule.rights) {
    // 06-16 — 쓰기 권리면 하나 더 · 모든 살아 있는 파일을 지울 수 있다(무효 처리 · 결재 잠김은 없다).
    const canWrite = (await rule.rights(viewer, owner)).write;
    const files = canWrite ? (await listActiveByOwner(viewer, input.ownerKind, owner.id)).filter((file) => file.voidedAt === null) : [];
    return { ...NO_EVIDENCE_ACTIONS, canAdd: canWrite, deletableFileIds: files.map((file) => file.id) };
  }
  const adder = await adderOf(viewer, rule, owner);
  const canAdd = addOpen(rule, owner, adder);
  const canRemove = adder.drafter && rule.drafterRemoves(owner);
  const canVoid = rule.approved(owner) && !!rule.voidMenu && (await can(viewer, rule.voidMenu, "write"));
  const live = canRemove || canVoid ? (await listActiveByOwner(viewer, input.ownerKind, owner.id)).filter((file) => file.voidedAt === null) : [];
  return {
    canAdd,
    deletableFileIds: canRemove ? live.map((file) => file.id) : [],
    voidableFileIds: canVoid ? live.map((file) => file.id) : [],
    drafterLocked: adder.drafter && !canAdd && rule.inReview(owner),
    completedProjectLocked: adder.drafter && !canAdd && !owner.closed && rule.approved(owner) && owner.projectCompleted,
  };
}

// ── 무효 처리 ─────────────────────────────────────────────────────────

// 05-09(사용자 결정 2026-09-26 PR #89): 승인된 문서의 잘못 붙은 증빙 — 행 · 저장소 객체는 그대로 두고 무효 세 칸만 쓴다. 사유는 04.1 반려
// 사유 검증 그대로, 로그에는 사유 길이만. 승인 뒤라 결재 판정이 없어 인스턴스 version은 올리지 않는다. 되돌리는 길은 없다(G3 — 같은
// 파일을 다시 올린다). 잠금: 상위 행(rule.lockParent — 지출결의는 프로젝트 행 · X-12) → 소유 문서 행(rule.lock — 지출결의는 lockExpenseForUpdate) → 파일 행(조건 UPDATE) → 확인 기록 줄(06-11 훅). 06-06 증빙 확인과 같은 순서라
// 확인 tx가 읽은 파일 묶음을 무효가 그 사이에 줄이지 못한다(06-06 검토 S-7).
export async function voidEvidence(viewer: Viewer, input: { fileId: string; reason: string }, deps?: EvidenceDeps): Promise<void> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  const owner = file && rule ? await rule.load(viewer, file.ownerId) : null;
  if (!file || !rule || !owner || file.removedAt !== null || !(await rule.canSee(viewer, owner))) throw rule?.notFound() ?? new ExpenseNotFoundError();
  if (!rule.voidMenu || !(await can(viewer, rule.voidMenu, "write"))) throw new ForbiddenError("증빙 무효 처리 권한 없음");
  if (!rule.approved(owner)) throw new UserFacingError(EVIDENCE_VOID_ONLY_APPROVED);
  const reason = validateRejectReason(input.reason);
  const gate = await loadActionLogGate();

  const already = await withTransaction(async (tx) => {
    // 잠금 순서(X-12 · 05 N-3): 프로젝트 행 → 지출결의 행 → 파일 행(조건 UPDATE) → 확인 기록 줄. 결재 통과 문서는 프로젝트가 바뀌지 않아 다시 읽지 않는다.
    await rule.lockParent?.(viewer, owner, tx);
    const locked = await rule.lock(viewer, file.ownerId, tx);
    if (!locked) throw rule.notFound();
    await deps?.afterLock?.();
    const voided = await markVoided(viewer, { id: file.id, voidedBy: viewer.id, reason, at: deps?.now }, tx);
    if (!voided) return findFileById(viewer, file.id, tx);
    const released = (await rule.onApprovedEvidenceChange?.(viewer, locked, { kind: "void" }, tx)) ?? null;
    await recordActionInTx(
      viewer,
      {
        actionType: "document_update",
        entity: "file",
        entityId: file.id,
        documentId: file.ownerId,
        detail: { change: "evidence_void", fileId: file.id, reasonLength: reason.length, ...(released ? { reviewReleased: released } : {}) },
      },
      tx,
      gate,
    );
    return null;
  });
  if (!already) return;
  if (already.voidedAt === null || already.voidedBy === null) throw rule.notFound();
  const actor = await findUserById(viewer, already.voidedBy);
  throw new UserFacingError(buildEvidenceVoidedMessage({ actorName: actor?.name ?? null, at: already.voidedAt }));
}

// ── 06-16 펼침 한 번 읽기 · 되살리기(F10) ────────────────────────────────────────────────────────────────────────

export type OwnedEvidence = { files: Partial<EvidenceFileDto>[]; actions: EvidenceActions; maxMb: number; writerName: string | null };

const NO_OWNED_EVIDENCE: OwnedEvidence = { files: [], actions: NO_EVIDENCE_ACTIONS, maxMb: 0, writerName: null };

// 펼침 섹션 한 번 읽기 — 파일 목록 · 파일 행 3차 규칙 · 올리기 한도(MB) · 읽기 전용 빈 문구의 담당 이름(차수 승인 증빙 = 담당 PM). rights가 없는 종류 · 읽을 수 없는 사람은 빈 값.
export async function getOwnedEvidence(viewer: Viewer, input: { ownerKind: string; ownerId: string }): Promise<OwnedEvidence> {
  const rule = ruleFor(input.ownerKind);
  if (!rule?.rights || !UUID_SHAPE.test(input.ownerId)) return NO_OWNED_EVIDENCE;
  const owner = await rule.load(viewer, input.ownerId);
  if (!owner || !(await rule.rights(viewer, owner)).read) return NO_OWNED_EVIDENCE;
  const [files, actions, maxMb] = await Promise.all([listEvidence(viewer, input), getEvidenceActions(viewer, input), getSettingValue(EVIDENCE_MAX_SIZE_MB)]);
  const writer = input.ownerKind === APPROVAL_EVIDENCE_KIND && owner.drafterId ? await findUserById(viewer, owner.drafterId) : null;
  return { files, actions, maxMb, writerName: writer?.name ?? null };
}

// F10 결과 줄 되살리기는 S21 · S22 두 주인만 — 카드 전표 삭제에는 `되돌리기`가 없다(06-25 must_have · U1-3).
const RESTORABLE_OWNER_KINDS: ReadonlySet<string> = new Set([APPROVAL_EVIDENCE_KIND, RESERVE_EVIDENCE_KIND]);

// 지운 파일 한 건 되살리기(SYSTEM §7-8 결과 줄 `되돌리기`) — rights가 있는 주인 종류만(expense는 결재 문서의 증빙 이력이라 되살리지 않는다).
// 같은 권리 판정(rights.write + 잠근 뒤 writeOpen). 중복 묶음의 다른 주인에 같은 파일이 살아 있으면 되살리지 않는다 — 판정은 markRestored의
// 조건 UPDATE(NOT EXISTS) 한 문장이라 조회와 UPDATE 사이 틈이 없다. 이미 살아 있으면 쓰기 · 로그 없이 끝난다.
export async function restoreEvidence(viewer: Viewer, input: { fileId: string }): Promise<void> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  if (!file || !rule?.rights || !RESTORABLE_OWNER_KINDS.has(file.ownerKind)) throw rule?.notFound() ?? new ExpenseNotFoundError();
  const owner = await rule.load(viewer, file.ownerId);
  if (!owner) throw rule.notFound();
  const rights = await rule.rights(viewer, owner);
  if (!rights.read) throw rule.notFound();
  if (!rights.write) rule.denyWrite?.(viewer, owner);
  if (file.removedAt === null) return;
  const gate = await loadActionLogGate();

  await withTransaction(async (tx) => {
    const locked = await rule.lock(viewer, file.ownerId, tx);
    if (!locked) throw rule.notFound();
    if (rule.writeOpen?.(locked, viewer.id) !== true) rule.denyWrite?.(viewer, locked);
    const restored = await markRestored(viewer, { id: file.id, scopeKinds: duplicateScopeKinds(file.ownerKind) }, tx);
    if (!restored) {
      const current = await findFileById(viewer, file.id, tx);
      if (current && current.removedAt === null) return;
      throw new EvidenceCheckError(EVIDENCE_DUPLICATE_HIDDEN);
    }
    await recordActionInTx(
      viewer,
      { actionType: "document_update", entity: "file", entityId: file.id, documentId: file.ownerId, detail: { change: "evidence_restore", fileId: file.id } },
      tx,
      gate,
    );
  });
}

// ── 06.1-06 증빙 기록 붙임(RP-4) — 05 규칙표 위 내보냄 넷 ──────────────────────────────────────────
// 06.1 증빙 기록(엑셀 한 줄)을 지출결의에 붙이고 뗄 때의 권리 · 잠금 순서 · 변경 뒤 훅. 판정은 위 05 표(OWNER_RULES.expense · adderOf ·
// addOpen · bumpsInstance · onApprovedEvidenceChange)를 그대로 부르고, 06.1 몫은 evidence.intake 갈래와 카드 R1(승인 · 지급 전) 한 줄뿐이다
// (05 함수 · 표 줄은 고치지 않는다). 구매 요청은 05 표 밖이라 domain/evidence-records/attach.ts가 직접 판정한다.

export type EvidenceOwnerState = OwnerState;
export type EvidenceOwnerPhase = "draft" | "returned" | "in_review" | "approved" | "closed" | "other";
export type EvidenceOwnerView = EvidenceOwnerState & { phase: EvidenceOwnerPhase };

const EXPENSE_RULE = OWNER_RULES.expense as OwnerRule;

function phaseOf(owner: OwnerState): EvidenceOwnerPhase {
  if (owner.closed) return "closed";
  if (owner.number === null) return "draft";
  if (EXPENSE_RULE.drafterRemoves(owner)) return "returned";
  if (EXPENSE_RULE.inReview(owner)) return "in_review";
  if (EXPENSE_RULE.approved(owner)) return "approved";
  return "other";
}

// 주인 판독 — tx가 없으면 풀 읽기 + 05 보임 판정(못 보면 없는 문서 — 문서 읽기와 같은 거부), tx가 있으면 05 rule.lock이 잠근 상태(보임은
// 부르는 쪽이 트랜잭션 전에 이미 지났다). 지금 받는 주인 종류는 지출결의 하나다.
export async function readEvidenceOwner(viewer: Viewer, input: { ownerKind: string; ownerId: string }, tx?: DbOrTx): Promise<EvidenceOwnerView> {
  if (input.ownerKind !== EXPENSE_DOCUMENT_KIND || !UUID_SHAPE.test(input.ownerId)) throw new ExpenseNotFoundError();
  const owner = tx ? await EXPENSE_RULE.lock(viewer, input.ownerId, tx) : await EXPENSE_RULE.load(viewer, input.ownerId);
  if (!owner) throw EXPENSE_RULE.notFound();
  if (!tx && !(await EXPENSE_RULE.canSee(viewer, owner))) throw EXPENSE_RULE.notFound();
  return { ...owner, phase: phaseOf(owner) };
}

/** 사람 플래그 — 부르는 쪽이 트랜잭션 전에 can()으로 읽는다(paid = 취소 안 된 지급 행 있음, 06.1 카드 R1). */
export type EvidenceRecordFlags = { intake: boolean; attachKey: boolean; voidKey: boolean; isDrafter: boolean; paid: boolean };
/** 잠김 줄 코드 — 글자는 app이 그린다(05 둘 + 06.1 둘, PA-LOCKCODE). */
export type EvidenceRecordLockLine = "in_review_author" | "in_review_no_detach" | "approved_void_only" | "completed_project_author";
export type EvidenceRecordRights = { attach: boolean; detach: "none" | "detach" | "void"; lockLine: EvidenceRecordLockLine | null };

const NO_RECORD_RIGHTS: EvidenceRecordRights = { attach: false, detach: "none", lockLine: null };

// UI-SPEC S7 열 줄 — S2 행 행동 · S4 막힌 행 · 문서 「증빙」 섹션 · 서버 거부가 이 함수 하나를 쓴다. 결재 중 붙이기 · 완료 프로젝트 승인 문서
// 붙이기는 05 addOpen의 붙이기 권한자 갈래 그대로(+ evidence.intake), 승인 · 지급 전 붙이기는 카드 R1(사용자 답 「지급 전까지 허용」 2026-10-16),
// 승인 뒤 떼기는 05 voidEvidence와 같은 키(expenses.evidence_void)의 무효 처리, 결재 중 떼기는 아무도(D-6110).
export function evidenceRecordRights(owner: EvidenceOwnerState, flags: EvidenceRecordFlags): EvidenceRecordRights {
  const rule = EXPENSE_RULE;
  if (owner.closed || owner.number === null) return NO_RECORD_RIGHTS;
  if (rule.drafterRemoves(owner)) return flags.intake ? { attach: true, detach: "detach", lockLine: null } : NO_RECORD_RIGHTS;
  const attacher = flags.attachKey && !flags.isDrafter;
  const adder05 = addOpen(rule, owner, { drafter: false, attacher });
  if (rule.inReview(owner)) {
    const attach = flags.intake && adder05;
    const lockLine: EvidenceRecordLockLine | null = attach ? "in_review_no_detach" : flags.isDrafter || flags.intake ? "in_review_author" : null;
    return { attach, detach: "none", lockLine };
  }
  if (rule.approved(owner)) {
    const attach = flags.intake && (adder05 || (attacher && !flags.paid));
    const detach = flags.voidKey ? "void" : "none";
    const lockLine: EvidenceRecordLockLine | null =
      flags.isDrafter && owner.projectCompleted ? "completed_project_author" : (flags.isDrafter || flags.intake) && !flags.voidKey ? "approved_void_only" : null;
    return { attach, detach, lockLine };
  }
  return NO_RECORD_RIGHTS;
}

// 붙이기 거부 글자 — 05 상수 그대로(새 거부 상수 없음). 05 requestEvidenceUpload의 갈래 차례와 같다.
export function evidenceAttachRefusal(owner: EvidenceOwnerState): string {
  if (owner.closed) return EXPENSE_ALREADY_CLOSED;
  if (EXPENSE_RULE.inReview(owner)) return EVIDENCE_LOCKED_IN_REVIEW;
  return EXPENSE_RULE.approved(owner) && owner.projectCompleted ? EVIDENCE_COMPLETED_PROJECT_LOCKED : EVIDENCE_ADD_DRAFTER_ONLY;
}

// 떼기 거부 글자 — 결재 중은 05 결재 중 잠김, 승인 뒤 무효 키 없음은 05 삭제 잠김, 그 밖은 05 작성자 갈래.
export function evidenceDetachRefusal(owner: EvidenceOwnerState): string {
  if (owner.closed) return EXPENSE_ALREADY_CLOSED;
  if (EXPENSE_RULE.inReview(owner)) return EVIDENCE_LOCKED_IN_REVIEW;
  if (EXPENSE_RULE.approved(owner)) return EVIDENCE_REMOVE_LOCKED_APPROVED;
  return EVIDENCE_ADD_DRAFTER_ONLY;
}

// 잠금 순서 — 05 completeEvidenceUpload와 같다(E-49): 사전 판독이 승인이면 프로젝트 행(lockParent) → 문서 행(rule.lock = lockExpenseForUpdate).
// 잠그는 사이 최종 승인이 커밋된 문서는 프로젝트 행을 잡지 않았으니 거꾸로 잡지 않고 다시 하기로 거부한다(05 N-3 방향). 증빙 행 잠금은 그 뒤 부르는 쪽.
export async function lockEvidenceOwnerForChange(
  viewer: Viewer,
  input: { ownerKind: string; ownerId: string; before: EvidenceOwnerState },
  tx: DbOrTx,
): Promise<EvidenceOwnerView> {
  if (input.ownerKind !== EXPENSE_DOCUMENT_KIND) throw new ExpenseNotFoundError();
  const approvedBefore = EXPENSE_RULE.approved(input.before);
  if (approvedBefore) await EXPENSE_RULE.lockParent?.(viewer, input.before, tx);
  const locked = await readEvidenceOwner(viewer, { ownerKind: input.ownerKind, ownerId: input.ownerId }, tx);
  if (EXPENSE_RULE.approved(locked) && !approvedBefore) throw new ExpenseConflictError(locked.updatedAt);
  return locked;
}

// 변경 뒤 05 훅 — 05 completeEvidenceUpload(add) · voidEvidence(void)와 같은 두 단계를 같은 트랜잭션에서. add: 결재 중 · 승인이면 결재
// 인스턴스 version(사유 evidence · 바꾼 사람 — 옛 화면 승인이 05 거부 문구로 막힌다, E25) → onApprovedEvidenceChange(승인 = 확인 기록 해제 +
// 문서 version, 결재 중 = 06.1 자동 확인만 지움 — 06.1-12 N-1). void(승인 뒤 무효 처리): onApprovedEvidenceChange만(인스턴스 version 그대로).
// 풀린 확인 기록 상태를 돌려준다(없으면 null).
export async function afterEvidenceOwnerChange(
  viewer: Viewer,
  owner: EvidenceOwnerState,
  change: { kind: "add" | "void" },
  tx: DbOrTx,
): Promise<EvidenceReviewStatus | null> {
  const rule = EXPENSE_RULE;
  if (change.kind === "add" && bumpsInstance(rule, owner)) {
    const bumped = await bumpInstanceVersion(viewer, { instanceId: owner.instance.id, expectedVersion: owner.instance.version, updatedBy: viewer.id, reason: "evidence" }, tx);
    if (!bumped) throw new ExpenseConflictError(owner.updatedAt);
  }
  return (await rule.onApprovedEvidenceChange?.(viewer, owner, change, tx)) ?? null;
}

/** 05 판정으로 셈한 문서 단계(후보 행처럼 잠그지 않고 읽은 상태용 — readEvidenceOwner와 같은 판정). */
export function evidenceOwnerPhase(owner: EvidenceOwnerState): EvidenceOwnerPhase {
  return phaseOf(owner);
}
