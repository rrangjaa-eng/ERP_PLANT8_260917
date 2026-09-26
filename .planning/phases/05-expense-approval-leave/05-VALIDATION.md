---
phase: "05"
slug: "expense-approval-leave"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-26"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 5` from `05-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is filled by `/gsd-validate-phase` once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.1(프로젝트 `unit` · `integration`) + Playwright 1.63.0 |
| **Config file** | `vitest.config.ts`(integration: `fileParallelism: false`) · `playwright.config.ts`(CI에서만 프로덕션 빌드) |
| **Quick run command** | `pnpm vitest run --project unit test/unit/domain/expenses` |
| **Full suite command** | `pnpm lint && pnpm typecheck && pnpm lint:sql && flock /tmp/plant8-erp-test.lock pnpm build` → `pnpm test:unit` → `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm vitest run --project integration'` → `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test'` |
| **Estimated runtime** | RESEARCH.md 미기재 — unit 파일 단위 수 초, 전체 게이트는 build + integration + E2E 합산 |

**Note:** 통합·E2E는 로컬 DB가 필요하다(`pnpm db:dev`). 완료 판정은 `CI=true`(CLAUDE.md §5).

---

## Sampling Rate

- **After every task commit:** 해당 unit 파일 + `pnpm lint && pnpm typecheck`
- **After every plan wave:** `pnpm lint && pnpm typecheck && pnpm lint:sql && flock /tmp/plant8-erp-test.lock pnpm build` + `pnpm test:unit` + 그 웨이브의 integration 파일
- **Before `/gsd-verify-work`:** 전체 unit → integration → `CI=true` E2E 한 번(CLAUDE.md §6 순서 — DOM 감사 뒤) 초록
- **Max feedback latency:** unit 기준 수 초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (PLAN.md 작성 뒤 `/gsd-validate-phase`가 채운다 — 요구사항 → 테스트 초안은 `05-RESEARCH.md` § Validation Architecture 「Phase Requirements → Test Map」) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/integration/expense-*.test.ts`(생성 idempotency · 회차 상한 · 동시 제출 · 금액 · 결재 수명주기 · 결재 동시 조작 · 팀 귀속 · 세율 스냅샷 · 보임) · `evidence-upload.test.ts` · `settlement-approval.test.ts` · `linked-documents-by-line.test.ts`
- [ ] `test/unit/domain/expenses/{tax,submit-gate,installment-cap,expense-number-format}.test.ts` · `test/unit/domain/evidence/upload-checks.test.ts` · `test/unit/lib/gcp/storage.test.ts`
- [ ] `test/e2e/expense-submit-mobile-approval.spec.ts` · `expense-form.spec.ts` · `expense-list.spec.ts` · `mobile-expense-form.spec.ts` · `expense-a11y.spec.ts` · `settlement-approval.spec.ts`
- [ ] 통합 픽스처: 프로젝트(진행 · 승인 차수) + 견적 줄(거래처 있음/없음) + 결재선 담당 네 계급 + 메모리 저장소 가짜(`deps.storage`)
- [ ] E2E: `STORAGE_DRIVER=local`을 `playwright.config.ts` webServer env에 · 작은 JPEG 픽스처
- 프레임워크 설치: 없음

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 GCS가 손으로 만든 V4 서명 PUT/GET을 받는다 · 런타임 SA IAM(signBlob · 버킷 범위 역할) | EVID-01 | 로컬·CI에 실제 버킷이 없다(로컬 드라이버 · 메모리 가짜로 대체), 공식 문서 확인 불가(프록시 차단) | staging 배포 뒤 폰에서 이미지 한 장 첨부 → 객체 생성 · 서명 GET 열람 · 크기 초과 거부 확인(human-verify 체크포인트) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < unit 수 초
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
