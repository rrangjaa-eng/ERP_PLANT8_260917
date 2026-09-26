import { describe, expect, it } from "vitest";
import { seoulToday } from "@/lib/dates";

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
