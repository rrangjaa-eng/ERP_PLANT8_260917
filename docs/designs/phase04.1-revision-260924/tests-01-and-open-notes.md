# 04.1 수정 회차 1 — 플랜 01 결과와 다음 회차에 넘길 교차 메모

## 01 새·바뀐 테스트
- test/unit/domain/approvals/resolve-step.test.ts · 결정표 칸 R1–R6 / W1–W13(19칸) 접두 테스트
- 같은 파일 · R2 팀 없는 기안자 1단 빈 자리 · R5 전사 단계만 켠 결재선 · R5 1단 승인 뒤 전사 단계 · R6 전사 × 계급 없음
- 같은 파일 · W5/W6 1단 본인 승인 + 3단 유일 담당 = 기안자 · W9/W10 대표 1단 승인 뒤 담당 소멸 · W4/W13 기안자 skip 통과뿐 · currentHolderIds 합집합
- test/integration/approvals-route-fixed.test.ts · tracer(4단 행 대표 기록 · is_fallback 0행) · 「담당 소멸 뒤 고아 최종 — 막힘」 describe · 옛 version 단독 상태

## 다음 회차에서 맞출 교차 메모(아직 반영 안 됨)
1. 04.1-02: walkRoute의 필수 입력 `at`("before_action" | "after_approval")을 반려·회수·재신청 호출 모두에 넘긴다(후보 판정은 before_action).
2. 04.1-02 Task 2: D2의 「기안자 회수 성공」 사례를 01의 「담당 소멸 뒤 고아 최종」 describe에 더한다.
3. D1 가장자리: 대표 폴백 후보는 승인 전에는 단계 행이 없어, 결재선에 대표 단계가 없으면 옛 version으로 부른 대표 폴백 후보가 관련자가 아니다(`지금 담당이 아님`). 관련자 집합에 폴백 후보를 넣을지 판단 필요.
4. 04.1-05 등 walkRoute 호출자 전부 `at`을 넘기고, 고아 최종은 `담당 없음`으로 보인다.
5. 04.1-02 결정(오케스트레이터 확인 필요): 종결 상태 거부(version 일치)에도 관련자 판정 적용 — 무관 사용자에게 상태를 숨긴다.
6. 04.1-07: STATE.md는 통째 금지에서 빼고 현재 페이즈 두 줄만 main과 같게, 병합 때 main 것으로 되돌린다.
7. VALIDATION.md: tests-0205.md · tests-0607.md · 이 파일의 사례를 반영하고 07의 옛 Phase 4 완료 확인 행을 지운다.

## 03·04 결과에서 넘어온 메모
8. ENG-5 편차(오케스트레이터 수용): 설정 가져오기는 지난 연도 행이 **값을 바꿀 때만** 거부한다. 지금 유효한 값과 같은 지난 연도 행은 받는다(기존 내보내기에 2000-01-01 기준 행이 늘 들어 있어 전부 거부하면 재가져오기가 불가능).
9. 06 E2E는 `annualGrantQuarters({fiscalYear, hireDate, resignationDate, annualDays})`(정수 1/4일) + `formatLeaveDays`로 입사 다음 해 연차를 계산한다.
10. 06 S9: `addLeaveAdjustment`는 연차에 `fiscalYear`가 필요한데 S9에 연도 칸이 없다 — 보이는 연도를 넘길지, 연도 선택을 더할지 정해야 한다.
11. UI-SPEC 새 문구 3개(S8 지난 연도 저장 거부 · S9 입사일 없음 · S9 월차 소멸 조정) — /plan-design-review 때 반영.
12. 03 테스트 사례 목록은 03 보고서 참고: first-year-accrual(비례·퇴직·D4) · balance(ENG-13·D3) · leave-balance 통합 · effective-from-rule 단위 · settings-export (e)~(h).

## 교차 메모 반영(2회, 22:45 KST) — 01·02·05
- X-1 walkRoute `at` 전 호출 · X-2 `setupOrphanFinal()` + 고아 최종 기안자 회수 · X-3 폴백 후보 = 관련자 · X-4 종결 상태도 관련자 판정
- 새 사례: resolve-step 「폴백 자리의 폴백 후보는 지금 담당」 · approvals-route-fixed 「고아 최종 문서의 기안자 회수 성공」 · approvals-concurrency 「폴백 후보는 관련자」

## 멈춘 곳 (2026-09-24 22:52 KST, 사용 한도로 코디네이터 지시)
- 끝남: 수정 회차 1(b3a0c68) · 교차 메모 X-1~X-5 · 06 S9 · VALIDATION(5987a71)
- 진행 중이던 것: 플랜 검사기 1회차(결과 → checker-round1.md). Codex는 인증·모델 확인만 하고 **실행 전**에 멈춤
- 다음(00:50 KST 뒤): Codex 3갈래(A 01·03 / B 02·04·05 / C 06·07·교차, 막는 문제마다 파일:줄 근거) → Sonnet 1차 대조 → 검사기+Codex 지적 한 번에 수정 → 2회차부터 바뀐 부분만 → 마지막 전체 Codex 한 번 → /gsd-pause-work → 기술 리뷰 세션 요청(04.1은 CEO 리뷰 생략)
