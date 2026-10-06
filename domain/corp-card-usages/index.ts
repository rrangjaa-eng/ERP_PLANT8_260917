import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import type { CardOwnerKind } from "@/domain/corp-cards";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { loadTaxRates, type TaxRates } from "@/domain/money/tax";
import { moneyToColumns, sumKrw, type MoneyInput } from "@/domain/money";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { teamAtDate } from "@/domain/org";
import { loadActorTeamScope } from "@/domain/projects/status";
import { splitCardTotal, type CardSplit } from "@/domain/corp-card-usages/amounts";
import { listCodeItems } from "@/repositories/code-tables";
import { findCorpCardById, listCorpCards, type CorpCardRow } from "@/repositories/corp-cards";
import { findUserNamesByIds } from "@/repositories/users";
import {
  insertCardUsage,
  listCardUsageRows,
  type CardUsageFilter,
  type CardUsageListRow,
  type CardUsageScope,
} from "@/repositories/corp-card-usages";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 06-05(EXP-07 · D-607 · D-608 · D-609): 법인카드 사용 — 본인 등록 · 팀 비용 연결 · 목록.
//
// 06-03 tx 규약: 생성은 두 단계다. `precheckCardUsage`(트랜잭션 밖)가 전역 풀을 읽는 판정 · 조회(카드 자격 · 사용일 소속 ·
// 증빙 종류 규칙 · 세율)를 끝내 `pre`로 넘기고, `createCardUsage`의 몸통 `runCreate`는 `pre`의 값 · 순수 함수 · tx를 받는
// 리포지토리 · 같은 tx의 `recordAction`만 부른다. 06-07 · 06-09 · 06-12 · 06-14 · 06-25 · 6.1-09가 이 서명 · 몸통 이름에 기댄다(K-2).

export const CARD_USAGE_ENTITY = "corp_card_usage";

export class CardUsageRejectedError extends UserFacingError {}

const LINK_MISSING = "연결 없음 · 연결 고르기";
const CARD_NOT_ELIGIBLE = "카드 자격 없음 · 카드 고르기";
const SHARED_CARD_FORBIDDEN = "공용 카드 등록 권한 없음 · 공용 카드는 경영관리";

export type CardUsageLinkKind = "team_cost";

export type CardUsageInput = {
  corpCardId: string;
  usedOn: string;
  merchantVendorId?: string | null;
  total: MoneyInput;
  evidenceTypeCode: string;
  linkKind: CardUsageLinkKind | null;
  memo?: string | null;
};

/** 트랜잭션 전 사실 — 평범한 객체(06-03 tx 규약). */
export type CardUsagePre = {
  card: Pick<CorpCardRow, "id" | "kind" | "holderUserId" | "teamId">;
  registeredVia: "self";
  usedByUserId: string;
  teamId: string;
  evidenceRule: TaxRule;
  rates: TaxRates;
};

// ── 카드 자격 ──────────────────────────────────────────────────────────────

function cardLabel(card: Pick<CorpCardRow, "label" | "issuer" | "numberLast4">): string {
  return `${card.label} · ${card.issuer} ${card.numberLast4}`;
}

export type UsageCardOption = { id: string; label: string; kind: CardOwnerKind };

// 카드 자격(U-2): 직원 = 활성 카드 중 소지자 본인 + 사용일 소속 팀의 카드. `cards.proxy` write면 활성 공용 카드를 더한다.
// 공용 여부는 카드 행의 `kind`로만 가른다 — 06-27 `corp_cards_owner_kind_check`가 종류와 소지자 · 팀 칸 짝을 묶는다(R-6).
// 남의 개인 · 팀 카드(대리 등록)는 06-09가 이 함수를 넓힌다. 트랜잭션 밖에서만 부른다(can · 전역 풀 조회).
async function eligibleCards(viewer: Viewer, teamId: string | null): Promise<CorpCardRow[]> {
  const cards = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const proxy = await can(viewer, "cards.proxy", "write");
  return cards.filter(
    (card) =>
      (card.kind === "shared" && proxy) ||
      (card.kind !== "shared" && (card.holderUserId === viewer.id || (teamId !== null && card.teamId === teamId))),
  );
}

export async function cardOptionsForUsage(viewer: Viewer, usedOn: string): Promise<UsageCardOption[]> {
  const team = await teamAtDate(viewer, viewer.id, usedOn);
  const cards = await eligibleCards(viewer, team?.id ?? null);
  return cards.map((card) => ({ id: card.id, label: cardLabel(card), kind: card.kind as CardOwnerKind }));
}

// ── 증빙 종류(코드표) ──────────────────────────────────────────────────────

type EvidenceTypeOption = { value: string; label: string; rule: TaxRule };

// 카드에 쓰는 증빙 종류 = 활성 · 보관 안 된 항목 중 규칙이 카드 규칙인 것.
async function cardEvidenceTypes(viewer: Viewer): Promise<{ options: EvidenceTypeOption[]; labels: Map<string, string> }> {
  const items = await listCodeItems(viewer, {
    tableKey: "evidence_type",
    scope: { rows: "all", includeArchived: true },
    includeInactive: true,
  });
  const labels = new Map(items.map((item) => [item.value, item.label]));
  const options: EvidenceTypeOption[] = [];
  for (const item of items) {
    if (!item.active || item.archivedAt) continue;
    const parsed = taxRuleSchema.safeParse(item.taxRule);
    if (!parsed.success || parsed.data.ruleKind !== "none") continue;
    options.push({ value: item.value, label: item.label, rule: parsed.data });
  }
  return { options, labels };
}

function mmdd(date: string): string {
  return date.slice(5);
}

// ── 사전 조회(트랜잭션 밖) ──────────────────────────────────────────────────

export async function precheckCardUsage(viewer: Viewer, input: CardUsageInput): Promise<CardUsagePre> {
  if (input.linkKind !== "team_cost") throw new CardUsageRejectedError(LINK_MISSING);

  const team = await teamAtDate(viewer, viewer.id, input.usedOn);
  if (!team?.id) {
    const name = (await findUserNamesByIds(viewer, [viewer.id])).get(viewer.id) ?? "";
    throw new CardUsageRejectedError(`${name} ${mmdd(input.usedOn)} 소속 없음 · 소속 발령은 관리자`);
  }

  const card = await findCorpCardById(viewer, input.corpCardId);
  const eligible = (await cardOptionsForUsage(viewer, input.usedOn)).some((candidate) => candidate.id === card?.id);
  if (!card || !eligible) throw new ForbiddenError(card?.kind === "shared" ? SHARED_CARD_FORBIDDEN : CARD_NOT_ELIGIBLE);

  const evidence = await cardEvidenceTypes(viewer);
  const option = evidence.options.find((candidate) => candidate.value === input.evidenceTypeCode);
  if (!option) {
    const label = evidence.labels.get(input.evidenceTypeCode) ?? input.evidenceTypeCode;
    throw new CardUsageRejectedError(`증빙 종류 ${label} 카드에 없음 · 증빙 종류 고르기`);
  }

  const rates = await loadTaxRates(input.usedOn);
  return {
    card: { id: card.id, kind: card.kind, holderUserId: card.holderUserId, teamId: card.teamId },
    registeredVia: "self",
    usedByUserId: viewer.id,
    teamId: team.id,
    evidenceRule: option.rule,
    rates,
  };
}

// ── 등록(단독 / 외부 tx) ───────────────────────────────────────────────────

export type CreatedCardUsage = { id: string; totalKrw: number };

export async function createCardUsage(
  viewer: Viewer,
  input: CardUsageInput,
  pre: CardUsagePre,
  tx?: DbOrTx,
): Promise<CreatedCardUsage> {
  const runCreate = async (innerTx: DbOrTx) => {
    const split = splitCardTotal({ money: input.total, rule: pre.evidenceRule }, pre.rates);
    const money = moneyToColumns(input.total);
    const row = await insertCardUsage(
      viewer,
      {
        corpCardId: pre.card.id,
        usedOn: input.usedOn,
        merchantVendorId: input.merchantVendorId ?? null,
        totalCurrency: money.currency,
        totalForeignAmount: money.foreignAmount,
        totalFxRate: money.fxRate,
        totalAmountKrw: split.totalKrw,
        supplyKrw: split.supplyKrw,
        vatKrw: split.vatKrw,
        evidenceTypeCode: input.evidenceTypeCode,
        linkKind: "team_cost",
        quoteLineId: null,
        teamId: pre.teamId,
        usedByUserId: pre.usedByUserId,
        registeredBy: viewer.id,
        registeredVia: pre.registeredVia,
        purchaseRequestId: null,
        memo: input.memo ?? null,
      },
      innerTx,
    );
    await recordAction(viewer, { actionType: "document_create", entity: CARD_USAGE_ENTITY, entityId: row.id }, { tx: innerTx });
    return { id: row.id, totalKrw: row.totalAmountKrw };
  };
  return tx ? await runCreate(tx) : await withTransaction(runCreate);
}

// ── 서버 계산 한 줄(트랜잭션 없음) ─────────────────────────────────────────

export type CardAmountsPreview = {
  /** 결제 합계 · 증빙 종류가 계산할 수 있는 값일 때만. */
  split: (CardSplit & { ruleKind: TaxRule["ruleKind"]; evidenceLabel: string }) | null;
  /** 사용일 소속 팀 — 「팀 비용」 읽기 텍스트 · 소속 없음 막힘. */
  teamName: string | null;
};

export async function previewCardAmounts(
  viewer: Viewer,
  input: { usedOn: string; total: MoneyInput | null; evidenceTypeCode: string | null },
): Promise<CardAmountsPreview> {
  const team = await teamAtDate(viewer, viewer.id, input.usedOn);
  const teamName = team?.name ?? null;
  if (!input.total || !input.evidenceTypeCode) return { split: null, teamName };
  const option = (await cardEvidenceTypes(viewer)).options.find((candidate) => candidate.value === input.evidenceTypeCode);
  if (!option) return { split: null, teamName };
  const rates = await loadTaxRates(input.usedOn);
  const split = splitCardTotal({ money: input.total, rule: option.rule }, rates);
  return { split: { ...split, ruleKind: option.rule.ruleKind, evidenceLabel: option.label }, teamName };
}

// ── 폼 선택지 ──────────────────────────────────────────────────────────────

export type CardOptionDto = { id: string; label: string };

const CARD_OPTION_SPEC: DtoSpec<CardOptionDto, CardOptionDto> = {
  fields: (["id", "label"] as const).map((key) => ({ key, from: key, infoItem: "card_usage.value" })),
};

registerDto({ name: "CardUsageCardOptionDto", fields: CARD_OPTION_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type CardUsageFormOptions = {
  cards: Partial<CardOptionDto>[];
  evidenceTypes: { value: string; label: string }[];
  teamName: string | null;
};

// 새 건 패널의 선택지 — 사용일(기본 오늘) 기준 카드 · 카드 증빙 종류 · 사용일 소속 팀 이름.
export async function cardUsageFormOptions(viewer: Viewer, usedOn: string): Promise<CardUsageFormOptions> {
  const team = await teamAtDate(viewer, viewer.id, usedOn);
  const cards = await cardOptionsForUsage(viewer, usedOn);
  const evidence = await cardEvidenceTypes(viewer);
  return {
    cards: await projectMany(viewer, cards.map((card) => ({ id: card.id, label: card.label })), CARD_OPTION_SPEC),
    evidenceTypes: evidence.options.map(({ value, label }) => ({ value, label })),
    teamName: team?.name ?? null,
  };
}

// ── 목록 ───────────────────────────────────────────────────────────────────

export type CardUsageListItemDto = {
  id: string;
  cardId: string;
  cardLabel: string;
  usedOn: string;
  merchantName: string | null;
  linkKind: string;
  teamName: string | null;
  evidenceTypeCode: string;
  registeredVia: string;
  registeredByName: string;
  memo: string | null;
  currency: string;
  foreignAmount: number | null;
  fxRate: number;
  totalKrw: number;
  supplyKrw: number;
  vatKrw: number;
};

type CardUsageListProjectable = CardUsageListItemDto;

const VALUE_KEYS = [
  "id",
  "cardId",
  "cardLabel",
  "usedOn",
  "merchantName",
  "linkKind",
  "teamName",
  "evidenceTypeCode",
  "registeredVia",
  "registeredByName",
  "memo",
] as const;
const AMOUNT_KEYS = ["currency", "foreignAmount", "fxRate", "totalKrw", "supplyKrw", "vatKrw"] as const;

export const CARD_USAGE_LIST_DTO_SPEC: DtoSpec<CardUsageListProjectable, CardUsageListItemDto> = {
  fields: [
    ...VALUE_KEYS.map((key) => ({ key, from: key, infoItem: "card_usage.value" })),
    ...AMOUNT_KEYS.map((key) => ({ key, from: key, infoItem: "card_usage.amount" })),
  ],
};

registerDto({
  name: "CardUsageListItemDto",
  fields: CARD_USAGE_LIST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function toProjectable(row: CardUsageListRow): CardUsageListProjectable {
  return {
    id: row.id,
    cardId: row.corpCardId,
    cardLabel: cardLabel({ label: row.cardLabel, issuer: row.cardIssuer, numberLast4: row.cardLast4 }),
    usedOn: row.usedOn,
    merchantName: row.merchantName,
    linkKind: row.linkKind,
    teamName: row.teamName,
    evidenceTypeCode: row.evidenceTypeCode,
    registeredVia: row.registeredVia,
    registeredByName: row.registeredByName,
    memo: row.memo,
    currency: row.totalCurrency,
    foreignAmount: row.totalForeignAmount === null ? null : Number(row.totalForeignAmount),
    fxRate: Number(row.totalFxRate),
    totalKrw: row.totalAmountKrw,
    supplyKrw: row.supplyKrw,
    vatKrw: row.vatKrw,
  };
}

export type CardUsageListFilters = { month: string };

export type CardUsageList = {
  rows: Partial<CardUsageListItemDto>[];
  totals: { count: number; totalKrw: number; supplyKrw: number } | null;
};

function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

async function listScope(viewer: Viewer, today: string): Promise<CardUsageScope> {
  const actor = await loadActorTeamScope(viewer, { todayKst: today });
  if (actor.workScope === "company") return { kind: "all" };
  return { kind: "own", userId: viewer.id, teamId: actor.teamId };
}

export async function listCardUsages(viewer: Viewer, filters: CardUsageListFilters, today: string): Promise<CardUsageList> {
  const filter: CardUsageFilter = monthRange(filters.month);
  const rows = await listCardUsageRows(viewer, { scope: await listScope(viewer, today), filter });
  const projected = await projectMany(viewer, rows.map(toProjectable), CARD_USAGE_LIST_DTO_SPEC);
  const amountsVisible = projected.every((row) => row.totalKrw !== undefined);
  return {
    rows: projected,
    totals: amountsVisible
      ? {
          count: projected.length,
          totalKrw: sumKrw(projected.map((row) => row.totalKrw ?? 0)),
          supplyKrw: sumKrw(projected.map((row) => row.supplyKrw ?? 0)),
        }
      : null,
  };
}
