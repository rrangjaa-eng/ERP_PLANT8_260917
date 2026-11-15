import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { leaveRequests, revenueEntries, settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import { createProject } from "@/domain/projects";
import { applyCutover, CutoverRefusedError, dryRunCutover, type CutoverDeps } from "@/domain/cutover";
import { DELETE_ORDER, FILE_TABLES } from "@/domain/cutover/tables";
import { CUTOVER_MARKER_KEY } from "@/repositories/cutover";
import { insertProject } from "@/repositories/projects";
import { insertRevenueEntry } from "@/repositories/revenue-entries";
import { upsertDocumentCounter } from "@/repositories/document-counters";
import { withTransaction } from "@/lib/db-transaction";
import { countRows, makePerson, teamIdByName } from "./approvals-fixtures";

// 08-02(eng 검토 1회차 2026-11-04 E3 · 2회차 P3): apply 한 트랜잭션의 두 성질 —
// ① 중간 실패면 한 칸도 안 바뀐다(문장 트리거로 DELETE_ORDER 마지막 표에서 RAISE — 빈 표에서도 불린다)
// ② apply와 겹친 쓰기는 apply 커밋 뒤로 밀린다(rowSource 공유 잠금 · 삭제 표 SHARE ROW EXCLUSIVE). 시험용 트리거 · 함수는 afterEach에서 내린다.

const NOW = new Date();
const deps: CutoverDeps = {
  getLastBackup: () => Promise.resolve({ kind: "ok", status: "SUCCESSFUL", endTime: new Date(NOW.getTime() - 600_000).toISOString() }),
};
const LAST_TABLE = DELETE_ORDER[DELETE_ORDER.length - 1] ?? "";

async function installTrigger(body: string): Promise<void> {
  await db.execute(sql.raw(`create or replace function cutover_test_hook() returns trigger language plpgsql as $$ begin ${body}; return null; end $$`));
  await db.execute(sql.raw(`create trigger cutover_test_hook BEFORE DELETE on "${LAST_TABLE}" for each statement execute function cutover_test_hook()`));
}

afterEach(async () => {
  await db.execute(sql.raw(`drop trigger if exists cutover_test_hook on "${LAST_TABLE}"`));
  await db.execute(sql`drop function if exists cutover_test_hook()`);
});

async function marker(): Promise<unknown> {
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CUTOVER_MARKER_KEY));
  return row?.value ?? null;
}

async function seedProject(): Promise<{ pm: Viewer; vendorId: string; teamId: string }> {
  const pm = await makePerson(`PM-${randomUUID().slice(0, 6)}`, "role-pm", "기획1팀");
  const vendor = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID().slice(0, 6)}` });
  const teamId = await teamIdByName("기획1팀");
  await createProject(pm, { clientId: vendor.vendor.id, teamId, pmUserId: pm.id, name: `동시성 ${randomUUID().slice(0, 6)}` });
  return { pm, vendorId: vendor.vendor.id, teamId };
}

async function token(): Promise<string> {
  const dry = await dryRunCutover(SYSTEM_VIEWER);
  if (!("token" in dry)) throw new Error("dry-run 건수 없음");
  return dry.token;
}

async function snapshotCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [...FILE_TABLES, ...DELETE_ORDER, "document_counters", "action_log"]) counts[table] = await countRows(table);
  return counts;
}

// apply가 문장 트리거의 pg_sleep에 들어갈 때까지(잠금을 다 잡은 뒤) 기다린다 — 먼저 쓰면 confirm_mismatch로 흔들린다.
async function waitForApplySleeping(watcher: Client): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await watcher.query<{ n: string }>(
      "select count(*)::text as n from pg_stat_activity where wait_event = 'PgSleep' and datname = current_database() and pid <> pg_backend_pid()",
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("apply가 트리거 대기에 들어가지 않았다");
}

describe("전환 apply 한 트랜잭션(08-02 Task 3 · E3)", () => {
  it("DELETE_ORDER 마지막 표에서 실패하면 삭제 표 · 카운터 · 표시 · 행동 로그가 apply 전과 같다", async () => {
    await seedProject();
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "expense_team", period: "2026", value: 3 });
    const confirm = await token();
    const before = await snapshotCounts();
    await installTrigger("raise exception 'cutover test injected failure'");

    const error = await applyCutover(SYSTEM_VIEWER, { confirm, now: NOW, runUrl: null }, deps).catch((e: unknown) => e);

    // drizzle이 pg 오류를 「Failed query」로 감싸 cause에 넣는다.
    expect(error).toBeInstanceOf(Error);
    expect(String((error as { cause?: { message?: string } }).cause?.message)).toMatch(/injected failure/);
    expect(await snapshotCounts()).toEqual(before);
    expect(before.projects).toBeGreaterThan(0);
    expect(await marker()).toBeNull();
  });

  it("apply와 겹친 쓰기는 apply 커밋 뒤에 끝난다 — source 칸 표는 'live', source 칸 없는 삭제 표 행은 남고 apply는 성공한다", async () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(3);
    const { pm, vendorId, teamId } = await seedProject();
    const confirm = await token();
    await installTrigger("perform pg_sleep(1)");
    const watcher = new Client({ connectionString: process.env.DATABASE_URL });
    await watcher.connect();
    const finished: string[] = [];
    try {
      const applying = applyCutover(SYSTEM_VIEWER, { confirm, now: NOW, runUrl: null }, deps).then((result) => (finished.push("apply"), result));
      await waitForApplySleeping(watcher);

      const writing = withTransaction(async (tx) => {
        const project = await insertProject(
          pm,
          { number: `C${randomUUID().slice(0, 8)}`, clientId: vendorId, teamId, pmUserId: pm.id, name: "겹친 쓰기", status: "bidding", preEstimateCurrency: "KRW", preEstimateForeignAmount: null, preEstimateFxRate: "1", preEstimateAmountKrw: 0 },
          tx,
        );
        const revenue = await insertRevenueEntry(pm, { projectId: project.id, kind: "issue", entryDate: "2026-10-01", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 1_000 }, tx);
        return { project, revenue };
      }).then((result) => (finished.push("revenue"), result));
      const leave = db
        .insert(leaveRequests)
        .values({ drafterId: pm.id, kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", daysQuarters: 4, fiscalYear: 2026 })
        .returning({ id: leaveRequests.id })
        .then((rows) => (finished.push("leave"), rows));

      const [applied, { project, revenue }, leaveRows] = await Promise.all([applying, writing, leave]);

      expect(applied.mode).toBe("apply");
      // 표 잠금 · 공유 잠금이 없으면 겹친 쓰기가 apply의 대기 중에 먼저 끝난다.
      expect(finished[0]).toBe("apply");
      // 잠금을 기다린 쪽은 트랜잭션의 첫 rowSource(프로젝트)다 — 한 문장으로 짜면 대기 전 스냅숏이라 여기서 'demo'가 된다.
      expect(project.source).toBe("live");
      if (!revenue) throw new Error("매출 줄이 생기지 않았다");
      const [stored] = await db.select({ source: revenueEntries.source }).from(revenueEntries).where(eq(revenueEntries.id, revenue.id));
      expect(stored?.source).toBe("live");
      expect(await countRows("projects")).toBe(1);
      expect((await db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveRows[0]?.id ?? ""))).length).toBe(1);
    } finally {
      await watcher.end();
    }
  });

  it("같은 확인 문자열로 apply 둘을 동시에 부르면 하나는 성공 · 하나는 already_cut_over", async () => {
    await seedProject();
    const confirm = await token();

    const results = await Promise.allSettled([
      applyCutover(SYSTEM_VIEWER, { confirm, now: NOW, runUrl: null }, deps),
      applyCutover(SYSTEM_VIEWER, { confirm, now: NOW, runUrl: null }, deps),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason instanceof CutoverRefusedError ? rejected.reason.reason : null).toBe("already_cut_over");
    expect(await countRows("action_log")).toBeGreaterThan(0);
  });
});
