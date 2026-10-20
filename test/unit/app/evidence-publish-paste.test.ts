import { describe, expect, it } from "vitest";
import type { PasteCell } from "@/ui/table/use-clipboard-paste";
import { resolvePublishPaste, type PublishPasteRow } from "@/app/(app)/expenses/evidence/publish-paste";

// 06.1-13(SP-6104 · G-2) — 증빙 목록 공개 칸 붙여넣기 대조. 줄 선택지는 06.1-05 공개 select가 넘기는 목록 그대로이고(제안 팀 · 설정 본부 ·
// 미공개 · 묶음 「다른 팀」의 보관 아닌 팀), 함수는 라벨 글자로만 맞춘다 — 본부 이름 · 팀 목록을 스스로 짓지 않는다(C3 · E20).

const TEAM_1 = "11111111-1111-4111-8111-111111111111";
const TEAM_2 = "22222222-2222-4222-8222-222222222222";
const TEAM_3 = "33333333-3333-4333-8333-333333333333";

/** 06.1-05 choicesFor 꼴 — 제안 팀(있으면) · `{설정 본부} 공개` · `미공개` · 다른 팀(보관 아닌 팀만, 제안 팀 제외). */
function row(opts: { proposalTeam?: { id: string; name: string }; division?: string; locked?: boolean } = {}): PublishPasteRow {
  const division = opts.division ?? "기획본부";
  const teams = [
    { id: TEAM_1, name: "기획1팀" },
    { id: TEAM_2, name: "기획2팀" },
    { id: TEAM_3, name: "디자인팀" },
  ];
  return {
    locked: opts.locked ?? false,
    choices: [
      ...(opts.proposalTeam ? [{ label: `${opts.proposalTeam.name} 공개`, value: { visibility: "team" as const, teamId: opts.proposalTeam.id } }] : []),
      { label: `${division} 공개`, value: { visibility: "division" as const } },
      { label: "미공개", value: { visibility: "private" as const } },
      ...teams.filter((team) => team.id !== opts.proposalTeam?.id).map((team) => ({ label: `${team.name} 공개`, value: { visibility: "team" as const, teamId: team.id } })),
    ],
  };
}

/** applyPaste가 공개 칸을 문자 열(`kind: "text"`)로 펼친 결과 꼴 — 값은 앞뒤 공백을 지운 글자. */
function cells(values: readonly string[], startRow = 0): PasteCell[] {
  return values.map((value, offset) => ({ rowIndex: startRow + offset, columnKey: "visibility", result: { status: "ok", value: value.trim() } }));
}

describe("resolvePublishPaste — 라벨 글자 대조", () => {
  it("그 줄 선택지 라벨과 같은 글자는 그 값이다(미공개 · 본부 · 제안 팀)", () => {
    const result = resolvePublishPaste({
      cells: cells(["미공개", "기획본부 공개", "기획1팀 공개"]),
      rows: [row(), row(), row({ proposalTeam: { id: TEAM_1, name: "기획1팀" } })],
    });
    expect(result.values).toEqual([
      { rowIndex: 0, value: { visibility: "private" } },
      { rowIndex: 1, value: { visibility: "division" } },
      { rowIndex: 2, value: { visibility: "team", teamId: TEAM_1 } },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ unknown: 0, skippedLocked: 0, droppedBelow: 0 });
  });

  it("앞뒤 공백은 무시한다", () => {
    const result = resolvePublishPaste({ cells: [{ rowIndex: 0, columnKey: "visibility", result: { status: "ok", value: "  미공개 " } }], rows: [row()] });
    expect(result.values).toEqual([{ rowIndex: 0, value: { visibility: "private" } }]);
  });

  it("설정 본부를 디자인본부로 둔 선택지 — `디자인본부 공개`는 division, `기획본부 공개`는 오류(본부 글자를 함수가 박지 않는다 · C3)", () => {
    const result = resolvePublishPaste({ cells: cells(["디자인본부 공개", "기획본부 공개"]), rows: [row({ division: "디자인본부" }), row({ division: "디자인본부" })] });
    expect(result.values).toEqual([{ rowIndex: 0, value: { visibility: "division" } }]);
    expect(result.errors).toEqual([{ rowIndex: 1, reason: "목록에 없는 값 · 기획본부 공개" }]);
    expect(result.counts.unknown).toBe(1);
  });

  it("제안이 기획1팀인 줄에 `기획2팀 공개`(보관 아닌 다른 팀) → 그 팀(E20)", () => {
    const result = resolvePublishPaste({ cells: cells(["기획2팀 공개"]), rows: [row({ proposalTeam: { id: TEAM_1, name: "기획1팀" } })] });
    expect(result.values).toEqual([{ rowIndex: 0, value: { visibility: "team", teamId: TEAM_2 } }]);
  });

  it("보관된 팀 이름 `기획8팀 공개`(선택지에 없음)는 오류 셀이고 값이 되지 않는다", () => {
    const result = resolvePublishPaste({ cells: cells(["기획8팀 공개"]), rows: [row()] });
    expect(result.values).toEqual([]);
    expect(result.errors).toEqual([{ rowIndex: 0, reason: "목록에 없는 값 · 기획8팀 공개" }]);
    expect(result.counts).toEqual({ unknown: 1, skippedLocked: 0, droppedBelow: 0 });
  });

  it("빈 칸은 오류 `목록에 없는 값 · (빈 값)`", () => {
    const result = resolvePublishPaste({ cells: cells([""]), rows: [row()] });
    expect(result.errors).toEqual([{ rowIndex: 0, reason: "목록에 없는 값 · (빈 값)" }]);
  });

  it("잠긴 줄은 오류가 아니라 건너뜀으로 센다", () => {
    const result = resolvePublishPaste({ cells: cells(["미공개"]), rows: [row({ locked: true })] });
    expect(result.values).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ unknown: 0, skippedLocked: 1, droppedBelow: 0 });
  });
});

describe("resolvePublishPaste — 섞인 붙여넣기(Task 2)", () => {
  it("다른 팀 · 보관 팀 · 모르는 글자 · 빈 칸이 섞인 다섯 줄 → 다른 팀은 그 팀, 오류 셋 · unknown 3", () => {
    const result = resolvePublishPaste({
      cells: cells(["기획2팀 공개", "기획8팀 공개", "없는값", "", "미공개"]),
      rows: [row({ proposalTeam: { id: TEAM_1, name: "기획1팀" } }), row(), row(), row(), row()],
    });
    expect(result.values).toEqual([
      { rowIndex: 0, value: { visibility: "team", teamId: TEAM_2 } },
      { rowIndex: 4, value: { visibility: "private" } },
    ]);
    expect(result.errors).toEqual([
      { rowIndex: 1, reason: "목록에 없는 값 · 기획8팀 공개" },
      { rowIndex: 2, reason: "목록에 없는 값 · 없는값" },
      { rowIndex: 3, reason: "목록에 없는 값 · (빈 값)" },
    ]);
    expect(result.counts.unknown).toBe(3);
  });

  it("잠긴 줄 둘 → skippedLocked 2 · 그 줄은 값도 오류도 없다(값 그대로)", () => {
    const result = resolvePublishPaste({
      cells: cells(["미공개", "없는값", "기획본부 공개", "미공개"]),
      rows: [row(), row({ locked: true }), row({ locked: true }), row()],
    });
    expect(result.values.map((value) => value.rowIndex)).toEqual([0, 3]);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ unknown: 0, skippedLocked: 2, droppedBelow: 0 });
  });

  it("붙여넣기 범위가 표 아래를 넘으면 넘친 줄은 버리고 그 줄 수를 센다(새 줄 없음 · 조용히 버리지 않는다 — §7-3)", () => {
    const result = resolvePublishPaste({ cells: cells(["미공개", "없는값", "없는값"], 1), rows: [row(), row()] });
    expect(result.values).toEqual([{ rowIndex: 1, value: { visibility: "private" } }]);
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual({ unknown: 0, skippedLocked: 0, droppedBelow: 2 });
  });

  it("같은 라벨이 둘 이상이면 고르지 않고 오류 셀 `같은 이름 여럿 · 목록에서 고르기`(공유 applyPaste select 갈래와 같은 글자)", () => {
    const twin: PublishPasteRow = {
      locked: false,
      choices: [
        { label: "경영 공개", value: { visibility: "division" } },
        { label: "경영 공개", value: { visibility: "team", teamId: TEAM_1 } },
        { label: "미공개", value: { visibility: "private" } },
      ],
    };
    const result = resolvePublishPaste({ cells: cells(["경영 공개", "미공개"]), rows: [twin, twin] });
    expect(result.values).toEqual([{ rowIndex: 1, value: { visibility: "private" } }]);
    expect(result.errors).toEqual([{ rowIndex: 0, reason: "같은 이름 여럿 · 목록에서 고르기" }]);
    expect(result.counts).toEqual({ unknown: 0, skippedLocked: 0, droppedBelow: 0 });
  });
});
