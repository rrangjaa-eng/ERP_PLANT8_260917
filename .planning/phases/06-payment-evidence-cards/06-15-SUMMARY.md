---
phase: 06-payment-evidence-cards
plan: 15
subsystem: 지급 대상 목록(S1) · 일괄 지급(S2) — 06-03 단건 경로 위 건별 트랜잭션
status: complete
tags: [EXP-09, EXP-06, AS1, D-604, E-25, E-31, E-34, H-3, R-2, C4, C5, C12, Q4, Q6, V-1, risk-money]
requires: ["06-03", "06-04", "06-06", "06-10", "06-11", "06-27", "06-29"]
provides:
  - "repositories/payment-targets.ts — listPaymentTargetRows · findPaymentTargetRowsByIds(결재 통과 ∧ 살아 있는 지급 없음 ∧ 종결 · 삭제 아님, 쪽 자르기 없음 E-25)"
  - "domain/payments/targets.ts — listAllPaymentTargets(E-31 export · 06-20 · 06-23 소비) · listPaymentTargets(합계 · 쪽 · 그룹 · DTO) · rejudgePaymentTargets(H-3) · PAYMENT_EVIDENCE_FILTERS · listPaymentTeamOptions"
  - "domain/payments/batch.ts — completePaymentsBatch(권한 · loadPaymentShared 루프 전 한 번, 행마다 completeExpensePayment 트랜잭션, 부분 성공) · batchRowOutcome · BATCH_ROW_FAILED"
  - "DTO paymentTargetRow(domain/expenses/dto.ts) · completePaymentsBatchAction(zod 1~200행 · isCalendarDate)"
  - "S1 화면(payment-targets-table.tsx) · S2 모달(batch-payment-dialog.tsx) · StatusFilter views/selects prop(06-20 S3이 팀 · 월로 재사용)"
affects: ["06-17", "06-20", "06-23"]
tech-stack:
  added: []
  patterns:
    - "일괄 = 행마다 단건 도메인 함수(각자 트랜잭션) + 루프 전 공유 사전 읽기 + 루프 뒤 막힌 id 묶음 재판정"
    - "판정 → 증빙 필터 → 합계 → 쪽 자르기는 domain 한 곳(리포지토리는 전체 행)"
key-files:
  created:
    - repositories/payment-targets.ts
    - domain/payments/targets.ts
    - domain/payments/batch.ts
    - app/(app)/expenses/payment-targets-table.tsx
    - app/(app)/expenses/batch-payment-dialog.tsx
    - test/integration/payment-batch.test.ts
    - test/e2e/payment-batch.spec.ts
    - docs/design/checks/2026-10-07-06-15-payment-targets.md
  modified:
    - domain/expenses/dto.ts
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/expenses/(list)/page.tsx
    - app/(app)/expenses/list-columns.ts
    - app/(app)/expenses/status-filter.tsx
    - app/(app)/expenses/expenses.module.css
decisions:
  - "지급 대상 목록도 문서 보임(canSeeExpense, CSO-1 패턴)으로 거른다 — 지급 처리 경로(loadPaymentInputs)와 같은 범위. 전사 범위면 묻지 않는다"
  - "팀 select는 repositories/teams listTeams(활성) — 05 domain listTeams가 admin.people 권한을 요구해 지급 권한자가 못 부른다(지급 권한 판정 뒤에 부름)"
  - "세율을 구할 수 없는 행은 고를 수 없고 이유는 06-04 TAX_UNAVAILABLE 그대로"
  - "빈 화면 두 행동(`지급 완료 보기` · `필터 지우기`)은 ListEmpty onClick(router.push) 버튼 — 같은 경로 `/expenses?…` Link의 Next 프리페치 응답이 브라우저에서 끝나지 않아 networkidle이 영영 안 온다(실측, design-principles 막힘). ui/ListEmpty에 prefetch 선택지가 없고 ui/는 이 플랜 밖"
metrics:
  duration: "약 2시간 40분(03:00 무렵 → 05:35, 잠금 대기 포함)"
  completed: "2026-10-07"
commits: 3
plan_head_before: c5ed80f0d0a15eb69d20ac8bbf77a1751872de25
actuals:
  tokens: 29000
  tasks: 3
  commits: 3
---

# Phase 06 Plan 15: 지급 대상(S1) · 일괄 지급(S2) Summary

지급 권한자의 `/expenses` 기본 보기를 「지급 대상」으로 바꾸고, 여러 건을 골라 지급일 하나로 처리하는 일괄 지급을 06-03 단건 경로 위에 얹었다. 행마다 단건 트랜잭션(잠금 → version → 게이트 → 재계산)을 타고 실패한 행만 막히며(부분 성공), 막힌 행은 응답 순간 다시 판정해 선택 칸을 갱신한다. 토스트는 없고 결과 글자(`aria-live`)와 이유 줄이 알린다.

시작 커밋 c5ed80f · 커밋 3개(be0c4d9..a9b29f0, 이 SUMMARY 커밋 제외).

## 한 일
- Task 1 트레이서: 통합 RED(be0c4d9) → 리포지토리 · 판정 · 일괄 · DTO · 액션(ba68538) → S1 · S2 화면(a9b29f0).
- Task 2 막힘 · 재판정 · 스냅숏: 부분 성공, H-3 재판정, C4 확인 기록 있음 · 없음, E-34 사전 읽기 한 번, E-25 쪽 = 필터 뒤 자르기, 재전송 0건, Q4 짝 막힘, 목록 지급 총액 = 단건 재계산, 세율 읽기 횟수, 조작 요청, Forbidden(통합 12건 + 순수 2건).
- Task 3 화면 마감: 빈 · 필터 0건 · 로드 오류 · S1 열 뼈대(Suspense), 팀 · 증빙 필터, 예정일 그룹 · 합계 줄, 좁은 폭(1024 미만 선택 · 1차 없음, 700 미만 행 링크), 막힌 행 이유 줄 · 결과 글자 두 색, 지급일(기본 오늘 · 미래 허용 · E-20). E2E 7건(+ Task 1 2건).

## 선행 확인(Task 1 ⓪)
| id | 결과 |
|---|---|
| C15 · 05 실물(C3) | 05-13 SUMMARY · (list)/page.tsx · status-filter.tsx · list-columns.ts · groupExpenses · pickTaxDates 있음 |
| 06-03 · 06-04 | completeExpensePayment · loadPaymentInputs · loadPaymentShared · pickPaymentAmount · PayableChangedError 있음. grep 결과 5줄 — `decidePayable`이 `export async function`이라 계획의 `export function (decidePayable…)` 패턴에 안 걸렸을 뿐 심볼은 있다(멈추지 않음). `deps.shared` 있음. resolveExpenseActionRow · loadTaxRates · ownersWithEvidence · payment.method-evidence-mismatch 있음. 행마다 다시 읽는 사전 읽기: 없음(PaymentShared에 다 있음) |
| 06-06 · 06-10 · 06-11 | confirmEvidence · prepaidDueInfo 있음. C4 훅 두 경로(completeEvidenceUpload · voidEvidence) 06-11 SUMMARY에 있음 |
| 06-27 | expense_payments_live_uniq · closed_at · expenses.payments 있음 |
| 06-29(C11) | 06-29 SUMMARY · ListScreen 버튼 갈래 · TableSelection · reconcileSelection 있음 |
| 알려진 넘김 | judgeLockedPayment 필수 인자 evidenceGate — completeExpensePayment가 넘기므로 batch.ts는 그 함수만 부른다 |

## M-9 대조(05 UI-SPEC ↔ 06-UI-SPEC UA-605 · UA-606)
| UA | 06-UI-SPEC 기대 | 05 실물 | 판정 |
|---|---|---|---|
| UA-605 | 목록 `/expenses`(상태 필터 · 그룹 · 합계 줄), 문서 화면 `/expenses/[id]` | `(list)/page.tsx` · `?status=` select(`진행 중`·`승인`·`전체`, list-columns.ts:14) · groupExpenses · `.totals` · `[id]/page.tsx`(05-UI-SPEC:74) | 같음 — S1은 select에 `지급 대상` 값을 더하고 `?status=`(V-1) |
| UA-606 | 첨부 영역 + 증빙 금액 칸 · 제출 뒤 편집 규칙 | `[id]/evidence-attachments.tsx` · `expenses.evidence_attach`(menus.ts:37) | 같음 — 이 플랜은 첨부 영역을 건드리지 않는다 |

## E-34 줄 번호
- `domain/payments/batch.ts:52` `loadPaymentShared(` → 행 루프 `:56`(루프보다 위). batch.ts에 `withTransaction` 0건.
- `domain/payments/targets.ts:143`(listAllPaymentTargets) · `:205`(listPaymentTargets — deps.shared가 없을 때만).

## 검증 (명령 · 통과 · 실패)
- 통합(격리 DB erp_e0615_test): `vitest --project integration` payment-batch · expense-payments · expense-payments-concurrency · leak-scan · evidence-void · evidence-upload — 6파일 3805건 통과(도메인 마지막 변경 뒤).
- 단위: screen-frames · tokens · status-map · error-copy-noun-style · design-system-docs · leak-scan-coverage · action-registry-completeness — 7파일 443건 통과.
- `pnpm lint` 0 · `pnpm typecheck` 0(마지막 커밋 직전, 잠금 안).
- E2E `CI=true`(프로덕션 빌드): desktop 묶음 payment-batch(9) · expense-list · expense-a11y · page-chrome · payment-single · design-principles — 83 통과 · 19 건너뜀(그 스펙들의 기존 skip) · 0 실패. mobile 묶음(`E2E_SKIP_DESKTOP=1`) mobile-list-empty · mobile-320-no-overflow · mobile-expense-320 · mobile-page-chrome — 51 통과 · 0 실패.
- 정적: `mark-legacy --audit "app/(app)/expenses"` 0줄 · 옛 토큰 grep 0 · `git diff c5ed80f -- docs/design/tokens.css package.json pnpm-lock.yaml ui/ test/integration/leak-scan.test.ts` 빈 출력 · `(list)/loading.tsx` 변경 없음 · `view=pay` 0 · `status=지급 완료` page.tsx 1 · PAYMENT_TARGET_SKELETON_COLUMNS 3 · `grep -c prepaid repositories/payment-targets.ts` 1.
- 실행 중 잡은 실패(systematic-debugging):
  1. 빌드 52오류 — 클라이언트 모달이 `domain/expenses/draft-fields`(→ currency → settings → db/client)를 import. DATE_FORMAT_ERROR를 서버 page에서 prop으로 넘김.
  2. design-principles 시스템 관리자 networkidle 무한 대기 — 계측으로 `/expenses?status=지급 완료` 프리페치(metadata-only) 응답이 브라우저에서 끝나지 않음을 확인, 다른 경로 링크로 바꾸면 570ms에 idle(가설 확인). 빈 화면 두 행동을 router.push 버튼으로.
  3. mobile-320 `/expenses` 필터 폼 379px — 긴 팀 이름 select. `.filterForm { max-width: 100% }`(projects 선례).
  4. payment-single:272 지급 버튼 비활성 — 내 스펙 afterAll이 전역 「증빙 필수」를 다른 워커 실행 중에 되돌림. 스펙이 전역 설정을 바꾸지 않게(증빙 금액 = 공급가로 확인 → P4) 고침.

## 돌연변이 자체 확인(돈 · 잠금 보호)
`payment-batch.test.ts`를 돌연변이마다 실행(실행 뒤 원복 확인):
| 돌연변이 | 결과 |
|---|---|
| M1 batch가 `{ shared }`를 안 넘김(E-34) | 1 실패 — 「일괄 처리 사전 읽기 한 번」 |
| M2 루프 전 권한 판정 삭제 | 1 실패 — 「Forbidden」 |
| M3 selectable이 이유를 무시(`bar.row === "P4"`만) | 1 실패 — 「짝 막힘」 |
| M4 스냅숏 version 대신 DB 현재 version으로 처리(잠금 우회) | 3 실패 — 「막힌 행 재판정」 · 「C4 확인 기록 있음」 · 「C4 확인 기록 없음」 |
「같은 요청 재전송」은 M4에서도 녹색 — 이미 지급 판정(단건 경로 live uniq)이 따로 막기 때문이다.

## 260907 대조
| 항목 | 260907 file:line | ours file:line | 분류 |
|---|---|---|---|
| 일괄 1~200건 | payments.ts:806-810 | app/(app)/expenses/actions.ts:253-264 | 같음 |
| 이미 지급한 건 거부 | payments.ts:873-881 | domain/payments/batch.ts:56-76(단건 PaymentAlreadyDoneError → 막힌 행) | 같음(행 단위) |
| 본 뒤 바뀐 건이 하나라도 있으면 전부 거부 → 그다음 savepoint 부분 성공 | payments.ts:873-881 | domain/payments/batch.ts:56-76(늘 행마다 부분 성공, D-604) | 다름 · 숨은 규칙 |
| 목록 범위: 밀린 건 포함 · 결재 중 건 따로(합계 제외) · 나갈 날 없음 띠 | payments.ts:252 · :260 · :414-418 · :488-500 · :506-519 | repositories/payment-targets.ts:71 · domain/expenses/list.ts:33-41 | 다름(결재 중 칸 없음) · 숨은 규칙 |
| 지급처 묶음 · 소계 · 지급처별 이체 CSV · 계좌 없는 곳 빼기 | payments.ts:358-361 · SalesPayments.tsx:596-621 · :755-790 | payment-targets-table.tsx(예정일 띠 묶음만) | 다름 · 숨은 규칙(06-20 검토) |
| 한 건 날짜 덮어쓰기(정정) | payments.ts:926-935 · expenses.ts:5741 | 없음(06-04 취소 뒤 재지급) | 다름 · 숨은 규칙 |
| 지급일 미래 막음(2026-09-13 사고 뒤) | 06-vs-260907-code.md §5-2 | batch-payment-dialog.tsx:41 · actions.ts:252(미래 허용, Q6) | 다름(사용자 결정 Q6) · 숨은 규칙 |
| 원천징수 확인증(받는 사람)별 합 · 10원 절사 | 06-vs-260907-code.md §5-5 · 06-withholding-vs-260907.md:51 | 06-03 decidePayable(문서 단위) 그대로 | 확인 못함 · 숨은 규칙 |
숨은 규칙 6건(구현 없음 — 표만).

## 화면 감사 대상 (캡처 · GPT 검사 대상 경로)
- `/expenses`(지급 권한자 기본 = S1, 시스템 관리자 포함) — 채운 목록 · 빈 · 필터 0건 · 막힌 행 이유 줄 · 결과 글자
- `/expenses?status=지급 대상&evidence=unreviewed` · `&team={id}`
- S2 모달(`지급 완료 N` → 확인 창) — 결과 줄 · 지급일 칸 오류
- 폭 375 · 320 · 768 · 1280. backstop: 20자+ 거래처 · 긴 팀 이름 select

## 화면 검토 증거

## 사용자 질문 후보
1. 빈 화면 `지급 완료 보기` · `필터 지우기`를 링크 대신 버튼(router.push)으로 했다(같은 경로 Link 프리페치가 안 끝남). ui/ListEmpty에 `prefetch={false}` 선택지를 더해 링크로 되돌릴지(ui/ 변경 — 별도 플랜).
2. `지급 완료 보기`가 가는 `?status=지급 완료`는 06-20 전까지 S1을 다시 보인다(모르는 값 = 지급 대상). 06-20까지 그대로 둘지.
3. 지급일 미래 허용(Q6) — 260907은 사고 뒤 막았다(§5-2 추천: 지급일은 오늘까지). Q6 유지 여부.
4. 거래처 정렬 · 필터(06-vs-260907-code §5-3 「06-15에 넣는다」 추천) — 이 플랜에 없어 넣지 않았다.
5. 확인증이 매인 지출결의의 지급 총액 = 확인증별 원천 합인지(§5-5 「06-15 착수 전 확인」) — 확인하지 못했다. 06-03 문서 단위 계산 그대로.
6. 10번째 열 `차이 사유`는 `—` 고정(이체액 편집이 06-17). 열을 06-17까지 숨길지.

## 플랜 밖 변경
- 없음(files_modified 14개 + 점검표만). 테스트 준비: E2E는 confirmEvidence(증빙 금액 = 공급가)로 P4를 만들고, 통합은 `db.update`로 증빙 금액을 채운다(테스트 데이터만).

## 넘김
- 06-17: 이체액 편집 · 서버 합계 · 차이 있음/다른 쪽 결과 줄(H-5) · 모달 닫힘 뒤 포커스 · 쪽 넘는 선택 · M-1 쪽 다시 받기 · DR-8 표 안 Ctrl+Enter.
- 06-20: 계좌 열 · `지급 완료` 보기(S3 — StatusFilter `selects`로 팀 · 월) · 거래처별 합.
- ui(별도): ListEmpty 링크 프리페치 끄기 선택지. S1 쪽이 2쪽 이상이면 Pagination(같은 경로 링크)도 같은 프리페치 미종료를 낼 수 있다(05 목록 Pagination도 같은 모양 — 확인 못함).

## Known Stubs
- `app/(app)/expenses/payment-targets-table.tsx` 차이 사유 열 — 늘 `—`(06-17이 이체액 편집과 함께 채운다). 이체액 열은 지급 총액 그대로(편집 06-17).

## Deviations from Plan
1. [Rule 2 - 보안] 목록 행 보임(canSeeExpense) — 계획엔 권한 판정만 있었다. 지급 처리 경로와 같은 범위로 맞춤(ba68538).
2. [Rule 3 - 막힘] 팀 select를 05 domain listTeams 대신 repositories listTeams로(권한 차이)(ba68538).
3. [Rule 1 - 버그] 클라이언트 번들에 서버 모듈 — DATE_FORMAT_ERROR를 prop으로(a9b29f0).
4. [Rule 1 - 버그] 빈 화면 같은 경로 링크 프리페치 미종료 → 버튼(a9b29f0). UI-SPEC의 「링크」와 다르다(질문 후보 1).
5. [Rule 1 - 버그] 320 필터 폼 넘침 → `max-width: 100%`(a9b29f0).
6. TDD: Task 2 · Task 3 테스트는 구현과 같은 커밋에 들어갔다(Task 1만 RED 커밋 분리). 대신 돌연변이 네 개로 돈 · 잠금 테스트가 실제로 막는지 확인했다.

## 독립 검토
risk: money — Opus 독립 검토 · `/cso` · 독립 DOM 감사(375 · 320 · 768 · 1280)는 오케스트레이터 몫.

## Self-Check: PASSED
- 파일: repositories/payment-targets.ts · domain/payments/targets.ts · domain/payments/batch.ts · payment-targets-table.tsx · batch-payment-dialog.tsx · payment-batch.test.ts · payment-batch.spec.ts · 점검표 — 모두 있음.
- 커밋: be0c4d9 · ba68538 · a9b29f0 — `git log` 확인.
