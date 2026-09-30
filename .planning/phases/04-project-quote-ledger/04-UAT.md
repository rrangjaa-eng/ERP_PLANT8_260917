---
status: complete
phase: 04-project-quote-ledger
source: [04-01..04-51 SUMMARY.md 42개]
started: 2026-09-29T09:39:02Z
updated: 2026-09-30T02:35:00Z
method: 증거 대조(사용자 승인 2026-09-29) — 사람 확인 항목은 SUMMARY·DOM 감사·CI·테스트 이름으로 대조해 pass 기록, 증거 없는 항목만 사람에게 질문. 04-31 (C)(D)는 「사람 확인 생략(사용자 승인)」 — 자동 테스트로 갈음, 실제 엑셀·MS 입력기 확인은 하지 않음
---

## Current Test

[testing complete]

## Tests

### 1. [04-01 D6] 폼·선택·표 컴포넌트 §7-15 계약
expected: 등록 폼과 표가 시스템 규칙대로 보이고, 편집 칸이 있을 때만 격자로 동작한다
result: pass
source: evidence
evidence: project-register.spec.ts · page-chrome.spec.ts, 04-31-design-review.md:14-25, 04-31-dom-audit.md:36-50

### 2. [04-02 D6] 매출 섹션 시각 정합
expected: 매출 두 표가 375에서 가로 스크롤 없이 시스템 문체대로 보인다
result: pass
source: evidence
evidence: 04-31-dom-audit.md:29, 04-31-design-review.md:14-25, revenue-section.spec.ts:512

### 3. [04-05 D5] 목록 필터·로딩 뼈대·번호 열
expected: 필터가 한 줄이고 뼈대에 반짝임·진행 막대가 없으며 번호가 줄바꿈되지 않는다
result: pass
source: evidence
evidence: projects-list.spec.ts:728 · :236, projects-loading.test.ts:22, projects-list-number-nowrap.spec.ts:24

### 4. [04-05 D5b] 목록 오류 화면 문구
expected: 목록을 못 불러오면 「프로젝트 목록 불러오기 실패 · 다시 시도」가 보인다
result: pass
source: evidence
evidence: test/e2e/mobile-projects-error.spec.ts 1/1(04-52 13bf0c1b — fx.recent_rate.USD=0 → 「프로젝트 목록 불러오기 실패」·「다시 시도」 → 값 복구 → 목록 복귀) · 재실행 2026-09-29 이 세션 CI=true mobile-375 1 passed, 끝난 뒤 USD 1300 복원 확인 · 04-52 독립 검증 변이 M2(retry 무력화) 실패로 잡힘
resolved_gap: G-04-4(04-52)

### 5. [04-08 D4] 진행 막대 미구현 결정 기록
expected: 앱 어디에도 상단 진행 막대가 없다
result: pass
source: evidence
evidence: DECISIONS.md:787-791(D17), projects-loading.test.ts:22

### 6. [04-09 D4] 큰 원화·외화 숫자 줄바꿈 없음
expected: 13자리 원화가 1280·1024·375에서 한 줄이고 번호에 쉼표가 없다
result: pass
source: evidence
evidence: 04-09-SUMMARY:275, projects-list-number-nowrap.spec.ts:24

### 7. [04-11 D4] 잘못된 id 상세 → 404 화면
expected: 없는 프로젝트 주소가 오류 화면이 아닌 404 화면으로 열린다
result: pass
source: evidence
evidence: project-period.spec.ts:93, .continue-here.md:393(soft 404 유지 사용자 결정)

### 8. [04-11 D5] 종료일 지남·팀장 이름 머리 줄
expected: 머리 줄이 세 폭에서 넘치지 않고 「종료일 지남 · 팀장 이름」을 보인다
result: pass
source: evidence
evidence: 04-11-SUMMARY:304, project-period.spec.ts:127

### 9. [04-13 D6] 조정 줄 읽기 전용·합계 포함
expected: PM 화면에서 조정 줄이 같은 표 안 읽기 전용 행으로 보이고 합계에 포함된다
result: pass
source: evidence
evidence: quote-line-kinds.spec.ts:165 · :232

### 10. [04-15 D6] 복사 등록 폼 긴 글
expected: 출처 줄·긴 이름·예상가 칸이 세 폭에서 가로 스크롤 없이 들어간다
result: pass
source: evidence
evidence: 04-15-SUMMARY:276-279

### 11. [04-19 D5] 쪽 번호·힌트 줄 DOM 감사
expected: 폰 쪽 번호가 44×44이고 쪽을 넘기면 포커스가 제목으로 간다
result: pass
source: evidence
evidence: 04-19-SUMMARY:217

### 12. [04-21 T1] 수주중→진행 전환
expected: 팀장이 목록에서 고르고 확인하면 토스트가 뜨고 태그가 진행으로 바뀐다
result: pass
source: evidence
evidence: project-lifecycle.spec.ts:103

### 13. [04-21 T2] 미수주·되돌리기·정산→완료 분기
expected: 권한·상태에 맞는 전환 버튼만 보이고 동시 변경은 거부된다
result: pass
source: evidence
evidence: project-lifecycle.spec.ts:167-425, project-status.test.ts:607 · 634

### 14. [04-21 T3] 미저장 편집 막힘·폰 머리 줄
expected: 저장 안 한 편집이 있으면 상태 바꾸기가 막히고 375 머리 줄 순서가 맞다
result: pass
source: evidence
evidence: project-lifecycle.spec.ts:459 · :505

### 15. [04-23 D6] 조정·견적 외 비용 표 backstop
expected: 세 폭 가로 스크롤 0, 폰 3열, 좁은 폭에서 추가 버튼이 없다
result: pass
source: evidence
evidence: 04-23-SUMMARY:167

### 16. [04-25 D2] 선택 칸: 오류가 힌트를 이김
expected: 선택 칸에 오류가 있으면 설명 대신 오류가 보인다
result: pass
source: evidence
evidence: test/unit/ui/select-error-hint.test.ts 4/4(04-52 13bf0c1b — 비제어·제어 × 오류 있음·없음) · 재실행 2026-09-29 이 세션 통과 · 04-52 독립 검증 변이 M1(힌트 우선) 2건 실패로 잡힘
resolved_gap: G-04-16(04-52)

### 17. [04-25 D3] 소분류 설명 표시
expected: 소분류 편집 중 코드표 설명이 셀 아래 한 줄로 보인다
result: pass
source: evidence
evidence: quote-line-kinds.spec.ts:508

### 18. [04-25 D5] 코드표 설명 S14 backstop
expected: 40자 설명이 PC 한 줄·폰 줄바꿈이고 열 폭이 흔들리지 않는다
result: pass
source: evidence
evidence: 04-25-SUMMARY:217-223

### 19. [04-26 D6] 줄 수 상한 화면
expected: 비활성 이유·거부 문구가 잘리지 않고 375에 「줄 추가」가 없다
result: pass
source: evidence
evidence: 04-26-SUMMARY:195

### 20. [04-27 D3] 계급 「업무 범위」 칸
expected: 전사로 바꾼 값이 새로고침 뒤에도 남고 375 머리글이 한 줄이다
result: pass
source: evidence
evidence: roles.spec.ts:60, mobile-roles.spec.ts:21 · :50

### 21. [04-28 D5] 힌트 줄·충돌 셀 DOM
expected: 힌트 kbd·충돌 버튼 tabindex·이유 줄 줄바꿈·가로 스크롤 0이 맞다
result: pass
source: evidence
evidence: 04-28-SUMMARY:264

### 22. [04-31 D2] 페이즈 최종 DOM 감사·/design-review
expected: 화면 7종이 시스템과 일치하고 폰 시트 트리거 44px·접근 이름이 항목명이다
result: pass
source: evidence
evidence: 04-31-dom-audit.md:19, quote-table.spec.ts:196, 04-31-design-review.md:58 · 88

### 23. [04-31 D3] 실제 엑셀 캡처 재생
expected: 실제 엑셀 6열·45줄 붙여넣기가 저장·새로고침 뒤에도 그대로다
result: pass
source: evidence
evidence: parse-tsv.test.ts:110-117, excel-paste-final.spec.ts:409 · :447

### 24. [04-31 D4] PC 사람 확인 (C)(D)
expected: 프로젝트 간 복사·표→엑셀 복사·IME 조합 중 Ctrl+Enter·Esc가 오작동하지 않는다
result: pass
source: evidence
evidence: 사람 확인 생략(사용자 승인 2026-09-29, 자동 테스트로 갈음): project-copy.spec.ts:94, quote-table.spec.ts:1231, excel-paste-final.spec.ts, project-register.spec.ts:270-311, shortcut.test.ts:27 · 31, grid-keyboard-composing.test.ts:42 — 실제 엑셀·MS 입력기 확인은 하지 않음

### 25. [04-32 D3] ARCHITECTURE §4-8 규약 정합
expected: 문서의 함수·경로 이름이 실제 코드와 일치한다
result: pass
source: evidence
evidence: ARCHITECTURE.md:168-195 ↔ 코드 grep 일치

### 26. [04-42 D7] 리저브 대장 backstop
expected: 폭별 열 수·375 가로 스크롤 0·그룹 머리글 잔액이 맞다
result: pass
source: evidence
evidence: 04-42-SUMMARY:218-221, 04-31-dom-audit.md:31 · 62

### 27. [04-44 T1] 부제 총 매출 예상가
expected: 부제에 예상가가 보이고 권리 있는 사람만 바꾸기 버튼을 본다
result: pass
source: evidence
evidence: project-period.spec.ts:423 · :472

### 28. [04-44 T2] 예상가 칸 묶음 일괄 저장
expected: 금액·통화·환율을 고치면 일괄 저장 건수에 더해지고 저장 뒤 닫힌다
result: pass
source: evidence
evidence: project-period.spec.ts:423 · :543

### 29. [04-44 T3] 예상가 칸 오류 문구
expected: 잘못된 금액이면 칸 아래 오류가 나고 저장 전체가 거부된다
result: pass
source: evidence
evidence: project-period.spec.ts:483, project-period.test.ts:725 · 743

### 30. [04-44 T4] 환율 기억
expected: USD 환율을 고쳐 저장하면 다음 기본 환율이 그 값이 된다
result: pass
source: evidence
evidence: project-period.test.ts:764 · 787

### 31. [04-44 T5] 모달→기간 칸 포커스
expected: 「기간 적기」·「기간 바꾸기」가 해당 날짜 칸으로 포커스를 옮긴다
result: pass
source: evidence
evidence: project-period.spec.ts:572 · :591 · :609

### 32. [04-44 T6] 폰 부제 첫 항목 기간
expected: 375에서 부제 첫 항목이 기간 줄이다
result: pass
source: evidence
evidence: project-period.spec.ts:644, 04-44-SUMMARY:199-203

### 33. [04-46 D5] 확인 모달·시트 DOM 감사
expected: 모달 폭·시트·닫기 x·터치 최소·포커스가 세 폭에서 맞다
result: pass
source: evidence
evidence: .continue-here.md:464, 04-31-dom-audit.md:64-72

### 34. [04-46 D6] 전체 게이트 CI=true
expected: 단위·통합·E2E 전체가 통과한다
result: pass
source: evidence
evidence: main ca7ead03 CI 초록(run 36547181683)

### 35. [04-47 D5] 붙여넣기 합계 행 DOM 감사
expected: 합계 행 조각 순서·「오류 N칸」이 맞고 375 가로 스크롤 0이다
result: pass
source: evidence
evidence: 04-47-SUMMARY:214

### 36. [04-48 D4] 목록 폰 첫 화면·뼈대
expected: 375 첫 화면에 주 정보가 다 들어오고 뼈대 합계 줄은 라벨만 있다
result: pass
source: evidence
evidence: 04-48-SUMMARY:146 · 181, projects-list.spec.ts:1101

### 37. [04-49 D6] EMPTY·단가 열 폭 backstop
expected: EMPTY 변형·좁은 폭 구조 컨트롤이 맞고 가로 스크롤이 없다
result: pass
source: evidence
evidence: 04-49-SUMMARY:192-194(FAIL 1은 ef6445f로 고침)

### 38. [04-51 D4] 순번 시작값 낮추기 거부
expected: 설정 칸에 「현재 값(N)보다 낮출 수 없음」이 나오고 값이 유지된다
result: pass
source: evidence
evidence: settings.spec.ts:126, bundle4-qa.md:52

### 39. [04-12 L1] 정산 기존 줄 실행가만 편집
expected: 정산 PM은 기존 줄에서 실행가만 고쳐 저장한다
result: pass
source: evidence
evidence: quote-edit-scope.spec.ts:171

### 40. [04-12 L2] 줄 삭제 → 보관함
expected: 삭제를 확인하고 저장하면 줄이 보관함에 간다
result: pass
source: evidence
evidence: quote-line-kinds.spec.ts:314, quote-table.spec.ts:293

### 41. [04-12 L3] 보관 줄 복원 규칙
expected: 진행 중이면 복원되고 완료·정산에서는 이유와 함께 거부된다
result: pass
source: evidence
evidence: quote-lines.test.ts:797-837

### 42. [04-16 L4] 파생 계약 금액
expected: 승인 전 「—」, 승인 뒤 견적 합계, 새 차수 뒤 「2차 고객 승인 전」이 보인다
result: pass
source: evidence
evidence: revenue-section.spec.ts:159

### 43. [04-16 L5] 기획 PM 발행 읽기 표
expected: PM은 발행 표를 읽기로만 보고 입금 표·미수는 보지 못한다
result: pass
source: evidence
evidence: revenue-section.spec.ts:223 · :451

### 44. [04-16 L6] 매출 표 폰 접힌 줄
expected: 375에서 날짜·금액만 보이고 나머지는 접힌 줄로 간다
result: pass
source: evidence
evidence: revenue-section.spec.ts:512, 04-16-SUMMARY:245

### 45. [04-16 L7] 표별 거부 글자
expected: 다른 표에서 거부되면 각 표 합계 행에 「다른 칸 오류 N칸」이 보인다
result: pass
source: evidence
evidence: revenue-section.spec.ts:547 · :614

### 46. [04-17 L8] 올해 보기·표 위 합계
expected: 조건 없이 열면 올해 목록이고 표 위 합계는 올해 귀속만 더한다
result: pass
source: evidence
evidence: projects-list.spec.ts:127

### 47. [04-17 L9] 50건 번호 페이지
expected: 50건씩 나뉘고 필터를 바꾸면 1쪽, 범위 밖 번호는 마지막 쪽이다
result: pass
source: evidence
evidence: projects-list.spec.ts:177

### 48. [04-17 L10] 폰 접힌 줄 귀속 표시
expected: 375 접힌 줄 끝에 귀속·종료일 지남이 한 번만 보인다
result: pass
source: evidence
evidence: projects-list.spec.ts:427, 04-18-SUMMARY:131

### 49. [04-18 L11] 행 금액·수익금 기준
expected: 정산 행은 발행 기준, 진행 행은 견적 기준으로 수익금을 보인다
result: pass
source: evidence
evidence: projects-list.spec.ts:288

### 50. [04-18 L12] 폭별 열 접기
expected: 1280에서 13열, 좁은 폭·10억 이상 금액에서 9·6·3열이다
result: pass
source: evidence
evidence: projects-list.spec.ts:349 · :370

### 51. [04-18 L13] 머리글 정렬
expected: 머리글을 누르면 오름차순, 다시 누르면 내림차순이고 1쪽으로 간다
result: pass
source: evidence
evidence: projects-list.spec.ts:218 · :457

### 52. [04-18 L14] 종료일 지남 표시
expected: 수주중·종료일 지난 행의 상태 칸에 「종료일 지남」이 보인다
result: pass
source: evidence
evidence: projects-list.spec.ts:383

### 53. [04-18 L15] 폰 정렬 머리글 터치 목표
expected: 375에서 정렬 머리글 링크가 44×44 이상이다
result: pass
source: evidence
evidence: quick 260929-npq 43dd5de4(ui/table/Table.module.css 폰 미디어 쿼리 정렬 링크 셀 높이 채움) · test/e2e/mobile-touch-targets.spec.ts:124 「프로젝트명」 375 189.58×44 / 320 157×44 · 「견적」 375 65.69×44 / 320 52.73×44(260929-npq-SUMMARY.md:49-50) · 독립 DOM 감사 PASS 24 · FAIL 0(260929-npq-SUMMARY.md:91) · 재실행 2026-09-30 이 세션 a1f08be8 CI=true mobile-375 3 passed
resolved_note: "이전 기록 skipped(Deferred follow-up: DR-P4-02 실측 20×19px → Phase 04.6 이월, 04-31-design-review.md:50-54) — 사용자 결정 「[지시] 전환 (C)」(PR #104, 2026-09-30)으로 증거 대조 pass 재기록"

### 54. [04-24 L16] 복사해 새 차수
expected: 두 번 빠르게 눌러도 2차가 하나만 생기고 토스트·부제가 바뀐다
result: pass
source: evidence
evidence: quote-revisions.spec.ts:115

### 55. [04-24 L17] 고객 승인 표시·취소
expected: 승인일 기본값이 오늘이고 취소하면 승인일이 사라지고 다시 편집된다
result: pass
source: evidence
evidence: quote-revisions.spec.ts:330 · :562

### 56. [04-24 L18] 차수 섹션·이전 차수 열기
expected: 「차수 열기」로 이전 차수가 읽기 표로 열린다
result: pass
source: evidence
evidence: quote-revisions.spec.ts:616 · :670

### 57. [04-24 L19] 다른 차수 보관본 복사/버림
expected: 밀려난 편집이 「N차 … 복사 / 버림」 줄로 돌아온다
result: pass
source: evidence
evidence: quote-revisions.spec.ts:886 · :1041

### 58. [04-30 L20] 정산 새 줄 수량·단가 잠김
expected: 정산 새 줄은 수량 1·단가 0으로 잠기고 견적가 0으로 저장된다
result: pass
source: evidence
evidence: quote-edit-scope.spec.ts:337

### 59. [04-30 L21] 잠긴 칸 이유 한 줄
expected: 잠긴 칸에서 Enter를 누르면 이유 한 줄이 보인다
result: pass
source: evidence
evidence: quote-edit-scope.spec.ts:375

### 60. [04-30 L22] 표 위 한 줄·힌트 줄
expected: 정산이면 표 위에 「정산 · 실행가와 새 줄만」이 보인다
result: pass
source: evidence
evidence: quote-edit-scope.spec.ts:363

### 61. [04-30 L23] 정산 구조 컨트롤 없음
expected: 정산 PM에게 줄 삭제·이동·복제가 없고 단축키도 동작하지 않는다
result: pass
source: evidence
evidence: quote-edit-scope.spec.ts:310

### 62. [04-41 L24] 매출 칸 Ctrl+S·범위 밖 금액
expected: 매출 칸 Ctrl+S로 저장되고 30억 입력은 셀 오류·「오류 1칸 · 전부 거부」가 된다
result: pass
source: evidence
evidence: revenue-section.spec.ts:666, 04-41-SUMMARY:153

### 63. [04-41 L25] 견적 합계 행 매출 칸 제외
expected: 매출 칸만 거부되면 견적 표 합계 행에 「다른 칸 오류 N칸」이 보인다
result: pass
source: evidence
evidence: revenue-section.spec.ts:666

### 64. [04-41 L26] 1024 미만 전환 시 매출 입력 유지
expected: 매출 입력을 연 채 창을 1024 아래로 줄여도 값이 남는다
result: pass
source: evidence
evidence: test/e2e/revenue-section.spec.ts 「매출 입력을 연 채 1024 미만 전환 — 값 유지 (G-04-64 · UAT 64)」 (A)(B)(C) 3/3(04-52 05449580·68d13213, 갈래 G — 결함 없음·제품 코드 변경 0) · 재실행 2026-09-29 이 세션 CI=true desktop 3 passed · 04-52 독립 검증 변이 M3(onCommit 제거) 3건 실패로 잡힘. 모서리 넷(04-52-SUMMARY 「사용자 판단 대기」)은 이 항목 판정 기준 밖
resolved_gap: G-04-64(04-52)

### 65. [04-01 D1] 프로젝트 등록 폼 제출 시 서버가 매긴 문서번호가 자동 배정되고 폼에는 번호 입력 칸이 없다(D-42)
expected: 프로젝트 등록 폼 제출 시 서버가 매긴 문서번호가 자동 배정되고 폼에는 번호 입력 칸이 없다(D-42)
result: pass
source: automated
coverage_id: D1

### 66. [04-01 D2] 견적 줄 일괄 저장 시 견적가(수량×단가)·차익(견적가−실행가)이 서버 계산값으로 저장되고, 브라우저가 보낸 견적가·차익 필드는 무시된다
expected: 견적 줄 일괄 저장 시 견적가(수량×단가)·차익(견적가−실행가)이 서버 계산값으로 저장되고, 브라우저가 보낸 견적가·차익 필드는 무시된다
result: pass
source: automated
coverage_id: D2

### 67. [04-01 D3] 두 트랜잭션이 동시에 번호를 요청하면 서로 다른 값을 받고, 실패한 트랜잭션의 증가분은 결번으로 남되 다음 등록이 다음 번호를 받는다(행 잠금, Issue 10)
expected: 두 트랜잭션이 동시에 번호를 요청하면 서로 다른 값을 받고, 실패한 트랜잭션의 증가분은 결번으로 남되 다음 등록이 다음 번호를 받는다(행 잠금, Issue 10)
result: pass
source: automated
coverage_id: D3

### 68. [04-01 D4] 완료(정산) 상태 프로젝트의 견적 줄 저장은 domain/rules/gate 한 지점에서 거부되고, 미등록 게이트 규칙 이름은 조용히 통과하지 않고 오류가 난다
expected: 완료(정산) 상태 프로젝트의 견적 줄 저장은 domain/rules/gate 한 지점에서 거부되고, 미등록 게이트 규칙 이름은 조용히 통과하지 않고 오류가 난다
result: pass
source: automated
coverage_id: D4

### 69. [04-01 D5] 서버 검증 실패 시 입력값이 지워지지 않고 폼에 남는다(UX-04); 375px 폭에서 목록·상세·표 전부 가로 스크롤이 0
expected: 서버 검증 실패 시 입력값이 지워지지 않고 폼에 남는다(UX-04); 375px 폭에서 목록·상세·표 전부 가로 스크롤이 0
result: pass
source: automated
coverage_id: D5

### 70. [04-02 D1] domain/money 완성 — splitWithRemainder(분할 보정)·grossFromTotal(합계 역산)·applyTaxRule(세금 규칙 4종: 없음/부가세가산/원천징수/회사대납)·recentFxRate·rememberFxRate(통화별 최근 환율)
expected: domain/money 완성 — splitWithRemainder(분할 보정)·grossFromTotal(합계 역산)·applyTaxRule(세금 규칙 4종: 없음/부가세가산/원천징수/회사대납)·recentFxRate·rememberFxRate(통화별 최근 환율)
result: pass
source: automated
coverage_id: D1

### 71. [04-02 D2] 매출 섹션 — 계약 금액 단일 칸(PM) + 발행·입금 두 편집 표(경영관리), 통장 합계에서 공급가액 역산·미수/초과입금 표시·재계산 차이 비조정
expected: 매출 섹션 — 계약 금액 단일 칸(PM) + 발행·입금 두 편집 표(경영관리), 통장 합계에서 공급가액 역산·미수/초과입금 표시·재계산 차이 비조정
result: pass
source: automated
coverage_id: D2

### 72. [04-02 D3] 발행액·입금액이 기획본부에게 표 단위로 빠진다(열 단위 마스킹이 아니고 빈 배열도 아니다 — 필드 부재, T-04-09)
expected: 발행액·입금액이 기획본부에게 표 단위로 빠진다(열 단위 마스킹이 아니고 빈 배열도 아니다 — 필드 부재, T-04-09)
result: pass
source: automated
coverage_id: D3

### 73. [04-02 D4] 견적 줄 단가 칸의 외화 두 칸 편집(통화 Select + 환율) — KRW면 환율 칸이 숨고, USD 기본 환율은 자리표시자가 아니라 recentFxRate 실제 값, 환율을 고친 저장만 fx.recent_rate.USD를 갱신
expected: 견적 줄 단가 칸의 외화 두 칸 편집(통화 Select + 환율) — KRW면 환율 칸이 숨고, USD 기본 환율은 자리표시자가 아니라 recentFxRate 실제 값, 환율을 고친 저장만 fx.recent_rate.USD를 갱신
result: pass
source: automated
coverage_id: D4

### 74. [04-02 D5] 마이그레이션 0010이 실제 Postgres(erp/erp_test)에 적용되고 squawk 0 issues
expected: 마이그레이션 0010이 실제 Postgres(erp/erp_test)에 적용되고 squawk 0 issues
result: pass
source: automated
coverage_id: D5

### 75. [04-04 D1] 표 전체가 탭 정지 하나, 방향키로 셀 이동, Esc(값 되돌리기/범위 해제), Delete(줄 삭제 모달), 줄 이동·새 줄·줄 복제 단축키 — 키보드만으로 입력·저장까지 도달한다
expected: 표 전체가 탭 정지 하나, 방향키로 셀 이동, Esc(값 되돌리기/범위 해제), Delete(줄 삭제 모달), 줄 이동·새 줄·줄 복제 단축키 — 키보드만으로 입력·저장까지 도달한다
result: pass
source: automated
coverage_id: D1

### 76. [04-04 D2] 클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채워지고, 인용된 칸의 줄바꿈이 한 칸으로 들어간다
expected: 클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채워지고, 인용된 칸의 줄바꿈이 한 칸으로 들어간다
result: pass
source: automated
coverage_id: D2

### 77. [04-04 D3] 숫자 아닌 값·읽기전용 셀에 떨어진 값이 오류 셀로 고정되고, 오류가 하나라도 있으면 저장이 전부 거부되며 다른 셀 편집값은 남는다(부분 저장 없음)
expected: 숫자 아닌 값·읽기전용 셀에 떨어진 값이 오류 셀로 고정되고, 오류가 하나라도 있으면 저장이 전부 거부되며 다른 셀 편집값은 남는다(부분 저장 없음)
result: pass
source: automated
coverage_id: D3

### 78. [04-04 D4] 배치 저장이 트랜잭션 안에서 버전 비교→실제로 값이 달라진 셀만 충돌로 판정→충돌·오류가 하나라도 있으면 쓰기 0건, 거부 뒤 DB 재조회로 무변경 확인, 거부 시 행동 로그 0행
expected: 배치 저장이 트랜잭션 안에서 버전 비교→실제로 값이 달라진 셀만 충돌로 판정→충돌·오류가 하나라도 있으면 쓰기 0건, 거부 뒤 DB 재조회로 무변경 확인, 거부 시 행동 로그 0행
result: pass
source: automated
coverage_id: D4

### 79. [04-04 D5] 폰에서 줄을 탭하면 보기 전용 시트가 열리고 행동 줄이 없다 — 시트를 열 때 새 요청이 나가지 않는다
expected: 폰에서 줄을 탭하면 보기 전용 시트가 열리고 행동 줄이 없다 — 시트를 열 때 새 요청이 나가지 않는다
result: pass
source: automated
coverage_id: D5

### 80. [04-04 D6] 실제 Windows Excel에서 복사한 clipboard 원문(따옴표만 있는 칸·줄바꿈 있는 칸·쉼표/통화기호 섞인 금액 포함)이 parseTsv를 거쳐 화면에 원본과 같게 들어가고, 저장 후 새로고침해도 같다
expected: 실제 Windows Excel에서 복사한 clipboard 원문(따옴표만 있는 칸·줄바꿈 있는 칸·쉼표/통화기호 섞인 금액 포함)이 parseTsv를 거쳐 화면에 원본과 같게 들어가고, 저장 후 새로고침해도 같다
result: pass
source: automated
coverage_id: D6

### 81. [04-05 D1] 목록이 종료일 기준 월로 그룹되고(기간 미정은 맨 아래), 상태·팀·연도·검색 필터가 걸리며, 「더 보기」가 count 파라미터로 50건씩 늘어나고, 합계 행이 불러온 페이지가 아니라 필터 전체의 합을 집계 쿼리 한 번으로 보여준다
expected: 목록이 종료일 기준 월로 그룹되고(기간 미정은 맨 아래), 상태·팀·연도·검색 필터가 걸리며, 「더 보기」가 count 파라미터로 50건씩 늘어나고, 합계 행이 불러온 페이지가 아니라 필터 전체의 합을 집계 쿼리 한 번으로 보여준다
result: pass
source: automated
coverage_id: D1

### 82. [04-05 D2] 견적·실행가·차익 열이 계급에 따라 서버가 DTO에서 아예 빼는 필드 부재이고(빈 값이 아니다), 집계도 같은 정보 항목(quote.amount)으로 표 단위 게이트된다
expected: 견적·실행가·차익 열이 계급에 따라 서버가 DTO에서 아예 빼는 필드 부재이고(빈 값이 아니다), 집계도 같은 정보 항목(quote.amount)으로 표 단위 게이트된다
result: pass
source: automated
coverage_id: D2

### 83. [04-05 D3] 프로젝트 문서 번호 서식(접두어·연도 자릿수·순번 자릿수·구분자·순번 시작값)이 상수가 아니라 설정 키이고, 서식을 바꾼 뒤에도 이미 매긴 번호는 그대로이며 연도가 바뀌면 순번이 1부터 다시 시작한다
expected: 프로젝트 문서 번호 서식(접두어·연도 자릿수·순번 자릿수·구분자·순번 시작값)이 상수가 아니라 설정 키이고, 서식을 바꾼 뒤에도 이미 매긴 번호는 그대로이며 연도가 바뀌면 순번이 1부터 다시 시작한다
result: pass
source: automated
coverage_id: D3

### 84. [04-05 D4] 목록·검색이 쓰는 인덱스 목록이 docs/ARCHITECTURE.md에 있고(마이그레이션 0009와 일치), 300줄 상한을 지킨다
expected: 목록·검색이 쓰는 인덱스 목록이 docs/ARCHITECTURE.md에 있고(마이그레이션 0009와 일치), 300줄 상한을 지킨다
result: pass
source: automated
coverage_id: D4

### 85. [04-06 D1] 0012 마이그레이션이 옛 잠금 행을 completed로 옮기고(재시드 없이) 다른 행·줄을 보존하며 코드표를 다섯 값(설명 포함)으로 만든다
expected: 0012 마이그레이션이 옛 잠금 행을 completed로 옮기고(재시드 없이) 다른 행·줄을 보존하며 코드표를 다섯 값(설명 포함)으로 만든다
result: pass
source: automated
coverage_id: D1

### 86. [04-06 D2] 네 값 밖의 상태가 있는 DB에서 0012가 RAISE로 멈추고 아무것도 바뀌지 않는다
expected: 네 값 밖의 상태가 있는 DB에서 0012가 RAISE로 멈추고 아무것도 바뀌지 않는다
result: pass
source: automated
coverage_id: D2

### 87. [04-06 D3] 시드 상태 상수와 코드표가 다섯 값(라벨·정렬·설명)으로 같다
expected: 시드 상태 상수와 코드표가 다섯 값(라벨·정렬·설명)으로 같다
result: pass
source: automated
coverage_id: D3

### 88. [04-06 D4] 완료 프로젝트 견적 줄 저장은 project.line-edit가 「완료 · 견적 줄 잠김」으로 거부, 미수주 저장은 통과, 옛 규칙은 등록 목록에 없다
expected: 완료 프로젝트 견적 줄 저장은 project.line-edit가 「완료 · 견적 줄 잠김」으로 거부, 미수주 저장은 통과, 옛 규칙은 등록 목록에 없다
result: pass
source: automated
coverage_id: D4

### 89. [04-06 D5] 상태 다섯 값 · 사람의 전환 넷 · 메뉴 키 데이터 모듈(import 없음, 순환 없음)
expected: 상태 다섯 값 · 사람의 전환 넷 · 메뉴 키 데이터 모듈(import 없음, 순환 없음)
result: pass
source: automated
coverage_id: D5

### 90. [04-07 D1] 리저브 표·마이그레이션(0018) — 잔액 컬럼 없음, 구분 CHECK, (client_id, entry_date) 인덱스, 락 타임아웃 한 쌍
expected: 리저브 표·마이그레이션(0018) — 잔액 컬럼 없음, 구분 CHECK, (client_id, entry_date) 인덱스, 락 타임아웃 한 쌍
result: pass
source: automated
coverage_id: D1

### 91. [04-07 D2] 날짜 마감 잔액 판정(중간 날짜 음수 · 같은 날 입금 먼저 · 원화 누적 · 클라이언트 분리)
expected: 날짜 마감 잔액 판정(중간 날짜 음수 · 같은 날 입금 먼저 · 원화 누적 · 클라이언트 분리)
result: pass
source: automated
coverage_id: D2

### 92. [04-07 D3] 입력 계약·재전송·클라이언트 잠김·커밋 뒤 환율·수정 로그·write.denied
expected: 입력 계약·재전송·클라이언트 잠김·커밋 뒤 환율·수정 로그·write.denied
result: pass
source: automated
coverage_id: D3

### 93. [04-07 D4] 권한(pnl 쓰기 + reserve.amount, 숫자 없는 거부) · 노출 키 집합 · 배치 보관/범용 보관 차단/복원 위임 · 50건 페이지 · 거부 줄 쪽 번호 · 두 연결 경합
expected: 권한(pnl 쓰기 + reserve.amount, 숫자 없는 거부) · 노출 키 집합 · 배치 보관/범용 보관 차단/복원 위임 · 50건 페이지 · 거부 줄 쪽 번호 · 두 연결 경합
result: pass
source: automated
coverage_id: D4

### 94. [04-08 D1] 등록 폼 Ctrl+Enter가 표준 제출을 부르고, 연타·성공 뒤 이동 지연 중 재입력이 중복 등록을 만들지 않는다
expected: 등록 폼 Ctrl+Enter가 표준 제출을 부르고, 연타·성공 뒤 이동 지연 중 재입력이 중복 등록을 만들지 않는다
result: pass
source: automated
coverage_id: D1

### 95. [04-08 D2] 등록 폼 Esc가 빈 폼에서는 목록으로 이동하고, 입력이 있으면 폼과 값을 그대로 둔다(입력 손실 없음)
expected: 등록 폼 Esc가 빈 폼에서는 목록으로 이동하고, 입력이 있으면 폼과 값을 그대로 둔다(입력 손실 없음)
result: pass
source: automated
coverage_id: D2

### 96. [04-08 D3] SYSTEM.md 개정 ①③④⑤⑥⑧⑨⑩⑪⑫⑬⑭⑯ + §7-16 신설 + §6-2 스케치 갱신 + DECISIONS 기록 15건 — 다음 화면들이 물려받을 시스템 규칙 확정
expected: SYSTEM.md 개정 ①③④⑤⑥⑧⑨⑩⑪⑫⑬⑭⑯ + §7-16 신설 + §6-2 스케치 갱신 + DECISIONS 기록 15건 — 다음 화면들이 물려받을 시스템 규칙 확정
result: pass
source: automated
coverage_id: D3

### 97. [04-09 D1] lib/format-number.ts is the single module for all numeric display formatting (KRW/foreign/fxRate/quantity/percent/count) and comma-insertion input handling; fiv
expected: lib/format-number.ts is the single module for all numeric display formatting (KRW/foreign/fxRate/quantity/percent/count) and comma-insertion input handling; five pre-existing display call sites migrated to it
result: pass
source: automated
coverage_id: D1

### 98. [04-09 D2] Numeric input widgets (quote table quantity/unitPrice/execution, revenue section contract/issued/paid amounts, settings USD fx rate, evidence-type min withholdi
expected: Numeric input widgets (quote table quantity/unitPrice/execution, revenue section contract/issued/paid amounts, settings USD fx rate, evidence-type min withholding) get live comma insertion with cursor preservation, decimal-place limits, and whole-string paste/autofill rejection
result: pass
source: automated
coverage_id: D2

### 99. [04-09 D3] Settings screen USD 최근 환율 field enforces the 4-decimal-place typing cap
expected: Settings screen USD 최근 환율 field enforces the 4-decimal-place typing cap
result: pass
source: automated
coverage_id: D3

### 100. [04-10 D1] 관리자가 코드표 화면에서 값마다 설명을 인라인으로 고치고 저장한다(빈 값 포함, DB null)
expected: 관리자가 코드표 화면에서 값마다 설명을 인라인으로 고치고 저장한다(빈 값 포함, DB null)
result: pass
source: automated
coverage_id: D1

### 101. [04-10 D2] 41자 초과 설명은 서버가 거부하고(정확한 Copywriting 문구), 실패해도 입력이 남으며, 40자 초과 동안 글자 수가 보이고, Esc만 서버 값으로 되돌린다(DR-29)
expected: 41자 초과 설명은 서버가 거부하고(정확한 Copywriting 문구), 실패해도 입력이 남으며, 40자 초과 동안 글자 수가 보이고, Esc만 서버 값으로 되돌린다(DR-29)
result: pass
source: automated
coverage_id: D2

### 102. [04-10 D3] 권한 없는 계급·보관된 항목의 설명 저장은 거부되고, 성공 저장은 행동 로그에 남는다
expected: 권한 없는 계급·보관된 항목의 설명 저장은 거부되고, 성공 저장은 행동 로그에 남는다
result: pass
source: automated
coverage_id: D3

### 103. [04-10 D4] 기본 제공 값 14개(상태 3·소분류 4·증빙 종류 7)가 설명과 함께 시작한다 — 새 DB는 시드, 기존 DB는 마이그레이션. 관리자가 고친 설명은 재시드로 덮이지 않는다
expected: 기본 제공 값 14개(상태 3·소분류 4·증빙 종류 7)가 설명과 함께 시작한다 — 새 DB는 시드, 기존 DB는 마이그레이션. 관리자가 고친 설명은 재시드로 덮이지 않는다
result: pass
source: automated
coverage_id: D4

### 104. [04-10 D5] 코드표 표가 값·이름·설명·정렬·상태·동작 여섯 열이고, 증빙 종류 세금 규칙 병합 행의 colSpan이 새 열 수와 맞는다
expected: 코드표 표가 값·이름·설명·정렬·상태·동작 여섯 열이고, 증빙 종류 세금 규칙 병합 행의 colSpan이 새 열 수와 맞는다
result: pass
source: automated
coverage_id: D5

### 105. [04-10 D6] 「코드 추가」 폼에 선택 설명 칸이 있고 40자 검증을 지난다
expected: 「코드 추가」 폼에 선택 설명 칸이 있고 40자 검증을 지난다
result: pass
source: automated
coverage_id: D6

### 106. [04-10 D7] 설명이 정확한 40자 상한(UTF-16 .length)을 지키고, 새 마이그레이션 번호·락 타임아웃·squawk 무경고를 지킨다
expected: 설명이 정확한 40자 상한(UTF-16 .length)을 지키고, 새 마이그레이션 번호·락 타임아웃·squawk 무경고를 지킨다
result: pass
source: automated
coverage_id: D7

### 107. [04-11 D1] 진행 프로젝트가 종료일 다음 날 KST 00:00부터 정산 — 경계 · 멱등(두 번·동시) · 시스템 행위자 · 발효일 · 로그 실패 롤백 · 대상 밖 상태 불변
expected: 진행 프로젝트가 종료일 다음 날 KST 00:00부터 정산 — 경계 · 멱등(두 번·동시) · 시스템 행위자 · 발효일 · 로그 실패 롤백 · 대상 밖 상태 불변
result: pass
source: automated
coverage_id: D1

### 108. [04-11 D2] 상세 읽기 선판정 — 행 범위·uuid 모양 확인 뒤에만 판정, 실패는 로그만 남기고 저장된 상태로 읽기 계속
expected: 상세 읽기 선판정 — 행 범위·uuid 모양 확인 뒤에만 판정, 실패는 로그만 남기고 저장된 상태로 읽기 계속
result: pass
source: automated
coverage_id: D2

### 109. [04-11 D3] 목록 요청당 판정 한 번(settleForProjectList) · 쓰기 경로 잠금 안 판정(loadProjectForGate) · SKIP LOCKED 경합 · fail-closed · 쓰기 거부 뒤 다음 읽기 정산 · 번호 연도 KST
expected: 목록 요청당 판정 한 번(settleForProjectList) · 쓰기 경로 잠금 안 판정(loadProjectForGate) · SKIP LOCKED 경합 · fail-closed · 쓰기 거부 뒤 다음 읽기 정산 · 번호 연도 KST
result: pass
source: automated
coverage_id: D3

### 110. [04-13 D1] 마이그레이션 0014 — line_kind 기본 quote, 세 값 인라인 CHECK, 락 타임아웃 한 쌍, lint:sql 0건, 번호 규칙, .squawk.toml 무변경, 다시 생성해도 차이 없음
expected: 마이그레이션 0014 — line_kind 기본 quote, 세 값 인라인 CHECK, 락 타임아웃 한 쌍, lint:sql 0건, 번호 규칙, .squawk.toml 무변경, 다시 생성해도 차이 없음
result: pass
source: automated
coverage_id: D1

### 111. [04-13 D2] 조정 권한만 있는 경영관리가 완료 프로젝트에 조정 줄을 저장(견적가 0 · 수량 1 · 단가 0 · 차익 계산)하고 목록 실행가에 들어간다 · PM의 조정 새 줄은 거부
expected: 조정 권한만 있는 경영관리가 완료 프로젝트에 조정 줄을 저장(견적가 0 · 수량 1 · 단가 0 · 차익 계산)하고 목록 실행가에 들어간다 · PM의 조정 새 줄은 거부
result: pass
source: automated
coverage_id: D2

### 112. [04-13 D3] 종류 축 결정표(조정 · 견적 외 비용 · 게이트) · 행 스키마 소분류 superRefine · resolveLineKind · 종류별 음수 실행가
expected: 종류 축 결정표(조정 · 견적 외 비용 · 게이트) · 행 스키마 소분류 superRefine · resolveLineKind · 종류별 음수 실행가
result: pass
source: automated
coverage_id: D3

### 113. [04-13 D4] PM 조정 칸 변경·보관 거부(write.denied 한 번, 금액 키 없음) · 경영관리 보관·보관함 · 조정 줄 복원 권한(OV-2) · 상한에 조정 줄 포함 · 조정 권한만의 견적 줄 변경·새 줄·보관 거부(GAP 2) · 종류 변경 거부 · 빈 소분류 조정 줄(GAP 6) · 정
expected: PM 조정 칸 변경·보관 거부(write.denied 한 번, 금액 키 없음) · 경영관리 보관·보관함 · 조정 줄 복원 권한(OV-2) · 상한에 조정 줄 포함 · 조정 권한만의 견적 줄 변경·새 줄·보관 거부(GAP 2) · 종류 변경 거부 · 빈 소분류 조정 줄(GAP 6) · 정산·완료 조정 줄 추가 · 견적 외 비용 음수·정산 새 줄·정산 보관 거부 · 견적 줄 음수 거부
result: pass
source: automated
coverage_id: D4

### 114. [04-13 D5] 불변식 — 세 종류 줄 실행가 합이 상세 합계 · 목록 · 집계에서 같다(금지 항목의 합계 쪽)
expected: 불변식 — 세 종류 줄 실행가 합이 상세 합계 · 목록 · 집계에서 같다(금지 항목의 합계 쪽)
result: pass
source: automated
coverage_id: D5

### 115. [04-14 D1] 새 차수: 견적 줄 전체 복사(계보·version 1·업무 컬럼 보존) + 조정 줄(보관 포함) 이동 + 보던 차수 불일치·빈 차수·정산·완료·23505 거부
expected: 새 차수: 견적 줄 전체 복사(계보·version 1·업무 컬럼 보존) + 조정 줄(보관 포함) 이동 + 보던 차수 불일치·빈 차수·정산·완료·23505 거부
result: pass
source: automated
coverage_id: D1

### 116. [04-14 D2] 고객 승인 표시/취소: 담당 PM + 쓰기, 완료 거부·정산 허용, 이전 차수·연결 문서·미래 날짜·빈 차수·기준값 불일치 거부, 승인일 KST 왕복, 행동 로그 document_update
expected: 고객 승인 표시/취소: 담당 PM + 쓰기, 완료 거부·정산 허용, 이전 차수·연결 문서·미래 날짜·빈 차수·기준값 불일치 거부, 승인일 KST 왕복, 행동 로그 document_update
result: pass
source: automated
coverage_id: D2

### 117. [04-14 D3] 게이트 규칙 quote.customer-approval(수주중·미수주 면제 · 설정 끔 통과 · 이전 승인 차수로 대신하지 않음) · quote.vendor-required 등록, 설정 키
expected: 게이트 규칙 quote.customer-approval(수주중·미수주 면제 · 설정 끔 통과 · 이전 승인 차수로 대신하지 않음) · quote.vendor-required 등록, 설정 키
result: pass
source: automated
coverage_id: D3

### 118. [04-14 D4] 차수 요약(상태 낱말 U-2 · 숫자 합계 · 줄 수 · 차수 id · 내용 토큰 · quote.amount 숨김 시 합계 키 없음) · 표시 번호 · 계보 해석
expected: 차수 요약(상태 낱말 U-2 · 숫자 합계 · 줄 수 · 차수 id · 내용 토큰 · quote.amount 숨김 시 합계 키 없음) · 표시 번호 · 계보 해석
result: pass
source: automated
coverage_id: D4

### 119. [04-14 D5] 이전 차수 잠김 조회 + 보기 액션 listRevisionLinesAction(view · QuoteLineDto · 순번 스키마 · 행 범위)
expected: 이전 차수 잠김 조회 + 보기 액션 listRevisionLinesAction(view · QuoteLineDto · 순번 스키마 · 행 범위)
result: pass
source: automated
coverage_id: D5

### 120. [04-15 D1] 프로젝트 복사 등록 — 견적 줄 · 견적 외 비용만 새 1차로(계보 없음 · version 1), 조정 · 보관 · 취소 줄 · 기간 · 총 매출 예상가 · 매출 제외, 원본 무변경
expected: 프로젝트 복사 등록 — 견적 줄 · 견적 외 비용만 새 1차로(계보 없음 · version 1), 조정 · 보관 · 취소 줄 · 기간 · 총 매출 예상가 · 매출 제외, 원본 무변경
result: pass
source: automated
coverage_id: D1

### 121. [04-15 D2] 범위 밖 · 보관 · 없는 출처 거부 + write.denied 한 번(금액 없음), 미리 채우기 없음
expected: 범위 밖 · 보관 · 없는 출처 거부 + write.denied 한 번(금액 없음), 미리 채우기 없음
result: pass
source: automated
coverage_id: D2

### 122. [04-15 D3] 상세 「프로젝트 복사」 → 미리 채운 폼 · 출처 한 줄 → Ctrl+Enter → 새 상세에 줄 둘 · 조정 그룹 없음, 복사 폼 Esc(DR-27)
expected: 상세 「프로젝트 복사」 → 미리 채운 폼 · 출처 한 줄 → Ctrl+Enter → 새 상세에 줄 둘 · 조정 그룹 없음, 복사 폼 Esc(DR-27)
result: pass
source: automated
coverage_id: D3

### 123. [04-15 D4] 등록 폼 총 매출 예상가 — KRW · USD 저장, KRW 위조 환율 1 고정, 거부 칸 오류, 커밋 뒤에만 최근 환율 기억, 빈 칸 = 0원
expected: 등록 폼 총 매출 예상가 — KRW · USD 저장, KRW 위조 환율 1 고정, 거부 칸 오류, 커밋 뒤에만 최근 환율 기억, 빈 칸 = 0원
result: pass
source: automated
coverage_id: D4

### 124. [04-15 D5] 등록 기간 형식 · 순서 서버 검증(PR #38 「날짜 순서」)
expected: 등록 기간 형식 · 순서 서버 검증(PR #38 「날짜 순서」)
result: pass
source: automated
coverage_id: D5

### 125. [04-19 D1] 견적 표·이전 차수 읽기 섹션이 30줄 쪽으로 나뉘고 그룹 머리글 반복 · 번호 연속 · 합계 전체 기준 · 두 쪽 편집 저장 · 쪽 보정 · 쪽 전환 포커스
expected: 견적 표·이전 차수 읽기 섹션이 30줄 쪽으로 나뉘고 그룹 머리글 반복 · 번호 연속 · 합계 전체 기준 · 두 쪽 편집 저장 · 쪽 보정 · 쪽 전환 포커스
result: pass
source: automated
coverage_id: D1

### 126. [04-19 D2] 쪽 경계 ↑↓ · Alt+↑↓ 따라가기 · 2쪽 Delete 대상 · 편집 중 Tab 쪽 넘김 · Shift 범위 쪽 안 · 포커스 id 기억
expected: 쪽 경계 ↑↓ · Alt+↑↓ 따라가기 · 2쪽 Delete 대상 · 편집 중 Tab 쪽 넘김 · Shift 범위 쪽 안 · 포커스 id 기억
result: pass
source: automated
coverage_id: D2

### 127. [04-19 D3] Ctrl+A → Ctrl+C가 45줄 전부를 04-24 직렬화 TSV와 앱 형식 JSON으로 싣는다(PROJ-05 복사 쪽)
expected: Ctrl+A → Ctrl+C가 45줄 전부를 04-24 직렬화 TSV와 앱 형식 JSON으로 싣는다(PROJ-05 복사 쪽)
result: pass
source: automated
coverage_id: D3

### 128. [04-19 D4] 힌트 줄 일곱 항목이 페이지 줄 바로 다음 한 곳 · 매출 표 없음 · 1000 폭 없음
expected: 힌트 줄 일곱 항목이 페이지 줄 바로 다음 한 곳 · 매출 표 없음 · 1000 폭 없음
result: pass
source: automated
coverage_id: D4

### 129. [04-20 D1] 사람의 전환 넷(수주중→진행·수주중→미수주·미수주→진행·정산→완료)이 권한표·팀 범위·시작일 규칙대로 실제 DB에서 동작하고 status_change 한 줄(trigger manual)을 남긴다
expected: 사람의 전환 넷(수주중→진행·수주중→미수주·미수주→진행·정산→완료)이 권한표·팀 범위·시작일 규칙대로 실제 DB에서 동작하고 status_change 한 줄(trigger manual)을 남긴다
result: pass
source: automated
coverage_id: D1

### 130. [04-20 D2] 시드만 있는 DB에서 자기 팀 팀장이 전환하고 상세를 본다 · 노출을 꺼도 권리는 그대로(ENG-D2)
expected: 시드만 있는 DB에서 자기 팀 팀장이 전환하고 상세를 본다 · 노출을 꺼도 권리는 그대로(ENG-D2)
result: pass
source: automated
coverage_id: D2

### 131. [04-20 D3] 완료는 대표·시스템 관리자만, 다른 팀 팀장·담당 PM 거부, 어제 팀을 옮긴 팀장은 오늘 옛 팀 프로젝트 거부
expected: 완료는 대표·시스템 관리자만, 다른 팀 팀장·담당 PM 거부, 어제 팀을 옮긴 팀장은 오늘 옛 팀 프로젝트 거부
result: pass
source: automated
coverage_id: D3

### 132. [04-20 D4] 상태 변경과 로그가 한 트랜잭션 · 오래된 화면·두 연결 경합에서 한 사람만 성공 · 바깥 tx 롤백 · 풀 2 동시 셋 시간 초과 0
expected: 상태 변경과 로그가 한 트랜잭션 · 오래된 화면·두 연결 경합에서 한 사람만 성공 · 바깥 tx 롤백 · 풀 2 동시 셋 시간 초과 0
result: pass
source: automated
coverage_id: D4

### 133. [04-20 D5] 배포 시드가 관리자가 끈 권한(팀장 projects.status)·노출(기획 PM quote.amount·대표 revenue.issued_amount)을 되살리지 않는다(PR #38 알려진 문제 종결)
expected: 배포 시드가 관리자가 끈 권한(팀장 projects.status)·노출(기획 PM quote.amount·대표 revenue.issued_amount)을 되살리지 않는다(PR #38 알려진 문제 종결)
result: pass
source: automated
coverage_id: D5

### 134. [04-20 D6] 갈 곳 목록(막힘 이유)·상태 코드표 목록·denyWrite 허용 목록
expected: 갈 곳 목록(막힘 이유)·상태 코드표 목록·denyWrite 허용 목록
result: pass
source: automated
coverage_id: D6

### 135. [04-22 P1] 기간 권리·검증·미리보기·저장 해석 결정표(저장될 값 · 달력 · 팀 범위 · projects.period)
expected: 기간 권리·검증·미리보기·저장 해석 결정표(저장될 값 · 달력 · 팀 범위 · projects.period)
result: pass
source: automated
coverage_id: P1

### 136. [04-22 P2] 정산 연장·앞당김·종료일 기본값·로그 행위자·경합·자정·로그 실패 롤백·기준값 충돌·판정 순서·차수 불일치
expected: 정산 연장·앞당김·종료일 기본값·로그 행위자·경합·자정·로그 실패 롤백·기준값 충돌·판정 순서·차수 불일치
result: pass
source: automated
coverage_id: P2

### 137. [04-22 P3] 상태 바뀜 저장 전부 거부(DR-6) → 태그 다시 그림 → 복원 줄로 편집 회수(D-68)
expected: 상태 바뀜 저장 전부 거부(DR-6) → 태그 다시 그림 → 복원 줄로 편집 회수(D-68)
result: pass
source: automated
coverage_id: P3

### 138. [04-22 P4] 상세 기간 칸 화면 — 팀장 연장 트레이서 · PM 앞당김 오류 + U-6 합계 행 · 「저장하면 정산이 됨」 → 정산 태그 · Esc 되돌리기/닫기 포커스
expected: 상세 기간 칸 화면 — 팀장 연장 트레이서 · PM 앞당김 오류 + U-6 합계 행 · 「저장하면 정산이 됨」 → 정산 태그 · Esc 되돌리기/닫기 포커스
result: pass
source: automated
coverage_id: P4

### 139. [04-23 D1] 조정 권한만 있는 경영관리가 완료 프로젝트에서 「조정 줄 추가」로 거래처(B-23)를 고른 조정 줄을 저장 → 맨 아래 조정 그룹 · 합계 행 차익 −120,000 · 목록 실행가 +120,000
expected: 조정 권한만 있는 경영관리가 완료 프로젝트에서 「조정 줄 추가」로 거래처(B-23)를 고른 조정 줄을 저장 → 맨 아래 조정 그룹 · 합계 행 차익 −120,000 · 목록 실행가 +120,000
result: pass
source: automated
coverage_id: D1

### 140. [04-23 D2] PM 시점 권한 밖 줄 — 조정 행 렌더(숨김 없음) · Enter·클릭·Delete·Alt+↑↓ 무반응 · 이유 글자·오류 셀 없음 · 일괄 저장 N 불변 · 정산 붙여넣기의 조정 칸 건너뜀 + `조정 줄 2칸 건너뜀` · 정산 잠긴 칸은 오류 셀 + `정산 · 실행가와 새 줄만`(D
expected: PM 시점 권한 밖 줄 — 조정 행 렌더(숨김 없음) · Enter·클릭·Delete·Alt+↑↓ 무반응 · 이유 글자·오류 셀 없음 · 일괄 저장 N 불변 · 정산 붙여넣기의 조정 칸 건너뜀 + `조정 줄 2칸 건너뜀` · 정산 잠긴 칸은 오류 셀 + `정산 · 실행가와 새 줄만`(DR-35)
result: pass
source: automated
coverage_id: D2

### 141. [04-23 D3] 경영관리 조정 줄 삭제 = ui/confirm-dialog(제목 · 부제 · 결과 줄 · 1차 포커스 · Esc 뒤 트리거 셀 포커스) → 저장 → 보관함 「견적 줄」 · 상한 300 aria-disabled + aria-describedby · 0줄 EMPTY 1000 사실만/1280
expected: 경영관리 조정 줄 삭제 = ui/confirm-dialog(제목 · 부제 · 결과 줄 · 1차 포커스 · Esc 뒤 트리거 셀 포커스) → 저장 → 보관함 「견적 줄」 · 상한 300 aria-disabled + aria-describedby · 0줄 EMPTY 1000 사실만/1280 「조정 줄 추가」 · 미저장 새 조정 줄 복원
result: pass
source: automated
coverage_id: D3

### 142. [04-23 D4] EMPTY 우선순위 ② 조정 결정표(완료·정산 조정 권한만 → 조정 줄 추가, 줄 추가 권한 있으면 첫 줄 만들기) · 표 위 한 줄 · 힌트 줄 확인
expected: EMPTY 우선순위 ② 조정 결정표(완료·정산 조정 권한만 → 조정 줄 추가, 줄 추가 권한 있으면 첫 줄 만들기) · 표 위 한 줄 · 힌트 줄 확인
result: pass
source: automated
coverage_id: D4

### 143. [04-23 D5] 견적 외 비용 줄 — 진행 −50,000 · 정산 −30,000(수량·단가 「—」 · 견적가 0) 저장, 복제도 같은 종류, 완료에 버튼 없음 · 소분류 편집 중에만 코드표 설명 한 줄(D-93)
expected: 견적 외 비용 줄 — 진행 −50,000 · 정산 −30,000(수량·단가 「—」 · 견적가 0) 저장, 복제도 같은 종류, 완료에 버튼 없음 · 소분류 편집 중에만 코드표 설명 한 줄(D-93)
result: pass
source: automated
coverage_id: D5

### 144. [04-25 D1] Select가 고른 코드표 값의 설명을 컨트롤 아래 한 줄로 보이고, 설명 없는 값·빈 값에서는 힌트 요소가 없다 — 첫 사용처 거래처 기본 증빙 종류
expected: Select가 고른 코드표 값의 설명을 컨트롤 아래 한 줄로 보이고, 설명 없는 값·빈 값에서는 힌트 요소가 없다 — 첫 사용처 거래처 기본 증빙 종류
result: pass
source: automated
coverage_id: D1

### 145. [04-25 D4] 폰 375 코드표에서 설명이 접힌 줄에 한 번만 보이고 값·정렬·동작 열이 숨으며 가로 스크롤 0
expected: 폰 375 코드표에서 설명이 접힌 줄에 한 번만 보이고 값·정렬·동작 열이 숨으며 가로 스크롤 0
result: pass
source: automated
coverage_id: D4

### 146. [04-26 D1] 서버가 차수당 줄 상한을 지킨다 — 새 줄 거부 · DB 무변경 · 보관 제외 · 취소 포함 · 설정 5 통과 · 상한을 낮춘 뒤 고치기/보관 통과 · 복원 상한 · 재전송 한 번만 셈 · 클라이언트 우회 배치 거부
expected: 서버가 차수당 줄 상한을 지킨다 — 새 줄 거부 · DB 무변경 · 보관 제외 · 취소 포함 · 설정 5 통과 · 상한을 낮춘 뒤 고치기/보관 통과 · 복원 상한 · 재전송 한 번만 셈 · 클라이언트 우회 배치 거부
result: pass
source: automated
coverage_id: D1

### 147. [04-26 D2] 두 연결 동시 추가가 상한을 넘지 않는다(두 순서 모두, 결정적 경합)
expected: 두 연결 동시 추가가 상한을 넘지 않는다(두 순서 모두, 결정적 경합)
result: pass
source: automated
coverage_id: D2

### 148. [04-26 D3] 줄 300에서 「줄 추가」 aria-disabled + 이유 「300줄 상한 · 상한은 관리자 설정」(aria-describedby)
expected: 줄 300에서 「줄 추가」 aria-disabled + 이유 「300줄 상한 · 상한은 관리자 설정」(aria-describedby)
result: pass
source: automated
coverage_id: D3

### 149. [04-26 D4] Ctrl+Enter·Ctrl+D 상한 무동작 + 합계 행 이유, 다음 저장 시도 뒤 사라짐
expected: Ctrl+Enter·Ctrl+D 상한 무동작 + 합계 행 이유, 다음 저장 시도 뒤 사라짐
result: pass
source: automated
coverage_id: D4

### 150. [04-26 D5] 상한을 넘는 붙여넣기 전부 거부(셀 무변경) + 「붙여넣기 전부 거부 · 300줄 상한을 1줄 넘음」, 다음 붙여넣기 때 사라짐
expected: 상한을 넘는 붙여넣기 전부 거부(셀 무변경) + 「붙여넣기 전부 거부 · 300줄 상한을 1줄 넘음」, 다음 붙여넣기 때 사라짐
result: pass
source: automated
coverage_id: D5

### 151. [04-27 D1] roles.work_scope 컬럼과 마이그레이션 0013(인라인 CHECK · 시드 계급 셋 company) — squawk 0건, 번호 = 직전 최고 + 1
expected: roles.work_scope 컬럼과 마이그레이션 0013(인라인 CHECK · 시드 계급 셋 company) — squawk 0건, 번호 = 직전 최고 + 1
result: pass
source: automated
coverage_id: D1

### 152. [04-27 D2] 시드 값(팀장·기획 PM team, 본부 책임자·대표·시스템 관리자 company) · 관리자 변경과 permission_change 로그 · 기획 PM 거부 · 재시드 보존 · 새 계급 기본값 team · all 거부 · 없는 계급 거부
expected: 시드 값(팀장·기획 PM team, 본부 책임자·대표·시스템 관리자 company) · 관리자 변경과 permission_change 로그 · 기획 PM 거부 · 재시드 보존 · 새 계급 기본값 team · all 거부 · 없는 계급 거부
result: pass
source: automated
coverage_id: D2

### 153. [04-28 D1] 저장·새 줄·줄 복제가 Ctrl 조합에서만 동작하고 Meta+s는 무동작, Ctrl+S 연타에도 요청 1번·+1줄
expected: 저장·새 줄·줄 복제가 Ctrl 조합에서만 동작하고 Meta+s는 무동작, Ctrl+S 연타에도 요청 1번·+1줄
result: pass
source: automated
coverage_id: D1

### 154. [04-28 D2] 힌트 줄 여섯 항목 라벨 kbd 묶음 · 저장 없음 · 1차 kbd Ctrl+S · EMPTY 3차 kbd Ctrl+Enter, 적힌 조합 전부 동작
expected: 힌트 줄 여섯 항목 라벨 kbd 묶음 · 저장 없음 · 1차 kbd Ctrl+S · EMPTY 3차 kbd Ctrl+Enter, 적힌 조합 전부 동작
result: pass
source: automated
coverage_id: D2

### 155. [04-28 D3] app/·ui/·SYSTEM.md에 Mac 글리프 넷·메타 키 참조 0개(스캔 테스트)
expected: app/·ui/·SYSTEM.md에 Mac 글리프 넷·메타 키 참조 0개(스캔 테스트)
result: pass
source: automated
coverage_id: D3

### 156. [04-28 D4] 저장 거부가 칸마다 고정 오류 셀·충돌 셀이 되고, 충돌을 키보드만으로 「그 값으로」·「덮어쓰기」로 해소
expected: 저장 거부가 칸마다 고정 오류 셀·충돌 셀이 되고, 충돌을 키보드만으로 「그 값으로」·「덮어쓰기」로 해소
result: pass
source: automated
coverage_id: D4

### 157. [04-29 D1] 번호 창 규칙(넓은 창 8쪽부터 생략, C-27 한 쪽 틈은 번호) + 범위 문구가 순수 함수로 고정됐다
expected: 번호 창 규칙(넓은 창 8쪽부터 생략, C-27 한 쪽 틈은 번호) + 범위 문구가 순수 함수로 고정됐다
result: pass
source: automated
coverage_id: D1

### 158. [04-29 D2] Pagination 컴포넌트가 href(next/link Link)/onPageChange(button) 유니언, aria-current, 첫/끝 이전·다음 비렌더, errorCounts 오류 표시를 §7-16 계약대로 렌더한다
expected: Pagination 컴포넌트가 href(next/link Link)/onPageChange(button) 유니언, aria-current, 첫/끝 이전·다음 비렌더, errorCounts 오류 표시를 §7-16 계약대로 렌더한다
result: pass
source: automated
coverage_id: D2

### 159. [04-29 D3] 폰 창(compact, 6쪽부터 첫·현재·끝)이 넓은 창과 함께 렌더되고 700 중단점 CSS로 하나만 보인다 — 실제 375px DOM 렌더 감사는 이 플랜에 화면이 없어 04-17이 맡는다(계획 probe_fallback 명시)
expected: 폰 창(compact, 6쪽부터 첫·현재·끝)이 넓은 창과 함께 렌더되고 700 중단점 CSS로 하나만 보인다 — 실제 375px DOM 렌더 감사는 이 플랜에 화면이 없어 04-17이 맡는다(계획 probe_fallback 명시)
result: pass
source: automated
coverage_id: D3

### 160. [04-29 D4] lib/kst-date — KST 자정 경계·연말·윤년·kstDayStart 왕복이 현재 시각을 인자로만 받아 서버 시간대와 무관하게 계산된다(B-25, A-18, D11)
expected: lib/kst-date — KST 자정 경계·연말·윤년·kstDayStart 왕복이 현재 시각을 인자로만 받아 서버 시간대와 무관하게 계산된다(B-25, A-18, D11)
result: pass
source: automated
coverage_id: D4

### 161. [04-29 D5] lib/paging — clampPage·pageCountFrom·LIST_PAGE_SIZE(50)·QUOTE_TABLE_PAGE_SIZE(30)가 목록·견적 표·리저브 공용 단일 출처다
expected: lib/paging — clampPage·pageCountFrom·LIST_PAGE_SIZE(50)·QUOTE_TABLE_PAGE_SIZE(30)가 목록·견적 표·리저브 공용 단일 출처다
result: pass
source: automated
coverage_id: D5

### 162. [04-29 D6] docs/design/SYSTEM.md §7-16 생략 규칙이 완전하다(기본 문장 + C-27 + 폰 6쪽 창) — DECISIONS.md 04-29 기록이 SYSTEM.md 변경보다 앞선 커밋에 있다
expected: docs/design/SYSTEM.md §7-16 생략 규칙이 완전하다(기본 문장 + C-27 + 폰 6쪽 창) — DECISIONS.md 04-29 기록이 SYSTEM.md 변경보다 앞선 커밋에 있다
result: pass
source: automated
coverage_id: D6

### 163. [04-31 D1] 실제 엑셀 캡처 원문(3×3·6열·45줄) 재생이 쪽 나눔·계산 열 무시·상한 경계까지 들어간 최종 견적 표를 끝까지 지난다 — 엑셀 6열의 계산 열 자리 값은 오류 칸이 된다(ENG-D5)
expected: 실제 엑셀 캡처 원문(3×3·6열·45줄) 재생이 쪽 나눔·계산 열 무시·상한 경계까지 들어간 최종 견적 표를 끝까지 지난다 — 엑셀 6열의 계산 열 자리 값은 오류 칸이 된다(ENG-D5)
result: pass
source: automated
coverage_id: D1

### 164. [04-31 D5] 페이즈 최종 게이트: CI=true 전체 E2E 새 DB 연속 3회(499/499, 11.1분·10.7분·11.1분, retries 0) + 마이그레이션 0011→0018 순서·0015 가드(외화 조건 포함)·rollback-floor 표시(0012·0015만)
expected: 페이즈 최종 게이트: CI=true 전체 E2E 새 DB 연속 3회(499/499, 11.1분·10.7분·11.1분, retries 0) + 마이그레이션 0011→0018 순서·0015 가드(외화 조건 포함)·rollback-floor 표시(0012·0015만)
result: pass
source: automated
coverage_id: D5

### 165. [04-31 D6] lib/format-number.ts 「쉼표 뒤 Backspace」 규칙이 캐럿 위치를 무시해 통째 덮어쓰기(400,000→400000)가 40000으로 저장되는 앱 버그 수정(Rule 1, ENG-D11 — 플랜 files 밖)
expected: lib/format-number.ts 「쉼표 뒤 Backspace」 규칙이 캐럿 위치를 무시해 통째 덮어쓰기(400,000→400000)가 40000으로 저장되는 앱 버그 수정(Rule 1, ENG-D11 — 플랜 files 밖)
result: pass
source: automated
coverage_id: D6

### 166. [04-32 D1] withTransaction이 SET LOCAL lock_timeout='5s'를 돌리고, 풀 connectionTimeoutMillis(5000, 두 연결 경로 모두)와 함께 잠금·풀 대기 시간 초과를 UserFacingError('다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장')로
expected: withTransaction이 SET LOCAL lock_timeout='5s'를 돌리고, 풀 connectionTimeoutMillis(5000, 두 연결 경로 모두)와 함께 잠금·풀 대기 시간 초과를 UserFacingError('다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장')로 바꾼다 — 풀 크기 2에서 saveProjectLedger 동시 3건이 10초 안에 전부 끝나고 거부는 전부 UserFacingError(원시 timeout exceeded when trying to connect 0건)
result: pass
source: automated
coverage_id: D1

### 167. [04-32 D2] recordAction(viewer, entry, { tx })가 로그 쓰기(appendActionLog)와 끌 수 있는 종류의 설정 조회(defaultIsActionTypeEnabled → getSettingValue의 findSimpleValue 주입)를 둘 다 그 tx로 돌린다 —
expected: recordAction(viewer, entry, { tx })가 로그 쓰기(appendActionLog)와 끌 수 있는 종류의 설정 조회(defaultIsActionTypeEnabled → getSettingValue의 findSimpleValue 주입)를 둘 다 그 tx로 돌린다 — 잠근 트랜잭션 안에서 풀 연결을 하나도 더 잡지 않고, 롤백하면 로그도 사라진다. tx 없으면 기존 동작 그대로
result: pass
source: automated
coverage_id: D2

### 168. [04-32 D4] project()의 노출 조회가 호출당 정보 항목 한 번(행·필드 수와 무관)이다 — 16필드가 같은 항목이면 1회, 서로 다른 항목 둘이면 2회. projectMany(viewer, rows, spec)가 그 맵을 한 번 만들어 모든 행에 쓴다(300행×18필드×항목2 → 조회 2회)
expected: project()의 노출 조회가 호출당 정보 항목 한 번(행·필드 수와 무관)이다 — 16필드가 같은 항목이면 1회, 서로 다른 항목 둘이면 2회. projectMany(viewer, rows, spec)가 그 맵을 한 번 만들어 모든 행에 쓴다(300행×18필드×항목2 → 조회 2회). project()는 projectMany([row])의 얇은 래퍼(구현 하나)
result: pass
source: automated
coverage_id: D4

### 169. [04-32 D5] DTO 필드 infoItem이 정보 항목 하나(string) 또는 all-of 목록(readonly string[])을 표현한다 — 목록이면 전부 볼 수 있을 때만 키가 실린다. registerDto가 빈 목록을 EmptyInfoItemsError로 거부한다. 누수 스캔(DTO 축·내보
expected: DTO 필드 infoItem이 정보 항목 하나(string) 또는 all-of 목록(readonly string[])을 표현한다 — 목록이면 전부 볼 수 있을 때만 키가 실린다. registerDto가 빈 목록을 EmptyInfoItemsError로 거부한다. 누수 스캔(DTO 축·내보내기 축)이 목록을 원소별로 펼쳐 검사한다(기존 600케이스 결과 불변 확인)
result: pass
source: automated
coverage_id: D5

### 170. [04-32 D6] [ENG-D11 편차] domain/projects/ledger.ts(04-02)의 saveProjectLedger가 트랜잭션 열기 전·연 뒤에도 풀 db로 읽어 withTransaction 밖에서 원시 pg-pool 시간 초과가 샜다 — withTimeoutConversion으로 함수
expected: [ENG-D11 편차] domain/projects/ledger.ts(04-02)의 saveProjectLedger가 트랜잭션 열기 전·연 뒤에도 풀 db로 읽어 withTransaction 밖에서 원시 pg-pool 시간 초과가 샜다 — withTimeoutConversion으로 함수 전체를 감싸 해소. 이 플랜의 검증(tx-safety.test.ts (c))이 이 결함 때문에 실패해 04-02 파일을 고쳤다(범위는 늘리지 않음, 회귀 테스트로 고정)
result: pass
source: automated
coverage_id: D6

### 171. [04-40 D1] 새 차수 뒤 옛 차수로 온 견적 줄 저장(단독·원장 합성)이 잠금 뒤 재확인으로 전부 거부되고 DB·매출 무변경, write.denied 한 번
expected: 새 차수 뒤 옛 차수로 온 견적 줄 저장(단독·원장 합성)이 잠금 뒤 재확인으로 전부 거부되고 DB·매출 무변경, write.denied 한 번
result: pass
source: automated
coverage_id: D1

### 172. [04-40 D2] 두 연결 결정적 경합 — 새 차수 대 저장 양 순서, 승인 대 수량·실행가 저장, 옛 기준값 승인 거부 → 새 기준값 승인(풀 ≥ 3 · 락 대기 확인)
expected: 두 연결 결정적 경합 — 새 차수 대 저장 양 순서, 승인 대 수량·실행가 저장, 옛 기준값 승인 거부 → 새 기준값 승인(풀 ≥ 3 · 락 대기 확인)
result: pass
source: automated
coverage_id: D2

### 173. [04-40 D3] 여러 차수 소속·일치 — 같은 프로젝트 다른 차수 줄 · 완료 프로젝트 줄 · 프로젝트-차수 불일치 거부, write.denied 정확히 한 번 · 금액 키 없음
expected: 여러 차수 소속·일치 — 같은 프로젝트 다른 차수 줄 · 완료 프로젝트 줄 · 프로젝트-차수 불일치 거부, write.denied 정확히 한 번 · 금액 키 없음
result: pass
source: automated
coverage_id: D3

### 174. [04-40 D4] normalizeMoneyInput 한 규칙(KRW 환율 1 · USD 환율 > 0 · 소수 자리 · 정수 범위 · 비유한수)과 견적 줄 셀 오류
expected: normalizeMoneyInput 한 규칙(KRW 환율 1 · USD 환율 > 0 · 소수 자리 · 정수 범위 · 비유한수)과 견적 줄 셀 오류
result: pass
source: automated
coverage_id: D4

### 175. [04-40 D5] 계산 견적가 상한(DR-9) — 수량·단가 두 칸 셀 오류, PG 22003 없음, 단독·합성 저장·액션 봉투
expected: 계산 견적가 상한(DR-9) — 수량·단가 두 칸 셀 오류, PG 22003 없음, 단독·합성 저장·액션 봉투
result: pass
source: automated
coverage_id: D5

### 176. [04-40 D6] 승인 차수 잠금 — 수량·단가·상태·소분류 · 환율만·통화만 · 견적가 있는 새 줄·복제·취소·보관·복원 거부, 합계 불변, 실행가·0원 새 줄·견적 외 비용·조정 통과, 승인 해제 뒤 편집 재개, 이전 차수 줄 복원 거부
expected: 승인 차수 잠금 — 수량·단가·상태·소분류 · 환율만·통화만 · 견적가 있는 새 줄·복제·취소·보관·복원 거부, 합계 불변, 실행가·0원 새 줄·견적 외 비용·조정 통과, 승인 해제 뒤 편집 재개, 이전 차수 줄 복원 거부
result: pass
source: automated
coverage_id: D6

### 177. [04-42 D1] /pnl 링크와 /pnl/reserves 게이트(pnl 보기 + reserve.amount) — 기획 PM·노출 꺼진 계급은 링크 없음 + 404
expected: /pnl 링크와 /pnl/reserves 게이트(pnl 보기 + reserve.amount) — 기획 PM·노출 꺼진 계급은 링크 없음 + 404
result: pass
source: automated
coverage_id: D1

### 178. [04-42 D2] 트레이서 — 링크 → 새 줄 클라이언트 선택 → 저장 → 머리글·줄 잔액 → 저장 뒤 클라이언트 칸 잠김
expected: 트레이서 — 링크 → 새 줄 클라이언트 선택 → 저장 → 머리글·줄 잔액 → 저장 뒤 클라이언트 칸 잠김
result: pass
source: automated
coverage_id: D2

### 179. [04-42 D3] 50건 번호 페이지(2쪽 같은 머리글·잔액, 범위 밖 → 마지막 쪽) · 쪽 이동 편집 보존(DR-18) · 다른 쪽 잔액 거부 링크(Codex #7)
expected: 50건 번호 페이지(2쪽 같은 머리글·잔액, 범위 밖 → 마지막 쪽) · 쪽 이동 편집 보존(DR-18) · 다른 쪽 잔액 거부 링크(Codex #7)
result: pass
source: automated
coverage_id: D3

### 180. [04-42 D4] 음수 거부 오류 셀 + 전부 거부 · 같은 날 입금 뒤 배치 저장 · 삭제 확인 → 일괄 저장 보관 · 쉼표·USD 환율·증빙 설명·kbd
expected: 음수 거부 오류 셀 + 전부 거부 · 같은 날 입금 뒤 배치 저장 · 삭제 확인 → 일괄 저장 보관 · 쉼표·USD 환율·증빙 설명·kbd
result: pass
source: automated
coverage_id: D4

### 181. [04-42 D5] 읽기 전용 viewer · 잔액 셀 편집 불가 · 1024 일곱 열 / 1000 여섯 열 보기 전용 · R1 · 저장 중 잠금(DR-3)
expected: 읽기 전용 viewer · 잔액 셀 편집 불가 · 1024 일곱 열 / 1000 여섯 열 보기 전용 · R1 · 저장 중 잠금(DR-3)
result: pass
source: automated
coverage_id: D5

### 182. [04-42 D6] 누수 스캔에 이 라우트 actions.registry 등록(D-38)
expected: 누수 스캔에 이 라우트 actions.registry 등록(D-38)
result: pass
source: automated
coverage_id: D6

### 183. [04-43 D1] REQUIREMENTS.md PROJ-04가 다섯 상태(수주중·진행·정산·완료·미수주)·진행→정산 자동 전환(D-76)·정산→완료의 Phase4 대표/시스템 관리자 직접 전환(D-79)·정산에서 PM의 실행가 편집+견적가 0 새 줄(D-78, 사용자 D10·D12)을 말한다
expected: REQUIREMENTS.md PROJ-04가 다섯 상태(수주중·진행·정산·완료·미수주)·진행→정산 자동 전환(D-76)·정산→완료의 Phase4 대표/시스템 관리자 직접 전환(D-79)·정산에서 PM의 실행가 편집+견적가 0 새 줄(D-78, 사용자 D10·D12)을 말한다
result: pass
source: automated
coverage_id: D1

### 184. [04-43 D2] REQUIREMENTS.md PROJ-03이 계약 금액을 입력 칸이 아니라 고객 승인된 현재 차수 견적 합계(공급가)로 말한다(D-84)
expected: REQUIREMENTS.md PROJ-03이 계약 금액을 입력 칸이 아니라 고객 승인된 현재 차수 견적 합계(공급가)로 말한다(D-84)
result: pass
source: automated
coverage_id: D2

### 185. [04-43 D3] ROADMAP.md Phase 4 성공 기준 4가 같은 모델(사람 전환 5종 + 자동 전환 1종 + 정산 편집 범위 + 파생 계약 금액)로 바뀌고 그 밖 줄은 diff 0이다
expected: ROADMAP.md Phase 4 성공 기준 4가 같은 모델(사람 전환 5종 + 자동 전환 1종 + 정산 편집 범위 + 파생 계약 금액)로 바뀌고 그 밖 줄은 diff 0이다
result: pass
source: automated
coverage_id: D3

### 186. [04-46 D1] Button reasonTone(block/info) + aria-disabled + aria-describedby — 비활성·진행 중 버튼이 포커스를 유지하고 클릭·암묵 제출을 무시한다(교차 그룹 계약 1)
expected: Button reasonTone(block/info) + aria-disabled + aria-describedby — 비활성·진행 중 버튼이 포커스를 유지하고 클릭·암묵 제출을 무시한다(교차 그룹 계약 1)
result: pass
source: automated
coverage_id: D1

### 187. [04-46 D2] ui/confirm-dialog/ConfirmDialog 신설 — 네이티브 dialog·slots·2차 라벨 자동 파생·첫 포커스 판정(교차 그룹 계약 2)
expected: ui/confirm-dialog/ConfirmDialog 신설 — 네이티브 dialog·slots·2차 라벨 자동 파생·첫 포커스 판정(교차 그룹 계약 2)
result: pass
source: automated
coverage_id: D2

### 188. [04-46 D3] 견적 줄 삭제 확인이 옛 div 모달(DeleteLineDialog)에서 ConfirmDialog로 이관 — 포커스·Tab 가두기·Esc 복귀
expected: 견적 줄 삭제 확인이 옛 div 모달(DeleteLineDialog)에서 ConfirmDialog로 이관 — 포커스·Tab 가두기·Esc 복귀
result: pass
source: automated
coverage_id: D3

### 189. [04-46 D4] 등록 폼 Esc·2차 「취소 Esc」의 「입력 버리기」 확인(DR-27) — 빈 폼 갈래·내부 컨트롤(네이티브 select) 우선 처리 포함
expected: 등록 폼 Esc·2차 「취소 Esc」의 「입력 버리기」 확인(DR-27) — 빈 폼 갈래·내부 컨트롤(네이티브 select) 우선 처리 포함
result: pass
source: automated
coverage_id: D4

### 190. [04-47 D1] 파서 끝 줄바꿈 · 붙여넣기 결정표(앱 형식일 때만 계산 열 무시, 엑셀은 오류 칸) · 원본 통화 · 줄 수
expected: 파서 끝 줄바꿈 · 붙여넣기 결정표(앱 형식일 때만 계산 열 무시, 엑셀은 오류 칸) · 원본 통화 · 줄 수
result: pass
source: automated
coverage_id: D1

### 191. [04-47 D2] 합계 행 오른쪽 한 줄(DR-16) — 순서·톤·성공 단독·저장 시도 때 붙여넣기 조각 지움
expected: 합계 행 오른쪽 한 줄(DR-16) — 순서·톤·성공 단독·저장 시도 때 붙여넣기 조각 지움
result: pass
source: automated
coverage_id: D2

### 192. [04-47 D3] 쪽을 넘는 붙여넣기(시작 쪽 유지 · N쪽까지 · 채운 줄 전부 저장) · 새 줄 고정 · C-18 · 그룹 버튼 쪽 이동(B-24)
expected: 쪽을 넘는 붙여넣기(시작 쪽 유지 · N쪽까지 · 채운 줄 전부 저장) · 새 줄 고정 · C-18 · 그룹 버튼 쪽 이동(B-24)
result: pass
source: automated
coverage_id: D3

### 193. [04-47 D4] 오류가 남은 채 1차 → 서버 요청 0 · 첫 오류(표 밖 칸 → 견적 표 쪽·셀 → 매출 표) · 거부 뒤 첫 오류 쪽과 번호 옆 `오류 N` · 쪽 왕복 dirty 유지
expected: 오류가 남은 채 1차 → 서버 요청 0 · 첫 오류(표 밖 칸 → 견적 표 쪽·셀 → 매출 표) · 거부 뒤 첫 오류 쪽과 번호 옆 `오류 N` · 쪽 왕복 dirty 유지
result: pass
source: automated
coverage_id: D4

### 194. [04-48 D1] 기간 두 칸 묶음 제출 · 서버 형식/거꾸로 판정 · 오류 시 기간 필터 미적용 · 기간 귀속 합계
expected: 기간 두 칸 묶음 제출 · 서버 형식/거꾸로 판정 · 오류 시 기간 필터 미적용 · 기간 귀속 합계
result: pass
source: automated
coverage_id: D1

### 195. [04-48 D2] 틀린 URL 파라미터 정규화(C-08) · 창 밖 연도 선택지 · 정렬 유지 · 필터 지우기 · 빈 목록 세 갈래 · 기간 칸 서식
expected: 틀린 URL 파라미터 정규화(C-08) · 창 밖 연도 선택지 · 정렬 유지 · 필터 지우기 · 빈 목록 세 갈래 · 기간 칸 서식
result: pass
source: automated
coverage_id: D2

### 196. [04-48 D3] 연도 자동 전환(DR-30) — 같은 해 기간 → 그 해, 걸친 기간 → 전체 연도, 연도를 바꿔 어긋나면 기간 비움
expected: 연도 자동 전환(DR-30) — 같은 해 기간 → 그 해, 걸친 기간 → 전체 연도, 연도를 바꿔 어긋나면 기간 비움
result: pass
source: automated
coverage_id: D3

### 197. [04-49 D1] 저장 요청 동안 견적 표·매출 표·기간 칸·총 매출 예상가 칸이 보이되 편집에 들어가지 않고, 연타 Ctrl+S는 요청 하나, 응답 뒤 다시 편집된다(DR-3)
expected: 저장 요청 동안 견적 표·매출 표·기간 칸·총 매출 예상가 칸이 보이되 편집에 들어가지 않고, 연타 Ctrl+S는 요청 하나, 응답 뒤 다시 편집된다(DR-3)
result: pass
source: automated
coverage_id: D1

### 198. [04-49 D2] 1024 미만(375 · 1000)에서 견적 줄 표는 캡션 있는 읽기 표, 줄 추가·첫 줄 만들기·힌트 줄·셀 편집 없음, 1차는 N ≥ 1일 때만
expected: 1024 미만(375 · 1000)에서 견적 줄 표는 캡션 있는 읽기 표, 줄 추가·첫 줄 만들기·힌트 줄·셀 편집 없음, 1차는 N ≥ 1일 때만
result: pass
source: automated
coverage_id: D2

### 199. [04-49 D3] 현재 차수 복원 줄이 375·1000에서도 렌더되고 표 칸만 복원해도 1차로 저장된다(R1), 375에서 두 버튼 같은 줄·44px
expected: 현재 차수 복원 줄이 375·1000에서도 렌더되고 표 칸만 복원해도 1차로 저장된다(R1), 375에서 두 버튼 같은 줄·44px
result: pass
source: automated
coverage_id: D3

### 200. [04-49 D4] 1100에서 번호·차익 숨김, 방향키가 숨은 열을 건너뜀, 합계 행 차익 합계
expected: 1100에서 번호·차익 숨김, 방향키가 숨은 열을 건너뜀, 합계 행 차익 합계
result: pass
source: automated
coverage_id: D4

### 201. [04-49 D5] 폰 375에서 셀 편집 입력 없이 행 탭 → 행 시트
expected: 폰 375에서 셀 편집 입력 없이 행 탭 → 행 시트
result: pass
source: automated
coverage_id: D5

### 202. [04-50 D1] rollback.sh가 스키마 하한 아래 배포로는 트래픽을 옮기지 않고(update-traffic 미호출), 이유·복구 절차를 stderr에 적는다. 하한 표시가 없으면 기존 여덟 케이스 그대로 동작한다
expected: rollback.sh가 스키마 하한 아래 배포로는 트래픽을 옮기지 않고(update-traffic 미호출), 이유·복구 절차를 stderr에 적는다. 하한 표시가 없으면 기존 여덟 케이스 그대로 동작한다
result: pass
source: automated
coverage_id: D1

### 203. [04-50 D2] deploy.yml의 staging·production 잡이 main이 아닌 ref의 workflow_dispatch를 클라우드 인증(id: auth) 전에 거부한다
expected: deploy.yml의 staging·production 잡이 main이 아닌 ref의 workflow_dispatch를 클라우드 인증(id: auth) 전에 거부한다
result: pass
source: automated
coverage_id: D2

### 204. [04-51 D1] 순번 시작값을 올해 이미 매긴 최대 이하로 낮추는 저장은 확정 문구로 거부되고 설정 값은 그대로다(50·102 거부, 103 통과 뒤 다음 번호가 겹치지 않음)
expected: 순번 시작값을 올해 이미 매긴 최대 이하로 낮추는 저장은 확정 문구로 거부되고 설정 값은 그대로다(50·102 거부, 103 통과 뒤 다음 번호가 겹치지 않음)
result: pass
source: automated
coverage_id: D1

### 205. [04-51 D2] 올해 매긴 번호가 없으면 어떤 값이든 저장 · 다른 키는 검증을 지나지 않음 · 권한 없는 호출은 최대 번호를 알리지 않고 권한 거부
expected: 올해 매긴 번호가 없으면 어떤 값이든 저장 · 다른 키는 검증을 지나지 않음 · 권한 없는 호출은 최대 번호를 알리지 않고 권한 거부
result: pass
source: automated
coverage_id: D2

### 206. [04-51 D3] 시작값을 바꾼 뒤에도 두 연결의 동시 발급은 서로 다른 번호(04-01 동시성 단언 유지)
expected: 시작값을 바꾼 뒤에도 두 연결의 동시 발급은 서로 다른 번호(04-01 동시성 단언 유지)
result: pass
source: automated
coverage_id: D3

## Summary

total: 206
passed: 206
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-4
  truth: "목록을 못 불러오면 「프로젝트 목록 불러오기 실패 · 다시 시도」가 보인다"
  status: resolved
  resolved_by: 04-52-PLAN.md
  resolved_at: 2026-09-29
  reason: "증거 없음: projects/error.tsx를 다루는 테스트·감사 기록 없음 — 사용자 결정: 테스트 추가"
  severity: minor
  test: 4
  root_cause: "결함 아님 · 테스트 공백 — error.tsx는 계약대로(문구 + 다시 시도 onClick=retry, Next 16.3 표준 이름). 단위는 node·renderToStaticMarkup만이라 클릭을 못 보고, E2E에는 RSC 페이지를 실패시키는 장치가 없어 04-05 이후 검증 안 됨"
  artifacts:
    - path: "app/(app)/projects/error.tsx"
      issue: "검증 테스트 없음"
    - path: "app/(app)/projects/page.tsx:69,101"
      issue: "?new=1 → recentFxRate(USD) schema.parse — settings_simple fx.recent_rate.USD=0이면 페이지가 던짐(실패 유도 경로)"
  missing:
    - "E2E 1건: fx.recent_rate.USD를 0으로 바꾸고 /projects?new=1 → 「프로젝트 목록 불러오기 실패」·「다시 시도」 보임 → 값 복구 뒤 다시 시도 → 목록 복귀, finally에서 값 복구. 제품 코드 변경 없음"
  debug_session: .planning/debug/phase4-uat-gaps.md
- gap_id: G-04-16
  truth: "선택 칸(ui/select)에 오류가 있으면 설명 힌트 대신 오류가 보인다"
  status: resolved
  resolved_by: 04-52-PLAN.md
  resolved_at: 2026-09-29
  reason: "증거 없음: 04-25-SUMMARY:63 커밋된 테스트 없음(호출부 없음) — 사용자 결정: 단위 테스트 추가"
  severity: minor
  test: 16
  root_cause: "결함 아님 · 테스트 공백 — ui/select/Select.tsx:39-69의 오류 우선 논리는 맞음(일회용 렌더 3건 통과). 04-25가 커밋 안 한 임시 vitest로만 확인했고 유일한 description 호출부(quote-table 소분류)는 error를 넘기지 않아 분기가 제품 경로에서 안 탐"
  artifacts:
    - path: "ui/select/Select.tsx"
      issue: "error+description 분기 테스트 없음"
  missing:
    - "단위 테스트 커밋(node · renderToStaticMarkup): 비제어·제어 각각 error+설명 → 오류 문구만·aria-describedby=<id>-error·aria-invalid, error 없음 → 힌트·<id>-hint. 제품 코드 변경 없음"
  debug_session: .planning/debug/phase4-uat-gaps.md
- gap_id: G-04-64
  truth: "매출 입력을 연 채 창을 1024 미만으로 줄여도 입력값이 남는다"
  status: resolved
  resolved_by: 04-52-PLAN.md
  resolved_at: 2026-09-29
  reason: "증거 없음: 04-41-SUMMARY:170 재현 안 됨·열린 채 이월 — 사용자 결정: E2E로 확인, 실패하면 수정"
  severity: major
  test: 64
  root_cause: "진단 미결 — 정적 분석상 단순 리사이즈로 값·dirty가 사라지는 경로 없음(값은 키 입력마다 부모 issuedEntries/paidEntries로 올라가고, QuoteLedger는 폭 변화로 재마운트되지 않으며, dirty 있으면 1024 미만에서도 저장 버튼 유지). 재현 E2E는 미실행(훅이 일회용 스펙 작성을 막음)"
  artifacts:
    - path: "app/(app)/projects/[id]/revenue-section.tsx:173-179,241,268-380"
      issue: "1024 미만이면 입력 → 글자 전환(canEditEntries)"
    - path: "app/(app)/projects/[id]/quote-table.tsx:1222,1472,1606,2240"
      issue: "매출 상태 보관·editableWidth·저장 버튼 조건"
  missing:
    - "재현 E2E(revenue-section.spec.ts의 openWithIssuedEntry 준비 재사용): (A) 기존 발행 줄 금액 키 입력(blur 없음) → 1000 → 375 → 1280, 값·「일괄 저장 N」 유지 (B) 새 발행·입금 줄 포커스 상태로 1000 → 1280 → 저장 → 새로고침 뒤 값 (C) 타이핑 도중 리사이즈. 통과하면 회귀 테스트로 남기고, 실패하면 매출 입력 포커스 동안 editableWidth를 참으로 유지(quote-table.tsx:1606 || cellEditing과 같은 결)"
  debug_session: .planning/debug/phase4-uat-gaps.md

## Deferred Follow-Ups

- test: 53
  idea: "DR-P4-02 목록 375 정렬 머리글 링크 터치 목표 44px — Phase 04.6(공용 표 컴포넌트 정돈)에서 수정"
  deferred_at: 2026-09-29
  resolved_by: quick 260929-npq(43dd5de4) — test 53 pass 재기록 2026-09-30(「[지시] 전환 (C)」)
