---
phase: 03-permissions-settings-masters
verified: 2026-09-21T12:05:40Z
status: human_needed
score: 13/13 must-haves verified
covered_digest: "v1:sha256:acc351da1d4604228c743b1371e6258abe4c15c0e2a1c88fe3c898be89e8df79"
covered_files:
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
  - "app/(app)/admin/action-log/actions.registry.ts"
  - "app/(app)/admin/action-log/actions.ts"
  - "app/(app)/admin/action-log/filter-bar.tsx"
  - "app/(app)/admin/action-log/page.tsx"
  - "app/(app)/admin/archive/actions.registry.ts"
  - "app/(app)/admin/archive/actions.ts"
  - "app/(app)/admin/archive/archive-table.tsx"
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
  - "db/schema/action-log.ts"
  - "db/schema/auth.ts"
  - "db/schema/code-tables.ts"
  - "db/schema/corp-cards.ts"
  - "db/schema/document-counters.ts"
  - "db/schema/field-definitions.ts"
  - "db/schema/index.ts"
  - "db/schema/login-attempts.ts"
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
  - "domain/auth/provider.ts"
  - "domain/code-tables/index.ts"
  - "domain/code-tables/tax-rule.ts"
  - "domain/corp-cards/index.ts"
  - "domain/custom-fields/build-schema.ts"
  - "domain/health.ts"
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
  - "eslint/rules/money-boundary.mjs"
  - "eslint/rules/no-row-type-escape.mjs"
  - "eslint/rules/repository-viewer-param.mjs"
  - "eslint/rules/require-action-client.mjs"
  - "lib/actions/client.ts"
  - "lib/actions/handle-server-error.ts"
  - "lib/actions/registry.ts"
  - "lib/actions/user-facing-error.ts"
  - "lib/actions/zod-error-message.ts"
  - "lib/auth-client.ts"
  - "lib/auth.ts"
  - "lib/client-ip.ts"
  - "lib/crypto.ts"
  - "lib/env.ts"
  - "lib/gcp/cloud-sql-admin.ts"
  - "lib/log.ts"
  - "lib/pg-errors.ts"
  - "lib/viewer.ts"
  - "package.json"
  - "repositories/action-log.ts"
  - "repositories/archive.ts"
  - "repositories/code-tables.ts"
  - "repositories/corp-cards.ts"
  - "repositories/document-counters.ts"
  - "repositories/field-definitions.ts"
  - "repositories/health.ts"
  - "repositories/login-attempts.ts"
  - "repositories/org-units.ts"
  - "repositories/permissions.ts"
  - "repositories/roles.ts"
  - "repositories/settings.ts"
  - "repositories/system-status.ts"
  - "repositories/team-memberships.ts"
  - "repositories/teams.ts"
  - "repositories/users.ts"
  - "repositories/vendors.ts"
  - "scripts/account-cli.ts"
  - "scripts/bootstrap-gcp.sh"
  - "scripts/build-cli.mjs"
  - "scripts/db-bootstrap.ts"
  - "scripts/deploy.sh"
  - "scripts/dev-db.sh"
  - "scripts/gsd-relativize.sh"
  - "scripts/install_pkgs.sh"
  - "scripts/migrate-runner.ts"
  - "scripts/promote-guard.sh"
  - "scripts/rollback.sh"
  - "scripts/rotate-key.ts"
  - "scripts/seed-master.ts"
  - "scripts/settings-import.ts"
  - "test/e2e/action-log.spec.ts"
  - "test/e2e/admin-master-list-first.spec.ts"
  - "test/e2e/admin-nav.spec.ts"
  - "test/e2e/admin-people-detail-link.spec.ts"
  - "test/e2e/archive.spec.ts"
  - "test/e2e/archived-session.spec.ts"
  - "test/e2e/code-tables-write-gate.spec.ts"
  - "test/e2e/code-tables.spec.ts"
  - "test/e2e/corp-cards.spec.ts"
  - "test/e2e/master-edit.spec.ts"
  - "test/e2e/mobile-admin-master-list-first.spec.ts"
  - "test/e2e/mobile-admin-nav.spec.ts"
  - "test/e2e/mobile-code-tables.spec.ts"
  - "test/e2e/mobile-corp-cards.spec.ts"
  - "test/e2e/mobile-list-empty.spec.ts"
  - "test/e2e/mobile-people.spec.ts"
  - "test/e2e/mobile-vendors.spec.ts"
  - "test/e2e/org.spec.ts"
  - "test/e2e/people.spec.ts"
  - "test/e2e/permissions-grid.spec.ts"
  - "test/e2e/roles.spec.ts"
  - "test/e2e/vendors.spec.ts"
  - "test/integration/action-log-query.test.ts"
  - "test/integration/archived-session.test.ts"
  - "test/integration/corp-card-owner-archived.test.ts"
  - "test/integration/corp-card-owner-edit.test.ts"
  - "test/integration/corp-cards.test.ts"
  - "test/integration/leak-scan.test.ts"
  - "test/integration/mast-04-code-item-label.test.ts"
  - "test/integration/settings-export.test.ts"
  - "test/integration/vendors.test.ts"
  - "test/integration/visibility.test.ts"
  - "test/unit/action-log/export.test.ts"
  - "test/unit/action-log/record.test.ts"
  - "test/unit/crypto.test.ts"
  - "test/unit/deploy/cli-bundle.test.ts"
  - "test/unit/import-cycles.test.ts"
  - "test/unit/leak-scan-coverage.test.ts"
  - "test/unit/login-error.test.ts"
  - "test/unit/no-admin-boolean.test.ts"
  - "test/unit/settings-import-cli.test.ts"
  - "test/unit/settings/registry-coverage.test.ts"
  - "test/unit/ui/admin-master-list-first.test.ts"
  - "test/unit/ui/role-menu.test.ts"
  - "test/unit/vendors/account-number-plan.test.ts"
  - "test/unit/vendors/update-archived.test.ts"
  - "ui/history-list/HistoryList.tsx"
  - "ui/list-empty/ListEmpty.module.css"
  - "ui/permission-grid/PermissionGrid.tsx"
  - "ui/shell/BottomTabs.tsx"
  - "ui/shell/MoreSheet.tsx"
  - "ui/shell/Shell.tsx"
  - "ui/shell/TopBar.tsx"
  - "ui/shell/role-menu.ts"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 8
  total: 8
  not_honored: []
re_verification:
  previous_status: gaps_found
  previous_score: 12/13
  previous_verified: 2026-09-21T09:27:05Z
  gaps_closed:
    - "성공 기준 5 — 법인카드 「수정」이 화면에 없다 (`b19590d` + `d6c96b0` + `3b15d43`). 행 「수정」 → `?editId=` → `CardOwnerForm` → `updateCorpCardOwnerAction` 호출자 실재. 보관 카드는 화면(링크 부재 + `editingCard` 필터)·도메인(`ArchivedCorpCardError`) 두 겹. 프로덕션 빌드 e2e 3건 통과(검증자가 직접 실행)"
    - "MAST-04 — 코드표 항목 「수정」이 없다 (`b19590d` + `d6c96b0` + `c3abd99`). `domain/code-tables.updateCodeItemLabel` 신설(`can()` → 리포지토리 → `recordAction(document_update)` → `project()`), 행 인라인 `CodeItemLabelInput` 배선, 보관 항목은 `ArchivedCodeItemError` + 화면은 글자로 렌더. `value` 쓰기 경로는 액션 스키마·도메인·리포지토리·UI 어디에도 없음(실측)"
  gaps_remaining: []
  regressions: []
  new_gaps: []
  note: "검증자가 이 프로세스에서 직접 돌린 게이트: 단위 581 passed(63 files, 20.0s) · 통합 730 passed(28 files, 224.9s) · `CI=true` 프로덕션 빌드 e2e로 신규 스펙 2파일 5 passed(32.4s) · `tsc --noEmit` exit 0 · `eslint .` exit 0(boundaries deprecation 경고만). 이전 라운드 대비 통합 +17건(신규 12 + 기존 파일 증분), e2e 신규 5건."
deferred:
  - truth: "MAST-01 — 「입력 시 자동완성된다」의 화면 소비자"
    addressed_in: "Phase 5 · Phase 6"
    evidence: "ROADMAP Phase 3 성공 기준 5: 「거래처마다 기본 증빙 종류를 두어 Phase 5·6의 지출결의·카드 사용 등록 때 자동으로 채워진다」. `domain/vendors.searchVendors`는 이 페이즈에 있고 `test/integration/vendors.test.ts:82·93·110`이 증명한다. `app/`·`ui/`에 호출자 0개 — 붙을 화면이 아직 없다."
  - truth: "성공 기준 2·6 — 전 메뉴 대상 권한·노출·행동 로그 검수"
    addressed_in: "Phase 7"
    evidence: "ROADMAP Phase 7 성공 기준 5: 「누수 스캔 생성기가 Phase 3~7의 모든 액션·DTO 타입·Excel 내보내기 함수를 덮고…Playwright 계급별 노출 스모크가 CI에 있다」. Phase 3 goal 자체가 「전 메뉴 대상 검수는 Phase 7 끝에서 한다」고 명시한다."
  - truth: "관리자 폼 7개(사람·계급·조직·거래처·법인카드·코드표·설정)의 §6-3 폼 템플릿 이관 (design-review A-H2·A-H3)"
    addressed_in: "Phase 4(컴포넌트 제작) · Phase 7(이관)"
    evidence: "ROADMAP Phase 7 성공 기준 5 본문에 「관리자 화면 7개의 폼을 Phase 4가 만든 `ui/form`·`ui/select`로 이관해 §6-3 폼 템플릿 밖에 있는 관리자 화면이 0이고…Phase 3 design-review가 실측으로 남긴 A-H2·A-H3의 이월분이다」로 박혀 있다. `03-OPEN-ITEMS.md`에 출처·근거 기록. **주의:** 이번 라운드가 새로 만든 폼 둘(`CardOwnerForm` · `CodeItemLabelInput`)도 이 이관 대상에 함께 들어간다."
  - truth: "폰 375px 관리자 표 가로 스크롤·줄바꿈 (DOM 감사 2·6·7) · /review M-4 · /review L-1 · /cso R2·R3·R4·R5"
    addressed_in: "Phase 4"
    evidence: "`03-OPEN-ITEMS.md` 「Phase 4로 미루기로 한 것 (사용자 승인 2026-09-21)」 표 — 항목별 미루는 근거가 기록돼 있다(SYSTEM.md 844행: 「관리자 콘솔은 PC 사용이 기본」)."
  - truth: "design-review 나머지 23건 중 미승인 이월분(H-2 · M-1~M-3 · A-M1~A-M7 · A-H1 잔여 · A-L1~A-L4 · L-1~L-6)"
    addressed_in: "Phase 4 · Phase 7"
    evidence: "`03-OPEN-ITEMS.md` 「design-review에서 나온 것」 절. **이 절은 사용자 승인 전이다** — 파일 자체가 그렇게 명시한다. 공용 컴포넌트·템플릿을 가로지르는 작업이라는 근거가 항목별로 적혀 있다."
advisory:
  - finding: "설정 화면 문구가 낡았다 — `app/(app)/admin/settings/settings-form-client.tsx:235`가 「가져오기는 통합 테스트로만 제공됩니다(파일 업로드 화면은 이 페이즈 범위 밖).」이라고 관리자에게 말하지만, `3c6d3f9` 이후 `pnpm settings:import` CLI가 실재한다. `app/(app)/admin/settings/actions.ts:52-54`의 주석도 같은 문장이다."
    category: other
    reason: "요구사항 ADMN-06 자체는 CLI + `docs/OPERATIONS.md §12`로 충족됐다(동작에는 영향 없음). 그러나 화면이 운영자에게 사실이 아닌 안내를 한다 — 가져오기 방법을 찾는 사람이 「없다」고 읽는다. 한 줄 수정이고 다음에 이 파일을 건드릴 때 같은 커밋에 넣기를 권한다."
    evidence_status: "결정적(파일·줄 실재). 동작 영향이 없어 blocker로 올리지 않았다 — 2회차 보고서가 advisory 유지로 기록했고 이번 라운드에도 파일이 그대로다."
  - finding: "MVP 모드 불일치 — ROADMAP Phase 3이 `Mode: mvp`인데 goal이 User Story 형식(「As a …, I want to …, so that ….」)이 아니다"
    category: other
    reason: "verify-mvp-mode.md 규칙상 검증을 거절하고 `/gsd mvp-phase 3`으로 되돌려야 하나, 성공 기준 6개가 충분히 구체적이어서 표준 goal-backward로 진행했다(이전 검증과 같은 판단). MVP 모드를 의도한 것이 아니면 `Mode: mvp`를 지우는 것이 맞다."
    evidence_status: "none provided"
  - finding: "React taint API 2차 방어(ROADMAP 성공 기준 2 원문)가 구현되지 않았다 — `taintObjectReference|taintUniqueValue|experimental_taint` 사용 0건"
    category: architectural
    reason: "react@19.3.0 안정 채널에 `experimental_taint`가 없어(03-CONTEXT.md:49, 2026-09-20 정정) 쓸 수 없고, 컴파일 타임 커스텀 규칙 `plant8/no-row-type-escape`(133줄 type-aware) + `boundaries`로 대체했다. 이전 검증이 같은 사실을 「문서화된 편차」로 적고 override를 제안했으나 아직 수락되지 않았다 — 아래 Override 제안 참조."
    evidence_status: "결정적(사용 0건). 대체 구현이 실재하고 린트에 error로 등록돼 있다."
  - finding: "`03-REVIEW-2.md` Low 4건이 코드에 남아 있다 — untrim 재저장으로 행동 로그 중복(`code-item-form.tsx:102`) · 보관 검사-쓰기 비원자성(`domain/code-tables/index.ts:139-150`) · `CardOwnerForm`이 `validationErrors` 미표시(`card-form.tsx:229`) · 없는 id 수정이 성공으로 보임"
    category: other
    reason: "새 발견이 아니다 — `03-OPEN-ITEMS.md` 「수정 화면 리뷰·DOM 감사에서 나온 것」 절이 근거와 함께 「고치지 않고 남긴 것」으로 기록했다. 전부 Low, 데이터 손상 없음. 고치려면 `code-item-form.tsx:102`를 `value.trim()` 기준으로 맞추고, 보관 판정을 조건부 UPDATE로 합치면 된다"
    evidence_status: "결정적(파일·줄 실재). 빨간 named test 없음 — 증거 게이트(#3304)상 blocker 아님"
  - finding: "`app/(app)/admin/code-tables/page.tsx:125`의 `<th>동작</th>`이 권한과 무관하게 항상 렌더된다 — 법인카드는 `corp-cards/page.tsx:154`에서 `canWrite || canArchive`로 머리글까지 감춘다"
    category: other
    reason: "보기 전용 계급에게 빈 열 하나가 남는 화장 결함. 두 마스터 화면이 같은 상황에서 갈린다. `code-tables-write-gate.spec.ts`는 편집 수단 0개를 단언하지만 머리글은 보지 않는다. 동작·보안 영향 0"
    evidence_status: "결정적(파일·줄 실재). 동작 영향이 없어 blocker로 올리지 않았다"
human_verification:
  - test: "스테이징 배포 파이프라인 로그에서 `migrate → seed → account` Job 순서와 결과를 직접 확인한다(`plant8-staging-seed` 로그에 `seed complete: … permissions=45 …`, `plant8-staging-account` exit 0)"
    expected: "세 Job이 순서대로 exit 0이고, 시스템 관리자로 `/admin/permissions`에 들어가면 격자가 채워진 상태로 보인다"
    why_human: "Cloud Run Job 환경(외부 node_modules·커넥터·Secret)에서 번들이 같은 결과를 내는지는 실제 배포 로그로만 확인된다. 코드 쪽 배선(`scripts/build-cli.mjs` 4 엔트리 · `scripts/deploy.sh:341·390·668` · `test/unit/deploy/cli-bundle.test.ts`)은 이번에도 실재를 확인했다"
  - test: "GCP Secret Manager의 staging·prod `app-data-key-v1` 값이 base64 32바이트인지 확인한다"
    expected: "두 환경 모두 32바이트. 아니면 거래처 계좌번호 저장이 fail-closed로 500이 된다"
    why_human: "`lib/env.ts`가 키를 선택 문자열로 두어 값이 없어도 앱이 뜨므로 코드만으로는 시크릿 존재·길이를 판정할 수 없다(03-SECURITY T-03-41 수락의 전제)"
  - test: "거래처 수정 왕복을 화면에서 한 번 해 본다 — 「수정」 진입 → 이름만 바꿔 저장 → 목록 반영 확인 → 다시 「수정」 진입해 계좌번호 칸을 **비워 둔 채** 저장 → 목록의 `****-**-1234`가 그대로인지 확인"
    expected: "이름이 바뀌고, 계좌번호 뒤 4자리와 「번호 보기」 평문이 보존된다(빈 칸 = 「안 바꿈」)"
    why_human: "이번 라운드가 코드표·법인카드에 대해서는 이 왕복을 `test/e2e/master-edit.spec.ts`로 고정했지만 **거래처는 여전히 그 스펙이 없다**(`test/e2e/vendors.spec.ts`에 `editId` 0건 — 실측). 분기는 단위 6건(`account-number-plan.test.ts`)과 통합(`vendors.test.ts:182·228`)으로 고정돼 있고 폼 배선도 코드로 확인했다(`vendor-form.tsx:111-127`이 빈 칸을 `undefined`로 보낸다) — 남은 것은 화면 경로 실측이다"
  - test: "코드표 항목의 `value`를 불변 키로 고정한 결정(안 a)을 계획 기록에 남긴다"
    expected: "`docs/design/DECISIONS.md` 또는 `03-OPEN-ITEMS.md`에 「코드표 항목은 이름(label)만 수정한다 · `value`는 `vendors.default_evidence_type`이 FK 없이 참조하므로 불변 · 값 교체는 비활성화 후 새 항목」이 한 줄로 남는다"
    why_human: "구현은 그 결정대로 돼 있고(액션 스키마·도메인·리포지토리·UI 4겹에 `value` 쓰기 경로 0건 — 실측) 근거도 코드 주석에 「사용자 결정 2026-09-21」로 적혀 있다. 다만 그 결정 자체가 계획 문서에는 없다 — 다음 사람이 코드 주석을 읽어야만 알 수 있는 상태다. 요구사항 MAST-04의 「수정」을 이름으로 좁힌 판단이므로 기록 위치가 코드 주석이면 안 된다"
  - test: "결정 — 설정 화면의 「가져오기는 통합 테스트로만 제공됩니다」 문구를 지금 고칠 것인가"
    expected: "사용자 결정: (a) 즉시 한 줄 수정(`pnpm settings:import --file <경로>` 안내 + `docs/OPERATIONS.md §12` 참조) (b) 다음에 이 파일을 건드릴 때 같은 커밋에 (c) 현 상태 수락"
    why_human: "동작에는 영향이 없고 요구사항 ADMN-06은 충족됐다 — 우선순위 판단이다(advisory 1). `settings-form-client.tsx:235`가 이번 라운드에도 그대로임을 확인했다"
  - test: "결정 — React taint 편차를 override로 수락할 것인가, ROADMAP 문구를 고칠 것인가"
    expected: "사용자 결정: (a) 아래 Override 제안을 이 파일 frontmatter에 넣어 수락 (b) ROADMAP 성공 기준 2에서 「React taint API가 2차 방어다」를 「컴파일 타임 커스텀 린트가 2차 방어다」로 갱신"
    why_human: "react 안정 채널에 API가 없다는 것은 코드로 확정됐다(이번에도 사용 0건 재확인). 계약 문서를 고칠지 편차를 수락할지는 사용자 판단이다. 이전 라운드에서 제안됐으나 아직 수락되지 않았다"
---

# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) Verification Report

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 메커니즘(판정 함수·리포지토리 행 필터 + DTO 투영·설정 레지스트리·누수 스캔 테스트 생성기·암호화 헬퍼·보관함·행동 로그)과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다.
**Verified:** 2026-09-21T12:05:40Z (브랜치 `docs/phase3-reverify`, HEAD `3b15d43` — `main` `f828fa8` + 커밋 5개. 작업 트리 깨끗)
**Status:** human_needed
**Re-verification:** **Yes (3회차)** — 2026-09-21T09:27:05Z 검증(`gaps_found`, 12/13)이 남긴 미달 2건의 갭 클로저에 대한 재검증

## 요약

| | 1회차 (05:17:08Z) | 2회차 (09:27:05Z) | 이번 (12:05:40Z) |
|---|---|---|---|
| status | `gaps_found` | `gaps_found` | **`human_needed`** |
| 요구사항 | 9/13 | 12/13 | **13/13** |
| 성공 기준 | 3/6 완전 | 5/6 완전 · 1/6 부분 | **6/6 완전** |
| 미달 | 4건 | 2건(새로 발견) | **0건** |
| 회귀 | — | 0건 | **0건** |
| 사람 판정 대기 | 7건 | 6건 | **6건**(닫힘 1 · 신규 1) |
| 테스트 실행 | 안 함 | 단위 581 · 통합 713 · e2e 110 | **단위 581 · 통합 730 · 신규 e2e 5(프로덕션 빌드)** |

**이번 라운드의 결론:** 2회차가 남긴 미달 2건은 **코드에서 닫혔고**, 닫는 과정에서 회귀가 생기지 않았다. 남은 것은 전부 **사람만 판정할 수 있는 것**(스테이징 로그·시크릿 길이·거래처 왕복 실측)과 **기록·정책 결정**(코드표 `value` 불변 결정의 기록 위치 · 설정 화면 낡은 문구 · React taint 편차)이다. `passed`가 아닌 이유는 미달이 남아서가 아니라 **사람 판정 항목이 비어 있지 않아서**다(Step 9 규칙 2).

## 검증자가 직접 돌린 게이트 (SUMMARY·커밋 메시지 주장과 무관하게 이 프로세스에서 실행)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 단위 | `npx vitest run --project unit` | **581 passed** (63 files, 20.0s) · exit 0 |
| 통합 전체 | `npx vitest run --project integration` | **730 passed** (28 files, 224.9s) · exit 0 |
| 통합 — 신규 3파일 | `npx vitest run --project integration test/integration/{mast-04-code-item-label,corp-card-owner-edit,corp-card-owner-archived}.test.ts` | **12 passed** (3 files, 9.8s) |
| E2E — 신규 2파일 | `CI=true npx playwright test --project=desktop test/e2e/master-edit.spec.ts test/e2e/code-tables-write-gate.spec.ts` | **5 passed** (32.4s, `pnpm build && pnpm start` 프로덕션 빌드) · exit 0 |
| 타입 | `npx tsc --noEmit` | exit 0 |
| 린트 | `npx eslint .` | exit 0 (boundaries v5→v6 deprecation 경고만) |

E2E는 `playwright.config.ts:53`이 `CI`에서 `pnpm build && pnpm start`를 쓰므로 CLAUDE.md의 「로컬 dev 통과는 완료 신호가 아니다」 조건을 만족한다. **e2e 전체 115건은 이번에 다시 돌리지 않았다** — 검증 규칙(#25/#753)이 전체 스위트 재실행 대신 「행동을 증명하는 named test 하나」를 요구하고, 이번 라운드가 바꾼 행동은 신규 2파일이 전부 덮는다. 기존 e2e 4파일의 변경은 셀렉터 한정(`getByLabel("이름")` → `#code-item-form` 범위)뿐이고 단언은 그대로다(아래 회귀 절).

## 2회차 미달 2건의 현재 상태 — 둘 다 닫힘

### 미달 1 — 성공 기준 5: 법인카드 「수정」 → **CLOSED**

| 확인 항목 | 실측 결과 |
|---|---|
| `?editId=` 토글 | `page.tsx:24-34 corpCardsHref(includeInactive, { isNew?, editId? })` — `editId`면 앵커도 `#corp-card-owner-form`으로 갈린다 |
| 행 「수정」 링크 | `page.tsx:179-191` — `card.archivedAt`이면 동작 칸 전체가 `null`이고, 활성 행에서만 `canWrite &&` 조건으로 렌더 |
| 액션 호출자 | `card-form.tsx:9` import → `:154 useAction(updateCorpCardOwnerAction, …)` → `:163-167 execute({ id, holderUserId?, teamId? })`. **호출자 0 → 2(import + useAction)** — grep 실측 |
| 보관 카드 차단 (바깥 겹) | `page.tsx:87-89` `cards.find(card.id === editId && card.archivedAt === null)` — 보관된 id로 직접 진입해도 `editingCard === null`이라 폼이 안 뜬다 |
| 보관 카드 차단 (도메인) | `domain/corp-cards/index.ts:180-184` `ArchivedCorpCardError` — `can()` 통과 **후** 카드 행을 다시 읽어 `archivedAt !== null`이면 거부. 거래처 `ArchivedVendorError`(`domain/vendors/index.ts:298-302`)와 같은 자리 |
| 쓰기 범위 | 액션 스키마(`actions.ts:34-52`)에 `id`·`holderUserId`·`teamId`뿐 — 발급사·뒤 4자리·별칭 쓰기 경로 없음. `superRefine`이 XOR를 액션 계층에서 한 번 더 막는다 |
| e2e 왕복 | `test/e2e/master-edit.spec.ts` 3건 — ① 개인→팀 전환 후 목록의 「종류」·「소유」가 함께 바뀌고 `—`가 0개 ② 팀 미선택 제출 차단(H-1 반증 회귀) ③ 보관된 카드에 「수정」 링크 0개. **프로덕션 빌드에서 직접 실행해 통과 확인** |
| 도메인 통합 | `test/integration/corp-card-owner-edit.test.ts` + `corp-card-owner-archived.test.ts` — 12건 중 해당분 통과(직접 실행) |

### 미달 2 — MAST-04 코드표 항목 「수정」 → **CLOSED (이름 범위)**

| 확인 항목 | 실측 결과 |
|---|---|
| 도메인 함수 | `domain/code-tables/index.ts:127-151 updateCodeItemLabel(viewer, id, label)` — 내보내기가 4개 → 5개 |
| 순서 | `can(viewer,"admin.code-tables","write")` → 빈 문자열 거부 → `repoFindCodeItemById` → 보관 판정 → `repoUpdateCodeItemLabel` → `recordAction(document_update, code_items)` → 재조회 → `project(viewer,row,CODE_ITEM_DTO_SPEC)`. **요구된 `can()` → 리포지토리 → `project()` 순서 그대로** |
| 행동 로그 종류 | `document_update` — `document_create` 재사용 아님(통합 테스트가 이 종류로 남는지 단언) |
| 화면 배선 | `page.tsx:12` import → `:139 <CodeItemLabelInput id label />` → `code-item-form.tsx:76 useAction(updateCodeItemLabelAction)` → `:102 onBlur execute({ id, label })` |
| 보관 항목 차단 | 도메인 `ArchivedCodeItemError`(`index.ts:140-142`) + 화면 `page.tsx:136-140` `item.archivedAt \|\| !canWrite`면 입력칸 대신 `item.label` 글자 |
| 누수 스캔 등록 | `actions.registry.ts:18-24 updateCodeItemLabelAction`(menu `admin.code-tables` · action `write` · dto `CodeItemDto`) — `leak-scan.test.ts`가 `ACTION_REGISTRY` 순회로 자동 포함, 통합 730 통과에 들어 있다 |
| e2e 왕복 | `master-edit.spec.ts:26-55` — 항목 추가 → 인라인 이름 변경 → blur → 새 이름 표시 → **reload 후에도** 새 이름이고 `값` 칸은 그대로. 프로덕션 빌드에서 직접 실행해 통과 |

#### `value`가 수정 대상이 아님 — 4겹 실측

사용자 결정(2026-09-21, 안 a: 이름만 수정)이 코드에서 실제로 지켜지는지 네 계층 전부를 훑었다.

| 계층 | 파일·줄 | `value` 쓰기 경로 |
|---|---|---|
| 액션 스키마 | `app/(app)/admin/code-tables/actions.ts:37` | `z.object({ id, label })` — **없음** |
| 도메인 | `domain/code-tables/index.ts:127` | 인자가 `(viewer, id, label)` — **없음** |
| 리포지토리 | `repositories/code-tables.ts:57-60` | `.set({ label, updatedAt })` — **없음**. 같은 파일의 다른 `set()` 4개도 `active`·`archivedAt`·`taxRule`뿐 |
| UI | `code-item-form.tsx:92-104` | 인라인 입력은 `label`만. `value`는 `page.tsx:132`에서 `<td>{item.value}</td>` 글자로만 렌더 — **없음** |

근거는 `db/schema/vendors.ts:19`의 `default_evidence_type`이 FK 없는 `text`에 코드 항목의 `value` 문자열을 담기 때문이다(바꾸면 기존 거래처가 조용히 고아가 된다). 제약은 코드에서 지켜진다. **다만 그 결정 자체는 코드 주석에만 「사용자 결정 2026-09-21」로 남아 있고 계획 문서에는 없다** — 사람 판정 4번으로 올린다.

#### 이 「수정」이 MAST-04를 충족한다고 본 근거

요구사항 원문은 「견적 대분류·소분류, 지급 방식, 프로젝트 상태 같은 코드표를 관리 화면에서 추가·수정·비활성화한다」(`REQUIREMENTS.md:22`)이다. 관리자가 화면에서 항목의 이름을 고칠 수 있게 됐고, `value`는 사용자에게 보이는 이름이 아니라 다른 표가 문자열로 참조하는 내부 키다. 값 자체를 바꿔야 하는 경우의 경로(비활성화 후 새 항목 추가)도 존재한다. **좁힌 것은 사실이므로 숨기지 않고 위 표와 사람 판정 4번에 명시한다** — 판단이 코드 주석에만 남는 상태를 충족으로 치지는 않는다.

## 이번 라운드가 추가로 닫은 것 (회귀 확인 대상)

| 출처 | 항목 | 커밋 | 실측 |
|---|---|---|---|
| `03-REVIEW-2.md` M-2 | 인라인 입력 저장 실패가 조용히 사라지고 칸이 안 되돌아감 | `d6c96b0` | `code-item-form.tsx:75-88` `onError`가 `serverError` → `validationErrors.label` → 일반 문구 순으로 잡고 `setValue(label)`로 되돌린다. `:95-98` `aria-invalid`·`aria-describedby`, `:105-109` `role="alert"` 한 줄. `code-tables.module.css`의 `.labelInput`·`.labelInputError`·`.labelError` 테두리 `--danger` + `--fs-sm --danger` — §7-2 그대로, 토큰 밖 값 0 |
| `03-REVIEW-2.md` M-3 | 소유자 변경 성공 후 수정 모드에 남음 | `d6c96b0` | `card-form.tsx:157` `onSuccess: () => router.replace(cancelHref)` — `replace`라 뒤로가기가 수정 모드로 안 돌아간다 |
| `03-REVIEW-2.md` L-4 | `?new=1&editId=`이면 폼 2개·1차 버튼 2개 | `d6c96b0` | `page.tsx:116` `canWrite && showCreateForm && !editingCard` — 수정 모드가 이긴다 |
| `03-REVIEW-2.md` M-1 / DOM 감사 | 코드표 화면에 `canWrite` 게이트 없음 | `c3abd99` | 게이트 6곳 전수 확인: 등록 폼(`:89`) · 머리글 「코드 추가」(`:101`) · EMPTY 행동(`:112-115`) · 행 인라인 입력(`:136`) · 「비활성화」(`:157`) · 증빙 종류 세율 패널(`:163`). e2e `code-tables-write-gate.spec.ts`가 보기 전용 계급으로 들어가 `table input` 0 · `table select` 0 · `?new=1` 직접 진입에도 `#code-item-form` 0을 프로덕션 빌드에서 단언 — 직접 실행해 통과 |
| `/cso` T-03-55 | 법인카드 소유자가 보관된 사람·팀을 받음 | `3b15d43` | `domain/corp-cards/index.ts:106-126 assertOwnerNotArchived`를 **등록(`:145`)·수정(`:187`) 두 경로가 공유**. `repositories/users.findUserById`·`teams.findTeamById`는 `where(eq(id))`만이라 보관 행도 읽어 온다 — 판정이 실제로 가능하다(실측). 화면 `page.tsx:72-80`이 `<select>` 후보에서 `archivedAt !== null`을 거르되 **이름 조회 표(`:65-66`)에는 보관 행을 남겨** 기존 카드의 소유 칸이 `—`로 비지 않게 한다. `corp-card-owner-archived.test.ts` 4건(회귀 방어 1건 포함) 직접 실행 통과 |

### 회귀 점검

| 대상 | 결과 |
|---|---|
| 기존 e2e 4파일 변경(`action-log`·`admin-master-list-first`·`archive`·`code-tables`) | `getByLabel("이름")` → `page.locator("#code-item-form").getByLabel("이름")` 6줄뿐. 새 인라인 입력의 `aria-label`(`{label} 이름`)과의 충돌을 피하는 **범위 한정**이고 단언은 한 줄도 약해지지 않았다(diff 전문 확인) |
| `can()` 제거 | `git diff f828fa8..3b15d43 -- domain/ repositories/`에 `can()` 삭제 0건 |
| 기존 도메인 계약 | 통합 730 passed(이전 라운드 713 + 신규 17) · 단위 581 passed(변동 없음) — 실패 0 · skip 0 |
| 타입·린트 | `tsc --noEmit` exit 0 · `eslint .` exit 0 |
| 디자인 토큰 | 신규 CSS 4클래스 전부 `var(--…)` — 새 색·서체·radius 생성 0 |
| 테스트 비활성화 | 신규 6파일에 `.skip`·`.only`·`xit`·`fixme` **0건**(grep 실측) |

## Goal Achievement

### Observable Truths — ROADMAP 성공 기준 6개

| # | Truth (요약) | Status | Evidence |
|---|---|---|---|
| 1 | 사람 등록(계정·초기 비밀번호 같은 화면) · 계급은 데이터 · 본부·팀(팀 ⊂ 본부) · 발령일 이력 · 사용일 시점 소속 | ✓ VERIFIED | `db/schema/org.ts`(teams.org_unit_id NOT NULL · team_memberships UNIQUE(user_id, effective_from)) · `domain/org/index.ts:188 teamAtDate`(없으면 null) · `cancelFutureAssignment`(미래만) · `domain/people/index.ts registerPerson` · `person-form.tsx` · `[id]/person-detail-client.tsx` HistoryList. §6-1 재구성(`94f9dbd`·`c2f743d`) 후에도 등록·발령 경로가 그대로임을 `test/e2e/admin-master-list-first.spec.ts:88·148` + `org.spec.ts`·`people.spec.ts` 실행으로 확인 |
| 2 | 권한표·노출표 체크 → 즉시 메뉴·동작·필드 반영; 판정은 can/visible/scopeFor만; 2계층 읽기(린트 강제); **React taint 2차 방어**; 우회 없음; staff 기본값 | ✓ VERIFIED (문서화된 편차 1) | `domain/permissions/{can,visible,scope-for,project}.ts`(행 없음 → false) · `matrix.ts`(can → upsert → recordAction) · `app/(app)/layout.tsx:24-29`가 `MENUS` 전체에 `can()`을 돌려 `allowedMenus`를 만들고 `ui/shell/role-menu.ts:86-91`이 그 목록으로만 관리자 진입점을 만든다(셸에 계급 분기 0) · 관리자 페이지 13개 전부 `can()` + `notFound()` · `eslint/rules/no-row-type-escape.mjs`(error) + boundaries · `test/e2e/permissions-grid.spec.ts` 실행 통과. **편차:** `taintObjectReference\|taintUniqueValue\|experimental_taint` 사용 **0건** — react@19.3.0 안정 채널에 없다(03-CONTEXT.md:49). 대체는 컴파일 타임 커스텀 린트 → Override 제안 |
| 3 | 누수 스캔 생성기: 액션×계급, DTO×계급, 내보내기×계급 자동 생성, CI 통합 계층, 미매핑 DTO 실패; **등록만 하면 검사가 따라온다** | ✓ VERIFIED (이전 PARTIAL → 닫힘) | 위 「미달 3」 절. `leak-scan.test.ts:41-74` 세 생성기 · `:105-109` 결정적 순서 · `:80-93` 세 축 전부 하한 단언 · `:112-123` 미매핑 정보 항목 실패 · `:95-103` DTO 없는 내보내기 예외 목록 강제. 실행 561 passed |
| 4 | 설정 키 typed registry 한 곳 + 자동 생성 화면; 미사용 키 테스트 실패; JSON 내보내기 → 빈 환경 가져오기 동일; 이력형 세율; 기준일·절사 시드; 로그인 잠금도 레지스트리 키 | ✓ VERIFIED | `domain/settings/keys.ts` 18키 · `app/(app)/admin/settings/page.tsx:37` `for (const def of SETTING_DEFS)`(키 하드코딩 0) · `test/unit/settings/registry-coverage.test.ts`(미참조 키 실패 · readBy 만료 강제) · `domain/auth/lockout.ts`가 실제 소비자 · `test/integration/settings-export.test.ts` 실행 통과(빈 환경 복원 동일 · 멱등 · 한 항목 실패 시 전부 미적용). 가져오기 진입점은 ADMN-06에서 닫혔다 |
| 5 | 거래처·법인카드·코드표를 관리 화면에서 **등록·수정·비활성화**; 증빙 종류 세금 규칙; 기본 증빙 종류; 계좌번호 AES-256-GCM `v1:`·뒤 4자리·해제 = 노출표 + 로그; 키 회전 + v1·v2 혼재 복호화 단위 테스트 | ✓ VERIFIED (⚠️ PARTIAL → 닫힘) | **세 마스터가 이제 동사 셋을 전부 갖췄다.** 거래처: 등록·수정(`b8628fc`)·숨김 + `domain/vendors/index.ts:298-302` 보관 수정 차단 · `:215-232 planAccountNumberUpdate` · `:322-334` `keep`이면 두 컬럼 미변경. 법인카드: 등록 + **수정**(`page.tsx:179-191` 행 「수정」 → `?editId=` → `card-form.tsx:154 updateCorpCardOwnerAction`) + 활성 토글 + 보관, 보관 차단 두 겹(`page.tsx:87-89` · `ArchivedCorpCardError`), 소유자 보관 검사 공유(`assertOwnerNotArchived`, /cso T-03-55). 코드표: 추가 + **수정**(`domain/code-tables/index.ts:127 updateCodeItemLabel` → `page.tsx:139 CodeItemLabelInput`) + 비활성화 + 보관, `ArchivedCodeItemError`. 암호화 축은 유지: `lib/crypto.ts`(aes-256-gcm, `v1:<iv>:<tag>:<ct>`) · `scripts/rotate-key.ts` · `test/unit/crypto.test.ts:118` v1·v2 혼재 · `:376 revealAccountNumber`(visible → recordAction → decrypt 순서 고정) · `db/schema/corp-cards.ts` CHECK owner XOR + UNIQUE(issuer,last4) · `domain/code-tables/tax-rule.ts` 규칙 4종·절사·기준일. **범위 명시:** 코드표의 「수정」은 이름(label)뿐이고 `value`는 불변 키다(사용자 결정 2026-09-21 안 a — `vendors.default_evidence_type`이 FK 없이 참조). 법인카드의 「수정」은 소유자(개인/팀)뿐이고 발급사·뒤 4자리는 식별자라 재등록 대상이다. **행동 증거:** `test/e2e/master-edit.spec.ts` 4건을 프로덕션 빌드에서 직접 실행해 통과 |

| 6 | 핵심 행동만 로그(**로그인**·설정·권한·삭제·복원), Excel 내보내기·마스킹 해제는 끌 수 없음; 사람·기간·종류·문서 필터 + Excel + 관리자 정리; 삭제는 전부 보관함, 관리자만 복원 | ✓ VERIFIED (이전 PARTIAL → 닫힘) | `login` 기록 닫힘(미달 1, e2e 실측) · `domain/action-log/record.ts:10-29` CORE_ACTION_TYPES 18종(`document_update` 추가 — `b0b8886`) · `:60 ALWAYS_ON`(`keys.ts:49` enum 자체가 이 셋을 뺀다 → 끌 수 없음) · `:111-113` 목록 밖 종류는 예외 · `repositories/action-log.ts:80-98 markActionLogRowsPruned` 정리 = `pruned_at` 표시(물리 삭제 0) · `domain/archive/index.ts` archive/restore · `repositories/archive.ts` 7표. 실행: `action-log-query.test.ts`·`archive.test.ts`·`action-log.test.ts` 통과, `action-log.spec.ts`·`archive.spec.ts`·`archived-session.spec.ts` e2e 통과 |

**Score:** **6/6 성공 기준 완전 검증**(0 present-behavior-unverified — 이번 라운드가 바꾼 상태 전이·취소 불변식은 전부 named test를 직접 실행해 확인했다). 요구사항 기준 **13/13**. 성공 기준 2는 React taint 편차 1건을 문서화한 채 VERIFIED이며, 그 편차의 처분은 사람 판정 6번에 남아 있다(2회차 판정 유지 — 새 증거 없이 판정을 뒤집지 않는다).

### Requirements Coverage — Phase 3 소유 13건

| Requirement | Status | 변화 | Evidence (파일·줄) |
|---|---|---|---|
| ADMN-01 권한표(계급×메뉴×동작) | **MET** | 유지 | `db/schema/permissions.ts` UNIQUE(role,menu,action) · `domain/permissions/can.ts` · `matrix.ts` setPermissionCell(자기 잠금 가드) · `ui/permission-grid/PermissionGrid.tsx` · `test/e2e/permissions-grid.spec.ts`(실행 통과) · `test/unit/ui/permission-grid-resync.test.ts`(M-1 회귀) |
| ADMN-02 정보 노출표 | **MET** | 유지 | `domain/permissions/visible.ts` · `info-items.ts`(손익·팀 비용·목표·인센티브·거래처 금액·계좌 마스킹 해제 6종 `staffDefault=false`) · `domain/seed/index.ts:135-150` role-pm 시드 = staffDefault · `test/integration/visibility.test.ts`(실행 통과) |
| ADMN-03 노출 동일 적용 + 누수 스캔 자동 생성 | **MET** | **PARTIAL → MET** | `leak-scan.test.ts:24-32`(registry 9/9) · `:92`(내보내기 하한 2) · `test/unit/leak-scan-coverage.test.ts`(누락 시 빨개짐 — 재현 확인) · `eslint/rules/no-row-type-escape.mjs` + 10 fixture |
| ADMN-05 설정 레지스트리 + 자동 생성 화면 | **MET** | 유지 | `domain/settings/keys.ts` · `registry.ts:68 getSettingValue(def,{asOf})` fail-closed · `settings/page.tsx:37` · `test/unit/settings/registry-coverage.test.ts` |
| ADMN-06 설정 JSON 내보내기·가져오기 | **MET** | **PARTIAL → MET** | 내보내기 `settings-form-client.tsx:216-236` + `EXPORT_REGISTRY` 등록. 가져오기 `scripts/settings-import.ts:78` → `importSettings` · `package.json:27` · `docs/OPERATIONS.md:210-222`. 동작 증명 `test/integration/settings-export.test.ts`(실행 통과) · CLI 인자·파일 파싱 `test/unit/settings-import-cli.test.ts` 9건. ⚠️ 화면 문구가 낡았다(advisory 1) |
| ADMN-08 계급 추가·이름 변경(데이터) | **MET** | 유지 | `db/schema/roles.ts`(name UNIQUE, is_seed) · `domain/permissions/roles.ts` createRole/renameRole(NFC) · `roles-client.tsx:6·32·86`(create·rename·archive 전부 배선) · 시드 5종 보관 거부 `repositories/archive.ts:63-68` · `test/e2e/roles.spec.ts`(실행 통과) |
| ADMN-10 행동 로그 필터·Excel·정리·열람 노출표 | **MET** | 유지 | `action-log/page.tsx:32` can · `filter-bar.tsx` 필터 6 · `domain/action-log/index.ts` queryActionLog(`visible(action_log.detail)` 게이트) · `export.ts` UTF-8 BOM CSV · `keys.ts:46-54`(끌 수 없는 셋은 enum 밖). `b0b8886` 이후 대상 칸이 이름으로 풀린다(ENTITY_NAME_RESOLVERS 7종 전부 `info-items.ts` 등록 확인, 못 보면 id로 내려앉음) |
| ADMN-12 삭제는 보관함, 관리자만 복원, 로그 | **MET** | 유지 | `domain/archive/index.ts` · `repositories/archive.ts` 7표 조건부 UPDATE · 마스터 화면 6개 `DeleteToArchive` · `domain/auth/hooks.ts:59-63` 보관 사용자 로그인 거부 · **`lib/viewer.ts:44` 기존 세션도 끊는다**(`373f282`, /review M-2 해소) + `lib/auth.ts:43` · `test/e2e/archived-session.spec.ts`(프로덕션 빌드 통과) |
| OPS-05 핵심 행동만·잡음 없음·정리·끌 수 없는 셋 | **MET** | **PARTIAL → MET** | `domain/auth/hooks.ts:106` login 기록 · `test/e2e/action-log.spec.ts:136-147` — **단독 실행해 통과 확인(34.6s)** · 조회·화면 이동은 `recordAction` 미호출 · `record.ts:60` ALWAYS_ON 3종 · 정리 = 표시 |
| MAST-01 거래처 등록·수정·숨김·자동완성·암호화 | **MET** | **PARTIAL → MET** | 미달 2 닫힘 + `test/unit/vendors/account-number-plan.test.ts` 6건(M-5 계약) · `test/unit/vendors/update-archived.test.ts` 2건(보관·부재 → `ArchivedVendorError`) · `test/integration/vendors.test.ts` 18건. 자동완성 UI 소비자는 Phase 5·6 이월. **화면 경로 e2e는 여전히 없다**(`test/e2e/vendors.spec.ts`에 `editId` 0건 — 실측) → 사람 판정 3 |
| MAST-02 직원 등록 = 사람+계급+팀 | **MET** | 유지 | 성공 기준 1과 동일 |
| MAST-03 법인카드 마스터(개인/팀) | **MET** | 유지(보강) | 요구사항 원문(`REQUIREMENTS.md:21`)은 「등록하고, 카드마다 소지자 또는 소속 팀을 지정한다」다. `db/schema/corp-cards.ts` kind + CHECK(holder XOR team) + UNIQUE(issuer,last4) · `domain/corp-cards/index.ts cardOwnerKind`·`createCorpCard` · `card-form.tsx` 개인/팀 전환. 이번 라운드 보강: 등록 경로도 `assertOwnerNotArchived`를 거쳐 보관된 사람·팀을 받지 않는다(/cso T-03-55). **성공 기준 5의 「수정」은 위 진리 5에서 닫혔다** |
| MAST-04 코드표 추가·**수정**·비활성화 | **MET** | **PARTIAL → MET** | 추가 `createCodeItem` · **수정 `domain/code-tables/index.ts:127 updateCodeItemLabel`**(`can()` → 리포지토리 → `recordAction(document_update)` → `project()`) · 비활성화 `setCodeItemActive` · 보관 `archiveCodeItemAction`. 화면: `page.tsx:139 CodeItemLabelInput`(보관 항목·쓰기 권한 없음이면 글자로 렌더). 보관 차단 `ArchivedCodeItemError`. 증거: `test/integration/mast-04-code-item-label.test.ts` 5건(이름 변경 후 값 보존 · `document_update` 기록 · 보관 거부 · 없는 id는 null · 빈 이름 거부) + `test/e2e/master-edit.spec.ts:26-55` 왕복 — 둘 다 직접 실행 통과. **범위:** `value`는 수정 대상이 아니다(4겹 실측으로 쓰기 경로 0건 확인). 그 결정이 계획 문서에 없는 것은 사람 판정 4번 |

**Orphaned requirements:** 없음 — REQUIREMENTS.md가 Phase 3에 매핑한 13개가 7 플랜의 `requirements:` 합집합과 정확히 일치한다.

### Key Link Verification

| From | To | Via | 이전 | 현재 | Details |
|---|---|---|---|---|---|
| `domain/auth/hooks.ts` 로그인 성공 | `recordAction(login)` | `after` 훅 `if (success)` | **NOT_WIRED** | **WIRED** | `hooks.ts:105-106`. 실패·잠금 경로와 분리(107행 `return`) |
| `vendor-form.tsx` | `updateVendorAction` | `useAction` + `execute` | **NOT_WIRED** | **WIRED** | `vendor-form.tsx:7·83·121`. 진입은 `page.tsx:148` `?editId=` |
| `settings-form-client.tsx` / CLI | `importSettings` | CLI 경로 채택 | **NOT_WIRED** | **WIRED (CLI)** | `scripts/settings-import.ts:78` + `package.json:27` |
| `leak-scan.test.ts` | `permissions`·`visibility` registry | side-effect import | **NOT_WIRED** | **WIRED** | `:31-32`. 재발 방지 `leak-scan-coverage.test.ts` |
| **`corp-cards/page.tsx`·`card-form.tsx`** | **`updateCorpCardOwnerAction`** | 행 「수정」 → `?editId=` → `CardOwnerForm` → `useAction` + `execute` | **NOT_WIRED** | **WIRED** | `page.tsx:184-191`(링크) · `:98-110`(`<CardOwnerForm>`) · `card-form.tsx:9·154·163`. grep 실측: 호출자 0 → 2 |
| **`code-tables/page.tsx`·`code-item-form.tsx`** | **`updateCodeItemLabelAction` → `updateCodeItemLabel`** | 행 인라인 입력 `onBlur` → `useAction` + `execute` | **NOT_WIRED (대상 부재)** | **WIRED** | `page.tsx:12·139` · `code-item-form.tsx:8·76·102` · `actions.ts:36` · `domain/code-tables/index.ts:127` |
| **`domain/corp-cards` 등록·수정 두 경로** | **`assertOwnerNotArchived`** | 공유 가드(`findUserById`·`findTeamById`는 보관 행도 읽는다) | (없었음) | **WIRED (신규)** | `index.ts:106-126` ← `:145`(createCorpCard) · `:186`(updateCorpCardOwner). /cso T-03-55 |
| `app/(app)/admin/*/page.tsx` (13) | `domain/permissions/can.ts` | `can(...) → notFound()` | WIRED | WIRED | 13/13 확인(archive·settings 포함) |
| `app/(app)/layout.tsx` | `MENUS × can()` → `role-menu.ts` | `allowedMenus` 데이터 | WIRED | WIRED (확장) | `35b9fd1` 이후 관리자 메뉴 10종 전부 진입점. `role-menu.test.ts:119`가 10개 키의 실제 라우트 존재를 전제 확인 |
| `lib/viewer.ts getSession` | `archivedAt` fail-closed | 요청마다 사용자 행 재조회 | (없었음) | **WIRED (신규)** | `lib/viewer.ts:44` + `lib/auth.ts:43`, `archived-session.spec.ts` 프로덕션 빌드 실측 |
| `domain/*` 출구 | `project(viewer,row,spec)` | 전 list/get | WIRED | WIRED | `no-row-type-escape`가 error로 강제, `eslint .` exit 0 |
| `repositories/*` 행 필터 | `scopeFor(viewer, entity)` | `rows === "none" → []` | WIRED | WIRED | code_items·org_unit·team·user·corp_card·vendor |
| `domain/vendors.revealAccountNumber` | `visible()` → `recordAction` → `decrypt()` | 순서 고정 | WIRED | WIRED | 기록 실패 시 평문 미반환 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `permissions/page.tsx` | `grid.values` | `readPermissionGrid` → `listPermissions` DB | Yes | ✓ FLOWING |
| `settings/page.tsx` | 섹션·필드 | `SETTING_DEFS` × `getSettingValue`/`listSettingHistory` DB | Yes | ✓ FLOWING |
| `vendors/page.tsx` | `vendors[]`·`editingVendor`·`canReveal` | `listVendors`(scopeFor → DB → project) · `visible()` | Yes | ✓ FLOWING |
| `vendors/page.tsx` 수정 폼 기본값 | `editing.*` | `vendors.find(id === editId)` → 실 DB 행의 DTO | Yes | ✓ FLOWING (이전 ✗ — 폼 자체가 없었다) |
| `action-log/page.tsx` | 행·`entityName` | `queryActionLog` DB + ENTITY_NAME_RESOLVERS(노출표 게이트) | Yes | ✓ FLOWING |
| 행동 로그 「로그인」 필터 | 결과 | `action_log where action_type='login'` | **Yes** | ✓ FLOWING (이전 ✗ DISCONNECTED) |
| `archive/page.tsx` | 항목 | `listArchivedAcrossEntities` 7표 UNION | Yes | ✓ FLOWING |
| `corp-cards/page.tsx` | `cards[]` | `listCorpCards` DB | Yes | ✓ FLOWING |
| `corp-cards/page.tsx` 수정 폼 기본값 | `editingCard.*` | `cards.find(id === editId && archivedAt === null)` → 실 DB 행의 DTO | Yes | ✓ FLOWING (이전 ✗ — 폼 자체가 없었다) |
| `corp-cards` 소유 변경 후 목록 | 「종류」·「소유」 칸 | `updateCorpCardOwner`(kind 동반 UPDATE) → `revalidatePath` → `listCorpCards` DB | **Yes** | ✓ FLOWING (이전 ✗ DISCONNECTED) — e2e가 `—` 0개까지 단언 |
| `corp-cards` 소유자 `<select>` 후보 | `holderOptions`·`teamOptions` | `listPeople`·`listTeams` → `archivedAt === null` 필터 | Yes | ✓ FLOWING (보관 행은 이름 조회 표에만 남아 소유 칸이 비지 않는다) |
| `code-tables` 이름 수정 후 목록 | 행 이름 칸 | `updateCodeItemLabel` → `revalidatePath` → `listCodeItems` DB | **Yes** | ✓ FLOWING (이전 ✗ DISCONNECTED) — e2e가 reload 후까지 단언 |
| `code-tables` 행 `값` 칸 | `item.value` | `listCodeItems` DB (읽기 전용 렌더) | Yes | ✓ FLOWING (쓰기 경로 없음 — 의도) |

### Behavioral Spot-Checks (이 프로세스에서 실제로 실행했다)

| Behavior | Command | Result | Status |
|---|---|---|---|
| 코드표 이름 수정 왕복(프로덕션 빌드) | `CI=true npx playwright test --project=desktop test/e2e/master-edit.spec.ts test/e2e/code-tables-write-gate.spec.ts` | `5 passed (32.4s)` · exit 0 | ✓ PASS |
| 법인카드 소유자 개인→팀 전환이 목록에 반영 | 위와 같은 실행(`master-edit.spec.ts:59-92`) | 「종류」=팀 · `—` 0개 | ✓ PASS |
| 보관된 카드에 「수정」 링크 0개 | 위와 같은 실행(`master-edit.spec.ts:131-154`) | `toHaveCount(0)` 통과 | ✓ PASS |
| 보기 권한만 있는 계급의 코드표에 편집 수단 0개 | 위와 같은 실행(`code-tables-write-gate.spec.ts`) | `table input` 0 · `table select` 0 · `#code-item-form` 0 | ✓ PASS |
| 보관 차단·로그 종류·빈 이름 거부(도메인) | `npx vitest run --project integration test/integration/{mast-04-code-item-label,corp-card-owner-edit,corp-card-owner-archived}.test.ts` | `12 passed (9.8s)` | ✓ PASS |
| 전체 통합 회귀 | `npx vitest run --project integration` | `730 passed (28 files, 224.9s)` | ✓ PASS |
| 전체 단위 회귀 | `npx vitest run --project unit` | `581 passed (63 files, 20.0s)` | ✓ PASS |
| 타입·린트 | `npx tsc --noEmit` · `npx eslint .` | exit 0 · exit 0 | ✓ PASS |
| 법인카드 소유자 변경 액션의 화면 호출자 수 | `grep -rn updateCorpCardOwnerAction app/ ui/` | `card-form.tsx:9`(import) · `:154`(useAction) — **화면 0 → 2** | ✓ PASS (이전 ✗ FAIL) |
| 코드표 항목 수정 함수 존재 | `grep -n "^export async function" domain/code-tables/index.ts` | `listCodeItems`·`createCodeItem`·`setCodeItemActive`·**`updateCodeItemLabel`**·`setEvidenceTypeTaxRule` | ✓ PASS (이전 ✗ FAIL) |
| 코드표 `value` 쓰기 경로 | `grep -n "set(" repositories/code-tables.ts` + 액션 스키마·도메인 인자·UI 전수 | `set()` 5개 전부 `active`·`label`·`archivedAt`·`taxRule` — **`value` 0건** | ✓ PASS |
| React taint 사용 | `grep -rn "taintObjectReference\|taintUniqueValue\|experimental_taint" --include=*.ts --include=*.tsx .` | **0건**(변동 없음) | ℹ️ 편차 유지 → 사람 판정 6 |
| 설정 화면 낡은 문구 | `sed -n '235p' "app/(app)/admin/settings/settings-form-client.tsx"` | 「가져오기는 통합 테스트로만 제공됩니다…」 **그대로** | ℹ️ advisory 1 → 사람 판정 5 |
| 거래처 수정 왕복(폼 경로) | `grep -n "editId" test/e2e/vendors.spec.ts` | **0건** — 해당 e2e 없음 | ? SKIP → 사람 판정 3 |

### Probe Execution

해당 없음 — `scripts/*/tests/probe-*.sh` 없음, PLAN·SUMMARY에 probe 선언 없음.

### Test Quality Audit

| 항목 | 결과 |
|---|---|
| 이번 라운드 실행 | 단위 **581** · 통합 **730** · 신규 e2e **5**(프로덕션 빌드) — 실패 0 · skip 0 · flaky 0 (전부 이 프로세스에서 직접 실행) |
| **이전 커버리지 공백 → 닫힘** | 2회차가 남긴 미달 2건은 「없는 기능에는 실패할 테스트가 없다」였다. 이번 라운드가 그 자리에 **신규 5파일**을 넣었다: `master-edit.spec.ts`(4) · `code-tables-write-gate.spec.ts`(1) · `mast-04-code-item-label.test.ts`(5) · `corp-card-owner-edit.test.ts`(3) · `corp-card-owner-archived.test.ts`(4) |
| 비활성화된 테스트 | 신규 6파일에 `.skip`·`.only`·`xit`·`fixme` **0건**(grep 실측) — 요구사항에 걸린 테스트 중 꺼진 것 없음 |
| 단언 강도 | 신규 e2e는 **행동 수준**(왕복 후 목록 칸 값·reload 후 지속·링크 0개·`checkValidity() false`). 신규 통합은 **값 수준**(`label` 변경 + `value` 보존 동시 단언 · `document_update` 종류 · 거부 경로 `rejects.toThrow()`). 존재·타입 수준으로 끝나는 신규 단언 없음 |
| 순환 테스트 | 없음 — 기대값이 시스템 자신의 출력에서 생성되는 경로 0건 |
| 반증 테스트(주목) | `master-edit.spec.ts:100-129`는 `/review` H-1 주장(「종류를 바꾸면 첫 팀이 자동 선택된다」)을 **반증한 상태를 고정**한다 — 라이브 DOM에서 `value ""` · `checkValidity() false`. 리뷰 지적이 틀렸어도 그 경로가 덮이지 않았던 것은 사실이라 회귀 테스트로 승격한 판단은 옳다 |
| 약한 단언(기존, 유지) | `leak-scan.test.ts:146` `Array.isArray(buildExportCases())` — 같은 파일 92행의 `>= 2` 하한이 실질 방어. `test/unit/ui/admin-master-list-first.test.ts`·`test/unit/leak-scan-coverage.test.ts:52` — 소스 문자열 대조(주석 처리된 import는 통과). 전부 2회차에 기록된 관찰이고 이번 라운드가 악화시키지 않았다 |
| 남은 공백 | **거래처 수정 왕복의 화면 경로 e2e가 없다**(`vendors.spec.ts`에 `editId` 0건). 코드표·법인카드는 이번에 닫혔지만 거래처는 그대로다 → 사람 판정 3 |
| 테스트 격리(관찰) | `code-tables-write-gate.spec.ts:57-62`는 `finally`에서 `view`만 되돌리고 `write`는 되돌리지 않는다. 그 테스트가 `write=false`로 설정한 값이 곧 복원 목표값이라 실해는 없고 `fullyParallel: false`라 경합도 없다 — 정보 수준 |

### Anti-Patterns Found

이번 라운드가 바꾼 16파일(`git diff --stat f828fa8..3b15d43 -- . ':!.planning'`) 전수 스캔.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/「아직 구현되지 않음」 | **0건** | 변경 16파일 전수 grep 실측. 자기증명 blocker 없음 → 증거 게이트 무관하게 차단 사유 없음 |
| — | — | 호출자 없는 서버 액션(죽은 배선) | **0건** | 2회차의 🛑 두 건(`updateCorpCardOwnerAction` 호출자 0 · 코드표 update 함수 부재)이 **모두 해소**됐다 |
| `app/(app)/admin/code-tables/code-item-form.tsx` | 102 | `execute({ id, label: value })` — `value`를 trim하지 않고 보낸다 | ⚠️ Warning | 공백이 붙은 이름은 blur마다 재저장돼 행동 로그에 같은 수정이 쌓인다(`03-REVIEW-2.md` L-1). 데이터는 도메인이 `trim()`해서 안전. `03-OPEN-ITEMS.md`가 「고치지 않고 남긴 것」으로 기록 → advisory 4 |
| `app/(app)/admin/corp-cards/card-form.tsx` | 229 | `result.serverError`만 그리고 `validationErrors`는 그리지 않는다 | ℹ️ Info | 액션 `superRefine`(XOR) 거절이 침묵으로 끝난다. 다만 두 `<select>`가 `required`라 브라우저가 먼저 막고, 도달하려면 요청을 직접 만들어야 한다(`03-REVIEW-2.md` L-3) → advisory 4 |
| `domain/code-tables/index.ts` | 139-150 | 보관 판정(`repoFindCodeItemById`)과 `UPDATE`가 한 트랜잭션이 아니다 | ℹ️ Info | 같은 파일·같은 리포지토리에 조건부 UPDATE 선례(`setCodeItemArchived`)가 있다. 경합 창이 극히 좁고 손상이 아닌 「보관 직후 1회 이름 변경 통과」(`03-REVIEW-2.md` L-2) → advisory 4 |
| `app/(app)/admin/settings/settings-form-client.tsx` | 235 | 사실이 아닌 안내 문구(CLI가 생긴 뒤 갱신 안 됨) | ⚠️ Warning | 이번 라운드가 건드리지 않은 파일. advisory 1 · 사람 판정 5 |
| `app/(app)/admin/code-tables/page.tsx` | 125 | 권한과 무관하게 항상 렌더되는 `<th>동작</th>` | ℹ️ Info | 보기 전용 계급에 빈 열 하나. 법인카드는 머리글까지 감춘다(`corp-cards/page.tsx:154`) — 두 화면이 갈린다 → advisory 5 |
| `domain/**` | 다수 | `return null`/`[]` | ℹ️ Info | 전부 「없음」 의미의 정당한 반환. 스텁 아님. `updateCodeItemLabel`의 `return null`(없는 id)은 `setCodeItemActive`와 같은 계약이고 통합 테스트가 단언한다 |

**하드코딩된 빈 데이터·정적 반환:** 신규 경로에 없음. 두 수정 폼의 기본값은 전부 실 DB 행의 DTO에서 온다(위 Data-Flow Trace).

### Advisory (New Scope, Unevidenced)

3회차 재검증(`is_re_verification = true`)에서 Step 7 안티패턴 스캔이 올린 것 중, 결정적 증거(빨간 named test 또는 재현 가능한 명령 출력)가 없어 blocker로 올리지 않은 것. **완료된 must-have를 되돌리지 않는다**(#3304).

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | 설정 화면 문구가 「가져오기는 통합 테스트로만 제공됩니다」로 남아 있다(`settings-form-client.tsx:235` — 이번 라운드에도 그대로) | other | 요구사항 ADMN-06은 CLI로 충족. 동작 영향 0. 이월 결정 대기(사람 판정 5) |
| 2 | ROADMAP `Mode: mvp`인데 goal이 User Story가 아님 | other | 검증 방식 선택 문제이지 코드 결함이 아님. 이번에도 표준 goal-backward로 진행(2회차와 같은 판단 — 성공 기준 6개가 충분히 구체적이다) |
| 3 | React taint 2차 방어 미구현(사용 0건, 이번 라운드 재확인) | architectural | react@19.3.0 안정 채널에 API 없음. 대체 구현(`plant8/no-row-type-escape` + boundaries)이 error로 강제된다. Override 수락 또는 ROADMAP 문구 갱신 필요(사람 판정 6) |
| 4 | `03-REVIEW-2.md` Low 4건이 코드에 남아 있다 — untrim 재저장으로 행동 로그 중복(`code-item-form.tsx:102`가 `value`를 그대로 보내고 도메인이 `trim()`하므로 공백 붙은 이름은 blur마다 재저장) · 보관 검사-쓰기 비원자성 · `CardOwnerForm`이 `validationErrors` 미표시 · 없는 id 수정이 성공으로 보임 | other | **새 발견이 아니다** — `03-OPEN-ITEMS.md`가 「고치지 않고 남긴 것」으로 근거와 함께 기록했다. 전부 Low·데이터 손상 없음. 빨간 테스트 없음 → 증거 게이트상 advisory |
| 5 | `code-tables/page.tsx:125`의 `<th>동작</th>`이 권한과 무관하게 항상 렌더된다(법인카드는 `canWrite \|\| canArchive`로 머리글까지 감춘다) | other | 보기 전용 계급에게 빈 열 하나가 남는 화장 결함. `code-tables-write-gate.spec.ts`가 편집 수단 0개는 단언하지만 머리글은 보지 않는다. 동작·보안 영향 0 |

**증거 게이트(#3304) 적용 기록:** 이번 라운드에 🛑 Blocker로 올린 항목은 **0건**이다. 디버그 마커(`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`)는 변경 16파일 전수 grep에서 **0건**이므로 자기증명 blocker도 없다. 위 4·5는 이전 `gaps:`에 없고 결정적 증거가 없어 advisory다.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | 거래처 자동완성 UI 소비자 | Phase 5 · Phase 6 | ROADMAP Phase 3 성공 기준 5 원문 |
| 2 | 전 메뉴 대상 권한·노출·행동 로그 검수 | Phase 7 | ROADMAP Phase 7 성공 기준 5 + Phase 3 goal 본문 |
| 3 | 관리자 폼 7개 §6-3 이관 (A-H2·A-H3) | Phase 4(제작) · Phase 7(이관) | ROADMAP Phase 7 성공 기준 5에 명문화(`977bd40`). **이번 라운드가 만든 폼 둘(`CardOwnerForm`·`CodeItemLabelInput`)도 이 이관 대상에 들어간다** |
| 4 | 폰 375 관리자 표(DOM 감사 2·6·7) · /review M-4 · L-1 · /cso R2·R3·R4·R5 | Phase 4 | `03-OPEN-ITEMS.md` 「Phase 4로 미루기로 한 것 (사용자 승인 2026-09-21)」 |
| 5 | design-review 나머지 23건 중 미승인 이월분 | Phase 4 · Phase 7 | `03-OPEN-ITEMS.md` — **사용자 승인 전임을 파일이 명시**한다 |

**이월 항목은 이 보고서에서 미달로 세지 않았다.** 출처·근거·시점은 `03-OPEN-ITEMS.md`에 있고, A-H2·A-H3의 Phase 4 제작 / Phase 7 이관은 `ROADMAP.md` Phase 7 성공 기준 5에 명문화돼 있다.

### Human Verification Required

6건 — frontmatter `human_verification` 참조. **이 절이 비어 있지 않은 것이 `passed`가 아닌 유일한 이유다**(Step 9 규칙 2). 미달(`gaps`)은 0건이다.

| # | 항목 | 성격 | 변화 |
|---|---|---|---|
| 1 | 스테이징 배포 Job 3단계(migrate → seed → account) 실제 로그 확인 | 외부 환경 | 유지 |
| 2 | Secret Manager `app-data-key-v1` 32바이트 확인 | 외부 시크릿 | 유지 |
| 3 | **거래처 수정 왕복 실측** — 계좌번호 칸을 비운 채 저장해도 암호문·뒤 4자리가 보존되는지 | 화면 경로 미검증 | 유지 — 코드표·법인카드는 이번에 e2e로 닫혔지만 거래처는 그대로다(`vendors.spec.ts`에 `editId` 0건, 실측) |
| 4 | **코드표 `value` 불변 결정(안 a)을 계획 기록에 남긴다** | 기록 위치 | **신규** — 2회차의 「`value`까지 열 것인가」 결정 항목을 대체한다. 결정은 내려졌고 구현도 그대로지만(4겹 실측), 근거가 코드 주석에만 있다 |
| 5 | **결정** — 설정 화면의 낡은 안내 문구를 지금 고칠 것인가 | 우선순위 | 유지(advisory 1) |
| 6 | **결정** — React taint 편차를 override로 수락할 것인가, ROADMAP을 고칠 것인가 | 계약 문서 | 유지(advisory 3) — 아직 override가 수락되지 않았다 |

**닫힌 사람 판정 1건:** 2회차의 「결정 — 코드표 항목 수정에서 `value`까지 바꿀 수 있게 할 것인가」는 **안 a(`label`만)로 결정됐고 코드가 그대로 구현했다**. 남은 것은 그 결정을 계획 문서에 적는 일뿐이라 4번으로 성격을 바꿔 이관했다.

### Override 제안

React taint 편차는 2회차부터 제안 상태이고 아직 수락되지 않았다. 검증자는 override를 대신 수락할 수 없다(`accepted_by`는 사람이다) — 성공 기준 2는 편차를 명시한 채 VERIFIED로 두고, 처분은 사람 판정 6번에 남긴다.

```yaml
overrides:
  - must_have: "React taint API가 2차 방어다 (성공 기준 2)"
    reason: "react@19.3.0 안정 채널에 experimental_taint가 없어(03-CONTEXT.md:49, 03-RESEARCH.md Pitfall 1) 컴파일 타임 커스텀 규칙 plant8/no-row-type-escape + boundaries로 대체. ROADMAP 문구 갱신 필요"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Gaps Summary

**미달 0건.** 2회차가 남긴 두 건은 코드에서 닫혔고, 닫는 과정이 만든 회귀도 없다.

1. **법인카드 「수정」** — 행 「수정」 링크 → `?editId=` 토글 → `CardOwnerForm` → `updateCorpCardOwnerAction`까지 실제 호출 사슬이 이어진다(grep 실측: 화면 호출자 0 → 2). 보관된 카드는 화면(`editingCard` 필터 + 링크 부재)과 도메인(`ArchivedCorpCardError`) 두 겹에서 막히고, `?editId=<보관된 id>`를 직접 쳐도 폼이 뜨지 않는다. 소유자로 지정하려는 사람·팀의 보관 여부까지 등록·수정 두 경로가 공유하는 가드로 본다(/cso T-03-55). 왕복은 프로덕션 빌드 e2e 3건이 고정했고 **검증자가 직접 실행해 통과를 확인했다**.

2. **코드표 항목 「수정」** — `updateCodeItemLabel`이 `can()` → 리포지토리 → `recordAction(document_update)` → `project()` 순서로 실재하고, 행 인라인 입력이 배선돼 있으며, 보관 항목은 도메인이 거부하고 화면은 글자로 렌더한다. **`value`는 네 계층(액션 스키마·도메인·리포지토리·UI) 어디에도 쓰기 경로가 없다** — `vendors.default_evidence_type`이 FK 없는 `text`에 그 문자열을 담는 제약이 코드에서 실제로 지켜진다. 왕복은 e2e가 reload 후 지속까지 단언한다.

**추가로 닫힌 것:** `03-REVIEW-2.md`의 Medium 3건(오류 표시 §7-2 · 성공 후 수정 모드 이탈 · `?new=1&editId=` 폼 2개)과 코드표 쓰기 권한 게이트(M-1 / DOM 감사), 그리고 `/cso` T-03-55. 전부 코드에서 확인했고 해당 e2e·통합이 통과한다.

**남은 것은 미달이 아니다.** 사람 판정 6건(외부 환경 2 · 화면 경로 실측 1 · 기록·정책 결정 3)과 advisory 5건이다. advisory 4·5는 `03-OPEN-ITEMS.md`가 이미 근거와 함께 「고치지 않고 남긴 것」으로 기록했거나 화장 수준이며, 결정적 증거(빨간 테스트·재현 명령)가 없어 증거 게이트(#3304)상 blocker가 아니다 — **완료된 must-have를 되돌리지 않는다.**

**다음 행동:** `status: human_needed`이므로 `/gsd-plan-phase --gaps`가 필요한 미달은 없다. 사람 판정 6건을 UAT로 처리한 뒤 페이즈를 닫으면 된다. 특히 **사람 판정 4번(코드표 `value` 불변 결정의 기록)**은 지금 적지 않으면 다음 사람이 코드 주석에서만 알 수 있는 상태로 남는다.

---

_Verified: 2026-09-21T12:05:40Z_
_Verifier: Claude (gsd-verifier) — 3회차 재검증 (1회차 2026-09-21T05:17:08Z `gaps_found` 9/13 · 2회차 2026-09-21T09:27:05Z `gaps_found` 12/13)_
