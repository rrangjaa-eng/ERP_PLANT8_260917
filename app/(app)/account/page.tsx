import { requireSession } from "@/lib/viewer";
import { LogoutButton } from "./logout-button";

// 01-03이 비밀번호 변경 폼·임시 비밀번호 배너를 이 화면에 더한다 — 지금은 단순
// 섹션 나열로 둔다(무스타일, Phase 2가 교체).
export default async function AccountPage() {
  const { user } = await requireSession();

  return (
    <main>
      <h1>내 계정</h1>
      <p>{user.email}</p>
      <p>{user.name}</p>
      <LogoutButton />
    </main>
  );
}
