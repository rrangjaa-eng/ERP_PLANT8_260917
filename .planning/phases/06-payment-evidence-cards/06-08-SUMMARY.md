---
phase: 06-payment-evidence-cards
plan: 08
subsystem: purchase-requests · cards · quotes link picker
status: complete
tags: [EXP-10, purchase-request, line-door, Q3, X-1, X-2, X-5, S10, S11, S12]
requires: ["06-02", "06-03", "06-07", "06-27", "06-28"]
provides:
  - "구매 요청 신청 경로(precheck → 잠금 → 문 → 이중 연결 → 실행가 상한 → 번호 → INSERT → document_create 로그, 한 트랜잭션)"
  - "domain/purchase-requests: precheckPurchaseRequest · createPurchaseRequest · previewPurchaseSupply · listPurchaseRequests · searchLinesForPurchaseLink · purchaseRequestEntry"
  - "repositories/purchase-requests.ts: insertPurchaseRequest · readLockedLineFacts · listPurchaseRequestRows(범위 = 쿼리 조건)"
  - "gate rule purchase.line-door (구매 요청 입구 + 지출결의 입구 호출은 06-13)"
  - "card.dual-link-block 지출결의 쪽이 신청됨 구매 요청도 센다(06-07 리뷰 I-1)"
  - "/cards/purchases 목록(S11) + 옆 패널 신청(S12) + link-picker mode=purchase(S10)"
affects: ["06-09", "06-12", "06-13", "06-14", "06-25"]
tech-stack:
  added: []
  patterns:
    - "06-03 tx 규약 — precheck(트랜잭션 밖: 권한 · 설정 · 번호 서식 · 세율 · 거래처 증빙 규칙 · 완료 판정) / runCreate(tx 리포지토리 · 순수 함수 · 게이트 · recordAction { tx }만)"
    - "잠금 순서 프로젝트 행 → 견적 줄(id 순 FOR UPDATE) → 문서(06-07과 동일)"
    - "범위는 리포지토리 쿼리 조건(요청자 본인 OR 담당 PM), domain은 거르지 않는다"
key-files:
  created:
    - domain/purchase-requests/index.ts
    - repositories/purchase-requests.ts
    - app/(app)/cards/purchases/page.tsx
    - app/(app)/cards/purchases/purchase-request-form.tsx
    - app/(app)/cards/purchases/purchase-list.tsx
    - app/(app)/cards/purchases/purchase-status-word.ts
    - app/(app)/cards/purchases/purchases.module.css
    - app/(app)/cards/purchases/actions.ts
    - app/(app)/cards/purchases/actions.registry.ts
    - docs/design/checks/2026-10-06-06-08-purchases.md
    - test/integration/purchase-requests.test.ts
    - test/integration/fixtures/purchase-requests.ts
    - test/e2e/purchase-requests.spec.ts
  modified:
    - domain/rules/register.ts
    - domain/settings/keys.ts
    - app/(app)/cards/link-picker.tsx
    - test/integration/leak-scan.test.ts
    - test/unit/domain/rules-card-dual-link.test.ts
    - test/unit/settings/phase6-keys.test.ts
decisions:
  - "신청 자격 게이트 = projects view(플랜의 cards write가 아님) — 06-05 교훈: 직원 계급은 cards 시드가 없다. 연결 대상 판정도 06-07처럼 projects view"
  - "gate 순서 = 프로젝트 행 → 견적 줄 → 연결(계보) → purchase.line-door → card.dual-link-block(side card) → card.execution-cap(entry · pickable) → 번호 → INSERT → 로그"
  - "월 필터 기본 = 전체(이번 달 아님) — 처리 안 된 옛 신청이 기본 신청됨 보기에서 사라지지 않게"
  - "줄이 하나뿐일 때 라디오는 `견적 줄` 하나(팀 비용 라디오는 06-14)"
  - "패널 안 공급가 추정은 서버 액션 previewPurchaseSupplyAction(250ms 디바운스)으로 받고 늦은 응답은 키 불일치로 버린다"
metrics:
  duration: "약 100분(23:40Z → 00:50Z)"
  completed: "2026-10-07"
  tasks: 3
  files: 19
actuals:
  tokens: 32046
  tasks: 3
  commits: 7
plan_head_before: 171d5f785d2459b56f019555af69c1931166b436
---

# Phase 6 Plan 08: 구매 요청 신청 경로 (EXP-10 · S11 · S12) Summary

온라인구매 협력사 견적 줄에만 서는 구매 요청 신청 경로: 서버가 문을 다시 판정하고(`purchase.line-door`), 이중 연결 · 실행가 상한(카드 공급가 + 다른 신청됨 요청 예상 공급가)을 잠근 뒤 같은 트랜잭션에서 보고, 프로젝트별 `-C####` 번호를 매겨 저장하며, 목록 `/cards/purchases` · 옆 패널 신청 · S10 구매 요청 모드 줄 고르기를 낸다.

## ⓪ 게이트 (실행 전 확인 — 전부 있음)

1. 06-02/03: `allocateExpenseNumber` · `loadPurchaseRequestNumberFormat` · `allocatePurchaseRequestNumber` · `shareLockDocumentCounter(viewer,"purchase_request")` domain/document-numbering/index.ts · `PURCHASE_ONLINE_VENDOR_NAME` domain/settings/keys.ts · `resolveLineDoor` domain/quotes/line-door.ts:10
2. 06-07: `lockQuoteLines` repositories/quote-line-links.ts:37 · `lockProjectForLinkWrite` · `lineRoom` · `lineRoomHint` · `purchaseEstimateSupply` · `loadLineRoomBasis` domain/corp-card-usages/link-targets.ts · `card.execution-cap` · `card.dual-link-block` domain/rules/register.ts
3. 06-27: `purchase_requests` 표 · `purchase_requests_number_uniq` · `purchase_requests_link_url_check` db/schema/purchase-requests.ts:44 · `cards.purchases` 메뉴 · 정보 항목 `purchase_request.value/amount` domain/permissions/info-items.ts:81-82
4. 06-28: `closeExpense` domain/expenses (종결 지출결의는 문을 막지 않는다 — 통합 케이스로 확인)
5. 화면: `PickDialog` · `PanelForm` · `ListScreen` · `SidePanel` · `StatusTag`(`"구매 완료": "success"` · 맨 `신청됨` 키 ui/status-tag/status-map.ts:69) · `splitCardTotal` · `loadTaxRates`
6. 상태 낱말 한 곳: `app/(app)/cards/purchases/purchase-status-word.ts`(status-map.ts 미수정)

## Tasks

| Task | 이름 | 커밋 |
|---|---|---|
| 1 (tracer) | 신청 경로 트레이서 — 도메인 · 리포지토리 · 게이트 · 액션 · 페이지 · 폼 · E2E | 9fdde55 (RED) · ea63d8f (GREEN) |
| 2 | 통합 테스트(문 · 반대쪽 · Q3 · 완료 · X-1/X-2/X-5 · 동시 6건 · 링크 스킴 · 결번 · 로그) | 0d0911e |
| 06-07 I-1 | 지출결의 쪽이 신청됨 요청도 센다 | f5e2a47 (RED) · eb840bf (GREEN) |
| 3 | 목록 범위 · 누수 스캔 · E2E 여섯(막힘 · 구매 요청 모드 · Empty · 로드 오류 · 링크 아이콘 · S12 Esc) | bfbc718 · 2186823 |

SUMMARY 커밋 제외 단일 repo 커밋 7건(측정: `git rev-list --count 171d5f78..HEAD`).

## 검증 (실제 실행 — 전부 DATABASE_URL=…/erp_e0608_test)

| 명령 | 결과 |
|---|---|
| `vitest run --project integration test/integration/purchase-requests.test.ts` | 27 passed |
| `… test/integration/leak-scan.test.ts` | 3431 passed(구매 요청 누수 2건 포함) |
| `… purchase-requests + document-numbering + document-counters-concurrency + corp-card-usages` | 152 passed |
| `… expense-approval-lifecycle + expense-close + expense-installment-cap + corp-card-usages` | 122 passed(register.ts 변경 회귀) |
| `vitest run --project unit` | 279 files · 4275 passed |
| `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` | 모두 exit 0 |
| `CI=true playwright test test/e2e/purchase-requests.spec.ts`(프로덕션 빌드 포함) | 7 passed (+18 skipped = 다른 프로젝트 · 뷰포트) |
| `CI=true playwright test card-usage.spec.ts card-usage-panel-width.spec.ts`(link-picker 카드 모드 회귀) | 21 passed |

- 플랜 acceptance greps(runCreate 구간): 금지 토큰(`can(` 등) 0 · 줄 수 52 · 비주석 `lineRoom(` 1 · 순서 `lockProjectForLinkWrite( lockQuoteLines( findLineLinks( purchase.line-door card.dual-link-block card.execution-cap` · `recordAction(` 1건 전부 `{ tx }`.
- `domain/corp-card-usages/link-targets.ts` · `ui/status-tag/status-map.ts` · `app/(app)/**/status-display.ts` 미수정(`git diff 171d5f78..HEAD --stat`에 없음).

### 「동시 6건 번호 경합」 RED → GREEN
- RED: Task 1의 트랜잭션 전 서식 읽기(`pre.numberFormat`)를 임시로 `runCreate` 안(번호 매기기 바로 앞)에서 `loadPurchaseRequestNumberFormat()`으로 읽게 바꾸자 이 케이스가 5.9초 만에 `Error: 다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장`(lock_timeout 교착)으로 빨개짐. 되돌린(`git checkout -- domain/purchase-requests/index.ts`) 뒤 27 passed.
- 줄 잠금 변이 검사(06-07 리뷰 I-3): `repositories/quote-line-links.ts` `lockQuoteLinesQuery`에서 `.for("update")`를 임시 제거하면 「줄 잠금 — 풀 밖 연결이 줄 행을 잡고 실행가를 500,000으로 내려…」 케이스가 4.6초 만에 빨개짐(그 한 건만). 되돌린 뒤 녹색. 신청 ∥ 신청 두 건은 프로젝트 행 잠금이 이미 직렬화해 이 변이에 녹색으로 남는다(그래서 줄 잠금 전용 케이스를 따로 둠).

## 260907 대조 (읽기 전용 — 구현하지 않음)

옛 코드: `/home/user/erp_plant8_260907/server/src/purchases.ts`(이하 `옛`). 입력: ERP260907-CONTEXT.md §3-4, gap-audit.md(65·66·68·115·116), REPORT.md:101, 06-vs-260907-code.md.

| # | 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|---|---|---|---|
| 1 | 구매 요청은 결재 없음 · 신청 → 구매 → 증빙 | 옛 2030(POST /api/purchases) · gap-audit:69 | domain/purchase-requests/index.ts:168 | 같음 |
| 2 | 협력사 이름이 문을 가르고 서버가 다시 막는다(화면 감추기는 권한이 아님) | 옛 943-949 · 968-985 · 1010-1030 | domain/quotes/line-door.ts:10 · domain/rules/register.ts:393 · index.ts:181 | 같음 |
| 3 | 협력사 이름 비교 = 공백을 전부 걷은 정확 일치(「온라인 구매」 = 「온라인구매」, 부분 일치 아님) | 옛 943-949 | domain/quotes/line-door.ts:6-8(양끝 공백 + NFC) | 숨은 규칙(사용자 결정 필요) |
| 4 | 거절 문구 `구매 요청은 「{이름}」 협력사로만 올릴 수 있습니다` | 옛 957 | register.ts:393 `온라인구매 협력사 줄 아님 · 지출결의로`(UI-SPEC) | 계획 결정 |
| 5 | 고객 승인 뒤에만 요청(설정 `quote.approval_required`로 끔) | 옛 855-868 · expenses.ts `whyQuoteItemNotApproved` | 없음(index.ts:168 몸통에 승인 확인 없음 — 06-07 카드 쪽과 같은 결) | 숨은 규칙(사용자 결정 필요) |
| 6 | 행사에 들어가는 것은 견적 줄이 있어야 한다 | 옛 822-827 | index.ts:116-133(lineId 필수 · 줄 → 차수 → 프로젝트 확인) | 같음 |
| 7 | 보이는 행사만(`그런 행사가 없습니다`) · 그 행사의 줄인가 | 옛 829-854 | index.ts:116-133 · 168-177(차수 재판정) | 같음 |
| 8 | 신청 권한 = `purchase.create` | 옛 2030 | index.ts:118 `projects view`(플랜의 cards write와도 다름) | 계획 결정(06-05 교훈 — 아래 질문 1) |
| 9 | 사용중지(보관) 거래처 줄은 새로 못 고른다 `사용중지된 거래처입니다` | 옛 968-980 | 없음(문은 이름만 본다 index.ts:181) | 숨은 규칙(사용자 결정 필요) |
| 10 | 요청 금액 0 이하 거부 | 옛 1992-1996 | index.ts:124 · actions.ts:31 | 같음 |
| 11 | 업무상 금액 상한 없음(2026-08-08) | 옛 1980-1990 | index.ts:187-196 `card.execution-cap` 실행가 상한 | 계획 결정(Q3 사용자 결정 2026-10-05) |
| 12 | 오타 울타리 1,000억 미만 | 옛 1982-1990 `boundedMoneyField` | domain/money/index.ts:82(열 범위 ±1조) | 숨은 규칙(사용자 결정 필요) |
| 13 | 상품 주소 http/https만(`javascript:` 차단) · 2000자 | 옛 2009-2012 | index.ts:102-110 · db/schema/purchase-requests.ts:44 CHECK | 같음 |
| 14 | 개수(1~100,000) 칸 | 옛 1977-1985 | 없음(품목 한 칸 + 예상 금액) | 숨은 규칙(사용자 결정 필요) |
| 15 | 구매 장소 칸 | 옛 1998 | 없음(링크가 대체 — UI-SPEC 칸 정의) | 계획 결정 |
| 16 | 경품 표시 | 옛 1997 | 없음 | 계획 결정(REPORT.md:101 「버림」) |
| 17 | 상세(색 · 크기 · 옵션) | 옛 2020 `detail` | 메모(purchase-request-form.tsx) | 같음 |
| 18 | 요청자 = 로그인 사용자로 서버가 확정 | 옛 2041 | index.ts:206 `requestedBy: viewer.id` | 같음 |
| 19 | 완료 행사에는 못 올린다 | 옛 2101-2105(009 트리거) | index.ts:131 + `lockProjectForLinkWrite`(잠근 행 재판정) | 같음 |
| 20 | 번호는 생성 시 BEFORE INSERT 트리거, 전사 C 순번 | 06-vs-260907-code.md §번호(`020_functions.sql:4359-4395`) | index.ts:197 · document-numbering/index.ts:337(프로젝트별 `{번호}-C0001`) | 계획 결정(D-42) |
| 21 | 수주 비용 · 일반 관리비 갈래 | 옛 795-819 · 868-925 | 없음(06-14) | 계획 결정(06-14) |
| 22 | 목록 범위 = 올린 사람 + 보임 범위 | 06-vs-260907-code.md:70 | repositories/purchase-requests.ts:64-67 · index.ts:324-329 | 같음(구매 권한자 · 전사 범위는 계획 결정) |

숨은 규칙(사용자 결정 필요) = **5건**(#3 공백 일치 · #5 고객 승인 게이트 · #9 사용중지 거래처 · #12 오타 울타리 · #14 개수).

## 캡처·GPT 검사 대상 경로

- `/cards/purchases` — 목록(신청됨 기본 · 요청 0건 Empty · 필터 0건 · 로드 오류), 375 · 320 · 768 · 1280. 긴 품목명(말줄임 16em) · 긴 링크 URL · 요청 20건 이상(쪽 나누기).
- `/cards/purchases?new=1` — 연결 안 고른 상태(`연결 없음 · 연결 고르기` 막힘) + S10 구매 요청 모드(프로젝트 → 견적 줄 고르기: 비온라인 줄 `aria-disabled` + `거래처 … · 지출결의로` · 실행가 소진 · 반대쪽 지출결의 줄).
- `/cards/purchases?new=1&line={온라인구매 줄 id}` — 진입 줄 연결 텍스트 + `남은 실행가` 힌트 · 저장 뒤 결과 한 줄 `구매 요청됨 · {번호}` · 입력 버리기 확인(S12 partial).
- `/cards/purchases?new=1&line={비온라인 줄 id}` — 서버 막힘 `온라인구매 협력사 줄 아님 · 지출결의로`(패널 reason 줄).
- 구매 권한자(`cards.purchases` write)로 `/cards/purchases` — Empty `처리할 구매 요청이 없습니다`(요청이 하나도 신청됨이 아닌 DB 필요 — 실행자 E2E는 공유 DB에 신청됨 행이 남아 이 갈래를 결정적으로 만들 수 없어 DOM 감사로 넘김).
- 설정 `purchase.online_vendor_name`이 줄 거래처 이름과 어긋난 상태(S20 어긋남).

## 화면 검토 증거

- 독립 DOM 감사(CI=true 4폭): `/mnt/project-files/notes/06-review/06-08-dom-audit.md` — 결함은 같은 플랜 「검토 반영」에서 수정
- 합본 `/design-review`(Codex 실행·후보 8건 결함 아님, DOM 실측 결함 0): `/mnt/project-files/notes/06-review/183-design-review.md` 「플랜별 화면 검토 증거」 06-08 행, 원자료 `/mnt/project-files/notes/06-review/183-design-review-artifacts/`
- 합본 `/qa`(CI=true 흐름 21 통과, Low 3건 보고): `/mnt/project-files/notes/06-review/183-qa.md`

## 사용자 질문 후보

1. 신청 자격: 플랜은 `cards write`, 구현은 `projects view`(직원 계급에 cards 시드가 없어 신청을 못 하므로 — 06-05 교훈). 구매 요청 신청 권한을 별도 메뉴로 둘지?
2. 월 필터 기본: 이번 달이 아니라 전체(처리 안 된 옛 신청이 사라지지 않게). 이번 달 기본으로 바꿀지?
3. 새로 지어낸 문구(UI-SPEC에 없음): `예상 금액 0 이하 · 금액 고치기` · `품목 없음 · 품목 적기` · `온라인구매 줄 없음` · `구매 요청 목록 불러오지 못함`(+ `다시 시도`) · 줄 이유 `거래처 {이름} · 지출결의로`(거래처 정보를 못 보는 계급은 `온라인구매 협력사 줄 아님 · 지출결의로`).
4. 지출결의 쪽 막힘 문구(06-07 I-1): 요청만 `구매 요청 {M}건 연결됨 · 지출결의는 다른 줄`, 카드와 요청이 함께면 `카드 사용 {N}건 · 구매 요청 {M}건 연결됨 · 지출결의는 다른 줄` — UI-SPEC에 문구 없어 카드 쪽 06-07 형태를 따랐다. 맞는지?
5. 260907 숨은 규칙 5건(위 #3 · #5 · #9 · #12 · #14): 협력사 이름 비교를 공백 전부 무시로 할지 · 고객 승인 전 구매 요청을 막을지 · 사용중지 거래처 줄을 막을지 · 금액 오타 울타리(1,000억) · 개수 칸.
6. 줄이 하나뿐인 폼의 `견적 줄` 라디오 한 개 표시 — 06-14에서 `팀 비용`이 붙기 전까지의 임시 모양으로 둬도 되는지.

## Deviations from Plan

### 규칙 적용
**1. [Rule 3 - Blocking] 신청 자격 게이트를 `cards write`가 아닌 `projects view`로** — 직원 계급에는 cards 권한 시드가 없어 신청 자체가 불가(06-05 SUMMARY 교훈 · 06-07 연결 대상 판정과 같은 문). 위 질문 1.
**2. [Rule 3 - Blocking] 서버 컴포넌트가 클라이언트 모듈 값을 못 쓴다** — `PURCHASE_STATUS_VIEWS`를 `"use client"` 파일에서 export해 page.tsx가 `.find is not a function`으로 터졌다(typecheck는 통과, E2E가 잡음). `purchase-status-word.ts`로 옮김.
**3. [Rule 1 - Bug] react-hooks/set-state-in-effect** — 공급가 추정 상태를 이펙트 안에서 동기 setState하던 것을 `{key, krw}` 파생값으로 바꿈(`purchase-request-form.tsx`).
**4. [Rule 3] 워크트리 E2E 빌드** — `node_modules`가 저장소 밖 심링크라 Turbopack이 `Symlink [project]/node_modules is invalid`로 죽었다. 로컬 실행 동안만 `next.config.ts`에 `turbopack: { root: "/home/user" }`를 넣었고 **커밋하지 않고 되돌렸다**(설정 파일 커밋 금지). 
**5. 13개 파일 한도 초과(브리프 우선)** — 플랜 `files` 13개 밖 파일을 만들었다(아래 「플랜 밖 변경」).

### 플랜 지시와 다른 점
- 플랜 verify는 `pnpm db:dev && pnpm db:reset:test`지만 브리프(격리 DB `erp_e0608_test`만, 마이그레이션 · 시드는 테스트 러너에서만)를 따라 실행하지 않았다.
- 커밋 트레일러: 브리프는 `Claude Opus 5.5 (1M context)`를 요구하지만 실행 모델은 Sonnet 5.5라 시스템 지시의 `Co-Authored-By: Claude Sonnet 5.5`를 썼다.
- 훅 경고(커밋 접두어 `test(06-08)`)는 확인만 하고 진행했다.

## 플랜 밖 변경

- 새 파일: `app/(app)/cards/purchases/purchase-list.tsx` · `purchases.module.css` · `purchase-status-word.ts` · `test/integration/fixtures/purchase-requests.ts`(통합 · 누수 스캔 공용 픽스처) · `docs/design/checks/2026-10-06-06-08-purchases.md`(design-gate 점검표).
- `app/(app)/cards/purchases/actions.ts`에 플랜에 없는 `previewPurchaseSupplyAction`(예상 금액 → 공급가 추정, 패널의 실행가 초과 막힘용) — 등록 `actions.registry.ts`(projects view · dto null).
- `test/unit/settings/phase6-keys.test.ts` — `PURCHASE_ONLINE_VENDOR_NAME.readBy` 제거(플랜 지시)에 맞춰 기대값 보정.
- `test/unit/domain/rules-card-dual-link.test.ts` — I-1 단위 테스트 4건 추가.
- E2E 스펙이 전역 설정 `purchase.online_vendor_name`을 바꾸고(직렬) 끝에 되돌린다(원래 값 복원 · 없으면 빈 값).

## Known Stubs

없음. (`purchase-request-form.tsx`의 `팀 비용` 라디오 부재는 06-14가 채울 의도된 범위 — 위 질문 6.)

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-server-action | app/(app)/cards/purchases/actions.ts | `previewPurchaseSupplyAction`(projects view) — 줄 거래처의 기본 증빙 규칙으로 계산한 공급가 추정만 돌려준다. 견적 금액은 싣지 않는다 |
| threat_flag: vendor-name-in-reason | domain/purchase-requests/index.ts(searchLinesForPurchaseLink) | 줄 이유에 거래처 이름이 실린다 — `vendor.value`를 볼 수 있는 계급에게만(못 보면 일반 문구) |
| threat_flag: lock-table-test | test/e2e/purchase-requests.spec.ts | 로드 오류 E2E가 `LOCK TABLE purchase_requests`를 잡는다 — 격리 DB 테스트 전용 |

## 남은 일 / 넘김

- 06-09/06-12: 구매 요청 구매 완료 · 취소 처리(이 플랜은 신청만). 목록 `구매 완료` · `취소` 상태 보기와 낱말(`purchaseStatusWord`)은 준비돼 있다.
- 06-13: 지출결의 입구가 `purchase.line-door`를 `side: "expense"`로 호출(규칙은 이미 등록됨).
- 06-14: `팀 비용` · 수주 비용 · 일반 관리비 갈래와 폼 라디오.
- 독립 DOM 감사 · `/design-review` · `/qa`(위 「캡처·GPT 검사 대상 경로」).
- 위험 경로 없음(`db/migrations` · `db/schema` · 인증 · 권한 시드 미수정) — 이 PR은 세션 머지 가능 조건(게이트 기록 필요: `/review` + 화면 영향 게이트).

## Self-Check: PASSED

## 검토 반영

독립 검토(06-08-review.md) · DOM 감사(06-08-dom-audit.md) 지적 중 지시된 것만 고쳤다.

| 항목 | 조치 | 증거 |
|---|---|---|
| 검토 I-2 | 통합 5건 추가(현재 차수 밖 줄 · 조정 · 취소 · 보관 줄 · `projects view` 없는 계급) | 돌연변이 M7 1 빨강 · M9 2 빨강(조정 · 취소) · M12 1 빨강. 보관 줄은 `quote-lines` 리포지토리 `archived_at` 필터가 먼저 막는 동치 경로(테스트는 녹색 유지) |
| 검토 I-3 | 로드 오류 E2E를 표 잠금에서 뺐다 — 범위 밖 달(`?month=9999-12`)로 서버 목록 쿼리를 실제 실패시키고, `다시 시도`의 재요청은 `page.route`로 정상 주소로 돌린다. 다른 스펙이 쓰는 표 · 설정에 손대지 않는다 | purchase-requests + card-usage 함께 29 passed · 0 failed |
| 감사 D-1 | 폰(≤699.98px) `.itemCell` 상한 9em(링크 아이콘 44 포함). 새 토큰 없음. E2E 375 · 320 scrollWidth 단언 | 고치기 전 375에서 25px 넘침으로 빨강 → 녹색 |
| 감사 D-2 | `loading.tsx` 신설 — 제목 + `TableSkeleton`(expenses 선례) | build · typecheck · lint 통과. 지연 표시 DOM 실측은 독립 감사 재실행 몫 |
| 감사 O-1 | 진입 줄(`&line=`) 모드에서 막힘 · 서버 거부 글자 끝의 ` · 다른 줄 고르기`를 뺐다(앞부분만) | E2E 「[감사 O-1]」 녹색 |
| 검토 사소 | 한 줄짜리로 명백한 것은 없어 건드리지 않음 | — |

- 점검표: `docs/design/checks/2026-10-07-06-08-review-fixes.md`
- 사용자 질문 후보 추가: 월 값 `9999-12` 같은 범위 밖 달이 목록 500 오류로 이어진다(`monthBounds`가 잘못된 날짜를 만듦) — 이번엔 로드 오류 E2E의 실패 주입으로만 쓰고 고치지 않음(요청 밖). 고칠지 사용자 결정.
- 고치지 않은 것: 고객 승인 관문(I-1) · 신청 권한 · 월 필터 기본값 · 목록 팀 범위 · 문구 결정(D-1~D-5).
- PR #183 합본 게이트(wt/06-gate1 · erp_g1_test) /review m-1: 진입 줄 모드가 서버 거부 꼬리 ` · 카드 사용은 다른 줄`도 뗀다(되돌리기 줄 두 곳과 같은 두 꼬리) — 82c8c31b · E2E 「[183 m-1]」(a84bc76d RED) 녹색.
