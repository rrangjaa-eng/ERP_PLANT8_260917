import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { projectMembers } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, orgUnitIdByName, teamIdByName } from "../approvals-fixtures";

// 06.2-03(D6 · SC-1 · SC-2): 다팀 · 다본부 · 다계급 세계 — 06.2-04 · 05 · 06 · 08 · 10이 재사용한다.
// 기획본부(기획1팀 · 기획2팀) · 경영관리본부(경영관리팀). P1(기획1팀, PM 팀PM) · P2(기획2팀, PM X) · P3(경영관리팀, PM X).
// 사람은 도메인 · 리포지토리 함수로만 만든다(approvals-fixtures 규약). 프로젝트는 업무 범위 전사 · projects 쓰기인 시스템 주체가 만든다
// — 다른 팀 PM 지정(시드 대표에는 projects 쓰기가 없다).
// K1(사용자 답 「쓰기 범위 복사」, 2026-10-08): 화면 계급 view_scope = work_scope — 화면팀(work_scope team · projects 보기)은 team.

export const VIEW_SCOPE_PEOPLE = ["팀PM", "본부장", "대표", "본인범위", "참여자", "X", "무소속", "메뉴없음", "화면팀"] as const;
export type ViewScopePerson = (typeof VIEW_SCOPE_PEOPLE)[number];
export const VIEW_SCOPE_PROJECTS = ["P1", "P2", "P3"] as const;
export type ViewScopeProject = (typeof VIEW_SCOPE_PROJECTS)[number];

export const OWN_SCOPE_ROLE_ID = "role-test-view-own";
export const SCREEN_TEAM_ROLE_ID = "role-test-screen-team";
export const NO_MENU_ROLE_ID = "role-test-no-projects";

export type ViewScopeWorld = {
  people: Record<ViewScopePerson, Viewer>;
  /** 매트릭스 밖 — 상태 전환(projects.status 쓰기) 성공 경로용 기획1팀 팀장. */
  teamLead: Viewer;
  projects: Record<ViewScopeProject, { id: string; name: string; revisionId: string; lineId: string }>;
  teams: { plan1: string; plan2: string; mgmt: string };
  clientId: string;
};

// 06.2-05의 참여자 도메인 함수가 서기 전이라 표에 직접 넣는다(살아 있는 줄 — archived_at null).
export async function insertLiveMember(projectId: string, userId: string, addedBy: string): Promise<void> {
  await db.insert(projectMembers).values({ projectId, userId, addedBy });
}

async function screenRole(id: string, name: string, viewScope: "own" | "team" | "company", projectsView: boolean): Promise<void> {
  await insertRole(SYSTEM_VIEWER, { id, name, workScope: "team", viewScope });
  await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: "projects", action: "view", allowed: projectsView });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: id, infoItem: "project.value", visible: true });
}

export async function buildViewScopeWorld(): Promise<ViewScopeWorld> {
  const plan2 = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: "기획2팀" })).id;
  const plan1 = await teamIdByName("기획1팀");
  const mgmt = await teamIdByName("경영관리팀");

  await screenRole(OWN_SCOPE_ROLE_ID, "본인 범위 계급", "own", true);
  await screenRole(SCREEN_TEAM_ROLE_ID, "화면 팀 계급", "team", true);
  // 메뉴없음: 보는 범위가 전사여도 projects 보기가 없으면 none(메뉴가 먼저).
  await screenRole(NO_MENU_ROLE_ID, "프로젝트 메뉴 없는 계급", "company", false);

  const people: Record<ViewScopePerson, Viewer> = {
    팀PM: await makePerson("팀PM", DEFAULT_ROLE_ID, "기획1팀"),
    본부장: await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀"),
    대표: await makePerson("대표", CEO_ROLE_ID, null),
    본인범위: await makePerson("본인범위", OWN_SCOPE_ROLE_ID, "기획1팀"),
    참여자: await makePerson("참여자", DEFAULT_ROLE_ID, "기획1팀"),
    X: await makePerson("X", DEFAULT_ROLE_ID, "경영관리팀"),
    무소속: await makePerson("무소속", DEFAULT_ROLE_ID, null),
    메뉴없음: await makePerson("메뉴없음", NO_MENU_ROLE_ID, "기획1팀"),
    화면팀: await makePerson("화면팀", SCREEN_TEAM_ROLE_ID, "기획1팀"),
  };
  const teamLead = await makePerson("팀장", TEAM_LEAD_ROLE_ID, "기획1팀");

  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const subcategory = (await firstSelectableSubcategory()).value;

  const make = async (key: ViewScopeProject, teamId: string, pm: Viewer) => {
    const name = `범위 ${key} ${randomUUID().slice(0, 8)}`;
    const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name, startDate: "2026-11-01", endDate: "2026-12-31" });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error(`1차 차수 없음: ${key}`);
    const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory,
          itemName: `${key} 무대`,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
        },
      ],
    });
    const lineId = saved.lines[0]?.id;
    if (!lineId) throw new Error(`견적 줄 없음: ${key}`);
    return { id: created.id, name, revisionId: revision.id, lineId };
  };

  const projects: ViewScopeWorld["projects"] = {
    P1: await make("P1", plan1, people.팀PM),
    P2: await make("P2", plan2, people.X),
    P3: await make("P3", mgmt, people.X),
  };
  await insertLiveMember(projects.P3.id, people.참여자.id, people.대표.id);

  return { people, teamLead, projects, teams: { plan1, plan2, mgmt }, clientId: client.id };
}
