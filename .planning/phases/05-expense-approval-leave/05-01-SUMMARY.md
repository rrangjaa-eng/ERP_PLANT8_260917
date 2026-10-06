---
phase: 05-expense-approval-leave
plan: 01
subsystem: approvals
tags: [approvals, drizzle, postgres, nextjs, migration]
status: complete
requires:
  - phase: 04.1-approvals-leave
    provides: "결재 엔진(registerDocumentKind · runTransition · 결재함 · 결재 시트 · 반려/회수 확인)"
  - phase: 04.6
    provides: "결재함 ListScreen · ui/table · StatusTag 표 · SidePanel 시트"
provides:
  - "E1 회수 뒤 다시 제출(resubmitFrom · nextStep allowResubmitFromWithdrawn · canResubmit(viewer, documentId?))"
  - "E2 최종 승인 훅 쌍(prepareFinalApproval 트랜잭션 전 · onFinalApprovalInTx 같은 트랜잭션)"
  - "E3 approveBlockedReason(구조 키, 이유 없으면 키 생략) + 시트 승인 막힘"
  - "E4 bumpInstanceVersion + version_reason('evidence') + 충돌 문구 「증빙을 바꿈」"
  - "E5 DocumentSummary(measure · documentText · number · finalApprovalNote) · InboxResult.measureHeader"
  - "E6 결재선 「본인 승인」 낱말(selfApproved → self_approved)"
  - "E7 결재 시트 onApprove 콜백 prop"
  - "D8 결재함 종류 중립(문서 칸 · 숫자 칸 Num · kindLabel 확인 창 제목 · withdrawAction · finalNote 토스트)"
affects: [05-03, 05-05, 05-09, 05-10, 05-11, 05-13]
plan_head_before: 51cece2bd3f8284063083556cf91ce89c7073e47
actuals:
  tokens: 61800
  tasks: 4
  commits: 7
tech-stack:
  added: []
  patterns:
    - "종류 정의 선택 필드로만 엔진 확장(04.1 기본 동작 불변)"
    - "구조 값 / 값 축 — 표시 전용 막힘 이유는 구조 키, 이유 없으면 키 생략"
key-files:
  created:
    - db/migrations/0024_white_guardsmen.sql
    - db/migrations/meta/0024_snapshot.json
    - test/integration/approvals-extensions.test.ts
    - test/unit/app/approve-toast.test.ts
    - docs/design/checks/2026-10-04-05-01-approval-extensions.md
  modified:
    - db/schema/approvals.ts
    - domain/approvals/{route,kinds,conflict-message,index,dto}.ts
    - repositories/approvals.ts
    - domain/leave/index.ts
    - app/(app)/leave/status-display.ts
    - ui/status-tag/status-map.ts
    - app/(app)/approvals/{page,inbox-table,approval-sheet,decision-dialogs,approve-toast,actions,actions.registry,list-columns}.ts(x)
    - app/(app)/leave/[id]/page.tsx
key-decisions:
  - "approveBlockedReason은 구조 키지만 null이면 키를 싣지 않는다 — 04.1 approvals-inbox-projection 정확 키 단언(고치지 않음)과 plan의 구조 키 요구를 함께 만족"
  - "0024 마이그레이션은 CHECK를 ADD COLUMN 안에 인라인(B-22 선례) — squawk constraint-missing-not-valid 회피"
  - "결재함 숫자 칸 필드 이름 = InboxRow.measure(서버가 그린 ReactNode), 머리글 prop = measureHeader"
requirements-completed: [EXP-02, EVID-01, UX-03]
visual_baseline_expected: [dev-components]
migration_manifest:
  - tag: 0024_white_guardsmen
    sql: db/migrations/0024_white_guardsmen.sql
    snapshot: db/migrations/meta/0024_snapshot.json
    journal: "db/migrations/meta/_journal.json idx 24 (추가 한 항목)"
    hand_edits: "1-3행 주석 · 4-6행 SET LOCAL lock_timeout/statement_timeout + breakpoint · 7행 CHECK를 ADD COLUMN 안으로 인라인(생성 원문 2문장 → 1문장). 재생성(05-13) 때 같은 손질을 다시 해야 squawk 통과"
name_map:
  registerDocumentKind: "같음 — domain/approvals/kinds.ts (index.ts 재export)"
  loadRouteConfig: "같음 () => Promise<RouteConfig>"
  href: "같음 (documentId) => string"
  describeDocuments: "같음 — 반환이 이제 Promise<Map<string, DocumentSummary>> (05-01 E5)"
  routeSettings: "같음(선택) RouteSettingDefs"
  canResubmit: "같음(선택) — 이제 (viewer, documentId?) => Promise<boolean> (05-01 E1/D5)"
  loadDetails: "같음(선택)"
  detailDto: "같음(선택) DetailDtoSpec"
  buildDetailRows: "같음(선택, 메서드)"
  prepareSubmission: "같음 (viewer, {kind, drafterId}, deps?) — domain/approvals/index.ts"
  submitDocument: "같음 (viewer, prepared, {documentId}, tx, deps?)"
  approveDocument: "같음 (viewer, {instanceId, expectedVersion}, deps?) — 자기 withTransaction"
  rejectDocument: "같음 (viewer, {instanceId, expectedVersion, reason}, deps?)"
  withdrawDocument: "같음 (viewer, {instanceId, expectedVersion}, deps?)"
  resubmitDocument: "같음 (viewer, prepared, {instanceId, expectedVersion}, tx, deps?)"
  listMyInbox: "listMyInbox(viewer, deps?) — withDetails는 ApprovalDeps 필드, 결과에 measureHeader 추가"
  getApprovalView: "같음 (viewer, {kind, documentId}, deps?) → ApprovalView | null"
  previewRoute: "같음 (viewer, {kind}, deps?)"
  ApprovalConflictError: "같음"
  NotCurrentHolderError: "같음"
  isApprovalParty: "같음 — domain/approvals/conflict-message.ts"
  conflict_message_builder: "buildConflictMessage(state: ConflictState) + 비공개 conflictMessageOf(index.ts); ConflictState.versionReason 추가"
  updateInstanceStatus: "같음 (viewer, {id, expectedVersion, status, currentRound?}, tx) — repositories/approvals.ts, versionReason null로 지움"
  loadActionLogGate: "같음 — domain/approvals/tx-log.ts"
  recordActionInTx: "같음 — domain/approvals/tx-log.ts"
  getSimpleSettingValues: "같음 — domain/settings/registry.ts"
  findSimpleValues: "같음 (viewer, keys, tx?) — repositories/settings.ts"
  seoulToday: "같음 lib/dates.ts (now?)"
  journal_guard_test: "test/unit/db/migration-journal.test.ts"
  status_word_mapping: "app/(app)/leave/status-display.ts — stepStatusKey · leaveStatusDisplay · leaveStatusWord · routeListSteps (04.6-18 판)"
  approval_sheet: "app/(app)/approvals/approval-sheet.tsx (+ .module.css) — ApprovalSheet, 이제 onApprove prop"
  inbox_table: "app/(app)/approvals/inbox-table.tsx — InboxTable, 이제 measureHeader prop"
  kind_registration: "app/(app)/document-kinds.ts — import \"@/domain/leave\" 한 줄"
  reject_reason_validator: "없음 · 05-09가 만듦 (지금은 rejectDocument inline 검증 + 상수 셋 + RejectReasonError)"
  decision_dialogs: "app/(app)/approvals/decision-dialogs.tsx — RejectDialog · WithdrawDialog, DecisionTarget.kindLabel 추가"
  withdraw_action_neutral: "app/(app)/approvals/actions.ts withdrawAction (신규)"
premise_check:
  E1: "같음 — resubmitDocument는 rejected에서만 · 차수 +1 · 같은 인스턴스, nextStep 종결 표 RESEARCH와 같음"
  E2: "같음 — 입력 {instanceId, expectedVersion}, readTransitionPre는 인스턴스를 읽지 않음, runTransition (1)~(7)에서 (4) nextStep approve_final → approved, 단계 기록이 로그보다 먼저"
  E3: "같음 — getApprovalView · listMyInbox가 viewer 담당(isCandidate · mine)을 가름"
  E4: "같음 — updateInstanceStatus version 조건부 UPDATE, buildConflictMessage(ConflictState) + 비공개 conflictMessageOf 한 곳"
  E5: "같음(04.6 뒤 다시 씀 — P-8 Round 6 da11cfa6에서 미리 씀) — Map<string, object> · describeDeduction duck-typing · page.tsx LeaveSummary 캐스트 · 요약 approval.value 뒤"
  E6: "같음(04.6 뒤 다시 씀 — Round 6) — routeListSteps/stepStatusKey/leaveStatusDisplay/leaveStatusWord 한 파일, RouteStepSource에 selfApproved 없음"
  E7: "같음(04.6 뒤 다시 씀 — Round 6) — 시트 한 파일, 시트 안 결재 액션 연결은 approveAction 한 곳"
coverage:
  - id: D1
    description: "E1 회수 뒤 다시 제출 · E2 최종 승인 훅(트랜잭션 전 prepare · 같은 트랜잭션 inTx · 롤백) · E4 증빙 version bump"
    requirement: EXP-02
    verification:
      - kind: integration
        ref: "test/integration/approvals-extensions.test.ts + tx-safety.test.ts (풀 2 · 동시 훅 최종 승인 셋)"
        status: pass
      - kind: unit
        ref: "test/unit/domain/approvals/{next-step,document-kind-registry,conflict-message}.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "version_reason 열 마이그레이션 0024(squawk 0)"
    requirement: EVID-01
    verification:
      - kind: other
        ref: "pnpm db:generate(No schema changes) · pnpm lint:sql · test/unit/db"
        status: pass
    human_judgment: false
  - id: D3
    description: "E3 · E5 · E6 엔진 표시 덧붙임(막힘 이유 구조 키 · DocumentSummary · measureHeader · finalNote · 본인 승인)"
    requirement: UX-03
    verification:
      - kind: integration
        ref: "test/integration/approvals-extensions.test.ts#표시 덧붙임 — E3 · E5 · E6 · approvals-inbox-projection · leak-scan"
        status: pass
      - kind: unit
        ref: "test/unit/app/leave-status-display.test.ts · test/unit/ui/status-map.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "결재함 종류 중립화 · 시트 onApprove · 시트 승인 막힘 · withdrawAction · 토스트 꼬리(연차 화면 글자 불변)"
    requirement: UX-03
    verification:
      - kind: unit
        ref: "test/unit/app/approve-toast.test.ts · approval-action-ids.test.ts · approvals-inbox-structure-only.test.ts"
        status: pass
      - kind: e2e
        ref: "CI=true playwright --no-deps desktop+mobile-375: leave-approval · mobile-leave-approval · leave-document (32 passed)"
        status: pass
    human_judgment: true
    rationale: "화면 플랜 — 웨이브 독립 DOM 감사(320 · 390 · 1280)와 /design-review가 판정"
duration: 59min
completed: 2026-10-04
---

# Phase 5 Plan 01: 결재 엔진 덧붙임 E1~E7 · 결재함 종류 중립화 Summary

**04.1 결재 엔진에 종류 선택 필드 일곱 가지(회수 뒤 다시 제출 · 최종 승인 훅 쌍 · 승인 막힘 이유 · 증빙 version bump · DocumentSummary/measureHeader · 본인 승인 · 시트 콜백)를 기본 동작 불변으로 붙이고, 결재함 · 확인 창 · 토스트를 연차 전용에서 종류 중립으로 바꿨다(연차 화면 글자 불변).**

## Performance
- Started 2026-10-04T07:13:39Z · Completed 2026-10-04T08:12:31Z · Tasks 4 · Files 33

## Task Commits
1. Task 1 (E1 · E2 · E4 엔진) — `f58c2148` test(RED) · `32978100` feat
2. Task 2 (마이그레이션 squawk 마무리) — `b6b08cee` chore
3. Task 3 (E3 · E5 · E6 표시 엔진) — `126bd251` test(RED) · `038d51f6` feat
4. Task 4 (화면 · 액션) — `5729ad0c` test(RED) · `c373e2cf` feat

### `git show --name-only`
- `32978100`: db/migrations/0024_white_guardsmen.sql, meta/0024_snapshot.json, meta/_journal.json, db/schema/approvals.ts, domain/approvals/{conflict-message,index,kinds,route}.ts, domain/leave/index.ts, repositories/approvals.ts, test/integration/approvals-extensions.test.ts
- `b6b08cee`: db/migrations/0024_white_guardsmen.sql
- `038d51f6`: app/(app)/leave/status-display.ts, docs/design/checks/2026-10-04-05-01-approval-extensions.md, domain/approvals/{dto,index,kinds}.ts, domain/leave/index.ts, test/integration/approvals-extensions.test.ts, ui/status-tag/status-map.ts
- `c373e2cf` (W1 경계 — 엔진 · DTO 파일 없음): app/(app)/approvals/{actions.registry,actions,approve-toast,list-columns}.ts, app/(app)/approvals/{approval-sheet,decision-dialogs,inbox-table,page}.tsx, app/(app)/leave/[id]/page.tsx, docs/design/checks/2026-10-04-05-01-approval-extensions.md, test/unit/app/approvals-inbox-structure-only.test.ts

## approveDocument 호출 위치(Round 4 D6)
| 자리 | 호출 |
|---|---|
| `withTransaction` 앞 | `readTransitionPre` · `findApprovalGraphById(viewer, instanceId)`(풀) · `finalHook.prepare`(= `prepareFinalApproval`) |
| 콜백 안 | `runTransition` → `findApprovalGraphById(tx)` · `updateInstanceStatus` · `recordStepAction`/`insertFallbackStep` · `finalHook.inTx`(= `onFinalApprovalInTx`, status === approved일 때 단계 기록 뒤) · `recordActionInTx` |

콜백 안에 `prepareFinalApproval` 없음. `canResubmit` 인용: `if (canResubmit && (await canResubmit(viewer, instance.documentId))) actions.push("resubmit");`

## 마이그레이션 손질(생성 원문 → 커밋본)
```
- ALTER TABLE "approval_instances" ADD COLUMN "version_reason" text;--> statement-breakpoint
- ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_version_reason_check" CHECK (...);
+ -- 주석 3행(B-22 선례)
+ SET LOCAL lock_timeout = '1s';
+ SET LOCAL statement_timeout = '5s';
+ --> statement-breakpoint
+ ALTER TABLE "approval_instances" ADD COLUMN "version_reason" text CONSTRAINT "approval_instances_version_reason_check" CHECK ("version_reason" IS NULL OR "version_reason" IN ('evidence'));
```

## 04.1 테스트 diff
- `approvals-inbox-projection.test.ts` diff 0 · `leave-status-display.test.ts` 덧붙임만 · `approval-action-ids.test.ts` · `approval-actions-after-commit.test.ts` 제거 줄 0
- `approvals-inbox-structure-only.test.ts` 한 줄(목 팩토리):
  `-vi.mock("@/app/(app)/approvals/actions", () => ({ approveAction: () => undefined, rejectAction: () => undefined }));`
  `+vi.mock("@/app/(app)/approvals/actions", () => ({ approveAction: () => undefined, rejectAction: () => undefined, withdrawAction: () => undefined }));`
- `status-map.test.ts` 한 줄(plan 지시 — success 목록에 `본인 승인`)

## Deviations from Plan
1. **[Rule 3] `canResubmit: (viewer) => canWriteLeave(viewer)` 감쌈** — `canWriteLeave(viewer, deps?)`가 새 둘째 인자(documentId)와 타입이 맞지 않아 tsc 실패. `domain/leave/index.ts` · `32978100`.
2. **[Rule 3] 0024 SQL에서 CHECK를 ADD COLUMN 안으로 인라인 + 주석** — plan이 허용한 손질은 SET LOCAL 블록뿐이었지만 squawk constraint-missing-not-valid가 별도 ADD CONSTRAINT를 거부. 0013 · 0014 선례(B-22). `db:generate` "No schema changes", DB 제약 이름 = 스냅숏. `b6b08cee`.
3. **[Rule 1] approveBlockedReason null이면 키 생략** — 구조 키로 늘 실으면 04.1 `approvals-inbox-projection`의 정확 키 단언이 깨지는데, plan은 그 파일 diff 0을 요구. `withoutNullReason`으로 이유 있을 때만 키를 싣고, 투영 타입은 `approveBlockedReason?: string`. 새 통합 사례 단언은 `not.toHaveProperty`로 맞춤. `038d51f6`.
4. **[Rule 1] 통합 사례 픽스처 격리** — 「둘 다 measure 없음 → null」 사례가 같은 기획1팀의 앞 사례 금액 문서를 봐서 실패. 전용 본부 · 팀(`orgInOwnTeam`)으로 바꿈(단언 불변). `038d51f6`.
5. **E2E 명령** — plan 명령 그대로면 CI=true에서 프로젝트 의존(visual → desktop → mobile-375)이 955개 전체를 끌어온다. `--no-deps --project=desktop --project=mobile-375`로 세 스펙(32개)만 돌림.

## Notes for later plans
- 연차 폴더의 `withdrawLeaveAction`(+등록)은 화면에서 쓰임이 사라졌다 — 04.1 `approval-action-ids.test.ts`가 계속 부르므로 남김(§3.3 언급만).
- 결재함 PC 행 `승인` 막힘 모양은 05-10 `rowApprovalActions` 소유 · 문서 화면 `DocumentActions` 막힘 prop은 05-11 Task 3 ②.
- `measure: null` 셀(`—`) · null 머리글(열 없음) 단언은 05-11이 처음 만든다.
- 05-13 마이그레이션 재생성 시 0024 손질(인라인 CHECK) 다시 필요.

## TDD Gate Compliance
RED 증거 6건 모두 `RED_EVIDENCE_OK`(t1-unit · t1-int · t3-unit · t3-int · t4-unit · t4-ids), 각 RED 커밋이 GREEN 커밋보다 앞섬.

## Verification (마지막 실행)
- unit `test/unit/app test/unit/domain/approvals` 304/304 · Task 3 unit 202/202
- integration approvals-extensions · inbox-projection · lifecycle · leak-scan 2130/2130
- lint · typecheck · lint:sql · mark-legacy --audit(approvals · leave) · build rc=0
- CI=true E2E leave-approval · mobile-leave-approval · leave-document 32 passed

## Self-Check: PASSED
