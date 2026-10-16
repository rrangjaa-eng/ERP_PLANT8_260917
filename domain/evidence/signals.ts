import type { Viewer } from "@/domain/viewer";
import { countLiveLinksByOwners } from "@/repositories/evidence-record-links";
import { findUnresolvedVoidOwnerIds } from "@/repositories/files";

// 05-09(G1): 무효 뒤 기안자 신호의 원천 — 받은 주인 id 가운데 무효 처리 뒤 아직 새 증빙이 없는 것. 보임 판정은 부르는 쪽(목록)이 이미 했다.
// 06.1-12: 살아 있는 증빙 붙임도 새 증빙이다 — 붙임이 있는 주인은 뺀다(붙임 세 종류가 아닌 주인 종류는 리포지토리가 읽지 않고 빈 결과).
export async function listEvidenceVoidSignals(viewer: Viewer, input: { ownerKind: string; ownerIds: readonly string[] }): Promise<string[]> {
  if (input.ownerIds.length === 0) return [];
  const voided = await findUnresolvedVoidOwnerIds(viewer, input);
  if (voided.length === 0) return voided;
  const linked = new Set((await countLiveLinksByOwners(viewer, { ownerKind: input.ownerKind, ownerIds: voided })).map((row) => row.ownerId));
  return voided.filter((ownerId) => !linked.has(ownerId));
}
