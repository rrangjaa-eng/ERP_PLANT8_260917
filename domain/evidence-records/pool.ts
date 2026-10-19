import { evidenceOwnerPhase, evidenceRecordRights, readEvidenceOwner, type EvidenceOwnerView } from "@/domain/evidence";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import { listEvidenceRecordsByIds, type EvidenceRecordView } from "@/domain/evidence-records";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, authorCardBlock, flagsOf, loadPairCodes, pairDecision, readCardUsageRights, readKeys, type PairCodes, type ViewerKeys } from "@/domain/evidence-records/attach";
import { fileWinsPatch } from "@/domain/evidence-records/reconcile";
import { cardSlipNotFound } from "@/domain/corp-card-usages";
import { ExpenseNotFoundError } from "@/domain/expenses";
import { purchaseRequestAuthorOpen, readPurchaseRequestEvidenceFacts } from "@/domain/purchase-requests";
import { can } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { countPoolForScope, listPoolForScope, POOL_LIMIT, readPoolDocFacts, sameCardFilter, type PoolDocFacts, type PoolRow } from "@/repositories/evidence-pool";
import type { CardUsageForWrite } from "@/repositories/corp-card-usages";
import type { SQL } from "drizzle-orm";
import { findLivePayment } from "@/repositories/expense-payments";

// 06.1-08(RP-4 · RP-5 · E34 · D-6108): 증빙 고르기 S5의 풀. 누가 어느 문서에서 여는가(모드)는 05 규칙표 위 evidenceRecordRights 한 함수가 정하고
// (작성자 칸 authorAttach · 경영관리 칸 attach — 두 번째 표 없음), 보는 범위는 06.1-01 evidenceScopeFor → 06.1-05 scopeWhere 하나다. 순위 · 상한은
// repositories/evidence-pool.ts SQL이 하고 여기서 다시 정렬하지 않는다. 모드가 none이면 못 보는 문서와 같은 거부(404 꼴 — 정보 누설 금지).

export type EvidencePickerMode = "registrar" | "author" | "none";
export type PoolOwner = { kind: "expense" | "purchase_request"; id: string } | { kind: "corp_card_usage"; id: string };

const CARD_FORMATS: readonly string[] = EVIDENCE_FORMATS.filter((rule) => rule.keyKind === "card").map((rule) => rule.key);
const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";

function notFound(owner: PoolOwner): UserFacingError {
  if (owner.kind === "corp_card_usage") return cardSlipNotFound();
  return owner.kind === "expense" ? new ExpenseNotFoundError() : new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
}

// 06.1-09 카드 사용(PA-CUAUTH · E23 · DB-8): 모드는 attach.ts cardUsageRecordRights 하나 — registrar = 경영관리, author = 등록한 사람(구매에서 생긴 건 · 완료
// 프로젝트 줄 제외), 그 밖 none(못 보는 카드 사용과 같은 거부). 풀은 그 카드 사용의 카드와 같은 카드 줄만이다(작성자 · 경영관리 S5 모두 — 다른 카드 덮기는 S4).
type CardMode = { mode: EvidencePickerMode; usage: CardUsageForWrite | null };

async function cardMode(viewer: Viewer, id: string): Promise<CardMode> {
  const read = await readCardUsageRights(viewer, id);
  if (!read || read.usage.archivedAt !== null) return { mode: "none", usage: null };
  if (read.rights.attach) return { mode: "registrar", usage: read.usage };
  return { mode: read.rights.authorAttach ? "author" : "none", usage: read.usage };
}

type ExpenseMode = { mode: EvidencePickerMode; owner: EvidenceOwnerView | null };

// 트랜잭션 밖. 지출결의 — 05 보임 판정(못 보면 없는 문서) → 사람 플래그 → 권리표. registrar = evidence.intake ∧ attach, author = evidence 보기 ∧ authorAttach.
async function expenseMode(viewer: Viewer, keys: ViewerKeys, id: string): Promise<ExpenseMode> {
  let owner: EvidenceOwnerView;
  try {
    owner = await readEvidenceOwner(viewer, { ownerKind: "expense", ownerId: id });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) return { mode: "none", owner: null };
    throw error;
  }
  const paid = (await findLivePayment(viewer, owner.id)) !== null;
  const rights = evidenceRecordRights(owner, flagsOf(viewer, keys, owner, paid));
  if (keys.intake && rights.attach) return { mode: "registrar", owner };
  if (rights.authorAttach && (await can(viewer, "evidence", "view"))) return { mode: "author", owner };
  return { mode: "none", owner };
}

// 구매 요청 — 작성자 갈래만: 증빙 보기 ∧ 내 요청 · 취소 아님 · 완료 프로젝트 줄 아님 · 붙은 증빙 0(상태 무관 — E30 · PA-PRDONE).
async function requestMode(viewer: Viewer, id: string): Promise<EvidencePickerMode> {
  if (!(await can(viewer, "evidence", "view"))) return "none";
  const facts = await readPurchaseRequestEvidenceFacts(viewer, id);
  return facts && purchaseRequestAuthorOpen(facts, viewer.id) ? "author" : "none";
}

export async function evidencePickerMode(viewer: Viewer, owner: PoolOwner): Promise<{ mode: EvidencePickerMode }> {
  if (owner.kind === "corp_card_usage") return { mode: (await cardMode(viewer, owner.id)).mode };
  if (owner.kind === "purchase_request") return { mode: await requestMode(viewer, owner.id) };
  return { mode: (await expenseMode(viewer, await readKeys(viewer), owner.id)).mode };
}

type PoolContext = {
  mode: Exclude<EvidencePickerMode, "none">;
  doc: PoolDocFacts;
  allowedTypes: readonly string[] | null;
  codes: PairCodes | null;
  phase: EvidenceOwnerView["phase"] | null;
  card?: { usage: CardUsageForWrite; filter: SQL };
};

// 짝 설정 → 이 문서 지급 방식에 허용되는 증빙 종류(짝 설정이 그 방식에 하나도 없거나 지급 방식이 아직 없으면 null = 검사 없음 — PA-PAIRROW).
function allowedTypesOf(codes: PairCodes, paymentMethod: string | null): readonly string[] | null {
  if (paymentMethod === null) return null;
  const ofMethod = codes.pairs.filter((pair) => pair.method === paymentMethod);
  return ofMethod.length === 0 ? null : ofMethod.map((pair) => pair.evidence);
}

async function contextOf(viewer: Viewer, owner: PoolOwner): Promise<PoolContext> {
  if (owner.kind === "corp_card_usage") {
    const { mode, usage } = await cardMode(viewer, owner.id);
    if (mode === "none" || !usage) throw notFound(owner);
    const doc: PoolDocFacts = { kind: "corp_card_usage", evidenceType: null, businessNo: null, amountKrw: usage.totalAmountKrw, date: usage.usedOn, paymentMethod: null };
    return { mode, doc, allowedTypes: null, codes: null, phase: null, card: { usage, filter: sameCardFilter(viewer, usage.corpCardId) } };
  }
  if (owner.kind === "purchase_request") {
    if ((await requestMode(viewer, owner.id)) !== "author") throw notFound(owner);
    const doc = await readPoolDocFacts(viewer, owner);
    if (!doc) throw notFound(owner);
    return { mode: "author", doc, allowedTypes: null, codes: null, phase: null };
  }
  const keys = await readKeys(viewer);
  const resolved = await expenseMode(viewer, keys, owner.id);
  if (resolved.mode === "none") throw notFound(owner);
  const doc = await readPoolDocFacts(viewer, owner);
  if (!doc) throw notFound(owner);
  const codes = await loadPairCodes(viewer);
  return { mode: resolved.mode, doc, allowedTypes: allowedTypesOf(codes, doc.paymentMethod), codes, phase: resolved.owner ? evidenceOwnerPhase(resolved.owner) : null };
}

export type EvidencePoolItemDto = {
  id: string;
  /** 번호 칸 `{MM-DD}`. */
  number: string;
  /** 거래처. */
  title: string;
  /** `{종류} · {공개 범위}`. */
  subtitle: string;
  amountKrw: number;
  selectable: boolean;
  reason: string | null;
  /** 06.1-09 D-6111: 경영관리가 카드 사용 S5에서 고르면 카드 사용 합계가 파일 값으로 바뀌는 줄. 그 밖은 거짓. */
  changesCardUsage: boolean;
};

// 합계만 증빙 금액 항목, 나머지는 증빙 내용 항목(06.1-05 EvidenceRecordDto와 같은 가름).
export const EVIDENCE_POOL_ITEM_DTO_SPEC: DtoSpec<EvidencePoolItemDto, EvidencePoolItemDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "evidence.value" },
    { key: "number", from: "number", infoItem: "evidence.value" },
    { key: "title", from: "title", infoItem: "evidence.value" },
    { key: "subtitle", from: "subtitle", infoItem: "evidence.value" },
    { key: "amountKrw", from: "amountKrw", infoItem: "evidence.amount" },
    { key: "selectable", from: "selectable", infoItem: "evidence.value" },
    { key: "reason", from: "reason", infoItem: "evidence.value" },
    { key: "changesCardUsage", from: "changesCardUsage", infoItem: "evidence.value" },
  ],
};

registerDto({ name: "EvidencePoolItemDto", fields: EVIDENCE_POOL_ITEM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type EvidencePool = {
  mode: Exclude<EvidencePickerMode, "none">;
  items: Partial<EvidencePoolItemDto>[];
  /** 서버가 정한 1위(고를 수 있을 때만 · 경영관리가 결재 중 문서에서 열면 비움 — DB-5). */
  preselect: string[];
  cap: number;
  capLine: string;
  /** 21째 행이 있다. */
  truncated: boolean;
  limit: number;
};

// 카드 사용 작성자 모드 — 합계(카드는 같은 카드 줄만이라 늘 같다)가 다른 줄은 막힌 행(DB-8). 경영관리 모드는 고를 수 있다(D-6111 덮기).
function cardBlockOf(row: PoolRow, ctx: PoolContext): string | null {
  if (!ctx.card || ctx.mode !== "author") return null;
  const { usage } = ctx.card;
  return authorCardBlock(
    fileWinsPatch({ totalKrw: usage.totalAmountKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4 }, { totalKrw: row.totalKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4, approvalNo: null }),
  );
}

function itemOf(view: EvidenceRecordView, row: PoolRow, ctx: PoolContext): EvidencePoolItemDto {
  const cardBlock = cardBlockOf(row, ctx);
  const pair = cardBlock ? { allowed: false as const, reason: cardBlock } : ctx.codes && ctx.doc.kind === "expense" ? pairDecision(ctx.codes, ctx.doc.paymentMethod, row.evidenceType) : { allowed: true as const };
  return {
    id: row.id,
    number: (view.issuedOn ?? row.issuedOn).slice(5),
    title: view.counterparty ?? "—",
    subtitle: [view.typeLabel, view.visibilityLabel].filter((part): part is string => !!part).join(" · "),
    amountKrw: row.totalKrw,
    selectable: pair.allowed,
    reason: pair.allowed ? null : pair.reason,
    changesCardUsage: ctx.card !== undefined && ctx.mode === "registrar" && row.totalKrw !== ctx.card.usage.totalAmountKrw,
  };
}

export async function listEvidencePool(viewer: Viewer, input: { owner: PoolOwner; q?: string | null }): Promise<EvidencePool> {
  const ctx = await contextOf(viewer, input.owner);
  const scope = await evidenceScopeFor(viewer);
  const rows = await listPoolForScope(viewer, scope, {
    doc: ctx.doc,
    q: input.q?.trim() ? input.q.trim().slice(0, 100) : null,
    author: ctx.mode === "author",
    cardFormats: CARD_FORMATS,
    allowedTypes: ctx.allowedTypes,
    ownerFilter: ctx.card?.filter ?? null,
  });
  const kept = rows.slice(0, POOL_LIMIT);
  const views = new Map((await listEvidenceRecordsByIds(viewer, kept.map((row) => row.id))).flatMap((view) => (view.id ? [[view.id, view] as const] : [])));
  // 범위가 같은 두 질의 사이에 공개 범위가 바뀐 줄은 보기에서 빠진다(없는 것으로) — 목록은 그 줄을 뺀다.
  const dtos = kept.flatMap((row) => {
    const view = views.get(row.id);
    return view ? [itemOf(view, row, ctx)] : [];
  });
  const first = dtos[0];
  const registrarInReview = ctx.mode === "registrar" && ctx.phase === "in_review";
  return {
    mode: ctx.mode,
    items: await projectMany(viewer, dtos, EVIDENCE_POOL_ITEM_DTO_SPEC),
    preselect: first && first.selectable && !registrarInReview ? [first.id] : [],
    cap: ATTACH_BATCH_MAX,
    capLine: ATTACH_BATCH_CAP_LINE,
    truncated: rows.length > POOL_LIMIT,
    limit: POOL_LIMIT,
  };
}

/**
 * 이 문서에 붙일 수 있는 후보 수(DB-16) — 막힌 행(짝 아님) 제외. 모드가 none이면 0. 구매 요청은 문서 무관(`id` 없이도 센다 — 목록 쪽마다 한 번, PA-POOLN):
 * 증빙 보기 권한이 없으면 0, 있으면 작성자 풀의 수(짝 판정 없음).
 */
export async function countEvidencePool(viewer: Viewer, owner: { kind: PoolOwner["kind"]; id?: string }): Promise<number> {
  if (owner.kind === "corp_card_usage") {
    if (owner.id === undefined) return 0;
    const { mode, usage } = await cardMode(viewer, owner.id);
    if (mode === "none" || !usage) return 0;
    // 작성자 모드는 막힌 행(합계 다름)을 센 수에서 뺀다(DB-16).
    const ownerFilter = sameCardFilter(viewer, usage.corpCardId, mode === "author" ? usage.totalAmountKrw : undefined);
    return countPoolForScope(viewer, await evidenceScopeFor(viewer), { author: mode === "author", cardFormats: CARD_FORMATS, allowedTypes: null, ownerFilter });
  }
  if (owner.kind === "purchase_request") {
    if (owner.id !== undefined && (await requestMode(viewer, owner.id)) !== "author") return 0;
    if (owner.id === undefined && !(await can(viewer, "evidence", "view"))) return 0;
    return countPoolForScope(viewer, await evidenceScopeFor(viewer), { author: true, cardFormats: CARD_FORMATS, allowedTypes: null });
  }
  if (owner.id === undefined) return 0;
  const keys = await readKeys(viewer);
  const resolved = await expenseMode(viewer, keys, owner.id);
  if (resolved.mode === "none") return 0;
  const doc = await readPoolDocFacts(viewer, { kind: "expense", id: owner.id });
  if (!doc) return 0;
  const codes = await loadPairCodes(viewer);
  return countPoolForScope(viewer, await evidenceScopeFor(viewer), {
    author: resolved.mode === "author",
    cardFormats: CARD_FORMATS,
    allowedTypes: allowedTypesOf(codes, doc.paymentMethod),
  });
}
