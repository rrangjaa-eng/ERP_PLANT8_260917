import { describe, expect, it } from "vitest";
import { businessNoDigitsOf, cardLast4Of, cellDate, cellKrw, isBlankRow } from "@/domain/evidence-import/cells";
import { parseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";

// 06.1-02 — 서식 규칙 · 칸 정규화 헬퍼.

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
