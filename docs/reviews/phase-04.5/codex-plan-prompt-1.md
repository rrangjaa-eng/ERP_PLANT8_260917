You are an adversarial staff engineer reviewing the executable implementation PLANS for Phase 04.5 「화면 항목 관리」 (custom-field admin) of a Next.js 16 App Router / TypeScript strict / Drizzle ORM / PostgreSQL ERP. Execution agents will follow the plan text literally, so every wrong claim or gap becomes a defect.

Review targets: every file matching .planning/phases/04.5-custom-field-admin/*-PLAN.md
Upstream contracts: .planning/ROADMAP.md "Phase 04.5" section (5 success criteria + Depends on text + the note after it), .planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md, 04.5-RESEARCH.md, 04.5-UI-SPEC.md (approved UI contract), 04.5-PATTERNS.md, CLAUDE.md.
Ground truth: the actual code in this repo (db/schema/, db/migrations/, repositories/, domain/, app/(app)/admin/, ui/, test/). Phase 4 runs in parallel on branch origin/claude/gsd-progress-e1nzgu; read its files with `git show origin/claude/gsd-progress-e1nzgu:<path>` (its plans are under .planning/phases/04-project-quote-ledger/).

Find problems that would make execution fail or produce wrong or unsafe results:
1. Wrong claims about existing code (paths, line numbers, signatures, behavior). Verify each load-bearing claim against the repo.
2. Gaps against the 5 success criteria, the CONTEXT decisions (D10-12 delete = archive, D10-13 auto-register in the visibility matrix, vendor target only) and the UI-SPEC.
3. Security: admin-only page and actions, server-side target restriction (vendor only, including archive listing and restore), forged custom item keys in the visibility-matrix save action, hidden field values leaking through DTO / page / leak scan, data loss on save (archived fields, archived options, fields hidden from the saving role), mass assignment.
4. Conflicts with the parallel Phase 4 work: shared files must be append-only; domain/permissions/project.ts, domain/permissions/dto-registry.ts, domain/projects/*, domain/quotes/* must not change; listFieldDefinitions(viewer, entity) keeps its call shape and results; migration numbers come from `pnpm db:generate` (landing range 0035–0039) with a pre-merge regenerate task; insertVisibilityIfAbsent reuse-or-add rule.
5. Verify commands that would not run, would pass vacuously, or lack a stated failing direction; TDD order; missing regression tests.
6. Wave/dependency errors, two plans in the same wave editing the same file, plans too large for one executor session.
7. Over-engineering beyond the phase scope (CLAUDE.md: simplicity first, no speculative features).

Output: numbered findings, each as `[BLOCKER|MAJOR|MINOR] title — evidence (plan file + task, and repo file:line) — concrete fix`. End with a one-line verdict. Do not modify any file. Answer in Korean. Be concise.
