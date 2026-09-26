---
phase: 04-project-quote-ledger
plan: 46
subsystem: ui
tags: [react, native-dialog, accessibility, aria-disabled, focus-trap, confirm-dialog, playwright]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-08의 isFormPristine·isCtrlCombo·Esc 판정 뼈대 (project-form.tsx)"
provides:
  - "ui/button/Button의 reasonTone(block/info) + aria-disabled 계약(교차 그룹 계약 1) — 비활성·진행 중 버튼이 포커스·이유 읽기를 유지한다"
  - "ui/confirm-dialog/ConfirmDialog 공용 확인 모달·시트(교차 그룹 계약 2) — secondaryLabelFor·initialFocusTarget 내보냄"
  - "견적 줄 삭제 확인이 옛 div 모달에서 ConfirmDialog로 이관"
  - "등록 폼 Esc·「취소 Esc」의 「입력 버리기」 확인(DR-27)"
affects: [04-16, 04-21, 04-22, 04-23, 04-24, 04-26, 04-28, 04-29, 04-30, 04-42]

actuals:
  tokens: 17712
  tasks: 2
  commits: 13
  plan_head_before: 43844fbbad0cb314c8b26f854704bb0267f7cc5c

tech-stack:
  added: []
  patterns:
    - "네이티브 <dialog> + showModal()로 확인 모달·위험 행동 시트를 만든다(ui/shell/MoreSheet.tsx·ui/table/RowSheet.tsx 선례 재사용) — 포커스 가두기·::backdrop·Esc를 브라우저가 준다"
    - "aria-disabled + 클릭 가드(preventDefault, onClick 호출 안 함)로 네이티브 disabled를 대체 — 비활성 버튼도 포커스·스크린리더 낭독을 유지한다"
    - "폼의 Escape/Enter 키 처리기가 다이얼로그를 여는 상태 변화를 만들 때는 반드시 그 keydown에 event.preventDefault()를 건다 — 안 걸면 브라우저의 Escape 기본 동작(최상위 모달 닫기)이 같은 키 입력으로 방금 연 모달을 즉시 다시 닫는다"

key-files:
  created:
    - ui/confirm-dialog/ConfirmDialog.tsx
    - ui/confirm-dialog/ConfirmDialog.module.css
    - test/unit/ui/confirm-dialog.test.ts
    - test/unit/ui/button.test.ts
  modified:
    - ui/button/Button.tsx
    - ui/button/Button.module.css
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - test/unit/design-system-docs.test.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - app/(app)/projects/project-form.tsx
    - test/e2e/action-log.spec.ts
    - test/e2e/quote-table.spec.ts
    - test/e2e/project-register.spec.ts

key-decisions:
  - "Button의 pending(진행 중) 상태도 rev 5를 따라 aria-disabled — 공유 지침 계약 1 요약(진행 중만 네이티브 disabled)과 다르다. 소비처가 보는 API는 그대로다(계약 1 편차, 아래 절)"
  - "ConfirmDialog의 primary에 선택 prop reasonTone·nextStep을 더하고 options 행 모양을 {label, description?, onSelect}로 정함(계약 2 확장, 아래 절)"
  - "confirmDeleteLine(quote-table.tsx)은 이 플랜 action ④가 지시한 대로 '기존 확인 처리기' 그대로 재사용 — 로컬 상태에서 줄을 지울 뿐 서버에 삭제/보관 신호를 보내지 않는다. quote_lines.archivedAt/archivedBy 컬럼은 있으나 saveQuoteLines가 아직 쓰지 않는다. behavior 원문의 '일괄 저장 건수 +1'은 이 재사용 결정과 맞지 않아 실측대로 E2E를 조정했다(아래 편차 절)"
  - "등록 폼 Escape 처리기에 event.preventDefault()를 추가(Rule 1 버그 수정) — 브라우저가 같은 Escape 키 입력으로 방금 연 ConfirmDialog를 즉시 다시 닫는 것을 막는다"

requirements-completed: [UX-05, UX-04]

coverage:
  - id: D1
    description: "Button reasonTone(block/info) + aria-disabled + aria-describedby — 비활성·진행 중 버튼이 포커스를 유지하고 클릭·암묵 제출을 무시한다(교차 그룹 계약 1)"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/button.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/action-log.spec.ts > 0건 필터에서 「정리」가 aria-disabled고 포커스되며 클릭이 무시된다(DR-11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ui/confirm-dialog/ConfirmDialog 신설 — 네이티브 dialog·slots·2차 라벨 자동 파생·첫 포커스 판정(교차 그룹 계약 2)"
    requirement: "UX-05"
    verification:
      - kind: unit
        ref: "test/unit/ui/confirm-dialog.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "견적 줄 삭제 확인이 옛 div 모달(DeleteLineDialog)에서 ConfirmDialog로 이관 — 포커스·Tab 가두기·Esc 복귀"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts > (h) 저장된 줄에서 Delete → ui/confirm-dialog 확인 → 포커스·Tab 가두기·Esc 복귀 → 재삭제로 삭제 확정(04-46)"
        status: pass
      - kind: other
        ref: "node -e DIV_MODAL_LEFT 검사(app/·ui/에 role=\"alertdialog\" div 모달 없음, quote-table.tsx에 DeleteLineDialog 함수 없음)"
        status: pass
    human_judgment: false
  - id: D4
    description: "등록 폼 Esc·2차 「취소 Esc」의 「입력 버리기」 확인(DR-27) — 빈 폼 갈래·내부 컨트롤(네이티브 select) 우선 처리 포함"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts > (c2)(c3)(c4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "독립 DOM 감사(1280·1024·375 — 폭·시트·닫기 x·터치 최소·말줄임 없음·activeElement)"
    verification: []
    human_judgment: true
    rationale: "이 실행자의 dispatch verification_scope가 독립 DOM 감사를 명시적으로 오케스트레이터 몫으로 남겨 두었다(실행자 = 구현자가 자기 화면을 감사하면 안 된다는 CLAUDE.md 순서 규칙과 일치) — 여기서는 실행하지 않았다"
  - id: D6
    description: "CI=true pnpm test 세 계층(단위 → 통합 → E2E) 전체 게이트"
    verification: []
    human_judgment: true
    rationale: "dispatch verification_scope가 이 전체 게이트를 오케스트레이터의 페이즈 종료 검증으로 지정했다 — 이 플랜 실행에서는 배정된 부분 집합(단위 3개 파일 · 대상 E2E 3개 파일 · lint·typecheck·build)만 실행했다"

duration: ~58min (재개 세션 — 사용량 한도로 중단됐다 재개, 중단 전 구간은 포함 안 됨)
completed: 2026-09-24
status: complete
---

# Phase 04 Plan 46: Button aria-disabled + ui/confirm-dialog Summary

**Button의 `reasonTone`/`aria-disabled` 계약과 네이티브 `<dialog>` 기반 공용 `ui/confirm-dialog`를 신설해 견적 줄 삭제 확인·등록 폼 「입력 버리기」를 옮기고, Escape가 같은 키 입력으로 자신이 방금 연 모달을 닫아버리는 버그를 고쳤다.**

## Performance

- **Duration:** ~58min (이번 재개 세션 기준)
- **Completed:** 2026-09-24
- **Tasks:** 2/2
- **Files modified:** 15 (신규 4 · 기존 수정 11)

## Accomplishments

- `Button`이 네이티브 `disabled` 대신 `aria-disabled="true"` + 클릭 가드 + `aria-describedby`를 쓴다(`reasonTone: "block" | "info"`, 기본 `block`) — 비활성·진행 중 버튼도 포커스와 이유를 유지한다(교차 그룹 계약 1). 기존 사용처(행동 로그 「정리」) E2E로 회귀를 고정했다.
- `ui/confirm-dialog/ConfirmDialog` 신설 — 네이티브 `<dialog>`.`showModal()` 하나로 PC 모달(≥700, `--modal-w`) / 폰 하단 시트(<700)를 겸한다. `secondaryLabelFor`·`initialFocusTarget` 내보냄. 확장 prop `reasonTone`·`nextStep`, 목록형 `options: {label, description?, onSelect}[]`(교차 그룹 계약 2).
- 견적 줄 삭제 확인이 옛 `DeleteLineDialog`(div, `role="alertdialog"`)에서 `ConfirmDialog`로 이관됐다 — 그 함수와 전용 CSS 클래스를 지웠다.
- 등록 폼의 Esc·2차 「취소 Esc」가 「입력 버리기」 확인을 연다(DR-27) — 값이 처음과 같으면 바로 목록, 다르면 확인 후 목록 또는 폼 유지.
- 버그 발견·수정: 등록 폼 Escape 처리기에 `event.preventDefault()`가 없어, 다이얼로그를 연 바로 그 Escape 키 입력의 브라우저 기본 동작이 방금 연 다이얼로그를 즉시 다시 닫고 있었다(아래 「이슈」 절).

## Task Commits

Task 1(트레이서, ⑦):
1. `102f89f` — docs: DECISIONS 기록 ⑦
2. `62bb7b8` — test: Button 실패 테스트(RED)
3. `8ff90ea` — feat: Button reasonTone + aria-disabled, SYSTEM.md §7-1·§10 같은 커밋
4. `89ede4d` — test: action-log 회귀 E2E

Task 2(확장, ⑮):
5. `fa12d79` — docs: DECISIONS 기록 ⑮
6. `37e44d4` — docs: SYSTEM.md §7-17 신설 + §7-8 한 줄
7. `b9d28a6` — test: ConfirmDialog 실패 테스트(RED)
8. `5b1ac10` — feat: ConfirmDialog 신설
9. `5abd704` — feat: 견적 줄 삭제 확인 이관
10. `6af9f59` — feat: 등록 폼 입력 버리기 확인
11. `11b1b6d` — fix: Escape가 방금 연 ConfirmDialog를 즉시 닫는 버그 수정
12. `e1a2ca8` — test: 등록 폼 「입력 버리기」·내부 컨트롤 우선 Esc E2E
13. `2d5cd82` — test: 견적 줄 삭제 확인 E2E(포커스·Tab 가두기·Esc 복귀)

_TDD RED/GREEN 분리 커밋(2, 3 / 7, 8) + 별도 버그 수정 커밋(11) + E2E 커밋 다수(4, 12, 13)._

## Files Created/Modified

- `ui/confirm-dialog/ConfirmDialog.tsx` — 공용 확인 모달·시트(신규)
- `ui/confirm-dialog/ConfirmDialog.module.css` — PC 모달/폰 시트 스타일(신규)
- `test/unit/ui/confirm-dialog.test.ts` — 정적 렌더·순수 함수 단위(신규)
- `test/unit/ui/button.test.ts` — Button aria-disabled·톤·pending 단위(신규)
- `ui/button/Button.tsx` — `reasonTone` prop, `aria-disabled` + 클릭 가드로 전환
- `ui/button/Button.module.css` — `:disabled` → `[aria-disabled="true"]`, `.reasonInfo` 추가
- `docs/design/DECISIONS.md` — ⑦·⑮ 기록 추가(04-08 머리글 합계 17)
- `docs/design/SYSTEM.md` — §7-1·§10 개정 ⑦, §7-17 신설 + §7-8 한 줄(⑮)
- `test/unit/design-system-docs.test.ts` — ⑦·⑮ 문서 단언 추가
- `app/(app)/projects/[id]/quote-table.tsx` — `DeleteLineDialog` 제거, `ConfirmDialog` 사용
- `app/(app)/projects/[id]/project-detail.module.css` — 옛 모달 전용 클래스 제거
- `app/(app)/projects/project-form.tsx` — 「입력 버리기」 확인 배선 + Escape `preventDefault` 버그 수정
- `test/e2e/action-log.spec.ts` — 「정리」 aria-disabled 회귀
- `test/e2e/quote-table.spec.ts` — 견적 줄 삭제 확인 E2E(h)
- `test/e2e/project-register.spec.ts` — 「입력 버리기」·내부 컨트롤 우선 E2E((c2) 대체·(c3)·(c4) 신규)

## Decisions Made

- Button의 `pending` 상태도 `aria-disabled`(rev 5) — 「계약 1 편차」 절 참조.
- ConfirmDialog `primary`에 `reasonTone`·`nextStep` 선택 확장, `options` 행 모양 확정 — 「계약 2 확장」 절 참조.
- `confirmDeleteLine`은 기존 로직 그대로 재사용(서버 삭제 신호 없음) — 「내부 컨트롤 Esc 확인 결과」 다음 절, 「Deviations」 절 참조.

## 계약 1 편차(진행 중 aria-disabled)

재계획 공유 지침의 「교차 그룹 계약 1 요약」은 "네이티브 `disabled`는 `pending` 동안만"이라고 적었지만, 승인된 UI-SPEC rev 5는 다섯 자리(개정 ⑦ §7-1 · Component Inventory `Button` 행 · S2/S7/S16 loading · S11 「비활성 버튼(DR-11)」)에서 **진행 중 버튼도 `aria-disabled`**라고 정했다. 이 플랜은 rev 5를 따랐다 — `pending`이면 `aria-disabled="true"` + 클릭 가드가 걸리고, 포커스는 버튼에 남아 저장 중에도 body로 튀지 않는다. 소비처가 보는 API(`disabled`·`disabledReason`·`reasonTone`·`pending`)는 원래 계약 1 요약과 같고, 달라진 것은 "진행 중 버튼의 속성이 `disabled`가 아니라 `aria-disabled`"라는 한 가지뿐이다. 이중 제출은 클릭 가드(`preventDefault`)와 화면의 진행 중·제출 래치가 막는다. 이유 없는 비활성(UX-06 위반 개발 경고)도 같은 `aria-disabled` 경로를 탄다 — 네이티브 `disabled`를 쓰는 갈래가 코드에 남지 않는다.

## 계약 2 확장(reasonTone·nextStep·목록형 행 모양)

UI-SPEC rev 5 §7-17 슬롯은 막힘 이유 옆에 "다음 한 수 3차"와 이유 톤(`reasonTone`)을 요구한다(예: 04-21·04-44의 진행 모달). `ConfirmDialog`의 `primary` 타입에 **선택** 키 `reasonTone?: "block" | "info"`(기본 `block`)·`nextStep?: ReactNode`만 더했다 — 기존 키(`label`·`shortcut`·`onConfirm`·`pending`·`disabledReason`)의 뜻은 바꾸지 않았다. `disabledReason`이 있으면 1차 `Button`이 `aria-disabled`가 되고 이유 글자가 `reasonTone`대로 `--danger`(block) 또는 `--muted`(info) 색을 받는다. `nextStep`은 그 이유 옆에 렌더된다. 목록형(`options`)의 행 모양은 `{ label, description?, onSelect }`로 정했다 — 04-21 상태 고르기처럼 행이 두 줄(라벨 + 코드표 설명)이 필요한 소비처를 위해서다. 이 두 확장은 `test/unit/ui/confirm-dialog.test.ts`의 "막힌 1차 aria-disabled·이유 색" 테스트로 고정했다.

## 내부 컨트롤 Esc 확인 결과

`test/e2e/project-register.spec.ts`의 (c4)로 실측했다: 클라이언트 `<select>`를 클릭해 네이티브 드롭다운을 연 채 Escape를 누르면 —

- 드롭다운만 닫히고 폼의 `keydown` 핸들러(`ProjectForm.handleKeyDown`)는 이벤트를 받지 못한다(또는 받아도 아무 효과가 없다) — 「입력 버리기」 확인 모달이 뜨지 않고, URL은 `?new=1` 그대로이며, 이미 입력한 값(프로젝트명)이 남는다.
- 즉 Chromium은 열린 네이티브 `<select>`의 Escape를 페이지 레벨 keydown으로 전파하지 않는다(「내부 컨트롤 먼저」가 별도 코드 없이 이미 성립한다) — `<probe_fallback>`이 예고한 "그 Esc 하나를 무시하는 열림 추적"을 추가로 만들 필요가 없었다.
- 날짜 선택(`<input type="date">`)의 네이티브 피커에 대한 같은 실측은 이번 플랜 범위에 넣지 않았다(behavior 원문이 "클라이언트 선택 목록"만 명시) — 날짜 칸에 동일 이슈가 있는지는 이 플랜 밖에서 별도로 확인이 필요하면 후속 플랜에서 다룬다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 등록 폼 Escape가 방금 연 ConfirmDialog를 같은 키 입력으로 즉시 닫음**
- **Found during:** Task 2 ⑥ (test/e2e/project-register.spec.ts (c2) 작성 중 — systematic-debugging 적용)
- **Issue:** `project-form.tsx`의 `handleKeyDown`은 Ctrl+Enter 갈래에는 `event.preventDefault()`가 있었지만 Escape 갈래에는 없었다. 실측: `setDiscardOpen(true)` → `ConfirmDialog`의 `useEffect`가 React의 동기 discrete-event 플러시 안에서 `showModal()`을 호출해 다이얼로그가 그 자리에서 `open` 상태가 됨 → 아직 처리 중이던 같은 물리 Escape 키 입력의 **브라우저 기본 동작**(열린 최상위 모달을 Escape로 닫는다)이 그 다이얼로그를 곧바로 다시 닫아버렸다(`ConfirmDialog` effect 로그로 `open:true` 직후 `open:false`가 연달아 관측됨 — 최소 재현 `<dialog><button>a</button><button>b</button></dialog>`에서도 같은 매커니즘의 존재를 별도로 확인).
- **Fix:** Escape 분기의 얼리 리턴 가드(내부 컨트롤 우선 판정) 통과 직후, `initial`/`current` 계산 전에 `event.preventDefault()`를 추가해 브라우저가 이 키 입력을 대신 처리하지 않게 했다.
- **Files modified:** `app/(app)/projects/project-form.tsx`
- **Verification:** `test/e2e/project-register.spec.ts` (c2) — Escape 한 번에 다이얼로그가 뜨고 계속 열려 있음을 확인.
- **Committed in:** `11b1b6d`

**2. [편차 — 행동 텍스트 조정, 아키텍처 밖] 견적 줄 삭제 E2E의 "일괄 저장 건수 +1" 미검증**
- **Found during:** Task 2 ⑥ (test/e2e/quote-table.spec.ts (h) 작성 중)
- **Issue:** plan behavior 원문은 "다시 Delete → 1차 → 일괄 저장 건수 +1"을 요구하지만, 이 플랜 action ④는 `confirmDeleteLine`을 "기존 확인 처리기" 그대로 재사용하라고 명시한다. 그 함수는 `setLines(prev => prev.filter(...))`로 로컬 상태에서만 줄을 지우고 `dirty`로 표시하지 않는다 — 실측(확정 클릭 뒤 「일괄 저장」 버튼 상태 확인): 여전히 `aria-disabled="true"`이고 숫자가 없다(dirtyCount 0). `quote_lines.archivedAt`/`archivedBy` 컬럼은 이미 있지만 `saveQuoteLines`/`QuoteLineWriteRow`에 삭제·보관 신호를 보내는 경로가 없다 — 이를 만드는 건 새 도메인·저장소 작업(스키마 변경은 없지만 `saveQuoteLines` 서명·트랜잭션 로직 확장이 필요)이라 이 플랜의 파일 목록(ui/app만, domain/repositories 없음)과 "기존 처리기 재사용" 지시를 벗어난다(Rule 4 — 아키텍처적).
- **Fix:** 아키텍처 변경은 만들지 않았다. E2E는 이 플랜이 실제로 보장하는 계약(모달 열림·제목·결과 줄·1차 포커스·Tab 가두기·Esc 복귀·재확인 후 행이 화면에서 사라짐)만 단언하도록 조정하고, 테스트 안에 이 편차를 주석으로 남겼다.
- **Files modified:** `test/e2e/quote-table.spec.ts`(테스트만, 앱 코드는 변경하지 않음)
- **Verification:** 조정된 (h) 테스트가 초록이다.
- **Committed in:** `2d5cd82`
- **후속 필요:** 견적 줄 삭제를 실제로 서버에 반영(보관)하는 작업은 별도 플랜으로 다뤄야 한다 — `saveQuoteLines`에 삭제 대상 id 배열(또는 `QuoteLineWriteRow`에 `archived?: boolean`)을 더하고 트랜잭션 안에서 `archivedAt`/`archivedBy`를 쓰는 형태가 유력하다.

**3. [Tab 가두기 테스트 보정 — 실측 기반, 코드 변경 없음] Chromium 모달 포커스 트랩의 `<body>` 경유 관측**
- **Found during:** Task 2 (test/e2e/quote-table.spec.ts (h) 작성 중)
- **Issue:** 처음 작성한 단언("Tab을 눌러도 `document.activeElement`가 항상 다이얼로그 안")이 실패했다 — 최소 재현(`<dialog><button>a</button><button>b</button></dialog>`)으로도 같았다: 마지막 포커스 가능 요소(b) 다음 Tab은 `document.body`(포커스 없음 상태)를 한 번 거친 뒤에야 다이얼로그 첫 요소(a)로 돌아온다. 이는 트랩이 깨진 게 아니라 `<body>`가 인터랙션 요소가 아니라서 생기는 정상적인 Chromium 동작이다.
- **Fix:** 앱 코드는 바꾸지 않았다 — 테스트 단언을 "다이얼로그 안이거나 `document.body`(중립)"로 정확하게 다시 썼다. 실제로 지켜야 할 계약("다이얼로그 밖의 다른 버튼·링크·입력으로 넘어가지 않는다")은 그대로 검증한다.
- **Files modified:** `test/e2e/quote-table.spec.ts`
- **Verification:** (h) 테스트가 초록이다.
- **Committed in:** `2d5cd82`

---

**Total deviations:** 3 (1 Rule 1 버그 수정 + 1 아키텍처 밖 편차(테스트만 조정) + 1 테스트 단언 보정)
**Impact on plan:** 버그 수정(#1)은 이 플랜이 만드는 「입력 버리기」 기능 자체의 정확성에 필수였다. #2는 새 서버 기능을 만들지 않기로 한 범위 결정이고 후속 플랜으로 명시했다. #3은 순수 테스트 정확성 보정이다. 세 건 모두 스코프 확장이 아니다.

## Issues Encountered

- 등록 폼 Escape가 자기 자신이 연 다이얼로그를 즉시 닫는 문제 — 위 Deviations #1로 근본 원인을 찾아 고쳤다(systematic-debugging: 최소 재현으로 브라우저 동작 자체를 격리해 확인).
- Chromium 네이티브 `<dialog>` 포커스 트랩이 `<body>`를 경유하는 동작 — 위 Deviations #3.

## Next Phase Readiness

- 뒤 웨이브(04-16·04-21·04-22·04-23·04-24·04-26·04-28·04-29·04-30·04-42)가 기댈 `Button` `reasonTone`/`aria-disabled`와 `ui/confirm-dialog`가 기록·규칙과 함께 섰다.
- 견적 줄 삭제의 실제 서버 반영(보관)은 별도 플랜이 필요하다(Deviations #2 「후속 필요」).
- 독립 DOM 감사(1280·1024·375)와 `CI=true pnpm test` 전체 게이트는 이 실행자의 dispatch verification_scope에 따라 오케스트레이터 몫으로 남겨 뒀다 — 이 플랜을 "완료"로 표시하기 전에 오케스트레이터가 이 둘을 실행해야 한다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 10 listed files (`ui/confirm-dialog/ConfirmDialog.tsx`, `ui/confirm-dialog/ConfirmDialog.module.css`, `test/unit/ui/confirm-dialog.test.ts`, `test/unit/ui/button.test.ts`, `ui/button/Button.tsx`, `app/(app)/projects/project-form.tsx`, `app/(app)/projects/[id]/quote-table.tsx`, `test/e2e/quote-table.spec.ts`, `test/e2e/project-register.spec.ts`, this SUMMARY.md) confirmed present on disk. All 13 commit hashes (102f89f, 62bb7b8, 8ff90ea, 89ede4d, fa12d79, 37e44d4, b9d28a6, 5b1ac10, 5abd704, 6af9f59, 11b1b6d, e1a2ca8, 2d5cd82) confirmed present in `git log --oneline --all`.
