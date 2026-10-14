---
phase: 06-payment-evidence-cards
plan: 23
subsystem: next-turn
status: complete
tags: [next-turn, S19, UA-611, O-15, B-C8, H-1, E-3, E-31, E-54, approvals]
requires: ["06-14", "06-19", "06-20", "06-21"]
provides:
  - listPhase6NextTurnItems — 지급 · 구매 · 발행 묶음 + PM 완료 전 점검 [막힘](05 listNextTurnItems가 결재 · 막힘 뒤에 붙인다)
  - listExpenseEvidenceSignals · pickExpenseEvidenceSignal — 기안자 증빙 신호(PN-6 우선순위) 한 곳
  - 05 닫힌 후보 필터 "expense_blocked_after_approval"(LIMIT 전에 SQL로 좁힘)
  - repositories/next-turn.ts — listSettlingProjectsOfPm · findOldestRequestedPurchaseAt
affects: ["06.5"]
requirements: [EXP-09, EXP-10, EXP-13, PROJ-06]
requirements-completed: [EXP-09, EXP-10, EXP-13, PROJ-06]
coverage: "EXP-09 · EXP-10 · EXP-13 · PROJ-06 — coverage.json 몫은 unclassified → unresolved (flagged), 근거 UI-SPEC S19 · O-15 · UA-611 · D-601 · D-611 · B-C8 · H-1"
tech-stack:
  added: []
  patterns: [원천마다 권한 먼저 보고 없으면 조회 안 함, 홈 조회 수 vi.mock+vi.fn(actual) 단언(E-31), 닫힌 후보 필터 유니언 확장(05 엔진 무변경)]
key-files:
  created:
    - domain/next-turn/phase6-items.ts
    - domain/expenses/evidence-signals.ts
    - repositories/next-turn.ts
    - test/unit/domain/next-turn-phase6.test.ts
    - test/e2e/next-turn-phase6.spec.ts
    - docs/design/checks/2026-10-13-06-23-next-turn.md
  modified:
    - domain/next-turn/index.ts
    - domain/expenses/index.ts
    - repositories/approvals.ts
    - app/(app)/home-approval-actions.tsx
    - test/integration/next-turn.test.ts
    - test/e2e/mobile-next-turn-approval.spec.ts
    - test/unit/row-scope-disposition.test.ts
key-decisions:
  - "지급 묶음은 06-15 listAllPaymentTargets를 한 번 부른다(쪽 순회 없음)"
  - "기안자 신호의 지급 · 선결제 · 면제는 repositories/payment-targets findListPaymentStatusByIds 한 쿼리로 읽는다"
  - "evidenceGateDecision은 gates=false로 부른다 — 확인 전은 기안자 몫이 아니다"
metrics:
  duration: "약 90분"
  completed: 2026-10-13
plan_head_before: ba46b2f1103c2e6a536ba425e49779a9301c338e
actuals:
  tokens: 20800
  tasks: 3
  commits: 6
---

# Phase 06 Plan 23: 「내 차례」 Phase 6 항목 Summary

경영관리에게 지급 · 구매 요청 · 매출 발행 요청 묶음 한 줄씩, PM에게 정산 프로젝트 완료 전 점검 [막힘], 기안자에게 증빙 신호 [막힘](선결제 증빙 N일 경과 > 증빙 없음 · 지급 대기 > 증빙 무효)을 05 「내 차례」 공급 함수 하나에서 낸다. 05 결재 엔진(domain/approvals/)은 바꾸지 않고 닫힌 후보 필터 유니언에 한 갈래를 더해 201번째로 오래된 문서도 홈에 서게 했다.

**06-23 시작 커밋:** `ba46b2f1103c2e6a536ba425e49779a9301c338e` (첫 커밋 전 `git rev-parse HEAD`)

## 한 일

| Task | 내용 | 커밋 |
|------|------|------|
| 1 (트레이서) | 지급 묶음 `buildPaymentBundle` — 예정일 지남·오늘 [오늘](`· 확인 전 N건`) / 이번 주 [대기] / 없음, 합계는 `expense.amount` 볼 때만. `listNextTurnItems`에 `options.today` · Phase 6 항목 이어 붙임, tag 유니언에 `오늘` · `대기` | RED `0a54dcc` → GREEN `936189e` |
| 2 | 구매 요청 묶음(06-14 서버 합계 + 가장 오래된 날짜 서버 집계, E-54) · 매출 발행 요청 묶음(06-21 `summarizeOpenIssueRequests`) · PM 정산 프로젝트 점검 [막힘](사전 조회 1회 + 프로젝트마다 계산, E-31). `repositories/next-turn.ts` 신설 | RED `127c22c` → GREEN `f20430e` |
| 3 | 기안자 증빙 신호 `domain/expenses/evidence-signals.ts` · `expenseBlockedAfterApproval` 교체(행동 `증빙 올리기` → `/expenses/{id}#evidence`) · 후보 필터 `"expense_blocked_after_approval"` · `HomeNextTurnError` 글자 `내 차례 불러오지 못함` · design-gate 점검표 | RED `145b2a5` → GREEN `729aa4e` |

## 이름 대응(실행 게이트 · 선행 의존 확인 결과)

| 플랜이 가정한 것 | 실제 |
|---|---|
| 06-19 `loadPreSettleInputs(viewer, projectId)` | `loadPreSettleInputs(viewer)` — projectId 없음(입력이 프로젝트와 무관). `computePreSettleCheck(viewer, projectId, inputs, tx?)` 그대로 |
| 06-19 `PreSettleInputs` 칸 | `allowances` · `onlineVendorName` · `scope` · `exposure` · `lineDoors` — 프로젝트별 칸 없음(E-31 가드 통과) |
| 06-15 쪽 없는 지급 대상 | `listAllPaymentTargets` 있음 → 한 번 부른다(쪽 순회 안 함) |
| 06-14 목록 합계 · 건수 | `listPurchaseRequests(...).totals: { count, estimateKrw \| null }` — 필터 전체(쪽 단위 아님, E-54 가드 통과) |
| 06-06 면제 기록 읽기 | `repositories/expense-evidence-reviews.ts`의 `listReviewStatusByExpenses` · `findReviewByExpense`. 이 플랜은 지급일 · 선결제 · 면제를 한 쿼리로 주는 `repositories/payment-targets.ts` `findListPaymentStatusByIds`를 썼다 |
| 06-27 칸 이름(E-3 후보 SQL) | `expensePayments.cancelledAt` · `expenseEvidenceReviews.status = 'waived'` · `expenses.prepaid` · `expenses.closedAt` |
| 06-27 · 06-28 메뉴 키 | `"expenses.payments"` · `"cards.purchases"` · `"projects.revenue"` 그대로 |
| import 고리 가드 | `domain/expenses/evidence-signals.ts`는 잎 모듈만 값 import(`@/domain/payments` · `@/domain/evidence-reviews` index 0건) — import-cycles 녹색 |

## TDD 기록(RED → GREEN)

- Task 1 RED `0a54dcc`: next-turn-phase6 단위 · 통합 지급 묶음이 단언에서 실패(모듈 부재 실패가 아니도록 스텁을 먼저 둠, 스텁은 테스트 커밋에 넣지 않음) → GREEN `936189e`.
- Task 2 RED `127c22c` → GREEN `f20430e`.
- Task 3 RED `145b2a5`(PN-7 문구 · 신호 · 후보 갈래) → GREEN `729aa4e`. 후보 갈래 회귀 확인: 등록을 잠시 `"unresolved_evidence_void"`로 되돌리면 201번째 두 건이 실패, 되돌려 녹색.
- E-3 실행 로그 두 줄(`--reporter=verbose`, erp_test_0623):
  - `✓ |integration| test/integration/next-turn.test.ts > 승인 뒤 막힘 후보 갈래 expense_blocked_after_approval (E-3 · R-3) > 증빙 0 승인 문서가 201번째로 오래돼도 홈에 선다 1073ms`
  - `✓ |integration| test/integration/next-turn.test.ts > 증빙 무효 [막힘] — 오래된 승인 문서 (A9 · adversarial F6) > 그 뒤에 승인된 문서가 200건 넘게 쌓여도 오래된 승인 문서의 증빙 무효 줄이 선다 1085ms`

## 검증(모두 이 세션에서 실행, 로그 /tmp/claude-0/exec-0623/)

- 단위 전체 `pnpm vitest run --project unit`: 305 파일 · 4597 통과 · 0 실패.
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0.
- 통합(격리 DB erp_test_0623, flock): next-turn · evidence-void · expense-approval-lifecycle · approvals-extensions 4 파일 90 통과. Task 2 때 purchase-requests · issue-requests · pre-settle-check 183 통과.
- E2E `CI=true`(격리 DB erp_0623_test, flock, 빌드 선행): `next-turn-phase6.spec.ts` + `wordmark-home.spec.ts` 7 통과 · 18 건너뜀(시각 스펙) / `--project=mobile-375` `mobile-next-turn.spec.ts` + `mobile-next-turn-approval.spec.ts` 8 통과.
- Task 3 acceptance grep: 잎 import 0 · `evidenceGateDecision(` 1 · `from(files)|countActiveByOwner` 0 · `"expense_blocked_after_approval"` 2 · `"unresolved_evidence_void"` 3 · 등록 1 · `git log --first-parent --no-merges ba46b2f1..HEAD -- domain/approvals/` 0줄 · 폰 스펙 `증빙 없음 · 지급 대기` 1 · `내 차례 불러오지 못함` 3 · `getByText("불러오기 실패")` 0.
- C19 위험 경로 grep(`git diff --name-only ba46b2f1...HEAD`) 0 · package.json · pnpm-lock.yaml · tokens.css diff 0 · 추가 줄의 `any` 0.

## 호출한 스킬

superpowers:test-driven-development · superpowers:verification-before-completion(커밋 전 훅 요구) · design-gate(home-approval-actions.tsx 수정 전, 점검표 `docs/design/checks/2026-10-13-06-23-next-turn.md`). superpowers:systematic-debugging은 쫓을 실패가 없어 부르지 않았다(첫 E2E의 webServer 60초 시간 초과는 콜드 빌드 때문 — `pnpm build` 선행으로 해소, 코드 원인 아님).

## Deviations from Plan

1. **[Rule 3 - 막힘] row-scope-disposition ⓓ 가드** — `repositories/next-turn.ts` `listSettlingProjectsOfPm`의 `.from(projects)` 읽기에 PROJECT_READ_DISPOSITION 항목이 필요했다. `test/unit/row-scope-disposition.test.ts`에 항목(pm_user_id = 보는 사람) 추가 · `computePreSettleCheck` 사유에 06-23 호출자 추가. files_modified 밖 파일. 커밋 `f20430e`.
2. **단위 「점검 넷」 중 PM 아님 · 정산 아님** — 리포지토리 조건이라 순수 단위가 아니라 통합(`… PM 점검 · 역할 범위 (06-23)`)에서 확인했다.
3. **06-06 면제 읽기 경로** — 플랜이 짚은 expense-payments · expense-evidence-reviews 개별 읽기 대신 기존 `findListPaymentStatusByIds` 한 쿼리(지급일 · 선결제 · 면제)를 썼다. 판정 함수(hasEvidence · evidenceGateDecision · prepaidDueInfo · listEvidenceVoidSignals)는 그대로 재사용.
4. **E2E 기안자 증빙 0 시드** — 제출 게이트 때문에 도메인 경로로 증빙 0 승인 문서를 못 만들어, 스펙이 `files.removedAt`을 직접 세운다(통합 removeAllFiles와 같은 꼴).

## 06.5 정리 대상

없음 — 이 플랜은 `evidence_amount` · `pickPaymentAmount`를 새로 읽지 않는다(추가 줄 grep 0). 지급 묶음 합계는 06-15 지급 대상의 `payableKrw`를 그대로 더한다.

## 오케스트레이터 몫(아직 안 함)

- 독립 DOM 감사(A4, 실행자 아닌 별도 에이전트, CI=true): S19 backstop loading(느린 응답 강제 · §7-4 · §7-7) · populated(경영관리 · PM · 기안 직원 · 대표 계정의 역할별 문구 · 태그 순서 · 6줄 상한) · long-text(긴 프로젝트 · 항목 이름 말줄임 + title) · 증빙 판정 overflow(무효 파일 섞인 파일 10개+ 문서의 기안자 신호) — 375 · 320 · 768 · 1280.
- `/design-review` + Codex 디자인 검토(`scripts/codex-design-review.sh`).
- `/qa`.
- `/review`.
- `/cso`(결재 경로 — `repositories/approvals.ts` 후보 필터).
- Opus 독립 검토 1명(`risk: [approvals]`).

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: domain/next-turn/phase6-items.ts · domain/expenses/evidence-signals.ts · repositories/next-turn.ts · test/unit/domain/next-turn-phase6.test.ts · test/e2e/next-turn-phase6.spec.ts · docs/design/checks/2026-10-13-06-23-next-turn.md — 모두 FOUND.
- 커밋: 0a54dcc · 936189e · 127c22c · f20430e · 145b2a5 · 729aa4e — 모두 FOUND(`git rev-list --count ba46b2f1..HEAD` = 6).

## 검토 후 수정 (Opus 수정자 · 독립 검토 06-23-review.md · DOM 감사 06-23-dom-audit.md)

- **D-1(중간) 긴 대상 글자** — `ui/next-turn/NextTurn.tsx:48` 대상 span `title={item.label}` · `ui/next-turn/NextTurn.module.css` PC `.grow` 한 줄 말줄임(:40-47, 대상이 인라인이라 블록인 `.grow`에 건다) · 폰 `.label` 두 줄 말줄임(:91-100) · 폰 `.why` `white-space: normal`. 단위 `test/unit/ui/next-turn-label-title.test.ts` · E2E `test/e2e/mobile-next-turn.spec.ts` 「긴 대상 글자 (06-23 D-1)」 · 점검표 D-1 줄. 커밋 `e89a8d1`.
- **D-3(낮음) SYSTEM 정본 오류 글자** — `docs/design/SYSTEM.md:1005` `내 차례 불러오지 못함` + 2차 `다시 시도` · `docs/design/DECISIONS.md` 2026-10-13 C13 정렬 한 줄. 커밋 `04149d2`.
- **검토 낮음-1 행 범위** — `repositories/next-turn.ts:14-25` `listSettlingProjectsOfPm(viewer, scope, pmUserId)` + `rowScopeCondition` AND, 호출부 `domain/next-turn/phase6-items.ts:108` `projectRowScope(viewer)`. 통합 「프로젝트 보기가 없으면(행 범위 none) 점검 줄이 없다」 · 처분표 이유 갱신. 커밋 `ff9613d`.
- **검토 낮음-3 묶음 조회** — `domain/expenses/evidence-signals.ts:32-40` 후보 문서 id를 모아 `ownersWithEvidence` 한 번(동작 같음). 통합 「여러 문서 한 번」(hasEvidence 0회 · ownersWithEvidence 1회). 커밋 `b124493`.

- **검증(수정 뒤)**: `pnpm lint` 0 · `pnpm typecheck` 0 · 단위 전체 306 파일 4598 통과 · 통합 `test/integration/next-turn.test.ts` 48 통과(격리 DB erp_test_0623f) · E2E `CI=true`(격리 DB erp_0623f_test, flock, `--project=desktop --project=mobile-375 --no-deps`) `next-turn-phase6` · `mobile-next-turn` · `mobile-next-turn-approval` 12 통과. D-1 E2E는 옛 CSS에서 붉음(대상 높이 120 > 49) 확인.

## 검토 후 남긴 것 (코드 변경 없음 — 기록만)

- **D-2(낮음) 폰 짧은 묶음 · 점검 줄이 3줄** — 07 입력으로 미룸(사용자 카드 대기, 추천 「07로 미루기」). D-1 수정 뒤에도 폰 대상은 두 줄까지 서므로 행은 최대 3줄(태그 · 대상 2줄 + 금액)이다. 2안(상황을 `reason`으로 옮김)은 05 「이유 칸 비움」 결정과 부딪혀 사용자 결정이 필요하다.
- **검토 낮음-2 LIMIT 200 상위 집합** — 후보 갈래는 일부러 상위 집합(증빙 필수 설정 · 선결제 기한은 훅이 판정)이라 훅이 버릴 문서가 200건 넘게 쌓이면 더 오래된 신호 문서가 밀린다. 빈도 낮음 · 설계대로. 필요해지면 `evidenceRequired`를 SQL 갈래 인자로.
- **참고-1** `expenseBlockedAfterApproval`(`domain/expenses/index.ts:437`)이 `seoulToday()`를 직접 써 `listNextTurnItems(…, { today })` 주입과 기준일이 다를 수 있다(테스트 주입 때만 의미).
- **참고-2** `findListPaymentStatusByIds`가 `deleted_at`을 보지 않는다 — 05 무효 갈래로 들어온 삭제 문서는 05처럼 `증빙 무효`가 설 수 있다(회귀 아님).
- **참고-3** `buildPaymentBundle`이 `payableKrw ?? 0`으로 더한다 — 06-15 목록 합계 규칙과 같은지 `/review`에서 맞춰 볼 것.
- **O-1** `더 보기 N건`이 링크가 아니다(`app/(app)/page.tsx:71` `moreHref` 없음) — PM 7 · 8번째 [막힘] 정산 프로젝트로 갈 길이 없다. 갈 곳 결정 필요.
- **O-2** `/` 로딩 표시 없음(`loading.tsx` · Suspense 없음, §7-7 LOADING과 다름) — 적용 전과 같음. 06-23이 홈 원천 조회를 늘려 체감 대기가 늘 수 있다.
- **O-3** 대표 폰 [결재] 줄 `열기` 25.5×49(폭 < 44) · outline none — 05-10 몫, 적용 전과 같음.
- **O-4** Phase 6 링크 착지(`#pre-settle-check` · `#evidence`) 뒤 포커스가 BODY — 해시 이동이라 스크롤만.
- **O-5** 행동 링크 접근 이름이 줄마다 같음(`점검 보기` ×6 · `증빙 올리기` ×3), `aria-describedby` 없음 — 목록 문맥상 통과.
- **O-6** 대표 320 [결재] 긴 줄 4줄 → 5줄은 시드 무작위 접미사 폭 차이(회귀 아님). D-1 수정으로 폰 두 줄 상한이 걸린다.


## 화면 검토 증거
| 항목 | 경로 |
|---|---|
| 독립 검토(Opus) | /mnt/project-files/notes/06-review/06-23-review.md |
| DOM 감사(Opus, CI=true) | /mnt/project-files/notes/06-review/06-23-dom-audit.md |
| 4폭 캡처 적용 전·후(ba46b2f 대비) | /mnt/project-files/06-review/pr-e/06-23/ |
| Codex 디자인 검토(/design-review, --base ba46b2f) | /mnt/project-files/06-review/pr-e/wave3-codex/06-23-codex.md — `/` 4폭, 지적 0. 캡처 DB가 비어 「내 차례」 행은 DOM 감사 실측과 수정 뒤 E2E(mobile-next-turn 2줄 이하)로 판정 |
