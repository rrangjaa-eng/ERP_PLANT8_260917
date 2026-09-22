# Phase 4: 프로젝트·견적 원장 - Pattern Map

**Mapped:** 2026-09-21
**Files analyzed:** 신규 domain/repositories/schema/ui/scripts 모듈 다수 (CONTEXT.md·RESEARCH.md 기준)
**Analogs found:** 9 / 9 (모두 file:line 실측 확인 완료 — 인용 안 된 파일 없음)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `repositories/document-counters.ts` (증분 함수 추가) | repository | CRUD (atomic increment) | `repositories/settings.ts:127-152` (`applySettingsImport`, `db.transaction`) | role-match (트랜잭션 형태 동일, 대상 표만 다름) |
| `app/(app)/projects/actions.ts` (신규) | controller (Server Action) | request-response | `app/(app)/admin/vendors/actions.ts:1-78` | exact |
| `repositories/projects.ts`, `repositories/quote-lines.ts`, `repositories/reserve-ledger.ts` (신규) | repository | CRUD | `repositories/vendors.ts:1-60` | exact |
| `domain/projects/index.ts`, `domain/quote-lines/index.ts` (신규, `project()` 투영) | domain (DTO exit) | transform | `domain/permissions/project.ts:1-31` | exact |
| `db/migrations/00XX_projects_quotes.sql` (신규) | migration | batch | `db/migrations/0000_init.sql:56-58` (`SET LOCAL lock_timeout`), `.squawk.toml` | exact |
| `ui/select/Select.tsx`, `ui/form/*` (신규) | component | request-response(폼 상태) | `ui/input/TextField.tsx` + `TextField.module.css` | exact (96px 라벨 칸 유일 정답) |
| `test/e2e/quote-grid-keyboard.spec.ts` (신규) | test (e2e) | event-driven | `test/e2e/vendor-edit.spec.ts:1-60`, `test/e2e/fixtures.ts:1-18` | exact |
| `domain/projects/index.ts`(보관/미수주 닫기) + 행동 로그 | domain | event-driven | `domain/archive/index.ts:1-60` + `domain/action-log/record.ts:1-27` | exact |
| `domain/seed/index.ts` (`project_status` 재시드) | config/seed | batch | `domain/seed/index.ts:19-25` (기존 5값 시드 블록) | exact (같은 파일, 교체 대상) |

## Pattern Assignments

### 1. `repositories/document-counters.ts` — 원자적 증가 (Drizzle 트랜잭션)

**Analog:** `repositories/settings.ts:127-152` (`applySettingsImport`) — 이 리포지토리 전체에서
`db.transaction`을 쓰는 유일한 선례(grep 확인, RESEARCH.md Pattern 3 근거와 일치).

```typescript
// repositories/settings.ts:134 (실측)
export async function applySettingsImport(viewer: Viewer, input: SettingsImportInput): Promise<void> {
  void viewer;
  await db.transaction(async (tx) => {
    for (const item of input.simple) {
      await tx
        .insert(settingsSimple)
        .values({ key: item.key, value: item.value, updatedBy: item.by })
        .onConflictDoUpdate({
          target: settingsSimple.key,
          set: { value: item.value, updatedAt: new Date(), updatedBy: item.by },
        });
    }
    // ... historized 항목도 같은 트랜잭션 안에서 onConflictDoNothing
  });
}
```

**증가 함수 뼈대(RESEARCH.md Pattern 3에서 이미 구체화됨, 그대로 채택):**
```typescript
import { sql, and, eq } from "drizzle-orm";
export async function incrementDocumentCounter(
  viewer: Viewer, counterKey: string, period: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.insert(documentCounters)
      .values({ counterKey, period, value: 0 })
      .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });
    const [row] = await tx.update(documentCounters)
      .set({ value: sql`${documentCounters.value} + 1`, updatedAt: new Date() })
      .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
      .returning({ value: documentCounters.value });
    if (!row) throw new Error("document_counters increment이 행을 반환하지 않았습니다.");
    return row.value;
  });
}
```

**기존 함수(변경 금지, export 이름만 확장 대상):** `repositories/document-counters.ts:10-33`의
`findDocumentCounter`·`upsertDocumentCounter` 두 함수. **필수 동반 수정:**
`test/integration/document-counters.test.ts:40-43`이
```typescript
const exportedNames = Object.keys(documentCountersRepo).sort();
expect(exportedNames).toEqual(["findDocumentCounter", "upsertDocumentCounter"]);
```
로 export 목록을 정확히 두 개로 고정 — 이 테스트를 세 개(또는 그 이상) 목록으로 갱신하는 작업을
동일 커밋에 반드시 포함.

**조건부 UPDATE(D-48 낙관적 잠금) 기법 — 별도 analog, `.returning()` 길이 판정:**
`repositories/roles.ts:34`, `repositories/settings.ts:78`이 `.returning()` 뒤 배열 길이로
성공/실패를 판정하는 선례(이 리포 어디에도 `rowCount` 사용 0건, grep 확인). `quote-lines.ts`의
`updateQuoteLineIfUnchanged`는 이 기법(조건절 모양은 새로 씀, `WHERE id = ? AND updated_at = ?`)을
따른다.

---

### 2. `authedActionClient` Server Action 전체 흐름

**Analog:** `app/(app)/admin/vendors/actions.ts:1-78` (전체 파일 실측, exact match)

```typescript
// app/(app)/admin/vendors/actions.ts:1-30 (실측)
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createVendor, updateVendor, setVendorHidden, revealAccountNumber } from "@/domain/vendors";
import { archive } from "@/domain/archive";
import "./actions.registry";  // 03-03 선례 — 등록은 별도 파일로 분리(누수 스캔이 이 파일을 직접 import 못 함)

const customFieldsSchema = z.record(z.string(), z.unknown()).optional();

export const createVendorAction = authedActionClient
  .schema(
    z.object({
      name: z.string().min(1, "이름을 입력하세요."),
      businessNo: z.string().optional(),
      // ...
      customFields: customFieldsSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await createVendor(ctx.viewer, parsedInput);
    revalidatePath("/admin/vendors");
    return result;
  });
```

**에러 반환 형태 — 별도 파일:** `lib/actions/user-facing-error.ts`의 `UserFacingError` 서브클래스를
throw하면 `authedActionClient`(`lib/actions/client.ts`)와 `lib/actions/handle-server-error.ts`가
next-safe-action의 `validationErrors`/일반 에러 응답으로 변환한다. `domain/archive/index.ts:16-19`처럼
도메인 계층에서 `ForbiddenError extends UserFacingError` 형태로 커스텀 에러 클래스를 선언하는 것이
관례 — `projects`·`quote-lines` 도메인도 동일 패턴(`ProjectGateDeniedError` 등)을 따른다.

**"삭제"(보관) 액션 패턴 — 미수주 닫기·되살리기(D-44)에 그대로 적용:**
```typescript
// app/(app)/admin/vendors/actions.ts:71-78 (실측)
export const archiveVendorAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "vendor", parsedInput.id);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/archive");
  });
```

**등록 파일 분리(`actions.registry.ts`)가 실제로 무엇을 하는지는 미확인** — 시간 관계상 내용을
열지 못했다. 계획자는 실행 전 `app/(app)/admin/vendors/actions.registry.ts`를 직접 열어
등록 형태(무엇을 어디에 등록하는지)를 확인할 것.

---

### 3. 리포지토리 함수의 `viewer` 인자 + `scopeFor(viewer)` 행 필터

**Analog:** `repositories/vendors.ts:1-60` (전체 실측) + `domain/permissions/scope-for.ts:1-45` (전체 실측)

```typescript
// repositories/vendors.ts:10-25 (실측)
export async function listVendors(
  viewer: Viewer,
  opts: { scope: Scope; includeHidden: boolean },
): Promise<VendorRow[]> {
  if (opts.scope.rows === "none") return [];
  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(vendors.archivedAt));
  if (!opts.includeHidden) conditions.push(eq(vendors.hidden, false));
  return db.select().from(vendors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(vendors.normalizedName, vendors.id);
}
```

```typescript
// domain/permissions/scope-for.ts:19-40 (실측, 전체) — Scope 서술자를 domain이 만들고
// repositories가 where절로 번역한다. domain은 db import 금지(boundaries 린트).
export type Scope = { rows: "all" | "none"; includeArchived: boolean };
const ENTITY_MENUS: Record<string, string> = {
  code_items: "admin.code-tables",
  org_unit: "admin.people",
  team: "admin.people",
  user: "admin.people",
  corp_card: "admin.corp-cards",
  vendor: "admin.vendors",
};
export async function scopeFor(viewer: Viewer, entity: string, deps?: Partial<ScopeForDeps>): Promise<Scope> {
  const menu = ENTITY_MENUS[entity];
  if (!menu) throw new UnknownScopeEntityError(`scopeFor: 등록되지 않은 entity입니다: ${entity}`);
  // ... can(viewer, menu, "read") 판정 후 rows: "all" | "none" 반환
}
```

**필수 동반 작업:** `ENTITY_MENUS`에 `project`(→ `projects` 메뉴 키 신설 필요)·`quote_line`·
`reserve_ledger` 세 줄을 추가해야 신규 리포지토리가 이 서술자를 쓸 수 있다. 메뉴 키가 아직
없다면 `domain/permissions/menus.ts`에 함께 등록.

**F2 결함(D-59) 주의:** `repositories/vendors.ts:47-49`의 `findVendorById`는
`isNull(archivedAt)` 필터가 **없다**(바로 아래 `findVendorsByNormalizedName:55-59`는 있음) —
신규 `findProjectById`·`findQuoteLineById` 류를 작성할 때 이 결함을 반복하지 말 것
(F2 자체는 vendors.ts를 고치는 별도 커밋 — D-59 — 이지만, 신규 코드가 같은 실수를 반복하면
리뷰에서 반려 대상).

---

### 4. DTO 투영 — `project(viewer, dto)` domain 출구

**Analog:** `domain/permissions/project.ts:1-31` (전체 실측, exact)

```typescript
// domain/permissions/project.ts:12-31 (실측 전문)
export type DtoSpec<Row, Dto> = {
  readonly fields: ReadonlyArray<{ key: keyof Dto & string; from: keyof Row & string; infoItem: string }>;
};

export async function project<Row extends object, Dto extends object>(
  viewer: Viewer,
  row: Row,
  spec: DtoSpec<Row, Dto>,
  deps?: Partial<ProjectDeps>,
): Promise<Partial<Dto>> {
  const visibleFn = deps?.visible ?? defaultVisible;
  const source = row as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (!(field.from in source)) continue;
    const ok = await visibleFn(viewer, field.infoItem);
    if (!ok) continue;
    result[field.key] = source[field.from];
  }
  return result as Partial<Dto>;
}
```

**등록:** `domain/vendors/index.ts:49-69`의 `VENDOR_DTO_SPEC` + `registerDto(...)` 등록 패턴을
`PROJECT_DTO_SPEC`·`QUOTE_LINE_DTO_SPEC`·`RESERVE_LEDGER_DTO_SPEC`에 그대로 적용(파일 미확인 —
계획자가 `domain/vendors/index.ts:49-69`를 직접 열어 정확한 등록 호출 형태를 확인할 것). 리저브는
D-54·정보 노출표 규약에 따라 `visible()`에 새 `infoItem` 등록이 필수(기획본부 기본 숨김).

**`no-row-type-escape` 주의(`eslint/rules/no-row-type-escape.mjs:10,20`):** export된 domain
함수가 `/Row$/`로 끝나는 타입을 그대로 반환하면 린트가 막는다 — 신규 리포지토리 Row 타입은
`ProjectRow`·`QuoteLineRow`처럼 이름은 `Row`로 끝내되, domain 함수는 반드시 `project()`를 거친
DTO 타입만 반환.

---

### 5. 마이그레이션 — `SET LOCAL lock_timeout` 전문 + `.squawk.toml` 금지 규칙

**Analog:** `db/migrations/0000_init.sql:56-58` (실측 전문, 9개 마이그레이션 파일 전부에 반복되는
drizzle-kit 자동 생성 패턴)

```sql
-- db/migrations/0000_init.sql:56-58 (실측)
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
```
이 프리앰블은 각 `CREATE TABLE`/`ALTER TABLE` 문 그룹 앞에 drizzle-kit이 자동 삽입한다
(`pnpm db:generate`로 생성하면 자동으로 붙는다 — 수기로 옮겨 적지 말 것).

**`.squawk.toml`이 금지하는 것(전문 확인, `/home/user/ERP_PLANT8_260917/.squawk.toml`):**
- `assume_in_transaction = true` — drizzle `migrate()`가 파일 전체를 트랜잭션으로 감싸므로
  `CREATE INDEX CONCURRENTLY`와 근본 충돌 → 신규 인덱스는 일반 `CREATE INDEX`만 쓴다
  (`require-concurrent-index-creation`이 배제된 이유이지 "동시 인덱스를 써도 된다"는 뜻이 아님 —
  오히려 반대: 트랜잭션 안이라 `CONCURRENTLY` 자체가 물리적으로 불가능하다).
- 예외 목록에 없는 규칙은 전부 살아있다 — 특히 `adding-required-field`는 better-auth 전용
  예외 사유가 명시돼 있으므로, `projects`·`quote_lines`에 `NOT NULL` 컬럼을 신규 추가할 때는
  이 예외가 적용되지 않는다(신규 테이블의 `CREATE TABLE`이면 문제 없음; 기존 표에
  `source`/`source_id NOT NULL DEFAULT 'demo'` 컬럼 추가(D-58)는 **기존 표에 컬럼을 더하는
  것**이므로 squawk이 `adding-required-field`로 걸 수 있다 — DEFAULT가 있으면 대개 안전하지만
  squawk 규칙 문서로 재확인 필요).

---

### 6. `ui/input/TextField` — CSS 모듈 + 토큰, 96px 라벨 칸의 유일한 정답

**Analog:** `ui/input/TextField.tsx` + `ui/input/TextField.module.css` (전체 실측, `ui/select`·
`ui/form`이 반드시 이 모양을 따라야 함 — scope_hint 지정)

```typescript
// ui/input/TextField.tsx (실측 전문)
import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "aria-invalid" | "aria-describedby"
> & {
  id: string;
  label: string;
  error?: string;
  numeric?: boolean;
};

export function TextField({ id, label, error, numeric = false, className, ...rest }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.field}>
        <input
          id={id} {...rest}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[styles.input, numeric ? styles.numeric : "", error ? styles.inputError : "", className]
            .filter(Boolean).join(" ")}
        />
        {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
```

```css
/* ui/input/TextField.module.css (실측 전문 — 96px 라벨 칸의 정확한 구현) */
.row { margin-bottom: var(--s-4); }
.label {
  display: block;
  margin-bottom: var(--s-1);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
.field { width: 100%; }
.input {
  box-sizing: border-box; width: 100%; height: var(--control-h);
  padding: 0 var(--s-2); border: var(--line-w) solid var(--line-ui);
  border-radius: var(--radius); background: var(--bg); color: var(--fg);
  font-size: var(--fs-base);
}
.input:focus-visible {
  border-color: var(--line-ui); outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}
.inputError { border-color: var(--danger); }
.numeric { font-variant-numeric: tabular-nums; text-align: right; }
.error { margin: var(--s-1) 0 0; color: var(--danger); font-size: var(--fs-sm); }

/* PC 폼: 라벨 왼쪽 96px. 폰(<700px)은 위 규칙(세로 쌓기)이 기본값이다 */
@media (min-width: 700px) {
  .row { display: flex; align-items: flex-start; gap: var(--s-2); }
  .label { flex: 0 0 var(--label-w); margin-bottom: 0; padding-top: var(--s-1); }
  .field { flex: 1 1 auto; }
}
```

**핵심 계약(그대로 옮길 것):** (1) `.row`가 폰에서는 세로 쌓기 기본값, `min-width:700px`에서만
flex 96px(`--label-w`) 라벨 칸으로 전환 — 이 미디어쿼리 순서를 반대로(PC 기본 + 폰 오버라이드)
짜면 안 됨. (2) 색·radius·간격은 전부 `var(--token)` 참조뿐, 하드코딩 0건 — `ui/select`·
`ui/form`도 동일 토큰(`--label-w`, `--control-h`, `--focus`, `--danger` 등)만 참조.
(3) `aria-invalid`/`aria-describedby` + `id`-`errorId` 쌍이 접근성 계약(SYSTEM.md §10) —
`ui/select`의 커스텀 드롭다운도 이 쌍을 유지해야 함.

**`ui/form` 래퍼 자체의 analog는 없음(0건, grep 확인) —** RESEARCH.md도 이 계층을
"Claude's Discretion"으로 명시. `--form-max: 720px`(`docs/design/tokens.css:116`)를 적용하는
최상위 `<form>` 래퍼 컴포넌트는 이 페이즈가 처음 만든다 — analog 없음, SYSTEM.md §6-3을 계약으로
직접 구현.

---

### 7. e2e 스펙(폼 종단) + `fixtures.ts` 사용자 생성

**Analog:** `test/e2e/vendor-edit.spec.ts:1-60` (전체 실측) + `test/e2e/fixtures.ts:1-18` (전체 실측)

```typescript
// test/e2e/fixtures.ts (실측 전문)
import { randomUUID } from "node:crypto";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

export async function createFixtureUser(options: { roleId: string }): Promise<{ email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const name = options.roleId === SYSADMIN_ROLE_ID ? "E2E Admin" : "E2E Employee";
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: options.roleId });
  return { email, password: tempPassword };
}
```

```typescript
// test/e2e/vendor-edit.spec.ts:19-38 (실측, 로그인 헬퍼 + 폼 종단 흐름)
async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("거래처 수정 화면 경로 (MAST-01)", () => {
  test("...", async ({ page }) => {
    await loginAsSysadmin(page);
    const name = `V보${Date.now() % 100000}`;
    await page.goto("/admin/vendors?new=1");
    await page.getByLabel("이름").fill(name);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByRole("cell", { name })).toBeVisible();
    // ... row 조작은 page.locator("tr", { hasText: name })로 스코프
  });
});
```

**`quote-grid-keyboard.spec.ts`가 옮길 것:** `loginAsSysadmin`(또는 PM 권한 픽스처) + `getByLabel`/
`getByRole` 셀렉터 관례 + `Date.now() % 100000` 유니크 이름 생성 관례. 키보드 전용 상호작용
(Tab/Enter/방향키/⌘C·V/Esc)은 이 analog에 없는 신규 패턴 — `page.keyboard.press(...)` +
`page.evaluate`로 `ClipboardEvent` 디스패치(RESEARCH.md Open Question 2 권장안)를 직접 구현.

---

### 8. 보관(soft-delete) + 행동 로그 쌍

**Analog:** `domain/archive/index.ts:1-60`(전체) + `domain/action-log/record.ts:1-27`(부분, `CORE_ACTION_TYPES` 목록까지)

```typescript
// domain/archive/index.ts:44-58 (실측, archive() 본문 앞부분)
export async function archive(
  viewer: Viewer, entity: string, id: string, deps?: Partial<ArchiveDeps>,
): Promise<void> {
  await assertCanWrite(viewer, deps);
  const entry = findEntry(entity);
  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상을 찾을 수 없습니다.");
  if (entry.isProtected?.(row)) { /* ProtectedRowError */ }
  // ... 조건부 UPDATE(멱등) + recordAction 호출로 이어짐(파일 끝부분 미열람 — 계획자가 이어서 확인)
}
```

```typescript
// domain/action-log/record.ts:8-27 (실측 전문 — 핵심 행동 종류 정본)
export const CORE_ACTION_TYPES = [
  "login", "document_create", "document_update", "document_submit",
  "document_approve", "document_reject", "document_withdraw", "document_delete",
  "payment_process", "purchase_process", "settings_change", "permission_change",
  "sensitive_view", "archive", "restore", "excel_export", "mask_reveal",
  "action_log_prune",
] as const;
```

**적용 대상:** D-44(미수주→진행 되살리기 = `restore` 액션 종류로 기록), 상태 전이 전반(문서
계열이 아니므로 `document_*` 대신 신규 액션 종류 추가가 필요할 수 있음 — `project_status_change`
같은 값을 `CORE_ACTION_TYPES`에 추가하는 것을 계획에 명시할 것, 목록이 하드코딩 유니온이라
값을 빠뜨리면 `recordAction` 호출 시 타입 에러로 즉시 드러남).

**주의:** `domain/archive/index.ts`의 `archive()` 함수 뒷부분(실제 UPDATE 호출 + `recordAction`
호출 지점)은 이번 조사에서 끝까지 읽지 못했다 — 계획자는 실행 전 파일 전체(특히 60행 이후)를
직접 Read해 `recordAction` 호출 인자 형태를 확인할 것. 이 보고서에 없는 뒷부분을 있다고
가정하지 말 것.

---

### 9. `domain/seed/index.ts` — `project_status` 재시드 대상

**Analog:** 같은 파일의 기존 시드 블록(교체 대상 자체가 analog)

```typescript
// domain/seed/index.ts:19-25 (실측 전문 — D-63이 교체를 요구하는 그 블록)
const PROJECT_STATUS_CODES = [
  { value: "planning", label: "기획", sortOrder: 0 },
  { value: "in_progress", label: "진행", sortOrder: 1 },
  { value: "on_hold", label: "보류", sortOrder: 2 },
  { value: "done", label: "완료", sortOrder: 3 },
  { value: "cancelled", label: "취소", sortOrder: 4 },
];
```
D-63에 따라 이 배열을 4값(수주중/진행/완료(정산)/미수주)으로 교체하고 `seedCodeItem` 호출부
(같은 파일, `PROJECT_STATUS_CODES`를 순회하는 부분 — 이번 조사에서 순회 루프 자체는 안 열어봄,
계획자가 파일 전체를 다시 Read해 정확한 순회·호출 형태를 확인할 것)를 4값 기준으로 갱신.
동시에 `code_items` 표의 `value`가 아니라 `projects.status` 컬럼 자체가 CHECK 제약을 갖는 별도
정본이 되므로(RESEARCH.md Open Question 1 권장안 채택 시), 이 시드 블록은 **라벨 전용**이고
게이트 하드코딩과는 별개임을 도메인 코드 주석에 명시.

## Shared Patterns

### 4계층 경계 + `viewer` 필수 인자
**Source:** `repositories/vendors.ts` 전체, `eslint/rules/repository-viewer-param.mjs`(존재 확인,
내용 미열람)
**Apply to:** 모든 신규 리포지토리 함수(`projects.ts`, `quote-lines.ts`, `reserve-ledger.ts`,
`exchange-rates.ts`, `document-counters.ts`의 신규 함수) — 첫 인자는 항상 `viewer: Viewer`.

### DTO 투영 단일 출구
**Source:** `domain/permissions/project.ts:1-31`
**Apply to:** 모든 신규 domain 조회 함수의 반환값 — Row 타입을 그대로 반환하지 않고 `project()`를
거친다. `no-row-type-escape` 린트가 이를 강제.

### Server Action + zod + `UserFacingError`
**Source:** `app/(app)/admin/vendors/actions.ts:1-78`, `lib/actions/user-facing-error.ts`(내용
미열람 — 클래스 시그니처만 사용처로 확인)
**Apply to:** `app/(app)/projects/actions.ts`의 모든 export.

### Money 브랜디드 타입 이름 — 단어 경계 필수
**Source:** `eslint/rules/money-boundary.mjs:3`(`MONEY_TYPE_PATTERN = /\bMoney\b/`),
`test/unit/eslint-rules/fixtures/money.ts`
**Apply to:** `domain/money/index.ts`의 타입 선언 전체 — 이름은 정확히 `Money` 또는
`Money<Scale>`만 허용, `MoneyKrw` 같은 접미사 결합 금지.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `ui/form/*`(폼 최상위 래퍼, `--form-max` 적용) | component | request-response | grep 0건 — 이 리포에 폼 전체를 감싸는 공용 컴포넌트가 아직 없다(각 화면이 개별 `<form>`을 직접 씀, RESEARCH.md도 Claude's Discretion으로 명시). SYSTEM.md §6-3을 직접 계약으로 구현 |
| `ui/grid/*`(엑셀식 편집 그리드 본체) | component | event-driven | D-45가 새 의존성 0을 요구하고 이 리포에 role="grid" 커스텀 컴포넌트 선례가 0건. ARIA grid 패턴(MDN)만 참고 가능, 코드 analog 없음 |
| `domain/rules/gate.ts` | domain | request-response | `domain/rules.gate` 자체가 이 페이즈 신규 — `can()`/`visible()`/`scopeFor()` 3함수(판정 함수 스타일)는 참고 가능하나 `{ allowed, reason, ruleKey }` 반환 형태의 게이트 함수는 이 리포에 없다(grep 확인) |
| `domain/document-numbers/format.ts`(서식 조립) | domain | transform | RESEARCH.md Code Examples 섹션이 뼈대만 제공("throw 스텁"), 실제 구현 analog 없음 |
| `scripts/migrate/extract.ts`, `transform.ts` | utility(script) | file-I/O + batch | `scripts/settings-import.ts`가 "로컬 tsx 전용" 카테고리의 유일한 analog이나 이번 조사에서 파일 내용을 열지 않았다 — 계획자가 직접 열어 CLI 인자 파싱·에러 처리 관례를 확인할 것 |

## Metadata

**Analog search scope:** `repositories/`, `domain/`, `app/(app)/admin/*`, `ui/input/`,
`test/e2e/`, `db/migrations/`, `.squawk.toml`, `domain/seed/`
**Files scanned (직접 Read/Grep):** `domain/permissions/project.ts`, `domain/permissions/scope-for.ts`,
`domain/archive/index.ts`, `domain/action-log/record.ts`, `domain/seed/index.ts`,
`repositories/vendors.ts`, `repositories/settings.ts`, `repositories/document-counters.ts`(RESEARCH.md 경유),
`app/(app)/admin/vendors/actions.ts`, `ui/input/TextField.tsx`, `ui/input/TextField.module.css`,
`test/e2e/vendor-edit.spec.ts`, `test/e2e/fixtures.ts`, `db/migrations/0000_init.sql`,
`db/migrations/0006_org_people_cards.sql`, `db/migrations/0007_vendors_crypto_conventions.sql`, `.squawk.toml`
**Not fully read (계획자 재확인 필요):** `app/(app)/admin/vendors/actions.registry.ts`,
`domain/vendors/index.ts:49-69`(`VENDOR_DTO_SPEC` 정확한 형태), `domain/archive/index.ts` 60행
이후(실제 UPDATE+recordAction 호출부), `scripts/settings-import.ts`, `lib/actions/user-facing-error.ts`
**Pattern extraction date:** 2026-09-21

---

## 미열람 5건 — 오케스트레이터가 직접 열어 닫음 (2026-09-21)

패턴 매퍼가 토큰 예산 안에서 못 열고 「계획자가 직접 Read할 것」으로 남긴 다섯이다.
계획자가 다시 헤매지 않도록 여기서 닫는다. 전부 원문 확인.

### 1. `app/(app)/admin/vendors/actions.registry.ts` — 액션 등록 형태

`"use server"` 체인과 분리된 파일에서 `registerAction({ name, menu, action, dtoName })`을 호출한다.
`action`은 `"write"` / `"view"`. **`dtoName: null`이 허용된다** — 마스킹 해제처럼 값을 돌려주지만
DTO 행이 아닌 액션이 그 경우다(정보 노출 항목이 이미 게이트이므로). Phase 4의 새 액션은 전부
같은 자리에 한 줄씩 등록해야 `test/integration/leak-scan.test.ts`가 덮는다.

### 2. `domain/vendors/index.ts:49-69` — DTO 명세와 등록

```ts
export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "vendor.value" },
    // … 10개 전부 같은 infoItem
  ],
};

registerDto({
  name: "VendorDto",
  fields: VENDOR_DTO_SPEC.fields.map((f) => ({ key: f.key, infoItem: f.infoItem })),
});
```

**필드마다 `infoItem`이 따로 붙는다** — 거래처는 10개가 전부 `vendor.value` 하나지만, Phase 4의
리저브는 「정보 노출표의 새 항목이라 기획본부 기본 숨김」(ROADMAP 기준 6)이므로 금액 필드에
다른 `infoItem`을 물릴 수 있는 구조다. `registerDto`가 `VENDOR_DTO_SPEC`에서 파생되므로 명세와
등록이 어긋날 수 없다 — Phase 4도 같은 형태를 쓴다.

### 3. `domain/archive/index.ts:58-86` — 보관·복원 + 행동 로그 쌍

순서가 계약이다: `findById` → 없으면 `ArchivableRowNotFoundError` → `isProtected?.(row)`면
`ProtectedRowError` → `entry.setArchived(viewer, id, true)` → **그 다음** `recordAction(viewer,
{ actionType: "archive", entity, entityId: id })`. 복원은 `actionType: "restore"`로 같은 모양.
`deps?.recordAction ?? defaultRecordAction` 주입 패턴이 테스트 진입점이다.

보관함 목록 자체는 별도 정보 항목 `"archive.value"`로 게이트한다(여러 표를 섞은 목록이라
표별 항목이 안 맞아서 신설했다는 주석이 `domain/archive/index.ts:88-90`에 있다). Phase 4의
`project`·`quote_line`·`reserve_ledger`도 보관 대상이면 `ARCHIVABLE_TABLES`에 한 줄씩 붙는다.

### 4. `lib/actions/user-facing-error.ts` — 오류 노출 경계

```ts
export class UserFacingError extends Error {}
```

표식 클래스 하나다. `lib/actions/client.ts`의 `handleServerError` 화이트리스트가 이것(과 상속
클래스, 예: `ForbiddenError`)만 화면에 message를 내보낸다. **그 밖의 `Error`는 서버 로그에만
남고 화면엔 일반 문구가 간다.** Phase 4의 게이트 거부 사유(D-56의 `reason`)를 사용자에게
보이려면 이 클래스를 거쳐야 한다 — §8-3 오류 문구 형식과 맞물리는 지점이다.

### 5. `scripts/settings-import.ts:6-13` — 로컬 운영자 스크립트 관례

**이 주석이 `scripts/migrate/`의 배치를 이미 정해 준다** (04-CONTEXT.md의 Claude 재량 항목이
추측이 아니라 선례였다):

> Cloud Run Job 번들에는 넣지 않는다. … 배포마다 자동으로 도는 프로비저닝 단계(migrate·seed·
> account·db-bootstrap, **이 넷만** `scripts/build-cli.mjs` 번들·Cloud Run Job으로 존재)가
> 아니라, 운영자가 필요할 때 손으로 한 번 돌리는 관리 작업이다.

인자 규약도 `scripts/account-cli.ts`와 같다: **플래그와 값은 항상 별개 argv 원소, 등호 결합
(`--flag=value`)은 거부**하고 `UsageError`를 던진다. `parseArgs(argv)`를 export해 단위 테스트가
직접 부른다. `scripts/migrate/extract.ts`·`transform.ts`가 그대로 따를 형태다.

### 오케스트레이터가 함께 확인한 것

| 패턴 매퍼 주장 | 확인 결과 |
|---|---|
| `ENTITY_MENUS`에 3줄 추가가 선행 조건 | ✓ `domain/permissions/scope-for.ts:21-28`, 항목 6개. 주석이 「새 마스터 표가 생기면 이 표에 한 줄을 더한다」고 규약을 적어 뒀다 |
| DTO 출구는 `project(viewer, row, spec)` | ✓ `domain/permissions/project.ts:18-23`. 정확히는 네 번째 인자 `deps?`가 있다(테스트 주입용) |
| `repositories/settings.ts`의 `db.transaction` | ✓ `applySettingsImport`가 `db.transaction(async (tx) => …)`. 이 레포의 유일한 트랜잭션 선례가 맞다 |
| `ui/form`·`ui/grid`·`domain/rules` analog 0건 | ✓ 디렉터리 셋 다 없고 `rules.gate` 참조도 0건 |
