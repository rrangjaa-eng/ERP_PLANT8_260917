// 토스트 자동 소멸 타이머. 3차 행동(되돌리기) 버튼에 포커스가 있는 동안은 소멸을 미룬다 — 키보드로 눌러 볼 시간을 준다.
// 포커스가 아무리 오래 남아도 FOCUS_HOLD_MAX_MS가 상한이고, 포커스가 나가면 보통 소멸(AUTO_DISMISS_MS)을 다시 센다.
export const AUTO_DISMISS_MS = 4000;
export const FOCUS_HOLD_MAX_MS = 60_000;

export type DismissTimer = {
  /** 토스트 안으로 포커스가 들어왔다 — 상한(60초)까지 소멸을 미룬다. */
  focus: () => void;
  /** 토스트 밖으로 포커스가 나갔다 — 보통 소멸(4초)을 다시 시작한다. */
  blur: () => void;
  dispose: () => void;
};

export function createDismissTimer(onDismiss: () => void): DismissTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(handle);
    handle = setTimeout(onDismiss, ms);
  };
  arm(AUTO_DISMISS_MS);
  return {
    focus: () => arm(FOCUS_HOLD_MAX_MS),
    blur: () => arm(AUTO_DISMISS_MS),
    dispose: () => clearTimeout(handle),
  };
}
