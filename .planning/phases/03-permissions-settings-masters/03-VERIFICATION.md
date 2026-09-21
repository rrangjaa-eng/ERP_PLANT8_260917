---
phase: 03-permissions-settings-masters
verified: 2026-09-21T05:17:08Z
status: gaps_found
score: 9/13 must-haves verified
covered_digest: "v1:sha256:20524897339d4997d8b31e94538f5747ba428f98d2e215b1aae1f6980cc29e83"
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
  - ".planning/phases/03-permissions-settings-masters/03-DISCUSSION-LOG.md"
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
  - "app/(app)/admin/code-tables/evidence-type-fields.tsx"
  - "app/(app)/admin/code-tables/page.tsx"
  - "app/(app)/admin/corp-cards/actions.registry.ts"
  - "app/(app)/admin/corp-cards/actions.ts"
  - "app/(app)/admin/corp-cards/card-form.tsx"
  - "app/(app)/admin/corp-cards/page.tsx"
  - "app/(app)/admin/people/[id]/page.tsx"
  - "app/(app)/admin/people/[id]/person-detail-client.tsx"
  - "app/(app)/admin/people/actions.registry.ts"
  - "app/(app)/admin/people/actions.ts"
  - "app/(app)/admin/people/org/org-client.tsx"
  - "app/(app)/admin/people/org/page.tsx"
  - "app/(app)/admin/people/page.tsx"
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
  - "app/(app)/admin/visibility/actions.registry.ts"
  - "app/(app)/admin/visibility/actions.ts"
  - "app/(app)/admin/visibility/page.tsx"
  - "app/(app)/layout.tsx"
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
  - "docs/OPERATIONS.md"
  - "domain/action-log/export.ts"
  - "domain/action-log/filter-keys.ts"
  - "domain/action-log/index.ts"
  - "domain/action-log/record.ts"
  - "domain/archive/index.ts"
  - "domain/auth/accounts.ts"
  - "domain/auth/hooks.ts"
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
  - "test/e2e/permissions-grid.spec.ts"
  - "test/integration/leak-scan.test.ts"
  - "test/integration/settings-export.test.ts"
  - "test/integration/visibility.test.ts"
  - "test/unit/crypto.test.ts"
  - "test/unit/deploy/cli-bundle.test.ts"
  - "test/unit/import-cycles.test.ts"
  - "test/unit/no-admin-boolean.test.ts"
  - "test/unit/settings/registry-coverage.test.ts"
  - "ui/history-list/HistoryList.tsx"
  - "ui/permission-grid/PermissionGrid.tsx"
  - "ui/shell/role-menu.ts"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 8
  total: 8
  not_honored: []
gaps:
  - truth: "성공 기준 6 · OPS-05 — 「로그인·설정 변경·권한 변경·삭제·복원 같은 핵심 행동만 행동 로그에 남는다」 중 로그인이 행동 로그에 남지 않는다"
    status: partial
    reason: "`domain/action-log/record.ts`의 CORE_ACTION_TYPES에 `login`이 선언돼 있지만 리포 어디에서도 `recordAction(..., { actionType: \"login\" })`을 부르지 않는다. 로그인 결과는 Phase 1의 `login_attempts` 표(잠금 판정용)에만 남고 `action_log`에는 0행이다. 행동 로그 화면의 종류 필터에 「로그인」이 보이지만 절대 걸리는 행이 없다."
    artifacts:
      - path: "domain/auth/hooks.ts"
        issue: "`after` 훅이 `recordAttempt`(login_attempts)만 부르고 성공 시 `recordAction`을 부르지 않는다"
      - path: "domain/action-log/record.ts"
        issue: "`login` 종류가 선언만 되고 기록 경로가 없다(선언과 구현의 불일치)"
    missing:
      - "`domain/auth/hooks.ts` after 훅의 `if (success)` 분기에서 `recordAction({ id: <userId>, roleId }, { actionType: \"login\" })` 호출 — actorId는 `ctx.context.newSession.user.id`로 확정"
      - "통합 테스트: 로그인 성공 후 `action_log`에 `login` 행이 1개, 실패·조회에는 0개(잡음 없음)"
  - truth: "성공 기준 5 · MAST-01 — 「거래처·클라이언트를 등록·수정하고」 중 거래처 수정이 화면에 없다"
    status: partial
    reason: "03-06-PLAN.md:408이 「거래처 등록·수정 폼(vendor-form.tsx)」을 약속했으나 `vendor-form.tsx`는 `createVendorAction`·`setVendorHiddenAction`·`archiveVendorAction`만 import한다. `updateVendorAction`(actions.ts:32)과 `domain/vendors.updateVendor`는 존재하지만 어떤 화면도 부르지 않는 죽은 배선이고, 03-REVIEW M-5(빈 문자열을 계좌번호 지우기로 해석)가 그 액션에 잠복해 있다."
    artifacts:
      - path: "app/(app)/admin/vendors/vendor-form.tsx"
        issue: "등록 폼만 있고 기존 거래처를 수정하는 진입점(행 편집·수정 폼)이 없다"
      - path: "app/(app)/admin/vendors/actions.ts"
        issue: "`updateVendorAction`이 등록·노출됐지만 호출자가 0개 — 동시에 `accountNumber: z.string().optional()`이 `\"\"`를 통과시켜 저장된 계좌번호를 지운다(M-5)"
    missing:
      - "거래처 행의 「수정」 진입점 + 수정 폼(이름·사업자 번호·기본 증빙 종류·은행·예금주·커스텀 필드; 계좌번호는 「변경 시에만 입력」)"
      - "M-5 계약 수정: `accountNumber: z.string().nullable().optional()` — `undefined`=안 바꿈, `null`=지우기, 비어 있지 않은 문자열=교체"
      - "E2E: 수정 후 목록 반영 + 계좌번호 칸을 비워 둔 채 제출해도 암호문·뒤 4자리가 보존됨"
  - truth: "성공 기준 3 · ADMN-03 — 「이후 페이즈는 액션·DTO·내보내기 함수를 등록만 하면 검사가 따라온다」가 액션 축에서 문자 그대로 성립하지 않는다"
    status: partial
    reason: "`test/integration/leak-scan.test.ts`는 등록을 트리거하기 위해 `actions.registry.ts` 파일을 명시적 side-effect import로 나열한다(7개). 현재도 `app/(app)/admin/permissions/actions.registry.ts`와 `app/(app)/admin/visibility/actions.registry.ts` 두 개가 빠져 `setPermissionCellAction`·`setVisibilityCellAction`이 스캔 밖이다(03-SECURITY R1이 동일 지적). 또 내보내기 축은 `Array.isArray(EXPORT_REGISTRY)`만 단언해 두 등록(`settings.export`·`action-log.export`)이 모두 사라져도 초록이다. 새 페이즈가 새 `actions.registry.ts`를 만들면 테스트 파일도 함께 고쳐야 검사가 따라온다 — 「등록만 하면」이 아니라 「등록 + 테스트 import 추가」다."
    artifacts:
      - path: "test/integration/leak-scan.test.ts"
        issue: "registry import 목록이 수동 유지(9개 중 7개)이고 EXPORT_REGISTRY 길이 하한이 없다"
    missing:
      - "`app/(app)/admin/**/actions.registry.ts`를 glob으로 발견해 전부 import하는 로더(또는 `import.meta.glob` 대체 — vitest에서 `fs.readdirSync`로 파일 목록을 만들어 동적 import) + 「발견된 registry 파일 수 ≥ 디렉터리 수」 단언"
      - "`expect(EXPORT_REGISTRY.length).toBeGreaterThanOrEqual(2)` — 03-04·03-07이 등록한 두 항목이 실재함을 고정"
      - "누수 스캔 파일 머리 주석의 「내보내기 축은 이 플랜 시점엔 0개가 정상」 문구 갱신(현재 2개)"
  - truth: "ADMN-06 — 「설정을 JSON으로 내보내고 빈 환경에 가져온다」 중 가져오기를 운영자가 실행할 진입점이 없다"
    status: partial
    reason: "`domain/settings/export.ts:importSettings`(전 항목 선검증 → 한 트랜잭션, 멱등)와 `test/integration/settings-export.test.ts` (a)(b)(c)가 동작을 증명한다. 그러나 화면(`settings-form-client.tsx`)에는 내보내기 버튼만 있고, `settings/actions.ts`에 import 액션이 없고, `package.json`에 CLI 스크립트도 없다. 03-04-SUMMARY.md:280과 `actions.ts:50-54`가 「가져오기 화면은 이 페이즈 화면 범위 밖」이라고 의도적 미구현을 기록했지만, CLI 대체 경로도 만들지 않아 운영자는 코드를 쓰지 않고는 빈 환경에 설정을 가져올 수 없다."
    artifacts:
      - path: "app/(app)/admin/settings/settings-form-client.tsx"
        issue: "내보내기만 있고 가져오기 진입점이 없다(문서화된 의도적 미구현)"
      - path: "package.json"
        issue: "`db:seed`·`db:rotate-key`와 같은 결의 `settings:import` CLI 스크립트가 없다"
    missing:
      - "최소 경로: `scripts/settings-import.ts`(SYSTEM_VIEWER, stdin 또는 파일 경로 인자) + `pnpm settings:import` + `docs/OPERATIONS.md` 절차 한 줄 — 신규 의존성 0"
      - "또는 아래 「Override 제안」대로 화면·CLI 모두 뒤 페이즈로 미루는 결정을 명시적으로 수락"
deferred:
  - truth: "MAST-01 — 「입력 시 자동완성된다」의 화면 소비자"
    addressed_in: "Phase 5 · Phase 6"
    evidence: "ROADMAP Phase 3 성공 기준 5 원문: 「거래처마다 기본 증빙 종류를 두어 Phase 5·6의 지출결의·카드 사용 등록 때 자동으로 채워진다」 — 자동완성이 붙는 입력 화면은 Phase 5(지출결의 한 화면)·Phase 6(법인카드 사용 등록)이다. `domain/vendors.searchVendors`(NFC 정규화·점수 정렬·동명 둘 다 반환)는 이 페이즈에 있고 `test/integration/vendors.test.ts`가 증명한다. 현재 `app/`·`ui/`에 호출자 0개."
  - truth: "성공 기준 2·6 — 「전체 메뉴 대상 검수는 Phase 7 끝에서 한다」"
    addressed_in: "Phase 7"
    evidence: "ROADMAP Phase 7 goal: 「권한·정보 노출·행동 로그를 전 메뉴 기준으로 검수한다」. 이 페이즈는 자기 메뉴 15개(`domain/permissions/menus.ts`)와 자기 액션만 검증한다 — 로그인 로그 누락(위 gaps 1)은 이 페이즈 자신의 인증 훅에 대한 것이라 이월하지 않았다."
advisory:
  - finding: "MVP 모드 불일치 — ROADMAP Phase 3이 `Mode: mvp`인데 goal이 User Story 형식(「As a …, I want to …, so that ….」)이 아니다 (`gsd_run query user-story.validate` → valid: false, 오류 3건)"
    category: other
    reason: "verify-mvp-mode.md 규칙상 「/gsd mvp-phase 3으로 goal을 재작성하라」고 되돌려야 하나, 이 페이즈의 goal은 성공 기준 6개로 충분히 구체적이어서 표준 goal-backward 검증으로 진행했다. 사용자가 MVP 모드를 의도한 것이 아니면 ROADMAP의 `Mode: mvp`를 지우는 것이 맞다."
    evidence_status: "none provided"
human_verification:
  - test: "스테이징 배포 후 `plant8-staging-seed` Job 로그에 `seed complete: roles=… permissions=45 visibility=34 …`가 찍히고, 시스템 관리자로 `/admin/permissions`에 들어가 격자가 체크된 상태로 보인다"
    expected: "격자 셀이 시스템 관리자 행 전부 체크(45칸)이고 404·빈 격자가 아니다. `/admin/system-status`·「더보기」의 시스템 상태 진입점도 보인다"
    why_human: "03-REVIEW C-1(시드 미실행 → 전면 잠금)과 순환 import(exit 13) 수정은 로컬 DB에 대해서만 실측됐다. Cloud Run Job 환경(외부 node_modules·커넥터·Secret)에서 번들이 같은 결과를 내는지는 실제 배포에서만 확인된다"
  - test: "스테이징에서 `plant8-staging-account` Job으로 role-sysadmin 계정을 만들고 그 계정으로 로그인한다"
    expected: "Job이 exit 0으로 끝나고 계정이 생기며, 로그인 후 `/admin/**` 전부 진입 가능"
    why_human: "`createAccount`가 이제 `can(viewer,\"admin.people\",\"write\")`를 요구해 시드가 먼저 돌지 않으면 실패한다 — 파이프라인 순서(migrate → seed → account)가 실제 환경에서 지켜지는지는 배포 로그로만 확인된다"
  - test: "GCP Secret Manager의 staging·prod `app-data-key-v1` 값이 base64 32바이트인지 확인하고, 스테이징에서 거래처를 계좌번호와 함께 등록 → 「번호 보기」로 복호화가 된다"
    expected: "등록 성공, 목록에 `****-**-1234` 표시, 「번호 보기」 클릭 시 평문이 보이고 행동 로그에 `mask_reveal` 1행"
    why_human: "03-06-PLAN.md의 planner 지정 human-check. `lib/env.ts`가 키를 선택 문자열로 두어 값이 없어도 앱이 뜨므로 코드만으로는 시크릿 존재·길이를 판정할 수 없다(03-SECURITY T-03-41 수락의 전제)"
  - test: "행동 로그 화면에서 Excel 내보내기 → 내려온 `action-log-*.csv`를 Windows Excel에서 더블클릭으로 연다"
    expected: "한글이 깨지지 않고 열리며 열 머리글이 한국어 라벨이다"
    why_human: "UTF-8 BOM은 바이트 레벨 테스트(`test/unit/action-log/export.test.ts`)로 고정됐지만 실제 Excel의 인코딩 감지는 코드로 검증할 수 없다(03-07 옵션 A: xlsx 대신 CSV)"
  - test: "폰(375px)에서 권한표·정보 노출표를 연다"
    expected: "가로 스크롤 격자가 아니라 계급 선택 + 항목 목록으로 접히고, 체크박스 터치 목표가 44×44 이상이다"
    why_human: "e2e는 데스크톱 뷰포트에서 sticky 머리글까지만 회귀 고정했다. 축 접힘의 실제 사용성은 브라우저 QA(`/qa`) 대상이다"
  - test: "03-REVIEW M-2 결정 — 관리자가 사람을 「삭제」했을 때 그 사람의 기존 브라우저 세션이 어떻게 되어야 하는지"
    expected: "사용자 결정: (a) `lib/viewer.ts:getSession()`에 `archivedAt` 검사 추가(fail-closed, 권장) (b) 현 상태 수락(로그인 훅만 차단, 기존 세션은 만료까지 유지)"
    why_human: "코드 사실은 확정됐다(`lib/viewer.ts`는 roleId만 확인, `archivePerson`은 보관과 세션 만료가 서로 다른 권한으로 두 단계). 어느 쪽이 맞는지는 보안 정책 판단이다"
  - test: "03-REVIEW L-1 결정 — 행동 로그 메뉴 보기만 켜고 노출표 「행동 로그 상세」를 끈 계급이 화면에 들어갈 때"
    expected: "사용자 결정: 404 / 빈 상태 안내 / 현 상태(오류 화면) 수락"
    why_human: "두 게이트(D-35 독립)가 어긋나는 것이 설계인지 결함인지는 정책 판단이다"
---

# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) Verification Report

**Phase Goal:** 관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다. 메커니즘(판정 함수·리포지토리 행 필터 + DTO 투영·설정 레지스트리·누수 스캔 테스트 생성기·암호화 헬퍼·보관함·행동 로그)과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다.
**Verified:** 2026-09-21T05:17:08Z (브랜치 `claude/gsd-execute-phase-3-uofrn0`, HEAD `e7936b5`, main 대비 165 커밋 · 526 파일 · +50,165 −580)
**Status:** gaps_found
**Re-verification:** No — 최초 검증

## 검증 방법과 한계

- 코드·스키마·마이그레이션·테스트 파일을 직접 읽어 판정했다. SUMMARY의 서술은 증거로 쓰지 않았고, 인용한 경로는 전부 존재를 확인했다.
- **테스트를 실행하지 않았다.** 요청 조건(스테이징 배포 진행 중, 다른 프로세스가 테스트 DB 소유)에 따라 `pnpm test`·playwright·개별 vitest도 돌리지 않았다. 행동 의존 진술은 「그 행동을 단언하는 테스트가 존재한다」 + 요청자가 확정 사실로 준 게이트 결과(CI=true: lint·typecheck·lint:sql 0 · unit 528 · integration 692 · e2e 89 전부 초록)를 근거로 삼았다. 이 보고서에서 「테스트로 증명」이라 적은 곳은 그 뜻이다.
- 요청자가 준 확정 사실을 코드로 대조한 결과: **전부 일치한다.** 7 플랜 SUMMARY 존재, 4 DECISION-TASK1 파일 전부 「옵션 A」, `package.json` 의존성 집합이 main과 동일(순서만 바뀜 — 신규 의존성 0), 시드 Job 배선(`scripts/build-cli.mjs` 4 엔트리 + `scripts/deploy.sh:341·390·668` + `test/unit/deploy/cli-bundle.test.ts`), 순환 import 정적 가드(`test/unit/import-cycles.test.ts`), 03-REVIEW 10건 중 4건 수정 커밋 실재(`d9dde36`·`25c5aa1`·`e671ff4`·`8a781f3`) · 5건 열림 그대로, 03-SECURITY의 T-03-30 수정 커밋 `f8fdb44` 실재, SUMMARY에 적힌 커밋 해시 48개 전부 유효.
- **MVP 모드 불일치:** ROADMAP이 `Mode: mvp`인데 goal이 User Story 형식이 아니다(`user-story.validate` → valid: false). 규칙대로면 검증을 거절해야 하나, 성공 기준 6개가 충분히 구체적이어서 표준 goal-backward로 진행했다. 사용자가 판단할 일이라 advisory로 남긴다.

## Goal Achievement

### Observable Truths — ROADMAP 성공 기준 6개

| # | Truth (요약) | Status | Evidence |
|---|---|---|---|
| 1 | 사람 등록 + 계급 + 팀으로 입사자 추가, 계정·초기 비밀번호 같은 화면 발급; 계급은 데이터(추가·이름 변경); 팀 ⊂ 본부; 발령일 이력; 시점 소속 조회 | ✓ VERIFIED | `domain/people/index.ts:133-194` registerPerson(can → 계급·팀 존재·보관 검사 → createAccount → assignTeam, 실패 시 보상 보관 → recordAction) · `app/(app)/admin/people/person-form.tsx:25-51` tempPassword 1회 표시 · `domain/permissions/roles.ts` createRole/renameRole + `repositories/archive.ts` isProtected(시드 5종 보관 거부) · `db/schema/org.ts` teams.org_unit_id NOT NULL FK, team_memberships UNIQUE(user_id, effective_from) · `domain/org/index.ts:188` teamAtDate. 테스트: `test/e2e/people.spec.ts`(등록 → 초기 비밀번호 → 실제 로그인, PM 404) · `test/integration/people.test.ts` 9건(중복 이메일·팀 부재·발령 실패 보상) · `team-memberships.test.ts` 8건 · `test/unit/org/team-at-date.test.ts` |
| 2 | 권한표·노출표 체크 → 즉시 메뉴·동작·필드 반영; 판정은 can/visible/scopeFor만; 2계층 읽기(repositories 행 필터 + domain DTO 투영, 린트 강제); **React taint 2차 방어**; 우회 없음; staff 기본값 | ✓ VERIFIED (문서화된 편차 1) | `domain/permissions/can.ts`(roleId 없음·행 없음 → false) · `visible.ts`(행 없음 → false) · `scope-for.ts`(6 entity → menu) · `project.ts`(spec 순서·멱등) · `matrix.ts` setPermissionCell/setVisibilityCell(can + upsert + recordAction) · `eslint.config.mjs` boundaries(app↛repositories) + `plant8/no-row-type-escape`(`eslint/rules/no-row-type-escape.mjs`, 133줄 type-aware) + `plant8/repository-viewer-param` · `test/unit/no-admin-boolean.test.ts` 참조 0 · `domain/permissions/info-items.ts` staffDefault(새 정보 6종 false). 테스트: `test/e2e/permissions-grid.spec.ts:11-72`(셀 체크 → 다른 브라우저에서 임시 계급이 `/admin/code-tables` 200) · `test/integration/visibility.test.ts` (b)(c)(d). **편차:** 「React taint API가 2차 방어」는 구현되지 않았다 — `taintObjectReference|taintUniqueValue` 사용 0건. 03-CONTEXT.md:49(2026-09-20 정정)가 「react@19.3.0 안정 채널에 experimental_taint 0건 → 쓸 수 없음, 커스텀 lint로 대체」를 기록. ROADMAP 문구는 갱신되지 않았다 → 아래 Override 제안 |
| 3 | 누수 스캔 생성기: 액션×계급, DTO×계급, 내보내기×계급 자동 생성, CI 통합 계층, 미매핑 DTO 실패; **등록만 하면 검사가 따라온다** | ⚠️ PARTIAL | 생성기는 실재하고 세 축을 만든다(`test/integration/leak-scan.test.ts:39-72`, `it.each`) · 미매핑 필드는 `INFO_ITEMS.some(...)` 단언으로 실패 · 액션·DTO 축 빈 레지스트리 실패(`:78-84`) · DTO 10종·액션 39건·내보내기 2건 등록 확인. **결함:** (a) registry import가 수동 목록(9개 중 7개) — `permissions`·`visibility`의 `actions.registry.ts` 누락(03-SECURITY R1과 동일) (b) 내보내기 축 `Array.isArray`만 단언 — 2 등록이 사라져도 초록 (c) 새 registry 파일은 테스트 수정 없이 스캔되지 않는다 → 「등록만 하면」 미성립 |
| 4 | 설정 키 typed registry 한 곳 + 자동 생성 화면; 미사용 키 테스트 실패; JSON 내보내기 → 빈 환경 가져오기 동일 동작; 세율·면제·대납은 적용 시작일 이력형; 기준일·절사 시드; 로그인 잠금도 레지스트리 키 | ✓ VERIFIED | `domain/settings/keys.ts` SETTING_DEFS 18키(잠금 2 · 행동 로그 1 · 세율·면제·대납 6 이력형 · 기준일 2 · 절사 3 · 완료 강행 3 · 손익 1) · `app/(app)/admin/settings/page.tsx:37` `for (const def of SETTING_DEFS)`(키 하드코딩 0) · `test/unit/settings/registry-coverage.test.ts` readBy 없는 미참조 키 실패 + readBy 만료 강제 + 페이즈 실재 확인 · `domain/auth/lockout.ts:1-23` 잠금값을 레지스트리에서 읽음 · `domain/settings/registry.ts:68` `getSettingValue(def, {asOf})` 경계 포함·fail-closed, `docs/ARCHITECTURE.md:76-80`에 계약 기록 · `db/schema/settings.ts` UNIQUE(key, effective_from). 테스트: `test/integration/settings-export.test.ts` (a) 빈 환경 복원 동일 (b) 멱등 (c) 한 항목 실패 시 전부 미적용 · `settings.test.ts` 11건 · `test/e2e/settings.spec.ts`(저장 버튼 없이 즉시 반영, 예정 태그, PM 404). 가져오기 **진입점** 부재는 ADMN-06에서 다룬다 |
| 5 | 거래처(숨김·자동완성)·법인카드(개인/팀)·코드표 관리; 증빙 종류 세금 규칙 필드; 거래처 기본 증빙 종류; 계좌번호 AES-256-GCM `v1:` 앱단 암호화, 뒤 4자리, 마스킹 해제 = 노출표 항목 + 로그; 키 회전 스크립트 + v1·v2 혼재 복호화 단위 테스트 | ⚠️ PARTIAL | `lib/crypto.ts`(aes-256-gcm, `v1:<iv>:<tag>:<ct>`, 키 없음·길이 틀림 즉시 예외, highestAvailableVersion) · `scripts/rotate-key.ts` rotateKey(멱등, 두 키 필수) · `test/unit/crypto.test.ts:118` v1·v2 혼재 복호화 · `domain/vendors/index.ts:293-311` revealAccountNumber(visible → recordAction → decrypt 순서) · `db/schema/vendors.ts` account_number_encrypted/last4, default_evidence_type · `db/schema/corp-cards.ts` CHECK owner XOR + UNIQUE(issuer, last4) · `domain/code-tables/tax-rule.ts` 규칙 4종·절사 단위 1/10·방식 3·최소 징수액·기준일 4종 · `app/(app)/admin/code-tables/evidence-type-fields.tsx` 편집 UI · `domain/seed/index.ts` 증빙 종류 7종 시드. 테스트: `test/e2e/vendors.spec.ts`(등록 → 마스킹 → 해제·가리기 → 숨김 → 권한 없는 계급 버튼 부재 → 404) · `vendors.test.ts` 16건(평문 컬럼 없음, NFC) · `corp-cards.spec.ts` · `code-tables.spec.ts`. **결함:** 거래처 **수정** 화면 없음(03-06-PLAN.md:408 약속) — `updateVendorAction` 호출자 0. 자동완성 UI 소비자 0(Phase 5·6로 이월, deferred) |
| 6 | 핵심 행동만 로그(**로그인**·설정·권한·삭제·복원), Excel 내보내기·마스킹 해제는 끌 수 없음; 사람·기간·종류·문서 필터 + Excel + 관리자 정리; 삭제는 전부 보관함, 관리자만 복원 | ⚠️ PARTIAL | `domain/action-log/record.ts` CORE_ACTION_TYPES 17종, ALWAYS_ON 3종(설정 조회 전에 기록), 목록 밖 종류는 예외 · `repositories/action-log.ts:85-98` 정리 = pruned_at 표시(물리 삭제 없음) · `domain/action-log/index.ts:227-242` 정리 자체를 `action_log_prune`으로 기록 · `domain/archive/index.ts` archive/restore(can admin.archive write + recordAction) · `repositories/archive.ts` ARCHIVABLE_TABLES 7표 · 여섯 마스터 화면의 「삭제」가 `DeleteToArchive`로 배선, 문구 `delete-to-archive.tsx:49` 「보관함으로 이동합니다 · 관리자가 복원할 수 있습니다」 · `domain/auth/hooks.ts:60-64` 보관된 사용자 로그인 거부(타이밍 채널 방어 포함). 테스트: `test/e2e/action-log.spec.ts`(필터 → 0건 → 내보내기 → 정리 2단계 → 정리 기록 → 404) · `archive.spec.ts` · `action-log-query.test.ts` 9건 · `archive.test.ts` 8건. **결함:** `login`이 CORE_ACTION_TYPES에 선언만 되고 기록 경로 0 — `hooks.ts` after 훅은 `login_attempts`만 쓴다 |

**Score:** 3/6 성공 기준 완전 검증, 3/6 부분 (0 present-behavior-unverified — 행동 의존 진술은 전부 이름 있는 테스트가 존재하고 게이트가 초록이다)

### Requirements Coverage — Phase 3 소유 13건

| Requirement | Source Plan | Description (요약) | Status | Evidence |
|---|---|---|---|---|
| ADMN-01 | 03-01·02·03 | 권한표: 계급 × 메뉴 × 동작(보기/쓰기/승인) 체크박스 | **MET** | `db/schema/permissions.ts` permission_matrix UNIQUE(role, menu, action) · `domain/permissions/can.ts` · `matrix.ts` readPermissionGrid/setPermissionCell(자기 잠금 가드 T-03-18) · `app/(app)/admin/permissions/page.tsx` + `ui/permission-grid/PermissionGrid.tsx`(일괄 저장 버튼 없음, 열 머리글 토글) · `test/e2e/permissions-grid.spec.ts` 4건 · `test/unit/permissions/can.test.ts` · `test/unit/ui/permission-grid-resync.test.ts`(M-1 회귀) |
| ADMN-02 | 03-01·03 | 정보 노출표: 계급 × 정보 항목; 기획본부 기본 인트라넷 수준, 새 정보 기본 숨김 | **MET** | `db/schema/permissions.ts` visibility_matrix UNIQUE(role, item) · `domain/permissions/visible.ts` · `info-items.ts` 17항목(ADMN-02가 이름 붙인 손익·팀 비용·목표·인센티브·거래처 금액·계좌 마스킹 해제 6종 staffDefault=false) · `domain/seed/index.ts:135-150` role-pm 시드 = staffDefault · `app/(app)/admin/visibility/page.tsx` · `test/integration/visibility.test.ts` 4건 · `test/unit/permissions/visible.test.ts` |
| ADMN-03 | 03-02·03 | 화면·API·Excel·자동완성·검색 동일 적용(우회 없음); 강제 지점은 리포지토리 viewer 투영; 누수 테스트 자동 생성; 미매핑 DTO 실패 | **PARTIAL** | 강제: `project()`가 domain 유일 출구, `plant8/no-row-type-escape`(`*Row` 반환 금지, `test/unit/eslint-rules/no-row-type-escape.test.ts` 10 fixture) + boundaries · 자동완성 `searchVendors`·내보내기 `exportActionLog`가 같은 DTO spec 통과 · DTO 10종 `registerDto`. **미달:** 누수 스캔의 registry import 수동 목록(2/9 누락), 내보내기 축 하한 없음 → 성공 기준 3 항목 참조. 참고: 규칙은 이름 패턴 `/Row$/` 기반(03-RESEARCH 「규칙의 한계」에 기록) |
| ADMN-05 | 03-04 | 설정 키 레지스트리 한 곳 + 화면 자동 생성; 서버가 읽는지 테스트 강제 | **MET** | `domain/settings/keys.ts`·`registry.ts` · `app/(app)/admin/settings/page.tsx:37` 자동 생성 · `test/unit/settings/registry-coverage.test.ts`(미참조 키 실패 · readBy 만료 강제 · readBy 페이즈 실재) · `domain/auth/lockout.ts` 실제 소비자 · `test/e2e/settings.spec.ts` |
| ADMN-06 | 03-04 | 설정을 JSON으로 내보내고 빈 환경에 가져온다 | **PARTIAL** | 내보내기: `exportSettingsAction` + 화면 버튼(`settings-form-client.tsx:217-231`, `excel_export` 로그, `EXPORT_REGISTRY` 등록) · 가져오기: `domain/settings/export.ts:80 importSettings`(선검증 → 트랜잭션) + `test/integration/settings-export.test.ts` (a)(b)(c). **미달:** 가져오기 진입점(화면·액션·CLI) 0 — 03-04-SUMMARY.md:280·`settings/actions.ts:50-54`가 화면 미구현을 의도로 기록했으나 대체 경로도 없다 |
| ADMN-08 | 03-01·05 | 계급 종류 추가·이름 변경(데이터) | **MET** | `db/schema/roles.ts`(name UNIQUE, is_seed) · `domain/permissions/roles.ts` createRole/renameRole(NFC 정규화 `role-name.ts`) · `app/(app)/admin/people/roles/roles-client.tsx`(create·rename·archive 액션) · 시드 5종 보관 거부 `repositories/archive.ts:63-65` · `test/integration/roles.test.ts` · `test/e2e/roles.spec.ts` · `test/unit/people/change-person-role.test.ts`(보관된 계급 배정 거부, T-03-30) |
| ADMN-10 | 03-07 | 대표·경영관리·관리자가 핵심 로그를 사람·기간·종류·문서로 걸러 Excel 내보내기; 어떤 행동을 남길지 설정; 열람은 노출표 | **MET** | `app/(app)/admin/action-log/page.tsx:32` can + `filter-bar.tsx` 필터 6 입력 · `domain/action-log/index.ts` queryActionLog(`visible(action_log.detail)` 게이트, 양끝 포함 기간, seq 보조 정렬) · `export.ts` UTF-8 BOM CSV(`excel_export` 기록 후 직렬화) · `pruneActionLog` · `domain/settings/keys.ts:47 action_log.optional_types`(끌 수 없는 종류는 enum 밖) · `test/e2e/action-log.spec.ts` 2건 · `action-log-query.test.ts` 9건 · `test/unit/action-log/{filter,export}.test.ts`. 주의: 03-REVIEW L-1(메뉴 게이트와 노출 게이트 불일치 → 500) 열림 |
| ADMN-12 | 03-01·07 | 삭제는 보관함으로; 관리자만 보고 복원; 삭제·복원 로그 | **MET** | `domain/archive/index.ts` archive/restore/listArchive · `repositories/archive.ts` 7표 + 조건부 UPDATE(멱등·경합) · `app/(app)/admin/archive/{page,archive-table}.tsx` 복원 · 여섯 화면 `DeleteToArchive` 배선(code-tables·people·roles·org·corp-cards·vendors) · `domain/auth/hooks.ts` 보관 사용자 로그인 거부 · `test/integration/archive.test.ts` 8건(동시 보관·복원) · `test/e2e/archive.spec.ts` · `test/unit/archive-revalidate.test.ts`(L-2 회귀). 주의: 03-REVIEW M-2(archivePerson 비원자 + 세션이 archivedAt 미확인) 열림 — human_verification 6 |
| OPS-05 | 03-01·06·07 | 핵심 행동만(로그인, 문서 생성·제출·승인·반려·회수·삭제, 지급·구매, 설정·권한 변경, 민감 정보 열람); 잡음 없음; 관리자 정리; Excel·마스킹 해제는 끌 수 없음 | **PARTIAL** | `domain/action-log/record.ts` 17종 정본 · 조회·화면 이동은 recordAction 자체를 부르지 않음(코드표 목록 조회 경로 확인) · ALWAYS_ON 3종 fail-open 기록 · 정리 = 표시(`pruned_at`). **미달:** `login` 기록 0 — 성공 기준 6 항목 참조 |
| MAST-01 | 03-06 | 거래처·클라이언트 등록·**수정**, 미사용 숨김, 자동완성, 계좌번호 앱단 암호화·뒤 4자리·마스킹 해제 노출표, 기본 증빙 종류 | **PARTIAL** | 등록·숨김·암호화·마스킹·해제·기본 증빙 종류: `domain/vendors/index.ts` 전체 + `app/(app)/admin/vendors/{page,vendor-form,account-number}.tsx` + `test/e2e/vendors.spec.ts` + `vendors.test.ts` 16건. 「클라이언트」는 별도 엔티티 없이 `vendors` 한 표로 다룬다(계획·스키마 일관). **미달:** 수정 화면 없음(gaps 2) · 자동완성 UI는 Phase 5·6 소비자로 이월(deferred) |
| MAST-02 | 03-05 | 직원 등록 = 사람 + 계급 + 팀; 코드 수정 없음; 팀 ⊂ 본부; 발령일 이력; 사용일 시점 소속 | **MET** | 성공 기준 1 증거와 동일. `db/schema/org.ts` teams.org_unit_id NOT NULL · team_memberships(user_id, effective_from) UNIQUE · `domain/org/index.ts:188 teamAtDate` null 반환(기본 팀 없음) · `cancelFutureAssignment` 미래만 취소 · `app/(app)/admin/people/[id]/person-detail-client.tsx` HistoryList(적용 중/예정 태그) |
| MAST-03 | 03-05 | 법인카드 마스터: 개인/팀, 소지자 또는 소속 팀 | **MET** | `db/schema/corp-cards.ts` kind + CHECK(holder XOR team) + UNIQUE(issuer, last4) · `domain/corp-cards/index.ts` cardOwnerKind·createCorpCard·updateCorpCardOwner(H-1 수정 `d9dde36`으로 kind 동기화) · `app/(app)/admin/corp-cards/card-form.tsx` 개인/팀 전환 · `test/e2e/corp-cards.spec.ts` · `test/integration/corp-cards.test.ts` · `test/unit/corp-cards/owner-rule.test.ts`. 참고: 03-SECURITY R5(create 액션 스키마에 XOR superRefine 없음 — 도메인·DB CHECK는 강제) |
| MAST-04 | 03-01·06 | 코드표(견적 대·소분류, 지급 방식, 프로젝트 상태 등) 관리 화면 추가·수정·비활성화 | **MET** | `db/schema/code-tables.ts` UNIQUE(table_key, value) · `domain/code-tables/index.ts` createCodeItem/setCodeItemActive(멱등) · `app/(app)/admin/code-tables/page.tsx` 표 전환(`project_status`·`evidence_type`) + 비활성 표시 + 세금 규칙 편집 · `domain/seed/index.ts` 프로젝트 상태 5종·증빙 종류 7종 시드 · `test/e2e/code-tables.spec.ts` · `test/integration/code-tables.test.ts`. 참고: 견적 대·소분류·지급 방식 표는 `table_key`만 다르면 같은 메커니즘이라 시드 없이도 등록 가능하나 화면의 표 선택지(`TABLE_OPTIONS`)는 현재 2종 — 새 표 종류를 추가하려면 상수 한 줄이 필요하다(Phase 4가 추가) |

**Orphaned requirements:** 없음 — REQUIREMENTS.md가 Phase 3에 매핑한 13개가 7 플랜의 `requirements:` 합집합과 정확히 일치한다.

### Required Artifacts (대표 항목)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `domain/permissions/{can,visible,scope-for,project}.ts` | 판정 4함수, 기본 거부 | ✓ VERIFIED | 30·23·50·36줄, deps 주입, 리포지토리 행 필터·DTO 투영 배선 |
| `domain/permissions/matrix.ts` | 격자 읽기·셀 저장 + 로그 | ✓ VERIFIED | 181줄, can → upsert → recordAction, 자기 잠금 가드(write만 — 03-SECURITY R3) |
| `test/integration/leak-scan.test.ts` | 3축 자동 생성, 미매핑 실패 | ⚠️ PARTIAL | registry import 7/9, 내보내기 하한 없음 |
| `eslint/rules/no-row-type-escape.mjs` | domain 출구 DTO 강제 | ✓ VERIFIED | type-aware, 유니언 갈래별 판정, 10 fixture 테스트, `pnpm lint`에 error로 등록 |
| `domain/settings/{registry,keys,export}.ts` | typed registry·이력형·JSON | ✓ VERIFIED | 18키, getSettingValue(def,{asOf}) fail-closed, import 트랜잭션 |
| `app/(app)/admin/settings/*` | 자동 생성 화면 + 내보내기 | ⚠️ 가져오기 진입점 없음 | 문서화된 의도적 미구현(03-04-SUMMARY:280) |
| `lib/crypto.ts` · `scripts/rotate-key.ts` | AES-256-GCM `v1:`, 회전 | ✓ VERIFIED | 12 단위 테스트(v1·v2 혼재 포함). `rotateKey()` 자체의 전용 테스트는 없다(관찰) |
| `domain/vendors/index.ts` + 화면 | 등록·수정·숨김·자동완성·마스킹 | ⚠️ PARTIAL | 수정 UI 없음, 자동완성 소비자 없음(이월) |
| `domain/action-log/{record,index,export}.ts` | 핵심 로그·필터·CSV·정리 | ⚠️ PARTIAL | login 기록 경로 없음 |
| `domain/archive/index.ts` · `repositories/archive.ts` | 보관·복원·7표 | ✓ VERIFIED | 물리 DELETE 0건(archivable 표 기준; settings·team_memberships의 미래 행 취소 삭제는 03-SECURITY R2가 재정의 대상으로 기록) |
| `domain/seed/index.ts` · `scripts/seed-master.ts` · `scripts/build-cli.mjs` · `scripts/deploy.sh` | 파생 시드 + Cloud Run Job | ✓ VERIFIED | C-1 수정 배선 확인, `cli-bundle.test.ts`·`deploy-sh.test.ts:297·417` 가드 |
| `db/migrations/0003~0008` | 스키마·백필·GIN·prune | ✓ VERIFIED | `0007:45-50` GIN 6개, `0004` FK VALIDATE 분리, journal 정합 |
| `docs/ARCHITECTURE.md` | 규약 기록(custom_fields·counters·유효값·암호화·정리) | ✓ VERIFIED | 69·76-80·92·104·116·123행 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `app/(app)/admin/*/page.tsx` (11) | `domain/permissions/can.ts` | `if (!(await can(viewer, menu, "view"))) notFound()` | WIRED | 11/11 페이지 확인(permissions·visibility는 domain `ForbiddenError` → notFound) |
| `app/(app)/layout.tsx` | `MENUS` × `can()` → `ui/shell/role-menu.ts` | allowedMenus 데이터 전달 | WIRED | 셸에 계급 분기 없음 |
| `ui/permission-grid` 셀 클릭 | `setPermissionCellAction` → `matrix.setPermissionCell` → `upsertPermission` | next-safe-action | WIRED | e2e가 다른 브라우저 컨텍스트에서 효과 확인 |
| `domain/*` 출구 | `project(viewer,row,spec)` | 전 list/get 함수 | WIRED | vendors·people·org·corp-cards·code-tables·roles·archive·action-log 확인 |
| `repositories/*` 행 필터 | `scopeFor(viewer, entity)` | `scope.rows === "none" → []`, `includeArchived` | WIRED (6/… ) | code_items·org_unit·team·user·corp_card·vendor. roles·settings·action_log·matrix는 can() 직접 게이트(scopeFor 미사용) — 설계상 허용 범위, 관찰 |
| `domain/auth/lockout.ts` | `domain/settings/registry.getSettingValue` | 잠금 임계값·창 | WIRED | 환경 변수는 default 출처로만 |
| `domain/action-log/record.ts` | `domain/settings/keys.ACTION_LOG_OPTIONAL_TYPES` | 동적 import(순환 회피) | WIRED | fail-open(조회 실패 시 기록) |
| `domain/vendors.revealAccountNumber` | `visible()` → `recordAction(mask_reveal)` → `decrypt()` | 순서 고정 | WIRED | 기록 실패 시 평문 미반환 |
| `domain/auth/hooks.ts` 로그인 성공 | `recordAction(login)` | — | **NOT_WIRED** | gaps 1 |
| `vendor-form.tsx` | `updateVendorAction` | — | **NOT_WIRED** | gaps 2 |
| `settings-form-client.tsx` / CLI | `importSettings` | — | **NOT_WIRED** | gaps 4 |
| `leak-scan.test.ts` | `permissions/actions.registry.ts`·`visibility/actions.registry.ts` | side-effect import | **NOT_WIRED** | gaps 3 |
| `scripts/deploy.sh:668 run_seed` | `dist/cli/seed-master.mjs` Job | `run_migrate` 뒤 | WIRED | 실기기 확인은 human 1 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `permissions/page.tsx` | `grid.values` | `readPermissionGrid` → `listPermissions` DB | Yes | ✓ FLOWING |
| `settings/page.tsx` | 섹션·필드 | `SETTING_DEFS` × `getSettingValue`/`listSettingHistory` DB | Yes | ✓ FLOWING |
| `vendors/page.tsx` | `vendors[]`, `canReveal` | `listVendors`(scopeFor → DB → project), `visible()` | Yes | ✓ FLOWING |
| `people/[id]/page.tsx` | 발령 이력 | `listAssignments` DB | Yes | ✓ FLOWING |
| `action-log/page.tsx` | 행·필터 | `queryActionLog` DB(pruned_at IS NULL) | Yes | ✓ FLOWING |
| `archive/page.tsx` | 항목 | `listArchivedAcrossEntities` 7표 UNION | Yes | ✓ FLOWING |
| 행동 로그 「로그인」 필터 | 결과 | `action_log` where action_type='login' | **항상 0행** | ✗ DISCONNECTED (gaps 1) |

### Behavioral Spot-Checks

실행하지 않음(요청 조건: 스테이징 배포 진행 중, 테스트 DB 타 프로세스 소유). 대신 존재 증명으로 대체:

| Behavior | Evidence (enumerated, not run) | Status |
|---|---|---|
| 셀 체크 → 다른 계급이 즉시 메뉴 진입 | `test/e2e/permissions-grid.spec.ts:11-72` | ? SKIP (게이트 초록 — 요청자 확정 사실) |
| 사람 등록 → 초기 비밀번호 → 실제 로그인 | `test/e2e/people.spec.ts:9` | ? SKIP (동일) |
| 계좌번호 평문 컬럼 없음, v1/v2 접두어 | `test/integration/vendors.test.ts:47` | ? SKIP (동일) |
| JSON 내보내기 → 빈 환경 가져오기 동일 | `test/integration/settings-export.test.ts:30` | ? SKIP (동일) |
| 시드 번들이 배포 진입점에 있다 | `test/unit/deploy/cli-bundle.test.ts` | ? SKIP (동일) |
| 관리자 불리언 참조 0 | `test/unit/no-admin-boolean.test.ts` | ? SKIP (동일) |

### Probe Execution

해당 없음 — `scripts/*/tests/probe-*.sh` 없음, PLAN·SUMMARY에 probe 선언 없음.

### Test Quality Audit (요약)

| 항목 | 결과 |
|---|---|
| 요구사항 연결 테스트 중 `skip`/`todo`/`only` | 확인 범위(leak-scan·visibility·settings·settings-export·people·team-memberships·vendors·archive·action-log-query·crypto·no-admin-boolean·import-cycles·cli-bundle·e2e 10 spec)에서 0건 |
| 순환 테스트(시스템 출력을 기대값으로 생성) | 발견되지 않음. `leak-scan`은 레지스트리 매핑 존재만 단언하고 값 정합성은 `visibility.test.ts`가 따로 증명 |
| 단언 강도 | 값·행동 수준(DB 라운드트립 후 컬럼 값, 다른 브라우저 컨텍스트에서 200/404) |
| 약한 단언 | `leak-scan.test.ts:86-88` `Array.isArray(EXPORT_REGISTRY)` — 존재 수준(gaps 3) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` | 없음 | domain·repositories·lib·app·ui·scripts·db·eslint 전부 0건 |
| `domain/**` | 12곳 | `return null/[]` | ℹ️ Info | 전부 「없음」 의미의 정당한 반환(찾지 못함·권한 없음·빈 조회). 스텁 아님 |
| `test/integration/leak-scan.test.ts` | 21-33 | 수동 import 목록 | ⚠️ Warning | gaps 3 |
| `domain/action-log/record.ts` | 11 | 선언만 된 `login` 종류 | ⚠️ Warning | gaps 1 |
| `app/(app)/admin/vendors/actions.ts` | 32-48 | 호출자 없는 서버 액션 + M-5 | ⚠️ Warning | gaps 2 |
| `lib/viewer.ts` | 27-37 | `archivedAt` 미확인(M-2) | ⚠️ Warning | human 6 |

### Scope Creep — 요구사항이 요청하지 않았는데 만든 것

| 항목 | 위치 | 판정 |
|---|---|---|
| 설정 키 `project.force_complete.*` 3개(readBy Phase 6), 손익 착수 키 1개(readBy Phase 9) | `domain/settings/keys.ts:191-221` 외 | 성공 기준 4의 열거 밖. 뒤 페이즈 선등록 — `registry-coverage.test.ts`의 readBy 만료 강제로 방치 위험은 막혀 있음. 무해하나 요청 밖 |
| 본부·팀 시드(기획본부/기획1팀, 경영관리본부/경영관리팀) | `domain/seed/index.ts:87-90` | PROJECT.md 실명 사용, 시드 데이터. 요청 밖이나 EMPTY 회피 목적, 무해 |
| `roles`·`org_units`·`teams`에도 `custom_fields` + GIN | `db/schema/*` | ROADMAP 「이후 페이즈의 모든 표가 이 규약을 따른다」 범위 안 — 창 아님 |
| Excel 내보내기 = UTF-8 BOM CSV(xlsx 아님) | `domain/action-log/export.ts` | 03-07-DECISION 옵션 A. ROADMAP 「Excel에서 바로 열리는」 충족 가정 — human 4로 실기기 확인 |
| 행동 로그 「정리」= `pruned_at` 표시(물리 삭제 아님) | `repositories/action-log.ts` | ADMN-10 「정리(수정·삭제)」의 해석. 근거를 `docs/ARCHITECTURE.md:116`에 기록. 창이라기보다 판단 — 수락 가능 |
| `document_counters`·`field_definitions` 표와 리포지토리 | `db/schema/*`, `repositories/*` | ROADMAP Phase 3 본문이 명시 요청(「핵심 스키마 규약을 여기서 정한다」) — 창 아님 |

### Decision Coverage

`check.decision-coverage-verify`: 8/8 honored — 03-CONTEXT.md의 추적 가능한 결정이 전부 산출물에 반영됐다.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | ROADMAP `Mode: mvp`인데 goal이 User Story가 아님 | other | 검증 방식 선택의 문제이지 코드 결함이 아님. 사용자가 `Mode`를 지우거나 `/gsd mvp-phase 3`으로 goal을 재작성 |

### Override 제안 (의도적 편차로 보이는 것)

아래 두 항목은 대체 구현·문서화된 결정이 있어 의도적 편차로 판단된다. 수락하려면 이 파일 frontmatter에 추가하고 재검증한다:

```yaml
overrides:
  - must_have: "React taint API가 2차 방어다"
    reason: "react@19.3.0 안정 채널에 experimental_taint가 없어(03-CONTEXT.md:49, 03-RESEARCH.md Pitfall 1) 컴파일 타임 커스텀 규칙 plant8/no-row-type-escape + boundaries로 대체. ROADMAP 문구 갱신 필요"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
  - must_have: "설정을 JSON으로 내보내고 빈 환경에 가져온다 (ADMN-06 가져오기 진입점)"
    reason: "가져오기 화면(파일 업로드)은 03-04가 화면 범위 밖으로 결정. 도메인 함수·통합 테스트로 동작은 증명됨. 운영 진입점(CLI)은 Phase N에서 추가"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

두 번째는 override보다 `scripts/settings-import.ts` 한 파일(신규 의존성 0)을 만드는 편이 싸다는 것이 이 보고서의 권장이다.

### Human Verification Required

7건 — frontmatter `human_verification` 참조. 요약: (1) 스테이징 시드 Job → 권한표 채워짐 (2) 스테이징 account Job → sysadmin 로그인 (3) Secret Manager 키 32바이트 + 실 복호화 (4) CSV가 실제 Excel에서 한글 정상 (5) 폰 375px 격자 축 접힘·터치 목표 (6) M-2 보관 사용자 잔존 세션 정책 결정 (7) L-1 게이트 불일치 정책 결정. 여기에 요청자가 이미 「미완」으로 둔 `/gsd-verify-work`의 대화형 UAT 절반과 `/qa` 브라우저 QA가 더해진다.

### Gaps Summary

페이즈 목표 — 「관리자가 코드 수정 없이 마스터·권한·설정을 화면에서 등록하고 이후 모든 화면·API가 그 위에 얹힌다」 — 의 **메커니즘은 세워졌고 실제로 배선되어 있다.** 판정 4함수, 권한표·노출표 격자, 린트 두 겹, 설정 레지스트리와 자동 화면, 암호화·마스킹·해제 로그, 보관함, 행동 로그, 파생 시드의 배포 배선까지 코드·스키마·테스트로 확인된다. 관리자 불리언 참조 0, 신규 의존성 0, 순환 import 정적 가드, 48 커밋 전부 실재.

**목표를 완전히 달성했다고는 할 수 없다.** 다음 네 가지가 코드에 없거나 절반만 있다 — 전부 작고 국소적이며, 아키텍처 결함은 없다:

1. **로그인이 행동 로그에 남지 않는다** (성공 기준 6·OPS-05가 첫 항목으로 명시). `login` 종류가 선언만 됐다. 수정은 `domain/auth/hooks.ts` after 훅 한 분기 + 통합 테스트 1개.
2. **거래처 수정 화면이 없다** (MAST-01·03-06-PLAN 약속). `updateVendorAction`은 죽은 배선이고 M-5가 그 안에 잠복. 수정 폼 + 계약 수정(`nullable().optional()`).
3. **누수 스캔이 「등록만 하면 따라온다」를 문자 그대로 만족하지 않는다** (성공 기준 3·ADMN-03). registry 2/9 누락 + 내보내기 하한 없음. 수정은 테스트 파일 하나(glob 로더 + 길이 단언).
4. **설정 가져오기의 운영 진입점이 없다** (ADMN-06). 화면 미구현은 문서화됐으나 CLI도 없다. 수정은 `scripts/settings-import.ts` + `pnpm settings:import` 또는 override 수락.

이월(정당): 거래처 자동완성 UI 소비자(Phase 5·6), 전 메뉴 권한·로그 검수(Phase 7). 열린 리뷰 항목 M-2·M-4·M-5·L-1·L-3과 보안 보강 R1~R5는 03-REVIEW.md·03-SECURITY.md의 기록과 코드 상태가 일치함을 확인했다 — 이 중 R1은 gaps 3, M-5는 gaps 2에 흡수됐고, M-2·L-1은 정책 결정이 필요해 human_verification으로 올렸다.

---

_Verified: 2026-09-21T05:17:08Z_
_Verifier: Claude (gsd-verifier)_
