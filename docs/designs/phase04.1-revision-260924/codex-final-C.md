# Codex FINAL Review — Shard C (04.1-06, 04.1-07, cross-plan, VALIDATION.md)
Generated: 2026-09-25 01:31 KST

`NN:line`은 `04.1-NN-PLAN.md:line`을 뜻합니다.

- [BLOCKER] C-F01 — 05:201; 03:299,309 — 동일한 신청용 DTO에 서로 다른 단위를 요구합니다. 03은 정수 쿼터지만 05는 `annualRemaining=4`, `monthlyRemaining=5`, `thisRequest=6`을 직접 단언하여 정상 구현도 실패합니다. — DTO 기대값을 각각 `16`, `20`, `24`, `plannedDeduction={monthly:20, annual:4}`, `over=0`으로 통일하고 표시 문자열만 일 단위로 유지하세요.

- [WARNING] C-F02 — 04.1-VALIDATION.md:119; 06:328,356 — 검증표는 여전히 월차 옵션의 **비활성**을 요구하지만 최종 계획은 옵션 **제거**와 선택값 초기화를 요구합니다. — 옵션 부재·복원·선택값 `연차` 복귀로 검증표를 갱신하세요.

- [WARNING] C-F03 — 04.1-UI-SPEC.md:207,452,509; 03:44,45 — UI 정본에는 월차 0줄 숨김과 `진행 중 제외`라는 이전 정의가 남아 D3·D4와 충돌합니다. — 확정된 남음 공식과 월차 0줄 표시 조건을 UI-SPEC에도 그대로 반영하세요.

- [WARNING] C-F04 — 01:364; 07:152 — 07에서 고친 생성기 종료 코드 검사가 01에는 적용되지 않았습니다. 기존 파이프는 생성기가 실패해도 출력에 `No schema changes`가 있으면 통과합니다. — 01도 생성기 종료 코드를 별도로 검사하는 07 방식으로 통일하세요.

- [WARNING] C-F05 — 06:240,308 — Task 1 수락 검사가 Task 3에서 생성할 `admin-person-leave.spec.ts`의 헬퍼 사용을 먼저 요구합니다. 순서대로 실행하면 아직 없는 파일 때문에 Task 1을 완료할 수 없습니다. — 해당 파일 검사는 Task 3 또는 플랜 최종 검증으로 옮기세요.

- [WARNING] C-F06 — 06:327; 03:320; domain/permissions/visible.ts:22 — 보기 전용 계급 E2E는 `무단 결근` 표시를 요구하면서 `leave.value` 노출 부여를 명시하지 않습니다. 새 계급을 메뉴 권한만으로 만들면 조정 DTO가 빈 객체가 됩니다. — 03:300에서 수정한 양성 픽스처처럼 노출을 명시하고, 노출을 끈 별도 사례에서는 사유 부재를 단언하세요.

VERDICT: 1 blockers