---
phase: 02-design-system-app-shell
reviewed: 2026-09-19T18:23:49Z
depth: standard
files_reviewed: 69
files_reviewed_list:
  - .dockerignore
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .gitignore
  - app/(app)/account/change-password-form.tsx
  - app/(app)/account/logout-button.tsx
  - app/(app)/account/page.tsx
  - app/(app)/admin/system-status/page.tsx
  - app/(app)/approvals/page.tsx
  - app/(app)/cards/page.tsx
  - app/(app)/error.tsx
  - app/(app)/expenses/page.tsx
  - app/(app)/layout.tsx
  - app/(app)/not-found.tsx
  - app/(app)/page.tsx
  - app/(app)/pnl/page.tsx
  - app/(app)/projects/page.tsx
  - app/(app)/settings/page.tsx
  - app/(auth)/login/login-form.tsx
  - app/(auth)/login/page.tsx
  - app/globals.css
  - app/layout.tsx
  - app/not-found.tsx
  - docs/ARCHITECTURE.md
  - docs/design/DECISIONS.md
  - docs/design/SYSTEM.md
  - docs/design/tokens.css
  - eslint.config.mjs
  - next.config.ts
  - package.json
  - playwright.config.ts
  - public/fonts/pretendard/LICENSE.txt
  - public/fonts/pretendard/pretendard-dynamic-subset.css
  - stylelint.config.mjs
  - test/e2e/a11y.spec.ts
  - test/e2e/keyboard-nav.spec.ts
  - test/e2e/mobile-shell.spec.ts
  - test/unit/ci-guard.test.ts
  - test/unit/deploy/workflows.test.ts
  - test/unit/design-system-docs.test.ts
  - test/unit/stylelint-config.test.ts
  - test/unit/ui/next-turn.test.ts
  - test/unit/ui/role-menu.test.ts
  - ui/auth-frame/AuthFrame.module.css
  - ui/auth-frame/AuthFrame.tsx
  - ui/banner/Banner.module.css
  - ui/banner/Banner.tsx
  - ui/button/Button.module.css
  - ui/button/Button.tsx
  - ui/input/TextField.module.css
  - ui/input/TextField.tsx
  - ui/list-empty/ListEmpty.module.css
  - ui/list-empty/ListEmpty.tsx
  - ui/next-turn/NextTurn.module.css
  - ui/next-turn/NextTurn.tsx
  - ui/next-turn/build-next-turn-view.ts
  - ui/shell/BottomTabs.module.css
  - ui/shell/BottomTabs.tsx
  - ui/shell/MoreSheet.module.css
  - ui/shell/MoreSheet.tsx
  - ui/shell/Shell.module.css
  - ui/shell/Shell.tsx
  - ui/shell/TopBar.module.css
  - ui/shell/TopBar.tsx
  - ui/shell/role-menu.ts
  - ui/status-tag/StatusTag.module.css
  - ui/status-tag/StatusTag.tsx
  - ui/toast/Toast.module.css
  - ui/toast/Toast.tsx
findings:
  critical: 0
  warning: 9
  info: 7
  total: 16
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-19T18:23:49Z
**Depth:** standard
**Files Reviewed:** 69
**Status:** issues_found

## Summary

Phase 02 replaces the Phase 1 placeholder screens with a token-driven design system (`ui/`) and a shared app shell (top bar, phone bottom tabs, `<dialog>`-based "더보기" sheet), plus the lint/CI/build wiring that lets `docs/design/tokens.css` reach the app. Every file in scope was read in full; four claims were additionally tested rather than inferred: the stylelint D-20 guard was probed with synthetic declarations, the new `ui` ESLint boundary was probed through the ESLint API, `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` were run (all green, 272 unit tests), and the Next 16.3 docs were checked for `error.tsx`'s `retry` prop and for layout-level auth guidance.

**Verified sound (no finding):** `ui/**/*.module.css` contains no colour/font/radius literals; no `ui/` file imports past the `ui`/`lib` boundary and the boundary rule provably rejects `ui → domain` and `ui → app`; `TextField` wires `aria-invalid`/`aria-describedby` correctly and blocks caller overrides via `Omit`; `Shell` owns the sole `<main>` with a skip link as first focusable and the §10 landmark set; `Banner` maps info→`status`, warning→`alert`; `MoreSheet`'s open/close/focus-return state machine is consistent in every ordering I traced (Esc, close button, logout, parent re-render); `error.tsx`'s `retry` is stable as of Next 16.3.0; `devIndicators: false` is dev-only; the `RATE_LIMIT_LOGIN_MAX=1000` override lives only in the Playwright process (inherited by its `webServer` child), is not referenced by `Dockerfile`, `deploy.sh` or either workflow, and the rate-limit contract remains covered by `test/integration/rate-limit.test.ts`, which does not load `playwright.config.ts`. No shell component contains `isAdmin` branching (D-23); root home feeds `buildNextTurnView([])` (D-24).

**Key concerns:** the top bar never marks the current menu item even though SYSTEM.md §6-0 specifies it and the CSS for it was written; the PC user menu claims the ARIA `menu` role without arrow-key support and never dismisses on focus-out or outside click; `NextTurn` silently drops every action `href`; the D-20 stylelint guard is bypassable by named colours and the `font` shorthand; and the CI/deploy path filter now excludes documents that unit tests read as inputs, so a docs-only change can land red on `main` without CI running.

## Warnings

### WR-01: Current-menu indicator never renders — `aria-current` is never set

**File:** `ui/shell/TopBar.tsx:79-84`, `ui/shell/TopBar.module.css:43-47`, `ui/shell/BottomTabs.tsx:50-52`
**Issue:** SYSTEM.md §6-0 (line 287) fixes the contract "현재 메뉴는 `--bar-fg` 700 + 아래 2px `--g-400` 밑줄", and §1-3 lists "현재 위치(내비게이션 밑줄)" as one of the five permitted accent uses. `TopBar.module.css` implements it under `.navLink[aria-current="page"]`, but `TopBar.tsx` renders plain `<a href>` elements and never sets `aria-current`, so the selector is dead and no PC user ever sees which primary screen they are on. `BottomTabs.tsx` has the same omission for phone tabs. `TopBar` is already a client component (`"use client"`, `useRouter`), so the pathname is available at no architectural cost. Note the E2E suites do not assert the current-page marker, which is why this shipped green.
**Fix:**
```tsx
// TopBar.tsx (already "use client")
import { usePathname } from "next/navigation";
const pathname = usePathname();
const isCurrent = (href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
// ...
<a key={item.href} href={item.href} className={styles.navLink}
   aria-current={isCurrent(item.href) ? "page" : undefined}>
```
Apply the same to `BottomTabs.tsx` (`.tab[aria-current="page"]` using `var(--inset-tab)` from tokens.css) and add a Playwright assertion that `/projects` renders exactly one `[aria-current="page"]` in `nav[aria-label="주 메뉴"]`.

### WR-02: `role="menu"` without arrow-key navigation

**File:** `ui/shell/TopBar.tsx:57-62`, `ui/shell/TopBar.tsx:101-129`
**Issue:** The user menu is exposed as an ARIA `menu` with `menuitem` children (`aria-haspopup="menu"`), but `handleKeyDown` only handles `Escape`. The WAI-ARIA menu pattern requires ArrowDown/ArrowUp (and Home/End) to move between items; screen readers announce "menu" and users expect arrows, not Tab. Today arrows do nothing and Tab walks out of the menu (see WR-03). Either the role is wrong or the keyboard handling is incomplete; as written it is an accessibility defect that axe cannot detect (axe checks structure, not behaviour). `test/e2e/keyboard-nav.spec.ts:69-73` locks in `getByRole("menu")`, so the cheaper correct fix is to add the key handling rather than change roles.
**Fix:**
```tsx
function handleKeyDown(event: React.KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (!open) return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
  const i = items.indexOf(document.activeElement as HTMLElement);
  const move = (n: number) => { event.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
  if (event.key === "ArrowDown") move(i + 1);
  else if (event.key === "ArrowUp") move(i - 1);
  else if (event.key === "Home") move(0);
  else if (event.key === "End") move(items.length - 1);
}
```

### WR-03: User menu stays open on Tab-out and on outside click

**File:** `ui/shell/TopBar.tsx:89-100`
**Issue:** The only ways to close the menu are Escape, clicking the trigger again, or activating an item. A keyboard user who Tabs past the last item leaves the menu open (`aria-expanded="true"`, popup still covering content) while focus moves into the page; a mouse user who clicks anywhere else also leaves it open. Both are standard dismissal behaviours for a popup and their absence makes `aria-expanded` state wrong relative to what the user is doing.
**Fix:**
```tsx
// on the wrapper div
onBlur={(e) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
}}
// plus, while open:
useEffect(() => {
  if (!open) return;
  const onPointerDown = (e: PointerEvent) => {
    if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("pointerdown", onPointerDown);
  return () => document.removeEventListener("pointerdown", onPointerDown);
}, [open]);
```
(Use `setOpen(false)` here, not `close()`, so focus is not yanked back to the trigger when the user deliberately moved on.)

### WR-04: `NextTurn` discards every action `href` and renders inert buttons

**File:** `ui/next-turn/NextTurn.tsx:45-49`, `ui/next-turn/NextTurn.tsx:53-58`
**Issue:** `NextTurnItem.action` is `{ label; href }` (`build-next-turn-view.ts:12-15`), and §7-4 says the "다음 한 수" must sit on the same line as the reason. The component renders `<Button type="button" variant="tertiary">{item.action.label}</Button>` with no `href`, no `onClick` — the primary affordance of the block does nothing. The "더 보기 N건" button likewise has no handler. `ListEmpty.tsx:11-13` documents the project rule (§10: navigation is `<a>`, action is `<button>`), and `NextTurn` violates it. This is unreachable in Phase 2 only because the home page passes `[]` (D-24); the unit tests cover the pure function, not the render, so the first real item in Phase 4 will expose a dead button.
**Fix:**
```tsx
<span className={styles.action}>
  <a href={item.action.href} className={styles.tertiaryLink}>{item.action.label}</a>
</span>
// and for overflow, accept a target in props:
export type NextTurnProps = { view: NextTurnView; moreHref?: string };
{view.overflowCount > 0 && moreHref ? (
  <a href={moreHref} className={styles.tertiaryLink}>더 보기 {view.overflowCount}건</a>
) : null}
```
Reuse the tertiary-link styles from `ListEmpty.module.css` (`.tertiary`) rather than duplicating them.

### WR-05: Toast auto-dismiss timer restarts on every parent re-render

**File:** `ui/toast/Toast.tsx:28-32`
**Issue:** The effect depends on `onDismiss`. Callers will almost always pass an inline closure (`onDismiss={() => setToast(null)}`), which has a new identity on every render of the parent, so the 4-second timer is cleared and restarted each time the parent re-renders. Any parent that re-renders more often than every 4 s (typing in a form, a `useAction` status change, a polling hook) keeps the toast alive indefinitely, violating §7-6 "4초 뒤 사라짐". `Toast` currently has no consumer (`grep` finds none outside `ui/toast/`), so this is latent, but it ships as a library component. Secondary: the `error` tone keeps `role="status" aria-live="polite"`; an error that persists until dismissed should be `role="alert"`.
**Fix:**
```tsx
const onDismissRef = useRef(onDismiss);
useEffect(() => { onDismissRef.current = onDismiss; });
useEffect(() => {
  if (tone === "error") return;
  const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
  return () => clearTimeout(timer);
}, [tone]);
// ...
<div className={styles.toast} role={tone === "error" ? "alert" : "status"}>
```

### WR-06: Logout paths have no failure handling — `pending` sticks forever / silent no-op

**File:** `app/(app)/account/logout-button.tsx:13-18`, `ui/shell/TopBar.tsx:64-70`, `ui/shell/MoreSheet.tsx:66-71`
**Issue:** All three logout handlers `await authClient.signOut()` then `router.push("/login")` with no `try/catch`. In `logout-button.tsx` (new `pending` state added this phase) a rejected `signOut()` (network drop, 5xx) leaves the button permanently disabled with "로그아웃…" and no message. In `TopBar`/`MoreSheet` the menu/sheet is closed *before* the call, so a failure produces no visible reaction at all — the user thinks they are logged out and are not. Because `Button` sets `disabled` while pending, there is also no way to retry without a reload.
**Fix:**
```tsx
async function handleClick() {
  setPending(true);
  try {
    const { error } = await authClient.signOut();
    if (error) throw error;
    router.push("/login");
  } catch {
    setPending(false);
    setError("로그아웃하지 못했습니다 — 다시 시도하세요."); // render as <p role="alert">
  }
}
```
Apply the same shape in `TopBar.handleLogout` and `MoreSheet.handleLogout` (close the surface only after success, or reopen/surface an error on failure).

### WR-07: Six new pages rely solely on layout-level auth

**File:** `app/(app)/layout.tsx:14-16`; `app/(app)/projects/page.tsx:6`, `expenses/page.tsx:4`, `cards/page.tsx:4`, `approvals/page.tsx:4`, `pnl/page.tsx:4`, `settings/page.tsx:6`
**Issue:** The layout comment says "각 페이지의 자체 인증 검사는 그대로 둔다", but the six new placeholder pages have no check of their own. The Next 16 docs shipped with this repo state explicitly (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350-1358`): layouts do not re-render on navigation, a layout "does not control whether the rest of the route renders", and route segments "appear in the RSC Payload" regardless — do the check in the page or DAL, not the layout. Today these pages hold only static EMPTY copy, so nothing sensitive is exposed; but the pattern is the one the framework documents as an auth bypass, and Phase 4 will put ledger data on exactly these routes. `app/(app)/page.tsx:11-12`, `account/page.tsx:11` and `admin/system-status/page.tsx:16-18` do it correctly.
**Fix:**
```tsx
// each of the six pages
import { requireSession } from "@/lib/viewer";
export default async function ProjectsPage() {
  await requireSession();
  return ( ... );
}
```
Alternatively introduce a `lib/dal.ts` `verifySession()` (per the Next guide) that every page and every repository call goes through, and keep the layout's call only for `userName`.

### WR-08: D-20 stylelint guard is bypassable (named colours, `font` shorthand, other colour properties/functions)

**File:** `stylelint.config.mjs:11-21`
**Issue:** The disallowed-list only matches `#hex`, `rgb[a](`, `hsl[a](`, and the allowed-list only pins `font-family`, `font-size`, `border-radius`. Probed against the actual config (stylelint standalone API, same as `test/unit/stylelint-config.test.ts`), all of the following pass with 0 warnings: `color: white`, `background: red`, `border: 1px solid transparent`, `font: 12px Arial`, `text-decoration-color: #fff`, `color: oklch(50% 0.1 120)`. The `font` shorthand defeats the typeface ban outright, and named/`oklch` colours defeat the colour ban. The unit tests only exercise the cases that are caught, so the gap is invisible to CI.
**Fix:**
```js
rules: {
  "color-named": "never",                       // white, red, transparent...
  "color-no-hex": true,                         // replaces the #hex regex
  "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix"],
  "property-disallowed-list": ["font"],         // force longhands so font-family/-size rules apply
  "declaration-property-value-allowed-list": {
    "font-family": ["/^var\\(--font-sans\\)$/"],
    "font-size":   ["/^var\\(--fs-[\\w-]+\\)$/"],
    "border-radius": ["/^(0|var\\(--radius\\))$/"],
  },
}
```
Add the six probed declarations above to `test/unit/stylelint-config.test.ts` as must-warn cases. (Keep `currentColor`/`inherit` allowed — `color-named` does not flag them.)

### WR-09: CI/deploy path filter excludes documents that unit tests consume

**File:** `.github/workflows/ci.yml:8-13`, `.github/workflows/deploy.yml:11-15`
**Issue:** The filter re-includes only `docs/design/tokens.css` after `!docs/**`. But these unit tests read other docs as test inputs: `test/unit/design-system-docs.test.ts:15-17` (SYSTEM.md, tokens.css, DECISIONS.md — including an exact-count assertion `toBe(6)` on `## 2026-09-19 —` headings at lines 127-129), `test/unit/ui/role-menu.test.ts:11-13` (SYSTEM.md §6-0 table and 「계정」 group sentence), and `test/unit/docs-limits.test.ts:9` (ARCHITECTURE.md/OPERATIONS.md line caps). A PR that edits only `docs/design/SYSTEM.md` (e.g. renames a tab label, or adds a seventh 2026-09-19 decision) runs no CI, merges, skips the deploy, and leaves `main` red until the next unrelated PR — which then fails for a reason unrelated to its own change. The header comment in `design-system-docs.test.ts:5-9` acknowledges the mechanism but only for the commit that introduced the tests.
**Fix:**
```yaml
paths:
  - "**"
  - "!.planning/**"
  - "!docs/**"
  - "docs/design/tokens.css"
  - "docs/design/SYSTEM.md"
  - "docs/design/DECISIONS.md"
  - "docs/ARCHITECTURE.md"
  - "docs/OPERATIONS.md"
```
Mirror the list in `deploy.yml`, and extend the order assertions in `test/unit/ci-guard.test.ts:67-73` and `test/unit/deploy/workflows.test.ts:21-29`. Also consider relaxing `design-system-docs.test.ts:129` from `toBe(6)` to `toBeGreaterThanOrEqual(6)`.

## Info

### IN-01: `.dockerignore` drops all of `docs/` instead of re-including `tokens.css`

**File:** `.dockerignore:8` (deleted line `docs` in the phase diff)
**Issue:** The stated goal was to let `docs/design/tokens.css` reach the image. The change instead admits the whole 9.2 MB `docs/` tree (design HTML mock-ups, research, exports) into the build context and the `build` stage's `COPY . .` layer. Nothing secret was found in `docs/` by scan, and the runtime stage copies only `.next/standalone`, `.next/static`, `public`, `dist/cli`, `db/migrations`, so nothing leaks into the served image — but every future docs edit now invalidates the build layer, and the exclusion no longer expresses intent.
**Fix:** `docs/**` followed by `!docs/design/tokens.css` (Docker honours `!` exceptions beneath an excluded directory).

### IN-02: Vacuous assertion — `SCREENS` length test cannot fail

**File:** `test/e2e/a11y.spec.ts:79-81`
**Issue:** `expect(SCREENS).toHaveLength(6)` asserts the length of a literal array defined 40 lines above in the same file. It can only fail if someone edits both places inconsistently; it does not protect against any application behaviour. Costs a browser test slot for no signal.
**Fix:** Remove it, or replace with an assertion that has an external referent (e.g. every `TOP_BAR_MENU` route from `role-menu.ts` appears in `SCREENS`).

### IN-03: `aria-disabled` on a non-interactive `<span>` conveys nothing

**File:** `ui/shell/MoreSheet.tsx:99`
**Issue:** `aria-disabled="true"` on a `<span>` with no role is not exposed as a disabled control by assistive tech (the element is not focusable and has no widget role); ARIA 1.2 also removed `aria-disabled` from the generic role. Sighted users see `cursor: not-allowed`, screen-reader users hear plain text. The disabled reason text is present, which is the part that matters.
**Fix:** Either render it as `<button type="button" disabled>` with the reason as adjacent text (consistent with `Button`'s `disabledReason` contract), or drop the attribute and keep the reason text.

### IN-04: Pending state disables the focused button, dropping focus to `<body>`

**File:** `ui/button/Button.tsx:32`, `ui/button/Button.tsx:46`
**Issue:** `pending` sets `disabled`, so the moment a user submits, the focused button becomes disabled and focus falls to `<body>`; after a validation error the user is nowhere. The "…" suffix is `aria-hidden`, and there is no `aria-busy`, so a screen-reader user gets no pending feedback either.
**Fix:** Use `aria-disabled={isDisabled}` + `aria-busy={pending}` and guard `onClick` when pending, rather than the native `disabled` attribute while pending.

### IN-05: `⌘K` hint is shown with no behaviour and no disabled reason

**File:** `ui/shell/TopBar.tsx:86-89`
**Issue:** SYSTEM.md §6-0 does call for the `⌘K` text in the bar, so showing it is per spec; but pressing ⌘K does nothing and, unlike the sheet's search row (`MoreSheet.tsx:99-102`), there is no "연결할 대상 데이터 없음" reason. The two surfaces treat the same unimplemented feature inconsistently (UX-06 spirit).
**Fix:** Add a `title`/adjacent reason text mirroring the sheet, or hide the kbd until the palette exists and record the deviation in `DECISIONS.md`.

### IN-06: Google sign-in button left outside the §7-1 hierarchy

**File:** `app/(auth)/login/login-form.tsx:76-83`
**Issue:** The phase migrated the email form to `TextField`/`Button`, but the `showGoogle` branch still renders a raw unstyled `<button>`. When `AUTH_PROVIDER=google` the login screen shows one system button and one browser-default button.
**Fix:** `<Button variant="secondary" onClick={...}>Google로 로그인</Button>`.

### IN-07: New `ui` boundary written in deprecated `eslint-plugin-boundaries` syntax

**File:** `eslint.config.mjs:29`, `eslint.config.mjs:68`
**Issue:** Every `pnpm lint` prints four deprecation warnings from the plugin (`element-types` → `dependencies`, `rules` → `policies`, legacy string selectors, bare `allow` entries). The pre-existing policies had this form; the phase extended it with the `ui` element and policy in the same legacy shape, so the migration debt grew. The rule is still enforced (verified: `ui → domain` and `ui → app` are rejected, `ui → lib` allowed).
**Fix:** Migrate to `boundaries/dependencies` with `policies: [{ from: { element: { type: "ui" } }, allow: [{ to: { element: { type: ["ui", "lib"] } } }] }, ...]` in one dedicated commit.

---

_Reviewed: 2026-09-19T18:23:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
