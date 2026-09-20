import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type FieldDefinitionRow = InferSelectModel<typeof fieldDefinitions>;

export async function listFieldDefinitions(viewer: Viewer, entity: string): Promise<FieldDefinitionRow[]> {
  return db
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
    type: string;
    options?: unknown;
    required?: boolean;
    sortOrder?: number;
  },
): Promise<FieldDefinitionRow> {
  const [row] = await db
    .insert(fieldDefinitions)
    .values({
      id: input.id,
      entity: input.entity,
      key: input.key,
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
