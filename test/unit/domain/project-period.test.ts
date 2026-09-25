import { describe, expect, it } from "vitest";
import { periodEditRights, resolvePeriodSave } from "@/domain/projects/period";

// 04-22(D-80 · D-82 · 사용자 D14·D11·D20 · 엔지 리뷰 A P3 · 사용자 결정 2026-09-25 「기간만 수정」) —
// 기간 칸의 순수 함수. 팀장 이상의 권리는 `projects.period` 쓰기(canEditPeriod) + 자기 팀(또는 전사)이고,
// 담당 PM의 권리는 `projects` 쓰기가 있을 때만이다.
const TODAY = "2026-09-25";

const base = { isAssignedPm: false, canWrite: false, canEditPeriod: false, actorCoversTeam: false };

describe("periodEditRights — 트레이서(04-22 Task 1)", () => {
  it("정산 + 기간 권한 + 자기 팀 → lead", () => {
    expect(periodEditRights({ ...base, status: "settling", canEditPeriod: true, actorCoversTeam: true })).toBe("lead");
  });

  it("진행 + 담당 PM(projects 쓰기) → pm", () => {
    expect(periodEditRights({ ...base, status: "in_progress", isAssignedPm: true, canWrite: true })).toBe("pm");
  });

  it("완료 → 누구든 none", () => {
    expect(
      periodEditRights({ status: "completed", isAssignedPm: true, canWrite: true, canEditPeriod: true, actorCoversTeam: true }),
    ).toBe("none");
  });
});

describe("resolvePeriodSave — 트레이서(04-22 Task 1)", () => {
  it("정산 + 새 종료일 ≥ 오늘 → 정산에서 진행으로 되돌린다(D-80)", () => {
    expect(resolvePeriodSave({ status: "settling", newStart: "2026-09-20", newEnd: "2026-10-02", todayKst: TODAY })).toEqual({
      startDate: "2026-09-20",
      endDate: "2026-10-02",
      statusChange: { from: "settling", to: "in_progress" },
    });
  });

  it("종료일 = 오늘도 되돌린다(오늘까지는 진행)", () => {
    expect(resolvePeriodSave({ status: "settling", newStart: "2026-09-20", newEnd: TODAY, todayKst: TODAY }).statusChange).toEqual({
      from: "settling",
      to: "in_progress",
    });
  });

  it("정산 + 새 종료일 < 오늘 → 상태는 그대로", () => {
    expect(
      resolvePeriodSave({ status: "settling", newStart: "2026-09-20", newEnd: "2026-09-24", todayKst: TODAY }).statusChange,
    ).toBeUndefined();
  });
});
