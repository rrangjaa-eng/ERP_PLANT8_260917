---
phase: 04-project-quote-ledger
plan: 49
subsystem: quotes-ui
status: complete
tags: [save-lock, aria-busy, responsive-table, collapse-columns, view-only-narrow, restore-line, hydration, useSyncExternalStore]
requires:
  - phase: 04-30
    provides: 셀 단계 격자 · 구조 컨트롤 · EMPTY 변형 · 열린 편집기 커밋 뒤 저장(useEffectEvent)
  - phase: 04-22
    provides: 복원 줄 · 기간 칸 · 상태 바뀜 거부(DR-6)
  - phase: 04-44
    provides: 총 매출 예상가 칸
provides:
  - ui/table/save-lock.ts — GridAction · isGridActionAllowed(저장 중 이동·선택·복사만 허용)
  - Table.saveLocked(격자 aria-busy · 편집 진입·붙여넣기·EMPTY 새 줄 거르기) · use-grid-keyboard saveLocked(구조·저장·편집 키 거르기, IME 조합 키 무시)
  - QuoteLedger saveLocked = isExecuting → 견적 표 · RevenueSection · PeriodField · PreEstimateField(readOnly)
  - ui/table/use-editable-width.ts — useEditableWidth(≥1024) · useMinWidth(1024|1280), 서버 스냅숏 참
  - TableColumn.collapseBelow(1280|1024) — 좁은 PC 열 접기, 방향키가 숨은 열을 건너뜀
  - 1024 미만 견적 표·매출 표 보기 전용 · 1차는 N ≥ 1일 때만(R1) · 복원 줄 모든 폭(keep-all · restoreActions · 폰 44px)
  - Table.onEditingChange — 편집기가 열린 동안 1차가 비활성으로 보이지 않음(04-30 리뷰 S-5)
  - useDirtyStorage 수화 뒤에만 복원 칸 수를 보임(React #418 해소)
affects: [04-16, 04-18, 04-19, 04-24, 04-26, 04-42, 04-47]
actuals:
  tokens: 18389
  tasks: 2
  commits: 10
tech-stack:
  added: []
  patterns:
    - 저장 중 잠금은 격자 모양을 바꾸지 않고 동작만 거른다(aria-busy + isGridActionAllowed 한 곳)
    - 폭 판정은 useSyncExternalStore(서버 스냅숏 참) — CSS 미디어 쿼리와 같은 경계값
    - 브라우저 저장소에서 온 값은 수화가 끝난 뒤에만 그린다(useSyncExternalStore 서버 스냅숏 거짓)
key-files:
  created:
    - ui/table/save-lock.ts
    - ui/table/use-editable-width.ts
    - test/unit/ui/save-lock.test.ts
  modified:
    - ui/table/Table.tsx
    - ui/table/use-grid-keyboard.ts
    - ui/table/types.ts
    - ui/table/Table.module.css
    - ui/table/use-dirty-storage.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/period-field.tsx
    - app/(app)/projects/[id]/pre-estimate-field.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/e2e/ledger-save-flow.spec.ts
    - test/e2e/quote-edit-scope.spec.ts
    - test/e2e/quote-table.spec.ts
key-decisions:
  - "잠금이 걸리는 순간 열린 편집기를 닫는 blur는 잠금이 켜지는 때 한 번만 한다(deps [saveLocked]) — activeCell까지 보면 잠금 중 새로 열린 편집기도 곧바로 닫혀 편집 진입 거르기를 가린다(돌연변이로 발견)"
  - "1024 미만 읽기 표는 columns를 새로 매핑하지 않고 각 열 editability를 atWidth(level)로 감싼다 — react-hooks/refs가 렌더 중 columns.map을 막는다"
  - "숨은 열 판정은 CSS와 같은 경계의 useMinWidth(1280/1024) — DOM 계산 스타일을 렌더 중에 읽지 않는다. 로빙 탭 정지가 숨은 열(번호)에 있으면 가장 가까운 보이는 열로 보인다"
  - "S-5는 Table.onEditingChange로 편집 중이면 1차의 비활성·「바뀐 칸 없음」을 두지 않는다(라벨 N은 그대로)"
requirements-completed: [UX-05, UX-04, PROJ-02]
coverage:
  - id: D1
    description: "저장 요청 동안 견적 표·매출 표·기간 칸·총 매출 예상가 칸이 보이되 편집에 들어가지 않고, 연타 Ctrl+S는 요청 하나, 응답 뒤 다시 편집된다(DR-3)"
    requirement: UX-05
    verification:
      - kind: unit
        ref: "test/unit/ui/save-lock.test.ts#isGridActionAllowed"
        status: pass
      - kind: e2e
        ref: "test/e2e/ledger-save-flow.spec.ts#저장 중 잠금(DR-3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "1024 미만(375 · 1000)에서 견적 줄 표는 캡션 있는 읽기 표, 줄 추가·첫 줄 만들기·힌트 줄·셀 편집 없음, 1차는 N ≥ 1일 때만"
    requirement: PROJ-02
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#폭 규칙 (k)(l)"
        status: pass
    human_judgment: false
  - id: D3
    description: "현재 차수 복원 줄이 375·1000에서도 렌더되고 표 칸만 복원해도 1차로 저장된다(R1), 375에서 두 버튼 같은 줄·44px"
    requirement: UX-04
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#폭 규칙 (l2)(l3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "1100에서 번호·차익 숨김, 방향키가 숨은 열을 건너뜀, 합계 행 차익 합계"
    requirement: PROJ-02
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#폭 규칙 (m)"
        status: pass
    human_judgment: false
  - id: D5
    description: "폰 375에서 셀 편집 입력 없이 행 탭 → 행 시트"
    requirement: PROJ-02
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#폭 규칙 (l4)"
        status: pass
    human_judgment: false
  - id: D6
    description: "S4 backstop 넷(EMPTY 변형 × 상태 × 계급 · 0/1/6줄 · 가로 스크롤과 단가 열 폭 · 1024 미만 구조 컨트롤)과 S18 overflow backstop의 독립 DOM 감사(1280 · 1024 · 375 · 1000)"
    verification: []
    human_judgment: true
    rationale: "플랜 Task 2 ④와 CLAUDE.md §6이 실행자가 아닌 별도 에이전트의 CI=true DOM 감사를 요구한다 — 오케스트레이터가 이어서 돌린다"
duration: 38min
completed: 2026-09-25
plan_head_before: 4e27c6471e08820ac58bc52445582d6e6830d171
commits: 10
---

# Phase 4 Plan 49: 저장 중 잠금 · 1024 미만 보기 전용 · 좁은 PC 열 접기 · 복원 줄 모든 폭 Summary

**저장 요청 동안 화면의 네 편집기가 `aria-busy` 격자로 보이되 편집에 들어가지 않는다. 판정은 `isGridActionAllowed` 한 곳이다. 1024 미만에서는 견적 표와 매출 표가 보기 전용이 되고, 복원한 표 칸도 1차 `일괄 저장 N`으로 그 폭에서 저장된다. 1024~1279에서는 번호·차익 열이 접힌다. 이월된 React #418 수화 오류와 S-5(편집 중 1차가 비활성으로 보이는 문제)도 고쳤다.**

## Performance

- **Duration:** 38min
- **Started:** 2026-09-25T12:48:40Z
- **Completed:** 2026-09-25T13:26:58Z
- **Tasks:** 2 (+ 이월 2건: #418 · S-5)
- **Files modified:** 16

## Tasks

| # | 이름 | RED | GREEN |
|---|------|-----|-------|
| 1 (tracer) | 저장 중 잠금(save-lock → Table/키보드 → QuoteLedger 배선 → E2E) | d8d414e | 5e99050 |
| 이월 | React #418 복원 줄 수화 불일치 | 3aef93f | dea7f39 |
| 이월 | 04-30 리뷰 S-5 — 편집 중 1차가 비활성으로 보임 | e74d4d5 | a4ad0cf |
| 2 | 폭 규칙 · 복원 줄 모든 폭 · 폰 행 시트 | 9b08d14 | f215408 (+ 테스트 보정 1502a7f · c31b3cd) |

트레이서 게이트: interactive · `end-of-phase` · `<verify>`는 자동만이다. Task 1 검증 명령을 다시 돌려 모두 초록인 것을 확인한 뒤 Task 2로 넘어갔다.

## RED 증거

모든 RED 기록은 `check tdd-red-evidence`에서 `RED_EVIDENCE_OK`를 받았다. Playwright 줄 로그는 TAP 요약으로 바꿔 넣었다.

- **Task 1 단위** `save-lock.test.ts` › 「저장 중(saveLocked)이면 편집 진입·구조·저장 동작은 거짓, …」
  - 실패 줄: `AssertionError: enterEdit: expected true to be false`
  - 1 failed | 1 passed. 스텁이 항상 참을 돌려줬기 때문이다.
- **Task 1 E2E** `ledger-save-flow.spec.ts` › 「저장 중 잠금(DR-3) › 요청 중에는 셀·기간 칸이 편집에 들어가지 않고 …」
  - 실패 줄: `expect(locator).toHaveAttribute(expected) failed — Expected: "true" Received: ""`(격자 aria-busy)
- **#418 E2E** `ledger-save-flow.spec.ts` › 「복원 줄 수화(#418) › 저장 안 한 편집을 남기고 새로 고치면 …」
  - 실패 줄: `Hydration failed because the server rendered HTML didn't match the client`
  - 차이: `quote-table.tsx:1888`의 `restoreBanner` `<p>`가 클라이언트에만 있었다.
- **S-5 E2E** `quote-edit-scope.spec.ts` › 「(S-5) 실행가 편집기를 연 동안 1차 「일괄 저장」은 비활성(「바뀐 칸 없음」)으로 보이지 않는다」
  - 실패 줄: `Expected: not "true" Received: "true"`(aria-disabled)
- **Task 2 E2E** `quote-edit-scope.spec.ts` › 「폭 규칙 … (04-49)」 8건이 전부 실패했다.
  - (k) `getByRole('table', { name: '견적 줄' })` not found — 격자로 렌더됐다.
  - (k-EMPTY) `첫 줄 만들기` 1개
  - (l) grid 1개
  - (l2) 버튼 높이 `21.1875 < 44`
  - (l2 표 칸만) N=0인데 1차 1개
  - (l3) grid 1개
  - (l4) 읽기 표 없음
  - (m) `번호` 머리글 visible

## 검증(실행 결과)

| 명령 | 결과 |
|------|------|
| `pnpm vitest run --project unit test/unit/ui/save-lock.test.ts test/unit/ui/parse-tsv.test.ts test/unit/domain/quote-edit-scope.test.ts` | 59/59 |
| `pnpm vitest run --project unit test/unit/ui/save-lock.test.ts test/unit/ui/parse-tsv.test.ts` | 23/23 |
| `pnpm vitest run --project unit test/unit/ui/dirty-storage.test.ts` | 7/7 |
| `bash scripts/dev-db.sh && pnpm db:migrate` | 0 |
| `pnpm lint` | 0 errors (기존 boundaries 설정 경고만) |
| `pnpm typecheck` | 0 |
| `pnpm build` | 성공 |
| Task 1: `pnpm playwright test ledger-save-flow · quote-edit-scope · revenue-section` (dev) | 25/25 |
| Task 2: `CI=true pnpm playwright test ledger-save-flow · quote-edit-scope · quote-table · revenue-section · project-period` | **69/69** (프로덕션 빌드. #418 회귀 테스트 포함) |
| 추가 회귀: `CI=true pnpm playwright test project-lifecycle · project-register · number-format · archive` | 31/31 |
| T-04-SC: `package.json` 의존성 객체와 `pnpm-lock.yaml`을 d6b41cf와 비교 | 같다(얕은 클론이라 `--deepen=400` 뒤 비교) |

- **acceptance grep**
  - `isGridActionAllowed`는 `ui/table`의 세 파일에만 있다(정의 1 + 호출 2).
  - `useEditableWidth`는 `use-editable-width.ts` 한 곳에서 정의된다.
  - `collapseBelow?: 1280 | 1024`
  - `Table.module.css`의 새 미디어 쿼리는 `1279.98px`·`1023.98px` 둘뿐이다.
  - 복원 줄 렌더 조건은 `restorableCount > 0`뿐이다(폭 판정 없음).
  - 1차 조건은 `canSave && (editableWidth || dirtyCount > 0)` — 같은 dirty 셈 하나다.
  - 복원 줄 CSS에 `keep-all`·`restoreActions`·`--touch-min`이 있고, 새 토큰은 없다.
- **돌연변이 확인(scope note 8)**
  - Task 1: 키보드 편집 진입 거르기를 빼면 새 E2E가 실패한다(178행). 셀 클릭 거르기를 빼도 실패한다(180행).
  - Task 2 (m): 차익 합계 CSS를 빼면 실패한다(729행). 숨은 열 건너뛰기 루프를 끄면 ← 단언에서 실패한다(730행).
- `CI=true pnpm test`(전체 게이트)와 독립 DOM 감사는 지시대로 돌리지 않았다(아래 절).

## 독립 DOM 감사 · 전체 게이트

**오케스트레이터가 채움(대기)**

- 독립 DOM 감사: 별도 에이전트가 `CI=true`로 1280 · 1024 · 375 · 1000을 감사한다.
  - S4 backstop 넷: EMPTY 변형 × 상태 × 계급 · 0/1/6줄 합계 형식 · 가로 스크롤 0과 단가 열 폭 · 1024 미만 구조 컨트롤 부재
  - S18 overflow: 복원 줄 렌더 · 375에서 `word-break: keep-all` · 두 3차가 같은 줄이고 44px 이상 · 가로 스크롤 0
  - 저장 중 `aria-busy`
  - 콘솔 오류 0(04-30 감사 12b — #418)
- 전체 게이트: `bash scripts/reset-test-db.sh && CI=true pnpm test` 한 번.

## Deviations from Plan

**1. [Rule 1 - Bug · 이월] React #418 — `ui/table/use-dirty-storage.ts`(플랜 files 밖)**
- 원인: 지연 초기화가 첫 렌더에서 localStorage로 `restorableCount`를 읽는다. 서버는 0으로 그린다. 그래서 보관본이 있으면 클라이언트 첫 렌더에만 복원 줄이 생겼다.
- 수정: 훅 안에서 끝냈다. `useSyncExternalStore`(서버 스냅숏 거짓)로 수화 여부를 받아, 수화 전에는 0을 보이고 수화 뒤 마운트 때 읽은 수를 보인다.
- 테스트: E2E 「복원 줄 수화(#418)」. dev에서 RED, `CI=true`에서 GREEN을 확인했다.
- 커밋: 3aef93f · dea7f39

**2. [이월 반영] 04-30 리뷰 S-5 — 편집 중 1차가 비활성으로 보임**
- 이 플랜의 Table/QuoteLedger 배선 안에서 끝났다. `Table.onEditingChange`를 두고 편집 중이면 1차의 비활성·이유 글자를 두지 않는다.
- 테스트: E2E (S-5)
- 커밋: e74d4d5 · a4ad0cf

**3. [Rule 1 - 기존 스펙 조정] `test/e2e/quote-table.spec.ts` (f)(04-04, 플랜 files 밖)**
- 이 스펙은 375에서 「첫 줄 만들기」와 셀 편집을 했다. 이 플랜의 DR-24 · DR-36과 정면으로 어긋나 click이 시간 초과했다.
- 줄은 PC 폭에서 만들고 375로 바꿔 행 시트를 연다. 단언은 바꾸지 않았다.
- 커밋: c31b3cd

**4. [Rule 1 - 내 테스트 결함] (m) 로케이터**
- 숨은 칸은 접근성 트리에서 빠져 `getByRole("gridcell").nth(n)`이 밀린다. td DOM 위치로 바꿨다.
- 합계 글자 정규식 `/^차익 /` → `/차익 \d/`. 느슨해진 단언은 돌연변이로 여전히 잡는 것을 확인했다.
- ← 단언을 더했다. → 만으로는 초점 보정이 건너뛰기 루프를 가렸다.
- 커밋: 1502a7f

**5. [Rule 1 - 설계 보정] 잠금 시 편집기 닫기 효과**
- 처음 구현은 `[saveLocked, activeCell]`에 걸려, 잠금 중 새로 열린 편집기까지 곧바로 blur로 닫았다. 그러면 편집 진입 거르기가 가려진다(돌연변이가 통과).
- 잠금이 켜지는 때 한 번, 표 안의 입력 요소만 blur하도록 좁혔다.
- 커밋: 5e99050

**6. [기록] 플랜 표현과 다른 구현 두 곳**
- (a) 1024 미만 읽기 표는 `columns.map`이 아니라 각 열 `editability`를 `atWidth`로 감쌌다. 이유는 `react-hooks/refs` 린트다.
- (b) `use-editable-width.ts`에 `useMinWidth(1024|1280)`을 함께 export했다. `Table`의 숨은 열 건너뛰기가 1280 경계도 알아야 한다.

**7. [기록] 복원 줄 색 `--fg` → `--muted`**
- UI-SPEC rev 5 S18 「`--fs-sm --muted` 한 줄」과 플랜 ②대로 바꿨다(새 토큰 없음).

**Total deviations:** 7 (자동 수정 5 · 기록 2) — 이월 둘(#418 · S-5)은 지시 범위 안이다.
**Impact:** 범위를 넓히지 않았다. 플랜 밖 파일은 `use-dirty-storage.ts`(훅 안 수정)와 `quote-table.spec.ts`(설정 순서만)뿐이다.

## UX 원칙과 부딪치는 점(기록만 — 범위는 넓히지 않음)

- 저장 중 「줄 추가」·「발행/입금 줄 추가」·EMPTY 「첫 줄 만들기」는 눌러도 무동작이다. 신호는 1차 `일괄 저장…` 하나다(P0 · 새 신호 금지). 버튼이 보이는데 반응이 없는 짧은 순간이 있다.
- 매출 섹션의 계약 금액 입력은 1024 미만에서도 편집된다. 플랜이 「묶음 ③의 04-16·04-41이 지운다」고 해서 폭 규칙을 걸지 않았다. 저장 중에는 readOnly다.
- 1024 미만에서 N=0이면 1차가 없다(R1). 기간 칸을 바꾸면 그 자리에 버튼이 새로 생긴다(레이아웃 이동). 사용자가 정한 결정이라 기록만 남긴다.
- 1024~1279에서 격자의 첫 탭 정지는 숨은 번호 칸 대신 가장 가까운 보이는 칸(소분류)이다.

## 메모(남은 것)

- `Table`에는 `Ctrl+C` 범위 복사 처리 자체가 없다. `isGridActionAllowed("copy")`는 참을 돌려주지만 부르는 곳이 없다. 복사 구현은 이 플랜 범위 밖이다.
- 글자 입력으로 편집을 시작하는 경로(type-to-edit)가 격자에 없다. 그래서 `typeChar` 거르기를 따로 둔 곳이 없다(저장 중 글자 입력은 원래 무동작이다).
- #418 RED는 dev에서 재현했다. 프로덕션 빌드의 RED(`Minified React error #418`)는 04-30 DOM 감사 12b가 이미 기록했고, 이 플랜은 `CI=true` GREEN만 다시 돌렸다.
- 04-30 SUMMARY의 편차 6((j) 복원 줄 locator를 `p`로 좁힘)은 이제 필요 없다. 테스트는 그대로 두었다.

## Known Stubs

없음.

## Next Phase Readiness

- 04-26(`quote-table.tsx` 겹침)이 이 플랜 뒤에 올 수 있다.
- 그룹 B의 04-16(매출 표 개편)과 04-42(리저브 대장)는 같은 `saveLocked` · `useEditableWidth` · `collapseBelow` API를 쓰면 된다.
- 04-24(이전 차수 복원 줄)는 `restoreBanner` · `restoreActions` 두 클래스를 쓰면 각자 줄바꿈한다.

## Self-Check: PASSED

- FOUND: ui/table/save-lock.ts · ui/table/use-editable-width.ts · test/unit/ui/save-lock.test.ts
- FOUND commits: d8d414e · 5e99050 · 3aef93f · dea7f39 · e74d4d5 · a4ad0cf · 9b08d14 · 1502a7f · c31b3cd · f215408 (`git rev-list --count 4e27c64..HEAD` = 10)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
