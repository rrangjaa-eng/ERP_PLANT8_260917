import { evidenceOwnerPhase, evidenceRecordRights, readEvidenceOwner, type EvidenceOwnerView } from "@/domain/evidence";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import { listEvidenceRecordsByIds, type EvidenceRecordView } from "@/domain/evidence-records";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, flagsOf, loadPairCodes, pairDecision, readKeys, type PairCodes, type ViewerKeys } from "@/domain/evidence-records/attach";
import { ExpenseNotFoundError } from "@/domain/expenses";
import { can } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { countPoolForScope, listPoolForScope, POOL_LIMIT, readPoolDocFacts, type PoolDocFacts, type PoolRow } from "@/repositories/evidence-pool";
import { findLivePayment } from "@/repositories/expense-payments";

// 06.1-08(RP-4 · RP-5 · E34 · D-6108): 증빙 고르기 S5의 풀. 누가 어느 문서에서 여는가(모드)는 05 규칙표 위 evidenceRecordRights 한 함수가 정하고
// (작성자 칸 authorAttach · 경영관리 칸 attach — 두 번째 표 없음), 보는 범위는 06.1-01 evidenceScopeFor → 06.1-05 scopeWhere 하나다. 순위 · 상한은
// repositories/evidence-pool.ts SQL이 하고 여기서 다시 정렬하지 않는다. 모드가 none이면 못 보는 문서와 같은 거부(404 꼴 — 정보 누설 금지).

export type EvidencePickerMode = "registrar" | "author" | "none";
export type PoolOwner = { kind: "expense" | "purchase_request"; id: string };

const CARD_FORMATS: readonly string[] = EVIDENCE_FORMATS.filter((rule) => rule.keyKind === "card").map((rule) => rule.key);
const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";

function notFound(owner: PoolOwner): UserFacingError {
  return owner.kind === "expense" ? new ExpenseNotFoundError() : new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
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

export async function evidencePickerMode(viewer: Viewer, owner: PoolOwner): Promise<{ mode: EvidencePickerMode }> {
  if (owner.kind !== "expense") return { mode: "none" };
  return { mode: (await expenseMode(viewer, await readKeys(viewer), owner.id)).mode };
}

type PoolContext = { mode: Exclude<EvidencePickerMode, "none">; doc: PoolDocFacts; allowedTypes: readonly string[] | null; codes: PairCodes | null; phase: EvidenceOwnerView["phase"] | null };

// 짝 설정 → 이 문서 지급 방식에 허용되는 증빙 종류(짝 설정이 그 방식에 하나도 없거나 지급 방식이 아직 없으면 null = 검사 없음 — PA-PAIRROW).
function allowedTypesOf(codes: PairCodes, paymentMethod: string | null): readonly string[] | null {
  if (paymentMethod === null) return null;
  const ofMethod = codes.pairs.filter((pair) => pair.method === paymentMethod);
  return ofMethod.length === 0 ? null : ofMethod.map((pair) => pair.evidence);
}

async function contextOf(viewer: Viewer, owner: PoolOwner): Promise<PoolContext> {
  const keys = await readKeys(viewer);
  if (owner.kind !== "expense") throw notFound(owner);
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

function itemOf(view: EvidenceRecordView, row: PoolRow, ctx: PoolContext): EvidencePoolItemDto {
  const pair = ctx.codes && ctx.doc.kind === "expense" ? pairDecision(ctx.codes, ctx.doc.paymentMethod, row.evidenceType) : { allowed: true as const };
  return {
    id: row.id,
    number: (view.issuedOn ?? row.issuedOn).slice(5),
    title: view.counterparty ?? "—",
    subtitle: [view.typeLabel, view.visibilityLabel].filter((part): part is string => !!part).join(" · "),
    amountKrw: row.totalKrw,
    selectable: pair.allowed,
    reason: pair.allowed ? null : pair.reason,
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

/** 이 문서에 붙일 수 있는 후보 수(DB-16) — 막힌 행(짝 아님) 제외. 모드가 none이면 0. */
export async function countEvidencePool(viewer: Viewer, owner: PoolOwner): Promise<number> {
  if (owner.kind !== "expense") return 0;
  const keys = await readKeys(viewer);
  const resolved = await expenseMode(viewer, keys, owner.id);
  if (resolved.mode === "none") return 0;
  const doc = await readPoolDocFacts(viewer, owner);
  if (!doc) return 0;
  const codes = await loadPairCodes(viewer);
  return countPoolForScope(viewer, await evidenceScopeFor(viewer), {
    author: resolved.mode === "author",
    cardFormats: CARD_FORMATS,
    allowedTypes: allowedTypesOf(codes, doc.paymentMethod),
  });
}
