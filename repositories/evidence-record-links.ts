import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { actionLog, corpCardUsages, evidenceRecordLinks, evidenceRecords, expenses, purchaseRequests, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.1-12(EVID-08 · D-6104 · D-6105): 증빙 기록 붙임 읽기. 살아 있는 붙임 = detached_at IS NULL — 06.1 「증빙 있음」 판정은 이 파일의 조건 하나다.
// 이 모듈은 domain을 import하지 않는다. 쓰기(붙이기 · 떼기 · 자동 떼기)는 06.1-06이 더했다 — 05 · 06 domain의 삭제 · 종결 · 취소 · 보관 tx는
// detachLiveLinksForOwner 하나만 부른다(domain/evidence-records를 import하지 않는다 — 순환 C-F14).

const live = () => isNull(evidenceRecordLinks.detachedAt);

// 붙임을 받는 주인 종류(evidence_record_links_owner_kind_check). 다른 종류(차수 승인 · 적립금 증빙 등)는 붙임이 없으므로 묻지 않는다.
const LINK_OWNER_KINDS: ReadonlySet<string> = new Set(["expense", "purchase_request", "corp_card_usage"]);

export type LiveLinkCount = {
  ownerId: string;
  linkCount: number;
  // attach_mode = 'author' — 작성자가 공개된 증빙에서 고른 붙임(06.1-12 자동 확인 조건이 읽는다).
  authorLinkCount: number;
  // 붙은 기록 공급가 합(원 정수 · 음수 기록 포함). 문서 금액이 아니다(D-6520) — 자동 확인 비교 입력으로만 쓴다.
  recordSupplyKrw: number;
  // 붙은 기록 중 확인 필요(needs_check)가 선 수 — 자동 확인은 0일 때만(PR-C 검토 P2-1 · 경영관리가 다시 확인해야 지급).
  needsCheckCount: number;
  lastAttachedAt: Date;
};

// 주인별 묶음 한 번(GROUP BY) — 빈 ids · 붙임 없는 주인 종류면 질의 없이 빈 배열.
export async function countLiveLinksByOwners(
  viewer: Viewer,
  input: { ownerKind: string; ownerIds: readonly string[] },
  tx: DbOrTx = db,
): Promise<LiveLinkCount[]> {
  void viewer;
  if (input.ownerIds.length === 0 || !LINK_OWNER_KINDS.has(input.ownerKind)) return [];
  return tx
    .select({
      ownerId: evidenceRecordLinks.ownerId,
      linkCount: sql<number>`count(*)::int`.mapWith(Number),
      authorLinkCount: sql<number>`(count(*) filter (where ${evidenceRecordLinks.attachMode} = 'author'))::int`.mapWith(Number),
      recordSupplyKrw: sql<number>`coalesce(sum(${evidenceRecords.supplyKrw}), 0)::bigint`.mapWith(Number),
      needsCheckCount: sql<number>`(count(*) filter (where ${evidenceRecords.needsCheck} is not null))::int`.mapWith(Number),
      lastAttachedAt: sql<Date>`max(${evidenceRecordLinks.attachedAt})`.mapWith(evidenceRecordLinks.attachedAt),
    })
    .from(evidenceRecordLinks)
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, evidenceRecordLinks.evidenceRecordId))
    .where(and(eq(evidenceRecordLinks.ownerKind, input.ownerKind), inArray(evidenceRecordLinks.ownerId, [...input.ownerIds]), live()))
    .groupBy(evidenceRecordLinks.ownerId);
}

// 07-01(D-715): 지출결의마다 살아 있는 붙임 기록의 가장 이른 작성일(issued_on) — 자동 지급 예정일의 기준일. 붙임이 없는 문서는 결과에 없다.
export async function listEarliestIssuedOnForExpenses(viewer: Viewer, expenseIds: readonly string[], tx: DbOrTx = db): Promise<Map<string, string>> {
  void viewer;
  if (expenseIds.length === 0) return new Map();
  const rows = await tx
    .select({ ownerId: evidenceRecordLinks.ownerId, issuedOn: sql<string>`min(${evidenceRecords.issuedOn})::text` })
    .from(evidenceRecordLinks)
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, evidenceRecordLinks.evidenceRecordId))
    .where(and(eq(evidenceRecordLinks.ownerKind, "expense"), inArray(evidenceRecordLinks.ownerId, [...expenseIds]), live()))
    .groupBy(evidenceRecordLinks.ownerId);
  return new Map(rows.map((row) => [row.ownerId, row.issuedOn]));
}

export type LiveLinkWithRecord = {
  linkId: string;
  ownerId: string;
  attachMode: string;
  attachedBy: string;
  attachedAt: Date;
  recordId: string;
  format: string;
  evidenceType: string;
  issuedOn: string;
  supplyKrw: number;
  vatKrw: number;
  totalKrw: number;
  vendorId: string | null;
  nameOnDocument: string | null;
  merchant: string | null;
  corpCardId: string | null;
  cardLast4: string | null;
  approvalNo: string | null;
  needsCheck: string | null;
};

// 살아 있는 붙임 행마다 붙임 칸 + 기록 칸, 붙인 순. 주인 범위(누가 이 주인을 보나) 판정은 부르는 domain 몫이다.
export async function listLiveLinksWithRecords(
  viewer: Viewer,
  input: { ownerKind: string; ownerIds: readonly string[] },
  tx: DbOrTx = db,
): Promise<LiveLinkWithRecord[]> {
  void viewer;
  if (input.ownerIds.length === 0 || !LINK_OWNER_KINDS.has(input.ownerKind)) return [];
  return tx
    .select({
      linkId: evidenceRecordLinks.id,
      ownerId: evidenceRecordLinks.ownerId,
      attachMode: evidenceRecordLinks.attachMode,
      attachedBy: evidenceRecordLinks.attachedBy,
      attachedAt: evidenceRecordLinks.attachedAt,
      recordId: evidenceRecords.id,
      format: evidenceRecords.format,
      evidenceType: evidenceRecords.evidenceType,
      issuedOn: evidenceRecords.issuedOn,
      supplyKrw: evidenceRecords.supplyKrw,
      vatKrw: evidenceRecords.vatKrw,
      totalKrw: evidenceRecords.totalKrw,
      vendorId: evidenceRecords.vendorId,
      nameOnDocument: evidenceRecords.nameOnDocument,
      merchant: evidenceRecords.merchant,
      corpCardId: evidenceRecords.corpCardId,
      cardLast4: evidenceRecords.cardLast4,
      approvalNo: evidenceRecords.approvalNo,
      needsCheck: evidenceRecords.needsCheck,
    })
    .from(evidenceRecordLinks)
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, evidenceRecordLinks.evidenceRecordId))
    .where(and(eq(evidenceRecordLinks.ownerKind, input.ownerKind), inArray(evidenceRecordLinks.ownerId, [...input.ownerIds]), live()))
    .orderBy(asc(evidenceRecordLinks.attachedAt), asc(evidenceRecordLinks.id));
}

// 그 주인 id 열을 가진 행에 거는 「살아 있는 붙임 1개 이상」 한 조건 — repositories/files.ts aliveFileExists와 같은 꼴(카드 사용 목록 `증빙` 열).
export function liveLinkExists(viewer: Viewer, ownerKind: string | AnyPgColumn, ownerId: AnyPgColumn): SQL<boolean> {
  void viewer;
  return sql<boolean>`exists (select 1 from ${evidenceRecordLinks} where ${evidenceRecordLinks.ownerKind} = ${ownerKind} and ${evidenceRecordLinks.ownerId} = ${ownerId} and ${live()})`;
}

// ── 06.1-06 쓰기 ───────────────────────────────────────────────────────────────────────────

export type EvidenceLinkOwnerKind = "expense" | "purchase_request" | "corp_card_usage";
export type EvidenceAttachMode = "registrar" | "author" | "reconcile";

export type EvidenceLinkRow = {
  id: string;
  evidenceRecordId: string;
  ownerKind: string;
  ownerId: string;
  attachMode: string;
  attachedBy: string;
  attachedAt: Date;
  detachedAt: Date | null;
};

const LINK_COLUMNS = {
  id: evidenceRecordLinks.id,
  evidenceRecordId: evidenceRecordLinks.evidenceRecordId,
  ownerKind: evidenceRecordLinks.ownerKind,
  ownerId: evidenceRecordLinks.ownerId,
  attachMode: evidenceRecordLinks.attachMode,
  attachedBy: evidenceRecordLinks.attachedBy,
  attachedAt: evidenceRecordLinks.attachedAt,
  detachedAt: evidenceRecordLinks.detachedAt,
};

// 붙임 한 행 — 부분 유니크(evidence_record_links_live_uniq)가 한 증빙 = 살아 있는 붙임 하나를 막는다(위반은 23505로 올라간다).
export async function insertLink(
  viewer: Viewer,
  input: { recordId: string; ownerKind: EvidenceLinkOwnerKind; ownerId: string; attachMode: EvidenceAttachMode },
  tx: DbOrTx,
): Promise<EvidenceLinkRow> {
  const [row] = await tx
    .insert(evidenceRecordLinks)
    .values({ evidenceRecordId: input.recordId, ownerKind: input.ownerKind, ownerId: input.ownerId, attachMode: input.attachMode, attachedBy: viewer.id })
    .returning(LINK_COLUMNS);
  if (!row) throw new Error("붙임 INSERT 결과 없음");
  return row;
}

// 06.1-09(대사 E32): 붙임 여러 행을 한 문장 다중 VALUES로 — insertLink와 같은 칸 · 같은 부분 유니크(위반은 23505로 올라간다).
export async function insertLinks(
  viewer: Viewer,
  rows: readonly { recordId: string; ownerKind: EvidenceLinkOwnerKind; ownerId: string; attachMode: EvidenceAttachMode }[],
  tx: DbOrTx,
): Promise<EvidenceLinkRow[]> {
  if (rows.length === 0) return [];
  return tx
    .insert(evidenceRecordLinks)
    .values(rows.map((row) => ({ evidenceRecordId: row.recordId, ownerKind: row.ownerKind, ownerId: row.ownerId, attachMode: row.attachMode, attachedBy: viewer.id })))
    .returning(LINK_COLUMNS);
}

// 뗌 — 살아 있는 붙임만(조건부 UPDATE). 0행 = 이미 뗌(두 탭 · 응답 유실 재시도 — 부르는 쪽이 멱등 성공으로 끝낸다).
export async function detachLink(viewer: Viewer, input: { linkId: string; reason: string }, tx: DbOrTx): Promise<boolean> {
  const rows = await tx
    .update(evidenceRecordLinks)
    .set({ detachedAt: new Date(), detachedBy: viewer.id, detachReason: input.reason })
    .where(and(eq(evidenceRecordLinks.id, input.linkId), live()))
    .returning({ id: evidenceRecordLinks.id });
  return rows.length > 0;
}

// 증빙 행을 잠근 뒤 같은 tx에서 — 그 증빙의 살아 있는 붙임(있으면 하나 — 부분 유니크).
export async function findLiveLinkForRecordForUpdate(viewer: Viewer, recordId: string, tx: DbOrTx): Promise<EvidenceLinkRow | null> {
  void viewer;
  const [row] = await tx
    .select(LINK_COLUMNS)
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), live()))
    .for("update");
  return row ?? null;
}

export async function findLinkById(viewer: Viewer, linkId: string, tx: DbOrTx = db): Promise<EvidenceLinkRow | null> {
  void viewer;
  const [row] = await tx.select(LINK_COLUMNS).from(evidenceRecordLinks).where(eq(evidenceRecordLinks.id, linkId)).limit(1);
  return row ?? null;
}

export type LiveLinkOwner = {
  recordId: string;
  linkId: string;
  ownerKind: string;
  ownerId: string;
  /** 지출결의 · 구매 요청 번호(번호 없는 작성 중 지출결의 · 카드 사용은 null). 보임 판정은 부르는 domain 몫이다. */
  ownerNumber: string | null;
};

// 증빙마다 살아 있는 붙임의 주인 — 목록 2행 · 경합 거부 글자(다른 사람이 먼저 붙임 · {문서 번호}). 작성 중 문서는 지운 문서여도 번호가 null이다.
export async function listLiveLinkOwnersByRecords(viewer: Viewer, recordIds: readonly string[], tx: DbOrTx = db): Promise<LiveLinkOwner[]> {
  void viewer;
  if (recordIds.length === 0) return [];
  return tx
    .select({
      recordId: evidenceRecordLinks.evidenceRecordId,
      linkId: evidenceRecordLinks.id,
      ownerKind: evidenceRecordLinks.ownerKind,
      ownerId: evidenceRecordLinks.ownerId,
      ownerNumber: sql<string | null>`case ${evidenceRecordLinks.ownerKind} when 'expense' then ${expenses.number} when 'purchase_request' then ${purchaseRequests.number} when 'corp_card_usage' then ${corpCardUsages.number} else null end`,
    })
    .from(evidenceRecordLinks)
    .leftJoin(expenses, and(eq(evidenceRecordLinks.ownerKind, "expense"), eq(expenses.id, evidenceRecordLinks.ownerId)))
    .leftJoin(purchaseRequests, and(eq(evidenceRecordLinks.ownerKind, "purchase_request"), eq(purchaseRequests.id, evidenceRecordLinks.ownerId)))
    .leftJoin(corpCardUsages, and(eq(evidenceRecordLinks.ownerKind, "corp_card_usage"), eq(corpCardUsages.id, evidenceRecordLinks.ownerId)))
    .where(and(inArray(evidenceRecordLinks.evidenceRecordId, [...recordIds]), live()));
}

// 06.1-09 M10 — 파일이 지금 붙은 카드 사용의 카드를 바꾼 증빙 id(쪽마다 한 번). 근거는 끌 수 없는 금액 기록(정리 pruned_at은 행을 지우지 않아 조건에 없다)이고,
// 그 기록의 카드 사용이 지금 살아 있는 붙임 주인일 때만이다 — 뗀 뒤 다른 카드 사용에 다시 붙이면 표식이 없다.
export async function findCardReplacedRecordIds(viewer: Viewer, recordIds: readonly string[], tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  if (recordIds.length === 0) return new Set();
  const rows: { recordId: string }[] = await tx
    .select({ recordId: evidenceRecordLinks.evidenceRecordId })
    .from(actionLog)
    .innerJoin(
      evidenceRecordLinks,
      and(
        sql`${evidenceRecordLinks.evidenceRecordId}::text = ${actionLog.detail}->>'evidenceRecordId'`,
        eq(evidenceRecordLinks.ownerKind, "corp_card_usage"),
        sql`${evidenceRecordLinks.ownerId}::text = ${actionLog.entityId}`,
        live(),
      ),
    )
    .where(
      and(
        eq(actionLog.actionType, "evidence_record_amount_change"),
        eq(actionLog.entity, "corp_card_usage"),
        inArray(evidenceRecordLinks.evidenceRecordId, [...recordIds]),
        sql`${actionLog.detail}->>'cardLast4Before' IS DISTINCT FROM ${actionLog.detail}->>'cardLast4After'`,
      ),
    );
  return new Set(rows.map((row) => row.recordId));
}

const pickers = alias(users, "evidence_link_pickers");

export type LinkedEvidenceRow = LiveLinkWithRecord & { attachedByName: string | null };

// 문서 「증빙」 섹션 읽기 — 살아 있는 붙임 + 기록 칸 + 고른 사람 이름(작성자 붙임 2행). 문서 보임은 부르는 domain이 먼저 판정한다.
export async function listLinkedEvidenceRows(viewer: Viewer, input: { ownerKind: EvidenceLinkOwnerKind; ownerId: string }): Promise<LinkedEvidenceRow[]> {
  const rows = await listLiveLinksWithRecords(viewer, { ownerKind: input.ownerKind, ownerIds: [input.ownerId] });
  if (rows.length === 0) return [];
  const names = await db
    .select({ id: pickers.id, name: pickers.name })
    .from(pickers)
    .where(inArray(pickers.id, [...new Set(rows.map((row) => row.attachedBy))]));
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  return rows.map((row) => ({ ...row, attachedByName: nameOf.get(row.attachedBy) ?? null }));
}

// PA-AUTODETACH — 문서가 사라지거나 끝날 때의 사유 글자(06.1-07 S3 이력이 자동 떼기 줄을 가릴 때 읽는다).
export const AUTO_DETACH_REASONS = {
  expenseDelete: "문서 삭제",
  expenseClose: "문서 종결",
  purchaseRequestCancel: "요청 취소",
  cardUsageDelete: "카드 사용 삭제",
} as const;

export type AutoDetachReason = (typeof AUTO_DETACH_REASONS)[keyof typeof AUTO_DETACH_REASONS];

// E22 · DB-15: 문서 삭제 · 종결 · 요청 취소 · 카드 사용 보관 tx 안에서 그 문서의 살아 있는 붙임을 한 UPDATE로 뗀다(뗀 사람 = 실행자). 증빙은
// 풀로 돌아간다(공개 범위 그대로). 뗀 수를 돌려준다. 되살리기는 붙임을 되돌리지 않는다(증빙이 그새 다른 문서에 붙었을 수 있다).
export async function detachLiveLinksForOwner(
  viewer: Viewer,
  input: { ownerKind: EvidenceLinkOwnerKind; ownerId: string; reason: AutoDetachReason },
  tx: DbOrTx,
): Promise<number> {
  const rows = await tx
    .update(evidenceRecordLinks)
    .set({ detachedAt: new Date(), detachedBy: viewer.id, detachReason: input.reason })
    .where(and(eq(evidenceRecordLinks.ownerKind, input.ownerKind), eq(evidenceRecordLinks.ownerId, input.ownerId), live()))
    .returning({ id: evidenceRecordLinks.id });
  return rows.length;
}
