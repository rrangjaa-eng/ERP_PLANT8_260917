---
phase: 04-project-quote-ledger
plan: 32
subsystem: infra
tags: [transactions, pg-pool, lock-timeout, permissions, dto-projection, drizzle, postgres]

# Dependency graph
requires:
  - phase: 04-02
    provides: "domain/projects/ledger.ts(saveProjectLedger 합성 저장), lib/db-transaction.ts(withTransaction 스켈레톤), domain/action-log/record.ts, domain/permissions/project.ts·dto-registry.ts 스켈레톤"
provides:
  - "withTransaction의 SET LOCAL lock_timeout=5s + 풀 connectionTimeoutMillis=5s + 두 시간 초과의 UserFacing 오류 변환(withTimeoutConversion, 재사용 가능한 형태로 분리)"
  - "recordAction(viewer, entry, { tx }) — 로그 쓰기 + 끌 수 있는 종류의 설정 조회가 둘 다 그 tx로 돈다(잠근 트랜잭션 안 풀 연결 0)"
  - "docs/ARCHITECTURE.md §4-8 트랜잭션·잠금 규약 — 뒤 잠금 플랜(04-11·04-20 등)이 따를 정본"
  - "domain/permissions/project.ts — projectMany(호출당 정보 항목 한 번, 행 수와 무관) + InfoItemRef(all-of) — project()는 projectMany의 얇은 래퍼"
  - "domain/permissions/dto-registry.ts — registerDto가 빈 all-of 목록을 거부"
affects: ["04-11", "04-20", "04-22", "04-12", "04-17", "04-18", "04-26", "04-40", "04-07"]

actuals:
  tokens: 11146
  tasks: 3
  commits: 5
  plan_head_before: eb727247d50716f097f6f71f8b23b607f02f35c2

tech-stack:
  added: []
  patterns:
    - "withTimeoutConversion(fn) — db.transaction()·풀 읽기 어디서 나든 55P03·pg-pool 연결 시간 초과를 UserFacingError로 바꾸는 재사용 가능한 래퍼. withTransaction도 이것으로 구현하고, saveProjectLedger 전체를 이것으로 한 번 더 감싸 트랜잭션 밖 읽기(findProject 등)의 누수도 막는다"
    - "distinctInfoItems + Map<string, boolean> — DtoSpec의 필드를 순회하며 서로 다른 정보 항목만 모아 visible()을 순서대로(await, Promise.all 아님) 한 번씩 부르고, 필드 판정은 이 맵을 읽기만 한다. all-of는 InfoItemRef = string | readonly string[]로 표현하고 every()로 판정"
    - "typeof ref === \"string\" 판별 — Array.isArray()는 string | readonly string[] 유니언에서 any[]로 좁혀져 @typescript-eslint/no-unsafe-* 를 유발한다(실측). typeof 판별은 정확히 좁혀진다"

key-files:
  created:
    - test/integration/tx-safety.test.ts
  modified:
    - db/client.ts
    - lib/db-transaction.ts
    - domain/projects/ledger.ts
    - repositories/action-log.ts
    - repositories/settings.ts
    - domain/action-log/record.ts
    - docs/ARCHITECTURE.md
    - test/integration/action-log.test.ts
    - domain/permissions/project.ts
    - domain/permissions/dto-registry.ts
    - test/unit/permissions/project.test.ts
    - test/integration/leak-scan.test.ts

key-decisions:
  - "withTimeoutConversion을 lib/db-transaction.ts에서 별도로 export했다 — withTransaction 안의 db.transaction() 호출만 감싸면 saveProjectLedger의 트랜잭션 열기 전(findProject·findQuoteRevisionById)·연 뒤(listRevenue) 풀 읽기에서 원시 pg-pool 시간 초과가 새는 것을 실측(tx-safety.test.ts (c), 풀 2 재현)했다 — ENG-D11(이전 플랜 파일 04-02의 결함, 검증 실패 원인)로 domain/projects/ledger.ts를 고쳤다"
  - "isTxTimeoutError는 원인(cause) 사슬을 따라간다 — drizzle-orm이 실제 pg 오류를 DrizzleQueryError로 감싸 error.cause에 넣는다(node_modules/drizzle-orm/errors.js 실측). 최상위 오류만 보면 55P03·연결 시간 초과를 놓친다"
  - "domain/action-log/record.ts가 DbOrTx 타입을 repositories/document-counters.ts에서 import했다(db/client.ts 직접 import 아님) — domain→db 직접 의존을 막는 boundaries 규칙(실측: lint error) 때문. domain/quotes/lines.ts·domain/revenue/index.ts가 이미 쓰는 재수출 경로와 같다"
  - "project()·projectMany의 infoItem 목록 판별은 Array.isArray가 아니라 typeof ref === \"string\"이다 — Array.isArray는 string | readonly string[] 유니언을 any[]로 좁혀 @typescript-eslint/no-unsafe-argument를 유발함을 실측(pnpm lint)"
  - "ARCHITECTURE.md §4-8은 (2)(4)(5)에서 04-11·04-20이 만들 함수(loadProjectForGate·lockProjectForWrite·denyWrite·lock-race.ts)를 '(04-xx가 만든다)'로 표시했다 — 정본 문서를 이 플랜이 먼저 세우고 뒤 플랜이 채우는 순서는 플랜 objective의 명시 지시"

requirements-completed: [PROJ-02, PROJ-04, UX-04]

coverage:
  - id: D1
    description: "withTransaction이 SET LOCAL lock_timeout='5s'를 돌리고, 풀 connectionTimeoutMillis(5000, 두 연결 경로 모두)와 함께 잠금·풀 대기 시간 초과를 UserFacingError('다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장')로 바꾼다 — 풀 크기 2에서 saveProjectLedger 동시 3건이 10초 안에 전부 끝나고 거부는 전부 UserFacingError(원시 timeout exceeded when trying to connect 0건)"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/tx-safety.test.ts#(a)(b)(c)"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts, test/integration/revenue-entries.test.ts (회귀)"
        status: pass
      - kind: unit
        ref: "test/unit/db-client-close.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "recordAction(viewer, entry, { tx })가 로그 쓰기(appendActionLog)와 끌 수 있는 종류의 설정 조회(defaultIsActionTypeEnabled → getSettingValue의 findSimpleValue 주입)를 둘 다 그 tx로 돌린다 — 잠근 트랜잭션 안에서 풀 연결을 하나도 더 잡지 않고, 롤백하면 로그도 사라진다. tx 없으면 기존 동작 그대로"
    requirement: "PROJ-04"
    verification:
      - kind: integration
        ref: "test/integration/action-log.test.ts#recordAction tx 인자(ENG-D3 ①)"
        status: pass
      - kind: integration
        ref: "test/integration/action-log-query.test.ts, test/integration/settings.test.ts (회귀)"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/ARCHITECTURE.md §4-8 '트랜잭션·잠금 규약(Phase 4)' — withTransaction 계약, 프로젝트 잠금 순서, 잠근 트랜잭션 안 전역 db 호출 금지, denyWrite, deps.afterLock 경합 테스트 규약, tx-safety.test.ts 참조를 20줄 안팎(300줄 상한 안, 265줄)으로 문서화. 뒤 잠금 플랜(04-11·04-20 등)의 정본"
    verification:
      - kind: unit
        ref: "test/unit/docs-limits.test.ts"
        status: pass
    human_judgment: true
    rationale: "300줄 상한·필수 토큰 포함은 자동 검증되지만, §4-8 본문이 04-11·04-20이 실제로 만들 규약과 정확히 맞물리는지(용어·함수 이름 선점)는 그 플랜들이 실행될 때 사람이 재확인해야 한다"
  - id: D4
    description: "project()의 노출 조회가 호출당 정보 항목 한 번(행·필드 수와 무관)이다 — 16필드가 같은 항목이면 1회, 서로 다른 항목 둘이면 2회. projectMany(viewer, rows, spec)가 그 맵을 한 번 만들어 모든 행에 쓴다(300행×18필드×항목2 → 조회 2회). project()는 projectMany([row])의 얇은 래퍼(구현 하나)"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "test/unit/permissions/project.test.ts#project·projectMany — 호출당 정보 항목 한 번(ENG-D3 ②)"
        status: pass
    human_judgment: false
  - id: D5
    description: "DTO 필드 infoItem이 정보 항목 하나(string) 또는 all-of 목록(readonly string[])을 표현한다 — 목록이면 전부 볼 수 있을 때만 키가 실린다. registerDto가 빈 목록을 EmptyInfoItemsError로 거부한다. 누수 스캔(DTO 축·내보내기 축)이 목록을 원소별로 펼쳐 검사한다(기존 600케이스 결과 불변 확인)"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "test/unit/permissions/project.test.ts#all-of 필드는 목록의 모든 항목이 참일 때만 키가 실린다"
        status: pass
      - kind: integration
        ref: "test/integration/leak-scan.test.ts (DTO 축·내보내기 축·registerDto 빈 목록 거부)"
        status: pass
      - kind: integration
        ref: "test/integration/visibility.test.ts, test/integration/projects-list.test.ts (회귀)"
        status: pass
    human_judgment: false
  - id: D6
    description: "[ENG-D11 편차] domain/projects/ledger.ts(04-02)의 saveProjectLedger가 트랜잭션 열기 전·연 뒤에도 풀 db로 읽어 withTransaction 밖에서 원시 pg-pool 시간 초과가 샜다 — withTimeoutConversion으로 함수 전체를 감싸 해소. 이 플랜의 검증(tx-safety.test.ts (c))이 이 결함 때문에 실패해 04-02 파일을 고쳤다(범위는 늘리지 않음, 회귀 테스트로 고정)"
    verification:
      - kind: integration
        ref: "test/integration/tx-safety.test.ts#(c) 풀 크기 2에서 saveProjectLedger 셋을 동시에 보내도 10초 안에 전부 끝난다"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 32: 트랜잭션·잠금 시간 제한 + 행동 로그 tx + 투영 조회 한 번 Summary

**`withTransaction`에 `lock_timeout 5s`·풀 `connectionTimeoutMillis 5s`와 UserFacing 오류 변환을 넣고, `recordAction`이 그 tx로 로그·설정 조회를 돌리며, `project()`를 `projectMany`로 다시 세워 호출당 정보 항목 한 번(all-of 지원)으로 줄였다 — 04-02가 만든 `saveProjectLedger`의 트랜잭션 밖 풀 읽기 누수도 함께 고쳤다.**

## Performance

- **Duration:** 약 55분
- **Started:** 2026-09-24T07:15:00Z
- **Completed:** 2026-09-24T08:10:07Z
- **Tasks:** 3/3 완료
- **Files modified:** 13(생성 1 + 수정 12)

## Accomplishments
- `db/client.ts` 두 `new Pool(...)` 경로 모두에 `connectionTimeoutMillis: 5000` 추가
- `lib/db-transaction.ts`의 `withTransaction`이 콜백 전 `SET LOCAL lock_timeout = '5s'`를 돌리고, `55P03`·pg-pool 연결 시간 초과(원인 사슬까지 확인)를 `UserFacingError`("다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장")로 바꾼다. 이 변환 로직을 `withTimeoutConversion`으로 분리해 재사용 가능하게 했다
- `test/integration/tx-safety.test.ts` 신설 — (a) `SHOW lock_timeout` = 5s (b) 잠금 대기 초과 → UserFacing, 약 5초 (c) 풀 크기 2에서 `saveProjectLedger` 동시 3건이 10초 안에 전부 끝나고 거부는 전부 `UserFacingError`
- `repositories/action-log.ts`의 `appendActionLog`·`repositories/settings.ts`의 `findSimpleValue`에 선택 `tx?: DbOrTx` 추가(인자 없으면 기존 동작 그대로)
- `domain/action-log/record.ts`의 `recordAction(viewer, entry, { tx })`가 로그 쓰기와 끌 수 있는 종류의 설정 조회를 둘 다 그 tx로 돌린다 — `domain/settings/registry.ts`는 건드리지 않고 기존 `deps.findSimpleValue` 주입 계약만 쓴다(diff 0줄)
- `docs/ARCHITECTURE.md` §4-8 「트랜잭션·잠금 규약(Phase 4)」 신설(265줄, 300줄 상한 안) — 뒤 잠금 플랜(04-11·04-20 등)이 따를 정본
- `domain/permissions/project.ts` — `InfoItemRef = string | readonly string[]`, `projectMany(viewer, rows, spec, deps?)`가 서로 다른 정보 항목만 한 번씩 조회해 모든 행에 적용한다. `project()`는 `projectMany([row])`의 얇은 래퍼(구현 하나). all-of 필드는 목록 전부가 참일 때만 키가 실린다
- `domain/permissions/dto-registry.ts` — `DtoRegistryEntry.fields`가 `InfoItemRef`를 쓰고(project.ts에서 import), `registerDto`가 빈 all-of 목록을 `EmptyInfoItemsError`로 거부한다
- `test/integration/leak-scan.test.ts`의 DTO 축·내보내기 축이 `field.infoItem`을 목록으로 펼쳐(`infoItemsOf`) 항목마다 검사하도록 재구성 — 기존 600케이스 결과 불변 확인 + `registerDto` 빈 목록 거부 케이스 추가
- **[ENG-D11 편차]** `domain/projects/ledger.ts`(04-02)의 `saveProjectLedger`를 `withTimeoutConversion`으로 전체 감싸 트랜잭션 열기 전·커밋 뒤 풀 읽기의 원시 시간 초과 누수를 막았다

## Task Commits

1. **Task 1: 트레이서 — 풀 크기 2에서 동시 합성 저장 셋이 10초 안에 끝난다** — `b395483`(feat, lock_timeout·connectionTimeoutMillis·UserFacing 변환·tx-safety.test.ts 전부 + ENG-D11 편차)
2. **Task 2: 행동 로그 tx + ARCHITECTURE §4-8** — `ce424ab`(test, RED) → `c9e70ea`(feat, GREEN)
3. **Task 3: project() 호출당 정보 항목 한 번 · projectMany · all-of** — `af47867`(test, RED) → `518ad0f`(feat, GREEN)

**Plan metadata:** (이 커밋 직후 기록)

_Note: Task 1은 `type="tracer"`(RED/GREEN 분리 강제 대상 아님) — 구현·테스트를 한 커밋에 묶고 실행 중 발견한 ENG-D11 결함도 같은 커밋에 포함했다. Task 2·3은 `tdd="true"`로 RED → GREEN 두 커밋을 지켰다._

## Files Created/Modified
전체 목록은 frontmatter `key-files` 참고. 핵심만:
- `lib/db-transaction.ts` — `withTimeoutConversion`·`withTransaction`(잠금·풀 시간 제한 + UserFacing 변환의 단일 지점)
- `domain/projects/ledger.ts` — ENG-D11 편차(트랜잭션 밖 읽기까지 시간 초과 변환)
- `domain/permissions/project.ts`·`dto-registry.ts` — `projectMany`·`InfoItemRef`·`EmptyInfoItemsError`
- `docs/ARCHITECTURE.md` — §4-8 트랜잭션·잠금 규약
- `test/integration/tx-safety.test.ts` — 신규, 뒤 플랜(04-20·04-22·04-12)이 「셋 다 성공」 케이스를 더할 자리

## Decisions Made
frontmatter `key-decisions` 참고(withTimeoutConversion 분리·원인 사슬 확인·DbOrTx 재수출 경로·typeof 판별·ARCHITECTURE 「(04-xx가 만든다)」 표시).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] drizzle-orm의 오류 래핑 — `isTxTimeoutError`가 원인(cause) 사슬을 따라가야 함**
- **Found during:** Task 1 (`tx-safety.test.ts` (b) 최초 실행)
- **Issue:** drizzle-orm이 실제 pg 오류(`55P03`·pg-pool 연결 시간 초과)를 `DrizzleQueryError`로 감싸 `error.cause`에 넣는다(`node_modules/drizzle-orm/errors.js` 실측) — 최상위 오류의 `.code`·`.message`만 보면 놓친다
- **Fix:** `isTxTimeoutError`가 `error instanceof Error` 사슬을 `.cause`로 따라가며 각 단계에서 `55P03`·시간 초과 메시지를 확인
- **Files modified:** `lib/db-transaction.ts`
- **Verification:** `tx-safety.test.ts` (b) 통과
- **Committed in:** `b395483`

**2. [ENG-D11 — 이전 플랜 파일 결함] `domain/projects/ledger.ts`(04-02)가 트랜잭션 밖에서도 풀로 읽어 원시 시간 초과가 샘**
- **Found during:** Task 1 (`tx-safety.test.ts` (c) 최초 실행, 풀 2 재현)
- **Issue:** `saveProjectLedger`가 트랜잭션을 열기 전(`findProject`·`findQuoteRevisionById`)과 연 뒤(`listRevenue`)에도 풀 `db`로 읽는다 — 풀 경합 중 이 지점들에서 나는 `timeout exceeded when trying to connect`는 `withTransaction`의 변환을 거치지 않고 그대로 던져졌다(4회 재현 중 여러 번 실측)
- **Fix:** `withTimeoutConversion`을 `lib/db-transaction.ts`에서 export하고, `saveProjectLedger` 함수 전체를 이것으로 감쌌다 — 이미 변환된 `UserFacingError`를 다시 감싸도 원인 사슬에 `55P03`·시간 초과 패턴이 없어 그대로 다시 던져지므로 이중 변환 문제는 없다
- **Files modified:** `lib/db-transaction.ts`(export 추가), `domain/projects/ledger.ts`
- **Verification:** `tx-safety.test.ts` (c) 4회 연속 통과(재현 확인)
- **Committed in:** `b395483`

**3. [Rule 3 - 블로킹] `domain/action-log/record.ts`의 `DbOrTx` import가 boundaries 규칙 위반**
- **Found during:** Task 2 GREEN 구현 뒤 `pnpm lint`
- **Issue:** `import type { DbOrTx } from "@/db/client"`가 `domain→db` 직접 의존 금지 규칙(`eslint-plugin-boundaries`)에 걸림
- **Fix:** `domain/quotes/lines.ts`·`domain/revenue/index.ts`가 이미 쓰는 재수출 경로대로 `@/repositories/document-counters`에서 import하도록 변경
- **Files modified:** `domain/action-log/record.ts`
- **Verification:** `pnpm lint` 통과
- **Committed in:** `c9e70ea`

**4. [Rule 1 - 버그] `Array.isArray()`가 `string | readonly string[]` 유니언을 `any[]`로 좁혀 lint 오류**
- **Found during:** Task 3 GREEN 구현 뒤 `pnpm lint`
- **Issue:** `domain/permissions/project.ts`·`test/integration/leak-scan.test.ts` 둘 다 `Array.isArray(field.infoItem) ? field.infoItem : [...]` 형태로 썼는데, `Array.isArray`의 타입 좁힘이 이 유니언에서 `any[]`가 되어 `@typescript-eslint/no-unsafe-argument` 등 6건이 났다
- **Fix:** `typeof ref === "string"` 판별로 교체(정확히 좁혀짐)
- **Files modified:** `domain/permissions/project.ts`, `test/integration/leak-scan.test.ts`
- **Verification:** `pnpm lint`·`pnpm typecheck` 통과
- **Committed in:** `af47867`(테스트 파일)·`518ad0f`(production 파일)

---

**Total deviations:** 4건 자동 수정(Rule 1 버그 2 · ENG-D11 이전 플랜 결함 1 · Rule 3 블로킹 1)
**Impact on plan:** 전부 이 플랜의 acceptance criteria·must_haves.truths를 충족시키기 위한 수정이거나 실행 중 실측으로 드러난 결함의 회귀 방지. 계획 범위 밖 신규 기능은 없다.

## TDD Gate Compliance

- **Task 1**(`type="tracer"`, tdd 게이트 강제 대상 아님): 구현·테스트를 한 커밋(`b395483`)에 묶어 실행했다. Task 자체가 "먼저 테스트를 쓰고 실패를 확인한 뒤 구현" 순서를 실제로 따랐다(테스트 작성 → `pnpm vitest`로 실패 2건 확인 → `lib/db-transaction.ts` 수정 → 통과 확인, 4회 반복해 안정성 확인) — 다만 RED 커밋을 별도로 남기지 않았다(계획이 요구하지 않음).
- **Task 2**(`tdd="true"`): RED(`ce424ab`) → GREEN(`c9e70ea`) 순서를 지켰다. `pnpm vitest run ... --reporter=tap`으로 새 테스트 4건 중 2건이 목표 동작에서 실패함을 확인한 뒤 구현했다(나머지 2건은 tx 유무와 무관한 회귀 케이스라 처음부터 통과 — 계획 검토 시점에 의도된 것으로 판단).
- **Task 3**(`tdd="true"`): RED(`af47867`) → GREEN(`518ad0f`) 순서를 지켰다. 단위 테스트 3/4건이 실패(호출 1·2·2회 단언 중 첫 번째만 실패, `projectMany` 부재, all-of 미지원)했고, 통합 `leak-scan.test.ts`는 601번째 케이스("빈 목록 거부") 1건만 실패해 리팩터가 기존 600케이스의 결과를 보존함을 실측으로 확인했다.
- **RED 증거(#3770 보강):** `gsd_run check tdd-red-evidence`는 Node `--test-reporter=tap`의 `# tests`/`# pass`/`# fail` 요약 줄을 요구하는데 이 프로젝트는 Vitest만 쓴다(`--reporter=tap`이 그 요약 줄을 내지 않음, 실측) — Vitest TAP 출력을 역/요약 줄 부가로 정규화해 `test/integration/action-log.test.ts`의 RED 상태(target_test="withTransaction ... 롤백")에 한 번 적용했고 `verdict: RED_EVIDENCE_OK`를 확인했다. 세 태스크 전부 `--reporter=tap` 실측 출력으로 "정확히 그 테스트가 그 이유로 실패"함을 직접 확인했으므로(위 각 항목), 이 도구 미스매치는 RED 검증 자체를 약화시키지 않았다 — 남은 태스크는 이 프로젝트가 Vitest를 쓰는 한 재발한다(별도 gsd-core 이슈로 넘길 만함, 이 플랜 범위 밖).

## Issues Encountered

**leak-scan.test.ts 실행 시간(~400초)** — DTO 레지스트리(현재 15개 DTO × 5계급 × 정보 항목)가 600케이스를 만들고 각각 실제 Postgres `visible()` 왕복을 한다. 결함은 아니지만(전부 통과) 실행 시간이 길어 첫 RED 확인 때 병렬로 겹쳐 돌린 실수로 두 프로세스가 `TRUNCATE`를 동시에 걸어 한동안 멈췄다(내 프로세스 관리 실수 — `systematic-debugging`으로 원인 확인 후 잔여 프로세스 정리하고 단일 실행으로 재확인). 코드 결함 아님, 기록만 남긴다.

## Known Stubs

없음 — 이 플랜은 UI를 만들지 않는다.

## Threat Flags

없음 — 이 플랜이 다루는 표면(풀·잠금 시간 제한, 트랜잭션 밖 읽기 변환, 투영 조회 횟수)은 계획의 `<threat_model>`(T-04-301~304, T-04-SC)이 이미 다룬 범위 안이다. ENG-D11 편차(`domain/projects/ledger.ts` 전체 감싸기)도 T-04-301의 같은 완화(시간 초과 → UserFacing 변환)를 적용 범위만 넓힌 것이라 새 위협 유형이 아니다.

## User Setup Required

None - 외부 서비스 설정 불필요.

## Next Phase Readiness

- 잠금·풀 시간 제한과 UserFacing 변환이 `withTransaction`(그리고 필요하면 `withTimeoutConversion`) 하나에 서서, 04-11(자동 정산)·04-20(첫 잠금 플랜)이 프로젝트 행 잠금을 추가할 토대가 됐다. `docs/ARCHITECTURE.md` §4-8이 그 규약의 정본이다.
- `recordAction`의 `tx` 인자가 준비돼 04-20이 계획했던 CEO A-01(로그를 잠근 트랜잭션과 함께 커밋·롤백)을 그대로 쓸 수 있다.
- `projectMany`·all-of(`InfoItemRef`)가 준비돼 04-17(합계 DTO)·04-18(수익 열)이 새 all-of 필드를 등록하고, 04-12(견적 줄 목록)가 `rows.map(project)`를 `projectMany`로 바꿔 300행 투영을 정보 항목 수(현재 2)만큼으로 줄일 수 있다.
- `test/integration/tx-safety.test.ts`의 「풀 2 · 동시 합성 저장 셋」 describe는 04-22(기간)·04-12(견적 줄)가 각자의 규약 위반을 고친 뒤 「셋 다 성공」 케이스를 더하는 자리로 남아 있다(현재는 「성공 또는 UserFacing 거부」까지만 단언).
- 남은 작업 없음 — 04-32는 여기서 완료.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 13 created/modified key-files verified present on disk. All 5 task commit hashes (`b395483`, `ce424ab`, `c9e70ea`, `af47867`, `518ad0f`) verified present in `git log --oneline --all`. `commits: 5` measured via `git rev-list --count eb727247d50716f097f6f71f8b23b607f02f35c2..HEAD` against the plan-head ledger (`plan_head_before: eb727247d50716f097f6f71f8b23b607f02f35c2`). Plan-level `<verification>` re-run fresh in this session: `pnpm lint` clean, `pnpm typecheck` clean, `pnpm build` succeeded (11 routes), `pnpm lint:sql` 0 issues, integration `tx-safety`/`action-log`/`leak-scan` + regression files (829 tests) all pass, unit `project`/`docs-limits`/`import-cycles` (36 tests) all pass, `domain/settings/registry.ts`/`domain/permissions/visible.ts`/`can.ts`/`scope-for.ts` diff 0 lines since `eb72724`, `package.json`/`pnpm-lock.yaml` diff 0 lines against `d6b41cf`.
