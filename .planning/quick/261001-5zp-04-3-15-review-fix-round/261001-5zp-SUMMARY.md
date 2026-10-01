---
phase: quick-261001-5zp
plan: 01
subsystem: certs (QR 확인증 수령자 제출 · 테스트 계약)
tags: [04.3-15, review-fix, money, db-lock, touch-target]
status: complete
requires: [04.3-15 executed, 04.3-15-REVIEW.md, 04.3-15-DOM-AUDIT.md]
provides: [R1 delivery recheck under lock, R5 E13 test, R6 required tx, R7 schema-aligned budget sample, R4 control self-scan, R3 internal assertions restored, M1 tel link 44x44]
affects: [domain/certs/intake.ts, repositories/cert-prizes.ts, app/c/[token]/intake.module.css]
tech-stack:
  added: []
  patterns: [locked-tx recheck of every pre-lock field used for validation, inline sentence link with 44 hit area via negative margin-block (.runLink pattern)]
key-files:
  created:
    - docs/design/checks/2026-10-01-cert-tel-link-touch-44.md
  modified:
    - domain/certs/intake.ts
    - repositories/cert-prizes.ts
    - test/e2e/helpers/cert.ts
    - test/integration/cert-prize-intake.test.ts
    - test/unit/certs/signature-png.test.ts
    - test/e2e/mobile-cert-prize-leak.spec.ts
    - test/e2e/login-logout.spec.ts
    - test/e2e/settings.spec.ts
    - app/c/[token]/intake.module.css
    - test/e2e/mobile-cert-intake.spec.ts
decisions:
  - "R1: 잠근 뒤 경품의 전달 방식이 칸 검사에 쓴 값과 다르면 prizeGone(지금 목록, 쓰기 없음)"
  - "R3: 검토자가 의심한 TextField 회귀는 CI=true에서 재현되지 않음 — 테스트만 복원"
  - "M1: 문장 속 tel: 링크도 §3 터치 목표 44 적용(.runLink 결), DECISIONS.md 예외 없음"
metrics:
  duration: ~95m
  completed: 2026-10-01
actuals:
  tokens: 6627
  tasks: 3
  commits: 7
plan_head_before: 6322a88
---

# Quick 261001-5zp: 04.3-15 Review Fix Round Summary

The money/lock path now rechecks prize delivery under the event-row lock (no parcel prize saved without an address). The lock branches and leak controls have tests. The lost internal-screen assertions are back. The recipient's phone link has a real 44x44 hit area without changing line layout.

## Per finding

| # | Commit | RED evidence | Fix | GREEN evidence |
|---|---|---|---|---|
| R1 | 48a5ed4 | Two race tests (onsite→parcel, parcel→onsite): `expected 'saved' to be 'prizeGone'` (2 failed) | (g) puts the validated delivery in `checkedDelivery`. The locked tx returns `prizeGone` when `deliveryOf(lockedPrize)` differs. 「전달 방식」 added to the order-contract comment | `pnpm test:integration cert-prize-intake`: 32 passed (0 submissions, 0 objects, 0 intent rows) |
| R5 | 3976947 | Passes on current code. Temporary break (`!lockedEvent` → `throttled`): `expected 'throttled' to be 'notFound'` (1 failed). Restored, and `git diff domain/certs/intake.ts` is empty | Test only (E13: event deleted under lock → notFound, counter unchanged, 0 objects) | cert-prize-intake: 33 passed |
| R6 | 09ff755 | Default removed, then `pnpm typecheck`: `test/e2e/helpers/cert.ts(91,22): error TS2554: Expected 3 arguments, but got 2.` | `insertPrizes(viewer, rows, tx: DbOrTx)` is required. `createCertEvent` uses `withTransaction` → `lockEventRow` → `insertPrizes(..., tx)` | typecheck exit 0, `pnpm test:integration cert-`: 8 files / 144 passed |
| R7 | fc9f7be | `expected [ 'address', 'consent', …(13) ] to deeply equal [ 'address', 'consent', …(11) ]` | Sample: removed `rowId`, `proof`, `winnerVersion` and added a `prizeId` uuid. Other fields stay at their max. Comment names submit-schema.ts | `pnpm test:unit test/unit/certs/signature-png.test.ts`: 40 passed |
| R4 | dcd4586 | Injected `" 88,888"` into the new scan's corpus (CI=true): 1 hit `"88,888 … ncer></body></html> 88,888"` (1 failed). Injection removed | `scanForLeaks(corpus, leakPatternsFor([88_888, 612_345]))` → `[]` | CI=true cert-setup + leak spec: 4 passed |
| R3 | 558bde6 | No RED. These are restored regression assertions, and they **pass on first run**. The suspected TextField regression **did not reproduce** | Test only: F1 in login-logout.spec.ts (login button 32/12 at 1280, 40/12 at 375). F2·F3 in settings.spec.ts (USD 최근 환율 error: --danger top border, --focus solid ring, 12px error, 32px field, border restored). Colors recomputed from tokens.css: `#9B1C1C` = rgb(155, 28, 28), `--g-700` `#005446` = rgb(0, 84, 70) | `CI=true pnpm test:e2e login-logout settings`: 16 passed |
| M1 | 473a47e | 「DOM 감사 M1」 test, E′2 · E′4 · E5 · E6-b 담당자 · E6-b 기한 at 375 and 320: `Expected >= 44, Received 18` (42 where the number wrapped). E5 375 edge hits were false | `.telLink` gets the `.runLink` pattern: inline-flex, centered, min 44 via `--touch-min`, `margin-block: calc((1lh - var(--touch-min)) / 2)`, position relative. No media query, no markup change | CI=true cert-setup + mobile-cert-intake: 9 passed (all five states ≥ 44x44 at both widths, paragraph height equals plain-inline ±0.5, top and bottom 2px hit the link, no overflow at 320). regression-1 and regression-2 pass |

## Final gates (run one at a time)

| Gate | Result |
|---|---|
| `pnpm lint` | exit 0 (0 errors) |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm lint:sql` | exit 0 (0 issues, 22 files) |
| `pnpm test:unit` | exit 0: 199 files / 2646 passed |
| `pnpm test:integration` | exit 0: 90 files / 2982 passed |
| `pnpm db:reset:test && CI=true pnpm test:e2e $(ls test/e2e/*cert*.spec.ts) login-logout settings` | exit 0: 708 passed (22.1m; the dependency chain pulls in all desktop and mobile-375 specs), 0 failed, 0 flaky |

## Deviations from Plan

1. **[Rule 3 - Blocking] Faster local E2E loop for cert specs.** `certs` depends on `cert-setup` → `desktop` + `mobile-375`, so a filtered `CI=true pnpm test:e2e <cert spec>` still runs about 649 tests (19 min). `test/e2e/global-setup.ts` also drops and re-seeds the schema on every invocation, so a separate cert-setup run gets wiped. For RED/GREEN iterations I used one invocation: `CI=true pnpm test:e2e --project=cert-setup --project=certs --no-deps --workers=1 test/e2e/cert.setup.ts <spec>`. cert-setup ran first every time. The final gate used the plan's full command.
2. **[Rule 3 - Blocking] Cold build vs webServer 60s timeout.** The first CI=true run timed out in `config.webServer` because the cold `pnpm build` took more than 60s. A warm build takes about 13s, so I ran `pnpm build` before each CI=true run. playwright.config.ts is unchanged.
3. **R5 temporary break.** The plan said "does not return notFound", and I changed the branch to return `throttled`. It was restored exactly, and the diff is empty.
4. **M1 test resets the closed state before the expiry case.** It sets `closedAt: null, closedReason: null` together with a past `expiresAt`, so E6-b 기한 is reached instead of staying in manual close. The test does not use `db:reset`.
5. **Checklist screenshots.** These were taken with a temporary `page.screenshot` inside the M1 test (not committed). They are in session scratch `shots/m1-*-{390,1280}.png` and are not in the repo. The pass/fail judgment comes from the DOM measurements, not from looking at screenshots.
6. **Prettier.** `prettier --check` flags intake.ts and the integration test, but the HEAD version of intake.ts was already non-conforming and there is no prettier gate in package.json. I did not reformat (no unrequested changes).

## 사용자 결정 필요

None. R3 did not reproduce. M1 needed no SYSTEM.md, token or DECISIONS change.

Note for the user and the next design review (not a blocker): the DOM audit's interpretive memo asked whether §3 「터치 목표」 is meant to cover in-sentence text links. This round applied the rule as written, following the existing `.runLink` precedent. If the intent was to exempt inline links, that needs a DECISIONS.md entry and a SYSTEM.md §3 sentence.

## Out of scope

- R2 (`domain/permissions/info-items.ts` `cert_winner.value`): replaced by 04.3-10, and it is on a risk path.
- L1–L5.
- Post-build gates (/review, /design-review, independent DOM audit of M1, /qa) belong to the orchestrator.

## Threat model check

T-5zp-01..04 mitigations are implemented and covered by tests (R1, R5, R6, R4). There is no new network surface, auth path or schema change.

## Files touched

app/c/[token]/intake.module.css · docs/design/checks/2026-10-01-cert-tel-link-touch-44.md · domain/certs/intake.ts · repositories/cert-prizes.ts · test/e2e/helpers/cert.ts · test/e2e/login-logout.spec.ts · test/e2e/mobile-cert-intake.spec.ts · test/e2e/mobile-cert-prize-leak.spec.ts · test/e2e/settings.spec.ts · test/integration/cert-prize-intake.test.ts · test/unit/certs/signature-png.test.ts (11 files, the same as frontmatter `files_modified`). Nothing in db/migrations, db/schema or domain/permissions. Not pushed.

## Self-Check: PASSED

- Commits 48a5ed4, 3976947, 09ff755, fc9f7be, dcd4586, 558bde6, 473a47e exist on claude/trusting-brahmagupta-k08auz (`git rev-list --count 6322a88..HEAD` = 7).
- The checklist file exists, with 0 `- [ ]` and no empty 근거.
