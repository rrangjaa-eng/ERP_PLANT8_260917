import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { setResignationDate } from "@/domain/people";
import { createProject } from "@/domain/projects";
import { addProjectMembers, listMemberCandidates } from "@/domain/projects/members";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { setUserArchived } from "@/repositories/users";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { makePerson, type Person } from "./leave-org";

// 06.2-12(S2 · S3 · S4) 참여자 E2E 세계 — 도메인 함수로만 만든다(SQL 직접 삽입 없음, expense-fixture.ts 꼴). 06.2-10도 읽는다.
// 새 본부 U · 담당 팀 T(기획 PM · 팀장) · 같은 본부 다른 팀 T2(참여자 Z · 퇴직 R · 보관 A · 후보 C1~C3). 이름은 실행마다 고유 접두 —
// 공유 E2E DB에서 다른 스펙 사람과 섞여도 검색으로 좁힐 수 있게 한다.

export type MembersE2E = {
  pm: Person;
  lead: Person;
  z: Person;
  r: Person;
  a: Person;
  candidates: [Person, Person, Person];
  /** 후보 이름 공통 접두 — 검색으로 C1~C3만 좁힌다(공유 E2E DB에는 다른 후보가 섞여 있다). */
  candidatePrefix: string;
  /** `projects` 보기를 끈 계급의 같은 본부 사람 — 붙여도 아무것도 못 보므로 후보에서 빠진다(eng N9). */
  c4: Person;
  projectId: string;
  projectName: string;
  /** 참여자가 한 명도 없는 같은 담당 팀 프로젝트(담당 PM 행만인 표). */
  emptyProjectId: string;
  emptyProjectName: string;
  teamId: string;
  otherTeamName: string;
};

function year(): string {
  return seoulToday().slice(0, 4);
}

async function makeClientId(label: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E참여자클라이언트-${label}-${suffix}`, normalizedName: `e2e참여자클라이언트-${label}-${suffix}` });
  return client.id;
}

export async function setupMembersE2E(): Promise<MembersE2E> {
  const today = seoulToday();
  const effectiveFrom = `${year()}-01-01`;
  const tag = randomUUID().slice(0, 6);
  const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E참여본부-${tag}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E참여팀-${tag}` });
  const otherTeamName = `E2E참여다른팀-${tag}`;
  const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: otherTeamName });

  const pm = await makePerson("기획PM", "role-pm", team.id, effectiveFrom);
  const lead = await makePerson("팀장", "role-team-lead", team.id, effectiveFrom);
  const z = await makePerson("참여자Z", "role-pm", otherTeam.id, effectiveFrom);
  const r = await makePerson("퇴직R", "role-pm", otherTeam.id, effectiveFrom);
  const a = await makePerson("보관A", "role-pm", otherTeam.id, effectiveFrom);
  const candidates: [Person, Person, Person] = [
    await makePerson(`후보${tag}C1`, "role-pm", otherTeam.id, effectiveFrom),
    await makePerson(`후보${tag}C2`, "role-pm", otherTeam.id, effectiveFrom),
    await makePerson(`후보${tag}C3`, "role-pm", otherTeam.id, effectiveFrom),
  ];

  const noViewRoleId = `role-e2e-no-projects-${tag}`;
  await insertRole(SYSTEM_VIEWER, { id: noViewRoleId, name: `E2E프로젝트메뉴없음-${tag}`, workScope: "team", viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: noViewRoleId, menu: "projects", action: "view", allowed: false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: noViewRoleId, infoItem: "project.value", visible: true });
  const c4 = await makePerson(`후보${tag}C4`, noViewRoleId, otherTeam.id, effectiveFrom);

  const projectName = `E2E참여자-${tag}`;
  const projectId = await makeProject(pm, team.id, projectName, tag);
  const emptyProjectName = `E2E참여자0-${tag}`;
  const emptyProject = await makeProject(pm, team.id, emptyProjectName, `${tag}-0`);

  // 붙인 시각이 갈려 정렬 단언(담당 PM → Z → R → A)이 선다 — 세 번 따로 더한다.
  await addProjectMembers(lead.viewer, projectId, [z.viewer.id]);
  await addProjectMembers(lead.viewer, projectId, [r.viewer.id]);
  await addProjectMembers(lead.viewer, projectId, [a.viewer.id]);
  // 퇴직자 · 보관된 사람은 후보가 아니므로 먼저 붙인 뒤에 퇴직 · 보관 처리한다.
  await setResignationDate(SYSTEM_VIEWER, r.viewer.id, addDays(today, -1));
  await setUserArchived(SYSTEM_VIEWER, a.viewer.id, true);

  return {
    pm,
    lead,
    z,
    r,
    a,
    candidates,
    candidatePrefix: `후보${tag}`,
    c4,
    projectId,
    projectName,
    emptyProjectId: emptyProject,
    emptyProjectName,
    teamId: team.id,
    otherTeamName,
  };
}

async function makeProject(pm: Person, teamId: string, name: string, label: string): Promise<string> {
  const project = await createProject(pm.viewer, {
    clientId: await makeClientId(label),
    teamId,
    pmUserId: pm.viewer.id,
    name,
    startDate: `${year()}-01-01`,
    endDate: `${year()}-12-31`,
  });
  if (!project.id) throw new Error("프로젝트 id가 없습니다");
  return project.id;
}

export type LastCandidateE2E = { lead: Person; l: Person; projectId: string; projectName: string };

// 후보가 L 한 명만 남은 프로젝트(R2-I5) — 공유 E2E DB의 본부 없는 대표 계급도 후보라, 팀장 viewer로 후보를 되풀이해 읽어 L이 아닌 사람을 50명씩 참여자로
// 붙인다(붙이면 후보에서 빠진다). 마지막 후보를 써 버리므로 테스트마다 새로 부른다. 끝에 후보가 L 하나 · truncated 거짓이 아니면 던진다 —
// 테스트가 조용히 약해지지 않게. 다른 스펙이 같은 시간에 본부 없는 대표 계급 사람을 만들면 이 상태가 깨질 수 있다.
export async function makeLastCandidateProject(): Promise<LastCandidateE2E> {
  const effectiveFrom = `${year()}-01-01`;
  const tag = randomUUID().slice(0, 6);
  const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E마지막본부-${tag}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E마지막팀-${tag}` });
  const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E마지막다른팀-${tag}` });
  const pm = await makePerson("기획PM", "role-pm", team.id, effectiveFrom);
  const lead = await makePerson("팀장", "role-team-lead", team.id, effectiveFrom);
  const l = await makePerson("마지막L", "role-pm", otherTeam.id, effectiveFrom);
  const projectName = `E2E마지막후보-${tag}`;
  const projectId = await makeProject(pm, team.id, projectName, tag);

  for (let round = 0; round < 40; round += 1) {
    const listed = await listMemberCandidates(lead.viewer, projectId, {});
    const others = listed.rows.flatMap((row) => (row.userId && row.userId !== l.viewer.id ? [row.userId] : []));
    if (others.length === 0) break;
    await addProjectMembers(lead.viewer, projectId, others.slice(0, 50));
  }
  const final = await listMemberCandidates(lead.viewer, projectId, {});
  if (final.rows.length !== 1 || final.rows[0]?.userId !== l.viewer.id || final.truncated) {
    throw new Error(`마지막 후보 프로젝트의 후보가 L 하나가 아님: ${final.rows.length}명 · truncated ${String(final.truncated)}`);
  }
  return { lead, l, projectId, projectName };
}
