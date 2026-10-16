import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { sizeRefusalHeadline, rowRefusalHeadline, EVIDENCE_IMPORT_MAX_BYTES, EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import { finalizeAmounts, parseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import { sniff } from "@/domain/evidence-import/workbook";
import { readWorkbookRows, zipEntryStats } from "@/lib/xlsx-server";
import { cardLotte } from "@/domain/evidence-import/formats/card-lotte";
import {
  encryptedFixture,
  forgedZipFixture,
  hometaxTaxInvoiceFixture,
  LOTTE_HEADER,
  lotteFixture,
  manyEntriesZipFixture,
  shinhanFixture,
  writeBook,
  zipBombFixture,
  type FixtureRow,
} from "@/test/fixtures/evidence-import/build";

// 06.1-02 — 바이트 → 판별 → 읽기 → 서식 규칙 → 열쇠 → 두 단계 금액(롯데 트레이서).

function ok(result: ParseResult) {
  if (!result.ok) throw new Error(`거절됨: ${result.headline}`);
  return result;
}

// 롯데 픽스처 줄: 정상 1 · 빈 줄 · 원거래 + 같은 값 취소(상쇄 쌍) · 부분 취소 음수 · 끝 빈 줄.
const LOTTE_ROWS: FixtureRow[] = [
  {},
  null,
  { 승인번호: "11112222", 매입일자: "2026.05.01", 매입금액: "10,000", 부가세: "909" },
  { 승인번호: "11112222", 매입일자: "2026.05.01", 매입금액: "-10,000", 부가세: "-909", 취소일자: "2026.05.02" },
  { 승인번호: "33334444", 매입일자: "2026.05.03", 매입금액: "-4,000", 부가세: "-364" },
  null,
];

describe("sniff — 확장자가 아니라 내용으로", () => {
  it("CFB · xlsx · html · csv · 모름", () => {
    expect(sniff(lotteFixture([{}]))).toBe("cfb");
    expect(sniff(lotteFixture([{}], { as: "xlsx" }))).toBe("xlsx");
    expect(sniff(new TextEncoder().encode("<html><table><tr><td>1</td></tr></table></html>"))).toBe("html");
    expect(sniff(new TextEncoder().encode("  \n<table><tr><td>1</td></tr></table>"))).toBe("html");
    expect(sniff(lotteFixture([{}], { as: "csv-utf8" }))).toBe("csv");
    expect(sniff(lotteFixture([{}], { as: "csv-euckr" }))).toBe("csv");
    expect(sniff(new Uint8Array([0x12, 0x00, 0xff, 0x00, 0x33, 0x44, 0x00, 0x01]))).toBe("unknown");
  });
});

describe("limits — 클라이언트 안전 상한 문구", () => {
  it("크기 거절 문구는 소수 첫째 자리 MB", () => {
    expect(EVIDENCE_IMPORT_MAX_BYTES).toBe(1_000_000);
    expect(sizeRefusalHeadline(1_000_001)).toBe("1.0MB · 1MB 초과 · 기간을 나눠 다시 내려받기");
    expect(sizeRefusalHeadline(1_400_000)).toBe("1.4MB · 1MB 초과 · 기간을 나눠 다시 내려받기");
  });

  it("행 거절 문구는 천 단위 쉼표", () => {
    expect(EVIDENCE_IMPORT_MAX_ROWS).toBe(3000);
    expect(rowRefusalHeadline(3001)).toBe("3,001줄 · 3,000줄 초과 · 기간을 나눠 다시 내려받기");
  });

  it("크기 상한을 넘는 바이트는 읽기 전에 거절", () => {
    const read = vi.fn(readWorkbookRows);
    const result = parseWorkbook(new Uint8Array(1_000_001), { deps: { readWorkbookRows: read } });
    expect(result).toMatchObject({ ok: false, kind: "size", headline: "1.0MB · 1MB 초과 · 기간을 나눠 다시 내려받기" });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("롯데 트레이서 — .xls", () => {
  it("상쇄 쌍 둘은 빠지고 부분 취소는 남고 빈 줄은 건너뛴다", () => {
    const result = ok(parseWorkbook(lotteFixture(LOTTE_ROWS)));
    expect(result.format).toBe("card-lotte");
    expect(result.lines).toHaveLength(2);
    expect(result.offsetPairs).toBe(1);
    expect(result.rateDates).toEqual([]);
    expect(result.lines.map((line) => line.totalKrw)).toEqual([204100, -4000]);
  });

  it("열쇠 스냅샷 — 접두어는 서식 키", () => {
    const result = ok(parseWorkbook(lotteFixture(LOTTE_ROWS)));
    expect(result.lines[0]?.dedupeKey).toBe("card-lotte|2222|44403241|2026-04-30|204100");
    expect(result.lines[0]?.baseKey).toBe("card-lotte|2222|44403241|2026-04-30|204100");
    expect(result.lines[0]?.sameKeyCount).toBe(1);
  });

  it("결과 어디에도 카드 번호 16자리가 없다", () => {
    const result = ok(parseWorkbook(lotteFixture(LOTTE_ROWS)));
    expect(JSON.stringify(result)).not.toMatch(/\d{16}/);
    expect(result.lines[0]?.cardLast4).toBe("2222");
  });

  it("같은 픽스처를 두 번 파싱하면 열쇠 목록이 같다", () => {
    const keys = () => ok(parseWorkbook(lotteFixture(LOTTE_ROWS))).lines.map((line) => line.dedupeKey);
    expect(keys()).toEqual(keys());
  });

  it("열쇠가 같은 두 카드 줄 — 둘째에 #2 · 같은 baseKey · sameKeyCount 2", () => {
    const result = ok(parseWorkbook(lotteFixture([{}, {}, { 승인번호: "55556666" }])));
    const [first, second, third] = result.lines;
    expect(first?.dedupeKey).toBe("card-lotte|2222|44403241|2026-04-30|204100");
    expect(second?.dedupeKey).toBe("card-lotte|2222|44403241|2026-04-30|204100#2");
    expect(first?.baseKey).toBe(second?.baseKey);
    expect([first?.sameKeyCount, second?.sameKeyCount]).toEqual([2, 2]);
    expect(third?.sameKeyCount).toBe(1);
    expect(third?.baseKey).toBe(third?.dedupeKey);
  });

  it("두 단계 금액 — 파일 부가세로 공급가 = 합계 − 부가세", () => {
    const result = ok(parseWorkbook(lotteFixture([{}])));
    const [line] = finalizeAmounts(result.lines, new Map(), new Map());
    expect(line).toMatchObject({ totalKrw: 204100, vatKrw: 18554, supplyKrw: 185546 });
  });

  it("줄 하나의 금액이 글자면 파일 전체 거절 — 다른 줄도 등록되지 않는다", () => {
    const result = parseWorkbook(lotteFixture([{}, { 매입금액: "abc" }]));
    expect(result).toEqual({ ok: false, kind: "line-errors", headline: "거절 · 오류 1줄", lines: ["4줄 · 금액 읽지 못함"], restCount: 0 });
  });

  it("줄 오류는 앞 5줄 + 나머지 수", () => {
    const bad: FixtureRow[] = Array.from({ length: 7 }, () => ({ 매입일자: "어제" }));
    const result = parseWorkbook(lotteFixture(bad));
    expect(result).toMatchObject({ ok: false, kind: "line-errors", headline: "거절 · 오류 7줄", restCount: 2 });
    if (result.ok) return;
    expect(result.lines).toEqual(["3줄 · 매입일 읽지 못함", "4줄 · 매입일 읽지 못함", "5줄 · 매입일 읽지 못함", "6줄 · 매입일 읽지 못함", "7줄 · 매입일 읽지 못함"]);
  });
});

describe("롯데 트레이서 — xlsx · csv(E39)", () => {
  const expected = ok(parseWorkbook(lotteFixture(LOTTE_ROWS)));
  for (const as of ["xlsx", "csv-utf8", "csv-euckr"] as const) {
    it(`${as}는 .xls와 같은 줄 · 같은 열쇠`, () => {
      const result = ok(parseWorkbook(lotteFixture(LOTTE_ROWS, { as })));
      expect(result.format).toBe("card-lotte");
      expect(result.lines).toEqual(expected.lines);
      expect(result.offsetPairs).toBe(1);
    });
  }

  it("csv는 풀린 글자로 넘어간다 — EUC-KR도 SheetJS 코드페이지 짐작 없음", () => {
    const read = vi.fn(readWorkbookRows);
    ok(parseWorkbook(lotteFixture(LOTTE_ROWS, { as: "csv-euckr" }), { deps: { readWorkbookRows: read } }));
    expect(read).toHaveBeenCalled();
    for (const call of read.mock.calls) {
      const input = call[0];
      expect(input instanceof Uint8Array).toBe(false);
      if (input instanceof Uint8Array) return;
      expect(input.text).toContain("매입내역");
    }
  });
});

describe("손상 · 암호 · 압축 폭탄 — SheetJS 예외가 새지 않는다(E9 · P2-A4)", () => {
  it("앞 2KB로 자른 바이트 → 엑셀·CSV 파일 아님", () => {
    const bytes = lotteFixture(LOTTE_ROWS).subarray(0, 2048);
    expect(parseWorkbook(bytes)).toMatchObject({ ok: false, kind: "not-excel", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로" });
  });

  it("html 바이트 → 엑셀·CSV 파일 아님", () => {
    const bytes = new TextEncoder().encode("<html><table><tr><td>매입내역</td></tr></table></html>");
    expect(parseWorkbook(bytes)).toMatchObject({ ok: false, kind: "not-excel" });
  });

  it("암호 걸린 파일 → 암호 풀고 다시 저장", () => {
    expect(parseWorkbook(encryptedFixture())).toMatchObject({ ok: false, kind: "encrypted", headline: "암호 걸린 파일 · 암호 풀고 다시 저장" });
  });

  it("풀린 크기를 부풀린 xlsx → 거절 · SheetJS 읽기 호출 0", () => {
    const read = vi.fn(readWorkbookRows);
    const result = parseWorkbook(zipBombFixture(), { deps: { readWorkbookRows: read } });
    expect(result).toMatchObject({ ok: false, kind: "not-excel", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로" });
    expect(read).not.toHaveBeenCalled();
  });

  it("항목 201개 zip → 같은 거절 · 읽기 호출 0", () => {
    const read = vi.fn(readWorkbookRows);
    const result = parseWorkbook(manyEntriesZipFixture(201), { deps: { readWorkbookRows: read } });
    expect(result).toMatchObject({ ok: false, kind: "not-excel" });
    expect(read).not.toHaveBeenCalled();
  });

  it("readWorkbookRows도 상한을 넘는 zip은 SheetJS에 넘기지 않고 던진다", () => {
    expect(() => readWorkbookRows(zipBombFixture(), { zipLimits: { maxEntries: 200, maxUnzippedBytes: 20_000_000 } })).toThrow("zip-limits");
  });

  // 독립 검토 P1-1 — SheetJS는 로컬 헤더 · ZIP64 칸으로 풀 크기를 정하고 중앙 디렉터리와의 차이는 다 푼 뒤에 본다.
  for (const forgery of ["local-size", "data-descriptor", "zip64-local", "zip64-central", "zero-size-deflate", "method"] as const) {
    it(`위조 zip(${forgery}) → zipEntryStats null · 거절 · SheetJS 읽기 호출 0`, () => {
      const bytes = forgedZipFixture(forgery);
      expect(bytes.length).toBeLessThan(EVIDENCE_IMPORT_MAX_BYTES);
      expect(zipEntryStats(bytes)).toBeNull();
      const read = vi.fn(readWorkbookRows);
      expect(parseWorkbook(bytes, { deps: { readWorkbookRows: read } })).toMatchObject({ ok: false, kind: "not-excel", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로" });
      expect(read).not.toHaveBeenCalled();
    });
  }

  it("readWorkbookRows도 로컬 헤더 크기가 다른 zip은 SheetJS에 넘기지 않고 던진다", () => {
    expect(() => readWorkbookRows(forgedZipFixture("local-size"), { zipLimits: { maxEntries: 200, maxUnzippedBytes: 20_000_000 } })).toThrow("zip-limits");
  });

  it("정상 롯데 xlsx의 zipEntryStats는 항목 수 · 풀린 크기 합", () => {
    const stats = zipEntryStats(lotteFixture(LOTTE_ROWS, { as: "xlsx" }));
    expect(stats).not.toBeNull();
    expect(stats?.entries).toBeGreaterThan(3);
    expect(stats?.entries).toBeLessThan(200);
    expect(stats?.uncompressedBytes).toBeGreaterThan(1000);
    expect(zipEntryStats(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("픽스처 왕복(B-F22)", () => {
  it("시트 이름 · 머리글 22칸 · 패딩 문자열 · 실수 숫자가 그대로 돌아온다", () => {
    const bytes = lotteFixture([{ 가맹점명: "   가맹점가   ", 매입금액: 113400.5 }]);
    const book = XLSX.read(bytes, { type: "array", dense: true });
    expect(book.SheetNames).toEqual(["매입내역"]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["매입내역"] as XLSX.WorkSheet, { header: 1, raw: true, defval: null });
    expect(rows[1]).toHaveLength(22);
    expect(rows[2]?.[8]).toBe("   가맹점가   ");
    expect(rows[2]?.[9]).toBe(113400.5);
  });
});

describe("컨테이너 · 시트 수 · 행 상한(B-F18 · P1-4)", () => {
  it("등록 서식이 선언하지 않은 컨테이너는 SheetJS에 넘기지 않는다", () => {
    const read = vi.fn(readWorkbookRows);
    const formats = [{ ...cardLotte, containers: ["cfb"] as const }];
    const result = parseWorkbook(lotteFixture([{}], { as: "xlsx" }), { formats, deps: { readWorkbookRows: read } });
    expect(result).toMatchObject({ ok: false, kind: "unknown-format" });
    expect(read).not.toHaveBeenCalled();
    expect(parseWorkbook(lotteFixture([{}]), { formats })).toMatchObject({ ok: true });
  });

  it("시트 6장짜리 통합문서 → 모르는 서식", () => {
    const sheet = { rows: [["매입내역"], [...LOTTE_HEADER]] };
    const bytes = writeBook(Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, ...sheet })));
    expect(parseWorkbook(bytes)).toMatchObject({ ok: false, kind: "unknown-format" });
  });

  it("홈택스 품목 시트가 상한을 넘어도 세금계산서 시트가 상한 안이면 거절되지 않는다", () => {
    expect(parseWorkbook(hometaxTaxInvoiceFixture([{}], { itemRows: 3100 }))).toMatchObject({ ok: true, format: "hometax-tax-invoice" });
  });

  it("NUL 섞인 무작위 바이트 → 엑셀·CSV 파일 아님", () => {
    expect(parseWorkbook(new Uint8Array([0x13, 0x00, 0x99, 0x00, 0x01, 0xfe]))).toMatchObject({ ok: false, kind: "not-excel", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로" });
  });

  const rowsOf = (n: number): FixtureRow[] => Array.from({ length: n }, (_, i) => ({ 승인번호: String(10000000 + i) }));
  const over = rowsOf(3001);
  const atLimit = rowsOf(3000);
  for (const as of ["xls", "xlsx", "csv-utf8", "csv-euckr"] as const) {
    it(`데이터 3001줄 ${as} → 3,001줄 거절 · 등록 줄 0`, () => {
      expect(parseWorkbook(shinhanFixture(over, { as }))).toEqual({
        ok: false,
        kind: "rows",
        headline: "3,001줄 · 3,000줄 초과 · 기간을 나눠 다시 내려받기",
        lines: [],
        restCount: 0,
      });
    });

    it(`데이터 3000줄 ${as} → 통과`, () => {
      const result = parseWorkbook(shinhanFixture(atLimit, { as }));
      expect(result.ok ? result.lines.length : result.headline).toBe(3000);
    });
  }

  it("데이터 2999줄 + 끝 빈 줄 5개 csv → 읽기 한도에 닿으면 거절(끝 빈 줄 fail-closed)", () => {
    const csv = shinhanFixture(rowsOf(2999), { as: "csv-utf8" });
    const padded = new Uint8Array([...csv, ...new TextEncoder().encode("\n\n\n\n\n")]);
    expect(parseWorkbook(padded)).toMatchObject({ ok: false, kind: "rows" });
  });
});
