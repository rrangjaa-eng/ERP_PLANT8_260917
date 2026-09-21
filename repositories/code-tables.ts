import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type CodeItemRow = InferSelectModel<typeof codeItems>;

// scope.rows가 "none"이면 쿼리 자체를 생략한다(보기 권한이 없는 viewer). 정렬은
// sortOrder 다음 value 두 키 — 같은 정렬 값의 목록 순서가 결정적이다.
export async function listCodeItems(
  viewer: Viewer,
  opts: { tableKey: string; scope: Scope; includeInactive: boolean },
): Promise<CodeItemRow[]> {
  void viewer;
  if (opts.scope.rows === "none") return [];

  const conditions = [eq(codeItems.tableKey, opts.tableKey)];
  if (!opts.scope.includeArchived) conditions.push(isNull(codeItems.archivedAt));
  if (!opts.includeInactive) conditions.push(eq(codeItems.active, true));

  return db
    .select()
    .from(codeItems)
    .where(and(...conditions))
    .orderBy(codeItems.sortOrder, codeItems.value);
}

export async function insertCodeItem(
  viewer: Viewer,
  input: { tableKey: string; value: string; label: string; sortOrder?: number },
): Promise<CodeItemRow> {
  void viewer;
  const [row] = await db
    .insert(codeItems)
    .values({
      tableKey: input.tableKey,
      value: input.value,
      label: input.label,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  if (!row) throw new Error("code_items insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function setCodeItemActive(viewer: Viewer, id: string, active: boolean): Promise<void> {
  void viewer;
  await db.update(codeItems).set({ active, updatedAt: new Date() }).where(eq(codeItems.id, id));
}

// MAST-04 「수정」 — 이름(label)만 쓴다. value는 이 함수가 건드리지 않는다:
// vendors.default_evidence_type이 FK 없는 text 컬럼에 코드 항목의 value를
// 담고 있어(db/schema/vendors.ts:19), value가 바뀌면 기존 거래처가 조용히
// 고아가 된다(사용자 결정 2026-09-21).
export async function updateCodeItemLabel(viewer: Viewer, id: string, label: string): Promise<void> {
  void viewer;
  await db.update(codeItems).set({ label, updatedAt: new Date() }).where(eq(codeItems.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts
// setRoleArchived와 같은 패턴).
export async function setCodeItemArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(codeItems)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(codeItems.id, id), isNull(codeItems.archivedAt)));
  } else {
    await db
      .update(codeItems)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(codeItems.id, id), isNotNull(codeItems.archivedAt)));
  }
}

export async function findCodeItemById(viewer: Viewer, id: string): Promise<CodeItemRow | null> {
  void viewer;
  const [row] = await db.select().from(codeItems).where(eq(codeItems.id, id)).limit(1);
  return row ?? null;
}

// 03-06: 세금 규칙 컬럼 쓰기 — 증빙 종류(evidence_type) 항목에만 허용한다는
// 제약은 domain 계층(setEvidenceTypeTaxRule)이 대상 항목의 table_key를 먼저
// 확인해 지킨다. 이 함수 자체는 컬럼 쓰기만 한다.
export async function setCodeItemTaxRule(viewer: Viewer, id: string, taxRule: unknown): Promise<void> {
  void viewer;
  await db.update(codeItems).set({ taxRule, updatedAt: new Date() }).where(eq(codeItems.id, id));
}

// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing). taxRule은
// 증빙 종류 코드표 시드가 기본 세금 규칙을 함께 심을 때만 쓴다.
export async function seedCodeItem(
  viewer: Viewer,
  input: { tableKey: string; value: string; label: string; sortOrder: number; taxRule?: unknown },
): Promise<boolean> {
  void viewer;
  const inserted = await db
    .insert(codeItems)
    .values(input)
    .onConflictDoNothing({ target: [codeItems.tableKey, codeItems.value] })
    .returning({ id: codeItems.id });
  return inserted.length > 0;
}
