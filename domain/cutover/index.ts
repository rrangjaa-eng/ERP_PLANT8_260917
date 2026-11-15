import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { recordAction } from "@/domain/action-log/record";
import type { SystemStatus } from "@/domain/system-status";
import {
  countCounterRowsExcept,
  countDemoRows,
  countRows,
  deleteAll,
  lockDeleteTables,
  lockMarkerExclusive,
  readMarker,
  resetCountersExcept,
  writeMarker,
} from "@/repositories/cutover";
import { DELETE_ORDER, KEEP_COUNTER_KEYS, RESET_TABLES, SOURCE_NOT_DEMO } from "./tables";

// 08-02(D8-05 · D8-09): 전환 도구. dry-run은 건수 · 확인 문자열만, apply는 한 트랜잭션에서 잠금 → 표시 확인 → 확인 문자열 대조 →
// 업무 표 비우기(FK 순서) → 번호 카운터 초기화(cert 제외) → 전환 표시 → 행동 로그. 하나라도 실패하면 아무것도 안 바뀐다.

// 마지막 백업이 성공 · 3시간 안이어야 apply한다(260907 gates.mjs 「--백업했다」 열쇠의 자동판).
export const BACKUP_MAX_AGE_MINUTES = 180;

type Backup = SystemStatus["backup"];

export type CutoverDeps = {
  getLastBackup: (params: { project?: string; instance?: string }) => Promise<Backup>;
};

export type CutoverRefusalReason = "already_cut_over" | "confirm_mismatch" | "backup_not_fresh";

export type BackupSummary = { kind: Backup["kind"]; status?: string; endTime?: string | null; reason?: string };

// 거부는 한 클래스(reason) — CLI가 종료 3으로 가른다. backup은 backup_not_fresh일 때 조회 결과(조회 불가 · 낡음 · 실패 구분 — B3).
export class CutoverRefusedError extends Error {
  constructor(
    readonly reason: CutoverRefusalReason,
    readonly backup?: BackupSummary,
  ) {
    super(`전환 거부: ${reason}`);
  }
}

type Snapshot = { counts: Record<string, number>; counters: number; total: number; token: string };

export type DryRunResult =
  | ({ mode: "dry-run" } & Snapshot)
  | { mode: "dry-run"; marker: string; demoRemaining: number };

export type ApplyResult = { mode: "apply"; marker: string } & Snapshot;

// 표 이름 순 `이름=수` 줄(+ document_counters=초기화 행 수)의 sha256 앞 8자리, 앞에 총건수.
export function confirmToken(counts: Record<string, number>, counters: number): { total: number; token: string } {
  const lines = Object.keys(counts)
    .sort()
    .map((table) => `${table}=${counts[table]}`);
  lines.push(`document_counters=${counters}`);
  const total = Object.values(counts).reduce((sum, n) => sum + n, counters);
  const hash = createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 8);
  return { total, token: `${total}-${hash}` };
}

async function snapshot(viewer: Viewer, tx?: DbOrTx): Promise<Snapshot> {
  const counts: Record<string, number> = {};
  for (const table of DELETE_ORDER) counts[table] = await countRows(viewer, table, tx);
  const counters = await countCounterRowsExcept(viewer, KEEP_COUNTER_KEYS, tx);
  return { counts, counters, ...confirmToken(counts, counters) };
}

function seoulIso(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function summarizeBackup(backup: Backup): BackupSummary {
  if (backup.kind === "ok") return { kind: backup.kind, status: backup.status, endTime: backup.endTime };
  if (backup.kind === "unavailable") return { kind: backup.kind, reason: backup.reason };
  return { kind: backup.kind };
}

function isBackupFresh(backup: Backup, now: Date): boolean {
  if (backup.kind !== "ok" || backup.status !== "SUCCESSFUL" || !backup.endTime) return false;
  const ageMs = now.getTime() - Date.parse(backup.endTime);
  return ageMs >= 0 && ageMs <= BACKUP_MAX_AGE_MINUTES * 60_000;
}

export async function dryRunCutover(viewer: Viewer): Promise<DryRunResult> {
  const marker = await readMarker(viewer);
  if (marker) return { mode: "dry-run", marker, demoRemaining: await countDemoRows(viewer, SOURCE_NOT_DEMO) };
  return { mode: "dry-run", ...(await snapshot(viewer)) };
}

export async function applyCutover(
  viewer: Viewer,
  input: { confirm: string; now: Date; runUrl: string | null },
  deps: CutoverDeps,
): Promise<ApplyResult> {
  // 트랜잭션 밖에서 — 외부 호출이 잠금을 쥔 채 기다리지 않게.
  const backup = await deps.getLastBackup({ project: env.GCP_PROJECT_ID, instance: env.CLOUD_SQL_INSTANCE_ID });
  if (!isBackupFresh(backup, input.now)) throw new CutoverRefusedError("backup_not_fresh", summarizeBackup(backup));

  return withTransaction(async (tx) => {
    await lockMarkerExclusive(viewer, tx);
    // 건수를 세기 전에 삭제 표 · 카운터의 쓰기를 막는다(E2).
    await lockDeleteTables(viewer, [...DELETE_ORDER, ...RESET_TABLES], tx);
    if (await readMarker(viewer, tx)) throw new CutoverRefusedError("already_cut_over");

    const current = await snapshot(viewer, tx);
    if (current.token !== input.confirm) throw new CutoverRefusedError("confirm_mismatch");

    for (const table of DELETE_ORDER) {
      const deleted = await deleteAll(viewer, table, tx);
      if (deleted !== current.counts[table]) throw new Error(`전환 중단: ${table} 지운 행 ${deleted} ≠ 센 건수 ${current.counts[table]}`);
    }
    const reset = await resetCountersExcept(viewer, KEEP_COUNTER_KEYS, tx);
    if (reset !== current.counters) throw new Error(`전환 중단: document_counters 초기화 ${reset} ≠ 센 건수 ${current.counters}`);

    const marker = seoulIso(input.now);
    await writeMarker(viewer, marker, tx);
    await recordAction(
      SYSTEM_VIEWER,
      {
        actionType: "cutover_apply",
        entity: "cutover",
        detail: { counts: current.counts, counters: current.counters, token: current.token, runUrl: input.runUrl },
      },
      { tx },
    );
    return { mode: "apply", ...current, marker };
  });
}
