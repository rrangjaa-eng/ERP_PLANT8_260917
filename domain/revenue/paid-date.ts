import type { CellFormatError } from "@/domain/quotes/lines";

// 07.6-01(D-7608): 입금은 이미 들어온 돈이라 오늘(KST) 뒤 날짜를 막는다. 발행 줄은 막지 않는다(260907 3-15 선발행).
export const FUTURE_PAID_DATE = "미래 입금일 · 오늘까지 날짜 고르기";

// 새 줄 · id 없는 줄 · 날짜를 바꾼 줄만 본다 — 이미 저장된 미래 입금 줄의 다른 칸 수정은 그대로 된다(A4).
// KST `YYYY-MM-DD` 문자열 비교가 곧 날짜 비교다.
export function futurePaidDateErrors(
  rows: readonly { id?: string; isNew?: true; entryDate: string }[],
  priorById: ReadonlyMap<string, { entryDate: string }>,
  today: string,
): CellFormatError[] {
  const errors: CellFormatError[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.entryDate <= today) return;
    const prior = row.id && !row.isNew ? priorById.get(row.id) : undefined;
    if (prior && prior.entryDate === row.entryDate) return;
    errors.push({ rowIndex, ...(row.id ? { rowId: row.id } : {}), field: "entryDate", label: "날짜", reason: FUTURE_PAID_DATE });
  });
  return errors;
}
