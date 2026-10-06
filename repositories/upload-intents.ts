import { and, eq, gt, isNull } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { uploadIntents } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 05-04(EVID-01): 업로드 의도. 완료 통보는 만든 사람 · 미완료 · 미만료일 때 한 번만 이긴다.

export type UploadIntentRow = InferSelectModel<typeof uploadIntents>;
export type UploadIntentInsert = Omit<InferInsertModel<typeof uploadIntents>, "completedAt" | "createdAt">;

export async function insertIntent(viewer: Viewer, values: UploadIntentInsert, tx: DbOrTx = db): Promise<UploadIntentRow> {
  void viewer;
  const [row] = await tx.insert(uploadIntents).values(values).returning();
  if (!row) throw new Error("upload_intents insert returned no row");
  return row;
}

export async function findIntentById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<UploadIntentRow | null> {
  void viewer;
  const [row] = await tx.select().from(uploadIntents).where(eq(uploadIntents.id, id)).limit(1);
  return row ?? null;
}

// 조건 UPDATE — 남의 의도 · 이미 완료 · 만료면 0행이고 null. 같은 의도의 두 완료 통보 중 하나만 이긴다.
export async function completeIntentIfOpen(
  viewer: Viewer,
  input: { id: string; createdBy: string; now: Date },
  tx: DbOrTx,
): Promise<UploadIntentRow | null> {
  void viewer;
  const [row] = await tx
    .update(uploadIntents)
    .set({ completedAt: input.now })
    .where(
      and(
        eq(uploadIntents.id, input.id),
        eq(uploadIntents.createdBy, input.createdBy),
        isNull(uploadIntents.completedAt),
        gt(uploadIntents.expiresAt, input.now),
      ),
    )
    .returning();
  return row ?? null;
}
