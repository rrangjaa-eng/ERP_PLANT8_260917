// 04-04 Task 3 인간 확인(2026-09-23) — 실제 Windows Excel 클립보드 text/plain 캡처 원문.
// 04-31(사용자 승인 2026-09-23 — 04-04 Task 3 종결 방식 재사용) — 엑셀 → 앱 붙여넣기의
// 사람 눈 재확인은 하지 않는다. 이 원문을 최종 표에서 재생하는 단위
// (test/unit/ui/parse-tsv.test.ts)와 E2E(test/e2e/excel-paste-final.spec.ts)가 그
// 확인을 대신한다. 바이트를 고치지 않는다 — 파싱 결과가 달라지면 이 상수가 아니라
// 파서가 틀린 것이다. 원문은 이 모듈이 정본이다 — test/unit/ui/parse-tsv.test.ts가
// 같은 값을 한 벌 더 갖고 있는 건 boundaries 규칙(D-26, "ui" 요소는 "test" 요소를
// import할 수 없다) 때문이고, E2E는 이 모듈을 그대로 import해 재생한다(중복 정의가
// 아니라 복제 — Grep `REAL_EXCEL_WINDOWS_2026` 정의는 파일마다 1건씩).

/**
 * 3×3 캡처(헤더 행 + 번호 열 포함, 2026-09-23 실제 Windows Excel). 열 순서: (번호) ·
 * A(항목류) · B(수량) · C(단가). 2행 B열은 큰따옴표만 있고 줄바꿈이 없는 칸(인용되지
 * 않는다 — 따옴표가 그대로 리터럴로 남는다), 3행 B열은 줄바꿈이 있는 칸(인용된 칸,
 * CRLF → LF 정규화). 04-04 Task 1이 처음 구현했을 때 이 둘을 구분하지 못해 따옴표만
 * 있는 칸의 따옴표를 지워 버렸다 — 이 상수를 재생하는 회귀 테스트가 그 결함을 잡는다.
 */
export const REAL_EXCEL_WINDOWS_20260923 =
  '\tA\tB\tC\r\n1\t무대 설치\t2\t 1,200,000 \r\n2\t"대형" 현수막\t5\t 35,000 \r\n3\t"비고 첫 줄\r\n둘째 줄"\t1\t₩450,000 ';

// 04-31 Task 1 ① — 실제 6열·45줄 캡처는 아직 없었다(사람 확인은 Task 2가 받았다 — 아래
// REAL_EXCEL_WINDOWS_20260928_* 둘). 그 전까지는 위 3×3 캡처가 이미 증명한 실제 행
// 모양 셋(평범한 칸 · 따옴표만 있고 줄바꿈 없는 칸 · 줄바꿈이 있는 인용 칸)을 그대로
// 이어 45줄을 조립했다 — 손으로 지어낸 새 규칙(예: 두 겹 따옴표만 있는 칸)은 쓰지
// 않는다. `trailingNewline`은 캡처와 같은 끝 CRLF 하나를 더한다(04-47 C-05 — 끝
// 줄바꿈이 46번째 빈 줄을 만들면 안 된다).
const CAPTURED_ROW_SHAPES = ["무대 설치", '"대형" 현수막', '"비고 첫 줄\r\n둘째 줄"'] as const;

export function buildFortyFiveLineCapture(opts: { trailingNewline?: boolean } = {}): string {
  const rows = Array.from({ length: 45 }, (_, index) => CAPTURED_ROW_SHAPES[index % CAPTURED_ROW_SHAPES.length]);
  return rows.join("\r\n") + (opts.trailingNewline ? "\r\n" : "");
}

// 04-31 Task 2 인간 확인(2026-09-28, PR #85 댓글 5861946973) — (A) 실제 Windows
// Excel 클립보드 text/plain 캡처, 앱 형식(A~F 6열, ENG-D5 테스트가 쓰는 소분류·항목·
// 거래처·수량·단가·실행가 순서)과 다른 헤더 A..F. 데이터 2행 — 1행 항목 칸은 셀 안에
// 바로 줄바꿈을 넣어 복사한 칸(따옴표로 감싸이고, 안의 줄바꿈은 CRLF가 아니라 엑셀이
// 그대로 넣은 LF 하나), 2행 항목 칸은 따옴표만 있고 줄바꿈은 없는 칸(인용된 칸이
// 아니다 — 따옴표가 리터럴로 남는다, 04-04가 이미 증명한 모양). 줄 끝은 CRLF, 끝에도
// CRLF 하나(엑셀 복사 관례). 바이트를 고치지 않는다.
export const REAL_EXCEL_WINDOWS_20260928_SIX_COL =
  'A\tB\tC\tD\tE\tF\r\n무대·시공\t"무대 설치\n2일차"\t가나기획\t2\t1,200,000\t1,000,000\r\n인쇄\t"대형" 현수막\t다라인쇄\t5\t35,000\t30,000\r\n';

// 04-31 Task 2 인간 확인(2026-09-28, PR #85 댓글 5861989538) — (B) 실제 Windows
// Excel 클립보드 text/plain 캡처, 45줄(헤더 없음). 각 줄은 `항목N\t2\t 10,000 \t비고`
// — 단가 칸 앞뒤에 실제 엑셀이 넣는 공백이 있다(쉼표 천 단위 구분과 함께 정규화
// 대상). 10번째 줄만 비고 칸이 비어 있다(4번째 칸이 빈 문자열 — 가운데 빈 칸이
// 사라지면 안 된다는 걸 이 캡처가 증명한다). 줄 끝은 CRLF, 끝에도 CRLF 하나.
// 조립식(Array.from...join)은 위 45줄이 기계적으로 반복되는 캡처라 손으로 45줄을
// 옮겨 적는 대신 쓴 것 — 값은 캡처 원문과 바이트 단위로 같다(사람 확인 시 대조 완료).
export const REAL_EXCEL_WINDOWS_20260928_FORTY_FIVE =
  Array.from({ length: 45 }, (_, index) => {
    const lineNumber = index + 1;
    const note = lineNumber === 10 ? "" : "비고";
    return `항목${lineNumber}\t2\t 10,000 \t${note}`;
  }).join("\r\n") + "\r\n";
