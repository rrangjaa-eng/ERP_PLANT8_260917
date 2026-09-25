import type { Viewer } from "@/domain/viewer";
import { teamLeadCandidatesAtDate } from "@/repositories/team-memberships";

export type ProjectResponsiblesDeps = {
  now: () => Date;
  teamLeadCandidatesAtDate: typeof teamLeadCandidatesAtDate;
  findPmName: (viewer: Viewer, userId: string) => Promise<string | null>;
};

export async function projectResponsibles(
  viewer: Viewer,
  project: { teamId: string; pmUserId: string },
  deps?: Partial<ProjectResponsiblesDeps>,
): Promise<{ pmName: string | null; teamLeadName: string | null }> {
  void viewer;
  void project;
  void deps;
  return { pmName: null, teamLeadName: null };
}
