import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "@/db/client";
import { actionLog, documentCounters, expenses, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject, CompletedProjectError } from "@/domain/projects";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { StaleQuoteRevisionError } from "@/domain/corp-card-usages/link-targets";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { closeExpense, createExpenseFromLines } from "@/domain/expenses";
import { rejectDocument } from "@/domain/approvals";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { createPurchaseRequest, precheckPurchaseRequest, PURCHASE_REQUEST_ENTITY, type PurchaseRequestInput } from "@/domain/purchase-requests";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { waitForLockWaiter } from "./lock-race";

// 06-08(EXP-10 · D-609 · Q3 · GA-38): 구매 요청 신청 경로 통합 파일 — 06-12 · 06-14가 `describe`를 더한다.

const ONLINE_VENDOR = "쿠팡";

type PurchaseFx = {
  pm: Viewer;
  projectId: string;
  projectNumber: string;
  revisionId: string;
  /** 온라인구매 협력사 줄(실행가 1,000,000 · 거래처 기본 증빙 = 세금계산서 — 부가세 별도). */
  onlineLine: string;
  /** 다른 거래처 줄. */
  otherLine: string;
};

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `구매본부-${randomUUID()}` });
  const name = `구매팀-${randomUUID()}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

async function purchaseProject(onlineEvidence = "tax_invoice"): Promise<PurchaseFx> {
  const team = await makeTeam();
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, ONLINE_VENDOR);
  const online = await insertVendor(SYSTEM_VIEWER, { name: ONLINE_VENDOR, normalizedName: `${ONLINE_VENDOR}-${randomUUID()}`, defaultEvidenceType: onlineEvidence });
  const other = await insertVendor(SYSTEM_VIEWER, { name: "스테이지원", normalizedName: `스테이지원-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.id,
    name: `구매요청-${randomUUID().slice(0, 8)}`,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const onlineLine = randomUUID();
  const otherLine = randomUUID();
  const row = (id: string, itemName: string, vendorId: string) => ({
    id,
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row(onlineLine, "현장 소모품", online.id), row(otherLine, "무대 제작", other.id)] });
  return { pm, projectId: project.id, projectNumber: project.number, revisionId: revision.id, onlineLine, otherLine };
}

function requestInput(lineId: string, estimateKrw = 110_000): PurchaseRequestInput {
  return {
    linkKind: "quote_line",
    lineId,
    itemName: "현수막 3장",
    linkUrl: "https://www.coupang.com/vp/products/1",
    estimate: { currency: "KRW", amount: estimateKrw, fxRate: 1 },
    memo: null,
  };
}

async function request(fx: PurchaseFx, lineId: string, estimateKrw = 110_000): Promise<{ id: string; number: string }> {
  const input = requestInput(lineId, estimateKrw);
  return createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
}

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

