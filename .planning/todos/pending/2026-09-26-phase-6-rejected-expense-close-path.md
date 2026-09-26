---
created: 2026-09-26T00:00:00.000Z
title: 반려·회수 지출결의 종결(취소) 경로 — Phase 6 TODO (U2, 사용자 결정 대기)
area: planning
severity: major
files:
  - .planning/phases/05-expense-approval-leave/05-09-PLAN.md
  - .planning/phases/05-expense-approval-leave/05-REVIEWS.md:41
  - .planning/phases/05-expense-approval-leave/ceo-review.md
  - .planning/phases/05-expense-approval-leave/05-RESEARCH.md:321
---

## Problem

Phase 5 `/plan-ceo-review` U2(05-REVIEWS Round 1 — 1108e20). 반려·회수된 지출결의를
끝낼 길이 없다. 번호를 받은 반려·회수 문서(예: `26001-0003`)는

- 그 견적 줄의 문을 계속 닫고(1줄 1문서 · D-66),
- 분할 줄이면 회차 상한 계산에 계속 들어가며,
- 비용이 실제로 취소돼도 그 줄은 계속 `반려`로 닫혀 있다.

## 제안 (추천안 B — 사용자 결정 대기)

Phase 6에서 다룬다(Phase 5 범위 고정 · HOLD SCOPE).

1. 반려·회수 지출결의에 「종결(취소)」 동작을 둔다 — 기안자(또는 경영관리)가 하고,
   행동 로그를 같은 트랜잭션에 남긴다. 번호는 재사용하지 않는다
2. 종결된 문서는 회차 상한(`remainingForInstallments`)과 줄 문 판정(`expenseLineDoor`)에서 뺀다
3. 목록·문서 화면 낱말, 되돌림 가능 여부, 권한은 Phase 6 계획 때 정한다

## Status

- **사용자 결정 대기(U2)** — 추천 B(Phase 6 TODO). 코디네이터 답이 A(이번 범위)면
  `/gsd-plan-phase 5 --reviews` 다음 라운드에서 05-09(또는 새 플랜)에 task를 더한다
- 05-09-PLAN.md `## Review Dispositions Ledger` Round 1 Deferred 표에 같은 내용이 있다
