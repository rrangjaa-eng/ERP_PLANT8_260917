import { businessNoDigitsOf, cardLast4Of, cellDate, cellKrw, cellText, cellTime, isBlankRow } from "@/domain/evidence-import/cells";
import { columnIndex, findCardHeader, rowHasAll } from "@/domain/evidence-import/detect";
import type { FormatRule, LineError, ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 롯데카드 매입내역 — 머리줄 2(1줄은 병합 제목 `매입내역`), 머리글 22칸(old-samples 1).
// 카드 번호 칸은 전체 16자리 평문이라 끝 4자리만 남긴다.

const DETECT = ["청구예정일", "하위가맹점명"] as const;
const COLUMNS = ["카드번호", "매입일자", "매입시간", "가맹점명", "매입금액", "부가세", "승인번호", "사업자번호", "하위가맹점명"] as const;

function approvalOf(value: unknown): string | null {
  const text = cellText(value);
  // `00000000` 같은 가짜 승인번호는 열쇠로 쓰지 않는다 — 대체 열쇠로 간다.
  return /[1-9]/.test(text) ? text : null;
}

export const cardLotte: FormatRule = {
  key: "card-lotte",
  label: "롯데카드 매입내역",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "card_receipt",
  createsVendor: false,
  issuerAliases: ["롯데"],
  keyKind: "card",
  detect: (sheets) => findCardHeader(sheets, (row) => rowHasAll(row, DETECT) && rowHasAll(row, COLUMNS)),
  read(rows, ctx) {
    const header = rows[ctx.headerRow] ?? [];
    const col = Object.fromEntries(COLUMNS.map((name) => [name, columnIndex(header, name)])) as Record<(typeof COLUMNS)[number], number>;
    const lines: ParsedLine[] = [];
    const errors: LineError[] = [];
    for (let at = ctx.headerRow + 1; at < rows.length; at++) {
      const row = rows[at] ?? [];
      const lineNo = at + 1;
      if (isBlankRow(row)) continue;
      const date = cellDate(row[col.매입일자], ctx.date1904);
      if (!date) {
        errors.push({ lineNo, reason: "매입일 읽지 못함" });
        continue;
      }
      const totalKrw = cellKrw(row[col.매입금액]);
      if (totalKrw === null) {
        errors.push({ lineNo, reason: "금액 읽지 못함" });
        continue;
      }
      const vatKrw = cellKrw(row[col.부가세]);
      if (vatKrw === null) {
        errors.push({ lineNo, reason: "부가세 읽지 못함" });
        continue;
      }
      const sub = cellText(row[col.하위가맹점명]);
      const merchant = sub === "" ? cellText(row[col.가맹점명]) : sub;
      lines.push({
        lineNo,
        evidenceType: cardLotte.evidenceType,
        approvalNo: approvalOf(row[col.승인번호]),
        issuedOn: date.date,
        usedAt: cellTime(row[col.매입시간]) ?? date.time,
        totalKrw,
        vatKrw,
        supplyKrw: null,
        merchant: merchant === "" ? null : merchant,
        businessNoDigits: businessNoDigitsOf(row[col.사업자번호]),
        nameOnDocument: null,
        cardLast4: cardLast4Of(row[col.카드번호]),
        needsCheck: null,
        originalApprovalNo: null,
      });
    }
    return { lines, errors, checksum: null };
  },
};
