// 04.3-14 — 개인정보 화면 무입력 이동 · 활동 기록의 순수 판정(privacy-idle-logout.tsx · 단위 테스트).

// G3 a — 화면의 「입력」과 서버의 「활동」을 같은 뜻으로: 입력이 이어지면 마지막 서버 활동 기록 뒤 5분마다 한 번 보낸다.
export const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60_000;

// 화면 활동으로 세는 입력(평문 가림 훅과 같은 셋).
export const PRIVACY_ACTIVITY_EVENTS = ["pointerdown", "keydown", "input"] as const;

export function shouldTouchActivity(now: number, lastTouchAt: number): boolean {
  return now - lastTouchAt >= ACTIVITY_TOUCH_INTERVAL_MS;
}

// 독립 검토 Y2 — 마지막 서버 기록 뒤 5분 창 안의 입력은 그 창이 끝날 때 한 번 더 알린다(뒤따르는 기록). 서버의 마지막 활동이
// 늘 마지막 입력 이후가 되어, 실제로 허용되는 무입력 시간이 한도 그대로다.
export function shouldSendTrailingTouch(lastInputAt: number, lastTouchAt: number): boolean {
  return lastInputAt > lastTouchAt;
}

export function trailingTouchDelay(now: number, lastTouchAt: number): number {
  return Math.max(0, lastTouchAt + ACTIVITY_TOUCH_INTERVAL_MS - now);
}

// 독립 검토 Y1 — 라우터 캐시(뒤로 · 앞으로)로 다시 붙은 화면은 서버 판정 없이 그려졌다. 마지막 서버 활동부터 재서 한도를
// 넘었으면 곧바로 로그인, 1분을 넘었으면 활동 기록 한 번(결과대로), 그 안이면 그대로 둔다. 경계는 서버와 같은 `>`.
export const REMOUNT_TOUCH_AFTER_MS = 60_000;

export function remountDecision(now: number, lastServerActivityAt: number, idleMs: number): "leave" | "touch" | "stay" {
  const elapsed = now - lastServerActivityAt;
  if (elapsed > idleMs) return "leave";
  if (elapsed > REMOUNT_TOUCH_AFTER_MS) return "touch";
  return "stay";
}

// G8 a — 인쇄 화면의 무입력 이동은 그 확인증의 I4로 돌아간다(다시 로그인하자마자 인쇄 창이 뜨지 않게). I4는 자기 경로.
export function idleReturnPath(path: string): string {
  return path.replace(/^\/print\/certs\//, "/certs/submissions/");
}
