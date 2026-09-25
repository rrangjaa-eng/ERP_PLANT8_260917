---
phase: 04-project-quote-ledger
plan: 26
subsystem: api, ui
tags: [quote-lines, line-cap, settings-registry, gate, drizzle, playwright]

requires:
  - phase: 04-12
    provides: "prepareQuoteLineSave / writeQuoteLinesInTx 3단 저장 · loadProjectForGate 프로젝트 행 잠금 · restoreQuoteLine · 멱등 삽입(ENG-D10)"
  - phase: 04-30
    provides: "견적 표 구조 판정(structural) 배선 · quote-edit-scope E2E"
  - phase: 04-46
    provides: "Button disabled + disabledReason(aria-disabled · aria-describedby · reasonTone block)"
  - phase: 04-49
    provides: "useEditableWidth 폭 규칙(1024 미만 「줄 추가」 없음)"
provides:
  - "설정 키 quote_line.max_per_revision(QUOTE_LINE_MAX_PER_REVISION, 단순값, 기본 300, 네임스페이스 「견적 표」)"
  - "게이트 quote.line-cap(newLines > 0 && countAfter > cap → 「{cap}줄 상한을 넘음 · 전부 거부」)"
  - "countActiveLinesByRevision(repositories/quote-lines.ts — 보관 제외, 취소 포함)"
  - "PreparedQuoteLineSave.lineCap(트랜잭션 전에 읽는 상한)"
  - "QuoteLedger lineCap prop · 「줄 추가」 비활성 · Ctrl+Enter/Ctrl+D 무동작 · 붙여넣기 전부 거부 · 합계 행 상한 글자"
  - "E2E 도우미 focusGridCell · capRows/capCell(300줄 표용 XPath 찾기)"
affects: [04-13, 04-15, 04-19, 04-47, 04-31]

actuals:
  tokens: 10600
  tasks: 2
  commits: 5
plan_head_before: 96f2f355edafd6dd58dfdd021f8e24bc67ede942

tech-stack:
  added: []
  patterns:
    - "상한 값(설정)은 트랜잭션 전에 읽고, 줄 수는 프로젝트 행 잠금 뒤 같은 tx로 센다 — 게이트는 줄을 더할 때만 판정"
    - "300줄 표 E2E는 Playwright `:has()` 대신 XPath로 행·칸을 찾는다"
    - "격자 칸에 키·붙여넣기를 보내기 전 그 칸이 탭 정지(tabindex 0)가 됐는지 확인한다(수화 전 포커스 유실 방지)"

key-files:
  created:
    - test/integration/quote-line-cap.test.ts
  modified:
    - domain/settings/keys.ts
    - domain/rules/register.ts
    - domain/quotes/lines.ts
    - repositories/quote-lines.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/e2e/quote-edit-scope.spec.ts

key-decisions:
  - "writeQuoteLinesInTx의 「현재 활성 줄 수」는 이미 잠금 뒤 tx로 읽은 activeBefore.length를 쓴다(같은 집합을 한 번 더 세지 않는다). countActiveLinesByRevision은 목록이 없는 restoreQuoteLine이 쓴다"
  - "상한 판정은 (d) 끝 — 소속·구조·칸 게이트가 먼저 거부하면 그 이유가 이긴다. 거부는 기존 denyWrite 한 지점을 지난다(write.denied 한 번)"
  - "「줄 추가」를 원시 <button>에서 04-46의 3차 Button으로 바꿨다(비활성 이유·aria-describedby를 그 컴포넌트가 준다). .addLineButton은 간격(margin-top)만 남겼다"
  - "상한 글자의 지우기는 저장 이벤트 쪽(attemptSave · 표 onSave)에서 한다 — handleSave는 Ctrl+S 경로에서 효과로 불려 그 안의 setState가 react-hooks 린트에 걸린다"
  - "거부된 붙여넣기는 앞 붙여넣기의 「오른쪽 N칸 버림」 경고도 지운다(한 칸도 적용되지 않았으므로)"

patterns-established:
  - "설정 기반 상한: 설정 조회는 prepare 단계, 셈은 잠금 뒤 tx, 판정은 게이트 규칙(04-13 조정·견적 외 비용 줄도 같은 셈을 지난다)"

requirements-completed: [UX-04, UX-05]

coverage:
  - id: D1
    description: "서버가 차수당 줄 상한을 지킨다 — 새 줄 거부 · DB 무변경 · 보관 제외 · 취소 포함 · 설정 5 통과 · 상한을 낮춘 뒤 고치기/보관 통과 · 복원 상한 · 재전송 한 번만 셈 · 클라이언트 우회 배치 거부"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/quote-line-cap.test.ts#(1)~(8)"
        status: pass
    human_judgment: false
  - id: D2
    description: "두 연결 동시 추가가 상한을 넘지 않는다(두 순서 모두, 결정적 경합)"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/quote-line-cap.test.ts#(9)"
        status: pass
    human_judgment: false
  - id: D3
    description: "줄 300에서 「줄 추가」 aria-disabled + 이유 「300줄 상한 · 상한은 관리자 설정」(aria-describedby)"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#(cap1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ctrl+Enter·Ctrl+D 상한 무동작 + 합계 행 이유, 다음 저장 시도 뒤 사라짐"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#(cap2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "상한을 넘는 붙여넣기 전부 거부(셀 무변경) + 「붙여넣기 전부 거부 · 300줄 상한을 1줄 넘음」, 다음 붙여넣기 때 사라짐"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/quote-edit-scope.spec.ts#(cap3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "S4 partial(상한) 화면 — 1280·1024에서 비활성 이유·합계 행 거부 문구가 잘리지 않고, 375에서 「줄 추가」가 없고 합계 행이 잘리지 않으며, 세 폭 모두 문서 가로 스크롤 0"
    verification: []
    human_judgment: true
    rationale: "문구 폭·줄바꿈은 소스 단언으로 증명되지 않는다 — 오케스트레이터의 독립 DOM 감사(CI=true)가 판정한다"

duration: 67min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 26: 차수당 견적 줄 상한 Summary

**설정 키 하나(quote_line.max_per_revision, 기본 300)를 서버 게이트 quote.line-cap(잠금 뒤 셈 · 추가만 막음 · 복원 포함)과 견적 표(「줄 추가」 aria-disabled · Ctrl+Enter/Ctrl+D 무동작 · 넘치는 붙여넣기 전부 거부)가 같은 숫자로 지킨다**

## Performance

- **Duration:** 67 min
- **Started:** 2026-09-25T14:44:50Z
- **Completed:** 2026-09-25T15:52:10Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- 서버: 상한 값은 `prepareQuoteLineSave`·`restoreQuoteLine`이 트랜잭션 전에 읽고(ENG-D3 ①), 줄 수는 `loadProjectForGate` 잠금 뒤 같은 `tx`로 `활성 − 이번에 보관할 활성 + 그 차수에 아직 없는 새 id`로 센다(ENG-D10). 새 줄이 없는 저장은 상한과 무관하다(A-20). 합성 저장(`saveProjectLedger`)도 같은 `prepareQuoteLineSave`를 지나 자동으로 적용된다
- 화면: 상세 페이지가 같은 설정 값을 `lineCap`으로 넘기고, 활성 줄(보관할 줄 제외 · 새 줄 포함)이 상한이면 「줄 추가」가 비활성 + 이유, 단축키는 합계 행에 이유, 붙여넣기는 적용 전에 새 줄 수를 세어 전부 거부
- 테스트: 통합 9케이스(behavior 7 + 우회 배치 + 두 연결 경합), E2E 3케이스(cap1~3). 우회·경합 케이스는 Task 1 구현으로 처음부터 초록이라 변이로 검증했다(잠금 전 셈 → (9) 실패, 게이트 완화 → (8) 포함 6건 실패). E2E도 변이 두 개(저장 시 지우기 제거 → cap2 실패, 붙여넣기 거부 후 계속 적용 → cap3 실패)로 확인

## Task Commits

1. **Task 1 RED** — `c21473a` test(04-26): add failing tests for the per-revision quote line cap
2. **Task 1 GREEN** — `9fc70f2` feat(04-26): cap quote lines per revision on the server and the add-line button
3. **Task 2 RED** — `1aa0b8f` test(04-26): add failing tests for shortcut no-op and all-or-nothing paste at the cap
4. **앞 플랜 테스트 결함 수정** — `c6ac896` fix(04-26): wait until the grid takes focus before pasting in quote-edit-scope (c4)
5. **Task 2 GREEN** — `fc58f7e` feat(04-26): block shortcuts and reject overflowing paste at the quote line cap

RED 확인: Task 1은 거부 케이스 4건이 「promise resolved instead of rejecting」, cap1은 `aria-disabled` 단언에서 실패. Task 2는 cap2·cap3이 합계 행 문구 `toBeVisible`에서 실패 — 오케스트레이터 점검 뒤 1aa0b8f의 테스트 파일과 구현 전 `quote-table.tsx`(HEAD와 동일)를 작업 트리에 되살려 다시 돌려 같은 자리에서 실패함을 재확인했고, 도우미(focusGridCell)를 넣은 현재 스펙으로도 구현 전 코드에서 같은 자리에서 실패했다.

## Files Created/Modified

- `domain/settings/keys.ts` — `QUOTE_LINE_MAX_PER_REVISION`(라벨 「차수당 견적 줄 상한」, 힌트 「한 차수에 둘 수 있는 견적 줄 수 — 조정·취소 줄 포함」) + `SETTING_DEFS` 등록
- `domain/rules/register.ts` — `quote.line-cap` 게이트 · `QuoteLineCapCtx`
- `domain/quotes/lines.ts` — `lineCap` 준비 · 잠금 뒤 셈과 게이트(저장·복원)
- `repositories/quote-lines.ts` — `countActiveLinesByRevision`
- `app/(app)/projects/[id]/page.tsx` — 설정 값을 `lineCap`으로 전달
- `app/(app)/projects/[id]/quote-table.tsx` — 「줄 추가」 3차 Button 비활성 · 단축키 무동작 · 붙여넣기 전부 거부 · 합계 행 상한 글자(`.rejectionSummary` = `--danger`)
- `app/(app)/projects/[id]/project-detail.module.css` — `.addLineButton`을 간격만 남김(모양은 Button 3차)
- `test/integration/quote-line-cap.test.ts` — 신규(258줄)
- `test/e2e/quote-edit-scope.spec.ts` — cap1~3 · `fillLinesBySql`(INSERT … generate_series) · `focusGridCell` · `capRows/capCell`

## Decisions Made

frontmatter `key-decisions` 참고. 문구는 UI-SPEC rev 5 원문 그대로 썼다(`300줄 상한 · 상한은 관리자 설정` · `붙여넣기 전부 거부 · 300줄 상한을 1줄 넘음` · `3줄 상한을 넘음 · 전부 거부`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 300줄 표 E2E의 행 찾기가 49초 걸림**
- **Found during:** Task 1·2 E2E
- **Issue:** `dataRows`(`tbody tr:has(> td[role="gridcell"])`) — Playwright `:has()` 엔진이 300줄 표에서 행 수 한 번에 약 49초(브라우저 `querySelectorAll`은 6ms, 페이지 long task 합 148ms — 계측). 앱이 아니라 로케이터가 느렸다. 처음엔 `test.slow()`로 덮었다가 원인을 찾은 뒤 걷어냈다
- **Fix:** 상한 케이스만 XPath `capRows/capCell`(같은 행·같은 칸 순서)로 찾는다. cap1 48s → 3s
- **Files modified:** test/e2e/quote-edit-scope.spec.ts
- **Committed in:** 1aa0b8f

**2. [Rule 1 - Bug, ENG-D11 앞 플랜 결함] 수화 전 포커스 유실로 붙여넣기가 (0,0)에서 처리됨 — (c4) 간헐 실패의 원인**
- **Found during:** Task 1 트레이서 게이트 재실행(quote-edit-scope (c4) 1회 실패 — 이후 40회 이상 재현 안 됨) · Task 2 cap3
- **Issue:** `locator.focus()`를 수화 전에 주면 React `onFocus`가 받지 못해 격자 포커스(roving tabindex)가 (0,0)에 남고, 곧바로 보낸 붙여넣기가 번호 열에서 처리된다. 299줄 표에서 계측으로 재현(`handlePasteAtCell` 진입 rowIndex 0 · columnKey `sort`). (c4) 실패 스냅숏(새 줄 수량 1 · dirty · aria-invalid 없음)이 이 모양과 같다 — 파일: `test/e2e/quote-edit-scope.spec.ts`(04-30 산출물), 테스트: `(c4) 정산 PM이 표 끝을 넘겨 붙여넣으면 …`
- **Fix:** `focusGridCell` — 칸이 탭 정지(tabindex 0)가 될 때까지 blur → focus를 `toPass`로 다시 준다(고정 대기 없음). (c4)와 cap2·cap3에 적용
- **Verification:** (c4) 3회 · cap3(구현 전 RED / 구현 후 GREEN) · 전체 스펙 35 passed
- **Committed in:** c6ac896(c4) · fc58f7e(cap2·cap3)

**3. [Test 조정] cap1에서 「비활성 버튼을 눌러도 줄이 늘지 않는다」 단언을 뺐다**
- Playwright는 `aria-disabled` 버튼을 클릭하지 않는다(actionability 대기). force 클릭 뒤 행 수 단언은 부재를 확인하는 약한 단언이라 넣지 않았다. 무동작 증명은 cap2의 키 경로(대조 응답 = 합계 행 이유)가 맡는다. 남은 단언(`aria-disabled="true"`)은 RED에서 실제로 실패함을 봤다

**4. [Rule 1 - lint] 상한 글자 지우기를 handleSave 밖으로**
- `handleSave` 첫 줄의 `setState`가 `react-hooks` 「효과 안 동기 setState」에 걸렸다(Ctrl+S가 `useEffectEvent`로 부름). `attemptSave`(1차 버튼·기간·총 매출 예상가 칸 저장)와 표 `onSave` 이벤트에서 지운다

---

**Total deviations:** 4(1 blocking, 1 앞 플랜 테스트 결함, 1 테스트 조정, 1 lint)
**Impact on plan:** 범위 확장 없음. 프로덕션 코드 변경은 계획한 파일 안에서만.

## Issues Encountered

- (c4) 간헐 실패 1회 — 위 편차 2로 원인·수정. 같은 모양의 위험(`.focus()` 직후 키·붙여넣기)은 다른 스펙에도 있다(예: quote-table.spec.ts의 `pasteIntoFocusedCell` 호출). 줄 수가 적어 수화가 빨라 드러나지 않을 뿐이다 — 이 플랜 범위 밖이라 고치지 않았다(아래 이월).
- 같은 tx 규약: 이 플랜이 더한 조회는 전부 `tx`를 받는다(`repoFindQuoteLinesByIds(…, tx)` · `repoCountActiveLinesByRevision(…, tx)`). 설정 조회 두 곳(`prepareQuoteLineSave`·`restoreQuoteLine`)은 `withTransaction` 콜백 밖이다(Grep 확인). `domain/projects/ledger.ts`·`quotes/lines.ts`의 알려진 교착 후속 건은 건드리지 않았고 악화시키지 않았다.

## 독립 DOM 감사 · 전체 게이트 · 교차 검토

- **독립 DOM 감사**(별도 Opus 에이전트, `CI=true` 프로덕션 빌드, 1280 · 1024 · 375, 계산 스타일·aria·박스만 실측 — 스크린샷 육안 판정 없음, 보고서 `/mnt/project-files/phase4-prep/04-26-dom-audit.md`): **PASS 35 · FAIL 0 · INFO 6**. 375에서는 단축키·붙여넣기 상한 상태를 설계상 만들 수 없다(`quote-table.tsx:1983` · `1986` · `1995`가 `editableWidth`(≥1024)일 때만 `onNewRow`·`onDuplicateRow`·`onPasteAtCell`을 연결한다). INFO 1건: 375에서 수화 전 서버 렌더가 편집 표(비활성 「줄 추가」·300 gridcell)를 잠깐 그렸다가 지운다 — 04-49 영역이라 이월.
- **전체 게이트**: `bash scripts/reset-test-db.sh && CI=true pnpm test` — ec539c5에서 초록. 단위 1178 · 통합 1235 · E2E 288.
- **교차 검토**(Codex 대체 Opus — Codex 한도 09-29 해제, 재확인 필요, 보고서 `/mnt/project-files/phase4-prep/04-26-review-opus.md`): **BLOCKING 0 · SHOULD-FIX 1 · NIT 5**. S-1(E2E cap2의 Ctrl+D 단언이 앞선 Ctrl+Enter 문구로 이미 참이라 공허함)을 커밋 d1bff01(Ctrl+D 앞에서 Ctrl+S로 저장을 시도해 문구를 지우고, 고정 대기 없이 사라짐을 단언한 뒤 Ctrl+D로 다시 뜨는지 본다)로 반영. NIT 5건은 이월(보고서 참조): 되살린 편집은 화면 상한 판정을 거치지 않는다(서버가 막아 안전) · 한 배치 안에서 새 줄 id가 겹치면 두 번 세어 보수적으로 거부한다 · 통합 (9)의 「두 순서 모두」가 사실상 같은 순서를 두 번 돈다 · 충돌과 상한 초과가 한 저장에 함께 있으면 상한 문구만 보인다 · DOM 감사·전체 게이트 결과를 SUMMARY에 반영(이번에 반영 완료).

## Deferred Items

- **04-49 이월: 매출 표 1024 미만 전환 시 열린 입력 유실 가능 — 04-26 범위 밖**(`revenue-section.tsx`는 이 플랜 파일이 아니다)
- `.focus()` 직후 키·붙여넣기를 보내는 다른 E2E(quote-table.spec.ts 등)도 수화 전 포커스 유실에 같은 방식으로 취약하다 — `focusGridCell` 도우미로 옮기는 정리는 별도 플랜
- 300줄 이상 표 E2E에서 `dataRows`(`:has()`)는 쓰지 않는다 — 04-19(30줄 페이지)·04-31이 큰 표를 다루면 `capRows` 방식을 쓴다
- UX 원칙 메모(범위 밖): 상한 글자는 「관리자 설정」만 알려 줄 뿐 다음 행동이 없다(예: 보관할 줄 고르기) — rev 5 문구가 사용자 확정값이라 바꾸지 않았다

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-13(조정·견적 외 비용 줄)은 같은 `quote.line-cap` 셈을 지난다 — 그 플랜의 통합 테스트가 조정 줄이 셈에 들어가는지 단언한다
- 독립 DOM 감사 → 전체 게이트 → 교차 검토 반영 완료. STATE/ROADMAP 반영은 남음.

## Self-Check: PASSED

- 파일: test/integration/quote-line-cap.test.ts · domain/settings/keys.ts · domain/rules/register.ts FOUND
- 커밋: c21473a · 9fc70f2 · 1aa0b8f · c6ac896 · fc58f7e FOUND
- package.json · pnpm-lock.yaml diff 0줄(새 의존성 없음, T-04-SC)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
