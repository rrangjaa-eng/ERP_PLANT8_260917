---
phase: 04-project-quote-ledger
plan: 44
subsystem: projects
status: complete
tags: [pre-estimate, fx, period, status-modal, header, tdd]

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: "04-22 기간 칸 · openPeriodField · periodEditRights · 합성 저장 tx 순서 · seenStatus(DR-6) · D-68 persist 배선"
provides:
  - "domain/projects/pre-estimate.ts validatePreEstimateChange(화면·서버 같은 함수)"
  - "ProjectDto.preEstimate(infoItem quote.amount) · 게이트 규칙 project.pre-estimate-edit"
  - "saveProjectLedger의 preEstimate 입력 — 같은 tx 저장, 기간과 모은 거부(U-6), 커밋 뒤 최근 환율 기억"
  - "상세 부제 「총 매출 예상가 …」 + 3차 + 머리 줄 아래 칸 묶음(금액 · 통화 · 환율)"
  - "상태 모달 3차 「기간 적기」(시작일) · 결과 줄 「기간 바꾸기」(종료일) · 폰 부제 첫 항목 = 기간 줄"
affects: ["04-12", "04-30", "gsd-verify-work"]

# Actuals (#2632)
actuals:
  tokens: 13480
  tasks: 3
  commits: 6
plan_head_before: 7d959201e82321264db794d41a4549c5c0b550a9

tech-stack:
  added: []
  patterns:
    - "모달 → 다른 칸 포커스: ConfirmDialog가 onClose 뒤 트리거로 포커스를 돌려놓으므로, 칸 열기는 onClose 안에서 queueMicrotask로 미룬다"

key-files:
  created:
    - domain/projects/pre-estimate.ts
    - app/(app)/projects/[id]/pre-estimate-field.tsx
    - test/unit/domain/project-pre-estimate.test.ts
  modified:
    - domain/projects/index.ts
    - domain/rules/register.ts
    - domain/projects/ledger.ts
    - repositories/projects.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/status-change.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/integration/project-period.test.ts
    - test/e2e/project-period.spec.ts

key-decisions:
  - "총 매출 예상가 권리 = periodEditRights !== none 그리고 quote.amount 노출 — 별도 권리 함수 없음(DR-37), canSave에 같은 항을 더함(A-12)"
  - "기간 거부와 총 매출 예상가 칸 오류는 한 번의 거부로 모은다(U-6) — 기간 거부가 있으면 PeriodRejectedError가 preEstimateErrors를 함께 싣고, write.denied는 한 번"
  - "총 매출 예상가는 버전 검사 없이 나중 저장이 이기고, 저장된 0은 미입력(「총 매출 예상가 —」) — 사용자 2026-09-23 확정"
  - "최근 환율 기억은 USD이고 환율을 고친 저장만, 트랜잭션 커밋 뒤에 한다 — 실패는 fx.remember_failed 로그만(저장은 성공)"
  - "총 매출 예상가는 부제 문자열 안이 아니라 부제 아래 별도 줄 — 기존 부제 정확 일치 E2E를 깨지 않는다"

patterns-established:
  - "모달 3차가 모달 밖 칸으로 포커스를 옮길 때는 모달 onClose 다음 마이크로태스크에서 연다"

requirements-completed: [PROJ-07, UX-04, FX-01]  # PROJ-04는 requirements.ready-ids가 ready로 돌려주지 않음(다른 미완료 플랜이 선언 중) — mark-complete 미호출

coverage:
  - id: T1
    description: "부제 「총 매출 예상가 …」(외화 이어 씀, 0이면 —) + 권리 있는 사람에게만 3차"
    requirement: "PROJ-07"
    verification: "E2E (7)(8) · 통합 (o)"
  - id: T2
    description: "칸 묶음(금액 · 통화 · 환율) · dirty가 일괄 저장 N에 합류 · 같은 tx 저장 · 600ms 틴트 후 닫힘"
    requirement: "PROJ-07"
    verification: "E2E (7)(10) · 통합 (o)"
  - id: T3
    description: "칸 오류 Form.Error 네 문구 · 전부 거부 · 다른 칸 오류 N칸 · 서버도 같은 함수"
    requirement: "UX-04"
    verification: "단위 결정표 10 · 통합 (o2)(o3)(o3b) · E2E (9)"
  - id: T4
    description: "환율을 고친 USD 저장만 커밋 뒤 최근 환율 갱신, 실패는 fx.remember_failed"
    requirement: "FX-01"
    verification: "통합 (o4)(o4b)"
  - id: T5
    description: "상태 모달 「기간 적기」 → 시작일 · 결과 줄 「기간 바꾸기」 → 종료일 포커스"
    requirement: "PROJ-04"
    verification: "E2E (11)(12)(13)"
  - id: T6
    description: "폰(<700) 부제 첫 항목 = 기간 줄"
    requirement: "PROJ-04"
    verification: "E2E (14) · 독립 DOM 감사(오케스트레이터)"

duration: 39min
completed: 2026-09-25
---

# Phase 4 Plan 44: 총 매출 예상가 칸 · 상태 모달 → 기간 칸 Summary

**상세 머리 줄 부제에 총 매출 예상가(외화면 원래 통화·환율 이어 씀)와 기간 권리 3차를 두고, 금액·통화·환율 칸 묶음이 일괄 저장 트랜잭션에 합류하며(기간과 모은 거부 · 커밋 뒤 USD 환율 기억), 상태 모달의 「기간 적기」·「기간 바꾸기」가 모달을 닫고 시작일·종료일 칸으로 바로 간다.**

## 성과

- 순수 검증 `validatePreEstimateChange` — 화면 칸 오류와 서버 합성 저장이 같은 함수를 부른다(rev 5 문구 원문).
- `ProjectDto.preEstimate`(infoItem `quote.amount`) · 게이트 `project.pre-estimate-edit` · `updateProjectPreEstimate`(`moneyToColumns` 경유).
- `saveProjectLedger`:
  - 권리 사실과 `quote.amount` 노출은 트랜잭션 **전**에 읽는다(ENG-D3 ①).
  - 트랜잭션 안에서는 판정 → 쓰기 → `document_update` 한 줄(`preEstimateChanged: true`, 금액 없음) 순서다.
  - 최근 환율 기억은 커밋 **뒤**에 한다.
- 화면: `pre-estimate-field.tsx`(Form.Actions 없는 칸 폼, Enter 막음 · Esc 되돌림/닫음 · Ctrl+S 저장).
  - dirty 칸 수가 1차 「일괄 저장 N」에 합류한다.
  - D-68 보관 키에 `preEstimate:amount|currency|fxRate`를 더해 복원된다.
- 상태 모달: `StatusChangeProps`는 `periodRights` · `onOpenPeriodField`만 더해 넓혔다(A-31).
  - 「기간 적기」는 `primary.nextStep`이다.
  - 「기간 바꾸기」는 `종료일 지남 · 바로 정산` 결과 줄 옆에 둔다.
- 폰(<700): `.periodLead { order: 1 }` — 새 토큰·색·중단점 없음(700만).

## 태스크 커밋

1. **Task 1(트레이서) 총 매출 예상가 칸 저장**
   - RED `8f8e65a` test(04-44): tracer RED for pre-estimate field save
   - GREEN `14a10f8` feat(04-44): pre-estimate field tracer — lead edits and batch-saves the total sales estimate
2. **Task 2 거부 · 환율 기억 · 키 · 복원**
   - RED `cd41ec0` test(04-44): RED for pre-estimate rejection, commit-time FX memory and restore
   - GREEN `e3c8bbe` feat(04-44): pre-estimate rejection envelope, commit-time FX memory, Esc and restore keys
3. **Task 3 상태 모달 연결 · 폰 부제 순서**
   - RED `5c7eab9` test(04-44): RED for status-modal period links and phone subtitle order
   - GREEN `39ff3d9` feat(04-44): status-modal period links and phone subtitle order

트레이서 게이트: Task 1 GREEN 뒤 `<verify>`(단위 · 통합 · E2E `CI=true`)를 다시 돌려 통과한 뒤 확장했다.

## TDD 증거

| 단계 | 대상 | RED(실패 이유) | GREEN |
|------|------|----------------|-------|
| T1 단위 | `project-pre-estimate.test.ts` | 시그니처 스텁이 []를 돌려 5건 단언 실패 — `check tdd-red-evidence` RED_EVIDENCE_OK | 10/10 |
| T1 통합 | (o) 저장·DTO | preEstimate 미저장 — RED_EVIDENCE_OK | 통과 |
| T1 E2E | (7) 칸 열기·저장 | 3차 버튼 없음(원시 출력 증거 — TAP 없음) | 통과 |
| T2 통합 | (o2)~(o4b) | 선언만 둔 `PreEstimateRejectedError` — 거부 종류 불일치 · 환율 미기억 — RED_EVIDENCE_OK | 통과 |
| T2 E2E | (9)(10) | (9) 서버 문자열이 FormAlert·tfoot·칸 세 곳(strict 3건) · (10) 복원 키 없음 | 통과 |
| T3 E2E | (11)~(14) | 3차 없음 · (14) 기간 줄이 부제 아래 | 통과 |

태스크별 RED 커밋(테스트 전용, feat 커밋 앞):
- T1: `8f8e65a` → `14a10f8`. 스텁 `domain/projects/pre-estimate.ts` 12줄을 함께 커밋했다.
- T2: `cd41ec0` → `e3c8bbe`. 선언만 둔 에러 클래스를 `ledger.ts`에 7줄로 함께 커밋했다.
- T3: `5c7eab9` → `39ff3d9`. 테스트 파일만 커밋했다.
- RED 실행 로그는 실행자 scratchpad에 있다(red-unit/red-int/red2-int JSON = RED_EVIDENCE_OK, red-e2e · red2-e2e · red3-e2e/red3b 원시 출력).

스킬 호출 기록(실행자 트랜스크립트 기준 — 정직하게 적는다):
- `test-driven-development`: T1 첫 코드 전에 1회 호출했다. T2 · T3 시작 전에는 다시 호출하지 않았고, 같은 세션에 불러온 규율을 이어 적용했다. 그래도 RED는 태스크마다 먼저 돌려 확인했다.
- `verification-before-completion`: `8f8e65a` · `14a10f8` · `e3c8bbe` 앞에서 호출했다. `cd41ec0` · `5c7eab9` · `39ff3d9` 앞에서는 호출이 **빠졌다**. 그 커밋들도 직전에 테스트 · typecheck/lint를 새로 실행해 출력을 확인한 뒤 커밋했다.
- `systematic-debugging`: T1 RED 형식 문제 때 1회 호출했다. T3 포커스 경합은 다시 호출하지 않고 같은 절차(근본 원인 확인 → 수정 하나 → 재실행)로 처리했다.

## 실행한 게이트(최종, 새로 실행)

- 단위 `pnpm test:unit` — 90 파일 · **1130/1130**
- 통합 `project-period` + `leak-scan` — **879/879**
- E2E `CI=true` `project-period.spec.ts` + `project-lifecycle.spec.ts` — **28/28**
- E2E `CI=true` `ledger-save-flow.spec.ts` — **1/1**
- `pnpm typecheck` 0 오류 · `pnpm lint` 0 오류(boundaries 플러그인 사용 중단 경고는 기존) · `pnpm lint:sql` 0 이슈
- `package.json` · `pnpm-lock.yaml` 기준(7d95920) 대비 변경 없음 — 새 의존성 없음
- 전체 `CI=true pnpm test`는 실행하지 않음 — 오케스트레이터가 독립 DOM 감사 뒤 한 번 돌린다(CLAUDE.md §6 순서)

## 새 문구

| 문구 | 자리 | 근거 |
|------|------|------|
| `총 매출 예상가 바꾸기 권한 없음` | 게이트 `project.pre-estimate-edit` 방어 문구(위조 요청으로만 닿음 — 화면은 권리 없으면 3차를 그리지 않는다) | 사용자 2026-09-23 확정 · PLAN `<probe_fallback>` |

그 밖의 문구는 모두 UI-SPEC rev 5 원문(칸 라벨 · 오류 네 문구 · 「기간 적기」 · 「기간 바꾸기」 · `전부 거부 · 다른 칸 오류 N칸`)이다.

## Deviations from Plan

1. **[Rule 3 - Blocking] RED 스텁을 RED 테스트와 함께 커밋.**
   - 모듈 없음(INVALID_RED)을 피하려 했다.
   - 단위는 []를 돌리는 시그니처 스텁, T2 통합은 선언만 둔 `PreEstimateRejectedError`다. 둘 다 GREEN 커밋에서 구현됐다.
2. **[Rule 3 - Blocking] RED 증거 검사기 형식.**
   - vitest 기본 출력은 TAP이 아니다. 그래서 `--reporter=tap-flat`로 다시 돌리고, ok/not ok 줄에서 기계적으로 센 `# tests/# pass/# fail`을 붙였다.
   - targetTest는 TAP 전체 이름이다. E2E는 TAP이 없어 원시 출력만 증거로 남겼다.
3. **[Rule 3 - Blocking] E2E RED 실행 중 통합 테스트 파일을 잠시 HEAD 판으로 되돌림.**
   - `CI=true`의 `next build`가 아직 없는 타입을 참조하는 RED 통합 테스트까지 타입 검사해 webServer가 뜨지 않았다.
   - E2E RED 두 번(T1 · T2) 동안만 되돌렸다가 바로 복원했다. 커밋 내용은 바뀌지 않았다.
4. **예상 밖 초록 — E2E (8)(권리 없는 사람은 3차 없음)이 T2 RED 때 이미 통과.**
   - T1이 3차를 권리로 이미 가렸기 때문이다. 테스트는 회귀 방어로 둔다.
5. **[Rule 1 - Bug] T3 포커스 경합.**
   - `ConfirmDialog.finishClose()`가 네이티브 close 이벤트 뒤 `onClose()` → 트리거 `focus()`를 동기로 부른다. 그래서 기간 칸의 mount 포커스가 덮였다(E2E (11)(12)(13) `Received: inactive`).
   - `goToPeriod`는 고른 칸만 ref에 두고 모달을 닫는다. `closeConfirm`(onClose)이 `queueMicrotask`로 `onOpenPeriodField`를 부른다.
   - 기간 칸이 이미 열려 있으면 `PeriodField`의 포커스 effect가 다시 돌지 않는다. 그래서 `openPeriodField`가 `period-${focus}` 칸에 바로 포커스한다(한 줄). ConfirmDialog 공용 컴포넌트는 고치지 않았다.
6. **총 매출 예상가는 부제 문자열 안이 아니라 부제 아래 별도 줄.**
   - 기존 부제 정확 일치 E2E를 깨지 않기 위해서다.
   - 그 결과 폰에서 총 매출 예상가 줄은 부제 항목 사이가 아니라 부제(상태 날짜 포함) 다음에 온다. 기간 줄이 첫 항목이라는 계약은 지킨다.
7. **입력 중 칸 검증을 T1에 넣음.** 「화면이 `validatePreEstimateChange`를 import」 수용 기준을 트레이서에서 만족하려고 T2의 칸 오류 표시 일부가 앞당겨졌다.
8. **`domain/projects/index.ts`의 낡은 주석 한 줄 갱신.** 「DTO 노출은 04-44가 더했다(preEstimate)」 — 이 플랜이 바꾼 사실에 맞췄다.
9. **도달 불가 E2E — 「기간 권리 없는 사람의 모달은 글자만」.**
   - 04-20 시드만으로는 도달할 수 없다. `projects.status`를 가진 시드 역할은 모두 `projects.period`와 팀 범위도 가졌다.
   - ENG-D2 때문에 권한을 손으로 켜지 않는다.
   - 코드 조건 `periodRights !== "none"`(status-change.tsx)이 가린다. **오케스트레이터 확인 필요.**
10. **무관한 로그.** E2E (0)(1) 근처 `[WebServer] ⨯ Error: The destination stream closed early.` — 기존 404 테스트 쪽이다. 결과에 영향 없고 이 플랜과 무관하다.

범위 밖: 04-22 S2/S3은 손대지 않았다. N5(PeriodField inputMode)도 건드리지 않았다.

## 독립 DOM 감사

오케스트레이터가 별도 에이전트로 실행 — 결과는 이후 커밋에 기록.

- 폭: 1280 · 1024 · 375 (`CI=true`, DOM 실측 — 스크린샷 육안 금지)
- 대상 truth(backstop):
  - 기간 칸·총 매출 예상가 칸이 열려도 머리 줄 가로 스크롤 0이다.
  - 칸 묶음은 머리 줄 아래에 붙는다.
  - 375에서 칸 묶음은 전폭·라벨 위다.
  - 375에서 부제 첫 항목은 `기간 …`이다.
- 예상 파일: `app/(app)/projects/[id]/page.tsx` · `app/(app)/projects/[id]/quote-table.tsx` · `app/(app)/projects/[id]/pre-estimate-field.tsx` · `app/(app)/projects/[id]/period-field.tsx` · `app/(app)/projects/[id]/status-change.tsx` · `app/(app)/projects/[id]/project-detail.module.css`

## 남은 확인

- 한도 풀리면 Codex 재확인 필요.
- 위 9번(권리 없는 모달 글자만) — 시드로 닿지 않아 E2E 없음.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: pre-estimate.ts · pre-estimate-field.tsx · project-pre-estimate.test.ts — FOUND
- 커밋 존재: 8f8e65a · 14a10f8 · cd41ec0 · e3c8bbe · 5c7eab9 · 39ff3d9 — FOUND
- `git rev-list --count 7d95920..HEAD` = 6 (SUMMARY 커밋 전)
