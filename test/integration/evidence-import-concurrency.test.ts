import { Client } from "pg";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { evidenceImportBatches, evidenceRecords } from "@/db/schema";
import { lotteFixture, shinhanFixture } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, registerFixtureFile } from "./fixtures/evidence";

// GH-P1(PR #252): 등록 트랜잭션 안 묶음 INSERT 앞에서 한 번 멈추게 하는 문 — 기본은 그대로 통과한다.
const insertBatchGate = vi.hoisted(() => ({ next: null as Promise<void> | null }));
vi.mock("@/repositories/evidence-import-batches", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/evidence-import-batches")>();
  return {
    ...actual,
    insertBatch: async (...args: Parameters<typeof actual.insertBatch>) => {
      const gate = insertBatchGate.next;
      insertBatchGate.next = null;
      if (gate) await gate;
      return actual.insertBatch(...args);
    },
  };
});

// 06-03 tx 규약 회귀 가드(PR #75 꼴 — expense-payments-concurrency.test.ts와 같은 틀): 등록 트랜잭션이 묶음 표를 쓰는 동안 전역 풀을
// 다시 읽으면(세율 · 권한 · 카드 · 설정) 풀 커넥션 수를 넘는 동시 등록에서 애플리케이션 교착으로 멈춘다. 풀 밖 pg Client가 묶음 표를
// 먼저 잠가 풀 커넥션이 전부 그 잠금을 기다리는 상태를 결정적으로 만든 뒤 풀어 준다. 신한 파일이라 세율 조회(rateDates)가 실제로 돈다.

describe("증빙 등록 — 풀 소진 교착 회귀 가드 (06.1-04)", () => {
  it(
    "등록 동시 N건(N = pool.options.max + 1) — 묶음 표를 잠근 외부 커넥션이 풀 전체를 막아도 풀린 뒤 10초 안에 모두 끝나고 묶음 N행",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);
      const count = poolMax + 1;
      const viewer = await createIntakeViewer();
      const files = Array.from({ length: count }, (_, i) =>
        shinhanFixture([
          { 승인번호: `${50_000_000 + i * 10 + 1}`, 이용일시: "2026.05.28 18:43:28" },
          { 승인번호: `${50_000_000 + i * 10 + 2}`, 이용일시: "2026.05.29 10:00:00" },
        ]),
      );

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: ReturnType<typeof registerFixtureFile>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        // INSERT(ROW EXCLUSIVE)만 막고 같은 파일 조회(SELECT — ACCESS SHARE)는 통과시키는 잠금.
        await lockClient.query("LOCK TABLE evidence_import_batches IN SHARE ROW EXCLUSIVE MODE");

        calls = files.map((bytes, i) => registerFixtureFile(viewer, bytes, `신한-${i}.xls`));

        // 풀 커넥션이 전부 이 lockClient 때문에 막힐 때까지(약 4초 상한 — 막힌 트랜잭션의 lock_timeout 5초 안).
        let waitingCount = 0;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          // pg_stat_activity는 트랜잭션 안 첫 조회 때 찍은 스냅숏을 끝까지 돌려준다 — 풀이 이 등록들 때문에 새로 연 커넥션이
          // 첫 조회 뒤에 생기면 보이지 않아(진단 실측: 5개 중 1개만 셈) 매번 스냅숏을 버리고 다시 읽는다.
          await lockClient.query("SELECT pg_stat_clear_snapshot()");
          const { rows } = await lockClient.query<{ count: string }>(
            `WITH RECURSIVE blocked_by(pid, blocker) AS (
               SELECT pid, unnest(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid <> pg_backend_pid()
               UNION
               SELECT b.pid, unnest(pg_blocking_pids(b.blocker)) FROM blocked_by b
             )
             SELECT count(DISTINCT pid)::text AS count FROM blocked_by WHERE blocker = $1`,
            [lockPid],
          );
          waitingCount = Number(rows[0]?.count ?? 0);
          if (waitingCount >= poolMax) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(waitingCount, `교착 조건을 만들지 못했다 — 풀 커넥션 ${poolMax}개 중 ${waitingCount}개만 묶음 표 잠금을 기다린다`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`증빙 등록 ${count}건 동시 호출이 10초 안에 끝나지 않았다(교착)`)), 10_000);
        });
        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);

        expect(results.map((result) => result.registered)).toEqual(Array.from({ length: count }, () => 2));
        expect(await db.select().from(evidenceImportBatches)).toHaveLength(count);
        expect(await db.select().from(evidenceRecords)).toHaveLength(count * 2);
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    90_000,
  );

  it("같은 파일을 둘이 동시에 등록하면 둘 다 성공하고 기록은 한 벌이다", async () => {
    const viewer = await createIntakeViewer();
    const bytes = shinhanFixture([{ 승인번호: "60000001" }, { 승인번호: "60000002" }, { 승인번호: "" }]);

    const results = await Promise.all([registerFixtureFile(viewer, bytes, "신한.xls"), registerFixtureFile(viewer, bytes, "신한.xls")]);

    expect(results.map((result) => result.registered).sort()).toEqual([0, 3]);
    expect(results.map((result) => result.skippedDuplicate).sort()).toEqual([0, 3]);
    expect(await db.select().from(evidenceRecords)).toHaveLength(3);
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(2);
  });

  it("(GH-P1) 원거래만 든 파일 A가 트랜잭션 안에 있는 동안 원거래 · 취소 쌍 파일 B가 오면 B는 A 커밋 뒤에 다시 읽어 취소 줄을 등록한다 — 합 0", async () => {
    const viewer = await createIntakeViewer();
    const original = { 승인번호: "21000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" };
    const cancel = { 승인번호: "21000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" };

    let releaseA = () => {};
    insertBatchGate.next = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const watcher = new Client({ connectionString: process.env.DATABASE_URL });
    await watcher.connect();
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
    try {
      a = registerFixtureFile(viewer, lotteFixture([original]), "롯데_원거래.xls");
      // A가 묶음 INSERT 앞(트랜잭션 안 · 사전 조회 끝)에 멈출 때까지.
      for (let attempt = 0; attempt < 50 && insertBatchGate.next !== null; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(insertBatchGate.next, "A가 묶음 INSERT 문에 닿지 않았다").toBeNull();

      let bSettled = false;
      b = registerFixtureFile(viewer, lotteFixture([original, cancel]), "롯데_전체.xls").finally(() => {
        bSettled = true;
      });
      // B가 끝나거나(잠금 없음) A의 잠금을 기다릴 때까지(잠금 있음).
      let waiting = 0;
      for (let attempt = 0; attempt < 100 && !bSettled && waiting === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const { rows } = await watcher.query<{ count: string }>("SELECT count(*)::text AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
        waiting = Number(rows[0]?.count ?? 0);
      }
      expect(bSettled || waiting > 0, "B가 끝나지도 잠금을 기다리지도 않았다").toBe(true);
    } finally {
      releaseA();
      await watcher.end();
    }
    await Promise.all([a, b]);

    const pair = await db.select().from(evidenceRecords).where(eq(evidenceRecords.approvalNo, "21000001"));
    expect(pair.map((record) => record.totalKrw).sort((x, y) => x - y)).toEqual([-50_000, 50_000]);
    expect(pair.reduce((sum, record) => sum + record.totalKrw, 0)).toBe(0);
  });
});
