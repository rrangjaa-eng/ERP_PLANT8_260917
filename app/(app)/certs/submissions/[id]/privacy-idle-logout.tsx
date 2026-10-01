"use client";

import { useEffect } from "react";
import { privacyLoginHref } from "@/lib/login-next";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { touchPrivacySessionAction } from "./actions";
import { PRIVACY_ACTIVITY_EVENTS, idleReturnPath, shouldTouchActivity } from "./privacy-idle-state";

// 04.3-14 사용자 결정 U4 a — I4 · 인쇄 화면에 입력(누름 · 키 · 입력)이 한도(분) 동안 없으면 화면이 스스로 로그인 화면(이유 줄 ·
// next=)으로 간다. 화면에 그리는 것은 없다. 이동은 location.replace — 기록에 개인정보 화면 항목을 남기지 않는 전체 이동이고,
// 뒤로 · 앞으로 캐시에서 되살아난 화면은 곧바로 다시 불러와 서버 판정을 거친다(G0 DR-5 · F6). 인쇄 화면은 그 확인증의
// I4로 돌아간다(G8 a). 입력이 이어지면 마지막 서버 활동 기록 뒤 5분마다 한 번 활동을 알린다(G3 a). 세션은 지우지 않는다 —
// 서버 판정(touchPrivacySession)과 평문 3분 가림은 따로다.
export function PrivacyIdleLogout({ idleMinutes, returnPath }: { idleMinutes: number; returnPath: string }) {
  useEffect(() => {
    const loginHref = privacyLoginHref(idleReturnPath(returnPath));
    const leave = () => window.location.replace(loginHref);
    const idleMs = idleMinutes * 60_000;

    let lastTouchAt = Date.now(); // 이 화면을 그린 요청이 서버 활동을 남겼다
    let touching = false;
    let timer = window.setTimeout(leave, idleMs);

    const touch = async () => {
      touching = true;
      lastTouchAt = Date.now();
      try {
        const result = await touchPrivacySessionAction();
        if (result?.data?.kind === "sessionExpired" || result?.serverError === LOGIN_REQUIRED_MESSAGE) leave();
      } catch {
        // 연결 실패 — 다음 입력이 5분 뒤 다시 알리고, 서버 판정은 다음 요청에서 그대로 끊는다.
      } finally {
        touching = false;
      }
    };

    const onActivity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(leave, idleMs);
      if (!touching && shouldTouchActivity(Date.now(), lastTouchAt)) void touch();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    for (const type of PRIVACY_ACTIVITY_EVENTS) document.addEventListener(type, onActivity);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      for (const type of PRIVACY_ACTIVITY_EVENTS) document.removeEventListener(type, onActivity);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [idleMinutes, returnPath]);

  return null;
}
