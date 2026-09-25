Shard C scope: 04.1-06-PLAN.md, 04.1-07-PLAN.md, plus cross-plan consistency across all 7 plans and 04.1-VALIDATION.md and ROADMAP.md Phase 04.1 section
Run: 2026-09-25 00:56 KST

I’ll review plans 06–07 against the locked definitions and prior review, then check all seven plans, validation, and the roadmap for contradictions. I’ll avoid the excluded directories.

Plans 06–07 explicitly address the earlier menu, year-selection, and merge-review findings. I’m now checking the revised contracts and verification commands for gaps, including date-boundary cases and permission handling.

I found a merge case that plan 07 cannot complete: when `origin/main` is already an ancestor, Git creates no merge commit, but the plan requires a second parent. The current checkout is in that state. I also found a missing domain/DTO contract for adjustment-history reads and smaller UI and documentation inconsistencies.

- [BLOCKER] R1 -- 04.1-07-PLAN.md:138,147 -- If fetched `origin/main` is already an ancestor of HEAD, `git merge --no-ff --no-commit` creates no merge commit. The required second-parent verification then fails. The current checkout already satisfies this ancestry condition. -- Add an explicit already-up-to-date path for migration regeneration; verify against a recorded main SHA without requiring a synthetic merge.

- [BLOCKER] R2 -- 04.1-06-PLAN.md:320; 04.1-03-PLAN.md:205,211 -- Adjustment-history rendering has no planned domain read service or registered/projected DTO; only repository `listLeaveAdjustments` exists. Calling it from the page violates `eslint.config.mjs:45`; forwarding raw records bypasses information visibility. -- Define a permission-checked, DTO-projected history service, register its fields, and test hidden adjustment reasons plus denied access.

- [BLOCKER] R3 -- 04.1-06-PLAN.md:261,263,362; 04.1-01-PLAN.md:84 -- `previewRoute` returns approver names directly, guarded only by `leave:write`. No `approval.value` projection or preview DTO is specified, despite the phase-wide DTO requirement. A writer with approval information hidden can still receive names. -- Project/register preview output before serialization; test `leave:write=true`, `approval.value=false`, including a positive visibility control.

- [WARNING] R4 -- 04.1-06-PLAN.md:165,265 -- Change-triggered previews retain previous values but have no response-order guard. A slow earlier request can overwrite the latest dates’ balance and deduction preview. -- Associate responses with input revisions and discard stale responses; test reversed completion order.

- [WARNING] R5 -- 04.1-06-PLAN.md:204,318 -- Impossible actions remain selectable: view-only users get “연차 신청,” and administrators can select monthly adjustments without a hire date or after expiry, although 04.1-03-PLAN.md:171 rejects them. -- Hide the submission CTA without write permission; default to annual adjustments and disable unavailable monthly adjustments with one-line reasons.

- [WARNING] R6 -- 04.1-06-PLAN.md:318,340 -- Past-year correction requires manually editing `?year=`, while the plan expressly forbids a year selector and supplies no navigation to previous years. The workflow is not discoverable without instructions. -- Provide a compact year control or a visible link into the selected-year detail.

- [WARNING] R7 -- 04.1-07-PLAN.md:184; 04.1-05-PLAN.md:211 -- The Phase 5 registration contract omits required `buildDetailRows` and the projection-before-string-formatting order introduced by ENG-17. Following the documented signature fails registration or encourages bypassing the protection. -- Document the final signature and both required companions to `loadDetails`.

- [WARNING] R8 -- 04.1-06-PLAN.md:155,192,193,305 -- Relative dates avoid fixed-year failures but still use independent wall clocks in the test and server. Crossing Seoul midnight/month-end can change accrual or turn “hire today, accrued zero” into another state. -- Share a fixed test clock with server calculations and exercise year/month boundaries explicitly.

- [WARNING] R9 -- 04.1-06-PLAN.md:60,294,320 -- The administrator leave section promises skeleton loading and a one-line retry error, but Task 3 specifies neither implementation nor verification for those states. -- Add an explicit loading/error boundary and failure/retry coverage.

- [WARNING] R10 -- 04.1-07-PLAN.md:151 -- The schema-check pipeline tests `grep`’s status, not `db:generate`’s exit status; without `pipefail`, matching output can mask generation failure. -- Capture and check the generator exit code before asserting “No schema changes.”

VERDICT: 3 blockers