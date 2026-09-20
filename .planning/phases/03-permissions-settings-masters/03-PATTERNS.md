# Phase 3: 권한·설정·마스터 - Pattern Map

**Mapped:** 2026-09-20
**Files analyzed:** ~40 (mechanism modules + master-data modules + shared registries; exact plan-file count is a planner decision per D-33/D-34)
**Analogs found:** 34 / 40 (see "No Analog Found" for the 6 genuinely new mechanisms)

All analogs below were verified tracked with `git ls-files` (repo has no `.gsd/capabilities` mirror layout — this is a plain app repo, not a plugin/capability tree, so the tracked-source gate reduces to "file is in `git ls-files`", confirmed for every path cited).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `domain/permissions/can.ts` | service (policy) | request-response | `domain/system-status/index.ts` (`getSystemStatus` gate shape) | role-match |
| `domain/permissions/visible.ts` | service (policy) | request-response | `domain/system-status/index.ts` | role-match |
| `domain/permissions/scope-for.ts` | service (policy, called by repositories) | CRUD (row filter) | `repositories/users.ts` (`void viewer` placeholder) | role-match |
| `domain/permissions/project.ts` | service (DTO projection) | transform | `repositories/users.ts` (`UserRow` naming convention) | partial (no existing projection function) |
| `domain/permissions/roles.ts` | model/const registry | CRUD | `db/schema/auth.ts` (`users` table) + `lib/env.ts` (`ENV_KEYS` registry-of-keys pattern) | role-match |
| `domain/settings/registry.ts` | service (registry) | CRUD + event-driven (export/import) | `lib/env.ts` (zod schema + key-array shape) | role-match |
| `repositories/settings.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/roles.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/org-units.ts`, `repositories/teams.ts`, `repositories/team-memberships.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/vendors.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/corp-cards.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/code-tables.ts` | repository | CRUD | `repositories/users.ts` | exact |
| `repositories/archive.ts` | repository | CRUD (soft-delete) | `repositories/users.ts` (`setPasswordTemporary` update-by-id shape) | role-match |
| `repositories/action-log.ts` | repository | event-driven (append) + CRUD (query/filter) | `repositories/login-attempts.ts` (append-only + indexed lookup) | exact |
| `lib/crypto.ts` | utility (crypto) | transform | `lib/env.ts` (`optionalString()` fail-open vs fail-closed contrast; no direct crypto analog exists) | partial |
| `db/schema/roles.ts` (roles table, `users.role_id` FK) | migration/schema | CRUD | `db/schema/auth.ts` (`users` table + FK pattern in `sessions`/`accounts`) | exact |
| `db/schema/org.ts` (org_units, teams, team_memberships) | migration/schema | CRUD | `db/schema/auth.ts` | exact |
| `db/schema/vendors.ts`, `db/schema/corp-cards.ts`, `db/schema/code-tables.ts` | migration/schema | CRUD | `db/schema/auth.ts` | exact |
| `db/schema/settings.ts` (settings_simple, settings_historized) | migration/schema | CRUD | `db/schema/login-attempts.ts` (indexed timestamp-range table) | role-match |
| `db/schema/action-log.ts` | migration/schema | event-driven | `db/schema/login-attempts.ts` | exact |
| `db/schema/field-definitions.ts` (custom_fields JSONB + GIN) | migration/schema | CRUD | `db/schema/login-attempts.ts` (index declaration shape) — GIN specifics from RESEARCH.md Code Example 2 | role-match |
| `db/migrations/000X_*.sql` (all new tables/FKs/indexes) | migration | batch | `db/migrations/0001_login_attempts.sql` | exact |
| `eslint/rules/no-row-type-escape.mjs` | config (lint rule) | transform (static analysis) | `eslint/rules/money-boundary.mjs` | exact |
| `test/unit/eslint-rules/no-row-type-escape.test.ts` | test (unit) | request-response (rule invocation) | `test/unit/eslint-rules/repository-viewer-param.test.ts` | exact |
| `domain/permissions/can.test.ts`, `visible.test.ts`, `scope-for.test.ts`, `project.test.ts` | test (unit) | request-response | `test/unit/system-status.test.ts` | exact |
| `test/integration/leak-scan.test.ts` | test (integration, generated) | batch | `test/unit/ci-guard.test.ts` (dynamic assertion loops) + `test/unit/design-system-docs.test.ts` (`it.each`) | role-match |
| `test/integration/{roles,vendors,corp-cards,code-tables,team-memberships,archive}.test.ts` | test (integration) | CRUD | `test/integration/system-status.test.ts` | exact |
| `test/e2e/action-log.spec.ts`, permissions/visibility E2E specs | test (E2E) | request-response | `test/e2e/system-status.spec.ts` | exact |
| `test/e2e/fixtures.ts` (`createFixtureUser` signature change) | test fixture | request-response | itself (modify in place) — pattern source `domain/auth/accounts.ts` (`createAccount`) | exact |
| `lib/actions/registry.ts` (D-38 action registry) | service (registry) | event-driven | `lib/actions/client.ts` | role-match |
| `app/(app)/admin/permissions/page.tsx` | route (RSC page) | request-response | `app/(app)/admin/system-status/page.tsx` | exact |
| `app/(app)/admin/permissions/actions.ts` | controller (server action) | request-response | `app/(app)/account/actions.ts` (`changePasswordAction`) | exact |
| `app/(app)/admin/visibility/page.tsx` + actions | route + controller | request-response | same pair as above | exact |
| `app/(app)/admin/{people,vendors,corp-cards,code-tables}/page.tsx` (list) | route (RSC page) | CRUD | `app/(app)/admin/system-status/page.tsx` (`KvList`/`PageHeader` composition) — no list-template page exists yet, so this is the closest server-component shape | role-match |
| `app/(app)/admin/{people,vendors,corp-cards,code-tables}/[id]/edit/page.tsx` or modal form | route/component (form) | request-response | `app/(app)/account/change-password-form.tsx` (client form + server action pairing) | role-match |
| `ui/permission-grid/PermissionGrid.tsx` (D-40 checkbox matrix) | component | request-response | `ui/kv-list/KvList.tsx` (data-table-ish list rendering, closest existing `ui/` data component) | partial (no grid analog; see No Analog Found) |
| `ui/shell/role-menu.ts` (rewrite for 5 roles + permission table) | utility/config (pure function) | transform | itself (rewrite in place) | exact |
| `db/schema/auth.ts` (`users.role_id` column add) | migration/schema | CRUD | itself (edit in place) — FK pattern from `sessions.userId` | exact |
| `domain/viewer.ts` (remove `isAdmin`, add `roleId`) | model (type) | transform | itself (edit in place) | exact |

## Pattern Assignments

### `domain/permissions/can.ts` / `visible.ts` (service, request-response)

**Analog:** `domain/system-status/index.ts`

**Imports pattern** (lines 1-9):
```typescript
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";
import {
  countConnections as defaultCountConnections,
  maxConnections as defaultMaxConnections,
} from "@/repositories/system-status";
```
Copy the shape: domain module imports its own repository functions with `default*` aliasing for dependency injection (see `StatusDeps` pattern below) — `can()`/`visible()` should accept an optional `deps` bag the same way if they need to hit a `permission_matrix`/`visibility_matrix` repository.

**Error/guard pattern** (lines 10, 36-44):
```typescript
export class NotAdminError extends Error {}
// ...
if (!viewer.isAdmin) {
  throw new NotAdminError("관리자만 볼 수 있습니다.");
}
```
D-36 removes `viewer.isAdmin` — replace this exact guard shape with `if (!can(viewer, "system-status", "view")) throw new NotAdminError(...)`. Keep the custom `Error` subclass pattern (`NotAdminError`) for `can()`/`visible()` failures too, e.g. `class ForbiddenError extends Error {}`.

**Dependency-injection pattern for testability** (lines 23-28, 40-48):
```typescript
export type StatusDeps = {
  countConnections: typeof defaultCountConnections;
  maxConnections: typeof defaultMaxConnections;
  getLastBackup: typeof defaultGetLastBackup;
  now?: () => Date;
};
// ...
const countConnections = deps?.countConnections ?? defaultCountConnections;
```
`can()`/`visible()`/`scopeFor()` should follow this exact `deps?: Partial<XDeps>` override pattern so unit tests (see below) can stub the repository without hitting Postgres.

**Pure-function policy pattern** (lines 30-34):
```typescript
export function connectionBanner(connections: number, maxConnections: number, ratio: number): boolean {
  if (maxConnections <= 0) return false;
  return connections / maxConnections >= ratio;
}
```
`can(viewer, menu, action)` and `visible(viewer, item)` should be pure, synchronous, unit-testable functions in this same style, separate from any async repository-backed variant if one is needed.

---

### `domain/permissions/scope-for.ts` (service, called from repositories)

**Analog:** `repositories/users.ts` lines 9-10, and `eslint/rules/repository-viewer-param.mjs`

```typescript
// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙,
// 01-04 린트가 첫 인자 필수를 강제한다).
export async function findUserByEmail(viewer: Viewer, email: string): Promise<UserRow | null> {
  void viewer;
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}
```
This is the exact call site every new/modified repository function must fill in for Phase 3: replace `void viewer;` with `const scope = scopeFor(viewer, "users"); ... .where(and(eq(...), scope))`. The `boundaries/element-types` rule already allows `repositories → domain` (`eslint.config.mjs:43`), so `import { scopeFor } from "@/domain/permissions/scope-for"` inside `repositories/*.ts` is a legal import today — no config change needed.

**Repository-viewer-param lint enforcement** (already active, `eslint/rules/repository-viewer-param.mjs:12-35`): every new repository export's first parameter must be a literal `viewer` identifier or the custom rule fails the build. All 12 new repository files listed above must follow `repositories/users.ts`'s signature shape exactly.

---

### `domain/permissions/project.ts` (DTO projection, domain's only "exit")

**Analog:** `repositories/users.ts` line 7 (`UserRow` naming) + ROADMAP/ARCHITECTURE's documented `project(viewer, dto)` contract (no running implementation exists yet — this is the primary "No Analog Found" item, see below, but the naming convention to reuse is concrete):

```typescript
export type UserRow = InferSelectModel<typeof users>;
```
Adopt `*Row` for every repository return type (already the convention) and `*Dto` for every domain-exported projected type, since `eslint/rules/no-row-type-escape.mjs` (new, see below) will pattern-match on this naming convention the same way `money-boundary.mjs` pattern-matches on `\bMoney\b`.

---

### `domain/settings/registry.ts` (settings registry)

**Analog:** `lib/env.ts` (zod schema + key registry shape — read the `ENV_KEYS` array and `optionalString()` helper directly; only the schema-definition idiom transfers, not the storage: `lib/env.ts` parses env vars once at boot, the new registry reads a DB table per RESEARCH.md §5).

Copy the "fail if unset" pattern from `lib/crypto.ts`'s design (RESEARCH.md Code Example 1) for any registry key marked required rather than `lib/env.ts`'s `optionalString()`.

---

### `repositories/action-log.ts` (append + filtered query)

**Analog:** `db/schema/login-attempts.ts` + `repositories/users.ts`

```typescript
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    ip: text("ip"),
    attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolvedReason: text("resolved_reason"),
  },
  (table) => [index("login_attempts_email_attempted_idx").on(table.email, table.attemptedAt)],
);
```
`action_log` should follow this exact shape: `uuid` PK with `defaultRandom()`, `notNull().defaultNow()` timestamp, and a composite btree index on the columns ADMN-10 filters by (actor, occurred_at, action_type, document_id) — copy the two-column composite index syntax verbatim, extended to the needed columns.

---

### New Drizzle table + migration (all new schema files)

**Analog:** `db/schema/auth.ts` (table shape) + `db/migrations/0001_login_attempts.sql` (migration shape)

```sql
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	...
);
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "login_attempts_email_attempted_idx" ON "login_attempts" USING btree ("email","attempted_at");
```
Every Phase 3 migration that adds an FK (`role_id`, `team_id`, etc.) or an index (btree or GIN) must manually insert the `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` pair immediately before the `CREATE INDEX`/`ADD CONSTRAINT` statement — `drizzle-kit generate` does not emit these (RESEARCH.md Pitfall 2, verified). `CREATE TABLE` statements themselves need no timeout guard (verified via squawk 1st-run output in RESEARCH.md §3).

---

### `eslint/rules/no-row-type-escape.mjs` (new custom lint rule)

**Analog:** `eslint/rules/money-boundary.mjs` (full file, type-aware pattern)

```javascript
const MONEY_TYPE_PATTERN = /\bMoney\b/;
function isExemptPath(filename) {
  const segments = filename.split(/[/\\]/);
  return segments.some((segment, index) => segment === "domain" && segments[index + 1] === "money");
}
// ...
const services = context.sourceCode.parserServices;
if (!services || !services.program) {
  // report missingTypeInformation once
}
const checker = services.program.getTypeChecker();
function typeIsMoney(node) {
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  const type = checker.getTypeAtLocation(tsNode);
  return MONEY_TYPE_PATTERN.test(checker.typeToString(type));
}
```
Copy this exact skeleton: swap `MONEY_TYPE_PATTERN` for a `/\bRow\b/` return-type check on `domain/**` exported function return types (including `Promise<T>`'s `T`), swap the `isExemptPath` check to exempt `domain/permissions/project.ts` itself, and register the rule in `eslint/index.mjs` alongside the other two, then wire it into `eslint.config.mjs`'s `rules` block next to `"plant8/money-boundary": "error"`.

**Registration point** — read `eslint/index.mjs` and `eslint.config.mjs:72-74` to see the exact 3-line registration pattern (`"plant8/require-action-client"`, `"plant8/repository-viewer-param"`, `"plant8/money-boundary"`) before adding the 4th rule.

---

### `test/unit/eslint-rules/no-row-type-escape.test.ts`

**Analog:** `test/unit/eslint-rules/repository-viewer-param.test.ts` (full file)

```typescript
import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/repository-viewer-param.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
type RuleModuleParam = Parameters<typeof ruleTester.run>[1];

ruleTester.run("repository-viewer-param", rule as unknown as RuleModuleParam, {
  valid: [ /* ... */ ],
  invalid: [ /* ... */ ],
});
```
Copy verbatim except the rule import and `valid`/`invalid` fixture cases. Since `no-row-type-escape` is type-aware (like `money-boundary`), also check whether a `test/unit/eslint-rules/money-boundary.test.ts` exists for the type-aware `RuleTester` config (parserOptions with `projectService`) — if it does, prefer that file's `RuleTester` setup over the plain one here, since type-aware rules need `parserOptions.project`.

---

### `domain/permissions/{can,visible,scope-for,project}.test.ts` (unit tests)

**Analog:** `test/unit/system-status.test.ts` (full file)

```typescript
const adminViewer: Viewer = { id: "admin-1", isAdmin: true };
const employeeViewer: Viewer = { id: "emp-1", isAdmin: false };

describe("connectionBanner (OPS-06, D-17)", () => {
  it("정확히 80%면 배너가 뜬다(경계 포함)", () => {
    expect(connectionBanner(20, 25, 0.8)).toBe(true);
  });
});

describe("getSystemStatus", () => {
  it("관리자가 아니면 NotAdminError를 throw한다", async () => {
    await expect(getSystemStatus(employeeViewer)).rejects.toBeInstanceOf(NotAdminError);
  });
});
```
Copy this two-tier structure: (1) pure-function boundary-value tests for the policy predicate itself (`can`/`visible` as sync functions), (2) async guard-rejection tests using `.rejects.toBeInstanceOf(SomeError)`. Since D-36 removes `Viewer.isAdmin`, the fixture literals `{ id: "admin-1", isAdmin: true }` must become `{ id: "admin-1", roleId: "role-admin" }` — this is the exact rewrite the isAdmin-removal plan must apply to every one of the ~15 test files RESEARCH.md identifies.

---

### `test/integration/{roles,vendors,corp-cards,...}.test.ts`

**Analog:** `test/integration/system-status.test.ts` (full file, 17 lines)

```typescript
import { describe, expect, it } from "vitest";
import { getSystemStatus } from "@/domain/system-status";
import { SYSTEM_VIEWER } from "@/domain/viewer";

describe("getSystemStatus (실제 Postgres, D-18)", () => {
  it("실제 DB에서 커넥션 수를 조회하고 로컬(GCP 미설정)에서는 backup이 unavailable이다", async () => {
    const status = await getSystemStatus(SYSTEM_VIEWER);
    // ...
  });
});
```
Every new master-data integration test hits the real local Postgres via `SYSTEM_VIEWER` and asserts against actual row shapes — no mocking layer exists in `test/integration/`. Follow this exact "call domain function with `SYSTEM_VIEWER`, assert on real DB round-trip" shape for `roles.test.ts`, `vendors.test.ts`, `corp-cards.test.ts`, `code-tables.test.ts`, `team-memberships.test.ts`, `archive.test.ts`.

---

### `test/integration/leak-scan.test.ts` (D-38 generated matrix test)

**Analog (mechanism):** `test/unit/ci-guard.test.ts` (dynamic loop-based assertions over external registries) + `test/unit/design-system-docs.test.ts` (`it.each` over a parsed/derived array)

```typescript
// ci-guard.test.ts pattern: read external source, loop, assert per item
for (const token of required) {
  expect(ci, `ci.yml에 "${token}"가 있어야 한다`).toContain(token);
}
```
RESEARCH.md's own sketch (Code Examples §6) is the concrete target shape:
```typescript
import { ACTION_REGISTRY } from "@/lib/actions/registry";
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry";
import { ROLES } from "@/domain/permissions/roles";

const cases = DTO_REGISTRY.flatMap((dto) => ROLES.map((role) => ({ dto, role })));

describe("정보 노출 누수 스캔 (ADMN-03)", () => {
  it.each(cases)("$dto.name × $role.name: 노출표에 매핑되어 있다", ({ dto, role }) => {
    expect(isMappedToVisibilityTable(dto, role)).toBe(true);
  });
});
```
The novel part (per RESEARCH.md §6) is only that the `it.each` array is imported from a production registry module rather than being a literal in the test file — `it.each` itself is an established pattern in this codebase (3 existing files).

---

### `app/(app)/admin/permissions/page.tsx` and `visibility/page.tsx` (RSC page)

**Analog:** `app/(app)/admin/system-status/page.tsx` (full file)

```typescript
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { getSystemStatus } from "@/domain/system-status";
import { PageHeader } from "@/ui/page-header/PageHeader";

export const dynamic = "force-dynamic";

export default async function SystemStatusPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.viewer.isAdmin) notFound();

  const status = await getSystemStatus(session.viewer);
  return (
    <>
      <PageHeader title="시스템 상태" />
      <KvList items={[...]} />
    </>
  );
}
```
Copy the exact three-guard sequence (`getSession()` → `redirect("/login")` if absent → `notFound()` if unauthorized) and replace the `viewer.isAdmin` check with `can(session.viewer, "admin.permissions", "view")` per D-36. Replace `KvList` with the new `PermissionGrid`/`VisibilityGrid` component for the matrix pages, or keep `KvList`/list templates for the §6-1 list-template master screens (people/vendors/corp-cards/code-tables).

---

### `app/(app)/admin/permissions/actions.ts` (server action)

**Analog:** `app/(app)/account/actions.ts` (`changePasswordAction`, full file)

```typescript
"use server";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { validateNewPassword, finalizePasswordChange } from "@/domain/auth/password";

export const changePasswordAction = authedActionClient
  .schema(z.object({ currentPassword: z.string().min(1, "..."), newPassword: z.string().min(8, "...") }))
  .action(async ({ parsedInput, ctx }) => {
    // domain-only calls, never db/repositories directly
    await finalizePasswordChange(ctx.viewer, ctx.viewer.id);
    redirect("/login?reason=password-changed");
  });
```
Every new admin server action must: (1) start with `"use server"`, (2) build on `authedActionClient` (never bare `actionClient`, enforced by `plant8/require-action-client`), (3) validate with a zod `.schema(...)`, (4) call only `domain/*` functions — never import `repositories/*` or `db/*` directly (already blocked by `boundaries/element-types`: `{ from: "app", allow: ["app","domain","lib","ui"] }`). This is where D-38's action registry entries get created — register each new action in `lib/actions/registry.ts` alongside its definition.

---

### `ui/shell/role-menu.ts` (rewrite for 5 roles)

**Analog:** itself, `ui/shell/role-menu.ts` (current file, to be edited not replaced)

```typescript
export type RoleMenuViewer = { isAdmin: boolean };
// ...
function buildBottomTabs(viewer: RoleMenuViewer): BottomTab[] {
  const roleTabs: BottomTab[] = viewer.isAdmin ? [...] : [...];
  return [...roleTabs, { kind: "more", label: "더보기" }];
}
export function roleMenu(viewer: RoleMenuViewer): RoleMenu { ... }
```
Per the file's own comment (lines 4-6) and CONTEXT.md's integration point, this is **the one file** to replace when the 5-role permission table lands — `RoleMenuViewer` becomes `{ roleId: string }` (or similar) and `buildBottomTabs`/`roleMenu` switch on `can(viewer, ...)` lookups instead of the `isAdmin` ternary. `ui/` boundary rules (`{ from: "ui", allow: ["ui", "lib"] }`) mean this file cannot import `domain/permissions` directly — it must keep taking a already-computed menu/role shape as a plain data argument, consistent with its existing "no domain/repositories import" comment (lines 8-11).

---

### `test/e2e/fixtures.ts` (`createFixtureUser` signature change, D-36 independent plan)

**Analog:** itself + `domain/auth/accounts.ts`'s `createAccount`

```typescript
export async function createFixtureUser(options: {
  isAdmin: boolean;
}): Promise<{ email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: options.isAdmin ? "E2E Admin" : "E2E Employee",
    isAdmin: options.isAdmin,
  });
  return { email, password: tempPassword };
}
```
D-36's independent plan must change this to `options: { roleId: string }` (or similar) and thread it through `createAccount`'s params — this is confirmed as the single choke point for all 9 E2E spec files per RESEARCH.md §2. Read `domain/auth/accounts.ts` in full before touching this (not excerpted here — pull the exact `createAccount` signature at plan time since it also has 3 `isAdmin` branches per RESEARCH.md's table, lines 184).

---

## Shared Patterns

### Server Action Entry Point
**Source:** `lib/actions/client.ts` (full file, 19 lines)
**Apply to:** All new `app/(app)/admin/**/actions.ts` files
```typescript
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e instanceof Error ? e.message : "서버 오류가 발생했습니다.";
  },
});

export const authedActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return next({ ctx: { viewer: session.viewer, user: session.user } });
});
```
No new action-client wrapper needed — `authedActionClient` is already the single required entry point (enforced by `plant8/require-action-client`). Every Phase 3 action reuses this unchanged.

### Repository Viewer-First Signature (row filtering)
**Source:** `repositories/users.ts` + `eslint/rules/repository-viewer-param.mjs`
**Apply to:** All 12 new/modified `repositories/*.ts` files
```typescript
export async function findUserById(viewer: Viewer, id: string): Promise<UserRow | null> {
  void viewer; // Phase 3: replace with scopeFor(viewer) where-clause
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}
```
This is a hard lint-enforced convention (not optional): every exported repository function's first parameter must be named `viewer`.

### 4-Layer Boundaries (already enforced, no config change needed for Phase 3's default flow)
**Source:** `eslint.config.mjs` lines 20-71
```javascript
"boundaries/elements": [
  { type: "app", pattern: "app/**" },
  { type: "domain", pattern: "domain/**" },
  { type: "repositories", pattern: "repositories/**" },
  { type: "ui", pattern: "ui/**" },
  // ...
],
"boundaries/element-types": ["error", {
  default: "disallow",
  rules: [
    { from: "app", allow: ["app", "domain", "lib", "ui"] },
    { from: "domain", allow: ["domain", "repositories", "lib"] },
    { from: "repositories", allow: ["repositories", "db", "domain"] },
    { from: "ui", allow: ["ui", "lib"] },
  ],
}]
```
`app → repositories` is already blocked; `domain → repositories` and `repositories → domain` are already both allowed (needed for `scopeFor`'s call direction). No boundaries config edits are required for the mechanism layer as currently scoped (CONTEXT.md leaves domain-subfolder sub-boundaries to planner discretion — RESEARCH.md Open Question 1 recommends not sub-dividing this phase).

### Migration Timeout Guard
**Source:** `db/migrations/0001_login_attempts.sql`, `db/migrations/0002_rate_limits_id_column.sql`
**Apply to:** Every new migration with an `ADD CONSTRAINT ... FOREIGN KEY` or `CREATE INDEX` (including GIN)
```sql
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "..." ON "..." USING btree (...);
```
Must be added by hand after `drizzle-kit generate` — verified `drizzle-kit` does not emit this (RESEARCH.md Pitfall 2).

### Custom Type-Aware ESLint Rule Skeleton
**Source:** `eslint/rules/money-boundary.mjs`
**Apply to:** `eslint/rules/no-row-type-escape.mjs`
```javascript
const services = context.sourceCode.parserServices;
if (!services || !services.program) {
  // report missingTypeInformation once per file, don't silently no-op
}
const checker = services.program.getTypeChecker();
```
Both the type-checker access pattern and the "fail loudly if type info missing" guard must be copied verbatim.

### `*Row` / `*Dto` Naming Convention
**Source:** `repositories/users.ts` line 7
```typescript
export type UserRow = InferSelectModel<typeof users>;
```
Every new repository file must export its row type as `<Entity>Row` (already the established convention) — `no-row-type-escape.mjs` depends on this naming for its regex-based detection, and `project()`'s output types should conversely be named `<Entity>Dto`.

## No Analog Found

Files/mechanisms with no close match in the codebase (planner should lean on RESEARCH.md's Code Examples and Architecture Patterns instead):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `domain/permissions/project.ts` (the `project(viewer, dto)` function itself) | service | transform | No projection/DTO-shaping function exists anywhere in the codebase yet — only the naming convention (`*Row`) and the architectural slot (ARCHITECTURE.md §2, `repositories/users.ts:9` comment) exist. Build from RESEARCH.md Architecture Patterns §1. |
| `lib/crypto.ts` (`encrypt`/`decrypt`) | utility | transform | No cryptography code exists in the repo at all. Use RESEARCH.md Code Example 1 verbatim (already a full, session-verified implementation) rather than searching for an analog. |
| `ui/permission-grid/PermissionGrid.tsx` (D-40 checkbox matrix) | component | request-response | `ui/` has 12 components, none of them a grid/table/matrix. `ui/kv-list/KvList.tsx` is the closest (label-value list) but structurally different (not a 2D checkbox grid). Must be designed fresh per D-40, contract to be written into `docs/design/SYSTEM.md` §7 first (CLAUDE.md frontend rule), then implemented — no code to copy from. |
| `domain/archive/*` (soft-delete judgment + restore) | service | CRUD | No delete/restore/soft-delete concept exists anywhere (`domain/`, `repositories/` are 100% additive/update so far, confirmed by RESEARCH.md §9). Use the `archived_at`/`archived_by` column convention from RESEARCH.md Architecture Patterns §9. |
| `domain/action-log/record.ts` (`recordAction`) | service | event-driven | `lib/log.ts` is stdout-only (no persistence, no query, no filter) — structurally a different concern (Cloud Logging feed vs. queryable DB table). Do not copy `lib/log.ts`'s implementation; only reuse its call-site convention (`log.info("event.name", {...})`) as a *sibling* call, not a replacement (RESEARCH.md §8). |
| `lib/actions/registry.ts` (D-38 action registry) | service (registry) | event-driven | No registry-of-actions exists — there is exactly one action client and a handful of ad-hoc `"use server"` action files with no central catalog. Design fresh per RESEARCH.md Code Examples §6 sketch. |

## Metadata

**Analog search scope:** `repositories/`, `domain/`, `db/schema/`, `db/migrations/`, `lib/`, `lib/actions/`, `eslint/rules/`, `ui/`, `app/(app)/`, `test/unit/`, `test/integration/`, `test/e2e/`
**Files scanned:** ~45 (all existing files in the above directories were listed; ~20 were opened and read in full)
**Pattern extraction date:** 2026-09-20
