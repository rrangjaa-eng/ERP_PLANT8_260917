# Checker r3 — shard C (04.3-07..12)

Scope: round-2 findings (checker-C, codex-C, codex-AC-matched-sonnet) + diff 41c47e4..4782585 on plans 07-12.
Structure: `verify plan-structure` valid, 0 errors/0 warnings for 07,08,09,10,11,12 (tasks 3/2/2/3/3/3).
Waves: 07/08/09 w4 · 10/11 w5 · 12 w6 (depends 06,07,08,10) · 13 w7 (depends all). Acyclic, consistent.
Verify paths: every test/script path in `<automated>` exists or is created by a phase plan.

## Prior findings
| ID | Status | Evidence |
|---|---|---|
| chk W1 scope 07/08/10 >15 files | PARTIAL (accepted in writing) | 10:144 explicit acceptance; files 07=19, 08=19, 10=23 (grew) |
| chk W2 openssl-not-called unobservable | RESOLVED | 08:212 SHA-256 of original key compared |
| chk W3 / codex C5 reveal log second pool conn | RESOLVED | 07:160-163 appendCertActionLogTx same tx + DB_POOL_MAX concurrency test |
| chk W4 cumulative cap/staff unlock | RESOLVED | owner decision; 10:54-56, 226-233; 12:36 |
| chk I1 threat IDs reused | NOT RESOLVED (info) | T-04.3-16 at 07:325 and 10:417; T-04.3-22 at 11:263 |
| chk I2 gate before requireSession | RESOLVED | 07:44, 11:40 |
| chk I3 shared test file same wave | unchanged, fine | |
| codex C1 v2 not on service before rotate | RESOLVED | 08:240, 217-218, 247, T-04.3-130 |
| codex C2 PM seed vs admin-nav | RESOLVED | 09:35, 143 precondition (cert-setup depends desktop+mobile-375) |
| codex C3 project() not used | RESOLVED | 07:40, 103, 155; 11 same |
| codex C4 reveal bypasses can() | RESOLVED | 07:39, 191-192 |
| codex C6 closeEvent log after commit | RESOLVED | 10:123, 142 status_change in same tx |
| codex C7 TDD order 08 T2 / 09 T2 | RESOLVED | 08 ① RED … ⑤ GREEN; 09:163-169, 195 |
| codex C8 print server error boundary | RESOLVED | 11:15, 42, 64 error.tsx |

## New findings on changed lines

### WARNING 1 — UI contract: 「잠금 풀기 필요」 only while 접수 중
- Plan 10:194, 234, 292, 313. UI-SPEC:243 says the 2nd line `잠금 풀기 필요` shows only while the event is open; once closed the row shows `미제출` only.
- The plan sends `hardLockedAt` for every unsubmitted hard-locked row whatever the event state, and ②-d / winners-view draw `잠김 + 잠금 풀기 필요` from `hardLockedAt` alone. winners-view is the table for closed events, so a closed event would show 「잠금 풀기 필요」 with no button to press. That breaks the spec, and under CLAUDE.md §7 it tells the user to do something they cannot do.
- Fix: send `hardLockedAt` (or a `hardLocked` display flag) only while the event is open, draw `미제출` otherwise, and add an integration assertion plus an E2E assertion on a closed event.

### WARNING 2 — scope (carried over)
- Files: 07=19, 08=19, 10=23 (the table's limit is 15). The planner accepted this in writing (10:144). Plan 10 grew by the unlock slice. Proceed only if the orchestrator accepts it. Possible split: move the unlock UI and E2E (Task 2/3 unlock parts) into a small plan in wave 6.

### INFO 1 — plan 08 keeps v1 wrapped key on the service permanently (08:247 step 4)
- This is sound for restoring backups and for rollback. The plan keeps the plaintext secret and adds no delete or disable command (08:241), which matches "leave a way back". The gap: the runbook has no path for "rotation because v1 was compromised" (for example, turning off the v1 KMS key version after re-encrypting backups). Add one line to OPERATIONS §9. This does not block.

### INFO 2 — threat ID reuse (prior I1) still present.

### Checked and OK (changed lines)
- unlockWinner (10:226-233): gate → can(write) → scope → event FOR UPDATE → row FOR UPDATE (same lock order as verifyLast4) → replay check through cert_unlock log → closed → stale(row) → conditional reset with a millisecond-matched stamp → log in the same tx → commit. Version/updated_by are not bumped (10:197, 209). Replay keeps new failures (10:198). Concurrent calls log once (10:199). Rollback on log failure (10:201). This matches the owner decision.
- cert_unlock is registered as always-on (10:237). appendCertActionLogTx union is extended only by 10 (10:211); the contract with 07 holds.
- UI outcomes (10:280-307): stale → close dialog, no toast, redraw row from server `row`. unknown → modal sentence, and a resend with the same stamp succeeds. This matches UI-SPEC:247-250. Wording is minimal and action-oriented (§7 ok).
- Purge (12:36, 136, 183, T-04.3-131): the verify columns and hard_locked_at are set to null and cumulative is set to 0. failed_attempts and locked_until are not listed. They are harmless after purge (the row cannot be unlocked or verified), and the owner wording is "lock/verify columns". Optional: add them to the same column list for completeness.

## Structured issues
```yaml
- plan: "04.3-10"
  dimension: context_compliance
  severity: warning
  required_property: "The `잠금 풀기 필요` second line renders only while the event is 접수 중; closed events show `미제출` (UI-SPEC:243)"
  description: "10:234/292/313 derive the line from hardLockedAt alone; winners-view (closed events) draws it with 'same rule'"
  fix_hint: "Gate hardLockedAt/hard-lock display on event open in getEventDetail; test closed-event row shows 미제출"
- plan: "04.3-07,04.3-08,04.3-10"
  dimension: scope_sanity
  severity: warning
  required_property: "Each plan stays within per-plan context budget (<15 files)"
  description: "files_modified 19/19/23; accepted in 10:144"
  fix_hint: "Accept explicitly or split unlock UI/E2E out of 10"
- plan: "04.3-08"
  dimension: key_links_planned
  severity: info
  required_property: "Runbook covers retiring v1 when rotation is compromise-driven"
  description: "08:247 (4) keeps v1 forever; no compromise path"
  fix_hint: "One runbook line for disabling v1 KMS key version after backup re-encryption"
- plan: "04.3-07,04.3-10,04.3-11"
  dimension: verification_derivation
  severity: info
  required_property: "Threat IDs are unique across plans"
  description: "T-04.3-16 in 07:325 & 10:417; T-04.3-22 shared with 01"
  fix_hint: "Suffix per-plan variants"
```

## Recommendation
0 blockers, 2 warnings, 2 info. Fix W1 (a small DTO and test change in 10). Accept W2 or split.
