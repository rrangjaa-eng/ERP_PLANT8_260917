import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { listProcessedInstances } from "@/repositories/approvals";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// /review(performance · core): 처리함은 인스턴스마다 가장 최근 처리 한 건을 처리 내림차순으로 limit건만 준다.
// 정렬 · 자르기를 SQL로 옮기는 리팩터의 전후 동작 고정.
describe("listProcessedInstances — 최근 처리 limit건", () => {
  it("처리 네 건 중 limit 2 → 가장 최근 두 건, 처리 내림차순", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const days = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"];
    const approved: string[] = [];
    for (const day of days) {
      const doc = await submitLeave(drafter, { kind: "full_day", startDate: day, endDate: day, half: "" }, { now: NOW_2026 });
      await approveDocument(ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }, { now: NOW_2026 });
      approved.push(doc.instanceId);
    }

    const rows = await listProcessedInstances(SYSTEM_VIEWER, ceo.id, 2);
    expect(rows.map((row) => row.id)).toEqual([approved[3], approved[2]]);
    expect(rows[0]?.action).toBe("approved");
    expect(rows[0]?.drafterName).toBe("박서연");
    expect((rows[0]?.actedAt.getTime() ?? 0) >= (rows[1]?.actedAt.getTime() ?? 0)).toBe(true);
    expect(await listProcessedInstances(SYSTEM_VIEWER, drafter.id, 50)).toEqual([]);
  });
});
