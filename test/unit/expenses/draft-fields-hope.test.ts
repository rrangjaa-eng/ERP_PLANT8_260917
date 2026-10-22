import { describe, expect, it } from "vitest";
import { expenseDraftFieldsSchema, requestedPaymentErrors } from "@/domain/expenses/draft-fields";
import { REQUESTED_DATE_MISSING, REQUESTED_DATE_PAST, REQUESTED_REASON_REQUIRED } from "@/domain/expenses/gate";

// 07-16(D-714 · AQ-10 · SC-02): 기안자는 지급 예정일 대신 희망 지급일 · 희망 사유 한 쌍만 적는다. 쌍 · 과거 판정은 순수 함수 하나(오늘은 넘긴 KST 날짜 — 시계 없음).
const TODAY = "2026-10-22"; // 목요일

describe("requestedPaymentErrors — 희망 지급일 · 사유 한 쌍", () => {
  it("둘 다 있으면 오류 없음", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: "2026-10-30", requestedPaymentReason: "행사 전 선금" }, TODAY)).toEqual({});
  });

  it("둘 다 없으면 오류 없음(기본은 비움)", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: null, requestedPaymentReason: null }, TODAY)).toEqual({});
    expect(requestedPaymentErrors({}, TODAY)).toEqual({});
  });

  it("희망일만 → 사유 칸 `희망 사유 · 입력`", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: "2026-10-30", requestedPaymentReason: null }, TODAY)).toEqual({ requestedPaymentReason: REQUESTED_REASON_REQUIRED });
    expect(REQUESTED_REASON_REQUIRED).toBe("희망 사유 · 입력");
  });

  // 감사 #9(P3): 다음 행동이 「날짜 선택」이고 날짜가 비면 사유 칸은 그려지지 않는다 — 오류는 희망일 칸으로.
  it("사유만 → 희망일 칸 거부(한쪽만 적는 상태를 저장하지 않는다)", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: null, requestedPaymentReason: "행사 전 선금" }, TODAY)).toEqual({ requestedPaymentDate: REQUESTED_DATE_MISSING });
  });

  it("어제 → 희망일 칸 `오늘 이후 날짜 · 다시 선택`", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: "2026-10-21", requestedPaymentReason: "늦음" }, TODAY)).toEqual({ requestedPaymentDate: REQUESTED_DATE_PAST });
    expect(REQUESTED_DATE_PAST).toBe("오늘 이후 날짜 · 다시 선택");
  });

  it("오늘은 받는다", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: TODAY, requestedPaymentReason: "오늘 필요" }, TODAY)).toEqual({});
  });

  it("미래 토요일도 받는다(영업일 판정 없음 — AQ-10)", () => {
    expect(requestedPaymentErrors({ requestedPaymentDate: "2026-10-24", requestedPaymentReason: "주말 행사" }, TODAY)).toEqual({});
  });

  it("오늘 판정은 넘긴 날짜로 — 같은 입력도 기준일이 다르면 갈린다", () => {
    const fields = { requestedPaymentDate: "2026-10-22", requestedPaymentReason: "x" };
    expect(requestedPaymentErrors(fields, "2026-10-22")).toEqual({});
    expect(requestedPaymentErrors(fields, "2026-10-23")).toEqual({ requestedPaymentDate: REQUESTED_DATE_PAST });
  });
});

describe("expenseDraftFieldsSchema — 희망 칸 · 지급 예정일 키 없음(D-714)", () => {
  it("희망 사유는 앞뒤 공백을 떼고(공백뿐이면 빈 글자) 희망일은 달력 날짜만", () => {
    expect(expenseDraftFieldsSchema.parse({ requestedPaymentReason: "  선금  " })).toEqual({ requestedPaymentReason: "선금" });
    const blank = expenseDraftFieldsSchema.parse({ requestedPaymentDate: "2026-10-30", requestedPaymentReason: "   " });
    expect(requestedPaymentErrors(blank, TODAY)).toEqual({ requestedPaymentReason: REQUESTED_REASON_REQUIRED });
    expect(expenseDraftFieldsSchema.safeParse({ requestedPaymentDate: "2026-13-01" }).success).toBe(false);
  });

  it("지급 예정일 키는 받지 않는다(strict)", () => {
    expect(expenseDraftFieldsSchema.safeParse({ scheduledPaymentDate: "2026-10-30" }).success).toBe(false);
  });
});
