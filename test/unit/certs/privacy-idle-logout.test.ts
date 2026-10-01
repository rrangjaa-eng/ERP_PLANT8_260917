import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TOUCH_INTERVAL_MS,
  REMOUNT_TOUCH_AFTER_MS,
  idleReturnPath,
  remountDecision,
  shouldSendTrailingTouch,
  shouldTouchActivity,
  trailingTouchDelay,
} from "@/app/(app)/certs/submissions/[id]/privacy-idle-state";

// 04.3-14 사용자 결정 U4 a · G3 a · G8 a — 화면의 「입력」과 서버의 「활동」을 같은 뜻으로: 입력이 이어지면 마지막 서버 활동
// 기록 뒤 5분마다 한 번만 보낸다. 인쇄 화면의 무입력 이동은 그 확인증의 I4로 돌아간다.
const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const T0 = 1_000_000;
const MIN = 60_000;

describe("shouldTouchActivity", () => {
  it("간격은 5분이다", () => {
    expect(ACTIVITY_TOUCH_INTERVAL_MS).toBe(5 * MIN);
  });

  it("마지막 서버 활동 뒤 5분 미만이면 보내지 않는다", () => {
    expect(shouldTouchActivity(T0 + 5 * MIN - 1, T0)).toBe(false);
    expect(shouldTouchActivity(T0, T0)).toBe(false);
  });

  it("5분 이상이면 보낸다", () => {
    expect(shouldTouchActivity(T0 + 5 * MIN, T0)).toBe(true);
    expect(shouldTouchActivity(T0 + 30 * MIN, T0)).toBe(true);
  });
});

// 독립 검토 Y2 — 마지막 서버 활동 뒤 5분 안의 입력은 그 창이 끝날 때 한 번 더 알린다(뒤따르는 기록). 그래야 서버의 마지막
// 활동이 늘 마지막 입력 이후라, 실제로 허용되는 무입력 시간이 한도 그대로다(25~30분으로 흔들리지 않는다).
describe("뒤따르는 활동 기록", () => {
  it("마지막 기록 뒤에 입력이 있었으면 보낸다", () => {
    expect(shouldSendTrailingTouch(T0 + 4 * MIN, T0)).toBe(true);
  });

  it("마지막 기록 뒤 입력이 없었으면 보내지 않는다", () => {
    expect(shouldSendTrailingTouch(T0, T0)).toBe(false);
    expect(shouldSendTrailingTouch(T0 - 1, T0)).toBe(false);
  });

  it("보낼 때는 마지막 기록 뒤 5분 창이 끝나는 때다", () => {
    expect(trailingTouchDelay(T0 + 4 * MIN, T0)).toBe(1 * MIN);
    expect(trailingTouchDelay(T0 + 5 * MIN, T0)).toBe(0);
    expect(trailingTouchDelay(T0 + 7 * MIN, T0)).toBe(0);
  });
});

// 독립 검토 Y1 — 앱 안 이동으로 떠났다가 뒤로 오면 라우터 캐시가 화면을 서버 판정 없이 되살린다. 다시 붙을 때 마지막 서버
// 활동부터 잰다: 한도를 넘었으면 곧바로 로그인, 1분을 넘었으면 활동 기록 한 번(결과대로), 그 안이면 그대로.
describe("remountDecision", () => {
  const idleMs = 30 * MIN;

  it("한도를 넘었으면 떠난다", () => {
    expect(remountDecision(T0 + 30 * MIN + 1, T0, idleMs)).toBe("leave");
  });

  it("정확히 한도는 서버 판정에 맡긴다(서버 경계도 >)", () => {
    expect(remountDecision(T0 + 30 * MIN, T0, idleMs)).toBe("touch");
  });

  it("1분을 넘었으면 활동 기록 한 번", () => {
    expect(REMOUNT_TOUCH_AFTER_MS).toBe(MIN);
    expect(remountDecision(T0 + MIN + 1, T0, idleMs)).toBe("touch");
  });

  it("1분 안이면 그대로", () => {
    expect(remountDecision(T0 + MIN, T0, idleMs)).toBe("stay");
    expect(remountDecision(T0, T0, idleMs)).toBe("stay");
  });
});

describe("idleReturnPath", () => {
  it("I4는 자기 경로다", () => {
    expect(idleReturnPath(`/certs/submissions/${ID}`)).toBe(`/certs/submissions/${ID}`);
  });

  it("인쇄 경로는 그 확인증의 I4 경로로 바뀐다(G8 a)", () => {
    expect(idleReturnPath(`/print/certs/${ID}`)).toBe(`/certs/submissions/${ID}`);
  });
});
