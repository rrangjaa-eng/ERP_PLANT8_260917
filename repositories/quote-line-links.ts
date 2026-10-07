import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, expenseEvidenceReviews, expensePayments, expenses, projects, purchaseRequests, quoteLines, quoteRevisions, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { moneyFromRow, type Money } from "@/domain/money";
import { resolveLinkedDocumentsByLineage, type LineageLine } from "@/domain/quotes/lineage";
import type { DbOrTx } from "@/repositories/document-counters";
import { listNumberedByLines, type NumberedLineExpense } from "@/repositories/expenses";
import { listLineageLinesByProjects } from "@/repositories/quote-lines";

// 06-07(B-1 · D-609 · Q3 · X-1 · N-1 · H-4): 견적 줄 잠금과 줄마다 계보 사슬 전체의 연결 문서 — 이중 연결 · 실행가 상한 ·
// 줄 상태 파생 · D-612 · 줄 보관 붙잡기(N-3)의 공용 입력. 문서 행은 옮기지 않는다(계보로 읽는다).

// 잠금은 이 빌더 하나로만 — 줄 id 순서. 전역 순서는 프로젝트 행 → 견적 줄(id 순) → 문서 행(N-3 · 교착 방지).
export function lockQuoteLinesQuery(viewer: Viewer, lineIds: readonly string[], tx: DbOrTx) {
  void viewer;
  return tx
    .select({
      id: quoteLines.id,
      revisionId: quoteLines.revisionId,
      lineKind: quoteLines.lineKind,
      lineStatus: quoteLines.lineStatus,
      archivedAt: quoteLines.archivedAt,
      executionCurrency: quoteLines.executionCurrency,
      executionForeignAmount: quoteLines.executionForeignAmount,
      executionFxRate: quoteLines.executionFxRate,
      executionAmountKrw: quoteLines.executionAmountKrw,
    })
    .from(quoteLines)
    .where(inArray(quoteLines.id, [...lineIds]))
    .orderBy(asc(quoteLines.id))
    .for("update");
}

export type LockedQuoteLine = Awaited<ReturnType<typeof lockQuoteLinesQuery>>[number];

export async function lockQuoteLines(viewer: Viewer, lineIds: readonly string[], tx: DbOrTx): Promise<LockedQuoteLine[]> {
  const unique = [...new Set(lineIds)];
  if (unique.length === 0) return [];
  return lockQuoteLinesQuery(viewer, unique, tx);
}

export type LineChain = { currentLineId: string | null; chainLineIds: string[] };

// 줄 id마다 계보 사슬. 현재 차수 줄의 사슬(자기 + 앞 차수 줄)은 05 `resolveLinkedDocumentsByLineage`로 푼다. 어느 현재 줄에도
// 닿지 않는 줄(새 차수에서 빠진 줄 · 보관된 현재 줄)은 05에 없는 갈래 · 역참조 — `copiedFromLineId` 역참조로 가장 늦은 후손을 찾고
// 거기서 뿌리까지 푼다(E-44). `lines`는 한 프로젝트의 계보 줄이어야 한다(최신 순번이 프로젝트마다 다르다).
// `latestSeq`는 그 프로젝트의 최신 차수 순번 — 최신 차수의 줄이 모두 보관돼 `lines`에 없으면 현재 줄이 없다(앞 차수 줄을 현재로 보지 않는다).
export function lineChains(viewer: Viewer, lines: readonly LineageLine[], lineIds: readonly string[], latestSeq?: number): Map<string, LineChain> {
  void viewer;
  const reachesLatest = latestSeq === undefined || lines.some((line) => line.revisionSeq === latestSeq);
  const { byCurrentLine } = reachesLatest
    ? resolveLinkedDocumentsByLineage(lines, new Map(lines.map((line) => [line.id, [line.id]])))
    : { byCurrentLine: new Map<string, string[]>() };
  const currentOf = new Map<string, string>();
  for (const [current, chain] of byCurrentLine) for (const id of chain) if (!currentOf.has(id)) currentOf.set(id, current);
  const byId = new Map(lines.map((line) => [line.id, line]));
  const copiesOf = new Map<string, LineageLine[]>();
  for (const line of lines) {
    if (line.copiedFromLineId) copiesOf.set(line.copiedFromLineId, [...(copiesOf.get(line.copiedFromLineId) ?? []), line]);
  }

  const result = new Map<string, LineChain>();
  for (const lineId of lineIds) {
    const current = currentOf.get(lineId);
    if (current) {
      result.set(lineId, { currentLineId: current, chainLineIds: byCurrentLine.get(current) ?? [current] });
      continue;
    }
    let tip = lineId;
    const seen = new Set([lineId]);
    for (;;) {
      const next = (copiesOf.get(tip) ?? []).filter((copy) => !seen.has(copy.id)).sort((a, b) => b.revisionSeq - a.revisionSeq)[0];
      if (!next) break;
      seen.add(next.id);
      tip = next.id;
    }
    const chain: string[] = [];
    for (let cursor: string | null = tip; cursor && !chain.includes(cursor); cursor = byId.get(cursor)?.copiedFromLineId ?? null) chain.push(cursor);
    if (!chain.includes(lineId)) chain.push(lineId);
    result.set(lineId, { currentLineId: currentOf.get(tip) === tip ? tip : null, chainLineIds: chain });
  }
  return result;
}

export type LineCardUsageLink = { id: string; quoteLineId: string; supplyKrw: number };
export type LinePurchaseRequestLink = { id: string; quoteLineId: string; estimate: Money };

export type LineLinks = {
  /** 사슬의 현재 차수 줄 — 없으면(빠진 줄 · 보관된 현재 줄) null. */
  currentLineId: string | null;
  /** 현재 줄의 실행가(N-1) — 카드 쪽 모든 상한의 바탕. 현재 줄이 없으면 null. */
  currentExecution: Money | null;
  /** 사슬 위 이어진 지출결의 — 05 `listNumberedByLines`(번호 있음 · 삭제 · 종결 안 됨, 06-28), 제출 시각 · id 순. */
  expenses: (NumberedLineExpense & { quoteLineId: string })[];
  /** 사슬 위 보관 안 된 카드 사용(H-4). */
  cardUsages: LineCardUsageLink[];
  /** 사슬 위 `신청됨` 구매 요청(Q3 「빼기」 · UC-3). */
  purchaseRequests: LinePurchaseRequestLink[];
};

// 줄 id마다 사슬 전체의 연결. 모든 읽기가 `tx`로만 돈다 — 상한을 부르는 몸통은 현재 줄을 먼저 잠근 뒤 부른다.
export async function findLineLinks(viewer: Viewer, lineIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, LineLinks>> {
  const ids = [...new Set(lineIds)];
  if (ids.length === 0) return new Map();
  const owners = await tx
    .select({ id: quoteLines.id, projectId: quoteRevisions.projectId })
    .from(quoteLines)
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .where(inArray(quoteLines.id, ids));
  const projectIds = [...new Set(owners.map((owner) => owner.projectId))];
  const lineage = await listLineageLinesByProjects(viewer, projectIds, tx);
  const latest = await tx
    .select({ projectId: quoteRevisions.projectId, seq: sql<number>`max(${quoteRevisions.seq})`.mapWith(Number) })
    .from(quoteRevisions)
    .where(inArray(quoteRevisions.projectId, projectIds))
    .groupBy(quoteRevisions.projectId);
  const latestSeqOf = new Map(latest.map((row) => [row.projectId, row.seq]));
  const lineageById = new Map(lineage.map((line) => [line.id, line]));

  const chains = new Map<string, LineChain>();
  for (const projectId of projectIds) {
    const projectLines = lineage.filter((line) => line.projectId === projectId);
    const asked = owners.filter((owner) => owner.projectId === projectId).map((owner) => owner.id);
    for (const [lineId, chain] of lineChains(viewer, projectLines, asked, latestSeqOf.get(projectId))) chains.set(lineId, chain);
  }
  for (const lineId of ids) if (!chains.has(lineId)) chains.set(lineId, { currentLineId: null, chainLineIds: [lineId] });

  const allLineIds = [...new Set([...chains.values()].flatMap((chain) => chain.chainLineIds))];
  const expenses = await listNumberedByLines(viewer, allLineIds, tx);
  const usages = await tx
    .select({ id: corpCardUsages.id, quoteLineId: corpCardUsages.quoteLineId, supplyKrw: corpCardUsages.supplyKrw })
    .from(corpCardUsages)
    .where(and(inArray(corpCardUsages.quoteLineId, allLineIds), isNull(corpCardUsages.archivedAt)))
    .orderBy(asc(corpCardUsages.createdAt), asc(corpCardUsages.id));
  const requests = await tx
    .select({
      id: purchaseRequests.id,
      quoteLineId: purchaseRequests.quoteLineId,
      currency: purchaseRequests.estimateCurrency,
      foreignAmount: purchaseRequests.estimateForeignAmount,
      fxRate: purchaseRequests.estimateFxRate,
      amountKrw: purchaseRequests.estimateAmountKrw,
    })
    .from(purchaseRequests)
    .where(and(inArray(purchaseRequests.quoteLineId, allLineIds), eq(purchaseRequests.status, "requested")))
    .orderBy(asc(purchaseRequests.createdAt), asc(purchaseRequests.id));

  const result = new Map<string, LineLinks>();
  for (const lineId of ids) {
    const chain = chains.get(lineId) ?? { currentLineId: null, chainLineIds: [lineId] };
    const inChain = new Set(chain.chainLineIds);
    const current = chain.currentLineId ? lineageById.get(chain.currentLineId) : undefined;
    result.set(lineId, {
      currentLineId: chain.currentLineId,
      currentExecution: current
        ? moneyFromRow({
            currency: current.executionCurrency,
            foreignAmount: current.executionForeignAmount,
            fxRate: current.executionFxRate,
            amountKrw: current.executionAmountKrw,
          })
        : null,
      expenses: expenses.filter((doc) => inChain.has(doc.quoteLineId)),
      cardUsages: usages.flatMap((usage) =>
        usage.quoteLineId && inChain.has(usage.quoteLineId) ? [{ id: usage.id, quoteLineId: usage.quoteLineId, supplyKrw: usage.supplyKrw }] : [],
      ),
      purchaseRequests: requests.flatMap((request) =>
        request.quoteLineId && inChain.has(request.quoteLineId)
          ? [{ id: request.id, quoteLineId: request.quoteLineId, estimate: moneyFromRow(request) }]
          : [],
      ),
    });
  }
  return result;
}

// 06-13 「06-03 tx 규약」 — 아래 셋은 트랜잭션 안에서도 불리므로 `tx`가 필수다(기본값 없음 — 전역 풀로 떨어질 길이 없다).

export type ExpenseDocFact = { expenseId: string; paid: boolean; payDate: string | null; waived: boolean; prepaid: boolean };

// 문서마다 지급 · 증빙 면제 · 선결제 사실을 한 쿼리로 — 살아 있는 지급(취소 안 됨, D-606)만 `paid`. 파일 수는 세지 않는다(C5 — 증빙 유무는 hasEvidence).
export async function findExpenseDocFacts(viewer: Viewer, expenseIds: readonly string[], tx: DbOrTx): Promise<Map<string, ExpenseDocFact>> {
  void viewer;
  const ids = [...new Set(expenseIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: expenses.id, prepaid: expenses.prepaid, payDate: expensePayments.payDate, reviewStatus: expenseEvidenceReviews.status })
    .from(expenses)
    .leftJoin(expensePayments, and(eq(expensePayments.expenseId, expenses.id), isNull(expensePayments.cancelledAt)))
    .leftJoin(expenseEvidenceReviews, eq(expenseEvidenceReviews.expenseId, expenses.id))
    .where(inArray(expenses.id, ids));
  return new Map(
    rows.map((row) => [
      row.id,
      { expenseId: row.id, paid: row.payDate !== null, payDate: row.payDate, waived: row.reviewStatus === "waived", prepaid: row.prepaid },
    ]),
  );
}

// 트랜잭션 밖 읽기(견적 줄 표 · 행 행동 열) — 같은 조회를 기본 연결로.
export function listExpenseDocFacts(viewer: Viewer, expenseIds: readonly string[]): Promise<Map<string, ExpenseDocFact>> {
  return findExpenseDocFacts(viewer, expenseIds, db);
}

// 지급 트랜잭션 맨 앞(N-2) — 문서의 견적 줄 id(팀 비용 문서는 빈 배열).
export async function findExpenseQuoteLineIds(viewer: Viewer, expenseId: string, tx: DbOrTx): Promise<string[]> {
  void viewer;
  const rows = await tx.select({ quoteLineId: expenses.quoteLineId }).from(expenses).where(eq(expenses.id, expenseId));
  return rows.flatMap((row) => (row.quoteLineId ? [row.quoteLineId] : []));
}

// 잠근 줄의 거래처 이름(온라인구매 문 판정 입력) — 거래처 없는 줄은 null.
export async function findLineVendorNames(viewer: Viewer, lineIds: readonly string[], tx: DbOrTx): Promise<Map<string, string | null>> {
  void viewer;
  const ids = [...new Set(lineIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: quoteLines.id, vendorName: vendors.name })
    .from(quoteLines)
    .leftJoin(vendors, eq(vendors.id, quoteLines.vendorId))
    .where(inArray(quoteLines.id, ids));
  return new Map(rows.map((row) => [row.id, row.vendorName ?? null]));
}

// 줄들의 거래처 기본 증빙 종류를 한 쿼리로(E-33) — 거래처 없는 줄은 null.
export async function listLineVendorEvidenceTypes(viewer: Viewer, lineIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, string | null>> {
  void viewer;
  if (lineIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: quoteLines.id, evidenceType: vendors.defaultEvidenceType })
    .from(quoteLines)
    .leftJoin(vendors, eq(vendors.id, quoteLines.vendorId))
    .where(inArray(quoteLines.id, [...new Set(lineIds)]));
  return new Map(rows.map((row) => [row.id, row.evidenceType ?? null]));
}

export type LinkProjectRow = { id: string; number: string; name: string; status: string; clientName: string | null; pmName: string | null };

// S10 프로젝트 고르기 후보 — 보관 안 된 프로젝트, 번호 · 이름 · 클라이언트 부분 일치. 미수주는 끝, 그 안에서 번호 내림차순(새 것 먼저).
export async function listLinkProjects(viewer: Viewer, input: { query: string | null; limit: number }): Promise<LinkProjectRow[]> {
  void viewer;
  const conditions = [isNull(projects.archivedAt)];
  if (input.query) {
    const like = `%${input.query}%`;
    const match = or(ilike(projects.name, like), ilike(projects.number, like), ilike(vendors.name, like));
    if (match) conditions.push(match);
  }
  return db
    .select({ id: projects.id, number: projects.number, name: projects.name, status: projects.status, clientName: vendors.name, pmName: users.name })
    .from(projects)
    .leftJoin(vendors, eq(vendors.id, projects.clientId))
    .leftJoin(users, eq(users.id, projects.pmUserId))
    .where(and(...conditions))
    .orderBy(sql`(${projects.status} = 'lost')`, desc(projects.number), asc(projects.id))
    .limit(input.limit);
}
