import { LoginForm } from "./login-form";
import { getAuthProvider } from "@/domain/auth/provider";
import { AuthFrame } from "@/ui/auth-frame/AuthFrame";

// AUTH-04: 로그인 방식은 AUTH_PROVIDER 환경 변수 하나로 정해진다. 기본(email)은
// 조건 한 줄이 false라 폼만 렌더된다 — 구조는 바뀌지 않는다.
// SYSTEM.md §6-7: 셸 없는 화면 — 상단 바·하단 탭 없이 AuthFrame(워드마크 + 폼)만.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const passwordChanged = params.reason === "password-changed";

  return (
    <main>
      {/* axe page-has-heading-one(§10) — 02-03이 뺀 시각적 h1은 워드마크와
          중복이라 그대로 두고, 스크린 리더 전용 제목만 되살린다(app/globals.css .sr-only). */}
      <h1 className="sr-only">로그인</h1>
      <AuthFrame>
        {/* F-1①: 비밀번호 변경 뒤 돌아온 안내 — 문장·질의 값 불변(change-password.spec.ts) */}
        {passwordChanged ? (
          <p role="status">비밀번호가 바뀌었습니다. 다시 로그인하세요.</p>
        ) : null}
        <LoginForm showGoogle={getAuthProvider() === "google"} />
      </AuthFrame>
    </main>
  );
}
