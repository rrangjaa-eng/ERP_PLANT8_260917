import { and, asc, desc, eq, getTableName, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { codeItems, corpCards, evidenceImportBatches, evidenceRecordLinks, evidenceRecords, orgUnits, teams } from "@/db/schema";
import type { EvidenceScope } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";

// 06.1-04: 증빙 기록 쓰기 · 조회. 06.1-05 · 06 · 07이 이 파일에 함수를 더한다.

// E10: 3000줄 × 약 22칸 한 번 INSERT는 Postgres 바인드 변수 한도 65,535를 넘는다 — 500줄(약 11,000 바인드)씩 끊는다.
export const EVIDENCE_RECORD_INSERT_CHUNK = 500;

export type EvidenceRecordInsert = {
  batchId: string;
  format: string;
  evidenceType: string;
  approvalNo: string | null;
  dedupeKey: string;
  issuedOn: string;
  supplyKrw: number;
  vatKrw: number;
  totalKrw: number;
  vendorId: string | null;
  businessNoDigits: string | null;
  nameOnDocument: string | null;
  merchant: string | null;
  corpCardId: string | null;
  cardLast4: string | null;
  needsCheck: string | null;
  originalApprovalNo: string | null;
  createdBy: string;
};

function byDedupeKey(left: EvidenceRecordInsert, right: EvidenceRecordInsert): number {
  if (left.dedupeKey < right.dedupeKey) return -1;
  return left.dedupeKey > right.dedupeKey ? 1 : 0;
}

// 이미 있는 열쇠(보관 기록 포함)는 ON CONFLICT DO NOTHING으로 건너뛰고 새로 들어간 행만 돌려준다.
// 겹치는 두 업로드가 서로의 열쇠를 기다리며 멈추지 않게 열쇠 오름차순으로 넣는다(묶음을 나눠도 차례는 그대로).
export async function insertRecordsIgnoringDuplicates(
  viewer: Viewer,
  rows: readonly EvidenceRecordInsert[],
  tx: DbOrTx,
): Promise<{ id: string; dedupeKey: string }[]> {
  void viewer;
  const sorted = [...rows].sort(byDedupeKey);
  const inserted: { id: string; dedupeKey: string }[] = [];
  for (let at = 0; at < sorted.length; at += EVIDENCE_RECORD_INSERT_CHUNK) {
    const chunk = sorted.slice(at, at + EVIDENCE_RECORD_INSERT_CHUNK);
    const returned = await tx
      .insert(evidenceRecords)
      .values(chunk)
      .onConflictDoNothing({ target: evidenceRecords.dedupeKey })
      .returning({ id: evidenceRecords.id, dedupeKey: evidenceRecords.dedupeKey });
    inserted.push(...returned);
  }
  return inserted;
}

// 열쇠 배열 → 이미 있는 열쇠 집합(보관 기록 포함 — 보관도 열쇠를 차지한다). 3000줄 파일의 열쇠 수천 개를 배열 바인드 하나로 한 번에 묻는다.
// 등록의 앞 파일 대조 · GH-P1은 카드 등록 잠금 뒤, 06.1-04 Task 3 거래처 갈래는 거래처 잠금 뒤 — 둘 다 트랜잭션 안에서 tx로 부른다(E11).
export async function findExistingDedupeKeys(viewer: Viewer, keys: readonly string[], tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  if (keys.length === 0) return new Set();
  const rows = await tx
    .select({ dedupeKey: evidenceRecords.dedupeKey })
    .from(evidenceRecords)
    .where(sql`${evidenceRecords.dedupeKey} = ANY(${sql.param([...keys])}::text[])`);
  return new Set(rows.map((row) => row.dedupeKey));
}

// 열쇠 배열 → 그중 보관된 기록의 열쇠 집합. 앞 파일 대조만 쓴다 — 보관된 한쪽에 맞춰 다른 쪽을 등록하면 살아 있는 합이 −T가 된다.
export async function findArchivedDedupeKeys(viewer: Viewer, keys: readonly string[], tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  if (keys.length === 0) return new Set();
  const rows = await tx
    .select({ dedupeKey: evidenceRecords.dedupeKey })
    .from(evidenceRecords)
    .where(and(sql`${evidenceRecords.dedupeKey} = ANY(${sql.param([...keys])}::text[])`, isNotNull(evidenceRecords.archivedAt)));
  return new Set(rows.map((row) => row.dedupeKey));
}

export type EarlierCardRecord = { cardLast4: string | null; approvalNo: string | null; totalKrw: number };

// A-10: 같은 서식 · 같은 승인번호의 기존 카드 기록(보관 포함) — 끝 4자리 · 부호 · 합계 비교는 호출자의 순수 함수가 한다.
export async function findCardRecordsByApprovalNos(
  viewer: Viewer,
  format: string,
  approvalNos: readonly string[],
  tx: DbOrTx = db,
): Promise<EarlierCardRecord[]> {
  void viewer;
  if (approvalNos.length === 0) return [];
  return tx
    .select({ cardLast4: evidenceRecords.cardLast4, approvalNo: evidenceRecords.approvalNo, totalKrw: evidenceRecords.totalKrw })
    .from(evidenceRecords)
    .where(and(eq(evidenceRecords.format, format), sql`${evidenceRecords.approvalNo} = ANY(${sql.param([...approvalNos])}::text[])`));
}

// G11: 그 끝 4자리의 카드 미등록 기록(끝 4자리는 카드 서식 줄만 갖는다) — 다시 잇기가 서식 별칭으로 다시 판정한다.
export async function findUnknownCardRecordsByLast4(viewer: Viewer, last4: string, tx: DbOrTx = db): Promise<{ id: string; format: string }[]> {
  void viewer;
  return tx
    .select({ id: evidenceRecords.id, format: evidenceRecords.format })
    .from(evidenceRecords)
    .where(and(isNull(evidenceRecords.corpCardId), eq(evidenceRecords.cardLast4, last4)));
}

// G11: 아직 카드가 없는 줄만 잇는다 — 이미 이어진 줄은 옮기지 않는다(조건 corp_card_id is null). 바뀐 행 수.
export async function linkRecordsToCard(viewer: Viewer, cardId: string, recordIds: readonly string[], tx: DbOrTx = db): Promise<number> {
  void viewer;
  const rows = await tx
    .update(evidenceRecords)
    .set({ corpCardId: cardId, version: sql`${evidenceRecords.version} + 1`, updatedAt: new Date() })
    .where(and(sql`${evidenceRecords.id} = ANY(${sql.param([...recordIds])}::uuid[])`, isNull(evidenceRecords.corpCardId)))
    .returning({ id: evidenceRecords.id });
  return rows.length;
}

// ─── 06.1-05: 목록 · 단건 · 제안 대상 · 공개 범위 저장 ────────────────────────────────────────────────────────

// 하위 질의 안에서 바깥 증빙 행의 열을 표 이름까지 붙여 쓴다. 조인 없는 선택(잠금 질의)이면 drizzle이 선택 목록 조각의 열에서 표 이름을
// 떼어(단일 표 선택) 하위 질의 안의 `id`가 그 하위 질의의 표(붙임 표)로 묶였다 — 붙은 줄이 안 붙음으로 읽혔다(06.1-05 Task 3).
// 식별자 조각은 떼지 않는다.
function outerRecordColumn(column: PgColumn): SQL {
  return sql`${sql.identifier(getTableName(evidenceRecords))}.${sql.identifier(column.name)}`;
}

// 살아 있는 붙임(뗀 붙임은 이력 행으로 남는다)이 있나.
const liveLinkExists = sql<boolean>`exists (select 1 from ${evidenceRecordLinks} where ${evidenceRecordLinks.evidenceRecordId} = ${outerRecordColumn(evidenceRecords.id)} and ${evidenceRecordLinks.detachedAt} is null)`;
// RP-15 ⑴ · G15: 증빙 종류가 「올린 사람 · 경영관리만 보기」(code_items.private_to_owner)인가 — 코드 항목이 보관이어도 뺀다.
const privateToOwnerType = sql<boolean>`exists (select 1 from ${codeItems} where ${codeItems.tableKey} = 'evidence_type' and ${codeItems.value} = ${evidenceRecords.evidenceType} and ${codeItems.privateToOwner})`;

// /review P2-1: 앞 파일 대조로 취소 줄을 등록한 원거래 줄에 확인 필요를 세운다(등록 트랜잭션 안 · 카드 등록 잠금 뒤). 보관 · 이미 사유가 있는
// 줄은 그대로 둔다(먼저 선 사유를 덮지 않는다). PR-C 카드 결정(2026-10-19 「붙은 것도 표시」): 살아 있는 붙임이 있는 원거래에도 세운다 — 문서
// 「증빙」 행이 사유를 싣는다. 행 잠금은 id 오름차순(lockRecordsForUpdate와 같은 순서)으로 먼저 잡는다. 바뀐 행 id.
export async function flagRecordsNeedsCheckByDedupeKeys(viewer: Viewer, keys: readonly string[], reason: string, tx: DbOrTx): Promise<string[]> {
  void viewer;
  if (keys.length === 0) return [];
  const rows = await tx
    .update(evidenceRecords)
    .set({ needsCheck: reason, version: sql`${evidenceRecords.version} + 1`, updatedAt: new Date() })
    .where(
      sql`${evidenceRecords.id} in (select ${evidenceRecords.id} from ${evidenceRecords} where ${evidenceRecords.dedupeKey} = ANY(${sql.param([...keys])}::text[]) and ${evidenceRecords.archivedAt} is null and ${evidenceRecords.needsCheck} is null order by ${evidenceRecords.id} for update)`,
    )
    .returning({ id: evidenceRecords.id });
  return rows.map((row) => row.id);
}

// PR-C 카드 결정: 위 UPDATE가 세울 줄(보관 아님 · 사유 없음)의 id — 부르는 쪽이 붙은 문서를 증빙 행보다 먼저 잠그려고 읽는다(잠그지 않는다).
export async function findFlaggableRecordIdsByDedupeKeys(viewer: Viewer, keys: readonly string[], tx: DbOrTx): Promise<string[]> {
  void viewer;
  if (keys.length === 0) return [];
  const rows = await tx
    .select({ id: evidenceRecords.id })
    .from(evidenceRecords)
    .where(and(sql`${evidenceRecords.dedupeKey} = ANY(${sql.param([...keys])}::text[])`, isNull(evidenceRecords.archivedAt), isNull(evidenceRecords.needsCheck)));
  return rows.map((row) => row.id);
}

// 증빙 행 범위(06.1-01 EvidenceScope)를 where 조각으로 — 이 번역은 이 함수 하나다. 06.2 RowScope(rowScopeFor)와 따로다(RP-5 — 입력이
// 행의 공개 칸이다). repositories/row-scope.ts 규약을 따른다: id가 null인 갈래는 거짓 조각(조각을 undefined로 두면 and() · or()가 조용히
// 빼서 조건 전체가 사라진다 — CSO-4), 보관된 팀 발령은 팀 범위를 주지 않는다, 모르는 갈래는 거짓(fail-closed). 하위 질의의 teams는
// 가장 안쪽 FROM에 묶인다.
function scopeWhere(scope: EvidenceScope): SQL {
  switch (scope.rows) {
    case "all":
      return sql`true`;
    case "published": {
      const team =
        scope.teamId === null
          ? sql`false`
          : sql`(${evidenceRecords.visibility} = 'team' and ${evidenceRecords.visibleTeamId} = ${scope.teamId} and exists (select 1 from ${teams} where ${teams.id} = ${scope.teamId} and ${teams.archivedAt} is null))`;
      const division =
        scope.orgUnitId === null ? sql`false` : sql`(${evidenceRecords.visibility} = 'division' and ${evidenceRecords.visibleOrgUnitId} = ${scope.orgUnitId})`;
      // P2-1(사용자 결정 2026-10-17): 확인 필요 줄(취소 줄이 등록된 원거래 등)은 공개 범위가 저장돼 있어도 팀원에게 내지 않는다.
      return sql`((${team}) or (${division})) and not ${liveLinkExists} and ${evidenceRecords.archivedAt} is null and ${evidenceRecords.needsCheck} is null and not ${privateToOwnerType}`;
    }
    case "none":
      return sql`false`;
    default: {
      const unreachable: never = scope;
      void unreachable;
      return sql`false`;
    }
  }
}

// 06.1-08 풀(repositories/evidence-pool.ts)이 같은 범위 번역을 쓴다 — 새 범위 판정을 짓지 않는 얇은 내보내기(RP-5).
export function evidenceScopeCondition(viewer: Viewer, scope: EvidenceScope): SQL {
  void viewer;
  return scopeWhere(scope);
}

/** `[상태 ▾]` 값(UI-SPEC S2). 기본은 todo — 값이 없거나 모르는 값이면 domain이 todo로 읽는다. */
export type EvidenceRecordState = "todo" | "private" | "published" | "attached" | "unmatched" | "needs-check" | "card-unknown" | "archived" | "all";

export type EvidenceRecordFilters = {
  /** 06.1-02 카드 서식 키(`keyKind: "card"`) — 카드 미등록 판정. */
  cardFormats: readonly string[];
  state: EvidenceRecordState;
  /** 증빙 종류 코드값(라벨로 가르지 않는다) — null이면 전부. */
  evidenceType: string | null;
  /** 한국 날짜 반열린 구간 [from, before) — null이면 전부. */
  issuedOn: { from: string; before: string } | null;
  batchId: string | null;
};

// 상태 필터 — 상태 함수(domain/evidence-records/status.ts)의 한 값 규칙을 그대로 SQL로 옮긴다(보관됨 > 카드 미등록 > 확인 필요 > 붙음 >
// 미공개(음수 · 경영관리만 종류 포함) > 팀 · 본부 공개). `짝 없는 카드 줄`만 낱말이 아니라 UI-SPEC 정의(카드 줄 · 안 붙음 · 카드 등록됨)다.
// 보관 줄은 보관됨 보기에서만 나온다(C2).
function stateWhere(state: EvidenceRecordState, cardFormats: readonly string[]): SQL {
  const live = sql`${evidenceRecords.archivedAt} is null`;
  const cardFormat = sql`${evidenceRecords.format} = ANY(${sql.param([...cardFormats])}::text[])`;
  const cardUnknown = sql`(${cardFormat} and ${evidenceRecords.corpCardId} is null)`;
  const needsCheck = sql`(not ${cardUnknown} and ${evidenceRecords.needsCheck} is not null)`;
  // 앞 갈래(카드 미등록 · 확인 필요 · 붙음)가 아닌 줄 — 낱말이 미공개 · 팀 공개 · 본부 공개 중 하나다.
  const plain = sql`(not ${cardUnknown} and ${evidenceRecords.needsCheck} is null and not ${liveLinkExists})`;
  const privateWord = sql`(${plain} and (${evidenceRecords.totalKrw} < 0 or ${privateToOwnerType} or ${evidenceRecords.visibility} = 'private'))`;
  switch (state) {
    case "todo":
      return sql`${live} and (${privateWord} or ${needsCheck})`;
    case "private":
      return sql`${live} and ${privateWord}`;
    case "published":
      return sql`${live} and ${plain} and ${evidenceRecords.totalKrw} >= 0 and not ${privateToOwnerType} and ${evidenceRecords.visibility} <> 'private'`;
    case "attached":
      return sql`${live} and not ${cardUnknown} and ${evidenceRecords.needsCheck} is null and ${liveLinkExists}`;
    case "unmatched":
      return sql`${live} and ${cardFormat} and ${evidenceRecords.corpCardId} is not null and not ${liveLinkExists}`;
    case "needs-check":
      return sql`${live} and ${needsCheck}`;
    case "card-unknown":
      return sql`${live} and ${cardUnknown}`;
    case "archived":
      return sql`${evidenceRecords.archivedAt} is not null`;
    case "all":
      return live;
    default: {
      const unreachable: never = state;
      void unreachable;
      return sql`false`;
    }
  }
}

// 목록 조건 — 범위 + 상태 · 종류 · 기간 · 묶음. 합계 · 그룹 건수 · 쪽 · 제안이 모두 이 한 조건을 쓴다(합계가 쪽만 더하지 않게).
function listWhere(scope: EvidenceScope, filters: EvidenceRecordFilters): SQL {
  const parts: SQL[] = [sql`(${scopeWhere(scope)})`, sql`(${stateWhere(filters.state, filters.cardFormats)})`];
  if (filters.evidenceType !== null) parts.push(sql`${evidenceRecords.evidenceType} = ${filters.evidenceType}`);
  if (filters.issuedOn !== null) {
    parts.push(sql`${evidenceRecords.issuedOn} >= ${filters.issuedOn.from}::date and ${evidenceRecords.issuedOn} < ${filters.issuedOn.before}::date`);
  }
  if (filters.batchId !== null) parts.push(sql`${evidenceRecords.batchId} = ${filters.batchId}::uuid`);
  return sql.join(parts, sql` and `);
}

const visibleTeam = alias(teams, "visible_team");
const visibleOrgUnit = alias(orgUnits, "visible_org_unit");
const typeItem = alias(codeItems, "evidence_type_item");

export type EvidenceRecordListRow = {
  id: string;
  version: number;
  batchId: string;
  format: string;
  evidenceType: string;
  approvalNo: string | null;
  issuedOn: string;
  supplyKrw: number;
  vatKrw: number;
  totalKrw: number;
  businessNoDigits: string | null;
  nameOnDocument: string | null;
  merchant: string | null;
  corpCardId: string | null;
  cardLast4: string | null;
  needsCheck: string | null;
  originalApprovalNo: string | null;
  visibility: string;
  visibleTeamId: string | null;
  archivedAt: Date | null;
  attached: boolean;
  typeLabel: string | null;
  privateToOwner: boolean;
  teamName: string | null;
  orgUnitName: string | null;
};

const LIST_COLUMNS = {
  id: evidenceRecords.id,
  version: evidenceRecords.version,
  batchId: evidenceRecords.batchId,
  format: evidenceRecords.format,
  evidenceType: evidenceRecords.evidenceType,
  approvalNo: evidenceRecords.approvalNo,
  issuedOn: evidenceRecords.issuedOn,
  supplyKrw: evidenceRecords.supplyKrw,
  vatKrw: evidenceRecords.vatKrw,
  totalKrw: evidenceRecords.totalKrw,
  businessNoDigits: evidenceRecords.businessNoDigits,
  nameOnDocument: evidenceRecords.nameOnDocument,
  merchant: evidenceRecords.merchant,
  corpCardId: evidenceRecords.corpCardId,
  cardLast4: evidenceRecords.cardLast4,
  needsCheck: evidenceRecords.needsCheck,
  originalApprovalNo: evidenceRecords.originalApprovalNo,
  visibility: evidenceRecords.visibility,
  visibleTeamId: evidenceRecords.visibleTeamId,
  archivedAt: evidenceRecords.archivedAt,
  attached: liveLinkExists,
  typeLabel: typeItem.label,
  privateToOwner: sql<boolean>`coalesce(${typeItem.privateToOwner}, false)`,
  teamName: visibleTeam.name,
  orgUnitName: visibleOrgUnit.name,
};

function selectList(tx: DbOrTx) {
  return tx
    .select(LIST_COLUMNS)
    .from(evidenceRecords)
    .leftJoin(typeItem, and(eq(typeItem.tableKey, "evidence_type"), eq(typeItem.value, evidenceRecords.evidenceType)))
    .leftJoin(visibleTeam, eq(visibleTeam.id, evidenceRecords.visibleTeamId))
    .leftJoin(visibleOrgUnit, eq(visibleOrgUnit.id, evidenceRecords.visibleOrgUnitId));
}

// 서식별 그룹 · 같은 서식 안 날짜 내림차순(UI-SPEC S2). id는 같은 날짜 줄의 차례를 고정한다.
const LIST_ORDER = [asc(evidenceRecords.format), desc(evidenceRecords.issuedOn), asc(evidenceRecords.id)];

export async function listRecordsForScope(
  viewer: Viewer,
  scope: EvidenceScope,
  filters: EvidenceRecordFilters,
  page: { limit: number; offset: number },
): Promise<EvidenceRecordListRow[]> {
  void viewer;
  if (scope.rows === "none") return [];
  return selectList(db)
    .where(listWhere(scope, filters))
    .orderBy(...LIST_ORDER)
    .limit(page.limit)
    .offset(page.offset);
}

// 단건 — 목록과 같은 범위(범위 밖 · 보관 = 없음). 06.1-06 · 07 · 08이 이 함수만 부른다.
export async function findRecordForScope(viewer: Viewer, scope: EvidenceScope, id: string): Promise<EvidenceRecordListRow | null> {
  void viewer;
  if (scope.rows === "none") return null;
  const [row] = await selectList(db)
    .where(and(eq(evidenceRecords.id, id), sql`(${scopeWhere(scope)})`))
    .limit(1);
  return row ?? null;
}

// O-6106: 저장한 줄을 id로 다시 읽는다(같은 범위) — 화면이 그 줄을 다음 불러오기까지 제자리에 두고 상태 글자만 바꾼다.
export async function listRecordsByIdsForScope(viewer: Viewer, scope: EvidenceScope, ids: readonly string[]): Promise<EvidenceRecordListRow[]> {
  void viewer;
  if (scope.rows === "none" || ids.length === 0) return [];
  return selectList(db)
    .where(and(sql`${evidenceRecords.id} = ANY(${sql.param([...ids])}::uuid[])`, sql`(${scopeWhere(scope)})`))
    .orderBy(...LIST_ORDER);
}

export type EvidenceFormatTotal = { format: string; count: number; supplyKrw: number; vatKrw: number; totalKrw: number };

// DA-10 · 합계 행 · 그룹 줄: 목록과 같은 조건으로 서식마다 건수와 금액 합 셋(쪽과 무관 — 60건이면 1쪽 50줄이어도 60건 합).
export async function countAndSumForScope(viewer: Viewer, scope: EvidenceScope, filters: EvidenceRecordFilters): Promise<EvidenceFormatTotal[]> {
  void viewer;
  if (scope.rows === "none") return [];
  const rows = await db
    .select({
      format: evidenceRecords.format,
      count: sql<number>`count(*)::int`,
      supplyKrw: sql<string>`coalesce(sum(${evidenceRecords.supplyKrw}), 0)::text`,
      vatKrw: sql<string>`coalesce(sum(${evidenceRecords.vatKrw}), 0)::text`,
      totalKrw: sql<string>`coalesce(sum(${evidenceRecords.totalKrw}), 0)::text`,
    })
    .from(evidenceRecords)
    .where(listWhere(scope, filters))
    .groupBy(evidenceRecords.format)
    .orderBy(asc(evidenceRecords.format));
  return rows.map((row) => ({ format: row.format, count: Number(row.count), supplyKrw: Number(row.supplyKrw), vatKrw: Number(row.vatKrw), totalKrw: Number(row.totalKrw) }));
}

// 범위 안에 줄이 하나라도 있나(보관 포함 — 보관 줄만 있어도 등록한 적은 있다). 빈 상태 글자 · 필터 줄을 가른다.
export async function hasAnyRecordForScope(viewer: Viewer, scope: EvidenceScope): Promise<boolean> {
  void viewer;
  if (scope.rows === "none") return false;
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(scopeWhere(scope)).limit(1);
  return row !== undefined;
}

export type EvidenceProposalTarget = { id: string; version: number; cardTeamId: string | null; cardHolderUserId: string | null };

// C1 · DA-4: 제안 대상 — 공개 범위를 한 번도 저장하지 않은 미공개 줄 중 공개할 수 있는 줄(붙음 · 보관 · 확인 필요 · 카드 미등록 · 음수 ·
// 경영관리만 종류가 아님). 필터 결과 전체에서 limit(행 상한)까지 — 카드의 팀 · 소지자는 같은 질의의 왼쪽 조인으로 한 번에 읽는다.
export async function listProposalTargets(
  viewer: Viewer,
  scope: EvidenceScope,
  filters: EvidenceRecordFilters,
  limit: number,
): Promise<EvidenceProposalTarget[]> {
  void viewer;
  if (scope.rows === "none") return [];
  const cardFormat = sql`${evidenceRecords.format} = ANY(${sql.param([...filters.cardFormats])}::text[])`;
  return db
    .select({ id: evidenceRecords.id, version: evidenceRecords.version, cardTeamId: corpCards.teamId, cardHolderUserId: corpCards.holderUserId })
    .from(evidenceRecords)
    .leftJoin(corpCards, eq(corpCards.id, evidenceRecords.corpCardId))
    .where(
      and(
        listWhere(scope, filters),
        // 보관됨 보기에서도 보관 줄은 제안하지 않는다.
        isNull(evidenceRecords.archivedAt),
        eq(evidenceRecords.visibility, "private"),
        isNull(evidenceRecords.visibilitySavedAt),
        sql`not ${liveLinkExists}`,
        isNull(evidenceRecords.needsCheck),
        sql`(not ${cardFormat} or ${evidenceRecords.corpCardId} is not null)`,
        sql`${evidenceRecords.totalKrw} >= 0`,
        sql`not ${privateToOwnerType}`,
      ),
    )
    .orderBy(...LIST_ORDER)
    .limit(limit);
}

export type LockedEvidenceRecord = {
  id: string;
  version: number;
  format: string;
  visibility: string;
  visibleTeamId: string | null;
  visibleOrgUnitId: string | null;
  corpCardId: string | null;
  needsCheck: string | null;
  totalKrw: number;
  archivedAt: Date | null;
  attached: boolean;
  privateTypeName: string | null;
  /** 마지막으로 바뀐 시각(timestamp) — 보관 · 되살림 충돌 글자 `다른 사람이 {HH:mm}에 바꿈`의 시각. */
  updatedAt: Date;
};

// 저장 전 잠금 — id 오름차순(겹치는 두 저장이 서로를 기다리며 멈추지 않게). 붙음 · 종류는 같은 문장의 하위 질의로 읽는다(FOR UPDATE는
// 외부 조인의 nullable 쪽에 걸 수 없어 조인하지 않는다).
export async function lockRecordsForUpdate(viewer: Viewer, ids: readonly string[], tx: DbOrTx): Promise<LockedEvidenceRecord[]> {
  void viewer;
  if (ids.length === 0) return [];
  return tx
    .select({
      id: evidenceRecords.id,
      version: evidenceRecords.version,
      format: evidenceRecords.format,
      visibility: evidenceRecords.visibility,
      visibleTeamId: evidenceRecords.visibleTeamId,
      visibleOrgUnitId: evidenceRecords.visibleOrgUnitId,
      corpCardId: evidenceRecords.corpCardId,
      needsCheck: evidenceRecords.needsCheck,
      totalKrw: evidenceRecords.totalKrw,
      archivedAt: evidenceRecords.archivedAt,
      attached: liveLinkExists,
      privateTypeName: sql<string | null>`(select ${codeItems.label} from ${codeItems} where ${codeItems.tableKey} = 'evidence_type' and ${codeItems.value} = ${outerRecordColumn(evidenceRecords.evidenceType)} and ${codeItems.privateToOwner})`,
      updatedAt: evidenceRecords.updatedAt,
    })
    .from(evidenceRecords)
    .where(sql`${evidenceRecords.id} = ANY(${sql.param([...ids])}::uuid[])`)
    .orderBy(asc(evidenceRecords.id))
    .for("update");
}

// Round 2 eng B-P3: 한 문장이 다루는 줄 수 — 5칸 × 500 = 2,500 바인드(한도 65,535 안). 줄마다 문장을 쓰지 않는다.
export const EVIDENCE_VISIBILITY_UPDATE_CHUNK = 500;

export type EvidenceVisibilityUpdate = { id: string; version: number; visibility: "private" | "team" | "division"; teamId: string | null; orgUnitId: string | null };

// 공개 범위 저장 한 문장(줄 수 ≤ EVIDENCE_VISIBILITY_UPDATE_CHUNK) — id · version이 같은 줄만 바꾸고 바꾼 id를 돌려준다(적으면 충돌).
// visibility_saved_at(timestamptz)은 미공개로 저장해도 찍힌다(C1). updated_at(timestamp)은 바뀐 시각 표시용이라 비교하지 않는다 — 시간대 없는
// 칸은 읽을 때 UTC로 해석하므로 쓸 때도 `at time zone 'UTC'`로 DB 세션 시간대와 무관하게 UTC 시각을 담는다(충돌 글자 HH:mm의 한국 시각 변환).
export async function updateVisibilitiesIfVersionMatch(viewer: Viewer, rows: readonly EvidenceVisibilityUpdate[], tx: DbOrTx): Promise<string[]> {
  void viewer;
  if (rows.length === 0) return [];
  const tuples = sql.join(
    rows.map((row) => sql`(${row.id}::uuid, ${row.version}::int, ${row.visibility}::text, ${row.teamId}::uuid, ${row.orgUnitId}::uuid)`),
    sql`, `,
  );
  const result = await tx.execute<{ id: string }>(sql`
    UPDATE ${evidenceRecords}
    SET visibility = v.visibility,
        visible_team_id = v.team_id,
        visible_org_unit_id = v.org_unit_id,
        visibility_saved_at = now(),
        version = ${evidenceRecords.version} + 1,
        updated_at = (now() at time zone 'UTC')
    FROM (VALUES ${tuples}) AS v(id, version, visibility, team_id, org_unit_id)
    WHERE ${evidenceRecords.id} = v.id AND ${evidenceRecords.version} = v.version
    RETURNING ${evidenceRecords.id}`);
  return result.rows.map((row) => row.id);
}

// 보관 · 되살림 한 줄(DA-7 · E41) — id · version이 같고 지금 반대 상태인 줄만 바꾸고 바꿨으면 참(거짓 = 충돌). 보관 두 칸은 함께 차고 함께
// 빈다(CHECK evidence_records 보관 짝). 잠근 뒤에 부른다 — 살아 있는 붙임 검사는 domain이 같은 잠금 안에서 한다.
export async function setRecordArchivedIfVersionMatches(viewer: Viewer, input: { id: string; version: number; archived: boolean }, tx: DbOrTx): Promise<boolean> {
  const rows = await tx
    .update(evidenceRecords)
    .set({
      archivedAt: input.archived ? sql`now()` : null,
      archivedBy: input.archived ? viewer.id : null,
      version: sql`${evidenceRecords.version} + 1`,
      updatedAt: sql`(now() at time zone 'UTC')`,
    })
    .where(
      and(
        eq(evidenceRecords.id, input.id),
        eq(evidenceRecords.version, input.version),
        input.archived ? isNull(evidenceRecords.archivedAt) : isNotNull(evidenceRecords.archivedAt),
      ),
    )
    .returning({ id: evidenceRecords.id });
  return rows.length > 0;
}

// 붙임 변화를 증빙 행 version에 싣는다(PR-C /review P3-1) — 붙이기는 증빙 행을 잠그기만 해서, 그 잠금을 기다린 보관 · 플래그 문장이 문장 시작
// 스냅샷의 「안 붙음」으로 통과했다. 행을 고치면 기다린 문장이 EPQ로 새 version을 보고 version 조건 · 화면 낡음 판정이 막는다. 잠근 뒤에 부른다.
export async function bumpRecordVersion(viewer: Viewer, id: string, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx
    .update(evidenceRecords)
    .set({ version: sql`${evidenceRecords.version} + 1`, updatedAt: sql`(now() at time zone 'UTC')` })
    .where(eq(evidenceRecords.id, id));
}

// 묶음 한 행의 서식 · 원래 파일 이름 — 결과 행 1행(`{파일 이름} · {서식 이름}`)과 batch 표시가 쓴다.
export async function findBatchSummary(viewer: Viewer, batchId: string): Promise<{ id: string; format: string; originalName: string } | null> {
  void viewer;
  const [row] = await db
    .select({ id: evidenceImportBatches.id, format: evidenceImportBatches.format, originalName: evidenceImportBatches.originalName })
    .from(evidenceImportBatches)
    .where(eq(evidenceImportBatches.id, batchId))
    .limit(1);
  return row ?? null;
}
