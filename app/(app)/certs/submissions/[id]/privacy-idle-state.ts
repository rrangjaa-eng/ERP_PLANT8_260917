// 04.3-14 — 개인정보 화면 무입력 이동 · 활동 기록의 순수 판정(privacy-idle-logout.tsx · 단위 테스트).

// G3 a — 화면의 「입력」과 서버의 「활동」을 같은 뜻으로: 입력이 이어지면 마지막 서버 활동 기록 뒤 5분마다 한 번 보낸다.
export const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60_000;

// 화면 활동으로 세는 입력(평문 가림 훅과 같은 셋).
export const PRIVACY_ACTIVITY_EVENTS = ["pointerdown", "keydown", "input"] as const;

export function shouldTouchActivity(now: number, lastTouchAt: number): boolean {
  return now - lastTouchAt >= ACTIVITY_TOUCH_INTERVAL_MS;
}

// G8 a — 인쇄 화면의 무입력 이동은 그 확인증의 I4로 돌아간다(다시 로그인하자마자 인쇄 창이 뜨지 않게). I4는 자기 경로.
export function idleReturnPath(path: string): string {
  return path.replace(/^\/print\/certs\//, "/certs/submissions/");
}
