import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";

// 과거 버그: createProject의 트랜잭션이 카운터 행 잠금을 쥔 채로
// formatDocumentNumber → loadDocumentNumberFormat → getSettingValue를
// **전역 풀**(repositories/settings.ts의 db, tx 아님)로 호출했다. 풀
// 커넥션 수(N = pool.options.max)만큼 createProject를 동시에 부르면:
// 각 호출이 카운터 행 잠금을 잡은 트랜잭션 하나씩을 열어 풀 커넥션을
// 모두 점유하고, 잠금을 잡은 첫 트랜잭션이 설정값을 읽으려고 풀에서
// 커넥션을 하나 더 빌리려 하지만 남은 커넥션이 없다 — 애플리케이션
// 레벨 교착으로 영원히 멈춘다(Postgres는 이 교착을 볼 수 없다, 잠금은
// 커넥션 안에서 걸렸지 커넥션 자체를 기다리는 게 아니라서).
//
// 이 테스트는 그 회귀를 막는 가드다. 타이밍에 기대는 "N개 동시에 쏘고
// 기대하기"는 이 프로젝트에서 금지 — 대신 별도 pg Client(풀 밖 커넥션)
// 로 카운터 행을 직접 잠가 두고, pg_stat_activity로 풀의 모든 커넥션이
// (다른 잠금이 아니라) 정확히 이 lockClient에 의해 차단된 상태에
// 들어갈 때까지 기다린 뒤(=결정적으로 교착 조건을 만든 뒤) 잠금을 풀어
// 검증한다.
describe("createProject 동시 호출 — 풀 소진 애플리케이션 교착 회귀 가드", () => {
  it(
    "카운터 행 잠금을 쥔 외부 커넥션이 풀 전체를 막아도, 잠금 해제 후 모두 제한 시간 안에 서로 다른 번호로 끝난다",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);

      const client = await insertVendor(SYSTEM_VIEWER, {
        name: `거래처-${randomUUID()}`,
        normalizedName: `거래처-${randomUUID()}`,
      });
      const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
        email: `pm-${randomUUID()}@example.test`,
        name: "통합테스트 PM",
        roleId: DEFAULT_ROLE_ID,
      });
      const [team] = await db.select().from(teams).limit(1);
      if (!team) throw new Error("시드된 팀이 없습니다");

      const year = new Date().getFullYear();
      const period = String(year);

      // 카운터 행을 먼저 만들어 둔다(첫 프로젝트 등록) — 아래에서 외부
      // 커넥션이 FOR UPDATE로 잠글 행이 이미 있어야 한다.
      await createProject(SYSTEM_VIEWER, {
        clientId: client.id,
        teamId: team.id,
        pmUserId,
        name: `동시성-seed-${randomUUID()}`,
      });

      // 풀과 별개인 외부 커넥션으로 카운터 행을 잡아 둔다 — 풀의 모든
      // 커넥션이 이 잠금을 기다리게 만들어 교착 조건을 타이밍이 아니라
      // 결정적으로 재현한다.
      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();

      let calls: ReturnType<typeof createProject>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        await lockClient.query(
          `SELECT value FROM document_counters WHERE counter_key = $1 AND period = $2 FOR UPDATE`,
          ["project", period],
        );

        calls = Array.from({ length: poolMax }, (_, i) =>
          createProject(SYSTEM_VIEWER, {
            clientId: client.id,
            teamId: team.id,
            pmUserId,
            name: `동시성-${i}-${randomUUID()}`,
          }),
        );

        // 풀의 모든 커넥션이 정확히 이 lockClient(lockPid)에 의해 차단된
        // 상태가 될 때까지 폴링한다(bounded, 약 4초) — 도달하지 못하면
        // 교착 조건 자체를 못 만든 것이니 명확한 이유로 실패시킨다.
        const maxAttempts = 40;
        const intervalMs = 100;
        let waitingCount = 0;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // 행 잠금 대기열은 FIFO라 pg_blocking_pids()는 대기열에서 바로
          // 앞선 세션만 돌려준다(2번째 이후 대기자는 lockPid가 아니라
          // 그 앞의 대기자를 가리킨다) — lockPid까지 재귀로 따라가야
          // "이 lockClient 때문에 막힌" 커넥션을 빠짐없이 센다.
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
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        expect(
          waitingCount,
          `풀 커넥션 ${poolMax}개가 모두 카운터 행 잠금을 기다리는 상태에 도달하지 못했다(관측: ${waitingCount}) — 교착 조건을 결정적으로 만들지 못했다.`,
        ).toBeGreaterThanOrEqual(poolMax);

        // 이제 풀의 모든 커넥션이 잠금 대기 중 — 잠금을 풀어야만 진행된다.
        await lockClient.query("COMMIT");
        txOpen = false;

        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`createProject ${poolMax}건 동시 호출이 10초 안에 끝나지 않았다(교착)`)),
            10_000,
          );
        });

        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);

        const numbers = results.map((p) => p.number);
        expect(new Set(numbers).size).toBe(poolMax);
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) {
          await lockClient.query("ROLLBACK").catch(() => {});
        }
        await lockClient.end();
        // 타임아웃으로 레이스에서 패배했더라도 calls의 프라미스들이
        // 처리되지 않은 채 남지 않도록 정리한다(unhandled rejection 방지).
        await Promise.allSettled(calls);
      }
    },
    30_000,
  );
});
