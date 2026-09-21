---
phase: 03-permissions-settings-masters
plan: 03
subsystem: auth
tags: [permissions, rbac, eslint-custom-rule, next-safe-action, playwright, ui-grid]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project), 계급 5종 시드, 코드표 DTO(CodeItemDto/CODE_ITEM_DTO_SPEC), Server Action 레지스트리(ACTION_REGISTRY) — 03-02가 완전히 can()/visible()/scopeFor()로 이관한 판정 경로"
provides:
  - "domain 출구의 DTO 강제 lint 규칙(plant8/no-row-type-escape) — 03-05~03-07이 새 domain 모듈을 만들 때 반환 타입이 *Row로 끝나면 빌드가 즉시 실패한다"
  - "DTO_REGISTRY·registerDto(domain/permissions/dto-registry.ts), EXPORT_REGISTRY·registerExport(lib/actions/registry.ts) — 03-04(설정 JSON, dtoName: null)·03-07(행동 로그, DTO 있음)이 등록만 하면 누수 스캔이 자동으로 검사한다"
  - "누수 스캔 생성기(test/integration/leak-scan.test.ts) — DTO·액션·내보내기 세 축을 프로덕션 레지스트리에서 flatMap으로 생성, 빈 레지스트리 실패, 결정적 순서"
  - "권한표·정보 노출표 관리 화면(app/(app)/admin/permissions, app/(app)/admin/visibility) + 공유 체크박스 격자 컴포넌트(ui/permission-grid/PermissionGrid) — SYSTEM.md §7-13 계약의 실제 구현"
  - "domain/permissions/matrix.ts — 격자 화면의 유일한 domain 진입점(readPermissionGrid/setPermissionCell/readVisibilityGrid/setVisibilityCell), 자기 계급 권한표 쓰기 자기잠금 거부"
  - "action.registry.ts 분리 패턴(server-only 의존 없는 등록 전용 파일) — 03-04 이후 새 Server Action을 등록할 때 이 선례를 따르면 누수 스캔이 Vitest에서 등록을 트리거할 수 있다"
affects: [03-04, 03-05, 03-06, 03-07]

actuals:
  tokens: 22938
  tasks: 3
  commits: 3
plan_head_before: b222923cd50625c23fa4f6b858118aad0a553380

tech-stack:
  added: []
  patterns:
    - "eslint/rules/no-row-type-escape.mjs — money-boundary.mjs 골격 재사용, 심볼 이름 우선 판정(aliasSymbol?.name ?? symbol?.name)으로 typeToString의 구조적 펼침을 피함, Promise<T>·T[]·유니언을 재귀로 벗겨 판정"
    - "actions.registry.ts 분리 — 'use server' 액션 파일(server-only 의존 체인)과 registerAction 등록(순수 메타데이터)을 별도 파일로 나눠 Vitest(node 환경)가 등록만 안전하게 import하게 한다. actions.ts는 그 파일을 side-effect import"
    - "domain/permissions/matrix.ts의 GridDto(roles/columns/values) — 격자 컴포넌트가 받는 계산된 props의 domain 쪽 정본. ui/는 이 DTO의 배열·맵만 받고 판정 함수를 호출하지 않는다(D-26)"
    - "PermissionGridClient<TInput>의 kind 분기 — Server Component에서 Client Component로 일반 클로저(aria-label 계산·액션 입력 조립)를 직접 넘길 수 없어(RSC 직렬화 제약), kind(문자열, 직렬화 가능)만 넘기고 그 분기 로직은 클라이언트 모듈 안에 둔다. Server Action 참조(toggleAction)는 Next.js가 특별히 직렬화하므로 그대로 prop으로 넘긴다"

key-files:
  created:
    - eslint/rules/no-row-type-escape.mjs
    - test/unit/eslint-rules/no-row-type-escape.test.ts
    - test/unit/eslint-rules/fixtures/domain/{dto-return,promise-dto,array-dto,row-direct,row-array,row-promise-direct,row-promise-array,row-union,row-arrow}.ts
    - test/unit/eslint-rules/fixtures/repositories/row-return.ts
    - domain/permissions/dto-registry.ts
    - domain/permissions/matrix.ts
    - test/integration/leak-scan.test.ts
    - test/integration/visibility.test.ts
    - ui/permission-grid/PermissionGrid.tsx
    - ui/permission-grid/PermissionGrid.module.css
    - app/(app)/admin/permissions/{page.tsx,actions.ts,actions.registry.ts,permission-grid-client.tsx}
    - app/(app)/admin/visibility/{page.tsx,actions.ts,actions.registry.ts}
    - app/(app)/admin/code-tables/actions.registry.ts
    - test/e2e/permissions-grid.spec.ts
  modified:
    - docs/design/SYSTEM.md
    - docs/design/DECISIONS.md
    - test/unit/design-system-docs.test.ts
    - eslint/index.mjs
    - eslint.config.mjs
    - lib/actions/registry.ts
    - domain/permissions/info-items.ts
    - domain/permissions/roles.ts
    - domain/code-tables/index.ts
    - app/(app)/admin/code-tables/actions.ts

key-decisions:
  - "no-row-type-escape 판정은 심볼 이름(aliasSymbol?.name ?? symbol?.name)을 typeToString보다 먼저 본다 — 03-RESEARCH.md가 지적한 구조적 펼침 회피 문제를 이 순서로 해소했다"
  - "React experimental_taint 기각을 실행에서 재확인: 새 코드 어디에도 taint API를 쓰지 않았고, 강제는 커스텀 lint 규칙 하나(plant8/no-row-type-escape)로 완결했다"
  - "누수 스캔의 'DTO 축 (계급, 항목) 노출표 조회 가능' 판정은 행 존재가 아니라 visible() 호출이 예외 없이 boolean을 반환하는 것으로 정의했다 — domain/seed는 sysadmin·pm 두 계급만 노출표 행을 시드하므로(SEED_ROLES 나머지 세 계급은 행이 없음), '행 존재'를 요구하면 정상 상태에서도 실패한다. 값의 정합성은 visibility.test.ts가 별도로 증명한다"
  - "권한표·정보 노출표 셀 저장 액션의 roleId 검증은 SEED_ROLES 정적 집합이 아니라 domain/permissions/roles.ts의 roleExists()(DB 확인)를 쓴다 — ADMN-08이 계급을 관리 화면 밖에서도 늘릴 수 있어 시드 집합으로 좁히면 새 계급의 권한을 조정할 수 없게 된다"
  - "PermissionGridClient는 kind: 'permission' | 'visibility' 문자열 하나만 서버에서 받고, aria-label 계산·액션 입력 조립 로직은 클라이언트 모듈 안에서 kind로 분기한다 — 일반 함수는 Server Component→Client Component 경계를 넘을 수 없다(RSC 직렬화 제약, Server Action 참조는 예외)"

requirements-completed: [ADMN-01, ADMN-02, ADMN-03]

coverage:
  - id: D1
    description: "SYSTEM.md §7-13 체크박스 매트릭스 계약 신설 — §7-3과 분리, 다섯 상태·행 단위 전체 선택 없음·토스트 예외를 명시하고 테스트로 고정"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts#'7-13 체크박스 매트릭스' 절이 다섯 상태를 전부 명시한다"
        status: pass
      - kind: other
        ref: "node -e SECTION 7-13 배치·토큰·계급 문장·폰 축소 문장·토스트 예외 스캔"
        status: pass
    human_judgment: false
  - id: D2
    description: "plant8/no-row-type-escape — domain export 함수의 반환 타입에 *Row 타입(Promise·배열·유니언 벗긴 뒤)이 있으면 빌드 실패, 정상 코드엔 침묵"
    requirement: ADMN-03
    verification:
      - kind: unit
        ref: "test/unit/eslint-rules/no-row-type-escape.test.ts (valid 4 · invalid 6 · missing-type-info 2, 총 12케이스)"
        status: pass
      - kind: other
        ref: "eslint 프로브: 정상 코드 EXIT_OK=0, 위반 코드 EXIT_BAD=1(exit 0 아님)"
        status: pass
      - kind: other
        ref: "pnpm lint · pnpm typecheck · pnpm build 전체 통과(기존 domain 코드에서 규칙 미발동)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DTO_REGISTRY·ACTION_REGISTRY·EXPORT_REGISTRY 세 축에서 누수 스캔이 케이스를 생성하고, 빈 레지스트리는 0건 초록으로 통과하지 않으며 순서가 결정적이다"
    requirement: ADMN-03
    verification:
      - kind: integration
        ref: "test/integration/leak-scan.test.ts (DTO 축 35 · 액션 축 10 · 내보내기 축 0(+ 항상-존재 가드 1) + 그 외 가드 4개 = 51개 케이스, 전부 pass)"
        status: pass
      - kind: other
        ref: "node -e DTO_REGISTRY/ACTION_REGISTRY/EXPORT_REGISTRY/it.each 포함 + it.each([ 리터럴 배열 미사용 확인"
        status: pass
    human_judgment: false
  - id: D4
    description: "정보 항목 레지스트리에 ADMN-02가 이름 붙인 6종이 등록되고 기획본부 기본값이 전부 숨김이며, 노출표 변경의 실제 효과(전부/일부 노출·행 없음·같은 항목을 쓰는 DTO 둘)가 증명된다"
    requirement: ADMN-02
    verification:
      - kind: integration
        ref: "test/integration/visibility.test.ts (a)~(d) 네 케이스"
        status: pass
      - kind: other
        ref: "domain/permissions/info-items.ts 9개 항목(03-01의 3개 + 이 플랜의 6개), 신규 6개 staffDefault: false"
        status: pass
    human_judgment: false
  - id: D5
    description: "권한표·정보 노출표 화면에서 체크박스를 누르면 즉시 저장되고(일괄 저장 버튼 없음) 다른 계급의 실제 접근이 바뀐다 — E2E로 증명, §7-13 격자가 §7-3 기계장치를 쓰지 않는다"
    requirement: ADMN-01
    verification:
      - kind: e2e
        ref: "test/e2e/permissions-grid.spec.ts (셀 토글→접근 열림 / 권한 없는 계급 404 / 좌표 3조각 aria-label, 3케이스)"
        status: pass
      - kind: other
        ref: "node -e use client·indeterminate·aria-label·caption 포함 + 일괄 저장 미포함 확인, CSS 색 리터럴 0개·sticky/44 포함 확인"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts (03-01 산출, 회귀 없음 — 두 스펙을 같이 돌려도 상태 격리)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 3: 체크박스 격자 · DTO 출구 lint 강제 · 누수 스캔 생성기 Summary

**권한표·정보 노출표 두 화면을 SYSTEM.md §7-13 신설 계약대로 만들고, `plant8/no-row-type-escape` 커스텀 lint 규칙과 세 레지스트리(DTO·액션·내보내기) 기반 누수 스캔 생성기로 domain 출구의 DTO 강제를 CI에 걸었다 — 권한표 셀 하나를 켜면 저장 버튼 없이 즉시 다른 계급의 실제 접근이 열리는 것을 E2E로 증명했다.**

## Performance

- **Duration:** 약 55분
- **Started:** 2026-09-20T16:55Z(추정)
- **Completed:** 2026-09-20T17:50Z
- **Tasks:** 3
- **Files modified:** 37(커밋 diff 기준, 신규 27 + 수정 10)

## Accomplishments

- `docs/design/SYSTEM.md` §7-13(체크박스 매트릭스) 신설 — §7-3(엑셀식 표)과 분리된 계약, 다섯 상태·행 단위 전체 선택 없음·토스트 예외를 명시하고 `test/unit/design-system-docs.test.ts`로 고정
- `eslint/rules/no-row-type-escape.mjs` — domain export 함수의 반환 타입(Promise·배열·유니언 벗긴 뒤)이 `*Row`로 끝나면 빌드 실패. 심볼 이름 우선 판정으로 타입 별칭의 구조적 펼침을 회피. 규칙 전용 RuleTester 테스트 12케이스(valid 4·invalid 6·설정 오류 2) + eslint 프로브 양방향 확인
- `domain/permissions/dto-registry.ts`(DTO_REGISTRY·registerDto), `lib/actions/registry.ts`에 `EXPORT_REGISTRY`·`registerExport` 추가 — `CodeItemDto`를 `CODE_ITEM_DTO_SPEC`에서 파생 등록(정본 하나)
- `test/integration/leak-scan.test.ts` — DTO·액션·내보내기 세 축을 프로덕션 레지스트리에서 `flatMap`으로 생성(리터럴 배열 없음), 빈 레지스트리 실패 가드, 결정적 순서 단언, `NULL_DTO_EXEMPT_EXPORTS` 검토 목록
- `test/integration/visibility.test.ts` — 노출표 변경의 실제 효과 4케이스(전 필드 수신·일부 차단·행 없는 계급·같은 항목을 쓰는 DTO 둘)
- `domain/permissions/info-items.ts`에 ADMN-02가 이름 붙인 정보 항목 6종 추가(기획본부 기본값 전부 숨김)
- `ui/permission-grid/PermissionGrid.tsx` + `.module.css` — 2단/1단 머리글, 열 전체 선택(indeterminate), 셀 즉시 저장 + 300ms 지연 표시 + 실패 시 낙관적 되돌림·토스트, 폰(<700px) select+KvList 폴백(CSS 미디어 쿼리로만 전환)
- `domain/permissions/matrix.ts` — 격자 domain 진입점(읽기 2·쓰기 2), 쓰기는 `permission_change`를 행동 로그에 기록, 자기 계급 권한표 쓰기 자기잠금 거부
- `app/(app)/admin/permissions`·`app/(app)/admin/visibility` 두 화면 + 공유 클라이언트 래퍼(`permission-grid-client.tsx`) — 같은 배선을 두 번 적지 않는다
- `test/e2e/permissions-grid.spec.ts` — 셀 토글→다른 계급 접근 열림, 권한 없는 계급 404, 좌표 3조각 aria-label 세 케이스
- 신규 의존성 0(`git diff package.json` 비어 있음)

## Task Commits

1. **Task 1: SYSTEM.md §7-13 체크박스 매트릭스 계약을 신설한다(코드보다 먼저)** - `179e7f7` (docs)
2. **Task 2: DTO 출구를 lint로 강제하고 누수 스캔 생성기를 돌린다** - `5952bf9` (feat)
3. **Task 3: 체크박스 격자 컴포넌트와 권한표·노출표 두 화면** - `9ef73e7` (feat)

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `eslint/rules/no-row-type-escape.mjs` - DTO 출구 강제 커스텀 규칙
- `domain/permissions/matrix.ts` - 격자 화면의 유일한 domain 진입점
- `ui/permission-grid/PermissionGrid.tsx` - §7-13 구현체, 권한표·노출표 공유
- `test/integration/leak-scan.test.ts` - 누수 스캔 생성기
- `app/(app)/admin/{permissions,visibility}/actions.registry.ts` - 신규 등록 분리 패턴(아래 배포 이슈 참고)

## Decisions Made

frontmatter `key-decisions` 참고. 요약: no-row-type-escape는 심볼 이름 우선 판정, 누수 스캔의 "조회 가능"은 boolean 반환으로 정의(행 존재 아님), roleId 검증은 DB 확인(시드 집합 고정 안 함), PermissionGridClient는 kind 문자열만 RSC 경계를 넘긴다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `actions.ts`(server-only 의존 체인)를 누수 스캔이 import할 수 없어 등록을 `actions.registry.ts`로 분리**
- **Found during:** Task 2, `test/integration/leak-scan.test.ts` 첫 실행 준비(프로덕션 레지스트리 등록을 트리거하려고 `app/(app)/admin/code-tables/actions.ts`를 직접 import 시도)
- **Issue:** `actions.ts` → `lib/actions/client.ts` → `lib/viewer.ts` → `"server-only"`/`"next/headers"` 의존 체인이라 Vitest(node 환경)에서 import하면 `Cannot find package 'server-only'`로 즉시 실패한다. D-38(순수 런타임 등록)은 "모듈이 로드돼야 등록된다"를 전제하는데, 그 모듈을 테스트가 안전하게 로드할 방법이 없었다 — ACTION_REGISTRY는 사실상 모든 테스트 실행에서 항상 비어 있었다(03-01이 만든 두 액션도 지금까지 한 번도 실제로 등록된 적이 없었다는 뜻)
- **Fix:** `registerAction(...)` 호출을 서버 전용 의존성이 없는 별도 파일(`actions.registry.ts`)로 옮기고, `actions.ts`는 그 파일을 side-effect import한다(`import "./actions.registry"`). 등록 선언은 여전히 파일 하나뿐이다. `app/(app)/admin/code-tables/actions.ts`(03-01 산출, 이 플랜의 `<files>` 밖)도 같은 패턴으로 고쳐 04-01의 실제 등록이 이제서야 처음으로 발동하게 됐다. 이 페이즈의 새 액션 둘(`setPermissionCellAction`·`setVisibilityCellAction`)도 처음부터 이 패턴으로 만들었다
- **Files modified:** `app/(app)/admin/code-tables/actions.ts`(수정), `app/(app)/admin/code-tables/actions.registry.ts`(신규), `app/(app)/admin/permissions/actions.registry.ts`(신규), `app/(app)/admin/visibility/actions.registry.ts`(신규)
- **Verification:** `pnpm build`(Next.js "use server" 컴파일이 side-effect import를 허용함을 확인) · `test/integration/leak-scan.test.ts`의 액션 축 케이스 5개 통과(2개 액션 × 계급 5종에서 실제로 등록된 상태로 검사됨)
- **Committed in:** `5952bf9`

**2. [Rule 1 - Bug] E2E 스펙 두 개가 병렬 워커에서 같은 DB 상태(role-pm의 권한표 행)를 공유해 실행 순서에 따라 서로 깨질 수 있었다**
- **Found during:** Task 3, `pnpm playwright test test/e2e/permissions-grid.spec.ts test/e2e/code-tables.spec.ts` 첫 실행(2 워커 병렬)
- **Issue:** 처음 작성한 `permissions-grid.spec.ts`는 계획 원문대로 "기획 PM(role-pm) × 코드표 보기" 셀을 켜는 시나리오였다. E2E는 전역 setup에서 한 번만 시드되고 스펙 파일 사이에 DB를 초기화하지 않는데, Playwright가 두 스펙 파일을 서로 다른 워커에서 병렬 실행해 `code-tables.spec.ts`의 "기획 PM은 404" 단언이 `permissions-grid.spec.ts`가 그 사이 role-pm의 권한을 켠 상태와 겹쳐 `Expected: 404, Received: 200`으로 실패했다(실측)
- **Fix:** `role-pm`을 직접 건드리지 않고, 테스트 안에서 `insertRole()`로 이 테스트 전용 임시 계급(`role-e2e-perm-{uuid}`)을 만들어 그 계급의 권한만 켜고 그 계급 픽스처로 접근을 확인한다 — 공유 계급 식별자에 의존하지 않아 다른 스펙 파일과 완전히 격리된다. 이 변경으로 roleId 검증(Deviation 없음, 원래 계획된 T-03-17 zod 검증)도 SEED_ROLES 정적 집합이 아니라 DB 확인(`roleExists()`)으로 설계해야 했다(같은 이유 — 임시 계급이 시드 집합에 없다)
- **Files modified:** `test/e2e/permissions-grid.spec.ts`, `app/(app)/admin/permissions/actions.ts`, `app/(app)/admin/visibility/actions.ts`, `domain/permissions/roles.ts`(신규 `roleExists()`)
- **Verification:** `pnpm playwright test test/e2e/permissions-grid.spec.ts test/e2e/code-tables.spec.ts` 2 워커 병렬 실행 5/5 통과(2회 연속 확인), `pnpm test:e2e` 전체 62개 통과
- **Committed in:** `9ef73e7`

**3. [Rule 3 - Blocking] `app`은 `repositories`를 직접 import할 수 없어(boundaries) roleId 검증을 domain 헬퍼로 옮김**
- **Found during:** Task 3, `pnpm lint`(Deviation 2의 수정 직후)
- **Issue:** `app/(app)/admin/{permissions,visibility}/actions.ts`에서 `@/repositories/roles`의 `findRoleById`를 직접 import하니 `boundaries/element-types`가 "app→repositories 정책 없음"으로 거부했다(01-01부터 있던 기존 경계, 이 페이즈가 처음 부딪힘)
- **Fix:** `domain/permissions/roles.ts`에 `roleExists(viewer, roleId, deps?)` 얇은 래퍼를 추가해 `app`은 이 domain 함수만 부른다(`app→domain`은 허용)
- **Files modified:** `domain/permissions/roles.ts`, `app/(app)/admin/permissions/actions.ts`, `app/(app)/admin/visibility/actions.ts`
- **Verification:** `pnpm lint` 0 error
- **Committed in:** `9ef73e7`

---

**Total deviations:** 3 auto-fixed (2 Rule 3 — 계획 실행에 필요한 블로킹 이슈, 1 Rule 1 — 실행 중 실제로 재현된 버그). **Impact:** 셋 다 게이트(`pnpm lint`·`pnpm test`)를 통과시키는 데 필수였다. Deviation 1은 03-01의 액션 레지스트리가 지금까지 한 번도 실제로 검사된 적이 없었다는 사전 존재 결함을 드러내고 고쳤다 — 이 플랜의 범위를 벗어나지 않는다(같은 D-38 등록 메커니즘의 완결). Deviation 2는 이 플랜이 새로 만든 E2E 스펙 자체의 설계를 바로잡은 것이라 범위 안이다. 새 기능이나 범위를 벗어나는 변경은 없다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. 누수 스캔 DTO 축의 "(계급, 항목) 노출표 행이 조회 가능한지"의 정확한 뜻**
- **열린 지점:** 플랜 문구 "조회 가능한지 단언한다"가 "행이 실제로 존재하는지"인지 "쿼리 자체가 예외 없이 도는지"인지 명시하지 않았다
- **선택:** 후자 — `visible(viewer, infoItem)`을 호출해 예외 없이 boolean이 반환되는지만 확인한다
- **이유:** `domain/seed`는 `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID` 두 계급에만 노출표 행을 시드한다(대표·본부 책임자·팀장 세 계급은 행이 아예 없다). "행 존재"를 요구하면 정상 시드 상태에서도 DTO 축 케이스 다수가 실패해, 이 스캔이 등록 완전성이 아니라 시드 완전성을 검사하는 것으로 목적이 바뀐다. 값의 정합성(끄면 실제로 사라지는가)은 `visibility.test.ts`가 별도로 증명하므로 역할이 겹치지 않는다

**2. roleId 검증을 SEED_ROLES가 아니라 DB 확인으로 설계**
- **열린 지점:** 03-RESEARCH.md·PATTERNS.md는 "레지스트리에 등록된 값 집합으로 제한한다"(T-03-17)라고만 했고 계급 레지스트리가 SEED_ROLES(정적)인지 `roles` 표(동적)인지 명시하지 않았다
- **선택:** `roles` 표를 비동기로 확인하는 `roleExists()`
- **이유:** ADMN-08("계급 종류 추가")이 이미 확정 요구사항이고, `repositories/roles.ts`의 `insertRole`이 이미 있다 — 이 페이즈에 추가 화면이 없을 뿐 계급이 늘어나는 것은 이 시스템의 정상 상태다. SEED_ROLES로 좁히면 새로 추가된 계급의 권한을 이 화면에서 영영 조정할 수 없다. `boundaries`가 `app→repositories`를 막아 `domain/permissions/roles.ts`에 얇은 래퍼(`roleExists`)를 둬야 했다(Deviation 3)

**3. PermissionGridClient의 `kind` 문자열 분기 설계**
- **열린 지점:** 플랜은 "클라이언트 래퍼가 onToggle을 격자에 꽂는다"고만 했고, 좌표 aria-label 계산과 액션 입력 조립을 어디서 할지는 정하지 않았다
- **선택:** 이 로직들을 클라이언트 래퍼 모듈 안에 두고, 서버 컴포넌트(`page.tsx`)는 `kind: "permission" | "visibility"`라는 직렬화 가능한 문자열 하나만 넘긴다
- **이유:** Next.js RSC 경계는 일반 클로저를 Server→Client로 넘기는 것을 허용하지 않는다(Server Action 참조만 예외) — `cellAriaLabel`/`buildActionInput`을 `page.tsx`에서 props로 넘기려던 첫 설계는 런타임 직렬화 오류가 났을 것이다(빌드 단계에서는 안 잡히고 실제 렌더 시점에 잡히는 오류라 `pnpm build`만으로는 드러나지 않는다 — E2E로 실제 클릭까지 확인해서 찾았다)

## Known Stubs

없음 — 이 플랜은 스텁 없이 격자 화면이 실제 DB를 읽고 쓰는 경로를 만들었다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | 해당 없음 | 이 플랜은 새 마이그레이션을 만들지 않는다(03-01의 두 판정 표를 그대로 쓴다) |
| `pnpm build` | PASS | `/admin/permissions`·`/admin/visibility` 포함 15개 라우트 정상 생성 |
| eslint 규칙 프로브 | PASS | 정상 코드 `EXIT_OK=0`, 위반 코드 `EXIT_BAD=1` |
| `pnpm test:unit` | PASS | 39 files / 381 tests |
| `pnpm test:integration` | PASS | 13 files / 103 tests(신규 2파일 — leak-scan 51케이스·visibility 4케이스 포함) |
| `pnpm test:e2e` | PASS | 62 tests, 2 워커 병렬. **알려진 사전 flake(`keyboard-nav.spec.ts`)는 이번 실행에서 재현되지 않았다** |
| `pnpm test`(세 계층 순차) | PASS | exit 0 확인(최종 재실행) |
| `git diff package.json` | 비어 있음 | 신규 의존성 0 |

## Issues Encountered

없음(위 Deviations에서 전부 해소). 하나 남긴다: `permissions-grid.spec.ts`와 `code-tables.spec.ts`를 같이 돌릴 때의 워커 수(2)에 따라 race가 재현되는지는 이번 세션 환경(로컬 CPU 코어 수 기준 기본 워커 수)에서만 확인했다 — CI 워커 수가 다르면 다른 race 패턴이 새로 드러날 수 있으나, Deviation 2의 수정(임시 계급으로 완전 격리)은 워커 수·실행 순서와 무관하게 안전하다.

## User Setup Required

없음 — 로컬 환경 변수·시크릿 추가 없음.

## Next Phase Readiness

- domain 출구의 DTO 강제가 lint로 동작하고, 누수 스캔이 세 레지스트리에서 케이스를 생성해 CI에서 돈다 — 03-04(설정 JSON, `dtoName: null` + `NULL_DTO_EXEMPT_EXPORTS`에 `"settings.export"` 추가)·03-05~03-07(새 마스터 DTO·Server Action)이 각자의 `actions.registry.ts`를 만들고 레지스트리에 등록만 하면 검사가 자동으로 따라온다
- `EXPORT_REGISTRY`는 아직 빈 배열이다 — 03-04가 첫 항목(`settings.export`, `dtoName: null`)을 넣을 때 `test/integration/leak-scan.test.ts`의 `NULL_DTO_EXEMPT_EXPORTS` 목록에 그 이름을 추가해야 한다(이미 목록 자체는 존재하고 비어 있지 않다 — `["settings.export"]`로 미리 선언해 뒀다)
- `actions.registry.ts` 분리 패턴(server-only 의존 없는 등록 파일)이 03-01의 코드표 액션까지 소급 적용됐다 — 이후 모든 새 Server Action은 이 패턴을 따라야 누수 스캔이 실제로 그 액션을 검사한다(따르지 않으면 등록이 조용히 누락된다 — D-38이 이미 감수한 구멍이지만, 이 패턴을 안 쓰면 그 구멍이 100%가 된다는 점을 여기 남긴다)
- 권한표·정보 노출표 체크박스 격자가 관리자 운영 콘솔의 핵심 화면으로 실제 동작한다 — Phase 7 전 메뉴 검수가 이 화면 자체를 다시 만들 필요 없이 메뉴·정보 항목 레지스트리에 항목만 늘리면 격자 열이 자동으로 늘어난다

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 22개 핵심 파일(문서·lint 규칙·규칙 테스트·레지스트리·domain·통합 테스트·컴포넌트·화면·E2E) 전부 `[ -f ]`로 존재 확인
- 3개 커밋 해시(`179e7f7`·`5952bf9`·`9ef73e7`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 6개 항목(lint·typecheck·build·규칙 프로브·test 세 계층·`ui/permission-grid/` 경계·`git diff package.json`)과 각 태스크의 acceptance criteria를 재실행해 위 "게이트 결과" 표와 일치 확인. `pnpm test`(세 계층 순차) 최종 재실행 exit 0
