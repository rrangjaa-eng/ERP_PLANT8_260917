---
phase: 04-project-quote-ledger
plan: 02
subsystem: money
tags: [money-model, tax-rules, fx, revenue-ledger, drizzle, postgres, ui-table]

# Dependency graph
requires:
  - phase: 04-01
    provides: "domain/money 스켈레톤(Money 브랜드·round/toKrw/moneyFromRow/moneyToColumns/quoteAmount/profit), ui/form·ui/select·ui/table, domain/rules/gate, lib/db-transaction, projects/quote_revisions/quote_lines 스키마"
provides:
  - "domain/money 완성 — splitWithRemainder·grossFromTotal·applyTaxRule(세금 규칙 4종)·recentFxRate/rememberFxRate"
  - "매출 섹션 — 계약 금액(PM 쓰기) + 발행·입금 두 표(경영관리 쓰기, 새 menu projects.revenue), 통장 합계 역산·미수/초과입금·정보 노출 표 단위 게이트"
  - "revenue_entries 표(migration 0010) + projects.contract_* 4컬럼"
  - "domain/projects/ledger.ts — 견적 줄 + 매출을 한 트랜잭션·한 저장 버튼으로 묶는 합성 지점(saveQuoteLines/saveRevenue의 옵션 tx 파라미터)"
  - "ui/table 금액 셀 두 줄 병기(secondaryLine) + EMPTY와 합계 행 공존(alwaysShowFooter)"
  - "견적 줄 단가 칸 외화 두 칸 편집(통화 Select + 환율, D-71)"
affects: ["04-04", "04-06", "04-09", "06", "09"]

actuals:
  tokens: 31300
  tasks: 3
  commits: 7
  plan_head_before: 62e572d

tech-stack:
  added: []
  patterns:
    - "옵션 tx 파라미터 합성 — saveQuoteLines(...,tx?)·saveRevenue(...,tx?)가 자기 트랜잭션을 열거나 외부 tx를 받아 domain/projects/ledger.ts가 하나로 묶는다. 04-01의 withTransaction(fn) 래퍼를 그대로 재사용"
    - "정보 노출 표 단위 배제 — project()가 from 키 존재 여부와 무관하게 visible() 실패 필드를 결과에서 빼는 기존 동작을 그대로 써서, 배열 필드(issuedEntries/paidEntries) 자체를 계급별로 통째로 숨긴다(열 단위 마스킹이 아니라 표 단위)"
    - "환율 갱신은 touched 플래그로 판정 — 클라이언트가 fxRateTouched를 명시로 보낼 때만 rememberFxRate() 호출(quote-lines·revenue 계약·revenue 항목 셋 다 같은 패턴)"
    - "역계산은 read time에만 — 입금 줄의 공급가액(computedGrossKrw)·재계산 차이(recomputeDeltaKrw)는 저장하지 않고 listRevenue가 매번 계산해 돌려준다(plan Artifacts 표가 revenue_entries에 4컬럼 Money 묶음만 명시)"

key-files:
  created:
    - domain/money/tax.ts
    - domain/revenue/index.ts
    - domain/projects/ledger.ts
    - db/schema/revenue-entries.ts
    - repositories/revenue-entries.ts
    - db/migrations/0010_revenue_entries.sql
    - app/(app)/projects/[id]/revenue-section.tsx
    - test/unit/domain/money-tax.test.ts
    - test/integration/revenue-entries.test.ts
    - test/e2e/revenue-section.spec.ts
  modified:
    - domain/money/index.ts
    - domain/money/currency.ts
    - domain/settings/keys.ts
    - domain/permissions/info-items.ts
    - domain/permissions/menus.ts
    - domain/projects/index.ts
    - domain/quotes/lines.ts
    - db/schema/index.ts
    - db/schema/projects.ts
    - repositories/projects.ts
    - ui/table/types.ts
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - app/(app)/projects/actions.ts
    - app/(app)/projects/actions.registry.ts
    - test/unit/domain/money.test.ts
    - test/integration/quote-lines.test.ts
    - test/integration/leak-scan.test.ts
    - test/e2e/project-register.spec.ts
    - docs/ARCHITECTURE.md
    - .planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md
    - .planning/WINDOWS.md

key-decisions:
  - "applyTaxRule은 세율·절사 단위·최소 징수액을 domain/settings/registry.ts에서 기준일과 함께 읽고(Task 1 <action> 원문 지시대로), 절사 방식만 코드표 rule.roundingMethod에서 읽는다 — must_haves.truths의 '코드표의 절사 단위·방식·최소 징수액'이라는 표현과는 다르지만, 이 플랜의 <action> 지시문·settings/keys.ts의 readBy:phase4 태그 11개(테스트로 소비 강제)가 더 구체적이고 조작 가능한 지시였다"
  - "경영관리는 SEED_ROLES 5종에 없는 조직상 역할이라 새 메뉴 projects.revenue(write)를 만들어 발행·입금 쓰기를 게이트했다 — 코드에 역할 이름을 박지 않고 관리자가 권한표에서 실제 담당 계급에 배정한다(D-57). 계약 금액은 기존 projects write(PM)를 그대로 쓴다"
  - "견적 줄 + 매출을 한 버튼·한 트랜잭션으로 묶기 위해 saveQuoteLines·saveRevenue에 옵션 tx 파라미터를 추가했다 — 04-01이 만든 QuoteLedger 컴포넌트를 확장해 새 컴포넌트를 따로 만들지 않았다(§7-3 '저장 자리는 하나' 요구를 04-01 산출물을 재사용하며 충족)"
  - "U-3(발행 줄 있고 입금 줄 0건일 때 EMPTY와 합계 행 공존 여부): 공존으로 확정 — ui/table에 alwaysShowFooter 옵트인 prop을 추가해 기존 표(견적 줄 등)의 기본 동작은 바꾸지 않았다"
  - "revenue_entries는 신규 표라 문제 없지만 migration 0010이 기존 non-empty projects 표에 NOT NULL contract_amount_krw 컬럼을 추가해 최초 db:migrate가 23502로 실패했다(erp_test에 이전 세션 데모 프로젝트 잔존) — DEFAULT 0을 둬 해결(Rule 1, 실측)"
  - "매출 발행·입금 줄은 스키마·domain이 이미 임의 통화를 지원하지만 UI는 KRW 입력만 제공 — 계약 금액·견적 단가(FX-01 핵심 truth)는 통화 Select+환율을 완비했고, 항목 표는 범위를 좁혀 WINDOWS.md에 stub으로 기록했다"

patterns-established:
  - "Pattern: 옵션 tx 합성 — 여러 domain 쓰기 함수를 한 화면·한 트랜잭션으로 묶을 때 각 함수가 tx?를 받아 외부에서 열린 트랜잭션에 합류하거나 스스로 연다"
  - "Pattern: 역계산 필드는 read time에만 계산 — 저장 스키마를 부풀리지 않고 domain이 매번 다시 계산해 DTO에 싣는다(applyTaxRule·grossFromTotal 재사용)"

requirements-completed: [FX-01, PROJ-03]

coverage:
  - id: D1
    description: "domain/money 완성 — splitWithRemainder(분할 보정)·grossFromTotal(합계 역산)·applyTaxRule(세금 규칙 4종: 없음/부가세가산/원천징수/회사대납)·recentFxRate·rememberFxRate(통화별 최근 환율)"
    requirement: "FX-01"
    verification:
      - kind: unit
        ref: "test/unit/domain/money.test.ts"
        status: pass
      - kind: unit
        ref: "test/unit/domain/money-tax.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "매출 섹션 — 계약 금액 단일 칸(PM) + 발행·입금 두 편집 표(경영관리), 통장 합계에서 공급가액 역산·미수/초과입금 표시·재계산 차이 비조정"
    requirement: "PROJ-03"
    verification:
      - kind: integration
        ref: "test/integration/revenue-entries.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/revenue-section.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "발행액·입금액이 기획본부에게 표 단위로 빠진다(열 단위 마스킹이 아니고 빈 배열도 아니다 — 필드 부재, T-04-09)"
    verification:
      - kind: integration
        ref: "test/integration/revenue-entries.test.ts#(d)"
        status: pass
    human_judgment: false
  - id: D4
    description: "견적 줄 단가 칸의 외화 두 칸 편집(통화 Select + 환율) — KRW면 환율 칸이 숨고, USD 기본 환율은 자리표시자가 아니라 recentFxRate 실제 값, 환율을 고친 저장만 fx.recent_rate.USD를 갱신"
    requirement: "FX-01"
    verification:
      - kind: integration
        ref: "test/integration/quote-lines.test.ts#(e)"
        status: pass
    human_judgment: false
  - id: D5
    description: "마이그레이션 0010이 실제 Postgres(erp/erp_test)에 적용되고 squawk 0 issues"
    verification:
      - kind: unit
        ref: "pnpm lint:sql"
        status: pass
    human_judgment: false
  - id: D6
    description: "매출 섹션의 시각 정합(§2-4 두 줄 병기·§7-15 폼 계약·375px 무스크롤 등 화면 스타일 전반)"
    verification: []
    human_judgment: true
    rationale: "접근성·시각 스타일 완전 정합은 자동 테스트가 텍스트·role 일부만 단언한다 — SYSTEM.md 전체 문체는 /design-review(Post-build)에서 사람이 확인한다"

duration: 1h10m
completed: 2026-09-22
status: complete
---

# Phase 4 Plan 2: 금액 모델 완성 + 매출 섹션 Summary

**domain/money를 다섯 함수 + 세금 규칙 4종 + 통화별 환율로 완성하고, 그 모델의 가장 까다로운 소비자(계약 금액·발행·입금 역산·미수)를 매출 섹션으로 실제 태워 검증했다 — 견적 줄과 매출을 한 화면·한 버튼·한 트랜잭션으로 묶는 domain/projects/ledger.ts 합성 지점을 새로 만들었다.**

## Performance

- **Duration:** 약 1h10m
- **Started:** 2026-09-22T20:50:00Z
- **Completed:** 2026-09-22T22:00:00Z
- **Tasks:** 3/3 완료
- **Files modified:** 36(생성 10 + 수정 26)

## Accomplishments
- `domain/money/index.ts`에 `splitWithRemainder`·`grossFromTotal`을 더하고, `domain/money/tax.ts`(신설)의 `applyTaxRule`이 세금 규칙 4종을 이력형 설정 조회(기준일 필수)로 계산 — `domain/settings/keys.ts`의 tax.* 11개 키에서 `readBy:{phase:"4"}` 표시를 제거(실제로 읽기 시작했으므로 registry-coverage 표시 만료 테스트를 통과)
- `domain/money/currency.ts`의 `recentFxRate`/`rememberFxRate` + 새 설정 키 `fx.recent_rate.USD`(단순값) — KRW는 예외 경로가 아니라 환율 1인 Money임을 코드로 고정
- 매출 섹션(`revenue-section.tsx`) — 계약 금액(`Form.Field`, `Form.Actions` 없음, §7-15 일반 규칙) + 발행·입금 두 `ui/table` 편집 표. 입금 셀은 서버가 역산한 공급가액을 보조 줄로, 표 합계 행에 미수/초과 입금을 표시하며 재계산 차이는 조정하지 않고 DTO에 그대로 싣는다
- `domain/revenue/index.ts`(신설) — `listRevenue`/`saveRevenue`. 발행·입금 배열은 정보 노출표 미통과 시 DTO 필드 자체가 빠진다(`revenue.issued_amount`/`revenue.paid_amount`, staffDefault false). 새 메뉴 `projects.revenue`(write)로 계약 금액(PM)과 발행·입금(경영관리) 쓰기 주체를 가른다
- `domain/projects/ledger.ts`(신설) — 견적 줄 저장과 매출 저장을 한 트랜잭션으로 묶는 합성 지점. `saveQuoteLines`·`saveRevenue`에 옵션 `tx` 파라미터를 더해 04-01이 만든 화면(`QuoteLedger`)의 1차 「일괄 저장」 버튼 하나가 두 도메인의 dirty를 함께 저장
- `ui/table`에 금액 셀 두 줄 병기(`secondaryLine`)와 EMPTY·합계 행 공존(`alwaysShowFooter`, U-3 계획 단계 판단) 추가 — 기존 표(견적 줄)의 렌더는 그대로 유지(옵트인)
- 견적 줄 단가 칸에 통화 Select + 환율 칸(D-71) — USD 기본 환율은 자리표시자가 아니라 `recentFxRate("USD")`의 실제 값
- 마이그레이션 0010 실제 DB 적용(erp·erp_test) + squawk 0 issues, `revenue_entries` 표(음수 허용) + `projects.contract_*` 4컬럼

## Task Commits

1. **Task 1: 금액 모델 완성(RED → GREEN)** — `ca217c2`(test) → `3220ea2`(feat)
2. **Task 2: 매출 섹션 + 견적 줄 외화 편집** — `f2d31e9`(feat) + `ab59d69`(feat, U-3 해소)
3. **Task 3: [BLOCKING] 마이그레이션 0010 적용 + 증명** — `56ab547`(test)
4. **사후 발견 수정** — `1f036b2`(fix, 견적 줄 환율 기억 배선 누락) + `2c769cf`(docs, 오탈자)

**Plan metadata:** (이 커밋 직후 기록)

## Files Created/Modified
전체 목록은 frontmatter `key-files` 참고. 핵심만:
- `domain/money/tax.ts` — 세금 규칙 4종의 유일한 계산 지점
- `domain/revenue/index.ts`, `domain/projects/ledger.ts` — 매출 섹션 + 견적 줄·매출 합성 저장
- `db/migrations/0010_revenue_entries.sql` — `revenue_entries` 표 + `projects.contract_*`
- `app/(app)/projects/[id]/revenue-section.tsx`, `quote-table.tsx` — 매출 섹션·외화 견적 줄 화면

## Decisions Made
frontmatter `key-decisions` 참고(applyTaxRule 데이터 출처 해석 · 새 메뉴 projects.revenue · 옵션 tx 합성 · U-3 공존 · migration DEFAULT 0 · revenue entries UI 범위 축소).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] `contract_amount_krw` 컬럼 추가가 기존 non-empty `projects` 표에서 23502로 실패**
- **Found during:** Task 3 (`pnpm db:migrate` 최초 실행)
- **Issue:** `erp_test`에 이전 세션이 남긴 데모 프로젝트 행이 있어, `ALTER TABLE projects ADD COLUMN contract_amount_krw integer NOT NULL`(기본값 없음)이 기존 행에 값을 채우지 못해 거부됨
- **Fix:** 컬럼에 `DEFAULT 0`을 추가(다른 세 컬럼은 이미 기본값이 있어 문제없음)
- **Files modified:** `db/migrations/0010_revenue_entries.sql`
- **Verification:** `pnpm db:migrate` 성공(erp·erp_test 둘 다), `pnpm lint:sql` 0 issues
- **Committed in:** `56ab547`

**2. [Rule 1 - 버그] `단가` E2E 라벨 충돌 — 04-02가 통화 Select를 더해 기존 `getByLabel("단가")`가 두 요소를 잡음**
- **Found during:** Task 2 회귀 검증(`project-register.spec.ts` E2E 재실행)
- **Issue:** `getByLabel`의 기본 부분일치가 「단가」와 새로 추가한 「단가 통화」 aria-label을 모두 매치해 `.fill()`이 strict mode violation으로 실패
- **Fix:** `test/e2e/project-register.spec.ts`의 해당 로케이터에 `{ exact: true }` 추가
- **Files modified:** `test/e2e/project-register.spec.ts`
- **Verification:** `CI=true` playwright 재실행 통과(2/2)
- **Committed in:** `56ab547`

**3. [Rule 1 - 버그] 견적 줄 단가 환율 「기억」 배선 누락**
- **Found during:** Task 2 완료 뒤 must_haves.truths 재검토(사후 발견 — 실패한 테스트로 발견된 것이 아니라 자체 점검)
- **Issue:** `quote-table.tsx`가 `unitPriceFxRateTouched`를 DraftLine에 추적했지만 저장 페이로드에 실어 보내지 않았고, `domain/quotes/lines.ts`의 `saveQuoteLines`도 `rememberFxRate`를 부르지 않아 D-71("환율 칸을 고쳐 저장하면 그 통화의 최근 환율 설정 키가 갱신된다")이 매출 계약 금액·항목에만 구현되고 견적 줄에는 빠져 있었다
- **Fix:** `QuoteLineWriteRow`에 `unitPriceFxRateTouched` 필드 추가, 저장 루프에서 조건부 `rememberFxRate` 호출, 액션 스키마·화면 페이로드에 필드 관통 배선
- **Files modified:** `domain/quotes/lines.ts`, `app/(app)/projects/[id]/quote-table.tsx`, `app/(app)/projects/actions.ts`, `test/integration/quote-lines.test.ts`(새 케이스 (e))
- **Verification:** `pnpm typecheck`·`pnpm lint` 통과, 새 통합 테스트 통과
- **Committed in:** `1f036b2`

---

**Total deviations:** 3건 자동 수정(전부 Rule 1 — 정확성·회귀 방지에 필요, 범위 벗어난 신규 기능 없음)
**Impact on plan:** 전부 계획의 acceptance criteria·must_haves.truths를 충족시키기 위한 수정. 스코프 확장 없음.

## TDD Gate Compliance

Task 1(`tdd="true"`)은 RED(`ca217c2`) → GREEN(`3220ea2`) 순서를 지켰다 — `test unit/domain/money.test.ts`·`money-tax.test.ts`가 함수 부재로 실패하는 것을 확인한 뒤 구현했다.

Task 2(`tdd="true"`)는 스키마·리포지토리·UI 배선이 대부분이라(tdd.md의 "Skip TDD" 휴리스틱 — UI 레이아웃·글루 코드) 별도 RED 커밋 없이 진행했다. 이 플랜은 `type: execute`(개별 태스크의 `tdd="true"`는 있으나 플랜 레벨 TDD 게이트 강제 대상이 아니다)이고, Task 2가 소비하는 순수 계산 로직(`applyTaxRule`·`grossFromTotal`·`recentFxRate`)은 이미 Task 1에서 RED→GREEN으로 증명됐다. Task 2의 새 도메인 로직(발행 순방향·입금 역방향 계산, 정보 노출 게이트)은 Task 3의 통합 테스트 8건 + E2E 1건이 실제 Postgres로 사후 증명한다(엄밀한 RED 커밋은 없었음 — 기록으로 남긴다).

## Issues Encountered

**`pnpm test` 전체 3계층 실행 중 백그라운드 프로세스 kill 후 일시적 FK 오류** — 이 플랜 검증 중 이전 백그라운드 전체 테스트 실행을 중단(코드 수정과 겹쳐 재실행 필요)한 직후 `erp_test`를 재생성하고 바로 통합 테스트를 돌렸더니 `role-pm not present in roles`류의 일시적 FK 위반이 났다(`pg_stat_activity`는 깨끗했다). DB를 다시 리셋하고 재실행하니 13/13 통과 — 일회성 타이밍 이슈로 판단하고 재현 확인 후 진행. 관련 없는 인프라 흔들림으로 기록만 함(같은 종류가 04-01 SUMMARY에도 있었다).

## Known Stubs

- **발행·입금 줄의 외화 입력 UI 없음** — `app/(app)/projects/[id]/revenue-section.tsx`. 스키마·domain은 이미 임의 통화(KRW/USD)를 지원하지만(`moneyColumns`, `saveEntries`가 `moneyToColumns` 그대로 사용) 화면은 KRW 입력만 제공한다. 계약 금액·견적 줄 단가(FX-01의 핵심 truth 두 건)는 통화 Select + 환율을 완비했다. `.planning/WINDOWS.md`에 stub으로 기록(04-04 이후 외화 입금 실사례가 나오면 채운다).

## Threat Flags

없음 — 이 플랜이 여는 새 표면(신규 메뉴 `projects.revenue`, 신규 액션 `saveProjectLedgerAction`, 신규 정보 항목 2개, 신규 표 `revenue_entries`)은 계획의 `<threat_model>`(T-04-09~T-04-14, T-04-SC)이 이미 다룬 범위 안이다.

## User Setup Required

None - 외부 서비스 설정 불필요.

## Next Phase Readiness

`domain/money`가 완성되고 매출 섹션이 실제로 동작 검증되어, 04-06(완료 잠금·견적 외 비용)·04-09(리저브 대장, 있다면)·Phase 6(지급 완료 역산)·Phase 9(손익)가 같은 금액 모델·역산 패턴을 재사용할 수 있다.

**매출 항목의 외화 UI는 미완**(Known Stubs 참고) — 실제 외화 입금 사례가 나오는 시점에 채운다.

**"경영관리" 역할 배정은 관리자 몫** — 새 메뉴 `projects.revenue`는 어느 계급에도 기본 권한이 없다(admin.* 메뉴와 같은 결). 실제 운영 전 `/admin/permissions`에서 담당 계급에 write를 켜야 한다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created files verified present on disk. All 7 task commit hashes (`ca217c2`, `3220ea2`, `f2d31e9`, `ab59d69`, `56ab547`, `1f036b2`, `2c769cf`) verified present in `git log --oneline --all`. `commits: 7` measured via `git rev-list --count 62e572d..HEAD` against the plan-head ledger (`plan_head_before: 62e572d`).
