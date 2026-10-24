import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { budgetDelta } from "@/domain/projects/budget";

// 07-24 Task 1 (B-P1-5 · D-730) — 자동 예산 줄 = (새 기준 − 사건 전 기준) × 그때 율 ÷ 100. 늘었을 때만 양의 정수, 아니면 null.
describe("budgetDelta", () => {
  it("처음: 0 → 1,000만 · 율 70 → 700만", () => {
    expect(budgetDelta({ prevBasisKrw: 0, newBasisKrw: 10_000_000, costRatePct: 70 })).toBe(7_000_000);
  });

  it("증액분만 그때 율로 — 1,000만 → 1,200만 · 율 75 → 150만(옛 줄을 75로 다시 매기지 않음)", () => {
    expect(budgetDelta({ prevBasisKrw: 10_000_000, newBasisKrw: 12_000_000, costRatePct: 75 })).toBe(1_500_000);
  });

  it("율 70 → 60 · PO 10,000 → 11,000 → +600", () => {
    expect(budgetDelta({ prevBasisKrw: 10_000, newBasisKrw: 11_000, costRatePct: 60 })).toBe(600);
  });

  it("감액은 null(음수 줄 없음 — D-730)", () => {
    expect(budgetDelta({ prevBasisKrw: 10_000_000, newBasisKrw: 9_000_000, costRatePct: 70 })).toBeNull();
  });

  it("같은 기준은 null", () => {
    expect(budgetDelta({ prevBasisKrw: 5_000_000, newBasisKrw: 5_000_000, costRatePct: 70 })).toBeNull();
  });

  it("율 null(미설정)은 null", () => {
    expect(budgetDelta({ prevBasisKrw: 0, newBasisKrw: 10_000_000, costRatePct: null })).toBeNull();
  });

  it("율 0은 null(0 줄 없음)", () => {
    expect(budgetDelta({ prevBasisKrw: 0, newBasisKrw: 10_000_000, costRatePct: 0 })).toBeNull();
  });

  it("율 70.5 · 차이 333 → 234.765 → 반올림 정수 원 235", () => {
    expect(budgetDelta({ prevBasisKrw: 1_000, newBasisKrw: 1_333, costRatePct: 70.5 })).toBe(235);
  });

  it("반올림 결과가 0이면 null — 차이 1 · 율 10 → 0.1 → 0", () => {
    expect(budgetDelta({ prevBasisKrw: 0, newBasisKrw: 1, costRatePct: 10 })).toBeNull();
  });

  it("반은 올림 — 율 0.1 · 차이 500 → 0.5 → 1", () => {
    expect(budgetDelta({ prevBasisKrw: 0, newBasisKrw: 500, costRatePct: 0.1 })).toBe(1);
  });

  it("결과는 늘 양의 정수 또는 null", () => {
    for (const rate of [0, 0.1, 12.5, 33.3, 70, 70.5, 99.9, 100]) {
      for (const diff of [-1_000, 0, 1, 7, 333, 1_234_567, 999_999_999_999]) {
        const result = budgetDelta({ prevBasisKrw: 1_000, newBasisKrw: 1_000 + diff, costRatePct: rate });
        if (result !== null) {
          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBeGreaterThan(0);
        }
      }
    }
  });
});

// B-P3-7 — 설정 계층은 프로젝트 계층을 모른다(처음 원가율 훅은 액션 · 명령 층에서 주입한다).
describe("domain/settings → domain/projects import 금지", () => {
  it("domain/settings 아래 어떤 .ts도 @/domain/projects를 import하지 않는다", () => {
    const dir = join(process.cwd(), "domain/settings");
    const offenders = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => /from\s+["']@\/domain\/projects/.test(readFileSync(join(dir, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
