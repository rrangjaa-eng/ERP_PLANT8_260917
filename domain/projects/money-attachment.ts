import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { countProjectMoneyAttachments, type ProjectMoneyCounts } from "@/repositories/projects";

// 07.2-17(D-7211 사용자 확정 카드 3) — 프로젝트에 연결된 돈 문서 판정 하나. PU1(삭제 · 되살리기)과 PU5(고객사 · 담당 팀 잠김)가 같이 쓴다.
// 260907 `O: server/src/projects.ts:3451-3480`(attachedWhy)와 같은 방향 — 다름: 7종으로 넓히고 견적은 막지 않는다(D-7212 · 함께 보관).
// 권리 · 범위 판정은 호출자가 먼저 한다(이 함수는 수만 센다). 잠근 트랜잭션 안에서 부르면 tx를 넘긴다.

export type MoneyAttachments = { total: number; byKind: ProjectMoneyCounts };

export async function countMoneyAttachments(viewer: Viewer, projectId: string, tx?: DbOrTx): Promise<MoneyAttachments> {
  const byKind = await countProjectMoneyAttachments(viewer, projectId, tx);
  const total = Object.values(byKind).reduce((sum, count) => sum + count, 0);
  return { total, byKind };
}

export function moneyBlockedReason(total: number): string {
  return `돈 문서 ${total}건 연결 · 삭제 불가`;
}

// 플래너 가정(D-7210 「되살리기도 돈 문서 0건일 때만」) — 보관함 ` · 복원 불가` 끝맺음 선례(domain/archive). 보관 프로젝트 쓰기 거부 때문에
// 정상 흐름에서는 생기지 않는 방어 판정이다.
export function moneyLockedRestoreReason(total: number): string {
  return `돈 문서 ${total}건 연결 · 복원 불가`;
}
