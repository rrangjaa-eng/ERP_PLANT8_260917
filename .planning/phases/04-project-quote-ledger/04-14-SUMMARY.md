---
phase: 04-project-quote-ledger
plan: 14
subsystem: api
tags: [quote-revisions, customer-approval, gate-rules, drizzle, postgres, dto-projection]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-11 loadProjectForGate · 04-12 줄 저장·복원 · 04-13 줄 종류(line_kind) · 04-20 denyWrite · 04-29 kst-date · 04-32 withTransaction lock_timeout·recordAction { tx }"
provides:
  - "createRevisionFromCurrent — 보던 차수 확인 → 견적 줄 INSERT…SELECT 복사(계보·version 1) → 조정 줄(보관 포함) 이동"
  - "setCustomerApproval — 담당 PM 고객 승인 표시/취소, 기준값(합계·md5 내용 토큰) 확인, 승인일 KST 왕복"
  - "게이트 규칙 quote.revision-create · quote.customer-approval · quote.approval-toggle · quote.vendor-required"
  - "설정 키 project.customer_approval_gate(기본 켬)"
  - "listRevisionSummaries(REVISION_SUMMARY_DTO_SPEC · registerDto) · quoteDisplayNumber · resolveLinkedDocumentsByLineage · revisionStatusWord"
  - "listRevisionLines(이전 차수 잠김 조회) + 액션 createRevisionAction · setCustomerApprovalAction · listRevisionLinesAction"
  - "리포지토리 insertRevision · approvalBasis · setRevisionApproval · summarizeRevisions · copyQuoteLines · moveAdjustmentLines · countCopyableLines"
affects: [04-24, 04-40, 04-15, 04-16, phase-05-expense]

actuals:
  tokens: 22370
  tasks: 3
  commits: 3
plan_head_before: f0625560e6d84a4d772129f13a5a2b9fbaa59d3a

tech-stack:
  added: []
  patterns:
    - "INSERT…SELECT를 getTableColumns 전개 + 바꿀 칸만 sql 별칭으로 덮어 한 문장 복사(컬럼이 늘어도 빠지지 않음)"
    - "승인 기준값 내용 토큰은 리포지토리의 sql 상수 하나(CONTENT_TOKEN)를 approvalBasis·summarizeRevisions가 공유"
    - "쓰기 함수: can()·행 범위는 트랜잭션 앞, 트랜잭션 첫 단계 loadProjectForGate, 잠금 뒤 읽기·로그는 tx, 거부는 denyWrite"

key-files:
  created:
    - domain/quotes/revisions.ts
    - test/integration/quote-revisions.test.ts
    - test/unit/domain/quote-revisions.test.ts
  modified:
    - domain/quotes/lines.ts
    - domain/rules/register.ts
    - domain/settings/keys.ts
    - repositories/quote-revisions.ts
    - repositories/quote-lines.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/actions.registry.ts
    - test/unit/domain/rules-gate.test.ts
    - test/integration/leak-scan.test.ts

key-decisions:
  - "새 차수 게이트의 canCreateRevision은 기존 structuralEditability(...).newRevision(수주중·진행·미수주 + 쓰기)을 그대로 쓴다 — 같은 뜻의 필드를 새로 만들지 않았다"
  - "고객 승인 게이트 quote.customer-approval은 수주중·미수주를 규칙 안에서 면제한다(사용자 D8 — D-43 원문 「수주중만」을 넓힘)"
  - "이전 차수 잠김 조회는 listQuoteLines ctx에 locked 옵션을 더하고, 순번 해석·행 범위는 새 domain 입구 listRevisionLines(viewer, projectId, { revisionSeq })가 맡는다 — 기존 listQuoteLines(revisionId, ctx) 호출자를 바꾸지 않는다"
  - "새 차수·승인 모두 projects 쓰기가 없으면 상태 판정 전에 거부한다(권한 → 상태 순서, 상태가 거부 문구로 새지 않음)"
  - "견적 금액을 볼 수 없는 계급은 확인할 합계가 없어 승인할 수 없다 — 새 규칙이 아니라 「본 합계를 싣는다」(ENG-D9)의 직접 결과(04-24가 버튼을 그리지 않음)"

patterns-established:
  - "승인 기준값 = (견적 합계, md5 내용 토큰) 둘 다 잠금 뒤 재계산해 비교"
  - "순번 유일 제약 23505는 insert 한 단계만 감싸 같은 거부 문구로 — 그 밖 오류는 그대로 다시 던진다"

requirements-completed: [PROJ-07, PROJ-05]

coverage:
  - id: D1
    description: "새 차수: 견적 줄 전체 복사(계보·version 1·업무 컬럼 보존) + 조정 줄(보관 포함) 이동 + 보던 차수 불일치·빈 차수·정산·완료·23505 거부"
    requirement: PROJ-05
    verification:
      - kind: integration
        ref: "test/integration/quote-revisions.test.ts#(r1)~(r8)"
        status: pass
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#quote.revision-create"
        status: pass
    human_judgment: false
  - id: D2
    description: "고객 승인 표시/취소: 담당 PM + 쓰기, 완료 거부·정산 허용, 이전 차수·연결 문서·미래 날짜·빈 차수·기준값 불일치 거부, 승인일 KST 왕복, 행동 로그 document_update"
    requirement: PROJ-07
    verification:
      - kind: integration
        ref: "test/integration/quote-revisions.test.ts#(a1)~(a10)"
        status: pass
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#quote.approval-toggle"
        status: pass
      - kind: unit
        ref: "test/unit/domain/quote-revisions.test.ts#승인일 KST 왕복"
        status: pass
    human_judgment: false
  - id: D3
    description: "게이트 규칙 quote.customer-approval(수주중·미수주 면제 · 설정 끔 통과 · 이전 승인 차수로 대신하지 않음) · quote.vendor-required 등록, 설정 키"
    requirement: PROJ-07
    verification:
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#quote.customer-approval / quote.vendor-required"
        status: pass
      - kind: integration
        ref: "test/integration/quote-revisions.test.ts#(a10) · test/integration/settings.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "차수 요약(상태 낱말 U-2 · 숫자 합계 · 줄 수 · 차수 id · 내용 토큰 · quote.amount 숨김 시 합계 키 없음) · 표시 번호 · 계보 해석"
    requirement: PROJ-07
    verification:
      - kind: integration
        ref: "test/integration/quote-revisions.test.ts#(s1)(s2)"
        status: pass
      - kind: unit
        ref: "test/unit/domain/quote-revisions.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/leak-scan.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "이전 차수 잠김 조회 + 보기 액션 listRevisionLinesAction(view · QuoteLineDto · 순번 스키마 · 행 범위)"
    requirement: PROJ-07
    verification:
      - kind: integration
        ref: "test/integration/quote-revisions.test.ts#(s3)(s4)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 14: 차수·고객 승인 서버 Summary

**보던 차수를 확인한 뒤 견적 줄을 INSERT…SELECT 한 문장으로 계보와 함께 복사하고 조정 줄(보관 포함)을 옮기는 새 차수, 합계·md5 내용 토큰 기준값을 잠금 뒤 재확인하는 담당 PM 고객 승인(승인일 KST 왕복), 고객 승인·승인 토글·새 차수·거래처 필수 게이트 넷, 차수 요약 DTO와 이전 차수 잠김 조회 보기 액션**

## Performance

- **Duration:** 약 30분
- **Started:** 2026-09-25T19:07:50Z
- **Completed:** 2026-09-25T19:37:38Z
- **Tasks:** 3 (트레이서 1 + TDD 2)
- **Files modified:** 12

## Accomplishments

- `createRevisionFromCurrent`: can()·행 범위를 트랜잭션 앞에서 읽는다. 트랜잭션 첫 단계는 `loadProjectForGate`(`deps.afterLock` 전달)다. 그 뒤 현재 차수 ≠ `fromRevisionId`이면 `다른 사람이 먼저 새 차수를 만듦 · 새로 고침`으로 거부하고, 이어서 복사 대상 줄 수 → `quote.revision-create` → insert(23505 `quote_revisions_project_seq_key` → 같은 문구) → 복사·이동 → 행동 로그 `document_create`(tx) 순서로 진행한다.
- `setCustomerApproval`: 담당 PM + `projects` 쓰기만 승인할 수 있다. 켜기는 잠금 뒤 `approvalBasis`로 빈 차수(ENG-D4)와 기준값(ENG-D9)을 판정하고, 끄기는 연결 문서를 본다. 미래 승인일은 거부한다. 저장·읽기는 `kstDayStart` ↔ `kstDateOf` 한 쌍만 쓰고, 행동 로그는 `document_update`(kind `customer_approval`)다.
- 게이트 넷: `quote.revision-create`, `quote.customer-approval`(수주중·미수주 면제 — 사용자 D8), `quote.approval-toggle`, `quote.vendor-required`(호출자 없음 — Phase 5)를 등록했다. 설정 키는 `project.customer_approval_gate`다.
- 차수 요약은 GROUP BY 한 번으로 만든다. `REVISION_SUMMARY_DTO_SPEC`로 합계를 `quote.amount`에 묶고 누수 스캔 import를 더했다. 이전 차수 잠김 조회에서는 모든 셀이 `locked`이고, `listRevisionLinesAction`을 레지스트리에 `view`로 등록했다.

## Task Commits

1. **Task 1: 트레이서 — 새 차수** - `6e38ab6` (feat)
2. **Task 2: 고객 승인 표시·게이트 셋·설정 키** - `b9fc663` (feat)
3. **Task 3: 계보 해석·차수 요약·이전 차수 잠김 조회·보기 액션** - `a26b3eb` (feat)

TDD: 태스크마다 실패 테스트를 먼저 쓰고, 실행 출력으로 RED를 확인한 뒤 GREEN으로 갔다. RED 출력은 모두 「미구현/미등록」 단언 실패였다. RED 테스트와 구현은 태스크당 한 커밋에 들어 있다(test 커밋을 따로 나누지 않음 — plan type이 execute).

## Files Created/Modified

- `domain/quotes/revisions.ts`: 새 차수·고객 승인·요약·표시 번호·계보 해석·잠김 조회 입구·`revisionLinesInputSchema`
- `repositories/quote-revisions.ts`: `insertRevision`·`approvalBasis`·`setRevisionApproval`·`summarizeRevisions`, `CONTENT_TOKEN` sql 조각, `findLatestQuoteRevision`·`findQuoteRevisionById`의 선택 `tx`
- `repositories/quote-lines.ts`: `copyQuoteLines`(INSERT…SELECT)·`moveAdjustmentLines`·`countCopyableLines`
- `domain/rules/register.ts`: 게이트 규칙 넷
- `domain/settings/keys.ts`: `PROJECT_CUSTOMER_APPROVAL_GATE`
- `domain/quotes/lines.ts`: `QuoteLineListCtx.locked`, `linkedDocumentsByLine`이 `resolveLinkedDocumentsByLineage`를 거친다
- `app/(app)/projects/actions.ts`·`actions.registry.ts`: 액션 셋 추가 및 등록
- 테스트: `test/integration/quote-revisions.test.ts`(22건), `test/unit/domain/quote-revisions.test.ts`(11건), `rules-gate.test.ts`(+18건), `leak-scan.test.ts`(import 1줄)

## rev 5 밖 방어 문구 (P0 · F1 명사형)

- `정산 · 새 차수 없음`
- `고객 승인 표시는 담당 PM만`
- `다른 사람이 새 차수를 만듦 · 새로 고침` (현재 차수가 아닌 차수의 승인)
- `연결 문서 있음 · 고치려면 새 차수`
- `승인일이 오늘보다 늦음 · 날짜를 고쳐 주세요`
- 쓰기 없는 새 차수 요청은 기존 방어 문구 `견적 줄 · 쓰기 권한 없음`을 재사용한다

## Decisions Made

- 미수주 면제(사용자 D8)는 `quote.customer-approval` 규칙 안에 두었다(독립 규칙 아님). 규칙 주석에 한 줄로 적었다.
- 복사는 `getTableColumns(quoteLines)` 전개에서 id·revision_id·계보·version·created_at·updated_at만 덮는다. 나머지 컬럼(`source` 포함)은 표 정의 전체를 원본에서 그대로 옮긴다. GAP 5b 통합 케이스는 이 여섯 칸을 뺀 전 컬럼이 같음을 `toEqual`로 단언한다.
- 새 차수 복사는 04-26 줄 상한을 다시 보지 않는다(B-32 · A-20).
- 견적 금액을 볼 수 없는 계급은 승인할 수 없다(ENG-D9의 직접 결과, 새 규칙 아님). 스키마가 `seenTotalKrw`를 필수로 받는다.

## Deviations from Plan

### Auto-fixed / 계약 조정

**1. [Rule 3 - 설계 충돌] `structuralEditability.canCreateRevision`를 새로 만들지 않음**
- **Found during:** Task 1
- **Issue:** 04-12가 이미 같은 뜻의 `newRevision`(쓰기 + 정산·완료 제외, 주석에 「04-14 새 차수 게이트의 입력」)을 두었다.
- **Fix:** 게이트 ctx `canCreateRevision`에 `structuralEditability(...).newRevision`을 넘긴다. `edit-scope.ts`는 바꾸지 않았다.
- **Committed in:** 6e38ab6

**2. [Rule 3 - 호출자 보존] 이전 차수 잠김 조회 입구**
- **Found during:** Task 3
- **Issue:** 플랜은 `listQuoteLines(viewer, projectId, { revisionSeq })`로 적었지만, 기존 `listQuoteLines(viewer, revisionId, ctx)`는 상세 화면이 부른다.
- **Fix:** `QuoteLineListCtx`에 `locked` 옵션만 더했다. 순번 해석·행 범위(`findProject`)·현재 차수 대체는 새 입구 `listRevisionLines(viewer, projectId, { revisionSeq })`가 맡고, 액션은 이 입구를 그대로 부른다. 투영은 같은 `QUOTE_LINE_DTO_SPEC`이다.
- **Committed in:** a26b3eb

**3. [Rule 2] 액션 입력 스키마를 domain에서 export(`revisionLinesInputSchema`)**
- **Issue:** `actions.ts`는 server-only 체인이라 vitest가 import할 수 없어, 순번 zod 거부(0·음수·정수 아님)를 테스트할 수 없다.
- **Fix:** 스키마를 domain에 두고 액션이 같은 객체를 쓴다(`quoteLinesInputSchema` 선례).
- **Committed in:** a26b3eb

**4. [Rule 2] 쓰기 없는 새 차수 요청은 상태를 보기 전에 거부**
- **Issue:** 게이트 안 판정만으로는 쓰기 없는 사람에게 상태 문구(정산·완료)가 새어 나갈 수 있다(교훈: 권한 → 상태 순).
- **Fix:** 트랜잭션 앞에서 `denyWrite(…, GateBlockedError("견적 줄 · 쓰기 권한 없음"))`로 거부한다. 게이트에도 같은 문구의 방어 분기가 있다.
- **Committed in:** 6e38ab6

---

**Total deviations:** 4 (계약 조정 2, 누락 보강 2). **Impact:** 범위 확장 없음. 기존 호출자·필드를 그대로 두었다.

## Issues Encountered

- TDD RED 증거 기록: `gsd-tools check tdd-red-evidence`는 Node TAP 요약 줄(`# tests/# pass/# fail`)을 요구하는데, vitest `tap-flat`에는 이 줄이 없다. 실제 ok/not ok 개수로 요약 줄을 붙여 `RED_EVIDENCE_OK`를 받았다(Task 2 RED).
- Task 1 첫 RED는 모듈 부재 로드 실패(INVALID_RED)였다. 빈 스텁을 두고 다시 돌려 단언 실패 RED를 확인했다.

## 검증 (실행 결과)

- `pnpm lint` 0 · `pnpm typecheck` 0
- 단위: rules-gate + quote-revisions + kst-date + leak-scan-coverage **65/65**
- 통합(파일별 순차): quote-revisions **22/22** · quote-lines 38 · quote-line-kinds 21 · quote-line-visibility 2 · quote-lines-conflict 7 · quote-line-cap 9 · archive 8 · settings 11 · leak-scan **927/927**
- `package.json` 의존성·`pnpm-lock.yaml` diff 없음(새 의존성 0)
- **돌리지 않음:** Task 3 verify의 `CI=true pnpm test` 전체 게이트 — 오케스트레이터가 실행자 종료 뒤 돌린다(세션 지시)

## Known Stubs

- `domain/quotes/lines.ts` `linkedDocumentsByLine`: 문서 출처가 빈 결과다(04-12부터 있던 의도된 빈 결과이며 Phase 5가 채운다). 이 플랜은 계보 해석 함수를 거치게만 했고 저장·캐시·화면을 더하지 않았다(B-33).
- `quote.customer-approval`·`quote.vendor-required`: 이 페이즈에는 호출자가 없다(Phase 5 지출결의가 부른다). 결정표 단위 테스트로 동작을 고정했다.

## Open / Next

- 04-40: 두 연결 결정적 경합(새 차수 · 옛 기준값 승인)을 `deps.afterLock`으로 만든다. 줄 저장의 현재 차수 재확인과 승인 차수 견적 칸 잠금도 04-40이 맡는다.
- 04-24: 모달 셋 · 차수 섹션 · 이전 차수 읽기 섹션(`listRevisionLinesAction`) · 복원 줄 화면을 그린다. `quote.amount`를 볼 수 없는 사람에게는 승인 버튼을 그리지 않는다.
- 성능 TODO(엔지 리뷰 §4, 04-17 소유): `lineSumsSubquery`가 전 차수 줄을 묶는다.
- 한도가 풀리면 Codex 재확인이 필요하다(이번 실행에서는 Codex를 호출하지 않음).

## Self-Check: PASSED

- 파일: `domain/quotes/revisions.ts` · `test/integration/quote-revisions.test.ts`(628행 ≥ 110) · `test/unit/domain/quote-revisions.test.ts`(81행 ≥ 30) — FOUND
- 커밋: 6e38ab6 · b9fc663 · a26b3eb — FOUND

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
