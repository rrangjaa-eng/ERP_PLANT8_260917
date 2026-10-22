---
phase: 07-schedule-notify-audit
plan: 08
type: execute
status: complete
requirements: [EXP-11, EXP-12]
branch: claude/07-08-settings-forms
merge_owner: session
subsystem: settings / admin forms
tags: [settings, ui-select, ui-form, lockout-range, cost-rate, collection-due-days, sc-15]
commits: 3
plan_head_before: 85600e3295fccac7a41ec22481ca8c3037aca79d
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
files_modified:
  - domain/settings/keys.ts
  - domain/settings/registry.ts
  - repositories/settings.ts
  - domain/seed/index.ts
  - app/(app)/admin/settings/settings-form-client.tsx
  - app/(app)/admin/settings/settings.module.css
  - ui/select/Select.tsx
  - ui/select/Select.module.css
  - app/(app)/admin/holidays/holiday-form.tsx
  - app/(app)/admin/holidays/holidays.module.css
  - app/(app)/admin/corp-cards/card-form.tsx
  - app/(app)/admin/corp-cards/corp-cards.module.css
  - app/(app)/admin/code-tables/evidence-type-fields.tsx
  - app/(app)/admin/code-tables/code-tables.module.css
  - test/unit/settings/phase7-keys.test.ts
  - test/unit/admin-forms-ui-only.test.ts
  - test/integration/settings-cost-rate.test.ts
  - test/e2e/settings.spec.ts
  - test/e2e/change-password.spec.ts
  - test/e2e/settings-approval-route.spec.ts
  - test/e2e/form-label-section-gap.spec.ts
  - ui/form/focus-first-invalid.ts
  - ui/table/Table.module.css
  - app/(app)/account/change-password-form.tsx
  - test/e2e/holidays.spec.ts
  - test/e2e/corp-cards.spec.ts
  - test/e2e/code-tables.spec.ts
  - docs/design/checks/2026-10-22-07-08-audit-fixes.md
  - .planning/phases/07-schedule-notify-audit/audit/07-08-dom-audit.md
  - docs/design/checks/2026-10-22-07-08-settings-form.md
---

# 07-08 SUMMARY — 설정 · 관리자 폼 ui 이관과 새 설정 키

한 줄: 로그인 잠금 범위(3~10회 · 1~60분, 범위 밖 저장값은 기본값으로 읽기), 비울 수 있는 원가율 · 수금 기한 일수 키, 설정 화면 `ui/form` · `ui/select` 이관, 공휴일 · 법인카드 · 증빙 종류 폼의 네이티브 입력 0.

## 만든 것

### Task 1 (tracer) — dd606a0d
- `AUTH_LOCKOUT_THRESHOLD`(잠금 횟수, 3~10) · `AUTH_LOCKOUT_WINDOW_MINUTES`(잠금 시간, 1~60, 힌트 `1~60분`). 범위 밖은 `범위 a~b · 다시 입력` 한 줄(`refine` message — `koreanZodErrorMessage`가 `custom` 코드만 문구를 내보내므로).
- 두 키 `readInvalidAsDefault: true` — 범위 밖 옛 저장값 읽기는 예외 없이 기본값(5 · 15), 로그는 `settings.invalid_stored_value`에 키와 오류 코드만. `lockoutConfig()`가 던지지 않는 것을 단위 시험으로 고정(C-P1-2).
- 시험: `test/unit/settings/phase7-keys.test.ts`(RED 7건 확인 뒤 GREEN).

### Task 2 — 10af53a3
- `PROJECT_COST_RATE_PCT`(원가율, 0~100 · 0.1 단위, 기본 null · 비움 ≠ 0), `PROJECT_COLLECTION_DUE_DAYS`(수금 기한 일수, 1~365, 기본 60). 둘 다 프로젝트 섹션, `readBy:{phase:"7"}`(소비자는 07-22 · 07-24 몫). 지급 섹션 첫 칸이 `지급 기한 일수`(PAYMENT_PAIRS 푸시 순서 조정).
- `describeSettingField`가 null 허용 숫자 키를 숫자 칸으로 서술(`unwrapNullable`).
- null 저장: drizzle이 JS null을 SQL NULL로 보내 NOT NULL jsonb에 걸리는 문제 → `repositories/settings.ts`의 `storedJson`(JSON null) 사용, 시드는 null 기본값을 건너뜀. 가져오기 · 내보내기 경로 포함.
- `settings-form-client.tsx`: boolean · multi-enum 오류 → `Form.Error`, enum · 결재선 단계 select → `Form.Field` + `ui/select`. `Select`는 호출부 `aria-describedby`를 오류 · 힌트 id와 합친다(힌트 ISSUE-001 보존), `.select:disabled`를 설정 css에서 `ui/select`로 옮김.
- 시험: `test/integration/settings-cost-rate.test.ts`(실 Postgres: 미설정 null · "12.5" · 빈 값 → JSON null · "0" → 0 · "100.1" 거부), settings E2E(잠금 횟수 11 → 오류 → 5, 지급 · 원가율 · 수금 기한 일수), change-password E2E(newPassword `aria-describedby`), settings-approval-route E2E 선택자 갱신.

### Task 3 — 45b1d311
- `holiday-form` · `card-form` · `evidence-type-fields`의 네이티브 `input` / `select`를 `TextField` · `ui/select`로. 안 쓰는 css(`.textInput` · `.select` · `.selectInvalid`) 삭제, 추가한 css 값 0.
- `test/unit/admin-forms-ui-only.test.ts`: TypeScript 컴파일러 API로 `app/(app)/admin`, `app/(app)/account`의 JSX `select` · `input`(checkbox · radio · hidden 제외)을 파일마다 세어, 영구 제외(`filter-bar.tsx` · `code-item-form.tsx`) 또는 맡은 플랜 대기(vendor-form → 07-20, person-form · person-detail-client · leave-section → 07-17, roles-client · org-client → 07-21) 밖 파일이 있으면 빨갛다. 07-25가 대기 목록을 비우고 0을 단언한다.
- design-gate 점검표 `docs/design/checks/2026-10-22-07-08-settings-form.md`(Task 2 화면 커밋과 같은 커밋, Task 3에서 세 폼 줄 보강).

## SC-15 계수 (07-08 몫 다섯 폼, 커밋 전 85600e32 → 후)

| 파일 | 전 | 후 |
|---|---|---|
| admin/settings/settings-form-client.tsx | 2 | 0 |
| account/change-password-form.tsx | 0 | 0 (이미 ui) |
| admin/holidays/holiday-form.tsx | 3 | 0 |
| admin/corp-cards/card-form.tsx | 6 | 0 |
| admin/code-tables/evidence-type-fields.tsx | 4 | 0 (체크박스 1은 세지 않음) |

대기 목록(맡은 플랜 몫)에 남은 파일: vendor-form · person-form · person-detail-client · roles-client · org-client · leave-section. 영구 제외: filter-bar · code-item-form.

## 검증 (이 워크트리, 전용 DB erp_w0708_test)
- `pnpm typecheck` 통과. 바뀐 파일 eslint(`--max-old-space-size=3072`) · stylelint 통과 (전체 `pnpm lint`는 공유 메모리로 OOM이 나 파일 단위로 돌림).
- 단위: settings 178건 통과, admin-forms-ui-only 6건 통과. 통합: settings-export + settings-cost-rate 26건 통과.
- E2E(`CI=true`, flock, `--no-deps`): settings 16 통과 · 18 skip, settings-approval-route 23 통과, change-password 통과, desktop(holidays · corp-cards · code-tables · panel-select-errors · evidence-private-type · code-tables-write-gate) 90 통과, form-label-section-gap 15 통과, mobile-375(mobile-holidays · mobile-corp-cards · mobile-code-tables · mobile-320-no-overflow · mobile-admin-master-list-first) 62 통과 · 2 skip.
- 설정 화면 1280 · 768 · 375 · 320 `scrollWidth == innerWidth`, `ui/` 밖 select 0 (임시 스펙 실측 — 커밋 안 함).
- 전체 `pnpm build` · 전체 통합 · 전체 E2E는 돌리지 않음(CLAUDE.md §5 — PR ready 때 CI가 한 번).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 시드 · 저장이 null 기본값에서 NOT NULL 위반**
- **Found during:** Task 2 (새 통합 시험 · settings-export 시험)
- **Issue:** 원가율 기본값 null을 drizzle이 SQL NULL로 보내 `settings_simple.value`(NOT NULL jsonb) 위반.
- **Fix:** `storedJson`(JSON null)로 upsert · 가져오기, 시드는 null 기본값 건너뜀.
- **Files modified:** repositories/settings.ts, domain/seed/index.ts
- **Commit:** 10af53a3

**2. [Rule 3 - Blocking] `describeSettingField`가 nullable 스키마를 서술하지 못함**
- **Fix:** `unwrapNullable` 추가 (domain/settings/registry.ts). **Commit:** 10af53a3

**3. [Rule 1 - 회귀] 설정 css `.selectLabel` 제거로 깨진 E2E 선택자**
- settings-approval-route(경고 줄 조상 깊이, `role=alert` 가정), form-label-section-gap 설정 화면(`[class*="selectLabel"]` 묶음 탐색) 선택자를 새 DOM(`Form.Field` + `Select`)에 맞게 바꿈. 기대값(PC 라벨 열 96 · select 폭 200 · 폰 라벨 위 · 가로 넘침 0)은 그대로 통과. **Commits:** 10af53a3, 45b1d311

### 감사 수정(2026-10-22) 중 계획과 다르게 한 것
- **D1(사용자 결정 2026-10-22):** blur 저장 설정 화면은 포커스를 되돌리지 않음 — Tab 이동을 빼앗지 않기 위해. 플랜 :54 뒷 절은 제출 폼에만 적용.
- **C1:** 플랜 :181의 `Form.Field` + `TextField` + `Form.Error` 그대로는 `TextField`가 자기 라벨을 가져 라벨이 두 번 나온다. 라벨 열(96+8)은 `TextField` 줄 그대로 두고 입력 칸 묶음 폭에만 `--field-w-short`를 걸었다(settings.module.css 선택자 하나). 오류는 `TextField`의 `error`(`aria-describedby` · `aria-invalid` 포함) 그대로. 숫자 · 텍스트 모두 280(문자열 칸도 접두 · 구분자 · HH:MM · 전화 · 구매처 이름이라 짧다 — 480 `long`은 안 씀).

### 계획과 다르게 한 것
- 점검표 파일명을 계획의 `2026-10-21-…` 대신 디스패치 지시의 `2026-10-22-07-08-settings-form.md`로 둠.
- 잠금 시간은 단위 글자(unitLabel)를 빼고 힌트 `1~60분`에 한 번만 — 단위 칸이 있으면 잠금 횟수 칸과 입력 폭이 달라져(1280 실측 확인).
- 내 계정 폼(`change-password-form.tsx`)은 이미 `ui/input` 뿐이라 코드 변경 없음(E2E 단언만 보강).

## 독립 DOM 감사 지적 처리 (감사 보고서: `audit/07-08-dom-audit.md`, 2026-10-22, HEAD 58c1c534)

| 지적 | 처리 | 커밋 |
|---|---|---|
| D1 오류 뒤 포커스(제출 폼) | 내 계정 · 공휴일 · 법인카드 등록/수정이 서버 검증 오류 뒤 오류 난 첫 칸(`aria-invalid`)으로 포커스. `ui/form/focus-first-invalid.ts`(기존 `project-form`의 같은 한 줄 패턴을 함수 하나로). 설정 화면은 그대로(aria-describedby만) | df80a8da |
| C1 설정 TextField 폭 616/597 | 숫자 · 텍스트 칸 모두 짧은 칸 `--field-w-short`(280)로, 폰은 전폭. 단위 붙은 칸 포함 | bb0c6358 |
| C2 기한 일수 오류 문구 | 수금 · 지급 기한 일수가 `범위 1~365 · 다시 입력`(잠금 키의 `integerInRange` 재사용). 결재 마감 시각(M2)은 손대지 않음 | 1bf68ca5 |
| C3 증빙 종류 칸 스킨 | `ui/table/Table.module.css`의 `.inputCells` 두 규칙에서 `static-table-detail` 줄 후손만 제외 → 규칙 종류 select 등이 폼 스킨(1px 테두리 · radius 6 · 흰 면) | 3482131c |
| (보고서 커밋) | 감사 보고서 · design-gate 점검표 `2026-10-22-07-08-audit-fixes.md` | de3d9143 · 3863d33e |

- 사용자 결정 2026-10-22 D1: 제출 폼만 고친다. blur 저장 설정 화면은 포커스를 되돌리지 않는다 — Tab 이동을 빼앗지 않기 위해. 플랜 :54 뒷 절은 제출 폼에만 적용.
- 시험(실패 먼저): C2 단위(`phase7-keys.test.ts`) · D1 E2E 4건(change-password · holidays · corp-cards 등록 · corp-cards 수정 `toBeFocused`) · C1 E2E(칸 폭 280, 1280 · 768, 375는 280 초과) · C3 E2E(계산 스타일 1px/6px/흰 면, 이름 칸 셀 스킨 0/1px/0 유지) — 구현 전에 전부 빨간 것을 확인(C1은 616, C3은 0px · `rgb(235, 242, 240)`).
- C3 Table.module.css 영향 범위: `StaticTable`의 `detail` prop을 쓰는 곳은 코드표 증빙 종류 세금 규칙 하나뿐(`grep detail:`). 제외 조건을 `:not(:where([data-ui="static-table-detail"] *))`로 걸어 특이도가 그대로라 다른 표 셀 입력(코드표 이름 · 설명, 계급 표)의 겉모습은 불변(E2E로 이름 칸 확인). 증빙 종류 칸이 표 `<table>` 안 `<tr>`라 `.inputCells` 밖으로 옮기는 안은 구조상 불가능해 CSS 제외를 택했다.

## 남은 것 · 다음 플랜에 넘기는 것
- 오류 뒤 포커스(backstop): 제출 폼은 감사 수정에서 구현했다(아래 「독립 DOM 감사 지적 처리」). blur 저장 설정 화면은 사용자 결정으로 되돌리지 않는다.
- 독립 DOM 감사 · `/design-review` · `/qa` · `/review`는 오케스트레이터 몫(실행자 몫은 점검표 + 싼 게이트까지).
- **운영 값 확인(C-P1-2)**: 운영 DB의 `auth.lockout_threshold` · `auth.lockout_window_minutes` 저장값(또는 env 기본값)이 3~10 · 1~60 안인지 배포 전 확인 필요. 범위 밖이어도 읽기는 기본값(5 · 15)으로 대체되므로 로그인은 깨지지 않지만 의도한 운영값과 다를 수 있다. 이 세션은 운영 DB를 조회하지 않았다(CLAUDE.md §2).
- `project.cost_rate_pct` · `project.collection_due_days` 소비자는 07-22 · 07-24 몫(`readBy: {phase:"7"}`로 registry-coverage 통과).
- 07-25: `UI_ONLY_PENDING`을 비우고 최종 0 단언.

## Known Stubs
없음.

## Threat Flags
없음 (새 엔드포인트 · 인증 경로 · 신뢰 경계 스키마 변경 없음. 설정 키 추가는 기존 `setSettingValue` 경로 + 07-04 행동 로그 그대로).

## Self-Check: PASSED
- 파일: test/unit/admin-forms-ui-only.test.ts · docs/design/checks/2026-10-22-07-08-settings-form.md · test/integration/settings-cost-rate.test.ts 존재.
- 커밋: dd606a0d · 10af53a3 · 45b1d311 `git log`에 존재, `git rev-list --count 85600e32..HEAD` = 3.
