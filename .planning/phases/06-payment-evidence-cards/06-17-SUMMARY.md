---
phase: 06-payment-evidence-cards
plan: 17
subsystem: 지급 대상(S1) 일괄 지급 마감 — 이체액 편집 · 서버 합 · 쪽 넘는 선택 · 링크 셀 Enter · 제자리 증빙 확인
status: complete
tags: [EXP-09, D-604, D-605, O-3, O-18, H-2, H-3, H-5, M-1, M-3, DR-4, DR-6, DR-8, C-1, Q-F, R10-F2, R10-R1, risk-money, risk-db-lock]
requires: ["06-06", "06-15", "06-29"]
requirements-completed: [EXP-09]
provides:
  - "domain/payments/targets.ts — sumSelectedTransfers(고른 id · 고친 이체액 → 서버 sumKrw · diffKrw · rowStates) · getEvidenceConfirmView(지급 권한 · 확인 전 P2/P5만 — 파일 행 · 서버 계산 한 줄 · version · 06-06 evidenceStamp · 동시성 이유 · 06-06 loadEvidenceOverrun 값)"
  - "app/(app)/expenses/actions.ts — sumSelectedTransfersAction · getEvidenceConfirmViewAction(등록 expenses.payments write · evidenceFile)"
  - "app/(app)/expenses/evidence-confirm-dialog.tsx — EvidenceConfirmDialog(이름 있는 export, 06-20 S3이 import)"
  - "app/(app)/expenses/payment-selection.ts — 선택 · 편집 순수 함수(편집 자동 선택 · 합계 번호 · 처리 결과 적용 · 되살리기 · 다른 쪽 id 유지 · sessionStorage 보관)"
  - "PaymentTargetRowDto.evidenceAmountEntered(boolean) — 증빙 금액 빈 확인 전 행을 문서 화면으로 보내는 판정용"
affects: ["06-19", "06-20", "06-23"]
tech-stack:
  added: []
  patterns:
    - "금액은 서버 액션 응답만 그린다(O-18) — 클라이언트는 고른 id · 사람이 적은 글자만 다루고 합계 번호로 늦은 응답을 버린다"
    - "선택 · 편집 보관 = sessionStorage(보기+팀+증빙 키, 행 id · 사람이 적은 값 · 쪽만) → 다시 마운트 때 합 응답 rowStates가 고를 수 있다는 행만 되살림"
    - "ui/ 무변경 격자 확장 — 표를 감싼 요소의 onKeyDownCapture가 격자 칸 Enter를 [data-cell-action]으로 넘긴다"
    - "모달 확인 성공 응답(version · 상태)을 다시 받은 목록이 따라올 때까지 그 행에 덮는다(version 비교)"
key-files:
  created:
    - app/(app)/expenses/payment-selection.ts
    - app/(app)/expenses/evidence-confirm-dialog.tsx
    - test/unit/app/payment-selection.test.ts
    - docs/design/checks/2026-10-13-06-17-payment-batch-finish.md
  modified:
    - domain/payments/targets.ts
    - domain/expenses/dto.ts
    - app/(app)/expenses/payment-targets-table.tsx
    - app/(app)/expenses/batch-payment-dialog.tsx
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/expenses/expenses.module.css
    - test/integration/payment-batch.test.ts
    - test/e2e/payment-batch.spec.ts
decisions:
  - "차이 사유 필수 판정은 클라이언트 동등 비교(고친 이체액 ≠ 지급 총액, S5 선례)이고, 보이는 차이 값은 서버 diffKrw다 — 금액 셈은 아님(O-18)"
  - "합 요청에 지급일을 싣는다(합계 열쇠에 포함) — PayableChangedError 뒤 재시도가 그 지급일 지급 총액으로 셈해 같은 이유로 다시 막히지 않게"
  - "M-3(누른 채 반복된 Ctrl+Enter 무시)는 lib/shortcut isCtrlCombo(event.repeat → 거짓)가 이미 표 · 체크박스 · ConfirmDialog 모든 Ctrl+Enter 경로에서 한다 — 화면에 따로 가드를 두지 않고 E2E로 고정(아래 RED ⒞)"
  - "증빙 확인 모달은 연 동안만 그린다 — 닫힌 dialog(접근 이름 「증빙 확인」)가 라벨 찾기에 섞이지 않게. 닫힌 뒤 포커스는 evidenceTarget이 null이 되는 커밋 뒤 effect에서 옮긴다(06-29 ConfirmDialog의 returnFocus 다음)"
metrics:
  duration: "약 2시간 30분(11:00 무렵 → 13:30 UTC, 잠금 대기 포함)"
  completed: "2026-10-13"
commits: 5
plan_head_before: cccfb3714b00aaf236306629fa53fd23b7225005
actuals:
  tokens: 45000
  tasks: 4
  commits: 5
---

# Phase 06 Plan 17: 일괄 지급 마감 Summary

「지급 대상」 표에서 실제 이체액(수수료 등)을 행마다 고치고 차이 사유를 적은 뒤 서버가 셈한 고른 건 합을 은행 합계와 맞춰 일괄 지급하게 했다. 합 · 차이는 모두 서버 액션 값이다(O-18). 선택 · 편집은 쪽을 넘고 문서 화면을 다녀와도 남는다(sessionStorage → 서버 rowStates로 되살림). 처리 뒤 빈 쪽에는 머물지 않는다. 번호 · 「프로젝트 · 항목」 링크 칸은 격자 Enter로 연다. `확인 전` 행은 목록을 떠나지 않고 06-29 ConfirmDialog 모달에서 06-06 confirmEvidenceAction(보기 version + 증빙 지문)으로 확인하고, 성공하면 그 행이 저절로 골라진다. 증빙 금액 초과 한 줄(Q-F)은 06-06 loadEvidenceOverrun 값을 표시만 한다.

06-17 시작 커밋 cccfb3714b00aaf236306629fa53fd23b7225005 · 커밋 5개(cf30a10..304c8b0, 이 SUMMARY 커밋 제외).

## 한 일
| Task | 커밋 | 내용 |
|---|---|---|
| 1 RED | cf30a10 | 단위(편집 자동 선택 · 합계 번호 · 합 요청 행) · 통합(sumSelectedTransfers · rowStates · 사유 필수 zod · 지급 기록 값) · E2E(이체액 고침 → 자동 선택 → 사유 → 처리 → S5) 실패 테스트 |
| 1 GREEN | 49de927 | sumSelectedTransfers(+ 액션 · 등록) · 처리 zod 사유 필수 · payment-selection.ts · 표 이체액/사유 편집 칸 · 셀 2행 차이 · 합계 줄 · S2 부제 합계 · 점검표 |
| 2 | 51abc99 | 지급일 재계산 막힘(newPayableKrw 셀 · 지급일로 합) · 모달 지급일 기억(O-3) · 결과 줄 ③(H-5 개수) · 처리 결과 적용(H-3) · 일괄 결과 포커스(DR-6) |
| 3 | d3a2637 | 쪽 넘는 선택(보관 · 되살리기 · reconcileAcrossPages) · 처리 뒤 쪽(M-1) · 번호/「프로젝트 · 항목」 링크 `from=pay` · 링크 칸 Enter(H-2) · 표 안 Ctrl+Enter 회귀(DR-8) |
| 4 | 304c8b0 | getEvidenceConfirmView(+ 액션 · 등록) · EvidenceConfirmDialog · 표 3차 `증빙 확인`(제자리 모달 / 금액 빈 행 · 700~1023 문서 화면 링크) · 성공 응답으로 행 덮기 · 자동 선택 · 짝 막힘 · 포커스 · 점검표 Task 4 절 |

## 선행 확인(Task 1 ⓪)
- 06-29: ConfirmDialog `attachments` · `loading` · `refreshKeepsOpen` · `resultLines` · `primary.{disabledReason,nextStep,pending,shortcut}`, ui/table `TableSelection`(Space 고르기 · Ctrl+Enter = `onPrimary`) — 있음.
- 06-06: `confirmEvidence` · `confirmEvidenceAction`(응답 `{ version, evidenceStatus, actionRow }`) · `evidenceStampOf` · 입력 `evidenceStamp` · `loadEvidenceOverrun(viewer, doc, evidenceAmountKrw)` — 있음.
- 05-UI-SPEC.md 추적됨(C15).

## M-9 대조(05 UI-SPEC ↔ 06-UI-SPEC UA-605 · UA-606)
| UA | 06-UI-SPEC 기대 | 05 실물 | 판정 |
|---|---|---|---|
| UA-605 | 목록 `/expenses`(상태 필터 · 그룹 · 합계 줄), 문서 화면 `/expenses/[id]` | 05 S8 목록(`?status=` select · 그룹 머리글 · 합계 줄) · 문서 화면(「증빙」 섹션) — 06-15가 「지급 대상」 보기를 얹음 | 같음 — S1 50건 쪽(`LIST_PAGE_SIZE`) · 번호 링크 `/expenses/{id}?from=pay&…`가 이 목록 · 문서 화면에 그대로 기댄다 |
| UA-606 | 첨부 영역 + 증빙 금액 칸 · 제출 뒤 편집 규칙 | `ui/attachments` Attachments(`mode="read"`) · 증빙 금액 칸(06이 더함) · 승인 뒤 기안자 붙이기 | 같음 — 모달 첨부 보기 칸은 Attachments read 모드를 그대로 넘긴다(올리기 · 지우기 없음) |

## 금액 셈 없음 확인(Task 1 acceptance)
`grep -nE "reduce|\+=" payment-targets-table.tsx payment-selection.ts` → payment-selection.ts:127 `index += 1` 한 줄뿐(sessionStorage 키 순회 번호 — 금액 아님). payment-targets-table.tsx 0줄.

## RED · GREEN
- Task 1: 단위 · 통합 · E2E 실패를 cf30a10으로 먼저 커밋 → 49de927에서 녹색.
- Task 2: 단위 「처리 결과 적용」 · 통합 세율 경계 막힘 · E2E O-3 · 합 실패 · 일괄 결과 알림을 구현 전 빨강 확인 후 한 커밋(51abc99) — 편차 4.
- Task 3: E2E 「링크 셀 Enter 열기」 · 「다른 쪽 N건 포함 · 처리 뒤 쪽 다시 받기」가 Task 2 코드에서 빨강 → d3a2637에서 녹색. 「표 안 Ctrl+Enter는 화면 1차」는 06-29가 이미 하는 동작의 회귀 고정(처음부터 녹색).
- ⒜ RED: 확인 성공 뒤 행 version 덮기를 잠시 빼자(`{ ...row, ...patch, version: row.version }`) E2E 「제자리 증빙 확인」 일괄 처리 단계가 `지급 완료 1건 · 막힘 1건`으로 빨강 → 되돌려 녹색.
- ⒝ RED: 보기가 evidenceStamp를 싣기 전 통합 「증빙 지문 다름 → 확인 거부」에서 확인이 통과(serverError undefined)해 빨강 → 지문을 실어 녹색.
- ⒞: 플랜이 적은 대로 가드를 빼고 돌렸으나 「확인 직후 Ctrl+Enter 반복 무시」는 녹색이었다. 원인은 lib/shortcut `isCtrlCombo`가 `event.repeat`이면 거짓을 돌려 ui/table(`use-grid-keyboard` · 선택 칸) · ConfirmDialog가 반복 Ctrl+Enter를 이미 무시한다는 것. 표 화면의 가드는 이 경로에 대해 중복이라 지웠고(편차 9), E2E는 회귀 고정으로 남긴다. 테스트 순서: `keyboard.down('Control')` → `keyboard.down('Enter')` → **모달 닫힘 · 포커스 = 이체액 셀을 기다림**(키는 떼지 않음) → `keyboard.down('Enter')` 한 번 더(repeat) → `role=dialog` 0 · 1차 `지급 완료 1` 그대로 → 떼고 새 `Control+Enter` → S2가 열린다.
- ⒟ RED: 보기가 evidenceOverrun을 싣기 전 통합 「증빙 확인 보기 — 증빙 금액 초과 한 줄(Q-F)」이 null로 빨강 → 녹색.

## 검증 (명령 · 결과)
- 단위: payment-selection 10 · 게이트 일곱(screen-frames · design/tokens · ui/status-map · error-copy-noun-style · design-system-docs · leak-scan-coverage · action-registry-completeness) 합 8 파일 460 통과.
- 통합(erp_test_0617, flock): payment-batch · evidence-reviews · evidence-upload · leak-scan 4 파일 4091 통과, expense-payments 33 통과. evidence-invalidation.test.ts는 이 베이스에 없다(편차 7).
- `pnpm lint` 0 · `pnpm typecheck` 0 · `mark-legacy --audit "app/(app)/expenses"` 0 · `flock … pnpm build` 0.
- E2E(CI=true, erp_test_0617_test, desktop): payment-batch 27 통과(단독), payment-batch + payment-single + evidence-lifecycle + expense-list 55 통과 · 18 건너뜀(visual 의존 프로젝트, 로컬 설정상 건너뜀). Task 3에서 mobile-expense-320 7 통과.
- Acceptance: E2E 이름 grep 9 · 통합 이름 2 · `export const …Confirm…Action` 1 · 모달 confirmEvidenceAction 3 / evidenceStamp 2 / evidenceOverrun 1 · targets.ts loadEvidenceOverrun(주석 밖) 2 · Q-F 소유(domain/payments/index.ts에 06-17 커밋 없음) 통과 · evidence-reviews · files.ts · [id]/actions.ts 06-17 커밋 0 · Toast 0 · 옛 토큰 0 · tokens.css · package.json · pnpm-lock diff 0 · `git diff --stat cccfb37 -- ui/` 빈 출력 · onKeyDownCapture 1 · data-cell-action 6 · 점검표 `- [ ]` 0.
- C19: `git diff --name-only cccfb37...HEAD` 13개 — 위험 경로 없음(db/ · domain/auth · domain/permissions · lib/crypto* · scripts · .github · infra · .claude · CLAUDE.md 0).

## Deviations from Plan
1. [환경] E2E DB는 `erp_test_0617_test`(global-setup이 `_test` 접미사만 허용) — 통합은 `erp_test_0617`. 끝에 E2E DB를 지웠다.
2. [Rule 1] 06-15 E2E 「그룹 · 합계」 표 찾기를 `getByRole("table")` → `getByRole("grid")`로 — P4 행에 편집 칸이 서서 ui/table이 grid가 된다.
3. 「다른 쪽 N건 포함」 E2E를 Task 2에서 Task 3로 옮김 — 쪽 넘는 선택이 Task 3 구현이라 Task 2에서는 설 수 없다.
4. Task 2는 RED를 로컬에서 본 뒤 테스트 · 구현을 한 커밋(51abc99)으로.
5. 통합의 쪽 넘김은 51번째 행 대신 `listPaymentTargets(…, { pageSize: 2 })` 주입으로 두 쪽을 만든다(E2E는 51건 실데이터).
6. 합 요청에 지급일을 싣고 합계 열쇠에 넣음(결정 2) — 플랜의 「고른 id + 이체액」 열쇠에 지급일이 더해짐.
7. 플랜 verify의 `test/integration/evidence-invalidation.test.ts`와 `test/e2e/evidence-review.spec.ts`는 이 베이스에 없다 — 통합은 나머지 넷 + expense-payments, E2E는 문서 화면 확인 경로인 `evidence-lifecycle.spec.ts`로 대신 돌렸다.
8. [Rule 3] 12번째 파일 `domain/expenses/dto.ts` — `PaymentTargetRowDto.evidenceAmountEntered`(증빙 금액 빈 확인 전 행을 R10-F2 문서 화면 링크로 보내는 판정, 금액 값 자체는 싣지 않음). 플랜 파일 11개 밖이라 보고한다(13번째 없음, 점검표는 문서).
9. M-3 가드 제거(⒞ 참고) — 플랜 ③은 표 화면이 `event.repeat` Ctrl+Enter를 무시하라 했는데 공용 isCtrlCombo가 이미 한다. 중복 코드를 두지 않았다.
10. [Rule 1] E2E `getByLabel("증빙")` → `{ exact: true }` 넷 — 3차 접근 이름 「{번호} 증빙 확인」과 부분 일치해 strict mode 위반.
11. 「모달 연 뒤 증빙 바뀜」 ⑴의 거부 글자는 정규식 `/에 (증빙을 )?바꿈$/`로 맞춘다 — 기안자 추가가 06-11 훅으로 version을 올려 06-06이 version을 먼저 비교하면 `다른 사람이 HH:MM에 바꿈`이 선다(지문 비교 글자 `{이름}이 … 증빙을 바꿈`은 통합이 본다). ⑵를 ⑴보다 먼저 돌린다(⑴의 router.refresh가 ⑵의 DB 갱신 뒤에 닿는 경합).
12. 증빙 확인 모달은 연 동안만 그린다(결정 4).

## 알려진 한계
- ~~지금 쪽 밖에서 고른 행에 차이가 있는데 사유가 비어 있으면 화면이 미리 잡지 못한다~~ — 검토 M-1로 고침(65db193). 남은 틈: 고친 쪽을 모르거나 그사이 행이 지금 쪽 번호로 옮긴 경우에만 서버 zod가 막는다(지급 0건).
- ~~지금 쪽 밖 행은 견적 줄 수 · 선결제 여부를 모르므로 S2 결과 줄의 그 개수가 적게 셀 수 있다~~ — 검토 D-2로 고침(65db193).
- 짝 막힘 행 확인 뒤 포커스가 행 링크에 있을 때, 누른 채 반복된 Ctrl+Enter가 브라우저 기본 동작(새 탭 열기)을 일으키는지는 확인하지 않았다 — 지운 가드는 preventDefault를 했다. 검토에서 판단 필요.
- 제목 링크는 보이는 글자를 접근 이름으로 쓴다(label-in-name), 번호 링크는 `{번호} 지출결의 열기`.

## Known Stubs
없음.

## 쓴 스킬
superpowers:test-driven-development · superpowers:systematic-debugging(Task 3 링크 셀 · 잠긴 차수, Task 4 포커스 · 라벨 충돌) · superpowers:verification-before-completion(Task 3 · Task 4 커밋 전) · design-gate(점검표 docs/design/checks/2026-10-13-06-17-payment-batch-finish.md).

## 오케스트레이터 몫(아직 안 함)
- (A4) 실행자가 아닌 별도 에이전트의 `CI=true` 빌드 DOM 감사 — S1(편집 · 합 · 쪽 · 좁은 폭) · S2 · 제자리 모달을 375 · 320 · 768 · 1280에서, backstop 넷(20자+ 거래처 · 200자 사유 · 13자리 합 · 파일 6개 · 80자 파일명).
- 수정 → `/design-review`(+ `bash scripts/codex-design-review.sh`) → `/qa` — PR 묶음마다 한 번.
- (A5) 돈 경로(risk: money)라 `/cso`.
- Post-build `/review`.
- Opus 독립 검토 1명(C17) — 합 · 차이가 서버 값인지, 증빙 지문 비교가 `lockExpenseForUpdate` 뒤 같은 `tx`인지, 되살린 선택이 서버 `rowStates`만 따르는지 판정 한 줄. 편차 9(M-3 가드)와 알려진 한계 셋째 줄도 함께 판단.
- STATE.md · ROADMAP.md 갱신.

## 검토 반영
Opus 독립 검토: 통과(막음 0) — M-1·L-1·L-2 반영(65db193). 보고서 /mnt/project-files/notes/06-review/06-17-review.md
독립 DOM 감사: /mnt/project-files/notes/06-review/06-17-dom-audit.md, 증거 /mnt/project-files/06-review/pr-e/06-17/ — 반영 내역: D-2 · D-4 · D-5 · D-6 · D-9 고침(65db193), D-10 앱 변경 없이 E2E 고정, D-1 · D-3 · D-8 후속(ui/ 06-29 소관), D-7 기존.

| 지적 | 처리 | 커밋 · 사유 |
|---|---|---|
| M-1(중간) 다른 쪽 행 사유 누락 → 요청 전체가 `결과를 받지 못함`으로 되풀이 | 고침 — 편집에 고친 쪽을 남기고(`RowEdit.page`, 옛 보관은 보관한 쪽), 1차(와 모달 1차)에서 `firstOffPageIssue`가 지금 쪽 밖 칸 오류를 잡으면 요청 없이 그 쪽으로 옮겨 그 행 사유 칸 오류 · 첫 오류 칸 포커스(플랜 「그 행 칸 오류」) | 65db193 — 단위 「M-1 지금 쪽 밖 칸 오류」 · E2E 「다른 쪽 N건 포함(M-1)」 |
| L-1(낮음) 쪽 밖 id가 selectable 거짓이어도 처리 요청에 실림 | 고침 — `offPageSnapshotRows`가 rowStates selectable 참인 id만 | 65db193 — 단위 「L-1 쪽 밖 스냅숏 행」 |
| L-2(낮음) 재마운트 뒤 합 기준일(오늘) ≠ 모달 지급일(기억) | 고침 — 합 기준일 초기값 = `rememberedPayDate` | 65db193 — E2E 「모달 지급일 기억(O-3)」이 재마운트 합 요청 `payDate` 단언 |
| D-1(중간) 모달 부제 · 80자 파일명 줄바꿈(말줄임 + title 아님) → 첨부 칸 행 1.85개 | 후속 — ConfirmDialog `subtitle`은 문자열 prop(ui/confirm-dialog/ConfirmDialog.tsx:306 `.subtitle`), 파일명은 ui/attachments(Attachments.module.css:94 `.name` · Attachments.tsx:358). 앱이 말줄임 · title을 넘길 길이 없고 부제 글자를 줄이면 플랜 부제 계약(`{번호} · {프로젝트} · {항목} · 증빙 금액`)이 바뀐다 | 담당: ui/ 06-29 컴포넌트. 증거 감사 §3(480 3줄 · 폰 4줄, 파일명 3~6줄, scrollHeight 629 > 194) |
| D-2(중간) S2 ① 견적 줄이 지금 쪽만 셈 | 고침 — rowStates에 `quoteLineId` · `prepaid`(paymentTargetRow 같은 칸, expense.value) · `snapshotCounts`가 모든 쪽 고른 행 | 65db193 — 통합 rowStates 두 곳 · 단위 「D-2」 · E2E `견적 줄 2줄 잠김` |
| D-3(중간) 1024~1279 막힌 행 이유 줄이 숨은 번호 칸 안 | 후속 — ui/table/Table.tsx:1100-1108이 이유 줄을 `colIndex === 0`(번호 열, collapseBelow 1280)에 그린다. 앱 쪽 대안(열 순서 바꾸기)은 S1 열 순서 계약을 깨고, 이유 줄을 다른 칸에 한 번 더 그리면 화면 하나만 예외다 | 담당: ui/table(06-29) — 「보이는 첫 칸」. 증거 감사 §5(1100 E · G 이유 `visible:false`) |
| D-4(중간) 제자리 모달 Esc 뒤 포커스 H1 | 고침 — onClose가 `evidence:{id}`를 남겨 그 행 3차를 다시 찾아 포커스(연 동안 3차가 다시 그려지면 06-29가 기억한 트리거가 문서에서 빠져 H1로 갔다) | 65db193 — E2E 600↔1280 왕복 뒤 Esc → 3차 포커스(빨강 확인) |
| D-5(중간) 처리 뒤 첫 쪽 재마운트 포커스 BODY | 고침 — `takeCarried`가 첫 막힌 행 id · 없으면 `primary`를 넘기고 되살리기 뒤 한 번 옮김 | 65db193 — E2E 1차 toBeFocused(빨강 확인) |
| D-6(낮음) 거래처 · 폰 행 링크 말줄임에 title 없음, PC 제목 3~4줄 | 고침 — 거래처 span · 폰 제목 링크 title. PC 제목 줄바꿈은 SYSTEM §7-3 「항목명은 줄바꿈 허용(keep-all)」 · 폰 한 줄 말줄임(2026-10-09 결정) 그대로 — 플랜 backstop 「항목 한 줄 말줄임」보다 SYSTEM이 정본 | 65db193 — E2E title 두 곳 |
| D-7(낮음) 320 가로 넘침 2px | 기존 — 적용 전(cccfb37)도 2px, ui/table 폰 칸 · 13자리 칸(06-15 · 06-29) | 고치지 않음 |
| D-8(낮음) 막힘 이유 + 다음 한 수일 때 1차 라벨 두 줄 | 후속 — ui/confirm-dialog/ConfirmDialog.module.css:131 `.actions`(버튼 nowrap 없음). 앱은 라벨 글자만 넘긴다 | 담당: ui/confirm-dialog(06-29). 증거 감사 §3 · §4(140 · 164.9px) |
| D-9(낮음) 보기 전용 폭에 `고른 N건` 줄 | 고침 — 합계 줄을 `wide`일 때만 | 65db193 — E2E 800px count 0 |
| D-10(낮음) 키보드 확인 뒤 이체액 셀 링 없음 | 앱 변경 없음 — Chrome 141 실측: 마우스로 연 뒤 Ctrl+Enter(수정 키 조합)는 키보드 양식으로 바꾸지 않아 스크립트 포커스가 `:focus-visible`이 되지 않고(`focus({focusVisible})` 미지원), 키보드만 경로(3차 Enter → Ctrl+Enter)는 참. 강제 링은 ui/table `.cell:focus-visible` 계약 밖 화면 하나만 예외라 두지 않음 | 65db193 — E2E가 키보드만 경로 `:focus-visible` 참 고정 |

검증(65db193): 단위 payment-selection 14 + 게이트 4 파일 = 153 통과 · 통합(erp_test_0617 새로 만듦, flock) payment-batch + leak-scan 4049 통과 · `pnpm lint` 0 · `pnpm typecheck` 0 · E2E(`CI=true`, erp_0617_test, desktop, webServer `pnpm build && pnpm start`) payment-batch + payment-single 45 통과 · `git diff --stat cccfb37 -- ui/` 빈 출력. 빨강 확인: 단위 4 · 통합 2 · E2E 4(M-1 · L-2 · D-6 둘) 뒤, D-4 · D-5는 그 고침만 빼고 돌려 빨강.

## Self-Check: PASSED
- 파일 다섯(payment-selection.ts · evidence-confirm-dialog.tsx · 단위 테스트 · 점검표 · 이 SUMMARY) 있음, 커밋 cf30a10 · 49de927 · 51abc99 · d3a2637 · 304c8b0 있음, erp_test_0617_test 지움(pg_database 0).

## 화면 검토 증거
| 항목 | 경로 |
|---|---|
| 독립 검토(Opus) | /mnt/project-files/notes/06-review/06-17-review.md |
| DOM 감사(Opus, CI=true) | /mnt/project-files/notes/06-review/06-17-dom-audit.md |
| 4폭 캡처 적용 전·후(cccfb37 대비) | /mnt/project-files/06-review/pr-e/06-17/ |
| Codex 디자인 검토(/design-review, `/expenses` 4폭, --base cccfb37) | /mnt/project-files/06-review/pr-e/wave1-codex/06-17-codex.md · 산출물 20261013-143608-25723/ — 지적 0건. 캡처 DB가 비어 지급 표·확인 모달은 Codex 자료에 없음 → 그 부분은 DOM 감사 실측으로 판정 |
