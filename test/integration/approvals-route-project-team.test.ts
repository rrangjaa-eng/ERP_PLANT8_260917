import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { approveDocument, NotCurrentHolderError, prepareSubmission, previewRoute, rejectDocument } from "@/domain/approvals";
import {
  createExpenseFromLines,
  createTeamExpenseDraft,
  EXPENSE_DOCUMENT_KIND,
  ExpenseNotFoundError,
  listExpenseFormOptions,
  saveExpenseDraft,
  submitExpense,
} from "@/domain/expenses";
import { listExpenses } from "@/domain/expenses/list";
import { previewExpenseRoute } from "@/domain/expenses/route-doc";
import { getSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE } from "@/domain/settings/keys";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupApprovedProject, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 06.2-02(G34 · D-6215 · D-6216 · SC-6): 지출결의 1단계 = 행사 담당 팀(projects.team_id)의 1단 계급(기본 팀장).
// 다른 팀 사람이 PM인 행사도 결재는 행사 담당 팀장에게 간다 — 저장 단계는 team + 프로젝트 팀 id(ScopeKind 불변).
// 260907은 단계 종류 project_team_lead가 projects.team_id를 봤다(`O: server/src/expenses.ts:1106-1117`).

type World = ExpenseFixture & { otherTeamPm: Viewer; mgmtLead: Viewer; plan1: string; mgmt: string; otherProject: { id: string; lineId: string } };

// 기획1팀 행사(담당 PM = 경영관리팀 사람)를 하나 더 둔다 — 06.2-08 픽스처 setupApprovedProject(시스템 주체가 다른 팀 PM 지정).
async function setup(): Promise<World> {
  const fx = await setupExpenseProject();
  const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
  const mgmtLead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
  const plan1 = await teamIdByName("기획1팀");
  const mgmt = await teamIdByName("경영관리팀");
  const otherProject = await setupApprovedProject("타팀 PM 행사", plan1, otherTeamPm, fx.stageOneId);
  return { ...fx, otherTeamPm, mgmtLead, plan1, mgmt, otherProject };
}

async function submitOnLine(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  const submitted = await submitReadyDraft(viewer, expenseId);
  expect(submitted.kind).toBe("submitted");
  return expenseId;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function stepOne(instanceId: string, round = 1) {
  const rows = await db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, label: approvalSteps.label, scopeKind: approvalSteps.scopeKind, scopeTargetId: approvalSteps.scopeTargetId })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
  const row = rows.find((step) => step.round === round && step.stepIndex === 1);
  if (!row) throw new Error(`${round}차 1단계 없음`);
  return row;
}

describe("G34 1단계 = 행사 담당 팀장", () => {
  it("다른 팀 PM이 올린 견적 줄 지출결의의 1단계는 행사 담당 팀(기획1팀) 팀장이다 — 기안자 팀 팀장이 아니다", async () => {
    const w = await setup();
    const expenseId = await submitOnLine(w.otherTeamPm, w.otherProject.lineId);
    const instance = await instanceOf(expenseId);
    expect(await stepOne(instance.id)).toMatchObject({ scopeKind: "team", scopeTargetId: w.plan1, label: "행사 담당 팀장" });

    await expect(approveDocument(w.mgmtLead, { instanceId: instance.id, expectedVersion: instance.version })).rejects.toBeInstanceOf(NotCurrentHolderError);
    await expect(approveDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version })).resolves.toBeDefined();
  });

  it("1단 범위를 drafter_team으로 저장해 두면 저장 값이 이긴다 — 기안자 팀(경영관리팀) 팀장 (D-6225)", async () => {
    const w = await setup();
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE.key, "drafter_team", null);
    const expenseId = await submitOnLine(w.otherTeamPm, w.otherProject.lineId);
    const instance = await instanceOf(expenseId);
    expect(await stepOne(instance.id)).toMatchObject({ scopeKind: "team", scopeTargetId: w.mgmt, label: "팀장" });

    await expect(approveDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version })).rejects.toBeInstanceOf(NotCurrentHolderError);
    await expect(approveDocument(w.mgmtLead, { instanceId: instance.id, expectedVersion: instance.version })).resolves.toBeDefined();
  });

  it("같은 팀 행사(기획1팀 PM · 기획1팀 프로젝트)는 지금과 같은 사람 — 기획1팀 팀장 (D-6216)", async () => {
    const w = await setup();
    const expenseId = await submitOnLine(w.pm, w.lines.withVendor);
    const instance = await instanceOf(expenseId);
    expect(await stepOne(instance.id)).toMatchObject({ scopeKind: "team", scopeTargetId: w.plan1 });

    await expect(approveDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version })).resolves.toBeDefined();
  });

  it("저장 행이 없으면 1단 조직 범위 값은 project_team이다", async () => {
    expect(await getSettingValue(APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE)).toBe("project_team");
  });
});

// 팀 비용 문서(프로젝트 없음)를 채워 둔다 — expense-team-attribution의 fillAndSubmit과 같은 칸(제출은 호출자가).
async function teamCostDraft(viewer: Viewer, vendorId: string): Promise<string> {
  const { expenseId, version } = await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", content: "팀 회식" } });
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: version,
    fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  return expenseId;
}

async function draftOnLine(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

describe("팀 비용 · 빈 자리 · EXP-04 · 미리보기", () => {
  it("목록 상태 낱말은 계급 이름만 — 「팀장 결재 중」, 저장 단계 이름은 「행사 담당 팀장」 그대로 (A-9 · 2026-10-09)", async () => {
    const w = await setup();
    const lineExpenseId = await submitOnLine(w.pm, w.lines.withVendor);
    const teamExpenseId = await teamCostDraft(w.pm, w.stageOneId);
    expect((await submitReadyDraft(w.pm, teamExpenseId)).kind).toBe("submitted");
    const rows = (await listExpenses(w.pm, { status: "open" })).groups.flatMap((group) => group.rows);
    for (const expenseId of [lineExpenseId, teamExpenseId]) {
      expect(rows.find((row) => row.id === expenseId)?.statusWord).toBe("팀장 결재 중");
      expect((await stepOne((await instanceOf(expenseId)).id)).label).toBe("행사 담당 팀장");
    }
  });

  it("팀 비용 문서(기획1팀 사람 · 프로젝트 없음)의 1단계는 귀속 팀(기획1팀) 팀장이다", async () => {
    const w = await setup();
    const expenseId = await teamCostDraft(w.pm, w.stageOneId);
    expect((await submitReadyDraft(w.pm, expenseId)).kind).toBe("submitted");
    const instance = await instanceOf(expenseId);
    expect(await stepOne(instance.id)).toMatchObject({ scopeKind: "team", scopeTargetId: w.plan1, label: "행사 담당 팀장" });
    await expect(approveDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version })).resolves.toBeDefined();
  });

  it("문서 팀이 둘 다 없으면 1단계는 담당 없는 빈 자리로 건너뛴다 — 제출은 새 예외 없이 된다", async () => {
    const w = await setup();
    const expenseId = await teamCostDraft(w.pm, w.stageOneId);
    // 팀 비용 문서는 만들 때 귀속 팀이 정해져 도메인 경로로는 비울 수 없다 — 손상 행을 직접 만든다(expense-project-scope 선례).
    await db.update(expenses).set({ attributedTeamId: null }).where(eq(expenses.id, expenseId));
    expect((await submitReadyDraft(w.pm, expenseId)).kind).toBe("submitted");
    const instance = await instanceOf(expenseId);
    expect(await stepOne(instance.id)).toMatchObject({ scopeKind: "team", scopeTargetId: null });
    await expect(approveDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version })).rejects.toBeInstanceOf(NotCurrentHolderError);
  });

  it("EXP-04 — 제출 뒤 1단 설정을 바꿔도 진행 중 문서의 1단계는 그대로고, 반려 뒤 다시 제출하면 그때 설정으로 다시 푼다", async () => {
    const w = await setup();
    const expenseId = await submitOnLine(w.otherTeamPm, w.otherProject.lineId);
    const instance = await instanceOf(expenseId);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE.key, "drafter_team", null);
    expect(await stepOne(instance.id)).toMatchObject({ scopeTargetId: w.plan1, label: "행사 담당 팀장" });

    await rejectDocument(w.lead, { instanceId: instance.id, expectedVersion: instance.version, reason: "다시" });
    expect((await submitExpense(w.otherTeamPm, { expenseId, expectedVersion: await versionOf(expenseId) })).kind).toBe("submitted");
    expect(await stepOne(instance.id, 1)).toMatchObject({ scopeTargetId: w.plan1 });
    expect(await stepOne(instance.id, 2)).toMatchObject({ scopeKind: "team", scopeTargetId: w.mgmt, label: "팀장" });
  });

  it("문서 없이 부르는 미리보기는 1단 자리를 사람 이름 없이 「행사 담당 팀장」으로 낸다 (D-6224)", async () => {
    const w = await setup();
    const preview = await previewRoute(w.otherTeamPm, { kind: EXPENSE_DOCUMENT_KIND });
    expect(preview.steps[0]).toEqual({ label: "행사 담당 팀장", holderNames: "", skipped: false });
  });

  it("문서 id로 부르는 미리보기는 문서 팀을 풀어 담당자 이름까지 내고, 남의 문서 · 없는 id는 없는 문서다", async () => {
    const w = await setup();
    const own = await draftOnLine(w.otherTeamPm, w.otherProject.lineId);
    const preview = await previewExpenseRoute(w.otherTeamPm, { expenseId: own });
    expect(preview.steps[0]).toEqual({ label: "행사 담당 팀장", holderNames: "김도윤", skipped: false });

    const others = await draftOnLine(w.pm, w.lines.withVendor);
    await expect(previewExpenseRoute(w.otherTeamPm, { expenseId: others })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(previewExpenseRoute(w.otherTeamPm, { expenseId: randomUUID() })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("project_team 단계가 있는 종류를 문서 팀 없이 제출 준비하면 즉시 오류다 — 빈 자리로 조용히 넘어가지 않는다", async () => {
    const w = await setup();
    await expect(prepareSubmission(w.otherTeamPm, { kind: EXPENSE_DOCUMENT_KIND, drafterId: w.otherTeamPm.id })).rejects.toThrow("결재선: project_team 단계에 문서 팀 없음");
  });
});
