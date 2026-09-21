---
phase: 03-permissions-settings-masters
verified: 2026-09-21T09:27:05Z
status: gaps_found
score: 12/13 must-haves verified
covered_digest: "v1:sha256:7ef48a57083b429e7f2e4024c240d36838e7da83736263a4ad738e1f6b597b4e"
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
  - "test/e2e/code-tables.spec.ts"
  - "test/e2e/corp-cards.spec.ts"
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
  - "test/integration/corp-cards.test.ts"
  - "test/integration/leak-scan.test.ts"
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
  previous_score: 9/13
  previous_verified: 2026-09-21T05:17:08Z
  gaps_closed:
    - "OPS-05 — 로그인이 행동 로그에 남지 않는다 (c8115ae)"
    - "MAST-01 — 거래처 수정 화면이 없다 (b8628fc · 2c8851e · 45af478)"
    - "ADMN-03 — 누수 스캔이 등록 파일 9개 중 7개만 본다 (4582307)"
    - "ADMN-06 — 설정 가져오기 운영 진입점이 없다 (3c6d3f9)"
  gaps_remaining: []
  regressions: []
  new_gaps:
    - "성공 기준 5 — 법인카드 소유자 변경 화면이 없다(`updateCorpCardOwnerAction` 호출자 0). 이전 검증이 `updateVendorAction`의 동일한 상태를 gaps 2로 센 것과 같은 결함 모양인데 이전 검증은 법인카드 축을 점검하지 않았다"
    - "MAST-04 — 코드표 항목의 값·라벨을 고치는 함수·화면이 없다. 이전 검증은 증빙 종류 세금 규칙 편집을 「수정」으로 읽어 MET로 적었으나, 세금 규칙은 성공 기준 5의 별도 문장이 요구하는 것이지 MAST-04의 코드표 항목 수정이 아니다"
  note: "이전 검증은 테스트를 한 번도 실행하지 않았다(요청 조건). 이번 재검증은 단위 581 · 통합 713 · e2e 110(desktop 79 + mobile-375 31) · typecheck · eslint를 이 프로세스에서 직접 돌려 전부 통과를 확인했다. 새 미달 2건은 테스트 실패가 아니라 원문(REQUIREMENTS.md:22 · ROADMAP 성공 기준 5)과 코드의 직접 대조에서 나왔다."
gaps:
  - truth: "성공 기준 5 — 「거래처·클라이언트…, 법인카드(개인/팀, 소지자 또는 소속 팀), 코드표…를 관리 화면에서 등록·수정·비활성화한다」 중 법인카드 「수정」이 화면에 없다"
    status: partial
    reason: "`updateCorpCardOwnerAction`(`app/(app)/admin/corp-cards/actions.ts:34-59`)은 정의돼 있고 `actions.registry.ts:13`에 등록까지 돼 있으나 `app/`·`ui/` 어디에서도 부르지 않는다(호출자 0 — 실측). `domain/corp-cards.updateCorpCardOwner`(`index.ts:122`)도 통합 테스트(`test/integration/corp-cards.test.ts:135·160`)만 부른다. 화면은 등록·활성 토글·삭제(보관)뿐이고 기존 카드의 소지자·팀을 바꾸는 진입점이 없다 — `page.tsx:130-139`의 동작 칸에 「수정」이 없다. **이전 검증은 `updateVendorAction`의 완전히 동일한 상태(정의·등록됨, 호출자 0)를 gaps 2 「거래처 수정 화면이 없다」로 셌고 그래서 `b8628fc`로 고쳤다.** 같은 결함 모양에 다른 판정을 내릴 코드상 근거가 없다. 다만 요구사항 MAST-03 원문(「등록하고, 카드마다 소지자 또는 소속 팀을 지정한다」)은 「수정」을 요구하지 않으므로 **MAST-03 자체는 충족**이고, 미달은 ROADMAP 성공 기준 5에 대한 것이다."
    artifacts:
      - path: "app/(app)/admin/corp-cards/page.tsx"
        issue: "행 동작 칸(130-139행)에 「수정」 진입점이 없다. `corpCardsHref`(19-25행)도 `isNew`만 만들고 vendors의 `editId`에 해당하는 인자가 없다"
      - path: "app/(app)/admin/corp-cards/card-form.tsx"
        issue: "`createCorpCardAction`·`setCorpCardActiveAction`·`archiveCorpCardAction`만 import한다(6행) — `updateCorpCardOwnerAction`을 부르지 않는다. 등록 전용 폼이다"
      - path: "app/(app)/admin/corp-cards/actions.ts"
        issue: "`updateCorpCardOwnerAction`(34-59행)이 등록·노출됐지만 호출자 0 — 죽은 배선"
    missing:
      - "카드 행의 「수정」 진입점 + 소유 변경 폼 — vendors가 이미 쓰는 `?editId=` 토글과 같은 결(D-39, `DECISIONS.md` 2026-09-21)로 맞춘다. 최소 범위는 종류(개인/팀) 전환 + 소지자·팀 재지정이다(`updateCorpCardOwner`가 반대 칸을 같은 UPDATE 문에서 비우는 계약을 이미 갖고 있다)"
      - "보관·비활성 카드의 수정 차단을 **도메인에서** 판정한다 — `domain/vendors.updateVendor:300-303`이 `ArchivedVendorError`로 한 선례를 그대로 따른다(화면에서 링크를 감추는 것만으로는 `?editId=<보관된 id>` 직접 진입을 막지 못한다는 것이 DOM 감사 실측 결과다)"
      - "e2e: 소유자를 개인 → 팀으로 바꾸면 목록의 「종류」·「소유」 칸이 함께 바뀌고, 반대 칸이 비워진다(H-1 회귀 `d9dde36`의 kind 동기화가 화면 경로에서도 지켜지는지)"
  - truth: "MAST-04 — 「견적 대분류·소분류, 지급 방식, 프로젝트 상태 같은 코드표를 관리 화면에서 추가·수정·비활성화한다」 중 「수정」이 없다"
    status: partial
    reason: "`domain/code-tables/index.ts`의 내보내기는 `listCodeItems`·`createCodeItem`·`setCodeItemActive`·`setEvidenceTypeTaxRule` **넷뿐**이고 코드표 항목의 `value`·`label`을 고치는 함수가 없다(실측). 액션(`actions.ts`)도 `createCodeItemAction`·`setCodeItemActiveAction`·`setEvidenceTypeTaxRuleAction`·`archiveCodeItemAction` 넷뿐이고, `code-item-form.tsx`는 등록 폼이다. **`setEvidenceTypeTaxRule`을 MAST-04의 「수정」으로 읽을 수 없다** — 그것은 성공 기준 5의 별도 문장(「증빙 종류 코드표는 종류마다 세금 규칙 필드…를 갖고」)이 요구하는 것이고, `index.ts:129-131`이 `tableKey !== evidence_type`이면 `NotEvidenceTypeError`로 거부하므로 프로젝트 상태·지급 방식 같은 다른 코드표에는 적용조차 되지 않는다. MAST-04가 이름을 든 「견적 대분류·소분류, 지급 방식, 프로젝트 상태」는 추가·비활성화·보관만 된다."
    artifacts:
      - path: "domain/code-tables/index.ts"
        issue: "update 계열 함수 부재 — 내보내기 4개(`listCodeItems`·`createCodeItem`·`setCodeItemActive`·`setEvidenceTypeTaxRule`)에 값·라벨 수정이 없다"
      - path: "app/(app)/admin/code-tables/actions.ts"
        issue: "수정 액션이 없다(create·setActive·setEvidenceTypeTaxRule·archive 넷)"
      - path: "app/(app)/admin/code-tables/page.tsx"
        issue: "행 동작에 「수정」 진입점이 없다 — `code-item-form.tsx`는 등록 전용"
    missing:
      - "`updateCodeItem(viewer, id, { label?, value? })` — `can(viewer,\"admin.code-tables\",\"write\")` → 갱신 → `recordAction(document_update)`(거래처 수정이 `b0b8886` 이후 쓰는 종류와 같게. `document_create` 재사용 금지 — 그것이 결함 3이었다)"
      - "**`value` 수정은 참조 무결성 판단이 먼저다.** `db/schema/vendors.ts:19` `default_evidence_type`은 `text` 컬럼에 코드 항목의 `value` **문자열**을 FK 없이 담는다 — `value`를 바꾸면 기존 거래처의 기본 증빙 종류가 조용히 고아가 된다(화면은 `app/(app)/admin/vendors/page.tsx:120-123`에서 라벨을 못 찾아 원시 값으로 내려앉는다). 안전한 최소 구현은 **`label`만 수정 허용**이고, `value`까지 열려면 참조 갱신(또는 FK 도입)이 같은 트랜잭션에 있어야 한다. 어느 쪽인지 결정이 먼저다"
      - "`UNIQUE(table_key, value)`(`db/schema/code-tables.ts:31`) 충돌을 사용자 문구로 돌려주는 경로 — `lib/pg-errors.ts`가 이미 쓰는 방식"
      - "`registerAction`으로 누수 스캔 등록 + 회귀 테스트(수정이 `document_update`로 남는지, 다른 코드표 항목의 값과 충돌하면 거부되는지)"
deferred:
  - truth: "MAST-01 — 「입력 시 자동완성된다」의 화면 소비자"
    addressed_in: "Phase 5 · Phase 6"
    evidence: "ROADMAP Phase 3 성공 기준 5: 「거래처마다 기본 증빙 종류를 두어 Phase 5·6의 지출결의·카드 사용 등록 때 자동으로 채워진다」. `domain/vendors.searchVendors`는 이 페이즈에 있고 `test/integration/vendors.test.ts:82·93·110`이 증명한다. `app/`·`ui/`에 호출자 0개 — 붙을 화면이 아직 없다."
  - truth: "성공 기준 2·6 — 전 메뉴 대상 권한·노출·행동 로그 검수"
    addressed_in: "Phase 7"
    evidence: "ROADMAP Phase 7 성공 기준 5: 「누수 스캔 생성기가 Phase 3~7의 모든 액션·DTO 타입·Excel 내보내기 함수를 덮고…Playwright 계급별 노출 스모크가 CI에 있다」. Phase 3 goal 자체가 「전 메뉴 대상 검수는 Phase 7 끝에서 한다」고 명시한다."
  - truth: "관리자 폼 7개(사람·계급·조직·거래처·법인카드·코드표·설정)의 §6-3 폼 템플릿 이관 (design-review A-H2·A-H3)"
    addressed_in: "Phase 4(컴포넌트 제작) · Phase 7(이관)"
    evidence: "ROADMAP Phase 7 성공 기준 5 본문에 「관리자 화면 7개의 폼을 Phase 4가 만든 `ui/form`·`ui/select`로 이관해 §6-3 폼 템플릿 밖에 있는 관리자 화면이 0이고…Phase 3 design-review가 실측으로 남긴 A-H2·A-H3의 이월분이다」로 박혀 있다. `03-OPEN-ITEMS.md`에 출처·근거 기록. **주의:** 위 gaps 두 건이 새로 만드는 폼도 이 이관 대상에 함께 들어간다."
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
    evidence_status: "결정적(파일·줄 실재). 동작 영향이 없어 blocker로 올리지 않았다 — 사용자가 advisory 유지를 명시적으로 확인했다(2026-09-21)."
  - finding: "MVP 모드 불일치 — ROADMAP Phase 3이 `Mode: mvp`인데 goal이 User Story 형식(「As a …, I want to …, so that ….」)이 아니다"
    category: other
    reason: "verify-mvp-mode.md 규칙상 검증을 거절하고 `/gsd mvp-phase 3`으로 되돌려야 하나, 성공 기준 6개가 충분히 구체적이어서 표준 goal-backward로 진행했다(이전 검증과 같은 판단). MVP 모드를 의도한 것이 아니면 `Mode: mvp`를 지우는 것이 맞다."
    evidence_status: "none provided"
  - finding: "React taint API 2차 방어(ROADMAP 성공 기준 2 원문)가 구현되지 않았다 — `taintObjectReference|taintUniqueValue|experimental_taint` 사용 0건"
    category: architectural
    reason: "react@19.3.0 안정 채널에 `experimental_taint`가 없어(03-CONTEXT.md:49, 2026-09-20 정정) 쓸 수 없고, 컴파일 타임 커스텀 규칙 `plant8/no-row-type-escape`(133줄 type-aware) + `boundaries`로 대체했다. 이전 검증이 같은 사실을 「문서화된 편차」로 적고 override를 제안했으나 아직 수락되지 않았다 — 아래 Override 제안 참조."
    evidence_status: "결정적(사용 0건). 대체 구현이 실재하고 린트에 error로 등록돼 있다."
human_verification:
  - test: "스테이징 배포 파이프라인 로그에서 `migrate → seed → account` Job 순서와 결과를 직접 확인한다(`plant8-staging-seed` 로그에 `seed complete: … permissions=45 …`, `plant8-staging-account` exit 0)"
    expected: "세 Job이 순서대로 exit 0이고, 시스템 관리자로 `/admin/permissions`에 들어가면 격자가 채워진 상태로 보인다"
    why_human: "Cloud Run Job 환경(외부 node_modules·커넥터·Secret)에서 번들이 같은 결과를 내는지는 실제 배포 로그로만 확인된다. 코드 쪽 배선(`scripts/build-cli.mjs` 4 엔트리 · `scripts/deploy.sh:341·390·668` · `test/unit/deploy/cli-bundle.test.ts`)은 이번에도 실재를 확인했다"
  - test: "GCP Secret Manager의 staging·prod `app-data-key-v1` 값이 base64 32바이트인지 확인한다"
    expected: "두 환경 모두 32바이트. 아니면 거래처 계좌번호 저장이 fail-closed로 500이 된다"
    why_human: "`lib/env.ts`가 키를 선택 문자열로 두어 값이 없어도 앱이 뜨므로 코드만으로는 시크릿 존재·길이를 판정할 수 없다(03-SECURITY T-03-41 수락의 전제). 참고: 스테이징에서의 계좌번호 등록·「번호 보기」·`mask_reveal` 기록은 `03-OPEN-ITEMS.md` 「사람만 판정 가능한 것 (완료)」에 통과로 기록돼 있다"
  - test: "거래처 수정 왕복을 화면에서 한 번 해 본다 — 「수정」 진입 → 이름만 바꿔 저장 → 목록 반영 확인 → 다시 「수정」 진입해 계좌번호 칸을 **비워 둔 채** 저장 → 목록의 `****-**-1234`가 그대로인지 확인"
    expected: "이름이 바뀌고, 계좌번호 뒤 4자리와 「번호 보기」 평문이 보존된다(빈 칸 = 「안 바꿈」)"
    why_human: "`planAccountNumberUpdate`의 분기는 단위 6건으로 고정됐고(`test/unit/vendors/account-number-plan.test.ts`) `updateVendor`는 통합에서 실 DB로 돌지만(`test/integration/vendors.test.ts:182·228`), **폼 → 액션 → 도메인**의 화면 경로를 끝까지 태우는 e2e·통합이 없다. 이전 gaps 2가 요구한 「E2E: 수정 후 목록 반영 + 계좌번호 칸을 비워 둔 채 제출해도 암호문·뒤 4자리가 보존됨」이 아직 없다"
  - test: "결정 — 코드표 항목 수정에서 `value`까지 바꿀 수 있게 할 것인가(gaps 2의 선행 결정)"
    expected: "사용자 결정: (a) `label`만 수정 허용(`value`는 불변 키로 고정 — 가장 싸고 안전하다) (b) `value`도 허용하되 같은 트랜잭션에서 `vendors.default_evidence_type` 등 참조를 갱신 (c) `value` 참조에 FK를 도입한 뒤 (b)"
    why_human: "코드 사실은 확정됐다 — `db/schema/vendors.ts:19`가 `default_evidence_type`을 FK 없는 `text`로 두어 코드 항목의 `value` 문자열을 담는다. 어느 쪽을 택할지는 데이터 모델 정책 판단이고, 이 결정 없이 구현하면 그 판단이 코드에 숨는다"
  - test: "결정 — 설정 화면의 「가져오기는 통합 테스트로만 제공됩니다」 문구를 지금 고칠 것인가"
    expected: "사용자 결정: (a) 즉시 한 줄 수정(`pnpm settings:import --file <경로>` 안내 + `docs/OPERATIONS.md §12` 참조) (b) 다음에 이 파일을 건드릴 때 같은 커밋에 (c) 현 상태 수락"
    why_human: "동작에는 영향이 없고 요구사항 ADMN-06은 충족됐다 — 우선순위 판단이다(advisory 1). 사용자가 advisory 유지를 이미 확인했다"
  - test: "결정 — React taint 편차를 override로 수락할 것인가, ROADMAP 문구를 고칠 것인가"
    expected: "사용자 결정: (a) 아래 Override 제안을 이 파일 frontmatter에 넣어 수락 (b) ROADMAP 성공 기준 2에서 「React taint API가 2차 방어다」를 「컴파일 타임 커스텀 린트가 2차 방어다」로 갱신"
    why_human: "react 안정 채널에 API가 없다는 것은 코드로 확정됐다(사용 0건). 계약 문서를 고칠지 편차를 수락할지는 사용자 판단이다"
---

# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) Verification Report

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 메커니즘(판정 함수·리포지토리 행 필터 + DTO 투영·설정 레지스트리·누수 스캔 테스트 생성기·암호화 헬퍼·보관함·행동 로그)과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다.
**Verified:** 2026-09-21T09:27:05Z (브랜치 `docs/phase7-form-migration`, HEAD `977bd40` — `main` `7adf401` + 문서 커밋 1개. 작업 트리 깨끗)
**Status:** gaps_found
**Re-verification:** **Yes** — 2026-09-21T05:17:08Z 검증(`gaps_found`, 9/13) 이후 갭 클로저 커밋이 머지된 상태에 대한 재검증

## 요약

| | 이전 (05:17:08Z) | 이번 (09:27:05Z) |
|---|---|---|
| status | `gaps_found` | `gaps_found` |
| 요구사항 | 9/13 | **12/13** |
| 성공 기준 | 3/6 완전 · 3/6 부분 | **5/6 완전 · 1/6 부분** |
| 이전 미달 4건 | — | **전부 닫힘** |
| 회귀 | — | **0건** |
| 새 미달 | — | **2건**(법인카드 「수정」 · 코드표 항목 「수정」) |
| 테스트 실행 | **안 함** | 단위 581 · 통합 713 · e2e 110 · typecheck · lint **전부 통과** |

## 이번 재검증이 이전과 다른 점

이전 보고서는 **테스트를 한 번도 실행하지 않았다**(요청 조건: 스테이징 배포 진행 중, 테스트 DB를 다른 프로세스가 소유). 「테스트로 증명」은 전부 「그 행동을 단언하는 테스트 파일이 존재한다」는 뜻이었다.

이번에는 이 프로세스에서 직접 돌렸다:

| 게이트 | 명령 | 결과 |
|---|---|---|
| 단위 | `npx vitest run --project unit` | **581 passed** (63 files, 19.7s) |
| 통합 | `npx vitest run --project integration` | **713 passed** (25 files, 221.5s) |
| E2E 데스크톱 | `CI=true npx playwright test --project=desktop` | **79 passed** (1.4m, 프로덕션 빌드) |
| E2E 폰 375 | `CI=true npx playwright test --project=mobile-375` | **31 passed** (46.8s, 프로덕션 빌드) |
| 타입 | `npx tsc --noEmit` | exit 0 |
| 린트 | `npx eslint .` | exit 0 (boundaries 플러그인 deprecation 경고만) |

E2E는 `playwright.config.ts`가 `CI=true`에서 `pnpm build && pnpm start`(프로덕션 빌드)를 쓰므로 CLAUDE.md의 「로컬 dev 통과는 완료 신호가 아니다」 조건을 만족한다.

**새 미달 2건은 테스트 실패에서 나오지 않았다.** 1,404건 전부 초록이다 — 그 둘은 요구사항 원문(`REQUIREMENTS.md:22`)과 ROADMAP 성공 기준 5를 코드와 직접 대조해서 나왔다. 테스트가 없는 기능은 테스트가 잡지 못한다.

## 이전 미달 4건의 현재 상태 — 전부 닫힘

| # | 이전 미달 (2026-09-21T05:17:08Z) | 커밋 | 현재 | 코드 근거 |
|---|---|---|---|---|
| 1 | OPS-05 — `login` 기록 0행 | `c8115ae` | **CLOSED** | `domain/auth/hooks.ts:96-107` — `after` 훅의 `if (success)` 분기 안에서만 `recordAction(actor, { actionType: "login" })`(106행)을 부르고 곧바로 `return`(107행)한다. 실패·잠금 경로(113-117행)는 이 분기 **뒤**에 있어 절대 도달하지 않는다. actor는 `getSessionActor(ctx.context.newSession)`(75-83행)이 `id`·`roleId`만 안전하게 꺼내 만든다(`any` 없음). 보관된 사용자 거부(`before` 훅 59-63행)와도 섞이지 않는다 — 거기서는 `APIError`로 끊겨 `after`가 돌지 않는다 |
| 2 | MAST-01 — 거래처 수정 화면 없음 | `b8628fc` · `2c8851e` · `45af478` | **CLOSED** | 진입: `app/(app)/admin/vendors/page.tsx:148` 행마다 `?editId=<id>` 링크 → `:60`이 그 id로 `editingVendor`를 찾고 `:66 showForm` → `:74-82`이 `<VendorForm editing={editingVendor} …>`. 배선: `vendor-form.tsx:7` `updateVendorAction` import → `:83 useAction` → `:111-127` 수정 분기가 `updateState.execute({ id, …, accountNumber, customFields })`. 계약: `actions.ts:45` `accountNumber: z.string().nullable().optional()`(M-5 수정) |
| 3 | ADMN-03 — 누수 스캔이 registry 9개 중 7개만 봄 | `4582307` | **CLOSED** | `test/integration/leak-scan.test.ts:24-32` — `app/` 아래 `actions.registry.ts` **9개 전부** side-effect import(디스크 실측 9개와 일치). `:92` `expect(EXPORT_REGISTRY.length).toBeGreaterThanOrEqual(2)`로 내보내기 축 하한을 걸었다(이전엔 `Array.isArray`만) |
| 4 | ADMN-06 — 설정 가져오기 진입점 0 | `3c6d3f9` | **CLOSED** | `scripts/settings-import.ts:78` `await importSettings(SYSTEM_VIEWER, payload)`. `package.json:27` `"settings:import"`. `docs/OPERATIONS.md:210-222` §12에 절차·종료 코드 규약. 신규 의존성 0 |

### 미달 3의 「등록만 하면 검사가 따라온다」는 어떻게 닫혔나

이전 보고서가 요구한 것은 glob 로더였으나 실제 해법은 다르다 — **회귀 방어 테스트**다. `test/unit/leak-scan-coverage.test.ts`(2건)가 `app/` 아래를 재귀 탐색해(`findRegistryFiles`, 20-34행) 찾은 모든 `actions.registry.ts`의 import 지정자가 누수 스캔 소스 문자열에 **따옴표째** 들어 있는지 단언한다(49-57행).

이 방어가 실제로 동작하는지 검증자가 직접 확인했다(파일은 건드리지 않고 메모리에서만 재현):

```
actual                     registryFiles=9 missing=[]
mutated(1 import removed)  registryFiles=9 missing=["@/app/(app)/admin/visibility/actions.registry"]
```

즉 「등록만 하면 검사가 **자동으로** 따라온다」는 아니고 「등록 파일을 만들고 import를 잊으면 **단위 테스트가 즉시 빨개진다**」다. 조용히 빠지던 실패 모드(이전 미달의 본질)는 닫혔다. 실행 근거: `npx vitest run --project integration test/integration/leak-scan.test.ts` → **561 passed**.

**단언 강도 관찰:** 이 방어는 소스 문자열 대조다 — import를 주석 처리하면 통과한다(실무에서 드문 경로). `leak-scan.test.ts:146`의 `expect(Array.isArray(buildExportCases())).toBe(true)`는 여전히 **약한 단언**이지만, 같은 파일 92행의 하한 단언(`>= 2`)이 실질 방어를 맡고 146행은 vitest의 빈-스위트 실패 방지 용도로 역할이 분리돼 있다(주석 142-144행에 근거).

## 새로 확인한 미달 2건

이전 검증이 점검하지 않았거나 잘못 읽은 축이다. **테스트는 전부 초록이므로 이 둘은 원문 대조로만 드러난다.**

### 미달 1 — 성공 기준 5: 법인카드 「수정」이 화면에 없다

ROADMAP Phase 3 성공 기준 5 원문:

> 거래처·클라이언트(미사용은 삭제 대신 숨김, 입력 시 자동완성), **법인카드(개인/팀, 소지자 또는 소속 팀)**, 코드표(…)를 관리 화면에서 **등록·수정·비활성화한다**

세 마스터가 한 동사구(`등록·수정·비활성화한다`)에 묶여 있다. 코드 실측:

| 축 | 등록 | 수정 | 비활성화/숨김 |
|---|---|---|---|
| 거래처 | ✓ | **✓ (`b8628fc`로 닫힘)** | ✓ |
| 법인카드 | ✓ `createCorpCardAction` | **✗ 호출자 0** | ✓ `setCorpCardActiveAction` |
| 코드표 | ✓ `createCodeItemAction` | **✗ 함수 자체 없음**(미달 2) | ✓ `setCodeItemActiveAction` |

`updateCorpCardOwnerAction`은 `actions.ts:34-59`에 정의되고 `actions.registry.ts:13`에 등록까지 돼 있지만 `app/`·`ui/` 호출자가 **0개**다. `card-form.tsx:6`은 `createCorpCardAction`·`setCorpCardActiveAction`·`archiveCorpCardAction`만 import한다. `page.tsx:130-139`의 동작 칸에는 활성 토글과 삭제뿐이고 「수정」이 없다. `corpCardsHref`(19-25행)도 `isNew`만 만들고 vendors의 `editId`에 해당하는 인자가 없다.

**이전 검증은 `updateVendorAction`의 완전히 동일한 상태 — 정의·등록됨, 호출자 0 — 를 gaps 2 「거래처 수정 화면이 없다 · 죽은 배선」으로 셌다.** 그래서 `b8628fc`가 나왔다. 같은 결함 모양에 다른 판정을 내릴 코드상 근거가 없으므로 미달로 센다.

**단, 요구사항과 성공 기준을 나눠 적는다:** 요구사항 MAST-03 원문(`REQUIREMENTS.md:21`)은 「법인카드 마스터: …등록하고, 카드마다 소지자(직원) 또는 소속 팀을 **지정**한다」로 「수정」을 요구하지 않는다 — **MAST-03 자체는 충족(MET)**이다. 미달은 ROADMAP 성공 기준 5에 대한 것이다.

### 미달 2 — MAST-04: 코드표 항목 「수정」이 없다

`.planning/REQUIREMENTS.md:22` 원문:

> **MAST-04**: 견적 대분류·소분류, 지급 방식, 프로젝트 상태 같은 코드표를 관리 화면에서 **추가·수정·비활성화**한다

`domain/code-tables/index.ts`의 내보내기는 **넷뿐**이다(실측):

```
listCodeItems · createCodeItem · setCodeItemActive · setEvidenceTypeTaxRule
```

값·라벨을 고치는 함수가 없다. 액션도 `createCodeItemAction`·`setCodeItemActiveAction`·`setEvidenceTypeTaxRuleAction`·`archiveCodeItemAction` 넷뿐이고 `code-item-form.tsx`는 등록 폼이다.

**`setEvidenceTypeTaxRule`을 MAST-04의 「수정」으로 읽을 수 없다.** 두 가지 이유가 있고 둘 다 코드에 있다:

1. 그것은 성공 기준 5의 **별도 문장**이 요구하는 것이다 — 「증빙 종류 코드표(…)는 종류마다 세금 규칙 필드(…)와 절사 단위·절사 방식·최소 징수액·적용 기준일 종류 필드를 갖고」. MAST-04의 코드표 항목 수정과 다른 요구다.
2. `index.ts:129-131`이 `current.tableKey !== EVIDENCE_TYPE_TABLE_KEY`면 `NotEvidenceTypeError`를 던진다 — **MAST-04가 이름을 든 「견적 대분류·소분류, 지급 방식, 프로젝트 상태」에는 적용조차 되지 않는다.** 그 표들은 추가·비활성화·보관만 된다.

**이전 판정을 유지하지 않는 이유:** 앞선 보고서 초안은 「이전 검증도 같은 코드 상태를 MET로 적었으니 뒤집지 않는다」를 근거로 삼았다. 그 논리는 잘못이다 — 검증자 진동 방지(`#3304` 증거 게이트)는 **같은 증거로 판정이 왔다 갔다 하는 것**을 막는 규칙이지, 원문과 코드를 직접 대조해 나온 증거를 이전 판정으로 덮는 규칙이 아니다. 게이트 자신이 「진리·산출물·핵심 배선(Steps 3-6)은 이 실패 모드를 만들 수 없다」며 적용 범위를 Step 7 안티패턴 스캔으로 한정한다. 이 둘은 Step 3·5 판정이다.

**선행 결정이 하나 있다.** `db/schema/vendors.ts:19`의 `default_evidence_type`은 **FK 없는 `text`** 컬럼에 코드 항목의 `value` 문자열을 담는다. `value`를 바꾸면 기존 거래처의 기본 증빙 종류가 조용히 고아가 되고, `app/(app)/admin/vendors/page.tsx:120-123`이 라벨을 못 찾아 원시 값으로 내려앉는다. 안전한 최소 구현은 **`label`만 수정 허용**이다 — 어느 쪽인지 결정이 구현보다 먼저다(human 4).

## Goal Achievement

### Observable Truths — ROADMAP 성공 기준 6개

| # | Truth (요약) | Status | Evidence |
|---|---|---|---|
| 1 | 사람 등록(계정·초기 비밀번호 같은 화면) · 계급은 데이터 · 본부·팀(팀 ⊂ 본부) · 발령일 이력 · 사용일 시점 소속 | ✓ VERIFIED | `db/schema/org.ts`(teams.org_unit_id NOT NULL · team_memberships UNIQUE(user_id, effective_from)) · `domain/org/index.ts:188 teamAtDate`(없으면 null) · `cancelFutureAssignment`(미래만) · `domain/people/index.ts registerPerson` · `person-form.tsx` · `[id]/person-detail-client.tsx` HistoryList. §6-1 재구성(`94f9dbd`·`c2f743d`) 후에도 등록·발령 경로가 그대로임을 `test/e2e/admin-master-list-first.spec.ts:88·148` + `org.spec.ts`·`people.spec.ts` 실행으로 확인 |
| 2 | 권한표·노출표 체크 → 즉시 메뉴·동작·필드 반영; 판정은 can/visible/scopeFor만; 2계층 읽기(린트 강제); **React taint 2차 방어**; 우회 없음; staff 기본값 | ✓ VERIFIED (문서화된 편차 1) | `domain/permissions/{can,visible,scope-for,project}.ts`(행 없음 → false) · `matrix.ts`(can → upsert → recordAction) · `app/(app)/layout.tsx:24-29`가 `MENUS` 전체에 `can()`을 돌려 `allowedMenus`를 만들고 `ui/shell/role-menu.ts:86-91`이 그 목록으로만 관리자 진입점을 만든다(셸에 계급 분기 0) · 관리자 페이지 13개 전부 `can()` + `notFound()` · `eslint/rules/no-row-type-escape.mjs`(error) + boundaries · `test/e2e/permissions-grid.spec.ts` 실행 통과. **편차:** `taintObjectReference\|taintUniqueValue\|experimental_taint` 사용 **0건** — react@19.3.0 안정 채널에 없다(03-CONTEXT.md:49). 대체는 컴파일 타임 커스텀 린트 → Override 제안 |
| 3 | 누수 스캔 생성기: 액션×계급, DTO×계급, 내보내기×계급 자동 생성, CI 통합 계층, 미매핑 DTO 실패; **등록만 하면 검사가 따라온다** | ✓ VERIFIED (이전 PARTIAL → 닫힘) | 위 「미달 3」 절. `leak-scan.test.ts:41-74` 세 생성기 · `:105-109` 결정적 순서 · `:80-93` 세 축 전부 하한 단언 · `:112-123` 미매핑 정보 항목 실패 · `:95-103` DTO 없는 내보내기 예외 목록 강제. 실행 561 passed |
| 4 | 설정 키 typed registry 한 곳 + 자동 생성 화면; 미사용 키 테스트 실패; JSON 내보내기 → 빈 환경 가져오기 동일; 이력형 세율; 기준일·절사 시드; 로그인 잠금도 레지스트리 키 | ✓ VERIFIED | `domain/settings/keys.ts` 18키 · `app/(app)/admin/settings/page.tsx:37` `for (const def of SETTING_DEFS)`(키 하드코딩 0) · `test/unit/settings/registry-coverage.test.ts`(미참조 키 실패 · readBy 만료 강제) · `domain/auth/lockout.ts`가 실제 소비자 · `test/integration/settings-export.test.ts` 실행 통과(빈 환경 복원 동일 · 멱등 · 한 항목 실패 시 전부 미적용). 가져오기 진입점은 ADMN-06에서 닫혔다 |
| 5 | 거래처·법인카드·코드표를 관리 화면에서 **등록·수정·비활성화**; 증빙 종류 세금 규칙; 기본 증빙 종류; 계좌번호 AES-256-GCM `v1:`·뒤 4자리·해제 = 노출표 + 로그; 키 회전 + v1·v2 혼재 복호화 단위 테스트 | **⚠️ PARTIAL** | **충족:** 거래처 등록·수정(`b8628fc`)·숨김 3축 완비 · `domain/vendors/index.ts:300-303` 보관된 거래처 수정 차단 · `:215-232 planAccountNumberUpdate` · `:322-334` `keep`이면 두 컬럼 미변경 · `lib/crypto.ts`(aes-256-gcm, `v1:<iv>:<tag>:<ct>`) · `scripts/rotate-key.ts` · `test/unit/crypto.test.ts:118` v1·v2 혼재 · `domain/vendors/index.ts:376 revealAccountNumber`(visible → recordAction → decrypt 순서 고정) · `db/schema/corp-cards.ts` CHECK owner XOR + UNIQUE(issuer,last4) · `domain/code-tables/tax-rule.ts` 규칙 4종·절사·기준일. **미달:** ① 법인카드 「수정」 — `updateCorpCardOwnerAction` 호출자 0(gaps 1) ② 코드표 「수정」 — 값·라벨 수정 함수 없음(gaps 2). 세 마스터 중 **하나만** 동사 셋을 전부 갖췄다 |
| 6 | 핵심 행동만 로그(**로그인**·설정·권한·삭제·복원), Excel 내보내기·마스킹 해제는 끌 수 없음; 사람·기간·종류·문서 필터 + Excel + 관리자 정리; 삭제는 전부 보관함, 관리자만 복원 | ✓ VERIFIED (이전 PARTIAL → 닫힘) | `login` 기록 닫힘(미달 1, e2e 실측) · `domain/action-log/record.ts:10-29` CORE_ACTION_TYPES 18종(`document_update` 추가 — `b0b8886`) · `:60 ALWAYS_ON`(`keys.ts:49` enum 자체가 이 셋을 뺀다 → 끌 수 없음) · `:111-113` 목록 밖 종류는 예외 · `repositories/action-log.ts:80-98 markActionLogRowsPruned` 정리 = `pruned_at` 표시(물리 삭제 0) · `domain/archive/index.ts` archive/restore · `repositories/archive.ts` 7표. 실행: `action-log-query.test.ts`·`archive.test.ts`·`action-log.test.ts` 통과, `action-log.spec.ts`·`archive.spec.ts`·`archived-session.spec.ts` e2e 통과 |

**Score:** **5/6 성공 기준 완전 검증, 1/6 부분**(0 present-behavior-unverified — 행동 의존 진술은 전부 실제 실행으로 확인했다). 요구사항 기준 **12/13**.

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
| MAST-01 거래처 등록·수정·숨김·자동완성·암호화 | **MET** | **PARTIAL → MET** | 미달 2 닫힘 + `test/unit/vendors/account-number-plan.test.ts` 6건(M-5 계약) · `test/unit/vendors/update-archived.test.ts` 2건(보관·부재 → `ArchivedVendorError`) · `test/integration/vendors.test.ts` 18건. 자동완성 UI 소비자는 Phase 5·6 이월 |
| MAST-02 직원 등록 = 사람+계급+팀 | **MET** | 유지 | 성공 기준 1과 동일 |
| MAST-03 법인카드 마스터(개인/팀) | **MET** | 유지 | **요구사항 원문(`REQUIREMENTS.md:21`)은 「등록하고, 카드마다 소지자 또는 소속 팀을 지정한다」 — 「수정」을 요구하지 않으므로 충족이다.** `db/schema/corp-cards.ts` kind + CHECK(holder XOR team) + UNIQUE(issuer,last4) · `domain/corp-cards/index.ts cardOwnerKind`·`createCorpCard`(등록 시 소유 지정) · `card-form.tsx` 개인/팀 전환 · `test/integration/corp-cards.test.ts`(실행 통과). **ROADMAP 성공 기준 5의 「수정」은 별건으로 gaps 1에 있다** — 요구사항과 성공 기준을 나눠 적는다 |
| MAST-04 코드표 추가·**수정**·비활성화 | **⚠️ PARTIAL** | **MET → PARTIAL (판정 정정)** | 충족: `db/schema/code-tables.ts` UNIQUE(table_key,value) · `createCodeItem`·`setCodeItemActive` · `code-tables/page.tsx` 표 전환 + 비활성 표시 · `test/e2e/code-tables.spec.ts`(실행 통과). **미달: 「수정」** — `domain/code-tables/index.ts` 내보내기 4개에 값·라벨 수정이 없다. `setEvidenceTypeTaxRule`은 성공 기준 5의 별도 요구이고 `index.ts:129-131`이 `evidence_type` 외 표를 거부하므로 MAST-04가 이름을 든 견적 분류·지급 방식·프로젝트 상태에는 적용되지 않는다(gaps 2) |

**Orphaned requirements:** 없음 — REQUIREMENTS.md가 Phase 3에 매핑한 13개가 7 플랜의 `requirements:` 합집합과 정확히 일치한다.

### Key Link Verification

| From | To | Via | 이전 | 현재 | Details |
|---|---|---|---|---|---|
| `domain/auth/hooks.ts` 로그인 성공 | `recordAction(login)` | `after` 훅 `if (success)` | **NOT_WIRED** | **WIRED** | `hooks.ts:105-106`. 실패·잠금 경로와 분리(107행 `return`) |
| `vendor-form.tsx` | `updateVendorAction` | `useAction` + `execute` | **NOT_WIRED** | **WIRED** | `vendor-form.tsx:7·83·121`. 진입은 `page.tsx:148` `?editId=` |
| `settings-form-client.tsx` / CLI | `importSettings` | CLI 경로 채택 | **NOT_WIRED** | **WIRED (CLI)** | `scripts/settings-import.ts:78` + `package.json:27` |
| `leak-scan.test.ts` | `permissions`·`visibility` registry | side-effect import | **NOT_WIRED** | **WIRED** | `:31-32`. 재발 방지 `leak-scan-coverage.test.ts` |
| **`corp-cards/card-form.tsx`·`page.tsx`** | **`updateCorpCardOwnerAction`** | — | (미점검) | **NOT_WIRED** | 호출자 0 — **gaps 1** |
| **`code-tables/*`** | **코드표 항목 수정 함수** | — | (미점검) | **NOT_WIRED (대상 부재)** | `domain/code-tables`에 update 계열 함수 자체가 없다 — **gaps 2** |
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
| `corp-cards` 소유 변경 후 목록 | — | — | **경로 없음** | ✗ DISCONNECTED (gaps 1) |
| `code-tables` 값·라벨 수정 후 목록 | — | — | **경로 없음** | ✗ DISCONNECTED (gaps 2) |

### Behavioral Spot-Checks (이번에는 실제로 실행했다)

| Behavior | Command | Result | Status |
|---|---|---|---|
| 로그인이 행동 로그에 남는다 | `CI=true npx playwright test --project=desktop test/e2e/action-log.spec.ts -g "로그인이 행동 로그에 남는다"` | `1 passed (34.6s)` | ✓ PASS |
| 누수 스캔이 registry 9개를 전부 본다 | `npx vitest run --project integration test/integration/leak-scan.test.ts` | `561 passed` | ✓ PASS |
| 누락 import를 회귀 방어가 잡는다 | 검출 로직을 메모리에서 재현(파일 미수정) | `mutated → missing=["@/app/(app)/admin/visibility/actions.registry"]` | ✓ PASS |
| 설정 가져오기 CLI가 실행된다 | `node --import tsx scripts/settings-import.ts` | `--file <경로>가 필요합니다.` · exit **2** | ✓ PASS |
| M-5 계좌번호 계약 · 보관된 거래처 수정 차단 | `npx vitest run --project unit test/unit/vendors/…` | `19 passed`(4 files) | ✓ PASS |
| `app/` 아래 registry 파일 수 | `find app -name actions.registry.ts \| wc -l` | `9` (leak-scan import 수와 일치) | ✓ PASS |
| **법인카드 소유자 변경 액션의 화면 호출자 수** | `grep -rl updateCorpCardOwnerAction app/ ui/` | `actions.ts`·`actions.registry.ts` **뿐** — 화면 0 | **✗ FAIL (gaps 1)** |
| **코드표 항목 수정 함수 존재** | `grep -n "^export async function" domain/code-tables/index.ts` | `listCodeItems`·`createCodeItem`·`setCodeItemActive`·`setEvidenceTypeTaxRule` — update 없음 | **✗ FAIL (gaps 2)** |
| 거래처 수정 왕복(폼 경로) | — | 해당 e2e·통합 없음 | ? SKIP → human 3 |

### Probe Execution

해당 없음 — `scripts/*/tests/probe-*.sh` 없음, PLAN·SUMMARY에 probe 선언 없음.

### Test Quality Audit

| 항목 | 결과 |
|---|---|
| 총 실행 | 단위 581 · 통합 713 · e2e 110 = **1,404건 전부 통과**, 실패 0 · skip 0 · flaky 0 |
| **커버리지 공백** | **gaps 1·2는 테스트가 없다** — 법인카드 소유자 변경과 코드표 항목 수정은 화면 경로가 없으므로 실패할 테스트도 없다. 1,404 초록이 그 둘을 덮지 못한 이유다 |
| 약한 단언 | `leak-scan.test.ts:146` `Array.isArray(buildExportCases())` — 존재 수준. 같은 파일 92행의 `>= 2` 하한이 실질 방어를 맡고 146행은 vitest 빈-스위트 실패 방지 용도로 역할 분리(주석에 근거) |
| 약한 단언 | `test/unit/ui/admin-master-list-first.test.ts` — 소스 문자열 `toContain` 기반. 실제 DOM 판정은 `test/e2e/admin-master-list-first.spec.ts`(8건, 실행 통과)가 맡는다 |
| 약한 단언 | `test/unit/leak-scan-coverage.test.ts:52` — import 지정자의 소스 문자열 포함 여부. 주석 처리된 import는 통과한다(관찰) |
| 순환 테스트 | 발견되지 않음 |
| 새 회귀 방어 | `leak-scan-coverage`(2) · `settings-import-cli`(9) · `account-number-plan`(6) · `update-archived`(2) · `login-error`(9) · `archived-session`(통합+e2e) · `admin-master-list-first`(단위+e2e) · `role-menu` 확장 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` | 없음 | `app/`·`domain/`·`repositories/`·`lib/`·`ui/`·`scripts/`·`db/`·`eslint/`·`test/` 전수 0건(유일한 문자열 일치는 그 단어들을 **금지**하는 `test/unit/ui/system-md-compliance.test.ts:33`) |
| `app/(app)/admin/corp-cards/actions.ts` | 34-59 | 호출자 없는 서버 액션(죽은 배선) | 🛑 **Blocker** | **gaps 1**. 이전 검증이 `updateVendorAction`의 동일 상태를 blocker로 센 선례 |
| `domain/code-tables/index.ts` | — | 요구사항이 요구한 동작의 함수 자체가 없음 | 🛑 **Blocker** | **gaps 2** |
| `app/(app)/admin/settings/settings-form-client.tsx` | 235 | 사실이 아닌 안내 문구(CLI가 생긴 뒤 갱신 안 됨) | ⚠️ Warning | advisory 1 · human 5. 사용자가 advisory 유지 확인 |
| `app/(app)/admin/settings/actions.ts` | 52-54 | 같은 내용의 낡은 주석 | ℹ️ Info | 위와 같은 원인 |
| `app/(app)/admin/action-log/page.tsx` | 127-131 | 대상 칸에 엔티티 종류가 영문 원시 키(`vendor`·`code_items`)로 남는다 | ℹ️ Info | design-review A-M5 — 이월(승인 전 절) |
| `domain/**` | 다수 | `return null`/`[]` | ℹ️ Info | 전부 「없음」 의미의 정당한 반환. 스텁 아님 |

**증거 게이트 적용(`#3304`):** 위 두 🛑는 Step 7의 자유 판단이 아니라 **Step 3(성공 기준 5) · Step 5(핵심 배선) 판정**이고, 게이트 자신이 「진리·산출물·핵심 배선(Steps 3-6)은 이 실패 모드를 만들 수 없다」며 적용 범위를 Step 7로 한정한다. 또한 둘 다 결정적 증거(호출자 0 / 함수 부재, 위 spot-check의 명령·출력)를 갖는다.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | 설정 화면 문구가 「가져오기는 통합 테스트로만 제공됩니다」로 남아 있다 | other | 요구사항 ADMN-06은 CLI로 충족. 동작 영향 0, 한 줄 수정 — 사용자가 advisory 유지를 명시적으로 확인했다(human 5) |
| 2 | ROADMAP `Mode: mvp`인데 goal이 User Story가 아님 | other | 검증 방식 선택 문제이지 코드 결함이 아님 |
| 3 | React taint 2차 방어 미구현(사용 0건) | architectural | react 안정 채널에 API 없음 — 대체 구현(커스텀 린트)이 실재하고 error로 강제된다. Override 수락 또는 ROADMAP 문구 갱신 필요(human 6) |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | 거래처 자동완성 UI 소비자 | Phase 5 · Phase 6 | ROADMAP Phase 3 성공 기준 5 원문 |
| 2 | 전 메뉴 대상 권한·노출·행동 로그 검수 | Phase 7 | ROADMAP Phase 7 성공 기준 5 + Phase 3 goal 본문 |
| 3 | 관리자 폼 7개 §6-3 이관 (A-H2·A-H3) | Phase 4(제작) · Phase 7(이관) | ROADMAP Phase 7 성공 기준 5에 명문화(`977bd40`). **gaps 1·2가 새로 만드는 폼도 이 이관 대상에 들어간다** |
| 4 | 폰 375 관리자 표(DOM 감사 2·6·7) · /review M-4 · L-1 · /cso R2·R3·R4·R5 | Phase 4 | `03-OPEN-ITEMS.md` 「Phase 4로 미루기로 한 것 (사용자 승인 2026-09-21)」 |
| 5 | design-review 나머지 23건 중 미승인 이월분 | Phase 4 · Phase 7 | `03-OPEN-ITEMS.md` — **사용자 승인 전임을 파일이 명시**한다 |

**이월 항목은 이 보고서에서 미달로 세지 않았다.** gaps 1·2는 이월 목록 어디에도 없다 — 미루기로 한 기록이 없는 항목이다.

### Human Verification Required

6건 — frontmatter `human_verification` 참조. 요약:

1. 스테이징 배포 Job 3단계(migrate → seed → account) 실제 로그 확인
2. Secret Manager `app-data-key-v1` 32바이트 확인
3. **거래처 수정 왕복 실측** — 계좌번호 칸을 비운 채 저장해도 암호문·뒤 4자리가 보존되는지
4. **결정(gaps 2 선행)** — 코드표 항목 수정에서 `value`까지 열 것인가, `label`만 허용할 것인가
5. **결정** — 설정 화면의 낡은 안내 문구를 지금 고칠 것인가
6. **결정** — React taint 편차를 override로 수락할 것인가, ROADMAP을 고칠 것인가

이전 보고서의 human 7건 중 넷은 닫혔다: Excel CSV 한글·마스킹 해제 기록(`03-OPEN-ITEMS.md` 「사람만 판정 가능한 것 (완료)」) · /review M-2 보관 사용자 세션(`373f282` + `archived-session.spec.ts` 실행 통과) · /review L-1(Phase 4 이월, 사용자 승인). 폰 375 격자는 DOM 감사 2·6·7과 함께 Phase 4 이월분에 흡수됐다.

### Override 제안

```yaml
overrides:
  - must_have: "React taint API가 2차 방어다 (성공 기준 2)"
    reason: "react@19.3.0 안정 채널에 experimental_taint가 없어(03-CONTEXT.md:49, 03-RESEARCH.md Pitfall 1) 컴파일 타임 커스텀 규칙 plant8/no-row-type-escape + boundaries로 대체. ROADMAP 문구 갱신 필요"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Gaps Summary

**이전 미달 4건은 전부 코드에서 닫혔고, 되돌아간 것은 없다.** 로그인은 성공 경로에서만 행동 로그에 남고(e2e 실측), 거래처 수정 화면이 생겼으며(보관된 거래처는 화면·도메인 두 겹에서 차단), 누수 스캔은 registry 9개를 전부 보고 하나라도 빠지면 단위 테스트가 빨개지며(재현 확인), 설정 가져오기는 `pnpm settings:import` CLI로 실행 가능하다. 게이트도 전부 직접 돌려 1,404건 초록을 확인했다.

**그러나 페이즈 목표를 완전히 달성하지는 않았다. 새 미달 2건이 있다 — 둘 다 이전 검증이 점검하지 않았거나 잘못 읽은 축이다.**

1. **법인카드를 화면에서 수정할 수 없다.** `updateCorpCardOwnerAction`이 정의·등록돼 있으나 호출자 0 — 이전 검증이 `updateVendorAction`의 완전히 동일한 상태를 미달로 세고 고쳤던 것과 **같은 결함 모양**이다. 요구사항 MAST-03 원문은 「지정」만 요구해 충족이지만, ROADMAP 성공 기준 5는 거래처·법인카드·코드표를 「등록·수정·비활성화」 한 동사구로 묶는다. 수정 범위는 `?editId=` 토글(vendors 선례) + 소유 전환이고, 보관·비활성 카드 차단은 화면이 아니라 도메인에서 판정해야 한다(`updateVendor:300-303` 선례 — 링크를 감추는 것만으로는 직접 진입을 막지 못한다는 것이 DOM 감사 실측이다).

2. **코드표 항목의 값·라벨을 고칠 수 없다.** MAST-04 원문은 「추가·**수정**·비활성화」인데 `domain/code-tables`의 내보내기 넷에 수정이 없다. `setEvidenceTypeTaxRule`은 대체물이 아니다 — 성공 기준 5의 별도 요구이고, `index.ts:129-131`이 `evidence_type` 외 표를 거부해 MAST-04가 이름을 든 견적 분류·지급 방식·프로젝트 상태에는 적용조차 되지 않는다. 구현 전에 결정이 하나 필요하다: `value`는 `vendors.default_evidence_type`이 **FK 없이 문자열로** 참조하므로(`db/schema/vendors.ts:19`) 바꾸면 기존 거래처가 조용히 고아가 된다 — `label`만 여는 것이 안전한 최소다.

두 미달은 작고 국소적이며 아키텍처 결함이 아니다. 기존 선례(vendors `?editId=` 토글 · `ArchivedVendorError` · `document_update` 기록)를 그대로 따르면 되고 신규 의존성이 필요 없다. 1,404건의 테스트가 이를 잡지 못한 이유도 분명하다 — **없는 기능에는 실패할 테스트가 없다.**

판정을 정정한 근거를 남긴다: 이 보고서의 초안은 미달 2를 「이전 검증도 같은 코드 상태를 MET로 적었으니 뒤집지 않는다」는 이유로 advisory에 두었다. 그 논리는 **이전 판정이 틀렸을 가능성을 배제**하므로 잘못이다. 검증자 진동 방지 규칙(`#3304`)은 같은 증거로 판정이 왔다 갔다 하는 것을 막을 뿐이고, 스스로 적용 범위를 Step 7 안티패턴 스캔으로 한정하며 「진리·산출물·핵심 배선은 이 실패 모드를 만들 수 없다」고 명시한다. 원문(`REQUIREMENTS.md:22` · ROADMAP 성공 기준 5)과 코드를 직접 대조해 나온 증거는 그 규칙으로 덮을 수 없다.

---

_Verified: 2026-09-21T09:27:05Z_
_Verifier: Claude (gsd-verifier) — 재검증 (이전: 2026-09-21T05:17:08Z, gaps_found 9/13)_
