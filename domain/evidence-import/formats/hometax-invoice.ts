import { businessNoDigitsOf, cellDate, cellKrw, cellText, isBlankRow } from "@/domain/evidence-import/cells";
import { columnIndex } from "@/domain/evidence-import/detect";
import { sumKrw } from "@/domain/money";
import type { DetectResult, FormatReadResult, FormatRule, LineError, ParsedLine, Rows } from "@/domain/evidence-import/types";

// 06.1-11: 홈택스 매입 전자(수정)계산서(면세) 목록 — 세금계산서 목록과 시트 이름(`세금계산서` · `품목`)도 줄 위치(0행 우리 회사 · 3줄 총계 ·
// 5줄 띠 · 6줄 머리글)도 같다. 머리글은 `세액` · `품목세액`이 없는 31칸, 총계는 `총 공급가액` 한 쌍이다(samples/hometax-invoice-purchase.md).
// 옛 260907 receiptImport.ts guessFormat은 띠가 `매입`으로 시작하면 세금계산서로 보아 이 목록을 세금계산서로 갈랐다 — 띠와 `세액` 칸 둘 다로 가른다.
// 이름이 겹치는 칸(`상호` 등)은 닻 `공급자사업자등록번호` 기준 위치로 읽고, 대표 품목 칸 · `품목` 시트는 금액으로 쓰지 않는다.

const SHEET_NAME = "세금계산서";
const TOTALS_ROW = 2;
const TOTAL_LABEL = "총 공급가액";
const APPROVAL_NO = /^\d{8}-\d{8}-\d{8}$/;
// 수정 계산서의 분류 낱말은 견본 구조에 적혀 있지 않다 — 음수 줄 비고 괄호 안의 26자 승인번호만 원 승인번호로 꺼낸다(PA-INV-ORIG).
const ORIGINAL_APPROVAL_NO = /당초\s*승인번호\s*\((\d{8}-\d{8}-\d{8})\)/;

// 0행 `사업자 등록번호` 다음 칸 — 내려받은 사람의 회사. 숫자 10자리가 아니면 null(E18 — 세금계산서 서식과 같은 규칙).
function companyNoOf(rows: Rows): string | null {
  const row = rows[0] ?? [];
  const at = row.findIndex((cell) => cellText(cell).replaceAll(/\s/g, "") === "사업자등록번호");
  return at < 0 ? null : businessNoDigitsOf(row[at + 1]);
}

function isHeaderRow(row: readonly unknown[]): boolean {
  return cellText(row[0]) === "작성일자" && cellText(row[1]) === "승인번호";
}

// 띠가 계산서(세금계산서 아님) **그리고** `세액` 칸이 없을 때만 — 하나만 맞으면 모르는 서식이다. 세금계산서 서식은 거꾸로 둘 다를
// 요구하므로 두 서식이 서로를 가로채지 않는다(세액 칸 오독 · 면세 오판 방지).
function detect(sheets: Parameters<FormatRule["detect"]>[0], container: Parameters<FormatRule["detect"]>[1]): DetectResult {
  const sheetIndex = container === "csv" ? 0 : sheets.findIndex((sheet) => sheet.name === SHEET_NAME);
  const rows = sheets[sheetIndex]?.rows;
  if (!rows) return { match: false };
  for (let at = 1; at < rows.length; at++) {
    const header = rows[at] ?? [];
    if (!isHeaderRow(header)) continue;
    const band = cellText(rows[at - 1]?.[0]);
    if (band.startsWith("매출")) return { match: false, salesList: true };
    const ok =
      band.startsWith("매입") &&
      band.includes(" 계산서") &&
      !band.includes("세금계산서") &&
      columnIndex(header, "세액") < 0 &&
      companyNoOf(rows) !== null;
    return ok ? { match: true, sheetIndex, headerRow: at } : { match: false };
  }
  return { match: false };
}

function read(rows: Rows, ctx: Parameters<FormatRule["read"]>[1]): FormatReadResult {
  const header = rows[ctx.headerRow] ?? [];
  const companyNo = companyNoOf(rows);
  const supplierNoCol = columnIndex(header, "공급자사업자등록번호");
  const col = {
    작성일자: columnIndex(header, "작성일자"),
    승인번호: columnIndex(header, "승인번호"),
    공급자사업자등록번호: supplierNoCol,
    공급자상호: supplierNoCol < 0 ? -1 : supplierNoCol + 2,
    공급받는자사업자등록번호: columnIndex(header, "공급받는자사업자등록번호"),
    합계금액: columnIndex(header, "합계금액"),
    공급가액: columnIndex(header, "공급가액"),
    비고: columnIndex(header, "비고"),
  };
  const lines: ParsedLine[] = [];
  const errors: LineError[] = [];
  const supplies: number[] = [];
  const seen = new Set<string>();
  for (let at = ctx.headerRow + 1; at < rows.length; at++) {
    const row = rows[at] ?? [];
    const lineNo = at + 1;
    if (isBlankRow(row)) continue;
    const approvalNo = cellText(row[col.승인번호]);
    if (!APPROVAL_NO.test(approvalNo)) {
      errors.push({ lineNo, reason: "승인번호 읽지 못함" });
      continue;
    }
    // 승인번호는 국세청이 매긴 유일 번호라 같은 파일에 두 번 나오면 `#n`으로 가르지 않고 줄 오류다(B-F16).
    if (seen.has(approvalNo)) {
      errors.push({ lineNo, reason: "승인번호 겹침" });
      continue;
    }
    seen.add(approvalNo);
    const date = cellDate(row[col.작성일자], ctx.date1904);
    if (!date) {
      errors.push({ lineNo, reason: "작성일 읽지 못함" });
      continue;
    }
    const supplierNo = businessNoDigitsOf(row[col.공급자사업자등록번호]);
    if (supplierNo === null) {
      errors.push({ lineNo, reason: "사업자번호 읽지 못함" });
      continue;
    }
    if (businessNoDigitsOf(row[col.공급받는자사업자등록번호]) !== companyNo) {
      errors.push({ lineNo, reason: "받는 사업자 다름" });
      continue;
    }
    if (supplierNo === companyNo) {
      errors.push({ lineNo, reason: "공급자가 자사" });
      continue;
    }
    const totalKrw = cellKrw(row[col.합계금액]);
    const supplyKrw = cellKrw(row[col.공급가액]);
    if (totalKrw === null || supplyKrw === null) {
      errors.push({ lineNo, reason: "금액 읽지 못함" });
      continue;
    }
    // 면세라 세액이 없다 — 합계와 공급가가 같아야 한다.
    if (totalKrw !== supplyKrw) {
      errors.push({ lineNo, reason: "합계 맞지 않음" });
      continue;
    }
    const original = totalKrw < 0 ? ORIGINAL_APPROVAL_NO.exec(cellText(row[col.비고])) : null;
    const name = cellText(row[col.공급자상호]);
    supplies.push(supplyKrw);
    lines.push({
      lineNo,
      evidenceType: hometaxInvoice.evidenceType,
      approvalNo,
      issuedOn: date.date,
      usedAt: null,
      totalKrw,
      // 세액 0을 줄에 명시한다 — null로 두면 finalizeAmounts가 역산 줄로 보고 rateDates에 날짜를 넣는다(면세는 역산하지 않는다 · E8).
      vatKrw: 0,
      supplyKrw,
      merchant: null,
      businessNoDigits: supplierNo,
      nameOnDocument: name === "" ? null : name,
      cardLast4: null,
      needsCheck: null,
      originalApprovalNo: original?.[1] ?? null,
    });
  }
  // 3줄 총계 `총 공급가액` 하나를 줄 공급가액 합(음수 포함)과 맞댄다. 못 읽으면 그 줄을 오류로 알린다.
  const totals = rows[TOTALS_ROW] ?? [];
  const labelAt = columnIndex(totals, TOTAL_LABEL);
  const file = labelAt < 0 ? null : cellKrw(totals[labelAt + 1]);
  if (file === null) errors.push({ lineNo: TOTALS_ROW + 1, reason: "총 공급가액 읽지 못함" });
  const checksum = file === null ? null : { label: TOTAL_LABEL, file, sum: sumKrw(supplies) };
  return { lines, errors, checksum };
}

export const hometaxInvoice: FormatRule = {
  key: "hometax-invoice",
  label: "홈택스 매입 계산서",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "invoice",
  createsVendor: true,
  issuerAliases: ["홈택스"],
  keyKind: "approval",
  detect,
  read,
};
