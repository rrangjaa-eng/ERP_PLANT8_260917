---
phase: quick-260930-nto
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - ui/button/Button.module.css
  - app/(app)/admin/vendors/page.tsx
  - app/(app)/admin/vendors/vendors.module.css
  - app/(app)/admin/corp-cards/page.tsx
  - app/(app)/admin/corp-cards/corp-cards.module.css
  - app/(app)/admin/code-tables/page.tsx
  - app/(app)/admin/code-tables/code-tables.module.css
  - test/unit/app/tertiary-underline-css.test.ts
  - test/e2e/row-actions-helpers.ts
  - test/e2e/vendors.spec.ts
  - test/e2e/corp-cards.spec.ts
  - test/e2e/code-tables.spec.ts
  - test/e2e/mobile-vendors.spec.ts
  - test/e2e/mobile-corp-cards.spec.ts
  - test/e2e/mobile-design-review-p2.spec.ts
  - test/e2e/design-review-p2.spec.ts
  - test/e2e/revenue-section.spec.ts
  - docs/design/checks/2026-09-30-관리표-행행동-간격-3차-밑줄.md
autonomous: true
requirements: [260930-f3l-FINDING-001, 260930-f3l-FINDING-002]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "/admin/vendors · /admin/corp-cards · /admin/code-tables at 1280 and 768: every pair of adjacent row actions (수정 · 숨기기/비활성화 · 삭제) sits on one line with a horizontal gap >= --s-4 (16px); 「수정」 stays one text line"
    - "Phone 375 /admin/vendors · /admin/corp-cards: adjacent row actions are >= 16px apart (horizontal when on one line, vertical when wrapped) and each keeps a >= 44x44 box (code-tables action column is hidden < 700 by design — not measured on phone)"
    - "After pressing 「삭제」 (DeleteToArchive confirm state) the page and the table do not overflow horizontally on the three screens at 768 · 1024 · 1280, and on vendors · corp-cards at 320 · 375"
    - "Shared ui/button .tertiary draws its underline as a glyph underline: text-decoration-line underline, text-underline-offset 2px, border-bottom-style none; at 1280 hover thickens the underline 1px -> 2px without changing the box height; on phone 375 the underline sits under the glyphs of a >= 44x44 box"
    - "A disabled (aria-disabled) tertiary Button keeps its dimmed underline via text-decoration-color var(--line)"
    - "No new colors / tokens / radius / copy; people.module.css (PR #108) is unchanged"
  artifacts:
    - path: "ui/button/Button.module.css"
      provides: ".tertiary glyph underline + hover thickness + disabled underline color"
      contains: "text-underline-offset: var(--underline-offset)"
    - path: "app/(app)/admin/vendors/vendors.module.css"
      provides: ".rowActions (same name/values as people.module.css:164-179) + .rowLink nowrap"
      contains: "gap: var(--s-4)"
    - path: "app/(app)/admin/corp-cards/corp-cards.module.css"
      provides: ".rowActions + .rowLink nowrap"
      contains: "gap: var(--s-4)"
    - path: "app/(app)/admin/code-tables/code-tables.module.css"
      provides: ".rowActions"
      contains: "gap: var(--s-4)"
    - path: "test/e2e/row-actions-helpers.ts"
      provides: "shared gap measurement for adjacent row actions"
  key_links:
    - from: "app/(app)/admin/{vendors,corp-cards,code-tables}/page.tsx"
      to: "styles.rowActions"
      via: "<span className={styles.rowActions}> replacing the bare Fragment inside the actions <td>"
      pattern: "styles\\.rowActions"
    - from: "test/unit/app/tertiary-underline-css.test.ts"
      to: "ui/button/Button.module.css .tertiary"
      via: "sweep now counts .tertiary (floor raised to measured count) + explicit no-border-bottom assertion"
      pattern: "Button\\.module\\.css"
---

<objective>
Close the two follow-ups deferred from 04.4 (TODOS.md 「04.4 후속 이연」), measured in `.planning/quick/260930-f3l-04-4-follow-ups-people-action-log-hidden/260930-f3l-DESIGN-REVIEW.md`:
- FINDING-002 (medium): shared `ui/button` `.tertiary` underline is a `border-bottom` (drops to the bottom of the phone 44 box, 13.5px under the glyphs; hover grows the box 19 -> 20px). Make it a glyph underline like every other 3차 link (SYSTEM §4-4 · §7-1), following the ListEmpty precedent (`ui/list-empty/ListEmpty.module.css:22-25`, FINDING-005).
- FINDING-001 (high): row actions on 거래처 · 법인카드 · 코드표 tables have 0px between them (「수정숨기기삭제」 reads as one word, 「삭제」 glued to its neighbour). Apply PR #108's `.rowActions` rule (`app/(app)/admin/people/people.module.css:164-179`, gap `--s-4`) to the three screens (SYSTEM §6-1, frontend.md 「화면 하나만 예외 금지」 · 「위험한 동작은 떨어뜨려 둔다」).

Purpose: same kind of action looks the same everywhere; dangerous 「삭제」 is separated.
Output: CSS/TSX fixes on 4 modules + 3 pages, RED->GREEN unit and CI=true E2E measurements, filled design-gate checklist.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
Read (not import): `.planning/quick/260930-f3l-04-4-follow-ups-people-action-log-hidden/260930-f3l-DESIGN-REVIEW.md` lines 39-75 (FINDING-001 · 002 only)
Read: `docs/design/checks/2026-09-30-관리표-행행동-간격-3차-밑줄.md` (checklist created by the orchestrator — fill it, do not create another)

Established facts (verified by planner on branch `ccr-e0753b24-rowactions-underline`, stacked on PR #108):
- `ui/button/Button.module.css:53-65`: `.tertiary` = height auto, padding 0, `border: 0`, `border-bottom: var(--line-w) solid var(--accent)`, background none, color accent, `white-space: nowrap`; hover `.tertiary:hover:not([aria-disabled="true"])` sets `border-bottom-width: var(--line-w-strong)`; `:73-82` phone @media gives it inline-flex + min 44x44 + padding 0 var(--s-2). `.btn` (:9-23) sets `text-decoration: none` at the same specificity earlier in the file, so a later `.tertiary` declaration wins. `.btn[aria-disabled="true"]` (:25-30) dims via `border-color: var(--line)` and `color: var(--faint)`.
- `app/(app)/admin/people/people.module.css:164-179`: `.rowActions { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: var(--s-4); }` + `@media (max-width: 699.98px) { .rowActions { flex-wrap: wrap; } }`. White-space must NOT go on the cell (confirm row overflowed 768 by 14.66px); the short link gets its own `white-space: nowrap` (global `overflow-wrap: anywhere` otherwise splits 「상」/「세」).
- Row action cells (bare Fragment inside `<td>`): `app/(app)/admin/vendors/page.tsx:161-174` (수정 Link `styles.toggle` · VendorHiddenToggle · VendorDeleteButton), `app/(app)/admin/corp-cards/page.tsx:181-196` (수정 Link `styles.toggle` · CorpCardActiveToggle · CorpCardDeleteButton), `app/(app)/admin/code-tables/page.tsx:168-176` (CodeItemActiveToggle · CodeItemDeleteButton).
- `.toggle` is NOT only the row 「수정」 link: also the 「숨김 포함/제외」 filter link, 「거래처 등록」/「법인카드 등록」 links, form 「취소」 links, and the code-tables table-picker links (`aria-current`). So `white-space: nowrap` goes on a NEW class `.rowLink` composed onto the row 「수정」 link only (composition precedent: `app/(app)/admin/archive/archive-table.tsx:66`).
- Code-tables action column is hidden below 700px (`test/e2e/mobile-code-tables.spec.ts` 「값·정렬·동작 열이 숨는다」) — code-tables gap is measured at 1280 · 768 only.
- Test sources to reuse: gap + one-line check `test/e2e/people.spec.ts:193-219` (`tokenNumber` local at :76); confirm-state overflow `test/e2e/people.spec.ts:221-258`; `noHorizontalOverflow` exported from `test/e2e/people-list-helpers.ts:58`; phone glyph-underline pattern `test/e2e/mobile-design-review-p2.spec.ts:6-25`; 320 viewport inside the mobile project via `test.use` (`test/e2e/mobile-people.spec.ts:122-123`); fast vendor seeding `insertVendor(SYSTEM_VIEWER, { name, normalizedName })` from `@/repositories/vendors` (see `test/e2e/design-principles.spec.ts`), UI registration in `test/e2e/mobile-vendors.spec.ts:18-31`; `cssColor` local in `test/e2e/revenue-section.spec.ts:147`.
- `test/e2e/revenue-section.spec.ts:397-404` asserts `borderBottomColor === --accent` for 3차 Buttons 「발행 줄 추가」「입금 줄 추가」 — becomes vacuous after the change.
- `test/e2e/design-principles.spec.ts:34` (warning-only) already classifies row actions as underline vs border — no change needed.
- `test/unit/app/tertiary-underline-css.test.ts`: sweep of app/ + ui/ `*.module.css`; `CHECKED_FLOOR = 22` (:37); comment :7 says ui/button .tertiary is outside the sweep. Hover match is `selector:hover` prefix, so `.tertiary:hover:not([aria-disabled="true"])` counts.
- Hooks (`.claude/hooks/plant8-skill-gate.sh`): editing app/ or ui/ requires the `design-gate` skill invoked in this session; editing code requires `test-driven-development`; after a failing test/build run a debug flag requires `systematic-debugging` before the next code edit; any commit containing app/ · ui/ .tsx/.css must include (or follow a branch commit of) a checklist in `docs/design/checks/` with NO `- [ ]` boxes and no empty 「근거:」.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Shared Button .tertiary glyph underline — RED unit + E2E, then GREEN CSS (FINDING-002)</name>
  <files>test/unit/app/tertiary-underline-css.test.ts, test/e2e/mobile-design-review-p2.spec.ts, test/e2e/design-review-p2.spec.ts, test/e2e/revenue-section.spec.ts, ui/button/Button.module.css</files>
  <behavior>
    - Unit: in `ui/button/Button.module.css` (comments stripped with the file's own `parseRules`), no rule whose selector starts with `.tertiary` declares any `border-bottom*` property; the `.tertiary` base rule matches the sweep's UNDERLINE, BASE_THICKNESS and OFFSET regexes; a `.tertiary[aria-disabled="true"]` rule declares `text-decoration-color: var(--line)`. Fails today.
    - Unit sweep: `.tertiary` is now counted by the existing sweep; `CHECKED_FLOOR` equals the new measured total (expected 23 = 22 + 1 — use the measured number); comment line 7 no longer says ui/button is outside the sweep.
    - E2E phone 375 (mobile-design-review-p2.spec.ts, new describe next to the FINDING-005 one): a real tertiary Button in a table row (e.g. /admin/vendors row 「숨기기」, a VendorHiddenToggle tertiary Button per mobile-vendors.spec.ts:5) has `text-decoration-line: underline`, `text-underline-offset: 2px`, `border-bottom-style: none`, box >= 44x44. Fails today (text-decoration none, border solid).
    - E2E desktop 1280 (design-review-p2.spec.ts, new describe): same Button — box height before hover equals box height after `hover()`, and computed `text-decoration-thickness` goes 1px -> 2px. Fails today (19 -> 20px).
    - E2E revenue-section.spec.ts:397-404: replace the `borderBottomColor` read with `textDecorationLine` (contains "underline") and `textDecorationColor` (equals `--accent`), keep the transparent background assertion. Fails today.
  </behavior>
  <action>
    Invoke Skills `test-driven-development` and `design-gate` first (hook-enforced; the checklist already exists — reuse it). RED: write the unit assertions and the three E2E changes above, run them, confirm they fail for the stated reason (not setup errors), and commit test files only as `test: ...` (Korean body). The RED run sets the hook's debug flag — invoke `systematic-debugging` (the failure is the expected RED) before editing CSS.
    GREEN (per FINDING-002 minimal fix): in `.tertiary` remove the `border-bottom` declaration and add `text-decoration: underline`, `text-decoration-thickness: var(--line-w)`, `text-underline-offset: var(--underline-offset)`; keep `border: 0`, `white-space: nowrap`, height/padding/background/color. Change the hover rule body to `text-decoration-thickness: var(--line-w-strong)` (keep its selector). Add `.tertiary[aria-disabled="true"] { text-decoration-color: var(--line); }` right after the hover rule so the disabled underline stays dimmed as the old `border-color: var(--line)` did. Leave the phone @media block (:73-82) and every other rule untouched. One short Korean comment above `.tertiary` citing §4-4 and the ListEmpty FINDING-005 precedent (same style as ListEmpty.module.css:22-24) is allowed; no other comment edits.
    Re-run unit + the three E2E specs with CI=true until green. If mobile-vendors / mobile-corp-cards / mobile-code-tables / mobile-list-empty specs break, fix only the broken assertion (comments that merely mention .tertiary stay). Do NOT commit the CSS yet — the design-gate hook needs the fully filled checklist, which is done in Task 3.
  </action>
  <verify>
    <automated>pnpm test:unit test/unit/app/tertiary-underline-css.test.ts && pnpm db:reset:test && CI=true pnpm test:e2e test/e2e/mobile-design-review-p2.spec.ts test/e2e/design-review-p2.spec.ts test/e2e/revenue-section.spec.ts</automated>
  </verify>
  <done>RED commit (tests only) exists and was observed failing for the right reason; after the CSS edit the unit sweep passes with the raised floor and the three E2E specs pass under CI=true; Button.module.css diff touches only `.tertiary`, its hover rule, and the new aria-disabled rule.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Row action gap --s-4 on 거래처 · 법인카드 · 코드표 — RED E2E, then GREEN (FINDING-001)</name>
  <files>test/e2e/row-actions-helpers.ts, test/e2e/vendors.spec.ts, test/e2e/corp-cards.spec.ts, test/e2e/code-tables.spec.ts, test/e2e/mobile-vendors.spec.ts, test/e2e/mobile-corp-cards.spec.ts, app/(app)/admin/vendors/page.tsx, app/(app)/admin/vendors/vendors.module.css, app/(app)/admin/corp-cards/page.tsx, app/(app)/admin/corp-cards/corp-cards.module.css, app/(app)/admin/code-tables/page.tsx, app/(app)/admin/code-tables/code-tables.module.css</files>
  <behavior>
    - Helper `test/e2e/row-actions-helpers.ts` exports a function that takes a row Locator and the ordered action locators and returns, for each adjacent pair, the gap in px: horizontal (next.x - (prev.x + prev.width)) when their boxes share a line (vertical overlap), otherwise vertical (next.y - (prev.y + prev.height)); plus a `--s-4` token reader (copy of `tokenNumber` from people.spec.ts:76). No `any`.
    - Desktop (vendors.spec.ts · corp-cards.spec.ts · code-tables.spec.ts, new describe each): seed one row with a long name (60 chars, as people.spec.ts:196-200 does) plus the target row; at 1280 and 768 (`page.setViewportSize`) every adjacent-action gap is horizontal and >= token - 0.5; 「수정」 (vendors · corp-cards) renders as one text line (Range.getClientRects distinct tops = 1, people.spec.ts:212-217). Fails today (0px; code-tables 768 vertical 3px).
    - Desktop confirm state (same describes): at 768 · 1024 · 1280 click the row 「삭제」, wait for 「취소」, then page scrollWidth - clientWidth <= 0 and table right edge <= parent content edge + 0.5 (people.spec.ts:221-258 pattern or `noHorizontalOverflow`). Regression guard — may already pass before the fix; must still pass after.
    - Phone 375 (mobile-vendors.spec.ts · mobile-corp-cards.spec.ts, new describe each): every adjacent-action gap (horizontal or vertical) >= token - 0.5 and each action box >= 44x44. Fails today (0 / 0-3px). Plus a `test.use({ viewport: { width: 320, height: 800 } })` describe and the 375 default: after 「삭제」 -> 「취소」 visible, no page or table horizontal overflow.
    - (eng review R2, accepted) Normal state too: before pressing 「삭제」, no page or table horizontal overflow at every measured width (1280 · 768 on the three screens; 320 · 375 on vendors · corp-cards) — the new nowrap flex must not widen the actions column past the table.
  </behavior>
  <action>
    RED: add the helper and the tests above, following each spec's existing login/seeding (e.g. `createFixtureUser({ roleId: SYSADMIN_ROLE_ID })` + login form; `insertVendor` for vendors; the UI registration flow already used in corp-cards / code-tables specs). Run with CI=true, confirm the gap tests fail for the measured reason, commit tests only as `test: ...`. Invoke `systematic-debugging` before the next code edit (expected RED; hook flag).
    GREEN (per FINDING-001 minimal fix, reusing #108 verbatim): in each of `vendors.module.css`, `corp-cards.module.css`, `code-tables.module.css` add `.rowActions` with exactly the people.module.css:165-171 declarations (inline-flex, nowrap, align-items center, gap var(--s-4)) and the `@media (max-width: 699.98px)` wrap override, with a one-line Korean comment citing SYSTEM §6-1 and people.module.css as the source. In vendors and corp-cards modules add `.rowLink { white-space: nowrap; }` (the row 「수정」 link only — `.toggle` is shared with filter/register/cancel/table-picker links, so it is not modified). In each page.tsx replace the Fragment inside the actions `<td>` with `<span className={styles.rowActions}>`, keeping children, order and conditions identical; on the vendors/corp-cards row 「수정」 Link set className to the composition of `styles.toggle` and `styles.rowLink` (template literal, precedent archive-table.tsx:66). Do NOT put white-space on the `<td>`, do NOT touch people.module.css, archive.module.css, the DeleteToArchive component, or org/roles screens (one action per row — out of scope). Do not consolidate the four `.rowActions` copies into shared CSS (user decision — record in SUMMARY).
    Re-run with CI=true until green. If a confirm-state overflow appears, stop and debug with `systematic-debugging`; if the only fix would touch DeleteToArchive / archive.module.css, stop and report instead of changing it. Do NOT commit screen code yet (Task 3).
  </action>
  <verify>
    <automated>pnpm db:reset:test && CI=true pnpm test:e2e test/e2e/vendors.spec.ts test/e2e/corp-cards.spec.ts test/e2e/code-tables.spec.ts test/e2e/mobile-vendors.spec.ts test/e2e/mobile-corp-cards.spec.ts</automated>
  </verify>
  <done>RED commit (tests only) observed failing on the gap assertions; after the fix all five specs pass under CI=true with gaps >= 16px (1280 · 768 horizontal; 375 any direction), 「수정」 one line, no overflow in the confirm state at 320 · 375 · 768 · 1024 · 1280; diff of the three page.tsx files is only the span wrapper and the 「수정」 className.</done>
</task>

<task type="auto">
  <name>Task 3: Gates, filled design-gate checklist, screen-code commits</name>
  <files>docs/design/checks/2026-09-30-관리표-행행동-간격-3차-밑줄.md</files>
  <action>
    Invoke `verification-before-completion`. Run cheap gates: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`. Then one CI=true E2E run over every touched or affected spec: vendors, vendor-edit, corp-cards, code-tables, code-tables-write-gate, archive, people, admin-master-list-first, revenue-section, notify-inbox, design-review-p2, design-principles, and all `test/e2e/mobile-*.spec.ts` (the trailing `test/e2e/mobile-` argument in verify is a Playwright path regex filter that matches them all). Report counts only; quote only failing parts (invoke `systematic-debugging` on any failure — no guessed fixes).
    Fill every box of the checklist with one-line evidence (no `- [ ]`, no empty 「근거:」): copy unchanged (diff has no text-node changes); decisions/disabled choices/primary button/empty state/keyboard order unchanged (span wrapper keeps DOM order); 「삭제」 separated from neighbours by the measured px at 1280 · 768 · 375; same-kind actions same shape = Button tertiary now reports the same `text-decoration-line`/offset as the 3차 links (measured values); §1 user decisions untouched; only existing tokens used (`--s-4`, `--line-w`, `--line-w-strong`, `--underline-offset`, `--line`); 320 no overflow + 44 touch from the E2E; screenshot line follows the precedent in earlier checklists: 「없음. 스크린샷 육안 판정 금지(CLAUDE.md §6) — CI=true DOM 실측 E2E(spec 경로)로 대체, 독립 DOM 감사는 오케스트레이터가 한다」.
    Commit in two intents (English prefix title, Korean body): (1) `fix:` Button.module.css + the filled checklist — glyph underline for shared tertiary Button (FINDING-002); (2) `fix:` the three page.tsx + three module CSS — row action gap --s-4 (FINDING-001) (hook accepts the checklist already committed on this branch). Do not push force; no .planning/ hand edits beyond the SUMMARY the workflow writes. In SUMMARY record: org/roles out of scope (one action per row); four per-module `.rowActions` copies (people · vendors · corp-cards · code-tables) — consolidation into shared CSS is a user decision, not done; post-build gates (/review, /design-review + independent DOM audit, /qa) are the orchestrator's.
  </action>
  <verify>
    <automated>pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm db:reset:test && CI=true pnpm test:e2e test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts test/e2e/corp-cards.spec.ts test/e2e/code-tables.spec.ts test/e2e/code-tables-write-gate.spec.ts test/e2e/archive.spec.ts test/e2e/people.spec.ts test/e2e/admin-master-list-first.spec.ts test/e2e/revenue-section.spec.ts test/e2e/notify-inbox.spec.ts test/e2e/design-review-p2.spec.ts test/e2e/design-principles.spec.ts test/e2e/mobile-</automated>
    <automated>(eng review R4, accepted — regression contract for the shared Button, used by ~24 screens) pnpm test:e2e:ci  # full suite once, CI=true, because a draft PR's CI runs quality only</automated>
  </verify>
  <done>All cheap gates green; the CI=true E2E set green; checklist has no empty boxes or empty 근거; two `fix:` commits landed after the two `test:` commits; `git status` clean except files the workflow owns.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | CSS/markup-only change on admin screens already behind permission gates (`canWrite` / `canArchive` conditions kept byte-identical) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nto-01 | Elevation of Privilege | row action `<td>` in three page.tsx | low | mitigate | Wrapper replaces only the Fragment; `canWrite`/`canArchive`/`archivedAt` conditions and children unchanged — Task 2 done criterion checks the diff is wrapper + className only; existing code-tables-write-gate and vendors permission E2E rerun in Task 3 |
| T-nto-02 | Denial of Service (UI) | DeleteToArchive confirm row inside nowrap flex | low | mitigate | Confirm-state overflow E2E at 320 · 375 · 768 · 1024 · 1280; white-space kept off the cell per #108 |
| T-nto-SC | Tampering | package installs | low | accept | No dependencies added |
</threat_model>

<verification>
- Unit sweep includes ui/button .tertiary; floor equals measured count.
- CI=true E2E measurements: gaps >= 16px (1280 · 768 · 375), no overflow in confirm state, tertiary glyph underline on phone, hover box height stable at 1280.
- lint · typecheck · unit · build green; checklist filled; people.module.css, archive.module.css, DeleteToArchive, domain/, db/, .claude/, CLAUDE.md untouched.
</verification>

<success_criteria>
FINDING-001 and FINDING-002 are closed with measured evidence on the real app (production build), the design-gate checklist is complete, and changes are limited to the files listed in frontmatter.
</success_criteria>

<output>
Create `.planning/quick/260930-nto-row-actions-gap-and-tertiary-underline/260930-nto-SUMMARY.md` when done
</output>

## Eng review (/plan-eng-review, 2026-09-30, reviewer: orchestrator Opus)

Target: this plan (`260930-nto-PLAN.md`). Report file: this plan (CLAUDE.md §4 — review results go into the GSD plan file).
Decision mode: the user is asleep and instructed (2026-09-30 prompt) "모호한 점은 가장 보수적인 선택으로 진행하고 PR 본문의 「사용자 결정 필요」 절에 적는다". Every decision below is auto-decided on that standing instruction and listed in PR #111 「사용자 결정 필요」.

### Step 0: Scope Challenge
- What already solves it: `.rowActions` (people.module.css:164-179, #108) and the ListEmpty glyph-underline fix (ListEmpty.module.css:22-25) — reused verbatim. `noHorizontalOverflow` (people-list-helpers.ts:58) reused.
- Complexity: 17 files in `files_modified` (8+ threshold) but 0 new classes/services; 10 of 17 are tests. Structure gate tripped → R1.
- TODOS cross-reference: TODOS.md 「04.4 후속 이연」 two items are exactly this scope. New finding F3 (same border-bottom defect in other 3차 components) → TODO (R3).
- Search check: no new architectural pattern (CSS text-decoration on inline-flex is standard; text decoration propagates to the in-flow inline text of the flex container's anonymous item) [Layer 1]. Search unavailable — in-distribution knowledge only.

### Findings
1. [P3] (confidence 8/10) Structure — `files_modified` 17 files; new `test/e2e/row-actions-helpers.ts`. Smaller arrangement = inline the gap helper into 5 specs (duplicated measuring code). → R1.
2. [P2] (confidence 8/10) Test gap — Task 2 behavior asserts no overflow only in the confirm state; the new `flex-wrap: nowrap` wrapper also runs in the normal state. Motivating line: plan Task 2 「Desktop confirm state … at 768 · 1024 · 1280 click the row 「삭제」」 — no normal-state overflow assertion. `mobile-320-no-overflow.spec.ts:99-113` covers the three routes at 320 only, not 768 with long rows. → R2.
3. [P2] (confidence 9/10) Consistency (out of scope) — the same border-bottom 3차 underline also lives in `ui/next-turn/NextTurn.module.css:123-135` (`.tertiary { border-bottom: var(--line-w) solid var(--accent); … }` · `.tertiary:hover { border-bottom-width: var(--line-w-strong); }`) and `ui/table/Table.module.css:216-225` (`.emptyAction { … border-bottom: var(--line-w) solid var(--accent); … }`). Not the shared Button; not in the user's scope. (`project-detail.module.css:110` · `reserves.module.css:25` are cell-input underlines, not 3차 — not this defect.) → R3.
4. [P1] (confidence 9/10) Regression — `ui/button` `.tertiary` is rendered on ~24 files (grep `variant="tertiary"`: approvals, projects/[id] ×4, leave, notifications, pnl/reserves, holidays ×3, admin ×9, ui/history-list …). Task 3 E2E list covers admin + mobile-* + revenue only; a draft PR's CI runs quality only (CLAUDE.md §5), so no E2E would exercise the other screens before ready. REGRESSION RULE → R4.

Dropped after probe: tertiary + `kbd` underline bleed — no tertiary Button passes `shortcut` (grep `shortcut=`: primary/secondary only). PC tertiary box 19→18px after border removal — no E2E asserts PC tertiary height (only phone >= 44, unchanged).

### Section 1 Architecture: No issues found (CSS-only; permission conditions byte-identical, T-nto-01).
### Section 2 Code quality: F1. Four per-module `.rowActions` copies (people · vendors · corp-cards · code-tables): shared-code rubric — 4 verified callers, identical contract, but #108 precedent + no-refactor rule; consolidation is a user decision, not done (recorded in SUMMARY/PR).
### Section 3 Tests: F2, F4.
```
CODE PATHS                                         USER FLOWS
[+] ui/button .tertiary                            [+] Admin row actions
  ├── base underline      [→unit sweep + E2E 375]    ├── [PLANNED] gap >= 16 @1280/768/375 — vendors/corp-cards/code-tables specs
  ├── :hover 2px          [→E2E 1280 height same]    ├── [PLANNED] confirm state no overflow @320..1280
  ├── [aria-disabled]     [→unit rule check]         ├── [R2 ADDED] normal state no overflow
  └── phone 44 box        [existing mobile-* specs]  └── [PLANNED] 「수정」 one line
[+] other ~20 screens using tertiary  [R4 ADDED] full CI=true E2E suite
```
### Section 4 Performance: No issues found.
### Outside voice: Codex not installed and CLAUDE.md forbids external (Codex) review; native fallback needs TaskOutput, which this session lacks → unavailable. No clean credit.

## Decision ledger

### R1: file/class arrangement
Finding: 1, P3, 8/10, plan frontmatter files_modified, orchestrator
Plan baseline: original proposal (shared helper `test/e2e/row-actions-helpers.ts` + 5 specs)
Runtime evidence: helper does not exist yet (proposal)
Comparison grid: | R1 | pending | A Original arrangement (helper file) | B Smaller arrangement (inline in each spec) |
Question D1: Keep the shared gap helper or inline it? Recommendation: A because one measuring function beats five copies.
Header: Arrangement
Options:
A) Original arrangement — helper file + 5 specs; one measurement definition.
B) Smaller arrangement — no helper file; the same measurement copied into 5 specs.
State: approved
Actual answer: A (auto-decided, standing instruction 2026-09-30)
Accepted scope: plan as written
History: none

### R2: normal-state overflow assertion
Finding: 2, P2, 8/10, plan Task 2 behavior, orchestrator
Plan baseline: confirm-state overflow only
Runtime evidence: unknown (not yet built)
Comparison grid: | R2 | confirm only | A add normal-state assertions | B keep confirm only |
Question D2: Also assert no overflow before pressing 「삭제」? Recommendation: A because the nowrap wrapper applies in the normal state too; cost is a few lines.
Header: Overflow test
Options:
A) Add — assert no page/table overflow in the normal state at every measured width.
B) Keep — confirm state only.
State: approved
Actual answer: A (auto-decided, standing instruction 2026-09-30)
Accepted scope: Task 2 behavior bullet 「(eng review R2, accepted) Normal state too …」
History: none

### R3: same defect in NextTurn `.tertiary` and Table `.emptyAction`
Finding: 3, P2, 9/10, ui/next-turn/NextTurn.module.css:123-135 · ui/table/Table.module.css:216-225, orchestrator
Plan baseline: out of scope (user scope = shared Button `.tertiary`)
Runtime evidence: source read; not measured
Comparison grid: | R3 | not in plan | A Add TODO | B Skip | C Build now |
Question D3: TODO for the remaining border-bottom 3차 underlines? Recommendation: A because widening a user-scoped PR while they sleep is not conservative, but the defect must not be lost.
Header: TODO
Options:
A) Add to TODOS.md — next quick applies the same glyph-underline fix + sweep.
B) Skip.
C) Build it now in this PR.
State: approved
Actual answer: A (auto-decided, standing instruction 2026-09-30; user decides C later)
Accepted scope: TODOS.md entry in the orchestrator's docs commit; no code change here
History: none

### R4: regression contract for the shared Button
Finding: 4, P1, 9/10, ui/button/Button.module.css:53-65 + ~24 callers, orchestrator
Plan baseline: Task 3 subset E2E
Runtime evidence: draft PR CI = quality only (CLAUDE.md §5)
Comparison grid: | R4 | subset | A full CI=true E2E suite once locally | B subset only |
Question D4: How to cover the ~20 other screens rendering tertiary Buttons? Preserve: color, font, nowrap, phone 44 box, disabled look, click behavior. Intended change: underline drawn as text-decoration (PC box 19→18px, hover no longer grows the box). Recommendation: A.
Header: Regression
Options:
A) Full suite — `pnpm test:e2e:ci` once after the fix.
B) Subset only — Task 3 list.
State: approved
Actual answer: A (auto-decided, standing instruction 2026-09-30)
Accepted scope: Task 3 extra <automated> line
History: none

Approval readiness: PASS (R1–R4, each auto-decided under the user's standing instruction 2026-09-30)

NOT in scope: org/roles screens (one action per row) · consolidating four `.rowActions` copies (user decision) · NextTurn/Table border-bottom 3차 (R3 TODO) · cell-input underlines (not 3차).
Failure modes: nowrap wrapper widening the column → R2 test (not silent, E2E). Tertiary underline invisible on some screen due to a local `text-decoration: none` override → probed: overrides at inbox-table.module.css:59 (`.rowTap` button, not tertiary), others are links — covered by R4 full suite. Critical gaps: 0.
Worktree parallelization: Sequential implementation, no parallelization opportunity.

## Implementation Tasks
- [ ] **T1 (P2, human: ~30min / CC: ~5min)** — admin row tests — add normal-state overflow assertions (R2). Files: vendors/corp-cards/code-tables/mobile-vendors/mobile-corp-cards specs. Verify: CI=true E2E.
- [ ] **T2 (P1, human: ~1h / CC: ~30min wall)** — shared Button — run full `pnpm test:e2e:ci` once after the fix (R4). Verify: 0 failures or base-branch-confirmed pre-existing.
- [ ] **T3 (P3, human: ~10min / CC: ~2min)** — TODOS.md — add NextTurn/Table border-bottom 3차 entry (R3).

Completion summary: Step 0 scope accepted as-is · Architecture 0 · Code quality 1 · Tests diagram produced, 2 gaps · Performance 0 · NOT in scope written · What already exists written · TODOS 1 proposed · Critical gaps 0 · Unresolved 0 · Outside voice unavailable (Codex not installed + forbidden by CLAUDE.md; no TaskOutput for native fallback) · Parallelization 0 lanes · Lake Score 2/2.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex (plan-eng-review) | Independent 2nd opinion | 1 | unavailable | not installed; CLAUDE.md forbids external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (mapped) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, unavailable (not installed; external review forbidden by CLAUDE.md §4), no findings.
- **VERDICT:** Eng review findings all dispositioned (R1–R4 approved, mapped into Tasks 2–3); design review pending.

NO UNRESOLVED DECISIONS
