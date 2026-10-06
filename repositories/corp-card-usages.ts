import { and, asc, eq, gte, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { corpCardUsages, corpCards, quoteLines, teams, users, vendors } from "@/db/schema";
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
export async function listCardUsageRows(
  viewer: Viewer,
  input: { scope: CardUsageScope; filter: CardUsageFilter },
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

  const rows = await db
    .select({
      usage: corpCardUsages,
      cardLabel: corpCards.label,
      cardIssuer: corpCards.issuer,
      cardLast4: corpCards.numberLast4,
      merchantName: vendors.name,
      teamName: teams.name,
      registeredByName: users.name,
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .innerJoin(users, eq(users.id, corpCardUsages.registeredBy))
    .leftJoin(vendors, eq(vendors.id, corpCardUsages.merchantVendorId))
    .leftJoin(teams, eq(teams.id, corpCardUsages.teamId))
    .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
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
  }));
}
