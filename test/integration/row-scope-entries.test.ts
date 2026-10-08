import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, projects, purchaseRequests, revenueEntries } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createProject, findProject, getProjectCopySource, loadProjectList } from "@/domain/projects";
import { changeProjectStatus, ForbiddenError as StatusForbiddenError, loadStatusChangeFacts, ProjectNotFoundError } from "@/domain/projects/status";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import {
  ForbiddenError as LinesForbiddenError,
  getCurrentQuoteRevision,
  listQuoteLines,
  prepareQuoteLineSave,
  RevisionNotFoundError,
  restoreQuoteLine,
  saveQuoteLines,
  SaveRejectedError,
} from "@/domain/quotes/lines";
import { canOpenProject } from "@/domain/projects/visibility";
import { listRevenue, saveRevenue } from "@/domain/revenue";
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
import { purchaseProject, request as purchaseRequestFor, requestInput } from "./fixtures/purchase-requests";
import { ForbiddenError as PermissionForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import {
  createCardUsage,
  listCardUsages,
  listProjectCardUsages,
  loadCardUsageForEdit,
  precheckCardUsage,
  precheckCardUsageUpdate,
  type CardUsageInput,
} from "@/domain/corp-card-usages";
import { cardLinkLineChoice, cardLinkProjectChoice, searchLinesForCardLink, searchProjectsForCardLink } from "@/domain/corp-card-usages/link-targets";
import {
  completePurchaseRequest,
  createPurchaseRequest,
  listPurchaseRequests,
  precheckPurchaseCompletion,
  precheckPurchaseRequest,
  purchaseRequestEntry,
  searchLinesForPurchaseLink,
  type PurchaseRequestInput,
} from "@/domain/purchase-requests";
import { listReserveReferences, listReserves, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { listArchive } from "@/domain/archive";
import { setQuoteLineArchived } from "@/repositories/quote-lines";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
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
// 06.2-04: 카드 연결 · 구매 요청 줄 기준의 기존 「없음」 갈래(LINK_MISSING) — 범위 밖 줄 id도 이 문구다.
const LINK_MISSING_TEXT = "연결 없음 · 연결 고르기";

function isNotFound(error: unknown): boolean {
  return (
    error instanceof ProjectNotFoundError ||
    error instanceof RevisionNotFoundError ||
    (error instanceof UserFacingError && (error.message === NOT_FOUND_TEXT || error.message === LINK_MISSING_TEXT))
  );
}

// menuDenied: 06.2-04 카드 · 구매 입구는 projects 보기 문(can.ts ForbiddenError)을 먼저 본다 — 메뉴없음은 행과 무관하게 denied.
async function outcomeOf(run: () => Promise<unknown>, opts: { menuDenied?: boolean } = {}): Promise<Outcome> {
  try {
    return (await run()) === null ? "hidden" : "open";
  } catch (error) {
    if (isNotFound(error)) return "hidden";
    if (error instanceof LinesForbiddenError) return "denied";
    if (opts.menuDenied && error instanceof PermissionForbiddenError) return "denied";
    if (error instanceof UserFacingError) return "open";
    throw error;
  }
}

function perProject(
  run: (viewer: Viewer, project: ViewScopeWorld["projects"][ViewScopeProject]) => Promise<unknown>,
  opts: { menuDenied?: boolean } = {},
): Entry["probe"] {
  return async (viewer, world) => {
    const result: Partial<Record<ViewScopeProject, Outcome>> = {};
    for (const key of VIEW_SCOPE_PROJECTS) result[key] = await outcomeOf(() => run(viewer, world.projects[key]), opts);
    return result;
  };
}

function outcomesFor(visible: readonly ViewScopeProject[]): Record<ViewScopeProject, Outcome> {
  return Object.fromEntries(VIEW_SCOPE_PROJECTS.map((key) => [key, visible.includes(key) ? "open" : "hidden"])) as Record<ViewScopeProject, Outcome>;
}

// projects 보기 문이 먼저인 입구 — 메뉴없음은 denied, 나머지는 보임대로.
function menuGated(visible: readonly ViewScopeProject[], person: ViewScopePerson): Record<ViewScopeProject, Outcome> | "denied" {
  if (person === "메뉴없음") return Object.fromEntries(VIEW_SCOPE_PROJECTS.map((key) => [key, "denied"])) as Record<ViewScopeProject, Outcome>;
  return outcomesFor(visible);
}

// 고르개 결과 중 세계의 P1~P3만(다른 it이 만든 프로젝트는 뺀다) — 메뉴없음은 projects 보기 문에서 denied.
async function pickedWorldIds(world: ViewScopeWorld, run: () => Promise<{ rows: { id?: string }[] }>): Promise<string[] | "denied"> {
  const worldIds = new Set(VIEW_SCOPE_PROJECTS.map((key) => world.projects[key].id));
  try {
    return (await run()).rows.flatMap((row) => (row.id && worldIds.has(row.id) ? [row.id] : [])).sort();
  } catch (error) {
    if (error instanceof PermissionForbiddenError) return "denied";
    throw error;
  }
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
  // 06.2-04 Task 2(compare §3 #7 · #8 · RESEARCH M6): 카드 섹션 · 카드 연결 고르개 · 구매 요청 줄 기준.
  {
    name: "프로젝트 카드 섹션(listProjectCardUsages)",
    probe: perProject((viewer, project) => listProjectCardUsages(viewer, project.id), { menuDenied: true }),
    expected: (visible, _world, person) => menuGated(visible, person),
  },
  {
    name: "카드 연결 프로젝트 고르개(searchProjectsForCardLink, 검색어 없음)",
    probe: (viewer, world) => pickedWorldIds(world, () => searchProjectsForCardLink(viewer, { query: "" })),
    expected: (visible, world, person) => (person === "메뉴없음" ? "denied" : idsOf(world, visible)),
  },
  {
    name: "카드 연결 프로젝트 고르개(q = P3 이름)",
    probe: (viewer, world) => pickedWorldIds(world, () => searchProjectsForCardLink(viewer, { query: world.projects.P3.name })),
    expected: (visible, world, person) => (person === "메뉴없음" ? "denied" : idsOf(world, visible.filter((key) => key === "P3"))),
  },
  {
    name: "카드 연결 줄 고르개(searchLinesForCardLink)",
    probe: perProject((viewer, project) => searchLinesForCardLink(viewer, { projectId: project.id, query: "" }), { menuDenied: true }),
    expected: (visible, _world, person) => menuGated(visible, person),
  },
  {
    name: "카드 연결 프로젝트 선택(cardLinkProjectChoice)",
    probe: perProject((viewer, project) => cardLinkProjectChoice(viewer, project.id)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "카드 연결 진입 줄(cardLinkLineChoice)",
    probe: perProject((viewer, project) => cardLinkLineChoice(viewer, project.lineId)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    name: "구매 요청 줄 고르개(searchLinesForPurchaseLink)",
    probe: perProject((viewer, project) => searchLinesForPurchaseLink(viewer, { projectId: project.id, query: "" }), { menuDenied: true }),
    expected: (visible, _world, person) => menuGated(visible, person),
  },
  {
    name: "구매 요청 진입 줄(purchaseRequestEntry)",
    probe: perProject((viewer, project) => purchaseRequestEntry(viewer, project.lineId)),
    expected: (visible) => outcomesFor(visible),
  },
  {
    // 사전 판정만(쓰지 않는다) — 범위 안이면 줄 기준을 돌려주고, 범위 밖 줄 id는 기존 「연결 없음」(T-06.2-31).
    name: "구매 요청 줄 기준(precheckPurchaseRequest 견적 줄)",
    probe: perProject((viewer, project) => precheckPurchaseRequest(viewer, requestInput(project.lineId)), { menuDenied: true }),
    expected: (visible, _world, person) => menuGated(visible, person),
  },
];

const cases = ENTRIES.flatMap((entry) => VIEW_SCOPE_PEOPLE.map((person) => ({ entry, person, label: `${entry.name} × ${person}` })));

describe("행 범위 매트릭스 (06.2-03)", () => {
  it("케이스 하한 — 입구(06.2-03 열둘 + 06.2-04) × 사람 아홉(화면팀 포함 — K1)", () => {
    expect(VIEW_SCOPE_PEOPLE).toHaveLength(9);
    expect(VIEW_SCOPE_PROJECTS).toHaveLength(3);
    expect(ENTRIES).toHaveLength(23);
    expect(cases.length).toBeGreaterThanOrEqual(23 * 9);
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

  // F-7: saveRevenue는 쓰기 전에 범위를 본다 — 권리(rights)를 주입해 권한 문을 지나도 범위 밖이면 없음이고 줄이 남지 않는다.
  it("매출 줄 저장(saveRevenue) — 범위 밖(팀PM → P3)이면 없음 · 쓰지 않는다", async () => {
    const attempt = saveRevenue(
      w.people.팀PM,
      w.projects.P3.id,
      { paidEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1_100_000, fxRate: 1 } }] },
      { rights: { canWriteEntries: true } },
    );
    await expect(attempt).rejects.toThrow(NOT_FOUND_TEXT);
    expect(await db.select({ id: revenueEntries.id }).from(revenueEntries).where(eq(revenueEntries.projectId, w.projects.P3.id))).toEqual([]);
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

  it("기안 뒤 프로젝트가 기안자 범위 밖이 돼도(담당 팀 이동) 기안자는 정산 문서 · 결재함을 오류 없이 연다(검토 I-1)", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    await db.update(projects).set({ teamId: w.teams.mgmt, pmUserId: w.people.X.id }).where(eq(projects.id, fx.projectId));
    expect(await canOpenProject(fx.pm, fx.projectId)).toBe(false);

    const doc = await getSettlement(fx.pm, { projectId: fx.projectId });
    expect(doc?.quoteTotalKrw).toBeTypeOf("number");
    await expect(listMyInbox(fx.pm, { withDetails: true })).resolves.toBeDefined();
  });
});

// 06.2-04 Task 2 — 카드 연결 쓰기(M7) · 카드 사용 · 구매 요청 목록 「전부 보기」 지름길(K2 · D-6220).
function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function personalCard(holder: Viewer): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "개인 카드", kind: "personal", holderUserId: holder.id });
  if (!card.id) throw new Error("카드 id 없음");
  return card.id;
}

function teamCostUsage(corpCardId: string): CardUsageInput {
  return { corpCardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount: 10_000, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "team_cost", memo: null };
}

// 권한 키 하나를 켠 화면 계급(work_scope team · view_scope team — K1 꼴) 사람, 기획1팀.
async function privilegedPerson(menu: "cards.proxy" | "cards.purchases", name: string): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `${name}-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of ["team.value", "card_usage.value", "card_usage.amount", "purchase_request.value", "purchase_request.amount", "project.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return makePerson(name, role.id, "기획1팀");
}

describe("카드 연결 쓰기(M7 — T-06.2-31)", () => {
  it("범위 밖 프로젝트 줄 · 견적 외 비용으로 카드 사용을 이으면 기존 「연결 없음」, 범위 안은 지금처럼 통과", async () => {
    const card = await personalCard(w.people.팀PM);
    const base = teamCostUsage(card);
    const line = (lineId: string): CardUsageInput => ({ ...base, linkKind: "quote_line", lineId });
    const outOfQuote = (projectId: string): CardUsageInput => ({ ...base, linkKind: "out_of_quote", projectId, itemName: "현장 다과" });

    await expect(precheckCardUsage(w.people.팀PM, line(w.projects.P3.lineId))).rejects.toThrow(LINK_MISSING_TEXT);
    await expect(precheckCardUsage(w.people.팀PM, outOfQuote(w.projects.P3.id))).rejects.toThrow(LINK_MISSING_TEXT);
    expect((await precheckCardUsage(w.people.팀PM, line(w.projects.P1.lineId))).projectId).toBe(w.projects.P1.id);
    expect((await precheckCardUsage(w.people.팀PM, outOfQuote(w.projects.P1.id))).projectId).toBe(w.projects.P1.id);
    // 참여자는 붙은 P3 줄에 잇는다(D-6205 ③).
    const memberCard = await personalCard(w.people.참여자);
    expect((await precheckCardUsage(w.people.참여자, { ...teamCostUsage(memberCard), linkKind: "quote_line", lineId: w.projects.P3.lineId })).projectId).toBe(w.projects.P3.id);
  });
});

describe("카드 사용 · 구매 요청 목록 「전부 보기」 지름길(K2 · D-6220)", () => {
  const usages: Partial<Record<"X" | "본부장" | "팀PM", string>> = {};
  const requests: Partial<Record<"X" | "본부장" | "팀PM", string>> = {};
  let proxy: Viewer;
  let purchaser: Viewer;
  const month = seoulToday().slice(0, 7);

  beforeAll(async () => {
    for (const key of ["X", "본부장", "팀PM"] as const) {
      const viewer = w.people[key];
      const input = teamCostUsage(await personalCard(viewer));
      usages[key] = (await createCardUsage(viewer, input, await precheckCardUsage(viewer, input))).id;
      const request: PurchaseRequestInput = { linkKind: "team_cost", itemName: `${key} 소모품`, linkUrl: "https://www.coupang.com/vp/products/1", estimate: { currency: "KRW", amount: 50_000, fxRate: 1 }, memo: null };
      requests[key] = (await createPurchaseRequest(viewer, request, await precheckPurchaseRequest(viewer, request))).id;
    }
    proxy = await privilegedPerson("cards.proxy", "카드대리");
    purchaser = await privilegedPerson("cards.purchases", "구매담당");
  }, 120_000);

  async function seenUsages(viewer: Viewer): Promise<string[]> {
    const mine = new Set(Object.values(usages));
    return (await listCardUsages(viewer, { month }, seoulToday())).rows.flatMap((row) => (row.id && mine.has(row.id) ? [row.id] : [])).sort();
  }
  async function seenRequests(viewer: Viewer): Promise<string[]> {
    const mine = new Set(Object.values(requests));
    return (await listPurchaseRequests(viewer, { status: "all" })).rows.flatMap((row) => (row.id && mine.has(row.id) ? [row.id] : [])).sort();
  }
  const ids = (map: Partial<Record<string, string>>, keys: readonly string[]) => keys.map((key) => map[key] as string).sort();

  it("본부장(work_scope company · view_scope org_unit)은 다른 본부 행을 못 보고 자기 카드 사용 · 자기 요청만 본다", async () => {
    expect(await seenUsages(w.people.본부장)).toEqual(ids(usages, ["본부장"]));
    expect(await seenRequests(w.people.본부장)).toEqual(ids(requests, ["본부장"]));
  });

  it("대표(view_scope company) → 전부", async () => {
    expect(await seenUsages(w.people.대표)).toEqual(ids(usages, ["X", "본부장", "팀PM"]));
    expect(await seenRequests(w.people.대표)).toEqual(ids(requests, ["X", "본부장", "팀PM"]));
  });

  it("privileged(view_scope team) — cards.proxy는 카드 사용 전부 · cards.purchases는 구매 요청 전부", async () => {
    expect(await seenUsages(proxy)).toEqual(ids(usages, ["X", "본부장", "팀PM"]));
    expect(await seenRequests(purchaser)).toEqual(ids(requests, ["X", "본부장", "팀PM"]));
  });

  it("팀PM(work_scope team) — 06.2 전과 같은 자기 거름(회귀)", async () => {
    expect(await seenUsages(w.people.팀PM)).toEqual(ids(usages, ["팀PM"]));
    expect(await seenRequests(w.people.팀PM)).toEqual(ids(requests, ["팀PM"]));
  });

  // 독립 검토 F-8: D-6220 문장 「work_scope team + view_scope company가 지름길을 얻는다」를 직접 잰다 — 보는 범위가 company면 업무 범위가 team이어도 전부.
  it("work_scope team · view_scope company 계급은 지름길을 얻어 카드 사용 · 구매 요청 전부를 본다(D-6220)", async () => {
    const wide = await rolePerson("전사열람팀", "company", [], ["team.value", "card_usage.value", "card_usage.amount", "purchase_request.value", "purchase_request.amount", "project.value"]);
    expect(await seenUsages(wide)).toEqual(ids(usages, ["X", "본부장", "팀PM"]));
    expect(await seenRequests(wide)).toEqual(ids(requests, ["X", "본부장", "팀PM"]));
  });
});

// 권한 · 노출을 고른 계급의 사람(work_scope team — 보는 범위만 바꾼다), 기획1팀.
async function rolePerson(
  name: string,
  viewScope: "team" | "company",
  grants: readonly { menu: string; action: "view" | "write" }[],
  infoItems: readonly string[],
): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `${name}-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope });
  for (const grant of [...grants, { menu: "projects", action: "view" as const }]) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, ...grant, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson(name, role.id, "기획1팀");
}

describe("리저브 이름 · 선택지 · 저장(M8 — 06.2-04 Task 3)", () => {
  const RESERVE_GRANTS = [
    { menu: "pnl", action: "view" },
    { menu: "pnl", action: "write" },
  ] as const;
  const RESERVE_ITEMS = ["reserve.amount", "project.value", "vendor.value"];
  const MISMATCH = "다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기";
  let team: Viewer;
  let company: Viewer;
  const rowIds: Record<"P1" | "P3", string> = { P1: randomUUID(), P3: randomUUID() };

  const deposit = (projectId: string, id: string = randomUUID()): ReserveWriteRow => ({
    id,
    isNew: true,
    clientId: w.clientId,
    entryDate: "2026-09-01",
    direction: "deposit",
    amount: { currency: "KRW", amount: 100_000, fxRate: 1 },
    projectId,
  });

  beforeAll(async () => {
    team = await rolePerson("리저브팀", "team", RESERVE_GRANTS, RESERVE_ITEMS);
    company = await rolePerson("리저브전사", "company", RESERVE_GRANTS, RESERVE_ITEMS);
    await saveReserves(company, { rows: [deposit(w.projects.P1.id, rowIds.P1), deposit(w.projects.P3.id, rowIds.P3)] });
  }, 120_000);

  async function mine(viewer: Viewer) {
    const ids = new Set(Object.values(rowIds));
    return (await listReserves(viewer, {})).rows.filter((row) => ids.has(row.id));
  }

  it("listReserves — 범위 밖 P3 줄은 프로젝트 이름이 비고 P1은 보인다 · 잔액 · 고객사는 모든 줄(전 고객사 유지)", async () => {
    const rows = await mine(team);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(rowIds.P1)?.projectName).toBe(w.projects.P1.name);
    expect(byId.get(rowIds.P3)?.projectName).toBeNull();
    for (const id of Object.values(rowIds)) {
      expect(byId.get(id)?.clientName).not.toBe("");
      expect(byId.get(id)?.balanceKrw).toBeGreaterThan(0);
    }
    const all = new Map((await mine(company)).map((row) => [row.id, row]));
    expect(all.get(rowIds.P3)?.projectName).toBe(w.projects.P3.name);
  });

  it("listReserveReferences — 프로젝트 선택지는 범위 안만(P1 있음 · P3 없음), 전사는 셋 다", async () => {
    const teamIds = (await listReserveReferences(team)).projects.map((option) => option.id);
    expect(teamIds).toContain(w.projects.P1.id);
    expect(teamIds).not.toContain(w.projects.P3.id);
    expect((await listReserveReferences(company)).projects.map((option) => option.id)).toEqual(expect.arrayContaining(idsOf(w, ["P1", "P2", "P3"])));
  });

  it("saveReserves — 범위 밖 P3를 새로 고르면 기존 「고를 수 없음」 갈래로 거부, P1은 저장, 저장된 P3 줄은 프로젝트를 안 바꾸면 그대로 고친다", async () => {
    const bad = deposit(w.projects.P3.id);
    const error = await saveReserves(team, { rows: [bad] }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SaveRejectedError);
    expect((error as SaveRejectedError).formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field: "projectId", reason: MISMATCH })]);

    await expect(saveReserves(team, { rows: [deposit(w.projects.P1.id)] })).resolves.toBeUndefined();

    const stored = (await mine(company)).find((row) => row.id === rowIds.P3);
    if (!stored) throw new Error("P3 리저브 줄 없음");
    const edit: ReserveWriteRow = {
      id: rowIds.P3,
      version: stored.version,
      clientId: w.clientId,
      entryDate: "2026-09-01",
      direction: "deposit",
      amount: { currency: "KRW", amount: 100_000, fxRate: 1 },
      projectId: w.projects.P3.id,
      note: "범위 밖 줄 메모",
    };
    await expect(saveReserves(team, { rows: [edit] })).resolves.toBeUndefined();
  });
});

describe("보관함 견적 줄(I-2 · M-2 — listProjectIdsInScope 첫 호출자)", () => {
  const ARCHIVE_GRANTS = [{ menu: "admin.archive", action: "view" }] as const;
  let team: Viewer;
  let company: Viewer;
  const lines: Record<"inScope" | "outOfScope", string> = { inScope: "", outOfScope: "" };

  async function archivedLine(teamId: string, label: string): Promise<string> {
    const created = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId, pmUserId: w.people.X.id, name: `보관 줄 ${label} ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error("1차 차수 없음");
    const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName: `${label} 보관 줄`,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 500_000, fxRate: 1 },
        },
      ],
    });
    const lineId = saved.lines[0]?.id;
    if (!lineId) throw new Error("견적 줄 없음");
    expect(await setQuoteLineArchived(SYSTEM_VIEWER, lineId, true)).toBe(true);
    return lineId;
  }

  beforeAll(async () => {
    team = await rolePerson("보관팀", "team", ARCHIVE_GRANTS, ["archive.value"]);
    company = await rolePerson("보관전사", "company", ARCHIVE_GRANTS, ["archive.value"]);
    lines.inScope = await archivedLine(w.teams.plan1, "기획1팀");
    lines.outOfScope = await archivedLine(w.teams.mgmt, "경영관리팀");
  }, 120_000);

  async function archivedLineIds(viewer: Viewer): Promise<string[]> {
    const wanted = new Set(Object.values(lines));
    return (await listArchive(viewer)).filter((row) => row.entity === "quote_line" && wanted.has(row.id)).map((row) => row.id);
  }

  it("팀 범위는 자기 팀 프로젝트의 보관 줄만 — 범위 밖 줄 이름이 보관함으로 새지 않는다", async () => {
    expect(await archivedLineIds(team)).toEqual([lines.inScope]);
  });

  it("전사 범위는 둘 다", async () => {
    expect((await archivedLineIds(company)).sort()).toEqual([lines.inScope, lines.outOfScope].sort());
  });
});

describe("상태 전환 사실의 범위 날짜 — 주입한 시계(M-6)", () => {
  it("now를 주입하면 그 날짜의 발령으로 범위를 만든다 — 오늘 옮긴 팀이 아니라 그날의 팀", async () => {
    const mover = await makePerson("시계발령", DEFAULT_ROLE_ID, "기획1팀");
    await assignTeam(SYSTEM_VIEWER, { userId: mover.id, teamId: w.teams.mgmt, effectiveFrom: kstToday(new Date()) });
    const today = await loadStatusChangeFacts(mover);
    expect(today.rowScope).toMatchObject({ rows: "limited", by: { kind: "team", teamId: w.teams.mgmt } });
    const past = await loadStatusChangeFacts(mover, { now: () => new Date("2026-06-01T03:00:00Z") });
    expect(past.rowScope).toMatchObject({ rows: "limited", by: { kind: "team", teamId: w.teams.plan1 } });
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

// ── 06.2-06 이행: 06.2-03 검토 M-3 · 06.2-04 검토 F-8 ─────────────────────────────────

// M-3: includeArchived(보관함 보기) 사람 — 보관 프로젝트도 범위 안만 열린다. 보관함 권한이 없으면 범위 안이어도 없음.
describe("보관 프로젝트 · includeArchived (06.2-03 M-3)", () => {
  const ITEMS = ["project.value", "quote.amount"];
  let withArchive: Viewer;
  let withoutArchive: Viewer;
  const archived: Record<"inScope" | "outOfScope", { id: string; revisionId: string }> = {
    inScope: { id: "", revisionId: "" },
    outOfScope: { id: "", revisionId: "" },
  };

  async function archivedProject(teamId: string, label: string) {
    const created = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId, pmUserId: w.people.X.id, name: `보관 프로젝트 ${label} ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error("1차 차수 없음");
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, created.id));
    return { id: created.id, revisionId: revision.id };
  }

  beforeAll(async () => {
    withArchive = await rolePerson("보관보기", "team", [{ menu: "admin.archive", action: "view" }], ITEMS);
    withoutArchive = await rolePerson("보관못봄", "team", [], ITEMS);
    archived.inScope = await archivedProject(w.teams.plan1, "기획1팀");
    archived.outOfScope = await archivedProject(w.teams.mgmt, "경영관리팀");
  }, 120_000);

  it("보관함 보기 + 팀 범위 — 범위 안 보관 프로젝트는 상세 · 견적 줄이 열리고, 범위 밖 보관 프로젝트는 없음", async () => {
    expect((await findProject(withArchive, archived.inScope.id))?.id).toBe(archived.inScope.id);
    expect(await findProject(withArchive, archived.outOfScope.id)).toBeNull();
    expect(await canOpenProject(withArchive, archived.inScope.id)).toBe(true);
    expect(await canOpenProject(withArchive, archived.outOfScope.id)).toBe(false);
    await expect(listQuoteLines(withArchive, archived.inScope.revisionId, { status: "bidding", canWrite: false })).resolves.toBeDefined();
    await expect(listQuoteLines(withArchive, archived.outOfScope.revisionId, { status: "bidding", canWrite: false })).rejects.toBeInstanceOf(RevisionNotFoundError);
  });

  it("보관함 권한이 없으면 범위 안 보관 프로젝트도 없음(includeArchived 거짓)", async () => {
    expect(await findProject(withoutArchive, archived.inScope.id)).toBeNull();
    expect(await canOpenProject(withoutArchive, archived.inScope.id)).toBe(false);
    await expect(listQuoteLines(withoutArchive, archived.inScope.revisionId, { status: "bidding", canWrite: false })).rejects.toBeInstanceOf(RevisionNotFoundError);
  });
});

// M-3: org_unit 범위인데 오늘 발령이 없는 본부 책임자 — 본부 id가 null이라 범위 조각은 false, 담당 PM 프로젝트만 보인다(D-6207 · CSO-4).
describe("발령 없는 본부 책임자 · org_unit id null (06.2-03 M-3)", () => {
  it("본부 조각 없이 PM 프로젝트만 보이고 같은 팀 프로젝트도 없음", async () => {
    const head = await makePerson("발령없는본부장", DIVISION_HEAD_ROLE_ID, null);
    const own = await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.plan1, pmUserId: head.id, name: `발령 없음 PM ${randomUUID()}`, startDate: "2026-11-01", endDate: "2026-12-31" });
    expect((await loadProjectList(head, {})).rows.map((row) => row.id)).toEqual([own.id]);
    expect((await findProject(head, own.id))?.id).toBe(own.id);
    expect(await findProject(head, w.projects.P1.id)).toBeNull();
    expect(await canOpenProject(head, w.projects.P1.id)).toBe(false);
  });
});

// F-8 ①②: 카드 사용 수정 — 이미 이은 건이라 수정은 열리고 범위 밖 프로젝트 이름만 비며, 범위 밖 줄로 갈아탈 수는 없다.
describe("카드 사용 수정 · 범위 밖 줄 (06.2-04 F-8)", () => {
  async function linkedUsage(name: string): Promise<{ viewer: Viewer; cardId: string; usageId: string }> {
    const viewer = await makePerson(name, DEFAULT_ROLE_ID, "기획1팀");
    const cardId = await personalCard(viewer);
    const input: CardUsageInput = { ...teamCostUsage(cardId), linkKind: "quote_line", lineId: w.projects.P1.lineId };
    const created = await createCardUsage(viewer, input, await precheckCardUsage(viewer, input));
    return { viewer, cardId, usageId: created.id };
  }

  it("수정 화면의 프로젝트 이름 — 범위 안이면 번호 · 이름, 범위 밖으로 옮겨도 수정은 열리고 이름만 빈다", async () => {
    const { viewer, usageId } = await linkedUsage("라벨사람");
    const before = await loadCardUsageForEdit(viewer, usageId);
    expect(before?.usage.projectLabel).toContain(w.projects.P1.name);

    await assignTeam(SYSTEM_VIEWER, { userId: viewer.id, teamId: w.teams.mgmt, effectiveFrom: kstToday(new Date()) });
    const after = await loadCardUsageForEdit(viewer, usageId);
    expect(after).not.toBeNull();
    expect(after?.usage.id).toBe(usageId);
    expect(after?.usage.projectLabel).toBeNull();
  });

  it("수정에서 범위 밖 줄로 연결을 바꾸면 기존 「연결 없음」, 같은 줄 그대로는 통과", async () => {
    const { viewer, cardId, usageId } = await linkedUsage("수정사람");
    const edit = await loadCardUsageForEdit(viewer, usageId);
    const version = edit?.usage.version;
    if (version === undefined) throw new Error("수정 화면에 version이 없습니다");
    const update = (lineId: string) => ({ ...teamCostUsage(cardId), id: usageId, version, linkKind: "quote_line" as const, lineId });

    await expect(precheckCardUsageUpdate(viewer, update(w.projects.P3.lineId))).rejects.toThrow(LINK_MISSING_TEXT);
    expect((await precheckCardUsageUpdate(viewer, update(w.projects.P1.lineId))).projectId).toBe(w.projects.P1.id);
  });
});

// F-8 ④ · F-3 — `pmNameOf`(domain/corp-card-usages/index.ts)는 수정 권리(등록자 · cards.proxy) 뒤에 부르므로 범위 판정이 따로 없으면
// 범위 밖 프로젝트의 담당 PM 이름이 상한 문구 재료(pre.pmName)로 나간다. 고침: findProjectInScope로 읽고 범위 밖이면 빈 이름.
describe("구매 완료 건 수정 · 범위 밖 프로젝트의 담당 PM 이름 (06.2-04 F-8 ④ · F-3)", () => {
  it("범위 밖 프로젝트에 이은 구매 완료 건을 수정 사전 조회해도 담당 PM 이름이 나오지 않는다", async () => {
    const fx = await purchaseProject();
    const created = await purchaseRequestFor(fx, fx.onlineLine);
    const buyer = await privilegedPerson("cards.purchases", "구매처리자");
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: "공용 카드", kind: "shared" });
    if (!card.id) throw new Error("카드 id 없음");
    const [requestRow] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    const completion = {
      requestId: created.id,
      version: requestRow?.version ?? 0,
      corpCardId: card.id,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW" as const, amount: 110_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      memo: null,
    };
    const done = await completePurchaseRequest(buyer, completion, await precheckPurchaseCompletion(buyer, completion));
    // 구매 처리자(기획1팀, 보는 범위 team)에게 이 프로젝트(구매 픽스처의 다른 팀)는 범위 밖이다.
    expect(await findProject(buyer, fx.projectId)).toBeNull();

    const [usageRow] = await db.select({ version: corpCardUsages.version }).from(corpCardUsages).where(eq(corpCardUsages.id, done.usageId));
    const pre = await precheckCardUsageUpdate(buyer, {
      corpCardId: card.id,
      usedOn: completion.usedOn,
      merchantVendorId: null,
      total: completion.total,
      evidenceTypeCode: completion.evidenceTypeCode,
      memo: null,
      linkKind: "quote_line",
      lineId: fx.onlineLine,
      id: done.usageId,
      version: usageRow?.version ?? 0,
    });
    expect(pre.pmName ?? "").not.toContain("박서연");
  });
});
