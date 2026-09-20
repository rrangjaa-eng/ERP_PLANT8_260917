---
phase: 03-permissions-settings-masters
plan: 02
subsystem: auth
tags: [permissions, rbac, migration, drizzle, better-auth, playwright]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project), 계급 5종 시드(SEED_ROLES), users.role_id FK + 백필"
provides:
  - "판정 경로가 정확히 세 함수(can/visible/scopeFor)뿐이다 — 관리자 불리언(isAdmin) 분기가 코드베이스에서 완전히 삭제됐고, test/unit/no-admin-boolean.test.ts가 참조 0을 고정한다"
  - "Viewer 타입의 계급 식별자(roleId)가 필수 키 — 계급 없는 viewer를 실수로 만드는 리터럴은 컴파일되지 않는다"
  - "폰 하단 탭·시스템 상태 진입점이 계급 5종·권한표 기준으로 동작(role-menu.ts + app/(app)/layout.tsx의 allowedMenus 계산)"
  - "계정 CLI(scripts/account-cli.ts)·운영 워크플로(.github/workflows/account.yml)가 --role 계급 인자를 받는다 — --admin 불리언은 삭제"
  - "03-01이 연 Viewer.roleId 전이 창을 닫음 — 이후 페이즈는 isAdmin을 참조할 수 없다(메타 테스트가 회귀를 즉시 잡는다)"
affects: [03-03, 03-04, 03-05, 03-06, 03-07]

actuals:
  tokens: 23071
  tasks: 3
  commits: 3
plan_head_before: 9d1ac03523125c04353e806898ceb2182bd532fe

tech-stack:
  added: []
  patterns:
    - "scripts/account-cli.ts의 ParseArgsDeps — domain/system-status의 StatusDeps·domain/permissions/can의 CanDeps와 같은 deps?: Partial<XDeps> 주입 패턴을 CLI 계층까지 확장. 단위 테스트가 Postgres 없이 findRoleById를 스텁한다"
    - "app/(app)/layout.tsx가 메뉴 레지스트리(MENUS)를 순회해 can()으로 allowedMenus를 미리 계산하고, ui/ 컴포넌트에는 계산된 데이터만 넘긴다(ui는 domain을 import할 수 없다 — D-26 경계 유지)"
    - "test/unit/no-admin-boolean.test.ts — 재귀 파일 스캔 + 문자열 목록 검사로 '금지된 이름의 참조 0'을 고정하는 메타 테스트. ci-guard.test.ts(외부 소스 루프 단언)와 docs-limits.test.ts(파일 읽기 + 토큰 검사) 두 전례를 합친 형태 — 이후 페이즈가 같은 종류의 금지 규약(예: 다른 잔여 컬럼)에 재사용 가능"

key-files:
  created:
    - test/unit/no-admin-boolean.test.ts
  modified:
    - docs/design/SYSTEM.md
    - docs/design/DECISIONS.md
    - test/unit/design-system-docs.test.ts
    - domain/viewer.ts
    - domain/permissions/roles.ts
    - domain/auth/accounts.ts
    - domain/auth/password.ts
    - domain/system-status/index.ts
    - lib/viewer.ts
    - lib/auth.ts
    - scripts/account-cli.ts
    - .github/workflows/account.yml
    - docs/OPERATIONS.md
    - ui/shell/role-menu.ts
    - app/(app)/layout.tsx
    - app/(app)/admin/system-status/page.tsx
    - test/unit/system-status.test.ts
    - test/unit/account-cli.test.ts
    - test/unit/ui/role-menu.test.ts
    - test/unit/deploy/workflows.test.ts
    - test/unit/permissions/can.test.ts
    - test/unit/permissions/project.test.ts
    - test/unit/permissions/scope-for.test.ts
    - test/unit/permissions/visible.test.ts
    - test/unit/action-log/record.test.ts
    - test/e2e/fixtures.ts
    - test/e2e/a11y.spec.ts
    - test/e2e/change-password.spec.ts
    - test/e2e/keyboard-nav.spec.ts
    - test/e2e/login-logout.spec.ts
    - test/e2e/logout-failure.spec.ts
    - test/e2e/mobile-page-chrome.spec.ts
    - test/e2e/mobile-shell.spec.ts
    - test/e2e/page-chrome.spec.ts
    - test/e2e/system-status.spec.ts
    - test/e2e/user-menu.spec.ts
    - test/e2e/code-tables.spec.ts
    - test/integration/auth.test.ts
    - test/integration/lockout.test.ts
    - test/integration/rate-limit.test.ts
    - test/integration/code-tables.test.ts

key-decisions:
  - "Viewer.roleId를 string(비-null)이 아니라 string | null로 승격 — '필수 필드로 올린다'는 지시를 '선택 키(?) 제거'로 해석하고 null 허용은 유지. can()/visible()의 기존 '계급 없음 → 기본 거부' 방어 코드와 그 테스트(noRoleViewer)를 손대지 않고 그대로 살렸다"
  - "scripts/account-cli.ts의 계급 검증을 2단으로 분리 — SEED_ROLES 정적 확인(순수, DB 없음) + findRoleById DB 확인(ParseArgsDeps로 주입 가능). parseArgs를 async로 바꿔 커스텀 계급도 받아들이면서 단위 테스트는 Postgres 없이 doubles로 검증한다"
  - "lib/auth.ts에서 isAdmin additionalField 제거의 되돌림 조건(잔여 컬럼 때문에 better-auth 스키마 검사 실패)은 실측으로 발동하지 않음을 확인 — pnpm test:integration의 auth.test.ts가 그대로 통과했다. lib/auth.ts는 no-admin-boolean 메타 테스트의 예외 목록에 들어가지 않는다"
  - "test/integration/roles.test.ts를 메타 테스트 예외 목록에 추가 — db/schema/auth.ts와 같은 이유(D-37 잔여 컬럼 백필 재현 테스트)로, 판정 코드가 아니라 그 컬럼의 존재·백필 자체를 검증하는 파일이다"

patterns-established:
  - "메타 테스트(참조 0 고정)는 db/** 같은 '의도적으로 남기는 잔여물'과 그 잔여물을 직접 검증하는 테스트 파일 둘 다를 예외로 명시하고, 나머지 전 계층에서 문자열을 재귀 스캔한다 — 이후 다른 폐기 예정 필드에도 같은 골격을 재사용할 수 있다"

requirements-completed: [ADMN-01, ADMN-03]

coverage:
  - id: D1
    description: "판정 경로가 정확히 세 함수뿐이다 — Viewer에서 isAdmin이 삭제되고 코드베이스 전체(도메인·리포지토리·lib·ui·app·스크립트·테스트·eslint)에서 관리자 불리언 참조가 0건임을 메타 테스트가 고정한다"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/no-admin-boolean.test.ts#domain·repositories·lib·ui·app·scripts·test·eslint 아래 isAdmin/is_admin 참조가 0건이다"
        status: pass
      - kind: other
        ref: "pnpm typecheck (Viewer에서 필드 제거 → 남은 호출 지점이 전부 컴파일 오류로 드러남, 0 errors로 수렴)"
        status: pass
    human_judgment: false
  - id: D2
    description: "시스템 상태 화면 접근이 계급 이름이 아니라 권한표(can())를 읽는다 — 기본 계급이라도 권한표 칸이 켜지면 성공, 꺼지면 404"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/system-status.test.ts#권한표에서 시스템 상태 보기 칸이 켜진 기본 계급 viewer는 성공한다"
        status: pass
      - kind: e2e
        ref: "test/e2e/system-status.spec.ts#권한표에 시스템 상태 보기 권한이 없는 계급이 접근하면 404를 받는다"
        status: pass
      - kind: other
        ref: "node -e GATE LINE LOST 스캔(캐시 지시자·세션 리다이렉트·notFound() 3줄 보존 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "폰 하단 탭이 계급 5종별로 SYSTEM.md §6-0 표와 원소 단위로 같고, 모르는 계급은 기본 계급 탭으로 떨어진다(빈 탭 없음). ui/shell/role-menu.ts는 domain을 import하지 않는다"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/ui/role-menu.test.ts#%s(%s) 탭 라벨이 SYSTEM.md 표의 그 행과 원소 단위로 같다 (계급 5종 전부)"
        status: pass
      - kind: unit
        ref: "test/unit/ui/role-menu.test.ts#모르는 계급 식별자는 기본 계급(기획 PM) 탭으로 떨어지고 탭 수가 여전히 4다"
        status: pass
      - kind: other
        ref: "node -e UI BOUNDARY BREACH 스캔(ui/ 아래 domain·repositories·db import 0건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "계정 발급·재발급·잠금 해제 권한이 사람 메뉴(admin.people) 쓰기 칸으로 결정되고, 본인 세션 만료는 권한 없이도 성공하며 남의 세션 만료는 같은 칸이 필요하다"
    requirement: ADMN-01
    verification:
      - kind: integration
        ref: "test/integration/auth.test.ts#사람 메뉴 쓰기 권한이 없는 viewer로 createAccount/resetPassword/unlockAccount를 부르면 throw한다 (3케이스)"
        status: pass
    human_judgment: false
  - id: D5
    description: "계정 CLI가 계급을 --role 인자로 받고, 없으면 기본 계급으로 발급한다 — 관리자 여부를 켜는 불리언 플래그가 없다. 시드가 아닌 값은 DB 확인 후 거부한다(오타 방지)"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/account-cli.test.ts (--role 파싱·기본값·DB 계급 허용·미지 계급 거부 4케이스)"
        status: pass
      - kind: integration
        ref: "test/integration/account-cli.test.ts (실제 프로세스 spawn, exit 0/2)"
        status: pass
      - kind: other
        ref: "수동 스모크: node scripts/account-cli.ts create --role role-team-lead (exit 0) / --role role-does-not-exist (exit 2, 'temp password 없음 확인)"
        status: pass
    human_judgment: false
  - id: D6
    description: "이관 후 전 계층(단위·통합·E2E)이 이관 전과 같은 행동을 증명한다 — 새 기능 0개, package.json diff 없음"
    requirement: ADMN-03
    verification:
      - kind: unit
        ref: "pnpm test:unit — 38 files / 363 tests"
        status: pass
      - kind: integration
        ref: "pnpm test:integration — 11 files / 48 tests"
        status: pass
      - kind: e2e
        ref: "pnpm test:e2e — 59 tests (2회 연속 무-flake)"
        status: pass
    human_judgment: false
  - id: D7
    description: "SYSTEM.md §6-0의 역할별 탭 표가 계급 5종 행으로 바뀌어 Phase 1의 임시 두 행(관리자·직원)이 사라졌고, 그 사실이 DECISIONS.md에 남았다"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts#폰 하단 탭 역할 표에 계급 '%s' 행이 있다 (계급 5종)"
        status: pass
      - kind: other
        ref: "node -e 2026-09-19 COUNT 6 유지 + MISSING 2026-09-20 RECORD 없음 확인"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 2: 관리자 불리언 → 판정 함수 전량 이관 Summary

**`Viewer.isAdmin` 불리언을 03-01의 `can()` 판정 함수로 프로덕션 11파일·테스트 24파일에 걸쳐 전량 교체하고, 계급 식별자를 Viewer의 필수 필드로 승격했으며, 참조 0을 메타 테스트로 고정해 03-01이 연 전이 창을 닫았다 — 새 기능은 0개, `pnpm test` 세 계층이 이관 전과 동일한 행동을 증명한다.**

## Performance

- **Duration:** 약 50분(첫 커밋 16:14 ~ 마지막 커밋 16:48 UTC, 사전 컨텍스트 로딩 포함 추정)
- **Started:** 2026-09-20T16:00Z(추정)
- **Completed:** 2026-09-20T16:51:28Z
- **Tasks:** 3
- **Files modified:** 41 (신규 1 포함)

## Accomplishments

- `domain/viewer.ts`의 `Viewer`에서 `isAdmin: boolean` 삭제, `roleId`를 필수 키(nullable 허용)로 승격 — `SYSTEM_VIEWER`는 계급 식별자만 싣는다
- `lib/viewer.ts`의 `getSession()` — 계급 없는 세션을 기본 계급으로 조용히 승격하지 않고 미인증(`null`)으로 처리 + 경고 로그(fail-closed)
- `domain/auth/{accounts,password}.ts`의 권한 게이트 4곳(계정 생성·재발급·잠금 해제·세션 만료)을 `can(viewer, "admin.people", "write")` 판정으로 교체 — 한국어 오류 메시지·본인 확인 조건은 문자 하나 바꾸지 않았다
- `domain/system-status/index.ts`·`app/(app)/admin/system-status/page.tsx`의 게이트를 `can(viewer, "admin.system-status", "view")`로 교체 — 캐시 지시자·세션 리다이렉트·404 세 줄은 그대로, `StatusDeps.can` 주입 지점으로 단위 테스트가 Postgres 없이 돈다
- `scripts/account-cli.ts`의 `--admin` 불리언 플래그를 `--role` 문자열로 교체 — 시드 계급은 정적 확인, 커스텀 계급은 `findRoleById`로 DB 확인(오타를 조용히 기본 계급으로 만들지 않는다), `.github/workflows/account.yml`·`docs/OPERATIONS.md`가 같은 계약으로 갱신
- `ui/shell/role-menu.ts`를 계급 5종 기준으로 재작성 — `RoleMenuViewer`가 `{ roleId, allowedMenus }`로 바뀌었고 시스템 상태 진입점은 `allowedMenus` 기준(도메인 import 없음, `ui` 경계 유지), 모르는 계급은 기본 계급 탭으로 폴백
- `app/(app)/layout.tsx`가 `MENUS`를 순회해 `can()`으로 `allowedMenus`를 미리 계산해 `roleMenu`에 데이터로 전달
- `docs/design/SYSTEM.md` §6-0 역할별 탭 표를 계급 5종 다섯 행으로 교체(Phase 1 임시 두 행 제거), `DECISIONS.md`에 이탈 기록 추가
- 참조 0을 고정하는 메타 테스트(`test/unit/no-admin-boolean.test.ts`) 신설 — `domain`·`repositories`·`lib`·`ui`·`app`·`scripts`·`test`·`eslint` 아래 `isAdmin`/`is_admin` 참조 0건을 재귀 스캔으로 단언
- 테스트 24개 파일 이관(E2E 10 + 통합 4 + 단위 10) — 픽스처(`createFixtureUser`)가 `roleId` 필수 인자로 확정, 새 케이스 2개(권한표 기준 성공, 모르는 계급 폴백) 추가

## Task Commits

1. **Task 1: SYSTEM.md §6-0의 역할별 탭 표를 계급 5종으로 교체한다** - `7509041` (docs)
2. **Task 2: 관리자 불리언을 판정 함수로 갈아 끼운다 — 프로덕션 11 + 테스트 18을 한 번에** - `dbd80c1` (feat)
3. **Task 3: 참조 0을 테스트로 고정해 전이 창을 닫는다** - `47b4fc7` (test)

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `domain/viewer.ts` - `Viewer` 타입의 필드 승격 지점
- `scripts/account-cli.ts` - `ParseArgsDeps` 주입 패턴을 쓰는 계급 CLI 검증
- `ui/shell/role-menu.ts` - 계급 5종 → 탭 매핑 정본
- `test/unit/no-admin-boolean.test.ts` - 신규, 참조 0 고정 메타 테스트

## Decisions Made

frontmatter `key-decisions` 참고. 요약: `Viewer.roleId`는 `string | null`(필수 키, nullable 허용)로 승격했고, CLI 계급 검증은 정적(SEED_ROLES) + DB(`findRoleById`, 주입 가능) 2단으로 나눠 단위 테스트가 Postgres 없이 돈다. `lib/auth.ts`의 되돌림 조건은 실측으로 발동하지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test/unit/deploy/workflows.test.ts`가 옛 `admin:` 입력을 단언해 `pnpm test:unit`을 막았다**
- **Found during:** Task 2 게이트 실행(`pnpm vitest run --project unit`)
- **Issue:** 이 파일은 계획의 `<files>` 목록에 없었지만 `.github/workflows/account.yml`의 `workflow_dispatch.inputs.admin`을 문자열로 단언하고 있어, `role:`로 바꾸는 순간 실패했다
- **Fix:** 단언을 `admin:` → `role:`로 바꾸고 테스트 이름에 "D-36 이후 role, admin 아님"을 명시
- **Files modified:** `test/unit/deploy/workflows.test.ts`
- **Verification:** `pnpm vitest run --project unit` 전체 통과
- **Committed in:** `dbd80c1`

**2. [Rule 3 - Blocking] `Viewer` 타입 승격으로 계획 밖 테스트 파일 6개가 컴파일 오류를 냈다**
- **Found during:** Task 2, `pnpm typecheck` 중간 검증 지점(①·⑤ 뒤)
- **Issue:** `test/unit/permissions/{can,project,scope-for,visible}.test.ts`·`test/unit/action-log/record.test.ts`·`test/integration/code-tables.test.ts`·`test/e2e/code-tables.spec.ts`가 `isAdmin` 필드를 가진 `Viewer` 리터럴을 갖고 있었다 — 이 파일들은 03-01이 만들었고 계획의 `<files>` 목록에는 없었다
- **Fix:** 각 리터럴에서 `isAdmin: false,` 키만 제거(계급 리터럴 `roleId`는 그대로 두거나 이미 있어 손대지 않음)
- **Files modified:** 위 6개 파일
- **Verification:** `pnpm typecheck` 0 errors
- **Committed in:** `dbd80c1`

**3. [Rule 3 - Blocking] `test/integration/{auth,lockout,rate-limit}.test.ts`의 viewer 리터럴에서 `isAdmin` 제거 시 `roleId`가 함께 사라져 타입 오류가 났다**
- **Found during:** Task 2, `pnpm typecheck`
- **Issue:** `{ id: "emp", isAdmin: false }` 형태의 viewer 리터럴에서 `isAdmin: false`를 기계적으로 지우자 `{ id: "emp" }`만 남아 필수 키 `roleId`가 빠졌다(3곳, auth.test.ts)
- **Fix:** `DEFAULT_ROLE_ID`를 import해 `{ id: "emp", roleId: DEFAULT_ROLE_ID }`로 복원하고, 각 케이스에 "기본 계급에는 사람 메뉴 쓰기 권한이 없다(03-01 시드 값)"는 의존을 주석 한 줄로 명시(계획 지시)
- **Files modified:** `test/integration/auth.test.ts`
- **Verification:** `pnpm typecheck` 0 errors, `pnpm test:integration` 전체 통과
- **Committed in:** `dbd80c1`

**4. [Rule 3 - Blocking] `test/integration/roles.test.ts`가 no-admin-boolean 메타 테스트를 위반했다**
- **Found during:** Task 3
- **Issue:** 이 파일은 마이그레이션 0003의 백필 UPDATE 두 문장을 재현해 검증하는 03-01의 테스트라, `users.isAdmin`(드리즐 필드)을 직접 읽고 쓴다 — Task 3의 명시적 예외 목록(db/**, 자기 자신, eslint 픽스처)에는 없었지만 `db/schema/auth.ts`와 동일한 이유(D-37 잔여 컬럼 검증)로 예외가 필요했다
- **Fix:** 이 파일을 메타 테스트의 `EXCLUDED_FILES`에 추가하고, 소스 코드 주석에 예외 이유(D-37, 판정 코드 아님)를 남겼다. 파일 자체의 내용은 바꾸지 않았다(백필 규칙 재현은 그대로 유효)
- **Files modified:** `test/unit/no-admin-boolean.test.ts`(신규 파일 안에서 처리, 기존 파일은 무변경)
- **Verification:** `test/unit/no-admin-boolean.test.ts` 통과, `test/integration/roles.test.ts`는 무변경 상태로 `pnpm test:integration`도 통과
- **Committed in:** `47b4fc7`

**5. [Rule 1 - Bug/일관성] 주석에 남은 `isAdmin`/`is_admin` 문자열 3곳이 메타 테스트를 위반했다**
- **Found during:** Task 3
- **Issue:** `domain/viewer.ts`·`lib/auth.ts`·`domain/permissions/roles.ts`의 설명 주석이 옛 필드 이름을 그대로 인용하고 있었다 — 계획 지시("주석에라도 이 이름이 남아 있으면 다음 사람이 그 이름을 다시 쓸 근거로 읽는다")에 따라 예외 없이 재작성 대상
- **Fix:** 세 주석을 필드 이름을 인용하지 않는 표현("관리자 여부 불리언", "그 잔여 컬럼")으로 고쳤다 — 의미는 그대로
- **Files modified:** `domain/viewer.ts`, `lib/auth.ts`, `domain/permissions/roles.ts`
- **Verification:** `test/unit/no-admin-boolean.test.ts` 통과
- **Committed in:** `dbd80c1`(viewer.ts·roles.ts는 Task 2 커밋에 포함, lib/auth.ts도 Task 2 커밋에 포함 — 전부 Task 2 diff 범위 안의 파일이라 같은 커밋)

---

**Total deviations:** 5 auto-fixed (4 Rule 3 — 계획 밖 파일의 컴파일/테스트 실패, 1 Rule 1 — 주석 일관성). **Impact:** 전부 계획의 이관 목표("참조 0", "이관 후 동일 행동")를 실제로 달성하는 데 필수였다. 새 기능이나 범위를 벗어나는 변경은 없다 — `git diff package.json`이 비어 있고, 이 플랜의 diff에 새 표·새 마이그레이션·권한 관리 화면이 없다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. `Viewer.roleId`의 타입: `string`이 아니라 `string | null`(필수 키, nullable 허용)**
- **열린 지점:** 플랜은 "계급 식별자를 필수 필드(`roleId: string`)로 올린다"고만 했다 — 이것이 "필수 키"(옵셔널 마커 `?` 제거)를 뜻하는지 "비-null"까지 포함하는지 명시하지 않았다
- **선택:** 키는 필수로 하되 값은 `string | null`을 허용했다
- **이유:** `domain/permissions/{can,visible}.ts`(03-01 산출물, 이 플랜의 `<files>` 밖)가 이미 "계급 식별자가 없으면(undefined 또는 null) 기본 거부"를 판정 로직과 테스트(`noRoleViewer`)로 갖고 있었다. `roleId`를 비-null로 강제하면 이 방어 코드와 테스트가 깨지는데, `can.ts`/`visible.ts`는 이 플랜의 수정 대상이 아니다. `string | null`은 "필수 키로 승격"이라는 지시를 만족하면서 기존 방어 계약을 보존한다. 실제 애플리케이션 경로(`lib/viewer.ts`의 `getSession()`)는 계급이 없으면 세션 자체를 `null`로 돌려 fail-closed하므로, 정상 흐름에서 `Viewer.roleId`가 null인 상태는 만들어지지 않는다

**2. 계정 CLI 계급 검증의 2단 분리(정적 SEED_ROLES + DB `findRoleById`)와 `ParseArgsDeps` 주입**
- **열린 지점:** 플랜은 "시드 5종은 정적으로, 그 밖은 DB에서 확인한다"고 지시했지만, `parseArgs`가 순수 동기 함수였던 기존 구조와 "단위 테스트는 Postgres 없이"라는 다른 페이즈 관례가 충돌했다
- **선택:** `parseArgs`를 async로 바꾸고, DB 확인 함수(`findRoleById`)를 `deps?: Partial<ParseArgsDeps>`로 주입 가능하게 했다(03-01의 `StatusDeps`/`CanDeps`와 같은 결)
- **이유:** 이렇게 하면 (a) 커스텀 계급을 실제로 받아들이는 정확성을 얻고 (b) 단위 테스트가 가짜 `findRoleById`로 두 방향(있음/없음)을 전부 검사할 수 있고 (c) `vi.mock`(이 리포에 선례 1건뿐)보다 기존 관례에 가깝다. 대안(정적 검사만 하고 커스텀 계급은 지원하지 않음)은 ADMN-08("계급 종류 추가")과 충돌해 실제 운영에서 문제가 된다

**3. `main()`의 오류 처리를 단일 try/catch/finally로 통합**
- **열린 지점:** `parseArgs`가 DB에 접근할 수 있게 되면서, 기존의 "usage error는 DB 없이 난다"는 전제가 깨졌다 — `closeDb()`를 어디서 부를지 다시 판단해야 했다
- **선택:** `parseArgs` 호출과 `run()` 호출을 하나의 try 블록에 넣고, `finally`에서 항상 `closeDb()`를 부르며, 오류 타입(`UsageError` → 2, 그 외 → 1)으로 exit code를 정했다
- **이유:** 계급 검증 실패가 DB 커넥션을 연 뒤에 날 수 있으므로, 그 경로에서도 커넥터가 반드시 닫혀야 한다(이 파일 자체의 코멘트가 경고하는 정확히 그 장애 모드 — task-timeout). 기존 "사용법 오류는 exit 2"라는 관례는 오류 타입 분기로 그대로 유지했다

**4. `test/integration/roles.test.ts`를 no-admin-boolean 메타 테스트의 예외로 추가**
- **열린 지점:** Task 3의 예외 목록은 `db/**`·자기 자신·eslint 픽스처만 명시했지만, 03-01이 만든 이 통합 테스트는 마이그레이션 백필을 재현하려고 잔여 컬럼을 직접 다룬다
- **선택:** 이 파일을 예외로 추가하고 이유를 소스 주석에 남겼다(내용은 바꾸지 않음)
- **이유:** `db/schema/auth.ts`가 예외인 이유(D-37 잔여 컬럼의 존재 자체를 표현/검증)와 완전히 같은 논리다. 이 파일을 고쳐 컬럼 참조를 없애면 "백필이 실제로 도는지"를 더는 검증할 수 없다 — 검증 대상을 잃는 것이지 이관이 완성되는 것이 아니다

## Known Stubs

없음 — 이 플랜은 스텁을 만들지 않는다. 이관 대상 코드는 전부 실제로 동작하는 경로였고, 그대로 판정 함수 호출로 교체됐다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | PASS | `Found 0 issues in 5 files` — 새 마이그레이션 없음, `.squawk.toml` 무변경 |
| `pnpm build` | PASS | 13개 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 38 files / 363 tests |
| `pnpm test:integration` | PASS | 11 files / 48 tests |
| `pnpm test:e2e` | PASS | 59 tests, **2회 연속 실행 모두 무-flake**(1.5분씩, `keyboard-nav.spec.ts`의 알려진 사전 flake도 이번엔 재현되지 않았다) |
| `pnpm test`(세 계층 순차) | PASS | exit 0 확인 |
| `node -e` GATE LINE LOST 스캔 | PASS | 캐시 지시자·세션 리다이렉트·`notFound()` 3줄 보존 |
| `node -e` UI BOUNDARY BREACH 스캔 | PASS | `ui/` 아래 domain·repositories·db import 0건 |
| `git diff package.json` | 비어 있음 | 신규 의존성 0 |
| 수동 CLI 스모크 | PASS | `--role role-team-lead` exit 0(계정 생성 확인 후 삭제), `--role role-does-not-exist` exit 2 |

## Issues Encountered

없음 — 이관 대상 파일 수(31개 예상 → 실제 41개, 계획 밖 6개 컴파일 오류 + 테스트 파일 1개 + 주석 3곳)가 계획보다 넓었지만 전부 위 "Deviations" 섹션에서 Rule 1/3로 해소했다. `keyboard-nav.spec.ts`의 03-01이 기록한 사전 존재 flake는 이번 세션의 3회 실행(단위 이후 통합·E2E, 전체 `pnpm test`, 최종 재확인) 어디에서도 재현되지 않았다.

## User Setup Required

없음 — 로컬 환경 변수·시크릿 추가 없음. `.github/workflows/account.yml`의 `admin` 입력이 `role` 입력으로 바뀌었으므로, 다음번 실제 운영 계정 발급 시 워크플로 입력 화면에서 새 필드명을 확인할 것(문서화됨, `docs/OPERATIONS.md`).

## Next Phase Readiness

- 판정 경로가 정확히 세 함수(`can`/`visible`/`scopeFor`)뿐이고, 관리자 불리언은 코드베이스 어디에도 없다 — 참조 0이 테스트로 고정돼 있어 03-03 이후 페이즈가 실수로 되살리면 즉시 CI가 잡는다
- `Viewer.roleId`가 필수 키가 되어, 계급 없는 viewer 리터럴은 컴파일되지 않는다 — 이후 페이즈의 새 테스트·픽스처는 처음부터 계급을 명시해야 한다
- `app/(app)/layout.tsx`의 `allowedMenus` 계산 패턴(메뉴 레지스트리 순회 + `can()`)은 이후 페이즈가 새 메뉴를 추가할 때 `domain/permissions/menus.ts`의 `MENUS` 배열에 항목만 추가하면 자동으로 적용된다 — `role-menu.ts`나 레이아웃을 다시 고칠 필요가 없다
- `users.is_admin` 컬럼은 D-37대로 여전히 DB에 남아 있다(드롭 안 함) — 별도 정리 작업(Squawk `ban-drop-column` 예외 필요)이 여전히 deferred 상태다
- `test/integration/roles.test.ts`는 no-admin-boolean 메타 테스트의 예외로 등록됐다 — 이후 이 파일을 리팩터링할 때 이 예외 등록도 함께 검토할 것

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 16개 핵심 파일(도메인·lib·UI·앱·스크립트·워크플로·문서·신규 메타 테스트) 전부 `[ -f ]`로 존재 확인
- 3개 커밋 해시(`7509041`·`dbd80c1`·`47b4fc7`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 6개 항목(lint·typecheck·build·test 세 계층·no-admin-boolean·db 스키마/squawk 무변경·ui 경계)과 각 태스크의 acceptance criteria를 위 "게이트 결과" 표와 인라인 검증 명령으로 재실행해 일치 확인
