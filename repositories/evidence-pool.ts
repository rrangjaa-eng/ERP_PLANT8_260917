import { and, eq, getTableName, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { evidenceRecordLinks, evidenceRecords, expenses, purchaseRequests, vendors } from "@/db/schema";
import type { EvidenceScope } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { evidenceScopeCondition } from "@/repositories/evidence-records";

// 06.1-08(E34 · RP-5 · D-6108): 문서에 붙일 증빙 고르기 풀. 보는 범위는 06.1-05 scopeWhere 하나(EvidenceScope → where)를 그대로 쓰고,
// 그 위에 「붙일 수 있는 상태」 조각 하나만 더한다 — 새 범위 판정을 짓지 않는다. 순위(짝 맞음 → 점수 CASE 합 → 날짜 차 → id)와 LIMIT도 SQL이
// 한다(전 행 읽기 · 메모리 정렬 없음). 권한 판정은 여기 없다 — 부르는 domain/evidence-records/pool.ts가 모드를 정한다.

/** 목록 한 쪽 — 21째 행으로 넘음을 판정하고 20행만 돌려준다(PickDialog `truncated` · `limit`). */
export const POOL_LIMIT = 20;

/** 점수 비교용 문서 사실 — 지출결의는 공급가액 · 종류 · 거래처 사업자번호, 구매 요청은 견적 원화(종류 · 사업자번호 칸 없음). */
export type PoolDocFacts = {
  kind: "expense" | "purchase_request" | "corp_card_usage";
  evidenceType: string | null;
  businessNo: string | null;
  amountKrw: number | null;
  /** 지출결의 사용일 · 구매 요청 요청일(서울 날짜). */
  date: string | null;
  /** 지출결의 지급 방식 코드 — 구매 요청은 null(짝 판정 없음). */
  paymentMethod: string | null;
};

export type PoolQuery = {
  doc: PoolDocFacts;
  /** 검색어(거래처 · 금액) — 바인딩. */
  q: string | null;
  /** 작성자 모드 — 합계 0 이상만(A-7 · PA-NEG: 음수는 경영관리 1차로만). */
  author: boolean;
  /** 카드 서식 키 — 카드 미등록(카드 서식인데 카드 id 없음) 거름. */
  cardFormats: readonly string[];
  /** 짝 허용 증빙 종류(지출결의 · 그 지급 방식에 짝 설정이 있을 때). null이면 짝 검사 없음. */
  allowedTypes: readonly string[] | null;
  /** 문서 조건 자리 하나(E23) — 비면 조건 없음. 06.1-09가 카드 사용 「같은 카드」를 넣는다. */
  ownerFilter?: SQL | null;
};

export type PoolRow = {
  id: string;
  version: number;
  evidenceType: string;
  supplyKrw: number;
  totalKrw: number;
  issuedOn: string;
  pairOk: boolean;
  score: number;
};

const recordsTable = sql.identifier(getTableName(evidenceRecords));

// 하위 질의 안에서 바깥 증빙 행의 열을 표 이름까지 붙여 쓴다(조인 없는 선택에서 drizzle이 표 이름을 떼는 것을 막는다 — evidence-records.ts와 같은 사유).
const outer = (column: { name: string }) => sql`${recordsTable}.${sql.identifier(column.name)}`;
const liveLink = sql`exists (select 1 from ${evidenceRecordLinks} where ${evidenceRecordLinks.evidenceRecordId} = ${outer(evidenceRecords.id)} and ${evidenceRecordLinks.detachedAt} is null)`;

// 붙일 수 있는 상태 — 06.1-06 attachLinkInTx 재검사와 같은 조건(보관 · 확인 필요 · 카드 미등록 · 이미 붙음 없음) + 작성자 모드 음수 거름.
function attachableState(query: Pick<PoolQuery, "author" | "cardFormats">): SQL {
  const parts: SQL[] = [
    sql`${evidenceRecords.archivedAt} is null`,
    sql`${evidenceRecords.needsCheck} is null`,
    sql`not ${liveLink}`,
    sql`not (${evidenceRecords.format} = ANY(${sql.param([...query.cardFormats])}::text[]) and ${evidenceRecords.corpCardId} is null)`,
  ];
  if (query.author) parts.push(sql`${evidenceRecords.totalKrw} >= 0`);
  return sql.join(parts, sql` and `);
}

function searchWhere(q: string | null): SQL | null {
  if (q === null || q.trim() === "") return null;
  const text = q.trim().slice(0, 100);
  const like = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const amountText = text.replace(/[,\s]/g, "");
  const amount = /^-?\d{1,15}$/.test(amountText) ? Number(amountText) : null;
  const byName = sql`(${evidenceRecords.merchant} ilike ${like} or ${evidenceRecords.nameOnDocument} ilike ${like})`;
  return amount === null ? byName : sql`(${byName} or ${evidenceRecords.totalKrw} = ${amount} or ${evidenceRecords.supplyKrw} = ${amount})`;
}

/** 06.1-09(E23 · DB-8): 카드 사용 S5 문서 조건 — 그 카드 사용의 카드와 같은 카드 줄만. `totalKrw`를 주면 합계도 같은 줄만(센 수 — 막힌 행 제외). */
export function sameCardFilter(viewer: Viewer, cardId: string, totalKrw?: number): SQL {
  void viewer;
  const card = sql`${evidenceRecords.corpCardId} = ${cardId}`;
  return totalKrw === undefined ? card : sql`${card} and ${evidenceRecords.totalKrw} = ${totalKrw}::bigint`;
}

function ownerWhere(ownerFilter: SQL | null | undefined): SQL {
  return ownerFilter ? sql`(${ownerFilter})` : sql`true`;
}

/** 후보 수(DB-16) — 막힌 행(짝 아님)은 센 수에서 뺀다. 목록과 같은 범위 · 상태 조각. */
export async function countPoolForScope(
  viewer: Viewer,
  scope: EvidenceScope,
  query: Pick<PoolQuery, "author" | "cardFormats" | "allowedTypes" | "ownerFilter">,
  tx: DbOrTx = db,
): Promise<number> {
  if (scope.rows === "none") return 0;
  const pair = query.allowedTypes === null ? sql`true` : sql`${evidenceRecords.evidenceType} = ANY(${sql.param([...query.allowedTypes])}::text[])`;
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(evidenceRecords)
    .where(and(sql`(${evidenceScopeCondition(viewer, scope)})`, attachableState(query), pair, ownerWhere(query.ownerFilter)));
  return row?.count ?? 0;
}

/**
 * 순위 한 쪽(POOL_LIMIT + 1행까지 읽는다). 정렬: 짝 맞음 먼저(막힌 행이 상위 20을 차지하지 않는다 — G3) → 점수 CASE 합 내림(종류 4 · 사업자번호 2 ·
 * 금액 1) → 문서 날짜와 증빙 날짜 차 오름(문서 날짜 없음 맨 뒤) → id. 점수 가중치는 06.1-06 `scoreCandidate`와 같다.
 */
export async function listPoolForScope(viewer: Viewer, scope: EvidenceScope, query: PoolQuery, tx: DbOrTx = db): Promise<PoolRow[]> {
  if (scope.rows === "none") return [];
  const { doc } = query;
  const docDigits = doc.businessNo === null ? null : doc.businessNo.replace(/[^0-9]/g, "") || null;
  const recordAmount = doc.kind === "expense" ? evidenceRecords.supplyKrw : evidenceRecords.totalKrw;
  const pairOk = query.allowedTypes === null ? sql<boolean>`true` : sql<boolean>`(${evidenceRecords.evidenceType} = ANY(${sql.param([...query.allowedTypes])}::text[]))`;
  const kindScore = doc.evidenceType === null ? sql`0` : sql`(case when ${evidenceRecords.evidenceType} = ${doc.evidenceType}::text then 4 else 0 end)`;
  const businessScore = docDigits === null ? sql`0` : sql`(case when ${evidenceRecords.businessNoDigits} = ${docDigits}::text then 2 else 0 end)`;
  const amountScore = doc.amountKrw === null ? sql`0` : sql`(case when ${recordAmount} = ${doc.amountKrw}::bigint then 1 else 0 end)`;
  const score = sql<number>`(${kindScore} + ${businessScore} + ${amountScore})`;
  const dayGap = doc.date === null ? sql`null::int` : sql`abs(${evidenceRecords.issuedOn} - ${doc.date}::date)`;
  const conditions: SQL[] = [sql`(${evidenceScopeCondition(viewer, scope)})`, attachableState(query), ownerWhere(query.ownerFilter)];
  const search = searchWhere(query.q);
  if (search) conditions.push(search);
  const rows = await tx
    .select({
      id: evidenceRecords.id,
      version: evidenceRecords.version,
      evidenceType: evidenceRecords.evidenceType,
      supplyKrw: evidenceRecords.supplyKrw,
      totalKrw: evidenceRecords.totalKrw,
      issuedOn: evidenceRecords.issuedOn,
      pairOk,
      score,
    })
    .from(evidenceRecords)
    .where(and(...conditions))
    .orderBy(sql`case when ${pairOk} then 0 else 1 end`, sql`${score} desc`, sql`${dayGap} asc nulls last`, sql`${evidenceRecords.id} asc`)
    .limit(POOL_LIMIT + 1);
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

/** 점수 비교용 문서 사실 한 번 읽기(트랜잭션 밖) — 없는 문서는 null. */
export async function readPoolDocFacts(viewer: Viewer, owner: { kind: "expense" | "purchase_request"; id: string }, tx: DbOrTx = db): Promise<PoolDocFacts | null> {
  void viewer;
  if (owner.kind === "expense") {
    const [row] = await tx
      .select({ evidenceType: expenses.evidenceType, businessNo: vendors.businessNo, amountKrw: expenses.supplyAmountKrw, date: expenses.usageDate, paymentMethod: expenses.paymentMethod })
      .from(expenses)
      .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
      .where(eq(expenses.id, owner.id))
      .limit(1);
    return row ? { kind: "expense", ...row } : null;
  }
  const requestedOn = sql<string>`to_char((${purchaseRequests.createdAt} at time zone 'UTC') at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
  const [row] = await tx.select({ amountKrw: purchaseRequests.estimateAmountKrw, date: requestedOn }).from(purchaseRequests).where(eq(purchaseRequests.id, owner.id)).limit(1);
  return row ? { kind: "purchase_request", evidenceType: null, businessNo: null, paymentMethod: null, ...row } : null;
}
