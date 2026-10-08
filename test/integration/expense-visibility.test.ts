import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenses, projectMembers, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam, createTeam } from "@/domain/org";
import { approveDocument, getApprovalView, listCurrentSteps, listMyInbox } from "@/domain/approvals";
import { setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED,
} from "@/domain/settings/keys";
import { canSeeExpense, createExpenseFromLines, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND, getExpense, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses } from "@/domain/expenses/list";
import { createEvidenceViewUrl, listEvidence } from "@/domain/evidence";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { confirmEvidence, EvidenceReviewConflictError, EvidenceReviewNotFoundError } from "@/domain/evidence-reviews";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { insertRole, setRoleViewScope } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson, orgUnitIdByName, teamIdByName } from "./approvals-fixtures";
import { insertMembership } from "@/repositories/team-memberships";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { createMemoryStorage } from "./fakes/memory-storage";
import { insertLiveMember } from "./fixtures/view-scope";
import { resetDatabase, skipDbReset } from "./setup";

// 05-08 Task 1(EXP-08 · D-17 · 사용자 결정 2026-09-26 #5): 지출결의 보임 범위 — 기안자 ∪ 결재 관련자(처리한 사람 · 지금 단계 후보)
// ∪ 보는 범위(06.2 D-6202 · D-6217 — view_scope: 문서 팀 · 담당 PM · 참여자, `expenses` 보기 전제. `expenses.team` · 업무 범위는 판정에 쓰지 않는다).
// 작성 중은 기안자만. 목록 · 문서 · 증빙 목록 · 서명 GET이 같은 판정을 쓴다. 1단(팀장)을 끄고 시작해 팀장의 보임이 결재 관련이 아니라 보는 범위에서만 오게 한다.

// 06.2-08: 지급 대상 전사 단축이 canSeeExpense를 부르지 않는지 세려고 같은 구현을 감싼다(동작은 그대로).
vi.mock("@/domain/expenses/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/expenses/access")>();
  return { ...actual, canSeeExpense: vi.fn(actual.canSeeExpense) };
});

// 06.2-08: 파일 끝 SC-3 매트릭스는 세계를 beforeAll 한 번에 만든다(입구 여섯 × 사람 × 문서). 그 앞 describe는 지금처럼 테스트마다 비우고 시드한다.
skipDbReset();
let perTestReset = true;
beforeEach(async () => {
  if (perTestReset) await resetDatabase();
});

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

async function docOf(expenseId: string): Promise<{ id: string; drafterId: string; number: string | null }> {
  const [row] = await db.select({ id: expenses.id, drafterId: expenses.drafterId, number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
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

async function approveThrough(expenseId: string, approvers: Viewer[]): Promise<void> {
  for (const approver of approvers) {
    const instance = await instanceOf(expenseId);
    await approveDocument(approver, { instanceId: instance.id, expectedVersion: instance.version });
  }
  expect((await instanceOf(expenseId)).status).toBe("approved");
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

  it("같은 팀 PM(team 범위)은 팀원의 제출 문서를 목록 · 문서 하나에서 보고(기안 열 있음) 다른 팀 팀장은 자기 팀 문서만 본다 (06.2 D-6217)", async () => {
    const w = await setup();
    expect(idsOf(await listExpenses(w.lead2, { status: "open" }, { today: TODAY }))).toEqual([w.pm2DocId]);
    const other = await listExpenses(w.otherPm, { status: "open" }, { today: TODAY });
    expect(idsOf(other).sort()).toEqual([w.teamDocId, w.lineDocId].sort());
    expect(other.drafterColumn).toBe(true);
    expect(await getExpense(w.otherPm, { expenseId: w.teamDocId })).not.toBeNull();
    // 기안 열은 보는 범위가 본인이고 남의 문서가 없을 때만 빠진다.
    await setRoleViewScope(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "own");
    const own = await listExpenses(w.pm2, { status: "open" }, { today: TODAY });
    expect(idsOf(own)).toEqual([w.pm2DocId]);
    expect(own.drafterColumn).toBe(false);
    expect(own.groups.flatMap((group) => group.rows).every((row) => !("drafterName" in row))).toBe(true);
  });

  it("대표(보는 범위 전사) · 본부 책임자(보는 범위 본부 — 두 팀 모두 기획본부)는 제출 문서 전부를 보고 작성 중은 보지 않는다", async () => {
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

  it("관리자가 팀장 계급의 expenses.team 보기를 꺼도 팀장 목록은 그대로고, 보는 범위를 own으로 바꾸면 팀원 문서가 사라진다(결재 관련자가 아닐 때) (06.2 D-6217)", async () => {
    const w = await setup();
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses.team", action: "view", allowed: false });
    expect(idsOf(await listExpenses(w.lead, { status: "open" }, { today: TODAY })).sort()).toEqual([w.teamDocId, w.lineDocId].sort());
    expect(await getExpense(w.lead, { expenseId: w.teamDocId })).not.toBeNull();
    await setRoleViewScope(SYSTEM_VIEWER, TEAM_LEAD_ROLE_ID, "own");
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

describe("보는 범위 갈래는 expenses 보기도 요구한다 (05-08 검토 #2)", () => {
  it("팀장 계급의 expenses 보기를 끄고 expenses.team만 남기면 팀원 문서가 문서 화면 · 증빙 목록 · 서명 GET에서 없는 문서다 — view_scope 판정 (06.2 D-6217)", async () => {
    const w = await setup();
    const storage = createMemoryStorage();
    const fileId = (await listEvidence(w.pm, { ownerKind: "expense", ownerId: w.teamDocId }))[0]?.id;
    if (!fileId) throw new Error("증빙 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses", action: "view", allowed: false });
    expect(await getExpense(w.lead, { expenseId: w.teamDocId })).toBeNull();
    expect(await listEvidence(w.lead, { ownerKind: "expense", ownerId: w.teamDocId })).toEqual([]);
    expect(await createEvidenceViewUrl(w.lead, { fileId }, { storage })).toBeNull();
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

describe("결재 당사자가 아닌 보는 사람 — 상태 · 결재선 읽기만 (05-08 검토 #1)", () => {
  it("팀장 · 대표(결재 당사자 아님)는 읽기 전용 갈래로 상태와 결재선을 보고 할 수 있는 행동이 없다", async () => {
    const w = await setup();
    for (const viewer of [w.lead, w.ceo]) {
      // 기본 갈래는 그대로 당사자만 — 읽기 전용은 문서 보임(canSeeExpense)이 먼저 통과한 화면만 연다.
      expect(await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: w.teamDocId })).toBeNull();
      const view = await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: w.teamDocId, readOnlyVisible: true });
      expect(view?.status).toBe("submitted");
      expect(view?.steps?.length ?? 0).toBeGreaterThan(0);
      expect(view?.actions).toEqual([]);
      expect(view?.approveBlockedReason ?? null).toBeNull();
    }
  });

  it("읽기 전용 갈래도 당사자(기안자)의 행동은 그대로다", async () => {
    const w = await setup();
    const view = await getApprovalView(w.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: w.teamDocId, readOnlyVisible: true });
    expect(view?.actions).toContain("withdraw");
  });
});

describe("두 갈래가 같은 기준일 (05-08 검토 #3)", () => {
  it("canSeeExpense의 today가 지금 단계 후보 판정(조직 스냅숏)에도 쓰인다 — 그날 기안자 팀으로 옮긴 1단 계급은 그날 기준 후보로 문서를 본다", async () => {
    const w = await setup();
    // 1단 = 기안자 팀의 이 계급. expenses 보기만 · 보는 범위 own(06.2) — 팀 갈래가 아니라 후보 갈래로만 보이게 한다.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀 1단-${randomUUID()}`, workScope: "team", viewScope: "own" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    const mover = await makePerson("옮길사람", role.id, "경영관리팀");
    const MOVE_ON = "2099-01-01";
    await insertMembership(SYSTEM_VIEWER, { userId: mover.id, teamId: await teamIdByName("기획1팀"), effectiveFrom: MOVE_ON });
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, true);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID, role.id);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE, "drafter_team");
    const submitted = await submitReadyDraft(w.pm, w.draftId, { now: NOW });
    expect(submitted.kind).toBe("submitted");
    const doc = await docOf(w.draftId);

    expect(await canSeeExpense(mover, doc, { today: TODAY })).toBe(false);
    expect(await canSeeExpense(mover, doc, { today: "2099-01-05" })).toBe(true);
  });
});

describe("문서 하나 판정 순서 (05-08 검토 #4)", () => {
  it("기안자 · 전사 · 팀 갈래로 보이면 진행 중 인스턴스 walk(listCurrentSteps)를 부르지 않고, 셋 다 아닐 때만 부른다", async () => {
    const w = await setup();
    const doc = await docOf(w.teamDocId);
    const steps = vi.fn(listCurrentSteps);
    for (const viewer of [w.pm, w.ceo, w.lead]) expect(await canSeeExpense(viewer, doc, { today: TODAY, listCurrentSteps: steps })).toBe(true);
    expect(steps).not.toHaveBeenCalled();
    expect(await canSeeExpense(w.lead2, doc, { today: TODAY, listCurrentSteps: steps })).toBe(false);
    expect(steps).toHaveBeenCalledTimes(1);
  });
});

// 05-08 검토 #6(시험 공백): 팀 갈래는 「그날 내 팀」과 「지금 문서의 팀」(팀 비용 = 귀속 팀, 견적 줄 문서 = 지금 프로젝트 팀)으로 가르고,
// 삭제된 번호 문서는 누구에게나 없는 문서다. 프로젝트 팀을 바꾸는 · 지출결의를 지우는 도메인 경로가 아직 없어 그 두 사실만 행을 직접 고친다.
describe("팀 이동 · 프로젝트 팀 변경 · 삭제 (05-08 검토 #6)", () => {
  it("팀장이 팀을 옮기면 그날부터 옛 팀 문서는 사라지고 새 팀 문서가 보인다(기준일 = today)", async () => {
    const w = await setup();
    const MOVED_ON = "2026-10-01";
    await insertMembership(SYSTEM_VIEWER, { userId: w.lead.id, teamId: await teamIdByName("기획2팀"), effectiveFrom: MOVED_ON });
    expect(idsOf(await listExpenses(w.lead, { status: "open" }, { today: TODAY })).sort()).toEqual([w.teamDocId, w.lineDocId].sort());
    expect(idsOf(await listExpenses(w.lead, { status: "open" }, { today: MOVED_ON }))).toEqual([w.pm2DocId]);
    expect(await canSeeExpense(w.lead, await docOf(w.teamDocId), { today: MOVED_ON })).toBe(false);
    expect(await canSeeExpense(w.lead, await docOf(w.pm2DocId), { today: MOVED_ON })).toBe(true);
  });

  it("견적 줄 문서는 지금 프로젝트 팀을 따른다 — 프로젝트가 기획2팀으로 옮기면 기획2팀 팀장이 보고 기획1팀 팀장은 못 본다(팀 비용 문서는 귀속 팀 그대로)", async () => {
    const w = await setup();
    await db.update(projects).set({ teamId: await teamIdByName("기획2팀") }).where(eq(projects.id, w.projectId));
    expect(idsOf(await listExpenses(w.lead, { status: "open" }, { today: TODAY }))).toEqual([w.teamDocId]);
    expect(idsOf(await listExpenses(w.lead2, { status: "open" }, { today: TODAY })).sort()).toEqual([w.lineDocId, w.pm2DocId].sort());
    expect(await canSeeExpense(w.lead, await docOf(w.lineDocId), { today: TODAY })).toBe(false);
    expect(await canSeeExpense(w.lead2, await docOf(w.lineDocId), { today: TODAY })).toBe(true);
  });

  it("삭제된 번호 문서는 지금 단계 후보 결재자 · 팀장에게 없는 문서다(목록 · 문서 하나 둘 다)", async () => {
    const w = await setup();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `삭제 결재-${randomUUID()}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    const approver = await makePerson("삭제결재", role.id, "경영관리팀");
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, true);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID, role.id);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE, "company");
    const submitted = await submitReadyDraft(w.pm, w.draftId, { now: NOW });
    expect(submitted.kind).toBe("submitted");
    const doc = await docOf(w.draftId);
    for (const viewer of [approver, w.lead]) expect(await canSeeExpense(viewer, doc, { today: TODAY })).toBe(true);

    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, w.draftId));
    for (const viewer of [approver, w.lead]) {
      expect(await canSeeExpense(viewer, doc, { today: TODAY })).toBe(false);
      expect(await getExpense(viewer, { expenseId: w.draftId })).toBeNull();
      expect(idsOf(await listExpenses(viewer, { status: "open" }, { today: TODAY }))).not.toContain(w.draftId);
    }
  });
});

describe("지급 대상 — 전사 범위 단축 (06.2 T-06.2-83)", () => {
  it("대표(보는 범위 전사)의 지급 대상은 canSeeExpense를 부르지 않고 결재 통과 문서를 싣는다 — 팀장(팀 범위)은 문서마다 부른다", async () => {
    const w = await setup();
    for (const roleId of [CEO_ROLE_ID, TEAM_LEAD_ROLE_ID]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses.payments", action: "write", allowed: true });
    await approveThrough(w.teamDocId, [w.divisionHead, w.ceo]);
    const seen = vi.mocked(canSeeExpense);
    seen.mockClear();
    expect((await listAllPaymentTargets(w.ceo, {})).map((target) => target.row.id)).toEqual([w.teamDocId]);
    expect(seen).not.toHaveBeenCalled();
    expect((await listAllPaymentTargets(w.lead, {})).map((target) => target.row.id)).toEqual([w.teamDocId]);
    expect(seen).toHaveBeenCalled();
  });
});

// ── 06.2-08 Task 2: SC-3 일치 매트릭스 ─────────────────────────────────────
// 세계: 기획본부(기획1팀 · 기획2팀) · 경영관리본부(경영관리팀). P1(기획1팀, PM 박서연) · P2(기획2팀, PM 다른팀PM) · P3(경영관리팀, PM 다른팀PM,
// 참여자 붙음). 결재선은 대표 한 단(1~3단 끔)이라 대표 말고는 결재 관련자가 없다 — C만 1단 = 후보결재자(전사 범위의 그 계급)로 제출해 결재 중으로 둔다.
// 문서: L1(P1 줄, 박서연) · T1 · C(기획1팀 팀 비용, 박서연) · L2(P2 줄, 기획2직원) · L3(P3 줄, 경영직원) · T3(경영관리팀 팀 비용, 경영직원) · DR(P1 작성 중).
// 사람마다 계급에 지급 처리(expenses.payments) 쓰기를 더한다 — 검수 · 지급 대상 입구가 그 권한을 먼저 본다(보임 판정은 그 권한을 읽지 않는다).

const MATRIX_DOCS = ["L1", "T1", "L2", "L3", "T3", "C", "DR"] as const;
type MatrixDoc = (typeof MATRIX_DOCS)[number];
const MATRIX_PEOPLE = ["같은팀PM", "본부장", "대표", "본인범위", "참여자", "다른팀PM", "후보결재자", "화면팀A", "화면팀B"] as const;
type MatrixPerson = (typeof MATRIX_PEOPLE)[number];

type MatrixWorld = {
  people: Record<MatrixPerson, Viewer>;
  drafter: Viewer;
  docs: Record<MatrixDoc, { id: string; fileId: string | null; approved: boolean }>;
  p3: string;
  mgmt: string;
  approverRoleId: string;
};

// 기대(06.2 뒤): 보는 범위(문서 팀 · 담당 PM · 참여자) ∪ 결재 관련자. 작성 중 DR은 누구에게도 없다(기안자 박서연은 매트릭스 밖).
const SEES: Record<MatrixPerson, readonly MatrixDoc[]> = {
  같은팀PM: ["L1", "T1", "C"],
  본부장: ["L1", "T1", "L2", "C"],
  대표: ["L1", "T1", "L2", "L3", "T3", "C"],
  본인범위: [],
  참여자: ["L1", "T1", "L3", "C"],
  다른팀PM: ["L2", "L3", "T3"],
  후보결재자: ["C"],
  화면팀A: ["L1", "T1", "C"],
  화면팀B: ["L1", "T1", "C"],
};

let m: MatrixWorld;

async function matrixRole(name: string, viewScope: "own" | "team", menus: { projects: boolean; expensesTeam: boolean }): Promise<string> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `${name}-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  if (menus.projects) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (menus.expensesTeam) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return role.id;
}

// 결재 통과 가능한 프로젝트(진행 · 1차 고객 승인 · 거래처 있는 줄 하나) — 시스템 주체가 만들고(다른 팀 PM 지정) 고객 승인은 담당 PM이 한다.
async function approvedProject(name: string, teamId: string, pm: Viewer, vendorId: string): Promise<{ id: string; lineId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name, startDate: "2026-09-01", endDate: "2026-12-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error(`1차 차수 없음: ${name}`);
  const subcategory = (await firstSelectableSubcategory()).value;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName: `${name} 무대`,
        vendorId,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  const lineId = saved.lines[0]?.id;
  if (!lineId) throw new Error(`견적 줄 없음: ${name}`);
  await changeProjectStatus(SYSTEM_VIEWER, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(pm, revision.id, { approvedOn: "2026-09-15", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  return { id: project.id, lineId };
}

async function buildMatrix(): Promise<MatrixWorld> {
  for (const key of [APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED, APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED]) {
    await setSettingValue(SYSTEM_VIEWER, key, false);
  }
  const fx = await setupExpenseProject();
  const plan2 = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: "기획2팀" })).id;
  const mgmt = await teamIdByName("경영관리팀");
  const ownRoleId = await matrixRole("본인 범위", "own", { projects: true, expensesTeam: false });
  const approverRoleId = await matrixRole("외부 결재", "own", { projects: false, expensesTeam: false });
  // K1 「쓰기 범위 복사」: 화면 계급은 이행 전 업무 범위(team)를 보는 범위로 받았다.
  const screenARoleId = await matrixRole("화면팀A", "team", { projects: true, expensesTeam: false });
  const screenBRoleId = await matrixRole("화면팀B", "team", { projects: false, expensesTeam: true });

  const people: Record<MatrixPerson, Viewer> = {
    같은팀PM: fx.otherPm,
    본부장: await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀"),
    대표: fx.ceo,
    본인범위: await makePerson("본인범위", ownRoleId, "기획1팀"),
    참여자: await makePerson("참여자", DEFAULT_ROLE_ID, "기획1팀"),
    다른팀PM: await makePerson("다른팀PM", DEFAULT_ROLE_ID, "경영관리팀"),
    후보결재자: await makePerson("후보결재자", approverRoleId, "경영관리팀"),
    화면팀A: await makePerson("화면팀A", screenARoleId, "기획1팀"),
    화면팀B: await makePerson("화면팀B", screenBRoleId, "기획1팀"),
  };
  for (const roleId of [DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID, ownRoleId, approverRoleId, screenARoleId, screenBRoleId]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses.payments", action: "write", allowed: true });
  }
  const plan2Staff = await makePerson("기획2직원", DEFAULT_ROLE_ID, "기획2팀");
  const mgmtStaff = await makePerson("경영직원", DEFAULT_ROLE_ID, "경영관리팀");
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "더테이블", normalizedName: `더테이블-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const p2 = await approvedProject("기획2 행사", plan2, people.다른팀PM, fx.stageOneId);
  const p3 = await approvedProject("경영 행사", mgmt, people.다른팀PM, fx.stageOneId);
  await insertLiveMember(p3.id, people.참여자.id, fx.ceo.id);

  const numbered: Record<Exclude<MatrixDoc, "C" | "DR">, { drafter: Viewer; id: string }> = {
    L1: { drafter: fx.pm, id: await submittedLineDoc(fx.pm, fx.lines.withVendor) },
    T1: { drafter: fx.pm, id: await submittedTeamDoc(fx.pm, vendor.id, "1팀 회식") },
    L2: { drafter: plan2Staff, id: await submittedLineDoc(plan2Staff, p2.lineId) },
    L3: { drafter: mgmtStaff, id: await submittedLineDoc(mgmtStaff, p3.lineId) },
    T3: { drafter: mgmtStaff, id: await submittedTeamDoc(mgmtStaff, vendor.id, "경영 회식") },
  };
  for (const doc of Object.values(numbered)) await approveThrough(doc.id, [fx.ceo]);

  // C — 1단 = 후보결재자 계급(전사)으로 제출하고 결재 중으로 둔다.
  await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED, true);
  await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID, approverRoleId);
  await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE, "company");
  const cId = await submittedTeamDoc(fx.pm, vendor.id, "1팀 다과");
  const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
  const drId = draft.created[0]?.expenseId;
  if (!drId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(draft.blocked)}`);

  const fileOf = async (drafter: Viewer, id: string) => (await listEvidence(drafter, { ownerKind: "expense", ownerId: id }))[0]?.id ?? null;
  const docs = {} as MatrixWorld["docs"];
  for (const [key, doc] of Object.entries(numbered) as [Exclude<MatrixDoc, "C" | "DR">, { drafter: Viewer; id: string }][]) {
    docs[key] = { id: doc.id, fileId: await fileOf(doc.drafter, doc.id), approved: true };
  }
  docs.C = { id: cId, fileId: await fileOf(fx.pm, cId), approved: false };
  docs.DR = { id: drId, fileId: null, approved: false };
  return { people, drafter: fx.pm, docs, p3: p3.id, mgmt, approverRoleId };
}

// 검수 입구 — 버전 -1로 확인을 시도한다. 보이면 잠금 뒤 버전 충돌, 안 보이면 트랜잭션 전 「없는 지출결의」. 어느 쪽도 쓰지 않는다.
async function reviewOpens(viewer: Viewer, expenseId: string): Promise<boolean> {
  try {
    await confirmEvidence(viewer, { expenseId, version: -1 });
  } catch (error) {
    if (error instanceof EvidenceReviewNotFoundError) return false;
    if (error instanceof EvidenceReviewConflictError) return true;
    throw error;
  }
  throw new Error("버전 -1 확인이 통과했다");
}

type MatrixEntry = { name: string; applies: (doc: MatrixWorld["docs"][MatrixDoc]) => boolean; sees: (viewer: Viewer, doc: MatrixWorld["docs"][MatrixDoc]) => Promise<boolean> };
const matrixStorage = createMemoryStorage();
const MATRIX_ENTRIES: readonly MatrixEntry[] = [
  { name: "목록", applies: () => true, sees: async (viewer, doc) => idsOf(await listExpenses(viewer, { status: "all" })).includes(doc.id) },
  { name: "문서", applies: () => true, sees: async (viewer, doc) => (await getExpense(viewer, { expenseId: doc.id })) !== null },
  { name: "증빙 목록", applies: () => true, sees: async (viewer, doc) => (await listEvidence(viewer, { ownerKind: "expense", ownerId: doc.id })).length > 0 },
  {
    name: "서명 GET",
    applies: (doc) => doc.fileId !== null,
    sees: async (viewer, doc) => (await createEvidenceViewUrl(viewer, { fileId: doc.fileId ?? "" }, { storage: matrixStorage })) !== null,
  },
  { name: "검수", applies: () => true, sees: (viewer, doc) => reviewOpens(viewer, doc.id) },
  { name: "지급 대상", applies: (doc) => doc.approved, sees: async (viewer, doc) => (await listAllPaymentTargets(viewer, {})).some((target) => target.row.id === doc.id) },
];

function matrixCaseName(person: MatrixPerson, doc: MatrixDoc, entry: string, visible: boolean): string {
  const narrowed = person === "본부장" && (doc === "L3" || doc === "T3") ? " (06.2 D-6219 좁힘 — 06.2 전에는 업무 범위 전사로 봤다)" : "";
  return `${person} × ${doc} × ${entry} → ${visible ? "보임" : "없음"}${narrowed}`;
}

const MATRIX_CASES = MATRIX_PEOPLE.flatMap((person) =>
  MATRIX_DOCS.flatMap((doc) => MATRIX_ENTRIES.map((entry) => ({ person, doc, entry, visible: SEES[person].includes(doc) }))),
);

describe("06.2 보는 범위 일치 (SC-3)", () => {
  beforeAll(async () => {
    perTestReset = false;
    await resetDatabase();
    m = await buildMatrix();
  });

  it("매트릭스 하한 — 사람 아홉 × 문서 일곱 × 입구 여섯, 보임 · 없음 둘 다 있다", () => {
    expect(MATRIX_CASES.length).toBeGreaterThanOrEqual(9 * 7 * 6);
    expect(MATRIX_CASES.filter((c) => c.visible).length).toBeGreaterThanOrEqual(20);
    expect(MATRIX_CASES.filter((c) => !c.visible).length).toBeGreaterThanOrEqual(20);
  });

  it.each(MATRIX_CASES.map((c) => [matrixCaseName(c.person, c.doc, c.entry.name, c.visible), c] as const))("%s", async (_name, c) => {
    const doc = m.docs[c.doc];
    if (!c.entry.applies(doc)) return;
    expect(await c.entry.sees(m.people[c.person], doc)).toBe(c.visible);
  });

  it("작성 중 DR은 기안자에게만 — 목록 · 문서", async () => {
    expect(idsOf(await listExpenses(m.drafter, { status: "all" }))).toContain(m.docs.DR.id);
    expect(await getExpense(m.drafter, { expenseId: m.docs.DR.id })).not.toBeNull();
  });

  it("화면팀A: K1 「쓰기 범위 복사」로 보는 범위 team — 자기 팀 문서(06.2 전 = 없음, D-6217로 넓어짐 · 옛 「K1 대가: 지출결의 팀→전사」 넓힘은 없다) · 화면팀B는 06.2 전과 같은 집합", async () => {
    // 06.2 전 규칙(access.ts 옛 판정): 전사 = `expenses` 보기 ∧ 업무 범위 company, 팀 = `expenses` ∧ `expenses.team` 보기 ∧ 문서 팀 = 내 팀.
    // 화면팀A(업무 범위 team · expenses.team 없음) → 기안자 · 결재 관련 문서만 = 없음. 화면팀B(expenses.team 있음) → 기획1팀 문서.
    const before: Record<"화면팀A" | "화면팀B", MatrixDoc[]> = { 화면팀A: [], 화면팀B: ["L1", "T1", "C"] };
    for (const person of ["화면팀A", "화면팀B"] as const) {
      const ids = idsOf(await listExpenses(m.people[person], { status: "all" }));
      for (const doc of before[person]) expect(ids).toContain(m.docs[doc].id);
      expect(ids.sort()).toEqual(SEES[person].map((doc) => m.docs[doc].id).sort());
      expect(ids).not.toContain(m.docs.L3.id);
    }
  });

  it("결재함은 보는 범위로 거르지 않는다 — 후보결재자(본인 범위) · 대표의 건수가 보는 범위를 바꿔도 같다 (D-6205 ②)", async () => {
    const counts = async () => {
      const approver = await listMyInbox(m.people.후보결재자);
      const ceo = await listMyInbox(m.people.대표);
      return { mine: approver.mine.length, ceoProcessed: ceo.processed.length };
    };
    const before = await counts();
    expect(before).toEqual({ mine: 1, ceoProcessed: 5 });
    await setRoleViewScope(SYSTEM_VIEWER, m.approverRoleId, "company");
    await setRoleViewScope(SYSTEM_VIEWER, CEO_ROLE_ID, "own");
    try {
      expect(await counts()).toEqual(before);
    } finally {
      await setRoleViewScope(SYSTEM_VIEWER, m.approverRoleId, "own");
      await setRoleViewScope(SYSTEM_VIEWER, CEO_ROLE_ID, "company");
    }
  });

  it("참여자를 떼면(보관) P3 줄 문서 L3가 여섯 입구에서 사라지고 다시 붙이면 돌아온다", async () => {
    const member = and(eq(projectMembers.projectId, m.p3), eq(projectMembers.userId, m.people.참여자.id));
    await db.update(projectMembers).set({ archivedAt: new Date() }).where(member);
    try {
      for (const entry of MATRIX_ENTRIES) expect(await entry.sees(m.people.참여자, m.docs.L3), entry.name).toBe(false);
    } finally {
      await db.update(projectMembers).set({ archivedAt: null }).where(member);
    }
    expect(await getExpense(m.people.참여자, { expenseId: m.docs.L3.id })).not.toBeNull();
  });
});

describe("팀 이동 (검토 반영 R1: eng I9)", () => {
  it("같은팀PM을 오늘(KST)부터 경영관리팀으로 옮기면 기획1팀 문서가 여섯 입구에서 사라지고 경영관리팀 문서가 보인다", async () => {
    const mover = m.people.같은팀PM;
    await assignTeam(SYSTEM_VIEWER, { userId: mover.id, teamId: m.mgmt, effectiveFrom: seoulToday() });
    for (const entry of MATRIX_ENTRIES) {
      for (const doc of ["L1", "T1", "C"] as const) if (entry.applies(m.docs[doc])) expect(await entry.sees(mover, m.docs[doc]), `${entry.name} ${doc}`).toBe(false);
      for (const doc of ["L3", "T3"] as const) if (entry.applies(m.docs[doc])) expect(await entry.sees(mover, m.docs[doc]), `${entry.name} ${doc}`).toBe(true);
    }
  });
});
