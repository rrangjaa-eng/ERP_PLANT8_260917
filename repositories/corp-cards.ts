import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type CorpCardRow = InferSelectModel<typeof corpCards>;

export async function listCorpCards(
  viewer: Viewer,
  opts: { scope: Scope; includeInactive: boolean },
): Promise<CorpCardRow[]> {
  if (opts.scope.rows === "none") return [];

  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(corpCards.archivedAt));
  if (!opts.includeInactive) conditions.push(eq(corpCards.active, true));

  return db
    .select()
    .from(corpCards)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(corpCards.issuer, corpCards.numberLast4);
}

export async function findCorpCardById(viewer: Viewer, id: string): Promise<CorpCardRow | null> {
  const [row] = await db.select().from(corpCards).where(eq(corpCards.id, id)).limit(1);
  return row ?? null;
}

export async function insertCorpCard(
  viewer: Viewer,
  input: {
    issuer: string;
    numberLast4: string;
    label: string;
    kind: string;
    holderUserId?: string | null;
    teamId?: string | null;
  },
): Promise<CorpCardRow> {
  const [row] = await db
    .insert(corpCards)
    .values({
      issuer: input.issuer,
      numberLast4: input.numberLast4,
      label: input.label,
      kind: input.kind,
      holderUserId: input.holderUserId ?? null,
      teamId: input.teamId ?? null,
    })
    .returning();
  if (!row) throw new Error("corp_cards insert가 행을 반환하지 않았습니다.");
  return row;
}

// 소유자 변경은 반대 칸을 같은 UPDATE 문에서 함께 비운다 — 두 번의 쓰기로
// 나누면 사이에 소지자·팀이 동시에 채워진 순간이 생긴다(T-03-33).
export async function updateCorpCardOwner(
  viewer: Viewer,
  id: string,
  owner: { holderUserId: string | null; teamId: string | null },
): Promise<void> {
  await db
    .update(corpCards)
    .set({ holderUserId: owner.holderUserId, teamId: owner.teamId, updatedAt: new Date() })
    .where(eq(corpCards.id, id));
}

export async function setCorpCardActive(viewer: Viewer, id: string, active: boolean): Promise<void> {
  await db.update(corpCards).set({ active, updatedAt: new Date() }).where(eq(corpCards.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setCorpCardArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(corpCards)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(corpCards.id, id), isNull(corpCards.archivedAt)));
  } else {
    await db
      .update(corpCards)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(corpCards.id, id), isNotNull(corpCards.archivedAt)));
  }
}
