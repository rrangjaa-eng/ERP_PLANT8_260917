---
phase: 03-permissions-settings-masters
verified: 2026-10-01T04:38:30Z
status: passed
score: 6/6 must-haves verified
covered_digest: "v1:sha256:f58ad8bbf5d149646d7c05e132207edb23ec30c0c55ab8f975598453c3f1396c"
covered_files:
  - ".github/workflows/account.yml"
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - ".planning/phases/03-permissions-settings-masters/03-01-DECISION-TASK1.md"
  - ".planning/phases/03-permissions-settings-masters/03-01-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-01-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-02-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-02-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-03-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-03-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-04-DECISION-TASK1.md"
  - ".planning/phases/03-permissions-settings-masters/03-04-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-04-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-05-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-05-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-06-DECISION-TASK1.md"
  - ".planning/phases/03-permissions-settings-masters/03-06-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-06-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-07-DECISION-TASK1.md"
  - ".planning/phases/03-permissions-settings-masters/03-07-PLAN.md"
  - ".planning/phases/03-permissions-settings-masters/03-07-SUMMARY.md"
  - ".planning/phases/03-permissions-settings-masters/03-ASSUMPTIONS.md"
  - ".planning/phases/03-permissions-settings-masters/03-CONTEXT.md"
  - ".planning/phases/03-permissions-settings-masters/03-DESIGN-REVIEW.md"
  - ".planning/phases/03-permissions-settings-masters/03-DISCUSSION-LOG.md"
  - ".planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md"
  - ".planning/phases/03-permissions-settings-masters/03-PATTERNS.md"
  - ".planning/phases/03-permissions-settings-masters/03-RESEARCH.md"
  - ".planning/phases/03-permissions-settings-masters/03-REVIEW-2.md"
  - ".planning/phases/03-permissions-settings-masters/03-REVIEW-BATCH.md"
  - ".planning/phases/03-permissions-settings-masters/03-REVIEW.md"
  - ".planning/phases/03-permissions-settings-masters/03-SECURITY.md"
  - ".planning/phases/03-permissions-settings-masters/03-UAT.md"
  - ".planning/phases/03-permissions-settings-masters/03-UI-SPEC.md"
  - ".planning/phases/03-permissions-settings-masters/03-VALIDATION.md"
  - "app/(app)/account/actions.ts"
  - "app/(app)/admin/action-log/action-log.module.css"
  - "app/(app)/admin/action-log/actions.registry.ts"
  - "app/(app)/admin/action-log/actions.ts"
  - "app/(app)/admin/action-log/filter-bar.tsx"
  - "app/(app)/admin/action-log/page.tsx"
  - "app/(app)/admin/admin-index.module.css"
  - "app/(app)/admin/archive/actions.registry.ts"
  - "app/(app)/admin/archive/actions.ts"
  - "app/(app)/admin/archive/archive-table.tsx"
  - "app/(app)/admin/archive/archive.module.css"
  - "app/(app)/admin/archive/delete-to-archive.tsx"
  - "app/(app)/admin/archive/page.tsx"
  - "app/(app)/admin/code-tables/actions.registry.ts"
  - "app/(app)/admin/code-tables/actions.ts"
  - "app/(app)/admin/code-tables/code-item-form.tsx"
  - "app/(app)/admin/code-tables/code-tables.module.css"
  - "app/(app)/admin/code-tables/evidence-type-fields.tsx"
  - "app/(app)/admin/code-tables/page.tsx"
  - "app/(app)/admin/corp-cards/actions.registry.ts"
  - "app/(app)/admin/corp-cards/actions.ts"
  - "app/(app)/admin/corp-cards/card-form.tsx"
  - "app/(app)/admin/corp-cards/corp-cards.module.css"
  - "app/(app)/admin/corp-cards/page.tsx"
  - "app/(app)/admin/page.tsx"
  - "app/(app)/admin/people/[id]/page.tsx"
  - "app/(app)/admin/people/[id]/person-detail-client.tsx"
  - "app/(app)/admin/people/actions.registry.ts"
  - "app/(app)/admin/people/actions.ts"
  - "app/(app)/admin/people/org/org-client.tsx"
  - "app/(app)/admin/people/org/page.tsx"
  - "app/(app)/admin/people/page.tsx"
  - "app/(app)/admin/people/people.module.css"
  - "app/(app)/admin/people/person-form.tsx"
  - "app/(app)/admin/people/roles/page.tsx"
  - "app/(app)/admin/people/roles/roles-client.tsx"
  - "app/(app)/admin/permissions/actions.registry.ts"
  - "app/(app)/admin/permissions/actions.ts"
  - "app/(app)/admin/permissions/page.tsx"
  - "app/(app)/admin/permissions/permission-grid-client.tsx"
  - "app/(app)/admin/settings/actions.registry.ts"
  - "app/(app)/admin/settings/actions.ts"
  - "app/(app)/admin/settings/page.tsx"
  - "app/(app)/admin/settings/settings-form-client.tsx"
  - "app/(app)/admin/settings/settings.module.css"
  - "app/(app)/admin/system-status/page.tsx"
  - "app/(app)/admin/vendors/account-number.tsx"
  - "app/(app)/admin/vendors/actions.registry.ts"
  - "app/(app)/admin/vendors/actions.ts"
  - "app/(app)/admin/vendors/page.tsx"
  - "app/(app)/admin/vendors/vendor-form.tsx"
  - "app/(app)/admin/vendors/vendors.module.css"
  - "app/(app)/admin/visibility/actions.registry.ts"
  - "app/(app)/admin/visibility/actions.ts"
  - "app/(app)/admin/visibility/page.tsx"
  - "app/(app)/layout.tsx"
  - "app/(auth)/login/login-error.ts"
  - "db/migrations/0003_permissions_masters_spine.sql"
  - "db/migrations/0004_users_role_id_validate.sql"
  - "db/migrations/0005_settings_registry.sql"
  - "db/migrations/0006_org_people_cards.sql"
  - "db/migrations/0007_vendors_crypto_conventions.sql"
  - "db/migrations/0008_action_log_prune.sql"
  - "db/migrations/0009_project_quote_ledger_spine.sql"
  - "db/migrations/meta/0003_snapshot.json"
  - "db/migrations/meta/0004_snapshot.json"
  - "db/migrations/meta/0005_snapshot.json"
  - "db/migrations/meta/0006_snapshot.json"
  - "db/migrations/meta/0007_snapshot.json"
  - "db/migrations/meta/0008_snapshot.json"
  - "db/migrations/meta/_journal.json"
  - "db/schema/action-log.ts"
  - "db/schema/auth.ts"
  - "db/schema/code-tables.ts"
  - "db/schema/corp-cards.ts"
  - "db/schema/document-counters.ts"
  - "db/schema/field-definitions.ts"
  - "db/schema/index.ts"
  - "db/schema/org.ts"
  - "db/schema/permissions.ts"
  - "db/schema/roles.ts"
  - "db/schema/settings.ts"
  - "db/schema/vendors.ts"
  - "docs/ARCHITECTURE.md"
  - "docs/HANDOFF.md"
  - "docs/OPERATIONS.md"
  - "docs/design/DECISIONS.md"
  - "docs/design/SYSTEM.md"
  - "domain/action-log/export.ts"
  - "domain/action-log/filter-keys.ts"
  - "domain/action-log/index.ts"
  - "domain/action-log/record.ts"
  - "domain/archive/index.ts"
  - "domain/auth/accounts.ts"
  - "domain/auth/hooks.ts"
  - "domain/auth/locked-message.ts"
  - "domain/auth/lockout.ts"
  - "domain/auth/password.ts"
  - "domain/code-tables/index.ts"
  - "domain/code-tables/tax-rule.ts"
  - "domain/corp-cards/index.ts"
  - "domain/custom-fields/build-schema.ts"
  - "domain/ops/pool-rule.ts"
  - "domain/org/index.ts"
  - "domain/people/index.ts"
  - "domain/permissions/can.ts"
  - "domain/permissions/dto-registry.ts"
  - "domain/permissions/info-items.ts"
  - "domain/permissions/matrix.ts"
  - "domain/permissions/menus.ts"
  - "domain/permissions/project.ts"
  - "domain/permissions/role-name.ts"
  - "domain/permissions/roles.ts"
  - "domain/permissions/scope-for.ts"
  - "domain/permissions/visible.ts"
  - "domain/projects/references.ts"
  - "domain/projects/status.ts"
  - "domain/seed/index.ts"
  - "domain/settings/export.ts"
  - "domain/settings/keys.ts"
  - "domain/settings/registry.ts"
  - "domain/system-status/index.ts"
  - "domain/vendors/index.ts"
  - "domain/viewer.ts"
  - "eslint.config.mjs"
  - "eslint/index.mjs"
  - "eslint/rules/no-row-type-escape.mjs"
  - "lib/actions/client.ts"
  - "lib/actions/handle-server-error.ts"
  - "lib/actions/payload-size.ts"
  - "lib/actions/registry.ts"
  - "lib/actions/user-facing-error.ts"
  - "lib/actions/zod-error-message.ts"
  - "lib/auth.ts"
  - "lib/crypto.ts"
  - "lib/env.ts"
  - "lib/pg-errors.ts"
  - "lib/viewer.ts"
  - "package.json"
  - "playwright.config.ts"
  - "repositories/action-log.ts"
  - "repositories/archive.ts"
  - "repositories/code-tables.ts"
  - "repositories/corp-cards.ts"
  - "repositories/document-counters.ts"
  - "repositories/field-definitions.ts"
  - "repositories/org-units.ts"
  - "repositories/permissions.ts"
  - "repositories/roles.ts"
  - "repositories/settings.ts"
  - "repositories/team-memberships.ts"
  - "repositories/teams.ts"
  - "repositories/users.ts"
  - "repositories/vendors.ts"
  - "scripts/account-cli.ts"
  - "scripts/build-cli.mjs"
  - "scripts/deploy.sh"
  - "scripts/reset-test-db.sh"
  - "scripts/rotate-key.ts"
  - "scripts/seed-master.ts"
  - "scripts/settings-import.ts"
  - "test/e2e/a11y.spec.ts"
  - "test/e2e/action-log.spec.ts"
  - "test/e2e/admin-master-list-first.spec.ts"
  - "test/e2e/admin-nav.spec.ts"
  - "test/e2e/admin-people-detail-link.spec.ts"
  - "test/e2e/archive.spec.ts"
  - "test/e2e/archived-session.spec.ts"
  - "test/e2e/change-password.spec.ts"
  - "test/e2e/code-tables-write-gate.spec.ts"
  - "test/e2e/code-tables.spec.ts"
  - "test/e2e/corp-cards.spec.ts"
  - "test/e2e/fixtures.ts"
  - "test/e2e/global-setup.ts"
  - "test/e2e/keyboard-nav.spec.ts"
  - "test/e2e/login-logout.spec.ts"
  - "test/e2e/logout-failure.spec.ts"
  - "test/e2e/master-edit.spec.ts"
  - "test/e2e/mobile-admin-master-list-first.spec.ts"
  - "test/e2e/mobile-admin-nav.spec.ts"
  - "test/e2e/mobile-code-tables.spec.ts"
  - "test/e2e/mobile-corp-cards.spec.ts"
  - "test/e2e/mobile-list-empty.spec.ts"
  - "test/e2e/mobile-org.spec.ts"
  - "test/e2e/mobile-page-chrome.spec.ts"
  - "test/e2e/mobile-people.spec.ts"
  - "test/e2e/mobile-roles.spec.ts"
  - "test/e2e/mobile-shell.spec.ts"
  - "test/e2e/mobile-vendors.spec.ts"
  - "test/e2e/org.spec.ts"
  - "test/e2e/page-chrome.spec.ts"
  - "test/e2e/people.spec.ts"
  - "test/e2e/permissions-grid.spec.ts"
  - "test/e2e/roles.spec.ts"
  - "test/e2e/row-actions-helpers.ts"
  - "test/e2e/settings.spec.ts"
  - "test/e2e/single-column.spec.ts"
  - "test/e2e/system-status.spec.ts"
  - "test/e2e/user-menu.spec.ts"
  - "test/e2e/vendor-edit.spec.ts"
  - "test/e2e/vendors.spec.ts"
  - "test/integration/action-log-query.test.ts"
  - "test/integration/action-log.test.ts"
  - "test/integration/archive.test.ts"
  - "test/integration/archived-session.test.ts"
  - "test/integration/auth.test.ts"
  - "test/integration/code-tables.test.ts"
  - "test/integration/corp-card-owner-archived.test.ts"
  - "test/integration/corp-card-owner-edit.test.ts"
  - "test/integration/corp-cards.test.ts"
  - "test/integration/custom-fields.test.ts"
  - "test/integration/db-bootstrap.test.ts"
  - "test/integration/document-counters-concurrency.test.ts"
  - "test/integration/document-counters.test.ts"
  - "test/integration/global-setup.ts"
  - "test/integration/leak-scan.test.ts"
  - "test/integration/lockout.test.ts"
  - "test/integration/mast-04-code-item-label.test.ts"
  - "test/integration/org.test.ts"
  - "test/integration/people.test.ts"
  - "test/integration/project-status.test.ts"
  - "test/integration/rate-limit.test.ts"
  - "test/integration/roles.test.ts"
  - "test/integration/seed-permissions.test.ts"
  - "test/integration/settings-export.test.ts"
  - "test/integration/settings.test.ts"
  - "test/integration/setup.ts"
  - "test/integration/team-memberships.test.ts"
  - "test/integration/vendors.test.ts"
  - "test/integration/visibility.test.ts"
  - "test/unit/account-cli.test.ts"
  - "test/unit/action-log/export.test.ts"
  - "test/unit/action-log/filter.test.ts"
  - "test/unit/action-log/record.test.ts"
  - "test/unit/actions/handle-server-error.test.ts"
  - "test/unit/actions/zod-error-message.test.ts"
  - "test/unit/admin-menu-registry.test.ts"
  - "test/unit/app/tertiary-underline-css.test.ts"
  - "test/unit/archive-revalidate.test.ts"
  - "test/unit/code-tables/tax-rule.test.ts"
  - "test/unit/corp-cards/owner-rule.test.ts"
  - "test/unit/crypto.test.ts"
  - "test/unit/custom-fields/build-schema.test.ts"
  - "test/unit/deploy/app-data-key-length.test.ts"
  - "test/unit/deploy/cli-bundle.test.ts"
  - "test/unit/deploy/deploy-sh.test.ts"
  - "test/unit/deploy/fakebin/gcloud"
  - "test/unit/deploy/workflows.test.ts"
  - "test/unit/design-system-docs.test.ts"
  - "test/unit/eslint-rules/fixtures/domain/array-dto.ts"
  - "test/unit/eslint-rules/fixtures/domain/dto-return.ts"
  - "test/unit/eslint-rules/fixtures/domain/promise-dto.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-array.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-arrow.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-direct.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-promise-array.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-promise-direct.ts"
  - "test/unit/eslint-rules/fixtures/domain/row-union.ts"
  - "test/unit/eslint-rules/fixtures/repositories/row-return.ts"
  - "test/unit/eslint-rules/no-row-type-escape.test.ts"
  - "test/unit/import-cycles.test.ts"
  - "test/unit/leak-scan-coverage.test.ts"
  - "test/unit/lib/pg-errors.test.ts"
  - "test/unit/lockout.test.ts"
  - "test/unit/login-error.test.ts"
  - "test/unit/no-admin-boolean.test.ts"
  - "test/unit/org/team-at-date.test.ts"
  - "test/unit/people/change-person-role.test.ts"
  - "test/unit/permissions/can.test.ts"
  - "test/unit/permissions/project.test.ts"
  - "test/unit/permissions/scope-for.test.ts"
  - "test/unit/permissions/visible.test.ts"
  - "test/unit/settings-import-cli.test.ts"
  - "test/unit/settings/registry-coverage.test.ts"
  - "test/unit/settings/registry.test.ts"
  - "test/unit/system-status.test.ts"
  - "test/unit/ui/admin-index-css.test.ts"
  - "test/unit/ui/admin-index-link.test.ts"
  - "test/unit/ui/admin-master-list-first.test.ts"
  - "test/unit/ui/admin-table-caption.test.ts"
  - "test/unit/ui/history-list-id-prefix.test.ts"
  - "test/unit/ui/permission-grid-resync.test.ts"
  - "test/unit/ui/role-menu.test.ts"
  - "test/unit/ui/single-column.test.ts"
  - "test/unit/vendors/account-number-plan.test.ts"
  - "test/unit/vendors/update-archived.test.ts"
  - "ui/button/Button.module.css"
  - "ui/history-list/HistoryList.module.css"
  - "ui/history-list/HistoryList.tsx"
  - "ui/list-empty/ListEmpty.module.css"
  - "ui/list-empty/ListEmpty.tsx"
  - "ui/permission-grid/PermissionGrid.module.css"
  - "ui/permission-grid/PermissionGrid.tsx"
  - "ui/shell/BottomTabs.tsx"
  - "ui/shell/MoreSheet.tsx"
  - "ui/shell/Shell.tsx"
  - "ui/shell/TopBar.tsx"
  - "ui/shell/role-menu.ts"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  previous_verified: 2026-09-24T09:41:40Z
  round: 7
  head: "d49ad56 (claude/close-phases-02-03 — 7회차 본판정은 aa5464e(= f85c9af 코드 트리)에서 했고, 이후 origin/main bada253(PR #111)·48da153(PR #115)을 머지(9a03686)한 뒤 addendum을 이 HEAD에서 했다. HEAD 코드 트리는 더 이상 f85c9af와 같지 않다 — bada253의 관리자 행 동작·3차 버튼 CSS가 더해졌다. d49ad56은 9a03686 위 `.planning` 문서 1커밋)"
  head_main_judgment: "aa5464e (origin/main f85c9af 위에 `.planning/.continue-here.md` 삭제 1커밋 — 그 시점 코드 트리는 f85c9af와 같았다)"
  trigger: "verification status = stale — 6회차 covered_files 327개 중 167개가 2d7f73e 이후 바뀜(Phase 4 묶음 ②~④, 04.1 결재·연차, 04.2 알림·공휴일, 04.4 복원 리허설, quick·리뷰 수정). 2d7f73e..aa5464e = 커밋 841개(first-parent 70개 — `git rev-list --count` · GitHub compare API ahead_by 841로 확인)"
  what_changed:
    - "판정 함수: `can.ts`·`visible.ts` 무변경. `project.ts`가 `projectMany`(행 여러 개를 한 spec으로 — 서로 다른 정보 항목마다 `visible()`를 요청당 한 번)와 all-of `InfoItemRef`(문자열 또는 목록, 전부 보여야 키가 실림)를 얻었고 `project()`는 그 위의 한 행 래퍼다(캐시 없음 — 호출마다 DB 조회 유지). `dto-registry.ts`가 빈 목록 `infoItem: []`을 `EmptyInfoItemsError`로 거부(`every()` 공허 참 구멍 방지). `scope-for.ts`·`matrix.ts`·`archive`·`vendors`·`settings` 쪽은 오류 문구 명사형 변경 + 확장뿐"
    - "Phase 3 메커니즘에 등록만으로 올라탄 것: MENUS 22개(admin.* 11 — `admin.holidays` 추가, `projects.status·complete·period·adjustment`, `leave`), INFO_ITEMS에 `approval.value`·`leave.value`·`reserve.amount`, CORE·ALWAYS_ON 행동 종류에 `account_lock`·`account_unlock`·`holiday_change`, 설정 키(연차 이력형 등 — `kind: \"historized\"` 7개), 누수 스캔 import에 approvals·leave·reserves·holidays·quotes/revisions·people/[id] 레지스트리, 보관함 `DOMAIN_RESTORERS`(견적 줄·리저브 복원은 도메인 함수가 잠금·게이트·로그를 한 트랜잭션에서)"
    - "역할 데이터: `roles.work_scope`(team/company, 마이그레이션 0013) + `setRoleWorkScope`(`admin.people` 쓰기 게이트 + `permission_change` 로그). Phase 4 프로젝트 상태 전환·등록이 이 값을 `domain/projects/status.ts` 게이트 규칙에서 읽는다(advisory 6)"
    - "6회차 deferred 1(배포 시드가 노출표 선택을 되돌림) — 04-20이 고쳤다: `domain/seed/index.ts:210-242`이 기획 PM·팀장·본부 책임자·대표 행을 `insertVisibilityIfAbsent`(onConflictDoNothing)로, 기획 PM의 `revenue.issued_amount`만 `upsertVisibilityIfUnedited`(`updated_by IS NULL`인 행만 갱신)로 넣는다. 시스템 관리자 행만 매번 `upsertVisibility`(설계 — advisory 7). 통합 테스트 4건이 재시드 보존을 고정하고 이번 라운드에 직접 돌려 green"
    - "관리자 화면: 표시·문구·폭·aria-disabled 정돈. diff 전수에서 제거된 게이트 줄 10줄은 전부 같은 파일에서 재배치(예: `people/page.tsx:32-38` `canArchive`·`canWrite`, `vendors/page.tsx:48-54·165-171`, `action-log/page.tsx:33·48`) — 게이트 순감 0. 새 `/admin` 인덱스는 이메일 실패·공휴일 확정 배너가 붙었고 `can(view)` 필터·0그룹 404(`admin/page.tsx:28·35`) 그대로"
    - "마이그레이션 0010~0020은 Phase 3 표에 대해 가산만 한다(`code_items.description`, `roles.work_scope`, `users.first_login_at`·`hire_date`·`resignation_date`, 새 FK). Phase 3 표를 DROP·DELETE하는 문장은 0012의 `project_status` 'settled' 행 교체(Phase 4 D-75)뿐"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  deferred_resolved:
    - truth: "성공 기준 2 「정보 노출표 체크박스를 바꾸면 바뀐다」의 지속성 — 배포마다 도는 시드가 기획 PM·시스템 관리자 행의 노출표 선택을 기본값으로 되돌린다"
      resolved_by: "04-20 (Phase 4) — `repositories/permissions.ts:120-153` `upsertVisibilityIfUnedited`·`insertVisibilityIfAbsent`, `domain/seed/index.ts:192-242`"
      evidence: "이번 라운드 직접 실행 green: `test/integration/project-status.test.ts` 「ENG-D3 ③ — 첫 시드의 노출 기본값, 관리자가 끈 기획 PM quote.amount·대표 revenue.issued_amount는 재시드 뒤에도 꺼져 있고 시스템 관리자 항목은 재시드가 켠다」·「A-05 — … 관리자가 끈 팀장 projects.status는 재시드 뒤에도 꺼져 있다」, `test/integration/visibility.test.ts` (f)·(g). `scripts/deploy.sh:721`은 여전히 배포마다 `run_seed`를 부르지만 이제 기획 PM·팀장·본부 책임자·대표 행의 관리자 선택을 덮지 않는다"
  corrections_to_previous_report:
    - "6회차 human_verification 1의 기대 「권한표 5행 × 46열」은 더 이상 맞는 숫자가 아니다 — 이후 페이즈가 메뉴를 더해 지금 시드 MENUS는 22개 × 동작 3 = 66열이다(코드에서 센 값). 사용자 확인은 「빈 칸 없음」만 답했고 열 수는 세지 않았다 — 66열을 관찰했다고 주장하지 않는다"
  addendum:
    date: "2026-10-01T04:38:30Z"
    head: "d49ad56 (코드 트리 = 9a03686 = bada253 코드 + 48da153 `.claude` 변경)"
    range: "aa5464e..d49ad56 — 커밋 11개(first-parent 9). 이 중 `.planning`·`.claude` 밖 파일을 바꾼 것은 bada253 하나"
    trigger: "7회차 작성 뒤 origin/main 머지(bada253 PR #111, 48da153 PR #115)로 covered_files 12개가 바뀌었는데, 오케스트레이터가 재검증 없이 covered_digest만 다시 계산했다(PR #117 리뷰 CRITICAL). 이 addendum이 그 재검증이다"
    bada253_judgment: "Phase 3 계약 변경 없음. 관리자 화면 3개(`vendors`·`corp-cards`·`code-tables` page.tsx)는 행 동작을 감싸던 프래그먼트 `<>…</>`를 `<span className={styles.rowActions}>`로 바꾸고 「수정」 링크에 `rowLink` 클래스를 더했을 뿐 — `canWrite`·`canArchive`·`archivedAt ? null` 조건, `*ActiveToggle`·`VendorHiddenToggle`·`*DeleteButton`(보관함 이동) 호출과 인자, `hasActions`·`canWrite || canArchive` 열 게이트는 diff의 문맥 줄로 그대로다(제거 줄은 `<>`·`</>`·`className={styles.toggle}` 셋뿐). CSS 모듈 3개는 `.rowActions`(gap --s-4)·`.rowLink`(nowrap) 추가만. `ui/button/Button.module.css` `.tertiary`는 border-bottom 밑줄을 text-decoration 밑줄로 바꾸고 aria-disabled 밑줄 색을 흐리게 함 — 표시 전용, `Button.tsx`(aria-disabled 클릭 차단) 무변경. `/admin` 인덱스·`/admin/permissions`·`ui/permission-grid`·`ui/shell`은 bada253이 건드리지 않았고 3차 버튼도 쓰지 않는다. Phase 3 E2E 5개 스펙은 추가만(제거 줄은 `mobile-vendors.spec.ts`의 import 한 줄을 확장한 것뿐), 새 단언은 행 동작 간격 ≥ --s-4·44×44·가로 넘침 없음. domain·repositories·db·lib·판정 함수 변경 0"
    48da153_judgment: "`.claude/hooks/plant8-skill-gate.sh`·그 테스트·`.claude/gates/phase-02.log`·`.planning` 문서만 — 앱 코드·테스트 0, Phase 3 무관"
    gates_this_process: "코드 트리 9a03686(= d49ad56의 코드), 2026-10-01 04:30–04:36Z: `pnpm lint` exit 0(error 0, 기존 boundaries v5→v6 경고만) · `pnpm typecheck` exit 0 · `pnpm test:unit` 171 files · 2277 passed(7회차 2272 → +5는 bada253의 `tertiary-underline-css.test.ts` 새 describe 1개 · 테스트 5건) · 대상 단위 9파일(`tertiary-underline-css`·`admin-menu-registry`·`no-admin-boolean`·`ui/admin-index-css`·`ui/admin-index-link`·`ui/admin-master-list-first`·`ui/admin-table-caption`·`ui/single-column`·`design-system-docs`) 160 passed. 통합은 다시 돌리지 않았다 — bada253·48da153이 domain·repositories·db·통합 테스트를 건드리지 않았고 CI #104 integration 2샤드가 bada253에서 green"
    digest_restamp: "2026-10-01T04:54Z(49f6dff) — 오케스트레이터가 covered 파일 중 03-UAT.md 문구만(질문 원문 둘째 문장 · 03:13:40Z~03:20Z 시간 창) 고친 뒤 같은 목록으로 digest를 다시 계산. 코드 변경 0, 판정 영향 없음 · 2026-10-01T05:12Z phase.complete 02가 ROADMAP.md 진행 표의 Phase 2 줄(In Progress→Complete)만 바꿔 같은 목록으로 다시 계산. 판정 영향 없음 · 2026-10-01T05:31Z phase.complete 03과 requirements revert-phase(MAST-01·ADMN-03 → Gaps Found, PR #117 Codex 지적)가 REQUIREMENTS.md만 바꿔 같은 목록으로 다시 계산. 판정 영향 없음"
    ci: "deploy run #104(id 36810353354, main bada253, 2026-10-01T03:24:22Z): ci/quality · ci/integration (1)·(2) · ci/e2e (1)·(2) · staging 전부 success(staging 03:39:18–03:43:44Z), production skipped(수동 승격). main 푸시라 E2E는 전체 스위트(CLAUDE.md §5). deploy run #105(id 36814444345, main 48da153): 이 시점 completed — quality·integration×2·e2e×2·staging 전부 success, production skipped"
history_round_6:
  previous_status: passed
  previous_score: 6/6
  previous_verified: 2026-09-22T06:23:57Z
  round: 6
  head: "2d7f73e (claude/project-thread-pajnzt — 3c1b015 위에 /design-review·/qa·quick 260924-cj5 커밋 70e3449..2d7f73e)"
  trigger: "verification status = stale — 이전 보고서 covered_files 중 57개가 06:23:57Z 이후 바뀜(quick 260922-i3k·260922-o2b 관리자 화면 정돈, Phase 4 PR #38)"
  what_changed:
    - "6회차 보정(2026-09-24T09:35Z, HEAD 2d7f73e): 1c93526 이후 covered_files 중 3개가 바뀌어 stale — `ui/shell/TopBar.tsx`(워드마크를 `next/link` 「PLANT8 내 차례」 홈 링크로 감쌈, FINDING-001) · `ui/list-empty/ListEmpty.module.css`(EMPTY 다음 한 수 링크 밑줄을 border에서 text-decoration으로, FINDING-005) · `test/e2e/keyboard-nav.spec.ts`(Tab 순서 기대에 워드마크 추가). 셋 다 표시·포커스 순서 변경이다 — TopBar diff의 +/- 줄에 `adminMenu`·`role-menu`·`can(` 0건, 관리자 메뉴 배선(`TopBar.tsx:27·52`)·`role-menu.ts`·`admin/page.tsx`·판정 함수 무변경. 성공 기준 6개·artifact·key link 판정에 영향 없음. 같은 범위의 나머지 변경(`app/(app)/account/*`·`app/(app)/projects/filter-bar.tsx`·`TopBar.module.css`·새 E2E 5개·TODOS.md)은 Phase 3 covered 밖"
    - "관리자 화면 10종의 진입점이 PC 사용자 메뉴·「더보기」 시트에서 「관리」 한 줄(/admin)로 접히고 새 `app/(app)/admin/page.tsx` 인덱스가 `can(viewer, menu, view)`로 그룹을 거른다(0그룹이면 404) — quick 260922-i3k"
    - "관리자 화면 표시 정돈(단일 기둥 폭 `.single-column`, 빈 칸 `—`, `<th scope=col>`, sr-only caption, 코드표 「정렬」 열 제거) — quick 260922-o2b. 권한 게이트(`can()`/`canWrite`/`canArchive`) 줄은 한 줄도 빠지지 않았다(diff 전수 grep)"
    - "Phase 4: `MENUS`에 `projects.revenue`, `INFO_ITEMS`에 `project.value`·`quote.amount`·`revenue.issued_amount`·`revenue.paid_amount`, `scopeFor` ENTITY_MENUS에 `project`·`quote_line`, `CORE_ACTION_TYPES`·`ALWAYS_ON_ACTION_TYPES`에 `status_change`, 설정 키 6개 추가 + 세율·절사 키 11개의 `readBy: { phase: \"4\" }` 제거(이제 `domain/money/tax.ts` 등이 실제로 읽는다), `repositories/document-counters.allocateNumber`(원자적 증가), 시드에 `insertPermissionIfAbsent`(기획 PM `projects` view·write)와 `quote_subcategory` 코드표, 마이그레이션 0009가 `project_status` 코드표를 네 값으로 교체(전제 위반 시 RAISE EXCEPTION)"
    - "`lib/actions/client.ts`의 `authedActionClient`에 요청 본문 256KB 한도(`lib/actions/payload-size.ts`)가 세션 확인 앞에 붙음 — Phase 3 관리자 액션 전부가 이 경로를 지난다"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  corrections_to_previous_report:
    - "5회차 advisory F3(행동 로그 CSV 수식 주입)는 5회차가 쓰일 때 이미 고쳐져 있었다 — `05a1c9a`(2026-09-22 05:10Z)가 `domain/action-log/export.ts:31` `FORMULA_LEAD = /^[=+\\-@\\t\\r]/` + `csvEscape`의 `'` 접두어를 넣었고 `test/unit/action-log/export.test.ts:146`이 네 문자를 고정한다(이번 라운드 unit green). 5회차 본문은 4회차(09-21) 관찰을 그대로 옮겼다"
    - "5회차 advisory 「`03-OPEN-ITEMS.md:32`가 없는 커밋 `fa4a5a2`를 인용」도 이미 닫혀 있었다 — `d7ad2f8`(2026-09-21 15:08Z)이 고쳤고 현재 파일에 `fa4a5a2` 0건"
    - "5회차 advisory 「`settings/actions.ts:52-54` 주석이 낡음」도 `d7ad2f8`로 닫혀 있었다 — 현재 `:50-55`가 `pnpm settings:import --file <경로>`와 `docs/OPERATIONS.md §12`를 가리킨다"
advisory:
  - finding: "F1 — `APP_ENV` 기본값 fail-open. `lib/env.ts:47-49`가 미지정 `APP_ENV`를 `local`로 두고 `:89`가 `local`이 아닐 때만 `BETTER_AUTH_SECRET` 32자 이상을 강제한다. `NODE_ENV=production` + `APP_ENV` 미지정 조합을 막는 검사는 여전히 없다(이 파일은 이후 13줄 추가 — `NOTIFY_TICK_OIDC_DISABLED` 등 — 이 조합 검사는 아님)"
    category: security
    reason: "`scripts/deploy.sh`가 staging·prod에 `APP_ENV`와 시크릿을 넣으므로 실배포 경로는 막혀 있다. Phase 1 환경 계약 영역이고 Phase 3 성공 기준에 걸리지 않는다"
    evidence_status: "결정적(파일·줄 실재). 빨간 named test 없음"
  - finding: "F2 — `revealAccountNumber`(`domain/vendors/index.ts:388-405`)가 `visible()`만 보고 `repositories/vendors.ts:47` `findVendorById`에 scope·archived 조건이 없다(두 곳 로직 무변경)"
    category: security
    reason: "해제 권한 보유 계급이 보관된 거래처의 계좌번호도 id로 열 수 있다. 성공 기준 5의 계약(노출표 항목 + 권한 검사 + 행동 로그)은 충족 — 그 위의 심층 방어"
    evidence_status: "결정적. 빨간 named test 없음"
  - finding: "F4 — 행동 로그 조회·내보내기가 메뉴 권한 대신 `visible(action_log.detail)`만 본다(`domain/action-log/index.ts:262-266`, 문구만 바뀜)"
    category: security
    reason: "REQUIREMENTS ADMN-10 「열람 권한은 정보 노출표로 통제」와 일치 — 결함 아님"
    evidence_status: "결정적. 시드 기본 상태에서 재현 불가"
  - finding: "`domain/settings/keys.ts:56` 절 머리 주석 「뒤 페이즈가 읽는 키 (readBy 표시 있음)」 — 그 아래 세율·절사 키는 readBy가 없고(Phase 4가 읽음), readBy는 `:213·224·235·248`(Phase 5·6 키)에만 남았다. 동작 영향 0"
    category: other
    reason: "주석 한 줄 정리"
    evidence_status: "결정적(파일·줄 실재)"
  - finding: "MVP 모드 불일치 — ROADMAP Phase 3이 `**Mode:** mvp`인데 goal이 User Story 형식이 아니다"
    category: other
    reason: "1~6회차와 같은 판단 — 성공 기준 6개가 구체적이라 표준 goal-backward로 진행"
    evidence_status: "none provided"
  - finding: "(신규) 성공 기준 2 문구 「판정은 `can()`/`visible()`/`scopeFor()` 세 함수에서만」과 Phase 4 업무 범위 판정의 관계 — `domain/projects/status.ts:64-89`(`loadActorTeamScope`·`coversProjectTeam`)이 `roles.work_scope`와 오늘 소속 팀으로 상태 전환 주체를 거르고, `domain/projects/references.ts:82`가 새 프로젝트 폼의 팀·PM 선택지를 같은 값으로 좁힌다. 세 함수 밖의 판정 지점이다"
    category: architectural
    reason: "Phase 4 04-20-PLAN이 「`can`·`visible`·`scopeFor`는 바꾸지 않는다(OV-4)」로 명시하고 게이트 규칙 안의 사실로 넣은 리뷰된 결정이다. 행 읽기 범위는 여전히 `scopeFor`, 필드는 `project()` — Phase 3 메커니즘 자체는 깨지지 않았다. Phase 7 전 메뉴 검수에서 SC2 문구와 업무 범위 규칙의 정합을 한 번 맞추는 것을 권장"
    evidence_status: "결정적(파일·줄 실재). Phase 4 통합 테스트(`project-status.test.ts`)가 이 규칙을 고정"
  - finding: "(신규) 시스템 관리자 행의 노출표·권한표는 배포 시드가 매번 전부 켠다(`domain/seed/index.ts:159-170·216-221` `upsertPermission`·`upsertVisibility`) — 관리자가 시스템 관리자 계급의 칸을 끄면 다음 배포에 되살아난다"
    category: other
    reason: "04-20 ENG-D2 설계(관리 계급이 자기 콘솔에서 잠기지 않게)이고 `project-status.test.ts` ENG-D3 ③이 「시스템 관리자 항목은 재시드가 켠다」로 고정한다. 결함이 아니라 운영 안내 대상(권한표 화면에서 시스템 관리자 열을 꺼도 유지되지 않음)"
    evidence_status: "결정적. named test green(의도된 동작으로)"
deferred:
  - truth: "MAST-01 「입력 시 자동완성된다」의 화면 소비자"
    addressed_in: "Phase 5 · Phase 6"
    evidence: "ROADMAP Phase 3 성공 기준 5: 「거래처마다 기본 증빙 종류를 두어 Phase 5·6의 지출결의·카드 사용 등록 때 자동으로 채워진다」. `domain/vendors.searchVendors`는 있다 — 붙을 지출결의·카드 사용 화면이 아직 없다(이번 라운드 상태 변화 없음)"
  - truth: "성공 기준 2·6 — 전 메뉴 대상 권한·노출·행동 로그 검수"
    addressed_in: "Phase 7"
    evidence: "Phase 3 goal 본문 「전 메뉴 대상 검수는 Phase 7 끝에서 한다」 + ROADMAP Phase 7 성공 기준 5. ROADMAP Phase 3 절은 2d7f73e 이후 글자 단위로 같다(diff 0)"
  - truth: "관리자 폼 7개의 §6-3 폼 템플릿 이관 (design-review A-H2·A-H3) · 폰 375px 관리자 표 · /review M-4·L-1 · /cso R2~R5 · design-review 미승인 이월분 · 03-REVIEW-2 Low 4건"
    addressed_in: "Phase 4 · Phase 7 · 후속"
    evidence: "`03-OPEN-ITEMS.md` 해당 절(2d7f73e 이후 무변경), ROADMAP Phase 7 성공 기준 5. 이번 라운드는 항목별 진척을 재판정하지 않았다 — 성공 기준 판정에 걸리지 않는 이월분이다"
human_verification:
  - test: "PR #38 머지(3c1b015) 뒤 스테이징 배포가 끝났으면 시스템 관리자로 `/admin`과 `/admin/permissions`를 연다 (6회차 사람 판정 1)"
    expected: "`/admin`에 관리 화면 묶음이 보이고 `/admin/permissions` 권한표에 빈 칸이 없다. 스테이징 배포(deploy #103 · main f85c9af)가 성공했다"
    why_human: "스테이징 페이지 자체는 이 컨테이너에서 열린다(2026-10-01 04:35Z `curl https://plant8-staging-67rumhdgba-du.a.run.app/login` → 200 — 6회차의 「프록시 403」은 지금 사실이 아니다). 막힌 것은 로그인이다 — Claude가 시스템 관리자 자격 증명으로 로그인하는 것을 auto-mode가 차단해 관리자 화면을 직접 볼 수 없었다"
    status: resolved
    resolution: "2026-10-01 사용자 확인(채팅, 03:13:40Z(#103 staging 완료 확인 뒤 질문)~03:20Z 사이). 오케스트레이터 질문 원문: 「시스템 관리자 계정으로 스테이징에서 `/admin`: 관리 화면 묶음이 보이는지, `/admin/permissions`: 권한표에 빈 칸이 없는지 열어 보고 결과만 알려 주세요. 상단 바·서체가 평소대로면 셸 확인도 함께 끝납니다」 → 사용자 답: 「둘 다 정상」. 답이 온 시각에 스테이징은 deploy run #103(id 36807956531, main f85c9af — staging job 03:08:13–03:13:40Z success)을 서비스하고 있었다(#104 staging은 03:39:18Z 시작 · 03:43:44Z 끝). 사용자는 열 수를 답하지 않았다 — 「빈 칸 없음」만 관찰이고, 시드 MENUS 22 × 동작 3 = 66열은 코드에서 센 값이지 관찰이 아니다. deploy run #103과 앞선 #101(36799772848, 844e8ae)·#102(36805788826, fe6ab22)의 success는 사용자 보고가 아니라 Claude가 `gh run list`로 확인했다(이 addendum에서 다시 읽음). bada253(#104)은 `/admin` 인덱스·`/admin/permissions`를 건드리지 않았으므로 이 확인의 범위는 현재 HEAD에도 그대로 적용된다"
  - test: "스테이징 `/admin/permissions` 격자 + 배포 Job 3종 (5회차 사람 판정 1)"
    expected: "격자가 빈 칸 없이 렌더된다"
    why_human: "5회차 항목 — 이미 닫힘"
    status: resolved
    resolution: "2026-09-22 스테이징(plant8-staging-67rumhdgba-du.a.run.app, deploy run #38 · SHA 6ad58fd)에 account.yml run #12로 만든 claude-verify-20260922@plant8.co.kr(role-sysadmin)로 로그인해 GET /admin/permissions → 200. SSR 표 실측: caption 「계급별 메뉴 접근 권한표」, 행 5(대표 · 본부 책임자 · 팀장 · 기획 PM · 시스템 관리자) × 열 45, 셀 225개 전부 체크박스 포함, 빈 셀 0, 체크 45(seed permissions=45와 일치). 이 세션의 Chromium이 프록시 CA를 신뢰하지 못해 Node fetch(TLS 검증 유지)로 SSR HTML을 파싱했다. 계정은 reset(run #15)으로 세션 만료. 배포 Job은 deploy run #37(35620678515)·#38 staging 로그에서 bootstrap·migrate·seed 모두 successfully completed"
  - test: "Secret Manager `app-data-key-v1` 32바이트 (5회차 사람 판정 2)"
    expected: "staging·prod 모두 32바이트"
    why_human: "5회차 항목 — 이미 닫힘"
    status: resolved
    resolution: "2026-09-22 Cloud Shell 실측으로 staging·prod 모두 32바이트 확인(커밋 34f9154). 이후 재발은 `lib/env.ts` 부팅 검사가 막는다"
---

# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) 검증 보고서 — 7회차 재검증 (페이즈 종료)

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 이 페이즈는 메커니즘(판정 함수·리포지토리 행 필터 + DTO 투영·설정 레지스트리·누수 스캔 테스트 생성기·암호화 헬퍼·보관함·행동 로그)과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다
**Verified:** 2026-10-01T03:40:51Z 본판정(HEAD `aa5464e` — 그 시점 코드 트리 = origin/main `f85c9af`) · 2026-10-01T04:38:30Z addendum(HEAD `d49ad56` — bada253·48da153 머지 뒤, 코드 트리는 더 이상 f85c9af와 같지 않다)
**Status:** passed — 성공 기준 6/6, gap·회귀 0, 열린 사람 판정 0 (addendum 뒤에도 유지)
**Re-verification:** Yes — 6회차(human_needed, 2026-09-24T09:41:40Z)가 later phase 변경으로 stale이 되어 다시 했다

**이 라운드의 전제:** 6회차의 주장은 상속하지 않았다. 기준점 `2d7f73e`(6회차 HEAD) → `aa5464e` 사이에서 6회차 covered_files 중 바뀐 167개를 `git diff --name-status`로 뽑고, Phase 3 메커니즘 파일(`domain/permissions/*`·`domain/settings/*`·`domain/action-log/*`·`domain/archive`·`domain/vendors`·`domain/seed`·`repositories/permissions.ts`·`test/integration/leak-scan.test.ts`)은 diff 본문을 읽었다. 관리자 화면·`ui/`·`lib/actions`는 제거된 게이트 줄(`can(`·`canWrite`·`canArchive`·`notFound`·`visible(`·`authedActionClient`·`ForbiddenError`)을 전수 grep하고 남은 게이트 위치를 현재 파일에서 확인했다. ROADMAP Phase 3 절은 2d7f73e 이후 **글자 단위로 같고**(diff 0), REQUIREMENTS의 Phase 3 요구 13개도 문구 변화가 없다.

**무변경 확인(`git diff --quiet 2d7f73e HEAD`):** `lib/crypto.ts` · `scripts/rotate-key.ts` · `eslint/` · `eslint.config.mjs` · `domain/permissions/can.ts` · `domain/permissions/visible.ts` · `db/schema/{corp-cards,org,vendors,permissions,settings,action-log}.ts` · `test/unit/settings/registry-coverage.test.ts` · `test/unit/crypto.test.ts`.

## 7회차 addendum — bada253(PR #111) · 48da153(PR #115) 머지 뒤 (2026-10-01T04:38:30Z, HEAD `d49ad56`)

**왜 다시 봤나:** 본판정(03:40:51Z, `aa5464e`) 뒤 브랜치가 origin/main을 머지(`9a03686`)해 covered_files 12개가 바뀌었다. 오케스트레이터가 재검증 없이 covered_digest만 다시 계산했다(PR #117 리뷰 CRITICAL). 이 절이 그 재검증이고 digest는 아래 판정 뒤에 새로 계산했다.

**범위:** `aa5464e..d49ad56` 커밋 11개(first-parent 9). `.planning`·`.claude` 밖 파일을 바꾼 것은 bada253 하나 — 앱 7개(`app/(app)/admin/{vendors,corp-cards,code-tables}/page.tsx`·`.module.css`, `ui/button/Button.module.css`)와 테스트(`test/e2e/{vendors,corp-cards,code-tables,mobile-vendors,mobile-corp-cards}.spec.ts` + 새 `row-actions-helpers.ts`, `test/unit/app/tertiary-underline-css.test.ts`, Phase 3 밖 E2E 4개). 48da153은 `.claude/hooks`·`.claude/gates`·`.planning`만.

### bada253 diff 판정 — Phase 3 계약 변경 없음

| 계약 | 판정 | 근거 (diff 본문을 읽음) |
| ---- | ---- | ----------------------- |
| 권한 게이트(`can()`·`canWrite`·`canArchive`) | 무변경 | 세 page.tsx의 제거 줄은 `<>`·`</>`·`className={styles.toggle}`뿐. `canWrite ? … : null`·`canArchive ? … : null`·`canWrite \|\| canArchive`·`hasActions` 열 게이트는 diff 문맥 줄로 그대로 |
| 보관(삭제)·비활성·숨김 흐름 | 무변경 | `CodeItemDeleteButton`·`CorpCardDeleteButton`·`VendorDeleteButton`·`*ActiveToggle`·`VendorHiddenToggle` 호출과 인자 동일, `archivedAt ? null` 그대로. 바뀐 것은 감싸는 요소(프래그먼트 → `<span className={styles.rowActions}>`) |
| 노출·DTO 투영 | 무관 | domain·repositories·db·lib·`domain/permissions/*` 변경 0 |
| 행 동작 | 표시만 | `.rowActions`(inline-flex, gap `--s-4`, 699.98px 이하 wrap)·`.rowLink`(nowrap) 추가. `.tertiary` 밑줄이 border-bottom → text-decoration(1px → hover 2px, aria-disabled면 `--line` 색) — `Button.tsx` 무변경이라 aria-disabled 클릭 차단 그대로 |
| `/admin` 인덱스 · 권한표 | 무관 | `app/(app)/admin/page.tsx`·`admin/permissions/**`·`ui/permission-grid`·`ui/shell` 변경 0, 이 화면들은 3차 버튼도 쓰지 않는다(grep) → 사람 판정 1의 확인 범위는 현재 HEAD에도 그대로 |
| 테스트 | 강화만 | Phase 3 E2E 5개 스펙은 추가만(유일한 제거 줄은 `mobile-vendors.spec.ts` import 확장). 새 단언: 행 동작 간격 ≥ `--s-4`, 폰 44×44, 「삭제」 확인 줄 포함 가로 넘침 없음. 단위 `tertiary-underline-css` 밑줄 선택자 하한 22 → 23, 새 describe 1개 · 테스트 5건 |

### 이 프로세스에서 직접 돌린 것 (HEAD `d49ad56`, 코드 = `9a03686`)

| 게이트 | 명령 | 결과 |
| ------ | ---- | ---- |
| 린트 | `pnpm lint` | exit 0 · error 0 (기존 boundaries v5→v6 설정 이관 경고만) |
| 타입 | `pnpm typecheck` | exit 0 |
| 단위 전체 | `pnpm test:unit` | **171 files · 2277 passed** (본판정 2272 + bada253 새 5건) |
| 단위 대상 | `pnpm vitest run --project unit` `tertiary-underline-css` · `admin-menu-registry` · `no-admin-boolean` · `ui/admin-index-css` · `ui/admin-index-link` · `ui/admin-master-list-first` · `ui/admin-table-caption` · `ui/single-column` · `design-system-docs` | **9 files · 160 passed** |
| 스테이징 도달 | `curl -o /dev/null -w '%{http_code}' …a.run.app/login` | 200 |

통합은 다시 돌리지 않았다 — bada253·48da153은 domain·repositories·db·통합 테스트를 건드리지 않았고, 아래 CI #104가 bada253에서 integration 2샤드를 돌렸다.

### CI (gh로 직접 읽음)

| run | SHA | 잡 | 결과 |
| --- | --- | -- | ---- |
| deploy #104 (36810353354) | bada253 (PR #111) | ci/quality · ci/integration (1)·(2) · ci/e2e (1)·(2) · staging | **전부 success** (03:24:25–03:43:44Z), production skipped(수동 승격). main 푸시 = 전체 E2E 스위트 |
| deploy #105 (36814444345) | 48da153 (PR #115, `.claude`만) | ci/quality · integration ×2 · e2e ×2 · staging | completed — quality·integration×2·e2e×2·staging 전부 success, production skipped |

**addendum 판정:** bada253은 Phase 3 관리자 화면의 행 동작 표시(간격·밑줄)만 바꿨고 권한 게이트·보관 흐름·노출/DTO 투영·판정 함수는 그대로다. 성공 기준 6개의 판정과 근거는 본판정 그대로 유효하고, bada253 코드는 CI #104 전체 스위트와 이번 lint·typecheck·단위로 덮인다. **status passed 유지.**

### 본판정 문구 정정 (PR #117 리뷰)

- 사람 판정 1의 why_human 「스테이징을 이 컨테이너에서 볼 수 없다(프록시 403)」는 지금 사실이 아니다 — `/login` 200. 막힌 것은 Claude의 자격 증명 로그인(auto-mode 차단)이었다.
- 사람 판정 1의 근거는 질문·답 원문으로 바꿨다(frontmatter `human_verification[0].resolution`). 사용자는 열 수를 답하지 않았다 — 「22 × 3 = 66열 관찰」은 주장하지 않는다. deploy #101·#102·#103 success는 사용자 보고가 아니라 Claude가 gh로 확인한 것이다.
- 커밋 수: `2d7f73e..aa5464e` = **841개(first-parent 70)** — `git rev-list --count`와 GitHub compare API(ahead_by 841)가 일치. 본판정의 「902개(first-parent 71)」는 틀렸다. (오케스트레이터 지시의 「901」도 git과 맞지 않아 git 값을 적었다.)
- 「HEAD 코드 = f85c9af」는 본판정 시점(`aa5464e`)에만 맞다. 지금 HEAD는 bada253 코드를 포함한다.

## 게이트 (본판정)

### 이 프로세스에서 직접 돌린 것 (HEAD `aa5464e`, 2026-10-01 03:22–03:40Z)

| 게이트 | 명령 | 결과 |
| ------ | ---- | ---- |
| 린트 | `pnpm lint` | exit 0 (기존 boundaries v5→v6 설정 이관 경고만, error 0) |
| 타입 | `pnpm typecheck` | exit 0 |
| SQL 린트 | `pnpm lint:sql` | exit 0 (21 files, 0 issues) |
| 단위 | `pnpm test:unit` | **171 files · 2272 passed** · exit 0 |
| 통합 (Phase 3 대상 26파일) | `pnpm vitest run --project integration` + action-log-query · action-log · archive · archived-session · auth · code-tables · corp-card-owner-archived · corp-card-owner-edit · corp-cards · custom-fields · db-bootstrap · document-counters · document-counters-concurrency · leak-scan · lockout · mast-04-code-item-label · org · people · rate-limit · roles · seed-permissions · settings-export · settings · team-memberships · vendors · visibility | **26 files · 1768 passed** · exit 0 (877s) |
| 통합 (재시드 보존 named) | `… project-status.test.ts visibility.test.ts -t "ENG-D3 ③ — 첫 시드\|A-05 — 빈 DB\|(f) 기획 PM\|(g) 관리자가" --reporter=verbose` | **4 passed** (이름 확인) |

`test/e2e`·`test/integration` 전체에 `test|it|describe` `.skip`·`.only`·`.fixme` **0건**(grep).

### CI (E2E — 이 컨테이너에서는 돌리지 않음)

`f85c9af`는 PR #112의 squash 머지다. PR head `f7abfab`와 `aa5464e`의 트리 차이는 `.claude/rules/sessions.md`(+11줄, 세션 이름 규칙 문서)와 `.planning/.continue-here.md` 두 파일뿐이라 본판정 시점의 코드·테스트 트리가 같았다(현재 HEAD는 bada253을 더 포함 — 위 addendum의 CI #104가 덮는다). `gh api …/commits/f7abfab…/check-runs`: **quality · integration (1) · integration (2) · e2e (1) · e2e (2) 전부 success**(2026-10-01 02:25–02:40Z). E2E 2샤드가 돈 것은 ready PR의 전체 스위트다(CLAUDE.md §5 — CI가 `CI=true` 프로덕션 빌드). 아래 truth 표가 인용한 E2E 스펙(`permissions-grid`·`settings`·`action-log`·`archive`·`vendors`·`people`·`admin-nav` 등)은 이 실행 집합에 들어 있다. 2d7f73e 이후 이 스펙들의 diff는 문구 기대 갱신·새 회귀 테스트 추가·스크롤 좌표 보정뿐이고 기존 단언을 지운 줄은 없다(`permissions-grid.spec.ts:11` 「셀을 켜면 저장 버튼 없이 즉시 저장되고, 그 계급이 실제로 코드표 화면에 들어갈 수 있게 된다」·`:73` 권한 없는 계급 404 유지).

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 6개)

| # | Truth | Status | Evidence (현재 코드 + 이번 게이트) |
| - | ----- | ------ | -------- |
| 1 | 사람 등록 + 계급 + 팀으로 입사자를 추가하고 계정·초기 비밀번호를 같은 화면에서 발급한다. 계급 5종은 추가·개명되는 데이터. 본부 ⊃ 팀, 팀 소속은 발령일 이력 | ✓ VERIFIED | `domain/people/index.ts:234`가 같은 흐름에서 `createAccount`를 부르고 `person-form.tsx:36-40·64`가 `tempPassword`를 한 번 보인다. `domain/permissions/roles.ts` 시드 5종(+ `workScope` 필드) · `createRole :111` · `renameRole :130`. `db/schema/org.ts:60` `effective_from`(무변경). 행동 증거: 통합 `people`·`org`·`team-memberships`·`roles` green(이번 실행), 단위 `org/team-at-date`·`people/change-person-role` green, E2E `people`·`org`·`roles`·`mobile-people` CI green |
| 2 | 권한표·노출표 체크박스가 즉시 메뉴·동작·응답 필드를 바꾼다. 판정은 `can()`/`visible()`/`scopeFor()`, domain 출구는 `project()` DTO, `plant8/no-row-type-escape` 2차 방어 | ✓ VERIFIED | `can.ts`·`visible.ts` **무변경**(캐시 없음). `project()`는 `projectMany`의 한 행 래퍼가 됐고 노출 판정은 여전히 `visible()`만 부른다(요청당 항목별 1회, 저장 없음) — all-of 목록은 판정을 **더 엄격하게** 할 뿐이다. `registerDto`가 빈 all-of 목록을 거부. `eslint.config.mjs:79` error(무변경), `pnpm lint` exit 0. 관리자 화면 게이트 순감 0(제거 10줄 전부 재배치 확인), `/admin` 인덱스 `can(view)` + 0그룹 404(`admin/page.tsx:28·35`). **6회차 deferred 1(재시드가 노출표 선택을 되돌림)은 04-20이 닫았다** — frontmatter `deferred_resolved`. 행동 증거: 통합 `visibility.test.ts`(재시드 (f)·(g) 포함)·`seed-permissions.test.ts` green(이번 실행), `project-status.test.ts` ENG-D3 ③·A-05 green(named), 단위 `permissions/*`·`no-admin-boolean`·`role-menu`·`admin-menu-registry` green, E2E `permissions-grid`·`admin-nav`·`mobile-admin-nav` CI green. 세 함수 밖 업무 범위 판정(Phase 4)은 advisory 6 |
| 3 | 누수 스캔 생성기: 액션 × 계급, DTO × 계급, 내보내기 × 계급 자동 생성, 노출표에 매핑 안 된 DTO 필드 실패 | ✓ VERIFIED | `test/integration/leak-scan.test.ts` 세 축(`:130` DTO · `:177` 액션 · `:192` 내보내기)과 빈 레지스트리 방어(`:99·103·110`)·`NULL_DTO_EXEMPT_EXPORTS`(`:114`) 유지. all-of 필드는 항목마다 펼쳐 케이스를 만든다(약화가 아니라 확장). 04.1·04.2·04-07 레지스트리가 import 추가만으로 편입 — 성공 기준 3 「등록만 하면 검사가 따라온다」가 계속 작동. `test/unit/leak-scan-coverage.test.ts`가 `app/**/actions.registry.ts` 전부의 import를 강제(단위 green). `registerDto` 호출 파일 18개 중 15개는 직접 import, 3개(`domain/approvals/dto`·`domain/leave/dto`·`domain/action-log/index`)는 import된 모듈(`domain/approvals`·`domain/leave`·`domain/action-log/export`)을 통해 들어온다. 통합 `leak-scan.test.ts` green(이번 실행) |
| 4 | 설정 키 typed registry 한 곳 + 화면 자동 생성, 안 읽는 키 테스트 실패, JSON 왕복, 세율·면제·절사 이력형 키, 로그인 잠금 키 | ✓ VERIFIED | `settings/page.tsx:90` `for (const def of SETTING_DEFS)`(키 하드코딩 0). `registry-coverage.test.ts` **무변경**·green. 이력형 7개(세율 6 + 연차). `export.ts`의 가져오기가 일반 저장과 같은 적용 시작일 검증·순번 낮추기 가드를 한 트랜잭션에서 지나게 강화됐다(왕복 계약 유지). 행동 증거: 통합 `settings.test.ts`·`settings-export.test.ts` green(이번 실행), 단위 `settings/registry`·`settings-import-cli` green, E2E `settings.spec.ts` CI green |
| 5 | 거래처(숨김·자동완성)·법인카드(개인/팀)·코드표 등록·수정·비활성화, 증빙 종류 세금 규칙 필드, 계좌번호 AES-256-GCM `v1:`, 뒤 4자리, 해제 = 노출표 항목 + 행동 로그, v1·v2 혼재 복호화 단위 테스트 | ✓ VERIFIED | `lib/crypto.ts`·`scripts/rotate-key.ts`·`crypto.test.ts` **무변경**(혼재 복호화 단위 green). `revealAccountNumber`(`domain/vendors/index.ts:388-405`) = `visible()` → `recordAction(mask_reveal)` → `decrypt`(기록이 먼저, 문구만 변경). `db/schema/corp-cards.ts:32` 소지자 XOR 팀 CHECK(무변경). 코드표는 `description` 열이 더해졌고 증빙 종류 세금 규칙 시드 무변경. 행동 증거: 통합 `vendors`·`code-tables`·`corp-cards`·`corp-card-owner-*`·`mast-04-code-item-label` green(이번 실행), 단위 `vendors/*`·`code-tables/tax-rule`·`corp-cards/owner-rule` green, E2E `vendors`·`vendor-edit`·`master-edit`·`code-tables`·`code-tables-write-gate`·`corp-cards` CI green |
| 6 | 핵심 행동만 로그, Excel 내보내기·마스킹 해제 끌 수 없음, 사람·기간·종류·문서 필터 + Excel + 정리, 삭제 = 보관함, 관리자만 보고 복원 | ✓ VERIFIED | `record.ts:73-84` ALWAYS_ON = `excel_export`·`mask_reveal`·`action_log_prune`·`status_change`·`account_lock`·`account_unlock`·`holiday_change`. `:147` 핵심 아닌 종류 throw, `:150` ALWAYS_ON이면 설정 조회 생략(`tx` 주입은 같은 판정을 잠근 트랜잭션 안에서 할 뿐). `archive/page.tsx:15`·`action-log/page.tsx:33` `can()` 게이트. `domain/archive` `archive :51`·`restore :80`·`listArchive :142` — 복원이 도메인 규칙 엔티티(견적 줄·리저브)를 도메인 함수에 넘기기 전에 `assertCanWrite`(보관함 쓰기)를 먼저 지나고, 목록은 리저브 줄을 볼 수 있는 사람에게만 보인다(더 엄격). 행동 증거: 통합 `action-log`·`action-log-query`·`archive`·`archived-session` green(이번 실행), 단위 `action-log/*` green, E2E `action-log`·`archive` CI green |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

여섯 truth 모두 상태 전이를 주장하므로 presence만으로 올리지 않았다 — 이번 프로세스의 통합 green과 코드 트리가 같은 PR head의 CI E2E green을 근거로 VERIFIED다.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MAST-01 자동완성의 화면 소비자 | Phase 5 · 6 | 성공 기준 5 본문 |
| 2 | 전 메뉴 권한·노출·로그 검수 | Phase 7 | Phase 3 goal + Phase 7 성공 기준 5 |
| 3 | 폼 템플릿 이관·폰 표·리뷰 이월분 | Phase 4 · 7 · 후속 | `03-OPEN-ITEMS.md`(무변경) |

6회차 deferred 1(재시드 노출표 원복)은 **해결됨** — 아래 「6회차 지적 처리」.

### 6회차 지적 처리

| 6회차 항목 | 7회차 판정 | 근거 |
| ---------- | --------- | ---- |
| deferred 1 — 배포 시드가 노출표 선택을 되돌린다 | **해결 (04-20)** | 기획 PM·팀장·본부 책임자·대표 행은 `insertVisibilityIfAbsent`(onConflictDoNothing), 기획 PM 발행액만 `upsertVisibilityIfUnedited`(`updated_by IS NULL`일 때만). 관리자가 바꾼 행은 `setVisibilityCell`이 `updatedBy: viewer.id`(`matrix.ts:172`)로 남겨 두 함수 모두 건드리지 않는다. 이번 실행 named 4건 green. 시스템 관리자 행만 설계상 덮어씀(advisory 7) |
| 사람 판정 1 — PR #38 뒤 스테이징 `/admin` + 권한표 | **해결 (사용자 확인 2026-10-01)** | deploy run #103(36807956531) success @f85c9af, #101·#102 success — 셋 다 Claude가 `gh run list`로 확인. 사용자 「둘 다 정상」(03:13:40Z(#103 staging 완료 확인 뒤 질문)~03:20Z 사이, 스테이징 = #103) — 질문은 「관리 화면 묶음이 보이는지 · 권한표에 빈 칸이 없는지」였고 열 수는 답하지 않았다. 6회차의 46열 기대는 낡아 「빈 칸 없음」으로 좁혔다(시드 기준 22 × 3 = 66은 코드에서 센 값, 관찰 아님) |
| advisory F1·F2·F4·keys 주석·MVP 모드 | 유지 | 줄 번호만 갱신(F1 `:89`, F2 `:388-405`) |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | F1 `APP_ENV` fail-open (`lib/env.ts:47-49·89`) | security | 실배포 경로는 deploy.sh가 막음, Phase 1 영역 |
| 2 | F2 해제 경로에 행 범위 없음 (`domain/vendors/index.ts:388-405`, `repositories/vendors.ts:47`) | security | SC5 계약은 충족 |
| 3 | F4 행동 로그 열람이 노출표만 봄 | security | ADMN-10 원문과 일치 |
| 4 | `keys.ts:56` 절 머리 주석이 낡음 | other | 동작 영향 0 |
| 5 | MVP 모드 불일치 | other | 1~6회차와 같은 판단 |
| 6 | (신규) 업무 범위(`roles.work_scope`) 판정이 세 함수 밖(`domain/projects/status.ts:64-89`, `references.ts:82`) | architectural | Phase 4 OV-4로 리뷰된 결정, Phase 3 메커니즘은 그대로. Phase 7 전 메뉴 검수에서 SC2 문구 정합 권장 |
| 7 | (신규) 시스템 관리자 행은 재시드가 매번 켬 | other | 04-20 ENG-D2 설계, named test가 의도로 고정. 운영 안내 대상 |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `domain/permissions/{can,visible,scope-for,project}.ts` | 판정 4함수 | ✓ VERIFIED | can·visible 무변경, project = projectMany 래퍼(all-of), scope-for 문구만 |
| `eslint/rules/no-row-type-escape.mjs` + `eslint.config.mjs:79` | 2차 방어 | ✓ VERIFIED | 무변경, `pnpm lint` exit 0 |
| `test/integration/leak-scan.test.ts` + `test/unit/leak-scan-coverage.test.ts` | 3축 생성기 + 등록 누락 검출 | ✓ VERIFIED | 새 레지스트리 편입, 둘 다 green |
| `domain/settings/{keys,registry,export}.ts` + `registry-coverage.test.ts` | registry + JSON 왕복 + 미사용 키 검출 | ✓ VERIFIED | 키·검증 확장, coverage 테스트 무변경 green |
| `lib/crypto.ts` · `scripts/rotate-key.ts` | AES-256-GCM + 회전 | ✓ VERIFIED | 무변경, 혼재 복호화 green |
| `domain/action-log/{record,index,export}.ts` | 핵심 로그 + 필터 + CSV | ✓ VERIFIED | ALWAYS_ON 3종 추가, `tx` 주입 |
| `domain/archive/index.ts` | 보관함 + 복원 | ✓ VERIFIED | 도메인 복원기 위임(쓰기 게이트 뒤) |
| `repositories/permissions.ts` · `domain/seed/index.ts` | 권한·노출 저장 + 멱등 시드 | ✓ VERIFIED | 없을 때만 넣는 시드(04-20) |
| `db/migrations/0003~0008` | 스키마 척추 | ✓ VERIFIED | SQL 무변경, 0010~0020은 가산, `lint:sql` exit 0, 통합 global-setup이 0020까지 적용한 DB로 green |
| `app/(app)/admin/**` 화면 + `/admin` 인덱스 | 관리 콘솔 | ✓ VERIFIED | 게이트 순감 0, 인덱스 `can()` 게이트 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `permission-grid-client.tsx` | `matrix.setPermissionCell` | `setPermissionCellAction` | ✓ WIRED | E2E 즉시 반영 CI green |
| `can()` | `repositories/permissions.findPermission` | 매 호출 DB 조회 | ✓ WIRED | `can.ts` 무변경 |
| `setVisibilityCell` | 재시드 보존 | `updatedBy: viewer.id`(`matrix.ts:172`) ↔ `insertVisibilityIfAbsent`/`upsertVisibilityIfUnedited` | ✓ WIRED | named 4건 green |
| `settings/page.tsx` | `SETTING_DEFS` | `for (const def of SETTING_DEFS)` | ✓ WIRED | `:90` |
| `account-number.tsx` | `revealAccountNumber` | 서버 액션 → `visible()` → `recordAction` → `decrypt` | ✓ WIRED | 순서 무변경 |
| PC 메뉴·더보기 시트 | 관리자 화면 11종 | 「관리」 → `/admin` 인덱스 → 그룹 링크 | ✓ WIRED | `ui/shell/role-menu.ts:79-120` ADMIN_MENUS 11키 = MENUS admin.* 11키(단위 `admin-menu-registry` green) |
| `deploy.sh main()` | migrate · seed | `run_seed` | ✓ WIRED | `:721` — 이제 관리자 선택을 덮지 않는 시드 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `admin/permissions/page.tsx` | 격자 셀 | `repositories/permissions` | 예 | ✓ FLOWING |
| `admin/settings/page.tsx` | 섹션·필드·이력 | `SETTING_DEFS` + `repositories/settings` | 예 | ✓ FLOWING |
| `admin/vendors/page.tsx` | 뒤 4자리·평문 | 암호문 → `decrypt()` | 예 | ✓ FLOWING |
| `admin/page.tsx` | 그룹·링크 | `MENUS` × `can()` | 예 | ✓ FLOWING |
| `admin/action-log/page.tsx` · `admin/archive/page.tsx` | 로그 행 · 보관 항목 | `repositories/action-log` · `repositories/archive` | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 정적 게이트 | `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` | 전부 exit 0 | ✓ PASS |
| 단위 전체 | `pnpm test:unit` | 2272 passed | ✓ PASS |
| Phase 3 통합 26파일 | 위 표 | 1768 passed | ✓ PASS |
| 재시드 보존 | named 4건 verbose | 4 passed | ✓ PASS |
| 메뉴 수 | `pnpm exec tsx -e 'import("./domain/permissions/menus.ts")…'` | MENUS 22 · ACTIONS 3 · admin 11 | 확인(사람 판정 1 기대값) |
| 관리자 화면 게이트 제거 | `git diff 2d7f73e HEAD -- 'app/(app)/admin' ui/ lib/actions` 제거 줄 grep | 10줄, 전부 같은 파일에 재배치 | ✓ PASS |
| skip/only | `grep -rnE '\b(test\|it\|describe)\.(skip\|only\|fixme)\b' test/e2e test/integration` | 0건 | ✓ PASS |
| CI E2E | `gh api …/commits/f7abfab…/check-runs` | quality·integration×2·e2e×2 success | ✓ PASS |
| 스테이징 배포 | `gh run list --commit f85c9af…` | deploy #103 success | ✓ PASS |
| (addendum) bada253 CI | `gh run view 36810353354 --json jobs` | quality·integration×2·e2e×2·staging success | ✓ PASS |
| (addendum) 정적·단위 @d49ad56 | `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` | exit 0 · exit 0 · 2277 passed | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | `scripts/*/tests/probe-*.sh` 0개, PLAN·SUMMARY에 probe 선언 0건 | SKIPPED (해당 없음) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ADMN-01 | 권한표 계급×메뉴×동작 | ✓ SATISFIED | `matrix.ts` 문구만, E2E CI green |
| ADMN-02 | 정보 노출표·기본값 | ✓ SATISFIED | 재시드 원복 결함 해결(04-20), 새 항목 모두 `staffDefault` 명시 |
| ADMN-03 | 전 경로 동일 적용 + 누수 테스트 자동 생성 | ✓ SATISFIED | 새 레지스트리 등록만으로 편입, 통합 green |
| ADMN-05 | 설정 레지스트리·자동 화면·읽기 강제 | ✓ SATISFIED | `registry-coverage.test.ts` 무변경 green |
| ADMN-06 | JSON 내보내기·가져오기 | ✓ SATISFIED | `settings-export.test.ts` green |
| ADMN-08 | 계급 추가·개명 | ✓ SATISFIED | `roles.ts:111·130`, `roles.test.ts` green |
| ADMN-10 | 행동 로그 필터·Excel·정리·노출표 통제 | ✓ SATISFIED | `action-log*.test.ts` green, E2E CI green |
| ADMN-12 | 삭제 = 보관함, 관리자 복원 | ✓ SATISFIED | `archive.test.ts` green |
| OPS-05 | 핵심 행동만, Excel·해제 끌 수 없음 | ✓ SATISFIED | `record.test.ts` green |
| MAST-01 | 거래처 숨김·자동완성·암호화·기본 증빙 | ✓ SATISFIED | 자동완성 화면 소비자는 Phase 5·6 deferred |
| MAST-02 | 계급 + 팀, 팀 ⊂ 본부, 발령일 이력 | ✓ SATISFIED | `org.ts` 무변경, `team-memberships` green |
| MAST-03 | 법인카드 개인/팀 | ✓ SATISFIED | XOR CHECK 무변경, `corp-cards*.test.ts` green |
| MAST-04 | 코드표 추가·수정·비활성화 | ✓ SATISFIED | `code-tables.test.ts` green |

**ORPHANED 요구사항:** 없음 — REQUIREMENTS.md가 Phase 3에 매핑한 13개(MAST-01~04, ADMN-01·02·03·05·06·08·10·12, OPS-05)가 모두 플랜에 선언돼 있고 문구 변화가 없다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD`/`FIXME`/`XXX` — 2d7f73e 이후 바뀐 covered 코드·테스트 파일의 추가 줄 전수 | — | **0건** |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` (같은 범위) | — | **0건** |
| `domain/settings/keys.ts` | 56 | 낡은 절 머리 주석 | ℹ️ Info | advisory 4 |

### Human Verification Required

없음 — 세 항목 모두 닫힘.

#### 1. PR #38 뒤 스테이징 `/admin` 인덱스 + 권한표 — ✓ 닫힘 (2026-10-01, 사용자 확인)

**질문(오케스트레이터 → 사용자, 채팅 2026-10-01, 03:13:40Z(#103 staging 완료 확인 뒤 질문)~03:20Z 사이):** 「시스템 관리자 계정으로 스테이징에서 `/admin`: 관리 화면 묶음이 보이는지, `/admin/permissions`: 권한표에 빈 칸이 없는지 열어 보고 결과만 알려 주세요. 상단 바·서체가 평소대로면 셸 확인도 함께 끝납니다」

**답:** 「둘 다 정상」

**Result:** pass — 답이 온 시각 스테이징은 deploy run #103(id 36807956531, main `f85c9af`, staging job 03:13:40Z 끝)이었다(#104 staging은 03:43:44Z 끝). #101·#102·#103 success는 사용자 보고가 아니라 Claude가 `gh run list`로 확인했다. 사용자는 열 수를 답하지 않았다 — 관찰은 「관리 화면 묶음 보임 · 권한표 빈 칸 없음」까지이고, 시드 기준 22 × 3 = 66열은 코드에서 센 값이다. 스테이징 페이지는 컨테이너에서 열리지만(`/login` 200) Claude의 자격 증명 로그인은 auto-mode가 막았다 — 판정은 사용자 관찰이다. bada253은 이 두 화면을 건드리지 않았다.

#### 2. 스테이징 배포 Job 3종 + `/admin/permissions` 격자 — ✓ 닫힘 (5회차, 2026-09-22)

#### 3. Secret Manager `app-data-key-v1` 32바이트 — ✓ 닫힘 (5회차, 2026-09-22)

상세는 frontmatter `human_verification[].resolution`.

### Gaps Summary

**gap 없음, 회귀 없음, 열린 사람 판정 없음 → passed (addendum 뒤에도 유지 — bada253은 행 동작 표시만 바꿨고 CI #104 전체 green, 이번 lint·typecheck·단위 2277 green).** 본판정에서 성공 기준 6개가 현재 코드와 이번 게이트(lint·typecheck·lint:sql exit 0, 단위 2272, Phase 3 통합 1768 + 재시드 named 4, 코드 트리가 같은 PR head의 CI E2E 2샤드)로 뒷받침된다. 6회차 이후 167개 covered 파일 변경은 세 갈래다 — (1) 이후 페이즈가 Phase 3 메커니즘에 **등록만으로** 올라탐(메뉴·정보 항목·행동 종류·설정 키·DTO/액션 레지스트리·보관함 도메인 복원기), (2) 판정을 더 엄격하게 하는 확장(all-of 노출, 빈 목록 거부, 가져오기 적용일 검증, 리저브 보관 항목 가림), (3) 문구 명사형·표시 정돈(게이트 순감 0). 6회차가 deferred로 둔 재시드 노출표 원복 결함은 04-20이 고쳤고 이번 라운드에 named test로 확인했다. 새 advisory 둘(세 함수 밖 업무 범위 판정, 시스템 관리자 행 재시드)은 리뷰된 설계라 gap이 아니다.

**검증 뒤 추가(2026-10-01, 오케스트레이터 — PR #117 Codex 리뷰 P1):** (1)의 「등록만으로」에 예외가 있다. Phase 4의 `domain/projects/references.ts` `listProjectFormReferences`는 메뉴 권한(`can`)만 보고 거래처·사람·팀 행을 `visible()`/`project()` 없이 `{ id, name }`으로 돌려주며, `ProjectReferenceOption`은 누수 스캔 DTO 등록부에 없다 — 노출표에서 `vendor.value`·`person.value`·`team.value`를 끈 계급에도 프로젝트 폼이 이름을 보여 줄 수 있다. 이것은 Phase 3 메커니즘의 결함이 아니라 Phase 4 소비 코드의 우회이므로 이 보고서의 판정(passed)은 유지하되, 요구사항 ADMN-03(우회 없음)과 MAST-01(소비 화면 미구현, Deferred Items 참조)은 `requirements revert-phase`로 `Gaps Found`로 되돌렸다. 코드 수정은 별도 작업이다.

---

## 이전 라운드 이력

| 회차 | 날짜 | HEAD | 판정 | 요지 |
| ---- | ---- | ---- | ---- | ---- |
| 1~4 | ~2026-09-21 | — | — | 상세는 git 이력의 이전 `03-VERIFICATION.md` |
| 5 | 2026-09-22T06:23:57Z | b3e3215 이전 main | passed 6/6 | 스테이징 격자 5×45 실측, 키 32바이트 |
| 6 | 2026-09-24T09:41:40Z | 3c1b015 → 2d7f73e | human_needed 6/6 | PR #38 뒤 스테이징 실측 1건 대기, 재시드 노출표 원복 결함 deferred(04-20) |
| **7** | **2026-10-01T03:40:51Z** | **aa5464e (= f85c9af 코드 트리)** | **passed 6/6** | 재시드 결함 해결 확인, 사람 판정 1 사용자 확인으로 닫힘 |
| 7 addendum | 2026-10-01T04:38:30Z | d49ad56 (bada253·48da153 머지 뒤) | passed 6/6 유지 | bada253 = 행 동작 간격·3차 밑줄 표시만, CI #104 green. 사람 판정 1 문구·커밋 수 정정 |

### 6회차 보고서 본문 (2026-09-24, 보존)

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 이 페이즈는 메커니즘과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다
**Verified:** 2026-09-24T09:41:40Z (코드 판정 07:53:19Z + 로컬 전체 게이트 07:48–08:10Z @3c1b015 + 2d7f73e 영향 판정 09:35Z + 2d7f73e 전체 게이트 green)
**Status:** human_needed — 코드·게이트 기준 gap·회귀 0. 남은 것은 PR #38 뒤 스테이징 실측 1건
**Re-verification:** Yes — 5회차(passed, 2026-09-22T06:23:57Z)가 stale이 되어 HEAD `3c1b015`(PR #38 머지) 기준으로 다시 했다

**이 라운드의 전제:** 5회차의 주장은 상속하지 않았다. 기준점 `b3e3215`(06:23:57Z 직전 main) → `3c1b015` 사이 커밋 123개 중 5회차 covered_files를 건드린 57개 파일을 diff로 전수 읽고, 성공 기준 6개를 현재 코드에서 다시 유도한 뒤 같은 HEAD의 전체 게이트 결과로 판정했다. ROADMAP의 Phase 3 절과 REQUIREMENTS의 Phase 3 요구 13개는 이 구간에 **문구 변화가 없다**(diff grep 0건).

## 로컬 게이트

HEAD `3c1b015`, 이 컨테이너, 2026-09-24 07:48–08:10Z. 오케스트레이터가 돌렸고 검증자가 로그(`int.log`·`unit.log`·`e2e.log`) 꼬리의 합계를 직접 확인했다.

**HEAD `2d7f73e` 재실행(오케스트레이터 보고, 전체 게이트 green):** lint exit 0 · typecheck exit 0 · unit **743/743** · 통합 **1027/1027** · `CI=true` Playwright E2E **176 passed**(3.6m, exit 0 — 3c1b015의 165에서 워드마크·디자인 리뷰·/qa 회귀 스펙 11건 증가). 3c1b015 → 2d7f73e 사이 Phase 3 covered 변경은 워드마크 링크·EMPTY 링크 밑줄·Tab 순서 기대 셋뿐이고 domain·repositories·db·관리자 화면·판정 함수에 닿지 않는다. 아래 truth 판정은 이 HEAD의 통합·E2E green으로도 뒷받침되며, 새 워드마크 링크의 Tab 순서는 `keyboard-nav.spec.ts`가 E2E에서 고정한다(green).

| 게이트 | 명령 | 결과 |
| ------ | ---- | ---- |
| 린트 | `pnpm lint` | exit 0 (기존 boundaries v5→v6 설정 이관 경고만) |
| 타입 | `pnpm typecheck` | exit 0 |
| SQL 린트 | `pnpm lint:sql` | exit 0 |
| 단위 | `pnpm test:unit` | **76 files · 743 passed** |
| 통합 | `pnpm test:integration` | **38 files · 1027 passed** (519s) |
| E2E | `pnpm test:e2e:ci` (`db:reset:test` + `CI=true` 프로덕션 빌드) | **165 passed · 0 failed · 0 flaky** (3.7m) |

로그는 dot 리포터라 스펙 이름이 찍히지 않는다. 대신 `test/e2e`·`test/integration` 전체에 `test.skip`·`.only`·`.fixme`·`it.skip`·`describe.skip`이 **0건**임을 grep으로 확인했다 — 아래 truth 표가 인용한 스펙·테스트 파일은 전부 실행 집합에 들어 있었고 통과했다.

`CI=true`는 프로덕션 빌드를 쓴다 — CLAUDE.md가 정한 완료 신호다.

### 이 프로세스에서 직접 돌린 것 (단위, 대상 한정)

| 명령 | 결과 |
| ---- | ---- |
| `pnpm vitest run --project unit test/unit/settings test/unit/permissions test/unit/action-log test/unit/crypto.test.ts test/unit/leak-scan-coverage.test.ts test/unit/no-admin-boolean.test.ts test/unit/ui/role-menu.test.ts test/unit/ui/permission-grid-resync.test.ts test/unit/eslint-rules/no-row-type-escape.test.ts test/unit/code-tables test/unit/corp-cards test/unit/org test/unit/people test/unit/vendors test/unit/design-system-docs.test.ts test/unit/import-cycles.test.ts` | **24 files · 238 passed** |
| `pnpm vitest run --project unit test/unit/admin-menu-registry.test.ts test/unit/ui/admin-index-css.test.ts test/unit/ui/admin-index-link.test.ts test/unit/ui/admin-table-caption.test.ts test/unit/ui/single-column.test.ts test/unit/ui/history-list-id-prefix.test.ts test/unit/ui/admin-master-list-first.test.ts` | **7 files · 68 passed** |

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 6개)

| # | Truth | Status | Evidence (현재 코드 + 이번 게이트) |
| - | ----- | ------ | -------- |
| 1 | 사람 등록 + 계급 + 팀으로 입사자를 추가하고 계정·초기 비밀번호를 같은 화면에서 발급한다. 계급 5종은 추가·개명되는 데이터. 본부 ⊃ 팀, 팀 소속은 발령일 이력 | ✓ VERIFIED | `domain/people/index.ts:160-161`이 같은 흐름에서 `createAccount`를 부르고 `person-form.tsx:36-40`이 `tempPassword`를 화면에 한 번 보인다. `domain/permissions/roles.ts:22-27` 시드 5종 + `createRole :98`·`renameRole :117`. `db/schema/org.ts:60·65` `effective_from` + `UNIQUE(user_id, effective_from)`. 이 구간 변경은 사람 상세의 표시 분리(`PersonRoleChange`/`PersonHistorySection`, 액션 배선 동일)뿐. 행동 증거: 통합 `people.test.ts`·`org.test.ts`·`team-memberships.test.ts`·`roles.test.ts`, E2E `people.spec.ts`·`org.spec.ts`·`roles.spec.ts`·`mobile-people.spec.ts`, 단위 `org/team-at-date`·`people/change-person-role` — 전부 이번 게이트 green |
| 2 | 권한표·노출표 체크박스가 즉시 메뉴·동작·응답 필드를 바꾼다. 판정은 `can()`/`visible()`/`scopeFor()`뿐, domain 출구는 `project()` DTO, `plant8/no-row-type-escape`가 2차 방어 | ✓ VERIFIED | `can.ts`(30줄)·`visible.ts`(23줄)·`project.ts`(36줄) **무변경**, 캐시 없이 매 호출 DB 조회(`can.ts:26-28`). `scope-for.ts`(55줄)는 ENTITY_MENUS에 `project`·`quote_line` 두 줄만 추가. `eslint.config.mjs:79` error(무변경), `pnpm lint` exit 0. 관리자 진입점이 「관리」 한 줄로 접혔지만 `app/(app)/admin/page.tsx:25`가 `MENUS`를 `can(view)`로 거르고 0그룹이면 `notFound()`. 관리자 화면 diff 전수에서 `can(`·`canWrite`·`canArchive`·`notFound` **제거 0건**. 행동 증거: E2E `permissions-grid.spec.ts:11` 「셀을 켜면 저장 버튼 없이 즉시 저장되고, 그 계급이 실제로 코드표 화면에 들어갈 수 있게 된다」·`:73` 권한 없는 계급 404 · `admin-nav.spec.ts`·`mobile-admin-nav.spec.ts`(새 진입점), 통합 `visibility.test.ts`, 단위 `no-admin-boolean`·`role-menu`·`admin-menu-registry` — green. **지속성 결함 1건은 deferred(04-20)** |
| 3 | 누수 스캔 생성기: 액션 × 계급, DTO × 계급, 내보내기 × 계급 자동 생성, 노출표에 매핑 안 된 DTO 필드 실패 | ✓ VERIFIED | `test/integration/leak-scan.test.ts`의 세 축(`:115` DTO · `:130` 액션 · `:145` 내보내기)과 빈 레지스트리 방어(`:84·88·95`)·`NULL_DTO_EXEMPT_EXPORTS`(`:41·99`) 그대로. PR #38은 `import` 4줄만 더했고 Phase 4 DTO 넷(`domain/projects/index.ts:80·139`, `quotes/lines.ts:142`, `revenue/index.ts:142`)과 `projects/actions.registry.ts`가 **등록만으로** 검사에 편입돼 이번 통합 1027건 안에서 green — 성공 기준 3 「이후 페이즈는 등록만 하면 검사가 따라온다」의 첫 실사용 증거. 단위 `leak-scan-coverage.test.ts` green |
| 4 | 설정 키 typed registry 한 곳 + 화면 자동 생성, 안 읽는 키 테스트 실패, JSON 왕복, 세율·면제·절사 이력형 키, 로그인 잠금 키 | ✓ VERIFIED | `settings/page.tsx:37`이 `SETTING_DEFS`를 순회(키 하드코딩 0) — Phase 4 새 키 6개가 새 절로 자동 등장. 세율 6종 `kind: "historized"`(`keys.ts:60·70·80·90·100·113`), 절사·기준일 `simple`, 잠금 키 `:14·24`. **readBy 표시 만료가 실제로 작동했다**: Phase 4가 세율·절사 키를 읽기 시작하자(`domain/money/tax.ts`·`revenue/index.ts`) `registry-coverage.test.ts`의 표시 만료 강제대로 11개의 `readBy`가 지워졌다. 행동 증거: 통합 `settings.test.ts`·`settings-export.test.ts`(새 키 포함 왕복), E2E `settings.spec.ts` — green |
| 5 | 거래처(숨김·자동완성)·법인카드(개인/팀)·코드표 등록·수정·비활성화, 증빙 종류 세금 규칙 필드, 계좌번호 AES-256-GCM `v1:`, 뒤 4자리, 해제 = 노출표 항목 + 행동 로그, v1·v2 혼재 복호화 단위 테스트 | ✓ VERIFIED | `lib/crypto.ts:13` `aes-256-gcm`, `:5` `v1:<iv>:<tag>:<ciphertext>`(무변경). `crypto.test.ts:120` 혼재 복호화 green. `domain/vendors/index.ts:376-393` = `visible()` → `recordAction(mask_reveal)` → `decrypt`(무변경, 기록이 먼저). `db/schema/corp-cards.ts:32-33` 소지자 XOR 팀 CHECK. 이 구간 화면 변경은 빈 계좌번호 칸 `—`(`account-number.tsx:31`)·caption·폭뿐. 마이그레이션 0009는 `project_status` 시드 값만 교체하고 사람이 더한 값이 있으면 RAISE EXCEPTION(`0009:101-107`). 행동 증거: E2E `vendors.spec.ts`·`vendor-edit.spec.ts`·`master-edit.spec.ts`·`code-tables.spec.ts`·`code-tables-write-gate.spec.ts`·`corp-cards.spec.ts`, 통합 `vendors.test.ts`·`code-tables.test.ts`·`corp-cards.test.ts`·`mast-04-code-item-label.test.ts` — green |
| 6 | 핵심 행동만 로그, Excel 내보내기·마스킹 해제 끌 수 없음, 사람·기간·종류·문서 필터 + Excel + 정리, 삭제 = 보관함, 관리자만 보고 복원 | ✓ VERIFIED | `domain/action-log/record.ts:65-73` ALWAYS_ON = `excel_export`·`mask_reveal`·`action_log_prune` + Phase 4 `status_change`. `:127`이 ALWAYS_ON이면 설정 조회를 건너뛰고 `:124`가 핵심 아닌 종류를 throw. CSV 수식 중화 `export.ts:31·40-46`, 클라이언트 BOM 재부착(`filter-bar.tsx:157-162`). `archive/page.tsx:15`·`action-log/page.tsx:32` `can()` 게이트, `domain/archive` `archive :49`·`restore :70`·`listArchive :130` 무변경. 행동 증거: E2E `action-log.spec.ts`·`archive.spec.ts`, 통합 `action-log.test.ts`·`action-log-query.test.ts`·`archive.test.ts`, 단위 `record.test.ts`·`export.test.ts` — green |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

여섯 truth 모두 상태 전이를 주장하므로 presence만으로 올리지 않았다 — 같은 HEAD의 통합·`CI=true` E2E green을 근거로 VERIFIED다.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | **배포 시드가 노출표 선택을 되돌린다** — `scripts/deploy.sh:666-668`이 배포마다 `run_seed`, `domain/seed/index.ts:165-180`의 `upsertVisibility`가 onConflictDoUpdate로 기획 PM 행을 `staffDefault`, 시스템 관리자 행을 true로 덮는다. 관리자가 기획 PM의 정보 항목을 바꿔도 다음 배포에 조용히 원복 | Phase 4 (04-20) | ROADMAP Phase 4 Plans 「04-20 … 없을 때만 넣는 시드(권한·노출)」, `04-20-PLAN.md:308·400·418`. PR #38은 새 권한 셀만 `insertPermissionIfAbsent`로 바꿨다(`seed-permissions.test.ts`). **5회차가 놓친 기존 결함이며, 04-20 전까지 스테이징·운영에서 실제로 일어난다.** 로컬 게이트는 이 경로(관리자 변경 → 재시드)를 검사하지 않으므로 green과 모순되지 않는다 |
| 2 | MAST-01 자동완성의 화면 소비자 | Phase 5 · 6 | 성공 기준 5 본문 |
| 3 | 전 메뉴 권한·노출·로그 검수 | Phase 7 | Phase 3 goal + Phase 7 성공 기준 5 |
| 4 | 폼 템플릿 이관·폰 표·리뷰 이월분 | Phase 4 · 7 · 후속 | `03-OPEN-ITEMS.md` |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | F1 `APP_ENV` fail-open (`lib/env.ts:47-49·85`) | security | 파일 무변경, 실배포 경로는 deploy.sh가 막음 |
| 2 | F2 해제 경로에 행 범위 없음 (`domain/vendors/index.ts:376-393`, `repositories/vendors.ts:47-50`) | security | 파일 무변경, SC5 계약은 충족 |
| 3 | F4 행동 로그 열람이 노출표만 봄 | security | ADMN-10 원문과 일치 |
| 4 | `keys.ts:56` 절 머리 주석이 낡음 | other | 동작 영향 0 |
| 5 | MVP 모드 불일치 | other | 1~5회차와 같은 판단 |

5회차 advisory 중 F3(CSV 수식 주입)·`fa4a5a2` 인용·설정 액션 주석 3건은 **5회차 작성 전에 이미 닫혀 있었다**(`05a1c9a`·`d7ad2f8`) — frontmatter `corrections_to_previous_report`.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `domain/permissions/{can,visible,scope-for,project}.ts` | 판정 4함수 | ✓ VERIFIED | can·visible·project 무변경, scope-for 매핑 2줄 추가 |
| `eslint/rules/no-row-type-escape.mjs` + `eslint.config.mjs:79` | 2차 방어 | ✓ VERIFIED | 무변경, `pnpm lint` exit 0 |
| `test/integration/leak-scan.test.ts` | 3축 생성기 | ✓ VERIFIED | Phase 4 레지스트리 편입, 통합 green |
| `domain/settings/{keys,registry,export}.ts` | registry + JSON 왕복 | ✓ VERIFIED | keys에 6개 추가·readBy 11개 만료 |
| `lib/crypto.ts` · `scripts/rotate-key.ts` | AES-256-GCM + 회전 | ✓ VERIFIED | 무변경, 혼재 복호화 green |
| `domain/action-log/{record,index,export}.ts` | 핵심 로그 + 필터 + CSV | ✓ VERIFIED | record에 `status_change` 추가 |
| `domain/archive/index.ts` | 보관함 + 복원 | ✓ VERIFIED | 무변경 |
| `repositories/document-counters.ts` | 카운터 표 규약(증가는 Phase 4) | ✓ VERIFIED | Phase 4가 계획대로 `allocateNumber` 추가, `document-counters.test.ts`·`document-counters-concurrency.test.ts` green |
| `db/migrations/0003~0008` | 스키마 척추 | ✓ VERIFIED | SQL 무변경, `db:reset:test`가 0010까지 적용한 DB로 E2E green, `lint:sql` exit 0 |
| `app/(app)/admin/**` 10개 화면 + `/admin` 인덱스 | 관리 콘솔 | ✓ VERIFIED | 게이트 줄 제거 0, 새 인덱스도 `can()` 게이트 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `permission-grid-client.tsx` | `domain/permissions/matrix.setPermissionCell` | `setPermissionCellAction` | ✓ WIRED | `permissions/actions.ts:5·18` 무변경, E2E 즉시 반영 green |
| `can()` | `repositories/permissions.findPermission` | 매 호출 DB 조회 | ✓ WIRED | 캐시 없음 유지 |
| `settings/page.tsx` | `SETTING_DEFS` | `for (const def of SETTING_DEFS)` | ✓ WIRED | `:37` |
| `account-number.tsx` | `revealAccountNumber` | 서버 액션 → `visible()` → `recordAction` → `decrypt` | ✓ WIRED | 무변경 |
| PC 메뉴·더보기 시트 | 관리자 화면 10종 | 「관리」 → `/admin` 인덱스 → 그룹 링크 | ✓ WIRED | `ui/shell/role-menu.ts` ADMIN_MENUS 10키 = `menus.ts` admin.* 10키, `admin/page.tsx:25` |
| 모든 관리자 서버 액션 | `authedActionClient` | 본문 256KB 검사 → 세션 | ✓ WIRED | `lib/actions/client.ts`, 관리자 E2E 전부 green |
| `deploy.sh main()` | db-bootstrap · migrate · seed | `jobs execute --wait` | ✓ WIRED | `:666-668` — seed가 배포마다 돈다(deferred 1의 원인) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `admin/permissions/page.tsx` | 격자 셀 | `repositories/permissions` | 예 | ✓ FLOWING |
| `admin/settings/page.tsx` | 섹션·필드·이력 | `SETTING_DEFS` + `repositories/settings` | 예 | ✓ FLOWING |
| `admin/vendors/page.tsx` | 뒤 4자리·평문 | 암호문 → `decrypt()` | 예 | ✓ FLOWING |
| `admin/page.tsx` | 그룹·링크 | `MENUS` × `can()` → `adminIndexGroups` | 예 | ✓ FLOWING |
| `admin/action-log/page.tsx` · `admin/archive/page.tsx` | 로그 행 · 보관 항목 | `repositories/action-log` · `repositories/archive` | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 판정·설정·로그·암호화 단위 | 위 첫 vitest 명령 | 238 passed | ✓ PASS |
| 관리자 인덱스·메뉴 레지스트리 단위 | 위 둘째 vitest 명령 | 68 passed | ✓ PASS |
| 전체 게이트 | 「로컬 게이트」 표 6종 | 전부 exit 0 | ✓ PASS |
| skip/only로 빠진 테스트 | `grep -rnE '(test\|it\|describe)\.(skip\|only\|fixme)' test/e2e test/integration` | 0건 | ✓ PASS |
| 새 설정 키가 실제로 읽힌다 | `grep -rln TAX_VAT_RATE … app domain repositories lib scripts` | `domain/money/tax.ts`·`domain/revenue/index.ts` | ✓ PASS |
| 관리자 화면 게이트 제거 여부 | `git diff b3e3215 HEAD -- 'app/(app)/admin' ui/ \| grep can(\|notFound\|canWrite…` | 제거 0, 추가만 | ✓ PASS |
| 배포마다 시드 실행 | `grep -n run_seed scripts/deploy.sh` | `:668` | 확인 → deferred 1 |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | `scripts/*/tests/probe-*.sh` 0개, PLAN·SUMMARY에 probe 선언 0건 | SKIPPED (해당 없음) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ADMN-01 | 권한표 계급×메뉴×동작 | ✓ SATISFIED | `matrix.ts`·`PermissionGrid.tsx` 무변경, E2E 즉시 반영 green |
| ADMN-02 | 정보 노출표·기본값 | ✓ SATISFIED — 재시드 원복 결함 deferred(04-20) | `info-items.ts` 새 항목 4개 모두 `staffDefault` 명시(매출 둘은 false) |
| ADMN-03 | 전 경로 동일 적용 + 누수 테스트 자동 생성 | ✓ SATISFIED | Phase 4 DTO가 등록만으로 편입, 통합 green |
| ADMN-05 | 설정 레지스트리·자동 화면·읽기 강제 | ✓ SATISFIED | `registry-coverage.test.ts`, readBy 만료 실작동 |
| ADMN-06 | JSON 내보내기·가져오기 | ✓ SATISFIED | `settings-export.test.ts` green, `pnpm settings:import` |
| ADMN-08 | 계급 추가·개명 | ✓ SATISFIED | `roles.ts:98·117`, E2E `roles.spec.ts` |
| ADMN-10 | 행동 로그 필터·Excel·정리·노출표 통제 | ✓ SATISFIED | CSV 수식 중화 + BOM 재부착, E2E `action-log.spec.ts` |
| ADMN-12 | 삭제 = 보관함, 관리자 복원 | ✓ SATISFIED | `domain/archive` 무변경, E2E `archive.spec.ts` |
| OPS-05 | 핵심 행동만, Excel·해제 끌 수 없음 | ✓ SATISFIED | `record.test.ts` green |
| MAST-01 | 거래처 숨김·자동완성·암호화·기본 증빙 | ✓ SATISFIED | 자동완성 화면 소비자는 Phase 5·6 deferred |
| MAST-02 | 계급 + 팀, 팀 ⊂ 본부, 발령일 이력 | ✓ SATISFIED | `org.ts` 무변경, `team-at-date`·`team-memberships` green |
| MAST-03 | 법인카드 개인/팀 | ✓ SATISFIED | XOR CHECK + `owner-rule.test.ts` + E2E |
| MAST-04 | 코드표 추가·수정·비활성화 | ✓ SATISFIED | 쓰기 경로 무변경, `quote_subcategory`를 Phase 4가 같은 메커니즘으로 추가 |

**ORPHANED 요구사항:** 없음 — REQUIREMENTS.md가 Phase 3에 매핑한 13개가 모두 플랜에 선언돼 있고 이 구간에 문구 변화가 없다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD`/`FIXME`/`XXX` — `b3e3215..3c1b015`에서 바뀐 app·domain·repositories·lib·ui·db·scripts·eslint·test 파일 전수 | — | **0건** |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` (같은 범위의 프로덕션 코드) | — | **0건** |
| `domain/seed/index.ts` | 165-180 | 재시드가 노출표 선택을 onConflictDoUpdate로 덮음 | ⚠️ Warning → deferred(04-20) | ROADMAP이 Phase 4 04-20에 명시적으로 배정해 gap이 아니라 deferred |
| `domain/settings/keys.ts` | 56 | 낡은 절 머리 주석 | ℹ️ Info | advisory 4 |

### Human Verification Required

#### 1. PR #38 뒤 스테이징 `/admin` 인덱스 + 권한표 46열 (신규, 미결)

**Test:** 3c1b015 스테이징 배포가 끝났으면 시스템 관리자로 `/admin`·`/admin/permissions`를 열고, 배포 로그에서 migrate(0009·0010)·seed가 성공했는지 본다
**Expected:** `/admin`에 그룹별 관리자 화면 10개, 권한표 5행 × 46열 빈 셀 0
**Why human:** 진입점 구조와 열 수가 5회차 스테이징 실측 뒤에 바뀌었다. 로컬 `CI=true` E2E가 같은 화면을 green으로 고정했지만 스테이징 적용은 이 컨테이너에서 볼 수 없다(`*.run.app` 프록시 403)

#### 2. 스테이징 배포 Job 3종 + `/admin/permissions` 격자 — ✓ 닫힘 (5회차)

**Result (2026-09-22):** pass — deploy run #37·#38 staging 로그에서 bootstrap·migrate·seed successfully completed. 스테이징 `/admin/permissions` SSR 실측 「계급별 메뉴 접근 권한표」 5행 × 45열, 셀 225개 전부 체크박스, 빈 셀 0, 체크 45(seed permissions=45). 상세는 frontmatter `resolution`.

#### 3. Secret Manager `app-data-key-v1` 32바이트 — ✓ 닫힘 (5회차)

**Result (2026-09-22):** pass — Cloud Shell 실측으로 staging·prod 모두 32바이트(커밋 34f9154). 이후 재발은 `lib/env.ts` 부팅 검사가 막는다.

### Gaps Summary

**gap 없음, 회귀 없음.** ROADMAP 성공 기준 6개가 현재 코드와 같은 HEAD의 전체 게이트(단위 743 · 통합 1027 · `CI=true` E2E 165, 전부 green)로 뒷받침된다. 5회차 이후 57개 파일 변경은 세 갈래다 — (1) 관리자 화면 표시 정돈과 진입점 접기(권한 게이트 제거 0, 새 `/admin` 인덱스에도 `can()` 게이트), (2) Phase 4가 Phase 3 메커니즘에 **등록만으로** 올라탄 것(메뉴·정보 항목·scope 엔티티·행동 종류·설정 키·DTO/액션 레지스트리·카운터 증가), (3) 세율 키 `readBy` 만료처럼 Phase 3이 심은 강제 장치가 계획대로 작동한 흔적.

새로 드러난 것은 **5회차가 놓친 기존 결함 1건** — 배포마다 도는 시드가 기획 PM·시스템 관리자 행의 정보 노출표 선택을 기본값으로 되돌린다. Phase 4 04-20이 ROADMAP에 이 수정을 명시해 deferred로 두지만, 04-20 실행 전까지 스테이징·운영에서 실제로 일어나므로 관리자에게 알려야 한다.

status가 passed가 아니라 human_needed인 이유는 코드 결함이 아니라 판정 규칙이다 — 사람 판정 절이 비어 있지 않으면(PR #38 뒤 스테이징 실측 1건) passed를 쓸 수 없다. 그 1건이 닫히면 passed다.

---

_Verified: 2026-09-24T09:41:40Z_
_Verifier: Claude (gsd-verifier), 6회차 재검증 (HEAD 3c1b015, 2d7f73e 영향 판정 보정)_

---

_Verified: 2026-10-01T03:40:51Z_
_Verifier: Claude (gsd-verifier), 7회차 재검증 (HEAD aa5464e, 페이즈 종료)_

_Addendum: 2026-10-01T04:38:30Z — Claude (gsd-verifier), HEAD d49ad56 (bada253·48da153 머지 뒤 재검증)_
