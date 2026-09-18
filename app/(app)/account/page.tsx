import { requireSession } from "@/lib/viewer";
import { LogoutButton } from "./logout-button";
import { ChangePasswordForm } from "./change-password-form";

// D-08: 임시 비밀번호는 배너로만 알리고 강제하지 않는다(리다이렉트 없음).
export default async function AccountPage() {
  const { user } = await requireSession();

  return (
    <main>
      <h1>내 계정</h1>
      <p>{user.email}</p>
      <p>{user.name}</p>
      {user.passwordIsTemporary ? (
        <p role="status">임시 비밀번호를 쓰고 있습니다 — 바꾸세요.</p>
      ) : null}
      <ChangePasswordForm />
      <LogoutButton />
    </main>
  );
}
