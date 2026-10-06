// 이 함수 = 견적 줄이 어느 문(구매 요청 / 지출결의)으로 가는지(O-13). 05 `domain/expenses/line-door.ts`의 `expenseLineDoor` = 지출결의 문이
// 열려 있는지(open/closed/no_vendor/none) — 축이 다르다. 두 값의 조합은 06-13 줄 DTO. 설정을 스스로 읽지 않는다(06-08 게이트가 읽어 넘긴다).

export type LineDoorKind = "purchase" | "expense";

function normalizeName(name: string): string {
  return name.trim().normalize("NFC");
}

export function resolveLineDoor(line: { vendorName: string | null }, onlineVendorName: string): LineDoorKind {
  const online = normalizeName(onlineVendorName);
  if (online === "" || line.vendorName === null) return "expense";
  return normalizeName(line.vendorName) === online ? "purchase" : "expense";
}
