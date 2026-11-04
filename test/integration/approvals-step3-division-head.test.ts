import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps } from "@/db/schema";
import { prepareSubmission, resolveHolders, submitDocument, walkRoute, FALLBACK_ROLE_ID, type PreparedSubmission } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import "@/domain/expenses";
import { LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import "@/domain/leave";
import { SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
import { createOrgUnit } from "@/domain/org";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import { viewerDivision } from "@/domain/permissions/viewer-division";
import { seedFundScope } from "@/domain/seed/fund-scope";
import {
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
} from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { setOrgUnitArchived } from "@/repositories/org-units";
import { upsertSimpleValue } from "@/repositories/settings";
import { setUserArchived } from "@/repositories/users";
import { NOW_2026, teamIdByName } from "./approvals-fixtures";
import { makeFundPerson, setDivisionColumn } from "./fixtures/fund-scope";

// 07.3-02 트레이서(D-7306 · D-7311 · D-7316): ③단 「경영관리」 담당 = 경영관리본부의 본부 책임자.
// 기본값(keys.ts) → 시드 보정 → 결재 스냅숏 본부(팀이 이긴다 · 팀 없으면 본부 칸) → resolveHolders까지 한 줄로 선다.
// 경영관리 사원(실무)과 기획본부 책임자는 ③단 후보가 아니다.

type World = { mgmtHead: Viewer; mgmtStaff: Viewer; planningHead: Viewer; planningStaff: Viewer };

async function buildWorld(): Promise<World> {
  return {
    mgmtHead: await makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, { division: "경영관리본부" }),
    mgmtStaff: await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀"),
    planningHead: await makeFundPerson("기획 책임자", DIVISION_HEAD_ROLE_ID, { division: "기획본부" }),
    planningStaff: await makeFundPerson("기획 사원", DEFAULT_ROLE_ID, "기획1팀"),
  };
}

async function enableSettlementSteps(): Promise<void> {
  await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED.key, true, null);
  await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED.key, true, null);
}

async function prepare(kind: string, drafter: Viewer): Promise<PreparedSubmission> {
  const doc = kind === EXPENSE_DOCUMENT_KIND ? { doc: { teamId: await teamIdByName("기획1팀") } } : {};
  return prepareSubmission(drafter, { kind, drafterId: drafter.id, ...doc }, { now: NOW_2026 });
}

function stepHolders(prepared: PreparedSubmission, stepIndex: number): string[] {
  return prepared.walk.display.find((step) => step.stepIndex === stepIndex)?.holderIds ?? [];
}

function stepState(prepared: PreparedSubmission, stepIndex: number): string | undefined {
  return prepared.walk.display.find((step) => step.stepIndex === stepIndex)?.state;
}

const KINDS = [
  ["지출결의", EXPENSE_DOCUMENT_KIND],
  ["연차", LEAVE_DOCUMENT_KIND],
  ["정산", SETTLEMENT_DOCUMENT_KIND],
] as const;

describe("③단 후보 = 경영관리본부 책임자 (07.3-02 D-7306)", () => {
  it.each(KINDS)("%s: 기획 사원이 상신하면 ③단 후보는 경영관리 책임자(팀 없음) 하나", async (_name, kind) => {
    await enableSettlementSteps();
    const w = await buildWorld();
    const prepared = await prepare(kind, w.planningStaff);
    expect(prepared.steps.find((step) => step.stepIndex === 3)?.roleId).toBe(DIVISION_HEAD_ROLE_ID);
    expect(stepHolders(prepared, 3)).toEqual([w.mgmtHead.id]);
  });

  it("경영관리 책임자에게 경영관리팀 발령이 있어도 ③단 후보다", async () => {
    const mgmtHead = await makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, "경영관리팀");
    await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀");
    const drafter = await makeFundPerson("기획 사원", DEFAULT_ROLE_ID, "기획1팀");
    expect(stepHolders(await prepare(EXPENSE_DOCUMENT_KIND, drafter), 3)).toEqual([mgmtHead.id]);
  });

  it("경영관리 책임자를 보관하면 ③단은 빈 자리다(실무로 내려가지 않는다)", async () => {
    const w = await buildWorld();
    await setUserArchived(SYSTEM_VIEWER, w.mgmtHead.id, true);
    const prepared = await prepare(EXPENSE_DOCUMENT_KIND, w.planningStaff);
    expect(stepState(prepared, 3)).toBe("empty");
    expect(stepHolders(prepared, 3)).toEqual([]);
  });
});

// D-E3(사용자 카드 2026-10-27 19:46 KST 「②단 넣음」): 팀 없는 기안자의 2단(기안자 본부)도 스냅숏 본부 칸으로 선다 — 바뀌기 전에는 대상 id null → 빈 자리.
describe("팀 없는 기안자의 2단 — 스냅숏 본부 칸 (07.3-02 D-E3)", () => {
  it.each(KINDS)("%s: 본부 칸 = 경영관리본부인 기본 계급 기안자 → 2단 = 경영관리 책임자 · 그가 승인하면 ③단은 빈 자리", async (_name, kind) => {
    await enableSettlementSteps();
    const w = await buildWorld();
    const drafter = await makeFundPerson("팀 없는 경영관리 기안자", DEFAULT_ROLE_ID, { division: "경영관리본부" });
    const prepared = await prepare(kind, drafter);
    const step2 = prepared.steps.find((step) => step.stepIndex === 2);
    expect(step2).toMatchObject({ scopeKind: "org_unit", scopeTargetId: prepared.drafterOrgUnitId });
    expect(prepared.drafterOrgUnitId).not.toBeNull();
    expect(stepHolders(prepared, 2)).toEqual([w.mgmtHead.id]);

    // W6: 2단에서 승인한 사람은 같은 차수의 ③단 후보가 아니다 — 남는 사람이 없어 빈 자리.
    const after = walkRoute({
      steps: prepared.steps.map((step) => ({
        ...step,
        scopeKind: step.scopeKind as "team" | "org_unit" | "company",
        isFallback: false,
        actedBy: step.stepIndex === 2 ? w.mgmtHead.id : null,
        actedByName: null,
        actedAt: null,
        action: step.stepIndex === 2 ? ("approved" as const) : null,
        selfApproved: false,
      })),
      snapshot: prepared.snapshot,
      selfApproval: prepared.selfApproval,
      drafterId: drafter.id,
      fallbackRoleId: FALLBACK_ROLE_ID,
      at: "after_approval",
    });
    expect(after.display.find((step) => step.stepIndex === 3)?.state).toBe("empty");
  });
});

describe("보정 전에 상신된 진행 중 문서 (07.3-02 D-7316)", () => {
  it("③단 roleId는 상신 때 굳는다 — 재시드 보정 뒤에도 그 문서의 ③단 후보에 경영관리 실무가 남는다", async () => {
    const w = await buildWorld();
    for (const def of [APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID]) {
      await upsertSimpleValue(SYSTEM_VIEWER, def.key, "", null);
    }
    const prepared = await prepare(EXPENSE_DOCUMENT_KIND, w.planningStaff);
    const instance = await db.transaction((tx) => submitDocument(w.planningStaff, prepared, { documentId: randomUUID() }, tx));

    await seedFundScope(SYSTEM_VIEWER);
    expect(stepHolders(await prepare(EXPENSE_DOCUMENT_KIND, w.planningStaff), 3)).toEqual([w.mgmtHead.id]);

    const stored = await db
      .select({ stepIndex: approvalSteps.stepIndex, roleId: approvalSteps.roleId, scopeTargetId: approvalSteps.scopeTargetId })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(eq(approvalRoutes.instanceId, instance.id))
      .orderBy(asc(approvalSteps.stepIndex));
    const step3 = stored.find((step) => step.stepIndex === 3);
    expect(step3?.roleId).toBeNull();
    const holders = resolveHolders(
      { roleId: step3?.roleId ?? null, scopeKind: "org_unit", scopeTargetId: step3?.scopeTargetId ?? null },
      await listOrgSnapshot(SYSTEM_VIEWER, seoulToday()),
    ).map((person) => person.id);
    expect(holders).toEqual(expect.arrayContaining([w.mgmtHead.id, w.mgmtStaff.id]));
  });
});

// D-7311 불변식: 결재 스냅숏 본부 == 07.3-01 viewerDivision 본부 — 살아 있는 팀 · 팀 없음 갈래.
// 보관 팀 발령 사람은 의도된 차이(스냅숏 null · viewerDivision 팀의 본부)라 여기서 지키지 않는다(SUMMARY).
describe("스냅숏 본부 ↔ viewerDivision 일치 (07.3-02 D-7311)", () => {
  it("넷 + 팀이 이기는 사람 + 보관 본부 칸 사람마다 orgUnitId가 같다", async () => {
    const w = await buildWorld();
    const teamWins = await makeFundPerson("팀이 이김", DEFAULT_ROLE_ID, "기획1팀");
    await setDivisionColumn(teamWins.id, (await listOrgSnapshot(SYSTEM_VIEWER, seoulToday())).find((p) => p.id === w.mgmtStaff.id)?.orgUnitId ?? null);
    const archivedUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `보관 본부-${randomUUID()}` });
    const archivedDivision = await makeFundPerson("보관 본부 칸", DEFAULT_ROLE_ID, null);
    await setDivisionColumn(archivedDivision.id, archivedUnit.id);
    await setOrgUnitArchived(SYSTEM_VIEWER, archivedUnit.id, true);
    const noPlacement = await makeFundPerson("소속 없음", DEFAULT_ROLE_ID, null);

    const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, seoulToday());
    const people = [w.mgmtHead, w.mgmtStaff, w.planningHead, w.planningStaff, teamWins, archivedDivision, noPlacement];
    for (const person of people) {
      const row = snapshot.find((p) => p.id === person.id);
      expect({ name: row?.name, orgUnitId: row?.orgUnitId }).toEqual({ name: row?.name, orgUnitId: (await viewerDivision(person)).orgUnitId });
    }
    // 팀이 이긴다 — 본부 칸이 경영관리본부여도 기획1팀의 본부(기획본부).
    const planningOrg = snapshot.find((p) => p.id === w.planningStaff.id)?.orgUnitId;
    expect(snapshot.find((p) => p.id === teamWins.id)?.orgUnitId).toBe(planningOrg);
    expect(snapshot.find((p) => p.id === w.mgmtHead.id)?.orgUnitId).toBe(snapshot.find((p) => p.id === w.mgmtStaff.id)?.orgUnitId);
    expect(snapshot.find((p) => p.id === archivedDivision.id)?.orgUnitId).toBeNull();
  });
});
