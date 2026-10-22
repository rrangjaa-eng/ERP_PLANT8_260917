---
phase: 07-schedule-notify-audit
plan: 12
subsystem: ui
tags: [design-system, status-map, tokens, table, role-menu]
requires: []
provides:
  - "SYSTEM.md 07 개정 11건(1 · 2·3 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12) + DECISIONS 기록 10개"
  - "status-map 새 낱말 여섯"
  - "표 면 역할 토큰 셋 중립 재배정 + 표 CSS 초록 면 제거"
  - "ADMIN_MENUS 알림 규칙 자리(키 없어 걸러짐)"
affects: [07-16, 07-17, 07-18, 07-19, 07-20, 07-21, 07-22, 07-23, 07-24, 07-25]
plan_head_before: e3407821814d715b5d2ad37beaab6767ea7ef37b
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: ["표 면은 역할 토큰 재배정 한 곳으로 모든 표 화면에 퍼진다", "포커스 칸 안쪽 선은 outline-offset 음수 (stylelint가 box-shadow 리터럴 금지)"]
key-files:
  created:
    - test/unit/ui/role-menu-notification-rules.test.ts
    - docs/design/checks/2026-10-21-07-12-system-amendments.md
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - docs/design/tokens.css
    - ui/status-tag/status-map.ts
    - ui/shell/role-menu.ts
    - ui/table/Table.module.css
    - test/unit/ui/status-map.test.ts
    - test/unit/design/tokens.test.ts
    - test/unit/design-system-docs.test.ts
    - test/e2e/evidence-list-audit.spec.ts
requirements-completed: [NOTI-03, EXP-12]
status: complete
---

# Phase 07 Plan 12: SYSTEM 개정 묶음 Summary

07 화면이 서는 SYSTEM 정본 개정 11건(DECISIONS 기록 10개)과 상태 낱말 여섯 · 관리 메뉴 알림 규칙 자리 · 표 면 중립 재배정(표 안 초록 면 0)을 한 PR로 넣었다.

## 무엇을 만들었나

- **Task 1 (트레이서)**: DECISIONS 「07 SYSTEM 개정 1」 → SYSTEM §7-5 「(07 보강 — 개정 1)」(D-741 문장 포함) → `status-map.ts` 여섯 줄(`마감 지나 밀림` warning · `수동 지정` muted · `계좌 바뀜` warning · `잠김` danger · `초과` danger · `수금 지연` warning) 순으로 끝에서 끝까지. 쇼케이스 `/dev/components`는 표를 그대로 그려 자동 반영. `ADMIN_MENUS`에 `admin.notification-rules` 자리를 `시스템 설정` 바로 뒤에(키가 없어 걸러짐).
- **Task 2**: 개정 2·3(§7-12) · 5(§6-2) · 6(§7-2) · 7(§7-17 + §7-17/§7-7 SUCCESS 예외) · 8 · 10(§7-13) · 9(§6-1) · 12(§2-4)를 DECISIONS 기록 뒤 SYSTEM 줄로. `design-system-docs.test.ts`에 SUCCESS 예외 두 자리 단언 추가(기존 「바로 닫는다/닫힌다」 단언은 그대로). §6-10 표와 §7-12 tick 줄은 07-19 몫이라 건드리지 않음.
- **Task 3 (개정 11)**: `--surface-group`→n-50 · `--surface-selected`→n-100 · `--surface-dirty`→n-60. `Table.module.css`에서 `--accent-weak` 배경 전부 제거(고른 행 · 범위 선택 = `--surface-selected`, 입력 칸 투명, 저장 완료 틴트 시작색 `--surface-selected`), 포커스 칸 = `--surface-base` + 안쪽 2px `--accent`. SYSTEM §0 · §1-4 · §7-2 · §7-3 · §7-13의 옛 초록 면 문장 정리, 옛 DECISIONS 기록 두 개 끝에 표지 한 줄.

## Commits

| 해시 | 내용 |
|---|---|
| dc92789 | feat: 07 status words six and notification-rules admin menu slot (Task 1) |
| 048607c | docs: 07 SYSTEM amendments 2-3, 5-10, 12 with result-step SUCCESS exception (Task 2) |
| bfe9998 | feat: neutral table surfaces and 2px accent focus cell (amendment 11) (Task 3) |

`commits: 3` = `git rev-list --count e340782..HEAD`(요약 커밋 제외, 요약 커밋은 이 파일을 넣는 4번째).

## 테스트 · 수락 기준 (실제 돌린 결과)

- `pnpm exec vitest run --project unit` status-map · role-menu-notification-rules · role-menu · admin-menu-registry · design-system-docs · design/tokens: **6 파일 509 테스트 통과**. `test/unit/ui` 전체 + tokens + design-system-docs 한 번 더: 59 파일 1090 테스트 통과.
- RED를 먼저 봄: Task 1(7건 실패), Task 3(5건 실패). Task 2 단언은 문서를 먼저 고친 뒤 시험을 더해 RED를 따로 보지 못했다(아래 편차).
- `pnpm lint` 종료 0 · `pnpm typecheck` 종료 0 · `pnpm build` 종료 0.
- 수락 grep 전부 충족: `07 보강 — 개정` 줄 10(개정 11 포함 시 11) · DECISIONS `07 SYSTEM 개정 n — ` 제목 10 · `결과 단계` 3 · `고치기 취소` · `기본 접힘` · `실제 바뀌었던 칸만` · `복사됨` · `보기도 켬` · `aria-controls` · `기간 · MM-DD~MM-DD` 각 1 이상 · 설정·권한 표 줄 main과 동일 1 · `옅은 초록` 0 · `background: var(--accent-weak)` 0 · 토큰 3줄 각 1 · `evidence-table.tsx` diff 빈 출력 · SYSTEM에 새로 더한 `--토큰` 이름은 전부 `tokens.css`에 있음.
- E1(D-725): origin/main에 06.1-15 · 16 SUMMARY 둘 다 존재 확인.

## 실행하지 않은 것 (오케스트레이터 몫)

- **독립 DOM 감사**(`audit/07-12-dom-audit.md`) — 실행자가 아닌 별도 에이전트의 `CI=true` 실측이라 실행하지 않았다. Task 3 수락 기준의 마지막 항목(감사 보고서에 견적 표 1280 · 768 실측 줄)은 그 뒤에 충족된다.
- `/review` · `/design-review`(Codex) · `/qa` 화면 PR 게이트.
- E2E는 돌리지 않았다(CLAUDE.md §5 작업 중 단계). `evidence-list-audit.spec.ts`의 편집 표 머리글 기대 색만 새 값으로 고쳤다.

## 편차 (Deviations from Plan)

1. **[Rule 3 - Blocking] 포커스 칸 안쪽 선을 `box-shadow` 대신 `outline`으로.** 플랜 문구는 `box-shadow: inset 0 0 0 var(--focus-w) var(--accent)`인데 stylelint가 `box-shadow`에 `var(--shadow-*)`/`var(--inset-*)`만 허용한다. 새 토큰을 만들면 「새 토큰 금지」를 어기므로, 같은 픽셀 모양의 `outline: var(--focus-w) solid var(--accent); outline-offset: calc(-1 * var(--focus-w))`를 썼다. DECISIONS 개정 11 ⑶에 이유를 적었다. 감사는 outline-color / outline-offset으로 판정해야 한다.
2. **[Rule 1] 옛 시험 정리.** `tokens.test.ts` 「후보 7 — --surface-dirty는 --g-100 계열」 단언은 개정 11과 모순이라 인쇄 흰색 단언만 남겼다. 금지 쌍 주석 값 4.26 → 4.39 · 4.18 → 4.31.
3. **[Rule 1] 연쇄 문장 정리(SYSTEM).** 플랜이 지목한 줄 외에도 같은 뜻의 옛 문장이 있어 같이 고쳤다 — §7-3 편집 표 머리글 `--g-100` · 범위 선택 `--g-50` · 저장 완료 틴트 · 고른 행 면(`--accent-weak`) · §7-13 머리글/모서리 `--g-100`, §1-4 대비 수치(그룹 위 `--text-faint` 5.02 · `--text-group` 10.43 · 선택 위 `--text-muted` 5.34).
4. **TDD 규율**: `design-gate` · `test-driven-development` · `verification-before-completion` 스킬은 이 세션에서 Skill 도구로 불러지지 않았다(Unknown skill). 디스크의 `.claude/skills/design-gate/SKILL.md` · `CHECKLIST.md`는 직접 읽고 따랐다(점검표 작성). TDD와 검증은 같은 규율을 손으로 따랐다. 스킬 불가 사실을 여기 적는다.
5. **커밋 공저자 줄**: 지시문은 `Claude Opus 5.5`였으나 이 세션의 시스템 첨부 지침이 `Claude Sonnet 5.5`로 지정하고 실제 모델도 Sonnet이라 후자를 썼다.

## 열린 항목 · 이후 플랜/오케스트레이터에 넘김

- **대비 위험(감사에서 axe 확인 필요)**: 고른 행 면이 `--accent-weak`(g-50)에서 `--surface-selected`(n-100)로 바뀌어 고른 행 안의 `--status-success`(4.31) · `--text-faint`(4.39) 글자가 4.5 미만이다(금지 쌍). 일괄 처리 표(06-29 selectable)의 고른 행에서 이 색 글자를 쓰는지 DOM/axe로 확인하고, 쓰면 글자 색을 바꾸는 후속이 필요하다. 플랜이 명시한 값이라 이 PR에서는 따랐다.
- **표 밖 `--accent-weak` 면은 그대로**(그 화면 플랜 몫): `app/(app)/projects/[id]/project-detail.module.css:94,369` · `app/(app)/expenses/expenses.module.css:271` · `app/(app)/expenses/evidence/evidence-table.module.css:37` · `app/(app)/pnl/reserves/reserves.module.css:20` · `app/(app)/certs/events/[id]/event-detail.module.css:86`. 표 칸에 초록 면을 직접 쓰는 곳이면 개정 11 위반이라 DOM 감사가 견적 표(project-detail) 칸 배경을 반드시 재야 한다.
- **§7-12 안 옛 문장 충돌 가능성**: 확인증 사건 알림 줄(04.3-10 ⑱)이 「링크가 없다(위 E② 그대로)」라고 쓴다. 개정 2가 E②를 완화했으므로 07-19가 §7-12 tick 줄(개정 13)을 넣을 때 그 문장도 함께 정리하는 게 좋다. 07-12는 지시대로 손대지 않았다.
- `test/e2e/relax-candidates.spec.ts:140` 시험 제목에 「--g-100 계열」이 남았다(단언은 토큰 해석값이라 통과). 문구만 낡았다.
- `test/unit/ui/relax-candidates-css.test.ts:68` 제목의 「옅은 초록 면」도 문구만 낡았다.
- 개정 4(§6-10 표 줄 + 관리 메뉴 키 목록 + 페이지)와 13(§7-12 사건 알림 tick)은 07-19 몫. 키 시드는 07-15.
- 통합 · E2E · CI 전체는 로컬에서 돌리지 않았다(Postgres 필요 · CLAUDE.md §5는 ready 때 CI가 한 번).

## Threat Flags

없음 — 새 네트워크 · 인증 · 파일 접근 면 없음. T-07-12-01은 `role-menu-notification-rules.test.ts`로 완화, T-07-12-02 · 03은 개정 2 · 7 문장에 반영(구현 시험은 07-14 · 07-17 · 07-19).

## Self-Check: PASSED

- 파일 존재: 위 key-files 전부 `git status`/`ls`로 확인.
- 커밋 존재: dc92789 · 048607c · bfe9998 `git log`로 확인.
