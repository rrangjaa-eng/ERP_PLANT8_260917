import { LoginForm } from "./login-form";
import { getAuthProvider } from "@/domain/auth/provider";

// AUTH-04: 로그인 방식은 AUTH_PROVIDER 환경 변수 하나로 정해진다. 기본(email)은
// 조건 한 줄이 false라 폼만 렌더된다 — 구조는 바뀌지 않는다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const passwordChanged = params.reason === "password-changed";

  return (
    <main>
      <h1>로그인</h1>
      {passwordChanged ? (
        <p role="status">비밀번호가 바뀌었습니다. 다시 로그인하세요.</p>
      ) : null}
      <LoginForm showGoogle={getAuthProvider() === "google"} />
    </main>
  );
}
