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

  // 04-04 Task 3 인간 확인 — 실제 Windows Excel(2026-09-23 캡처)에서 3×3
  // 영역(헤더 행 + 번호 열 포함)을 복사한 clipboard text/plain 원문.
  // 처음 구현은 따옴표만 있고 줄바꿈은 없는 칸(`"대형" 현수막`)도 인용된
  // 칸으로 오인해 따옴표를 지워 버렸다 — 이 회귀 테스트가 그 결함을 잡는다.
  const REAL_EXCEL_WINDOWS_20260923 =
    '\tA\tB\tC\r\n1\t무대 설치\t2\t 1,200,000 \r\n2\t"대형" 현수막\t5\t 35,000 \r\n3\t"비고 첫 줄\r\n둘째 줄"\t1\t₩450,000 ';

  it("실제 엑셀(Windows, 2026-09-23 캡처) 원문 — 따옴표만 있는 칸은 따옴표를 지우지 않고, 줄바꿈이 있는 칸만 인용 해제한다", () => {
    expect(parseTsv(REAL_EXCEL_WINDOWS_20260923)).toEqual([
      ["", "A", "B", "C"],
      ["1", "무대 설치", "2", " 1,200,000 "],
      ["2", '"대형" 현수막', "5", " 35,000 "],
      ["3", "비고 첫 줄\n둘째 줄", "1", "₩450,000 "],
    ]);
  });

  it('여는 따옴표 뒤에 탭·줄바꿈이 바로 오지 않는 칸은 인용된 칸이 아니다 — 따옴표를 리터럴로 남긴다: a\\t"대형" 현수막\\tb', () => {
    expect(parseTsv('a\t"대형" 현수막\tb')).toEqual([["a", '"대형" 현수막', "b"]]);
  });

  it('따옴표만 있고 줄바꿈이 없는 칸 하나("12" 모니터)는 그대로 리터럴이다', () => {
    expect(parseTsv('"12" 모니터')).toEqual([['"12" 모니터']]);
  });

  it("인용된 칸 안의 CRLF는 LF 하나로 정규화된다(캐리지 리턴이 값에 남지 않는다)", () => {
    expect(parseTsv('a\t"1행\r\n2행"\tb')).toEqual([["a", "1행\n2행", "b"]]);
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

  // F3 — 견적 표 타이핑 커밋도 이 파서를 재사용한다(quote-table.tsx). 쉼표
  // 천 단위 구분과 소수점(USD 단가 등)이 `Number(value) || 0`처럼 0으로
  // 뭉개지지 않는지 확인한다.
  it('"1,000,000" → 1000000', () => {
    expect(normalizeNumericPaste("1,000,000")).toBe(1_000_000);
  });

  it('"1234.56" → 1234.56', () => {
    expect(normalizeNumericPaste("1234.56")).toBe(1234.56);
  });

  // 04-09 — 제거 규칙이 lib/format-number.ts의 stripNumberInput 호출로
  // 바뀐 뒤에도(엔지 리뷰 A P3) 04-04가 사람 확인까지 거친 결과가 그대로다.
  it('"$4,400.00" → 4400 · "¥1,000" → 1000 · "￦1,000" → 1000(통화 기호 전부 제거)', () => {
    expect(normalizeNumericPaste("$4,400.00")).toBe(4400);
    expect(normalizeNumericPaste("¥1,000")).toBe(1000);
    expect(normalizeNumericPaste("￦1,000")).toBe(1000);
  });

  it('"-1,200" → -1200(음수)', () => {
    expect(normalizeNumericPaste("-1,200")).toBe(-1200);
  });

  it("공백만 있는 값·빈 문자열은 null이다", () => {
    expect(normalizeNumericPaste("")).toBeNull();
    expect(normalizeNumericPaste("   ")).toBeNull();
  });
});
