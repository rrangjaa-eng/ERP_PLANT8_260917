import { deflateRawSync, inflateRawSync } from "node:zlib";
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
  // 실제 엑셀이 저장한 xlsx는 deflate 압축이다 — SheetJS 기본(무압축)이면 3,000줄이 1MB를 넘어 크기 거절이 먼저 난다.
  if (as === "xlsx") return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer);
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

type ZipEntry = { local: Uint8Array; name: Uint8Array; localExtra: Uint8Array; data: Uint8Array; central: Uint8Array; centralExtra: Uint8Array; comment: Uint8Array; descriptor?: Uint8Array };

function zipEntriesOf(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const localNameLen = view.getUint16(offset + 26, true);
    const localExtraLen = view.getUint16(offset + 28, true);
    const dataAt = offset + 30 + localNameLen + localExtraLen;
    entries.push({
      local: bytes.slice(offset, offset + 30),
      name: bytes.slice(offset + 30, offset + 30 + localNameLen),
      localExtra: bytes.slice(offset + 30 + localNameLen, dataAt),
      data: bytes.slice(dataAt, dataAt + view.getUint32(at + 20, true)),
      central: bytes.slice(at, at + 46),
      centralExtra: bytes.slice(at + 46 + nameLen, at + 46 + nameLen + extraLen),
      comment: bytes.slice(at + 46 + nameLen + extraLen, at + 46 + nameLen + extraLen + commentLen),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function zipOf(entries: readonly ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const local = entry.local.slice();
    const lv = new DataView(local.buffer);
    lv.setUint16(26, entry.name.length, true);
    lv.setUint16(28, entry.localExtra.length, true);
    const central = entry.central.slice();
    const cv = new DataView(central.buffer);
    cv.setUint16(28, entry.name.length, true);
    cv.setUint16(30, entry.centralExtra.length, true);
    cv.setUint16(32, entry.comment.length, true);
    cv.setUint32(42, offset, true);
    const descriptor = entry.descriptor ?? new Uint8Array(0);
    parts.push(local, entry.name, entry.localExtra, entry.data, descriptor);
    centrals.push(central, entry.name, entry.centralExtra, entry.comment);
    offset += local.length + entry.name.length + entry.localExtra.length + entry.data.length + descriptor.length;
  }
  const dirSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ZIP64 확장 정보 필드(0x0001) — 풀린 크기 · 압축 크기 8바이트씩.
function zip64Extra(uncompressed: number, compressed: number): Uint8Array {
  const extra = new Uint8Array(20);
  const view = new DataView(extra.buffer);
  view.setUint16(0, 0x0001, true);
  view.setUint16(2, 16, true);
  view.setBigUint64(4, BigInt(uncompressed), true);
  view.setBigUint64(12, BigInt(compressed), true);
  return extra;
}

// 데이터 서술자 꼴 서술자(서명 + crc · packed · size 각 4바이트 LE, 16바이트).
function descriptorOf(crc: number, packed: number, size: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, packed, true);
  view.setUint32(12, size, true);
  return out;
}

// 실물 비씨 xlsx 꼴(Java/.NET 스트리밍 zip) — 모든 항목 flag 0x0808 · 로컬 crc/packed/size 0 · 데이터 뒤 서술자 · 중앙 값은 올바름(C-86).
export function streamedZipFixture(xlsx: Uint8Array): Uint8Array {
  const entries = zipEntriesOf(xlsx);
  for (const entry of entries) {
    const local = new DataView(entry.local.buffer);
    const central = new DataView(entry.central.buffer);
    if (central.getUint16(10, true) !== 8) throw new Error("deflate 항목만 스트리밍 꼴로 바꾼다");
    entry.descriptor = descriptorOf(central.getUint32(16, true), central.getUint32(20, true), central.getUint32(24, true));
    local.setUint16(6, local.getUint16(6, true) | 0x0808, true);
    central.setUint16(8, central.getUint16(8, true) | 0x0808, true);
    local.setUint32(14, 0, true);
    local.setUint32(18, 0, true);
    local.setUint32(22, 0, true);
  }
  return zipOf(entries);
}

// 정상: bit 3을 로컬 · 중앙 둘 다 세우고 로컬 크기를 0이 아닌 중앙 값 그대로 둔다(서술자 있음) — 가드가 받아야 한다.
export function descriptorNonzeroLocalZipFixture(): Uint8Array {
  const entries = zipEntriesOf(lotteFixture([{}], { as: "xlsx" }));
  const first = entries[0];
  if (!first) throw new Error("항목 없음");
  const local = new DataView(first.local.buffer);
  const central = new DataView(first.central.buffer);
  local.setUint16(6, local.getUint16(6, true) | 0x0008, true);
  central.setUint16(8, central.getUint16(8, true) | 0x0008, true);
  first.descriptor = descriptorOf(central.getUint32(16, true), central.getUint32(20, true), central.getUint32(24, true));
  return zipOf(entries);
}

export type ZipForgery = "local-size" | "descriptor-local-size" | "descriptor-stored" | "descriptor-understated" | "descriptor-local-only" | "descriptor-central-only" | "zip64-local" | "zip64-central" | "zero-size-deflate" | "method" | "understated-deflate";

// 중앙 디렉터리는 작아 보이는데 SheetJS가 로컬 헤더 · ZIP64 칸 · 데이터 서술자로 크게 푸는 꼴(독립 검토 P1-1).
// 정상 롯데 xlsx(deflate)의 첫 항목 하나만 위조한다 — 파일은 작게 둔다.
export function forgedZipFixture(forgery: ZipForgery): Uint8Array {
  const entries = zipEntriesOf(lotteFixture([{}], { as: "xlsx" }));
  const first = entries[0];
  if (!first) throw new Error("항목 없음");
  const local = new DataView(first.local.buffer);
  const central = new DataView(first.central.buffer);
  if (forgery === "local-size") local.setUint32(22, local.getUint32(22, true) + 5_000_000, true);
  // 데이터 서술자 위조 3종 — 서술자를 받아들이는 새 규칙에서도 거절돼야 하는 위험한 변형(C-86).
  if (forgery === "descriptor-local-size") {
    local.setUint16(6, local.getUint16(6, true) | 0x0008, true);
    central.setUint16(8, central.getUint16(8, true) | 0x0008, true);
    local.setUint32(22, central.getUint32(24, true) + 5_000_000, true);
  }
  if (forgery === "descriptor-stored") {
    first.data = new Uint8Array(inflateRawSync(first.data));
    local.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    local.setUint32(18, first.data.length, true);
    central.setUint32(20, first.data.length, true);
    local.setUint32(22, first.data.length, true);
    central.setUint32(24, first.data.length, true);
    local.setUint16(6, local.getUint16(6, true) | 0x0008, true);
    central.setUint16(8, central.getUint16(8, true) | 0x0008, true);
  }
  if (forgery === "descriptor-understated") {
    first.data = new Uint8Array(deflateRawSync(new Uint8Array(5_000_000)));
    local.setUint32(14, 0, true);
    local.setUint32(18, 0, true);
    local.setUint32(22, 0, true);
    central.setUint32(20, first.data.length, true);
    central.setUint32(24, 1000, true);
    local.setUint16(6, local.getUint16(6, true) | 0x0008, true);
    central.setUint16(8, central.getUint16(8, true) | 0x0008, true);
    first.descriptor = descriptorOf(central.getUint32(16, true), first.data.length, 1000);
  }
  // bit 3 불일치 — 로컬 머리만, 또는 중앙만 데이터 서술자 표지를 세운 꼴(둘이 같아야 받는다).
  if (forgery === "descriptor-local-only") local.setUint16(6, local.getUint16(6, true) | 0x0008, true);
  if (forgery === "descriptor-central-only") central.setUint16(8, central.getUint16(8, true) | 0x0008, true);
  if (forgery === "zip64-local") first.localExtra = zip64Extra(5_000_000, first.data.length);
  if (forgery === "zip64-central") first.centralExtra = zip64Extra(5_000_000, first.data.length);
  if (forgery === "method") {
    local.setUint16(8, 12, true);
    central.setUint16(10, 12, true);
  }
  if (forgery === "zero-size-deflate") {
    // 풀린 크기 칸 0 + 실제로는 크게 풀리는 deflate — SheetJS 순수 JS inflate는 크기 0이면 버퍼를 끝없이 늘린다.
    first.data = new Uint8Array(deflateRawSync(new Uint8Array(200_000)));
    local.setUint32(18, first.data.length, true);
    local.setUint32(22, 0, true);
    central.setUint32(20, first.data.length, true);
    central.setUint32(24, 0, true);
  }
  if (forgery === "understated-deflate") {
    // 로컬 · 중앙 크기가 서로 같고 압축 길이도 맞는데, deflate 스트림이 실제로는 선언보다 훨씬 크게 풀린다(/cso B1).
    // SheetJS는 선언 크기에서 출력을 끊지만 스트림 끝까지 푸느라 CPU를 붙잡는다.
    first.data = new Uint8Array(deflateRawSync(new Uint8Array(5_000_000)));
    local.setUint32(18, first.data.length, true);
    local.setUint32(22, 1000, true);
    central.setUint32(20, first.data.length, true);
    central.setUint32(24, 1000, true);
  }
  return zipOf(entries);
}

// 끝 레코드 둘 — 진짜(작은 중앙 디렉터리)의 주석 안, 끝에서 21바이트 앞에 가짜 끝 레코드(풀린 크기를 부풀린 중앙 디렉터리 가리킴)를 심는다.
// SheetJS는 파일 끝에서 4바이트 앞부터 위로 훑어 처음 만난 PK\x05\x06을 쓰므로 가짜를 읽는다(독립 검토).
export function twoEocdZipFixture(): Uint8Array {
  const base = lotteFixture([{}], { as: "xlsx" });
  const view = new DataView(base.buffer, base.byteOffset, base.byteLength);
  const end = base.length - 22;
  const dirOffset = view.getUint32(end + 16, true);
  const dirSize = view.getUint32(end + 12, true);
  const fakeDir = base.slice(dirOffset, dirOffset + dirSize);
  const fv = new DataView(fakeDir.buffer);
  for (let at = 0; at < fakeDir.length; at += 46 + fv.getUint16(at + 28, true) + fv.getUint16(at + 30, true) + fv.getUint16(at + 32, true)) {
    fv.setUint32(at + 24, 25_000_000, true);
  }
  const fakeEocd = new Uint8Array(21);
  const ev = new DataView(fakeEocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, view.getUint16(end + 10, true), true);
  ev.setUint16(10, view.getUint16(end + 10, true), true);
  ev.setUint32(12, fakeDir.length, true);
  ev.setUint32(16, end + 22, true);
  const out = new Uint8Array(base.length + fakeDir.length + fakeEocd.length);
  out.set(base, 0);
  new DataView(out.buffer).setUint16(end + 20, fakeDir.length + fakeEocd.length, true);
  out.set(fakeDir, base.length);
  out.set(fakeEocd, base.length + fakeDir.length);
  return out;
}

export const SHINHAN_HEADER = [
  "이용일시",
  "접수일",
  "승인번호",
  "이용카드",
  "이용자명",
  "가맹점명",
  "이용금액",
  "이용구분",
  "할부개월수",
  "이용지역",
  "카드구분",
  "결제예정일",
] as const;

const SHINHAN_DEFAULTS: Record<string, FixtureCell> = {
  이용일시: "2026.05.28 18:43:28",
  접수일: "2026.05.29",
  승인번호: "09847552  ",
  이용카드: "5531-52**-****-1278",
  이용자명: "(*)회사가",
  가맹점명: "가맹점나",
  이용금액: 113400.0,
  이용구분: "일시불",
  할부개월수: "",
  이용지역: "",
  카드구분: "신한카드",
  결제예정일: "2026.06.15",
};

// 신한 법인이용내역 — 머리줄 1(시트 `Sheet0`, 12칸), 금액은 숫자 셀, 카드 번호는 파일이 이미 가림.
export function shinhanFixture(rows: readonly FixtureRow[], opts: FixtureOptions & { header?: readonly string[] } = {}): Uint8Array {
  const header = opts.header ?? SHINHAN_HEADER;
  return writeBook([{ name: "Sheet0", rows: [[...header], ...rowsOf(header, SHINHAN_DEFAULTS, rows)] }], opts.as);
}

export const SHINHAN_ACCOUNTING_HEADER = [
  "카드번호",
  "결제계좌번호",
  "결제은행",
  "카드소유자명",
  "사용구분",
  "승인번호",
  "승인일자",
  "승인시간",
  "매출종류",
  "승인금액(원화)",
  "승인금액(외화)",
  "공급가액(원화)",
  "부가세",
  "봉사료",
  "할부기간",
  "외화거래일환율",
  "외화거래국가코드",
  "외화거래국가명",
  "가맹점사업자번호",
  "가맹점명",
  "가맹점업종명",
  "가맹점우편번호",
  "가맹점주소1",
  "가맹점주소2",
  "가맹점전화번호",
] as const;

const SHINHAN_ACCOUNTING_DEFAULTS: Record<string, FixtureCell> = {
  카드번호: "5531-52**-****-1278",
  결제계좌번호: "111-222222-33-444",
  결제은행: "은행가",
  카드소유자명: "가명",
  사용구분: "국내",
  승인번호: "09847552",
  승인일자: "2026.05.28",
  승인시간: "18:43:28",
  매출종류: "일시불",
  "승인금액(원화)": 113400,
  "승인금액(외화)": 0,
  "공급가액(원화)": 103091,
  부가세: 10309,
  봉사료: 0,
  할부기간: "",
  외화거래일환율: 0,
  외화거래국가코드: "-",
  외화거래국가명: "",
  가맹점사업자번호: FAKE_BUSINESS_NO,
  가맹점명: "가맹점나",
  가맹점업종명: "업종가",
  가맹점우편번호: "00000",
  가맹점주소1: "주소가",
  가맹점주소2: "",
  가맹점전화번호: "000-0000-0000",
};

// 신한 법인이용내역 회계양식(C-86) — 머리줄 1(시트 하나, 25칸), 승인일자 `YYYY.MM.DD` · 승인시간 `HH:MM:SS` 글자, 금액 칸은 숫자 셀.
export function shinhanAccountingFixture(rows: readonly FixtureRow[], opts: FixtureOptions & { header?: readonly string[] } = {}): Uint8Array {
  const header = opts.header ?? SHINHAN_ACCOUNTING_HEADER;
  return writeBook([{ name: "Sheet0", rows: [[...header], ...rowsOf(header, SHINHAN_ACCOUNTING_DEFAULTS, rows)] }], opts.as);
}

export const BC_HEADER = [
  "수신정보구분코드",
  "카드번호",
  "카드종류",
  "결제계좌번호",
  "결제계좌은행명",
  "지정자한글명",
  "국내외사용구분",
  "승인번호",
  "승인일자",
  "매출종류",
  "금액SIGN코드",
  "거래금액(원화)",
  "부가세",
  "봉사료",
  "할부기간",
  "매입금액(원화)",
  "청구금액",
  "청구수수료",
  "실청구금액",
  "거래금액(외화)",
  "현지금액",
  "현지화폐코드",
  "외화거래일환율",
  "외화거래국가코드",
  "외화거래국가명",
  "외화거래도시명",
  "가맹점사업자번호",
  "가맹점명",
  "가맹점업종",
  "가맹점우편번호",
  "가맹점주소1",
  "가맹점주소2",
  "가맹점전화번호",
  "회계코드",
  "회계코드명",
  "본부명",
  "부서명",
] as const;

// 비씨 새 양식 28칸(C-86 실물) — 거래금액(외화) · 외화 칸 없음, 매입일자 · 회계 칸 있음.
export const BC_HEADER_28 = [
  "수신정보구분코드",
  "카드번호",
  "카드종류",
  "결제계좌번호",
  "결제계좌은행명",
  "지정자한글명",
  "국내외사용구분",
  "승인번호",
  "승인일자",
  "매출종류",
  "금액SIGN코드",
  "거래금액(원화)",
  "부가세",
  "봉사료",
  "할부기간",
  "매입일자",
  "매입금액(원화)",
  "가맹점사업자번호",
  "가맹점명",
  "가맹점업종",
  "가맹점우편번호",
  "가맹점주소1",
  "가맹점주소2",
  "가맹점전화번호",
  "회계코드",
  "회계코드명",
  "본부명",
  "부서명",
] as const;

// 결과 객체에 남으면 안 되는 가짜 결제 계좌번호(단언용).
export const FAKE_BC_ACCOUNT_NO = "111-222222-33-444";

const BC_DEFAULTS: Record<string, FixtureCell> = {
  수신정보구분코드: "신규",
  카드번호: "9430-0000-0000-2942",
  카드종류: "B",
  결제계좌번호: FAKE_BC_ACCOUNT_NO,
  결제계좌은행명: "은행가",
  지정자한글명: "가명",
  국내외사용구분: "국내",
  승인번호: "64706307",
  승인일자: "2026-05-14",
  매출종류: "일시불",
  금액SIGN코드: "",
  "거래금액(원화)": "28,500",
  부가세: "2,591",
  봉사료: "0",
  할부기간: "",
  "매입금액(원화)": "28,500",
  청구금액: "28,500",
  청구수수료: "0",
  실청구금액: "28,500",
  "거래금액(외화)": "0",
  현지금액: "0",
  현지화폐코드: "",
  외화거래일환율: "0",
  외화거래국가코드: "",
  외화거래국가명: "",
  외화거래도시명: "",
  가맹점사업자번호: "113-**-*****",
  가맹점명: "가맹점다",
  가맹점업종: "업종가",
  가맹점우편번호: "00000",
  가맹점주소1: "주소가",
  가맹점주소2: "",
  가맹점전화번호: "000-0000-0000",
  회계코드: "",
  회계코드명: "",
  본부명: "",
  부서명: "",
};

// 비씨 이용내역 — 머리줄 1(`Sheet1`, 37칸). 실물처럼 모든 데이터 칸을 고정폭 공백 패딩 문자열로 쓴다.
export function bcFixture(rows: readonly FixtureRow[], opts: FixtureOptions & { header?: readonly string[] } = {}): Uint8Array {
  const header = opts.header ?? BC_HEADER;
  const body = rowsOf(header, BC_DEFAULTS, rows).map((row) => row.map((cell) => (cell === null ? null : String(cell).padStart(13))));
  return writeBook([{ name: "Sheet1", rows: [[...header], ...body] }], opts.as);
}

// 홈택스 매입 전자세금계산서 목록 — 머리글 33칸에 `상호` · `대표자명` · `주소` · `종사업장번호`가 두 번씩 나와 픽스처 줄은
// 별칭(공급자상호 · 받는자상호 …)으로 적는다. [별칭, 머리글] 순서 그대로.
export const HOMETAX_TAX_INVOICE_COLUMNS = [
  ["작성일자", "작성일자"],
  ["승인번호", "승인번호"],
  ["발급일자", "발급일자"],
  ["전송일자", "전송일자"],
  ["공급자사업자등록번호", "공급자사업자등록번호"],
  ["공급자종사업장번호", "종사업장번호"],
  ["공급자상호", "상호"],
  ["공급자대표자명", "대표자명"],
  ["공급자주소", "주소"],
  ["공급받는자사업자등록번호", "공급받는자사업자등록번호"],
  ["받는자종사업장번호", "종사업장번호"],
  ["받는자상호", "상호"],
  ["받는자대표자명", "대표자명"],
  ["받는자주소", "주소"],
  ["합계금액", "합계금액"],
  ["공급가액", "공급가액"],
  ["세액", "세액"],
  ["전자세금계산서분류", "전자세금계산서분류"],
  ["전자세금계산서종류", "전자세금계산서종류"],
  ["발급유형", "발급유형"],
  ["비고", "비고"],
  ["영수/청구 구분", "영수/청구 구분"],
  ["공급자 이메일", "공급자 이메일"],
  ["공급받는자 이메일1", "공급받는자 이메일1"],
  ["공급받는자 이메일2", "공급받는자 이메일2"],
  ["품목일자", "품목일자"],
  ["품목명", "품목명"],
  ["품목규격", "품목규격"],
  ["품목수량", "품목수량"],
  ["품목단가", "품목단가"],
  ["품목공급가액", "품목공급가액"],
  ["품목세액", "품목세액"],
  ["품목비고", "품목비고"],
] as const;

const HOMETAX_DEFAULTS: Record<string, FixtureCell> = {
  작성일자: "2026-06-15",
  승인번호: "20260615-10260615-71160001",
  발급일자: "2026-06-15",
  전송일자: "2026-06-16",
  공급자사업자등록번호: FAKE_BUSINESS_NO,
  공급자종사업장번호: "",
  공급자상호: "공급회사가",
  공급자대표자명: "대표가",
  공급자주소: "주소가",
  공급받는자사업자등록번호: FAKE_COMPANY_BUSINESS_NO,
  받는자종사업장번호: "",
  받는자상호: "우리회사가",
  받는자대표자명: "대표나",
  받는자주소: "주소나",
  합계금액: 110000,
  공급가액: 100000,
  세액: 10000,
  전자세금계산서분류: "세금계산서",
  전자세금계산서종류: "일반",
  발급유형: "정발행",
  비고: "",
  "영수/청구 구분": "청구",
  "공급자 이메일": "supplier@example.com",
  "공급받는자 이메일1": "buyer@example.com",
  "공급받는자 이메일2": "",
  품목일자: "2026-06-15",
  품목명: "품목가",
  품목규격: "",
  품목수량: 1,
  품목단가: 100000,
  품목공급가액: 100000,
  품목세액: 10000,
  품목비고: "",
};

export type HometaxFixtureOptions = FixtureOptions & {
  /** 5줄 띠 글자. */
  band?: string;
  /** 뺄 열(별칭) — 계산서 꼴은 `세액` · `품목세액`. */
  omit?: readonly string[];
  /** 3줄 총계 [이름, 값] 쌍 — 기본은 줄 합(합계 · 공급가 · 세액)을 쉼표 글자로. */
  totals?: readonly (readonly [string, FixtureCell])[];
  /** 0행 우리 회사 사업자번호 칸 값. */
  company?: FixtureCell;
  /** `품목` 시트 데이터 줄 수(기본 = 데이터 줄 수). */
  itemRows?: number;
};

function commaText(amount: number): string {
  return amount.toLocaleString("en-US");
}

// 홈택스 매입 전자세금계산서 목록 — 시트 `세금계산서` · `품목`, 0행 우리 회사, 3줄 총계, 5줄 띠, 6줄 머리글, 7줄부터 데이터.
// 06.1-11 계산서 꼴(`band` · `omit` · `totals`)도 같은 생성기를 쓴다.
export function hometaxTaxInvoiceFixture(rows: readonly FixtureRow[], opts: HometaxFixtureOptions = {}): Uint8Array {
  const columns = HOMETAX_TAX_INVOICE_COLUMNS.filter(([alias]) => !(opts.omit ?? []).includes(alias));
  const body = rows.map((row) =>
    columns.map(([alias]) => (row === null ? null : alias in row ? (row[alias] ?? null) : (HOMETAX_DEFAULTS[alias] ?? null))),
  );
  const sumOf = (alias: string) =>
    rows.reduce((total, row) => {
      const value = row === null ? null : alias in row ? row[alias] : HOMETAX_DEFAULTS[alias];
      return typeof value === "number" ? total + value : total;
    }, 0);
  const totals = opts.totals ?? [
    ["총 합계금액", commaText(sumOf("합계금액"))],
    ["총 공급가액", commaText(sumOf("공급가액"))],
    ["총 세액", commaText(sumOf("세액"))],
  ];
  const sheet: FixtureCell[][] = [
    ["사업자 등록번호", opts.company === undefined ? FAKE_COMPANY_BUSINESS_NO : opts.company, "상호", "우리회사가", "대표자 명", "대표나"],
    [],
    totals.flatMap(([label, value]) => [label, value]),
    [],
    [opts.band ?? "매입 전자(수정) 세금계산서 목록조회"],
    columns.map(([, name]) => name),
    ...body,
  ];
  const itemHeader = ["승인번호", "품목순번", "공급자등록번호", "공급받는자등록번호", "일자", "품목명", "규격", "수량", "단가", "공급가액", "세액", "비고"];
  const itemCount = opts.itemRows ?? rows.length;
  const items: FixtureCell[][] = Array.from({ length: itemCount }, (_, i) => [
    "20260615-10260615-71160001",
    i + 1,
    FAKE_BUSINESS_NO,
    FAKE_COMPANY_BUSINESS_NO,
    "2026-06-15",
    "품목가",
    "",
    1,
    100000,
    100000,
    10000,
    "",
  ]);
  return writeBook(
    [
      { name: "세금계산서", rows: sheet },
      { name: "품목", rows: [[], [], [], [], itemHeader, ...items] },
    ],
    opts.as,
  );
}

// 06.1-11: 홈택스 매입 현금영수증 목록 — 시트 1장, 0행 13열(N) 띠 `총 사용금액 : {합}(원)`, 1행 머리글 15칸, 2행부터 데이터
// (samples/hometax-cash-receipt-purchase.md). 금액 넷은 숫자 셀, 날짜 · 승인번호 · 발급수단은 글자 셀이다.
export const HOMETAX_CASH_RECEIPT_HEADER = [
  "매입일시",
  "사용자명",
  "가맹점사업자번호",
  "가맹점명",
  "업종코드",
  "업종",
  "업태",
  "공급가액",
  "부가세",
  "봉사료",
  "매입금액",
  "승인번호",
  "발급수단",
  "거래구분",
  "공제여부",
] as const;

const CASH_RECEIPT_AMOUNTS = ["공급가액", "부가세", "봉사료", "매입금액"];

export type HometaxCashReceiptFixtureOptions = FixtureOptions & {
  /** 띠 칸 글자 — 기본은 매입금액 합을 `총 사용금액 : {쉼표 합}(원)`으로. */
  band?: FixtureCell;
  /** 띠 칸 열(0부터) — 기본 13(N). */
  bandCol?: number;
  /** 머리글 줄(0부터) — 기본 1. 띠는 늘 0행이다. */
  headerRow?: number;
  header?: readonly string[];
  /** 금액 넷을 쉼표 붙은 글자로 쓴다(엑셀 재저장 꼴). */
  amountText?: boolean;
};

export function hometaxCashReceiptFixture(rows: readonly FixtureRow[], opts: HometaxCashReceiptFixtureOptions = {}): Uint8Array {
  const defaults: Record<string, FixtureCell> = {
    매입일시: "2026-07-15 12:30:45",
    사용자명: "사용자가",
    가맹점사업자번호: FAKE_BUSINESS_NO,
    가맹점명: "가맹점가",
    업종코드: "123456",
    업종: "업종가",
    업태: "업태가",
    공급가액: 9091,
    부가세: 909,
    봉사료: 0,
    매입금액: 10000,
    승인번호: "A10000001",
    발급수단: "4321",
    거래구분: "승인거래",
    공제여부: "공제",
  };
  const header = opts.header ?? HOMETAX_CASH_RECEIPT_HEADER;
  const total = rows.reduce((sum, row) => {
    const value = row === null ? null : "매입금액" in row ? row.매입금액 : defaults.매입금액;
    return typeof value === "number" ? sum + value : sum;
  }, 0);
  const bandCol = opts.bandCol ?? 13;
  const band = opts.band === undefined ? `총 사용금액 : ${commaText(total)}(원)` : opts.band;
  const body = rowsOf(header, defaults, rows).map((cells) =>
    cells.map((cell, i) => (opts.amountText && typeof cell === "number" && CASH_RECEIPT_AMOUNTS.includes(header[i] ?? "") ? commaText(cell) : cell)),
  );
  const headerRow = opts.headerRow ?? 1;
  const sheet: FixtureCell[][] = [
    Array.from({ length: bandCol + 1 }, (_, i) => (i === bandCol ? band : null)),
    ...Array.from({ length: headerRow - 1 }, () => []),
    [...header],
    ...body,
  ];
  return writeBook([{ name: "sheet1", rows: sheet }], opts.as);
}

// 06.1-11: 홈택스 매입 전자(수정)계산서(면세) 목록 — 세금계산서 목록과 같은 시트 · 같은 줄 위치에 띠 `매입 전자(수정) 계산서 목록조회`,
// 머리글은 `세액` · `품목세액`을 뺀 31칸, 2행 총계는 `총 공급가액` 한 쌍(samples/hometax-invoice-purchase.md). 합계금액 = 공급가액이 기본이다.
export function hometaxInvoiceFixture(rows: readonly FixtureRow[], opts: HometaxFixtureOptions = {}): Uint8Array {
  const filled = rows.map((row) => {
    if (row === null) return null;
    const supply = "공급가액" in row ? (row.공급가액 ?? null) : 100000;
    return { 공급자사업자등록번호: FAKE_BUSINESS_NO, 전자세금계산서분류: "계산서", 공급가액: supply, 합계금액: supply, ...row };
  });
  const supplySum = filled.reduce((sum, row) => (row !== null && typeof row.공급가액 === "number" ? sum + row.공급가액 : sum), 0);
  return hometaxTaxInvoiceFixture(filled, {
    band: "매입 전자(수정) 계산서 목록조회",
    omit: ["세액", "품목세액"],
    totals: [["총 공급가액", commaText(supplySum)]],
    ...opts,
  });
}
