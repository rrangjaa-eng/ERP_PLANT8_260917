import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { createTeamExpenseDraft, ExpenseConflictError, ExpenseNotFoundError, changeExpenseLine, changeExpenseVendor, createExpenseFromLines, saveExpenseDraft, withdrawExpense } from "@/domain/expenses";
import { searchLinesForPick, searchVendorsForPick } from "@/domain/expenses/pick";
import { GateBlockedError } from "@/domain/rules/gate";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { listExpenseFormOptions } from "@/domain/expenses";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-07 골라내기 · 서버 판정 — 거래처(Task 1) · 견적 줄(Task 2). 행은 투영 DTO(PickVendorOptionDto · PickLineOptionDto)다.

async function viewerWithoutVendorValue(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `골라내기 계급-${randomUUID()}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: false });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pick-${randomUUID()}@example.test`, name: `골라내기 사람-${randomUUID()}`, roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function vendorNamed(name: string, defaultEvidenceType: string | null = null) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: `${name}-${randomUUID()}`.toLowerCase(), defaultEvidenceType });
}

describe("거래처 골라내기 searchVendorsForPick", () => {
  it("이름 부분 일치로 좁히고 행은 이름 · 기본 증빙 종류 · 이름 라벨이며 숨김 거래처는 없다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const tag = `핍${randomUUID().slice(0, 8)}`;
    const withDefault = await vendorNamed(`${tag}-스테이지`, "tax_invoice");
    const plain = await vendorNamed(`${tag}-음향`);
    const hidden = await vendorNamed(`${tag}-숨김`);
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);

    const found = await searchVendorsForPick(pm, { query: tag });
    expect(found.truncated).toBe(false);
    expect(found.rows.map((row) => row.id).sort()).toEqual([withDefault.id, plain.id].sort());
    expect(found.rows.find((row) => row.id === withDefault.id)).toMatchObject({
      name: `${tag}-스테이지`,
      defaultEvidenceType: "tax_invoice",
      defaultEvidenceName: "세금계산서",
    });
    expect(found.rows.find((row) => row.id === plain.id)).toMatchObject({ name: `${tag}-음향`, defaultEvidenceType: null, defaultEvidenceName: null });

    const narrowed = await searchVendorsForPick(pm, { query: `${tag}-음` });
    expect(narrowed.rows.map((row) => row.id)).toEqual([plain.id]);
    expect((await searchVendorsForPick(pm, { query: `${tag}-없음` })).rows).toEqual([]);
  });

  it("50행까지만 돌려주고 넘으면 truncated", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const tag = `상한${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 51; i += 1) await vendorNamed(`${tag}-${String(i).padStart(2, "0")}`);
    const found = await searchVendorsForPick(pm, { query: tag });
    expect(found.rows).toHaveLength(50);
    expect(found.truncated).toBe(true);
  });

  it("vendor.value를 끈 계급의 결과 행에는 이름 · 기본 증빙이 없다", async () => {
    const tag = `가림${randomUUID().slice(0, 8)}`;
    await vendorNamed(`${tag}-스테이지`, "tax_invoice");
    const viewer = await viewerWithoutVendorValue();
    const found = await searchVendorsForPick(viewer, { query: tag });
    expect(JSON.stringify(found)).not.toContain(tag);
    expect(JSON.stringify(found)).not.toContain("tax_invoice");
    expect(found.rows).toEqual([]);
  });
});

describe("거래처 바꾸기 changeExpenseVendor", () => {
  async function teamDraft(pm: Viewer) {
    return (await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26" } }, { now: new Date("2026-09-26T03:00:00Z") })).expenseId;
  }

  it("거래처를 바꾸면 증빙 종류가 그 거래처 기본값이 되고, 기본값이 없으면 증빙 종류는 그대로다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const expenseId = await teamDraft(pm);
    const withDefault = await vendorNamed("기본증빙집", "other_income");
    const plain = await vendorNamed("기본없는집");

    const first = await changeExpenseVendor(pm, { expenseId, vendorId: withDefault.id, expectedVersion: 1 });
    expect(first).toMatchObject({ version: 2, evidenceType: "other_income" });
    const [afterFirst] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(afterFirst).toMatchObject({ vendorId: withDefault.id, evidenceType: "other_income", version: 2 });

    const second = await changeExpenseVendor(pm, { expenseId, vendorId: plain.id, expectedVersion: 2 });
    expect(second).toMatchObject({ version: 3, evidenceType: "other_income" });
    const [afterSecond] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(afterSecond).toMatchObject({ vendorId: plain.id, evidenceType: "other_income" });
  });

  it("버전이 낡으면 충돌, 남의 문서 · 없는 거래처는 없는 문서, 견적 줄 문서의 거래처는 줄이 정한다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const other = await makePerson("남", DEFAULT_ROLE_ID, "기획1팀");
    const expenseId = await teamDraft(pm);
    const vendor = await vendorNamed("충돌집");
    await changeExpenseVendor(pm, { expenseId, vendorId: vendor.id, expectedVersion: 1 });
    await expect(changeExpenseVendor(pm, { expenseId, vendorId: vendor.id, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseConflictError);
    await expect(changeExpenseVendor(other, { expenseId, vendorId: vendor.id, expectedVersion: 2 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(changeExpenseVendor(pm, { expenseId, vendorId: randomUUID(), expectedVersion: 2 })).rejects.toBeInstanceOf(ExpenseNotFoundError);

    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const lineDoc = created.created[0]?.expenseId ?? "";
    await expect(changeExpenseVendor(fx.pm, { expenseId: lineDoc, vendorId: vendor.id, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });
});

// ── 견적 줄 골라내기 · 바꾸기 (Task 2) ───────────────────────────────────

async function projectWithLines(pm: Viewer, name: string, itemNames: string[], vendorId: string | null): Promise<{ projectId: string; lineIds: string[] }> {
  const client = await vendorNamed(`클라이언트-${name}`);
  const project = await createProject(pm, {
    clientId: client.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: pm.id,
    name,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: itemNames.map((itemName) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory,
      itemName,
      vendorId,
      unitPrice: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
    })),
  });
  return { projectId: project.id, lineIds: itemNames.map((itemName) => saved.lines.find((row) => row.itemName === itemName)?.id ?? "") };
}

async function draftOn(pm: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(pm, { lineIds: [lineId] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  return id;
}

describe("견적 줄 골라내기 searchLinesForPick · change", () => {
  it("그 문서 프로젝트의 줄 전부 — 현재 줄 표시 · 거래처 없는 줄 · 문 닫힌 줄(번호 · 상태 · 금액) 이유", async () => {
    const fx = await setupExpenseProject();
    const current = await draftOn(fx.pm, fx.lines.withVendor);
    const closedDoc = await draftOn(fx.pm, fx.lines.split);
    const submitted = await submitReadyDraft(fx.pm, closedDoc);
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");

    const result = await searchLinesForPick(fx.pm, { mode: "change", expenseId: current });
    expect(result.truncated).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ projectId: fx.projectId, note: null });
    expect(result.groups[0]?.label).toContain("가을 팝업");
    expect(result.rows.map((row) => [row.lineNo, row.itemName, row.selectable])).toEqual([
      [1, "무대 제작", true],
      [2, "현장 진행 인력", false],
      [3, "영상 제작(분할)", false],
    ]);
    const byName = new Map(result.rows.map((row) => [row.itemName, row]));
    expect(byName.get("무대 제작")).toMatchObject({ current: true, vendorName: "스테이지원", reason: null, execution: { amountKrw: 12_400_000 } });
    expect(byName.get("현장 진행 인력")).toMatchObject({ reason: "거래처 없음", vendorName: null });
    expect(byName.get("영상 제작(분할)")?.reason).toBe(`지출결의 ${submitted.number} 결재 중 · 10,000,000`);
  });

  it("앞 회차가 있는 열린 줄은 부제에 회차와 남은 실행가를 싣는다", async () => {
    const fx = await setupExpenseProject();
    const current = await draftOn(fx.pm, fx.lines.withVendor);
    const first = await draftOn(fx.pm, fx.lines.split);
    await saveExpenseDraft(fx.pm, { expenseId: first, expectedVersion: 1, fields: { installment: true, supply: { currency: "KRW", amount: 6_000_000, fxRate: 1 } } });
    const options = await listExpenseFormOptions(fx.pm);
    await saveExpenseDraft(fx.pm, { expenseId: first, expectedVersion: 2, fields: { paymentMethod: options.payment[0]?.value ?? null } });
    await submitReadyDraft(fx.pm, first);

    const result = await searchLinesForPick(fx.pm, { mode: "change", expenseId: current });
    const split = result.rows.find((row) => row.itemName === "영상 제작(분할)");
    expect(split).toMatchObject({ selectable: true, installmentText: "2회차 · 남은 실행가 4,000,000" });
  });

  it("다른 기안자의 문서 · 없는 문서는 없는 문서다", async () => {
    const fx = await setupExpenseProject();
    const current = await draftOn(fx.pm, fx.lines.withVendor);
    await expect(searchLinesForPick(fx.otherPm, { mode: "change", expenseId: current })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(searchLinesForPick(fx.pm, { mode: "change", expenseId: randomUUID() })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });
});

describe("견적 줄 골라내기 searchLinesForPick · pick", () => {
  it("검색어가 없으면 내가 담당 PM인 프로젝트만, 고객 승인 전 차수 프로젝트는 줄 없이 접힌 그룹", async () => {
    const fx = await setupExpenseProject();
    const lost = await setupExpenseProject();
    void lost;
    const mine = await searchLinesForPick(fx.pm, { mode: "pick" });
    expect(mine.groups.map((group) => group.projectId)).toEqual([fx.projectId]);
    expect(mine.rows.every((row) => row.projectId === fx.projectId)).toBe(true);
    expect(mine.rows.filter((row) => row.selectable).map((row) => row.itemName)).toEqual(["무대 제작", "영상 제작(분할)"]);

    const none = await searchLinesForPick(fx.otherPm, { mode: "pick" });
    expect(none).toMatchObject({ groups: [], rows: [], truncated: false });

    await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId });
    const folded = await searchLinesForPick(fx.pm, { mode: "pick" });
    expect(folded.groups).toHaveLength(1);
    expect(folded.groups[0]).toMatchObject({ projectId: fx.projectId, note: "2차 고객 승인 전" });
    expect(folded.rows).toEqual([]);
  });

  it("검색어가 있으면 내 쓰기 범위 전체의 프로젝트 · 줄 이름으로 넓히고 없는 이름은 0건", async () => {
    const fx = await setupExpenseProject();
    const wide = await searchLinesForPick(fx.otherPm, { mode: "pick", query: "무대 제작" });
    expect(wide.rows.map((row) => row.itemName)).toEqual(["무대 제작"]);
    expect((await searchLinesForPick(fx.otherPm, { mode: "pick", query: "존재하지않는줄이름zzzz" })).rows).toEqual([]);
  });

  it("50행까지만 돌려주고 넘으면 truncated", async () => {
    const fx = await setupExpenseProject();
    const tag = `상한줄${randomUUID().slice(0, 6)}`;
    const vendor = await vendorNamed(`상한거래처-${tag}`);
    await projectWithLines(fx.pm, `상한프로젝트-${tag}`, Array.from({ length: 51 }, (_, i) => `${tag}-${String(i).padStart(2, "0")}`), vendor.id);
    const result = await searchLinesForPick(fx.pm, { mode: "pick", query: tag });
    expect(result.rows).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("expenses 쓰기 권한이 없으면 거부 · 줄 이름 · 금액 정보를 가린 계급에는 행이 비어 새지 않는다", async () => {
    const fx = await setupExpenseProject();
    const hidden = await viewerWithoutVendorValue();
    await expect(searchLinesForPick(hidden, { mode: "pick", query: "무대" })).rejects.toThrow();
    expect(JSON.stringify(await searchLinesForPick(fx.pm, { mode: "pick" }))).not.toContain("tax_invoice");
  });
});

describe("견적 줄 바꾸기 changeExpenseLine", () => {
  it("새 줄의 거래처 · 증빙 종류 · 공급가액(남은 실행가) · 분할 여부로 다시 채우고 버전이 오른다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOn(fx.pm, fx.lines.withVendor);
    const changed = await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: 1 });
    expect(changed).toEqual({ version: 2 });
    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(row).toMatchObject({
      projectId: fx.projectId,
      quoteLineId: fx.lines.split,
      vendorId: fx.stageOneId,
      evidenceType: "tax_invoice",
      supplyAmountKrw: 10_000_000,
      installment: false,
      teamExpenseKind: null,
      usageDate: null,
      content: null,
      attributedTeamId: null,
      version: 2,
    });
    // 같은 줄로 바꾸면 아무 일 없다.
    expect(await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: 2 })).toEqual({ version: 2 });
  });

  it("팀 비용 문서도 줄로 바꾸면 줄 문서가 되고 팀 비용 칸은 지워진다", async () => {
    const fx = await setupExpenseProject();
    const team = (await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "lost_bid", content: "시안", usageDate: "2026-09-26" } }, { now: new Date("2026-09-26T03:00:00Z") })).expenseId;
    expect(await changeExpenseLine(fx.pm, { expenseId: team, lineId: fx.lines.withVendor, expectedVersion: 1 })).toEqual({ version: 2 });
    const [row] = await db.select().from(expenses).where(eq(expenses.id, team));
    expect(row).toMatchObject({ projectId: fx.projectId, quoteLineId: fx.lines.withVendor, teamExpenseKind: null, usageDate: null, content: null, attributedTeamId: null, supplyAmountKrw: 12_400_000 });
  });

  it("그 줄에 내 다른 작성 중 문서가 있으면 바꾸지 않고 그 문서로 보낸다", async () => {
    const fx = await setupExpenseProject();
    const existing = await draftOn(fx.pm, fx.lines.withVendor);
    const team = (await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26" } }, { now: new Date("2026-09-26T03:00:00Z") })).expenseId;
    expect(await changeExpenseLine(fx.pm, { expenseId: team, lineId: fx.lines.withVendor, expectedVersion: 1 })).toEqual({ redirectTo: existing });
    const [row] = await db.select().from(expenses).where(eq(expenses.id, team));
    expect(row).toMatchObject({ quoteLineId: null, version: 1 });
  });

  it("거래처 없는 줄 · 문 닫힌 줄 · 현재 차수에 없는 줄은 서버가 다시 판정해 막고 버전 충돌 · 남의 문서는 없는 문서", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOn(fx.pm, fx.lines.withVendor);
    await expect(changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.noVendor, expectedVersion: 1 })).rejects.toMatchObject({ message: "거래처 없음 · 거래처 고르기" });

    const closedDoc = await draftOn(fx.pm, fx.lines.split);
    const submitted = await submitReadyDraft(fx.pm, closedDoc);
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await expect(changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: 1 })).rejects.toMatchObject({
      message: `이 줄에 지출결의 ${submitted.number} 있음 · 지출결의 열기`,
    });
    await expect(changeExpenseLine(fx.pm, { expenseId, lineId: randomUUID(), expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseNotFoundError);

    await expect(changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.noVendor, expectedVersion: 99 })).rejects.toBeInstanceOf(GateBlockedError);
    await expect(changeExpenseLine(fx.otherPm, { expenseId, lineId: fx.lines.withVendor, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("버전이 낡으면 충돌", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOn(fx.pm, fx.lines.withVendor);
    await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: 1 });
    await expect(changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.withVendor, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseConflictError);
  });

  it("번호 있는 문서는 같은 프로젝트 줄만 · 번호 있는 팀 비용 문서는 줄로 옮길 수 없다(F6)", async () => {
    const fx = await setupExpenseProject();
    const other = await projectWithLines(fx.pm, `다른 프로젝트-${randomUUID().slice(0, 6)}`, ["다른 줄"], fx.stageOneId);
    const numberedLine = await draftOn(fx.pm, fx.lines.withVendor);
    await submitReadyDraft(fx.pm, numberedLine);
    await withdrawExpense(fx.pm, { expenseId: numberedLine, undo: true, round: 1 });
    await expect(changeExpenseLine(fx.pm, { expenseId: numberedLine, lineId: other.lineIds[0] ?? "", expectedVersion: 2 })).rejects.toMatchObject({
      message: "번호 있는 문서 · 같은 프로젝트 줄만",
    });

    const options = await listExpenseFormOptions(fx.pm);
    const team = (
      await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", content: "팀 회식", usageDate: "2026-09-26", vendorId: fx.stageOneId, evidenceType: "tax_invoice", paymentMethod: options.payment[0]?.value ?? null, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } } }, { now: new Date("2026-09-26T03:00:00Z") })
    ).expenseId;
    await submitReadyDraft(fx.pm, team, { now: new Date("2026-09-26T03:00:00Z") });
    await withdrawExpense(fx.pm, { expenseId: team, undo: true, round: 1 });
    await expect(changeExpenseLine(fx.pm, { expenseId: team, lineId: fx.lines.split, expectedVersion: 2 })).rejects.toMatchObject({
      message: "번호 있는 문서 · 같은 프로젝트 줄만",
    });
  });
});
