import { describe, expect, it } from "vitest";
import { groupIndex, LEAVE_STATUS_GROUP_ORDER, type LeaveListRow } from "@/app/(app)/leave/(list)/leave-table";

// 07.2-15 게이트 지적: 취소가 최종 승인된 연차(원 상태는 approved · 낱말 `취소됨`)가 `승인` 묶음 사이에 섞이지 않는다 —
// 반려 · 회수처럼 끝 상태 묶음 `취소됨`으로 맨 뒤에 모인다. 취소 요청 중(아직 승인된 연차)은 `승인` 묶음 그대로.
function row(id: string, startDate: string, status: LeaveListRow["status"]): LeaveListRow {
  return { id, number: id, period: startDate, startDate, days: "1일", statusKey: "approved", status, requestedOn: "01-01", note: "" };
}

describe("연차 목록 묶음 — 취소됨", () => {
  it("묶음 순서 끝에 `취소됨`이 있고, 취소된 연차는 그 묶음 · 취소 요청 중은 `승인` 묶음", () => {
    expect(LEAVE_STATUS_GROUP_ORDER.at(-1)).toBe("취소됨");
    expect(LEAVE_STATUS_GROUP_ORDER[groupIndex(row("a", "2026-03-01", "취소됨"))]).toBe("취소됨");
    expect(LEAVE_STATUS_GROUP_ORDER[groupIndex(row("b", "2026-03-01", "취소 요청 중"))]).toBe("승인");
    expect(LEAVE_STATUS_GROUP_ORDER[groupIndex(row("c", "2026-03-01", "승인"))]).toBe("승인");
  });

  it("정렬: 앞선 시작일의 취소된 연차도 승인 묶음 뒤로 간다", () => {
    const rows = [row("approved-late", "2026-04-01", "승인"), row("cancelled-early", "2026-02-01", "취소됨"), row("approved-early", "2026-03-01", "승인")];
    const sorted = [...rows].sort((a, b) => groupIndex(a) - groupIndex(b) || (a.startDate < b.startDate ? -1 : 1));
    expect(sorted.map((item) => item.id)).toEqual(["approved-early", "approved-late", "cancelled-early"]);
  });
});
