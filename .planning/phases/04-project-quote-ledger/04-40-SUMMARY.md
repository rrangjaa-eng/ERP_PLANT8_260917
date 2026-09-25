---
phase: 04-project-quote-ledger
plan: 40
subsystem: api
tags: [postgres, row-lock, concurrency, drizzle, money, quote-revision, customer-approval]

requires:
  - phase: 04-14
    provides: "createRevisionFromCurrent · setCustomerApproval(기준값 ENG-D9) · approvalBasis · findLatestQuoteRevision(tx)"
  - phase: 04-12
    provides: "저장 세 단계(prepareQuoteLineSave · writeQuoteLinesInTx · finishQuoteLineSave) · restoreQuoteLine · revision_id 줄 소속 · quoteLockReason"
  - phase: 04-20
    provides: "lockProjectForWrite · denyWrite · test/integration/lock-race.ts(deferred · waitForLockWaiter)"
  - phase: 04-11
    provides: "loadProjectForGate(잠금 + 같은 tx 자동 정산)"
  - phase: 04-22
    provides: "saveProjectLedger 프로젝트-차수 일치(quote.revision-project) · seenStatus"
provides:
  - "writeQuoteLinesInTx의 잠금 뒤 현재 차수 재확인(quote.current-revision — 단독·합성 저장 공통)"
  - "domain/money: normalizeMoneyInput · MoneyInputError · KRW_COLUMN_MIN/MAX · quoteAmountWithinBound(DR-9) — moneyToColumns가 먼저 정규화"
  - "견적 줄 금액 입력 거부 → 그 칸 셀 오류, 계산 견적가 상한 → 수량·단가 두 칸 셀 오류(04-28 거부 봉투 그대로)"
  - "승인 차수 축 approvedSeq: lineCellEditability · quoteLockReason · tableLockLine · project.line-edit(update.quoteAmountUnchanged · archive.quoteAmountZero · insert · restore)"
  - "restoreQuoteLine: 이전 차수 줄 복원 거부 · 승인 차수 합계를 바꾸는 복원 거부"
  - "두 연결 결정적 경합 통합(새 차수 대 저장 양 순서 · 승인 대 저장 · 옛 기준값 승인)"
affects: [04-24, 04-16, 04-15, 04-41, 04-07, phase-05-expense]

actuals:
  tokens: 20229
  tasks: 3
  commits: 6
plan_head_before: 9fd24a3f66b274166b60db63ed6fe3e6d4e9cce0

tech-stack:
  added: []
  patterns:
    - "판정은 writeQuoteLinesInTx 한 곳 — 잠금 뒤 같은 tx로 읽은 최신 차수에서 현재 여부·approvedSeq를 파생(따로 저장하지 않음)"
    - "금액 입력은 normalizeMoneyInput 한 규칙, moneyToColumns가 첫 줄에서 부른다(잊은 호출자도 위조 환율 저장 불가)"
    - "경합 테스트는 afterLock deferred + waitForLockWaiter로만 순서를 정한다(고정 지연 0)"

key-files:
  created:
    - test/integration/quote-revision-races.test.ts
    - test/integration/quote-approved-lock.test.ts
  modified:
    - domain/quotes/lines.ts
    - domain/money/index.ts
    - domain/quotes/edit-scope.ts
    - domain/rules/register.ts
    - test/integration/quote-lines.test.ts
    - test/integration/project-period.test.ts
    - test/unit/domain/money.test.ts
    - test/unit/domain/quote-edit-scope.test.ts
    - test/unit/domain/rules-gate.test.ts

key-decisions:
  - "현재 차수 재확인과 승인 판정은 writeQuoteLinesInTx 안(잠긴 tx)에만 둔다 — saveQuoteLines 몸체·prepareQuoteLineSave·saveProjectLedger에는 없다"
  - "승인 차수의 새 quote 줄은 견적 칸(수량·단가·상태)만 잠기고 소분류는 고른다(ENG-D7 해석 — 새 줄은 승인된 내용이 아니고 소분류 필수라 잠그면 만들 수 없다)"
  - "승인 차수의 복제(duplicatedFrom) 새 줄도 insert 판정(견적 칸 0)을 지난다 — 복제는 견적 합계를 바꾸는 새 줄이다"
  - "MoneyInputError는 UserFacingError를 상속 — 매출·총 매출 예상가처럼 셀 오류로 바꾸지 않는 호출자에서도 한국어 이유가 화면에 간다"
  - "KRW는 요청 환율을 버리므로 환율 유한성은 외화에서만 본다"

patterns-established:
  - "승인 잠김 문구는 quoteLockReason({ status, approvedSeq }) 한 함수 — 리터럴 한 번(W5)"
  - "게이트 ctx의 GAP 1 플래그는 fail-closed(quoteAmountUnchanged !== true면 승인 차수에서 거부)"

requirements-completed: [PROJ-07, PROJ-02]

coverage:
  - id: D1
    description: "새 차수 뒤 옛 차수로 온 견적 줄 저장(단독·원장 합성)이 잠금 뒤 재확인으로 전부 거부되고 DB·매출 무변경, write.denied 한 번"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/quote-revision-races.test.ts#경합 없이 새 차수 뒤 1차로 저장하면 같은 거부"
        status: pass
      - kind: integration
        ref: "test/integration/quote-revision-races.test.ts#경합 없이 새 차수 뒤 원장 합성 저장(1차 줄 + 매출 발행 줄)도"
        status: pass
    human_judgment: false
  - id: D2
    description: "두 연결 결정적 경합 — 새 차수 대 저장 양 순서, 승인 대 수량·실행가 저장, 옛 기준값 승인 거부 → 새 기준값 승인(풀 ≥ 3 · 락 대기 확인)"
    requirement: "PROJ-07"
    verification:
      - kind: integration
        ref: "test/integration/quote-revision-races.test.ts#(A)·(B)·(C)·(C')·(D)"
        status: pass
    human_judgment: false
  - id: D3
    description: "여러 차수 소속·일치 — 같은 프로젝트 다른 차수 줄 · 완료 프로젝트 줄 · 프로젝트-차수 불일치 거부, write.denied 정확히 한 번 · 금액 키 없음"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/quote-lines.test.ts#여러 차수 소속·일치(04-40 · B-01 · A-14) (m1)(m2)(m3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "normalizeMoneyInput 한 규칙(KRW 환율 1 · USD 환율 > 0 · 소수 자리 · 정수 범위 · 비유한수)과 견적 줄 셀 오류"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "test/unit/domain/money.test.ts#normalizeMoneyInput"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts#금액 입력 정규화(04-40 · B §2) (n1)(n2)(n3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "계산 견적가 상한(DR-9) — 수량·단가 두 칸 셀 오류, PG 22003 없음, 단독·합성 저장·액션 봉투"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "test/unit/domain/money.test.ts#quoteAmountWithinBound"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts#계산 견적가 상한(04-40 · DR-9) (d1)(d1b)(d2)(d3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "승인 차수 잠금 — 수량·단가·상태·소분류 · 환율만·통화만 · 견적가 있는 새 줄·복제·취소·보관·복원 거부, 합계 불변, 실행가·0원 새 줄·견적 외 비용·조정 통과, 승인 해제 뒤 편집 재개, 이전 차수 줄 복원 거부"
    requirement: "PROJ-07"
    verification:
      - kind: unit
        ref: "test/unit/domain/quote-edit-scope.test.ts#승인 차수 축(approvedSeq)"
        status: pass
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#project.line-edit — 승인 차수(04-40)"
        status: pass
      - kind: integration
        ref: "test/integration/quote-approved-lock.test.ts"
        status: pass
    human_judgment: false

duration: 48min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 40: 차수·승인 동시성과 승인 차수 잠금 Summary

**줄 저장이 프로젝트 잠금 뒤 같은 tx로 현재 차수를 다시 읽어 옛 차수 저장을 거부하고, 승인된 현재 차수는 견적 칸·합계를 바꾸는 저장·복원을 `quoteLockReason` 한 문구로 막으며, 금액 입력은 `normalizeMoneyInput` 한 규칙과 계산 견적가 상한(DR-9) 셀 오류를 지난다 — 두 연결 결정적 경합 테스트로 증명**

## Performance

- **Duration:** 48 min
- **Started:** 2026-09-25T20:11:48Z
- **Completed:** 2026-09-25T20:59:38Z
- **Tasks:** 3
- **Files modified:** 11 (소스 4 · 테스트 7)

## Accomplishments

- `writeQuoteLinesInTx`가 `loadProjectForGate` 직후 같은 `tx`로 `findLatestQuoteRevision`을 읽어, 보낸 차수가 최신이 아니면 아무것도 쓰지 않고 `다른 사람이 새 차수를 만듦 · 새로 고침`(규칙 `quote.current-revision`, `denyWrite` 한 번)으로 거부한다. 단독 저장과 `saveProjectLedger`가 둘 다 이 단계를 지나므로 합성 저장의 매출도 쓰이지 않는다.
- `domain/money`에 `normalizeMoneyInput` · `MoneyInputError` · `KRW_COLUMN_MIN/MAX` · `quoteAmountWithinBound`를 더했다. `moneyToColumns`는 첫 줄에서 정규화한다. 견적 줄 저장은 금액 입력 거부를 그 칸의 셀 오류로 돌려주고, 수량 × 단가가 상한을 넘으면 수량·단가 두 칸에 `견적가가 상한을 넘습니다 · 수량이나 단가를 고쳐 주세요`를 싣는다. 이 판정은 쓰기 전에 하므로 PG 22003이 생기지 않는다.
- 승인 차수 축 `approvedSeq`를 셀 단계·표 위 한 줄·게이트·목록·저장 결과·복원에 넣었다. 문구는 `quoteLockReason` 한 함수가 만들고, 리터럴은 domain·app 전체에서 한 번 나온다(grep 1).
- `restoreQuoteLine`이 잠금 뒤 같은 tx로 현재 차수를 읽는다. 이전 차수 줄 복원은 `이전 차수의 줄은 복원할 수 없습니다 · 현재 차수에서 새로 만들어 주세요`로, 승인 차수에서 견적가가 있는 줄 복원은 승인 문구로 거부한다.
- 두 연결 결정적 경합 통합 (A)·(B)·(C)·(C')·(D)를 만들었다. 모두 풀 크기 ≥ 3을 확인하고, `waitForLockWaiter`로 락 대기를 확인한 뒤 결과를 단언한다. `setTimeout`은 쓰지 않는다.

## Task Commits

1. **Task 1: 트레이서 — 잠금 뒤 현재 차수 재확인**: `3af1323` (test, RED) → `5857554` (feat, GREEN)
2. **Task 2: 여러 차수 소속·일치 + normalizeMoneyInput + DR-9**: `131e931` (test, RED) → `242dd7d` (feat, GREEN)
3. **Task 3: 승인 차수 잠금 + GAP 1 + 승인 대 저장 경합**: `c1345b4` (test, RED) → `16ebeed` (feat, GREEN)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## TDD Gate Compliance

- 세 태스크 모두 `test(04-40)` 커밋이 `feat(04-40)` 커밋보다 앞선다. REFACTOR 커밋은 없다(GREEN 안에서 `normalizeForKind` 두 번 호출을 한 지역 변수로 줄였다).
- 각 RED는 `gsd-tools check tdd-red-evidence`에서 `RED_EVIDENCE_OK`를 받았다(대상 테스트 실패).
  - T1: (A) 경합 — `expected 'fulfilled' to be 'rejected'`
  - T2 단위: `normalizeMoneyInput is not a function`
  - T2 통합: (d1) `expected [ '22003' ] to deeply equal []`
  - T3 단위: 승인 칸 `expected [] to deeply equal [ 'lineStatus', 'quantity', … ]`
  - T3 통합: USD 환율만 저장 — `promise resolved … instead of rejecting`
- vitest `tap-flat` 출력에는 node `--test` 형식의 `# tests/# pass/# fail` 요약 줄이 없다. 그래서 실제 `ok`/`not ok` 줄 수를 세어 요약 줄을 덧붙인 뒤 검증기에 넣었다(`/tmp/claude-0/red/footer.sh`).
- 곧바로 초록이던 케이스: (B)·(C')·(D) 경합과 (m1)~(m3) 소속·일치. 04-12·04-14·04-22의 잠금·검사가 이미 맞았고, 이 테스트들은 그 사실을 증명으로 남긴다.

## Files Created/Modified

- `domain/quotes/lines.ts`
  - 현재 차수 재확인 · `approvedSeq` · `quoteAmountUnchanged` · 복제 insert 판정
  - `normalizeLineMoney`(정규화 + DR-9 두 칸)
  - `listQuoteLines`·저장 결과의 승인 셀 단계
  - `restoreQuoteLine`의 현재 차수·승인 판정
- `domain/money/index.ts`: `normalizeMoneyInput` · `MoneyInputError` · `KRW_COLUMN_MIN/MAX` · `quoteAmountWithinBound`, `moneyToColumns`가 먼저 정규화
- `domain/quotes/edit-scope.ts`: `approvedSeq` 축(`APPROVED_LOCKED_FIELDS`), 새 줄은 `QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT`를 재사용한다. `quoteLockReason`·`tableLockLine`이 `approvedSeq`를 받는다.
- `domain/rules/register.ts`: `project.line-edit` ctx에 `approvedSeq` · `update.quoteAmountUnchanged` · `archive.quoteAmountZero`를 더했고, 승인 차수의 insert·archive·restore를 거부한다.
- `test/integration/quote-revision-races.test.ts` (신규): 경합 A~D · 순차 · 합성 저장
- `test/integration/quote-approved-lock.test.ts` (신규): 승인 잠금 통합
- `test/integration/quote-lines.test.ts`: 여러 차수 소속·일치 · 금액 정규화 · DR-9, 액션 봉투를 확인하려고 `@/lib/viewer` getSession을 목으로 바꿨다.
- `test/integration/project-period.test.ts`: (n)의 정확 일치 ctx에 `approvedSeq: null`을 더했다.
- `test/unit/domain/{money,quote-edit-scope,rules-gate}.test.ts`: 결정표

## Decisions Made

- 재사용한 것(새로 만들지 않음): `lockProjectForWrite`·`loadProjectForGate`·`lock-race.ts`(`deferred`·`waitForLockWaiter`)·`denyWrite`·`QUOTE_FIELDS_LOCKED_IN_SETTLING_INSERT`. 새 경고 로그 호출 지점은 없다. 두 새 거부는 `denyWrite`를 지난다(줄 저장 `quote.current-revision`, 복원은 기존 `restoreQuoteLine`의 `project.line-edit` 호출).
- ENG-D11 점검 결과: 세 쓰기 함수(`writeQuoteLinesInTx`·`createRevisionFromCurrent`·`setCustomerApproval`)는 모두 트랜잭션 첫 단계에서 `loadProjectForGate`를 부르고 `afterLock`을 넘긴다. 단독 `saveQuoteLines`의 `deps`도 `writeQuoteLinesInTx`까지 간다. `saveProjectLedger`는 `writeQuoteLinesInTx`를 거친다. 그래서 `revisions.ts`·`ledger.ts`는 확인만 하고 고치지 않았다.
- ENG-D7 해석: 소분류 잠금은 승인 차수의 **기존** `quote` 줄에만 건다. 새 줄은 견적 칸 0(수량·단가·상태 잠김)으로 추가되고 소분류는 고른다.
- 데모 데이터 영향: `normalizeMoneyInput` 이전에 KRW·환율 ≠ 1로 저장된 줄은 저장 때 환율이 1로 정규화된다. 그 결과 단가 칸이 바뀐 것으로 보이고 승인 차수에서는 잠긴다. 이런 줄은 demo 데이터뿐이라 업무 데이터 영향은 없다.
- 차익(`profit_krw`) 범위 관찰: DR-9 판정은 견적가만 본다. 견적가 ≈ 상한에 음수 실행가(조정·견적 외 비용 −10억 등)가 겹치면 차익이 정수 범위를 넘어 PG 22003이 여전히 날 수 있다. rev 5·DR-9가 정한 범위 밖이라 고치지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 승인 차수의 복제 새 줄도 견적 칸 0 판정**
- **Found during:** Task 3
- **Issue:** 게이트의 `duplicate` 변경에는 `quoteCellsZero`가 없다. 그래서 견적가 있는 줄을 복제하면 승인 차수 합계가 바뀔 수 있었다(OV-1 「견적 칸이 0이 아닌 새 줄」).
- **Fix:** 승인 차수에서 `duplicatedFrom` 새 줄은 `insert`(`quoteCellsZero`) 판정을 한 번 더 지난다.
- **Files modified:** `domain/quotes/lines.ts`
- **Verification:** 통합 「견적가 있는 줄의 복제(새 줄)는 거부 · 합계 그대로」
- **Committed in:** `16ebeed`

**2. [Rule 1 - 앞 플랜 테스트 계약] project-period (n)의 정확 일치 ctx**
- **Found during:** Task 3의 `CI=true pnpm test`
- **Issue:** 04-22 테스트 (n)이 `project.line-edit` ctx를 `toEqual`로 고정하고 있다. 이 플랜이 계획대로 `approvedSeq`를 싣자 필드 하나 차이로 실패했다(systematic-debugging으로 원인 확인 — 동작 회귀 아님).
- **Fix:** 기대 객체에 `approvedSeq: null`을 더했다. 정확 일치는 그대로 두었다(느슨하게 하지 않음).
- **Files modified:** `test/integration/project-period.test.ts`
- **Committed in:** `16ebeed`

**3. [Rule 1 - 테스트 린트] RED 커밋의 목 require-await**
- **Found during:** Task 2
- **Issue:** `131e931`의 `getSession` 목이 `async` 함수인데 `await`가 없어 린트 오류였다. 커밋을 `;`로 이어 붙여 린트 결과와 무관하게 커밋되었다.
- **Fix:** `() => Promise.resolve(...)`로 바꿨다.
- **Committed in:** `242dd7d`

**4. [해석] KRW 환율 유한성**
- 플랜 ④는 「금액·환율이 유한수가 아니면 not-finite」다. KRW는 요청 환율을 버리므로 환율 유한성 검사는 외화에만 적용했다. 외화의 빈 환율(NaN·0)은 `fx-rate`로 거부된다(테스트는 둘 중 하나를 허용).

---

**Total deviations:** 3 auto-fixed (1 Rule 2, 2 Rule 1), 1 해석 기록
**Impact on plan:** 모두 정확성 유지를 위한 것이다. 범위 확대는 없다.

## Issues Encountered

- GAP 1 통합 두 케이스(USD 환율만 · 통화만)는 `quoteAmountUnchanged` 없이도 거부된다. `unitPrice` 칸의 변경 감지 컬럼에 통화·환율이 들어 있어 칸 잠금이 먼저 걸리기 때문이다.
  - 변이 확인: 게이트의 GAP 1 줄을 지우면 단위 「다시 계산한 견적가 ≠ 저장값이면 바뀐 칸에 단가가 없어도 거부」가 실패한다. 통합 두 케이스는 여전히 초록이다.
  - 따라서 `quoteAmountUnchanged` 불변식을 독립으로 증명하는 것은 단위 결정표다. 통합은 합계 불변을 이중 판정으로 지킨다.
- 첫 `CI=true pnpm test`는 위 편차 2 때문에 통합에서 멈췄다. 고친 뒤 통합·E2E를 `CI=true`로 다시 돌렸다. 단위는 같은 소스로 이미 통과한 상태였다.

## Carry-over Verdicts

- **04-14 이월(NIT 9) 「04-40 전에는 보관함 복원이 이전 차수 줄을 되살릴 수 있다」 — 닫힘.**
  - `restoreQuoteLine`이 잠금 뒤 같은 tx로 최신 차수를 읽고, 줄의 차수가 그것이 아니면 `이전 차수의 줄은 복원할 수 없습니다 · 현재 차수에서 새로 만들어 주세요`로 거부한다(`denyWrite` 한 번).
  - 증명: `test/integration/quote-approved-lock.test.ts` 「1차(현재 아님) 줄의 복원은 …」
  - 저장 쪽도 옛 차수로 쓰지 못한다(Task 1).
  - 머지 묶음 ③의 「04-40 전 배포 금지」 전제에서 이 구멍은 풀렸다.
- **04-49 이월(1024px 미만에서 매출 표의 열린 입력이 사라질 수 있음) — 여전히 열림.** 이 플랜은 화면 파일을 고치지 않았다.

## Verification

- `pnpm lint` 0 · `pnpm typecheck` 0
- `CI=true pnpm test`: 단위 1264/1264 · 통합 1378/1378 · E2E 301/301
- 태스크별 검증 명령:
  - T1: 99/99
  - T2: 단위 50/50 · 통합 120/120
  - T3: 단위 106/106 · 통합 1001/1001(archive·leak-scan 포함)
- W5 grep(`고객 승인됨 · 고치려면 새 차수`, 주석 제외, domain·app): 1
- `2147483647` 리터럴: `domain/money/index.ts` 한 곳
- `package.json`·`pnpm-lock.yaml` diff 없음(새 의존성 0)
- 경합 테스트: `setTimeout` 0개 · 풀 크기 단언 · 락 대기 확인

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-24는 `quoteLockReason({ status, approvedSeq })`·`tableLockLine({ …, approvedSeq })`·`cellEditability`만으로 승인 차수 잠금을 그릴 수 있다. 화면 호출자는 아직 `approvedSeq`를 넘기지 않는다(선택 필드).
- 04-16은 「승인 차수 견적 합계 불변」을 전제로 계약 금액 쪽 불변식을 단언할 수 있다.
- 04-15·04-41·04-07은 `normalizeMoneyInput`/`MoneyInputError`를 import해 쓰면 된다. `moneyToColumns`를 거치는 경로는 이미 정규화된다.
- 미결 사용자 결정 ①(줄당 21억 초과 → bigint)은 04-07의 몫이다. 결정이 바뀌면 상한 상수만 바꾼다.

## Self-Check: PASSED

- FOUND: test/integration/quote-revision-races.test.ts · test/integration/quote-approved-lock.test.ts · domain/money/index.ts · domain/quotes/edit-scope.ts · domain/quotes/lines.ts · domain/rules/register.ts
- FOUND commits: 3af1323 · 5857554 · 131e931 · 242dd7d · c1345b4 · 16ebeed

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*

## 검토 반영 (Opus, Codex 대체 — 한도 풀리면 Codex 재확인 필요)

리뷰: `/mnt/project-files/phase4-prep/04-40-review-opus.md` — **BLOCKING 0 · SHOULD-FIX 1 · NIT 7**

**SHOULD-FIX 1 — 원화 밖 숫자 컬럼 overflow(PG 22003 → 500) 고침.** 네 입력 모두 실제 저장 경로(`saveQuoteLines`)에서 22003으로 재현(RED `fdb8e00`) 뒤 셀 오류로 막음(`6254858`):
- 환율 `numeric(12,4)` ≥ 10^8 → `normalizeMoneyInput` `range` 「환율이 상한을 넘습니다 · 환율을 고쳐 주세요」(USD 0 · 환율 10억)
- 외화 금액 `numeric(14,2)` |x| ≥ 10^12 → `range` 「외화 금액이 상한을 넘습니다 · 금액을 고쳐 주세요」(USD 1조 · 환율 0.0001)
- 수량 `numeric(12,2)` (toFixed(2) 뒤) ≥ 10^10 → 수량 칸 「수량이 상한을 넘습니다 · 수량을 고쳐 주세요」
- 차익 `profit_krw integer` 범위 밖 → 실행가 칸 「차익이 상한을 넘습니다 · 실행가를 고쳐 주세요」(견적 외 비용 실행가 −2,147,483,648)
- 네 문구는 UI-SPEC rev 5 Copywriting에 없는 새 글자(기존 「… 상한을 넘습니다 · …을 고쳐 주세요」 틀) — UI-SPEC 반영 필요. 환율·외화 판정은 `normalizeMoneyInput` 안이라 총 매출 예상가·매출·리저브도 같이 막힌다.

**NIT 7 — 이월(고치지 않음):**
1. 복원·현재 차수 재확인의 상태 판정이 줄 종류별 권한(`actorCanWrite`)보다 먼저 — 「잠금 → 권한 → 상태」 문자 그대로 아님
2. `quote.current-revision` 거부 로그에 줄 id 없음(`denyIds` 사용 권함)
3. 범용 `archive(…, "quote_line", …)` 경로가 잠금·게이트 없이 보관 — 현재 도달 불가 잠복 우회
4. GAP 1(`quoteAmountUnchanged`) 통합 증거 약함 — 소수 3자리 수량 + 실행가 변경 케이스 필요
5. KRW 소수 금액이 조용히 반올림 — 「조용히 반올림하지 않는다」 주석이 과장
6. `hasAtMostDecimals` 절대 오차 1e-6 — 큰 외화 금액의 정상 소수 2자리 오거부 가능(현재 도달 불가)
7. KRW인데 환율 ≠ 1인 데모 줄은 승인 차수에서 실행가도 못 고침 — 이관 시 환율 1 보정 필요 여부 확인
