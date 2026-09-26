import type { Viewer } from "@/domain/viewer";
import { RESTORE_CHECK_TABLES } from "@/domain/ops/restore-check-tables";
import {
  countTableRows as defaultCountTableRows,
  readAppliedMigrations as defaultReadAppliedMigrations,
} from "@/repositories/restore-verify";

// D8-08: 복원된 임시 DB가 쓸 수 있는 데이터인지 — 마이그레이션 버전 일치와 핵심 표가
// 읽히고 비어 있지 않은지. 질의 예외는 그 항목의 실패로 바꾸고 밖으로 던지지 않는다.

export type MigrationJournal = { entries: { idx: number; when: number; tag: string }[] };
export type RestoreCheck = { name: string; ok: boolean; detail: string };
export type RestoreVerifyResult = { ok: boolean; checks: RestoreCheck[] };

export type RestoreVerifyDeps = {
  readAppliedMigrations: (viewer: Viewer) => Promise<number[]>;
  countTableRows: (viewer: Viewer, table: string) => Promise<number>;
};

const defaultDeps: RestoreVerifyDeps = {
  readAppliedMigrations: defaultReadAppliedMigrations,
  countTableRows: defaultCountTableRows,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 적용 수열 전체가 journal의 앞부분과 원소 하나하나 같아야 한다(Codex #10) —
// 중복 · 빠짐 · 중간 값 바뀜은 실패. 백업 뒤 배포로 이미지가 앞선 것은 정상이다.
function compareMigrations(applied: number[], journal: MigrationJournal): RestoreCheck {
  const name = "마이그레이션";
  const n = applied.length;
  const total = journal.entries.length;
  if (n === 0) return { name, ok: false, detail: "적용된 마이그레이션이 없습니다" };
  if (n > total) return { name, ok: false, detail: `적용 ${n}개가 이미지 ${total}개보다 많습니다` };
  const mismatch = applied.findIndex((when, i) => when !== journal.entries[i]?.when);
  if (mismatch !== -1) {
    return { name, ok: false, detail: `${mismatch + 1}번째 적용 기록이 이미지와 다릅니다` };
  }
  const lastTag = journal.entries[n - 1]?.tag ?? "";
  const behind = total - n;
  const gap = behind === 0 ? "이미지와 같음" : `이미지보다 ${behind}개 뒤`;
  return { name, ok: true, detail: `적용 ${n}개 · 마지막 ${lastTag} · ${gap}` };
}

export async function verifyRestoredDatabase(
  viewer: Viewer,
  journal: MigrationJournal,
  deps: RestoreVerifyDeps = defaultDeps,
): Promise<RestoreVerifyResult> {
  const checks: RestoreCheck[] = [];

  try {
    checks.push(compareMigrations(await deps.readAppliedMigrations(viewer), journal));
  } catch (error) {
    checks.push({ name: "마이그레이션", ok: false, detail: `읽기 실패: ${errorMessage(error)}` });
  }

  for (const { table, requireRows } of RESTORE_CHECK_TABLES) {
    try {
      const rows = await deps.countTableRows(viewer, table);
      checks.push({ name: table, ok: !(requireRows && rows === 0), detail: `${rows}행` });
    } catch (error) {
      checks.push({ name: table, ok: false, detail: `읽기 실패: ${errorMessage(error)}` });
    }
  }

  return { ok: checks.every((check) => check.ok), checks };
}
