# Phase 5 계획 ↔ main(f3242c8) 어긋남 조사

- 조사 범위: `.planning/phases/05-expense-approval-leave/` 05-01~05-15-PLAN · 05-UI-SPEC · 05-RESEARCH ↔ 작업 트리(origin/main f3242c8을 머지했고 아직 커밋하지 않음)
- 방법: 읽기만 했다(grep을 먼저 돌리고 필요한 범위만 읽음). 파일은 하나도 고치지 않았다. [ASSUMED] 표시가 없는 줄은 코드에서 직접 확인했다.

## 요약

| 등급 | 수 | 한 줄 |
|---|---|---|
| **P1 막는 문제** | **4** | ⓪-b 전제 E4·E5가 「다름」이라 05-01 게이트에서 멈춤 · E7 이동 감사가 (마)에 걸려 Task 3에서 멈춤 · 착수 게이트 P-4·P-5가 지금 실패 |
| P2 권장 | 10 | `canResubmit` 시그니처 · E2 트랜잭션 전 읽기 · DTO 구조/값 축 · 결재함 화면이 연차 전용 · 상세 행 갈래 · E6 파일 위치 · 사유 검증 함수 없음 · #105 단계 저장 · 폰 버튼 순서 · document-kinds import |
| P3 사소 | 6 | 줄 번호 참조 · 복원 확인 표 · 문구 낱말 · `listQuoteLines` ctx 등 |

중복 구현은 없다. `expenses` · `files` · `upload_intents` · `settlement_approvals` 표, `lib/gcp/storage.ts`, `domain/expenses|evidence|settlements|next-turn` 가운데 main에 있는 것은 하나도 없다. `app/(app)/expenses/page.tsx`는 빈 목록을 보여 주는 자리 표시 화면이고, `linkedDocumentsByLine`은 빈 결과를 돌려주는 stub다. 계획도 둘 다 이 상태를 전제하고 있어 어긋나지 않는다.

---

## P1 — 막는 문제

### [P1] D1 — ⓪-b E4 「다름」: 충돌 문구 조립 함수가 인스턴스 행이 아니라 요약 구조체를 받는다
- **어긋남**: 계획은 「충돌 문구 조립 함수가 인스턴스 행을 받는다」고 전제하고, 거기에 `version_reason` 갈래 하나를 더하려 한다. 실제 `buildConflictMessage(state: ConflictState)`는 `{status, round, actorName, at, attempted}`만 받는다. 인스턴스 행(graph)을 받아 이 구조체로 바꾸는 일은 `index.ts`의 비공개 함수 `conflictMessageOf`가 한다. 또 지금은 `in_review` 상태에서 `updated_by`가 기안자면 문구가 `…이 HH:MM에 승인함`이 된다. 그래서 증빙 갈래는 상태 switch보다 **먼저** 판정해야 한다.
- **계획 위치**: 05-01-PLAN.md:223(E4 전제) · :231(④ 「인스턴스 `version_reason`이 evidence이면」) · :84-86(key_link `conflict-message.ts → versionReason`)
- **main 근거**: domain/approvals/conflict-message.ts:23-32 · :37-38(in_review → 「승인함」) · domain/approvals/index.ts:390-404(`conflictMessageOf`)
- **고칠 모양**: `ConflictState`에 선택 필드 `versionReason?: "evidence" | null`을 더한다. `conflictMessageOf`가 `graph.instance.versionReason`을 넘기고, `buildConflictMessage`는 switch 앞에서 `versionReason === "evidence"`면 `증빙을 바꿈`을 돌려준다. 05-01 ④ 문장을 「조립 함수 입력 구조체 + 변환 함수 두 곳」으로 고친다. 기존 `conflict-message.test.ts` 사례는 선택 필드라 그대로 통과한다.
- **사용자 결정 필요**: 예. ⓪-b 규칙대로라면 `/gsd-plan-phase 5 --reviews`까지 가야 하기 때문이다.
  - (A) 모양 차이로 보고 05-01 ④ 문구만 고친다 — **추천**. 이유: 뜻(version 하나로 막기 · 관련자에게만 상세 문구)은 같고, 입력 구조만 달라 선택 필드 하나로 흡수된다.
  - (B) 규칙대로 멈추고 05-01·05-03·05-11을 다시 점검한다.

### [P1] D2 — ⓪-b E5 「다름」: 요약 DTO에 타입이 없고, 결재함 화면이 연차 모양으로 캐스트한다
- **어긋남**: 계획은 `describeDocuments` 요약 DTO에 선택 `measure`를 더하고 `listMyInbox`가 `measureHeader`를 정한다고 전제한다. 실제로는 이렇다.
  - 요약 타입은 `Map<string, object>`이고, 종류가 `project()`한 결과 그대로다.
  - 엔진 쪽 요약 타입이 없다. 엔진은 `describeDeduction`에서 `daysQuarters`·`days`를 duck-typing으로 읽는다.
  - 결재함 화면은 `summary`를 `LeaveSummary`로 캐스트해서 기간 · 일수 · 번호를 그린다.
  - 요약 전체가 `approval.value` 정보 항목 뒤에 있다.
- **계획 위치**: 05-01-PLAN.md:223(E5) · :52(must_haves `measure` · `measureHeader`) · 05-RESEARCH.md:251 · 05-10-PLAN.md:146 · :174
- **main 근거**: domain/approvals/kinds.ts:53(`describeDocuments … Promise<Map<string, object>>`) · domain/approvals/dto.ts:43(`summary: object | null`) · :59-72(summary는 approval.value) · domain/approvals/index.ts:575-581(`describeDeduction` duck-typing) · app/(app)/approvals/page.tsx:24 · :67-78(`as LeaveSummary`, `days: summary.days`)
- **고칠 모양**: 05-01에서 `kinds.ts`에 `DocumentSummary = object & { measure?: … }` 타입을 두고 `describeDocuments` 반환 타입을 좁힌다. `listMyInbox`가 `measure`에서 `measureHeader`를 계산한다. 결재함 `page.tsx`의 연차 캐스트는 D8(P2)과 함께 종류 중립으로 바꾼다.
- **사용자 결정 필요**: 예(D1과 같은 게이트 규칙).
  - (A) 모양 차이로 보고 05-01 E5 문장에 「요약 타입 신설」을 더한다 — **추천**. 이유: 엔진이 이미 요약을 duck-typing으로 읽고 있어서, 타입을 하나 두는 것이 가장 작은 변경이다.
  - (B) 멈추고 다시 계획한다.

### [P1] D3 — E7 이동 전 import 감사가 (마)에 걸려 05-01 Task 3 ④가 멈춘다
- **어긋남**: 결재 시트가 app 전용 컴포넌트 둘을 import한다.
  - `DayNumbers`(`@/app/(app)/leave/day-numbers`, `leave.module.css`를 씀)
  - `ConflictLine`(`./conflict-line`, `inbox-table.module.css`를 씀)
  - 계획 규칙 (마)는 「app 전용 컴포넌트 → 코드 변경 없이 멈춤」이다.
  - 시트는 `DAY_NUMBER_ROWS = new Set(["잔고","일수"])`라는 연차 라벨 분기도 갖고 있다. 계획이 전제한 「시트는 문서 종류를 모른다」와 다르다.
  - 서버 액션 `approveAction`은 시트 안에서 `useAction`으로 부른다. 이것은 (나)라서 옮길 수 있다.
- **계획 위치**: 05-01-PLAN.md:320(Task 3 ④ ⓪ 감사 규칙) · :48(must_haves E7) · 05-10-PLAN.md:147(`ui/approval-sheet` 사용)
- **main 근거**: app/(app)/approvals/approval-sheet.tsx:8-11(import) · :42(`DAY_NUMBER_ROWS`) · :59(`useAction(approveAction)`) · :172 · :185 · app/(app)/approvals/conflict-line.tsx:5(inbox-table.module.css)
- **고칠 모양**: 둘 중 하나를 고른다.
  - (가) `ui/`로 옮기지 않는다. 두 번째 사용처인 `app/(app)/home-approval-actions.tsx`(05-10)도 app 계층이라 `app/(app)/approvals/approval-sheet`를 그대로 import하면 된다. E7은 「시트 경로 그대로, 결재 액션 연결만 prop으로」로 줄인다.
  - (나) `ConflictLine`·`DayNumbers`를 먼저 `ui/`로 옮기는 단계를 05-01에 더한다(css 분리 포함). 「잔고·일수」 분기는 행 tone이나 표시 플래그로 바꾼다.
- **사용자 결정 필요**: 예.
  - (가) 이동하지 않는다 — **추천**. 이유: 사용처가 둘 다 app이라 ui 이동이 풀어 주는 문제가 없고(§3.2 단순함), (마) 멈춤도 사라진다.
  - (나) ui로 옮긴다. 이유: 결재 시트를 다른 계층에서도 쓰게 된다면 필요하다.

### [P1] D4 — 착수 게이트 P-4·P-5가 지금 실패한다
- **어긋남**:
  - P-4 `git merge-base --is-ancestor origin/main HEAD`의 종료 코드가 1이다. main을 머지했지만 아직 커밋하지 않았기 때문이다. 머지 커밋을 만들면 통과할 것으로 본다 [ASSUMED].
  - P-5 `05-VALIDATION.md`가 `status: draft`다. `/gsd-validate-phase 5`를 아직 돌리지 않았다.
  - P-1(파일 여섯 개 존재) · P-2(SUMMARY 7) · P-3(Phase 4 PLAN 44 = SUMMARY 44)는 통과한다.
- **계획 위치**: 05-01-PLAN.md:128-134(P-1~P-5 표)
- **main 근거**: `.planning/phases/05-expense-approval-leave/05-VALIDATION.md:6`(`status: draft`), 게이트 명령 실행 결과
- **고칠 모양**: 머지 커밋을 만든 뒤 `/gsd-validate-phase 5`를 돌린다. 이 보고서의 P2 항목(연차 회귀 · 결재함 중립화 등)을 VALIDATION 행에 반영한다.
- **사용자 결정 필요**: 아니오. 절차만 밟으면 된다.

---

## P2 — 권장

### [P2] D5 — `canResubmit` 시그니처가 `(viewer)` 하나라서 정산 결재의 「프로젝트 상태 settling」 조건을 담을 수 없다
- **어긋남**: 05-11은 `canResubmit: 프로젝트 쓰기 권리 ∧ 프로젝트 상태 settling`을 요구한다. 실제 선택 필드는 `(viewer) => Promise<boolean>`라서 문서 id를 받지 못한다. 결국 어느 프로젝트인지 모른다.
- **계획 위치**: 05-11-PLAN.md:169(③ `canResubmit`) · 05-RESEARCH.md:255
- **main 근거**: domain/approvals/kinds.ts:57 · domain/approvals/index.ts:863(`canResubmit(viewer)`)
- **고칠 모양**: 05-01 덧붙임에 「`canResubmit`에 선택 둘째 인자 `documentId`」 한 줄을 더한다(연차는 무시하므로 호환된다). 다른 길은 05-11에서 `canResubmit`을 쓰기 권리만으로 두고, settling 조건은 `submitSettlement`에서만 거르는 것이다.
- **사용자 결정 필요**: 아니오(둘 다 계획 재량). 추천은 선택 인자다. 이유: 문서 화면의 `다시 올리기` 표시와 서버 판정이 같은 곳에서 나온다.

### [P2] D6 — E2: `approveDocument`는 트랜잭션 전에 종류와 문서 id를 모른다
- **어긋남**: 05-01 ③은 「트랜잭션 전에 종류의 `prepareFinalApproval(viewer, documentId)`를 부른다」고 쓴다. 실제 `approveDocument` 입력은 `{instanceId, expectedVersion}`뿐이다. 트랜잭션 전 읽기(`readTransitionPre`)도 스냅숏 · 로그 게이트 · 노출 메모만 읽고, 인스턴스는 트랜잭션 안에서 처음 읽는다. 또 (4)는 사건 `approve_final`을 돌려주지 않고 `status`(=`approved`)를 돌려준다. 순서 (1)~(7)과 「단계 기록이 로그보다 먼저」는 같다. 그래서 ⓪-b 판정은 「같음」이다(아래 표).
- **계획 위치**: 05-01-PLAN.md:233(③)
- **main 근거**: domain/approvals/index.ts:583-591 · :546-553(`readTransitionPre`) · :621(`nextStep(…, final ? "approve_final" : "approve")` → status만) · :522-540(runTransition (5)~(7))
- **고칠 모양**: ③에 두 가지를 적는다. 첫째, 「트랜잭션 전 풀로 `findApprovalGraphById`(또는 인스턴스만 읽는 함수)를 한 번 불러 kind·documentId를 얻는다」. 둘째, 「훅 호출 조건 = 계산된 status가 `approved`」.
- **사용자 결정 필요**: 아니오.

### [P2] D7 — 결재 DTO 「구조 값 / 값(approval.value)」 축(2026-09-29 A)과 새 필드의 자리
- **어긋남**: 계획을 쓴 뒤 04.1에서 결정이 나왔다. 구조 값(id · 상태 · version · 가능 행동)은 투영 밖에 붙이고, 이름 · 요약 따위만 `approval.value` 뒤에 둔다. 계획이 더하는 `approveBlockedReason` · `measureHeader`는 어느 축인지 정하지 않았다. 값 축에 넣으면 `approval.value`를 끈 계급에서 이유 글자가 사라진다. 그러면 `승인`이 켜진 것처럼 보이고, 누르면 서버가 롤백한다.
- **계획 위치**: 05-01-PLAN.md:51(E3 must_haves) · :52(E5)
- **main 근거**: domain/approvals/dto.ts:7-9(결정 주석) · :54(`INBOX_ITEM_STRUCTURE_KEYS`) · :96-116(ApprovalView 구조/값)
- **고칠 모양**: `approveBlockedReason`은 구조 키에, `measureHeader`는 구조 키(종류에서 정해지는 머리글)에 둔다고 05-01 E3·E5에 적는다.
- **사용자 결정 필요**: 아니오. 04.1 결정을 그대로 따르면 된다.

### [P2] D8 — 결재함 화면 · 확인 창 · 승인 토스트가 연차 전용인데, 어느 플랜의 files_modified에도 없다
- **어긋남**:
  - `page.tsx`가 요약을 `LeaveSummary`로 캐스트한다. 문서 칸 · 일수 칸 · 반려/회수 부제를 연차 기간으로 만든다.
  - `decision-dialogs.tsx` 제목이 `"연차 반려"` · `"연차 회수"`로 고정돼 있고 `withdrawLeaveAction`을 import한다.
  - `approve-toast.ts`는 차감 일수만 안다. 05-11이 요구하는 `승인 · 최종 승인 · {프로젝트 번호} 완료`를 만들 수 없다.
  - `inbox-table.tsx`가 `leave.module.css`를 import한다.
  - 05-09·05-10은 「04.1 S6 반려/회수 확인 컴포넌트(제목만 문서 종류 이름)」를 재사용한다고 전제한다. 하지만 `decision-dialogs.tsx` · `approve-toast.ts` · `approvals/actions.ts`는 files_modified 어디에도 없다.
- **계획 위치**: 05-10-PLAN.md:18-19(page · inbox-table만) · :41 · :174(문서 칸 `지출결의 · {프로젝트명} · {항목}`) · 05-09-PLAN.md:41 · :189 · 05-11-PLAN.md:45(토스트)
- **main 근거**: app/(app)/approvals/page.tsx:13-14 · :24-38 · :67-78 · app/(app)/approvals/decision-dialogs.tsx:9 · :100 · :175 · app/(app)/approvals/approve-toast.ts:2-5 · app/(app)/approvals/actions.ts:35(`describeDeduction`) · app/(app)/approvals/inbox-table.tsx:17
- **고칠 모양**: 05-10(또는 05-01)에 「결재함 종류 중립화」 작업 하나를 더한다. 내용은 네 가지다.
  - 요약에서 문서 칸 · 부제 글자를 종류가 주게 한다(`documentText` 등 E5 요약 타입에 선택 필드).
  - 확인 창 제목을 `{kindLabel} 반려`/`{kindLabel} 회수`로 만든다.
  - 회수 액션을 종류 중립(`withdrawDocument` 액션)으로 바꾼다.
  - 토스트 재료를 종류 훅으로 받는다.
  - files_modified에 `decision-dialogs.tsx` · `approve-toast.ts` · `approvals/actions.ts`를 넣는다.
- **사용자 결정 필요**: 아니오(범위 추가). 다만 플랜 크기가 늘어난다.

### [P2] D9 — 05-10의 증빙 상세 행 갈래가 엔진에서 잘린다
- **어긋남**: 05-10은 `kinds.ts`의 상세 행 타입에 `{ kind: "evidence", files }` 갈래를 덧붙인다고 쓴다. 실제 `loadKindDetails`는 행을 `{label, value, tone}`로 다시 매핑하므로 다른 필드가 **버려진다**. 결재함 `page.tsx`의 `sheetRows`도 label/value만 옮긴다. 05-10 files_modified에 `domain/approvals/index.ts`가 없다.
- **계획 위치**: 05-10-PLAN.md:144(①) · :5-24(files_modified)
- **main 근거**: domain/approvals/kinds.ts:41(`DocumentDetailRow`는 문자열 칸만) · domain/approvals/index.ts:969(`rows: built.rows.map((row) => ({ label, value, tone }))`) · app/(app)/approvals/page.tsx:41-50
- **고칠 모양**: 05-10 files_modified에 `domain/approvals/index.ts`를 넣는다. `loadKindDetails`의 행 복사를 갈래별로 한다(evidence 갈래는 id · 이름 · 크기 · 형식만 복사). `page.tsx` `sheetRows`도 갈래를 옮기게 한다.
- **사용자 결정 필요**: 아니오.

### [P2] D10 — E6 낱말 매핑 파일은 `app/(app)/leave/status-display.ts`이고, 단계 입력 타입에 `selfApproved`가 없다
- **어긋남**: 매핑은 한 파일에 있다(E6은 「같음」). 다만 연차 폴더의 `leaveStatusDisplay` · `routeListSteps`이고, `RouteStepSource` 타입에 `selfApproved`가 없다. 이 파일은 프로젝트 화면도 import한다. 05-01 files_modified에 이 파일이 없다.
- **계획 위치**: 05-01-PLAN.md:47(E6 must_haves) · :7-25(files_modified)
- **main 근거**: app/(app)/leave/status-display.ts:55-64(`RouteStepSource`) · :91-107(`stepResult`) · domain/approvals/dto.ts:20(`selfApproved`는 DTO에 있음). 이 파일을 import하는 곳: app/(app)/approvals/page.tsx, app/(app)/projects/*
- **고칠 모양**: 05-01 files_modified에 `app/(app)/leave/status-display.ts`를 넣는다. `RouteStepSource`에 `selfApproved`를 더하고, `approved`이면서 `selfApproved`면 `본인 승인`(`success`)으로 바꾼다. name_map에 「결재 상태 → 낱말 매핑 = app/(app)/leave/status-display.ts」를 적는다.
- **사용자 결정 필요**: 아니오.

### [P2] D11 — 「04.1 반려 사유 검증 함수」가 없다(상수와 오류 클래스만 있다)
- **어긋남**: 05-09 `voidEvidence`는 「04.1 검증 함수 재사용 · 문자열 복제 없음」을 전제한다. 실제 검증은 `rejectDocument` 안에 inline으로 있다(trim · 0자 · 500자). export된 것은 상수 셋과 `RejectReasonError`뿐이다. 문구 `사유 없음 · 사유 적기`는 05-UI-SPEC · 05-09와 같다.
- **계획 위치**: 05-09-PLAN.md:50 · :376 · 05-UI-SPEC.md:836
- **main 근거**: domain/approvals/index.ts:654-658(상수 · `RejectReasonError`) · :668-670(inline 검증)
- **고칠 모양**: 05-09에서 `validateRejectReason(reason) → string`(trim된 값 또는 throw)을 `domain/approvals/index.ts`로 빼내 `rejectDocument`와 `voidEvidence`가 같이 쓰게 한다. 이러면 05-09 files_modified에 `domain/approvals/index.ts`가 추가된다. 다른 길은 상수만 import해 같은 검사를 두 번 쓰는 것이다(문자열 복제는 없다).
- **사용자 결정 필요**: 아니오. 추천은 함수로 빼내기다. 이유: 계획의 「검증 재사용」 문장과 그대로 맞는다.

### [P2] D12 — 결재선 설정 「N단 저장」(#105)을 새 종류 설정 섹션 · 테스트가 모른다
- **어긋남**: #105 뒤로는 결재선 단계 칸 네 개를 한 트랜잭션으로만 저장한다(`saveRouteStepSettings`). 칸 하나를 저장하는 액션은 단계 칸 키를 거부한다(`결재선 단계 칸 단독 저장 불가 · 단계 저장으로`). UI 규칙도 있다: DECISIONS 2026-09-30 · SYSTEM §7-2 예외 — `N단 저장` 2차, `바뀐 칸 없음`, 오래된 화면 거부, 이탈 경고 · 보관 복원. 로직은 종류 등록(`routeSettings`)만 있으면 알아서 붙는다. 하지만 05-03 · 05-11의 「설정 섹션은 04.1 S8 규칙 그대로」와 설정 E2E 기대값은 #105 이전 모양이다. 통합 픽스처가 단계 키를 바꿀 때 액션 경로를 쓰면 막힌다(05-09는 `upsertSimpleValue`를 쓰므로 괜찮다).
- **계획 위치**: 05-11-PLAN.md:52 · :159-160 · 05-03-PLAN.md:193 · 05-UI-SPEC S13
- **main 근거**: domain/approvals/route-step-settings.ts:23-27 · :36-86 · app/(app)/admin/settings/actions.ts:34 · :51 · domain/approvals/settings-options.ts:63-96(종류 순회 — 자동으로 붙음) · docs/design/DECISIONS.md:1148-
- **고칠 모양**: 05-03 · 05-11 설정 섹션 문장에 「결재선 단계는 N단 저장(DECISIONS 2026-09-30)」을 더한다. E2E 단언을 단계 저장 모양으로 바꾼다. 픽스처는 `upsertSimpleValue`나 `saveRouteStepSettings`로 값을 넣는다고 명시한다. 05-UI-SPEC S13에도 한 줄을 더한다.
- **사용자 결정 필요**: 아니오. 사용자가 이미 결정했고 그대로 따른다.

### [P2] D13 — 폰 제출 줄 · 폰 문서 행동 줄 버튼 순서(DECISIONS 2026-09-29 두 건)가 05-UI-SPEC에 없다
- **어긋남**: 새 규칙은 두 가지다.
  - 폰 고정 제출 줄은 2차 왼쪽 · 1차 오른쪽이고, 수화 뒤 DOM · Tab 순서도 2차 → 1차다.
  - 폰 문서 행동 줄은 반려/회수 왼쪽 · 승인 오른쪽이고, DOM · Tab 순서도 같다. 폰 결재선 한 단계는 두 줄까지 허용하고, 버튼 사이는 `--s-4` 이상이다.
  - 05-UI-SPEC S3 폰은 「1차 `--touch-min` + 옆 `임시 저장`」이라 순서를 정하지 않았다. S7 폰 행동 줄 규칙도 없다.
  - 04.1 구현(`use-phone-width.ts` · `document-actions.tsx`)은 연차 폴더에 있다.
  - PC 폼(1차 왼쪽) · 골라내기 `[취소 Esc] [이 줄로 Enter]` · PC 문서 행동 줄은 새 규칙과 맞는다.
- **계획 위치**: 05-UI-SPEC.md:408 · 05-05-PLAN.md:60 · :217
- **main 근거**: docs/design/DECISIONS.md:1075-1085 · :1112-1135 · app/(app)/leave/use-phone-width.ts · app/(app)/leave/[id]/document-actions.tsx
- **고칠 모양**: 05-UI-SPEC S3 폰 · S7 폰에 위 규칙을 한 줄씩 적는다. 05-05 must_haves · E2E에 「폰 제출 줄 Tab 순서 2차 → 1차」를 단언한다. 문서 화면 행동 줄은 04.1 것을 재사용할지(연차 폴더에서 꺼내기) 05-05가 정한다.
- **사용자 결정 필요**: 아니오. 사용자가 이미 결정했다.

### [P2] D14 — 첫 화면 「내 차례」 경로가 문서 종류 등록 import를 놓칠 수 있다
- **어긋남**: `test/unit/document-kinds-import.test.ts`는 `@/domain/approvals`를 **직접** 런타임 import하는 app 서버 파일만 검사한다. 05-10에서 `app/(app)/page.tsx` → `domain/next-turn` → `listMyInbox` 경로는 간접이라 가드가 잡지 못한다. `document-kinds`를 import하지 않은 채 지출결의 · 정산 결재 문서가 있으면 `UnknownDocumentKindError`가 난다 [ASSUMED — 콜드 경로 적재 순서에 따라 다름].
- **계획 위치**: 05-10-PLAN.md:147(④ 첫 화면)
- **main 근거**: test/unit/document-kinds-import.test.ts:4-9 · :15 · domain/approvals/kinds.ts:81-85 · app/(app)/document-kinds.ts(지금은 `import "@/domain/leave"` 한 줄)
- **고칠 모양**: 05-10 ④에 「`app/(app)/page.tsx`는 `@/app/(app)/document-kinds`를 import」를 한 줄 적고, acceptance grep을 둔다.
- **사용자 결정 필요**: 아니오.

---

## P3 — 사소

- **[P3] D15** — 05-02 Task 1 read_first가 「SYSTEM.md §7-5(839행~)」로 줄 번호를 쓴다. 지금 §7-5는 860행이다(docs/design/SYSTEM.md:860). 05-02 ①은 DECISIONS **끝**에 `2026-09-26` 날짜 항목을 더하는데, 지금 끝은 09-30 항목이다(DECISIONS.md:1148). 고칠 모양: 줄 번호 대신 절 이름으로 grep하고, 날짜를 실행일로 하거나 이유를 한 줄 적는다. 결정 필요 없음.
- **[P3] D16** — 복원 확인 표 `RESTORE_CHECK_TABLES`(04.4 D8-08)에 「뒤 페이즈는 항목만 더한다」는 주석이 있다(domain/ops/restore-check-tables.ts:1-3). Phase 5의 새 표(expenses · files · upload_intents · settlement_approvals)를 여기에 넣는 계획은 없다. 강제하는 테스트는 없고(test/unit/ops/restore-check-tables.test.ts는 실재 여부 · 중복만 본다), 04.1 표도 들어 있지 않다. 고칠 모양: 05-13 정리에 선택 항목으로 적는다. 결정 필요 없음.
- **[P3] D17** — 회수 뒤 다시 제출한 문서에서 옛 version으로 승인하면 충돌 문구가 엔진 공통 낱말 `…이 HH:MM에 다시 신청함`이다(conflict-message.ts:46-48). 05-UI-SPEC의 지출결의 낱말은 「다시 제출」이다. 종류별 낱말이 필요한지는 UI-SPEC 「거부 — 동시 처리」(05-UI-SPEC.md:268)를 확인해야 한다. 고칠 모양: 그대로 두거나 종류 `label` 기반으로 한다. 결정: 문구를 고르는 일이라 필요하면 사용자에게 묻는다(추천: 그대로 둔다 — 04.1 문구를 재사용하는 원칙).
- **[P3] D18** — 05-11 ③은 `listQuoteLines(viewer, …)`라고만 쓴다. 실제 시그니처는 `(viewer, revisionId, ctx: {status, canWrite, …})`이고 ctx가 필수다(domain/quotes/lines.ts:240 · :286). 반환 `QuoteLineDto`에는 `quoteAmountKrw` · `execution`이 있다(:151-161). 고칠 모양: ctx 한 줄을 적는다.
- **[P3] D19** — 05-12는 `google-auth-library`를 쓰는 기존 코드를 grep으로 찾게 돼 있다. 04.4 뒤 그 코드는 `lib/gcp/cloud-sql-admin.ts`다(`lib/gcp/` 폴더가 이미 있음). 충돌은 없다. 05-04가 같은 폴더에 `storage.ts`를 새로 만든다. 확인만 하면 된다.
- **[P3] D20** — 04.4(로그인 상태 · 복원 리허설 · `db/deadline-transaction.ts`) · 04.2 알림(`domain/notify` · `CONDITION_KINDS` 빈 배열)은 Phase 5 계획과 겹치지 않는다. 계획은 알림을 Phase 7로 두고 있고, 04.2 인프라도 조건 종류가 비어 있어 서로 맞는다. 조치할 것 없음.

### 확인했고 그대로인 것(계획 전제와 같음)
- `changeProjectStatus(viewer, projectId, {from,to}, deps{tx, facts, afterLock, recordAction})` · 로그 `trigger: "manual"` 고정 · `loadStatusChangeFacts`(주석 「Phase 5 결재 호출자는…」) — domain/projects/status.ts:155 · :255-340
- `status-transitions.ts`의 `ProjectStatusTransition` · `ALLOWED_TRANSITIONS`(`via` 없음 — 05-11이 더함) · `AUTO_TRANSITIONS`(04-53 자동 정산) · `loadProjectForGate`(모든 쓰기가 tx 안) — domain/projects/auto-transition.ts:136
- 메뉴 키 `projects.complete`(menus.ts:24, 주석 「Phase 5에서 결재 승인이 호출자」) · `expenses`(:31)는 있다. `expenses.team` · `expenses.evidence_void`는 없어서 05-08 · 05-09가 새로 만든다. 정보 항목 `quote.amount`는 있다(info-items.ts:48).
- 번호: `allocateDocumentNumber` · 리포지토리 `allocateNumber(viewer, counterKey, period, tx)`(repositories/document-counters.ts:47) · `lockDocumentCounter`(새로 생김 — 순번 시작값 잠금). `allocateExpenseNumber`는 없어서 05-03이 새로 만든다. 서식 표에 `leave`가 새로 들어왔다(document-numbering/index.ts). 05-03의 「기존 줄 불변 · 덧붙임만」 조건은 유지된다.
- 행동 로그: `CORE_ACTION_TYPES`(domain/action-log/record.ts:12-37)에 `document_update` · `status_change`가 있다. 새 종류를 만들지 않는 계획과 맞는다.
- 설정: `findEffectiveValue`(repositories/settings.ts:41)는 있다. `getSettingEntry`는 없어서 05-03이 새로 만든다. `TAX_COMPANY_BORNE_*` 기본값은 0.088 · flat이다(05-06이 바꿀 대상 그대로). `approval_route.leave.*` 17키는 개별 선언이고 도우미는 없다(keys.ts:381-).
- 마이그레이션: journal 끝은 idx 20 `0020_hot_maestro`(04.1 결재 · 연차 표)다. 가드 테스트 `test/unit/db/migration-journal.test.ts`가 있고, 규칙 (a)~(e)가 계획의 「journal 가드」와 맞는다.
- 테스트 경로: 05-01 verify가 부르는 `approvals-route-fixed` · `approvals-concurrency` · `tx-safety` · `next-step` · `document-kind-registry`, 04.1 폰 결재 E2E `test/e2e/mobile-leave-approval.spec.ts`, `test/unit/ui/next-turn.test.ts` · `ui/next-turn/*`가 전부 있다.
- UI 문구 상수: `NOT_HOLDER_MESSAGE = "지금 담당이 아님 · 새로 고침"`(index.ts:80 — 05-11 D8 재사용과 같음) · `REJECT_REASON_EMPTY_MESSAGE = "사유 없음 · 사유 적기"`(:655 — 05-09 R1과 같음) · 결재함 EMPTY `결재할 건이 없습니다` + `연차 목록 보기`(page.tsx:100 — 05-10 ② 전제와 같음).
- SYSTEM A3(2026-09-29 — 「결재 옆판」 = 폰 결재 시트 + PC 문서 화면)는 05-UI-SPEC S9 · S7과 맞는다. PC 행 `승인` 즉시(2026-09-25) · B9 예외도 맞는다.
- 연차(04.1 소유)와 겹치는 곳: 05-01(E5 `measure: days`) · 05-10(`nextTurnText`)이 `domain/leave/index.ts`를 고친다. 연차 다시 신청은 `domain/leave/resubmit.ts`(새 파일, `resubmitDocument` 호출)에 있다. E1 기본값 `["rejected"]`이면 동작이 바뀌지 않는다.

---

## name_map (05-01 Task 1 ⓪ 최소 항목 → main 실제 이름 · 파일)

| 계획 이름 | main 실제 | 파일:줄 |
|---|---|---|
| `registerDocumentKind` | 같음 | domain/approvals/kinds.ts:73 (index.ts:60 재export) |
| └ `loadRouteConfig` | 같음 `() => Promise<RouteConfig>` | kinds.ts:52 |
| └ `href` | 같음 `(documentId) => string` | kinds.ts:53 |
| └ `describeDocuments` | 같음 `(viewer, ids, deps?) => Promise<Map<string, object>>` | kinds.ts:55 |
| └ `routeSettings` | 같음(선택) `RouteSettingDefs` | kinds.ts:56 · :28-36 |
| └ `canResubmit` | 같음(선택) `(viewer) => Promise<boolean>` — 문서 id 없음(D5) | kinds.ts:58 |
| └ `loadDetails` | 같음(선택) `(viewer, ids, deps) => Promise<Map<id, DetailFields>>` | kinds.ts:61 |
| └ `detailDto` | 같음(선택) `DetailDtoSpec` | kinds.ts:62 |
| └ `buildDetailRows` | 같음(선택, 메서드) | kinds.ts:64 |
| `prepareSubmission` | 같음 `(viewer, {kind, drafterId}, deps?)` | domain/approvals/index.ts:238 |
| `submitDocument` | 같음 `(viewer, prepared, {documentId}, tx, deps?)` | index.ts:280 |
| `approveDocument` | 같음 `(viewer, {instanceId, expectedVersion}, deps?)` — 자기 withTransaction | index.ts:583 |
| `rejectDocument` | 같음 `(viewer, {instanceId, expectedVersion, reason}, deps?)` | index.ts:663 |
| `withdrawDocument` | 같음 `(viewer, {instanceId, expectedVersion}, deps?)` | index.ts:706 |
| `resubmitDocument` | 같음 `(viewer, prepared, {instanceId, expectedVersion}, tx, deps?)` | index.ts:726 |
| `listMyInbox`(`withDetails`) | `listMyInbox(viewer, deps?)` — `withDetails`는 `ApprovalDeps` 필드 | index.ts:982 · :88-97 |
| `getApprovalView` | 같음 `(viewer, {kind, documentId}, deps?)` → `ApprovalView \| null` | index.ts:885 |
| `previewRoute` | 같음 `(viewer, {kind}, deps?)` | index.ts:253 |
| `ApprovalConflictError` | 같음 | index.ts:76 |
| `NotCurrentHolderError` | 같음 | index.ts:77 |
| `isApprovalParty` | 같음 `(viewerId, {drafterId, actedByIds, currentHolderIds})` | domain/approvals/conflict-message.ts:59 |
| 충돌 문구 조립 함수 | `buildConflictMessage(state: ConflictState)`. 행 → 구조체 변환은 비공개 `conflictMessageOf`(index.ts:390) | conflict-message.ts:32 |
| `updateInstanceStatus` | 같음 `(viewer, {id, expectedVersion, status, currentRound?}, tx)` → row \| null | repositories/approvals.ts:125 |
| `loadActionLogGate` | 같음 | domain/approvals/tx-log.ts:16 |
| `recordActionInTx` | 같음 | domain/approvals/tx-log.ts:27 |
| `getSimpleSettingValues` | 같음 | domain/settings/registry.ts:353 |
| `findSimpleValues` | 같음 `(viewer, keys, tx?)` | repositories/settings.ts:181 |
| `lib/dates.ts` `seoulToday` | 같음 `(now?)` | lib/dates.ts:7 |
| journal 가드 테스트 | `test/unit/db/migration-journal.test.ts` | — |
| 결재 상태 → 낱말 매핑 파일 | `app/(app)/leave/status-display.ts`(`leaveStatusDisplay` · `routeListSteps`) | :20 · :109 |
| 결재 시트 파일 | `app/(app)/approvals/approval-sheet.tsx`(+ `approval-sheet.module.css`), export `ApprovalSheet` | :44 |
| 결재함 표 파일 | `app/(app)/approvals/inbox-table.tsx`(`InboxTable`) | :51 |
| 종류 등록 한 곳 | `app/(app)/document-kinds.ts`(지금 `import "@/domain/leave"` 한 줄) | — |
| (참고) 반려 사유 검증 함수 | **없음** — inline 검증 + 상수 셋 + `RejectReasonError`(D11) | index.ts:654-670 |
| (참고) 04.1 S6 반려/회수 확인 | `app/(app)/approvals/decision-dialogs.tsx`(`RejectDialog` · `WithdrawDialog` — 제목 「연차」 고정, D8) | :100 · :175 |

## premise_check (05-01 Task 1 ⓪-b)

```
E1: 같음 — resubmitDocument는 closedFor(nextStep 표)로 rejected에서만·기안자만, 차수 +1(currentRound+1, 새 approval_routes 행), 같은 인스턴스 UPDATE. 종결 판정(approved·withdrawn 모든 사건 종결, rejected는 기안자 resubmit만)도 RESEARCH 줄과 같다 (index.ts:726-767 · :383-386 · route.ts:17-24)
E2: 같음 — 트랜잭션 전 readTransitionPre → withTransaction 한 번 → runTransition (1)version (2)종결 (3)후보 (4)plan (5)UPDATE (6)단계 기록 (7)로그 순서이고, (4)에서 nextStep(…, "approve_final")로 최종을 가른다. 단서: (4)는 사건이 아니라 status "approved"를 돌려주고, 트랜잭션 전에는 kind/documentId를 모른다(D6) (index.ts:583-652 · :472-540)
E3: 같음 — getApprovalView는 isCandidate·단계별 viewerHolds, listMyInbox는 candidateIds.includes(viewer.id)로 mine을 가른다 (index.ts:885-951 · :789-790 · :1000-1003)
E4: 다름(충돌 문구 조립 함수 buildConflictMessage가 인스턴스 행이 아니라 ConflictState{status,round,actorName,at,attempted}를 받는다 — 행→구조체는 index.ts:390 비공개 conflictMessageOf. version 조건부 UPDATE는 같음) (conflict-message.ts:23-32 · repositories/approvals.ts:125-142)
E5: 다름(describeDocuments 요약에 엔진 쪽 타입이 없다 — Map<string, object>이고, 결재함 화면이 연차 모양(LeaveSummary)으로 캐스트해 일수 칸을 그린다) (kinds.ts:55 · dto.ts:43 · app/(app)/approvals/page.tsx:24,67-78)
E6: 같음 — 결재선 단계 결과 낱말은 app/(app)/leave/status-display.ts 한 파일(stepResult·routeListSteps). 단 연차 폴더에 있고 RouteStepSource에 selfApproved가 없다(D10) (status-display.ts:55-107)
E7: 같음 — 결재 시트는 app/(app)/approvals/approval-sheet.tsx 한 파일(+CSS)이고 import 자리는 page.tsx(type)·inbox-table.tsx 둘. 단 이동 감사는 (마)에 걸린다(DayNumbers·ConflictLine — D3) (approval-sheet.tsx:3-12)
```

→ ⓪-b 규칙상 E4 · E5가 「다름」이라 05-01은 코드를 바꾸기 전에 멈춘다. 두 줄 다 「모양 차이 · 선택 필드로 흡수 가능」이라 계획 문장만 고치는 쪽(D1 · D2 (A))을 추천한다.
