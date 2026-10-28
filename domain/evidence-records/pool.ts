import { evidenceOwnerPhase, evidenceRecordRights, readEvidenceOwner, type EvidenceOwnerView } from "@/domain/evidence";
import { EVIDENCE_FORMATS, formatDateIsUsage } from "@/domain/evidence-import/registry";
import { listEvidenceRecordsByIds, type EvidenceRecordView } from "@/domain/evidence-records";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, authorCardBlock, flagsOf, loadPairCodes, pairDecision, readCardUsageRights, readKeys, type PairCodes, type ViewerKeys } from "@/domain/evidence-records/attach";
import { fileWinsPatch, overwriteBlockReason, usedOnGapOf, type FileWinsPatch } from "@/domain/evidence-records/reconcile";
import { cardOverwriteTotal, cardSlipNotFound, cardUsageOverwriteBlocksByGroup, loadCardOverwriteBasis } from "@/domain/corp-card-usages";
import { codeLabelsOf, ExpenseNotFoundError } from "@/domain/expenses";
import { purchaseRequestAuthorOpen, readPurchaseRequestEvidenceFacts } from "@/domain/purchase-requests";
import { can } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { countPoolForScope, listPoolForScope, POOL_LIMIT, readPoolDocFacts, cardHitFilter, sameCardFilter, type PoolDocFacts, type PoolQuery, type PoolRow } from "@/repositories/evidence-pool";
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

// 카드 사용 풀 — 작성자는 같은 카드 줄(합계 다른 줄은 막힌 행 · DB-8), 경영관리는 서버 붙이기가 받는 S4 후보 조건 줄만(검토 P2-3 — planCardAttach).
function cardPoolFilter(viewer: Viewer, mode: Exclude<EvidencePickerMode, "none">, usage: CardUsageForWrite): SQL {
  if (mode === "author") return sameCardFilter(viewer, usage.corpCardId);
  return cardHitFilter(viewer, usage.corpCardId, { approvalNo: usage.approvalNo, usedOn: usage.usedOn, totalKrw: usage.totalAmountKrw });
}

async function contextOf(viewer: Viewer, owner: PoolOwner): Promise<PoolContext> {
  if (owner.kind === "corp_card_usage") {
    const { mode, usage } = await cardMode(viewer, owner.id);
    if (mode === "none" || !usage) throw notFound(owner);
    const doc: PoolDocFacts = { kind: "corp_card_usage", evidenceType: null, businessNo: null, amountKrw: usage.totalAmountKrw, date: usage.usedOn, paymentMethod: null };
    return { mode, doc, allowedTypes: null, codes: null, phase: null, card: { usage, filter: cardPoolFilter(viewer, mode, usage) } };
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
  /** 07.1-09(C-92): 검색어 없는 추천이 0일 때의 빈 목록 한 줄 `{종류} 증빙이 없습니다`(문서 증빙 종류가 있을 때만 — 그 밖은 null). */
  emptyDefault: string | null;
};

// 카드 사용 작성자 모드 — 합계(카드는 같은 카드 줄만이라 늘 같다)가 다른 줄은 막힌 행(DB-8). 경영관리 모드는 고를 수 있다(D-6111 덮기) —
// 단 서버 붙이기(planCardAttach)가 거부하는 줄(31일 넘는 날짜 차 · 덮기 막힘)은 S4 후보(judgeCardCandidates)와 같은 글자로 막힌 행(PR #305 검토 P2).
function cardBlockOf(row: PoolRow, ctx: PoolContext, registrarBlocks: ReadonlyMap<string, string>): string | null {
  if (!ctx.card) return null;
  if (ctx.mode === "registrar") return registrarBlocks.get(row.id) ?? null;
  const { usage } = ctx.card;
  return authorCardBlock(
    fileWinsPatch({ totalKrw: usage.totalAmountKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4 }, { totalKrw: row.totalKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4, approvalNo: null }),
  );
}

// 경영관리 S5 덮기 patch — 풀은 같은 카드 줄만(cardHitFilter)이라 카드 칸은 늘 같다. 사용일은 날짜 칸이 사용(승인)일인 서식만 덮는다(PR #305 검토 P1).
function registrarPatchOf(row: PoolRow, usage: CardUsageForWrite): FileWinsPatch {
  return fileWinsPatch(
    { totalKrw: usage.totalAmountKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4, usedOn: usage.usedOn, approvalNo: usage.approvalNo },
    { totalKrw: row.totalKrw, corpCardId: usage.corpCardId, cardLast4: usage.cardLast4, approvalNo: null, usedOn: formatDateIsUsage(row.format) ? row.issuedOn : undefined },
  );
}

// 줄마다 따로 판정(줄 하나를 고른다) · 재료 읽기는 한 번(cardUsageOverwriteBlocksByGroup — 07.1-04 PE6). 트랜잭션 밖.
async function registrarCardBlocks(viewer: Viewer, rows: readonly PoolRow[], ctx: PoolContext): Promise<Map<string, string>> {
  const blocked = new Map<string, string>();
  if (!ctx.card || ctx.mode !== "registrar") return blocked;
  const { usage } = ctx.card;
  const changing: { row: PoolRow; patch: FileWinsPatch }[] = [];
  for (const row of rows) {
    const gap = usedOnGapOf(usage.usedOn, row.issuedOn);
    if (gap) {
      blocked.set(row.id, gap);
      continue;
    }
    const patch = registrarPatchOf(row, usage);
    if (patch.total || patch.usedOn) changing.push({ row, patch });
  }
  if (changing.length === 0) return blocked;
  const basis = await loadCardOverwriteBasis(viewer, [...new Set([usage.usedOn, ...changing.map(({ row }) => row.issuedOn)])]);
  const groups = await cardUsageOverwriteBlocksByGroup(
    viewer,
    // PR #305 재검토: 날짜만 옮기는 원화 건도 붙이기(planCardAttach)와 같은 합계로 실행가를 본다.
    changing.map(({ patch }) => [
      { usageId: usage.id, totalKrw: cardOverwriteTotal(basis, usage, { totalKrw: patch.total?.after ?? null, usedOn: patch.usedOn?.after ?? null }), corpCardId: null, usedOn: patch.usedOn?.after ?? null },
    ]),
    basis,
  );
  changing.forEach(({ row, patch }, index) => {
    const block = groups[index]?.get(usage.id);
    const reason = block ? overwriteBlockReason(patch, block) : null;
    if (reason) blocked.set(row.id, reason);
  });
  return blocked;
}

// 07.1-09(C-92): 검색 결과에서 문서 증빙 종류와 다른 줄은 제목 앞에 종류를 붙여 왜 나왔는지 글자로 보인다(`{종류} · {거래처}`) — 종류는 부제에서 뺀다.
function itemOf(view: EvidenceRecordView, row: PoolRow, ctx: PoolContext, registrarBlocks: ReadonlyMap<string, string>, searching: boolean): EvidencePoolItemDto {
  const otherKind = searching && ctx.doc.evidenceType !== null && row.evidenceType !== ctx.doc.evidenceType && !!view.typeLabel;
  const cardBlock = cardBlockOf(row, ctx, registrarBlocks);
  const registrarPatch = ctx.card && ctx.mode === "registrar" ? registrarPatchOf(row, ctx.card.usage) : null;
  const pair = cardBlock ? { allowed: false as const, reason: cardBlock } : ctx.codes && ctx.doc.kind === "expense" ? pairDecision(ctx.codes, ctx.doc.paymentMethod, row.evidenceType) : { allowed: true as const };
  return {
    id: row.id,
    number: (view.issuedOn ?? row.issuedOn).slice(5),
    title: otherKind ? `${view.typeLabel} · ${view.counterparty ?? "—"}` : (view.counterparty ?? "—"),
    subtitle: [otherKind ? null : view.typeLabel, view.visibilityLabel].filter((part): part is string => !!part).join(" · "),
    amountKrw: row.totalKrw,
    selectable: pair.allowed,
    reason: pair.allowed ? null : pair.reason,
    // PR #305 검토 P2: 사용일만 옮기는 줄도 카드 사용 값을 바꾼다(S4 patchChangesValues와 같은 판정 — 카드 칸은 같은 카드 풀이라 늘 같다).
    changesCardUsage: registrarPatch !== null && (registrarPatch.total !== null || registrarPatch.usedOn !== null),
  };
}

export async function listEvidencePool(viewer: Viewer, input: { owner: PoolOwner; q?: string | null }): Promise<EvidencePool> {
  const ctx = await contextOf(viewer, input.owner);
  const scope = await evidenceScopeFor(viewer);
  const q = input.q?.trim() ? input.q.trim().slice(0, 100) : null;
  const rows = await listPoolForScope(viewer, scope, {
    doc: ctx.doc,
    q,
    author: ctx.mode === "author",
    cardFormats: CARD_FORMATS,
    allowedTypes: ctx.allowedTypes,
    ownerFilter: ctx.card?.filter ?? null,
  });
  const kept = rows.slice(0, POOL_LIMIT);
  const views = new Map((await listEvidenceRecordsByIds(viewer, kept.map((row) => row.id))).flatMap((view) => (view.id ? [[view.id, view] as const] : [])));
  const registrarBlocks = await registrarCardBlocks(viewer, kept, ctx);
  // 범위가 같은 두 질의 사이에 공개 범위가 바뀐 줄은 보기에서 빠진다(없는 것으로) — 목록은 그 줄을 뺀다.
  const dtos = kept.flatMap((row) => {
    const view = views.get(row.id);
    return view ? [itemOf(view, row, ctx, registrarBlocks, q !== null)] : [];
  });
  const first = dtos[0];
  const registrarInReview = ctx.mode === "registrar" && ctx.phase === "in_review";
  const docTypeLabel = q === null && dtos.length === 0 && ctx.doc.evidenceType !== null ? ((await codeLabelsOf(viewer, "evidence_type")).get(ctx.doc.evidenceType) ?? null) : null;
  return {
    mode: ctx.mode,
    items: await projectMany(viewer, dtos, EVIDENCE_POOL_ITEM_DTO_SPEC),
    preselect: first && first.selectable && !registrarInReview ? [first.id] : [],
    cap: ATTACH_BATCH_MAX,
    capLine: ATTACH_BATCH_CAP_LINE,
    truncated: rows.length > POOL_LIMIT,
    limit: POOL_LIMIT,
    emptyDefault: docTypeLabel === null ? null : `${docTypeLabel} 증빙이 없습니다`,
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
    const ownerFilter = mode === "author" ? sameCardFilter(viewer, usage.corpCardId, usage.totalAmountKrw) : cardPoolFilter(viewer, mode, usage);
    return countPoolForScope(viewer, await evidenceScopeFor(viewer), { author: mode === "author", cardFormats: CARD_FORMATS, allowedTypes: null, ownerFilter, docEvidenceType: null });
  }
  if (owner.kind === "purchase_request") {
    if (owner.id !== undefined && (await requestMode(viewer, owner.id)) !== "author") return 0;
    if (owner.id === undefined && !(await can(viewer, "evidence", "view"))) return 0;
    return countPoolForScope(viewer, await evidenceScopeFor(viewer), { author: true, cardFormats: CARD_FORMATS, allowedTypes: null, docEvidenceType: null });
  }
  if (owner.id === undefined) return 0;
  const counted = await expenseCountInput(viewer, owner.id);
  if (!counted) return 0;
  return countPoolForScope(viewer, await evidenceScopeFor(viewer), { ...counted.query, docEvidenceType: null });
}

// 지출결의 건수의 앞 단계(모드 · 문서 사실 · 짝 코드) 한 벌 — 트리거 판정(countEvidencePool)과 부제 건수(countRecommendedEvidence)가 같이 쓴다(같은 판정 두 벌 금지).
async function expenseCountInput(viewer: Viewer, id: string): Promise<{ mode: Exclude<EvidencePickerMode, "none">; query: Pick<PoolQuery, "author" | "cardFormats" | "allowedTypes">; doc: PoolDocFacts } | null> {
  const keys = await readKeys(viewer);
  const resolved = await expenseMode(viewer, keys, id);
  if (resolved.mode === "none") return null;
  const doc = await readPoolDocFacts(viewer, { kind: "expense", id });
  if (!doc) return null;
  const codes = await loadPairCodes(viewer);
  return { mode: resolved.mode, query: { author: resolved.mode === "author", cardFormats: CARD_FORMATS, allowedTypes: allowedTypesOf(codes, doc.paymentMethod) }, doc };
}

/**
 * 07.1-09(D-7124 · E-P2-28 · #320 B-1): 증빙 고르기의 두 수를 한 번에 — `count`는 트리거 글자 `증빙 고르기 {N}`의 N(검색어 없는 추천 목록과 같은 거름:
 * 문서 증빙 종류와 같은 종류 · 문서 종류가 비면 전부 · 붙일 수 있는 상태 · 범위 · 짝 막힌 행 제외), `total`은 트리거를 보일지 정하는 모든 종류 후보 수(`countEvidencePool`과 같은 값).
 * 추천이 0이어도 다른 종류가 있으면(total ≥ 1) 트리거가 남아 검색으로 닿는다. `typeLabel`은 문서 증빙 종류의 기존 라벨(없으면 null), `mode`는 고르기 모드(못 열면 none · 0 · 0).
 */
export async function countRecommendedEvidence(
  viewer: Viewer,
  expenseId: string,
): Promise<{ count: number; total: number; typeLabel: string | null; mode: EvidencePickerMode }> {
  const counted = await expenseCountInput(viewer, expenseId);
  if (!counted) return { count: 0, total: 0, typeLabel: null, mode: "none" };
  const scope = await evidenceScopeFor(viewer);
  const [count, total, labels] = await Promise.all([
    countPoolForScope(viewer, scope, { ...counted.query, docEvidenceType: counted.doc.evidenceType }),
    countPoolForScope(viewer, scope, { ...counted.query, docEvidenceType: null }),
    counted.doc.evidenceType === null ? null : codeLabelsOf(viewer, "evidence_type"),
  ]);
  return { count, total, typeLabel: labels?.get(counted.doc.evidenceType ?? "") ?? null, mode: counted.mode };
}
