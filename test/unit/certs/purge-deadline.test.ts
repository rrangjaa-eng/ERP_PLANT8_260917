import { describe, expect, it } from "vitest";
import { certPurgeDeadline } from "@/domain/certs/purge";

// 04.3-12 Task 1 — 파기 기한 순수 함수. 기한 = (제출 KST 연도 + 1 + 보존 연수)-04-01 00:00 KST.
// 제출한 해 종료 + 법인세 신고기한(12월 결산 — 다음 해 3월 31일) 다음 날 + 보존 기간(사용자 결정 2026-10-01 PR #88 5942919192). KST 연도 경계는 UTC로 계산하면 어긋난다.

const APRIL_1_KST_2026 = new Date("2026-04-01T00:00:00+09:00");

describe("certPurgeDeadline", () => {
  it("제출 2020-06-01 10:00 KST, 5년 → 2026-04-01 00:00 KST", () => {
    expect(certPurgeDeadline(new Date("2020-06-01T10:00:00+09:00"), 5).getTime()).toBe(APRIL_1_KST_2026.getTime());
  });

  it("KST 연도 경계 — 제출 2020-12-31 23:30 KST(UTC 14:30)는 2020년 → 2026-04-01", () => {
    const submittedAt = new Date("2020-12-31T14:30:00Z");
    expect(certPurgeDeadline(submittedAt, 5).getTime()).toBe(APRIL_1_KST_2026.getTime());
  });

  it("KST 연도 경계 — 제출 2021-01-01 00:10 KST(UTC 2020-12-31 15:10)는 2021년 → 2027-04-01", () => {
    const submittedAt = new Date("2020-12-31T15:10:00Z");
    expect(certPurgeDeadline(submittedAt, 5).getTime()).toBe(new Date("2027-04-01T00:00:00+09:00").getTime());
  });

  it("CS-2 a 기준일(보존 연수 0) — 제출 2025-12-31 23:30 KST → 2026-04-01 00:00 KST", () => {
    expect(certPurgeDeadline(new Date("2025-12-31T23:30:00+09:00"), 0).getTime()).toBe(APRIL_1_KST_2026.getTime());
  });

  it("CS-2 a 기준일(보존 연수 0) — 제출 2026-01-01 00:10 KST → 2027-04-01 00:00 KST", () => {
    expect(certPurgeDeadline(new Date("2026-01-01T00:10:00+09:00"), 0).getTime()).toBe(
      new Date("2027-04-01T00:00:00+09:00").getTime(),
    );
  });

  it("보존 연수가 다르면 기한도 다르다 — 7년", () => {
    expect(certPurgeDeadline(new Date("2020-06-01T10:00:00+09:00"), 7).getTime()).toBe(
      new Date("2028-04-01T00:00:00+09:00").getTime(),
    );
  });
});
