// 04-04 Task 3 인간 확인(2026-09-23) — 실제 Windows Excel 클립보드 text/plain 캡처 원문.
// 04-31(사용자 승인 2026-09-23 — 04-04 Task 3 종결 방식 재사용) — 엑셀 → 앱 붙여넣기의
// 사람 눈 재확인은 하지 않는다. 이 원문을 최종 표에서 재생하는 단위
// (test/unit/ui/parse-tsv.test.ts)와 E2E(test/e2e/excel-paste-final.spec.ts)가 그
// 확인을 대신한다. 바이트를 고치지 않는다 — 파싱 결과가 달라지면 이 상수가 아니라
// 파서가 틀린 것이다. 원문은 이 모듈 하나에만 있다(Grep `REAL_EXCEL_WINDOWS_20260923`
// 정의 1건).

/**
 * 3×3 캡처(헤더 행 + 번호 열 포함, 2026-09-23 실제 Windows Excel). 열 순서: (번호) ·
 * A(항목류) · B(수량) · C(단가). 2행 B열은 큰따옴표만 있고 줄바꿈이 없는 칸(인용되지
 * 않는다 — 따옴표가 그대로 리터럴로 남는다), 3행 B열은 줄바꿈이 있는 칸(인용된 칸,
 * CRLF → LF 정규화). 04-04 Task 1이 처음 구현했을 때 이 둘을 구분하지 못해 따옴표만
 * 있는 칸의 따옴표를 지워 버렸다 — 이 상수를 재생하는 회귀 테스트가 그 결함을 잡는다.
 */
export const REAL_EXCEL_WINDOWS_20260923 =
  '\tA\tB\tC\r\n1\t무대 설치\t2\t 1,200,000 \r\n2\t"대형" 현수막\t5\t 35,000 \r\n3\t"비고 첫 줄\r\n둘째 줄"\t1\t₩450,000 ';

// 04-31 Task 1 ① — 실제 6열·45줄 캡처는 아직 없다(사람 확인은 Task 2에서 받는다).
// 위 3×3 캡처가 이미 증명한 실제 행 모양 셋(평범한 칸 · 따옴표만 있고 줄바꿈 없는 칸 ·
// 줄바꿈이 있는 인용 칸)을 그대로 이어 45줄을 조립한다 — 손으로 지어낸 새 규칙(예:
// 두 겹 따옴표만 있는 칸)은 쓰지 않는다. `trailingNewline`은 캡처와 같은 끝 CRLF
// 하나를 더한다(04-47 C-05 — 끝 줄바꿈이 46번째 빈 줄을 만들면 안 된다).
const CAPTURED_ROW_SHAPES = ["무대 설치", '"대형" 현수막', '"비고 첫 줄\r\n둘째 줄"'] as const;

export function buildFortyFiveLineCapture(opts: { trailingNewline?: boolean } = {}): string {
  const rows = Array.from({ length: 45 }, (_, index) => CAPTURED_ROW_SHAPES[index % CAPTURED_ROW_SHAPES.length]);
  return rows.join("\r\n") + (opts.trailingNewline ? "\r\n" : "");
}
