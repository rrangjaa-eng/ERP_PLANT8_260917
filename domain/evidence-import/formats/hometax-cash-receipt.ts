import { vatProblem } from "@/domain/evidence-import/amounts";
import { businessNoDigitsOf, cellDate, cellKrw, cellText, isBlankRow } from "@/domain/evidence-import/cells";
import { columnIndex, findCardHeader, rowHasAll } from "@/domain/evidence-import/detect";
import { diffKrw, sumKrw } from "@/domain/money";
import type { FormatRule, LineError, ParsedLine, Rows } from "@/domain/evidence-import/types";

// 06.1-11: 홈택스 매입 현금영수증 목록 — 시트 1장, 머리글 위 줄에 `총 사용금액 : {합}(원)` 띠, 머리글 15칸(samples/hometax-cash-receipt-purchase.md).
// 머리글 · 띠 위치는 박지 않는다(B-F20 — 견본은 머리글 1행 · 띠 0행 13열). 이 목록에는 0행 우리 회사 번호가 없어 받는 사업자 대조를 하지 않는다.
// 발급수단(카드 · 휴대폰 끝자리로 보이는 숫자)은 판별 낱말로만 쓰고 칸 값을 읽지 않는다 — 사용자명 · 업종 · 업태 · 공제여부도 읽지 않는다.

export const CANCEL_CHECK = "취소거래 · 원거래 확인";
const APPROVED = "승인거래";
const CANCELLED = "취소거래";
const DETECT = ["매입일시", "발급수단", "거래구분"] as const;
const COLUMNS = ["매입일시", "가맹점사업자번호", "가맹점명", "공급가액", "부가세", "봉사료", "매입금액", "승인번호", "거래구분"] as const;
const TOTAL_LABEL = "총 사용금액";
// 견본 꼴 그대로(쉼표 · `(원)`) 전체가 맞아야 읽는다. 취소 줄만 든 파일은 합이 음수일 수 있어 앞 `-` 하나는 받는다.
const TOTAL_BAND = /^총 사용금액 : (-?[\d,]+)\(원\)$/;
// 견본 1건(영문 1 + 숫자 8)으로 꼴을 못 박지 않는다 — 비어 있지 않은 영숫자만(PA-CASH-APPR).
const APPROVAL_NO = /^[0-9A-Za-z]+$/;

// 머리글 위 줄들에서 `총 사용금액`으로 시작하는 첫 칸. 없거나 꼴이 아니면 amount null — 그 줄을 오류 줄로 알린다.
function bandTotalOf(rows: Rows, headerRow: number): { lineNo: number; amount: number | null } {
  for (let at = 0; at < headerRow; at++) {
    for (const cell of rows[at] ?? []) {
      const text = cellText(cell);
      if (!text.startsWith(TOTAL_LABEL)) continue;
      const found = TOTAL_BAND.exec(text);
      return { lineNo: at + 1, amount: found?.[1] === undefined ? null : cellKrw(found[1]) };
    }
  }
  return { lineNo: 1, amount: null };
}

export const hometaxCashReceipt: FormatRule = {
  key: "hometax-cash-receipt",
  label: "홈택스 매입 현금영수증",
  containers: ["cfb", "xlsx", "csv"],
  evidenceType: "cash_receipt",
  createsVendor: true,
  issuerAliases: ["홈택스"],
  keyKind: "approval-dated",
  detect: (sheets) => findCardHeader(sheets, (row) => rowHasAll(row, DETECT) && rowHasAll(row, COLUMNS)),
  read(rows, ctx) {
    const header = rows[ctx.headerRow] ?? [];
    const col = Object.fromEntries(COLUMNS.map((name) => [name, columnIndex(header, name)])) as Record<(typeof COLUMNS)[number], number>;
    const lines: ParsedLine[] = [];
    const errors: LineError[] = [];
    // 총계는 파일에 적힌 매입금액 그대로의 합과 맞춘다(부호 뒤집기 전 — PA-CASH-TOTAL, 홈택스가 취소를 총계에 어떻게 넣는지 견본이 없다).
    const fileTotals: number[] = [];
    const seen = new Set<string>();
    for (let at = ctx.headerRow + 1; at < rows.length; at++) {
      const row = rows[at] ?? [];
      const lineNo = at + 1;
      if (isBlankRow(row)) continue;
      // 매입일시는 한국 시간 글자(`YYYY-MM-DD HH:MM:SS`)라 날짜 부분을 그대로 쓴다(시간대 변환 없음).
      const date = cellDate(row[col.매입일시], ctx.date1904);
      if (!date) {
        errors.push({ lineNo, reason: "매입일시 읽지 못함" });
        continue;
      }
      const approvalNo = cellText(row[col.승인번호]);
      if (!APPROVAL_NO.test(approvalNo)) {
        errors.push({ lineNo, reason: "승인번호 읽지 못함" });
        continue;
      }
      const businessNo = businessNoDigitsOf(row[col.가맹점사업자번호]);
      if (businessNo === null) {
        errors.push({ lineNo, reason: "사업자번호 읽지 못함" });
        continue;
      }
      const supplyKrw = cellKrw(row[col.공급가액]);
      const vatKrw = cellKrw(row[col.부가세]);
      const serviceKrw = cellKrw(row[col.봉사료]);
      const totalKrw = cellKrw(row[col.매입금액]);
      if (supplyKrw === null || vatKrw === null || serviceKrw === null || totalKrw === null) {
        errors.push({ lineNo, reason: "금액 읽지 못함" });
        continue;
      }
      if (sumKrw([supplyKrw, vatKrw, serviceKrw]) !== totalKrw) {
        errors.push({ lineNo, reason: "금액 합 다름" });
        continue;
      }
      // 취소 줄의 낱말 · 부호는 견본으로 확인되지 않았다(PA-CASH-CANCEL) — `취소거래` 줄은 파일을 거절하지 않고 음수로 받아
      // 사람이 확인할 때까지 공개 · 붙이기를 막는다(E17 · DA-5). 공백은 지우고 맞대며(`승인 거래`), 두 낱말이 아니면 취소로 짐작하지
      // 않고 줄 오류다(독립 검토 P3-2 — 승인 줄이 음수로 담기면 정상 꼴 파일과 열쇠가 갈려 두 번 등록된다).
      const kind = cellText(row[col.거래구분]).replaceAll(/\s/g, "");
      if (kind !== APPROVED && kind !== CANCELLED) {
        errors.push({ lineNo, reason: "거래구분 읽지 못함" });
        continue;
      }
      const cancel = kind === CANCELLED;
      // 부호 · 크기 검사(독립 검토 P3-1 — 카드 서식 vatProblem과 같은 규칙): 세 칸은 매입금액과 부호가 같고 매입금액보다 크지 않아야
      // 하며, 승인 줄의 매입금액은 음수가 아니다. 부호를 짐작해 고치지 않고 줄 오류로 거절한다.
      const vatError = vatProblem(totalKrw, vatKrw);
      if (vatError) {
        errors.push({ lineNo, reason: vatError });
        continue;
      }
      if ((!cancel && totalKrw < 0) || vatProblem(totalKrw, supplyKrw) || vatProblem(totalKrw, serviceKrw)) {
        errors.push({ lineNo, reason: "합계 맞지 않음" });
        continue;
      }
      const signed = (amountKrw: number) => (cancel && totalKrw > 0 ? diffKrw(0, amountKrw) : amountKrw);
      const signedTotalKrw = signed(totalKrw);
      // 같은 승인번호가 해 · 가맹점을 넘어 다시 나와도, 취소 줄이 원거래와 승인번호를 같이 써도 열쇠는 갈린다(E17 · PA-CASH-KEY).
      // 한 파일 안 열쇠가 같은 두 줄은 `#n`으로 가르지 않고 줄 오류다(카드 서식만 `#n`).
      const sameKey = `${approvalNo}|${date.date}|${businessNo}|${signedTotalKrw}`;
      if (seen.has(sameKey)) {
        errors.push({ lineNo, reason: "승인번호 겹침" });
        continue;
      }
      seen.add(sameKey);
      fileTotals.push(totalKrw);
      const name = cellText(row[col.가맹점명]);
      lines.push({
        lineNo,
        evidenceType: hometaxCashReceipt.evidenceType,
        approvalNo,
        issuedOn: date.date,
        usedAt: date.time,
        totalKrw: signedTotalKrw,
        vatKrw: signed(vatKrw),
        // 봉사료는 매입금액에 들어 있다 — 따로 담을 칸이 없어 공급가에 합친다(합계 = 공급가 + 세액 CHECK · PA-CASH-SVC).
        supplyKrw: sumKrw([signed(supplyKrw), signed(serviceKrw)]),
        merchant: null,
        businessNoDigits: businessNo,
        nameOnDocument: name === "" ? null : name,
        cardLast4: null,
        needsCheck: cancel ? CANCEL_CHECK : null,
        originalApprovalNo: null,
      });
    }
    const band = bandTotalOf(rows, ctx.headerRow);
    if (band.amount === null) errors.push({ lineNo: band.lineNo, reason: "총 사용금액 읽지 못함" });
    const checksum = band.amount === null ? null : { label: TOTAL_LABEL, file: band.amount, sum: sumKrw(fileTotals) };
    return { lines, errors, checksum };
  },
};
