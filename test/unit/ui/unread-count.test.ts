import { describe, expect, it } from "vitest";
import { nextUnreadCount, unreadCountLabel } from "@/ui/shell/unread-count";

// Task 3(04.2-07) — 배지 보이는 글자·다음 값 계산의 순수 함수 둘을 단위로
// 고정한다. 컴포넌트 렌더(UnreadCountProvider)는 이 저장소에 렌더 테스트
// 도구(@testing-library/react·jsdom)가 없어 E2E(notify-inbox.spec.ts)가
// 대신 증명한다 — 이 파일은 경계의 순수 계산만 본다(D-4219 개정).

describe("unreadCountLabel — 보이는 배지 글자(#18: 99+ 경계)", () => {
  it("null → null(배지 없음)", () => {
    expect(unreadCountLabel(null)).toBeNull();
  });

  it("0 → null(배지 없음)", () => {
    expect(unreadCountLabel(0)).toBeNull();
  });

  it("1 → \"1\"", () => {
    expect(unreadCountLabel(1)).toBe("1");
  });

  it("99 → \"99\"", () => {
    expect(unreadCountLabel(99)).toBe("99");
  });

  it("100 → \"99+\"", () => {
    expect(unreadCountLabel(100)).toBe("99+");
  });

  it("1000 → \"99+\"", () => {
    expect(unreadCountLabel(1000)).toBe("99+");
  });
});

describe("nextUnreadCount — 다시 받기 결과의 다음 값(D-4219 2026-09-25 개정 · #4 R13)", () => {
  it("성공(data: 5) → 5", () => {
    expect(nextUnreadCount(3, { data: 5 })).toBe(5);
  });

  it("성공(data: 0) → 0(0도 유효한 데이터다)", () => {
    expect(nextUnreadCount(3, { data: 0 })).toBe(0);
  });

  it("serverError → 이전 값 3 유지", () => {
    expect(nextUnreadCount(3, { serverError: "x" })).toBe(3);
  });

  it("validationErrors → 이전 값 3 유지", () => {
    expect(nextUnreadCount(3, { validationErrors: {} })).toBe(3);
  });

  it("던짐(result가 null) → 이전 값 3 유지", () => {
    expect(nextUnreadCount(3, null)).toBe(3);
  });

  it("첫 값이 없는데(null) serverError → null 그대로(첫 서버 조회 실패는 배지 없음)", () => {
    expect(nextUnreadCount(null, { serverError: "x" })).toBeNull();
  });

  it("첫 값이 없는데(null) 성공(data: 2) → 2", () => {
    expect(nextUnreadCount(null, { data: 2 })).toBe(2);
  });
});
