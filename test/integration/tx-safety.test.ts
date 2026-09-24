import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { projects, codeItems, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// Phase 4(04-32, ENG-D3 ①) — 잠금·풀 시간 제한의 통합 증명. (c)의 describe는
// 04-22·04-12가 saveProjectLedger 안의 트랜잭션 규약 위반(잠근 트랜잭션 안에서
// 풀 호출)을 고친 뒤 같은 자리에 「셋 다 성공」 케이스를 더한다.
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
  if (!team) throw new Error("시드된 팀이 없습니다 — domain/seed ORG_SEED 확인 필요");

  const [subcategory] = await db
    .select()
    .from(codeItems)
    .where(eq(codeItems.tableKey, "quote_subcategory"))
    .limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });

  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다(D-53 위반)");

  return { project, revision, subcategoryValue: subcategory.value };
}

// withTransaction의 콜백 인자는 DbOrTx(select/insert/update만)로 좁혀져
// 있다(lib/db-transaction.ts 주석 — 타입을 넓히지 않는다) — SHOW를 돌리려면
// 여기서만 실제로 존재하는 execute를 별도로 타입 붙여 꺼낸다.
type ExecutableTx = { execute(query: unknown): Promise<{ rows: Array<Record<string, unknown>> }> };

describe("잠금·풀 시간 제한(ENG-D3 ①)", () => {
  it("(a) withTransaction 안에서 SHOW lock_timeout이 5s다", async () => {
    const shown = await withTransaction(async (tx) => {
      const result = await (tx as unknown as ExecutableTx).execute(sql`SHOW lock_timeout`);
      return result.rows[0]?.lock_timeout;
    });
    expect(shown).toBe("5s");
  });

  it(
    "(b) 다른 연결이 잡은 프로젝트 행 잠금을 기다리다 약 5초 뒤 UserFacingError로 끝난다(원시 55P03 유출 없음)",
    async () => {
      const { project } = await setupProject();

      // 연결 A — 풀에서 직접 연 클라이언트로 잠금을 잡고 약속으로 멈춘다.
      const clientA = await pool.connect();
      try {
        await clientA.query("BEGIN");
        await clientA.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [project.id]);

        const start = Date.now();
        await expect(
          withTransaction(async (tx) => {
            await tx
              .select({ id: projects.id })
              .from(projects)
              .where(eq(projects.id, project.id))
              .for("update");
          }),
        ).rejects.toBeInstanceOf(UserFacingError);
        const elapsed = Date.now() - start;

        // lock_timeout 5s 기준 — 너무 빨리 끝나면 잠금이 아예 걸리지 않은 것이고,
        // 10초를 넘으면 시간 제한이 적용되지 않은 것이다.
        expect(elapsed).toBeGreaterThanOrEqual(4000);
        expect(elapsed).toBeLessThan(10_000);
      } finally {
        // B가 끝난 뒤에야 A를 되돌린다 — A가 먼저 풀리면 잠금 대기 자체가 사라진다.
        await clientA.query("ROLLBACK");
        clientA.release();
      }
    },
    15_000,
  );

  describe("풀 2 · 동시 합성 저장 셋", () => {
    // 04-22·04-12가 규약을 지키게 고친 뒤 같은 describe에 「셋 다 성공」 케이스를 더한다.
    it(
      "(c) 풀 크기 2에서 saveProjectLedger 셋을 동시에 보내도 10초 안에 전부 끝난다(성공 또는 UserFacing 거부, 원시 풀 오류 0)",
      async () => {
        const { project, revision, subcategoryValue } = await setupProject();

        const previousPoolMax = process.env.DB_POOL_MAX;
        process.env.DB_POOL_MAX = "2";
        vi.resetModules();

        try {
          const clientModule = await import("@/db/client");
          const smallPool = clientModule.pool as unknown as {
            options: { max: number; connectionTimeoutMillis: number };
          };
          // 새 풀 옵션을 먼저 단언한다 — 모듈이 격리되지 않으면 여기서 빨갛게 된다.
          expect(smallPool.options.max).toBe(2);
          expect(smallPool.options.connectionTimeoutMillis).toBe(5000);

          const { saveProjectLedger } = await import("@/domain/projects/ledger");
          const { UserFacingError: IsolatedUserFacingError } = await import(
            "@/lib/actions/user-facing-error"
          );

          const makeRow = (label: string) => ({
            subcategory: subcategoryValue,
            itemName: `동시 저장 ${label}`,
            quantity: 1,
            unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
            execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
          });

          const start = Date.now();
          const results = await Promise.allSettled([
            saveProjectLedger(SYSTEM_VIEWER, project.id, {
              quoteLines: { revisionId: revision.id, rows: [makeRow("A")] },
            }),
            saveProjectLedger(SYSTEM_VIEWER, project.id, {
              quoteLines: { revisionId: revision.id, rows: [makeRow("B")] },
            }),
            saveProjectLedger(SYSTEM_VIEWER, project.id, {
              quoteLines: { revisionId: revision.id, rows: [makeRow("C")] },
            }),
          ]);
          const elapsed = Date.now() - start;

          expect(elapsed).toBeLessThan(10_000);
          for (const result of results) {
            if (result.status === "rejected") {
              expect(result.reason).toBeInstanceOf(IsolatedUserFacingError);
            }
          }

          await clientModule.closeDb();
        } finally {
          process.env.DB_POOL_MAX = previousPoolMax;
        }
      },
      15_000,
    );
  });
});
