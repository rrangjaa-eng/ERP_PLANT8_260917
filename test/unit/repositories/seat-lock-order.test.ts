import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seatLockOrder } from "@/repositories/seats";

// 06.4(D-6408): 자리 잠금 키 순서 — 층(사람 → 관리자 → 팀 → 본부) 고정, 같은 층은 중복 제거 후 정렬. DB 없이 순서만 고정한다.
describe("seatLockOrder", () => {
  it("층 순서 사람 → 관리자 → 팀 → 본부, 같은 층은 정렬 · 중복 제거", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, { teamIds: ["t2", "t1"], personIds: ["p2", "p1", "p2"], admin: true, orgUnitIds: ["o1"] })).toEqual([
      "seat:person:p1",
      "seat:person:p2",
      "seat:admin:last",
      "seat:team:t1",
      "seat:team:t2",
      "seat:division:o1",
    ]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, {})).toEqual([]);
  });

  it("admin이 거짓이면 관리자 키 없음", () => {
    expect(seatLockOrder(SYSTEM_VIEWER, { admin: false, teamIds: ["t1"] })).toEqual(["seat:team:t1"]);
  });
});
