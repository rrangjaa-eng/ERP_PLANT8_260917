# 04.1 수정 회차 2 — Codex 1회차 지적 반영 (공통 브리프)

Mode: revision (surgeon). Contract: .claude/gsd-core/references/planner-revision.md. Shared definitions D1–D6: common.md (same folder). Cross decisions X-1..X-4: tests-01-and-open-notes.md.
Findings: codex-round1-A.md / -B.md / -C.md; first-pass triage with quotes + suggested fixes: codex-round1-triage.md. R04 (shard A) is EVIDENCE-MISMATCH → do nothing. N1 ALREADY-HANDLED → nothing.

RULES
1. Edit ONLY your assigned plan files. Other planners edit the others in parallel. No VALIDATION.md, UI-SPEC, STATE.md, ROADMAP, hooks, source code. No commits/pushes.
2. Minimal fix per finding; tag inline `(CX-<id>)`, e.g. (CX-B1). Every behavior change gets a concrete test case in <behavior> (TDD RED→GREEN), no wall-clock dependence (inject deps.now / seoulToday).
3. UI usability principle: minimal guidance text (only errors/irreversible/locked, one line); minimal user decisions (defaults, hide/disable impossible options, undo over confirm). Don't add new copy unless needed; new strings go in your return as "UI-SPEC notes".
4. No new deps, no `any`, pnpm only. Migration rule: no reserved ranges; regenerate right before merge.

LOCKED CROSS-PLAN INTERFACES (orchestrator decision — use exactly these names)
- CX-R01: 04.1-01's standalone D1 test asserts "no name / no HH:MM" ONLY for the unrelated PM; for the drafter it asserts only that the error is `ApprovalConflictError` (no text assertion). The detailed text is asserted in 04.1-02.
- CX-B1: the shared transition's terminal-state check (04.1-02 ② (2)) is event-aware: `approved` / `withdrawn` are terminal for every event; `rejected` is terminal for every event EXCEPT `resubmit` by the drafter (nextStep("rejected","resubmit") is the only allowed transition out). 04.1-01 line ~302 must state the same rule. Test: drafter resubmit from rejected with current version succeeds; approve/reject/withdraw on rejected → terminal-state handling (관련자 → `반려됨 · 새로 고침`-style state text, others → not_holder).
- CX-B2: 04.1-03's balance-for-requests read takes `deps: { now?: Date }` (defaults to real clock only at the top-level entry); 04.1-05's `loadDetails(ids, { visible, now })` forwards `now`, and `listMyInbox`/`getApprovalView` pass their `deps.now` down. Test: inbox detail balance with injected now = fixed date equals the value computed for that date.
- CX-R2: 04.1-03 adds domain read `listLeaveAdjustmentsForUser(viewer, { userId, fiscalYear })` in domain/leave returning `LeaveAdjustmentDTO[]` (projected fields only: id, kind, quarters, reason, createdAt, createdByName) with the same permission check as adding an adjustment (admin leave write); registered with the leak-scan generator. 04.1-06 page calls only this (never repositories/).
- CX-R3: 04.1-01's `previewRoute` returns `RoutePreviewDTO` — approver names only when the viewer passes the `approval.value` visibility projection (same projection as the inbox/detail DTOs); otherwise steps carry role/seat labels only. 04.1-06 renders `RoutePreviewDTO`. Registered with the leak-scan generator. Test in 01 (projection on/off) and 06 E2E uses the DTO.

Return (≤50 lines): `## REVISION COMPLETE`, table (plan · change · CX-id), `### New or changed test cases` (file · case, one line each), `### UI-SPEC notes`, `### Cross-plan notes` (only if something beyond the locked interfaces is needed).

## 회차 2 결과 메모 — 01·03 (완료)
- 새 이름: previewRoute → RoutePreviewDTO(01 소유, registerDto routePreview/routePreviewStep) · listLeaveAdjustmentsForUser → LeaveAdjustmentDTO(03) · 잔고 읽기 4개 deps?.now
- UI-SPEC 메모: approval.value 숨김이면 S2 결재선 줄은 계급 이름만(예 `팀장 → 경영관리 → 대표 · 결재 규칙`) — UI-SPEC 209줄 한 줄 반영(디자인 리뷰 때)
- 월차 조정은 유효 기간이 겹치는 모든 연도에, 연차 조정은 그 fiscalYear에만 보인다(03 플래너 판단)

## 회차 2 결과 메모 — 02·04·05 (완료)
- CX-B1 종결 판정은 (상태, 사건, 기안자 여부) 표 하나 · 반려 문서 관련자 문구는 UI-SPEC 205줄 `{이름}이/가 HH:MM에 반려함 · 새로 고침` 재사용
- CX-W1 종류 등록 선택 칸 `canResubmit` (연차 = canWriteLeave) · CX-W2 결재선 설정의 쓸 수 없는 칸은 disabled(값 보존) · CX-W3 playwright --list 결과를 먼저 담고 grep
- UI-SPEC 메모: S8 `조직 범위가 특정 부서일 때만` 도움말 삭제(비활성으로 대체) — 키 정의는 01에서 삭제

## 회차 2 결과 메모 — 06·07 (완료) + 판단
- 07 CX-R1: `merge-base --is-ancestor`로 UP_TO_DATE 판정 → 이미 최신이면 merge 없이 삭제 커밋 하나 뒤 재생성 · verify #5는 MAIN_SHA 기준 · CX-R10 db:generate 종료 코드 확인
- 06 CX-R3 previewRoute 정의 삭제(01 소유) · R4 Next 16 서버 액션 순차 전송 보장 채택(가드 코드 없음, E2E로 단언) · R5 쓰기 권한 없으면 연차 신청 버튼 없음, 월차 조정 불가 시 비활성 · R6 `{Y-1} 회계연도`/`올해 보기` 링크 · R8 `onStableSeoulDay` · R9 섹션 전용 로딩 없음
- 판단(오케스트레이터): 조정 기록 읽기는 **보기 권한**(브리프의 쓰기 권한은 잘못 — 보기 전용 관리자도 기록을 본다). 추가 폼만 쓰기 권한

## 회차 3 — 마지막 전체 Codex(codex-final-A/B/C.md) 판정 (오케스트레이터)
- 막는 문제 3 모두 인정: A-F01(미리보기 픽스처 role.value 노출 행) · B-F01(기안자 = 지금 담당) · B-F02=C-F01(신청 DTO는 정수 쿼터)
- **B-F01 결정**: 기안자가 지금 담당이기도 하면 서버 가능 행동 = 합집합에서 `승인`(1차) + `회수`(2차). 기안자에게 `반려`는 주지 않는다(회수가 같은 목적 — 결정 최소화). 화면은 서버 목록을 그대로 그린다. 통합·E2E 사례: 팀장 본인 승인 · 대표 폴백 기안자.
- 경고 반영: B-F03(잔고 행은 진행 중 문서만) · A-F02=C-F04(01·03 마이그레이션 검증도 db:generate 종료 코드) · A-F04(로그 must_have를 설정 게이트와 일치) · C-F02(VALIDATION 월차 「숨김」) · C-F05(06 태스크 순서) · C-F06(보기 전용 E2E에 leave.value 노출 명시)
- 남김: B-F04(설정 화면 보기 전용 편집 컨트롤 — 기존 화면 전체의 선행 문제, 04.1 범위 밖 · 별도 기록) · A-F03=C-F03 · B-F05(UI-SPEC 옛 문구 — /plan-design-review 때 반영)
