import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type FieldDefinitionRow = InferSelectModel<typeof fieldDefinitions>;

export type { DbOrTx };

// 04.5-01(T-04.5-07): 칸 생성과 계급 생성 쪽 노출 행 부여(03 grantCustomFieldsToRole)가 같은
// 잠금 하나로 직렬화된다 — notify tick(420_401) · 공휴일 달력(420_601)과 다른 값.
const CUSTOM_FIELD_GRANTS_LOCK_KEY = 420_701;

export async function listFieldDefinitions(
  viewer: Viewer,
  entity: string,
  tx: DbOrTx = db,
): Promise<FieldDefinitionRow[]> {
  return tx
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.entity, entity))
    .orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key);
}

export async function findFieldDefinitionById(viewer: Viewer, id: string): Promise<FieldDefinitionRow | null> {
  const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
  return row ?? null;
}

export async function insertFieldDefinition(
  viewer: Viewer,
  input: {
    id: string;
    entity: string;
    key: string;
    // 없으면 key — 화면 이름 없이 부르는 기존 호출(테스트 픽스처)이 그대로 돈다.
    label?: string;
    type: string;
    options?: unknown;
    required?: boolean;
    sortOrder?: number;
  },
  tx: DbOrTx = db,
): Promise<FieldDefinitionRow> {
  const [row] = await tx
    .insert(fieldDefinitions)
    .values({
      id: input.id,
      entity: input.entity,
      key: input.key,
      label: input.label ?? input.key,
      type: input.type,
      options: input.options ?? null,
      required: input.required ?? false,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  if (!row) throw new Error("field_definitions insert가 행을 반환하지 않았습니다.");
  return row;
}

// ROADMAP: 필드 타입 변경은 금지한다 — 이 함수는 type 컬럼을 대상으로 받지
// 않는다. 타입을 바꾸려면 새 필드를 만든다.
export async function updateFieldDefinition(
  viewer: Viewer,
  id: string,
  input: { options?: unknown; required?: boolean; sortOrder?: number },
): Promise<void> {
  await db
    .update(fieldDefinitions)
    .set({
      options: input.options,
      required: input.required,
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(fieldDefinitions.id, id));
}

// 04.5-02(O20): 버전 조건부 갱신 — 읽은 행의 version이 그대로이고 보관되지 않았을 때만 한 문장으로 쓰고
// version을 1 올린다. 바뀐 행이 있었는지를 돌려준다(false면 호출자가 다시 읽어 보관 · 충돌을 가른다).
// type은 받지 않는다(타입 불변). options · archivedOptions는 undefined면 건드리지 않는다.
export async function updateFieldDefinitionIfVersion(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  patch: { label: string; required: boolean; sortOrder: number; options?: string[]; archivedOptions?: string[] },
  tx: DbOrTx = db,
): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(fieldDefinitions)
    .set({
      label: patch.label,
      required: patch.required,
      sortOrder: patch.sortOrder,
      options: patch.options,
      archivedOptions: patch.archivedOptions,
      version: sql`${fieldDefinitions.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(fieldDefinitions.id, id), eq(fieldDefinitions.version, expectedVersion), isNull(fieldDefinitions.archivedAt)),
    )
    .returning({ id: fieldDefinitions.id });
  return rows.length > 0;
}

// 04.5-04(D10-12): 칸 삭제 = 보관. 상태가 실제로 바뀔 때만 쓰는 조건부 UPDATE(setVendorArchived와 같은 모양)이고
// 같은 문장에서 version을 1 올려 그 전에 열린 수정 폼을 무효로 만든다 — 멱등 보관 · 복원은 버전을 올리지 않는다.
// 거래처 값(JSONB) · 노출 행 · 선택지는 건드리지 않는다. 바뀐 행이 있었는지를 돌려준다.
export async function setFieldDefinitionArchived(viewer: Viewer, id: string, value: boolean): Promise<boolean> {
  const bump = { version: sql`${fieldDefinitions.version} + 1`, updatedAt: sql`now()` };
  const rows = value
    ? await db
        .update(fieldDefinitions)
        .set({ archivedAt: new Date(), archivedBy: viewer.id, ...bump })
        .where(and(eq(fieldDefinitions.id, id), isNull(fieldDefinitions.archivedAt)))
        .returning({ id: fieldDefinitions.id })
    : await db
        .update(fieldDefinitions)
        .set({ archivedAt: null, archivedBy: null, ...bump })
        .where(and(eq(fieldDefinitions.id, id), isNotNull(fieldDefinitions.archivedAt)))
        .returning({ id: fieldDefinitions.id });
  return rows.length > 0;
}

// 04.5-04: 보관함 목록용 — 주어진 대상(entity) 안의 보관된 정의만.
export async function listArchivedFieldDefinitions(
  viewer: Viewer,
  entities: readonly string[],
): Promise<Array<{ id: string; label: string; archivedAt: Date; archivedBy: string | null }>> {
  void viewer;
  const rows = await db
    .select({ id: fieldDefinitions.id, label: fieldDefinitions.label, archivedAt: fieldDefinitions.archivedAt, archivedBy: fieldDefinitions.archivedBy })
    .from(fieldDefinitions)
    .where(and(inArray(fieldDefinitions.entity, [...entities]), isNotNull(fieldDefinitions.archivedAt)));
  return rows.map((row) => ({ ...row, archivedAt: row.archivedAt as Date }));
}

// 트랜잭션 잠금(커밋·롤백 때 저절로 풀림) — 칸 생성과 계급 생성 쪽 노출 행 부여가 이 함수
// 하나로 잠근 뒤 상대 표(계급 목록 · 칸 정의)를 같은 tx로 읽는다. 어느 순서로 겹쳐도
// (계급, 칸) 쌍마다 노출 행이 생긴다. 트랜잭션 밖에서는 의미가 없어 tx에 기본값이 없다.
export async function lockCustomFieldGrants(viewer: Viewer, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock(${CUSTOM_FIELD_GRANTS_LOCK_KEY})`);
}
