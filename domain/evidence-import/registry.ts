import type { TaxRule } from "@/domain/code-tables/tax-rule";
import type { TaxRates } from "@/domain/money/tax";
import { resolveLineAmounts } from "@/domain/evidence-import/amounts";
import { DETECT_ROWS, detectFormat } from "@/domain/evidence-import/detect";
import { cardBc } from "@/domain/evidence-import/formats/card-bc";
import { cardLotte } from "@/domain/evidence-import/formats/card-lotte";
import { cardShinhan } from "@/domain/evidence-import/formats/card-shinhan";
import { cardShinhanAccounting } from "@/domain/evidence-import/formats/card-shinhan-accounting";
import { hometaxCashReceipt } from "@/domain/evidence-import/formats/hometax-cash-receipt";
import { hometaxInvoice } from "@/domain/evidence-import/formats/hometax-invoice";
import { hometaxTaxInvoice } from "@/domain/evidence-import/formats/hometax-tax-invoice";
import { dedupeKeys, splitOffsetPairs } from "@/domain/evidence-import/key";
import {
  EVIDENCE_IMPORT_MAX_BYTES,
  EVIDENCE_IMPORT_MAX_ROWS,
  EVIDENCE_IMPORT_MAX_UNZIPPED_BYTES,
  EVIDENCE_IMPORT_MAX_ZIP_ENTRIES,
  rowRefusalHeadline,
  sizeRefusalHeadline,
} from "@/domain/evidence-import/limits";
import type { Container, FinalLine, FormatRule, KeyedLine, LineError, ParseSuccess, Refusal, RefusalKind } from "@/domain/evidence-import/types";
import { decodeCsvText, DEFAULT_WORKBOOK_DEPS, readSheets, sniff, type SheetSource, type WorkbookDeps } from "@/domain/evidence-import/workbook";

export { EVIDENCE_IMPORT_MAX_BYTES, EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";

// 06.1-02: 증빙 가져오기 진입점. 서식 하나 = 규칙 파일 하나 + 이 배열 한 줄(D-6103). 계산서 · 현금영수증은 06.1-11.
// 판별 낱말이 서로 겹치지 않아 차례는 결과를 바꾸지 않는다(서식 교차 표 단위 테스트가 고정한다).
export const EVIDENCE_FORMATS: readonly FormatRule[] = [cardLotte, cardShinhan, cardShinhanAccounting, cardBc, hometaxTaxInvoice, hometaxInvoice, hometaxCashReceipt];

/** 그 서식의 날짜 칸이 카드 사용일(승인일)인가 — 붙임이 카드 사용 사용일을 덮어도 되는 서식(07.1-04 PR #305 검토 P1). 모르는 서식은 거짓. */
export function formatDateIsUsage(format: string): boolean {
  return EVIDENCE_FORMATS.find((rule) => rule.key === format)?.dateIsUsage === true;
}

export type ParseResult = ParseSuccess | Refusal;

// 거절 문구는 06.1-UI-SPEC Copywriting 「거절 —」 행 글자 그대로.
const NOT_EXCEL = "엑셀·CSV 파일 아님 · 내려받은 파일 그대로";
const ENCRYPTED = "암호 걸린 파일 · 암호 풀고 다시 저장";
const UNKNOWN_FORMAT = "모르는 서식 · 홈택스·카드사 내려받기 파일로 다시";
const SALES_LIST = "매출 목록 · 매입 목록으로 다시 내려받기";
const MAX_SHEETS = 5;
const SHOWN_LINE_ERRORS = 5;

function refuse(kind: RefusalKind, headline: string, lines: string[] = [], restCount = 0): Refusal {
  return { ok: false, kind, headline, lines, restCount };
}

function refuseLines(errors: readonly LineError[]): Refusal {
  return refuse(
    "line-errors",
    `거절 · 오류 ${errors.length}줄`,
    errors.slice(0, SHOWN_LINE_ERRORS).map((error) => `${error.lineNo}줄 · ${error.reason}`),
    Math.max(0, errors.length - SHOWN_LINE_ERRORS),
  );
}

function lastRowOf(ref: string | null): number | null {
  const found = ref === null ? null : /:[A-Z]+(\d+)$/.exec(ref);
  return found ? Number(found[1]) - 1 : null;
}

function nonBlankLineCount(text: string): number {
  return text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "").length;
}

export type ParseOptions = { formats?: readonly FormatRule[]; deps?: Partial<WorkbookDeps> };

// 바이트 → 금액 미결정 줄 + 역산이 필요한 날짜 집합(rateDates) 또는 거절. 한 줄이라도 못 읽으면 파일 전체를 거절한다.
export function parseWorkbook(bytes: Uint8Array, options: ParseOptions = {}): ParseResult {
  const formats = options.formats ?? EVIDENCE_FORMATS;
  const deps: WorkbookDeps = { ...DEFAULT_WORKBOOK_DEPS, ...options.deps };
  if (bytes.length > EVIDENCE_IMPORT_MAX_BYTES) return refuse("size", sizeRefusalHeadline(bytes.length));

  const shape = sniff(bytes);
  if (shape === "html" || shape === "unknown") return refuse("not-excel", NOT_EXCEL);
  const container: Container = shape;
  // 등록 서식이 선언하지 않은 컨테이너는 SheetJS에 넘기지 않는다.
  if (!formats.some((rule) => rule.containers.includes(container))) return refuse("unknown-format", UNKNOWN_FORMAT);

  const zipLimits = { maxEntries: EVIDENCE_IMPORT_MAX_ZIP_ENTRIES, maxUnzippedBytes: EVIDENCE_IMPORT_MAX_UNZIPPED_BYTES };
  if (container === "xlsx") {
    const stats = deps.zipEntryStats(bytes);
    if (!stats || stats.entries > zipLimits.maxEntries || stats.uncompressedBytes > zipLimits.maxUnzippedBytes) return refuse("not-excel", NOT_EXCEL);
  }
  const source: SheetSource = container === "csv" ? { container, text: decodeCsvText(bytes, deps) } : { container, bytes };

  // 1차: 시트 이름과 앞 6줄만 읽어 판별.
  const first = readSheets(source, { sheetRows: DETECT_ROWS, zipLimits }, deps);
  if (!first.ok) return refuse(first.kind, first.kind === "encrypted" ? ENCRYPTED : NOT_EXCEL);
  if (first.book.sheetNames.length > MAX_SHEETS) return refuse("unknown-format", UNKNOWN_FORMAT);
  const detection = detectFormat(formats, first.book.sheets, container);
  if (detection.kind === "sales-list") return refuse("sales-list", SALES_LIST);
  if (detection.kind === "unknown") return refuse("unknown-format", UNKNOWN_FORMAT);
  const { rule, headerRow } = detection;
  const sheetName = first.book.sheets[detection.sheetIndex]?.name;
  if (sheetName === undefined) return refuse("unknown-format", UNKNOWN_FORMAT);

  // 행 상한은 fail-closed(P1-4): csv는 읽기 전 줄 수로, 그 밖은 읽기 한도에 닿았거나 `!fullref`가 넘으면 거절.
  const allowedLastRow = headerRow + EVIDENCE_IMPORT_MAX_ROWS;
  if (source.container === "csv") {
    const dataLines = nonBlankLineCount(source.text) - (headerRow + 1);
    if (dataLines > EVIDENCE_IMPORT_MAX_ROWS) return refuse("rows", rowRefusalHeadline(dataLines));
  }
  // 2차: 고른 서식의 데이터 시트 하나만.
  const second = readSheets(source, { sheetRows: allowedLastRow + 2, onlySheet: sheetName, zipLimits }, deps);
  if (!second.ok) return refuse(second.kind, second.kind === "encrypted" ? ENCRYPTED : NOT_EXCEL);
  const sheet = second.book.sheets.find((one) => one.name === sheetName);
  if (!sheet) return refuse("unknown-format", UNKNOWN_FORMAT);
  const fullLastRow = lastRowOf(sheet.fullRef);
  if (sheet.hitRowLimit || (fullLastRow !== null && fullLastRow > allowedLastRow)) {
    const lastRow = fullLastRow ?? sheet.rows.length - 1;
    return refuse("rows", rowRefusalHeadline(lastRow - headerRow));
  }

  const read = rule.read(sheet.rows, { headerRow, date1904: second.book.date1904 });
  if (read.errors.length > 0) return refuseLines(read.errors);
  if (read.checksum && read.checksum.file !== read.checksum.sum) {
    return refuse("checksum", `${read.checksum.label} 다름 · 파일 ${read.checksum.file.toLocaleString("en-US")} · 줄 합 ${read.checksum.sum.toLocaleString("en-US")}`);
  }

  // 열쇠를 먼저 매긴다 — 남은 줄의 `#n`이 취소 줄이 이 파일에 들어왔는지에 따라 바뀌지 않는다(앞 파일과 같은 열쇠).
  const { lines, pairs } = splitOffsetPairs(dedupeKeys(rule.keyPrefix ?? rule.key, rule.keyKind, read.lines));
  const pairLines = pairs.flatMap((pair) => [pair.original, pair.cancel]);
  const rateDates = [...new Set([...lines, ...pairLines].filter((line) => line.vatKrw === null && line.supplyKrw === null).map((line) => line.issuedOn))].sort();
  return { ok: true, format: rule.key, lines, rateDates, offsetPairs: pairs.length, offsetLines: pairs };
}

// 둘째 단계: 호출자(06.1-04)가 rateDates마다 읽은 세율과 트랜잭션 전에 코드표에서 읽은 증빙 종류별 세금 규칙으로 등록용 줄을
// 만든다. 역산 줄의 날짜가 세율 맵에 없거나 그 종류가 규칙 맵에 없으면 던진다(호출자 결함 — 사용자 거절이 아니다).
export function finalizeAmounts(
  lines: readonly KeyedLine[],
  ratesByDate: ReadonlyMap<string, TaxRates>,
  rulesByType: ReadonlyMap<string, TaxRule>,
): FinalLine[] {
  return lines.map((line) => {
    if (line.vatKrw !== null || line.supplyKrw !== null) return { ...line, ...resolveLineAmounts(line) };
    const rates = ratesByDate.get(line.issuedOn);
    if (!rates) throw new Error(`세율 없음 — ${line.issuedOn}`);
    const rule = rulesByType.get(line.evidenceType);
    if (!rule) throw new Error(`세금 규칙 없음 — ${line.evidenceType}`);
    return { ...line, ...resolveLineAmounts(line, rates, rule) };
  });
}
