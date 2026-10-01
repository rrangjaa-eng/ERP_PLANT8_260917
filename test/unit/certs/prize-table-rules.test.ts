import { describe, expect, it } from "vitest";
import {
  ALREADY_GENERATED_TEXT,
  dirtyCellCount,
  generateOutcome,
  mergeConflict,
  resolveConflict,
  withServerLocks,
  prizeChangesBody,
  saveOutcome,
  saveResultText,
  submitCellPreview,
  submitCellText,
  type DraftPrizeRow,
} from "@/app/(app)/certs/events/[id]/prize-table-rules";

// 04.3-10 Task 2 — I′3 경품 편집 표 순수 판정: dirty N(§7-3 (사) — 화면 전체 dirty 칸 수) · 요청 본문(바뀐 칸만 · 새 줄 전 칸) ·
// 제출 셀 미리 보기(편집 중 가액 — 판정은 저장 때 서버, G0 DR-2 · T4) · 저장 결과 갈래(G10 a).

const saved: DraftPrizeRow[] = [
  { key: "p1", id: "p1", version: 3, name: "갤럭시 탭 S10", unitValue: "1,290,000", delivery: "현장", winnerCount: "3" },
  { key: "p2", id: "p2", version: 1, name: "다이슨 에어랩", unitValue: "599,000", delivery: "택배", winnerCount: "2" },
];

describe("prizeChangesBody · dirtyCellCount", () => {
  it("고친 칸이 없으면 빈 본문 · N 0(쉼표 · 앞뒤 공백만 다른 값은 같은 값)", () => {
    const current = saved.map((row) => ({ ...row, unitValue: row.unitValue.replace(/,/g, ""), name: ` ${row.name} ` }));
    const body = prizeChangesBody(saved, current, []);
    expect(body).toEqual({ updates: [], inserts: [], deletes: [] });
    expect(dirtyCellCount(body)).toBe(0);
  });

  it("저장된 줄은 바뀐 칸만 · 새 줄은 전 칸 · 지운 줄은 id · version — N은 바뀐 칸 수 + 새 줄의 기본값과 다른 칸 + 지운 줄", () => {
    const current: DraftPrizeRow[] = [
      { ...saved[0]!, unitValue: "49,000", winnerCount: "4" },
      { key: "n1", name: "스타벅스 카드", unitValue: "30,000", delivery: "현장", winnerCount: "1" },
    ];
    const body = prizeChangesBody(saved, current, [{ id: "p2", version: 1 }]);
    expect(body).toEqual({
      updates: [{ id: "p1", version: 3, unitValue: "49,000", winnerCount: "4" }],
      inserts: [{ key: "n1", name: "스타벅스 카드", unitValue: "30,000", delivery: "현장", winnerCount: "1" }],
      deletes: [{ id: "p2", version: 1 }],
    });
    // 바뀐 칸 2 + 새 줄(경품명 · 가액이 기본값과 다름) 2 + 지운 줄 1
    expect(dirtyCellCount(body)).toBe(5);
  });

  it("방금 만든 빈 새 줄도 1로 센다(저장할 것이 생겼다)", () => {
    const body = prizeChangesBody([], [{ key: "n1", name: "", unitValue: "", delivery: "현장", winnerCount: "1" }], []);
    expect(dirtyCellCount(body)).toBe(1);
  });
});

describe("submitCellPreview — 편집 중 가액으로 제출 셀(한 칸에 하나 — T4 우선순위, 미제출은 04.3-17)", () => {
  const counts = [
    { quantity: 1, count: 1 },
    { quantity: 2, count: 1 },
  ];

  it("49,000 · 제출 0 → 확인증 없음", () => {
    expect(submitCellPreview({ unitValue: "49,000", submittedCount: 0, quantityCounts: [] })).toEqual({ kind: "noCert" });
  });

  it("49,000 · 수량 1 제출 1 → 1 · 파기 대상 1", () => {
    const cell = submitCellPreview({ unitValue: "49,000", submittedCount: 1, quantityCounts: [{ quantity: 1, count: 1 }] });
    expect(cell).toEqual({ kind: "purge", n: 1, p: 1 });
    expect(submitCellText(cell)).toBe("1 · 파기 대상 1");
  });

  it("30,000 · 수량 1 · 2 제출 → 수량 1 하나만 파기 대상(30,000 × 2 = 60,000은 아님)", () => {
    expect(submitCellPreview({ unitValue: "30,000", submittedCount: 2, quantityCounts: counts })).toEqual({ kind: "purge", n: 2, p: 1 });
  });

  it("다시 73,519로 올리면 숫자만 — 표시가 사라진다(N10 a)", () => {
    const cell = submitCellPreview({ unitValue: "73,519", submittedCount: 2, quantityCounts: counts });
    expect(cell).toEqual({ kind: "count", n: 2 });
    expect(submitCellText(cell)).toBe("2");
  });

  it("편집 중 값이 금액이 아니면 저장된 가액으로 판정한다", () => {
    expect(submitCellPreview({ unitValue: "abc", savedUnitValueKrw: 40_000, submittedCount: 0, quantityCounts: [] })).toEqual({ kind: "noCert" });
    expect(submitCellPreview({ unitValue: "abc", submittedCount: 0, quantityCounts: [] })).toEqual({ kind: "count", n: 0 });
    expect(submitCellText({ kind: "noCert" })).toBe("확인증 없음");
  });
});

describe("saveOutcome · saveResultText — 저장 결과 갈래(G10 a — 사실만, 「다시 시도」 없음)", () => {
  const at = new Date("2026-10-01T05:02:00Z"); // 14:02 KST

  it("saved → 저장됨 N줄 HH:mm", () => {
    const outcome = saveOutcome({ data: { kind: "saved", rows: 2, prizes: [] } });
    expect(outcome).toEqual({ kind: "saved", rows: 2 });
    expect(saveResultText(outcome, at)).toBe("저장됨 2줄 14:02");
  });

  it("forbidden(serverError 권한 없음) · notFound → 사실만", () => {
    const forbidden = saveOutcome({ serverError: "권한 없음" });
    expect(forbidden).toEqual({ kind: "forbidden" });
    expect(saveResultText(forbidden, at)).toBe("저장 안 됨 · 권한 없음");
    expect(saveResultText(saveOutcome({ data: { kind: "notFound" } }), at)).toBe("저장 안 됨 · 없는 행사");
  });

  it("invalid · readOnly · conflict 갈래", () => {
    expect(saveOutcome({ data: { kind: "invalid", cellErrors: [{ rowKey: "p1", column: "name", code: "required" }] } })).toEqual({
      kind: "invalid",
      cellErrors: [{ rowKey: "p1", column: "name", code: "required" }],
    });
    expect(saveOutcome({ data: { kind: "readOnly" } })).toEqual({ kind: "readOnly" });
    expect(saveOutcome({ data: { kind: "conflict", prizes: [{ id: "p1" }] } })).toEqual({ kind: "conflict", prizes: [{ id: "p1" }] });
    expect(saveResultText({ kind: "readOnly" }, at)).toBe("제출 있음 · 가액 · 당첨 수만 고침");
  });

  it("연결 끊김 · 모르는 serverError · 모르는 모양 → 결과 불명(같은 본문으로 다시)", () => {
    for (const response of ["unreachable", { serverError: "x" }, { data: { kind: "weird" } }, undefined]) {
      expect(saveOutcome(response)).toEqual({ kind: "failed" });
    }
    expect(saveResultText({ kind: "failed" }, at)).toBe("저장 결과 모름 · 다시 누르기");
  });
});

// 04.3-10 독립 검토 W2 · W3 · W4 — 충돌 셀(§7-3 (나): 실제로 달라진 칸만 · 값 · 사람 · 시각) · 서버에만 있는 줄 합치기 ·
// 서버가 지운 줄 · 잠김 갱신 · 「QR 생성」 충돌 · 이미 생성 갈래.
describe("mergeConflict · resolveConflict — 버전 충돌(§7-3 (나))", () => {
  type R = DraftPrizeRow & { locked: boolean };
  const base: R[] = [
    { key: "p1", id: "p1", version: 3, name: "갤럭시 탭 S10", unitValue: "1,290,000", delivery: "현장", winnerCount: "3", locked: false },
    { key: "p2", id: "p2", version: 1, name: "다이슨 에어랩", unitValue: "599,000", delivery: "택배", winnerCount: "2", locked: false },
    { key: "p3", id: "p3", version: 1, name: "스타벅스 카드", unitValue: "60,000", delivery: "현장", winnerCount: "5", locked: false },
  ];
  const at = "2026-10-01T05:01:00.000Z"; // 14:01 KST

  it("버전이 다른 줄은 실제로 달라진 칸만 고정하고 이유에 사람 · 시각 · 값을 적는다", () => {
    const mine = base.map((row) => (row.key === "p1" ? { ...row, name: "갤럭시 탭 S10 울트라" } : row));
    const result = mergeConflict({
      saved: base,
      rows: mine,
      deleted: [],
      server: [
        { row: { ...base[0]!, version: 4, unitValue: "9,800,000", delivery: "택배" }, updatedAt: at, updatedByName: "이수아" },
        { row: base[1]!, updatedAt: at, updatedByName: "이수아" },
        { row: base[2]!, updatedAt: at, updatedByName: null },
      ],
    });
    expect(Object.keys(result.conflicts)).toEqual(["p1"]);
    expect(result.conflicts.p1?.cells).toEqual({
      unitValue: "이수아가 14:01에 9,800,000으로 바꿈 · 덮어쓰기 / 그 값으로",
      delivery: "이수아가 14:01에 택배로 바꿈 · 덮어쓰기 / 그 값으로",
    });
    // 내 편집은 그대로 남는다.
    expect(result.rows.find((row) => row.key === "p1")?.name).toBe("갤럭시 탭 S10 울트라");
  });

  it("바꾼 사람 이름이 없으면 「다른 사람이」 · 받침 있는 이름은 「이」", () => {
    const result = mergeConflict({
      saved: base,
      rows: base,
      deleted: [],
      server: [
        { row: { ...base[0]!, version: 4, winnerCount: "4" }, updatedAt: at, updatedByName: null },
        { row: { ...base[1]!, version: 2, name: "다이슨" }, updatedAt: at, updatedByName: "박서연" },
        { row: base[2]!, updatedAt: at, updatedByName: null },
      ],
    });
    expect(result.conflicts.p1?.cells).toEqual({ winnerCount: "다른 사람이 14:01에 4로 바꿈 · 덮어쓰기 / 그 값으로" });
    expect(result.conflicts.p2?.cells).toEqual({ name: "박서연이 14:01에 다이슨으로 바꿈 · 덮어쓰기 / 그 값으로" });
  });

  it("서버에만 있는 줄(다른 사람이 더한 줄)은 충돌이 아니라 표와 기준에 더한다", () => {
    const added: R = { key: "p9", id: "p9", version: 1, name: "에어팟", unitValue: "359,000", delivery: "택배", winnerCount: "1", locked: false };
    const result = mergeConflict({
      saved: base,
      rows: base,
      deleted: [],
      server: [...base.map((row) => ({ row, updatedAt: at, updatedByName: null })), { row: added, updatedAt: at, updatedByName: "이수아" }],
    });
    expect(result.conflicts).toEqual({});
    expect(result.rows.map((row) => row.key)).toEqual(["p1", "p2", "p3", "p9"]);
    expect(result.saved.map((row) => row.key)).toEqual(["p1", "p2", "p3", "p9"]);
  });

  it("내가 지운 줄을 다른 사람이 바꿨으면 그 줄을 서버 값으로 되살려 고정 — 덮어쓰기는 새 버전으로 다시 지우기 · 그 값으로는 남기기", () => {
    const result = mergeConflict({
      saved: base,
      rows: base.filter((row) => row.key !== "p3"),
      deleted: [{ id: "p3", version: 1 }],
      server: [
        { row: base[0]!, updatedAt: at, updatedByName: null },
        { row: base[1]!, updatedAt: at, updatedByName: null },
        { row: { ...base[2]!, version: 2, unitValue: "70,000" }, updatedAt: at, updatedByName: "이수아" },
      ],
    });
    expect(result.deleted).toEqual([]);
    expect(result.rows.find((row) => row.key === "p3")?.unitValue).toBe("70,000");
    expect(result.conflicts.p3?.cells).toEqual({ unitValue: "이수아가 14:01에 70,000으로 바꿈 · 덮어쓰기 / 그 값으로" });

    const mineWins = resolveConflict(result, "p3", "mine");
    expect(mineWins.rows.some((row) => row.key === "p3")).toBe(false);
    expect(mineWins.deleted).toEqual([{ id: "p3", version: 2 }]);
    expect(mineWins.conflicts).toEqual({});

    const theirsWins = resolveConflict(result, "p3", "theirs");
    expect(theirsWins.rows.find((row) => row.key === "p3")?.unitValue).toBe("70,000");
    expect(theirsWins.saved.find((row) => row.key === "p3")?.version).toBe(2);
    expect(theirsWins.deleted).toEqual([]);
  });

  it("내가 고친 줄을 서버가 지웠으면 그 줄을 고정 — 덮어쓰기는 새 줄로 · 그 값으로는 빼기. 안 고친 줄은 조용히 뺀다", () => {
    const mine = base.map((row) => (row.key === "p2" ? { ...row, unitValue: "650,000" } : row));
    const result = mergeConflict({
      saved: base,
      rows: mine,
      deleted: [],
      server: [{ row: base[0]!, updatedAt: at, updatedByName: null }],
    });
    expect(result.rows.map((row) => row.key)).toEqual(["p1", "p2"]);
    expect(result.conflicts.p2?.cells).toEqual({ name: "다른 사람이 지움 · 덮어쓰기 / 그 값으로" });

    const keep = resolveConflict(result, "p2", "mine");
    const kept = keep.rows.find((row) => row.key === "p2");
    expect(kept?.id).toBeUndefined();
    expect(kept?.version).toBeUndefined();
    expect(kept?.unitValue).toBe("650,000");
    expect(keep.saved.some((row) => row.key === "p2")).toBe(false);

    const drop = resolveConflict(result, "p2", "theirs");
    expect(drop.rows.map((row) => row.key)).toEqual(["p1"]);
  });

  it("덮어쓰기(내 값) — 기준만 서버 버전으로, 그 값으로 — 표도 서버 값으로", () => {
    const mine = base.map((row) => (row.key === "p1" ? { ...row, unitValue: "1,300,000" } : row));
    const server = { ...base[0]!, version: 4, unitValue: "9,800,000" };
    const result = mergeConflict({
      saved: base,
      rows: mine,
      deleted: [],
      server: [{ row: server, updatedAt: at, updatedByName: null }, ...base.slice(1).map((row) => ({ row, updatedAt: at, updatedByName: null }))],
    });
    const mineWins = resolveConflict(result, "p1", "mine");
    expect(mineWins.saved.find((row) => row.key === "p1")?.version).toBe(4);
    expect(mineWins.rows.find((row) => row.key === "p1")?.unitValue).toBe("1,300,000");
    const theirsWins = resolveConflict(result, "p1", "theirs");
    expect(theirsWins.rows.find((row) => row.key === "p1")?.unitValue).toBe("9,800,000");
  });
});

describe("withServerLocks — 「일괄 저장」 readOnly 뒤 잠김 갱신(W4 ⓐ)", () => {
  it("서버 줄의 locked를 표 줄에 옮긴다(값은 그대로)", () => {
    const rows = [
      { key: "p1", id: "p1", version: 1, name: "a", unitValue: "60,000", delivery: "현장", winnerCount: "1", locked: false, submittedCount: 0 },
      { key: "n1", name: "b", unitValue: "70,000", delivery: "현장", winnerCount: "1", locked: false, submittedCount: 0 },
    ];
    const next = withServerLocks(rows, [{ id: "p1", locked: true, submittedCount: 1 }]);
    expect(next[0]).toMatchObject({ locked: true, submittedCount: 1, unitValue: "60,000" });
    expect(next[1]).toEqual(rows[1]);
  });

  it("saveOutcome readOnly는 서버의 지금 경품 줄을 싣는다", () => {
    expect(saveOutcome({ data: { kind: "readOnly", prizes: [{ id: "p1", locked: true }] } })).toEqual({
      kind: "readOnly",
      prizes: [{ id: "p1", locked: true }],
    });
  });
});

describe("generateOutcome — 「QR 생성」 충돌 · 이미 생성(W3)", () => {
  it("conflict는 서버 경품 줄을 싣는다(결과 불명이 아니다)", () => {
    expect(generateOutcome({ data: { kind: "conflict", prizes: [{ id: "p1", version: 2 }] } })).toEqual({
      kind: "conflict",
      prizes: [{ id: "p1", version: 2 }],
    });
  });

  it("alreadyGenerated는 성공이 아니라 사실 한 줄", () => {
    expect(generateOutcome({ data: { kind: "alreadyGenerated" } })).toEqual({ kind: "alreadyGenerated" });
    expect(ALREADY_GENERATED_TEXT).toBe("다른 사람이 먼저 QR 생성 · 표 편집 저장 안 됨");
  });
});
