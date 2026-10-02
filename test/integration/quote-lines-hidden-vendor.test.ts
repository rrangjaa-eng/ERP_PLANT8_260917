import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { firstSelectableSubcategory } from "../support/quote-subcategory";

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
  const subcategory = await firstSelectableSubcategory();
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
  return { pm, client, projectId: project.id, revisionId: revision.id, lineId, subcategory: subcategory.value };
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

  // /review 적대 검토 — 가려진 채 그린 줄은 거래처를 null로 들고 있다. 그 사이 거래처가 보이게 바뀌어도 그 줄은
  // 거래처를 가린 채 그렸다는 표시(vendorHidden)를 실어, 본 적 없는 거래처를 지우지 않는다.
  const editRow = (lineId: string, version: number, subcategory: string, vendorId?: string) => ({
    id: lineId,
    version,
    subcategory,
    itemName: "가림 줄 고침",
    vendorId,
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
      lineStatus: "not_started" as const,
      note: null,
    },
  });

  it("가려진 채 그린 줄은 노출표가 바뀐 뒤 저장해도 거래처를 지우지 않는다", async () => {
    const { pm, client, projectId, revisionId, lineId, subcategory } = await setup(false);
    const [line] = await listQuoteLines(pm, revisionId, ctx);
    if (!line || !pm.roleId) throw new Error("줄 · 계급이 없습니다");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: pm.roleId, infoItem: "vendor.value", visible: true });

    await saveProjectLedger(pm, projectId, {
      seenStatus: "bidding",
      quoteLines: { revisionId, rows: [{ ...editRow(lineId, line.version, subcategory), vendorHidden: true as const }] },
    });

    const [stored] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineId));
    expect(stored?.itemName).toBe("가림 줄 고침");
    expect(stored?.vendorId).toBe(client.id);
  });

  // 가려진 때 보관한 편집(baseline 거래처 null)을 거래처가 보이는 화면에서 복원해 거래처를 바꾸면 그 값이 저장된다.
  it("거래처가 보이는 줄은 baseline 거래처가 null이어도 고른 거래처를 저장한다", async () => {
    const { pm, revisionId, lineId, subcategory } = await setup(true);
    const [line] = await listQuoteLines(pm, revisionId, ctx);
    if (!line) throw new Error("줄이 없습니다");
    const other = await insertVendor(SYSTEM_VIEWER, { name: `다른거래처-${randomUUID()}`, normalizedName: `다른거래처-${randomUUID()}` });

    await saveQuoteLines(pm, revisionId, { rows: [editRow(lineId, line.version, subcategory, other.id)] });

    const [stored] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineId));
    expect(stored?.vendorId).toBe(other.id);
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

  const copyRow = (subcategory: string, duplicatedFrom: string, id: string = randomUUID()) => ({
    id,
    isNew: true as const,
    duplicatedFrom,
    lineKind: "quote" as const,
    subcategory,
    itemName: "가림 줄",
    quantity: 1,
    unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
  });

  // 원본 확인은 계급과 무관하다 — 거래처가 보이는 계급도 같은 규칙.
  it.each([false, true])("복제 원본이 다른 차수의 줄이거나 없는 id면 저장을 거부한다(거래처 보임 %s)", async (vendorShown) => {
    const { pm, revisionId, subcategory } = await setup(vendorShown);
    const other = await setup(vendorShown);

    for (const source of [other.lineId, randomUUID()]) {
      await expect(saveQuoteLines(pm, revisionId, { rows: [copyRow(subcategory, source)] })).rejects.toThrow("차수와 프로젝트가 맞지 않음");
    }
    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
    expect(rows).toHaveLength(1);
  });

  it("원본을 같은 저장에서 지우며 복제해도 새 줄이 원본 거래처를 받는다", async () => {
    const { pm, client, revisionId, lineId, subcategory } = await setup(false);
    const copyId = randomUUID();

    await saveQuoteLines(pm, revisionId, { rows: [copyRow(subcategory, lineId, copyId)], archivedLineIds: [lineId] });

    const [copy] = await db.select().from(quoteLines).where(eq(quoteLines.id, copyId));
    expect(copy?.vendorId).toBe(client.id);
  });

  // 적대 검토(PR #135) P3 — 가려진 때 복제한 줄을 거래처가 보이는 화면에서 복원해 저장해도 원본 거래처를 받는다.
  it("거래처를 가린 채 복제한 줄은 거래처가 보이는 계급이 저장해도 원본 거래처를 받는다", async () => {
    const { pm, client, revisionId, lineId, subcategory } = await setup(true);
    const copyId = randomUUID();

    await saveQuoteLines(pm, revisionId, { rows: [{ ...copyRow(subcategory, lineId, copyId), vendorId: null, vendorHidden: true as const }] });

    const [copy] = await db.select().from(quoteLines).where(eq(quoteLines.id, copyId));
    expect(copy?.vendorId).toBe(client.id);
  });
});
