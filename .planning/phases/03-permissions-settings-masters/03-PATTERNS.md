# Phase 3: 권한·설정·마스터 — Pattern Map

**Mapped:** 2026-09-20
**Files analyzed:** 신규/확장 대상은 ROADMAP Phase 3 절 + REQUIREMENTS(ADMN-01·02·03·05·06·08·10·12, OPS-05, MAST-01~04)에서 파생 — `can()/visible()/scopeFor()/project()`, `domain/viewer.ts` 확장, 5계급 스키마·조직(본부/팀) 스키마, 권한표·정보 노출표 스키마, 설정 레지스트리, 누수 스캔 테스트 생성기, `encrypt()/decrypt()`, 보관함, 행동 로그, `field_definitions`+`custom_fields`, 코드표·거래처·법인카드 관리 화면
**Analogs found:** 대부분 role-match 또는 exact(같은 파일 확장) — 이 페이즈가 처음 만드는 개념(권한표 자체, 설정 레지스트리, 누수 스캔 생성기)은 "no analog"로 명시

모든 analog 경로는 `git ls-files`로 확인했다(전부 `app/`·`domain/`·`repositories/`·`db/`·`lib/`·`eslint/`·`test/` 아래 일반 추적 파일).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `domain/viewer.ts` (Viewer 확장: id/isAdmin → id/roleId 등) | model/utility | transform | `domain/viewer.ts` (현재 2-필드 shape, 자기 자신) | exact — edit same file |
| `domain/permissions/can.ts`, `visible.ts` | domain(policy) | transform | `domain/auth/lockout.ts` (순수 판정 함수, env 읽어 반환) | role-match |
| `repositories/*`의 `scopeFor(viewer)` 적용 | repository | CRUD | `repositories/users.ts`, `repositories/login-attempts.ts`, `repositories/system-status.ts` (현재 `void viewer` 자리표시) | exact — 이 페이즈가 채우는 자리 |
| `domain/*/project(viewer, dto)` | domain(policy) | transform | 없음(신규 개념) — 가장 가까운 선례는 `domain/system-status/index.ts`의 `if (!viewer.isAdmin) throw` 게이트(같은 파일 안에서 viewer 검사 후 반환값 결정) | role-match(부분) |
| `db/schema/roles.ts`, `org-units.ts`(본부), `teams.ts`, `team-memberships.ts`(발령 이력) | model(schema) | CRUD | `db/schema/auth.ts`(pgTable 컨벤션, FK `.references()`, `notNull().default()`), `db/schema/login-attempts.ts`(index 배열 함수형 3번째 인자) | exact(컨벤션) |
| `db/migrations/000N_*.sql` (신규 표) | migration | batch | `db/migrations/0000_init.sql`, `0001_login_attempts.sql`, `0002_rate_limits_id_column.sql`(명명 규칙: `%04d_설명.sql`, drizzle-kit 생성) | exact |
| `db/schema/permission-matrix.ts`, `visibility-matrix.ts` | model(schema) | CRUD | `db/schema/login-attempts.ts`(단순 CRUD 표 + index) | role-match |
| `lib/settings-registry.ts` (typed registry) | config | transform | `lib/env.ts`(zod 스키마 + `ENV_KEYS` 배열 + "미등록/미사용 키 검출" 정신은 없음 — env는 프로세스 시작 시 1회 파싱, 설정은 DB 기반 런타임 변경) | role-match(부분, 아래 §5 참고) |
| `repositories/settings.ts` | repository | CRUD | `repositories/system-status.ts`(단일 값 조회 shape) | role-match |
| `domain/settings/*.ts` (세율·절사·기준일 등 이력형 값) | domain | CRUD/transform | `domain/auth/lockout.ts`(env 기반 설정값을 순수 함수로 감싸는 선례 — 하지만 이력형·DB 기반은 신규) | role-match(부분) |
| `lib/crypto.ts` (`encrypt()/decrypt()`, AES-256-GCM, `v1:` 접두어) | utility | transform | 없음(신규) — 가장 가까운 코드 컨벤션은 `lib/env.ts`의 `APP_DATA_KEY_v1` 키 이름 자체(이미 존재, Phase 1에서 예약) | no code analog(설계만 있음) |
| `scripts/rotate-key.ts` | script(utility) | batch | `scripts/account-cli.ts`(CLI 스크립트 shape: 인자 파싱 → repositories/domain 호출 → 로그, `repositories`/`domain`/`db`/`lib` import만 허용되는 `scripts` 계층 규칙) | role-match |
| `db/schema/archive`/soft-delete 컬럼, `db/schema/action-log.ts`, `db/schema/field-definitions.ts` | model(schema) | CRUD | `db/schema/login-attempts.ts`(append-only 로그성 표 + index 컨벤션) | role-match |
| `domain/archive/*.ts`(보관함 판정), `domain/action-log/*.ts`(로그 기록) | domain | event-driven | `domain/auth/accounts.ts`(도메인 함수가 `log.info(...)` 호출하는 선례, `lib/log.ts`) | role-match |
| `eslint/rules/leak-scan-*.mjs` 또는 `test/unit/permissions/leak-scan.generator.test.ts` | test(meta) | transform | `test/unit/eslint-rules/repository-viewer-param.test.ts` + `eslint/rules/repository-viewer-param.mjs`(구조 검사형 커스텀 규칙), `test/unit/ci-guard.test.ts`(파일을 읽어 텍스트/구조 단언하는 메타 테스트 스타일) | exact(구조), 내용은 신규 |
| `app/admin/**`(사람·조직·권한표·정보노출표·설정·코드표·거래처·법인카드 관리 화면) | route | request-response | `app/admin/system-status/page.tsx`(RSC + `getSession()` + `!viewer.isAdmin → notFound()` 게이트) | exact |
| 관리 화면의 Server Actions | action | request-response | `lib/actions/client.ts`의 `authedActionClient`(세션 확인 → `ctx.viewer` 주입), `domain/auth/accounts.ts`의 액션 함수 shape(뷰어 검사 → repositories 호출 → log) | exact |
| 권한표·정보노출표 체크박스 격자 UI | component | event-driven | `ui/` 12종 중 표 격자(체크박스 매트릭스) 전용 컴포넌트 없음 — 가장 가까운 것은 `ui/kv-list`(key-value 나열)와 SYSTEM.md §7-3(표가 화면인 틀, 아직 표 컴포넌트 구현 없음) | no analog(구현) / role-match(markup 계약) |
| 거래처·법인카드·코드표 CRUD 표/폼 | component | CRUD | `ui/input`, `ui/button`, `ui/form-alert`(에러 표시) — Phase 2 산출물 재사용 가능. 표 자체는 §7-3 계약만 있고 구현 없음 | role-match(부분) |
| `test/integration/*` (권한 판정 통합 테스트) | test | request-response | `test/integration/auth.test.ts`, `lockout.test.ts`(viewer 넘겨 도메인 함수 호출 → `expect(...).rejects.toThrow()` 패턴) | exact |

## Pattern Assignments

### 1) 4계층 경계 — `can()`/`visible()`/`scopeFor()`/`project()`는 어느 계층인가

**근거 파일:** `eslint.config.mjs`(Phase 2 PATTERNS.md에 이미 인용된 `boundaries/element-types` 규칙, 원문 재확인 필요 시 `eslint.config.mjs` 직접 Read), `repositories/users.ts` 1-16행, `repositories/login-attempts.ts` 1-9행, `domain/auth/lockout.ts` 전체(4계층 규칙 안에서 순수 판정 함수가 `domain/`에 있는 유일한 현재 선례).

- 현재 `repositories/*.ts`는 이미 `viewer`를 **첫 인자로 받지만 쓰지 않는다** (`void viewer;` — `repositories/users.ts:13,19,29`, `repositories/login-attempts.ts:45,64,73,94`, `repositories/system-status.ts:115,123`). 주석이 명시: "viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다". 즉 **`scopeFor(viewer)`는 `repositories/` 계층 안, 각 리포지토리 함수 내부에서 `where` 절에 적용되는 헬퍼**로 설계돼 있다. `scopeFor` 자체의 판정 로직(어느 role이 어느 행을 볼 수 있는지)은 `domain/permissions/scopeFor.ts` 같은 곳에 두고 `repositories/`가 import해서 쓰는 형태가 `eslint.config.mjs`의 `{ from: "repositories", allow: ["repositories", "db", "domain"] }` 규칙과 맞는다(repositories → domain 허용, 역방향은 금지).
- `can()`/`visible()`은 요청 앞단(액션·페이지 게이트)에서 쓰이므로 `domain/` 안에 두고 `app/`이 호출하는 게 현재 `domain/auth/accounts.ts:21`(`if (!viewer.isAdmin) throw`)·`domain/system-status/index.ts:42`(`if (!viewer.isAdmin)`) 패턴과 일치한다. 다만 지금은 각 domain 함수 안에 `isAdmin` 분기가 **흩어져** 있다(§2 참고) — Phase 3는 이걸 `can(viewer, action)` 단일 함수로 모아야 한다.
- `project(viewer, dto)`도 `domain/`이 출구다: `eslint.config.mjs`의 `{ from: "app", allow: ["app", "domain", "lib"] }` 때문에 `app/`은 `repositories/`를 직접 import할 수 없다(현재도 그렇다 — `app/(app)/admin/system-status/page.tsx`는 `domain/system-status/index.ts`만 부른다, `repositories/system-status.ts`는 domain 안에서만 호출됨, 확인: `grep`으로 `app/` 아래 `from "@/repositories` 매치 없음, 별도 확인 필요하나 boundaries 규칙상 애초에 불가능). 따라서 domain 함수의 반환 타입 자체를 `project()`를 거친 DTO로 강제하면 "행 객체가 app으로 못 나간다"는 타입 강제가 성립한다.
- **확인 필요:** `eslint.config.mjs`의 최신 `boundaries/elements` 목록에 Phase 2가 추가한 `ui` 타입이 실제 반영됐는지는 이번 세션에서 재확인하지 않았다(Phase 2 PATTERNS.md 인용만 사용) — Phase 3 계획 시 파일을 직접 열어 현재 상태를 재확인해야 한다(캐시 프리픽스 규칙상 자주 안 바뀌지만, Phase 2 실행 결과가 실제 반영됐는지는 별도 확인 대상).

### 2) 기존 권한 판정의 현재 모습 — `Viewer`/`SYSTEM_VIEWER`/`isAdmin` 전수

**전수 결과 (grep, `test/e2e` 제외):**
- `domain/viewer.ts:1` — `export type Viewer = { id: string; isAdmin: boolean };` (딱 2 필드)
- `domain/viewer.ts:4` — `export const SYSTEM_VIEWER: Viewer = { id: "system", isAdmin: true };` (CLI·훅·Job 전용 시스템 주체)
- `lib/viewer.ts:11,19,32,36` — `SessionUser`/`SessionUserFields`에 `isAdmin: boolean` 중복 정의, `getSession()`이 `Viewer`로 축약해 반환
- `db/schema/auth.ts:14` — `users.isAdmin` 컬럼, 주석 "Phase 1의 계급은 관리자/직원 둘뿐 — is_admin 하나. Phase 3가 계급 5종으로 교체" (이 페이즈가 명시적으로 교체 대상)
- `domain/auth/accounts.ts:21,69,95` — `if (!viewer.isAdmin) throw new Error(...)` 3곳, 각각 계정 생성/재발급/잠금 해제 권한 검사
- `domain/auth/password.ts:96` — `if (viewer.id !== userId && !viewer.isAdmin)` (본인 또는 관리자)
- `domain/system-status/index.ts:36-42` — 주석 "관리자만 조회 가능" + `if (!viewer.isAdmin) throw`
- `app/(app)/admin/system-status/page.tsx:20` — `if (!session.viewer.isAdmin) notFound()` (V4 ASVS, 직원은 404)
- `ui/shell/role-menu.ts:6,13,71,93` — 유일하게 "컴포넌트 안에 isAdmin 조건문을 두지 않는다"는 원칙을 이미 세워둔 곳. `role-menu.ts`가 `{ isAdmin: boolean }`만 받아 메뉴/탭 목록을 반환하고, Shell 컴포넌트는 그 결과만 렌더한다.
- `scripts/account-cli.ts:68` — CLI 인자 `--admin` → `isAdmin: parsed.admin`
- `lib/auth.ts:30` — better-auth additionalFields에 `isAdmin: { type: "boolean", ... input: false }` (사용자가 직접 못 바꾸는 필드로 등록)

**Phase 3가 흡수·대체해야 할 것:**
- `Viewer` 타입을 `{ id: string; isAdmin: boolean }`에서 `{ id: string; roleId: string; teamId?: string; ... }` 류로 확장하되, `isAdmin` 자체를 지우면 위 7개 파일(`domain/auth/accounts.ts` 3곳, `domain/auth/password.ts` 1곳, `domain/system-status/index.ts` 1곳, `app/.../system-status/page.tsx` 1곳, `ui/shell/role-menu.ts` 4곳)이 전부 깨진다. 가장 안전한 경로는 `can(viewer, "action")`으로 각 분기를 교체하면서 `isAdmin`을 role 파생 값(예: `roleId === "system_admin"`)으로 남기거나, `Viewer`에서 완전히 제거하고 위 파일들을 이 페이즈의 작업 범위에 명시적으로 포함하는 것 — 계획자가 결정할 갈림길(아래 §3 결론 참고).
- `db/schema/auth.ts:14`의 `users.isAdmin` 컬럼은 마이그레이션으로 `role_id` FK 추가 + 데이터 백필 + (즉시 드롭이냐 병행 유지냐) 결정이 필요하다 — Issue 13(필드 타입 변경 금지, 새 필드로) 원칙상 컬럼을 새로 추가하고 구 컬럼은 별도 정리 단계로 미루는 편이 이 페이즈 규약과 일치한다.

### 3) 리포지토리 패턴

**근거:** `repositories/users.ts`, `repositories/login-attempts.ts`, `repositories/system-status.ts` 전체(위에서 전문 인용), `eslint/rules/repository-viewer-param.mjs`(23-54행 — `repositories/**` export 함수의 첫 인자가 리터럴로 `viewer`여야 함을 AST로 강제하는 커스텀 lint 규칙, 이미 존재).

- 현재 모든 리포지토리 함수는 `(viewer: Viewer, ...args)` 시그니처 + `void viewer;`로 시작해 미사용 경고를 죽이고, `db.select()/insert()/update()`로 **전체 컬럼**을 반환한다(`InferSelectModel<typeof users>` 그대로, `repositories/users.ts:7`). 이는 성공 기준 2("repositories는 scopeFor(viewer)로 행만 거르고 전체 컬럼을 반환")와 이미 정확히 같은 모양이며, 딱 하나 빠진 건 `where` 절에 `scopeFor(viewer)` 조건이 없다는 것뿐이다.
- `eslint/rules/repository-viewer-param.mjs`가 이미 "첫 인자 = viewer" 구조를 강제하므로, Phase 3가 할 일은 (a) 각 함수 본문의 `void viewer;`를 `scopeFor(viewer)` 호출로 교체, (b) `domain/` 밖에서 `repositories/`를 못 부르게 하는 것은 이미 `eslint.config.mjs`의 boundaries 규칙이 구조적으로 막고 있다(app→repositories 불허) — 다만 "domain 안에서만 호출"이라는 문구가 의미하는 게 "domain의 특정 서브모듈만"인지 "domain 전체"인지는 현재 boundaries 규칙 단위(`domain` 대 `domain/permissions` 같은 세분화)로는 구분이 안 된다. 세분화가 필요하면 새 lint 규칙이 필요하다 — 계획 갈림길.

### 4) Drizzle 스키마·마이그레이션 관례 + squawk 예외 4건

**근거:** `db/schema/auth.ts`(pgTable 컨벤션, FK `.references(() => users.id, { onDelete: "cascade" })`, `timestamp(...).notNull().defaultNow()`), `db/schema/login-attempts.ts`(함수형 3번째 인자로 index 배열: `(table) => [index("...").on(table.email, table.attemptedAt)]`), `db/schema/index.ts`(`export * from "./auth"; export * from "./login-attempts";` — 파일마다 나누고 `index.ts`가 re-export), `db/migrations/{0000_init,0001_login_attempts,0002_rate_limits_id_column}.sql`(4자리 zero-pad 순번 + snake_case 설명, drizzle-kit 생성), `.squawk.toml`(4개 예외: `require-concurrent-index-creation`, `adding-required-field`, `prefer-timestamp-tz`, `prefer-bigint-over-int` — 각각 트랜잭션 제약/better-auth 어댑터 스키마 검사기 제약/범위 초과 변경/카운터 리셋 특성이 근거).

- Phase 3의 새 표(보관함=soft-delete 컬럼 또는 별도 archive 표, 행동 로그, `field_definitions`, 카운터 표 등)는: (1) `db/schema/새이름.ts` 파일 하나씩 분리 + `db/schema/index.ts`에 `export * from` 추가, (2) `uuid("id").primaryKey().defaultRandom()` 컨벤션(로그성 표는 `login-attempts.ts` 패턴을 그대로 따름, `users` 같은 참조 대상 표는 `text` id — better-auth 어댑터 요구), (3) GIN 인덱스(로드맵이 명시)는 표 생성 마이그레이션에 동봉 — `index(...)` 3번째 인자 함수형 배열에 `.using("gin", table.customFields)` 형태로 추가(Drizzle GIN 문법은 이번 세션에서 실측하지 않음 — **확인 필요**, `node_modules/drizzle-orm/pg-core` 문서 확인 후 계획에 반영).
- `.squawk.toml` 예외 4건은 전부 "better-auth 어댑터 제약" 또는 "트랜잭션 전체 감싸기 제약"에서 나왔다 — Phase 3의 신규 표는 better-auth와 무관하므로 새 예외를 추가할 근거가 약하다. 다만 로그·보관함처럼 대량 데이터가 쌓일 표에 나중에 인덱스를 CONCURRENTLY로 추가하고 싶어질 수 있는데, `assume_in_transaction = true`(drizzle `migrate()`가 파일 전체를 트랜잭션으로 감싸는 실측)가 여전히 걸림돌이다 — 계획 갈림길으로 플래그.

### 5) 설정 레지스트리 — `lib/env.ts`와의 차이

**근거:** `lib/env.ts` 전체(위 인용, 특히 43-163행 — `rawSchema`(zod) + `ENV_KEYS` 상수 배열 + `loadEnv()`가 프로세스 시작 시 1회 파싱해 `export const env`로 고정).

- `lib/env.ts`는 "typed registry"의 절반만 보여준다: zod 스키마로 타입·기본값·검증 로직은 있지만, **"등록됐지만 안 읽히는 키" 검출 메커니즘은 없다.** `ENV_KEYS` 배열은 `process.env`에서 읽어올 키 목록일 뿐, 코드 어딘가에서 `env.XXX`를 실제로 참조하는지 정적 검사하는 로직이 없다(`env.test.ts`도 파싱 성공/실패만 테스트할 뿐 — **확인 필요**, `test/unit/env.test.ts` 내용은 이번 세션에서 열지 않았다).
- 결정적 차이: `lib/env.ts`는 프로세스 시작 시 고정되는 **정적 설정**(재배포 없이 못 바꿈)인 반면, Phase 3의 설정 레지스트리는 **DB 기반 런타임 설정**(관리자가 화면에서 바꾸면 즉시 반영, JSON export/import 가능, 이력형 값 지원)이다. `lib/env.ts`에서 재사용 가능한 건 "키 목록을 배열/객체로 한곳에 선언하고 zod로 파싱"이라는 틀뿐 — 저장소(env var vs DB 표), 캐싱 전략, "미사용 키 검출"(코드베이스를 grep해서 등록된 키가 실제 참조되는지 확인하는 메타 테스트, `test/unit/ci-guard.test.ts` 같은 파일-읽기 메타 테스트 스타일과 유사)은 새로 설계해야 한다.
- 이력형 값(세율·절사 기준일)은 현재 코드베이스에 선례가 없다 — `domain/auth/lockout.ts`가 유일하게 "env를 읽어 순수 함수로 감싼 설정값" 선례이지만 이력(적용 시작일)은 없다. no-analog로 분류.

### 6) 테스트 관례

**근거:** `test/unit/`(29개 파일 나열됨), `test/unit/eslint-rules/{repository-viewer-param,money-boundary,require-action-client}.test.ts` + `eslint/rules/*.mjs`(커스텀 lint 규칙 + 규칙 전용 테스트 페어 — 이미 3쌍 존재), `test/unit/ci-guard.test.ts`(1-60행, 워크플로 YAML을 텍스트로 읽어 `toContain`/`not.toMatch`로 단언하는 메타 테스트), `test/integration/{auth,lockout,rate-limit}.test.ts`(viewer 객체를 직접 만들어 domain 함수 호출 → `rejects.toThrow()` 패턴), `test/e2e/*.spec.ts`(Playwright, `page.getByLabel/getByRole` 선택자 규칙).

- 누수 스캔 테스트 생성기(성공 기준 3)는 **정확히 `eslint/rules/repository-viewer-param.mjs` + `test/unit/eslint-rules/repository-viewer-param.test.ts` 페어의 확장판**이다: 후자는 이미 "구조를 코드로 검사하고 그 검사 자체를 테스트로 증명"하는 메타 테스트 스타일을 갖고 있다. 다만 리크 스캔 생성기는 **입력이 데이터(액션 레지스트리 × 계급, DTO 타입 × 계급, 정보 노출표)**이므로 순수 AST lint 규칙이 아니라 `test/unit/ci-guard.test.ts`처럼 "런타임에 등록 목록을 읽어 `it.each`로 테스트를 동적 생성"하는 형태가 더 가깝다 — 두 선례를 합친 신규 패턴, no-exact-analog.
- 통합 테스트는 `test/integration/auth.test.ts`(`SYSTEM_VIEWER`로 셋업 데이터 생성 → 실제 viewer로 권한 검사)의 셋업 패턴을 그대로 재사용 가능 — Phase 3의 `can()/visible()/scopeFor()` 통합 테스트도 같은 셋업 스타일(관리자 계정으로 데이터 준비 → 대상 role의 viewer로 호출 → 기대 결과 검증)을 따르면 된다.

### 7) UI 재사용

**근거:** `ls ui` 결과 — `auth-frame, banner, button, form-alert, input, kv-list, list-empty, logout, next-turn, page-header, shell, status-tag, toast` (13개 디렉터리). **불일치 아님(2026-09-20 확인):** 컴포넌트는 12개이고 `ui/logout/`은 WR-06 수정으로 들어간 훅 하나(`use-logout.ts`, 컴포넌트 없음)다. Phase 3이 재사용을 셀 때는 컴포넌트 12 + 훅 1로 센다.

- 관리 화면의 **폼**(사람 등록, 거래처/법인카드 CRUD)은 `ui/input`, `ui/button`, `ui/form-alert`를 그대로 재사용할 수 있다 — Phase 2 PATTERNS.md가 이미 이 컴포넌트들의 analog를 `app/(app)/account/change-password-form.tsx`(next-safe-action 훅 배선 + 필드 에러 추출 shape)로 잡아뒀고, 이 shape은 Phase 3의 모든 관리 폼에 그대로 적용된다.
- **권한표·정보 노출표의 체크박스 격자**와 **코드표/거래처 표**는 SYSTEM.md §7-3("표가 화면인 틀")이 계약만 정의하고 구현이 없다(§7-3은 그린 톤온톤·절단 규칙·EMPTY 등 시각 계약은 있지만 실제 React 표 컴포넌트는 `ui/`에 없음 — `ls ui`에 `table`류 디렉터리 부재). 이 페이즈가 §7-3을 처음 구현하는 페이즈가 될 가능성이 높다 — 계획 갈림길(아래 참고).
- `ui/kv-list`는 key-value 나열이지 체크박스 매트릭스가 아니므로 표 대체재로 부적합.

## Shared Patterns

### Viewer 기반 권한 검사 (도메인 함수 진입점)
**Source:** `domain/auth/accounts.ts:21,69,95`, `domain/auth/password.ts:96`, `domain/system-status/index.ts:42` — 전부 "함수 본문 최상단에서 `if (!viewer.xxx) throw new Error(한국어 메시지)`" 동일 형태.
**Apply to:** Phase 3의 모든 `can(viewer, action)` 호출 지점 — 기존 5곳을 `can()`으로 교체하는 리팩터가 이 페이즈의 실질적 마이그레이션 작업이다.

### repositories의 viewer 자리표시 → scopeFor 채우기
**Source:** `repositories/*.ts`의 `void viewer;` **10곳 전부**(2026-09-20 실측): `users.ts:13,19,29` · `health.ts:6` · `system-status.ts:10,18` · `login-attempts.ts:14,33,42,63`. `health.ts`가 빠지기 쉬우니 주의.
**Apply to:** 모든 신규·기존 repositories 함수 — `scopeFor(viewer)`를 만들면 이 10곳부터 먼저 메워야 lint(`repository-viewer-param.mjs`)와 실제 동작이 일치한다.

### 커스텀 lint 규칙 + 규칙 전용 테스트 페어
**Source:** `eslint/index.mjs`(3개 규칙 등록) + `eslint/rules/{require-action-client,repository-viewer-param,money-boundary}.mjs` + `test/unit/eslint-rules/*.test.ts`.
**Apply to:** 누수 스캔 생성기가 순수 AST 검사로 표현 가능한 부분(예: "DTO 타입에 노출표 매핑 주석이 있는가") 및 "domain 안에서만 repositories 호출"을 세분화하고 싶을 때.

### Server Action 진입점 단일화
**Source:** `lib/actions/client.ts`(`authedActionClient`, session 확인 → `ctx.viewer` 주입) — Issue 2 주석("이후 모든 페이즈의 유일한 Server Action 진입점").
**Apply to:** Phase 3의 모든 관리 액션(사람 등록, 권한표 저장, 설정 변경, 거래처 CRUD 등)은 이 `authedActionClient`를 감싸 쓰고, `can(ctx.viewer, action)` 검사를 액션 내부에서 호출.

### RSC 관리자 게이트
**Source:** `app/(app)/admin/system-status/page.tsx:18-20`(`getSession()` → 미인증 redirect → `!isAdmin → notFound()`, `dynamic = "force-dynamic"`).
**Apply to:** 이 페이즈의 모든 `app/admin/**` 페이지 — 다만 `isAdmin` 단일 분기가 아니라 `can(viewer, "admin.access")` 류로 대체해야 5계급 체계와 맞는다.

## No Analog Found

| File/개념 | Role | Data Flow | Reason |
|---|---|---|---|
| `can()`/`visible()`/`scopeFor()`/`project()` 자체의 구현 | domain(policy) | transform | 코드베이스에 권한표·정보노출표 개념이 아직 없다. 가장 가까운 건 하드코딩된 `isAdmin` 분기 5곳뿐 — 이 페이즈가 처음 일반화한다. |
| `lib/crypto.ts`(`encrypt/decrypt`, 키 버전 접두어) | utility | transform | 암호화 헬퍼가 코드베이스에 전혀 없다. `lib/env.ts`에 `APP_DATA_KEY_v1`이 이미 예약돼 있을 뿐. |
| 설정 레지스트리 + "미사용 키 검출" 테스트 | config/test | transform | `lib/env.ts`는 틀만 유사하고 검출 로직·DB 저장·이력형 값이 전부 없다. |
| 누수 스캔 테스트 생성기(동적 `it.each` from 레지스트리) | test(meta) | transform | `ci-guard.test.ts`(정적 파일 읽기)와 `eslint-rules/*.test.ts`(AST 규칙)의 중간 성격 — 직접적 선례 없음. |
| 체크박스 매트릭스 표 컴포넌트(권한표·노출표 UI) | component | event-driven | `ui/` 13종 중 없음, SYSTEM.md §7-3은 계약만 존재. |
| 보관함(soft-delete) 조회·복원 UI/도메인 | domain/component | CRUD | 코드베이스에 삭제·복원 개념 자체가 없다(현재 표는 전부 append-only 또는 hard update). |
| 문서 번호 카운터 표(행 잠금) | model | transform | Phase 4 몫으로 로드맵이 명시(이 페이즈는 카운터 표만 세우고 훅은 Phase 4) — 스키마 규약만 이 페이즈 범위. |

## 계획 갈림길 (사람이 결정해야 함)

1. **`Viewer.isAdmin` 완전 제거 vs 파생 유지** — 제거 시 `domain/auth/accounts.ts`(3곳)·`domain/auth/password.ts`(1곳)·`domain/system-status/index.ts`(1곳)·`app/(app)/admin/system-status/page.tsx`(1곳)·`ui/shell/role-menu.ts`(4곳)를 이 페이즈에서 전부 `can()`으로 교체해야 함. 유지 시 하위호환은 쉽지만 "판정은 세 함수에서만"이라는 성공 기준 2를 어긴다.
2. **`domain/` 세분화(예: `domain/permissions/`만 repositories 호출 허용) 필요 여부** — 현재 `eslint.config.mjs`의 boundaries 규칙은 `domain` 전체 단위이지 하위 폴더 단위가 아니다. "repositories는 domain 안에서만 호출"을 문자 그대로 강제하려면 규칙 세분화(새 lint 규칙 또는 boundaries element 추가)가 필요.
3. **`users.isAdmin` 컬럼 처리** — 새 `role_id` FK를 추가만 하고 구 컬럼을 남길지(마이그레이션 단순, 이중 관리 위험), 이 페이즈에서 드롭까지 할지(Issue 13 "필드 타입 변경 금지, 새 필드로" 원칙과 충돌 여지 검토 필요).
4. **체크박스 매트릭스 표 컴포넌트를 이 페이즈에서 `ui/`에 새로 만들 것인가, 관리 화면 전용 임시 마크업으로 갈 것인가** — SYSTEM.md §7-3이 아직 구현 없는 계약뿐이라 정식 `ui/table` 컴포넌트를 만들면 §7-3을 이 페이즈가 처음 채우는 셈이 되어 범위가 커진다.
5. **설정 레지스트리의 "미사용 키 검출"을 정적 분석(그래프/AST)으로 할지, 런타임 커버리지 계측으로 할지** — `lib/env.ts`에는 이 메커니즘이 전혀 없어 참고할 선례가 없다.
6. **GIN 인덱스를 표 생성 마이그레이션에 동봉하는 구체 Drizzle 문법** — 확인 필요(아래 4항 참고), 계획 전에 `node_modules/drizzle-orm` 문서 실측 필요.
7. **`.squawk.toml` 신규 예외 추가 여부** — Phase 3 표에 CONCURRENTLY 인덱스가 필요해지면 `assume_in_transaction = true`와 정면 충돌 → drizzle 마이그레이션 실행 방식 자체를 바꿀지, 예외 없이 우회할지 결정 필요.

## 확인하지 못한 것 (근거 부족)

- `eslint.config.mjs` 현재 실제 내용은 Phase 2 PATTERNS.md 인용만 사용했고 이번 세션에서 직접 Read하지 않았다 — Phase 2 실행이 실제로 반영됐는지 재확인 필요.
- `test/unit/env.test.ts` 내용을 열지 않아 "미사용 키 검출" 여부를 단정할 수 없다 — 위 §5 결론은 `lib/env.ts` 코드 자체의 구조만 근거로 함.
- ~~`ls ui` 13개 vs "12개" 불일치~~ — **해소(2026-09-20)**: 컴포넌트 12 + `ui/logout/` 훅 1. 불일치가 아니다.
- **`isAdmin` 전수에 테스트가 빠져 있었다(2026-09-20 보강)**: 프로덕션 10개 파일 외에 **테스트 15개 파일**이 `isAdmin`을 참조한다(`test/e2e/*` 11 · `test/integration/*` 3 · `test/unit/*` 2 — `fixtures.ts`의 `createFixtureUser({ isAdmin })`가 진원지다). 계급 모델이 `isAdmin` 불리언을 대체하면 **픽스처 시그니처가 바뀌어 E2E 스펙 전부가 따라 움직인다** — 이 페이즈의 실제 변경 반경은 프로덕션 파일 수만 세면 과소평가된다.
- Drizzle의 GIN 인덱스 생성 문법(`.using("gin", ...)` 등)은 `node_modules/drizzle-orm` 문서를 실측하지 않았다 — Next.js 16 문서 확인 규칙과 별개로, Drizzle 버전 고유 API라 계획 단계에서 별도 확인 필요.

## Metadata

**Analog search scope:** `domain/**`, `repositories/**`, `db/schema/**`, `db/migrations/**`, `lib/**`(env, viewer, actions, auth), `eslint/**`, `test/unit/**`(목록 전체 + ci-guard, eslint-rules 상세), `ui/**`(디렉터리 목록), `.squawk.toml`, `docs/design/SYSTEM.md`(§7-3 관련 라인), `.planning/phases/02-*/02-PATTERNS.md`
**Files scanned:** 약 25개 소스 파일 전문 + 10여 개 디렉터리 목록
**Pattern extraction date:** 2026-09-20
**Tracked-source verification:** 모든 analog 경로는 일반 git 추적 디렉터리(`app/`, `domain/`, `repositories/`, `db/`, `lib/`, `eslint/`, `test/`, `ui/`, `docs/`) 아래 파일이며 `.gsd/` 등 미러 경로 없음.
