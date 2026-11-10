import { createElement } from "react";
import type { QuoteClientPrintDto } from "@/domain/quotes/client-print";
import { formatKrw, formatQuantity } from "@/lib/format-number";
import type { PrintTableRow } from "@/app/print/_frame/PrintTable";
import styles from "@/app/print/_frame/print-frame.module.css";

// 07.2-10 Task 2: 고객 견적서 표 행. 셈이 없다 — 소계 · 합계는 DTO가 이미 가진 저장 견적가 합이다. DTO 줄은 buildQuoteClientPrint가 대분류 모음 ·
// 중분류 없는 줄 먼저로 정렬해 두었으므로 여기서는 다시 정렬하지 않고 대분류 · 중분류가 바뀌는 자리에서 머리를 낸다.
// 합계 셋(Sub Total · Total · Grand Total)은 tbody 끝 행이다 — tfoot은 여러 쪽에서 쪽마다 되풀이될 수 있다.
const COLUMNS = 6;
const BLANK = "";

function sumRow(key: string, label: string, amountKrw: number): PrintTableRow {
  return { key, variant: "sum", cells: [label, BLANK, BLANK, BLANK, formatKrw(amountKrw), BLANK] };
}

export function quoteRows(dto: QuoteClientPrintDto): PrintTableRow[] {
  if (dto.lines.length === 0) return [];
  const subtotalOf = (major: string) => dto.groups.find((group) => group.major === major)?.subtotalKrw ?? 0;
  const rows: PrintTableRow[] = [];
  let major: string | null = null;
  let mid: string | null = null;

  for (const line of dto.lines) {
    if (line.major !== major) {
      if (major !== null) rows.push(sumRow(`subtotal-${major}`, "Sub Total", subtotalOf(major)));
      major = line.major;
      mid = null;
      rows.push({ key: `group-${major}`, variant: "group", cells: [{ span: COLUMNS, content: major }] });
    }
    if (line.mid !== null && line.mid !== mid) {
      rows.push({ key: `sub-${major}-${line.mid}`, variant: "subgroup", cells: [{ span: COLUMNS, content: line.mid }] });
    }
    mid = line.mid;
    rows.push({
      key: line.id,
      cells: [line.item, formatQuantity(line.quantity), formatKrw(line.unitPriceKrw), formatQuantity(line.days), formatKrw(line.amountKrw), line.remark ?? BLANK],
    });
  }
  if (major !== null) rows.push(sumRow(`subtotal-${major}`, "Sub Total", subtotalOf(major)));
  rows.push(sumRow("total", "Total", dto.totalKrw));

  for (const line of dto.commissionLines) {
    rows.push({ key: line.id, cells: [line.item, BLANK, BLANK, BLANK, formatKrw(line.amountKrw), line.remark ?? BLANK] });
  }

  rows.push({
    key: "grand",
    variant: "grand",
    cells: [
      createElement("span", { key: "label", className: styles.totalLabel }, "Grand Total"),
      {
        span: 4,
        content: [
          createElement("span", { key: "amount", className: `${styles.num} ${styles.totalAmount}` }, formatKrw(dto.grandTotalKrw)),
          createElement("span", { key: "vat", className: styles.small }, "VAT excluded"),
        ],
      },
      BLANK,
    ],
  });
  return rows;
}
