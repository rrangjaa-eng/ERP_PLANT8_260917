"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

// 마운트 시 /api/auth/get-session을 한 번 불러 D-07 sliding 세션의 브라우저 쿠키를
// 연장한다. better-auth는 자기 라우트 응답에서만 Set-Cookie로 세션 쿠키를
// 재발급하고(updateAge 1일 경과 시), 서버 컴포넌트의 auth.api.getSession은 DB
// expiresAt만 늘리고 쿠키는 못 건드린다 — 이 호출이 없으면 매일 쓰는 직원도 첫
// 로그인 30일 뒤 강제 재로그인된다(플랜 리뷰 Eng OV-3). 로그인 전 페이지는 세션이
// 없어 no-op이며 렌더는 없다.
export function SessionRefresh() {
  useEffect(() => {
    void authClient.getSession();
  }, []);

  return null;
}
