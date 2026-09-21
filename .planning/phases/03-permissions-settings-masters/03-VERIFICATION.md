---
phase: 03-permissions-settings-masters
verified: 2026-09-21T14:42:42Z
status: human_needed
score: 6/6 must-haves verified
covered_digest: "v1:sha256:ac0eee5312f2a6d657e787754d66baeb861e776e65507f604cb421326a2ad247"
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
  - ".planning/phases/03-permissions-settings-masters/03-UI-SPEC.md"
  - ".planning/phases/03-permissions-settings-masters/03-VALIDATION.md"
  - "app/(app)/account/actions.ts"
  - "app/(app)/admin/action-log/action-log.module.css"
  - "app/(app)/admin/action-log/actions.registry.ts"
  - "app/(app)/admin/action-log/actions.ts"
  - "app/(app)/admin/action-log/filter-bar.tsx"
  - "app/(app)/admin/action-log/page.tsx"
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
  - "test/e2e/settings.spec.ts"
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
  - "test/integration/document-counters.test.ts"
  - "test/integration/global-setup.ts"
  - "test/integration/leak-scan.test.ts"
  - "test/integration/lockout.test.ts"
  - "test/integration/mast-04-code-item-label.test.ts"
  - "test/integration/org.test.ts"
  - "test/integration/people.test.ts"
  - "test/integration/rate-limit.test.ts"
  - "test/integration/roles.test.ts"
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
  - "test/unit/ui/admin-master-list-first.test.ts"
  - "test/unit/ui/history-list-id-prefix.test.ts"
  - "test/unit/ui/permission-grid-resync.test.ts"
  - "test/unit/ui/role-menu.test.ts"
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
  previous_score: 13/13
  previous_verified: 2026-09-21T12:05:40Z
  round: 4
  gaps_closed:
    - "거래처 수정 왕복 화면 경로 — `test/e2e/vendors.spec.ts:123` 「거래처 수정 왕복 (MAST-01 · M-5)」 + `test/e2e/vendor-edit.spec.ts` (보관된 거래처의 `?editId=` 차단). 3회차 human item 3이 닫혔다"
    - "코드표 `value` 불변 결정의 계획 기록 — `03-OPEN-ITEMS.md:111` 「결정 기록 — MAST-04 「수정」의 범위 (2026-09-21)」. 3회차 human item 4가 닫혔다"
    - "코드표 `<th>동작</th>` 무조건 렌더 — `app/(app)/admin/code-tables/page.tsx:127`이 `canWrite || canArchive`로 감추고 `test/e2e/code-tables-write-gate.spec.ts:50`이 `columnheader 「동작」 count 0`을 단언한다. 3회차 deviation이 닫혔다"
    - "설정 화면 가져오기 안내 문구 — `settings-form-client.tsx:236`이 `pnpm settings:import --file <경로>` + `docs/OPERATIONS.md §12`를 가리킨다. 3회차 human item 5(사용자 결정 a)가 닫혔다"
    - "React taint 편차 — `.planning/ROADMAP.md:151` 성공 기준 2가 `plant8/no-row-type-escape`를 2차 방어로 명시하고 react 안정 채널에 API가 없다는 사실을 2026-09-21 사용자 결정으로 기록한다. 3회차 human item 6(사용자 결정 b)이 닫혔다. 더 이상 편차가 아니다"
  gaps_remaining: []
  regressions: []
  new_gaps: []
  corrections_to_previous_report:
    - "3회차 human item 1은 **사실이 틀렸다**. Cloud Run Job `plant8-{env}-account`는 배포 파이프라인에서 실행되지 않는다 — `scripts/deploy.sh:349`는 `jobs deploy`만 하고 `jobs execute`는 `:358`(db-bootstrap)·`:372`(migrate)·`:392`(seed) 세 곳뿐이며 `main()`도 `:666-668`에서 그 셋만 부른다. account Job은 `.github/workflows/account.yml`의 `workflow_dispatch`로 필요할 때만 돈다(`docs/OPERATIONS.md §7`). 「account Job exit 0」을 배포 로그에서 확인하라는 기대는 이번 보고서에서 삭제했다"
    - "3회차 human item 3의 「`vendors.spec.ts`에 `editId` 0건」은 이번 라운드 기준으로 낡았다 — `b12a7f2`가 왕복 스펙을, `a8d916c`가 보관 거래처 `?editId=` 차단 스펙을 넣었다"
    - "3회차 deviation 「`code-tables/page.tsx:125`의 `<th>동작</th>` 무조건 렌더」는 `ef94f0d`에서 고쳐졌다"
advisory:
  - finding: "F1 — `APP_ENV` 기본값이 fail-open이다. `lib/env.ts:47-49`가 `APP_ENV`를 `local`로 기본값 처리하고 `:85-92`가 `APP_ENV !== \"local\"`일 때만 `BETTER_AUTH_SECRET` 32자 이상을 강제한다. Dockerfile runtime 스테이지(`FROM node:24-slim AS runtime`)는 `NODE_ENV`·`PORT`·`HOSTNAME`만 설정하고 `APP_ENV`를 설정하지 않는다"
    category: security
    reason: "다만 /cso가 매긴 High는 **과대평가**다 — 실제 배포 경로에서는 `scripts/deploy.sh:440`이 서비스에 `APP_ENV=${ENV}`와 `--set-secrets=BETTER_AUTH_SECRET=...`을, `:315`가 Job에 같은 값을 넣는다. 즉 deploy.sh를 거친 staging·prod에서는 검증이 실제로 켜진다. 남는 위험은 같은 이미지를 deploy.sh 밖에서 띄웠을 때 조용히 `local` 규칙으로 떨어지는 것(심층 방어 부재)이다. 고치려면 Dockerfile runtime에 `APP_ENV`를 두지 말고 `lib/env.ts`에서 `NODE_ENV=production`이면 `APP_ENV` 미지정을 오류로 만드는 쪽이 맞다"
    evidence_status: "결정적(파일·줄 실재). 빨간 named test 없음. Phase 1의 환경 계약 영역이고 Phase 3 성공 기준 어디에도 걸리지 않는다"
  - finding: "F3 — 행동 로그 CSV 수식 주입. `domain/action-log/export.ts:31-36`의 `csvEscape`가 `[\",\\r\\n]`일 때만 따옴표로 감싸고 `=`·`+`·`-`·`@`로 시작하는 값을 중화하지 않는다. 행위자 이름·`detail` JSON이 그대로 셀에 들어간다"
    category: security
    reason: "내보낸 CSV를 Excel에서 열면 `=...`로 시작하는 셀이 수식으로 평가된다. 값을 넣을 수 있는 사람(사람 등록 화면의 이름 칸 등)이 로그를 여는 대표·경영관리를 노린다. 고치려면 `csvEscape` 한 곳에서 선행 `= + - @ \\t \\r`에 `'`를 붙이면 된다 — 단위 테스트 `test/unit/action-log/export.test.ts`에 붙이기 좋은 자리다"
    evidence_status: "결정적(파일·줄 실재). 빨간 named test 없음. ADMN-10·OPS-05 어디에도 이 요구가 없어 must-have 실패로 올리지 않았다"
  - finding: "F2 — `revealAccountNumber`가 행 범위를 좁히지 않는다. `domain/vendors/index.ts:376-393`은 `visible()`만 확인하고 `repositories/vendors.ts:47`의 `findVendorById`에는 scope·archived·hidden 조건이 없다"
    category: security
    reason: "마스킹 해제 권한이 있는 계급이 보관·숨김된 거래처의 계좌번호도 id만 알면 풀 수 있다. 다만 성공 기준 5가 요구한 것(「마스킹 해제는 정보 노출표 항목」 + 「복호화 호출은 권한 검사 + 행동 로그를 거친다」)은 충족돼 있다 — 이것은 그 위의 심층 방어다. 고치려면 `findVendorById`에 `scopeFor(viewer)` 조건을 붙이거나 `revealAccountNumber`에서 `archivedAt` 검사를 한다"
    evidence_status: "결정적(파일·줄 실재). 빨간 named test 없음"
  - finding: "F4 — 행동 로그 조회·내보내기가 메뉴 권한을 보지 않는다. `queryActionLog`(`domain/action-log/index.ts:263-266`)는 `visible(viewer, action_log.detail)`만, `pruneActionLog`(`:337-340`)는 `can(viewer, admin.action-log, write)`를 확인한다. `registerExport`는 `menu: \"admin.action-log\"`로 선언한다"
    category: security
    reason: "/cso가 Low로 본 판단에 동의하되 근거를 바꾼다 — REQUIREMENTS.md ADMN-10이 「열람 권한은 **정보 노출표로 통제**」라고 명시하므로 이 배선은 요구사항과 **일치한다**. 화면(`page.tsx:32`)의 `can()`이 추가 방어일 뿐이다. 시드 기본값에서도 노출되지 않는다(`domain/seed/index.ts:129-142` — `action_log.detail`의 `staffDefault`는 false, 시스템 관리자만 true). 관리자가 격자에서 메뉴는 끄고 정보 항목만 켜면 서버 액션 직접 호출로 조회·내보내기가 가능해지는 잠재 불일치로만 남는다"
    evidence_status: "결정적(파일·줄 실재). 시드 기본 상태에서는 재현 불가"
  - finding: "`03-OPEN-ITEMS.md:32`가 존재하지 않는 커밋 `fa4a5a2`를 인용한다 — `git cat-file -t fa4a5a2`가 실패한다. 실제 커밋은 `35b9fd1`이고 그 커밋 제목은 「관리자 화면 **10개**를 사용자 메뉴·「더보기」 시트에 등록」이라 같은 줄의 「관리자 화면 **9개**」도 틀렸다"
    category: other
    reason: "감사 추적이 끊긴다 — 다음 사람이 그 해결을 커밋으로 확인할 수 없다. `fa4a5a2` → `35b9fd1`, `9개` → `10개` 두 글자 수정이다"
    evidence_status: "결정적(`git cat-file -t fa4a5a2` 실패 · `git log --oneline -1 35b9fd1` 성공)"
  - finding: "`app/(app)/admin/settings/actions.ts:52-54`의 주석이 아직 「가져오기는 파일 업로드가 필요해 이 페이즈의 화면 범위 밖이다(… 통합 테스트로만 제공)」이라고 적혀 있다"
    category: other
    reason: "`94575dd`가 화면 문구는 고쳤지만 같은 내용의 코드 주석은 남았다. `pnpm settings:import` CLI가 실재하므로 주석도 낡았다. 동작 영향 0"
    evidence_status: "결정적(파일·줄 실재)"
  - finding: "MVP 모드 불일치 — ROADMAP Phase 3이 `Mode: mvp`인데 goal이 User Story 형식(「As a …, I want to …, so that ….」)이 아니다"
    category: other
    reason: "verify-mvp-mode 규칙상 검증을 거절해야 하나, 성공 기준 6개가 충분히 구체적이어서 표준 goal-backward로 진행했다(1~3회차와 같은 판단). MVP 모드를 의도한 것이 아니면 `Mode: mvp`를 지우는 것이 맞다"
    evidence_status: "none provided"
deferred:
  - truth: "MAST-01 「입력 시 자동완성된다」의 화면 소비자"
    addressed_in: "Phase 5 · Phase 6"
    evidence: "ROADMAP Phase 3 성공 기준 5: 「거래처마다 기본 증빙 종류를 두어 Phase 5·6의 지출결의·카드 사용 등록 때 자동으로 채워진다」. `domain/vendors.searchVendors`는 이 페이즈에 있고 `test/integration/vendors.test.ts`가 증명한다 — 붙을 화면이 아직 없다"
  - truth: "성공 기준 2·6 — 전 메뉴 대상 권한·노출·행동 로그 검수"
    addressed_in: "Phase 7"
    evidence: "Phase 3 goal 본문이 「전 메뉴 대상 검수는 Phase 7 끝에서 한다」고 명시하고, ROADMAP Phase 7 성공 기준 5가 그 검수를 받는다"
  - truth: "관리자 폼 7개의 §6-3 폼 템플릿 이관 (design-review A-H2·A-H3)"
    addressed_in: "Phase 4(컴포넌트 제작) · Phase 7(이관)"
    evidence: "ROADMAP Phase 7 성공 기준 5 본문에 「Phase 3 design-review가 실측으로 남긴 A-H2·A-H3의 이월분」으로 박혀 있다. 이번 라운드가 만든 폼(`CardOwnerForm`·`CodeItemLabelInput`)도 같은 대상이다"
  - truth: "폰 375px 관리자 표 가로 스크롤·줄바꿈 (DOM 감사 2·6·7) · /review M-4 · /review L-1 · /cso R2~R5"
    addressed_in: "Phase 4"
    evidence: "`03-OPEN-ITEMS.md` 「Phase 4로 미루기로 한 것 (사용자 승인 2026-09-21)」 표"
  - truth: "design-review 나머지 23건 중 미승인 이월분(H-2 · M-1~M-3 · A-M1~A-M7 · A-L1~A-L4 · L-1~L-6)"
    addressed_in: "Phase 4 · Phase 7"
    evidence: "`03-OPEN-ITEMS.md` 「design-review에서 나온 것」 절 — **사용자 승인 전**임을 파일이 명시한다"
  - truth: "`03-REVIEW-2.md` Low 4건(untrim 재저장 로그 중복 · 보관 검사-쓰기 비원자성 · `CardOwnerForm` validationErrors 미표시 · 없는 id 수정이 성공으로 보임)"
    addressed_in: "후속(미지정)"
    evidence: "`03-OPEN-ITEMS.md` 「수정 화면 리뷰·DOM 감사에서 나온 것」 절이 근거와 함께 「고치지 않고 남긴 것」으로 기록했다. 전부 Low, 데이터 손상 없음"
human_verification:
  - test: "스테이징 배포 파이프라인 로그에서 `db-bootstrap → migrate → seed` 세 Job의 결과를 확인하고, 시스템 관리자로 스테이징 `/admin/permissions`에 들어가 격자가 채워진 상태로 보이는지 본다 (`plant8-staging-seed` 로그에 `seed complete: … permissions=45 …`)"
    expected: "세 Job이 순서대로 exit 0이고 권한표 격자가 빈 칸 없이 렌더된다"
    why_human: "Cloud Run Job 환경(외부 node_modules·커넥터·Secret)에서 번들이 같은 결과를 내는지는 실제 배포 로그로만 확인된다. 코드 쪽 배선(`scripts/build-cli.mjs` · `scripts/deploy.sh:358·372·392·666-668` · `test/unit/deploy/cli-bundle.test.ts`)은 이번에도 실재를 확인했다. **이 컨테이너의 네트워크 정책이 `*.run.app` CONNECT에 403을 돌려줘 스테이징 호스트에 닿을 수 없다** — 여기서는 닫을 수 없다. (3회차가 기대에 넣었던 `plant8-staging-account` Job은 배포 파이프라인에 없다 — 삭제했다)"
  - test: "GCP Secret Manager의 staging·prod `app-data-key-v1` 값이 base64 디코드 시 32바이트인지 확인한다"
    expected: "두 환경 모두 32바이트. 아니면 거래처 계좌번호 저장이 fail-closed로 500이 된다"
    why_human: "`lib/env.ts`가 `APP_DATA_KEY_v1`을 선택 문자열로 두어 값이 없어도 앱이 뜨므로 코드만으로는 시크릿 존재·길이를 판정할 수 없다(03-SECURITY T-03-41 수락의 전제). GCP 콘솔·gcloud 접근이 필요하고 이 컨테이너에서는 막혀 있다"
---

# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) 검증 보고서 — 4회차 재검증

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 이 페이즈는 메커니즘과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다
**Verified:** 2026-09-21T14:42:42Z
**Status:** human_needed
**Re-verification:** Yes — 4회차. 브랜치 `claude/phase-3-verification-review-43x53f`, HEAD `62d4c8c`, 작업 트리 깨끗

**이 라운드의 전제:** 3회차 보고서(`03-VERIFICATION.md`, 12:05:40Z)의 주장은 상속하지 않고 코드에서 다시 유도했다. 그 결과 3회차 보고서가 **틀렸거나 낡은 항목 5건**을 찾았다 — frontmatter `re_verification.corrections_to_previous_report` 참조.

## 검증자가 이 프로세스에서 직접 돌린 게이트

| 게이트 | 명령 | 결과 |
| ------ | ---- | ---- |
| 타입 | `pnpm typecheck` | exit 0 |
| 린트 | `pnpm lint` | exit 0 |
| 단위 | `pnpm test:unit` | **581 passed** (63 files, 16.1s) |
| 통합 | `pnpm test:integration` | **730 passed** (28 files, 188.7s) |
| E2E | `pnpm db:reset:test && CI=true pnpm test:e2e` | **117 passed** (1.7m, 프로덕션 빌드) |

`CI=true`는 프로덕션 빌드를 쓴다 — CLAUDE.md가 정한 유일한 완료 신호다.

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 6개)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | 사람 등록 + 계급 + 팀으로 입사자를 추가하고 계정·초기 비밀번호를 같은 화면에서 발급한다. 계급 5종은 추가·개명되는 데이터. 조직은 본부 ⊃ 팀이고 팀 소속은 발령일 이력이다 | ✓ VERIFIED | `domain/people/index.ts:126-174`가 `createAccount`를 같은 흐름에서 부르고 `person-form.tsx:62`가 초기 비밀번호를 화면에 한 번 보여준다. `domain/permissions/roles.ts:22-27`에 시드 5종(대표·본부 책임자·팀장·기획 PM·시스템 관리자) + DB 기반 추가·개명(`:100-120`). `db/schema/org.ts:60-66`에 `team_memberships.effective_from` + `UNIQUE(user_id, effective_from)`. 행동 증거: 통합 `people.test.ts`·`org.test.ts`·`team-memberships.test.ts`, 단위 `org/team-at-date.test.ts`, E2E `people.spec.ts`·`org.spec.ts` — 전부 이번 라운드 green |
| 2 | 권한표·노출표 체크박스를 바꾸면 **즉시** 메뉴·동작·응답 필드가 바뀐다. 판정은 `can()`/`visible()`/`scopeFor()` 세 함수뿐이고 domain 출구는 `project()` DTO뿐이며 `plant8/no-row-type-escape`가 2차 방어다 | ✓ VERIFIED | 네 함수 실재(`can.ts` 30줄 · `visible.ts` 23줄 · `scope-for.ts` 50줄 · `project.ts` 36줄). `can()`은 캐시 없이 매 호출 DB를 읽어 즉시성이 구조적이다(`can.ts:26-29`). `eslint.config.mjs:79`에 `plant8/no-row-type-escape: "error"`(타입 정보 기반, fixture 10개 + `test/unit/eslint-rules/no-row-type-escape.test.ts`). 행동 증거: E2E `permissions-grid.spec.ts:11` 「셀을 켜면 저장 버튼 없이 즉시 저장되고, 그 계급이 실제로 코드표 화면에 들어갈 수 있게 된다」(두 번째 세션으로 재로그인해 실측) · 통합 `visibility.test.ts` (b)(c)(d) · 단위 `no-admin-boolean.test.ts`(불리언 분기 참조 0) — 전부 green |
| 3 | 누수 스캔 생성기: 액션 레지스트리 × 계급, DTO × 계급, 내보내기 함수 × 계급에서 테스트가 자동 생성되고 노출표에 매핑 안 된 DTO 필드가 있으면 실패한다 | ✓ VERIFIED | `test/integration/leak-scan.test.ts`가 `ACTION_REGISTRY`·`EXPORT_REGISTRY`·`DTO_REGISTRY` 세 축을 9개 `actions.registry.ts`에서 읽어 케이스를 생성한다. 빈 레지스트리 조용한 통과 방지(`:85`), `dtoName: null` 우회 방지 목록(`:37·95`), DTO 축(`:111`)·액션 축(`:126`)·내보내기 축(`:141`). 통합 730건에 포함돼 green |
| 4 | 설정 키는 typed registry 한 곳에 등록되고 화면이 자동 생성된다. 안 읽는 키가 있으면 테스트 실패. JSON 내보내기→빈 환경 가져오기가 같은 동작. 세율·면제·절사는 이력형 키 | ✓ VERIFIED | `app/(app)/admin/settings/page.tsx:37`이 `SETTING_DEFS`를 순회해 화면을 만든다(키 하드코딩 0). `test/unit/settings/registry-coverage.test.ts`가 `keys.ts`의 export 이름이 프로덕션 디렉터리에서 참조되는지 소스 검색으로 강제하고, `readBy: { phase }` 예외는 ROADMAP에 그 페이즈가 실재할 때만 허용한다. 이력형 키 실재(`keys.ts:59·70·81·92·104·118` — 부가세율·기타소득/사업소득 원천징수율·면제 기준 등)와 잠금 키(`:15·25`). 행동 증거: 통합 `settings-export.test.ts` (a) 왕복 동등 · (b) 멱등 · (c) 전부-아니면-전무 · (d) `excel_export` 로그 1행 — green |
| 5 | 거래처(숨김·자동완성)·법인카드(개인/팀)·코드표를 화면에서 등록·수정·비활성화한다. 증빙 종류마다 세금 규칙 필드. 계좌번호는 AES-256-GCM `v1:` 접두어로 암호화, 기본 뒤 4자리, 해제는 노출표 항목 + 행동 로그. 키 회전 v1·v2 혼재 복호화가 단위 테스트로 증명된다 | ✓ VERIFIED | `lib/crypto.ts:13`에 `aes-256-gcm` + `:5` `v1:<iv>:<tag>:<ciphertext>` 형식. `scripts/rotate-key.ts` 실재. 단위 `crypto.test.ts:115` v2 접두어 · `:118` **v1·v2 혼재 복호화**. `domain/vendors/index.ts:376-393` 해제 = `visible()` 검사 → `recordAction` → `decrypt` (기록이 먼저다). `db/schema/corp-cards.ts:34`에 소지자 XOR 팀 CHECK 제약. `domain/code-tables/tax-rule.ts` + `evidence-type-fields.tsx`. **행동 증거(이번 라운드 신규):** E2E `vendors.spec.ts:123` 「수정 왕복 — 이름 변경 반영 + 계좌번호 칸을 비워 저장해도 `****-**-4455`와 「번호 보기」 평문 보존」 · `vendor-edit.spec.ts:32` 「보관된 거래처는 `?editId=`로 직접 열어도 수정 폼이 뜨지 않는다」 · `master-edit.spec.ts` 4건 · `code-tables-write-gate.spec.ts` — green |
| 6 | 핵심 행동만 로그에 남고 Excel 내보내기·마스킹 해제는 끌 수 없다. 사람·기간·종류·문서 필터 + Excel 내보내기 + 정리. 무엇을 삭제해도 보관함으로 가고 관리자만 보고 복원한다 | ✓ VERIFIED | `domain/action-log/record.ts:60` `ALWAYS_ON_ACTION_TYPES = ["excel_export","mask_reveal","action_log_prune"]` + `:115-120`이 ALWAYS_ON이면 설정 조회를 아예 건너뛴다. 핵심 아닌 종류는 `UnknownActionTypeError`로 거부(`:106-108`) — 조용히 삼키지 않는다. 「어떤 행동을 핵심으로 남길지 설정」은 `action_log.optional_types`(`keys.ts:47`). `domain/archive/index.ts`에 `archive`/`restore`/`listArchive`, `archive/page.tsx:15`가 `can(admin.archive, view)` 아니면 404. 행동 증거: E2E `action-log.spec.ts` 3건 · `archive.spec.ts` · 통합 `action-log.test.ts`·`action-log-query.test.ts`·`archive.test.ts` · 단위 `action-log/record.test.ts`·`export.test.ts` — green |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

행동 의존 truth(상태 전이·정리 불변식)는 전부 이번 프로세스에서 실제로 돌린 테스트로 뒷받침된다 — presence만으로 VERIFIED를 매긴 항목은 없다.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `domain/permissions/{can,visible,scope-for,project}.ts` | 판정 4함수 | ✓ VERIFIED | 30·23·50·36줄, 전부 호출됨(화면·액션·도메인) |
| `eslint/rules/no-row-type-escape.mjs` | 컴파일 타임 2차 방어 | ✓ VERIFIED | `eslint.config.mjs:79` error, fixture 10개로 단위 테스트, `pnpm lint` exit 0 |
| `test/integration/leak-scan.test.ts` | 3축 생성기 | ✓ VERIFIED | 9개 `actions.registry.ts` 소비, 빈 레지스트리 방어 포함 |
| `domain/settings/{keys,registry,export}.ts` | typed registry + JSON 왕복 | ✓ VERIFIED | `SETTING_DEFS` 소비자 = 설정 화면·CLI·잠금 |
| `lib/crypto.ts` · `scripts/rotate-key.ts` | AES-256-GCM + 회전 | ✓ VERIFIED | v1·v2 혼재 복호화 단위 테스트 green |
| `domain/action-log/{record,index,export}.ts` | 핵심 로그 + 필터 + CSV | ✓ VERIFIED | ALWAYS_ON 3종, `registerExport` 등록 |
| `domain/archive/index.ts` | 보관함 + 복원 | ✓ VERIFIED | 화면·액션에서 호출, 관리자 게이트 |
| `db/migrations/0003~0008` | 스키마 척추 | ✓ VERIFIED | `_journal.json`에 등재, `db:reset:test`가 실제로 적용해 E2E가 돌았다 |
| `app/(app)/admin/**` 10개 화면 | 관리 콘솔 | ✓ VERIFIED | 전부 `can()` 게이트 + E2E 스펙 보유, 메뉴 등록은 `35b9fd1` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `permission-grid-client.tsx` | `domain/permissions/matrix.setPermissionCell` | `setPermissionCellAction` 서버 액션 | ✓ WIRED | `permissions/actions.ts:19-31`, 좌표를 레지스트리·DB로 제한 |
| `can()` | `repositories/permissions.findPermission` | 매 호출 DB 조회(캐시 없음) | ✓ WIRED | 즉시성의 메커니즘 — E2E가 두 세션으로 실측 |
| `settings/page.tsx` | `domain/settings/keys.SETTING_DEFS` | `for (const def of SETTING_DEFS)` | ✓ WIRED | 화면 자동 생성, 키 하드코딩 0 |
| `account-number.tsx` | `domain/vendors.revealAccountNumber` | 서버 액션 → `visible()` → `recordAction` → `decrypt` | ✓ WIRED | E2E가 「번호 보기」로 평문까지 실측 |
| `deploy.sh main()` | db-bootstrap · migrate · seed Job | `gcloud run jobs execute --wait` | ✓ WIRED | `:666-668`. **account Job은 파이프라인에 없다** — `account.yml` `workflow_dispatch` 전용(`OPERATIONS.md §7`) |
| `exportActionLogAction` | `serializeActionLogExportAsCsv` | `exportActionLog` → `queryActionLog` 1회 | ✓ WIRED | 스냅샷 1회 조회 + `excel_export` 기록 후 직렬화 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `admin/permissions/page.tsx` | 격자 셀 | `repositories/permissions` 조회 | 예 (E2E가 체크 상태 실측) | ✓ FLOWING |
| `admin/settings/page.tsx` | 섹션·필드·이력 | `SETTING_DEFS` + `repositories/settings` | 예 (통합 왕복 테스트) | ✓ FLOWING |
| `admin/vendors/page.tsx` | 뒤 4자리·평문 | `vendors` 표 암호문 → `decrypt()` | 예 (E2E가 평문 `110-222-334455` 실측) | ✓ FLOWING |
| `admin/action-log/page.tsx` | 로그 행·이름 해석 | `repositories/action-log` + users/roles 조회 | 예 (E2E 3건) | ✓ FLOWING |
| `admin/archive/page.tsx` | 보관 항목 | `repositories/archive` | 예 (E2E 복원 왕복) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 존재하지 않는 커밋 인용 검증 | `git cat-file -t fa4a5a2` | `fatal: Not a valid object name` | ✗ FAIL → advisory |
| 실제 커밋 확인 | `git log --oneline -1 35b9fd1` | `feat(03): 관리자 화면 10개를 …` | ✓ PASS |
| 배포 파이프라인 Job 실행 목록 | `grep -n "jobs execute" scripts/deploy.sh` | `:358 :372 :392` (account 없음) | ✓ PASS (3회차 기대를 반증) |
| 전 게이트 | 위 표 5종 | 전부 exit 0 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | `scripts/*/tests/probe-*.sh` 0개, PLAN·SUMMARY에 probe 선언 0건 | SKIPPED (해당 없음) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ADMN-01 | 권한표 계급×메뉴×동작 체크박스 | ✓ SATISFIED | `PermissionGrid.tsx` + `matrix.ts` + E2E 즉시 반영 |
| ADMN-02 | 정보 노출표, 기획본부 기본 인트라넷 수준·신규 기본 숨김 | ✓ SATISFIED | `info-items.ts` `staffDefault` + `seed/index.ts:129-142` |
| ADMN-03 | 화면·API·Excel·자동완성·검색 동일 적용 + 누수 테스트 자동 생성 | ✓ SATISFIED | `leak-scan.test.ts` 3축. 강제 지점은 요구사항 원문의 「리포지토리 투영」이 아니라 ROADMAP Issue 3의 2계층(리포지토리 행 필터 + domain `project()`) — ROADMAP이 명시적으로 갱신한 계약이라 편차 아님 |
| ADMN-05 | 설정 레지스트리 + 화면 자동 생성 + 읽기 강제 테스트 | ✓ SATISFIED | `registry-coverage.test.ts` |
| ADMN-06 | JSON 내보내기·가져오기 | ✓ SATISFIED | 화면 내보내기 + `pnpm settings:import` CLI + `OPERATIONS.md §12`. 화면 안내 문구도 `94575dd`로 실제 명령을 가리킨다 |
| ADMN-08 | 계급 추가·개명(데이터) | ✓ SATISFIED | `roles.ts:100-120`, 시드 5종 보관 금지, E2E `roles.spec.ts` |
| ADMN-10 | 행동 로그 화면 필터 + Excel + 정리, 열람은 노출표로 통제 | ✓ SATISFIED | `action-log/page.tsx` + `filter-bar.tsx` + `pruneActionLog`. 열람 통제가 `visible()`인 것이 요구사항 원문과 일치(advisory F4 참조) |
| ADMN-12 | 삭제 = 보관함 이동, 관리자만 조회·복원, 로그 기록 | ✓ SATISFIED | `domain/archive` + `delete-to-archive.tsx` + E2E |
| OPS-05 | 핵심 행동만 기록, Excel·마스킹 해제는 끌 수 없음, 관리자 정리 | ✓ SATISFIED | `record.ts:60·115-120` ALWAYS_ON 3종 |
| MAST-01 | 거래처 숨김·자동완성·계좌 암호화·기본 증빙 종류 | ✓ SATISFIED | 암호화·마스킹·해제·수정 왕복 전부 E2E까지 고정. 자동완성 **함수**는 있고 화면 소비자는 Phase 5·6(deferred) |
| MAST-02 | 사람 = 계급 + 팀, 팀 ⊂ 본부, 발령일 이력 | ✓ SATISFIED | `org.ts` 스키마 + `team-at-date` 단위·통합 |
| MAST-03 | 법인카드 개인/팀, 소지자 또는 소속 팀 | ✓ SATISFIED | XOR CHECK 제약 + `owner-rule.test.ts` + E2E |
| MAST-04 | 코드표 추가·수정·비활성화 | ✓ SATISFIED | 「수정」을 `label`로 좁힌 결정이 `03-OPEN-ITEMS.md:111`에 기록됨(이번 라운드에 닫힘). 4계층 전수에서 `value` 쓰기 경로 0건 |

**ORPHANED 요구사항:** 없음. REQUIREMENTS.md가 Phase 3에 매핑한 13개가 모두 플랜에 선언돼 있다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD`/`FIXME`/`XXX` — 이 페이즈가 건드린 452개 파일 전수 | — | **0건** |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` (프로덕션 코드) | — | 0건 (검출된 2건은 CLAUDE.md 문서와 그 문자열을 **금지어로 검사하는** 테스트) |
| `domain/action-log/export.ts` | 31-36 | CSV 선행 `=`·`+`·`-`·`@` 미중화 | 📋 Advisory (F3) | 재검증 증거 게이트 #3304 — 신규 범위, 빨간 named test 없음 |
| `lib/env.ts` | 47-49, 85-92 | `APP_ENV` fail-open 기본값 | 📋 Advisory (F1) | 실제 배포 경로에서는 deploy.sh가 값을 넣어 차단됨 |
| `domain/vendors/index.ts` | 376-393 | 해제 경로에 행 범위 필터 없음 | 📋 Advisory (F2) | 성공 기준 5의 계약 자체는 충족 |

**증거 게이트 판정(#3304):** F1~F4가 지적한 파일 5개는 3회차 검증 시각(12:05:40Z) **이후 git 수정이 없다**(`lib/env.ts` 01:45 · `repositories/vendors.ts` 01:45 · `domain/vendors/index.ts` 06:45 · `domain/action-log/{export,index}.ts` 06:45). 이월된 gap도 아니고 빨간 named test도 없으므로 blocker가 아니라 advisory다 — 다만 F3(CSV 수식 주입)는 한 함수 수정으로 끝나므로 다음 커밋에 넣기를 권한다.

### Human Verification Required

이 환경에서 코드로 닫을 수 없는 항목 **2건만** 남았다. 둘 다 GCP 접근이 필요하고, 이 컨테이너의 프록시가 `*.run.app` CONNECT에 403을 돌려줘 스테이징 호스트에 닿을 수 없다.

#### 1. 스테이징 배포 Job 3종 + `/admin/permissions` 격자

**Test:** 스테이징 배포 로그에서 `db-bootstrap → migrate → seed` 순서와 결과를 확인하고(`plant8-staging-seed` 로그에 `seed complete: … permissions=45 …`), 시스템 관리자로 스테이징 `/admin/permissions`에 들어간다
**Expected:** 세 Job이 순서대로 exit 0이고 권한표 격자가 채워진 상태로 보인다
**Why human:** Cloud Run Job 환경에서 번들이 같은 결과를 내는지는 실제 배포 로그로만 확인된다. 코드 쪽 배선은 재확인했다. **3회차가 이 항목에 넣었던 `plant8-staging-account` Job exit 0 기대는 삭제했다 — 그 Job은 배포 파이프라인에 존재하지 않는다.**

#### 2. Secret Manager `app-data-key-v1` 32바이트

**Test:** staging·prod `app-data-key-v1` 값을 base64 디코드해 32바이트인지 확인한다
**Expected:** 두 환경 모두 32바이트
**Why human:** `lib/env.ts`가 키를 선택 문자열로 두어 값이 없어도 앱이 뜬다 — 코드만으로 시크릿 존재·길이를 판정할 수 없다

### Gaps Summary

**gap 없음.** ROADMAP 성공 기준 6개가 모두 코드와 실제로 돌린 테스트로 뒷받침되고, Phase 3에 매핑된 요구사항 13개가 모두 충족됐다. 3회차가 남긴 human 항목 6건 중 4건(거래처 수정 왕복 · `value` 불변 결정 기록 · 설정 화면 문구 · React taint 편차)은 닫혔고, 1건(account Job)은 **전제가 틀려 삭제**했으며, 남은 것은 GCP 접근이 필요한 2건뿐이다.

남은 위험은 gap이 아니라 advisory 7건이다 — 그중 **F3(행동 로그 CSV 수식 주입)**이 실제 공격 경로를 가진 유일한 항목이고 한 함수 수정으로 끝난다. F1은 /cso가 매긴 High보다 낮게 봐야 한다(실배포 경로에서는 `deploy.sh`가 `APP_ENV`와 시크릿을 모두 주입한다). F4는 요구사항 ADMN-10 원문과 **일치**하므로 결함이 아니다. 별개로 `03-OPEN-ITEMS.md:32`가 존재하지 않는 커밋을 인용해 감사 추적이 끊겨 있다 — 두 글자 수정이 필요하다.

---

_Verified: 2026-09-21T14:42:42Z_
_Verifier: Claude (gsd-verifier), 4회차 재검증_
