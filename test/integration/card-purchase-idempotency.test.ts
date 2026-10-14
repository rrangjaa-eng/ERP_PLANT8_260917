import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, documentCounters, projects, purchaseRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { CardUsageRejectedError, createCardUsage, precheckCardUsage, reusableCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createPurchaseRequest, precheckPurchaseRequest, PurchaseRequestRejectedError, reusablePurchaseRequest } from "@/domain/purchase-requests";
import { createCardUsageAction } from "@/app/(app)/cards/actions";
import { createPurchaseRequestAction } from "@/app/(app)/cards/purchases/actions";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";
import { purchaseProject, requestInput, type PurchaseFx } from "./fixtures/purchase-requests";

// 06.5 D-6509(CSO-4 · EP1-8 · EP2-B2 · EP3-B3 · EP3-B4): 카드 사용 · 구매 요청 등록의 중복 방지 키 —
// 같은 행위자 · 같은 키는 한 행, 다른 행위자의 키로는 남의 행을 읽지 못한다, 경합 패자는 빈 번호 없이 승자 행.

// 액션은 세션만 가짜로 둔다(purchase-requests.test.ts와 같은 꼴).
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

type CardFx = { pm: Viewer; cardId: string; projectId: string; projectNumber: string; lineId: string };

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// 카드 소지자가 담당 PM인 프로젝트 · 실행가 `execution`인 견적 줄 하나.
async function cardProject(execution = 40_000_000): Promise<CardFx> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `키본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `키팀-${randomUUID()}` });
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "개인 카드", kind: "personal", holderUserId: pm.id });
  if (!card.id) throw new Error("카드 id 없음");
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `카드키-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: lineId,
        isNew: true as const,
        subcategory: (await firstSelectableSubcategory()).value,
        itemName: "현장 소모품",
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: execution + 500_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: execution, fxRate: 1 },
      },
    ],
  });
  return { pm, cardId: card.id, projectId: project.id, projectNumber: project.number, lineId };
}

// 증빙 `계산서`(규칙 없음 — 공급가 = 결제 합계).
function lineInput(fx: CardFx, amount = 10_000, idempotencyKey?: string): CardUsageInput {
  return { corpCardId: fx.cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "quote_line", lineId: fx.lineId, memo: null, ...(idempotencyKey ? { idempotencyKey } : {}) };
}

function cardActionInput(fx: CardFx, idempotencyKey: string, amount = 10_000) {
  return { idempotencyKey, corpCardId: fx.cardId, usedOn: seoulToday(), merchantVendorId: null, currency: "KRW" as const, amount, evidenceTypeCode: "invoice", link: { kind: "line" as const, lineId: fx.lineId }, memo: null };
}

async function usageRows(): Promise<{ id: string }[]> {
  return db.select({ id: corpCardUsages.id }).from(corpCardUsages);
}

async function requestRows(): Promise<{ id: string }[]> {
  return db.select({ id: purchaseRequests.id }).from(purchaseRequests);
}

async function counter(counterKey: string, period: string): Promise<number> {
  const [row] = await db
    .select({ value: documentCounters.value })
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)));
  return row?.value ?? 0;
}

async function setCompleted(projectId: string): Promise<void> {
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
}

describe("카드 사용 등록 중복 방지 키(06.5 D-6509)", () => {
  it("같은 행위자 · 같은 키 차례로 두 번 → 행 1 · 같은 id · K 카운터 1 · 두 번째는 사전 판정을 다시 돌지 않는다", async () => {
    const fx = await cardProject();
    const key = randomUUID();
    session.viewer = fx.pm;
    const first = await createCardUsageAction(cardActionInput(fx, key));
    expect(first?.serverError).toBeUndefined();
    // 사전 판정이 다시 돌면 완료 프로젝트 거부가 난다 — 재전송은 그 앞에서 첫 행을 돌려받는다.
    await setCompleted(fx.projectId);
    const second = await createCardUsageAction(cardActionInput(fx, key));
    session.viewer = null;

    expect(second?.serverError).toBeUndefined();
    expect(second?.data?.id).toBe(first?.data?.id);
    expect(await usageRows()).toHaveLength(1);
    expect(await counter("card_usage", fx.projectNumber)).toBe(1);
  });

  it("같은 키 동시 두 번 → 행 1 · 둘 다 같은 id · K 카운터 1(패자 롤백 — 빈 번호 없음)", async () => {
    const fx = await cardProject();
    const key = randomUUID();
    const pres = await Promise.all([precheckCardUsage(fx.pm, lineInput(fx)), precheckCardUsage(fx.pm, lineInput(fx))]);
    const [a, b] = await Promise.all(pres.map((pre) => createCardUsage(fx.pm, lineInput(fx, 10_000, key), pre)));

    expect(a?.id).toBe(b?.id);
    expect(await usageRows()).toHaveLength(1);
    expect(await counter("card_usage", fx.projectNumber)).toBe(1);
  });

  it("남은 실행가 전액 · 같은 키 동시 두 번 → 상한 오류가 아니라 둘 다 같은 id · 행 1", async () => {
    const fx = await cardProject(100_000);
    const key = randomUUID();
    const pres = await Promise.all([precheckCardUsage(fx.pm, lineInput(fx, 100_000)), precheckCardUsage(fx.pm, lineInput(fx, 100_000))]);
    const results = await Promise.allSettled(pres.map((pre) => createCardUsage(fx.pm, lineInput(fx, 100_000, key), pre)));

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const ids = results.map((result) => (result.status === "fulfilled" ? result.value.id : null));
    expect(ids[0]).toBe(ids[1]);
    expect(await usageRows()).toHaveLength(1);
  });

  it("다른 행위자가 같은 키 → 남의 행을 돌려주지 않는다(없는 건 거부) · 행 수 그대로", async () => {
    const fx = await cardProject();
    const other = await cardProject();
    const key = randomUUID();
    await createCardUsage(fx.pm, lineInput(fx, 10_000, key), await precheckCardUsage(fx.pm, lineInput(fx)));

    await expect(reusableCardUsage(other.pm, key)).rejects.toBeInstanceOf(CardUsageRejectedError);
    session.viewer = other.pm;
    const outcome = await createCardUsageAction(cardActionInput(other, key));
    session.viewer = null;
    expect(outcome?.data).toBeUndefined();
    expect(outcome?.serverError).toBe("다른 저장이 먼저 됨 · 새로 고침");
    // 경합 갈래(잠금 뒤 재조회)도 같은 판정 — 남의 키를 실은 생성이 남의 행을 돌려주지 않는다.
    await expect(createCardUsage(other.pm, lineInput(other, 10_000, key), await precheckCardUsage(other.pm, lineInput(other)))).rejects.toBeInstanceOf(CardUsageRejectedError);
    expect(await usageRows()).toHaveLength(1);
  });

  it("키 없이 부르는 기존 경로(도메인 직접 호출)는 매번 새 행", async () => {
    const fx = await cardProject();
    await createCardUsage(fx.pm, lineInput(fx), await precheckCardUsage(fx.pm, lineInput(fx)));
    await createCardUsage(fx.pm, lineInput(fx), await precheckCardUsage(fx.pm, lineInput(fx)));
    expect(await usageRows()).toHaveLength(2);
    expect(await counter("card_usage", fx.projectNumber)).toBe(2);
  });
});

function purchaseActionInput(fx: PurchaseFx, idempotencyKey: string, amount = 110_000) {
  return { idempotencyKey, linkKind: "quote_line" as const, lineId: fx.onlineLine, itemName: "현수막 3장", linkUrl: null, currency: "KRW" as const, amount, memo: null };
}

describe("구매 요청 등록 중복 방지 키(06.5 D-6509)", () => {
  it("같은 행위자 · 같은 키 차례로 두 번 → 행 1 · 같은 id · C 카운터 1 · 두 번째는 사전 판정을 다시 돌지 않는다", async () => {
    const fx = await purchaseProject();
    const key = randomUUID();
    session.viewer = fx.pm;
    const first = await createPurchaseRequestAction(purchaseActionInput(fx, key));
    expect(first?.serverError).toBeUndefined();
    await setCompleted(fx.projectId);
    const second = await createPurchaseRequestAction(purchaseActionInput(fx, key));
    session.viewer = null;

    expect(second?.serverError).toBeUndefined();
    expect(second?.data).toEqual(first?.data);
    expect(await requestRows()).toHaveLength(1);
    expect(await counter("purchase_request", fx.projectNumber)).toBe(1);
  });

  it("같은 키 동시 두 번 → 행 1 · 둘 다 같은 id · C 카운터 1", async () => {
    const fx = await purchaseProject();
    const key = randomUUID();
    const input = { ...requestInput(fx.onlineLine), idempotencyKey: key };
    const pres = await Promise.all([precheckPurchaseRequest(fx.pm, input), precheckPurchaseRequest(fx.pm, input)]);
    const [a, b] = await Promise.all(pres.map((pre) => createPurchaseRequest(fx.pm, input, pre)));

    expect(a).toEqual(b);
    expect(await requestRows()).toHaveLength(1);
    expect(await counter("purchase_request", fx.projectNumber)).toBe(1);
  });

  it("남은 실행가 전액 · 같은 키 동시 두 번 → 상한 오류가 아니라 둘 다 같은 id · 행 1", async () => {
    // 온라인구매 줄 실행가 1,000,000 · 세금계산서(부가세 별도) — 예상 1,100,000의 공급가 추정이 남은 실행가 전액이다.
    const fx = await purchaseProject();
    const key = randomUUID();
    const input = { ...requestInput(fx.onlineLine, 1_100_000), idempotencyKey: key };
    const pres = await Promise.all([precheckPurchaseRequest(fx.pm, input), precheckPurchaseRequest(fx.pm, input)]);
    const results = await Promise.allSettled(pres.map((pre) => createPurchaseRequest(fx.pm, input, pre)));

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const ids = results.map((result) => (result.status === "fulfilled" ? result.value.id : null));
    expect(ids[0]).toBe(ids[1]);
    expect(await requestRows()).toHaveLength(1);
  });

  it("다른 행위자가 같은 키 → 남의 행을 돌려주지 않는다(없는 건 거부) · 행 수 그대로", async () => {
    const fx = await purchaseProject();
    const other = await purchaseProject();
    const key = randomUUID();
    const input = { ...requestInput(fx.onlineLine), idempotencyKey: key };
    await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));

    await expect(reusablePurchaseRequest(other.pm, key)).rejects.toBeInstanceOf(PurchaseRequestRejectedError);
    session.viewer = other.pm;
    const outcome = await createPurchaseRequestAction(purchaseActionInput(other, key));
    session.viewer = null;
    expect(outcome?.data).toBeUndefined();
    expect(outcome?.serverError).toBe("구매 요청 없음 · 새로 고침");
    const otherInput = { ...requestInput(other.onlineLine), idempotencyKey: key };
    await expect(createPurchaseRequest(other.pm, otherInput, await precheckPurchaseRequest(other.pm, otherInput))).rejects.toBeInstanceOf(PurchaseRequestRejectedError);
    expect(await requestRows()).toHaveLength(1);
  });

  it("키 없이 부르는 기존 경로(도메인 직접 호출)는 매번 새 행", async () => {
    const fx = await purchaseProject();
    const input = requestInput(fx.onlineLine);
    await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    await createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input));
    expect(await requestRows()).toHaveLength(2);
    expect(await counter("purchase_request", fx.projectNumber)).toBe(2);
  });
});
