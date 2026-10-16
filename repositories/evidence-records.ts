import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { evidenceRecords } from "@/db/schema";
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
