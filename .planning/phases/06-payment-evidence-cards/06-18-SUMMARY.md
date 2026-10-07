---
phase: 06-payment-evidence-cards
plan: 18
subsystem: revenue issue requests (D-610) · ledger batch save · S16 detail revenue section
status: complete
tags: [PROJ-06, D-610, UA-616, O-12, A-605, E-26, CROSS-E-4, S16]
requires: ["06-13", "06-27"]
provides:
  - "domain/issue-requests: saveIssueRequestRows · linkIssueRequestToEntry · listProjectIssueRequests · assertIssueRequestWriteRight · ISSUE_REQUEST_DTO_SPEC(registerDto IssueRequestDto)"
  - "repositories/revenue-issue-requests: listIssueRequestRowsByProject · insertIssueRequest · findIssueRequestById · updateIssueRequestIfVersionMatches · lockIssueRequest · markIssueRequestIssued"
  - "saveProjectLedger 입력 issueRequests + 새 발행 줄 fromIssueRequestId 잇기(saveRevenueInTx 뒤 같은 tx) + 결과 issueRequests"
  - "computeVat export(domain/revenue)"
  - "S16 발행 요청 표(issue-request-table.tsx) · issueRequestStatusWord"
affects: ["06-19", "06-21"]
tech-stack:
  added: []
  patterns:
    - "잇기는 원장이 부르고 domain/revenue는 domain/issue-requests를 import하지 않는다(한 방향 — import-cycles 녹색)"
    - "요청 줄 거부는 SaveRejectedError formatErrors(rowId = 요청 id 또는 새 발행 줄 id)로 돌려 Phase 4 오류 칸 흐름을 탄다"
key-files:
  created:
    - domain/issue-requests/index.ts
    - repositories/revenue-issue-requests.ts
    - app/(app)/projects/[id]/issue-request-table.tsx
    - app/(app)/projects/[id]/issue-request-word.ts
    - test/integration/issue-requests.test.ts
    - test/e2e/issue-requests.spec.ts
    - docs/design/checks/2026-10-07-06-18-issue-requests.md
  modified:
    - domain/projects/ledger.ts
    - domain/revenue/index.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/integration/leak-scan.test.ts
decisions:
  - "요청 줄 거부(날짜 · 금액 형식, issued/취소 줄 수정, version 불일치, 이미 이어짐)는 SaveRejectedError formatErrors — UserFacingError 문자열이 아니라 오류 칸으로 선다. 완료/미수주 잠김과 쓰기 권한 없음은 UserFacingError(serverError)"
  - "A-605: 요청 금액 · 부가세 · 합계는 revenue.issued_amount 정보 항목이 명세(leak-scan 등록)이고, 프로젝트 쓰기 권한자에게는 listProjectIssueRequests가 같은 세 키를 더한다(OR 규칙 — all-of DtoSpec으로 표현 불가). 상태 2행 발행액(issuedAmountKrw)은 항목대로만"
  - "linkIssueRequestToEntry는 요청 행 FOR UPDATE 뒤 판정에 더해 UPDATE에도 status='requested' 가드를 둔다(이중 장치) — 변이 확인은 둘 다 지워야 빨개진다"
  - "발행 줄 INSERT 뒤 잇기 단계가 이 발행 줄이 같은 프로젝트의 활성 발행 종류인지도 본다(FK만으로는 종류를 못 가른다)"
  - "프로젝트 상태 판정은 원장이 잠근 locked.status(첫 판정 행)를 쓴다 — 허용 bidding · in_progress · settling"
metrics:
  duration: "약 1시간 30분(05:29–06:00 UTC 커밋 기준 + 읽기)"
completed: 2026-10-07
actuals:
  tokens: 26700     # chars/4 over the realized diff (106,855자, next.config 임시 변경 제외)
  tasks: 3
  commits: 6        # MEASURED: git rev-list --count b078873..HEAD (SUMMARY 커밋 전)
plan_head_before: b078873d8a293a3602e2a9c1c70232647c9b6ff3
requirements-completed: [PROJ-06]
---

# Phase 06 Plan 18: 발행 요청(D-610) 저장 · 발행 줄 잇기 · S16 표 Summary

PM의 발행 요청을 원장 일괄 저장 한 트랜잭션에 얹고, 매출 기록 권한자의 `발행 줄로` → 일괄 저장이 같은 트랜잭션에서 요청을 `발행됨`으로 잇는다 — 요청 행 `FOR UPDATE` 뒤 상태 판정으로 동시 잇기는 하나만 성공한다.

## 06-18 시작 커밋 · 선행 게이트(Task 1 ⓪)

- 06-18 시작 커밋: `b078873d8a293a3602e2a9c1c70232647c9b6ff3`(base — 첫 커밋 6cd704b 전). C7 · C9 확인: `git log --first-parent --no-merges --format=%h b078873..HEAD -- db/schema db/migrations domain/permissions/menus.ts` = 0줄.
- 게이트 표: C15(05-13 SUMMARY 있음 · `submitSettlement` 1건) · 06-27(`revenueIssueRequests` 1건, `0025_phase6_tables.sql`에 `revenue_issue_requests`) · 06-01(`발행됨: "success"` status-map 43행) · K-5(`CompletedProjectError` · `PROJECT_STATUS_WORD`) · UA-616/A-604(`saveProjectLedger` 124 · `loadProjectForGate(` 190 · `saveRevenueInTx` · `revenueWriteRights` · `^async function computeVat` · `isNew?: true` 4건) — 전부 통과.
- **A-605:** `domain/permissions/info-items.ts:53` `{ key: "revenue.issued_amount", label: "매출 발행액", staffDefault: true }`.
- **audit-B ⑴~⑷:** ⑴ `writeQuoteLinesInTx` 범위 0 · ⑵ `saveRevenueInTx`/`saveEntries` 범위 0 · ⑶ 같은 tx 기록 검사 0 · 0 · ⑷ `test/integration/tx-safety.test.ts` 녹색(아래 통합 5파일 3843건에 포함). 회귀 없음.
- **06-27 칸 대응표(실제 이름 = 계획 이름):** `desired_issue_date` · 금액 묶음 `amount_*`(`amountAmountKrw` 등) · `memo` · `status`(requested/issued/cancelled) · `issued_entry_id`(유일 `revenue_issue_requests_issued_entry_uniq`) · `requested_by` · `cancelled_by` · `cancelled_at` · `version` — 다른 이름 없음.

## 계약 대조 — 06-13이 넘긴 계약

06-13 SUMMARY는 `rowActionBlock` 입력의 잠금 뒤 읽기 · 거부 판단은 등록 게이트 · purchase 갈래는 판정에 쓰지 않는다를 06-18에 넘겼다. **06-18 플랜(발행 요청)은 `rowActionBlock`을 쓰지 않는다**(`grep rowActionBlock`이 06-13 · 06-19 플랜에만 걸림 — 소비자는 06-19). 플랜이 우선이라 이 플랜은 `rowActionBlock` · 이중 연결 문구를 건드리지 않았고, 계약은 06-19로 넘긴다(「넘김」). 디스패치의 「온라인구매 줄 이중 연결 문구」 · 「증빙 금액 수정 막기 · 비어 있던 금액 · 마지막 증빙 무효 · 원천징수 절사」 결정도 이 플랜 소관이 아니라 깨질 코드를 만들지 않았다(해당 코드 무변경).

## 한 일

- **Task 1 (tracer):** 통합 RED(모듈 없음) → 리포지토리 · domain · 원장 확장 GREEN → 액션 zod · 낱말 변환 · S16 표 · E2E 한 경로. 통합 `issue-requests.test.ts` 12건 · E2E 2건.
- **Task 2:** 동시 잇기(원장 `afterLock` 장벽 + `waitForLockWaiter`) · DTO 키 가름(A-605) · settling 허용 · completed 잇기는 막지 않음(U-4).
- **Task 3:** 빈 화면 세 갈래(375 · 1280, 계정 둘) · `발행 줄 입력 중` · `발행 줄 빼기` · 동시 잇기 오류 칸 · 줄 순서 · 200자 메모 말줄임 E2E 4건.

### RED · GREEN · 변이

- RED: 통합 테스트 먼저 커밋(6cd704b) — `Cannot find package '@/domain/issue-requests'`로 실패. GREEN: 3c5add2 뒤 12/12.
- **E-26 변이:** `linkIssueRequestToEntry`의 잠금 뒤 `issued`/`requested` 판정 블록과 `markIssueRequestIssued`의 `status='requested'` 가드를 지우면 「동시 잇기 — 장벽」이 `expected 'fulfilled' to be 'rejected'`로 RED(B도 이어져 발행 줄 2건) → 되돌린 뒤 `-t "동시 잇기 — 장벽"` 1 passed. 장벽 없는 `Promise.all` 경합 사례 없음. (판정 하나만 지워서는 안 빨개진다 — 두 겹이라서.)
- E2E는 UI를 먼저 만든 뒤 썼다(통합만 RED 먼저 — 계획 Task 1 ④와 다른 순서). 첫 실행이 바로 초록이어서 토큰 · 포커스 · 금액 단언이 구현을 실제로 읽는지는 단언 내용(`toBeFocused`, 계산된 `--text-muted` 색, `22,000,000`, 오류 문구)으로 갈음했다.

## 검증(격리 DB `erp_e0618_test`)

| 명령 | 결과 |
|---|---|
| 통합 `issue-requests` · `revenue-entries` · `quote-lines` · `tx-safety` · `leak-scan` | 5 files · 3843 passed / 0 failed |
| 통합 `issue-requests` 단독(Task 2 추가 후, lint 수정 뒤) | 18 passed / 0 failed |
| `-t "동시 잇기 — 장벽"` | 1 passed · 17 skipped |
| 단위 `import-cycles` · `leak-scan-coverage` · `status-map` · `error-copy-noun-style` · `stylelint-config` · `eslint-restrictions` | 6 files · 200 passed / 0 failed |
| `pnpm typecheck` · `pnpm lint`(eslint + stylelint) | rc=0 · rc=0(flock) |
| `CI=true` E2E `issue-requests` | 6 passed / 0 failed(18 skipped = visual 프로젝트) |
| `CI=true` E2E `revenue-section` + `quote-table` | 72 passed / 0 failed(18 skipped) |
| 구조 grep(Task 2 acceptance) | `lockIssueRequest` 안 `db` 0 · 저장/잇기 안 `db`·판정 호출 0 · 같은 tx 기록 위반 0 · `domain/revenue`의 issue-requests import 0 · `export async function computeVat` 1 · `completed-lock` 0 · `waitForLockWaiter` 2 · 옛 토큰 0 · C7/C9 diff 0줄 |

Build는 로컬 `turbopack.root`를 임시로 넣어 돌렸고 되돌렸다(커밋 안 함). 전체 단위 · 전체 통합 · 전체 E2E는 돌리지 않았다(CI 몫). E2E 실패 한 건(행 수 6 ≠ 3)은 폰 접힌 줄이 `tr`에 같이 있던 테스트 쪽 기대 오류라 읽는 순서 단언으로 고쳤고, lint 한 건은 테스트의 `any` 대입이었다 — 제품 코드 결함은 없었다.

## Deviations from Plan

**1. [Rule 3 - 의존 기술] `발행 줄 빼기` 3차 추가** — 플랜은 「저장 전 새 발행 줄을 지우면 연결이 풀린다」만 말하는데 Phase 4 발행 줄 표에는 줄을 지우는 동작이 없다(격자 키보드가 꺼진 표). 요청 줄 상태 칸에 3차 `발행 줄 빼기`(접근 이름 `희망 {MM-DD} 발행 줄 빼기`)를 더해 저장 전 새 줄을 지우고 연결을 푼다. 새 글자라 「사용자 질문 후보」에 올림.
**2. [Rule 2 - 안전] 잇기 대상 발행 줄 종류 검사** — 같은 프로젝트의 활성 `issue` 줄인지 확인(FK는 종류를 못 가린다). 잠금 뒤 판정에 포함.
**3. [Rule 2 - 안전] `markIssueRequestIssued`에 `status='requested'` 가드** — 계획의 잠금 뒤 판정과 이중으로 둔다.
**4. [표시] 발행 줄 · 입금 줄 소제목 추가** — 발행 요청 표가 서면 두 표가 `발행 요청` 소제목 아래 이어 보이지 않게 `발행 줄` · `입금 줄` 소제목(`.tableSubheading`)을 같은 모양으로 더했다(요청 표가 없으면 렌더하지 않는다). UI-SPEC 「Phase 4 발행 줄 소제목」이 실제로는 sr-only 캡션뿐이라 눈에 보이는 소제목을 만들었다.
**5. [순서] E2E를 UI 뒤에 썼다**(위 RED 절).
**6. 비스키마** — 이 플랜은 스키마 · 마이그레이션 · 메뉴를 바꾸지 않았다(C7 · C9).

## 플랜 밖 변경

- `app/(app)/projects/[id]/project-detail.module.css` — 클래스 넷(`.tableSubheading` · `.requestMemo` · `.requestStatus` · `.requestStatusNote`)만 더함, 토큰은 기존 두 단 이름. files_modified에 없었으나 새 컴포넌트 전용 CSS를 새 파일로 쪼개지 않고 기존 모듈을 같이 쓰는 이 폴더 관례를 따랐다.
- `docs/design/checks/2026-10-07-06-18-issue-requests.md` — design-gate 점검표(화면 커밋 훅 요건).
- `app/(app)/projects/[id]/revenue-section.tsx`에서 `AmountInput` · `NumberGroups`를 `export` — `issue-request-table.tsx`가 재사용(슬롯 prop으로 순환 import 회피).

## 넘김

- **06-19:** 06-13의 `rowActionBlock` 소비 계약 셋(입력은 `lockProjectForWrite` → `lockQuoteLines` 뒤 같은 tx로 읽기 · 거부 판단은 등록 게이트(`card.dual-link-block` · `expense.line-paid-lock` · `purchase.line-door`) · purchase 갈래는 판정에 쓰지 않음)과 UI-SPEC 문구 갱신(`지출결의 {번호} 연결됨 · 카드 사용은 다른 줄`)은 이 플랜이 쓰지 않았다 — 소비자 06-19로.
- **06-21:** `발행 요청 취소`(Delete → 확인 모달) · S17 목록 · `?issueRequest` 포커스 · 취소 ∥ 잇기 경합. 이 플랜은 취소 낱말 표시(`취소`, muted)만 읽는다.
- **06-19:** 점검의 「매출 미입력」 그룹이 가리키는 `발행 요청 추가`가 이제 서 있다.
- 독립 DOM 감사(별도 에이전트, `CI=true`, backstop zero-one-many · long-text) → `/design-review` → `/qa`는 오케스트레이터 몫. 묶음 PR Post-build는 `/review` + `/cso`(`domain/revenue/index.ts`가 돈 경로).

## 사용자 질문 후보

1. **`발행 줄 빼기`**(새 글자): 저장 전 새 발행 줄 지우는 동작이 표에 없어 요청 줄 3차로 만듦. 다른 안: 발행 줄 표 행에 `Delete` 키/지우기 3차를 두기, 또는 지우는 동작 없이 새로 고침으로 푸는 것.
2. **저장 거부 한 줄 문구**(UI-SPEC에 없음): `요청을 찾을 수 없음 · 새로 고침` · `이미 발행됨 · 새로 고침` · `취소된 요청 · 새로 고침` · `다른 사람이 먼저 이 요청을 바꿈 · 새로 고침` · `이미 저장된 요청과 값이 다름 · 새로 고침` · (플랜 지정) `다른 사람이 먼저 이 요청을 이음 · 새로 고침`. 기존 발행 줄의 `…새로 고침` 꼴을 따랐다.
3. **프로젝트 쓰기 = 요청 권한**: 「담당 PM」 대신 `projects write`를 쓴다(플랜 문구). 담당 PM이 아닌 쓰기 권한자도 요청을 적을 수 있다. 다른 안: 담당 PM(`pmUserId`)만.
4. **요청 금액 0 허용**: 검증을 넣지 않았다(발행 줄과 같은 기준). 아래 260907 #3과 같은 사안.
5. **완료 · 미수주 프로젝트의 빈 화면**: 쓰기 PM에게도 `발행 요청이 없습니다`만(추가 버튼 없음). UI-SPEC은 이 갈래를 따로 말하지 않는다.

## 260907 대조 (읽기 전용 — 구현하지 않음)

| # | 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|---|---|---|---|
| 1 | 발행 요청은 프로젝트를 고칠 수 있는 사람이 낸다(확정 2026-08-18) | server/src/invoices.ts:266(`canRequest: can(me,'project.edit')`) | domain/issue-requests/index.ts:59 · domain/projects/ledger.ts:179 | 같음 |
| 2 | 요청 금액과 실제 발행액이 달라도 막지 않고 발행 줄의 공급가액이 기준 | docs/06_업무/07_매출-수금-지급.md:89 | domain/projects/ledger.ts:373(금액 비교 없음) · test/integration/issue-requests.test.ts(금액이 달라도 막지 않는다) | 같음 |
| 3 | 요청 금액은 0원보다 커야 한다 | server/src/invoices.ts:165(`invoice_requests_amount_positive`) | domain/issue-requests/index.ts:86-105(`prepare` — 0 검증 없음) | **숨은 규칙(사용자 결정 필요)** |
| 4 | 요청에 「받는 방식」(세금계산서/카드)이 있고 카드 갈래는 장 없이 카드 매출 줄만 선다 | server/src/invoices.ts:171 · :270 · docs/06_업무/07_매출-수금-지급.md:137 | 해당 없음(요청 표에 칸 없음 — 06-27 표 명세 밖) | **숨은 규칙(사용자 결정 필요)** |
| 5 | 요청에 「이 협력사 앞으로 끊어 주세요」 거래처를 적어 보내면 처리 때 협력사도 고를 수 있다 | docs/06_업무/07_매출-수금-지급.md:36-45 | 해당 없음(요청 표에 거래처 칸 없음) | **숨은 규칙(사용자 결정 필요)** |
| 6 | 발행됨은 매출 줄이 있어야 하고 누가 언제 발행했는지 남는다 | server/src/invoices.ts:166-167 | db `revenue_issue_requests_issued_check`(06-27) · domain/issue-requests/index.ts:179-218(잇기 + `recordAction` 같은 tx) | 같음(결) |
| 7 | 발행 요청을 한꺼번에 일괄 처리하지 않는다(홈택스 번호 자리 없음, 2026-09-03) | docs/06_업무/07_매출-수금-지급.md:47 | `발행 줄로`는 요청 한 줄씩(issue-request-table.tsx 상태 칸) | 같음 |
| 8 | 요청 보임 범위는 행사의 담당팀을 따른다 | server/src/invoices.ts:108-113 | domain/issue-requests/index.ts:283(`scopeFor(project)` + 프로젝트 조회) | 같음(결) |
| 9 | 늦음 = 정산 중인데 요청이 없는 것(`invoice_requests_overdue`) | server/src/invoices.ts:17-20 | 06-19 점검 몫(이 플랜 무관) | 계획 결정(06-19) |

숨은 규칙(사용자 결정 필요) **3건**(#3 · #4 · #5).

## 캡처·GPT 검사 대상 경로

| 경로 | 바뀐 요소 | 데이터 조건 |
|---|---|---|
| `/projects/{id}` 매출 섹션 | `발행 요청` 소제목 + 표(희망 발행일 · 금액 + 2행 `부가세 · 합계` · 메모 · 상태), 발행 줄 · 입금 줄 소제목 | 요청 줄 `신청됨` 1건 이상 · 쓰기 PM 계정(1280) |
| 같은 경로 | 빈 화면 세 갈래 | 요청 0건 · 쓰기 PM 1280 / 매출 기록 권한자(담당 PM 이름) 1280 / 375 |
| 같은 경로 | `발행 줄로` 뒤 `발행 줄 입력 중` + 새 발행 줄(발행일 포커스) · `발행됨` + 2행 `발행 {MM-DD} · {금액}` | 매출 기록 권한자 계정 · `신청됨` 요청 1건 |
| 같은 경로 | 긴 메모(200자) 두 줄 말줄임 · 요청 줄 여러 개(희망일 오름차순) | 요청 3건 이상, 한 건 메모 200자 |
| 같은 경로 | 저장 거부 오류 칸(`다른 사람이 먼저 이 요청을 이음 · 새로 고침` — 새 발행 줄 발행액 칸) | 저장 전에 다른 세션이 같은 요청을 이은 상태 |

## 화면 검토 증거

(오케스트레이터가 채움 — 독립 DOM 감사 · `/design-review`(Codex + 4폭 캡처) · `/qa`)

## Known Stubs

없음.

## Threat Flags

없음 — 새 입구는 `saveProjectLedgerAction`의 스키마 확장(`issueRequests` · `fromIssueRequestId`)뿐이고 플랜 threat_model(T-06-88 · 89 · 90 · 143 · 1801 · 1802)이 다룬다. 부가세 · 합계는 스키마에 없다.

## Self-Check: PASSED

- 파일 존재: domain/issue-requests/index.ts · repositories/revenue-issue-requests.ts · issue-request-table.tsx · issue-request-word.ts · test/integration/issue-requests.test.ts · test/e2e/issue-requests.spec.ts — 확인.
- 커밋 존재: 6cd704b · 3c5add2 · e51b2a8 · 2077fa8 · 539d83d · 6acda92 — `git log b078873..HEAD`로 확인.
