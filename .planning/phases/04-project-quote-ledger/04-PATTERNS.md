# Phase 4: 프로젝트·견적 원장 - Pattern Map

**Mapped:** 2026-09-22 (updated 2026-09-23 — see appended D-75~D-95 section)
**Files analyzed:** ~30 (schema 5 + repositories 5 + domain modules 6 + actions/pages ~8 + ui/table 5 + scripts 2 + tests ~7)
**Analogs found:** 24 / 30 (no-analog files listed below are genuinely new patterns per RESEARCH.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `db/schema/projects.ts` | model (Drizzle schema) | CRUD | `db/schema/vendors.ts` (archivable master table + custom_fields + GIN idx) / `db/schema/corp-cards.ts` (FK owner columns) | role-match |
| `db/schema/quote-revisions.ts` | model | CRUD | `db/schema/corp-cards.ts` (FK to another new table + check-style invariants) | partial |
| `db/schema/quote-lines.ts` | model | CRUD | `db/schema/vendors.ts` (custom_fields + GIN idx), Pattern 1/2 in RESEARCH.md (Money columns) | partial (no existing money-column table to copy verbatim — none exists yet) |
| `db/schema/revenue-entries.ts` | model | CRUD | `db/schema/vendors.ts` (archivable line-item pattern) | partial |
| `db/schema/reserve-entries.ts` | model | CRUD, running-balance | `db/schema/vendors.ts` (archivable) — **no ledger/balance table analog exists in repo** | no strong analog |
| `repositories/document-counters.ts` (add increment fn) | repository | CRUD (atomic increment) | itself (existing file, add `allocateNumber`-style export) — RESEARCH.md Pattern 3 has the exact snippet | exact (extend existing file) |
| `repositories/projects.ts` | repository | CRUD | `repositories/vendors.ts` (list/find/insert/update, `scopeFor`, archived-aware) | exact |
| `repositories/quote-revisions.ts` | repository | CRUD | `repositories/vendors.ts` (insert/find pattern), `repositories/document-counters.ts` (read/find pattern) | role-match |
| `repositories/quote-lines.ts` | repository | CRUD + version-conflict batch write | `repositories/vendors.ts` (CRUD shape); **no existing repo does a versioned batch-write / conflict-detect pattern** | partial |
| `repositories/revenue-entries.ts` | repository | CRUD | `repositories/vendors.ts` | role-match |
| `repositories/reserve-entries.ts` | repository | CRUD + aggregate (running balance) | `repositories/vendors.ts` (CRUD) — balance aggregate has no analog | partial |
| `domain/money/index.ts` | domain (single entry point) | transform (pure functions) | `domain/code-tables/tax-rule.ts` schema shape + `test/unit/eslint-rules/fixtures/domain/money/index.ts` (the lint fixture stub) | role-match (fixture only, not real impl) |
| `domain/money/currency.ts` | domain | transform + settings read | `domain/settings/registry.ts` `getSettingValue(def, {asOf})` caller pattern | role-match |
| `domain/rules/gate.ts` | domain (single entry point) | event-driven / rule dispatch | `domain/code-tables/index.ts` (single module, exported judgement functions, `ForbiddenError extends UserFacingError`) | role-match |
| `domain/projects/index.ts` | domain | CRUD + state machine | `domain/vendors/index.ts` (full CRUD domain module: DTO spec, `registerDto`, `scopeFor`, `project()`, `recordAction`, `ForbiddenError`/`Archived*Error`) | exact |
| `domain/projects/status.ts` | domain | state-transition/event-driven | `domain/code-tables/index.ts` `setCodeItemActive` (guarded state toggle) — no full state-machine analog exists | partial |
| `domain/quotes/revisions.ts` | domain | CRUD (copy-on-write) | `domain/vendors/index.ts` `createVendor` (validate → insert → recordAction) — copy-then-edit has no analog | partial |
| `domain/quotes/lines.ts` | domain | CRUD + version-conflict + calculation | `domain/vendors/index.ts` (CRUD shape) + RESEARCH.md Code Examples "서버 계산 견적가·차익" — no analog for optimistic-concurrency batch save | partial |
| `domain/revenue/index.ts` | domain | CRUD | `domain/vendors/index.ts` | role-match |
| `domain/reserves/index.ts` | domain | CRUD + balance guard | `domain/vendors/index.ts` (CRUD + `ForbiddenError`) — balance-non-negative guard has no analog | partial |
| `domain/document-numbering/index.ts` | domain | event-driven (atomic allocate) | RESEARCH.md Pattern 3 `allocateNumber()` snippet (not yet in repo) — closest real analog is `domain/settings/registry.ts` for "single entry point wrapping a repository" shape | role-match |
| `lib/actions/*` (server actions for project/quote/revenue/reserve) | controller (Server Action) | request-response | `app/(app)/admin/vendors/actions.ts` (`authedActionClient`, zod schema, calls domain only, `revalidatePath`, `./actions.registry` leak-scan registration) | exact |
| `app/(app)/projects/page.tsx` | route (RSC list) | request-response | `app/(app)/admin/vendors/page.tsx` (session/can gate, `?editId=`/`?new=1` toggle, `ListEmpty`, table, `PageHeader`) | exact |
| `app/(app)/projects/[id]/page.tsx` | route (RSC detail) | request-response | `app/(app)/admin/vendors/page.tsx` (no detail-page analog exists in repo — all admin screens are list+inline-form; this is the first list/detail split) | partial |
| `app/(app)/pnl/reserves/page.tsx` | route (RSC list) | request-response | `app/(app)/admin/vendors/page.tsx` | role-match |
| `ui/table/Table.tsx` + hooks | component (client) | event-driven (keyboard/clipboard) | **no analog** — `ui/` has no grid/table component today (only `ui/permission-grid` uses `role="grid"` semantics loosely) | no analog — see below |
| `ui/form/*`, `ui/select/*` | component | request-response (form submit) | `app/(app)/admin/vendors/vendor-form.tsx` (existing hand-rolled form — the thing `ui/form` is meant to replace/wrap) | role-match (source to extract conventions from, not to literally copy) |
| `scripts/migrate/extract.ts` | utility (script) | file-I/O (batch) | `scripts/seed-master.ts`, `scripts/settings-import.ts` (tsx script conventions) | role-match |
| `scripts/migrate/transform.ts` | utility (script) | batch/transform | same as above | role-match |
| `test/unit/domain/money.test.ts` | test (unit) | — | `test/unit/code-tables/tax-rule.test.ts` (schema/pure-function unit test shape with `it.each`) | exact |
| `test/unit/domain/rules-gate.test.ts` | test (unit) | — | `test/unit/vendors/account-number-plan.test.ts` (pure-function decision-table unit test) | exact |
| `test/integration/document-counters-concurrency.test.ts` | test (integration) | — | `test/integration/document-counters.test.ts` (real-Postgres integration test against this exact repository file) | exact |
| `test/integration/quote-lines.test.ts` | test (integration) | — | `test/integration/document-counters.test.ts` (structure); no existing integration test covers optimistic-concurrency batch save | partial |
| `test/e2e/quote-table.spec.ts` | test (E2E) | — | `test/e2e/vendor-edit.spec.ts`, `test/e2e/code-tables-write-gate.spec.ts` (Playwright form/gate specs) | role-match |

## Pattern Assignments

### `db/schema/projects.ts`, `db/schema/revenue-entries.ts`, `db/schema/quote-lines.ts` (model, CRUD)

**Analog:** `db/schema/vendors.ts` (full file, 34 lines)

**Full pattern to copy:**
```typescript
import { pgTable, text, boolean, jsonb, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // ... entity-specific columns ...
    hidden: boolean("hidden").notNull().default(false),
    customFields: jsonb("custom_fields").notNull().default({}),
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendors_normalized_name_idx").on(table.normalizedName),
    index("vendors_custom_fields_idx").using("gin", table.customFields),
  ],
);
```
Apply: `archivedAt`/`archivedBy`/`createdAt`/`updatedAt`/`customFields` + GIN index columns are the required boilerplate for every new archivable table (`projects`, `quote_lines`, `revenue_entries`, `reserve_entries` per RESEARCH.md Integration Points). Add `source` column (`'demo'`/`'intranet'`) per RESEARCH.md Integration Points note. Add `version: integer("version").notNull().default(1)` for `quote_lines` (D-65).

**FK-owner + check-constraint pattern** — `db/schema/corp-cards.ts` (full file, 39 lines):
```typescript
import { pgTable, text, boolean, jsonb, timestamp, uuid, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { teams } from "./org";

export const corpCards = pgTable(
  "corp_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holderUserId: text("holder_user_id").references(() => users.id),
    teamId: uuid("team_id").references(() => teams.id),
    // ...
  },
  (table) => [
    check("corp_cards_owner_xor_check", sql`(${table.holderUserId} is not null) <> (${table.teamId} is not null)`),
    index("corp_cards_custom_fields_idx").using("gin", table.customFields),
  ],
);
```
Apply: `projects.teamId`/`projects.pmUserId` FK columns follow this `.references()` style. `check()` builder exists in installed drizzle-orm 0.45.2 — usable for e.g. reserve balance non-negative DB constraint (D-60) if a generated/check column route is chosen (else enforce in `domain/reserves`).

**Money columns (no real table exists yet — synthesize from RESEARCH.md Pattern 1):**
```typescript
// Source: RESEARCH.md Pattern 1, lines 240-287 — verified against
// node_modules/drizzle-orm/pg-core/columns/numeric.js (0.45.2)
foreignAmount: numeric("foreign_amount", { precision: 14, scale: 2 }),
fxRate: numeric("fx_rate", { precision: 12, scale: 4 }).notNull().default("1.0000"),
amountKrw: integer("amount_krw").notNull(),
```

---

### `repositories/projects.ts`, `repositories/revenue-entries.ts` (repository, CRUD)

**Analog:** `repositories/vendors.ts` (full file, 146 lines)

**Imports + scope pattern** (lines 1-25):
```typescript
import { and, eq, ilike, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type VendorRow = InferSelectModel<typeof vendors>;

export async function listVendors(
  viewer: Viewer,
  opts: { scope: Scope; includeHidden: boolean },
): Promise<VendorRow[]> {
  if (opts.scope.rows === "none") return [];
  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(vendors.archivedAt));
  return db.select().from(vendors).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(vendors.normalizedName, vendors.id);
}
```

**Insert/update pattern** (lines 74-146): plain `db.insert(...).values({...}).returning()`, `db.update(...).set({...}).where(eq(id))`, and **conditional UPDATE for archive/restore** (lines 133-146):
```typescript
export async function setVendorArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db.update(vendors).set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(vendors.id, id), isNull(vendors.archivedAt)));
  } else {
    await db.update(vendors).set({ archivedAt: null, archivedBy: null })
      .where(and(eq(vendors.id, id), isNotNull(vendors.archivedAt)));
  }
}
```
Every repository export takes `viewer` as first param (`plant8/repository-viewer-param` lint rule) even when unused by the query itself — matches this convention exactly.

---

### `repositories/document-counters.ts` — add `allocateNumber` (repository, event-driven atomic increment)

**Analog:** the file itself (existing, 35 lines) + RESEARCH.md Pattern 3 (lines 322-348, contains the exact code to add)

**Current state** (must read before editing — do not guess column names):
```typescript
// db/schema/document-counters.ts:9-18 — REAL schema, not the CONTEXT.md summary
export const documentCounters = pgTable(
  "document_counters",
  {
    counterKey: text("counter_key").notNull(),
    period: text("period").notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.counterKey, table.period] })],
);
```
```typescript
// repositories/document-counters.ts — only 2 exports today: findDocumentCounter, upsertDocumentCounter
```

**Code to add** (RESEARCH.md Pattern 3, verbatim):
```typescript
export async function allocateNumber(
  counterKey: string,
  period: string,
  tx: typeof db = db,
): Promise<number> {
  await tx.insert(documentCounters).values({ counterKey, period, value: 0 })
    .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });
  const [row] = await tx.update(documentCounters)
    .set({ value: sql`${documentCounters.value} + 1`, updatedAt: new Date() })
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .returning({ value: documentCounters.value });
  return row.value;
}
```
**Pitfall (from RESEARCH.md Pitfall 1):** do not use `format_key`/`scope_key`/`next_no` — those names appear in CONTEXT.md/ROADMAP prose but do not exist in code. Real columns are `counter_key`, `period`, `value`.

---

### `domain/projects/index.ts`, `domain/revenue/index.ts` (domain, CRUD)

**Analog:** `domain/vendors/index.ts` (full file, 393 lines) — this is the richest CRUD domain module in the repo and should be followed closely.

**Imports pattern** (lines 1-22):
```typescript
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema } from "@/domain/custom-fields/build-schema";
import { listVendors as repoListVendors, /* ... */ } from "@/repositories/vendors";
```

**Error class + DTO spec + registerDto pattern** (lines 24-67):
```typescript
export class ForbiddenError extends UserFacingError {}
export class ArchivedVendorError extends UserFacingError {}

export type VendorDto = { id: string; name: string; /* ... */ };

export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "vendor.value" },
    // ...
  ],
};

registerDto({
  name: "VendorDto",
  fields: VENDOR_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});
```
**This registerDto call is mandatory** — CONTEXT.md D-38 requires every new DTO be registered in the leak-scan registry.

**Read function pattern** (lines 91-98):
```typescript
export async function listVendors(viewer: Viewer, opts?: { includeHidden?: boolean }): Promise<VendorDto[]> {
  const scope = await scopeFor(viewer, VENDOR_ENTITY);
  const rows = await repoListVendors(viewer, { scope, includeHidden: opts?.includeHidden ?? false });
  return Promise.all(rows.map((row) => project(viewer, row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
}
```

**Write function pattern with deps injection for testability** (lines 176-278):
```typescript
export type VendorWriteDeps = { can: typeof defaultCan; findVendorById: typeof repoFindVendorById; recordAction: typeof defaultRecordAction };

export async function createVendor(viewer: Viewer, input: VendorInput, deps?: Partial<VendorWriteDeps>): Promise<CreateVendorResult> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "write"))) throw new ForbiddenError("...");
  const customFields = await validatedCustomFields(viewer, input.customFields);
  const row = await repoInsertVendor(viewer, { /* ... */ });
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: VENDOR_ENTITY, entityId: row.id });
  return { vendor: (await project(viewer, row, VENDOR_DTO_SPEC)) as VendorDto, duplicateCount: duplicates.length };
}
```
**Archived-guard-in-domain pattern** (lines 295-302 — critical, matches D-47/D-66 "완료 뒤 잠김" requirements):
```typescript
const existing = await findVendorById(viewer, id);
if (!existing || existing.archivedAt !== null) {
  throw new ArchivedVendorError("보관되었거나 존재하지 않는 거래처는 수정할 수 없습니다.");
}
```
Apply this exact shape for `domain/projects` completing-project lock (D-47) and `domain/quotes/lines` locked-cell-on-linked-document (D-66) — the guard belongs in the domain layer, not the UI, because directly hitting the URL/action must also be blocked (comment at line 295-298 explicitly documents this DOM-audit-driven lesson).

---

### `domain/rules/gate.ts` (domain, single entry point / rule dispatch)

**Analog:** `domain/code-tables/index.ts` (full file, 174 lines) for the "single module exports judgement functions, each checks permission then acts" shape, plus the exact skeleton in RESEARCH.md Code Examples (lines 467-489, explicitly marked `[ASSUMED]`/discretionary):
```typescript
export type GateRule<Doc, Ctx> = {
  name: string;
  check: (doc: Doc, ctx: Ctx) => Promise<{ allowed: true } | { allowed: false; reason: string }>;
};
const registry: GateRule<unknown, unknown>[] = [];
export function registerGateRule<Doc, Ctx>(rule: GateRule<Doc, Ctx>): void { registry.push(rule as GateRule<unknown, unknown>); }
export async function gate<Doc, Ctx>(doc: Doc, ruleName: string, ctx: Ctx): Promise<{ allowed: boolean; reason?: string }> {
  const rule = registry.find((r) => r.name === ruleName) as GateRule<Doc, Ctx> | undefined;
  if (!rule) throw new Error(`등록되지 않은 게이트 규칙: ${ruleName}`);
  const result = await rule.check(doc, ctx);
  return result.allowed ? { allowed: true } : { allowed: false, reason: result.reason };
}
```
Note: signature is explicitly CONTEXT.md "Claude's Discretion" — the planner should treat this as a strong starting point, not a locked contract.

---

### `domain/document-numbering/index.ts` (domain, atomic allocate)

**Analog:** no real domain module exists; closest shape is `domain/settings/registry.ts`'s "domain wraps a repository call, takes `deps` for test injection" pattern (lines 1-80, already excerpted above under `getSettingValue`). Combine with RESEARCH.md Pattern 3's `allocateNumber` repository function (see `repositories/document-counters.ts` section above) called inside `db.transaction(...)`.

---

### `app/(app)/projects/actions.ts` and other new Server Actions (controller, request-response)

**Analog:** `app/(app)/admin/vendors/actions.ts` (full file, 79 lines)

```typescript
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createVendor, updateVendor, setVendorHidden } from "@/domain/vendors";
import "./actions.registry";

export const createVendorAction = authedActionClient
  .schema(z.object({ name: z.string().min(1, "이름을 입력하세요."), /* ... */ }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await createVendor(ctx.viewer, parsedInput);
    revalidatePath("/admin/vendors");
    return result;
  });
```
Apply: every action (a) is `"use server"`, (b) validates with zod `.schema()`, (c) calls exactly one `domain/*` function with `ctx.viewer`, (d) calls `revalidatePath` for affected routes, (e) imports its own `./actions.registry` side-effect file for the leak-scan (see `app/(app)/admin/vendors/actions.registry.ts`, not read in full but referenced — planner should open it directly when writing the equivalent for projects/quotes).

**Batch-save-with-conflict pattern (no direct analog):** `quote-lines` batch save (D-65 "reject whole batch if any row conflicts") has no existing Server Action to copy verbatim. Compose from: zod array schema (see `test/unit/eslint-rules` conventions elsewhere) + `db.transaction()` (Pattern 3) + per-row `version` comparison inside `domain/quotes/lines`.

---

### `app/(app)/projects/page.tsx` (route, RSC list)

**Analog:** `app/(app)/admin/vendors/page.tsx` (full file, 172 lines)

**Session/permission gate + query-param toggle pattern** (lines 1-71):
```typescript
export const dynamic = "force-dynamic";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ includeHidden?: string; editId?: string; new?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.vendors", "view"))) notFound();

  const { includeHidden: includeHiddenParam, editId, new: newParam } = await searchParams;
  const [vendors, canWrite, /* ... */] = await Promise.all([ listVendors(...), can(...), /* ... */ ]);

  const editingVendor = editId ? (vendors.find((v) => v.id === editId && v.archivedAt === null) ?? null) : null;
  const showForm = editingVendor !== null || newParam === "1";
  // ...
}
```
Apply: `?new=1`/`?editId=` toggle convention (D-22, D-39) — reuse directly for the project registration form per §6-1. `PageHeader`, `ListEmpty`, `StatusTag` from `ui/` are used as-is (imports at lines 9-11).

**No detail-page analog exists** — `app/(app)/projects/[id]/page.tsx` is the first list/detail split screen in this repo (all admin screens today are list + inline edit-in-place). Plan this as new structure using the same session/can/`Promise.all` data-loading shape, but section layout must come from `docs/design/SYSTEM.md` §6-2, not from an existing page.

---

## Shared Patterns

### Server Action entry point
**Source:** `lib/actions/client.ts` (`authedActionClient`, not fully re-read here but its usage contract is fixed by every actions.ts analog above)
**Apply to:** All new Server Actions (project CRUD, quote-line batch save, state transitions, revenue lines, reserve lines).

### Permission + scoping
**Source:** `domain/permissions/scope-for.ts`, `domain/permissions/can.ts`, `domain/permissions/project.ts`
**Apply to:** every `domain/*` read (`scopeFor` + repository `scope` param) and write (`can(viewer, menu, "write")` guard) and every DTO (`project(viewer, row, spec)` + `registerDto`).

### Action log
**Source:** `domain/action-log/record.ts` — `recordAction(viewer, { actionType, entity, entityId })`. **Pitfall (RESEARCH.md Pitfall 2):** `CORE_ACTION_TYPES` (18 values) has no "상태 변경"/status-change type. Plan must decide: reuse `document_update` or add a new type + update `ACTION_TYPE_LABELS` and `domain/settings/keys.ts` `ACTION_LOG_OPTIONAL_TYPES` together (both, not just one).

### Custom fields validation
**Source:** `domain/custom-fields/build-schema.ts` `buildCustomFieldsSchema(defs)` — `domain/vendors/index.ts` lines 160-174 show the exact call pattern (`validatedCustomFields` local wrapper that fetches `field-definitions` then `.parse()`s).
**Apply to:** `projects`, `quote_lines`, `reserve_entries` custom_fields columns.

### Archived/locked-state guard
**Source:** `domain/vendors/index.ts` lines 295-302 (`ArchivedVendorError`) — guard lives in domain, not just hidden in UI, because URL/action can be hit directly (DOM-audit-derived lesson, comment explicitly cites this).
**Apply to:** completed-project lock (D-47), linked-document-locks-money-cells (D-66), current-revision-only-editable (D-54).

### Money boundary lint
**Source:** `eslint/rules/money-boundary.mjs` (already active) + `test/unit/eslint-rules/fixtures/domain/money/index.ts` (the `Money` brand-type stub the lint currently checks against).
**Apply to:** `domain/money/index.ts` must be the only file performing `Money` arithmetic; every other file (`domain/quotes/lines.ts`, `domain/revenue/index.ts`, etc.) must import and call `domain/money` functions rather than doing `+`/`*` on money values directly.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `ui/table/Table.tsx` + `use-grid-keyboard.ts` + `use-clipboard-paste.ts` + `use-dirty-storage.ts` | component | event-driven (keyboard/clipboard) | No grid/spreadsheet component exists in `ui/` today (D-61 locks self-build; RESEARCH.md Pattern 4 gives a from-scratch TSV parser to start from, not a repo analog) |
| `domain/money/index.ts` (real implementation) | domain | transform | Only a lint-fixture stub (`test/unit/eslint-rules/fixtures/domain/money/index.ts`, 7 lines) exists; no real Money brand type/functions implemented yet — this phase builds the first one |
| `domain/rules/gate.ts` (real implementation) | domain | event-driven | No gate/rule-registry module exists; RESEARCH.md Code Examples section is explicitly `[ASSUMED]`, not copied from repo code |
| `db/schema/reserve-entries.ts` running-balance query | model+repository | batch/aggregate | No ledger-with-running-balance table exists anywhere in the schema; must be designed fresh (window function vs. app-level sum, per RESEARCH.md Architectural Responsibility Map) |
| `domain/quotes/lines.ts` version-conflict batch save | domain | event-driven (optimistic concurrency) | No existing domain function does per-row `version` comparison across a batch; nearest partial precedent is the archived-guard pattern (single-row state check), not batch conflict detection |
| `scripts/migrate/extract.ts` (MySQL dump parsing) | utility | file-I/O | Existing `scripts/*.ts` (seed-master, settings-import) write to Postgres from static/JSON sources — none parses an external MySQL dump file; only the tsx-execution convention transfers |
| `app/(app)/projects/[id]/page.tsx` (detail page layout) | route | request-response | No list/detail split page exists in the repo yet — all admin screens are list+inline-form; section layout must come from `docs/design/SYSTEM.md` §6-2 |

## Metadata

**Analog search scope:** `db/schema/`, `repositories/`, `domain/` (vendors, code-tables, settings, corp-cards, action-log, permissions), `app/(app)/admin/vendors/`, `test/unit/`, `test/integration/`, `eslint/rules/`
**Files scanned:** ~20 read in full, ~15 more located via Glob/Grep but not needed (stopped once 3-5 strong matches per role were found)
**Pattern extraction date:** 2026-09-22

---

## 2026-09-23 추가 — D-75~D-95

**Appended:** 2026-09-23. Source: `04-CONTEXT.md` §「2026-09-23 추가 결정」(D-75~D-95), `04-RESEARCH.md` §「2026-09-23 추가 연구 — D-75~D-95」, `04-UI-SPEC.md` rev 4 (S12/S13/S14/S15 + SYSTEM.md revision list). The mappings above (04-01/02/05 output) stay valid verbatim — this section only adds new file→analog assignments for files not yet created, and resolves RESEARCH.md Gaps with direct code reads.

### Resolved Gaps (direct code reads, this session)

| Gap (from RESEARCH.md) | Answer | Evidence |
|---|---|---|
| Exact action name for contract/revenue write | **`saveProjectLedgerAction`** (single combined action for quoteLines + revenue, incl. `revenue.contract`) — there is no separate "매출 계약 쓰기" action | `app/(app)/projects/actions.ts:59` `export const saveProjectLedgerAction = authedActionClient...`; `revenue: z.object({ contract: moneyInputSchema.optional(), contractFxRateTouched: ..., issuedEntries: ..., paidEntries: ... })` at lines 97-104 |
| Does `ui/table` keyboard handler check `ctrlKey` vs `metaKey`? | **Already checks both** — A10 in RESEARCH.md is WRONG. D-94 is display-string-only work (no handler bug). | `ui/table/use-grid-keyboard.ts:92` `const meta = event.metaKey \|\| event.ctrlKey;` |
| `use-dirty-storage` key design (row-id vs page-index) | **Neither — key is `projectId + revisionId` (scopeId + subScopeId), not row-id or page-index.** Page-based slicing (D-91) therefore does NOT require a dirty-storage key redesign — edits are already keyed at the revision level, not per-page. | `ui/table/use-dirty-storage.ts:19-23` `dirtyStorageKey(scopeId, subScopeId)` returns `` `${STORAGE_PREFIX}:${scopeId}:${subScopeId}` ``; header comment: "키는 **프로젝트 id + 차수 id**(다른 표는 화면 id)로 만들어 다른 프로젝트·표의 편집이 섞이지 않는다" |
| `listProjectsPage` pagination shape (LIMIT/OFFSET vs count-refetch) | **Confirmed count-refetch, no OFFSET at all.** A11 in RESEARCH.md is confirmed correct — real work needed for D-91. | `repositories/projects.ts:129-170` — signature `opts: { scope, filter, sort, limit: number }`, only `.limit(opts.limit)` used, no `.offset(...)` anywhere in the file (grep 0 hits) |
| `CodeItemLabelInput` location | `app/(app)/admin/code-tables/code-item-form.tsx:70` — confirmed, A9 correct | `export function CodeItemLabelInput({ id, label }: { id: string; label: string })`, blur-save via `useAction(updateCodeItemLabelAction, { onError: revert to server value, onSuccess: clear error })` |

### File Classification (new/modified for D-75~D-95)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `db/migrations/0011_project_status_five_values.sql` | migration | batch (data remap) | `db/migrations/0009_project_quote_ledger_spine.sql` (guard-pattern only, NOT the empty-table precondition — see Pitfall 6) | role-match |
| `db/migrations/0012_drop_contract_columns.sql` (or same batch as 0011, plan decides) | migration | batch | `db/migrations/0009...sql` lock-timeout convention (`SET LOCAL lock_timeout = '1s'`) | role-match |
| `db/migrations/00xx_code_items_description.sql` | migration | batch | `db/migrations/0009...sql` `ALTER TABLE ... ADD COLUMN` style | role-match |
| `domain/rules/register.ts` — replace `project.completed-lock` binary rule | domain | event-driven | itself (existing file, lines 17-24) — must be **replaced**, not patched (Pitfall 5) | exact (same file, structural rewrite) |
| `domain/projects/auto-transition.ts` (new) | domain | event-driven / batch (idempotent UPDATE...WHERE) | `domain/action-log/record.ts:135-137` (SYSTEM_VIEWER actor=null pattern) + `domain/settings/registry.ts` `findEffectiveValue(..., asOf)` deps-injection-for-time convention | role-match (no exact analog exists; this is the first `now`-injected domain function) |
| `domain/quotes/lines.ts` — extend `saveQuoteLines` gate call for D-78/D-83/D-86 | domain | event-driven | itself (existing file, line 372 gate call + line 447-452 `toLocaleTimeString(..., {timeZone:"Asia/Seoul"})` KST convention to imitate for D-76) | exact |
| `domain/settings/keys.ts` — add `quote_line.max_per_revision` | config | CRUD | existing `fx.recent_rate.USD` simple-kind key (`domain/settings/keys.ts`) | exact |
| `db/schema/quote-lines.ts` — add `is_adjustment boolean default false` | model | CRUD | existing `line_status` column definition, `db/migrations/0009...sql:62` | exact |
| `app/(app)/projects/[id]/revenue-section.tsx` — remove `Form.Field id="contract-amount"`, replace with derived `KvList` | component | request-response | itself (existing file) — replace 3-input block with `KvList` pattern already used elsewhere in same file for read-only display | exact |
| `repositories/projects.ts` `listProjectsPage`/`aggregateProjects` — real OFFSET pagination + revenue SUM + OVERLAPS filter + attribution-year aggregate param | repository | CRUD (batch aggregate) | itself (existing file, `projectFilterConditions` shared-filter pattern, lines ~127-181) — extend, don't replace | exact |
| `ui/pagination/Pagination.tsx` (new) | component | request-response (GET `?page=N`) + event-driven (in-page button nav for quote table) | none in `ui/` today — nearest precedent is `ui/table` button-driven state (`use-grid-keyboard.ts`) for the in-page variant, and standard `<a href>` links for list/reserve variant | no analog (new) |
| `ui/table/use-grid-keyboard.ts` — page-boundary arrow-key behavior | component | event-driven | itself (existing file) — extend only, `event.metaKey \|\| event.ctrlKey` line 92 already correct, no rewrite needed there | exact |
| `ui/table/use-clipboard-paste.ts` — page-spanning paste + 300-line cap rejection | component | event-driven | itself (existing file) + `domain/quotes/lines.ts` server-side reject-whole-batch precedent (D-67 "조용히 버리지 않는다") | exact |
| `app/(app)/admin/code-tables/code-item-form.tsx` — new `CodeItemDescriptionInput` sibling to `CodeItemLabelInput` | component | request-response (blur-save) | `CodeItemLabelInput` itself, lines 70-93 (same file) — copy verbatim pattern, new field | exact |
| `lib/format-number.ts` (new) | utility | transform | none exists; call sites to migrate: `ui/next-turn/NextTurn.tsx`, `app/(app)/projects/[id]/quote-table.tsx`, `app/(app)/projects/[id]/revenue-section.tsx`, `app/(app)/projects/projects-table.tsx` (their current inline `toLocaleString`/`toFixed` calls are the spec for what the new module must replace) | no analog (new), but 4 concrete call sites to grep for exact replacement points |
| `ui/input/TextField.tsx` — add comma-insertion `onChange` variant | component | event-driven | itself (existing file, already has `aria-invalid`/`aria-describedby`) — additive variant only | exact |
| `ui/shell/TopBar.tsx:138` — `⌘K` → `Ctrl+K` | component | request-response (static label) | itself, single-line string swap | exact |
| `app/(app)/projects/project-form.tsx:103` — `shortcut="⌘↵"` → `"Ctrl+Enter"` | component | request-response | itself | exact |
| `app/(app)/projects/[id]/quote-table.tsx:309,850,880,908` — `shortcut="⌘S"` etc. → `Ctrl+...` | component | request-response | itself | exact |
| `docs/design/DECISIONS.md`, `docs/design/SYSTEM.md` §7-1/§7-3/§6/§2-4/§7-7 | docs | n/a | existing DECISIONS.md → SYSTEM.md two-step edit order already established (D-27 convention) | exact |
| `ui/next-turn/NextTurn.tsx` | component | request-response | itself — inline number formatting call site for D-95 migration to `lib/format-number.ts` | exact |

### Pattern Assignments (new files only; existing-file edits use the file's own established pattern per table above)

#### `domain/projects/auto-transition.ts` (domain, event-driven, idempotent)

**Analog:** `domain/action-log/record.ts:135-137` + `domain/settings/registry.ts` `asOf` convention

```typescript
// domain/action-log/record.ts:135-137 — actor=null for system-triggered actions
// 시스템 주체(SYSTEM_VIEWER)의 행동은 actorId가 null이다 — users 표에 없는
// id를 FK로 넣지 않는다
```
`domain/viewer.ts:8-14` defines `SYSTEM_VIEWER` for exactly this ("CLI·훅·Job·healthz 프로브 전용"). Use it as the action-log actor for D-76 auto-settlement — no new concept needed.

**Time-injection convention** (repo has zero `vi.useFakeTimers`/`MockDate` usage — do not introduce it): follow `saveQuoteLines(viewer, revisionId, rows, deps?)`'s `deps` param pattern — `applyAutoSettlement(projectId, { now }: { now?: () => Date } = {})`.

**Idempotency:** rely on `UPDATE ... WHERE status='in_progress' AND end_date < <KST-adjusted date>` — the WHERE clause itself makes re-invocation a no-op (0 rows), no separate dedup check needed.

**KST boundary — do not use bare `CURRENT_DATE`** (Pitfall 7): existing KST-formatting precedent is `domain/quotes/lines.ts:447-452`'s `toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })`, but that's app-layer string formatting, not a DB-layer date comparison — the actual comparison must explicitly convert timezone (`(now() AT TIME ZONE 'Asia/Seoul')::date`), since server `timezone` setting was not verified this session (Gap, still open — confirm with `SHOW timezone;` before writing the migration/query).

---

#### `domain/rules/register.ts` — gate replacement (Pitfall 5)

**Do not patch the existing binary rule.** Current code:
```typescript
// domain/rules/register.ts:17-24 (current, to be replaced not extended)
// gate rule "project.completed-lock": ctx.status !== "settled" ⇒ pass
```
D-78 requires 3-way editability (전체 편집 / 실행가만 / 전체 잠금) plus a D-83 adjustment-line exception that ignores status entirely. The gate's return type (currently boolean `allowed`) must become tri-state, or the rule must accept the set of fields being saved in `ctx` and reject only disallowed fields. `domain/quotes/lines.ts:372` is the single call site to update.

---

#### `ui/pagination/Pagination.tsx` (new, no analog)

No existing `ui/` component does page navigation. Two call patterns must both be supported per UI-SPEC S12: (a) project list / reserve ledger — plain `<a href="?page=N&...">` GET navigation; (b) quote line table — in-page `<button>` state change (client-side slicing of an already-fully-loaded ≤300-row array, confirmed by RESEARCH.md §7 — **not server pagination** for quote lines, only for the project list). Build as a single presentational component accepting either an `href`-builder or an `onPageChange` callback.

---

#### `lib/format-number.ts` (new, no analog)

Four call sites currently do inline `toLocaleString`/`toFixed` and must be migrated to import from this module: `ui/next-turn/NextTurn.tsx`, `app/(app)/projects/[id]/quote-table.tsx`, `app/(app)/projects/[id]/revenue-section.tsx`, `app/(app)/projects/projects-table.tsx`. (`domain/money/index.ts` and `domain/quotes/lines.ts`'s `toFixed` calls are serialization-for-storage, NOT display formatting — do not touch those, per RESEARCH.md §9.) Comma auto-insertion on typing belongs in `ui/input/TextField.tsx` as an additive `onChange` wrapper/variant, not per-screen handlers (D-95 explicit "화면마다 따로 구현하지 않는다").

---

## Shared Patterns (D-75~D-95 additions)

### Migration guard pattern (reuse, do NOT reuse blindly — Pitfall 6)
**Source:** `db/migrations/0009_project_quote_ledger_spine.sql` — `DO $$ ... RAISE EXCEPTION` structure.
**Apply to:** 0011 (status 5-value remap), with a critical deviation — 0009's guard assumed an *empty* `projects` table; 0011 must instead guard on `code_items` having exactly the 4 known D-41 values (not on `projects` being empty) and use UPDATE-based remap, never DELETE-without-remap (orphans a `text` column with no FK).

### System-actor pattern (reuse as-is)
**Source:** `domain/viewer.ts:8-14` `SYSTEM_VIEWER` + `domain/action-log/record.ts:135-137`.
**Apply to:** `domain/projects/auto-transition.ts` (D-76 auto-settlement actor).

### Deps-injected time (reuse as-is, do not introduce `vi.useFakeTimers`)
**Source:** `domain/quotes/lines.ts` `saveQuoteLines(viewer, revisionId, rows, deps?)` deps-param convention.
**Apply to:** `applyAutoSettlement(projectId, { now }?)`.

### Table-level info exposure (reuse as-is, only a default value flips)
**Source:** `domain/permissions/info-items.ts:51-55` — `staffDefault` boolean flips the whole DTO array in/out, no per-column masking code exists or is needed.
**Apply to:** D-85 (`revenue.issued_amount` `staffDefault: false → true`). Update `test/integration/revenue-entries.test.ts` case (d) expectations accordingly — do not delete the test, change its assertion (発행 now visible, 입금 stays hidden).

### Inline blur-save code table field (reuse as-is)
**Source:** `app/(app)/admin/code-tables/code-item-form.tsx:70-93` `CodeItemLabelInput`.
**Apply to:** new `description` field editor for D-93 — copy the `useAction(...).onError → revert to server value` / `onSuccess → clear error` structure verbatim, new action `updateCodeItemDescriptionAction`.

## No Analog Found (D-75~D-95 additions)

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `ui/pagination/Pagination.tsx` | component | request-response + event-driven | No page-navigation component exists anywhere in `ui/`; must support both GET-link and in-page-button modes in one component (UI-SPEC S12 requirement) |
| `lib/format-number.ts` | utility | transform | No shared number-formatting module exists; four screens currently duplicate `toLocaleString`/`toFixed` inline |
| `domain/projects/auto-transition.ts` | domain | event-driven (time-triggered, read-path side-effect) | No existing domain function performs a write-on-read idempotent status transition; nearest partial precedents (SYSTEM_VIEWER, deps-injected `now`) are borrowed from two different files, not one |

## Metadata (this appended section)

**Analog search scope (2026-09-23 addendum):** `app/(app)/projects/actions.ts`, `app/(app)/admin/code-tables/code-item-form.tsx`, `ui/table/use-grid-keyboard.ts`, `ui/table/use-dirty-storage.ts`, `repositories/projects.ts`, `domain/action-log/record.ts`, `domain/viewer.ts`, `domain/rules/register.ts` (all read directly this session to resolve RESEARCH.md Gaps)
**Files scanned:** 8 read directly (targeted grep+range-read, no re-reads), plus RESEARCH.md §1-10 (already-verified content from prior session, not re-read via code)
**Pattern extraction date:** 2026-09-23
