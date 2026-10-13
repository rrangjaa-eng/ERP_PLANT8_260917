---
phase: 06-payment-evidence-cards
plan: 22
subsystem: settlements · approvals · projects
status: complete
tags: [risk-approvals, PROJ-06, S18, O-16, ENG-E1, X-12, PS-3, PS-4, PS-6]
requires: ["06-19", "06-21"]
provides:
  - "domain/settlements: 정산 종류 훅 O-16 재점검 — prepareSettlementFinalApproval(트랜잭션 전 loadPreSettleInputs · pmName) → onSettlementFinalApprovalInTx(lockProjectForWrite → A8 countInReviewByProjects → computePreSettleCheck(tx) → gate project.pre-settle-check → changeProjectStatus) · settlementApproveBlockedReason(표시, E-30 한 번 읽기 · 프로젝트별 한 번 계산 · 실패 행만 `점검 결과 없음 · 다시 시도`)"
  - "domain/settlements.getSettlementPreSettleSummary(viewer, { projectId }) → { blockedCount, forcedResultLine } | null(정산 아님 · 볼 수 없음)"
  - "app/(app)/leave/[id]/document-actions.tsx: 종류 중립 선택 prop approveNextStep(승인 막힘 이유 옆 3차)"
  - "정산 결재 문서 화면: 승인 막힘 3차 `점검 보기` · 강행 결과 줄 · `정산 결재 다시 올리기` 막힘(resubmitBlock)"
  - "pre-settle-check.tsx: PreSettleCheckError · PreSettleLedgerContext(QuoteLedger의 editableWidth · 권한 · addIssued · addIssueRequest · focusCustomerApproval) · 매출 3차(PS-3) · `{n}차 고객 승인 전` 3차(PS-6) · 항목 말줄임"
affects: ["06-23", "06.5"]
tech-stack:
  added: []
  patterns: ["트랜잭션 전 사전 조회 + 잠금 뒤 tx 재계산(ENG E-1 · X-12)", "서버 ReactNode 섹션에 클라이언트 함수 전달은 컨텍스트(QuoteLedger Provider)", "막힘 이유 마지막 ` · `로 이유 / 3차 가르기(06-19 머리 줄과 같은 규칙)"]
key-files:
  created:
    - docs/design/checks/2026-10-13-06-22-pre-settle-approve.md
  modified:
    - domain/settlements/index.ts
    - app/(app)/leave/[id]/document-actions.tsx
    - app/(app)/projects/[id]/settlement/page.tsx
    - app/(app)/projects/[id]/settlement/settlement-actions.tsx
    - app/(app)/projects/[id]/pre-settle-check.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/integration/pre-settle-check.test.ts
    - test/e2e/pre-settle-check.spec.ts
    - test/unit/row-scope-disposition.test.ts
key-decisions:
  - "O-16 재점검은 05 정산 종류 훅 안에만 — domain/approvals/ diff 0(C3)"
  - "담당 PM 이름은 project.value 노출일 때만 이유에 싣는다(DTO와 같은 게이트)"
  - "검토 D-4 `거래처 고르기`는 세우지 않음 — 정산의 기존 줄은 거래처 칸 잠김(edit-scope). 규칙 변경은 결정 대기"
metrics:
  duration: "약 70분"
  completed: 2026-10-13
actuals:
  tokens: 23400
  tasks: 3
  commits: 5
plan_head_before: ba46b2f1103c2e6a536ba425e49779a9301c338e
---

# Phase 6 Plan 22: 대표 최종 승인 재점검(O-16) · 정산 결재 문서 막힘 · S18 섹션 마감 Summary

정산 결재는 기안 때(06-19)와 대표 최종 승인 때(이 플랜) 같은 판정으로 막힌다. 최종 승인은 프로젝트 행을 잠근 뒤 같은 트랜잭션에서 다시 판정하고, 막히면 `GateBlockedError`로 롤백한다. 승인 · 다시 올리기 · 상세 섹션은 이유와 다음 한 수(3차)를 함께 보인다.

시작 커밋(06-22 시작): `ba46b2f1103c2e6a536ba425e49779a9301c338e`

## 한 일

| Task | 내용 | 커밋 |
|------|------|------|
| 1 RED | 통합 14건(대표 최종 승인 재점검 describe — R-2 · SA-1 · SA-3 · E-30 · X-12 · 승인 동시 6건) | `ad08fff` |
| 1 GREEN | 정산 종류 훅 재점검 · 표시 훅 · approveNextStep · 문서 화면 `점검 보기` · 점검표 | `c46742d` |
| 2 | 문서 화면 강행 결과 줄 · `정산 결재 다시 올리기` 막힘(resubmitBlock) · 통합 4 · E2E 2 | `89d69f2` |
| 3 | S18 마감 — 오류 줄 · 매출 3차(PS-3) · 고객 승인 전 3차(PS-6) · 말줄임 · E2E 7 | `51a5ccc` |
| 후속 | 행 범위 처분표에 getSettlementPreSettleSummary 입구 등록(전체 단위 녹색) | `06b85d3` |

## 관문(⓪) 확인값

- 정산 종류 훅 셋: `domain/settlements/index.ts:515-517`(base), findFinalStepActorInTx :70, BACK_TO_PROGRESS :90, PreparedFinal :448, `expensesInReview` :92, countInReviewByProjects :476 · :488, A8 describe `settlement-approval.test.ts:417`
- ENG E-1 base 줄(`domain/approvals/index.ts`): `687: const prepared = target && finalHook ? await finalHook.prepare(...)` · `688: return withTransaction(async (tx) => {` · `737: finalHook.inTx`
- inTx 전에 잡히는 행: runTransition (5) `updateInstanceStatus`의 `approval_instances` UPDATE(+ `recordStepAction`의 `approval_steps` 쓰기). `findApprovalGraphById(tx)`는 일반 읽기
- lockProjectForWrite `repositories/projects.ts:429`
- 06-19 함수: loadPreSettleInputs :126 · computePreSettleCheck :161 · getPreSettleCheck :238, summary.ts forcedResultLine :26 · preSettleBlockReason :41
- quote-table: addIssued :1775 · addIssueRequest :1791(06-18 발행 요청 줄 추가) · useEditableWidth :1956 · CustomerApprovalLine :2788
- PreSettleInputs 필드: `allowances{openExpenses, unmatchedLines, missingRevenue}` · `onlineVendorName` · `scope` · `exposure` · `lineDoors` — 프로젝트별 필드 없음(E-30 한 번 읽기가 성립)

## 이름 대응(계획 ↔ 실제)

| 계획 | 실제 | 비고 |
|------|------|------|
| `loadPreSettleInputs(viewer, row.projectId)` | `loadPreSettleInputs(viewer)` | 프로젝트 id 인자 없음 |
| 06-18 발행 요청 줄 추가 함수 | `addIssueRequest`(quote-table.tsx QuoteLedger) | |
| pre-settle-check.tsx 「오류 prop `{ status: "error" }`」 | 없었음 — `PreSettleCheckError`를 새로 두고 page.tsx가 오류 갈래에서 그린다 | 아래 편차 3 |
| 섹션에 prop으로 addIssued 등 전달 | `PreSettleLedgerContext`(QuoteLedger가 Provider) | 섹션이 서버 page.tsx의 ReactNode라 함수 prop 불가 — 같은 함수 · 같은 값 그대로 |

## 검증(RED → GREEN)

| 검사 | 결과 |
|------|------|
| RED Task 1 통합(`-t "대표 최종 승인 재점검"`) | 7 failed / 7 passed — 의도한 단언 |
| GREEN pre-settle-check.test.ts | 35/35 |
| X-12 RED 변이(lockProjectForWrite → findProjectById) | 1 failed(GateBlockedError 대신 승인 통과) → 복원 |
| 「승인 동시 6건」 RED 변이(loadPreSettleInputs를 inTx 안으로) | 11226ms 뒤 실패(`다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장` — 풀 교착 tx 타임아웃) → 복원 |
| Task 1 verify 통합 7파일(pre-settle-check · settlement-approval · tx-safety · next-turn · approvals-extensions · approvals-lifecycle · leak-scan) | 4281 passed |
| Task 1 E2E CI=true pre-settle-check + settlement-approval | 11 passed · 18 skipped(visual 프로젝트) |
| Task 2 E2E RED(「강행 결과 줄」 · 「다시 올리기 막힘」) | 2 failed — 결과 줄 없음 · aria-disabled 없음 |
| Task 2 통합 pre-settle-check + settlement-approval | 59 passed |
| Task 2 E2E CI=true pre-settle-check + settlement-approval | 13 passed · 18 skipped |
| Task 2 E2E CI=true mobile-375 mobile-settlement-wave13 | 4 passed |
| Task 3 E2E RED(「섹션 마감」 7건) | 5 failed(버튼 없음 · 오류 줄 없음 · 테스트 로케이터 2건은 숨은 폰 줄을 집어 고침) · 2 passed(1023 없음 · 구매 요청 href — 06-19 동작 고정) |
| Task 3 E2E CI=true pre-settle-check · quote-table · revenue-section · issue-requests | 107 passed · 18 skipped · 0 failed |
| 단위 error-copy-noun-style · stylelint-config | 102 passed |
| 단위 import-cycles · approval-row-actions | 5 passed |
| 전체 단위 `pnpm vitest run --project unit` | 304 파일 · 4578 passed(처분표 1건 고친 뒤) |
| `pnpm lint` · `pnpm typecheck` | 0 · 0 |
| C19 `git diff --name-only ba46b2f1...HEAD` 위험 경로 grep | 0 |
| package.json · pnpm-lock.yaml · docs/design/tokens.css · domain/approvals/ diff | 0 |

`getSettlementPreSettleSummary` 통합 4건은 함수(Task 1 커밋에서 승인 3차용으로 먼저 생김) 뒤에 썼다 — RED를 본 것은 Task 2 E2E 두 건이다.

## Acceptance 줄 번호(onSettlementFinalApprovalInTx 본문 기준)

- R-2 · X-12 순서: 6 lockProjectForWrite < 8 countInReviewByProjects < 10 computePreSettleCheck < 14 changeProjectStatus
- 표시 훅: expensesInReview 1 · loadPreSettleInputs 1 · getPreSettleCheck 0, C3 로그 0줄, inTx 안 E-1 금지 호출 0 · computePreSettleCheck 1
- approveNextStep 3곳 · document-actions diff에 `정산` 0
- `grep -c resubmitBlock settlement-actions.tsx` 3 · settlement.module.css diff 0
- project-detail.module.css 옛 토큰 0 · pre-settle-check.tsx `subtitle` 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 보안] 담당 PM 이름 노출 게이트**
- **Found during:** Task 1
- **Issue:** `row.pmName`은 DTO에서 `project.value` 노출로 가려지는 값 — 이유 문자열에 그대로 실으면 노출표를 우회
- **Fix:** prepare · 표시 훅 모두 `visible(viewer, "project.value")`일 때만 `· 담당 PM {이름}`, 아니면 `완료 전 점검 {N}건`
- **Commit:** `c46742d`

**2. [Rule 3] getSettlementPreSettleSummary는 getPreSettleCheck 대신 loadPreSettleInputs + computePreSettleCheck**
- 통합 주입 mock(loadCalls)이 같은 경로를 보도록. 동작 같음. `c46742d`

**3. [Rule 3] 서버 page에 리터럴 해시 `#pre-settle-check`**
- `PRE_SETTLE_CHECK_HEADING_ID`가 "use client" 모듈 상수라 서버 컴포넌트에서 값으로 못 읽음(클라이언트 참조가 됨) — 주석으로 출처 표기. `c46742d`

**4. [Rule 3] app/(app)/projects/[id]/page.tsx 수정(files_modified 밖)**
- 계획은 06-19 섹션에 오류 prop이 있다고 봤으나 없었다 — page.tsx가 오류면 아무것도 그리지 않았다. `preSettleSection`의 오류 갈래에 `<PreSettleCheckError />` 한 줄. `51a5ccc`

**5. [Rule 3] 섹션 → QuoteLedger 함수 전달을 prop 대신 컨텍스트로**
- 섹션은 서버 page.tsx가 만든 ReactNode라 클라이언트 함수를 prop으로 줄 수 없다. QuoteLedger가 `PreSettleLedgerContext.Provider`로 `addIssued` · `addIssueRequest` · `editableWidth` · `canWriteEntries` · `issueRequests.canRequest` · `saveLocked`를 그대로 넘긴다(새 판정 · 새 줄 추가 함수 없음, PS-3 고르기는 pre-settle-check.tsx 한 곳). `51a5ccc`

**6. [Rule 1] 행 범위 처분표(row-scope-disposition) 새 입구**
- Task 1의 `getSettlementPreSettleSummary` → `listSettlementSummaries`가 처분표에 없어 전체 단위 1건 빨강 — post-gate 사유로 등록. `06b85d3`

**7. 고객 승인 3차 글자**
- 계획 글자 `고객 승인 전` 대신 서버 DTO `pendingLabel` 그대로 `{n}차 고객 승인 전`(06-19 매출 줄 글자를 바꾸지 않음). 트리거(`고객 승인 표시`)가 없는 사람에게는 3차 없이 글자만

## 갈림(결정 필요) — 06-19 검토 D-4 `거래처 없음 · 거래처 고르기`

- **근거:** `domain/quotes/edit-scope.ts` cellLevel — 정산(`settling`)의 기존 줄은 `execution`만 `edit`이고 `vendorId`는 `locked`. S18은 정산에만 서므로 견적 줄 표 문(quote-table.tsx 2330-2342 `canPickVendor = vendorShown && editableWidth && row.cells.vendorId === "edit"`)도 정산에서는 `거래처 고르기`를 그리지 않는다. 같은 조건으로 배선하면 늘 null(죽은 코드)이라 넣지 않았다.
- **지금(선택 A · 권장):** 점검 행은 `거래처 없음`만(할 수 없는 선택지는 숨김). E2E 「거래처 없는 미매칭 줄 — 폭 1280에서도 `거래처 없음`만」이 고정.
- **선택 B:** 정산에서 거래처 칸을 열도록 edit-scope 규칙을 바꾼다(사용자 D12 범위 변경 · 이 플랜 밖). 그러면 컨텍스트에 `pickVendor`(setOpenCell vendor) 한 갈래를 더하면 된다.
- **선택 C:** 비활성 3차 + 이유 — 갈 곳 없는 버튼이라 비권장.

## 오케스트레이터 몫(아직 안 함)

- 화면 검증 순서(CLAUDE.md §6): 실행자가 아닌 별도 에이전트가 `CI=true`로 S18 · 정산 결재 문서 막힘 DOM 실측 감사(backstop 4건 포함) — A4
- `/design-review`(+ `bash scripts/codex-design-review.sh` Codex 디자인 검토) → `/qa`
- `/review` + `/cso`(묶음 PR Post-build)
- C17 독립 검토: 실행자가 아닌 Opus 에이전트 1명이 훅 롤백 · 표시 · 서버 문구 일치 · 「승인 동시 6건」 RED를 독립 검토하고 결과를 SUMMARY에
- 위 「갈림」 D-4 결정
- origin/main 머지 · PR(오케스트레이터 지시로 건너뜀)

## 06.5 정리 대상

없음 — 이 플랜은 `evidence_amount` · `pickPaymentAmount`를 새로 읽지 않는다(바뀐 파일 grep 0).

## 호출한 스킬

superpowers:test-driven-development · superpowers:verification-before-completion · design-gate · superpowers:systematic-debugging(Task 3 `거래처 고르기` 실패 — 원인 edit-scope 잠금)

## Known Stubs

없음.

## Threat Flags

없음 — 새 엔드포인트 · 권한 경로 없음. 새 화면 행동은 모두 기존 함수(QuoteLedger 줄 추가 · router.refresh · 링크)이고 저장은 기존 서버 게이트를 지난다(T-06-109).

## Self-Check: PASSED

- 파일: SUMMARY · 점검표 · 바뀐 소스 12개 존재(`git diff --name-only ba46b2f1...HEAD`)
- 커밋: ad08fff · c46742d · 89d69f2 · 51a5ccc · 06b85d3 — `git log` 확인
- 격리 DB erp_test_0622 · erp_0622_test 삭제함
