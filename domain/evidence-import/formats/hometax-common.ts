import { businessNoDigitsOf, cellText } from "@/domain/evidence-import/cells";
import type { Rows } from "@/domain/evidence-import/types";

// 07.1-05 PF9 — 홈택스 매입 계산서(면세) · 세금계산서 두 형식이 함께 쓰는 읽기. 옛 260907 receiptImport.ts도 두 홈택스 형식이 머리 줄 판정을 한 파일에서 썼다.

// 0행 `사업자 등록번호` 다음 칸 — 내려받은 사람의 회사. 숫자 10자리가 아니면 null(E18).
export function companyNoOf(rows: Rows): string | null {
  const row = rows[0] ?? [];
  const at = row.findIndex((cell) => cellText(cell).replaceAll(/\s/g, "") === "사업자등록번호");
  return at < 0 ? null : businessNoDigitsOf(row[at + 1]);
}

export function isHeaderRow(row: readonly unknown[]): boolean {
  return cellText(row[0]) === "작성일자" && cellText(row[1]) === "승인번호";
}
