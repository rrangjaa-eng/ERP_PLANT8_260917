import { describe, expect, it } from "vitest";
import { validatePreEstimateChange } from "@/domain/projects/pre-estimate";

// 04-44(DR-28 · DR-37 · 계약 8 · S17) — 상세 총 매출 예상가 칸의 검증 결정표. 화면(칸 아래 Form.Error)과
// 서버(합성 저장)가 같은 함수를 부른다. 문구는 UI-SPEC rev 5 Copywriting `Error — 총 매출 예상가 칸` 원문이다.
describe("validatePreEstimateChange — 결정표", () => {
  it("KRW 50,000,000 → 오류 없음", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: 50_000_000, fxRate: 1 })).toEqual([]);
  });

  it("0은 오류가 아니다(저장된 0 = 미입력)", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: 0, fxRate: 1 })).toEqual([]);
  });

  it("음수 금액 → 금액 칸 「총 매출 예상가는 0 이상」", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: -1, fxRate: 1 })).toEqual([
      { field: "amount", reason: "총 매출 예상가는 0 이상 · 금액을 고쳐 주세요" },
    ]);
  });

  it("숫자가 아닌 금액 → 금액 칸 「숫자가 아닙니다」", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: Number.NaN, fxRate: 1 })).toEqual([
      { field: "amount", reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" },
    ]);
  });

  it("USD 40,000 · 환율 1,350 → 오류 없음", () => {
    expect(validatePreEstimateChange({ currency: "USD", amount: 40_000, fxRate: 1350 })).toEqual([]);
  });

  it("USD인데 환율이 없으면 → 환율 칸 「환율이 없습니다」", () => {
    expect(validatePreEstimateChange({ currency: "USD", amount: 40_000, fxRate: null })).toEqual([
      { field: "fxRate", reason: "환율이 없습니다 · USD 환율을 적어 주세요" },
    ]);
  });

  it("USD 환율 0 → 환율 칸 「환율은 0보다 커야 합니다」", () => {
    expect(validatePreEstimateChange({ currency: "USD", amount: 40_000, fxRate: 0 })).toEqual([
      { field: "fxRate", reason: "환율은 0보다 커야 합니다 · 환율을 고쳐 주세요" },
    ]);
  });

  it("KRW에 환율 3을 실어도 오류가 없다(KRW는 환율 1로 본다)", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: 1_000, fxRate: 3 })).toEqual([]);
  });

  it("KRW에 환율이 없어도 오류가 없다", () => {
    expect(validatePreEstimateChange({ currency: "KRW", amount: 1_000, fxRate: null })).toEqual([]);
  });

  it("금액과 환율이 둘 다 틀리면 칸마다 하나씩", () => {
    expect(validatePreEstimateChange({ currency: "USD", amount: -5, fxRate: 0 })).toEqual([
      { field: "amount", reason: "총 매출 예상가는 0 이상 · 금액을 고쳐 주세요" },
      { field: "fxRate", reason: "환율은 0보다 커야 합니다 · 환율을 고쳐 주세요" },
    ]);
  });
});
