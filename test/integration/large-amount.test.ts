import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, SaveRejectedError } from "@/domain/quotes/lines";
import { saveRevenue } from "@/domain/revenue";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 버그: 금액이 약 21.4억(int4 상한 2,147,483,647)을 넘으면 원화 환산액
// 열이 넘쳐 저장이 실패했다(사용자 보고는 "99억 이상"). 원화 금액 열이
// 담아야 하는 크기를 실제 Postgres로 못박는다.
const OVER_INT4 = 2_147_483_648;
const NINETY_NINE_EOK = 9_900_000_000;
const ONE_JO = 1_000_000_000_000;

async function setupProject() {
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
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다");

  const pm: Viewer = { id: pmUserId, roleId: DEFAULT_ROLE_ID };
  return { project, revision, pm, subcategoryValue: subcategory.value };
}

describe("int4 상한을 넘는 원화 금액 저장 (실제 Postgres)", () => {
  it.each([OVER_INT4, NINETY_NINE_EOK])("계약 금액 %d원이 저장되고 그대로 읽힌다", async (amount) => {
    const { project, pm } = await setupProject();

    await saveRevenue(pm, project.id, { contract: { currency: "KRW", amount, fxRate: 1 } });

    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.contractAmountKrw).toBe(amount);
  });

  it("매출 발행 줄 99억 원이 저장되고 그대로 읽힌다", async () => {
    const { project } = await setupProject();

    const result = await saveRevenue(SYSTEM_VIEWER, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: NINETY_NINE_EOK, fxRate: 1 } }],
    });

    const entry = result?.issuedEntries?.[0];
    expect(entry?.amount.amountKrw).toBe(NINETY_NINE_EOK);
    const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, entry!.id));
    expect(row?.amountAmountKrw).toBe(NINETY_NINE_EOK);
  });

  it("견적 줄 단가 99억 원 × 수량 3의 견적가·차익이 저장된다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const result = await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "대형 행사 총괄",
        quantity: 3,
        unitPrice: { currency: "KRW", amount: NINETY_NINE_EOK, fxRate: 1 },
        execution: { currency: "KRW", amount: NINETY_NINE_EOK, fxRate: 1 },
      },
    ]);

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, result.lines[0]!.id));
    expect(row?.unitPriceAmountKrw).toBe(NINETY_NINE_EOK);
    expect(row?.executionAmountKrw).toBe(NINETY_NINE_EOK);
    expect(row?.quoteAmountKrw).toBe(NINETY_NINE_EOK * 3);
    expect(row?.profitKrw).toBe(NINETY_NINE_EOK * 2);
  });
});

// /review 후속 — bigint로 넓힌 뒤 상한이 없으면 오타·붙여넣기로 19자리
// 금액이 저장돼 /projects 합계(::bigint)가 넘치고, 2^53을 넘는 값은 조용히
// 반올림된다. 원화 금액은 1조 원 미만만 받고, 넘으면 아무것도 쓰지 않는다.
describe("원화 금액 상한 1조 원 (실제 Postgres)", () => {
  it("계약 금액 999,999,999,999원은 저장되고 1조 원은 거부된다", async () => {
    const { project, pm } = await setupProject();

    await saveRevenue(pm, project.id, { contract: { currency: "KRW", amount: ONE_JO - 1, fxRate: 1 } });
    await expect(
      saveRevenue(pm, project.id, { contract: { currency: "KRW", amount: ONE_JO, fxRate: 1 } }),
    ).rejects.toBeInstanceOf(UserFacingError);

    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.contractAmountKrw).toBe(ONE_JO - 1);
  });

  it("환산액이 1조 원 이상인 외화 계약 금액은 거부된다", async () => {
    const { project, pm } = await setupProject();

    await expect(
      saveRevenue(pm, project.id, { contract: { currency: "USD", amount: 1_000_000_000, fxRate: 1000 } }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("1조 원 매출 발행 줄은 거부되고 아무 줄도 쓰이지 않는다", async () => {
    const { project } = await setupProject();

    await expect(
      saveRevenue(SYSTEM_VIEWER, project.id, {
        issuedEntries: [
          { entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1_000, fxRate: 1 } },
          { entryDate: "2026-09-02", amount: { currency: "KRW", amount: ONE_JO, fxRate: 1 } },
        ],
      }),
    ).rejects.toBeInstanceOf(UserFacingError);

    const rows = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id));
    expect(rows).toHaveLength(0);
  });

  it("단가·실행가가 1조 원이면 그 칸의 형식 오류로 전부 거부된다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "상한 초과",
        unitPrice: { currency: "KRW", amount: ONE_JO, fxRate: 1 },
        execution: { currency: "KRW", amount: ONE_JO, fxRate: 1 },
      },
    ]);

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    const error = await attempt.catch((e: unknown) => e);
    expect(error instanceof SaveRejectedError && error.formatErrors.map((f) => f.field)).toEqual([
      "unitPrice",
      "execution",
    ]);
    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    expect(rows).toHaveLength(0);
  });

  it("수량 × 단가가 1조 원 이상이면 수량 칸의 형식 오류로 거부된다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "수량 곱 초과",
        quantity: 1_000,
        unitPrice: { currency: "KRW", amount: 1_000_000_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);

    const error = await attempt.catch((e: unknown) => e);
    expect(error instanceof SaveRejectedError && error.formatErrors.map((f) => f.field)).toEqual(["quantity"]);
  });
});
