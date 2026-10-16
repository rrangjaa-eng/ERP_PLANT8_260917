import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { countLiveLinksByOwners } from "@/repositories/evidence-record-links";
import { countActiveByOwner, listAliveByOwners } from "@/repositories/files";

// 06-03(C5): 증빙 유무 한 함수 — 살아 있는 파일(지우지 않음 · 무효 아님, 05 repositories/files.ts `alive()`)이 1개 이상인가.
// 06-04 · 06-06 · 06-10 · 06-11 · 06-15 · 06-19 · 06-20 · 06-23은 파일 수를 직접 세지 않고 이것을 부른다.
// 트랜잭션 콜백 안에서는 늘 그 tx를 넘긴다 — 생략하면 리포지토리 기본값이 전역 풀을 읽는다(RS-13 · PR #75 꼴).
// 잎 모듈: domain/evidence/index.ts를 import하지 않는다(순환 방지). 06.1-12: 살아 있는 05 파일 OR 살아 있는 증빙 붙임(K-1 · RP-4).
export async function hasEvidence(viewer: Viewer, owner: { ownerKind: string; ownerId: string }, tx?: DbOrTx): Promise<boolean> {
  if ((await countActiveByOwner(viewer, owner.ownerKind, owner.ownerId, tx)) > 0) return true;
  const [links] = await countLiveLinksByOwners(viewer, { ownerKind: owner.ownerKind, ownerIds: [owner.ownerId] }, tx);
  return (links?.linkCount ?? 0) > 0;
}

// 주인 하나의 증빙 원천 — 06.1-10 「파일만 있음」 · 06.1-12 자동 확인 조건이 읽는다. 건수와 기록 공급가 합이지 문서 금액이 아니다(D-6520).
export type EvidenceSources = {
  fileCount: number;
  linkCount: number;
  authorLinkCount: number;
  recordSupplyKrw: number;
  lastAttachedAt: Date | null;
};

// 목록 · 집계용 묶음 판정 — 파일 읽기 한 번 + 붙임 읽기 한 번(같은 tx). 파일 0 · 붙임 0인 주인은 맵에 넣지 않는다(has(id) = 증빙 있음).
export async function evidenceSourcesOf(
  viewer: Viewer,
  input: { ownerKind: string; ownerIds: readonly string[] },
  tx?: DbOrTx,
): Promise<Map<string, EvidenceSources>> {
  const fileRows = await listAliveByOwners(viewer, input, tx);
  const linkRows = await countLiveLinksByOwners(viewer, input, tx);
  const sources = new Map<string, EvidenceSources>();
  const empty = (): EvidenceSources => ({ fileCount: 0, linkCount: 0, authorLinkCount: 0, recordSupplyKrw: 0, lastAttachedAt: null });
  for (const row of fileRows) {
    const current = sources.get(row.ownerId) ?? empty();
    sources.set(row.ownerId, { ...current, fileCount: current.fileCount + 1 });
  }
  for (const row of linkRows) {
    const current = sources.get(row.ownerId) ?? empty();
    sources.set(row.ownerId, {
      ...current,
      linkCount: row.linkCount,
      authorLinkCount: row.authorLinkCount,
      recordSupplyKrw: row.recordSupplyKrw,
      lastAttachedAt: row.lastAttachedAt,
    });
  }
  return sources;
}

// 목록 · 집계용 묶음 판정 — 증빙(파일 또는 붙임)이 있는 주인 id 집합. 트랜잭션 콜백 안에서는 그 tx를 넘긴다(위와 같다).
export async function ownersWithEvidence(viewer: Viewer, input: { ownerKind: string; ownerIds: readonly string[] }, tx?: DbOrTx): Promise<Set<string>> {
  return new Set((await evidenceSourcesOf(viewer, input, tx)).keys());
}
