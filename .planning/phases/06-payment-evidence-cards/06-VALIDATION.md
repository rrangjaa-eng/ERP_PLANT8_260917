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

*(10개 행, 06-RESEARCH.md § Validation Architecture § Phase Requirements → Test Map을 그대로 옮김 — 새 테스트를 임의로 추가하지 않음)*

### 「동시 6건」 — 커넥션 풀 교착 회귀 신호 (plan-eng-review 반영 · ENG E-1 · E-2 · CROSS E-1 · E-2 · E-3)

규약: 「동시 6건」 = `Promise.all` 6건(`DB_POOL_MAX` 기본 5 초과 — `lib/env.ts:54`, 테스트는 `pool.options.max`를 읽는다). 판정 = 10초 제한 안에 모두 끝남 + 결과 정합. 각 플랜은 **RED를 먼저** 본다 — 트랜잭션 전 사전 조회(세율 · 서식 · 권한 · 강행 허용 설정)를 임시로 트랜잭션 콜백 안으로 되돌리면 타임아웃으로 빨갛고, 되돌린 뒤 녹색이다(SUMMARY에 RED · GREEN 한 줄씩). 근거 규약은 06-03 must_haves의 「tx 규약」(global-db-in-tx-audit, PR #75 · #77).

| Plan · Task | Wave | 테스트 이름 | 파일 | Automated Command | 결과 정합 | File Exists |
|-------------|------|-------------|------|-------------------|-----------|-------------|
| 06-03 Task 2 | 2 | 「지급 완료 동시 6건」 | `test/integration/expense-payments-concurrency.test.ts`(신규) | `pnpm db:dev && pnpm vitest run --project integration test/integration/expense-payments-concurrency.test.ts` | 서로 다른 결재 통과 문서 6건 모두 지급 · 살아 있는 지급 기록 6건 · version 각 +1. PR #75 결정적 재현 꼴(풀 밖 `pg` Client가 행을 먼저 잠그고 `pg_blocking_pids`로 풀 전체가 막힌 것을 확인한 뒤 풂). 06-04 T2 · T3, 06-06 T3, 06-10 T2, 06-13(지급 경로에 견적 줄 잠금을 넣는 플랜 — CROSS-R1 B-1), 06-15 T1이 다시 돌린다 | ❌ W2 |
| 06-08 Task 2 | 5 | 「동시 6건 번호 경합」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "동시 6건 번호 경합"` | 같은 줄 구매 요청 6건 · 서로 다른 번호 6개 | ❌ W5 |
| 06-12 Task 2 | 7 | 「구매 완료 동시 6건」 | `test/integration/purchase-requests.test.ts` | `pnpm db:dev && pnpm vitest run --project integration test/integration/purchase-requests.test.ts -t "구매 완료 동시 6건"` | 하나만 성공 · 다섯 `이미 구매 완료 · 새로 고침` · 카드 사용 1건 | ❌ W7 |
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

---

## Wave 0 Requirements

- [ ] `test/unit/domain/payments/` — 지급 완료액 역산·차이 계산 단위 테스트(EXP-09, EXP-13)
- [ ] `test/unit/domain/rules/` 확장 — 증빙 필수·이중 연결·미결 점검 게이트 규칙 단위 테스트(EXP-06, EVID-02)
- [ ] `test/integration/corp-card-usages.test.ts` — 카드 사용 등록·대리 등록·이중 연결 차단(EXP-07, EXP-16)
- [ ] `test/integration/purchase-requests.test.ts` — 문 가르기·신청/구매완료/취소(EXP-10)
- [ ] `test/integration/evidence.test.ts` — 확인/면제/취소(EVID-03, EVID-04, Phase 5 파일 확장 전제 — Phase 5 완료 후 착수)
- [ ] `test/integration/pre-settle-check.test.ts` — 미결 점검 3종 + 강행 허용 키(PROJ-06)
- [ ] `test/integration/leak-scan.test.ts` 확장 — 신규 DTO·액션 등록(기존 파일에 항목 추가, `[VERIFIED: 04.1-01-PLAN.md files_modified에 이미 이 파일이 등장 — 같은 파일을 여러 페이즈가 누적 확장하는 패턴 확인]`)
- [ ] Framework install: 없음 — 기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A(RESEARCH.md 미기재 — 위 Sampling Rate 참고, Wave 0 이후 실측)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
