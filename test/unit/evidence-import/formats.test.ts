import { describe, expect, it } from "vitest";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { splitCardTotal } from "@/domain/corp-card-usages/amounts";
import { businessNoDigitsOf, cardLast4Of, cellDate, cellKrw, isBlankRow } from "@/domain/evidence-import/cells";
import { EVIDENCE_FORMATS, finalizeAmounts, parseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import { EVIDENCE_FORMAT_TYPES, type ParsedLine } from "@/domain/evidence-import/types";
import { splitOffsetPairs } from "@/domain/evidence-import/key";
import { readWorkbookRows } from "@/lib/xlsx-server";
import type { TaxRates } from "@/domain/money/tax";
import {
  bcFixture,
  FAKE_BC_ACCOUNT_NO,
  HOMETAX_CASH_RECEIPT_HEADER,
  hometaxCashReceiptFixture,
  hometaxInvoiceFixture,
  hometaxTaxInvoiceFixture,
  lotteFixture,
  SHINHAN_HEADER,
  shinhanAccountingFixture,
  shinhanFixture,
  SHINHAN_ACCOUNTING_HEADER,
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

  it("옛 12칸 픽스처는 회계양식이 아니라 card-shinhan으로 판별된다", () => {
    const book = readWorkbookRows(shinhanFixture([{}]), { sheetRows: 6 });
    const matched = EVIDENCE_FORMATS.filter((rule) => rule.detect(book.sheets, "cfb").match).map((rule) => rule.key);
    expect(matched).toEqual(["card-shinhan"]);
    expect(ok(parseWorkbook(shinhanFixture([{}]))).format).toBe("card-shinhan");
  });

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

  it("빠진 취소 줄도 finalizeAmounts로 금액이 정해진다(신한 — 역산 날짜가 rateDates에 있다)", () => {
    const result = ok(
      parseWorkbook(
        shinhanFixture([
          { 이용일시: "2026.05.28 10:00:00", 이용금액: 4500 },
          { 승인번호: "12040095", 이용일시: "2026.05.10 09:00:00", 이용금액: 12500 },
          { 승인번호: "12040095", 이용일시: "2026.05.10 09:00:00", 이용금액: -12500 },
        ]),
      ),
    );
    expect(result.offsetPairs).toBe(1);
    expect(result.rateDates).toEqual(["2026-05-10", "2026-05-28"]);
    const [cancel] = finalizeAmounts(result.offsetLines.map((pair) => pair.cancel), ratesFor(...result.rateDates), rulesOf(SEED_CARD_RULE));
    expect(cancel).toMatchObject({ totalKrw: -12500, supplyKrw: -11364, vatKrw: -1136 });
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

describe("상쇄 쌍 — 끝 4자리를 못 읽은 카드(독립 검토 P3-2)", () => {
  it("끝 4자리가 없는 두 줄은 승인번호 · 반대 금액이 같아도 짝짓지 않는다", () => {
    const masked = "5531-52**-****-****";
    const result = ok(
      parseWorkbook(
        shinhanFixture([
          { 승인번호: "12040095", 이용카드: masked, 이용금액: 20000 },
          { 승인번호: "12040095", 이용카드: masked, 이용금액: -20000 },
        ]),
      ),
    );
    expect(result.offsetPairs).toBe(0);
    expect(result.lines.map((line) => line.totalKrw)).toEqual([20000, -20000]);
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

describe("홈택스 매입 세금계산서", () => {
  const HOMETAX_ROWS: FixtureRow[] = [
    {},
    { 승인번호: "20260616-10260616-71160002", 공급자상호: "공급회사나", 합계금액: 55000, 공급가액: 50000, 세액: 5000 },
    {
      승인번호: "20260617-10260617-71160003",
      전자세금계산서분류: "수정세금계산서",
      합계금액: -11000,
      공급가액: -10000,
      세액: -1000,
      비고: "당초 승인번호 (20260101-11111111-22222222)",
    },
  ];

  it("줄 3 · 승인번호 26자 · 공급자 쪽 상호 · 사업자번호 숫자 · 증빙 종류 · 열쇠 스냅샷", () => {
    const result = ok(parseWorkbook(hometaxTaxInvoiceFixture(HOMETAX_ROWS)));
    expect(result.format).toBe("hometax-tax-invoice");
    expect(result.lines).toHaveLength(3);
    const [first, , amended] = result.lines;
    expect(first).toMatchObject({
      lineNo: 7,
      evidenceType: "tax_invoice",
      approvalNo: "20260615-10260615-71160001",
      issuedOn: "2026-06-15",
      nameOnDocument: "공급회사가",
      businessNoDigits: "1234567891",
      totalKrw: 110000,
      supplyKrw: 100000,
      vatKrw: 10000,
      cardLast4: null,
      originalApprovalNo: null,
    });
    expect(first?.approvalNo).toHaveLength(26);
    expect(first?.dedupeKey).toBe("hometax-tax-invoice|20260615-10260615-71160001");
    expect(first?.sameKeyCount).toBe(1);
    expect(amended).toMatchObject({ originalApprovalNo: "20260101-11111111-22222222", totalKrw: -11000, supplyKrw: -10000, vatKrw: -1000 });
    expect(result.rateDates).toEqual([]);
  });

  it("거래처를 만드는 서식이다", () => {
    expect(EVIDENCE_FORMATS.find((rule) => rule.key === "hometax-tax-invoice")?.createsVendor).toBe(true);
  });

  it("xlsx도 같은 줄 · 같은 열쇠(E39)", () => {
    const expected = ok(parseWorkbook(hometaxTaxInvoiceFixture(HOMETAX_ROWS))).lines;
    expect(ok(parseWorkbook(hometaxTaxInvoiceFixture(HOMETAX_ROWS, { as: "xlsx" }))).lines).toEqual(expected);
  });

  it("csv(시트 이름 없음)도 띠 · 머리글 조건으로 읽힌다", () => {
    const expected = ok(parseWorkbook(hometaxTaxInvoiceFixture(HOMETAX_ROWS))).lines.map((line) => line.dedupeKey);
    expect(ok(parseWorkbook(hometaxTaxInvoiceFixture(HOMETAX_ROWS, { as: "csv-utf8" }))).lines.map((line) => line.dedupeKey)).toEqual(expected);
  });

  it("0행 사업자번호가 비거나 숫자 10자리가 아니면 모르는 서식(E18)", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { company: "" }))).toMatchObject({ ok: false, kind: "unknown-format" });
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { company: "723-**-*****" }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("받는자 사업자번호가 우리 회사 번호와 다르면 받는 사업자 다름", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 공급받는자사업자등록번호: "111-11-11111" }]))).toMatchObject({ ok: false, lines: ["7줄 · 받는 사업자 다름"] });
  });

  it("공급자 번호가 우리 회사 번호면 공급자가 자사", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 공급자사업자등록번호: "999-99-99997" }]))).toMatchObject({ ok: false, lines: ["7줄 · 공급자가 자사"] });
  });

  it("같은 파일 안 같은 승인번호 두 줄 → 줄 오류 승인번호 겹침 · 파일 전체 거절(#2 없음)", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}, {}]))).toEqual({ ok: false, kind: "line-errors", headline: "거절 · 오류 1줄", lines: ["8줄 · 승인번호 겹침"], restCount: 0 });
  });

  it("3줄 총계가 줄 합과 1원 다르면 총 합계금액 다름", () => {
    const totals = [["총 합계금액", "110,001"], ["총 공급가액", "100,000"], ["총 세액", "10,000"]] as const;
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { totals }))).toEqual({
      ok: false,
      kind: "checksum",
      headline: "총 합계금액 다름 · 파일 110,001 · 줄 합 110,000",
      lines: [],
      restCount: 0,
    });
  });

  it("띠가 매출로 시작하면 매출 목록 거절", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { band: "매출 전자(수정) 세금계산서 목록조회" }))).toEqual({
      ok: false,
      kind: "sales-list",
      headline: "매출 목록 · 매입 목록으로 다시 내려받기",
      lines: [],
      restCount: 0,
    });
  });

  it("계산서 꼴(띠 계산서 · 세액 · 품목세액 없음 · 총 공급가액 한 쌍) → 계산서로 읽힘(06.1-11) · 세금계산서로 읽히지 않음", () => {
    const bytes = hometaxTaxInvoiceFixture([{ 합계금액: 100000 }], {
      band: "매입 전자(수정) 계산서 목록조회",
      omit: ["세액", "품목세액"],
      totals: [["총 공급가액", "100,000"]],
    });
    const result = ok(parseWorkbook(bytes));
    expect(result.format).toBe("hometax-invoice");
    expect(result.lines).toMatchObject([{ evidenceType: "invoice", totalKrw: 100000, supplyKrw: 100000, vatKrw: 0 }]);
  });

  it("반쪽 판별 — 띠는 세금계산서인데 세액 칸 없음 → 모르는 서식", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { omit: ["세액", "품목세액"] }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("반쪽 판별 — 띠는 계산서인데 세액 칸 있음 → 모르는 서식", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { band: "매입 전자(수정) 계산서 목록조회" }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("합계금액 ≠ 공급가액 + 세액 → 합계 맞지 않음", () => {
    const totals = [["총 합계금액", "110,001"], ["총 공급가액", "100,000"], ["총 세액", "10,000"]] as const;
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 합계금액: 110001 }], { totals }))).toMatchObject({ ok: false, lines: ["7줄 · 합계 맞지 않음"] });
  });

  it("승인번호가 26자 꼴이 아니면 승인번호 읽지 못함", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 승인번호: "12345678" }]))).toMatchObject({ ok: false, lines: ["7줄 · 승인번호 읽지 못함"] });
  });

  it("세 번째 묶음이 소문자 영숫자 8자(C-86) → 승인번호 26자 그대로 · 열쇠", () => {
    const result = ok(parseWorkbook(hometaxTaxInvoiceFixture([{ 승인번호: "20260615-10260615-ab12cd34" }])));
    expect(result.lines[0]?.approvalNo).toBe("20260615-10260615-ab12cd34");
    expect(result.lines[0]?.approvalNo).toHaveLength(26);
    expect(result.lines[0]?.dedupeKey).toBe("hometax-tax-invoice|20260615-10260615-ab12cd34");
  });

  it("세 번째 묶음이 대문자 영숫자 → 승인번호 읽지 못함(소문자만 관측)", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 승인번호: "20260615-10260615-AB12CD34" }]))).toMatchObject({ ok: false, lines: ["7줄 · 승인번호 읽지 못함"] });
  });

  it("두 번째 묶음에 글자 → 승인번호 읽지 못함", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{ 승인번호: "20260615-1026061a-ab12cd34" }]))).toMatchObject({ ok: false, lines: ["7줄 · 승인번호 읽지 못함"] });
  });
});

describe("홈택스 매입 현금영수증(06.1-11)", () => {
  // 승인 줄 둘 사이에 빈 줄 하나(E43) — 머리글 1행이라 데이터는 3줄부터.
  const CASH_ROWS: FixtureRow[] = [{}, null, { 승인번호: "A10000002", 매입일시: "2026-07-16 09:05:00", 공급가액: 4546, 부가세: 454, 매입금액: 5000 }];

  it("승인 줄 둘 · 빈 줄 건너뜀 → 서식 키 · 현금영수증 종류 · 매입일 날짜 · 승인번호 · 가맹점 번호 · 가맹점명", () => {
    const result = ok(parseWorkbook(hometaxCashReceiptFixture(CASH_ROWS)));
    expect(result.format).toBe("hometax-cash-receipt");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      lineNo: 3,
      evidenceType: "cash_receipt",
      approvalNo: "A10000001",
      issuedOn: "2026-07-15",
      businessNoDigits: "1234567891",
      nameOnDocument: "가맹점가",
      merchant: null,
      cardLast4: null,
      needsCheck: null,
      originalApprovalNo: null,
      supplyKrw: 9091,
      vatKrw: 909,
      totalKrw: 10000,
    });
    expect(result.lines[1]).toMatchObject({ lineNo: 5, approvalNo: "A10000002", issuedOn: "2026-07-16", supplyKrw: 4546, vatKrw: 454, totalKrw: 5000 });
    expect(result.rateDates).toEqual([]);
    expect(EVIDENCE_FORMAT_TYPES).toContainEqual({ key: "hometax-cash-receipt", evidenceType: "cash_receipt" });
    expect(EVIDENCE_FORMATS.find((rule) => rule.key === "hometax-cash-receipt")?.createsVendor).toBe(true);
  });

  it("(B-F20) 위치 밀림 — 띠가 12열 · 머리글이 2행이어도 같은 줄(거절 아님)", () => {
    const expected = ok(parseWorkbook(hometaxCashReceiptFixture(CASH_ROWS))).lines.map((line) => ({ ...line, lineNo: line.lineNo + 1 }));
    expect(ok(parseWorkbook(hometaxCashReceiptFixture(CASH_ROWS, { bandCol: 12, headerRow: 2 }))).lines).toEqual(expected);
  });

  it("(B-F20) 금액 넷이 쉼표 붙은 글자(10,000)여도 숫자 셀과 같은 값", () => {
    const expected = ok(parseWorkbook(hometaxCashReceiptFixture(CASH_ROWS))).lines;
    expect(ok(parseWorkbook(hometaxCashReceiptFixture(CASH_ROWS, { amountText: true }))).lines).toEqual(expected);
  });

  it("봉사료 500 → 공급가 = 공급가액 + 봉사료 · 세액 = 부가세 · 합계 = 매입금액, 역산 없음(finalizeAmounts가 그대로)", () => {
    const result = ok(parseWorkbook(hometaxCashReceiptFixture([{ 공급가액: 9091, 부가세: 909, 봉사료: 500, 매입금액: 10500 }])));
    expect(result.lines[0]).toMatchObject({ supplyKrw: 9591, vatKrw: 909, totalKrw: 10500 });
    expect(result.rateDates).toEqual([]);
    expect(finalizeAmounts(result.lines, new Map(), new Map())[0]).toMatchObject({ supplyKrw: 9591, vatKrw: 909, totalKrw: 10500 });
  });

  it("공급가액 + 부가세 + 봉사료 ≠ 매입금액 → 거절 · 오류 1줄 · 금액 합 다름", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 매입금액: 10001 }]))).toEqual({
      ok: false,
      kind: "line-errors",
      headline: "거절 · 오류 1줄",
      lines: ["3줄 · 금액 합 다름"],
      restCount: 0,
    });
  });

  it("총 사용금액 다름 — 띠 합이 줄 합과 1원 다르면 거절", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{}], { band: "총 사용금액 : 10,001(원)" }))).toEqual({
      ok: false,
      kind: "checksum",
      headline: "총 사용금액 다름 · 파일 10,001 · 줄 합 10,000",
      lines: [],
      restCount: 0,
    });
  });

  it("총 사용금액 읽지 못함 — 띠 칸이 비었거나 (원)이 없는 꼴이면 거절", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{}], { band: "" }))).toMatchObject({ ok: false, kind: "line-errors", lines: ["1줄 · 총 사용금액 읽지 못함"] });
    expect(parseWorkbook(hometaxCashReceiptFixture([{}], { band: "총 사용금액 : 10,000" }))).toMatchObject({ ok: false, kind: "line-errors", lines: ["1줄 · 총 사용금액 읽지 못함"] });
  });

  it("(E17 · DA-5) 취소거래 음수 — 취소거래 줄은 거절 없이 금액 넷 음수 · 취소거래 확인 필요, 승인 줄은 확인 필요 없음", () => {
    const result = ok(
      parseWorkbook(
        hometaxCashReceiptFixture([
          {},
          { 거래구분: "취소거래" },
          { 승인번호: "A10000003", 거래구분: "취소거래", 공급가액: 9091, 부가세: 909, 봉사료: 500, 매입금액: 10500 },
        ]),
      ),
    );
    expect(result.lines.map((line) => [line.totalKrw, line.vatKrw, line.supplyKrw, line.needsCheck])).toEqual([
      [10000, 909, 9091, null],
      [-10000, -909, -9091, "취소거래 · 원거래 확인"],
      [-10500, -909, -9591, "취소거래 · 원거래 확인"],
    ]);
  });

  it("(E17) 이미 음수로 온 취소 줄은 음수 그대로(다시 뒤집지 않는다) · 음수 총 사용금액 띠도 읽는다", () => {
    const result = ok(parseWorkbook(hometaxCashReceiptFixture([{ 거래구분: "취소거래", 공급가액: -9091, 부가세: -909, 매입금액: -10000 }])));
    expect(result.lines[0]).toMatchObject({ totalKrw: -10000, vatKrw: -909, supplyKrw: -9091, needsCheck: "취소거래 · 원거래 확인" });
  });

  it("거래구분 읽지 못함 — 거래구분 빈 칸은 줄 오류 · 파일 거절", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{}, { 승인번호: "A10000002", 거래구분: "" }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["4줄 · 거래구분 읽지 못함"],
    });
  });

  it("(검토 P3-2) 거래구분 낱말은 공백을 지우고 맞댄다 — 승인 거래는 승인, 앞뒤 공백 취소거래는 취소", () => {
    const result = ok(
      parseWorkbook(hometaxCashReceiptFixture([{ 거래구분: "승인 거래" }, { 승인번호: "A10000002", 거래구분: " 취소거래 " }])),
    );
    expect(result.lines.map((line) => [line.totalKrw, line.needsCheck])).toEqual([
      [10000, null],
      [-10000, "취소거래 · 원거래 확인"],
    ]);
  });

  it("(검토 P3-2) 승인거래 · 취소거래가 아닌 거래구분은 취소로 짐작하지 않고 거래구분 읽지 못함 · 파일 거절", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{}, { 승인번호: "A10000002", 거래구분: "부분취소" }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["4줄 · 거래구분 읽지 못함"],
    });
  });

  it("(검토 P3-1) 승인거래인데 매입금액이 음수면 합계 맞지 않음 · 파일 거절", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 공급가액: -9091, 부가세: -909, 매입금액: -10000 }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["3줄 · 합계 맞지 않음"],
    });
  });

  it("(검토 P3-1) 부가세 부호가 매입금액과 다르거나 매입금액보다 크면 부가세 맞지 않음 — 승인 · 취소 줄 모두", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 공급가액: -100, 부가세: 1100, 매입금액: 1000 }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["3줄 · 부가세 맞지 않음"],
    });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 거래구분: "취소거래", 공급가액: 1100, 부가세: -100, 매입금액: 1000 }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["3줄 · 부가세 맞지 않음"],
    });
  });

  it("(검토 P3-1) 공급가액 · 봉사료 부호가 매입금액과 다르면 합계 맞지 않음", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 공급가액: 600, 부가세: 500, 봉사료: -100, 매입금액: 1000 }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["3줄 · 합계 맞지 않음"],
    });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 공급가액: -100, 부가세: 500, 봉사료: 600, 매입금액: 1000 }]))).toMatchObject({
      ok: false,
      kind: "line-errors",
      lines: ["3줄 · 합계 맞지 않음"],
    });
  });

  it("발급수단 비노출 — 발급수단 · 사용자명 · 업종코드 · 업종 · 업태 · 공제여부 값이 읽은 결과 어디에도 없다", () => {
    const result = ok(
      parseWorkbook(hometaxCashReceiptFixture([{ 발급수단: "7319", 사용자명: "사용자다", 업종코드: "808080", 업종: "업종다", 업태: "업태다", 공제여부: "불공제" }])),
    );
    const text = JSON.stringify(result);
    for (const hidden of ["7319", "사용자다", "808080", "업종다", "업태다", "불공제"]) expect(text).not.toContain(hidden);
  });

  it("(E17 · B-F17) 열쇠 스냅샷 — 승인번호 · 매입일자 · 가맹점 번호 · 부호 있는 매입금액, 다시 읽어도 같고 취소 줄은 원거래와 다르다", () => {
    const rows: FixtureRow[] = [{}, { 거래구분: "취소거래" }];
    const keys = ok(parseWorkbook(hometaxCashReceiptFixture(rows))).lines.map((line) => line.dedupeKey);
    expect(keys).toEqual(["hometax-cash-receipt|A10000001|2026-07-15|1234567891|10000", "hometax-cash-receipt|A10000001|2026-07-15|1234567891|-10000"]);
    expect(ok(parseWorkbook(hometaxCashReceiptFixture(rows))).lines.map((line) => line.dedupeKey)).toEqual(keys);
  });

  it("한 파일 안 열쇠가 같은 두 줄 → 줄 오류 승인번호 겹침 · 파일 전체 거절(#2 없음)", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{}, {}]))).toEqual({
      ok: false,
      kind: "line-errors",
      headline: "거절 · 오류 1줄",
      lines: ["4줄 · 승인번호 겹침"],
      restCount: 0,
    });
  });

  it("같은 승인번호라도 매입일 · 가맹점 번호가 다르면 다른 열쇠라 겹침이 아니다", () => {
    const result = ok(parseWorkbook(hometaxCashReceiptFixture([{}, { 매입일시: "2027-07-15 12:30:45" }, { 가맹점사업자번호: "999-99-99997" }])));
    expect(new Set(result.lines.map((line) => line.dedupeKey)).size).toBe(3);
  });

  it("매입일시 · 가맹점사업자번호 · 승인번호 · 금액 칸을 못 읽으면 줄 오류", () => {
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 매입일시: "2026-13-01 10:00:00" }]))).toMatchObject({ ok: false, lines: ["3줄 · 매입일시 읽지 못함"] });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 가맹점사업자번호: "123-**-*****" }]))).toMatchObject({ ok: false, lines: ["3줄 · 사업자번호 읽지 못함"] });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 승인번호: "" }]))).toMatchObject({ ok: false, lines: ["3줄 · 승인번호 읽지 못함"] });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 승인번호: "A-1000" }]))).toMatchObject({ ok: false, lines: ["3줄 · 승인번호 읽지 못함"] });
    expect(parseWorkbook(hometaxCashReceiptFixture([{ 부가세: "구백" }]))).toMatchObject({ ok: false, lines: ["3줄 · 금액 읽지 못함"] });
  });

  it("판별 — 머리글에서 발급수단을 빼면 모르는 서식", () => {
    const header = HOMETAX_CASH_RECEIPT_HEADER.filter((name) => name !== "발급수단");
    expect(parseWorkbook(hometaxCashReceiptFixture([{}], { header }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });
});

describe("홈택스 매입 계산서(면세 · 06.1-11)", () => {
  // 정상 둘 + 수정 계산서(음수 · 비고에 당초 승인번호). 머리글 5행이라 데이터는 7줄부터.
  const INVOICE_ROWS: FixtureRow[] = [
    {},
    { 승인번호: "20260616-10260616-71160002", 공급자상호: "공급회사나", 공급가액: 50000 },
    { 승인번호: "20260617-10260617-71160003", 공급가액: -10000, 비고: "당초 승인번호 (20260101-11111111-22222222)" },
  ];

  it("줄 3 · 계산서 종류 · 세액 0 · 합계 = 공급가 · 승인번호 26자 · 공급자 쪽 상호 · 음수 줄 원 승인번호 · 역산 없음 · 열쇠 스냅샷", () => {
    const result = ok(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS)));
    expect(result.format).toBe("hometax-invoice");
    expect(result.lines).toHaveLength(3);
    const [first, second, amended] = result.lines;
    expect(first).toMatchObject({
      lineNo: 7,
      evidenceType: "invoice",
      approvalNo: "20260615-10260615-71160001",
      issuedOn: "2026-06-15",
      nameOnDocument: "공급회사가",
      businessNoDigits: "1234567891",
      totalKrw: 100000,
      supplyKrw: 100000,
      vatKrw: 0,
      merchant: null,
      cardLast4: null,
      needsCheck: null,
      originalApprovalNo: null,
    });
    expect(first?.approvalNo).toHaveLength(26);
    expect(first?.dedupeKey).toBe("hometax-invoice|20260615-10260615-71160001");
    expect(second).toMatchObject({ nameOnDocument: "공급회사나", totalKrw: 50000, supplyKrw: 50000, vatKrw: 0 });
    expect(amended).toMatchObject({ totalKrw: -10000, supplyKrw: -10000, vatKrw: 0, originalApprovalNo: "20260101-11111111-22222222" });
    expect(result.rateDates).toEqual([]);
    expect(EVIDENCE_FORMAT_TYPES).toContainEqual({ key: "hometax-invoice", evidenceType: "invoice" });
    expect(EVIDENCE_FORMATS.find((rule) => rule.key === "hometax-invoice")?.createsVendor).toBe(true);
  });

  it("세액 0을 줄에 명시해 finalizeAmounts가 역산하지 않는다(세율 · 규칙 맵이 비어도 그대로)", () => {
    const result = ok(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS)));
    expect(finalizeAmounts(result.lines, new Map(), new Map()).map((line) => [line.totalKrw, line.supplyKrw, line.vatKrw])).toEqual([
      [100000, 100000, 0],
      [50000, 50000, 0],
      [-10000, -10000, 0],
    ]);
  });

  it("세 번째 묶음 소문자 영숫자(C-86) → ok · 음수 줄 비고 당초 승인번호도 26자로 읽는다", () => {
    const result = ok(
      parseWorkbook(
        hometaxInvoiceFixture([
          { 승인번호: "20260615-10260615-ab12cd34" },
          { 승인번호: "20260616-10260616-zz99aa11", 공급가액: -10000, 비고: "당초 승인번호 (20260101-11111111-zz99aa11)" },
        ]),
      ),
    );
    expect(result.lines[0]?.approvalNo).toBe("20260615-10260615-ab12cd34");
    expect(result.lines[1]?.originalApprovalNo).toBe("20260101-11111111-zz99aa11");
  });

  it("음수 줄이라도 비고에 당초 승인번호가 없으면 원 승인번호 null(오류 아님)", () => {
    expect(ok(parseWorkbook(hometaxInvoiceFixture([{ 공급가액: -10000 }]))).lines).toMatchObject([{ totalKrw: -10000, originalApprovalNo: null }]);
  });

  it("xlsx · csv도 같은 줄 · 같은 열쇠(E39)", () => {
    const expected = ok(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS))).lines;
    expect(ok(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS, { as: "xlsx" }))).lines).toEqual(expected);
    expect(ok(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS, { as: "csv-utf8" }))).lines.map((line) => line.dedupeKey)).toEqual(
      expected.map((line) => line.dedupeKey),
    );
  });

  it("0행 사업자번호가 비거나 숫자 10자리가 아니면 모르는 서식(E18)", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{}], { company: "" }))).toMatchObject({ ok: false, kind: "unknown-format" });
    expect(parseWorkbook(hometaxInvoiceFixture([{}], { company: "723-**-*****" }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("받는자 사업자번호가 우리 회사 번호와 다르면 받는 사업자 다름(E18)", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{ 공급받는자사업자등록번호: "111-11-11111" }]))).toMatchObject({ ok: false, lines: ["7줄 · 받는 사업자 다름"] });
  });

  it("공급자 번호가 우리 회사 번호면 공급자가 자사(E18)", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{ 공급자사업자등록번호: "999-99-99997" }]))).toMatchObject({ ok: false, lines: ["7줄 · 공급자가 자사"] });
  });

  it("(B-F16) 같은 파일 안 같은 승인번호 두 줄 → 줄 오류 승인번호 겹침 · 파일 전체 거절(#2 없음)", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{}, {}]))).toEqual({ ok: false, kind: "line-errors", headline: "거절 · 오류 1줄", lines: ["8줄 · 승인번호 겹침"], restCount: 0 });
  });

  it("총 공급가액 다름 — 2행 총계가 줄 공급가액 합(음수 포함)과 1원 다르면 거절", () => {
    expect(parseWorkbook(hometaxInvoiceFixture(INVOICE_ROWS, { totals: [["총 공급가액", "140,001"]] }))).toEqual({
      ok: false,
      kind: "checksum",
      headline: "총 공급가액 다름 · 파일 140,001 · 줄 합 140,000",
      lines: [],
      restCount: 0,
    });
  });

  it("총 공급가액 읽지 못함 — 총계 칸이 비었거나 총계 낱말이 없으면 거절", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{}], { totals: [["총 공급가액", ""]] }))).toMatchObject({ ok: false, kind: "line-errors", lines: ["3줄 · 총 공급가액 읽지 못함"] });
    expect(parseWorkbook(hometaxInvoiceFixture([{}], { totals: [] }))).toMatchObject({ ok: false, kind: "line-errors", lines: ["3줄 · 총 공급가액 읽지 못함"] });
  });

  it("세액 칸이 없어도 띠에 계산서 낱말이 없거나 세금계산서와 함께 있으면 모르는 서식", () => {
    for (const band of ["매입 전자(수정) 목록조회", "매입 전자(수정) 계산서 · 세금계산서 목록조회"]) {
      expect(parseWorkbook(hometaxInvoiceFixture([{}], { band }))).toMatchObject({ ok: false, kind: "unknown-format" });
    }
  });

  it("합계금액 ≠ 공급가액 → 그 줄 합계 맞지 않음", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{ 합계금액: 100001 }]))).toMatchObject({ ok: false, lines: ["7줄 · 합계 맞지 않음"] });
  });

  it("작성일자가 깨지면 거절 · 오류 1줄 · 작성일 읽지 못함", () => {
    expect(parseWorkbook(hometaxInvoiceFixture([{}, { 승인번호: "20260616-10260616-71160002", 작성일자: "2026-02-30" }]))).toEqual({
      ok: false,
      kind: "line-errors",
      headline: "거절 · 오류 1줄",
      lines: ["8줄 · 작성일 읽지 못함"],
      restCount: 0,
    });
  });
});

describe("신한 회계양식(C-86)", () => {
  const OVERSEAS = "해외 이용 · 원화 금액 확인";

  it("기본 줄 → 서식 키 · 날짜 · 시각 · 합계 · 세액 · 공급가 null · 사업자번호 · 끝 4자리 · 열쇠 스냅숏", () => {
    const result = ok(parseWorkbook(shinhanAccountingFixture([{}])));
    expect(result.format).toBe("card-shinhan-accounting");
    expect(result.lines[0]).toMatchObject({
      evidenceType: "card_receipt",
      approvalNo: "09847552",
      issuedOn: "2026-05-28",
      usedAt: "18:43:28",
      totalKrw: 113400,
      vatKrw: 10309,
      supplyKrw: null,
      businessNoDigits: "1234567891",
      cardLast4: "1278",
      needsCheck: null,
    });
    expect(result.lines[0]?.dedupeKey).toBe("card-shinhan|1278|09847552|2026-05-28|113400");
  });

  it("승인시간 빈칸 → usedAt null · 승인번호 빈칸 → approvalNo null(오류 아님)", () => {
    const result = ok(parseWorkbook(shinhanAccountingFixture([{ 승인시간: "", 승인번호: "" }])));
    expect(result.lines[0]).toMatchObject({ usedAt: null, approvalNo: null });
  });

  it("사용구분 해외 · 국내인데 승인금액(외화) ≠ 0 → 해외 확인 · 외화거래국가코드 -는 판정에 안 쓴다", () => {
    expect(ok(parseWorkbook(shinhanAccountingFixture([{ 사용구분: "해외" }]))).lines[0]?.needsCheck).toBe(OVERSEAS);
    expect(ok(parseWorkbook(shinhanAccountingFixture([{ "승인금액(외화)": 12.5 }]))).lines[0]?.needsCheck).toBe(OVERSEAS);
    expect(ok(parseWorkbook(shinhanAccountingFixture([{ 외화거래국가코드: "-" }]))).lines[0]?.needsCheck).toBeNull();
  });

  it("부가세 0 → 면세 그대로 · finalizeAmounts 뒤 공급가 = 합계", () => {
    const result = ok(parseWorkbook(shinhanAccountingFixture([{ 부가세: 0 }])));
    expect(result.lines[0]?.vatKrw).toBe(0);
    expect(finalizeAmounts(result.lines, new Map(), new Map()).map((line) => [line.totalKrw, line.supplyKrw, line.vatKrw])).toEqual([[113400, 113400, 0]]);
  });

  it("공급가액(원화) 칸은 읽지 않는다 — 파일 값과 달라도 공급가 = 합계 − 부가세", () => {
    const result = ok(parseWorkbook(shinhanAccountingFixture([{ "공급가액(원화)": 1 }])));
    expect(finalizeAmounts(result.lines, new Map(), new Map()).map((line) => line.supplyKrw)).toEqual([103091]);
  });

  it("합계 양수 + 부가세 음수 → 부가세 맞지 않음 · 취소(합계 음수 · 부가세 0)는 오류 아님", () => {
    expect(parseWorkbook(shinhanAccountingFixture([{ 부가세: -10 }]))).toMatchObject({ ok: false, lines: ["2줄 · 부가세 맞지 않음"] });
    expect(ok(parseWorkbook(shinhanAccountingFixture([{ "승인금액(원화)": -5000, 부가세: 0 }]))).lines[0]).toMatchObject({ totalKrw: -5000, vatKrw: 0 });
  });

  it("승인일자 글자가 날짜 아님 → 승인일 읽지 못함 · 승인금액(원화) 글자 → 금액 읽지 못함", () => {
    expect(parseWorkbook(shinhanAccountingFixture([{ 승인일자: "2026.13.40" }]))).toMatchObject({ ok: false, lines: ["2줄 · 승인일 읽지 못함"] });
    expect(parseWorkbook(shinhanAccountingFixture([{ "승인금액(원화)": "가나다" }]))).toMatchObject({ ok: false, lines: ["2줄 · 금액 읽지 못함"] });
  });

  it("머리글 25칸 중 감지 칸이 빠지면 모르는 서식", () => {
    const header = SHINHAN_ACCOUNTING_HEADER.filter((name) => name !== "외화거래국가코드");
    expect(parseWorkbook(shinhanAccountingFixture([{}], { header }))).toMatchObject({ ok: false, kind: "unknown-format" });
  });
});

describe("등록 배열 · 서식 → 증빙 종류 표(C-F15)", () => {
  it("등록 서식은 정확히 일곱이고 표와 1:1", () => {
    expect(EVIDENCE_FORMATS.map((rule) => rule.key).sort()).toEqual([
      "card-bc",
      "card-lotte",
      "card-shinhan",
      "card-shinhan-accounting",
      "hometax-cash-receipt",
      "hometax-invoice",
      "hometax-tax-invoice",
    ]);
    expect(EVIDENCE_FORMATS.map((rule) => ({ key: rule.key, evidenceType: rule.evidenceType })).sort((a, b) => a.key.localeCompare(b.key))).toEqual(
      [...EVIDENCE_FORMAT_TYPES].sort((a, b) => a.key.localeCompare(b.key)),
    );
  });
});

// 07.1-03 PX3(C-78 02 P3-2 · E-P2-12) — 끝 4자리를 못 읽은 줄은 어느 카드인지 몰라 같은 승인번호여도 취소로 상쇄하지 않는다.
describe("splitOffsetPairs — 끝 4자리 없는 카드 줄", () => {
  const cardLine = (patch: Partial<ParsedLine>): ParsedLine => ({
    lineNo: 1,
    evidenceType: "card_receipt",
    approvalNo: "12040095",
    issuedOn: "2026-05-10",
    usedAt: "09:00:00",
    totalKrw: 12_500,
    vatKrw: null,
    supplyKrw: null,
    merchant: "가맹점가",
    businessNoDigits: null,
    nameOnDocument: null,
    cardLast4: "1278",
    needsCheck: null,
    originalApprovalNo: null,
    ...patch,
  });

  it("끝 4자리 null · 같은 승인번호 · 합 0 두 줄 → 상쇄 0 · 두 줄 그대로", () => {
    const lines = [cardLine({ lineNo: 1, cardLast4: null }), cardLine({ lineNo: 2, cardLast4: null, totalKrw: -12_500 })];
    const split = splitOffsetPairs(lines);
    expect(split.pairs).toHaveLength(0);
    expect(split.lines).toEqual(lines);
  });

  it("끝 4자리가 같은 두 줄은 상쇄 1(회귀)", () => {
    const original = cardLine({ lineNo: 1 });
    const cancel = cardLine({ lineNo: 2, totalKrw: -12_500 });
    const split = splitOffsetPairs([original, cancel]);
    expect(split.pairs).toEqual([{ original, cancel }]);
    expect(split.lines).toHaveLength(0);
  });
});
