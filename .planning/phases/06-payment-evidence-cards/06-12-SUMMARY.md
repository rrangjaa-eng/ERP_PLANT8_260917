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
- 구매 완료 처리 알림(옛 `purchase_handled`)을 요청자에게 보낼까 — 07 알림 페이즈 몫인지.
- S13 카드가 여러 장일 때 기본값(지금 비움 — UI-SPEC 「사용자 결정 남음」 자리): 직전 쓴 카드를 기본으로 둘지.

## 넘김
- 06-14: S11 결과 줄 · 요청 취소 · 상태 그룹(이 플랜은 `?done=` 행 유지만).
- 6.1: 구매 완료 건 카드사 파일 대사(카드 고치기 로그 `카드 고침 · {이전} → {새}`가 근거).
- 검증 레인: 독립 DOM 감사(S13 320 · 375 · 긴 품목 · 카드 Select 말줄임), `/review` + `/cso`(돈 경로), card-proxy 「수정 상한」 수화 시간 한 번 실패 관찰.

## 독립 검토 메모
risk: money 플랜 — Opus 독립 검토 1명이 볼 자리: `completePurchaseRequest` 잠금 순서(프로젝트 → 현재 줄 · 견적 줄 → 요청 행)와 `runCreate` 고정 연결 갈래(`settled` 판정을 잠근 행으로), `precheckCardUsageUpdate` 카드 고치기 갈래(권리 + 구매 권한 + 활성 카드), `?done=` keepId가 범위(scope) 조건을 지키는지(`listPurchaseRequestRows` — `scopeCondition` AND id).

## Known Stubs
없음.

## Threat Flags
| Flag | File | Description |
|---|---|---|
| threat_flag: new-action | app/(app)/cards/purchases/actions.ts | `completePurchaseRequestAction` · `previewPurchaseCompletionAction` — 서버에서 `cards.purchases` write 판정(사전 조회 첫 줄), zod 입력 검증, 미래 사용일 거부 |

## Self-Check: PASSED
