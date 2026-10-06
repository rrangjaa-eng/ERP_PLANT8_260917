---
phase: 06-payment-evidence-cards
plan: 05
subsystem: payments
status: complete
tags: [corp-card-usages, money, drizzle, next-safe-action, zod, side-panel, playwright, leak-scan]

requires:
  - phase: 06-payment-evidence-cards
    provides: "06-27 corp_card_usages 표 · XOR CHECK · cards.proxy 메뉴 · card_usage.value/amount 정보 항목 / 06-30 CardOwnerKind shared / 06-03 loadTaxRates(usedOn) · tx 규약 / 06-29 / C15 PickDialog · remainingForInstallments · searchVendorsForPick"
provides:
  - "precheckCardUsage(viewer, input)(트랜잭션 밖) → createCardUsage(viewer, input, pre, tx?)(몸통 runCreate — 단독/외부 tx)"
  - "cardOptionsForUsage(viewer, usedOn) — 소지자 본인 · 사용일 소속 팀 카드 + cards.proxy write면 공용 카드"
  - "listCardUsages(viewer, { month, cardId?, link?, proxyOnly?, page? }, today) — 범위 · 필터 · 50건 쪽 · 서버 합계 · 카드 선택지 · 등록 필터 여부"
  - "cardUsageFormDefaults(viewer, today) — 직전 등록의 카드(옵션 안일 때) · 연결 종류 · 사용일 오늘(M-4)"
  - "순수 함수 splitCardTotal · cardEvidenceDefault · isCardEvidenceRule · cardUsedOnError · cardExecutionCap({ execution, otherSupplies, supply, source: entry|reconciliation|settled })"
  - "repositories/corp-card-usages.ts — insertCardUsage(tx) · listCardUsageRows(scope · filter, tx?) · findLastCardUsageByRegistrant"
  - "Server Action createCardUsageAction · previewCardAmountsAction · searchMerchantsAction"
  - "/cards 목록(S8) · 옆 패널 등록(S9)"
affects: [06-07, 06-09, 06-12, 06-14, 06-25, 6.1-09]

actuals:
  tokens: 29500
  tasks: 4
  commits: 6
plan_head_before: ca9fe31789b71324cc29ca36337c7e339e661594

tech-stack:
  added: []
  patterns:
    - "목록 읽기도 withTransaction(lock_timeout 5s) 안 — 판정(can · 소속)은 tx 밖, tx 안은 목록 쿼리 하나"
    - "PanelForm dirty는 입력 이벤트 순간의 FormData — 이름은 보이는 칸에(숨은 칸은 다음 렌더에야 바뀐다)"

key-files:
  created:
    - domain/corp-card-usages/index.ts
    - domain/corp-card-usages/amounts.ts
    - repositories/corp-card-usages.ts
    - app/(app)/cards/card-usage-list.tsx
    - app/(app)/cards/card-usage-form.tsx
    - app/(app)/cards/actions.ts
    - app/(app)/cards/actions.registry.ts
    - test/unit/domain/card-usage-amounts.test.ts
    - test/integration/corp-card-usages.test.ts
    - test/e2e/card-usage.spec.ts
    - docs/design/checks/2026-10-06-06-05-cards.md
  modified:
    - app/(app)/cards/page.tsx
    - test/integration/leak-scan.test.ts
    - test/unit/domain/project-status.test.ts
    - test/e2e/page-chrome.spec.ts
    - test/e2e/mobile-design-review-p2.spec.ts

key-decisions:
  - "06-05: 카드 사용 등록 게이트는 can(cards, write)가 아니라 카드 자격(cardOptionsForUsage) — 직원에게 cards 메뉴 권한 시드가 없다. 레지스트리 menu cards는 메타데이터"
  - "06-05: 카드 사용 목록 범위 — cards.proxy · expenses.payments write 권한자 · 전사 범위는 전부, 그 밖(팀장 포함)은 자기 카드 · 오늘 소속 팀 카드 + 자기 등록(리포지토리 쿼리 조건)"
  - "06-05: 목록 읽기를 withTransaction(lock_timeout 5s) 안에서 — 잠금 대기가 끝없이 늘지 않고 로드 오류 갈래로 간다(E2E가 표 잠금으로 재현)"
  - "06-05: D-75 옛 잠금 리터럴 스캔에서 domain/corp-card-usages/를 뺀다 — cardExecutionCap source \"settled\"(Q-E)는 잠금 상태 값이 아니다(사용자 확인 2026-10-06 20:04:28 KST 「예외 두기」)"

patterns-established:
  - "서버 렌더 목록의 로드 오류 E2E = pool.connect()로 ACCESS EXCLUSIVE 표 잠금 → lock_timeout → 오류 한 줄 → ROLLBACK → 다시 시도(router.refresh)"

requirements-completed: [EXP-07]

duration: 112min
completed: 2026-10-06
---

# Phase 06 Plan 05: 법인카드 사용 본인 등록 · 목록 Summary

**결제 합계만 받아 서버가 사용일 세율로 공급가 · 부가세를 역산하는 카드 사용 등록(옆 패널, 연달아 등록) · 범위가 리포지토리 쿼리에서 갈리는 `/cards` 원장 목록(필터 · 합계 면 · 50건 쪽 · 빈 화면 세 갈래 · 로드 오류) · 공용 카드는 `cards.proxy`만**

## Performance

- **Duration:** 약 112분
- **Started:** 2026-10-06T09:22:34Z
- **Completed:** 2026-10-06T11:15Z
- **Tasks:** 4 (+ 파일 한도 예외 커밋 2)
- **Files modified:** 16

## Accomplishments

- T1 트레이서: 1차 `카드 사용 등록` → `?new=1` 옆 패널 → 팀 비용 · Ctrl+Enter → 패널 유지 · 첫 칸 포커스 · `카드 사용 등록됨 · N`(role=status) · 뒤 목록 카드 그룹 행 · action_log document_create 1줄 · 되돌리기 없음
- T2: 공용 카드는 `cards.proxy` write만 — 옵션에서 빠지고 `precheckCardUsage`가 ForbiddenError
- T3: `splitCardTotal`(vat_surcharge = grossFromTotal · none = 합계, 잔차 = 재계산 부가세 기준 CROSS R-1) · 외화(toKrw) · 증빙 종류 옵션(vat_surcharge · none만) · 사용일 상한(Q6, zod + precheck) · `cardExecutionCap` 다섯 갈래
- T4: 목록 범위 · 필터(월 · 카드 · 연결 · 등록 권한자만, GET) · 합계 면(서버 sumKrw · N건) · 50건 Pagination · 등록 칸(`경영관리 등록` 600 + 2행) · 빈 화면 세 갈래 · 로드 오류 한 줄 + 2차 `다시 시도` · M-4 새 건 기본값 · 누수 스캔 계급 케이스

## Task Commits

1. **Task 1: 본인 등록 트레이서** — `ad59b034` (feat)
2. **Task 2: 공용 카드 사용 자격** — `38537c65` (feat)
3. **Task 3: 역산 · 외화 · 증빙 옵션 · 사용일 상한 · 실행가 상한** — `1fbbbad9` (feat)
4. **Task 4: 목록 완성 · M-4 기본값 · 누수 스캔** — `02b41d4c` (feat)
5. **파일 한도 예외: D-75 스캔 예외** — `b402ddef` (test)
6. **파일 한도 예외: page-chrome · mobile-design-review-p2** — `719d1731` (test)

## ⓪ 게이트 (전부 있음)

- C15: 05-13-SUMMARY · `ui/pick-dialog/PickDialog.tsx:96` · `remainingForInstallments` `domain/money/index.ts:235` · `searchVendorsForPick` `domain/expenses/pick.ts:53`
- 06-27: `corp_cards_owner_kind_check` `db/schema/corp-cards.ts:32`
- 06-30: SUMMARY · `"shared"` `domain/corp-cards/index.ts:48`
- 06-27 usages: `corp_card_usages` `db/schema/corp-card-usages.ts:15` · `cards.proxy` `domain/permissions/menus.ts:43` · `card_usage.amount` `domain/permissions/info-items.ts:80`
- 06-03: `loadTaxRates` `domain/money/tax.ts:153`
- 06-29: SUMMARY
- 04.6: UI 파일 5개 있음

## Acceptance 실측

- `createCardUsage` `domain/corp-card-usages/index.ts:163` · 몸통 `runCreate` :169 — 범위 안 전역 db 판정 · 조회 0건, `recordAction(…, { tx: innerTx })` 1회, `withTransaction(runCreate)` 1건
- `loadTaxRates(input.usedOn)` :148(precheck) · :220(previewCardAmounts)
- `amounts.ts`는 settings · repositories를 import하지 않는다 · `remainingForInstallments` 2회
- zod 스키마(`app/(app)/cards/actions.ts:25-39`)에 공급가 · 부가세 · 원화 칸 없음(T-06-20)

## Tests

| 무엇 | 결과 |
|---|---|
| 단위 card-usage-amounts | 13/13 (T3 RED 확인 뒤 GREEN) |
| 통합 corp-card-usages | 4/4 (공용 자격 3 + Q6 1, Q6 RED → GREEN) |
| 통합 leak-scan + corp-card-usages(T4) | 2파일 3087/3087 (새 계급 케이스 RED — 대리 등록 권한자가 자기 것만 받음 — → GREEN) |
| E2E card-usage `CI=true` | 8/8 (시각 18 skip). T4 RED에서 Esc 「입력 버리기」 실패로 실제 버그 발견 → 수정 |
| E2E page-chrome + mobile-design-review-p2 + card-usage `CI=true --no-deps` | 29/29 (mobile-375 2건 포함) |
| E2E master-edit + people 전체 파일 `CI=true --no-deps` | 25/25 |
| 전체 단위 `vitest --project unit` | 4160/4160 |
| lint · typecheck | 0 · 0 |
| build | E2E webServer `pnpm build && pnpm start`(CI=true)로 성공 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 결제 합계 · 환율만 적고 Esc → 「입력 버리기」 없이 닫힘**
- **Found during:** Task 4 (E2E RED)
- **Issue:** 이름이 숨은 칸(`amount` · `fxRate`)에만 있어 PanelForm이 입력 이벤트 순간 읽는 FormData가 바뀌지 않았다(React가 숨은 칸을 다음 렌더에 바꾼다)
- **Fix:** 보이는 칸에 이름을 두고 숨은 칸 제거(제출 값은 상태)
- **Files modified:** app/(app)/cards/card-usage-form.tsx
- **Commit:** 02b41d4c

**2. [Rule 3] 로드 오류 E2E를 라우트 가로채기 대신 표 잠금으로**
- 서버 렌더 목록은 가로채기로 실패시킬 수 없다(RSC fetch 중단 → MPA 이동). 목록 읽기를 `withTransaction`(lock_timeout 5s) 안으로 옮기고, E2E가 `LOCK TABLE corp_card_usages IN ACCESS EXCLUSIVE MODE`를 잡은 채 `/cards` → 오류 한 줄 → ROLLBACK → `다시 시도` → 목록
- Commit: 02b41d4c

**3. [Rule 3] 새 CSS 모듈 없이 기존 토큰 인라인 두 곳**
- 다시 셈하는 동안의 계산 한 줄 `color: var(--text-faint)` · `경영관리 등록` `font-weight: var(--fw-medium); color: var(--text-strong)`. 필터 칸 · 합계 면은 `projects.module.css` 클래스 재사용(교차 라우트 CSS 선례)

**4. [Rule 1] 등록 직후 결과 한 줄이 막힘 이유(빈 결제 합계)에 가려짐**
- `showingResult` 동안 `blockedReason`을 미룬다 — 1차는 다음 입력 전 잠깐 켜져 있고 제출은 `handleSubmit`이 막는다

**5. 그 밖**
- 통합 픽스처의 새 계급에 `upsertVisibility(team.value · card_usage.*)` — `teamAtDate` 투영이 팀 노출을 본다
- 클라이언트가 domain 순수 함수 `cardEvidenceDefault`를 import
- 계획 밖 export `cardUsageFormOptions` · `previewCardAmounts` · `CardUsageLinkFilter` 재export
- `SHARED_CARD_FORBIDDEN` 문구(`공용 카드 등록 권한 없음 · 공용 카드는 경영관리`)는 UI-SPEC에 없다 — 직접 액션 경로에서만
- 월 필터 = 이번 달부터 12달 select(+ 쿼리로 온 다른 달)
- `cardUsageFormDefaults`가 `cardOptionsForUsage`를 한 번 더 조회(단순함 우선)

### 파일 한도 예외 (files_modified 밖)

| 파일 | 내용 | 확인 |
|---|---|---|
| `test/unit/domain/project-status.test.ts` | D-75 옛 잠금 리터럴 스캔에서 `domain/corp-card-usages/` 제외(Q-E source `"settled"` — 06-07 · 06-09 · 06-12가 이 이름에 기댐). 나머지 스캔 유지 | 사용자 확인 2026-10-06 20:04:28 KST 「예외 두기」 |
| `test/e2e/page-chrome.spec.ts` | 「자리 화면」 묶음에서 `/cards` 제거(실제 목록이 됨) · 제목 「셋」→「둘」 | 사용자 확인 2026-10-06 20:04:23 KST 「06-05에서 고침」 |
| `test/e2e/mobile-design-review-p2.spec.ts` | 카드 0장 직원은 빈 화면 버튼이 없으므로 카드 소지 직원의 `이번 달 0건` 빈 화면으로 2차 버튼 모양 · 44 터치를 잰다 | 같은 확인 |

- **시각 기준 사진:** `/cards` 화면이 바뀌어 `screen-routes.ts:47`(sysadmin) 기준 사진을 ready 전에 `visual-baseline.yml`로 다시 만들어야 한다(로컬 생성 안 함)

### 무관한 실패 조사 (master-edit.spec.ts:152 · people.spec.ts:293)

- desktop 전체 스위트가 의존 사슬로 끌려 돈 중단된 실행에서만 빨갰다(`보관됨` 미표시 · 패널 dialog hidden — 둘 다 `/admin/people`)
- HEAD에서 그 두 테스트 격리 4/4, 두 스펙 파일 전체 25/25 녹색
- 06-05가 바꾼 파일(ca9fe317..HEAD 16개)에 people · corp-cards 관리 코드 없음
- 같은 `master-edit.spec.ts:152` 부하성 실패가 ca9fe317 이전 06-30-SUMMARY(「부하 아래 한 번 빨갰고 격리 재실행 녹색」)와 04 deferred-items에 이미 기록됨 → 부하 · 순서성, 06-05 원인 아님. ca9fe317 전체 스위트 재실행은 비용(~35분)으로 하지 않았다

## Known Stubs

| 파일 | 내용 | 해소 |
|---|---|---|
| app/(app)/cards/card-usage-list.tsx (증빙 열) | 늘 `—` | 06-25 |
| app/(app)/cards/card-usage-list.tsx `linkText` | 견적 줄 연결 글자 `—`(이 플랜에서 그런 행은 생길 수 없다) | 06-07 |
| 등록 칸 `경영관리 등록` | 대리 등록 데이터가 없어 화면에 나올 수 없다 | 06-09 |

- 알려진 작은 결함(고치지 않음): 가맹점만 고르고 Esc → 숨은 칸이 이벤트 없이 바뀌어 dirty로 안 잡혀 바로 닫힌다

## 독립 검토 · 감사로 넘기는 것

- **Opus 독립 검토(risk: money) — 미실행(오케스트레이터 몫):** `runCreate` 경계 · `cardExecutionCap` · 공용 카드 자격
- **독립 DOM 감사(CI=true · 1280 · 375 · 320):** 320 필터 select 넷 줄바꿈 · 가로 넘침(긴 카드 이름) · 합계 면 줄바꿈 · 폰 연결 라디오 줄 · `가맹점 바꾸기` 터치 44 · 로드 오류 줄 `--status-danger` · 51건 이상 2쪽 첫 줄 그룹 머리글 반복 · 700~1023 P3 증빙 숨김 · 패널 계산 줄 faint

## Threat Flags

없음 — 새 표면은 계획의 threat_model(T-06-20~24 · 152 · 501~503) 안이다.

## Self-Check: PASSED

- 파일 12개 FOUND(위 key-files created 및 page.tsx)
- 커밋 ad59b034 · 38537c65 · 1fbbbad9 · 02b41d4c · b402ddef · 719d1731 FOUND
