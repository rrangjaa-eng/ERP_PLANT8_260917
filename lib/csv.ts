// 06.1-13 G6(RP-16) — 행동 로그 내보내기(domain/action-log/export.ts)에서 꺼냈다. 증빙 목록 파일 받기(domain/evidence-records/export.ts)와
// 함께 쓴다 — 동작 · 주석 그대로.

// 앞머리가 이 문자면 Excel·LibreOffice가 셀을 수식으로 평가한다. 인용만으로는
// 막히지 않는다 — 따옴표 안에 있어도 평가된다.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

// 표준 CSV 이스케이프 — 구분자·줄바꿈·따옴표가 있으면 따옴표로 감싸고 내부
// 따옴표는 둘로 늘린다(RFC4180과 같은 결).
//
// 더해서 수식 인젝션을 막는다(/cso F3): 내보내기 파일은 BOM을 붙여 Excel
// 더블클릭 열기를 노리므로, 사용자가 정하는 값(거래처·사람·팀 이름 등)이
// 그대로 나가면 대표·경영관리의 Excel에서 수식으로 실행된다. 앞에 작은따옴표를
// 붙이면 Excel이 텍스트로 읽고, 사람이 읽는 값은 그대로 남는다(감사 기록이다).
export function csvEscape(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
