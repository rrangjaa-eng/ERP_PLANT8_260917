import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TOUCH_INTERVAL_MS,
  idleReturnPath,
  shouldTouchActivity,
} from "@/app/(app)/certs/submissions/[id]/privacy-idle-state";

// 04.3-14 사용자 결정 U4 a · G3 a · G8 a — 화면의 「입력」과 서버의 「활동」을 같은 뜻으로: 입력이 이어지면 마지막 서버 활동
// 기록 뒤 5분마다 한 번만 보낸다. 인쇄 화면의 무입력 이동은 그 확인증의 I4로 돌아간다.
const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

describe("shouldTouchActivity", () => {
  it("간격은 5분이다", () => {
    expect(ACTIVITY_TOUCH_INTERVAL_MS).toBe(5 * 60_000);
  });

  it("마지막 서버 활동 뒤 5분 미만이면 보내지 않는다", () => {
    expect(shouldTouchActivity(1_000_000 + 5 * 60_000 - 1, 1_000_000)).toBe(false);
    expect(shouldTouchActivity(1_000_000, 1_000_000)).toBe(false);
  });

  it("5분 이상이면 보낸다", () => {
    expect(shouldTouchActivity(1_000_000 + 5 * 60_000, 1_000_000)).toBe(true);
    expect(shouldTouchActivity(1_000_000 + 30 * 60_000, 1_000_000)).toBe(true);
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
