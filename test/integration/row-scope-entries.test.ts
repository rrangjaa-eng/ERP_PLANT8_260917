import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createProject, findProject, getProjectCopySource, loadProjectList } from "@/domain/projects";
import { changeProjectStatus, ForbiddenError as StatusForbiddenError, ProjectNotFoundError } from "@/domain/projects/status";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { ForbiddenError as LinesForbiddenError, listQuoteLines, prepareQuoteLineSave, RevisionNotFoundError, restoreQuoteLine } from "@/domain/quotes/lines";
import { canOpenProject } from "@/domain/projects/visibility";
import { listRevenue } from "@/domain/revenue";
import { listProjectIssueRequests } from "@/domain/issue-requests";
import { getSettlement, getSettlementHeader, submitSettlement } from "@/domain/settlements";
import { listMyInbox } from "@/domain/approvals";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
} from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { setupSettlementProject } from "./fixtures/settlements";
import { assignTeam, createTeam } from "@/domain/org";
import { setTeamArchived } from "@/repositories/teams";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstToday } from "@/lib/kst-date";
import { completeViaApproval } from "@/test/support/settlement-authority";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { resetDatabase, skipDbReset } from "./setup";
import {
  buildViewScopeWorld,
  insertLiveMember,
  VIEW_SCOPE_PEOPLE,
  VIEW_SCOPE_PROJECTS,
  type ViewScopePerson,
  type ViewScopeProject,
  type ViewScopeWorld,
} from "./fixtures/view-scope";

// 06.2-03(SC-1 · SC-2 · D-6205 ① · ③ · D-6206 · D-6207 · D-6208): 사람 × 입구 × 보임/숨김 매트릭스.
// 케이스는 ENTRIES × VIEW_SCOPE_PEOPLE를 flatMap으로만 만든다(정렬 · 셔플 없음) — 입구가 빠지면 하한 단언이 붉어진다.
// 세계는 한 번만 만든다(케이스마다 TRUNCATE + 시드는 느리다) — 매트릭스 입구는 세계를 바꾸지 않는다.
// K1(사용자 답 「쓰기 범위 복사」): 화면팀(work_scope team · projects 보기)은 view_scope team → {P1}(플랜 원문의 {P1, P2, P3}가 아니다).

skipDbReset();
let w: ViewScopeWorld;
beforeAll(async () => {
  await resetDatabase();
  w = await buildViewScopeWorld();
}, 120_000);

// 정의상 보이는 프로젝트(오늘 KST 발령 기준). 팀PM: 자기 팀 · 본부장: 기획본부 팀 둘 · 대표: 전부 · 본인범위: PM · 참여 없음
// · 참여자: 자기 팀 + 참여 P3 · X: PM P2 + 자기 팀 P3 · 무소속: 팀 없음(PM · 참여 없음) · 메뉴없음: 보기 권한 없음 · 화면팀: 자기 팀(K1).
const VISIBLE: Record<ViewScopePerson, readonly ViewScopeProject[]> = {
  팀PM: ["P1"],
  본부장: ["P1", "P2"],
  대표: ["P1", "P2", "P3"],
  본인범위: [],
  참여자: ["P1", "P3"],
  X: ["P2", "P3"],
  무소속: [],
  메뉴없음: [],
  화면팀: ["P1"],
};

// 입구 하나의 결과 — 없음(404 · 「존재하지 않는 프로젝트」 · 차수 없음)만 hidden이다. 범위 안 사람이 받는 다른 사용자 오류
// (상태 바뀜 · 낡은 차수 · 게이트 막힘)는 행에 닿았다는 뜻이라 open — 매트릭스 쓰기 입구는 세계를 바꾸지 않는 입력만 쓴다.
// denied: 견적 줄 저장 준비 · 복원은 권리(projects 쓰기 · 조정)를 먼저 본다 — 권리 없는 사람은 행과 무관하게 같은 권리 문구라
// 존재 여부가 새지 않는다(LINE_WRITERS 밖 사람의 기대값).
type Outcome = "open" | "hidden" | "denied";
const NOT_FOUND_TEXT = "존재하지 않는 프로젝트";

function isNotFound(error: unknown): boolean {
  return (
    error instanceof ProjectNotFoundError ||
    error instanceof RevisionNotFoundError ||
    (error instanceof UserFacingError && error.message === NOT_FOUND_TEXT)
  );
}

async function outcomeOf(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return (await run()) === null ? "hidden" : "open";
  } catch (error) {
    if (isNotFound(error)) return "hidden";
    if (error instanceof LinesForbiddenError) return "denied";
    if (error instanceof UserFacingError) return "open";
    throw error;
  }
}

function perProject(run: (viewer: Viewer, project: ViewScopeWorld["projects"][ViewScopeProject]) => Promise<unknown>): Entry["probe"] {
  return async (viewer, world) => {
    const result: Partial<Record<ViewScopeProject, Outcome>> = {};
    for (const key of VIEW_SCOPE_PROJECTS) result[key] = await outcomeOf(() => run(viewer, world.projects[key]));
    return result;
  };
}

function outcomesFor(visible: readonly ViewScopeProject[]): Record<ViewScopeProject, Outcome> {
  return Object.fromEntries(VIEW_SCOPE_PROJECTS.map((key) => [key, visible.includes(key) ? "open" : "hidden"])) as Record<ViewScopeProject, Outcome>;
}

// 견적 줄 쓰기 권리(projects 쓰기 — 시드상 기획 PM만, 금액 노출 staffDefault)가 있는 사람.
const LINE_WRITERS: readonly ViewScopePerson[] = ["팀PM", "참여자", "X", "무소속"];

function lineWriteOutcomes(visible: readonly ViewScopeProject[], person: ViewScopePerson): Record<ViewScopeProject, Outcome> {
  if (LINE_WRITERS.includes(person)) return outcomesFor(visible);
  return Object.fromEntries(VIEW_SCOPE_PROJECTS.map((key) => [key, "denied"])) as Record<ViewScopeProject, Outcome>;
}

type Entry = {
  name: string;
  probe: (viewer: Viewer, world: ViewScopeWorld) => Promise<unknown>;
  expected: (visible: readonly ViewScopeProject[], world: ViewScopeWorld, person: ViewScopePerson) => unknown;
};

function idsOf(world: ViewScopeWorld, keys: readonly ViewScopeProject[]): string[] {
  return keys.map((key) => world.projects[key].id).sort();
}

const ENTRIES: Entry[] = [
  {
    name: "프로젝트 목록",
    probe: async (viewer) => (await loadProjectList(viewer, {})).rows.map((row) => row.id).sort(),
    expected: (visible, world) => idsOf(world, visible),
  },
  {
    name: "프로젝트 검색(q = P3 이름)",
    probe: async (viewer, world) => (await loadProjectList(viewer, { search: world.projects.P3.name })).rows.map((row) => row.id).sort(),
    expected: (visible, world) => idsOf(world, visible.filter((key) => key === "P3")),
  },
  {
    name: "프로젝트 합계(건수 = 목록 건수)",
    probe: async (viewer) => {
      const list = await loadProjectList(viewer, {});
      return { total: list.total, count: list.totals.count, rows: list.rows.length };
    },
    expected: (visible) => ({ total: visible.length, count: visible.length, rows: visible.length }),
  },
  {
    name: "프로젝트 상세(findProject)",
    probe: perProject((viewer, project) => findProject(viewer, project.id)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "복사 출처(getProjectCopySource)",
    probe: perProject((viewer, project) => getProjectCopySource(viewer, project.id)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    // from이 지금 상태(수주중)와 달라 범위 안이면 상태 바뀜 · 게이트 막힘으로 끝난다 — 쓰지 않는다.
    name: "상태 전환(changeProjectStatus)",
    probe: perProject((viewer, project) => changeProjectStatus(viewer, project.id, { from: "lost", to: "in_progress" })),
    expected: (visible) => outcomesFor(visible),
  },
  {
    // 화면이 본 상태가 달라 잠금 뒤 전부 거부 — 쓰지 않는다.
    name: "원장 저장(saveProjectLedger 기간)",
    probe: perProject((viewer, project) =>
      saveProjectLedger(viewer, project.id, {
        seenStatus: "completed",
        period: { startDate: "2026-11-01", endDate: "2026-12-31", baseline: { startDate: "2026-11-01", endDate: "2026-12-31" } },
      }),
    ),
    expected: (visible) => outcomesFor(visible),
  },
  {
    // 없는 차수 id라 범위 안이면 낡은 차수(또는 쓰기 권한 없음)로 끝난다.
    name: "차수 만들기(createRevisionFromCurrent)",
    probe: perProject((viewer, project) => createRevisionFromCurrent(viewer, { projectId: project.id, fromRevisionId: randomUUID() })),
    expected: (visible) => outcomesFor(visible),
  },
  {
    // 기준값이 틀려 범위 안이면 게이트가 막는다.
    name: "고객 승인(setCustomerApproval)",
    probe: perProject((viewer, project) => setCustomerApproval(viewer, project.revisionId, { approvedOn: "2026-10-01", seenTotalKrw: -1, contentToken: "stale" })),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "견적 줄 목록(listQuoteLines)",
    probe: perProject((viewer, project) => listQuoteLines(viewer, project.revisionId, { status: "bidding", canWrite: false })),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "견적 줄 저장 준비(prepareQuoteLineSave)",
    probe: perProject((viewer, project) => prepareQuoteLineSave(viewer, project.revisionId)),
    expected: (visible, _world, person) => lineWriteOutcomes(visible, person),
  },
  {
    // 살아 있는 줄이라 범위 안이면 「이미 복원됨」(restored false)으로 끝난다 — 쓰지 않는다.
    name: "견적 줄 복원(restoreQuoteLine)",
    probe: perProject((viewer, project) => restoreQuoteLine(viewer, project.lineId)),
    expected: (visible, _world, person) => lineWriteOutcomes(visible, person),
  },
  // 06.2-04 Task 1(D-6208 · D-6205 ③ · D-6218): 프로젝트 하위 — 매출 · 발행 요청. 범위 밖은 기존 「존재하지 않는 프로젝트」.
  {
    name: "매출(listRevenue)",
    probe: perProject((viewer, project) => listRevenue(viewer, project.id)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "발행 요청(listProjectIssueRequests)",
    probe: perProject((viewer, project) => listProjectIssueRequests(viewer, project.id)),
    expected: (visible) => outcomesFor(visible),
  },
];

const cases = ENTRIES.flatMap((entry) => VIEW_SCOPE_PEOPLE.map((person) => ({ entry, person, label: `${entry.name} × ${person}` })));

describe("행 범위 매트릭스 (06.2-03)", () => {
  it("케이스 하한 — 입구(06.2-03 열둘 + 06.2-04) × 사람 아홉(화면팀 포함 — K1)", () => {
    expect(VIEW_SCOPE_PEOPLE).toHaveLength(9);
    expect(VIEW_SCOPE_PROJECTS).toHaveLength(3);
    expect(ENTRIES).toHaveLength(14);
    expect(cases.length).toBeGreaterThanOrEqual(14 * 9);
  });

  it.each(cases)("$label", async ({ entry, person }) => {
    const actual = await entry.probe(w.people[person], w);
    expect(actual).toEqual(entry.expected(VISIBLE[person], w, person));
  });
});

describe("쓰기 입구 · 가시성 도우미 (06.2-03 Task 2)", () => {
  it("범위 안 쓰기 권리자(팀장 → P1)는 상태 전환이 된다", async () => {
    await changeProjectStatus(w.teamLead, w.projects.P1.id, { from: "bidding", to: "in_progress" });
    const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, w.projects.P1.id));
    expect(row?.status).toBe("in_progress");
  });

  it("쓰기 권리가 있어도 범위 밖(팀장 → P3)이면 없음 — 권리 문구(ForbiddenError)가 아니다", async () => {
    const attempt = changeProjectStatus(w.teamLead, w.projects.P3.id, { from: "bidding", to: "in_progress" });
    await expect(attempt).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(attempt).rejects.not.toBeInstanceOf(StatusForbiddenError);
    const ledger = saveProjectLedger(w.people.팀PM, w.projects.P3.id, { seenStatus: "bidding", period: { startDate: "2026-11-02", endDate: "2026-12-31", baseline: { startDate: "2026-11-01", endDate: "2026-12-31" } } });
    await expect(ledger).rejects.toThrow(NOT_FOUND_TEXT);
    await expect(createRevisionFromCurrent(w.people.팀PM, { projectId: w.projects.P3.id, fromRevisionId: w.projects.P3.revisionId })).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(setCustomerApproval(w.people.팀PM, w.projects.P3.revisionId, null)).rejects.toBeInstanceOf(ProjectNotFoundError);
    const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, w.projects.P3.id));
    expect(row?.status).toBe("bidding");
  });

  it("정산 결재 경로(trigger approval + 결속 권한)는 범위와 무관하게 정산 → 완료", async () => {
    const created = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.mgmt, pmUserId: w.people.X.id, name: `정산 경로 ${randomUUID()}`, startDate: "2026-09-01", endDate: "2026-09-30" });
    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, created.id));
    expect(await canOpenProject(w.people.팀PM, created.id)).toBe(false);
    await completeViaApproval(w.people.팀PM, created.id);
    const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, created.id));
    expect(row?.status).toBe("completed");
  });

  it("canOpenProject — (팀PM, P3) 거짓 · (X, P2) 참 · 없는 id · uuid 아닌 id 거짓", async () => {
    expect(await canOpenProject(w.people.팀PM, w.projects.P3.id)).toBe(false);
    expect(await canOpenProject(w.people.X, w.projects.P2.id)).toBe(true);
    expect(await canOpenProject(w.people.대표, randomUUID())).toBe(false);
    expect(await canOpenProject(w.people.대표, "not-a-uuid")).toBe(false);
  });
});

// 06.2-04 Task 1: 정산 머리 · 제출 · 결재자. 정산 머리는 정산 중 · 문서가 있어야 갈래가 갈려 매트릭스 밖에서 정산 중 프로젝트로 잰다.
// 참여자의 정산 문서 보임은 canSeeSettlement의 work_scope 갈래(eng N2 — 06-19 이월)라 여기서 바꾸지 않는다.
describe("정산 머리 · 제출 · 범위 밖 결재자 (06.2-04 Task 1)", () => {
  async function settlingProject(teamId: string, pm: Viewer, label: string): Promise<string> {
    const created = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId, pmUserId: pm.id, name: `정산 머리 ${label} ${randomUUID()}`, startDate: "2026-09-01", endDate: "2026-09-30" });
    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, created.id));
    return created.id;
  }

  it("정산 머리 — 담당 PM(X)은 다른 팀 프로젝트에서도 올리기를 받고, 범위 밖 사람은 null이다(D-6218)", async () => {
    const s3 = await settlingProject(w.teams.mgmt, w.people.X, "S3");
    expect(await getSettlementHeader(w.people.X, { projectId: s3 })).toEqual({ statusWord: null, canSubmit: true });
    for (const person of ["팀PM", "본부장", "무소속", "메뉴없음"] as const) {
      expect(await getSettlementHeader(w.people[person], { projectId: s3 })).toBeNull();
    }
  });

  it("정산 제출 — 범위 밖 사람의 id 직접 호출은 없음(권리 문구가 아니다)", async () => {
    const s3 = await settlingProject(w.teams.mgmt, w.people.X, "S3 제출");
    for (const person of ["팀PM", "본부장", "무소속"] as const) {
      const attempt = submitSettlement(w.people[person], { projectId: s3 });
      await expect(attempt).rejects.toThrow(NOT_FOUND_TEXT);
      await expect(attempt).rejects.not.toBeInstanceOf(StatusForbiddenError);
    }
  });

  it("정산 문서가 있으면 — 범위 안 본부장(P2 꼴)은 상태 낱말, 범위 밖 본부장(P3 꼴)은 null", async () => {
    const s2 = await settlingProject(w.teams.plan2, w.people.X, "S2 문서");
    const s3 = await settlingProject(w.teams.mgmt, w.people.X, "S3 문서");
    await submitSettlement(w.people.X, { projectId: s2 });
    await submitSettlement(w.people.X, { projectId: s3 });
    expect(await getSettlementHeader(w.people.본부장, { projectId: s2 })).toEqual({ statusWord: "중", canSubmit: false });
    expect(await getSettlementHeader(w.people.본부장, { projectId: s3 })).toBeNull();
    expect(await getSettlement(w.people.본부장, { projectId: s3 })).toBeNull();
  });

  it("범위 밖 결재자(D-6205 ②)는 정산 문서 · 결재함 상세를 오류 없이 열고 두 합을 본다(06.2-03 넘김 — totalsOf)", async () => {
    const fx = await setupSettlementProject();
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID.key, DIVISION_HEAD_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE.key, "org_unit", null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID.key, await orgUnitIdByName("경영관리본부"), null);
    const mgmtHead = await makePerson("경영본부장", DIVISION_HEAD_ROLE_ID, "경영관리팀");
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    expect(await canOpenProject(mgmtHead, fx.projectId)).toBe(false);

    const asApprover = await getSettlement(mgmtHead, { projectId: fx.projectId });
    const asPm = await getSettlement(fx.pm, { projectId: fx.projectId });
    expect(asApprover).not.toBeNull();
    expect(asApprover?.quoteTotalKrw).toBeTypeOf("number");
    expect({ quote: asApprover?.quoteTotalKrw, execution: asApprover?.executionTotalKrw }).toEqual({ quote: asPm?.quoteTotalKrw, execution: asPm?.executionTotalKrw });
    const inbox = await listMyInbox(mgmtHead, { withDetails: true });
    expect(inbox.mine.some((item) => item.detail?.rows.some((row) => row.label === "견적가 합"))).toBe(true);
  });
});

describe("자동 정산 순서 · 본인 범위 · 팀 이동 · 보관 팀 (검토 반영 R1 · 지시 3)", () => {
  it("범위 밖 findProject는 자동 정산 쓰기를 일으키지 않는다 — 범위 안 사람이 열면 정산 중(eng N7)", async () => {
    const created = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.mgmt, pmUserId: w.people.X.id, name: `자동 정산 P4 ${randomUUID()}`, startDate: "2026-09-01", endDate: "2026-09-30" });
    await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, created.id));
    expect(await findProject(w.people.팀PM, created.id)).toBeNull();
    const [untouched] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, created.id));
    expect(untouched?.status).toBe("in_progress");
    const seen = await findProject(w.people.대표, created.id);
    expect(seen?.status).toBe("settling");
  });

  it("본인 범위는 PM · 살아 있는 참여 프로젝트만 본다 — 같은 팀 다른 프로젝트는 없음(eng I9)", async () => {
    await insertLiveMember(w.projects.P3.id, w.people.본인범위.id, w.people.대표.id);
    const p5 = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.plan2, pmUserId: w.people.본인범위.id, name: `본인 P5 ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    const ids = (await loadProjectList(w.people.본인범위, {})).rows.map((row) => row.id).sort();
    expect(ids).toEqual([w.projects.P3.id, p5.id].sort());
    expect(await findProject(w.people.본인범위, w.projects.P1.id)).toBeNull();
  });

  it("오늘 팀이 없는 사람(무소속)은 팀 조각 없이 PM 프로젝트를 본다(D-6207 · CSO-4)", async () => {
    const p6 = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.plan2, pmUserId: w.people.무소속.id, name: `무소속 P6 ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    const ids = (await loadProjectList(w.people.무소속, {})).rows.map((row) => row.id);
    expect(ids).toEqual([p6.id]);
  });

  it("오늘 발령이 보관된 팀이면 팀 범위가 없다 — PM · 참여만 남는다(지시 3)", async () => {
    const archivedTeam = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("경영관리본부"), name: "보관될팀" })).id;
    const member = await makePerson("보관팀원", DEFAULT_ROLE_ID, null);
    await assignTeam(SYSTEM_VIEWER, { userId: member.id, teamId: archivedTeam, effectiveFrom: "2026-01-01" });
    const p7 = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: archivedTeam, pmUserId: w.people.X.id, name: `보관 팀 P7 ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    expect((await loadProjectList(member, {})).rows.map((row) => row.id)).toEqual([p7.id]);

    await setTeamArchived(SYSTEM_VIEWER, archivedTeam, true);
    expect((await loadProjectList(member, {})).rows.map((row) => row.id)).toEqual([]);
    expect(await findProject(member, p7.id)).toBeNull();
    expect(await canOpenProject(member, p7.id)).toBe(false);
  });

  it("팀을 옮기면(오늘 발령) 옛 팀 프로젝트가 사라지고 새 팀 프로젝트가 보인다(eng I9)", async () => {
    await assignTeam(SYSTEM_VIEWER, { userId: w.people.팀PM.id, teamId: w.teams.mgmt, effectiveFrom: kstToday(new Date()) });
    const ids = (await loadProjectList(w.people.팀PM, {})).rows.map((row) => row.id);
    expect(ids).not.toContain(w.projects.P1.id);
    expect(ids).toContain(w.projects.P3.id);
    expect(await findProject(w.people.팀PM, w.projects.P1.id)).toBeNull();
    expect((await findProject(w.people.팀PM, w.projects.P3.id))?.id).toBe(w.projects.P3.id);
  });
});
