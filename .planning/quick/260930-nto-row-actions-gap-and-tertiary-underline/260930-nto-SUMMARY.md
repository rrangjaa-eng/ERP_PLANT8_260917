---
phase: quick-260930-nto
plan: 01
subsystem: ui
tags: [css, design-system, e2e, tertiary-button, row-actions]
requires:
  - phase: quick-260930-f3l
    provides: ".rowActions rule (people.module.css, PR #108) and FINDING-001/002 measurements"
provides:
  - "ui/button .tertiary glyph underline (text-decoration, offset 2px, hover 1px -> 2px, disabled color --line)"
  - ".rowActions --s-4 gap on vendors, corp-cards, code-tables row action cells"
  - "test/e2e/row-actions-helpers.ts shared gap / overflow measurement"
key-files:
  created:
    - test/e2e/row-actions-helpers.ts
  modified:
    - ui/button/Button.module.css
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/vendors/vendors.module.css
    - app/(app)/admin/corp-cards/page.tsx
    - app/(app)/admin/corp-cards/corp-cards.module.css
    - app/(app)/admin/code-tables/page.tsx
    - app/(app)/admin/code-tables/code-tables.module.css
    - docs/design/checks/2026-09-30-관리표-행행동-간격-3차-밑줄.md
    - test/unit/app/tertiary-underline-css.test.ts
key-decisions:
  - "Four per-module .rowActions copies (people, vendors, corp-cards, code-tables) kept; consolidation into shared CSS is a user decision, not done."
  - "org/roles screens out of scope (one action per row)."
  - "Seeded E2E rows are cleaned up by hide / deactivate, not archive."
requirements-completed: [260930-f3l-FINDING-001, 260930-f3l-FINDING-002]
commits: 5
plan_head_before: 9f0bd3d488080452408c112581156566c2057f2c
actuals:
  tokens: 60000
  tasks: 3
  commits: 5
status: complete
---

# Quick 260930-nto: Row action gap + tertiary glyph underline Summary

Shared `ui/button` `.tertiary` now draws a glyph underline (FINDING-002) and the 거래처 / 법인카드 / 코드표 row actions sit 16px (`--s-4`) apart via the PR #108 `.rowActions` rule (FINDING-001).

## Commits
- 7f6b72e test: tertiary Button RED (unit sweep 22 -> 23 + 3 unit rules, phone 375 underline, PC 1280 hover height + D4 equality, revenue-section assertion)
- 90631d9 test: row action gap RED (helper + five specs)
- ff64212 fix: Button.module.css glyph underline + filled design-gate checklist
- 89f19f8 fix: three page.tsx (span.rowActions, 수정 link .rowLink) + three module CSS
- 3655ab5 test: cleanup hides / deactivates seeded rows instead of archiving (see Deviations)

## Evidence (CI=true, production build)
- RED: Button unit 4/5 failed; E2E text-decoration-line none vs underline, thickness auto, revenue underline false. Gap RED: vendors 1280/768 horizontal 0px, corp-cards 1280 horizontal 0px and 768/700 vertical 6.4px, code-tables 1280/768/700 vertical 3.2px, phone vertical 0px. Confirm-state / normal-state overflow assertions already passed before the fix (regression guards).
- GREEN: unit 2265/2265; gap specs desktop 38 passed, phone 11 passed; measured gap vendors 1280/768/700 = 16px horizontal, 375 = 16px vertical (wrapped).
- D4 (1280, vendors row, 「수정」 link = 「숨기기」 Button): font-size 12px, weight 600, color rgb(0, 84, 70), decoration-line underline, thickness 1px, underline-offset 2px, decoration-color rgb(0, 84, 70).
- Cheap gates: lint 0, typecheck 0, test:unit 170 files / 2265 tests, lint:sql 0 issues, build exit 0.
- Full `pnpm test:e2e:ci`: 657 passed / 0 failed (second run, after the cleanup commit).

## Deviations from Plan
**1. [Rule 1 - Test hygiene] Extra commit 3655ab5.** The first full-suite run failed once: `table-row-min.spec.ts` 코드표 @1280 lowest row 35.39px < 36px (text-only row height). Not reproduced in three isolated reruns (with archive cleanup), nor after switching new specs to hide / deactivate cleanup; the following full run was 657/657. Root cause is unproven (hypothesis: a text-only row from an archived / no-write state visible during a parallel worker; archived rows were not visible in a later direct measurement). Not proven pre-existing on the base commit. Conservative fix: seeded rows are hidden / deactivated rather than archived.

**2. Playwright dependency.** `pnpm test:e2e <spec>` for mobile specs pulls the whole desktop project via `dependencies`; targeted runs used `--project=desktop <specs>` and `--project=mobile-375 --no-deps <specs>`.

## Known Stubs
None.

## Threat Flags
None (CSS / markup only; `canWrite` / `canArchive` / `archivedAt` conditions unchanged).

## Notes for orchestrator
- Post-build gates (/review, /design-review + independent DOM audit, /qa) and TODOS.md (R3, C1/T7) are the orchestrator's.
- Unproven flake to consider in the PR 「사용자 결정 필요」: table-row-min 코드표 35.39px (see Deviations 1).

## Self-Check: PASSED
