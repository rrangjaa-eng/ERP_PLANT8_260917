import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, expenses, files, projects, purchaseRequests, quoteLines, settlementApprovals } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument, getApprovalView, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { getDocumentKind } from "@/domain/approvals/kinds";
import { LEAVE_DOCUMENT_KIND, submitLeave } from "@/domain/leave";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { closeExpense, createExpenseFromLines, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { waiveEvidence } from "@/domain/evidence-reviews";
import { getPreSettleCheck } from "@/domain/pre-settle-check";
import { saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { GateBlockedError } from "@/domain/rules/gate";
import { getSettlementPreSettleSummary, SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { loadKindDetails } from "@/domain/approvals";
import { visible } from "@/domain/permissions/visible";
import { setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED,
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PURCHASE_ONLINE_VENDOR_NAME,
} from "@/domain/settings/keys";
import { cancelPurchaseRequest, createPurchaseRequest, precheckPurchaseCancel, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { CompletedProjectError } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { addApprovedRevision, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager } from "./fixtures/payments";
import { requestInput } from "./fixtures/purchase-requests";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { issueRevenue, linkCardUsage, setupSettlementProject } from "./fixtures/settlements";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06-19(PROJ-06 · D-611~D-613 · UA-610 · ENG E-1): 완료 전 점검 — 정산 기안(05 submitSettlement)이 같은 판정으로 막힌다.
// 점검은 트랜잭션 앞에서 권한 · 설정을 읽고(loadPreSettleInputs) 트랜잭션 안에서는 tx 리포지토리 · 순수 함수만 쓴다(computePreSettleCheck).

// 점검 예외 주입 — 기본은 원래 함수 그대로(fail-closed 갈래만 켠다).
const inject = vi.hoisted(() => ({ load: false, compute: false, computeCalls: 0, loadCalls: 0 }));
vi.mock("@/domain/pre-settle-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/pre-settle-check")>();
  return {
    ...actual,
    loadPreSettleInputs: (...args: Parameters<typeof actual.loadPreSettleInputs>) => {
      inject.loadCalls += 1;
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

// 07.1-01 PF2 — 점검이 증빙 확인 기록을 읽는 횟수(묶음 읽기 · 단건 읽기)를 센다. 원래 함수 그대로 부르고 호출만 센다.
const reviewReads = vi.hoisted(() => ({ list: 0, single: 0 }));
vi.mock("@/repositories/expense-evidence-reviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/expense-evidence-reviews")>();
  return {
    ...actual,
    listReviewStatusByExpenses: (...args: Parameters<typeof actual.listReviewStatusByExpenses>) => {
      reviewReads.list += 1;
      return actual.listReviewStatusByExpenses(...args);
    },
    findReviewByExpense: (...args: Parameters<typeof actual.findReviewByExpense>) => {
      reviewReads.single += 1;
      return actual.findReviewByExpense(...args);
    },
  };
});

beforeEach(() => {
  inject.load = false;
  inject.compute = false;
  inject.computeCalls = 0;
  inject.loadCalls = 0;
  reviewReads.list = 0;
  reviewReads.single = 0;
});

const AFTER_END = { now: () => new Date("2027-01-02T03:00:00Z") };

async function settlementDocs(projectIds: readonly string[]) {
  return db.select().from(settlementApprovals).where(inArray(settlementApprovals.projectId, [...projectIds]));
}

async function settle(projectId: string): Promise<void> {
  expect(await applyAutoSettlement({ projectIds: [projectId] }, AFTER_END)).toEqual([projectId]);
}

async function rejectedExpense(fx: ExpenseFixture, lineId: string): Promise<string> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  const sent = await submitReadyDraft(fx.pm, expenseId);
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  await rejectDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version, reason: "금액 확인" });
  return expenseId;
}

// E-10 — 막힘 0이면서 행별 경로가 모두 도는 정산 프로젝트(06-22 「승인 동시 6건」이 다시 쓴다). 견적 줄마다 살아 있는 연결 하나:
// ⓐ 결재 통과 · 증빙 있음 지출결의(hasEvidence(tx) · 면제 읽기) ⓑ 카드 사용 ⓒ `신청됨` 구매 요청(온라인구매 협력사 줄) + 발행 줄 1.
const ONLINE_VENDOR = "쿠팡";
async function blockFreeSettlingProject(): Promise<ExpenseFixture & { evidenceExpenseId: string; purchaseRequestId: string }> {
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
  const evidence = await approvedExpenseWithEvidence(current, current.lines.withVendor);
  await linkCardUsage(fx.pm, current.lines.noVendor);
  await linkCardUsage(fx.pm, current.lines.split);
  const input = requestInput(lineOf("현장 소모품"));
  const purchase = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
  await issueRevenue(fx.projectId);
  await settle(fx.projectId);
  return { ...current, evidenceExpenseId: evidence.expenseId, purchaseRequestId: purchase.id };
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

// ── Task 2 — 세 그룹(D-611 증빙 · C10 종결 · 무효 파일 · D-612 계보 · D-613) · 강행 로그(PS-4) ──────────

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 분할 회차 하나를 결재 통과(증빙 있음)까지 — 같은 줄의 다음 회차가 남는다.
async function approvedInstallment(fx: ExpenseFixture, lineId: string, amountKrw: number): Promise<string> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { installment: true, supply: { currency: "KRW", amount: amountKrw, fxRate: 1 } } });
  const sent = await submitReadyDraft(fx.pm, expenseId);
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version });
  await approveDocument(fx.ceo, { instanceId: sent.instanceId, expectedVersion: first.version });
  return expenseId;
}

async function aliveFiles(expenseId: string) {
  return db.select({ id: files.id }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
}

describe("완료 전 점검 — 세 그룹(D-611 · C10 · D-612 · D-613)", () => {
  it("증빙 면제 뒤 다시 읽으면 그 행이 빠진다(D-611 — 면제는 행 없음)", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);

    // G-06-E(카드 ② 「경고만」): 결재 통과 · 증빙 없음은 막지 않는 증빙 대기 그룹 — 행은 증빙 대기 쪽, 막힘 건수는 0.
    const before = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(before.evidencePending.rows.map((row) => [row.number, row.state])).toEqual([[doc.number, "no_evidence"]]);
    expect(before.openExpenses.rows).toEqual([]);
    expect(before.blockedCount).toBe(0);

    const payer = await makePayer();
    await waiveEvidence(payer, { expenseId: doc.expenseId, version: await versionOf(doc.expenseId), reason: "업체 폐업" });
    const after = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(after.evidencePending.rows).toEqual([]);
    expect(after.openExpenses.rows).toEqual([]);
    expect(after.blockedCount).toBe(0);
  });

  it("유일한 파일을 무효 처리하면 `증빙 없음` 행이 선다(05 voidEvidence — 살아 있는 파일만)", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    expect((await getPreSettleCheck(fx.pm, fx.projectId)).openExpenses.rows).toEqual([]);
    expect((await getPreSettleCheck(fx.pm, fx.projectId)).evidencePending.rows).toEqual([]);

    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    for (const file of await aliveFiles(doc.expenseId)) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
    // G-06-E(카드 ② 「경고만」): 무효 뒤 `증빙 없음` 행은 증빙 대기 그룹에 선다(막힘 아님).
    const after = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(after.evidencePending.rows.map((row) => [row.number, row.state])).toEqual([[doc.number, "no_evidence"]]);
    expect(after.openExpenses.rows).toEqual([]);
    expect(after.blockedCount).toBe(0);
  });

  it("반려 문서를 종결(06-28)하면 행이 빠지고 막힘이 준다(C10)", async () => {
    const fx = await setupExpenseProject();
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await approvedInstallment(fx, fx.lines.split, 6_000_000);
    const rejected = await rejectedExpense(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);

    const before = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(before.openExpenses.rows.map((row) => row.state)).toEqual(["rejected"]);
    expect(before.blockedCount).toBe(1);

    await closeExpense(fx.pm, { expenseId: rejected, expectedVersion: await versionOf(rejected), reason: "업체 취소" });
    const after = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(after.openExpenses.rows).toEqual([]);
    expect(after.blockedCount).toBe(0);
  });

  it("발행 줄 1건 저장 뒤 매출 미입력 그룹이 빈다(D-613) · 매출 줄 = 계약 · 발행 합계 · 차이", async () => {
    const fx = await setupExpenseProject();
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);

    const before = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(before.missingRevenue.count).toBe(1);
    expect(before.blockedCount).toBe(1);
    expect(before.revenue).toMatchObject({ pendingLabel: null, issuedTotalKrw: null, diffKrw: null });
    const contractKrw = before.revenue.contractKrw ?? 0;
    expect(contractKrw).toBeGreaterThan(0);

    await issueRevenue(fx.projectId, 1_000_000);
    const after = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(after.missingRevenue.count).toBe(0);
    expect(after.blockedCount).toBe(0);
    expect(after.revenue).toMatchObject({ contractKrw, issuedTotalKrw: 1_000_000, diffKrw: contractKrw - 1_000_000 });
  });

  it("미매칭 줄 — 그 줄의 문(거래처 있는 줄 = 지출결의 올리기 · 거래처 없음) · 표시 번호", async () => {
    const fx = await setupExpenseProject();
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await issueRevenue(fx.projectId);

    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.unmatchedLines.count).toBe(2);
    expect(check.unmatchedLines.rows.map((row) => [row.lineId, row.displayNo, row.door.kind])).toEqual([
      [fx.lines.noVendor, 2, "no_vendor"],
      [fx.lines.split, 3, "expense_open"],
    ]);
  });

  it("강행 기안 — 같은 tx 행동 로그(document_submit) 상세에 그룹별 건수 · 강행 그룹(PS-4)", async () => {
    await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE, true);
    const fx = await setupExpenseProject();
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await settle(fx.projectId);

    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.forcedResultLine).toBe("강행 · 매출 미입력");
    const result = await submitSettlement(fx.pm, { projectId: fx.projectId });
    expect(result).toMatchObject({ kind: "submitted" });
    if (result.kind !== "submitted") throw new Error("기안 안 됨");
    const [log] = await db.select().from(actionLog).where(and(eq(actionLog.documentId, result.documentId), eq(actionLog.actionType, "document_submit")));
    expect(log?.detail).toMatchObject({
      preSettle: {
        groups: { openExpenses: { count: 0, allowed: false }, unmatchedLines: { count: 0, allowed: false }, missingRevenue: { count: 1, allowed: true } },
        forced: ["missingRevenue"],
      },
    });
  });

  it("D-612 계보 — 연결은 앞 차수 줄의 것까지(findLineLinks) · 미매칭 행은 최신 차수 줄만(X-1)", async () => {
    const fx = await setupExpenseProject();
    // 차수 2 = 1차 줄 셋 + N(연결 없음) · P(다음 차수에서 빠짐). 이 차수를 계보 테스트의 「앞 차수」로 쓴다.
    const before = await addApprovedRevision(fx, [
      { itemName: "N 줄", vendorId: null, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
      { itemName: "P 줄", vendorId: null, execution: { currency: "KRW", amount: 700_000, fxRate: 1 } },
    ]);
    const id = (itemName: string) => before.lineIds.get(itemName) ?? "";
    const prior: ExpenseFixture = { ...fx, revisionId: before.revisionId, lines: { withVendor: id("무대 제작"), noVendor: id("현장 진행 인력"), split: id("영상 제작(분할)") } };
    await linkCardUsage(fx.pm, prior.lines.withVendor); // L — 카드 사용
    const inReview = (await createExpenseFromLines(fx.pm, { lineIds: [prior.lines.split], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? ""; // M — 결재 중 지출결의
    expect(await submitReadyDraft(fx.pm, inReview)).toMatchObject({ kind: "submitted" });
    await linkCardUsage(fx.pm, prior.lines.noVendor);
    await issueRevenue(fx.projectId);

    const latest = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: before.revisionId });
    const latestLines = await db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, latest.revisionId));
    const latestId = (itemName: string) => latestLines.find((line) => line.itemName === itemName)?.id ?? "";
    await saveQuoteLines(SYSTEM_VIEWER, latest.revisionId, { rows: [], archivedLineIds: [latestId("P 줄")] });

    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.unmatchedLines.rows.map((row) => row.lineId)).toEqual([latestId("N 줄")]);
    expect(check.unmatchedLines.rows.map((row) => row.lineId)).not.toContain(id("N 줄"));
  });
});

// ── Task 3 — R-6 범위(범위 안 행만 · `그 밖 {N}건` · 막힘 건수는 프로젝트 전체) · 금액 노출 · DTO 등록 ─────────────

// 범위가 좁은 계정 A — 팀 범위로 프로젝트를 보고 쓰며(줄에서 지출결의를 만들려면 projects 쓰기도 든다) 지출결의를 쓰지만 지출결의 보기가 없다(범위 = 자기 문서 · 처리 기록).
// 정보 항목 노출 행이 없는 계급이라 금액 칸이 전부 빠진다.
async function makeNarrowDrafter(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `좁은범위-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
  return makePerson("기안A", role.id, "기획1팀");
}

async function rejectedBy(fx: ExpenseFixture, drafter: Viewer, lineId: string): Promise<{ expenseId: string; number: string }> {
  const expenseId = (await createExpenseFromLines(drafter, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  const sent = await submitReadyDraft(drafter, expenseId);
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  await rejectDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version, reason: "금액 확인" });
  return { expenseId, number: sent.number };
}

// 같은 프로젝트에 기안자 A의 반려 1건(withVendor) · 기안자 B(같은 팀 PM)의 반려 1건(split) · noVendor 카드 · 발행 줄 1.
async function twoDrafterProject() {
  const fx = await setupExpenseProject();
  const a = await makeNarrowDrafter();
  const mine = await rejectedBy(fx, a, fx.lines.withVendor);
  const theirs = await rejectedBy(fx, fx.otherPm, fx.lines.split);
  await linkCardUsage(fx.pm, fx.lines.noVendor);
  await issueRevenue(fx.projectId);
  return { fx, a, mine, theirs };
}

describe("완료 전 점검 — R-6 범위 · 금액 노출(Task 3)", () => {
  it("A(범위 = 자기 문서)로 보면 행 1(A 문서) + `그 밖 1건` · 막힘 2", async () => {
    const { fx, a, mine } = await twoDrafterProject();
    const check = await getPreSettleCheck(a, fx.projectId);
    expect(check.openExpenses.rows.map((row) => row.number)).toEqual([mine.number]);
    expect(check.openExpenses.outOfScopeCount).toBe(1);
    expect(check.openExpenses.count).toBe(2);
    expect(check.blockedCount).toBe(2);
  });

  it("대표(전사 범위)로 보면 행 2 · `그 밖` 없음 · 막힘 2(보는 사람과 무관한 프로젝트 전체 값)", async () => {
    const { fx } = await twoDrafterProject();
    const check = await getPreSettleCheck(fx.ceo, fx.projectId);
    expect(check.openExpenses.rows).toHaveLength(2);
    expect(check.openExpenses.outOfScopeCount).toBe(0);
    expect(check.blockedCount).toBe(2);
  });

  it("범위가 좁은 계정의 점검 DTO에 범위 밖 문서 번호 · 금액 문자열이 없다(`그 밖`은 건수만)", async () => {
    const { fx, a, theirs } = await twoDrafterProject();
    const check = await getPreSettleCheck(a, fx.projectId);
    const text = JSON.stringify(check);
    expect(text).not.toContain(theirs.number);
    expect(text).not.toContain(theirs.expenseId);
    expect(text).not.toContain("10000000");
    expect(Object.keys(check.openExpenses).sort()).toEqual(["allowed", "count", "outOfScopeCount", "rows"]);
  });

  it("미매칭 줄 · 매출 줄은 범위 거르기 대상이 아니다 — 금액 칸만 정보 항목으로 걸러진다", async () => {
    const fx = await setupExpenseProject();
    const a = await makeNarrowDrafter();
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    const narrow = await getPreSettleCheck(a, fx.projectId);
    const wide = await getPreSettleCheck(fx.ceo, fx.projectId);
    expect(narrow.unmatchedLines.rows.map((row) => row.lineId)).toEqual(wide.unmatchedLines.rows.map((row) => row.lineId));
    expect(narrow.missingRevenue.count).toBe(wide.missingRevenue.count);
    expect(wide.unmatchedLines.rows.every((row) => typeof row.executionKrw === "number")).toBe(true);
    expect(narrow.unmatchedLines.rows.every((row) => !("executionKrw" in row))).toBe(true);
  });

  it("정보 항목 없는 계급: 점검 행 금액 키 없음 · 매출 줄 계약 · 발행 합계 · 차이 키 없음", async () => {
    const { fx, a } = await twoDrafterProject();
    const narrow = await getPreSettleCheck(a, fx.projectId);
    expect(narrow.openExpenses.rows.every((row) => !("expenseAmountKrw" in row))).toBe(true);
    expect("issuedTotalKrw" in narrow.revenue).toBe(false);
    expect("diffKrw" in narrow.revenue).toBe(false);
    expect("contractKrw" in narrow.revenue).toBe(false);
    const wide = await getPreSettleCheck(fx.ceo, fx.projectId);
    expect(wide.openExpenses.rows.every((row) => typeof row.expenseAmountKrw === "number")).toBe(true);
    expect(wide.revenue).toMatchObject({ issuedTotalKrw: 1_000_000 });
  });

  // 06-19 검토 F-1 — 회수 문서가 이어진 미매칭 줄의 문은 `expense_closed`(listNumberedByLines는 결재 상태 · 범위를 보지 않는다).
  // 그 문서 id는 범위 밖 사람 · 프로젝트 쓰기 권한이 없는 사람의 DTO(→ RSC 페이로드)에 실리지 않는다(listLineDoors와 같이 문을 숨긴다).
  async function withdrawnLineProject() {
    const fx = await setupExpenseProject();
    const expenseId = (await createExpenseFromLines(fx.otherPm, { lineIds: [fx.lines.withVendor], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
    const sent = await submitReadyDraft(fx.otherPm, expenseId);
    if (sent.kind !== "submitted") throw new Error("제출 안 됨");
    await withdrawDocument(fx.otherPm, { instanceId: sent.instanceId, expectedVersion: sent.version });
    await issueRevenue(fx.projectId);
    return { fx, expenseId };
  }

  it("F-1 회수 문서가 이어진 미매칭 줄 — 범위 밖 작성자에게 그 문서 id가 없고 문은 none · 팀 범위 PM에게는 expense_closed", async () => {
    const { fx, expenseId } = await withdrawnLineProject();
    const wide = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(wide.unmatchedLines.rows.find((row) => row.lineId === fx.lines.withVendor)?.door).toEqual({ kind: "expense_closed", latestId: expenseId });

    const a = await makeNarrowDrafter();
    const narrow = await getPreSettleCheck(a, fx.projectId);
    expect(JSON.stringify(narrow)).not.toContain(expenseId);
    expect(narrow.unmatchedLines.rows.find((row) => row.lineId === fx.lines.withVendor)?.door).toEqual({ kind: "none" });
  });

  it("F-1 프로젝트 쓰기 권한이 없는 사람 — 미매칭 줄의 문이 모두 none(문서 id · 구매 링크 없음)", async () => {
    const { fx, expenseId } = await withdrawnLineProject();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `보기만-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    const viewer = await makePerson("보기만", role.id, "기획1팀");
    const check = await getPreSettleCheck(viewer, fx.projectId);
    expect(check.unmatchedLines.rows.length).toBeGreaterThan(0);
    expect(check.unmatchedLines.rows.every((row) => row.door.kind === "none")).toBe(true);
    expect(JSON.stringify(check)).not.toContain(expenseId);
  });

  it("DTO_REGISTRY에 PreSettleCheckDto가 있다(@/domain/settlements import 경유)", () => {
    expect(DTO_REGISTRY.some((entry) => entry.name === "PreSettleCheckDto")).toBe(true);
  });
});

// ── 06-22 Task 1 — [O-16] 대표 최종 승인 재점검(05 정산 종류 훅) · R-2 순서 · SA-1 · SA-3 · E-30 · ENG E-1 · X-12 ──────────

const PM_NAME = "박서연"; // setupExpenseProject의 담당 PM
const A8_ONE = "결재 중 지출결의 1건 · 먼저 결재";
const CHECK_ONE = `완료 전 점검 1건 · 담당 PM ${PM_NAME}`;
const PRE_SETTLE_UNKNOWN = "점검 결과 없음 · 다시 시도";

type Drafted = { documentId: string; instanceId: string; version: number };

async function draftSettlement(fx: ExpenseFixture): Promise<Drafted> {
  const result = await submitSettlement(fx.pm, { projectId: fx.projectId });
  if (result.kind !== "submitted") throw new Error("정산 기안 안 됨");
  return { documentId: result.documentId, instanceId: result.instanceId, version: result.version };
}

async function projectStatusOf(projectId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  return row?.status;
}

// 승인 롤백 단언 재료 — 인스턴스 상태 · version · 처리된 단계 수 · 프로젝트 상태 · 그 문서의 행동 로그 수(고아 로그 없음).
async function approvalState(instanceId: string, projectId: string) {
  const [instance] = await db
    .select({ status: approvalInstances.status, version: approvalInstances.version, documentId: approvalInstances.documentId })
    .from(approvalInstances)
    .where(eq(approvalInstances.id, instanceId));
  const acted = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), isNotNull(approvalSteps.actedBy)));
  const logs = instance ? await db.select({ seq: actionLog.seq }).from(actionLog).where(eq(actionLog.documentId, instance.documentId)) : [];
  return { status: instance?.status, version: instance?.version, acted: acted.length, actionLogs: logs.length, project: await projectStatusOf(projectId) };
}

async function setAllowOpenExpenses(value: boolean): Promise<void> {
  await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, value);
}

async function inReviewExpense(fx: ExpenseFixture, lineId: string): Promise<string> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
  return expenseId;
}

// 기안 뒤에 미결이 남은 정산 결재 — 미결 지출결의(반려 · 결재 중)는 강행 허용을 잠시 켜 기안을 통과시키고(06-19 게이트) 기안 뒤 다시 끈다.
// 그 밖의 줄은 살아 있는 연결 · 발행 줄 1로 막힘이 없다.
async function draftedWithOpen(open: { rejected?: boolean; inReview?: boolean; noEvidence?: boolean }, keepAllow = false) {
  const fx = await setupExpenseProject();
  if (open.rejected) await rejectedExpense(fx, fx.lines.withVendor);
  else if (open.noEvidence) await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
  else await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
  if (open.inReview) await inReviewExpense(fx, fx.lines.split);
  else await approvedExpenseWithEvidence(fx, fx.lines.split);
  await linkCardUsage(fx.pm, fx.lines.noVendor);
  await issueRevenue(fx.projectId);
  await settle(fx.projectId);
  await setAllowOpenExpenses(true);
  const doc = await draftSettlement(fx);
  if (!keepAllow) await setAllowOpenExpenses(false);
  return { fx, doc };
}

async function approveBlockedReason(viewer: Viewer, documentId: string): Promise<string | null> {
  return (await getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId }))?.approveBlockedReason ?? null;
}

// 풀 밖 Client가 쥔 잠금에 막힌 커넥션 수(pg_blocking_pids를 lockPid까지 재귀 — PR #75 꼴). n개에 이르면 그 수, 약 4초 안에 못 이르면 마지막 관측값.
async function waitBlockedBy(lockClient: Client, lockPid: number, n: number): Promise<number> {
  let waiting = 0;
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
    waiting = Number(rows[0]?.count ?? 0);
    if (waiting >= n) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return waiting;
}

async function purchaseVersion(requestId: string): Promise<number> {
  const [row] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  return row?.version ?? 0;
}

async function purchaseStatus(requestId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: purchaseRequests.status }).from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  return row?.status;
}

async function backendPid(client: Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const pid = rows[0]?.pid;
  if (pid === undefined) throw new Error("pg_backend_pid()를 읽지 못했다");
  return pid;
}

describe("완료 전 점검 — 대표 최종 승인 재점검(O-16 · 05 정산 종류 훅)", () => {
  it("막힘 1(반려 지출결의) — 대표 승인 거부 `완료 전 점검 1건 · 담당 PM {이름}` · 롤백 · 표시 이유와 같은 문자열", async () => {
    const { fx, doc } = await draftedWithOpen({ rejected: true });
    const before = await approvalState(doc.instanceId, fx.projectId);

    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: CHECK_ONE });
    expect(await approvalState(doc.instanceId, fx.projectId)).toEqual(before);
    expect(before.project).toBe("settling");
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe((refused as Error).message);
  });

  it("막힘이 있어도 같은 문서의 반려는 된다", async () => {
    const { fx, doc } = await draftedWithOpen({ rejected: true });
    const rejected = await rejectDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "미결 정리" });
    expect(rejected.status).toBe("rejected");
  });

  // G-06-E(카드 ② 「경고만」): 결재 통과 · 증빙 없음은 이제 막힘이 아니라 강행 갈래를 타지 않는다 — 강행 허용 승인은 반려 문서로 지킨다.
  it("막힘 0 · 강행 그룹만(반려 + allow_open_expenses 켬) — 승인 · 프로젝트 completed", async () => {
    const { fx, doc } = await draftedWithOpen({ rejected: true }, true);
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBeNull();
    const approved = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version });
    expect(approved.status).toBe("approved");
    expect(await projectStatusOf(fx.projectId)).toBe("completed");
  });

  it("[R-2 · E-4] 강행 켬 · 결재 중 지출결의 1건 — 표시 · 서버 모두 A8 문구 · 롤백(강행으로 넘어가지 않음)", async () => {
    const { fx, doc } = await draftedWithOpen({ inReview: true }, true);
    const before = await approvalState(doc.instanceId, fx.projectId);
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe(A8_ONE);
    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: A8_ONE });
    expect(await approvalState(doc.instanceId, fx.projectId)).toEqual(before);
  });

  it("[R-2] 결재 중 1 + 반려 1(강행 꺼짐) — 서버 · 표시 모두 A8 문구가 점검보다 먼저", async () => {
    const { fx, doc } = await draftedWithOpen({ rejected: true, inReview: true });
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe(A8_ONE);
    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ message: A8_ONE });
    expect(await projectStatusOf(fx.projectId)).toBe("settling");
  });

  it("[R-2] 진행 복귀 + 결재 중 지출결의 — 표시 `진행으로 바뀜 · 반려`가 가장 먼저 · 점검을 계산하지 않는다", async () => {
    const { fx, doc } = await draftedWithOpen({ inReview: true });
    await saveProjectLedger(fx.lead, fx.projectId, {
      seenStatus: "settling",
      period: { startDate: "2026-09-01", endDate: "2099-12-31", baseline: { startDate: "2026-09-01", endDate: "2026-12-31" } },
    });
    expect(await projectStatusOf(fx.projectId)).toBe("in_progress");
    inject.computeCalls = 0;
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe("진행으로 바뀜 · 반려");
    expect(inject.computeCalls).toBe(0);
  });

  it("점검 계산 예외 — 표시 · 서버 모두 `점검 결과 없음 · 다시 시도`(GateBlockedError) · 승인 거부(fail-closed) · 롤백", async () => {
    const { fx, doc } = await draftedWithOpen({});
    const before = await approvalState(doc.instanceId, fx.projectId);
    inject.compute = true;
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe(PRE_SETTLE_UNKNOWN);
    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: PRE_SETTLE_UNKNOWN });
    expect(await approvalState(doc.instanceId, fx.projectId)).toEqual(before);
  });

  it("점검 사전 조회 예외 — 표시 · 서버 모두 `점검 결과 없음 · 다시 시도`(GateBlockedError) · 승인 거부 · 트랜잭션 안 계산까지 가지 않는다", async () => {
    const { fx, doc } = await draftedWithOpen({});
    const before = await approvalState(doc.instanceId, fx.projectId);
    inject.load = true;
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBe(PRE_SETTLE_UNKNOWN);
    inject.computeCalls = 0;
    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: PRE_SETTLE_UNKNOWN });
    expect(inject.computeCalls).toBe(0);
    expect(await approvalState(doc.instanceId, fx.projectId)).toEqual(before);
  });

  it("[SA-1] 2단 결재선 — 막힘 1이어도 1단(팀장) 승인은 통과 · 2단(대표 · 최종) 승인은 거부", async () => {
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED, true);
    const { fx, doc } = await draftedWithOpen({ rejected: true });
    const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    expect(first).toMatchObject({ status: "in_review", final: false });
    const refused = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version }).catch((e: unknown) => e);
    expect(refused).toMatchObject({ message: CHECK_ONE });
    expect(await projectStatusOf(fx.projectId)).toBe("settling");
  });

  it("[SA-3 · E-38] 2단 결재선 — 사전 조회 실패는 1단 승인도 거부 · 트랜잭션 미개시", async () => {
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED, true);
    const { fx, doc } = await draftedWithOpen({});
    const before = await approvalState(doc.instanceId, fx.projectId);
    inject.load = true;
    inject.computeCalls = 0;
    await expect(approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version })).rejects.toThrow(PRE_SETTLE_UNKNOWN);
    expect(inject.computeCalls).toBe(0);
    expect(await approvalState(doc.instanceId, fx.projectId)).toEqual(before);
  });

  it("[E-30] 표시 훅 — 프로젝트 id 중복 제거 · 사전 조회 1회 · 점검은 프로젝트마다 1회 · A8로 막힌 행은 계산하지 않는다", async () => {
    const blocked = await draftedWithOpen({ rejected: true });
    const clean = await draftedWithOpen({});
    const a8 = await draftedWithOpen({ inReview: true });
    const ids = [blocked.doc.documentId, blocked.doc.documentId, clean.doc.documentId, a8.doc.documentId];
    inject.loadCalls = 0;
    inject.computeCalls = 0;
    const hook = getDocumentKind(SETTLEMENT_DOCUMENT_KIND).approveBlockedReason;
    if (!hook) throw new Error("정산 종류에 승인 막힘 훅 없음");
    const reasons = await hook(blocked.fx.ceo, ids);
    expect(inject.loadCalls).toBe(1);
    expect(inject.computeCalls).toBe(2);
    expect(reasons.get(blocked.doc.documentId)).toBe(CHECK_ONE);
    expect(reasons.has(clean.doc.documentId)).toBe(false);
    expect(reasons.get(a8.doc.documentId)).toBe(A8_ONE);
  });

  it("지출결의 · 연차 승인은 점검 함수를 부르지 않는다(다른 종류에는 훅이 없다)", async () => {
    const fx = await setupExpenseProject();
    inject.loadCalls = 0;
    inject.computeCalls = 0;
    await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    const leave = await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" }, { now: NOW_2026 });
    const leaveView = await getApprovalView(fx.lead, { kind: LEAVE_DOCUMENT_KIND, documentId: leave.leaveId }, { now: NOW_2026 });
    expect(leaveView).not.toBeNull();
    await approveDocument(fx.lead, { instanceId: leave.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(inject.loadCalls).toBe(0);
    expect(inject.computeCalls).toBe(0);
  });

  // G-06-E(카드 ② 「경고만」): 무효로 결재 통과 문서가 증빙 없음이 돼도 막힘이 아니라 증빙 대기 — 승인은 프로젝트 행 잠금을 기다린 뒤 막힘 없이 통과한다.
  // 「재점검이 잠금 뒤 새 막힘을 본다」 쪽은 아래 [U1-1] 구매 요청 취소 사례가 같은 뜻으로 지킨다.
  it(
    "무효 ∥ 정산 최종 승인 — 잠금 뒤 재점검: 프로젝트 행을 쥔 무효가 커밋돼도 증빙 대기는 막지 않아 승인 → completed(X-12 · G-06-E)",
    async () => {
      const fx = await blockFreeSettlingProject();
      const doc = await draftSettlement(fx);
      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let call: Promise<unknown> | undefined;
      let txOpen = false;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const lockPid = await backendPid(lockClient);
        // 06-11 voidEvidence의 첫 잠금 자리 — 그 지출결의의 프로젝트 행.
        await lockClient.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
        call = approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
        const waiting = await waitBlockedBy(lockClient, lockPid, 1);
        expect(waiting, `승인 커넥션이 프로젝트 행 잠금에 막히지 않았다(관측: ${waiting}) — 잠금 조건을 만들지 못했다`).toBeGreaterThanOrEqual(1);
        await lockClient.query(
          "UPDATE files SET voided_at = now(), voided_by = $2, void_reason = '다른 건 영수증' WHERE owner_kind = 'expense' AND owner_id = $1 AND removed_at IS NULL AND voided_at IS NULL",
          [fx.evidenceExpenseId, fx.ceo.id],
        );
        await lockClient.query("COMMIT");
        txOpen = false;
        const result = await call;
        expect(result).toMatchObject({ status: "approved", final: true });
        expect(await projectStatusOf(fx.projectId)).toBe("completed");
        const after = await getPreSettleCheck(fx.ceo, fx.projectId);
        expect(after.evidencePending.rows.map((row) => row.state)).toEqual(["no_evidence"]);
        expect(after.blockedCount).toBe(0);
      } finally {
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        if (call) await Promise.allSettled([call]);
      }
    },
    120_000,
  );

  // U1-1(06 교차 검토): 점검은 `신청됨` 구매 요청을 매칭으로 센다 — 그 취소가 프로젝트 행에서 정산 최종 승인과 줄을 서야 한다.
  it(
    "[U1-1] 구매 요청 취소 ∥ 정산 최종 승인 — 취소가 프로젝트 행을 먼저 쥠: 승인은 기다린 뒤 재점검으로 `완료 전 점검 1건` 거부 · 요청 취소",
    async () => {
      const fx = await blockFreeSettlingProject();
      const doc = await draftSettlement(fx);
      const pre = await precheckPurchaseCancel(fx.pm, { id: fx.purchaseRequestId });
      const held = deferred();
      const release = deferred();
      let approving: Promise<unknown> | undefined;
      const cancelling = cancelPurchaseRequest(fx.pm, { id: fx.purchaseRequestId, version: await purchaseVersion(fx.purchaseRequestId) }, pre, undefined, {
        afterLock: async () => {
          held.resolve();
          await release.promise;
        },
      });
      try {
        await held.promise;
        approving = approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e);
        await waitForLockWaiter(pool);
      } finally {
        release.resolve();
      }
      await cancelling;
      const result = await approving;
      expect(result).toBeInstanceOf(GateBlockedError);
      expect(result).toMatchObject({ message: CHECK_ONE });
      expect(await projectStatusOf(fx.projectId)).toBe("settling");
      expect(await purchaseStatus(fx.purchaseRequestId)).toBe("cancelled");
    },
    120_000,
  );

  it(
    "[U1-1] 정산 최종 승인 ∥ 구매 요청 취소 — 승인이 프로젝트 행 줄의 앞: 승인 완료 뒤 취소는 `완료 · 견적 줄 잠김` · 요청 `신청됨` · 로그 0",
    async () => {
      const fx = await blockFreeSettlingProject();
      const doc = await draftSettlement(fx);
      const pre = await precheckPurchaseCancel(fx.pm, { id: fx.purchaseRequestId });
      const version = await purchaseVersion(fx.purchaseRequestId);
      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      const calls: Promise<unknown>[] = [];
      let txOpen = false;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const lockPid = await backendPid(lockClient);
        await lockClient.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
        calls.push(approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }).catch((e: unknown) => e));
        expect(await waitBlockedBy(lockClient, lockPid, 1)).toBeGreaterThanOrEqual(1);
        calls.push(cancelPurchaseRequest(fx.pm, { id: fx.purchaseRequestId, version }, pre).catch((e: unknown) => e));
        const waiting = await waitBlockedBy(lockClient, lockPid, 2);
        expect(waiting, `취소 커넥션이 프로젝트 행 잠금에 막히지 않았다(관측: ${waiting})`).toBeGreaterThanOrEqual(2);
        await lockClient.query("COMMIT");
        txOpen = false;
        const [approved, cancelled] = await Promise.all(calls);
        expect(approved).toMatchObject({ status: "approved", final: true });
        expect(cancelled).toBeInstanceOf(CompletedProjectError);
        expect(await projectStatusOf(fx.projectId)).toBe("completed");
        expect(await purchaseStatus(fx.purchaseRequestId)).toBe("requested");
        const logs = await db
          .select({ seq: actionLog.seq })
          .from(actionLog)
          .where(and(eq(actionLog.entityId, fx.purchaseRequestId), eq(actionLog.actionType, "status_change")));
        expect(logs).toHaveLength(0);
      } finally {
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    120_000,
  );

  it(
    "승인 동시 6건 — 결재 인스턴스 행을 쥔 외부 커넥션이 풀 전체를 막아도 잠금 해제 뒤 10초 안에 모두 승인된다(ENG E-1)",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeGreaterThanOrEqual(2);
      expect(poolMax).toBeLessThan(6);

      const projectsFx: (ExpenseFixture & { evidenceExpenseId: string; purchaseRequestId: string })[] = [];
      for (let i = 0; i < 6; i += 1) projectsFx.push(await blockFreeSettlingProject());
      const docs: Drafted[] = [];
      for (const fx of projectsFx) docs.push(await draftSettlement(fx));

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: Promise<unknown>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const lockPid = await backendPid(lockClient);
        // 승인 트랜잭션이 finalHook.inTx보다 먼저 쓰는 행 — runTransition (5) updateInstanceStatus의 approval_instances 행.
        await lockClient.query("SELECT id FROM approval_instances WHERE id = ANY($1::uuid[]) FOR UPDATE", [docs.map((doc) => doc.instanceId)]);

        calls = docs.map((doc, i) => approveDocument(projectsFx[i]?.ceo ?? SYSTEM_VIEWER, { instanceId: doc.instanceId, expectedVersion: doc.version }));

        const waiting = await waitBlockedBy(lockClient, lockPid, poolMax);
        expect(waiting, `풀 커넥션 ${poolMax}개가 결재 인스턴스 행 잠금을 기다리는 상태에 이르지 못했다(관측: ${waiting}) — 교착 조건을 만들지 못했다`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;

        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("정산 최종 승인 6건 동시 호출이 10초 안에 끝나지 않았다(교착)")), 10_000);
        });
        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);

        expect(results).toHaveLength(6);
        for (const result of results) expect(result).toMatchObject({ status: "approved", final: true });
        const rows = await db.select({ status: projects.status }).from(projects).where(inArray(projects.id, projectsFx.map((fx) => fx.projectId)));
        expect(rows.map((row) => row.status)).toEqual(Array(6).fill("completed"));
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    180_000,
  );
});

// ── 06-22 Task 2 — 정산 결재 문서 화면의 점검 요약(PS-4 강행 결과 줄 · 다시 올리기 막힘 재료) ──────────

describe("완료 전 점검 — 정산 결재 문서 요약(getSettlementPreSettleSummary)", () => {
  it("정산 · 강행 그룹만(막힘 0) → `{ blockedCount: 0, forcedResultLine: 강행 · 미결 지출결의 2건 }`", async () => {
    const fx = await setupExpenseProject();
    // G-06-E(카드 ② 「경고만」): 결재 통과 · 증빙 없음은 이제 막힘이 아니라 이 사례의 미결은 같은 뜻을 지키는 반려 문서 두 건이다.
    await rejectedExpense(fx, fx.lines.withVendor);
    await rejectedExpense(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    await settle(fx.projectId);
    await setAllowOpenExpenses(true);
    await draftSettlement(fx);
    expect(await getSettlementPreSettleSummary(fx.ceo, { projectId: fx.projectId })).toEqual({ blockedCount: 0, forcedResultLine: "강행 · 미결 지출결의 2건", evidencePendingCount: 0 });
  });

  it("정산 · 강행 없음 · 막힘 0 → 결과 줄 없음", async () => {
    const { fx } = await draftedWithOpen({});
    expect(await getSettlementPreSettleSummary(fx.ceo, { projectId: fx.projectId })).toEqual({ blockedCount: 0, forcedResultLine: null, evidencePendingCount: 0 });
  });

  it("진행 복귀 프로젝트 → null", async () => {
    const { fx } = await draftedWithOpen({});
    await saveProjectLedger(fx.lead, fx.projectId, {
      seenStatus: "settling",
      period: { startDate: "2026-09-01", endDate: "2099-12-31", baseline: { startDate: "2026-09-01", endDate: "2026-12-31" } },
    });
    expect(await getSettlementPreSettleSummary(fx.ceo, { projectId: fx.projectId })).toBeNull();
  });

  it("문서를 볼 수 없는 사람 → null", async () => {
    const { fx } = await draftedWithOpen({ rejected: true });
    const outsider = await makePerson("무관피엠", DEFAULT_ROLE_ID, "기획1팀");
    expect(await getSettlementPreSettleSummary(outsider, { projectId: fx.projectId })).toBeNull();
    expect(await getSettlementPreSettleSummary(fx.pm, { projectId: fx.projectId })).toEqual({ blockedCount: 1, forcedResultLine: null, evidencePendingCount: 0 });
  });
});

// ── 06-36 G-06-E(카드 ② 2026-10-14 「경고만」) — 결재 통과 · 증빙 없음은 증빙 대기 그룹(막힘 밖), 결재 중 · 반려만 막는다 ──────────

// 결재 통과 뒤 살아 있는 증빙을 전부 무효 처리한 문서 — 기안자가 달라도 되게 viewer를 받는다(fixtures/payments는 고치지 않는다).
async function approvedWithoutEvidenceBy(fx: ExpenseFixture, drafter: Viewer, lineId: string): Promise<{ expenseId: string; number: string }> {
  const expenseId = (await createExpenseFromLines(drafter, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  const sent = await submitReadyDraft(drafter, expenseId);
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version });
  const final = await approveDocument(fx.ceo, { instanceId: sent.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  for (const file of await aliveFiles(expenseId)) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  return { expenseId, number: sent.number };
}

// 선결제(증빙 없이 제출) 결재 통과 문서.
async function approvedPrepaid(fx: ExpenseFixture, lineId: string): Promise<{ expenseId: string; number: string }> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
  await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { prepaid: true, prepaidReason: "행사장 선입금 요구" } });
  const sent = await submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) });
  if (sent.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: sent.instanceId, expectedVersion: sent.version });
  const final = await approveDocument(fx.ceo, { instanceId: sent.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  return { expenseId, number: sent.number };
}

// 결재 통과 · 증빙 없음 1건(withVendor) + 그 밖 막힘 없음(split 증빙 있음 · noVendor 카드 · 발행 줄 1)인 정산 프로젝트.
async function evidencePendingProject(settleNow = false) {
  const fx = await setupExpenseProject();
  const pending = await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.withVendor);
  await approvedExpenseWithEvidence(fx, fx.lines.split);
  await linkCardUsage(fx.pm, fx.lines.noVendor);
  await issueRevenue(fx.projectId);
  if (settleNow) await settle(fx.projectId);
  return { fx, pending };
}

describe("G-06-E — 결재 통과 · 증빙 대기(카드 ② 「경고만」)", () => {
  it("결재 통과 · 증빙 없음 1건 → 증빙 대기 1 · 행 [번호, no_evidence] · 미결 0 · 막힘 0 · 이유 없음 · 강행 줄 없음", async () => {
    const { fx, pending } = await evidencePendingProject();
    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.evidencePending.count).toBe(1);
    expect(check.evidencePending.rows.map((row) => [row.number, row.state])).toEqual([[pending.number, "no_evidence"]]);
    expect(check.evidencePending.outOfScopeCount).toBe(0);
    expect(check.openExpenses.count).toBe(0);
    expect(check.blockedCount).toBe(0);
    expect(check.blockReason).toBeNull();
    expect(check.forcedResultLine).toBeNull();
  });

  it("선결제 · 증빙 없음(결재 통과) → 증빙 대기 행 낱말 prepaid_no_evidence", async () => {
    const fx = await setupExpenseProject();
    const prepaid = await approvedPrepaid(fx, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.evidencePending.rows.map((row) => [row.number, row.state])).toEqual([[prepaid.number, "prepaid_no_evidence"]]);
    expect(check.blockedCount).toBe(0);
  });

  // 결재 중에는 증빙을 무효 처리할 수 없다(voidEvidence — 승인 뒤에만) — 결재 중 · 증빙 0 문서는 선결제로 제출한 것이다.
  it("결재 중 · 증빙 없음(선결제 제출)은 미결 지출결의에 남고 막힘 1(가정 A-1 — 결재 중 · 반려만 막음)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "행사 운영비" } })).created[0]?.expenseId ?? "";
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { prepaid: true, prepaidReason: "행사장 선입금 요구" } });
    expect(await submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) })).toMatchObject({ kind: "submitted" });
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.openExpenses.rows.map((row) => row.state)).toEqual(["prepaid_no_evidence"]);
    expect(check.evidencePending.count).toBe(0);
    expect(check.blockedCount).toBe(1);
  });

  it("반려 1 + 증빙 대기 1 → 막힘은 반려 1건만(증빙 대기는 세지 않는다)", async () => {
    const fx = await setupExpenseProject();
    await rejectedExpense(fx, fx.lines.withVendor);
    const pending = await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    const check = await getPreSettleCheck(fx.pm, fx.projectId);
    expect(check.openExpenses.rows.map((row) => row.state)).toEqual(["rejected"]);
    expect(check.evidencePending.rows.map((row) => row.number)).toEqual([pending.number]);
    expect(check.blockedCount).toBe(1);
    expect(check.blockReason).toBe("완료 전 점검 1건 · 점검 보기");
  });

  it("증빙 대기만 남은 정산 프로젝트 — 강행 꺼짐에서 기안이 거부 없이 올라가고 행동 로그 상세에 증빙 대기가 없다(가정 A-5)", async () => {
    const { fx } = await evidencePendingProject(true);
    const result = await submitSettlement(fx.pm, { projectId: fx.projectId });
    expect(result).toMatchObject({ kind: "submitted" });
    if (result.kind !== "submitted") throw new Error("기안 안 됨");
    const [log] = await db.select().from(actionLog).where(and(eq(actionLog.documentId, result.documentId), eq(actionLog.actionType, "document_submit")));
    // 강행 결과 줄이 없으면 기안 로그 상세에 점검 요약을 싣지 않는다 — 증빙 대기는 막힘이 아니라 강행 기록 대상도 아니다.
    expect(log?.detail).toEqual({ kind: "settlement", round: 1 });
    expect(JSON.stringify(log?.detail)).not.toContain("evidencePending");
  });

  it("증빙 대기만 남은 정산 — 대표 승인 재점검이 막지 않아 승인 → 프로젝트 completed", async () => {
    const { fx, doc } = await draftedWithOpen({ noEvidence: true });
    expect(await approveBlockedReason(fx.ceo, doc.documentId)).toBeNull();
    const approved = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: doc.version });
    expect(approved.status).toBe("approved");
    expect(await projectStatusOf(fx.projectId)).toBe("completed");
  });

  it("강행 꺼짐 · 증빙 대기 2건 → { blockedCount: 0, forcedResultLine: null }", async () => {
    const fx = await setupExpenseProject();
    await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.withVendor);
    await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    await settle(fx.projectId);
    await draftSettlement(fx);
    expect(await getSettlementPreSettleSummary(fx.ceo, { projectId: fx.projectId })).toEqual({ blockedCount: 0, forcedResultLine: null, evidencePendingCount: 2 });
  });

  it("범위가 좁은 기안자 A: 증빙 대기 행은 A 문서만 · 그 밖 1건 · count 2 · DTO 글자에 B 문서 번호 · id 없음 · 키 셋 고정", async () => {
    const fx = await setupExpenseProject();
    const a = await makeNarrowDrafter();
    const mine = await approvedWithoutEvidenceBy(fx, a, fx.lines.withVendor);
    const theirs = await approvedWithoutEvidenceBy(fx, fx.otherPm, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);

    const narrow = await getPreSettleCheck(a, fx.projectId);
    expect(narrow.evidencePending.rows.map((row) => row.number)).toEqual([mine.number]);
    expect(narrow.evidencePending.outOfScopeCount).toBe(1);
    expect(narrow.evidencePending.count).toBe(2);
    expect(narrow.blockedCount).toBe(0);
    const text = JSON.stringify(narrow);
    expect(text).not.toContain(theirs.number);
    expect(text).not.toContain(theirs.expenseId);
    expect(narrow.evidencePending.rows.every((row) => !("expenseAmountKrw" in row))).toBe(true);
    expect(Object.keys(narrow.evidencePending).sort()).toEqual(["count", "outOfScopeCount", "rows"]);

    const wide = await getPreSettleCheck(fx.ceo, fx.projectId);
    expect(wide.evidencePending.rows).toHaveLength(2);
    expect(wide.evidencePending.outOfScopeCount).toBe(0);
    expect(wide.evidencePending.count).toBe(2);
  });
});


// ── 07.1-01 PF2 · PD3 — 점검 리뷰 묶음 읽기 · 정산 결재 문서 칸 `증빙 대기 {N}건` ─────────────────────────────

describe("PF2 — 점검이 지출결의마다 리뷰를 따로 읽지 않는다", () => {
  it("지출결의 여럿인 프로젝트 → 리뷰 읽기는 묶음 1회 · 단건 읽기 0 · 결과는 그대로", async () => {
    const fx = await setupExpenseProject();
    const first = await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.withVendor);
    await approvedExpenseWithEvidence(fx, fx.lines.split);
    reviewReads.list = 0;
    reviewReads.single = 0;

    const check = await getPreSettleCheck(fx.pm, fx.projectId);

    expect(reviewReads.list).toBe(1);
    expect(reviewReads.single).toBe(0);
    expect(check.evidencePending.rows.map((row) => [row.number, row.state])).toEqual([[first.number, "no_evidence"]]);
  });
});

describe("PD3 — 정산 결재 문서 칸의 `증빙 대기 {N}건` 행", () => {
  async function pendingSettlement(pendingCount: 0 | 1 | 2) {
    const fx = await setupExpenseProject();
    if (pendingCount >= 1) await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.withVendor);
    else await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    if (pendingCount >= 2) await approvedWithoutEvidenceBy(fx, fx.pm, fx.lines.split);
    else await approvedExpenseWithEvidence(fx, fx.lines.split);
    await linkCardUsage(fx.pm, fx.lines.noVendor);
    await issueRevenue(fx.projectId);
    await settle(fx.projectId);
    return { fx, doc: await draftSettlement(fx) };
  }

  it("2건 → 「실행가 합」 뒤 · 「기안」 앞에 { 증빙 대기, 2건, warning } 행", async () => {
    const { fx, doc } = await pendingSettlement(2);
    const rows = (await loadKindDetails(fx.ceo, SETTLEMENT_DOCUMENT_KIND, [doc.documentId], { visible })).get(doc.documentId)?.rows ?? [];
    const labels = rows.map((row) => row.label);
    expect(rows.find((row) => row.label === "증빙 대기")).toEqual({ label: "증빙 대기", value: "2건", tone: "warning" });
    expect(labels.indexOf("증빙 대기")).toBe(labels.indexOf("실행가 합") + 1);
    expect(labels.indexOf("기안")).toBe(labels.indexOf("증빙 대기") + 1);
  });

  it("0건 → 행이 없다(대시 행 금지)", async () => {
    const { fx, doc } = await pendingSettlement(0);
    const rows = (await loadKindDetails(fx.ceo, SETTLEMENT_DOCUMENT_KIND, [doc.documentId], { visible })).get(doc.documentId)?.rows ?? [];
    expect(rows.map((row) => row.label)).not.toContain("증빙 대기");
  });

  it("E-P2-04 — 정산 프로젝트 둘 · 진행 복귀 하나인 상세 로드는 점검 입력 1회 · 점검 2회 · 리뷰 묶음 읽기 2회, 정산 문서가 없으면 0", async () => {
    const a = await pendingSettlement(2);
    const b = await pendingSettlement(1);
    const back = await pendingSettlement(1);
    await saveProjectLedger(back.fx.lead, back.fx.projectId, {
      seenStatus: "settling",
      period: { startDate: "2026-09-01", endDate: "2099-12-31", baseline: { startDate: "2026-09-01", endDate: "2026-12-31" } },
    });
    inject.loadCalls = 0;
    inject.computeCalls = 0;
    reviewReads.list = 0;

    const ids = [a.doc.documentId, b.doc.documentId, back.doc.documentId];
    const details = await loadKindDetails(a.fx.ceo, SETTLEMENT_DOCUMENT_KIND, ids, { visible });

    expect(inject.loadCalls).toBe(1);
    expect(inject.computeCalls).toBe(2);
    expect(reviewReads.list).toBe(2);
    const valueOf = (id: string) => details.get(id)?.rows.find((row) => row.label === "증빙 대기")?.value;
    expect(valueOf(a.doc.documentId)).toBe("2건");
    expect(valueOf(b.doc.documentId)).toBe("1건");
    expect(valueOf(back.doc.documentId)).toBeUndefined();

    inject.loadCalls = 0;
    inject.computeCalls = 0;
    reviewReads.list = 0;
    await loadKindDetails(a.fx.ceo, SETTLEMENT_DOCUMENT_KIND, [back.doc.documentId], { visible });
    expect([inject.loadCalls, inject.computeCalls, reviewReads.list]).toEqual([0, 0, 0]);
  }, 30_000);
});
