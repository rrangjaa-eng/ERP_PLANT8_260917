import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { countActiveByOwner, listAliveByOwners } from "@/repositories/files";

// 06-03(C5): 증빙 유무 한 함수 — 살아 있는 파일(지우지 않음 · 무효 아님, 05 repositories/files.ts `alive()`)이 1개 이상인가.
// 06-04 · 06-06 · 06-10 · 06-11 · 06-15 · 06-19 · 06-20 · 06-23은 파일 수를 직접 세지 않고 이것을 부른다.
// 트랜잭션 콜백 안에서는 늘 그 tx를 넘긴다 — 생략하면 리포지토리 기본값이 전역 풀을 읽는다(RS-13 · PR #75 꼴).
// 잎 모듈: domain/evidence/index.ts를 import하지 않는다(순환 방지). 6.1-12가 이 함수에 증빙 기록 붙임을 더한다(K-1).
export async function hasEvidence(viewer: Viewer, owner: { ownerKind: string; ownerId: string }, tx?: DbOrTx): Promise<boolean> {
  return (await countActiveByOwner(viewer, owner.ownerKind, owner.ownerId, tx)) > 0;
}

// 목록 · 집계용 묶음 판정 — 살아 있는 파일이 있는 주인 id 집합. 트랜잭션 콜백 안에서는 그 tx를 넘긴다(위와 같다).
export async function ownersWithEvidence(viewer: Viewer, input: { ownerKind: string; ownerIds: readonly string[] }, tx?: DbOrTx): Promise<Set<string>> {
  const rows = await listAliveByOwners(viewer, input, tx);
  return new Set(rows.map((row) => row.ownerId));
}
