import type { Viewer } from "@/domain/viewer";
import { kstToday } from "@/lib/kst-date";
import { teamLeadCandidatesAtDate } from "@/repositories/team-memberships";
import { findUserById } from "@/repositories/users";

// 04-11(SYSTEM.md 개정 ⑪ 담당자 표기 · 사용자 D20) — 다음 한 수가 그 사람의 권한 밖일 때 적는
// 담당자 이름의 출처. 팀장 = 프로젝트 팀에 오늘(KST) 발령된 사람 중 업무 범위 team + projects.status
// 쓰기 계급의 이름순 첫 사람(후보는 리포지토리 쿼리 한 번). 04-22 기간 거부 문구 · 04-30 EMPTY가 같은
// 함수를 쓴다.
export type ProjectResponsiblesDeps = {
  now: () => Date;
  teamLeadCandidatesAtDate: typeof teamLeadCandidatesAtDate;
  findPmName: (viewer: Viewer, userId: string) => Promise<string | null>;
};

async function defaultFindPmName(viewer: Viewer, userId: string): Promise<string | null> {
  return (await findUserById(viewer, userId))?.name ?? null;
}

export async function projectResponsibles(
  viewer: Viewer,
  project: { teamId: string; pmUserId: string },
  deps?: Partial<ProjectResponsiblesDeps>,
): Promise<{ pmName: string | null; teamLeadName: string | null }> {
  const now = deps?.now ?? (() => new Date());
  const findCandidates = deps?.teamLeadCandidatesAtDate ?? teamLeadCandidatesAtDate;
  const findPmName = deps?.findPmName ?? defaultFindPmName;

  const [candidates, pmName] = await Promise.all([
    findCandidates(viewer, { teamId: project.teamId, date: kstToday(now()) }),
    findPmName(viewer, project.pmUserId),
  ]);
  // 이름순 — DB 정렬 규칙(CI en_US.utf8 · 로컬 C.UTF-8)에 기대지 않는다.
  const [first] = [...candidates].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { pmName, teamLeadName: first?.name ?? null };
}
