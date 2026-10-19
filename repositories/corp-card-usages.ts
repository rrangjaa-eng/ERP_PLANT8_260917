import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { corpCardUsages, corpCards, projects, purchaseRequests, quoteLines, quoteRevisions, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { liveLinkExists } from "@/repositories/evidence-record-links";
import { aliveFileExists } from "@/repositories/files";

// 06-05(EXP-07): 법인카드 사용 쓰기 · 목록 · 직전 등록. 범위(UA-612)는 목록 쿼리의 조건에서 갈린다 — 보관된 건은 늘 뺀다(H-4 기반).

export type CardUsageRow = InferSelectModel<typeof corpCardUsages>;
// 06.5 D-6503: 새 행은 번호를 반드시 받는다 — 칸은 기존 행 때문에 NULL 허용.
export type CardUsageInsert = Omit<
  InferInsertModel<typeof corpCardUsages>,
  "id" | "version" | "source" | "archivedAt" | "archivedBy" | "createdAt" | "updatedAt" | "number"
> & { number: string };

export async function insertCardUsage(viewer: Viewer, values: CardUsageInsert, tx: DbOrTx): Promise<CardUsageRow> {
  void viewer;
  const [row] = await tx.insert(corpCardUsages).values(values).returning();
  if (!row) throw new Error("카드 사용 INSERT 결과 없음");
  return row;
}

// 06.5 D-6509: 중복 방지 키로 찾기 — 보관 행 포함(유일 색인이 보관 행도 덮는다). 같은 행위자인지는 domain이 가른다.
export async function findCardUsageByIdempotencyKey(viewer: Viewer, key: string, tx: DbOrTx = db): Promise<CardUsageRow | null> {
  void viewer;
  const [row] = await tx.select().from(corpCardUsages).where(eq(corpCardUsages.idempotencyKey, key)).limit(1);
  return row ?? null;
}

/** 목록 범위 — 전부(권한자 · 전사 범위) 또는 직원(자기 카드 · 자기 팀 카드 · 자기 등록). */
export type CardUsageScope = { kind: "all" } | { kind: "own"; userId: string; teamId: string | null };

export type CardUsageLinkFilter = "quote" | "out_of_quote" | "team";

export type CardUsageFilter = {
  /** 월 첫날(포함) · 다음 달 첫날(제외) — `YYYY-MM-DD`. */
  from: string;
  to: string;
  cardId?: string;
  link?: CardUsageLinkFilter;
  proxyOnly?: boolean;
};

export type CardUsageListRow = CardUsageRow & {
  cardLabel: string;
  cardIssuer: string;
  cardLast4: string;
  merchantName: string | null;
  teamName: string | null;
  registeredByName: string;
  /** 06-07 D-1 — 견적 줄 연결의 줄 · 프로젝트(팀 비용이면 null). */
  lineItemName: string | null;
  lineKind: string | null;
  lineRevisionId: string | null;
  projectName: string | null;
  /** 06-09 권리(O-11) — 연결 줄 프로젝트의 상태(팀 비용이면 null). */
  projectStatus: string | null;
  /** 06-12 구매 완료로 생긴 건의 구매 요청 번호(등록 칸 `구매 요청 {번호}`) — 아니면 null. */
  purchaseNumber: string | null;
  /** 06-25(C5 · CF-6) 그 건의 살아 있는(removed_at · voided_at 없음) 카드 전표 파일 행이 1개 이상. */
  hasCardSlip: boolean;
};

function scopeCondition(scope: CardUsageScope): SQL | undefined {
  if (scope.kind === "all") return undefined;
  const branches: SQL[] = [eq(corpCards.holderUserId, scope.userId), eq(corpCardUsages.registeredBy, scope.userId)];
  if (scope.teamId) branches.push(eq(corpCards.teamId, scope.teamId));
  return or(...branches);
}

function linkCondition(link: CardUsageLinkFilter): SQL | undefined {
  if (link === "team") return eq(corpCardUsages.linkKind, "team_cost");
  if (link === "out_of_quote") return and(eq(corpCardUsages.linkKind, "quote_line"), eq(quoteLines.lineKind, "out_of_quote"));
  return and(eq(corpCardUsages.linkKind, "quote_line"), ne(quoteLines.lineKind, "out_of_quote"));
}

// 카드 그룹(별칭 · 발급사 · 뒤 4자리) → 사용일 오름차순 → 등록 순.
// 읽기도 호출부 tx를 받는다 — domain이 lock_timeout을 건 트랜잭션 안에서 읽어 잠금 대기가 끝없이 늘지 않게 한다.
export async function listCardUsageRows(
  viewer: Viewer,
  input: { scope: CardUsageScope; filter: CardUsageFilter },
  tx: DbOrTx = db,
): Promise<CardUsageListRow[]> {
  void viewer;
  const { filter } = input;
  const conditions: (SQL | undefined)[] = [
    isNull(corpCardUsages.archivedAt),
    gte(corpCardUsages.usedOn, filter.from),
    lt(corpCardUsages.usedOn, filter.to),
    scopeCondition(input.scope),
  ];
  if (filter.cardId) conditions.push(eq(corpCardUsages.corpCardId, filter.cardId));
  if (filter.link) conditions.push(linkCondition(filter.link));
  if (filter.proxyOnly) conditions.push(eq(corpCardUsages.registeredVia, "proxy"));

  const rows = await tx
    .select({
      usage: corpCardUsages,
      cardLabel: corpCards.label,
      cardIssuer: corpCards.issuer,
      cardLast4: corpCards.numberLast4,
      merchantName: vendors.name,
      teamName: teams.name,
      registeredByName: users.name,
      lineItemName: quoteLines.itemName,
      lineKind: quoteLines.lineKind,
      lineRevisionId: quoteLines.revisionId,
      projectName: projects.name,
      projectStatus: projects.status,
      purchaseNumber: purchaseRequests.number,
      // 06-25: 카드 전표 유무 한 조건 — 05 `alive()` 정의(삭제 · 무효 아님) 그대로. 06.1-12(PA-CARDSLIP): 살아 있는 증빙 붙임도 증빙이다(열 머리글 `증빙`).
      hasCardSlip: sql<boolean>`(${aliveFileExists(viewer, "corp_card_usage", corpCardUsages.id)} or ${liveLinkExists(viewer, "corp_card_usage", corpCardUsages.id)})`,
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .innerJoin(users, eq(users.id, corpCardUsages.registeredBy))
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, corpCardUsages.purchaseRequestId))
    .leftJoin(vendors, eq(vendors.id, corpCardUsages.merchantVendorId))
    .leftJoin(teams, eq(teams.id, corpCardUsages.teamId))
    .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .leftJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .leftJoin(projects, eq(projects.id, quoteRevisions.projectId))
    .where(and(...conditions))
    .orderBy(
      asc(corpCards.label),
      asc(corpCards.issuer),
      asc(corpCards.numberLast4),
      asc(corpCards.id),
      asc(corpCardUsages.usedOn),
      asc(corpCardUsages.createdAt),
    );

  return rows.map((row) => ({
    ...row.usage,
    cardLabel: row.cardLabel,
    cardIssuer: row.cardIssuer,
    cardLast4: row.cardLast4,
    merchantName: row.merchantName,
    teamName: row.teamName,
    registeredByName: row.registeredByName,
    lineItemName: row.lineItemName,
    lineKind: row.lineKind,
    lineRevisionId: row.lineRevisionId,
    projectName: row.projectName,
    projectStatus: row.projectStatus,
    purchaseNumber: row.purchaseNumber,
    hasCardSlip: row.hasCardSlip,
  }));
}

// 06-25(E-46): 그 건이 목록 범위(scopeCondition) 안인가 — 보관 여부는 보지 않는다(보관된 건의 전표도 범위 안 사람은 읽는다). 새 범위 판정 없이 목록과 같은 조건 함수.
export async function isCardUsageInListScope(viewer: Viewer, input: { id: string; scope: CardUsageScope }, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const [row] = await tx
    .select({ id: corpCardUsages.id })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .where(and(eq(corpCardUsages.id, input.id), scopeCondition(input.scope)))
    .limit(1);
  return row !== undefined;
}

// 06-25: 카드 전표 완료 통보 · 삭제 · 되돌리기 트랜잭션이 카드 사용 행 하나를 잠근다(보관된 건도 — 파일은 건과 함께 남는다). 지출결의 행은 잠그지 않는다(X-2).
export async function lockCardUsageForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<CardUsageRow | null> {
  void viewer;
  const [row] = await tx.select().from(corpCardUsages).where(eq(corpCardUsages.id, id)).for("update").limit(1);
  return row ?? null;
}

/** 새 건 기본값(M-4)의 「직전 등록」 — 그 사람이 등록한, 보관 안 된 카드 사용 중 가장 최근 것. 06-07: 견적 줄 연결이면 줄 종류 · 프로젝트도. */
export async function findLastCardUsageByRegistrant(
  viewer: Viewer,
  userId: string,
): Promise<(Pick<CardUsageRow, "corpCardId" | "linkKind"> & { lineKind: string | null; projectId: string | null }) | null> {
  void viewer;
  const [row] = await db
    .select({ corpCardId: corpCardUsages.corpCardId, linkKind: corpCardUsages.linkKind, lineKind: quoteLines.lineKind, projectId: quoteRevisions.projectId })
    .from(corpCardUsages)
    .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .leftJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .where(and(eq(corpCardUsages.registeredBy, userId), isNull(corpCardUsages.archivedAt)))
    .orderBy(desc(corpCardUsages.createdAt), desc(corpCardUsages.id))
    .limit(1);
  return row ?? null;
}

// 06-07(S15) — 프로젝트 상세 「법인카드 사용」 재료. 그 프로젝트 차수의 견적 줄(견적 외 비용 포함)에 이은 건만 · 보관 안 된 것만(H-4) ·
// 사용일 오름차순. 팀 비용 건은 견적 줄이 없어 inner join에서 빠진다.
export type ProjectCardUsageRow = Pick<
  CardUsageRow,
  "id" | "usedOn" | "quoteLineId" | "totalAmountKrw" | "supplyKrw" | "registeredVia" | "registeredBy" | "createdAt"
> & {
  merchantName: string | null;
  registeredByName: string;
  lineItemName: string;
  lineKind: string;
  revisionId: string;
  /** 06-12 구매 완료로 생긴 건의 구매 요청 번호 — 아니면 null. */
  purchaseNumber: string | null;
};

export async function listProjectCardUsageRows(viewer: Viewer, projectId: string): Promise<ProjectCardUsageRow[]> {
  void viewer;
  const rows = await db
    .select({
      id: corpCardUsages.id,
      usedOn: corpCardUsages.usedOn,
      quoteLineId: corpCardUsages.quoteLineId,
      totalAmountKrw: corpCardUsages.totalAmountKrw,
      supplyKrw: corpCardUsages.supplyKrw,
      registeredVia: corpCardUsages.registeredVia,
      registeredBy: corpCardUsages.registeredBy,
      createdAt: corpCardUsages.createdAt,
      merchantName: vendors.name,
      registeredByName: users.name,
      lineItemName: quoteLines.itemName,
      lineKind: quoteLines.lineKind,
      revisionId: quoteLines.revisionId,
      purchaseNumber: purchaseRequests.number,
    })
    .from(corpCardUsages)
    .innerJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .innerJoin(users, eq(users.id, corpCardUsages.registeredBy))
    .leftJoin(vendors, eq(vendors.id, corpCardUsages.merchantVendorId))
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, corpCardUsages.purchaseRequestId))
    .where(and(eq(quoteRevisions.projectId, projectId), eq(corpCardUsages.linkKind, "quote_line"), isNull(corpCardUsages.archivedAt)))
    .orderBy(asc(corpCardUsages.usedOn), asc(corpCardUsages.createdAt), asc(corpCardUsages.id));
  return rows;
}

// ── 06-09: 수정 · 삭제(보관) · 되돌리기(보관 해제) ─────────────────────────────

/** 건 하나 — 권리(O-11) · 사전 조회 재료(카드 · 연결 줄 · 프로젝트 상태 · 등록자 · 등록 경로 · version). 트랜잭션 밖에서만 읽는다. */
export type CardUsageForWrite = CardUsageRow & {
  cardLabel: string;
  cardIssuer: string;
  cardLast4: string;
  cardKind: string;
  cardHolderUserId: string | null;
  cardTeamId: string | null;
  merchantName: string | null;
  lineKind: string | null;
  lineItemName: string | null;
  lineRevisionId: string | null;
  projectId: string | null;
  projectStatus: string | null;
};

export async function findCardUsageForWrite(viewer: Viewer, id: string, opts: { includeArchived: boolean }): Promise<CardUsageForWrite | null> {
  void viewer;
  const [row] = await db
    .select({
      usage: corpCardUsages,
      cardLabel: corpCards.label,
      cardIssuer: corpCards.issuer,
      cardLast4: corpCards.numberLast4,
      cardKind: corpCards.kind,
      cardHolderUserId: corpCards.holderUserId,
      cardTeamId: corpCards.teamId,
      merchantName: vendors.name,
      lineKind: quoteLines.lineKind,
      lineItemName: quoteLines.itemName,
      lineRevisionId: quoteLines.revisionId,
      projectId: quoteRevisions.projectId,
      projectStatus: projects.status,
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .leftJoin(vendors, eq(vendors.id, corpCardUsages.merchantVendorId))
    .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .leftJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .leftJoin(projects, eq(projects.id, quoteRevisions.projectId))
    .where(opts.includeArchived ? eq(corpCardUsages.id, id) : and(eq(corpCardUsages.id, id), isNull(corpCardUsages.archivedAt)))
    .limit(1);
  if (!row) return null;
  const { usage, ...rest } = row;
  return { ...usage, ...rest };
}

export type CardUsageUpdateValues = Pick<
  CardUsageInsert,
  | "usedOn"
  | "merchantVendorId"
  | "totalCurrency"
  | "totalForeignAmount"
  | "totalFxRate"
  | "totalAmountKrw"
  | "supplyKrw"
  | "vatKrw"
  | "evidenceTypeCode"
  | "linkKind"
  | "quoteLineId"
  | "teamId"
  | "usedByUserId"
  | "registeredBy"
  | "registeredVia"
  | "memo"
> &
  // 06-12 카드 고치기(구매 완료 건) — 있을 때만 카드 칸도 바꾼다.
  Partial<Pick<CardUsageInsert, "corpCardId">>;

// version 조건 UPDATE(D-609) — 보관 안 된 건 · version 일치일 때만. 바뀌면 새 version, 아니면 null(낡은 version · 그 사이 보관).
export async function updateCardUsageRow(
  viewer: Viewer,
  input: { id: string; version: number; values: CardUsageUpdateValues },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(corpCardUsages)
    .set({ ...input.values, version: sql`${corpCardUsages.version} + 1`, updatedAt: new Date() })
    .where(and(eq(corpCardUsages.id, input.id), eq(corpCardUsages.version, input.version), isNull(corpCardUsages.archivedAt)))
    .returning({ version: corpCardUsages.version });
  return row?.version ?? null;
}

// 삭제 = 보관(ADMN-12 — 행 수 그대로). 보관 안 된 건 · version 일치일 때만.
export async function archiveCardUsageRow(viewer: Viewer, input: { id: string; version: number }, tx: DbOrTx): Promise<number | null> {
  const [row] = await tx
    .update(corpCardUsages)
    .set({ archivedAt: new Date(), archivedBy: viewer.id, version: sql`${corpCardUsages.version} + 1`, updatedAt: new Date() })
    .where(and(eq(corpCardUsages.id, input.id), eq(corpCardUsages.version, input.version), isNull(corpCardUsages.archivedAt)))
    .returning({ version: corpCardUsages.version });
  return row?.version ?? null;
}

// 되돌리기 = 보관 해제. 보관된 건 · version 일치일 때만.
export async function restoreCardUsageRow(viewer: Viewer, input: { id: string; version: number }, tx: DbOrTx): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(corpCardUsages)
    .set({ archivedAt: null, archivedBy: null, version: sql`${corpCardUsages.version} + 1`, updatedAt: new Date() })
    .where(and(eq(corpCardUsages.id, input.id), eq(corpCardUsages.version, input.version), isNotNull(corpCardUsages.archivedAt)))
    .returning({ version: corpCardUsages.version });
  return row?.version ?? null;
}

// ── 06.1-09 카드 대사(EVIDENCE-10 · E28 · E32) ─────────────────────────────────────────────

/** 대사 후보 — 보관 안 된 카드 사용 중 사용일이 파일 줄과 같고 승인번호가 같거나 카드가 같은 것. 「증빙 있음」 · 「카드 명세 붙음」은 부르는 domain이 채운다. */
export type ReconcileCandidateRow = {
  id: string;
  version: number;
  number: string | null;
  corpCardId: string;
  cardIssuer: string;
  cardLast4: string;
  approvalNo: string | null;
  usedOn: string;
  totalAmountKrw: number;
  supplyKrw: number;
  vatKrw: number;
  evidenceTypeCode: string;
  quoteLineId: string | null;
  purchaseRequestId: string | null;
};

export async function findReconcileCandidates(
  viewer: Viewer,
  input: { cardIds: readonly string[]; approvalNos: readonly string[]; usedOns: readonly string[] },
  tx: DbOrTx,
): Promise<ReconcileCandidateRow[]> {
  void viewer;
  if (input.usedOns.length === 0 || (input.cardIds.length === 0 && input.approvalNos.length === 0)) return [];
  const match: SQL[] = [];
  if (input.approvalNos.length > 0) match.push(inArray(corpCardUsages.approvalNo, [...input.approvalNos]));
  if (input.cardIds.length > 0) match.push(inArray(corpCardUsages.corpCardId, [...input.cardIds]));
  return tx
    .select({
      id: corpCardUsages.id,
      version: corpCardUsages.version,
      number: corpCardUsages.number,
      corpCardId: corpCardUsages.corpCardId,
      cardIssuer: corpCards.issuer,
      cardLast4: corpCards.numberLast4,
      approvalNo: corpCardUsages.approvalNo,
      usedOn: corpCardUsages.usedOn,
      totalAmountKrw: corpCardUsages.totalAmountKrw,
      supplyKrw: corpCardUsages.supplyKrw,
      vatKrw: corpCardUsages.vatKrw,
      evidenceTypeCode: corpCardUsages.evidenceTypeCode,
      quoteLineId: corpCardUsages.quoteLineId,
      purchaseRequestId: corpCardUsages.purchaseRequestId,
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .where(and(isNull(corpCardUsages.archivedAt), inArray(corpCardUsages.usedOn, [...input.usedOns]), or(...match)))
    .orderBy(asc(corpCardUsages.id));
}

/** 잠근 행의 재확인 재료 — version · 견적 줄 · 보관 · 살아 있는 붙임 수. */
export type LockedCardUsageRow = { id: string; version: number; quoteLineId: string | null; archivedAt: Date | null; liveLinks: number };

// 여러 건을 id 오름차순으로 한 번에 잠근다(교착 없음 — 두 등록이 같은 차례로 잡는다). 한 건 잠금 lockCardUsageForUpdate는 그대로 둔다.
export async function lockCardUsagesForUpdate(viewer: Viewer, ids: readonly string[], tx: DbOrTx): Promise<LockedCardUsageRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: corpCardUsages.id, version: corpCardUsages.version, quoteLineId: corpCardUsages.quoteLineId, archivedAt: corpCardUsages.archivedAt })
    .from(corpCardUsages)
    .where(inArray(corpCardUsages.id, [...ids]))
    .orderBy(asc(corpCardUsages.id))
    .for("update");
  const counts = await tx
    .select({ id: corpCardUsages.id, liveLinks: sql<boolean>`${liveLinkExists(viewer, "corp_card_usage", corpCardUsages.id)}` })
    .from(corpCardUsages)
    .where(inArray(corpCardUsages.id, [...ids]));
  const linked = new Map(counts.map((row) => [row.id, row.liveLinks]));
  return rows.map((row) => ({ ...row, liveLinks: linked.get(row.id) ? 1 : 0 }));
}

// D-6111 파일 값 덮기 — version 조건부 · 보관 안 된 건만. 번호 · 연결 칸은 쓰지 않는다. 0행(null) = 낡음.
export async function applyFileWins(
  viewer: Viewer,
  input: { id: string; version: number; corpCardId: string; approvalNo: string | null; total: { totalKrw: number; supplyKrw: number; vatKrw: number } | null },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(corpCardUsages)
    .set({
      corpCardId: input.corpCardId,
      approvalNo: input.approvalNo,
      // 합계가 바뀔 때만 돈 칸을 쓴다 — 카드 명세의 합계는 원화라 외화 칸은 비운다(KRW = 환율 1).
      ...(input.total
        ? { totalCurrency: "KRW", totalForeignAmount: null, totalFxRate: "1.0000", totalAmountKrw: input.total.totalKrw, supplyKrw: input.total.supplyKrw, vatKrw: input.total.vatKrw }
        : {}),
      version: sql`${corpCardUsages.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(corpCardUsages.id, input.id), eq(corpCardUsages.version, input.version), isNull(corpCardUsages.archivedAt)))
    .returning({ version: corpCardUsages.version });
  return row?.version ?? null;
}

/** 덮기 막힘 판정 재료(카드 R3 · P2-C4) — 프로젝트 상태는 판정용이라 범위 없이 읽고 화면에 내보내지 않는다. */
export type CardUsageOverwriteFacts = {
  id: string;
  usedOn: string;
  evidenceTypeCode: string;
  registeredVia: string;
  quoteLineId: string | null;
  lineKind: string | null;
  projectStatus: string | null;
  cardKind: string;
  cardHolderUserId: string | null;
  cardTeamId: string | null;
};

export type CardOwnerFacts = { id: string; kind: string; holderUserId: string | null; teamId: string | null };

export async function findCardUsageOverwriteFacts(
  viewer: Viewer,
  input: { usageIds: readonly string[]; cardIds: readonly string[] },
  tx: DbOrTx,
): Promise<{ usages: CardUsageOverwriteFacts[]; cards: CardOwnerFacts[] }> {
  void viewer;
  const usages =
    input.usageIds.length === 0
      ? []
      : await tx
          .select({
            id: corpCardUsages.id,
            usedOn: corpCardUsages.usedOn,
            evidenceTypeCode: corpCardUsages.evidenceTypeCode,
            registeredVia: corpCardUsages.registeredVia,
            quoteLineId: corpCardUsages.quoteLineId,
            lineKind: quoteLines.lineKind,
            projectStatus: projects.status,
            cardKind: corpCards.kind,
            cardHolderUserId: corpCards.holderUserId,
            cardTeamId: corpCards.teamId,
          })
          .from(corpCardUsages)
          .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
          .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
          .leftJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
          .leftJoin(projects, eq(projects.id, quoteRevisions.projectId))
          .where(inArray(corpCardUsages.id, [...input.usageIds]));
  const cards =
    input.cardIds.length === 0
      ? []
      : await tx
          .select({ id: corpCards.id, kind: corpCards.kind, holderUserId: corpCards.holderUserId, teamId: corpCards.teamId })
          .from(corpCards)
          .where(inArray(corpCards.id, [...input.cardIds]));
  return { usages, cards };
}
