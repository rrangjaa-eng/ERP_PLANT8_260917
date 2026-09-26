---
reviewer: Fable (r4 recheck, read-only — Codex substitute)
date: 2026-09-26
scope: commit 0f3f653 (F-F1~F-F4 · F-N1 · F-N2 applied to 18 plans) vs UI-SPEC rev 9, cross-plan contracts, eslint boundaries, repo facts on current main (4347517)
verdict: FIX_NEEDED
counts: { block: 0, fix: 3, note: 3 }
---
# Phase 6 r4 재확인 (Fable)

## 요약
- F-F1~F-F4 · F-N1 · F-N2는 실행 본문(must_haves · action · files · verify · acceptance)에 반영돼 있고, F-F3는 UI-SPEC:361 「확인하면 그 줄이 dirty 한 칸이 되고 `일괄 저장` 때 반영」 · :805 「저장은 상세의 1차 `일괄 저장 Ctrl+S N` 하나」와 일치한다. 막음 없음.
- 고침 3건 중 2건은 **머지 4347517(PR #40)이 r4 인용을 낡게 만든 것**이다 — main 정합 Opus 패스와 겹치지만 r4가 만진 줄이라 여기 적는다. 나머지 1건은 F-F1×F-F4 상호작용 공백(06-15).

## 고침
### R4-F1 — 06-15 행 모양에 `prepaid`가 없다 (F-F1 × F-F4 공백)
- **위치:** `06-15-PLAN.md:172` Task 1 ①. **근거:** F-F4로 `evidenceGateInputs`의 `lockedDoc`이 `prepaid`를 갖게 됐고(06-10:36 「`lockExpenseRow`의 반환 칸에 `prepaid`를 더해 `lockedDoc`으로 받는다」), 06-15는 자기 `repositories/payment-targets.ts` 행을 `lockedDoc` 자리에 넘기는데 행 칸 목록이 「증빙 금액 · 증빙일 · 증빙 종류 · 결재 통과일 … 지급 방식 · 예정일 · 증빙 판정 입력 · version」이고 `grep -c "prepaid\|선결제" 06-15-PLAN.md` = 0.
- **영향:** `pnpm typecheck`가 잡지만 플랜이 침묵해 실행자가 인자 타입을 넓히거나 즉석으로 칸을 더한다. **수정:** 06-15:172 행 칸 목록에 `prepaid`(선결제 칸, 06-10) 한 낱말 + acceptance `grep -c "prepaid" repositories/payment-targets.ts` ≥ 1.

### R4-F2 — 06-21 r4 본문이 `deferRecord`에 기대는데 main `ledger.ts`에 없다
- **위치:** `06-21-PLAN.md` truths(CROSS-R1 F-5 줄) · Task 1 action ⑵ 「`status_change` 행동 기록은 원장의 `deferRecord`로 커밋 뒤」 · read_first 「domain/projects/ledger.ts(`saveProjectLedger` — … `deferRecord`)」 · AS2 · T-06-144. 같은 가정: 06-18:169.
- **근거:** `git show 0f3f653:domain/projects/ledger.ts` L49 `const deferRecord = {` ↔ 머지 뒤 `grep -n deferRecord domain/projects/ledger.ts` 0건; 머지 diff가 `deferRecord`·`pendingActions`를 지우고 `recordAction(viewer, {...}, { tx })`를 **트랜잭션 안**에서 부른다(ledger.ts:294 · 312, `domain/action-log/record.ts:97 tx?: DbOrTx`). 즉 Phase 4 main은 「커밋 뒤 지연」이 아니라 「같은 tx 기록」(A-01)으로 갔다.
- **영향:** 실행자가 없는 심볼을 찾다 멈추거나 즉석 지연 큐를 만든다. 06-03 tx 규약 「행동 로그는 커밋 뒤」와 main 관행의 충돌은 main 정합 패스가 결정할 몫 — **06-21은 그 결정을 따르는 문장으로 바꾸고 `deferRecord` 이름을 빼야 한다**(06-03/05/08/12/18/19도 같은 낱말을 쓴다).

### R4-F3 — F-N1 대체 인용의 줄 번호 · 사실이 머지로 낡음
- 06-07 read_first 「`domain/quotes/lines.ts` `saveQuoteLines` 머리(355-383행)」 → main에서 `export async function saveQuoteLines`는 **1112행**(pre-merge 355).
- 06-08 · 06-12 read_first 「domain/projects/ledger.ts 45-63행(`deferRecord`)」 → 45-63행은 주석 · `PeriodInput` 타입, `deferRecord` 없음(R4-F2).
- 06-03 · 05 · 08 · 12 · 13 · 14 「`settings.ts`는 읽기 함수가 전역 `db`」/「`findSimpleValue` · `findEffectiveValue` 읽기는 전역 `db`」 → main `repositories/settings.ts:13 findSimpleValue(viewer, key, tx?: DbOrTx)`는 이미 `tx`를 받는다(`findEffectiveValue`:41만 없음). 06-09 · 06-14 「`team-memberships.ts` … tx 인자 없음」 → main `repositories/team-memberships.ts:88 tx?: DbOrTx`(pre-merge 0건). 그 파일들은 `grep -L "DbOrTx" repositories/*.ts` 결과에서 빠진다.
- **수정:** 줄 번호를 심볼 이름(`grep -n "export async function saveQuoteLines"`)으로, 「전역 `db`」 목록은 `grep -L` 결과를 그대로 따르라는 문장으로. 06-08의 「96-142행 `pg_blocking_pids`」는 정확하다(:96-135).

## 참고
- **R4-N1** 06-21 Task 1 verify가 `test/e2e/quote-table.spec.ts`를 돌리는데 `quote-table.tsx`는 같은 W10의 06-19 소유(06-19:15) — 병렬 실행 중 빨간 원인이 06-21 밖일 수 있다. fails_when에 「06-19 동시 수정 가능 — 06-19 커밋 뒤 재실행」 한 절, 또는 이 spec은 06-24 게이트로.
- **R4-N2** 06-21 action ⑶ 「06-18 Task 3이 발행 요청 표 dirty를 `일괄 저장 N`에 잇는 자리」 — 실제로는 06-18 Task 1 ③(06-18:171 「발행 요청 표의 dirty를 … N에 더한다」); Task 3(06-18:222)은 빈 화면 · 1024 · 오류 셀. 포인터만 틀림.
- **R4-N3** F-F1의 `tx?` 선택 인자는 트랜잭션 안 호출자가 `tx`를 빠뜨리면 조용히 풀 `db`를 읽는 PR #75 꼴 위험을 남긴다. 현재 호출자는 `completeExpensePayment`(06-06 acceptance가 `tx` 인자를 확인) · 06-15 목록(tx 없음, 의도) · 06-15 일괄은 `completeExpensePayment` 경유(06-15:172)라 지금은 안전.

## 확인했으나 문제 없음
- F-F1: `repositories/quote-lines.ts:13` `tx: DbOrTx = db` 선례 ✓ · domain은 `import type { DbOrTx } from "@/repositories/document-counters"` ✓ · `eslint.config.mjs` domain allow `domain · repositories · lib` ✓ · 다른 플랜에 `evidenceGateInputs(` 호출 없음(호출자 불일치 0).
- F-F2: 투영 함수 `domain/payments/index.ts`(06-20 files_modified ✓), 간선 targets → index 한 방향, 06-17(W9) → 06-20(W10) ✓, `test/unit/import-cycles.test.ts` SCAN_DIRS에 domain ✓, verify + fails_when ✓.
- F-F3: 06-18:169 `saveIssueRequestRows(viewer, projectId, rows, tx)` · `lockIssueRequest`(tx 필수) 정의 ✓ · 06-18:171 zod `issueRequests`(id? · version?)에 `cancel` 추가는 덧붙임 ✓ · `issueRequestTransition`은 06-21 자기 파일(W10 > W9) ✓ · `actions.registry.ts` 제거 타당 ✓ · W10 files_modified 겹침 0 ✓ · ledger 밖 `cancelIssueRequest` 잔존 0 ✓ · E2E가 DB를 직접 읽는 선례 `test/e2e/ledger-save-flow.spec.ts` ✓ · awk 범위 패턴이 06-18:216과 같음 ✓.
- F-F4: 06-10 files_modified 15 · Task 2 files · read_first · action · acceptance ✓, W6 단독 ✓, 06-03:201 `lockExpenseRow`가 `repositories/expense-payments.ts` ✓.
- F-N1/F-N2: UI-SPEC 「열린 선택」 표 O-2/9/10/11/12/13/14/19/20 행 존재(:1263-1281) ✓ · `projects-create-concurrency.test.ts` main에 있음 ✓ · `71eba82` 존재, 두 파일 변경 ✓ · 25개 플랜 `<automated>` 모두 `<fails_when>` 짝 ✓ · ledger 밖 `/mnt/project-files` 0 ✓.
