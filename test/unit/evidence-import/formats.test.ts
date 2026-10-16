import { describe, expect, it } from "vitest";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { splitCardTotal } from "@/domain/corp-card-usages/amounts";
import { businessNoDigitsOf, cardLast4Of, cellDate, cellKrw, isBlankRow } from "@/domain/evidence-import/cells";
import { finalizeAmounts, parseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import type { TaxRates } from "@/domain/money/tax";
import {
  bcFixture,
  FAKE_BC_ACCOUNT_NO,
  lotteFixture,
  SHINHAN_HEADER,
  shinhanFixture,
  type FixtureRow,
} from "@/test/fixtures/evidence-import/build";

// 06.1-02 — 서식 규칙 · 칸 정규화 헬퍼.

const RATES: TaxRates = {
  asOf: "2026-05-28",
  vatRate: 0.1,
  vatUnit: 1,
  withholdingBusinessRate: 0.033,
  withholdingUnit: 10,
  minWithholding: 1_000,
  companyBorneRate: 0.033,
  companyBorneMethod: "flat",
  companyBorneExemptThreshold: 50_000,
  basisWithholding: "payment_date",
  basisVat: "evidence_date",
};
// 시드 `card_receipt` 세금 규칙 그대로(domain/seed/index.ts EVIDENCE_TYPE_CODES · 마이그레이션 0029).
const SEED_CARD_RULE: TaxRule = { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" };

function rulesOf(rule: TaxRule): ReadonlyMap<string, TaxRule> {
  return new Map([["card_receipt", rule]]);
}

function ratesFor(...dates: string[]): ReadonlyMap<string, TaxRates> {
  return new Map(dates.map((date) => [date, { ...RATES, asOf: date }]));
}

function ok(result: ParseResult) {
  if (!result.ok) throw new Error(`거절됨: ${result.headline} ${result.lines.join(" / ")}`);
  return result;
}

describe("cells — 카드 끝 4자리(E1)", () => {
  it("평문 16자리 · 가린 번호의 끝 넷", () => {
    expect(cardLast4Of("9999000011112222")).toBe("2222");
    expect(cardLast4Of("5531-52**-****-1278")).toBe("1278");
    expect(cardLast4Of("5599********7344")).toBe("7344");
  });

  it("끝까지 가린 번호에서 카드사 대역 조각을 집지 않는다", () => {
    expect(cardLast4Of("5531-52**-****-****")).toBeNull();
  });

  it("8자 미만 · 빈 칸은 null", () => {
    expect(cardLast4Of("1234567")).toBeNull();
    expect(cardLast4Of(null)).toBeNull();
    expect(cardLast4Of("")).toBeNull();
  });
});

describe("cells — 원 정수(B-F19)", () => {
  it("공백 · 쉼표 · 원 · ₩를 뗀다", () => {
    expect(cellKrw("₩1,000원")).toBe(1000);
    expect(cellKrw("       28,500")).toBe(28500);
    expect(cellKrw("-10,000")).toBe(-10000);
    expect(cellKrw(113400.0)).toBe(113400);
    expect(cellKrw("113400.0")).toBe(113400);
  });

  it("정수가 아니면 반올림하지 않고 null", () => {
    expect(cellKrw(113400.5)).toBeNull();
    expect(cellKrw("113400.5")).toBeNull();
  });

  it("울타리 밖 · 글자 · 빈 칸은 null", () => {
    expect(cellKrw(1e15)).toBeNull();
    expect(cellKrw("abc")).toBeNull();
    expect(cellKrw("0x10")).toBeNull();
    expect(cellKrw("")).toBeNull();
    expect(cellKrw(null)).toBeNull();
  });
});

describe("cells — 날짜 · 사업자번호 · 빈 줄", () => {
  it("글자 날짜와 시간 붙은 꼴", () => {
    expect(cellDate("2026.04.30", false)).toEqual({ date: "2026-04-30", time: null });
    expect(cellDate("2026-05-14", false)).toEqual({ date: "2026-05-14", time: null });
    expect(cellDate("2026.05.28 21:31:37", false)).toEqual({ date: "2026-05-28", time: "21:31:37" });
  });

  it("엑셀 일련번호는 통합문서 날짜 체계로", () => {
    expect(cellDate(46142, false)).toEqual({ date: "2026-04-30", time: null });
    expect(cellDate(46142, true)).toEqual({ date: "2030-05-01", time: null });
  });

  it("못 읽는 날짜는 null", () => {
    expect(cellDate("어제", false)).toBeNull();
    expect(cellDate("2026.13.01", false)).toBeNull();
    expect(cellDate("2026.02.30", false)).toBeNull();
    expect(cellDate(null, false)).toBeNull();
  });

  it("사업자번호는 숫자 10자리만", () => {
    expect(businessNoDigitsOf("123-45-67891")).toBe("1234567891");
    expect(businessNoDigitsOf("113-**-*****")).toBeNull();
    expect(businessNoDigitsOf(null)).toBeNull();
  });

  it("전부 빈 줄", () => {
    expect(isBlankRow([])).toBe(true);
    expect(isBlankRow([null, "", "   "])).toBe(true);
    expect(isBlankRow([null, 0])).toBe(false);
  });
});

describe("롯데 서식", () => {
  it("매입일 · 매입시간 → issuedOn · usedAt, 가맹점 · 사업자번호 · 증빙 종류", () => {
    const [line] = ok(parseWorkbook(lotteFixture([{ 하위가맹점명: "하위가맹점가" }]))).lines;
    expect(line).toMatchObject({
      lineNo: 3,
      evidenceType: "card_receipt",
      approvalNo: "44403241",
      issuedOn: "2026-04-30",
      usedAt: "17:59:03",
      totalKrw: 204100,
      vatKrw: 18554,
      supplyKrw: null,
      merchant: "하위가맹점가",
      businessNoDigits: "1234567891",
      cardLast4: "2222",
      needsCheck: null,
    });
  });

  it("하위가맹점명이 없으면 가맹점명", () => {
    const [line] = ok(parseWorkbook(lotteFixture([{}]))).lines;
    expect(line?.merchant).toBe("가맹점가");
  });

  it("끝까지 가린 카드 번호는 줄 오류가 아니라 cardLast4 null", () => {
    const [line] = ok(parseWorkbook(lotteFixture([{ 카드번호: "5531-52**-****-****" }]))).lines;
    expect(line?.cardLast4).toBeNull();
  });
});

describe("롯데 · 비씨 — 해외 이용 · 부가세 부호(E15 · E16)", () => {
  it("롯데 현지거래금액 ≠ 0 → 해외 이용 확인 필요 · 금액은 원화 합계 그대로", () => {
    const [line] = ok(parseWorkbook(lotteFixture([{ 현지거래금액: "12.50" }]))).lines;
    expect(line).toMatchObject({ needsCheck: "해외 이용 · 원화 금액 확인", totalKrw: 204100, vatKrw: 18554 });
  });

  it("롯데 합계와 부가세의 부호가 다르면 줄 오류 부가세 맞지 않음", () => {
    expect(parseWorkbook(lotteFixture([{ 매입금액: "-204,100", 부가세: "18,554" }]))).toMatchObject({ ok: false, kind: "line-errors", lines: ["3줄 · 부가세 맞지 않음"] });
  });

  it("롯데 |부가세| > |합계| → 부가세 맞지 않음", () => {
    expect(parseWorkbook(lotteFixture([{ 매입금액: "1,000", 부가세: "2,000" }]))).toMatchObject({ ok: false, lines: ["3줄 · 부가세 맞지 않음"] });
  });

  it("롯데 부가세 칸 빈칸(0이 아님) → 부가세 읽지 못함", () => {
    expect(parseWorkbook(lotteFixture([{ 부가세: "" }]))).toMatchObject({ ok: false, lines: ["3줄 · 부가세 읽지 못함"] });
  });

  it("비씨 합계와 부가세의 부호가 다르면 부가세 맞지 않음", () => {
    expect(parseWorkbook(bcFixture([{ "거래금액(원화)": "-28,500", 부가세: "2,591" }]))).toMatchObject({ ok: false, lines: ["2줄 · 부가세 맞지 않음"] });
  });
});

describe("신한 서식", () => {
  const SHINHAN_ROWS: FixtureRow[] = [
    {},
    { 승인번호: "", 이용일시: "2026.05.20", 가맹점명: "카드사용알림서비스", 이용금액: 300 },
    { 승인번호: "12040095  ", 이용금액: 20000 },
    { 승인번호: "12040095  ", 이용금액: -20000 },
    { 승인번호: "55667788", 이용일시: "2026.05.21 10:00:00", 이용금액: -5000 },
    { 승인번호: "99887766", 이용카드: "5531-52**-****-****" },
  ];

  it("상쇄 쌍을 뺀 데이터 줄 · 끝 4자리 · 빈 승인번호 null · 세액 · 공급가 null · rateDates", () => {
    const result = ok(parseWorkbook(shinhanFixture(SHINHAN_ROWS)));
    expect(result.format).toBe("card-shinhan");
    expect(result.offsetPairs).toBe(1);
    expect(result.lines).toHaveLength(4);
    const [first, blank, partial, masked] = result.lines;
    expect(first).toMatchObject({ cardLast4: "1278", approvalNo: "09847552", issuedOn: "2026-05-28", usedAt: "18:43:28", totalKrw: 113400, vatKrw: null, supplyKrw: null });
    expect(blank).toMatchObject({ approvalNo: null, issuedOn: "2026-05-20", usedAt: null, totalKrw: 300 });
    expect(blank?.dedupeKey).toBe("card-shinhan|1278|2026-05-20|카드사용알림서비스|300");
    expect(partial?.totalKrw).toBe(-5000);
    expect(masked?.cardLast4).toBeNull();
    expect(result.rateDates).toEqual(["2026-05-20", "2026-05-21", "2026-05-28"]);
  });

  it("외화 낱말이 머리글에 있으면 모르는 서식", () => {
    const header = [...SHINHAN_HEADER, "현지거래금액"];
    expect(parseWorkbook(shinhanFixture([{}], { header }))).toMatchObject({ ok: false, kind: "unknown-format", headline: "모르는 서식 · 홈택스·카드사 내려받기 파일로 다시" });
  });

  it("머리글 12칸 중 하나가 빠지면 모르는 서식", () => {
    const header = SHINHAN_HEADER.filter((name) => name !== "결제예정일");
    expect(parseWorkbook(shinhanFixture([{}], { header }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("역산: 공급가 = grossFromSignedTotal · 세액 = 합계 − 공급가 · 양수는 splitCardTotal과 같다", () => {
    const result = ok(parseWorkbook(shinhanFixture([{ 이용금액: 12500 }, { 승인번호: "70707070", 이용금액: -12500 }])));
    const [plus, minus] = finalizeAmounts(result.lines, ratesFor("2026-05-28"), rulesOf(SEED_CARD_RULE));
    const split = splitCardTotal({ money: { currency: "KRW", amount: 12500, fxRate: 1 }, rule: SEED_CARD_RULE }, RATES);
    expect(plus).toMatchObject({ totalKrw: 12500, supplyKrw: split.supplyKrw, vatKrw: 12500 - split.supplyKrw });
    expect(minus).toMatchObject({ totalKrw: -12500, supplyKrw: -split.supplyKrw, vatKrw: -(12500 - split.supplyKrw) });
  });

  it("규칙 절사 → splitCardTotal(절사)와 같은 공급가", () => {
    const rule: TaxRule = { ...SEED_CARD_RULE, roundingMethod: "truncate" };
    const result = ok(parseWorkbook(shinhanFixture([{ 이용금액: 100005 }])));
    const [line] = finalizeAmounts(result.lines, ratesFor("2026-05-28"), rulesOf(rule));
    const split = splitCardTotal({ money: { currency: "KRW", amount: 100005, fxRate: 1 }, rule }, RATES);
    expect(line?.supplyKrw).toBe(split.supplyKrw);
    expect(line?.supplyKrw).toBe(90913);
  });

  it("규칙 none → 역산 없음 · 공급가 = 합계 · 세액 0", () => {
    const result = ok(parseWorkbook(shinhanFixture([{ 이용금액: 12500 }])));
    const [line] = finalizeAmounts(result.lines, ratesFor("2026-05-28"), rulesOf({ ruleKind: "none" }));
    expect(line).toMatchObject({ totalKrw: 12500, supplyKrw: 12500, vatKrw: 0 });
  });

  it("ratesByDate에 그 날짜가 없으면 던진다(호출자 결함)", () => {
    const result = ok(parseWorkbook(shinhanFixture([{}])));
    expect(() => finalizeAmounts(result.lines, new Map(), rulesOf(SEED_CARD_RULE))).toThrow();
  });

  it("규칙 맵에 그 증빙 종류가 없으면 던진다(호출자 결함)", () => {
    const result = ok(parseWorkbook(shinhanFixture([{}])));
    expect(() => finalizeAmounts(result.lines, ratesFor("2026-05-28"), new Map())).toThrow();
  });

  it("승인번호 없는 두 줄이 같은 카드 · 사용일시 · 가맹점 · 합계 → 열쇠 … · …#2, 둘 다 sameKeyCount 2", () => {
    const same = { 승인번호: "", 이용일시: "2026.05.20 09:00:00", 가맹점명: "가맹점라", 이용금액: 4500 };
    const result = ok(parseWorkbook(shinhanFixture([same, same])));
    expect(result.lines.map((line) => line.dedupeKey)).toEqual([
      "card-shinhan|1278|2026-05-20 09:00:00|가맹점라|4500",
      "card-shinhan|1278|2026-05-20 09:00:00|가맹점라|4500#2",
    ]);
    expect(result.lines.map((line) => line.sameKeyCount)).toEqual([2, 2]);
  });

  it("GH-P1 겹치는 내보내기 [A,B] · [B,C] — 두 파일 모두 … · …#2 · sameKeyCount 2 · 같은 baseKey", () => {
    const same = { 승인번호: "", 이용일시: "2026.05.20 09:00:00", 가맹점명: "가맹점라", 이용금액: 4500 };
    const first = ok(parseWorkbook(shinhanFixture([same, same])));
    const second = ok(parseWorkbook(shinhanFixture([same, same])));
    for (const result of [first, second]) {
      expect(result.lines.map((line) => line.dedupeKey)).toEqual([
        "card-shinhan|1278|2026-05-20 09:00:00|가맹점라|4500",
        "card-shinhan|1278|2026-05-20 09:00:00|가맹점라|4500#2",
      ]);
      expect(result.lines.map((line) => line.sameKeyCount)).toEqual([2, 2]);
    }
    expect(new Set([...first.lines, ...second.lines].map((line) => line.baseKey)).size).toBe(1);
  });
});

describe("비씨 서식", () => {
  const BC_ROWS: FixtureRow[] = [
    {},
    { 승인번호: "70513821", 승인일자: "2026-06-08", "거래금액(원화)": "20,400", 부가세: "1,854" },
    { 승인번호: "11223344", "거래금액(원화)": "10,000", 부가세: "0" },
    { 승인번호: "00000000", "거래금액(원화)": "400", 부가세: "36", 가맹점명: "승인안내" },
    { 승인번호: "", "거래금액(원화)": "10,000", 부가세: "909", 가맹점명: "연회비" },
    { 승인번호: "64706399", 금액SIGN코드: "-", "거래금액(원화)": "28,500", 부가세: "2,591" },
    { 수신정보구분코드: "합      계", 카드번호: "", 승인번호: "", 승인일자: "", "거래금액(원화)": "40,800", 부가세: "" },
  ];

  it("합계 줄은 줄 목록에 없고 00000000 · 빈 승인번호 줄은 대체 열쇠로 등록 줄에 있다(E13)", () => {
    const result = ok(parseWorkbook(bcFixture(BC_ROWS)));
    expect(result.format).toBe("card-bc");
    expect(result.lines).toHaveLength(6);
    const zero = result.lines[3];
    const blank = result.lines[4];
    expect(zero).toMatchObject({ approvalNo: null, totalKrw: 400 });
    expect(zero?.dedupeKey).toBe("card-bc|2942|2026-05-14|승인안내|400");
    expect(blank).toMatchObject({ approvalNo: null, totalKrw: 10000, merchant: "연회비" });
  });

  it("면세 줄 부가세 0 · 공급가 = 합계", () => {
    const result = ok(parseWorkbook(bcFixture(BC_ROWS)));
    const lines = finalizeAmounts(result.lines, new Map(), new Map());
    expect(lines[2]).toMatchObject({ totalKrw: 10000, vatKrw: 0, supplyKrw: 10000 });
    expect(lines[0]).toMatchObject({ totalKrw: 28500, vatKrw: 2591, supplyKrw: 25909 });
  });

  it("금액SIGN코드 - 줄은 합계 · 부가세 음수 · 취소 표시 줄 확인 필요(E12)", () => {
    const line = ok(parseWorkbook(bcFixture(BC_ROWS))).lines[5];
    expect(line).toMatchObject({ totalKrw: -28500, vatKrw: -2591, needsCheck: "취소 표시 줄 · 원거래 확인" });
  });

  it("결과 JSON에 카드 번호 16자리 · 결제 계좌번호가 없다", () => {
    const text = JSON.stringify(ok(parseWorkbook(bcFixture(BC_ROWS))));
    expect(text).not.toMatch(/\d{16}/);
    expect(text).not.toContain(FAKE_BC_ACCOUNT_NO);
    expect(text).not.toContain("9430");
  });

  it("합계 줄 거래금액(원화)이 줄 합과 1원 다르면 총 합계금액 다름(E13)", () => {
    const rows = BC_ROWS.map((row) => (row?.수신정보구분코드 === "합      계" ? { ...row, "거래금액(원화)": "40,801" } : row));
    expect(parseWorkbook(bcFixture(rows))).toEqual({
      ok: false,
      kind: "checksum",
      headline: "총 합계금액 다름 · 파일 40,801 · 줄 합 40,800",
      lines: [],
      restCount: 0,
    });
  });

  it("국내외사용구분 해외 · 거래금액(외화) ≠ 0 → 해외 이용 확인 필요, 금액은 원화 그대로(E15)", () => {
    const result = ok(parseWorkbook(bcFixture([{ 국내외사용구분: "해외" }, { 승인번호: "12121212", "거래금액(외화)": "21.30" }])));
    expect(result.lines.map((line) => line.needsCheck)).toEqual(["해외 이용 · 원화 금액 확인", "해외 이용 · 원화 금액 확인"]);
    expect(result.lines[0]?.totalKrw).toBe(28500);
  });

  it("취소 표시와 해외 이용이 겹치면 취소 표시 사유가 먼저", () => {
    const [line] = ok(parseWorkbook(bcFixture([{ 국내외사용구분: "해외", 금액SIGN코드: "-" }]))).lines;
    expect(line?.needsCheck).toBe("취소 표시 줄 · 원거래 확인");
  });

  it("금액SIGN코드가 모르는 값이면 줄 오류 금액 읽지 못함", () => {
    expect(parseWorkbook(bcFixture([{ 금액SIGN코드: "X" }]))).toMatchObject({ ok: false, kind: "line-errors", lines: ["2줄 · 금액 읽지 못함"] });
  });

  it("가린 가맹점사업자번호는 null(오류 아님)", () => {
    const [line] = ok(parseWorkbook(bcFixture([{}]))).lines;
    expect(line).toMatchObject({ businessNoDigits: null, cardLast4: "2942", issuedOn: "2026-05-14", merchant: "가맹점다" });
  });
});
