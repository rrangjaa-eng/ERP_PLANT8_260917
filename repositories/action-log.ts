import { and, desc, eq, gte, isNull, lte, ne } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type ActionLogRow = InferSelectModel<typeof actionLog>;

export type ActionLogFilterInput = {
  actorId?: string;
  actionType?: string;
  documentId?: string;
  from?: Date;
  to?: Date;
  includePruned?: boolean;
};

// append-only — 이 함수 외에 action_log를 겨냥한 INSERT는 이 리포에 없다. UPDATE/
// DELETE 문은 존재하지 않는다(ADMN-12·OPS-05).
export async function appendActionLog(
  viewer: Viewer,
  entry: {
    actorId: string | null;
    actorRoleId: string | null;
    actionType: string;
    entity: string | null;
    entityId: string | null;
    documentId: string | null;
    detail: Record<string, unknown>;
  },
): Promise<ActionLogRow> {
  void viewer;
  const [row] = await db.insert(actionLog).values(entry).returning();
  if (!row) throw new Error("action_log insert가 행을 반환하지 않았습니다.");
  return row;
}

// occurredAt 다음 seq(단조 증가) 두 키 정렬 — 같은 시각 행들이 삽입 순서를
// 잃지 않는다.
export async function queryActionLog(
  viewer: Viewer,
  filter?: { actorId?: string; actionType?: string; documentId?: string; from?: Date; to?: Date },
): Promise<ActionLogRow[]> {
  void viewer;
  const conditions = [];
  if (filter?.actorId) conditions.push(eq(actionLog.actorId, filter.actorId));
  if (filter?.actionType) conditions.push(eq(actionLog.actionType, filter.actionType));
  if (filter?.documentId) conditions.push(eq(actionLog.documentId, filter.documentId));
  if (filter?.from) conditions.push(gte(actionLog.occurredAt, filter.from));
  if (filter?.to) conditions.push(lte(actionLog.occurredAt, filter.to));

  return db
    .select()
    .from(actionLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(actionLog.occurredAt, actionLog.seq);
}

// 03-07: 행동 로그 화면·내보내기가 쓰는 네 축(사람·기간·행동 종류·문서) +
// 정리 포함 여부 필터. 기본은 정리되지 않은 행만(prunedAt IS NULL). 정렬은
// 발생 시각 내림차순(최신 순), 같으면 seq(단조 증가 기본키) 내림차순 — 두
// 키를 항상 함께 써서 두 번 조회해도 순서가 같다.
export async function filterActionLog(viewer: Viewer, filter: ActionLogFilterInput): Promise<ActionLogRow[]> {
  void viewer;
  const conditions = [];
  if (filter.actorId) conditions.push(eq(actionLog.actorId, filter.actorId));
  if (filter.actionType) conditions.push(eq(actionLog.actionType, filter.actionType));
  if (filter.documentId) conditions.push(eq(actionLog.documentId, filter.documentId));
  if (filter.from) conditions.push(gte(actionLog.occurredAt, filter.from));
  if (filter.to) conditions.push(lte(actionLog.occurredAt, filter.to));
  if (!filter.includePruned) conditions.push(isNull(actionLog.prunedAt));

  return db
    .select()
    .from(actionLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(actionLog.occurredAt), desc(actionLog.seq));
}

// 정리 표시 — 대상 행에 prunedAt/prunedBy를 남기고 물리적으로 삭제하지
// 않는다. 이미 정리된 행(prunedAt IS NOT NULL)과 정리 종류 자체의 행
// (action_log_prune)은 항상 제외한다 — 정리로 추가된 행이 다음 정리의
// 대상이 되면 두 번의 정리로 정리 흔적이 사라진다(03-RESEARCH.md가
// 태스크화하라고 지목한 재귀적 요구). 반환값은 정리된 행 수.
export async function pruneActionLogRows(
  viewer: Viewer,
  filter: Omit<ActionLogFilterInput, "includePruned">,
): Promise<number> {
  const conditions = [isNull(actionLog.prunedAt), ne(actionLog.actionType, "action_log_prune")];
  if (filter.actorId) conditions.push(eq(actionLog.actorId, filter.actorId));
  if (filter.actionType) conditions.push(eq(actionLog.actionType, filter.actionType));
  if (filter.documentId) conditions.push(eq(actionLog.documentId, filter.documentId));
  if (filter.from) conditions.push(gte(actionLog.occurredAt, filter.from));
  if (filter.to) conditions.push(lte(actionLog.occurredAt, filter.to));

  const updated = await db
    .update(actionLog)
    .set({ prunedAt: new Date(), prunedBy: viewer.id })
    .where(and(...conditions))
    .returning({ seq: actionLog.seq });
  return updated.length;
}
