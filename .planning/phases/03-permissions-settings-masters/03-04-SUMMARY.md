---
phase: 03-permissions-settings-masters
plan: 04
subsystem: settings
tags: [settings-registry, zod, drizzle, historized-values, json-export-import, next-safe-action, playwright]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project)·행동 로그(recordAction)·계급 5종, 03-03의 EXPORT_REGISTRY·NULL_DTO_EXEMPT_EXPORTS·actions.registry.ts 분리 패턴·plant8/no-row-type-escape"
provides:
  - "설정 레지스트리(domain/settings/registry.ts) — Phase 4의 domain/money가 부를 getSettingValue(def, {asOf}) 시점 기준 유효값 조회 계약"
  - "settings_simple·settings_historized 두 저장 표(0005 마이그레이션) — 이력형 값은 (key, effective_from) 복합 UNIQUE로 append-only"
  - "domain/settings/keys.ts의 등록 키 18개 — 로그인 잠금 2(지금 읽힘) + 세율·기준일·절사 8·완료 처리 강행 3·손익 착수 1(readBy 표시, Phase 4/6/9가 읽음) + 행동 로그 선택 종류 1"
  - "미사용 키 검출(test/unit/settings/registry-coverage.test.ts) — 소스 검색 + readBy 페이즈의 ROADMAP 실재 검사"
  - "설정 JSON 내보내기·가져오기(domain/settings/export.ts) — 전 항목 선검증, 한 트랜잭션 적용, 멱등"
  - "ui/history-list/HistoryList — 이력형 설정 값과 03-05 발령일 이력이 공유하는 §7-14 구현체"
  - "app/(app)/admin/settings/ — 레지스트리에서 자동 생성되는 설정 화면(화면 코드에 키 문자열 0개)"
affects: [03-05, 03-06, 03-07, phase-4, phase-6, phase-9]

actuals:
  tokens: 40215
  tasks: 3
  commits: 6
plan_head_before: fd7492a3514d8a0e786ca7fa441ff447f4f1f4bf

tech-stack:
  added: []
  patterns:
    - "z.coerce.number() — HTML 폼(문자열 입력)을 서버가 직접 zod로 검증·타입 변환한다. 반올림·범위 검증은 그대로이고 coerce는 타입만 바꾼다"
    - "동적 import로 순환 참조 끊기 — domain/settings/registry.ts가 domain/action-log/record.ts의 recordAction을 정적 import하고, record.ts는 registry.ts의 getSettingValue를 함수 본문 안에서만 동적 import한다(fail-open catch와 짝)"
    - "zod 공개 런타임 속성 판정(schema.type/.options/.element) — 내부 클래스에 의존하지 않고 domain/settings/registry.ts의 describeSettingField가 화면이 쓸 입력 종류를 계산한다"
    - "SettingDef<unknown>[] 정본 배열 — 값 타입이 키마다 다른 이질적 레지스트리를 제네릭 소거로 순회 가능하게 만든다(런타임 동작은 각 def.schema/def.kind가 결정)"

key-files:
  created:
    - db/schema/settings.ts
    - db/migrations/0005_settings_registry.sql
    - domain/settings/registry.ts
    - domain/settings/keys.ts
    - domain/settings/export.ts
    - repositories/settings.ts
    - test/unit/settings/registry.test.ts
    - test/unit/settings/registry-coverage.test.ts
    - test/integration/settings.test.ts
    - test/integration/settings-export.test.ts
    - ui/history-list/{HistoryList.tsx,HistoryList.module.css}
    - app/(app)/admin/settings/{page.tsx,actions.ts,actions.registry.ts,settings-form-client.tsx,settings.module.css}
    - test/e2e/settings.spec.ts
    - .planning/phases/03-permissions-settings-masters/03-04-DECISION-TASK1.md
  modified:
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
    - domain/auth/lockout.ts
    - domain/auth/hooks.ts
    - domain/action-log/record.ts
    - domain/seed/index.ts
    - scripts/seed-master.ts
    - docs/ARCHITECTURE.md
    - docs/design/SYSTEM.md
    - docs/design/DECISIONS.md
    - test/unit/design-system-docs.test.ts
    - test/unit/lockout.test.ts
    - test/integration/lockout.test.ts
    - test/unit/action-log/record.test.ts
    - test/integration/leak-scan.test.ts
    - test/e2e/permissions-grid.spec.ts

key-decisions:
  - "getSettingValue(def, opts?)는 viewer를 받지 않는다 — 읽기는 권한 판정을 거치지 않고 domain 전역에서 자유롭게 쓰이는 계산 입력이다. 게이트는 화면(admin.settings 보기 권한)에 있지 함수 자체에 있지 않다. 쓰기 3함수(setSettingValue·addHistorizedValue·cancelHistorizedValue)만 viewer를 받아 admin.settings 쓰기 권한을 확인한다"
  - "마이그레이션 번호를 계획 문서의 0004에서 0005로 자동 정정했다 — 03-01이 0004_users_role_id_validate.sql을 이미 썼다(prior_waves_context가 사전 경고한 사실)"
  - "domain/action-log/record.ts의 기본 isActionTypeEnabled는 registry.ts를 정적이 아니라 함수 본문 안 동적 import로 부른다 — registry.ts가 record.ts의 recordAction을 정적으로 이미 import하므로 반대 방향 정적 import는 순환이 된다. 조회 실패는 catch해 fail-open(항상 켬)으로 떨어진다"
  - "regsitry.ts에 describeSettingField를 추가해 zod 스키마 → 화면 입력 종류(boolean/number/string/enum/multi-enum) 매핑을 zod 공개 런타임 속성(.type/.options/.element)만으로 판정한다 — 내부 클래스 참조 없이 Zod 4 버전에 덜 취약하다"
  - "action_log.optional_types(끌 수 있는 행동 종류 배열)는 §7-2의 boolean/number/string/enum 다섯 매핑에 없는 값이라 'multi-enum'이라는 여섯 번째 내부 종류를 만들어 체크박스 그룹으로 그렸다 — 계획이 5행 매핑만 명시했지만 이 키의 zod 스키마(z.array(z.enum))가 그 다섯 종류 중 어느 것도 아니라 종류 하나가 추가로 필요했다"
  - "규칙 종류별 적용 기준일(tax.basis_date.*) enum에 4가지 값(payment_date·evidence_date·issue_date·document_date)을 뒀다 — ROADMAP·03-RESEARCH.md는 실제로 쓰일 두 값(지급일·증빙일)만 언급했지만, Phase 4가 실제 규칙을 구현할 때 선택지가 부족해 계획을 다시 열지 않도록 인접한 두 값(발행일·작성일)을 여유로 추가했다. 기본값은 ROADMAP이 지정한 그대로(지급일/증빙일)다"

requirements-completed: [ADMN-05, ADMN-06]

coverage:
  - id: D1
    description: "설정 두 저장 표(settings_simple·settings_historized)와 마이그레이션 0005가 실제 로컬 DB에 적용되고, 락 타임아웃 가드로 pnpm lint:sql이 통과한다"
    requirement: ADMN-05
    verification:
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 6 files), git diff .squawk.toml 비어 있음"
        status: pass
      - kind: integration
        ref: "test/integration/settings.test.ts (경계·중복 거부·기본값 fallback·예외·동시 저장 등 11케이스)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getSettingValue의 시점 기준 유효값 규칙(effective_from <= asOf 최댓값, 경계 포함)과 fail-closed 기본값 규칙이 단위·통합 양쪽에서 증명된다"
    requirement: ADMN-05
    verification:
      - kind: unit
        ref: "test/unit/settings/registry.test.ts (getSettingValue 계열 8케이스, deps 스텁·Postgres 불필요)"
        status: pass
      - kind: integration
        ref: "test/integration/settings.test.ts#경계: 적용 시작일이 조회 기준일과 정확히 같은 행이 유효값이다"
        status: pass
    human_judgment: false
  - id: D3
    description: "등록됐지만 domain/settings/ 밖에서 참조되지 않고 readBy 표시도 없는 키는 검출되어 실패하며, readBy 표시된 키의 페이즈 번호가 ROADMAP에 실재하는지도 검사한다"
    requirement: ADMN-05
    verification:
      - kind: unit
        ref: "test/unit/settings/registry-coverage.test.ts (18케이스 — 파서 자체 검증, 위반 0 단언, readBy 목록 출력, 페이즈 실재 검사 it.each)"
        status: pass
    human_judgment: false
  - id: D4
    description: "설정 JSON 내보내기·가져오기가 (a) 원본과 동일한 상태 복원 (b) 두 번 가져와도 멱등 (c) 한 항목 실패 시 전부 미적용 (d) excel_export 행동 로그 1건을 증명한다"
    requirement: ADMN-06
    verification:
      - kind: integration
        ref: "test/integration/settings-export.test.ts (a)~(d) 4케이스"
        status: pass
    human_judgment: false
  - id: D5
    description: "domain/auth/lockout.ts가 env 대신 설정 레지스트리를 읽고(async·deps 주입), 레지스트리 예외가 잠금 판정을 건너뛰지 않고 전파된다 — 실제 로그인 흐름(before/after 훅)이 그대로 동작한다"
    requirement: ADMN-05
    verification:
      - kind: unit
        ref: "test/unit/lockout.test.ts (스텁 값 그대로 나옴 · 스텁 throw 시 전파, 2케이스)"
        status: pass
      - kind: integration
        ref: "test/integration/lockout.test.ts (A~D 4케이스, 회귀 없음 — 실제 auth.handler 경유)"
        status: pass
    human_judgment: false
  - id: D6
    description: "설정 화면이 레지스트리를 순회해 namespace별 섹션·필드를 자동 생성하고(화면 코드에 키 문자열 0개), 비이력형 값 변경이 저장 버튼 없이 즉시 반영되며 새로고침 뒤에도 남고, 이력형 키의 미래 행에 「예정」 태그가 붙고, 권한 없는 계급은 404를 받는다"
    requirement: ADMN-05
    verification:
      - kind: e2e
        ref: "test/e2e/settings.spec.ts (3케이스, 로컬에서 연속 2회 실행 무회귀 확인)"
        status: pass
      - kind: other
        ref: "node -e HARDCODED SETTING KEY / SCREEN DOES NOT READ REGISTRY 스캔, 두 CSS Module 색 리터럴 0개"
        status: pass
    human_judgment: false
  - id: D7
    description: "SYSTEM.md §7-14 이력 목록 계약이 §7-13 뒤·카피 규칙 앞에 신설되고 다섯 상태를 전부 명시하며, §7-2에 자동 생성 설정 필드 렌더 규칙이 붙는다 — 03-UI-SPEC.md의 유일한 unresolved(설명 문구 규칙)를 해소한다"
    requirement: ADMN-05
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (sectionBounds §7-14 항목, 다섯 상태 포함 검사)"
        status: pass
      - kind: other
        ref: "node -e SECTION 7-14 NOT PLACED BEFORE SECTION 8 / 다섯 상태·「적용 중」·「예정」·「해당 없음」 스캔"
        status: pass
    human_judgment: false

duration: 약 2시간 30분
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 4: 설정 레지스트리 · 이력형 값 · JSON 내보내기·가져오기 Summary

**설정 두 표(비이력형·이력형)와 Phase 4가 호출할 `getSettingValue(def, {asOf})` 시점 기준 유효값 조회 계약을 확정하고, ROADMAP이 열거한 키 18개를 등록해 미사용 키 검출·JSON 내보내기/가져오기·자동 생성 설정 화면까지 실제 DB 위에서 동작을 증명했다.**

## Performance

- **Duration:** 약 2시간 30분
- **Tasks:** 3 (체크포인트 결정 + 레지스트리·마이그레이션·미사용 키 검출·내보내기 + SYSTEM.md §7-14·이력 목록 컴포넌트·자동 생성 화면)
- **Files modified:** 36 (커밋 diff 기준, 신규 20 + 수정 16)

## Accomplishments

- `db/schema/settings.ts` + 마이그레이션 `0005_settings_registry.sql` — `settings_simple`(key PK, upsert) · `settings_historized`((key, effective_from) 복합 UNIQUE) 두 표, 락 타임아웃 가드로 `pnpm lint:sql` `Found 0 issues`
- `domain/settings/registry.ts` — Task 1이 확정한 조회 계약(`getSettingValue(def, opts?)`, 경계 포함 `effective_from <= asOf`, fail-closed 기본값)과 쓰기 3함수(`setSettingValue`·`addHistorizedValue`·`cancelHistorizedValue`, 미래 전용 취소). 반올림·절사를 하지 않는다
- `domain/settings/keys.ts` — ROADMAP 성공 기준 4가 열거한 키 18개 전부 등록(로그인 잠금 2 · 행동 로그 선택 종류 1 · 세율·기준일·절사 8 · 완료 처리 강행 3 · 손익 착수 1), 세율·기준일·절사·강행·손익 키에 `readBy` 표시
- `test/unit/settings/registry-coverage.test.ts` — 미사용 키 검출(소스 검색) + `readBy` 페이즈의 ROADMAP 실재 검사, 표시 목록 콘솔 출력
- `domain/settings/export.ts` — JSON 내보내기(`excel_export` 행동 로그) · 가져오기(전 항목 선검증 → 한 트랜잭션 적용, 멱등)
- `domain/auth/lockout.ts`가 env 동기 조회에서 설정 레지스트리 async 조회(deps 주입형)로 전환, `domain/auth/hooks.ts` 두 호출이 `await`
- `domain/action-log/record.ts`의 기본 `isActionTypeEnabled`가 `action_log.optional_types` 설정을 실제로 읽는다(동적 import로 순환 회피, 조회 실패는 fail-open)
- `domain/seed`가 등록 키의 `default`를 멱등 시드(이력형은 2000-01-01 고정 과거 행) — 설정 화면의 EMPTY 상태가 성립하지 않는다
- `docs/design/SYSTEM.md` §7-14(이력 목록) 신설 + §7-2에 자동 생성 설정 필드 렌더 규칙 추가 — 03-UI-SPEC.md의 유일한 unresolved(설명 문구 규칙)를 해소
- `ui/history-list/HistoryList` — §7-14 구현체, 설정 전용 낱말 없이 03-05가 재사용 가능
- `app/(app)/admin/settings/` — 레지스트리에서 자동 생성되는 설정 화면(화면 코드에 키 문자열 0개), 액션 넷이 각각 `actions.registry.ts`로 등록, 내보내기는 `EXPORT_REGISTRY`에도 `dtoName: null`로 등록
- 신규 의존성 0(`git diff package.json` 비어 있음)

## Task Commits

1. **Task 1: Phase 4가 물려받을 설정 조회 계약(체크포인트, 옵션 A 확정)** - `b84acda` (docs)
2. **Task 2: 설정 레지스트리 · 두 저장 표 · 미사용 키 검출 · JSON 내보내기** - `1749f43` (test) → `c816e85` (feat)
3. **Task 3: §7-14 이력 목록 계약과 자동 생성 설정 화면** - `700ec32` (docs) → `c278705` (feat)

중간에 pre-existing E2E 비멱등성을 고친 별도 커밋이 하나 있다: `eccc349` (fix) — 아래 Deviations 참고.

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `domain/settings/registry.ts` - 조회·쓰기 계약의 정본
- `domain/settings/keys.ts` - 등록 키 18개의 정본
- `repositories/settings.ts` - 두 표 CRUD + 트랜잭션 가져오기 적용
- `ui/history-list/HistoryList.tsx` - §7-14 구현체(03-05 재사용 대상)
- `app/(app)/admin/settings/` - 자동 생성 설정 화면 5파일

## Decisions Made

frontmatter `key-decisions` 참고. 요약: `getSettingValue`는 viewer 없이 읽고 쓰기 3함수만 권한을 확인한다. 마이그레이션은 0004가 이미 쓰여 있어 0005로 정정했다. `record.ts`↔`registry.ts` 순환은 동적 import로 끊었다. zod 스키마 → 입력 종류 판정은 공개 런타임 속성만 쓴다. `action_log.optional_types`를 위해 "multi-enum" 여섯 번째 입력 종류를 추가했다. 세율 기준일 enum에 여유 값 2개를 더했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 마이그레이션 번호를 0004에서 0005로 정정**
- **Found during:** Task 2 ① 마이그레이션 생성
- **Issue:** 계획 문서(작성 시점 기준)는 `db/migrations/0004_settings_registry.sql`을 지시했지만, 03-01이 이미 `0004_users_role_id_validate.sql`을 만들어 놨다(dispatch 프롬프트의 `prior_waves_context`가 사전 경고한 사실)
- **Fix:** `pnpm db:generate`가 실제로 다음 번호(0005)를 생성한 것을 그대로 쓰고, 생성된 파일 이름(`0005_overjoyed_natasha_romanoff.sql`)을 관례대로 `0005_settings_registry.sql`로 바꾸고 `meta/_journal.json`의 tag를 맞췄다
- **Files modified:** `db/migrations/0005_settings_registry.sql`(신규), `db/migrations/meta/_journal.json`
- **Verification:** `pnpm lint:sql` → `Found 0 issues in 6 files`, `node -e` 저널 태그 일치 검사 통과
- **Committed in:** `c816e85`

**2. [Rule 3 - Blocking] `domain/action-log/record.ts`의 새 기본 동작이 실제 DB를 열 위험을 test/unit/action-log/record.test.ts에서 차단**
- **Found during:** Task 2, `recordAction`의 기본 `isActionTypeEnabled`를 실제 설정 레지스트리 조회로 바꾼 직후
- **Issue:** 이 파일은 계획의 `<files>` 목록에 없었지만, 03-01이 만든 기존 테스트 케이스(같은 종류·같은 대상 두 번 호출) 하나가 `isActionTypeEnabled`를 생략하고 부른다 — 바뀐 기본 동작이 그 자리에서 실제 Postgres 연결을 시도하면 `pnpm test:unit`이 도는 quality CI job(Postgres 없음, `.github/workflows/ci.yml` 실측)에서 불안정한 네트워크 예외에 의존하게 된다(fail-open catch가 결국 통과시키긴 하지만 실제 DB 호출 시도 자체가 단위 테스트의 격리 원칙을 어긴다)
- **Fix:** 그 케이스에 `isActionTypeEnabled: () => Promise.resolve(true)`를 명시 스텁으로 추가해 실제 DB 접근 가능성을 제거했다
- **Files modified:** `test/unit/action-log/record.test.ts`
- **Verification:** `pnpm test:unit` 41 files / 422 tests 통과(DB 없이)
- **Committed in:** `1749f43`

**3. [Rule 2 - Missing Critical] `test/integration/leak-scan.test.ts`에 설정 액션 레지스트리 등록 트리거 추가**
- **Found during:** Task 3, dispatch 프롬프트의 `<this_plan_notes>` 항목 1(명시적 지시)
- **Issue:** `EXPORT_REGISTRY`·설정 3액션이 `app/(app)/admin/settings/actions.registry.ts`에 등록되더라도, 누수 스캔 테스트가 그 파일을 실제로 import(side-effect)하지 않으면 등록이 런타임에 전혀 트리거되지 않아 `NULL_DTO_EXEMPT_EXPORTS`에 `"settings.export"`가 미리 선언돼 있어도 실제로 검사되는 항목이 0개로 남는다(03-03 SUMMARY가 이미 이 필요성을 "Next Phase Readiness"에 남겨 뒀다)
- **Fix:** `import "@/app/(app)/admin/settings/actions.registry";`를 leak-scan.test.ts에 추가
- **Files modified:** `test/integration/leak-scan.test.ts`
- **Verification:** `pnpm vitest run --project integration test/integration/leak-scan.test.ts` 76 tests 통과(액션·내보내기 축에 설정 케이스 포함 확인)
- **Committed in:** `c278705`

**4. [Rule 3 - Blocking] `scripts/seed-master.ts`의 로그 줄에 새 `settings` 카운트 추가**
- **Found during:** Task 2, `SeedResult`에 `settings` 필드를 추가한 직후
- **Issue:** 이 스크립트는 `<files>` 목록에 없었지만 `SeedResult` 타입에 새 필드를 추가하면서 기존 콘솔 로그 줄이 그 필드를 누락해 운영자가 시드 결과를 온전히 볼 수 없게 된다
- **Fix:** 로그 템플릿 문자열에 `settings=${result.settings}` 추가
- **Files modified:** `scripts/seed-master.ts`
- **Verification:** `pnpm db:seed` 실제 실행 출력에 `settings=18`(최초) → `settings=0`(재실행, 멱등) 확인
- **Committed in:** `c816e85`

### 별도 커밋으로 처리한 사전 존재 결함 (deviation이 아니라 fix 커밋)

**5. [Rule 1 - Bug, pre-existing] `test/e2e/permissions-grid.spec.ts` 첫 테스트가 임시 계급을 보관 처리하지 않아 로컬 반복 실행이 멱등하지 않았다**
- **Found during:** dispatch 프롬프트의 `<this_plan_notes>` 항목 3(명시적 사전 경고) — 실제로 재현하지는 않았고(첫 실행에서만 필요) 경고대로 코드를 읽어 확인
- **Issue:** 그 테스트가 정적 이름 `"E2E 임시 계급"`으로 계급을 만들고 `finally`에서 보관 처리하지 않는다(같은 파일의 세 번째 테스트는 이미 보관 처리를 한다) — 마이그레이션 재실행 없이 로컬 E2E를 두 번 돌리면 `roles_name_unique`가 충돌한다
- **Fix:** 이름에 UUID 접미사를 붙이고 `finally`에서 `setRoleArchived`로 보관 처리했다(공유 계급인 `role-pm` 등은 건드리지 않았다)
- **Files modified:** `test/e2e/permissions-grid.spec.ts`
- **Verification:** `pnpm playwright test test/e2e/permissions-grid.spec.ts`를 로컬에서 연속 두 번 실행해 둘 다 4/4 통과 확인(수정 전이었다면 두 번째 실행에서 계급 생성이 실패했을 것)
- **Committed in:** `eccc349`

---

**Total deviations:** 4 auto-fixed (2 Rule 3 — 계획 실행에 필요한 블로킹 이슈, 1 Rule 2 — 누수 스캔이 실제로 새 등록을 검사하게 하는 누락 보강, 1 Rule 3 — 운영 가시성 보강) + 1 pre-existing bug fixed in a separate commit (Rule 1, dispatch prompt 사전 경고). **Impact:** 전부 게이트(`pnpm lint:sql`·`pnpm test`)를 통과시키거나 이 플랜이 명시적으로 요구한 계약(누수 스캔이 실제로 settings.export를 검사)을 충족하는 데 필수였다. 새 기능이나 범위를 벗어나는 변경은 없다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. `getSettingValue`가 viewer를 받지 않는 것으로 확정**
- **열린 지점:** Task 1 결정문은 "`getSettingValue(def, opts?)`"라고만 적었고 viewer 인자 유무를 명시하지 않았다. 다른 domain 함수는 전부 viewer를 첫 인자로 받는 관례(레포지토리 계층의 `plant8/repository-viewer-param` 린트)가 있어 혼동의 여지가 있었다
- **선택:** 읽기(`getSettingValue`)는 viewer를 받지 않고 내부에서 리포지토리를 호출할 때만 `SYSTEM_VIEWER`를 쓴다. 쓰기 3함수만 viewer를 받아 권한을 확인한다
- **이유:** 03-RESEARCH.md §5의 스케치(`getSettingValue<T>(key, opts?)`, Task 1이 key를 def로만 바꿨다)에도 viewer가 없었고, Phase 4의 금액 모듈이 세율을 조회할 때마다 admin.settings 보기 권한이 있는 viewer를 확보해야 한다면 설정 조회가 사실상 모든 도메인 함수에 viewer 전파를 강제하는 부담이 된다. 화면 접근은 이미 `page.tsx`의 `can(viewer, "admin.settings", "view")` 게이트가 담당하므로 읽기 함수 자체에 중복 게이트를 두지 않았다

**2. 세율 적용 기준일(`tax.basis_date.*`) enum에 실제 필요한 두 값 외에 두 값을 더 뒀다**
- **열린 지점:** ROADMAP·03-RESEARCH.md가 언급한 값은 "지급일(미지급이면 지급 예정일)"과 "증빙일(없으면 작성일)" 둘뿐이고, 대체 규칙(미지급 시 예정일로 넘어가는 것)은 이 설정이 담는 것이 아니라 Phase 4의 구현 몫이라고 명시했다
- **선택:** enum 값을 `payment_date | evidence_date | issue_date | document_date` 네 개로 뒀다(기본값은 지정된 그대로 payment_date/evidence_date)
- **이유:** 이 값 자체가 "어느 날짜 필드를 기준으로 삼는지"의 선택지이고, Phase 4가 실제 규칙을 구현하다가 인접한 개념(발행일·작성일)이 필요해지면 이 페이즈로 다시 돌아와 enum을 넓혀야 한다 — 그 재작업 비용이 지금 두 값을 더 넣는 비용보다 크다고 판단했다. 기본값·핵심 의미는 ROADMAP이 지정한 대로 손대지 않았다

**3. `action_log.optional_types`를 위한 여섯 번째 입력 종류("multi-enum") 신설**
- **열린 지점:** SYSTEM.md §7-2 자동 생성 설정 화면 필드 렌더 규칙은 boolean·number·string·enum·이력형 다섯 가지만 매핑했다. 이 키의 zod 스키마(`z.array(z.enum(...))`)는 그 다섯 중 어느 것도 아니다
- **선택:** `describeSettingField`에 `multi-enum`(배열+enum 원소) 판정을 추가하고 화면에서 체크박스 그룹으로 그렸다
- **이유:** 이 키를 등록에서 빼면 ADMN-10("어떤 행동을 핵심으로 남길지 설정에서 고른다")이 성립하지 않고, 계획이 정한 5행 매핑에 억지로 끼워 맞추면(예: 콤마 구분 문자열) 검증·표시가 모두 왜곡된다. 여섯 번째 종류를 추가하는 것이 더 정직한 표현이라고 판단했다

**4. `domain/action-log/record.ts`의 순환 참조를 정적 import가 아니라 함수 본문 안 동적 import로 끊음**
- **열린 지점:** 계획은 "record.ts가 이 키를 읽어 걸러낸다"고만 했고 순환 참조 자체를 언급하지 않았다 — `registry.ts`(쓰기 3함수)가 `recordAction`을 이미 정적으로 import하므로 `record.ts`가 `registry.ts`의 `getSettingValue`를 다시 정적으로 import하면 두 모듈이 서로를 참조하는 순환이 생긴다
- **선택:** `record.ts`의 기본 `isActionTypeEnabled` 구현부(함수 본문 안, 호출 시점)에서만 `await import("@/domain/settings/registry")`를 쓴다
- **이유:** ESM 순환 참조는 사용이 모듈 최상위 실행이 아니라 함수 호출 시점으로 미뤄지면 안전하지만, 정적 import를 그대로 두면 번들러·테스트 러너에 따라 미묘하게 깨질 수 있다(로드 순서 의존). 동적 import는 이 초기화-후-사용 경계를 명시적으로 만든다 — 실측: `pnpm test`(단위·통합·E2E 전부)와 `pnpm build`가 이 형태로 전부 통과했다

## Known Stubs

없음. 설정 JSON **가져오기 화면**(파일 업로드 UI)은 이 플랜이 의도적으로 만들지 않았다 — 계획 원문이 "이 페이즈의 화면 범위 밖"이라고 이미 명시했고(가져오기는 `domain/settings/export.ts`의 `importSettings`와 통합 테스트로만 제공), 화면의 내보내기 버튼 옆에 그 사실을 한 줄로 밝혀 빈 화면 자리를 만들지 않았다 — 스텁이 아니라 계획이 정한 경계다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | PASS | `Found 0 issues in 6 files` — `.squawk.toml` 무변경 |
| `pnpm build` | PASS | `/admin/settings` 포함 16개 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 41 files / 422 tests(신규 2파일 — registry 25케이스·registry-coverage 18케이스 포함, DB 없이 통과) |
| `pnpm test:integration` | PASS | 15 files / 143 tests(신규 2파일 — settings 11케이스·settings-export 4케이스, leak-scan 76케이스로 확장) |
| `pnpm test:e2e` | PASS | 66 tests, 로컬에서 연속 2회 실행 모두 무-flake(`keyboard-nav.spec.ts` 사전 flake도 이번엔 재현되지 않았다) |
| `pnpm test`(세 계층 순차) | PASS | 422 + 143 + 66, 최종 재실행 exit 0 |
| `git diff package.json` | 비어 있음 | 신규 의존성 0 |
| `git diff .squawk.toml` | 비어 있음 | 새 예외 추가 없음 |
| CSS 색 리터럴 스캔 | 0건 | `HistoryList.module.css`·`settings.module.css` |
| 설정 키 하드코딩 스캔 | 0건 | `page.tsx`·`settings-form-client.tsx` node -e 스캔 |
| SYSTEM.md §7-14 배치·다섯 상태 스캔 | ok | node -e 통과 |

## Issues Encountered

없음(위 Deviations에서 전부 해소). Playwright 브라우저는 이 세션에서 CDN 접근이 막혀 있었지만(`cdn.playwright.dev` 403), `CLAUDE_CODE_REMOTE=true` 환경에서 `playwright.config.ts`가 이미 처리해 둔 사전 설치 Chromium 경로(`/opt/pw-browsers/chromium`)로 자동 폴백해 실제 E2E를 문제없이 실행했다 — 별도 조치 불필요.

## User Setup Required

없음 — 로컬 환경 변수·시크릿 추가 없음.

## Next Phase Readiness

- Phase 4의 `domain/money`가 `tax.vat.rate`·`tax.withholding.*`·`tax.company_borne.*`·`tax.basis_date.*`·`tax.rounding.*` 아홉 키를 `getSettingValue(def, { asOf })`로 그대로 읽을 수 있다 — 계약은 `docs/ARCHITECTURE.md` §4-2에 문서화됐다
- Phase 6이 `project.force_complete.*` 셋을, Phase 9가 `pnl.start_gate.weeks_after_cutover`를 그대로 읽을 수 있다 — 세 키 모두 `readBy` 표시가 실제 ROADMAP 페이즈 번호를 가리키는지 테스트로 고정돼 있다
- `ui/history-list/HistoryList`가 03-05의 발령일 이력에서 그대로 재사용 가능하다(설정 전용 낱말이 props에 없음을 실행 중 확인)
- `test/integration/leak-scan.test.ts`가 이제 `app/(app)/admin/settings/actions.registry.ts`를 side-effect import한다 — 03-05~03-07이 같은 패턴(`actions.registry.ts` 분리)을 따르면 누수 스캔이 자동으로 그 등록을 검사한다
- `EXPORT_REGISTRY`에 첫 항목(`settings.export`, `dtoName: null`)이 실제로 등록·검사됐다 — 03-07의 행동 로그 내보내기(DTO 있음)가 두 번째 항목이 된다

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 20개 핵심 신규 파일(스키마·마이그레이션·domain·리포지토리·테스트·UI 컴포넌트·앱 라우트·결정 기록) 전부 `[ -f ]`로 존재 확인
- 6개 커밋 해시(`b84acda`·`1749f43`·`c816e85`·`700ec32`·`eccc349`·`c278705`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 전 항목과 각 태스크의 acceptance criteria를 재실행해 위 "게이트 결과" 표와 인라인 검증 명령으로 일치 확인. `pnpm test`(세 계층 순차) 최종 재실행 exit 0, E2E 스위트 연속 2회 실행 무-flake
