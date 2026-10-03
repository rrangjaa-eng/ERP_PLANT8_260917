import { describe, expect, it } from "vitest";
import { leaveStatusDisplay, leaveStatusWord, routeListSteps, seoulMinuteOf, withdrawResultLines, type LeaveStatusKey } from "@/app/(app)/leave/status-display";
import { statusKind } from "@/ui/status-tag/status-map";

// 04.6-18: `StatusTag status` 낱말 — 색은 상태 배지 표(`status-map.ts`) 한 곳이 정하고, 화면은 낱말만 넘긴다. 낱말과 옛 {kind, label}이 어긋나지 않는다.
describe("leaveStatusWord", () => {
  const KEYS: LeaveStatusKey[] = ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn", "mine", "waiting", "vacant"];

  it("모든 문서 상태의 낱말이 옛 표시 글자 · 색과 같다", () => {
    for (const key of KEYS) {
      const display = leaveStatusDisplay(key);
      expect(leaveStatusWord(key)).toBe(display.label);
      expect(statusKind(leaveStatusWord(key))).toBe(display.kind);
    }
  });

  it("결재 중은 단계 이름이 붙은 낱말을 받을 수 있다", () => {
    expect(leaveStatusWord("in_review", "팀장")).toBe("팀장 결재 중");
    expect(leaveStatusWord("submitted")).toBe("결재 중");
  });
});

// /review(testing): 결재선 목록 · 회수 결과 줄의 갈래 — `(나)`는 후보가 한 명일 때만, 빈 자리 · 막힘은 `—` + `담당 없음`,
// 자기 승인 건너뜀 자리는 목록에서 빠짐, 회수 둘째 줄, 서울 시각(날짜가 바뀌는 UTC 시각).
describe("routeListSteps", () => {
  it("(나)는 지금 자리의 후보가 보는 사람 한 명일 때만", () => {
    const current = (holderNames: string) => routeListSteps([{ stepIndex: 1, label: "팀장", state: "current", holderNames, viewerHolds: true }]);
    expect(current("김팀장")[0]?.person).toBe("김팀장(나)");
    expect(current("김팀장 · 정팀장")[0]?.person).toBe("김팀장 · 정팀장");
    expect(current("김팀장 외 2명")[0]?.person).toBe("김팀장 외 2명");
    expect(current("김팀장")[0]?.result).toEqual({ text: "내 결재", status: "내 결재" });
  });

  it("빈 자리 · 막힘은 사람 `—` · `담당 없음`, 자기 승인 건너뜀은 빠진다", () => {
    const rows = routeListSteps([
      { stepIndex: 1, label: "팀장", state: "empty" },
      { stepIndex: 2, label: "본부 책임자", state: "skipped_self" },
      { stepIndex: 3, label: "대표", state: "blocked" },
    ]);
    expect(rows.map((row) => [row.label, row.person, row.result.text])).toEqual([
      ["팀장", "—", "담당 없음"],
      ["대표", "—", "담당 없음"],
    ]);
  });

  it("반려 자리는 처리한 사람 · 서울 시각 · 사유, 대기 자리는 `대기`", () => {
    const rows = routeListSteps([
      { stepIndex: 1, label: "팀장", state: "rejected", actedByName: "김팀장", actedAt: new Date("2026-09-18T05:02:00Z"), reason: "일정 겹침" },
      { stepIndex: 2, label: "대표", state: "pending", holderNames: "최대표" },
    ]);
    expect(rows[0]).toMatchObject({ person: "김팀장", at: "09-18 14:02", reason: "일정 겹침" });
    expect(rows[1]).toMatchObject({ person: "최대표", result: { text: "대기", status: "대기" }, reason: null });
  });
});

describe("withdrawResultLines", () => {
  it("지금 담당이 있으면 첫 줄에 이름, 승인한 단계가 있으면 둘째 줄", () => {
    expect(
      withdrawResultLines([
        { state: "approved", label: "팀장" },
        { state: "current", label: "대표", holderNames: "최대표" },
      ]),
    ).toEqual(["결재 멈춤 · 최대표의 결재함에서 빠짐", "팀장 승인 기록은 남음"]);
  });

  it("지금 담당 · 승인 기록이 없으면 `결재 멈춤` 한 줄", () => {
    expect(withdrawResultLines([])).toEqual(["결재 멈춤"]);
    expect(withdrawResultLines(null)).toEqual(["결재 멈춤"]);
  });
});

describe("seoulMinuteOf", () => {
  it("UTC 12-31 15:30은 서울 01-01 00:30", () => {
    expect(seoulMinuteOf(new Date("2026-12-31T15:30:00Z"))).toBe("01-01 00:30");
  });
});
