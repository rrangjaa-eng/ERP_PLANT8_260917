import { Client } from "pg";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { expensePayments, expenses, files } from "@/db/schema";
import { completeExpensePayment, decidePayable, loadPaymentInputs } from "@/domain/payments";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { markVoided } from "@/repositories/files";
import { withTransaction } from "@/lib/db-transaction";
import { setupExpenseProject } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-03 tx 규약 회귀 가드(PR #75 꼴): 지급 완료의 트랜잭션은 지출결의 행 잠금을 쥔 채 전역 풀을 다시 읽으면(세율 · 권한 · 설정 · 결재 단계)
// 풀 커넥션 수를 넘는 동시 지급에서 애플리케이션 교착으로 멈춘다. 풀 밖 pg Client가 문서 행을 먼저 잡아 풀 커넥션이 전부 그 잠금을
// 기다리는 상태를 결정적으로 만든 뒤 풀어 준다 — 「쏘고 기다리기」 없음.

class Rollback extends Error {}

beforeAll(async () => {
  await setEvidenceRequired(false);
});

describe("지급 완료 — 풀 소진 교착 회귀 가드", () => {
  it(
    "지급 완료 동시 6건 — 문서 행을 쥔 외부 커넥션이 풀 전체를 막아도 풀린 뒤 10초 안에 모두 지급된다(N = pool.options.max + 1)",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);
      const count = poolMax + 1;

      const payer = await makePaymentManager();
      const docs: ApprovedExpense[] = [];
      for (let i = 0; i < count; i += 1) docs.push(await approvedExpenseWithoutEvidence(await setupExpenseProject()));
      const ids = docs.map((doc) => doc.expenseId);
      const expected: number[] = [];
      for (const doc of docs) {
        const pre = await loadPaymentInputs(payer, { expenseId: doc.expenseId });
        if (!pre.amount || !pre.tax) throw new Error("지급 총액을 셈할 수 없는 문서");
        const payable = await decidePayable(
          { amount: pre.amount, taxRule: pre.tax.taxRule, applyOpts: pre.tax.dates.applyOpts, incomeType: pre.tax.incomeType },
          pre.tax.rates,
        );
        expected.push(payable.payableKrw);
      }

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: ReturnType<typeof completeExpensePayment>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        await lockClient.query("SELECT id FROM expenses WHERE id = ANY($1::uuid[]) FOR UPDATE", [ids]);

        calls = docs.map((doc, i) =>
          completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: expected[i] ?? -1, version: doc.version }),
        );

        // 풀 커넥션이 전부 이 lockClient 때문에 막힐 때까지(약 4초 상한). 행 잠금 대기열은 FIFO라 lockPid까지 재귀로 따라간다.
        let waitingCount = 0;
        for (let attempt = 0; attempt < 40; attempt += 1) {
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
        expect(waitingCount, `교착 조건을 만들지 못했다 — 풀 커넥션 ${poolMax}개 중 ${waitingCount}개만 문서 행 잠금을 기다린다`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`지급 완료 ${count}건 동시 호출이 10초 안에 끝나지 않았다(교착)`)), 10_000);
        });
        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);
        expect(results).toHaveLength(count);

        const live = await db
          .select({ expenseId: expensePayments.expenseId })
          .from(expensePayments)
          .where(and(inArray(expensePayments.expenseId, ids), isNull(expensePayments.cancelledAt)));
        expect(new Set(live.map((row) => row.expenseId)).size).toBe(count);
        const versions = await db.select({ id: expenses.id, version: expenses.version }).from(expenses).where(inArray(expenses.id, ids));
        for (const doc of docs) expect(versions.find((row) => row.id === doc.expenseId)?.version).toBe(doc.version + 1);
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    90_000,
  );
});

describe("hasEvidence (C5 · RS-13)", () => {
  it("hasEvidence는 넘긴 tx로 읽는다 — 커밋 전 무효 표시는 그 tx에서만 보이고 롤백 뒤 둘 다 살아 있다", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    const owner = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId };
    const [file] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, doc.expenseId), isNull(files.voidedAt)));
    if (!file) throw new Error("증빙 파일 없음");

    const seen = await withTransaction(async (tx) => {
      await markVoided(fx.pm, { id: file.id, voidedBy: fx.pm.id, reason: "통합 테스트" }, tx);
      const inTx = await hasEvidence(fx.pm, owner, tx);
      const outside = await hasEvidence(fx.pm, owner);
      throw new Rollback(JSON.stringify({ inTx, outside }));
    }).catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
      return JSON.parse(error.message) as { inTx: boolean; outside: boolean };
    });

    expect(seen).toEqual({ inTx: false, outside: true });
    expect(await hasEvidence(fx.pm, owner)).toBe(true);
    expect(await withTransaction((tx) => hasEvidence(fx.pm, owner, tx))).toBe(true);
  });
});
