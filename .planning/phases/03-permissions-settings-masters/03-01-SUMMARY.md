---
phase: 03-permissions-settings-masters
plan: 01
subsystem: auth
tags: [permissions, rbac, drizzle, postgres, next-safe-action, playwright]

requires:
  - phase: 01-deploy-skeleton-login
    provides: better-auth 세션·additionalFields 규약, authedActionClient, repositories/users.ts의 viewer 첫 인자 패턴
  - phase: 02-design-system-app-shell
    provides: ui/ 12개 컴포넌트(PageHeader·ListEmpty·StatusTag·Button·TextField·FormAlert), SYSTEM.md §6-1/§6-3/§7-1/§7-5/§7-7
provides:
  - "판정 4함수 can()/visible()/scopeFor()/project() — 이후 페이즈 전체가 쓰는 유일한 접근 통제 지점"
  - "계급 5종 스키마(roles) + users.role_id FK + Task 1 결정에 따른 백필"
  - "권한표(permission_matrix)·정보 노출표(visibility_matrix) 스키마 + upsert 리포지토리"
  - "행동 로그(action_log) 기록 API(recordAction) + 핵심 행동 종류 목록"
  - "보관함(domain/archive) — archive()/restore() 단일 진입점 + ARCHIVABLE_TABLES 정본"
  - "코드표 마스터(code_items) + 관리 화면(app/(app)/admin/code-tables) — 이 페이즈의 트레이서 슬라이스"
  - "멱등 시드(domain/seed, scripts/seed-master.ts, pnpm db:seed)"
  - "Server Action 레지스트리(lib/actions/registry.ts) — 03-03 누수 스캔 생성기 입력"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07]

actuals:
  tokens: 39732
  tasks: 3
  commits: 3
plan_head_before: 19747788ef0510507ef94355e33ad45bf6d1815e

tech-stack:
  added: []
  patterns:
    - "domain/permissions/{can,visible,scope-for,project}.ts — deps?: Partial<XDeps> 의존성 주입 패턴(domain/system-status 전례 재사용)"
    - "repositories/*.ts — 조건부 UPDATE(WHERE ... IS NULL/IS NOT NULL)로 archive/restore 멱등·경합 안전 확보"
    - "보관 대상 표 단일 정본(ARCHIVABLE_TABLES) + scopeFor의 엔티티→메뉴 로컬 레지스트리 — 새 마스터 표는 한 줄 추가"
    - "신규 표 FK를 기존 표에 걸 때 NOT VALID(같은 파일) + VALIDATE CONSTRAINT(별도 마이그레이션 파일, 별도 트랜잭션)로 분리 — squawk constraint-missing-not-valid 실측 대응"

key-files:
  created:
    - db/schema/roles.ts
    - db/schema/permissions.ts
    - db/schema/code-tables.ts
    - db/schema/action-log.ts
    - db/migrations/0003_permissions_masters_spine.sql
    - db/migrations/0004_users_role_id_validate.sql
    - domain/permissions/{roles,menus,info-items,can,visible,scope-for,project}.ts
    - domain/action-log/record.ts
    - domain/archive/index.ts
    - domain/code-tables/index.ts
    - domain/seed/index.ts
    - repositories/{roles,permissions,code-tables,action-log,archive}.ts
    - lib/actions/registry.ts
    - scripts/seed-master.ts
    - app/(app)/admin/code-tables/{page.tsx,actions.ts,code-item-form.tsx,code-tables.module.css}
    - test/unit/permissions/{can,visible,scope-for,project}.test.ts
    - test/unit/action-log/record.test.ts
    - test/integration/{roles,code-tables,action-log}.test.ts
    - test/e2e/code-tables.spec.ts
  modified:
    - db/schema/auth.ts
    - db/schema/index.ts
    - domain/viewer.ts
    - domain/auth/accounts.ts
    - lib/auth.ts
    - lib/viewer.ts
    - test/e2e/fixtures.ts
    - test/e2e/global-setup.ts
    - test/integration/setup.ts
    - package.json
    - docs/ARCHITECTURE.md
    - docs/OPERATIONS.md

key-decisions:
  - "Task 1 체크포인트: 계급 5종 식별자·순위 컬럼 없음·is_admin 컬럼 유지·백필 규칙·archived_by FK 없음을 옵션 A(2026-09-20 확정안)대로 기록(03-01-DECISION-TASK1.md)"
  - "users.role_id FK를 0003(NOT VALID)과 0004(VALIDATE CONSTRAINT, 별도 트랜잭션)로 분리 — squawk가 새로 잡아낸 constraint-missing-not-valid/adding-foreign-key-constraint를 .squawk.toml 예외 추가 없이 해결"
  - "action_log.seq를 bigserial 대신 identity 컬럼으로 — squawk prefer-identity 실측"
  - "CODE_ITEM_DTO_SPEC: label만 code_item.label로, 나머지 구조 필드(id·tableKey·sortOrder·active·archivedAt)는 code_item.value로 게이트 — 새 정보 항목을 만들지 않는 판단"
  - "setCodeItemActive는 recordAction을 부르지 않는다 — OPS-05 핵심 행동 종류 목록에 상태 토글에 대응하는 항목이 없다"

requirements-completed: [ADMN-01, ADMN-02, ADMN-08, ADMN-12, MAST-04, OPS-05]

coverage:
  - id: D1
    description: "계급 5종 + 권한표 + 정보 노출표 + 코드표 + 행동 로그 스키마, users.role_id FK와 Task 1 백필 규칙이 실제 로컬 DB에 적용됨"
    requirement: ADMN-08
    verification:
      - kind: integration
        ref: "test/integration/roles.test.ts#시드 5종이 존재한다"
        status: pass
      - kind: integration
        ref: "test/integration/roles.test.ts#마이그레이션 적용 뒤 계급이 비어 있는 사용자 행이 0개다(백필 규칙 재현)"
        status: pass
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 5 files)"
        status: pass
    human_judgment: false
  - id: D2
    description: "can()/visible()/scopeFor()/project() 판정 4함수 — 기본 거부, D-35 완전 독립, 멱등·순서 보존"
    requirement: ADMN-01
    verification:
      - kind: unit
        ref: "test/unit/permissions/can.test.ts"
        status: pass
      - kind: unit
        ref: "test/unit/permissions/visible.test.ts#메뉴×동작 판정 함수(can)를 호출하지 않는다"
        status: pass
      - kind: unit
        ref: "test/unit/permissions/scope-for.test.ts"
        status: pass
      - kind: unit
        ref: "test/unit/permissions/project.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "권한표 체크박스를 켜면 재배포 없이 같은 viewer의 접근 결과가 즉시 바뀐다(성공 기준 2의 기계적 증명)"
    requirement: ADMN-01
    verification:
      - kind: integration
        ref: "test/integration/code-tables.test.ts#권한표에서 기본 계급의 코드표 보기 칸을 켜면 같은 viewer의 목록 조회가 성공한다(재배포 없음)"
        status: pass
    human_judgment: false
  - id: D4
    description: "행동 로그: 핵심 행동만 기록, 끌 수 없는 종류는 설정 조회 실패에도 기록, append-only"
    requirement: OPS-05
    verification:
      - kind: unit
        ref: "test/unit/action-log/record.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/action-log.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "보관함: 시드 계급 보관 거부, 코드표 항목 보관·복원이 멱등"
    requirement: ADMN-12
    verification:
      - kind: integration
        ref: "test/integration/roles.test.ts#시드 계급을 보관하면 거부된다"
        status: pass
      - kind: integration
        ref: "test/integration/code-tables.test.ts#이미 보관된 항목을 다시 보관해도 보관 시각이 최초 값으로 유지된다(멱등)"
        status: pass
    human_judgment: false
  - id: D6
    description: "코드표 관리 화면 — 시스템 관리자는 추가·조회 성공, 기획 PM은 권한표가 메뉴를 안 줘서 404(화면 코드에 계급 이름 분기 없음)"
    requirement: MAST-04
    verification:
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "domain 출구에 리포지토리 행 객체가 없다 — project()를 거친 Dto의 키 집합이 spec 선언 키 집합의 부분집합"
    requirement: ADMN-01
    verification:
      - kind: integration
        ref: "test/integration/code-tables.test.ts#domain 반환 객체의 키 집합이 spec 선언 키 집합의 부분집합이다"
        status: pass
    human_judgment: false

duration: 51min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 1: 권한 판정 4함수·행동 로그·보관함·코드표 트레이서 Summary

**계급 5종 + 권한표/정보 노출표 스키마와 `can()`/`visible()`/`scopeFor()`/`project()` 판정 4함수를 코드표 마스터 한 슬라이스에 스키마→리포지토리→domain→Server Action→화면→행동 로그→보관함까지 실제로 배선하고, 마이그레이션 0003/0004를 로컬 DB에 적용해 통합 20개·E2E 1개로 증명했다.**

## Performance

- **Duration:** 51 min (15:14 ~ 16:05 UTC)
- **Started:** 2026-09-20T15:14:05Z
- **Completed:** 2026-09-20T16:05:07Z
- **Tasks:** 3 (checkpoint 결정 + 트레이서 배선 + 마이그레이션 적용·증명)
- **Files modified:** 53 (커밋 diff 기준)

## Accomplishments

- 신규 표 4개(`roles`·`permission_matrix`·`visibility_matrix`·`code_items`) + `users.role_id` FK + 계급 5종 시드 + 백필 UPDATE를 마이그레이션 0003/0004로 로컬 DB에 적용
- `can(viewer, menu, action)` / `visible(viewer, item)` / `scopeFor(viewer, entity)` / `project(viewer, row, spec)` 판정 4함수 — 기본 거부, `can`↔`visible` 완전 독립(D-35), 서술자 기반 행 필터, 순서 보존·멱등 투영
- 행동 로그(`domain/action-log/record.ts`) — 핵심 행동 종류 17개, 끌 수 없는 3종, `UnknownActionTypeError`로 조용히 삼키지 않음
- 보관함(`domain/archive/index.ts`) — `ARCHIVABLE_TABLES` 단일 정본, 시드 계급 보관 거부, 조건부 UPDATE로 멱등·경합 안전
- 멱등 시드(`domain/seed`, `pnpm db:seed`) — 권한표·노출표·프로젝트 상태 코드표를 `MENUS`/`INFO_ITEMS` 레지스트리에서 파생, 두 번 호출해도 동일
- 코드표 관리 화면(`app/(app)/admin/code-tables`) — §6-1/§6-3 템플릿, 시스템 관리자 성공·기획 PM 404를 E2E로 증명
- 단위 5 · 통합 3(20개 케이스) · E2E 1개 신규, `pnpm test` 세 계층 전부 녹색

## Task Commits

1. **Task 1: 계급·권한 모델의 되돌릴 수 없는 문(체크포인트, 옵션 A 확정)** - `b69333d` (docs)
2. **Task 2: 트레이서 — 스키마부터 화면까지 한 경로로 관통** - `2badaf0` (feat)
3. **Task 3: 마이그레이션 적용 + 통합·E2E 증명** - `6ce4d57` (feat)

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

## Files Created/Modified

주요 파일은 frontmatter `key-files`를 참고. 특히:
- `db/migrations/0003_permissions_masters_spine.sql` / `0004_users_role_id_validate.sql` - 스키마·시드·백필 + FK 2단계 검증
- `domain/permissions/{can,visible,scope-for,project}.ts` - 판정 4함수
- `domain/code-tables/index.ts` - 트레이서 슬라이스의 domain 출구(`CODE_ITEM_DTO_SPEC`)
- `app/(app)/admin/code-tables/*` - 코드표 관리 화면 4파일

## Decisions Made

- Task 1 체크포인트는 사전 확정된 옵션 A(2026-09-20 계획 세션, `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`)를 그대로 기록했다(`03-01-DECISION-TASK1.md`) — 재확인 없이 즉시 Task 2로 진행
- 그 외 결정은 frontmatter `key-decisions` 참고

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `users.role_id` FK를 마이그레이션 0003 하나로 걸 수 없어 0004로 분리**
- **Found during:** Task 3 ③ SQL lint (`pnpm lint:sql`)
- **Issue:** `drizzle-kit generate`가 만든 `ALTER TABLE "users" ADD CONSTRAINT ... FOREIGN KEY` 문이 squawk의 `constraint-missing-not-valid`/`adding-foreign-key-constraint` 경고를 냈다 — `users`는 이 마이그레이션 이전부터 있던 표라(신규 표에 거는 FK와 달리) 기존 행 스캔이 필요하다고 판단된다. `NOT VALID` + `VALIDATE CONSTRAINT`를 같은 파일(=같은 트랜잭션, `assume_in_transaction=true`)에 함께 쓰면 squawk가 "검증 중 모든 읽기가 막힌다"며 또 경고한다. 03-RESEARCH.md의 squawk 실측은 신규 표끼리의 FK만 다뤄 이 케이스를 포함하지 않았다
- **Fix:** 0003은 FK를 `NOT VALID`로만 걸고, `pnpm exec drizzle-kit generate --custom`으로 만든 0004에서 `VALIDATE CONSTRAINT`를 별도 트랜잭션으로 실행한다. `.squawk.toml`에 새 예외를 추가하지 않았다(`git diff .squawk.toml` 비어 있음, acceptance criteria 그대로 충족)
- **Files modified:** `db/migrations/0003_permissions_masters_spine.sql`, `db/migrations/0004_users_role_id_validate.sql`(신규), `db/migrations/meta/_journal.json`, `db/migrations/meta/0003_snapshot.json`, `db/migrations/meta/0004_snapshot.json`
- **Verification:** `pnpm lint:sql` → `Found 0 issues in 5 files`. 적용 뒤 `pg_constraint.convalidated = true` 확인(psql)
- **Committed in:** `6ce4d57`

**2. [Rule 3 - Blocking] `action_log.seq`를 bigserial에서 identity 컬럼으로**
- **Found during:** Task 3 ③ SQL lint
- **Issue:** squawk `prefer-identity` 경고 — bigserial은 시퀀스 소유·권한 관리가 불투명하다
- **Fix:** `db/schema/action-log.ts`의 `seq`를 `bigint(...).primaryKey().generatedByDefaultAsIdentity()`로 변경(마이그레이션 재생성)
- **Files modified:** `db/schema/action-log.ts`(Task 2에서 최초 작성, Task 3에서 수정), 재생성된 `0003_permissions_masters_spine.sql`
- **Verification:** `pnpm lint:sql` 0 issues, `pnpm typecheck`/`pnpm test` 전부 통과
- **Committed in:** `6ce4d57`

**3. [Rule 3 - Blocking] E2E/통합 테스트 인프라에 멱등 시드 호출 추가(플랜에 없던 파일)**
- **Found during:** Task 3 ⑤(통합 테스트 setup), 그리고 그 자매 케이스인 E2E 전역 셋업
- **Issue:** 계획은 `test/integration/setup.ts`에 시드 호출을 추가하라고 명시했지만, `test/e2e/global-setup.ts`는 마이그레이션만 적용하고 시드는 부르지 않았다 — 이 상태로는 E2E 픽스처(시스템 관리자·기획 PM)가 권한표가 비어 모든 메뉴 판정에서 거부돼 `test/e2e/code-tables.spec.ts`가 항상 실패한다
- **Fix:** `test/e2e/global-setup.ts`에 마이그레이션 적용 뒤 `seedMasterData(SYSTEM_VIEWER)` 호출을 추가했다(동적 import로 이 파일이 채운 `DATABASE_URL`을 앱 db 클라이언트 싱글턴이 그대로 읽게 함)
- **Files modified:** `test/e2e/global-setup.ts`
- **Verification:** `pnpm playwright test test/e2e/code-tables.spec.ts test/e2e/login-logout.spec.ts test/e2e/system-status.spec.ts` 전부 통과
- **Committed in:** `6ce4d57`

---

**Total deviations:** 3 auto-fixed (전부 Rule 3 — 계획 실행에 필요한 블로킹 이슈). **Impact:** 셋 다 게이트(`pnpm lint:sql`·`pnpm test`)를 통과시키는 데 필수였고 범위를 벗어나는 기능 추가는 없었다. `.squawk.toml`은 손대지 않았다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 둔 세부 설계 판단들 — 근거와 함께 남긴다.

**1. `CODE_ITEM_DTO_SPEC`의 필드→정보 항목 매핑**
- **열린 지점:** 플랜은 코드표에 정보 항목이 `code_item.value`·`code_item.label` 둘뿐이라고만 했고, DTO 7개 필드(`id`·`tableKey`·`value`·`label`·`sortOrder`·`active`·`archivedAt`) 각각을 어느 정보 항목에 묶을지는 정하지 않았다
- **선택:** `label`만 `code_item.label`로 게이트하고 나머지 구조/식별 필드(`id`·`tableKey`·`value`·`sortOrder`·`active`·`archivedAt`)는 전부 `code_item.value`로 묶었다
- **이유:** `value`를 "이 행이 보이는가"의 기준 정보 항목으로 보고, `label`(사람이 읽는 이름)만 별도로 가릴 수 있게 했다 — 새 정보 항목을 만들지 않고 기존 2개로 충분히 표현된다. 03-03이 정보 항목을 더 세분화하면 이 spec만 갱신하면 된다(구조 변경 없음)

**2. `scopeFor`의 entity→메뉴 매핑 위치**
- **열린 지점:** `scopeFor(viewer, entity)`가 entity 문자열을 어느 메뉴의 보기 권한으로 변환할지 정할 레지스트리가 플랜에 명시되지 않았다
- **선택:** `domain/permissions/scope-for.ts` 안에 로컬 `ENTITY_MENUS` 맵을 두고 `code_items → admin.code-tables` 한 줄만 등록했다. `repositories/archive.ts`의 `ARCHIVABLE_TABLES`(보관 대상 표 정본)와 같은 "단일 정본 + 한 줄 추가" 규약을 따른다
- **이유:** 03-05·03-06·03-07이 새 마스터 표를 더할 때 이 맵에 줄만 추가하면 되고, 별도 파일을 만들 만큼 복잡하지 않다(현재 항목 1개)

**3. `setCodeItemActive`가 `recordAction`을 부르지 않음**
- **열린 지점:** must_haves는 "이미 비활성인 항목의 비활성화 요청은 상태를 바꾸지 않고 로그도 더하지 않는다(멱등)"라고만 했고, "처음 비활성화할 때 로그를 남기는가"는 명시하지 않았다. `CORE_ACTION_TYPES`(OPS-05가 열거한 17종)에는 단순 boolean 토글에 대응하는 종류가 없다
- **선택:** `setCodeItemActive`는 `recordAction`을 전혀 부르지 않는다(성공이든 멱등 스킵이든)
- **이유:** 기존 핵심 행동 종류 중 어느 것도 "상태 토글"의 의미를 정확히 담지 않는다(`document_delete`는 실제 삭제류 문서용, `settings_change`는 설정 레지스트리용). 억지로 기존 종류를 재사용하면 나중에 필터·Excel 내보내기에서 오해를 부른다. 목록에 없는 종류를 새로 추가하는 것은 OPS-05의 "핵심 행동 종류 목록" 정본을 흔드는 결정이라 이 플랜의 판단 범위를 넘는다고 봤다 — 필요해지면 03-05~03-07 중 하나가 종류를 추가해야 한다

**4. `recordAction`의 `isActionTypeEnabled` dep이 없을 때 기본값**
- **열린 지점:** 설정 레지스트리(03-04)가 아직 없어 "어떤 행동을 핵심으로 남길지 설정에서 고른다"(ADMN-10)를 실제로 조회할 수단이 없다
- **선택:** dep이 주어지지 않으면 항상 켬(기록)으로 본다
- **이유:** fail-open이 이 특정 경우엔 안전하다 — "기록 안 함"으로 fail-closed하면 03-04 이전까지 모든 핵심 행동이 조용히 로그에서 빠지는데, 이는 OPS-05·ADMN-10이 요구하는 감사 가능성을 정면으로 해친다. 03-04가 실제 설정 조회 함수를 만들면 그 함수를 dep으로 주입하면 된다(코드 변경 없음)

## Known Stubs

없음 — 이 플랜은 스텁 없이 스키마→화면→로그→보관함까지 실제로 동작하는 경로를 만들었다(트레이서 정의 그대로).

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | PASS | `Found 0 issues in 5 files` — `.squawk.toml` 무변경 |
| `pnpm build` | PASS | `/admin/code-tables` 라우트 포함 12개 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 37 files / 347 tests |
| `pnpm test:integration` | PASS | 11 files / 48 tests(신규 3파일 20케이스 포함) |
| `pnpm test:e2e` | PASS(3회차) | 59 tests. **1·2회차는 `keyboard-nav.spec.ts`의 "비밀번호 변경" 케이스가 2-worker 병렬 실행에서 flaky하게 실패**(폼 네이티브 GET 제출 — React 하이드레이션 타이밍 경합으로 추정). 해당 스펙·관련 파일은 이 플랜에서 한 글자도 건드리지 않았고(`git log` 최종 수정 2026-09-19, diff 0) 단독 실행(`--project` 없이 해당 spec만, 1 worker)에서는 항상 통과해 사전에 존재하던 flake로 판단, 3회차 전체 실행에서 exit 0 확인 |
| `pnpm test`(세 계층 순차) | PASS | 최종 3회차: 347+48+59 전부 통과, exit 0 |

## Issues Encountered

- `test/e2e/keyboard-nav.spec.ts`의 "비밀번호 변경" 케이스가 병렬 E2E 실행에서 간헐적으로 실패한다(위 게이트 결과 참고). 이 플랜이 만든 코드와 무관한 사전 존재 flake로 판단했다 — 고치지 않았다(스코프 밖, Rule 1-3 범위는 "이 태스크의 변경이 직접 유발한 것"만). 재발하면 별도 조사가 필요하다는 점을 여기 남긴다

## User Setup Required

없음 — 로컬 환경 변수·시크릿 추가 없음.

## Next Phase Readiness

- 판정 4함수·행동 로그·보관함·시드·Server Action 레지스트리가 전부 실제 DB 위에서 동작을 증명했다 — 03-02(`isAdmin` 제거 이관)부터 03-07(코드표·거래처 등 마스터 확장)까지 이 경로에 항목만 추가하면 된다
- `Viewer.roleId`는 아직 선택 필드다 — 03-02가 필수로 올리고 `isAdmin` 필드를 삭제하며 "참조 0" 메타 테스트로 전이 창을 닫아야 한다(이 플랜의 `<assumption_delta_decision>`이 명시한 강제 장치)
- `ENTITY_MENUS`(`scope-for.ts`)와 `ARCHIVABLE_TABLES`(`repositories/archive.ts`)에 항목을 추가하는 것만으로 새 마스터 표가 행 필터·보관함을 상속한다 — 03-05·03-06이 이 규약을 따라야 한다
- 알려진 pre-existing E2E flake(`keyboard-nav.spec.ts`) 재발 시 별도 조사 필요

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 29개 핵심 파일(스키마·domain·리포지토리·lib·app·테스트·마이그레이션·결정 기록) 전부 `[ -f ]`로 존재 확인
- 3개 커밋 해시(`b69333d`·`2badaf0`·`6ce4d57`) 전부 `git log --oneline --all`에서 확인
- 모든 acceptance criteria(Task 2·Task 3)와 plan-level `<verification>` 재실행 결과 위 "게이트 결과" 표와 일치
