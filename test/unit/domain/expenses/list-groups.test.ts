import { describe, expect, it } from "vitest";
import { groupExpenses } from "@/domain/expenses/list";

// 05-08 Task 2(UI-SPEC S8 그룹 머리글 · M2): groupExpenses는 SQL이 정한 순서를 바꾸지 않고 연속한 같은 그룹에 머리글만 붙인다.
// 승인 보기는 지급 예정일 서울 날짜 구간(주 = 월요일 시작) — 예정일 지남(warning) · 이번 주 지급 · 다음 주 · 그 뒤.
// 07-06(D-715): 예정일은 늘 유효값(수동 ?? 자동)이라 「지급 예정일 없음」 구간은 없다.

type Row = { id: string; groupRank: number; scheduledPaymentDate: string; paid: boolean };

const row = (id: string, groupRank: number, scheduledPaymentDate = "2026-09-25", paid = false): Row => ({ id, groupRank, scheduledPaymentDate, paid });

describe("groupExpenses — 승인 보기 날짜 구간", () => {
  it("2026-09-26(토) 기준 — 지남 · 이번 주(일요일까지) · 다음 주(월요일부터) · 그 뒤, 비는 구간은 없다", () => {
    const rows = [row("a", 4, "2026-09-25"), row("b", 4, "2026-09-27"), row("c", 4, "2026-09-28"), row("d", 4, "2026-10-06")];
    const groups = groupExpenses(rows, { status: "approved", todayKst: "2026-09-26" });
    expect(groups.map((g) => [g.label, g.tone ?? null, g.rows.map((r) => r.id)])).toEqual([
      ["예정일 지남", "warning", ["a"]],
      ["이번 주 지급", null, ["b"]],
      ["다음 주", null, ["c"]],
      ["그 뒤", null, ["d"]],
    ]);
  });

  it("오늘이 예정일이면 이번 주, 다음 주 일요일까지 다음 주, 그 다음 월요일부터 그 뒤", () => {
    const rows = [row("t", 4, "2026-09-26"), row("n", 4, "2026-10-04"), row("l", 4, "2026-10-05")];
    const groups = groupExpenses(rows, { status: "approved", todayKst: "2026-09-26" });
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["이번 주 지급", ["t"]],
      ["다음 주", ["n"]],
      ["그 뒤", ["l"]],
    ]);
  });

  // 07-06 검토 P3(사용자 결정 2026-10-22): 지급 끝난 승인 건은 SQL이 미지급 건 뒤로 보낸다 — 예정일로 구간을 매기면 「다음 주」 뒤에
  // 「예정일 지남」이 다시 선다. 지급 끝난 건은 예정일과 무관하게 맨 뒤 「지급 완료」 구간 하나로 묶는다.
  it("지급 끝난 건은 과거 · 미래 예정일이 섞여도 맨 뒤 「지급 완료」 한 구간 — 머리글이 되풀이되지 않는다", () => {
    const rows = [
      row("late", 4, "2026-10-20"),
      row("now", 4, "2026-10-23"),
      row("next", 4, "2026-10-30"),
      row("paidOld", 4, "2026-07-31", true),
      row("paidFuture", 4, "2026-11-20", true),
      row("paidToday", 4, "2026-10-22", true),
    ];
    const groups = groupExpenses(rows, { status: "approved", todayKst: "2026-10-22" });
    expect(groups.map((g) => [g.label, g.tone ?? null, g.rows.map((r) => r.id)])).toEqual([
      ["예정일 지남", "warning", ["late"]],
      ["이번 주 지급", null, ["now"]],
      ["다음 주", null, ["next"]],
      ["지급 완료", null, ["paidOld", "paidFuture", "paidToday"]],
    ]);
    const labels = groups.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("전체 보기에서는 지급 끝난 승인 건도 `승인` 그룹 그대로", () => {
    const groups = groupExpenses([row("a1", 4, "2026-10-30"), row("p1", 4, "2026-07-31", true)], { status: "all", todayKst: "2026-10-22" });
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([["승인", 2]]);
  });

  it("월요일이 오늘이면 그날부터 일요일까지가 이번 주다", () => {
    const groups = groupExpenses([row("m", 4, "2026-09-21"), row("s", 4, "2026-09-27")], { status: "approved", todayKst: "2026-09-21" });
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([["이번 주 지급", ["m", "s"]]]);
  });
});

describe("groupExpenses — 순서 보존 · 머리글", () => {
  it("진행 중 보기 — 받은 순서 그대로 작성 중 · 반려 · 회수 · 결재 중 머리글을 붙인다", () => {
    const rows = [row("d2", 1), row("d1", 1), row("r1", 2), row("w1", 2), row("s1", 3)];
    const groups = groupExpenses(rows, { status: "open", todayKst: "2026-09-26" });
    expect(groups.map((g) => g.label)).toEqual(["작성 중", "반려 · 회수", "결재 중"]);
    expect(groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["d2", "d1", "r1", "w1", "s1"]);
  });

  it("받은 행 순서를 바꾸지 않는다 — 같은 그룹이 떨어져 오면 머리글을 따로 붙인다(정렬은 SQL 한 곳)", () => {
    const rows = [row("s1", 3), row("d1", 1), row("s2", 3)];
    const groups = groupExpenses(rows, { status: "open", todayKst: "2026-09-26" });
    expect(groups.map((g) => g.label)).toEqual(["결재 중", "작성 중", "결재 중"]);
    expect(groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["s1", "d1", "s2"]);
  });

  it("쪽 첫 행이 앞 쪽 그룹의 이어짐이어도 첫 머리글을 그 그룹으로 그린다", () => {
    const groups = groupExpenses([row("w1", 2), row("s1", 3)], { status: "open", todayKst: "2026-09-26" });
    expect(groups[0]?.label).toBe("반려 · 회수");
  });

  it("전체 보기 — 승인 행은 날짜 구간 없이 `승인` 한 그룹", () => {
    const rows = [row("d1", 1), row("s1", 3), row("a1", 4, "2026-09-25"), row("a2", 4, "2026-10-30"), row("a3", 4, "2026-11-30")];
    const groups = groupExpenses(rows, { status: "all", todayKst: "2026-09-26" });
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ["작성 중", 1],
      ["결재 중", 1],
      ["승인", 3],
    ]);
  });
});
