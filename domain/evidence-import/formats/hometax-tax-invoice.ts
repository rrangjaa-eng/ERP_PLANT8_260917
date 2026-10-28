import { businessNoDigitsOf, cellDate, cellKrw, cellText, isBlankRow } from "@/domain/evidence-import/cells";
import { columnIndex } from "@/domain/evidence-import/detect";
import { companyNoOf, isHeaderRow } from "@/domain/evidence-import/formats/hometax-common";
import { sumKrw } from "@/domain/money";
import type { DetectResult, FormatReadResult, FormatRule, LineError, ParsedLine, Rows } from "@/domain/evidence-import/types";

// 06.1-02: 홈택스 매입 전자(수정)세금계산서 목록 — 시트 `세금계산서`, 0행 우리 회사 번호, 3줄 총계, 5줄 띠, 6줄 머리글 33칸(old-samples 4).
// `상호` · `대표자명` 등 이름이 겹쳐 닻 `공급자사업자등록번호` 기준 위치로 읽는다. 대표 품목 칸은 금액으로 쓰지 않는다.

const SHEET_NAME = "세금계산서";
const TOTALS_ROW = 2;
const TOTAL_LABELS = ["총 합계금액", "총 공급가액", "총 세액"] as const;
// 국세청 승인번호 끝 8자리는 소문자 영숫자가 섞인다(C-86 실물).
const APPROVAL_NO = /^\d{8}-\d{8}-[0-9a-z]{8}$/;
const ORIGINAL_APPROVAL_NO = /당초\s*승인번호\s*\(([^)]+)\)/;

// 계산서 꼴이 세금계산서로 갈리지 않게 띠(`매입` 시작 · `세금계산서` 포함)와 `세액` 칸을 함께 본다.
function detect(sheets: Parameters<FormatRule["detect"]>[0], container: Parameters<FormatRule["detect"]>[1]): DetectResult {
  const sheetIndex = container === "csv" ? 0 : sheets.findIndex((sheet) => sheet.name === SHEET_NAME);
  const rows = sheets[sheetIndex]?.rows;
  if (!rows) return { match: false };
  for (let at = 1; at < rows.length; at++) {
    const header = rows[at] ?? [];
    if (!isHeaderRow(header)) continue;
    const band = cellText(rows[at - 1]?.[0]);
    if (band.startsWith("매출")) return { match: false, salesList: true };
    const totals = rows[TOTALS_ROW] ?? [];
    const ok =
      band.startsWith("매입") &&
      band.includes("세금계산서") &&
      columnIndex(header, "세액") >= 0 &&
      TOTAL_LABELS.every((label) => columnIndex(totals, label) >= 0) &&
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
    세액: columnIndex(header, "세액"),
    전자세금계산서분류: columnIndex(header, "전자세금계산서분류"),
    비고: columnIndex(header, "비고"),
  };
  const lines: ParsedLine[] = [];
  const errors: LineError[] = [];
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
    // 홈택스 승인번호는 국세청이 매긴 유일 번호라 같은 파일에 두 번 나오면 `#n`으로 가르지 않고 줄 오류다(B-F16).
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
    const vatKrw = cellKrw(row[col.세액]);
    if (totalKrw === null || supplyKrw === null || vatKrw === null) {
      errors.push({ lineNo, reason: "금액 읽지 못함" });
      continue;
    }
    if (sumKrw([supplyKrw, vatKrw]) !== totalKrw) {
      errors.push({ lineNo, reason: "합계 맞지 않음" });
      continue;
    }
    const amended = cellText(row[col.전자세금계산서분류]) === "수정세금계산서";
    const original = amended ? ORIGINAL_APPROVAL_NO.exec(cellText(row[col.비고])) : null;
    const name = cellText(row[col.공급자상호]);
    lines.push({
      lineNo,
      evidenceType: hometaxTaxInvoice.evidenceType,
      approvalNo,
      issuedOn: date.date,
      usedAt: null,
      totalKrw,
      vatKrw,
      supplyKrw,
      merchant: null,
      businessNoDigits: supplierNo,
      nameOnDocument: name === "" ? null : name,
      cardLast4: null,
      needsCheck: null,
      originalApprovalNo: original?.[1]?.trim() || null,
    });
  }
  // 3줄 총계 셋을 줄 합과 맞댄다 — 하나라도 다르면 검산 거절. 다른 것이 없으면 총 합계금액 쌍을 돌려준다.
  const totals = rows[TOTALS_ROW] ?? [];
  const sums = [
    sumKrw(lines.map((line) => line.totalKrw)),
    sumKrw(lines.map((line) => line.supplyKrw ?? 0)),
    sumKrw(lines.map((line) => line.vatKrw ?? 0)),
  ];
  const pairs = TOTAL_LABELS.map((label, i) => ({ label, file: cellKrw(totals[columnIndex(totals, label) + 1]), sum: sums[i] ?? 0 }));
  if (pairs.some((pair) => pair.file === null)) errors.push({ lineNo: TOTALS_ROW + 1, reason: "합계 읽지 못함" });
  const checked = pairs.flatMap((pair) => (pair.file === null ? [] : [{ label: pair.label, file: pair.file, sum: pair.sum }]));
  const checksum = checked.find((pair) => pair.file !== pair.sum) ?? checked[0] ?? null;
  return { lines, errors, checksum };
}

export const hometaxTaxInvoice: FormatRule = {
  key: "hometax-tax-invoice",
  label: "홈택스 매입 세금계산서",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "tax_invoice",
  createsVendor: true,
  issuerAliases: ["홈택스"],
  keyKind: "approval",
  detect,
  read,
};
