---
phase: 06-payment-evidence-cards
plan: 28
subsystem: expenses · approvals · evidence
status: complete
tags: [risk-money, risk-approvals, closeExpense, S23, X-9]
requires: ["06-01", "06-03", "06-27"]
provides:
  - "closeExpense(viewer, { expenseId, expectedVersion, reason }, deps?) — 반려 · 회수 지출결의 종결(칸 셋 · version + 1 · 끌 수 없는 status_change 로그, 한 tx)"
  - "closeExpenseAction(next-safe-action) · registry"
  - "repositories: closeExpenseRow · listClosedExpenseIds · listClosedInstallmentsByLines, listNumberedByLines가 종결 문서를 뺀다"
  - "DocumentKindDef.closedDocumentIds 선택 훅 — 홈 막힌 문서의 반려 줄에서 뺀다"
  - "buildResubmittedMessage — 종결 · 다시 제출 경합 진 쪽 문구"
  - "증빙 OwnerState.closed (06-11이 옆에 projectCompleted를 더한다)"
  - "doorFor 넷째 인자 closedInstallments — 종결 분할 회차를 회차 번호 입력에만(X-9)"
  - "화면: 문서 머리 2차 `종결` → ConfirmDialog(부제 · 결과 줄은 서버 closeDialog) · 상태 `종결` · 메타 · 목록 낱말 `종결`"
affects: ["06-07", "06-08", "06-11", "06-13", "06-19", "06-23"]
tech-stack:
  added: []
  patterns: ["종류 선택 훅(엔진에 종류 리터럴 없음)", "읽기 순서로 경합 방어(번호 문서 목록 → 종결 분할)", "afterLock 장벽 경합 테스트"]
key-files:
  created:
    - app/(app)/expenses/[id]/close-expense-button.tsx
    - test/integration/expense-close.test.ts
    - test/e2e/expense-close.spec.ts
    - docs/design/checks/2026-10-06-06-28-expense-close.md
  modified:
    - repositories/expenses.ts
    - domain/expenses/index.ts
    - domain/expenses/dto.ts
    - domain/expenses/list.ts
    - domain/expenses/pick.ts
    - domain/approvals/kinds.ts
    - domain/approvals/index.ts
    - domain/approvals/conflict-message.ts
    - domain/evidence/index.ts
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/expenses/[id]/page.tsx
    - app/(app)/expenses/[id]/expense-document.tsx
    - ui/status-tag/status-map.ts
    - test/unit/ui/status-map.test.ts
decisions:
  - "06-28: 종결 행위자 = 기안자(expenses write) ∨ 지급 권한자(expenses.payments write), 아니면 없는 문서(존재 숨김)"
  - "06-28: 종결 문서는 listNumberedByLines에서 빠진다 — 줄 문 · 회차 상한 · 사슬 · 계보가 함께 따른다"
  - "06-28: 종결 분할 문서의 회차는 회차 번호 입력에만 더한다(문 · 남은 실행가 · 앞 회차는 numbered만) — line-door.ts 무변경"
  - "06-28: 종결 다이얼로그 부제의 공급가 조각은 expense.amount 노출이 있을 때만(closeDialog가 expense.value로 투영되므로)"
metrics:
  duration: "132 min"
  completed: 2026-10-06
actuals:
  tokens: 27425
  tasks: 3
  commits: 3
plan_head_before: 40324bf0648f26e6a68ba908d0d014993152f44d
commits: 3
---

# Phase 6 Plan 28: 반려 · 회수 지출결의 종결(S23) Summary

기안자 또는 지급 권한자가 반려 · 회수된 지출결의를 사유와 함께 종결한다. 한 트랜잭션에서 지출결의 행만 잠그고 종결 칸 셋과 version + 1, 끌 수 없는 `status_change` 로그를 남긴다. 종결 문서는 번호 문서 목록에서 빠져 견적 줄의 문이 다시 열린다. 다시 제출 · 편집 · 증빙 변경 · 홈 막힌 문서 어느 경로로도 다시 열리지 않고, 종결 분할 문서의 회차 번호는 같은 줄(계보 포함)에서 다시 쓰이지 않는다.

## 계획 이름 → 실제 (⓪, 06-28 시작 커밋 `40324bf0648f26e6a68ba908d0d014993152f44d`)

| 항목 | 결과 |
|---|---|
| 선행 의존 C15 · 05 · 06-27 · 06-01 · 06-03 | 전부 있음 — 멈춤 없음 |
| 05 번호 문서 목록 · 사슬(E-1) | `listNumberedByLines` · `listExpensePage` 2건, 비공개 `listNumberedByLineChain` 1건 |
| 05 회차 규칙(D1) | export `installmentSeqFor(others, ownSeq)` 그대로(`line-door.ts` 무변경) |
| 조사 함수(E-48) | 비공개 `function subjectParticle(` 1건 — 새 빌더를 같은 파일에 두고 export하지 않음 |
| 06-27 Drizzle 필드 | `closedAt` · `closedBy` · `closedReason` |
| `종결` 낱말 | 없었음 → status-map에 `종결: "muted"` 한 줄 추가 |
| todo 파일 | 있었음 → Task 3에서 닫음(아래) |
| 엔진 종류 리터럴(`"expense"` · `EXPENSE_DOCUMENT_KIND`, kinds.ts + index.ts) | 기준 0건 → 끝 0건 |

## Tasks

| Task | 이름 | Commit | 핵심 파일 |
|---|---|---|---|
| 1 | 트레이서 — 기안자 종결 → 로그 · 줄 문 열림 · 새 번호 제출 | 2d7d242e | repositories/expenses.ts, domain/expenses/index.ts · dto.ts, actions, [id]/page.tsx · expense-document.tsx · close-expense-button.tsx, status-map |
| 2 | 경계 — 행위자 · 상태 · 사유 · 경합 · 다시 열기 금지 · 증빙 · 홈 · 끌 수 없는 로그 · 회차 번호(X-9) | 29f77794 | domain/expenses/index.ts · pick.ts, repositories/expenses.ts, domain/approvals/kinds.ts · index.ts · conflict-message.ts, domain/evidence/index.ts |
| 3 | 화면 나머지 — 목록 낱말 · S23 여섯 상태 · 폰 시트 · todo | 563475da | domain/expenses/list.ts, test/e2e/expense-close.spec.ts |

Tracer 게이트: 대화형 · end-of-phase · 자동 verify만 있음 → 다시 실행해 녹색, 「Tracer verified end-to-end — expanding」.

## RED → GREEN 기록

- Task 1 단위: `종결이 표에 있다: expected false to be true` → 84/84
- Task 1 통합(트레이서): `closeExpense is not a function` → 녹색
- Task 2 (구현 전 첫 실행, 11개 중 7개 실패):
  - 종결 상태: 결재 중 문서가 `ExpenseConflictError`(`… 다른 곳에서 저장됨`)로 거부됨 — 거부 문구가 아님
  - 다시 열리지 않는다: 종결 뒤 편집 경로가 성공함(`expected null to be an instance of ExpenseNotFoundError`)
  - 증빙: 종결 뒤 붙이기가 성공함(`expected null to be an instance of ExpenseCloseRefusedError`)
  - 홈: 종결 문서가 막힌 문서에 남음(`expected [ …(2) ] to deeply equal [ Array(1) ]`)
  - 회차 상한: `installment_seq` `expected 2 to be 3`
  - 회차 번호 ⑴: `'2회차 · 앞 회차 26001-0001 · …' to match /^3회차 · 앞 회차 26001-0001 · /`
- 「회차 번호는 종결 문서도 센다」 갈래별 RED: 돌연변이 실행으로 얻었다. 구현을 잠시 되돌린 소프트 단언 사본(임시 파일, 지움)을 썼다.
  - 거르기만 둔 상태(Task 1과 같음):
    - ⑴ `2회차 · 앞 회차 26001-0001`
    - ⑵ `2회차 · 남은 실행가 8,000,000`
    - ⑶ `expected 2 to be 3`
    - ⑸ `expected 3 to be 4`
    - ⑹ `2회차 · 남은 실행가 8,000,000`
    - ⑺ 글자 `2회차 · 앞 회차 26001-0010`, 제출 `expected 2 to be 3`
    - ⑷는 녹색이었다(제 회차 2 유지)
  - 현재 줄 id로만 읽은 상태(N-4 · E-14): ⑹ `2회차` · ⑺ `2회차` / `2`만 빨갛고 나머지는 녹색. 이것이 계보 사슬 읽기가 필요하다는 증거다.
  - GREEN: 「회차 번호는 종결 문서도 센다」는 ⑴~⑺와 비분할 갈래가 모두 녹색이다.
- Task 3 통합 「종결 문서 목록 낱말」: `statusWord: "반려"`(기대 `종결`) → 녹색

## 검증 (모두 이 세션에서 새로 실행)

- 통합(DB `erp_e0628_test`):
  - expense-close 12 · submit-concurrency · approvals-extensions · evidence-upload · expense-visibility · expense-pick · installment-cap → 7 files / 101 passed
  - 추가로 next-turn · expense-approval-lifecycle 포함 9 files / 139 passed
  - Task 3 뒤 expense-close + expense-visibility 28/28
- 단위: record · import-cycles · document-kinds-import · error-copy-noun-style 42/42. 전체 `pnpm test:unit` 270 files / 4161 passed
- `pnpm lint` 0 · `pnpm typecheck` 0 · `CI=true pnpm build` 0
- E2E (CI=true, 프로덕션 빌드):
  - expense-close.spec.ts 10/10(lint 수정 뒤 다시 실행해 10/10)
  - expense-list 8/8 · expense-form 13/13
  - mobile-expense-320 4/4(`--project=mobile-375 --no-deps`)
  - mobile 스펙을 같은 명령에 넣었더니 의존 사슬(`dependencies: ["desktop"]`) 때문에 desktop 전체 1099개가 돌았다. 결과는 1051 통과 · 19 실패였고, 실패는 전부 관리 화면 스펙이다(people · side-panel · settings · roles · master-edit · single-column — 이 플랜이 건드리지 않은 화면). 그중 side-panel · single-column · people을 따로 돌리면 73/73 통과한다 — 전체 실행 순서 · DB 상태에 따른 것이고 이 플랜의 회귀가 아니다
- Acceptance 수치:
  - X-9: `listClosedInstallmentsByLines` 6건, line-door.ts diff 빔(origin/main · 시작 커밋 둘 다)
  - D1: doorFor 안 `installmentSeqFor(` 1, `expenseLineDoor(` 1, index.ts의 `installmentSeqFor(` 3, 반환 칸 `installmentSeq` 2
  - N-11: pick.ts 1 · index.ts 4
  - 읽기 순서: 첫 줄이 `listNumberedByLineChain(`
  - E-14: chainLineIds가 loadSubmitFacts 1 · lineFactsFor 1, `[line.id]` 0, `listNumberedByLineChain`은 비공개 1 · export 0
  - E-48: `export function subjectParticle` 0 · `export function buildResubmittedMessage` 1
  - N-4: resolveLinkedDocumentsByLineage 2 · listLineageLinesByProjects 2, 첫 줄이 `listNumberedByLineageMany(`
  - 리터럴 0 = 기준 0 · closedDocumentIds 5 · evidence `closed` 5
  - Task 3: `Toast` 0, status-filter · list-columns diff 빔
- 06-03 tx 규약:
  - `closeExpense`의 `withTransaction` 콜백 범위는 `domain/expenses/index.ts` 1213–1237줄이다
  - 주석 줄을 뺀 `\b(can|visible|findUserById|loadActionLogGate|getSettingValue)\(` 0건(기안자 이름 · 권한 · 게이트는 tx 전에 읽음)
  - 「같은 tx 기록 검사」 0건, 같은 범위 `recordAction` 1건

## Deviations from Plan

1. **[Rule 3 - Blocking] `canResubmit` 종결 판정을 Task 2 ②에서 Task 1로 당김** — 트레이서 E2E가 「종결 뒤 같은 화면이 제자리에서 다시 선다(다시 제출 폼 없음)」를 단언하려면 필요했다.
2. **CloseExpenseButton 실패 · 새로 고침 갈래를 Task 1에서 한 번에 씀** — Task 3 ②에서 바꿀 것이 없었다. ConfirmDialog · Button이 `종결…` · `aria-disabled` · 꼬리 `새로 고침` 분리 · 실패 줄을 이미 해 준다.
3. **빈 · 긴 사유 오류 자리** — 플랜의 Form.Error/blockedBy 서술 대신 1차 왼쪽 `disabledReason`에 둔다. UI-SPEC 「Error — 사유 근거 칸 … 왼쪽」과 05 RejectDialog · 06-04 CancelPaymentDialog 선례를 따랐다. 버튼 `aria-describedby`가 그 글자를 가리키는 것을 E2E가 단언한다.
4. **[Rule 2 - Security] closeDialog 부제 공급가 조각 노출 판정** — closeDialog는 `expense.value`로 투영되므로, 금액 조각은 `visible(viewer, "expense.amount")`일 때만 붙인다.
5. **closeExpense 거부 갈래 정리(Task 2 ①)** — 인스턴스가 결재 진행 · 통과면 `ExpenseCloseRefusedError(buildResubmittedMessage)`, 그 밖 비편집 상태는 `ExpenseNotFoundError`로 플랜대로 갈랐다(Task 1의 임시 `ExpenseConflictError` 대체).
6. **loadSubmitFacts 반환 타입을 별칭 `SubmitFacts`로** — 여러 줄 반환 타입이 0열 `}> {`를 만들어 acceptance awk 범위(`/^}/`)를 일찍 끊었다. 서명(위치 인자 일곱)은 05 그대로다(E-52).
7. **테스트 수정(systematic-debugging)** — 경합 · 다시 열기 테스트의 `save(…, { content })`는 견적 줄 문서에 쓸 수 없는 팀 비용 칸이었다. 05 규칙에 따라 없는 문서가 된다. 공급가 저장으로 바꿨다. 제품 코드 버그는 아니다.
8. **E2E 단언 방식** — 머리 제목은 흘려 보내기(streaming) 동안 로딩 h1과 실제 h1이 잠깐 함께 있어, `heading level 1 /^지출결의 — /`로 기다린다. 1차 이유는 ConfirmDialog 막힘 줄과 Button 이유가 같은 글자로 둘 서므로 `aria-describedby` 대상으로 단언한다. 둘 다 05 기존 동작이고 고치지 않았다.

파일 한도: 18개 밖 파일은 열지 않았다(line-door.ts는 읽기만). 그 밖의 변경은 셋이다 — hook이 요구한 점검표 `docs/design/checks/2026-10-06-06-28-expense-close.md`, GSD 도구의 todo 이동, 그리고 integration fixture는 바꾸지 않고 기존 `fixtures/payments.ts`의 `makePaymentManager`를 import만 했다.

## Todo

`node .claude/gsd-core/bin/gsd-tools.cjs todo complete 2026-09-26-phase-6-rejected-expense-close-path.md` → `{"completed": true, "date": "2026-10-06"}` (pending → completed, 563475da).

## 독립 DOM 감사 항목 (별도 에이전트, CI=true 실측 — 실행자 판정 아님)

| # | 항목 | 실행자 E2E가 이미 단언한 값 | 감사가 잴 것 |
|---|---|---|---|
| 1 | 2차 `종결` 위치 | 머리 행동 자리에 버튼이 섬(기안자 · 지급 권한자) | 1차(다시 제출 폼 버튼)와의 상대 위치 · 같은 행 여부 |
| 2 | 붉은 계열 없음 | `danger` 0(소스) | 버튼 · 모달의 computed color/background가 위험 토큰 아님 |
| 3 | 모달 결과 줄 | `견적 줄 1 문 열림 · 되돌림 없음`, 부제 `{번호} · {항목} · {공급가}` | 분할 문서 `회차 상한에서 빠짐` 줄 · 팀 비용 `되돌림 없음` |
| 4 | 사유 오류 연결 | 1차 `aria-describedby` → `사유 없음 · 사유 적기` | 501자 → `사유 500자 넘음 · 줄여 적기` 연결 |
| 5 | 진행 중 | `종결…` · `aria-disabled` · Ctrl+Enter 두 번 · Esc 무시 · 요청 1 | 같은 값 재측정 |
| 6 | 종결 뒤 포커스 · 토스트 | 포커스 = `[data-ui="screen-title"]`, `status`에 `종결` 없음 | 같은 값 |
| 7 | 320 · 375 시트 | 좌우 전폭 · 바닥 ±1 · 1차 화면 안 · 높이 ≥ 44 · 넘침 0 | 키보드 열린 상태 · 결과 줄 여러 줄일 때 |
| 8 | long-text backstop | 210자 사유 `title` = 원문 · 320 넘침 0 | 메타 줄 꺾임 · 말줄임 여부 |
| 9 | 목록 낱말 | `/expenses` `종결` 색 = `--status-muted` | 폰 목록 카드에서도 같은 색 |

## Known Stubs

없음.

## Threat Flags

없음 — 새 서버 액션 `closeExpenseAction`은 계획 위협 모델(T-06-28-*)에 있다. 판정은 domain(보임 · 행위자 · 상태 · version)이 하고, registry에 `expenses` write로 등록했다.

## Open / 다음 플랜 메모

- 06-11: 증빙 `OwnerState.closed` 옆에 `projectCompleted`를 더한다(이름 `closed`).
- 06-13(X-3): `loadSubmitFacts` 계보 범위를 바꾸면 `listClosedInstallmentsByLines`에도 같은 사슬 줄 id(`chainLineIds`)를 넘긴다 — 이미 사슬 기준이다.
- 요구 사항 EXP-06 · PROJ-06: `requirements ready-ids`가 둘 다 blocked(형제 플랜이 아직 선언) — 표시하지 않음.
- 컨텍스트 멈춤 방아쇠 ⑵: Task 2 끝에서 60% 미만 — Task 3을 같은 플랜에서 끝냄.

## Self-Check: PASSED
