import { describe, expect, it } from "vitest";
import {
  dirtyCellCount,
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
