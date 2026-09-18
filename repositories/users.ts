import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type UserRow = InferSelectModel<typeof users>;

// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙,
// 01-04 린트가 첫 인자 필수를 강제한다).

export async function findUserByEmail(viewer: Viewer, email: string): Promise<UserRow | null> {
  void viewer;
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function findUserById(viewer: Viewer, id: string): Promise<UserRow | null> {
  void viewer;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function setPasswordTemporary(
  viewer: Viewer,
  userId: string,
  value: boolean,
): Promise<void> {
  void viewer;
  await db.update(users).set({ passwordIsTemporary: value }).where(eq(users.id, userId));
}
