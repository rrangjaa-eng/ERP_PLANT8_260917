# Codex FINAL Review Round 2 — Shard C (04.1-06, 04.1-07, cross-plan, VALIDATION.md) — commit 7d0a378
Generated: 2026-09-25 01:39 KST

`NN` below means `.planning/phases/04.1-approvals-leave/04.1-NN-PLAN.md`.

- [BLOCKER] C-F2-01 — 06:333,335; 03:217 — Retired employees’ displayed balance always uses their retirement year, but annual adjustments use the URL-selected year. Opening a person who retired last year with no `?year` displays last year’s balance while writing this year’s adjustment; the displayed balance cannot reflect that correction. — Align the displayed balance year, history year, and adjustment target. Preserve the retirement-year rule by disabling mismatched-year adjustments and linking to the retirement year. Add an E2E covering this case.

- [WARNING] C-F2-02 — 06:331,335; app/(app)/admin/people/actions.ts:40–42 — New date/adjustment actions specify domain writes but no page invalidation or client refresh, although monthly-option restoration and balance/history updates require server rerendering. The existing role-change action explicitly invalidates the detail page. — Require detail-page revalidation after each successful mutation and assert updates without manual reload.

- [WARNING] C-F2-03 — 06:270; 04.1-VALIDATION.md:110 — The preview-order test releases the older response without ensuring the newer response has already completed. A broken parallel implementation can therefore finish in normal order and pass. — Test the adopted serialization guarantee directly: while the first response is held, assert the second request has not dispatched; then release it and verify the latest result.

- [WARNING] C-F2-04 — 07:150 — `test -z "$(git diff …)"` discards Git’s exit status. An invalid `PHASE_BASE` produces empty stdout and can pass the deletion check despite Git failing. — Capture each diff with `D=$(git diff …) && test -z "$D"`; verify an invalid reference fails the command.

VERDICT: 1 blockers