import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { UNPRUNABLE_ACTION_TYPES } from "@/domain/action-log/prune-scope";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { markActionLogRowsPruned } from "@/repositories/action-log";

// 07-13(R6 · D7) — 행동 로그 불변 트리거. 앱 코드를 거치지 않는 문장(psql과 같은 길)으로 DB가 직접 막는지 본다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.message로 본다.

type PgCause = { code?: unknown; message?: unknown };

async function expectAppendOnly(run: () => Promise<unknown>): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect({ code: cause?.code, message: cause?.message }).toEqual({ code: "P0001", message: "action_log is append-only" });
}

async function insertRow(actionType: string): Promise<number> {
  const [row] = await db.insert(actionLog).values({ actionType, detail: { probe: true } }).returning({ seq: actionLog.seq });
  if (!row) throw new Error("행동 로그 행을 넣지 못했습니다");
  return row.seq;
}

async function readRow(seq: number) {
  const [row] = await db.select().from(actionLog).where(eq(actionLog.seq, seq));
  if (!row) throw new Error(`행동 로그 ${seq} 행이 없습니다`);
  return row;
}

async function countRows(actionType: string): Promise<number> {
  const rows = await db.select({ seq: actionLog.seq }).from(actionLog).where(eq(actionLog.actionType, actionType));
  return rows.length;
}

describe("action_log 불변 트리거 — DELETE", () => {
  it("DELETE는 P0001 · append-only로 거부되고 행이 남는다", async () => {
    const seq = await insertRow("immutable_probe");
    await expectAppendOnly(() => db.execute(sql`DELETE FROM action_log WHERE seq = ${seq}`));
    expect(await countRows("immutable_probe")).toBe(1);
  });

  it("매 테스트 비우기는 그대로 돈다 — 앞 테스트의 행이 보이지 않는다", async () => {
    expect(await countRows("immutable_probe")).toBe(0);
  });
});

describe("action_log 불변 트리거 — TRUNCATE", () => {
  it("TRUNCATE action_log는 P0001로 거부된다", async () => {
    await insertRow("immutable_probe");
    await expectAppendOnly(() => db.execute(sql`TRUNCATE action_log`));
    expect(await countRows("immutable_probe")).toBe(1);
  });

  it("TRUNCATE users CASCADE처럼 action_log가 끌려 들어오는 문장도 P0001로 거부된다", async () => {
    await insertRow("immutable_probe");
    await expectAppendOnly(() => db.execute(sql`TRUNCATE users CASCADE`));
    expect(await countRows("immutable_probe")).toBe(1);
  });
});

describe("action_log 불변 트리거 — 정리 두 칸 밖 UPDATE", () => {
  it("detail · occurred_at · action_type을 바꾸는 UPDATE는 P0001로 거부되고 행이 그대로다", async () => {
    const seq = await insertRow("immutable_probe");
    const before = await readRow(seq);
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET detail = '{}'::jsonb WHERE seq = ${seq}`));
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET occurred_at = occurred_at - interval '1 day' WHERE seq = ${seq}`));
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET action_type = 'document_update' WHERE seq = ${seq}`));
    expect(await readRow(seq)).toEqual(before);
  });

  it("정리 표시와 다른 칸을 함께 바꾸는 UPDATE는 P0001로 거부된다", async () => {
    const seq = await insertRow("immutable_probe");
    await expectAppendOnly(() =>
      db.execute(sql`UPDATE action_log SET pruned_at = now(), pruned_by = 'tester', detail = '{}'::jsonb WHERE seq = ${seq}`),
    );
    expect((await readRow(seq)).prunedAt).toBeNull();
  });
});

describe("action_log 불변 트리거 — 정리 표시(NULL → 값 한 방향)", () => {
  it("정리 안 된 행에 pruned_at · pruned_by를 함께 찍는 처음 정리는 통과한다", async () => {
    const seq = await insertRow("immutable_probe");
    await db.execute(sql`UPDATE action_log SET pruned_at = now(), pruned_by = 'tester' WHERE seq = ${seq}`);
    const row = await readRow(seq);
    expect(row.prunedAt).not.toBeNull();
    expect(row.prunedBy).toBe("tester");
  });

  it("markActionLogRowsPruned는 건수를 돌려주고, 다시 부르면 오류 없이 0건이다", async () => {
    await insertRow("immutable_probe");
    await insertRow("immutable_probe");
    expect(await markActionLogRowsPruned(SYSTEM_VIEWER, { actionType: "immutable_probe" })).toBe(2);
    expect(await markActionLogRowsPruned(SYSTEM_VIEWER, { actionType: "immutable_probe" })).toBe(0);
  });

  it("pruned_by 없이 pruned_at만 찍는 정리는 P0001로 거부된다", async () => {
    const seq = await insertRow("immutable_probe");
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET pruned_at = now() WHERE seq = ${seq}`));
    expect((await readRow(seq)).prunedAt).toBeNull();
  });

  async function prunedRow(): Promise<{ seq: number; prunedAt: Date | null; prunedBy: string | null }> {
    const seq = await insertRow("immutable_probe");
    expect(await markActionLogRowsPruned(SYSTEM_VIEWER, { actionType: "immutable_probe" })).toBe(1);
    const row = await readRow(seq);
    expect(row.prunedAt).not.toBeNull();
    return { seq, prunedAt: row.prunedAt, prunedBy: row.prunedBy };
  }

  it("정리 취소 — 이미 정리된 행의 pruned_at · pruned_by를 NULL로 되돌리면 P0001이고 처음 값 그대로다", async () => {
    const first = await prunedRow();
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET pruned_at = NULL, pruned_by = NULL WHERE seq = ${first.seq}`));
    const row = await readRow(first.seq);
    expect({ prunedAt: row.prunedAt, prunedBy: row.prunedBy }).toEqual({ prunedAt: first.prunedAt, prunedBy: first.prunedBy });
  });

  it("재귀속 — 이미 정리된 행의 pruned_by를 다른 사람으로 바꾸면 P0001이고 처음 값 그대로다", async () => {
    const first = await prunedRow();
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET pruned_by = 'someone-else' WHERE seq = ${first.seq}`));
    const row = await readRow(first.seq);
    expect({ prunedAt: row.prunedAt, prunedBy: row.prunedBy }).toEqual({ prunedAt: first.prunedAt, prunedBy: first.prunedBy });
  });

  it("다시 정리 — 이미 정리된 행에 pruned_at 새 값을 찍으면 P0001이고 처음 값 그대로다", async () => {
    const first = await prunedRow();
    await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET pruned_at = now() + interval '1 hour' WHERE seq = ${first.seq}`));
    const row = await readRow(first.seq);
    expect({ prunedAt: row.prunedAt, prunedBy: row.prunedBy }).toEqual({ prunedAt: first.prunedAt, prunedBy: first.prunedBy });
  });
});

describe("action_log 불변 트리거 — 끌 수 없는 종류(R4)", () => {
  it("끌 수 없는 종류(cert_view · action_log_prune)에 정리 표시를 찍으면 P0001 · 정리 가능한 종류는 통과한다", async () => {
    const certView = await insertRow("cert_view");
    const prune = await insertRow("action_log_prune");
    const prunable = await insertRow("immutable_probe");
    for (const seq of [certView, prune]) {
      await expectAppendOnly(() => db.execute(sql`UPDATE action_log SET pruned_at = now(), pruned_by = 'tester' WHERE seq = ${seq}`));
      expect((await readRow(seq)).prunedAt).toBeNull();
    }
    await db.execute(sql`UPDATE action_log SET pruned_at = now(), pruned_by = 'tester' WHERE seq = ${prunable}`);
    expect((await readRow(prunable)).prunedAt).not.toBeNull();
  });

  it("표류 가드 — 불변 트리거 마이그레이션이 UNPRUNABLE_ACTION_TYPES 원소를 모두 담는다(목록이 늘면 새 마이그레이션)", () => {
    const dir = path.join(process.cwd(), "db/migrations");
    const file = readdirSync(dir).find((name) => name.endsWith("_phase7_action_log_immutable.sql"));
    if (!file) throw new Error("*_phase7_action_log_immutable.sql 마이그레이션이 없습니다");
    const body = readFileSync(path.join(dir, file), "utf8");
    const missing = UNPRUNABLE_ACTION_TYPES.filter((type) => !body.includes(`'${type}'`));
    expect(missing).toEqual([]);
  });
});
