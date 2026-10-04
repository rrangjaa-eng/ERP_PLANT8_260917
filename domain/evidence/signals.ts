import type { Viewer } from "@/domain/viewer";
import { findUnresolvedVoidOwnerIds } from "@/repositories/files";

// 05-09(G1): 무효 뒤 기안자 신호의 원천 — 받은 주인 id 가운데 무효 처리 뒤 아직 새 증빙이 없는 것. 보임 판정은 부르는 쪽(목록)이 이미 했다.
export async function listEvidenceVoidSignals(viewer: Viewer, input: { ownerKind: string; ownerIds: readonly string[] }): Promise<string[]> {
  if (input.ownerIds.length === 0) return [];
  return findUnresolvedVoidOwnerIds(viewer, input);
}
