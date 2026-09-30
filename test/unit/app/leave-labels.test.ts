import { describe, expect, it } from "vitest";
import { formatLeavePeriod, formatTableDate } from "@/app/(app)/leave/labels";

// 04.1-06 DOM 감사 #5(UI-SPEC Typography 「날짜: 표·접힌 줄은 같은 해면 `09-18`, 다른 해면 ISO」): 연차 목록의
// 기간 · 신청일은 올해와 다른 해면 연도를 붙인다.
describe("formatTableDate · formatLeavePeriod(thisYear)", () => {
  it("같은 해면 MM-DD, 다른 해면 ISO", () => {
    expect(formatTableDate("2026-09-29", 2026)).toBe("09-29");
    expect(formatTableDate("2025-09-29", 2026)).toBe("2025-09-29");
  });

  it("기간은 시작 · 끝을 각각 같은 규칙으로", () => {
    expect(formatLeavePeriod({ kind: "full_day", startDate: "2025-12-30", endDate: "2026-01-02" }, 2026)).toBe("종일 2025-12-30 ~ 01-02");
    expect(formatLeavePeriod({ kind: "half_day", startDate: "2026-03-02", endDate: "2026-03-02", half: "am" }, 2026)).toBe("반차 오전 03-02");
  });

  it("올해를 주지 않으면 지금처럼 MM-DD", () => {
    expect(formatLeavePeriod({ kind: "full_day", startDate: "2025-12-30", endDate: "2025-12-31" })).toBe("종일 12-30 ~ 12-31");
  });
});
