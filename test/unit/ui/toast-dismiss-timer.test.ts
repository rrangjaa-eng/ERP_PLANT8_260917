import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_DISMISS_MS, FOCUS_HOLD_MAX_MS, createDismissTimer } from "@/ui/toast/dismiss-timer";

// 카드 11/12: 되돌리기 같은 3차 행동이 있는 토스트는 그 버튼에 포커스가 있는 동안 자동 소멸하지 않는다(최대 60초).
// 포커스가 나가면 보통 소멸(4초)을 다시 시작한다. 행동 없는 토스트는 포커스 이벤트를 연결하지 않아 기존 4초 그대로.
describe("createDismissTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("포커스가 없으면 4초 뒤 소멸한다(기존 동작)", () => {
    const onDismiss = vi.fn();
    createDismissTimer(onDismiss);
    vi.advanceTimersByTime(AUTO_DISMISS_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("포커스가 들어와 있는 동안은 4초가 지나도 남는다", () => {
    const onDismiss = vi.fn();
    const timer = createDismissTimer(onDismiss);
    timer.focus();
    vi.advanceTimersByTime(AUTO_DISMISS_MS * 5);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("포커스가 계속 있어도 60초가 상한이다", () => {
    const onDismiss = vi.fn();
    const timer = createDismissTimer(onDismiss);
    timer.focus();
    vi.advanceTimersByTime(FOCUS_HOLD_MAX_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("포커스가 나가면 그 시점부터 보통 소멸(4초)을 다시 센다", () => {
    const onDismiss = vi.fn();
    const timer = createDismissTimer(onDismiss);
    timer.focus();
    vi.advanceTimersByTime(30_000);
    timer.blur();
    vi.advanceTimersByTime(AUTO_DISMISS_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("정리하면 소멸하지 않는다", () => {
    const onDismiss = vi.fn();
    const timer = createDismissTimer(onDismiss);
    timer.focus();
    timer.dispose();
    vi.advanceTimersByTime(FOCUS_HOLD_MAX_MS * 2);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
