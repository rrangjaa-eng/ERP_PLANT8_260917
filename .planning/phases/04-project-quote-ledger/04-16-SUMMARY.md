---
phase: 04-project-quote-ledger
plan: 16
subsystem: revenue
status: complete
tags: [contract-derived, D-84, D-85, DR-15, DR-36, DR-3, B3, R2, revenue-section, info-items]
requires:
  - phase: 04-15
    provides: 견적 차수·고객 승인(customerApprovedAt) · 04-40 승인 차수 잠금
  - phase: 04-49
    provides: RevenueSection saveLocked · useEditableWidth 1024 게이트 · Table.saveLocked(aria-busy)
  - phase: 04-28
    provides: 거부 봉투 { rejected: { summary, cells } } · applyRejectedCells
provides:
  - domain/revenue deriveContract — 계약 금액 = 고객 승인된 현재 차수(최신 seq)의 견적 합계(공급가, 보관 줄 제외), 미승인이면 null + `{n}차 고객 승인 전`
  - repositories/quote-lines sumQuoteAmountByRevision(::bigint + mapWith(Number))
  - ContractInfo DTO { amountKrw, vatKrw, totalKrw, vatRateLabel, sourceLabel, pendingLabel } — contract는 quote.amount로 게이트(B-19)
  - revenue.issued_amount staffDefault=true(D-85) · issuedTotalKrw는 발행 항목으로 게이트(B-28)
  - app/(app)/projects/[id]/revenue-cells.ts — routeRejectedRevenueCells · revenueTableErrorText · otherCellsRejectedText
  - 매출 섹션 — 계약 금액 KvList 한 줄(입력 칸 없음) · 발행 읽기 표(PM) · 입금 표 부재 · 부제 분기 · 2행 두 nowrap 묶음 · 폰 접힌 줄 · 메모 PC 말줄임 · 표별 합계 행 거부 글자(B3·R2)
affects: [04-41, 04-18, 04-19]
tech-stack:
  added: []
  patterns:
    - "DTO 키 부재 = 표 부재 — issuedEntries/paidEntries를 각각 따로 판정"
    - "금액 셀 2행은 PC 전용(.pcSecondary), 폰은 P2 열 summary로 같은 묶음을 접힌 줄에 한 번만"
    - "숫자 묶음 nowrap · 구분자 ` · `는 줄바꿈되는 부모의 글자(NumberGroups)"
key-files:
  created:
    - app/(app)/projects/[id]/revenue-cells.ts
    - test/unit/app/revenue-cells.test.ts
    - test/integration/contract-invariant.test.ts
  modified:
    - domain/revenue/index.ts
    - domain/permissions/info-items.ts
    - repositories/quote-lines.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/integration/revenue-entries.test.ts
    - test/integration/visibility.test.ts
    - test/e2e/revenue-section.spec.ts
    - test/e2e/project-period.spec.ts
decisions:
  - "계약 금액 VAT 기준일은 승인 시각의 KST 날짜(new Date(kstDateOf(customerApprovedAt)), B-27) — 요율 라벨(vatRateLabel)도 DTO가 싣고 화면은 계산하지 않는다"
  - "D-85 발행액 기본 노출은 새 DB에만 들어간다(04-20 insert-if-absent 시드) — 기존 DB는 관리자가 기획 PM 행을 켠다"
  - "매출 표 합계 행 거부 글자는 거부 봉투 칸 수로 정하고 거부 요약과 같은 수명(다음 저장까지)이다"
  - "저장 중 추가 버튼은 04-49 관례대로 무동작(비활성 아님)"
metrics:
  duration: 47m
  completed: 2026-09-26
actuals:
  tokens: 26000
  tasks: 3
  commits: 9
plan_head_before: f67876fbd95eef269b10fee35084982357943216
commits: 9
---

# Phase 4 Plan 16: 파생 계약 금액 · D-85 발행 노출 · 매출 표 폰 배치와 표별 거부 글자 Summary

계약 금액을 입력에서 "고객 승인된 현재 차수의 견적 합계"(D-84, B-27 VAT 기준일)로 바꿨다. 기획 PM에게 발행액을 읽기 표로 연다(D-85, B-28 게이트). 매출 표는 두 가지를 바꿨다.
- 폰 접힌 줄·nowrap 두 묶음·`서버 계산` 꼬리 삭제
- 거부 봉투 칸을 발행·입금 표로 떼어 내 표별 합계 행 글자(B3·R2)

## 커밋

| # | 해시 | 제목 |
|---|------|------|
| 1 | 0ca552a | test(04-16): add failing tests for derived contract amount |
| 2 | afca1d9 | feat(04-16): derive contract amount from approved current revision |
| 3 | 06a8e80 | test(04-16): add contract invariant and D-85 exposure tests |
| 4 | 7001bcc | feat(04-16): expose issued amount to planning PM and gate issued total by issued item |
| 5 | fd8150d | test(04-16): add failing unit tests for revenue cell routing and footer texts |
| 6 | ed96f5d | test(04-16): move revenue-cells unit test under test/unit/app |
| 7 | 856ccb5 | feat(04-16): route rejected revenue cells and build per-table footer texts |
| 8 | 9b57818 | test(04-16): add failing E2E for revenue tables D-85, phone layout and R2 |
| 9 | 06fba29 | feat(04-16): show issued read table to PM, phone collapsed row and per-table rejection text |

## 테스트 실행 결과(실제 실행 · 이 스펙 파일들에 있는 것만)

- 단위: `test/unit/app/revenue-cells.test.ts` 12 passed. 권한 단위 21 passed(Task 2 시점).
- 통합(Task 2 뒤 마지막 실행): contract-invariant · quote-approved-lock · revenue-entries · visibility · leak-scan · project-status, 합계 994 passed. Task 3은 domain을 건드리지 않아 다시 돌리지 않았다.
- E2E(dev):
  - revenue-section 10/10
  - project-period 18/18
  - quote-table + number-format 25/25
  - ledger-save-flow + quote-line-kinds + quote-edit-scope 53/53
- E2E `CI=true`(프로덕션 빌드): revenue-section + project-period + quote-table 44 passed(10 + 18 + 16).
- 게이트: `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0(0 issues) · `pnpm build` 0.
- 전체 `CI=true pnpm test`는 돌리지 않았다. 디스패치가 전체 `pnpm test`를 금지했다(아래 남은 일).
- `ui/table`, `package.json`, `pnpm-lock.yaml`은 plan_head_before 대비 diff 0이다.

## DTO 게이트 판정(필드 · 입금액 의존 · 게이트)

| 필드 | 입금액에서 역산 가능? | 게이트 |
|------|------------------|--------|
| contract(금액·부가세·합계·라벨) | 아니오 — 견적 합계 | `quote.amount`(B-19) |
| issuedEntries(금액·vatKrw·totalKrw) | 아니오 | `revenue.issued_amount` |
| issuedTotalKrw | 아니오 — 발행 줄 합 | `revenue.issued_amount`(B-28, 이 플랜에서 paid → issued) |
| paidEntries(computedGrossKrw 포함) | 입금액 자체 | `revenue.paid_amount` |
| paidGrossTotalKrw | 입금액 합 | `revenue.paid_amount` |
| balanceKrw(발행 − 입금 공급가) | **예** — 발행을 아는 사람은 입금을 역산한다 | `revenue.paid_amount` 유지 |

## Task별 요약

**Task 1 (tracer) — 파생 계약 금액.**
- `deriveContract`가 현재 차수(최신 seq)가 승인됐을 때만 합계를 낸다. 미승인이면 `—` + `{n}차 고객 승인 전`이다. 이전 승인 차수로 되돌아가지 않는다.
- VAT 요율은 승인 KST 날짜 기준이다. GAP 4 경계는 통합 테스트로 고정했다.
- 계약 입력 칸, 계약 저장 페이로드, 관련 props를 화면에서 지웠다. 서버 쪽 `saveRevenue`의 contract 쓰기 분기는 남겼다. 04-41이 지운다.
- `canSave`에서 `(canWrite && status !== "completed")` 항을 뺐다. 계약 칸이 없어 그 항이 가리키던 편집 대상이 없다.

**Task 2 — 불변식 · D-85 노출.**
- contract-invariant 8건은 처음부터 초록이었다(04-40 잠금이 이미 지킨다 → ENG-D11 미발동).
- 변이 검사로 이빨을 확인했다. 보관 줄 필터를 지우면 7/8이 실패했고, 확인 뒤 원복했다.
- `revenue.issued_amount` staffDefault를 true로 바꾸고, issuedTotalKrw를 발행 항목으로 게이트했다.

**Task 3 — 매출 섹션 화면.**
- 발행·입금 표를 따로 판정한다. 부제는 입금 표가 있을 때만 `· 입금액만 통장 합계`를 붙인다.
- EMPTY는 세 가지다. 읽기 전용은 `· 발행은 경영관리`/`· 입금은 경영관리`, 1024 미만 경영관리는 사실만, 편집 가능하면 사실 + 버튼.
- 입금 2행은 `USD … @…` · `공급가액 …` 두 nowrap 묶음이다. 폰에서는 2행을 숨기고 메모 열 `summary`로 접힌 줄(외화 · 공급가액 · 메모)을 만든다. 발행 행의 접힌 줄은 메모다.
- 메모 읽기 값은 PC에서 한 줄 말줄임이다.
- `quote-table.tsx`는 거부 봉투에서 `routeRejectedRevenueCells`를 **먼저** 부른다. 매출 칸은 `EntryDraft.cellErrors`(고정 오류 셀)로 가고 `rest`만 견적 줄로 간다.
- 합계 행 글자:
  - 발행·입금 표는 `revenueTableErrorText` 또는 `otherCellsRejectedText`다.
  - 견적 표 요약은 견적 줄 칸이 있을 때만 봉투 요약이고, 아니면 `otherCellsRejectedText`다.
  - 04-22의 `전부 거부 · 다른 칸 오류 N칸` 리터럴은 함수 호출로 바꿨다.
- 매출 칸을 고치면 그 칸 오류만 지운다. 매출 오류 칸도 저장 차단 수(`errorCellCount`)에 넣는다.
- 1024 게이트와 saveLocked는 04-49 배선을 그대로 쓴다. 폭 판정은 하나다. 발행 격자 `aria-busy`는 E2E로 확인했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 단위 테스트 경로 이동**
- 플랜 경로는 `test/unit/ui/revenue-cells.test.ts`였다. 그 경로는 eslint boundaries가 `ui` 테스트에서 `app/` import를 금지해 막힌다.
- `test/unit/app/revenue-cells.test.ts`로 옮겼다(ed96f5d).
- 절차 슬립: fd8150d는 eslint 1(boundaries 오류)인 채로 커밋됐다. 검사와 커밋을 한 명령에서 게이트 없이 돌렸다. 다음 커밋(ed96f5d)에서 eslint 0으로 바로잡았다.

**2. [Rule 1 - 테스트 정합] E2E 중복 텍스트 좁히기** (06fba29)
- 입금 공급가액 묶음이 이제 금액 셀 2행(PC)과 접힌 줄(PC에서 display:none) 두 곳에 있다. `page.getByText("공급가액 …")`이 strict 모드에 걸렸다.
- 두 단언을 입금 표 주 행(`tbody tr:not([aria-hidden])`)으로 좁혔다.
- 375 숫자 줄 측정은 client rect가 없는 숨은 노드를 건너뛰고, 보이는 접힌 줄의 숫자를 잰다.

**3. [Rule 1 - 테스트 정합] project-period.spec.ts (4)(9) 좁히기** (06fba29)
- D-85로 PM에게도 발행 표가 있고, R2로 그 합계 행에도 `전부 거부 · 다른 칸 오류 1칸`이 나온다. `page.locator("tfoot")`가 2개로 풀렸다.
- 두 단언을 견적 표 tfoot으로 좁혔다. 이 파일은 플랜 files 목록에 없다.

### 플랜과 다르게 한 것(판단)

- **F4 계약 금액 타이핑 E2E 삭제**(Task 1): 계약 입력 칸이 없어졌다. 발행액 쉼표 타이핑은 number-format.spec (e)가 계속 다룬다.
- **`vatRateLabel` DTO 필드 추가**(Task 1): 화면이 `부가세 10%`를 계산하지 않도록 DTO가 싣는다. 통합 테스트 toEqual에 필드를 더했다(강화).
- **D-85 시드는 새 DB에만 적용**: 04-20 시드가 비-sysadmin 노출 행을 insert-if-absent로 넣는다. 플랜 truth "시드 재실행으로 기존 DB에 반영"은 성립하지 않는다(probe_fallback대로 바꿈). visibility.test (e)(f)가 두 경로를 고정했다.
  - 새 DB에서는 팀장·본부장 계급도 staffDefault로 발행액을 본다. "팀장 행은 숨김 유지"라는 플랜 truth와 어긋난다.
- **E2E 데이터 준비는 도메인으로 했다**: 매출 줄은 `saveRevenue`, 견적 줄은 `saveQuoteLines`로 심었다. 화면 입력 경로는 04-41 범위다.
- **R2 E2E 사용자**: 플랜은 "경영관리 1280"이었다. 경영관리 계급은 견적 줄을 고칠 수 없어, role-pm 권한을 복사하고 매출 쓰기·모든 정보 노출을 더한 계급의 담당 PM으로 했다.
- **저장 중 추가 버튼은 무동작**: 플랜 behavior는 "비활성"이지만, 04-49 리뷰 S-2 관례와 기존 E2E대로 무동작이다.
- **저장 잠금·1000 E2E 범위**:
  - 저장 중에는 `aria-busy` · 발행액 readOnly · 추가 무동작을 단언했다. "다른 셀에서 Enter·글자 입력이 편집을 열지 않음 · 방향키 이동"은 E2E로 단언하지 않았다. 매출 표 입력은 항상 열린 `cell` 입력이라 editCell 진입 경로가 없다.
  - 1000은 읽기 표(grid role 없음) · 추가 버튼 부재 · EMPTY 사실만을 단언했다. 금액 셀 readOnly는 기존 S-4가 단언한다.
- **매출 표 합계 행 글자 수명**: 거부 봉투의 표별 칸 수로 정한다. 칸을 고쳐 오류 셀이 풀려도 글자는 다음 저장 시도까지 남는다. 견적 표 거부 요약과 같은 수명이다.
- **미수 표시 색**: 입금 합계 행은 danger → warning 순서로 잇는다. 기존 미수·초과 입금 글자의 색(`--fg`)은 바꾸지 않았다. 플랜 문구의 `--warning`은 적용하지 않았다.
- **계약 금액 2행 묶음 구조 변경**(Task 1 코드): 구분자 ` · `를 nowrap 묶음 밖(줄바꿈되는 부모)으로 옮겼다. 같은 `NumberGroups`를 입금 2행과 접힌 줄에 쓴다.

### 절차 편차
- Task 2 RED 테스트를 쓰기 전에 `test-driven-development` Skill을 부르지 않았다. GREEN 전에는 불렀다. 스킬 로그에 그대로 적었다.
- **독립 DOM 감사는 실행하지 않았다.** 이 실행자 환경에는 서브에이전트를 띄우는 도구가 없다. 실행자가 대신 재면 CLAUDE.md §6(감사는 실행자가 아닌 별도 에이전트)을 어긴다. 폭별 판정은 없다. 오케스트레이터 남은 일이며 WINDOWS.md에 unrun-verify로 적었다.
- 플랜 verify의 `CI=true pnpm test`(전체)는 디스패치 금지로 돌리지 않았다. 대상 스펙만 CI=true로 돌렸다. WINDOWS.md에 적었다.

## 느슨해진 테스트 단언(명시)

없다. 바뀐 단언은 모두 좁히기이거나 대상이 바뀐 것이다.
- `공급가액 5,000,000 · 서버 계산` → 입금 표 주 행의 정확 일치 `공급가액 5,000,000` + 섹션에 `서버 계산` 0개. 1,818,181,818도 같은 방식이다.
- PM 두 표 부재(`발행일` 0개) → 발행 읽기 표에 10,000,000 · grid 0 · 입금 표 0 · `입금일` 0 · 미수 0.
- project-period (4)(9) → 견적 표 tfoot으로 좁힘. 발행 표에도 같은 글자가 나오는 것은 revenue-section R2가 단언한다.
- 375 숫자 줄 측정 → 숨은 노드 건너뜀. 보이는 노드가 없으면 0을 돌려줘 여전히 실패한다.
- 삭제: F4 계약 입력 타이핑 E2E 1건(입력 칸 자체가 없어짐).
- revenue-entries (d)는 PM 키 집합이 D-85로 바뀌어 다시 썼다(`contract`·`issuedEntries`·`issuedTotalKrw`).

## UI-SPEC rev 5에 없는 사용자 노출 문구

없다. 확인한 문구는 모두 UI-SPEC rev 5에 있다.
- 계약 금액 2행: `부가세 10% …` · `합계 …` · `{n}차 고객 승인 합계` · `{n}차 고객 승인 전` — 412행
- 부제 `공급가액 기준` — S6
- EMPTY 네 변형 — 357행
- `오류 N칸 · 전부 거부` — 362행
- `전부 거부 · 다른 칸 오류 N칸` — 363행
- `합계 (공급가액 · N줄)` — 기존 문구

## 04-49 열린 항목(매출 표 입력이 열린 채 폭이 1024 아래로 줄면 입력이 사라질 수 있음)

**그대로 남긴다.** 이 플랜은 바꾸지도 고치지도 않았다.
- `app/(app)/projects/[id]/revenue-section.tsx:230`: `canEditEntries = canWriteEntries && editableWidth`
- `app/(app)/projects/[id]/quote-table.tsx:1434`: `editableWidth = useEditableWidth() || cellEditing` — 매출 표는 `onEditingChange`를 보고하지 않는다.
- 이 경로를 재현·검증하지 않았다.
- 곁가지: 04-49 SUMMARY 269행의 "계약 금액 입력이 1024 미만에서도 편집된다"는 Task 1이 계약 입력 칸을 없애 해소됐다.

## 관리자 조치(B-29)

기존 운영 DB에는 D-85 기본값이 들어가지 않는다(insert-if-absent). 관리자가 노출 설정에서 기획 PM(role-pm) 행의 `revenue.issued_amount`를 켜야 PM이 발행 읽기 표를 본다. 새 DB에서는 팀장·본부장 계급도 발행액을 본다. 원치 않으면 그 행을 끈다.

## RED 증거(TDD Gate Compliance)

- 모든 behavior-adding 태스크가 RED 커밋 → GREEN 커밋 순이다: 0ca552a→afca1d9, 06a8e80→7001bcc, fd8150d/ed96f5d→856ccb5, 9b57818→06fba29.
- 06a8e80의 contract-invariant 8건은 처음부터 초록이었다(기존 잠금이 지킴). RED는 같은 커밋의 D-85 노출 테스트이고, 불변식은 변이 검사로 이빨을 확인했다.
- vitest RED는 `gsd-tools check tdd-red-evidence`로 RED_EVIDENCE_OK를 받았다. vitest `--reporter=tap-flat`에는 node:test TAP 꼬리(`# tests/# pass/# fail`)가 없어서, ok/not ok 줄에서 꼬리를 만드는 스크래치 스크립트로 기록을 만들었다.
- Playwright RED(9b57818)는 TAP 리포터가 없어, 커밋 본문에 `5 failed / 5 passed`와 실패 이유를 적었다.

## NIT

- `test/e2e/number-format.spec.ts:25-27` 주석이 "tablesVisible로 두 표가 묶여 있다"고 적는데, 이제 사실이 아니다. 요청 범위 밖이라 고치지 않았다.
- `.noteText`의 `max-width: 40ch`는 토큰이 아닌 폭 값이다. 새 색·서체·radius는 아니고, SYSTEM.md의 `ch` 폭 관례를 따랐다.
- `revenueEntryIds`는 매 렌더 새로 만든다. onSuccess는 execute 시점 렌더의 값을 쓴다. 저장 중에는 줄 추가가 무동작이라 id가 바뀌지 않는다.
- 외화 입금 줄을 경영관리가 화면에서 고치면 `EntryDraft.amount`(=amountKrw)가 KRW로 저장된다. 기존 동작이며 04-41 범위다.
- PM의 0줄 발행 표는 거부 글자가 있을 때만 합계 행을 그린다(`alwaysShowFooter={issuedNote !== null}`).

## Known Stubs

없다.

## 남은 일(오케스트레이터)

1. 별도 에이전트(model sonnet, verification-before-completion 명시)로 `CI=true` 독립 DOM 감사를 돌린다. 대상은 S6 backstop 1280·1024·375·1000이다: 가로 스크롤 0 · 숫자 꺾임 · 375 P1 두 열 · 접힌 줄 묶음 줄바꿈 · 긴 메모 PC 말줄임 · 1000 읽기 표. 고칠 곳이 나오면 `project-detail.module.css`만 고친다.
2. 그 뒤 전체 게이트 `CI=true pnpm test`를 한 번 돌린다.
3. B-29 관리자 조치를 운영 DB 이관 체크리스트에 올린다.

## Self-Check: PASSED

- FOUND: app/(app)/projects/[id]/revenue-cells.ts · test/unit/app/revenue-cells.test.ts · test/integration/contract-invariant.test.ts
- FOUND 커밋 9개: 0ca552a afca1d9 06a8e80 7001bcc fd8150d ed96f5d 856ccb5 9b57818 06fba29
