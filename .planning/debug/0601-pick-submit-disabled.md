---
status: diagnosed
trigger: "06.1 UAT #29 — 증빙 고르기로 붙인 직후 지출결의 제출 버튼이 새로고침 전까지 비활성"
created: 2026-10-20T15:10:00Z
updated: 2026-10-20T15:40:00Z
phase: 06.1
goal: find_root_cause_only
---

## Symptoms
- expected: 작성자가 지출결의 화면에서 「증빙 고르기」로 공개 증빙을 붙이면 증빙 필수 게이트를 통과하므로 주 버튼 「제출」이 바로 눌린다.
- actual: 붙인 직후 「제출」이 aria-disabled로 남음(2문서 재현). 새로고침하면 열림.
- errors: 없음
- reproduction: UAT #29 (/mnt/project-files/06.1-review/verify/staging-uat.md)
- timeline: 스테이징 UAT 2026-10-20에서 발견
- suspects: app/(app)/expenses/[id]/expense-form.tsx:210·355 (클라이언트 증빙 있음 상태), 06.1-08 고르기 액션의 갱신(revalidatePath/router.refresh)

## Current Focus
bug_class: Bohrbug (결정적 — 2문서 2회 재현, 0s/1.5s/4.5s 동일)
hypothesis: "ExpenseForm의 serverBlock은 useState(data.block)로 첫 렌더 값만 잡고, 이후엔 미리보기 응답으로만 바뀐다. 고르기 붙임 뒤 router.refresh는 같은 key로 폼을 다시 그려 새 data.block(null)을 무시하고, 미리보기 키(previewKey)는 05 파일 수(files.length)만 보므로 미리보기도 다시 부르지 않는다. 355줄의 증빙 해제 조건도 05 파일(evidenceAdded·files.length)만 봐서 묵은 ⑧ 「증빙 없음」이 남는다."
test: "코드 경로 추적(page.tsx key·props, evidence-records-section onAttached, expense-form previewKey·355) + 서버 previewExpense가 기록 붙임(linkCount)을 세는지 확인 + 스테이징 PNG 대조"
expecting: "서버 initialBlock은 붙인 뒤 null, 클라이언트 serverBlock은 ⑧ 그대로"
next_action: "진단 완료 — ROOT CAUSE FOUND 반환(goal: find_root_cause_only)"
reasoning_checkpoint:
  hypothesis: "고르기 붙임 뒤 제출 1차가 막힌 채인 것은 ExpenseForm의 serverBlock이 첫 렌더 값(useState(data.block))에 고정되고, 이를 갱신하는 세 통로(미리보기 previewKey의 files.length · 355줄 files.length>0 · markEvidenceAdded)가 모두 05 파일만 보기 때문 — 기록 붙임은 셋 중 아무것도 움직이지 않는다"
  confirming_evidence:
    - "C29-after-attach-state.png: router.refresh 뒤 붙은 증빙 표에 새 행 · 트리거 63(64→63)으로 RSC 새 props가 도착했는데 1차는 `증빙 없음 · 증빙 올리기 Ctrl+U`"
    - "page.tsx:262 key = quoteLineId ?? itemName ?? 'team' — 붙임으로 바뀌지 않아 폼 재마운트 없음 → useState 초기값 재적용 없음"
    - "서버 previewExpense evidenceCount = fileCount + linkCount(domain/expenses/index.ts:1482) — 새로 고침 뒤 initialBlock은 ⑧ 없음, UAT에서 새로 고침 뒤 열림·제출 성공"
  falsification_test: "붙인 뒤 창 focus/visibilitychange(returnTick)로 미리보기를 강제로 부르면 1차가 열려야 한다; 열리지 않으면 가설 틀림"
  fix_rationale: "(진단만) 폼이 기록 붙임 수를 알고 미리보기 키·355 조건에 넣으면 서버 판정으로 재동기된다"
  blind_spots: "jsdom 없음 — 클라이언트 렌더 재현 테스트는 못 돌림(새 의존성 금지). returnTick 반증 실험은 브라우저에서만 가능"
  candidate_causes:
    - "code: 클라이언트 serverBlock 재동기 통로가 05 파일만 봄(확정)"
    - "code/data: 서버가 기록 붙임을 세지 않음(배제 — linkCount 셈 · 새로 고침 뒤 열림)"
    - "config/env: revalidate·캐시로 refresh가 안 옴(배제 — 붙은 표는 갱신됨)"
  and_gate: "no — 서버 판정·refresh는 정상, 클라이언트 통로 하나만으로 충분. 초안 붙임은 문서 version을 올리지 않아(bumpsInstance는 결재 중·승인만) 묵은 version 동반 원인도 없음"

## Evidence
- timestamp: 2026-10-20T15:20:00Z
  checked: /mnt/project-files/06.1-review/verify/staging-uat.md 이슈 2 · staging/C29-after-attach-state.png · C29-debug.png
  found: 붙인 뒤 「붙은 증빙」 표에 새 행(카드 전표 · 대량20, 「PM-A 고름 · 10-20」)과 `증빙 고르기 63`이 그려졌는데 1차는 비활성 · `증빙 없음 · 증빙 올리기 Ctrl+U`(0s/1.5s/4.5s, 2문서). 새로 고침 뒤 1차 활성 · 제출 성공
  implication: router.refresh는 일어났고 RSC 새 props가 클라이언트에 도착했다. 서버 판정도 맞다. 클라이언트 폼 상태만 묵었다
- timestamp: 2026-10-20T15:25:00Z
  checked: app/(app)/expenses/[id]/evidence-records-section.tsx:152-155 (PickEvidenceDialog onAttached)
  found: 붙인 뒤 `router.refresh()`만 한다. ExpenseForm에 알릴 콜백(markEvidenceAdded 같은 것)이 없다 — 섹션은 폼에 ReactNode(evidenceRecords prop)로만 들어간다
  implication: 폼은 붙임 사실을 refresh된 props로만 알 수 있다
- timestamp: 2026-10-20T15:27:00Z
  checked: app/(app)/expenses/[id]/page.tsx:173-200, 261-308
  found: initialBlock = previewExpense(저장값) → data.block. ExpenseForm key = `expense.quoteLineId ?? expense.itemName ?? "team"` — 붙임으로 안 바뀜. files = listEvidence(05 파일만, 기록 붙임 아님). 붙은 기록(formLinked.items)은 EvidenceRecordsSection에만 가고 ExpenseForm에는 수가 넘어가지 않는다
  implication: refresh 뒤 폼은 같은 인스턴스로 다시 그려지고, files는 여전히 [] 이다
- timestamp: 2026-10-20T15:30:00Z
  checked: app/(app)/expenses/[id]/expense-form.tsx:210, 213-215, 264-281, 283-352, 355
  found: (a) :210 `useState(data.block)` — 이후 data.block 변화 무시, 바꾸는 곳은 :341 미리보기 응답뿐. (b) previewKey(:264-281)에 증빙 관련 칸은 `files.length`뿐 → 기록 붙임 뒤 키 그대로 → 미리보기 안 부름. (c) :355 ⑧ 해제 조건 `evidenceAdded || files.length > 0` — 둘 다 05 파일 기준(markEvidenceAdded는 EvidenceAttachments onAdded :1009에만 연결). (d) :252-263 returnTick은 창 focus/visibilitychange에서만 오른다 — 같은 화면 대화상자 닫기는 해당 없음
  implication: 기록 붙임 경로에서는 serverBlock을 바꿀 통로가 하나도 없다 → 묵은 ⑧ 「증빙 없음」 유지. 이것이 증상과 정확히 맞는다
- timestamp: 2026-10-20T15:32:00Z
  checked: domain/expenses/index.ts:1480-1483, 1528 · domain/expenses/gate.ts:143 · test/integration/evidence-presence.test.ts:253
  found: 제출 판정 evidenceCount = 살아 있는 05 파일 수 + 살아 있는 기록 붙임 수(06.1-12 PA-SUBMITCOUNT). 통합 테스트가 「파일 0 · 붙임 하나 → 제출 통과」를 덮는다
  implication: 서버 쪽 원인 배제
- timestamp: 2026-10-20T15:34:00Z
  checked: domain/evidence-records/attach.ts:470-520 (attachBatchToExpense) · domain/evidence/index.ts:939-951 (afterEvidenceOwnerChange)
  found: 작성자 붙임은 결재 인스턴스 version을 결재 중 · 승인일 때만 올린다(bumpsInstance). 작성 중 · 회수 문서의 문서 version은 그대로
  implication: 묵은 version으로 제출이 막히는 동반 원인 없음(AND-gate no)
- timestamp: 2026-10-20T15:36:00Z
  checked: git log -S
  found: :355 05 파일 기준 해제는 06.3 이전부터. 서버가 붙임을 세기 시작한 것은 PR-B 2b4149b(#252, 06.1-12). 폼 안 고르기 경로는 PR-C cf9ce69(#253, 06.1-08). 06.1-08 PLAN Task 3 ⑤는 「붙인 뒤 router.refresh로 섹션이 제자리에서 바뀐다」만 적고 제출 1차 재판정을 요구하지 않는다. test/e2e/evidence-pick.spec.ts는 붙인 뒤 같은 화면 제출 1차 활성을 재지 않는다
  implication: 새 증빙 경로가 들어올 때 폼의 클라이언트 증빙 유무 통로를 넓히지 않은 계획·테스트 공백
- timestamp: 2026-10-20T15:37:00Z
  checked: 같은 원인의 대칭 경우(코드 추론, 미실측)
  found: 붙은 기록이 있는 채 연 문서(serverBlock = null)에서 마지막 기록을 떼면(DetachDialog onDone → router.refresh) 서버 initialBlock은 ⑧이 되지만 폼 serverBlock은 null 그대로 → 1차가 열린 채, 누르면 서버가 ⑧로 거부
  implication: 수정 시 붙임 · 떼기 양쪽을 같은 통로로 재동기해야 한다

## Eliminated
- hypothesis: 서버 제출 판정이 기록 붙임을 증빙으로 세지 않는다
  evidence: domain/expenses/index.ts:1482 evidenceCount = fileCount + linkCount · 새로 고침 뒤 1차 열림 · 제출 성공(T26-0014/0015) · 통합 테스트 evidence-presence.test.ts:253
  timestamp: 2026-10-20T15:32:00Z
- hypothesis: 고르기 액션 뒤 router.refresh/revalidate가 안 와서 화면이 묵었다
  evidence: C29-after-attach-state.png에서 같은 refresh로 붙은 증빙 표 · 트리거 수(63)는 갱신됨
  timestamp: 2026-10-20T15:25:00Z
- hypothesis: 붙임이 문서 version을 올려 묵은 version이 함께 막는다(AND-gate)
  evidence: afterEvidenceOwnerChange는 결재 중 · 승인에서만 인스턴스 version을 올림 — 작성 중 · 회수 문서는 그대로
  timestamp: 2026-10-20T15:34:00Z

## Resolution
root_cause: "ExpenseForm(app/(app)/expenses/[id]/expense-form.tsx)의 제출 막힘 serverBlock은 useState(data.block)(:210)로 첫 렌더 값에 고정되고 갱신 통로(미리보기 previewKey의 files.length :273 · ⑧ 해제 조건 :355 · markEvidenceAdded :215/:1009)가 모두 05 파일만 보는데, 06.1-08 증빙 고르기는 05 파일이 아닌 기록 붙임을 만들고 router.refresh만 하므로(evidence-records-section.tsx:152-155, 폼 key 불변 page.tsx:262) 서버의 새 판정(⑧ 해제)이 폼에 반영되지 않고 묵은 「증빙 없음」이 남는다"
fix:
verification:
files_changed: []
