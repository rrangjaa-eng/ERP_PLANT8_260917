---
phase: "04"
slug: "project-quote-ledger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-22"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 4` from `04-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is filled by `/gsd-validate-phase` once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`test/unit`, `test/integration`) + Playwright (`test/e2e`) |
| **Config file** | `vitest.config.ts` (2-project: `unit` / `integration`), `playwright.config.ts` |
| **Quick run command** | `pnpm vitest run --project unit` |
| **Full suite command** | `pnpm test` (단위 → 통합 → E2E) |
| **Estimated runtime** | ~90 seconds (unit ~15s; full suite needs `pnpm db:dev`) |

**Note:** 통합·E2E는 로컬 DB가 필요하다 (`pnpm db:dev`). 완료 판정은 `CI=true` — `playwright.config.ts`가 CI에서만 프로덕션 빌드를 쓴다 (CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project unit`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green under `CI=true`
- **Max feedback latency:** 15 seconds (unit project)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by `/gsd-validate-phase 4` after plans exist)* | | | | | | | | | ⬜ pending |

### Requirement → signal map (from RESEARCH.md § Validation Architecture)

| Req ID | Observable signal | Test Type | Automated Command | File Exists |
|--------|-------------------|-----------|-------------------|-------------|
| PROJ-02 | 차익은 서버가 계산해 저장하고, 브라우저가 보낸 계산값은 저장되지 않는다 | unit | `pnpm vitest run --project unit test/unit/domain/quote-lines.test.ts` | ❌ W0 |
| PROJ-01 | 문서 번호가 `document_counters` 행 잠금으로 원자 부여 — 두 동시 트랜잭션이 서로 다른 번호를 받는다 | integration | `pnpm vitest run --project integration test/integration/document-counters-concurrency.test.ts` | ❌ W0 |
| PROJ-07 | 승인 전 차수의 줄에서 지출결의·구매 요청이 `domain/rules.gate` 단일 진입점으로 막힌다 | unit | `pnpm vitest run --project unit test/unit/domain/rules-gate.test.ts` | ❌ W0 |
| PROJ-04 | 상태 전환 4종이 전부 게이트를 지나고, 잠기는 상태는 완료(정산) 하나뿐이다 | unit + integration | `pnpm vitest run --project unit test/unit/domain/project-status.test.ts` | ❌ W0 |
| FX-01 | `domain/money` 세금 규칙 4종 × 절사 단위·방식 표가 전부 기대값과 같다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ❌ W0 |
| PROJ-03 | `grossFromTotal()` 역산값이 입력 합계와 어긋나면 차이가 표시된다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ❌ W0 |
| UX-04 · UX-05 | 키보드만으로 입력 완료 — Tab/Enter·방향키·Esc·저장/새 줄, 여러 칸 붙여넣기가 전부 저장되거나 전부 거부된다 | E2E | `pnpm playwright test test/e2e/quote-table.spec.ts` | ❌ W0 |
| RSV-01 | 리저브 대장 잔액이 서버 계산으로 나오고 음수 잔액은 거부된다 | integration | `pnpm vitest run --project integration test/integration/reserve-entries.test.ts` | ❌ W0 |
| ADMN-09 | 설정의 번호 서식(접두어·연도·자릿수·구분자·순번 범위)이 실제 부여된 번호에 반영된다 | integration | `pnpm vitest run --project integration test/integration/document-numbering.test.ts` | ❌ W0 |
| PROJ-05 | 연결 문서가 있는 견적 줄은 보관되지 않고 '취소'로만 바뀌며 FK는 RESTRICT다 | integration | `pnpm vitest run --project integration test/integration/quote-lines.test.ts` | ❌ W0 |

---

## Wave 0 Requirements

- [ ] `test/unit/domain/money.test.ts` — FX-01 · PROJ-03 (세금 규칙 4종 × 절사 표, `splitWithRemainder` 합계 보존, `grossFromTotal` 정수 안전성)
- [ ] `test/unit/domain/rules-gate.test.ts` — PROJ-07 · PROJ-04 (게이트 등록·판정, 단일 진입점)
- [ ] `test/unit/domain/quote-lines.test.ts` — PROJ-02 (차익 서버 계산)
- [ ] `test/unit/domain/project-status.test.ts` — PROJ-04 (상태 전환 4종)
- [ ] `test/integration/document-counters-concurrency.test.ts` — PROJ-01 (Issue 10, 두 커넥션 동시 증가)
- [ ] `test/integration/document-numbering.test.ts` — ADMN-09 (서식 → 번호)
- [ ] `test/integration/quote-lines.test.ts` — PROJ-02 · PROJ-05 (서버 계산·버전 충돌·RESTRICT)
- [ ] `test/integration/reserve-entries.test.ts` — RSV-01 (음수 잔액 거부)
- [ ] `test/e2e/quote-table.spec.ts` — UX-04 · UX-05 (키보드·붙여넣기·전부 저장/거부)
- [ ] Framework install: 없음 — 기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 Excel에서 복사한 여러 칸을 붙여넣기 | UX-05 | Playwright의 클립보드 주입은 브라우저가 쓰는 `text/plain` TSV를 흉내 낼 뿐, 실제 Excel이 쓰는 인용·줄바꿈 이스케이프와 동일하다는 보장이 없다 (RESEARCH.md Gaps) | 실제 Excel에서 3×3 영역(따옴표·줄바꿈 포함 셀 1개)을 복사해 견적 줄 표에 붙여넣고, 저장된 행이 원본과 같은지 확인 |
| 목록 응답 p99 500ms | PROJ-01 성공 기준 1 | 실제 데이터 규모(인트라넷 이전분)가 있어야 의미 있는 측정이 된다 | Phase 8 이전 리허설 데이터로 목록 조회를 반복 측정 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
