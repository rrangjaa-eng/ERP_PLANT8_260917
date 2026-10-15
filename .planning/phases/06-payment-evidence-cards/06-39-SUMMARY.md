---
phase: 06-payment-evidence-cards
plan: 39
subsystem: payment-action-row
tags: [keyboard, ctrl-enter, dialog-guard, evidence-signals, e2e, design-gate]
gap_closure: true
gap_ids: [G-06-H, G-06-I, G-06-J]
status: complete
plan_head_before: 844968e3767d06509fa0223d971749be31b8ac6f
commits: 3

requires:
  - phase: 06.5-payment-followup
    provides: 06.5-07 payment-action-row / evidence-lifecycle.spec, 06.5-05 next-turn.test (merged PR #221 / #222)
provides:
  - 지급 행동 줄 · 정산 다시 올리기 document keydown 리스너의 열린 dialog 가드(closest("dialog[open]"))
  - 무효 갈래 면제 거르기(voided.has(status.id) && !status.waived)
  - G-06-H E2E 넷 · G-06-I 통합 셋 · G-06-J 1→2 라벨 단언
affects: [expenses/[id] 지급 행동 줄, projects/[id]/settlement 다시 올리기, 기안자 「내 차례」 증빙 신호]

actuals:
  tokens: 6100
  tasks: 3
  commits: 3

key-files:
  created:
    - docs/design/checks/2026-10-15-06-39-ctrl-enter-modal-guard.md
  modified:
    - app/(app)/expenses/[id]/payment-action-row.tsx
    - app/(app)/projects/[id]/settlement/settlement-actions.tsx
    - domain/expenses/evidence-signals.ts
    - test/e2e/evidence-lifecycle.spec.ts
    - test/e2e/settlement-approval.spec.ts
    - test/e2e/approval-reserve-evidence.spec.ts
    - test/integration/next-turn.test.ts

key-decisions:
  - "열린 dialog 안 키는 모달 몫: 리스너 첫머리에서 event.target.closest(\"dialog[open]\")면 돌아선다 (ConfirmDialog 불변, 칸의 Enter preventDefault 기준 미사용)"
  - "G-06-J는 재현 안 됨 — 소스 변경 0, 단언만 남김"

duration: n/a
completed: 2026-10-15
---

# Phase 6 Plan 39: Ctrl+Enter 모달 가드 · 면제 무효 신호 · 승인 증빙 라벨 Summary

열린 `<dialog>` 안 Ctrl+Enter가 지급 행동 줄 · 정산 다시 올리기의 화면 1차까지 돌던 것을 리스너 가드 한 줄씩으로 막고(막힌 모달에서 지급이 되던 major 포함), 면제 문서의 `증빙 무효` 신호를 거르고, 승인 증빙 1→2 라벨을 E2E로 묶었다.

## Commits
- c20aa72 fix(06-39): ignore ctrl+enter from inside an open dialog on document action rows
- 9493b28 fix(06-39): drop the void evidence signal for waived expenses
- feea3e6 test(06-39): guard the approval evidence label through a second upload

## RED / GREEN 기록 (CI=true 프로덕션 빌드, desktop)
- ⓐ 무효 모달 Ctrl+Enter — RED: `expect(payPosts.count()).toBe(0)` Received 1(무효 POST 29ms 뒤 `지급 완료` 서버 액션 POST가 같이 나감). GREEN 후 0.
- ⓑ 막힌 모달(사유 빈 칸) Ctrl+Enter — RED: 첫 실행 `paymentTraces` Expected `{payments:0, processLogs:0}` Received `{payments:1, processLogs:1}`(실제 지급 기록 · `payment_process` 로그 — major 확인); 지급 POST 단언 추가 뒤 `payPosts.count()` Received 1. GREEN 후 0.
- ⓒ 모달 밖 `지급일` 칸 Ctrl+Enter 대조 — 고치기 전 녹색, 고친 뒤 녹색(`payment-result` 선다 · 지급 1행).
- ⓓ 폰 「더보기」 시트 안 Ctrl+Enter — RED: `expect(actionPosts).toBe(0)` Received 1. GREEN 후 시트 안 0 · 시트 밖 Ctrl+Enter는 토스트 · 1차 사라짐.
- G-06-I 통합 셋 — RED: 셋 모두 `증빙 무효`(`expected '증빙 무효' to be null` ×2, 「내 차례」 줄 1개 `가을 팝업 · 무대 제작 — 증빙 무효`). GREEN 후 52/52.
- 같은 꼴 대조: 면제 없는 지급 뒤 무효 → `증빙 무효`(기존 사례 녹색).

## Deviations from Plan

**1. [Rule 1 - 테스트가 이중 실행을 못 잡음] ⓐ 단언을 서버 액션 POST 계측으로 교체**
- 발견: Task 1 RED 첫 실행에서 ⓐ가 녹색(예상은 붉음). 계획의 「붉지 않으면 단언이 못 잡는 것 — systematic-debugging으로 계측」 갈래.
- 계측(`next-action` POST 본문 · 응답 · 본문 텍스트): 무효 POST 직후 `{expenseId, payDate, expectedPayableKrw, version:3, transferKrw}` POST가 같이 나감을 확인. 그러나 이 픽스처(증빙 확인됨 · 유일한 파일 무효)에서는 지급 응답이 빈 응답으로 버려져 `다른 사람이` 줄이 서지 않고 지급도 0행 — 증빙 필수 게이트/새로 고침 순서 때문으로 보이며 거짓 충돌 줄 자체는 이 픽스처에서 재현되지 않았다(UAT와 타이밍 다름).
- 조치: ⓐ ⓑ에 `expectedPayableKrw`를 실은 POST 수 0 단언(`trackPayActionPosts`)을 더해 이중 실행을 직접 잡게 함. `다른 사람이` 0 · `payment-result` 0 · DB 0 단언도 유지.
- 커밋: c20aa72

**기타:** 점검표 `docs/design/checks/2026-10-15-06-39-ctrl-enter-modal-guard.md`의 `화면:` 줄은 소스 두 파일만 적음(owned-evidence · revision-section은 G-06-J 재현 안 돼 변경 0).

## G-06-J 판정
재현 안 됨. `--repeat-each=5` CI=true 프로덕션 빌드에서 5/5 녹색(`승인 증빙 2` 단언 `UPLOAD_WAIT` 안). `owned-evidence.tsx` · `revision-section.tsx` 변경 0. 스테이징(Cloud Run) 지연 재측정은 검증 레인 몫.

## 발견 (고치지 않음, `/review` 판정)
`grep -rln 'addEventListener("keydown"' app ui | xargs grep -ln 'isCtrlCombo(event, "Enter")'` 결과 3개: `payment-action-row.tsx` · `settlement-actions.tsx`(이번에 고침) · `leave/[id]/document-actions.tsx`(`dialogOpen`으로 이미 거름). 그 밖에 열린 모달 거르기 없는 같은 꼴 document 리스너 없음.

## 검증
- `pnpm lint` 0 · `pnpm typecheck` 0 · `CI=true pnpm build` 0
- 통합 `next-turn.test.ts` 52/52 · 단위 `row-scope-disposition.test.ts` 17/17(새 repository 호출 0)
- E2E(CI=true, desktop) 한 번에: approval-reserve-evidence · expense-undo-resubmit · evidence-waive-prepaid · next-turn-phase6 · evidence-lifecycle · payment-single · settlement-approval = 58 passed
- `git diff --name-only 844968e..HEAD`는 frontmatter files_modified 안(+ 점검표)뿐, `ui/` · `repositories/` · 06.5 파일 변경 0

## 독립 DOM 감사 요청 (실행자가 하지 않음 — 별도 에이전트, model Sonnet)
`CI=true` 프로덕션 빌드 + `erp_test`, 확인됨 · 지급 전 문서 둘, 폭 375 · 320 · 768 · 1280마다 DOM 실측(스크린샷 육안 금지):
① 무효 모달 사유 칸 Ctrl+Enter 뒤 `dialog[open]` 0 · 파일 행 `무효` · `[role=alert]`에 `다른 사람이` 0 · `payment-result` 0 · `document.activeElement`가 `#evidence` 안
② 빈 사유 Ctrl+Enter 뒤 `dialog[open]` 1 · `payment-result` 0 · 1차 이유 자리에 막힘 이유
③ 모달 밖 `지급일` 칸 Ctrl+Enter 뒤 `payment-result` 1 · 포커스가 결과 글자
④ 문서 `scrollWidth = clientWidth`
⑤ (G-06-J 미수정이라 해당 없음)
⑥ (375 · 320만) 반려된 정산 결재 문서 PM 화면 「더보기」 시트 안 Ctrl+Enter 뒤 `dialog[open]` 1 · 토스트 0 · 1차 `정산 결재 다시 올리기` 1, 시트 닫은 뒤 포커스가 트리거
결과 표 링크: (감사 후 기입)

화면 영향 라우트: `/expenses/{id}`(확인됨 · 지급 전 문서), `/projects/{id}/settlement`(반려된 정산 결재 문서, 폰 폭).

## Known Stubs
없음.

## Self-Check: PASSED
커밋 c20aa72 · 9493b28 · feea3e6 존재, 점검표 파일 존재, 위 검증 명령 출력 확인.
