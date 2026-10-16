import * as XLSX from "xlsx";
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";

// 06.1-02 — 증빙 가져오기 서식별 가린 픽스처(테스트 시점 생성 — 실물 견본은 저장소에 넣지 않는다).
// 머리글은 견본 실측값(old-samples.md · RESEARCH 「서식별 읽기 규칙」), 값은 전부 지어낸 가짜다.
// 06.1-04 · 05 · 09 · 11이 같은 생성기를 다시 쓴다.

export type FixtureCell = string | number | null;
export type FixtureRow = Record<string, FixtureCell> | null; // null = 전부 빈 줄
export type FixtureAs = "xls" | "xlsx" | "csv-utf8" | "csv-euckr";
export type FixtureOptions = { as?: FixtureAs };

// 국세청 검증 숫자가 맞는 가짜 사업자번호(06.1-04 · 11 거래처 생성 케이스) · 틀린 번호(검증 실패 케이스만).
export const FAKE_BUSINESS_NO = "123-45-67891";
export const FAKE_BUSINESS_NO_BAD = "123-45-67890";
// 홈택스 0행 「우리 회사」 번호 — 검증 숫자가 맞고 공급자 번호와 겹치지 않는다.
export const FAKE_COMPANY_BUSINESS_NO = "999-99-99997";

type SheetSpec = { name: string; rows: FixtureCell[][]; merges?: XLSX.Range[] };

// cpexcel.full.mjs의 `utils`는 런타임 이름 내보내기지만 cpexcel.d.ts에 선언이 없다 — 꺼내서 모양을 확인한다.
type CpEncoder = { encode(cp: number, data: string): ArrayLike<number> };
function cpEncoder(): CpEncoder {
  const utils: unknown = Reflect.get(cpexcel, "utils");
  if (typeof utils !== "object" || utils === null || typeof Reflect.get(utils, "encode") !== "function") {
    throw new Error("cpexcel utils.encode 없음");
  }
  return utils as CpEncoder;
}

export function writeBook(sheets: readonly SheetSpec[], as: FixtureAs = "xls"): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const spec of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(spec.rows);
    if (spec.merges) sheet["!merges"] = spec.merges;
    XLSX.utils.book_append_sheet(book, sheet, spec.name);
  }
  if (as === "xls") return new Uint8Array(XLSX.write(book, { type: "array", bookType: "biff8" }) as ArrayBuffer);
  if (as === "xlsx") return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const first = sheets[0];
  if (!first) throw new Error("시트 없음");
  const text = XLSX.utils.sheet_to_csv(book.Sheets[first.name] as XLSX.WorkSheet);
  if (as === "csv-utf8") return new TextEncoder().encode(`﻿${text}`);
  return Uint8Array.from(cpEncoder().encode(949, text));
}

function rowsOf(header: readonly string[], defaults: Record<string, FixtureCell>, rows: readonly FixtureRow[]): FixtureCell[][] {
  return rows.map((row) => (row === null ? header.map(() => null) : header.map((name) => (name in row ? (row[name] ?? null) : (defaults[name] ?? null)))));
}

export const LOTTE_HEADER = [
  "청구예정일",
  "그룹번호",
  "그룹명",
  "카드번호",
  "회원명",
  "소속사사번",
  "매입일자",
  "매입시간",
  "가맹점명",
  "매입금액",
  "부가세",
  "취소일자",
  "현지거래금액",
  "환급여부",
  "승인번호",
  "일시불/할부",
  "사업자번호",
  "가맹점번호",
  "가맹점업종",
  "가맹점주소",
  "하위가맹점명",
  "Account No",
] as const;

const LOTTE_DEFAULTS: Record<string, FixtureCell> = {
  청구예정일: "2026.06.14",
  그룹번호: "0000",
  그룹명: "그룹가",
  카드번호: "9999000011112222",
  회원명: "가명",
  소속사사번: "",
  매입일자: "2026.04.30",
  매입시간: "17:59:03",
  가맹점명: "가맹점가",
  매입금액: "204,100",
  부가세: "18,554",
  취소일자: "",
  현지거래금액: "0",
  환급여부: "",
  승인번호: "44403241",
  "일시불/할부": "일시불",
  사업자번호: FAKE_BUSINESS_NO.replaceAll("-", ""),
  가맹점번호: "000000",
  가맹점업종: "업종가",
  가맹점주소: "주소가",
  하위가맹점명: "",
  "Account No": "",
};

// 롯데 매입내역 — 1줄 병합 제목 `매입내역`, 2줄 머리글 22칸, 3줄부터 데이터.
export function lotteFixture(rows: readonly FixtureRow[], opts: FixtureOptions & { header?: readonly string[] } = {}): Uint8Array {
  const header = opts.header ?? LOTTE_HEADER;
  const title: FixtureCell[] = header.map((_, i) => (i === 0 ? "매입내역" : null));
  return writeBook(
    [
      {
        name: "매입내역",
        rows: [title, [...header], ...rowsOf(header, LOTTE_DEFAULTS, rows)],
        merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }],
      },
    ],
    opts.as,
  );
}

// 암호 걸린 통합문서(Office 암호화 꼴) — CFB 안에 EncryptionInfo · EncryptedPackage 스트림만 둔다.
export function encryptedFixture(): Uint8Array {
  const cfb: unknown = XLSX.CFB;
  if (typeof cfb !== "object" || cfb === null) throw new Error("CFB 없음");
  const api = cfb as {
    utils: { cfb_new(): unknown; cfb_add(c: unknown, path: string, data: Uint8Array): void };
    write(c: unknown, o: { type: "array" }): ArrayLike<number>;
  };
  const container = api.utils.cfb_new();
  api.utils.cfb_add(container, "/EncryptionInfo", new Uint8Array([4, 0, 4, 0, 0x40, 0, 0, 0]));
  api.utils.cfb_add(container, "/EncryptedPackage", new Uint8Array(64));
  return Uint8Array.from(api.write(container, { type: "array" }));
}

// 항목 수만 많은 zip(xlsx 머리) — 항목 수 상한 케이스.
export function manyEntriesZipFixture(entries: number): Uint8Array {
  const cfb: unknown = XLSX.CFB;
  const api = cfb as {
    utils: { cfb_new(): unknown; cfb_add(c: unknown, path: string, data: Uint8Array): void };
    write(c: unknown, o: { type: "array"; fileType: "zip" }): ArrayLike<number>;
  };
  const container = api.utils.cfb_new();
  for (let i = 0; i < entries; i++) api.utils.cfb_add(container, `/e${i}.txt`, new Uint8Array([0x41]));
  return Uint8Array.from(api.write(container, { type: "array", fileType: "zip" }));
}

// 압축 폭탄 꼴 — 정상 롯데 xlsx의 중앙 디렉터리 · 지역 머리 「풀린 크기」 칸을 25MB로 부풀린다(P2-A4).
export function zipBombFixture(): Uint8Array {
  const bytes = lotteFixture([{}], { as: "xlsx" });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inflated = 25_000_000;
  for (let at = 0; at + 4 <= bytes.length; at++) {
    const sig = view.getUint32(at, true);
    if (sig === 0x04034b50 && at + 26 <= bytes.length) view.setUint32(at + 22, inflated, true);
    if (sig === 0x02014b50 && at + 28 <= bytes.length) view.setUint32(at + 24, inflated, true);
  }
  return bytes;
}
