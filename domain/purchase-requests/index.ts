import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { diffKrw, moneyToColumns, normalizeMoneyInput, sumKrw, toKrw, type MoneyInput } from "@/domain/money";
import {
  createCardUsage,
  precheckCardUsage,
  previewPurchaseCard,
  purchaseCardFormOptions,
  type CardUsageInput,
  type CardUsagePre,
  type PurchaseCardFormOptions,
  type PurchaseCardPreview,
} from "@/domain/corp-card-usages";
import { PICK_VENDOR_OPTION_SPEC, type PickVendorOptionDto } from "@/domain/expenses/pick";
import { normalizeVendorName } from "@/domain/vendors";
import { vendorKindsFor } from "@/domain/vendors/kind";
import { formatKrw } from "@/lib/format-number";
import { cardExecutionCap } from "@/domain/corp-card-usages/amounts";
import {
  CARD_LINK_LINE_SPEC,
  cardLinkProjectChoice,
  currentLineForFixedLink,
  lineRoom,
  lineRoomHint,
  loadLineRoomBasis,
  lockProjectForLinkWrite,
  projectLinkLock,
  purchaseEstimateSupply,
  type CardLinkLineDto,
  type CardLinkProjectChoice,
  type LineRoomBasis,
} from "@/domain/corp-card-usages/link-targets";
import {
  allocateDocumentNumber,
  allocatePurchaseRequestNumber,
  loadDocumentNumberFormat,
  loadPurchaseRequestNumberFormat,
  type DocumentNumberFormat,
  type PurchaseRequestNumberFormat,
} from "@/domain/document-numbering";
import { codeLabelsOf, lineExecution, numberedSupplyText } from "@/domain/expenses";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { CompletedProjectError } from "@/domain/projects";
import { ProjectNotFoundError } from "@/domain/projects/status";
import { resolveLineDoor } from "@/domain/quotes/line-door";
import { quoteLockReason } from "@/domain/quotes/edit-scope";
import { REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_MAX, REJECT_REASON_TOO_LONG_MESSAGE } from "@/domain/approvals";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { getSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import { seoulToday } from "@/lib/dates";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findExpenseApprovalStatuses } from "@/repositories/expenses";
import { findProjectById, findProjectInScope } from "@/repositories/projects";
import { projectRowScope } from "@/domain/projects/visibility";
import { findLatestQuoteRevision, findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findQuoteLineById, listQuoteLinesByRevisions } from "@/repositories/quote-lines";
import { findLineLinks, lockQuoteLines } from "@/repositories/quote-line-links";
import { findVendorNamesByIds, listVendorsForPick } from "@/repositories/vendors";
import { findUserNamesByIds } from "@/repositories/users";
import { findMembershipAtDate } from "@/repositories/team-memberships";
import { teamAtDate } from "@/domain/org";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findPurchaseRequestById,
  insertPurchaseRequest,
  listPurchaseRequestEstimates,
  listPurchaseRequestRows,
  lockPurchaseRequestForUpdate,
  markPurchaseRequestCancelled,
  markPurchaseRequestPurchased,
  markPurchaseRequestRequested,
  readLockedLineFacts,
  type PurchaseRequestFilter,
  type PurchaseRequestListRow,
  type PurchaseRequestScope,
} from "@/repositories/purchase-requests";

// 06-08(EXP-10 · D-609 · Q3 · GA-38 · X-2 · CROSS E-2): 구매 요청 신청 경로 — 온라인구매 견적 줄에 이은 요청이 문 판정 · 이중 연결 ·
// 실행가 상한(Q3)을 잠금 뒤에 지나 번호를 받는다. 구매 완료(카드 사용 생성)는 06-12, 팀 비용 · 취소 · 외화는 06-14가 이 위에 더한다.
//
// 06-03 tx 규약: 생성은 두 단계다. `precheckPurchaseRequest`(트랜잭션 밖)가 전역 풀을 읽는 판정 · 조회(권한 · 설정 · 번호 서식 · 세율 ·
// 거래처 기본 증빙 종류 · 완료 판정)를 끝내 `pre`로 넘기고, `createPurchaseRequest`의 몸통 `runCreate`는 `pre`의 값 · 순수 함수 · tx를 받는
// 리포지토리 · 게이트 · 같은 tx의 `recordAction`만 부른다.

export const PURCHASE_REQUEST_ENTITY = "purchase_request";

export class PurchaseRequestRejectedError extends UserFacingError {}

const PROJECTS_VIEW_DENIED = "프로젝트 보기 권한 없음";
const LINK_MISSING = "연결 없음 · 연결 고르기";
const AMOUNT_NOT_NUMBER = "숫자 아님 · 1,240,000처럼";
const ESTIMATE_NOT_POSITIVE = "예상 금액 0 이하 · 금액 고치기";
const ITEM_MISSING = "품목 없음 · 품목 적기";
export const LINK_URL_FORMAT = "링크 형식 오류 · https://로 시작하는 주소";
const LINK_PICK_LIMIT = 50;
const TEAM_COUNTER_KEY = "purchase_request_team";

// 05 `domain/expenses/pick.ts`의 비공개 결재 상태 낱말 표와 같은 값(06-07 `link-targets.ts`도 같은 사본을 둔다).
const APPROVAL_STATUS_WORDS: Record<string, string> = { submitted: "결재 중", in_review: "결재 중", approved: "승인", rejected: "반려", withdrawn: "회수" };

// 06-14: 연결이 판별 합이다 — 견적 줄(`quote_line` + `lineId`) / 팀 비용(`team_cost`). 팀 비용 요청에는 팀 · 사용한 사람 칸이 없다 —
// 팀은 구매 완료 사용일의 요청자 소속이다(O-19 — 06-12).
type PurchaseRequestFields = {
  itemName: string;
  linkUrl: string | null;
  estimate: MoneyInput;
  memo: string | null;
};
export type PurchaseRequestInput =
  | (PurchaseRequestFields & { linkKind: "quote_line"; lineId: string })
  | (PurchaseRequestFields & { linkKind: "team_cost" });

type PurchaseRequestPreFields = {
  estimate: MoneyInput;
  itemName: string;
  linkUrl: string | null;
};

/** 트랜잭션 전 사실 — 평범한 객체(06-03 tx 규약). */
export type PurchaseRequestPre =
  | (PurchaseRequestPreFields & {
      linkKind: "quote_line";
      projectId: string;
      /** 사전 조회 때의 현재 차수 — 잠근 뒤 다시 본다(X-2). */
      revisionId: string;
      /** 설정 `purchase.online_vendor_name` — 문 판정(`resolveLineDoor`)의 입력. */
      onlineVendorName: string;
      numberFormat: Omit<PurchaseRequestNumberFormat, "seqStart">;
      lineRoom: LineRoomBasis;
      /** 요청자의 견적 금액(quote.amount) 노출 — 실행가 초과 거부 문구의 남은 실행가 숫자(CSO-2). */
      amountVisible: boolean;
    })
  | (PurchaseRequestPreFields & {
      linkKind: "team_cost";
      /** 번호 연도(서울 오늘) · 서식(`purchase_request_team`) — 트랜잭션 전에 읽는다(풀 소진 교착). */
      year: number;
      numberFormat: Omit<DocumentNumberFormat, "seqStart">;
    });

// 링크는 http(s)만 — 쓰는 쪽(zod · 이 판정 · DB CHECK)이 같은 규칙이다(T-06-37). 비면 null.
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  if (!/^https?:\/\//i.test(text)) throw new PurchaseRequestRejectedError(LINK_URL_FORMAT);
  try {
    new URL(text);
  } catch {
    throw new PurchaseRequestRejectedError(LINK_URL_FORMAT);
  }
  return text;
}

// ── 사전 조회(트랜잭션 밖) ──────────────────────────────────────────────────

// 품목 · 링크 · 예상 금액 — 신청 · 신청 사전 조회가 같이 쓰는 순수 판정. 외화는 환율이 있어야 한다(`계산 불가` 요청이 없다 — T-06-69).
function normalizeRequestFields(input: PurchaseRequestFields): PurchaseRequestPreFields {
  const itemName = input.itemName.trim();
  if (itemName === "") throw new PurchaseRequestRejectedError(ITEM_MISSING);
  const linkUrl = normalizeLinkUrl(input.linkUrl);
  if (input.estimate.currency !== "KRW" && !(Number.isFinite(input.estimate.fxRate) && input.estimate.fxRate > 0)) {
    throw new PurchaseRequestRejectedError(fxMissing(input.estimate.currency));
  }
  const estimate = normalizeMoneyInput(input.estimate);
  if (estimate.currency === "KRW" && !Number.isInteger(estimate.amount)) throw new PurchaseRequestRejectedError(AMOUNT_NOT_NUMBER);
  if (toKrw(estimate) <= 0) throw new PurchaseRequestRejectedError(ESTIMATE_NOT_POSITIVE);
  return { itemName, linkUrl, estimate };
}

// 오늘 소속이 없으면 막힘 문구(팀 비용 요청 — 임의의 팀으로 떨어뜨리지 않는다), 있으면 null.
async function noTeamReason(viewer: Viewer, today: string): Promise<string | null> {
  if (await findMembershipAtDate(viewer, viewer.id, today)) return null;
  const name = (await findUserNamesByIds(viewer, [viewer.id])).get(viewer.id) ?? "";
  return `${name} ${today.slice(5)} 소속 없음 · 소속 발령은 관리자`;
}

function fxMissing(currency: string): string {
  return `환율 없음 · ${currency} 환율 적기`;
}

// 견적 줄 갈래의 사전 조회 한 곳 — 신청(06-08)과 취소 되돌리기(06-14)가 같은 판정을 쓴다. 완료 프로젝트는 트랜잭션 전에 거부한다(GA-38 · D-47) —
// 잠근 뒤 `lockProjectForLinkWrite`가 다시 본다(X-2).
type QuoteLineBasis = { projectId: string; revisionId: string; onlineVendorName: string; lineRoom: LineRoomBasis; amountVisible: boolean };

async function loadQuoteLineBasis(viewer: Viewer, lineId: string): Promise<QuoteLineBasis> {
  // 06.2(D-6208 · T-06.2-31): 줄 → 차수 → 프로젝트를 범위로 — 범위 밖 줄 id는 기존 「연결 없음」.
  const line = await findQuoteLineById(viewer, lineId);
  const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
  const project = revision ? await findProjectInScope(viewer, await projectRowScope(viewer), revision.projectId) : null;
  if (!line || !project || project.archivedAt) throw new PurchaseRequestRejectedError(LINK_MISSING);
  if (project.status === "completed") throw new CompletedProjectError(quoteLockReason({ status: project.status }) ?? undefined);
  const latest = await findLatestQuoteRevision(viewer, project.id);
  if (!latest) throw new PurchaseRequestRejectedError(LINK_MISSING);
  return {
    projectId: project.id,
    revisionId: latest.id,
    onlineVendorName: await getSettingValue(PURCHASE_ONLINE_VENDOR_NAME),
    lineRoom: await loadLineRoomBasis(viewer, [line.id]),
    amountVisible: await visible(viewer, "quote.amount"),
  };
}

export async function precheckPurchaseRequest(viewer: Viewer, input: PurchaseRequestInput): Promise<PurchaseRequestPre> {
  // 연결 대상은 프로젝트를 고르는 일 — S10 목록과 같은 문(projects view)을 서버가 다시 본다(06-07 I-6). 직원에게 cards 메뉴 시드가 없어 cards write는 쓰지 않는다.
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  const fields = normalizeRequestFields(input);

  if (input.linkKind === "team_cost") {
    // 팀 비용 — 견적 줄 · 문 · 실행가 판정이 없다. 요청에는 팀을 저장하지 않으므로(구매 완료 사용일 소속 — O-19) 오늘 소속은 막힘 판정에만 쓴다.
    const today = seoulToday();
    const noTeam = await noTeamReason(viewer, today);
    if (noTeam) throw new PurchaseRequestRejectedError(noTeam);
    const { seqStart, ...numberFormat } = await loadDocumentNumberFormat(TEAM_COUNTER_KEY);
    void seqStart;
    return { linkKind: "team_cost", ...fields, year: Number(today.slice(0, 4)), numberFormat };
  }

  const basis = await loadQuoteLineBasis(viewer, input.lineId);
  const { seqStart, ...numberFormat } = await loadPurchaseRequestNumberFormat();
  void seqStart;
  return { linkKind: "quote_line", ...fields, ...basis, numberFormat };
}

// S12 `팀 비용` 값 텍스트 — 요청자의 **오늘** 소속(미리보기 · 막힘 판정에만 쓴다, 요청에는 저장하지 않는다 — O-19). 소속이 없으면 막힘 문구.
export async function loadPurchaseRequestTeam(viewer: Viewer, today: string = seoulToday()): Promise<{ teamName: string | null; blockedReason: string | null }> {
  const blockedReason = await noTeamReason(viewer, today);
  return { teamName: blockedReason ? null : ((await teamAtDate(viewer, viewer.id, today))?.name ?? null), blockedReason };
}

// 서버 계산 한 줄 — 예상 금액의 원화 환산액(외화 `Form.Hint`)과 견적 줄 연결이면 공급가 추정(그 줄 거래처 기본 증빙 종류의 규칙 · 오늘 세율).
// 패널 1차의 실행가 초과 막힘(Q3)이 남은 실행가와 견준다. 트랜잭션 없음 · 잠그지 않는다(표시용) — 판정은 `createPurchaseRequest`가 잠근 뒤 다시 한다.
export async function previewPurchaseSupply(
  viewer: Viewer,
  input: { lineId: string | null; estimate: MoneyInput },
): Promise<{ estimateKrw: number; supplyKrw: number | null }> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  if (input.estimate.currency !== "KRW" && !(Number.isFinite(input.estimate.fxRate) && input.estimate.fxRate > 0)) {
    throw new PurchaseRequestRejectedError(fxMissing(input.estimate.currency));
  }
  const estimate = normalizeMoneyInput(input.estimate);
  const estimateKrw = toKrw(estimate);
  if (input.lineId === null) return { estimateKrw, supplyKrw: null };
  const basis = await loadLineRoomBasis(viewer, [input.lineId]);
  return { estimateKrw, supplyKrw: purchaseEstimateSupply(estimate, basis, input.lineId) };
}

// ── 신청(단독 / 외부 tx) ───────────────────────────────────────────────────

export type CreatedPurchaseRequest = { id: string; number: string };

export async function createPurchaseRequest(
  viewer: Viewer,
  input: PurchaseRequestInput,
  pre: PurchaseRequestPre,
  tx?: DbOrTx,
): Promise<CreatedPurchaseRequest> {
  const runCreate = async (inner: DbOrTx) => {
    if (pre.linkKind === "team_cost") {
      // 팀 비용 — 잠금 · 게이트 없이 번호 → INSERT → 같은 tx 로그. 순서는 06-03 규약(번호는 INSERT와 같은 tx — 실패하면 함께 되돌아 결번이 없다).
      const numbered = await allocateDocumentNumber(viewer, { counterKey: TEAM_COUNTER_KEY, year: pre.year, format: pre.numberFormat }, inner);
      const teamMoney = moneyToColumns(pre.estimate);
      const teamRow = await insertPurchaseRequest(
        viewer,
        {
          number: numbered.number,
          linkKind: "team_cost",
          projectId: null,
          quoteLineId: null,
          requestedBy: viewer.id,
          itemName: pre.itemName,
          linkUrl: pre.linkUrl,
          estimateCurrency: teamMoney.currency,
          estimateForeignAmount: teamMoney.foreignAmount,
          estimateFxRate: teamMoney.fxRate,
          estimateAmountKrw: teamMoney.amountKrw,
          memo: input.memo,
        },
        inner,
      );
      await recordAction(viewer, { actionType: "document_create", entity: PURCHASE_REQUEST_ENTITY, entityId: teamRow.id }, { tx: inner });
      return { id: teamRow.id, number: teamRow.number };
    }
    if (input.linkKind !== "quote_line") throw new PurchaseRequestRejectedError(LINK_MISSING);
    // 순서 고정(B-1 · X-2): 프로젝트 행 → 견적 줄(id 순) → 연결(계보 사슬) → 문 → 이중 연결 → 실행가 상한 → 번호 → INSERT → 로그.
    await lockProjectForLinkWrite(viewer, { projectId: pre.projectId, revisionId: pre.revisionId }, inner);
    const [locked] = await lockQuoteLines(viewer, [input.lineId], inner);
    // 화면이 내보내지 않는 줄(조정 · 취소 · 보관 · 현재 차수 밖) — 새 문구 없음.
    if (!locked || locked.lineKind === "adjustment" || locked.lineStatus === "cancelled" || locked.archivedAt || locked.revisionId !== pre.revisionId) {
      throw new ForbiddenError(LINK_MISSING);
    }
    const facts = await readLockedLineFacts(viewer, input.lineId, inner);
    if (!facts) throw new ForbiddenError(LINK_MISSING);
    const links = await findLineLinks(viewer, [input.lineId], inner);
    const lineLinks = links.get(input.lineId);
    const door = resolveLineDoor({ vendorName: facts.vendorName }, pre.onlineVendorName);
    const doorGate = await gate(null, "purchase.line-door", { side: "purchase", door, vendorName: facts.vendorName });
    if (!doorGate.allowed) throw new GateBlockedError(doorGate.reason);
    const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
    if (!dual.allowed) throw new GateBlockedError(dual.reason);
    if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
    const room = lineRoom({ links, basis: pre.lineRoom, lineId: input.lineId, exclude: {} });
    const supply = purchaseEstimateSupply(pre.estimate, pre.lineRoom, input.lineId);
    const cap = await gate(null, "card.execution-cap", {
      execution: lineLinks.currentExecution,
      otherSupplies: room.otherSupplies,
      supply: { currency: "KRW", amount: supply, fxRate: 1 },
      source: "entry",
      link: "pickable",
      amountVisible: pre.amountVisible,
    });
    if (!cap.allowed) throw new GateBlockedError(cap.reason);
    const numbered = await allocatePurchaseRequestNumber(viewer, { projectNumber: facts.projectNumber, format: pre.numberFormat }, inner);
    const money = moneyToColumns(pre.estimate);
    const row = await insertPurchaseRequest(
      viewer,
      {
        number: numbered.number,
        linkKind: "quote_line",
        projectId: pre.projectId,
        quoteLineId: input.lineId,
        requestedBy: viewer.id,
        itemName: pre.itemName,
        linkUrl: pre.linkUrl,
        estimateCurrency: money.currency,
        estimateForeignAmount: money.foreignAmount,
        estimateFxRate: money.fxRate,
        estimateAmountKrw: money.amountKrw,
        memo: input.memo,
      },
      inner,
    );
    await recordAction(viewer, { actionType: "document_create", entity: PURCHASE_REQUEST_ENTITY, entityId: row.id }, { tx: inner });
    return { id: row.id, number: row.number };
  };
  return tx ? await runCreate(tx) : await withTransaction(runCreate);
}

// ── 구매 완료(06-12 — EXP-10 · OPS-09 · R-3 · N-3 · Q-E) ─────────────────────

const PURCHASE_DENIED = "구매 처리 권한 없음";
const REQUEST_CANCELLED = "구매 요청 취소됨 · 새로 고침";
const REQUEST_PURCHASED = "이미 구매 완료 · 새로 고침";
const REQUEST_STALE = "다른 저장이 먼저 됨 · 새로 고침";
const REQUEST_MISSING = "구매 요청 없음 · 새로 고침";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 구매 완료 입력 — 사람이 보내는 칸만(카드 · 사용일 · 가맹점 · 결제 합계 · 증빙 종류 · 메모 · version). 연결 · 사용한 사람 · 팀은 요청과 서버가 정한다. */
export type PurchaseCompletionInput = {
  requestId: string;
  version: number;
  corpCardId: string;
  usedOn: string;
  merchantVendorId: string | null;
  total: MoneyInput;
  evidenceTypeCode: string;
  memo: string | null;
};

/** 트랜잭션 전 사실(06-03 tx 규약) — 요청 · 카드 사용 갈래의 `pre` · 예상 금액과의 차이(O-10). */
export type PurchaseCompletionPre = {
  requestId: string;
  /** 견적 줄 요청이면 그 줄(앞 차수 줄일 수 있다 — 계보로 현재 줄에 닿는다), 팀 비용이면 null. */
  lineId: string | null;
  cardInput: CardUsageInput;
  card: CardUsagePre;
  /** 결제 합계 원화 − 예상 금액 원화(O-10 — 막지 않는다). */
  diffKrw: number;
};

export type CompletedPurchase = { requestId: string; usageId: string; totalKrw: number; usedOn: string; capOver: number | null };

// 그사이 상태가 바뀐 요청의 거부 문구(UI-SPEC S13 「요청이 그사이 취소·완료됐으면」).
function statusChangedError(status: string): PurchaseRequestRejectedError {
  return new PurchaseRequestRejectedError(status === "cancelled" ? REQUEST_CANCELLED : status === "purchased" ? REQUEST_PURCHASED : REQUEST_STALE);
}

// 트랜잭션 밖에서만. 권한 → 요청(잠금 없음) · 상태 · version → 카드 사용 `purchase` 갈래(R-3) → 예상 금액 차이(O-10).
// 요청자 = 처리자도 막지 않는다(O-20 확정 — 판정 없음).
export async function precheckPurchaseCompletion(viewer: Viewer, input: PurchaseCompletionInput): Promise<PurchaseCompletionPre> {
  if (!(await can(viewer, "cards.purchases", "write"))) throw new ForbiddenError(PURCHASE_DENIED);
  const row = UUID_SHAPE.test(input.requestId) ? await findPurchaseRequestById(viewer, input.requestId) : null;
  if (!row) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
  if (row.status !== "requested") throw statusChangedError(row.status);
  if (row.version !== input.version) throw new PurchaseRequestRejectedError(REQUEST_STALE);
  const common = {
    corpCardId: input.corpCardId,
    usedOn: input.usedOn,
    merchantVendorId: input.merchantVendorId,
    total: input.total,
    evidenceTypeCode: input.evidenceTypeCode,
    memo: input.memo,
    usedByUserId: row.requestedBy,
    purchaseRequestId: row.id,
  };
  const lineId = row.linkKind === "quote_line" ? row.quoteLineId : null;
  if (row.linkKind === "quote_line" && !lineId) throw new PurchaseRequestRejectedError(LINK_MISSING);
  const cardInput: CardUsageInput = lineId ? { ...common, linkKind: "quote_line", lineId } : { ...common, linkKind: "team_cost" };
  const card = await precheckCardUsage(viewer, cardInput);
  return { requestId: row.id, lineId, cardInput, card, diffKrw: diffKrw(toKrw(normalizeMoneyInput(input.total)), row.estimateAmountKrw) };
}

// `deps.afterLock` — 요청 행 잠금 바로 뒤 테스트 장벽(E-26 — 05 `submitExpense` 선례). 화면 · 액션은 넘기지 않는다.
export async function completePurchaseRequest(
  viewer: Viewer,
  input: PurchaseCompletionInput,
  pre: PurchaseCompletionPre,
  deps?: { afterLock?: () => Promise<void> },
): Promise<CompletedPurchase> {
  const runComplete = async (innerTx: DbOrTx) => {
    // 전역 잠금 순서(N-3 · X-2): 프로젝트 행 → 사슬의 현재 줄 → 견적 줄 둘(한 호출 · id 순) → 요청 행. 카드 사용 생성 안의 같은 잠금은 이미 쥔 행이다.
    // 팀 비용 요청은 프로젝트 · 줄 잠금 없이 요청 행부터.
    if (pre.card.projectId && pre.lineId) {
      await lockProjectForLinkWrite(viewer, { projectId: pre.card.projectId, allowCompleted: true }, innerTx);
      const current = await currentLineForFixedLink(viewer, { projectId: pre.card.projectId, lineId: pre.lineId }, innerTx);
      await lockQuoteLines(viewer, [pre.lineId, current], innerTx);
    }
    const locked = await lockPurchaseRequestForUpdate(viewer, pre.requestId, innerTx);
    await deps?.afterLock?.();
    if (!locked) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
    if (locked.status !== "requested") throw statusChangedError(locked.status);
    if (locked.version !== input.version) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    const usage = await createCardUsage(viewer, pre.cardInput, pre.card, innerTx);
    const version = await markPurchaseRequestPurchased(viewer, { id: pre.requestId, version: input.version, completedBy: viewer.id }, innerTx);
    if (version === null) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    // OPS-09 · Q-E: 같은 tx 기록 — 완료 프로젝트 줄의 실행가 초과는 상세에 초과액을 남긴다(막지 않음 · 흔적은 남김).
    const detail = { usageId: usage.id, ...(usage.capOver === null ? {} : { capOverKrw: usage.capOver, summary: `실행가 초과 ${formatKrw(usage.capOver)}` }) };
    await recordAction(viewer, { actionType: "purchase_process", entity: PURCHASE_REQUEST_ENTITY, entityId: pre.requestId, detail }, { tx: innerTx });
    return { requestId: pre.requestId, usageId: usage.id, totalKrw: usage.totalKrw, usedOn: pre.cardInput.usedOn, capOver: usage.capOver };
  };
  return withTransaction(runComplete);
}

// ── 요청 취소 · 되돌리기(06-14 — Q2 · O-9 · D-609 · Q3 · X-1 · X-2 · N-1 · N-2) ──────────────────────────────

const CANCEL_DENIED = "구매 요청 취소 권한 없음";
const UNDO_DENIED = "되돌리기 권한 없음";
export const CANCEL_REASON_MAX = REJECT_REASON_MAX;
export const CANCEL_REASON_TOO_LONG = REJECT_REASON_TOO_LONG_MESSAGE;

/** 취소 갈래 — `own` 요청자 본인(사유 없이 즉시 · 되돌리기 있음) / `others` 구매 권한자의 남의 요청(사유 필수 · 되돌리기 없음). */
export type PurchaseCancelPre = { requestId: string; branch: "own" | "others" };

// 트랜잭션 밖에서만. 요청을 잠금 없이 읽고 권한 → 갈래. 상태 판정은 잠근 뒤 `runCancel`이 한다(Q2 — 사전 조회 뒤에 바뀔 수 있다).
export async function precheckPurchaseCancel(viewer: Viewer, input: { id: string }): Promise<PurchaseCancelPre> {
  const row = UUID_SHAPE.test(input.id) ? await findPurchaseRequestById(viewer, input.id) : null;
  const purchaser = await can(viewer, "cards.purchases", "write");
  // 요청이 없다는 말도 권한 있는 사람에게만 한다(존재 여부를 흘리지 않는다).
  if (!row) throw purchaser ? new PurchaseRequestRejectedError(REQUEST_MISSING) : new ForbiddenError(CANCEL_DENIED);
  if (row.requestedBy === viewer.id) return { requestId: row.id, branch: "own" };
  if (!purchaser) throw new ForbiddenError(CANCEL_DENIED);
  return { requestId: row.id, branch: "others" };
}

function normalizeCancelReason(raw: string | undefined): string {
  const reason = (raw ?? "").trim();
  if (reason === "") throw new PurchaseRequestRejectedError(REJECT_REASON_EMPTY_MESSAGE);
  if (reason.length > CANCEL_REASON_MAX) throw new PurchaseRequestRejectedError(CANCEL_REASON_TOO_LONG);
  return reason;
}

export type CancelledPurchaseRequest = { id: string; number: string; version: number };

// 취소는 `신청됨`에서만(Q2) — 요청 행 하나만 잡는다(견적 줄을 잡지 않아 구매 완료(줄 → 요청 행 순서)와 교착이 없다). `deps.afterLock` = 테스트 장벽(E-26).
export async function cancelPurchaseRequest(
  viewer: Viewer,
  input: { id: string; version: number; reason?: string },
  pre: PurchaseCancelPre,
  tx?: DbOrTx,
  deps?: { afterLock?: () => Promise<void> },
): Promise<CancelledPurchaseRequest> {
  if (input.id !== pre.requestId) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
  // 본인 취소는 사유를 받지 않는다(그래야 되돌릴 수 있다) · 구매 권한자의 남의 요청 취소는 사유가 감사 기록이다.
  const reason = pre.branch === "others" ? normalizeCancelReason(input.reason) : null;
  const runCancel = async (innerTx: DbOrTx) => {
    const locked = await lockPurchaseRequestForUpdate(viewer, pre.requestId, innerTx);
    await deps?.afterLock?.();
    if (!locked) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
    if (locked.status !== "requested") throw statusChangedError(locked.status);
    if (locked.version !== input.version) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    const version = await markPurchaseRequestCancelled(viewer, { id: pre.requestId, version: input.version, cancelledBy: viewer.id, reason }, innerTx);
    if (version === null) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    await recordAction(
      viewer,
      { actionType: "status_change", entity: PURCHASE_REQUEST_ENTITY, entityId: pre.requestId, detail: { from: "requested", to: "cancelled", ...(reason === null ? {} : { reason }) } },
      { tx: innerTx },
    );
    return { id: pre.requestId, number: locked.number, version };
  };
  return tx ? await runCancel(tx) : await withTransaction(runCancel);
}

/** 되돌리기 사전 조회 — 견적 줄 요청이면 신청과 같은 줄 판정 바탕(문 설정 · 남은 실행가 바탕 · 완료 프로젝트). 팀 비용이면 `line` 없음. */
export type PurchaseCancelUndoPre = {
  requestId: string;
  estimate: MoneyInput;
  line: (QuoteLineBasis & { lineId: string }) | null;
};

// 트랜잭션 밖에서만. 되돌리기는 요청자 본인이 사유 없이 취소한 건에만 된다(D-609 — 그 밖의 길은 열지 않는다).
export async function precheckPurchaseCancelUndo(viewer: Viewer, input: { id: string }): Promise<PurchaseCancelUndoPre> {
  const row = UUID_SHAPE.test(input.id) ? await findPurchaseRequestById(viewer, input.id) : null;
  if (!row) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
  if (row.requestedBy !== viewer.id) throw new ForbiddenError(UNDO_DENIED);
  if (row.status !== "cancelled") throw statusChangedError(row.status);
  if (row.cancelledBy !== row.requestedBy || row.cancelReason) throw new ForbiddenError(UNDO_DENIED);
  const estimate: MoneyInput = {
    currency: row.estimateCurrency === "USD" ? "USD" : "KRW",
    amount: row.estimateForeignAmount === null ? row.estimateAmountKrw : Number(row.estimateForeignAmount),
    fxRate: Number(row.estimateFxRate),
  };
  if (row.linkKind !== "quote_line") return { requestId: row.id, estimate, line: null };
  if (!row.quoteLineId) throw new PurchaseRequestRejectedError(LINK_MISSING);
  return { requestId: row.id, estimate, line: { lineId: row.quoteLineId, ...(await loadQuoteLineBasis(viewer, row.quoteLineId)) } };
}

// 견적 줄 요청은 신청(06-08 B-1 · X-2)과 구매 완료(06-12)와 같은 잠금 순서와 게이트를 다시 지난다: 프로젝트 행 → 사슬의 현재 줄 → 줄 둘(id 순)
// → 연결(계보 사슬) → 문 → 이중 연결 → 실행가 상한(이 요청 제외 · 실행가 = 현재 줄) → 요청 행. 요청은 고정 연결이라 새 차수 뒤에도 그 줄로 돌아간다.
export async function undoCancelPurchaseRequest(
  viewer: Viewer,
  input: { id: string; version: number },
  pre: PurchaseCancelUndoPre,
  tx?: DbOrTx,
): Promise<{ id: string; version: number }> {
  if (input.id !== pre.requestId) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
  const runUndoCancel = async (innerTx: DbOrTx) => {
    if (pre.line) {
      const { lineId } = pre.line;
      await lockProjectForLinkWrite(viewer, { projectId: pre.line.projectId }, innerTx);
      const current = await currentLineForFixedLink(viewer, { projectId: pre.line.projectId, lineId }, innerTx);
      await lockQuoteLines(viewer, [lineId, current], innerTx);
      const facts = await readLockedLineFacts(viewer, current, innerTx);
      if (!facts) throw new ForbiddenError(LINK_MISSING);
      const links = await findLineLinks(viewer, [lineId], innerTx);
      const lineLinks = links.get(lineId);
      const door = resolveLineDoor({ vendorName: facts.vendorName }, pre.line.onlineVendorName);
      const doorGate = await gate(null, "purchase.line-door", { side: "purchase", door, vendorName: facts.vendorName });
      if (!doorGate.allowed) throw new GateBlockedError(doorGate.reason);
      const dual = await gate(null, "card.dual-link-block", { side: "card", links: lineLinks ?? { expenses: [], cardUsages: [] } });
      if (!dual.allowed) throw new GateBlockedError(dual.reason);
      if (!lineLinks?.currentExecution) throw new ForbiddenError(LINK_MISSING);
      // 남은 실행가 = 06-07 `lineRoom`(다른 카드 사용 · 다른 `신청됨` 요청을 뺀 값 — 이 요청 제외). 실행가 = 사슬의 현재 줄(N-1).
      const room = lineRoom({ links, basis: pre.line.lineRoom, lineId, exclude: { requestId: pre.requestId } });
      const cap = await gate(null, "card.execution-cap", {
        execution: lineLinks.currentExecution,
        otherSupplies: room.otherSupplies,
        supply: { currency: "KRW", amount: purchaseEstimateSupply(pre.estimate, pre.line.lineRoom, lineId), fxRate: 1 },
        source: "entry",
        link: "pickable",
        amountVisible: pre.line.amountVisible,
      });
      if (!cap.allowed) throw new GateBlockedError(cap.reason);
    }
    const locked = await lockPurchaseRequestForUpdate(viewer, pre.requestId, innerTx);
    if (!locked) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
    if (locked.status !== "cancelled") throw statusChangedError(locked.status);
    if (locked.version !== input.version) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    if (locked.cancelledBy !== locked.requestedBy || locked.cancelReason) throw new ForbiddenError(UNDO_DENIED);
    const version = await markPurchaseRequestRequested(viewer, { id: pre.requestId, version: input.version }, innerTx);
    if (version === null) throw new PurchaseRequestRejectedError(REQUEST_STALE);
    await recordAction(viewer, { actionType: "status_change", entity: PURCHASE_REQUEST_ENTITY, entityId: pre.requestId, detail: { from: "cancelled", to: "requested" } }, { tx: innerTx });
    return { id: pre.requestId, version };
  };
  return tx ? await runUndoCancel(tx) : await withTransaction(runUndoCancel);
}

// ── S13 패널 로드 · 서버 계산 한 줄(06-12) ───────────────────────────────────

export type PurchaseCompletionDto = {
  id: string;
  number: string;
  itemName: string;
  linkUrl: string | null;
  version: number;
  status: PurchaseRequestStatusValue;
  linkKind: "quote_line" | "team_cost";
  /** 견적 줄 요청의 연결 읽기 — `{프로젝트 번호} {이름}` · 줄 항목. 팀 비용이면 null. */
  projectLabel: string | null;
  lineItemName: string | null;
  requestedByName: string;
  currency: string;
  /** 예상 금액 입력값 — 원화면 원화, 외화면 외화 금액. */
  amount: number;
  fxRate: number;
  estimateKrw: number;
};

const PURCHASE_COMPLETION_DTO_SPEC: DtoSpec<PurchaseCompletionDto, PurchaseCompletionDto> = {
  fields: [
    ...(["id", "number", "itemName", "linkUrl", "version", "status", "linkKind", "requestedByName"] as const).map((key) => ({ key, from: key, infoItem: "purchase_request.value" })),
    ...(["projectLabel", "lineItemName"] as const).map((key) => ({ key, from: key, infoItem: ["purchase_request.value", "project.value"] })),
    ...(["currency", "amount", "fxRate", "estimateKrw"] as const).map((key) => ({ key, from: key, infoItem: "purchase_request.amount" })),
  ],
};

registerDto({ name: "PurchaseCompletionDto", fields: PURCHASE_COMPLETION_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type PurchaseCompletionPanel = {
  request: Partial<PurchaseCompletionDto>;
  /** 가맹점 기본값 = 설정의 온라인구매 협력사(이름으로 찾는다 — 견적 줄 요청도 같다). 고를 수 없는 거래처면 null. */
  merchant: Partial<PickVendorOptionDto> | null;
  options: PurchaseCardFormOptions;
  /** 오늘 기준 팀 비용의 팀(요청자 소속) — 사용일을 바꾸면 서버 계산 한 줄이 다시 보낸다. */
  teamName: string | null;
  teamAssigned: boolean;
  /** 그사이 상태가 바뀐 요청의 이유(`구매 요청 취소됨 · 새로 고침` 등) — 1차 비활성. */
  statusReason: string | null;
  /** 06-14 폰 패널의 `요청 취소` — 본인 요청 `own`(즉시 · 되돌리기) · 남의 요청 `others`(사유 창). `신청됨`이 아니면 null(Q2). */
  cancelBranch: "own" | "others" | null;
};

async function onlineMerchant(viewer: Viewer): Promise<Partial<PickVendorOptionDto> | null> {
  const name = await getSettingValue(PURCHASE_ONLINE_VENDOR_NAME);
  const found = name.trim() ? await listVendorsForPick(viewer, { normalizedQuery: normalizeVendorName(name), limit: 10, kinds: vendorKindsFor("supplier") }) : [];
  const vendor = found.find((candidate) => candidate.name === name) ?? null;
  if (!vendor) return null;
  const evidenceNames = await codeLabelsOf(viewer, "evidence_type");
  const option: PickVendorOptionDto = {
    id: vendor.id,
    name: vendor.name,
    defaultEvidenceType: vendor.defaultEvidenceType,
    defaultEvidenceName: vendor.defaultEvidenceType ? (evidenceNames.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType) : null,
  };
  const [projected] = await projectMany(viewer, [option], PICK_VENDOR_OPTION_SPEC);
  return projected?.id ? projected : null;
}

// `?purchase={id}` — 구매 권한이 없거나 없는 요청이면 null(패널을 그리지 않는다).
export async function loadPurchaseCompletion(viewer: Viewer, id: string, today: string = seoulToday()): Promise<PurchaseCompletionPanel | null> {
  if (!UUID_SHAPE.test(id) || !(await can(viewer, "cards.purchases", "write"))) return null;
  const row = await findPurchaseRequestById(viewer, id);
  if (!row) return null;
  let projectLabel: string | null = null;
  let lineItemName: string | null = null;
  if (row.quoteLineId && row.projectId) {
    // post-gate(06.2 · D-6220): 위 `cards.purchases` write 판정 뒤 — 구매 처리 권한자는 요청 전부를 다룬다(목록도 privileged 전부).
    const project = await findProjectById(viewer, row.projectId);
    projectLabel = project ? `${project.number} ${project.name}` : null;
    lineItemName = (await findQuoteLineById(viewer, row.quoteLineId))?.itemName ?? null;
  }
  const dto: PurchaseCompletionDto = {
    id: row.id,
    number: row.number,
    itemName: row.itemName,
    linkUrl: row.linkUrl,
    version: row.version,
    status: row.status as PurchaseRequestStatusValue,
    linkKind: row.linkKind === "team_cost" ? "team_cost" : "quote_line",
    projectLabel,
    lineItemName,
    requestedByName: (await findUserNamesByIds(viewer, [row.requestedBy])).get(row.requestedBy) ?? "",
    currency: row.estimateCurrency,
    amount: row.estimateForeignAmount === null ? row.estimateAmountKrw : Number(row.estimateForeignAmount),
    fxRate: Number(row.estimateFxRate),
    estimateKrw: row.estimateAmountKrw,
  };
  const [request] = await projectMany(viewer, [dto], PURCHASE_COMPLETION_DTO_SPEC);
  const team = row.linkKind === "team_cost" ? await previewPurchaseCard(viewer, { requestId: row.id, requesterId: row.requestedBy, lineId: null, usedOn: today, total: null, evidenceTypeCode: null }) : null;
  return {
    request: request ?? {},
    merchant: await onlineMerchant(viewer),
    options: await purchaseCardFormOptions(viewer),
    teamName: team?.teamName ?? null,
    teamAssigned: team?.teamAssigned ?? true,
    statusReason: row.status === "requested" ? null : statusChangedError(row.status).message,
    cancelBranch: row.status !== "requested" ? null : row.requestedBy === viewer.id ? "own" : "others",
  };
}

export type PurchaseCompletionPreview = PurchaseCardPreview & {
  /** 결제 합계 ≠ 예상 금액이면 두 원화 환산액(O-10 — 막지 않는다). 같거나 예상 금액을 못 보면 null. */
  estimate: { estimateKrw: number; diffKrw: number } | null;
};

// S13 서버 계산 한 줄 — 카드 쪽 계산(06-05 · 06-07 식) + 예상 금액 차이. 트랜잭션 없음.
export async function previewPurchaseCompletion(
  viewer: Viewer,
  input: { requestId: string; usedOn: string; total: MoneyInput | null; evidenceTypeCode: string | null },
): Promise<PurchaseCompletionPreview> {
  if (!(await can(viewer, "cards.purchases", "write"))) throw new ForbiddenError(PURCHASE_DENIED);
  const row = await findPurchaseRequestById(viewer, input.requestId);
  if (!row) throw new PurchaseRequestRejectedError(REQUEST_MISSING);
  const card = await previewPurchaseCard(viewer, {
    requestId: row.id,
    requesterId: row.requestedBy,
    lineId: row.linkKind === "quote_line" ? row.quoteLineId : null,
    usedOn: input.usedOn,
    total: input.total,
    evidenceTypeCode: input.evidenceTypeCode,
  });
  const totalKrw = input.total ? toKrw(normalizeMoneyInput(input.total)) : null;
  const diff = totalKrw === null ? 0 : diffKrw(totalKrw, row.estimateAmountKrw);
  const estimateShown = await visible(viewer, "purchase_request.amount");
  return { ...card, estimate: diff !== 0 && estimateShown ? { estimateKrw: row.estimateAmountKrw, diffKrw: diff } : null };
}

// ── 목록 ───────────────────────────────────────────────────────────────────

export type PurchaseRequestStatusValue = "requested" | "purchased" | "cancelled";

export type PurchaseRequestListItemDto = {
  id: string;
  number: string;
  /** 요청일(서울 날짜). */
  requestedOn: string;
  itemName: string;
  linkUrl: string | null;
  /** 연결 칸 — `{프로젝트} · {줄 번호} {항목}`. */
  linkLabel: string | null;
  requestedByName: string;
  status: PurchaseRequestStatusValue;
  /** 06-14 검토 m-3 — 취소 창이 `견적 줄 연결 풀림`을 말할지 정한다(`linkLabel`은 프로젝트 이름을 못 보면 비므로 연결 여부를 가리지 못한다). */
  linkKind: "quote_line" | "team_cost";
  currency: string;
  foreignAmount: number | null;
  fxRate: number;
  estimateKrw: number;
  /** 06-12 구매 완료 행 2행 `카드 사용 {MM-DD} · {결제 합계}` — 구매 완료 건의 카드 사용(아니면 null). */
  usageUsedOn: string | null;
  usageTotalKrw: number | null;
  /** 06-14 취소 행 2행 `취소 {MM-DD} · {사람} · {사유}` — 취소 아니면 null. 본인 취소는 사유가 없다. */
  cancelledOn: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  /** 취소 · 구매 완료 행동이 되돌려 보내는 낙관적 동시성 값. */
  version: number;
};

const VALUE_KEYS = ["id", "number", "requestedOn", "itemName", "linkUrl", "requestedByName", "status", "linkKind", "version", "cancelledOn", "cancelledByName", "cancelReason"] as const;
const AMOUNT_KEYS = ["currency", "foreignAmount", "fxRate", "estimateKrw"] as const;

export const PURCHASE_REQUEST_LIST_DTO_SPEC: DtoSpec<PurchaseRequestListItemDto, PurchaseRequestListItemDto> = {
  fields: [
    ...VALUE_KEYS.map((key) => ({ key, from: key, infoItem: "purchase_request.value" })),
    // 연결 칸은 프로젝트 이름을 싣는다 — 구매 요청 값과 프로젝트 값을 둘 다 볼 때만(all-of).
    { key: "linkLabel", from: "linkLabel", infoItem: ["purchase_request.value", "project.value"] },
    ...AMOUNT_KEYS.map((key) => ({ key, from: key, infoItem: "purchase_request.amount" })),
    { key: "usageUsedOn", from: "usageUsedOn", infoItem: "card_usage.value" },
    { key: "usageTotalKrw", from: "usageTotalKrw", infoItem: "card_usage.amount" },
  ],
};

registerDto({
  name: "PurchaseRequestListItemDto",
  fields: PURCHASE_REQUEST_LIST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 줄 번호 = 그 줄 차수 안 순번(보관 안 된 줄, 정렬 순 — S10 줄 목록과 같은 셈).
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

function requestLinkLabel(row: PurchaseRequestListRow, lineNo: Map<string, number>): string | null {
  if (row.linkKind !== "quote_line" || row.projectName === null || row.lineItemName === null) return null;
  const number = row.quoteLineId ? lineNo.get(row.quoteLineId) : undefined;
  return `${row.projectName} · ${number === undefined ? row.lineItemName : `${number} ${row.lineItemName}`}`;
}

function toProjectable(row: PurchaseRequestListRow, lineNo: Map<string, number>): PurchaseRequestListItemDto {
  return {
    id: row.id,
    number: row.number,
    requestedOn: seoulToday(row.createdAt),
    itemName: row.itemName,
    linkUrl: row.linkUrl,
    linkLabel: requestLinkLabel(row, lineNo),
    requestedByName: row.requestedByName,
    status: row.status as PurchaseRequestStatusValue,
    linkKind: row.linkKind === "team_cost" ? "team_cost" : "quote_line",
    currency: row.estimateCurrency,
    foreignAmount: row.estimateForeignAmount === null ? null : Number(row.estimateForeignAmount),
    fxRate: Number(row.estimateFxRate),
    estimateKrw: row.estimateAmountKrw,
    usageUsedOn: row.usageUsedOn,
    usageTotalKrw: row.usageTotalKrw,
    cancelledOn: row.cancelledAt ? seoulToday(row.cancelledAt) : null,
    cancelledByName: row.cancelledByName,
    cancelReason: row.cancelReason,
    version: row.version,
  };
}

const STATUS_ORDER: Record<PurchaseRequestStatusValue, number> = { requested: 0, purchased: 1, cancelled: 2 };

export type PurchaseRequestStatusView = PurchaseRequestStatusValue | "all";

export type PurchaseRequestListFilters = {
  /** 기본 보기 = `신청됨`. */
  status: PurchaseRequestStatusView;
  /** `YYYY-MM`(요청일 월) — 없으면 모든 달. */
  month?: string | null;
  page?: string;
  /** 06-12 방금 구매 완료한 요청 — 상태 보기와 무관하게 제자리에 남긴다(S13 성공 뒤 제자리 결과). 범위 조건은 그대로. */
  keepId?: string | null;
};

export type PurchaseRequestList = {
  rows: Partial<PurchaseRequestListItemDto>[];
  page: { page: number; pageCount: number; pageSize: number; total: number };
  /** 구매 권한자 · 전사 범위 — Empty 문구의 갈래(`처리할 …` / `신청한 …`). */
  privileged: boolean;
  /** 필터와 무관하게 범위 안에 요청이 하나라도 있는가 — 전체 0건 갈래. */
  anyInScope: boolean;
  /** 06-14 합계 줄 — 보기(상태 · 월) 안 범위 전체(쪽과 무관)의 건수와 원화 예상 금액 합. 예상 금액을 못 보는 사람은 `estimateKrw` null. */
  totals: { count: number; estimateKrw: number | null };
  /** 06-14 행 `요청 취소` — `신청됨` 행 id → 갈래(요청자 본인 `own` · 구매 권한자의 남의 요청 `others`). 그 밖 행은 없다(Q2). */
  cancelBranches: Record<string, "own" | "others">;
};

// 서울 월 → [그 달 0시, 다음 달 0시) — `created_at`은 UTC 시각으로 저장된다(seoulToday(createdAt)와 같은 가정).
function monthBounds(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  return { from: new Date(`${month}-01T00:00:00+09:00`), to: new Date(`${next}-01T00:00:00+09:00`) };
}

// 범위: `cards.purchases` write 권한자 · 프로젝트 보는 범위 전사(rowScopeFor rows: all) → 전부 — 06.2 K2, 260907 `O: server/src/purchases.ts:1334` /
// 그 밖 → 자기 요청 + 자기가 담당 PM인 프로젝트 줄의 요청(쿼리 조건).
async function listAccess(viewer: Viewer, today: string): Promise<{ scope: PurchaseRequestScope; privileged: boolean }> {
  const purchaser = await can(viewer, "cards.purchases", "write");
  if (purchaser || (await projectRowScope(viewer, { today: () => today })).rows === "all") return { scope: { kind: "all" }, privileged: purchaser };
  return { scope: { kind: "own", userId: viewer.id }, privileged: false };
}

export async function listPurchaseRequests(viewer: Viewer, filters: PurchaseRequestListFilters, today: string = seoulToday()): Promise<PurchaseRequestList> {
  const { scope, privileged } = await listAccess(viewer, today);
  const filter: PurchaseRequestFilter = {
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...(filters.month ? monthBounds(filters.month) : {}),
  };
  // 판정(can · 소속)은 위에서 끝내고 트랜잭션 안에서는 목록 쿼리 하나만 — lock_timeout(5s)이 잠금 대기를 끊는다(로드 오류 갈래).
  const keepId = filters.keepId && UUID_SHAPE.test(filters.keepId) ? filters.keepId : null;
  const rows = await withTransaction((tx) => listPurchaseRequestRows(viewer, { scope, filter, keepId }, tx));
  const anyInScope = rows.length > 0 || (Object.keys(filter).length > 0 && (await withTransaction((tx) => listPurchaseRequestRows(viewer, { scope, filter: {} }, tx))).length > 0);
  const lineNo = await lineNumbers(viewer, rows.flatMap((row) => (row.lineRevisionId ? [row.lineRevisionId] : [])));
  // `전체` 보기는 상태 그룹 순서(신청됨 → 구매 완료 → 취소)로 놓는다 — 그룹 안은 최근 요청이 첫 줄(안정 정렬).
  const ordered = filters.status === "all" ? [...rows].sort((a, b) => STATUS_ORDER[a.status as PurchaseRequestStatusValue] - STATUS_ORDER[b.status as PurchaseRequestStatusValue]) : rows;
  const projected = await projectMany(viewer, ordered.map((row) => toProjectable(row, lineNo)), PURCHASE_REQUEST_LIST_DTO_SPEC);
  const estimates = await listPurchaseRequestEstimates(viewer, { scope, filter });
  const pageCount = pageCountFrom(projected.length, LIST_PAGE_SIZE);
  const page = clampPage(filters.page, pageCount);
  return {
    rows: projected.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    page: { page, pageCount, pageSize: LIST_PAGE_SIZE, total: projected.length },
    privileged,
    anyInScope,
    totals: { count: estimates.length, estimateKrw: (await visible(viewer, "purchase_request.amount")) ? sumKrw(estimates) : null },
    cancelBranches: Object.fromEntries(
      rows.flatMap((row): [string, "own" | "others"][] => {
        if (row.status !== "requested") return [];
        if (row.requestedBy === viewer.id) return [[row.id, "own"]];
        return privileged ? [[row.id, "others"]] : [];
      }),
    ),
  };
}

// S8 카드 목록 하위 링크 `구매 요청 {N}` — 목록과 같은 범위의 `신청됨` 건수(새 범위 판정 없음).
export async function countOpenPurchaseRequests(viewer: Viewer, today: string = seoulToday()): Promise<number> {
  const { scope } = await listAccess(viewer, today);
  return (await listPurchaseRequestEstimates(viewer, { scope, filter: { status: "requested" } })).length;
}

// ── S10 구매 요청 모드 줄 고르기(트랜잭션 밖 읽기) ───────────────────────────

// 현재 차수의 줄(취소 · 조정 줄 제외). 온라인구매 협력사 줄만 고를 수 있고 나머지는 `거래처 {이름} · 지출결의로`(문 가르기 — 사람이 고르지 않는다).
// 반대쪽(지출결의 쪽) · 실행가 소진 줄은 카드 모드(`searchLinesForCardLink`)와 같은 이유 · 같은 남은 실행가 식(06-07 `lineRoom` 한 곳)이다.
export async function searchLinesForPurchaseLink(
  viewer: Viewer,
  input: { projectId: string; query: string; currentLineId?: string | null },
): Promise<{ rows: Partial<CardLinkLineDto>[]; truncated: boolean; subtitle: string; total: number; selectableCount: number }> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  // 06.2(D-6208): 프로젝트 id 직접 호출도 범위 밖이면 없음.
  const project = await findProjectInScope(viewer, await projectRowScope(viewer), input.projectId);
  if (!project || project.archivedAt) throw new ProjectNotFoundError();
  const revision = await findLatestQuoteRevision(viewer, project.id);
  const lines = revision ? await listQuoteLinesByRevisions(viewer, [revision.id]) : [];
  lines.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const numbered = lines.map((line, index) => ({ line, lineNo: index + 1 })).filter(({ line }) => line.lineKind !== "adjustment" && line.lineStatus !== "cancelled");
  const lineIds = numbered.map(({ line }) => line.id);

  const links = await findLineLinks(viewer, lineIds);
  const basis = await loadLineRoomBasis(viewer, lineIds);
  const expenseIds = [...new Set([...links.values()].flatMap((link) => link.expenses.map((doc) => doc.id)))];
  const statuses = await findExpenseApprovalStatuses(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentIds: expenseIds });
  const vendorNames = await findVendorNamesByIds(viewer, [...new Set(numbered.flatMap(({ line }) => (line.vendorId ? [line.vendorId] : [])))]);
  const onlineVendorName = await getSettingValue(PURCHASE_ONLINE_VENDOR_NAME);
  const vendorVisible = await visible(viewer, "vendor.value");
  const lock = projectLinkLock(project.status);

  const all: CardLinkLineDto[] = numbered.map(({ line, lineNo }) => {
    const link = links.get(line.id);
    const execution = link?.currentExecution ?? lineExecution(line);
    const room = lineRoom({ links, basis, lineId: line.id, exclude: {} });
    const remainingKrw = cardExecutionCap({ execution, otherSupplies: room.otherSupplies, supply: { currency: "KRW", amount: 0, fxRate: 1 }, source: "entry" }).remaining.amountKrw;
    const vendorName = line.vendorId ? (vendorNames.get(line.vendorId) ?? null) : null;
    const door = resolveLineDoor({ vendorName }, onlineVendorName);
    const expense = link?.expenses.at(-1);
    let reason: string | null = null;
    if (lock) {
      reason = lock;
    } else if (door !== "purchase") {
      reason = vendorName !== null && vendorVisible ? `거래처 ${vendorName} · 지출결의로` : "온라인구매 협력사 줄 아님 · 지출결의로";
    } else if (expense) {
      const word = APPROVAL_STATUS_WORDS[statuses.get(expense.id) ?? ""] ?? "";
      reason = `지출결의 ${expense.number}${word ? ` ${word}` : ""} · ${numberedSupplyText(expense)}`;
    } else if (remainingKrw <= 0) {
      reason = "실행가 소진 · 다른 줄";
    }
    return {
      id: line.id,
      lineNo,
      itemName: line.itemName,
      vendorName,
      execution,
      remainingKrw,
      hint: lineRoomHint({ remaining: remainingKrw, cards: room.cards, requests: room.requests }),
      selectable: reason === null,
      reason,
      current: line.id === input.currentLineId,
    };
  });

  const lowered = input.query.trim().toLowerCase();
  const matched = all.filter((row) => lowered === "" || row.itemName.toLowerCase().includes(lowered) || (row.vendorName ?? "").toLowerCase().includes(lowered));
  const selectableCount = all.filter((row) => row.selectable).length;
  const projected = (await projectMany(viewer, matched.slice(0, LINK_PICK_LIMIT), CARD_LINK_LINE_SPEC)).filter((row) => row.id !== undefined);
  return {
    rows: projected,
    truncated: matched.length > LINK_PICK_LIMIT,
    subtitle: `${project.name} · ${all.length}줄 · 구매 요청할 수 있는 줄 ${selectableCount}`,
    total: all.length,
    selectableCount,
  };
}

// ── 새 건 기본값 — 진입 줄(`?line=`) ─────────────────────────────────────────

export type PurchaseRequestEntry = {
  project: CardLinkProjectChoice;
  line: { id: string; itemName: string; remainingKrw: number | null; hint: string | null };
};

// 견적 줄 행 · 점검 섹션에서 `?new=1&line={id}`로 들어온 줄 — 고를 수 있는 프로젝트(완료 · 보관 · 볼 수 없음 제외)의 줄이면 채운다.
// 문이 맞지 않는 줄도 채운다(서버가 제출 때 `reason`으로 거부하고 입력은 남는다 — 경합 · 직접 URL).
export async function purchaseRequestEntry(viewer: Viewer, lineId: string): Promise<PurchaseRequestEntry | null> {
  const line = await findQuoteLineById(viewer, lineId);
  const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
  if (!revision) return null;
  const project = await cardLinkProjectChoice(viewer, revision.projectId);
  if (!project) return null;
  const found = await searchLinesForPurchaseLink(viewer, { projectId: project.id, query: "", currentLineId: lineId });
  const row = found.rows.find((candidate) => candidate.id === lineId);
  if (!row || row.itemName === undefined) return null;
  return { project, line: { id: lineId, itemName: row.itemName, remainingKrw: row.remainingKrw ?? null, hint: row.hint ?? null } };
}
