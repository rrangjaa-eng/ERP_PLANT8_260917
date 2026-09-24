import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, listQuoteLines } from "@/domain/quotes/lines";

// 버그: QUOTE_LINE_DTO_SPEC이 id·itemName 등 비금액 필드까지 전부
// quote.amount로 게이트한다. quote.amount를 꺼두면 줄이 통째로 {}가 되어
// id·itemName을 쓰는 화면이 깨진다 — 비금액 필드는 project.value로 게이트해야
// 한다.
async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { project, revision, pmUserId, subcategoryValue: subcategory.value };
}

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

describe("quote.amount를 꺼도 견적 줄의 id·itemName은 남는다", () => {
  // 공유 역할(DEFAULT_ROLE_ID)의 노출표를 바꾸므로 매 테스트 뒤 되돌린다 — 다른 테스트와 격리.
  afterEach(async () => {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "quote.amount", visible: true });
  });

  it("quote.amount visibility가 false여도 listQuoteLines는 id·itemName이 있는 행을 돌려준다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: subcategoryValue, itemName: "항목A", unitPrice: krw(100), execution: krw(0) },
    ]);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "quote.amount", visible: false });
    const pmViewer = { id: "pm-viewer", roleId: DEFAULT_ROLE_ID };

    const rows = await listQuoteLines(pmViewer, revision.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBeTruthy();
    expect(rows[0]?.itemName).toBe("항목A");
    expect(rows[0]?.unitPrice).toBeUndefined();
  });
  it("quote.amount를 볼 수 없는 사람의 견적 줄 저장은 거부되고 금액이 0으로 덮이지 않는다(/ship 리뷰)", async () => {
    const { revision, pmUserId, subcategoryValue } = await setupProject();
    const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: subcategoryValue, itemName: "항목A", unitPrice: krw(100), execution: krw(50) },
    ]);
    const line = saved.lines[0];
    if (!line) throw new Error("줄 저장 실패");

    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "quote.amount", visible: false });
    const pm = { id: pmUserId, roleId: DEFAULT_ROLE_ID };

    await expect(
      saveQuoteLines(pm, revision.id, [
        { id: line.id, version: line.version, subcategory: subcategoryValue, itemName: "이름만 바꿈", unitPrice: krw(0), execution: krw(0) },
      ]),
    ).rejects.toThrow();

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, line.id));
    expect(row?.itemName).toBe("항목A");
    expect(Number(row?.unitPriceAmountKrw)).toBe(100);
  });
});
