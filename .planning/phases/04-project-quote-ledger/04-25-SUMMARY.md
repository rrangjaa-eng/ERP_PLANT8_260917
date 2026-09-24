---
phase: 04-project-quote-ledger
plan: 25
subsystem: ui
tags: [select, code-tables, description-hint, mobile-p2, playwright, css-grid]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-10 — code_items.description 컬럼 · CodeItemDto.description · 시드 설명 · 코드표 설명 열"
provides:
  - "SelectOption.description + Select 설명 힌트 한 줄(설명 없음·빈 값·오류면 힌트 없음, 오류가 이긴다)"
  - "SelectHint(id, children) — 공용 Select로 아직 옮기지 않은 네이티브 select가 같은 힌트 줄을 붙이는 자리"
  - "거래처 폼 기본 증빙 종류 설명 힌트(고르는 자리 첫 사용처)"
  - "listProjectFormReferences 소분류 옵션의 description(없으면 null) — 04-23이 견적 셀에 연결"
  - "코드표 표 설명 열 keep-all · 폰(<700) P2 접힌 줄(값·정렬·동작 P3 숨김)"
affects: [04-23, 04-07, 04-21, phase-7-admin-form-migration]

actuals:
  tokens: 4600
  tasks: 2
  commits: 4
plan_head_before: c5cc502e839b86f082ff3e8acd4bcc1e5b42988a

tech-stack:
  added: []
  patterns:
    - "폰 칸 접기(§7-3) CSS 첫 선례: <700에서 tr을 2열 격자(minmax(0,1fr) + 고정 폭 상태 열)로, P2 칸은 grid-row 2 · grid-column 1/-1, P3 칸은 nth-child로 display:none, 행 구분선은 칸이 아니라 tbody tr에, colSpan 단일 칸 행(:only-child)은 줄 전체"
    - "Select 힌트: 제어면 value, 비제어면 onChange로 따라가는 로컬 상태가 현재 값 — 기존 value/defaultValue/onChange는 그대로 넘긴다"

key-files:
  created: []
  modified:
    - ui/select/Select.tsx
    - ui/select/Select.module.css
    - domain/projects/references.ts
    - app/(app)/admin/vendors/vendor-form.tsx
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/code-tables/code-tables.module.css
    - test/e2e/vendor-edit.spec.ts
    - test/e2e/mobile-code-tables.spec.ts

key-decisions:
  - "Select.tsx가 SelectHint를 내보내고 거래처 폼(네이티브 select 유지, A-H2)이 그것을 쓴다 — vendors.module.css의 .hint는 PC에서 라벨 열만큼 들여쓰기가 걸려(계좌 칸용) 라벨이 위에 있는 select 아래에서는 어긋나고, 그 파일은 이 플랜 범위 밖이다"
  - "Select 힌트 .hint는 font-weight --fw-regular를 명시 — 굵은 라벨 묶음(.selectLabel, 600) 안에 놓여도 Form.Hint와 같은 본문 굵기"
  - "폰 P2 상태 열 폭을 6em으로 고정 — max-content는 행마다 폭이 달라 머리글 「상태」와 칸 x가 어긋난다(간격 리터럴 허용, 02-02 결정)"
  - "references.ts는 리포지토리 행을 직접 쓰고 CodeItemRow(InferSelectModel)에 description이 이미 있다 — 레이블과 같은 게이트 없는 투영이라 새 노출 판정을 더하지 않았다"

patterns-established:
  - "폰 P2 접힌 줄: 칸을 두 번 렌더하지 않고 CSS 격자로 자리만 옮긴다"

requirements-completed: [UX-04]

coverage:
  - id: D1
    description: "Select가 고른 코드표 값의 설명을 컨트롤 아래 한 줄로 보이고, 설명 없는 값·빈 값에서는 힌트 요소가 없다 — 첫 사용처 거래처 기본 증빙 종류"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/vendor-edit.spec.ts#고른 증빙 종류의 설명이 칸 아래 한 줄로 보이고, 설명 없는 값·빈 값이면 힌트 줄이 없다"
        status: pass
    human_judgment: false
  - id: D2
    description: "오류가 있으면 오류가 힌트를 이긴다(Select) — 설명 옵션과 error를 함께 넘기는 호출부가 아직 없어 E2E가 없다"
    requirement: "UX-04"
    verification:
      - kind: other
        ref: "임시 vitest renderToStaticMarkup 검사 5건(오류 이김·설명 없음·빈 값·제어) — 커밋하지 않음(범위 밖 파일), 로그 scratchpad/select-scratch.log"
        status: pass
    human_judgment: true
    rationale: "커밋된 자동 테스트가 없다 — 04-23/04-07이 오류와 설명을 함께 쓰는 셀을 만들 때 E2E로 닫아야 한다"
  - id: D3
    description: "견적 소분류 옵션이 코드표 설명을 싣는다"
    requirement: "UX-04"
    verification:
      - kind: other
        ref: "pnpm typecheck (CodeOption.description 필수 필드)"
        status: pass
    human_judgment: true
    rationale: "값이 화면에 닿는 것은 04-23(견적 셀 연결) — 이 플랜 안에는 이를 관찰하는 테스트가 없다"
  - id: D4
    description: "폰 375 코드표에서 설명이 접힌 줄에 한 번만 보이고 값·정렬·동작 열이 숨으며 가로 스크롤 0"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-code-tables.spec.ts#설명이 이름 아래 접힌 줄에 한 번만 보이고 값·정렬·동작 열이 숨는다, 가로 스크롤 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "S14 backstop 셋(40자 PC 한 줄/폰 줄바꿈 · 폰 P2 한 번 · 설명 0/1/전부 열 폭·줄 높이 안정) — 1280 · 1024 · 375 독립 DOM 감사"
    requirement: "UX-04"
    verification: []
    human_judgment: true
    rationale: "CLAUDE.md — 감사는 실행자가 아닌 별도 에이전트가 CI=true로 판정한다. 이 실행자에는 서브에이전트 도구가 없고 오케스트레이터가 감사 → 전체 게이트를 돌린다"

duration: 17min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 25: 코드표 설명 — 고르는 자리 힌트 · 폰 P2 Summary

**공용 `Select`가 고른 코드표 값의 설명을 컨트롤 아래 한 줄로 보이고(거래처 기본 증빙 종류가 첫 사용처), 견적 소분류 옵션이 설명을 싣고, 코드표 화면이 폰에서 설명을 이름 아래 접힌 줄(P2)에 한 번만 보인다**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-24T13:57:37Z
- **Completed:** 2026-09-24T14:14:39Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `SelectOption.description` + 힌트 한 줄 — 설명 없는 값·빈 값이면 요소 자체가 없고, `error`가 있으면 오류만(`aria-describedby`도 오류만). `<option>`에는 설명을 넣지 않는다
- 거래처 폼 기본 증빙 종류(네이티브 select 유지)에 같은 힌트 줄 — 저장된 값의 설명이 폼을 열 때부터 보이고 바꾸면 즉시 바뀐다
- `listProjectFormReferences` 소분류 옵션이 `description`을 싣는다(04-23이 셀에 연결)
- 코드표 표: 설명 열 `keep-all`, 폰(<700)에서 2열 격자 — 설명은 P2 접힌 줄(`--fs-sm --muted`), 값·정렬·동작·설명 머리글은 숨김, 상태 열 폭 고정

## Task Commits

1. **Task 1 (tracer): 옵션 설명 → Select 힌트 → 거래처 폼 → E2E**
   - `b2a14e5` test(04-25): add failing E2E for vendor evidence-type description hint (RED)
   - `0530be3` feat(04-25): show selected code-table value description under Select (GREEN)
2. **Task 2: 소분류 옵션 설명 + 코드표 폰 P2**
   - `ae60c4c` test(04-25): add failing phone E2E for code-table description P2 row (RED)
   - `6e3d4b7` feat(04-25): carry subcategory descriptions and fold code-table description to phone P2 row (GREEN)

`git log --stat c5cc502..HEAD`에 `quote-table.tsx`가 없다(0건 확인) — 표 연결은 04-23.

## TDD 기록

- Task 1 RED: `pnpm playwright test test/e2e/vendor-edit.spec.ts` → 새 케이스가 `toHaveAccessibleDescription` 단언에서 실패(Expected 「과세 거래 · 부가세가 붙는 세금계산서」, Received 「」). 앞 단계(코드표 항목 생성·거래처 등록·수정 진입)는 통과 — 의도한 실패. 기존 MAST-01 케이스는 통과
- Task 2 RED: `--project=mobile-375 --no-deps` → 새 케이스가 설명 칸 y(835) ≥ 이름 칸 아래(875) 단언에서 실패 — 설명이 같은 줄 옆 열에 있었다
- `gsd check tdd-red-evidence`는 TAP 출력만 읽어 Playwright 결과를 판정하지 못한다(이 플랜은 `type: execute`라 그 게이트 대상 아님) — RED 로그를 증거로 남겼다
- REFACTOR 커밋 없음(정리할 것 없음)

## 검증 (명령 · 결과 · 로그 — scratchpad `/tmp/claude-0/-home-user-ERP-PLANT8-260917/cc138095-2790-5e8d-bb84-893de35a994e/scratchpad/`)

| 명령 | 결과 | 로그 |
|---|---|---|
| `pnpm lint` (Task 1 · Task 2) | 0 | t1-lint.log · t2-lint.log |
| `pnpm typecheck` (Task 1 · Task 2) | 0 | t1-typecheck.log · t2-typecheck.log |
| `pnpm build` (Task 1 · Task 2) | 0 | t1-build.log · t2-build.log |
| `pnpm playwright test vendor-edit · project-register · revenue-section` | 13 passed | t1-green-e2e.log |
| `pnpm playwright test mobile-code-tables · code-tables` (계획 명령 그대로) | 148 passed · 1 failed · 2 did not run | t2-green-e2e.log |
| 위 실패 `action-log.spec.ts:114` 단독 재실행 | 4 passed | t2-actionlog.log |
| `code-tables.spec.ts` + `mobile-code-tables.spec.ts`, `--project=desktop --project=mobile-375 --no-deps` | 11 passed | t2-green-e2e-targeted.log |
| `package.json` 의존성 객체 · `pnpm-lock.yaml` vs 플랜 시작점 c5cc502 | diff 0줄 | — |
| `CI=true pnpm test` | **실행 안 함** — 오케스트레이터가 독립 DOM 감사 뒤 한 번 돈다 | — |

계획 명령에 mobile 스펙을 넣으면 `mobile-375`의 `dependencies: ["desktop"]` 때문에 desktop 프로젝트 **전체**(151건)가 따라 돈다 — 파일 필터는 의존 프로젝트에 걸리지 않는다. 그 중 `action-log.spec.ts:114`(Excel 내보내기 download 대기, `[WebServer] The destination stream closed early`)가 dev 서버 부하에서 한 번 시간 초과했고 단독 재실행은 통과했다. 이 플랜 파일과 닿지 않는 화면이다(행동 로그 CSV 내보내기).

## S14 backstop — 독립 DOM 감사

**판정 미정(오케스트레이터 몫).** 실행자 참고 측정(판정 아님, dev 서버, 375, 시스어드민): `/admin/code-tables`·`?tableKey=evidence_type` 둘 다 scrollWidth 375 = clientWidth, 머리글 「이름」 x14 w257 · 「상태」 x271 w90이 모든 행의 칸 x와 같고, 설명 칸은 x14 w347로 이름·상태 아래 줄, 값·설명 머리글·정렬·동작은 display none, 세금 규칙 행은 w347 줄 전체.
감사가 볼 곳: 1280·1024에서 읽기 전용 계급(텍스트 설명)일 때 설명 0/1/전부에 따른 설명 열 폭 변화(§7-3 「문자 열은 auto」라 폭 고정은 하지 않았다), 40자 설명의 PC 긴 칸 한 줄, 폰 P2 칸의 `min-height: 0`·`padding-top: 0` 줄 높이.

## Files Created/Modified
- `ui/select/Select.tsx` — `"use client"`, `SelectOption.description`, `SelectHint`, 고른 값 추적·힌트/오류 분기
- `ui/select/Select.module.css` — `.hint`(`--fs-sm --muted`, `--fw-regular`, 오류와 같은 자리)
- `app/(app)/admin/vendors/vendor-form.tsx` — `EvidenceTypeOption.description`, 기본 증빙 종류 힌트 줄·`aria-describedby`, 등록 성공 reset 때 선택 상태 비움
- `app/(app)/admin/vendors/page.tsx` — 증빙 종류 map에 `description` (승인된 편차)
- `domain/projects/references.ts` — `CodeOption.description`, 소분류 옵션에 싣기
- `app/(app)/admin/code-tables/code-tables.module.css` — 설명 열 keep-all, 폰 P2/P3 격자
- `test/e2e/vendor-edit.spec.ts` — 힌트 표시·교체·부재(설명 없는 값·빈 값)·`<option>` 무설명
- `test/e2e/mobile-code-tables.spec.ts` — 폰 P2 한 번·P3 숨김·P1 머리글 보임·가로 스크롤 0

## Decisions Made
frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking · 오케스트레이터 사전 승인] `app/(app)/admin/vendors/page.tsx`가 증빙 종류 description을 떨어뜨렸다**
- **Found during:** Task 1
- **Issue:** `evidenceTypes.map((item) => ({ value: item.value, label: item.label }))`가 `CodeItemDto.description`을 버려 거래처 폼이 설명을 받을 수 없었다(`files_modified` 밖)
- **Fix:** 그 map에 `description: item.description` 한 줄
- **Verification:** vendor-edit E2E 초록
- **Committed in:** `0530be3`

**2. [Rule 2 - 판단] `SelectHint`를 `Select.tsx`에서 내보냄**
- **Found during:** Task 1
- **Issue:** 거래처 폼에 「같은 모양의 힌트 한 줄」을 붙일 클래스가 범위 안에 없다 — `vendors.module.css`의 `.hint`는 PC에서 라벨 열만큼 들여쓰기되고 그 파일은 범위 밖
- **Fix:** `Select`가 쓰는 힌트 줄을 `SelectHint`로 내보내 두 곳이 같은 마크업·클래스를 쓴다
- **Committed in:** `0530be3`

**3. [테스트 강화] 폰 스펙에 P1 머리글(이름·상태) 보임 단언 추가**
- **Found during:** Task 2 GREEN 전
- **Issue:** `tr`을 격자로 바꾸면 표 역할이 사라질 수 있고, 그러면 `getByRole("columnheader")` 숨김 단언이 빈 목록에 대해 참이 된다
- **Fix:** 숨김 단언 앞에 이름·상태 머리글 `toBeVisible()` — 역할이 살아 있음을 고정(통과 확인)
- **Committed in:** `6e3d4b7`

---

**Total deviations:** 3 (1 승인된 범위 밖 한 줄, 1 범위 내 설계 판단, 1 테스트 강화)
**Impact on plan:** 범위 확장 없음. 앞 플랜(ENG-D11) 결함 수정 없음.

## 사용성 원칙과의 충돌 (2026-09-24 사용자 결정 — 화면 안내 글 최소화)

- 이 플랜은 고르는 자리에 설명 한 줄(화면 안내 글)을 더한다. UI-SPEC S14·D-93에 잠긴 결정이라 계획대로 두었다. 원칙과 맞추려고 한 것: 설명이 있는 값을 골랐을 때만 한 줄, 설명 없는 값·빈 값·오류일 때는 줄 자체가 없다(`—`·빈 줄 금지), 선택지 전체 설명·툴팁·드롭다운은 없다
- 충돌 가능 지점: 설명 줄이 늘 뜨는 폼(모든 시드 증빙 종류에 설명이 있다) — 반복 사용자에게는 소음일 수 있다. 뒤 사용처(04-23 셀 · 04-07 리저브)는 S14대로 **편집 중에만** 보인다

## Issues Encountered
- 계획 명령의 desktop 전체 동반 실행과 `action-log.spec.ts:114` 1회 시간 초과(위 「검증」) — 단독 재실행 통과, 이 플랜과 무관

## Known Stubs
없음.

## Next Phase Readiness
- 04-23: `references.subcategories[].description`을 견적 셀 편집 중 힌트로 연결(`quote-table.tsx`의 두 `.map`이 지금 `value`·`label`만 넘긴다)
- 04-07: 리저브 증빙 종류 옵션에 `description`을 실으면 `Select`가 힌트를 그린다
- 오케스트레이터: S14 backstop 독립 DOM 감사(1280·1024·375) → `CI=true pnpm test`

## Self-Check: PASSED
- 수정 파일 8개 존재 확인, 커밋 `b2a14e5`·`0530be3`·`ae60c4c`·`6e3d4b7` 존재 확인, `c5cc502..HEAD` 4 커밋

## 독립 DOM 감사 (S14 backstop)
별도 Sonnet 에이전트가 CI=true 프로덕션 빌드에서 DOM 실측.
- A(40자 설명: 거래처 힌트 1280·1024 한 줄 getClientRects=1, 375 줄바꿈·말줄임 없음; 코드표 설명 칸 keep-all, 1280 scrollWidth 640=clientWidth, 1024 508=508, 375 두 줄 줄바꿈) PASS
- B(375 설명 한 번·이름 아래 전체 폭, 값·설명·정렬·동작 머리 숨김, 가로 스크롤 0: scrollWidth 375=clientWidth 375, 표 347px) PASS
- C(1280 설명 0·1·전부 7개에서 이름·상태 열 x·폭 변화 0px, 기준 ≤2px) PASS
- D(설명 없는 값 선택 시 힌트 요소 0개) PASS
- 참고: 쓰기 권한 사용자는 설명이 인라인 입력칸이라 keep-all 판정은 읽기 전용 역할로 쟀다(page.tsx:150-153)
- 전체 게이트 CI=true pnpm test 통과(unit 819/819, integration 1058/1058, e2e 192/192)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*
