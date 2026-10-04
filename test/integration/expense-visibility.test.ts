import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createTeam } from "@/domain/org";
import { approveDocument } from "@/domain/approvals";
import { setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE,
} from "@/domain/settings/keys";
import { createExpenseFromLines, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND, getExpense, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses } from "@/domain/expenses/list";
import { createEvidenceViewUrl, listEvidence } from "@/domain/evidence";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { createMemoryStorage } from "./fakes/memory-storage";

// 05-08 Task 1(EXP-08 · D-17 · 사용자 결정 2026-09-26 #5): 지출결의 보임 범위 — 기안자 ∪ 결재 관련자(처리한 사람 · 지금 단계 후보)
// ∪ (`expenses.team` 보기 ∧ 문서의 팀 = 내 지금 팀) ∪ (업무 범위 company ∧ `expenses` 보기). 작성 중은 기안자만. 목록 · 문서 · 증빙 목록 ·
// 서명 GET이 같은 판정을 쓴다. 1단(팀장)을 끄고 시작해 팀장의 보임이 결재 관련이 아니라 메뉴 권한에서만 오게 한다.

const TODAY = "2026-09-26";
const NOW = new Date("2026-09-26T03:00:00Z");

type World = ExpenseFixture & {
  divisionHead: Viewer;
  lead2: Viewer;
  pm2: Viewer;
  teamDocId: string;
  lineDocId: string;
  draftId: string;
  pm2DocId: string;
};

async function rowVersion(id: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function submittedTeamDoc(viewer: Viewer, vendorId: string, content: string): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(
    viewer,
    { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: TODAY, content } },
    { now: NOW },
  );
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: await rowVersion(expenseId),
    fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(viewer, expenseId, { now: NOW });
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return expenseId;
}

async function submittedLineDoc(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(viewer, expenseId, { now: NOW });
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return expenseId;
}

async function instanceOf(expenseId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, expenseId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

// 기획1팀(PM 박서연 · 팀장 김도윤 · 무관PM) · 기획2팀(PM 이지훈 · 팀장 정하나) · 대표 · 본부 책임자. 박서연: 팀 관리비 제출(귀속 기획1팀)
// · 견적 줄 제출(프로젝트 팀 기획1팀) · 작성 중 하나. 이지훈: 팀 관리비 제출(귀속 기획2팀).
async function setup(): Promise<World> {
  await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, false);
  const fx = await setupExpenseProject();
  await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: "기획2팀" });
  const pm2 = await makePerson("이지훈", DEFAULT_ROLE_ID, "기획2팀");
  const lead2 = await makePerson("정하나", TEAM_LEAD_ROLE_ID, "기획2팀");
  const divisionHead = await makePerson("본부책임", DIVISION_HEAD_ROLE_ID, "기획1팀");
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "더테이블", normalizedName: `더테이블-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });

  const teamDocId = await submittedTeamDoc(fx.pm, vendor.id, "팀 회식");
  const lineDocId = await submittedLineDoc(fx.pm, fx.lines.withVendor);
  const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
  const draftId = draft.created[0]?.expenseId;
  if (!draftId) throw new Error("작성 중 문서 없음");
  const pm2DocId = await submittedTeamDoc(pm2, vendor.id, "2팀 회식");
  return { ...fx, divisionHead, lead2, pm2, teamDocId, lineDocId, draftId, pm2DocId };
}

function idsOf(list: Awaited<ReturnType<typeof listExpenses>>): string[] {
  return list.groups.flatMap((group) => group.rows.map((row) => row.id ?? ""));
}

describe("지출결의 목록 보임 범위 (listExpenses)", () => {
  it("팀장은 팀원의 제출 문서를 보고 팀 비용 행에 `프로젝트 미연결 · 팀 관리비` 2행이 있으며 기안 열이 있다 — 작성 중은 없다", async () => {
    const w = await setup();
    const list = await listExpenses(w.lead, { status: "open" }, { today: TODAY });
    expect(idsOf(list).sort()).toEqual([w.teamDocId, w.lineDocId].sort());
    const teamRow = list.groups.flatMap((group) => group.rows).find((row) => row.id === w.teamDocId);
    expect(teamRow).toMatchObject({ title: "기획1팀 · 팀 회식", unlinkedText: "프로젝트 미연결 · 팀 관리비", drafterName: "박서연" });
    expect(list.drafterColumn).toBe(true);
  });

  it("다른 팀 팀장은 자기 팀 문서만, PM은 자기 문서만(기안 열 없음) 본다", async () => {
    const w = await setup();
    expect(idsOf(await listExpenses(w.lead2, { status: "open" }, { today: TODAY }))).toEqual([w.pm2DocId]);
    const own = await listExpenses(w.pm2, { status: "open" }, { today: TODAY });
    expect(idsOf(own)).toEqual([w.pm2DocId]);
    expect(own.drafterColumn).toBe(false);
    expect(own.groups.flatMap((group) => group.rows).every((row) => !("drafterName" in row))).toBe(true);
    const other = await listExpenses(w.otherPm, { status: "open" }, { today: TODAY });
    expect(idsOf(other)).toEqual([]);
  });

  it("대표 · 본부 책임자(업무 범위 company)는 제출 문서 전부를 보고 작성 중은 보지 않는다", async () => {
    const w = await setup();
    for (const viewer of [w.ceo, w.divisionHead]) {
      expect(idsOf(await listExpenses(viewer, { status: "open" }, { today: TODAY })).sort()).toEqual([w.teamDocId, w.lineDocId, w.pm2DocId].sort());
    }
  });

  it("기안자는 자기 작성 중 문서를 `작성 중` 그룹에서 본다", async () => {
    const w = await setup();
    const list = await listExpenses(w.pm, { status: "open" }, { today: TODAY });
    expect(list.groups.find((group) => group.label === "작성 중")?.rows.map((row) => row.id)).toEqual([w.draftId]);
  });

  it("관리자가 팀장 계급의 expenses.team 보기를 끄면 팀장 목록에서 팀원 문서가 사라진다(결재 관련자가 아닐 때)", async () => {
    const w = await setup();
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses.team", action: "view", allowed: false });
    expect(idsOf(await listExpenses(w.lead, { status: "open" }, { today: TODAY }))).toEqual([]);
    expect(await getExpense(w.lead, { expenseId: w.teamDocId })).toBeNull();
  });
});

describe("문서 · 증빙 목록 · 서명 GET이 같은 판정 (404)", () => {
  it("박서연의 제출 문서는 김도윤 · 대표에게 보이고 정하나 · 이지훈에게는 없는 문서다", async () => {
    const w = await setup();
    const storage = createMemoryStorage();
    const files = await listEvidence(w.pm, { ownerKind: "expense", ownerId: w.teamDocId });
    const fileId = files[0]?.id;
    if (!fileId) throw new Error("증빙 없음");
    for (const viewer of [w.lead, w.ceo]) {
      expect(await getExpense(viewer, { expenseId: w.teamDocId })).not.toBeNull();
      expect(await listEvidence(viewer, { ownerKind: "expense", ownerId: w.teamDocId })).toHaveLength(1);
      expect(await createEvidenceViewUrl(viewer, { fileId }, { storage })).not.toBeNull();
    }
    for (const viewer of [w.lead2, w.pm2]) {
      expect(await getExpense(viewer, { expenseId: w.teamDocId })).toBeNull();
      expect(await listEvidence(viewer, { ownerKind: "expense", ownerId: w.teamDocId })).toEqual([]);
      expect(await createEvidenceViewUrl(viewer, { fileId }, { storage })).toBeNull();
    }
  });

  it("작성 중 문서는 기안자 말고 아무에게도 보이지 않는다", async () => {
    const w = await setup();
    expect(await getExpense(w.pm, { expenseId: w.draftId })).not.toBeNull();
    for (const viewer of [w.lead, w.ceo, w.divisionHead, w.otherPm, w.lead2]) {
      expect(await getExpense(viewer, { expenseId: w.draftId })).toBeNull();
    }
  });
});

describe("결재 관련자 두 갈래 (지금 단계 후보 · 처리 기록 — P3-6)", () => {
  it("1단 담당이 된 다른 팀 사람은 승인 전엔 후보로, 승인 뒤엔 처리 기록으로 그 문서를 보고 처리하지 않은 다른 문서는 보지 않는다", async () => {
    const w = await setup();
    // 다른 팀(경영관리팀) 한결재 — 이 계급만 1단 담당(전사). expenses.team 없음 · 업무 범위 team.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `외부 결재-${randomUUID()}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    // 새 계급은 정보 노출 행이 없어 문서 칸이 비어 온다 — 시드 계급처럼 지출결의 정보 항목 둘을 켠다.
    for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const approver = await makePerson("한결재", role.id, "경영관리팀");
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, true);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID, role.id);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE, "company");
    // 박서연의 작성 중 문서를 지금 제출한다 — 이 문서만 1단 = 한결재(앞서 제출한 둘은 1단이 꺼진 결재선).
    const routed = w.draftId;
    const submitted = await submitReadyDraft(w.pm, routed, { now: NOW });
    expect(submitted.kind).toBe("submitted");

    // 승인 전 — 지금 단계 후보 갈래.
    expect(idsOf(await listExpenses(approver, { status: "open" }, { today: TODAY }))).toEqual([routed]);
    expect(await getExpense(approver, { expenseId: routed })).not.toBeNull();
    expect(await getExpense(approver, { expenseId: w.teamDocId })).toBeNull();

    // 승인 뒤 — 지금 후보가 아니고 처리 기록 갈래(EXISTS)로만 보인다.
    const instance = await instanceOf(routed);
    await approveDocument(approver, { instanceId: instance.id, expectedVersion: instance.version });
    expect(idsOf(await listExpenses(approver, { status: "open" }, { today: TODAY }))).toEqual([routed]);
    expect(await getExpense(approver, { expenseId: routed })).not.toBeNull();
    expect(await getExpense(approver, { expenseId: w.lineDocId })).toBeNull();
  });
});
