---
created: 2026-10-06T02:27:24.000Z
title: 정산 최종 승인 재점검 뒤 · 커밋 전에 구매 요청 취소 · 증빙 제거가 미결을 늘릴 수 있다 (E-37)
area: general
severity: minor
files:
  - .planning/phases/06-payment-evidence-cards/06-22-PLAN.md (threat T-06-2205 accept · Round 8 Deferred 「E-37」)
  - .planning/phases/06-payment-evidence-cards/06-14-PLAN.md (구매 요청 취소 `runCancel`)
  - domain/evidence/index.ts (05 증빙 파일 제거 · 무효 경로)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan.md (E-37 — b77fe3f6)
---

## Problem

06-22(정산 최종 승인 재점검)는 같은 트랜잭션 안에서 미결 점검을 다시 돌린 뒤 `changeProjectStatus`로 완료를 커밋한다.
그 사이에 **프로젝트 행을 잡지 않는 쓰기**가 들어오면 점검이 본 상태보다 미결이 늘어난 채 완료될 수 있다(eng-review E-37, P3).

- 06-14 구매 요청 취소 `runCancel` — 취소로 그 견적 줄이 「미매칭」(D-612)이 될 수 있다
- 05 증빙 파일 제거 · 무효 — 결재 통과 문서가 「증빙 없음」(D-611)이 될 수 있다

창은 한 트랜잭션 길이로 짧고, 정산 기안 게이트(06-19)와 최종 승인 재점검이 이미 두 번 막는다. 늘어난 미결은 완료 뒤 결재 막힘 목록에 남아
사람이 본다(U-4 사후 처리). 카드 사용 삭제 · 연결 바꾸기 몫은 E-9(06-09)가 프로젝트 행을 잡아 닫았다.

## Solution

두 경로가 쓰기 전에 06-07 `lockProjectForLinkWrite`(프로젝트 행 FOR UPDATE — X-2 잠금 순서 「프로젝트 → 줄 → 문서」)를 먼저 잡게 한다.

1. **재현 테스트 먼저**(`test/integration/pre-settle-check.test.ts` 꼴 · `test/integration/lock-race.ts`의 `deferred` · `waitForLockWaiter`):
   최종 승인 트랜잭션을 재점검 뒤 · 커밋 전에 장벽으로 붙잡은 동안(06-22 SUMMARY의 테스트 훅 이름 — 없으면 05 `deps.afterLock` 꼴로 하나 더한다) 같은 프로젝트의 구매 요청 취소 · 증빙 제거를 부른다 →
   지금은 그 쓰기가 먼저 커밋되고 승인도 커밋된다(미결 1 남음). 고친 뒤에는 쓰기가 승인 커밋을 기다렸다가 완료 프로젝트 규칙(D-47)으로 판정된다.
2. `runCancel`(06-14) · 05 증빙 제거 경로 앞에 프로젝트 행 잠금 한 줄. 잠금 순서는 06-07 X-2 그대로(역순 잠금 없음).
3. 돈 · 결재 경로(`domain/evidence` · 구매 요청)라 `/review` + `/cso`. 06 머지 뒤 별도 fix PR이거나, 06-14 · 06-11 실행 때 그 플랜이 같은 자리를 고치면 여기서 닫는다(그 SUMMARY에 한 줄).
