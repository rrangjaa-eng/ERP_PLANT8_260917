---
phase: 06-payment-evidence-cards
plan: 20
subsystem: 지급 완료 보기(S3) · 계좌 투영(O-17) · 문서 화면 왕복(C-1 문서 화면 쪽) · Phase 5 목록 상태 열(UA-605)
status: complete
tags: [EXP-09, O-17, E-50, M-7, M-3, C-1, DR-4, O-21, UA-605, V-1, T-06-99, T-06-175, risk-permissions]
requires: ["06-03", "06-04", "06-06", "06-15", "06-17"]
requirements-completed: [EXP-09]
provides:
  - "domain/payments/targets.ts — paidViewAllowed(지급 권한자 ∪ 행 범위 all) · listPaidPayments(보이는 행만 · 주 그룹 · 서버 합계 · 쪽) · listPaidTeamOptions · parsePayReturn(허용 키만, backHref 새로 만듦) · nextUnreviewedTarget(같은 조회 · 판정 · 정렬의 다음 P2)"
  - "domain/payments/index.ts — projectPaymentAccounts(지급 권한자만 계좌이체 행에 account 키) · PaymentAccount 타입 · PaymentViewDto.account · PaymentViewDto.payReturn(import type)"
  - "domain/expenses/dto.ts — paidPaymentRow DTO 등록 · PaymentTargetRowDto.account · ExpenseListRowDto.statusNote"
  - "domain/expenses/list.ts — listExpenses 상태 칸 `지급 완료 {MM-DD}` · `증빙 {N}일 경과`"
  - "repositories/payment-targets.ts — listPaidPaymentRows · listPaidMonthRows · findVendorAccountsByIds · findListPaymentStatusByIds"
  - "app/(app)/expenses/paid-list.tsx — PaidList(제자리 증빙 확인 포함) · PaidLoadError"
  - "app/(app)/expenses/payment-targets-table.tsx — PaymentAccountValue(S1 칸 · S5 행 공용) · usePhoneWidth export"
affects: ["06-23", "06.5"]
tech-stack:
  added: []
  patterns:
    - "권한자 전용 칸은 원천 객체에 키를 만들지 않는 것으로 막는다 — projectMany는 원천에 없는 키를 만들지 않는다(O-17 누수 근거)"
    - "되돌림 링크는 받은 쿼리를 허용 키만 검사해 늘 새로 만든다(열린 리디렉션 없음)"
    - "목록 상태 칸 보조 재료는 쪽 행 id 묶음 한 번 + ownersWithEvidence 한 번 + 설정 한 번(N+1 없음)"
key-files:
  created:
    - app/(app)/expenses/paid-list.tsx
    - docs/design/checks/2026-10-13-06-20-paid-list.md
  modified:
    - repositories/payment-targets.ts
    - domain/payments/targets.ts
    - domain/payments/index.ts
    - domain/expenses/dto.ts
    - domain/expenses/list.ts
    - app/(app)/expenses/(list)/page.tsx
    - app/(app)/expenses/list-columns.ts
    - app/(app)/expenses/payment-targets-table.tsx
    - app/(app)/expenses/expenses-table.tsx
    - app/(app)/expenses/expenses.module.css
    - app/(app)/expenses/[id]/page.tsx
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - app/(app)/expenses/[id]/payment-section.tsx
    - test/integration/payment-batch.test.ts
    - test/e2e/payment-batch.spec.ts
    - test/unit/row-scope-disposition.test.ts
decisions:
  - "S3 쪽 나눔 · 합계는 SQL이 아니라 도메인이 보임 필터(keepVisible) 뒤에 셈한다(S1 E-25와 같은 자리) — 보이지 않는 행이 합계 · 쪽에 섞이지 않게"
  - "플랜의 「전사 보는 범위(company)」는 06.2 이후 visibleExpenseScope(viewer).rowScope.rows === \"all\"로 읽는다"
  - "listPaymentTeamOptions는 지급 권한자를 단언하므로(대표는 막힘) S3용 listPaidTeamOptions를 따로 두었다(paidViewAllowed로 막음)"
  - "계좌 칸 묶음 읽기는 03 리포지토리에 마땅한 id 묶음 함수가 없어 repositories/payment-targets.ts findVendorAccountsByIds(은행 · 예금주 · 뒤 4자리만, 평문 암호문 안 읽음)로 대신"
  - "S5 계좌 행은 payment-section.tsx PaymentFields에서 그린다(재분할 방아쇠 ① — 16번째 파일, 사용자 카드 승인 10/14 01:48 KST). S1 칸과 같은 PaymentAccountValue를 쓴다"
  - "S3 로드 오류 E2E를 위해 달 필터를 지급일 범위 비교(달 첫날 ≤ 지급일 < 다음 달 첫날)로 바꿨다 — 없는 해 0000-01이 서버 쿼리를 실패시킨다(구매 요청 목록 9999-12 선례와 같은 방법, 새 오류 주입 장치 없음)"
metrics:
  duration: "약 2시간 10분(15:14 → 17:25 UTC, 잠금 대기 포함 · 압축 전 ⓪ 조사 제외)"
  completed: "2026-10-13"
commits: 6
plan_head_before: a5737022344c9262d9dd7c75017f36898848df72
actuals:
  tokens: 33700
  tasks: 4
  commits: 6
---

# Phase 06 Plan 20: 지급 완료 보기 · 계좌 투영 · 문서 화면 왕복 · Phase 5 상태 열 Summary

지급 권한자와 대표(행 범위 전사)가 `/expenses?status=지급 완료`에서 이번 달 지급 기록을 주 그룹(예정 지급 · 이번 주 · 지난주 · 날짜 범위) · 서버 합계로 읽는다. 계좌 글자는 이 목록에 없다. 계좌(은행 · 마스킹 번호 · 예금주 · `번호 보기`)는 `projectPaymentAccounts` 한 함수가 지급 권한자에게만 S1 지급 방식 칸과 S5 계좌 행에 싣는다. `번호 보기`는 노출표 `vendor.account_number_unmasked` 판정 하나를 따른다. S1 번호 링크(`from=pay`)로 연 문서 화면에는 3차 `지급 대상으로`와, 확인됨이 되면 `다음 확인 전 {번호}`가 선다. 되돌림 링크는 허용 키만으로 새로 만든다. S3에서도 지급 뒤 들어온 증빙을 목록을 떠나지 않고 확인한다(06-17 모달 재사용). 05 목록 상태 칸은 열을 늘리지 않고 `지급 완료 {MM-DD}`와 기한 지난 선결제의 둘째 줄 `증빙 {N}일 경과`를 보인다.

06-20 시작 커밋 a5737022344c9262d9dd7c75017f36898848df72 · 커밋 6개(1be59d6..3083e62, 이 SUMMARY 커밋 제외).

## 한 일
| Task | 커밋 | 내용 |
|---|---|---|
| 1 RED | 1be59d6 | 통합 「지급 완료 목록 — 보임 · 취소 제외 · 합계」 「지급 완료 주 그룹」 「paidViewAllowed」, E2E 「대표 지급 완료 보기 — 계좌 문자열 없음」 |
| 1 GREEN (트레이서) | 249578b | S3 한 경로 — 리포지토리 두 함수 · paidViewAllowed · listPaidPayments · paidPaymentRow DTO · `?status=지급 완료` 보기 · paid-list.tsx · 점검표 |
| 2 | 2a19476 | projectPaymentAccounts · 두 DTO 스펙 account(vendor.value) · S1 칸 PaymentAccountValue(AccountNumberCell) · S5 계좌 행 · 통합 셋 · E2E 둘 |
| 3 | f094b18 | parsePayReturn · nextUnreviewedTarget · [id]/page.tsx payReturn · 행동 줄 3차 둘 · 통합 둘 · E2E 넷(M-3 RED/GREEN 포함) |
| 4 | 9a92a30 | S3 오류 · 빈 · 제자리 증빙 확인 · 달 범위 필터 · Phase 5 상태 열(statusNote) · 통합 하나 · E2E 다섯 |
| 마감 | 3083e62 | 전체 단위 스위트가 잡은 행 범위 처분표(ⓓ) 새 진입점 둘을 이유와 함께 표에 |

트레이서 관문: Task 1 GREEN 뒤 verify(통합 payment-batch 3 · leak-scan 4112 · 단위 4 · lint · typecheck · build · E2E 9)를 다시 돌려 통과한 뒤 확장했다.

## ⓪ 선행 확인 결과
- C15: 05-13-SUMMARY 있음 · 05 실물(목록 · 문서 화면) 모두 있음. `[id]/page.tsx` 문서 화면 갈래 `(view || expense.number || !canWrite) && !resubmitting`, 지급 보기는 `view?.status === "approved"`일 때만(drift 4 그대로).
- E-50: `vendor.account_number_unmasked` staffDefault false · roles.ts에 「경영관리」 0 — 시드에 경영관리 계급 없음.
- `AccountNumberCell` 경로: `app/(app)/admin/vendors/account-number.tsx`(props `vendorId` · `masked` · `canReveal`, canReveal 거짓이면 `번호 보기` 없음, masked 없으면 `—`). `maskTail4` 있음. domain/vendors/index.ts 해제 항목 2곳.
- 03 거래처 id 묶음 계좌 함수: 없음(`findVendorNamesByIds` · `findVendorKindsByIds`뿐) → `repositories/payment-targets.ts findVendorAccountsByIds`(조인 대신 거래처 표 한 번).
- 06-17 링크 키: `from=pay` + `status` · `team` · `evidence` · `page`(payment-targets-table.tsx docHref). 보관 키 = `pay|status|team|evidence`(payment-selection.ts selectionKey) — 되돌림 링크가 `status=지급 대상`을 늘 넣어 되살리기가 맞는다(E2E 왕복으로 확인).
- EvidenceConfirmDialog 성공 prop = `onConfirmed(result: ConfirmEvidenceResult)` · props `open` · `expenseId` · `rowVersion` · `onClose`.
- M-3: payment-action-row.tsx에 `if (event.repeat) return;`와 확인 뒤 `payment-transfer` 포커스가 이미 있었다(06-06/06-17). 게다가 lib/shortcut.ts `isCtrlCombo`도 repeat를 버린다 — 아래 RED 참고.

### M-9 대조(05 UI-SPEC ↔ 06-UI-SPEC UA-605 · UA-606)
| 줄 | 06-UI-SPEC 기대 | 05 실물 | 판정 |
|---|---|---|---|
| 라우트 | 목록 `/expenses`, 문서 `/expenses/[id]` | `app/(app)/expenses/(list)/page.tsx`((list) 라우트 그룹) · `[id]/page.tsx` | 같음 |
| 상태 select 값 | `진행 중` · `승인` · `전체`(+ 06이 얹는 보기) | EXPENSE_STATUS_VIEWS 그대로 | 같음 |
| 목록 상태 열 꼴 | 상태 글자(StatusTag text) + `MM-DD` | `.statusCell` StatusTag `variant="text"` + Num 날짜 | 같음 — 06-20은 낱말 `지급 완료`와 둘째 줄만 더함 |
| 문서 화면 섹션 순서 | 증빙 → 지급 → 행동 줄 | 같은 순서 | 같음 |
| 행동 줄 1차 | 「상태 → 1차」 표 하나 | PaymentActionRow 1차 하나 | 같음 |

### 재분할 방아쇠 ①~④
| 방아쇠 | 판정 |
|---|---|
| ① S5 지급 방식 읽기 줄이 payment-section.tsx에 있음 | **참** — 멈추고 보고 → 사용자 카드 승인(10/14 01:48 KST)으로 payment-section.tsx를 16번째 파일로(최소 변경: 「지급 방식」 다음 줄 계좌 행 하나) |
| ② ExpenseDocument가 지급 보기를 칸별로 풂 | 아님 — `paymentView`를 통째로 `PaymentPanelProvider`에 넘기고 타입은 domain/payments/index.ts `PaymentViewDto` |
| ③ StatusFilter `selects` 없음 | 아님 — 있음 |
| ④ 이체액 입력 `name` · `id` 없음 | 아님 — `id="payment-transfer"` |

### 이름 대응(drift)
| 플랜이 쓴 이름 | 실제 이름 | 판정 |
|---|---|---|
| `export async function loadPrepaidDueDays` | `export function loadPrepaidDueDays(): Promise<number>` | 같은 뜻 — 그대로 씀 |
| expense_evidence_reviews 스키마 파일 | `db/schema/expense-payments.ts`의 `expenseEvidenceReviews` | 읽기만 |
| status-map 낱말 셋 grep 개수 | 2(`확인됨`은 따옴표 없는 키) — 낱말 셋 모두 있음 | 같음 |
| 「전사 보는 범위(company)」 | `visibleExpenseScope(viewer).rowScope.rows === "all"`(06.2) | 그 판정으로 |
| `listPaymentTeamOptions`(S3 팀 select) | 지급 권한자 단언 → 대표 실패 | `listPaidTeamOptions` 추가 |
| 03 거래처 id 묶음 계좌 함수 | 없음 | `findVendorAccountsByIds`(repositories/payment-targets.ts) |
| `onConfirmed` | 같음 | — |

## canReveal 계산 줄(E-50 인용)
`domain/payments/index.ts:794` — `const [accounts, canReveal] = await Promise.all([findVendorAccountsByIds(viewer, vendorIds), visible(viewer, "vendor.account_number_unmasked")]);` — 노출표 판정 하나, 지급 권한에서 끌어오지 않는다.

**E-50 인계:** 경영관리 계급을 만들 때 `expenses.payments` write와 노출표 `거래처 계좌번호 마스킹 해제`를 함께 켜야 `번호 보기`가 선다. 계좌 칸 자체(account 키)는 `vendor.value`에 걸리므로 그 계급에 `거래처 정보` 노출도 켜야 한다(새 계급은 노출 행이 없으면 숨김 — 통합 테스트 지급 권한자 픽스처에 vendor.value를 더한 이유).

## RED · GREEN
- Task 1 RED: 통합 3건 `listPaidPayments is not a function` 등으로 실패 → GREEN 3 통과.
- Task 2 RED: 통합 「계좌 투영 — 권한자만」 「계좌 없음 행 고를 수 있음」 「계좌 해제 — 노출표 따름」 3건 `expected undefined …`(account 없음) → GREEN. 중간 원인 조사(systematic-debugging): 새 계급은 노출 행이 없으면 숨김이라 `vendor.value`가 꺼진 지급 권한자에게 account가 투영에서 빠졌다 → 테스트 지급 권한자 픽스처에 vendor.value 노출을 더함(E2E 픽스처는 이미 켬).
- Task 3 「되돌림 쿼리」 · 「다음 확인 전 번호」: 구현을 먼저 쓴 뒤 처음 돌렸다(따로 본 RED 없음). 「다음 확인 전 번호」는 첫 실행에서 준비 단계 오류(extraLines 세 번 → 차수 경합)로 실패해 줄 셋을 한 번에 만들도록 고침 → GREEN.
- **M-3 문서 화면(E2E 「문서 화면 확인 직후 Ctrl+Enter 반복 무시」)** — 순서: 첫 `keyboard.down('Enter')` → 1차 `지급 완료` · aria-disabled 아님 · 이체액 칸 포커스를 기다림 → 그 **뒤**에 둘째 `keyboard.down('Enter')`.
  - RED ⑴: `event.repeat` 가드만 잠시 빼면 여전히 통과 — 원인: `isCtrlCombo`(lib/shortcut.ts)가 repeat를 이미 버린다(가드가 두 겹).
  - RED ⑵: 핸들러에서 두 겹을 함께 잠시 우회 → `expect(livePaymentCount).toBe(0)` 실패(Received 1 — 반복 Enter가 지급했다).
  - GREEN: 원래 코드로 되돌림(백업 파일 복사, RED-TEMP 0줄) → payment-batch · payment-single · expense-form 65 통과.
- Task 4: 통합 「Phase 5 상태 열」 첫 실행이 준비 단계(선결제 사유 없는 prepaid → 체크 제약) 오류로 실패 → 사유를 넣어 GREEN. E2E 다섯은 첫 실행 통과.

## 검증 (명령 · 결과)
- 통합(erp_test_0620): payment-batch 40+1 통과 · payment-batch + expense-payments + vendors + leak-scan 4230 통과(Task 2) · payment-batch + leak-scan 4168 통과(Task 4) · expense-visibility 통과.
- E2E(CI=true · erp_0620_test): Task 1 payment-batch + expense-list 9 통과 · Task 2 payment-batch + payment-single + vendors 71 통과 · Task 3 payment-batch + payment-single + expense-form 65 통과 · Task 4 payment-batch + expense-list + expense-a11y + mobile-320-no-overflow + mobile-expense-320 + evidence-waive-prepaid 101 통과(2 skipped — 기존 조건부 건너뜀, `--no-deps`: 모바일 프로젝트의 desktop 의존이 전체 desktop 스위트를 끌어와 첫 시도는 내가 시작한 PID만 끊고 의존 없이 다시 돌림).
- 단위: 플랜 게이트 7파일 446 통과 · 전체 단위 303파일 4566 통과(마감 커밋 뒤).
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0 · `node scripts/design/mark-legacy.mjs --audit "app/(app)/expenses"` 출력 0.
- A3: 옛 토큰 grep 빈 출력 · tokens.css · package.json · pnpm-lock.yaml diff 0(시작 커밋 · origin/main 모두) · `ui/` diff 빈 출력 · status-display.ts diff 빈 출력.
- C5: `grep -nE "countActiveByOwner|listAliveByOwners" domain/expenses/list.ts domain/payments/targets.ts` 빈 출력.
- C19: `git diff --name-only a5737022…HEAD`에 위험 경로 0.
- 점검표 `docs/design/checks/2026-10-13-06-20-paid-list.md` `- [ ]` 0.

## Deviations from Plan
| # | 규칙 | 내용 | 커밋 |
|---|---|---|---|
| 1 | 재분할 방아쇠 ① | 재분할 방아쇠 ① — 사용자 카드 승인(10/14 01:48 KST)으로 `app/(app)/expenses/[id]/payment-section.tsx`를 16번째 파일로(PaymentFields 「지급 방식」 다음 줄 계좌 행 하나). Task 3 acceptance의 payment-section.tsx diff 빈 출력 조건은 이 3줄에 한해 풀림. 그래서 Task 2 acceptance `grep -c AccountNumberCell payment-action-row.tsx`는 0이다 — S5 계좌 행은 payment-section.tsx에서 S1과 같은 `PaymentAccountValue`(그 안에서 AccountNumberCell)로 그린다 | 2a19476 |
| 2 | Rule 2 | S3 행 DTO에 `evidenceAmountEntered`를 더함 — 금액 빈 `확인 전`을 모달로 확인하면 EVIDENCE_AMOUNT_REQUIRED라 06-17 S1처럼 문서 화면 링크로 보낸다 | 249578b · 9a92a30 |
| 3 | Rule 3 | `listPaidTeamOptions` 추가(기존 팀 옵션 함수가 지급 권한자 단언 — 대표 S3 실패) | 249578b |
| 4 | Rule 2 | S1 지급 방식 칸에 폰 접힌 줄 `summary`(은행 + 마스킹만) — 폰 행 링크 안에 `번호 보기` 버튼이 중첩되지 않게 | 2a19476 |
| 5 | Rule 2 | `[id]/page.tsx`의 `nextUnreviewedTarget` 실패는 로그 + `다음 확인 전` 없음(문서 화면은 선다) | f094b18 |
| 6 | Rule 3 | `.statusNote` 굵기 `400` → `var(--fw-regular)`(stylelint 허용 목록이 숫자를 막음, 값은 같은 400) | 9a92a30 |
| 7 | Rule 3 | S3 오류 E2E용 오류 주입 장치가 06-15에 없어(플랜 가정과 다름) 달 필터를 지급일 범위 비교로 바꾸고 없는 해 `0000-01`로 실패시킴(구매 요청 목록 선례) | 9a92a30 |
| 8 | Rule 3 | `usePhoneWidth`를 payment-targets-table.tsx에서 export해 S3이 같은 폰 판정을 쓴다 | 9a92a30 |
| 9 | 지시 12 | 전체 단위 스위트가 잡은 행 범위 처분표 ⓓ 두 줄(listPaidPaymentRows · listPaidMonthRows)을 실제 범위 이유와 함께 표에 | 3083e62 |
| 10 | Rule 3 | 통합 테스트 지급 권한자 픽스처(makePayer)에 vendor.value 노출 추가 — 계좌 칸 정보 항목 | 2a19476 |

### 범위 밖 실패(기록만)
- `test/integration/leak-scan.test.ts` 「카드 사용 목록 범위 축 … 직원 결과에는 자기 것만」 — `expense-visibility.test.ts` 다음에 같은 프로세스로 돌면 실패(직원 계급 보는 범위를 바꾼 상태가 남는 파일 간 상태 누수로 보임). 증거: 06-20 시작 커밋(a5737022) 임시 워크트리에서 `expense-visibility + leak-scan`만 돌려도 같은 1건 실패(4447 통과 · 1 실패), 06-20 diff에 카드 코드 없음, leak-scan 단독 · payment-batch와 함께면 통과. 고치지 않았다.
- 첫 Task 4 E2E 시도에서 `--no-deps` 없이 모바일 스펙을 넣자 desktop 전체가 돌아 people · quote-* 등 무관 스펙 실패가 보였다 — 이 플랜 대상이 아니라 끊고 의존 없이 다시 돌림(위 101 통과).

## 06.5 정리 대상
evidence_amount를 새로 읽는 곳(06.5 칼럼 제거 때 함께 바꿀 것):
- `repositories/payment-targets.ts` `listPaidPaymentRows` — select `evidenceAmount: expenses.evidenceAmount`.
- `domain/payments/targets.ts` `projectPaidRows` — `evidenceAmountEntered: row.evidenceAmount !== null`(S3 제자리 확인 모달 / 문서 화면 링크 갈림).
- 테스트 준비: `test/e2e/payment-batch.spec.ts` `unreviewedDoc`(evidenceAmount = 공급가 직접 기록).
pickPaymentAmount 새 사용 없음.

## 검토 반영 (Opus 독립 검토 · 독립 DOM 감사, 2026-10-13)
독립 검토 판정: 통과(막음 · 중간 0, 낮음 R-1 · 참고 R-2~R-4). DOM 감사: 결함 D-1 · D-2(중간) · D-3(낮음), 관찰 O-1~O-8. 지적마다 E2E(CI=true)를 먼저 빨갛게 본 뒤 고쳤다. 테스트는 `test/e2e/payment-batch.spec.ts` 「검토 반영 (06-20 독립 검토 · DOM 감사)」 다섯.

| 지적 | 처리 | RED → GREEN | 커밋 |
|---|---|---|---|
| D-1 S3 768 넘침 107 | 번호 · 거래처에 S1과 같은 `collapseBelow: 1024`(증빙은 1024 미만 3차 문서 화면 링크 자리라 남김, 폰 접힌 줄에는 그대로) | 768 넘침 84 → 1280 · 768 넘침 0, 768 머리글에 번호 · 거래처 없음 | 2e39e87 |
| D-2 `from=pay` 폰 1차 짓눌림 | 3차 묶음이 있으면 폰에서 버튼 줄 줄바꿈 + 묶음 order 1 · 100% 폭 → 1차 아래 자기 줄. PC 그대로. 고정 줄 높이는 FixedBarInset 실측 | 375 1차 글자 4줄 → 375 · 320 한 줄 · 행동 줄 폭 ≥ 절반 · 3차 높이 44 · 1차 아래 | 7129a31 |
| R-1 비지급자 `from=pay` 3차 | `[id]/page.tsx`가 쿼리를 읽은 뒤 S1 보기와 같은 판정 `can(expenses.payments, write)`일 때만 되돌림 · 다음 확인 전을 싣는다 | 기안자 화면 `지급 대상으로` 1 → 결과 줄만 · 3차 0 | c72cfdf |
| D-3 S3 320 넘침 15 | 지급일을 P2(폰 접힌 줄)로 — SYSTEM §7-3 「날짜는 접힌 줄 · P1 = 항목 + 금액 + 상태/행동」. 원인 실측: P1 최소 폭 합 제목 99(5em 바닥) + 지급일 59 + 이체액 159 = 317 > 표 자리 304. 5em 바닥(SYSTEM 이름 붙은 예외)과 숫자 nowrap은 바꾸지 않았다 | 320 넘침 15 → 375 · 320 넘침 0, 이체액 한 줄, 폰 머리글 항목 · 이체액 | 1c5dbe3 |
| O-3 Phase 5 320 넘침 24 → 45 | 원인은 이 플랜이다(실측: 같은 행 상태 칸 `승인 10-14` 89px → `지급 완료 10-14` 110px nowrap, +21). 폰에서 `지급 완료` 칸만 낱말과 날짜 사이 줄바꿈 허용(UI-SPEC S3 「2행 09-19」), 덩어리 안은 nowrap · 넓으면 한 줄 그대로 | 같은 목록 지급 전 24 → 지급 뒤 45 → 지급 뒤 ≤ 지급 전(24) | b026602 |

- **UI-SPEC에서 벗어남(D-3):** S3 「폰 P1 = 항목 · 이체액 · 지급일」 → 폰 P1 = 항목 · 이체액, 접힌 줄 = 번호 · 거래처 · 지급일 · 증빙. 13자리 이체액에서 셋을 다 지키면서 320 넘침 0(SYSTEM §6-0)을 맞출 길이 없었다(제목 5em 바닥 · 칸 여백 `ui/` · 숫자 nowrap이 모두 시스템 규칙). 700 이상은 그대로. `/design-review`에서 확인 받을 것.
- **기록만(범위 밖):** Phase 5 목록 base의 320 넘침 24px(12자리 금액, 이 플랜 전부터) · S1 320 넘침 2px(13자리 지급 총액, 이 플랜 전부터).
- **고치지 않음(참고 · 관찰):** R-2 `listPaidTeamOptions` 활성 팀 전체(06-15 S1 팀 select와 같은 동작, 범위 밖 팀은 행 0건) · R-3 `compareTargetKey` JS 문자열 비교 vs SQL 콜레이션(번호 꼴이 ASCII라 지금 차이 없음) · R-4 `listPaidMonthRows` 기간 제한 없는 읽기(30명 규모에서 문제 없음 — 지급 기록이 수만 건이면 SQL로 내릴 것) · O-1 S1 계좌 2줄로 PC 행이 높아짐 · O-2 S3 「프로젝트 · 항목」 한 줄 말줄임(스펙대로) · O-4 목록에 없는 달을 주소로 열면 월 select가 이번 달 · O-5 S5 계좌 dd 320에서 4줄(넘침 없음) · O-6 S3 오류 상태에 상태 select만 · O-7 빈 상태 문장꼴(UI-SPEC 원문) · O-8 폰 필터 select 40px(05 StatusFilter 몫).
- **검증:** `pnpm lint` 0 · `pnpm typecheck` 0 · 통합(erp_test_0620f) payment-batch + leak-scan 4168 통과 · E2E(CI=true 빌드 · erp_0620f_test, desktop + mobile-375 `--no-deps`) payment-batch + payment-single + expense-list + expense-a11y + evidence-waive-prepaid + mobile-320-no-overflow + mobile-expense-320 124 통과 · 2 skipped(기존 조건부) · 전체 단위 303파일 4566 통과. 점검표 「검토 반영」 절 `- [ ]` 0.
- 금지 경로 · `ui/` · tokens.css · package.json 변경 없음. 쓴 스킬: systematic-debugging · test-driven-development · design-gate · verification-before-completion.

## 쓴 스킬
superpowers:test-driven-development(⓪) · design-gate(⓪, 점검표) · superpowers:systematic-debugging(Task 2 account 누락 · M-3 RED 미재현 원인) · superpowers:verification-before-completion(커밋 · 완료 전).

## 오케스트레이터 몫(아직 안 함)
- **(A4) 독립 DOM 감사** — 실행자가 아닌 별도 에이전트가 `CI=true` 빌드로 S3(제자리 확인 모달 포함) · S1 지급 방식 칸 · S5 계좌 행 · `from=pay` 문서 화면 행동 줄 · Phase 5 상태 열을 375 · 320 · 768 · 1280에서 DOM 실측 감사(backstop 둘: S3 long-text — 긴 거래처 · 200자 사유, S1 예금주 — 20자+ 한글 · 계좌 문자열 부재 단언 포함). S3 · S1 계좌 칸 320 scrollWidth는 이 실행에서 E2E로 단언하지 않았다.
- **`/design-review`(+ `bash scripts/codex-design-review.sh`) → `/qa`** — PR 묶음마다 한 번, SYSTEM.md 일관성 · 「문구 없이 이해되는가, 하지 않아도 될 결정이 남았는가」.
- **`/cso`** — 계좌 노출(O-17 · T-06-99)과 `from=pay` 외부 입력(T-06-175, 열린 리디렉션 · 쿼리 주입).
- **`/review`** — 코드 PR 게이트.
- **Opus 독립 검토(risk: permissions — C17)** — `projectPaymentAccounts`가 지급 권한 없는 사람의 결과 객체에 계좌 키를 싣지 않는지, `paidViewAllowed` · `listPaidPayments`의 범위 판정, `parsePayReturn`의 경로 고정 · 값 검사, `nextUnreviewedTarget`의 권한 판정을 읽고 SUMMARY에 판정 한 줄.

## Known Stubs
없음.

## Threat Flags
없음 — 새 표면(S3 · 계좌 칸 · from=pay)은 플랜 threat_model(T-06-99 · T-06-175)에 있다.

## Self-Check: PASSED
- 파일: app/(app)/expenses/paid-list.tsx · docs/design/checks/2026-10-13-06-20-paid-list.md 있음.
- 커밋: 1be59d6 · 249578b · 2a19476 · f094b18 · 9a92a30 · 3083e62 모두 `git log`에 있음.
- 검토 반영 커밋: 2e39e87 · 7129a31 · c72cfdf · 1c5dbe3 · b026602 모두 `git cat-file -e` 확인. 반영 diff에 금지 경로 · evidence_amount 0.
