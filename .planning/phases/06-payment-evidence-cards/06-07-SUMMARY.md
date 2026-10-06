---
phase: 06-payment-evidence-cards
plan: 07
subsystem: corp-card-usages · quotes · projects detail
status: complete
tags: [EXP-07, card-link, quote-line, out-of-quote, lineage, db-lock, S9, S10, S15]
requires: ["06-05", "06-28", "06-29"]
provides:
  - "카드 사용 → 견적 줄 연결(잠금 → 계보 → 이중 연결 → 실행가 상한 → INSERT)"
  - "카드 사용 → 견적 외 비용(저장 때 out_of_quote 줄 생성, 한 트랜잭션)"
  - "repositories/quote-line-links.ts: lockQuoteLinesQuery · lockQuoteLines · lineChains · findLineLinks · listLineVendorEvidenceTypes · listLinkProjects"
  - "domain/corp-card-usages/link-targets.ts: lockProjectForLinkWrite · currentLineForFixedLink · searchProjectsForCardLink · searchLinesForCardLink · lineCardSideFacts · cardLinkProjectChoice · cardLinkLineChoice · loadLineRoomBasis · lineRoom · purchaseEstimateSupply"
  - "gate rules card.dual-link-block · card.execution-cap · project.line-edit D-47 ③ 갈래 · N-3 보관 붙잡기"
  - "domain/quotes/lines.ts createOutOfQuoteLine · QuoteLineDto hasCardSideLinks · executionOverKrw"
  - "listProjectCardUsages + 프로젝트 상세 「법인카드 사용」 섹션(S15)"
  - "cardUsageFormDefaults(viewer, today, entry) — M-4"
affects: ["06-08", "06-09", "06-12", "06-13", "06-14", "06-25", "6.1-09"]
tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약 — precheck(트랜잭션 밖) / runCreate(tx 리포지토리 · 순수 게이트만)"
    - "잠금 순서 프로젝트 행 → 견적 줄(id 오름차순, 한 빌더 lockQuoteLinesQuery) → 문서"
    - "계보 사슬의 현재 줄 = 최신 차수 순번의 줄만(보관된 현재 줄 → 빠진 줄)"
    - "섹션 단위 액션 로드 — 실패해도 상세의 다른 섹션은 선다"
key-files:
  created:
    - repositories/quote-line-links.ts
    - domain/corp-card-usages/link-targets.ts
    - app/(app)/cards/link-picker.tsx
    - app/(app)/projects/[id]/card-usage-section.tsx
    - docs/design/checks/2026-10-06-06-07-card-link.md
    - test/unit/domain/rules-card-dual-link.test.ts
    - test/unit/repositories/quote-line-links-sql.test.ts
  modified:
    - domain/corp-card-usages/index.ts
    - domain/quotes/lines.ts
    - domain/rules/register.ts
    - repositories/quote-lines.ts
    - repositories/corp-card-usages.ts
    - app/(app)/cards/card-usage-form.tsx
    - app/(app)/cards/page.tsx
    - app/(app)/cards/actions.ts
    - app/(app)/cards/actions.registry.ts
    - app/(app)/projects/[id]/page.tsx
    - test/integration/corp-card-usages.test.ts
    - test/e2e/card-usage.spec.ts
decisions:
  - "도메인 입력은 linkKind 판별자를 유지(team_cost | quote_line | out_of_quote | null), 액션 스키마만 link 판별 합 — 기존 호출부(테스트 leak-scan · mobile 320 스펙) 무변경"
  - "연결 고르기의 문 = projects view(카드 자격이 아니라) — index.ts 자격 함수와의 import 순환을 피함"
  - "프로젝트 고르기 목록 = 보관 안 된 프로젝트 전부, 미수주 맨 뒤 · 번호 내림차순 · 50행"
  - "견적 외 비용 항목이 비고 가맹점도 없으면 `항목 없음 · 항목 적기`(서버) / 폼 빈 칸 `항목 1칸 비어 있음 · 항목 적기`"
  - "S15 섹션은 클라이언트에서 액션으로 불러온다(서버 컴포넌트 아님) — 섹션 로드 실패 · 다시 시도 · 라우트 가로채기 E2E를 위해"
  - "N-3 보관 붙잡기 · 실행가 초과 읽기는 06-13이 아니라 06-07에서(Q-G 추천안 — 아침 확인)"
metrics:
  duration: "105m"
  completed: "2026-10-06"
  tasks: 3
  files: 19
actuals:
  tokens: 48196
  tasks: 3
  commits: 6
plan_head_before: 72f1573b3fe29c68a74206d827c6eb161e036e1b
---

# Phase 6 Plan 07: 카드 사용 견적 줄 · 견적 외 비용 연결 / S10 / S15 Summary

법인카드 사용을 견적 줄(계보 사슬 전체의 연결 · 이중 연결 막음 · 실행가 상한)과 견적 외 비용(저장 때 out_of_quote 줄을 한 트랜잭션에 생성)에 잇고, S10 패널 위 고르기 · 새 건 연결 기본값(M-4) · 프로젝트 상세 「법인카드 사용」 섹션(S15)까지 끝냈다.

## ⓪ 게이트 (실행 전 확인 — 전부 있음)

1. C15: 05-13-SUMMARY 추적됨 · `listNumberedByLines` repositories/expenses.ts:278 · `PickDialog` ui/pick-dialog/PickDialog.tsx:96 · `remainingForInstallments` domain/money/index.ts:235 · `listLineageLinesByProjects` repositories/quote-lines.ts:61(`isNull(archivedAt)`) · `findExpenseApprovalStatuses` repositories/expenses.ts:104
2. 04: `out_of_quote` db/schema/quote-lines.ts:31/49 · `quoteLockReason` domain/quotes/edit-scope.ts:127 · `CompletedProjectError` domain/projects/index.ts:72 · `insertQuoteLineIfAbsent` repositories/quote-lines.ts:122 · `resolveLinkedDocumentsByLineage` domain/quotes/lineage.ts:6 · `copiedFromLineId` schema:37 · `lockProjectForWrite` repositories/projects.ts:395 · `findLatestQuoteRevision` repositories/quote-revisions.ts:43 · `ProjectLineEditCtx` domain/rules/register.ts:38
3. 05: `expenses.quoteLineId` db/schema/expenses.ts:23
4. 06-05: SUMMARY 있음 · `runCreate` domain/corp-card-usages/index.ts:182 · `cardExecutionCap` domain/corp-card-usages/amounts.ts:62 · `cardUsageFormDefaults` index.ts:450
5. 06-27: `archivedAt` db/schema/corp-card-usages.ts:41 · `moneyColumns("estimate")` purchase-requests.ts:24 · `purchase_requests_quote_line_idx` :55
6. 06-28: SUMMARY 있음 · `closedAt` 조건 `listNumberedByLines` repositories/expenses.ts:299
7. 06-29: SUMMARY 있음 · `noun` 「프로젝트」 ui/pick-dialog/PickDialog.tsx:63

## Tasks

| Task | 이름 | 커밋 |
|------|------|------|
| 1 | 트레이서 — 잠금 → 계보 연결 → 이중 연결 → 실행가 상한 → 저장 + S10 고르기 | `4d487b28` (test) · `274b6510` (feat) |
| 2 | 견적 외 비용 · 계보 X-1 · N-1/N-2 · N-3 보관 붙잡기 · 실행가 초과 읽기 · 경합 X-2 · M-4 | `6d395f78` (test) · `ec943121` (feat) |
| 3 | 프로젝트 상세 「법인카드 사용」 섹션(S15) | `6a1b2821` (test) · `d9a4b499` (feat) |

## 검증 (실제 실행)

- Task 1: 단위 108/108(rules-card-dual-link · quote-line-links-sql · rules-gate · leak-scan-coverage · error-copy-noun-style · import-cycles) · 통합 45/45(expense-installment-cap · expense-pick · linked-documents-by-line · corp-card-usages) · E2E card-usage 11/11(CI=true, `--no-deps`) · typecheck 0 · 건드린 파일 eslint 0
- E-5 RED 확인: `lockQuoteLinesQuery`의 `orderBy`를 잠시 빼면 SQL 단위 테스트 1 failed / 5 passed → 되돌리면 녹색
- Task 2: 통합 RED 26 failed / 32 passed → GREEN corp-card-usages 58/58 · quote-lines + quote-line-kinds + quote-revisions 108/108 · 계보 회귀(linked-documents-by-line · expense-pick · expense-installment-cap + corp-card-usages) 92/92 · leak-scan 3268/3268 · 단위 전체 4238/4238 · `CI=true pnpm build` 0 · E2E card-usage + quote-table 70/70(CI=true, `--no-deps`)
- Task 3: 통합 RED 5 failed / 58 passed(`listProjectCardUsages is not a function`) → GREEN 63/63 · corp-card-usages + leak-scan 3391/3391 · 단위 전체 4238/4238 · `pnpm lint` 0 · `pnpm typecheck` 0 · `CI=true pnpm build` 0 · E2E card-usage + revenue-section 34/34(CI=true, `--no-deps`)
- 수용 기준 grep: runCreate 안 `project.line-edit createOutOfQuoteLine(` 순서 · createOutOfQuoteLine 금지 호출 0 · 35줄 · `domain/corp-card-usages` in lines.ts 0 · `lineCardSideFacts` in 상세 page 2 · lines.ts `hasCardSideLinks` 8 · quote-line-links `archivedAt` 3 · S15 `불러오지 못함 · 다시 시도` 1 · S15 `subtitle` **1**(아래 이탈 6)
- 통합 · E2E는 격리 DB `erp_e0607_test`에서만 돌렸다. 시각 기준 스냅숏은 만들지 않았다.

## 260907 대조 (읽기 전용 — 사용자 결정 「지금 당장 수정하지 말고 보고서를 보고 결정」, 구현하지 않음)

| 항목 | 260907(옛 구현) | 06-07(이번) |
|------|-----------------|-------------|
| 견적 외 비용 대상 | 행사마다 내부 줄 「법인카드 현장 경비」 하나를 찾거나 만들어 모은다(견적가 0 · 실행가 0 · `kind='internal'`, 분류 속성 `card_field_expense`로 찾음) — server/src/card-uses.ts:403-416, :609 | 카드 사용마다 `out_of_quote` 줄을 새로 만든다(실행가 = 공급가, 항목 = 입력 또는 가맹점 이름 — UA-615 · O-8) |
| 같은 행사 동시 생성 막기 | `pg_advisory_xact_lock(90176, projectId)` — card-uses.ts:417-419, :431 | 프로젝트 행 `FOR UPDATE`(`lockProjectForLinkWrite`) — 새 줄이라 겹침 자체가 없음 |
| 이중 연결(같은 줄에 카드 + 지출결의) | 줄이 그 행사 것인지만 본다 — card-uses.ts:595-605(지출결의 쪽 판정 없음) | `card.dual-link-block`이 계보 사슬 전체의 지출결의 · 카드 사용을 보고 막는다(06-28 종결 문서 제외) |
| 고객 승인 관문 | 사람이 고른 견적 줄에는 157 관문을 걸고, 내부 줄에는 걸지 않는다 — card-uses.ts:421-424, :534 `자리막힘` | 카드 연결에 고객 승인 관문 없음 — 상태 축(완료 · 정산 · D-47 ③)은 `project.line-edit` 한 곳 |
| 실행가 잠금 | 지출결의 제출이 그 줄 실행가를 잠근다(`is_cost_locked`) — server/src/quotes.ts:394, :2571 | 카드 쪽은 실행가 셀을 잠그지 않는다(UC-1) — 낮추면 DTO `executionOverKrw`로 표시만(N-3), 보관만 막음 |
| 프로젝트 고르기 범위 | 행 범위 `scopeCondition`(팀 · 작성자 · 프로젝트) — card-uses.ts:395 | 문 = `projects` view, 보관 안 된 프로젝트 전부(미수주 뒤) |
| 금액 저장 | 금액 · 부가세 두 칸 합으로 세포함 — card-uses.ts:1140 | 결제 합계 + 증빙 종류 규칙으로 서버가 공급가 · 부가세를 나눔(`splitCardTotal`, 세율 기준일 = 사용일) |

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] domain이 `@/db/client`를 import(boundaries lint)** — Task 1. `findLineLinks`의 `tx` 기본값을 리포지토리 안 `db`로 두고 domain에서는 tx를 넘기기만 한다. 커밋 `274b6510`.
2. **[Rule 3 - Blocking] `lineChains` 내보내기에 viewer 첫 인자 없음(`plant8/repository-viewer-param`)** — Task 1. viewer를 첫 인자로 더하고 SQL 단위 테스트 호출을 맞췄다. 커밋 `274b6510`.
3. **[Rule 1 - Bug] 보관된 현재 줄이 있으면 사슬이 앞 차수 줄(L1)을 현재 줄로 돌려줌** — Task 2(N-2 RED에서 발견). 05 `resolveLinkedDocumentsByLineage`가 「있는 줄 중 최대 순번」을 쓰기 때문. `lineChains`에 `latestSeq`(프로젝트 최신 차수 순번)를 넘겨 그 순번의 줄이 없으면 현재 줄 없음으로 한다. 커밋 `ec943121`.
4. **[Rule 1 - 테스트 픽스처] C10 케이스가 거래처 없는 줄(`noVendor`)에 지출결의를 만들려다 ZodError(`거래처 없음`)** — `fx.lines.withVendor`로 바꿨다(테스트 안). 커밋 `6d395f78`.

### 계획과 다르게 한 것(기본값 · 판단)

5. **S15 섹션을 서버 컴포넌트가 아니라 클라이언트 컴포넌트 + 액션(`listProjectCardUsagesAction`)으로 불러온다.** 플랜 수용 기준 「섹션 로드 실패(라우트 가로채기)에도 매출 섹션이 선다」와 2차 `다시 시도`는 섹션이 따로 요청해야 성립한다(04 이전 차수 섹션 선례). 액션은 files_modified 안의 `app/(app)/cards/actions.ts` · `actions.registry.ts`(menu `projects` view, dto `ProjectCardUsageDto`)에 뒀다.
6. **수용 grep `grep -c "subtitle" card-usage-section.tsx`가 0이 아니라 1.** 매치는 폰 행 `RowSheet`의 필수 prop `subtitle`(가맹점)이다. 섹션 부제는 없다(`DetailScreen.Section`은 `title`뿐). grep을 맞추려고 RowSheet를 빼거나 키를 숨기지 않았다 — 검토자 판단 필요.
7. **연결 라디오를 제어 칸으로 바꾸고 순서를 UI-SPEC S9 와이어(`견적 줄 · 견적 외 비용 · 팀 비용`)로 맞췄다.** 고르기 목록의 `견적 외 비용으로`가 라디오를 바꿔야 해서(SP-8). 숨은 칸 이름 `quoteLineId` → `linkTarget`(PanelForm 바뀐 칸 표식 — 제출 값 아님).
8. 서버 거부 문구 `항목 없음 · 항목 적기`는 UI-SPEC에 없어 `품목 적기` 꼴로 정했다. 항목 칸 `maxLength` · zod 상한 200.
9. 빈 섹션 첫 행동은 공용 `ListEmpty`(2차 모양 링크)로 그렸다 — UI-SPEC은 「3차」라 적었지만 앱의 빈 화면 첫 행동은 이 한 컴포넌트다.
10. 경영관리 등록 글자 굵기는 UI-SPEC의 600(`--fw-medium` · `--text-strong`, 카드 목록과 같음) — 플랜 문장의 `--fw-bold`가 아니다.
11. 줄 번호(`{번호} {항목}`)는 그 줄 차수 안의 보관 안 된 줄 순번(S10 줄 목록과 같은 셈). `createOutOfQuoteLine`에는 줄 상한 게이트 · 행동 로그 · 사용자 정의 칸 기본값이 없다(카드 사용의 `document_create` 행동 로그 한 건만).
12. Task 2 · 3의 E2E는 통합 RED → 구현 뒤에 썼다(같은 커밋 쌍의 test 커밋에 실림). 도메인 동작은 통합 RED를 먼저 봤다.

### 멈춤 대상(파일 밖) — 고치지 않음

- **`app/(app)/cards/card-usage-list.tsx`(files_modified 밖)**: 카드 사용 목록의 연결 열이 견적 줄 · 견적 외 비용 건에 `—`를 그린다(`linkText` — 06-05 주석 「06-07이 더한다」). UI-SPEC S8 `{프로젝트} · {줄 번호} {항목}` / `{프로젝트} · 견적 외 비용 · {항목}`가 아직 없다. 목록 DTO(`CardUsageListItemDto`)에도 줄 · 프로젝트 칸이 없다. 플랜에 이 파일이 없어 손대지 않았다 — 다음 플랜(06-09 또는 quick)에서 DTO + 열을 더해야 한다.

### 바깥 파일 사용(허용 범위)

- `docs/design/checks/2026-10-06-06-07-card-link.md` — 훅이 요구하는 design-gate 점검표(「화면:」 `app/(app)/cards/` · `app/(app)/projects/[id]/`).
- `test/e2e/card-usage.spec.ts`가 `test/e2e/expense-fixture.ts`의 `setupExpenseE2E`와 `test/integration/fixtures/expenses.ts`의 `submitReadyDraft`를 import(테스트 픽스처 — expense-list.spec 선례).

## Known Stubs

| 파일 | 줄 | 내용 | 해결 |
|------|----|------|------|
| app/(app)/cards/card-usage-list.tsx | 55-58 | 목록 연결 열의 견적 줄 · 견적 외 비용 글자가 `—` | 파일 밖 — 06-09 또는 quick(DTO + 열) |
| domain/corp-card-usages/index.ts | listProjectCardUsages | 구매 완료로 생긴 건의 등록 칸 `구매 요청 {번호}` 대신 등록자 이름(번호는 06-12 뒤) | 06-12 |
| app/(app)/projects/[id]/card-usage-section.tsx | 행 | 행 → 수정 패널(`/cards?editId=`) 링크 없음(지금은 폰 RowSheet만) | 06-09(플랜이 명시) |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-action | app/(app)/cards/actions.ts | `listProjectCardUsagesAction` — 프로젝트 id 입력, 문 = `projects` view, 금액은 `quote.amount` 투영 · 누수 스캔 녹색. 행 범위(팀 범위 프로젝트)는 상세 페이지와 같은 문 수준이다 |
| threat_flag: entry-params | app/(app)/cards/page.tsx | `?line=` · `?project=`는 UUID 모양만 받아 서버가 S10과 같은 고를 수 있음 판정으로 거른다(T-06-191) |

## 남은 일

- risk `[db-lock]` 플랜 — Opus 독립 검토 1명(오케스트레이터 몫), 화면 DOM 감사(CI=true, 320 · 375 · 768 · 1280)도 오케스트레이터 몫.
- N-3 · Q-G(보관 붙잡기 · 실행가 초과 읽기를 이 플랜에서)는 밤 위임 추천안 — 아침 확인.

## Self-Check: PASSED
