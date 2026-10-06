---
phase: quick-261006-biv
plan: 01
subsystem: vendors
status: complete
tags: [vendors, migration, picker-filter, admin-screen]
requires: []
provides:
  - "vendors.kind (client | supplier | both, NOT NULL DEFAULT 'both') + CHECK vendors_kind_check"
  - "domain/vendors/kind.ts 순수 모듈(VENDOR_KINDS · VENDOR_KIND_LABELS · DEFAULT_NEW_VENDOR_KIND · vendorKindsFor · servesSide · parseVendorSide · isVendorKind)"
  - "고르는 목록 넷의 갈래 거르기(프로젝트 클라이언트 · 리저브 클라이언트 = client+both, 견적 줄 거래처 · 지출결의 거래처 = supplier+both)"
  - "/admin/vendors 「구분」 칸 · 열 · ?kind= 걸러보기"
affects: [projects create form, quote table vendor options, expense vendor pick, reserves client options, admin vendors screen]
tech-stack:
  added: []
  patterns: ["NOT VALID CHECK + 별도 파일 VALIDATE(0026 선례)", "쓰임 기반 채우기는 EXISTS/NOT EXISTS 상관 서브쿼리", "목록 링크 걸러보기 nav + aria-current(code-tables 선례)"]
key-files:
  created:
    - db/migrations/0027_vendor_kind.sql
    - db/migrations/0028_vendor_kind_validate.sql
    - db/migrations/meta/0027_snapshot.json
    - db/migrations/meta/0028_snapshot.json
    - domain/vendors/kind.ts
    - test/unit/vendors/vendor-kind.test.ts
    - test/integration/vendor-kind.test.ts
    - docs/design/checks/2026-10-06-거래처-구분.md
  modified:
    - db/schema/vendors.ts
    - db/migrations/meta/_journal.json
    - domain/vendors/index.ts
    - repositories/vendors.ts
    - domain/expenses/pick.ts
    - domain/projects/references.ts
    - domain/reserves/index.ts
    - app/(app)/admin/vendors/actions.ts
    - app/(app)/admin/vendors/vendor-form.tsx
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/vendors/vendors.module.css
    - app/(app)/projects/create-entry.ts
    - test/unit/app/projects-create-entry.test.ts
    - test/unit/error-copy-noun-style.test.ts
    - test/e2e/vendors.spec.ts
    - test/e2e/mobile-vendors.spec.ts
decisions:
  - "등록 「구분」 기본값은 협력사이되, 목록이 ?kind=로 걸러져 있으면 그 갈래로 연다 — 같은 kind 파라미터 하나가 걸러보기와 등록 기본값을 함께 맡는다(프로젝트 화면 「클라이언트 등록」 = /admin/vendors?new=1&kind=client)"
  - "프로젝트 클라이언트 빈 상태는 「등록된 클라이언트가 없습니다 · 클라이언트 등록」(오케스트레이터 지시로 범위 추가)"
  - "listVendorsForPick은 limit 앞에서 SQL inArray로 거르고, 나머지 세 목록은 한 번 읽은 행을 servesSide로 메모리에서 나눈다"
metrics:
  duration: "약 40분"
  completed: 2026-10-06
visual_baseline_expected: [vendors, vendors-new]
estimate:
  tokens: 150000
  tasks: 3
actuals:
  tokens: 117600   # chars/4 over the realized diff (470,537 chars, 마이그레이션 스냅숏 JSON 두 개 포함)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 022de9f61cd036a596419d06461f2d33e66bad03
---

# Phase quick-261006-biv Plan 01: 거래처 갈래(클라이언트 · 협력사 · 둘 다) Summary

vendors.kind 칸(마이그레이션 0027 + 0028 VALIDATE, 쓰임 기반 채우기)을 더하고, 고르는 목록 넷을 갈래로 거르고, 거래처 화면에 「구분」 칸 · 열 · `?kind=` 걸러보기를 붙였다.

## 커밋

| Task | 커밋 | 제목 |
|---|---|---|
| 1 | 3947e583 | feat: add vendors.kind column with usage-based backfill |
| 2 | b4894597 | feat: filter vendor pickers by vendor kind |
| 3 | e585b8c3 | feat: vendor kind field, column and filter on admin vendors |

## 마이그레이션

- `0027_vendor_kind.sql`: `SET LOCAL lock_timeout '1s'` · `statement_timeout '5s'` → `ADD COLUMN kind text DEFAULT 'both' NOT NULL` → `ADD CONSTRAINT vendors_kind_check CHECK (...) NOT VALID` → 채우기 UPDATE 두 문.
- `0028_vendor_kind_validate.sql`: `VALIDATE CONSTRAINT vendors_kind_check`(별도 트랜잭션, SHARE UPDATE EXCLUSIVE).
- 채우기 규칙(D-2): projects.client_id · reserve_entries.client_id에만 쓰임 → client, quote_lines.vendor_id · expenses.vendor_id에만 쓰임 → supplier, 양쪽 · 안 쓰임 → both. EXISTS/NOT EXISTS만 쓴다(nullable vendor_id의 NOT IN 함정 없음). 보관 행도 쓰임으로 센다. updated_at은 건드리지 않는다. corp_card_usages.merchant_vendor_id는 세지 않는다.
- `pnpm db:generate` 재실행 「No schema changes」, `pnpm lint:sql` 29파일 0건.
- db/schema · db/migrations는 위험 경로다 — 사용자가 GitHub에서 머지한다.

## 검증 (이 세션에서 실제로 돌린 것)

| 명령 | 결과 |
|---|---|
| `pnpm vitest run --project unit test/unit/vendors/vendor-kind.test.ts test/unit/db/migration-journal.test.ts` | 13 passed |
| `pnpm vitest run --project integration test/integration/vendor-kind.test.ts test/integration/vendors.test.ts` | 21 passed |
| `pnpm vitest run --project integration` vendor-kind · project-form-references-visibility · expense-pick · reserve-entries · quote-lines-hidden-vendor · quote-line-vendor-name | 6 files, 123 passed |
| `pnpm vitest run --project unit` admin-master-list-first · test/unit/vendors · projects-create-entry · error-copy-noun-style · list-screen · migration-journal | 8 files, 76 passed |
| `CI=true pnpm exec playwright test` vendors · vendor-edit · form-label-section-gap · hidden-references · mobile-vendors · mobile-320-no-overflow · mobile-admin-master-list-first `--project=desktop --project=mobile-375 --no-deps` | 96 passed, 2 skipped(기존 events-new 건너뜀) |
| `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` | 모두 exit 0 |

RED 확인: 단위(모듈 없음) · 통합 4건(칸 없음) · Task 2 거르기 3건(고정 2건은 녹색) · E2E 2건(dev) · create-entry 단위 1건이 구현 전에 실패했다.

## 독립 DOM 감사

별도 프로세스(Claude Code headless, model sonnet, 레포 읽기 전용)가 CI=true 프로덕션 빌드(:3200, erp_test)를 320 · 375 · 768 · 1280 × 6쪽에서 실측했다. **FINDINGS: 0.**
- 가로 넘침 0(문서 · 패널), 폰 갈래 링크 · 숨김 포함 44 이상(전체 44×44 · 클라이언트 71×44 · 협력사 49×44 · 숨김 포함 63×44), 패널 select#kind = input#name = select#defaultEvidenceType = 40px.
- 현재 링크 aria-current 하나 · 700/밑줄 없음, 나머지 600/밑줄. `?new=1` → supplier, `?new=1&kind=client` → client. 필터 결과 0 = 「조건에 맞는 건이 없습니다」 + 「필터 지우기」(href /admin/vendors, 폰 93×44). CLS 0 · 필터 줄 이동 0. 콘솔 오류 0.
- 데이터 한계: 감사 시점 erp_test에 보이는 client/both 거래처가 없어 「클라이언트」 · 「둘 다」 칸 글자, 수정 패널의 저장값 client, `?kind=client` 행의 「수정」 href는 감사가 재지 못했다 — 이 셋은 CI=true E2E 「구분 — 등록 기본 협력사 …」가 단언한다.
- 관찰(결함 아님): 폰 320에서 갈래 링크 줄이 1차 버튼 옆 좁은 폭에 서서 두 줄(전체 · 클라이언트 / 협력사)로 접힌다. 거래처 목록은 기존부터 ListScreen이 필터와 1차를 한 줄에 둔다(`.bar:has(form)`만 1차를 아래로 내림) — 공용 컴포넌트라 이번에 바꾸지 않았다. `/design-review`에서 결정 ④(폰 1차는 필터 아래)와 함께 볼 거리.

## 사진 (적용 전 = origin/main 022de9f6 CI=true 빌드, 적용 후 = 이 브랜치 CI=true 빌드)

`/mnt/project-files/notes/vendor-kind/` — `vendors-{375,1280}-적용{전,후}.png` · `vendors-new-{375,1280}-적용{전,후}.png` · `project-client-select-{375,1280}-적용{전,후}.png`(네이티브 select 펼친 목록은 헤드리스에 그려지지 않아 사진용으로만 size 속성을 줘 목록 상자로 펼쳤다). erp_test에 데모 거래처 셋(한빛광고(클라이언트) · 스테이지원(협력사) · 미래기획(둘 다))을 넣고 찍었다.

## 시각 기준 사진

`visual_baseline_expected: [vendors, vendors-new]` — 바뀌는 기준 사진: `test/e2e/visual.spec.ts-snapshots/vendors-1280-visual-linux.png` · `vendors-new-1280-visual-linux.png`, `test/e2e/visual-390.spec.ts-snapshots/vendors-390-visual-linux.png` · `vendors-new-390-visual-linux.png`. 로컬에서 만들지 않았다 — PR을 ready로 올리기 전 `gh workflow run visual-baseline.yml --ref <브랜치>` 한 번 뒤 워크플로 커밋을 pull한다.

## Deviations from Plan

### Auto-fixed / 범위 추가

**1. [지시 추가] 프로젝트 화면 클라이언트 빈 상태 문구 · 링크**
- 오케스트레이터 지시: 클라이언트가 없을 때 빈 화면이 「거래처」 대신 「클라이언트」를 말하고 등록 패널이 구분 클라이언트로 열리게.
- 변경: `app/(app)/projects/create-entry.ts` → `「등록된 클라이언트가 없습니다」 · 「클라이언트 등록」 → /admin/vendors?new=1&kind=client`. 거래처 화면은 `?kind=`가 있으면 등록 「구분」 기본값을 그 갈래로 연다(VendorForm `newKind` prop). 단위 테스트 갱신 + E2E 「?new=1&kind=client로 열면 …」 추가. `test/unit/error-copy-noun-style.test.ts`의 빈 목록 문구 예외 목록에 새 문구를 더했다(기존 「등록된 거래처가 없습니다」와 같은 사용자 결정 범주).
- 커밋: e585b8c3

**2. [Rule 3 - 막힘] 독립 DOM 감사를 Agent 도구 대신 headless CLI로**
- 이 실행자에는 Agent(서브에이전트) 도구가 없다. 별도 프로세스 `claude -p --model sonnet`(cwd = 스크래치패드, 레포는 --add-dir 읽기, Edit 금지, 프롬프트에 verification-before-completion · systematic-debugging 명시)로 감사를 돌렸다. 레포 파일 변경 없음(git status로 확인).

**3. [Rule 1] E2E가 만든 거래처 정리**
- 새 E2E가 등록 화면으로 만든 거래처를 끝에 숨기도록 `findVendorsByNormalizedName`으로 찾아 숨긴다(다른 스펙의 목록 넘침 단언에 남지 않게, 기존 스펙들과 같은 정리 방식).

### 계획대로 둔 것
- 프로젝트 「복사」의 원본 클라이언트가 협력사 갈래면 등록 폼 클라이언트 기본 선택이 빈다 — 새 문서 등록이라 숨김 거래처와 같은 규칙으로 둔다(플랜 Task 2 action 5).
- 서버 저장 검사(D-7) · 기한 · 리저브 숨김(D-8)은 범위 밖 — 건드리지 않았다.

## Post-build 게이트(묶음 PR마다 한 번, CLAUDE.md §4)
코드 `/review` · 화면 `/design-review` → `/qa` · domain/reserves를 건드려 `/cso`. db/schema · db/migrations 위험 경로는 사용자 머지.

## Self-Check: PASSED
- 파일: db/migrations/0027_vendor_kind.sql · 0028_vendor_kind_validate.sql · domain/vendors/kind.ts · test/unit/vendors/vendor-kind.test.ts · test/integration/vendor-kind.test.ts · docs/design/checks/2026-10-06-거래처-구분.md — 존재 확인.
- 커밋: 3947e583 · b4894597 · e585b8c3 — git log에 있음. `git rev-list --count 022de9f6..HEAD` = 3.
