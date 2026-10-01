import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";

// quick 261001-85g(Codex 리뷰 P1) — 거래처 정보(vendor.value)가 가려진 계급에게 견적 줄 DTO는 vendorId를 싣지 않는다
// (화면이 열을 빼도 RSC 페이로드에 거래처 id가 남던 경로). 그 계급이 줄을 저장해도 서버가 기존 거래처를 그대로 둔다.
async function makePm(vendorShown: boolean): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `가림 PM-${randomUUID()}`, workScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `hv-${randomUUID()}@example.test`, name: "가림 PM", roleId: role.id });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: vendorShown });
  return { id: userId, roleId: role.id };
}

async function setup(vendorShown: boolean) {
  const pm = await makePm(vendorShown);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `가림거래처-${randomUUID()}`, normalizedName: `가림거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `가림-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: lineId,
        isNew: true as const,
        lineKind: "quote" as const,
        subcategory: subcategory.value,
        itemName: "가림 줄",
        vendorId: client.id,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
      },
    ],
  });
  return { pm, client, revisionId: revision.id, lineId, subcategory: subcategory.value };
}

const ctx = { status: "estimating", canWrite: true, canAdjust: false } as const;

describe("거래처 정보가 가려진 계급의 견적 줄(Codex 리뷰 P1)", () => {
  it("DTO에 vendorId가 없고, 보이는 계급에는 있다", async () => {
    const hidden = await setup(false);
    const [hiddenLine] = await listQuoteLines(hidden.pm, hidden.revisionId, ctx);
    expect(hiddenLine).toBeDefined();
    expect(hiddenLine && "vendorId" in hiddenLine).toBe(false);

    const shown = await setup(true);
    const [shownLine] = await listQuoteLines(shown.pm, shown.revisionId, ctx);
    expect(shownLine?.vendorId).toBe(shown.client.id);
  });

  it("가려진 계급이 줄을 고쳐 저장해도(vendorId 없이) 거래처가 그대로다", async () => {
    const { pm, client, revisionId, lineId, subcategory } = await setup(false);
    const [line] = await listQuoteLines(pm, revisionId, ctx);
    if (!line) throw new Error("줄이 없습니다");

    await saveQuoteLines(pm, revisionId, {
      rows: [
        {
          id: lineId,
          version: line.version,
          subcategory,
          itemName: "가림 줄 고침",
          quantity: 1,
          unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
          baseline: {
            subcategory,
            itemName: "가림 줄",
            vendorId: null,
            quantity: 1,
            unitPriceAmountKrw: 100_000,
            executionAmountKrw: 80_000,
            lineStatus: "not_started",
            note: null,
          },
        },
      ],
    });

    const [stored] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineId));
    expect(stored?.itemName).toBe("가림 줄 고침");
    expect(stored?.vendorId).toBe(client.id);
  });

  // Codex 리뷰 P1(PR #125) — 원본 줄이 요청에 없어도(바뀌지 않은 줄) 복제한 새 줄은 원본의 거래처를 받는다.
  it("가려진 계급이 바뀌지 않은 줄을 복제해 저장하면 새 줄이 원본 거래처를 받는다", async () => {
    const { pm, client, revisionId, lineId, subcategory } = await setup(false);
    const copyId = randomUUID();

    await saveQuoteLines(pm, revisionId, {
      rows: [
        {
          id: copyId,
          isNew: true as const,
          duplicatedFrom: lineId,
          lineKind: "quote" as const,
          subcategory,
          itemName: "가림 줄",
          quantity: 1,
          unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
        },
      ],
    });

    const [copy] = await db.select().from(quoteLines).where(eq(quoteLines.id, copyId));
    expect(copy?.vendorId).toBe(client.id);
  });

  it("복제 원본이 다른 차수의 줄이면 저장을 거부한다", async () => {
    const { pm, revisionId, subcategory } = await setup(false);
    const other = await setup(false);

    await expect(
      saveQuoteLines(pm, revisionId, {
        rows: [
          {
            id: randomUUID(),
            isNew: true as const,
            duplicatedFrom: other.lineId,
            lineKind: "quote" as const,
            subcategory,
            itemName: "남의 줄 복제",
            quantity: 1,
            unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
            execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
          },
        ],
      }),
    ).rejects.toThrow("차수와 프로젝트가 맞지 않음");
    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
    expect(rows).toHaveLength(1);
  });
});
