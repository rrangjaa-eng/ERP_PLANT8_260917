// 06.5-06(D-6504): SheetJS 쓰기를 부르는 유일한 모듈 — 문자열 서식 셀만으로 시트 하나짜리 통합 문서를 만들어 바이트를 돌려준다.
// 셀은 손으로 짓는다(`{ t: "s", v, z: "@" }` — 옛 O: app/src/domain/bankTransfer.ts:610). 값을 보고 형을 정하는 aoa_to_sheet는
// `088` 같은 숫자만 든 글자를 숫자 셀로 돌려 앞자리 0을 날린다.
// `server-only`를 import하지 않는다 — domain/*가 부르고 테스트(Vitest node)가 그 domain을 읽는다(lib/auth.ts 머리주석 규약).
// 대신 `xlsx` import는 이 파일(과 시험)만 하도록 eslint.config.mjs의 no-restricted-imports가 지킨다(EP2-C1).
// 06.1-02: 읽기 함수(증빙 가져오기) — SheetJS 타입을 밖으로 내보내지 않고 평범한 값만 돌려준다.
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";
import { cptable } from "xlsx/dist/cpexcel.full.mjs";

// CP949 표(SheetJS codepage — xlsx 패키지에 함께 든 것, 새 의존성 아님). 파일은 유니코드 xlsx지만 신한이 CP949로 받으므로
// 표에 없는 글자는 그 줄을 깬다. Node TextDecoder("euc-kr")는 확장 완성형(똠 등)을 못 풀어 쓰지 않는다.
const CP949_ENCODE = cptable[949]?.enc ?? {};

export function isCp949Encodable(char: string): boolean {
  return Object.hasOwn(CP949_ENCODE, char);
}

export function buildTextSheetXlsx(sheetName: string, rows: readonly (readonly string[])[]): Uint8Array {
  const sheet: XLSX.WorkSheet = {};
  let lastCol = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value, z: "@" };
      lastCol = Math.max(lastCol, c);
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: lastCol } });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}

// ── 06.1-02 읽기 함수 ─────────────────────────────────────────────

export type ZipLimits = { maxEntries: number; maxUnzippedBytes: number };
export type ReadWorkbookOptions = { sheetRows?: number; onlySheet?: string; zipLimits?: ZipLimits };
export type ReadSheet = { name: string; rows: unknown[][]; fullRef: string | null; hitRowLimit: boolean };
export type ReadBook = { sheetNames: string[]; sheets: ReadSheet[]; date1904: boolean };

const ZIP_HEAD = [0x50, 0x4b, 0x03, 0x04];

// 바이트(cfb · xlsx) 또는 풀린 csv 글자 → 시트 이름 · 행 배열. 배열 모드(`header: 1`)만 — 중복 머리글이 객체 키를 덮지 않는다.
// csv를 글자로 받는 까닭: SheetJS가 바이트의 코드페이지를 짐작하지 않게(호출자가 UTF-8 · CP949를 먼저 푼다).
// 예외는 삼키지 않는다 — 거절 종류로 바꾸는 것은 domain/evidence-import/workbook.ts.
export function readWorkbookRows(input: Uint8Array | { text: string }, opts: ReadWorkbookOptions = {}): ReadBook {
  const isText = !(input instanceof Uint8Array);
  if (!isText && opts.zipLimits && ZIP_HEAD.every((b, i) => input[i] === b)) {
    // SheetJS는 read 순간 zip 항목을 전부 푼다 — 중앙 디렉터리 통계로 먼저 막는다(압축 폭탄).
    const stats = zipEntryStats(input);
    if (!stats || stats.entries > opts.zipLimits.maxEntries || stats.uncompressedBytes > opts.zipLimits.maxUnzippedBytes) {
      throw new Error("zip-limits");
    }
  }
  const book = XLSX.read(isText ? input.text : input, {
    type: isText ? "string" : "array",
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    cellNF: false,
    cellStyles: false,
    raw: isText,
    sheetRows: opts.sheetRows,
    sheets: opts.onlySheet,
  });
  const names = opts.onlySheet === undefined ? book.SheetNames : book.SheetNames.filter((name) => name === opts.onlySheet);
  const sheets: ReadSheet[] = [];
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: true, raw: true });
    const fullRef: unknown = sheet["!fullref"];
    sheets.push({
      name,
      rows,
      fullRef: typeof fullRef === "string" ? fullRef : null,
      hitRowLimit: opts.sheetRows !== undefined && rows.length >= opts.sheetRows,
    });
  }
  return { sheetNames: [...book.SheetNames], sheets, date1904: book.Workbook?.WBProps?.date1904 === true };
}

export type DateParts = { y: number; m: number; d: number; H: number; M: number; S: number };

// SSF는 타입 선언이 `any`라 모양을 확인하고 쓴다.
function isDateParts(value: unknown): value is DateParts {
  if (typeof value !== "object" || value === null) return false;
  return ["y", "m", "d", "H", "M", "S"].every((key) => typeof Reflect.get(value, key) === "number");
}

// 엑셀 일련번호 → 연 · 월 · 일 · 시 · 분 · 초(통합문서의 1904 날짜 체계를 따른다). 시간대 변환 없음.
export function excelSerialDateParts(serial: number, date1904: boolean): DateParts | null {
  const ssf: unknown = XLSX.SSF;
  if (typeof ssf !== "object" || ssf === null) return null;
  const parse: unknown = Reflect.get(ssf, "parse_date_code");
  if (typeof parse !== "function") return null;
  const parts: unknown = Reflect.apply(parse, ssf, [serial, { date1904 }]);
  return isDateParts(parts) ? { y: parts.y, m: parts.m, d: parts.d, H: parts.H, M: parts.M, S: parts.S } : null;
}

// cpexcel.full.mjs의 `utils`는 런타임 이름 내보내기지만 cpexcel.d.ts에 선언이 없다(`cptable.utils`는 런타임에 없다).
function cpDecode(cp: number, bytes: Uint8Array): string {
  const utils: unknown = Reflect.get(cpexcel, "utils");
  const decode: unknown = typeof utils === "object" && utils !== null ? Reflect.get(utils, "decode") : undefined;
  if (typeof decode !== "function") throw new Error("cpexcel decode 없음");
  const text: unknown = Reflect.apply(decode, utils, [cp, bytes]);
  if (typeof text !== "string") throw new Error("cpexcel decode 결과 아님");
  return text;
}

// CP949(확장 완성형 포함) 바이트 → 글자. TextDecoder("euc-kr")는 확장 완성형을 못 푼다(위 CP949_ENCODE 주석).
export function decodeCp949(bytes: Uint8Array): string {
  return cpDecode(949, bytes);
}

// CFB 디렉터리의 스트림 이름 목록 — 암호 판별(EncryptedPackage)용. 읽지 못하면 null.
export function cfbStreamNames(bytes: Uint8Array): string[] | null {
  const cfb: unknown = XLSX.CFB;
  if (typeof cfb !== "object" || cfb === null) return null;
  const read: unknown = Reflect.get(cfb, "read");
  if (typeof read !== "function") return null;
  try {
    const container: unknown = Reflect.apply(read, cfb, [bytes, { type: "array" }]);
    const paths: unknown = typeof container === "object" && container !== null ? Reflect.get(container, "FullPaths") : null;
    if (!Array.isArray(paths)) return null;
    return paths.filter((path): path is string => typeof path === "string");
  } catch {
    return null;
  }
}

// zip 중앙 디렉터리 통계(SheetJS 없이 바이트만) — 항목 수 · 풀린 크기 합. 끝 레코드를 못 찾거나 ZIP64 표지면 null.
// SheetJS는 로컬 헤더(와 ZIP64 칸)의 크기로 풀고 중앙 디렉터리와의 차이는 다 푼 뒤에 본다 — 그래서 항목마다 로컬 헤더를
// 따라가 크기 · 방식이 같은지, ZIP64 칸 · 풀린 크기 0인 deflate가 없는지 먼저 본다(독립 검토 P1-1). 데이터 서술자(bit 3)는 deflate만 받고
// 로컬 크기는 0 또는 중앙과 같아야 한다 — 상한은 중앙 값 + inflatesToDeclared가 보장한다(SheetJS는 스트림 끝까지 풀고 서술자는 비교만 — C-86).
function hasZip64Extra(view: DataView, from: number, length: number): boolean | null {
  let at = from;
  const end = from + length;
  while (at + 4 <= end) {
    if (view.getUint16(at, true) === 0x0001) return true;
    at += 4 + view.getUint16(at + 2, true);
  }
  return at === end ? false : null;
}

function inflatesToDeclared(packed: Uint8Array, size: number): boolean {
  try {
    return inflateRawSync(packed, { maxOutputLength: Math.max(size, 1) }).length === size;
  } catch {
    return false;
  }
}

export function zipEntryStats(bytes: Uint8Array): { entries: number; uncompressedBytes: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const EOCD = 0x06054b50;
  const CEN = 0x02014b50;
  const LOC = 0x04034b50;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  let end = -1;
  for (let at = bytes.length - 22; at >= lowest; at--) {
    if (view.getUint32(at, true) === EOCD) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const entries = view.getUint16(end + 10, true);
  const dirSize = view.getUint32(end + 12, true);
  const dirOffset = view.getUint32(end + 16, true);
  if (entries === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) return null;
  if (dirOffset + dirSize > end) return null;
  let at = dirOffset;
  let uncompressedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== CEN) return null;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const localAt = view.getUint32(at + 42, true);
    const descriptor = (flags & 0x0008) !== 0;
    if (size === 0xffffffff || packed === 0xffffffff) return null;
    if (method !== 0 && method !== 8) return null;
    if (descriptor && method !== 8) return null;
    if ((method === 0 && packed !== size) || (method === 8 && size === 0 && packed > 2)) return null;
    if (at + 46 + nameLen + extraLen > end || hasZip64Extra(view, at + 46 + nameLen, extraLen) !== false) return null;
    if (localAt + 30 > dirOffset || view.getUint32(localAt, true) !== LOC) return null;
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    if (((view.getUint16(localAt + 6, true) & 0x0008) !== 0) !== descriptor || view.getUint16(localAt + 8, true) !== method) return null;
    const localPacked = view.getUint32(localAt + 18, true);
    const localSize = view.getUint32(localAt + 22, true);
    if (descriptor ? (localPacked !== 0 && localPacked !== packed) || (localSize !== 0 && localSize !== size) : localPacked !== packed || localSize !== size) return null;
    if (localAt + 30 + localNameLen + localExtraLen + packed > dirOffset) return null;
    if (hasZip64Extra(view, localAt + 30 + localNameLen, localExtraLen) !== false) return null;
    // 크기 칸이 서로 맞아도 deflate 스트림이 선언보다 크게 풀리면 SheetJS가 스트림 끝까지 푸느라 CPU를 붙잡는다(/cso B1).
    // 선언 크기에서 끊어 먼저 풀어 본다 — 넘치거나(예외) 미완이거나(예외) 길이가 다르면 거절. stored는 위에서 packed = size.
    if (method === 8 && !inflatesToDeclared(bytes.subarray(localAt + 30 + localNameLen + localExtraLen, localAt + 30 + localNameLen + localExtraLen + packed), size)) return null;
    uncompressedBytes += size;
    at += 46 + nameLen + extraLen + view.getUint16(at + 32, true);
  }
  return { entries, uncompressedBytes };
}
