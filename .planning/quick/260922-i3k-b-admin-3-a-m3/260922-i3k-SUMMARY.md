---
phase: quick-260922-i3k
plan: 01
subsystem: ui
tags: [nextjs, react, design-system, rbac, accessibility]

# Dependency graph
requires:
  - phase: 02-design-system-app-shell
    provides: role-menu.ts 순수 함수(D-23), SYSTEM.md §6-0 셸 계약
  - phase: 03-permissions-settings-masters
    provides: 관리자 화면 10개, can(viewer, key, "view") 권한 판정, A-M3 이월 항목
provides:
  - "관리자 진입점을 「관리」 한 줄로 접는 role-menu.ts 계약(adminMenu) + SYSTEM.md §6-10 정본 표"
  - "/admin 인덱스 화면(app/(app)/admin/page.tsx) — 3그룹(마스터·설정·권한·운영 기록), 서버 필터, D-17 404"
  - "role-menu.ts adminIndexGroups() — SYSTEM.md §6-10 표를 role-menu.test.ts가 읽어 대조하는 문서-코드 결합"
  - "관리자 읽기용 표 6종 caption + 코드표 th scope(A-M3 종료)"
affects: [04-project-quote-ledger, 07-payment-close-notify]

# Actuals (#2632) — pairs with the plan's estimate (90000 tokens estimateTokens) to calibrate future estimates.
actuals:
  tokens: 15436
  tasks: 3
  commits: 4
  plan_head_before: 6b2f692bcb7ece11c9ed6e826d6542ad23761118

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SYSTEM.md as executable contract: role-menu.test.ts reads §6-10's markdown table at test time and diffs it against adminIndexGroups() — a doc edit that drifts from code fails CI before a human notices (same pattern as the existing §6-0 bottom-tab table read)"
    - "Menu collapse via single-link sentinel: adminMenu no longer lists items, it returns [{label:'관리',href:'/admin'}] or [] — consumers (TopBar, MoreSheet) stay unchanged because the MenuLink[] shape didn't change, only its cardinality"

key-files:
  created:
    - "app/(app)/admin/page.tsx"
    - "app/(app)/admin/admin-index.module.css"
    - "test/unit/ui/admin-table-caption.test.ts"
  modified:
    - "docs/design/SYSTEM.md"
    - "docs/design/DECISIONS.md"
    - "test/unit/design-system-docs.test.ts"
    - "ui/shell/role-menu.ts"
    - "ui/shell/MoreSheet.tsx"
    - "ui/shell/TopBar.tsx"
    - "test/unit/ui/role-menu.test.ts"
    - "test/e2e/admin-nav.spec.ts"
    - "test/e2e/mobile-admin-nav.spec.ts"
    - "app/(app)/admin/code-tables/page.tsx"
    - "app/(app)/admin/corp-cards/page.tsx"
    - "app/(app)/admin/people/page.tsx"
    - "app/(app)/admin/people/roles/roles-client.tsx"
    - "app/(app)/admin/vendors/page.tsx"
    - "ui/history-list/HistoryList.tsx"
    - "app/(app)/admin/settings/settings-form-client.tsx"
    - "app/(app)/admin/people/[id]/person-detail-client.tsx"

key-decisions:
  - "옵션 B(사용자 확정 2026-09-22): 관리자 진입점을 「관리」 한 줄로 접고 /admin 인덱스(3그룹)를 신설 — 드롭다운 13줄이 Phase 7에서 더 늘어나는 것을 막는다. DECISIONS.md에 전체 근거 기록"
  - "「더보기」 시트에서 「관리자」 그룹 머리글 제거 — 한 줄짜리 그룹은 노이즈(사용자 확정)"
  - "법인카드 화면 caption은 메뉴 라벨 '법인카드 마스터'가 아니라 화면 제목 '법인카드'(사용자 확정, 행동 로그·보관함 선례를 따름)"

patterns-established:
  - "adminIndexGroups()의 그룹 순서·라벨은 SYSTEM.md §6-10 표에서 파생되고 하드코딩되지 않는다 — role-menu.test.ts의 expectedAdminIndexGroups() 헬퍼가 매 실행마다 문서를 다시 읽는다"
  - "표 caption은 전역 .sr-only 유틸리티만 쓴다(app/globals.css) — 모듈 지역 sr-only 복제본(action-log·PermissionGrid)은 손대지 않고 새 표 6개는 전역 클래스로 통일"

requirements-completed: [QUICK-260922-i3k, A-M3]

coverage:
  - id: D1
    description: "관리자 진입점이 PC 사용자 메뉴·「더보기」 시트 모두에서 「관리」 한 줄로 접힌다(개별 화면 이름 미노출), 허용 메뉴가 없으면 그 줄도 없다"
    requirement: "QUICK-260922-i3k"
    verification:
      - kind: unit
        ref: "test/unit/ui/role-menu.test.ts#roleMenu — 관리자 메뉴 진입점 (「관리」 한 줄로 접힘, D-17)"
        status: pass
      - kind: e2e
        ref: "test/e2e/admin-nav.spec.ts#PC 사용자 메뉴에는 「관리」 항목만 보이고, 관리자 화면 개별 라벨 10개는 메뉴 안에 하나도 없다"
        status: pass
      - kind: e2e
        ref: "test/e2e/mobile-admin-nav.spec.ts#「더보기」 시트의 「관리」 한 줄 → /admin 인덱스로 클릭만으로 관리자 화면에 닿는다 (폰 375)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/admin 인덱스가 3그룹(마스터·설정·권한·운영 기록)으로 10개 화면을 보여주고, 그룹·순서가 SYSTEM.md §6-10 표와 원소 단위로 같으며, 권한 0개 계급에게는 404다"
    requirement: "QUICK-260922-i3k"
    verification:
      - kind: unit
        ref: "test/unit/ui/role-menu.test.ts#adminIndexGroups — 「관리」 인덱스 3그룹 (SYSTEM.md §6-10 표가 정본)"
        status: pass
      - kind: e2e
        ref: "test/e2e/admin-nav.spec.ts#/admin 인덱스에 그룹 머리글 셋(마스터·설정·권한·운영 기록)과 항목 링크 10개가 전부 보인다"
        status: pass
    human_judgment: false
  - id: D3
    description: "관리자 읽기용 표 6종(코드표·법인카드·사람·계급·거래처·HistoryList)에 시각적으로 숨긴 caption이 있고, 코드표 th 전부에 scope=col이 있다(A-M3)"
    requirement: "A-M3"
    verification:
      - kind: unit
        ref: "test/unit/ui/admin-table-caption.test.ts (21 tests)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-22
status: complete
---

# Quick Task 260922-i3k Summary

**관리자 진입점을 PC 사용자 메뉴·「더보기」 시트 「관리」 한 줄로 접고 /admin 인덱스(3그룹)를 신설, 관리자 읽기용 표 6종 caption + 코드표 th scope로 A-M3 종료**

## Performance

- **Duration:** ~25 min (첫 커밋 13:31 → 최종 게이트 13:52)
- **Tasks:** 3/3 완료
- **Commits:** 4 (Task별 1개 + 최종 게이트에서 발견된 회귀 수정 1개)
- **Files modified:** 20

## Accomplishments

- `docs/design/SYSTEM.md`에 §6-10 「관리」 인덱스 화면 절 신설 + §6-0 (a)·§6-0 시트 항목·§6-8·§7-8 네 곳 개정 — 관리자 진입점 계약을 문서로 먼저 확정
- `ui/shell/role-menu.ts`의 `adminMenu`가 이제 허용된 admin.* 메뉴가 하나라도 있으면 `{ label: "관리", href: "/admin" }` 한 줄만 반환하고, 새 `adminIndexGroups()`가 SYSTEM.md §6-10 표 순서 그대로 3그룹을 계산한다
- `app/(app)/admin/page.tsx` 신설 — 서버에서 `can(viewer, key, "view")`로 거른 allowedMenus를 `adminIndexGroups`에 넘기고, 빈 배열이면 `notFound()`(D-17)
- `ui/shell/MoreSheet.tsx`에서 「관리자」 그룹 머리글 제거 — 「관리」가 다른 1차 메뉴 행과 같은 모양의 목록 행 하나가 됨
- 관리자 읽기용 표 6종(코드표·법인카드·사람·계급·거래처·`HistoryList`)에 전역 `.sr-only`로 시각적으로 숨긴 `<caption>` 추가, 코드표 머리글 `<th>` 다섯 개(조건부 「동작」 칸 포함) 전부에 `scope="col"` 추가 — Phase 3 `03-OPEN-ITEMS.md` A-M3, Phase 4 `04-OPEN-ITEMS.md` A-M3 둘 다 (ㄱ) 경로(이관과 무관하게 지금 닫는다)로 해소

## Task Commits

1. **Task 1: SYSTEM.md 개정 + §6-10 신설 + DECISIONS.md 기록** — `c5e6bd3` (docs)
2. **Task 2: 「관리」 한 줄로 접기 + /admin 인덱스 3그룹 (RED 먼저)** — `c6b2a1b` (feat)
3. **Task 3: A-M3 — 읽기용 표 6종 caption + 코드표 th scope** — `7cd3b13` (fix)
4. **최종 게이트에서 발견된 회귀 수정** — `811243e` (fix) — 아래 「Deviations from Plan」 참고

## Files Created/Modified

- `app/(app)/admin/page.tsx` — 「관리」 인덱스 화면(신설), MENUS × can()으로 allowedMenus 계산 → adminIndexGroups → 3그룹 렌더, 빈 배열이면 notFound()
- `app/(app)/admin/admin-index.module.css` — MoreSheet.module.css의 `.group`/`.list`/`.link` 토큰을 그대로 옮긴 인덱스 화면 스타일(신설, 새 토큰 0)
- `docs/design/SYSTEM.md` — §6-0 (a)·§6-0 시트 항목·§6-8·§7-8 개정 + §6-10 신설
- `docs/design/DECISIONS.md` — 2026-09-22 결정 항목(옵션 B, 근거·버린 대안·범위·D-17 관계)
- `ui/shell/role-menu.ts` — `adminMenu`를 단일 「관리」 링크로 축소, `ADMIN_MENUS`에 `group` 필드 추가(§6-10 순서), `adminIndexGroups()` 신설
- `ui/shell/MoreSheet.tsx` — 「관리자」 그룹 머리글 제거, adminMenu 항목을 평범한 목록 행으로
- `ui/shell/TopBar.tsx` — 코드 변경 없음, 거짓이 된 주석만 정정
- `test/unit/ui/role-menu.test.ts` — adminMenu·adminIndexGroups 새 계약, §6-10 표를 읽는 `expectedAdminIndexGroups()` 헬퍼 추가
- `test/e2e/admin-nav.spec.ts` / `test/e2e/mobile-admin-nav.spec.ts` — 「관리」 한 줄 → /admin → 개별 화면 2단계 진입으로 교체
- `test/unit/design-system-docs.test.ts` — §6-10 절 경계·머리글 검사 추가
- `app/(app)/admin/{code-tables,corp-cards,people,people/roles,vendors}` 다섯 화면 — `<caption className="sr-only">`, 코드표는 `th scope="col"` 추가
- `ui/history-list/HistoryList.tsx` — `HistoryListProps.caption: string` 필수 필드 + `<caption>{caption}</caption>` 렌더
- `app/(app)/admin/settings/settings-form-client.tsx` — `caption={`${label} 이력`}` 전달
- `app/(app)/admin/people/[id]/person-detail-client.tsx` — `caption="소속 발령 이력"` 전달
- `test/unit/ui/admin-table-caption.test.ts` — 신설, A-M3 계약 21개 단언

## TDD Evidence — RED 출력 인용

### Task 2 RED (구현 전, role-menu.test.ts)

```
Test Files  1 failed (1)
     Tests  19 failed | 25 passed (44)
```

대표 실패 2건:

```
FAIL  |unit| test/unit/ui/role-menu.test.ts > roleMenu — 관리자 메뉴 진입점 (「관리」 한 줄로 접힘, D-17)
      > allowedMenus에 admin.* 키 10개가 전부 있어도 관리자 메뉴는 여전히 「관리」 한 줄이다(개별 화면 이름은 adminIndexGroups가 담당)
AssertionError: expected [ { label: '시스템 상태', …(1) }, …(9) ] to deeply equal [ { label: '관리', href: '/admin' } ]
```

```
FAIL  |unit| test/unit/ui/role-menu.test.ts > adminIndexGroups — 「관리」 인덱스 3그룹 (SYSTEM.md §6-10 표가 정본)
      > 10개 전부 허용이면 그룹 3개, 라벨·항목 순서가 SYSTEM.md §6-10 표와 원소 단위로 같다
TypeError: adminIndexGroups is not a function
```

구현(role-menu.ts의 `buildAdminMenu`·`adminIndexGroups`, `app/(app)/admin/page.tsx`, `MoreSheet.tsx`) 후 재실행:

```
Test Files  1 passed (1)
     Tests  44 passed (44)
```

### Task 3 RED (구현 전, admin-table-caption.test.ts)

```
Test Files  1 failed (1)
     Tests  21 failed (21)
```

대표 실패 1건(코드표 caption 부재):

```
FAIL  |unit| test/unit/ui/admin-table-caption.test.ts > 코드표 (code-tables) 화면 — <table>에 시각적으로 숨긴 caption이 있다(A-M3) > <table> 바로 안에 <caption>이 있다
AssertionError: expected '...\n<table className={styles.table}>\n <thead>...' to match /<table[^>]*>\s*<caption/
```

구현(다섯 화면에 `<caption>` + 코드표 `th scope` + `HistoryList.caption` prop) 후 재실행:

```
Test Files  1 passed (1)
     Tests  21 passed (21)
```

## Decisions Made

- 옵션 B(사용자 확정) — 「관리」 한 줄 + `/admin` 인덱스 3그룹. 전체 근거는 `docs/design/DECISIONS.md` 2026-09-22 항목
- 「더보기」 시트 「관리자」 그룹 머리글 제거(사용자 확정) — §7-8에 "그룹 머리글 없이 목록 행 하나"로 명문화
- 법인카드 caption = 화면 제목 "법인카드"(사용자 확정, 메뉴 라벨 "법인카드 마스터"와 다름)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `test/e2e/mobile-admin-nav.spec.ts`가 폐지된 「더보기」 시트 계약을 여전히 단언**

- **Found during:** 최종 게이트(`pnpm test:e2e:ci`) — Task 2 자체 검증(role-menu 단위 테스트·typecheck·lint)은 이 파일을 건드리지 않아 통과했지만, 계획의 `<files>` 목록(`test/e2e/admin-nav.spec.ts`만 명시)에 이 파일이 없어 놓쳤다.
- **Issue:** `mobile-admin-nav.spec.ts`가 "「더보기」 시트의 「관리자」 그룹에서 admin.* 링크를 직접 클릭"을 단언 — 사용자 locked decision #2(그룹 머리글 제거)와 role-menu.ts의 새 adminMenu 계약(「관리」 한 줄)을 반영하지 못한 낡은 계약.
- **Fix:** `admin-nav.spec.ts`와 같은 패턴으로 「더보기」 시트 → 「관리」 클릭 → `/admin` → 「사람」 클릭 → `/admin/people`의 2단계 진입으로 교체. 「관리자」 텍스트가 시트 안에 없다는 단언도 추가.
- **Files modified:** `test/e2e/mobile-admin-nav.spec.ts`
- **Verification:** 단독 실행 통과 확인 후, DB를 리셋한 클린 `pnpm test:e2e:ci` 전체 실행에서 126/126 통과(아래 최종 게이트 참고).
- **Committed in:** `811243e`

첫 번째 `pnpm exec playwright test test/e2e/mobile-admin-nav.spec.ts` 단독 실행은 직전에 끝난 전체 스위트(`pnpm test:e2e:ci`)와 겹쳐 돌면서 무관한 두 화면(`action-log.spec.ts`의 CSV BOM 바이트, `corp-cards.spec.ts`의 strict-mode 중복 텍스트)에서 테스트 DB 경합으로 보이는 실패를 냈다 — `systematic-debugging`으로 원인을 추적한 뒤(두 프로세스가 같은 `erp_test` DB를 동시에 씀), `db:reset:test`부터 다시 시작하는 클린 `pnpm test:e2e:ci` 단일 실행으로 재검증해 126/126 통과를 확인했다. 이 두 파일 자체는 이번 작업의 대상이 아니고 수정하지 않았다.

---

**Total deviations:** 1 auto-fixed (Rule 1 — 플랜에 누락된 파일의 낡은 E2E 계약)
**Impact on plan:** 계획의 `<files>` 누락이 원인이라 태스크 2 범위 안의 수정이다. 스코프 크리프 없음.

## Issues Encountered

None beyond the deviation above.

## Final Gate (한 번만 실행, CLAUDE.md 화면 검증 순서)

| 명령 | 결과 |
|---|---|
| `pnpm lint` | 통과 (사전에 존재하던 boundaries 플러그인 deprecation 경고만, 이번 변경과 무관) |
| `pnpm typecheck` | 통과 |
| `pnpm test:unit` | 통과 — 65 files, 637 tests |
| `CI=true pnpm build` | 통과 — 프로덕션 빌드 성공, `/admin` 라우트 생성 확인 |
| `pnpm test:e2e:ci` (`db:reset:test` + `CI=true playwright test`) | 통과 — **126 passed, 0 failed** (exit code 0) |

E2E는 로컬 DB(`erp`·`erp_test`, `127.0.0.1:5432`)가 이 세션에서 살아 있어 실제로 실행했다 — 계획의 가정 7("DB 없어 미실행")은 이 실행에서는 틀렸고, 실측대로 위 표에 남긴다.

## Requirement Closure

- `.planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md:84` A-M3 — 닫을 수 있다(caption 6종 + 코드표 th scope 완료). 파일 자체는 완료된 페이즈 산출물이라 수정하지 않음(`.planning/` 수동 편집 금지).
- `.planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md:34` A-M3 — 제시된 두 경로 중 **(ㄱ) 이관과 무관하게 지금 6종에 caption·th scope를 넣어 Phase 3 약속을 지키는 경로**로 해소됐다. Phase 7의 관리자 폼 이관(A-H2·A-H3)과는 무관 — 별개로 남아 있음. 파일 자체는 수정하지 않음.

## Next Phase Readiness

- Phase 4(project-quote-ledger) 실행 재개 가능 — 관리자 셸 계약 변경이 Phase 4의 프로젝트·견적·손익 화면에 영향을 주지 않는다(도메인이 다르다).
- Phase 7이 관리자 화면을 더 추가할 때 SYSTEM.md §6-10 표에 그룹 행만 늘리면 되고, PC 메뉴·「더보기」 시트는 줄 수가 고정돼 있어 손댈 필요가 없다.

---
*Phase: quick-260922-i3k*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created files (`app/(app)/admin/page.tsx`, `app/(app)/admin/admin-index.module.css`,
`test/unit/ui/admin-table-caption.test.ts`) and all four commit hashes
(`c5e6bd3`, `c6b2a1b`, `7cd3b13`, `811243e`) verified present on disk / in git log.
