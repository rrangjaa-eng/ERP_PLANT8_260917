import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certEvents } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type CertEventRow = InferSelectModel<typeof certEvents>;

export type InsertCertEventInput = {
  name: string;
  wonOn: string; // YYYY-MM-DD
  tokenHash: string;
  tokenEncrypted: string;
  expiresAt: Date;
  contactPhone: string;
  createdBy: string | null;
};

export async function insertEvent(
  viewer: Viewer,
  input: InsertCertEventInput,
  tx: DbOrTx = db,
): Promise<CertEventRow> {
  void viewer;
  const [row] = await tx.insert(certEvents).values(input).returning();
  if (!row) throw new Error("cert_events insert가 행을 반환하지 않았습니다.");
  return row;
}

// 공개 흐름 진입점 — 토큰 해시로만 찾는다(행사 id를 추측할 수 없다).
export async function findEventByTokenHash(viewer: Viewer, tokenHash: string): Promise<CertEventRow | null> {
  void viewer;
  const [row] = await db.select().from(certEvents).where(eq(certEvents.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

// 04.3-02 Task 2 ⑩ — 제출 트랜잭션이 행사 행을 잠근다(FOR UPDATE). 호출자가
// 연 트랜잭션 안에서만 부른다(tx 필수).
export async function lockEventForUpdate(viewer: Viewer, eventId: string, tx: DbOrTx): Promise<CertEventRow | null> {
  void viewer;
  const [row] = await tx.select().from(certEvents).where(eq(certEvents.id, eventId)).for("update");
  return row ?? null;
}
