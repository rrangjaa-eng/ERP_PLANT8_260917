---
created: 2026-10-05T21:27:41.000Z
title: 홈 「막힌 문서」 반려 줄이 LIMIT 50 뒤에 걸러져 미종결 반려가 빠질 수 있다 (E-47)
area: general
severity: minor
files:
  - domain/approvals/index.ts:1219 (listMyBlockedDocuments — 반려 호출)
  - repositories/approvals.ts:317 (listDrafterInstances)
  - .planning/phases/06-payment-evidence-cards/06-28-PLAN.md (closedDocumentIds 선택 훅)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan.md (E-47 — L67@b77fe3f6)
---

## Problem

`listMyBlockedDocuments`(05 PR #162 `e739cb37`, `domain/approvals/index.ts:1217`)는 기안자의 반려 문서를
`listDrafterInstances(viewer, { drafterId, status: "rejected", limit: BLOCKED_REJECTED_LIMIT })`(50건,
후보 조건 없음)로 먼저 자른다. 승인 줄은 05 C6이 종류별 후보 조건(`candidateKinds` · `BlockedCandidateFilter`)을
SQL에 넣었지만 반려 줄은 그대로다.

06-28(반려 · 회수 지출결의 종결)은 선택 훅 `closedDocumentIds`로 **이 50건을 받은 뒤** 종결 문서를 뺀다.
종결한 반려 문서가 최근 50건을 채우면, 그보다 오래된 **종결 안 한 반려 문서가 홈 「막힌 문서」에서 조용히
빠진다**(eng-review E-47, P3). 사람 30명 규모에서 드물지만 조용한 누락이다.

## Solution

반려 줄도 승인 줄과 같은 꼴로 SQL에서 거른다 — 별도 fix PR이거나, 06-28 실행 때 그 플랜이 같은 자리를 고치면
여기서 닫는다(06-28 SUMMARY에 한 줄).

1. **재현 테스트 먼저**(`test/integration/next-turn.test.ts` 꼴): 반려 문서 51건 중 최근 50건을 종결하고 가장
   오래된 1건은 종결하지 않음 → 홈 막힌 문서에 그 1건이 선다(지금은 빠짐).
2. `listDrafterInstances`의 `candidateKinds`를 반려에도 쓴다 — 종류 정의에 「반려 후보 조건」을 두고
   (`BlockedCandidateFilter`에 종결 제외 멤버, 예: 지출결의 행 `closed_at is null` 조인), 엔진은 종류 리터럴 없이
   넘긴다(06-REVIEWS C3). 목록에 없는 종류는 결과에서 빠지므로 반려에는 모든 종류를 넘기고 필터 없는 종류는 `null`.
3. `domain/approvals` · `repositories/approvals.ts`라 `/review` + `/cso`(훅 강제), 위험 경로는 아님.
