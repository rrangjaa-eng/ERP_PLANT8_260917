---
created: 2026-10-05T21:27:41.000Z
title: 세금 계산의 부동소수 절사로 원천세가 10원 적게 나온다 — 712,500 × 8.8% = 62,690 (E-23)
area: general
severity: major
files:
  - domain/money/index.ts:35 (round)
  - domain/money/tax.ts:84 (부가세)
  - domain/money/tax.ts:106 (원천세)
  - domain/money/tax.ts:121 (회사 부담)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan.md (E-23 — L59@b77fe3f6)
---

## Problem

`applyTaxRule`(`domain/money/tax.ts`)은 `round(supplyKrw * rate, unit, roundingMethod)`로 세액을 낸다.
`supplyKrw * rate`가 부동소수라 정답이 딱 떨어지는 값이 아래로 조금 모자라게 나오고, 코드표 방식이
절사(`truncate`)면 한 단위가 통째로 사라진다.

실측(node): `712500 * 0.088` = `62699.99999999999` → 10원 절사 62,690. 정답은 62,700.

- main(Phase 4)부터 있는 결함이다 — 05 PR #162(`e739cb37`)에서도 같은 줄(`:84` · `:106` · `:121`)이고
  `round`(`domain/money/index.ts:35`)는 `value / unit`을 바로 `Math.trunc` · `Math.ceil`한다.
- 지금 쓰는 곳: 05 지출결의 지급액(원천세 차감), 06-03 지급 총액(같은 함수).
- 화면에 아무 표시 없이 송금액이 10원씩 틀린다(eng-review critical gap 5건 중 하나).

06은 고치지 않는다(eng-review 「NOT in scope」 — 05 자체 결함). 06-03이 회귀 한 건
(712,500 · 8.8% · 10원 절사 → 62,700)을 `it.fails`로 두고, **06-03이 실린 묶음 PR-C를 ready로 바꾸기 전에
이 수정이 main에 들어와 그 케이스가 `it`으로 녹색이어야 한다**(06-03 must_haves 「E-23 회귀」). 그래서 이
todo는 06 PR-C ready 전까지가 기한이다.

## Solution

별도 fix PR — `domain/money`는 돈 경로라 `/review` + `/cso`(훅 강제). 위험 경로는 아니라 조건이 맞으면 세션 머지.

1. **재현 테스트 먼저**(`test/unit/domain/money-tax.test.ts` · `money.test.ts`): 712,500 × 0.088 절사 10원 → 62,700,
   같은 꼴의 부가세 · 회사 부담 한 건씩, `ceil` 쪽(정답이 딱 떨어질 때 한 단위 더 올라가지 않음) 한 건.
2. **고치는 자리는 `round` 하나**(CEO 리뷰 D4 「반올림은 서버 단일 함수」): `scaled = value / unit`을
   `trunc` · `ceil` 전에 부동소수 오차만큼 정규화한다(예: 소수 6자리에서 한 번 반올림한 값을 쓴다 — 금액은
   정수 원, 세율은 소수 4자리 이하라 6자리 정규화가 실제 값을 바꾸지 않는다). 세율을 정수(만분율)로 바꾸는
   방법은 설정 저장 형식까지 건드려 범위가 커지므로 택하지 않는다.
3. 06-03 R-5의 역산(`grossFromTotal(…, "round")`)은 반올림이라 이 결함을 피하지만, `round` 정규화 뒤에도
   경계(1100 → 1000 · 1,000,010 → 909,100)가 그대로인지 같은 PR에서 확인한다.
4. 고친 뒤 05 · 06 지급 화면의 기존 E2E 금액 단언이 바뀌는지 CI(ready)로 확인한다.
5. 머지되면 06 페이즈 브랜치가 origin/main을 받은 뒤(06-01 묶음 브랜치 다섯 줄 3) 06-03의 `it.fails` 케이스를 `it`으로 돌린다.
