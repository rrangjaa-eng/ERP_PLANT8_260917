---
phase: 04-project-quote-ledger
plan: 01
subsystem: database
tags: [drizzle, postgres, nextjs, server-actions, money-model, gate-pattern, document-numbering]

# Dependency graph
requires:
  - phase: 03
    provides: buildCustomFieldsSchema, DtoSpec/registerDto/project() pattern, scopeFor, recordAction, seedMasterData, eslint boundaries/money-boundary rules
provides:
  - "projects / quote_revisions / quote_lines 3개 신규 테이블 (migration 0009)"
  - "domain/money — Money 브랜드 타입, 유일한 numeric↔number 파서, round/toKrw/quoteAmount/profit"
  - "domain/rules/gate — 게이트 단일 진입점(registerGateRule/gate/listGateRules), project.completed-lock 규칙 등록"
  - "document_counters 행 잠금 기반 원자적 채번(allocateNumber, UPDATE...RETURNING in-transaction)"
  - "lib/db-transaction (withTransaction) — domain이 db를 직접 import하지 않고 트랜잭션을 여는 경로"
  - "ui/form, ui/select, ui/table — SYSTEM.md §7-15 계약을 따르는 첫 재사용 폼/표 컴포넌트"
  - "/projects, /projects/[id] 라우트 — 이 리포의 첫 목록/상세 분리 화면"
affects: [05, 06, 07, 08, 09, 10, 11]

actuals:
  tokens: 62500
  tasks: 3
  commits: 3
  plan_head_before: c5fb0dc

tech-stack:
  added: []
  patterns:
    - "단일 지점 3종: domain/money(금액 산술), domain/rules/gate(상태 잠금 판정), document_counters 원자 증가(채번) — 이후 페이즈는 전부 이 세 지점을 재사용한다"
    - "domain이 트랜잭션을 열 때 db를 직접 import하지 않고 lib/db-transaction의 withTransaction(fn) 래퍼를 통과한다(4계층 boundaries 규칙 준수)"
    - "repositories 쓰기 함수는 tx: DbOrTx = db 옵션 인자로 트랜잭션 참여/단독 실행을 모두 지원한다"
    - "ui/table은 모드 토글 prop 없이 전 행·전 열의 editability()를 스캔해 role=grid 여부를 자동 판정한다"
    - "참조 데이터(거래처/팀/담당자/소분류 드롭다운)는 admin.* 메뉴 권한을 새로 열지 않고, 화면이 속한 메뉴(projects) 권한 하나로 게이트한 별도 조회 함수(domain/projects/references.ts)로 좁혀 노출한다"

key-files:
  created:
    - db/schema/money-columns.ts
    - db/schema/projects.ts
    - db/schema/quote-revisions.ts
    - db/schema/quote-lines.ts
    - db/migrations/0009_project_quote_ledger_spine.sql
    - domain/money/index.ts
    - domain/money/currency.ts
    - domain/rules/gate.ts
    - domain/rules/register.ts
    - domain/document-numbering/index.ts
    - domain/projects/index.ts
    - domain/projects/references.ts
    - domain/quotes/lines.ts
    - lib/db-transaction.ts
    - repositories/projects.ts
    - repositories/quote-revisions.ts
    - repositories/quote-lines.ts
    - ui/form/Form.tsx
    - ui/select/Select.tsx
    - ui/table/Table.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/projects/project-form.tsx
    - app/(app)/projects/actions.ts
    - app/(app)/projects/actions.registry.ts
    - "app/(app)/projects/[id]/page.tsx"
    - "app/(app)/projects/[id]/quote-table.tsx"
    - test/unit/domain/money.test.ts
    - test/unit/domain/rules-gate.test.ts
    - test/unit/domain/quote-lines.test.ts
    - test/integration/document-counters-concurrency.test.ts
    - test/integration/quote-lines.test.ts
    - test/e2e/project-register.spec.ts
  modified:
    - db/client.ts
    - db/schema/index.ts
    - domain/action-log/record.ts
    - domain/permissions/info-items.ts
    - domain/permissions/scope-for.ts
    - domain/seed/index.ts
    - repositories/document-counters.ts
    - docs/design/SYSTEM.md
    - docs/design/DECISIONS.md
    - docs/ARCHITECTURE.md
    - test/integration/document-counters.test.ts
    - test/integration/leak-scan.test.ts
    - test/e2e/page-chrome.spec.ts

key-decisions:
  - "마이그레이션 번호를 계획의 0004에서 실제 다음 번호 0009로 정정(Rule 1)"
  - "role-pm 기본 권한에 projects 메뉴 view+write 추가 — PM의 핵심 작업 화면이고 기존 테스트가 이미 그 접근을 전제(Rule 2)"
  - "admin.vendors/admin.people 기본 권한은 열지 않고 domain/projects/references.ts로 projects 메뉴 권한만으로 참조 데이터를 좁게 노출(people.spec.ts/vendors.spec.ts의 기본 404 단언 보존)"
  - "quote_subcategory 코드표 4항목 시드 추가(견적 줄 소분류 select의 데이터 소스)"

patterns-established:
  - "Pattern: 단일 지점(single point of truth) — 금액 산술·게이트 판정·채번을 각 도메인 모듈 하나로 강제하고 나머지 계층은 그 함수만 호출"
  - "Pattern: withTransaction(fn) — domain 계층 트랜잭션은 db 직접 import 없이 lib 래퍼를 통해서만"

requirements-completed: []  # PROJ-01/PROJ-02/UX-04는 04-XX 형제 플랜들과 공유 선언 — requirements.ready-ids 게이트가 0/3 ready 반환(형제 플랜 미완료). 이 플랜은 각 요건의 부분 구현만 제공하므로 완료 표시는 보류한다.

coverage:
  - id: D1
    description: "프로젝트 등록 폼 제출 시 서버가 매긴 문서번호가 자동 배정되고 폼에는 번호 입력 칸이 없다(D-42)"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "견적 줄 일괄 저장 시 견적가(수량×단가)·차익(견적가−실행가)이 서버 계산값으로 저장되고, 브라우저가 보낸 견적가·차익 필드는 무시된다"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "test/unit/domain/quote-lines.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "두 트랜잭션이 동시에 번호를 요청하면 서로 다른 값을 받고, 실패한 트랜잭션의 증가분은 결번으로 남되 다음 등록이 다음 번호를 받는다(행 잠금, Issue 10)"
    verification:
      - kind: integration
        ref: "test/integration/document-counters-concurrency.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "완료(정산) 상태 프로젝트의 견적 줄 저장은 domain/rules/gate 한 지점에서 거부되고, 미등록 게이트 규칙 이름은 조용히 통과하지 않고 오류가 난다"
    verification:
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "서버 검증 실패 시 입력값이 지워지지 않고 폼에 남는다(UX-04); 375px 폭에서 목록·상세·표 전부 가로 스크롤이 0"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "ui/form·ui/select·ui/table 세 신규 컴포넌트가 SYSTEM.md §7-15 계약(noValidate, native required/type=number 금지, 편집 셀 있을 때만 role=grid)을 따른다"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts, test/e2e/page-chrome.spec.ts"
        status: pass
    human_judgment: true
    rationale: "접근성 계약 준수는 자동 테스트가 role/aria 속성 일부만 단언한다 — SYSTEM.md §7-15 전체 문체·시각 정합은 /design-review(Post-build)에서 사람이 확인한다"

duration: 1h36m
completed: 2026-09-22
status: complete
---

# Phase 4 Plan 1: 프로젝트·견적 원장 트레이서 Summary

**프로젝트 등록→문서번호 자동 배정→견적 줄 서버 계산 저장까지, 이 페이즈가 새로 만드는 모든 계층(스키마·금액 모델·게이트·리포지토리·domain·Server Action·ui/form·ui/select·ui/table·행동 로그)을 한 경로로 관통시킨 트레이서.**

## Performance

- **Duration:** 1h36m (19:11–20:47 KST 근방)
- **Started:** 2026-09-22T19:11:45Z
- **Completed:** 2026-09-22T20:47:08Z
- **Tasks:** 3/3 완료 (Task 1 checkpoint:decision은 오케스트레이터가 사전 확정한 7개 답으로 해소, 실행 중단 없음)
- **Files modified:** 54 (44+7+3, 3개 커밋)

## Accomplishments
- 프로젝트/상세 견적 차수/견적 줄 3개 테이블과 공용 `moneyColumns` 팩토리를 migration 0009로 배선하고 `pnpm lint:sql` 통과 확인
- `domain/money`(유일한 numeric 파서·round/toKrw/quoteAmount/profit) · `domain/rules/gate`(project.completed-lock, 미등록 규칙명은 오류) · `document_counters` 행 잠금 기반 원자적 채번(`UPDATE...RETURNING`, 같은 트랜잭션) 세 단일 지점을 실제로 만들고 domain/quotes/lines.ts·domain/projects/index.ts가 그것만 호출하도록 배선
- `ui/form`/`ui/select`/`ui/table` 세 신규 컴포넌트를 SYSTEM.md §7-15 계약대로 신설 — `noValidate`, native `required`/`type=number` 금지, 편집 가능 셀이 하나라도 있을 때만 `role=grid`
- `/projects`(목록+등록 폼) · `/projects/[id]`(상세=견적 원장, 일괄 저장) 두 라우트를 Server Actions + 위 컴포넌트로 구현, 클라이언트가 보낸 견적가·차익 필드는 zod 스키마에 아예 없어 파싱되지 않음
- 단위 20건(money/gate/quote-lines 계산) + E2E 등록→상세→저장 전체 흐름(375px 무스크롤 포함)까지 그린 상태로 확인

## Task Commits

1. **Task 1: checkpoint:decision (7개 항목)** — 오케스트레이터가 디스패치 시점에 사전 확정, 별도 커밋 없음 (①~⑤ 잠정/권고, ⑥⑦ 사용자 확정 — 아래 Decisions Made 참고)
2. **Task 2: 트레이서 — SYSTEM.md 개정부터 화면까지 한 경로 관통** — `a25d0fb` (feat) + `b408f9a` (feat, ui/form·ui/select·ui/table 누락분 보강 커밋)
3. **Task 3: 증명 — 동시 채번·조작된 계산 페이로드·게이트 거부·FK 제한** — `ea24b34` (test)

**Plan metadata:** (이 커밋 — 아래 참고)

## Files Created/Modified
전체 목록은 frontmatter `key-files`(created/modified) 참고. 핵심만:
- `db/migrations/0009_project_quote_ledger_spine.sql` — 3테이블 생성 + FK/인덱스 + code_items 갱신 가드
- `domain/money/index.ts`, `domain/rules/gate.ts`, `domain/document-numbering/index.ts` — 이 페이즈의 세 단일 지점
- `lib/db-transaction.ts` — domain→db 직접 import를 막는 boundaries 준수 래퍼
- `app/(app)/projects/[id]/quote-table.tsx` — 견적 줄 편집 표(ui/table 기반)

## Decisions Made
Task 1 checkpoint:decision의 7개 항목(오케스트레이터 디스패치로 사전 해소):
1. ~5. 잠정/오케스트레이터 권고안으로 실행 — 표 라이브러리 없이 직접 구현(D-61 고정 결정과 일치), 참조 데이터 조회 범위, DTO 필드 경계 등 (04-OPEN-ITEMS.md U-1/A-M3 행에 기록됨)
6.~7. 사용자 확정 항목 — 그대로 반영

추가로 실행 중 확정한 결정 2건(둘 다 04-OPEN-ITEMS.md에 기록):
- U-1: 375px 폭에서 상세 머리 줄은 버튼군이 아래 줄로 내려가는 flex-wrap 방식(가로 스크롤 0 유지)
- A-M3: (ㄱ) 안 채택 — 상세 내용은 04-OPEN-ITEMS.md 참고

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] 마이그레이션 번호 0004 → 0009 정정**
- **Found during:** Task 2
- **Issue:** 계획서에 `0004_project_quote_ledger_spine.sql`로 기재되어 있었으나 실제 다음 마이그레이션 번호는 0009였다(그 사이 다른 페이즈/플랜이 0004~0008을 이미 점유)
- **Fix:** `drizzle-kit generate`로 생성된 실제 다음 번호로 파일명·`_journal.json` 태그를 맞췄다
- **Files modified:** `db/migrations/0009_project_quote_ledger_spine.sql`, `db/migrations/meta/_journal.json`, `db/migrations/meta/0009_snapshot.json`
- **Verification:** `pnpm lint:sql`(0 issues) + `pnpm db:migrate` 성공
- **Committed in:** `a25d0fb`

**2. [Rule 2 - 누락 필수 기능] domain→db 직접 import 경계 위반 방지**
- **Found during:** Task 2 (domain/projects/index.ts, domain/quotes/lines.ts가 트랜잭션을 열어야 했음)
- **Issue:** `domain/**`이 `db`를 직접 import하면 `eslint-plugin-boundaries`(domain → domain/repositories/lib만 허용) 위반
- **Fix:** `lib/db-transaction.ts`에 `withTransaction(fn)` 래퍼 신설, `DbOrTx` 타입을 `db/client.ts`로 이동(`Pick<typeof db, "insert"|"update"|"select">`로 `PgTransaction`과 `NodePgDatabase` 양쪽 호환되게 축소)
- **Files modified:** `lib/db-transaction.ts`(신설), `db/client.ts`, `repositories/document-counters.ts`
- **Verification:** `pnpm lint` 통과(boundaries 규칙 위반 0건), `pnpm typecheck` 통과
- **Committed in:** `a25d0fb`

**3. [Rule 2 - 누락 필수 기능] role-pm 기본 권한에 projects 메뉴 추가**
- **Found during:** Task 2 (등록 폼 테스트 중 기획 PM 계급이 `/projects`에서 404)
- **Issue:** `seedMasterData`의 `DEFAULT_ROLE_ID`(role-pm)는 기본적으로 메뉴 권한이 전혀 없다 — projects는 PM의 핵심 작업 화면이므로 접근 불가는 이 플랜의 목표(PM이 프로젝트를 등록)를 막는 결정적 결함
- **Fix:** `domain/seed/index.ts`에 `DEFAULT_ROLE_ID`가 `"projects"` 메뉴에 `view`+`write`를 갖도록 시드 루프 추가
- **Files modified:** `domain/seed/index.ts`
- **Verification:** 전체 단위+통합 테스트 재실행, 기존 권한 경계 테스트(`code-tables.spec.ts` 등) 그대로 통과 확인
- **Committed in:** `a25d0fb`

**4. [Rule 2 - 누락 필수 기능, 이후 Rule 4 판단으로 전환] 참조 데이터 조회 범위**
- **Found during:** Task 2 (등록 폼의 거래처/팀/담당자/소분류 select가 빈 목록)
- **Issue:** 처음에는 role-pm에 `admin.vendors`/`admin.people` view 권한을 추가하려 했으나, 이는 `people.spec.ts`(role-pm 기본 404 명시 단언)·`vendors.spec.ts`를 깨뜨렸다 — 기존 테스트가 의도적으로 지키는 권한 경계였다
- **Fix:** 대신 `domain/projects/references.ts`를 신설해 `can(viewer, "projects", "view")` 하나로만 게이트하는 좁은 조회 함수(`listProjectFormReferences`)를 만들어 id/name 최소 투영만 반환
- **Files modified:** `domain/projects/references.ts`(신설), 되돌린 시도는 `domain/seed/index.ts`에 반영되지 않음
- **Verification:** `people.spec.ts`, `vendors.spec.ts` 재실행 통과(기본 404 유지)
- **Committed in:** `a25d0fb`

**5. [Rule 1 - 버그] ui/table 375px 접힌 행의 편집 셀 중복 렌더**
- **Found during:** Task 2 (자체 acceptance criteria 재검토 중 발견, 테스트 실패로 발견된 것 아님)
- **Issue:** 375px 접힌 요약 행이 편집 가능 열에도 `column.cell(row)`를 그대로 호출해 라이브 `<input>`을 본문 행과 중복 렌더
- **Fix:** `TableColumn`에 `summary?` 필드 추가, 접힌 행 생성 시 `editability === "edit"`이면서 `summary`가 없는 열은 제외
- **Files modified:** `ui/table/types.ts`, `ui/table/Table.tsx`
- **Verification:** `test/e2e/project-register.spec.ts`의 375px 무스크롤 단언 통과
- **Committed in:** `a25d0fb`

**6. [Rule 1 - 버그] `/projects` 목록의 「프로젝트 등록」 링크 중복**
- **Found during:** Task 2 전체 E2E 회귀 실행 중(`page-chrome.spec.ts` "resolved to 2 elements")
- **Issue:** `vendors.tsx` 선례에 있던 `projects.length > 0` 가드가 filterRow Link에 누락되어, 목록이 비어 있을 때 `ListEmpty`의 액션과 중복 렌더
- **Fix:** 가드 추가
- **Files modified:** `app/(app)/projects/page.tsx`
- **Verification:** `page-chrome.spec.ts` 14/14 통과(단독 실행)
- **Committed in:** `a25d0fb`

**7. [Rule 1 - 버그] 소분류·거래처 select가 ui/select 미준수**
- **Found during:** Task 2 (자체 acceptance criteria 재검토 중 발견)
- **Issue:** `quote-table.tsx`의 소분류·거래처 편집 셀이 네이티브 `<select>`를 직접 렌더 — "클라이언트·거래처·소분류 세 칸이 전부 `ui/select`로 렌더" 기준 위반
- **Fix:** 두 칸 모두 `Select` 컴포넌트로 교체
- **Files modified:** `app/(app)/projects/[id]/quote-table.tsx`
- **Verification:** 육안 확인 + E2E select 상호작용 경로 통과
- **Committed in:** `a25d0fb`

**8. [Rule 1 - 버그] page-chrome.spec.ts 링크 텍스트 불일치**
- **Found during:** Task 2 (`/projects` EMPTY 상태 액션 문구를 "지출결의 보기"에서 "프로젝트 등록"으로 바꾼 여파)
- **Issue:** "전역 포커스 링" 테스트가 옛 텍스트를 참조
- **Fix:** 로케이터를 "프로젝트 등록"으로 갱신, `grep -rln "지출결의 보기" test/e2e/`로 다른 참조 없음 확인
- **Files modified:** `test/e2e/page-chrome.spec.ts`
- **Verification:** 단독 실행 14/14 통과
- **Committed in:** `a25d0fb`

**9. [Rule 2 - 누락 필수 기능] leak-scan-coverage 누락 import**
- **Found during:** Task 2 (통합 테스트 실행)
- **Issue:** 새 `actions.registry.ts`·domain 모듈이 `test/integration/leak-scan.test.ts`의 side-effect import 목록에 없어 누수 스캔 커버리지 테스트 실패
- **Fix:** `domain/projects`, `domain/quotes/lines`, `app/(app)/projects/actions.registry` import 추가
- **Files modified:** `test/integration/leak-scan.test.ts`
- **Verification:** `pnpm test:integration` 통과
- **Committed in:** `a25d0fb`

---

**Total deviations:** 9건 자동 수정 (Rule 1: 6건, Rule 2: 3건, Rule 4 판단 후 좁은 대안 채택: 1건은 Rule 2와 중복 집계하지 않음)
**Impact on plan:** 전부 정확성·보안·접근 경계·계획 스스로의 acceptance criteria 충족에 필요한 수정이었다. 범위를 벗어난 신규 기능 추가는 없음.

## Issues Encountered

**마이그레이션 가드가 `erp_test`에서 실제로 발동** — migration 0009의 `DO $$ ... RAISE EXCEPTION` 가드가 `erp_test` DB에 남아 있던 8개의 이전 세션 잔여 "QA 코드" project_status 행을 감지해 정지시켰다. 잔여 행이 테스트 코드에서 온 것이 아님을 grep으로 확인 후(계획 체크포인트가 "가드를 약화하지 말라"고 명시한 대로) 가드 로직을 바꾸지 않고 승인된 `pnpm db:reset:test`로 DB를 초기화해 해결 — 가드가 설계대로 작동함을 실환경에서 검증한 사례.

**전체 E2E 스위트 간헐적 실패(이 플랜과 무관)** — `deferred-items.md` 참고. 거래처/법인카드/조직/행동 로그 등 이 플랜이 건드리지 않은 화면의 스펙이 전체 스위트 동시 실행에서만 간헐적으로 실패(`[WebServer] ⨯ Error: The destination stream closed early.` — Turbopack dev 서버가 부하 아래서 응답 스트림을 가끔 끊는 것으로 추정). 각 스펙을 단독 실행하면 전부 통과. 범위 밖으로 판단해 고치지 않고 기록만 함(아래 참고).

## Known Stubs

없음 — 이 플랜이 만든 화면·API는 전부 실 데이터 경로로 연결되어 있다. (`CompletedProjectError`는 정의만 하고 아직 어디서도 throw하지 않지만, 이는 계획의 Artifacts 표에 명시된 대로 04-06을 위한 예약된 export이며 UI 렌더링에 영향을 주는 스텁이 아니다.)

## Threat Flags

없음 — 이 플랜이 여는 새 표면(Server Actions 2개, 라우트 2개)은 계획의 `<threat_model>`이 이미 다룬 범위 안이다(authedActionClient 세션 검사, `can()` 메뉴 게이트, zod 스키마가 서버 계산 필드를 애초에 파싱하지 않음).

## User Setup Required

None - 외부 서비스 설정 불필요.

## Next Phase Readiness

이 페이즈의 세 단일 지점(`domain/money`, `domain/rules/gate`, 문서 번호 카운터 원자 증가)과 재사용 컴포넌트(`ui/form`, `ui/select`, `ui/table`)가 실제로 동작 검증되어, 이어지는 04-02~04-07이 각자 다른 금액/게이트/채번 로직을 재발명할 필요 없이 바로 확장할 수 있다.

**PROJ-01·PROJ-02·UX-04는 이 플랜에서 완료 표시하지 않았다** — REQUIREMENTS.md 상 이 요건들은 Phase 4의 형제 플랜들과 공유 선언되어 있고(`requirements.ready-ids` 게이트가 0/3 ready 반환), 이 플랜은 각 요건의 첫 수직 슬라이스만 제공한다(예: PROJ-02의 "연결 문서 있는 견적 줄 취소 처리"는 04-06 몫). 형제 플랜이 마저 채우면 자동으로 ready 판정될 것이다.

**전체 E2E 스위트 간헐적 인프라 실패는 사람이 검토할 것** — `deferred-items.md` 참고, 다음 페이즈 착수 전 확인 권장.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 33 created files verified present on disk (schema, domain, repositories, ui, app routes, tests, this SUMMARY, deferred-items.md). All 3 task commit hashes (`a25d0fb`, `b408f9a`, `ea24b34`) verified present in `git log --oneline --all`.
