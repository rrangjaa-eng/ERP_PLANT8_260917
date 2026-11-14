import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import {
  getCurrentQuoteRevision,
  listQuoteLines,
  quoteLineRowInputSchema,
  saveQuoteLines,
  SaveRejectedError,
  type QuoteLineWriteRow,
} from "@/domain/quotes/lines";
import { log } from "@/lib/log";
import { seedCustomFieldDefinition } from "@/test/support/custom-fields";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

// 07.5-03(D-7505 · D-7506 · D-7508 · D-7517 · D-7525 · eng B-4 · B-16) — 견적 줄 추가 칸은 줄 저장(잠근 tx)에서
// resolveCustomFieldsWrite로 판정 · 저장되고, QuoteLineDto는 칸별로 걸러 나간다.

type Menu = { menu: string; action: "view" | "write" };
const EDITOR_MENUS: Menu[] = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
];
const EDITOR_INFO = ["project.value", "quote.amount", "vendor.value"];

async function makeViewer(menus: Menu[] = EDITOR_MENUS, infoItems: string[] = EDITOR_INFO): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `견적 줄 추가 칸-${randomUUID()}`, workScope: "company", viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `qlcf-${randomUUID()}@example.test`, name: "견적 줄 추가 칸 사람", roleId: role.id });
  for (const entry of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

function roleOf(viewer: Viewer): string {
  if (!viewer.roleId) throw new Error("계급 없음");
  return viewer.roleId;
}

async function makeProject(pmUserId: string) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `견적 줄 추가 칸-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  return { project, revision, subcategory };
}

async function seedLine(revisionId: string, subcategory: string, sortOrder: number, itemName: string, customFields: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      sortOrder,
      subcategory,
      itemName,
      quantity: "1.00",
      unitPriceCurrency: "KRW",
      unitPriceForeignAmount: null,
      unitPriceFxRate: "1.0000",
      unitPriceAmountKrw: 100_000,
      executionCurrency: "KRW",
      executionForeignAmount: null,
      executionFxRate: "1.0000",
      executionAmountKrw: 50_000,
      quoteAmountKrw: 100_000,
      profitKrw: 50_000,
      customFields,
    })
    .returning();
  if (!row) throw new Error("줄 준비 실패");
  return row;
}

async function reloadLine(id: string) {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄 없음");
  return row;
}

// 화면이 보내는 모양 — 기존 줄은 DB 값 그대로 + 바꿀 칸만.
function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
    execution: { currency: "KRW", amount: row.executionAmountKrw, fxRate: 1 },
    lineStatus: row.lineStatus,
    ...patch,
  };
}

function newRow(subcategory: string, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: randomUUID(),
    isNew: true,
    subcategory,
    itemName: `새 줄-${randomUUID()}`,
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: 10_000, fxRate: 1 },
    ...patch,
  };
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
}

async function lastLineLog(revisionId: string) {
  const [row] = await db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "quote_line"), eq(actionLog.entityId, revisionId), eq(actionLog.actionType, "document_update")))
    .orderBy(desc(actionLog.seq))
    .limit(1);
  return row;
}

// A = 담당 PM(X 보임), B = H만 보임. X 텍스트(A) · Z 보관 칸(둘 다) · H 텍스트(B). 줄 둘에 X · Z · H 저장값.
async function setup() {
  const a = await makeViewer();
  const b = await makeViewer();
  const x = await seedCustomFieldDefinition("quote_line", { label: "장비 규격", type: "text", sortOrder: 1 }, { visibleRoleIds: [roleOf(a)] });
  const z = await seedCustomFieldDefinition("quote_line", { label: "보관 칸", type: "text", sortOrder: 2 }, { visibleRoleIds: [roleOf(a), roleOf(b)] });
  const h = await seedCustomFieldDefinition("quote_line", { label: "숨은 칸", type: "text", sortOrder: 3 }, { visibleRoleIds: [roleOf(b)] });
  await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(and(eq(fieldDefinitions.entity, "quote_line"), eq(fieldDefinitions.key, z.key)));
  const { project, revision, subcategory } = await makeProject(a.id);
  const stored = { [x.key]: "엑스 저장값", [z.key]: "제트 저장값", [h.key]: "숨은 저장값" };
  const first = await seedLine(revision.id, subcategory, 0, "첫 줄", stored);
  const second = await seedLine(revision.id, subcategory, 1, "둘째 줄", stored);
  return { a, b, project, revision, subcategory, first, second, stored, keys: { x: x.key, z: z.key, h: h.key } };
}

describe("견적 줄 추가 칸 저장 · 출구(D-7505 · D-7506 · D-7508)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("화면 입력 스키마가 customFields를 벗기지 않는다(Pitfall 3)", () => {
    const parsed = quoteLineRowInputSchema.parse({
      id: randomUUID(),
      version: 1,
      subcategory: "print",
      itemName: "배너",
      unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
      execution: { currency: "KRW", amount: 0, fxRate: 1 },
      customFields: { cf_abcd1234: "LED 3x2m" },
    });
    expect(parsed.customFields).toEqual({ cf_abcd1234: "LED 3x2m" });
  });

  it("A가 기존 줄에서 X만 고치면 X 새 값 · 보관 · 숨은 칸 그대로 · version + 1, X 키 없는 다른 줄은 custom_fields 무변경", async () => {
    const fx = await setup();

    const result = await saveQuoteLines(fx.a, fx.revision.id, {
      rows: [asInput(fx.first, { customFields: { [fx.keys.x]: "LED 3x2m" } }), asInput(fx.second, { itemName: "둘째 줄 고침" })],
    });

    const first = await reloadLine(fx.first.id);
    expect(first.version).toBe(fx.first.version + 1);
    expect(first.customFields).toEqual({ [fx.keys.x]: "LED 3x2m", [fx.keys.z]: "제트 저장값", [fx.keys.h]: "숨은 저장값" });
    const second = await reloadLine(fx.second.id);
    expect(second.itemName).toBe("둘째 줄 고침");
    expect(second.customFields).toEqual(fx.stored);
    // 저장 응답 — A에게는 X만(보관 · 숨은 칸 값 없음).
    const saved = result.lines.find((line) => line.id === fx.first.id);
    expect(saved?.customFields).toEqual({ [fx.keys.x]: "LED 3x2m" });
    const json = JSON.stringify(result);
    expect(json).not.toContain("제트 저장값");
    expect(json).not.toContain("숨은 저장값");
  });

  it("X 노출 행이 없는 B의 목록 · 저장 응답 직렬화에 X 값이 없고 B의 칸 H는 남는다", async () => {
    const fx = await setup();

    const listed = await listQuoteLines(fx.b, fx.revision.id, { status: fx.project.status, canWrite: true });
    expect(JSON.stringify(listed)).not.toContain("엑스 저장값");
    expect(listed.find((line) => line.id === fx.first.id)?.customFields).toEqual({ [fx.keys.h]: "숨은 저장값" });

    const result = await saveQuoteLines(fx.b, fx.revision.id, { rows: [asInput(fx.first, { customFields: { [fx.keys.h]: "B가 고침" } })] });
    expect(JSON.stringify(result)).not.toContain("엑스 저장값");
    expect((await reloadLine(fx.first.id)).customFields).toEqual({ [fx.keys.x]: "엑스 저장값", [fx.keys.z]: "제트 저장값", [fx.keys.h]: "B가 고침" });
  });

  it("정의에 없는 키는 저장 전체 거부 · 줄 무변경 · write.denied 한 번(eng B-16)", async () => {
    const fx = await setup();
    const warn = vi.spyOn(log, "warn");

    const error = await rejection(
      saveQuoteLines(fx.a, fx.revision.id, {
        rows: [asInput(fx.first, { itemName: "고침", customFields: { [fx.keys.x]: "값", cf_forged000: "위조" } })],
      }),
    );

    expect(error.message).toBe("입력값 오류 · 값 확인");
    const after = await reloadLine(fx.first.id);
    expect(after.itemName).toBe("첫 줄");
    expect(after.version).toBe(fx.first.version);
    expect(after.customFields).toEqual(fx.stored);
    expect(warn.mock.calls.filter(([event]) => event === "write.denied")).toHaveLength(1);
  });

  it("추가 칸만 바뀐 줄도 행동 로그 lineChanges 원소가 남고 customFieldKeys = [X] · 값 글자 없음(eng B-4)", async () => {
    const fx = await setup();

    await saveQuoteLines(fx.a, fx.revision.id, { rows: [asInput(fx.first, { customFields: { [fx.keys.x]: "LED 3x2m" } })] });

    const logged = await lastLineLog(fx.revision.id);
    const detail = logged?.detail as { lineChanges?: { id: string; changes: Record<string, unknown>; customFieldKeys?: string[] }[] };
    const element = detail.lineChanges?.find((line) => line.id === fx.first.id);
    expect(element?.customFieldKeys).toEqual([fx.keys.x]);
    expect(element?.changes).toEqual({});
    expect(JSON.stringify(logged?.detail)).not.toContain("LED 3x2m");
    expect(JSON.stringify(logged?.detail)).not.toContain("엑스 저장값");
  });

  it("값이 같은 추가 칸을 다시 보내면 안 바뀐 줄 — version 그대로", async () => {
    const fx = await setup();

    await saveQuoteLines(fx.a, fx.revision.id, { rows: [asInput(fx.first, { customFields: { [fx.keys.x]: "엑스 저장값" } })] });

    expect((await reloadLine(fx.first.id)).version).toBe(fx.first.version);
  });
});

describe("줄 저장 판정 집합 = 화면 열 집합(D-7525)", () => {
  // 텍스트 칸 셋(정렬 1~3) + 필수 칸 Q(정렬 4) — Q는 화면 열이 아니다.
  async function setupFour() {
    const a = await makeViewer();
    const role = [roleOf(a)];
    const t1 = await seedCustomFieldDefinition("quote_line", { label: "하나", type: "text", sortOrder: 1 }, { visibleRoleIds: role });
    await seedCustomFieldDefinition("quote_line", { label: "둘", type: "text", sortOrder: 2 }, { visibleRoleIds: role });
    await seedCustomFieldDefinition("quote_line", { label: "셋", type: "text", sortOrder: 3 }, { visibleRoleIds: role });
    const q = await seedCustomFieldDefinition("quote_line", { label: "넷 필수", type: "text", required: true, sortOrder: 4 }, { visibleRoleIds: role });
    const { project, revision, subcategory } = await makeProject(a.id);
    return { a, project, revision, subcategory, t1: t1.key, q: q.key };
  }

  it("넷째 필수 칸은 새 줄 저장을 막지 않고, 보낸 값도 버린다", async () => {
    const fx = await setupFour();
    const plain = newRow(fx.subcategory);
    const withQ = newRow(fx.subcategory, { customFields: { [fx.t1]: "하나 값", [fx.q]: "넷 값" } });

    await saveQuoteLines(fx.a, fx.revision.id, { rows: [plain, withQ] });

    expect((await reloadLine(plain.id)).customFields).toEqual({});
    expect((await reloadLine(withQ.id)).customFields).toEqual({ [fx.t1]: "하나 값" });
  });

  it("Q 저장값이 있는 기존 줄에서 첫 칸을 고치면 Q 저장값 그대로", async () => {
    const fx = await setupFour();
    const line = await seedLine(fx.revision.id, fx.subcategory, 0, "기존", { [fx.q]: "넷 저장값" });

    await saveQuoteLines(fx.a, fx.revision.id, { rows: [asInput(line, { customFields: { [fx.t1]: "새 값" } })] });

    expect((await reloadLine(line.id)).customFields).toEqual({ [fx.t1]: "새 값", [fx.q]: "넷 저장값" });
  });

  it("Q를 정렬 0(첫 열)으로 옮기면 새 줄의 빈 Q는 cf_<Q> 오류 셀로 전부 거부", async () => {
    const fx = await setupFour();
    await db.update(fieldDefinitions).set({ sortOrder: 0 }).where(and(eq(fieldDefinitions.entity, "quote_line"), eq(fieldDefinitions.key, fx.q)));
    const plain = newRow(fx.subcategory);

    const error = await rejection(saveQuoteLines(fx.a, fx.revision.id, { rows: [plain] }));

    expect(error).toBeInstanceOf(SaveRejectedError);
    const rejected = error as SaveRejectedError;
    expect(rejected.summary).toBe("오류 1칸 · 전부 거부");
    expect(rejected.formatErrors).toEqual([{ rowIndex: 0, rowId: plain.id, field: `cf_${fx.q}`, label: "넷 필수", reason: "필수 칸 비어 있음 · 값 입력" }]);
    expect(await db.select().from(quoteLines).where(eq(quoteLines.id, plain.id))).toHaveLength(0);
  });
});
