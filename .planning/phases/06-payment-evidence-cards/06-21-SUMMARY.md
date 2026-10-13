---
phase: 06-payment-evidence-cards
plan: 21
subsystem: revenue-issue-requests
status: complete
tags: [issue-requests, S16, S17, SP-4, PROJ-06, db-lock]
requires: ["06-18", "06-19"]
provides:
  - issueRequestTransition(상태 전이 한 함수) · saveIssueRequestRows 취소 갈래
  - listIssueRequests · issueRequestGroup(S17) · summarizeOpenIssueRequests(06-23이 쓴다)
  - /projects/issue-requests(page · loading · error) · 프로젝트 목록 하위 링크 `발행 요청 {N}` · ?issueRequest 포커스
affects: ["06-23"]
requirements: [PROJ-06]
tech-stack:
  added: []
  patterns: [상태 전이 순수 함수, E-26 deferred 장벽 경합 테스트, 하위 목록 링크(SP-4), 폰 스펙의 공용 설정 실패 주입]
key-files:
  created:
    - app/(app)/projects/issue-requests/page.tsx
    - app/(app)/projects/issue-requests/issue-request-list.tsx
    - app/(app)/projects/issue-requests/loading.tsx
    - app/(app)/projects/issue-requests/error.tsx
    - app/(app)/projects/issue-requests/issue-requests.module.css
    - test/unit/domain/issue-requests.test.ts
    - test/e2e/mobile-issue-requests-error.spec.ts
    - docs/design/checks/2026-10-13-06-21-issue-requests.md
    - docs/design/checks/2026-10-13-06-21-review-fixes.md
  modified:
    - domain/issue-requests/index.ts
    - repositories/revenue-issue-requests.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/issue-request-table.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/projects/filter-bar.tsx
    - ui/table/Table.tsx
    - test/integration/issue-requests.test.ts
    - test/e2e/issue-requests.spec.ts
decisions:
  - 발행 요청 취소는 06-18 단일 저장 경로(saveProjectLedger → saveIssueRequestRows) 안의 갈래 — 요청 행 잠금 뒤 issueRequestTransition 판정, 같은 tx 기록
  - S17 1024 미만 행 링크는 프로젝트 칸 링크(data-row-link) — 폰은 Table phoneRowLink, 700~1023은 화면 CSS가 누름 자리를 행으로 넓힌다
  - S17 로드 오류 E2E는 공용 설정(tax.basis_date.vat)을 잠깐 바꾸므로 mobile-375 스펙(mobile-projects-error 선례)
metrics:
  duration: 2h10m
  completed: 2026-10-13
actuals:
  tokens: 20900
  tasks: 3
  commits: 6
plan_head_before: a5737022344c9262d9dd7c75017f36898848df72
---

# Phase 06 Plan 21: 발행 요청 취소 · 목록(S17) · 하위 링크 Summary

발행 요청을 마감했다 — 상태 전이 한 함수(`issueRequestTransition`)와 일괄 저장 안의 취소 갈래(Delete → 확인 모달 → dirty → `일괄 저장`), 경영관리의 `/projects/issue-requests` 목록(희망일 그룹 · 합계 · 행 3차 · LOADING · 로드 오류), 프로젝트 목록 하위 링크 `발행 요청 {N}`, `?issueRequest` 도착 포커스, 06-23이 쓸 `summarizeOpenIssueRequests`.

## 호출한 스킬

- `superpowers:test-driven-development` — 구현 전(세 Task 모두 RED 커밋 → GREEN 커밋)
- `superpowers:verification-before-completion` — 커밋 전(훅 요구) · 완료 판정 전
- `design-gate` — 화면 파일 수정 전, 점검표 `docs/design/checks/2026-10-13-06-21-issue-requests.md`(화면: 줄에 손댄 화면 파일 전부, 모든 항목 `[x]` + 근거)
- `superpowers:systematic-debugging` — Task 2 E2E 실패(취소 스펙 · S17 스펙) 원인 추적 전

## 실행 게이트 · 선행 의존 (base a573702 기준 재확인)

| id | 확인 | 결과 |
|---|---|---|
| C15 | 05-13-SUMMARY.md · `submitSettlement` | 1 · 1건 |
| 06-18 | `saveIssueRequestRows` · `linkIssueRequestToEntry` / `lockIssueRequest` / `issueRequestStatusWord` / `ISSUE_REQUEST_DTO_SPEC` | 2 / 1 / 1 / 3줄 |
| 06-19 | 06-19-SUMMARY.md · quote-table.tsx 마지막 커밋 | 있음 · `9b6ffed feat(06-19): 완료 전 점검 트레이서 — 반려 지출결의가 정산 기안을 막는다` |
| UA-602 · UA-603 | ConfirmDialog · Pagination · ListScreen / `TableSkeleton` | 3줄 / 1건 |
| 06-01 (C2) | status-map `발행됨` | 2줄(있음 — 계획은 1건으로 적었으나 낱말 정의 줄 + 색 매핑 줄) |

이름 드리프트 없음(매핑 표 불필요).

## Task별 결과

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (tracer) | aeae465 (RED) · 2fe639a (GREEN) | 전이 함수 · 취소 갈래 · actions zod `cancel` · S16 Delete → 확인 모달 · quote-table 저장 페이로드 |
| 2 | e035d12 (RED) · 017be31 (GREEN) | `issueRequestGroup` · `listIssueRequests` · 리포지토리 목록 조회 · S17 page/list/loading/error/css |
| 3 | e1adc8a (RED) · 1043031 (GREEN) | `summarizeOpenIssueRequests` · 프로젝트 목록 링크 · `?issueRequest` 포커스 |

### RED / GREEN 증거

- RED 단위: `issueRequestTransition is not a function`(6 실패), `issueRequestGroup is not a function`(5 실패). 통합 Task 1: 8 실패(취소 행이 수정으로 처리돼 `날짜 형식 오류` · 경합 둘). Task 2: `listIssueRequests is not a function`(6 실패). Task 3: `summarizeOpenIssueRequests is not a function`(4 실패). E2E Task 3: 3 실패(링크 없음 · 포커스 없음).
- 변이 RED(취소 ∥ 잇기, E-26 장벽): 취소 갈래의 잠금 뒤 판정을 끄면 「잇기 먼저 잠금」이 `expected '다른 사람이 먼저 이 요청을 바꿈 · 새로 고침' to be '이미 발행됨 · 새로 고침'`로 실패 / 잇기의 잠금 뒤 판정을 끄면 「취소 먼저 잠금」이 `expected '다른 사람이 먼저 이 요청을 이음 · 새로 고침' to be '취소된 요청 · 새로 고침'`로 실패(둘 다 되돌림).
- GREEN: `-t "취소 ∥ 잇기 — "` 2 passed. 트레이서 게이트 — verify 재실행 녹색 뒤 확장.

### 구조 grep (CROSS-R1 F-5 · 저장 경로 하나)

- `saveIssueRequestRows` 범위의 `db`/전역 판정 호출: **0** · `lockIssueRequest(`: **1** · tx 없는 `recordAction`: **0**
- `withTransaction(` (domain/issue-requests/index.ts, 주석 제외): 0 · `issueRequestTransition`이 사는 domain 파일: `domain/issue-requests/index.ts` 하나
- `waitForLockWaiter` 수 3 = import 1 + 06-18 기존 1 + 이번 두 경합이 함께 쓰는 도우미 `raceLedgerSaves` 1(두 케이스 「취소 먼저 잠금」 · 「잇기 먼저 잠금」은 각 1건)

## 검증 (이 실행자가 돌린 것)

| 범위 | 결과 |
|---|---|
| 단위 issue-requests · screen-frames · page-auth-guard · error-copy-noun-style · stylelint-config · row-scope-disposition | 6 files · 181 passed |
| 단위 전체(`pnpm vitest run --project unit`, 마지막 코드 뒤) | 4577 passed · 1 failed — `test/unit/design/mark-legacy.test.ts` CLI 케이스 5s 시간 초과(8073ms, 같은 때 E2E 빌드가 돌아 load average 11.5). 그 파일만 다시 돌리면 13/13 passed — 이번 변경과 무관(근거: 단독 녹색) |
| 통합 issue-requests · projects-list · leak-scan (erp_test_0621) | 3 files · 4129 passed |
| E2E CI=true issue-requests · projects-list · projects-filter-reset (desktop) | 52 passed |
| E2E CI=true quote-table (desktop) | 56 passed |
| E2E CI=true mobile-issue-requests-error (mobile-375) | 1 passed |
| `pnpm lint` · `pnpm typecheck` | 0 · 0 |
| C19 위험 경로(`git diff --name-only a573702...HEAD` 위험 경로 grep) | 0 |
| package.json · pnpm-lock.yaml · docs/design/tokens.css diff | 0 |
| Task 2 acceptance: page.tsx `subtitle` · css 옛 토큰 | 0 · 0 |

E2E 서버 로그의 `The destination stream closed early`는 탐색 중 스트림이 끊길 때의 서버 로그이고 실패가 아니다(52 passed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ui/table/Table.tsx` — 격자 키보드를 켜지 않은 표에서도 칸 자체 포커스의 Delete를 `keyboard.onDeleteRow`로**
- Found during: Task 1 · Issue: S16 표는 격자 모드가 아닌 경로가 있어 Delete가 줄 삭제 신호로 가지 않았다 · Fix: `event.target === event.currentTarget`일 때만(칸 안 입력 요소의 Delete는 글자 삭제 그대로) · files_modified 밖 · Commit 2fe639a

**2. [Rule 3 - Blocking] S17 클라이언트 파일 `app/(app)/projects/issue-requests/issue-request-list.tsx` 추가**
- 칸 렌더 함수 · 필터 select 이동은 서버 페이지에서 넘길 수 없어 클라이언트 파일이 필요했다(구매 요청 `purchase-list.tsx` 선례) · Commit 017be31

**3. [Rule 3] 리포지토리 서명 — `listIssueRequestRows(viewer, scope, { status, limit, offset })` + `listIssueRequestAmounts(viewer, scope, { status })` 추가**
- 계획 서명은 `listIssueRequestRows(viewer, { status, limit, offset })`. 행 범위(`projectRowScope`)를 domain이 한 번 읽어 두 조회에 넘기고, 합계 · 건수(쪽이 아닌 필터 전체)와 열린 요청 요약(Task 3)이 같은 금액 조회를 쓴다. 두 함수 모두 `rowScopeCondition(` 인라인 — row-scope-disposition 녹색

**4. [Rule 3] 로드 오류 E2E를 새 폰 스펙 `test/e2e/mobile-issue-requests-error.spec.ts`로**
- 서버 목록을 실패시킬 길이 범위 안 데이터로는 없다(부가세율은 기본값이 있고 상태 · 쪽 쿼리는 서버가 거른다). 공용 설정 `tax.basis_date.vat`를 잠깐 잘못된 값으로 바꾸는 주입은 desktop 병렬 워커를 깨뜨리므로 `mobile-projects-error.spec.ts`와 같은 자리(mobile-375 — desktop 뒤 · 한 워커)에 두었다. 되돌리기는 「다시 시도」 전 + finally

**5. [Rule 1 - 테스트 경합] 06-21 Task 1 E2E 「발행 요청 취소 — 일괄 저장 때 반영」**
- 증상: 두 번째 실행부터 모달이 뜨지 않음(결정적) · 원인(systematic-debugging, MutationObserver 실측): 스트리밍된 상세 본문이 `<div hidden>`에 있다가 ~230ms 뒤 옮겨지는데, 숨은 칸에 `focus()`해 포커스가 body에 남았다 · 고침: 칸이 보일 때까지 기다린 뒤 포커스(`toBeVisible`) · Commit e1adc8a(017be31의 임시 `toPass` 대기를 조건 대기로 교체)

**6. 화면 세부(계획에 적히지 않은 자리)**
- S17 필터 0건(기본 보기 밖) 빈 화면 `조건에 맞는 발행 요청이 없습니다 · 필터 지우기` — S17 문구 표에 없는 갈래라 카드 사용 · 지급 대상 필터 0건 문구 꼴을 따랐다
- 상태 열 폰 우선순위 p2(접힌 줄) — UI-SPEC은 폰 P1 = 프로젝트 · 금액 · 희망 발행일, P2 = 요청자 · 메모만 적었다. 상태를 숨기지 않으려 P2에 더했다
- 프로젝트 칸은 모든 폭에서 링크(1024 이상 매출 쓰기 사람에게는 행 3차와 같은 주소 — S1 식별자 링크 선례). 읽기 사람(대표)은 1024 이상에서도 이 링크로 들어간다
- `useSearchParams`: 상세는 `force-dynamic`(동적 렌더)이라 Next 16 문서대로 Suspense 경계가 필요 없다 — 상세 page.tsx 무수정

**Total deviations:** 6 (전부 Rule 1~3, 아키텍처 변경 없음)

## Known Stubs

없음.

## Threat Flags

없음 — 새 라우트 `/projects/issue-requests`는 계획의 T-06-104 · T-06-105 범위(페이지 `notFound()` + `listIssueRequests` 첫 줄 `projects.revenue` 보기 · 행 3차는 write일 때만 · 금액 키는 `ISSUE_REQUEST_DTO_SPEC` · 요약 금액은 `revenue.issued_amount`일 때만).

## 06.5 정리 대상

없음 — 이번 변경에 `evidence_amount` · `pickPaymentAmount` 새 읽기 0건(diff grep 0).

## 오케스트레이터 몫(아직 안 함)

이 실행자는 서브에이전트라 아래를 하지 않았다(완료로 표시하지 않음):

- ~~C17 독립 검토~~ — 완료: 판정 통과(막음 0 · 중간 0 · 낮음 1 · 참고 3), 보고서 /mnt/project-files/notes/06-review/06-21-review.md. 낮음 1건 반영(아래 「검토 반영」).
- ~~독립 DOM 감사~~ — 완료: 결함 7(D-1 높음 · D-2 ~ D-4 중간 · D-5 ~ D-7 낮음) · 관찰 6, 보고서 /mnt/project-files/notes/06-review/06-21-dom-audit.md, 증거 /mnt/project-files/06-review/pr-e/06-21/. D-1 ~ D-6 반영, D-7은 공용 동작이라 관찰(아래 「검토 반영」). 남은 것: 전체 게이트 한 번(CI)
- `/design-review`(+ Codex 디자인 검토) → `/qa` — 화면 영향(app/ `.tsx`·`.css`, `ui/table/Table.tsx`)
- `/review` — 코드
- `/cso` — 외부 입력(새 목록 라우트 · 서버 액션 `cancel` 필드)이 있어 판단 대상(돈 · 결재 경로 표에는 해당 없음)
- REQUIREMENTS.md PROJ-06 체크 — 06-23(「내 차례」 묶음)까지 걸친 요구라 이 실행자는 표시하지 않았다
- C19는 base 기준으로만 확인(0) — origin/main 머지 뒤 재확인은 PR 단계

## 검토 반영

| 지적 | 등급 | 처리 | 커밋 |
|---|---|---|---|
| 검토 낮음 — `lockIssueRequest`가 프로젝트 확인 전에 남의 프로젝트 요청 행까지 `FOR UPDATE`(조작한 페이로드 ∥ 그 프로젝트 정상 저장 → 40P01 여지, 롤백뿐) | 낮음 | 잠금 조건에 `project_id = $projectId`를 넣어 남의 행은 잠그지 않고 `NOT_FOUND`(취소 갈래 · 06-18 잇기 경로 둘 다). 잠금 순서는 프로젝트 행 → 요청 행 그대로. 통합 회귀 2건 — 다른 연결이 남의 요청 행을 쥔 동안 취소 · 잇기 저장이 잠금을 기다리지 않고 곧바로 `SaveRejectedError`(고치기 전 `waiting`으로 2건 실패) | f09d158 |
| D-1 200자 메모 한 건이 S17 표를 2.7k px로 늘림(4폭 넘침) | 높음 | 메모 · 프로젝트 칸을 격자 `minmax(0, max-content)` + 고정 em 상한(24em · 20em · 폰 9em) + 안쪽 `.clip` 말줄임 — 칸 최소 폭 0(구매 요청 품목 칸 선례), title 그대로 | 361e5a8 |
| D-2 폰 320 · 375에서 긴 값 없이도 넘침(최소 폭 369) | 중간 | D-1과 같은 변경 + 금액 2행 `합계 {금액}`을 두 묶음 사이에서만 줄바꿈(ui/num 외화 2행 규칙). E2E가 200자 메모 · 74자 프로젝트 이름 · 9억 행으로 1280 · 768 · 375 · 320 문서 넘침 0 · 표 넘침 ≤ 0 · 메모 말줄임 + title(고치기 전 1280 넘침 1859로 실패) | 361e5a8 |
| D-3 1024 미만 `?issueRequest`로 `신청됨` 도착 시 포커스 BODY | 중간 | 수화 스냅숏(넓은 폭)에서 잡은 `발행 줄로`가 실제 폭에서 사라져 생김. 대상은 editableWidth일 때만 `발행 줄로`, 아니면 줄(tabindex -1). 도착 기록에 폭을 두고 폭이 바뀌고 포커스를 잃었을 때만 다시 잡는다(사용자가 옮긴 포커스는 빼앗지 않음). E2E 900 · 375 줄 toBeFocused · 화면 안(고치기 전 inactive) | bce6b8c |
| D-4 확인 모달 1차 뒤 포커스 BODY(§7-17) | 중간 | 트리거(메모 칸)가 읽기 칸이 되어 포커스를 못 받음 → 모달이 닫힌 뒤 취소한 그 줄(tabindex -1)로. E2E toBeFocused(고치기 전 inactive) | 72313a7 |
| D-5 S17 프로젝트 링크 UA 기본 파랑 rgb(0,0,238) | 낮음 | 프로젝트 · 지출결의 목록 행 링크와 같은 `projects.module.css .link`(--accent · 밑줄). E2E 계산 색 === --accent(고치기 전 rgb(0,0,238)) | 89fc5b3 |
| D-6 취소로 바뀐 상태 칸에 dirty 표시 없음(§7-3) | 낮음 | Table `cellDirty` — `cancel` 줄의 상태 칸. E2E dirty 칸 1개(`취소` · 배경 --surface-dirty) → 저장 뒤 0개(D-4만 고친 상태에서 0개로 실패 확인) | 72313a7 |
| D-7 상태 필터 ArrowDown 한 번에 이동 · 이동 뒤 BODY | 낮음 | **관찰(같은 공용 동작) — 바꾸지 않음.** 실측(CI=true, 1280): 프로젝트 목록 상태 select도 ArrowDown 한 번에 `?status=bidding…`로 이동하고 이동 뒤 BODY — S17과 같다. 지출결의 `StatusFilter`도 같은 onChange 즉시 제출 + `key` 재마운트 코드(빈 목록이라 필터가 안 서서 실측은 못 함), 구매 요청 목록(S11)도 같은 `router.push` + `key`. 고치려면 목록 필터 공용 동작을 한꺼번에 바꿔야 한다 | — |
| 참고 2 — 목록 건수 · 행 두 조회가 다른 스냅숏 | 참고 | 바꾸지 않음(표시만 1건 어긋날 수 있고 새로 고침으로 회복) | — |
| 참고 3 — 비격자 Delete 갈래가 Backspace를 받지 않음 | 참고 | 바꾸지 않음(계획 문구는 `Delete` — /design-review · /qa 판단거리) | — |
| 참고 4 — 저장 안 한 편집 뒤 취소하면 편집이 버려짐 | 참고 | 바꾸지 않음(취소가 우선 — 타당) | — |

- 남은 후속(이번에 못 고침)
  - **revenue-section E2E 1건이 06-21 Task 1(2fe639a)부터 빨강** — `test/e2e/revenue-section.spec.ts:469`(「경영관리 1280 … 힌트 줄 없음」)의 `section.locator("kbd")` 0 기대에 2가 나온다. 발행 요청 표의 ConfirmDialog(닫힌 `<dialog>`, 버튼 `닫기 Esc` · `발행 요청 취소 Ctrl+Enter`의 kbd 둘)가 매출 섹션 안에 늘 그려져 있어서다. 이번 수정과 무관(그 칸 렌더 변화 없음)하나 CI가 잡는다. 고칠 길: 스펙을 보이는 kbd만 세게(`kbd:visible` — 의도는 「힌트 줄 없음」) 하거나 모달을 열 때만 그린다. 단독 재실행에서도 같은 1건이 실패해 결정적이다.
  - 폰 320에서 금액 10억 이상(예: 13자리)은 P1 세 열(희망 발행일 110 · 프로젝트 머리글 60 · 금액) 예산을 넘는다 — 375는 13자리까지 들어간다. 폰 P1 구성은 UI-SPEC 결정이라 바꾸지 않았다.
- 검토 반영 검증(로그 `/tmp/claude-0/fix-0621/`): `pnpm lint` 0 · `pnpm lint:sql` 0 · `pnpm typecheck` 0 · 단위 전체 304 파일 4578 passed · 통합 `issue-requests` + `leak-scan` 2 파일 4094 passed(격리 DB `erp_test_0621f`, flock) · E2E `CI=true`(격리 DB `erp_0621f_test`, flock) issue-requests 20 · projects-list 34 · quote-table 56 passed, `mobile-issue-requests-error` 1 passed. mobile-375가 desktop에 의존해 첫 실행이 desktop 전체(1292)를 돌았고 31 실패가 났다 — 대상 스펙 실패 0, quote-edit-scope · quote-line-status는 단독 재실행에서 통과(부하 중 로그인 대기 초과), revenue-section 1건은 위 후속. 그 밖(people · vendors · side-panel · settings · roles 등 이번 변경과 무관한 화면)은 재실행하지 않았다.
- 호출한 스킬(검토 반영): superpowers:systematic-debugging(320 넘침 원인 — 칸 폭 실측으로 금액 2행 nowrap · 프로젝트 머리글 최소 폭 확인) · superpowers:test-driven-development · design-gate(점검표 `docs/design/checks/2026-10-13-06-21-review-fixes.md`) · superpowers:verification-before-completion.

## Self-Check: PASSED

- 만든 파일 8개 존재 확인 · 커밋 aeae465 · 2fe639a · e035d12 · 017be31 · e1adc8a · 1043031 존재 확인(`git log`)
