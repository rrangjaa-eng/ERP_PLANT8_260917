You are an adversarial UI/UX plan reviewer (output in Korean, concise markdown). Read-only. Repo at CWD (branch head 41a5fe2). Plan dir: .planning/phases/07.1-carryover-followup/.

Context: The 07.1 phase plan passed a design review (Claude + Codex, final pass) and was merged to main (b9acdd8). An engineering review then raised findings (07.1-REVIEWS.md, notes/07.1-review/plan-eng/eng-review.md, decisions D-E1..E7 in notes/07.1-review/plan-eng/decisions.md) and a replan rewrote many plans. Diff of the screen plans vs main: /mnt/project-files/07.1-review/replan/design/screen-plans.patch (also `git diff b9acdd8 HEAD -- <plan>`). Prior design review records: /mnt/project-files/07.1-review/plan-design/design-review.md, /mnt/project-files/07.1-review/plan-design/final/final-review.md, notes/07.1-review/plan-design/final-check.md (prior findings F1-F5, B1, B2 all marked resolved).

Design rules: docs/design/SYSTEM.md (grep sections, do not read whole), docs/DESIGN.md, .claude/rules/frontend.md (usability principles: minimal copy - only errors/irreversible/locked states, minimal user decisions, one primary button, mobile rows max two lines, 44px touch targets, no new colors/fonts/radius - tokens only from docs/design/tokens.css, system deviations must go to DECISIONS.md then SYSTEM.md, no single-screen exceptions). UI-SPEC: .planning/phases/07.1-carryover-followup/07.1-UI-SPEC.md (NOT changed by the replan — check whether changed plans now contradict it).

Changed screen parts to check (plan number: change):
- 18: phone row-sheet tables and row-link tables one-line ellipsis (D-E7); secondaryText moved to front of collapsed line; purchase-request second line "실행가 초과" lost its emphasis color; checkbox wrapper inline-flex 44px. Stop branch: D-7106 expense number ellipsis at 320px.
- 19: HashFocus; /cards "등록" column P2 + collapsed-line summary; estimate total row split into 3 cells; Ctrl+E hint. Stop branch: PC total row height increase.
- 02: person/rank/vendor forms focus first error field; notification-rule days error.
- 15: SYSTEM SP-71-1 row-link table revision.
- 01: U-16 criterion "번호가 있는가" — wording differs from UI-SPEC W9 (~line 342).
- 09: evidence picker subtitle.  04: blocked candidate "날짜 다름 · {n}일".
- 14: headquarters field lockedReason, "본부 없음", log.  11: archived card display/filter.
- 13: action-log detail labels.  16: U-4 scope.  05: export button disabled + reason.

Tasks:
1. For each changed part: OK / BLOCKING / NOTE. Check against SYSTEM.md, UI-SPEC, usability rules, and executability (referenced files/lines/components/tokens exist in the repo — verify with grep).
2. Confirm prior resolved findings (F1-F5, B1, B2) did not regress in the replan.
3. Check that any copy added is justified (errors/irreversible/locked only), no new decisions forced on users, emphasis-color removal on "실행가 초과" is consistent with SYSTEM status color rules.
4. 260907 legacy comparison: plans should cite ERP_PLANT8_260907 file:line where behavior is ported; legacy clone is at /home/user/erp_plant8_260907. Flag only if a changed screen behavior contradicts legacy without a recorded decision.
A BLOCKING finding requires file:line evidence and must make execution impossible or violate SYSTEM.md / DESIGN.md / CLAUDE.md / frontend.md rules. Everything else is NOTE. Do not propose scope expansion. End with one line: "Recommendation: <action> because <reason>" and a final line "막는 문제: N건".
