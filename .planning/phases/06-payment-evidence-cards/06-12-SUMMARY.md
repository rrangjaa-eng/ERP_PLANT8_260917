---
phase: 06-payment-evidence-cards
plan: 12
subsystem: cards / purchase-requests
status: complete
tags: [money, purchase-request, corp-card, transaction, lock-order]
requires: [06-08, 06-09]
provides:
  - completePurchaseRequest (한 tx — 카드 사용 생성 + 요청 purchased + purchase_process 로그)
  - S11 `구매 완료` 행 행동 · S13 옆 패널(카드 사용 폼 구매 완료 모드)
  - 구매 완료 건 카드 고치기(S9 수정)
affects: [06-14, 6.1 카드 대사]
tech-stack:
  added: []
  patterns: [precheck 밖 · tx 몸통은 tx repo만(06-03), 잠금 순서 프로젝트 → 현재 줄 · 견적 줄 → 요청 행]
key-files:
  created:
    - docs/design/checks/2026-10-07-06-12-purchase-complete.md
  modified:
    - domain/purchase-requests/index.ts
    - repositories/purchase-requests.ts
    - domain/corp-card-usages/index.ts
    - repositories/corp-card-usages.ts
    - app/(app)/cards/purchases/page.tsx
    - app/(app)/cards/purchases/actions.ts
    - app/(app)/cards/purchases/actions.registry.ts
    - app/(app)/cards/purchases/purchase-list.tsx
    - app/(app)/cards/card-usage-form.tsx
    - app/(app)/cards/card-usage-list.tsx
    - app/(app)/cards/page.tsx
    - app/(app)/projects/[id]/card-usage-section.tsx
    - test/integration/purchase-requests.test.ts
    - test/e2e/purchase-requests.spec.ts
decisions:
  - "구매 완료 사전 조회는 권한을 맨 먼저 본다(플랜 순서 「요청 → 상태 → 권한」보다 앞 — 권한 없는 사람에게 요청 존재 · 상태를 흘리지 않는다)"
  - "S13 가맹점 기본값 = 설정의 온라인구매 협력사(견적 줄 거래처가 아님 — UI-SPEC S13 「가맹점 = 온라인구매 협력사」)"
  - "처리한 행 제자리 유지 = `?done={id}`(목록이 상태 필터와 무관하게 그 행을 포함), 초과액 · 다음 포커스는 purchase-list 모듈 저장소로 넘긴다(가장 작은 방법)"
  - "카드가 여러 장이면 S13 카드 칸은 기본값 없는 Select(UI-SPEC 「카드(여러 장일 때)」 사용자 결정 자리)"
metrics:
  duration: "약 3시간(압축 전후 합산)"
  completed: 2026-10-07
estimate_ref: { tokens: 115000, tasks: 3 }
actuals:
  tokens: 39000
  tasks: 3
  commits: 5
plan_head_before: 01a2417
---

# Phase 06 Plan 12: 구매 완료(S11 → S13) · 카드 고치기 Summary

구매 권한자가 S11 `신청됨` 행 `구매 완료` → S13 옆 패널 → `Ctrl+Enter` 한 번으로, 한 트랜잭션 안에서 카드 사용(`registered_via=purchase` · `purchase_request_id`)을 만들고 요청을 `purchased`로 바꾸며 같은 tx `purchase_process` 로그를 남긴다. 실행가 상한은 계보의 현재 줄로 판정하고(Q3 고정 갈래 · N-1 · N-2), 완료 프로젝트는 막지 않고 초과액을 기록한다(Q-E · U-4). 구매 완료 건의 카드는 권리 + 구매 권한이 있을 때만 S9 수정에서 고친다.

## 커밋
| Task | 커밋 | 내용 |
|---|---|---|
| 1 RED | 2a1e33b | 트레이서 통합 3 · E2E 1 |
| 1 GREEN | 9396b7c | 도메인 · 리포(한 tx 구매 완료) |
| 1 UI | a54bc69 | S11 행 행동 · S13 패널 · 등록 칸 · 점검표 |
| 2 | 6bf795d | 통합 18 · E2E 3(동시 6건 RED → GREEN 포함) |
| 3 | 3741510 | 카드 고치기 도메인 · 폼 · 통합 6 · E2E M-5 |

## ⓪ 게이트 결과
1. `pnpm lint` 0 · `pnpm typecheck` 0(flock, 마지막 커밋 직전)
2. 단위 전체 `vitest --project unit` 280 파일 · 4294 통과 · 0 실패(card-usage-rights · leak-scan-coverage · error-copy-noun-style 포함)
3. 통합 `purchase-requests` · `corp-card-usages` · `corp-card-usages-proxy` · `leak-scan` 4 파일 · 3972 통과 · 0 실패(erp_e0612_test)
4. E2E CI=true desktop `purchase-requests` · `card-proxy` · `card-usage` · `card-usage-panel-width` 48 통과 · 0 실패(18 skipped = visual 프로젝트 자기 건너뜀), mobile-375 `--no-deps` `mobile-card-usage-320` 3 통과
5. build: E2E webServer의 CI=true `pnpm build`가 Task 3 코드로 통과(워크트리 node_modules 심볼릭 링크 때문에 임시 turbopack root 설정으로만 — next.config.ts는 매번 되돌림 · 커밋 안 함)

## 「구매 완료 동시 6건」 RED → GREEN
`precheckCardUsage`를 `runComplete` 안(요청 행 잠금 뒤)으로 임시로 옮기자 10초 경주 안에서 `expected [ '다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장', …(4) ] to deeply equal [ '이미 구매 완료 · 새로 고침', …(4) ]`(풀 고갈 → 잠금 시간 초과)로 빨갛고, 되돌린 뒤 `1 passed`.

## 돌연변이(보호를 빼면 빨개지는가)
| 뺀 보호 | 결과 |
|---|---|
| runCreate `source: … "settled"` → 늘 `"entry"` | Q-E 초과 · X-2 2건 빨강 |
| runComplete 요청 행 `status !== "requested"` 판정 삭제 | 동시 6건 빨강 |
| runComplete · runCreate `currentLineForFixedLink` 건너뜀 | N-2 빨강 |
| precheckPurchaseLink `capExclude: { requestId }` → `{}` | Q3 2 · Q-E 2 · X-2 · N-1 2 = 7건 빨강 |
| 카드 고치기의 `cards.purchases` write 조건 삭제 | 「권리 있음 · 구매 권한 없음 → 거부」 빨강 |
모두 되돌린 뒤 녹색 확인(`git diff` 무변화).

## 이름 대응(플랜 ↔ 코드)
| 플랜 | 코드 |
|---|---|
| `teamAtDate(요청자, 사용일)` | `findMembershipAtDate`(repositories) — precheckPurchaseCardUsage |
| `moveFocusToResult`(다음 행 없을 때) | PanelForm `succeed({ href })` 기본 동작, 다음 행은 `focusNextComplete` |
| 「L2 보관(fixture SQL `archived_at`)」 | drizzle `quoteLines.archivedAt` UPDATE |
| `pre.cardChange = { from, to }` | `{ id, from, to }`(새 카드 id를 함께 싣는다) |
| 06-27 표 `team_cost` 요청 직접 | 통합 `teamCostRequest()` drizzle INSERT |

## Deviations from Plan
**1. [Rule 1 - Bug] S11 `구매 완료` 링크를 감싼 span이 포인터를 가로챔** — Task 1 E2E. `data-purchase-complete` 래퍼 span이 RowActions 안에서 링크 클릭을 가로챘다(Playwright "intercepts pointer events"). 래퍼를 지우고 다음 행 포커스는 `a[href$="purchase={id}"]`로 찾는다. 커밋 a54bc69.
**2. [Rule 1 - Bug] S13 가맹점이 비어 열림** — 구매 권한자 E2E 역할에 `vendor.value`가 없어 투영이 가맹점을 지웠고, 동시에 기본값을 견적 줄 거래처로 잡고 있었다. UI-SPEC대로 설정의 온라인구매 협력사로 바꾸고 E2E 역할에 `vendor.value`를 더했다. 커밋 a54bc69.
**3. [Rule 2] 사전 조회 권한 판정을 맨 앞으로** — 플랜 순서(요청 → 상태 → 권한)보다 앞. 커밋 9396b7c.
**4. 관찰(원인 미확정)** — 2 워커로 4 스펙을 돌린 한 번에서 `card-proxy.spec.ts:241` 「[06-09 수정 상한]」이 `waitForHydration` 5초 초과로 실패했다. 같은 코드로 다시 돈 두 번(26 · 48 통과)은 녹색. 이 플랜 변경이 수정 패널 수화를 늦췄다는 증거는 찾지 못했다 — 검증 레인이 CI에서 한 번 더 본다.
**5. 실행 사고** — 처음 E2E 묶음에 폰 스펙을 섞어 `mobile-375`의 `dependencies: ["desktop"]` 때문에 1150건 전체가 돌기 시작했다. 내 워크트리 프로세스만 멈추고(다른 워크트리 프로세스는 건드리지 않음) `--project=desktop` / `--project=mobile-375 --no-deps`로 나눠 다시 돌렸다.

## 플랜 밖 변경
- `app/(app)/cards/page.tsx` — **06-12 파일 한도 — app/(app)/cards/page.tsx 필요**: `purchaseNumber` 전달 한 줄(Task 1) + `toEditView`에 `cardOptions` 전달(Task 3). 최소 전달만.
- `app/(app)/cards/purchases/purchase-list.tsx` — S11 행 행동 칸 · 2행 · 다음 행 포커스(S11 성공 표시가 이 파일에 있다).
- `docs/design/checks/2026-10-07-06-12-purchase-complete.md` — design-gate 점검표(훅 요구).
- `domain/corp-card-usages/rights.ts` 변경 없음(`git log --grep=06-12 -- rights.ts` 빈 출력).

## 260907 대조
| 항목 | 옛 코드(/home/user/erp_plant8_260907) | 이 플랜 | 분류 |
|---|---|---|---|
| 구매 완료 권한 | `purchase.handle` 하나로 상태 바꾸기(server/src/purchases.ts:2450) | `cards.purchases` write | 같음 |
| 결과 기록 자리 | 같은 `purchase_requests` 줄의 `status_code` · `card_paid_date` · `confirmed_amount`(purchases.ts:2483-2494) | 별개 `corp_card_usages` 행 + 요청 `purchased` | 계획 결정(06-vs-260907-code §구조) |
| 동시 저장 | `updated_at` 일치 조건 UPDATE(purchases.ts:2489) | 프로젝트 · 줄 · 요청 행 `FOR UPDATE` + `version` | 계획 결정 |
| 구매 뒤 취소 | 어느 자리에서든 취소 · 전표 떼기(purchases.ts:2466-2476) | 구매 완료한 요청은 취소 없음, 고치기는 S9 | 계획 결정(Q2) |
| 실행가 판정 | 증빙대로 실행가 확정, 상한 막음 없음(purchases.ts:15) | Q3 고정 갈래 막음 · 완료 프로젝트는 초과 기록 | 계획 결정(Q3 · Q-E) |
| 처리 알림 | 처리하면 요청자에게 `purchase_handled` 알림(purchases.ts:2535-2544) | 없음 | 숨은 규칙 |
숨은 규칙 1건(구현하지 않음 — 넘김).

## 캡처 · GPT 검사 대상 경로
- `/cards/purchases`(S11 `신청됨` 행 `구매 완료` · 처리 뒤 `?done=` 행 2행 · ` · 실행가 초과` 경고 글자)
- `/cards/purchases?purchase={id}`(S13 — 첫 줄 · 링크 아이콘 · 카드 Select · 차이 줄 · 초과 힌트 · 막힘 줄, PC 480 · 폰 시트 · 320)
- `/cards?editId={구매 완료 건}`(카드 Select + `구매 완료 때 카드 …` 힌트)
- `/cards` · `/projects/{id}` 카드 사용 섹션 등록 칸 `구매 요청 {번호}` / `{처리자} MM-DD`

## empty 화면 검토 증거
- S13 empty(기본값으로 채워 열림): E2E 트레이서가 `결제 합계` = `110,000`(예상 금액) · 가맹점 = 온라인구매 협력사 이름 · 견적 줄 텍스트 · `견적 줄 바꾸기` 0개를 단언.
- S11 빈 목록은 06-08 그대로(이 플랜이 바꾸지 않음).
- 활성 카드 0장 갈래(`활성 법인카드 없음 · 카드 등록은 관리자` · 1차 비활성)는 코드에 있으나 E2E는 없다 — 공유 DB에 다른 스펙 카드가 늘 있어 0장을 만들 수 없다(DOM 감사 대상).

## 사용자 질문 후보
- 구매 완료 처리 알림(옛 `purchase_handled`)을 요청자에게 보낼까 — 07 알림 페이즈 몫인지. 보내게 되면 옛 규칙 「처리자 = 요청자면 안 보냄」 · 설정 `notify.purchase_handled` 켜기 조건도 함께(검토 260907 대조 — 숨은 규칙, 구현 안 함).
- S13 카드가 여러 장일 때 기본값(지금 비움 — UI-SPEC 「사용자 결정 남음」 자리): 직전 쓴 카드를 기본으로 둘지.
- (검토 I-4) 완료 프로젝트 줄의 실행가 초과 구매 완료는 초과액이 `purchase_process` 로그 상세에만 남는데, `purchase_process`는 관리자가 끌 수 있는 로그 종류다(`ALWAYS_ON_ACTION_TYPES`에 없음 — `domain/action-log/record.ts:94-118`, 설정 `action_log.optional_types`). 끄면 Q-E 초과가 흔적 없이 들어간다. 끌 수 없게(06-04 `payment_cancel` 선례처럼 한 줄 추가) 할지, 그대로 둘지. 카드 고치기 `document_update` 요약(`카드 고침 · …`)도 같다. 고치지 않았다.
- (검토 반영 D-1) UI-SPEC S11 「폰에서도 … 행 안 `RowActions`」 대신 폰은 행동 칸을 숨기고 행 탭으로 `구매 완료`(바로 S13)를 연다 — 행 안에 두면 320에서 표가 넘쳤다. SYSTEM §7-3 (차) · 06-09 `/cards` 표 선례를 따랐다. 다른 안: 행동을 상태 칸 2행 자리에 쌓기(품목이 거의 보이지 않을 만큼 줄어 고르지 않음).

## 넘김
- 06-14: S11 결과 줄 · 요청 취소 · 상태 그룹(이 플랜은 `?done=` 행 유지만).
- 6.1: 구매 완료 건 카드사 파일 대사(카드 고치기 로그 `카드 고침 · {이전} → {새}`가 근거).
- 검증 레인: 독립 DOM 감사(S13 320 · 375 · 긴 품목 · 카드 Select 말줄임), `/review` + `/cso`(돈 경로), card-proxy 「수정 상한」 수화 시간 한 번 실패 관찰.

## 독립 검토 메모
risk: money 플랜 — Opus 독립 검토 1명이 볼 자리: `completePurchaseRequest` 잠금 순서(프로젝트 → 현재 줄 · 견적 줄 → 요청 행)와 `runCreate` 고정 연결 갈래(`settled` 판정을 잠근 행으로), `precheckCardUsageUpdate` 카드 고치기 갈래(권리 + 구매 권한 + 활성 카드), `?done=` keepId가 범위(scope) 조건을 지키는지(`listPurchaseRequestRows` — `scopeCondition` AND id).

## 검토 반영(독립 검토 06-12-review.md · DOM 감사 06-12-dom-audit.md)

커밋 5ec8a1f..c8ab98c(7개). 모든 항목은 실패 테스트(RED)를 먼저 커밋하고 고쳤다.

| 지적 | 처리 | 커밋 | 증거 |
|---|---|---|---|
| I-1 `전체` 보기 + `?done=` → 목록이 처리한 한 행만 · 다음 행 포커스 소실 | 기본 조건이 없으면(전사 범위 `전체`) keepId 갈래를 타지 않는다(`repositories/purchase-requests.ts` `listPurchaseRequestRows`) | ced70a3(RED) · 2cf0e58 | 통합 「[06-12 검토 I-1]」 1행 → 2행, E2E 「[06-12 검토 I-1]」 `전체` 보기 구매 완료 뒤 다음 `신청됨` 행 포커스 |
| I-2 card-proxy.spec.ts:241 — Esc 닫기 이동 응답 전 `수정` → 닫힌 SidePanel 재사용 | `/cards` 수정 `key=edit-{id}` · 등록 `key=new`, `/cards/purchases` 구매 완료 `key=purchase-{id}` · 신청 `key=new`(`ui/` 안 고침) | ced70a3(RED) · a9cea46 | E2E 「[06-12 검토 I-2]」 `/cards` 목록 RSC 응답 2.5초 지연 → key 전 `dialog 카드 사용 수정` 0개(빨강) → 뒤 녹색. card-proxy.spec.ts `--workers=2` 3회 연속 14/14 |
| I-3 테스트 공백(팀 비용 이중 완료 · 비활성 카드 · 금액 숨김 · 비구매 건 카드 고치기) | 통합 4건 추가(「[06-12 검토 I-3]」) | 5ec8a1f | 돌연변이 A(요청 행 FOR UPDATE 삭제) · D(includeInactive true) · G(precheckPurchaseLink amountVisible 늘 참) · E(카드 고치기 `registeredVia === "purchase"` 삭제) 각각 해당 케이스 1건만 빨강, 되돌린 뒤 4/4 |
| D-1 구매 권한자 폰 표 가로 넘침(320 sw 367 · 외화 행 419~431) | 행동 칸 P1 → P3(폰에서 숨김 — SYSTEM §7-3 (차)), 폰 행 탭: `신청됨` 행 → 바로 S13 · 그 밖 → 보기 전용 `RowSheet`(06-09 `/cards` 선례). 성공 뒤 포커스는 링크가 숨어 있으면 다음 `신청됨` 행 탭 자리. 품목 칸을 연결 칸과 같은 격자 `minmax(0, max-content)`로(최소 폭 0) | ced70a3(RED) · 0a0de35 | E2E 「[06-12 감사 D-1]」 320 · 375 × `신청됨` · `전체`(원화 + 외화 행) scrollWidth ≤ clientWidth(RED 때 320 +48), 375 행 탭 → S13 |
| O-1 외화 2행 nowrap(06-08부터) | 같은 원인 — `통화 금액` · `@환율` 묶음 사이에서만 꺾는다(`cards.module.css` `.secondaryWrap` · `.segment` 재사용) | 0a0de35 | 위 D-1 E2E의 외화 행 |
| O-2 결제 합계 칸 그냥 Enter → 구매 완료 실행 | UI-SPEC S13은 1차 `구매 완료 Ctrl+Enter`만 정했고 칸 안 Enter는 정하지 않았다(§7-15 「단일 칸 Enter 제출 막음」은 문서 화면 제자리 칸 규칙). → 구매 완료 모드에서만 입력 칸 Enter(Ctrl · Meta 없음)를 막는다. Ctrl+Enter · 1차 버튼은 그대로, S9 등록 · 수정은 바꾸지 않음 | ced70a3(RED) · f8c09d1 | E2E 「[06-12 감사 O-2]」 Enter 뒤 1.5초 안 구매 완료 POST 0 · 요청 `신청됨` → Ctrl+Enter로 처리 |
| O-3 카드 고치기 Select 첫 옵션 빈 `—` | **고치지 않음** — 빈 옵션은 공용 `ui/select/Select.tsx`가 늘 그린다(54행). 이 화면만 빼려면 공용 컴포넌트에 갈래가 필요하다(`ui/` 밖 국소 수정 불가). 빈 값을 고르면 `카드 1칸 비어 있음` 막힘이라 잘못 저장되지는 않는다. 넘김: 공용 Select 소유 플랜 | — | — |
| S-1 낡은 주석 · 점검표 문구(가맹점 = 견적 줄 거래처) | 주석 · 점검표 한 줄씩을 「설정의 온라인구매 협력사」로 | c8ab98c | 글만 |
| S-2 가맹점 기본값을 이름으로 찾음 | **고치지 않음** — 판단만 남긴 지적(같은 이름 거래처 여럿 · 10개 초과 시 다른 행). 견적 줄 `vendorId`를 쓰는 것은 UI-SPEC 「가맹점 = 온라인구매 협력사」 결정을 바꾸는 일이라 사용자 결정 몫 | — | — |
| S-3 `runComplete` `currentLineForFixedLink` · version 재확인을 테스트가 지키지 않음 | **고치지 않음** — 검토자도 언급만(다른 방어선이 같은 결과, 돈 위험 없음) | — | — |
| S-4 `purchaseNumber` 노출 범위(`card_usage.value` 계열) | **고치지 않음** — 금액이 아닌 번호, 정보 항목 설계 확인 몫(정보 항목 표를 바꾸면 권한 경로) | — | — |
| S-5 처리 결과 2행 초과액이 모듈 변수 | **고치지 않음** — 플랜 결정(「처리 직후」), 기록은 I-4와 엮임 | — | — |
| I-4 Q-E 초과 기록이 끌 수 있는 로그 종류에만 | **고치지 않음** — 「사용자 질문 후보」 | — | — |
| 260907 `purchase_handled` 알림 | **고치지 않음** — 「사용자 질문 후보」 | — | — |

플랜 밖 변경(검토 반영): `app/(app)/cards/page.tsx`(SidePanel key 두 줄 — I-2), `test/e2e/card-proxy.spec.ts`(I-2 재현 1건), `app/(app)/cards/card-usage-form.tsx`(O-2 키 처리 — 플랜 files_modified 안), 점검표 `docs/design/checks/2026-10-07-06-12-review-fixes.md`(design-gate 훅 요구).

검증(검토 반영 뒤):
- `pnpm typecheck` 0 · `pnpm lint` 0(flock)
- 통합 `purchase-requests` 65/65 · `leak-scan` 포함 2 파일 3822/3822(erp_e0612_test) · 관련 단위 3 파일 24/24
- E2E CI=true desktop `purchase-requests` · `card-proxy` · `card-usage` · `card-usage-panel-width` 52 통과 · 0 실패(18 skipped = visual), mobile-375 `--no-deps` `mobile-card-usage-320` · `mobile-corp-cards` 7/7, `card-proxy.spec.ts` `--workers=2` 3회 연속 14/14 · 14/14 · 14/14
- 임시 `next.config.ts` `turbopack.root`는 매번 되돌림(커밋 없음)

- PR #183 합본 게이트(wt/06-gate1 · erp_g1_test) /cso CSO-1: 구매 건 수정은 저장된 사용한 사람(요청자) 고정 · 팀 비용 팀 = 그 사람 사용일 소속 · 다른 사용한 사람을 보내면 거부 · 편집 DTO choosesUser 거짓 — 3156da81(0e530c1d RED) · 돌연변이 1. /review I-1: 연결 그대로 · 공급가가 늘지 않는 수정은 상한 재검사 없음, 늘리면 구매 건은 담당 PM 갈래 문구 — 2b61c7e8 · 돌연변이 2, 화면은 연결 고정 건에 `다른 줄 고르기` 막힘을 세우지 않음 — 783fdd11 · E2E 「[183 I-1]」. 캡처 대상: `/cards?editId=<완료 프로젝트 settled 초과 구매 건>`(막힘 줄 없음 · 1차 활성).

### 캡처 · GPT 검사 대상 경로(검토 반영분)
- `/cards/purchases`(구매 권한자, 폰 320 · 375 — 행동 칸 없음 · 행 탭 → S13 / 구매 완료 · 취소 행 탭 → 행 시트, `전체` 보기 + 외화 요청 + 구매 완료 행이 함께 있을 때 넘침 0 · 품목 말줄임 폭)
- `/cards/purchases?status=전체` → 구매 완료 → `?done=`(처리한 행 + 나머지 행 · 다음 `신청됨` 행 포커스, PC와 폰)
- `/cards/purchases?purchase={id}` 결제 합계 칸 Enter(패널 그대로)

### 화면 검토 증거(검토 반영분)
- (오케스트레이터가 채움)

## Known Stubs
없음.

## Threat Flags
| Flag | File | Description |
|---|---|---|
| threat_flag: new-action | app/(app)/cards/purchases/actions.ts | `completePurchaseRequestAction` · `previewPurchaseCompletionAction` — 서버에서 `cards.purchases` write 판정(사전 조회 첫 줄), zod 입력 검증, 미래 사용일 거부 |

## Self-Check: PASSED
