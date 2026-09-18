"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

export function LoginForm() {
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

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        로그인
      </button>
    </form>
  );
}
