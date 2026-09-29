import { describe, expect, it } from "vitest";
import { runningBalance, type BalanceRow } from "@/domain/reserves";
import { toKrw } from "@/domain/money";

// 04-07 Task 2 — 리저브 잔액 결정표. 판정은 날짜마다 그날 마감 잔액 < 0 하나(사용자 D19-2), 누적은 원화 환산액(사용자
// D19-1). 셋이 잘못된 구현을 잡는다: 중간 날짜 음수(「마지막 잔액만 보는」) · 같은 날 출금이 먼저 적힘(「줄마다 보는」) ·
// 외화 원화 누적(「외화 금액끼리 더하는」).
const T0 = new Date("2026-01-01T00:00:00Z");

function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function row(partial: Partial<BalanceRow> & Pick<BalanceRow, "id" | "entryDate" | "direction" | "amountKrw">): BalanceRow {
  return { clientId: "client-a", createdAt: T0, ...partial };
}

describe("runningBalance — 날짜 마감 잔액 판정", () => {
  it("입금 1,000,000 · 출금 300,000 → 줄 잔액 1,000,000 → 700,000, 음수 없음", () => {
    const result = runningBalance([
      row({ id: "d1", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1_000_000 }),
      row({ id: "w1", entryDate: "2026-03-05", direction: "withdrawal", amountKrw: 300_000 }),
    ]);
    expect(result.rows.map((r) => [r.id, r.balanceKrw])).toEqual([
      ["d1", 1_000_000],
      ["w1", 700_000],
    ]);
    expect(result.firstNegative).toBeNull();
  });

  it("중간 날짜에서만 음수 — 3월 입금 1,000,000 · 1월 출금 800,000 → 1월 마감 −800,000(마지막 잔액 200,000이어도 거부)", () => {
    const result = runningBalance([
      row({ id: "d1", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1_000_000 }),
      row({ id: "w1", entryDate: "2026-01-15", direction: "withdrawal", amountKrw: 800_000 }),
    ]);
    expect(result.firstNegative).toEqual({ clientId: "client-a", date: "2026-01-15", balanceKrw: -800_000, lastRowId: "w1" });
    expect(result.rows.at(-1)?.balanceKrw).toBe(200_000);
  });

  it("같은 날 출금 500,000을 입금 1,000,000보다 먼저 적어도(created_at 앞섬) 그날 마감 500,000이라 통과, 표시 순서는 입금 → 출금", () => {
    const result = runningBalance([
      row({ id: "w1", entryDate: "2026-03-01", direction: "withdrawal", amountKrw: 500_000, createdAt: at(0) }),
      row({ id: "d1", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1_000_000, createdAt: at(5) }),
    ]);
    expect(result.firstNegative).toBeNull();
    expect(result.rows.map((r) => [r.id, r.balanceKrw])).toEqual([
      ["d1", 1_000_000],
      ["w1", 500_000],
    ]);
    expect(result.closingByDate).toEqual([{ clientId: "client-a", date: "2026-03-01", balanceKrw: 500_000, lastRowId: "w1" }]);
  });

  it("같은 날 입금 100,000 · 출금 300,000 → 그날 마감 −200,000, 오류 줄은 그 날짜의 마지막 줄", () => {
    const result = runningBalance([
      row({ id: "d1", entryDate: "2026-03-01", direction: "deposit", amountKrw: 100_000 }),
      row({ id: "w1", entryDate: "2026-03-01", direction: "withdrawal", amountKrw: 300_000 }),
    ]);
    expect(result.firstNegative).toEqual({ clientId: "client-a", date: "2026-03-01", balanceKrw: -200_000, lastRowId: "w1" });
  });

  it("같은 날짜·같은 구분 두 줄은 created_at → id 순(created_at이 같으면 id)", () => {
    const result = runningBalance([
      row({ id: "b", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1, createdAt: at(1) }),
      row({ id: "c", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1, createdAt: at(0) }),
      row({ id: "a", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1, createdAt: at(1) }),
    ]);
    expect(result.rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("외화 줄은 원화 환산액으로 누적 — USD 1,000 @1,300 입금 뒤 USD 1,000 @1,400 출금 → −100,000 음수", () => {
    const result = runningBalance([
      row({ id: "d1", entryDate: "2026-03-01", direction: "deposit", amountKrw: toKrw({ currency: "USD", amount: 1_000, fxRate: 1_300 }) }),
      row({ id: "w1", entryDate: "2026-03-02", direction: "withdrawal", amountKrw: toKrw({ currency: "USD", amount: 1_000, fxRate: 1_400 }) }),
    ]);
    expect(result.firstNegative).toEqual({ clientId: "client-a", date: "2026-03-02", balanceKrw: -100_000, lastRowId: "w1" });
  });

  it("클라이언트가 다르면 섞이지 않는다 — B의 출금이 A의 입금으로 메워지지 않는다", () => {
    const result = runningBalance([
      row({ id: "a-d", clientId: "client-a", entryDate: "2026-03-01", direction: "deposit", amountKrw: 1_000_000 }),
      row({ id: "b-w", clientId: "client-b", entryDate: "2026-03-02", direction: "withdrawal", amountKrw: 10_000 }),
    ]);
    expect(result.rows.find((r) => r.id === "a-d")?.balanceKrw).toBe(1_000_000);
    expect(result.firstNegative).toEqual({ clientId: "client-b", date: "2026-03-02", balanceKrw: -10_000, lastRowId: "b-w" });
  });
});
