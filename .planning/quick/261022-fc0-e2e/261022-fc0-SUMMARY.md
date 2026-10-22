---
phase: quick-261022-fc0
plan: 01
status: complete
commits: 2
plan_head_before: d8eb84ab07160d390e8971ff46b08b82356b3af0
actuals:
  tasks: 2
  commits: 2
---

# Quick 261022-fc0: E2E card helper deterministic termination + afterEach cleanup

addCard now reads live last-4 numbers and picks from free ones (immediate "빈 번호 없음" error when none, max 5 re-reads on DuplicateCorpCardError); filler-card cleanup moved to test.afterEach.

## Commits
- f92a8b0f test: add no-free-number card helper case and afterEach cleanup (RED)
- cc67d087 fix: pick E2E card last4 from free numbers with bounded retry (GREEN)

## RED evidence
- Failing case: "카드 도우미 — 롯데 끝 4자리에 빈 번호가 없으면 다시 고르지 않고 바로 오류로 끝난다" — `Test timeout of 30000ms exceeded`; 1 failed / 1 passed (2.5m).
- After the timeout, psql `corp_cards where issuer='롯데카드' and label like '채움 %'` = 0 (afterEach cleanup ran).

## GREEN evidence
- regression-1 spec (desktop): 2 passed. evidence-paste-audit-capture (desktop-evidence --no-deps): 1 passed.
- pnpm typecheck 0, pnpm lint 0, `for (;;)` count 0, leftover filler cards 0.

## Deviations
- [Rule 1 - Bug] First GREEN attempt failed: `randomInt(0)` throws a range error on an empty free list, so the explicit length check was restored (`free.length > 0 ? ... : undefined`). Caught by the new case.
- `pnpm lint` first aborted with Node heap OOM (environmental); passed with NODE_OPTIONS=--max-old-space-size=4096.

## Self-Check: PASSED
