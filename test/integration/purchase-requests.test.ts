import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "@/db/client";
import { actionLog, corpCardUsages, documentCounters, expenses, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { CompletedProjectError } from "@/domain/projects";
import { createCorpCard, setCorpCardActive } from "@/domain/corp-cards";
import {
  createCardUsage,
  loadCardUsageForEdit,
  precheckCardUsage,
  precheckCardUsageRemoval,
  precheckCardUsageUpdate,
  updateCardUsage,
  type CardUsageInput,
  type CardUsageUpdateInput,
} from "@/domain/corp-card-usages";
import { StaleQuoteRevisionError } from "@/domain/corp-card-usages/link-targets";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { closeExpense, createExpenseFromLines } from "@/domain/expenses";
import { rejectDocument, REJECT_REASON_EMPTY_MESSAGE, REJECT_REASON_TOO_LONG_MESSAGE } from "@/domain/approvals";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { ForbiddenError } from "@/domain/permissions/can";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import {
  completePurchaseRequest,
  createPurchaseRequest,
  countOpenPurchaseRequests,
  listPurchaseRequests,
  loadPurchaseCompletion,
  precheckPurchaseCompletion,
  precheckPurchaseRequest,
  previewPurchaseCompletion,
  PURCHASE_REQUEST_ENTITY,
  cancelPurchaseRequest,
  precheckPurchaseCancel,
  precheckPurchaseCancelUndo,
  undoCancelPurchaseRequest,
  type PurchaseCompletionInput,
  type PurchaseRequestInput,
} from "@/domain/purchase-requests";
import { cancelPurchaseRequestAction, createPurchaseRequestAction, undoCancelPurchaseRequestAction } from "@/app/(app)/cards/purchases/actions";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findLineLinks } from "@/repositories/quote-line-links";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { ONLINE_VENDOR, purchaseProject, request, requestInput, type PurchaseFx } from "./fixtures/purchase-requests";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06-08(EXP-10 · D-609 · Q3 · GA-38): 구매 요청 신청 경로 통합 파일 — 06-12 · 06-14가 `describe`를 더한다.

// 06-14: 액션(zod 판별 합 · 클라이언트가 보낸 팀 · 원화 환산액 무시)도 같은 파일에서 부른다 — 세션만 가짜로 둔다.
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe("purchase.line-door", () => {
  it("구매 요청 입구 + 지출결의 문 → `온라인구매 협력사 줄 아님 · 지출결의로`", async () => {
    await expect(gate(null, "purchase.line-door", { side: "purchase", door: "expense", vendorName: "스테이지원" })).resolves.toEqual({
      allowed: false,
      reason: "온라인구매 협력사 줄 아님 · 지출결의로",
    });
  });

  it("구매 요청 입구 + 구매 요청 문 → 통과", async () => {
    await expect(gate(null, "purchase.line-door", { side: "purchase", door: "purchase", vendorName: ONLINE_VENDOR })).resolves.toEqual({ allowed: true });
  });

  it("지출결의 입구 + 구매 요청 문 → `온라인구매 협력사 줄 · 구매 요청으로`(호출은 06-13)", async () => {
    await expect(gate(null, "purchase.line-door", { side: "expense", door: "purchase", vendorName: ONLINE_VENDOR })).resolves.toEqual({
      allowed: false,
      reason: "온라인구매 협력사 줄 · 구매 요청으로",
    });
  });

  it("지출결의 입구 + 지출결의 문 → 통과", async () => {
    await expect(gate(null, "purchase.line-door", { side: "expense", door: "expense", vendorName: "스테이지원" })).resolves.toEqual({ allowed: true });
  });
});

describe("구매 요청 신청 — 트레이서(06-08)", () => {
  it("온라인구매 줄 → 저장 + 번호 `{프로젝트 번호}-C0001` + 같은 tx `document_create` 한 줄", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);

    expect(created.number).toBe(`${fx.projectNumber}-C0001`);
    const [row] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    expect(row).toMatchObject({
      number: created.number,
      linkKind: "quote_line",
      projectId: fx.projectId,
      quoteLineId: fx.onlineLine,
      requestedBy: fx.pm.id,
      itemName: "현수막 3장",
      linkUrl: "https://www.coupang.com/vp/products/1",
      estimateCurrency: "KRW",
      estimateAmountKrw: 110_000,
      status: "requested",
    });
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, created.id), eq(actionLog.actionType, "document_create")));
    expect(logs).toHaveLength(1);
  });

  it("같은 프로젝트의 둘째 요청은 `-C0002`", async () => {
    const fx = await purchaseProject();
    await request(fx, fx.onlineLine);
    expect((await request(fx, fx.onlineLine)).number).toBe(`${fx.projectNumber}-C0002`);
  });

  it("다른 거래처 줄 → 서버 거부 `온라인구매 협력사 줄 아님 · 지출결의로` · 요청 0", async () => {
    const fx = await purchaseProject();
    await expect(request(fx, fx.otherLine)).rejects.toThrow("온라인구매 협력사 줄 아님 · 지출결의로");
    expect(await db.select({ id: purchaseRequests.id }).from(purchaseRequests)).toHaveLength(0);
  });
});

// ── Task 2 도우미 ─────────────────────────────────────────────────────────────

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("거부되지 않음");
}

async function requestCount(): Promise<number> {
  return (await db.select({ id: purchaseRequests.id }).from(purchaseRequests)).length;
}

async function counterValue(projectNumber: string): Promise<number> {
  const [row] = await db
    .select({ value: documentCounters.value })
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, "purchase_request"), eq(documentCounters.period, projectNumber)));
  return row?.value ?? 0;
}

async function createLogCount(): Promise<number> {
  return (await db.select({ seq: actionLog.seq }).from(actionLog).where(and(eq(actionLog.entity, PURCHASE_REQUEST_ENTITY), eq(actionLog.actionType, "document_create")))).length;
}

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// 카드 사용 공급가(증빙 `계산서` — 공급가 = 결제 합계)를 줄에 붙인다 — 같은 쪽(카드) 연결은 구매 요청과 함께 설 수 있다.
async function cardOnLine(fx: PurchaseFx, lineId: string, supplyKrw: number): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "개인 카드", kind: "personal", holderUserId: fx.pm.id });
  if (!card.id) throw new Error("카드 id 없음");
  const input: CardUsageInput = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: supplyKrw, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).id;
}

async function cancelRequest(fx: PurchaseFx, requestId: string): Promise<void> {
  await db.update(purchaseRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: fx.pm.id, cancelReason: "취소" }).where(eq(purchaseRequests.id, requestId));
}

async function setStatus(projectId: string, status: string): Promise<void> {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function nextRevision(fx: PurchaseFx): Promise<{ revisionId: string; copyOf: (lineId: string) => Promise<string> }> {
  const latest = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
  if (!latest) throw new Error("차수 없음");
  const created = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: latest.id });
  return {
    revisionId: created.revisionId,
    copyOf: async (lineId) => {
      const [row] = await db.select({ id: quoteLines.id }).from(quoteLines).where(and(eq(quoteLines.revisionId, created.revisionId), eq(quoteLines.copiedFromLineId, lineId)));
      if (!row) throw new Error("복사된 줄 없음");
      return row.id;
    },
  };
}

describe("반대쪽 지출결의(D-609 · 문 거부)", () => {
  it("지출결의가 이어진 온라인구매 줄 → `card.dual-link-block` 거부 · 06-28 종결 뒤 → 저장", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    // 제출 뒤 지출결의 fixture의 「무대 제작」 줄(스테이지원)을 온라인구매 협력사로 켠다(06-13 — 온라인구매 줄의 지출결의 제출은 문 게이트가 막는다).
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");

    const input = requestInput(fx.lines.withVendor);
    const error = await caught(createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input)));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 카드 사용은 다른 줄`);
    expect(await requestCount()).toBe(0);

    await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "금액 확인" });
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    await closeExpense(fx.pm, { expenseId, expectedVersion: row?.version ?? 0, reason: "업체 취소" });
    const created2 = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    expect(created2.number).toBe(`${fx.projectNumber}-C0001`);
  });
});

describe("[06-07 I-1] 구매 요청이 이어진 줄 → 지출결의 제출 거부", () => {
  it("`신청됨` 요청 1건 → `구매 요청 1건 연결됨 · 지출결의는 다른 줄` · 번호 없음 · 요청을 취소하면 제출 통과", async () => {
    const fx = await setupExpenseProject();
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const input = requestInput(fx.lines.withVendor);
    const created = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = draft.created[0]?.expenseId ?? "";

    const error = await caught(submitReadyDraft(fx.pm, expenseId));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("구매 요청 1건 연결됨 · 지출결의는 다른 줄");
    const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
    expect(row?.number).toBeNull();

    await db.update(purchaseRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: fx.pm.id, cancelReason: "취소" }).where(eq(purchaseRequests.id, created.id));
    // 06-13 — 온라인구매 줄의 지출결의 제출은 문 게이트가 막는다. 협력사 설정을 끈 줄로 이중 연결만 본다.
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "");
    expect((await submitReadyDraft(fx.pm, expenseId)).kind).toBe("submitted");
  });
});

describe("실행가 상한(Q3)", () => {
  it("실행가 1,000,000 · 카드 공급가 600,000 → 예상 금액 440,001(공급가 추정 400,001) 거부 · 요청 0", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const error = await caught(request(fx, fx.onlineLine, 440_001));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
    expect(await requestCount()).toBe(0);
  });

  it("같은 상태에서 440,000(공급가 추정 400,000) → 저장(경계값)", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    await request(fx, fx.onlineLine, 440_000);
    expect(await requestCount()).toBe(1);
  });

  it("다른 `신청됨` 요청(110,000 — 공급가 추정 100,000)이 있으면 남은 실행가 300,000 — 330,001 거부 · 330,000 저장", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    await request(fx, fx.onlineLine, 110_000);
    const error = await caught(request(fx, fx.onlineLine, 330_001));
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 300,000 · 다른 줄 고르기");
    await request(fx, fx.onlineLine, 330_000);
    expect(await requestCount()).toBe(2);
  });

  it("그 요청이 취소(cancelled)되면 자리가 돌아온다 — 440,000까지 저장", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const first = await request(fx, fx.onlineLine, 110_000);
    await cancelRequest(fx, first.id);
    await request(fx, fx.onlineLine, 440_000);
    expect(await requestCount()).toBe(2);
  });

  it("[X-5] 원천징수 규칙 거래처 줄 — 예상 금액이 곧 공급가: 1,000,001 거부 · 1,000,000 저장", async () => {
    const fx = await purchaseProject("business_income");
    const error = await caught(request(fx, fx.onlineLine, 1_000_001));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 1,000,000 · 다른 줄 고르기");
    await request(fx, fx.onlineLine, 1_000_000);
    expect(await requestCount()).toBe(1);
  });

  it("[X-1] 계보 — 차수 1 줄의 카드 공급가 600,000이 차수 2 줄 상한에 든다: 예상 공급가 400,001 거부 · 400,000 저장", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    const error = await caught(request(fx, l2, 440_001));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
    await request(fx, l2, 440_000);
    expect(await requestCount()).toBe(1);
  });
});

describe("완료 프로젝트 · 경합(X-2)", () => {
  it("완료 프로젝트 줄 → CompletedProjectError `완료 · 견적 줄 잠김` · 요청 0", async () => {
    const fx = await purchaseProject();
    await setStatus(fx.projectId, "completed");
    const error = await caught(request(fx, fx.onlineLine));
    expect(error).toBeInstanceOf(CompletedProjectError);
    expect((error as Error).message).toBe("완료 · 견적 줄 잠김");
    expect(await requestCount()).toBe(0);
  });

  it("precheck 통과 뒤 풀 밖 클라이언트가 프로젝트 행을 잡고 완료로 커밋 → CompletedProjectError · 요청 0 · 카운터 그대로", async () => {
    const fx = await purchaseProject();
    await setStatus(fx.projectId, "settling");
    const input = requestInput(fx.onlineLine);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await client.query("UPDATE projects SET status = 'completed' WHERE id = $1", [fx.projectId]);
      const creating = caught(createPurchaseRequest(fx.pm, input, pre));
      await waitForLockWaiter(pool);
      await client.query("COMMIT");
      expect(await creating).toBeInstanceOf(CompletedProjectError);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    expect(await requestCount()).toBe(0);
    expect(await counterValue(fx.projectNumber)).toBe(0);
  });

  it("precheck 뒤 새 차수 → 옛 pre.revisionId로 신청 → `견적 새 차수 · 새로 고침` · 요청 0 · 카운터 그대로", async () => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    await nextRevision(fx);
    const error = await caught(createPurchaseRequest(fx.pm, input, pre));
    expect(error).toBeInstanceOf(StaleQuoteRevisionError);
    expect((error as Error).message).toBe("견적 새 차수 · 새로 고침");
    expect(await requestCount()).toBe(0);
    expect(await counterValue(fx.projectNumber)).toBe(0);
  });

  it("줄 잠금 — 풀 밖 연결이 줄 행을 잡고 실행가를 500,000으로 내려 커밋 → 660,000 신청은 기다린 뒤 새 실행가로 거부 · 요청 0", async () => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine, 660_000);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE quote_lines SET execution_amount_krw = 500000 WHERE id = $1", [fx.onlineLine]);
      const creating = caught(createPurchaseRequest(fx.pm, input, pre));
      await waitForLockWaiter(pool);
      await client.query("COMMIT");
      const error = await creating;
      expect(error).toBeInstanceOf(GateBlockedError);
      expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 500,000 · 다른 줄 고르기");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    expect(await requestCount()).toBe(0);
  });

  it("신청 ∥ 신청 같은 줄 — 660,000(공급가 추정 600,000) 두 건 동시 → 한 건만 저장(실행가 1,000,000)", async () => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine, 660_000);
    const [preA, preB] = [await precheckPurchaseRequest(fx.pm, input), await precheckPurchaseRequest(fx.pm, input)];
    const results = await Promise.allSettled([createPurchaseRequest(fx.pm, input, preA), createPurchaseRequest(fx.pm, input, preB)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? (rejected.reason as Error).message : null).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
    expect(await requestCount()).toBe(1);
  });
});

describe("동시 6건 번호 경합(CROSS E-2)", () => {
  it(
    "동시 6건 — 풀 밖 잠금이 풀 전체를 막아도 풀린 뒤 10초 안에 서로 다른 번호 6개로 끝난다(교착 없음)",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeLessThan(6);
      expect(poolMax).toBeGreaterThanOrEqual(2);
      const fx = await purchaseProject();
      // 사전 조회(트랜잭션 밖)는 전부 먼저 끝낸다 — 몸통 안에서는 풀을 더 쓰지 않는다.
      const input = requestInput(fx.onlineLine, 11_000);
      const pres = await Promise.all(Array.from({ length: 6 }, () => precheckPurchaseRequest(fx.pm, input)));

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: ReturnType<typeof createPurchaseRequest>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        // 몸통의 첫 잠금이 프로젝트 행이다(X-2) — 그 행을 먼저 쥔다.
        await lockClient.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);

        calls = pres.map((pre) => createPurchaseRequest(fx.pm, input, pre));

        let waitingCount = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
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
        expect(waitingCount, `풀 커넥션 ${poolMax}개가 모두 프로젝트 행 잠금을 기다리는 상태에 도달하지 못했다(관측: ${waitingCount})`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;

        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("구매 요청 6건 동시 호출이 10초 안에 끝나지 않았다(교착)")), 10_000);
        });
        const results = await Promise.race([Promise.all(calls), timeout]);
        clearTimeout(timeoutId);

        const numbers = results.map((result) => result.number);
        expect(new Set(numbers).size).toBe(6);
        for (const number of numbers) expect(number).toMatch(new RegExp(`^${fx.projectNumber}-C\\d{4}$`));
        expect(await requestCount()).toBe(6);
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    20_000,
  );
});

describe("링크 스킴 · 결번 없음 · 같은 tx 로그", () => {
  it("링크 `javascript:alert(1)` → 서버 거부(precheck) · 요청 0", async () => {
    const fx = await purchaseProject();
    const input = { ...requestInput(fx.onlineLine), linkUrl: "javascript:alert(1)" };
    await expect(precheckPurchaseRequest(fx.pm, input)).rejects.toThrow("링크 형식 오류 · https://로 시작하는 주소");
    expect(await requestCount()).toBe(0);
  });

  it("DB에 직접 넣으면 `purchase_requests_link_url_check` 위반", async () => {
    const fx = await purchaseProject();
    const insert = db.insert(purchaseRequests).values({
      number: `${fx.projectNumber}-C9999`,
      linkKind: "quote_line",
      projectId: fx.projectId,
      quoteLineId: fx.onlineLine,
      requestedBy: fx.pm.id,
      itemName: "현수막",
      linkUrl: "javascript:alert(1)",
      estimateAmountKrw: 110_000,
    });
    const error = (await caught(insert)) as { cause?: { constraint?: string }; message: string };
    expect(error.cause?.constraint ?? error.message).toContain("purchase_requests_link_url_check");
  });

  it("요청 INSERT가 실패하면 카운터도 오르지 않는다 — 요청 0 · 로그 0줄 · 다음 요청이 같은 번호(결번 없음)", async () => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    const logsBefore = await createLogCount();
    // precheck를 건너뛴 값(스킴 위반 링크)을 실어 INSERT만 DB CHECK에서 실패시킨다.
    await expect(createPurchaseRequest(fx.pm, input, { ...pre, linkUrl: "javascript:alert(1)" })).rejects.toThrow();
    expect(await requestCount()).toBe(0);
    expect(await counterValue(fx.projectNumber)).toBe(0);
    expect(await createLogCount()).toBe(logsBefore);

    const created = await createPurchaseRequest(fx.pm, input, pre);
    expect(created.number).toBe(`${fx.projectNumber}-C0001`);
    expect(await createLogCount()).toBe(logsBefore + 1);
  });
});


// ── 목록 범위(구매 요청 목록 — 범위는 리포지토리 쿼리 조건) ───────────────────────

describe("구매 요청 목록 범위", () => {
  async function person(name: string, roleId: string): Promise<Awaited<ReturnType<typeof makePerson>>> {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `목록본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `목록팀-${randomUUID()}` });
    return makePerson(name, roleId, team.name);
  }

  async function ids(viewer: Awaited<ReturnType<typeof makePerson>>): Promise<string[]> {
    const list = await listPurchaseRequests(viewer, { status: "all" }, seoulToday());
    return list.rows.flatMap((row) => (row.id ? [row.id] : []));
  }

  // 다른 사람이 신청한 요청 — 신청 권한 경로를 거치지 않고 행으로 만든다(범위 쿼리만 본다).
  async function requestBy(requester: { id: string }, fx: PurchaseFx): Promise<string> {
    const [row] = await db
      .insert(purchaseRequests)
      .values({ number: `${fx.projectNumber}-C${randomUUID().slice(0, 6)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: fx.onlineLine, requestedBy: requester.id, itemName: "남의 물건", estimateAmountKrw: 11_000 })
      .returning({ id: purchaseRequests.id });
    if (!row) throw new Error("구매 요청 없음");
    return row.id;
  }

  it("요청자 → 자기 요청 + 자기가 담당 PM인 프로젝트의 요청 · 남의 프로젝트의 남의 요청은 없음", async () => {
    const fx1 = await purchaseProject();
    const fx2 = await purchaseProject();
    const own1 = (await request(fx1, fx1.onlineLine)).id;
    const own2 = (await request(fx2, fx2.onlineLine)).id;
    const other = await person("다른요청자", DEFAULT_ROLE_ID);
    const otherOnProject1 = await requestBy(other, fx1);

    const pm1 = await ids(fx1.pm);
    expect(pm1).toEqual(expect.arrayContaining([own1, otherOnProject1]));
    expect(pm1).not.toContain(own2);
    const pm2 = await ids(fx2.pm);
    expect(pm2).toContain(own2);
    expect(pm2).not.toContain(own1);
    const outsider = await ids(other);
    expect(outsider).toContain(otherOnProject1);
    expect(outsider).not.toContain(own1);
    expect(outsider).not.toContain(own2);
  });

  it("`cards.purchases` write 계급 · 전사 범위(대표) → 전부 · privileged 표시 / 그 밖 직원 → 남의 요청 없음", async () => {
    const fx = await purchaseProject();
    const created = (await request(fx, fx.onlineLine)).id;
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `구매담당-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
    for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const purchaser = await person("구매담당", role.id);
    const ceo = await person("목록대표", "role-ceo");
    const staff = await person("목록직원", DEFAULT_ROLE_ID);

    expect(await ids(purchaser)).toContain(created);
    expect(await ids(ceo)).toContain(created);
    expect(await ids(staff)).not.toContain(created);
    expect((await listPurchaseRequests(purchaser, { status: "all" }, seoulToday())).privileged).toBe(true);
    expect((await listPurchaseRequests(staff, { status: "all" }, seoulToday())).anyInScope).toBe(false);
  });

  it("상태 보기 — 기본 `신청됨`은 취소된 요청을 빼고 `전체`는 넣는다 · 월 필터는 요청일 달", async () => {
    const fx = await purchaseProject();
    const open = (await request(fx, fx.onlineLine)).id;
    const cancelled = (await request(fx, fx.onlineLine)).id;
    await cancelRequest(fx, cancelled);
    const today = seoulToday();
    const requested = await listPurchaseRequests(fx.pm, { status: "requested" }, today);
    expect(requested.rows.map((row) => row.id)).toEqual([open]);
    expect((await listPurchaseRequests(fx.pm, { status: "all" }, today)).rows.map((row) => row.id)).toEqual(expect.arrayContaining([open, cancelled]));
    expect((await listPurchaseRequests(fx.pm, { status: "all", month: today.slice(0, 7) }, today)).rows).toHaveLength(2);
    expect((await listPurchaseRequests(fx.pm, { status: "all", month: "2020-01" }, today)).rows).toHaveLength(0);
  });
});

// 06-08 검토 I-2 — 잠금 뒤 줄 판정(현재 차수 밖 · 조정 · 취소 · 보관)과 서버 권한 문(projects view)을 지킨다.
describe("잠금 뒤 줄 판정 · 서버 권한 문", () => {
  it("[M7] 차수 2가 생긴 뒤 차수 1 줄 id로 신청 → `연결 없음 · 연결 고르기` · 요청 0 · 카운터 그대로", async () => {
    const fx = await purchaseProject();
    await nextRevision(fx);
    const input = requestInput(fx.onlineLine);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    const error = await caught(createPurchaseRequest(fx.pm, input, pre));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe("연결 없음 · 연결 고르기");
    expect(await requestCount()).toBe(0);
    expect(await counterValue(fx.projectNumber)).toBe(0);
  });

  it.each([
    ["조정 줄", { lineKind: "adjustment" }],
    ["취소 줄", { lineStatus: "cancelled" }],
    ["보관 줄", { archivedAt: new Date() }],
  ] as const)("[M9] %s → `연결 없음 · 연결 고르기` · 요청 0 · 카운터 그대로", async (_label, change) => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    await db.update(quoteLines).set(change).where(eq(quoteLines.id, fx.onlineLine));
    const error = await caught(createPurchaseRequest(fx.pm, input, pre));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe("연결 없음 · 연결 고르기");
    expect(await requestCount()).toBe(0);
    expect(await counterValue(fx.projectNumber)).toBe(0);
  });

  it("[M12] `projects` view 없는 계급 → precheck가 ForbiddenError `프로젝트 보기 권한 없음` · 요청 0", async () => {
    const fx = await purchaseProject();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `보기없음-${randomUUID().slice(0, 8)}`, workScope: "team" });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `권한본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `권한팀-${randomUUID()}` });
    const outsider = await makePerson("보기없음", role.id, team.name);
    const error = await caught(precheckPurchaseRequest(outsider, requestInput(fx.onlineLine)));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe("프로젝트 보기 권한 없음");
    expect(await requestCount()).toBe(0);
  });
});

// ── 06-12 구매 완료(EXP-10 · OPS-09 · R-3 · N-3) ─────────────────────────────────

// 구매 권한자(`cards.purchases` write) — 견적 금액 · 카드 사용 · 구매 요청 값을 본다. 팀은 요청자와 다른 새 팀.
async function purchaser(name = "구매담당", hidden: string[] = [], alsoProxy = false): Promise<Awaited<ReturnType<typeof makePerson>>> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `구매처리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  if (alsoProxy) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    if (!hidden.includes(infoItem)) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `처리본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `처리팀-${randomUUID()}` });
  return makePerson(name, role.id, team.name);
}

// 공용 카드 — 구매 권한자는 활성 카드 전부를 쓴다(Q5).
async function sharedCard(): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "공용 카드", kind: "shared" });
  if (!card.id) throw new Error("카드 id 없음");
  return card.id;
}

async function requestVersion(requestId: string): Promise<number> {
  const [row] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  return row?.version ?? 0;
}

// 증빙 `계산서`(규칙 없음 — 공급가 = 결제 합계)로 결제 합계 `totalKrw`.
async function completionInput(requestId: string, cardId: string, totalKrw = 110_000, usedOn = seoulToday()): Promise<PurchaseCompletionInput> {
  return {
    requestId,
    version: await requestVersion(requestId),
    corpCardId: cardId,
    usedOn,
    merchantVendorId: null,
    total: { currency: "KRW", amount: totalKrw, fxRate: 1 },
    evidenceTypeCode: "invoice",
    memo: null,
  };
}

async function complete(viewer: Awaited<ReturnType<typeof makePerson>>, input: PurchaseCompletionInput) {
  return completePurchaseRequest(viewer, input, await precheckPurchaseCompletion(viewer, input));
}

async function usagesOf(requestId: string) {
  return db.select().from(corpCardUsages).where(eq(corpCardUsages.purchaseRequestId, requestId));
}

async function statusOf(requestId: string) {
  const [row] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  return row;
}

async function processLogs(requestId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.entityId, requestId), eq(actionLog.actionType, "purchase_process")));
}

describe("completePurchaseRequest — 트레이서(06-12)", () => {
  it("견적 줄 요청 → 카드 사용 1(purchase · 요청 id · 사용한 사람 = 요청자 · 등록자 = 처리자) + 요청 구매 완료 + 같은 tx `purchase_process` · `document_create`", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const cardId = await sharedCard();

    const done = await complete(buyer, await completionInput(created.id, cardId));

    const usages = await usagesOf(created.id);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      id: done.usageId,
      registeredVia: "purchase",
      purchaseRequestId: created.id,
      usedByUserId: fx.pm.id,
      registeredBy: buyer.id,
      corpCardId: cardId,
      linkKind: "quote_line",
      quoteLineId: fx.onlineLine,
      totalAmountKrw: 110_000,
    });
    const row = await statusOf(created.id);
    expect(row).toMatchObject({ status: "purchased", completedBy: buyer.id });
    expect(row?.completedAt).toBeInstanceOf(Date);
    expect(await processLogs(created.id)).toHaveLength(1);
    const usageLogs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, done.usageId), eq(actionLog.actionType, "document_create")));
    expect(usageLogs).toHaveLength(1);
  });

  it("구매 권한 없음 → precheck가 ForbiddenError · 요청 `신청됨` 그대로 · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const cardId = await sharedCard();
    const error = await caught(precheckPurchaseCompletion(fx.pm, await completionInput(created.id, cardId)));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((await statusOf(created.id))?.status).toBe("requested");
    expect(await usagesOf(created.id)).toHaveLength(0);
  });

  it("카드 사용 INSERT가 실패하면 요청은 `신청됨` · 카드 사용 0 · 로그 0줄(같은 tx)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const input = await completionInput(created.id, await sharedCard());
    const pre = await precheckPurchaseCompletion(buyer, input);
    const usageCreateLogs = async () =>
      (await db.select({ seq: actionLog.seq }).from(actionLog).where(and(eq(actionLog.entity, "corp_card_usage"), eq(actionLog.actionType, "document_create")))).length;
    const before = await usageCreateLogs();
    // 없는 카드 id(FK 위반)를 실어 카드 사용 INSERT만 DB에서 실패시킨다.
    await expect(completePurchaseRequest(buyer, input, { ...pre, card: { ...pre.card, card: { ...pre.card.card, id: randomUUID() } } })).rejects.toThrow();
    expect((await statusOf(created.id))?.status).toBe("requested");
    expect(await usagesOf(created.id)).toHaveLength(0);
    expect(await processLogs(created.id)).toHaveLength(0);
    expect(await usageCreateLogs()).toBe(before);
  });
});

describe("[06-12 검토 I-1] 처리한 행 제자리(`keepId`)", () => {
  it("전사 범위 `전체` 보기(조건 없음) + keepId → 처리한 행 하나로 줄지 않고 다른 요청도 남는다", async () => {
    const fx = await purchaseProject();
    const other = (await request(fx, fx.onlineLine)).id;
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    await complete(buyer, await completionInput(created.id, await sharedCard()));
    const kept = await listPurchaseRequests(buyer, { status: "all", keepId: created.id }, seoulToday());
    expect(kept.rows.map((row) => row.id)).toEqual(expect.arrayContaining([created.id, other]));
  });
});

// ── 06-12 Task 2 — 경합 · 상태 · Q3 고정 갈래 · 완료 프로젝트 · 팀 비용 ─────────────────

// 팀 비용 요청(06-27 표에 직접 — 신청 화면 갈래는 06-08 범위 밖). 요청자 = `requestedBy`.
async function teamCostRequest(requestedBy: string, estimateKrw = 110_000): Promise<string> {
  const [row] = await db
    .insert(purchaseRequests)
    .values({
      number: `T-${randomUUID().slice(0, 12)}`,
      linkKind: "team_cost",
      requestedBy,
      itemName: "팀 비품",
      estimateCurrency: "KRW",
      estimateForeignAmount: null,
      estimateFxRate: "1",
      estimateAmountKrw: estimateKrw,
    })
    .returning({ id: purchaseRequests.id });
  if (!row) throw new Error("팀 비용 요청 없음");
  return row.id;
}

async function teamCostRequester(): Promise<{ viewer: Awaited<ReturnType<typeof makePerson>>; teamId: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `요청본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `요청팀-${randomUUID()}` });
  return { viewer: await makePerson("김요청", DEFAULT_ROLE_ID, team.name), teamId: team.id };
}

function tomorrow(): string {
  const date = new Date(`${seoulToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const PM_CAP = (remaining: string) => `실행가 초과 · 남은 실행가 ${remaining} · 견적 줄은 담당 PM 박서연`;

describe("구매 완료 동시 6건(06-12)", () => {
  it(
    "구매 완료 동시 6건 — 풀 밖 잠금이 견적 줄 행을 쥐어 풀 전체가 기다려도 풀린 뒤 10초 안에 끝나고 성공 1 · `이미 구매 완료` 5 · 카드 사용 1",
    async () => {
      const poolMax = pool.options.max ?? 0;
      expect(poolMax).toBeLessThan(6);
      expect(poolMax).toBeGreaterThanOrEqual(2);
      const fx = await purchaseProject();
      const created = await request(fx, fx.onlineLine);
      const buyer = await purchaser();
      const input = await completionInput(created.id, await sharedCard());
      // 사전 조회(트랜잭션 밖)는 전부 먼저 끝낸다.
      const pres = await Promise.all(Array.from({ length: 6 }, () => precheckPurchaseCompletion(buyer, input)));

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: ReturnType<typeof completePurchaseRequest>[] = [];
      let txOpen = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        if (lockPid === undefined) throw new Error("lockClient의 pg_backend_pid()를 읽지 못했다");
        await lockClient.query("SELECT id FROM quote_lines WHERE id = $1 FOR UPDATE", [fx.onlineLine]);

        calls = pres.map((pre) => completePurchaseRequest(buyer, input, pre));

        let waitingCount = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
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
        expect(waitingCount, `풀 커넥션 ${poolMax}개가 모두 견적 줄 잠금을 기다리는 상태에 도달하지 못했다(관측: ${waitingCount})`).toBeGreaterThanOrEqual(poolMax);

        await lockClient.query("COMMIT");
        txOpen = false;

        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("구매 완료 6건 동시 호출이 10초 안에 끝나지 않았다(교착)")), 10_000);
        });
        const results = await Promise.race([Promise.allSettled(calls), timeout]);
        clearTimeout(timeoutId);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const messages = results.flatMap((result) => (result.status === "rejected" ? [(result.reason as Error).message] : []));
        expect(messages).toEqual(Array.from({ length: 5 }, () => "이미 구매 완료 · 새로 고침"));
        expect(await usagesOf(created.id)).toHaveLength(1);
        expect((await statusOf(created.id))?.status).toBe("purchased");
      } finally {
        clearTimeout(timeoutId);
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    20_000,
  );
});

describe("구매 완료 — 상태 · 실행가 상한(Q3 고정 갈래) · 차이", () => {
  it("취소된 요청 → `구매 요청 취소됨 · 새로 고침` · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelRequest(fx, created.id);
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(created.id, await sharedCard())));
    expect((error as Error).message).toBe("구매 요청 취소됨 · 새로 고침");
    expect(await usagesOf(created.id)).toHaveLength(0);
  });

  it("이미 구매 완료한 요청 → `이미 구매 완료 · 새로 고침` · 카드 사용 1 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const cardId = await sharedCard();
    await complete(buyer, await completionInput(created.id, cardId));
    const error = await caught(complete(buyer, await completionInput(created.id, cardId)));
    expect((error as Error).message).toBe("이미 구매 완료 · 새로 고침");
    expect(await usagesOf(created.id)).toHaveLength(1);
  });

  it("Q3 — 실행가 1,000,000 · 다른 카드 600,000 → 공급가 400,001 거부(담당 PM 갈래) · 400,000 성공(자기 예상 공급가는 빼지 않음)", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 440_000);
    const buyer = await purchaser();
    const cardId = await sharedCard();
    const error = await caught(complete(buyer, await completionInput(created.id, cardId, 400_001)));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(PM_CAP("400,000"));
    expect((await statusOf(created.id))?.status).toBe("requested");
    await complete(buyer, await completionInput(created.id, cardId, 400_000));
    expect((await statusOf(created.id))?.status).toBe("purchased");
  });

  it("Q3 — 같은 줄 다른 `신청됨` 요청(예상 공급가 300,000)이 있으면 100,001 거부 · 100,000 성공", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 11_000);
    await request(fx, fx.onlineLine, 330_000);
    const buyer = await purchaser();
    const cardId = await sharedCard();
    const error = await caught(complete(buyer, await completionInput(created.id, cardId, 100_001)));
    expect((error as Error).message).toBe(PM_CAP("100,000"));
    await complete(buyer, await completionInput(created.id, cardId, 100_000));
    expect(await usagesOf(created.id)).toHaveLength(1);
  });

  it("예상 금액(110,000)과 결제 합계(99,000)가 달라도 상한 안이면 성공 · 차이 -11,000", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const input = await completionInput(created.id, await sharedCard(), 99_000);
    const pre = await precheckPurchaseCompletion(buyer, input);
    expect(pre.diffKrw).toBe(-11_000);
    const done = await completePurchaseRequest(buyer, input, pre);
    expect(done.totalKrw).toBe(99_000);
  });

  it("사용일 내일 → 거부(Q6) · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(created.id, await sharedCard(), 110_000, tomorrow())));
    expect(error).toBeInstanceOf(Error);
    expect(await usagesOf(created.id)).toHaveLength(0);
    expect((await statusOf(created.id))?.status).toBe("requested");
  });
});

describe("구매 완료 — 완료 프로젝트(U-4 · Q-E) · 경합(X-2) · 계보(X-1 · N-1 · N-2)", () => {
  it("[U-4] 신청 뒤 프로젝트 완료 → 구매 완료 성공 · 같은 프로젝트 새 구매 요청은 `CompletedProjectError`", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await setStatus(fx.projectId, "completed");
    const buyer = await purchaser();
    await complete(buyer, await completionInput(created.id, await sharedCard()));
    expect(await usagesOf(created.id)).toHaveLength(1);
    expect(await caught(request(fx, fx.onlineLine))).toBeInstanceOf(CompletedProjectError);
  });

  it("[Q-E] 완료 프로젝트 · 다른 카드 600,000 · 결제 공급가 438,000 → 성공 · capOver 38,000 · 로그 상세 `실행가 초과 38,000`", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 11_000);
    await setStatus(fx.projectId, "completed");
    const buyer = await purchaser();
    const done = await complete(buyer, await completionInput(created.id, await sharedCard(), 438_000));
    expect(done.capOver).toBe(38_000);
    expect(await usagesOf(created.id)).toHaveLength(1);
    const logs = await processLogs(created.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ capOverKrw: 38_000, summary: "실행가 초과 38,000" });
  });

  it("[Q-E] 같은 금액이라도 `settling`이면 Q3대로 거부 · 요청 `신청됨`", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 11_000);
    await setStatus(fx.projectId, "settling");
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(created.id, await sharedCard(), 438_000)));
    expect((error as Error).message).toBe(PM_CAP("400,000"));
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("[Q-E] 완료 프로젝트 · 상한 안 → 성공 · capOver null · 로그에 초과 없음", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await setStatus(fx.projectId, "completed");
    const buyer = await purchaser();
    const done = await complete(buyer, await completionInput(created.id, await sharedCard()));
    expect(done.capOver).toBeNull();
    const [log] = await processLogs(created.id);
    expect(log?.detail).not.toHaveProperty("capOverKrw");
    expect(JSON.stringify(log?.detail)).not.toContain("실행가 초과");
  });

  it("[X-2] 사전 조회 뒤 풀 밖 연결이 프로젝트 행을 잡고 `completed`로 커밋 → 잠근 행 기준 settled · 438,000 성공 · capOver 38,000", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 11_000);
    await setStatus(fx.projectId, "settling");
    const buyer = await purchaser();
    const input = await completionInput(created.id, await sharedCard(), 438_000);
    const pre = await precheckPurchaseCompletion(buyer, input);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await client.query("UPDATE projects SET status = 'completed' WHERE id = $1", [fx.projectId]);
      const completing = completePurchaseRequest(buyer, input, pre);
      await waitForLockWaiter(pool);
      await client.query("COMMIT");
      expect((await completing).capOver).toBe(38_000);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    expect(await usagesOf(created.id)).toHaveLength(1);
  });

  it("[X-1] 차수 1 줄 L1의 요청 → 새 차수(L1 → L2) → 구매 완료 → 카드 사용은 L1에 서고 `findLineLinks([L2])`에 든다", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    const buyer = await purchaser();
    const done = await complete(buyer, await completionInput(created.id, await sharedCard()));
    const [usage] = await usagesOf(created.id);
    expect(usage?.quoteLineId).toBe(fx.onlineLine);
    const links = (await findLineLinks(SYSTEM_VIEWER, [l2])).get(l2);
    expect(links?.cardUsages.map((link) => link.id)).toContain(done.usageId);
  });

  it("[N-1] 새 차수에서 L2 실행가를 1,500,000으로 올리면 L1 요청(예상 공급가 900,000)의 결제 공급가 1,200,000 성공", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine, 990_000);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ executionAmountKrw: 1_500_000 }).where(eq(quoteLines.id, l2));
    const buyer = await purchaser();
    await complete(buyer, await completionInput(created.id, await sharedCard(), 1_200_000));
    expect((await statusOf(created.id))?.status).toBe("purchased");
  });

  it("[N-1] L2 실행가를 800,000으로 내리면 결제 공급가 800,001 → `남은 실행가 800,000` 거부 · 요청 `신청됨`", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine, 990_000);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ executionAmountKrw: 800_000 }).where(eq(quoteLines.id, l2));
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(created.id, await sharedCard(), 800_001)));
    expect((error as Error).message).toBe(PM_CAP("800,000"));
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("[N-2] 현재 줄 L2가 보관되면 `견적 줄 빠짐 · 새로 고침` · 요청 `신청됨` · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ archivedAt: new Date() }).where(eq(quoteLines.id, l2));
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(created.id, await sharedCard())));
    expect((error as Error).message).toBe("견적 줄 빠짐 · 새로 고침");
    expect((await statusOf(created.id))?.status).toBe("requested");
    expect(await usagesOf(created.id)).toHaveLength(0);
  });
});

describe("구매 완료 — 팀 비용 귀속(O-19) · 요청자 = 처리자(O-20)", () => {
  it("팀 비용 — 팀 = 요청자의 사용일 소속(처리자 팀 · 카드 팀 아님) · 상한 없음", async () => {
    const requester = await teamCostRequester();
    const requestId = await teamCostRequest(requester.viewer.id);
    const buyer = await purchaser();
    await complete(buyer, await completionInput(requestId, await sharedCard(), 50_000_000));
    const [usage] = await usagesOf(requestId);
    expect(usage).toMatchObject({ linkKind: "team_cost", teamId: requester.teamId, usedByUserId: requester.viewer.id, registeredBy: buyer.id });
  });

  it("팀 비용 — 요청자 사용일 소속 없음 → `요청자 {이름} {MM-DD} 소속 없음 · 소속 발령은 관리자`", async () => {
    const requester = await makePerson("이무소속", DEFAULT_ROLE_ID, null);
    const requestId = await teamCostRequest(requester.id);
    const buyer = await purchaser();
    const error = await caught(complete(buyer, await completionInput(requestId, await sharedCard())));
    expect((error as Error).message).toBe(`요청자 이무소속 ${seoulToday().slice(5)} 소속 없음 · 소속 발령은 관리자`);
    expect(await usagesOf(requestId)).toHaveLength(0);
  });

  it("[O-20] 요청자 = 처리자(구매 권한자 자신의 요청) → 성공", async () => {
    const buyer = await purchaser();
    const requestId = await teamCostRequest(buyer.id);
    await complete(buyer, await completionInput(requestId, await sharedCard()));
    const [usage] = await usagesOf(requestId);
    expect(usage).toMatchObject({ usedByUserId: buyer.id, registeredBy: buyer.id });
  });
});

// ── 06-12 Task 3 — 구매 완료로 생긴 건의 카드 고치기(S9 수정) ─────────────────────

// 구매 완료 한 건 — 처리자(등록자) · 그 카드 · 카드 사용 id.
async function purchasedUsage(): Promise<{ fx: PurchaseFx; buyer: Awaited<ReturnType<typeof makePerson>>; usageId: string; cardId: string }> {
  const fx = await purchaseProject();
  const created = await request(fx, fx.onlineLine);
  const buyer = await purchaser();
  const cardId = await sharedCard();
  const done = await complete(buyer, await completionInput(created.id, cardId));
  return { fx, buyer, usageId: done.usageId, cardId };
}

async function cardUpdateInput(usageId: string, patch: Partial<CardUsageUpdateInput>): Promise<CardUsageUpdateInput> {
  const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
  if (!row?.quoteLineId) throw new Error("카드 사용 없음");
  return {
    id: row.id,
    version: row.version,
    corpCardId: row.corpCardId,
    usedOn: row.usedOn,
    merchantVendorId: row.merchantVendorId,
    total: { currency: "KRW", amount: row.totalAmountKrw, fxRate: 1 },
    evidenceTypeCode: row.evidenceTypeCode,
    linkKind: "quote_line",
    lineId: row.quoteLineId,
    memo: row.memo,
    ...patch,
  } as CardUsageUpdateInput;
}

async function updateUsage(viewer: Awaited<ReturnType<typeof makePerson>>, input: CardUsageUpdateInput) {
  return updateCardUsage(viewer, input, await precheckCardUsageUpdate(viewer, input));
}

// 대리 등록 권한자(`cards.proxy` write) — 구매 권한은 없다(O-11 권리는 있음).
async function proxyOnly(): Promise<Awaited<ReturnType<typeof makePerson>>> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `대리본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `대리팀-${randomUUID()}` });
  return makePerson("대리", role.id, team.name);
}

async function cardText(cardId: string): Promise<string> {
  const [row] = await db.execute<{ label: string; issuer: string; number_last4: string }>(sql`SELECT label, issuer, number_last4 FROM corp_cards WHERE id = ${cardId}`).then((result) => result.rows);
  if (!row) throw new Error("카드 없음");
  return `${row.label} · ${row.issuer} ${row.number_last4}`;
}

describe("카드 고치기", () => {
  it("권리 + 구매 권한 + 활성 새 카드 → 카드만 바뀌고 `document_update` 요약 `카드 고침 · {이전} → {새}` 한 줄 · 등록 · 연결 · 팀 그대로", async () => {
    const { fx, buyer, usageId, cardId } = await purchasedUsage();
    const next = await sharedCard();
    const [before] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    await updateUsage(buyer, await cardUpdateInput(usageId, { corpCardId: next }));
    const [after] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(after).toMatchObject({
      corpCardId: next,
      registeredVia: "purchase",
      registeredBy: before?.registeredBy,
      usedByUserId: fx.pm.id,
      quoteLineId: before?.quoteLineId,
      teamId: before?.teamId ?? null,
      purchaseRequestId: before?.purchaseRequestId,
    });
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, usageId), eq(actionLog.actionType, "document_update")));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ summary: `카드 고침 · ${await cardText(cardId)} → ${await cardText(next)}` });
  });

  it("권리 있음(대리 등록 권한자) · 구매 권한 없음 → 카드 고침 거부 · 카드 그대로", async () => {
    const { usageId, cardId } = await purchasedUsage();
    const editor = await proxyOnly();
    const error = await caught(updateUsage(editor, await cardUpdateInput(usageId, { corpCardId: await sharedCard() })));
    expect(error).toBeInstanceOf(ForbiddenError);
    const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(row?.corpCardId).toBe(cardId);
  });

  it("새 카드가 비활성 → 거부", async () => {
    const { buyer, usageId } = await purchasedUsage();
    const next = await sharedCard();
    await setCorpCardActive(SYSTEM_VIEWER, next, false);
    expect(await caught(updateUsage(buyer, await cardUpdateInput(usageId, { corpCardId: next })))).toBeInstanceOf(ForbiddenError);
  });

  it("구매 완료 건이 아닌 건의 카드 변경 → 거부(06-09 그대로)", async () => {
    const fx = await purchaseProject();
    const usageId = await cardOnLine(fx, fx.onlineLine, 100_000);
    expect(await caught(updateUsage(fx.pm, await cardUpdateInput(usageId, { corpCardId: await sharedCard() })))).toBeInstanceOf(ForbiddenError);
  });

  it("구매 완료 건의 연결 변경 · 삭제 → ForbiddenError", async () => {
    const { fx, buyer, usageId } = await purchasedUsage();
    expect(await caught(updateUsage(buyer, await cardUpdateInput(usageId, { lineId: fx.otherLine })))).toBeInstanceOf(ForbiddenError);
    expect(await caught(precheckCardUsageRemoval(buyer, { id: usageId }))).toBeInstanceOf(ForbiddenError);
  });

  it("loadCardUsageForEdit — 구매 완료 건 + 구매 권한 = 활성 카드 옵션(저장된 카드가 비활성이면 맨 앞) / 구매 권한 없음 = 옵션 없음", async () => {
    const { buyer, usageId, cardId } = await purchasedUsage();
    const forBuyer = await loadCardUsageForEdit(buyer, usageId);
    expect(forBuyer?.cardOptions?.map((card) => card.id)).toContain(cardId);
    await setCorpCardActive(SYSTEM_VIEWER, cardId, false);
    const afterInactive = await loadCardUsageForEdit(buyer, usageId);
    expect(afterInactive?.cardOptions?.[0]?.id).toBe(cardId);
    const forProxy = await loadCardUsageForEdit(await proxyOnly(), usageId);
    expect(forProxy?.cardOptions ?? null).toBeNull();
  });
});

// ── 06-12 검토 I-3 — 보호를 빼면 빨개지는 케이스(요청 행 잠금 · 비활성 카드 · 금액 숨김 · 비구매 건 카드) ─────────

describe("[06-12 검토 I-3] 구매 완료 · 카드 고치기 보호", () => {
  it(
    "팀 비용 요청 동시 2건 — 요청 행 잠금이 직렬화: 성공 1 · `이미 구매 완료 · 새로 고침` 1 · 카드 사용 1",
    async () => {
      const requester = await teamCostRequester();
      const requestId = await teamCostRequest(requester.viewer.id);
      const buyer = await purchaser();
      const input = await completionInput(requestId, await sharedCard());
      const pres = await Promise.all([precheckPurchaseCompletion(buyer, input), precheckPurchaseCompletion(buyer, input)]);
      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let calls: ReturnType<typeof completePurchaseRequest>[] = [];
      let txOpen = false;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        await lockClient.query("SELECT id FROM purchase_requests WHERE id = $1 FOR UPDATE", [requestId]);
        calls = pres.map((pre) => completePurchaseRequest(buyer, input, pre));
        let waiting = 0;
        for (let attempt = 0; attempt < 40 && waiting < 2; attempt++) {
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
          if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(waiting).toBeGreaterThanOrEqual(2);
        await lockClient.query("COMMIT");
        txOpen = false;
        const results = await Promise.allSettled(calls);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.flatMap((result) => (result.status === "rejected" ? [(result.reason as Error).message] : []))).toEqual(["이미 구매 완료 · 새로 고침"]);
        expect(await usagesOf(requestId)).toHaveLength(1);
      } finally {
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        await Promise.allSettled(calls);
      }
    },
    20_000,
  );

  it("비활성 카드로 구매 완료 → ForbiddenError · 요청 `신청됨` · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const cardId = await sharedCard();
    await setCorpCardActive(SYSTEM_VIEWER, cardId, false);
    expect(await caught(precheckPurchaseCompletion(buyer, await completionInput(created.id, cardId)))).toBeInstanceOf(ForbiddenError);
    expect((await statusOf(created.id))?.status).toBe("requested");
    expect(await usagesOf(created.id)).toHaveLength(0);
  });

  it("견적 금액(quote.amount) 숨김 구매 권한자 — 거부 문구 · 미리보기에 남은 실행가 없음 · 완료 프로젝트 초과액 null", async () => {
    const fx = await purchaseProject();
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const created = await request(fx, fx.onlineLine, 11_000);
    const buyer = await purchaser("금액숨김", ["quote.amount"]);
    const blocked = "실행가 초과 · 견적 줄은 담당 PM 박서연";
    expect(((await caught(complete(buyer, await completionInput(created.id, await sharedCard(), 438_000)))) as Error).message).toBe(blocked);
    const preview = { requestId: created.id, usedOn: seoulToday(), total: { currency: "KRW" as const, amount: 438_000, fxRate: 1 }, evidenceTypeCode: "invoice" };
    expect((await previewPurchaseCompletion(buyer, preview)).cap).toEqual({ blockedReason: blocked, overKrw: null });

    await setStatus(fx.projectId, "completed");
    expect((await previewPurchaseCompletion(buyer, preview)).cap).toEqual({ blockedReason: null, overKrw: null });
    const pre = await precheckPurchaseCompletion(buyer, await completionInput(created.id, await sharedCard(), 438_000));
    expect(pre.card.amountVisible).toBe(false);
  });

  it("구매 권한 + 대리 등록 권리 보유자도 구매 완료 건이 아닌 건의 카드는 못 바꾼다 → ForbiddenError · 카드 그대로", async () => {
    const fx = await purchaseProject();
    const usageId = await cardOnLine(fx, fx.onlineLine, 100_000);
    const [before] = await db.select({ corpCardId: corpCardUsages.corpCardId }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    const editor = await purchaser("구매대리", [], true);
    expect(await caught(updateUsage(editor, await cardUpdateInput(usageId, { corpCardId: await sharedCard() })))).toBeInstanceOf(ForbiddenError);
    const [after] = await db.select({ corpCardId: corpCardUsages.corpCardId }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(after?.corpCardId).toBe(before?.corpCardId);
  });
});


// ── 06-14 Task 1 — 팀 비용 요청 · 외화 예상 금액 ─────────────────────────────────

const TEAM_COUNTER_KEY = "purchase_request_team";

function teamInput(patch: { estimate?: PurchaseRequestInput["estimate"]; itemName?: string } = {}): PurchaseRequestInput {
  return { linkKind: "team_cost", itemName: patch.itemName ?? "팀 간식", linkUrl: null, estimate: patch.estimate ?? { currency: "KRW", amount: 55_000, fxRate: 1 }, memo: null };
}

async function teamRequestBy(viewer: Viewer, input: PurchaseRequestInput = teamInput()): Promise<{ id: string; number: string }> {
  return createPurchaseRequest(viewer, input, await precheckPurchaseRequest(viewer, input));
}

async function teamCounter(): Promise<number> {
  const [row] = await db
    .select({ value: documentCounters.value })
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, TEAM_COUNTER_KEY), eq(documentCounters.period, seoulToday().slice(0, 4))));
  return row?.value ?? 0;
}

describe("팀 비용 요청(06-14 — EXP-10 · O-19)", () => {
  it("오늘 소속 있음 → 저장(`team_cost` · 프로젝트 · 줄 없음 · 팀 칸 없음) + 번호 `TC{YY}-{4자리}` + 같은 tx `document_create` 한 줄", async () => {
    const requester = await teamCostRequester();
    const created = await teamRequestBy(requester.viewer);

    expect(created.number).toMatch(new RegExp(`^TC${seoulToday().slice(2, 4)}-\\d{4}$`));
    const row = await statusOf(created.id);
    expect(row).toMatchObject({ number: created.number, linkKind: "team_cost", projectId: null, quoteLineId: null, requestedBy: requester.viewer.id, itemName: "팀 간식", estimateAmountKrw: 55_000, status: "requested" });
    expect(Object.keys(row ?? {})).not.toContain("teamId");
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, created.id), eq(actionLog.actionType, "document_create")));
    expect(logs).toHaveLength(1);
  });

  it("같은 해 둘째 팀 비용 요청 → 번호 순번 +1(카운터 `purchase_request_team` · 기간 = 연도)", async () => {
    const requester = await teamCostRequester();
    const first = await teamRequestBy(requester.viewer);
    const second = await teamRequestBy(requester.viewer);
    const seq = (number: string) => Number(number.split("-")[1]);
    expect(seq(second.number)).toBe(seq(first.number) + 1);
  });

  it("오늘 소속 없음 → `{이름} {MM-DD} 소속 없음 · 소속 발령은 관리자` 거부 · 요청 0 · 카운터 그대로(임의의 팀으로 떨어뜨리지 않음)", async () => {
    const stray = await makePerson("이무소속", DEFAULT_ROLE_ID, null);
    const before = await teamCounter();
    const error = await caught(teamRequestBy(stray));
    expect((error as Error).message).toBe(`이무소속 ${seoulToday().slice(5)} 소속 없음 · 소속 발령은 관리자`);
    expect(await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.requestedBy, stray.id))).toHaveLength(0);
    expect(await teamCounter()).toBe(before);
  });

  it("[O-19 · T-06-66] 입력의 팀 id · 사용한 사람 · 원화 환산액은 받지 않는다 — 액션에 실어 보내도 저장은 요청자 · 서버 계산 값", async () => {
    const requester = await teamCostRequester();
    const other = await teamCostRequester();
    session.viewer = requester.viewer;
    const outcome = await createPurchaseRequestAction({
      linkKind: "team_cost",
      itemName: "팀 비품",
      linkUrl: null,
      currency: "USD",
      amount: 100,
      fxRate: 1_350,
      memo: null,
      teamId: other.teamId,
      usedByUserId: other.viewer.id,
      amountKrw: 1,
    } as never);
    expect(outcome?.serverError).toBeUndefined();
    const id = outcome?.data?.id;
    if (!id) throw new Error("저장 결과 없음");
    expect(await statusOf(id)).toMatchObject({ requestedBy: requester.viewer.id, estimateAmountKrw: 135_000, estimateCurrency: "USD", linkKind: "team_cost" });
    session.viewer = null;
  });

  it("요청 INSERT가 실패하면 카운터도 오르지 않는다 — 요청 0 · 로그 0줄 · 다음 요청이 같은 순번(결번 없음)", async () => {
    const requester = await teamCostRequester();
    const input = teamInput();
    const pre = await precheckPurchaseRequest(requester.viewer, input);
    const before = await teamCounter();
    const logsBefore = await createLogCount();
    await expect(createPurchaseRequest(requester.viewer, input, { ...pre, linkUrl: "javascript:alert(1)" })).rejects.toThrow();
    expect(await teamCounter()).toBe(before);
    expect(await createLogCount()).toBe(logsBefore);
    const created = await createPurchaseRequest(requester.viewer, input, pre);
    expect(created.number.endsWith(String(before + 1).padStart(4, "0"))).toBe(true);
    expect(await createLogCount()).toBe(logsBefore + 1);
  });

  it("견적 줄 갈래의 잠금 · 문 · 실행가 상한을 타지 않는다 — 50,000,000원 팀 비용 요청도 저장", async () => {
    const requester = await teamCostRequester();
    const created = await teamRequestBy(requester.viewer, teamInput({ estimate: { currency: "KRW", amount: 50_000_000, fxRate: 1 } }));
    expect((await statusOf(created.id))?.estimateAmountKrw).toBe(50_000_000);
  });

  it("`projects` view 없는 계급 → 팀 비용 요청도 ForbiddenError(06-08과 같은 판정) · 요청 0", async () => {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `보기없음-${randomUUID().slice(0, 8)}`, workScope: "team" });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `보기본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `보기팀-${randomUUID()}` });
    const person = await makePerson("보기없음", role.id, team.name);
    await expect(precheckPurchaseRequest(person, teamInput())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("외화 예상 금액(06-14 — T-06-69)", () => {
  it("팀 비용 USD 1,000.00 @1,350 → 통화 · 외화 금액 · 환율 · 원화 환산액 1,350,000이 함께 저장(서버 `toKrw`)", async () => {
    const requester = await teamCostRequester();
    const created = await teamRequestBy(requester.viewer, teamInput({ estimate: { currency: "USD", amount: 1_000, fxRate: 1_350 } }));
    const row = await statusOf(created.id);
    expect(row).toMatchObject({ estimateCurrency: "USD", estimateAmountKrw: 1_350_000 });
    expect(Number(row?.estimateForeignAmount)).toBe(1_000);
    expect(Number(row?.estimateFxRate)).toBe(1_350);
  });

  it("견적 줄 요청 USD 500 @1,350(원화 675,000) → 저장 · 상한 판정은 원화 환산액에서 역산", async () => {
    const fx = await purchaseProject();
    const input: PurchaseRequestInput = { ...requestInput(fx.onlineLine), estimate: { currency: "USD", amount: 500, fxRate: 1_350 } };
    const created = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    expect(await statusOf(created.id)).toMatchObject({ estimateCurrency: "USD", estimateAmountKrw: 675_000 });
  });

  it("환율이 비면(0) → `환율 없음 · USD 환율 적기` 거부 · 요청 0 · 계산 불가 요청 없음", async () => {
    const requester = await teamCostRequester();
    const error = await caught(precheckPurchaseRequest(requester.viewer, teamInput({ estimate: { currency: "USD", amount: 1_000, fxRate: 0 } })));
    expect((error as Error).message).toBe("환율 없음 · USD 환율 적기");
    expect(await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.requestedBy, requester.viewer.id))).toHaveLength(0);
  });

  it("액션 — 외화인데 환율 칸이 없으면 zod가 `환율 없음 · USD 환율 적기`로 거부", async () => {
    const requester = await teamCostRequester();
    session.viewer = requester.viewer;
    const outcome = await createPurchaseRequestAction({ linkKind: "team_cost", itemName: "팀 비품", linkUrl: null, currency: "USD", amount: 100, memo: null } as never);
    expect(outcome?.validationErrors?.fxRate?._errors?.[0]).toBe("환율 없음 · USD 환율 적기");
    session.viewer = null;
  });
});


// ── 06-14 Task 2 — 요청 취소(Q2 — `신청됨`에서만) · 취소 되돌리기 · 취소 ∥ 구매 완료 ──────────────────────

async function cancelAs(viewer: Viewer, id: string, reason?: string, version?: number) {
  return cancelPurchaseRequest(
    viewer,
    { id, version: version ?? (await requestVersion(id)), ...(reason === undefined ? {} : { reason }) },
    await precheckPurchaseCancel(viewer, { id }),
  );
}

async function undoAs(viewer: Viewer, id: string) {
  return undoCancelPurchaseRequest(viewer, { id, version: await requestVersion(id) }, await precheckPurchaseCancelUndo(viewer, { id }));
}

async function statusLogs(requestId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.entityId, requestId), eq(actionLog.actionType, "status_change")));
}

describe("요청 취소(06-14 — Q2 · O-9 · T-06-67)", () => {
  it("요청자 본인 · 자기 `신청됨` → 사유 없이 `cancelled`(취소한 사람 · 시각 · version+1) + 같은 tx `status_change` 한 줄(요청 → 취소)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const before = await requestVersion(created.id);
    await cancelAs(fx.pm, created.id);
    const row = await statusOf(created.id);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: fx.pm.id, cancelReason: null, version: before + 1 });
    expect(row?.cancelledAt).toBeInstanceOf(Date);
    const logs = await statusLogs(created.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ from: "requested", to: "cancelled" });
  });

  it("구매 권한자 · 남의 `신청됨` → 빈 사유 거부(`사유 없음 · 사유 적기`) · 사유 있으면 취소 + 사유 저장 + 로그에 사유", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    expect(((await caught(cancelAs(buyer, created.id, "  "))) as Error).message).toBe(REJECT_REASON_EMPTY_MESSAGE);
    expect(((await caught(cancelAs(buyer, created.id, "가".repeat(501)))) as Error).message).toBe(REJECT_REASON_TOO_LONG_MESSAGE);
    expect((await statusOf(created.id))?.status).toBe("requested");
    await cancelAs(buyer, created.id, "중복 신청");
    expect(await statusOf(created.id)).toMatchObject({ status: "cancelled", cancelledBy: buyer.id, cancelReason: "중복 신청" });
    expect((await statusLogs(created.id))[0]?.detail).toMatchObject({ reason: "중복 신청" });
  });

  it("구매 권한 없는 남 → ForbiddenError · 요청 `신청됨` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const stranger = await makePerson("남", DEFAULT_ROLE_ID, null);
    const error = await caught(cancelAs(stranger, created.id, "그냥"));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("[Q2] `purchased` 요청의 취소 → `이미 구매 완료 · 새로 고침` 거부 · 요청 구매 완료 · 카드 사용 1 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    await complete(buyer, await completionInput(created.id, await sharedCard()));
    const error = await caught(cancelAs(fx.pm, created.id));
    expect((error as Error).message).toBe("이미 구매 완료 · 새로 고침");
    const buyerError = await caught(cancelAs(buyer, created.id, "취소하고 싶다"));
    expect((buyerError as Error).message).toBe("이미 구매 완료 · 새로 고침");
    expect((await statusOf(created.id))?.status).toBe("purchased");
    expect(await usagesOf(created.id)).toHaveLength(1);
    expect(await statusLogs(created.id)).toHaveLength(0);
  });

  it("이미 취소된 요청의 취소 → `구매 요청 취소됨 · 새로 고침` · 다른 version → `다른 저장이 먼저 됨 · 새로 고침`", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const staleVersion = await requestVersion(created.id);
    await cancelAs(fx.pm, created.id);
    expect(((await caught(cancelAs(fx.pm, created.id))) as Error).message).toBe("구매 요청 취소됨 · 새로 고침");
    const other = await request(fx, fx.onlineLine);
    const error = await caught(cancelAs(fx.pm, other.id, undefined, staleVersion + 5));
    expect((error as Error).message).toBe("다른 저장이 먼저 됨 · 새로 고침");
    expect((await statusOf(other.id))?.status).toBe("requested");
  });

  it("팀 비용 요청도 같은 규칙 — 본인 즉시 취소 · 구매 권한자는 사유", async () => {
    const requester = await teamCostRequester();
    const own = await teamRequestBy(requester.viewer);
    await cancelAs(requester.viewer, own.id);
    expect((await statusOf(own.id))?.status).toBe("cancelled");
    const other = await teamRequestBy(requester.viewer);
    const buyer = await purchaser();
    await expect(cancelAs(buyer, other.id)).rejects.toThrow(REJECT_REASON_EMPTY_MESSAGE);
    await cancelAs(buyer, other.id, "필요 없음");
    expect((await statusOf(other.id))?.status).toBe("cancelled");
  });

  it("액션 — 본인 취소 → 번호 · version 반환 · 되돌리기 액션 → `신청됨`(같은 서버 판정)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    session.viewer = fx.pm;
    const cancelled = await cancelPurchaseRequestAction({ id: created.id, version: await requestVersion(created.id) });
    expect(cancelled?.data).toMatchObject({ number: created.number });
    const restored = await undoCancelPurchaseRequestAction({ id: created.id, version: await requestVersion(created.id) });
    expect(restored?.serverError).toBeUndefined();
    expect((await statusOf(created.id))?.status).toBe("requested");
    session.viewer = null;
  });

  // E-26 — 05 `deps.afterLock` 장벽으로 순서를 고정한다(두 호출의 사전 조회는 장벽 전에 끝낸다).
  it("취소 ∥ 구매 완료 — 구매 완료 먼저 잠금: 구매 완료 성공 · 취소는 `이미 구매 완료 · 새로 고침` · 카드 사용 1", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const input = await completionInput(created.id, await sharedCard());
    const completePre = await precheckPurchaseCompletion(buyer, input);
    const cancelPre = await precheckPurchaseCancel(fx.pm, { id: created.id });
    const held = deferred();
    const release = deferred();
    const completing = completePurchaseRequest(buyer, input, completePre, {
      afterLock: async () => {
        held.resolve();
        await release.promise;
      },
    });
    await held.promise;
    const cancelling = caught(cancelPurchaseRequest(fx.pm, { id: created.id, version: input.version }, cancelPre));
    await waitForLockWaiter(pool);
    release.resolve();
    await completing;
    expect(((await cancelling) as Error).message).toBe("이미 구매 완료 · 새로 고침");
    expect((await statusOf(created.id))?.status).toBe("purchased");
    expect(await usagesOf(created.id)).toHaveLength(1);
  });

  it("취소 ∥ 구매 완료 — 취소 먼저 잠금: 취소 성공 · 구매 완료는 `구매 요청 취소됨 · 새로 고침` · 카드 사용 0", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const input = await completionInput(created.id, await sharedCard());
    const completePre = await precheckPurchaseCompletion(buyer, input);
    const cancelPre = await precheckPurchaseCancel(fx.pm, { id: created.id });
    const held = deferred();
    const release = deferred();
    const cancelling = cancelPurchaseRequest(fx.pm, { id: created.id, version: input.version }, cancelPre, undefined, {
      afterLock: async () => {
        held.resolve();
        await release.promise;
      },
    });
    await held.promise;
    const completing = caught(completePurchaseRequest(buyer, input, completePre));
    await waitForLockWaiter(pool);
    release.resolve();
    await cancelling;
    expect(((await completing) as Error).message).toBe("구매 요청 취소됨 · 새로 고침");
    expect((await statusOf(created.id))?.status).toBe("cancelled");
    expect(await usagesOf(created.id)).toHaveLength(0);
  });
});

describe("취소 되돌리기(06-14 — D-609 · Q3 · X-1 · X-2 · N-1 · N-2 · T-06-193)", () => {
  const UNDO_DENIED = "되돌리기 권한 없음";

  it("요청자 본인 · 사유 없는 취소 → `신청됨`(번호 그대로 · 취소 칸 비움) + `status_change`(취소 → 요청)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    await undoAs(fx.pm, created.id);
    const row = await statusOf(created.id);
    expect(row).toMatchObject({ status: "requested", number: created.number, cancelledBy: null, cancelledAt: null, cancelReason: null });
    const logs = await statusLogs(created.id);
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.detail)).toEqual(expect.arrayContaining([expect.objectContaining({ from: "cancelled", to: "requested" })]));
  });

  it("구매 권한자가 사유로 취소한 건 → 요청자도 되돌릴 수 없다 · 요청자 아닌 사람 → 거부 · `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    await cancelAs(buyer, created.id, "중복");
    expect(((await caught(undoAs(fx.pm, created.id))) as Error).message).toBe(UNDO_DENIED);
    expect(((await caught(undoAs(buyer, created.id))) as Error).message).toBe(UNDO_DENIED);
    const own = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, own.id);
    const stranger = await makePerson("남", DEFAULT_ROLE_ID, null);
    expect(((await caught(undoAs(stranger, own.id))) as Error).message).toBe(UNDO_DENIED);
    expect((await statusOf(created.id))?.status).toBe("cancelled");
    expect((await statusOf(own.id))?.status).toBe("cancelled");
  });

  it("`cancelled`가 아닌 요청(신청됨 · 구매 완료) → 거부", async () => {
    const fx = await purchaseProject();
    const open = await request(fx, fx.onlineLine);
    expect(((await caught(undoAs(fx.pm, open.id))) as Error).message).toBe("다른 저장이 먼저 됨 · 새로 고침");
    const done = await request(fx, fx.onlineLine);
    await complete(await purchaser(), await completionInput(done.id, await sharedCard()));
    expect(((await caught(undoAs(fx.pm, done.id))) as Error).message).toBe("이미 구매 완료 · 새로 고침");
    expect((await statusOf(done.id))?.status).toBe("purchased");
  });

  it("팀 비용 요청 → 줄 게이트 없이 `신청됨`", async () => {
    const requester = await teamCostRequester();
    const created = await teamRequestBy(requester.viewer);
    await cancelAs(requester.viewer, created.id);
    await undoAs(requester.viewer, created.id);
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("취소된 사이 그 줄에 지출결의가 이어졌다 → `지출결의 {번호} 연결됨 …` 거부 · 요청 `취소` 그대로", async () => {
    const fx = await setupExpenseProject();
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const input = requestInput(fx.lines.withVendor);
    const created = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    await cancelAs(fx.pm, created.id);
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "");
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, draft.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const error = await caught(undoAs(fx.pm, created.id));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toMatch(new RegExp(`^지출결의 ${submitted.number} 연결됨`));
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });

  it("취소된 사이 프로젝트가 `completed` → `완료 · 견적 줄 잠김` 거부 · 요청 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    await setStatus(fx.projectId, "completed");
    const error = await caught(undoAs(fx.pm, created.id));
    expect(error).toBeInstanceOf(CompletedProjectError);
    expect((error as Error).message).toBe("완료 · 견적 줄 잠김");
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });

  it("[I-2 문] 취소된 사이 `온라인구매 협력사` 설정이 바뀌어 그 줄이 지출결의 문이 됨 → `온라인구매 협력사 줄 아님 · 지출결의로` 거부 · 요청 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "다른 온라인 협력사");
    const error = await caught(undoAs(fx.pm, created.id));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("온라인구매 협력사 줄 아님 · 지출결의로");
    expect((await statusOf(created.id))?.status).toBe("cancelled");
    // 설정이 돌아오면 같은 요청이 되살아난다 — 막은 것은 문 하나다.
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, ONLINE_VENDOR);
    await undoAs(fx.pm, created.id);
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("취소된 사이 카드 사용이 남은 실행가를 먹음 → `실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기` 거부 · 경계(공급가 400,000)는 통과", async () => {
    const fx = await purchaseProject();
    const big = await request(fx, fx.onlineLine, 660_000);
    await cancelAs(fx.pm, big.id);
    await cardOnLine(fx, fx.onlineLine, 600_000);
    const error = await caught(undoAs(fx.pm, big.id));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
    expect((await statusOf(big.id))?.status).toBe("cancelled");
    const edge = await request(fx, fx.onlineLine, 440_000);
    await cancelAs(fx.pm, edge.id);
    await undoAs(fx.pm, edge.id);
    expect((await statusOf(edge.id))?.status).toBe("requested");
  });

  it("[X-2 경합] 되돌리기 사전 조회를 끝낸 뒤 풀 밖 연결이 프로젝트 행을 잡고 `completed`로 커밋 → `완료 · 견적 줄 잠김` · 요청 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    await setStatus(fx.projectId, "settling");
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    const pre = await precheckPurchaseCancelUndo(fx.pm, { id: created.id });
    const version = await requestVersion(created.id);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await client.query("UPDATE projects SET status = 'completed' WHERE id = $1", [fx.projectId]);
      const undoing = caught(undoCancelPurchaseRequest(fx.pm, { id: created.id, version }, pre));
      await waitForLockWaiter(pool);
      await client.query("COMMIT");
      const error = await undoing;
      expect(error).toBeInstanceOf(CompletedProjectError);
      expect((error as Error).message).toBe("완료 · 견적 줄 잠김");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });

  it("[X-1 계보] 요청 줄 L이 취소된 사이 새 차수(L → L′)의 L′에 지출결의가 제출됨 → 되돌리기 거부", async () => {
    const fx = await setupExpenseProject();
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const input = requestInput(fx.lines.withVendor);
    const created = await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    await cancelAs(fx.pm, created.id);
    // 2차는 고객 승인까지 받아야 그 줄로 지출결의를 만들 수 있다(05-14 도우미).
    const next = await addApprovedRevision(fx, []);
    const [copy] = await db.select({ id: quoteLines.id }).from(quoteLines).where(and(eq(quoteLines.revisionId, next.revisionId), eq(quoteLines.copiedFromLineId, fx.lines.withVendor)));
    if (!copy) throw new Error("복사된 줄 없음");
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "");
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [copy.id] });
    const submitted = await submitReadyDraft(fx.pm, draft.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const error = await caught(undoAs(fx.pm, created.id));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toMatch(new RegExp(`^지출결의 ${submitted.number} 연결됨`));
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });

  it("[X-1 계보] 같은 새 차수에서 L′에 연결이 없으면 되돌리기 통과 — 요청은 L 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await undoAs(fx.pm, created.id);
    expect(await statusOf(created.id)).toMatchObject({ status: "requested", quoteLineId: fx.onlineLine });
  });

  it("[N-1] 새 차수 L2 실행가 1,500,000 + 카드 공급가 300,000 → 요청(예상 공급가 900,000) 되돌리기 통과(옛 L1 실행가로 판정하면 남은 700,000으로 막혔다)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine, 990_000);
    await cancelAs(fx.pm, created.id);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ executionAmountKrw: 1_500_000 }).where(eq(quoteLines.id, l2));
    await cardOnLine(fx, l2, 300_000);
    await undoAs(fx.pm, created.id);
    expect((await statusOf(created.id))?.status).toBe("requested");
  });

  it("[N-1] 새 차수 L2 실행가 800,000(카드 사용 없음) → `실행가 초과 · 남은 실행가 800,000 · 다른 줄 고르기` 거부 · 요청 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine, 990_000);
    await cancelAs(fx.pm, created.id);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ executionAmountKrw: 800_000 }).where(eq(quoteLines.id, l2));
    const error = await caught(undoAs(fx.pm, created.id));
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 800,000 · 다른 줄 고르기");
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });

  it("[N-2] 현재 줄 L2가 보관되면 `견적 줄 빠짐 · 새로 고침` 거부 · 요청 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    await cancelAs(fx.pm, created.id);
    const l2 = await (await nextRevision(fx)).copyOf(fx.onlineLine);
    await db.update(quoteLines).set({ archivedAt: new Date() }).where(eq(quoteLines.id, l2));
    const error = await caught(undoAs(fx.pm, created.id));
    expect((error as Error).message).toBe("견적 줄 빠짐 · 새로 고침");
    expect((await statusOf(created.id))?.status).toBe("cancelled");
  });
});

// ── 목록 마감(06-14 Task 3 — 합계 · 열린 건수 · 50건 페이지 · `전체` 그룹 순서) ─────────────────────────────

describe("구매 요청 목록 마감(06-14)", () => {
  async function scopedRole(): Promise<string> {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `마감목록-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    return role.id;
  }

  async function person(name: string, roleId: string): Promise<Awaited<ReturnType<typeof makePerson>>> {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `마감본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `마감팀-${randomUUID()}` });
    return makePerson(name, roleId, team.name);
  }

  type Seed = { requester: { id: string }; status?: "requested" | "purchased" | "cancelled"; amount?: number; createdAt?: Date };

  async function seed(rows: Seed[]): Promise<string[]> {
    const inserted = await db
      .insert(purchaseRequests)
      .values(
        rows.map((row) => ({
          number: `TC${randomUUID().slice(0, 8)}`,
          linkKind: "team_cost",
          requestedBy: row.requester.id,
          itemName: "마감 물건",
          estimateAmountKrw: row.amount ?? 10_000,
          status: row.status ?? "requested",
          ...(row.status === "purchased" ? { completedBy: row.requester.id, completedAt: new Date() } : {}),
          ...(row.status === "cancelled" ? { cancelledBy: row.requester.id, cancelledAt: new Date(), cancelReason: "마감 취소" } : {}),
          ...(row.createdAt ? { createdAt: row.createdAt } : {}),
        })),
      )
      .returning({ id: purchaseRequests.id });
    return inserted.map((row) => row.id);
  }

  it("[I-1] S13 패널 로드 — `cancelBranch`: 구매 권한자 본인 요청 `own` · 남의 요청 `others` · `신청됨`이 아니면 null · 구매 권한 없으면 패널 없음", async () => {
    const roleId = await scopedRole();
    const requester = await person("패널요청자", roleId);
    const buyer = await purchaser();
    const [own] = await seed([{ requester: buyer }]);
    const [others] = await seed([{ requester }]);
    const [done] = await seed([{ requester, status: "purchased" }]);
    expect((await loadPurchaseCompletion(buyer, own ?? ""))?.cancelBranch).toBe("own");
    expect((await loadPurchaseCompletion(buyer, others ?? ""))?.cancelBranch).toBe("others");
    expect((await loadPurchaseCompletion(buyer, done ?? ""))?.cancelBranch).toBeNull();
    expect(await loadPurchaseCompletion(requester, others ?? "")).toBeNull();
  });

  it("합계 줄 — 보기의 건수 · 예상 금액 합은 목록과 같은 범위 안 행만(남의 요청 없음) · `전체`는 상태 가리지 않는다", async () => {
    const roleId = await scopedRole();
    const mine = await person("마감요청자", roleId);
    const other = await person("마감남", roleId);
    await seed([
      { requester: mine, amount: 11_000 },
      { requester: mine, amount: 22_000 },
      { requester: mine, status: "cancelled", amount: 5_000 },
      { requester: other, amount: 99_000 },
    ]);
    const today = seoulToday();
    expect((await listPurchaseRequests(mine, { status: "requested" }, today)).totals).toEqual({ count: 2, estimateKrw: 33_000 });
    expect((await listPurchaseRequests(mine, { status: "all" }, today)).totals).toEqual({ count: 3, estimateKrw: 38_000 });
    expect((await listPurchaseRequests(mine, { status: "cancelled" }, today)).totals).toEqual({ count: 1, estimateKrw: 5_000 });
    expect((await listPurchaseRequests(other, { status: "requested" }, today)).totals).toEqual({ count: 1, estimateKrw: 99_000 });
  });

  it("합계 줄 — 예상 금액을 못 보는 계급은 금액 합이 null(건수만)", async () => {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `금액숨김-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "purchase_request.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "purchase_request.amount", visible: false });
    const hidden = await person("금액숨김", role.id);
    await seed([{ requester: hidden, amount: 11_000 }]);
    expect((await listPurchaseRequests(hidden, { status: "requested" }, seoulToday())).totals).toEqual({ count: 1, estimateKrw: null });
  });

  it("50건 페이지 — 51건이면 첫 쪽 50건 · 둘째 쪽 1건 · 합계는 쪽과 무관하게 51건", async () => {
    const roleId = await scopedRole();
    const mine = await person("마감쪽", roleId);
    await seed(Array.from({ length: 51 }, () => ({ requester: mine, amount: 1_000 })));
    const today = seoulToday();
    const first = await listPurchaseRequests(mine, { status: "requested", page: "1" }, today);
    expect(first.rows).toHaveLength(50);
    expect(first.page).toMatchObject({ page: 1, pageCount: 2, pageSize: 50, total: 51 });
    const second = await listPurchaseRequests(mine, { status: "requested", page: "2" }, today);
    expect(second.rows).toHaveLength(1);
    expect(second.totals).toEqual({ count: 51, estimateKrw: 51_000 });
  });

  it("`전체` 보기 그룹 순서 — 신청됨 → 구매 완료 → 취소(요청일 내림차순은 그룹 안에서)", async () => {
    const roleId = await scopedRole();
    const mine = await person("마감그룹", roleId);
    const base = Date.now();
    const [requestedOld, purchased, cancelledNew, requestedNew] = await seed([
      { requester: mine, status: "requested", createdAt: new Date(base - 4_000) },
      { requester: mine, status: "purchased", createdAt: new Date(base - 3_000) },
      { requester: mine, status: "cancelled", createdAt: new Date(base - 1_000) },
      { requester: mine, status: "requested", createdAt: new Date(base - 2_000) },
    ]);
    const all = await listPurchaseRequests(mine, { status: "all" }, seoulToday());
    expect(all.rows.map((row) => row.id)).toEqual([requestedNew, requestedOld, purchased, cancelledNew]);
  });

  it("열린 건수 `countOpenPurchaseRequests` — 목록과 같은 범위의 `신청됨`만(구매 완료 · 취소 · 남의 요청 제외)", async () => {
    const roleId = await scopedRole();
    const mine = await person("마감열림", roleId);
    const other = await person("마감다른", roleId);
    await seed([{ requester: mine }, { requester: mine }, { requester: mine }, { requester: mine, status: "cancelled" }, { requester: mine, status: "purchased" }, { requester: other }]);
    expect(await countOpenPurchaseRequests(mine)).toBe(3);
    expect(await countOpenPurchaseRequests(other)).toBe(1);
    const nobody = await person("마감없음", roleId);
    expect(await countOpenPurchaseRequests(nobody)).toBe(0);
  });
});

// Q3 「빼기」(사용자 결정 2026-10-05 카드 「빼기」) — 신청 · 취소 · 되돌리기 세 입구가 같은 상한 판정을 지난다(06-07 `lineRoom` 한 곳).
describe("실행가 빼기(Q3 — 신청됨 요청의 예상 공급가)", () => {
  it("실행가 1,000,000 · A 예상 770,000(공급가 700,000) `신청됨` → B 770,000 거부(남은 300,000) · A 취소 → B 성공 · A 되돌리기 거부(남은 300,000) · A는 `취소` 그대로", async () => {
    const fx = await purchaseProject();
    const a = await request(fx, fx.onlineLine, 770_000);
    const blocked = await caught(request(fx, fx.onlineLine, 770_000));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("실행가 초과 · 남은 실행가 300,000 · 다른 줄 고르기");
    expect(await requestCount()).toBe(1);

    await cancelAs(fx.pm, a.id);
    await request(fx, fx.onlineLine, 770_000);
    expect(await requestCount()).toBe(2);

    const undone = await caught(undoAs(fx.pm, a.id));
    expect(undone).toBeInstanceOf(GateBlockedError);
    expect((undone as Error).message).toBe("실행가 초과 · 남은 실행가 300,000 · 다른 줄 고르기");
    expect((await statusOf(a.id))?.status).toBe("cancelled");
  });
});
