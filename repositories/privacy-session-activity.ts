import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { privacySessionActivity, sessions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.3-07 — 개인정보취급자 비활동 판정의 활동 행. 세션 로그인 시각은 읽지 않는다
// (E3-10 — 첫 개인정보 경로 방문이 시작점).

export async function findPrivacyLastSeen(viewer: Viewer, sessionId: string): Promise<Date | null> {
  void viewer;
  const [row] = await db
    .select({ lastSeenAt: privacySessionActivity.lastSeenAt })
    .from(privacySessionActivity)
    .where(eq(privacySessionActivity.sessionId, sessionId))
    .limit(1);
  return row?.lastSeenAt ?? null;
}

export async function upsertPrivacyLastSeen(viewer: Viewer, sessionId: string, at: Date): Promise<void> {
  void viewer;
  await db
    .insert(privacySessionActivity)
    .values({ sessionId, lastSeenAt: at })
    .onConflictDoUpdate({ target: privacySessionActivity.sessionId, set: { lastSeenAt: at } });
}

// better-auth 세션 행을 지운다 — 활동 행은 ON DELETE CASCADE로 함께 사라진다.
export async function deleteSessionById(viewer: Viewer, sessionId: string): Promise<void> {
  void viewer;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
