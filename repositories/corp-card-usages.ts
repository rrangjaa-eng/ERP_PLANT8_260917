import { and, asc, desc, eq, gte, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { corpCardUsages, corpCards, projects, quoteLines, quoteRevisions, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-05(EXP-07): 법인카드 사용 쓰기 · 목록 · 직전 등록. 범위(UA-612)는 목록 쿼리의 조건에서 갈린다 — 보관된 건은 늘 뺀다(H-4 기반).

export type CardUsageRow = InferSelectModel<typeof corpCardUsages>;
export type CardUsageInsert = Omit<
  InferInsertModel<typeof corpCardUsages>,
  "id" | "version" | "source" | "archivedAt" | "archivedBy" | "createdAt" | "updatedAt"
>;

export async function insertCardUsage(viewer: Viewer, values: CardUsageInsert, tx: DbOrTx): Promise<CardUsageRow> {
  void viewer;
  const [row] = await tx.insert(corpCardUsages).values(values).returning();
  if (!row) throw new Error("카드 사용 INSERT 결과 없음");
  return row;
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
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .innerJoin(users, eq(users.id, corpCardUsages.registeredBy))
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
  }));
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
    })
    .from(corpCardUsages)
    .innerJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .innerJoin(users, eq(users.id, corpCardUsages.registeredBy))
    .leftJoin(vendors, eq(vendors.id, corpCardUsages.merchantVendorId))
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
  | "registeredVia"
  | "memo"
>;

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
