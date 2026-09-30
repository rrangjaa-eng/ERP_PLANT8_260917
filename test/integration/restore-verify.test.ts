import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyRestoredDatabase, type MigrationJournal } from "@/domain/ops/restore-verify";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04.4-02(D8-08): 로컬 erp_test를 복원본 대역으로 쓴다 — globalSetup이 실제 journal로
// 마이그레이션했고 setup이 매 테스트 전 표를 비우고 시드한다. 시드는 users를 채우지
// 않으므로 확인 전에 픽스처 사용자를 만든다(Codex #14).
//
// 한계: CLI 성공 경로는 여기서 돌리지 않는다 — CLOUD_SQL_CONNECTION_NAME을 주면
// db/client가 커넥터를 만든다. CLI 가드는 단위 테스트, 실제 1회는 04.4-06이 본다.
const journal = JSON.parse(
  readFileSync(resolve(process.cwd(), "db/migrations/meta/_journal.json"), "utf8"),
) as MigrationJournal;

function migrationCheck(result: Awaited<ReturnType<typeof verifyRestoredDatabase>>) {
  const check = result.checks.find((c) => c.name === "마이그레이션");
  expect(check).toBeDefined();
  return check!;
}

beforeEach(async () => {
  await db.insert(users).values({ id: "restore-verify-user", name: "리허설 확인", email: "restore-verify@example.com" });
});

describe("verifyRestoredDatabase — 실제 Postgres(트레이서)", () => {
  it("정상 복원본은 통과하고 적용 개수가 journal과 같다", async () => {
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal);
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(migrationCheck(result).detail).toContain(`적용 ${journal.entries.length}개`);
  });

  it("필수 표(permission_matrix)가 비면 그 항목만 실패한다", async () => {
    await db.execute(sql`delete from permission_matrix`);
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal);
    expect(result.ok).toBe(false);
    expect(result.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["permission_matrix"]);
    expect(result.checks.find((c) => c.name === "users")?.ok).toBe(true);
  });

  it("이미지가 1개 앞서면(백업 뒤 배포) 통과하고 차이를 적는다", async () => {
    const last = journal.entries.at(-1)!;
    const ahead = { entries: [...journal.entries, { ...last, idx: last.idx + 1, when: last.when + 1, tag: "9999_next" }] };
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, ahead);
    expect(result.ok).toBe(true);
    expect(migrationCheck(result).detail).toContain("이미지보다 1개 뒤");
  });

  it("복원본이 이미지보다 앞서면 실패한다", async () => {
    const behind = { entries: journal.entries.slice(0, -1) };
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, behind);
    expect(migrationCheck(result).ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("중간 항목의 when이 다르면 실패한다", async () => {
    const changed = { entries: journal.entries.map((e, i) => (i === 2 ? { ...e, when: e.when + 1 } : e)) };
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, changed);
    expect(migrationCheck(result).ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});
