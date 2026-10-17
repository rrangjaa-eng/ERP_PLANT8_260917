import { cardApprovalNoOf, cardLast4Of, cellDate, cellKrw, cellText, isBlankRow } from "@/domain/evidence-import/cells";
import { columnIndex, findCardHeader, rowHasAll } from "@/domain/evidence-import/detect";
import type { FormatRule, LineError, ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 신한카드 법인이용내역(국내) — 머리줄 1(`Sheet0`), 견본 머리글 12칸 전부가 있어야 한다(old-samples 3).
// 부가세 칸이 없어 공급가는 finalizeAmounts가 역산한다. 카드 번호는 파일이 이미 가려 온다(`5531-52**-****-1278`).

const HEADER = ["이용일시", "접수일", "승인번호", "이용카드", "이용자명", "가맹점명", "이용금액", "이용구분", "할부개월수", "이용지역", "카드구분", "결제예정일"] as const;
// 해외 이용내역 파일이 국내 규칙으로 읽히지 않게 — 외화 낱말이 머리글에 하나라도 있으면 모르는 서식(E15).
const FOREIGN_WORDS = ["현지", "US$", "외화"] as const;

function isHeader(row: readonly unknown[]): boolean {
  if (!rowHasAll(row, HEADER)) return false;
  return !row.some((cell) => FOREIGN_WORDS.some((word) => cellText(cell).includes(word)));
}

export const cardShinhan: FormatRule = {
  key: "card-shinhan",
  label: "신한카드 법인이용내역",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "card_receipt",
  createsVendor: false,
  issuerAliases: ["신한"],
  keyKind: "card",
  detect: (sheets) => findCardHeader(sheets, isHeader),
  read(rows, ctx) {
    const header = rows[ctx.headerRow] ?? [];
    const col = Object.fromEntries(HEADER.map((name) => [name, columnIndex(header, name)])) as Record<(typeof HEADER)[number], number>;
    const lines: ParsedLine[] = [];
    const errors: LineError[] = [];
    for (let at = ctx.headerRow + 1; at < rows.length; at++) {
      const row = rows[at] ?? [];
      const lineNo = at + 1;
      if (isBlankRow(row)) continue;
      // 이용일시 `YYYY.MM.DD HH:mm:ss` — 알림 서비스료 같은 줄은 날짜만 있다.
      const date = cellDate(row[col.이용일시], ctx.date1904);
      if (!date) {
        errors.push({ lineNo, reason: "이용일 읽지 못함" });
        continue;
      }
      const totalKrw = cellKrw(row[col.이용금액]);
      if (totalKrw === null) {
        errors.push({ lineNo, reason: "금액 읽지 못함" });
        continue;
      }
      const merchant = cellText(row[col.가맹점명]);
      lines.push({
        lineNo,
        evidenceType: cardShinhan.evidenceType,
        approvalNo: cardApprovalNoOf(row[col.승인번호]),
        issuedOn: date.date,
        usedAt: date.time,
        totalKrw,
        vatKrw: null,
        supplyKrw: null,
        merchant: merchant === "" ? null : merchant,
        businessNoDigits: null,
        nameOnDocument: null,
        cardLast4: cardLast4Of(row[col.이용카드]),
        needsCheck: null,
        originalApprovalNo: null,
      });
    }
    return { lines, errors, checksum: null };
  },
};
