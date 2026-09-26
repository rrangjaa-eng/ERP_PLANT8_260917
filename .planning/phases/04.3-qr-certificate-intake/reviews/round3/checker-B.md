# Checker r3 — shard B (plans 03, 04, 05, 06) — prior findings + changed lines only

Diff: 41c47e4..4782585. gsd verify plan-structure: 03/04/05/06 all valid, 0 errors, 0 warnings (tasks 2/4/2/3).
Result: 0 blocker, 3 warnings, 3 info.

## Prior findings (round 2)
| ID | Status | Evidence |
|---|---|---|
| checker B1 PNG cap 200KB vs 184,320 | RESOLVED | 02:369, 02:510; 06:189-190 |
| checker W1 idem map shape | RESOLVED (03 side) | 03:146, 03:206 cite the 02 map shape `{o,r,ip,at}` / `{o,r,p,until,ip,at}` |
| checker W2 purge clears traces | RESOLVED | 12:36, 12:183 (also clears hard_locked_at / cumulative) |
| checker B2 PM certs.events perms before 09 | RESOLVED (see W-1) | 04:225 (integration upsertPermission), 04:366-368 (E2E grant/restore) |
| checker W3 fakebin `storage buckets` | RESOLVED | 05:183, files_modified, acceptance 05:212 |
| checker W4 04 TDD order | RESOLVED | 04:181, 04:227, 04:282 (pure create-form-rules first), 04:348 |
| checker W5 ink measure | RESOLVED | 06:47, 06:189 shared `signature-ink.ts`; 06:167 round-trip case; 06:316 pad imports it |
| checker W6 scope | PARTIAL | 04 split into 4 tasks, but files grew to 27; 06 = 21 files (W-3) |
| checker W7 (f) route | RESOLVED | 04:368 one route (domain createEvent with PM viewer) |
| info "여덟" / E5 kind / replay after submit | RESOLVED | 03:271 lists eight; 06:203 `saved`; 03:61, 03:212 |
| codex-B 1 deployer lacks storage role | RESOLVED (see W-2) | 05:27, 05:44, 05:185, 05:190 fail-fast before deploy_service |
| codex-B 2 DbOrTx delete | RESOLVED | 02:359 owns widening (RED→GREEN); 06:153 precondition; 06:176 rollback test |
| codex-B 3 = B2 | RESOLVED | as above |
| codex-B 4 cumulative lock | RESOLVED | 03:38-40, 03:121, 03:179-191, 03:213, 03:221, 03:301-302; 10:54-55; 02:104 schema |
| codex-B 5 replay after key rotation | RESOLVED | 03:60, 03:212 (decrypt fail -> expiredProof, no reissue), 03:247 |
| codex minors: expired key replay | RESOLVED | 03:183 |

Owner-decision compliance (03): fixed 20 constant, not a setting (03:38, 03:245); columns named per decision (03:146); block = two lines + secondary 「잠금 확인」, tabindex=-1, no aria-live (03:40, 03:301, E2E 03:277); recheck returns only hardLocked|shortLocked{unlockAt,remainingSec}|open, no submission (03:190, 03:221, 03:279 asserts no E6-a); unlock in 10 with log (10:55, 10:195). Hard lock evaluated before submitted/short lock (03:213, 03:191). OK.

Verify-command paths: every path either exists or is in some plan's files_modified (02/03/04/05/06). OK.
Dependencies: 03/04/05 wave 3 on 02; 06 wave 4 on 03,04 — consistent. 06 does not list 05 but uses signature store via 02 interface — unchanged from r2.

## Warnings
W-1 [cross-plan/test isolation] 04:366 (f-0) E2E mutates the shared `role-pm` permission rows during an E2E run. The repo explicitly forbids this: test/e2e/permissions-grid.spec.ts:15-18 and test/e2e/code-tables-write-gate.spec.ts:14-16 record that changing role-pm permissions flips other workers' specs (8/8 repro). `certs` project being workers=1 does not serialise it against other projects. Required: E2E PM-scope cases must not change shared role permissions. Example fix: temp role via insertRole + setPermissionCell (existing precedent), or if the "own events only" scope is keyed to role-pm, say so and justify. The integration grant (04:225) is fine (TRUNCATE per test).

W-2 [least privilege] 05:185, 05:237 grant project-level `roles/storage.admin` to gha-deployer. The rationale (custom role with setIamPolicy can self-grant) holds for a plain custom role, but ignores the narrower route: an IAM condition on the binding (`resource.name.startsWith("projects/_/buckets/<cert bucket>")`) scopes create/update/setIamPolicy and object access to the one bucket, so the deployer does not get read/delete on every current and future bucket in the project (backups, exports). ensure_cert_bucket needs only buckets.create/get/update/getIamPolicy/setIamPolicy on that bucket. Required: deployer storage rights limited to the cert bucket(s) or T-04.3-111 records why a conditioned binding was rejected. Update user_setup command (05:27) and bootstrap test (05:176) together.

W-3 [scope] 04 = 4 tasks / 27 files, 06 = 3 tasks / 21 files (threshold 15). Carried from r2 W6, not closed by the task split. Example fix: move 04 Task 4 (I3 detail + E2E) to its own plan.

## Info
I-1 06:167/06:47 "24/23 boundary" holds only for the synthetic rectangle; a real canvas stroke with round caps + anti-aliasing (alpha>0 edge pixels) makes a logical-23 line exceed 288 on the client. Client/server stay consistent (same function on same PNG), so only the documented meaning is off — reword as "ink pixels ≥ 288", not "24 logical length".
I-2 03:277 asserts 1차 `aria-describedby` "두 줄의 id"; 03:40/301 and UI-SPEC:195 say the group id. Align the E2E to the group id.
I-3 UI-SPEC front matter still `status: draft` (UI-SPEC:4, revision note "재검토 대기"); 03 depends on its 「E3 누적 잠김」 strings. §7 wording in changed lines passes (two lines, action-oriented 2행, secondary 「잠금 확인」, no counts/timers).
