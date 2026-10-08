import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { setResignationDate } from "@/domain/people";
import { createProject } from "@/domain/projects";
import { addProjectMembers } from "@/domain/projects/members";
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
  projectId: string;
  projectName: string;
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
    await makePerson("후보C1", "role-pm", otherTeam.id, effectiveFrom),
    await makePerson("후보C2", "role-pm", otherTeam.id, effectiveFrom),
    await makePerson("후보C3", "role-pm", otherTeam.id, effectiveFrom),
  ];

  const projectName = `E2E참여자-${tag}`;
  const project = await createProject(pm.viewer, {
    clientId: await makeClientId(tag),
    teamId: team.id,
    pmUserId: pm.viewer.id,
    name: projectName,
    startDate: `${year()}-01-01`,
    endDate: `${year()}-12-31`,
  });
  if (!project.id) throw new Error("프로젝트 id가 없습니다");

  // 붙인 시각이 갈려 정렬 단언(담당 PM → Z → R → A)이 선다 — 세 번 따로 더한다.
  await addProjectMembers(lead.viewer, project.id, [z.viewer.id]);
  await addProjectMembers(lead.viewer, project.id, [r.viewer.id]);
  await addProjectMembers(lead.viewer, project.id, [a.viewer.id]);
  // 퇴직자 · 보관된 사람은 후보가 아니므로 먼저 붙인 뒤에 퇴직 · 보관 처리한다.
  await setResignationDate(SYSTEM_VIEWER, r.viewer.id, addDays(today, -1));
  await setUserArchived(SYSTEM_VIEWER, a.viewer.id, true);

  return { pm, lead, z, r, a, candidates, projectId: project.id, projectName, teamId: team.id, otherTeamName };
}
