import type { DbOrTx } from "@/db/client";
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
