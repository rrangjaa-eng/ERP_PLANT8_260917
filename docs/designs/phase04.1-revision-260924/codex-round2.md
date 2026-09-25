Scope: Round 2 review of Phase 04.1 plans — round-1 finding fix verification + review of changed/tagged parts only
Timestamp: 2026-09-25 01:25 KST

All round-1 findings are resolved at the plan level, including the two accepted no-change findings. Two new test-contract blockers remain. `NN:line` below refers to `04.1-NN-PLAN.md`.

| Finding | Status | Evidence / reason |
|---|---|---|
| A/R01 | FIXED | [01:425](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:425): Drafter asserts error class only; no-name/time assertion applies only to unrelated PM. |
| A/R02 | FIXED | [03:213](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:213): Missing annual grants receive an implicit zero balance for overflow; both cases tested. |
| A/R03 | FIXED | [03:318](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:318): Log argument now uses `actionType`. |
| A/R04 | FIXED | No change required: [triage:12](/home/user/ERP_PLANT8_260917/docs/designs/phase04.1-revision-260924/codex-round1-triage.md:12) rejects the finding. |
| B/B1 | FIXED | [02:294](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:294): Event-aware terminal check permits drafter resubmission from rejected. |
| B/B2 | FIXED | [05:213](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:213): `now` propagates through detail loading to shared balance calculation. |
| B/W1 | FIXED | [02:302](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:302): `canResubmit` uses the same permission check as submission. |
| B/W2 | FIXED | [04:192](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:192): Ineffective controls disabled; values preserved; redundant guidance removed. |
| B/W3 | FIXED | [04:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:207): Both enumeration commands must succeed before output checks. |
| B/W4 | FIXED | [02:352](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:352): Public `resubmitLeave` receives the unrelated-user stale-version regression case. |
| B/N1 | FIXED | No change required: [triage:26](/home/user/ERP_PLANT8_260917/docs/designs/phase04.1-revision-260924/codex-round1-triage.md:26) marks already handled. |
| C/R1 | FIXED | [07:139](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:139): Already-current branch uses a deletion commit and ancestry verification. |
| C/R2 | FIXED | [03:320](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:320): Domain read, view permission, registered DTO and projection added. |
| C/R3 | FIXED | [01:526](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:526): Preview names pass through registered `approval.value` projection. |
| C/R4 | FIXED | [06:277](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:277): Uses the locked sequential Server Action decision and ordering E2E. |
| C/R5 | FIXED | [06:211](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:211), [06:332](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:332): Write-gated CTAs; unavailable monthly choice disabled or omitted. |
| C/R6 | FIXED | [06:332](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:332): Previous-year and current-year links replace manual URL editing. |
| C/R7 | FIXED | [07:185](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:185): Registration companions and projection-before-formatting documented. |
| C/R8 | FIXED | [06:213](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:213): Accepted date-change retry uses fresh fixtures; boundary calculations remain injected tests. |
| C/R9 | FIXED | [06:61](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:61): Truth explicitly scopes loading to `/leave`; administrator failures use existing boundary. |
| C/R10 | FIXED | [07:152](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:152): Generator exit code checked independently of output. |

New issues introduced by the changes:

- [BLOCKER] CX2-01 — [03:300](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:300) — The newly created read-only role receives only menu permission but must receive all six adjustment fields. Every field requires `leave.value` ([03:320](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:320)); absent visibility rows return false ([visible.ts:22](/home/user/ERP_PLANT8_260917/domain/permissions/visible.ts:22)). The specified fixture therefore returns empty objects. **Fix:** explicitly enable `leave.value` for the positive fixture; add a hidden-visibility case asserting absence of reasons and other fields.

- [BLOCKER] CX2-02 — [06:268](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:268) — Preview E2E explicitly creates no visibility rows yet expects role labels. Labels and `skipped` require `role.value` ([01:526](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:526)), so these disappear too; `staffDefault` does not grant visibility to newly created roles. **Fix:** enable `role.value` explicitly while keeping `approval.value` hidden; separately specify rendering when both are hidden.

- [WARNING] CX2-03 — [06:327](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:327) — Tests require a disabled monthly option, but [06:332](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:332) requires removing it when the shared Select lacks option disabling—which it currently does ([Select.tsx:9](/home/user/ERP_PLANT8_260917/ui/select/Select.tsx:9)). **Fix:** test option absence for this fallback and restoration after a valid hire date; normalize an already-selected monthly value to annual when it becomes unavailable.

VERDICT: 2 blockers
