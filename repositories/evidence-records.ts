import { and, asc, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
// 등록의 앞 파일 대조 · GH-P1은 트랜잭션 전에 풀로, 06.1-04 Task 3 거래처 갈래는 트랜잭션 안에서 tx로 부른다(E11).
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
export async function findArchivedDedupeKeys(viewer: Viewer, keys: readonly string[]): Promise<Set<string>> {
  void viewer;
  if (keys.length === 0) return new Set();
  const rows = await db
    .select({ dedupeKey: evidenceRecords.dedupeKey })
    .from(evidenceRecords)
    .where(and(sql`${evidenceRecords.dedupeKey} = ANY(${sql.param([...keys])}::text[])`, isNotNull(evidenceRecords.archivedAt)));
  return new Set(rows.map((row) => row.dedupeKey));
}

export type EarlierCardRecord = { cardLast4: string | null; approvalNo: string | null; totalKrw: number };

// A-10: 같은 서식 · 같은 승인번호의 기존 카드 기록(보관 포함) — 끝 4자리 · 부호 · 합계 비교는 호출자의 순수 함수가 한다.
export async function findCardRecordsByApprovalNos(viewer: Viewer, format: string, approvalNos: readonly string[]): Promise<EarlierCardRecord[]> {
  void viewer;
  if (approvalNos.length === 0) return [];
  return db
    .select({ cardLast4: evidenceRecords.cardLast4, approvalNo: evidenceRecords.approvalNo, totalKrw: evidenceRecords.totalKrw })
    .from(evidenceRecords)
    .where(and(eq(evidenceRecords.format, format), sql`${evidenceRecords.approvalNo} = ANY(${sql.param([...approvalNos])}::text[])`));
}

// G11: 그 끝 4자리의 카드 미등록 기록(끝 4자리는 카드 서식 줄만 갖는다) — 다시 잇기가 서식 별칭으로 다시 판정한다.
export async function findUnknownCardRecordsByLast4(viewer: Viewer, last4: string): Promise<{ id: string; format: string }[]> {
  void viewer;
  return db
    .select({ id: evidenceRecords.id, format: evidenceRecords.format })
    .from(evidenceRecords)
    .where(and(isNull(evidenceRecords.corpCardId), eq(evidenceRecords.cardLast4, last4)));
}

// G11: 아직 카드가 없는 줄만 잇는다 — 이미 이어진 줄은 옮기지 않는다(조건 corp_card_id is null). 바뀐 행 수.
export async function linkRecordsToCard(viewer: Viewer, cardId: string, recordIds: readonly string[]): Promise<number> {
  void viewer;
  const rows = await db
    .update(evidenceRecords)
    .set({ corpCardId: cardId, version: sql`${evidenceRecords.version} + 1`, updatedAt: new Date() })
    .where(and(sql`${evidenceRecords.id} = ANY(${sql.param([...recordIds])}::uuid[])`, isNull(evidenceRecords.corpCardId)))
    .returning({ id: evidenceRecords.id });
  return rows.length;
}

// ─── 06.1-05: 목록 · 단건 · 제안 대상 · 공개 범위 저장 ────────────────────────────────────────────────────────

// 살아 있는 붙임(뗀 붙임은 이력 행으로 남는다)이 있나.
const liveLinkExists = sql<boolean>`exists (select 1 from ${evidenceRecordLinks} where ${evidenceRecordLinks.evidenceRecordId} = ${evidenceRecords.id} and ${evidenceRecordLinks.detachedAt} is null)`;
// RP-15 ⑴ · G15: 증빙 종류가 「올린 사람 · 경영관리만 보기」(code_items.private_to_owner)인가 — 코드 항목이 보관이어도 뺀다.
const privateToOwnerType = sql<boolean>`exists (select 1 from ${codeItems} where ${codeItems.tableKey} = 'evidence_type' and ${codeItems.value} = ${evidenceRecords.evidenceType} and ${codeItems.privateToOwner})`;

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
      return sql`((${team}) or (${division})) and not ${liveLinkExists} and ${evidenceRecords.archivedAt} is null and not ${privateToOwnerType}`;
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

export type EvidenceRecordFilters = {
  /** 06.1-02 카드 서식 키(`keyKind: "card"`) — 카드 미등록 판정. */
  cardFormats: readonly string[];
};

// 목록 조건 — 범위 + 필터. 보관 줄은 보관됨 보기에서만 나온다(C2).
function listWhere(scope: EvidenceScope, filters: EvidenceRecordFilters): SQL {
  void filters;
  return sql`(${scopeWhere(scope)}) and ${evidenceRecords.archivedAt} is null`;
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
  corpCardId: string | null;
  needsCheck: string | null;
  totalKrw: number;
  archivedAt: Date | null;
  attached: boolean;
  privateTypeName: string | null;
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
      corpCardId: evidenceRecords.corpCardId,
      needsCheck: evidenceRecords.needsCheck,
      totalKrw: evidenceRecords.totalKrw,
      archivedAt: evidenceRecords.archivedAt,
      attached: liveLinkExists,
      privateTypeName: sql<string | null>`(select ${codeItems.label} from ${codeItems} where ${codeItems.tableKey} = 'evidence_type' and ${codeItems.value} = ${evidenceRecords.evidenceType} and ${codeItems.privateToOwner})`,
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
// visibility_saved_at(timestamptz)은 미공개로 저장해도 찍힌다(C1). updated_at(timestamp)은 바뀐 시각 표시용이라 비교하지 않는다.
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
        updated_at = now()
    FROM (VALUES ${tuples}) AS v(id, version, visibility, team_id, org_unit_id)
    WHERE ${evidenceRecords.id} = v.id AND ${evidenceRecords.version} = v.version
    RETURNING ${evidenceRecords.id}`);
  return result.rows.map((row) => row.id);
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
