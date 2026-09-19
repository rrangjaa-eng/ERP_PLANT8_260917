"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { FormAlert } from "@/ui/form-alert/FormAlert";

const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

// AUTH-04: showGoogle은 서버 컴포넌트(page.tsx)의 getAuthProvider() === "google"
// 조건 결과를 그대로 넘겨받는다 — 클라이언트 컴포넌트만 authClient.signIn.social을
// 호출할 수 있어 조건 자체는 여기(login-form.tsx)가 아니라 page.tsx에 둔다.
export function LoginForm({ showGoogle = false }: { showGoogle?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await authClient.signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      // 이메일/비밀번호 오류를 구분하지 않는다(Claude's Discretion, CONTEXT.md).
      setError(result.error.message ?? GENERIC_ERROR);
      return;
    }

    router.push("/account");
  }

  async function handleGoogleSignIn() {
    await authClient.signIn.social({ provider: "google", callbackURL: "/account" });
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <TextField
          id="email"
          label="이메일"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          id="password"
          label="비밀번호"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button type="submit" variant="primary" pending={pending}>
          로그인
        </Button>
      </form>
      {showGoogle ? (
        <button
          type="button"
          onClick={() => {
            void handleGoogleSignIn();
          }}
        >
          Google로 로그인
        </button>
      ) : null}
    </>
  );
}
