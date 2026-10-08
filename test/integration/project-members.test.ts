import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createTeam } from "@/domain/org";
import { loadProjectList } from "@/domain/projects";
import { addProjectMembers } from "@/domain/projects/members";
import { addProjectMembersAction } from "@/app/(app)/projects/actions";
import { ACTION_REGISTRY } from "@/lib/actions/registry";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { buildViewScopeWorld, type ViewScopeWorld } from "./fixtures/view-scope";

// 06.2-05(SC-5 · D-6209~D-6213 · D-6222 · D-6223): 참여자 더하기 · 떼기 · 되돌리기 · 후보 · 목록.
// 세계는 06.2-03 view-scope에 경영관리본부의 다른 팀(재무팀) · 그 팀 사람 Y · 경영관리팀 팀장을 더한다(공용 세계 파일은 고치지 않는다).

// 액션도 같은 파일에서 부른다 — 세션만 가짜로 둔다(purchase-requests.test.ts 꼴).
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

type MembersWorld = ViewScopeWorld & { finance: string; Y: Viewer; mgmtLead: Viewer };

async function buildMembersWorld(): Promise<MembersWorld> {
  const world = await buildViewScopeWorld();
  const finance = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("경영관리본부"), name: "재무팀" })).id;
  const Y = await makePerson("와이", DEFAULT_ROLE_ID, "재무팀");
  const mgmtLead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
  return { ...world, finance, Y, mgmtLead };
}

async function memberLogs(projectId: string): Promise<Array<{ actorId: string | null; detail: unknown }>> {
  return db
    .select({ actorId: actionLog.actorId, detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "project_member_change"), eq(actionLog.entityId, projectId)));
}

async function listedIds(viewer: Viewer): Promise<string[]> {
  return (await loadProjectList(viewer, {})).rows.map((row) => row.id);
}

describe("더하기 트레이서", () => {
  it("경영관리팀 팀장이 재무팀 Y를 P3 참여자로 더하면 같은 트랜잭션에 project_member_change 한 줄(added: [Y])", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).resolves.toEqual({ added: 1 });
    expect(await memberLogs(P3)).toEqual([{ actorId: w.mgmtLead.id, detail: { projectId: P3, added: [w.Y.id] } }]);
  });

  it("더한 직후 Y(team 범위)의 프로젝트 목록에 P3가 있다 — 더하기 전에는 없다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await listedIds(w.Y)).not.toContain(P3);
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    expect(await listedIds(w.Y)).toContain(P3);
  });

  it("액션으로 해도 같다 — projects.member 쓰기로 등록돼 있다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    session.viewer = w.mgmtLead;
    const outcome = await addProjectMembersAction({ projectId: P3, userIds: [w.Y.id] });
    expect(outcome?.serverError).toBeUndefined();
    expect(outcome?.data).toEqual({ added: 1 });
    expect(await listedIds(w.Y)).toContain(P3);
    expect(ACTION_REGISTRY.find((entry) => entry.name === "addProjectMembersAction")).toEqual({
      name: "addProjectMembersAction",
      menu: "projects.member",
      action: "write",
      dtoName: null,
    });
  });
});
