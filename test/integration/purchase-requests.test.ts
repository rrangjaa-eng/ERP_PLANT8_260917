import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "@/db/client";
import { actionLog, corpCardUsages, documentCounters, expenses, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { CompletedProjectError } from "@/domain/projects";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { StaleQuoteRevisionError } from "@/domain/corp-card-usages/link-targets";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { closeExpense, createExpenseFromLines } from "@/domain/expenses";
import { rejectDocument } from "@/domain/approvals";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { ForbiddenError } from "@/domain/permissions/can";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import {
  completePurchaseRequest,
  createPurchaseRequest,
  listPurchaseRequests,
  precheckPurchaseCompletion,
  precheckPurchaseRequest,
  PURCHASE_REQUEST_ENTITY,
  type PurchaseCompletionInput,
} from "@/domain/purchase-requests";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findLineLinks } from "@/repositories/quote-line-links";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { ONLINE_VENDOR, purchaseProject, request, requestInput, type PurchaseFx } from "./fixtures/purchase-requests";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { waitForLockWaiter } from "./lock-race";

// 06-08(EXP-10 · D-609 · Q3 · GA-38): 구매 요청 신청 경로 통합 파일 — 06-12 · 06-14가 `describe`를 더한다.

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
    // 지출결의 fixture의 「무대 제작」 줄(스테이지원)을 온라인구매 협력사로 켠다.
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");

    const input = requestInput(fx.lines.withVendor);
    const error = await caught(createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input)));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 다른 줄 고르기`);
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
async function purchaser(name = "구매담당"): Promise<Awaited<ReturnType<typeof makePerson>>> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `구매처리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
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
