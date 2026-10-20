# Phase 7: 공휴일·지급일·마감·알림 + 전 메뉴 권한 검수 - Pattern Map

**Mapped:** 2026-10-20 (main 9122c31 기준)
**Files analyzed:** 22 (신규·수정 묶음 단위)
**Analogs found:** 21 / 22
**경로 검증:** 아래 모든 analog 경로는 `git ls-files`로 추적 확인한 소스다(gitignored 미러 없음). 줄 번호는 이번 세션에 읽은 범위 기준.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `domain/payments/pay-schedule.ts` (신규, 순수 함수) | utility | transform | `domain/holidays/business-day.ts` + `domain/payments/action-row.ts` | role-match |
| `domain/payments/pay-schedule-load.ts` (신규, 어댑터) | service | request-response | `domain/payments/targets.ts` (설정·공휴일 로드 부분) | role-match |
| `domain/rules/register.ts` (수정: `payment.cutoff`) | rule/gate | request-response | 같은 파일 `payment.evidence-required` (:353-368) | exact |
| `domain/settings/keys.ts` (수정: 설정 3키 + 원가율 등) | config | CRUD | 같은 파일 `EVIDENCE_PREPAID_DUE_DAYS` (:1263-1270), `PROJECT_PROFIT_RATE_THRESHOLD` (:805-814) | exact |
| `domain/notify/condition-kinds.ts` (수정) + `domain/notify/kinds/*.ts` (신규) | service | event-driven(batch) | `domain/notify/condition-kinds.ts` + `test/support/notify-tick.ts` | exact |
| `domain/notify/rules.ts` (신규, 덮어쓰기 표 병합) | service | CRUD | `domain/settings/registry.ts` (코드 기본값 ⊕ DB 값) | role-match |
| `domain/notify/tick.ts` (수정: 규칙 병합·받는 계급 확장) | service | batch | 같은 파일 :95-135 | exact |
| `db/schema/notification-rules.ts` (신규) + 마이그레이션 | model/migration | CRUD | `db/schema/notifications.ts` + `db/migrations/0038_phase61_evidence.sql` | exact |
| `db/schema/vendors.ts` (수정: 지급 기한·version 등) + 서류·담당자·계좌 변경 표 | model/migration | CRUD | 같은 파일 (:22-45) | exact |
| `db/schema/expenses.ts` (수정: 희망 지급일·사유) | model/migration | CRUD | 같은 파일 (:42 `scheduledPaymentDate`) | exact |
| 행동 로그 불변 트리거 마이그레이션 | migration | — | `0038_phase61_evidence.sql` 머리 주석(락 시간 한 쌍) | partial |
| `domain/action-log/record.ts` (수정: `settings_change` 끌 수 없게, `detail.changes`) | service | event-driven | 같은 파일 `ALWAYS_ON_ACTION_TYPES` (:108-120, :213) | exact |
| `app/(app)/admin/notification-rules/{page,form,actions,actions.registry}` (신규) | controller+component | CRUD | `app/(app)/admin/vendors/*`, `app/(app)/admin/holidays/*` | exact |
| `domain/permissions/menus.ts` (수정: `admin.notification-rules` 등) | config | — | 같은 파일 MENUS (:50-75) | exact |
| `domain/seed/index.ts` (수정: 계급 기본값, 대표 `admin.action-log`) | seed | batch | 같은 파일 :195-275 | exact |
| 거래처 폼 보강 (`vendor-form.tsx`, `actions.ts`, `page.tsx`) | component+controller | CRUD | 같은 파일들 | exact |
| 사람 화면 잠금 풀기·초기화 단추 | component | request-response | `app/(app)/admin/people/person-form.tsx` + `app/(app)/account/change-password-form.tsx` | role-match |
| 설정 폼 `settings-form-client.tsx`, `/account` 폼 이관 | component | CRUD | `app/(app)/admin/vendors/vendor-form.tsx`(PanelForm), `change-password-form.tsx`(page 배치 `Form`) | role-match |
| `test/unit/dto-registry-coverage.test.ts` (신규) | test | transform | `test/unit/leak-scan-coverage.test.ts` | exact |
| `test/integration/leak-scan.test.ts` (수정: 자동 로드) | test | batch | 같은 파일 :14-50 | exact |
| `test/unit/payments/pay-schedule.test.ts` (신규) | test | transform | `test/unit/holidays/business-day.test.ts` | exact |
| `test/integration/notify-conditions.test.ts` (신규) | test | event-driven | `test/integration/notify-tick.test.ts` + `test/support/notify-tick.ts` | exact |
| `test/e2e/*.spec.ts` (알림 규칙·거래처·계급 스모크; 폰은 `mobile-*.spec.ts`) | test | request-response | `test/e2e/holidays.spec.ts`, `vendors.spec.ts`, `mobile-vendors.spec.ts` | exact |

## Pattern Assignments

### `domain/payments/pay-schedule.ts` (utility, transform)

**Analog:** `domain/holidays/business-day.ts` (순수 모듈 관례: 날짜는 KST `YYYY-MM-DD` 문자열, UTC `setUTCDate` 산술만, `HolidayLookup` 주입)

**시그니처·산술 관례** (`business-day.ts` 1-60, 일부):
```ts
export type HolidayLookup = (year: number) => ReadonlySet<string>;
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function isBusinessDay(date: string, lookup: HolidayLookup): boolean {
  return isWeekday(date) && !lookup(Number(date.slice(0, 4))).has(date);
}
```
**함정(읽고 확인):** `addBusinessDays(date, 0, …)`는 **앞으로** 굴러 영업일을 찾는다(:70-73). "d 이하 가장 가까운 영업일"은 `isBusinessDay(d) ? d : addBusinessDays(d, -1)`로 써야 한다(RESEARCH Pattern 1). 순수 모듈이므로 DB·설정·시계 import 금지. KST 시각 변환·표기는 `toKstDate`/`formatKstMinute`/`formatKstTime`(같은 파일) 재사용.

**결재 순수 모듈 관례:** `domain/approvals/route.ts` 머리 주석(순수 함수 한 곳, RESEARCH 인용). 지급 쪽 순수 판정 선례 = `domain/payments/action-row.ts`의 `approvalGateDecision`/`resolveExpenseActionRow` (gate 몸통이 화면과 같은 순수 함수를 부르는 구조).

---

### `domain/rules/register.ts` — `payment.cutoff` 추가 (rule, request-response)

**Analog:** 같은 파일 `payment.*` 묶음 (:353-368 근처)

**등록 패턴:**
```ts
registerGateRule<unknown, EvidenceGateInput>({
  name: "payment.evidence-required",
  check: (_doc, ctx) => evidenceGateDecision(ctx),
});
```
→ `registerGateRule<unknown, CutoffCtx>({ name: "payment.cutoff", check: (_doc, ctx) => cutoffDecision(ctx) })`. `cutoffDecision`은 `pay-schedule.ts`에서 import(몸통은 순수 함수를 부르기만 함).

**gate 계약** (`domain/rules/gate.ts` 1-60): `GateDecision = {allowed:true} | {allowed:false; reason}`; 미등록 이름은 `UnknownGateRuleError`를 던진다. 호출은 `await gate(doc, "payment.cutoff", ctx)`. 호출자(`domain/payments/targets.ts`)는 이미 `import { gate } from "@/domain/rules/gate"; import "@/domain/rules/register";` (:5-6)를 갖는다.
**시험:** `test/unit/domain/rules-gate.test.ts`, `rules-card-dual-link.test.ts`, `rules-line-paid-lock.test.ts` 형태(순수 decision 함수를 직접 단위 시험).

---

### `domain/settings/keys.ts` — 지급 기한 일수·요일·마감 시각·원가율·잠금 범위 (config, CRUD)

**Analog:** `EVIDENCE_PREPAID_DUE_DAYS` (:1263-1270)
```ts
export const EVIDENCE_PREPAID_DUE_DAYS: SettingDef<number> = {
  key: "evidence.prepaid_due_days",
  kind: "simple",
  schema: z.coerce.number().int().min(1),
  label: "선결제 증빙 기한",
  hint: "지급일부터 센 날수",
  namespace: "증빙",
  unitLabel: "일",
  default: 14,
};
```
**등록:** 정의 뒤에 `SETTING_DEFS.push(PROJECT_PROFIT_RATE_THRESHOLD);` 식으로 덧붙인다(:757-814, 파일 끝 덧붙이기 — 병합 충돌 완화). 읽기 호출은 `getSettingValue(DEF)` (`domain/settings/registry.ts`, 호출 예 `domain/expenses/index.ts:1655`). 범위가 있는 키는 `PROJECT_PROFIT_RATE_THRESHOLD`의 `.min(0).max(100)` 형태. 키 이름 제안: `payment.term_days`(60, min1 max180)·`payment.weekday`·`payment.cutoff_time`.
**주의:** 설정 변경 시 `settings_change` 행동 로그 + 전후 값은 `domain/settings/registry.ts`(위험 경로 아님) 쪽에서 한다(RESEARCH R5).

---

### `domain/notify/condition-kinds.ts` + `domain/notify/kinds/*.ts` (service, event-driven/batch)

**Analog:** `domain/notify/condition-kinds.ts` 전체(31줄) + 테스트 종류 `test/support/notify-tick.ts`

**현재 계약** (condition-kinds.ts 4-23):
```ts
export type NotificationCandidate = { entity: string; entityId: string; recipientId: string; round: number; referenceDate: string; message: string };
export type ConditionKind = {
  kind: string; label: string;
  dateUnit: "business" | "calendar";
  evaluate(ctx: { today: string }): Promise<NotificationCandidate[]>;
};
export const CONDITION_KINDS: readonly ConditionKind[] = [];
```
**evaluate 계약(주석 :19-20):** `today`까지 기한이 된 발생을 **전부 안정된 키로** 돌려준다(그날만 돌려주면 주말·상한 초과분 소실). 평가량 한도는 종류가 자기 쿼리에 둔다. 사건 종류(D-716)는 `entityId`를 사건 id로 해서 dedup 키 `(conditionKind, entity, entityId, recipientId, round)`가 한 번만 만들게 한다.
**확장(RESEARCH Pattern 3):** `defaults:{enabled,days?,emailEnabled}`·`daysRange?` 필드를 `ConditionKind`에 더하고, evaluate ctx에 규칙 파라미터 `params`를 더한다. 테스트 종류는 프로덕션 등록부에 넣지 않는다(주석 :21).

**tick 소비부** (`domain/notify/tick.ts` 105-123): 종류별 try/catch 격리, 실패 시 `evaluationFailed = true` + `log.error("notify.condition_failed", …)`. 규칙 병합은 `for (const kind of conditionKinds)` 앞에서 `defaults ⊕ notification_rules`로 "켜진 규칙"만 걸러 넘기는 방식이 최소 변경. 의존 주입은 `TickDeps.conditionKinds`(:28)이므로 시험은 `runTick({conditionKinds})`로 주입.

**Imports (tick.ts 1-22 관례):** `@/domain/holidays/business-day`(`toKstDate`), `@/domain/settings/registry`(`getSettingValue`), `@/repositories/notifications`(viewer 필수 레포 함수). 새 종류가 읽는 DB는 반드시 `repositories/` 경유 + `SYSTEM_VIEWER`.

---

### `db/schema/notification-rules.ts` (model, CRUD) + 마이그레이션

**Analog:** `db/schema/notifications.ts` (1-80)

**스키마 관례:**
```ts
import { sql } from "drizzle-orm";
import { pgTable, text, bigint, integer, date, timestamp, boolean, index, unique, check } from "drizzle-orm/pg-core";
import { users } from "./auth";
// 행 단위 NOT NULL 키 + unique 제약 + CHECK
unique("notification_log_dedup_key").on(table.conditionKind, table.entity, table.entityId, table.recipientId, table.round),
check("notification_log_email_status_check", sql`${table.emailStatus} in ('pending', 'sending', …)`),
```
덮어쓰기 표: `condition_kind` text PK(또는 unique) · `enabled` boolean · `days` integer(CHECK로 범위) · `extra_role_ids` text[] · `email_enabled` boolean · `updated_by` · `updated_at`. 파일을 만들면 `db/schema/index.ts`에 `export * from "./notification-rules";` 추가(현재 `export * from "./roles"` 등 나열 방식).

**마이그레이션 헤더 관례** (`db/migrations/0038_phase61_evidence.sql` 1-6): 기존 표에 칸·색인을 더하면 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` 한 쌍을 첫 락 문장 앞에 두고 `--> statement-breakpoint`로 문장 구분. 롤백 하한 불필요 여부를 주석으로 남긴다("표·칸·색인을 더하기만 해서…"). `.claude/rules/db.md`: `pnpm db:generate`로만 생성, 번호는 main 마지막(현재 0038) 다음, 한 웨이브에 스키마 플랜 하나, Squawk 통과, 금액 `bigint`. 최신 번호 확인: `ls db/migrations`(0038까지 존재).

---

### `db/schema/vendors.ts`, `db/schema/expenses.ts` 수정 (model, CRUD)

**Analog:** `db/schema/vendors.ts` :22-45. 칸 추가 관례: `text("…").$type<…>()`, `check("vendors_kind_check", sql\`…\`)`, 조건부 유일 색인:
```ts
uniqueIndex("vendors_business_no_live_key")
  .on(sql`regexp_replace(${table.businessNo}, '[^0-9]', '', 'g')`)
  .where(sql`${table.archivedAt} IS NULL AND regexp_replace(...) <> ''`),
```
**중요(RESEARCH 발견):** V5·V6(사업자번호 유일 색인·갈래 CHECK)은 이미 main에 있다(마이그레이션 0027·0030). 새로 만들지 말 것. 새 칸: `payment_term_days integer` + CHECK(1~180, 협력사만은 도메인 검증), `version integer not null default 1`(G9, 낙관적 잠금). `expenses.scheduledPaymentDate`(`db/schema/expenses.ts:42`)는 "수동값 전용"으로 재사용(null = 자동), 새 칸은 희망 지급일 + 사유 + CHECK(둘 다 있거나 둘 다 없음).

---

### `app/(app)/admin/notification-rules/*` (controller+component, CRUD)

**Analog:** `app/(app)/admin/vendors/{actions.ts, actions.registry.ts, vendor-form.tsx, page.tsx}`, 공휴일 화면 `app/(app)/admin/holidays/*`

**actions.registry.ts 분리 관례** (vendors/actions.registry.ts 1-15):
```ts
import { registerAction } from "@/lib/actions/registry";
registerAction({ name: "updateVendorAction", menu: "admin.vendors", action: "write", dtoName: "VendorDto" });
```
DTO 행이 아닌 반환은 `dtoName: null`. 신규 화면은 `registerAction({ name: "updateNotificationRuleAction", menu: "admin.notification-rules", action: "write", dtoName: "NotificationRuleDto" })` + `registerDto`(domain 쪽).

**actions.ts 관례** (vendors/actions.ts 1-60): `"use server"`, `authedActionClient`, `returnValidationErrors`, `revalidatePath`, 맨 위에서 `import "./actions.registry";`. zod 스키마는 모듈 안 비공개 상수(`"use server"` 파일은 async 함수 외 내보내기 불가). 오류 메시지는 "무엇 필요 · 다음 행동" 형태(`"이름 필요 · 이름 입력"`).

**폼 컴포넌트 관례** (vendor-form.tsx 1-110): `"use client"`, `useAction` + `PanelForm`/`SidePanel`(`@/ui/side-panel/*`), `Form`·`TextField`·`Button`(`@/ui/*`), 오류 추출은 `fieldErrorsReason, formReason, staleFieldsReason`(`@/lib/actions/form-reason`), 동기 가드 `submitLockRef`(연타 방지), 성공은 `panelRef.current?.succeed({ status: "…" })`. 동시 수정 충돌은 `staleFieldsReason`이 선례(G9 version 연결).

**page.tsx 관례** (vendors/page.tsx 1-45): `export const dynamic = "force-dynamic"`, `ListScreen`/`ListEmpty`/`StatusTag`/`StaticTable`/`RowAction`, URL 상태(`?editId=`, `?new=1`)로 패널 진입, `can(viewer, menu, "view")` 게이트(없으면 404).

**메뉴 등록:** `domain/permissions/menus.ts` MENUS 배열에 `{ key: "admin.notification-rules", label: "알림 규칙" }` 추가(:50-75 형태; 공휴일 선례 `{ key: "admin.holidays", label: "공휴일" }`). 시드가 MENUS 전체를 순회해 시스템 관리자에게 켠다(`domain/seed/index.ts:204-228`).

**누수 스캔 등록:** `test/integration/leak-scan.test.ts` import 목록(:23-50)에 `import "@/app/(app)/admin/notification-rules/actions.registry";` 추가 — 단, R1 자동 로드 검사가 이 수동 목록을 대체한다.

---

### `domain/seed/index.ts` — 계급 기본값·대표 행동 로그 (seed, batch)

**Analog:** 같은 파일 :195-275

**insert-if-absent 패턴 (운영 값 덮지 않음, D-722):**
```ts
await insertPermissionIfAbsent(viewer, {
  roleId: DEFAULT_ROLE_ID,
  menu: "projects",
  action,           // for (const action of ["view","write"] as const)
  allowed: true,
  updatedBy: null,
});
permissionsCount++;
```
시스템 관리자만 `upsertPermission`(강제 덮어쓰기)로 MENUS×PERMISSION_ACTIONS 전부를 켠다(:200-228). `certs.submissions`처럼 개인정보 열람 메뉴는 `allowed:false` insert-if-absent로 둔 선례(:206-217). 대표 계급은 역할 이름을 코드에 두지 않는 관례(menus.ts 주석 "역할 이름을 코드에 두지 않는다") — 대표 `admin.action-log` view 시드 방식은 D-722 확인 카드 후 결정.

---

### `domain/action-log/record.ts` — `settings_change` 끌 수 없게·전후 값 (service, event-driven)

**Analog:** 같은 파일
- `CORE_ACTION_TYPES`(:10-60)·`ACTION_TYPE_LABELS`(:80~)·`ALWAYS_ON_ACTION_TYPES`(:108-120) **세 곳을 같은 변경에서 함께 고친다**(주석 :31-33 Pitfall 2). 새 종류(예: 알림 규칙 변경)는 세 배열 모두에.
- 끌 수 있는지 판정: `if (!ALWAYS_ON_ACTION_TYPES.includes(entry.actionType)) {… isActionTypeEnabled …}` (:213). `settings_change`를 `ALWAYS_ON_ACTION_TYPES`에 추가하면 R4가 끝난다.
- 한 트랜잭션 기록 관례: `account_lock`/`holiday_change`/`payment_cancel` 주석 — "상태 변경과 한 트랜잭션으로 남기는 기록이라 끌 수 없다".
- 불변 트리거는 마이그레이션(DELETE·TRUNCATE 거부, 정리 표시 UPDATE만) — 직접 analog 없음(아래 No Analog).

---

### `test/unit/dto-registry-coverage.test.ts` (test, transform)

**Analog:** `test/unit/leak-scan-coverage.test.ts` (1-50) — 정적 판정(`readdirSync` 재귀로 파일 수집 → 소스 문자열 검사), 검출기 자체 생존 확인 단언:
```ts
function findRegistryFiles(dir: string): string[] { /* readdirSync recursion, entry.name === "actions.registry.ts" */ }
function importSpecifierFor(file: string): string { return `@/${file.replace(`${ROOT}/`, "").replace(/\.ts$/, "")}`; }
it("등록 파일을 하나 이상 찾았다(검출기 자체가 죽어있지 않다)", () => { expect(registryFiles.length).toBeGreaterThan(0); });
```
신규 시험: `domain/**`에서 `export type \w+Dto\b` 열거 → `DTO_REGISTRY`(`domain/permissions/dto-registry.ts:13`, `registerDto` :23-33) 대조. 단 레지스트리는 모듈 로드 후 채워지므로 시험이 등록 모듈을 import해야 한다(R1 자동 로드와 같은 장치 공유). `ui/` 경로 시험은 `domain/` import 불가(`.claude/rules/tests.md`)이므로 파일은 `test/unit/` 직하에 둔다.

### `test/integration/leak-scan.test.ts` (수정, 자동 로드)
**Analog:** 같은 파일 :1-50. 현재 side-effect `import "@/domain/…"`·`import "@/app/(app)/admin/…/actions.registry"` 수동 나열(12개 누락 원인). 자동 로드: 위 `findRegistryFiles`를 재사용해 `await import(specifier)`로 전부 로드 후 `DTO_REGISTRY`/`ACTION_REGISTRY`/`EXPORT_REGISTRY`를 순회. DB 시드는 `seedMasterData`·`skipDbReset`(`./setup`).

---

### `test/unit/payments/pay-schedule.test.ts` (test, transform)

**Analog:** `test/unit/holidays/business-day.test.ts` (1-30)
```ts
function ruleLookup(): { lookup: HolidayLookup; requested: number[] } {
  const requested: number[] = [];
  const lookup: HolidayLookup = (year) => { requested.push(year); return new Set(generateHolidayRules(year).map((row) => row.date)); };
  return { lookup, requested };
}
```
공휴일은 `generateHolidayRules`(`domain/holidays/rules.ts`) 또는 `test/unit/holidays/official-calendar.ts`(`OFFICIAL_2026`)를 lookup으로 쓴다. 필수 케이스(07-SCOPE J12): 금요일 공휴일 주·월요일 휴일 직후·추석 주·60일이 정확히 금요일인 날·`termDays<=6`(금요일 없음) 밀림.

### `test/integration/notify-conditions.test.ts` (test, event-driven)

**Analog:** `test/integration/notify-tick.test.ts` (1-45) + `test/support/notify-tick.ts`
```ts
const userId = (await createAccount(SYSTEM_VIEWER, { email, name: prefix })).userId;
await runTick({ conditionKinds: [createTestConditionKind(source)] /* … */ });
db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId));
```
`createTestConditionKind(source, {kind})`가 evaluate 계약 중 "referenceDate <= today 발생 전부" 예시. 설정 변경은 `setSettingValue`(`@/domain/settings/registry`), 상한은 `NOTIFY_TICK_BATCH_MAX`. 테스트 종류 코드는 `test/support`에만 두고 프로덕션 폴더가 import하지 않는다.

### Playwright 데스크톱 스펙 (알림 규칙·거래처·계급 스모크)
**Analog:** `test/e2e/vendors.spec.ts`(1-30), `test/e2e/holidays.spec.ts`(1-45)
- 픽스처: `createFixtureUser({ roleId: SYSADMIN_ROLE_ID })` (`./fixtures`), 권한 조정 `setPermissionCell`·`insertRole`·`setRoleArchived`(repositories), 로그인 헬퍼 `loginAsSysadmin`(`./row-actions-helpers`) 또는 파일 안 `login()`.
- 디자인 원칙 검사: `checkPrinciples`(`./principles-check`), `isStrict`(`./design-principles`).
- 상태를 바꾸는 스펙은 `test.describe.configure({ mode: "serial" })` + 시작 시 상태 리셋(holidays.spec.ts :16-20).
- 폰 375 전용은 파일명 `mobile-*.spec.ts`(예 `mobile-vendors.spec.ts`, `mobile-holidays.spec.ts`)만으로 프로젝트 자동 분류. `CI=true pnpm test:e2e test/e2e/<spec>`로 건드린 스펙만. 테스트 DB 공유라 DB·Playwright는 동시에 하나만(`.claude/rules/tests.md`).
- 계급 스모크(`role-smoke.spec.ts` 신규)는 `test/e2e/admin-nav.spec.ts`·`admin-cap-fixtures.ts`(계급 고정물)를 먼저 읽고 맞출 것.

---

### 관리자 폼 이관 (R13: `settings-form-client.tsx`, `/account`)

**Analog 1:** `app/(app)/account/change-password-form.tsx` (1-40) — 이미 `Form layout="page"` + `TextField` + `FormAlert` + `useAction`; 서버 검증 메시지 문자열 불변(`test/e2e/change-password.spec.ts` 계약).
**Analog 2:** `app/(app)/admin/vendors/vendor-form.tsx` — `PanelForm` 옆 패널 배치.
설정 페이지(`app/(app)/admin/settings/settings-form-client.tsx`)는 페이지 배치(§6-3)이므로 Analog 1의 `Form layout="page"`가 가깝다. 네이티브 select/input은 `ui/select`(`SelectHint`)·`TextField`로. 오류 표시는 SYSTEM.md §7-2. UI 파일을 만지기 전 `design-gate` 스킬 호출(훅 강제), DOM 감사는 별도 에이전트.

### 사람 화면 잠금 풀기·초기화 단추 (U1·U2)
**Analog:** `app/(app)/admin/people/person-form.tsx`, `app/(app)/admin/people/[id]/person-detail-client.tsx`, 액션 `app/(app)/admin/people/[id]/actions.ts`+`actions.registry.ts`. 도메인 함수는 `domain/auth/accounts.ts:72`(`resetPassword`)·`:104`(`unlockAccount`)로 이미 있음(호출처 `scripts/account-cli.ts`뿐). 위험 경로(`domain/auth/`) 변경은 사용자 머지 PR. 임시 비밀번호 1회 표시는 액션 반환값(`dtoName: null` 등록 선례: `revealVendorAccountNumberAction`)이 선례.

---

## Shared Patterns

### 순수 함수 한 벌 (D-715)
**Source:** `domain/holidays/business-day.ts` + `domain/payments/pay-schedule.ts`(신규)
**Apply to:** 지급 목록(`domain/payments/targets.ts`), `payment.cutoff` gate, 임박·마감 조건 종류, 화면 배지, 세금 기준일(`domain/expenses/tax.ts` `pickTaxDates`). 소비처 교체 목록은 RESEARCH §2.4.

### Server Action 4계층 + 누수 스캔 등록
**Source:** `app/(app)/admin/vendors/actions.ts`·`actions.registry.ts`
**Apply to:** 알림 규칙, 사람 단추, 거래처/PO/프로젝트 서류 액션, 「이번 주로」 액션. `authedActionClient`만, `registerAction` 필수(`lib/actions/registry`), 반환 DTO는 `registerDto`.

### 설정 키 등록
**Source:** `domain/settings/keys.ts:1263-1270, 757-814`
**Apply to:** 지급 3키·원가율·잠금 범위.

### insert-if-absent 시드
**Source:** `domain/seed/index.ts:236-275` (`insertPermissionIfAbsent`)
**Apply to:** 계급 기본값, 알림 규칙(시드 행 없이 코드 기본값 권장).

### 행동 로그 끌 수 없는 종류 3곳 동시 수정
**Source:** `domain/action-log/record.ts` `CORE_ACTION_TYPES`/`ACTION_TYPE_LABELS`/`ALWAYS_ON_ACTION_TYPES`
**Apply to:** 알림 규칙 변경, 「이번 주로」, 계좌 변경 기록, 설정 변경.

### 마이그레이션 위험 경로 분리
**Source:** `.claude/rules/db.md`, `0038_phase61_evidence.sql` 머리
**Apply to:** 스키마 플랜 전부(S1~S4). 한 웨이브 한 스키마 플랜. 위험 경로 정규식에 `domain/seed/`·`lib/auth.ts`·`lib/env.ts`는 없지만 권한·인증 성격이라 사용자 머지 권장(RESEARCH §7).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| 행동 로그 불변 트리거 마이그레이션 | migration | — | `db/migrations`에 트리거(PL/pgSQL) 선례 확인 못 함. 마이그레이션 헤더 관례만 `0038`에서 차용, 트리거 SQL은 RESEARCH/새 작성 (미확인: 더 이른 마이그레이션에 트리거가 있는지 `grep -l TRIGGER db/migrations/*.sql`로 플래너가 한 번 확인) |

## Metadata

**Analog 검색 범위:** `domain/{rules,notify,holidays,payments,settings,seed,permissions,action-log}`, `db/schema`, `db/migrations`, `app/(app)/admin/{vendors,holidays,people,settings}`, `app/(app)/account`, `app/internal/notify-tick`, `test/{unit,integration,e2e,support}`
**읽은 파일 수:** 약 20 (CONTEXT·RESEARCH 1-300줄·SCOPE-ITEMS 포함)
**미확인 한계:** RESEARCH 300줄 이후(§2.4 소비처 교체 목록, Validation Architecture 등)는 읽지 않았다. 플래너가 직접 읽을 것. `domain/payments/targets.ts` 본문(judgeTargets), `ui/form` 컴포넌트 구현은 열지 않음(import 경로만 확인).
**Pattern extraction date:** 2026-10-20
