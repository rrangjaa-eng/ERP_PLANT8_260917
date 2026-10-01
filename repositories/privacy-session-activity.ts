import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { privacySessionActivity, sessions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.3-07 — 개인정보취급자 비활동 판정의 활동 행. 04.3-14 사용자 결정 ④ — 판정은 세션 로그인 시각(sessions.created_at)과
// 마지막 개인정보 활동을 함께 본다(첫 접근은 로그인 시각이 시작점).

export type PrivacySessionClock = { loginAt: Date; lastSeenAt: Date | null };

// 세션 로그인 시각과 마지막 개인정보 활동을 한 번에 읽는다(sessions LEFT JOIN privacy_session_activity). 세션 행이 없으면 null.
export async function findPrivacySessionClock(viewer: Viewer, sessionId: string): Promise<PrivacySessionClock | null> {
  void viewer;
  const [row] = await db
    .select({ loginAt: sessions.createdAt, lastSeenAt: privacySessionActivity.lastSeenAt })
    .from(sessions)
    .leftJoin(privacySessionActivity, eq(privacySessionActivity.sessionId, sessions.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row ? { loginAt: row.loginAt, lastSeenAt: row.lastSeenAt } : null;
}

// 세션 행이 남아 있을 때만 쓴다(INSERT … SELECT) — 그 행을 FOR KEY SHARE로 잡아, 만료 판정 · 로그아웃이
// 먼저 지웠으면 FK 오류 대신 0행이다(검토 R-L3). 쓴 행이 있으면 true.
// 칸은 시간대 없는 timestamp다 — 시간대 있는 형으로 캐스트하면 DB 세션 TimeZone에 기대 UTC가 아닌 DB에서 처음 쓴 행만
// 어긋난다(04.3-14 E4-B5 · 선례 repositories/notifications.ts).
export async function upsertPrivacyLastSeen(viewer: Viewer, sessionId: string, at: Date): Promise<boolean> {
  void viewer;
  const rows = await db
    .insert(privacySessionActivity)
    .select((qb) =>
      qb
        .select({ sessionId: sessions.id, lastSeenAt: sql<Date>`${at.toISOString()}::timestamp`.as("last_seen_at") })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for("key share"),
    )
    .onConflictDoUpdate({ target: privacySessionActivity.sessionId, set: { lastSeenAt: at } })
    .returning({ sessionId: privacySessionActivity.sessionId });
  return rows.length > 0;
}

// better-auth 세션 행을 지운다 — 활동 행은 ON DELETE CASCADE로 함께 사라진다.
export async function deleteSessionById(viewer: Viewer, sessionId: string): Promise<void> {
  void viewer;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
