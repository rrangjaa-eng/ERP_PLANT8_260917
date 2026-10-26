---
phase: 07-schedule-notify-audit
verified: 2026-10-25T04:55:30Z
status: gaps_found
score: 10/13 must-haves verified
covered_files:
  - .planning/phases/07-schedule-notify-audit/07-01-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-01-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-02-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-02-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-03-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-03-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-04-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-04-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-05-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-05-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-06-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-06-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-07-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-07-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-08-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-08-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-09-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-09-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-10-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-10-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-11-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-11-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-12-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-12-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-13-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-13-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-14-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-14-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-15-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-15-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-16-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-16-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-17-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-17-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-18-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-18-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-19-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-19-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-20-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-20-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-21-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-21-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-22-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-22-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-23-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-23-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-24-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-24-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-25-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-25-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-26-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-26-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-27-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-27-SUMMARY.md
  - .planning/phases/07-schedule-notify-audit/07-28-PLAN.md
  - .planning/phases/07-schedule-notify-audit/07-28-SUMMARY.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - domain/payments/pay-schedule.ts
  - domain/payments/pay-schedule-load.ts
  - domain/payments/targets.ts
  - domain/rules/register.ts
  - domain/settings/keys.ts
  - domain/notify/condition-kinds.ts
  - domain/notify/tick.ts
  - domain/notify/rules.ts
  - domain/notify/rule-admin.ts
  - domain/seed/role-defaults.ts
  - domain/seed/expenses.ts
  - domain/seed/approvals-leave.ts
  - domain/action-log/record.ts
  - test/e2e/role-smoke.spec.ts
  - test/integration/leak-scan.test.ts
  - test/unit/leak-scan-coverage.test.ts
  - test/unit/export-registry-coverage.test.ts
  - test/unit/action-registry-completeness.test.ts
  - test/unit/admin-forms-ui-only.test.ts
covered_digest: "v1:sha256:cb1f8d7693d0d22f07e805fa7b56bcb3b79a66f80995ebaaf2e298021f8ca49a"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "SC5: 계급별 기본값 표가 전 메뉴 기준으로 확정된다 (07-05 must-have: 시드 계급 기본 권한 · 노출이 `domain/seed/role-defaults.ts` 표 한 곳에서 나온다)"
    status: partial
    reason: "기본값 값은 D-722 카드(PR #265)로 확정됐지만 정본 표가 전 메뉴를 덮지 않는다. leave · expenses · expenses.team 메뉴 권한과 approval.value · leave.value · 지출결의 정보 항목 노출 시드가 여전히 표 밖 파일에서 직접 insert-if-absent로 들어간다. 07-05-SUMMARY:97,157은 이를 「부분 충족(†)」으로 적고 「다음 검수 플랜이 표로 옮긴다」고 했으나 07-25(최종 검수)는 옮기지 않았고, 이후 페이즈 어디에도 이 항목이 없다."
    artifacts:
      - path: "domain/seed/approvals-leave.ts"
        issue: "18-25행: 시드 계급 전부에 `leave` view/write 권한과 approval.value · leave.value 노출을 표 밖에서 넣는다"
      - path: "domain/seed/expenses.ts"
        issue: "26-35행: `expenses` view/write · `expenses.team` view(팀장) 권한과 지출결의 정보 항목 노출을 표 밖에서 넣는다"
      - path: "domain/seed/role-defaults.ts"
        issue: "ROLE_DEFAULT_PERMISSIONS에 leave · expenses · expenses.team 행이 없다 — 「정본」이라는 머리 주석(5행)과 맞지 않는다"
    missing:
      - "leave · expenses · expenses.team 권한 행과 approval.value · leave.value · 지출결의 정보 항목 노출 행을 ROLE_DEFAULT_PERMISSIONS / ROLE_DEFAULT_VISIBILITY로 옮기고 seedApprovalsLeave · seedExpenses의 직접 insert를 지운다(재시드 행 변화 0 — test/unit/seed/role-defaults.test.ts · 통합 seed-permissions 고정값으로 확인)"
      - "또는 사용자가 이 분할을 받아들이면 아래 override를 넣는다"
human_verification:
  - test: "결정: SC3 「관리자가 등록된 종류로 새 규칙을 만든다」를 D-717의 종류별 한 규칙(켬/끔 · N일 · 받는 계급 추가 · 이메일) 편집으로 충족한 것으로 받아들일지"
    expected: "받아들이면 overrides에 항목 추가. 아니면 같은 종류의 두 번째 규칙 인스턴스를 만드는 길이 필요(현재 notification_rules는 종류당 한 행 · /admin/notification-rules에 만들기 동작 없음)"
    why_human: "로드맵 문구와 사용자 결정 D-717(2026-10-21) 사이의 해석 문제 — 코드로 판정할 수 없다"
  - test: "결정: SC5 「대표 행동 로그 404」 항목을 2026-10-22 사용자 결정(①을 ⑧과 함께 켤 때까지 보류)으로 확정된 것으로 볼지"
    expected: "받아들이면 overrides에 항목 추가. 지금 main은 대표 /admin/action-log = 404(role-smoke.spec.ts:52가 단언)"
    why_human: "로드맵은 404를 고칠 항목으로 적었고, 사용자는 보류로 결정했다 — 결정의 범위를 사용자가 확인해야 한다"
  - test: "스테이징: 지급 예정일 없는 지출결의를 상신 · 승인 → 상세에 `지급 예정일 · MM-DD (자동)`과 규칙 줄, 지급 목록 `이번 주 금 MM-DD · 마감 MM-DD 14:00` 묶음에 들어가는지"
    expected: "작성일 + 60일(협력사 기한이 있으면 그 일수) 안 마지막 금요일, 마감 = 그 전 영업일 14:00"
    why_human: "통합 · E2E는 녹색이지만 실제 스테이징 데이터 · 설정값으로 한 번 보아야 한다"
  - test: "스테이징: 마감(지급일 전 영업일 14:00) 뒤에 최종 승인 → 지급 목록에서 다음 주 묶음 + `마감 지나 밀림`, 경영관리 `이번 주로` → 이번 주 묶음으로 옮겨지고 `되돌리기`로 원복"
    expected: "밀린 행만 warning 글자, 옮긴 뒤 `수동 지정`, 행동 로그 `payment_schedule_change` 전후 값"
    why_human: "시각 의존 흐름 — 실제 시계로 확인"
  - test: "스테이징: /admin/holidays에서 다음 지급 금요일을 공휴일로 추가 → 같은 지출결의 예정일 · 마감 · 지급 예정일 임박 알림 기준일이 목요일 · 수요일로 앞당겨지고, 수동 지정 문서는 그대로"
    expected: "새로 고침만으로 바뀜(저장된 날짜 없음 — D-705), 공휴일을 지우면 원래대로"
    why_human: "공휴일 표 쓰기가 필요한 상태 변경 — 검증기가 할 수 없다"
  - test: "스테이징: 실제 SMTP로 다음 영업일 9시 묶음 메일 수신(제목 `알림 N건 · MM-DD`, 줄 끝 `열기` 링크)"
    expected: "사람마다 하루 한 통, 볼 수 없는 문서는 링크 없음"
    why_human: "07-VALIDATION Manual-Only — SMTP 실제 값은 사용자 설정 몫"
  - test: "스테이징: /admin/notification-rules에서 규칙 켬 토글 · `수정` 패널에서 일수 범위 밖 값 · 받는 계급 추가 · 이메일 끔 저장"
    expected: "범위 밖은 칸 아래 한 줄 오류, 저장 뒤 행동 로그 `notification_rule_change` 전후 값, 다음 tick에 이메일 끔 규칙은 메일 없음(email_status skipped_rule_off)"
    why_human: "다음 날 tick 결과까지 이어지는 흐름"
  - test: "스테이징: 관리자 폼 8개(사람 · 계급 · 조직 · 거래처 · 법인카드 등록/소유자 수정 · 코드표 · 설정)와 내 계정에서 틀린 값 저장"
    expected: "브라우저 영문 말풍선 없음, 틀린 칸 --danger 테두리 + 아래 한 줄 + 포커스가 그 칸"
    why_human: "시각 계약 — admin-forms-ui-only 시험은 구조만 잰다"
  - test: "스테이징: 375 · 320 · 768 · 1280 폭에서 07 화면(지급 목록 · 지출결의 폼/상세 · 사람 목록/상세 결과 단계 · 프로젝트 상세 정보 면/서류 · 거래처 패널 · 계급/조직/권한표 · 알림 규칙 · 알림함 · 예산 현황 · 행동 로그 상세) 가로 스크롤 없음과 키보드 포커스 복귀"
    expected: "각 플랜의 `verification: backstop` truth 25개(07-08 · 12 · 16~25 · 28) 그대로 — 일부는 DOM 감사(audit/) · E2E가 이미 쟀다"
    why_human: "backstop 등급 truth는 존재 · 연결만으로 VERIFIED가 될 수 없다(Step 5b)"
  - test: "결정: AQ-07 — 알림함 액션 3개 · 내 계정 비밀번호 · 확인증 공개 제출을 액션 레지스트리 밖(본인 범위 · 토큰 범위)으로 두는 것을 확인"
    expected: "test/unit/action-registry-completeness.test.ts:16-24 면제 3개가 그대로 정본"
    why_human: "07-03-SUMMARY:89 「사용자 확인 대기」로 남아 있다"
  - test: "검토: 플랜 금지 항목(prohibitions) 104개 중 이 검증이 직접 확인한 5개를 뺀 99개(test 등급 75 · judgment 등급 24)"
    expected: "unverified-prohibition — human review recommended"
    why_human: "test 등급도 항목별 강제 시험을 이 검증에서 하나씩 연결하지 못했다(fail-closed)"
---

# Phase 7: 공휴일·지급일·마감·알림 + 전 메뉴 권한 검수 Verification Report

**Phase Goal:** 경영관리가 지급 예정일·결재 마감을 공휴일 표 기준의 자동 계산으로 받고, 직원은 마감·기한 알림을 앱과 이메일로 받으며, 인트라넷 패리티가 끝난 이 시점에서 권한·정보 노출·행동 로그를 전 메뉴 기준으로 검수한다
**Verified:** 2026-10-25T04:55:30Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Code under test:** main `cacb2b0` (worktree `claude/project-thread-msdf7i`, clean except `.claude/gates/phase-07.log`)

**CI evidence:** CI run 40151481669 (PR #293 head `c462880`) — quality · integration (1)(2) · e2e (1)(2) · tested-tree all success. `git diff c462880 cacb2b0` is empty, so this run tested the same tree as main. Deploy run 40162649457 on `cacb2b0`: staging success. Locally I ran only targeted unit tests (19 files, 344 passed — payments, notify, notify-tick, seed, action-log, leak-scan-coverage, export-registry-coverage, action-registry-completeness, admin-forms-ui-only, design-system-docs). I did not run integration or E2E locally.

**MVP mode:** The roadmap marks the phase `mode: mvp`, but the Goal is not in user-story form (`As a …, I want to …, so that ….`). Each plan has its own user story. I verified goal-backward against the roadmap Success Criteria and did not refuse.

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC) | Status | Evidence |
|---|---|---|---|
| 1 | SC1: If 지급 예정일 is left empty, the date is calculated automatically: term (setting `payment.term_days` default 60, or vendor term) and the "last pay weekday before the term" rule | ✓ VERIFIED | `domain/payments/pay-schedule.ts:96-104` (window base < d ≤ limit, last weekday then prev business day), `pay-schedule-load.ts:69` (vendor term ?? setting), `domain/settings/keys.ts:1347-1381` (3 keys). UI: `app/(app)/expenses/[id]/payment-section.tsx:330-333`, `expense-form.tsx:877` `(자동)`. Tests: `test/unit/payments/pay-schedule.test.ts` (local green), `test/integration/payments/effective-date.test.ts:191` vendor term (CI green) |
| 2 | SC1: 결재 마감 = 지급일 전 영업일 14:00 (setting). Missing it drops the doc from that week, judged through `domain/rules.gate` | ✓ VERIFIED | `pay-schedule.ts:90-92` cutoffOf, `:109-123` push to next pay day; `domain/rules/register.ts:387-396` gate `payment.cutoff`; `domain/payments/targets.ts:93-96` calls `gate(row,"payment.cutoff",schedule)`. `test/integration/payments/pay-week-targets.test.ts:67` (on-the-minute approval → this week, +1 min → next week, DTO = gate) |
| 3 | SC1: Holidays move pay date, cutoff and alert together on the 04.2 table and business-day function. Confirming a holiday re-derives the dates (D-705) | ✓ VERIFIED | Same `HolidayLookup`/`isBusinessDay` from `domain/holidays/business-day` and `loadHolidayLookup` (`pay-schedule-load.ts:4-5,36-43`). Nothing stored, so re-derive happens on the next read (`:1-2`). Alert date comes from the same schedule (`pay-schedule.ts:137`, `domain/notify/kinds/pay-week-alert.ts:28-36`). Tests: `test/integration/payments/holiday-rederive.test.ts:55`, `test/integration/notify/pay-week-alert.test.ts:113`, `test/unit/payments/pay-schedule-holiday-base.test.ts` (D-749) |
| 4 | SC2: This phase's notifications go out through the 04.2 inbox and email channel | ✓ VERIFIED | `domain/notify/tick.ts:138-189` writes notification_log rows with emailStatus (incl. `skipped_rule_off`) into the 04.2 email phase |
| 5 | SC3: Condition kinds are registered in code. A rule = kind × parameters (target doc · N days · recipients · channel) | ✓ VERIFIED | `domain/notify/condition-kinds.ts:43-81` (`ConditionKind` with dateUnit/defaults/daysRange/recipient; 14 kinds), `domain/notify/rules.ts:24-44` effectiveRule merge |
| 6 | SC3: The 4 default rules (종료 후 지출결의 없음 · 지급 예정일 임박 · 결재 대기 초과 · 증빙 미첨부) and the 2 deferred from Phase 6 (선결제 증빙 독촉 · 대리 등록 → 담당 PM) are on by default | ✓ VERIFIED | `condition-kinds.ts:64-69`. Each kind has `defaults.enabled: true` (`kinds/project-end-no-expense.ts:16`, `pay-week-alert.ts:18`, `approval-waiting.ts:40`, `paid-no-evidence.ts:11`, `prepaid-evidence.ts:12` (days from `evidence.prepaid_due_days`), `proxy-registered.ts:15` 담당 PM). These are code defaults, not DB seed rows (D-717 / 07-07). `test/integration/notify/kinds-core.test.ts:58` order |
| 7 | SC3: An admin creates a new rule from a registered kind | ? UNCERTAIN | `/admin/notification-rules` (`domain/notify/rule-admin.ts:112-168`) only edits the single rule per kind: on/off, N days, extra roles, email. There is no create action and `notification_rules` holds one row per kind (07-07). This matches user decision D-717 (`07-CONTEXT.md:62`) but is narrower than the SC/NOTI-03 wording. Routed to human decision (override suggested below) |
| 8 | SC4: The rules are evaluated by 04.2's `/internal/notify-tick` | ✓ VERIFIED | `app/internal/notify-tick/handle.ts:4` → `domain/notify/tick.ts:85,138` (`CONDITION_KINDS` ⊕ `listNotificationRules`) |
| 9 | SC5: The leak scan covers every action, DTO type and Excel export function, and unmapped DTOs = 0 | ✓ VERIFIED | `test/unit/leak-scan-coverage.test.ts` (all `actions.registry.ts` and `registerDto(` modules imported), `test/unit/action-registry-completeness.test.ts:16-24,121-130` (every `"use server"` file is registered or in a reasoned 3-file exemption: account · notifications · `c/[token]`; I independently found the same 3 files with no registry), `test/unit/export-registry-coverage.test.ts`, `test/integration/leak-scan.test.ts:863-875` "덮이지 않는 `*Dto` 타입이 없다" (CI green). Local unit green |
| 10 | SC5: The 계급별 기본값 table and the core action types list are confirmed across all menus | ✗ FAILED (partial) | Core action list: `domain/action-log/record.ts:12-60,125+` includes the 07 types. Defaults table: the values were confirmed by the D-722 card (PR #265), but `domain/seed/role-defaults.ts` does not cover all menus. leave · expenses · expenses.team permissions and the related visibility are still seeded outside the table (`domain/seed/approvals-leave.ts:18-25`, `domain/seed/expenses.ts:26-35`). 07-05-SUMMARY:72,97,157 records this as "부분 충족(†)" and says the next audit plan would move them; 07-25 did not |
| 11 | SC5: A Playwright smoke per seed role (what each role sees and cannot see on the same screen) runs in CI | ✓ VERIFIED | `test/e2e/role-smoke.spec.ts:29-146`. 5 seed roles × paths + element rows. `playwright test --list --project=desktop` lists 6 tests, and the desktop project is in CI e2e shards (`.github/workflows/ci.yml:219`). CI e2e green |
| 12 | SC5: The 8 admin forms use `ui/form` · `ui/select`: one-record forms use `PanelForm`, page forms (설정 · 내 계정) use the §6-3 page layout, no admin form uses any other layout, and errors follow §7-2 (no browser bubble) | ✓ VERIFIED (structure) | `PanelForm` in person-form, roles/org clients, vendor-form, `corp-cards/card-form.tsx:95,217` (two forms), code-item-form, holiday-form. Settings and account use `ui/form/Form`. `ui/form/Form.tsx:23` `noValidate`, `ui/form/focus-first-invalid.ts`. `test/unit/admin-forms-ui-only.test.ts:30,135` `UI_ONLY_PENDING = {}` asserted empty (local green). The only raw `<form>`s left are filter bars, which are allowed exclusions (`:14-19`). The visual look is a human item |
| 13 | SC5: The problem where the CEO gets 404 on the action log right after a fresh deploy (ADMN-10 gap) is a confirmed item of this audit | ? UNCERTAIN | Still 404 by design. User decision 2026-10-22: hold ① until it can be enabled together with ⑧ (`07-05-SUMMARY.md:26,44,148`). `domain/seed/role-defaults.ts:29` comment, `test/e2e/role-smoke.spec.ts:52` asserts CEO `/admin/action-log` = 404. Whether the decision counts as "확정" is for the user to confirm (override suggested) |

**Score:** 10/13 truths verified (0 present-but-behavior-unverified, 1 failed-partial, 2 uncertain → human decision)

Scope note: the 28 plans have roughly 230 must-have truths. I checked the ones the roadmap SCs depend on directly, and spot-checked the named tests for the rest. Plan-level truths backed by integration or E2E tests rely on the CI run above (same tree). The 25 truths tagged `verification: backstop` (responsive widths and keyboard focus) need direct observation, so they are grouped into one human item.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `domain/payments/pay-schedule.ts` | Pure functions for pay date, cutoff and rule line | ✓ VERIFIED | 205 lines. Used by targets, pay-week-alert, pre-cutoff-unapproved, expense DTO |
| `domain/payments/pay-schedule-load.ts` | Read-time derive with holiday lookup | ✓ VERIFIED | Wired from `targets.ts:143,366,757` and the notify kinds |
| `domain/rules/register.ts` gate `payment.cutoff` | Cutoff judgment | ✓ VERIFIED | Called in `targets.ts:94` |
| `domain/notify/condition-kinds.ts` + `kinds/*` (15 files) | Registry with 14 kinds | ✓ VERIFIED | Consumed by `tick.ts:85`, `rule-admin.ts`, `/admin/notification-rules/page.tsx` |
| `db/migrations/0039`…`0046` | Phase 7 schema S1–S4 and the action_log trigger | ✓ VERIFIED | 0046 has triggers BEFORE DELETE/TRUNCATE/UPDATE only, no INSERT trigger. Tested by `test/integration/schema/action-log-immutable.test.ts` |
| `domain/seed/role-defaults.ts` | Canonical defaults table for seed roles | ⚠️ PARTIAL | Exists and is wired from `domain/seed/index.ts:243,279`, but leave and expenses rows are outside it (gap) |
| `test/e2e/role-smoke.spec.ts` | Role exposure smoke | ✓ VERIFIED | In CI desktop shards |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `domain/payments/targets.ts` | `domain/rules/register.ts` | `gate(row, "payment.cutoff", schedule)` (:94) | WIRED |
| `domain/notify/kinds/pay-week-alert.ts` | `pay-schedule-load.ts` | `loadPaySchedules` (:28) and alertDate/cutoffAt (:35) | WIRED |
| `app/internal/notify-tick/handle.ts` | `domain/notify/tick.ts` | `runTick` (:4) | WIRED |
| `domain/notify/tick.ts` | `repositories/notification-rules` | `effectiveRules(CONDITION_KINDS, listNotificationRules)` (:138) | WIRED |
| `pay-schedule-load.ts` | `domain/holidays/calendar` | `loadHolidayLookup` (:41) | WIRED |
| `test/integration/leak-scan.test.ts` | `DTO_REGISTRY` and the domain `*Dto` types | runtime comparison (:863-875) | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Expense detail `지급 예정일 (자동)` | `schedule.payDate` | `loadPaySchedules` ← evidence `issued_on` / `submitted_at` + settings + `holiday` table + vendor term | yes (DB reads per call) | ✓ FLOWING |
| Pay targets groups | `ScheduledPaymentTarget` | `listPaymentTargets` → `judgeTargets` → gate | yes | ✓ FLOWING |
| Rules screen rows | `listRuleRows` | `CONDITION_KINDS` ⊕ `notification_rules` | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Pay schedule, cutoff, holiday base, no-fixed-weekday; notify ladder and rules; seed role-defaults; action-log; leak/export/action registry coverage; admin forms ui-only | `pnpm exec vitest run --project unit <19 files>` | 19 files, 344 tests passed | ✓ PASS |
| Role smoke is enumerated in the desktop project | `playwright test --list --project=desktop test/e2e/role-smoke.spec.ts` | 6 tests | ✓ PASS |
| Integration and E2E (holiday-rederive, pay-week-targets, pay-week-alert, kinds-core, rule-admin, leak-scan DTO, role-smoke, payment-schedule spec) | CI run 40151481669 (same tree as main) | all jobs success | ✓ PASS (CI) |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` is declared by the phase.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| EXP-11 | Pay date calculated automatically (term default 60 / per vendor, last pay weekday before the term, configurable) | ✓ SATISFIED | Truths 1, 3 |
| EXP-12 | Cutoff = business day before pay day at 14:00 (configurable). Missing it drops the doc from that week. Holidays move cutoff and alert together | ✓ SATISFIED | Truths 2, 3 |
| NOTI-03 | Admin creates new rules; kinds are registered in code; rule = kind × parameters; 4 default rules seeded | ? NEEDS HUMAN | Truths 5, 6, 8 verified. The "새로 만든다" clause is narrowed to per-kind editing by D-717 (truth 7) |

REQUIREMENTS.md still marks EXP-11 · EXP-12 · NOTI-03 `Pending` (:47-48,97,228-263), and the ROADMAP Phase 7 plan checkboxes are all `[ ]`. Both are tracking issues, not code issues; the orchestrator updates them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| app · domain · repositories · lib · ui · db/schema · scripts | — | TBD/FIXME/XXX/TODO/HACK/placeholder | none found | — |
| `.planning/phases/07-schedule-notify-audit/07-VALIDATION.md` | 51 and others, 136-150 | Stale map: 8 referenced test paths do not exist under those names (e.g. `payments/schedule-manual.test.ts` is actually covered by `move-to-this-week.test.ts`; `action-log-immutable` is under `schema/`), and sign-off is still `pending` | ℹ️ Info | Documentation only. The equivalent tests exist and are green in CI |
| `domain/seed/approvals-leave.ts`, `domain/seed/expenses.ts` | 18-25, 26-35 | Seed defaults outside the canonical table | ⚠️ Warning | Gap 1 |

### Prohibitions (must_haves.prohibitions)

There are 104 prohibitions: 80 `verification: test` and 24 `verification: judgment`, all `status: resolved`. I confirmed five directly with enforcement evidence:
- No hardcoded weekday or cutoff: `test/unit/payments/no-fixed-weekday.test.ts`, green.
- No INSERT trigger on action_log: `0046_phase7_action_log_immutable.sql:11,37-41`.
- No budget column on `projects`: `db/schema/projects.ts:34`.
- No per-person opt-out or instant-send columns: `db/schema/notifications.ts`.
- `payment.cutoff` does not block the payment action: `register.ts:387-396` only judges week membership, and `targets.ts:90` says so.

I did not link the other 99 one by one. Each is flagged `unverified-prohibition — human review recommended`. This is fail-closed handling, not a finding of a violation.

### Human Verification Required

These are listed in the frontmatter `human_verification`: 2 SC interpretation decisions (truths 7 and 13), 1 AQ-07 decision, 6 staging checks (pay date, cutoff push and 이번 주로, holiday shift, SMTP digest, rules screen, admin form errors), 1 grouped responsive/keyboard backstop check, and 1 prohibition review.

### Override suggestions (only if the user accepts)

```yaml
overrides:
  - must_have: "SC3: An admin creates a new rule from a registered kind"
    reason: "D-717 (사용자 카드 2026-10-21): 관리자는 종류별 규칙의 켬/끔 · N일 · 받는 계급 추가 · 이메일만 바꾼다 — 종류당 규칙 하나"
    accepted_by: "{user}"
    accepted_at: "{ISO timestamp}"
  - must_have: "SC5: The problem where the CEO gets 404 on the action log right after a fresh deploy (ADMN-10 gap) is a confirmed item of this audit"
    reason: "사용자 결정 2026-10-22: ①(대표 admin.action-log 보기)은 ⑧(action_log.detail 노출)과 함께 켤 때까지 보류 — 404 유지가 확정 결과"
    accepted_by: "{user}"
    accepted_at: "{ISO timestamp}"
```

### Gaps Summary

There is one gap. SC5's "계급별 기본값 표 … 전 메뉴 기준으로 확정" is only partly met. The values were confirmed through the D-722 card, but the canonical table `domain/seed/role-defaults.ts` leaves out the leave and expenses menus: those rows and the related visibility are still inserted directly by `seedApprovalsLeave` and `seedExpenses`. 07-05 left this for "the next audit plan", and 07-25 did not do it. The fix is small (move the rows into the table; re-seeding must change no rows) and touches no risk path. The user can also accept the split with an override.

Everything else the roadmap asks for holds in the code and is backed by green tests on the exact main tree:
- automatic pay dates and cutoff through one pure function and the `payment.cutoff` gate
- holiday-driven re-derivation
- 14 registered condition kinds with the 6 default-on rules, evaluated by notify-tick
- the leak scan with 0 unmapped DTOs
- the role smoke in CI
- admin forms on `ui/form`

Two SC clauses (truths 7 and 13) differ from the roadmap wording because of explicit user decisions. They need the user to accept an override or reopen the decision.

---

_Verified: 2026-10-25T04:55:30Z_
_Verifier: Claude (gsd-verifier)_
