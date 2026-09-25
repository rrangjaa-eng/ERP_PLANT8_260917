# Codex FINAL Review — Shard A (04.1-01, 04.1-03)
Generated: 2026-09-25 01:31 KST

- [BLOCKER] A-F01 — 04.1-01-PLAN.md:518 — 팀장 기안자의 자기 승인 `skip` 미리보기를 `{label: "팀장", skipped: true}`로 단언하지만, 팀장 계급에는 `role.value` 시드가 없다. 기존 시드는 관리자·PM에만 노출을 부여하고(`domain/seed/index.ts:165`), 새 시드는 결재·연차 항목만 추가한다(01:309). 따라서 01:527대로 구현하면 `label`은 `N단`, `skipped`는 누락되어 테스트가 실패한다(`domain/permissions/visible.ts:22`). — 해당 픽스처의 **실제 기안자 계급**에 `role.value=true`, `approval.value=false`를 명시한다. 둘 다 숨김인 별도 사례는 유지한다.

- [WARNING] A-F02 — 04.1-01-PLAN.md:364; 04.1-03-PLAN.md:257 — 마이그레이션 검증 파이프라인은 마지막 `grep`의 종료 코드만 확인한다. 생성기가 성공 문구 출력 후 실패해도 검증이 통과할 수 있다. — 07에 반영한 CX-R10 방식대로 생성기 종료 코드를 먼저 검사하고, 성공한 출력에서 문구를 확인한다.

- [WARNING] A-F03 — 04.1-03-PLAN.md:316; 04.1-UI-SPEC.md:207,509 — 문자열 정본으로 지정한 UI-SPEC에는 여전히 남음이 “진행 중 제외”, 월차 칸이 “부여가 있을 때만”이라고 적혀 있다. 이는 확정된 D3 계산 및 D4의 적립 0일 표시와 충돌한다. — UI-SPEC을 D3·D4 정의로 동기화한다. 결정을 다시 논의할 필요는 없다.

- [WARNING] A-F04 — 04.1-01-PLAN.md:86,313 — must_have는 커밋된 전이에 로그가 “반드시” 있다고 하지만, 구현은 기존 설정 게이트를 따른다. `document_submit`·`document_approve`는 항상 기록 목록에 없으며, 설정이 꺼지면 INSERT 없이 반환한다(`domain/action-log/record.ts:65,127`). — 기존 설정 정책을 유지하면서 보장을 “기록이 활성화된 전이는 로그와 원자적으로 커밋”으로 정확히 적고, 비활성 설정 사례도 검증한다.

VERDICT: 1 blockers