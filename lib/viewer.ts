import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Viewer } from "@/domain/viewer";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  passwordIsTemporary: boolean;
};

type SessionUserFields = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  passwordIsTemporary: boolean;
};

export async function getSession(): Promise<{ viewer: Viewer; user: SessionUser } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rawUser = session.user as unknown as SessionUserFields;
  const user: SessionUser = {
    id: rawUser.id,
    email: rawUser.email,
    name: rawUser.name,
    isAdmin: rawUser.isAdmin,
    passwordIsTemporary: rawUser.passwordIsTemporary,
  };

  return { viewer: { id: user.id, isAdmin: user.isAdmin }, user };
}

export async function requireSession(): Promise<{ viewer: Viewer; user: SessionUser }> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
