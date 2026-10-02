import { describe, expect, it, vi } from "vitest";
import { certLinkExpiresAt } from "@/domain/certs/link-window";
import { linkWindowLine, requestBlockReason, requestKeyFor, requestOutcome } from "@/app/(app)/certs/events/request-rules";

// 04.3-10 Task 1 ⑧ — I′2 「QR 생성 신청」 옆 패널의 순수 판정(UD-4 a · DR-5 · N15 a · E8 b).

const TODAY = "2026-10-01";

function block(overrides: Partial<Parameters<typeof requestBlockReason>[0]> = {}) {
  return requestBlockReason({ contactMissing: false, canOpenSettings: true, name: "", wonOn: "", today: TODAY, ...overrides });
}

describe("requestBlockReason — 막힘 이유 한 번에 하나(문의 전화 → 빈 칸 → 지난 날짜)", () => {
  it("문의 전화가 비면 다른 칸과 상관없이 그 이유 하나(설정 권한 따라 두 문장)", () => {
    expect(block({ contactMissing: true })).toEqual({ text: "수령자 문의 전화 없음 · 설정 확인증 탭에서 채움", tone: "block" });
    expect(block({ contactMissing: true, canOpenSettings: false })).toEqual({
      text: "수령자 문의 전화 없음 · 등록은 경영관리",
      tone: "block",
    });
  });

  it("빈 칸 — 둘 다 비면 2칸 · 하나면 그 칸", () => {
    expect(block()?.text).toBe("행사 이름 · 당첨일 2칸 비어 있음 · 행사 이름 적기");
    expect(block({ name: "쇼케이스" })?.text).toBe("당첨일 비어 있음 · 당첨일 적기");
    expect(block({ name: "   ", wonOn: "2026-10-12" })?.text).toBe("행사 이름 비어 있음 · 행사 이름 적기");
  });

  it("오늘(KST) 이전 당첨일 → 지난 날짜 · 당첨일 확인 — 오늘 · 미래는 막지 않는다", () => {
    expect(block({ name: "쇼케이스", wonOn: "2026-09-30" })?.text).toBe("지난 날짜 · 당첨일 확인");
    expect(block({ name: "쇼케이스", wonOn: TODAY })).toBeNull();
    expect(block({ name: "쇼케이스", wonOn: "2026-10-12" })).toBeNull();
  });
});

describe("certLinkExpiresAt — 마감 = max(당첨일 00:00 KST, 지금) + 설정 시간(N15 a)", () => {
  it("당첨일이 미래면 당첨일 00:00 KST부터", () => {
    const now = new Date("2026-10-01T06:00:00Z"); // 15:00 KST
    expect(certLinkExpiresAt("2026-10-12", now, 72).toISOString()).toBe("2026-10-14T15:00:00.000Z"); // 10-15 00:00 KST
  });

  it("당첨일이 지났으면 지금부터", () => {
    const now = new Date("2026-10-01T06:00:00Z");
    expect(certLinkExpiresAt("2026-09-28", now, 72).toISOString()).toBe("2026-10-04T06:00:00.000Z");
  });
});

describe("linkWindowLine — 칸 아래 계산 줄(UD-4 a · E8 b)", () => {
  it("당첨일이 유효할 때만 `열림 MM-dd 00:00 · 마감 MM-dd HH:mm`", () => {
    const now = new Date("2026-10-01T06:30:00Z"); // 15:30 KST
    expect(linkWindowLine({ wonOn: "2026-10-12", today: TODAY, now, expireHours: 72 })).toBe("열림 10-12 00:00 · 마감 10-15 00:00");
    // 오늘이면 열림은 오늘 00:00, 마감은 지금(15:30)부터 72시간
    expect(linkWindowLine({ wonOn: TODAY, today: TODAY, now, expireHours: 72 })).toBe("열림 10-01 00:00 · 마감 10-04 15:30");
  });

  it("빈 칸 · 지난 날짜 · 형식이 틀린 값이면 줄이 없다", () => {
    const now = new Date("2026-10-01T06:30:00Z");
    for (const wonOn of ["", "2026-09-30", "2026-02-30", "abc"]) {
      expect(linkWindowLine({ wonOn, today: TODAY, now, expireHours: 72 })).toBeNull();
    }
  });
});

describe("requestOutcome — 액션 응답 갈래(결과를 알 수 없으면 failed)", () => {
  it("ok · contactMissing · invalid", () => {
    expect(requestOutcome({ data: { kind: "ok", eventId: "e1" } })).toEqual({ kind: "ok", eventId: "e1" });
    expect(requestOutcome({ data: { kind: "contactMissing" } })).toEqual({ kind: "contactMissing" });
    expect(requestOutcome({ data: { kind: "invalid", fieldErrors: { wonOn: "past" } } })).toEqual({
      kind: "invalid",
      fieldErrors: { wonOn: "past" },
    });
  });

  it("serverError · 검증 오류 · 연결 끊김(unreachable) · 모르는 모양 → failed", () => {
    for (const response of [{ serverError: "x" }, { validationErrors: {} }, "unreachable", undefined, { data: { kind: "weird" } }]) {
      expect(requestOutcome(response)).toEqual({ kind: "failed" });
    }
  });
});

describe("requestKeyFor — 요청 키는 보낸 이름 · 날짜에 묶인다(결과 모름 재시도 = 행사 하나 · PR #88 Codex P2)", () => {
  it("처음 보내면 새 키를 한 번 만들고 이름은 NFC · 앞뒤 공백 정리한 값으로 둔다", () => {
    const newKey = vi.fn(() => "key-1");
    expect(requestKeyFor(null, { name: "  봄 경품 행사 ", wonOn: TODAY }, newKey)).toEqual({
      key: "key-1",
      name: "봄 경품 행사",
      wonOn: TODAY,
    });
    expect(newKey).toHaveBeenCalledTimes(1);
  });

  it("정리한 이름 · 날짜가 같으면(뒤 공백 · NFD 이름) 같은 키를 쓰고 새 키를 만들지 않는다", () => {
    const prev = { key: "key-1", name: "봄 경품 행사", wonOn: TODAY };
    const newKey = vi.fn(() => "key-2");
    expect(requestKeyFor(prev, { name: "봄 경품 행사  ", wonOn: TODAY }, newKey)).toEqual(prev);
    expect(requestKeyFor(prev, { name: "봄 경품 행사".normalize("NFD"), wonOn: TODAY }, newKey)).toEqual(prev);
    expect(newKey).not.toHaveBeenCalled();
  });

  it("이름이나 날짜가 다르면 새 키", () => {
    const prev = { key: "key-1", name: "봄 경품 행사", wonOn: TODAY };
    const newKey = vi.fn(() => "key-2");
    expect(requestKeyFor(prev, { name: "가을 경품 행사", wonOn: TODAY }, newKey)).toEqual({
      key: "key-2",
      name: "가을 경품 행사",
      wonOn: TODAY,
    });
    expect(requestKeyFor(prev, { name: "봄 경품 행사", wonOn: "2026-10-02" }, newKey)).toEqual({
      key: "key-2",
      name: "봄 경품 행사",
      wonOn: "2026-10-02",
    });
    expect(newKey).toHaveBeenCalledTimes(2);
  });
});
