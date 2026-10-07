import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import type { CardOwnerKind } from "@/domain/corp-cards";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { loadTaxRates, type TaxRates } from "@/domain/money/tax";
import { diffKrw, moneyToColumns, normalizeMoneyInput, sumKrw, toKrw, type MoneyInput } from "@/domain/money";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { teamAtDate } from "@/domain/org";
import { cardUsageRights, type CardUsageRights } from "@/domain/corp-card-usages/rights";
import { loadActorTeamScope, ProjectNotFoundError } from "@/domain/projects/status";
import { cardExecutionCap, cardUsedOnError, isCardEvidenceRule, splitCardTotal, type CardSplit } from "@/domain/corp-card-usages/amounts";
import { recentFxRate } from "@/domain/money/currency";
import { seoulToday } from "@/lib/dates";
import { listCodeItems } from "@/repositories/code-tables";
import { findCorpCardById, listCorpCards, type CorpCardRow } from "@/repositories/corp-cards";
import { findUserNamesByIds, listUsers } from "@/repositories/users";
import { findMembershipAtDate, findMembershipsAtDate } from "@/repositories/team-memberships";
import { findTeamsByIds } from "@/repositories/teams";
import { listVendorsForPick } from "@/repositories/vendors";
import { normalizeVendorName } from "@/domain/vendors";
import { vendorKindsFor } from "@/domain/vendors/kind";
import { codeLabelsOf } from "@/domain/expenses";
import { PICK_LIMIT, PICK_VENDOR_OPTION_SPEC, type PickVendorOptionDto } from "@/domain/expenses/pick";
import {
  findCardUsageForWrite,
  findLastCardUsageByRegistrant,
  insertCardUsage,
  updateCardUsageRow,
  archiveCardUsageRow,
  restoreCardUsageRow,
  type CardUsageForWrite,
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
import { findProjectById, type ProjectRow } from "@/repositories/projects";
import { scopeFor } from "@/domain/permissions/scope-for";
import { findQuoteLineById, listQuoteLinesByRevisions } from "@/repositories/quote-lines";
import { findLatestQuoteRevision, findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findLineLinks, lockQuoteLines } from "@/repositories/quote-line-links";
import { findVendorById, findVendorNamesByIds } from "@/repositories/vendors";
import { createOutOfQuoteLine } from "@/domain/quotes/lines";
import {
  cardLinkLineChoice,
  cardLinkProjectChoice,
  currentLineForFixedLink,
  lineRoom,
  lineRoomHint,
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
const RIGHTS_DENIED = "카드 사용 수정 권리 없음";
const PROXY_DENIED = "카드 대리 등록 권한 없음";
const USED_BY_NOT_CANDIDATE = "사용한 사람 후보 아님 · 사용한 사람 고르기";
const STALE_VERSION = "다른 저장이 먼저 됨 · 새로 고침";
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
  /** 06-09 사용한 사람 — 대리 등록 · 팀 비용 · 팀 또는 공용 카드일 때만 쓴다(사용일 기준 후보 안에서 서버가 다시 본다). */
  usedByUserId?: string | null;
  /** 06-12 구매 완료 갈래(R-3) — 있으면 등록 경로 `purchase`: 카드 자격 = 구매 권한 + 활성 카드 전부, 사용한 사람 = `usedByUserId`(요청자). */
  purchaseRequestId?: string | null;
} & (
  | { linkKind: "team_cost" }
  | { linkKind: null }
  | { linkKind: "quote_line"; lineId: string }
  | { linkKind: "out_of_quote"; projectId: string; itemName: string | null }
);

/** 트랜잭션 전 사실 — 평범한 객체(06-03 tx 규약). */
export type CardUsagePre = {
  card: Pick<CorpCardRow, "id" | "kind" | "holderUserId" | "teamId">;
  /** 06-09 — 사용한 사람이 등록자 본인이면 `self`, 남(남의 개인 카드 소지자 · 고른 사람)이면 `proxy`(DB self_check와 같은 판정). 06-12 구매 완료 = `purchase`. */
  registeredVia: "self" | "proxy" | "purchase";
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
  /** 06-12 고정 연결(구매 완료) — 차수 재판정 없이 계보의 현재 줄로 상한을 보고(N-1 · N-2) 완료 프로젝트도 지난다(U-4 — 초과는 `settled`, Q-E). */
  linkFixed?: boolean;
  /** 06-12 상한 문구 갈래(06-07 `card.execution-cap` `link`) · 담당 PM 이름 — 없으면 `pickable`. */
  capLink?: "pickable" | "fixed";
  pmName?: string;
};

// ── 카드 자격 ──────────────────────────────────────────────────────────────

function cardLabel(card: Pick<CorpCardRow, "label" | "issuer" | "numberLast4">): string {
  return `${card.label} · ${card.issuer} ${card.numberLast4}`;
}

/** `proxyHint` — 남의 개인 · 팀 카드(대리 등록)면 `경영관리 등록 · 카드 소지자 {이름 | 팀}`, 본인 자격 · 공용 카드는 null(서버가 정한다). */
/** `choosesUser` — 대리 등록 권한자 · 본인 개인 카드 밖: 팀 비용이면 `사용한 사람` 칸이 선다(EXP-07 · Q5 — 개인 카드는 소지자 한 명 텍스트, 팀 = 그 사람의 사용일 소속). */
export type UsageCardOption = { id: string; label: string; kind: CardOwnerKind; proxyHint: string | null; choosesUser: boolean };

type EligibleCard = { card: CorpCardRow; own: boolean };

// 카드 자격(U-2 · EXP-16): 직원 = 활성 카드 중 소지자 본인 + 사용일 소속 팀의 카드(`own`). `cards.proxy` write면 활성 카드 전부
// (남의 개인 · 팀 카드 · 공용 카드). 공용 여부는 카드 행의 `kind`로만 가른다 — 06-27 `corp_cards_owner_kind_check`가 종류와 소지자 · 팀 칸 짝을
// 묶는다(R-6). 트랜잭션 밖에서만 부른다(can · 전역 풀 조회).
async function eligibleCards(viewer: Viewer, teamId: string | null): Promise<EligibleCard[]> {
  const cards = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const proxy = await can(viewer, "cards.proxy", "write");
  return cards.flatMap((card) => {
    const own = isOwnCard(card, viewer.id, teamId);
    return own || proxy ? [{ card, own }] : [];
  });
}

// 본인 자격 카드 — 소지자 본인 또는 사용일 소속 팀의 카드(공용 제외).
function isOwnCard(card: Pick<CorpCardRow, "kind" | "holderUserId" | "teamId">, viewerId: string, teamId: string | null): boolean {
  return card.kind !== "shared" && (card.holderUserId === viewerId || (teamId !== null && card.teamId === teamId));
}

const PROXY_HINT = "경영관리 등록 · 카드 소지자";

// 남의 개인 · 팀 카드는 늘 proxy(EXP-16), 공용 · 본인 자격 카드는 사용한 사람이 등록자면 self(DB self_check).
function viaOf(card: { kind: string; own: boolean }, usedByUserId: string, registeredBy: string): "self" | "proxy" {
  return (!card.own && card.kind !== "shared") || usedByUserId !== registeredBy ? "proxy" : "self";
}

// 남의 카드의 소지자 표시 — 개인 = 소지자 이름 · 팀 = 팀 이름(S9 Form.Hint · 수정 모드의 저장된 등록 표시).
async function proxyHolderNames(viewer: Viewer, cards: readonly Pick<CorpCardRow, "id" | "holderUserId" | "teamId">[]): Promise<Map<string, string>> {
  const userNames = await findUserNamesByIds(viewer, [...new Set(cards.flatMap((card) => (card.holderUserId ? [card.holderUserId] : [])))]);
  const teamNames = new Map((await findTeamsByIds(viewer, [...new Set(cards.flatMap((card) => (card.teamId ? [card.teamId] : [])))])).map((team) => [team.id, team.name]));
  const names = new Map<string, string>();
  for (const card of cards) {
    const name = card.holderUserId ? userNames.get(card.holderUserId) : card.teamId ? teamNames.get(card.teamId) : undefined;
    if (name !== undefined) names.set(card.id, name);
  }
  return names;
}

// 사용일 소속 팀 id — 자격 · 귀속 판정은 표시 투영(`team.value`) 전 발령에서 읽는다(목록 범위 `loadActorTeamScope`와 같은 출처).
async function teamIdOn(viewer: Viewer, usedOn: string): Promise<string | null> {
  return (await findMembershipAtDate(viewer, viewer.id, usedOn))?.teamId ?? null;
}

export async function cardOptionsForUsage(viewer: Viewer, usedOn: string): Promise<UsageCardOption[]> {
  const eligible = await eligibleCards(viewer, await teamIdOn(viewer, usedOn));
  const proxy = await can(viewer, "cards.proxy", "write");
  const others = eligible.filter(({ card, own }) => !own && card.kind !== "shared").map(({ card }) => card);
  const holders = await proxyHolderNames(viewer, others);
  return eligible.map(({ card, own }) => {
    const holder = !own && card.kind !== "shared" ? holders.get(card.id) : undefined;
    return {
      id: card.id,
      label: cardLabel(card),
      kind: card.kind as CardOwnerKind,
      proxyHint: holder === undefined ? null : `${PROXY_HINT} ${holder}`,
      choosesUser: proxy && !(card.kind === "personal" && card.holderUserId === viewer.id),
    };
  });
}

// ── 사용한 사람(EXP-07 · Q5) ────────────────────────────────────────────────

export type UsedByCandidate = {
  id: string;
  name: string;
  /** 옵션 2행 글자 — `지금 {팀}`(팀 카드 · 오늘 소속이 카드 팀과 다름) · `퇴사`(지금 기준 퇴사일 지남 또는 보관). */
  note: string | null;
  /** 사용일 소속 팀 — 팀 비용의 팀(EXP-07). 소속이 없으면 null. */
  team: { id: string; name: string } | null;
};

// 사용일 재직 — 입사일이 비었거나 사용일 이하, 퇴사일이 비었거나 사용일 이상(당일 퇴사 포함). 보관된 계정도 든다.
function employedOn(user: { hireDate: string | null; resignationDate: string | null }, date: string): boolean {
  return (user.hireDate === null || user.hireDate <= date) && (user.resignationDate === null || user.resignationDate >= date);
}

// 사용한 사람 후보(사용일 기준, Q5) — 개인 카드 = 소지자 · 팀 카드 = 사용일에 그 팀 소속이던 재직자 · 공용 카드 = 사용일 재직자 전부.
// 대리 등록 권한자만. 전역 풀을 읽으므로 트랜잭션 밖에서만 부른다.
export async function usedByCandidates(viewer: Viewer, input: { cardId: string; usedOn: string }): Promise<UsedByCandidate[]> {
  if (!(await can(viewer, "cards.proxy", "write"))) throw new ForbiddenError(PROXY_DENIED);
  const card = await findCorpCardById(viewer, input.cardId);
  if (!card) throw new ForbiddenError(CARD_NOT_ELIGIBLE);
  const today = seoulToday();
  const people = (await listUsers(viewer, { scope: { rows: "all", includeArchived: true }, includeArchived: true })).filter((user) =>
    card.kind === "personal" ? user.id === card.holderUserId : employedOn(user, input.usedOn),
  );
  const ids = people.map((user) => user.id);
  const teamOnUsedOn = new Map((await findMembershipsAtDate(viewer, ids, input.usedOn)).map((row) => [row.userId, row.teamId]));
  const kept = card.kind === "team" ? people.filter((user) => teamOnUsedOn.get(user.id) === card.teamId) : people;
  const teamNow = new Map((await findMembershipsAtDate(viewer, kept.map((user) => user.id), today)).map((row) => [row.userId, row.teamId]));
  const teamIds = [...new Set([...kept.map((user) => teamOnUsedOn.get(user.id)), ...kept.map((user) => teamNow.get(user.id))].filter((id): id is string => id !== undefined))];
  const teamNames = new Map((await findTeamsByIds(viewer, teamIds)).map((team) => [team.id, team.name]));
  return kept.map((user) => {
    const usedOnTeam = teamOnUsedOn.get(user.id);
    const nowTeam = teamNow.get(user.id);
    const resigned = user.archivedAt !== null || (user.resignationDate !== null && user.resignationDate < today);
    const moved = card.kind === "team" && nowTeam !== undefined && nowTeam !== card.teamId ? `지금 ${teamNames.get(nowTeam) ?? ""}` : null;
    return {
      id: user.id,
      name: user.name,
      note: resigned ? "퇴사" : moved,
      team: usedOnTeam ? { id: usedOnTeam, name: teamNames.get(usedOnTeam) ?? "" } : null,
    };
  });
}

// 사용한 사람 · 팀 비용의 팀 — 개인 카드 = 소지자, 대리 등록 권한자 · 팀 비용 · 팀 또는 공용 카드 = 후보 안에서 고른 사람(없으면 `fallback`),
// 그 밖 = `fallback`(새 건 = 등록자 · 수정 = 저장된 사람). 팀 비용이면 그 사람의 사용일 소속(없으면 거부). 사전 조회에서만 부른다.
async function resolveUsedBy(
  viewer: Viewer,
  input: {
    proxy: boolean;
    card: Pick<CorpCardRow, "id" | "kind" | "holderUserId">;
    linkKind: CardUsageInput["linkKind"];
    usedOn: string;
    requested: string | null;
    fallback: string;
  },
): Promise<{ usedByUserId: string; teamId: string | null }> {
  const teamCost = input.linkKind === "team_cost";
  if (input.card.kind !== "personal" && teamCost && input.proxy) {
    const chosen = (await usedByCandidates(viewer, { cardId: input.card.id, usedOn: input.usedOn })).find(
      (candidate) => candidate.id === (input.requested ?? input.fallback),
    );
    if (!chosen) throw new ForbiddenError(USED_BY_NOT_CANDIDATE);
    if (!chosen.team) throw new CardUsageRejectedError(`${chosen.name} ${mmdd(input.usedOn)} 소속 없음 · 소속 발령은 관리자`);
    return { usedByUserId: chosen.id, teamId: chosen.team.id };
  }
  const usedByUserId = input.card.kind === "personal" && input.card.holderUserId ? input.card.holderUserId : input.fallback;
  if (!teamCost) return { usedByUserId, teamId: null };
  const teamId = (await findMembershipAtDate(viewer, usedByUserId, input.usedOn))?.teamId ?? null;
  if (!teamId) {
    const name = (await findUserNamesByIds(viewer, [usedByUserId])).get(usedByUserId) ?? "";
    throw new CardUsageRejectedError(`${name} ${mmdd(input.usedOn)} 소속 없음 · 소속 발령은 관리자`);
  }
  return { usedByUserId, teamId };
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

// 사용일 상한(Q6) · 연결 없음 · 결제 합계 형식(O-7) — 새 건 · 수정이 같이 쓰는 순수 판정. 원화는 정수 원 · 환산 합계는 0 초과.
function assertUsageBasics(input: CardUsageInput): void {
  // 액션을 거치지 않는 호출(06-12 · 6.1)도 같은 판정. 오늘은 서버의 서울 날짜.
  const futureError = cardUsedOnError(input.usedOn, seoulToday());
  if (futureError) throw new CardUsageRejectedError(futureError);
  if (input.linkKind === null) throw new CardUsageRejectedError(LINK_MISSING);
  const money = normalizeMoneyInput(input.total);
  if (money.currency === "KRW" && !Number.isInteger(money.amount)) throw new CardUsageRejectedError(AMOUNT_NOT_NUMBER);
  if (toKrw(money) <= 0) throw new CardUsageRejectedError(AMOUNT_NOT_POSITIVE);
}

// 증빙 종류(카드 규칙) · 가맹점(CSO-5) — 새 건 · 수정 공통.
async function checkEvidenceAndMerchant(viewer: Viewer, input: CardUsageInput): Promise<TaxRule> {
  const evidence = await cardEvidenceTypes(viewer);
  const option = evidence.options.find((candidate) => candidate.value === input.evidenceTypeCode);
  if (!option) {
    const label = evidence.labels.get(input.evidenceTypeCode) ?? input.evidenceTypeCode;
    throw new CardUsageRejectedError(`증빙 종류 ${label} 카드에 없음 · 증빙 종류 고르기`);
  }
  // 고르기 목록(searchMerchantsForCard · listVendorsForPick)과 같은 조건: 있음 · 숨김 아님 · 보관 아님 · 협력사 갈래.
  if (input.merchantVendorId) {
    const merchant = UUID_SHAPE.test(input.merchantVendorId) ? await findVendorById(viewer, input.merchantVendorId) : null;
    if (!merchant || merchant.hidden || merchant.archivedAt !== null || !vendorKindsFor("supplier").includes(merchant.kind)) {
      throw new CardUsageRejectedError(MERCHANT_MISSING);
    }
  }
  return option.rule;
}

type LinkPre = Pick<CardUsagePre, "projectId" | "revisionId" | "lineRoom" | "amountVisible" | "outOfQuote">;

const NO_LINK: LinkPre = { projectId: null, revisionId: null, lineRoom: null, amountVisible: false, outOfQuote: null };

// 새 연결 판정(새 건 · 수정의 연결 바꾸기 공통) — 견적 줄 · 견적 외 비용은 프로젝트를 고르는 일이라 S10 목록과 같은 문(projects view)을
// 서버가 다시 본다(I-6). 완료 프로젝트는 누구도 견적 줄로 새로 잇지 않는다(D-47) — 대리 등록 권한자의 견적 외 비용만 연다(U-4 · Q-B).
async function precheckLink(
  viewer: Viewer,
  input: CardUsageInput & { linkKind: "quote_line" | "out_of_quote" },
  proxy: boolean,
): Promise<LinkPre> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);

  if (input.linkKind === "out_of_quote") {
    // 견적 외 비용(O-8 · X-6): 현재 차수 · 완료 판정 · 항목 기본값은 트랜잭션 전에 — 잠근 뒤 `project.line-edit`가 상태를 다시 본다.
    const project = await findProjectById(viewer, input.projectId);
    if (!project || project.archivedAt) throw new CardUsageRejectedError(LINK_MISSING);
    // 완료 프로젝트: 권한자만 통과 — 몸통의 `project.line-edit`(D-47 ③)가 잠근 행으로 같은 판정을 다시 한다(X-6).
    const completedOutOfQuote = project.status === "completed" && proxy;
    if (project.status === "completed" && !completedOutOfQuote) throw new CompletedProjectError(quoteLockReason({ status: project.status }) ?? undefined);
    const latest = await findLatestQuoteRevision(viewer, project.id);
    if (!latest) throw new CardUsageRejectedError(LINK_MISSING);
    const merchantName = input.merchantVendorId
      ? ((await findVendorNamesByIds(viewer, [input.merchantVendorId])).get(input.merchantVendorId) ?? "")
      : "";
    const itemName = (input.itemName ?? "").trim() || merchantName.trim();
    if (!itemName) throw new CardUsageRejectedError(ITEM_MISSING);
    return {
      ...NO_LINK,
      projectId: project.id,
      revisionId: latest.id,
      outOfQuote: { projectId: project.id, revisionId: latest.id, itemName, completedOutOfQuote },
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
    ...NO_LINK,
    projectId: project.id,
    revisionId: latest?.id ?? null,
    lineRoom: await loadLineRoomBasis(viewer, [line.id]),
    amountVisible: await visible(viewer, "quote.amount"),
  };
}

const PURCHASE_DENIED = "구매 처리 권한 없음";

// 06-12 구매 완료의 고정 연결(R-3 · U-4) — 요청의 견적 줄이라 사람이 고르지 않는다(projects view 문 없음). 완료 프로젝트도 지나고,
// 상한 바탕 · 문구 갈래(`fixed` · 담당 PM) · 이 요청 자신의 예상 공급가 제외를 싣는다. 잠근 뒤 `runCreate`가 다시 본다(X-2).
async function precheckPurchaseLink(viewer: Viewer, lineId: string, requestId: string): Promise<LinkPre & Pick<CardUsagePre, "linkFixed" | "capLink" | "pmName" | "capExclude">> {
  const line = await findQuoteLineById(viewer, lineId);
  const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
  const project = revision ? await findProjectById(viewer, revision.projectId) : null;
  if (!line || !project || project.archivedAt) throw new CardUsageRejectedError(LINK_MISSING);
  const latest = await findLatestQuoteRevision(viewer, project.id);
  const pmName = project.pmUserId ? ((await findUserNamesByIds(viewer, [project.pmUserId])).get(project.pmUserId) ?? "") : "";
  return {
    ...NO_LINK,
    projectId: project.id,
    revisionId: latest?.id ?? null,
    lineRoom: await loadLineRoomBasis(viewer, [line.id]),
    amountVisible: await visible(viewer, "quote.amount"),
    linkFixed: true,
    capLink: "fixed",
    pmName,
    capExclude: { requestId },
  };
}

// 06-12 구매 완료 갈래(R-3) — 본인 카드 · 대리 등록 판정을 타지 않는다. 카드 = 구매 권한 + 활성 카드 전부(공용 포함, Q5),
// 사용한 사람 = 요청자, 팀 비용의 팀 = 요청자의 사용일 소속(O-19). 트랜잭션 밖에서만.
async function precheckPurchaseCardUsage(viewer: Viewer, input: CardUsageInput, requestId: string): Promise<CardUsagePre> {
  if (!(await can(viewer, "cards.purchases", "write"))) throw new ForbiddenError(PURCHASE_DENIED);
  const requester = input.usedByUserId;
  if (!requester) throw new ForbiddenError(USED_BY_NOT_CANDIDATE);
  const active = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const card = active.find((candidate) => candidate.id === input.corpCardId);
  if (!card) throw new ForbiddenError(CARD_NOT_ELIGIBLE);
  let teamId: string | null = null;
  if (input.linkKind === "team_cost") {
    teamId = (await findMembershipAtDate(viewer, requester, input.usedOn))?.teamId ?? null;
    if (!teamId) {
      const name = (await findUserNamesByIds(viewer, [requester])).get(requester) ?? "";
      throw new CardUsageRejectedError(`요청자 ${name} ${mmdd(input.usedOn)} 소속 없음 · 소속 발령은 관리자`);
    }
  }
  const evidenceRule = await checkEvidenceAndMerchant(viewer, input);
  const rates = await loadTaxRates(input.usedOn);
  const base = {
    card: { id: card.id, kind: card.kind, holderUserId: card.holderUserId, teamId: card.teamId },
    registeredVia: "purchase",
    usedByUserId: requester,
    teamId,
    evidenceRule,
    rates,
    capExclude: { requestId },
  } as const;
  if (input.linkKind === "quote_line") return { ...base, ...(await precheckPurchaseLink(viewer, input.lineId, requestId)) };
  if (input.linkKind === "team_cost") return { ...base, ...NO_LINK };
  throw new CardUsageRejectedError(LINK_MISSING);
}

export async function precheckCardUsage(viewer: Viewer, input: CardUsageInput): Promise<CardUsagePre> {
  assertUsageBasics(input);
  if (input.purchaseRequestId) return precheckPurchaseCardUsage(viewer, input, input.purchaseRequestId);

  // 카드 자격(U-2 · EXP-16) — 남의 개인 · 팀 카드는 대리 등록 권한자만(D-608).
  const card = await findCorpCardById(viewer, input.corpCardId);
  const eligible = card ? (await eligibleCards(viewer, await teamIdOn(viewer, input.usedOn))).find((candidate) => candidate.card.id === card.id) : undefined;
  if (!card || !eligible) throw new ForbiddenError(card?.kind === "shared" ? SHARED_CARD_FORBIDDEN : CARD_NOT_ELIGIBLE);
  const proxy = await can(viewer, "cards.proxy", "write");
  const usedBy = await resolveUsedBy(viewer, { proxy, card, linkKind: input.linkKind, usedOn: input.usedOn, requested: input.usedByUserId ?? null, fallback: viewer.id });
  const registeredVia = viaOf({ kind: card.kind, own: eligible.own }, usedBy.usedByUserId, viewer.id);

  const evidenceRule = await checkEvidenceAndMerchant(viewer, input);
  const rates = await loadTaxRates(input.usedOn);
  const base = {
    card: { id: card.id, kind: card.kind, holderUserId: card.holderUserId, teamId: card.teamId },
    registeredVia,
    usedByUserId: usedBy.usedByUserId,
    teamId: usedBy.teamId,
    evidenceRule,
    rates,
    capExclude: {},
  } as const;
  if (input.linkKind === "team_cost" || input.linkKind === null) return { ...base, ...NO_LINK };
  return { ...base, ...(await precheckLink(viewer, input, proxy)) };
}

// ── 등록(단독 / 외부 tx) ───────────────────────────────────────────────────

/** `capOver` — 06-12 완료 프로젝트 줄 구매 완료(`settled`)의 실행가 초과액(원화), 초과가 아니거나 그 밖의 갈래면 null(Q-E). */
export type CreatedCardUsage = { id: string; totalKrw: number; capOver: number | null };
/** 수정 반환 — 결제 합계를 못 보는 사람에게는 null(DOM D-1). */
export type UpdatedCardUsage = { id: string; totalKrw: number | null };

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
    let capOver: number | null = null;
    if (input.linkKind === "quote_line") {
      // 순서 고정(B-1 · X-2): 프로젝트 행 → (고정 연결이면 사슬의 현재 줄) → 견적 줄(한 호출 · id 순) → 연결(계보 사슬) → 이중 연결 → 실행가 상한 → INSERT.
      if (!pre.projectId || !pre.revisionId || !pre.lineRoom) throw new CardUsageRejectedError(LINK_MISSING);
      // 06-12 고정 연결(구매 완료): 차수 재판정 없이 완료 프로젝트도 지난다(U-4) — 앞 차수 줄의 요청도 계보로 현재 줄에 닿는다(X-1).
      const project = await lockProjectForLinkWrite(
        viewer,
        pre.linkFixed ? { projectId: pre.projectId, allowCompleted: true } : { projectId: pre.projectId, revisionId: pre.revisionId },
        innerTx,
      );
      const current = pre.linkFixed ? await currentLineForFixedLink(viewer, { projectId: pre.projectId, lineId: input.lineId }, innerTx) : null;
      const locked = await lockQuoteLines(viewer, current ? [input.lineId, current] : [input.lineId], innerTx);
      const target = locked.find((row) => row.id === input.lineId);
      // 화면이 내보내지 않는 줄(조정 · 취소 · 보관 · 현재 차수 밖) — 새 문구 없음. 고정 연결은 차수를 보지 않는다.
      if (!target || target.lineKind === "adjustment" || target.lineStatus === "cancelled" || target.archivedAt || (!pre.linkFixed && target.revisionId !== pre.revisionId)) {
        throw new ForbiddenError(LINK_MISSING);
      }
      const links = await findLineLinks(viewer, [input.lineId], innerTx);
      const lineLinks = links.get(input.lineId);
      const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
      if (!dual.allowed) throw new GateBlockedError(dual.reason);
      if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
      const room = lineRoom({ links, basis: pre.lineRoom, lineId: input.lineId, exclude: pre.capExclude });
      // Q-E: 고정 연결이고 잠근 프로젝트 행이 완료면 초과를 막지 않고(settled) 초과액을 돌려준다 — 판정은 잠근 행으로(X-2).
      const capInput = {
        execution: lineLinks.currentExecution,
        otherSupplies: room.otherSupplies,
        supply: { currency: "KRW", amount: split.supplyKrw, fxRate: 1 },
        source: pre.linkFixed && project.status === "completed" ? "settled" : "entry",
      } as const;
      const cap = await gate(null, "card.execution-cap", { ...capInput, link: pre.capLink ?? "pickable", pmName: pre.pmName, amountVisible: pre.amountVisible });
      if (!cap.allowed) throw new GateBlockedError(cap.reason);
      if (capInput.source === "settled") {
        const settled = cardExecutionCap(capInput);
        capOver = settled.exceeds ? diffKrw(split.supplyKrw, settled.remaining.amountKrw) : null;
      }
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
        purchaseRequestId: pre.registeredVia === "purchase" ? (input.purchaseRequestId ?? null) : null,
        memo: input.memo ?? null,
      },
      innerTx,
    );
    await recordAction(viewer, { actionType: "document_create", entity: CARD_USAGE_ENTITY, entityId: row.id }, { tx: innerTx });
    return { id: row.id, totalKrw: row.totalAmountKrw, capOver };
  };
  return tx ? await runCreate(tx) : await withTransaction(runCreate);
}

// ── 수정 · 권리(06-09 — O-11 · B-1 · Q3 · E-9) ─────────────────────────────

/** `total`이 null이면 저장된 결제 합계를 그대로 둔다 — 금액을 못 보는 사람(`card_usage.amount` 숨김)은 보내도 덮어쓰지 않는다(DOM D-3). */
type WithOptionalTotal<T> = T extends unknown ? Omit<T, "total"> & { total: MoneyInput | null } : never;
export type CardUsageUpdateInput = WithOptionalTotal<CardUsageInput> & { id: string; version: number };

/** 잡을 프로젝트 행 하나 — `revisionId`가 있으면 잠근 뒤 최신 차수를 다시 본다(새 연결), `allowCompleted`면 완료도 지난다(권한자 — U-4). */
export type CardUsageProjectLock = { projectId: string; revisionId?: string; allowCompleted: boolean };

/** 수정 사전 조회 결과(06-03 tx 규약) — 새 건의 `pre`에 수정 갈래 사실을 더한다. */
export type CardUsageUpdatePre = Omit<CardUsagePre, "card" | "registeredVia"> & {
  usageId: string;
  /** 사용한 사람이 바뀌면 같이 맞춘다(DB self_check) — 구매 완료 건은 그대로 `purchase`. */
  registeredVia: "self" | "proxy" | "purchase";
  /** 사용한 사람을 바꾼 수정이면 수정한 사람(I-2), 아니면 저장된 등록자. */
  registeredBy: string;
  /** 저장할 결제 합계 — 요청 값, 또는 금액을 보내지 않았거나 못 보는 사람이면 저장된 값. */
  total: MoneyInput;
  /** 반환 값에 결제 합계를 실어도 되는가(`card_usage.amount`). */
  amountShown: boolean;
  /** 연결 그대로(고정 연결 — N-1 · N-2)인가. */
  linkFixed: boolean;
  /** 권한자면 참 — 연결 그대로의 대상 줄 · 연결 바꾸기의 옛 줄 프로젝트 잠금에 쓴다(새로 잇는 견적 줄은 권한자에게도 거짓). */
  completedAllowed: boolean;
  /** 몸통 첫 줄이 차례로 잡을 프로젝트 행 — 프로젝트 id 오름차순 · 중복 없음(06-07 B-1 · E-9). */
  lockProjects: CardUsageProjectLock[];
  /** 06-12 카드 고치기(구매 완료 건 · 권리 + 구매 권한 + 활성 새 카드) — 새 카드 id와 로그 요약의 카드 글자. 카드 그대로면 null. */
  cardChange: { id: string; from: string; to: string } | null;
};

function rightsOf(stored: CardUsageForWrite, viewer: Viewer, proxy: boolean): CardUsageRights {
  return cardUsageRights(
    { registeredBy: stored.registeredBy, registeredVia: stored.registeredVia, projectCompleted: stored.projectStatus === "completed" },
    { userId: viewer.id, proxy },
  );
}

// 연결 그대로 = 같은 견적 줄(견적 외 비용 줄 포함 — 폼은 그대로면 줄 id로 보낸다) 또는 팀 비용 → 팀 비용.
function sameLink(stored: CardUsageForWrite, input: CardUsageUpdateInput): boolean {
  if (stored.linkKind === "team_cost") return input.linkKind === "team_cost";
  return input.linkKind === "quote_line" && input.lineId === stored.quoteLineId;
}

// 프로젝트 행 목록(E-9) — 같은 프로젝트면 새 쪽(뒤 항목) 하나로 합치고 프로젝트 id 오름차순.
function projectLocks(entries: readonly CardUsageProjectLock[]): CardUsageProjectLock[] {
  const byProject = new Map<string, CardUsageProjectLock>();
  for (const entry of entries) byProject.set(entry.projectId, entry);
  return [...byProject.values()].sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
}

// 수정 사전 조회 — 트랜잭션 밖에서만. 건 → 권한 → 권리(O-11) → 카드 그대로 → 사용일 · 금액 → 사용한 사람 · 팀 → 증빙 · 가맹점 → 세율 → 연결.
export async function precheckCardUsageUpdate(viewer: Viewer, input: CardUsageUpdateInput): Promise<CardUsageUpdatePre> {
  const stored = await findCardUsageForWrite(viewer, input.id, { includeArchived: false });
  if (!stored) throw new CardUsageRejectedError(STALE_VERSION);
  const proxy = await can(viewer, "cards.proxy", "write");
  const rights = rightsOf(stored, viewer, proxy);
  const linkFixed = sameLink(stored, input);
  if (!rights.edit || (!linkFixed && !rights.changeLink)) throw new ForbiddenError(RIGHTS_DENIED);
  // 수정은 카드를 바꾸지 않는다 — 구매 완료 건만 권리(위) + 구매 권한 + 활성 새 카드일 때 카드 고치기(06-12, rights.ts 그대로).
  let cardChange: CardUsageUpdatePre["cardChange"] = null;
  if (input.corpCardId !== stored.corpCardId) {
    const purchases = stored.registeredVia === "purchase" && (await can(viewer, "cards.purchases", "write"));
    const next = purchases ? (await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false })).find((candidate) => candidate.id === input.corpCardId) : undefined;
    if (!next) throw new ForbiddenError(CARD_NOT_ELIGIBLE);
    cardChange = { id: next.id, from: cardLabel({ label: stored.cardLabel, issuer: stored.cardIssuer, numberLast4: stored.cardLast4 }), to: cardLabel(next) };
  }
  const amountShown = await visible(viewer, "card_usage.amount");
  const storedTotal: MoneyInput =
    stored.totalForeignAmount === null
      ? { currency: "KRW", amount: stored.totalAmountKrw, fxRate: 1 }
      : { currency: stored.totalCurrency as MoneyInput["currency"], amount: Number(stored.totalForeignAmount), fxRate: Number(stored.totalFxRate) };
  const total = amountShown && input.total !== null ? input.total : storedTotal;
  const resolved: CardUsageInput = { ...input, total };
  assertUsageBasics(resolved);
  // 카드 자격(U-2 · B-1) — 권한자가 아니면 새 건과 같은 판정: 사용일 소속으로 이 카드를 쓸 수 있어야 한다. 구매 완료 건은 06-12.
  const teamOnUsedOn = await teamIdOn(viewer, input.usedOn);
  if (!proxy && stored.registeredVia !== "purchase" && !(await eligibleCards(viewer, teamOnUsedOn)).some((candidate) => candidate.card.id === stored.corpCardId)) {
    throw new ForbiddenError(CARD_NOT_ELIGIBLE);
  }
  const card = { id: stored.corpCardId, kind: stored.cardKind, holderUserId: stored.cardHolderUserId };
  const usedBy = await resolveUsedBy(viewer, { proxy, card, linkKind: input.linkKind, usedOn: input.usedOn, requested: input.usedByUserId ?? null, fallback: stored.usedByUserId });
  const evidenceRule = await checkEvidenceAndMerchant(viewer, resolved);
  const rates = await loadTaxRates(input.usedOn);
  // 등록 경로(I-1 · I-2): 사용한 사람이 그대로면 저장된 경로 · 등록자 그대로. 바뀌면(권한자의 수정) 그 수정을 새 등록으로 보고
  // 등록자 = 수정한 사람 · 경로는 새 건과 같은 판정 — 원래 등록자의 권리는 사라진다(행동 로그에 남음). 구매 완료 건은 그대로.
  const usedByChanged = stored.registeredVia !== "purchase" && usedBy.usedByUserId !== stored.usedByUserId;
  const registeredBy = usedByChanged ? viewer.id : stored.registeredBy;
  const own = isOwnCard({ kind: stored.cardKind, holderUserId: stored.cardHolderUserId, teamId: stored.cardTeamId }, viewer.id, teamOnUsedOn);
  const registeredVia: CardUsageUpdatePre["registeredVia"] = usedByChanged
    ? viaOf({ kind: stored.cardKind, own }, usedBy.usedByUserId, viewer.id)
    : stored.registeredVia === "purchase" || stored.registeredVia === "proxy"
      ? stored.registeredVia
      : "self";
  const base = { usageId: stored.id, registeredVia, registeredBy, total, amountShown, usedByUserId: usedBy.usedByUserId, teamId: usedBy.teamId, evidenceRule, rates, capExclude: { usageId: stored.id }, linkFixed, completedAllowed: proxy, cardChange };

  if (linkFixed) {
    if (input.linkKind !== "quote_line" || !stored.projectId) return { ...base, ...NO_LINK, lockProjects: [] };
    return {
      ...base,
      ...NO_LINK,
      projectId: stored.projectId,
      lineRoom: await loadLineRoomBasis(viewer, [input.lineId]),
      amountVisible: await visible(viewer, "quote.amount"),
      lockProjects: [{ projectId: stored.projectId, allowCompleted: proxy }],
    };
  }
  const oldLock: CardUsageProjectLock[] = stored.projectId ? [{ projectId: stored.projectId, allowCompleted: proxy }] : [];
  if (resolved.linkKind === "team_cost" || resolved.linkKind === null) return { ...base, ...NO_LINK, lockProjects: projectLocks(oldLock) };
  const link = await precheckLink(viewer, resolved, proxy);
  const newLock: CardUsageProjectLock[] =
    link.outOfQuote
      ? [{ projectId: link.outOfQuote.projectId, revisionId: link.outOfQuote.revisionId, allowCompleted: true }]
      : link.projectId && link.revisionId
        ? [{ projectId: link.projectId, revisionId: link.revisionId, allowCompleted: false }]
        : [];
  return { ...base, ...link, lockProjects: projectLocks([...oldLock, ...newLock]) };
}

export async function updateCardUsage(
  viewer: Viewer,
  input: CardUsageUpdateInput,
  pre: CardUsageUpdatePre,
  tx?: DbOrTx,
): Promise<UpdatedCardUsage> {
  const runUpdate = async (innerTx: DbOrTx) => {
    // 순서 고정(B-1 · X-2 · E-9 · N-3): 프로젝트 행(id 오름차순) → 견적 줄 → 연결(계보) → 이중 연결 → 실행가 상한 → 조건 UPDATE.
    const lockedProjects = new Map<string, ProjectRow>();
    for (const lock of pre.lockProjects) lockedProjects.set(lock.projectId, await lockProjectForLinkWrite(viewer, lock, innerTx));
    const total = normalizeMoneyInput(pre.total);
    const money = moneyToColumns(total);
    const split = splitCardTotal({ money: total, rule: pre.evidenceRule }, pre.rates);
    let link: { linkKind: CardUsageLinkKind; quoteLineId: string | null; teamId: string | null } = { linkKind: "team_cost", quoteLineId: null, teamId: pre.teamId };
    if (input.linkKind === "quote_line") {
      if (!pre.projectId || !pre.lineRoom) throw new CardUsageRejectedError(LINK_MISSING);
      const lineId = input.lineId;
      const current = pre.linkFixed ? await currentLineForFixedLink(viewer, { projectId: pre.projectId, lineId }, innerTx) : null;
      const locked = await lockQuoteLines(viewer, current ? [lineId, current] : [lineId], innerTx);
      const target = locked.find((row) => row.id === lineId);
      // 새로 잇는 줄 — 화면이 내보내지 않는 줄(조정 · 취소 · 보관 · 현재 차수 밖)은 거부(새 건과 같다).
      if (!target || (!pre.linkFixed && (target.lineKind === "adjustment" || target.lineStatus === "cancelled" || target.archivedAt || target.revisionId !== pre.revisionId))) {
        throw new ForbiddenError(LINK_MISSING);
      }
      const links = await findLineLinks(viewer, [lineId], innerTx);
      const lineLinks = links.get(lineId);
      const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
      if (!dual.allowed) throw new GateBlockedError(dual.reason);
      if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
      const cap = await gate(null, "card.execution-cap", {
        execution: lineLinks.currentExecution,
        otherSupplies: lineRoom({ links, basis: pre.lineRoom, lineId, exclude: pre.capExclude }).otherSupplies,
        supply: { currency: "KRW", amount: split.supplyKrw, fxRate: 1 },
        source: "entry",
        link: "pickable",
        amountVisible: pre.amountVisible,
      });
      if (!cap.allowed) throw new GateBlockedError(cap.reason);
      link = { linkKind: "quote_line", quoteLineId: lineId, teamId: null };
    } else if (input.linkKind === "out_of_quote") {
      // 견적 외 비용으로 바꾸기(X-6): 첫 줄이 잠근 그 프로젝트 행으로 04 줄 편집 게이트 → 새 줄(실행가 = 공급가 — 상한 없음).
      const out = pre.outOfQuote;
      const project = out ? lockedProjects.get(out.projectId) : undefined;
      if (!out || !project) throw new CardUsageRejectedError(LINK_MISSING);
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
    const version = await updateCardUsageRow(
      viewer,
      {
        id: pre.usageId,
        version: input.version,
        values: {
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
          registeredBy: pre.registeredBy,
          registeredVia: pre.registeredVia,
          memo: input.memo ?? null,
          ...(pre.cardChange ? { corpCardId: pre.cardChange.id } : {}),
        },
      },
      innerTx,
    );
    if (version === null) throw new CardUsageRejectedError(STALE_VERSION);
    const detail = pre.cardChange ? { detail: { summary: `카드 고침 · ${pre.cardChange.from} → ${pre.cardChange.to}` } } : {};
    await recordAction(viewer, { actionType: "document_update", entity: CARD_USAGE_ENTITY, entityId: pre.usageId, ...detail }, { tx: innerTx });
    return { id: pre.usageId, totalKrw: pre.amountShown ? split.totalKrw : null };
  };
  return tx ? await runUpdate(tx) : await withTransaction(runUpdate);
}

// ── 삭제(= 보관) · 되돌리기(= 보관 해제) — D-609 · E-9 · X-1 · X-2 · N-1 · N-2 ─────────

/** 삭제 · 되돌리기 사전 조회(06-03 tx 규약) — 권리 · 연결 줄의 프로젝트 · 상한 바탕을 트랜잭션 전에. */
export type CardUsageRemovalPre = {
  usageId: string;
  /** 견적 줄(견적 외 비용 줄 포함) 연결이면 그 줄 · 프로젝트 — 팀 비용이면 null. */
  lineId: string | null;
  projectId: string | null;
  /** 권한자면 참 — 완료 프로젝트 줄 건도 지우고 되살린다(O-11 · U-4). */
  completedAllowed: boolean;
  /** 되돌리기 상한 바탕(삭제는 읽지 않는다). */
  lineRoom: LineRoomBasis | null;
  amountVisible: boolean;
  supplyKrw: number;
  /** 결과 줄 금액 — 결제 합계를 못 보는 사람(`card_usage.amount` 숨김)에게는 null(DOM D-1). */
  totalKrw: number | null;
};

export type CardUsageRemovalResult = { version: number; totalKrw: number | null };

// 트랜잭션 밖에서만. 건(보관 포함) → 권한 → 권리(O-11 — 삭제 권리) → 연결 줄 · 프로젝트 · 상한 바탕.
export async function precheckCardUsageRemoval(viewer: Viewer, input: { id: string }): Promise<CardUsageRemovalPre> {
  const stored = UUID_SHAPE.test(input.id) ? await findCardUsageForWrite(viewer, input.id, { includeArchived: true }) : null;
  if (!stored) throw new CardUsageRejectedError(STALE_VERSION);
  const proxy = await can(viewer, "cards.proxy", "write");
  if (!rightsOf(stored, viewer, proxy).delete) throw new ForbiddenError(RIGHTS_DENIED);
  const linked = stored.linkKind === "quote_line" && stored.quoteLineId !== null && stored.projectId !== null;
  return {
    usageId: stored.id,
    lineId: linked ? stored.quoteLineId : null,
    projectId: linked ? stored.projectId : null,
    completedAllowed: proxy,
    lineRoom: linked && stored.quoteLineId ? await loadLineRoomBasis(viewer, [stored.quoteLineId]) : null,
    amountVisible: linked ? await visible(viewer, "quote.amount") : false,
    supplyKrw: stored.supplyKrw,
    totalKrw: (await visible(viewer, "card_usage.amount")) ? stored.totalAmountKrw : null,
  };
}

export async function deleteCardUsage(
  viewer: Viewer,
  input: { id: string; version: number },
  pre: CardUsageRemovalPre,
  tx?: DbOrTx,
): Promise<CardUsageRemovalResult> {
  const runDelete = async (innerTx: DbOrTx) => {
    // 견적 줄 건 — 프로젝트 행 먼저(E-9 · X-2): 정산 최종 승인과 같은 행에서 줄을 선다. 줄이는 쪽이라 줄 잠금 · 상한은 없다.
    if (pre.projectId) await lockProjectForLinkWrite(viewer, { projectId: pre.projectId, allowCompleted: pre.completedAllowed }, innerTx);
    const version = await archiveCardUsageRow(viewer, { id: pre.usageId, version: input.version }, innerTx);
    if (version === null) throw new CardUsageRejectedError(STALE_VERSION);
    await recordAction(viewer, { actionType: "document_delete", entity: CARD_USAGE_ENTITY, entityId: pre.usageId }, { tx: innerTx });
    return { version, totalKrw: pre.totalKrw };
  };
  return tx ? await runDelete(tx) : await withTransaction(runDelete);
}

export async function restoreCardUsage(
  viewer: Viewer,
  input: { id: string; version: number },
  pre: CardUsageRemovalPre,
  tx?: DbOrTx,
): Promise<CardUsageRemovalResult> {
  const runRestore = async (innerTx: DbOrTx) => {
    // 순서 고정(B-1 · X-2 · N-1): 프로젝트 행 → 사슬의 현재 줄 → 견적 줄(한 호출) → 연결(계보) → 이중 연결 → 실행가 상한 → 보관 해제.
    if (pre.projectId && pre.lineId) {
      if (!pre.lineRoom) throw new CardUsageRejectedError(LINK_MISSING);
      const lineId = pre.lineId;
      await lockProjectForLinkWrite(viewer, { projectId: pre.projectId, allowCompleted: pre.completedAllowed }, innerTx);
      const current = await currentLineForFixedLink(viewer, { projectId: pre.projectId, lineId }, innerTx);
      await lockQuoteLines(viewer, current === lineId ? [lineId] : [lineId, current], innerTx);
      const links = await findLineLinks(viewer, [lineId], innerTx);
      const lineLinks = links.get(lineId);
      const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
      if (!dual.allowed) throw new GateBlockedError(dual.reason);
      if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
      const cap = await gate(null, "card.execution-cap", {
        execution: lineLinks.currentExecution,
        otherSupplies: lineRoom({ links, basis: pre.lineRoom, lineId, exclude: {} }).otherSupplies,
        supply: { currency: "KRW", amount: pre.supplyKrw, fxRate: 1 },
        source: "entry",
        link: "pickable",
        amountVisible: pre.amountVisible,
      });
      if (!cap.allowed) throw new GateBlockedError(cap.reason);
    }
    const version = await restoreCardUsageRow(viewer, { id: pre.usageId, version: input.version }, innerTx);
    if (version === null) throw new CardUsageRejectedError(STALE_VERSION);
    await recordAction(viewer, { actionType: "restore", entity: CARD_USAGE_ENTITY, entityId: pre.usageId }, { tx: innerTx });
    return { version, totalKrw: pre.totalKrw };
  };
  return tx ? await runRestore(tx) : await withTransaction(runRestore);
}

// ── 수정 패널 로드(`?editId=`) ──────────────────────────────────────────────

export type CardUsageEditDto = {
  id: string;
  version: number;
  /** 저장된 카드 읽기 텍스트 `{카드 이름} · {발급사} {뒤 4자리}`. */
  cardId: string;
  cardText: string;
  /** 저장된 등록 표시(대리 등록이면 `경영관리 등록 · 카드 소지자 {이름}`) — 여는 사람 기준으로 다시 판정하지 않는다. */
  proxyHint: string | null;
  cardKind: string;
  registeredVia: string;
  usedOn: string;
  merchantId: string | null;
  merchantName: string | null;
  evidenceTypeCode: string;
  /** 저장된 증빙 종류 이름 — 지금 카드 옵션에 없을 때의 막힘 문구(UI-SPEC S9). */
  evidenceLabel: string;
  linkKind: "team_cost" | "quote_line" | "out_of_quote";
  usedByUserId: string;
  /** 대리 등록 권한자 · 팀 또는 공용 카드 — 팀 비용이면 `사용한 사람` 칸. */
  choosesUser: boolean;
  memo: string | null;
  currency: string;
  /** 결제 합계 입력값 — 원화면 원화 합계, 외화면 외화 금액. */
  amount: number;
  fxRate: number;
  projectId: string | null;
  projectLabel: string | null;
  lineId: string | null;
  lineItemName: string | null;
  /** 이 건을 뺀 남은 실행가(Q3) · 힌트 — 견적 금액을 볼 때만. */
  lineRemainingKrw: number | null;
  lineHint: string | null;
};

const EDIT_VALUE_KEYS = [
  "id",
  "version",
  "cardId",
  "cardText",
  "proxyHint",
  "cardKind",
  "registeredVia",
  "usedOn",
  "merchantId",
  "merchantName",
  "evidenceTypeCode",
  "evidenceLabel",
  "linkKind",
  "usedByUserId",
  "choosesUser",
  "memo",
] as const;

const CARD_USAGE_EDIT_DTO_SPEC: DtoSpec<CardUsageEditDto, CardUsageEditDto> = {
  fields: [
    ...EDIT_VALUE_KEYS.map((key) => ({ key, from: key, infoItem: "card_usage.value" })),
    ...(["currency", "amount", "fxRate"] as const).map((key) => ({ key, from: key, infoItem: "card_usage.amount" })),
    // 연결(프로젝트 · 줄)은 카드 사용 값과 프로젝트 값을 둘 다 볼 때만(all-of — 목록 연결 칸과 같다).
    ...(["projectId", "projectLabel", "lineId", "lineItemName"] as const).map((key) => ({ key, from: key, infoItem: ["card_usage.value", "project.value"] })),
    ...(["lineRemainingKrw", "lineHint"] as const).map((key) => ({ key, from: key, infoItem: "quote.amount" })),
  ],
};

registerDto({ name: "CardUsageEditDto", fields: CARD_USAGE_EDIT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type CardUsageForEdit = {
  usage: Partial<CardUsageEditDto>;
  rights: CardUsageRights;
  /** 06-12 카드 고치기 — 구매 완료 건 + 구매 권한이면 활성 카드 전부(저장된 카드가 비활성이면 맨 앞), 그 밖은 null(카드 읽기 텍스트). */
  cardOptions: Partial<CardOptionDto>[] | null;
};

const ZERO_KRW: MoneyInput = { currency: "KRW", amount: 0, fxRate: 1 };

// 권리가 없거나 없는 건(보관 포함)이면 null — `?editId=`로 남의 건을 열 수 없다(T-06-44).
export async function loadCardUsageForEdit(viewer: Viewer, id: string): Promise<CardUsageForEdit | null> {
  if (!UUID_SHAPE.test(id)) return null;
  const stored = await findCardUsageForWrite(viewer, id, { includeArchived: false });
  if (!stored) return null;
  const proxy = await can(viewer, "cards.proxy", "write");
  const rights = rightsOf(stored, viewer, proxy);
  if (!rights.edit) return null;
  let line: Pick<CardUsageEditDto, "projectLabel" | "lineRemainingKrw" | "lineHint"> = { projectLabel: null, lineRemainingKrw: null, lineHint: null };
  if (stored.quoteLineId && stored.projectId) {
    const project = await findProjectById(viewer, stored.projectId);
    const links = await findLineLinks(viewer, [stored.quoteLineId]);
    const basis = await loadLineRoomBasis(viewer, [stored.quoteLineId]);
    const room = lineRoom({ links, basis, lineId: stored.quoteLineId, exclude: { usageId: stored.id } });
    const execution = links.get(stored.quoteLineId)?.currentExecution;
    const remaining = execution ? cardExecutionCap({ execution, otherSupplies: room.otherSupplies, supply: ZERO_KRW, source: "entry" }).remaining.amountKrw : null;
    line = {
      projectLabel: project ? `${project.number} ${project.name}` : null,
      lineRemainingKrw: remaining,
      lineHint: remaining === null ? null : lineRoomHint({ remaining, cards: room.cards, requests: room.requests }),
    };
  }
  const proxyHint =
    stored.registeredVia === "proxy"
      ? ((name) => (name === undefined ? null : `${PROXY_HINT} ${name}`))(
          (await proxyHolderNames(viewer, [{ id: stored.corpCardId, holderUserId: stored.cardHolderUserId, teamId: stored.cardTeamId }])).get(stored.corpCardId),
        )
      : null;
  const dto: CardUsageEditDto = {
    id: stored.id,
    version: stored.version,
    cardId: stored.corpCardId,
    cardText: cardLabel({ label: stored.cardLabel, issuer: stored.cardIssuer, numberLast4: stored.cardLast4 }),
    proxyHint,
    cardKind: stored.cardKind,
    registeredVia: stored.registeredVia,
    usedOn: stored.usedOn,
    merchantId: stored.merchantVendorId,
    merchantName: stored.merchantName,
    evidenceTypeCode: stored.evidenceTypeCode,
    evidenceLabel: (await cardEvidenceTypes(viewer)).labels.get(stored.evidenceTypeCode) ?? stored.evidenceTypeCode,
    linkKind: stored.linkKind === "team_cost" ? "team_cost" : stored.lineKind === "out_of_quote" ? "out_of_quote" : "quote_line",
    usedByUserId: stored.usedByUserId,
    choosesUser: proxy && !(stored.cardKind === "personal" && stored.cardHolderUserId === viewer.id),
    memo: stored.memo,
    currency: stored.totalCurrency,
    amount: stored.totalForeignAmount === null ? stored.totalAmountKrw : Number(stored.totalForeignAmount),
    fxRate: Number(stored.totalFxRate),
    projectId: stored.projectId,
    lineId: stored.quoteLineId,
    lineItemName: stored.lineItemName,
    ...line,
  };
  const [usage] = await projectMany(viewer, [dto], CARD_USAGE_EDIT_DTO_SPEC);
  let cardOptions: CardUsageForEdit["cardOptions"] = null;
  if (stored.registeredVia === "purchase" && (await can(viewer, "cards.purchases", "write"))) {
    const active = (await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false })).map((card) => ({ id: card.id, label: cardLabel(card) }));
    const options = active.some((card) => card.id === stored.corpCardId) ? active : [{ id: stored.corpCardId, label: dto.cardText }, ...active];
    cardOptions = await projectMany(viewer, options.map((card) => ({ ...card, proxyHint: null, choosesUser: false })), CARD_OPTION_SPEC);
  }
  return { usage: usage ?? {}, rights, cardOptions };
}

// ── 서버 계산 한 줄(트랜잭션 없음) ─────────────────────────────────────────

export type CardAmountsPreview = {
  /** 결제 합계 · 증빙 종류가 계산할 수 있는 값일 때만. */
  split: (CardSplit & { ruleKind: TaxRule["ruleKind"]; evidenceLabel: string }) | null;
  /** 사용일 소속 팀 이름 — 「팀 비용」 읽기 텍스트(노출이 꺼지면 null). */
  teamName: string | null;
  /** 사용일 소속 발령이 있는가 — 「소속 없음」 막힘은 이것으로만(이름 노출과 무관). */
  teamAssigned: boolean;
  /** 사용일 기준 쓸 카드 — 카드 자격은 사용일 소속으로 정해져 폼이 사용일을 바꾸면 선택지를 이것으로 바꾼다. */
  cards: Partial<CardOptionDto>[];
};

export async function previewCardAmounts(
  viewer: Viewer,
  input: { usedOn: string; total: MoneyInput | null; evidenceTypeCode: string | null },
): Promise<CardAmountsPreview> {
  const team = await teamAtDate(viewer, viewer.id, input.usedOn);
  const teamName = team?.name ?? null;
  const teamAssigned = (await teamIdOn(viewer, input.usedOn)) !== null;
  const usable = await cardOptionsForUsage(viewer, input.usedOn);
  const cards = await projectMany(viewer, usable.map((card) => ({ id: card.id, label: card.label, proxyHint: card.proxyHint, choosesUser: card.choosesUser })), CARD_OPTION_SPEC);
  if (!input.total || !input.evidenceTypeCode) return { split: null, teamName, teamAssigned, cards };
  const option = (await cardEvidenceTypes(viewer)).options.find((candidate) => candidate.value === input.evidenceTypeCode);
  if (!option) return { split: null, teamName, teamAssigned, cards };
  const rates = await loadTaxRates(input.usedOn);
  const split = splitCardTotal({ money: input.total, rule: option.rule }, rates);
  return { split: { ...split, ruleKind: option.rule.ruleKind, evidenceLabel: option.label }, teamName, teamAssigned, cards };
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

/** `proxyHint` — 06-09 대리 등록 힌트(S9 카드 아래 `Form.Hint`) — 서버가 정한 글자, 없으면 null. `choosesUser` — `사용한 사람` 칸. */
export type CardOptionDto = { id: string; label: string; proxyHint: string | null; choosesUser: boolean };

const CARD_OPTION_SPEC: DtoSpec<CardOptionDto, CardOptionDto> = {
  fields: (["id", "label", "proxyHint", "choosesUser"] as const).map((key) => ({ key, from: key, infoItem: "card_usage.value" })),
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
    cards: await projectMany(viewer, cards.map((card) => ({ id: card.id, label: card.label, proxyHint: card.proxyHint, choosesUser: card.choosesUser })), CARD_OPTION_SPEC),
    evidenceTypes: evidence.options.map(({ value, label }) => ({ value, label })),
    teamName: team?.name ?? null,
    teamAssigned: (await teamIdOn(viewer, usedOn)) !== null,
    usdFxRate: await recentFxRate("USD").catch(() => null),
  };
}

// ── 06-12 구매 완료 패널(S13) — 카드 옵션 · 서버 계산 한 줄 ─────────────────────

export type PurchaseCardFormOptions = Omit<CardUsageFormOptions, "teamName" | "teamAssigned">;

// 구매 권한자의 카드 = 활성 카드 전부(공용 포함, Q5) — 본인 자격 · 대리 등록 힌트 없음(R-3).
export async function purchaseCardFormOptions(viewer: Viewer): Promise<PurchaseCardFormOptions> {
  if (!(await can(viewer, "cards.purchases", "write"))) throw new ForbiddenError(PURCHASE_DENIED);
  const cards = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const evidence = await cardEvidenceTypes(viewer);
  return {
    cards: await projectMany(viewer, cards.map((card) => ({ id: card.id, label: cardLabel(card), proxyHint: null, choosesUser: false })), CARD_OPTION_SPEC),
    evidenceTypes: evidence.options.map(({ value, label }) => ({ value, label })),
    usdFxRate: await recentFxRate("USD").catch(() => null),
  };
}

export type PurchaseCardPreview = Pick<CardAmountsPreview, "split" | "teamName" | "teamAssigned"> & {
  /** 견적 줄 요청의 실행가 상한 — 완료 아닌 프로젝트 초과면 막힘 문구(고정 갈래), 완료 프로젝트 초과면 초과액(Q-E — 금액을 볼 때만). */
  cap: { blockedReason: string | null; overKrw: number | null } | null;
};

// S13 서버 계산 한 줄(트랜잭션 없음 · 잠그지 않음 — 표시용). 팀 = 요청자의 사용일 소속(O-19), 상한 = 06-07 `card.execution-cap` `fixed`
// (이 요청 자신의 예상 공급가는 빼지 않는다 — 실제 결제 공급가로 판정). 저장은 `runCreate`가 잠근 뒤 다시 판정한다.
export async function previewPurchaseCard(
  viewer: Viewer,
  input: { requestId: string; requesterId: string; lineId: string | null; usedOn: string; total: MoneyInput | null; evidenceTypeCode: string | null },
): Promise<PurchaseCardPreview> {
  if (!(await can(viewer, "cards.purchases", "write"))) throw new ForbiddenError(PURCHASE_DENIED);
  const teamAssigned = (await findMembershipAtDate(viewer, input.requesterId, input.usedOn)) !== null;
  const teamName = input.lineId ? null : ((await teamAtDate(viewer, input.requesterId, input.usedOn))?.name ?? null);
  const option = input.evidenceTypeCode ? (await cardEvidenceTypes(viewer)).options.find((candidate) => candidate.value === input.evidenceTypeCode) : undefined;
  if (!input.total || !option) return { split: null, teamName, teamAssigned, cap: null };
  const split = splitCardTotal({ money: input.total, rule: option.rule }, await loadTaxRates(input.usedOn));
  const shown = { split: { ...split, ruleKind: option.rule.ruleKind, evidenceLabel: option.label }, teamName, teamAssigned };
  if (!input.lineId) return { ...shown, cap: null };
  const link = await precheckPurchaseLink(viewer, input.lineId, input.requestId);
  const project = link.projectId ? await findProjectById(viewer, link.projectId) : null;
  const links = await findLineLinks(viewer, [input.lineId]);
  const execution = links.get(input.lineId)?.currentExecution;
  if (!project || !link.lineRoom || !execution) return { ...shown, cap: null };
  const capInput = {
    execution,
    otherSupplies: lineRoom({ links, basis: link.lineRoom, lineId: input.lineId, exclude: link.capExclude }).otherSupplies,
    supply: { currency: "KRW", amount: split.supplyKrw, fxRate: 1 },
    source: project.status === "completed" ? "settled" : "entry",
  } as const;
  if (capInput.source === "settled") {
    const settled = cardExecutionCap(capInput);
    return { ...shown, cap: { blockedReason: null, overKrw: settled.exceeds && link.amountVisible ? diffKrw(split.supplyKrw, settled.remaining.amountKrw) : null } };
  }
  const decision = await gate(null, "card.execution-cap", { ...capInput, link: "fixed", pmName: link.pmName, amountVisible: link.amountVisible });
  return { ...shown, cap: { blockedReason: decision.allowed ? null : decision.reason, overKrw: null } };
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
  /** 06-12 구매 완료로 생긴 건의 구매 요청 번호 — 등록 칸 `구매 요청 {번호}`. 아니면 null. */
  purchaseNumber: string | null;
  /** 연결 칸(S8) — `{프로젝트} · {줄 번호} {항목}` / `{프로젝트} · 견적 외 비용 · {항목}`. 팀 비용이면 null. */
  linkLabel: string | null;
  memo: string | null;
  currency: string;
  foreignAmount: number | null;
  fxRate: number;
  totalKrw: number;
  supplyKrw: number;
  vatKrw: number;
  /** 06-09 수정 · 연결 변경 · 삭제 권리(O-11) — 행동 칸 · 폰 행 탭이 이 값만 쓴다. */
  rights: CardUsageRights;
  /** 06-09 삭제(version 조건 UPDATE)의 기준. */
  version: number;
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
  "purchaseNumber",
  "memo",
  "rights",
  "version",
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

function toProjectable(row: CardUsageListRow, lineNo: Map<string, number>, rights: CardUsageRights): CardUsageListProjectable {
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
    purchaseNumber: row.purchaseNumber,
    linkLabel: cardLinkLabel(row, lineNo),
    memo: row.memo,
    currency: row.totalCurrency,
    foreignAmount: row.totalForeignAmount === null ? null : Number(row.totalForeignAmount),
    fxRate: Number(row.totalFxRate),
    totalKrw: row.totalAmountKrw,
    supplyKrw: row.supplyKrw,
    vatKrw: row.vatKrw,
    rights,
    version: row.version,
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
async function listAccess(viewer: Viewer, today: string): Promise<{ scope: CardUsageScope; privileged: boolean; proxy: boolean }> {
  const proxy = await can(viewer, "cards.proxy", "write");
  const privileged = proxy || (await can(viewer, "expenses.payments", "write"));
  const actor = await loadActorTeamScope(viewer, { todayKst: today });
  if (privileged || actor.workScope === "company") return { scope: { kind: "all" }, privileged, proxy };
  return { scope: { kind: "own", userId: viewer.id, teamId: actor.teamId }, privileged, proxy };
}

async function cardChoicesFor(viewer: Viewer, scope: CardUsageScope): Promise<Partial<CardOptionDto>[]> {
  const cards = await listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: true });
  const inScope =
    scope.kind === "all" ? cards : cards.filter((card) => card.holderUserId === scope.userId || (scope.teamId !== null && card.teamId === scope.teamId));
  return projectMany(viewer, inScope.map((card) => ({ id: card.id, label: cardLabel(card), proxyHint: null, choosesUser: false })), CARD_OPTION_SPEC);
}

export async function listCardUsages(viewer: Viewer, filters: CardUsageListFilters, today: string): Promise<CardUsageList> {
  const { scope, privileged, proxy } = await listAccess(viewer, today);
  const filter: CardUsageFilter = {
    ...monthRange(filters.month),
    ...(filters.cardId ? { cardId: filters.cardId } : {}),
    ...(filters.link ? { link: filters.link } : {}),
    ...(privileged && filters.proxyOnly ? { proxyOnly: true } : {}),
  };
  // 판정(can · 소속)은 위에서 끝내고 트랜잭션 안에서는 목록 쿼리 하나만 — lock_timeout(5s)이 잠금 대기를 끊는다(로드 오류 갈래).
  const rows = await withTransaction((tx) => listCardUsageRows(viewer, { scope, filter }, tx));
  const lineNo = await lineNumbers(viewer, rows.flatMap((row) => (row.lineRevisionId ? [row.lineRevisionId] : [])));
  // 권리(O-11)는 목록당 한 번 구한 `proxy`로 행마다 같은 함수에서.
  const rightsFor = (row: CardUsageListRow) =>
    cardUsageRights({ registeredBy: row.registeredBy, registeredVia: row.registeredVia, projectCompleted: row.projectStatus === "completed" }, { userId: viewer.id, proxy });
  const projected = await projectMany(viewer, rows.map((row) => toProjectable(row, lineNo, rightsFor(row))), CARD_USAGE_LIST_DTO_SPEC);
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
  const proxy = await can(viewer, "cards.proxy", "write");
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
  const outOfQuote = last.lineKind === "out_of_quote";
  // 완료 프로젝트의 견적 외 비용은 권한자에게만 다시 채운다(U-4 — 저장 판정과 같다).
  const project = last.projectId ? await cardLinkProjectChoice(viewer, last.projectId, { completedOutOfQuote: proxy && outOfQuote }) : null;
  return { ...base, linkKind: outOfQuote ? "out_of_quote" : "quote_line", project, line: null };
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
  /** 06-12 구매 완료로 생긴 건의 구매 요청 번호 — 아니면 null. */
  purchaseNumber: string | null;
  totalKrw: number;
  supplyKrw: number;
  /** 06-09 권리(O-11) — 폰 행 탭이 수정 패널로 가는가. */
  rights: CardUsageRights;
};

export type ProjectCardUsageTotalsDto = { count: number; totalKrw: number };

// 금액 칸 · 합계 행의 결제 합계 = 견적 표 금액 열과 같은 `quote.amount`(새 정보 항목 없음), 나머지는 `project.value`.
const PROJECT_CARD_USAGE_DTO_SPEC: DtoSpec<ProjectCardUsageDto, ProjectCardUsageDto> = {
  fields: [
    ...(["id", "usedOn", "lineLabel", "merchantName", "registeredVia", "registeredByName", "registeredOn", "purchaseNumber", "rights"] as const).map((key) => ({
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
  const proxy = await can(viewer, "cards.proxy", "write");
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
      purchaseNumber: row.purchaseNumber,
      totalKrw: row.totalAmountKrw,
      supplyKrw: row.supplyKrw,
      rights: cardUsageRights(
        { registeredBy: row.registeredBy, registeredVia: row.registeredVia, projectCompleted: projectRow.status === "completed" },
        { userId: viewer.id, proxy },
      ),
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
