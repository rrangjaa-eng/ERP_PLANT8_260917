import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines, teams, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createRole, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import { createFieldDefinition } from "@/domain/custom-fields/admin";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { REQUIRED_VALUE_EMPTY_MESSAGE } from "@/domain/custom-fields/preserve";
import { createProject, ProjectInputRejectedError, type ProjectInput } from "@/domain/projects";
import {
  createOutOfQuoteLine,
  getCurrentQuoteRevision,
  saveQuoteLines,
  SaveRejectedError,
  type QuoteLineWriteRow,
} from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { syncTaxAdjustmentLine } from "@/domain/payments/adjustment-line";
import { withTransaction } from "@/lib/db-transaction";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

// 07.5-05 D-7503 회귀(T-07.5-05-03): 대상을 켠 뒤 관리자가 관리 경로(createFieldDefinition — 전 계급 보임)로 필수 프로젝트 칸 P ·
// 필수 견적 줄 칸 Q를 만들어도, 그 칸을 볼 수 없는 계급 · 보관한 칸 · 기존 줄의 다른 칸 수정 · 서버가 만드는 줄(견적 밖 · 조정) ·
// 차수 복사 · 복사 등록이 막히지 않는다. 칸을 보는 사람의 새 프로젝트 · 새 줄은 필수를 요구한다(견적 줄은 화면 앞 3열만 — D-7525).

const MENUS = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
] as const;
const INFO = ["project.value", "quote.amount", "vendor.value"];

// 계급은 칸보다 먼저 만든다 — 관리 경로 생성이 그때 있는 전 계급에 보임 행을 준다(D-7508).
async function makeViewer(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `대상 회귀-${randomUUID()}`, workScope: "company", viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `cft-${randomUUID()}@example.test`, name: "대상 회귀 사람", roleId: role.id });
  for (const entry of MENUS) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  for (const infoItem of INFO) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

async function makeAdmin(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `cft-admin-${randomUUID()}@example.test`, name: "대상 회귀 관리자", roleId: SYSADMIN_ROLE_ID });
  return { id: userId, roleId: SYSADMIN_ROLE_ID };
}

function roleOf(viewer: Viewer): string {
  if (!viewer.roleId) throw new Error("계급 없음");
  return viewer.roleId;
}

async function projectInput(pmUserId: string, patch: Partial<ProjectInput> = {}): Promise<ProjectInput> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return { clientId: client.id, teamId: team.id, pmUserId, name: `대상 회귀-${randomUUID()}`, ...patch };
}

// 칸을 만들기 전에 프로젝트 · 줄 하나를 둔다 — 기존 줄에는 Q 값이 없다.
async function makeProjectWithLine(pmUserId: string) {
  const project = await createProject(SYSTEM_VIEWER, await projectInput(pmUserId));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  const [line] = await db
    .insert(quoteLines)
    .values({
      revisionId: revision.id,
      sortOrder: 0,
      subcategory,
      itemName: "기존 줄",
      quantity: "1.00",
      unitPriceAmountKrw: 100_000,
      executionAmountKrw: 50_000,
      quoteAmountKrw: 100_000,
      profitKrw: 50_000,
    })
    .returning();
  if (!line) throw new Error("줄 준비 실패");
  return { project, revision, subcategory, line };
}

async function requiredField(admin: Viewer, target: "project" | "quote_line", label: string, sortOrder = 1) {
  return createFieldDefinition(admin, { name: `${label}-${randomUUID().slice(0, 6)}`, type: "text", required: true, sortOrder, target });
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
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

// seer = P · Q를 보는 담당 PM, hidden = P를 끈 계급. P · Q는 관리 경로로 칸 생성 뒤 만들어 전 계급 보임이다.
async function setup() {
  const admin = await makeAdmin();
  const seer = await makeViewer();
  const hidden = await makeViewer();
  const fx = await makeProjectWithLine(seer.id);
  const p = await requiredField(admin, "project", "필수 장소");
  const q = await requiredField(admin, "quote_line", "필수 규격");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: roleOf(hidden), infoItem: customFieldInfoItem("project", p.key), visible: false });
  return { admin, seer, hidden, p, q, ...fx };
}

describe("대상 켠 뒤 필수 칸 회귀(D-7503)", () => {
  it("기존 줄(Q 값 없음)의 수량만 고친 저장은 통과한다", async () => {
    const fx = await setup();
    const row: QuoteLineWriteRow = {
      id: fx.line.id,
      version: fx.line.version,
      subcategory: fx.line.subcategory,
      itemName: fx.line.itemName,
      quantity: 2,
      unitPrice: { currency: "KRW", amount: fx.line.unitPriceAmountKrw, fxRate: 1 },
      execution: { currency: "KRW", amount: fx.line.executionAmountKrw, fxRate: 1 },
      lineStatus: fx.line.lineStatus,
    };

    await saveQuoteLines(fx.seer, fx.revision.id, { rows: [row] });

    const [after] = await db.select().from(quoteLines).where(eq(quoteLines.id, fx.line.id));
    expect(after?.quantity).toBe("2.00");
    expect(after?.customFields).toEqual({});
  });

  it("P를 끈 계급의 프로젝트 등록은 통과하고, P를 보는 사람의 P 빈 등록은 「필수 칸 비어 있음 · 값 입력」이다", async () => {
    const fx = await setup();

    const byHidden = await createProject(fx.hidden, await projectInput(fx.hidden.id));
    expect(byHidden.id).toBeTruthy();

    const error = await rejection(createProject(fx.seer, await projectInput(fx.seer.id)));
    expect(error).toBeInstanceOf(ProjectInputRejectedError);
    expect((error as ProjectInputRejectedError).errors).toContainEqual({ field: `cf_${fx.p.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE });
  });

  it("P를 보관하면 P를 보던 사람의 등록도 통과한다", async () => {
    const fx = await setup();
    await archive(fx.admin, "field_definitions", fx.p.id);

    const created = await createProject(fx.seer, await projectInput(fx.seer.id));
    expect(created.id).toBeTruthy();
  });

  it("Q를 보는 사람의 Q 빈 새 줄은 cf_<Q> 오류 셀로 전부 거부된다", async () => {
    const fx = await setup();
    const plain = newRow(fx.subcategory);

    const error = await rejection(saveQuoteLines(fx.seer, fx.revision.id, { rows: [plain] }));

    expect(error).toBeInstanceOf(SaveRejectedError);
    expect((error as SaveRejectedError).formatErrors).toContainEqual(
      expect.objectContaining({ rowId: plain.id, field: `cf_${fx.q.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE }),
    );
    expect(await db.select().from(quoteLines).where(eq(quoteLines.id, plain.id))).toHaveLength(0);
  });

  it("견적 밖 줄 · 세금 조정 줄(서버가 만드는 줄)은 필수 Q에 막히지 않는다", async () => {
    const fx = await setup();

    const outOfQuote = await withTransaction((tx) =>
      createOutOfQuoteLine(fx.seer, { revisionId: fx.revision.id, itemName: "견적 밖", executionKrw: 10_000 }, tx),
    );
    expect(outOfQuote.customFields).toEqual({});

    const adjusted = await withTransaction((tx) =>
      syncTaxAdjustmentLine(
        fx.seer,
        { projectId: fx.project.id, expenseId: randomUUID(), documentNumber: "EXP-대상회귀", companyBorneKrw: 3_000, liveLine: null },
        tx,
      ),
    );
    expect(adjusted.adjustmentLineId).toBeTruthy();
    const [adjustmentLine] = await db.select().from(quoteLines).where(eq(quoteLines.id, adjusted.adjustmentLineId!));
    expect(adjustmentLine?.customFields).toEqual({});
  });

  it("차수 복사는 필수 Q에 막히지 않고 줄 값을 그대로 옮긴다", async () => {
    const fx = await setup();

    const created = await createRevisionFromCurrent(fx.seer, { projectId: fx.project.id, fromRevisionId: fx.revision.id });

    const copied = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, created.revisionId));
    expect(copied.map((row) => row.itemName)).toEqual(["기존 줄"]);
    expect(copied[0]?.customFields).toEqual({});
  });

  it("복사 등록(D-7518 · D-7523): P를 보는 사람은 P를 요구받고, 못 보는 계급은 통과하며, 복사된 견적 줄은 Q 없이 그대로다", async () => {
    const fx = await setup();

    const error = await rejection(createProject(fx.seer, await projectInput(fx.seer.id, { copyFromProjectId: fx.project.id })));
    expect(error).toBeInstanceOf(ProjectInputRejectedError);
    expect((error as ProjectInputRejectedError).errors).toContainEqual({ field: `cf_${fx.p.key}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE });

    const copy = await createProject(fx.hidden, await projectInput(fx.hidden.id, { copyFromProjectId: fx.project.id }));
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, copy.id);
    const lines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision!.id));
    expect(lines.map((row) => row.itemName)).toEqual(["기존 줄"]);
    expect(lines[0]?.customFields).toEqual({});
  });

  it("넷째(앞 3개 밖) 필수 견적 줄 칸은 관리 경로로 더해도 새 줄 저장을 막지 않는다(D-7525)", async () => {
    const admin = await makeAdmin();
    const seer = await makeViewer();
    const fx = await makeProjectWithLine(seer.id);
    for (const sortOrder of [1, 2, 3]) {
      await createFieldDefinition(admin, { name: `앞 칸 ${sortOrder}-${randomUUID().slice(0, 6)}`, type: "text", required: false, sortOrder, target: "quote_line" });
    }
    await requiredField(admin, "quote_line", "넷째 필수", 4);
    const plain = newRow(fx.subcategory);

    await saveQuoteLines(seer, fx.revision.id, { rows: [plain] });

    const [saved] = await db.select().from(quoteLines).where(eq(quoteLines.id, plain.id));
    expect(saved?.customFields).toEqual({});
  });

  it("새 계급(createRole)은 프로젝트 · 견적 줄 칸 모두의 보임 행을 받는다(D-7508)", async () => {
    const fx = await setup();

    const role = await createRole(SYSTEM_VIEWER, { name: `새 계급-${randomUUID()}` });

    for (const item of [customFieldInfoItem("project", fx.p.key), customFieldInfoItem("quote_line", fx.q.key)]) {
      const rows = await db
        .select()
        .from(visibilityMatrix)
        .where(and(eq(visibilityMatrix.roleId, role.id), eq(visibilityMatrix.infoItem, item)));
      expect(rows.map((row) => row.visible)).toEqual([true]);
    }
  });
});
