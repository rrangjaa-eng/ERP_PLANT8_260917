---
phase: 05-expense-approval-leave
plan: 09
subsystem: expenses-approval
tags: [expenses, approvals, evidence, permissions, db-lock, undo, resubmit, void, risk-permissions, risk-db-lock]

requires:
  - phase: 05-01
    provides: E4 bumpInstanceVersion · 충돌 문구 증빙 갈래 · resubmitDocument
  - phase: 05-04
    provides: 증빙 업로드 경로 · lockExpenseForUpdate 첫 잠금 · afterLock 주입 지점
  - phase: 05-08
    provides: canSeeExpense · getApprovalView({ readOnlyVisible }) · 목록 SQL(statusChangedAt)
  - phase: 04.1
    provides: approve/reject/withdrawDocument 조건 UPDATE · ConfirmDialog 반려 확인 · REJECT_REASON_* 상수
provides:
  - 제출 토스트 되돌리기(undo 차수) · 반려/회수 폼 · 같은 번호 다시 제출(차수 +1) · 늦은 되돌리기 거부 문구
  - 작성 중 삭제(소프트 삭제 + document_delete) · 되돌리기(복원 + document_update restore) · 본인 승인 차례 토스트
  - 메뉴 키 expenses.evidence_attach(결재 중 증빙 붙이기) · expenses.evidence_void(증빙 무효 처리)
  - domain/evidence getEvidenceActions · voidEvidence · EvidenceLockedError + 상수 셋 · 제출 뒤 증빙 규칙(bumpInstanceVersion 배선)
  - domain/evidence/signals.ts listEvidenceVoidSignals(G1 원천) · repositories/files markVoided · findUnresolvedVoidOwnerIds
  - domain/approvals validateRejectReason · conflict-message buildEvidenceVoidedMessage
  - 목록 승인 날짜 = 지금 차수 단계 마지막 처리 시각(05-08 검토 #6)
  - ui/attachments canAdd · deletableIds · voidable · lockedText · 무효 행
affects: [05-10, 05-11, 05-13, 06-SP-6, 06-S11]

visual_baseline_expected: [dev-components]

actuals:
  tokens: 54000
  tasks: 3
  commits: 9
plan_head_before: 95414b68f0901bed7ad491bf89b26080bf30e3f5

tech-stack:
  added: []
  patterns:
    - "결재는 지출결의 행을 잡지 않는다 — 증빙 추가 tx는 지출결의 행 잠금 뒤 결재 상태 · version을 다시 읽고 version 조건으로 인스턴스를 올린다(0행 → 다시 하기)"
    - "파일 행 3차는 서버 getEvidenceActions가 정하고 ui/attachments는 그 값대로만 그린다"
    - "권한 판정(can)은 풀 읽기라 tx 밖에서만 — tx 안 읽기는 전부 tx 인자"

key-files:
  created: [domain/evidence/signals.ts, test/integration/evidence-void.test.ts, test/integration/expense-approval-concurrency.test.ts, "app/(app)/expenses/[id]/delete-draft-button.tsx", "app/(app)/expenses/[id]/submitted-undo-toast.tsx", "app/(app)/expenses/deleted-toast.tsx", docs/design/checks/2026-10-05-05-09-undo-resubmit.md, docs/design/checks/2026-10-05-05-09-draft-delete.md, docs/design/checks/2026-10-05-05-09-evidence-void.md]
  modified: [domain/expenses/index.ts, domain/evidence/index.ts, domain/evidence/dto.ts, domain/approvals/index.ts, domain/approvals/conflict-message.ts, domain/permissions/menus.ts, repositories/expenses.ts, repositories/files.ts, repositories/approvals.ts, ui/attachments/Attachments.tsx, ui/attachments/Attachments.module.css, ui/status-tag/status-map.ts, "app/(app)/expenses/actions.ts", "app/(app)/expenses/actions.registry.ts", "app/(app)/expenses/[id]/page.tsx", "app/(app)/expenses/[id]/expense-document.tsx", "app/(app)/expenses/[id]/expense-form.tsx", "app/(app)/expenses/[id]/evidence-attachments.tsx", "app/(app)/expenses/(list)/page.tsx", test/integration/evidence-upload.test.ts, test/integration/fixtures/expenses.ts, test/e2e/expense-fixture.ts, test/e2e/expense-undo-resubmit.spec.ts, test/unit/ui/status-map.test.ts]

key-decisions:
  - "결재 중 증빙: 기안자는 붙이지도 떼지도 못하고(잠김 한 줄), expenses.evidence_attach 쓰기 권한자만 붙인다 — 사용자 결정 2026-10-04(플랜의 「결재 중 기안자 추가 · 마지막 아닌 파일 삭제」를 대체)"
  - "승인 뒤 기안자 삭제 거부 문구 `승인 뒤 · 증빙 삭제 잠김` — 사용자 지시(10/5 00:55)에 따라 추천안 적용"
  - "05-08 검토 #6: bump는 updated_at을 그대로 올리고(충돌 문구 시각), 목록 승인 날짜만 지금 차수 단계 max(acted_at)로 — 사용자 지시(10/5 00:55)에 따라 추천안 적용"
  - "권한자 추가 tx는 훅 뒤 상태 · version을 다시 읽고 version 조건 bump(사이에 결재가 커밋하면 다시 하기) — 사용자 지시(10/5 00:55)에 따라 추천안 적용"

requirements-completed: [EXP-02, UX-03, UX-06, EVID-01, OPS-08]

duration: ~1h25m(이어받은 세션 기준, 플랜 첫 커밋 2026-10-04T22:44Z)
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 09: 되돌리기 · 다시 제출 · 작성 중 삭제 · 결재 중 증빙(경영관리만) · 승인 뒤 무효 처리 Summary

**기안자는 제출 토스트 `되돌리기`나 반려 · 회수 뒤 폼에서 고쳐 같은 번호로 다시 제출하고, 작성 중 문서를 지웠다 되살리며, 결재 중 증빙은 `결재 중 증빙 붙이기` 권한자만 붙여(인스턴스 version +1로 옛 승인을 막음) 승인 뒤 잘못 붙은 증빙은 `증빙 무효 처리` 권한자가 사유와 함께 무효로 남긴다.**

## Task Commits
1. Task 1(트레이서) — `c8f485f3` test RED · `9d1893e7` feat(되돌리기 · 반려/회수 폼 · 같은 번호 다시 제출). 트레이서 게이트: verify 재실행 초록 뒤 확장
2. Task 2 — `a9cb94d7` test RED · `46cfaaa1` test(복원 로그) · `f313f1dc` feat(작성 중 삭제 · 되돌리기 · 본인 승인 차례 · 회수 결과 줄)
3. Task 3 — `d68df593` test RED · `d03d831e` feat(도메인 · 권한 · 무효 · 신호 · 승인 날짜) · `635f39ea` feat(문서 화면 증빙) · `0faf7f17` fix(실패 줄 키 이름)

`commits: 9` = `git rev-list --count 95414b68..HEAD`(SUMMARY 커밋 전).

## 사용자 결정에 따른 변경(2026-10-04 · 실행자 지시 — 플랜 문서는 고치지 않음)
1. **새 권한 `expenses.evidence_attach`(「결재 중 증빙 붙이기」)** — `expenses.evidence_void`(「증빙 무효 처리」)와 따로 켜고 끈다. 붙이기 = (기안자 ∧ 작성 중 · 반려 · 회수 · 승인) ∨ (evidence_attach 쓰기 ∧ 문서 보임 ∧ 결재 중). 떼기 = 기안자 ∧ 작성 중 · 반려 · 회수만. 결재 중 기안자 화면은 「하나 더」 자리에 `결재 중 · 증빙은 경영관리`(앱 상수), 서버 거부는 `결재 중 · 증빙 잠김`. 권한자가 붙여도 토스트 없음. 결재 중 · 승인 뒤 추가는 같은 tx에서 bump(reason evidence, updatedBy = 붙인 사람) → 옛 version 승인은 `{붙인 사람}이 HH:MM에 증빙을 바꿈 · 새로 고침`.
2. **반려 · 회수 뒤 기안자는 권한자가 붙인 파일도 뗀다**(통합 「반려 뒤 기안자는 경영관리가 붙인 파일도 뗄 수 있다」).
3. **시드: 두 키 모두 시스템 관리자만**(기존 `seedMasterData` MENUS 루프 — 05-09-PLAN.md:275 F21, `domain/seed` diff 0, 통합 단언 「시드 계급 중 시스템 관리자 하나」). UI-SPEC :473 「시드에서 아무 계급에도 켜지 않는다」와 다르다(시스템 관리자는 루프로 켜짐). `.continue-here.md:59`의 「`expenses.evidence_void` 기본 켜짐 — 사용자 확인 대기」는 이 결정으로 닫힌다 — 경영관리(시드 계급 아님)는 관리자가 권한표에서 켠다.
4. 금액: 남은 실행가 검사 그대로, 고정 상한 없음(코드 변경 없음).
5. 빠진 플랜 사례: 마지막 파일 개수 판정 · 결재 중 삭제↔삭제 두 순서 · 「삭제 뒤 옛 version 승인」 — 결재 중 삭제가 없어져 대상이 없다. 인수 grep `삭제↔삭제` = 0은 이 결정 때문이다. `removeEvidence`는 `countActiveByOwner`를 쓰지 않는다.

## 권한 · 시드 변경
- `MENUS`에 `expenses.evidence_void`(증빙 무효 처리) · `expenses.evidence_attach`(결재 중 증빙 붙이기) 두 줄 + 주석(시스템 관리자만 루프로 켜짐). 시드 코드 변경 0.
- `voidEvidenceAction` 등록(menu `expenses.evidence_void` write, dtoName null). 판정은 도메인(권한 ∧ 문서 보임 ∧ 승인).

## 잠금 · 트랜잭션(경로별 순서)
| 경로 | 잡는 행(순서) |
|---|---|
| 증빙 추가(`completeEvidenceUpload`) | 지출결의 행 FOR UPDATE → (afterLock) → 같은 행 다시 읽기 + 인스턴스 상태 · version 읽기(잠금 없음) → 의도 · 파일 INSERT → 결재 중 · 승인이면 인스턴스 version 조건 UPDATE(0행 → 다시 하기) |
| 증빙 삭제(`removeEvidence`) | 지출결의 행 FOR UPDATE → 파일 UPDATE(인스턴스 안 건드림 — 작성 중 · 반려 · 회수만) |
| 무효 처리(`voidEvidence`) | 파일 행 조건 UPDATE 하나(승인 뒤라 인스턴스 · 지출결의 잠금 없음, bump 없음) |
| 다시 제출(`submitExpense`) | 프로젝트 → 지출결의 → 인스턴스(version 조건 resubmit) — 카운터 없음 |
| 되돌리기 · 문서 화면 회수 | 04.1 `withdrawDocument` — 인스턴스만 |
| 작성 중 삭제 · 복원 | 지출결의 행 version 조건 UPDATE 하나 |
| 04.1 승인 · 반려 | 인스턴스만 |
거꾸로 잡는 쌍 없음(지출결의 → 인스턴스 한 방향). `can()`은 전부 tx 밖, tx 안 읽기는 전부 tx 인자(tx-safety 「풀 2 · 동시 증빙 추가 셋(05-04)」 초록, 파일 diff 0).

## 화면(독립 DOM 감사 대상)
- `/expenses/[id]` 문서 화면 `증빙`: 결재 중 기안자(잠김 한 줄 · 하나 더 0 · 삭제 0) · 결재자(크게 보기만) · 권한자 결재 중(하나 더) · 승인 기안자(하나 더만) · 승인 권한자(`무효 처리` 3차 → 확인 창 `증빙 무효 처리`) · 무효 행(태그 → 취소선 → 2행).
- 무효 확인 창 `primary` 키: `label`(`무효 처리`) · `pending` · `onConfirm` · `disabledReason`(서버 거부 또는 04.1 반려 사유 빈 칸 · 너무 김 문구) · `failure`(`무효 처리 실패 · 다시 시도`). 꼬리 ` · 새로 고침`은 ConfirmDialog가 그린다.
- `voidEvidenceAction` 성공 갈래는 확인 창을 닫고 `router.refresh()`만 부른다(토스트 없음).
- Task 1 · 2: `/expenses/[id]` 착지 토스트 `되돌리기` · 반려/회수 폼(읽기 행 · 1차 `지출결의 다시 제출`) · 작성 중 폼 머리 줄 `지출결의 삭제`(폰 숨김) · `/expenses` 삭제 착지 토스트 `되돌리기` · 회수 확인 결과 줄 · 본인 승인 차례 토스트.
- 점검표 셋: `docs/design/checks/2026-10-05-05-09-{undo-resubmit,draft-delete,evidence-void}.md`.

## Deviations from Plan
1. **[Rule 2] 복원 로그** — `restoreExpenseDraft`를 tx로 감싸 `document_update`(change restore)를 같은 tx에 남긴다(T-05-904, 시험 `46cfaaa1` 먼저).
2. **[Rule 3] `repositories/approvals.ts` readGraph에 `updatedByName` 조인**(계획 files 밖) — 충돌 문구 이름이 기안자 · 단계 처리자만이라 권한자 이름을 만들 수 없었다. `conflictMessageOf`는 단계 처리자 없으면 `updatedByName`.
3. **[Rule 1] 기존 시험 `evidence-upload`** — 결재 중 기안자 요청 기대를 `ExpenseConflictError` → `EvidenceLockedError(결재 중 · 증빙 잠김)`(사용자 결정). 경합 ⓐ는 잠금 뒤 재확인이라 `ExpenseConflictError` 그대로.
4. **[Rule 1] 시험 자체 고침** — 무효 로그 `reasonLength` 7 → 8(「다른 건 영수증」 8자, RED 작성 실수) · E2E 막힘 글자 `first()`(이유 자리와 버튼 설명 두 곳) · E2E 경영관리 계급에 노출표 `expense.value` · `expense.amount`를 켬(새 계급은 노출표가 비어 문서 칸 · 파일 id가 투영되지 않았다 — 제품 동작이 맞음, 05-08 Deviation 7과 같은 원인).
5. **[Rule 3] `listActiveByOwner`가 `voidedByName`을 붙여 돌려준다**(users 왼쪽 조인 — 무효 행 2행 처리자). DTO `evidenceFile`에 `voidedByName`(expense.value).
6. **추천안(사용자 지시 10/5 00:55)** — 승인 뒤 기안자 삭제 문구 `승인 뒤 · 증빙 삭제 잠김` · 검토 #6 방식(목록이 승인 시각을 단계 처리 시각에서 읽음 — bump를 빼면 증빙 바꿈 문구 시각이 사라짐, 반려 · 회수에서는 bump가 없어 updated_at 그대로) · 권한자 추가의 version 조건 bump · REQUIREMENTS.md는 손대지 않음(EVID-01 법인카드 부분은 Phase 6, OPS-08은 05-10 · 05-11도 맡음 — mark-complete 미호출).

**Impact:** 새 의존성 0 · 마이그레이션 0 · 새 토큰 · 색 0 · tx-safety · 시각 기준 사진 diff 0 · status-map · conflict-message diff 덧붙임뿐.

## Verification
- 통합(`pnpm db:reset:test` 뒤): expense-approval-concurrency · evidence-void · evidence-upload · approvals-concurrency · approvals-lifecycle · approvals-extensions · leak-scan · tx-safety · expense-approval-lifecycle · expense-visibility · expense-submit-concurrency 11 files 2923 통과, expense-money 3 통과. 검토 #6 사례는 수정 되돌리면 `Expected "09-18" Received "10-05"`로 실패함을 확인.
- `pnpm test:unit` 전체 252 files · 3873 tests 통과(마지막 코드 커밋 뒤). lint · typecheck · lint:sql · build 0, `mark-legacy --audit ui/attachments` · `"app/(app)/expenses"` 0.
- E2E `CI=true`(프로덕션 빌드): expense-undo-resubmit 7 + expense-list 8 = 15 통과. 실측 가로 넘침 0(390 · 320), 폰 3차 높이 44.

## Known Stubs
없음. `listEvidenceVoidSignals`는 원천만이다 — 「내 차례」 [막힘] 증빙 무효 줄 배선은 플랜대로 다음 플랜(S11).

## Threat Flags
| Flag | File | Description |
|------|------|-------------|
| threat_flag: authz | domain/evidence/index.ts | 새 권한 `expenses.evidence_attach` — 기안자가 아닌 사람의 증빙 추가 경로(결재 중 · 문서 보임 필요, 없으면 없는 문서). 플랜 threat model에 없던 경로 |

## Next Phase Readiness
- 위험 경로(`domain/permissions/menus.ts`) 변경 — 사용자 머지. Opus 독립 검토 1명 + 독립 DOM 감사.
- 시각 기준 사진 `dev-components`(1280 · 390)는 갤러리에 `무효`가 더해져 바뀐다 — 갱신은 05-10 Task 3.
- 경영관리 계급을 실제로 쓰려면 관리자가 권한표에서 `expenses` 보기 · 두 새 키 쓰기 · 노출표 `expense.value`를 켠다.

## 웨이브 11 검토 수정 (2026-10-05)
근거: `notes/05-review/wave11/README.md` D1–D5 · `notes/05-review/05-09-permission-lock-review.md` m1–m4. 실패 시험 먼저: 도메인 `a2ad793d`(통합 3건 RED) · 화면 `2d5dac36`(E2E 4건 RED, D2는 D1에 가려 D2만 되돌려 따로 RED 확인 — 시트 290.6 → 261.8 · y 376 → 405).

| # | 수정 | 커밋 |
|---|---|---|
| m1 | 기안자 아닌 권한자의 승인 · 반려 · 회수 문서 붙이기 = 충돌 문구 대신 `EvidenceLockedError(결재 중 아님 · 증빙은 작성자)`(새 상수 `EVIDENCE_ADD_DRAFTER_ONLY`). 기안자 결재 중은 `결재 중 · 증빙 잠김` 그대로 | `b7e49851` |
| m2 | 완료 통보에서 `canSee` 다시 판정 → 볼 수 없으면 restart(옮긴 객체 보상 삭제) | `b7e49851` |
| m3 | 붙이기 권한을 가진 기안자도 권한자 갈래가 아니다 — 결재 중 자기 문서는 `결재 중 · 증빙 잠김` · 잠김 한 줄(사용자 지시(10/5 00:55)에 따라 추천안 적용) | `b7e49851` |
| m4 | 손대지 않음 — 시각 기준 사진은 05-10 몫 | — |
| D1 | 폰 확인 시트 `.actions kbd { display: none }` | `9b02984b` |
| D2 | 열린 동안 막힘 줄이 한 번 선 시트는 빈 묶음을 남기고 폰은 그 줄 높이(`--text-aux × --lh-body`)를 비워 둠 | `9b02984b` |
| D3 | 고정 행동 줄에 `data-fixed-bar`, 토스트가 줄 윗변까지 실측해(`--toast-lift`) 그 위에 뜸 — 문서 행동 줄(연차 · 지출결의 공용) · 지출결의 폼 제출 줄 | `b48950d8` |
| D4 | 무효 처리 뒤 새로 고침이 끝나면 증빙 영역(tabIndex -1)에 포커스 | `c7e88ecc` |
| D5 | 결재선 단계가 있을 때만 `결재선` 행 | `67138dc8` |
| 덧 | 05-05 트레이서 E2E가 제출 토스트 `되돌리기`(05-09가 더함)를 반영 · 범위 밖 기존 실패 deferred-items 기록 | `9f2954cf` |

이탈:
1. **m2 위치** — 지시는 「완료 tx 안에서 다시 판정」이었으나 `canSeeExpense`는 전역 풀 읽기(can · 팀 범위 · walk)라 잠근 tx 안에서 부르면 풀 소진 교착이다(`domain/document-numbering/index.ts:237` 금지 규칙, 이 파일 `adderOf`와 같은 처리). 그래서 tx 바로 전(저장소 옮기기 뒤 · adder 계산과 같은 자리)에서 판정하고, 상태 · version은 지금처럼 tx 안에서 잠근 뒤 다시 본다. 남는 창은 그 사이 몇 ms.
2. **[Rule 3] Toast 효과 순서** — `toast-timer.test.ts`가 소스의 첫 `useEffect( … }, [deps]);`를 정규식으로 읽어, 새 `useLayoutEffect`를 자동 소멸 효과 뒤에 둔다(동작 같음).
3. **[Rule 1] `expense-submit-mobile-approval.spec.ts:92`** — 05-09가 제출 토스트에 `되돌리기`를 더한 뒤 전체 문장 일치가 깨져 있었다(이번 넓은 실행에서 발견). 결과 문장 칸 + `되돌리기` 버튼으로 나눠 단언.
4. 범위 밖: `mobile-w5-review-fixes.spec.ts:47` 폰 320 `/admin/code-tables` CLS 0.1958 — 기준 화면 파일로 되돌려도 3/3 같은 값. `deferred-items.md`.

검증: lint 0 · typecheck 0 · `pnpm test:unit` 252 files · 3873 통과 · 통합 evidence-upload · evidence-void · expense-approval-concurrency · expense-approval-lifecycle · expense-submit-concurrency · expense-visibility 6 files 91 통과 · E2E `CI=true --no-deps`(desktop + mobile-375) 13 specs 108개 중 106 통과 → 위 3으로 고친 뒤 expense-submit-mobile-approval 12 통과, 남은 1건은 위 4(기존). 점검표 `docs/design/checks/2026-10-05-05-09-wave11-review-fixes.md`.

## Self-Check: PASSED
- 파일: domain/evidence/signals.ts · test/integration/evidence-void.test.ts · test/integration/expense-approval-concurrency.test.ts · docs/design/checks/2026-10-05-05-09-evidence-void.md 존재
- 커밋: c8f485f3 · 9d1893e7 · a9cb94d7 · 46cfaaa1 · f313f1dc · d68df593 · d03d831e · 635f39ea · 0faf7f17 존재
