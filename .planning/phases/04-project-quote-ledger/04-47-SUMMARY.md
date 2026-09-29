---
phase: 04-project-quote-ledger
plan: 47
subsystem: ui-table
status: complete
tags: [table, paste, clipboard, pagination, footer-notice, save-flow, react]
requires:
  - phase: 04-19
    provides: splitPages(pinned 입력) · pageOfRow · { rowId, colKey } 포커스 · 네이티브 copy(TSV + 앱 형식)
  - phase: 04-24
    provides: quoteLineClipboardMeta — 앱 형식 줄별 { currency }
  - phase: 04-16
    provides: routeRejectedRevenueCells · otherCellsRejectedText · EntryDraft.cellErrors(매출 표 고정 오류 칸)
  - phase: 04-23
    provides: addLineToGroup(lineKind) — 그룹 버튼 단일 처리 지점
  - phase: 04-30
    provides: newDraftLine(crypto.randomUUID · isNew) · cellIssue kind reason
provides:
  - ui/table/footer-notice.ts — composeFooterNotice(합계 행 오른쪽 한 줄 — danger → 붙여넣기 묶음 → muted, 저장 성공 단독)
  - ui/table/paging.ts — pinNewRows(새 줄을 만들어진 쪽에 고정)
  - ui/table/use-clipboard-paste.ts — APP_CLIPBOARD_FORMAT · readPasteClipboard · applyPaste(appMeta → source · ignoredComputedCells · sourceCurrencies · rowCount)
  - ui/table/parse-tsv.ts — parseTsv 끝 줄바꿈 하나 제거
  - TableColumn.pasteRole · TableProps.footer 함수형 · footerNotices · footerSuccess · revealRowId · firstIssueSignal · pagination.resplitKey · onPasteAtCell(채운 줄 id 반환) · Pagination errorCounts 배선
affects: [04-18, 04-31]
actuals:
  tokens: 24400
  tasks: 2
  commits: 4
plan_head_before: 58d6837503032da42c90f10836fbf3a75fae0bea
tech-stack:
  added: []
  patterns:
    - 합계 행 오른쪽은 표가 composeFooterNotice 한 함수로 조립하고, 호출부는 footer 함수로 그 자리를 행 안에 놓는다
    - 새 줄 고정은 렌더 중 상태 조정(known · pinned) — 재분할은 resplitKey(저장 성공·다시 불러오기) · resetKey · 사용자 페이지 이동뿐
    - 첫 오류로 이동은 표마다 숫자 신호(firstIssueSignal)를 받는 표 하나에만 넘긴다(받을 표를 신호 시점에 정한다)
key-files:
  created:
    - ui/table/footer-notice.ts
    - test/unit/ui/footer-notice.test.ts
    - test/unit/ui/use-clipboard-paste.test.ts
  modified:
    - ui/table/parse-tsv.ts
    - ui/table/use-clipboard-paste.ts
    - ui/table/types.ts
    - ui/table/paging.ts
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/unit/ui/parse-tsv.test.ts
    - test/unit/ui/table-paging.test.ts
    - test/e2e/quote-table.spec.ts
key-decisions:
  - "04-47: 붙여넣기 머리 `붙여넣기 N줄`은 붙여넣기 조각(버림·외화·계산 열·조정 줄·쪽까지)이 하나라도 있을 때만 보인다 — 평범한 붙여넣기는 조용하다(CLAUDE.md §7 문구 최소)"
  - "04-47: 표가 세는 `오류 N칸` · `충돌 N줄`은 서버 거부 봉투 요약이 이미 그 수를 말하면(replacesIssueCount) 더하지 않는다 — `오류 1칸 · 오류 1칸 · 전부 거부` 중복 방지"
  - "04-47: 표 밖 칸(기간·총 매출 예상가)의 서버 오류가 남아 있어도 1차는 서버를 부르지 않고 그 칸으로 간다 — 같은 값을 다시 보내도 같은 거부라서(DR-5 「남은 오류」에 표 밖 칸 포함)"
  - "04-47: 외화 경고는 줄 단위로 센다 — 단가 칸이 원화로 들어간 줄 중 원본(앱 형식)이 외화였거나 덮인 기존 줄이 외화였던 줄(둘 다면 한 번)"
  - "04-47: 그룹 버튼 새 줄의 쪽 이동(revealRowId)은 addLineToGroup 안에서 한 번 건다 — 버튼마다 따로 걸지 않는다"
requirements-completed: [UX-05, UX-04, PROJ-05]
coverage:
  - id: D1
    description: "파서 끝 줄바꿈 · 붙여넣기 결정표(앱 형식일 때만 계산 열 무시, 엑셀은 오류 칸) · 원본 통화 · 줄 수"
    requirement: PROJ-05
    verification:
      - kind: unit
        ref: "test/unit/ui/parse-tsv.test.ts · test/unit/ui/use-clipboard-paste.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(ENG-D5) 앱 형식 없는 엑셀 6열 · (C-03) 두 그룹 · USD 1줄 · 45줄 왕복"
        status: pass
    human_judgment: false
  - id: D2
    description: "합계 행 오른쪽 한 줄(DR-16) — 순서·톤·성공 단독·저장 시도 때 붙여넣기 조각 지움"
    requirement: UX-04
    verification:
      - kind: unit
        ref: "test/unit/ui/footer-notice.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(C-03) · (금지 항목) 142줄 · (R2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "쪽을 넘는 붙여넣기(시작 쪽 유지 · N쪽까지 · 채운 줄 전부 저장) · 새 줄 고정 · C-18 · 그룹 버튼 쪽 이동(B-24)"
    requirement: UX-05
    verification:
      - kind: unit
        ref: "test/unit/ui/table-paging.test.ts#pinNewRows"
        status: pass
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#142줄 · 10줄에 45줄 · 2쪽 Control+Enter · (C-18) · (B-24) · (리뷰 S-1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "오류가 남은 채 1차 → 서버 요청 0 · 첫 오류(표 밖 칸 → 견적 표 쪽·셀 → 매출 표) · 거부 뒤 첫 오류 쪽과 번호 옆 `오류 N` · 쪽 왕복 dirty 유지"
    requirement: UX-04
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts#(DR-5) 두 케이스 · 1쪽 5행과 3쪽 2행 · dirty 왕복 · (R2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "1280·1024·375 독립 DOM 감사(합계 행 조각 색 순서·줄바꿈 경계 · `오류 N` 토큰·접근 이름 · 1차 aria-disabled 아님 · 375 가로 스크롤 0)와 전체 게이트 CI=true pnpm test"
    verification: []
    human_judgment: true
    rationale: "오케스트레이터가 독립 수행 — 세 폭 FAIL 0, 전체 게이트 CI=true 통과(본문 Verification · 검토 반영 절)"
duration: 38min
completed: 2026-09-26
---

# Phase 4 Plan 47: 붙여넣기 계산 열·통화·쪽 넘김 · 새 줄 고정 · 합계 행 한 줄 · 오류가 남은 채 1차 Summary

**앱 형식(`application/x-plant8-quote-lines+json`)이 있을 때만 계산 열을 무시해 세고 엑셀 값은 오류 칸으로 남기며, 외화→원화·끝 줄바꿈·쪽을 넘는 채우기를 합계 행 한 줄(`composeFooterNotice`)로 알리고, 새 줄은 만든 쪽에 고정되며, 1차 「일괄 저장」은 오류가 남아도 살아 있어 서버 없이 첫 오류 칸으로 간다**

## Performance

- **Duration:** 38 min
- **Started:** 2026-09-26T13:21:38Z
- **Completed:** 2026-09-26T13:59:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- `parseTsv`가 끝 줄바꿈 하나만 뗀다(C-05) — 엑셀 45줄 복사 = `붙여넣기 45줄`, 상한까지 남은 수와 같은 줄 수가 거부되지 않는다
- `applyPaste`가 붙여넣기 출처를 앱 형식 유무로 가르고, 앱 출처일 때만 `pasteRole: "computed"`(번호·견적가·차익·상태) 칸을 소비해 센다. 엑셀 6열의 실행가가 견적가 자리에 떨어지면 04-04대로 오류 칸(ENG-D5). 앱 형식 JSON을 읽지 못하거나 줄 수가 다르면 앱 형식 없음과 같다(T-04-172)
- 견적 표: `외화 N줄 원화로`(warning) · `계산 열 N칸 무시`(muted) · `오른쪽 N칸 버림` · 04-23 `조정 줄 N칸 건너뜀`을 한 묶음으로, 붙여넣기 새 줄은 `newDraftLine`(randomUUID · isNew) 경로(ENG-D10)
- `Table`: 새 줄 고정(`pinNewRows`) · 재분할은 저장 성공·다시 불러오기(`resplitKey`) · 차수 바뀜(`resetKey`) · 사용자 페이지 이동뿐 · 붙여넣기가 닿은 `N쪽까지` · `revealRowId`(B-24)
- 합계 행 오른쪽 한 줄(DR-16) — `composeFooterNotice`가 danger(표가 센 `오류 N칸`·`충돌 N줄` · 상한 · 거부 요약) → 붙여넣기 묶음(머리 → warning → muted → 쪽까지) → muted 순서로 잇고, `저장됨 HH:MM`은 혼자 선다. 저장 시도·붙여넣기·상한 알림이 이전 조각과 `저장됨`을 지운다
- DR-5 — 옛 `오류 N칸 · 고쳐야 저장됩니다` 게이트와 비활성을 지웠다. 1차(버튼·Ctrl+S)는 남은 오류가 있으면 서버를 부르지 않고 표 밖 칸 → 견적 줄 표(쪽 이동 + 셀) → 발행 표 → 입금 표 순서의 첫 오류로 간다. 저장 거부 뒤에도 같은 순서로 이동
- 다른 쪽 번호 옆 `오류 N`(접근 이름 `N쪽, 오류 M칸`) — `Pagination errorCounts` 배선(04-29 컴포넌트), 지금 쪽은 세지 않는다

## Task Commits

1. **Task 1: 붙여넣기 · 새 줄 고정 · 합계 행 한 줄(트레이서)** — `061b64b` (test, RED) → `c0ddce4` (feat, GREEN of 061b64b)
2. **Task 2: 오류가 남은 채 1차 · 저장 거부 쪽 · `오류 N`** — `1d13e42` (test, RED) → `13ce68c` (feat, GREEN of 1d13e42)

**Plan metadata:** 이 SUMMARY 커밋

## TDD 기록
- **RED 1(061b64b):** 단위 21건 실패(끝 줄바꿈 5 · pinNewRows 3 · applyPaste 9 · composeFooterNotice 4 — 모두 단언 실패), CI=true E2E 8/8 실패(행 수·조각·쪽 단언). 테스트가 모듈 로드에서 죽지 않게 API 골격(빈 구현)만 같이 넣었다
- **RED 2(1d13e42):** CI=true E2E 5건 실패(1차 비활성 · aria-disabled · 클릭 대기 · 거부 뒤 쪽 · 발행 금액 포커스). dirty 왕복 케이스는 이미 줄 id 기준이라 초록 — 회귀 방지로 남김
- `gsd check tdd-red-evidence`는 node:test TAP 요약(`# tests`)을 파싱해 vitest `tap-flat` 출력에서 `zero_tests_discovered`(INVALID_RED)를 낸다 — 도구와 러너의 형식 불일치로, RED 증거는 위 vitest·playwright 실패 출력이다
- REFACTOR 커밋 없음

## Files Created/Modified
- `ui/table/footer-notice.ts` — 합계 행 오른쪽 한 줄 조립(순수)
- `ui/table/use-clipboard-paste.ts` — 앱 형식 읽기 · 계산 열 무시 · 원본 통화 · 줄 수
- `ui/table/parse-tsv.ts` — 끝 줄바꿈 하나 제거
- `ui/table/paging.ts` — `pinNewRows`
- `ui/table/types.ts` — `TableColumn.pasteRole`
- `ui/table/Table.tsx` · `Table.module.css` — 새 줄 고정 · reveal · 붙여넣기 쪽까지 · 합계 행 한 줄 렌더(조각 nowrap, 톤 토큰만) · 표가 센 오류·충돌 · firstIssueSignal · 쪽별 오류 수
- `app/(app)/projects/[id]/quote-table.tsx` — pasteRole 넷 · 붙여넣기 묶음 · 외화 셈 · 새 줄 id · 채운 줄 id 반환 · resplitKey · revealRowId · DR-5 이동 · 거부 뒤 이동 · 옛 게이트 삭제 · footer 함수형
- `app/(app)/projects/[id]/revenue-section.tsx` — 두 매출 표에 첫 오류 신호
- `app/(app)/projects/[id]/project-detail.module.css` — 쓰이지 않게 된 `.pasteWarning` · `.pasteSkipped` 제거
- 테스트: 단위 신규 2 · 확장 2, E2E `quote-table.spec.ts` 13케이스 추가 · 2케이스 계약 변경

## Decisions Made
- key-decisions 다섯 줄(frontmatter)
- **D-68 미저장 복원은 쪽과 무관하다(확인):** `editsSnapshot`은 줄마다 기존 줄은 `line.id`, 새 줄은 `clientKey`를 키로 칸 값을 싣는다(04-19 SUMMARY의 `{ rowId, colKey }` 모델과 같다). dirty(`row.dirty`) · 오류(`row.cellErrors`) · 충돌(`row.cellConflicts`) · 저장 틴트 판정도 줄 객체와 열 키로만 해서 쪽 안 위치 계산이 없다 — 쪽 왕복 E2E로 확인
- **04-19 이월(04-19-SUMMARY:190) 해소 확인:** 「1쪽 그룹 B에서 만든 새 줄이 2쪽에 떨어져 `openCell`이 조용히 열리지 않는 경로」 — `openCell`을 쓰는 길은 그룹 버튼(`addLineToGroup`)과 EMPTY 「조정 줄 추가」뿐이고, 둘 다 이제 `revealRowId`로 새 줄의 쪽으로 옮긴 같은 렌더에서 `openCell`을 처리한다. Ctrl+Enter·Ctrl+D·붙여넣기 새 줄은 만든 쪽에 고정된다. E2E (B-24)가 1쪽에서 「견적 외 비용 줄 추가」 → 2쪽 이동 + 새 줄 항목 입력 포커스를 확인

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 앞 플랜 테스트 전제] 04-19 (리뷰 S-1) E2E가 새 줄이 2쪽으로 흘러내린다고 단언**
- **Found during:** Task 1 RED
- **Issue:** 1쪽에서 Ctrl+Enter로 31줄이 되면 `1–30 / 31줄` 페이지 줄이 생긴다고 단언 — 이 플랜의 truth(새 줄은 만든 쪽에 붙어 1쪽이 잠시 31줄)와 반대
- **Fix:** 1쪽 31줄 · 페이지 줄 없음으로 바꿈(번호 6 · 빈 새 줄 · 포커스 단언은 그대로)
- **Files modified:** test/e2e/quote-table.spec.ts
- **Commit:** 061b64b

**2. [Rule 1 - 앞 플랜 테스트 전제] 04-04 (c)(d)(e) E2E가 옛 오류 게이트(비활성 + `고쳐야 저장됩니다`)를 단언**
- **Found during:** Task 2 RED
- **Fix:** 1차 활성 · `aria-disabled` 아님 · 게이트 문자열 0 · 합계 행 `오류 1칸`으로 바꿈(고친 뒤 저장 단언은 그대로)
- **Files modified:** test/e2e/quote-table.spec.ts
- **Commit:** 1d13e42

**3. [Rule 3 - Blocking] react-hooks/refs lint가 기존 N-3 줄(열 객체 `copyText` 사후 대입)을 오류로 잡음**
- **Found during:** Task 2 GREEN
- **Issue:** 거부 처리 콜백(`useAction` onSuccess) 안에서 `goToFirstIssue`를 부르자 컴파일러 추론이 바뀌어 1822행을 「렌더 중 ref 접근」으로 표시(나눠 보기로 원인 호출 확인)
- **Fix:** 콜백 안에서는 `setIssueTarget`과 `focusOutsideError`(DOM 포커스만)를 직접 부르고, `goToFirstIssue`는 `handleSave`에서만 쓴다. N-3 줄 자체는 건드리지 않음
- **Files modified:** app/(app)/projects/[id]/quote-table.tsx
- **Commit:** 13ce68c

**4. [Rule 1 - 테스트 경합] (C-03) 왕복 E2E에서 하이드레이션 전 `Control+a` 유실**
- **Found during:** Task 1 GREEN(CI=true)
- **Issue:** 복사가 1줄만 실림 — 전체 선택 키가 하이드레이션 전에 눌려 사라짐(04-19 SUMMARY가 기록한 같은 경합)
- **Fix:** 마지막 줄 셀이 선택 모양이 될 때까지 `focus → Control+a`를 `toPass`로 반복한 뒤 복사, 저장 뒤 조각은 `expect.poll`로(고정 대기 없음). `--repeat-each=3` 3/3 초록
- **Commit:** c0ddce4

### 플랜과 다르게 한 판단(범위 안)
- **B-24 E2E의 그룹 버튼:** 플랜 behavior는 「조정 줄 추가」지만 E2E는 「견적 외 비용 줄 추가」로 했다 — 둘 다 같은 `addLineToGroup` 한 지점을 지나고, 조정 권한 계정(workScope company 역할) 준비 없이 같은 경로를 증명한다
- **R2 E2E 금액:** 플랜의 `3000000000` 대신 04-41 E2E가 실제로 거부를 확인한 `1000000000000`(999,999,999,999원 상한 초과)을 썼다 — 30억은 상한 안이라 거부되지 않는다
- **R2 E2E 위치:** 플랜 files의 `quote-table.spec.ts`에 두고, 시드는 revenue-section.spec의 방식을 옮겨 썼다(revenue-section.spec은 바꾸지 않음)
- **`저장됨` 글자:** truth 예시는 `저장됨 6줄 14:02`지만 기존 `저장됨 HH:MM`을 유지했다(글자 변경은 이 플랜 action에 없음 — 04-31 사람 확인 또는 후속에서 정할 것)
- **페이지 범위 글자:** 새 줄 고정으로 한 쪽이 30줄을 넘는 동안 `pageRangeText`(쪽 크기 산술)는 `1–30`으로 적는다 — `ui/pagination`은 이 플랜 파일 밖이라 두었고 WINDOWS 원장에 deviation으로 적음

---

**Total deviations:** 4 auto-fixed (Rule 1 앞 플랜 테스트 전제 2 · Rule 1 테스트 경합 1 · Rule 3 lint 1)
**Impact on plan:** 모두 이 플랜 계약의 직접 결과이거나 테스트 결정화. 범위 확장 없음.

## Issues Encountered
- CI=true 웹 서버 로그에 `The destination stream closed early`가 실행마다 1~4줄 찍힌다 — 테스트 결과에는 영향 없음(모두 초록). 원인 조사는 하지 않았다(이 플랜 변경 전 Task 1 실행에서도 보임)

## Verification (this run)
- 단위: 플랜 verify 1 — `parse-tsv` · `table-paging` · `use-clipboard-paste` · `footer-notice` 4파일 78/78 · 단위 전체 101파일 1380/1380
- `pnpm lint` 0 error · `pnpm typecheck` 0
- CI=true(프로덕션 빌드 — `pnpm build` 포함) E2E: `quote-table` · `revenue-section` · `ledger-save-flow` · `project-period` · `quote-edit-scope` · `quote-line-kinds` · `quote-revisions` · `number-format` 167/167 — 저장 중 잠금(saveLocked)·상태 바뀜 거부 케이스 포함 초록
- 수용 grep: `고쳐야 저장됩니다` app·ui 0건 · `pasteRole: "computed"` 견적 표 4건 · 두 매출 `Table`에 `firstIssueSignal` · 견적 표 조립이 `quoteTableRejectionText`(→ `otherCellsRejectedText`)·`otherCellsRejectedText` 호출 · `isFixedIssue`가 `reason` 제외 · 붙여넣기 새 줄 `newDraftLine`(randomUUID)
- 공급망: `package.json` 의존성 객체 넷이 d6b41cf와 같음 · `pnpm-lock.yaml` diff 0줄
- **독립 DOM 감사(1280·1024·375, 별도 Opus 에이전트, CI=true 프로덕션 빌드 DOM 실측, HEAD 97f38f5):** 세 폭 FAIL 0. 합계 행 조각 6개가 danger `오류 N칸` → 붙여넣기 묶음(`붙여넣기 45줄` → warning `오른쪽 45칸 버림`·`외화 1줄 원화로` → muted `계산 열 135칸 무시`·`3쪽까지`) 순서, 색은 토큰 계산값과 같음(--danger rgb(155,28,28) · --warning rgb(138,90,0) · --muted rgb(78,93,89) · --success rgb(14,122,102)), 조각마다 getClientRects 1이고 합계 행 rect 안(375는 조각 경계에서만 세 줄). `저장됨` 단독 success. 쪽 번호 옆 접근 이름 `3쪽, 오류 2칸` · 11px(--fs-xs) · danger, 오류 없는 쪽엔 없음. 오류가 남은 채 1차는 disabled·aria-disabled 아님, 서버 요청 0, 첫 오류 칸 포커스(2쪽 → 1쪽 이동 포함). 가로 스크롤 1280/1280 · 1024/1024 · 375/375(페이지 줄·합계 셀 347/347). INFO: 375는 셀 편집이 없는 설계라 1차 뒤 쪽은 옮기나 포커스는 버튼에 남음(계약 밖) · 거래처 빈 값 붙여넣기는 `목록에 없는 값입니다 · (빈 값)`(04-04 규칙, 04-31 사람 확인 때 볼 것)
- **전체 게이트 `CI=true pnpm test`(HEAD 2fccb3b — 검토 수정 포함):** 단위 101파일 1387/1387 · 통합 56파일 1512/1512 · E2E 384 passed(5.4m) · rc=0. `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0

## 검토 반영(오케스트레이터)
- **RED 직접 재현:** Task 1 단위 17건 실패 @061b64b · Task 2 E2E 4/5 실패 @1d13e42(dirty 왕복 1건은 이미 초록 — 회귀 방지) · 검토 수정 단위 7건 실패 @11bdec6 · 검토 수정 E2E 2건(숨은 열 포커스 — 2fccb3b 되돌림, 기존 외화 줄 — `|| existing…` 변이) 실패
- **main 반영:** 코디네이터 지시로 origin/main 8dbe98f(#86)를 머지 커밋 97f38f5로 반영 — 충돌 0, plant8-skill-gate 훅 테스트 89/89
- **독립 코드 검토(Opus — Codex 한도로 대체, 09-29 이후 Codex 재확인 필요):** BLOCKING 0 · SHOULD-FIX 4 · NIT 6. 편차 4건·판단 3건 모두 타당 판정
  - S-1 거부 요약이 남은 동안 표가 센 `오류 N칸`을 계속 대체 → `withIssueCount`(ui/table/footer-notice.ts): 봉투 칸 수와 표 센 수가 같을 때만 요약이 대체(R2 `전부 거부 · 다른 칸 오류 1칸`은 0=0으로 유지) — d462412(RED) · ea6c62d
  - S-2 첫 오류가 `collapseBelow`로 숨은 열이면 포커스가 조용히 실패 → 그 줄의 보이는 첫 P1 칸(항목)으로(새 UI 없음, RowSheet는 700 미만에서만 열려 1024–1279에 못 씀) — f488398(RED) · 2fccb3b. 1024 미만 서버 거부(수량·단가·비고) 경로는 같은 판정을 타지만 E2E 없음
  - S-3 기존 외화 줄 덮기 경고 무테스트 → E2E 추가(변이 RED) — b0d835d
  - S-4 앱 복사 끝 빈 칸 유실(`toTsv([["x"],[""]])` = `x\n` → 1줄·external) → 앱 형식 줄 수가 떼기 전 줄 수와 같으면 끝 줄바꿈을 떼지 않음(C-05 엑셀 45줄 유지) — 67dae50(RED) · 133be10
  - NIT 쪽 범위 글자 `1–30` 어긋남 → `splitPageRangeText`(실제 분할 기준, `1–31 / 46줄`) — 11bdec6(RED) · c663fe0
  - 남긴 NIT 5: 계산 열 오류 칸(엑셀 6열)은 줄 삭제로만 풀림 — DR-5가 고칠 수 없는 칸으로 보낼 수 있음(04-31 확인) · `저장됨 N줄` 글자 · 뒤 쪽 고정 새 줄에서 시작한 붙여넣기가 앞 쪽을 채우면 `N쪽까지` 없음 · 다시 불러오기가 `pasteNotices`를 지우지 않을 수 있음(확인 필요) · 테스트 공백(매출 칸 오류만 남은 1차, 다음 붙여넣기가 이전 조각 교체, B-24 「조정 줄 추가」 경로) · 1024–1279에서 숨은 차익 칸 오류는 여전히 지울 수 없음(기존 동작)

## 이월
- N-2(`lib/shortcut.ts` `isCtrlCombo`가 Shift·Alt를 보지 않음) — 범위 밖, 그대로
- N-3(`quote-table.tsx` 열 객체 `copyText` 사후 대입) — 범위 밖, 그대로(편차 3에서 lint 추론만 피함)
- 새 줄 고정 중 페이지 범위 글자 어긋남(위) · `저장됨 N줄` 글자 여부 — 04-31 또는 후속
- 04-31 사람 확인: 실제 엑셀 6열 붙여넣기(ENG-D5) · 실제 Chrome 간 프로젝트 왕복의 앱 형식 전달 · 04-19의 한글 IME 조합 중 Tab

## CLAUDE.md §7 관점 기록(범위 변경 없음)
- 평범한 붙여넣기에는 `붙여넣기 N줄`도 띄우지 않아 문구를 줄였다. 1차가 오류 때문에 비활성으로 보이지 않고 눌렀을 때 고칠 칸으로 데려가는 것은 §7 「동작으로 유도」와 맞는다

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 04-18(머리글 정렬·열 접기)이 이 플랜 뒤 `ui/table`을 이어 고칠 수 있다. 04-31이 실제 엑셀로 최종 사람 확인을 한다
- 독립 DOM 감사·전체 게이트·검토 반영 끝(위 「검토 반영」). 묶음 ④ 머지 요청 전 /qa·/design-review 실행 필요(코디네이터 지시 2026-09-26 14:10)

## Self-Check: PASSED
