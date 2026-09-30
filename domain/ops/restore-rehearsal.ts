import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  findLatestRestoreRehearsal as defaultFindLatest,
  insertRestoreRehearsal as defaultInsert,
} from "@/repositories/restore-rehearsals";

// D8-08: 복원 리허설 결과. 호출자는 CLI `record`(SYSTEM_VIEWER)와 이미 can()을 거친
// getSystemStatus뿐이라 여기서 권한을 다시 판정하지 않는다.

export class ValidationError extends UserFacingError {}

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

const SOURCES: readonly string[] = ["staging", "production"] satisfies RestoreRehearsalSource[];
const STAGES: readonly string[] = ["restore", "verify", "cleanup"] satisfies RestoreRehearsalStage[];
const BACKUP_ID_PATTERN = /^\d+$/;
// 저장된 run_url은 그대로 href가 된다 — 이 모양 말고는 쓰지도 보이지도 않는다(T-04.4-01).
const RUN_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/;
const RUN_KEY_PATTERN = /^\d+-\d+$/;

function isStage(value: string | null): value is RestoreRehearsalStage {
  return value !== null && STAGES.includes(value);
}

// 쓰기 전과 읽은 뒤에 같은 규칙을 쓴다(Codex #16·#17) — DB CHECK와 같은 불변식에
// 시각·백업 id·실행 URL 모양을 더한다.
function toValidRecord(value: {
  source: string;
  succeeded: boolean;
  failedStage: string | null;
  backupId: string | null;
  startedAt: Date;
  finishedAt: Date;
  runUrl: string | null;
}): RestoreRehearsalRecord {
  const { source, succeeded, failedStage, backupId, startedAt, finishedAt, runUrl } = value;
  if (!SOURCES.includes(source)) throw new ValidationError("원본 환경 오류 · staging 또는 production만");
  if (succeeded && failedStage !== null) throw new ValidationError("성공한 리허설에 실패 단계 있음");
  if (!succeeded && !isStage(failedStage)) {
    throw new ValidationError("실패 단계 오류 · restore·verify·cleanup 중 하나");
  }
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(finishedAt.getTime())) {
    throw new ValidationError("시작·종료 시각 오류");
  }
  if (finishedAt.getTime() < startedAt.getTime()) throw new ValidationError("종료 시각이 시작 시각보다 이름");
  if (backupId !== null && !BACKUP_ID_PATTERN.test(backupId)) throw new ValidationError("백업 id 오류 · 숫자만");
  if (runUrl !== null && !RUN_URL_PATTERN.test(runUrl)) {
    throw new ValidationError("실행 URL 오류 · GitHub Actions 실행 주소만");
  }
  if (!succeeded && runUrl === null) throw new ValidationError("실패한 리허설에 실행 URL 없음");
  return {
    source: source as RestoreRehearsalSource,
    succeeded,
    failedStage: isStage(failedStage) ? failedStage : null,
    backupId,
    startedAt,
    finishedAt,
    runUrl,
  };
}

export async function recordRestoreRehearsal(
  viewer: Viewer,
  input: RestoreRehearsalInput,
): Promise<RecordRestoreRehearsalResult> {
  const record = toValidRecord(input);
  if (!RUN_KEY_PATTERN.test(input.runKey)) {
    throw new ValidationError("실행 키 오류 · <실행 id>-<시도> 모양");
  }
  const { inserted, stored } = await defaultInsert(viewer, { ...record, runKey: input.runKey });
  return {
    inserted,
    stored: { succeeded: stored.succeeded, failedStage: isStage(stored.failedStage) ? stored.failedStage : null },
  };
}

// 읽은 행이 규칙을 어기면 던진다 — getSystemStatus가 그 행만 「확인 불가」로 바꾼다.
export async function getLatestRestoreRehearsal(viewer: Viewer): Promise<RestoreRehearsalRecord | null> {
  const row = await defaultFindLatest(viewer);
  return row ? toValidRecord(row) : null;
}
