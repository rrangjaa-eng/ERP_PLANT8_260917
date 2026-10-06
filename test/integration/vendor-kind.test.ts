import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, corpCards, projects, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createVendor, updateVendor } from "@/domain/vendors";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { listReserveReferences, listReserves, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { listProjectFormReferences } from "@/domain/projects/references";
import { searchVendorsForPick } from "@/domain/expenses/pick";
import { listQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";

// 261006-biv — 거래처 갈래(vendors.kind). 저장 · 기본값 · CHECK · 마이그레이션 채우기(쓰임 기반).

async function makeVendorWriter(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `거래처 쓰기-${randomUUID()}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vk-${randomUUID()}@example.test`, name: `갈래 사람-${randomUUID()}`, roleId: role.id });
  return { id: userId, roleId: role.id };
}

// reserve-entries.test.ts createFinanceViewer와 같은 결 — 리저브 쓰기(pnl)와 금액 노출.
async function createFinanceViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vk-fin-${randomUUID()}@example.test`, name: "갈래 경영관리", roleId: "role-ceo" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "reserve.amount", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

function reserveDeposit(clientId: string): ReserveWriteRow {
  return { id: randomUUID(), isNew: true, clientId, entryDate: "2026-03-01", direction: "deposit", amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } };
}

async function plainVendor(label: string) {
  const name = `${label}-${randomUUID()}`;
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
}

async function kindOf(id: string): Promise<string | undefined> {
  const [row] = await db.select({ kind: vendors.kind }).from(vendors).where(eq(vendors.id, id)).limit(1);
  return row?.kind;
}

// 마이그레이션 원문에서 채우기 UPDATE 문만 뽑는다 — 번호가 아니라 `_vendor_kind.sql` 꼬리로 찾는다(main과 번호가 겹쳐 다시 만들어도 같다).
function backfillStatements(): string[] {
  const dir = path.join(process.cwd(), "db/migrations");
  const file = readdirSync(dir).find((name) => name.endsWith("_vendor_kind.sql"));
  if (!file) throw new Error("*_vendor_kind.sql 마이그레이션이 없습니다");
  return readFileSync(path.join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.startsWith('UPDATE "vendors"'));
}

describe("vendors.kind 저장 · 기본값 · CHECK (261006-biv, 실제 Postgres)", () => {
  it("(a) createVendor에 kind를 주면 그 값, 안 주면 DB 기본 'both'", async () => {
    const writer = await makeVendorWriter();
    const { vendor: client } = await createVendor(writer, { name: `갈래-${randomUUID()}`, kind: "client" });
    expect(client.kind).toBe("client");
    expect(await kindOf(client.id)).toBe("client");

    const { vendor: plain } = await createVendor(writer, { name: `갈래-${randomUUID()}` });
    expect(plain.kind).toBe("both");
    expect(await kindOf(plain.id)).toBe("both");
  });

  it("(b) updateVendor에 kind를 주면 바뀌고, 안 주면 저장값 그대로다", async () => {
    const writer = await makeVendorWriter();
    const name = `갈래-${randomUUID()}`;
    const { vendor } = await createVendor(writer, { name, kind: "client" });

    await updateVendor(writer, vendor.id, { name, kind: "supplier" });
    expect(await kindOf(vendor.id)).toBe("supplier");

    await updateVendor(writer, vendor.id, { name });
    expect(await kindOf(vendor.id)).toBe("supplier");
  });

  it("(c) 세 값 밖의 kind는 CHECK vendors_kind_check가 거부한다(23514)", async () => {
    const name = `갈래-${randomUUID()}`;
    const error = await db
      .execute(sql`INSERT INTO vendors (name, normalized_name, kind) VALUES (${name}, ${name}, 'other')`)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).not.toBeNull();
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
    expect(cause.code).toBe("23514");
    expect(cause.constraint).toBe("vendors_kind_check");
  });
});

describe("마이그레이션 채우기 — 쓰임 기반 갈래 (261006-biv D-2, 실제 Postgres)", () => {
  it("(d) 클라이언트 쪽만 = client, 협력사 쪽만 = supplier, 양쪽 · 안 쓰임 = both — vendor_id NULL 줄 · 문서가 있어도 같다", async () => {
    // A = 프로젝트 클라이언트, C = 견적 줄 거래처(스테이지원). 같은 프로젝트에 vendor_id NULL 견적 줄(「현장 진행 인력」)이 있다.
    const fx = await setupExpenseProject();
    const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, fx.projectId)).limit(1);
    if (!project) throw new Error("프로젝트가 없습니다");
    const a = project.clientId;
    const c = fx.stageOneId;

    const b = (await plainVendor("리저브만")).id;
    const d = (await plainVendor("지출만")).id;
    const e = (await plainVendor("리저브와지출")).id;
    const f = (await plainVendor("안쓰임")).id;

    const finance = await createFinanceViewer();
    await saveReserves(finance, { rows: [reserveDeposit(b), reserveDeposit(e)] });
    await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { vendorId: d } });
    await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { vendorId: e } });
    // vendor_id NULL 지출결의 — NOT IN + NULL 함정을 잡는다.
    await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: {} });

    const ids = [a, b, c, d, e, f];
    await db.update(vendors).set({ kind: "both" }).where(inArray(vendors.id, ids));

    const statements = backfillStatements();
    expect(statements).toHaveLength(2);
    for (const statement of statements) await db.execute(sql.raw(statement));

    expect(await kindOf(a)).toBe("client");
    expect(await kindOf(b)).toBe("client");
    expect(await kindOf(c)).toBe("supplier");
    expect(await kindOf(d)).toBe("supplier");
    expect(await kindOf(e)).toBe("both");
    expect(await kindOf(f)).toBe("both");
  });

  it("(e) 법인카드 사용처(corp_card_usages.merchant_vendor_id)도 협력사 쪽으로 센다 — 클라이언트 + 사용처 = both, 사용처만 = supplier", async () => {
    const fx = await setupExpenseProject();
    const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, fx.projectId)).limit(1);
    if (!project) throw new Error("프로젝트가 없습니다");
    const clientAndMerchant = project.clientId;
    const merchantOnly = (await plainVendor("카드사용처만")).id;

    const [card] = await db
      .insert(corpCards)
      .values({ issuer: `카드사-${randomUUID()}`, numberLast4: "1234", label: "카드", kind: "personal", holderUserId: fx.pm.id })
      .returning({ id: corpCards.id });
    if (!card) throw new Error("카드 없음");
    for (const merchantVendorId of [clientAndMerchant, merchantOnly]) {
      await db.insert(corpCardUsages).values({
        corpCardId: card.id,
        usedOn: "2026-10-01",
        merchantVendorId,
        totalAmountKrw: 110_000,
        supplyKrw: 100_000,
        vatKrw: 10_000,
        evidenceTypeCode: "card_slip",
        linkKind: "quote_line",
        quoteLineId: fx.lines.noVendor,
        usedByUserId: fx.pm.id,
        registeredBy: fx.pm.id,
        registeredVia: "self",
      });
    }

    await db.update(vendors).set({ kind: "both" }).where(inArray(vendors.id, [clientAndMerchant, merchantOnly]));
    for (const statement of backfillStatements()) await db.execute(sql.raw(statement));

    expect(await kindOf(clientAndMerchant)).toBe("both");
    expect(await kindOf(merchantOnly)).toBe("supplier");
  });
});

// ── Task 2: 고르는 목록 거르기(D-6) ─────────────────────────────────────

async function makeReferenceViewer(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `갈래 선택지-${randomUUID()}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of ["vendor.value", "team.value", "person.value", "project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vk-ref-${randomUUID()}@example.test`, name: `갈래 선택지 사람-${randomUUID()}`, roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function kindTrio() {
  const tag = `갈${randomUUID().slice(0, 8)}`;
  const make = (suffix: string, kind: "client" | "supplier" | "both") =>
    insertVendor(SYSTEM_VIEWER, { name: `${tag}-${suffix}`, normalizedName: `${tag}-${suffix}`.toLowerCase(), kind });
  const c = await make("클라", "client");
  const s = await make("협력", "supplier");
  const b = await make("둘다", "both");
  return { tag, c: c.id, s: s.id, b: b.id };
}

function idsIn(rows: readonly { id?: string }[], trio: { c: string; s: string; b: string }): string[] {
  const mine = new Set([trio.c, trio.s, trio.b]);
  return rows
    .map((row) => row.id)
    .filter((id): id is string => id !== undefined && mine.has(id))
    .sort();
}

describe("선택 목록을 갈래로 거른다 (261006-biv D-6, 실제 Postgres)", () => {
  it("프로젝트 등록 — 클라이언트 선택지는 client · both, 견적 줄 거래처는 supplier · both", async () => {
    const trio = await kindTrio();
    const references = await listProjectFormReferences(await makeReferenceViewer());
    expect(idsIn(references.clients, trio)).toEqual([trio.c, trio.b].sort());
    expect(idsIn(references.vendors, trio)).toEqual([trio.s, trio.b].sort());
  });

  it("지출결의 거래처 고르기는 supplier · both만", async () => {
    const trio = await kindTrio();
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const found = await searchVendorsForPick(pm, { query: trio.tag });
    expect(idsIn(found.rows, trio)).toEqual([trio.s, trio.b].sort());
  });

  it("리저브 클라이언트 선택지는 client · both만", async () => {
    const trio = await kindTrio();
    const references = await listReserveReferences(await createFinanceViewer());
    expect(idsIn(references.clients, trio)).toEqual([trio.c, trio.b].sort());
  });

  it("고정 — 견적 줄 거래처를 client로 바꿔도 줄의 거래처 이름이 남는다", async () => {
    const fx = await setupExpenseProject();
    await db.update(vendors).set({ kind: "client" }).where(eq(vendors.id, fx.stageOneId));
    const lines = await listQuoteLines(await makeReferenceViewer(), fx.revisionId, { status: "in_progress", canWrite: false });
    expect(lines.find((line) => line.id === fx.lines.withVendor)?.vendorName).toBe("스테이지원");
  });

  it("고정 — 리저브 줄 클라이언트를 supplier로 바꿔도 줄의 클라이언트 이름이 남는다", async () => {
    const client = await plainVendor("리저브고정");
    const finance = await createFinanceViewer();
    await saveReserves(finance, { rows: [reserveDeposit(client.id)] });
    await db.update(vendors).set({ kind: "supplier" }).where(eq(vendors.id, client.id));
    const list = await listReserves(finance, { page: 1 });
    expect(list.rows.find((row) => row.clientId === client.id)?.clientName).toBe(client.name);
  });
});
