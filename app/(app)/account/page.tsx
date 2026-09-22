import { requireSession } from "@/lib/viewer";
import { Banner } from "@/ui/banner/Banner";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { LogoutButton } from "./logout-button";
import { ChangePasswordForm } from "./change-password-form";

// SYSTEM.md §6-3 폼 템플릿 재사용(D-30). §6-7 A④: 임시 비밀번호 배너는 로그인
// 화면이 아니라 이 화면 상단에 뜬다 — §7-11 등급 "안내"(role="status"), 이전
// role="status" 그대로 대응한다(Banner.tsx 대조표 참고).
// D-08: 임시 비밀번호는 배너로만 알리고 강제하지 않는다(리다이렉트 없음).
export default async function AccountPage() {
  const { user } = await requireSession();

  return (
    <>
      {user.passwordIsTemporary ? <Banner kind="info">임시 비밀번호를 쓰고 있습니다 — 바꾸세요.</Banner> : null}
      <PageHeader title="내 계정" subtitle={user.email} />
      <div className="single-column">
        <p>{user.name}</p>
        <ChangePasswordForm />
        <LogoutButton />
      </div>
    </>
  );
}
