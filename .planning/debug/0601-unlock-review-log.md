---
status: diagnosed
trigger: "06.1 UAT #49 — 확인 필요 풀기가 패널 이력과 action-log에 남지 않음"
created: 2026-10-20T15:10:00Z
updated: 2026-10-20T15:52:00Z
phase: 06.1
goal: find_root_cause_only
---

## Symptoms
- expected: 경영관리가 증빙 패널에서 「확인 필요」를 풀면 누가·언제가 패널 이력(및 action-log)에 남는다 — 06.1-07 PLAN·UI-SPEC·CONTEXT가 기록을 요구하는지 먼저 확인.
- actual: 풀기 뒤 패널 이력·action-log에 항목 없음.
- errors: 없음
- reproduction: UAT #49 (/mnt/project-files/06.1-review/verify/staging-uat.md)
- timeline: 스테이징 UAT 2026-10-20에서 발견
- suspects: domain/evidence-records/amount.ts:212-213

## Current Focus
bug_class: Bohrbug (deterministic — code path is synchronous within one tx)
hypothesis: H1 — clearRecordNeedsCheck writes a `document_update` action-log row (plan requires it), but listRecordHistory reads only `evidence_record_amount_change`, so the panel history omits the unlock by design of 06.1-07 PLAN; the action-log absence is either a staging config (action_log.optional_types without document_update) or a tester lookup miss.
test: run targeted integration test evidence-amount.test.ts "확인 필요 풀기" (asserts document_update row) and read listRecordHistory query
expecting: test green => code writes the row; history query filtered by actionType = evidence_record_amount_change only
next_action: flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/evidence-amount.test.ts -t "확인 필요 풀기"

## Evidence
- timestamp: 2026-10-20T15:20Z
  checked: domain/evidence-records/amount.ts:212-222 (main 9122c31, blame cf9ce69 #253)
  found: clearNeedsCheck branch at :212-213 only updates; but :215-221 unconditionally (when clearNeedsCheck) calls recordAction(document_update, entity evidence_record, documentId = record id, detail {change: evidence_record_needs_check_clear, needsCheck}) inside the same tx
  implication: UAT suspicion "no recordAction in clearNeedsCheck branch" is wrong — the log call is just below the branch
- timestamp: 2026-10-20T15:25Z
  checked: 06.1-07-PLAN.md :50, :174 (PA-CONFIRM), :259, :269, :271, :388; 06.1-UI-SPEC.md :470-471, :476
  found: PLAN requires the unlock action-log row `document_update` (PA-CONFIRM :174, Task 2 :269, Artifacts :388). PLAN history (HistoryList) lists only 등록 · 붙임 · 뗌 · 금액 전→후 (:50, :271). UI-SPEC :476 이력 also lists only 붙임 · 뗌 · 금액 고침 전·후; only :471 says 「이력에 둘 다 남는다」 for the combined save.
  implication: action-log row IS required; panel-history line for the unlock is NOT in PLAN/HistoryList enumerations — UI-SPEC :471 is the only (ambiguous) source
- timestamp: 2026-10-20T15:30Z
  checked: domain/action-log/record.ts recordAction + domain/settings/keys.ts ACTION_LOG_OPTIONAL_TYPES
  found: document_update is NOT in ALWAYS_ON_ACTION_TYPES; it is optional and is written only if action_log.optional_types includes it (default = all optional types, so on by default; fail-open on read error). No seed/migration stores a custom value.
  implication: the unlock row can be silently skipped if the staging setting was saved without document_update — config-category candidate
- timestamp: 2026-10-20T15:32Z
  checked: app/(app)/admin/action-log/page.tsx, repositories/action-log.ts filterActionLog
  found: page lists all rows (no entity filter); 발생 시각 rendered as UTC (toISOString) while panel history shows KST; label 「문서 수정」, 대상 `evidence_record {uuid}`
  implication: if the row exists it shows as 「문서 수정 · evidence_record <uuid>」 9h off from the panel time — easy to miss when looking for a 「확인 필요」 label

- timestamp: 2026-10-20T15:45Z
  checked: flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/evidence-amount.test.ts -t "확인 필요 풀기"
  found: 2 passed — unlock-only writes exactly 1 document_update row (and 0 amount rows); unlock+supply writes document_update 1 + evidence_record_amount_change 1 in one tx; locked doc writes 0. Default settings path (no deps) exercised.
  implication: action-log write required by PLAN works under default settings; code-level H "no recordAction" eliminated
- timestamp: 2026-10-20T15:47Z
  checked: repositories/evidence-record-detail.ts:85-118 listRecordHistory
  found: panel history = registration + links + action_log rows WHERE document_id = id AND action_type = 'evidence_record_amount_change' only (:115)
  implication: panel never shows the unlock — matches PLAN :50/:207/:271 and UI-SPEC :476 enumeration (등록·붙임·뗌·금액); conflicts only with UI-SPEC :471 wording
- timestamp: 2026-10-20T15:50Z
  checked: db/schema/evidence-records.ts (tables evidence_import_batches, evidence_records, evidence_record_links), clearNeedsCheckIfVersionMatches :47-53, updateAmountIfVersionMatches :37
  found: needs_check set to NULL on the row (reason text not kept on row); no per-record history table; only trace is action_log document_update detail.needsCheck. Permission: authedActionClient + can(evidence.intake, write) at amount.ts:145 (integration test asserts ForbiddenError)
  implication: if document_update is switched off in 기록할 행동 종류, the unlock leaves no trace anywhere

## Eliminated
- hypothesis: clearNeedsCheck branch (amount.ts:212-213) has no recordAction, so unlock is never logged
  evidence: amount.ts:215-221 calls recordAction(document_update) for every clearNeedsCheck; integration test asserts the row (evidence-amount.test.ts:402, :412)
  timestamp: 2026-10-20T15:45Z
- hypothesis: deployed staging build predates the log call
  evidence: git blame amount.ts:212-222 = cf9ce69 (#253), ancestor of deployed 9122c31
  timestamp: 2026-10-20T15:22Z

## Resolution
root_cause: Panel history omits the unlock by design — listRecordHistory (repositories/evidence-record-detail.ts:115) reads only evidence_record_amount_change, exactly as 06.1-07-PLAN :50/:207/:271 and UI-SPEC :476 enumerate; UAT read UI-SPEC :471 「이력에 둘 다 남는다」 as panel history while PLAN :259/:269 implemented it as two action-log records. The required action-log row (document_update, PLAN :174/:269/:388) IS written (amount.ts:215-221, integration-verified). The staging 「/admin/action-log 행 없음」 observation is not reproduced by code; remaining candidates are config (staging action_log.optional_types saved without document_update — optional type, record.ts:207-211) or lookup miss (row shows as 「문서 수정 · evidence_record <uuid>」 with UTC time 9h off panel KST).
fix: (diagnose only)
verification: targeted integration test 2/2 green
files_changed: []
