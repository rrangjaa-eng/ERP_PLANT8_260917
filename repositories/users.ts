import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type UserRow = InferSelectModel<typeof users>;

export async function findUserByEmail(viewer: Viewer, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function findUserById(viewer: Viewer, id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function setPasswordTemporary(viewer: Viewer, userId: string, value: boolean): Promise<void> {
  await db.update(users).set({ passwordIsTemporary: value }).where(eq(users.id, userId));
}

// Phase 3(03-05): Phase 1이 남긴 자리표시를 실제 행 필터로 채운다. scope.rows가
// "none"이면 쿼리를 생략한다(보기 권한이 없는 viewer). includeArchived는
// scopeFor(viewer, "user")의 보관함 보기 권한 판정 결과를 그대로 받는다 — 이
// 함수 자체는 권한을 다시 확인하지 않는다(리포지토리는 서술자를 where절로
// 번역만 한다).
export async function listUsers(
  viewer: Viewer,
  opts: { scope: Scope; includeArchived: boolean },
): Promise<UserRow[]> {
  if (opts.scope.rows === "none") return [];
  return db
    .select()
    .from(users)
    .where(opts.includeArchived ? undefined : isNull(users.archivedAt))
    .orderBy(users.name);
}

export async function updateUserRole(viewer: Viewer, userId: string, roleId: string): Promise<void> {
  await db.update(users).set({ roleId, updatedAt: new Date() }).where(eq(users.id, userId));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setUserArchived(viewer: Viewer, userId: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(users)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(users.id, userId), isNull(users.archivedAt)));
  } else {
    await db
      .update(users)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(users.id, userId), isNotNull(users.archivedAt)));
  }
}

// 04.1-03(D-96 · D-97): 입사일·퇴직일 갱신. 판정(권한 · 형식 · 역전)은 domain/people이
// 하고, 동시 수정으로 역전되면 users CHECK(23514)가 막는다(호출자가 판별).
export async function updateUserHireDate(viewer: Viewer, userId: string, hireDate: string | null): Promise<void> {
  void viewer;
  await db.update(users).set({ hireDate, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserResignationDate(
  viewer: Viewer,
  userId: string,
  resignationDate: string | null,
): Promise<void> {
  void viewer;
  await db.update(users).set({ resignationDate, updatedAt: new Date() }).where(eq(users.id, userId));
}
