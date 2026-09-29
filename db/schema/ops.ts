import { sql } from "drizzle-orm";
import { pgTable, text, bigint, boolean, timestamp, check, unique } from "drizzle-orm/pg-core";

// D8-08: 복원 리허설 결과 한 줄 — 각 환경의 리허설 Job이 자기 DB에만 쓰고, 그 환경의
// 시스템 상태 화면이 같은 DB에서 읽는다(스테이징 기록이 프로덕션 증거로 보일 경로가 없다).
// 기록은 CLI `record`(scripts/restore-rehearsal-cli.ts)만 쓴다 — 사람이 DB에 명령하지 않는다.
// 이 표의 시각만 timestamptz다(UI-SPEC #11 — 화면이 KST로 바꿔 보인다).
export const restoreRehearsals = pgTable(
  "restore_rehearsals",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    source: text("source").notNull(),
    succeeded: boolean("succeeded").notNull(),
    failedStage: text("failed_stage"),
    backupId: text("backup_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    runUrl: text("run_url"),
    // `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>` — 같은 실행·시도의 기록을 다시 돌려도 한 줄.
    runKey: text("run_key").notNull(),
  },
  (table) => [
    check("restore_rehearsals_source_check", sql`${table.source} in ('staging', 'production')`),
    // NULL IN (…)은 NULL이고 check는 NULL을 통과시키므로 실패 쪽에 is not null을 따로 적는다.
    check(
      "restore_rehearsals_stage_check",
      sql`(${table.succeeded} and ${table.failedStage} is null) or (not ${table.succeeded} and ${table.failedStage} is not null and ${table.failedStage} in ('restore', 'verify', 'cleanup'))`,
    ),
    // 기록은 늘 GitHub Actions 실행 안에서 돈다 — 실패 행은 항상 자기 실행 URL을 가진다.
    check("restore_rehearsals_failed_run_url_check", sql`${table.succeeded} or ${table.runUrl} is not null`),
    unique("restore_rehearsals_run_key_unique").on(table.runKey),
  ],
);
