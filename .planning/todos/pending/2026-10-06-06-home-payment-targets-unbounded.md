---
created: 2026-10-06T02:27:24.000Z
title: 경영관리 홈 「지급 묶음」이 홈 로드마다 지급 대상 원천 전체를 읽는다 (N-6)
area: general
severity: minor
files:
  - .planning/phases/06-payment-evidence-cards/06-15-PLAN.md (E-25 — `repositories/payment-targets.ts` LIMIT 없음 · Round 10 Deferred 「N-6」)
  - .planning/phases/06-payment-evidence-cards/06-23-PLAN.md (E-31 — 홈 공급 조회 수 고정 · Round 5 Deferred 「N-6」)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan-r2.md (N-6 — L54@7d1f6d6c)
---

## Problem

06-15의 지급 대상 원천(`repositories/payment-targets.ts`)은 쪽을 자르지 않고 필터 전체 행(결재 통과 · 살아 있는 지급 없음 · 종결 아님 · 삭제 아님)을
돌려준다(E-25 — 쪽 자르기는 `listPaymentTargets` 한 곳). 06-23 경영관리 홈 「지급 묶음」은 그 원천을 홈 로드마다 한 번 읽어(E-31 — 조회 **수**만 고정)
이번 주 합계를 낸다. 행 **수**에는 상한이 없다(eng-review-replan-r2 N-6, P3).

이 회사 규모(10→30명)에서 결재 통과 · 지급 전 문서는 수십 건 수준이라 06에서는 그대로 둔다. 지급 총액은 `applyTaxRule`(서버 계산)이라 SQL 합계로 바로 바꿀 수 없다.

## Solution

측정 방아쇠: 운영에서 지급 대상 원천 행 수가 200을 넘거나 홈 응답 p95가 1초를 넘으면 착수한다.

1. **재현 · 측정 먼저**: 결재 통과 · 지급 전 문서 N건(500 · 1,000) 시드 → 홈 로드 시간 · 원천 행 수를 잰다(`test/integration/next-turn.test.ts` 「홈 공급 조회 수」 꼴에 행 수 단언 추가).
2. 해법 후보(하나만): ⒜ 묶음이 쓰는 칸만 고르는 좁은 원천(이번 주 예정일 범위 조건을 SQL로 · 문서 고유 세금 입력만) ⒝ 지급 대상 행에 계산된 지급 총액을 저장해 SQL 합계 ⒞ 홈 묶음에 행 상한 + 「더 있음」 표시.
3. 돈 경로(`domain/payments`)라 `/review` + `/cso`.
