---
phase: "07"
slug: "schedule-notify-audit"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. 근거: 07-RESEARCH.md 「Validation Architecture」.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(unit · integration) · Playwright |
| **Config file** | `vitest.config.ts` · `playwright.config.ts`(CI에서만 프로덕션 빌드) |
| **Quick run command** | `pnpm exec vitest run --project unit <바뀐 단위 파일>` |
| **Full suite command** | 로컬에서 돌리지 않음 — PR ready 뒤 CI가 build · 전체 단위 · 통합 · E2E 한 번(CLAUDE.md §5) |
| **Estimated runtime** | 단위 ~30초 · 관련 통합 ~3분 · 관련 E2E ~5분 |

통합(관련 파일만, 시험 DB 하나라 flock): `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:migrate && pnpm db:reset:test && pnpm exec vitest run --project integration <관련 통합 파일>'`

E2E(건드린 스펙만, CI=true): `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test <건드린 스펙>'`

---

## Sampling Rate

- **After every task commit:** `pnpm lint && pnpm typecheck` + 바뀐 단위 파일
- **After every plan wave:** 해당 웨이브 통합 파일 → 건드린 화면 E2E(한 번에 하나). 스키마 플랜은 `pnpm lint:sql` + `pnpm db:generate` 재생성 확인
- **Before `/gsd-verify-work`:** CI 전체 초록
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

요구사항 기준 시험 지도(07-RESEARCH.md). 태스크 ID는 플랜의 `<verify>`가 정본이다.

| Requirement | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| EXP-11 | 지급 예정일 순수 함수: 60일 금요일·금요일 공휴일·월요일 휴일 직후·추석 주·짧은 거래처 기한·기준일 | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` | ❌ W0 | ⬜ pending |
| EXP-11 | 수동 지정(경영관리만, 영업일만, 되돌리면 자동) | V4 | 서버 `can()` 판정 | integration | `test/integration/payments/schedule-manual.test.ts` | ❌ | ⬜ pending |
| EXP-11 · D-705 | 공휴일 확정·삭제 전후 날짜 재파생 | — | N/A | integration | `test/integration/payments/holiday-rederive.test.ts` | ❌ | ⬜ pending |
| EXP-11 | 세금 기준일 = 유효 예정일(수동 ?? 자동) | — | N/A | unit | `test/unit/expenses/tax-basis-effective-date.test.ts` | ❌ | ⬜ pending |
| EXP-12 | 마감 경계(정각·1분 뒤)·마감일 휴일 앞당김·승인 전 제외 | — | N/A | unit | `test/unit/payments/pay-cutoff.test.ts` · `test/unit/rules/payment-cutoff.test.ts` | ❌ W0 | ⬜ pending |
| EXP-12 | 승인 시각 = 현재 차수 `max(acted_at)` | V11 | N/A | integration | `test/integration/payments/approved-at.test.ts` | ❌ | ⬜ pending |
| NOTI-03 | 규칙 병합(코드 기본값 ⊕ 덮어쓰기)·일수 범위·이메일 끔 | V5 | 일수 범위 서버 검증 | unit · integration | `test/unit/notify/rules.test.ts` · `test/integration/notify/rules-tick.test.ts` | ❌ W0 | ⬜ pending |
| NOTI-03 | 조건 종류별 evaluate + `createTestConditionKind` 호환 | V4 | 알림 링크는 보임 판정 뒤 | integration | `test/integration/notify/kinds-*.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · D-716 | 사건 알림은 다음 영업일 9시 묶음에 한 번만 | — | N/A | integration | `test/integration/notify/events-window.test.ts` | ❌ | ⬜ pending |
| NOTI-03 | `/admin/notification-rules` 누수 스캔·메뉴 레지스트리 | V4 | 권한 없는 계급 404 | unit · integration | `test/unit/admin-menu-registry.test.ts` · `test/integration/leak-scan.test.ts` | ✅ 수정 | ⬜ pending |
| 기준 5 | `*Dto` 열거 ↔ `DTO_REGISTRY` 미매핑 0 | V4 | N/A | unit | `test/unit/dto-registry-coverage.test.ts` | ❌ W0 | ⬜ pending |
| 기준 5 | 행동 로그 불변·전후 값·마스킹 | V7 | DELETE/TRUNCATE 거부 | unit · integration | `test/integration/action-log-immutable.test.ts` | ❌ | ⬜ pending |
| 기준 5 · ADMN-10 | 계급 스모크(시드 계급 × 메뉴 노출/404, 대표 행동 로그 열림) | V4 | N/A | e2e | `CI=true pnpm playwright test --project=desktop test/e2e/role-smoke.spec.ts` | ❌ W0 | ⬜ pending |
| 기준 5 | 관리자 폼 8개·설정·`/account` 오류 표시(§6-3·§7-2) | — | N/A | e2e(독립 DOM 감사) | `CI=true pnpm playwright test --project=desktop-settings` | 부분 ✅ | ⬜ pending |
| D-723 | 로그인 IP 한도·잠금 설정 범위 | V2 | 계정별 잠금이 방어 | integration | `test/integration/auth/*.test.ts` | 부분 ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/payments/pay-schedule.test.ts` · `test/unit/payments/pay-cutoff.test.ts` — EXP-11·12 순수 함수(공휴일은 고정 Set 주입)
- [ ] `test/unit/dto-registry-coverage.test.ts` — 미매핑 `*Dto` 0
- [ ] `test/unit/notify/rules.test.ts` — 규칙 병합
- [ ] `test/e2e/role-smoke.spec.ts` — 계급 스모크

프레임워크 설치: 없음(모두 기존).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 SMTP로 아침 9시 묶음 메일 수신 | NOTI-03 | SMTP 실제 값은 사용자 설정 몫 | 스테이징 [테스트] 계정으로 규칙 켬 → 다음 영업일 9시 메일 확인 |
| D-722 계급 기본값 표 확인 | 기준 5 | 사용자 결정(카드 한 장) | 첫 검수 플랜이 초안 → 사용자 카드 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
