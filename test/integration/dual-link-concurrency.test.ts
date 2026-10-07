import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { corpCardUsages, expensePayments, expenses, purchaseRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { createExpenseFromLines, submitExpense } from "@/domain/expenses";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { deferred, waitForLockWaiter } from "./lock-race";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { requestInput } from "./fixtures/purchase-requests";

// 06-13(E-26 · B-1 · N-2 · D-609 · EXP-06): 견적 줄 한 줄을 다투는 동시 요청. 쥔 쪽을 `deps.afterLock` 장벽에서 멈추고, 반대 요청이
// 잠금을 기다리는 것을 `waitForLockWaiter`로 확인한 뒤 푼다 — 순서는 폴링이 확인한 사실로 고정한다(고정 지연 없음).
// 잠금 순서는 모든 입구에서 프로젝트 행 → 견적 줄(id 순) → 문서 행이다. 지급은 줄 연결을 늘리지 않아 프로젝트 행을 건너뛴다(X-2).

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("거부되지 않음");
    },
    (error: unknown) => error,
  );
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function draftOf(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

// 증빙을 붙인 작성 중 문서(경합 밖에서 준비 — 제출 트랜잭션만 다툰다).
async function readyDraft(viewer: Viewer, lineId: string): Promise<string> {
  const expenseId = await draftOf(viewer, lineId);
  await attachEvidence(viewer, expenseId);
  return expenseId;
}

// A가 장벽에서 잠금을 쥔 채 멈추면 B를 시작하고, B가 잠금을 기다리는 것을 확인한 뒤 A를 푼다(05 raceSubmits 꼴).
// `waitFor`는 케이스마다 넘기는 잠금 대기 확인(waitForLockWaiter) — 잠금을 빼면 대기가 생기지 않아 여기서 빨개진다.
async function race(a: (afterLock: () => Promise<void>) => Promise<unknown>, b: () => Promise<unknown>, waitFor: () => Promise<void>) {
  const locked = deferred();
  const release = deferred();
  const first = a(async () => {
    locked.resolve();
    await release.promise;
  });
  const reachedLock = await Promise.race([locked.promise.then(() => true), first.then(() => false, () => false)]);
  expect(reachedLock).toBe(true);
  const second = b();
  try {
    await waitFor();
  } catch (error) {
    // 대기를 못 보면 두 요청이 끝날 때까지 기다린 뒤 실패한다 — 다음 테스트의 TRUNCATE와 겹치지 않게.
    release.resolve();
    await Promise.allSettled([first, second]);
    throw error;
  }
  release.resolve();
  return Promise.allSettled([first, second]);
}

function reasonOf(result: PromiseSettledResult<unknown> | undefined): string | null {
  return result?.status === "rejected" ? (result.reason as Error).message : null;
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 비분할 줄 L에 무관 PM의 작성 중 B(A 제출 전에 만든 문서)와 담당 PM의 결재 통과 · 증빙 확인 A — 지급만 남은 상태.
async function paymentRaceSetup() {
  const fx = await setupExpenseProject();
  const payer = await makePayer();
  const staleDraft = await readyDraft(fx.otherPm, fx.lines.withVendor);
  const paid = await approvedExpenseWithEvidence(fx);
  const [row] = await db.select({ supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, paid.expenseId));
  await db.update(expenses).set({ evidenceAmount: row?.supply ?? null }).where(eq(expenses.id, paid.expenseId));
  const confirmed = await confirmEvidence(payer, { expenseId: paid.expenseId, version: await versionOf(paid.expenseId) });
  const preview = await previewPayable(payer, { expenseId: paid.expenseId, payDate: seoulToday() });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  const payableKrw = preview.payableKrw;
  const pay = (afterLock?: () => Promise<void>) =>
    completeExpensePayment(payer, { expenseId: paid.expenseId, expectedPayableKrw: payableKrw, version: confirmed.version }, afterLock ? { afterLock } : undefined);
  const submitStale = async (afterLock?: () => Promise<void>) =>
    submitExpense(fx.otherPm, { expenseId: staleDraft, expectedVersion: await versionOf(staleDraft) }, afterLock ? { afterLock } : undefined);
  return { fx, paid, staleDraft, pay, submitStale };
}

async function livePayments(expenseId: string): Promise<number> {
  return (await db.select({ id: expensePayments.id }).from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).length;
}

describe("카드 · 구매 요청 ∥ 지출결의 제출 (D-609)", () => {
  async function cardInput(fx: ExpenseFixture, lineId: string): Promise<CardUsageInput> {
    const card = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID().slice(0, 6)}`,
      numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
      label: "개인 카드",
      kind: "personal",
      holderUserId: fx.pm.id,
    });
    if (!card.id) throw new Error("카드 id 없음");
    return {
      corpCardId: card.id,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW", amount: 100_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      lineId,
      memo: null,
    };
  }

  it("제출이 장벽에서 쥠 → 카드 사용 등록이 기다림 → 제출 성공 · 카드 거부(`지출결의 {번호} 연결됨 · 다른 줄 고르기`) · 카드 사용 0", async () => {
    const fx = await setupExpenseProject();
    const draft = await readyDraft(fx.pm, fx.lines.withVendor);
    const input = await cardInput(fx, fx.lines.withVendor);
    const pre = await precheckCardUsage(fx.pm, input);
    const version = await versionOf(draft);

    const [submitted, card] = await race(
      (afterLock) => submitExpense(fx.pm, { expenseId: draft, expectedVersion: version }, { afterLock }),
      () => createCardUsage(fx.pm, input, pre),
      () => waitForLockWaiter(pool),
    );
    expect(submitted?.status).toBe("fulfilled");
    const number = submitted?.status === "fulfilled" ? (submitted.value as { number: string }).number : "";
    expect(reasonOf(card)).toBe(`지출결의 ${number} 연결됨 · 다른 줄 고르기`);
    expect(await db.select({ id: corpCardUsages.id }).from(corpCardUsages)).toHaveLength(0);
  });

  it("제출이 장벽에서 쥠 → 구매 요청이 기다림 → 제출 성공 · 구매 요청 거부(`지출결의 {번호} 연결됨 · 다른 줄 고르기`) · 구매 요청 0", async () => {
    const fx = await setupExpenseProject();
    const draft = await readyDraft(fx.pm, fx.lines.withVendor);
    // 구매 요청 사전 조회는 그 줄이 온라인구매 협력사일 때 받고(문 통과), 제출은 설정이 비었을 때 읽는다 — 두 입구가 같은 줄의 잠금을 다툰다.
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const input = requestInput(fx.lines.withVendor);
    const pre = await precheckPurchaseRequest(fx.pm, input);
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "");
    const version = await versionOf(draft);

    const [submitted, request] = await race(
      (afterLock) => submitExpense(fx.pm, { expenseId: draft, expectedVersion: version }, { afterLock }),
      () => createPurchaseRequest(fx.pm, input, pre),
      () => waitForLockWaiter(pool),
    );
    expect(submitted?.status).toBe("fulfilled");
    const number = submitted?.status === "fulfilled" ? (submitted.value as { number: string }).number : "";
    expect(reasonOf(request)).toBe(`지출결의 ${number} 연결됨 · 다른 줄 고르기`);
    expect(await db.select({ id: purchaseRequests.id }).from(purchaseRequests)).toHaveLength(0);
  });
});

describe("지급 완료 ∥ 같은 줄 새 지출결의 제출 (N-2 · EXP-06)", () => {
  it("지급 먼저 잠금 — 지급이 줄 · 문서 잠금 뒤 장벽에서 쥠 → 제출이 줄 잠금을 기다림 → 지급 성공 · 제출 거부 `지급 완료 {A} · 새 지출결의 없음`", async () => {
    const { paid, staleDraft, pay, submitStale } = await paymentRaceSetup();

    const [payment, submitted] = await race((afterLock) => pay(afterLock), () => submitStale(), () => waitForLockWaiter(pool));
    expect(payment?.status).toBe("fulfilled");
    expect(reasonOf(submitted)).toBe(`지급 완료 ${paid.number} · 새 지출결의 없음`);
    expect(await livePayments(paid.expenseId)).toBe(1);
    const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, staleDraft));
    expect(row?.number).toBeNull();
  }, 30_000);

  it("제출 먼저 잠금 — 제출이 장벽에서 쥠 → 지급이 줄 잠금을 기다림 → 제출 거부(지급 전 문 — 직렬 제출과 같은 문자열) · 지급 성공", async () => {
    const serial = await paymentRaceSetup();
    const serialReason = ((await caught(serial.submitStale())) as Error).message;
    expect(serialReason).toBe(`이 줄에 지출결의 ${serial.paid.number} 있음 · 지출결의 열기`);

    const { paid, pay, submitStale } = await paymentRaceSetup();
    const [submitted, payment] = await race((afterLock) => submitStale(afterLock), () => pay(), () => waitForLockWaiter(pool));
    expect(reasonOf(submitted)).toBe(`이 줄에 지출결의 ${paid.number} 있음 · 지출결의 열기`);
    expect(payment?.status).toBe("fulfilled");
    expect(await livePayments(paid.expenseId)).toBe(1);
  }, 30_000);
});
