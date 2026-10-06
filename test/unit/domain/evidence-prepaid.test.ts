import { describe, expect, it } from "vitest";
import { prepaidDueInfo } from "@/domain/evidence-reviews/prepaid";

// 06-06(O-5) — 선결제 증빙 기한. 지급일부터 설정 날수, 날짜는 KST 달력 `YYYY-MM-DD` 문자열(DB 없음).

const base = { prepaid: true, hasEvidence: false, waived: false, paidOn: "2026-09-16", dueDays: 14, today: "2026-09-30" };

describe("prepaidDueInfo", () => {
  it("선결제 아님 → null", () => {
    expect(prepaidDueInfo({ ...base, prepaid: false })).toBeNull();
  });
  it("지급 전(paidOn null) → null — 기한은 지급일부터", () => {
    expect(prepaidDueInfo({ ...base, paidOn: null })).toBeNull();
  });
  it("면제 → null(면제가 기한 2행을 지운다)", () => {
    expect(prepaidDueInfo({ ...base, waived: true })).toBeNull();
  });
  it("증빙 있음 → null", () => {
    expect(prepaidDueInfo({ ...base, hasEvidence: true })).toBeNull();
  });
  it("지급일 09-16 · 14일 · 오늘 09-30 → 기한 09-30 · 경과 0", () => {
    expect(prepaidDueInfo(base)).toEqual({ dueOn: "2026-09-30", overdueDays: 0 });
  });
  it("오늘 10-16 → 16일 경과", () => {
    expect(prepaidDueInfo({ ...base, today: "2026-10-16" })).toEqual({ dueOn: "2026-09-30", overdueDays: 16 });
  });
  it("기한 전(오늘 09-20) → 경과 0", () => {
    expect(prepaidDueInfo({ ...base, today: "2026-09-20" })).toEqual({ dueOn: "2026-09-30", overdueDays: 0 });
  });
  it("달 · 해 넘김 — 12-25 + 14 → 이듬해 01-08", () => {
    expect(prepaidDueInfo({ ...base, paidOn: "2026-12-25", today: "2026-12-26" })).toEqual({ dueOn: "2027-01-08", overdueDays: 0 });
  });
});
