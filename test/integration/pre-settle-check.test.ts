import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { approvalInstances, settlementApprovals } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { GateBlockedError } from "@/domain/rules/gate";
import { SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { insertVendor } from "@/repositories/vendors";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence } from "./fixtures/payments";
import { requestInput } from "./fixtures/purchase-requests";
import { issueRevenue, linkCardUsage, setupSettlementProject } from "./fixtures/settlements";

// 06-19(PROJ-06 · D-611~D-613 · UA-610 · ENG E-1): 완료 전 점검 — 정산 기안(05 submitSettlement)이 같은 판정으로 막힌다.
// 점검은 트랜잭션 앞에서 권한 · 설정을 읽고(loadPreSettleInputs) 트랜잭션 안에서는 tx 리포지토리 · 순수 함수만 쓴다(computePreSettleCheck).

// 점검 예외 주입 — 기본은 원래 함수 그대로(fail-closed 갈래만 켠다).
const inject = vi.hoisted(() => ({ load: false, compute: false, computeCalls: 0 }));
vi.mock("@/domain/pre-settle-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/pre-settle-check")>();
  return {
    ...actual,
    loadPreSettleInputs: (...args: Parameters<typeof actual.loadPreSettleInputs>) => {
      if (inject.load) return Promise.reject(new Error("점검 사전 조회 실패(주입)"));
      return actual.loadPreSettleInputs(...args);
    },
    computePreSettleCheck: (...args: Parameters<typeof actual.computePreSettleCheck>) => {
      inject.computeCalls += 1;
      if (inject.compute) return Promise.reject(new Error("점검 계산 실패(주입)"));
      return actual.computePreSettleCheck(...args);
    },
  };
});

beforeEach(() => {
  inject.load = false;
  inject.compute = false;
  inject.computeCalls = 0;
});

const AFTER_END = { now: () => new Date("2027-01-02T03:00:00Z") };

async function settlementDocs(projectIds: readonly string[]) {
  return db.select().from(settlementApprovals).where(inArray(settlementApprovals.projectId, [...projectIds]));
}

async function settle(projectId: string): Promise<void> {
  expect(await applyAutoSettlement({ projectIds: [projectId] }, AFTER_END)).toEqual([projectId]);
}

async function rejectedExpense(fx: ExpenseFixture, lineId: string): Promise<string> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId] })).created[0]?.expenseId ?? "";
  const sent = await submitReadyDraft(fx.pm, expenseId);
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  await rejectDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version, reason: "금액 확인" });
  return expenseId;
}

// E-10 — 막힘 0이면서 행별 경로가 모두 도는 정산 프로젝트(06-22 「승인 동시 6건」이 다시 쓴다). 견적 줄마다 살아 있는 연결 하나:
// ⓐ 결재 통과 · 증빙 있음 지출결의(hasEvidence(tx) · 면제 읽기) ⓑ 카드 사용 ⓒ `신청됨` 구매 요청(온라인구매 협력사 줄) + 발행 줄 1.
const ONLINE_VENDOR = "쿠팡";
async function blockFreeSettlingProject(): Promise<ExpenseFixture> {
  const fx = await setupExpenseProject();
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, ONLINE_VENDOR);
  const online = await insertVendor(SYSTEM_VIEWER, { name: ONLINE_VENDOR, normalizedName: `${ONLINE_VENDOR}-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const second = await addApprovedRevision(fx, [{ itemName: "현장 소모품", vendorId: online.id, execution: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }]);
  const lineOf = (itemName: string) => {
    const id = second.lineIds.get(itemName);
    if (!id) throw new Error(`2차 줄 없음: ${itemName}`);
    return id;
  };
  const current: ExpenseFixture = {
    ...fx,
    revisionId: second.revisionId,
    lines: { withVendor: lineOf("무대 제작"), noVendor: lineOf("현장 진행 인력"), split: lineOf("영상 제작(분할)") },
  };
  await approvedExpenseWithEvidence(current, current.lines.withVendor);
  await linkCardUsage(fx.pm, current.lines.noVendor);
  await linkCardUsage(fx.pm, current.lines.split);
  const input = requestInput(lineOf("현장 소모품"));
  await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
  await issueRevenue(fx.projectId);
  await settle(fx.projectId);
  return current;
}

describe("완료 전 점검 — 정산 기안 게이트(05 submitSettlement)", () => {
  it("반려 지출결의 1건이 있는 정산 프로젝트 — 직접 호출이 `완료 전 점검 1건 · 점검 보기`로 거부되고 문서 0건", async () => {
    const fx = await setupExpenseProject();
    await rejectedExpense(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    await settle(fx.projectId);

    const refused = await submitSettlement(fx.pm, { projectId: fx.projectId }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: "완료 전 점검 1건 · 점검 보기" });
    expect(await settlementDocs([fx.projectId])).toHaveLength(0);
  });

  it("점검 계산 예외 주입 — 기안 거부(fail-closed) · 문서 0건", async () => {
    const fx = await setupSettlementProject();
    inject.compute = true;
    await expect(submitSettlement(fx.pm, { projectId: fx.projectId })).rejects.toThrow("점검 계산 실패(주입)");
    expect(await settlementDocs([fx.projectId])).toHaveLength(0);
  });

  it("점검 사전 조회 예외 — 트랜잭션 안 계산까지 가지 않고 거부 · 문서 0건", async () => {
    const fx = await setupSettlementProject();
    inject.load = true;
    await expect(submitSettlement(fx.pm, { projectId: fx.projectId })).rejects.toThrow("점검 사전 조회 실패(주입)");
    expect(inject.computeCalls).toBe(0);
    expect(await settlementDocs([fx.projectId])).toHaveLength(0);
  });

  it("미결 0(05 정산 픽스처 — 줄마다 카드 사용 · 발행 줄 1) — 기존 동작 그대로 올라간다", async () => {
    const fx = await setupSettlementProject();
    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toMatchObject({ kind: "submitted" });
    expect(await settlementDocs([fx.projectId])).toHaveLength(1);
  });

  it("이미 올린 문서(`already_submitted`) — 점검을 다시 돌리지 않고 기존 반환 그대로", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    const [doc] = await settlementDocs([fx.projectId]);
    inject.compute = true;
    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toEqual({ kind: "already_submitted", documentId: doc?.id });
  });

  it(
    "기안 동시 6건 — 프로젝트 행을 쥔 외부 커넥션이 풀 전체를 막아도 잠금 해제 뒤 10초 안에 모두 올라간다(ENG E-1)",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);
      expect(poolMax).toBeLessThan(6);

      const projects: ExpenseFixture[] = [];
      for (let i = 0; i < 6; i += 1) projects.push(await blockFreeSettlingProject());
      const projectIds = projects.map((fx) => fx.projectId);

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: Promise<unknown>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        await lockClient.query("SELECT id FROM projects WHERE id = ANY($1::uuid[]) FOR UPDATE", [projectIds]);

        calls = projects.map((fx) => submitSettlement(fx.pm, { projectId: fx.projectId }));

        // 행 잠금 대기열은 FIFO — pg_blocking_pids를 lockPid까지 재귀로 따라가 이 잠금 때문에 막힌 커넥션을 센다(PR #75 꼴).
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
        expect(waitingCount, `풀 커넥션 ${poolMax}개가 프로젝트 행 잠금을 기다리는 상태에 이르지 못했다(관측: ${waitingCount}) — 교착 조건을 만들지 못했다`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;

        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("정산 기안 6건 동시 호출이 10초 안에 끝나지 않았다(교착)")), 10_000);
        });
        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);

        expect(results).toHaveLength(6);
        for (const result of results) expect(result).toMatchObject({ kind: "submitted" });
        const docs = await settlementDocs(projectIds);
        expect(docs).toHaveLength(6);
        const instances = await db
          .select({ id: approvalInstances.id })
          .from(approvalInstances)
          .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), inArray(approvalInstances.documentId, docs.map((doc) => doc.id))));
        expect(instances).toHaveLength(6);
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    120_000,
  );
});
