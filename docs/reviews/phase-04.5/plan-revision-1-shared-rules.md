# Phase 04.5 plan revision 1 — shared rules for the three parallel revision planners

Three planners revise disjoint plan files at the same time. Edit ONLY the files your group owns.

## Write-as-you-go (mandatory)
Resolve findings one at a time. As soon as you decide a finding, write that change to the plan file with Edit, then move to the next finding. Do not collect all decisions in your head and write at the end. Do not re-read the whole repo; verify only the file:line evidence a finding cites.

## Do not commit
The orchestrator commits all groups together. Do not run `git commit`, `git add`, or the gsd commit tool.

## Cross-group decisions (fixed — apply as written)
1. **Plan 01 split.** Plan 01 becomes a narrow tracer (migration → field-definition create in one transaction with visibility rows → create action → minimal admin page/form → vendor form shows `label`). The rest of old plan 01 (admin index link + SYSTEM.md menu table/order test, leak-scan wiring for `FieldDefinitionAdminDto`, full-form error/name-reservation UI, restore-link permission logic, and anything else needed to get plan 01 under 15 files) moves to a NEW plan `04.5-08-PLAN.md` (「플랜 01 완성」). Group A writes both.
2. **New wave layout** (every group updates its own plans' `wave` and `depends_on` to match):
   - 01: wave 1, depends_on []
   - 08: wave 2, depends_on ["04.5-01"]
   - 02: wave 3, depends_on ["04.5-08"]
   - 03: wave 3, depends_on ["04.5-08"]
   - 04: wave 4, depends_on ["04.5-02", "04.5-03"]
   - 05: wave 4, depends_on ["04.5-03"]
   - 06: wave 5, depends_on ["04.5-05", "04.5-02"]
   - 07: wave 6, depends_on ["04.5-04", "04.5-06"]
   Same-wave pairs (02/03, 04/05) must still share no file in `files_modified`.
3. **Shared test environment serialization (Codex #5).** Every verify/acceptance command that touches the shared test DB (`erp_test`, integration tests, `db:reset:test`, migrations), the E2E server port 3100, or `next build` is prefixed with `flock /tmp/plant8-erp-test.lock ` so parallel executors run them one at a time. Unit tests and lint/typecheck need no lock. Keep the `<fails_when>` line after each `<automated>` command.
4. **Test DB prep order (Codex #4)**, used wherever a plan prepares a DB for E2E or DOM audit: `pnpm db:reset:test` (creates an empty DB) → migrations → base seed → the plan's own fixture seed. Follow how `test/e2e/global-setup.ts` does it (lines ~14–46) and say so; do not claim `db:dev` recreates a DB.
5. **`insertVisibilityIfAbsent` keeps an optional `tx` parameter** and uses it in the query. Group A adds a rollback test in the create path (a visibility-row insert fails midway → neither the definition nor any visibility row remains). Group C's merge ritual in 07 preserves the optional `tx` when reconciling with Phase 4's 04-20 two-argument version.
6. **Deviations from the approved UI-SPEC** (RTL → source scan + E2E, test (b) → source check + domain test (a)) are listed in the owning plan's "OPEN — /plan-design-review" list, not only in SUMMARY.
7. Constraints that still hold: Phase 4 parallel work (append-only shared files; `domain/permissions/project.ts`, `dto-registry.ts`, `domain/projects/*`, `domain/quotes/*` untouched; `listFieldDefinitions` unchanged); no fixed migration number; STATE.md untouched; no new dependencies; Korean prose; every `<automated>` followed by `<fails_when>`; every plan keeps its `<threat_model>` and "Artifacts this phase produces" section.

## Inputs
- Plans: /home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/*-PLAN.md (committed b6979b5)
- CONTEXT, RESEARCH, UI-SPEC (approved rev 3), PATTERNS in the same directory
- Codex findings: /tmp/claude-0/-home-user-ERP-PLANT8-260917/9f4265f6-70ea-581a-9907-74d64d5a7ded/scratchpad/codex-plan-findings1.md
- Checker issues are quoted in your prompt.

## When done
Run on your own plan files: `node .claude/gsd-core/bin/gsd-tools.cjs query frontmatter.validate <file> --schema plan` and `node .claude/gsd-core/bin/gsd-tools.cjs query verify.plan-structure <file>` (use the same verbs the original planner used if these names differ). Return `## GROUP <X> REVISED` with: each finding id → what changed (file + section).
