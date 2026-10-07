import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { diffKrw, moneyFromRow, sumKrw, toKrw, type Money, type MoneyInput } from "@/domain/money";
import { loadTaxRates, type TaxRates } from "@/domain/money/tax";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { CARD_RECEIPT_CODE, cardExecutionCap, splitCardTotal } from "@/domain/corp-card-usages/amounts";
import { lineExecution, numberedSupplyText } from "@/domain/expenses";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { CompletedProjectError } from "@/domain/projects";
import { ProjectNotFoundError } from "@/domain/projects/status";
import { PROJECT_STATUS_WORD } from "@/domain/projects/status-word";
import { quoteLockReason } from "@/domain/quotes/edit-scope";
import { formatKrw } from "@/lib/format-number";
import { seoulToday } from "@/lib/dates";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { listCodeItems } from "@/repositories/code-tables";
import { findExpenseApprovalStatuses } from "@/repositories/expenses";
import { findProjectById, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import { findLatestQuoteRevision, findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findQuoteLineById, listLineageLinesByProjects, listQuoteLinesByRevision, listQuoteLinesByRevisions } from "@/repositories/quote-lines";
import { findVendorNamesByIds } from "@/repositories/vendors";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findLineLinks,
  lineChains,
  listLineVendorEvidenceTypes,
  listLinkProjects,
  type LineLinks,
} from "@/repositories/quote-line-links";

// 06-07(EXP-07 · D-609 · Q3 · X-1 · X-2 · N-1 · N-2): 카드 쪽 연결 대상 — S10 고르기 목록 · 남은 실행가 식 한 곳 · 프로젝트 행 잠금과
// 재판정 한 곳. 고르기 목록 두 함수는 트랜잭션 밖 읽기(표시 — 잠금 없음)이고, 서버 판정은 잠근 몸통(`runCreate` 등)이 다시 한다.

export class StaleQuoteRevisionError extends UserFacingError {
  constructor() {
    super("견적 새 차수 · 새로 고침");
  }
}

export class DroppedQuoteLineError extends UserFacingError {
  constructor() {
    super("견적 줄 빠짐 · 새로 고침");
  }
}

const PROJECTS_VIEW_DENIED = "프로젝트 보기 권한 없음";
const LINK_PICK_LIMIT = 50;

// 05 `domain/expenses/pick.ts`의 비공개 결재 상태 낱말 표와 같은 값(그 파일은 열지 않는다 — 06-07 파일 한도).
const APPROVAL_STATUS_WORDS: Record<string, string> = { submitted: "결재 중", in_review: "결재 중", approved: "승인", rejected: "반려", withdrawn: "회수" };

// ── 남은 실행가 식 한 곳(Q3 「빼기」 · X-5) ─────────────────────────────────

/** 남은 실행가 바탕 — 줄마다 고른 증빙 규칙 · 오늘 세율(평범한 객체, 06-03 tx 규약). */
export type LineRoomBasis = { rates: TaxRates; rules: Record<string, TaxRule>; defaultRule: TaxRule };

// 줄들의 바탕을 묶어 읽는다(E-33) — 거래처 기본 증빙 종류 한 쿼리 · 코드표 한 번 · 세율 한 번. 줄마다 다시 읽지 않는다.
export async function loadLineRoomBasis(viewer: Viewer, lineIds: string[]): Promise<LineRoomBasis> {
  const evidenceTypes = await listLineVendorEvidenceTypes(viewer, lineIds);
  const items = await listCodeItems(viewer, { tableKey: "evidence_type", scope: { rows: "all", includeArchived: false }, includeInactive: false });
  const ruleOf = new Map<string, TaxRule>();
  for (const item of items) {
    const parsed = taxRuleSchema.safeParse(item.taxRule);
    if (parsed.success) ruleOf.set(item.value, parsed.data);
  }
  const defaultRule: TaxRule = ruleOf.get(CARD_RECEIPT_CODE) ?? { ruleKind: "none" };
  const rules: Record<string, TaxRule> = {};
  for (const lineId of lineIds) {
    const code = evidenceTypes.get(lineId) ?? null;
    rules[lineId] = (code ? ruleOf.get(code) : undefined) ?? defaultRule;
  }
  return { rates: await loadTaxRates(seoulToday()), rules, defaultRule };
}

// 구매 요청 예상 공급가 — 부가세 별도 · 없음은 카드와 같은 역산, 원천징수 · 회사 대납은 부가세를 가르지 않고 예상 금액 그대로(X-5).
export function purchaseEstimateSupply(estimate: MoneyInput, basis: LineRoomBasis, lineId: string): number {
  const rule = basis.rules[lineId] ?? basis.defaultRule;
  if (rule.ruleKind === "vat_surcharge" || rule.ruleKind === "none") return splitCardTotal({ money: estimate, rule }, basis.rates).supplyKrw;
  return toKrw(estimate);
}

export type LineRoomCount = { count: number; sum: number };
export type LineRoom = { otherSupplies: Money[]; cards: LineRoomCount; requests: LineRoomCount };

function krwMoney(amountKrw: number): Money {
  return moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1", amountKrw });
}

// 판정 대상(`exclude`)을 뺀 그 줄 사슬의 카드 사용 공급가 + `신청됨` 요청 예상 공급가. 앞 차수 줄의 요청도 이 줄의 바탕으로 셈한다.
export function lineRoom(input: {
  links: ReadonlyMap<string, LineLinks>;
  basis: LineRoomBasis;
  lineId: string;
  exclude: { usageId?: string; requestId?: string };
}): LineRoom {
  const links = input.links.get(input.lineId);
  const cardSupplies = (links?.cardUsages ?? []).filter((usage) => usage.id !== input.exclude.usageId).map((usage) => usage.supplyKrw);
  const requestSupplies = (links?.purchaseRequests ?? [])
    .filter((request) => request.id !== input.exclude.requestId)
    .map((request) => purchaseEstimateSupply(request.estimate, input.basis, input.lineId));
  return {
    otherSupplies: [...cardSupplies, ...requestSupplies].map(krwMoney),
    cards: { count: cardSupplies.length, sum: sumKrw(cardSupplies) },
    requests: { count: requestSupplies.length, sum: sumKrw(requestSupplies) },
  };
}

// S9 줄 아래 힌트 · S10 2행 · 06-08 S12 힌트가 함께 쓰는 글자 — 0건인 부분은 뺀다.
export function lineRoomHint(input: { remaining: number; cards: LineRoomCount; requests: LineRoomCount }): string {
  const parts = [`남은 실행가 ${formatKrw(input.remaining)}`];
  if (input.cards.count > 0) parts.push(`카드 사용 ${input.cards.count}건 ${formatKrw(input.cards.sum)}`);
  if (input.requests.count > 0) parts.push(`구매 요청 ${input.requests.count}건 ${formatKrw(input.requests.sum)}`);
  return parts.join(" · ");
}

// ── 프로젝트 행 잠금 · 재판정 한 곳(X-2) ───────────────────────────────────

// 카드 쪽 몸통이 첫 줄에 부른다 — tx 리포지토리 둘만(06-03 tx 규약). 입구(연결을 고르는 몸통)는 `revisionId`를 넘겨 최신 차수를 다시 본다.
// 프로젝트 하나만 잡는다 — 여럿이면 부르는 쪽이 id 오름차순으로 차례로 부른다(E-9).
export async function lockProjectForLinkWrite(
  viewer: Viewer,
  input: { projectId: string; revisionId?: string; allowCompleted?: boolean },
  tx: DbOrTx,
): Promise<ProjectRow> {
  const locked = await lockProjectForWrite(viewer, input.projectId, tx);
  // 보관 — 사전 조회 뒤 잠금 전에 보관됐을 수 있어 잠근 행으로 다시 본다(리뷰 P3-4).
  if (!locked || locked.archivedAt) throw new ProjectNotFoundError();
  if (locked.status === "completed" && !input.allowCompleted) throw new CompletedProjectError(quoteLockReason({ status: locked.status }) ?? undefined);
  if (input.revisionId !== undefined) {
    const latest = await findLatestQuoteRevision(viewer, input.projectId, tx);
    if (latest?.id !== input.revisionId) throw new StaleQuoteRevisionError();
  }
  return locked;
}

// 고정 연결의 현재 줄(N-1 · N-2) — `lockProjectForLinkWrite` 다음에만 부른다(그 행을 쥔 동안 사슬이 바뀌지 않는다).
// 사슬이 현재 차수에 닿지 않으면(새 차수에서 빠진 줄 · 보관된 현재 줄) 거부한다.
export async function currentLineForFixedLink(viewer: Viewer, input: { projectId: string; lineId: string }, tx: DbOrTx): Promise<string> {
  const lines = await listLineageLinesByProjects(viewer, [input.projectId], tx);
  const latest = await findLatestQuoteRevision(viewer, input.projectId, tx);
  const current = lineChains(viewer, lines, [input.lineId], latest?.seq).get(input.lineId)?.currentLineId ?? null;
  if (!current) throw new DroppedQuoteLineError();
  return current;
}

// ── S10 고르기 목록(트랜잭션 밖 읽기) ──────────────────────────────────────

export type CardLinkProjectDto = {
  id: string;
  number: string;
  name: string;
  /** 2행 — `{상태} · 담당 {PM}` 또는 고를 수 없는 이유(`완료 · 견적 줄 잠김`). */
  note: string;
  selectable: boolean;
};

export const CARD_LINK_PROJECT_SPEC: DtoSpec<CardLinkProjectDto, CardLinkProjectDto> = {
  fields: (["id", "number", "name", "note", "selectable"] as const).map((key) => ({ key, from: key, infoItem: "project.value" })),
};

registerDto({ name: "CardLinkProjectDto", fields: CARD_LINK_PROJECT_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

const STATUS_ORDER = ["in_progress", "bidding", "settling", "completed", "lost"] as const;

// 프로젝트를 카드 연결로 고를 수 없는 이유(완료 — D-47) — S10 목록 · 새 건 기본값(M-4)이 같은 판정을 쓴다.
export function projectLinkLock(status: string): string | null {
  return status === "completed" ? quoteLockReason({ status }) : null;
}

export async function searchProjectsForCardLink(
  viewer: Viewer,
  input: { query: string },
): Promise<{ rows: Partial<CardLinkProjectDto>[]; truncated: boolean; subtitle: string }> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  // 대리 등록 권한자는 완료 프로젝트도 고른다(견적 외 비용만 — U-4 · Q-B). 2행은 그대로 잠김 이유.
  const proxy = await can(viewer, "cards.proxy", "write");
  const query = input.query.trim();
  const found = await listLinkProjects(viewer, { query: query === "" ? null : query, limit: LINK_PICK_LIMIT + 1 });
  const kept = found.slice(0, LINK_PICK_LIMIT);
  const rows: CardLinkProjectDto[] = kept.map((row) => {
    const word = PROJECT_STATUS_WORD[row.status as keyof typeof PROJECT_STATUS_WORD] ?? row.status;
    const lock = projectLinkLock(row.status);
    return { id: row.id, number: row.number, name: row.name, note: lock ?? `${word} · 담당 ${row.pmName ?? "—"}`, selectable: lock === null || (proxy && row.status === "completed") };
  });
  const subtitle = STATUS_ORDER.flatMap((status) => {
    const count = kept.filter((row) => row.status === status).length;
    return count > 0 ? [`${PROJECT_STATUS_WORD[status]} ${count}`] : [];
  }).join(" · ");
  const projected = (await projectMany(viewer, rows, CARD_LINK_PROJECT_SPEC)).filter((row) => row.id !== undefined);
  return { rows: projected, truncated: found.length > LINK_PICK_LIMIT, subtitle };
}

export type CardLinkLineDto = {
  id: string;
  lineNo: number;
  itemName: string;
  vendorName: string | null;
  execution: Money;
  /** 남은 실행가(Q3) — 폼의 실행가 초과 막힘이 이 값과 서버 계산 공급가를 견준다. */
  remainingKrw: number;
  /** `남은 실행가 {값} · 카드 사용 {N}건 {합} · 구매 요청 {M}건 {합}` — S9 줄 아래 힌트 · S10 2행. */
  hint: string;
  selectable: boolean;
  /** 고를 수 없는 이유(반대쪽 지출결의 · 실행가 소진 · 완료). */
  reason: string | null;
  current: boolean;
};

export const CARD_LINK_LINE_SPEC: DtoSpec<CardLinkLineDto, CardLinkLineDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "lineNo", from: "lineNo", infoItem: "project.value" },
    { key: "itemName", from: "itemName", infoItem: "project.value" },
    { key: "vendorName", from: "vendorName", infoItem: ["project.value", "vendor.value"] },
    { key: "execution", from: "execution", infoItem: "quote.amount" },
    { key: "remainingKrw", from: "remainingKrw", infoItem: "quote.amount" },
    { key: "hint", from: "hint", infoItem: "quote.amount" },
    { key: "selectable", from: "selectable", infoItem: "project.value" },
    { key: "reason", from: "reason", infoItem: ["project.value", "expense.amount"] },
    { key: "current", from: "current", infoItem: "project.value" },
  ],
};

registerDto({ name: "CardLinkLineDto", fields: CARD_LINK_LINE_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

const ZERO_SUPPLY: MoneyInput = { currency: "KRW", amount: 0, fxRate: 1 };

// 현재 차수의 줄(취소 · 조정 줄 제외 — D-612와 같은 결). 줄마다 고를 수 있음 · 이유 · 남은 실행가를 서버가 정한다.
export async function searchLinesForCardLink(
  viewer: Viewer,
  input: { projectId: string; query: string; currentLineId?: string | null },
): Promise<{ rows: Partial<CardLinkLineDto>[]; truncated: boolean; subtitle: string; total: number; selectableCount: number }> {
  if (!(await can(viewer, "projects", "view"))) throw new ForbiddenError(PROJECTS_VIEW_DENIED);
  const project = await findProjectById(viewer, input.projectId);
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
  const lock = projectLinkLock(project.status);

  const all: CardLinkLineDto[] = numbered.map(({ line, lineNo }) => {
    const link = links.get(line.id);
    const execution = link?.currentExecution ?? lineExecution(line);
    const room = lineRoom({ links, basis, lineId: line.id, exclude: {} });
    const remainingKrw = cardExecutionCap({ execution, otherSupplies: room.otherSupplies, supply: ZERO_SUPPLY, source: "entry" }).remaining.amountKrw;
    const expense = link?.expenses.at(-1);
    let reason: string | null = null;
    if (lock) {
      reason = lock;
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
      vendorName: line.vendorId ? (vendorNames.get(line.vendorId) ?? null) : null,
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
    subtitle: `${project.name} · ${all.length}줄 · 카드로 이을 수 있는 줄 ${selectableCount}`,
    total: all.length,
    selectableCount,
  };
}

// ── 새 건 기본값(M-4)의 진입 값 — S10과 같은 판정 ────────────────────────────

export type CardLinkProjectChoice = { id: string; label: string };
export type CardLinkLineChoice = { id: string; itemName: string; remainingKrw: number | null; hint: string | null };

// 고를 수 있는 프로젝트면 `{번호} {이름}`(투영 뒤) — 볼 수 없거나 · 보관 · 완료면 null(완료는 `completedOutOfQuote` — 권한자의 견적 외 비용 — 일 때만 통과).
export async function cardLinkProjectChoice(
  viewer: Viewer,
  projectId: string,
  options: { completedOutOfQuote?: boolean } = {},
): Promise<CardLinkProjectChoice | null> {
  if (!(await can(viewer, "projects", "view"))) return null;
  const project = await findProjectById(viewer, projectId);
  if (!project || project.archivedAt || (projectLinkLock(project.status) && !(options.completedOutOfQuote && project.status === "completed"))) return null;
  const [row] = await projectMany(viewer, [{ id: project.id, number: project.number, name: project.name, note: "", selectable: true }], CARD_LINK_PROJECT_SPEC);
  return row?.id && row.number !== undefined && row.name !== undefined ? { id: row.id, label: `${row.number} ${row.name}` } : null;
}

// 진입 줄(S14 `?line=`) — S10 줄 목록에서 고를 수 있는 줄일 때만 그 줄과 프로젝트.
export async function cardLinkLineChoice(viewer: Viewer, lineId: string): Promise<{ project: CardLinkProjectChoice; line: CardLinkLineChoice } | null> {
  const line = await findQuoteLineById(viewer, lineId);
  const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
  if (!revision) return null;
  const project = await cardLinkProjectChoice(viewer, revision.projectId);
  if (!project) return null;
  const found = await searchLinesForCardLink(viewer, { projectId: project.id, query: "", currentLineId: lineId });
  const row = found.rows.find((candidate) => candidate.id === lineId);
  // quote.amount가 가려진 계정은 남은 실행가 · 힌트가 없다 — 줄은 그대로 채운다(S10 고르기와 같은 판정 · 실행가 초과는 서버가 다시 본다).
  if (!row?.selectable || row.itemName === undefined) return null;
  return { project, line: { id: lineId, itemName: row.itemName, remainingKrw: row.remainingKrw ?? null, hint: row.hint ?? null } };
}

// ── 견적 표 줄 사실(N-3 — 보관 대신 취소 · 실행가 초과 표시) ─────────────────

// 트랜잭션 밖 읽기(`searchLinesForCardLink`와 같은 방식) — 그 차수 줄들의 연결 한 번 · 바탕 한 번. 남은 실행가를 따로 셈하지 않는다.
export async function lineCardSideFacts(viewer: Viewer, input: { revisionId: string }): Promise<Map<string, { linked: boolean; overKrw: number | null }>> {
  const lines = await listQuoteLinesByRevision(viewer, input.revisionId);
  const lineIds = lines.map((line) => line.id);
  const links = await findLineLinks(viewer, lineIds);
  const basis = await loadLineRoomBasis(viewer, lineIds);
  const facts = new Map<string, { linked: boolean; overKrw: number | null }>();
  for (const line of lines) {
    const link = links.get(line.id);
    const room = lineRoom({ links, basis, lineId: line.id, exclude: {} });
    const used = sumKrw(room.otherSupplies.map((money) => money.amountKrw));
    const execution = (link?.currentExecution ?? lineExecution(line)).amountKrw;
    facts.set(line.id, { linked: room.cards.count + room.requests.count > 0, overKrw: used > execution ? diffKrw(used, execution) : null });
  }
  return facts;
}
