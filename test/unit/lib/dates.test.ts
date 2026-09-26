import { describe, expect, it } from "vitest";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";

// CEO-11: Cloud Run은 UTC라 「오늘」을 UTC 날짜로 만들면 한국 시간 0~9시에
// 하루(연말이면 한 해)가 틀린다. 04.1의 「오늘」은 전부 seoulToday에서 나온다.
describe("seoulToday — 서울 날짜", () => {
  it("2026-12-31T15:30:00Z(= 서울 2027-01-01 00:30)는 2027-01-01이다", () => {
    expect(seoulToday(new Date("2026-12-31T15:30:00Z"))).toBe("2027-01-01");
  });

  it("2026-12-31T14:59:59Z(= 서울 2026-12-31 23:59:59)는 2026-12-31이다", () => {
    expect(seoulToday(new Date("2026-12-31T14:59:59Z"))).toBe("2026-12-31");
  });
});

// A-03: 이력형 설정 asOf `Date`의 유일한 변환 — 서울 날짜의 UTC 자정. getSettingValue가
// `toISOString().slice(0, 10)`으로 날짜를 되돌리므로 같은 날짜가 나와야 한다. 로컬 자정
// (`new Date(y, m, d)`)으로 만들면 TZ=Asia/Seoul에서 전날이 된다(CI UTC로는 못 잡는다).
describe("seoulDateToUtcDate — 서울 날짜 → 그 날짜 UTC 자정", () => {
  it("2027-01-01은 2027-01-01T00:00:00.000Z이고 왕복하면 같은 날짜다", () => {
    expect(seoulDateToUtcDate("2027-01-01").toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(seoulDateToUtcDate("2027-01-01").toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("2026-12-31도 같은 왕복이다", () => {
    expect(seoulDateToUtcDate("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(seoulDateToUtcDate("2026-12-31").toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("형식이 아니거나 없는 날짜는 던진다", () => {
    expect(() => seoulDateToUtcDate("2027-1-1")).toThrow();
    expect(() => seoulDateToUtcDate("2027-13-01")).toThrow();
  });
});
