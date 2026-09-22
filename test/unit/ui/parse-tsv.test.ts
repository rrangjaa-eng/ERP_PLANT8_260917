import { describe, expect, it } from "vitest";
import { parseTsv, toTsv, normalizeNumericPaste } from "@/ui/table/parse-tsv";

// 04-04 Task 1 ① — 클립보드 TSV 상태 기계 파서(04-RESEARCH.md Pattern 4).
// 인용된 칸의 탭·줄바꿈·이스케이프된 따옴표를 리터럴로 다룬다 — 단순
// split("\t")/split("\n")은 비고 열의 실제 줄바꿈에서 깨진다.
describe("parseTsv", () => {
  it("탭·줄바꿈으로 2차원 배열을 만든다", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("인용된 칸 안의 줄바꿈은 리터럴이고 행을 둘로 가르지 않는다", () => {
    expect(parseTsv('a\t"b\nc"\td')).toEqual([["a", "b\nc", "d"]]);
  });

  it('인용된 칸 안의 이스케이프된 따옴표(""가 ")를 해제한다', () => {
    expect(parseTsv('a\t"b""c"')).toEqual([["a", 'b"c']]);
  });

  it("CRLF의 캐리지 리턴이 값에 남지 않는다", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("가운데 빈 칸이 사라지지 않는다", () => {
    expect(parseTsv("a\t\tb")).toEqual([["a", "", "b"]]);
  });

  it("빈 문자열은 빈 칸 하나를 가진 한 행이다(값을 통째로 삼키지 않는다)", () => {
    expect(parseTsv("")).toEqual([[""]]);
  });

  it("toTsv(parseTsv(x))가 x와 같은 표를 다시 만든다(왕복 — 인용 칸 포함)", () => {
    const original = 'a\t"b\nc"\td';
    expect(toTsv(parseTsv(original))).toBe(original);
  });

  it("toTsv(parseTsv(x))가 x와 같은 표를 다시 만든다(왕복 — 단순 표)", () => {
    const original = "a\tb\nc\td";
    expect(toTsv(parseTsv(original))).toBe(original);
  });
});

// 04-04 Task 1 ③ — 숫자 열 붙여넣기 정규화(§7-3 (다)). 쉼표·공백·통화
// 기호를 지운 뒤 숫자로 읽고, 그래도 숫자가 아니면 null(오류 셀 신호).
describe("normalizeNumericPaste", () => {
  it('"1,200,000" → 1200000', () => {
    expect(normalizeNumericPaste("1,200,000")).toBe(1_200_000);
  });

  it('" 1 200 000 " → 1200000(공백 제거)', () => {
    expect(normalizeNumericPaste(" 1 200 000 ")).toBe(1_200_000);
  });

  it('"₩1,200,000" → 1200000(통화 기호 제거)', () => {
    expect(normalizeNumericPaste("₩1,200,000")).toBe(1_200_000);
  });

  it('"약 120만"은 숫자가 아니다 — null(오류 셀 신호, 조용히 버리지 않는다)', () => {
    expect(normalizeNumericPaste("약 120만")).toBeNull();
  });
});
