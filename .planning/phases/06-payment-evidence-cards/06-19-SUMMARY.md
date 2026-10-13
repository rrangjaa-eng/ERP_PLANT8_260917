---
phase: 06-payment-evidence-cards
plan: 19
subsystem: settlements · approvals · projects
status: complete
tags: [risk-approvals, PROJ-06, S18, ENG-E1, R-6, pre-settle-check]
requires: ["06-02", "06-03", "06-06", "06-07", "06-13", "06-27", "06-28"]
provides:
  - "domain/pre-settle-check: loadPreSettleInputs(viewer)(트랜잭션 밖 — 강행 허용 세 키 · 온라인구매 협력사 · 지출결의 범위 · 금액 노출) · computePreSettleCheck(viewer, projectId, inputs, tx?)(tx 리포지토리 · 순수 함수만) · getPreSettleCheck · preSettleLogDetail · PreSettleCheckDto(registerDto)"
  - "domain/pre-settle-check/summary.ts 순수 함수: summarizePreSettle · forcedResultLine · preSettleBlockReason · openExpenseState · liveLinkCount · isUnmatchedLine · lineDisplayNumbers · revenueSummary"
  - "repositories/pre-settle-check.ts: listPreSettleExpenseRows · listPreSettleLineRows · listIssuedAmountsKrw(전부 tx)"
  - "게이트 규칙 project.pre-settle-check(domain/rules/register.ts) — submitSettlement 새 기안 · 다시 기안이 막힘 건수로 거부, 강행이면 document_submit 로그 detail.preSettle"
  - "repositories/expenses.listExpenseIdsInScope에 선택 tx 인자"
  - "화면: 정산 상세 「완료 전 점검」 섹션(견적 표 아래 · 매출 섹션 앞) · `정산 결재 올리기` disabledReason `완료 전 점검 N건` + 3차 `점검 보기`(섹션 제목 포커스) · status-map 낱말 `선결제 · 증빙 없음`"
  - "테스트 픽스처: linkCardUsage · issueRevenue · clearPreSettleBlockers(test/integration/fixtures/settlements.ts)"
affects: ["06-22", "06-23"]
tech-stack:
  added: []
  patterns: ["사전 조회(트랜잭션 밖) + tx 계산 분리(ENG E-1)", "투영 노출 판정 주입(project deps.visible ← inputs.exposure)", "막힘 건수는 범위 가르기 전 전체 값(R-6)"]
key-files:
  created:
    - domain/pre-settle-check/index.ts
    - domain/pre-settle-check/summary.ts
    - repositories/pre-settle-check.ts
    - app/(app)/projects/[id]/pre-settle-check.tsx
    - app/(app)/projects/[id]/pre-settle-word.ts
    - docs/design/checks/2026-10-13-06-19-pre-settle-check.md
    - docs/design/checks/2026-10-13-06-19-review-fixes.md
    - test/unit/domain/pre-settle-check.test.ts
    - test/unit/app/pre-settle-word.test.ts
    - test/integration/pre-settle-check.test.ts
    - test/e2e/pre-settle-check.spec.ts
  modified:
    - domain/settlements/index.ts
    - domain/rules/register.ts
    - domain/settings/keys.ts
    - repositories/expenses.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/settlement-button.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - ui/status-tag/status-map.ts
    - ui/detail-screen/DetailScreen.tsx
    - ui/detail-screen/DetailScreen.module.css
    - test/unit/ui/status-map.test.ts
    - test/integration/fixtures/settlements.ts
    - test/integration/settlement-approval.test.ts
    - test/e2e/settlement-fixture.ts
decisions:
  - "06-19: loadPreSettleInputs는 viewer만 받는다(프로젝트별 칸 없음 — 06-22 · 06-23이 한 번 읽어 여러 프로젝트에 쓴다)"
  - "06-19: 미결 지출결의 대상 = 번호 있음 · 삭제 안 됨 · closed_at IS NULL · 결재 상태 submitted/in_review/rejected/approved, 낱말은 resolveEvidenceStatus 결과로(면제가 선결제를 이긴다)"
  - "06-19: 미매칭 줄은 최신 차수 · 보관 안 됨 · 조정 아님 · 취소 아님 · 실행가 ≠ 0 · 살아 있는 연결 0(지출결의는 ① 대상 목록에 든 것만 산다)"
  - "06-19: R-6 — 그룹 건수 · 막힘 건수는 프로젝트 전체, 미결 지출결의 행만 보는 사람 범위로 가르고 범위 밖은 outOfScopeCount 건수만. 미매칭 · 매출 줄은 범위 거르기 없이 금액 칸만 정보 항목"
  - "06-19: 강행 기안은 새 행동 종류 없이 document_submit 로그 detail.preSettle { groups, forced }"
  - "06-19 검토 F-1: 미매칭 줄의 문은 프로젝트 쓰기 권한자에게만 싣고(inputs.lineDoors), expense_closed.latestId는 보는 사람의 지출결의 범위 안일 때만 — 아니면 문 none"
metrics:
  duration: "110 min"
  completed: "2026-10-13"
actuals:
  tokens: 23630
  tasks: 3
  commits: 6
plan_head_before: cccfb3714b00aaf236306629fa53fd23b7225005
---

# Phase 06 Plan 19: 완료 전 점검 Summary

정산 프로젝트의 미결 지출결의 · 미매칭 견적 줄 · 매출 미입력을 한 DTO로 계산해 상세 섹션에 보이고, 같은 판정이 05 `submitSettlement`의 새 기안 · 다시 기안을 막는다. 권한 · 설정 · 범위 · 노출은 트랜잭션 전에 읽고(`loadPreSettleInputs`), 트랜잭션 안에서는 tx 리포지토리와 순수 함수만 쓴다(ENG E-1). 범위가 좁은 사람에게는 범위 밖 문서를 `그 밖 N건`으로만 보인다(R-6).

## ⓪ 선행 의존 재확인 (06-19 시작 커밋 기준)

- **06-19 시작 커밋:** `cccfb3714b00aaf236306629fa53fd23b7225005`(시작 2026-10-13T11:09:16Z)
- 모두 있음. 멈춤 없음.

| id | 확인 | 결과 |
|---|---|---|
| C15 | 05-13 SUMMARY · `submitSettlement` / `insertSettlementIfAbsent(` | 있음 · 2건 |
| A-601 · A-609 · UA-610 | `"settling"`(domain/projects) · `export function SettlementButton` · Button `nextStep` | 9건 · 1건 · 5건 |
| A-603 | `"adjustment"`(domain/quotes · db/schema) | 6건 |
| A-604 | 계약 금액 출처 | `domain/revenue/index.ts` `deriveContract`(최신 차수 고객 승인 → `repoSumQuoteAmountByRevision`, 미승인 → `{n}차 고객 승인 전`). 점검은 같은 출처를 tx로 읽는다(`findLatestQuoteRevision(…, tx)` + `sumQuoteAmountByRevision(…, tx)`) |
| R-6 기반 | `export async function visibleExpenseScope` | 1건 |
| C10 | `closed_at/closedAt`(db/schema) · `prepaid` · 06-28 SUMMARY | 4건 · 4건 · 있음(종결 판정 = `closed_at IS NULL`) |
| C5 | `hasEvidence`(tx 선택 인자 있음) · `resolveEvidenceStatus` | 1건 · 1건 |
| 06-02 · 06-07 · 06-13 | `resolveLineDoor` · `findLineLinks` · `resolveLinkedDocumentsByLineage` · `PURCHASE_ONLINE_VENDOR_NAME` | 1 · 1 · 3 · 2(정의 + 참조) |
| 강행 허용 키 | `project.force_complete`(keys.ts) | 3건 |
| E-2 · E-10 준비 | precheck/createCardUsage · precheck/createPurchaseRequest · `approvedExpenseWithEvidence` · `saveRevenue(` · A8 describe | 4(같은 접두 갱신 · 삭제 함수 포함) · 2 · 1 · 1 · 1 |
| M-9 | 05-UI-SPEC | 있음(대조 표 아래) |

### 이름 대응표 (플랜 이름 → 실제)

| 플랜 | 실제 |
|---|---|
| `loadPreSettleInputs(viewer, projectId)` | `loadPreSettleInputs(viewer)` — 프로젝트별 칸이 없어 projectId를 받지 않는다 |
| 발행 줄 요약(`summarizeIssuedEntries` 꼴) | `listIssuedAmountsKrw(viewer, projectId, tx)` + domain의 `sumKrw` · `revenueSummary` |
| 종결 판정 이름(06-28) | 리포지토리 조건 `isNull(expenses.closedAt)`(06-28 `closeExpenseRow` 칸) |
| 카드 · 소지자 준비 도우미(06-05) | 정산 픽스처의 새 도우미 `linkCardUsage(holder, lineId, amountKrw)` — 06-05 `createCardUsage` 경로, 카드사 · 뒤 4자리는 무작위(X-a) |
| 섹션 `id="pre-settle-check"` | `data-ui="pre-settle-check"` → 가장 가까운 section의 h2로 포커스(ui/ DetailScreen을 고치지 않는다) |

### ENG E-1 기반 줄

`awk '/export async function submitSettlement/,/^}/' domain/settlements/index.ts` — 트랜잭션 앞: `findProject` · `findProjectInScope(projectRowScope)` · `isAssignedPmWriter` · `prepareSubmission` · **`loadPreSettleInputs`(11행)**. `withTransaction`(13행) 안: `findProjectById(…, tx)` → `insertSettlementIfAbsent(…, tx)`(처음 잠그는 행 — 프로젝트 FK 검사 `FOR KEY SHARE`, 「기안 동시 6건」이 풀 밖 Client의 `FOR UPDATE`로 막아 세우는 행) → `findSettlementByProjectId(…, tx)` → `computePreSettleCheck(…, tx)`(24행) · `gate`(레지스트리 순수 판정) → `findApprovalGraphByDocument(…, tx)` → `resubmitDocument` / `submitDocument`(tx · logDeps). 안에 전역 판정 · 설정 읽기 없음.

구조 grep(최종): 파일 전체 6 = `loadPreSettleInputs` 안 6, `computePreSettleCheck` 안 0.

### M-9 대조 (05-UI-SPEC ↔ 06 UA-610)

| 항목 | 05-UI-SPEC | 06-19 구현 | 어긋남 |
|---|---|---|---|
| 자리 | 프로젝트 상세 머리 줄(확인 대상 #4 · UA-610 줄 79) | `settlement-button.tsx`(quote-table 머리 줄) | 없음 |
| 라벨 | `정산 결재 올리기` | 같음 | 없음 |
| 1차/2차 | 2차, 모달 · 폼 없이 즉시 | 2차 그대로 · 막힘은 `disabledReason` + 3차 `점검 보기` | 없음(UA-610 「1차(또는 2차)」 안) |

### E-2 · E-4

- E-2 준비 도우미: `linkCardUsage` · `issueRevenue` · `clearPreSettleBlockers`(`setupSettlementProject`가 in_progress 뒤 부른다). E2E는 `test/e2e/settlement-fixture.ts`의 인라인 `cardUsageOn` + `saveRevenue`.
- E-4(A8 describe, 주석 뺀 줄 번호): 첫 `it` 2행 · 정산 기안 `submitted(` **9행** · 결재 중으로 남길 지출결의 `submitReadyDraft(` **11행**(기안이 앞). `결재 중 지출결의 1건 · 먼저 결재` 1건 · 옛 순서 케이스 「지출결의 제출 뒤 정산 기안」 1건(27행 · 제출 30행).

## PreSettleInputs 칸 (06-22 · 06-23 ⓪ 가드용)

`allowances { openExpenses, unmatchedLines, missingRevenue }` · `onlineVendorName` · `scope`(05 `visibleExpenseScope`) · `exposure`(`expense.amount` · `quote.amount` · `revenue.issued_amount` → boolean) · `lineDoors`(`can(viewer, "projects", "write")` — 검토 F-1). 프로젝트별 칸 없음.

## RED / GREEN 기록

- **E-1 「기안 동시 6건」:** RED 변이 = `loadPreSettleInputs`를 트랜잭션 안(`insertSettlementIfAbsent` 뒤)으로 → 약 10072ms에 `timeout exceeded when trying to connect`(풀 고갈)로 실패. 되돌려 GREEN 통과.
- **E-10:** RED 변이 = `hasEvidence`에서 tx 인자 제거 → 약 10202ms에 `다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장`으로 실패. 되돌려 GREEN. 면제 리뷰 읽기(`findReviewByExpense(…, tx)`)는 미결 후보 행마다 돈다(행별 경로 — E-10 준비 프로젝트에서만 행이 생긴다).
- Task 1 RED → GREEN: 트레이서(반려 지출결의 1건이 기안 거부) 단위 · 통합 · E2E.
- Task 2 RED → GREEN: 세 그룹 · 낱말 · 줄의 문 · 표시 번호 · D-612 계보 · PS-4 로그. 「반려 문서를 종결」 케이스는 RED 때 이미 통과했다(종결 조건 `closed_at IS NULL`을 Task 1 리포지토리에 넣었기 때문).
- Task 3 RED(86fbf78): 통합 5 실패(행 2 ≠ 1 · `outOfScopeCount` undefined · 범위 밖 번호 노출 · executionKrw 없음 · 금액 키 있음), 「DTO_REGISTRY」는 Task 1 등록으로 이미 통과. E2E `그 밖 1건` 없음으로 실패. GREEN(abca4b0) 전부 통과.

## 검증 (마지막 실행 — 로그 `/tmp/claude-0/exec-0619/`)

- 통합(격리 DB `erp_test_0619`, flock): `pre-settle-check` · `leak-scan` · `settlement-approval` — 3 파일 4071 passed / 0 failed. Task 2 때 관련 8 파일 147 passed.
- E2E(`CI=true`, 격리 DB `erp_0619_test`, 빌드 예열 뒤): `test/e2e/pre-settle-check.spec.ts` 3 passed(나머지 18은 다른 프로젝트 몫 skipped). Task 1 · 2 때 desktop 전체 124 passed · mobile 5 passed.
- 단위: error-copy-noun-style · stylelint-config · eslint-restrictions · pre-settle-check · pre-settle-word · status-map · import-cycles — 7 파일 246 passed.
- `pnpm lint` 0 · `pnpm typecheck` 0.
- acceptance: `leak-scan.test.ts` 커밋 0줄(시작 커밋 이후) · 강행 키 `readBy` 3 → 0 · `findLineLinks` 3건 · 리포지토리에 corpCardUsages/purchaseRequests/files 0 · `line-door.ts` 판정 grep 0 · C19 금지 경로 변경 0.

## 호출한 스킬

- superpowers:test-driven-development — 태스크마다 RED 커밋 → GREEN 커밋.
- superpowers:systematic-debugging — CI=true E2E webServer 60초 초과(원인: 콜드 빌드 → `CI=true pnpm build` 예열, 06-27 선례), Task 3 E2E가 404(원인: 새 계급에 `project.value` 노출 행 없음 → 테스트 준비에서 켬).
- superpowers:verification-before-completion — 커밋 전 · SUMMARY 전.
- design-gate — 점검표 `docs/design/checks/2026-10-13-06-19-pre-settle-check.md`(화면: `app/(app)/projects/[id]/`, `ui/status-tag/status-map.ts`, 빈칸 없음).

## Deviations from Plan

1. **[Rule 3] `loadPreSettleInputs(viewer)`** — projectId 인자 없음(프로젝트별 칸이 없고 06-22 · 06-23이 여러 프로젝트에 한 번 읽어 쓴다).
2. **[Rule 3] 줄 거르기를 domain에서** — 리포지토리는 최신 차수의 보관 안 된 줄 전부를 돌려주고 domain이 거른다(표시 번호가 줄 전부의 순서에서 나온다).
3. **[Rule 3] `listIssuedAmountsKrw`** — 발행 줄 금액 목록만 읽고 건수 · 합계는 `domain/money`로(리포지토리에서 돈을 세지 않는다).
4. **[Rule 3] 포커스 대상** — `id` 대신 `data-ui="pre-settle-check"` → 가까운 section h2(tabIndex -1), ui/ DetailScreen을 고치지 않으려고(members-section 선례). **검토 O-1에서 되돌림** — 플랜 ⑥대로 제목 `id="pre-settle-check"`(`DetailScreen.Section headingId`, 0090536).
5. **[Rule 3] 새 파일 `test/unit/app/pre-settle-word.test.ts`** — eslint boundaries가 `test/unit/domain`에서 app import를 막는다.
6. **[Rule 3] E2E DB `erp_0619_test`** — 오케스트레이터 지시 이름 `erp_test_0619`는 E2E global-setup이 거부한다(`_test`로 끝나야 함). 내가 만들고 지우는 격리 DB이고, 통합은 지시대로 `erp_test_0619`.
7. **[Rule 1] E2E 준비 상태 확인** — 지출결의 제출 · 고객 승인의 잠금 읽기가 먼저 자동 정산을 해 `applyAutoSettlement`가 빈 목록을 돌려줄 수 있다 → 자동 정산 뒤 `findProjectById(...).status === "settling"`로 확인.
8. **[Rule 3] Task 3 통합 · E2E의 좁은 계정** — 줄에서 지출결의를 만들려면 `projects` 쓰기도 들어(createExpenseFromLines) 통합 계정에 더했고, E2E 계정은 상세가 열리도록 `project.value` 노출만 켰다(금액 항목은 숨김 그대로).
9. **범위 밖 축소** — `no_vendor` 문은 글자 `거래처 없음`만(3차 `거래처 고르기`는 없다), 섹션 로드 오류 줄 · 매출 미입력 3차(`발행 요청 추가` · `발행 줄 추가`)는 06-22 몫(플랜 주석과 같음). 260907과 다른 동작은 새로 넣지 않았다.
10. **화면 열 조건** — 미결 지출결의 행이 범위 안에 하나도 없으면 표를 그리지 않고 `그 밖 N건`만, 금액 · 실행가 열은 금액 키를 실은 행이 있을 때만 선다(빈 `—` 열을 두지 않는다).

## 오케스트레이터 몫(아직 안 함)

- 독립 DOM 감사: /mnt/project-files/notes/06-review/06-19-dom-audit.md, 증거 /mnt/project-files/06-review/pr-e/06-19/ — D-1~D-5 반영(D-1 · D-2 · D-3 · D-5 = 0090536, D-4 = 06-22 몫으로 남김 — 아래 「검토 반영」).
- **/design-review + Codex 디자인 검토**: S18이 SYSTEM.md · UI-SPEC과 일관한지(부제 없음 · 빈 그룹 접힘 · `미결 없음` · 매출 줄 차이 색), 「문구 없이 이해되는가 · 남은 결정이 있는가」.
- **/qa**: 정산 상세에서 막힘 → 점검 보기 → 행 3차 이동(지출결의 열기 · 구매 요청 · 지출결의 올리기) 흐름.
- **/review**: 코드 검토(묶음 PR 단위).
- **/cso**: 돈 · 결재 경로(`domain/settlements` 게이트 · fail-closed · 강행 로그), R-6 범위 누수(범위 밖 번호 · id · 금액이 DTO에 없음).
- Opus 독립 검토: 수정 필요 → F-1 반영(49a7101). 보고서 /mnt/project-files/notes/06-review/06-19-review.md

## 검토 반영

| 지적 | 등급 | 처리 | 커밋 |
|---|---|---|---|
| F-1(Opus 검토) 회수 문서가 이어진 미매칭 줄의 `expense_closed.latestId`가 범위 밖 · 쓰기 권한 없는 사람의 RSC 페이로드에 실림 | 중간 | `loadPreSettleInputs`가 트랜잭션 전에 `lineDoors = can(projects, write)`를 읽어 없으면 문 `none`(listLineDoors와 같이 숨김). `latestId`는 미결 행과 같은 `listExpenseIdsInScope`(tx, 한 질의)로 걸러 범위 밖이면 문 `none`. 통합 회귀 2건(범위 좁은 작성자 · 보기만 하는 사람 — DTO JSON에 문서 id 없음), 고치기 전 2건 실패 확인 | 49a7101 |
| D-1(DOM 감사) 폰에서 행동 3차가 따로 P1 열 → 항목 칸 46~104px | 높음 | 행동 열을 P3(폰에서 숨김)로, 같은 3차를 항목(P1) 셀 2행(`.preSettlePhoneLine`, <700에서만 보임)에. 폰 P1 = 항목 · 금액 · 상태(SYSTEM 최대 3열). 항목명은 SYSTEM 「항목명은 줄바꿈 허용」 그대로(말줄임은 지출결의 목록 · 결재함만 — 2026-10-09 결정) | 0090536 |
| D-2(DOM 감사) 320 · 실행가 상한 줄에서 미매칭 표가 본문보다 12px 넓음 | 중간 | D-1로 행동 열이 빠져 해소. E2E 「폰 320 · 긴 항목 · 실행가 상한」이 섹션 · 표 넘침 ≤ 0 실측 | 0090536 |
| D-3(DOM 감사) 행 3차 접근 이름에 행 구분 없음 | 중간 | sr-only 앞 조각 — `{번호} 지출결의 열기`(미결 행), `{번호} {항목} 지출결의 올리기` · `구매 요청` · `지출결의 열기`(미매칭 줄, Copywriting :313-314) | 0090536 |
| D-4(DOM 감사) 거래처 없는 줄에 3차 `거래처 고르기` 없음 | 낮음 | **반영 안 함 — 06-22 몫.** 06-19 플랜 ⑤ · must_haves는 미매칭 3차를 `구매 요청` / `지출결의 올리기` / `담당 PM {이름}`으로만 정하고, `거래처 없음 · 거래처 고르기`는 06-22-PLAN must_haves(:38 · :268 「거래처 없는 줄 → `거래처 없음 · 거래처 고르기`(S14 막힘)」)가 맡는다. 06-19는 문 `no_vendor`를 DTO로 보내고 글자만 그린다 | — |
| D-5(DOM 감사) 1280 `점검 보기` 뒤 제목이 창 맨 아래 | 낮음 | `focus({ preventScroll: true })` + `scrollIntoView({ block: "start" })`, id 있는 섹션 제목은 `scroll-margin-top: calc(var(--bar-h) + var(--s-4))`(고정 상단 바 아래). E2E가 행 toBeInViewport · 제목 top < 창 절반 단언 | 0090536 |
| O-1(DOM 감사) 제목 h2에 `id="pre-settle-check"` 없음 | 관찰 | 플랜 ⑥이 「제목 `id="pre-settle-check"` `tabIndex={-1}`」을 요구 → `DetailScreen.Section`에 선택 prop `headingId`(id + tabIndex -1), `점검 보기`는 그 id로 찾는다. 해시 진입(`/projects/{id}#pre-settle-check`) 자리 생김 | 0090536 |

- 검토 반영 검증(로그 `/tmp/claude-0/fix-0619/`): 통합 `test/integration/pre-settle-check.test.ts` 21 passed(격리 DB `erp_test_0619`, flock) · E2E `CI=true` `test/e2e/pre-settle-check.spec.ts` 5 passed(desktop, 격리 DB `erp_0619_test`, flock — 고치기 전 4 실패 확인) · 단위 5 파일 250 passed(pre-settle-check · pre-settle-word · status-map · screen-frames · design-system-docs) · `pnpm typecheck` 0 · `pnpm lint` 0.
- 호출한 스킬(검토 반영): design-gate(점검표 `docs/design/checks/2026-10-13-06-19-review-fixes.md`) · superpowers:test-driven-development · superpowers:systematic-debugging(F-1 회귀 테스트 대조군이 대표로 실패 — 원인: 대표 계급은 `projects` 쓰기가 없어 문이 숨는 것이 맞음 → 대조군을 팀 범위 PM으로) · superpowers:verification-before-completion.

## Known Stubs

없음(06-22 몫의 3차 · 오류 줄은 플랜이 정한 범위 밖이고 화면에 빈 자리로 남기지 않는다).



## Self-Check: PASSED

- 만든 파일 10개 모두 있음 · 커밋 6개(8ce5ebd · 9b6ffed · 9348455 · 6790fba · 86fbf78 · abca4b0) 모두 있음 · `git rev-list --count cccfb37..HEAD` = 6(SUMMARY 커밋 전)
