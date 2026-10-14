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
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";

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

