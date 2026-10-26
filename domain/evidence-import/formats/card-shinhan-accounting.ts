import { vatProblem } from "@/domain/evidence-import/amounts";
import { businessNoDigitsOf, cardApprovalNoOf, cardLast4Of, cellDate, cellKrw, cellText, cellTime, isBlankRow, isZeroOrBlank } from "@/domain/evidence-import/cells";
import { columnIndex, findCardHeader, rowHasAll } from "@/domain/evidence-import/detect";
import { OVERSEAS_CHECK } from "@/domain/evidence-import/formats/card-lotte";
import type { FormatRule, LineError, ParsedLine } from "@/domain/evidence-import/types";

// C-86: 신한카드 법인이용내역 전체 회계양식 — 실물 25칸 · 머리줄 1 · 요약 줄 없음. 옛 12칸 card-shinhan · 비씨와 감지 칸이 겹치지 않는다.
// 공급가액(원화) 칸은 읽지 않는다 — 공급가는 시스템이 합계 − 부가세로 정한다(finalizeAmounts).

const DETECT = ["카드소유자명", "사용구분", "승인금액(원화)", "공급가액(원화)", "외화거래국가코드"] as const;
const COLUMNS = ["카드번호", "사용구분", "승인번호", "승인일자", "승인시간", "승인금액(원화)", "승인금액(외화)", "부가세", "가맹점사업자번호", "가맹점명"] as const;

function isHeader(row: readonly unknown[]): boolean {
  return rowHasAll(row, DETECT) && rowHasAll(row, COLUMNS);
}

export const cardShinhanAccounting: FormatRule = {
  key: "card-shinhan-accounting",
  label: "신한카드 법인이용내역(회계양식)",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "card_receipt",
  createsVendor: false,
  issuerAliases: ["신한"],
  keyKind: "card",
  keyPrefix: "card-shinhan",
  detect: (sheets) => findCardHeader(sheets, isHeader),
  read(rows, ctx) {
    const header = rows[ctx.headerRow] ?? [];
    const col = Object.fromEntries(COLUMNS.map((name) => [name, columnIndex(header, name)])) as Record<(typeof COLUMNS)[number], number>;
    const lines: ParsedLine[] = [];
    const errors: LineError[] = [];
    for (let at = ctx.headerRow + 1; at < rows.length; at++) {
      const row = rows[at] ?? [];
      const lineNo = at + 1;
      if (isBlankRow(row)) continue;
      const date = cellDate(row[col.승인일자], ctx.date1904);
      if (!date) {
        errors.push({ lineNo, reason: "승인일 읽지 못함" });
        continue;
      }
      const totalKrw = cellKrw(row[col["승인금액(원화)"]]);
      if (totalKrw === null) {
        errors.push({ lineNo, reason: "금액 읽지 못함" });
        continue;
      }
      const vatKrw = cellKrw(row[col.부가세]);
      if (vatKrw === null) {
        errors.push({ lineNo, reason: "부가세 읽지 못함" });
        continue;
      }
      const vatError = vatProblem(totalKrw, vatKrw);
      if (vatError) {
        errors.push({ lineNo, reason: vatError });
        continue;
      }
      const merchant = cellText(row[col.가맹점명]);
      const overseas = cellText(row[col.사용구분]) !== "국내" || !isZeroOrBlank(row[col["승인금액(외화)"]]);
      lines.push({
        lineNo,
        evidenceType: cardShinhanAccounting.evidenceType,
        approvalNo: cardApprovalNoOf(row[col.승인번호]),
        issuedOn: date.date,
        usedAt: cellTime(row[col.승인시간]) ?? date.time,
        totalKrw,
        vatKrw,
        supplyKrw: null,
        merchant: merchant === "" ? null : merchant,
        businessNoDigits: businessNoDigitsOf(row[col.가맹점사업자번호]),
        nameOnDocument: null,
        cardLast4: cardLast4Of(row[col.카드번호]),
        needsCheck: overseas ? OVERSEAS_CHECK : null,
        originalApprovalNo: null,
      });
    }
    return { lines, errors, checksum: null };
  },
};
