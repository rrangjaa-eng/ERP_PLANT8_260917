# Codex FINAL Review Round 2 — Shard A (04.1-01, 04.1-03) — commit 7d0a378
Generated: 2026-09-25 01:39 KST

- [BLOCKER] A-FF01 — [04.1-01-PLAN.md:310](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:310) — 새 시드의 `insertVisibilityIfAbsent`만으로는 숨김 설정이 보존되지 않는다. 기존 [domain/seed/index.ts:165](/home/user/ERP_PLANT8_260917/domain/seed/index.ts:165)가 모든 정보 항목을 먼저 upsert하므로, 관리자·PM의 `approval.value`·`leave.value=false`가 재시드 때 true로 복구되어 숨겼던 정보가 다시 노출된다. — 신규 두 항목을 기존 덮어쓰기 루프에서 제외하고 새 시드만 담당하게 한다. `seedMasterData` 재실행 후 false 유지 및 실제 DTO 필드 부재를 검증하고, :331의 변경 제한도 조정한다.

- [WARNING] A-FF02 — [04.1-03-PLAN.md:300](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:300) — 조정 기록 테스트는 노출 허용 사례와 메뉴 권한 거부만 검사한다. 여섯 필드를 노출 검사 없이 반환해도 통과하며, 기존 누수 스캔도 [test/integration/leak-scan.test.ts:115](/home/user/ERP_PLANT8_260917/test/integration/leak-scan.test.ts:115)에서 등록 여부와 `visible()`의 boolean 타입만 확인한다. — 보기 권한을 유지한 채 `leave.value=false`로 바꾸고, 실제 `listLeaveAdjustmentsForUser` 결과에 사유·작성자·일수 등 여섯 필드가 없음을 단언하는 사례를 추가한다.

VERDICT: 1 blockers