import { describe, expect, it } from "vitest";
import { profitCells } from "@/app/print/settlements/[id]/profit-cells";

// 07.4-03 D-7402 · 디자인 검토 B3: 정산서 손익 네 칸 값 글자 — 계산 불가는 「계산 불가 · {이유}」(note 칸), 「—」는 값 없음에만.
describe("profitCells", () => {
  it("ok면 네 칸이 매출 기준 · 확정 실행가 · 수익금 · 수익률 순서이고 note 칸이 없다", () => {
    expect(profitCells({ kind: "ok", basisKrw: 1_000_000, profitKrw: 300_000, ratePct: 30 }, 700_000)).toEqual([
      { label: "매출 기준", text: "1,000,000", note: false },
      { label: "확정 실행가", text: "700,000", note: false },
      { label: "수익금", text: "300,000", note: false },
      { label: "수익률", text: "30.0%", note: false },
    ]);
  });

  it("수익금이 음수면 하이픈 마이너스다", () => {
    const cells = profitCells({ kind: "ok", basisKrw: 1_000_000, profitKrw: -200_000, ratePct: -20 }, 1_200_000);
    expect(cells.map((cell) => cell.text)).toEqual(["1,000,000", "1,200,000", "-200,000", "-20.0%"]);
  });

  it("견적 없음이면 매출 기준 「0」 · 실행가 그대로 · 수익금 · 수익률은 「계산 불가 · 견적 없음」(note)", () => {
    expect(profitCells({ kind: "unavailable", basisKrw: 0, reason: "견적 없음" }, 0)).toEqual([
      { label: "매출 기준", text: "0", note: false },
      { label: "확정 실행가", text: "0", note: false },
      { label: "수익금", text: "계산 불가 · 견적 없음", note: true },
      { label: "수익률", text: "계산 불가 · 견적 없음", note: true },
    ]);
  });

  it("발행액 없음이면 같은 꼴로 「계산 불가 · 발행액 없음」", () => {
    const cells = profitCells({ kind: "unavailable", basisKrw: 0, reason: "발행액 없음" }, 400_000);
    expect(cells.map((cell) => cell.text)).toEqual(["0", "400,000", "계산 불가 · 발행액 없음", "계산 불가 · 발행액 없음"]);
    expect(cells.map((cell) => cell.note)).toEqual([false, false, true, true]);
  });

  it("어느 경우에도 칸 값이 「—」가 아니다", () => {
    const all = [
      ...profitCells({ kind: "ok", basisKrw: 1_000_000, profitKrw: 0, ratePct: 0 }, 1_000_000),
      ...profitCells({ kind: "unavailable", basisKrw: 0, reason: "견적 없음" }, 0),
      ...profitCells({ kind: "unavailable", basisKrw: -5, reason: "견적 없음" }, 5),
    ];
    expect(all.filter((cell) => cell.text === "—")).toEqual([]);
  });
});
