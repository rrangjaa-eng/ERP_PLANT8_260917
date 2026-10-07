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
- E2E는 플랜이 적은 `test/e2e/purchase-requests.spec.ts` 대신 `test/e2e/purchase-requests-finish.spec.ts`에 둠(지시).

## 넘김

1. **`test/e2e/purchase-requests.spec.ts` 고쳐야 할 두 곳(지시로 손대지 않음)** — ① :156-157 목록 1차 `구매 요청`으로 열면 이제 연결 `팀 비용`이 골라진 채라 `견적 줄` 라디오는 선택 안 됨 · `팀 비용` 라디오가 있음 → `await sheet.getByRole("radio", { name: "견적 줄" }).check();` ② :118 `getByRole("row").nth(1)`은 이제 주 그룹 머리 행 → `nth(2)`. 이 둘만 고치면 그 스펙은 통과한다.
2. **`test/unit/ui/shortcut-notation.test.ts` 1건 실패는 이 플랜 전부터다** — 06-12 커밋 f8c09d1이 `app/(app)/cards/card-usage-form.tsx:606`에 `event.metaKey`를 넣었다(base c29a013에도 있음). 06-12 파일이라 고치지 않았다.
3. 폰에서 구매 권한자는 자기 `신청됨` 행 탭이 S13이라 폰 `요청 취소` 길이 없다(06-12 D-1 유지의 대가). 요청자(구매 권한 없음)는 시트에서 한다.
4. 06-27 `_cancelled_check` 외 6.1-06 K-7 붙임 떼기 훅은 이 플랜이 짓지 않았다(계획대로).

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
5. 폰에서 구매 권한자의 `신청됨` 행 취소 길이 없다(넘김 ③).

## 화면 검토 증거

(오케스트레이터가 채움)

## Known Stubs

없음.

## Threat Flags

없음 — 새 서버 액션 2개(`cancelPurchaseRequestAction` · `undoCancelPurchaseRequestAction`)는 `authedActionClient` + 도메인 사전 조회(권한 · 갈래) · 잠금 뒤 상태 · 버전 재확인 · 액션 레지스트리 등록으로 기존 구매 요청 액션과 같은 모양이다.

## Self-Check: PASSED
