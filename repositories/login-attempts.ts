import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙,
// 01-04 린트가 첫 인자 필수를 강제한다).

export async function countOpenFailures(
  viewer: Viewer,
  email: string,
  since: Date,
): Promise<number> {
  void viewer;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
        gte(loginAttempts.attemptedAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function recordAttempt(
  viewer: Viewer,
  row: { email: string; success: boolean; ip: string | null; attemptedAt: Date },
): Promise<void> {
  void viewer;
  await db.insert(loginAttempts).values(row);
}

export async function resolveOpenFailures(
  viewer: Viewer,
  email: string,
  reason: "success" | "admin_unlock",
): Promise<number> {
  void viewer;
  const resolved = await db
    .update(loginAttempts)
    .set({ resolvedAt: new Date(), resolvedReason: reason })
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
      ),
    )
    .returning({ id: loginAttempts.id });
  return resolved.length;
}

// 테스트 전용(창 만료 시뮬레이션) — repositories에 두어 4계층 규칙을 지킨다.
export async function backdateOpenFailures(
  viewer: Viewer,
  email: string,
  to: Date,
): Promise<void> {
  void viewer;
  await db
    .update(loginAttempts)
    .set({ attemptedAt: to })
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        isNull(loginAttempts.resolvedAt),
      ),
    );
}
