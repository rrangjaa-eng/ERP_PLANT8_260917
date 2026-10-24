import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 10/24 카드 결정 — 예산 이력 패널 라벨은 「현재 예산」, PO 없는 행의 PO 금액 칸은 「—」(Num 도우미). 렌더 러너가 없어 소스 검사(budget-loading-columns.test.ts와 같은 방식).
const DIR = resolve(process.cwd(), "app/(app)/projects/budget");

describe("예산 현황 문구 (10/24 카드)", () => {
  it("이력 패널 라벨이 「현재 예산」이고 산식 문구가 없다", () => {
    const panel = readFileSync(resolve(DIR, "budget-history-panel.tsx"), "utf8");
    expect(panel).toContain('FORMULA_LABEL = "현재 예산"');
    expect(panel).not.toContain("PO 금액 × 원가율");
  });

  it("PO 금액 0은 「PO 없음」 대신 Num의 빈 값 「—」로 그린다", () => {
    const table = readFileSync(resolve(DIR, "budget-table.tsx"), "utf8");
    expect(table).not.toContain("PO 없음");
    expect(table).toContain("row.poAmountKrw === 0 ? null : row.poAmountKrw");
  });
});
