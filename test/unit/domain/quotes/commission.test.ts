import { describe, expect, it } from "vitest";
import { commissionBase, commissionMajors, parseCommissionRate, type CommissionBaseRow } from "@/domain/quotes/commission";
import { commissionAmount } from "@/domain/money";

// 07.2 PU3(D-7223) — 「계산」 패널의 기준 합. 견적 줄(quote)만 · 취소 줄 0 · 대분류는 저장값 ?? 소분류(이름표로 파생) ·
// 저장 전 값(수량 · 단가 · 일수)으로 다시 계산한다(서버가 마지막에 돌려준 견적가가 아니라).
function row(input: Partial<CommissionBaseRow> & { unitPriceAmountKrw: number }): CommissionBaseRow {
  return {
    lineKind: "quote",
    lineStatus: "not_started",
    subcategory: "stage_construction",
    majorCategory: null,
    quantity: 1,
    days: 1,
    ...input,
  };
}

const LABELS: Record<string, string> = { stage_construction: "무대 설치", printing: "인쇄" };
const label = (value: string) => LABELS[value] ?? value;

// 샘플 엑셀(시트1 H116-H118) 꼴 — Venue 5% = Venue 합, Agency 12% = Total − Venue.
const SAMPLE: CommissionBaseRow[] = [
  row({ majorCategory: "Venue", quantity: 2, days: 3, unitPriceAmountKrw: 1_000_000 }),
  row({ majorCategory: "Venue", unitPriceAmountKrw: 4_000_000 }),
  row({ majorCategory: "Agency", unitPriceAmountKrw: 5_000_000 }),
  row({ majorCategory: "Agency", unitPriceAmountKrw: 9_999, lineStatus: "cancelled" }),
  row({ lineKind: "commission", subcategory: "commission", unitPriceAmountKrw: -50_000 }),
  row({ lineKind: "out_of_quote", subcategory: "out_of_quote", unitPriceAmountKrw: 0 }),
  row({ lineKind: "adjustment", subcategory: "adjustment", unitPriceAmountKrw: 0 }),
];

describe("commissionBase", () => {
  it("전체 = 견적 줄 견적가 합 — 수수료 · 견적 외 비용 · 조정 줄과 취소 줄은 0", () => {
    expect(commissionBase(SAMPLE, { kind: "all" })).toBe(15_000_000);
  });

  it("{대분류}만 · {대분류} 제외", () => {
    expect(commissionBase(SAMPLE, { kind: "only", major: "Venue" })).toBe(10_000_000);
    expect(commissionBase(SAMPLE, { kind: "except", major: "Venue" })).toBe(5_000_000);
  });

  it("샘플 — Venue 5% = 500,000 · Agency 12%(Total − Venue) = 600,000", () => {
    expect(commissionAmount(commissionBase(SAMPLE, { kind: "only", major: "Venue" }), 5)).toBe(500_000);
    expect(commissionAmount(commissionBase(SAMPLE, { kind: "except", major: "Venue" }), 12)).toBe(600_000);
  });

  it("대분류는 저장값 ?? 소분류 이름표(파생)", () => {
    const rows = [row({ unitPriceAmountKrw: 1_000 }), row({ subcategory: "printing", unitPriceAmountKrw: 2_000 }), row({ majorCategory: "Venue", subcategory: "printing", unitPriceAmountKrw: 4_000 })];
    expect(commissionBase(rows, { kind: "only", major: "무대 설치" }, label)).toBe(1_000);
    expect(commissionBase(rows, { kind: "only", major: "인쇄" }, label)).toBe(2_000);
    expect(commissionBase(rows, { kind: "except", major: "Venue" }, label)).toBe(3_000);
  });

  it("저장 전 값으로 다시 계산 — 수량 × 단가 × 일수(한 번 반올림)", () => {
    const rows = [row({ quantity: 1.5, days: 2, unitPriceAmountKrw: 333 })];
    expect(commissionBase(rows, { kind: "all" })).toBe(999);
  });
});

describe("commissionMajors", () => {
  it("견적 줄의 대분류(저장값 ?? 파생)를 처음 나온 순서로 한 번씩 — 취소 줄 · 다른 종류 줄은 빼고", () => {
    const rows = [
      row({ majorCategory: "Venue", unitPriceAmountKrw: 1 }),
      row({ unitPriceAmountKrw: 1 }),
      row({ majorCategory: "Venue", unitPriceAmountKrw: 1 }),
      row({ majorCategory: "Agency", unitPriceAmountKrw: 1, lineStatus: "cancelled" }),
      row({ lineKind: "commission", subcategory: "commission", unitPriceAmountKrw: 1 }),
    ];
    expect(commissionMajors(rows, label)).toEqual(["Venue", "무대 설치"]);
  });

  it("견적 줄이 없으면 빈 배열", () => {
    expect(commissionMajors([], label)).toEqual([]);
  });
});

// PR #367 검토 P2 — commissionAmount가 율을 소수 2자리(bp)로 반올림하므로, 패널은 그보다 긴 율을 받지 않는다(0.005%가 0.01%로
// 계산되거나 12.345%가 12.35%로 계산된 채 비고에 12.345%로 남지 않게).
describe("parseCommissionRate — 「계산」 패널 율 글자", () => {
  it("비면 null", () => {
    expect(parseCommissionRate("  ")).toBeNull();
  });

  it("소수 2자리까지의 0 ~ 100 숫자는 그 값", () => {
    expect(parseCommissionRate("5")).toBe(5);
    expect(parseCommissionRate(" 12.34 ")).toBe(12.34);
    expect(parseCommissionRate("0.01")).toBe(0.01);
    expect(parseCommissionRate("100")).toBe(100);
  });

  it("소수 3자리 이상이면 NaN(형식 오류)", () => {
    expect(parseCommissionRate("0.005")).toBeNaN();
    expect(parseCommissionRate("12.345")).toBeNaN();
  });

  it("숫자가 아니거나 0 ~ 100 밖이면 NaN", () => {
    expect(parseCommissionRate("abc")).toBeNaN();
    expect(parseCommissionRate("-1")).toBeNaN();
    expect(parseCommissionRate("100.01")).toBeNaN();
  });
});
