---
reviewer: Fable (final full review, read-only)
date: 2026-09-26
scope: UI-SPEC rev 9 + 25 plans + CONTEXT + design-review + design-apply-cross-r2 + ledgers
verdict: FIX_NEEDED
counts: { block: 0, fix: 4, note: 3 }
---
# Phase 6 최종 전체 검토 (Fable)

## 요약
- 25개 플랜 전부 · UI-SPEC rev 9 전문 · CONTEXT · design-review · design-apply-cross-r2 · eng-review · eng-cross-opus · VALIDATION · COVERAGE · ROADMAP Phase 6 절 · REQUIREMENTS EVID-01 줄을 읽고, 플랜이 기대는 코드 사실(eslint boundaries · `DbOrTx` 경로 · `import-cycles` 테스트 · 행동 로그 타입 · PR #75 커밋)을 저장소에서 대조했다.
- 막음은 없다. 고침 4건은 전부 "플랜 문장대로 실행하면 그 플랜 자신의 verify 게이트(`pnpm lint` · `pnpm test:unit`)가 빨갛거나, files_modified 밖 파일을 만져야 하거나, UI-SPEC 정본과 어긋나는" 종류다 — 잠긴 결정(D-601~D-613 · DR-2/3/4 · O-2 · M-8 · 분할 금지)은 건드리지 않는다.
- X-1~X-9는 플랜 본문에 반영돼 있다(X-8의 REQUIREMENTS 줄은 06-01 Task 3 체크포인트로 넘긴 상태 — 설계된 경로).
- 참고 3건은 저장소 밖 메모 · 없는 커밋 해시 참조(실행자가 read_first를 못 읽는다)다.

## 막음
(없음)

## 고침

### F-F1 — 06-15 Task 1 ①: domain 코드가 `db` 값을 넘긴다 → eslint boundaries 위반 → `pnpm lint` 게이트 실패
- **위치:** `06-15-PLAN.md` Task 1 action ①(L172), verify L185 · L257
- **문제:** `domain/payments/targets.ts`의 `listPaymentTargets`가 06-06 `evidenceGateInputs(viewer, lockedDoc, pre, tx)`를 부를 때 "`tx` 자리에 `db`"를 넘기라고 적었다. domain은 `db/**`를 import할 수 없다.
- **근거:** 06-15:172 「증빙 판정 입력은 06-06 · 06-10의 `evidenceGateInputs` — 트랜잭션 없는 읽기라 `tx` 자리에 `db`」. `eslint.config.mjs:46` `{ from: "domain", allow: ["domain", "repositories", "lib"] }` · `:28` `{ type: "db", pattern: "db/**" }`. 현재 `grep -rn "@/db/client" domain/` 0건이고 `repositories/` · `lib/`에 `db` 값 re-export가 없다(domain은 `import type { DbOrTx }`만 쓴다). 06-06:35는 `tx` 인자를 필수 위치 인자로 적었다. design-apply-cross-r2 X-4 원문도 「domain은 `db`를 import할 수 없다(eslint.config.mjs:46)」를 규칙으로 세웠다.
- **영향:** 06-15 Task 1 verify `pnpm lint && pnpm typecheck && pnpm build`(L185)가 boundaries 오류로 실패한다. 실행자가 즉석으로 `db`를 domain에 import하거나 규칙을 예외 처리할 유인이 생긴다(CLAUDE.md §5 위반 경로).
- **권장 수정(최소):** 06-15:172의 「`tx` 자리에 `db`」를 「`tx`는 넘기지 않는다(생략) — `evidenceGateInputs`의 `tx`를 선택 인자로 두고, 안에서 부르는 06-06 리포지토리가 `tx: DbOrTx = db` 기본값으로 전역 `db`를 쓴다(기존 `repositories/quote-lines.ts` 꼴)」로 바꾸고, 06-06:35 서명을 `evidenceGateInputs(viewer, lockedDoc, pre, tx?)`로 맞춘다(06-06은 W4, 06-15는 W8 — 06-06 쪽 한 글자 수정으로 끝난다). 06-15 acceptance에 `grep -c "@/db/client" domain/payments/targets.ts`가 0 한 줄.

### F-F2 — 06-20 Task 2: `domain/payments/index.ts` ↔ `targets.ts` 런타임 순환 import → `test/unit/import-cycles.test.ts` 실패
- **위치:** `06-20-PLAN.md` Task 2 action(L190), verify L231; 선행 06-15:172 · 06-15:206 · 06-17:323
- **문제:** 06-15 ①과 06-17 ②가 `targets.ts`에서 `index.ts`의 `loadPaymentInputs` · `pickTaxDates` · `decidePayable`를 부르게 했다(targets → index). 06-20 Task 2는 계좌 투영 함수를 `targets.ts`에 두고 `index.ts`의 `getPaymentView`가 그것을 부르게 한다(index → targets). 두 방향 모두 값 import라 순환이다.
- **근거:** 06-20:190 「계좌 칸 투영을 `domain/payments/targets.ts`에 한 함수로 두고 `listPaymentTargets`와 `getPaymentView`(06-03, `domain/payments/index.ts`)가 같은 함수를 부른다」. 06-15:206 read_first 「domain/payments/index.ts의 `loadPaymentInputs` · `pickTaxDates` · `decidePayable`(06-03 — 목록이 같은 두 몫 rates를 쓴다)」. 06-17:323 「`domain/payments/targets.ts`에 `getEvidenceConfirmView` … `loadPaymentInputs` → `decidePayable`」. `test/unit/import-cycles.test.ts`는 `domain/` 아래 런타임(non-type) import 간선의 순환을 센다(`import type`만 제외).
- **영향:** 06-20 Task 2 verify `pnpm test:unit`(L231)과 06-24 페이즈 게이트(L191 `pnpm test:unit`)가 빨갛다. 실행자가 순환을 풀기 위해 함수를 옮기면 06-15 · 06-17의 files_modified · 계약이 흔들린다.
- **권장 수정(최소):** 06-20:190의 투영 함수 위치를 `domain/payments/index.ts`(06-20 files_modified에 이미 있음)로 바꾸고 `targets.ts`가 그것을 import하게 한다(간선 방향이 targets → index 하나로 유지). 06-20 artifacts(L53-54) · key_links(L62-64) · 열린 선택 O-17 줄(L128)의 「`domain/payments/targets.ts` … 계좌 칸 투영」 위치 표기도 같이 고친다. acceptance에 `pnpm vitest run --project unit test/unit/import-cycles.test.ts` 녹색 한 줄.

### F-F3 — 06-21 Task 1: 발행 요청 취소가 즉시 저장 액션인데, UI-SPEC rev 9는 「dirty → `일괄 저장` 때 반영」이다
- **위치:** `06-21-PLAN.md` must_haves L31 · L46 · Task 1 action L145 · Artifacts L263-264 vs `06-UI-SPEC.md` L361(Copywriting) · L805(S16)
- **문제:** 플랜은 `cancelIssueRequest(viewer, { requestId, version })` + `withTransaction(runCancel)` + 서버 액션 `cancelIssueRequestAction`으로 확인 모달 직후 서버에 즉시 쓴다. UI-SPEC은 S16 표의 저장 경로를 `일괄 저장 Ctrl+S N` 하나로 두고, 취소 확인은 그 줄을 dirty 칸으로 만들어 일괄 저장 때 반영한다고 정했다.
- **근거:** UI-SPEC:361 「Destructive — 발행 요청 취소(S16) … 확인하면 그 줄이 dirty 한 칸이 되고 `일괄 저장` 때 반영(04 줄 삭제와 같은 흐름)」. UI-SPEC:805 「저장은 상세의 1차 `일괄 저장 Ctrl+S N` 하나(§7-3 (사)). `Delete` → 확인 모달 `발행 요청 취소`(→ `취소` 상태, 줄은 남는다)」. 06-21:145 「`app/(app)/projects/actions.ts`에 `cancelIssueRequestAction` … 표에서 PM이 `요청` · 미연결 줄에 `Delete` → `ConfirmDialog` → 취소 뒤 줄은 `취소` 상태로 남는다」 · 06-21:46 「이 플랜의 트랜잭션은 발행 요청 취소(`cancelIssueRequest`)다」.
- **영향:** UI-SPEC ↔ 플랜 불일치(정본은 UI-SPEC). 같은 표에 저장 경로가 둘(일괄 저장 + 즉시 취소)이 되어 §7-3 (사) 「1차 하나」 원칙과 06-18 `saveIssueRequestRows`의 단일 저장 계약이 어긋나고, `/design-review`에서 S16 동작이 스펙 불일치로 잡힌다. 취소를 dirty로 두었다가 `일괄 저장`이 실패하면 사용자가 본 `취소` 표시가 되돌아가는 흐름(04 줄 삭제와 같음)도 플랜에 없다.
- **권장 수정(최소):** 두 길 중 하나를 고르고 다른 쪽을 맞춘다. **(a) 플랜을 스펙에:** 취소는 `issue-request-table.tsx`에서 그 줄의 상태를 `취소`로 바꾼 dirty 칸이 되고, 06-18 `saveIssueRequestRows(viewer, projectId, rows, tx)`가 `issueRequestTransition`으로 `요청 → 취소` 전이를 판정 · 저장한다. `cancelIssueRequest` · `cancelIssueRequestAction` · `runCancel`을 지우고, 「취소 ∥ 발행 줄 잇기 하나만 성공」 truth는 `saveIssueRequestRows`의 요청 행 잠금으로 그대로 증명한다(CROSS-R1 F-5 「권한 · 완료 판정은 트랜잭션 전」은 06-18 저장 경로가 이미 지킨다). **(b) 스펙을 플랜에:** UI-SPEC:361 · :805를 「즉시 저장 · `일괄 저장`과 무관」으로 고친다 — 이는 rev 9 재개정이라 사용자 승인이 먼저다. 사용자 결정이 없으면 (a)가 기본이다.

### F-F4 — 06-10 Task 2: `prepaid`를 "잠근 행에서 같은 `tx`로" 읽으려면 리포지토리 수정이 필요한데 files_modified에 리포지토리 파일이 없다
- **위치:** `06-10-PLAN.md` files_modified L7-21 · must_haves L36 · Task 2 action L203; 선행 06-03:201 · 06-06:35
- **문제:** `evidenceGateInputs(viewer, lockedDoc, pre, tx)`의 `lockedDoc`은 06-03 `lockExpenseRow`가 돌려주는 열거된 칸 묶음이고 `prepaid`가 없다(칸 자체가 06-10 W6에서 생긴다). 06-10은 `prepaid`를 잠근 행의 칸에서 `tx`로 읽게 하지만 `repositories/expense-payments.ts`(또는 다른 리포지토리)를 files_modified에 두지 않았다. domain은 `db/schema`를 import할 수 없어 `tx.select(...)`를 직접 쓸 수도 없다.
- **근거:** 06-10:36 「`prepaid`는 `evidenceGateInputs`가 잠근 지출결의 행의 선결제 칸(같은 `tx`)에서 읽는다」 · 06-10:203 「`evidenceGateInputs`가 잠근 문서의 선결제 칸(같은 `tx` — 사전 조회 값이 아니다, CROSS R-3)을 `prepaid`로 넘기게 한다」. 06-10 files_modified(L7-21)에 `repositories/` 경로 0건. 06-03:201 「`lockExpenseRow(viewer, expenseId, tx)` — … 게이트 입력(상태 · 승인액 · 증빙 금액·증빙일 · 증빙 종류 · 지급 방식 · 지급 예정일 · version)을 돌려준다」. 06-06:35 「`prepaid`는 06-10이 선결제 칸을 만들 때 같은 함수 안에서 실제 값으로 바뀐다」. `eslint.config.mjs:46` domain allow에 `db` 없음.
- **영향:** 실행자가 files_modified 밖 파일(`repositories/expense-payments.ts` — 06-03 · 06-04 파일)을 고쳐야 하거나, 사전 조회 값을 넘겨 CROSS R-3(잠금 뒤 재판정)을 어긋나게 하거나, 멈춘다. 06-10 verify는 「지급 완료 동시 6건」만 보고 이 공백을 잡지 않는다.
- **권장 수정(최소):** 06-10 files_modified와 Task 2 `<files>`에 `repositories/expense-payments.ts`를 더하고(W6 — 같은 웨이브 겹침 없음: W6는 06-10 하나), action에 「`lockExpenseRow`의 반환 칸에 `prepaid`를 더한다(06-03 · 06-04 호출자는 그대로 — 칸 추가만)」 한 문장. acceptance에 `grep -c "prepaid" repositories/expense-payments.ts`가 1 이상.

## 참고

### F-N1 — 저장소 밖 `/mnt/project-files/...` 메모를 read_first · ⓪ 근거로 인용 (17개 플랜)
- **위치:** 06-02 · 03 · 04 · 05 · 06 · 07 · 08 · 09 · 11 · 12 · 13 · 14 · 15 · 16 · 17 · 20 · 21(예: 06-03:176 `/mnt/project-files/deadlock-fix/global-db-in-tx-audit.md`, 06-13 4곳)
- **근거:** `ls /mnt/project-files` — 경로 없음. `.continue-here.md:22`는 `06-gates/`만 잃은 것으로 적었지만 `06-prep/` · `deadlock-fix/`도 이 환경에 없다.
- **영향:** 실행자가 read_first를 못 읽고 넘어가거나 멈춘다. 내용은 CONTEXT · UI-SPEC · 06-03 tx 규약 · 플랜 본문에 이미 흡수돼 있어(교차 검토 판정) 계획 결정에는 영향 없음.
- **권장:** 실행 전 한 번에 — 있는 사본은 페이즈 폴더로 옮겨 경로를 바꾸고, 없는 것은 인용을 「06-03 must_haves 「06-03 tx 규약」 · CONTEXT D-6xx」로 대체한다(플랜 파일 편집은 gsd 도구로).

### F-N2 — 06-03:176 `git show 70a39d4`는 존재하지 않는 커밋 — PR #75 커밋은 `71eba82`
- **근거:** `git cat-file -t 70a39d4` 실패. `git log --all --oneline | grep "#75"` → `71eba82 fix: 프로젝트 동시 등록 때 풀 소진 교착 제거 (#75)`; 변경 파일에 `domain/document-numbering/index.ts` · `domain/projects/index.ts`가 있어 플랜이 가리키려던 커밋이다.
- **권장:** `70a39d4` → `71eba82`.

### F-N3 — REQUIREMENTS 추적표 `| EVID-01 | Phase 5 | Pending |`는 아직 그대로(의도된 상태)
- **근거:** `.planning/REQUIREMENTS.md:220`. 06-25:122 · 06-01:33 · 06-01:218이 06-01 Task 3(REQ-ROUTE 체크포인트, 사용자 선택 경로)으로 보냈다. ROADMAP은 이미 `25 plans`(L562) · 06-25 W10 줄(L615)로 반영됐다.
- **영향:** 없음 — 06-01(W1) 실행 때 닫힌다. 06-01 Task 3이 건너뛰어지지 않게만 확인.

## 이전 라운드 반영 확인 (X-1 ~ X-9)
| id | 반영 | 근거 한 줄 |
|---|---|---|
| X-1 | ✓ | 06-11:37 · :214 「`invalidateEvidenceReview`는 `{ version }` … 훅 뒤의 최종 값 … 결재 통과 문서면 version +1」, 06-11:216 통합 `it` 「PM 증빙 즉시 저장 뒤 같은 화면 저장 성공」 RED 먼저 |
| X-2 | ✓ | 06-16:217 「호출 줄마다 `ownerKind === "expense"` 조건 안」 acceptance · 06-25:43 truth `[X-2 r3]` · 06-25 Task 3 `it` 「… 모든 지출결의 version 불변」 + T-06-236 · 방아쇠 ⑷ |
| X-3 | ✓ | 06-25:155 A-608-P 재확인 ⒞ 「결합 함수가 주인 종류를 인자로 받는가」 · Task 2 action 「결합 함수의 주인 종류(r3 X-3)」 · acceptance `[r3 X-3]` |
| X-4 | ✓ | 06-11 files_modified `repositories/files.ts`(06-11:238 Task 3 files) · 06-25 files_modified `repositories/files.ts`(15개, 방아쇠 16번째) · 06-25:308 「`checkEvidenceUpload`가 … `duplicateScopeKinds(ownerKind)`를 `ownerKinds`로 넘긴다 … 리포지토리는 domain을 import하지 않는다」 · verify `import-cycles` |
| X-5 | ✓ | 06-24:28 · :182 · :197 · :226 모두 「48」 — 25개 플랜 `verification: backstop` 합을 다시 세어 48과 일치(06-25 2건 포함) |
| X-6 | ✓ | 06-02:327 · 06-03:376 · 06-04:367 · 06-05:380 · 06-08:330 ledger 「X-6 … 절 이름으로」 — read_first가 절 이름 인용으로 바뀜(06-04:150 확인) |
| X-7 | ✓ | 06-25:173 `<assumption_delta_decision>` 「지출결의 주인은 중복 판정 범위만 넓어진다 … `no-change`」 — must_haves:38 · Task 3 behavior와 정합 |
| X-8 | ✓(부분·설계대로) | ROADMAP:562 `25 plans` · :615 06-25 W10 줄 ✓ / REQUIREMENTS:220 EVID-01은 06-01 Task 3 체크포인트로 이관(06-01:218) — F-N3 |
| X-9 | ✓ | UI-SPEC:125 「Phase 4 디자인 리뷰 10·11번 항목. 이 페이즈 design-review.md 번호가 아니다」 · UI-SPEC:1324 「옛 DR-5 — Opus 1차 검토 `design-review-opus.md`의 번호」 출처 명시 |

## 확인했으나 문제 없음
- **웨이브 · 의존:** 25개 플랜 wave/depends_on 순서 모순 없음(06-25 → 06-11/14/16/18 모두 W7~W9 < W10). 같은 웨이브 files_modified 겹침 0건(W10 06-19/20/21/25 직접 대조 포함). `_journal.json`을 만지는 플랜은 웨이브마다 하나(W10은 06-25만).
- **계약 이름 · 반환 모양:** `completeExpensePayment` · `lockExpenseRow` · `bumpExpenseVersion`(06-03) ↔ 06-04/06/10/13/15 호출 일치; `confirmEvidence` → `{ version, evidenceStatus, actionRow }`(06-06) ↔ 06-17 `getEvidenceConfirmView` 「보기가 준 `version`」 · 06-20 S3 제자리 확인; `invalidateEvidenceReview` → `{ version }` ↔ `onVersionChange`(06-11) ↔ 06-25 「카드 전표는 훅을 타지 않음」; `checkEvidenceUpload` `ownerKinds` ↔ `duplicateScopeKinds`; `sumSelectedTransfers` `rowStates` ↔ 06-15 `completePaymentsBatch` 스냅숏; `issueRequestTransition` ↔ 06-18 `saveIssueRequestRows` · `linkIssueRequestToEntry`; `loadPreSettleInputs` → `computePreSettleCheck(viewer, projectId, inputs, tx?)`(06-19) ↔ 06-22 승인 트랜잭션 전 읽기(eng E-1 반영).
- **tx 규약 · 잠금 순서:** 06-03 N-3(프로젝트 → 줄 → 문서) · B-1(잠금 → `findLineLinks` → 게이트 → INSERT) · 「동시 6건」 결정적 테스트(06-03/08/12/19/22)가 06-04/05/07/12/13/15/18/21/25에 일관 인용. `runCreate` · `runComplete` · `runCancel` 안 전역 `db` 0건 grep이 acceptance에 있음.
- **행동 로그 타입:** 플랜이 쓰는 `payment_process` · `purchase_process` · `status_change` · `document_delete` · `restore` · `mask_reveal`이 `domain/action-log/record.ts` `CORE_ACTION_TYPES`에 이미 있음.
- **UI-SPEC rev 9 ↔ 플랜:** 「지출결의 상태 → 1차」 P0~P6(06-04 `resolveExpenseActionRow` 단일 판정표) · SP-1~SP-7 · DR-4 제자리 확인(06-17/20) · DR-3 카드 전표 = 지출결의 한 종류(06-25) · DR-2 리저브 ≥1024(06-16 O-22) · H-3 막힌 행 재판정(06-15) · H-4 즉시 + 토스트 되돌리기(06-09/14) · M-7 계좌 없음 선택 가능(06-15/20) 일치. S16 취소 흐름만 어긋남(F-F3).
- **요구사항 커버리지:** ROADMAP Phase 6 10개 + EVID-01 카드 몫이 25 플랜 `requirements:`로 덮임. COVERAGE.md(외부 API 없음) 정확.
- **보안 · 정합:** 서버가 `ownerKind` 고정 · 행 재읽기 판정(06-16/25), 대기 결합 `올린 사람 = viewer` · 행 수 불일치 롤백(06-25), 계좌 키 부재 판정(06-20 O-17), 번호 노출 `scopeFor` 규칙(06-11/25), 금액은 `domain/money`만 · 서버 역산(06-03/05) · `expectedPayableKrw` + version 멱등(06-15) — 문제 없음.
- **VALIDATION.md:** `-t` 누락 한 건은 기록된 참고 그대로(악화 없음). 06-21 TOCTOU · 삭제 토스트 · 06-16 파일 표 재분할 — 기록된 참고 수준 그대로.

## Codex 재확인 필요
디자인 · 엔지니어링 교차 검토는 Codex 대신 Opus/Fable로 했다 — 한도 해제(≥ 2026-09-29) 뒤 Codex 재확인이 handoff대로 남아 있다.
