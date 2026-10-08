import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps } from "@/db/schema";
import { approveDocument, NotCurrentHolderError } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
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
