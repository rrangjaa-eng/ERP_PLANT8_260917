import { and, eq, gte, lte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type ActionLogRow = InferSelectModel<typeof actionLog>;

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
