# Phase 2: 디자인 시스템·앱 셸 - Pattern Map

**Mapped:** 2026-09-19
**Files analyzed:** 27 (신규 `ui/` 11 + 신규 route/config 8 + 수정 대상 8)
**Analogs found:** 22 / 27 (`ui/` 계층은 코드 analog 없음 — 계층 경계 analog + 실물 HTML 마크업 analog로 대체)

All analog paths below were verified with `git ls-files -- <path>` (tracked source, not a mirror).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `eslint.config.mjs` (D-26 diff) | config | transform | `eslint.config.mjs` (existing 8 element types) | exact — edit same file |
| `.dockerignore` (remove `docs` line) | config | file-I/O | `.dockerignore` (existing) | exact — edit same file |
| `stylelint.config.mjs` | config | transform | `eslint.config.mjs` (rule-config shape) | role-match |
| `test/unit/stylelint-config.test.ts` | test | request-response(lint call) | `test/unit/eslint-rules/require-action-client.test.ts` | role-match |
| `test/unit/ui/next-turn.test.ts` | test | transform | `test/unit/docs-limits.test.ts` (pure-function/file assertion style) | role-match |
| `package.json` (`lint` script edit) | config | transform | `package.json` (existing scripts block) | exact |
| `docs/ARCHITECTURE.md` (add `ui` layer) | config/docs | transform | same file, existing §2 4-layer section | exact — edit same file |
| `docs/design/SYSTEM.md` (§6 로그인 템플릿, §7 알림함 계약) | config/docs | transform | same file, existing §6/§7 template sections | exact — edit same file |
| `docs/design/DECISIONS.md` (표 제외 기록 등) | config/docs | transform | same file | exact |
| `public/fonts/pretendard/*` | config | file-I/O | none (binary asset copy) | no analog — see RESEARCH Code Examples |
| `app/layout.tsx` | route/provider | request-response | same file (23→rewrite) | exact — rewrite target |
| `app/globals.css` | config | transform | same file (5 lines→rewrite) | exact — rewrite target |
| `app/page.tsx` | route | request-response | same file (redirect→home) | exact — rewrite target |
| `app/(auth)/login/page.tsx` | route | request-response | same file | exact — rewrite target (behaviour preserve) |
| `app/(auth)/login/login-form.tsx` | component | request-response | same file | exact — rewrite target (behaviour preserve) |
| `app/(app)/account/page.tsx` | route | request-response | same file | exact — rewrite target |
| `app/(app)/account/change-password-form.tsx` | component | request-response | same file | exact — rewrite target (next-safe-action wiring preserve) |
| `app/(app)/account/logout-button.tsx` | component | request-response | same file | exact — rewrite target |
| `app/admin/system-status/page.tsx` | route | request-response | same file | exact — rewrite target (notFound gate preserve) |
| `app/projects/page.tsx` 등 빈 라우트 5개 | route | request-response | `app/admin/system-status/page.tsx` (server component + session gate shape) | role-match |
| `ui/shell/Shell.tsx` | component (shell) | request-response | no code analog — nearest: `app/layout.tsx` body structure + `docs/design/system/preview.html` markup | role-match(markup)/no-analog(code) |
| `ui/shell/TopBar.tsx` | component | request-response | `docs/design/system/preview.html` `.bar` block | markup-analog only |
| `ui/shell/BottomTabs.tsx` | component | request-response | `docs/design/system/preview.html` phone nav block | markup-analog only |
| `ui/shell/MoreSheet.tsx` | component (client) | event-driven | `docs/design/system/sheet-modal.html#more` | markup-analog only |
| `ui/button/Button.tsx` | component | request-response | `app/(app)/account/logout-button.tsx` (button + pending pattern), markup from §7-1 | role-match |
| `ui/input/TextField.tsx` | component | request-response | `app/(app)/account/change-password-form.tsx` (label+input+error triple), markup from `form-expense.html#error` | role-match |
| `ui/status-tag/StatusTag.tsx` | component | transform | `docs/design/system/preview.html` status tag markup, SYSTEM.md §7-5 | markup-analog only |
| `ui/toast/Toast.tsx` | component | event-driven | `docs/design/system/preview.html` toast markup, SYSTEM.md §7-6 | markup-analog only |
| `ui/next-turn/build-next-turn-view.ts` | utility | transform | `domain/` pure-function style (e.g. any existing `domain/*.ts` — none read this phase, use `lib/viewer.ts` shape as TS-strict pure-fn precedent) | role-match |
| `ui/next-turn/NextTurn.tsx` | component | transform | SYSTEM.md §7-4 contract, `docs/design/system/preview.html` "내 차례" block | markup-analog only |
| `ui/list-empty/ListEmpty.tsx` | component | transform | SYSTEM.md §6-1 / §7-7 EMPTY, `preview.html` EMPTY markup | markup-analog only |
| role→menu mapping data file (`domain/` or `ui/` constant, D-23) | utility/config | transform | `lib/viewer.ts` (`SessionUser` shape) for what fields are available | role-match |

## Pattern Assignments

### `eslint.config.mjs` (D-26 — add `ui` boundaries type)

**Analog:** same file, current state (verified via Read this session)

**Current shape** (full file already read):
```js
settings: {
  "boundaries/elements": [
    { type: "app", pattern: "app/**" },
    { type: "domain", pattern: "domain/**" },
    { type: "repositories", pattern: "repositories/**" },
    { type: "db", pattern: "db/**" },
    { type: "lib", pattern: "lib/**" },
    { type: "scripts", pattern: "scripts/**" },
    { type: "test", pattern: "test/**" },
    { type: "eslint", pattern: "eslint/**" },
  ],
},
...
"boundaries/element-types": [
  "error",
  {
    default: "disallow",
    rules: [
      { from: "app", allow: ["app", "domain", "lib"] },
      { from: "domain", allow: ["domain", "repositories", "lib"] },
      { from: "repositories", allow: ["repositories", "db", "domain"] },
      { from: "db", allow: ["db", "lib"] },
      { from: "lib", allow: ["lib", "domain", "repositories", "db"] },
      { from: "scripts", allow: ["scripts", "domain", "repositories", "db", "lib"] },
      {
        from: "test",
        allow: ["test", "app", "domain", "repositories", "db", "lib", "scripts", "eslint"],
      },
      { from: "eslint", allow: ["eslint"] },
    ],
  },
],
```

**Exact diff to apply (RESEARCH.md Pattern 2, verified in this session's probe build):**
```diff
+        { type: "ui", pattern: "ui/**" },
...
-            { from: "app", allow: ["app", "domain", "lib"] },
+            { from: "app", allow: ["app", "domain", "lib", "ui"] },
...
             {
               from: "test",
-              allow: ["test", "app", "domain", "repositories", "db", "lib", "scripts", "eslint"],
+              allow: ["test", "app", "domain", "repositories", "db", "lib", "scripts", "eslint", "ui"],
             },
             { from: "eslint", allow: ["eslint"] },
+            { from: "ui", allow: ["ui", "lib"] },
```

**Critical ordering constraint:** this edit MUST land in Wave 0, before any `ui/**` file is created — RESEARCH.md verified that with `ui` unregistered, `boundaries/element-types` silently allows `ui/` to import `domain`/`repositories` (no error at all). Keep the existing "string selector, old `rules`/`element-types` API" style — do not migrate to the new `policies`/`dependencies` API (that's a separate, out-of-scope migration; mixing styles is what "follow existing convention" forbids here).

**Docs cross-reference:** `docs/ARCHITECTURE.md` §2 (4-layer diagram, lines 12-29) must gain a 5th layer line for `ui/` — keep the same ASCII-diagram style and the "횡단: `lib/`..." sentence pattern already there. Stay inside the 300-line cap enforced by `test/unit/docs-limits.test.ts`.

---

### `.dockerignore` (remove `docs` exclusion)

**Analog:** same file (12 lines, verified via Read).

**Current relevant lines:**
```
.git
.planning
docs
test
```

**Exact edit:**
```diff
 .git
 .planning
-docs
 test
```
Do not remove `.planning` or `test` — only `docs` is blocking D-21 (`app/layout.tsx` will `import "../docs/design/tokens.css"`). Runtime image size is unaffected (multi-stage `Dockerfile` only `COPY --from=build` selected artifacts into `runtime`, never `docs/` — verified by reading `Dockerfile` this session per RESEARCH.md).

---

### `stylelint.config.mjs` (new file, D-20)

**Analog for config shape:** `eslint.config.mjs` — this repo's convention is a single flat config object exported as default, ESM (`package.json` has `"type": "module"`).

**Analog for "custom rule + rule test" precedent:** `eslint/index.mjs` (plugin registration) + `test/unit/eslint-rules/*.test.ts` (rule test files). D-20 explicitly says stylelint should follow this precedent ("규칙 자체에도 테스트를 붙이고").

**Exact config to write** (RESEARCH.md Code Examples, verified against `stylelint@17.15.0` tarball source):
```js
export default {
  rules: {
    "declaration-property-value-allowed-list": {
      "font-family": ["/^var\\(--font-sans\\)$/"],
      "font-size": ["/^var\\(--fs-[\\w-]+\\)$/"],
      "border-radius": ["/^(0|var\\(--radius\\))$/"],
    },
    "declaration-property-value-disallowed-list": {
      "/^(color|background|background-color|.*border.*color.*|outline-color|fill|stroke|accent-color|caret-color|box-shadow|border|outline|background-image)$/": [
        "/#[0-9a-f]{3,8}\\b/i",
        "/\\brgba?\\(/i",
        "/\\bhsla?\\(/i",
      ],
    },
  },
};
```
**IMPORTANT — amendment applies here:** per the amendment section above, the ban covers **colour, font, radius only** — do NOT add the spacing (`margin|padding|gap`) `allowed-list` block that RESEARCH.md's first draft included. Reference HTML has ~113 hardcoded spacing declarations (103 with no token match); banning spacing rejects the very markup SYSTEM.md tells the executor to port. `box-shadow`'s px offsets stay untouched (Pitfall 2 in RESEARCH.md) — only hex/rgb/hsl color literals inside it are disallowed.

**`#fff` → `var(--bg)` substitution rule (Pitfall 1):** every `color:#fff` / `background:#fff` found while porting `preview.html`, `sheet-modal.html`, `form-expense.html` becomes `var(--bg)` verbatim — same computed value, no new token, no DECISIONS.md entry needed.

**Wiring into `package.json` `lint` script** — analog is the existing single-line script convention:
```diff
-    "lint": "eslint .",
+    "lint": "eslint . && stylelint \"ui/**/*.module.css\" \"app/globals.css\" \"app/**/*.module.css\"",
```
No CI workflow file edit needed for this — `.github/workflows/ci.yml`'s `quality` job already runs `pnpm lint`.

---

### `test/unit/stylelint-config.test.ts`

**Analog:** `test/unit/eslint-rules/require-action-client.test.ts` (rule-test-per-file pattern) — same idea, different runner (stylelint's own `lint()` API instead of `RuleTester`).

**Imports pattern from analog** (lines 1-9):
```ts
import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/require-action-client.mjs";
```
Adapt to stylelint's `standalone` API (verified in RESEARCH.md Code Examples):
```ts
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config from "../../stylelint.config.mjs";

async function lint(code: string) {
  const { results } = await stylelint.lint({ code, config });
  return results[0].warnings;
}
```

**valid/invalid pairing convention from analog** (lines 18-50, `ruleTester.run("require-action-client", rule, { valid: [...], invalid: [...] })`): keep the same "one named case per behaviour" style, `describe`/`it` blocks per RESEARCH.md's example (color literal fails, `var(--bg)` passes, box-shadow px offset passes, border-radius literal fails).

---

### `test/unit/ui/next-turn.test.ts` (D-24)

**Analog:** `test/unit/docs-limits.test.ts` — pure-function-in, assertion-out style with no DOM/React rendering (lines 1-16: read input, compute, `expect(...).toBe/toContain`). `build-next-turn-view.ts` should be a pure function so this same no-render test style applies directly.

**Boundaries prerequisite:** this test file imports `ui/next-turn/build-next-turn-view.ts` — requires the `{ from: "test", allow: [..., "ui"] }` edit above to exist first (RESEARCH.md's cross-dependency finding). Sequence this test file's creation strictly after the `eslint.config.mjs` edit lands.

---

### `docs/ARCHITECTURE.md` — add `ui` layer (D-26 doc requirement)

**Analog:** same file §2 (lines 12-29), existing 4-layer ASCII diagram + "횡단: `lib/`..." sentence. Follow the exact same terse style (one line per layer, arrow diagram, cross-cutting note at bottom). 300-line cap is enforced by `test/unit/docs-limits.test.ts` — check current line count before adding.

---

### `docs/design/SYSTEM.md` — §6 로그인 템플릿, §7 알림함 계약 (D-30, D-31)

**Analog:** same file's existing template sections — §6-3 폼 화면 (lines 366-400) is the closest existing template shape for the new §6 로그인 template (D-30 says 내 계정 reuses §6-3 as-is, so 로그인's structure should mirror §6-3's level of prose/spec detail: layout description → states → accessibility notes). §7-5 상태 태그 (line 597) and §7-6 토스트 (line 603) are the closest existing component-contract shape for the new §7 알림함·배지 section (D-31) — match their format (short spec: visual states, entry points, badge-count relationship to existing count sources).

**Constraint from CLAUDE.md:** "이 파일과 @import 대상은 세션 중 수정 금지" does not apply to this doc (SYSTEM.md is not a CLAUDE.md @import target) but D-27 applies: any HTML-vs-SYSTEM.md discrepancy discovered while porting must be fixed in SYSTEM.md first, then in DECISIONS.md as a recorded reason — never a one-off code exception.

---

### `app/layout.tsx` — rewrite target (behaviour to preserve vs markup to replace)

**Current file** (23 lines, full content read this session):
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { SessionRefresh } from "./session-refresh";

export const metadata: Metadata = {
  title: "PLANT8 ERP",
  description: "PLANT8 ERP — 프로젝트·지출결의·법인카드·손익 관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SessionRefresh />
        {children}
      </body>
    </html>
  );
}
```

**Behaviour to preserve:** `metadata` export unchanged; `<SessionRefresh />` must remain mounted exactly once at the root (it's the sliding-session cookie-extension mechanism — removing it silently breaks 30-day session extension, per `docs/ARCHITECTURE.md` §4 and the code comment in `app/session-refresh.tsx`).

**Markup/wiring to add (D-21, D-32):**
```tsx
import "./globals.css";
import "../docs/design/tokens.css";       // D-21 — direct import, single source
// <head><link rel="stylesheet" href="/fonts/pretendard/pretendard-dynamic-subset.css" /></head>  // D-32
```
Shell insertion (`<Shell nav={...} tabs={...}>{children}</Shell>`) happens here per RESEARCH.md's architecture diagram — `Shell` reads viewer via `getSession()` (same pattern as `app/page.tsx`/`app/(app)/account/page.tsx` below) and maps role→nav via the D-23 mapping constant.

---

### `app/globals.css` — rewrite target

**Current file** (5 lines, box-sizing reset only, read this session):
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```
**Preserve this block verbatim** (it's not covered by D-20/D-19 changes) and append `body { font-family: var(--font-sans); }` (D-32 pattern, RESEARCH.md Code Examples) — nothing else goes in `globals.css`; all component styling goes in CSS Modules co-located under `ui/`.

---

### `app/page.tsx` — D-28 rewrite (root becomes 「내 차례」 home)

**Current file** (7 lines, read this session):
```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/account" : "/login");
}
```
**Behaviour to preserve:** unauthenticated → `/login` redirect must survive (D-28 only changes the authenticated branch). **Markup to replace:** authenticated branch no longer redirects to `/account` — it renders `<NextTurn items={[]} />` then falls through to list EMPTY per D-24/D-28 ("건수 0이면 사라지고 목록 EMPTY가 올라온다"). This is the same `getSession()` call pattern used by `app/(app)/account/page.tsx` and `app/admin/system-status/page.tsx` below — reuse it, don't invent a new session-read helper.

---

### `app/(auth)/login/page.tsx` + `login-form.tsx` — D-30 rewrite (behaviour vs markup)

**Current files** (full content read this session, 23 + 89 lines).

**Behaviour to preserve exactly:**
- `getAuthProvider() === "google"` conditional passed as `showGoogle` prop from server component to client component (comment explains why: only client can call `authClient.signIn.social`)
- `authClient.signIn.email({ email, password })` call, `result.error` → generic error message (no email/password distinction — this is a locked Phase 1 discretion decision, do not "improve" it)
- `router.push("/account")` on success
- `reason=password-changed` query param → `role="status"` message
- `role="alert"` on the error paragraph

**E2E selectors that MUST keep working** (`test/e2e/login-logout.spec.ts` lines 9-11, `change-password.spec.ts` lines 11-13, `system-status.spec.ts` lines 9-11):
```ts
page.getByLabel("이메일")
page.getByLabel("비밀번호")
page.getByRole("button", { name: "로그인" })
```
These resolve via `<label htmlFor="email">이메일</label>` + `<input id="email">` association — when porting to `ui/input/TextField.tsx`, the label text and htmlFor/id pairing must be preserved verbatim (don't rename to English or change the visible label text).

**Markup to replace:** the whole `<form>`/`<div>`/raw `<input>` tree becomes `ui/input/TextField` + `ui/button/Button` per §7-1/§7-2, and the page itself gets the new shell-less D-30 login template layout (wordmark + form only, no TopBar/BottomTabs).

---

### `app/(app)/account/page.tsx` + `change-password-form.tsx` + `logout-button.tsx` — rewrite (§6-3 폼 템플릿 재사용)

**Current files** (full content read this session, 21 + 52 + 24 lines).

**Behaviour to preserve exactly:**
- `requireSession()` (redirects to `/login` if unauthenticated) — same helper `app/admin/system-status/page.tsx` calls via `getSession()`+manual redirect; account page uses the combined `requireSession()` variant. Keep using whichever each page already uses.
- `user.passwordIsTemporary` → `role="status"` banner (D-08) — **amendment note:** SYSTEM.md has no 배너 template today; this banner's markup must still render even though SYSTEM.md gap isn't filled by this phase's Wave 0 doc pass unless D-30/D-31 additions happen to cover it — flag to planner: add a minimal §6-3 addendum for "server-rendered status banner" if not already covered.
- `useAction(changePasswordAction)` wiring from `next-safe-action/hooks`, exact field-error extraction shape:
```tsx
const { execute, result, isExecuting } = useAction(changePasswordAction);
const currentPasswordError = result.validationErrors?.currentPassword?._errors?.[0];
const newPasswordError = result.validationErrors?.newPassword?._errors?.[0];
// result.serverError for top-level errors
```
This is the concrete "server validation error" shape §7-2 must render — `ui/input/TextField` needs an `error?: string` prop that plugs directly into this.
- `authClient.signOut()` then `router.push("/login")` in logout button — unchanged.

**E2E selectors that MUST keep working** (`test/e2e/change-password.spec.ts` lines 20-51):
```ts
page.getByLabel("현재 비밀번호")
page.getByLabel("새 비밀번호")
page.getByRole("button", { name: "비밀번호 변경" })
page.getByRole("button", { name: "로그아웃" })
page.getByRole("alert")   // top-level serverError paragraph
page.getByText("임시 비밀번호를 쓰고 있습니다")
page.getByText("현재 비밀번호가 올바르지 않습니다.")
page.getByText("8자 이상이어야 합니다.")
```
None of this validation-message text may change when the form is re-skinned.

---

### `app/admin/system-status/page.tsx` — D-29 rewrite

**Current file** (60 lines, full content read this session).

**Behaviour to preserve exactly (V4 Access Control, ASVS):**
```tsx
export const dynamic = "force-dynamic";   // D-18 — no caching
const session = await getSession();
if (!session) redirect("/login");
if (!session.viewer.isAdmin) notFound();  // D-17 — employees get 404, not 403
```
Do not touch this gate logic — only the JSX below it moves into shell + `ui/status-tag`/`ui/five-states` components.

**E2E selectors that MUST keep working** (`test/e2e/system-status.spec.ts` lines 30-37):
```ts
page.getByText("배포 버전")
page.getByText("DB 커넥션")
page.getByText("마지막 백업")
page.getByText("확인 불가")
page.getByText(/DB 커넥션이 한도의/)   // banner, role="alert" today
```
The `role="alert"` banner for the connection-limit warning (D-17 한도 배너) must keep its text pattern `DB 커넥션이 한도의 {N}%를 넘었습니다.` — this is another instance of the "SYSTEM.md has no 배너 template" gap flagged in the amendment; note it for the planner the same way as the account page's temp-password banner.

---

### `app/session-refresh.tsx` — no change expected

**Analog:** itself (18 lines, read this session) — must remain untouched and still mounted from `app/layout.tsx`. No pattern extraction needed beyond "don't delete this."

---

### Role→menu mapping data (D-23)

**Analog for what session data is actually available:** `lib/viewer.ts` `SessionUser` type (lines 7-13, read this session):
```ts
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  passwordIsTemporary: boolean;
};
```
**No `team`/소속 field exists.** Per the amendment, TopBar must treat 소속 as optional/absent for Phase 2, not require it. The role→menu mapping function should take `{ isAdmin: boolean }` (the `Viewer` shape already used by `authedActionClient`'s `ctx.viewer`, see `lib/actions/client.ts` lines 12-19) as its only input — Phase 3 will widen this when a 5-role field lands, per D-23's "매핑 한 곳만 교체" design.

---

## Shared Patterns

### Server session read (RSC pages)
**Source:** `lib/viewer.ts` (`getSession()`, `requireSession()`), used identically in `app/page.tsx`, `app/(app)/account/page.tsx`, `app/admin/system-status/page.tsx`.
**Apply to:** `app/layout.tsx` (for Shell's nav/tabs props), all 5 empty routes (D-22), the new login page (no session needed there).
```ts
import { getSession, requireSession } from "@/lib/viewer";
const session = await getSession();       // returns null if unauthenticated
const { viewer, user } = await requireSession(); // redirects to /login if unauthenticated
```

### next-safe-action client-side wiring
**Source:** `app/(app)/account/change-password-form.tsx` lines 1-22.
**Apply to:** any new form (`ui/input/TextField` + `ui/button/Button` composition) that submits a Server Action — login form intentionally does NOT use this (it calls `authClient.signIn.email` directly, a better-auth client call, not a `next-safe-action` action) — do not force login onto this pattern.

### Error display convention
**Source:** `role="alert"` for server/validation errors (`login-form.tsx` line 72, `change-password-form.tsx` lines 39/44/46, `system-status/page.tsx` line 56), `role="status"` for informational banners (`login/page.tsx` line 18, `account/page.tsx` line 15).
**Apply to:** `ui/input/TextField`'s error slot and any toast/banner component — keep the `alert` vs `status` ARIA role distinction, it maps directly to SYSTEM.md §10 접근성 계약.

### Custom-lint-rule + rule-test pattern
**Source:** `eslint/index.mjs` (plugin registration, 3 rules) + `test/unit/eslint-rules/require-action-client.test.ts` (`@typescript-eslint/rule-tester`, `RuleTester.afterAll/describe/it` wired to vitest, `valid`/`invalid` arrays with named cases).
**Apply to:** `stylelint.config.mjs` + `test/unit/stylelint-config.test.ts` (D-20), using stylelint's own `stylelint.lint({ code, config })` API instead of `RuleTester` (no rule-tester equivalent exists for stylelint — this is a deliberate adaptation, not a literal copy).

### Docs-invariant test pattern
**Source:** `test/unit/docs-limits.test.ts` (line-count assertions + `it.each([...])("포함한다")` token-presence assertions).
**Apply to:** if planner wants a "SYSTEM.md contains §6 로그인 / §7 알림함" regression guard, or a tokens.css byte-identity check (D-21's fallback plan if direct import somehow fails), this exact `it.each` + `toContain`/`toBeLessThanOrEqual` style applies directly.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `ui/shell/*.tsx`, `ui/button/*`, `ui/input/*`, `ui/status-tag/*`, `ui/toast/*`, `ui/next-turn/*`, `ui/list-empty/*` (React component code + CSS Modules) | component | request-response/transform | `ui/` is a brand-new top-level layer — no existing React component in this repo to copy structure from (only 4 route-level components exist, all thin). Executor should follow: (1) the CSS-Modules-co-located-with-component layout verified working in RESEARCH.md ("Recommended Project Structure"), (2) markup ported from `docs/design/system/preview.html` / `sheet-modal.html#more` / `form-expense.html#error`, and (3) props/behaviour shape borrowed from the thin `app/` components listed above (e.g. `Button`'s `disabled={pending}` comes from `logout-button.tsx`/`login-form.tsx`'s submit buttons). |
| `public/fonts/pretendard/*` (92 woff2 + css + LICENSE) | config/static asset | file-I/O | Binary asset copy, not code — exact `npm pack` + `cp` commands are in RESEARCH.md Code Examples, not a codebase pattern. |
| `app/projects/page.tsx` et al. (5 empty routes) | route | request-response | No existing "EMPTY state only" route exists yet in this repo — closest is `app/admin/system-status/page.tsx`'s session-gate shape (reuse that), but the EMPTY-state rendering itself has no code precedent, only the SYSTEM.md §6-1/§7-7 spec and `preview.html`'s EMPTY markup. |

## Metadata

**Analog search scope:** `app/**` (all 4 existing screens, full read), `eslint.config.mjs`, `eslint/index.mjs`, `test/unit/eslint-rules/**`, `test/unit/docs-limits.test.ts`, `lib/viewer.ts`, `lib/actions/client.ts`, `app/session-refresh.tsx`, `docs/ARCHITECTURE.md`, `.dockerignore`, `package.json`, `test/e2e/{login-logout,change-password,system-status}.spec.ts`, `docs/design/tokens.css` (head), `docs/design/SYSTEM.md` (section index).
**Files scanned:** ~25 source files + 3 E2E specs + 2 config files.
**Pattern extraction date:** 2026-09-19
**Tracked-source verification:** all named analog paths are ordinary git-tracked repo files under `app/`, `lib/`, `eslint/`, `test/`, `docs/` — none are under `.gsd/`, `.claude/skills/*/node_modules`, or any other gitignored mirror path (confirmed against `.gitignore`, read this session).
