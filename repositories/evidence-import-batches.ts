import { asc, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { evidenceImportBatches } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.1-04: 등록 묶음 — 올린 파일 하나 = 한 행(원래 이름 · sha256 · 줄 수 · 건수). 바이트는 어디에도 두지 않는다.
// 같은 파일을 다시 올려도 행이 하나 더 생긴다(올린 이력) — 「같은 파일」 판정은 findBatchIdBySha가 한다.

export type EvidenceImportBatchInsert = {
  format: string;
  originalName: string;
  fileSha256: string;
  rowCount: number;
  uploadedBy: string;
};

export async function insertBatch(viewer: Viewer, input: EvidenceImportBatchInsert, tx: DbOrTx): Promise<{ id: string }> {
  void viewer;
  const [row] = await tx
    .insert(evidenceImportBatches)
    .values({ ...input, registeredCount: 0, skippedDuplicateCount: 0 })
    .returning({ id: evidenceImportBatches.id });
  if (!row) throw new Error("evidence_import_batches insert가 행을 반환하지 않았습니다.");
  return row;
}

// GH-P1(PR #252): 카드 서식 등록 잠금 하나 — 앞 파일 대조(이미 있는 열쇠 · 상쇄 쌍 맞추기)는 이 잠금 뒤 tx로 다시 읽는다. 잠그지 않으면
// 원거래만 든 파일과 원거래 · 취소 쌍 파일이 겹칠 때 둘 다 서로의 줄을 못 봐 원거래만 살아 남는다(lockVendorAutocreate 꼴).
export async function lockEvidenceCardImport(viewer: Viewer, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"evidence_card_import"}, 0))`);
}

export async function setBatchCounts(
  viewer: Viewer,
  id: string,
  counts: { registeredCount: number; skippedDuplicateCount: number },
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  await tx.update(evidenceImportBatches).set(counts).where(eq(evidenceImportBatches.id, id));
}

// 트랜잭션 밖 사전 조회 — 같은 sha256의 가장 먼저 올린 묶음 id(없으면 null).
export async function findBatchIdBySha(viewer: Viewer, fileSha256: string): Promise<string | null> {
  void viewer;
  const [row] = await db
    .select({ id: evidenceImportBatches.id })
    .from(evidenceImportBatches)
    .where(eq(evidenceImportBatches.fileSha256, fileSha256))
    .orderBy(asc(evidenceImportBatches.createdAt))
    .limit(1);
  return row?.id ?? null;
}
