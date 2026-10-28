import { vatProblem } from "@/domain/evidence-import/amounts";
import { businessNoDigitsOf, cardApprovalNoOf, cardLast4Of, cellDate, cellKrw, cellText, isBlankRow, isZeroOrBlank } from "@/domain/evidence-import/cells";
import { columnIndex, findCardHeader, rowHasAll } from "@/domain/evidence-import/detect";
import { diffKrw, sumKrw } from "@/domain/money";
import type { FormatRule, LineError, ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 비씨카드 이용내역 — 머리줄 1(`Sheet1`, 37칸 · C-86 새 양식 28칸은 거래금액(외화) 칸이 없어 국내외사용구분만으로 해외를 가린다). 모든 칸이 고정폭 공백 패딩 문자열이다(old-samples 2).
// 카드 번호 · 결제 계좌번호는 평문으로 온다 — 끝 4자리만 남기고 계좌번호 · 외화 금액 칸은 읽지 않는다.

const CANCEL_CHECK = "취소 표시 줄 · 원거래 확인";
const OVERSEAS_CHECK = "해외 이용 · 원화 금액 확인";
const DETECT_ANY = ["수신정보구분코드", "금액SIGN코드"] as const;
const COLUMNS = ["카드번호", "국내외사용구분", "승인번호", "승인일자", "금액SIGN코드", "거래금액(원화)", "부가세", "가맹점사업자번호", "가맹점명"] as const;

function isHeader(row: readonly unknown[]): boolean {
  return DETECT_ANY.some((name) => columnIndex(row, name) >= 0) && rowHasAll(row, COLUMNS);
}

// 파일이 이미 음수로 준 값은 그대로, 양수만 음으로 돌린다(`-` 표시 줄).
function negative(amountKrw: number): number {
  return amountKrw > 0 ? diffKrw(0, amountKrw) : amountKrw;
}

export const cardBc: FormatRule = {
  key: "card-bc",
  label: "비씨카드 이용내역",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "card_receipt",
  createsVendor: false,
  issuerAliases: ["비씨", "BC"],
  keyKind: "card",
  dateIsUsage: true, // 승인일자
  detect: (sheets) => findCardHeader(sheets, isHeader),
  read(rows, ctx) {
    const header = rows[ctx.headerRow] ?? [];
    const col = Object.fromEntries(COLUMNS.map((name) => [name, columnIndex(header, name)])) as Record<(typeof COLUMNS)[number], number>;
    const foreignCol = columnIndex(header, "거래금액(외화)");
    const lines: ParsedLine[] = [];
    const errors: LineError[] = [];
    let summaryKrw: number | null = null;
    for (let at = ctx.headerRow + 1; at < rows.length; at++) {
      const row = rows[at] ?? [];
      const lineNo = at + 1;
      if (isBlankRow(row)) continue;
      // 요약 줄은 「첫 칸 공백 제거가 `합계`」 하나로만 가린다 — 승인번호 빈 줄(연회비 등)은 실제 청구 줄이다(E13).
      if (cellText(row[0]).replaceAll(/\s/g, "") === "합계") {
        summaryKrw = cellKrw(row[col["거래금액(원화)"]]);
        if (summaryKrw === null) errors.push({ lineNo, reason: "합계 읽지 못함" });
        continue;
      }
      const date = cellDate(row[col.승인일자], ctx.date1904);
      if (!date) {
        errors.push({ lineNo, reason: "승인일 읽지 못함" });
        continue;
      }
      // 금액SIGN코드: 공백 · `+` 양수, `-` 음수(취소 표시 — 견본에 취소가 없어 원거래 확인으로 넘긴다), 그 밖은 줄 오류(PA-BC-SIGN).
      const sign = cellText(row[col.금액SIGN코드]);
      const fileTotal = cellKrw(row[col["거래금액(원화)"]]);
      if (fileTotal === null || (sign !== "" && sign !== "+" && sign !== "-")) {
        errors.push({ lineNo, reason: "금액 읽지 못함" });
        continue;
      }
      const fileVat = cellKrw(row[col.부가세]);
      if (fileVat === null) {
        errors.push({ lineNo, reason: "부가세 읽지 못함" });
        continue;
      }
      const totalKrw = sign === "-" ? negative(fileTotal) : fileTotal;
      const vatKrw = sign === "-" ? negative(fileVat) : fileVat;
      const vatError = vatProblem(totalKrw, vatKrw);
      if (vatError) {
        errors.push({ lineNo, reason: vatError });
        continue;
      }
      const overseas = cellText(row[col.국내외사용구분]) !== "국내" || (foreignCol >= 0 && !isZeroOrBlank(row[foreignCol]));
      const merchant = cellText(row[col.가맹점명]);
      lines.push({
        lineNo,
        evidenceType: cardBc.evidenceType,
        approvalNo: cardApprovalNoOf(row[col.승인번호]),
        issuedOn: date.date,
        usedAt: date.time,
        totalKrw,
        vatKrw,
        supplyKrw: null,
        merchant: merchant === "" ? null : merchant,
        // 파일이 이미 가려 온다(`113-**-*****`) — 숫자 10자리가 아니면 null(PA-BC-BIZ).
        businessNoDigits: businessNoDigitsOf(row[col.가맹점사업자번호]),
        nameOnDocument: null,
        cardLast4: cardLast4Of(row[col.카드번호]),
        needsCheck: sign === "-" ? CANCEL_CHECK : overseas ? OVERSEAS_CHECK : null,
        originalApprovalNo: null,
      });
    }
    const checksum = summaryKrw === null ? null : { label: "총 합계금액", file: summaryKrw, sum: sumKrw(lines.map((line) => line.totalKrw)) };
    return { lines, errors, checksum };
  },
};
