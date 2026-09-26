import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { codeItems, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { saveRevenue } from "@/domain/revenue";

// 과거 버그: rememberFxRate → upsertSimpleValue가 호출자의 트랜잭션이 아니라
// **전역 풀**(repositories/settings.ts의 db)로 설정을 썼다. 저장
// 트랜잭션(saveQuoteLines·saveRevenue)이 풀 커넥션 하나를 쥔 채로 두 번째
// 커넥션을 기다리므로, 풀 크기(N = pool.options.max)만큼의 저장이 모두
// 트랜잭션 안에 들어가 있으면 누구도 두 번째 커넥션을 얻지 못해 영원히
// 멈춘다(애플리케이션 레벨 교착 — Postgres는 볼 수 없다).
//
// 타이밍에 기대지 않고 교착 조건을 결정적으로 만든다: 각 저장의 첫 줄은
// 이미 있는 KRW 줄 갱신(행 잠금), 둘째 줄이 환율을 고친 새 USD 줄이다.
// 풀 밖 커넥션(lockClient)이 첫 줄 행들을 FOR UPDATE로 잡아 두고, 풀의
// 모든 커넥션이 그 잠금을 기다리는 상태(=N개 트랜잭션이 모두 열림)가 된
// 뒤에 잠금을 푼다. 그 다음 모든 저장이 제한 시간 안에 끝나야 한다.

async function setupProject() {
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
  return createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `환율동시성-${randomUUID()}`,
  });
}

async function createFinanceViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `finance-${randomUUID()}@example.test`,
    name: "통합테스트 경영관리",
    roleId: "role-ceo",
  });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

// table의 ids 행을 풀 밖 커넥션으로 잠근 채 fire()로 저장 N건을 띄우고,
// 풀 커넥션 N개가 모두 그 잠금에 막힌 뒤 잠금을 풀어 제한 시간 안에
// 전부 끝나는지 본다.
async function expectAllFinishAfterPoolSaturated<T>(
  table: "quote_lines" | "revenue_entries",
  ids: string[],
  fire: () => Promise<T>[],
): Promise<T[]> {
  const poolMax = pool.options.max ?? 0;
  const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
  await lockClient.connect();

  let calls: Promise<T>[] = [];
  let txOpen = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    await lockClient.query("BEGIN");
    txOpen = true;
    const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const lockPid = pidRows[0]?.pid;
    if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
    await lockClient.query(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids]);

    calls = fire();

    let waitingCount = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      // 행 잠금 대기열은 FIFO라 pg_blocking_pids()는 바로 앞 대기자만
      // 돌려줄 수 있다 — lockPid까지 재귀로 따라간다.
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
    expect(
      waitingCount,
      `풀 커넥션 ${poolMax}개가 모두 잠금을 기다리는 상태에 도달하지 못했다(관측: ${waitingCount})`,
    ).toBeGreaterThanOrEqual(poolMax);

    await lockClient.query("COMMIT");
    txOpen = false;

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`${table} 저장 ${poolMax}건 동시 호출이 10초 안에 끝나지 않았다(풀 교착)`)),
        10_000,
      );
    });
    return await Promise.race([Promise.all(calls), timeout]);
  } finally {
    clearTimeout(timeoutId);
    if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
    await lockClient.end();
    // 교착된 경우 calls는 영원히 끝나지 않으므로 기다리지 않고 거부만 삼킨다.
    for (const call of calls) call.catch(() => {});
  }
}

describe("rememberFxRate 동시 저장 — 풀 소진 애플리케이션 교착 회귀 가드", () => {
  it(
    "saveQuoteLines: 환율을 고친 외화 줄 저장 N(=풀 크기)건이 모두 트랜잭션 안에 있어도 제한 시간 안에 끝난다",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);

      const project = await setupProject();
      const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
      if (!revision) throw new Error("1차 차수가 없습니다");
      const [subcategory] = await db
        .select()
        .from(codeItems)
        .where(eq(codeItems.tableKey, "quote_subcategory"))
        .limit(1);
      if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

      const seeded = await saveQuoteLines(
        SYSTEM_VIEWER,
        revision.id,
        { rows: Array.from({ length: poolMax }, (_, i) => ({
          id: randomUUID(),
          isNew: true as const,
          subcategory: subcategory.value,
          itemName: `잠금 줄 ${i}`,
          unitPrice: { currency: "KRW" as const, amount: 1_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
        })) },
      );

      const results = await expectAllFinishAfterPoolSaturated(
        "quote_lines",
        seeded.lines.map((line) => line.id),
        () =>
          seeded.lines.map((line, i) =>
            saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
              {
                id: line.id,
                version: line.version,
                subcategory: subcategory.value,
                itemName: `잠금 줄 ${i} 수정`,
                unitPrice: { currency: "KRW", amount: 2_000, fxRate: 1 },
                execution: { currency: "KRW", amount: 0, fxRate: 1 },
              },
              {
                id: randomUUID(), isNew: true, subcategory: subcategory.value,
                itemName: `외화 줄 ${i}`,
                unitPrice: { currency: "USD", amount: 100, fxRate: 1300 + i },
                unitPriceFxRateTouched: true,
                execution: { currency: "KRW", amount: 0, fxRate: 1 },
              },
            ] }),
          ),
      );
      expect(results).toHaveLength(poolMax);
    },
    30_000,
  );

  it(
    "saveRevenue: 환율을 고친 외화 발행 줄 저장 N(=풀 크기)건이 모두 트랜잭션 안에 있어도 제한 시간 안에 끝난다",
    async () => {
      const poolMax = pool.options.max ?? 0;
      const project = await setupProject();
      const finance = await createFinanceViewer();

      const seeded = await saveRevenue(finance, project.id, {
        issuedEntries: Array.from({ length: poolMax }, () => ({
          entryDate: "2026-09-01",
          amount: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
        })),
      });
      const entries = seeded?.issuedEntries ?? [];
      expect(entries).toHaveLength(poolMax);

      const results = await expectAllFinishAfterPoolSaturated(
        "revenue_entries",
        entries.map((entry) => entry.id),
        () =>
          entries.map((entry, i) =>
            saveRevenue(finance, project.id, {
              issuedEntries: [
                {
                  id: entry.id,
                  version: entry.version,
                  entryDate: "2026-09-02",
                  amount: { currency: "KRW", amount: 2_000_000, fxRate: 1 },
                },
                {
                  entryDate: "2026-09-03",
                  amount: { currency: "USD", amount: 100, fxRate: 1300 + i },
                  fxRateTouched: true,
                },
              ],
            }),
          ),
      );
      expect(results).toHaveLength(poolMax);
    },
    30_000,
  );
});
