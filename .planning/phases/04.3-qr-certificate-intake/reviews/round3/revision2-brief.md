# Phase 04.3 — revision round 2 brief (binding)

Plans: /home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-NN-PLAN.md
Evidence files (read only the rows you need): .planning/phases/04.3-qr-certificate-intake/reviews/round2/
- checker-A.md, checker-B.md, checker-C.md (line-by-line checker results)
- codex-AC-matched-sonnet.md, codex-B-matched-sonnet.md (Codex findings, each CONFIRMED against the repo with file:line and the needed plan change)
- revision-shared-brief.md (conventions C1–C6 from round 1 — still binding)

## Rules
- WRITE EACH FIX IMMEDIATELY after reading what it needs. Do not read for more than a few minutes without editing. Never rewrite a whole plan.
- Korean prose like the existing plans; code/paths English. TDD: every behaviour task writes the failing test first (RED) — this was a finding in several plans. No `any`. pnpm only. No new deps.
- Keep waves/depends_on unless a fix below says otherwise. Keep task counts unless a fix below says otherwise. Threat IDs: reuse the same ID only for the same threat; new IDs in your group's range (A: 100–109, B: 110–119, C: 120–129).
- After editing, run for each plan: `source /tmp/claude-0/-home-user-ERP-PLANT8-260917/d28e9027-e530-5dd6-92c3-054ee58a2d38/scratchpad/gsd.sh && gsd_run frontmatter validate <plan> --schema plan && gsd_run verify plan-structure <plan>` — both must be valid. Do not commit.
- Return a table: finding → plan:line changed → one line of what changed, plus cross-group notes.

## Owner decision (locked, 2026-09-24 21:56 KST 「누적 잠금 넣기로 해」) — cumulative lock
- Per winner row, 20 cumulative wrong last-4 answers → HARD lock until staff unlock. FIXED constant 20 (NOT a setting). Counted across short locks, never reset by the 3-minute unlock or by a correct answer; idempotent replays don't count. Only 「잠금 풀기」 resets it.
- Short lock stays 5 wrong → 3 min. E3 `{n}` shows remaining until the short lock only. 20 = 4 × 5 so the hard lock lands on a short-lock boundary; hard lock wins when both apply.
- E3 hard-lock state: no unlock time; reason lines in an aria-live=polite block that receives focus (tabindex=-1); phone line + recovery line (「다른 이름 고르기」 stays live). Exact copy: take from 04.3-UI-SPEC.md (being finalized in parallel; if a string is not there yet, write the plan to "use the UI-SPEC E3 누적 잠김 copy" rather than inventing text).
- I3 「잠금 풀기」: row action shown only on unsubmitted hard-locked rows; confirm dialog/sheet (same `<dialog>` as 링크 닫기); request carries the row's lock stamp (`hard_locked_at`); server clears short+cumulative counters ONLY if still hard-locked with that same stamp; exactly one action-log entry (new append-only type, e.g. `cert_unlock`, no PII) written in the SAME transaction (C6 via `appendCertActionLogTx`); replay of an applied unlock returns the same success with no second log; does NOT bump the row `version` used by 일괄 저장; permission = certs.events write on that event (includes 경영관리); C1 guard first line; direct-POST test with the gate off.
- Schema (plan 02): add the counter + stamp columns needed (e.g. `cumulative_failed_attempts int not null default 0`, `hard_locked_at timestamptz null`) — do NOT use a setting key for 20.
- Purge (plan 12) clears these too.

## Group A — plans 01, 02, 13 (+ RESEARCH.md:59)
- checker-B B1: 02:304 and T-04.3-10 (≈460) PNG cap 200KB → 184,320 bytes (`SIGNATURE_MAX_PNG_BYTES`, defined by 06); state that 06 replaces 02's inline check with `inspectSignaturePng`.
- checker-B W1: drop orphan `verify_idem_key_hash` (02:268); specify the `verify_idem_outcome` map shape exactly as 03 uses it (keyHash → wrong `{o,r,ip,at}` / ok `{o,r,p,until,ip,at}`), so 03's `countRecentMisses` (jsonb_each) reads tracer rows correctly.
- Cumulative lock schema columns (above).
- codex A1: handle-server-error — the existing test asserting `toContain("Failed query")` (test/unit/actions/handle-server-error.test.ts:79-88) must be CHANGED (RED first) to the new no-message contract; remove "기존 케이스는 그대로" (02:400).
- codex A2 (= C2): cert Playwright projects vs admin-nav PM assertion (test/e2e/admin-nav.spec.ts:112) — run `cert-setup`/`certs` AFTER `desktop` and `mobile-375` via dependencies (playwright.config.ts:99 pattern), and make sure the PM `certs.events` seed (plan 09) does not break admin-nav's "PM has no 관리 menu" assertion (check what that assertion actually keys on; adjust the assertion only if the new menu legitimately appears, with the reason).
- codex A3: direct server-action calls from integration tests hit `server-only` via lib/actions/client.ts:2 → lib/viewer.ts:1 (see test/integration/leak-scan.test.ts:9-16). Replace with testing the domain functions the actions call + the E2E direct-POST (C1) — or another approach proven workable in this repo; do not rely on importing actions.ts in Vitest.
- codex A4: 01:184/189 revert — 택배 부제 is `--fs-md` (UI-SPEC :111/:199/:565/:568/:728) and NO numberless fallback sentence (UI-SPEC :160). Match UI-SPEC.
- codex A5: RESEARCH.md:59 still says to reserve/decide a migration number — rewrite to the no-reservation rule (as Pitfall 4 :382).
- checker-A W1: 02 Task 1 is ~46 files — split the schema/migration + C1/C2/C4 setup into its own task (before the UI slice) inside plan 02; keep one plan.
- checker-A I3: 02:264 "둘 다/두 명령" → all three commands.
- checker-A I2: 13:135 backstop counts → collect backstop items by grep, not fixed counts.

## Group B — plans 03, 04, 05, 06
- Cumulative lock server rule in 03 (verifyLast4: counting, hard-lock outcome `hardLocked`, replay returns same outcome, E3 hard-lock state UI + focus/live region, attack tests: 20 wrong across 4 short locks → hard lock; correct answer doesn't reset; replay doesn't double count). Update T-04.3-03 residual-risk numbers (≈0.2% per row) and remove "결정 대기" (03:114/317/339). Note the griefing risk (any QR holder can hard-lock rows) as accepted/mitigated by staff unlock + per-event/IP budgets.
- codex-B 1 (BLOCKER): 05 `ensure_cert_bucket` fails — deployer SA has no storage role (scripts/bootstrap-gcp.sh:118-121). Add the needed role grant to bootstrap-gcp.sh + a `user_setup` item for the owner (like plan 08's KMS roles), and a deploy test.
- checker-B W3: 05 must list `test/unit/deploy/fakebin/gcloud` in files_modified and add `storage buckets describe/create/update/add-iam-policy-binding` branches with a state file.
- codex-B 2: `DbOrTx` (db/client.ts:48) lacks `delete`; 06's `deleteSignatureUploadIntent(…, tx)` won't compile — extend the type (or use a tx-typed repo function) explicitly, with the test.
- codex-B 3 = checker-B B2: 04 PM tests need certs.events permission before plan 09 seeds it — grant inside the tests (`upsertPermission` setup) with that exact route.
- checker-B W7: 04 T3 ⑤(f) — name one route (insert event with `created_by` via db/client, or domain createEvent with the granted PM viewer).
- codex-B 5: key rotation vs `verify_idem_outcome` nested `p` ciphertext — DECIDED: 03 treats an undecryptable replay entry as "replay unavailable" and returns a definite outcome that sends the user to re-verify, WITHOUT re-issuing a proof that overwrites a newer one (entries live 60 min, so rotation need not rewrite them). Plan 08 is unchanged for this. Add the test.
- checker-B W4: 04 Task 2 TDD — tests first (E2E cases or pure helpers with unit tests before the UI code).
- checker-B W5: 06 ink check — use one measure on both sides (client counts inked pixels of its own export, same threshold) or add an overlapping-stroke case that must pass.
- checker-B W6: 04 is 25 files — split Task 1 (qrcode install + winner-rules vs events domain/registry) into two tasks.
- info: 03 `isDefiniteResult` "여덟 가지" vs six listed → make count match (include hardLocked if new); 06 give E5 kind a distinct name from verify `submitted`; 03 check `submitted_at` before replaying an ok entry.

## Group C — plans 07, 08, 09, 10, 11, 12
- Cumulative lock I3 unlock in 10 (action, domain, repository, confirm dialog reuse, integration + E2E incl. replay, version untouched, direct-POST with gate off). New action-log type appended in domain/action-log/record.ts (append-only).
- checker-B W2 + lock: 12 purge also nulls `verify_idem_outcome`, `verify_proof_hash`, `verified_until`, `cumulative_failed_attempts`/`hard_locked_at` (whatever 02 names) — assert in test.
- checker-B W1: 10:~146 remove `verify_idem_key_hash` clearing (column dropped).
- codex C1: 08 rotation — deployed service must have v2 wrapped key BEFORE rotate-key rewrites ciphertext: runbook + deploy.sh provisioning of `APP_DATA_KEY_v2_WRAPPED` to the service first, then rotate; test it.
- codex C3: 07 `getSubmissionForReview`, 11 `getCertificatePrint` must pass DTOs through `project()` (domain/permissions/project.ts:19-32) so turning off `cert_submission.value` actually hides fields; test with visibility off.
- codex C4: 07 `revealRrn`/`recordRrnReopen` must check `can(viewer,"certs.submissions","view")` in addition to `visible()`; test with menu revoked but info-item visible.
- codex C5 = checker-C W3: 07 `revealRrn` — write `mask_reveal` through the tx-scoped append (C6 helper) so it doesn't take a second pool connection while holding FOR SHARE; test.
- codex C6: 10 `closeEvent` — write `status_change` log in the same tx (C6 helper) instead of after commit.
- codex C7: 08 Task 2 and 09 Task 2 — tests first (RED) before implementation steps.
- codex C8: 11 add `app/print/certs/[id]/error.tsx` with the approved copy 「인쇄물을 만들지 못했습니다」 (check UI-SPEC P1 ERROR row for the exact string).
- checker-C W2: 08 T2 ⑤ "openssl rand not called" unobservable → assert via original-key SHA-256 / contract decrypt.
- checker-C I2: 07 ② page and 11 ① print route — call `assertCertFeatureEnabled()` BEFORE `requireSession`.
- checker-C W1: 07/08/10 over 15 files — accepted (vertical slices); add one line in each plan's objective saying so. Do not split.
