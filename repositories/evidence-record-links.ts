import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { evidenceRecordLinks, evidenceRecords } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.1-12(EVID-08 · D-6104 · D-6105): 증빙 기록 붙임 읽기. 살아 있는 붙임 = detached_at IS NULL — 06.1 「증빙 있음」 판정은 이 파일의 조건 하나다.
// 이 모듈은 domain을 import하지 않는다. 쓰기(붙이기 · 떼기)는 06.1-06이 더한다.

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
      lastAttachedAt: sql<Date>`max(${evidenceRecordLinks.attachedAt})`.mapWith(evidenceRecordLinks.attachedAt),
    })
    .from(evidenceRecordLinks)
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, evidenceRecordLinks.evidenceRecordId))
    .where(and(eq(evidenceRecordLinks.ownerKind, input.ownerKind), inArray(evidenceRecordLinks.ownerId, [...input.ownerIds]), live()))
    .groupBy(evidenceRecordLinks.ownerId);
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
