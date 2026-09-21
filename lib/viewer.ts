import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  passwordIsTemporary: boolean;
};

type SessionUserFields = {
  id: string;
  email: string;
  name: string;
  roleId?: string | null;
  passwordIsTemporary: boolean;
  archivedAt?: Date | string | null;
};

// D-36 이관(03-02): 계급 식별자가 없는 세션(백필 누락)을 DEFAULT_ROLE_ID로
// 떨어뜨리지 않는다 — 그러면 조용한 승격/강등이 된다. 대신 미인증처럼 null을
// 돌리고 경고를 남긴다(fail-closed). 03-01의 마이그레이션 백필이 이 경우를
// 0으로 만들었으므로 정상 경로에서는 발생하지 않는다.
export async function getSession(): Promise<{ viewer: Viewer; user: SessionUser } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rawUser = session.user as unknown as SessionUserFields;
  if (!rawUser.roleId) {
    log.warn("session.missing_role_id", { userId: rawUser.id });
    return null;
  }

  // /review M-2: 보관된 사람의 기존 세션을 여기서 끊는다. archivePerson은
  // 보관(admin.archive:write)과 세션 만료(admin.people:write)가 별개 권한인
  // 두 단계라, 두 번째가 실패하면 행은 보관됐는데 쿠키는 만료일(30일)까지
  // 그대로 동작했다. 로그인 훅(domain/auth/hooks.ts)은 새 로그인만 막는다 —
  // 정본 게이트인 여기서 판정해야 fail-closed가 된다.
  if (rawUser.archivedAt) {
    log.warn("session.archived_user", { userId: rawUser.id });
    return null;
  }

  const user: SessionUser = {
    id: rawUser.id,
    email: rawUser.email,
    name: rawUser.name,
    roleId: rawUser.roleId,
    passwordIsTemporary: rawUser.passwordIsTemporary,
  };

  return { viewer: { id: user.id, roleId: user.roleId }, user };
}

export async function requireSession(): Promise<{ viewer: Viewer; user: SessionUser }> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
