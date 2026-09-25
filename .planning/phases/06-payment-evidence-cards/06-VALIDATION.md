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
| EVID-03 | 증빙 금액 = 확정 비용(PM 입력 시점), 확인은 검수 표시 | integration(Phase 5 증빙 모듈 확장) | `pnpm vitest run test/integration/evidence` | ❌ Wave 0(Phase 5 파일 자체가 아직 없음) |
| EVID-04 | 증빙 떼면 비용이 예상으로 복귀 | integration | `pnpm vitest run test/integration/evidence` | ❌ Wave 0 |
| PROJ-06 | 완료 전 미결 점검 3종, 강행 허용 설정별 | integration + E2E | `pnpm vitest run test/integration/pre-settle-check` / `pnpm test:e2e` | ❌ Wave 0 |
| EVID-01(카드 몫 — 06-25) | 카드 사용 건에 카드 전표(이미지 · PDF, 폰 사진 축소)를 붙이면 목록 증빙 열 `있음`, 중복은 지출결의 증빙과 한 종류로 막힘, 저장 전 전표는 저장 트랜잭션에서만 묶임 | integration + E2E | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts` / `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts` | ❌ W10 |

*(앞 10개 행은 06-RESEARCH.md § Validation Architecture § Phase Requirements → Test Map을 그대로 옮김 — 새 테스트를 임의로 추가하지 않음. 마지막 EVID-01 행은 디자인 검토 반영 r2의 교차 B-2로 더한 06-25 몫이다 — EVID-01은 추적표상 Phase 5 매핑이고 이 페이즈는 「법인카드 건에 첨부」만 진다)*

### 「동시 6건」 — 커넥션 풀 교착 회귀 신호 (plan-eng-review 반영 · ENG E-1 · E-2 · CROSS E-1 · E-2 · E-3)

규약: 「동시 6건」 = `Promise.all` 6건(`DB_POOL_MAX` 기본 5 초과 — `lib/env.ts:54`, 테스트는 `pool.options.max`를 읽는다). 판정 = 10초 제한 안에 모두 끝남 + 결과 정합. 각 플랜은 **RED를 먼저** 본다 — 트랜잭션 전 사전 조회(세율 · 서식 · 권한 · 강행 허용 설정)를 임시로 트랜잭션 콜백 안으로 되돌리면 타임아웃으로 빨갛고, 되돌린 뒤 녹색이다(SUMMARY에 RED · GREEN 한 줄씩). 근거 규약은 06-03 must_haves의 「tx 규약」(global-db-in-tx-audit, PR #75 · #77).

| Plan · Task | Wave | 테스트 이름 | 파일 | Automated Command | 결과 정합 | File Exists |
|-------------|------|-------------|------|-------------------|-----------|-------------|
| 06-03 Task 2 | 2 | 「지급 완료 동시 6건」 | `test/integration/expense-payments-concurrency.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-payments-concurrency.test.ts` | 서로 다른 결재 통과 문서 6건 모두 지급 · 살아 있는 지급 기록 6건 · version 각 +1. PR #75 결정적 재현 꼴(풀 밖 `pg` Client가 행을 먼저 잠그고 `pg_blocking_pids`로 풀 전체가 막힌 것을 확인한 뒤 풂). 06-04 T2 · T3, 06-06 T3, 06-10 T2, 06-13(지급 경로에 견적 줄 잠금을 넣는 플랜 — CROSS-R1 B-1), 06-15 T1이 다시 돌린다 | ❌ W2 |
| 06-08 Task 2 | 5 | 「동시 6건 번호 경합」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "동시 6건 번호 경합"` | 같은 줄 구매 요청 6건 · 서로 다른 번호 6개 | ❌ W5 |
| 06-12 Task 2 | 7 | 「구매 완료 동시 6건」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "구매 완료 동시 6건"` | 하나만 성공 · 다섯 `이미 구매 완료 · 새로 고침` · 카드 사용 1건. 06-25 T2(구매 완료 트랜잭션에 대기 전표 결합을 더하는 플랜)가 다시 돌린다 | ❌ W7 |
| 06-19 Task 1 | 10 | 「기안 동시 6건」 | `test/integration/pre-settle-check.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/pre-settle-check.test.ts -t "기안 동시 6건"` | 막힘 0 프로젝트 6개 기안 모두 끝남 | ❌ W10 |
| 06-22 Task 1 | 11 | 「승인 동시 6건」 | `test/integration/pre-settle-check.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/pre-settle-check.test.ts -t "승인 동시 6건"` | 막힘 0 정산 결재 6건 승인 모두 끝남 | ❌ W11 |

같은 검토에서 나온 동시성 · 멱등 · 사전 조회 신호(동시 6건 아님):

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-04 Task 3 (CROSS R-3) | 「잠금 뒤 게이트 재판정」 | `test/integration/expense-payments.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-payments.test.ts -t "잠금 뒤 게이트 재판정"` | ❌ W3 |
| 06-15 Task 2 (ENG E-5) | 「같은 요청 재전송 → 0건 추가 지급」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "같은 요청 재전송"` | ❌ W8 |
| 06-15 Task 2 (CROSS-R1 F-4 · CHK-R1 W1) | 「목록 지급 총액 = 단건 재계산」 · 「세율 읽기 횟수」 | `test/integration/payment-batch.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/payment-batch.test.ts -t "목록 지급 총액"` | ❌ W8 |
| 06-03 Task 1 (ENG E-2 · CROSS E-1) | `loadTaxRates` · `taxRatesReader` 단위(사전 조회 값만 읽고, 없는 기준일은 던진다) | `test/unit/domain/money-tax.test.ts`(기존 파일 확장) | `pnpm vitest run --project unit test/unit/domain/money-tax.test.ts` | ✅ 파일 있음 · 케이스 W2 |
| 06-07 Task 1 (CROSS E-5) | `lockQuoteLinesQuery(...).toSQL()`에 `order by "quote_lines"."id"` + `for update` | `test/unit/repositories/quote-line-links-sql.test.ts`(신규) | `pnpm vitest run --project unit test/unit/repositories/quote-line-links-sql.test.ts` | ❌ W4 |

### 디자인 검토 반영 신호 (rev 9 — `/plan-design-review` · `design-review.md`@f2720a8)

UI-SPEC rev 9(DR-4 · DR-6 · DR-7 · DR-8 · C-1 · H-2 · H-3 · H-5 · M-1 · M-2 · M-3 · M-7)가 플랜에 내린 신호. 테스트 이름은 플랜 acceptance의 `grep -c` 대상과 같다. `-t`(Vitest) · `-g`(Playwright)는 정규식이라 `+`는 `\\+`로 쓴다. 디자인 교차 검토는 Codex 대신 Opus(한도 2026-09-29까지) — 한도 풀리면 Codex 재확인 필요.

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-06 Task 3 (DR-4) | 「확인 응답에 새 version」 | `test/integration/evidence-reviews.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-reviews.test.ts -t "확인 응답에 새 version"` | ❌ W4 |
| 06-11 Task 1 (B-1 r2) | 「PM 증빙 변경은 문서 version을 올린다」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "PM 증빙 변경은 문서 version을 올린다"` | ❌ W7 |
| 06-11 Task 1 (B-1 r2) | 「PM 증빙 변경 뒤 옛 version 확인 거부」 | `test/integration/evidence-invalidation.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/evidence-invalidation.test.ts -t "PM 증빙 변경 뒤 옛 version 확인 거부"` | ❌ W7 |
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

UI-SPEC rev 9 S7 · S8 · S9 · S13의 카드 전표 표면과 DR-3(카드 전표 = 지출결의 한 종류, O-6)이 06-25에 내린 신호. 테스트 이름은 06-25 behavior · acceptance의 `describe` · `test` 이름과 같다. 디자인 교차 검토는 Codex 대신 Opus(한도 2026-09-29까지) — 한도 풀리면 Codex 재확인 필요.

| Plan · Task | 테스트 이름 | 파일 | Automated Command | File Exists |
|-------------|-------------|------|-------------------|-------------|
| 06-25 Task 1 (B-2 · S7 · S9) | 「카드 전표 주인 권리」 | `test/integration/card-usage-evidence.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표 주인 권리"` | ❌ W10 |
| 06-25 Task 1 (B-2 · S8 — 트레이서) | 「수정 모드 전표 첨부 → 목록 있음」 | `test/e2e/card-usage-evidence.spec.ts`(신규) | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "수정 모드 전표 첨부 → 목록 있음"` | ❌ W10 |
| 06-25 Task 2 (S9 · S13 · 06-03 tx 규약) | 「대기 전표 저장 결합」(저장 트랜잭션 결합 · 거부 시 미결합 · 남의 대기 전표 거부) | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "대기 전표 저장 결합"` | ❌ W10 |
| 06-25 Task 2 (S9 · S13) | 「새 건 · 구매 완료 전표 첨부」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "새 건 · 구매 완료 전표 첨부"` | ❌ W10 |
| 06-25 Task 2 (S7 loading · EVID-01 폰 사진) | 「폰 전표 사진 축소」(폭 390 · `naturalWidth` · `naturalHeight` ≤ 2000) | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "폰 전표 사진 축소"` | ❌ W10 |
| 06-25 Task 3 (DR-3 · O-6) | 「카드 전표 중복 — 지출결의와 한 종류」(묶음 전 RED) | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표 중복 — 지출결의와 한 종류"` | ❌ W10 |
| 06-25 Task 3 (S9 「삭제 뒤 새로 등록」) | 「보관된 카드 사용 전표」 | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "보관된 카드 사용 전표"` | ❌ W10 |
| 06-25 Task 3 (S7 · D-607) | 「카드 전표는 값을 바꾸지 않는다」 | `test/integration/card-usage-evidence.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/card-usage-evidence.test.ts -t "카드 전표는 값을 바꾸지 않는다"` | ❌ W10 |
| 06-25 Task 3 (S7 zero-one-many) | 「마지막 전표 삭제 모달 없음」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "마지막 전표 삭제 모달 없음"` | ❌ W10 |
| 06-25 Task 3 (S7 중복 번호 · O-6) | 「카드 폼 중복 번호」 | `test/e2e/card-usage-evidence.spec.ts` | `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/card-usage-evidence.spec.ts -g "카드 폼 중복 번호"` | ❌ W10 |
| 06-25 Task 3 (회귀) | 06-11 단위 「조회 가짜의 인자 단언」 · 06-16 `[DR-3]` 통합 · 06-16 Task 2 E2E | `test/unit/domain/evidence-upload-checks.test.ts` · `test/integration/approval-reserve-evidence.test.ts` · `test/e2e/quote-revisions.spec.ts` | `pnpm vitest run --project unit test/unit/domain/evidence-upload-checks.test.ts` · `pnpm db:dev && pnpm vitest run --project integration test/integration/approval-reserve-evidence.test.ts` · `pnpm db:reset:test && CI=true pnpm exec playwright test test/e2e/approval-reserve-evidence.spec.ts test/e2e/quote-revisions.spec.ts` | ❌ W7 · W8 |

### 실행 착수 게이트(M-9) — `/gsd-execute-phase 6` 착수 전

UI-SPEC 「Phase 4·5 의존 가정 (UI)」 「실행 착수 게이트(M-9)」 그대로: S1 · S3 · S4 · S5 · S6 · S14 · S18의 자리와 S1 「문서 화면 왕복」(`from=pay` · 번호 링크)이 아직 없는 Phase 5 UI-SPEC(UA-605~UA-610)에 기댄다. 페이즈 착수 전에 한 번, 그 표면을 만드는 플랜의 Task 1 ⓪에서 다시 본다.

| 게이트 | 확인 명령 · 기록 | 멈춤 신호 | 플랜 줄(「선행 의존(A-6xx)」) |
|--------|------------------|-----------|-------------------------------|
| Phase 5 UI-SPEC 있음 | `git ls-files .planning/phases/05-expense-approval-leave/05-UI-SPEC.md` | 출력이 비었다 | 06-15 「M-9 · UA-605~UA-610」 · 06-17 「M-9 · UA-605 · UA-606」 · 06-19 「M-9 · UA-610」 · 06-20 「M-9 · UA-605」 |
| UA-605~UA-610 대조 완료 | 대조 표(UA 줄마다 Phase 5 UI-SPEC과 같음/다름 · 다르면 어디)를 그 플랜 SUMMARY에 | 어긋난 줄 1 이상 → `선행 의존 M-9 미해소 — 06-UI-SPEC {UA-id} 먼저 고침, {플랜} 착수하지 않음` 출력 · 코드 변경 0 | 위 네 플랜의 Task 1 acceptance ⓪ |

---

## Wave 0 Requirements

- [ ] `test/unit/domain/payments/` — 지급 완료액 역산·차이 계산 단위 테스트(EXP-09, EXP-13)
- [ ] `test/unit/domain/rules/` 확장 — 증빙 필수·이중 연결·미결 점검 게이트 규칙 단위 테스트(EXP-06, EVID-02)
- [ ] `test/integration/corp-card-usages.test.ts` — 카드 사용 등록·대리 등록·이중 연결 차단(EXP-07, EXP-16)
- [ ] `test/integration/purchase-requests.test.ts` — 문 가르기·신청/구매완료/취소(EXP-10)
- [ ] `test/integration/evidence.test.ts` — 확인/면제/취소(EVID-03, EVID-04, Phase 5 파일 확장 전제 — Phase 5 완료 후 착수)
- [ ] `test/integration/pre-settle-check.test.ts` — 미결 점검 3종 + 강행 허용 키(PROJ-06)
- [ ] `test/integration/leak-scan.test.ts` 확장 — 신규 DTO·액션 등록(기존 파일에 항목 추가, `[VERIFIED: 04.1-01-PLAN.md files_modified에 이미 이 파일이 등장 — 같은 파일을 여러 페이즈가 누적 확장하는 패턴 확인]`)
- [ ] `test/integration/card-usage-evidence.test.ts` · `test/e2e/card-usage-evidence.spec.ts` — 카드 전표 첨부(EVID-01 카드 몫, 06-25 — 디자인 검토 반영 r2 교차 B-2로 더함. 06-25 Task 1이 만든다)
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
