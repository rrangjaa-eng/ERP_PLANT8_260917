import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { projectMembers } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.2-05(D-6209): 프로젝트 참여자 줄 — 붙이기는 되살림-또는-삽입, 떼기는 archived_at(A9).
// 줄을 지우는 함수는 두지 않는다(06.2-04 구조 테스트 ⓔ) — 뗀 기록은 project_member_change 행동 로그가 남긴다.
// 같은 (프로젝트, 사람)에 살아 있는 줄은 하나 — 경쟁은 부분 유니크 project_members_live_uniq가 막는다.

export async function findLiveMemberUserIds(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  const rows = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), isNull(projectMembers.archivedAt)));
  return new Set(rows.map((row) => row.userId));
}

// 사람마다 가장 최근 보관 줄을 되살리고(created_at 그대로 — 「되돌리면 같은 자리」) 보관 줄이 없는 사람만 새로 넣는다
// (260907 `O: server/src/projects.ts:3994-4007` UPDATE 뒤 INSERT와 같은 순서). 되살리거나 넣은 줄 수를 돌려준다.
export async function reviveOrInsertMembers(
  viewer: Viewer,
  input: { projectId: string; userIds: string[]; addedBy: string },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  if (input.userIds.length === 0) return 0;
  // 하위 질의는 문장 안에 박혀 tx로 돈다(listOrgSnapshot 꼴 — 트랜잭션 객체에는 selectDistinctOn이 없다).
  const latestArchived = db
    .selectDistinctOn([projectMembers.userId], { id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, input.projectId),
        inArray(projectMembers.userId, input.userIds),
        isNotNull(projectMembers.archivedAt),
      ),
    )
    .orderBy(projectMembers.userId, desc(projectMembers.archivedAt), desc(projectMembers.createdAt));
  const revived = await tx
    .update(projectMembers)
    .set({ archivedAt: null, addedBy: input.addedBy })
    .where(inArray(projectMembers.id, latestArchived))
    .returning({ userId: projectMembers.userId });
  const revivedIds = new Set(revived.map((row) => row.userId));
  const fresh = input.userIds.filter((userId) => !revivedIds.has(userId));
  if (fresh.length > 0) {
    await tx.insert(projectMembers).values(fresh.map((userId) => ({ projectId: input.projectId, userId, addedBy: input.addedBy })));
  }
  return revived.length + fresh.length;
}
