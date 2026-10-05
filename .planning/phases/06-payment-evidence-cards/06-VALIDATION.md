---
phase: "06"
slug: "payment-evidence-cards"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-24"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 6` from `06-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is filled by `/gsd-validate-phase` once PLAN.md files exist.
>
> **r3 재계획(2026-10-05 — `06-REVIEWS.md` §2 VALIDATION 행):** 새 플랜 넷(06-26 공용 카드 스키마 · 06-27 06 스키마 · 권한 키 묶음 · 06-28 반려 · 회수 지출결의 종결 · 06-29 Phase 6 공용 조각 컴포넌트)과 Phase 05 실제 경로(`replan/replan-A-05-names.md` §1)를 아래 표에 반영했다. 아래 표의 웨이브(W) 표기는 재조정 뒤 최종 웨이브다(C18 — W1 06-01 · 06-26 / W2 06-02 · 06-27 · 06-29 / W3 06-03 / W4 06-04 · 06-05 · 06-28 / W5 06-06 · 06-07 / W6 06-08 · 06-09 · 06-10 / W7 06-11 · 06-12 · 06-13 / W8 06-14 · 06-15 · 06-18 / W9 06-17 · 06-19 / W10 06-16 · 06-20 · 06-21 / W11 06-22 · 06-23 · 06-25 / W12 06-24). Task 번호 · 테스트 이름은 플랜 확정본이 정본이다(06-25 행은 재조정에서 확정본 이름으로 맞췄다). **Per-Task 지도는 실행 전에 `/gsd-validate-phase 6`으로 새로 채운다** — PR #162(05) main 머지 뒤, 06 플랜 체커 재실행과 같은 때(C15).
>
> **r4 재계획 iter1(2026-10-05 — 체커 W1 · W3 · 교차 X-1~X-11 · 사용자 결정 UC-4~UC-7):** 06-05의 공용 카드 관리 화면 몫을 새 플랜 **06-30**(W3, depends_on 06-26 · 06-27)으로 떼었다(체커 W1). 최종 웨이브 — W1 06-01 · 06-26 / W2 06-02 · 06-27 · 06-29 / **W3 06-03 · 06-30** / W4 06-04 · 06-05 · 06-28 / W5 06-06 · 06-07 / W6 06-08 · 06-09 · 06-10 / W7 06-11 · 06-12 · 06-13 / W8 06-14 · 06-15 · 06-18 / W9 06-17 · 06-19 / W10 06-16 · 06-20 · 06-21 / W11 06-22 · 06-23 · 06-25 / W12 06-24(같은 웨이브 `files_modified` 겹침 0). 새 신호는 아래 「r4 재계획 신호」 표, 06-13 「역순」 케이스는 지웠다(X-4 — 판단 줄로 대체).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest(`[VERIFIED: vitest.config.ts 존재 실측]`) + Playwright(`[VERIFIED: playwright.config.ts 존재 실측]`) |
| **Config file** | `vitest.config.ts` · `playwright.config.ts` (둘 다 리포 루트) |
| **Quick run command** | `pnpm test`(단위→통합→E2E 순, CLAUDE.md 명령 절) |
| **Full suite command** | `pnpm test` + `CI=true pnpm build && pnpm test:e2e`(CLAUDE.md "로컬 dev 통과는 완료 신호가 아니다" 규칙) |
| **Estimated runtime** | RESEARCH.md 미기재 — quick·full 명령이 사실상 동일 범위(단위→통합→E2E)라 별도 fast-loop 추정치 없음 |

**Note:** 통합·E2E는 로컬 DB가 필요하다(`pnpm db:dev`). 완료 판정은 `CI=true` — `playwright.config.ts`가 CI에서만 프로덕션 빌드를 쓴다(CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`(단위→통합→E2E 순, 해당 파일 한정 시 `pnpm vitest run <해당 파일>`)
- **After every plan wave:** Run `pnpm test`(단위→통합→E2E 전체)
- **Before `/gsd-verify-work`:** Full suite must be green — `CI=true pnpm build && pnpm test`
- **Max feedback latency:** RESEARCH.md 미기재 — quick 명령이 이미 통합·E2E까지 포함해 unit-only fast-loop가 없다(Wave 0 완료 후 실측해 갱신 필요)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by `/gsd-validate-phase 6` after plans exist)* | | | | | | | | | ⬜ pending |

### Requirement → signal map (from RESEARCH.md § Validation Architecture § Phase Requirements → Test Map)

| Req ID | Observable signal | Test Type | Automated Command | File Exists |
|--------|-------------------|-----------|-------------------|-------------|
| EXP-06 | 결재 미통과 지출결의는 지급 완료 불가, 지급 완료된 줄은 잠김 | unit(`domain/rules/register.ts` 새 규칙) | `pnpm vitest run test/unit/domain/rules` | ❌ Wave 0 |
| EXP-07 | 카드 사용은 견적줄/견적외비용/팀비용 중 하나 필수, 이중 연결 서버 차단 | integration | `pnpm vitest run test/integration/corp-card-usages` | ❌ Wave 0 |
| EXP-09 | 지급 완료액 역산·차이 표시 | unit(도메인 순수 함수) | `pnpm vitest run test/unit/domain/payments` | ❌ Wave 0 |
| EXP-10 | 구매 요청 문 가르기(협력사 설정값)·신청/구매완료/취소 상태 | integration | `pnpm vitest run test/integration/purchase-requests` | ❌ Wave 0 |
| EXP-13 | 선결제 표시·사유 필수, 14일 초과는 독촉만(처리 안 막음) | unit + integration | `pnpm vitest run test/unit/domain/payments` | ❌ Wave 0 |
| EXP-16 | 경영관리 대리 등록, PM 화면 "경영관리 등록" 표시 | integration | `pnpm vitest run test/integration/corp-card-usages` | ❌ Wave 0 |
| EVID-02 | 증빙 필수 규칙 on/off, 선결제·면제는 예외 | unit | `pnpm vitest run test/unit/domain/rules` | ❌ Wave 0 |
| EVID-03 | 증빙 금액 = 확정 비용(PM 입력 시점), 확인은 검수 표시 | integration(05 `domain/evidence` 확장 — r3 C4 · 증빙 금액 · 증빙일 칸은 06-27 · domain은 06-06, C6) | `pnpm vitest run test/integration/evidence` | ❌ Wave 0(05 `domain/evidence`는 PR #162에 있음 — 05 머지 뒤) |
| EVID-04 | 증빙 떼면 비용이 예상으로 복귀(r3: 승인 뒤에는 떼기가 없어 「무효 처리하면」 — 05 `voidEvidence`, 06-11) | integration | `pnpm vitest run test/integration/evidence` | ❌ Wave 0 |
| PROJ-06 | 완료 전 미결 점검 3종, 강행 허용 설정별 | integration + E2E | `pnpm vitest run test/integration/pre-settle-check` / `pnpm test:e2e` | ❌ Wave 0 |
| EVID-01(카드 몫 — 06-25) | 카드 사용 건에 카드 전표(이미지 · PDF, 폰 사진 축소)를 붙이면 목록 증빙 열 `있음`, 중복은 지출결의 증빙과 한 종류로 막힘, 저장 전 전표는 저장 트랜잭션에서만 묶임 | integration + E2E | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts` / `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts` | ❌ W11 |
| PROJ-06 · EXP-06(종결 — 06-28, r3) | 반려 · 회수 지출결의를 기안자 · 경영관리가 사유와 함께 종결 — 되돌림 · 번호 재사용 없음, 종결 문서는 줄 문(`expenseLineDoor`) · `listNumberedByLines` · 회차 상한(`remainingForInstallments`) · 견적 줄 파생 · 완료 전 점검(D-611) · 「내 차례」 · 홈 막힌 문서에서 빠짐, 로그는 끌 수 없는 종류 | unit + integration + E2E | `pnpm vitest run --project unit test/unit/domain/expense-close.test.ts` · `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-close.test.ts` · `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/expense-close.spec.ts`(파일 이름은 06-28 확정본) | ❌ W4(06-28) |
| EXP-16 · EXP-07(공용 카드 — 06-26 · 06-30 · 06-05, r3 · r4) | 소지자 · 팀 없는 카드 저장 가능(`corp_cards_owner_xor_check` → `corp_cards_owner_at_most_one_check` 완화 — 06-26), 관리자 카드 폼의 공용 카드(06-30), 공용 카드 사용 등록은 `cards.proxy` 권한자만(U-2 — 06-05) | unit + integration + E2E | `pnpm vitest run --project unit test/unit/corp-cards/owner-rule.test.ts` · `pnpm db:dev && pnpm vitest run --project integration test/integration/corp-cards.test.ts test/integration/corp-cards-owner-check.test.ts` · `pnpm db:dev && pnpm vitest run --project integration test/integration/corp-card-usages.test.ts` · `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/corp-cards.spec.ts` | ❌ W1(06-26) · W3(06-30) · W4(06-05 — `corp-card-usages.test.ts` 신규) |

*(앞 10개 행은 06-RESEARCH.md § Validation Architecture § Phase Requirements → Test Map을 그대로 옮김 — 새 테스트를 임의로 추가하지 않음. EVID-01 행은 디자인 검토 반영 r2의 교차 B-2로 더한 06-25 몫이다 — EVID-01은 추적표상 Phase 5 매핑이고 이 페이즈는 「법인카드 건에 첨부」만 진다(r3: 06-24 requirements에도 더함, C16). 마지막 두 행은 r3 새 플랜 몫이다(C8 · C10))*

### 「동시 6건」 — 커넥션 풀 교착 회귀 신호 (plan-eng-review 반영 · ENG E-1 · E-2 · CROSS E-1 · E-2 · E-3)

규약: 「동시 6건」 = `Promise.all` 6건(`DB_POOL_MAX` 기본 5 초과 — `lib/env.ts:54`, 테스트는 `pool.options.max`를 읽는다). 판정 = 10초 제한 안에 모두 끝남 + 결과 정합. 각 플랜은 **RED를 먼저** 본다 — 트랜잭션 전 사전 조회(세율 · 서식 · 권한 · 강행 허용 설정)를 임시로 트랜잭션 콜백 안으로 되돌리면 타임아웃으로 빨갛고, 되돌린 뒤 녹색이다(SUMMARY에 RED · GREEN 한 줄씩). 근거 규약은 06-03 must_haves의 「tx 규약」(global-db-in-tx-audit, PR #75 · #77).

| Plan · Task | Wave | 테스트 이름 | 파일 | Automated Command | 결과 정합 | File Exists |
|-------------|------|-------------|------|-------------------|-----------|-------------|
| 06-03 Task 2 | 3 | 「지급 완료 동시 6건」 | `test/integration/expense-payments-concurrency.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-payments-concurrency.test.ts` | 서로 다른 결재 통과 문서 6건 모두 지급 · 살아 있는 지급 기록 6건 · version 각 +1. PR #75 결정적 재현 꼴(풀 밖 `pg` Client가 행을 먼저 잠그고 `pg_blocking_pids`로 풀 전체가 막힌 것을 확인한 뒤 풂). 06-04 T2 · T3, 06-06 T3, 06-10 T2, 06-13(지급 경로에 견적 줄 잠금을 넣는 플랜 — CROSS-R1 B-1), 06-15 T1이 다시 돌린다 | ❌ W3 |
| 06-08 Task 2 | 6 | 「동시 6건 번호 경합」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "동시 6건 번호 경합"` | 같은 줄 구매 요청 6건 · 서로 다른 번호 6개 | ❌ W6 |
| 06-12 Task 2 | 7 | 「구매 완료 동시 6건」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "구매 완료 동시 6건"` | 하나만 성공 · 다섯 `이미 구매 완료 · 새로 고침` · 카드 사용 1건. 06-25 T2(구매 완료 트랜잭션에 대기 전표 결합을 더하는 플랜)가 다시 돌린다 | ❌ W7 |
| 06-19 Task 1 | 9 | 「기안 동시 6건」 | `test/integration/pre-settle-check.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/pre-settle-check.test.ts -t "기안 동시 6건"` | 막힘 0 프로젝트 6개 기안 모두 끝남 | ❌ W9 |
| 06-22 Task 1 | 11 | 「승인 동시 6건」 | `test/integration/pre-settle-check.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/pre-settle-check.test.ts -t "승인 동시 6건"` | 막힘 0 정산 결재 6건 승인 모두 끝남 | ❌ W11 |

같은 검토에서 나온 동시성 · 멱등 · 사전 조회 신호(동시 6건 아님):

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-04 Task 3 (CROSS R-3) | 「잠금 뒤 게이트 재판정」 | `test/integration/expense-payments.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-payments.test.ts -t "잠금 뒤 게이트 재판정"` | ❌ W4 |
| 06-15 Task 2 (ENG E-5) | 「같은 요청 재전송 → 0건 추가 지급」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "같은 요청 재전송"` | ❌ W8 |
| 06-15 Task 2 (CROSS-R1 F-4 · CHK-R1 W1) | 「목록 지급 총액 = 단건 재계산」 · 「세율 읽기 횟수」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "목록 지급 총액"` · `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "세율 읽기 횟수"`(RS-03 ⒞ — 두 이름을 따로 건다) | ❌ W8 |
| 06-03 Task 1 (ENG E-2 · CROSS E-1) | `loadTaxRates` · `taxRatesReader` 단위(사전 조회 값만 읽고, 없는 기준일은 던진다) | `test/unit/domain/money-tax.test.ts`(기존 파일 확장) | `pnpm vitest run --project unit test/unit/domain/money-tax.test.ts` | ✅ 파일 있음 · 케이스 W3 |
| 06-07 Task 1 (CROSS E-5) | `lockQuoteLinesQuery(...).toSQL()`에 `order by "quote_lines"."id"` + `for update` | `test/unit/repositories/quote-line-links-sql.test.ts`(신규) | `pnpm vitest run --project unit test/unit/repositories/quote-line-links-sql.test.ts` | ❌ W5 |
| 06-13 Task 2 (CROSS-R1 B-1 — RS-03 ⒟ · r4 X-4) | 「카드 사용 등록 ∥ 지출결의 제출」 · 「구매 요청 ∥ 지출결의 제출」 · 「지급 완료 ∥ 같은 줄 새 지출결의 제출」(2건 경합 — 동시 6건 아님). 반대 순서 잠금 케이스는 없다 — 공개 경로가 한 트랜잭션에 줄 하나만 잡아 만들 수 없고, 순서는 06-07 `.toSQL()` 단언(위 06-07 줄)이 고정한다(X-4 판단 · 독립 검토 한 줄) | `test/integration/dual-link-concurrency.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/dual-link-concurrency.test.ts` | ❌ W7 |

### 디자인 검토 반영 신호 (rev 9 — `/plan-design-review` · `design-review.md`@f2720a8)

UI-SPEC rev 9(DR-4 · DR-6 · DR-7 · DR-8 · C-1 · H-2 · H-3 · H-5 · M-1 · M-2 · M-3 · M-7)가 플랜에 내린 신호. 테스트 이름은 플랜 acceptance의 `grep -c` 대상과 같다. `-t`(Vitest) · `-g`(Playwright)는 정규식이라 `+`는 `\\+`로 쓴다. 디자인 교차 검토는 Codex 대신 Opus(한도 2026-09-29까지) (「Codex 재확인」 꼬리표는 U-1로 닫음 — 계획 교차 검토는 Opus, Codex는 디자인 검토에서만).

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-06 Task 3 (DR-4) | 「확인 응답에 새 version」 | `test/integration/evidence-reviews.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-reviews.test.ts -t "확인 응답에 새 version"` | ❌ W5 |
| 06-06 Task 3 (C4 · r2 B-1 — 증빙 지문, 재조정으로 06-17에서 옮김) | 「증빙 지문 다름 → 확인 거부」 | `test/integration/evidence-reviews.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-reviews.test.ts -t "증빙 지문 다름 → 확인 거부"` | ❌ W5 |
| 06-11 Task 1 (B-1 r2) | 「PM 증빙 변경은 문서 version을 올린다」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "PM 증빙 변경은 문서 version을 올린다"` | ❌ W7 |
| 06-11 Task 1 (B-1 r2) | 「PM 증빙 변경 뒤 옛 version 확인 거부」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "PM 증빙 변경 뒤 옛 version 확인 거부"` | ❌ W7 |
| 06-11 Task 1 (X-1 r3) | 「결재 중 문서의 PM 증빙 변경은 version을 올리지 않는다」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "결재 중 문서의 PM 증빙 변경은 version을 올리지 않는다"` | ❌ W7 |
| 06-11 Task 1 (X-1 r3) | 「PM 증빙 즉시 저장 뒤 같은 화면 저장 성공」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "PM 증빙 즉시 저장 뒤 같은 화면 저장 성공"` | ❌ W7 |
| 06-11 Task 3 (X-1 r3) | 「파일 올린 뒤 증빙 금액 저장 → 동시성 문구 없음」 | `test/e2e/evidence-lifecycle.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/evidence-lifecycle.spec.ts -g "파일 올린 뒤 증빙 금액 저장"` | ❌ W7 |
| 06-13 Task 1 (H-4 유지 · r2 W2) | 「보관된 카드 사용 제외」 | `test/integration/quote-line-links.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/quote-line-links.test.ts -t "보관된 카드 사용 제외"` | ❌ W7 |
| 06-15 Task 2 (H-3 · DR-6) | 「막힌 행 고를 수 있음 재판정」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "막힌 행 고를 수 있음 재판정"` | ❌ W8 |
| 06-15 Task 3 (DR-7) | 「행 선택은 checked만」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "행 선택은 checked만"` | ❌ W8 |
| 06-17 Task 1 (r2 F-2) | 「고른 행 상태 일괄 조회」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "고른 행 상태 일괄 조회"` | ❌ W9 |
| 06-17 Task 2 (DR-6 · H-3 · M-2) | 「일괄 결과 알림 · 막힌 행 선택」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "일괄 결과 알림 · 막힌 행 선택"` | ❌ W9 |
| 06-17 Task 2 (H-5) | 「다른 쪽 N건 포함」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "다른 쪽 N건 포함"` | ❌ W9 |
| 06-17 Task 3 (H-2) | 「링크 셀 Enter 열기」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "링크 셀 Enter 열기"` | ❌ W9 |
| 06-17 Task 3 (DR-8) | 「표 안 Ctrl+Enter는 화면 1차」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "표 안 Ctrl\\+Enter는 화면 1차"` | ❌ W9 |
| 06-17 Task 3 (M-1) | 「처리 뒤 쪽 다시 받기」 · 단위 「처리 결과 적용」 · 「되살리기」 | `test/e2e/payment-batch.spec.ts` · `test/unit/ui/table-selectable.test.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "처리 뒤 쪽 다시 받기"` · `pnpm vitest run --project unit test/unit/ui/table-selectable.test.ts` | ❌ W9 |
| 06-17 Task 3 (r2 F-2) | 「다른 쪽 id 유지」 | `test/unit/ui/table-selectable.test.ts` | `pnpm vitest run --project unit test/unit/ui/table-selectable.test.ts -t "다른 쪽 id 유지"` | ❌ W9 |
| 06-17 Task 4 (DR-4 · D-601) | 「증빙 확인 보기 — 권한 · 확인 전만」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "증빙 확인 보기 — 권한 · 확인 전만"` | ❌ W9 |
| 06-17 Task 4 (DR-4 · SP-7) | 「제자리 증빙 확인」(응답 version으로 행 갱신 → 뒤이은 일괄 처리 막힘 0) | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "제자리 증빙 확인"` | ❌ W9 |
| 06-17 Task 4 (r2 B-1) | 「모달 연 뒤 증빙 바뀜 → 새 증빙으로 다시」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "모달 연 뒤 증빙 바뀜 → 새 증빙으로 다시"` | ❌ W9 |
| 06-17 Task 4 (C-1 ②) | 「보관 되살리기」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "보관 되살리기"` | ❌ W9 |
| 06-17 Task 4 (M-3 · S1) | 「확인 직후 Ctrl+Enter 반복 무시」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "확인 직후 Ctrl\\+Enter 반복 무시"`(W10 뒤에는 06-20의 문서 화면 케이스도 함께 돈다) | ❌ W9 |
| 06-20 Task 2 (M-7) | 「계좌 없음 행 고를 수 있음」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "계좌 없음 행 고를 수 있음"` | ❌ W10 |
| 06-20 Task 3 (DR-4 · S3) | 「S3 제자리 증빙 확인」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "S3 제자리 증빙 확인"` | ❌ W10 |
| 06-20 Task 4 (C-1 ④) | 「증빙 필터」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "증빙 필터"` | ❌ W10 |
| 06-20 Task 4 (C-1 ①) | 「다음 확인 전 번호」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "다음 확인 전 번호"` | ❌ W10 |
| 06-20 Task 4 (C-1 ①) | 「문서 화면 왕복 — 지급 대상으로」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "문서 화면 왕복 — 지급 대상으로"` | ❌ W10 |
| 06-20 Task 4 (M-3 · S4) | 「문서 화면 확인 직후 Ctrl+Enter 반복 무시」 | `test/e2e/payment-batch.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/payment-batch.spec.ts -g "문서 화면 확인 직후 Ctrl\\+Enter 반복 무시"` | ❌ W10 |

### 카드 전표 첨부 신호 (06-25 — 디자인 검토 반영 r2 · 교차 B-2 · EVID-01 카드 몫)

UI-SPEC rev 9 S7 · S8 · S9 · S13의 카드 전표 표면과 DR-3(카드 전표 = 지출결의 한 종류, O-6)이 06-25에 내린 신호. 테스트 이름은 06-25 behavior · acceptance의 `describe` · `test` 이름과 같다. 디자인 교차 검토는 Codex 대신 Opus(한도 2026-09-29까지) (「Codex 재확인」 꼬리표는 U-1로 닫음 — 계획 교차 검토는 Opus, Codex는 디자인 검토에서만).

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-25 Task 1 (B-2 · S7 · S9) | 「카드 전표 주인 권리」 | `test/integration/card-usage-evidence.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표 주인 권리"` | ❌ W11 |
| 06-25 Task 1 (B-2 · S8 — 트레이서) | 「수정 패널 전표 첨부 → 목록 있음」 | `test/e2e/card-usage-evidence.spec.ts`(신규) | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "수정 패널 전표 첨부 → 목록 있음"` | ❌ W11 |
| 06-25 Task 2 (S9 첫 저장 · 06-03 tx 규약) | 「첫 저장 — 주인 없는 업로드 없음」 | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "첫 저장 — 주인 없는 업로드 없음"` | ❌ W11 |
| 06-25 Task 2 (S9 · S13 — r3 사용자 카드 2026-10-05: S13 첨부 영역 없음, 저장 뒤 S9에서 첨부) | 「새 건 첫 저장 첨부」 · 「막힌 새 건은 파일을 받지 않는다」 · 「구매 완료 패널에 첨부 영역 없음」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts`(파일 전체) | ❌ W11 |
| 06-25 Task 2 (S7 loading · EVID-01 폰 사진) | 「폰 전표 사진 축소」(폭 390 · `naturalWidth` · `naturalHeight` ≤ 2000) | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "폰 전표 사진 축소"` | ❌ W11 |
| 06-25 Task 3 (DR-3 · O-6) | 「카드 전표 중복 — 지출결의와 한 종류」(06-11 `duplicateScopeKinds` 확장 — 06-11 표가 이미 묶으면 RED 없음) | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표 중복 — 지출결의와 한 종류"` | ❌ W11 |
| 06-25 Task 3 (S9 「삭제 뒤 새로 등록」 · T-06-201) | 「보관 · 되돌리기」(보관 제외 · 겹친 채 되돌리기 거부 — RED 둘) | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "보관 · 되돌리기"` | ❌ W11 |
| 06-25 Task 3 (S7 · D-607 · X-2 r3) | 「카드 전표는 값을 바꾸지 않는다」(X-2 — 모든 지출결의 version 불변 포함) | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표는 값을 바꾸지 않는다"` | ❌ W11 |
| 06-25 Task 3 (S7 zero-one-many) | 「마지막 전표 삭제 확인 창 없음」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "마지막 전표 삭제 확인 창 없음"` | ❌ W11 |
| 06-25 Task 3 (S7 중복 번호 · O-6) | 「카드 패널 중복 번호」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "카드 패널 중복 번호"` | ❌ W11 |
| 06-25 Task 3 (회귀) | 06-11 단위 「조회 가짜의 인자 단언」 · 06-16 `[DR-3]` 통합 · 06-16 Task 2 E2E | `test/unit/domain/evidence-upload-checks.test.ts` · `test/integration/approval-reserve-evidence.test.ts` · `test/e2e/quote-revisions.spec.ts` | `pnpm vitest run --project unit test/unit/domain/evidence-upload-checks.test.ts` · `pnpm db:dev && pnpm vitest run --project integration test/integration/approval-reserve-evidence.test.ts` · `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/approval-reserve-evidence.spec.ts test/e2e/quote-revisions.spec.ts` | ❌ W7(06-11) · W10(06-16) — 06-25 W11에서 다시 돌림 |

### r3 새 플랜 신호 (06-26 ~ 06-29 — `06-REVIEWS.md` C8 · C9 · C10 · C11)

위험 경로 두 플랜(06-26 PR-0 · 06-27 PR-A)은 사용자 머지 PR이고 마이그레이션은 `pnpm db:generate`(번호 예약 없음, 기존 표 CHECK 확장은 NOT VALID + `--custom` VALIDATE 두 파일 — C7). 테스트 이름 · Task 번호는 각 플랜 확정본이 정하고 `/gsd-validate-phase 6`이 이 표를 Per-Task 지도로 옮긴다. 「가칭」 파일은 플랜이 이름을 정한다.

| Plan · Task | 신호 | 파일 | Automated Command | File Exists |
|-------------|------|------|-------------------|-------------|
| 06-26 (risk: db-schema, migration) | 마이그레이션 적용 뒤 소지자 · 팀 둘 다 없는 카드 행 저장 성공 · 둘 다 있는 행은 여전히 거부 · squawk 통과 · 스키마 ↔ 마이그레이션 drift 0 | `db/schema/corp-cards.ts` · `db/migrations/NNNN_*.sql` · `test/integration/corp-cards-shared.test.ts`(가칭) | `pnpm lint:sql` · `pnpm db:dev && pnpm vitest run --project integration test/integration/corp-cards-shared.test.ts` | ❌ W1(06-26) |
| 06-27 (risk: db-schema, migration, permissions) | 새 표 다섯(`expense_payments` · `expense_evidence_reviews` · `corp_card_usages` · `purchase_requests` · `revenue_issue_requests`) · `expenses` 새 칸(선결제 · 증빙 금액 · 증빙일 · 종결 셋) · `files_owner_kind_check` 확장(`quote_revision` · `reserve_entry` · `corp_card_usage`)의 CHECK · unique · FK가 서고 위반 행을 거부 · 메뉴 키 `expenses.payments` · `cards.purchases` · `cards.proxy`가 `MENUS`에 있음 | `db/schema/*` · `db/migrations/NNNN_*.sql` · `domain/permissions/menus.ts` · `test/integration/phase6-schema.test.ts`(가칭) | `pnpm lint:sql` · `pnpm db:dev && pnpm vitest run --project integration test/integration/phase6-schema.test.ts` · `pnpm vitest run --project unit test/unit/permissions` | ❌ W2(06-27) |
| 06-28 (risk: money, approvals) | 「종결 — 반려 · 회수에서만 · 기안자 · 경영관리만 · 사유 필수」 · 「종결 문서는 줄 문 · 회차 상한 · 번호 목록에서 빠짐」(`expenseLineDoor` · `listNumberedByLines` · `remainingForInstallments` 호출부 넷) · 「종결 문서는 미결 점검 · 내 차례 · 홈 막힌 문서에서 빠짐」 · 「종결 로그는 끌 수 없음」(`ALWAYS_ON_ACTION_TYPES`) · 「동시 종결 · 재제출 경합 → 하나만」 · S23 화면(2차 `종결` → 사유 모달 → 상태 `종결`) | `domain/expenses/close.ts`(가칭) · `domain/expenses/line-door.ts` · `domain/money/index.ts` · `ui/status-tag/status-map.ts` · `app/(app)/expenses/actions.ts` · `test/integration/expense-close.test.ts`(가칭) · `test/e2e/expense-close.spec.ts`(가칭) | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-close.test.ts` · `pnpm vitest run --project unit test/unit/ui/status-map.test.ts` · `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/expense-close.spec.ts` | ❌ W4(06-28) |
| 06-29 (컴포넌트 — 새 색 · 서체 · radius 없음) | ① `ListScreen.primaryAction` 버튼 갈래 ② SP-8 = 05 `ui/pick-dialog/PickDialog` 위 검색 고르기(행 막힘 2행 · 현재 줄 · 1차 `이 줄로` Enter · LOADING · EMPTY · ERROR — `ui/confirm-dialog` 새 갈래 없음) ③ 짝 격자 입력(SP-9) ④ `ui/table` selectable 폭 식(`calc(var(--row-number-w) + 2 * var(--cell-pad-x))`) ⑤ SP-7 `attachments` 상태 계약 — 각각 단위 테스트 + `/dev/components` | `ui/list-screen/ListScreen.tsx` · `ui/pick-dialog/PickDialog.tsx`(05) · `ui/table/*` · `test/unit/ui/list-screen.test.ts` · `test/unit/ui/pick-dialog.test.ts`(가칭) · `test/unit/ui/table-selectable.test.ts` | `pnpm vitest run --project unit test/unit/ui/list-screen.test.ts test/unit/ui/pick-dialog.test.ts test/unit/ui/table-selectable.test.ts` · `pnpm lint`(stylelint 토큰) | ❌ W2(06-29 — `list-screen.test.ts`는 있음, 케이스만) |

**05 실제 경로로 바꾼 것(r3 — `replan-A` §1):** 지출결의 목록 `app/(app)/expenses/page.tsx` → `app/(app)/expenses/(list)/page.tsx`(06-15 · 06-17 · 06-20) · 폼 `app/(app)/expenses/expense-form.tsx` → `app/(app)/expenses/[id]/expense-form.tsx`(06-10 · 06-11) · 액션 `app/(app)/expenses/[id]/actions.ts` → `app/(app)/expenses/actions.ts` · `actions.registry.ts` · 증빙 모듈 `domain/expenses/evidence.ts` · `domain/evidence-attachments` · `domain/evidence-reviews/upload-checks.ts` → 05 `domain/evidence/index.ts`(`OWNER_RULES`) · `domain/evidence/upload-checks.ts`(`checkEvidenceUpload`) · 정산 `domain/approvals/settlement.ts` → `domain/settlements/index.ts`(`prepareFinalApproval` · `onFinalApprovalInTx`) · 상태 낱말 `app/(app)/status-display.ts` · `test/unit/status-display.test.ts` → `ui/status-tag/status-map.ts` · `test/unit/ui/status-map.test.ts` · 연결 고르기 `app/(app)/cards/link-picker.tsx` → 05 `ui/pick-dialog/PickDialog` 얇은 래퍼 · 문서 잠금 `lockExpenseRow` → `lockExpenseForUpdate`(`repositories/expenses.ts`) · `sumKrw` · `diffKrw` 신설 → 이미 있음(`test/unit/domain/money.test.ts` — 06-02의 `money-sum-diff.test.ts` 신설 없음). 위 「디자인 검토 반영 신호」의 06-11 다섯 줄(「PM 증빙 변경 …」)은 C4 재설계로 훅이 05 두 경로(`completeEvidenceUpload` · `voidEvidence`) · 확인 기록이 있는 결재 통과 문서만으로 좁아져 이름이 바뀐다 — `/gsd-validate-phase`가 플랜 확정본 이름으로 옮긴다.

### r4 재계획 신호 (iter1 — 계보 X-1 · X-3 · 프로젝트 행 먼저 X-2 · X-5 · X-6 · 사용자 결정 UC-4~UC-7)

테스트 이름은 각 플랜 behavior 원문이다. `/gsd-validate-phase 6`이 이 표를 Per-Task 지도로 옮긴다. 경합 케이스 꼴 = 사전 조회를 끝낸 뒤 바깥 `pg.Client`가 프로젝트 행을 `FOR UPDATE`로 잡고 상태(`completed`)를 바꾸거나 `createRevisionFromCurrent`를 커밋한 다음 몸통을 놓는다.

| Plan · Task | Wave | 신호 | 파일 | Automated Command | File Exists |
|-------------|------|------|------|-------------------|-------------|
| 06-30 Task 1 · 2 (체커 W1 — 06-05에서 뗌) | 3 | 소지자 규칙 표(공용 · 개인 · 팀) · 관리자 카드 폼 공용 카드 저장 · 개인 카드 소지자 없음 거부 · 소유 바꾸기 양방향 · DB `23514` 이중 거부 | `test/unit/corp-cards/owner-rule.test.ts` · `test/integration/corp-cards.test.ts` · `test/e2e/corp-cards.spec.ts` | `pnpm exec vitest run --project unit test/unit/corp-cards/owner-rule.test.ts` · `pnpm db:dev && pnpm exec vitest run --project integration test/integration/corp-cards.test.ts test/integration/corp-cards-owner-check.test.ts` · `pnpm db:reset:test && CI=true pnpm playwright test test/e2e/corp-cards.spec.ts` | ❌ W3 |
| 06-05 Task 2 | 4 | 카드 사용 자격(공용 카드 = `cards.proxy`만 · U-2) — `corp-card-usages.test.ts`를 이 플랜이 만든다(06-07 · 06-09 · 06-12가 케이스를 더함) | `test/integration/corp-card-usages.test.ts`(신규) | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/corp-card-usages.test.ts` | ❌ W4 |
| 06-05 Task 3 (UC-5 · Q-E) | 4 | `cardExecutionCap` 다섯 갈래 — `settled`는 초과여도 통과 | `test/unit/domain/card-usage-amounts.test.ts` | `pnpm exec vitest run --project unit test/unit/domain/card-usage-amounts.test.ts` | ❌ W4 |
| 06-07 Task 1 (X-1 · X-5 · X-6) | 5 | `lineChains`(앞 차수 줄이 현재 줄 사슬에 듦 · 빠진 줄은 후손 → 뿌리) · `purchaseEstimateSupply` 네 규칙(`vat_surcharge` 1,100,000 → 1,000,000 · `none` · `withholding` · `company_borne` → 1,100,000) · `project.line-edit` D-47 ③(`completedOutOfQuote` 참이면 완료 프로젝트 견적 외 비용 줄 추가 통과 · 거짓이면 `완료 · 견적 줄 잠김`) · `card.execution-cap` `settled` 통과 | `test/unit/repositories/quote-line-links-sql.test.ts` · `test/unit/domain/rules-card-dual-link.test.ts` · `test/unit/domain/rules-gate.test.ts`(04 회귀) | `pnpm exec vitest run --project unit test/unit/domain/rules-card-dual-link.test.ts test/unit/repositories/quote-line-links-sql.test.ts test/unit/domain/rules-gate.test.ts` | ❌ W5 |
| 06-07 Task 2 (X-1 · X-2 · X-6 · UC-6 Q-B 열기) | 5 | 계보 네 케이스(앞 차수 카드 → 복사 줄 지출결의 막힘 · 상한에 듦 · 고르기 막힘 · 빠진 줄) · 경합 둘(사전 조회 뒤 완료 전환 → `완료 · 견적 줄 잠김` · 새 차수 커밋 → `견적 새 차수 · 새로 고침`) · 완료 프로젝트 `cards.proxy` 견적 외 비용 등록이 `project.line-edit`을 지나 저장됨(거부 테스트 아님 — 게이트 통과 테스트) | `test/integration/corp-card-usages.test.ts` · `test/integration/quote-lines.test.ts` · `test/integration/quote-line-kinds.test.ts`(04 회귀) | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/corp-card-usages.test.ts test/integration/quote-lines.test.ts test/integration/quote-line-kinds.test.ts` | ❌ W5 |
| 06-08 Task 2 (X-1 · X-2 · X-5) | 6 | 「동시 6건 번호 경합」 바깥 잠금이 프로젝트 행 · 경합 둘 · 앞 차수 줄 카드 → 복사 줄 요청 상한 · `withholding` 거래처 요청 예상 공급가 = 예상 금액 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/purchase-requests.test.ts` | ❌ W6 |
| 06-09 Task 2 · 3 (X-1 · X-2 · UC-6 Q-B 열기) | 6 | 완료 프로젝트 대리 등록 견적 외 비용 수정 · 되돌리기가 `project.line-edit` D-47 ③을 지남 · 대리 등록 권한 없는 사람은 완료 경합에서 거부 · 되돌리기 경합 · 계보 되돌리기 | `test/integration/corp-card-usages-proxy.test.ts` · `test/integration/corp-card-usages.test.ts` | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/corp-card-usages-proxy.test.ts test/integration/corp-card-usages.test.ts` | ❌ W6 |
| 06-12 Task 2 (UC-5 Q-E · X-1 · X-2) | 7 | 완료 프로젝트 구매 완료 초과 → 저장 + 행동 로그 상세 `실행가 초과 {초과액}` + 응답 `capOver` · 완료 아닌 프로젝트 초과 → Q3 막힘 · 사전 조회 뒤 완료 전환 → 통과(완료 판정은 잠근 행) · 앞 차수 줄 요청 구매 완료 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/purchase-requests.test.ts test/integration/corp-card-usages.test.ts` | ❌ W7 |
| 06-13 Task 1 (X-3) | 7 | 「새 차수 복사 줄」 — 지급 완료 줄 복사 뒤 복사 줄 새 지출결의 `지급 완료 {번호} · 새 지출결의 없음` 거부 · 분할 줄 복사 뒤 2회차 상한(400,001 거부 · 400,000 통과) · 폼 회차 글자 `2회차` | `test/integration/quote-line-links.test.ts` | `pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration test/integration/quote-line-links.test.ts test/integration/expense-installment-cap.test.ts` | ❌ W7 |
| 06-13 Task 2 (UC-7 Q-C 풀기) | 7 | 「종결 제외」 — 종결만 이어진 줄 `미착수` · `readonlyReason` null · 금액 저장 통과 · 남은 문서 번호가 이유 | `test/integration/quote-line-links.test.ts` | `pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration test/integration/quote-line-links.test.ts test/integration/quote-revisions.test.ts` | ❌ W7 |
| 06-14 Task 2 (X-1 · X-2) | 8 | 되돌리기 경합(사전 조회 뒤 완료 전환 → `완료 · 견적 줄 잠김`) · 계보(복사 줄 지출결의 → 거부 · 연결 없으면 통과) | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/purchase-requests.test.ts` | ❌ W8 |
| 06-19 Task 2 (X-1) | 9 | 「D-612 계보」 네 케이스 — 앞 차수 카드 · 지출결의가 이어진 복사 줄은 미매칭 아님 · 연결 없는 줄은 최신 차수 행 하나 · 빠진 줄은 행 없음 | `test/integration/pre-settle-check.test.ts` | `pnpm db:dev && pnpm exec vitest run --project integration test/integration/pre-settle-check.test.ts` | ❌ W9 |

### 실행 착수 게이트(M-9) — `/gsd-execute-phase 6` 착수 전

UI-SPEC 「Phase 4·5 의존 가정 (UI)」 「실행 착수 게이트(M-9)」 그대로: S1 · S3 · S4 · S5 · S6 · S14 · S18의 자리와 S1 「문서 화면 왕복」(`from=pay` · 번호 링크)이 아직 없는 Phase 5 UI-SPEC(UA-605~UA-610)에 기댄다. 페이즈 착수 전에 한 번, 그 표면을 만드는 플랜의 Task 1 ⓪에서 다시 본다.

| 게이트 | 확인 명령 · 기록 | 멈춤 신호 | 플랜 줄(「선행 의존(A-6xx)」) |
|--------|------------------|-----------|-------------------------------|
| Phase 5 UI-SPEC 있음 | `git ls-files .planning/phases/05-expense-approval-leave/05-UI-SPEC.md` | 출력이 비었다 | 06-15 「M-9 · UA-605~UA-610」 · 06-17 「M-9 · UA-605 · UA-606」 · 06-19 「M-9 · UA-610」 · 06-20 「M-9 · UA-605」 |
| UA-605~UA-610 대조 완료 | 대조 표(UA 줄마다 Phase 5 UI-SPEC과 같음/다름 · 다르면 어디)를 그 플랜 SUMMARY에 | 어긋난 줄 1 이상 → `선행 의존 M-9 미해소 — 06-UI-SPEC {UA-id} 먼저 고침, {플랜} 착수하지 않음` 출력 · 코드 변경 0 | 위 네 플랜의 Task 1 acceptance ⓪ |
| 05 머지(r3 — C15) | `git ls-files .planning/phases/05-expense-approval-leave/05-13-SUMMARY.md` + 05 심볼 `git grep -n "expenseLineDoor\|lockExpenseForUpdate\|prepareFinalApproval" -- domain repositories` | 출력이 비었다 → 06 실행 착수하지 않음 | 06-01 execution_gate |

---

## Wave 0 Requirements

- [ ] `test/unit/domain/payments/` — 지급 완료액 역산·차이 계산 단위 테스트(EXP-09, EXP-13)
- [ ] `test/unit/domain/rules/` 확장 — 증빙 필수·이중 연결·미결 점검 게이트 규칙 단위 테스트(EXP-06, EVID-02)
- [ ] `test/integration/corp-card-usages.test.ts` — 카드 사용 등록·대리 등록·이중 연결 차단(EXP-07, EXP-16 — r4: 06-05 Task 2가 만들고 06-07 · 06-09 · 06-12가 케이스를 더한다)
- [ ] r4 06-30 공용 카드 관리 — `test/unit/corp-cards/owner-rule.test.ts` · `test/integration/corp-cards.test.ts` · `test/e2e/corp-cards.spec.ts`(위 「r4 재계획 신호」)
- [ ] `test/integration/purchase-requests.test.ts` — 문 가르기·신청/구매완료/취소(EXP-10)
- [ ] `test/integration/evidence.test.ts` — 확인/면제/취소(EVID-03, EVID-04, 05 `domain/evidence` 확장 전제 — PR #162 머지 후 착수, r3 C4)
- [ ] `test/integration/pre-settle-check.test.ts` — 미결 점검 3종 + 강행 허용 키(PROJ-06)
- [ ] `test/integration/leak-scan.test.ts` 확장 — 신규 DTO·액션 등록(기존 파일에 항목 추가, `[VERIFIED: 04.1-01-PLAN.md files_modified에 이미 이 파일이 등장 — 같은 파일을 여러 페이즈가 누적 확장하는 패턴 확인]`)
- [ ] `test/integration/card-usage-evidence.test.ts` · `test/e2e/card-usage-evidence.spec.ts` — 카드 전표 첨부(EVID-01 카드 몫, 06-25 — 디자인 검토 반영 r2 교차 B-2로 더함. 06-25 Task 1이 만든다)
- [ ] r3 새 플랜 테스트 — 06-26 · 06-27 스키마 통합(`lint:sql` 포함) · 06-28 종결 단위 · 통합 · E2E · 06-29 컴포넌트 단위(위 「r3 새 플랜 신호」 — 이름은 플랜 확정본)
- [ ] Framework install: 없음 — 기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| M-9 UA-605~UA-610 대조(Phase 5 UI-SPEC ↔ 06-UI-SPEC) | 실행 착수 게이트(M-9, design-review.md L56@f2720a8) | 두 설계 문서의 라우트 · 필터 이름 · 섹션 순서 · 1차 규칙을 맞대는 문서 대조라 실행 명령이 없다 — 파일 유무만 `git ls-files`로 자동 | 위 「실행 착수 게이트(M-9)」 표대로 실행자가 Task 1 ⓪에서 대조 표를 SUMMARY에 적는다. 어긋나면 멈춘다 |
| A-608-P Phase 5 저장 전 첨부 규약(대기 결합 ⒜ / 저장 뒤 첨부 ⒝ · 결합 함수의 `tx` 인자 · 올린 사람 칸) | EVID-01 카드 몫(06-25 선행 의존) | Phase 5 폼 첨부 코드를 읽어 규약 꼴을 판정하는 일이라 실행 명령이 없다 | 06-25 Task 1 ⓪에서 실행자가 판정과 이름을 SUMMARY에 적는다. ⒝이거나 조건을 못 채우면 코드 변경 0으로 멈추고 06-25 「저장 전 첨부 규약 공백」 두 선택지를 묻는다 |

그 밖의 이 페이즈 동작은 모두 자동 검증이 있다.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A(RESEARCH.md 미기재 — 위 Sampling Rate 참고, Wave 0 이후 실측)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
