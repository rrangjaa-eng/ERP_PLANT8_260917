import type { Viewer } from "@/domain/viewer";
import type { ProjectStatus } from "@/domain/projects/status-transitions";

// 04-20 RED 뼈대 — 서명만 있고 아직 전환하지 않는다(GREEN 커밋이 채운다).
export async function changeProjectStatus(
  viewer: Viewer,
  projectId: string,
  input: { from: ProjectStatus; to: ProjectStatus },
): Promise<void> {
  void viewer;
  void projectId;
  void input;
  throw new Error("changeProjectStatus: 아직 구현되지 않음");
}
