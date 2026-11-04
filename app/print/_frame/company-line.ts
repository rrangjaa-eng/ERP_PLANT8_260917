// 07.4-01 D-7405 · D-7406: 머리 B줄과 워드마크 글자. 순수 함수 — import 없음.
export type CompanyInfo = { name: string; address: string; businessNo: string; representative: string; phone: string };

// 주소 · 사업자번호 · 대표 · 전화 중 값이 있는 항목만(이름째 빼고) " · "로 잇는다. 전부 비면 null — B줄 요소를 그리지 않는다.
export function companyInfoLine(company: CompanyInfo): string | null {
  const parts = [
    company.address.trim(),
    labeled("사업자번호", company.businessNo),
    labeled("대표", company.representative),
    labeled("전화", company.phone),
  ].filter((part) => part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

function labeled(label: string, value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "" : `${label} ${trimmed}`;
}

// 회사명이 비면 글자 「PLANT8」(사용자 카드 2026-11-04 19:04 KST).
export function companyWordmark(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "PLANT8" : trimmed;
}
