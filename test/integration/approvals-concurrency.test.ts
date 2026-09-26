import { describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { submitLeave } from "@/domain/leave";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// CEO-2: 트랜잭션 안에서는 tx를 받는 리포지토리 호출만 돈다 — 결재선 설정 · 번호
// 서식 · 조직 스냅숏 · 행동 로그 켜짐 여부는 트랜잭션 전에 읽고, 번호 할당이
// 마지막 쓰기다. 그래서 기본 풀(DB_POOL_MAX 5)보다 많은 제출이 겹쳐도 풀
// 고갈 교착 없이 전부 끝난다.
describe("연차 동시 제출 — 풀 5에서 6건(CEO-2)", () => {
  it("서로 다른 기안자 여섯 명의 동시 제출이 전부 끝나고 번호 여섯 개가 서로 다르다", async () => {
    expect(pool.options.max).toBe(5);
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const drafters = [];
    for (let i = 0; i < 6; i++) drafters.push(await makePerson(`기안자${i}`, DEFAULT_ROLE_ID, "기획1팀"));

    const results = await Promise.all(
      drafters.map((drafter) =>
        submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" }, { now: NOW_2026 }),
      ),
    );

    const numbers = results.map((r) => r.number).sort();
    expect(numbers).toEqual(["LV26-0001", "LV26-0002", "LV26-0003", "LV26-0004", "LV26-0005", "LV26-0006"]);
  }, 20000);
});
