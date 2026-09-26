import type { Viewer } from "@/domain/viewer";
import {
  findLatestRestoreRehearsal as defaultFindLatest,
  insertRestoreRehearsal as defaultInsert,
  type RestoreRehearsalRow,
} from "@/repositories/restore-rehearsals";

// D8-08: 복원 리허설 결과. 호출자는 CLI `record`(SYSTEM_VIEWER)와 이미 can()을 거친
// getSystemStatus뿐이라 여기서 권한을 다시 판정하지 않는다.

export type RestoreRehearsalSource = "staging" | "production";
export type RestoreRehearsalStage = "restore" | "verify" | "cleanup";

export type RestoreRehearsalRecord = {
  source: RestoreRehearsalSource;
  succeeded: boolean;
  failedStage: RestoreRehearsalStage | null;
  backupId: string | null;
  startedAt: Date;
  finishedAt: Date;
  runUrl: string | null;
};

export type RestoreRehearsalInput = RestoreRehearsalRecord & { runKey: string };

export type RecordRestoreRehearsalResult = {
  inserted: boolean;
  stored: { succeeded: boolean; failedStage: RestoreRehearsalStage | null };
};

export async function recordRestoreRehearsal(
  viewer: Viewer,
  input: RestoreRehearsalInput,
): Promise<RecordRestoreRehearsalResult> {
  const { inserted, stored } = await defaultInsert(viewer, input);
  return {
    inserted,
    stored: { succeeded: stored.succeeded, failedStage: stored.failedStage as RestoreRehearsalStage | null },
  };
}

function toRecord(row: RestoreRehearsalRow): RestoreRehearsalRecord {
  return {
    source: row.source as RestoreRehearsalSource,
    succeeded: row.succeeded,
    failedStage: row.failedStage as RestoreRehearsalStage | null,
    backupId: row.backupId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    runUrl: row.runUrl,
  };
}

export async function getLatestRestoreRehearsal(viewer: Viewer): Promise<RestoreRehearsalRecord | null> {
  const row = await defaultFindLatest(viewer);
  return row ? toRecord(row) : null;
}
