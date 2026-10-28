import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
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

export async function findCorpCardById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<CorpCardRow | null> {
  const [row] = await tx.select().from(corpCards).where(eq(corpCards.id, id)).limit(1);
  return row ?? null;
}

export type CorpCardCandidateRow = Pick<CorpCardRow, "id" | "issuer" | "numberLast4" | "active" | "teamId" | "holderUserId">;

// 06.1-04: 등록 서비스 전용 — 카드는 파일이 정한다(CONTEXT 「이미 확정」 8번), 등록자의 관리 메뉴 권한과 무관하다.
// 범위 판정 없이 끝 4자리로만 찾는 좁은 조회. 보관 카드는 빼고(B-F15) 비활성 카드는 담는다(사용일이 비활성화 전일 수 있다).
export async function findCardsByLast4(viewer: Viewer, last4s: readonly string[], tx: DbOrTx = db): Promise<CorpCardCandidateRow[]> {
  if (last4s.length === 0) return [];
  return tx
    .select({
      id: corpCards.id,
      issuer: corpCards.issuer,
      numberLast4: corpCards.numberLast4,
      active: corpCards.active,
      teamId: corpCards.teamId,
      holderUserId: corpCards.holderUserId,
    })
    .from(corpCards)
    .where(and(inArray(corpCards.numberLast4, [...last4s]), isNull(corpCards.archivedAt)));
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
  tx: DbOrTx = db,
): Promise<CorpCardRow> {
  const [row] = await tx
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
  owner: { kind: CorpCardRow["kind"]; holderUserId: string | null; teamId: string | null },
): Promise<void> {
  await db
    .update(corpCards)
    .set({
      kind: owner.kind,
      holderUserId: owner.holderUserId,
      teamId: owner.teamId,
      updatedAt: new Date(),
    })
    .where(eq(corpCards.id, id));
}

// 07.1-12(E-P2-37): tx를 주면 그 트랜잭션 안에서 — 카드 켜기 · 복원이 다시 잇기와 한 tx로 되거나 함께 안 된다(기본은 db).
// 보관된 카드는 건드리지 않는다(#318 P3 — 읽은 뒤 보관된 경합 포함). 실제로 바꾼 행이 있으면 참.
export async function setCorpCardActive(viewer: Viewer, id: string, active: boolean, tx: DbOrTx = db): Promise<boolean> {
  const rows = await tx
    .update(corpCards)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(corpCards.id, id), isNull(corpCards.archivedAt)))
    .returning({ id: corpCards.id });
  return rows.length > 0;
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setCorpCardArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx = db): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await tx
        .update(corpCards)
        .set({ archivedAt: new Date(), archivedBy: viewer.id })
        .where(and(eq(corpCards.id, id), isNull(corpCards.archivedAt)))
        .returning({ id: corpCards.id })
    : await tx
        .update(corpCards)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(corpCards.id, id), isNotNull(corpCards.archivedAt)))
        .returning({ id: corpCards.id });
  return rows.length > 0;
}
