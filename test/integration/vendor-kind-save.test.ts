import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines, reserveEntries, teams, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, ProjectInputRejectedError } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, SaveRejectedError, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import type { VendorKind } from "@/domain/vendors/kind";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

// 261006 사용자 결정 「바뀔 때만 막기」 — 갈래가 맞지 않는 거래처를 새로 고르거나 바꾸면 서버가 저장을 거부한다.
// 바뀌지 않은 저장 값은 갈래가 달라도 그대로 저장된다(기존 연결 유지). 옛 260907 projects.ts:2954 · quotes.ts:2284 · 리저브 트리거와 같은 규칙.

const NOT_CLIENT = "클라이언트 아님 · 클라이언트 거래처 고르기";
const NOT_SUPPLIER = "협력사 아님 · 협력사 거래처 고르기";

async function vendorOf(kind: VendorKind) {
  const name = `갈래저장-${kind}-${randomUUID()}`;
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind });
}

async function makePm() {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vks-${randomUUID()}@example.test`, name: "갈래저장 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return { pmUserId: userId, teamId: team.id };
}

async function rejectionOf<T>(promise: Promise<unknown>, type: new (...args: never[]) => T): Promise<T> {
  const outcome = await promise.then(
    () => new Error("거부되지 않았다"),
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(type);
  return outcome as T;
}

describe("프로젝트 클라이언트 — client · both만 (등록 · 복사, 등록 뒤 클라이언트는 바꾸는 경로가 없다)", () => {
  it("협력사를 클라이언트로 고르면 클라이언트 칸 오류이고 프로젝트가 생기지 않는다", async () => {
    const { pmUserId, teamId } = await makePm();
    const supplier = await vendorOf("supplier");
    const name = `갈래거부-${randomUUID()}`;

    const error = await rejectionOf(createProject(SYSTEM_VIEWER, { clientId: supplier.id, teamId, pmUserId, name }), ProjectInputRejectedError);

    expect(error.errors).toContainEqual({ field: "clientId", reason: NOT_CLIENT });
    expect(await db.select().from(projects).where(eq(projects.name, name))).toHaveLength(0);
  });

  it.each(["client", "both"] as const)("%s 거래처는 클라이언트로 등록된다", async (kind) => {
    const { pmUserId, teamId } = await makePm();
    const vendor = await vendorOf(kind);
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId, pmUserId, name: `갈래통과-${randomUUID()}` });
    expect(project.clientId).toBe(vendor.id);
  });

  it("복사 등록은 출처 클라이언트를 그대로 두면 그 사이 협력사가 됐어도 저장된다(기존 연결 유지)", async () => {
    const { pmUserId, teamId } = await makePm();
    const client = await vendorOf("client");
    const original = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name: `복사원본-${randomUUID()}` });
    await db.update(vendors).set({ kind: "supplier" }).where(eq(vendors.id, client.id));

    const copy = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name: `복사본-${randomUUID()}`, copyFromProjectId: original.id });

    expect(copy.clientId).toBe(client.id);
  });

  it("복사 등록에서 클라이언트를 협력사로 바꾸면 거부한다", async () => {
    const { pmUserId, teamId } = await makePm();
    const client = await vendorOf("client");
    const supplier = await vendorOf("supplier");
    const original = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name: `복사원본-${randomUUID()}` });
    const name = `복사본-${randomUUID()}`;

    const error = await rejectionOf(
      createProject(SYSTEM_VIEWER, { clientId: supplier.id, teamId, pmUserId, name, copyFromProjectId: original.id }),
      ProjectInputRejectedError,
    );

    expect(error.errors).toContainEqual({ field: "clientId", reason: NOT_CLIENT });
    expect(await db.select().from(projects).where(eq(projects.name, name))).toHaveLength(0);
  });
});

describe("견적 줄 거래처 — supplier · both만 (새 줄 · 수정 · 합성 저장)", () => {
  async function setup() {
    const { pmUserId, teamId } = await makePm();
    const client = await vendorOf("client");
    const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name: `갈래줄-${randomUUID()}` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const subcategory = (await firstSelectableSubcategory()).value;
    return { projectId: project.id, revisionId: revision.id, subcategory };
  }

  const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });
  const newLine = (subcategory: string, vendorId: string | null): QuoteLineWriteRow => ({
    id: randomUUID(),
    isNew: true,
    subcategory,
    itemName: `갈래 줄-${randomUUID()}`,
    vendorId,
    unitPrice: krw(0),
    execution: krw(10_000),
  });

  async function reload(id: string) {
    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
    if (!row) throw new Error("줄이 없습니다");
    return row;
  }

  function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow>): QuoteLineWriteRow {
    return {
      id: row.id,
      version: row.version,
      subcategory: row.subcategory,
      itemName: row.itemName,
      vendorId: row.vendorId,
      quantity: Number(row.quantity),
      unitPrice: krw(row.unitPriceAmountKrw),
      execution: krw(row.executionAmountKrw),
      lineStatus: row.lineStatus,
      ...patch,
    };
  }

  it("새 줄에 클라이언트 거래처를 고르면 거래처 칸 오류이고 아무것도 저장되지 않는다", async () => {
    const { revisionId, subcategory } = await setup();
    const client = await vendorOf("client");
    const line = newLine(subcategory, client.id);

    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] }), SaveRejectedError);

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: line.id, field: "vendorId", label: "거래처", reason: NOT_SUPPLIER }));
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).toHaveLength(0);
  });

  it("기존 줄의 거래처를 클라이언트 거래처로 바꾸면 거부되고 저장 값이 그대로다", async () => {
    const { revisionId, subcategory } = await setup();
    const supplier = await vendorOf("supplier");
    const client = await vendorOf("client");
    const line = newLine(subcategory, supplier.id);
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });

    const error = await rejectionOf(
      saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(await reload(line.id), { vendorId: client.id })] }),
      SaveRejectedError,
    );

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: line.id, field: "vendorId", reason: NOT_SUPPLIER }));
    expect((await reload(line.id)).vendorId).toBe(supplier.id);
  });

  it("저장된 거래처가 그 사이 클라이언트가 됐어도 바꾸지 않으면 다른 칸을 저장할 수 있다", async () => {
    const { revisionId, subcategory } = await setup();
    const vendor = await vendorOf("supplier");
    const line = newLine(subcategory, vendor.id);
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });
    await db.update(vendors).set({ kind: "client" }).where(eq(vendors.id, vendor.id));

    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(await reload(line.id), { itemName: "이름만 바꿈" })] });

    const after = await reload(line.id);
    expect(after.itemName).toBe("이름만 바꿈");
    expect(after.vendorId).toBe(vendor.id);
  });

  it("응답을 잃은 새 줄 재전송은 그 사이 거래처가 클라이언트가 됐어도 거부하지 않는다(저장된 값 · ENG-D10)", async () => {
    const { revisionId, subcategory } = await setup();
    const vendor = await vendorOf("supplier");
    const line = newLine(subcategory, vendor.id);
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });
    await db.update(vendors).set({ kind: "client" }).where(eq(vendors.id, vendor.id));

    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });

    expect((await reload(line.id)).vendorId).toBe(vendor.id);
  });

  it("거래처 없는 새 줄은 갈래 판정 없이 저장된다", async () => {
    const { revisionId, subcategory } = await setup();
    const line = newLine(subcategory, null);
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });
    expect((await reload(line.id)).vendorId).toBeNull();
  });

  it.each(["supplier", "both"] as const)("%s 거래처는 새 줄 · 바꾸기 모두 저장된다", async (kind) => {
    const { revisionId, subcategory } = await setup();
    const first = await vendorOf(kind);
    const second = await vendorOf(kind);
    const line = newLine(subcategory, first.id);
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [line] });
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(await reload(line.id), { vendorId: second.id })] });
    expect((await reload(line.id)).vendorId).toBe(second.id);
  });

  it("합성 저장(saveProjectLedger — 붙여넣기 저장 경로)도 같은 판정이다", async () => {
    const { projectId, revisionId, subcategory } = await setup();
    const client = await vendorOf("client");
    const line = newLine(subcategory, client.id);

    const error = await rejectionOf(
      saveProjectLedger(SYSTEM_VIEWER, projectId, { seenStatus: "bidding", quoteLines: { revisionId, rows: [line] } }),
      SaveRejectedError,
    );

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: line.id, field: "vendorId", reason: NOT_SUPPLIER }));
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).toHaveLength(0);
  });
});

describe("리저브 클라이언트 — client · both만 (새 줄, 기존 줄은 클라이언트 잠김)", () => {
  async function createFinanceViewer(): Promise<Viewer> {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vks-fin-${randomUUID()}@example.test`, name: "갈래저장 경영관리", roleId: "role-ceo" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "reserve.amount", visible: true });
    return { id: userId, roleId: "role-ceo" };
  }

  const deposit = (clientId: string, amount = 1_000_000): ReserveWriteRow => ({
    id: randomUUID(),
    isNew: true,
    clientId,
    entryDate: "2026-03-01",
    direction: "deposit",
    amount: { currency: "KRW", amount, fxRate: 1 },
  });

  it("새 줄에 협력사를 고르면 클라이언트 칸 오류이고 줄이 생기지 않는다", async () => {
    const finance = await createFinanceViewer();
    const supplier = await vendorOf("supplier");
    const row = deposit(supplier.id);

    const error = await rejectionOf(saveReserves(finance, { rows: [row] }), SaveRejectedError);

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: row.id, field: "clientId", label: "클라이언트", reason: NOT_CLIENT }));
    expect(await db.select().from(reserveEntries).where(eq(reserveEntries.clientId, supplier.id))).toHaveLength(0);
  });

  it("저장된 줄의 클라이언트가 그 사이 협력사가 됐어도 그 줄의 금액을 고쳐 저장할 수 있다", async () => {
    const finance = await createFinanceViewer();
    const vendor = await vendorOf("client");
    const row = deposit(vendor.id);
    await saveReserves(finance, { rows: [row] });
    await db.update(vendors).set({ kind: "supplier" }).where(eq(vendors.id, vendor.id));

    await saveReserves(finance, { rows: [{ ...row, isNew: undefined, version: 1, amount: { currency: "KRW", amount: 2_000_000, fxRate: 1 } }] });

    const [stored] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, row.id));
    expect(stored?.amountAmountKrw).toBe(2_000_000);
    expect(stored?.clientId).toBe(vendor.id);
  });

  it.each(["client", "both"] as const)("%s 거래처는 새 줄 클라이언트로 저장된다", async (kind) => {
    const finance = await createFinanceViewer();
    const vendor = await vendorOf(kind);
    await saveReserves(finance, { rows: [deposit(vendor.id)] });
    expect(await db.select().from(reserveEntries).where(eq(reserveEntries.clientId, vendor.id))).toHaveLength(1);
  });
});
