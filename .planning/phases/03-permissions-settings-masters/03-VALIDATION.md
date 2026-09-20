---
phase: "03"
slug: "permissions-settings-masters"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-20"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 3` from `03-RESEARCH.md` § Validation Architecture.
> The per-task map below is filled by `gsd-planner` once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`--project unit` / `--project integration`) + Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` — both present since Phase 1 |
| **Quick run command** | `pnpm test:unit` |
| **Full suite command** | `pnpm test` (`test:unit` → `test:integration` → `test:e2e`) |
| **Estimated runtime** | ~20s unit · ~25s integration · ~80s E2E (measured on CI run #43) |

Integration and E2E require a local database — `pnpm db:dev` first.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:unit`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds (unit tier)

---

## Per-Task Verification Map

Task IDs are assigned when PLAN.md files are written. The requirement→test mapping below is
the contract each task must land under; `gsd-planner` fills `Task ID` / `Plan` / `Wave` and
appends per-task rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ADMN-01 | TBD | 계급에 없는 메뉴·동작은 `can()`이 false | unit | `pnpm vitest run --project unit domain/permissions/can.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-02 | TBD | 노출표에 없는 필드는 `project()` 출력에서 사라진다 | unit | `pnpm vitest run --project unit domain/permissions/visible.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-03 | TBD | 노출표에 매핑되지 않은 DTO 타입이 있으면 실패 | integration | `pnpm vitest run --project integration test/integration/leak-scan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-05 | TBD | 등록됐으나 서버가 읽지 않는 키가 있으면 실패 | unit | `pnpm vitest run --project unit domain/settings/registry-coverage.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-06 | TBD | JSON export → 빈 환경 import 후 동작 동일 | integration | `pnpm vitest run --project integration test/integration/settings-export.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-08 | TBD | 계급 추가·이름 변경이 데이터로 가능 | integration | `pnpm vitest run --project integration test/integration/roles.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-10 | TBD | 행동 로그 열람이 정보 노출표로 통제된다 | E2E | `pnpm playwright test test/e2e/action-log.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ADMN-12 | TBD | 삭제는 보관함으로 가고 관리자만 복원 | integration | `pnpm vitest run --project integration test/integration/archive.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | OPS-05 | TBD | 단순 조회·화면 이동은 로그에 남지 않는다 | unit | `pnpm vitest run --project unit domain/action-log/record.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAST-01 | TBD | 계좌번호는 암호문으로 저장되고 기본은 뒤 4자리만 | integration | `pnpm vitest run --project integration test/integration/vendors.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAST-02 | TBD | 팀 소속이 발령일 이력으로 남고 시점 조회가 된다 | integration | `pnpm vitest run --project integration test/integration/team-memberships.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAST-03 | TBD | 카드마다 소지자 또는 소속 팀이 지정된다 | integration | `pnpm vitest run --project integration test/integration/corp-cards.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAST-04 | TBD | 코드표 항목을 비활성화해도 기존 참조가 깨지지 않는다 | integration | `pnpm vitest run --project integration test/integration/code-tables.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `domain/permissions/{can,visible,scope-for,project}.test.ts` — 판정 4함수 단위 테스트
- [ ] `test/integration/leak-scan.test.ts` — 런타임 레지스트리를 import해 `it.each`로 생성하는 동적 테스트 (ADMN-03). 리포 안에 `it.each` 자체는 이미 3곳에서 쓰이고, 새로운 것은 **프로덕션 레지스트리를 테스트 입력으로 삼는 것**이다
- [ ] `domain/settings/registry-coverage.test.ts` — 미사용 키 검출 메커니즘 자체의 테스트
- [ ] `lib/crypto.test.ts` — AES-256-GCM 라운드트립 + `APP_DATA_KEY_v1` 없을 때 fail-closed + `v1:`/`v2:` 혼재 복호화
- [ ] `test/unit/eslint-rules/no-row-type-escape.test.ts` — DTO 출구 강제 규칙의 규칙 전용 테스트 (`money-boundary` 전례)

**프레임워크 설치는 불필요** — Vitest·Playwright 모두 Phase 1부터 설치·설정돼 있다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 권한표·노출표 체크박스 격자의 시각 품질 | ADMN-01, ADMN-02 | 격자 밀도·스크롤·터치 목표는 계산값이 아니라 눈으로 보는 판정 (D-40) | `/design-review`(SYSTEM.md 일관성) → `/qa`(실브라우저). CLAUDE.md가 UI 완료 판정 조건으로 지정한 둘 |
| Secret Manager에 `APP_DATA_KEY_v1` 실제 값 존재 | MAST-01 | `lib/env.ts`가 `optionalString()`이라 값 없이도 앱이 뜬다 — 배포 후 "계좌번호 저장 시 500"으로 처음 발견되는 유형 | 배포 전 GCP Secret Manager에서 두 환경(staging·prod)의 값 존재 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
