---
phase: 06-payment-evidence-cards
plan: 29
subsystem: ui
tags: [ui, table-selection, list-screen, pick-dialog, confirm-dialog, attachments, shared-components, dev-components]
requires:
  - phase: 05-expense-approval-leave
    provides: ui/table(Table · use-grid-keyboard), ListScreen, PickDialog, ConfirmDialog, Attachments(read 모드)
  - phase: 06-payment-evidence-cards (06-01)
    provides: DECISIONS 06 SP-1 · SP-7 · SP-8 「올리기」 결정
provides:
  - "ui/table selection 열 — TableSelection 타입 · reconcileSelection(SP-1, 네이티브 체크박스 열 · 머리글 이 쪽 전체 고르기 · 못 고르는 행 aria-disabled + 이유 글자)"
  - "ListScreen.primaryAction 버튼 갈래 — ListPrimaryAction {label, onClick, shortcut?, disabledReason?, reasonTone?, pending?}"
  - "PickDialog noun 프로젝트 · noneSelectableReason · emptyNextStep · failedLine · pickFootLine(E-24) · 로드 · 오류 중 1차 비활성 · Esc · Ctrl+Enter(SP-8)"
  - "ConfirmDialog attachments 칸 · loading · refreshKeepsOpen(SP-7)"
  - "/dev/components 표 선택 · 고르기 목록 구역 · 모달 첨부 표본 · ?panel=pick"
affects: [06-07, 06-14, 06-15, 06-17]

plan_head_before: d557bf8d593ebf8663b80f4467c31ae1d4ded50a
actuals:
  tokens: 23000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "선택 열은 grid 열 인덱스 밖의 네이티브 체크박스 열 — use-grid-keyboard.ts 불변, Space는 data-td onKeyDown에서 가로채고 Ctrl+Enter는 훅의 onNewRow로 selection.onPrimary 호출"
    - "선택의 뜻은 체크박스 checked 하나, aria-selected는 활성 셀 뜻 그대로(DR-7)"
    - "바닥 줄 한 자리 우선순위 pickFootLine(resultLine, noneSelectableReason, idleReason)"

key-files:
  created:
    - test/unit/ui/table-selection.test.ts
    - docs/design/checks/2026-10-06-06-29-phase6-components.md
  modified:
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - ui/list-screen/ListScreen.tsx
    - ui/list-screen/ListScreen.module.css
    - ui/pick-dialog/PickDialog.tsx
    - ui/pick-dialog/PickDialog.module.css
    - ui/confirm-dialog/ConfirmDialog.tsx
    - ui/confirm-dialog/ConfirmDialog.module.css
    - app/(app)/dev/components/gallery-client.tsx
    - app/(app)/dev/components/page.tsx
    - test/unit/ui/list-screen.test.ts
    - test/unit/ui/confirm-dialog.test.ts
    - test/unit/ui/pick-dialog-empty-text.test.ts
    - test/e2e/dev-components.spec.ts

key-decisions:
  - "선택 열 체크박스는 기본 탭 정지를 유지한다(표 안 Tab 순서 불변, 활성 셀 Space와 병행)"
  - "ListScreen 버튼 갈래의 wideOnly 클래스는 버튼이 아니라 감싸는 span에 둔다(이유 글자까지 함께 숨김, 1024 미만 숨김 DR-36)"
  - "ConfirmDialog refreshKeepsOpen은 거절 이유 문자열이 같은 동안만 이유를 숨긴다 — 호출자가 새 props에서 거절 상태를 지워야 한다"
  - "서버 재판정 필수(T-06-290) — reconcileSelection은 표시용 정합이고 권한 · 상태 판정은 서버 액션이 다시 한다"

requirements-completed: [EXP-07, EXP-09, EVID-02]

coverage:
  unit: "test/unit/ui 51 파일 667 통과(신규 table-selection 7 · list-screen +4 · confirm-dialog +5 · pick-dialog-empty-text +2)"
  e2e: "dev-components + expense-new + expense-a11y + quote-table 88 통과 · 1 실패(quote-table 10줄 표 1번째 줄 — 단독 재실행 통과, 동시 실행 flaky) · 18 skip"
  lint_typecheck: "pnpm lint · pnpm typecheck 깨끗"

duration: 65min
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 29: 공용 조각 Summary

선택 열 표(SP-1) · ListScreen 버튼 갈래 · 05 PickDialog의 SP-8 빠진 부분 · ConfirmDialog 첨부 칸과 상태 계약 둘(SP-7)을 `ui/`에 올리고 `/dev/components`에 표본으로 세웠다. Phase 6 화면(06-07 · 06-14 · 06-15 · 06-17)이 쓰는 조각이 한꺼번에 준비됐다.

## 커밋

| Task | 커밋 | 내용 |
| ---- | ---- | ---- |
| 1 (tracer) | `8c3edffa` | 선택 표 selection · ListScreen 버튼 갈래 · 갤러리 표 선택 |
| 2 | `e85f29ef` | 고르기 목록 SP-8 · 확인 모달 첨부 보기 칸 SP-7 · 갤러리 표본 |
| 3 | `72da5553` | DOM 자체 실측 결함 셋 수정 + 점검표 갱신 |

## ⓪ 게이트 결과

| 항목 | 결과 |
| ---- | ---- |
| `pnpm lint` | 통과(각 커밋 전) |
| `pnpm typecheck` | 통과 |
| `pnpm exec vitest run --project unit test/unit/ui` | 51 파일 667 통과 |
| E2E(`CI=true`) dev-components · expense-new · expense-a11y · quote-table | 88 통과 · 1 실패(flaky) · 18 skip |
| quote-table 실패 1건 | 「10줄 표 1번째 줄에 45줄…」 — 단독 재실행 1 passed, Task 1 실행에서도 통과. 2 워커 동시 실행 flaky로 06-29 변경과 무관(조율자의 `pkill`과 겹쳤을 가능성) |
| 수용 grep | TableSelection 1 · reconcileSelection 1 · 폭 calc 2 · accent-weak 7 · `1023.98px` 1 · `onClick` 2 · tokens.css · use-grid-keyboard.ts diff 0 · `noneSelectableReason\|emptyNextStep\|failedLine` 14 · `"프로젝트"` 1 · pickFootLine export 1 · ConfirmDialog 새 props 3 · 보호 경로 diff 0 |
| design-gate 점검표 | `docs/design/checks/2026-10-06-06-29-phase6-components.md` 모든 항목 `- [x]` + 근거, 「화면:」 줄에 커밋한 화면 폴더 전부 |

## A-PICK — 05 PickDialog에 이미 있던 것과 새로 더한 것

| 항목 | 05에 이미 있음 | 이번에 더함 |
| ---- | -------------- | ----------- |
| ⑴ 행 막기(고를 수 없는 행 `aria-disabled` + 이유 2행) | 있음 | — |
| ⑵ 현재 행 표시(`current`) | 있음 | — |
| ⑶ 1차 라벨 + kbd Enter | 있음 | — |
| 로드 · 오류 중 1차 비활성 | 없음 | `chosen = !loading && !failed && activeRow?.selectable ? activeRow : null`, 1차 `aria-describedby` → 오류 줄 id |
| 오류 줄 + 2차 `다시 시도` | 없음 | `failedLine`(기본 `목록 불러오기 실패`), `.error` 위험 색 |
| 고를 수 있는 줄 0 바닥 줄 + 다음 한 수 | 없음 | `noneSelectableReason`(E-24 — 본문 고정 줄 생략), `emptyNextStep` 3차 |
| Esc · Ctrl+Enter | 없음 | Esc `preventDefault` + 닫기, Ctrl+Enter `preventDefault` + `stopPropagation`(패널 제출로 번지지 않음) |
| noun `프로젝트` | 없음 | `"줄" \| "거래처" \| "프로젝트"` |

이름 차이: 플랜 문구와 코드 이름이 달랐던 곳 없음.

## DOM 자체 실측 (독립 감사 아님 — 실행자 자체 측정)

`CI=true` 프로덕션 빌드의 `/dev/components` · `?panel=pick`을 1280 · 768 · 375 · 320 폭에서 임시 Playwright로 실측(커밋하지 않음). 49개 판정 중 최초 결함 넷(아래 표 ※) 수정 후 재실측 49 PASS · 0 FAIL.

| 항목 | 실측 |
| ---- | ---- |
| 선택 열 폭(1280) | 44px |
| 고른 행 계산 색 | `--accent-weak` rgb(235,242,240) |
| 막힌 행 배경 | 투명 (※ 최초 FAIL은 마우스 hover 측정 오류, 마우스를 치우고 재측정 PASS) |
| 막힘 이유 글자 색 | `--status-danger` rgb(155,28,28) |
| `aria-selected` 개수(선택 표) | 0 |
| 첨부 칸 높이 | 첫 세 행 높이와 같음(PC 194 · 폰 326) ※ 폰 상한이 PC 값이라 고침 |
| 120줄 목록 | 대화상자 안에서 스크롤, 행동 줄 고정 |
| 대화상자 높이 | ≤ `--sheet-max-h` 704 |
| 패널 위 고르기 목록 폭 | 1280 · 768 480, 폰 전체 폭 |
| 폰 터치 | 1차 · 취소 · 3차 · `다시 시도` 모두 44 (※ `다시 시도` 40이라 고침) |
| 긴 부제 | ellipsis에 `title` 없음 → `title={row.subtitle}` 추가 ※ |

## 쓰는 쪽 계약

| 이름 | 종류 | 쓰는 계획 | UI-SPEC 위치 |
| ---- | ---- | --------- | ------------ |
| `TableSelection<Row>` {selectedIds, selectable, onChange, rowLabel, blockedReason?, onPrimary?} | `ui/table` prop | 06-07 · 06-14 | §7-3(카) · SP-1 |
| `reconcileSelection(selectedIds, rows, getRowId, selectable)` | 함수 — 결과가 도착한 뒤 호출, 지금 고를 수 있는 id만 순서대로 남김. **서버 재판정 필수(T-06-290)** | 06-07 · 06-14 | SP-1 H-3 |
| `ListPrimaryAction` 버튼 갈래 {label, onClick, shortcut?, disabledReason?, reasonTone?, pending?} | `ListScreen.primaryAction` — 클라이언트 렌더 전용, 1024 미만 숨김(DR-36), `empty`면 숨김 | 06-15 | §7-3 |
| `PickDialog` `noneSelectableReason` · `emptyNextStep` · `failedLine` | prop — 모달 겹침은 최대 둘, 다음 빈 `바꾸기`로 포커스 옮기기는 호출자 몫 | 06-17 | §7-7 · SP-8 |
| `ConfirmDialog` `attachments` | prop — 05 `Attachments mode="read"` · `canAdd={false}` · `deletableIds={[]}`를 넘김 | 06-17 | §7-17 · SP-7 |
| `ConfirmDialog` `loading` | prop — 열 때 읽는 동안 `…` + 1차 비활성 | 06-17 | SP-7 상태 계약 ⑴ |
| `ConfirmDialog` `refreshKeepsOpen` | prop — 거절 후 새로 고침이 모달을 닫지 않음. **호출자는 새 props에서 거절 상태를 지워야 한다** | 06-17 | SP-7 상태 계약 ⑵ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `refreshKeepsOpen` 새로 고침 뒤 포커스가 1차로 돌아가지 않음**
- **Found during:** Task 2 E2E 「모달 첨부 표본」
- **Issue:** 호출자가 새 props를 주면 `RefreshStep`이 `onDone` 전에 사라진다
- **Fix:** `awaitingRefreshRef` + `refreshSplit.refresh`가 사라질 때 1차로 포커스하는 effect
- **Commit:** `e85f29ef`

**2. [Rule 1 - Bug] 폰 첨부 칸 상한이 PC 값(194 vs 326)** — 폰에서 `max-height`가 읽기 행 셋보다 낮았다. 폰 `@media` 안 상한 추가. **Commit:** `72da5553`

**3. [Rule 1 - Bug] 긴 부제 ellipsis에 `title` 없음** — `rowSub`에 `title={row.subtitle}`. **Commit:** `72da5553`

**4. [Rule 1 - Bug] 폰 시트 `다시 시도` 높이 40** — `.error button { min-height: var(--touch-min) }`. **Commit:** `72da5553`

**5. [Rule 3 - Blocking] 린트 · 단위 테스트 막힘 셋** — `gallery-client.tsx` `styles` import 누락, async no-op의 `require-await`(→ `Promise.resolve`), 페이지 렌더 `Date.now()` purity(→ `serverStamp()` helper), `PickDialog` `event.metaKey` shortcut-notation 위반(→ `event.ctrlKey`만). **Commit:** `8c3edffa` · `e85f29ef`

### 플랜과 다르게 한 것

- **TDD RED 순서:** ConfirmDialog 단위 테스트는 구현 뒤에 작성했다. 임시로 ConfirmDialog 두 파일을 `git checkout -- <file>`로 되돌려 RED(실패)를 관찰한 뒤 복원했다. Task 1 · 2의 E2E는 코드보다 먼저 썼으나 RED 상태로 돌리지 않았고 단위 RED만 관찰했다.
- **갤러리 `?panel=pick`:** 서버 시각은 `serverStamp()` helper로 뺐다(렌더 purity 린트).
- **Task 3 ②:** 독립 DOM 감사는 서브에이전트를 띄울 수 없어 실행자 자체 실측으로 대신했고 비독립으로 표시했다. 오케스트레이터가 독립 감사를 보내야 한다.
- **Task 3 ⑤ 시각 기준선:** 로컬에서 만들지 않았다(오케스트레이터 지시). verify의 「기준선 커밋 존재」 확인은 로컬에서 통과하지 않는다 — 아래 재생성 목록 참고.
- **데이터 URI 썸네일 불가:** `Attachments` files에 미리보기 필드가 없어 05 읽기 행의 클립 칸 48x48(`--s-12`, 썸네일과 같은 크기)로 대신했다.
- **선택 표는 1024 이상 전용**(DR-36) — 폰에서는 그리지 않는다.
- 수동 편집 파일 16개(상한 17 이하, 17번째 파일 중단 규칙 미발동).

## Known Stubs

없음. 갤러리 표본의 목 데이터는 `/dev/components` 전용이다.

## Threat Flags

없음. 새 네트워크 · 인증 · 파일 접근 경로 없음 — T-06-290(서버 재판정)은 쓰는 쪽 계약에 적었다.

## 오케스트레이터에게 — 독립 DOM 감사 항목 (4폭, `CI=true`)

- SP-1: 선택 열 폭 44 · 고른 행 계산 색 · 막힌 행 배경 없음 · 이유 id 연결 · `aria-selected` 0
- SP-8: `느림`(loading) · `많음`(overflow) · `긴`(long text) · 오류 줄 색 · `?panel=pick` 겹침 높이 ≤ `--sheet-max-h`
- SP-7: 첨부 칸 높이 · 스크롤 · 머리 고정 · 행동 줄 고정 · 폰 본문 배치
- 새 색 · 서체 · radius 없음 · 터치 44

## 시각 기준선 재생성 필요 (CI `visual-baseline.yml`)

`dev-components` 1280 · `dev-components` 390, 배경 차이만이면 `dev-components-panel`도. 로컬에서는 만들지 않았다.

## Self-Check: PASSED

생성 파일 · 커밋 세 개(`8c3edffa` `e85f29ef` `72da5553`) 모두 존재 확인.
