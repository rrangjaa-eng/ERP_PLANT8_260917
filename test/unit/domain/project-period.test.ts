import { describe, expect, it } from "vitest";
import {
  periodEditRights,
  previewPeriodChange,
  resolvePeriodSave,
  validatePeriodChange,
  INCOMPLETE_DATE,
} from "@/domain/projects/period";

// 04-22(D-80 · D-82 · 사용자 D14·D11·D20 · 엔지 리뷰 A P3 · 사용자 결정 2026-09-25 「기간만 수정」) —
// 기간 칸의 순수 함수. 팀장 이상의 권리는 `projects.period` 쓰기(canEditPeriod) + 자기 팀(또는 전사)이고,
// 담당 PM의 권리는 `projects` 쓰기가 있을 때만이다. 검증·미리보기는 저장될 값(resolvePeriodSave 결과)
// 위에서 판정한다(CEO A-02).
const TODAY = "2026-09-25";

const base = { isAssignedPm: false, canWrite: false, canEditPeriod: false, actorCoversTeam: false };

describe("periodEditRights — 결정표", () => {
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

  it.each(["bidding", "in_progress", "lost"] as const)("%s + 담당 PM(projects 쓰기) → pm", (status) => {
    expect(periodEditRights({ ...base, status, isAssignedPm: true, canWrite: true })).toBe("pm");
  });

  it("담당 PM인데 projects 쓰기를 회수당함 → none(엔지 리뷰 A P3)", () => {
    expect(periodEditRights({ ...base, status: "in_progress", isAssignedPm: true, canWrite: false })).toBe("none");
  });

  it.each(["bidding", "in_progress", "lost", "settling"] as const)("%s + 기간 권한 + 자기 팀(또는 전사) → lead", (status) => {
    expect(periodEditRights({ ...base, status, canEditPeriod: true, actorCoversTeam: true })).toBe("lead");
  });

  it("담당 PM이면서 기간 권한 + 자기 팀 → lead(더 넓은 권리)", () => {
    expect(
      periodEditRights({ status: "in_progress", isAssignedPm: true, canWrite: true, canEditPeriod: true, actorCoversTeam: true }),
    ).toBe("lead");
  });

  it("다른 팀 팀장(업무 범위 team, 담당 PM 아님) → none(사용자 D11·D20)", () => {
    expect(periodEditRights({ ...base, status: "in_progress", canEditPeriod: true, actorCoversTeam: false })).toBe("none");
  });

  it("정산 + 담당 PM(기간 권한 없음) → none", () => {
    expect(periodEditRights({ ...base, status: "settling", isAssignedPm: true, canWrite: true })).toBe("none");
  });

  it("담당이 아닌 PM(projects 쓰기만) → none", () => {
    expect(periodEditRights({ ...base, status: "in_progress", canWrite: true })).toBe("none");
  });

  it("projects.status만 있고 projects.period가 없는 사람 → lead가 아니다(기간 권리는 projects.period)", () => {
    expect(periodEditRights({ ...base, status: "settling", canEditPeriod: false, actorCoversTeam: true })).toBe("none");
  });
});

describe("resolvePeriodSave — 저장될 값", () => {
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

  it("진행 이후 + 종료일 비움 → 종료일 = 시작일(D-82)", () => {
    expect(resolvePeriodSave({ status: "in_progress", newStart: "2026-09-28", newEnd: null, todayKst: TODAY })).toEqual({
      startDate: "2026-09-28",
      endDate: "2026-09-28",
    });
  });

  it("수주중 + 종료일 비움 → 그대로 비움", () => {
    expect(resolvePeriodSave({ status: "bidding", newStart: "2026-09-28", newEnd: null, todayKst: TODAY })).toEqual({
      startDate: "2026-09-28",
      endDate: null,
    });
  });
});

describe("validatePeriodChange — 저장될 값 위에서", () => {
  const ok = { rights: "lead" as const, todayKst: TODAY, teamLeadName: null };

  it.each(["2026-02-30", "2026-13-01", "2026-9-18", "abc"])("달력·형식에 없는 날짜 %s → 형식 오류(그 칸)", (value) => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "2026-09-18", end: value })).toEqual([
      { field: "end", reason: "날짜 형식 오류 · 2026-09-18처럼" },
    ]);
  });

  // 사용자 결정 2026-09-26 「날짜 입력 통일」 — 빈 칸은 형식 오류가 아니라 「날짜를 골라 주세요」다.
  // /review(testing) — 시작일 빈 칸과 두 칸 모두 빈 칸도 같은 판정(저장 판정 전에 칸별 오류로 끝난다).
  it("시작일 빈 문자열 → 시작일 칸 「날짜를 골라 주세요」", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "", end: "2026-09-18" })).toEqual([
      { field: "start", reason: "날짜를 골라 주세요" },
    ]);
  });

  // 사용자 결정 2026-09-26(/review D2) — 덜 채운 네이티브 날짜 칸(표식 INCOMPLETE_DATE)도 다른 화면처럼 「날짜를 골라 주세요」.
  it("덜 채운 칸 표식 → 그 칸 「날짜를 골라 주세요」(형식 오류 아님)", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "2026-09-18", end: INCOMPLETE_DATE })).toEqual([
      { field: "end", reason: "날짜를 골라 주세요" },
    ]);
  });

  it("두 칸 모두 빈 문자열 → 두 칸 모두 「날짜를 골라 주세요」", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "", end: "" })).toEqual([
      { field: "start", reason: "날짜를 골라 주세요" },
      { field: "end", reason: "날짜를 골라 주세요" },
    ]);
  });

  it("빈 문자열(칸을 비움) → 「날짜를 골라 주세요」(형식 오류 아님)", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "2026-09-18", end: "" })).toEqual([
      { field: "end", reason: "날짜를 골라 주세요" },
    ]);
  });

  it("종료 < 시작 → 종료 칸 오류", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: "2026-10-05", end: "2026-10-01" })).toEqual([
      { field: "end", reason: "종료일이 시작일보다 빠름 · 종료일 수정" },
    ]);
  });

  it("진행 이후 + 시작일 비움 → 시작 칸 오류(D-82)", () => {
    expect(validatePeriodChange({ ...ok, status: "settling", start: null, end: "2026-10-01" })).toEqual([
      { field: "start", reason: "시작일 필요 · 시작일 입력" },
    ]);
  });

  it("수주중은 시작일을 비워도 된다", () => {
    expect(validatePeriodChange({ ...ok, status: "bidding", start: null, end: null })).toEqual([]);
  });

  it("진행 + pm + 저장될 종료 < 오늘 → 종료 칸 「앞당기기는 팀장 {이름}」", () => {
    expect(
      validatePeriodChange({ status: "in_progress", rights: "pm", start: "2026-09-20", end: "2026-09-24", todayKst: TODAY, teamLeadName: "김팀장" }),
    ).toEqual([{ field: "end", reason: "종료일이 오늘보다 빠름 · 앞당기기는 팀장 김팀장" }]);
  });

  it("팀장이 없으면 이름 없는 문구", () => {
    expect(
      validatePeriodChange({ status: "in_progress", rights: "pm", start: "2026-09-20", end: "2026-09-24", todayKst: TODAY, teamLeadName: null }),
    ).toEqual([{ field: "end", reason: "종료일이 오늘보다 빠름" }]);
  });

  it("진행 + pm + 시작일 < 오늘 + 종료일 비움 → 같은 오류(종료 칸, A-02 — 비움 우회 차단)", () => {
    expect(
      validatePeriodChange({ status: "in_progress", rights: "pm", start: "2026-09-20", end: null, todayKst: TODAY, teamLeadName: "김팀장" }),
    ).toEqual([{ field: "end", reason: "종료일이 오늘보다 빠름 · 앞당기기는 팀장 김팀장" }]);
  });

  it("진행 + pm + 종료 = 오늘 → 통과", () => {
    expect(
      validatePeriodChange({ status: "in_progress", rights: "pm", start: "2026-09-20", end: TODAY, todayKst: TODAY, teamLeadName: null }),
    ).toEqual([]);
  });

  it("진행 + lead는 종료일을 어제로 앞당길 수 있다", () => {
    expect(validatePeriodChange({ ...ok, status: "in_progress", start: "2026-09-20", end: "2026-09-24" })).toEqual([]);
  });
});

describe("previewPeriodChange — 저장될 값 위에서", () => {
  it("정산 + 새 종료 ≥ 오늘 → 저장하면 진행으로 돌아감", () => {
    expect(previewPeriodChange({ status: "settling", newStart: "2026-09-20", newEnd: "2026-10-01", todayKst: TODAY })).toBe(
      "저장하면 진행으로 돌아감",
    );
  });

  it("진행 + 저장될 종료 < 오늘 → 저장하면 정산이 됨", () => {
    expect(previewPeriodChange({ status: "in_progress", newStart: "2026-09-20", newEnd: "2026-09-24", todayKst: TODAY })).toBe(
      "저장하면 정산이 됨",
    );
  });

  it("진행 + 종료 비움 + 과거 시작일 → 저장하면 정산이 됨(「비어 시작일로」보다 우선, A-02)", () => {
    expect(previewPeriodChange({ status: "in_progress", newStart: "2026-09-20", newEnd: null, todayKst: TODAY })).toBe(
      "저장하면 정산이 됨",
    );
  });

  it("진행 이후 + 종료 비움 + 정산이 되지 않음 → 종료일이 비어 시작일로 저장됨", () => {
    expect(previewPeriodChange({ status: "in_progress", newStart: "2026-09-28", newEnd: null, todayKst: TODAY })).toBe(
      "종료일이 비어 시작일로 저장됨",
    );
    expect(previewPeriodChange({ status: "settling", newStart: "2026-09-20", newEnd: null, todayKst: TODAY })).toBe(
      "종료일이 비어 시작일로 저장됨",
    );
  });

  it("그 밖 → null", () => {
    expect(previewPeriodChange({ status: "bidding", newStart: "2026-09-20", newEnd: "2026-09-24", todayKst: TODAY })).toBeNull();
    expect(previewPeriodChange({ status: "in_progress", newStart: "2026-09-20", newEnd: "2026-10-01", todayKst: TODAY })).toBeNull();
    expect(previewPeriodChange({ status: "bidding", newStart: "2026-09-20", newEnd: null, todayKst: TODAY })).toBeNull();
  });

  it("형식이 틀린 입력에는 힌트를 내지 않는다", () => {
    expect(previewPeriodChange({ status: "in_progress", newStart: "2026-09-20", newEnd: "2026-02-30", todayKst: TODAY })).toBeNull();
  });
});
