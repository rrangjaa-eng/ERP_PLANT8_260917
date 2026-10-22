---
phase: 07-schedule-notify-audit
plan: 03
subsystem: 검수 틀 · 누수 스캔 · 계급 스모크 · 알림함 본인 범위 · 보관함 복원 게이트
tags: [NOTI-03, EXP-11, R1, R11, K31, G-58, SC5b, AQ-07, AQ-19, test-only]
status: complete
requires: []
provides:
  - test/e2e/role-smoke.spec.ts — ROLE_SMOKE 표(계급 × 경로 → open | 404), 07-05 · 07-25가 행을 더한다
  - test/unit/leak-scan-coverage.test.ts — registerDto( 모듈 ↔ 누수 스캔 import 대조
  - test/unit/export-registry-coverage.test.ts(신규) — 파일 만드는 모듈 ↔ registerExport( · 누수 스캔 import 대조
  - test/integration/leak-scan.test.ts — 런타임 DTO_REGISTRY ↔ domain `*Dto` 타입 대조(unmappedDtoTypes · DTO_TYPE_TO_REGISTRY_NAME · DTO_COVERAGE_EXEMPT)
  - test/integration/notify-inbox-own-scope.test.ts(신규) — 알림함 본인 범위(SC5b)
  - test/integration/admin-cap-restore.test.ts — 종류별 복원 게이트 줄
affects:
  - 07-01 · 07-05 · 07-19 · 07-20 · 07-25 (새 registerDto / registerExport / 화면이 이 대조에 걸린다)
tech-stack:
  added: []
key-files:
  created:
    - test/e2e/role-smoke.spec.ts
    - test/unit/export-registry-coverage.test.ts
    - test/integration/notify-inbox-own-scope.test.ts
  modified:
    - test/unit/leak-scan-coverage.test.ts
    - test/integration/leak-scan.test.ts
    - test/integration/admin-cap-restore.test.ts
    - domain/people/seat-rules.ts   # 제품 코드 한 줄 — 아래 「발견 1」
decisions:
  - "SeatDuplicatesDto는 면제가 아니라 등록(person.value ∧ team.value all-of) — listSeatDuplicates가 이미 두 항목으로 게이트하는 사람 이름 DTO"
  - "하위 타입(MoneyDto 등)은 면제가 아니라 대응 표 — 감싸는 등록 DTO로 덮인다고 보고 표에 적었다"
metrics:
  completed: 2026-10-21
actuals:
  tasks: 3
  commits: 3
plan_head_before: e3407821814d715b5d2ad37beaab6767ea7ef37b
---

# Phase 07 Plan 03: 검수 틀 (누수 스캔 대조 · 계급 스모크 · 알림함 본인 범위) Summary

시험만 바뀌는 무인 PR. 제품 코드는 `domain/people/seat-rules.ts`의 `registerDto` 한 줄(시험이 드러낸 누락 등록, 플랜 Task 2 ④가 허용)뿐이다. `domain/permissions/` · `db/` · `.github/` · `playwright.config.ts` 변경 없음.

## 만든 것

### Task 1 — 계급 스모크 E2E (`test/e2e/role-smoke.spec.ts`)
- `ROLE_SMOKE` 표 13행: 시스템 관리자(`/admin` · `/admin/action-log` · `/admin/permissions` · `/projects` 열림), 기획 PM(`/projects` 열림 · `/admin/action-log` · `/admin/permissions` 404), 팀장 · 본부 책임자 · 대표(`/projects` 열림 · `/admin/permissions` 404). 대표 `/admin/action-log`는 07-05(D-722)가 정하므로 행 없음.
- 계급마다 한 `test`(`createFixtureUser({ roleId, withTeam: true })` → 로그인 → 표의 경로마다 `page.goto` 응답 200/404). 표가 `SEED_ROLES` 다섯을 모두 덮는지 확인하는 테스트 하나 더.
- 파일명이 `mobile-*` · `*cert*` · 설정/증빙 목록에 걸리지 않아 desktop 프로젝트에 자동 편입(`playwright.config.ts` 변경 없음). 표의 기대값은 지금 시드의 실제 동작과 일치 — 어긋난 행 없음(발견 없음).

### Task 2 — 누수 스캔 대조
- `leak-scan-coverage.test.ts`: `app` · `domain`에서 `registerDto(`가 든 파일(시험 · `dto-registry.ts` 제외)의 import 지정자(`index.ts`는 폴더 지정자도 허용)가 `leak-scan.test.ts`에 있는지. **RED 확인: 9개 누락**(`action-log/index` · `approvals/dto` · `corp-card-usages/link-targets` · `evidence/dto` · `expenses/dto` · `expenses/pick` · `leave/dto` · `pre-settle-check/index` · `settlements/dto`) → `leak-scan.test.ts`에 import 9줄 추가로 GREEN. (AQ-19의 「12개 누락」은 낡은 기술이라는 가정과 달리 `registerDto`만 있는 모듈은 실제로 9개 빠져 있었다.)
- `export-registry-coverage.test.ts`(신규): `buildTextSheetXlsx` / `@/lib/csv` import 모듈 3개(`evidence-records/export` · `payments/bank-transfer` · `action-log/export`) 모두 `registerExport(` 있음 · 누수 스캔 import 있음.
- `leak-scan.test.ts` 런타임 describe: `DTO_REGISTRY.map(name)` ↔ `domain/**`의 `export type …Dto` 정규식 수집(FA-1). 규칙 4단(이름 그대로 · `Dto` 뗀 소문자 첫 글자 · 대응 표 · 이유 있는 면제). **RED 확인: 14개 미매핑** → 처리는 아래. 등록 `evidenceFile`을 뺀 목록에서 `EvidenceFileDto`가 잡히는 사례 · 죽은 대응/면제 0 · 면제 이유 필수 · `DTO_REGISTRY.length >= registerDto( 호출 지점 수`.
  - 대응 표 10: `CardOptionDto→CardUsageCardOptionDto` · `IssueRequestBoardDto→IssueRequestDto` · `PreSettleExpenseRowDto/PreSettleLineRowDto/PreSettleRevenueDto→PreSettleCheckDto` · `RevenueEntryDto→RevenueDto` · `CertSubmissionGroupDto→CertSubmissionReconcileDto` · `MoneyDto/MoneyInputDto→QuoteLineDto` · `SeatHolderDto→SeatDuplicatesDto`.
  - 면제 3(상한 3 이내, 전부 이유 문자열 있음): `FieldDefinitionAdminDto`(같은 파일 `MENU_GATED_DTOS` 축이 계급마다 덮음) · `FieldDefinitionDto`(거래처 폼 구조 메타데이터, 소스 주석이 `project()` 비경유 명시) · `GridDto`(권한/노출 격자 참·거짓, admin 메뉴 view 뒤).
  - 옛 `test/unit/dto-registry-coverage.test.ts`는 만들지 않았다(K31).
- 각 단위 사례 개별 판별 확인(each test discriminates): `domain/action-log/export` import 줄을 지우면 `export-registry-coverage`가, `domain/pre-settle-check` import 줄을 지우면 `leak-scan-coverage`가 해당 파일 이름을 대며 빨갛게 된 것을 손으로 확인 후 복구.

### Task 3 — 알림함 본인 범위 · 복원 게이트
- `notify-inbox-own-scope.test.ts`(신규, `SC5b` 머리 주석): A의 목록/안 읽은 수에 B 행 0 · A의 `openMyInbox`가 B의 안 읽은 수(3)와 read_at(null) 그대로 · B 행 `{createdAt,id}` 커서를 A의 `listMyNotifications`에 줘도 A 행만. 판별 확인: `openInbox`의 UPDATE에서 `recipient_id` 조건을 임시로 지우면 두 번째 사례가 빨갛게 된 것을 확인 후 복구(`repositories/notifications.ts` 변경 없음). 액션 3개 비등록(AQ-07)은 그대로 — `test/unit/action-registry-completeness.test.ts` 변경 없음.
- `admin-cap-restore.test.ts`: 「복원 상한」의 실체는 종류별로 다르다 — 계급 지정 상한(`assertCanGrantRoles`)은 사람 종류에만, 팀·본부는 자리 재검사, `field_definitions`는 `requiredMenu`, 나머지는 보관함 쓰기 게이트. 확인한 기존 줄: 사람 쓰기 게이트 `:80` · 상한 `:92` · 팀장/책임자 자리 `:110 · :129 · :143 · :155` · 팀/본부 `:186 · :206 · :221 · :243` · 공휴일 `archive.test.ts:234 · :271 · :379` · 칸 관리 `field-definitions-archive.test.ts:96 · :154`. 비어 있던 것은 「그 밖의 종류가 보관함 쓰기 게이트를 지나는가」라 `ARCHIVABLE_TABLES`를 순회하는 한 사례를 추가(사람 쓰기만 위임받은 계정이 11개 종류 전부 복원 거부 · `restore` 로그 0). 새 종류가 생기면 자동으로 덮인다.

## 커밋
- `e2faad4` test: leak-scan DTO registry and export coverage (Task 2)
- `9f6ed65` test: inbox own-scope and per-kind restore gate (Task 3)
- `84f5885` test: role x path smoke E2E tracer (Task 1)
(커밋 순서는 Task 2 → 3 → 1 — E2E가 빌드/포트 대기 때문에 마지막에 끝났다.)

## 검증 (실제 돌린 명령과 결과)
- `pnpm typecheck` — 0 오류. `pnpm lint`(eslint . + stylelint) — 종료 코드 0, 경고는 eslint-plugin-boundaries 폐기 안내뿐.
- `pnpm exec vitest run --project unit test/unit/leak-scan-coverage.test.ts test/unit/export-registry-coverage.test.ts test/unit/action-registry-completeness.test.ts test/unit/ci-guard.test.ts` — 4 파일 36 테스트 통과.
- `DATABASE_URL=…/p0703_test pnpm exec vitest run --project integration test/integration/leak-scan.test.ts test/integration/notify-inbox-own-scope.test.ts test/integration/admin-cap-restore.test.ts test/integration/notify-inbox.test.ts` — 4 파일 5057 테스트 통과(깨끗한 DB).
- E2E: `CI=true pnpm playwright test --project=desktop --no-deps test/e2e/role-smoke.spec.ts` (프로덕션 빌드 포함, DB `p0703_test`) — 6 통과(표 덮임 1 + 계급 5). 판별 확인: PM `/admin/permissions` 기대를 `open`으로 임시 뒤집으면 `Expected: 200 / Received: 404`로 실패 후 복구.
- 수락 기준: `grep -c ROLE_SMOKE` 3 · 계급 id 상수 다섯 모두 존재 · `git diff --name-only origin/main -- db/ domain/auth/ domain/permissions/ .github/ playwright.config.ts` 빈 출력 · `test -e test/unit/dto-registry-coverage.test.ts` 거짓 · `action-registry-completeness.test.ts` 미변경.
- 실행하지 않은 것: 전체 단위/통합/E2E 스위트와 `pnpm build` 단독, `lint:sql`(CI가 ready 때 한 번 — CLAUDE.md §5). `/review` 등 게이트는 오케스트레이터 몫.

## 편차 (Deviations)
1. **[Rule 2·플랜 허용] `domain/people/seat-rules.ts`에 `registerDto` 한 줄**(`files_modified` 밖의 제품 코드, 플랜 Task 2 ④ 허용 범위). `SeatDuplicatesDto`는 사람 이름을 싣는 DTO이고 `listSeatDuplicates`가 `person.value` ∧ `team.value`를 이미 게이트로 쓴다 — 새 정보 항목 신설 없이 기존 둘로 all-of 등록했다. 이로써 누수 스캔이 이 DTO를 계급마다 돌린다.
2. E2E를 `--no-deps`로 돌렸다(플랜 명령은 `--project=desktop`만): CI에서는 desktop이 `visual` 프로젝트에 의존해 시각 회귀 스펙을 먼저 끌어온다 — 이 스펙과 무관한 비용이라 뺐다. CI 본선은 의존 포함으로 돈다.
3. 공유 컨테이너에서 다른 에이전트 워크트리와 `erp_test` · 포트 3100이 충돌해(첫 E2E 시도 마이그레이션 `pg_type_typname_nsp_index` 중복, 둘째 시도 남의 서버로 로그인 실패) `p0703_test` 전용 DB + 기존 `flock /tmp/plant8-erp-test.lock`을 쓰는 스크립트로 직렬화해 다시 돌렸다. 코드 영향 없음.
4. Superpowers 스킬(`test-driven-development` · `systematic-debugging` · `verification-before-completion`): 이 세션에서 Skill 도구가 `Unknown skill`로 응답해 **skill unavailable** — 같은 규율을 직접 따랐다(RED 확인 → 최소 GREEN → 판별/변이 확인 → 마지막에 전체 대상 재실행).

## 발견 (07-05 · 07-19 · 오케스트레이터 입력)
1. 계급 스모크의 기대 13행이 지금 시드와 전부 일치 — 07-05가 D-722로 값을 바꾸는 행(대표/본부 책임자/팀장의 `/admin/action-log` 등)을 이 표에 얹으면 된다.
2. `DTO_TYPE_TO_REGISTRY_NAME`의 `MoneyDto` · `MoneyInputDto → QuoteLineDto` 대응은 「감싸는 DTO가 정보 항목으로 거른다」는 판단이다(독립 타입 등록 아님). 07-19가 `InboxNotification`을 `registerDto`로 올리면(C-P3-4 선택) 별도 조치 없이 런타임 대조가 덮는다 — 단 그 타입은 이름이 `*Dto`가 아니므로 이 대조의 열거 대상은 아니다.
3. 통합 시험 `leak-scan.test.ts`는 `skipDbReset()`을 쓰고 시드 상태에 기대 — 같은 DB에서 두 번 연달아 돌리면 실패한다(재실행 전 `pnpm db:reset:test`). 기존 성질이며 이 플랜이 바꾸지 않았다.
4. 뒤 플랜 계약: 파일을 만드는 새 모듈(07-20 거래처 내려받기 등)은 `registerExport(` + `test/integration/leak-scan.test.ts` import 한 줄, 새 `registerDto` 모듈도 같은 import 한 줄이 필요하다. 새 `export type …Dto`는 등록 이름이 규칙 ①②에 맞거나 대응 표/이유 있는 면제를 더해야 한다.
5. AQ-07(알림함 액션 비등록)은 사용자 확인 대기 그대로 — 전환하려면 `actions.registry.ts` 신설 + `ACTIONS_WITHOUT_REGISTRY`에서 세 줄 제거.
