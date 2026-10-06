import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import type { CardOwnerKind } from "@/domain/corp-cards";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { loadTaxRates, type TaxRates } from "@/domain/money/tax";
import { moneyToColumns, normalizeMoneyInput, sumKrw, toKrw, type MoneyInput } from "@/domain/money";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { teamAtDate } from "@/domain/org";
import { loadActorTeamScope, ProjectNotFoundError } from "@/domain/projects/status";
import { cardUsedOnError, isCardEvidenceRule, splitCardTotal, type CardSplit } from "@/domain/corp-card-usages/amounts";
import { recentFxRate } from "@/domain/money/currency";
import { seoulToday } from "@/lib/dates";
import { listCodeItems } from "@/repositories/code-tables";
import { findCorpCardById, listCorpCards, type CorpCardRow } from "@/repositories/corp-cards";
import { findUserNamesByIds } from "@/repositories/users";
import { findMembershipAtDate } from "@/repositories/team-memberships";
import { listVendorsForPick } from "@/repositories/vendors";
import { normalizeVendorName } from "@/domain/vendors";
import { vendorKindsFor } from "@/domain/vendors/kind";
import { codeLabelsOf } from "@/domain/expenses";
import { PICK_LIMIT, PICK_VENDOR_OPTION_SPEC, type PickVendorOptionDto } from "@/domain/expenses/pick";
import {
  findLastCardUsageByRegistrant,
  insertCardUsage,
  listCardUsageRows,
  listProjectCardUsageRows,
  type CardUsageFilter,
  type CardUsageLinkFilter,
  type CardUsageListRow,
  type CardUsageScope,
} from "@/repositories/corp-card-usages";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import { withTransaction } from "@/lib/db-transaction";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { CompletedProjectError } from "@/domain/projects";
import { quoteLockReason } from "@/domain/quotes/edit-scope";
import { findProjectById } from "@/repositories/projects";
import { scopeFor } from "@/domain/permissions/scope-for";
import { findQuoteLineById, listQuoteLinesByRevisions } from "@/repositories/quote-lines";
import { findLatestQuoteRevision, findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findLineLinks, lockQuoteLines } from "@/repositories/quote-line-links";
import { findVendorById, findVendorNamesByIds } from "@/repositories/vendors";
import { createOutOfQuoteLine } from "@/domain/quotes/lines";
import {
  cardLinkLineChoice,
  cardLinkProjectChoice,
  lineRoom,
  loadLineRoomBasis,
  lockProjectForLinkWrite,
  type CardLinkLineChoice,
  type CardLinkProjectChoice,
  type LineRoomBasis,
} from "@/domain/corp-card-usages/link-targets";
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
const AMOUNT_NOT_NUMBER = "숫자 아님 · 1,240,000처럼";
const AMOUNT_NOT_POSITIVE = "결제 합계 0 이하 · 금액 고치기";
const ITEM_MISSING = "항목 없음 · 항목 적기";
const MERCHANT_MISSING = "가맹점 없음 · 가맹점 고르기";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CardUsageLinkKind = "team_cost" | "quote_line";

// 06-07: 연결 판별 합 — 팀 비용(팀은 서버가 사용일 소속으로) · 견적 줄(줄 id만 — 실행가 · 공급가 칸 없음) ·
// 견적 외 비용(프로젝트 · 항목 — 저장 때 그 프로젝트 현재 차수에 out_of_quote 줄을 새로 만든다, 항목이 비면 가맹점 이름).
export type CardUsageInput = {
  corpCardId: string;
  usedOn: string;
  merchantVendorId?: string | null;
  total: MoneyInput;
  evidenceTypeCode: string;
  memo?: string | null;
} & (
  | { linkKind: "team_cost" }
  | { linkKind: null }
  | { linkKind: "quote_line"; lineId: string }
  | { linkKind: "out_of_quote"; projectId: string; itemName: string | null }
);

/** 트랜잭션 전 사실 — 평범한 객체(06-03 tx 규약). */
export type CardUsagePre = {
  card: Pick<CorpCardRow, "id" | "kind" | "holderUserId" | "teamId">;
  registeredVia: "self";
  usedByUserId: string;
  /** 팀 비용의 귀속 팀(사용일 소속) — 견적 줄 연결이면 null. */
  teamId: string | null;
  evidenceRule: TaxRule;
  rates: TaxRates;
  /** 06-07 견적 줄 연결 — 줄의 프로젝트 · 사전 조회 때의 현재 차수(잠근 뒤 다시 본다 — X-2) · 남은 실행가 바탕 · 상한 판정 제외. */
  projectId: string | null;
  revisionId: string | null;
  lineRoom: LineRoomBasis | null;
  capExclude: { usageId?: string; requestId?: string };
  /** 등록자의 견적 금액(quote.amount) 노출 — 실행가 상한 거부 문구의 남은 실행가 숫자(CSO-2). 트랜잭션 전에 읽는다. */
  amountVisible: boolean;
  /** 06-07 견적 외 비용 — 사전 조회 때의 현재 차수 · 항목. `completedOutOfQuote`는 06-09 대리 등록만 참(D-47 ③ · Q-B). */
  outOfQuote: { projectId: string; revisionId: string; itemName: string; completedOutOfQuote: boolean } | null;
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

// 사용일 소속 팀 id — 자격 · 귀속 판정은 표시 투영(`team.value`) 전 발령에서 읽는다(목록 범위 `loadActorTeamScope`와 같은 출처).
async function teamIdOn(viewer: Viewer, usedOn: string): Promise<string | null> {
  return (await findMembershipAtDate(viewer, viewer.id, usedOn))?.teamId ?? null;
}

export async function cardOptionsForUsage(viewer: Viewer, usedOn: string): Promise<UsageCardOption[]> {
  const cards = await eligibleCards(viewer, await teamIdOn(viewer, usedOn));
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
    if (!parsed.success || !isCardEvidenceRule(parsed.data)) continue;
    options.push({ value: item.value, label: item.label, rule: parsed.data });
  }
  return { options, labels };
}

function mmdd(date: string): string {
  return date.slice(5);
}

// ── 사전 조회(트랜잭션 밖) ──────────────────────────────────────────────────

export async function precheckCardUsage(viewer: Viewer, input: CardUsageInput): Promise<CardUsagePre> {
  // 사용일 상한(Q6) — 액션을 거치지 않는 호출(06-12 · 6.1)도 같은 판정. 오늘은 서버의 서울 날짜.
  const futureError = cardUsedOnError(input.usedOn, seoulToday());
  if (futureError) throw new CardUsageRejectedError(futureError);
  if (input.linkKind === null) throw new CardUsageRejectedError(LINK_MISSING);
  // 통화 · 외화 금액 · 환율 형식(O-7) — 트랜잭션 전에 거부한다(순수 판정). 원화는 정수 원 · 환산 합계는 0 초과.
  const money = normalizeMoneyInput(input.total);
  if (money.currency === "KRW" && !Number.isInteger(money.amount)) throw new CardUsageRejectedError(AMOUNT_NOT_NUMBER);
  if (toKrw(money) <= 0) throw new CardUsageRejectedError(AMOUNT_NOT_POSITIVE);

  const teamId = await teamIdOn(viewer, input.usedOn);
  if (!teamId && input.linkKind === "team_cost") {
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

  // 가맹점(CSO-5) — 고르기 목록(searchMerchantsForCard · listVendorsForPick)과 같은 조건: 있음 · 숨김 아님 · 보관 아님 · 협력사 갈래.
  if (input.merchantVendorId) {
    const merchant = UUID_SHAPE.test(input.merchantVendorId) ? await findVendorById(viewer, input.merchantVendorId) : null;
    if (!merchant || merchant.hidden || merchant.archivedAt !== null || !vendorKindsFor("supplier").includes(merchant.kind)) {
      throw new CardUsageRejectedError(MERCHANT_MISSING);
    }
  }

  const rates = await loadTaxRates(input.usedOn);
  const base = {
    card: { id: card.id, kind: card.kind, holderUserId: card.holderUserId, teamId: card.teamId },
    registeredVia: "self" as const,
    usedByUserId: viewer.id,
    evidenceRule: option.rule,
    rates,
    capExclude: {},
    amountVisible: false,
    outOfQuote: null,
  };
  if (input.linkKind === "team_cost") return { ...base, teamId, projectId: null, revisionId: null, lineRoom: null };
  // 견적 줄 · 견적 외 비용은 프로젝트를 고르는 일 — S10 목록과 같은 문(projects view)을 서버가 다시 본다(I-6).
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);

  if (input.linkKind === "out_of_quote") {
    // 견적 외 비용(O-8 · X-6): 현재 차수 · 완료 판정 · 항목 기본값은 트랜잭션 전에 — 잠근 뒤 `project.line-edit`가 상태를 다시 본다.
    const project = await findProjectById(viewer, input.projectId);
    if (!project || project.archivedAt) throw new CardUsageRejectedError(LINK_MISSING);
    if (project.status === "completed") throw new CompletedProjectError(quoteLockReason({ status: project.status }) ?? undefined);
    const latest = await findLatestQuoteRevision(viewer, project.id);
    if (!latest) throw new CardUsageRejectedError(LINK_MISSING);
    const merchantName = input.merchantVendorId
      ? ((await findVendorNamesByIds(viewer, [input.merchantVendorId])).get(input.merchantVendorId) ?? "")
      : "";
    const itemName = (input.itemName ?? "").trim() || merchantName.trim();
    if (!itemName) throw new CardUsageRejectedError(ITEM_MISSING);
    return {
      ...base,
      teamId: null,
      projectId: project.id,
      revisionId: latest.id,
      lineRoom: null,
      outOfQuote: { projectId: project.id, revisionId: latest.id, itemName, completedOutOfQuote: false },
    };
  }

  // 견적 줄(D-47 · ST-1): 완료 프로젝트는 트랜잭션 전에 거부한다 — 잠근 뒤 `lockProjectForLinkWrite`가 다시 본다(X-2).
  const line = await findQuoteLineById(viewer, input.lineId);
  const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
  const project = revision ? await findProjectById(viewer, revision.projectId) : null;
  if (!line || !project || project.archivedAt) throw new CardUsageRejectedError(LINK_MISSING);
  if (project.status === "completed") throw new CompletedProjectError(quoteLockReason({ status: project.status }) ?? undefined);
  const latest = await findLatestQuoteRevision(viewer, project.id);
  return {
    ...base,
    teamId: null,
    projectId: project.id,
    revisionId: latest?.id ?? null,
    lineRoom: await loadLineRoomBasis(viewer, [line.id]),
    amountVisible: await visible(viewer, "quote.amount"),
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
    // precheck와 같은 정규화 — KRW에 실려 온 환율은 버린다(원화 = 결제 합계).
    const total = normalizeMoneyInput(input.total);
    const split = splitCardTotal({ money: total, rule: pre.evidenceRule }, pre.rates);
    const money = moneyToColumns(total);
    let link: { linkKind: CardUsageLinkKind; quoteLineId: string | null; teamId: string | null } = { linkKind: "team_cost", quoteLineId: null, teamId: pre.teamId };
    if (input.linkKind === "quote_line") {
      // 순서 고정(B-1 · X-2): 프로젝트 행 → 견적 줄(id 순) → 연결(계보 사슬) → 이중 연결 → 실행가 상한 → INSERT.
      if (!pre.projectId || !pre.revisionId || !pre.lineRoom) throw new CardUsageRejectedError(LINK_MISSING);
      await lockProjectForLinkWrite(viewer, { projectId: pre.projectId, revisionId: pre.revisionId }, innerTx);
      const [locked] = await lockQuoteLines(viewer, [input.lineId], innerTx);
      // 화면이 내보내지 않는 줄(조정 · 취소 · 보관 · 현재 차수 밖) — 새 문구 없음.
      if (!locked || locked.lineKind === "adjustment" || locked.lineStatus === "cancelled" || locked.archivedAt || locked.revisionId !== pre.revisionId) {
        throw new ForbiddenError(LINK_MISSING);
      }
      const links = await findLineLinks(viewer, [input.lineId], innerTx);
      const lineLinks = links.get(input.lineId);
      const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
      if (!dual.allowed) throw new GateBlockedError(dual.reason);
      if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
      const room = lineRoom({ links, basis: pre.lineRoom, lineId: input.lineId, exclude: pre.capExclude });
      const cap = await gate(null, "card.execution-cap", {
        execution: lineLinks.currentExecution,
        otherSupplies: room.otherSupplies,
        supply: { currency: "KRW", amount: split.supplyKrw, fxRate: 1 },
        source: "entry",
        link: "pickable",
        amountVisible: pre.amountVisible,
      });
      if (!cap.allowed) throw new GateBlockedError(cap.reason);
      link = { linkKind: "quote_line", quoteLineId: input.lineId, teamId: null };
    } else if (input.linkKind === "out_of_quote") {
      // 순서 고정(X-2 · X-6): 프로젝트 행(완료 판정은 게이트 한 곳) → 04 줄 편집 게이트 → 줄 INSERT → 카드 사용 INSERT.
      // 새 줄이라 잠글 기존 연결이 없고, 실행가 = 공급가라 card.execution-cap을 부르지 않는다(Q3 열린 선택).
      const out = pre.outOfQuote;
      if (!out) throw new CardUsageRejectedError(LINK_MISSING);
      const project = await lockProjectForLinkWrite(viewer, { projectId: out.projectId, revisionId: out.revisionId, allowCompleted: true }, innerTx);
      const edit = await gate(project, "project.line-edit", {
        status: project.status,
        lineKind: "out_of_quote",
        actorCanWrite: true,
        actorCanAdjust: false,
        hasLinkedDocuments: false,
        change: { kind: "insert", quoteCellsZero: true },
        completedOutOfQuote: out.completedOutOfQuote,
      });
      if (!edit.allowed) throw new GateBlockedError(edit.reason);
      const line = await createOutOfQuoteLine(viewer, { revisionId: out.revisionId, itemName: out.itemName, executionKrw: split.supplyKrw }, innerTx);
      link = { linkKind: "quote_line", quoteLineId: line.id, teamId: null };
    }
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
        ...link,
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
  /** 사용일 소속 팀 이름 — 「팀 비용」 읽기 텍스트(노출이 꺼지면 null). */
  teamName: string | null;
  /** 사용일 소속 발령이 있는가 — 「소속 없음」 막힘은 이것으로만(이름 노출과 무관). */
  teamAssigned: boolean;
};

export async function previewCardAmounts(
  viewer: Viewer,
  input: { usedOn: string; total: MoneyInput | null; evidenceTypeCode: string | null },
): Promise<CardAmountsPreview> {
  const team = await teamAtDate(viewer, viewer.id, input.usedOn);
  const teamName = team?.name ?? null;
  const teamAssigned = (await teamIdOn(viewer, input.usedOn)) !== null;
  if (!input.total || !input.evidenceTypeCode) return { split: null, teamName, teamAssigned };
  const option = (await cardEvidenceTypes(viewer)).options.find((candidate) => candidate.value === input.evidenceTypeCode);
  if (!option) return { split: null, teamName, teamAssigned };
  const rates = await loadTaxRates(input.usedOn);
  const split = splitCardTotal({ money: input.total, rule: option.rule }, rates);
  return { split: { ...split, ruleKind: option.rule.ruleKind, evidenceLabel: option.label }, teamName, teamAssigned };
}

// ── 가맹점 고르기 ──────────────────────────────────────────────────────────

// 카드 경로의 가맹점(거래처) 고르기 — 문은 지출결의 쓰기 권한이 아니라 카드 자격(오늘 쓸 카드가 한 장 이상)이다(06-05 검토 P3-6).
// 행 · 투영은 지출결의 거래처 고르기와 같은 DTO(`PickVendorOptionDto`) — 숨김 · 보관 거래처 없음, vendor.value가 가리면 행이 빈다.
export async function searchMerchantsForCard(viewer: Viewer, input: { query: string }): Promise<{ rows: Partial<PickVendorOptionDto>[]; truncated: boolean }> {
  if ((await cardOptionsForUsage(viewer, seoulToday())).length === 0) throw new ForbiddenError(CARD_NOT_ELIGIBLE);
  const found = await listVendorsForPick(viewer, { normalizedQuery: normalizeVendorName(input.query), limit: PICK_LIMIT + 1, kinds: vendorKindsFor("supplier") });
  const evidenceNames = await codeLabelsOf(viewer, "evidence_type");
  const options: PickVendorOptionDto[] = found.slice(0, PICK_LIMIT).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    defaultEvidenceType: vendor.defaultEvidenceType,
    defaultEvidenceName: vendor.defaultEvidenceType ? (evidenceNames.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType) : null,
  }));
  const rows = (await projectMany(viewer, options, PICK_VENDOR_OPTION_SPEC)).filter((row) => row.id !== undefined);
  return { rows, truncated: found.length > PICK_LIMIT };
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
  teamAssigned: boolean;
  /** USD 환율 칸 기본값(설정 최근 환율 — FX-01). 읽지 못하면 null(빈 칸 + 막힘). */
  usdFxRate: number | null;
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
    teamAssigned: (await teamIdOn(viewer, usedOn)) !== null,
    usdFxRate: await recentFxRate("USD").catch(() => null),
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
  /** 등록한 날(서울 날짜) — 경영관리 등록 행의 2행 `{등록자} {MM-DD}`. */
  registeredOn: string;
  /** 연결 칸(S8) — `{프로젝트} · {줄 번호} {항목}` / `{프로젝트} · 견적 외 비용 · {항목}`. 팀 비용이면 null. */
  linkLabel: string | null;
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
  "registeredOn",
  "memo",
] as const;
// 연결 칸은 프로젝트 이름을 싣는다 — 카드 사용 값과 프로젝트 값을 둘 다 볼 때만(all-of).
const LINK_LABEL_INFO = ["card_usage.value", "project.value"];
const AMOUNT_KEYS = ["currency", "foreignAmount", "fxRate", "totalKrw", "supplyKrw", "vatKrw"] as const;

export const CARD_USAGE_LIST_DTO_SPEC: DtoSpec<CardUsageListProjectable, CardUsageListItemDto> = {
  fields: [
    ...VALUE_KEYS.map((key) => ({ key, from: key, infoItem: "card_usage.value" })),
    { key: "linkLabel", from: "linkLabel", infoItem: LINK_LABEL_INFO },
    ...AMOUNT_KEYS.map((key) => ({ key, from: key, infoItem: "card_usage.amount" })),
  ],
};

registerDto({
  name: "CardUsageListItemDto",
  fields: CARD_USAGE_LIST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 줄 번호 = 그 줄 차수 안 순번(보관 안 된 줄, 정렬 순 — S10 줄 목록 · S15와 같은 셈).
async function lineNumbers(viewer: Viewer, revisionIds: readonly string[]): Promise<Map<string, number>> {
  const lines = await listQuoteLinesByRevisions(viewer, [...new Set(revisionIds)]);
  const lineNo = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const line of lines) {
    const next = (seen.get(line.revisionId) ?? 0) + 1;
    seen.set(line.revisionId, next);
    lineNo.set(line.id, next);
  }
  return lineNo;
}

function cardLinkLabel(row: CardUsageListRow, lineNo: Map<string, number>): string | null {
  if (row.linkKind !== "quote_line" || row.projectName === null || row.lineItemName === null) return null;
  if (row.lineKind === "out_of_quote") return `${row.projectName} · 견적 외 비용 · ${row.lineItemName}`;
  const number = row.quoteLineId ? lineNo.get(row.quoteLineId) : undefined;
  return `${row.projectName} · ${number === undefined ? row.lineItemName : `${number} ${row.lineItemName}`}`;
}

function toProjectable(row: CardUsageListRow, lineNo: Map<string, number>): CardUsageListProjectable {
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
    registeredOn: seoulToday(row.createdAt),
    linkLabel: cardLinkLabel(row, lineNo),
    memo: row.memo,
    currency: row.totalCurrency,
    foreignAmount: row.totalForeignAmount === null ? null : Number(row.totalForeignAmount),
    fxRate: Number(row.totalFxRate),
    totalKrw: row.totalAmountKrw,
    supplyKrw: row.supplyKrw,
    vatKrw: row.vatKrw,
  };
}

export type { CardUsageLinkFilter };

export type CardUsageListFilters = {
  month: string;
  cardId?: string;
  link?: CardUsageLinkFilter;
  /** `경영관리 등록`만 — 등록 필터를 받는 사람(`registrationFilter`)에게만 듣는다. */
  proxyOnly?: boolean;
  page?: string;
};

export type CardUsageList = {
  rows: Partial<CardUsageListItemDto>[];
  /** 합계 면 — 필터 결과 전체(쪽이 아니라)의 서버 합. 금액을 못 보는 사람은 null. */
  totals: { count: number; totalKrw: number; supplyKrw: number } | null;
  page: { page: number; pageCount: number; pageSize: number; total: number };
  /** 카드 필터의 선택지 — 그 사람의 목록 범위 안 카드. */
  cardChoices: Partial<CardOptionDto>[];
  /** 등록 필터(`전체`/`경영관리 등록`)를 보일지 — `cards.proxy` · `expenses.payments` write 권한자만. */
  registrationFilter: boolean;
};

function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

// 범위(UA-612 · Q5): `cards.proxy` · `expenses.payments` write 권한자 · 전사 범위 → 전부 /
// 그 밖(팀장 포함) → 자기 카드 · 오늘 소속 팀 카드의 사용 + 자기가 등록한 것(공용 카드 사용은 자기 등록일 때만 — 쿼리 조건).
async function listAccess(viewer: Viewer, today: string): Promise<{ scope: CardUsageScope; privileged: boolean }> {
  const privileged = (await can(viewer, "cards.proxy", "write")) || (await can(viewer, "expenses.payments", "write"));
  const actor = await loadActorTeamScope(viewer, { todayKst: today });
  if (privileged || actor.workScope === "company") return { scope: { kind: "all" }, privileged };
  return { scope: { kind: "own", userId: viewer.id, teamId: actor.teamId }, privileged };
}

async function cardChoicesFor(viewer: Viewer, scope: CardUsageScope): Promise<Partial<CardOptionDto>[]> {
  const cards = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: true });
  const inScope =
    scope.kind === "all" ? cards : cards.filter((card) => card.holderUserId === scope.userId || (scope.teamId !== null && card.teamId === scope.teamId));
  return projectMany(viewer, inScope.map((card) => ({ id: card.id, label: cardLabel(card) })), CARD_OPTION_SPEC);
}

export async function listCardUsages(viewer: Viewer, filters: CardUsageListFilters, today: string): Promise<CardUsageList> {
  const { scope, privileged } = await listAccess(viewer, today);
  const filter: CardUsageFilter = {
    ...monthRange(filters.month),
    ...(filters.cardId ? { cardId: filters.cardId } : {}),
    ...(filters.link ? { link: filters.link } : {}),
    ...(privileged && filters.proxyOnly ? { proxyOnly: true } : {}),
  };
  // 판정(can · 소속)은 위에서 끝내고 트랜잭션 안에서는 목록 쿼리 하나만 — lock_timeout(5s)이 잠금 대기를 끊는다(로드 오류 갈래).
  const rows = await withTransaction((tx) => listCardUsageRows(viewer, { scope, filter }, tx));
  const lineNo = await lineNumbers(viewer, rows.flatMap((row) => (row.lineRevisionId ? [row.lineRevisionId] : [])));
  const projected = await projectMany(viewer, rows.map((row) => toProjectable(row, lineNo)), CARD_USAGE_LIST_DTO_SPEC);
  const amountsVisible = projected.every((row) => row.totalKrw !== undefined);
  const pageCount = pageCountFrom(projected.length, LIST_PAGE_SIZE);
  const page = clampPage(filters.page, pageCount);
  return {
    rows: projected.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    totals: amountsVisible
      ? {
          count: projected.length,
          totalKrw: sumKrw(projected.map((row) => row.totalKrw ?? 0)),
          supplyKrw: sumKrw(projected.map((row) => row.supplyKrw ?? 0)),
        }
      : null,
    page: { page, pageCount, pageSize: LIST_PAGE_SIZE, total: projected.length },
    cardChoices: await cardChoicesFor(viewer, scope),
    registrationFilter: privileged,
  };
}

// ── 새 건 기본값(M-4) ──────────────────────────────────────────────────────

export type CardUsageFormLinkKind = "team_cost" | "quote_line" | "out_of_quote";

export type CardUsageFormDefaults = {
  usedOn: string;
  corpCardId: string | null;
  linkKind: CardUsageFormLinkKind | null;
  project: CardLinkProjectChoice | null;
  line: CardLinkLineChoice | null;
};

/** 진입 — S14 견적 줄 행(`?line=`) · S15 빈 섹션(`?project=`). */
export type CardUsageEntry = { lineId?: string | undefined; projectId?: string | undefined };

// 사용일 = 오늘(서울) · 카드 = 직전 등록의 카드가 지금 옵션에 있을 때만(아니면 옵션 한 장이면 그 카드).
// 연결(M-4) 우선순위 = 진입 줄(고를 수 있을 때만 · 줄까지) > 진입 프로젝트(고를 수 있을 때만) > 직전 등록의 종류 + 프로젝트
// (지금 고를 수 없으면 종류만). 견적 줄은 진입 줄일 때만 채운다. 처음 쓰는 사람은 연결이 빈다. 보관된 건은 직전 등록이 아니다.
export async function cardUsageFormDefaults(viewer: Viewer, today: string, entry: CardUsageEntry = {}): Promise<CardUsageFormDefaults> {
  const options = await cardOptionsForUsage(viewer, today);
  const last = await findLastCardUsageByRegistrant(viewer, viewer.id);
  const lastCard = last && options.some((option) => option.id === last.corpCardId) ? last.corpCardId : null;
  const onlyCard = options.length === 1 ? (options[0]?.id ?? null) : null;
  const base = { usedOn: today, corpCardId: lastCard ?? onlyCard };
  if (entry.lineId) {
    const chosen = await cardLinkLineChoice(viewer, entry.lineId);
    if (chosen) return { ...base, linkKind: "quote_line", project: chosen.project, line: chosen.line };
  }
  if (entry.projectId) {
    const project = await cardLinkProjectChoice(viewer, entry.projectId);
    if (project) return { ...base, linkKind: "quote_line", project, line: null };
  }
  if (!last) return { ...base, linkKind: null, project: null, line: null };
  if (last.linkKind === "team_cost") return { ...base, linkKind: "team_cost", project: null, line: null };
  const project = last.projectId ? await cardLinkProjectChoice(viewer, last.projectId) : null;
  return { ...base, linkKind: last.lineKind === "out_of_quote" ? "out_of_quote" : "quote_line", project, line: null };
}

// ── 프로젝트 상세 「법인카드 사용」(S15) ─────────────────────────────────────

export type ProjectCardUsageDto = {
  id: string;
  usedOn: string;
  /** `{번호} {항목}`(그 줄 차수 안 순번 — S10 줄 목록과 같은 셈) / `견적 외 비용 · {항목}`. */
  lineLabel: string;
  merchantName: string | null;
  registeredVia: string;
  registeredByName: string;
  /** 등록한 날(서울 날짜) — 경영관리 등록 행의 2행 `{등록자} {MM-DD}`. */
  registeredOn: string;
  totalKrw: number;
  supplyKrw: number;
};

export type ProjectCardUsageTotalsDto = { count: number; totalKrw: number };

// 금액 칸 · 합계 행의 결제 합계 = 견적 표 금액 열과 같은 `quote.amount`(새 정보 항목 없음), 나머지는 `project.value`.
const PROJECT_CARD_USAGE_DTO_SPEC: DtoSpec<ProjectCardUsageDto, ProjectCardUsageDto> = {
  fields: [
    ...(["id", "usedOn", "lineLabel", "merchantName", "registeredVia", "registeredByName", "registeredOn"] as const).map((key) => ({
      key,
      from: key,
      infoItem: "project.value",
    })),
    ...(["totalKrw", "supplyKrw"] as const).map((key) => ({ key, from: key, infoItem: "quote.amount" })),
  ],
};

const PROJECT_CARD_USAGE_TOTALS_DTO_SPEC: DtoSpec<ProjectCardUsageTotalsDto, ProjectCardUsageTotalsDto> = {
  fields: [
    { key: "count", from: "count", infoItem: "project.value" },
    { key: "totalKrw", from: "totalKrw", infoItem: "quote.amount" },
  ],
};

registerDto({
  name: "ProjectCardUsageDto",
  fields: PROJECT_CARD_USAGE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});
registerDto({
  name: "ProjectCardUsageTotalsDto",
  fields: PROJECT_CARD_USAGE_TOTALS_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ProjectCardUsages = {
  rows: Partial<ProjectCardUsageDto>[];
  totals: Partial<ProjectCardUsageTotalsDto>;
  /** 빈 섹션 3차 `카드 사용 등록`을 보일지 — 오늘 쓸 카드가 한 장 이상. */
  canRegister: boolean;
};

const PROJECTS_VIEW_DENIED = "프로젝트 보기 권한 없음";

export async function listProjectCardUsages(viewer: Viewer, projectId: string): Promise<ProjectCardUsages> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  // 상세 화면의 findProject와 같은 범위 — 보관된 프로젝트는 보관 보기(admin.archive) 계정에게만(액션을 직접 불러도 같다).
  const scope = await scopeFor(viewer, "project");
  const projectRow = await findProjectById(viewer, projectId);
  if (!projectRow || (projectRow.archivedAt !== null && !scope.includeArchived)) throw new ProjectNotFoundError();
  const rows = await listProjectCardUsageRows(viewer, projectId);
  const lineNo = await lineNumbers(viewer, rows.map((row) => row.revisionId));
  const items: ProjectCardUsageDto[] = rows.map((row) => {
    const number = row.quoteLineId ? lineNo.get(row.quoteLineId) : undefined;
    return {
      id: row.id,
      usedOn: row.usedOn,
      lineLabel:
        row.lineKind === "out_of_quote" ? `견적 외 비용 · ${row.lineItemName}` : number === undefined ? row.lineItemName : `${number} ${row.lineItemName}`,
      merchantName: row.merchantName,
      registeredVia: row.registeredVia,
      registeredByName: row.registeredByName,
      registeredOn: seoulToday(row.createdAt),
      totalKrw: row.totalAmountKrw,
      supplyKrw: row.supplyKrw,
    };
  });
  const [totals] = await projectMany(
    viewer,
    [{ count: items.length, totalKrw: sumKrw(items.map((item) => item.totalKrw)) }],
    PROJECT_CARD_USAGE_TOTALS_DTO_SPEC,
  );
  return {
    rows: await projectMany(viewer, items, PROJECT_CARD_USAGE_DTO_SPEC),
    totals: totals ?? {},
    canRegister: (await cardOptionsForUsage(viewer, seoulToday())).length > 0,
  };
}
