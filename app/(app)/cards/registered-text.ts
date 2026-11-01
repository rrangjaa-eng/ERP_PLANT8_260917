// 07.1-19: `등록` 글자 한 곳 — 목록 접힌 줄 · 행 시트 `등록` 줄 · 수정 패널 읽기 `등록` 줄이 같은 문자열을 쓴다.
export type RegisteredFacts = {
  registeredVia: string;
  registeredByName: string;
  registeredOn: string | null;
  /** 06-12 구매 완료로 생긴 건의 구매 요청 번호. */
  purchaseNumber: string | null;
};

// 등록 칸 2행 `{등록자} {MM-DD}` — 대리 등록 · 구매 완료 건만.
export function registeredSecond(row: RegisteredFacts): string | null {
  return row.registeredVia === "proxy" || (row.registeredVia === "purchase" && row.purchaseNumber) ? `${row.registeredByName} ${row.registeredOn?.slice(5) ?? ""}`.trim() : null;
}

// 등록 글자 한 줄 — 문자열 하나(강조 없이 글자만).
export function registeredText(row: RegisteredFacts): string {
  const second = registeredSecond(row);
  if (second === null) return row.registeredByName;
  return `${row.registeredVia === "proxy" ? "경영관리 등록" : `구매 요청 ${row.purchaseNumber}`} · ${second}`;
}
