import { describe, expect, it } from "vitest";
import { FUTURE_PAID_DATE, futurePaidDateErrors } from "@/domain/revenue/paid-date";
import { kstToday } from "@/lib/kst-date";

// 07.6-01 Task 3(D-7608): 새 입금 줄 · 바뀐 입금일이 오늘(KST) 뒤면 그 칸 오류. 그대로인 미래 줄은 막지 않는다(A4).
describe("futurePaidDateErrors", () => {
  const today = "2026-11-05";
  const none = new Map<string, { entryDate: string }>();

  it("새 줄 내일 → 오류 하나(rowIndex · rowId · 날짜 칸 · 문구)", () => {
    expect(futurePaidDateErrors([{ id: "a", isNew: true, entryDate: "2026-11-06" }], none, today)).toEqual([
      { rowIndex: 0, rowId: "a", field: "entryDate", label: "날짜", reason: FUTURE_PAID_DATE },
    ]);
  });

  it("새 줄 오늘 → 오류 없음", () => {
    expect(futurePaidDateErrors([{ id: "a", isNew: true, entryDate: today }], none, today)).toEqual([]);
  });

  it("기존 줄의 미래 날짜가 그대로면 오류 없음(A4)", () => {
    const prior = new Map([["b", { entryDate: "2026-12-01" }]]);
    expect(futurePaidDateErrors([{ id: "b", entryDate: "2026-12-01" }], prior, today)).toEqual([]);
  });

  it("기존 줄 날짜를 미래로 바꾸면 오류(그 줄 순번)", () => {
    const prior = new Map([["b", { entryDate: "2026-11-01" }]]);
    expect(futurePaidDateErrors([{ id: "c", isNew: true, entryDate: today }, { id: "b", entryDate: "2026-11-06" }], prior, today)).toEqual([
      { rowIndex: 1, rowId: "b", field: "entryDate", label: "날짜", reason: FUTURE_PAID_DATE },
    ]);
  });

  it("id 없는 줄 미래 → 오류(rowId 없음)", () => {
    expect(futurePaidDateErrors([{ entryDate: "2026-11-06" }], none, today)).toEqual([
      { rowIndex: 0, field: "entryDate", label: "날짜", reason: FUTURE_PAID_DATE },
    ]);
  });

  it("KST 경계 — UTC 2026-11-04 15:00은 KST 2026-11-05: 그날 허용 · 다음 날 거부", () => {
    const kst = kstToday(new Date("2026-11-04T15:00:00Z"));
    expect(kst).toBe("2026-11-05");
    expect(futurePaidDateErrors([{ isNew: true, entryDate: "2026-11-05" }], none, kst)).toEqual([]);
    expect(futurePaidDateErrors([{ isNew: true, entryDate: "2026-11-06" }], none, kst)).toHaveLength(1);
  });

  it("문구는 명사형 · 마침표 없음", () => {
    expect(FUTURE_PAID_DATE).toBe("미래 입금일 · 오늘까지 날짜 고르기");
  });
});
