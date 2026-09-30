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
    - "/admin/vendors · /admin/corp-cards · /admin/code-tables at 1280 · 768 · 700 (design review D3): every pair of adjacent row actions (수정 · 숨기기/비활성화 · 삭제) sits on one line with a horizontal gap >= --s-4 (16px); 「수정」 stays one text line"
    - "Phone 375 /admin/vendors · /admin/corp-cards: adjacent row actions are >= 16px apart (horizontal when on one line, vertical when wrapped) and each keeps a >= 44x44 box (code-tables action column is hidden < 700 by design — not measured on phone)"
    - "After pressing 「삭제」 (DeleteToArchive confirm state) the page and the table do not overflow horizontally on the three screens at 700 · 768 · 1024 · 1280, and on vendors · corp-cards at 320 · 375"
    - "(design review D4) At 1280 the row 「수정」 link and the tertiary Button 「숨기기」 in the same /admin/vendors row report equal computed font-size, font-weight, color, text-decoration-line, text-decoration-thickness, text-underline-offset and text-decoration-color"
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
    - (design review D4, accepted) E2E desktop 1280, same describe: in one /admin/vendors row, read computed `font-size`, `font-weight`, `color`, `text-decoration-line`, `text-decoration-thickness`, `text-underline-offset`, `text-decoration-color` from the row 「수정」 Link and from the 「숨기기」 tertiary Button (the `<button>`, not its `.wrap` span) before hover, and assert each pair is equal. Fails today (Button text-decoration-line none).
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
    - Desktop (vendors.spec.ts · corp-cards.spec.ts · code-tables.spec.ts, new describe each): seed one row with a long name (60 chars, as people.spec.ts:196-200 does) plus the target row; at 1280 · 768 · 700 (`page.setViewportSize`; 700 = narrowest width where `.rowActions` stays nowrap — design review D3) every adjacent-action gap is horizontal and >= token - 0.5; 「수정」 (vendors · corp-cards) renders as one text line (Range.getClientRects distinct tops = 1, people.spec.ts:212-217). Fails today (0px; code-tables 768 vertical 3px).
    - Desktop confirm state (same describes): at 700 · 768 · 1024 · 1280 click the row 「삭제」, wait for 「취소」, then page scrollWidth - clientWidth <= 0 and table right edge <= parent content edge + 0.5 (people.spec.ts:221-258 pattern or `noHorizontalOverflow`). Regression guard — may already pass before the fix; must still pass after.
    - Phone 375 (mobile-vendors.spec.ts · mobile-corp-cards.spec.ts, new describe each): every adjacent-action gap (horizontal or vertical) >= token - 0.5 and each action box >= 44x44. Fails today (0 / 0-3px). Plus a `test.use({ viewport: { width: 320, height: 800 } })` describe and the 375 default: after 「삭제」 -> 「취소」 visible, no page or table horizontal overflow.
    - (eng review R2, accepted) Normal state too: before pressing 「삭제」, no page or table horizontal overflow at every measured width (1280 · 768 · 700 on the three screens; 320 · 375 on vendors · corp-cards) — the new nowrap flex must not widen the actions column past the table.
  </behavior>
  <action>
    RED: add the helper and the tests above, following each spec's existing login/seeding (e.g. `createFixtureUser({ roleId: SYSADMIN_ROLE_ID })` + login form; `insertVendor` for vendors; the UI registration flow already used in corp-cards / code-tables specs). Run with CI=true, confirm the gap tests fail for the measured reason, commit tests only as `test: ...`. Invoke `systematic-debugging` before the next code edit (expected RED; hook flag).
    GREEN (per FINDING-001 minimal fix, reusing #108 verbatim): in each of `vendors.module.css`, `corp-cards.module.css`, `code-tables.module.css` add `.rowActions` with exactly the people.module.css:165-171 declarations (inline-flex, nowrap, align-items center, gap var(--s-4)) and the `@media (max-width: 699.98px)` wrap override, with a one-line Korean comment citing SYSTEM §6-1 and people.module.css as the source. In vendors and corp-cards modules add `.rowLink { white-space: nowrap; }` (the row 「수정」 link only — `.toggle` is shared with filter/register/cancel/table-picker links, so it is not modified). In each page.tsx replace the Fragment inside the actions `<td>` with `<span className={styles.rowActions}>`, keeping children, order and conditions identical; on the vendors/corp-cards row 「수정」 Link set className to the composition of `styles.toggle` and `styles.rowLink` (template literal, precedent archive-table.tsx:66). Do NOT put white-space on the `<td>`, do NOT touch people.module.css, archive.module.css, the DeleteToArchive component, or org/roles screens (one action per row — out of scope). Do not consolidate the four `.rowActions` copies into shared CSS (user decision — record in SUMMARY).
    Re-run with CI=true until green. If a confirm-state overflow appears, stop and debug with `systematic-debugging`; if the only fix would touch DeleteToArchive / archive.module.css, stop and report instead of changing it. Do NOT commit screen code yet (Task 3).
  </action>
  <verify>
    <automated>pnpm db:reset:test && CI=true pnpm test:e2e test/e2e/vendors.spec.ts test/e2e/corp-cards.spec.ts test/e2e/code-tables.spec.ts test/e2e/mobile-vendors.spec.ts test/e2e/mobile-corp-cards.spec.ts</automated>
  </verify>
  <done>RED commit (tests only) observed failing on the gap assertions; after the fix all five specs pass under CI=true with gaps >= 16px (1280 · 768 · 700 horizontal; 375 any direction), 「수정」 one line, no overflow in the normal and confirm states at 320 · 375 · 700 · 768 · 1024 · 1280; diff of the three page.tsx files is only the span wrapper and the 「수정」 className.</done>
</task>

<task type="auto">
  <name>Task 3: Gates, filled design-gate checklist, screen-code commits</name>
  <files>docs/design/checks/2026-09-30-관리표-행행동-간격-3차-밑줄.md</files>
  <action>
    Invoke `verification-before-completion`. Run cheap gates: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`. Then one CI=true E2E run over every touched or affected spec: vendors, vendor-edit, corp-cards, code-tables, code-tables-write-gate, archive, people, admin-master-list-first, revenue-section, notify-inbox, design-review-p2, design-principles, and all `test/e2e/mobile-*.spec.ts` (the trailing `test/e2e/mobile-` argument in verify is a Playwright path regex filter that matches them all). Report counts only; quote only failing parts (invoke `systematic-debugging` on any failure — no guessed fixes).
    Fill every box of the checklist with one-line evidence (no `- [ ]`, no empty 「근거:」): copy unchanged (diff has no text-node changes); decisions/disabled choices/primary button/empty state/keyboard order unchanged (span wrapper keeps DOM order); 「삭제」 separated from neighbours by the measured px at 1280 · 768 · 700 · 375 — and for the 「위험 색」 half of that box write 「위험 색 아님 — SYSTEM §7-1 「위험 행동은 색이 아니라 확인으로 구분 · 붉은 버튼 없음」(SYSTEM.md:699), 구분은 DeleteToArchive 인라인 확인(:700 기록된 예외)」; do NOT add `--danger` or any color to 「삭제」 (design review D1); same-kind actions same shape = the D4 equality assertion (「수정」 link vs 「숨기기」 Button, measured values) — and for 「링크·버튼 섞지 않음」 write 「요소 종류는 그대로 — 페이지 이동 「수정」은 `<a>`, 행 안 동작은 `<button>`(SYSTEM.md:1146 「3차 버튼은 `<button>`(페이지 이동이면 `<a>`)」); 모양은 같다(D4 실측)」; do NOT convert 「수정」 into a Button or the Buttons into links (design review D2); add one plain note line (not a checkbox) under the checklist's 「## 원칙」 list recording the accepted, unchanged states from the design review state table (D5 · D6): pending 「…」 underline in two pieces, disabled `--surface` fill, reason text outside the underline, confirm row centred beside live 「수정」/「숨기기」 (copied from people.module.css #108 — not a new decision); §1 user decisions untouched; only existing tokens used (`--s-4`, `--line-w`, `--line-w-strong`, `--underline-offset`, `--line`); 320 no overflow + 44 touch from the E2E; screenshot line follows the precedent in earlier checklists: 「없음. 스크린샷 육안 판정 금지(CLAUDE.md §6) — CI=true DOM 실측 E2E(spec 경로)로 대체, 독립 DOM 감사는 오케스트레이터가 한다」.
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

## Design review (/plan-design-review, 2026-09-30, reviewer: orchestrator Opus + independent Claude subagent Opus)

Target: this plan. Decision mode: same standing instruction as the eng review (user asleep, 2026-09-30 prompt: 「모호한 점은 가장 보수적인 선택으로 진행하고 PR 본문의 「사용자 결정 필요」 절에 적는다」). Each finding below was decided individually on that instruction (recommended = most conservative option) and is listed in PR #111 「사용자 결정 필요」.

### System audit
- UI scope: existing screens only — /admin/vendors · /admin/corp-cards · /admin/code-tables row action cell, and the shared `ui/button` `.tertiary` (~24 callers). No new screen, component, copy or token.
- Design system: `docs/design/SYSTEM.md` exists (§4-4 3차 밑줄 · §6-1 `--s-4` · §7-1 3차 row · :699 위험 행동 = 확인, 붉은 버튼 없음 · :700 DeleteToArchive 예외 · :1146 `<button>`/`<a>`). All decisions calibrate against it.
- Prior design review of this area: 260930-f3l /design-review FINDING-001 (high) · 002 (medium) — the source of this plan; ListEmpty FINDING-005 fixed the same underline defect earlier. Reviewed aggressively.
- Classifier: OPERATE (admin app UI). Prior learnings: none found (project-scoped search; `cross_project_learnings` left unset — config not changed while the user is away).

### Step 0
- 0A initial rating: 7/10 — measured, token-exact fix and strong regression tests; missing: checklist evidence that could push the implementer against SYSTEM (위험 색 · 링크/버튼), parity with the neighbouring link not asserted, 700px not measured, pending/disabled/confirm states unrecorded. A 10 = every state of the changed controls written down, every width where the new nowrap wrapper applies measured, and checklist evidence that cites the SYSTEM rule instead of inviting a new color or element swap.
- 0B: SYSTEM.md present — calibrated.
- 0C reuse: `.rowActions` (people.module.css:164-179), ListEmpty glyph underline (ListEmpty.module.css:22-25), row 「수정」 `.toggle` (vendors.module.css:13-25 — fs-sm · `--fw-medium` · accent · 1px underline offset 2px · hover 2px), global `:focus-visible` (globals.css:62), DeleteToArchive `.confirmRow` (archive.module.css:73-83).
- 0D focus: all 7 passes (auto-decided, standing instruction).
- Step 0.5 mockups: NOT generated (D0). Outside voices: Codex not run (CLAUDE.md §4 forbids external review); independent Claude subagent (Opus) ran — 6 findings, all verified against source and merged below.

### Pass 1 Information Architecture: 9/10 → 10/10
Cell order unchanged (수정 → 숨기기/비활성화 → 삭제, 삭제 last); separation specified. Gap: "same kind, same shape" only checked against fixed values, not against the neighbouring 「수정」 link in the same cell → D4. After D4 the cell reads as three equal 3차 actions, 16px apart, verified by measurement.
```
[ 이름 … | … | 수정 ␣16␣ 숨기기 ␣16␣ 삭제 ]   (≥700: one line, nowrap)
[ 이름 … | … | 수정 ␣16␣ 숨기기 ]            (<700: wraps, 16px vertical)
[           | 삭제                    ]
confirm:  [ 수정 ␣16␣ 숨기기 ␣16␣ (확인 문구 · 삭제 확인 · 취소) ]  ← .confirmRow wraps inside
```

### Pass 2 Interaction States: 6/10 → 9/10
| Control | Default | Hover (PC) | Focus-visible | Disabled (aria-disabled) | Pending | Confirm (DeleteToArchive) |
|---|---|---|---|---|---|---|
| tertiary Button (숨기기 · 비활성화 · 삭제) | accent 600 fs-sm, glyph underline 1px, offset 2px | underline 2px, box height unchanged | global ring 2px `--focus` offset 2px (unchanged) | `--faint` text, `--surface` fill (existing `.btn[aria-disabled]`, 0,2,0), underline color `--line` | 「…」 appended with `.btn` 8px gap → underline in two pieces (was one border line); label widens a few px for the request's duration | n/a |
| row 「수정」 link | same as Button (D4) | underline 2px | same ring | n/a | n/a | stays live beside confirm row |
| `.rowActions` cell | 16px gaps | — | — | — | — | confirm row (`.confirmRow`, own wrap) centred (`align-items: center`) beside live 「수정」/「숨기기」 — copied from #108 |
Disabled reason text sits outside the `<button>` (Button.tsx `.wrap` sibling span) so it is never underlined; none of these cells passes a reason today. Remaining 1 point: pending underline split and pending width are accepted, not measured (transient, D5).

### Pass 3 User Journey: 8/10 → 9/10
| Step | User does | User feels | Plan specifies? |
|---|---|---|---|
| 1 | scans a row | sees three separate actions, not 「수정숨기기삭제」 | yes — 16px gap, one line ≥700 |
| 2 | hovers 숨기기 | same feedback as hovering 수정 | yes — 1→2px, box stable (D4 parity) |
| 3 | presses 삭제 | confirm appears in place, siblings still reachable, nothing jumps sideways | yes — overflow checks normal + confirm, 320–1280 (+700, D3); layout recorded (D6) |
| 4 | on phone taps | 44 boxes, 16px apart | yes — 375 gaps + 44 |
5-sec: calmer row. 5-min: fewer mis-taps on 삭제. 5-year: one 3차 look across the app (remaining NextTurn/Table → eng R3 TODO).

### Pass 4 AI Slop Risk: 10/10 → 10/10
OPERATE. Hard rejections: none. Litmus: 1 n/a (existing shell) · 2 n/a · 3 yes (no copy change) · 4 yes · 5 no cards · 6 no motion added · 7 yes (no shadows). Existing tokens only, no decorative change. No issues.

### Pass 5 Design System Alignment: 6/10 → 10/10
Tokens exact (`--s-4`, `--line-w`, `--line-w-strong`, `--underline-offset`, `--line`). Gaps were in the checklist evidence Task 3 asks the implementer to fill: D1 (「위험 색」) and D2 (「링크·버튼 섞지 않음」). Both now cite SYSTEM rules and forbid the wrong fix.

### Pass 6 Responsive & Accessibility: 7/10 → 9/10
1280 · 768 · 375 · 320 specified; 44 touch on phone; keyboard order unchanged (span wrapper, no role); focus ring 2px+2px offset fits inside the 16px gap. Gap: 700–767 (narrowest nowrap width; code-tables action column visible from 700) unmeasured → D3. Remaining 1 point: pending-width push not measured (D5, accepted).

### Pass 7 Unresolved decisions: 7 resolved (D0–D6), 0 deferred

## Design decision ledger

### D0: visual mockups (gstack designer)
Finding: Step 0.5, process. Designer binary available, but CLAUDE.md §6 forbids screenshot visual judgment and the design-gate skill says design comparison uses the real app screen only; the change is CSS on existing screens with no new layout.
Options: A) Skip mockups — evidence = CI=true DOM measurement + independent DOM audit (recommended). B) Generate AI mockups.
Actual answer: A (auto-decided, standing instruction; project rule wins over skill default). PR #111 「사용자 결정 필요」.

### D1: checklist 「위험한 동작 … 위험 색이다」 vs SYSTEM :699
Finding: Pass 5, high (subagent 1, verified SYSTEM.md:699-700). Checklist line would push the implementer to color 「삭제」 red.
Options: A) Evidence cites :699/:700 — separation 16px, no danger color, distinction by DeleteToArchive confirm (recommended). B) Add `--danger` to 「삭제」 (violates SYSTEM, new decision).
Actual answer: A. Accepted scope: Task 3 action text.

### D2: checklist 「링크·버튼 섞지 않음」
Finding: Pass 5, medium (subagent 2, verified SYSTEM.md:1146). Row mixes `<a>` 수정 and `<button>`s; SYSTEM allows `<a>` for navigation.
Options: A) Evidence cites :1146, element types unchanged, same look proven by D4 (recommended). B) Convert 수정 to a Button / Buttons to links (behavior change, out of scope).
Actual answer: A. Accepted scope: Task 3 action text.

### D3: 700px not measured
Finding: Pass 6, medium (subagent 3). `.rowActions` is nowrap from 700; checks started at 768.
Options: A) Add 700 to gap + normal/confirm overflow checks on the three screens (recommended, test-only). B) Keep 768.
Actual answer: A. Accepted scope: must_haves truths 1 · 3, Task 2 behavior + done.

### D4: parity with the neighbouring 「수정」 link
Finding: Pass 1, medium (subagent 4). FINDING-002 is about matching the link in the same cell; plan asserted fixed values only.
Options: A) 1280 equality assertion on 7 computed properties, 「수정」 vs 「숨기기」 in one vendors row (recommended). B) Fixed values only.
Actual answer: A. Accepted scope: new must_haves truth, Task 1 behavior bullet (design-review-p2.spec.ts, file already listed).

### D5: pending / disabled states
Finding: Pass 2, low (subagent 5, verified Button.tsx:85 `…` span, `.btn` gap 8px, `.btn[aria-disabled]` fill). Underline splits during pending; disabled underline sits on `--surface`.
Options: A) Record as accepted unchanged states; no Button.tsx change (recommended). B) Change Button markup/CSS for pending (widens scope on a shared component).
Actual answer: A. Accepted scope: Pass 2 state table + checklist note (Task 3).

### D6: confirm-state layout
Finding: Pass 2/3, low (subagent 6, verified archive.module.css:73-83). Confirm row centred beside live siblings, copied from #108.
Options: A) Record in checklist as copied from people.module.css, not a new decision (recommended). B) Redesign confirm layout (DeleteToArchive out of scope).
Actual answer: A. Accepted scope: checklist note (Task 3).

### NOT in scope (design)
- 「삭제」 danger color — SYSTEM :699 forbids.
- Hiding siblings during confirm / new confirm layout — DeleteToArchive is a recorded exception (:700), out of scope.
- Pending-state underline continuity — shared Button markup change, not requested.
- `.btn[aria-disabled]` `--surface` fill on tertiary — existing, not in FINDING-002.
- NextTurn `.tertiary` · Table `.emptyAction` border-bottom — eng R3 TODO.
- Consolidating four `.rowActions` copies — user decision (PR #111 item 4).

### What already exists (design)
`.rowActions` (people.module.css:164-179) · ListEmpty glyph underline (ListEmpty.module.css:22-25) · `.toggle` 3차 link rules (vendors/corp-cards/code-tables module CSS) · global focus ring (globals.css:62) · DeleteToArchive `.confirmRow` (archive.module.css:73-83) · SYSTEM §4-4/§6-1/§7-1.

### TODOS.md updates
No new design TODO — every finding was either folded into this plan (D3 · D4, D1 · D2 evidence) or recorded as an accepted unchanged state (D5 · D6). Eng R3 TODO stands.

### Implementation Tasks (design review)
- [ ] **T4 (P2, human: ~20min / CC: ~3min)** — admin row tests — add 700 to gap + normal/confirm overflow checks (D3). Files: vendors/corp-cards/code-tables specs. Verify: CI=true E2E.
- [ ] **T5 (P2, human: ~20min / CC: ~3min)** — design-review-p2 1280 — 「수정」 vs 「숨기기」 computed-style equality (D4). Verify: RED before CSS, GREEN after, CI=true.
- [ ] **T6 (P2, human: ~10min / CC: ~2min)** — design-gate checklist — D1 · D2 evidence wording + D5 · D6 state note (Task 3). Verify: hook accepts the commit; no `--danger`/element changes in diff.

### Completion Summary (design)
```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | SYSTEM.md present; UI scope = 3 admin cells + shared tertiary |
  | Step 0               | 7/10; focus all 7 passes                    |
  | Pass 1  (Info Arch)  | 9/10 → 10/10 after fixes                   |
  | Pass 2  (States)     | 6/10 → 9/10 after fixes                    |
  | Pass 3  (Journey)    | 8/10 → 9/10 after fixes                    |
  | Pass 4  (AI Slop)    | 10/10 → 10/10 after fixes                  |
  | Pass 5  (Design Sys) | 6/10 → 10/10 after fixes                   |
  | Pass 6  (Responsive) | 7/10 → 9/10 after fixes                    |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                     |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 0 generated, 0 approved (D0)                |
  | Decisions made       | 7 added to plan (auto, standing instruction)|
  | Decisions deferred   | 0                                           |
  | Overall design score | 6/10 → 9/10                                 |
  +====================================================================+
```
Plan is design-complete (every pass 8+). Run /design-review after implementation for visual QA (real app, DOM measurement).

### Unresolved Decisions
None open in this review. All seven were auto-decided under the standing instruction and await the user's confirmation in PR #111 「사용자 결정 필요」.

## CEO review (/plan-ceo-review, 2026-09-30, reviewer: orchestrator Opus, session B)

Target: this plan. Why it ran: `plant8-skill-gate.sh` reads STATE.md `current_phase: 2` and requires a plan-ceo-review record before the executor; CLAUDE.md §4 keeps CEO review at milestone level, so running it on a quick is recorded as PR #111 「사용자 결정 필요」 1 (conservative = do not bypass the gate).
Decision mode: same standing instruction as the eng and design reviews (user asleep, 2026-09-30 prompt: 「모호한 점은 가장 보수적인 선택으로 진행하고 PR 본문의 「사용자 결정 필요」 절에 적는다」; this session's handoff adds 「범위를 넓히는 제안은 받아들이지 않는 쪽이 보수적이다」). Every question below was auto-decided on that instruction (recommended = most conservative) and is listed in PR #111.
Review depth: implementation-ready (the plan already names files, rules and tests; this review checks them, it does not redesign).

### Pre-review system audit
- Branch `ccr-e0753b24-rowactions-underline` = PR #108 branch (`ccr-73fab648-aw1b9o`, 3774333) + 4 planning/gate files; no code change yet, no stash. Base included (merge-base check).
- Facts re-verified at HEAD ab3b4dd: `ui/button/Button.module.css:53-65` `.tertiary` border-bottom + hover border-bottom-width; `.btn` transition covers background-color and color only (so the new text-decoration-thickness hover is instant — no flaky mid-transition reads in the 1280 hover test); `app/(app)/admin/people/people.module.css:164-179` `.rowActions` exists; `test/unit/app/tertiary-underline-css.test.ts` exists; `app/(app)/admin/corp-cards/page.tsx:181-196` renders 수정 Link · CorpCardActiveToggle · CorpCardDeleteButton (plan correct; TODOS.md :111 lists only 「비활성화 · 삭제」 for corp-cards — factual slip in the TODO text, no plan impact); `app/globals.css:30-36` gives `button` the same `font-family`/`letter-spacing`/`color: inherit` as text, so the D4 parity check does not need font-family; `package.json:34` `test:e2e:ci` exists (R4 command valid).
- TODOS.md: 「04.4 후속 이연」 :107-117 (row gap) and 「공유 Button `.tertiary` 밑줄을 글자 밑줄로」 (~:180-193) are exactly this scope. TODOS.md history never deletes an entry; resolved items get an inline 「해결: `hash`」 note (:227). The plan never closes its two TODO entries → C1.
- Retrospective: same defect class fixed before (ListEmpty FINDING-005, `2342b01`); #108 fixed people only → FINDING-001 「화면 하나만 예외」. Recurring pattern = per-screen copies of shared visual rules (4 `.rowActions` copies after this plan; eng F1 / PR decision 4 already records it).
- UI scope: yes (Section 11 runs). Design doc: none (quick; source of truth = 260930-f3l DESIGN-REVIEW FINDING-001/002). Office-hours offer skipped: user absent and the problem is measured, not exploratory.
- Landscape check: skipped — search not attempted (CSS glyph underline and flex gap are Layer 1; no product-category question). Prior learnings: none.

### Step 0
- 0A Premise: real problem, solved directly. Measured pain: 1280 row reads 「수정숨기기삭제」 as one word (0px), 「삭제」 glued to its neighbour; phone 375 tertiary underline 13.5px under the glyphs and a 19→20px hover jump. Do-nothing cost: mis-taps on 「삭제」 on phone (0px between 44 boxes) and two 3차 looks in one cell, violating 「화면 하나만 예외 금지」. Not a proxy.
- 0B Leverage: `.rowActions` (people.module.css:164-179) and the ListEmpty underline (ListEmpty.module.css:22-25) reused verbatim; `noHorizontalOverflow` and people.spec.ts gap/one-line patterns reused. No rebuild.
- 0C Dream state:
```
  CURRENT                           THIS PLAN                          12-MONTH IDEAL
  people row: 16px + glyph line  -> vendors/corp-cards/code-tables  -> one 3차 look everywhere (NextTurn,
  other admin rows: 0px, border     rows 16px; shared Button glyph     Table emptyAction too — eng R3 TODO);
  shared tertiary: border-bottom    underline; sweep counts Button     row-action rule shared, not copied 4x
                                                                       (PR decision 4)
```
- 0D: no approach choice needed — the approach was fixed by the user (reuse #108 rule and the unit sweep) and by eng R1–R4 / design D0–D6.
- 0E Mode: HOLD SCOPE. Auto-decided (standing instruction; handoff: 「범위를 넓히는 제안은 받아들이지 않는 쪽이 보수적이다」). Rationale: the plan is a measured fix of two user-scoped TODO items on existing screens; the file count (17, 10 of them tests) is below the 15-changed-source threshold that would call for reduction, and expansion would widen a PR the user scoped while asleep. Approved decisions carried: R1–R4 (eng), D0–D6 (design). No question log (no question asked; QUESTION_TUNING false).
- 0G HOLD checks: (1) complexity — 17 files but 0 new classes/services, 7 source files; minimum already. (2) nothing deferrable without failing a must-have; every test maps to a must_haves truth or an approved R/D row. (3) invariants kept: people.module.css untouched, no new token/color/copy, permission conditions byte-identical.
- 0I Temporal interrogation (human: ~1 day / CC: ~1.5h wall incl. full E2E):
  - Hour 1: read FINDING-001/002 and the checklist; hooks require design-gate + TDD skills before app/ui edits and systematic-debugging after a RED run.
  - Hour 2-3: Task 1 CSS stays uncommitted while Task 2's RED test commit happens — the executor must stage test files only (`git add` by path), or the hook rejects/mixes intents. Already implied by 「commit tests only」; no new decision.
  - Hour 4-5: base is #108's branch; people.spec.ts / tertiary sweep come from #108, so this PR merges only after #108 (PR body line 1). No code dependency beyond that.
  - Hour 6+: full `pnpm test:e2e:ci` (R4) is the long pole; a failure there must be triaged against the base branch before blaming the Button change (systematic-debugging).
  Feasibility blockers: none.

### Section 1 Architecture: No issues found.
```
 app/(app)/admin/{vendors,corp-cards,code-tables}/page.tsx
        │ <span className={styles.rowActions}> (was Fragment)          people.module.css (#108, unchanged)
        ├── Link 수정  className = toggle + rowLink(nowrap)             └─ source of the copied rule
        ├── *Toggle ──► ui/button <Button variant="tertiary">
        └── *DeleteButton ─► DeleteToArchive ─► ui/button tertiary ─► Button.module.css .tertiary
                                                                        (glyph underline; ~24 callers)
```
No new data flow, state machine, endpoint or coupling; the only shared dependency is the existing Button (~24 callers — R4 full suite covers it). Rollback: revert the two `fix:` commits (CSS/markup only), minutes.

### Section 2 Error & Rescue Map: No issues found.
No new method, service, request or exception class. CSS/markup cannot throw at runtime. Error-like outcomes are visual: overflow (R2/D3 tests), underline hidden by a local `text-decoration: none` override (eng probe + R4), hover jump (1280 test).

### Section 3 Security & Threat Model: No issues found.
No new input, endpoint, secret or dependency. `canWrite`/`canArchive`/`archivedAt` conditions stay byte-identical (T-nto-01); code-tables-write-gate and vendors permission E2E rerun in Task 3.

### Section 4 Data Flow & Interaction Edge Cases
No data flow. Interactions:
| INTERACTION | EDGE CASE | HANDLED? | HOW |
|---|---|---|---|
| press 「삭제」 | confirm row in nowrap flex widens cell | yes | confirm-state overflow tests 320–1280 incl. 700 (D3) |
| press toggle twice fast | pending 「…」 splits underline, widens label | accepted | D5 (transient, unchanged Button markup) |
| long row name (60 chars) | table squeezes actions column | yes | seeded long name + gap/one-line tests |
| zero rows / archived row | no actions rendered (`archivedAt ? null`) | yes | unchanged condition; wrapper only inside the non-null branch |
| read-only user | no actions `<td>` | yes | `canWrite || canArchive` unchanged |
No unhandled edge case.

### Section 5 Code Quality
- (carried, eng F1) four `.rowActions` copies — PR decision 4, not re-asked.
- No other issues: `.rowLink` name says what it is for; composition follows archive-table.tsx:66.

### Section 6 Test Review
Diagram and coverage are the eng review's (Section 3 there) plus D3/D4. Assertion check: every must_haves truth maps to a named test (gap/one-line → vendors/corp-cards/code-tables specs; phone gap + 44 → mobile-vendors/corp-cards; overflow normal+confirm → same specs; D4 parity → design-review-p2; glyph underline/hover → mobile-design-review-p2 + design-review-p2 + unit sweep; disabled underline color → unit). 2am-Friday test = R4 full CI=true suite. Flakiness: hover read is instant (no transition on text-decoration — verified `.btn` transition list). No new gaps.

### Section 7 Performance: No issues found (CSS only).

### Section 8 Observability: No issues found. The standing signal is `test/e2e/design-principles.spec.ts:34` (warning-only row-action classifier) plus the unit sweep floor; no runtime codepath to log.

### Section 9 Deployment & Rollout
- Stacked PR: #111 merges only after #108 and after its base is retargeted to main (PR body line 1). Not a new decision — recorded here so the /ship session does not merge out of order.
- No migration, flag or data change. Post-deploy check: staging /admin/vendors row shows three separated actions (the DOM audit/QA already measures this pre-merge).

### Section 10 Long-term trajectory
- Reversibility 5/5. Debt: 4 `.rowActions` copies (PR decision 4) · NextTurn/Table border underline (eng R3 TODO) · TODO bookkeeping gap → C1.

### Section 11 Design & UX: covered by /plan-design-review (9/10, D0–D6). No new issues.
```
 row (≥700): [수정]─16─[숨기기]─16─[삭제] ──press 삭제──► [수정]─16─[숨기기]─16─[확인 문구 · 삭제 확인 · 취소]
                                                          └─취소─► back to row
 row (<700): wraps, 16px vertical; each 44×44
```

### Outside voice
Codex not installed (`which codex` → not found) and CLAUDE.md §4 forbids external (Codex) review. Native fallback needs TaskOutput, which this session does not declare → unavailable. No clean credit; no outside coverage.

## CEO decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| MODE (orchestrator) | handoff 「범위를 넓히는 제안은 받아들이지 않는 쪽이 보수적이다」 | — | HOLD SCOPE | approved | auto-decided under the standing instruction (admin choice) |
| C1 (orchestrator, Section 10 / audit) | TODOS.md :107-117 and 「공유 Button `.tertiary` …」 entry are this plan's scope; history never deletes entries, resolved ones get 「해결: `hash`」 (:227) | plan's docs commit adds R3 TODO only; the two resolved entries stay open | A) append 「해결: `<fix commit>` (quick 260930-nto, PR #111)」 to both entries in the orchestrator's docs commit, text otherwise unchanged · B) leave open | approved | A, auto-decided (standing instruction; conservative = follow the repo's own convention, no deletion, no scope change) — Implementation Task T7 |

### C1: close the two resolved TODO entries
Finding: audit/Section 10, P3, 8/10. Plan's docs step adds the R3 TODO but never marks FINDING-001/002 TODO entries resolved, so TODOS.md would keep advertising fixed work.
Question D1 — C1: mark both TODO entries resolved? Recommendation: A because it follows the file's own 「해결:」 convention and changes no behavior.
Options:
A) Mark resolved (recommended) — one inline 「해결: `hash`」 per entry in the orchestrator's docs commit. Effort S, risk low.
B) Leave open — zero work; TODOS.md stays stale.
Actual answer: A (auto-decided, standing instruction 2026-09-30).

Approval readiness: PASS (MODE — auto-decided admin choice; C1 — A, auto-decided; R1–R4 and D0–D6 carried unchanged from their own ledgers)

### NOT in scope (CEO)
- Scope expansions: none proposed (HOLD SCOPE).
- Carried: org/roles screens · `.rowActions` consolidation (PR decision 4) · NextTurn/Table border underline (eng R3 TODO) · 「삭제」 danger color and confirm redesign (design NOT in scope).

### What already exists (CEO)
Same as the eng and design lists; nothing new found.

### Dream state delta
After this plan: every admin row with more than one action uses one spacing rule, and the shared tertiary Button matches every other 3차 link. Left for the ideal: NextTurn/Table (R3) and one shared row-action rule instead of four copies (user decision).

### Error & Rescue Registry
No failing methods introduced — 0 rows, 0 critical gaps.

### Failure Modes Registry
```
  CODEPATH                | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?          | LOGGED?
  ------------------------|--------------------------------------|----------|-------|---------------------|--------
  .rowActions nowrap      | cell widens table (normal/confirm)   | n/a      | Y R2/D3 | overflow (caught pre-merge) | E2E
  Button .tertiary        | local text-decoration:none hides line| n/a      | Y R4  | no underline (caught) | E2E
  Button .tertiary hover  | box height jump                      | n/a      | Y 1280 | caught             | E2E
  merge order #108→#111   | merged before #108 / wrong base      | n/a      | N (process) | n/a        | PR body line 1
```
0 critical gaps (no RESCUED=N + TEST=N + silent row).

### Stale diagram audit
Files touched carry no ASCII diagrams (CSS/TSX/spec). Plan diagrams above and in eng/design sections are current.

## Implementation Tasks (CEO review)
- [ ] **T7 (P3, human: ~5min / CC: ~1min)** — TODOS.md — mark the two resolved entries 「해결: `<fix commit>` (quick 260930-nto, PR #111)」 (C1)
  - Surfaced by: pre-review audit / Section 10 — TODOS.md :107-117 and the 「공유 Button `.tertiary`」 entry
  - Files: TODOS.md (orchestrator docs commit, together with the eng R3 entry)
  - Verify: `grep -n "260930-nto" TODOS.md` shows both notes; no heading removed (`git diff TODOS.md` has no `-###`)

### Completion Summary (CEO)
```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE (auto, standing instruction)     |
  | System Audit         | facts re-verified; TODO close-out missing   |
  | Step 0               | HOLD; premise real; no approach choice      |
  | Section 1  (Arch)    | 0 issues found                              |
  | Section 2  (Errors)  | 0 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 5 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 1 carried (eng F1), 0 new                   |
  | Section 6  (Tests)   | Diagram carried (eng), 0 gaps               |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 1 risk flagged (stacked merge order, known) |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 3           |
  | Section 11 (Design)  | 0 new issues (covered by design review)     |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 0 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 4 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 new items proposed (C1 closes 2 entries)  |
  | Scope proposals      | 0 proposed, 0 accepted (HOLD)               |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex unavailable (not installed, forbidden)|
  | Lake Score           | N/A (no coverage questions)                 |
  | Diagrams produced    | 3 (dream state, architecture, UI flow)      |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

### Unresolved Decisions (CEO)
None. MODE and C1 were auto-decided under the standing instruction and are listed in PR #111 「사용자 결정 필요」.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps (1 finding C1, applied) |
| Outside Review | codex (plan-eng-review, plan-design-review, plan-ceo-review) | Independent 2nd opinion | 3 | unavailable | not installed + CLAUDE.md §4 forbids external review; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (mapped) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 6/10 → 9/10, 7 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, ceo phase, unavailable (not installed; external review forbidden by CLAUDE.md §4; native fallback lacks TaskOutput) — no completed external review. Design phase: native Claude subagent completed (6 findings, D1–D6), not outside coverage. Eng phase: unavailable.
- **VERDICT:** CEO + DESIGN CLEARED (plan) — eng review findings dispositioned (R1–R4 mapped into Tasks 2–3); ready for `/gsd-quick` execution in a new session.

NO UNRESOLVED DECISIONS

