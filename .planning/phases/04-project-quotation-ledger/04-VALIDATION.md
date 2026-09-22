---
phase: "04"
slug: "project-quotation-ledger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-21"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: `04-RESEARCH.md` §Validation Architecture (실측 확인된 명령만 적는다).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3계열(project 분리: unit/integration) + Playwright(e2e) |
| **Config file** | `vitest.config.ts`(unit·integration project) · `playwright.config.ts`(e2e) |
| **Quick run command** | `pnpm test:unit` |
| **Full suite command** | `pnpm test` (unit → integration → e2e 순차) |
| **E2E reset command** | `pnpm db:reset:test && CI=true pnpm test:e2e` (한 명령으로 돈다) |
| **Estimated runtime** | unit ~수 초 · 전체 수 분 (실측은 Wave 0에서 기록한다) |

**로컬 dev 통과는 완료 신호가 아니다** — `playwright.config.ts`가 CI에서만 프로덕션 빌드를
쓰므로 완료 판정은 `CI=true`로 한다(CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** `pnpm test:unit` — money·gate·grid 순수 로직은 DB 없이 여기서 대부분 잡힌다
- **After every plan wave:** `pnpm test` (전체)
- **Before `/gsd-verify-work`:** 전체 그린
- **Max feedback latency:** unit 단계 기준 60초

---

## Per-Task Verification Map

계획 완료(13플랜). 아래 표의 각 요구사항을 다루는 플랜을 「Plan」 열에 적었다.

| Requirement | Plan | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|---|
| PROJ-01 | 04-04 · 04-05 · 04-09 · 04-11 | 프로젝트 번호 원자적 증가 · 동시 제출에 중복 없음 | integration | `pnpm vitest run --project integration -t "document counter"` | ❌ W0 |
| PROJ-02 | 04-05 · 04-09 · 04-12 | 견적가·실행가 입력 시 차익을 서버가 계산 · 브라우저 값 미저장 | unit + integration | `pnpm vitest run --project unit -t "quote-lines"` | ❌ W0 |
| PROJ-03 | 04-03 · 04-12 | 계약금액 → 부가세·합계 서버 계산 · 입금액 → 공급가 역산 | unit | `pnpm vitest run --project unit -t "grossFromTotal"` | ❌ W0 |
| PROJ-04 | 04-04 · 04-05 · 04-12 | 상태 전이 게이트(수주중→진행 · 수주중→미수주 · 미수주→진행 · 진행→완료) | unit | `pnpm vitest run --project unit -t "rules.gate"` | ❌ W0 |
| PROJ-05 | 04-09 · 04-11 | 이전 프로젝트·견적 줄 복사와 기본값 채움 | integration | `pnpm vitest run --project integration -t "project copy"` | ❌ W0 |
| PROJ-07 | 04-04 · 04-09 · 04-12 | 고객 승인 전 지출결의·구매 요청 비활성 (게이트 경유) | integration + e2e | `pnpm vitest run --project integration -t "quote approval gate"` | ❌ W0 |
| ADMN-09 | 04-04 | 문서 번호 서식 설정 키 등록·읽힘 | unit | `pnpm vitest run --project unit -t "registry-coverage"` | ✅ 기존 테스트가 새 키를 자동 검사 |
| UX-04 | 04-09 · 04-12 | 잘못된 입력이 서버 검증으로 안내 · 저장 실패·중복 저장·입력값 유실 없음 | integration + e2e | `pnpm vitest run --project integration -t "quote-lines batch save"` | ❌ W0 |
| UX-05 | 04-10 · 04-12 | 키보드만으로 견적 줄 입력(Tab/Enter/방향키/⌘C·V/Esc/⌘S) | e2e | `CI=true pnpm playwright test test/e2e/quote-grid-keyboard.spec.ts` | ❌ W0 |
| RSV-01 | 04-05 · 04-13 | 리저브 입금·출금·잔액 계산 · 음수 잔액 DB 제약 거부 | integration | `pnpm vitest run --project integration -t "reserve ledger"` | ❌ W0 |
| FX-01 | 04-03 · 04-09 | 통화 선택 시 `exchange_rates` 최신 행이 기본값으로 채워짐 | integration | `pnpm vitest run --project integration -t "exchange rate default"` | ❌ W0 |

---

## Wave 0 Requirements

- [ ] `test/unit/money/index.test.ts` + `test/unit/money/tax-rule.test.ts` — `round`/`toKrw`/`splitWithRemainder`/`grossFromTotal`/`applyTaxRule` 단위 테스트(세금 규칙 4종 × 절사 표 기반). D-53의 최소단위 정수 표현을 고정한다. **경로 정정(계획 04-03)**: `vitest.config.ts`의 unit project `include`가 `test/unit/**/*.test.ts`뿐이라 `domain/money/index.test.ts`에 두면 러너가 잡지 않는다(실측). 이 저장소에 코로케이트 테스트는 0건이다
- [ ] `test/unit/rules/gate.test.ts` — 게이트 규칙 단위 테스트. D-56의 `{ allowed, reason, ruleKey }` 반환 형태와 D-43의 수주중 면제를 고정한다. **경로 정정 이유는 위와 같다**
- [ ] **`test/integration/document-counters.test.ts` 갱신 (blocking)** — `test/integration/document-counters.test.ts:40-43`이 `Object.keys(documentCountersRepo).sort()`를 `["findDocumentCounter","upsertDocumentCounter"]`로 **정확히** 단언한다(실측 확인). 원자적 증가 함수를 더하는 커밋이 이 단언을 함께 고치지 않으면 CI가 즉시 빨개진다
- [ ] `test/integration/document-counters.test.ts` — 동시 증가(트랜잭션 2개) 통합 테스트 추가
- [ ] `test/integration/quote-lines-conflict.test.ts` — D-48 조건부 `updatedAt` 충돌 감지
- [ ] `test/e2e/quote-grid-keyboard.spec.ts` — 키보드 전용 시나리오
- [ ] `test/unit/design-tokens-usage.test.ts` — D-61. 사용처 0인 토큰을 잡되 감시 범위는 `app/**` + `ui/**`. `--form-max`가 오늘 RED여야 한다
- [ ] `test/unit/migrate/extract-allowlist.test.ts` — D-57a. 허용목록 밖 표·DB를 만나면 extract가 실패하는지
- [ ] `test/unit/source-column-coverage.test.ts` — D-58. 이전 대상 업무 표가 `source`·`source_id`를 빠뜨리면 잡는다
- [ ] `test/unit/ui/no-raw-datalist.test.ts` — D-83. `app/**`에 자동완성 목록 요소 리터럴이 0개임을 단언한다. 04-07에서 **첫 실행부터 초록**이고(그때 `app/`에 해당 화면이 없다) 04-11·04-12·04-13이 화면을 만들 때 실제로 일한다
- [ ] `test/unit/migrate/transform-schema-parity.test.ts` — B9. 변환 출력 키가 `db/schema/*.ts` 컬럼 이름의 부분집합인지. 04-06이 웨이브 3으로 옮겨진 이유가 이 대조를 실제 파일로 하기 위해서다
- [ ] `test/unit/migrate/planning-leak.test.ts` — N5 · D-57. 커밋되는 `04-06-SUMMARY.md`·`04-VERIFICATION.md`에 실데이터 유래 값이 없음을 단언한다
- [ ] `test/e2e/fixtures.ts` 확장(04-02) — B7. 콘솔 오류·페이지 예외를 자동 수집해 0을 단언하는 `test`. 이 저장소의 37개 스펙 중 그것을 보는 스펙이 **0개**였다(실측). 이 페이즈의 새 스펙 전부가 이것을 쓴다
- [ ] `test/e2e/top-bar-hydration.spec.ts` — B7. 상단 바가 hydration 오류 없이 뜨는지

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| 목록 응답 p99 500ms | PROJ-01 (ROADMAP 기준 1) | 부하 특성이라 단위 테스트로 못 고정한다. 125건 규모에서는 자명하나 수치가 기준에 못박혀 있다 | 시드된 개발 DB에서 목록 화면을 재고 결과를 `04-VERIFICATION.md`에 적는다 |
| 엑셀 붙여넣기가 실제 스프레드시트에서 온 TSV로 동작 | UX-05 | Playwright의 합성 클립보드가 실제 Excel·Google Sheets의 TSV 형태와 다를 수 있다 | 실제 시트에서 범위를 복사해 견적 줄 표에 붙여넣는다 |
| transform의 `amount_basis` 판정이 실데이터에서 맞는지 | ROADMAP 기준 7 | 실데이터가 public 레포 밖에 있어 CI가 볼 수 없다(D-57) | 로컬에서 `PLANT8_INTRANET_BACKUP_260915` 덤프로 돌리고 보고서를 눈으로 본다. 보고서는 커밋하지 않는다. **`04-06-SUMMARY.md`·`04-VERIFICATION.md`에는 판정(맞다/틀리다)과 규칙 이름만 적고 값·건수·금액을 적지 않는다** — `test/unit/migrate/planning-leak.test.ts`가 그것을 강제한다(N5) |
| 스테이징 배포 후 검증 | D-86 · ROADMAP 기준 1·4·6 | **이 컨테이너는 프록시가 `*.run.app`을 403으로 막아 실행할 수 없다.** 안 도는 것을 자동 태스크로 적으면 실행자가 습관적으로 건너뛴다 — 그래서 p99·TSV와 같은 수동 항목으로 둔다(D-86) | 웨이브 6이 끝난 뒤 `/ship` **전에** 스테이징에 배포하고 5분/1시간 두 시점에 확인한다: ① 마이그레이션 Job이 표 다섯을 만들고 CHECK·부분 UNIQUE 인덱스가 실제로 섰는지 ② 코드표 상태 항목이 정확히 넷인지 ③ 프로젝트 등록 → 번호 부여 → 목록 합계가 화면에서 맞는지 ④ 다차수 프로젝트의 합계가 배수가 아닌지(B1) ⑤ 리저브 출금 거부 문구가 §8-3 형식인지 ⑥ 상단 바에서 콘솔 오류가 0건인지(B7) ⑦ 구/신 리비전 공존 창에서 구코드 화면이 깨지지 않는지. 결과를 `04-VERIFICATION.md`에 항목별 통과/불통과로 적는다 — **값은 적지 않는다**(D-57 · N5). 근거: Phase 3에서 사용자가 결함 3건을 스테이징에서 먼저 찾았고 그 공백이 여기다 |
| `project_status` 재시드 롤백 절차 | D-86 · D-63 | 실제 Cloud SQL 되돌림을 이 컨테이너에서 실행할 수 없고, 되돌림은 장애 시에만 도는 경로라 상시 자동화 대상이 아니다 | 이 페이즈의 **유일한 비가산 단계**다 — 표 다섯 생성은 가산적이지만 코드표 재시드는 기존 다섯 행 중 겹치지 않는 넷을 건드린다(D-63 · 04-05 Task 1). `04-VERIFICATION.md`에 절차를 단계로 적는다: ① 재시드가 그 넷을 어떻게 처리했는지(삭제/보관/방치 중 04-05가 고른 것)와 값 목록 ② 이전 리비전으로 트래픽을 되돌린 뒤 구코드 `pnpm db:seed`가 그 넷을 자동 복구하는지, 아니면 수기 단계가 필요한지 ③ 자동 복구되는 경우 **중복이 생기지 않음**을 무엇으로 확인하는지(`seedCodeItem`의 멱등성과 그 근거 좌표). 스테이징 검증과 같은 자리에서 사람이 한 번 읽고 확인한다 |

---

## Validation Sign-Off

- [x] 모든 태스크에 `<automated>` verify가 있다 — 37개 태스크 전부
- [x] 샘플링 연속성: 자동 검증 없는 태스크가 0개다
- [x] Wave 0가 MISSING 참조를 전부 덮는다 — 각 테스트 파일이 그것을 쓰는 플랜의 태스크에서 「먼저 만든다(RED 확인)」로 생성된다
- [x] watch 모드 플래그 없음 — 전부 `vitest run` · `playwright test`
- [x] 피드백 지연 < 60s (unit 단계)
- [x] `nyquist_compliant: true`

**추가 제약 넷(계획 단계 실측 + CEO 심층 검토 반영)**
1. **RTL이 없다.** unit project가 `environment: "node"`이고 `@testing-library/react`가 미설치이며 D-45가 새 의존성 0을 요구한다. 그래서 컴포넌트 검증을 ① 순수 모듈로 뽑아 진짜 단위 테스트 ② 렌더 문자열·CSS는 소스 단언(`toast-timer.test.ts`·`system-md-compliance.test.ts` 선례) ③ 실제 DOM은 `CI=true` E2E 셋으로 갈랐다. 04-08·04-10이 계약의 무게를 의도적으로 순수 모듈(`column-fold.ts` · `grid-keys.ts` · `tsv.ts`)로 옮긴 이유가 이것이다
2. **테스트 파일은 전부 `test/` 아래다.** 코로케이트 테스트가 이 저장소에 0건이고 unit project의 `include`가 그것을 잡지 않는다
3. **`db/migrations/`를 건드리는 플랜은 04-05 하나다.** 같은 웨이브의 두 플랜이 `pnpm db:generate`를 돌리면 파일 번호가 충돌한다
4. **04-06은 웨이브 3이다**(CEO 심층 검토 B9). 파일 공유는 0이지만 변환 출력이 04-05의 실제 컬럼 모양과 04-03의 실제 시그니처에 맞아야 하고, 04-05 Task 2가 그 컬럼 모양들을 실행자 재량으로 남겼기 때문에 플랜 마크다운을 읽는 것으로는 맞출 수 없다. 웨이브 3의 폭은 넷(06·07·08·09)이고 웨이브 2의 다섯을 넘지 않는다

**Approval:** approved — 13플랜 전부에 `<automated>` verify 존재 확인(2026-09-22)
