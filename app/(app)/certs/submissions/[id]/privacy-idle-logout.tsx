"use client";

import { useEffect } from "react";
import { privacyLoginHref } from "@/lib/login-next";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { touchPrivacySessionAction } from "./actions";
import {
  PRIVACY_ACTIVITY_EVENTS,
  idleReturnPath,
  remountDecision,
  shouldSendTrailingTouch,
  shouldTouchActivity,
  trailingTouchDelay,
} from "./privacy-idle-state";

// 서버 판정 한 번(= 렌더 한 번, 표지는 판정 시각)마다 이 탭이 아는 마지막 서버 활동 시각(이 탭의 시계). 라우터 캐시(뒤로 ·
// 앞으로)로 같은 렌더가 다시 붙으면 여기서 찾아 떠나 있던 시간을 잰다 — 서버 시각과 탭 시계를 직접 비교하지 않아 시계가
// 어긋난 PC에서도 로그인 화면을 맴돌지 않는다(검토 Y1).
const lastServerActivityByRender = new Map<number, number>();

// 04.3-14 사용자 결정 U4 a — I4 · 인쇄 화면에 입력(누름 · 키 · 입력)이 한도(분) 동안 없으면 화면이 스스로 로그인 화면(이유 줄 ·
// next=)으로 간다. 화면에 그리는 것은 없다. 이동은 location.replace — 기록에 개인정보 화면 항목을 남기지 않는 전체 이동이고,
// 뒤로 · 앞으로 캐시에서 되살아난 화면은 곧바로 다시 불러와 서버 판정을 거친다(G0 DR-5 · F6). 앱 안 이동 뒤 라우터 캐시로
// 다시 붙은 화면은 마지막 서버 활동부터 재서 한도를 넘었으면 곧바로 떠나고, 1분을 넘었으면 활동 기록 한 번의 결과를 따른다
// (검토 Y1). 인쇄 화면은 그 확인증의 I4로 돌아간다(G8 a). 입력이 이어지면 마지막 서버 활동 기록 뒤 5분마다 한 번 활동을
// 알리고, 그 창 안의 입력은 창이 끝날 때 한 번 더 알린다(G3 a · 검토 Y2). 세션은 지우지 않는다 — 서버 판정
// (touchPrivacySession)과 평문 3분 가림은 따로다.
export function PrivacyIdleLogout({
  idleMinutes,
  judgedAt,
  returnPath,
}: {
  idleMinutes: number;
  judgedAt: number;
  returnPath: string;
}) {
  useEffect(() => {
    const loginHref = privacyLoginHref(idleReturnPath(returnPath));
    const leave = () => window.location.replace(loginHref);
    const idleMs = idleMinutes * 60_000;

    const now = Date.now();
    const known = lastServerActivityByRender.get(judgedAt);
    // 처음 붙으면 이 화면을 그린 요청이 방금 서버 활동을 남겼다.
    let lastTouchAt = known ?? now;
    let lastInputAt = 0;
    let touching = false;
    let disposed = false;
    let idleTimer = 0;
    let trailingTimer = 0;

    const armIdle = (ms: number) => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(leave, ms);
    };

    const touch = async () => {
      touching = true;
      lastTouchAt = Date.now();
      lastServerActivityByRender.set(judgedAt, lastTouchAt);
      try {
        const result = await touchPrivacySessionAction();
        if (result?.data?.kind === "sessionExpired" || result?.serverError === LOGIN_REQUIRED_MESSAGE) leave();
      } catch {
        // 연결 실패 — 다음 입력이 5분 뒤 다시 알리고, 서버 판정은 다음 요청에서 그대로 끊는다.
      } finally {
        touching = false;
      }
    };

    const sendTrailing = () => {
      trailingTimer = 0;
      if (disposed || touching || !shouldSendTrailingTouch(lastInputAt, lastTouchAt)) return;
      void touch();
    };

    const onActivity = () => {
      const at = Date.now();
      lastInputAt = at;
      armIdle(idleMs);
      if (!touching && shouldTouchActivity(at, lastTouchAt)) {
        void touch();
      } else if (trailingTimer === 0) {
        trailingTimer = window.setTimeout(sendTrailing, trailingTouchDelay(at, lastTouchAt));
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    if (known === undefined) {
      lastServerActivityByRender.set(judgedAt, now);
      armIdle(idleMs);
    } else {
      const decision = remountDecision(now, known, idleMs);
      if (decision === "leave") {
        leave();
        return;
      }
      armIdle(idleMs - (now - known));
      if (decision === "touch") {
        void touch().then(() => {
          if (!disposed) armIdle(idleMs);
        });
      }
    }

    for (const type of PRIVACY_ACTIVITY_EVENTS) document.addEventListener(type, onActivity);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      window.clearTimeout(idleTimer);
      window.clearTimeout(trailingTimer);
      for (const type of PRIVACY_ACTIVITY_EVENTS) document.removeEventListener(type, onActivity);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [idleMinutes, judgedAt, returnPath]);

  return null;
}
