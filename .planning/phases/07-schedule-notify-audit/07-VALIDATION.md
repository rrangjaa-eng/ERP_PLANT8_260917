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
- **After every plan wave:** 해당 웨이브 통합 파일 → 건드린 화면 E2E(한 번에 하나). 스키마 플랜(PR-S, 웨이브마다 하나)은 `pnpm lint:sql` + `pnpm db:generate` 재생성 확인 + `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts`(C2 — 파일 이름 · 번호 grep 대신)
- **PR ready 때(묶음마다 한 번, D-726):** 위험 경로 묶음(PR-S · PR-AUTH · PR-PERM)은 마지막 플랜이 끝난 뒤 ready → CI 전체 한 번 → 게이트 한 번(묶음 플랜 게이트 줄 합집합). 무인 PR은 플랜마다 ready → CI 한 번. 로컬에서 전체를 되풀이하지 않는다(CLAUDE.md §5)
- **Before `/gsd-verify-work`:** 27개 플랜 PR(묶음 3 + 무인 · 화면)이 모두 main에 들어가고 마지막 main CI · 스테이징 배포 초록
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
| C2 (Round 1) | PR-S 마이그레이션 저널 가드 — idx 연속 · tag 접두 · when 증가 · SQL · 스냅숏 짝 · 고아 없음, 번호를 다시 만든 뒤에도 초록(07-02 · 07-07 · 07-11 · 07-13 스키마 태스크) | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts` | ✅ 있음 | ⬜ pending |
| EXP-11 · D-741 (Round 1) | 기한 안 지급 요일 없음 → 기한 안 마지막 영업일 · `"no-slot"` · 배지 없음 / 그날 마감 1분 넘긴 승인 → 다음 지급 가능 금요일 · `"cutoff"`(기한 넘어도) / 기한 끝 휴일 · 주말 → 앞 영업일 / 수동 지정 → 마감 면제(D-742) / `payWeekGroupLabel` 실제 요일 | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` | ❌ W0 | ⬜ pending |
| EXP-12 · D-731 (Round 1) | `payRuleLine` 네 꼴(기한 안 마지막 {요일}요일 · 기한 안 마지막 영업일 · 마감 넘겨 밀림 · `결재 마감 면제`) 단위 + SC-02 · SC-03 지급 예정일 값 바로 아래 한 줄 | — | N/A | unit · e2e | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` · `CI=true pnpm playwright test test/e2e/payment-schedule.spec.ts` | ❌ W0 | ⬜ pending |
| J13 · N8 (Round 1) | 지출결의 `상세` — 임시 저장은 비어도 되고 제출 때 비면 `상세 · 입력`으로 거부(서버 `submitExpense`도 같은 판정) | V5 | 서버 제출 검증 | unit · e2e | 07-16이 정한 단위 파일(`test/unit/expenses/` 아래) · `CI=true pnpm playwright test test/e2e/expense-hope-date.spec.ts` | ❌ | ⬜ pending |
| R13 · N10 (Round 1) | 관리자 폼 8개 + 설정 + `/account`에서 `ui/` 밖 `select` · `input`(checkbox · radio · hidden 제외) 0 — 제외: 필터 줄 select · 표 안 셀 입력. 폼별 맡는 플랜이 자기 몫을 실측, 07-25가 최종 0 단언 | — | N/A | e2e(독립 DOM 감사) | 07-25 최종 검수 DOM 실측(`CI=true`, 파일은 07-25가 정함) | ❌ | ⬜ pending |
| W4 · W5 · D-729 · D-730 · D-747 (Round 1) | 경영관리 예산 직접 수정(사유 필수 · 이력 `직접 수정` + 메모) · PO 감액은 예산 자동 반영 없음(증액만) · 원가율 첫 저장 → 진행 중 전부 첫 예산 줄 | V4 | `projects.budget` 쓰기 = 경영관리만, 서버 판정(D-722 표) | unit · integration · e2e | `pnpm exec vitest run --project unit test/unit/projects/budget.test.ts` · `test/integration/project-budget.test.ts` · `CI=true pnpm playwright test test/e2e/projects-budget.spec.ts` | ❌ | ⬜ pending |
| U1 · D-728 (Round 1) | 퇴직자 행에는 잠겨 있어도 `잠금 풀기`가 렌더되지 않고, 서버 `unlockPerson`도 퇴직자를 거부 | V4 | 서버 거부(UI 숨김과 무관) | integration · e2e | 07-17이 정한 통합 파일 · `CI=true pnpm playwright test test/e2e/people-unlock-reset.spec.ts` | ❌ | ⬜ pending |
| R1 · D-726 (Round 1) | PR 묶음 차이 검사 — 묶음 PR은 ready 전 `git diff --name-only origin/main`이 그 묶음 플랜 files_modified(+ `.planning/`)만, 무인 PR은 `git diff --name-only origin/main -- db/ domain/auth/ domain/permissions/`가 빈 출력 | V14 | 위험 경로가 세션 머지 PR에 섞이지 않음 | shell | `git diff --name-only origin/main -- db/ domain/auth/ domain/permissions/` (무인 PR: 빈 출력) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/payments/pay-schedule.test.ts` · `test/unit/payments/pay-cutoff.test.ts` — EXP-11·12 순수 함수(공휴일은 고정 Set 주입)
- [ ] `test/unit/dto-registry-coverage.test.ts` — 미매핑 `*Dto` 0
- [ ] `test/unit/notify/rules.test.ts` — 규칙 병합
- [ ] `test/e2e/role-smoke.spec.ts` — 계급 스모크

프레임워크 설치: 없음(모두 기존). C2 가드 `test/unit/db/migration-journal.test.ts`는 이미 있다(Wave 0 아님).

---

## 웨이브 · PR 묶음 (Round 1 — D-726 · D-727, 7웨이브 27플랜)

| 웨이브 | 플랜 | 검증 시점 |
|---|---|---|
| W1 | 07-01 · 07-02(PR-S) · 07-03 · 07-04 · 07-12 | 07-01 · 03 · 04 · 12는 플랜 끝에 각자 ready → CI → 세션 머지. 07-02는 PR-S draft를 연다 |
| W2 | 07-05(PR-PERM) · 07-06 · 07-07(PR-S) · 07-08 · 07-09(PR-AUTH) · 07-26(PR-PERM) | PR-AUTH = W2 끝에 ready → CI 한 번 → 사용자 머지. 07-08은 W2 끝 세션 머지 |
| W3 | 07-10 · 07-11(PR-S) · 07-15(PR-PERM) · 07-16 · 07-17 | PR-PERM = W3 끝(D-722 카드 답 뒤) ready → CI 한 번 → 사용자 머지. 07-17은 세션 머지(D-727) |
| W4 | 07-13(PR-S) · 07-14 · 07-18 · 07-20 · 07-21 · 07-27 | PR-S = W4 끝 ready → 직전 origin/main 반영 · 번호 겹치면 07-02 → 07 → 11 → 13 순 재생성 → `migration-journal.test.ts` 초록 → CI 한 번 → 사용자 머지. 07-21은 세션 머지(D-727) |
| W5 | 07-19 · 07-22 | 화면 PR마다 독립 DOM 감사(`CI=true`, 375 · 320 · 768 · 1280) → CI |
| W6 | 07-23 · 07-24 | 같음. 07-24는 `+ /cso` |
| W7 | 07-25 | 최종 검수(N10 0 단언 · 계급 스모크 · 누수 스캔) |

- 실행은 기다리지 않는다(아직 main에 없는 depends_on 브랜치를 머지 커밋으로 품고 일함). **머지는 기다린다** — depends_on 사슬 전부가 main에 들어간 뒤 그 PR을 ready로 바꾸고 CI를 한 번 돌린다. 그래서 웨이브 끝마다 전체 CI를 돌리지 않는다.
- 화면 PR 게이트 줄(C3): `/review` → `/design-review`(scripts/codex-design-review.sh, 375·320·768·1280, Codex 없으면 「Codex 디자인 검토 건너뜀: 사유」) → `/qa`. 결함 판정은 DOM 실측으로만(D-732).

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

---

## Review Dispositions Ledger

### Round 1 — ee0899f

#### Review Feedback Addressed

| Concern | Severity | How Addressed |
|---|---|---|
| 07-VALIDATION에 「PR 묶음」 절 없음 · R1 · N8 · N10 행 판단 (L361@ee0899f) | 참고 | 「웨이브 · PR 묶음」 절(7웨이브 · 묶음 CI 한 번) · R1 · J13/N8 · R13/N10 행 |
| C2 마이그레이션 가드 (L132@ee0899f) | P2 | 표 행 + 표본 추출 「After every plan wave」에 명령 |
| D-741 no-slot 규칙 (L65@ee0899f) | 막 | EXP-11 · D-741 행(단위 사례 다섯) |
| D-731 규칙 줄 (L61@ee0899f) | 막 | EXP-12 · D-731 행(`payRuleLine` + E2E) |
| D-729 · D-730 예산 (L58-59@ee0899f) | 막 | W4 · W5 행(+ D-747) |
| D-728 퇴직자 잠금 풀기 (L57@ee0899f) | 막 | U1 · D-728 행 |
| C5 웨이브 8→7 (L135@ee0899f) | 참고 | 웨이브 표 7줄 |

#### Review Feedback Deferred

| Concern | Reason |
|---|---|
| `nyquist_compliant` · Sign-Off 체크 | validate-phase가 실행 뒤 판정하는 칸 — 계획 단계에서 바꾸지 않음(status draft 유지) |
| 새 행의 정확한 파일 이름 일부(J13 단위 · D-728 통합 · N10 최종 검수) | 그 플랜(07-16 · 07-17 · 07-25)의 묶음 플래너가 같은 시간에 정함 — 공유 플래너가 이름을 지어내지 않음 |
