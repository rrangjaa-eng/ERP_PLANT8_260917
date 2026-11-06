import { describe, expect, it } from "vitest";
import { formatLeaveKind, formatLeavePeriod, formatTableDate } from "@/app/(app)/leave/labels";
import { formatLeaveTitle } from "@/domain/leave";

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

// 07.2-08(PU11 · D-7258): 반반차는 시작 시각이 오전/오후를 대신한다 — 표시 자리 셋(목록 · 문서 화면 종류 줄 · 제목/결재함)이
// 같은 글자. 시각이 있으면 half 글자(`오전` · `오후`)는 붙지 않는다. 시각 없는 기존 행(이 PR 전 저장 · half만 있음)은
// 저장된 오전/오후를 그대로 보인다(PR #368 리뷰 P3-1).
describe("반반차 시작 시각 표시", () => {
  it("formatLeaveKind — 반반차 14:00 · 시각 없으면 반반차 · 반차는 오전/오후 그대로", () => {
    expect(formatLeaveKind({ kind: "quarter_day", startTime: "14:00" })).toBe("반반차 14:00");
    expect(formatLeaveKind({ kind: "quarter_day", startTime: null })).toBe("반반차");
    expect(formatLeaveKind({ kind: "quarter_day", half: "am", startTime: null })).toBe("반반차 오전");
    expect(formatLeaveKind({ kind: "quarter_day", half: "pm", startTime: "14:00" })).toBe("반반차 14:00");
    expect(formatLeaveKind({ kind: "half_day", half: "pm" })).toBe("반차 오후");
    expect(formatLeaveKind({ kind: "full_day" })).toBe("종일");
  });

  it("formatLeavePeriod — 반반차는 시각이 오전/오후 자리에", () => {
    expect(formatLeavePeriod({ kind: "quarter_day", startDate: "2026-03-02", endDate: "2026-03-02", half: "am", startTime: "14:00" }, 2026)).toBe(
      "반반차 14:00 03-02",
    );
    expect(formatLeavePeriod({ kind: "quarter_day", startDate: "2026-03-02", endDate: "2026-03-02", half: "am", startTime: null }, 2026)).toBe("반반차 오전 03-02");
  });

  it("formatLeaveTitle(문서 머리 · 결재 시트 머리 · 결재함 문서 칸) — 반반차 14:00, 오전 · 오후 0", () => {
    const title = formatLeaveTitle({ kind: "quarter_day", half: "am", startTime: "14:00", startDate: "2026-03-02", endDate: "2026-03-02" });
    expect(title).toBe("연차 — 반반차 14:00 03-02");
    expect(title).not.toMatch(/오전|오후/);
    expect(formatLeaveTitle({ kind: "quarter_day", half: "pm", startTime: null, startDate: "2026-03-02", endDate: "2026-03-02" })).toBe("연차 — 반반차 오후 03-02");
    expect(formatLeaveTitle({ kind: "quarter_day", half: null, startTime: null, startDate: "2026-03-02", endDate: "2026-03-02" })).toBe("연차 — 반반차 03-02");
  });
});
