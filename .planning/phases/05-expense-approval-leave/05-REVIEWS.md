---
phase: 5
round: 4
sources:
  - code-drift-review.md (계획 ↔ main f3242c8 코드 대조, Opus 독립 조사 — 05-01 Task 1 ⓪ · ⓪-b 기준, 04.1 #90 · 결재선 단계 저장 #105 · 04.4 #91 · #106 · Phase 4 #104)
reviewers: [opus-code-drift]
prior_rounds:
  - "Round 1 — 1108e20 (ceo-review.md, 반영 완료: 각 플랜 Ledger `### Round 1 — 1108e20`)"
  - "Round 2 — 69fb7ea (eng-review.md, 반영 완료: 각 플랜 Ledger `### Round 2 — 69fb7ea`)"
  - "Round 3 — efd6c67 (design-review.md, 반영 완료: 각 플랜 Ledger `### Round 3 — efd6c67`)"
---

# Phase 5 — Reviews (Round 4: main 코드 대조)

> `/gsd-plan-phase 5 --reviews` Round 4 입력. 정본은 `code-drift-review.md`(파일:줄 근거 · name_map · premise_check 포함)이고 이 파일은 그 지적을 반영용 목록으로 옮긴 것이다(내용 추가 없음, 사용자 결정 Z1~Z3만 덧붙임).
> 계획(09-26) 뒤 main에 04.1 결재 모듈 · 결재선 단계 저장 · 04.4 · Phase 4 완료가 들어왔다. 중복 구현은 없고 Phase 4 완료분(`changeProjectStatus` · `loadStatusChangeFacts` · `projects.complete` · 번호 · 행동 로그 · 세율 · journal)은 계획 전제와 같다.
> Round 1~3 지적은 각 판의 이 파일에 있고 각 플랜 Ledger에 반영됐다.

## User Decisions (PR #89 issuecomment-5913942679, 사용자 결정 2026-09-30 「#89는 추천대로 해」)

- **Z1: A** (D1) — `ConflictState`에 선택 필드 `versionReason`을 더하고 `buildConflictMessage`가 상태 switch보다 먼저 `증빙을 바꿈`을 판정하도록 05-01 ④ 문장만 고친다(행 → 구조체 변환 `conflictMessageOf`가 `versionReason`을 넘김). ⓪-b E4는 「모양 차이」로 본다
- **Z2: A** (D2) — 05-01에 `DocumentSummary` 타입(`describeDocuments` 반환)을 두는 단계를 더하고, 결재함의 `LeaveSummary` 캐스트를 종류 중립으로 바꾼다. ⓪-b E5는 「모양 차이」로 본다
- **Z3: A** (D3) — 결재 시트는 `ui/`로 옮기지 않는다(`app/(app)/approvals/approval-sheet.tsx` 제자리). 결재 액션 연결만 prop으로 뺀다(05-01 Task 3 · 05-10). E7 import 감사 (마) 멈춤은 이동이 없으므로 사라진다
- 앞선 결정(U1 · U2 · `expenses.evidence_void` A · E1 A · E2 A · G1~G4 A · R1 A)은 그대로 전제
- 이 라운드의 ⓪-b 게이트 문장: Z1 · Z2로 E4 · E5는 「모양 차이 — 결정 반영됨」이므로 실행 때 ⓪-b가 이 두 줄 때문에 멈추지 않도록 05-01 ⓪-b 기대 문장을 실제 모양으로 고친다

## Consensus Summary

### HIGH (P1 — 이 라운드 반영)
- **D1** ⓪-b E4 — 충돌 문구 함수 입력이 인스턴스 행이 아니라 `ConflictState{status, round, actorName, at, attempted}`. 지금 `in_review` + `updated_by` = 기안자면 `…이 HH:MM에 승인함`이 되므로 증빙 갈래는 switch 앞에서. 수리: Z1 A. 영향: 05-01 ⓪-b · ④ · key_links(`conflict-message.ts`), `domain/approvals/index.ts`(`conflictMessageOf`)를 files_modified에
- **D2** ⓪-b E5 — `describeDocuments`가 `Map<string, object>`, 엔진은 `describeDeduction`에서 duck-typing, 결재함 `page.tsx`가 `as LeaveSummary`, 요약 전체가 `approval.value` 뒤. 수리: Z2 A — `kinds.ts`에 `DocumentSummary`(선택 `measure` 등) · `listMyInbox`가 `measureHeader` 계산 · 결재함 캐스트 종류 중립(D8과 함께). 영향: 05-01 E5 · 05-10
- **D3** E7 — 시트가 `DayNumbers`(leave) · `ConflictLine`(approvals) · `DAY_NUMBER_ROWS` 연차 분기를 가짐. 수리: Z3 A — 이동 없음, `useAction(approveAction)` 등 결재 액션만 콜백 prop으로, 두 번째 사용처 `app/(app)/home-approval-actions.tsx`(05-10)가 app 경로로 import. E7 must_haves · Task 3 ④ · acceptance · 05-10의 `ui/approval-sheet` 참조를 전부 고친다
- **D4** 착수 게이트 P-4 · P-5 — P-4는 머지 커밋 dc5a8fc로 통과(확인함). P-5는 `05-VALIDATION.md` `status: draft` — 실행 전 `/gsd-validate-phase 5`가 채운다(절차 그대로). 수리: P-5 설명에 이 라운드 P2 항목(결재함 중립화 · 연차 회귀 · 단계 저장 · 폰 Tab 순서)을 VALIDATION 행 후보로 적는다. 영향: 05-01 「선행 의존」

### MEDIUM (P2 — 이 라운드 반영)
- **D5** `canResubmit`이 `(viewer)`뿐이라 정산 결재의 settling 조건을 못 담음 — 수리(추천): 05-01 E 덧붙임에 선택 둘째 인자 `documentId`(연차는 무시). 영향: 05-01 · 05-11
- **D6** E2 — `approveDocument` 입력은 `{instanceId, expectedVersion}`, 트랜잭션 전엔 kind · documentId를 모름, (4)는 사건이 아니라 status `approved`. 수리: 05-01 ③에 「트랜잭션 전 `findApprovalGraphById`(또는 인스턴스만 읽는 함수)로 kind · documentId」 · 「훅 조건 = 계산된 status `approved`」. 영향: 05-01
- **D7** 결재 DTO 구조 값 / 값(`approval.value`) 축(04.1 2026-09-29 결정) — `approveBlockedReason` · `measureHeader`는 구조 키(`INBOX_ITEM_STRUCTURE_KEYS` 등)에 둔다. 영향: 05-01 E3 · E5
- **D8** 결재함 화면 · 확인 창 · 승인 토스트가 연차 전용(`page.tsx` 캐스트 · `decision-dialogs.tsx` 「연차 반려/회수」 · `withdrawLeaveAction` · `approve-toast.ts` 차감 일수만 · `inbox-table.tsx`의 `leave.module.css`) — 어느 플랜 files_modified에도 없음. 수리: 결재함 종류 중립화 작업 하나(문서 칸 · 부제 글자를 종류가 줌, 확인 창 제목 `{kindLabel} 반려/회수`, 회수 액션 종류 중립, 토스트 재료 종류 훅) + files_modified에 `decision-dialogs.tsx` · `approve-toast.ts` · `approvals/actions.ts`. 영향: 05-10(또는 05-01) · 05-09 · 05-11(토스트 `승인 · 최종 승인 · {프로젝트 번호} 완료`)
- **D9** 증빙 상세 행 갈래가 `loadKindDetails`(`index.ts:969` `{label, value, tone}` 재매핑)와 `page.tsx` `sheetRows`에서 잘림. 수리: 05-10 files_modified에 `domain/approvals/index.ts`, 갈래별 복사(evidence는 id · 이름 · 크기 · 형식), `sheetRows` 갈래 전달. 영향: 05-10
- **D10** E6 매핑 파일은 `app/(app)/leave/status-display.ts`(`RouteStepSource`에 `selfApproved` 없음, 프로젝트 화면도 import). 수리: 05-01 files_modified에 추가, `selfApproved` → `본인 승인`(success), name_map에 기록. 영향: 05-01
- **D11** 반려 사유 검증 함수가 없음(inline). 수리(추천): 05-09가 `validateRejectReason`을 `domain/approvals/index.ts`로 빼내 `rejectDocument` · `voidEvidence`가 같이 씀, files_modified에 추가. 영향: 05-09
- **D12** 결재선 「N단 저장」(#105, DECISIONS 2026-09-30 · SYSTEM §7-2 예외) — 단계 칸 단독 저장 거부. 수리: 05-03 · 05-11 설정 섹션 문장에 N단 저장, E2E 단언을 단계 저장 모양으로, 픽스처는 `upsertSimpleValue` · `saveRouteStepSettings`, UI-SPEC S13 한 줄. 영향: 05-03 · 05-11 · UI-SPEC
- **D13** 폰 제출 줄 · 폰 문서 행동 줄 순서(DECISIONS 2026-09-29 두 건: 2차 왼쪽 · 1차 오른쪽, DOM · Tab 같음, 사이 `--s-4` 이상) — UI-SPEC S3 폰 · S7 폰에 한 줄씩, 05-05 must_haves · E2E에 「폰 제출 줄 Tab 순서 2차 → 1차」, 문서 행동 줄은 04.1 `document-actions.tsx` 재사용 여부를 05-05가 정함. 영향: UI-SPEC · 05-05
- **D14** 첫 화면 → `domain/next-turn` → `listMyInbox` 간접 경로를 `document-kinds-import` 가드가 못 잡음 [ASSUMED]. 수리: 05-10 ④에 「`app/(app)/page.tsx`는 `@/app/(app)/document-kinds`를 import」 + acceptance grep. 영향: 05-10

### LOW (P3)
1. **D15** 05-02 read_first 줄 번호(SYSTEM §7-5 「839행~」 → 지금 860행) · DECISIONS 끝이 09-30 항목 — 절 이름 grep · 날짜는 실행일. 영향: 05-02
2. **D16** 복원 확인 표 `RESTORE_CHECK_TABLES`(04.4)에 Phase 5 새 표 없음 — 05-13 정리의 선택 항목으로. 영향: 05-13
3. **D17** 회수 뒤 다시 제출 문서의 옛 version 충돌 문구가 엔진 공통 `…이 HH:MM에 다시 신청함`(UI-SPEC 지출결의 낱말은 「다시 제출」) — 추천: 04.1 문구 재사용 원칙대로 그대로 두고 기록(새 사용자 결정 없음), 바꾸려면 종류 `label` 기반. 영향: 05-01 또는 UI-SPEC 「거부 — 동시 처리」
4. **D18** 05-11 ③ `listQuoteLines(viewer, revisionId, ctx: {status, canWrite, …})` ctx 필수 · 반환 `quoteAmountKrw` · `execution`. 영향: 05-11
5. **D19** `google-auth-library` 기존 사용처는 04.4 뒤 `lib/gcp/cloud-sql-admin.ts`(충돌 없음, 확인만). 영향: 05-12
6. **D20** 04.4 · 04.2 알림과 겹침 없음 — 조치 없음

## Divergent Views

- 없음. D17만 문구 선택 여지가 있고 추천(그대로)을 따른다
