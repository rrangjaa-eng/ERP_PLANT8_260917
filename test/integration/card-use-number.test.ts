import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, documentCounters } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createCardUsage, precheckCardUsage, precheckCardUsageUpdate, updateCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { completePurchaseRequest, precheckPurchaseCompletion } from "@/domain/purchase-requests";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";
import { purchaseProject, request } from "./fixtures/purchase-requests";

// 06.5 D-6503: 카드 사용 K 번호 — 프로젝트 `{프로젝트 번호}-K0001`(카운터 card_usage · period = 프로젝트 번호),
// 팀 비용 `{YY}{팀 비용 접두어}-K0001`(카운터 card_usage_team · period = KST 연도).

type NumberFx = { pm: Viewer; cardId: string; projectId: string; projectNumber: string; lineId: string };

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// 카드 소지자가 담당 PM인 프로젝트 · 실행가 넉넉한 견적 줄 하나.
async function numberProject(): Promise<NumberFx> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `번호본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `번호팀-${randomUUID()}` });
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "개인 카드", kind: "personal", holderUserId: pm.id });
  if (!card.id) throw new Error("카드 id 없음");
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `카드번호-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
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
        unitPrice: { currency: "KRW" as const, amount: 50_000_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 40_000_000, fxRate: 1 },
      },
    ],
  });
  return { pm, cardId: card.id, projectId: project.id, projectNumber: project.number, lineId };
}

function lineInput(fx: NumberFx, amount = 10_000): CardUsageInput {
  return { corpCardId: fx.cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "quote_line", lineId: fx.lineId, memo: null };
}

function teamInput(fx: NumberFx, amount = 10_000): CardUsageInput {
  return { corpCardId: fx.cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "team_cost", memo: null };
}

async function createOnTeam(fx: NumberFx, now: Date): Promise<string> {
  const input = teamInput(fx);
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input, { now }))).id;
}

async function createOnLine(fx: NumberFx): Promise<string> {
  const input = lineInput(fx);
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).id;
}

async function numberOf(usageId: string): Promise<string | null> {
  const [row] = await db.select({ number: corpCardUsages.number }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
  return row?.number ?? null;
}

async function counter(counterKey: string, period: string): Promise<number> {
  const [row] = await db
    .select({ value: documentCounters.value })
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)));
  return row?.value ?? 0;
}

describe("카드 사용 K 번호(06.5 D-6503)", () => {
  it("프로젝트 줄에 이은 두 건 → `{프로젝트 번호}-K0001` · `-K0002` · 구매 요청 C 카운터는 그대로", async () => {
    const fx = await numberProject();
    const before = await counter("purchase_request", fx.projectNumber);
    const first = await createOnLine(fx);
    const second = await createOnLine(fx);

    expect(await numberOf(first)).toBe(`${fx.projectNumber}-K0001`);
    expect(await numberOf(second)).toBe(`${fx.projectNumber}-K0002`);
    expect(await counter("card_usage", fx.projectNumber)).toBe(2);
    expect(await counter("purchase_request", fx.projectNumber)).toBe(before);
  });
});

// 구매 권한자(`cards.purchases` write) — 견적 금액 · 카드 사용 · 구매 요청 값을 본다(purchase-requests.test.ts와 같은 꼴).
async function purchaser(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `구매처리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `처리본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `처리팀-${randomUUID()}` });
  return makePerson("구매담당", role.id, team.name);
}

const KST_2026 = new Date("2026-06-01T03:00:00Z");

describe("카드 사용 K 번호 — 팀 비용 · 구매 완료 · 동시 · 불변(06.5 D-6503 Task 2)", () => {
  it("팀 비용 — KST 2026-12-31 23:59:59 → `26T-K0001` · KST 2027-01-01 00:00 → `27T-K0001`(새해 카운터)", async () => {
    const fx = await numberProject();
    const lastOf2026 = await createOnTeam(fx, new Date("2026-12-31T14:59:59Z"));
    const firstOf2027 = await createOnTeam(fx, new Date("2026-12-31T15:00:00Z"));

    expect(await numberOf(lastOf2026)).toBe("26T-K0001");
    expect(await numberOf(firstOf2027)).toBe("27T-K0001");
    expect(await counter("card_usage_team", "2026")).toBe(1);
    expect(await counter("card_usage_team", "2027")).toBe(1);
  });

  it("구매 완료로 생긴 프로젝트 첫 카드 사용 → `{프로젝트 번호}-K0001` · 카드 사용 카운터 1 · 요청 C 번호 그대로(P1-B)", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const buyer = await purchaser();
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "공용 카드", kind: "shared" });
    if (!card.id) throw new Error("카드 id 없음");
    const input = { requestId: created.id, version: 1, corpCardId: card.id, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW" as const, amount: 110_000, fxRate: 1 }, evidenceTypeCode: "invoice", memo: null };
    const done = await completePurchaseRequest(buyer, input, await precheckPurchaseCompletion(buyer, input));

    expect(await numberOf(done.usageId)).toBe(`${fx.projectNumber}-K0001`);
    expect(await counter("card_usage", fx.projectNumber)).toBe(1);
    expect(created.number).toBe(`${fx.projectNumber}-C0001`);
    expect(await counter("purchase_request", fx.projectNumber)).toBe(1);
  });

  it("같은 프로젝트 줄 6건 동시 → K0001~K0006 · 겹침 0", async () => {
    const fx = await numberProject();
    const pres = await Promise.all(Array.from({ length: 6 }, () => precheckCardUsage(fx.pm, lineInput(fx))));
    const results = await Promise.allSettled(pres.map((pre) => createCardUsage(fx.pm, lineInput(fx), pre)));

    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    const numbers = await Promise.all(results.map((result) => (result.status === "fulfilled" ? numberOf(result.value.id) : null)));
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5, 6].map((seq) => `${fx.projectNumber}-K000${seq}`));
  });

  it("팀 비용 6건 동시 → 26T-K0001~26T-K0006 · 겹침 0", async () => {
    const fx = await numberProject();
    const pres = await Promise.all(Array.from({ length: 6 }, () => precheckCardUsage(fx.pm, teamInput(fx), { now: KST_2026 })));
    const results = await Promise.allSettled(pres.map((pre) => createCardUsage(fx.pm, teamInput(fx), pre)));

    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    const numbers = await Promise.all(results.map((result) => (result.status === "fulfilled" ? numberOf(result.value.id) : null)));
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5, 6].map((seq) => `26T-K000${seq}`));
  });

  it("프로젝트 건을 팀 비용으로, 팀 비용 건을 프로젝트로 고쳐도 번호 그대로", async () => {
    const fx = await numberProject();
    const onLine = await createOnLine(fx);
    const onTeam = await createOnTeam(fx, KST_2026);
    const toTeam = { ...teamInput(fx), id: onLine, version: 1 };
    await updateCardUsage(fx.pm, toTeam, await precheckCardUsageUpdate(fx.pm, toTeam));
    const toLine = { ...lineInput(fx), id: onTeam, version: 1 };
    await updateCardUsage(fx.pm, toLine, await precheckCardUsageUpdate(fx.pm, toLine));

    expect(await numberOf(onLine)).toBe(`${fx.projectNumber}-K0001`);
    expect(await numberOf(onTeam)).toBe("26T-K0001");
    const [moved] = await db.select({ linkKind: corpCardUsages.linkKind }).from(corpCardUsages).where(eq(corpCardUsages.id, onLine));
    expect(moved?.linkKind).toBe("team_cost");
  });
});
