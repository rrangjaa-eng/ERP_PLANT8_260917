---
status: partial
phase: 07-schedule-notify-audit
source: [07-01-SUMMARY.md … 07-28-SUMMARY.md (28)]
started: 2026-10-25T04:50:00Z
updated: 2026-10-25T05:40:00Z
---

## Current Test

[testing paused — 8 blocked, Codex 디자인 검토 미실행]

방식: 사용자 대신 세션이 스테이징(배포 cacb2b06 = main)에서 Playwright DOM 실측으로 판정(팀 메모리 uat-self-verify-staging). 읽기 전용 — 설정·권한·데이터 변경 0, SQL 0.
원자료: /mnt/project-files/07-review/verify/uat-staging.md (시험 표 T01~), 캡처 /mnt/project-files/07-review/verify/staging/ (24화면 × 375·320·768·1280 PNG + DOM JSON).

## Tests

27개 pass — 시험별 기대·실측은 uat-staging.md 표. 여기는 pass가 아닌 것만 적는다.

### T18. 권한표 대표 행동 로그 보기
expected: 대표 · 행동 로그 · 보기 체크
result: skipped
reason: "사용자 결정 2026-10-22 — D-722 ①은 ⑧과 함께 켤 때까지 보류(domain/seed/role-defaults.ts:27, test/e2e/role-smoke.spec.ts:52가 404 단언). 결함 아님"

### I-2. 폰 입력·체크박스·인라인 링크 높이 44 미만
expected: 폰 터치 목표 44
result: skipped
reason: "SYSTEM.md:233 — 폼 입력은 40이 규칙(실측 40 일치). 체크박스 20px·인라인 링크 18~23px은 SYSTEM에 규칙 없음 → 결함 판정 못 함, 07.1 디자인 검토 입력으로 넘김"

### I-4. 빈 제출 뒤 첫 오류 칸으로 포커스
expected: 빈 제출 → 첫 오류 칸 포커스
result: issue
reported: "/admin/people?new=1 · /admin/vendors?new=1 · /admin/people/roles?new=1 에서 포커스가 제출 버튼에 남음(법인카드 등록·내 계정은 정상)"
severity: minor

### I-5. 알림 규칙 수정 패널 범위 문구
expected: 범위 오류 문구 한 번
result: issue
reported: "「일수 범위 0~10 · 다시 입력」이 패널 안에 두 번 나옴"
severity: cosmetic

### B-1~B-8. 막힌 확인
result: blocked
blocked_by: other
reason: "지급일 자동 → 금요일 묶음(4인 결재 필요), 14시 마감 밀림·이번 주로(시각·결재 데이터 변경), 공휴일 추가 이동(설정 변경), 9시 묶음 메일(스테이징 이메일 미설정), 설정 변경 전후 값(설정 변경), 잠금 풀기(잠긴 계정 없음), 수금 지연 배지(데이터 없음), 알림함 링크·묶음(알림 없음). 자동 시험(main CI 40151481669 통과)이 같은 동작을 덮는지는 07-VERIFICATION.md 참고"

## Summary

total: 38
passed: 27
issues: 2
pending: 0
skipped: 2
blocked: 8

## Gaps

- gap_id: G-07-V1
  truth: "계급별 기본값 표가 전 메뉴를 덮는다(SC5)"
  status: failed
  reason: "07-VERIFICATION.md — leave·expenses·expenses.team 17행이 domain/seed/approvals-leave.ts:18-25 · domain/seed/expenses.ts:26-35에 남음(07-05-SUMMARY:97 「다음 검수 플랜이 옮김」, 07-25가 안 함)"
  severity: major
  test: V1
  artifacts: []
  missing: []
- gap_id: G-07-I4
  truth: "빈 제출 뒤 첫 오류 칸으로 포커스"
  status: failed
  reason: "스테이징 실측: 사람·거래처·계급 새로 만들기 폼에서 포커스가 제출 버튼에 남음"
  severity: minor
  test: I-4
  artifacts: []
  missing: []
- gap_id: G-07-I5
  truth: "범위 오류 문구는 한 번"
  status: failed
  reason: "알림 규칙 수정 패널에 같은 문구 두 번"
  severity: cosmetic
  test: I-5
  artifacts: []
  missing: []
