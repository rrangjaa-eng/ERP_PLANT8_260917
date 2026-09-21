# 03-07 Task 1: Excel 내보내기 수단 — 확정 답

**결정:** 옵션 A — UTF-8 BOM CSV, 신규 의존성 0. `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`에
2026-09-20 계획 세션에서 사용자가 이미 검토·확정한 기록이 있다. 이 플랜의
`<resume-signal>`은 「A」 답변을 그대로 확정하는 것으로 정의한다. 그 기록을
실행 시점에 그대로 적용한다 — 다시 묻지 않는다.

## 확정 내용

- **UTF-8 BOM을 붙인 CSV.** `﻿` 접두어 + 문자열 조립으로 구현한다. Excel이 BOM이
  있는 CSV를 UTF-8로 인식해 한글이 깨지지 않고 더블클릭으로 바로 열린다.
- **신규 런타임 의존성 0.** `.xlsx` 생성 패키지(`exceljs` 등)를 추가하지 않는다 —
  03-RESEARCH.md § Standard Stack의 "이 페이즈는 새 런타임 의존성이 필요 없다" 판정이
  유효하게 남고, § Package Legitimacy Audit의 "대상 없음" 판정도 그대로 유지된다. Task 2
  이후 `git diff package.json`에 새 dependency 줄이 없다.
- **반환 형태 고정 — `{ filename, contentType, body }` 세 조각.** `exportActionLog(viewer,
  filter)`가 이 형태를 돌려주고 액션이 그것을 그대로 `Response`로 내려보낸다. 이 계약이
  내보내기 레지스트리(03-03)의 계약이 되어 Phase 6·7·9의 내보내기가 물려받는다.
- **행·열 구조와 직렬화를 분리한다.** `domain/action-log/export.ts`의
  `serializeActionLogExportAsCsv(rows: ActionLogExportRow[])`가 순수 함수로 CSV
  본문(BOM 포함)을 만들고, `exportActionLog`는 조회 → 기록 → 이 함수 호출의 얇은
  오케스트레이션만 한다. Phase 9에서 서식이 실제로 필요해지면 `serializeActionLogExportAsCsv`
  호출 지점 하나만 `.xlsx` 직렬화 함수로 바꾸면 되고, `exportActionLog`의 시그니처·반환
  형태·호출자(액션)는 바뀌지 않는다.

## 근거

ADMN-10·OPS-05가 "Excel로 내보낸다"를 요구하지만 형식을 명시하지 않았고, 사용자
10~30명 사내 시스템에서 서식 없는 표 내보내기로 충분하다. 셀 서식·열 폭·여러 시트가
필요해지면(Phase 9 손익 내보내기) 그때 반환 형태를 유지한 채 직렬화 함수만 교체해
`.xlsx`로 승격한다(옵션 C의 취지 — A로 시작해 반환 형태를 지금 고정해 둔다).

## Task 2가 이 값을 쓰는 지점

- `domain/action-log/export.ts`의 `serializeActionLogExportAsCsv`가 BOM·CSV 이스케이프
  규칙(따옴표로 감싸고 내부 따옴표는 둘로)을 구현한다
- `test/unit/action-log/export.test.ts`가 BOM 유무·왕복 파싱·0건 헤더를 단위 테스트로
  증명한다
- `app/(app)/admin/action-log/actions.ts`의 내보내기 액션이 `{ filename, contentType,
  body }`를 그대로 `Response`로 내려보낸다

이 답은 신규 의존성을 추가하지 않는 선택이라 되돌리기 비용이 낮다(reversibility:
reversible — 나중에 B로 바꾸려면 직렬화 함수 교체 + 의존성 추가 승인만 필요하다).
Task 2부터는 이 문서의 값을 사실로 취급한다.
