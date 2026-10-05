---
created: 2026-10-05T21:27:41.000Z
title: 머지 훅의 /cso 돈 경로 정규식에 Phase 6 새 돈 모듈을 더한다 (E-41)
area: tooling
severity: minor
files:
  - .claude/hooks/plant8-skill-gate.sh:315
  - CLAUDE.md (§4 Post-build 「돈·결재」 줄)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan.md (E-41 — L45@b77fe3f6)
---

## Problem

머지 훅이 `/cso` 기록을 요구하는 돈 · 결재 경로는 `.claude/hooks/plant8-skill-gate.sh:315` 정규식
`^(domain/(money|corp-cards|reserves|revenue|approvals)/|repositories/(corp-cards|approvals|reserve-entries|revenue-entries)\.ts$)`
하나다(CLAUDE.md §4 「돈·결재」 줄과 같은 목록).

Phase 6은 돈을 정하는 새 모듈을 만든다 — `domain/payments`(지급 총액 · 일괄 지급) ·
`domain/corp-card-usages`(카드 사용 금액 · 실행가 상한) · `domain/purchase-requests`(구매 완료 카드 금액) ·
`domain/issue-requests`(발행 요청) · `domain/pre-settle-check`(완료 전 미결 점검). 짝이 되는 저장소
`repositories/expense-payments` · `corp-card-usages` · `purchase-requests` · `revenue-issue-requests` ·
`payment-targets` · `pre-settle-check`도 정규식 밖이다.

06 묶음 PR(PR-C/D/E)은 06-01 「PR 묶음」 표가 `/cso`를 붙이므로 괜찮다. 문제는 **06 뒤**다 —
이 모듈만 고치는 quick PR이나 수정 PR은 훅이 돈 경로로 보지 않아 `/review`만으로 무인 머지될 수 있다
(eng-review E-41, P3).

## Solution

1. 위험 경로 별도 PR로 한다(`.claude/` · CLAUDE.md는 사용자가 GitHub에서 직접 머지 — 06 묶음 PR에 섞지 않는다).
2. 훅 정규식에 `domain/(payments|corp-card-usages|purchase-requests|issue-requests|pre-settle-check)/`와
   `repositories/(expense-payments|corp-card-usages|purchase-requests|revenue-issue-requests|payment-targets|pre-settle-check)\.ts$`를 더한다.
   `domain/settlements/`(정산 최종 승인) · `domain/evidence-reviews/`(증빙 금액 → 원가 기준)도 같은 PR에서 넣을지 판단한다.
3. CLAUDE.md §4 「돈·결재」 줄을 같은 목록으로 맞춘다(세션 끝에 몰아서 — CLAUDE.md §0).
4. 훅 회귀: 새 경로 하나만 바꾼 가짜 PR 파일 목록으로 `money_changed=1`이 서는지 확인한다(기존 훅 테스트 꼴을 따른다).
5. 06 PR-C가 머지되기 전에 들어가면 가장 좋다 — 그 전이면 06 묶음 표의 `/cso`가 이미 덮는다.
