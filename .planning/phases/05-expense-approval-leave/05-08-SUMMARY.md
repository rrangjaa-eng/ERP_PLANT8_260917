---
phase: 05-expense-approval-leave
plan: 08
subsystem: expenses-list
tags: [expenses, permissions, visibility, list-screen, expenses.team, ctrl-e, risk-permissions]

requires:
  - phase: 05-05
    provides: canSeeExpense 전신 · 문서 화면 · status-map `작성 중`
  - phase: 05-15
    provides: useGridKeyboard.onOpenRow(한 줄 Ctrl+E) · 행 행동 셀 · footerNotices 자리
  - phase: 04.1
    provides: walkRoute · listActiveInstances(결재 지금 단계) · approval_steps.acted_by
provides:
  - 메뉴 키 `expenses.team`(팀 지출결의 보기) + 팀장 시드(없을 때만 넣기)
  - domain/expenses/access.ts — visibleExpenseScope · canSeeExpense(목록 · 합계 · 문서 하나가 SQL 조건 하나)
  - domain/approvals.listCurrentSteps(kind) — 진행 중 인스턴스의 지금 단계 라벨 · 내 후보 여부
  - domain/expenses/list.ts listExpenses · groupExpenses(승인 지급 예정일 서울 구간)
  - /expenses 원장(ListScreen 슬롯 · Table 그룹 · 열 접기 · 폰 접힌 줄 · 50건 쪽 · 빈 셋 · 로딩 · 오류)
  - Table/useGridKeyboard onOpenRow 둘째 인자(범위 줄) · 견적 줄 표 여러 줄 Ctrl+E
affects: [05-09, 05-13, 06-S1, 06-S3, 10-team-pnl]

actuals:
  tokens: 24000
  tasks: 3
  commits: 4
plan_head_before: 1080fbd3c10766d34f8e17cd5ad1d8ff50c14c96

tech-stack:
  added: []
  patterns:
    - "목록 정렬은 SQL 한 곳 — 서브쿼리 q(group_rank + 그룹별 키) → ORDER BY group_rank, CASE…, id → LIMIT/OFFSET. groupExpenses는 순서 보존 머리글만"
    - "목록 페이지 · loading · error는 (list) 라우트 그룹 + view 판정 layout(leave/(list) 선례) — /expenses/new · [id]는 목록 경계 밖"
    - "화면 이동이 따르는 행동의 토스트는 착지 화면이 URL 인자로 띄운다(SubmittedToast)"

key-files:
  created: [domain/expenses/access.ts, "app/(app)/expenses/(list)/page.tsx", "app/(app)/expenses/(list)/layout.tsx", "app/(app)/expenses/(list)/loading.tsx", "app/(app)/expenses/(list)/error.tsx", "app/(app)/expenses/expenses-table.tsx", "app/(app)/expenses/status-filter.tsx", "app/(app)/expenses/list-columns.ts", "app/(app)/expenses/expenses.module.css", test/integration/expense-visibility.test.ts, test/integration/expense-money.test.ts, test/unit/domain/expenses/list-groups.test.ts, test/e2e/expense-list.spec.ts, docs/design/checks/2026-10-04-05-08-expense-list.md]
  modified: [domain/permissions/menus.ts, domain/seed/expenses.ts, domain/approvals/index.ts, domain/expenses/index.ts, domain/expenses/dto.ts, domain/expenses/list.ts, repositories/expenses.ts, "app/(app)/projects/[id]/quote-table.tsx", ui/table/Table.tsx, ui/table/use-grid-keyboard.ts, test/integration/seed-permissions.test.ts, test/unit/ui/grid-keyboard-open-row.test.ts, test/e2e/page-chrome.spec.ts, test/e2e/mobile-design-review-p2.spec.ts]

key-decisions:
  - "보임 = 기안자 ∪ 처리 기록(approval_steps.acted_by EXISTS) ∪ 지금 단계 후보 인스턴스 목록 ∪ (expenses.team 보기 ∧ 문서 팀 = 내 지금 팀) ∪ (company ∧ expenses 보기). 작성 중은 기안자만. 역할 이름 조건 없음"
  - "목록 페이지를 (list) 라우트 그룹으로 — 사용자 지시(10/5 00:55)에 따라 추천안 적용"
  - "여러 줄 Ctrl+E 전부 막힘 한 줄 = 도메인 첫 blocked reason 글자 그대로 — 사용자 지시(10/5 00:55)에 따라 추천안 적용"

requirements-completed: [EXP-08, EXP-01, UX-03]

duration: ~1h10m (이어받은 세션 기준, 시작 2026-10-04T20:05:27Z)
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 08: 지출결의 보임 범위 · 목록 원장 · 여러 줄 Ctrl+E Summary

**팀장은 `expenses.team` 메뉴 권한으로 자기 팀 지출결의(팀 비용은 `프로젝트 미연결 · {종류}` 2행)를 보고, 목록 · 합계 · 문서 · 증빙이 SQL 조건 하나로 같은 보임을 쓰며, 견적 줄 표에서 여러 줄을 골라 `Ctrl+E` 한 번으로 작성 중 문서를 묶어 만든다.**

## Task Commits
1. Task 1(트레이서) — `2d3deb12` test RED · `942c7fc9` feat(메뉴 키 · 시드 · access.ts · listCurrentSteps · 목록 SQL · /expenses 원장 · 자리 화면 단언 갱신). 트레이서 게이트: verify 재실행 초록 뒤 확장
2. Task 2 — `c4b9e472` feat(승인 지급 구간 · (list) 그룹 · loading · error · 통합 expense-money · 단위 list-groups · E2E 보기 · 빈 상태 · 폭)
3. Task 3 — `52e22c45` feat(onOpenRow 범위 줄 · quote-table 여러 줄 Ctrl+E · 착지 토스트 · E2E)

`commits: 4` = `git rev-list --count 1080fbd3..HEAD`(SUMMARY 커밋 전).

## 권한 · 시드 변경
- `MENUS`에 `{ key: "expenses.team", label: "팀 지출결의 보기" }` 한 줄(`expenses` 바로 뒤).
- `domain/seed/expenses.ts`: `TEAM_LEAD_ROLE_ID` × `expenses.team` view `insertPermissionIfAbsent`(관리자가 끈 값은 다시 켜지 않음 — 통합 단언). 시스템 관리자는 기존 MENUS 전체 upsert 루프로 받는다. 다른 역할은 없음(대표 · 본부장 · 경영관리는 업무 범위 company + `expenses` 보기로 전사).

## Deviations from Plan
1. **사용자 지시(10/5 00:55)에 따라 추천안 적용 — 목록 페이지 · loading · error를 `app/(app)/expenses/(list)/`로.** `expenses/loading.tsx`는 하위 `/expenses/new`(자체 loading 없음)까지 감싸 문서 폼으로 갈 때 목록 뼈대가 뜨고, error.tsx도 새 문서 화면 오류를 `지출결의 불러오기 실패`로 바꾼다. 또 로딩 경계 안 `notFound()`는 soft 404(200)다. leave/(list) 선례대로 라우트 그룹 + view 판정 layout으로 옮겼다(URL 불변). 인수 grep은 `(list)/` 경로에서 전부 충족(shimmer 0 · retry 2 · reset 0 · TableSkeleton 3 · 슬롯 0 · 빈 문구 1 · 전체 보기 1).
2. **사용자 지시(10/5 00:55)에 따라 추천안 적용 — 전부 막힘 한 줄은 도메인 blocked reason 그대로**(`거래처 없음 · 거래처 고르기`). 계획 E2E 예시는 `거래처 없음`이지만 셀은 `거래처 없음` + `거래처 고르기` 3차라 같은 문장이고, 화면이 이유를 새로 만들지 않는 04-04 규칙을 따랐다.
3. **사용자 지시(10/5 00:55)에 따라 추천안 적용 — 여러 줄은 문 셀이 있는 줄만 보낸다**(취소 줄 · 저장 전 새 줄 제외 → `막힘 M줄`에 세지 않음). 표 전체 게이트면 아무것도 안 함(표 위 한 줄만).
4. **사용자 지시(10/5 00:55)에 따라 추천안 적용 — 뼈대는 늘 있는 앞 세 열(번호 · 프로젝트 · 항목 · 거래처)만**(금액 · 기안 열은 보는 사람마다 빠져 고정 낱말이면 「뼈대 = 진짜 열 이름」이 깨진다 — 05-01 N4 결재함 선례). 착지 토스트는 `?created=N&blocked=M`(1~999만) → `SubmittedToast`.
5. **[Rule 3] 계획 files 밖** — `ui/table/Table.tsx` · `use-grid-keyboard.ts`(onOpenRow 둘째 인자 — 범위 선택 상태는 quote-table이 아니라 Table 안에 있다), `app/(app)/expenses/list-columns.ts`(서버 loading · 클라이언트 표가 같은 열 이름), `domain/approvals/index.ts` `listCurrentSteps`(지금 단계 라벨 · 후보를 한 번에 — 행마다 조회 금지).
6. **[Rule 3] 판정 입구** — 「내 지금 팀」은 `teamAtDate` 대신 `loadActorTeamScope`(정보 노출 투영 없는 권한 판정 입구, Phase 4와 같음). `EXPENSE_DOCUMENT_KIND`를 access.ts로 옮기고 index가 다시 내보냄(순환 방지). 합계는 `sumKrw` 대신 같은 범위 조건의 SQL `sum`(쪽과 무관한 필터 전체).
7. **[Rule 1] 테스트** — 결재 관련 사례의 새 역할에 `expense.value/amount` 노출 행이 없어 id가 투영에서 빠졌다(제품 동작이 맞음) → 시험에 노출 행 추가. 로딩 경계가 생긴 뒤 머리글 · 제목 읽기는 진짜 표가 보인 뒤(`:visible` · 행 링크 대기).
8. 통합 `expense-money`(M2 · 51건 · USD)는 Task 1 SQL이 이미 계약을 지켜 첫 실행부터 초록 — 그룹 3 정렬을 `desc`로 바꾸면 실패함을 확인(변이 검사)하고 되돌렸다.

**Impact:** 새 의존성 0 · package.json · lockfile · tokens.css · ui/shell diff 0 · 새 색 · 서체 · radius 0 · 마이그레이션 0.

## Verification
- `pnpm test:unit` 전체 251 files · 3870 tests 통과(마지막 커밋 뒤)
- 통합: expense-visibility + seed-permissions 22 · expense-money 3 · (Task 1) evidence-upload · leak-scan · 결재 관련 10 files 126 통과
- E2E `CI=true`: expense-list 7(×2 반복 14) · page-chrome · permissions-grid · expense-new · design-principles(25) · expense-submit-mobile-approval · quote-table(74 묶음) 통과, 폰 mobile-375: mobile-design-review-p2 · mobile-list-empty · mobile-320-no-overflow 41 통과
- lint · typecheck · build 0, `mark-legacy --audit "app/(app)/expenses"` 0, 실측 가로 넘침 0(1280 · 1100 · 800 · 390 · 320)

## 화면(독립 DOM 감사 대상)
- `/expenses`(보기 셋 · 그룹 · 합계 줄 · 빈 셋 · 로딩 · 오류 · 1280/1100/800/390/320), `/projects/[id]` 견적 줄 표(여러 줄 Ctrl+E · 합계 행 한 줄 · 착지 토스트)

## Known Stubs
없음.

## Threat Flags
| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure | app/(app)/expenses/(list)/page.tsx | `?created` · `?blocked` 숫자 인자는 토스트 글자에만 쓴다(1~999 정규식, 데이터 조회 없음) |

## Next Phase Readiness
- 06(S1 · S3)은 `list-columns.ts` `EXPENSE_STATUS_VIEWS`와 `domain/expenses/list.ts` `VIEW_RANKS`에 `지급 대상` · `지급 완료`를 더하면 된다(group_rank 5는 지금 WHERE가 거른다).
- 위험 경로(`domain/permissions/menus.ts`) 변경 — 사용자가 머지. Opus 독립 검토 1명 + 독립 DOM 감사.
- 로컬 `.next/dev/types`가 옛 `expenses/page.js`를 가리켜 build 타입 검사가 깨졌다 — 생성물이라 지웠다(next dev가 다시 만든다).

## Self-Check: PASSED
- 파일: domain/expenses/access.ts · app/(app)/expenses/(list)/{page,layout,loading,error}.tsx · expenses-table.tsx · status-filter.tsx · list-columns.ts · expenses.module.css · test/integration/expense-{visibility,money}.test.ts · test/unit/domain/expenses/list-groups.test.ts · test/e2e/expense-list.spec.ts · docs/design/checks/2026-10-04-05-08-expense-list.md 존재
- 커밋: 2d3deb12 · 942c7fc9 · c4b9e472 · 52e22c45 존재
