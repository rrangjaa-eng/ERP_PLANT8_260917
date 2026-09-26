import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { saveRevenue } from "@/domain/revenue";
import { KRW_COLUMN_MAX } from "@/domain/money";

// 버그: 원화 금액 열이 int4라 약 21.4억(2,147,483,647원)을 넘는 금액은 저장할 수 없었다(사용자 보고는
// "99억 이상"). bigint로 넓힌 뒤 99억 같은 실제 금액과 상한 끝값(999,999,999,999원)이 실제 Postgres에
// 그대로 저장되는지 못박는다. 상한 초과 거부는 domain/money·quote-lines·revenue-entries 테스트가 맡는다.
const NINETY_NINE_EOK = 9_900_000_000;
const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

async function setupProject(preEstimateAmount?: number) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
    ...(preEstimateAmount === undefined ? {} : { preEstimate: krw(preEstimateAmount) }),
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다");

  return { project, revision, subcategoryValue: subcategory.value };
}

describe("int4 상한을 넘는 원화 금액 저장 (실제 Postgres)", () => {
  it.each([NINETY_NINE_EOK, KRW_COLUMN_MAX])("총 매출 예상가 %d원이 저장되고 그대로 읽힌다", async (amount) => {
    const { project } = await setupProject(amount);

    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.preEstimateAmountKrw).toBe(amount);
  });

  it("매출 발행 줄 99억 원이 저장되고 그대로 읽힌다", async () => {
    const { project } = await setupProject();

    await saveRevenue(SYSTEM_VIEWER, project.id, {
      issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: "2026-09-01", amount: krw(NINETY_NINE_EOK) }],
    });

    const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id));
    expect(row?.amountAmountKrw).toBe(NINETY_NINE_EOK);
  });

  it("견적 줄 단가 99억 원 × 수량 3의 견적가(297억)·차익이 저장된다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const id = randomUUID();

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id,
          isNew: true,
          subcategory: subcategoryValue,
          itemName: "대형 행사 총괄",
          quantity: 3,
          unitPrice: krw(NINETY_NINE_EOK),
          execution: krw(NINETY_NINE_EOK),
        },
      ],
    });

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
    expect(row?.unitPriceAmountKrw).toBe(NINETY_NINE_EOK);
    expect(row?.executionAmountKrw).toBe(NINETY_NINE_EOK);
    expect(row?.quoteAmountKrw).toBe(NINETY_NINE_EOK * 3);
    expect(row?.profitKrw).toBe(NINETY_NINE_EOK * 2);
  });
});
