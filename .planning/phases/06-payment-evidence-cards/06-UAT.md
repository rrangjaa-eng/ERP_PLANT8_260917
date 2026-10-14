---
status: partial
phase: 06-payment-evidence-cards
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
started: 2026-10-14T04:24:00Z
updated: 2026-10-14T05:07:50Z
---

## Current Test

[testing paused — 14 items outstanding]

## Tests

### 1. Cold Start Smoke Test
expected: 서버를 내렸다 올린 뒤 마이그레이션 적용, /login 후 홈·/expenses·/cards·/projects가 오류 없이 200
result: pass
note: 배포 run 38511010555(2e05460) 뒤 스테이징 health와 주요 화면 200 확인. 서버 재시작·마이그레이션 재적용은 하지 않음

### 2. [자동] 06-01 D1 DECISIONS 06 SP 여덟 항목 순서
expected: DECISIONS 06 SP 여덟 항목 순서 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-01-D1

### 3. [자동] 06-01 D2 SYSTEM 아홉 절 꼬리표
expected: SYSTEM 아홉 절 꼬리표 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-01-D2

### 4. [자동] 06-01 D3 status-map Phase 6 낱말 아홉
expected: status-map Phase 6 낱말 아홉 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-01-D3

### 5. [자동] 06-01 D4 --accent-weak 대비 4.5 이상
expected: --accent-weak 대비 4.5 이상 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-01-D4

### 6. [자동] 06-01 D5 /dev/components 상태 배지 구역
expected: /dev/components 상태 배지 구역 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-01-D5

### 7. [자동] 06-02 D1 설정 키 넷 정의·등록·pair-grid
expected: 설정 키 넷 정의·등록·pair-grid — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-02-D1

### 8. [자동] 06-02 D2 관리자 설정 화면 4키·짝 격자 저장
expected: 관리자 설정 화면 4키·짝 격자 저장 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-02-D2

### 9. [자동] 06-02 D3 isMethodEvidencePairAllowed · resolveLineDoor
expected: isMethodEvidencePairAllowed · resolveLineDoor — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-02-D3

### 10. [자동] 06-02 D4 구매 요청 번호 서식·시작값 가드
expected: 구매 요청 번호 서식·시작값 가드 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-02-D4

### 11. [자동] 06-02 D5 지급 방식 코드표 -> 폼·짝 격자 반영
expected: 지급 방식 코드표 -> 폼·짝 격자 반영 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-02-D5

### 12. [자동] 06-27 D1 새 표 다섯 CHECK·유니크·인덱스
expected: 새 표 다섯 CHECK·유니크·인덱스 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-27-D1

### 13. [자동] 06-27 D2 expenses 칸 일곱·files 주인 종류
expected: expenses 칸 일곱·files 주인 종류 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-27-D2

### 14. [자동] 06-27 D3 corp_cards 주인 짝 CHECK + 기존 카드 회귀
expected: corp_cards 주인 짝 CHECK + 기존 카드 회귀 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-27-D3

### 15. [자동] 06-27 D4 메뉴 키 셋·정보 항목 넷·권한표 새 줄
expected: 메뉴 키 셋·정보 항목 넷·권한표 새 줄 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-27-D4

### 16. [자동] 06-27 D5 마이그레이션 두 파일·squawk 0·No schema changes
expected: 마이그레이션 두 파일·squawk 0·No schema changes — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-27-D5

### 17. [자동] 06-30 D1 cardOwnerKind 종류 셋 판정
expected: cardOwnerKind 종류 셋 판정 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-30-D1

### 18. [자동] 06-30 D2 공용 카드 등록·소유자 변경·거부·로그
expected: 공용 카드 등록·소유자 변경·거부·로그 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-30-D2

### 19. [자동] 06-30 D3 DB 이중 거부 23514 corp_cards_owner_kind_check
expected: DB 이중 거부 23514 corp_cards_owner_kind_check — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-30-D3

### 20. [자동] 06-30 D4 관리자 카드 폼·목록 「공용」·소유 「—」
expected: 관리자 카드 폼·목록 「공용」·소유 「—」 — 자동 테스트 통과
result: pass
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md, 06-09-SUMMARY.md, 06-10-SUMMARY.md, 06-11-SUMMARY.md, 06-12-SUMMARY.md, 06-13-SUMMARY.md, 06-14-SUMMARY.md, 06-15-SUMMARY.md, 06-16-SUMMARY.md, 06-17-SUMMARY.md, 06-18-SUMMARY.md, 06-19-SUMMARY.md, 06-20-SUMMARY.md, 06-21-SUMMARY.md, 06-22-SUMMARY.md, 06-23-SUMMARY.md, 06-24-SUMMARY.md, 06-25-SUMMARY.md, 06-27-SUMMARY.md, 06-28-SUMMARY.md, 06-29-SUMMARY.md, 06-30-SUMMARY.md
coverage_id: 06-30-D4

### 21. T1 지급 완료 단건
expected: 지급 섹션·지급일·이체액·힌트, 1차 `지급 완료`(Ctrl+Enter), 완료 태그; 권한 없으면 버튼 0 + `지급은 경영관리`
result: blocked
blocked_by: other
reason: needs [테스트] 결재자 account(박도윤/정하은/강현우) + 결재 통과 문서; 권한 없는 사람 단언은 대표/사원 계정; awaiting user card 2026-10-14

### 22. T2 지급 예정일 제자리 저장
expected: `지급 예정일 바꾸기` -> dirty면 1차 `예정일 저장` 하나, Esc 복귀, 저장 뒤 `지급 완료` 포커스
result: blocked
blocked_by: other
reason: needs [테스트] 결재자 account + 결재 통과 문서 (결재 통과 문서 0건); awaiting user card 2026-10-14

### 23. T3 증빙 없음 막힘 + 짝 게이트 + 증빙 면제
expected: `지급 완료` aria-disabled + `증빙 없음 · 기안자 {이름}`, `증빙 면제` 모달, 면제 뒤 `확인` 줄 `면제`
result: blocked
blocked_by: other
reason: needs [테스트] 결재자 account + 결재 통과 문서; awaiting user card 2026-10-14

### 24. T4 증빙 확인 / 금액 고쳐 확인
expected: `증빙 확인 Ctrl+Enter`, 증빙 금액 바꾸기, 확인 뒤 `확인됨` + 2행, 확인 전 지급 막힘, 부가세 포함 금액 거부
result: blocked
blocked_by: other
reason: needs [테스트] 결재자 account + 결재 통과 문서; awaiting user card 2026-10-14

### 25. T5 지급 취소
expected: 읽기 줄 + 2차 `지급 취소` 모달, 취소 뒤 지급 전 복귀, 권한 없으면 버튼 0
result: blocked
blocked_by: other
reason: needs 지급 완료 문서 (지급 완료 0건, 결재자 account 선행); awaiting user card 2026-10-14

### 26. T6 지급 대상 목록 S1
expected: 결재 통과 ∧ 지급 전 문서만, 증빙·팀 필터, 서버 합계, 선택 열, 빈 화면 `지급 완료 보기`, `필터 지우기`
result: pass
note: pass(partial): 필터 select·`지급 완료 보기` 링크 확인. 지급 대상 0건이라 합계·선택 열·`필터 지우기` 미확인

### 27. T7 일괄 지급 S2
expected: 행 체크 -> 합계 갱신, `지급 완료 N` 확인 모달, 건별 성공·실패, 처리된 행 제거
result: blocked
blocked_by: other
reason: needs 결재 통과 문서 3건 이상 (지급 대상 0건); awaiting user card 2026-10-14

### 28. T8 이체액 편집 · 쪽 넘는 선택 · 제자리 증빙 확인
expected: 이체액 편집 시 행 자동 선택, 쪽 넘는 선택 유지(sessionStorage), 제자리 `증빙 확인` 다이얼로그
result: blocked
blocked_by: other
reason: needs 결재 통과 문서 50건 초과 또는 증빙 확인 전 행; awaiting user card 2026-10-14

### 29. T9 지급 완료 보기 S3 + 계좌 + 문서 왕복
expected: 지급일 그룹·서버 합계·쪽, 계좌 표시, 제자리 증빙 확인, `지급 대상으로` 3차
result: pass
note: pass(partial): 월·팀 select와 빈 화면 링크 확인. 지급일 그룹·계좌·`지급 대상으로` 3차 미확인(데이터 없음)

### 30. T10 Phase 5 목록 상태 열
expected: `지급 완료 MM-DD`, `증빙 N일 경과`, `종결`(--status-muted), 폰 320 가로 넘침 없음
result: pass
note: pass(partial): `종결 10-14`(--status-muted), 4폭 가로 넘침 0 확인. `지급 완료 MM-DD`·`증빙 N일 경과` 미확인(데이터 없음)

### 31. T11 선결제 · 증빙 금액 · 증빙일 입력
expected: 증빙 금액·증빙일·선결제(+사유) 입력, 힌트 `증빙 기한 지급일부터 14일`, 사유 비면 `선결제 사유 없음 · 사유 적기`, 0·부가세 포함액 칸 오류
result: pass
note: pass: 선결제·증빙 금액·증빙일 입력과 오류 문구 확인. 지급 뒤 `선결제` 낱말 + `증빙 기한 MM-DD`는 지급 불가라 미확인

### 32. T12 결재 통과 뒤 증빙 변경 시 확인 풀림 / 완료 프로젝트 잠김
expected: 증빙 변경 시 `확인됨` -> `확인 전`, 완료 프로젝트 문서는 기안자에게 `완료 프로젝트 · 증빙은 경영관리`
result: blocked
blocked_by: other
reason: needs 확인된 결재 통과 문서 + 완료 프로젝트 (둘 다 0건); awaiting user card 2026-10-14

### 33. T13 반려 · 회수 지출결의 종결 S23
expected: 2차 `종결` 모달(결과 줄·사유 필수·500자 상한), 종결 뒤 상태 `종결`, 포커스 화면 제목
result: pass
note: pass: 종결 모달·사유 검증·포커스 확인. 분할(회차 상한) 갈래 미확인

### 34. T14 법인카드 사용 본인 등록
expected: Ctrl+Enter 뒤 패널 유지·첫 칸 포커스·`카드 사용 등록됨 · N`, 사용일 상한 오류, 공용 카드 옵션 권한 제한
result: pass
note: pass: 등록·패널 유지·포커스·사용일 오류 확인. 사원 시점과 `cards.proxy` 없는 사람의 공용 카드 옵션 숨김은 admin이라 미확인

### 35. T15 카드 사용 목록 · 필터 · 합계
expected: 서버 합계 `N건` + 금액, 카드 그룹 행, 50건 쪽, 빈 화면 세 갈래, 로드 오류 `다시 시도`
result: pass
note: pass(partial): 합계·카드 그룹·빈 화면 갈래 확인. 50건 쪽·로드 오류 `다시 시도` 미확인

### 36. T16 카드 사용 수정 · 삭제 · 되돌리기
expected: 행 `수정`·`삭제`(danger), 삭제 뒤 `되돌리기`, 남의 건은 칸 비어 있음, 구매 완료 건은 `수정`만
result: pass
note: pass(partial): 수정·삭제·되돌리기 확인. 남이 등록한 건·구매 완료 건 미확인(데이터 없음)

### 37. T17 대리 등록 (경영관리)
expected: `경영관리 등록 · 카드 소지자 {이름}`, 팀 비용 `사용한 사람` 선택, 완료 프로젝트 `완료 · 견적 줄 잠김`
result: pass
note: pass(partial): 소지자 문구·`사용한 사람` 선택 확인. 완료 프로젝트 행 미확인(완료 프로젝트 0건)

### 38. T18 카드 전표 증빙
expected: 패널 `증빙` 줄 업로드, 목록 증빙 열 `있음`/`—`, 보관 카드 읽기 가능
result: pass
note: pass: 업로드·증빙 열 `있음`/`—` 확인. 보관 카드 읽기 미확인

### 39. T19 카드 사용 견적 줄 연결 · 견적 외 비용
expected: 프로젝트->견적 줄 고르기, 실행가 초과 차단, 지출결의 연결 줄 문구, 견적 외 비용 out_of_quote 줄 생성
result: pass
note: pass(partial): 줄 고르기·실행가 초과 차단·카드 사용 줄 연결 확인. `지출결의 {번호} 연결됨` 문구와 견적 외 비용 out_of_quote 생성 미확인

### 40. T20 프로젝트 상세 법인카드 사용 섹션 S15
expected: 「법인카드 사용」 표, 등록 칸, 폰 375 행 탭 -> `/cards?editId=` 또는 행 시트
result: pass
note: pass: 섹션 표와 375 행 탭 이동(권리 있음 경로) 확인. `구매 요청 {번호}` 등록 칸·권리 없는 행 시트 미확인

### 41. T21 구매 요청 신청 S11/S12
expected: 목록·Empty, 연결 없음 막힘, 비온라인 줄 막힘, 저장 뒤 `구매 요청됨 · {번호}`, 번호 서식 26001-C0001 / TC26-0001
result: blocked
blocked_by: other
reason: needs 소속 팀이 있는 사원/PM account + 설정 `온라인구매 협력사` 값 (설정 변경 금지); awaiting user card 2026-10-14

### 42. T22 구매 완료 S13
expected: `구매 완료` 옆 패널(카드 Select·차이 줄), 처리 뒤 2행 + `실행가 초과` 경고, 빈 화면 문구
result: blocked
blocked_by: other
reason: needs 경영관리 구매 권한자 account + 구매 요청 데이터 (T21 선행); awaiting user card 2026-10-14

### 43. T23 구매 요청 취소 · 되돌리기
expected: `요청 취소` -> `되돌리기`, 남의 요청은 사유 필수, 폰 패널 안 `요청 취소`, 되돌리기 게이트 재통과
result: blocked
blocked_by: other
reason: needs 구매 요청 신청자 + 구매 권한자 2역할 account; awaiting user card 2026-10-14

### 44. T24 견적 줄 상태 8값 + 행동 문 가르기 S14
expected: 상태 열 낱말 8값, 2행 `증빙 N일 경과`·`실행가 초과`, 행 행동 `구매 요청`, 막힌 줄 이유 + 다음 한 수
result: pass
note: pass(partial): `미착수`·`카드 사용` 상태와 연결 문구 확인. 나머지 상태·`증빙 N일 경과`·`실행가 초과` 미확인(데이터 없음)

### 45. T25 승인 차수 증빙 S21
expected: 3차 `승인 증빙 {N}` 펼침(하나 더·되돌리기), 이전 차수는 읽기 전용
result: blocked
blocked_by: other
reason: needs 담당 PM [테스트] 김민준 account (quote.amount 권한); admin은 업로드 불가; awaiting user card 2026-10-14

### 46. T26 리저브 줄 증빙 S22
expected: `증빙` 열(맨 끝), 표 아래 펼침, 폰 행 시트 첨부 행, 엑셀 붙여넣기 1024 열 순서 유지
result: pass
note: pass(partial): 열 순서·업로드·펼침·폰 시트·1024 열 순서 확인. 엑셀 붙여넣기 미확인

### 47. T27 매출 발행 요청 S16
expected: `발행 요청` 표, `발행 줄로` -> `발행 줄 입력 중`, 저장 뒤 `발행됨` + 2행, 동시 이음 오류 문구
result: pass
note: pass: 신청 -> 발행 줄로 -> 발행됨 흐름 확인. 빈 화면 세 갈래·동시 이음 오류 문구 미확인

### 48. T28 발행 요청 취소 · 목록 S17
expected: 희망일 그룹·합계, 필터 0건 문구, Delete -> 확인 모달 -> `일괄 저장`으로 취소, `?issueRequest` 포커스, 말줄임
result: pass
note: pass(partial): 목록·포커스·Delete 취소·일괄 저장 확인. 필터 0건 `필터 지우기`는 재현 못 함

### 49. T29 완료 전 점검 S18
expected: 견적 표 아래·매출 앞 「완료 전 점검」, `정산 결재 올리기` 비활성 이유 + `점검 보기`, 강행 기안
result: pass
note: pass(partial): 섹션 위치·점검 표 확인. 정산 결재 문서 없음(404)·admin은 담당 PM 아님 -> 비활성 이유·`점검 보기`·강행 갈래 미확인

### 50. T30 대표 최종 승인 재점검 O-16 / 정산 결재 문서 막힘
expected: 점검 막힘이면 승인 비활성 + `점검 보기`, 강행 결과 줄, `정산 결재 다시 올리기` 막힘, 통과 시 승인 -> 프로젝트 완료
result: blocked
blocked_by: other
reason: needs 결재자(대표) + 담당 PM account + 정산 결재 문서 (0건); awaiting user card 2026-10-14

### 51. T31 홈 「내 차례」 Phase 6 항목
expected: 경영관리 지급 묶음 `[오늘]`/`[대기]`, 구매·발행 요청 한 줄, PM `[막힘]`, 기안자 증빙 신호, 로드 오류 `다시 시도`
result: blocked
blocked_by: other
reason: needs 경영관리 / PM / 기안자 각 역할 account + 해당 항목 데이터; awaiting user card 2026-10-14

### 52. T32 관리자 설정: Phase 6 키 · 짝 격자
expected: `증빙 필수`·`선결제 증빙 기한`·`온라인구매 협력사`·짝 격자, 즉시 저장·재열기 유지, 320 클릭 영역 44px
result: pass
note: pass(partial): 키 값·짝 격자·320 컨트롤 44px 확인. 값 저장·재열기·`온라인구매 협력사` 어긋남 표시는 설정 변경 금지로 미확인

### 53. T33 공용 법인카드 마스터 배치
expected: 종류 `공용` 선택 시 소유 칸 렌더 안 됨·빈 자리 없음, 목록 공용 행 소유 `—`, 375·320·1280 배치
result: pass
note: pass: 공용 선택 시 소지자 칸 제거·3폭 배치 확인. 목록 공용 행 소유 `—`·소유자 변경 폼은 공용 카드 없어 미확인

### 54. T34 권한표 · 노출표 새 줄
expected: `/admin/permissions`·`/admin/visibility`에 Phase 6 메뉴 키 줄과 정보 항목 넷
result: pass

### 55. T35 PR-A 위험 경로 머지 전 R-6 확인
expected: R-6 SQL 결과가 계획 기준과 같고 사용자가 직접 머지, 스테이징 배포 초록
result: skipped
reason: user item — 스테이징 DB R-6 SQL 확인 + GitHub 직접 머지는 사용자 몫

### 56. T36 요구사항 정렬 문서 확인
expected: ROADMAP 기준·REQUIREMENTS 다섯 줄이 D-607 · UA-619 · Q5 · MAST-05와 같은 뜻
result: skipped
reason: doc item — 요구사항 문서는 사람이 읽고 판정

### 57. T37 공용 조각 갤러리 (표 선택·고르기·모달 첨부)
expected: 표 선택 열 폭 44, 고르기 목록 4상태, 모달 첨부 칸, 새 상태 배지 아홉 낱말, 새 색·서체·radius 없음
result: pass
note: pass(partial): 표 선택 열 폭 44·막힌 행·배지 구역 확인. 고르기 목록 4상태·모달 첨부 칸·새 색/서체/radius 부재 미확인

## Summary

total: 57
passed: 41
issues: 0
pending: 0
skipped: 2
blocked: 14

## Evidence

- 06-VERIFICATION.md — status human_needed, 5/5 SC
- 스테이징 캡처 — /mnt/project-files/06-review/verify/staging/ (staging-uat-results.md 판정; I-1 폰 입력 40px·링크 셀 23px는 SYSTEM.md가 폰 입력을 40px로 정해 결함 아님 — codex-dom-adjudication.md)
- Codex 16 라우트 x 4폭 — /mnt/project-files/06-review/verify/codex/b1..b8 + codex-dom-adjudication.md (후보 35건 -> 결함 2건 기존 이슈, 결정 1건)
- Safari 실행 38513892541 + 38514530074 — safari-report.md (수정 0)
- 260907 비교 — 260907-compare.md + 260907-gaps-adjudicated.md

## Gaps

# gaps from verification sources are planned separately — see 06-GAPS.md
