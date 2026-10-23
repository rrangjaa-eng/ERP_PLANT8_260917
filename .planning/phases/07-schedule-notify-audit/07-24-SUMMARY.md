---
phase: 07-schedule-notify-audit
plan: 24
subsystem: projects-budget
status: complete
risk: money
requirements: [EXP-11]
tags: [budget, cost-rate, money, permissions, side-panel, action-log]
dependency_graph:
  requires: ["07-18", "07-15", "07-08", "07-11", "07-12", "07-22", "07-20"]
  provides:
    - "domain/projects/budget.ts — budgetDelta · recordBudgetEvent · seedInitialBudgets · saveCostRateSetting · setBudgetManually · listBudgetRows · listBudgetHistory"
    - "repositories/project-budget-entries.ts"
    - "/projects/budget 예산 현황 화면 + 예산 이력 옆 패널(폰 시트)"
    - "행동 로그 유형 budget_manual_change(끌 수 없음)"
  affects:
    - "domain/projects/ledger.ts(PO 저장) · domain/projects/index.ts(createProject) · domain/quotes/revisions.ts(setCustomerApproval)"
    - "domain/settings/export.ts(afterApply 주입) · scripts/settings-import.ts · app/(app)/admin/settings/*"
    - "app/(app)/projects/page.tsx · filter-bar.tsx(예산 현황 링크)"
tech-stack:
  added: []
  patterns:
    - "사건 훅은 같은 tx — 사건 전 기준 → 새 기준, 늘었을 때만 줄(budgetDelta null = 줄 없음)"
    - "설정 → 프로젝트 의존은 액션 · 명령 층에서 주입(B-P3-7)"
    - "낙관적 동시성 — expectedBudgetKrw ≠ 지금 합이면 거절"
key-files:
  created:
    - domain/projects/budget.ts
    - repositories/project-budget-entries.ts
    - app/(app)/projects/budget/page.tsx
    - app/(app)/projects/budget/budget-table.tsx
    - app/(app)/projects/budget/budget-history-panel.tsx
    - app/(app)/projects/budget/budget.module.css
    - app/(app)/projects/budget/loading.tsx
    - app/(app)/projects/budget/actions.ts
    - app/(app)/projects/budget/actions.registry.ts
    - test/unit/projects/budget.test.ts
    - test/integration/project-budget.test.ts
    - test/e2e/projects-budget.spec.ts
    - test/e2e/mobile-projects-budget.spec.ts
    - docs/design/checks/2026-10-23-07-24-budget.md
  modified:
    - repositories/projects.ts
    - domain/projects/ledger.ts
    - domain/projects/index.ts
    - domain/quotes/revisions.ts
    - domain/settings/export.ts
    - scripts/settings-import.ts
    - app/(app)/admin/settings/actions.ts
    - app/(app)/admin/settings/settings-form-client.tsx
    - domain/action-log/record.ts
    - app/(app)/projects/page.tsx
    - app/(app)/projects/filter-bar.tsx
    - playwright.config.ts
    - test/integration/leak-scan.test.ts
    - test/unit/action-log/record.test.ts
decisions:
  - "PO 금액 0은 「PO 없음」으로 본다 — 기준은 승인 견적 합계로 내려간다"
  - "SYSTEM_VIEWER(사람 아닌 실행자)로 예산 줄을 쓰면 created_by FK 때문에 UserFacingError로 막는다(fail-closed)"
  - "설정 가져오기 명령은 원가율 키가 든 페이로드일 때만 afterApply(seedInitialBudgets)를 넘긴다"
  - "setBudgetManually · listBudgetHistory도 행 범위(projectRowScope)를 건다 — 범위 밖 프로젝트는 「프로젝트 없음」"
  - "폰 행 탭은 RowSheet 대신 같은 SidePanel(아래 시트) — RowSheet는 읽기 전용이라 저장 행동 줄을 못 담는다"
  - "원가율 첫 저장 결과 줄의 `예산 현황` 링크 판정(canViewBudget)은 액션 응답에 실어 보낸다"
metrics:
  duration: "약 1일(2026-10-22~23)"
  completed: 2026-10-23
plan_head_before: ca77696f936ce6c347b233417aac5917fc830289
actuals:
  tokens: 37000
  tasks: 3
  commits: 5
---

# Phase 07 Plan 24: 예산(원가율 × 기준 금액) 기록 · 예산 현황 · 직접 수정 Summary

PO 금액(없으면 승인 견적 합계) × 원가율로 예산 줄을 사건마다(등록 · PO 증액 · 새 승인 차수 · 처음 원가율) 같은 tx에 쌓고, 경영관리 전용 `/projects/budget` 현황 화면과 예산 이력 패널에서 사유 필수 직접 수정(행동 로그 `budget_manual_change`)을 제공한다.

`actuals.commits: 5`는 `git rev-list --count ca77696f..HEAD`로 쟀다. 이 플랜의 task 커밋 3(c28d8c27 · 0c5086ef · 6811486b)과 origin/main 머지 커밋 14990c67, 그 머지로 들어온 #275 커밋 1dc3267c 1을 합한 값이다. SUMMARY 커밋은 들어 있지 않다. `tokens`는 task 커밋 diff(ca77696f..6811486b, 148,994자)를 4로 나눈 값이다.

## 한 일

| Task | 커밋 | 내용 |
|---|---|---|
| 1 | c28d8c27 | `budgetDelta`(돈 반올림은 domain/money `round(...,1,"round")`) · `budgetBasisKrw` · `recordBudgetEvent` · PO 증액 훅(ledger) · `listBudgetRows` · 예산 현황 화면 트레이서(합계 줄 · 표 · 잠김 · EMPTY · 계산 불가 배지) |
| 2 | 0c5086ef | 등록(K2) · 새 승인 차수 · 처음 원가율(`seedInitialBudgets` — 화면 저장 `saveCostRateSetting`, 가져오기 `afterApply`) · `setBudgetManually`(사유 필수 · 500자 · 정수 ≥ 0 · 낙관적 동시성 · 같은 값 무기록 · 행동 로그 같은 tx) · `budget_manual_change`(끌 수 없음) · DTO 등록 · SC-20 누출 검사 |
| 3 | 6811486b | `listBudgetHistory`(10줄 쪽 · 커서) · 예산 이력 옆 패널/폰 시트(읽기 기본 → `예산 바꾸기` → `예산 저장`/`취소 Esc`, Esc 두 단계, 포커스 복귀) · 프로젝트 목록 `예산 현황` 링크 · 원가율 첫 저장 결과 줄 `원가율 저장 · 예산 N건 생성` + `예산 현황` |
| 머지 | 14990c67 | origin/main(#275 행동 로그 불변 트리거 0046) 머지 커밋. 충돌이 없었고, 이 플랜에는 마이그레이션이 없다 |

## AQ-39 근거(승인 견적 합계 = 기준)

- `domain/quotes/revisions.ts` `setCustomerApproval`은 승인 전 기준(`prevBudgetBasisKrw`)을 읽고, `repoSetRevisionApproval` 뒤에 `recordBudgetEvent("new_approved_revision")`를 부른다.
- `repositories/quote-revisions.ts` `approvalBasis`가 고객 승인 여부를 `customerApprovedAt`으로 판정한다. 기준 금액은 가장 최근 승인 차수의 합계다.

## 검증

- **Task 2**
  - 단위 48 pass
  - 통합 9 파일 pass(budget · settings · quotes · projects · leak-scan 등)
  - settings-import CLI 9 pass
  - typecheck · lint 깨끗
- **Task 3**
  - 통합(leak-scan · project-budget · settings) pass
  - 단위 16 pass
  - `CI=true` build exit 0
  - E2E 예산(desktop-settings 7 + mobile-375 1) 8 pass
  - 회귀 projects-list + settings(desktop) 56 pass
- **머지 뒤**: `pnpm typecheck` exit 0
- **실행자 자체 DOM 실측**(독립 감사 아님, 임시 스펙, 커밋하지 않음 · 로그 `/home/user/wt/logs/07-24/t3-dom.log`)
  - 1280 · 768 · 375 · 320 모두 가로 넘침 0
  - 폰 머리는 P1 세 열뿐이다
  - 합계 줄이 표 앞에 있다
  - `₩`가 0이다
  - `초과`가 danger 색이다
  - 패널 1차 버튼은 0 → 편집 1 → 0
  - 시트 행동 버튼 44px, 패널 입력 40px(시스템 패널 기준)
  - Esc 두 번째에 패널이 닫히고 포커스가 행 링크로 돌아온다

## 호출한 스킬

`superpowers:test-driven-development`(코드 전) · `plant8:design-gate`(화면 파일 전, 점검표 `docs/design/checks/2026-10-23-07-24-budget.md` 전부 [x]) · `superpowers:systematic-debugging`(K31 누출 검사 실패 · 린트 실패 추적 전) · `superpowers:verification-before-completion`(커밋 · 보고 전)

## Deviations from Plan

**1. [Rule 3 - Blocking] `repositories/projects.ts` `lineSumsSubquery`에 viewer 인자**
- 무엇: 플랜은 export 한 단어만 바꾸게 했다. 실제로는 저장소 규칙(repository-viewer-param 린트)이 viewer를 요구해서 viewer 인자를 더했다.
- 커밋: c28d8c27

**2. [Rule 3 - Blocking] `playwright.config.ts` `DESKTOP_SETTINGS_SPECS`에 예산 스펙 추가 + 그 단위 시험**
- 이유: 원가율은 전역 설정이라 설정 프로젝트(워커 1)에서 돌아야 한다.

**3. [Rule 1 - Bug] PO 금액 0 = PO 없음**
- 0을 기준으로 잡으면 승인 견적이 있어도 예산이 0이 된다.

**4. [Rule 2 - Critical] SYSTEM_VIEWER 예산 줄 쓰기 거절**
- 메시지: 「예산 줄 작성자 없음 · 사람 계정으로 다시 실행」
- `created_by` FK가 users를 가리킨다. SYSTEM_VIEWER로 쓰면 FK 오류가 나서 tx가 깨진다.

**5. [Rule 1 - Bug] 설정 가져오기는 원가율 키가 든 페이로드에만 seed를 건다**
- 이렇게 하지 않으면 원가율과 무관한 가져오기도 SYSTEM_VIEWER로 실행되어 4번에 걸려 실패한다.

**6. [Rule 2 - Critical] `setBudgetManually` · `listBudgetHistory`에 행 범위 검사**
- 플랜에는 메뉴 권한만 있었다. 범위 밖 프로젝트 id를 직접 넣는 경로를 막는다.
- 통합 시험에서 범위 줄을 끈 상태로 RED를 확인했다.

**7. [Rule 2 - Critical] DTO 등록**
- `budgetRow` · `budgetHistory` 등록과 leak-scan import를 더했다. K31 누출 검사가 등록되지 않은 `BudgetRowDto`를 잡았다(Task 1 누락).

**8. [Rule 3] 폰 시트는 RowSheet 대신 같은 SidePanel(아래 시트)**
- RowSheet는 읽기 전용이라 저장 행동 줄을 못 담는다.

**9. 점검표 파일 날짜**
- 플랜의 2026-10-21 대신 실행일 2026-10-23으로 만들었다.

**10. `canViewBudget` 전달 경로**
- 설정 페이지에서 넘기지 않고, 첫 저장일 때만 액션 응답에 실었다. 첫 저장이 아니면 판정 자체를 하지 않는다.

**11. `app/(app)/projects/filter-bar.tsx`에 `budgetLink` prop**
- 플랜의 파일 목록 밖이다. 목록 머리 끝 링크 자리가 이 컴포넌트의 RowActions라 더했다.

**12. TDD 이탈 — Task 3 E2E는 UI 코드 뒤에 썼다**
- `listBudgetHistory` 통합 시험만 RED를 먼저 확인했다.

## 260907 대조

260907(옛 저장소)에는 예산 개념이 없다. 「예산」 테이블 · 원가율 설정 · 예산 이력이 없고, 실행가를 예산처럼 부른 주석만 있다.

| 260907 파일:줄 | 내용 | 이 플랜과의 관계 |
|---|---|---|
| `/home/user/erp_plant8_260907/db/schema/010_tables.sql:2643` | `CREATE TABLE public.projects` | 예산 칸이 없다. 이 플랜은 별도 `project_budget_entries` 줄 합으로 둔다 |
| `/home/user/erp_plant8_260907/db/schema/010_tables.sql:2673` | `po_number` | PO 번호만 있고 PO 금액 기준 예산 산식은 없다 |
| `/home/user/erp_plant8_260907/db/schema/010_tables.sql:4044` | `quote_items.cost_amount` 「실행가」 주석 | D-733 사용액 = 지금 차수 견적 줄 실행가 합과 같은 뜻 |
| `/home/user/erp_plant8_260907/server/src/quotes.ts:1193` | 「실행가(예산)」 주석 | 옛 시스템은 실행가를 예산이라 불렀다. 이 플랜은 예산(PO × 원가율)과 사용액(실행가 합)을 가른다 |
| `/home/user/erp_plant8_260907/db/schema/060_seed_kinds.sql:229` | 「예산 미확보」 | 마감 사유 낱말이고 무관하다 |

## PR 본문 초안

- 예산 = 줄 합(고정). 자동 줄은 기준 증액 때만(D-730), 감액은 경영관리 직접 수정(D-729)으로만
- 원가율 첫 저장 · 가져오기 때 줄 없는 진행 프로젝트에 `처음` 줄(D-747)
- `/projects/budget`(projects.budget 보기 · 서버 판정 · 없으면 404), 예산 값은 이 화면 DTO에만(SC-20)
- [ ] 배포 뒤: 경영관리 계급에 projects.budget 쓰기 켬(권한표) — 켜기 전에는 예산 이력 패널에 「예산 바꾸기」가 없는 것이 정상
- 게이트: `/review` + `/cso`(돈 경로) + `/design-review` → `/qa`(화면)

## 수동 확인(UAT)

- 배포 뒤 경영관리 `projects.budget` 쓰기 켬 → 경영관리 계정 `예산 이력` 패널에 `예산 바꾸기`가 보임(켜기 전엔 없음)

## 열린 항목

- **독립 DOM 감사**(`.planning/phases/07-schedule-notify-audit/audit/07-24-dom-audit.md`)를 하지 않았다. 실행자에게 서브에이전트 도구가 없었고, 자체 실측으로 대신하지 않았다. 오케스트레이터가 감사 에이전트를 띄워야 한다.
- Post-build 게이트 `/review` + `/cso` + `/design-review` → `/qa`가 남았다.
- **SYSTEM_VIEWER 가져오기는 예산 줄을 못 쓴다.** 원가율이 든 페이로드를 가져오면 「사람 계정으로 다시 실행」으로 거절된다.
  - 권장: 후속으로 settings-import에 `--actor <userId>` 인자를 둔다.
  - 그 전까지는 운영자가 설정 화면에서 원가율을 저장한다.

## Known Stubs

없음.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: new-write-action | app/(app)/projects/budget/actions.ts | 예산 직접 수정 쓰기 액션. projects.budget 쓰기 + 행 범위 + 낙관적 동시성을 서버에서 판정한다. /cso 대상 |

## Self-Check: PASSED

- 파일 14개 생성 · 커밋 4개(c28d8c27 · 0c5086ef · 6811486b · 14990c67) 존재를 아래 명령으로 확인했다.
