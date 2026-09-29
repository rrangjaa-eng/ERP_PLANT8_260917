---
phase: 04-project-quote-ledger
plan: 53
subsystem: domain-rules
tags: [gate, auto-settlement, skip-locked, risk, gap-closure, V-04-auto-settle-gate]
status: complete

requires:
  - phase: 04-project-quote-ledger
    provides: "04-11 자동 전환(applyAutoSettlement · loadProjectForGate) · 04-20 게이트 규칙 틀(project.transition)"
provides:
  - "게이트 규칙 project.auto-settle · ProjectAutoSettleCtx (domain/rules/register.ts) — 자동 전환 진행 → 정산의 판정 한 곳"
  - "두 입구(applyAutoSettlement · loadProjectForGate)가 같은 보조 함수 allowsAutoSettle로 gate(row, \"project.auto-settle\", ctx) 판정"
  - "repositories: lockAutoSettleCandidates(후보 좁히기 · FOR UPDATE SKIP LOCKED) · settleProjectsByIds(허용 id만 UPDATE · 직전 변경 시각 RETURNING)"
affects: [gsd-verify-work 재검증 — VERIFICATION truth 8 · Key Link 「자동 정산 → gate()」, Phase 7 예약 작업(applyAutoSettlement 호출)]

actuals:
  tokens: 5660
  tasks: 3
  commits: 5
plan_head_before: 195764ff9128cb210c2bb23083b82b1c3bba9f3a

tech-stack:
  added: []
  patterns:
    - "읽기 입구: 한 tx 안에서 후보 잠금(SKIP LOCKED) → 후보마다 gate → 허용 id만 UPDATE → 같은 tx 로그. SQL WHERE는 판정이 아니라 잠금 범위 좁히기(규칙보다 넓거나 같음)"
    - "gate를 쓰는 도메인 모듈은 스스로 import \"@/domain/rules/register\" — 단독 그래프(예약 작업)에서 미등록 규칙 → fail-open 삼킴 경로 차단, 단위 가드로 고정"
    - "통합 테스트의 gate 통과형 스파이 + 규칙 이름별 거부(getMockImplementation 보관 → finally 복원)로 「gate가 SQL 후보를 이긴다」 증명"

key-files:
  created:
    - test/unit/domain/auto-settle-gate-registration.test.ts
  modified:
    - domain/rules/register.ts
    - domain/projects/auto-transition.ts
    - repositories/projects.ts
    - test/integration/project-auto-settlement.test.ts
    - test/unit/domain/auto-transition.test.ts
    - test/unit/domain/rules-gate.test.ts

key-decisions:
  - "04-53: 자동 전환 진행 → 정산 판정은 gate 규칙 project.auto-settle 하나 — 리포지토리 후보 WHERE는 잠금 범위 좁히기로만 남긴다(빼면 목록 읽기마다 진행 중 전 행을 잠가 저장과 부딪친다)"
  - "04-53: 쓰기 입구에서 gate 허용 뒤 종료일 null이면 project.auto_settle_gate_no_end_date로 던진다(fail-closed 타입 좁히기, 판정 반복 아님)"

requirements-completed: []  # PROJ-04 게이트 경유 부분만 닫음 — 체크박스 Complete는 사용자 판단(VERIFICATION 337행 · 플랜 Source Audit 제외)

metrics:
  duration: "약 25분"
  completed: 2026-09-29
---

# Phase 4 Plan 53: 자동 정산 게이트 단일 진입점 Summary

자동 전환 진행 → 정산의 두 입구(읽기 applyAutoSettlement · 쓰기 loadProjectForGate)가 새 게이트 규칙 `project.auto-settle`(AUTO_TRANSITIONS 쌍 · 종료일 < 오늘(KST) · 보관 아님)로 판정한다. 리포지토리의 한 문장 정산은 「후보 잠금(SKIP LOCKED)」과 「허용 id만 UPDATE」 두 함수로 나뉘었다. gate가 거부하면 SQL 후보도 정산되지 않음을 통합 (g1)~(g4)가 증명한다.

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 RED | c33b15c2 | test(04-53): 읽기 입구 gate 판정 RED (g1)(g2) |
| 1 GREEN | 8d64d8fd | fix(04-53): 규칙 등록 · 리포지토리 두 함수 · applyAutoSettlement gate 판정 · 단위 가짜 store |
| 2 RED | d6d15b4b | test(04-53): 쓰기 입구 gate 판정 RED (g3)(g4) |
| 2 GREEN | 70305141 | fix(04-53): loadProjectForGate JS 판정 분기 → allowsAutoSettle(gate) |
| 3 | e24a4685 | test(04-53): project.auto-settle 결정표 · 자기 등록 가드 |

Task 1은 tracer — GREEN 뒤 verify(통합 24/24 · 단위 24/24 · negative grep) 재확인 후 확장했다(human_verify_mode end-of-phase, 자동 verify만).

## RED

- Task 1 (`pnpm vitest run --project integration test/integration/project-auto-settlement.test.ts`) — `Tests  2 failed | 22 passed (24)`
  - (g1) `AssertionError: expected [] to have a length of 1 but got +0` — 규칙 호출 0번
  - (g2) `AssertionError: expected [ Array(1) ] to deeply equal []` — 거부해도 정산됨
- Task 2 (같은 명령) — `Tests  2 failed | 24 passed (26)`
  - (g3) `AssertionError: expected [] to have a length of 1 but got +0` — 규칙 호출 0번
  - (g4) `AssertionError: expected 'settling' to be 'in_progress' // Object.is equality` — 거부해도 정산됨
- 두 RED 모두 기존 22건(Task 2에서는 +g1 g2)이 초록 — 스파이 배선이 기존 동작을 바꾸지 않았다.

## 변이 확인 (Task 3, 커밋 안 함)

1. `domain/projects/auto-transition.ts`의 `import "@/domain/rules/register";` 삭제 → `auto-settle-gate-registration.test.ts`:
   `× auto-transition만 import한 그래프에서 project.auto-settle이 등록돼 있다` · `AssertionError: expected [] to include 'project.auto-settle'` · `Tests  1 failed (1)`
   (타입 전용 `import type { ProjectAutoSettleCtx }`는 남아 있었다 — 지워지는 import라 등록을 일으키지 않음도 함께 확인됨)
2. `domain/rules/register.ts`의 `ctx.endDate >= ctx.todayKst` → `ctx.endDate > ctx.todayKst` → `rules-gate.test.ts`:
   `× 종료일이 오늘 · 내일 · 없음이면 거부` · `AssertionError: expected true to be false // Object.is equality` (`rules-gate.test.ts:450:54`) · `Tests  1 failed | 51 passed (52)`
- 둘 다 `git checkout -- <그 파일>`로 되돌린 뒤 `git status --porcelain -- domain` 빈 출력.

## 게이트 결과

| 게이트 | 결과 |
|---|---|
| 통합 project-auto-settlement | 26/26 (기존 22 + g1~g4) |
| 통합 project-period | 33/33 |
| 통합 project-status | 22/22 |
| 통합 quote-lines | 53/53 |
| 통합 quote-revisions | 23/23 |
| 통합 revenue-entries | 43/43 |
| 통합 tx-safety | 7/7 |
| 단위 넷(rules-gate · auto-settle-gate-registration · auto-transition · import-cycles) | 4 files · 79/79 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test:unit` | 127 files · 1759/1759 |
| `pnpm build` | exit 0 |
| Task 1 verify 3 (옛 함수 이름 negative grep: domain repositories app lib test scripts) | 빈 출력 |
| Task 2 verify 3 (auto-transition.ts JS 판정 조건 negative grep) | 빈 출력 |
| Task 2 verify 4 (호출처 status · ledger · index · quotes 변경) | 빈 출력 |
| Task 3 verify 4 (위험 경로 · 의존성) | 이 플랜 실행 범위(195764ff..HEAD) 빈 출력 — 아래 편차 1 |

변경 파일(195764ff..HEAD): domain/projects/auto-transition.ts · domain/rules/register.ts · repositories/projects.ts · test/integration/project-auto-settlement.test.ts · test/unit/domain/auto-transition.test.ts · test/unit/domain/rules-gate.test.ts · test/unit/domain/auto-settle-gate-registration.test.ts. `domain/permissions/` · `domain/auth/` · `db/` · `package.json` · `pnpm-lock.yaml` · `.claude/` 변경 0. 새 의존성 0.

## Deviations from Plan

### 검증 명령 편차

**1. [Rule 3 - Blocking] Task 3 verify 4의 `--grep=04-53`이 계획 단계 커밋을 잡음**
- **Found during:** Task 3 ⑤
- **Issue:** 원문 명령이 exit 1 — 출력은 `.claude/gates/phase-04.log` 한 줄, 출처는 86a41669 `docs(04): plan-eng-review for gap plans 04-52·04-53`. 이 플랜 실행 전(plan_head_before 195764ff의 조상) 계획 검토 커밋으로, 실행 커밋이 아니다.
- **Fix:** 코드 변경 없음. 같은 명령을 실행 범위 `195764ff..HEAD`로 좁혀 다시 돌려 빈 출력(exit 0)을 확인했다. 재검증도 범위를 좁혀 판정해야 한다.
- **Commit:** 없음

### 외과적 변경의 작은 보충

**2. [Rule 1 - 주석 정합] repositories/projects.ts 타입 좁히기 주석 한 줄**
- 옛 주석 「하위 선택이 종료일 없는 행을 거르므로」가 하위 선택이 없어져 틀리게 되어 「허용된 id는 종료일이 있는 후보뿐이다(후보 WHERE · gate)」로 고쳤다(8d64d8fd).
- Task 1에서 loadProjectForGate의 옛 주석(`settleOverdueProjects` 언급)을 `lockAutoSettleCandidates`로 한 번 바꿨다 — Task 1 verify 3(옛 이름 0)을 맞추기 위해서. 그 줄은 Task 2에서 분기와 함께 지웠다.

**3. 상태 갱신 — REQUIREMENTS.md는 바꾸지 않음**
- 실행자 흐름의 `requirements.mark-complete PROJ-04`가 체크박스를 Complete로 바꿨으나, 플랜 Source Audit이 이를 「제외 — 사용자 판단(VERIFICATION 337행)」으로 적어 두어 그 파일 변경을 되돌렸다. STATE.md · ROADMAP.md(· state.json 미러)만 gsd-tools로 갱신했다.

그 밖은 계획대로 실행했다.

## 독립 검토

**대기 — 오케스트레이터가 띄움.** risk 플랜(Task 3 ⑥): 실행자가 아닌 Opus 1명(general-purpose, `model: opus`)이 이 플랜 커밋 범위(195764ff..e24a4685)의 diff를 점검한다 — 단일 판정점 · 동작 불변(SKIP LOCKED · 잠금 순서 · UPDATE 가드 · 로그 같은 tx · 발효일 · 읽기 fail-open · 쓰기 fail-closed) · 규칙 등록 누락 경로 · import 순환 · 잠근 tx 안 풀 호출(§4-8 (3)) · 위험 경로/새 의존성 0. 결과(must / should / nit)는 이 절에 적고, must는 실행자가 `fix(04-53): …`로 고친다.

## 이후

- 재검증(`/gsd-verify-work`)이 VERIFICATION truth 8과 Key Link 「자동 정산(진행 → 정산) → gate()」를 다시 판정해야 한다 — 이 SUMMARY는 VERIFICATION을 고치지 않는다.
- 이 PR은 Post-build 묶음(`/review` → `/qa` → `/ship`)을 거친다. 인증·권한·암호화·외부 입력 변경이 없어 `/cso`는 해당 없음. 위험 경로 변경이 없어 조건이 맞으면 세션 머지 가능.
- E2E는 이 플랜에서 돌리지 않았다(화면 변경 없음). 전체 E2E는 PR CI가 한 번 돈다.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 7개 존재 · 커밋 c33b15c2 · 8d64d8fd · d6d15b4b · 70305141 · e24a4685 존재(`git log`로 확인).
