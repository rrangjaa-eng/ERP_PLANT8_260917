import { findApprovalGraphByDocument } from "@/repositories/approvals";
import type { Viewer } from "@/domain/viewer";

// 결재란 기안 칸 시각의 한 출처 — 서류 행의 제출 · 작성 시각은 다시 제출해도 첫 값이라 쓰지 않는다. 투영은 하지 않는다: 부르는 쪽이 그 서류의 원래 시각 칸 정보 항목으로 가린다.
export type CurrentApprovalRound = { submittedAt: Date; drafterTeamId: string | null; drafterOrgUnitId: string | null };

export async function currentApprovalRound(viewer: Viewer, input: { kind: string; documentId: string }): Promise<CurrentApprovalRound | null> {
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: input.kind, documentId: input.documentId });
  if (!graph) return null;
  // 고르기는 domain/approvals/index.ts currentRouteOf와 같은 한 줄이다(그 함수는 export되지 않는다).
  const route = graph.routes.find((candidate) => candidate.round === graph.instance.currentRound);
  if (!route) return null;
  return { submittedAt: route.submittedAt, drafterTeamId: route.drafterTeamId, drafterOrgUnitId: route.drafterOrgUnitId };
}
