import { archiveEvidenceRecord, EvidenceArchiveConflictError, restoreEvidenceRecord, type EvidenceArchiveInput } from "@/domain/evidence-records";
import { can, ForbiddenError } from "@/domain/permissions/can";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";

// 07.2-09(X1 · D-7281~7283): 증빙 목록 일괄 보관 · 되돌리기 — `domain/payments/batch.ts` 모양의 부분 성공.
// 행마다 단건 함수(archiveEvidenceRecord · restoreEvidenceRecord)를 그 함수의 트랜잭션으로 부른다 — 이 파일은 트랜잭션을 열지 않고 붙은 줄 ·
// version 판정을 복사하지 않는다(판정은 단건 한 곳). 한 행의 실패는 다른 행의 기록을 되돌리지 않는다. 권한은 단건과 같은 `evidence.intake` 쓰기라
// 루프 전 한 번 보고 맨 앞에서 거부한다(행 범위는 단건 경로가 그대로 건다 — 새 판정 없음).

export const EVIDENCE_BATCH_LIMIT = 300;
export const EVIDENCE_BATCH_OVER_LIMIT = `${EVIDENCE_BATCH_LIMIT}건까지`;
export const EVIDENCE_BATCH_ROW_FAILED = "보관 실패 · 다시 시도";

export type EvidenceBatchBlocked = { id: string; reason: string };
export type EvidenceBatchResult = { processed: EvidenceArchiveInput[]; blocked: EvidenceBatchBlocked[] };

// 오류 → 이유 글자. 단건 보관 거부는 그 오류의 글자 그대로(붙음 · 다른 사람이 바꿈), 그 밖은 한 글자만 내보낸다(상세는 서버 로그).
function reasonOf(error: unknown): string {
  if (error instanceof EvidenceArchiveConflictError) return error.message;
  return EVIDENCE_BATCH_ROW_FAILED;
}

async function runBatch(
  viewer: Viewer,
  items: readonly EvidenceArchiveInput[],
  one: (viewer: Viewer, input: EvidenceArchiveInput) => Promise<EvidenceArchiveInput>,
  label: string,
): Promise<EvidenceBatchResult> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError("증빙 등록 권한 없음");
  if (items.length > EVIDENCE_BATCH_LIMIT) throw new UserFacingError(EVIDENCE_BATCH_OVER_LIMIT);
  const seen = new Set<string>();
  const rows = items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));

  const processed: EvidenceArchiveInput[] = [];
  const blocked: EvidenceBatchBlocked[] = [];
  for (const row of rows) {
    try {
      processed.push(await one(viewer, row));
    } catch (error) {
      if (!(error instanceof EvidenceArchiveConflictError)) log.error(label, { id: row.id, error: error instanceof Error ? error.name : "unknown" });
      blocked.push({ id: row.id, reason: reasonOf(error) });
    }
  }
  return { processed, blocked };
}

export async function archiveEvidenceBatch(viewer: Viewer, items: readonly EvidenceArchiveInput[]): Promise<EvidenceBatchResult> {
  return runBatch(viewer, items, (who, input) => archiveEvidenceRecord(who, input), "증빙 일괄 보관 행 처리 실패");
}

export async function restoreEvidenceBatch(viewer: Viewer, items: readonly EvidenceArchiveInput[]): Promise<EvidenceBatchResult> {
  return runBatch(viewer, items, (who, input) => restoreEvidenceRecord(who, input), "증빙 일괄 되돌리기 행 처리 실패");
}
