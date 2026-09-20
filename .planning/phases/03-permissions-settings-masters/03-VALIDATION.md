---
phase: "03"
slug: "permissions-settings-masters"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-20"
updated: "2026-09-20"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 3` from `03-RESEARCH.md` § Validation Architecture.
> Per-task map filled by `gsd-planner` after the seven PLAN.md files were written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`--project unit` / `--project integration`) + Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` — both present since Phase 1 |
| **Quick run command** | `pnpm test:unit` |
| **Full suite command** | `pnpm test` (`test:unit` → `test:integration` → `test:e2e`) |
| **Estimated runtime** | ~20s unit · ~25s integration · ~80s E2E (measured on CI run #43) |

Integration and E2E require a local database. **The proven prelude in this repo is
`bash scripts/dev-db.sh && pnpm db:migrate` (Phase 02 used it verbatim), and from Phase 3 on a third
step is required: `pnpm db:seed`** — `test/integration/setup.ts` truncates every table before each
test, so the roles/permission/visibility seed must be re-applied, and 03-01 adds that call plus the
`db:seed` script.

**Path correction (planner, 2026-09-20).** The seeded draft named unit test files like
`domain/permissions/can.test.ts`. `vitest.config.ts` collects the unit project from
`test/unit/**/*.test.ts` only, so a test under `domain/` would never run — a silent zero-coverage
state. Every unit test in the plans lives under `test/unit/…` and the commands below reflect that.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:unit`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds (unit tier)

---

## Per-Task Verification Map

Every row's test file is **created by the same plan that verifies it** — there is no separate Wave 0
plan, so `File Exists` records the plan that creates the file rather than an unowned gap.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T2 | 03-01 | 1 | ADMN-01 | T-03-01 | 권한표 행이 없거나 viewer에 계급 식별자가 없으면 판정이 false(기본 거부) | unit | `pnpm vitest run --project unit test/unit/permissions/can.test.ts` | ❌ → 03-01 T2 | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | ADMN-02 | T-03-03 | 노출표에 없는 필드는 투영 출력에서 사라지고, 판정 두 함수가 서로를 부르지 않는다(D-35) | unit | `pnpm vitest run --project unit test/unit/permissions/visible.test.ts test/unit/permissions/project.test.ts` | ❌ → 03-01 T2 | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | OPS-05 | T-03-05 | 단순 조회·화면 이동은 로그 행을 0개 만들고, 끌 수 없는 종류는 설정 조회 실패에도 기록된다 | unit | `pnpm vitest run --project unit test/unit/action-log/record.test.ts` | ❌ → 03-01 T2 | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | ADMN-12 | T-03-06 | 행 필터 서술자가 보관 행을 보관함 권한 없는 계급에서 걸러낸다 | unit | `pnpm vitest run --project unit test/unit/permissions/scope-for.test.ts` | ❌ → 03-01 T2 | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | ADMN-08 | T-03-02 | 계급 추가·이름 변경이 데이터로 되고 시드 5종은 보관되지 않으며 계급이 0개가 될 수 없다 | integration | `pnpm vitest run --project integration test/integration/roles.test.ts` | ❌ → 03-01 T3 | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | MAST-04 | T-03-03 | 코드표 항목 비활성화가 멱등이고 권한표 칸을 켜면 같은 viewer의 조회가 재배포 없이 성공한다 | integration | `pnpm vitest run --project integration test/integration/code-tables.test.ts` | ❌ → 03-01 T3 | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | OPS-05 | T-03-05 | append-only 기록과 같은 시각 행들의 삽입 순서 유지 | integration | `pnpm vitest run --project integration test/integration/action-log.test.ts` | ❌ → 03-01 T3 | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | ADMN-01 | T-03-01 | 시스템 관리자는 코드표 화면에 들어가고 기본 계급은 404 | E2E | `pnpm playwright test test/e2e/code-tables.spec.ts` | ❌ → 03-01 T3 | ⬜ pending |
| 03-02-T2 | 03-02 | 2 | ADMN-01 | T-03-10 | 관리자 전용 화면의 접근 제어 세 줄이 이관 후에도 살아 있다 | unit | `pnpm vitest run --project unit test/unit/system-status.test.ts test/unit/ui/role-menu.test.ts` | ✅ 수정 → 03-02 T2 | ⬜ pending |
| 03-02-T3 | 03-02 | 2 | ADMN-03 | T-03-09 | 판정 경로가 정확히 세 함수다 — 관리자 불리언 참조가 0이다 | unit | `pnpm vitest run --project unit test/unit/no-admin-boolean.test.ts` | ❌ → 03-02 T3 | ⬜ pending |
| 03-03-T2 | 03-03 | 3 | ADMN-03 | T-03-15 | domain export 함수의 반환 타입이 행 타입이면 lint가 빌드를 막는다(정상 코드에는 침묵) | unit | `pnpm vitest run --project unit test/unit/eslint-rules/no-row-type-escape.test.ts` | ❌ → 03-03 T2 | ⬜ pending |
| 03-03-T2 | 03-03 | 3 | ADMN-03 | T-03-16 | 노출표에 매핑되지 않은 DTO가 있으면 실패하고, 빈 레지스트리는 0건 초록이 아니라 실패다 | integration | `pnpm vitest run --project integration test/integration/leak-scan.test.ts` | ❌ → 03-03 T2 | ⬜ pending |
| 03-03-T2 | 03-03 | 3 | ADMN-02 | T-03-15 | 노출표에서 항목을 끄면 그 계급의 DTO에서 그 필드가 사라진다 | integration | `pnpm vitest run --project integration test/integration/visibility.test.ts` | ❌ → 03-03 T2 | ⬜ pending |
| 03-03-T3 | 03-03 | 3 | ADMN-01 | T-03-17 | 권한표 칸을 켜면 다른 계급의 접근이 즉시 열리고, 좌표가 접근성 라벨에 문장으로 담긴다 | E2E | `pnpm playwright test test/e2e/permissions-grid.spec.ts` | ❌ → 03-03 T3 | ⬜ pending |
| 03-04-T2 | 03-04 | 4 | ADMN-05 | T-03-23 | 등록됐으나 읽히지 않는 키가 있으면 실패하고, 미래 페이즈 표시의 번호가 ROADMAP에 실재해야 한다 | unit | `pnpm vitest run --project unit test/unit/settings/registry-coverage.test.ts` | ❌ → 03-04 T2 | ⬜ pending |
| 03-04-T2 | 03-04 | 4 | ADMN-05 | T-03-22 | 끌 수 없는 로그 종류를 값으로 받는 설정 키가 거부된다 | unit | `pnpm vitest run --project unit test/unit/settings/registry.test.ts` | ❌ → 03-04 T2 | ⬜ pending |
| 03-04-T2 | 03-04 | 4 | ADMN-05 | T-03-25 | 이력형 키의 경계(시작일 == 기준일) 포함과 fail-closed 기본값 | integration | `pnpm vitest run --project integration test/integration/settings.test.ts` | ❌ → 03-04 T2 | ⬜ pending |
| 03-04-T2 | 03-04 | 4 | ADMN-06 | T-03-24 | JSON 내보내기 → 빈 환경 가져오기 후 동작 동일, 두 번 가져오기 멱등, 부분 적용 없음 | integration | `pnpm vitest run --project integration test/integration/settings-export.test.ts` | ❌ → 03-04 T2 | ⬜ pending |
| 03-04-T3 | 03-04 | 4 | ADMN-05 | T-03-25 | 설정 값 변경이 저장 버튼 없이 즉시 반영되고 이력형 미래 값에 「예정」이 붙는다 | E2E | `pnpm playwright test test/e2e/settings.spec.ts` | ❌ → 03-04 T3 | ⬜ pending |
| 03-05-T1 | 03-05 | 5 | MAST-02 | T-03-31 | 시점 소속 조회의 경계 포함과 이력 없을 때 null(임의 기본 팀 없음) | unit | `pnpm vitest run --project unit test/unit/org/team-at-date.test.ts` | ❌ → 03-05 T1 | ⬜ pending |
| 03-05-T1 | 03-05 | 5 | MAST-03 | T-03-33 | 카드 소유가 소지자 또는 팀 정확히 하나 | unit | `pnpm vitest run --project unit test/unit/corp-cards/owner-rule.test.ts` | ❌ → 03-05 T1 | ⬜ pending |
| 03-05-T1 | 03-05 | 5 | MAST-02 | T-03-31 | 발령일이 같은 두 발령 거부, 내림차순 안정, 미래 발령만 취소 가능 | integration | `pnpm vitest run --project integration test/integration/team-memberships.test.ts` | ❌ → 03-05 T1 | ⬜ pending |
| 03-05-T1 | 03-05 | 5 | MAST-02 | T-03-35 | 본부 없는 팀 생성 거부와 보관 행의 권한 기반 가림 | integration | `pnpm vitest run --project integration test/integration/org.test.ts` | ❌ → 03-05 T1 | ⬜ pending |
| 03-05-T1 | 03-05 | 5 | MAST-03 | T-03-34 | 같은 발급사·뒤 4자리 중복 거부, 전체 카드 번호 컬럼 부재, 소유자 변경이 반대 칸을 비움 | integration | `pnpm vitest run --project integration test/integration/corp-cards.test.ts` | ❌ → 03-05 T1 | ⬜ pending |
| 03-05-T2 | 03-05 | 5 | MAST-02 | T-03-29 | 계정 발급과 발령이 부분 성공으로 끝나지 않고, 초기 비밀번호가 기록에 실리지 않는다 | integration | `pnpm vitest run --project integration test/integration/people.test.ts` | ❌ → 03-05 T2 | ⬜ pending |
| 03-05-T2 | 03-05 | 5 | MAST-02 | T-03-30 | 사람 등록 화면에서 발급한 계정·초기 비밀번호로 실제 로그인이 된다 | E2E | `pnpm playwright test test/e2e/people.spec.ts` | ❌ → 03-05 T2 | ⬜ pending |
| 03-05-T3 | 03-05 | 5 | MAST-03 | T-03-33 | 개인·팀 카드 등록, 중복 거부, 비활성 토글, 권한 없는 계급 404 | E2E | `pnpm playwright test test/e2e/corp-cards.spec.ts` | ❌ → 03-05 T3 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-01 | T-03-40 · T-03-42 | 라운드트립 · 키 없을 때 fail-closed · 키 길이 검증 · v1·v2 혼재 복호화 · 인증 태그 변조 탐지 | unit | `pnpm vitest run --project unit test/unit/crypto.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-04 | T-03-43 | 필드 정의에서 조립한 스키마가 미등록 키·타입 불일치를 거부한다 | unit | `pnpm vitest run --project unit test/unit/custom-fields/build-schema.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-04 | T-03-44 | 증빙 종류 세금 규칙 스키마가 네 규칙 종류·절사 단위·절사 방식만 허용한다 | unit | `pnpm vitest run --project unit test/unit/code-tables/tax-rule.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-01 | T-03-37 · T-03-38 | 계좌번호가 암호문으로만 저장되고 기본은 뒤 4자리, 해제는 권한 + 기록을 거친다 | integration | `pnpm vitest run --project integration test/integration/vendors.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-04 | T-03-43 | 커스텀 필드가 등록 키만 저장하고 GIN 인덱스가 실재한다(`pg_indexes` 조회) | integration | `pnpm vitest run --project integration test/integration/custom-fields.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T2 | 03-06 | 6 | MAST-01 | — | 문서 번호 카운터 표의 복합 기본키 동작과 증가 함수 부재(부여 훅은 Phase 4) | integration | `pnpm vitest run --project integration test/integration/document-counters.test.ts` | ❌ → 03-06 T2 | ⬜ pending |
| 03-06-T3 | 03-06 | 6 | MAST-01 | T-03-38 | 마스킹 표시·해제·가리기, 권한 없는 계급에는 버튼 자체가 없음 | E2E | `pnpm playwright test test/e2e/vendors.spec.ts` | ❌ → 03-06 T3 | ⬜ pending |
| 03-07-T2 | 03-07 | 7 | ADMN-10 | T-03-47 | 기간 필터 양끝 포함, 끝+1밀리초 제외, 같은 시각 행의 정렬 결정성 | unit | `pnpm vitest run --project unit test/unit/action-log/filter.test.ts` | ❌ → 03-07 T2 | ⬜ pending |
| 03-07-T2 | 03-07 | 7 | ADMN-10 | T-03-48 · T-03-49 | 두 번 직렬화가 같고, 구분자·줄바꿈·따옴표가 든 값에서 열이 밀리지 않는다 | unit | `pnpm vitest run --project unit test/unit/action-log/export.test.ts` | ❌ → 03-07 T2 | ⬜ pending |
| 03-07-T2 | 03-07 | 7 | OPS-05 | T-03-46 | 정리가 물리 삭제가 아니고 정리 자체가 기록되며 정리 기록은 다음 정리의 대상이 아니다 | integration | `pnpm vitest run --project integration test/integration/action-log-query.test.ts` | ❌ → 03-07 T2 | ⬜ pending |
| 03-07-T2 | 03-07 | 7 | ADMN-10 | T-03-47 | 필터 → 내보내기 → 정리 → 정리 기록 확인, 권한 없는 계급 404 | E2E | `pnpm playwright test test/e2e/action-log.spec.ts` | ❌ → 03-07 T2 | ⬜ pending |
| 03-07-T3 | 03-07 | 7 | ADMN-12 | T-03-50 · T-03-51 | 삭제는 보관함으로 가고 권한 있는 계급만 복원, 재복원 멱등, 시드 계급 보관 거부 | integration | `pnpm vitest run --project integration test/integration/archive.test.ts` | ❌ → 03-07 T3 | ⬜ pending |
| 03-07-T3 | 03-07 | 7 | ADMN-12 | T-03-52 | 삭제 → 보관함 → 복원, 빈 보관함에 다음 한 수 없음, 권한 없는 계급 404 | E2E | `pnpm playwright test test/e2e/archive.spec.ts` | ❌ → 03-07 T3 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Whole-repo gates (every task in every plan)

Inherited verbatim from Phase 02's proven commands — do not re-derive:

- `pnpm lint` · `pnpm typecheck` · `pnpm build`
- `pnpm lint:sql` (expects `Found 0 issues`) after any migration is generated
- `pnpm test` (unit → integration → e2e) at each plan's last task

---

## Wave 0 Requirements

There is no separate Wave 0 plan. Every test file is created by the plan whose behavior it verifies,
and each plan's last task runs `pnpm test` across all three tiers, so no task ships with a
`MISSING — Wave 0 …` sentinel.

- [ ] `test/unit/permissions/{can,visible,scope-for,project}.test.ts` — 판정 4함수 (03-01 T2)
- [ ] `test/unit/action-log/record.test.ts` — 핵심 행동 목록과 끌 수 없는 종류 (03-01 T2)
- [ ] `test/unit/no-admin-boolean.test.ts` — 관리자 불리언 참조 0 메타 테스트 (03-02 T3)
- [ ] `test/unit/eslint-rules/no-row-type-escape.test.ts` — DTO 출구 강제 규칙의 규칙 전용 테스트 (03-03 T2)
- [ ] `test/integration/leak-scan.test.ts` — 프로덕션 레지스트리를 테스트 입력으로 삼는 동적 생성 (03-03 T2). `it.each` 자체는 이 리포에 이미 3곳에서 쓰이고, 새로운 것은 **배열을 프로덕션 모듈에서 import한다**는 점뿐이다
- [ ] `test/unit/settings/registry-coverage.test.ts` — 미사용 키 검출 (03-04 T2)
- [ ] `test/unit/crypto.test.ts` — 라운드트립 + fail-closed + v1·v2 혼재 + 변조 탐지 (03-06 T2)
- [ ] `test/unit/org/team-at-date.test.ts` · `test/unit/corp-cards/owner-rule.test.ts` — 시점 소속·카드 소유 순수 판정 (03-05 T1)
- [ ] `test/unit/action-log/{filter,export}.test.ts` — 기간 경계와 직렬화 (03-07 T2)

**프레임워크 설치는 불필요** — Vitest·Playwright 모두 Phase 1부터 설치·설정돼 있다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 권한표·노출표 체크박스 격자의 시각 품질 | ADMN-01, ADMN-02 | 격자 밀도·스크롤·터치 목표는 계산값이 아니라 눈으로 보는 판정 (D-40) | `/design-review`(SYSTEM.md 일관성) → `/qa`(실브라우저). CLAUDE.md가 UI 완료 판정 조건으로 지정한 둘. 03-03 T3 완료 후 |
| 메뉴가 수십 개로 늘었을 때 2단 고정 머리글과 가로 스크롤의 실제 내구성 | ADMN-01 | 실 데이터가 있어야 아는 것 — 03-03의 backstop 진실이 이것을 명시한다 | 메뉴 레지스트리의 현재 개수로 `/qa`에서 확인하고, 그 이상은 Phase 7 전 메뉴 검수에서 다시 본다 |
| Secret Manager에 암호화 키 값 존재와 인코딩 | MAST-01 | `lib/env.ts`가 선택 문자열이라 값 없이도 앱이 뜬다 — 배포 후 「계좌번호 저장 시 500」으로 처음 발견되는 유형 | 배포 전 GCP Secret Manager에서 두 환경(staging·prod)의 값 존재와 base64 32바이트 여부 확인. **03-06 Task 3의 `<human-check>`로 플랜에 박혀 있다**(`workflow.human_verify_mode = end-of-phase`이므로 별도 체크포인트 태스크를 두지 않았다) |
| 전 메뉴 대상 권한·노출 검수 | ADMN-01, ADMN-02, ADMN-03, ADMN-10 | 이 페이즈 범위가 아니다 — ROADMAP Phase 3 절과 CEO 리뷰 OV-5가 Phase 7 끝으로 지정했다 | Phase 7 끝 성공 기준으로 이월. 이 페이즈는 자기 메뉴·액션으로만 검증한다 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 모든 태스크가 실행 가능한 `<automated>`를 갖고 각 명령마다 `<fails_when>`이 붙어 있다
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — 연속 0개 구간이 없다(체크포인트 태스크는 `<acceptance_criteria>`로 판정)
- [x] Wave 0 covers all MISSING references — `MISSING — Wave 0` 센티널이 0개다(각 테스트 파일을 그 행동을 검증하는 플랜이 직접 만든다)
- [x] No watch-mode flags — 모든 vitest 호출이 `run`이고 playwright에 `--ui`가 없다
- [x] Feedback latency < 20s — 단위 계층 ~20초, 태스크 커밋 단위 게이트가 단위 계층이다
- [x] `nyquist_compliant: true` set in frontmatter

`wave_0_complete`는 여전히 `false`다 — 위 목록의 테스트 파일이 아직 존재하지 않고, 플랜이 실행되면서
생긴다. `/gsd-validate-phase`가 실행 후에 이 값을 올린다.

**Approval:** planner-filled, awaiting execution
