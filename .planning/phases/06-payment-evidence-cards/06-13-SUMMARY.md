---
phase: 06-payment-evidence-cards
plan: 13
subsystem: quotes line status · expense submit gates · payments lock order · S14 quote table
status: complete
tags: [EXP-06, EXP-07, EXP-10, SP-2, O-14, C10, UC-7, B-1, N-2, N-3, X-3, D-609, S14]
requires: ["06-03", "06-06", "06-07", "06-08", "06-10", "06-28"]
provides:
  - "줄 상태 파생 8값(QUOTE_LINE_STATUS_PRIORITY 한 곳 · pickLineLinkedStatus) — 취소 > 반려 > 증빙 없음 > 지출결의 중 > 구매 요청 중 > 지급 완료 > 카드 사용 > 미착수"
  - "종결 지출결의를 줄 연결 · D-66에서 뺌(loadLinkedDocumentsByLine 한 곳)"
  - "submitExpense: 프로젝트 행 → 견적 줄 → 문서 잠금 뒤 expense.line-paid-lock → expense.submit → card.dual-link-block(side expense) → purchase.line-door(side expense)"
  - "completeExpensePayment: 견적 줄 잠금을 문서 잠금 앞에(N-2)"
  - "repositories/quote-line-links: findExpenseDocFacts · listExpenseDocFacts · findExpenseQuoteLineIds · findLineVendorNames"
  - "domain/expenses: LineDoorCell.branch · purchaseHref · blocked{reason,next} + 순수 rowActionBlock(06-18 소비 계약)"
  - "줄 DTO prepaidOverdueDays · 상태 2행(`증빙 N일 경과` · `실행가 초과 {액}`)"
  - "일괄 저장 응답 줄에 카드 쪽 사실(hasCardSideLinks · executionOverKrw)"
affects: ["06-15", "06-18", "06-14"]
tech-stack:
  added: []
  patterns:
    - "잠금 순서 프로젝트 행 → 견적 줄(id 순 FOR UPDATE) → 문서 행 — 지급은 프로젝트 행만 건너뛴다(X-2)"
    - "행 행동 막힘 이유 = 서버 게이트와 같은 순수 함수(cardDualLinkDecision · linePaidLockDecision)"
key-files:
  created:
    - test/integration/dual-link-concurrency.test.ts
    - test/unit/domain/rules-line-paid-lock.test.ts
    - test/e2e/quote-line-status.spec.ts
    - docs/design/checks/2026-10-07-06-13-line-status.md
  modified:
    - domain/quotes/lines.ts
    - domain/quotes/edit-scope.ts
    - domain/rules/register.ts
    - domain/expenses/index.ts
    - domain/payments/index.ts
    - domain/projects/ledger.ts
    - repositories/expenses.ts
    - repositories/quote-line-links.ts
    - app/(app)/projects/status-display.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/integration/quote-line-links.test.ts
    - test/integration/purchase-requests.test.ts
    - test/unit/app/line-status-word.test.ts
    - test/unit/app/restore-edits.test.ts
decisions:
  - "지급 잠금은 05 expense.submit 앞에서 판정(뒤면 05 ④ 문구가 먼저 선다) — 번호 문서는 loadSubmitFacts의 05 numbered 그대로"
  - "06-07 I-2 이중 연결 호출과 이 플랜의 잠금 뒤 판정을 submitExpense에서 한 번으로 합침"
  - "rowActionBlock은 권한 · 설정을 읽지 않는 순수 함수, 문(branch)은 호출자가 resolveLineDoor로 넘김"
  - "일괄 저장 응답에도 카드 쪽 사실을 싣는다(ledger가 커밋 뒤 lineCardSideFacts — 페이지와 같은 실패 가두기)"
metrics:
  duration: "약 65분(Task 3 · SUMMARY 재개분 포함 02:22–03:27 UTC 커밋 기준)"
  completed: 2026-10-07
commits: 6
plan_head_before: 854e801d57d7fbb2bbb809ebe3bd3fba4834af69
actuals:
  tokens: 32625
  tasks: 3
  commits: 6
---

# Phase 6 Plan 13: 견적 줄 상태 · 지출결의 쪽 세 게이트 · S14 문 가르기 Summary

줄 상태를 서버 한 함수가 8값 우선순위로 파생하고(종결 제외 · 증빙 없음은 hasEvidence), 지출결의 제출은 프로젝트 → 견적 줄 → 문서 잠금 뒤 지급 잠금 · 이중 연결 · 온라인구매 문을 판정하며, 지급은 줄 잠금을 문서 잠금 앞에 잡는다. S14 표는 서버 셀(문 · 막힘 · 다음 한 수)과 DTO(2행)만 그린다.

## Tasks

| Task | 내용 | 커밋 |
|------|------|------|
| 1 (tracer) | 지급 완료 줄 상태 · D-66 이유 `지급 완료` · `expense.line-paid-lock`(줄 잠금 뒤) · 복사 줄 회귀 가드 · 행 행동 이유 | 68d5713 (test) · e99f54f (feat) |
| 2 | 8값 파생 · 증빙 없음 · 종결 제외 · 선결제 기한 · 지출결의 쪽 이중 연결 · 온라인구매 문 · 지급 줄 잠금(N-2) · 경합 테스트 | de1bcce (test) · 263f493 (feat) |
| 3 | S14 — 문 가르기 · 한쪽 연결 막힘 + `카드 사용 등록` · 상태 2행 · 카드 붙잡은 줄 삭제 → 취소 · 실행가 초과 2행 · 힌트 줄 | facef1b (test) · 8ed6117 (feat) |

Tracer 게이트(Task 1 뒤): `<verify>` 재실행 녹색 뒤 확장.

## 검증 (실제 실행 — 전부 DATABASE_URL=…/erp_e0613_test, 무거운 명령은 flock)

- 단위: screen-frames · tokens · status-map · error-copy-noun-style · design-system-docs · line-status-word · restore-edits — 7 files, 452 passed / 0 failed. (Task 1~2 때 단위 117 passed.)
- 통합(Task 3 마지막): 관련 29 files(저장 · 견적 줄 · 카드 · 지출결의 · leak-scan · dual-link-concurrency · purchase-requests) — 4010 passed / 0 failed.
- 통합 quote-line-links 단독: 25 passed.
- lint · typecheck: rc=0. `node scripts/design/mark-legacy.mjs --audit "app/(app)/projects"` 출력 0줄. 옛 토큰 grep 빈 출력. `git diff origin/main -- docs/design/tokens.css package.json pnpm-lock.yaml` 0.
- build: `pnpm build` rc=0(임시 `turbopack.root` — 커밋 안 함, 끝에 되돌림).
- E2E `CI=true`: quote-line-status · quote-table · purchase-requests · card-usage · expense-submit-mobile-approval — 105 passed / 0 failed / 18 skipped(다른 프로젝트 몫). quote-line-status 단독 7 passed.
- 변이 확인: 지급의 `lockQuoteLines`를 빼면 지급 경합 두 케이스가 `waitForLockWaiter` 시간 초과로 빨개짐, 제출의 `lockQuoteLines`를 빼면 「지급 먼저 잠금」이 빨개짐(되돌림 후 git diff 0). 카드∥제출 · 구매 요청∥제출은 프로젝트 행 잠금이 직렬화하므로 줄 잠금 변이로는 빨개지지 않는다(X-2 그대로).
- Task 3 저장 응답: 고치기 전 통합 「저장 응답」 케이스가 RED(`executionOverKrw`·`hasCardSideLinks` 없음) → 고친 뒤 GREEN, E2E 「실행가 초과 2행」도 같은 원인으로 빨갰다가 녹색.
- 수락 grep: `export function rowActionBlock` 1 · 순수 grep 0 · `cards?new=1&line=` 1 · `/cards/purchases?new=1&line=` 1 · quote-table `hasCardSideLinks` 5 · `executionOverKrw` 4 · `실행가 초과` 2 · B-1 순서 grep `lockProjectForWrite( lockQuoteLines( lockExpenseForUpdate( "expense.line-paid-lock" "expense.submit"` · tx 필수 시그니처 grep 3.
- X-4: `submitExpense` · `completeExpensePayment`의 `lockQuoteLines` 인자는 줄 하나다(지출결의 한 장 = 견적 줄 하나).
- 회귀 가드(X-3 분할 줄 복사 → 2회차 상한)는 처음부터 초록이었다(05 계보 사슬이 이미 지킴 — 가드로 남김).
- `findLineLinks`의 `tx`는 기본값 `= db`가 남아 있다(06-07 시그니처 그대로 — 트랜잭션 안 호출부는 모두 tx를 넘긴다).

## 행 행동 조합표 (rowActionBlock — 06-18 소비 계약)

| 문(branch) | 05 문 상태 | 연결 | 행 행동 | 막힘 이유 · 다음 한 수 |
|---|---|---|---|---|
| purchase | open | 지출결의 없음 | `구매 요청` → `/cards/purchases?new=1&line={id}` · Ctrl+E | 없음 |
| purchase | open · closed | 지출결의 있음 | `구매 요청` 비활성 | `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄` |
| expense | open | 카드 사용 · `신청됨` 구매 요청 | `지출결의 올리기` 비활성 | `카드 사용 {N}건[ · 구매 요청 {M}건] 연결됨 · 지출결의는 다른 줄` + 3차 `카드 사용 등록` → `/cards?new=1&line={id}` |
| expense | closed | 지급 완료 문서가 닫음 | 05 `지출결의 열기` | `지급 완료 {번호} · 새 지출결의 없음` |
| expense | open · closed | 그 밖 | 05 그대로 | 없음 |
| 아무거나 | no_vendor · none | — | 05 그대로 | 없음 |

## 260907 대조 (읽기 전용 — 구현하지 않음)

| # | 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|------|------------------|----------------|------|
| 1 | 줄의 문은 협력사 설정이 가르고 한쪽만 선다(온라인구매 줄 = 구매 요청만, 그 밖 = 지출결의만) | app/src/pages/QuotesForm.tsx:1312-1314 | domain/expenses/index.ts:1660 · app/(app)/projects/[id]/quote-table.tsx:2165 | 같음 |
| 2 | 협력사 이름 비교 = 공백 전부 걷은 정확 일치 | server/src/purchases.ts:943-949 | domain/quotes/line-door.ts:10-14 | 숨은 규칙 — 06-08 대조 #3에서 이미 셈(여기서 다시 세지 않음) |
| 3 | 막힌 손은 감추지 않고 잠근 채 보인다(이유는 title) | QuotesForm.tsx:1338-1345 · :1275 주석 | quote-table.tsx:2165-2195(aria-disabled + 이유 글자) | 같음(결) — 이유를 글자로 보이는 것은 UI-SPEC S14 계획 결정 |
| 4 | 작성 중(임시저장) 지출결의도 줄 실행가를 잠근다 | db/schema/020_functions.sql:4064-4071 | domain/quotes/lines.ts:339(번호 있는 문서만 — D-66) | 계획 결정(D-66 「작성 중 문서는 연결이 아니다」) |
| 5 | 구매 요청도 줄 실행가를 잠근다 · 잠긴 줄 실행가 변경 거부 | 020_functions.sql:4073-4079 · server/src/quotes.ts:2571-2572 | quote-table.tsx 2행 `실행가 초과`(표시만) · domain/projects/ledger.ts:381 | 계획 결정(UC-1 · Q-G 밤 위임 추천안) |
| 6 | 반려 지출결의는 여전히 잠근다 / 취소된 구매 요청은 안 센다 | 020_functions.sql:4049-4051 · :4077 | domain/quotes/lines.ts:378(rejected 키) · repositories/quote-line-links.ts:146(`requested`만) | 같음 |
| 7 | 보관(종결)된 지출결의는 잠금에서 빠진다 | 020_functions.sql:4069 | domain/quotes/lines.ts:339(`closedAt === null`) | 같음(결) — UC-7 |
| 8 | 연결 문서가 있는 줄 빼기 = 거부(반려 · 회수 뒤에만) | server/src/quotes.ts:2743-2745 | quote-table.tsx:1710(보관 대신 `취소`) | 계획 결정(05 연결 줄 취소 · N-3 Q-G) |
| 9 | 한 줄에 지출결의와 구매 요청이 함께 붙지 않는다(먼저 만든 것이 주인 · 잠기면 두 손 다 막힘) | db/schema/010_tables.sql:4064 · QuotesForm.tsx:224 | domain/rules/register.ts:372-387 · domain/expenses/index.ts:1055 | 같음(결) — D-609 |
| 10 | 지급 완료 줄에 새 지출결의: 지급 전용 규칙 없음(잠긴 줄은 `이미 지출결의·구매 요청이 붙은 줄입니다`) | app/src/pages/QuotesText.ts:314 · QuotesForm.tsx:224 | domain/rules/register.ts:335-345 · domain/expenses/index.ts:1043 | 계획 결정(EXP-06) |
| 11 | 견적 줄 상태 열(8값) · 2행 기한 경과 · 실행가 초과 | 해당 없음(잠금 + 문서 번호만 — server/src/quotes.ts:944-964) | domain/quotes/lines.ts:92-102 · quote-table.tsx:2127 | 계획 결정(SP-2 · S14) |
| 12 | 고객 승인 전에는 지출결의 · 구매 요청 손을 같은 잣대로 막는다 | QuotesForm.tsx:225 · :1317 | quote-table.tsx(지출결의 문만 `tableGateReason`, `구매 요청` 문은 막지 않음) | 숨은 규칙 — 06-08 대조 #5에서 이미 셈(여기서 다시 세지 않음) |

숨은 규칙(사용자 결정 필요) — 이 플랜에서 새로 센 것 **0건**(겹침 2건: 06-08 #3 · #5).

## 캡처·GPT 검사 대상 경로

| 경로 | 바뀐 요소 | 보는 데 필요한 데이터 조건 |
|------|-----------|----------------------------|
| `/projects/{id}` PC 1280 · 1024 | 상태 열 낱말(8값) · 2행 `증빙 {N}일 경과` | 선결제 지출결의(증빙 0) 결재 통과 · 지급일 = 오늘 − (기한 14 + N) |
| `/projects/{id}` PC 1280 · 1024 | 상태 2행 `실행가 초과 {액}` · 둘 다면 ` · ` 한 줄 | 카드 사용 공급가 합 > 줄 실행가(실행가를 내려 저장) |
| `/projects/{id}` PC 1280 | 행 행동 `구매 요청`(링크) · 힌트 줄 `지출결의·구매 요청 Ctrl+E` | 설정 `purchase.online_vendor_name` = 그 줄 거래처 이름 |
| `/projects/{id}` PC 1280 | `지출결의 올리기` 비활성 + 이유(long-text backstop) + 3차 `카드 사용 등록` | 지출결의 없는 줄에 카드 사용 2건 |
| `/projects/{id}` PC 1280 | `지출결의 열기` + `지급 완료 {번호} · 새 지출결의 없음` | 비분할 지출결의 결재 통과 · 지급 완료 |
| `/projects/{id}` PC 1280 | `구매 요청` 비활성 + `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄` | 온라인구매 줄에 지출결의 제출 뒤 설정을 그 거래처로 |
| `/projects/{id}` 폰 375 · 320 행 시트 | 시트 문서 행동 자리 — 위 갈래 같은 값(비활성 버튼 + 이유 + 다음 한 수) | 위와 같음 · overflow backstop `구매 요청 중`(6자) |
| `/projects/{id}` PC 1280 확인 창 | 카드 붙잡은 줄 Delete → `견적 줄 취소` 확인 창 | 수주 중(고객 승인 전) 프로젝트 줄에 카드 사용 |
| `/cards?new=1&line={id}` | `카드 사용 등록`에서 들어온 패널(연결 `견적 줄` · 그 줄) | 위 카드 2건 줄 |

## 화면 검토 증거

(오케스트레이터가 채움 — 독립 DOM 감사 · `/design-review` · `/qa`)

## 사용자 질문 후보

1. 온라인구매 줄의 행 이유 `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄`(UI-SPEC S14)과 그 줄로 구매 요청 · 카드 사용을 낼 때 서버 거부 `지출결의 {번호} 연결됨 · 다른 줄 고르기`(06-07 카드 쪽 게이트)가 같은 사실을 다른 문장으로 말한다 — UI-SPEC 문구 그대로 두고 진행. 하나로 맞출지.
2. 카드 붙잡은 줄의 삭제 확인 창 결과 줄이 05 문구 `견적가 0 · 이력과 연결된 지출결의는 그대로`를 그대로 쓴다(UI-SPEC 「확인 창도 같은 꼴」). 카드 사용만 붙은 줄에도 「지출결의」라고 말한다 — 카드용 문구를 둘지.
3. N-3 · Q-G 밤 위임(추천안으로 진행, 아침 확인): 카드 쪽 연결 줄의 삭제 = 취소, 실행가 내리기는 막지 않고 2행 `실행가 초과` 표시만.
4. 고객 승인 게이트(`tableGateReason`)는 지출결의 문만 막고 `구매 요청` 문은 막지 않는다(260907은 둘 다 — 06-08 #5와 같은 질문).
5. 막힌 `구매 요청`에는 다음 한 수가 없다(UI-SPEC가 카드 쪽 막힘에만 `카드 사용 등록`을 정함) — 그대로 진행.
6. `prepaidOverdueDays`는 `project.value` 뒤 — 못 보는 계급은 키가 없고 화면은 2행을 그리지 않는다(null과 같게 취급).
7. 고객 승인된 차수에서는 줄 상태를 바꿀 수 없어(`[상태] 1차 고객 승인됨 · 고치려면 새 차수`) 카드 붙잡은 줄의 `취소`도 새 차수에서만 된다(05 연결 줄과 같음) — E2E는 수주 중 프로젝트로 단언.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 일괄 저장 응답 줄에 카드 쪽 사실이 없음(06-07 공백)**
- **Found during:** Task 3 E2E 「실행가 초과 2행」
- **Issue:** `finishQuoteLineSave`가 `cardSideFacts` 없이 투영해, 저장 뒤 화면(응답 줄로 다시 그림)에서 `executionOverKrw` · `hasCardSideLinks`가 사라졌다 — 2행이 안 서고, 이어서 누른 삭제가 보관으로 가 서버 거부를 받을 길.
- **Fix:** `finishQuoteLineSave(viewer, written, cardSideFacts?)`, `saveProjectLedger`가 커밋 뒤 `lineCardSideFacts`를 읽어 넘김(실패는 페이지와 같이 로그 후 사실 없이).
- **Files modified:** domain/quotes/lines.ts, domain/projects/ledger.ts · 회귀 테스트 test/integration/quote-line-links.test.ts 「카드 붙잡은 줄 저장 응답」(RED 확인 후 GREEN)
- **Commit:** facef1b · 8ed6117

**2. [Rule 3 - Blocking] 06-08 통합 두 케이스가 새 지출결의 쪽 문 게이트에 걸림**
- **Found during:** Task 2
- **Fix:** test/integration/purchase-requests.test.ts에서 온라인구매 설정을 지출결의 제출 뒤로 옮기고, `[06-07 I-1]` 케이스의 마지막 제출 전 설정을 비움(검증 의도 그대로).
- **Commit:** de1bcce

**3. [Rule 3 - Blocking] DraftLine 새 칸 셋 → 단위 픽스처 형 오류**
- **Fix:** test/unit/app/restore-edits.test.ts 픽스처에 `prepaidOverdueDays` · `hasCardSideLinks` · `executionOverKrw`.
- **Commit:** 8ed6117

**4. E2E 「카드 붙잡은 줄」 픽스처**
- 고객 승인 차수는 줄 상태를 바꿀 수 없어 수주 중 프로젝트(실행가 1,000,000 · 카드 600,000 줄 둘)로 단언했다(플랜 behavior 수치 그대로).

**5. TDD 순서 기록** — Task 3 E2E는 화면 코드 전에 썼지만 화면 코드 전에 따로 돌려 RED를 보지는 않았다(통합 「행 행동 조합」은 RED → GREEN 확인). Task 1 E2E도 서버 코드 뒤에 썼다.

## 플랜 밖 변경

- test/integration/purchase-requests.test.ts(06-08 파일 — 설정 순서만)
- domain/projects/ledger.ts · domain/quotes/lines.ts `finishQuoteLineSave` 인자 하나(위 Rule 1)
- test/unit/app/restore-edits.test.ts(픽스처 칸 셋)

## Known Stubs

없음.

## Threat Flags

없음 — 새 입구 없음. `listLineDoors`는 기존 권한 판정 뒤에만 셀을 채우고, 저장 응답의 `executionOverKrw`는 `quote.amount` 투영을 그대로 지난다.

## 넘김

- 독립 DOM 감사(A4 — 별도 에이전트, `CI=true`, backstop loading · overflow · long-text) → `/design-review`(+ codex-design-review.sh) → `/qa`: 오케스트레이터 몫(위 「캡처·GPT 검사 대상 경로」).
- 06-18: `rowActionBlock`을 트랜잭션 안에서 같은 입력으로 부른다(links = `findLineLinks(…, tx)`, paid = `findExpenseDocFacts(…, tx)`).
- 06-15: 일괄 지급은 `completeExpensePayment`를 부르므로 줄 → 문서 잠금 순서를 그대로 따른다.

## Self-Check: PASSED
