---
phase: 06-payment-evidence-cards
plan: 14
subsystem: cards / purchase-requests
status: complete
tags: [purchase-request, team-cost, foreign-estimate, cancel-undo, lock-order, list]
requires: [06-08, 06-12]
provides:
  - 팀 비용 구매 요청(TC 번호 · 요청자 오늘 소속) · 외화 예상 금액 · S12 `견적 줄`/`팀 비용` 연결
  - cancelPurchaseRequest · undoCancelPurchaseRequest(게이트 재통과 — X-1 · X-2 · N-1 · N-2 · Q3 빼기)
  - S11 행 `요청 취소` · 결과 줄 `되돌리기` · 남의 요청 사유 확인 창 · 취소 행 2행
  - S11 그룹 · 합계 줄 · `countOpenPurchaseRequests` · S8 하위 링크 `구매 요청 {N}`
affects: [06-18, 6.1]
commits: 11
plan_head_before: c29a013
key-files:
  created:
    - app/(app)/cards/purchases/cancel-undo.tsx
    - test/e2e/purchase-requests-finish.spec.ts
    - test/e2e/mobile-purchase-requests-finish.spec.ts
    - docs/design/checks/2026-10-07-06-14-purchases-finish.md
  modified:
    - domain/purchase-requests/index.ts
    - repositories/purchase-requests.ts
    - app/(app)/cards/purchases/page.tsx
    - app/(app)/cards/purchases/actions.ts
    - app/(app)/cards/purchases/actions.registry.ts
    - app/(app)/cards/purchases/purchase-list.tsx
    - app/(app)/cards/purchases/purchase-request-form.tsx
    - app/(app)/cards/link-picker.tsx
    - app/(app)/cards/page.tsx
    - app/(app)/cards/card-usage-list.tsx
    - test/integration/purchase-requests.test.ts
    - test/unit/app/cards-page.test.ts
decisions:
  - "팀 비용 요청의 팀은 저장하지 않는다 — 구매 완료(S13)에서 요청자의 사용일 소속으로 푼다(O-19)"
  - "요청자 본인 취소는 사유 없이 즉시 · 구매 권한자의 남의 요청 취소는 사유 필수 + 되돌리기 없음(되돌리기는 사유 없는 본인 취소만)"
  - "취소 되돌리기 문 판정은 취소 때 줄이 아니라 사슬의 지금 줄(currentLineForFixedLink)로 — 빠졌으면 `견적 줄 빠짐 · 새로 고침`"
  - "`요청 취소` 접근 이름은 `{번호} 요청 취소` 한 덩어리 sr-only + 보이는 글자 aria-hidden — 번호만 읽히는 글자를 따로 두면 06-08 스펙의 번호 정확 일치가 둘이 된다"
  - "S8 하위 링크는 필터 줄 끝 · 쓸 카드 0장이면 필터 줄이 없어 빈 화면의 행동으로(구매 요청은 카드 없는 직원도 한다)"
---

# Phase 06 Plan 14: 구매 요청 마감 Summary

구매 요청이 팀 비용 · 외화 예상 금액까지 받고, `신청됨`에서만 취소(본인 즉시 + 되돌리기 / 구매 권한자의 남의 요청 사유 창)되며, 되돌리기는 프로젝트 행 → 현재 줄 → 문 셋을 다시 통과하고, 목록은 그룹 · 합계 · S8 하위 링크로 마감됐다.

## 커밋 원장 (base c29a013, 병합 28dac86 이후 이 플랜 커밋 11건)

| 태스크 | 커밋 | 내용 |
| --- | --- | --- |
| 1 RED | 187f912 | 팀 비용 · 외화 예상 RED |
| 1 GREEN | f00e1f9 · b17cf3a | 도메인 · 액션 / 폼 · 피커 3차 · 트레이서 E2E |
| (병합) | 419f4b0 | E2E 온라인구매 설정 격리(28dac86) 받음 — 이 플랜 커밋 아님 |
| 2 RED | 2eb21b7 · 3cf712a | 취소 · 되돌리기 RED / 경합 · X-1 · N-1 · N-2 케이스 |
| 2 GREEN | 21ceb32 · 228e38d | 도메인 · 리포지토리 · 액션 / 행 `요청 취소` · 결과 줄 · 사유 창 · E2E |
| 3 RED | ed32c26 | 합계 · 50건 쪽 · 그룹 순서 · 열린 건수 · Q3 빼기 |
| 3 GREEN | d252451 · ca30065 | 도메인 / 그룹 · 합계 줄 · S8 링크 · E2E(데스크톱 · 폰) |
| 보정 | e2d3709 | document-kinds import(CEO-3) · cards-page 단위 스텁 |

## RED → GREEN 기록

- **`purchased` 취소 거부(Q2):** 구현 전 RED(2eb21b7). 변이 (a) `runCancel`의 잠금 뒤 상태 판정 삭제 → 3건 빨강(「`purchased` 취소 거부」 · 「cancelled/version」 · 경합 ⑴ 「구매 완료 먼저 잠금」에서 취소도 성공) → 복원 후 GREEN.
- **변이 (b)** `lockPurchaseRequestForUpdate` → 잠금 없는 읽기로 교체 → 경합 ⑴ · ⑵ 둘 다 빨강(`waitForLockWaiter`에 이르지 못함) → 복원 후 GREEN. 수락 grep(`ForUpdate(` 다음 `afterLock`)은 코드 순서대로.
- Task 3 RED: 합계 · 금액 숨김 · 51건 쪽 · 전체 그룹 순서 · 열린 건수 5건 빨강(ed32c26) → d252451 GREEN. **Q3 「빼기」 케이스는 RED가 없다** — 06-07 `lineRoom` · 06-08 신청 · Task 2 되돌리기가 이미 같은 판정을 지나서 처음부터 녹색이며 고정(lock-in)용이다. fixture: 실행가 1,000,000 · 예상 770,000 → 공급가 700,000(이 줄 거래처 규칙 ÷1.1).

## ⓪ 게이트 · 검증 결과 (fresh)

| 명령 | 결과 |
| --- | --- |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | 0 · 0 · 0 |
| 통합 `purchase-requests` + `corp-card-usages` + `leak-scan` | 3 파일 4049 통과 · 0 실패 |
| 단위 전체(DB 없이) | 4309 통과 · 1 실패(아래 이월) |
| E2E desktop CI=true `purchase-requests-finish` + `card-usage` | 26 통과 · 0 실패 |
| E2E mobile-375 `mobile-purchase-requests-finish`(320 시트 취소 · 되돌리기 44px · 가로 넘침 0) | 1 통과 |
| 데스크톱 전체 한 번 | 1118 통과 · 23 실패 — 22는 이 플랜이 건드리지 않은 스펙(people · permissions-grid · quote-table · reserves · settings · single-column). 그 여섯 파일을 따로 돌리면 164 전부 통과(전체를 한꺼번에 돌릴 때만 빨강). 1건은 아래 넘김 ① |
| 06-08 · 06-12 스펙(`purchase-requests` · `quote-line-status`) | 파일은 고치지 않음. 임시 로컬 패치(커밋 없음, 복원 확인)로 돌리면 26 통과 — 패치가 필요한 곳은 넘김 ① 한 곳 |

E2E 전역 설정: 이 플랜 E2E는 `온라인구매 협력사` 설정을 바꾸지도 되돌리지도 않는다(견적 줄 요청 행은 DB에 직접 넣거나 팀 비용 요청만 사용 — `test/e2e/online-vendor.ts` 불필요).

## Deviations from Plan

- **[Rule 3] 플랜 문구와 실제 게이트 문구:** 되돌리기의 이중 연결 거부 문구가 플랜에는 `… · 다른 줄 고르기`, 실제 게이트(`card.dual-link-block`)는 `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄`이다. 테스트는 실제 문구를 단언하고, 화면은 되돌리기 거부 줄에서 `IMPOSSIBLE_NEXT` 꼬리를 뗀다(06-09 선례). 확정 결정 문구와 같다.
- **[Rule 1] 접근 이름 중복:** `요청 취소` 버튼의 sr-only `{번호} ` 조각이 06-08 스펙의 `getByText(번호, exact)`를 2건으로 만들어 `{번호} 요청 취소` 한 덩어리 sr-only + 보이는 글자 aria-hidden으로 바꿨다.
- **[Rule 3] 단위 스텁:** `/cards` 페이지가 `countOpenPurchaseRequests`를 읽게 되어 `test/unit/app/cards-page.test.ts`가 DB 없이 못 돌아 그 도메인을 스텁했다.
- 쓸 카드 0장 직원의 `/cards`에서는 하위 링크가 필터 줄이 아니라 빈 화면 행동으로 선다(필터 줄 자체가 없는 06-05 결정을 유지).

## 플랜 밖 변경

- `app/(app)/cards/purchases/purchase-list.tsx`(06-12 파일) — 행 `요청 취소` · 취소 행 2행 · 그룹 · 폰 시트 취소. 06-12 동작(폰 행동 칸 숨김 · `신청됨` 행 탭 = S13 · 그 밖 읽기 시트 · Enter 막힘 · 대상별 key)은 그대로.
- `app/(app)/cards/card-usage-list.tsx` · `app/(app)/cards/page.tsx`(S8 링크 — 플랜 파일 목록의 page.tsx는 cards/page.tsx) · `test/unit/app/cards-page.test.ts`(스텁) · `test/e2e/mobile-purchase-requests-finish.spec.ts`(폰 케이스, `test/e2e/purchase-requests.spec.ts`는 금지라 새 스펙 파일로 대신).
- (검토 반영) `test/e2e/purchase-requests.spec.ts`(B-1 두 줄) · `test/e2e/card-proxy.spec.ts`(06-09 소유, 되돌리기 전 행 빠짐 대기 한 줄) · `app/(app)/cards/card-usage-form.tsx`(06-12 파일 — 폰 패널 `요청 취소` 슬롯 `purchaseCancel` prop 한 곳) · `docs/design/checks/2026-10-07-06-14-review-fixes.md`.
- E2E는 플랜이 적은 `test/e2e/purchase-requests.spec.ts` 대신 `test/e2e/purchase-requests-finish.spec.ts`에 둠(지시).

## 넘김

1. (닫힘 — 「검토 반영」 B-1) **`test/e2e/purchase-requests.spec.ts` 고쳐야 할 두 곳** — ① :156-157 목록 1차 `구매 요청`으로 열면 이제 연결 `팀 비용`이 골라진 채라 `견적 줄` 라디오는 선택 안 됨 · `팀 비용` 라디오가 있음 → `await sheet.getByRole("radio", { name: "견적 줄" }).check();` ② :118 `getByRole("row").nth(1)`은 이제 주 그룹 머리 행 → `nth(2)`. 이 둘만 고치면 그 스펙은 통과한다.
2. **`test/unit/ui/shortcut-notation.test.ts` 1건 실패는 이 플랜 전부터다** — 06-12 커밋 f8c09d1이 `app/(app)/cards/card-usage-form.tsx:606`에 `event.metaKey`를 넣었다(base c29a013에도 있음). 06-12 파일이라 고치지 않았다.
3. (닫힘 — 아래 「검토 반영」 I-1) 폰 구매 권한자의 `요청 취소`는 S13 패널 품목 줄 옆에 둔다.
4. 06-27 `_cancelled_check` 외 6.1-06 K-7 붙임 떼기 훅은 이 플랜이 짓지 않았다(계획대로).

## 검토 반영 (독립 검토 06-14-review.md · DOM 감사 06-14-dom-audit.md)

커밋 범위 `2f52aa6..d103c5d`(PR 브랜치 114d866 병합 ae2e409 포함, 병합 충돌 없음). 각각 RED 먼저 — 통합 · E2E를 고치기 전에 실패를 본 뒤 구현했다. 아래 「넘김」 ①(스펙 두 줄) · ③(폰 취소 길)은 이 절에서 닫혔다.

| 지적 | 처리 | 근거(커밋) |
|---|---|---|
| **B-1** 06-08 E2E 스펙 깨짐 | 고침. `:118` `nth(2)`(첫 행 = 주 그룹 머리), `:156-157` `팀 비용` 기본 선택 단언 + `견적 줄` `.check()`. 전역 설정은 `online-vendor.ts` 방식 그대로(건드리지 않음). 이 스펙 전체 통과 | c5bf0f8 |
| **I-1 · D-1** 폰 구매 권한자 `신청됨` 취소 길 | 고침. 탭 = S13(06-12 유지 — Enter 막기 · 패널 key 그대로) + 패널 품목 줄 옆에 폰(<700)에서만 `요청 취소`(`PurchaseCancelButton` 재사용, 접근 이름 `{번호} 요청 취소`). 남의 요청 = 사유 필수 확인 창(PC와 같은 흐름), 본인 요청 = 즉시 취소 + 패널 닫힘 + 결과 줄 `되돌리기` 포커스. 서버가 갈래를 준다: `loadPurchaseCompletion().cancelBranch`(`own` · `others` · `신청됨` 아니면 null). 통합 1건 + E2E(mobile 375) 1건 | e1dd344 · 5489cd2 · a2c4561 · 88198df |
| **I-2** 되돌리기 문 게이트 | 테스트 추가: 취소 → `온라인구매 협력사` 설정 변경 → 되돌리기 거부(`온라인구매 협력사 줄 아님 · 지출결의로`, 요청 `취소` 그대로) → 설정 복원 뒤 되돌리기 통과. 문 게이트 줄을 지운 돌연변이로 이 테스트 하나만 빨개짐(되돌리기 14건 중 1) | 920767f |
| **D-2** 폰 시트 본인 취소 뒤 포커스 BODY | 고침. 원인: 시트가 모달이라 열린 동안 `되돌리기` `autoFocus`가 먹지 않고, 시트가 닫히며 연 요소(곧 사라질 행 탭)로 포커스를 돌려 BODY가 된다. 시트의 `onClose`(그 포커스 복원 직전) 다음 틱에 `되돌리기`로 옮긴다. E2E(320)가 `toBeFocused` 단언 | a2c4561 · 88198df |
| **D-3a** `되돌리기` 성공 뒤 포커스 BODY | 고침. 06-09 `focusId` 꼴: `되돌리기` 성공이 `focusId`를 두고, 목록이 되살아난 `신청됨` 행의 보이는 `{번호} 요청 취소`(폰은 행 탭 자리)로 포커스한 뒤 표식을 지운다. 행이 DOM에서 사라지지 않은 채 되살아나는 경우(새로 고침 전 되돌림)도 같은 효과가 맡는다. E2E 데스크톱 · 폰(320) | a2c4561 · 88198df |
| **D-3b** 남의 요청 취소 창 성공 뒤 포커스 BODY | 고침. 원인: `setTimeout(focusScreenTitle, 0)`이 새로 고침(행 `요청 취소` 제거)보다 먼저 돌고, 창이 닫히며 돌려준 포커스는 사라질 행으로 간다. 창 컴포넌트(행 버튼과 함께 사라진다)가 사라지는 순간 화면 제목으로 포커스한다. **지시 문구의 「결과 줄 `되돌리기`」와 다르게 화면 제목으로 했다:** 남의 요청 취소에는 결과 줄 · `되돌리기`가 없다(플랜 must_have · 서버가 거부 — 요청자 본인만 되돌릴 수 있다). 코드 주석의 원래 의도와 감사 제안도 화면 제목. E2E는 행이 사라진 뒤(`toHaveCount(0)`)에도 제목이 포커스를 갖는지를 본다(처음 쓴 단언은 순간 포커스만 봐도 통과해 RED가 아니었다 — 고쳐 RED를 확인) | a2c4561 · 88198df |
| **m-1** 되돌리기 거부 줄 꼬리 떼기 | **코드 그대로 둠(판단).** `IMPOSSIBLE_NEXT`가 ` · 다른 줄 고르기`도 떼는 것이 맞다: 취소된 요청은 줄이 고정이고 되돌리기 거부 줄에서는 줄을 바꿀 길이 화면에 없다(요청은 `취소` 그대로, 새 줄은 새 요청으로). 할 수 없는 다음 행동을 보이지 않는다는 화면 사용성 원칙과 06-09 카드 되돌리기 선례(DOM O-3)와 같다. 플랜 must_have Q3는 「그 막힘 문구」이고 `실행가 초과 · 남은 실행가 N` 부분은 그대로 보인다. 이 편차(이중 연결만이 아니라 실행가 초과 문구도 뗀다)를 여기에 기록 |  |
| **m-2** 사유 검사 중복 | 그대로. 사전 조회와 트랜잭션 안 겹 방어(둘 다 지우면 빨개짐) — 결함 아님 |  |
| **m-3** `quoteLinked` 판정 | 고침. 목록 DTO에 `linkKind`(`purchase_request.value`)를 싣고 그것으로 판정(프로젝트 값을 못 봐 `linkLabel`이 비어도 `견적 줄 연결 풀림` 줄이 선다). 통합 1건 | d103c5d |
| **m-4** 소속 판정 함수 둘 | 그대로. `findMembershipAtDate`(막힘 판정)와 `teamAtDate`(팀 이름)는 결과가 같다는 검토 판단(추정)에 동의 — 하나로 합치는 것은 요청 밖 리팩터 |  |
| **m-5** `version ?? 0` | 그대로. 값 숨김 계급(`purchase_request.value` 숨김)이면 목록 행 자체가 비어 취소 갈래가 서지 않는다(행 없음 = 버튼 없음). 0이 실제로 버튼에 닿는 경로를 만들지 못했다 |  |
| **DOM O-1** 전체 합계에 취소 건 포함 · **O-2/O-5** | 사용자 결정 대상(질문 후보 1 · 3)이라 고치지 않음 |  |
| **DOM O-3** `/cards` 필터 줄 끝 링크 세로 중심 11px 어긋남 | 고치지 않음: 필터 묶음(라벨 위 셀렉트)과 3차 링크의 정렬 문제로 S8 필터 줄 공용 배치(SP-4)를 건드려야 한다 — 요청 밖 변경이고 `/design-review` 판정 대상 |  |
| **DOM O-4 · O-6 · O-7** | 고치지 않음: O-4는 06-09와 같은 꼴(UI-SPEC · 플랜 must_have 그대로), O-6은 공용 `Table`의 그룹 머리(`td colspan`) — 이 플랜 몫 아님, O-7은 공용 `RowAction` 링크/버튼 높이 1.3px 차이 |  |

### 테스트 · 도중에 찾은 것

- **06-09 E2E `card-proxy.spec.ts` `[D-1] 금액 숨김…`이 이 PR 안에서 결정적으로 실패했다**(`f91ce29` 전에: 단독 실행 2/2 실패). 원인을 좁혔다: 06-14 S8 하위 링크(`card-usage-list.tsx`의 `RowAction` 링크)를 빼면 통과한다. 삭제의 새로 고침이 그 링크 때문에 늦어져, 테스트가 `되돌리기`를 먼저 눌러 행이 DOM에서 한 번도 사라지지 않으면 되살아난 행의 `autoFocus`가 일어날 수 없다(행이 안 사라졌음을 `AFTERDELETE` 진단으로 확인, 다시 기다리면 통과). 검토가 이 스펙을 돌리지 않아(52건 목록에 없었다) 걸러지지 않았다. 테스트 전제를 명시(행이 빠진 뒤 되돌림)해 고쳤다 — 06-09 소유 테스트의 한 줄 추가라 「플랜 밖 변경」. **남은 관찰:** 새로 고침이 끝나기 전에 `되돌리기`를 누르는 빠른 손은 06-09 카드 삭제 되돌리기에서 포커스가 BODY로 간다(06-14 구매 요청 목록은 같은 경우도 목록 효과가 맡는다). 06-09 `delete-undo.tsx`를 이 플랜이 고치지 않았다.
- 폰 패널 `요청 취소`는 요청 지시의 「2차 행동」 대신 **품목 줄 옆 3차(RowAction danger)**로 두었다 — 행동 줄(2차 `취소 Esc` · 1차 `구매 완료`)에 한 칸을 더하려면 공용 `PanelForm`을 고쳐야 하고 폰 320에서 행동 줄이 좁아진다. 감사 D-1 제안 ①(`행동 줄 또는 머리에 3차`)과 같다. 점검표: `docs/design/checks/2026-10-07-06-14-review-fixes.md`.

### 검증(fresh)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` · `pnpm lint` | 0 · 0 |
| `pnpm test:unit` | 282 파일 · 4314 통과 · 실패 0 |
| 통합 `purchase-requests.test.ts` + `leak-scan.test.ts` (격리 DB erp_e0614_test) | 4034 통과 · 실패 0 (구매 요청 107건 = 이전 104 + 신규 3) |
| E2E `CI=true` desktop 2 worker: purchase-requests · purchase-requests-finish · card-usage · quote-line-status · card-proxy · card-usage-panel-width | 67 통과 · 실패 0 |
| E2E `CI=true` mobile-375: mobile-purchase-requests-finish(2건) · mobile-card-usage-320 | 5 통과 · 실패 0 |
| 돌연변이 | 되돌리기 문 게이트 줄 삭제 → [I-2 문] 1건만 빨강(복원 확인) |

- PR #183 합본 게이트(wt/06-gate1 · erp_g1_test) /review m-4: 본인 취소가 거부되면 패널 · 시트를 닫지 않고 버튼 옆에 거부 한 줄(role=alert · 기존 `.undoFailed`), `.panelCancel` 줄 바꿈 — 2bcf3774(d75455a5 RED · 2bd7989d) · E2E 「[183 m-4]」 375 가로 넘침 0. 캡처 대상: 폰 `/cards/purchases` S13 패널 본인 `요청 취소` 거부 상태.

## 260907 대조 (표만 — 구현 없음)

| 항목 | 260907 file:line | 우리 file:line | 분류 |
| --- | --- | --- | --- |
| 취소 사유 | `server/src/purchases.ts:614-615` 취소는 늘 사유 필수 | `domain/purchase-requests/index.ts:478` 본인 취소는 사유 없음 · 남의 요청만 필수 | 계획 결정(UI-SPEC rev 10) |
| 요청자의 취소 | `purchases.ts:1367` 요청자는 「취소 요청」(알림) · 취소·보관은 `purchase.handle`만 | `index.ts:469` 요청자 본인 직접 취소 | 계획 결정(Q2 · O-9) |
| 취소된 건의 합계 | `purchases.ts:462` 취소는 금액 0으로 셈 | `index.ts:852` `전체` 보기 합계가 취소 건 예상 금액을 포함 | 숨은 규칙(사용자 결정 필요) |
| 보관함 보기 | `purchases.ts:1408` · `:1724` 보관·되살리기는 `purchase.handle`, `archived=1` 보기 | 구매 요청 보관 개념 없음(상태 3개) | 숨은 규칙(사용자 결정 필요) |
| 쪽 크기 | `purchases.ts:379` · `:1616` `screen.page_size_purchases` 설정 | `lib/paging.ts:3` 고정 50 | 계획 결정 |
| 기다리는 건수 | `purchases.ts:1513` · `:1695` 처리 대기 건수 | `index.ts:864` `신청됨` 건수 → S8 `구매 요청 N` | 같음 |
| 취소 건 후속 | `purchases.ts:1215` · `:1311` 취소된 요청에 증빙 붙이기 · 금액 고치기 409 | `index.ts` 구매 완료는 `신청됨`만(상태 판정 `statusChangedError`) | 같음 |

숨은 규칙 2건(취소 건 합계 0 · 보관함).

## 캡처 · GPT 검사 대상 경로

| 경로 | 바뀐 요소 | 데이터 조건 |
| --- | --- | --- |
| `/cards/purchases` (1280 · 768) | 행 `요청 취소` 맨 끝 danger · 그룹 머리(요청일 주) · 합계 줄 | `신청됨` 요청 2건 이상(여러 주), 본인 요청 + 구매 권한자 계정 각각 |
| `/cards/purchases?status=전체` | 상태 그룹 순서 · 취소 행 2행 `취소 MM-DD · 사람 · 사유` · 합계 `(전체 · N건)` | 신청됨 · 구매 완료 · 취소 각 1건 이상 |
| `/cards/purchases` 취소 직후 | 표 위 결과 줄 `구매 요청 취소됨 · {번호}` + `되돌리기`(포커스) | 요청자 본인이 취소한 직후 |
| `/cards/purchases` 남의 요청 취소 창 | 제목 `구매 요청 취소` · 사유 칸 · 빈 사유 막힘 문구 | 구매 권한자가 남의 견적 줄 요청 취소(결과 줄 `견적 줄 연결 풀림`) |
| `/cards/purchases` 폰 (375 · 320) | 행 탭 시트의 `요청 취소` · 결과 줄 · 합계 · 그룹 머리 | 요청자(구매 권한 없음), 외화 요청 포함 |
| `/cards/purchases?new=1` (1280 · 375) | 연결 라디오 `견적 줄`/`팀 비용` · 팀 텍스트 · 통화 · 환율 · 원화 환산 | 소속 있는 요청자 / 소속 없는 요청자(막힘 문구) |
| `/cards` (1280 · 768 · 375) | 필터 줄 끝 `구매 요청 N` · 카드 0장 빈 화면의 `구매 요청` | 열린 요청 0건 / 1건 이상, 카드 있음 / 없음 |

## 사용자 질문 후보 (밤 기본값으로 진행함 — 아침 확인)

1. **합계에 취소 건을 넣나?** 260907은 취소 금액을 0으로 셌다. 우리 `전체` 보기 합계는 취소 건 예상 금액을 포함한다(`신청됨` · `구매 완료` · `취소` 보기별 합계는 그 보기 안에서 맞다).
2. **구매 요청 보관함이 필요한가?** 260907은 구매 처리 권한자에게 보관 · 보관함 보기가 있었다. 우리는 취소(신청됨에서만)뿐이다.
3. 새 문구 승인: 요청일 주 그룹 머리 `{MM-DD} ~ {MM-DD}` · 합계 줄 `예상 금액` 라벨 · 쓸 카드 0장 `/cards` 빈 화면의 `구매 요청` 행동.
4. Q-H 밤 위임 그대로: 취소된 사이 이은 줄이 새 차수에서 빠지거나 보관되면 되돌리기는 `견적 줄 빠짐 · 새로 고침`으로 거부하고 요청은 `취소`로 둔다.
5. (닫힘 — 「검토 반영」 I-1) 폰 구매 권한자의 취소 길을 패널 안에 두었다. 다른 안: 행 시트로 바꾸기(탭 = S13 변경이라 06-12 D-1과 충돌 — 하지 않음).

## 화면 검토 증거

- 독립 DOM 감사(CI=true 4폭): `/mnt/project-files/notes/06-review/06-14-dom-audit.md` — 결함은 같은 플랜 「검토 반영」에서 수정
- 합본 `/design-review`(Codex 실행·후보 8건 결함 아님, DOM 실측 결함 0): `/mnt/project-files/notes/06-review/183-design-review.md` 「플랜별 화면 검토 증거」 06-14 행, 원자료 `/mnt/project-files/notes/06-review/183-design-review-artifacts/`
- 합본 `/qa`(CI=true 흐름 21 통과, Low 3건 보고): `/mnt/project-files/notes/06-review/183-qa.md`

## Known Stubs

없음.

## Threat Flags

없음 — 새 서버 액션 2개(`cancelPurchaseRequestAction` · `undoCancelPurchaseRequestAction`)는 `authedActionClient` + 도메인 사전 조회(권한 · 갈래) · 잠금 뒤 상태 · 버전 재확인 · 액션 레지스트리 등록으로 기존 구매 요청 액션과 같은 모양이다.

## Self-Check: PASSED
