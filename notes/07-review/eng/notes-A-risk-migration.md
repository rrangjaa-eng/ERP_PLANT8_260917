# Phase 07 eng review — Reviewer A (risk paths · migrations · auth · permissions)

Scope: 07-02 · 07-04 · 07-05 · 07-07 · 07-09 · 07-11 · 07-13 · 07-15 + phase-wide PR structure.
Base: HEAD 6951904 (PR #257). Read-only review, nothing in the repo was edited.
Counts: **P1 3 · P2 13 · P3 9** (plus 3 suppressed in the appendix)

---

## 0. Phase-wide PR structure (question 1)

### 0.1 Facts checked

- **No "PR 묶음 · 브랜치" section exists for 07.** I grepped `PR 묶음|PR-[A-Z]|브랜치` across all 07 plans, CONTEXT, RESEARCH, VALIDATION and UI-SPEC. The only hits are D-725 (another branch's name). Contrast: ROADMAP.md:959 defines the 06.5 grouping (PR-A…PR-D2). ROADMAP 07 section (:1135-1175) shows only waves.
- **The de-facto model is one PR per plan, 25 PRs.** Each plan says "PR 하나". Dependencies are written as "X가 main에 있어야 한다" (07-06:111, 07-07:93, 07-09:106, 07-11:118, 07-13:95, 07-15:109).
- **The 8 user-merge claims checked against the hook regex** (.claude/hooks/plant8-skill-gate.sh:311, `^(db/migrations/|db/schema/|domain/auth/|domain/permissions/|lib/crypto|scripts/(deploy|rollback|bootstrap-gcp|promote-guard)\.sh$|\.github/workflows/|infra/|\.claude/|CLAUDE\.md$)`), using every plan's `files_modified`:

| Plan | Hook risk files | Claim | Reality |
|---|---|---|---|
| 07-02 | db/schema/expenses.ts, vendors.ts, db/migrations/* | user | ✔ hook-blocked |
| 07-04 | domain/permissions/matrix.ts, roles.ts | user | ✔ (only those 2 of 8 files are risk paths) |
| 07-05 | **none** (domain/seed/*) | user + `hold` label | ✘ the hook allows a session merge. `hold` is a CLAUDE.md condition only: `grep -n hold .claude/hooks/plant8-skill-gate.sh` = 0 hits |
| 07-07 | db/schema/notifications.ts, migrations | user | ✔ |
| 07-09 | domain/auth/hooks.ts, accounts.ts, lockout.ts | user | ✔ (lib/viewer.ts and lib/env.ts are not risk paths; they ride along) |
| 07-11 | db/schema/*, migrations | user | ✔ (also carries non-risk domain/evidence/*) |
| 07-13 | migrations | user | ✔ |
| 07-15 | domain/permissions/* | user | ✔ |
| all other 17 | none | session | ✔ none of them touches a risk path |

- **No non-risk plan touches a risk path.** I checked 07-01, 07-06, 07-17 and 07-21 specifically:
  - 07-21 touches domain/people, domain/org, domain/archive, repositories/roles and repositories/users: none are risk paths.
  - 07-17 touches repositories/login-attempts.ts: auth-adjacent but not a risk path.
  - 07-06 touches scripts/demo-data.ts: not a risk path.

### 0.2 Findings

**[P1] (confidence: 8) 07-01-PLAN.md:169-171 — The phase has no branch/PR model, so 8 user-merge PRs end up in a serial chain of at least 4 user round-trips. The non-risk work cannot flow unattended.**

> 07-01:169 "**스키마 플랜은 웨이브마다 하나**: S1(07-02, W1) · S2(07-07, W2) · S3(07-11, W3) · S4(07-13, W4)."
> 07-07:93 "07-02(S1)가 main에 있어야 마이그레이션 번호가 정해진다." · 07-11:118 "07-07(S2)이 main에 있어야" · 07-13:95 "07-11(S3)이 main에 있어야 한다"

Critical paths through user merges, from the frontmatter `depends_on`:
- 07-02 → 07-07 → 07-11 → {07-13, 07-18, 07-22 → 07-23/24}
- 07-04 → {07-06, 07-09 → 07-17 → 07-21, 07-25}
- 07-03 → 07-05 → 07-15 → {07-19, 07-20, 07-21, 07-23, 07-24}

The non-risk plans gated on a user merge are 07-06 (on 02 and 04), 07-10 (on 07), 07-17 (on 09), 07-18 (on 11), 07-19/20/21 (on 15), 07-22 (on 11), 07-23/24 (on 11 and 15), and 07-25 (on 04 and 05).

Every wave therefore ends on "wait for the user to merge on GitHub". With the user away (tonight's directive), the phase stalls after W1. This also contradicts CLAUDE.md:105: "위험 경로 변경은 별도 PR로 떼어 나머지가 무인으로 흐르게 한다".

The S1→S4 chain exists only for migration numbering. 07-13 has no data dependency on 07-11, and 07-07 none on 07-02.

**Remedy.** Add a "PR 묶음 · 브랜치" section to ROADMAP and 07-01, along these lines:

| PR | Contents | Merge | When |
|---|---|---|---|
| **PR-S** | One schema plan in W1 holding S1+S2+S3+S4 (07-02 + 07-07 + schema half of 07-11 + 07-13), one branch. Separate commits are fine, but one `db:generate` sequence and one regenerate at merge. This satisfies .claude/rules/db.md "한 웨이브에서 스키마를 바꾸는 플랜은 하나". | user | W1 |
| **PR-AUTH** | 07-09 alone | user | W1, if `password_reset` is registered in the session-merge 07-04 first (below), otherwise W2 |
| **PR-PERM** | 07-05 seed table + 07-15 server + the matrix.ts/roles.ts detail edits currently in 07-04 | user | after the D-722 card answer |
| **07-04′** | action-log/settings/approvals/people only, no domain/permissions | session | W1 |
| **R20 domain half of 07-11** | domain/evidence/private-files.ts, domain/evidence/index.ts, repositories/files.ts | session | right after PR-S |
| Everything else | as now | session | as now |

Effects:
- User merges drop from 8 to 3, and user round-trips on the critical path from about 5 to 2.
- Night 1 (unattended): 07-01, 07-03 and 07-04′ merge, and PR-S and PR-AUTH become ready.
- Morning: the user merges PR-S and PR-AUTH and answers the D-722 card. W2–W4 then flow unattended, PR-PERM goes up, and once it is merged W6–W8 flow.

**[P2] (confidence: 7) 07-04-PLAN.md:100 — 07-04 puts 6 non-risk files under a user merge because of 2 permissions files. That blocks 07-06, 07-09 and 07-25.**

> "**PR 하나 · 사용자 머지**(D-724: `domain/permissions/matrix.ts` · `roles.ts`가 위험 경로)."

The permissions edits are only `detail.changes` logging (Task 3, :190-215). 07-15 rewrites the same two files anyway (07-04:209 "07-15가 같은 파일에 상한 가드를 더하므로").

**Remedy.** Move Task 3's matrix.ts and roles.ts edits into 07-15 (PR-PERM). 07-04 then becomes session-merge and the new action types land unattended in W1.

**[P2] (confidence: 7) 07-05-PLAN.md:95 — The user-merge claim relies on a `hold` label that no gate enforces.**

> "**PR 하나 · 사용자 머지 · `hold` 라벨**: 세션이 PR을 열 때 `hold` 라벨을 붙인다(경로가 위험 경로 정규식 밖이라 훅이 무인 머지를 막지 않으므로)."

Evidence: no `hold` check exists in plant8-skill-gate.sh. Any session that misses the label merges it.

The values are already user-decided through the D-722 card. So either:
- fold 07-05 into PR-PERM: 07-15 already modifies domain/seed/role-defaults.ts, so this removes one serial user round-trip; or
- drop the user-merge claim and let the session merge after the card answer.

---

## 1. Architecture

### 1.1 Migrations (question 2)

**Migration numbering.** Compliant in substance:
- Each plan says the numbers are provisional and come from `pnpm db:generate` (07-02:19, 07-07:18, 07-11:30, 07-13:19).
- Each plan bans hand-editing the journal (07-02:37).
- Each plan says to regenerate after merging origin/main.

Hard-coded filenames remain in `files_modified` and in acceptance greps (below).

**Two-step `_validate` migrations.** The rationale is correct and matches the 0035 precedent:
- db/migrations/0035_payment_followup_validate.sql:1-6 explains the setup. drizzle `migrate()` runs all pending migrations in one transaction, so the VALIDATE runs under the ALTER's ACCESS EXCLUSIVE lock when both deploy together. The file split exists only for squawk `constraint-missing-not-valid`.
- The plans cite 0035 for the header (07-02:156, 07-11:222). Ordering is correct: the generated file is NOT VALID, then the `--custom` validate file comes after.
- `lint:sql` is in every BLOCKING step with "no new exclusions" (07-02:163, 07-07:154, 07-11:229, 07-13:188).

**[P3] (confidence: 7) 07-13-PLAN.md:137 (also the 07-02/07-07/07-11 acceptance greps) — Acceptance greps hard-code `0046_phase7_…sql`, but the number changes on every regenerate.**

> "`grep -c "BEFORE TRUNCATE" db/migrations/0046_phase7_action_log_immutable.sql` >= 1"

**Remedy.** Use a glob (`db/migrations/*_phase7_action_log_immutable.sql`). In `files_modified`, write `*_phase7_…` instead of numbers.

**Regenerate churn.** With 4 separate user-merged migration PRs, every main move while a PR waits for the user forces another delete/regenerate/re-trim cycle. The hand trims (header, `SET LOCAL`, NOT VALID) are lost on regenerate (07-02:102 "생성기가 지우는 것"), and each re-push re-runs CI. PR-S (above) collapses this to one regenerate.

**07-11 ships domain code inside the risk PR (P3).** domain/evidence/private-files.ts, domain/evidence/index.ts and repositories/files.ts belong to the R20 domain change.

Production failure: migrations run before the traffic switch (.claude/rules/db.md "옛 코드가 새 스키마 위에서 몇 분"). A file uploaded in that window by the old revision gets `private_to_owner=false` (column default). It stays hidden while the document type is private, but leaks if the type is later switched to public. Low risk.

**Remedy.** Either re-run the backfill UPDATE idempotently from the new code path on first upload/visibility read, or accept it in the header note.

### 1.2 07-13 action_log immutable trigger

The trigger design is sound:
- BEFORE DELETE row, BEFORE TRUNCATE statement, BEFORE UPDATE row guard.
- No INSERT trigger.
- The bypass is `SET LOCAL session_replication_role = replica` in test/ only.

Supporting facts:
- CI postgres is `postgres:16` with `POSTGRES_USER: erp` (.github/workflows/ci.yml:126-130), which is a superuser, so `SET session_replication_role` works.
- No production code deletes from action_log. The only UPDATE is `markActionLogRowsPruned` (repositories/action-log.ts:181-185, `.set({ prunedAt, prunedBy })` with `isNull(prunedAt)`).
- FK `action_log_actor_id_users_id_fk` is `ON DELETE no action` (0003:74), so no cascaded UPDATE or DELETE hits the trigger.
- E2E resets with `DROP SCHEMA public CASCADE` (test/e2e/global-setup.ts:47), which triggers don't affect.
- There is no retention/purge job (`grep` for delete/TRUNCATE on action_log in domain/repositories/scripts/lib/app = 0).

**[P2] (confidence: 7) 07-13-PLAN.md:128 — The setup bypass wraps only `beforeEach`. `resetDatabase()` runs the same TRUNCATE outside the wrapper and will throw once the trigger lands.**

> "③ **GREEN — setup 우회(AQ-17).** `beforeEach`의 `db.execute(sql.raw(truncateStatement))`를 `db.transaction(async (tx) => { SET LOCAL session_replication_role = replica; 같은 TRUNCATE })`로 감싼다."

Evidence, test/integration/setup.ts:25-28:
> `export async function resetDatabase(): Promise<void> { await db.execute(sql.raw(truncateStatement)); ...`

It is used by evidence-row-scope, expense-visibility, evidence-file-only-filter and row-scope-entries (`grep -rln resetDatabase test`). Two of those, evidence-row-scope and row-scope-entries, are also edited by 07-15.

**Remedy.** Extract one `truncateAll()` helper that does the replica-transaction TRUNCATE and call it from both `beforeEach` and `resetDatabase`. Add `test/integration/evidence-row-scope.test.ts` (any one resetDatabase user) to Task 1 verify.

**[P2] (confidence: 7) 07-13-PLAN.md:34 — The UPDATE guard allows un-pruning and re-attributing who pruned.**

> "UPDATE는 `pruned_at` · `pruned_by`만 바뀌는 경우에만 통과한다"

As written, `UPDATE action_log SET pruned_by='someone-else'` on an already-pruned row passes, and so does `SET pruned_at=NULL`. That defeats the purpose stated in db/schema/action-log.ts:10-15 ("누가·언제 정리했는지 남는 컬럼 … 사후에 구별").

The prep note proposed the narrower rule: 260907-compare.md D5 "UPDATE는 `pruned_at`·`pruned_by` NULL→값만 허용".

**Remedy.**
- Allow UPDATE only when `OLD.pruned_at IS NULL AND NEW.pruned_at IS NOT NULL AND NEW.pruned_by IS NOT NULL`.
- Optionally reject `action_type` in UNPRUNABLE_ACTION_TYPES too; today that is enforced only in app code (repositories/action-log.ts:174).
- Add test cases for un-prune and re-attribution.

**[P3] (confidence: 6) 07-13-PLAN.md:126 — The column whitelist (`seq · actor_id · … · occurred_at`) silently leaves any future action_log column mutable.**

**Remedy.** Compare `to_jsonb(NEW) - 'pruned_at' - 'pruned_by'` with `to_jsonb(OLD) - 'pruned_at' - 'pruned_by'`.

**Production safety of 07-13.**
- Creating the trigger takes a brief SHARE ROW EXCLUSIVE lock, with no scan. OK.
- Phase 8 demo cleanup can no longer delete rows (07-13:44 says so). 260907 solved this by temporarily disabling the trigger (see parity section).
- Cloud SQL: the migrator role owns the table, so CREATE FUNCTION/TRIGGER is fine without superuser.

### 1.3 Auth (07-09, question 3)

Existing code checked:
- domain/auth/hooks.ts: before :44-72 (archived reject with dummy hash :61-65, lock check :67-71); after :86-110.
- domain/auth/lockout.ts:42-78 (`recordLoginFailure`: email advisory lock, record, count, `account_lock` in one tx).
- repositories/login-attempts.ts (`lockLoginEmail` :66-69).
- domain/auth/accounts.ts:73-100 (`resetPassword`, not transactional), :106-134 (`unlockAccount`).
- lib/viewer.ts:30-63.

**[P1] (confidence: 8) 07-09-PLAN.md:138 (+ :219) — The `getSession()` retiree check cannot work without registering `resignationDate` in better-auth `additionalFields`. That file is in `lib/auth.ts`, which the plan forbids touching.**

> :138 "`getSession()`의 보관 판정 옆에 같은 판정 + `log.warn("session.resigned_user", { userId })`"
> :219 "`git diff --name-only origin/main...HEAD -- lib/auth.ts`가 빈 출력"

Evidence: lib/viewer.ts:46 reads `rawUser.archivedAt` from `session.user`. That works only because lib/auth.ts:40-43 registers it ("않으면 drizzle-adapter가 컬럼을 싣지 않는다 … archivedAt: { type: "date", required: false, input: false }"). test/integration/archived-session.test.ts exists precisely to pin that premise.

`resignationDate` is not registered, so `session.user.resignationDate` is `undefined`. The check is then dead code that still passes the acceptance grep (`grep -c resignationDate lib/viewer.ts >= 1`). Existing sessions of retirees keep working for up to 30 days, which is threat T-07-09-01 ("high"), unmitigated.

**Remedy.**
- Add `resignationDate: { type: "string", required: false, input: false }` (or "date", matching the column) to lib/auth.ts additionalFields, and put lib/auth.ts in `files_modified`.
- Narrow the :219 acceptance to "customRules unchanged".
- Add an archived-session-style test: issue a session, set resignation_date to yesterday, then assert `auth.api.getSession` carries the value and that the `getSession` predicate rejects it.
- The alternative, an extra users query in `getSession` on every request, costs a round-trip per request. Prefer additionalFields.

**[P2] (confidence: 8) 07-09-PLAN.md:113 + :174 — F1 adds a new advisory-lock helper with a different key from the existing one, so the two lock paths would not serialize against each other.**

> :113 "before 훅이 한 트랜잭션에서 이메일별 `pg_advisory_xact_lock(hashtext(email))`"
> :174 "`repositories/login-attempts.ts`에 이메일별 advisory xact lock 도우미(viewer 필수 · tx 인자)"

Evidence: repositories/login-attempts.ts:66-69 already has `lockLoginEmail(viewer, email, tx)` = `pg_advisory_xact_lock(hashtextextended('login_attempts:' + email, 0))`, and recordLoginFailure uses it (lockout.ts:59). A `hashtext(email)` lock in `before` would not serialize with the `after`/`recordLoginFailure` path. The acceptance `grep -c pg_advisory_xact_lock repositories/login-attempts.ts >= 1` is already true today.

**Remedy.**
- Reuse `lockLoginEmail` and add no new helper.
- Restate eng E5: global-db reads (`lockoutConfig`, `findUserByEmail`) happen before the tx; inside it, only tx calls.

**[P2] (confidence: 6) 07-09-PLAN.md:174 — Moving the failure record into `before` leaves the `account_lock` log path unspecified.**

> "after 훅: 성공이면 기존 해소, 실패면 다시 기록하지 않음 — 대신 이번 실패로 임계에 닿았는지(`isLocked(count+1, threshold)`) 보고 … `account_lock` 행동 로그를 남기는 기존 지점이 한 번만 남는지 확인."

Today recordLoginFailure (lockout.ts:59-75) records the row and the lock log atomically. Once the row is pre-recorded in `before`, the `count+1` arithmetic in `after` double-counts the pre-recorded row. Concurrent `after`s can each see `count >= threshold` and log `account_lock` twice. test/integration/action-log.test.ts:134 covers concurrent failures and lock-log uniqueness.

**Remedy.** Specify the design:
- `before` (tx + lockLoginEmail): count, reject if locked, insert the failure row, and if the new count == threshold mark the attempt `lockCandidate` in ctx.
- `after` on failure: in a tx with lockLoginEmail, re-count. If count == threshold and no `account_lock` exists since windowStart, write `account_lock` and return 403.
- `after` on success: resolve.
- Add action-log.test.ts and the concurrency test to the Task 2 verify.

**[P2] (confidence: 8) 07-09-PLAN.md:213-216 (Task 3) — The default of 60 breaks an existing integration test the plan doesn't list.**

> "기본값 10 → 60"

Evidence, test/integration/rate-limit.test.ts:25-34:
> "같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 부르면 429가 온다" … `for (let i = 0; i < 11; i++)` … `expect(last!.status).toBe(429)`

CI sets no `RATE_LIMIT_LOGIN_MAX` (grep .github = 0). .env.example:27 still says `=10`, so a local dev with .env.local passes while CI goes red. lockout.test.ts:33 also has a comment assuming 10.

**Remedy.**
- Add rate-limit.test.ts: make the loop `env.RATE_LIMIT_LOGIN_MAX + 1`, or set the env in the test.
- Add .env.example to `files_modified`, and rate-limit.test.ts to verify.

**[P2] (confidence: 6) 07-09-PLAN.md:166-172 — `resetPassword` stays guarded only by `admin.people` write. The grant-ceiling check against account takeover is left to session-merged 07-17.**

Evidence:
- domain/auth/accounts.ts:77-79: only `can(viewer,"admin.people","write")`.
- 07-17:273 "위임자가 상한 밖 사람 비밀번호 초기화(계정 탈취) … 도메인 `resetPersonPassword` 상한 판정" puts the check in domain/people.
- scripts/account-cli.ts and any other caller of `resetPassword`/`unlockAccount` bypass it.

**Remedy.** In 07-09, add the ceiling (`assertCanGrantRoles(viewer, [target.roleId])`, grant-ceiling.ts) inside `resetPassword` (and `unlockAccount`). The authorization control then lives in the user-merged domain/auth/, and 07-17 only calls it.

**[P3] (confidence: 6) 07-09-PLAN.md:142 — `resetPassword` ordering.** The plan suggests putting the resolve-and-log tx before `updatePassword`. If `updatePassword` then fails, the log shows a reset that never happened and the lock is already cleared.

**Remedy.**
- Keep the external calls first, then the tx; on tx failure, log an error and rethrow. The password changed but there is no audit row, which is the lesser evil.
- Or record `password_reset` with `detail.phase` and accept. Decide and test the failure branch either way. The plan already asks for a SUMMARY rationale.

**[P3] (confidence: 5) 07-09-PLAN.md:249 (T-07-09-05) — The IP limit of 60 raises password-spray capacity sixfold.** Per-account lock does not stop one IP spraying one password across many emails (30 known staff emails). The risk is accepted per D-723. Note it in OPERATIONS and keep it env-tunable. A "distinct emails per IP" cap could be a follow-up.

### 1.4 Permissions (07-04, 07-15, question 4)

**[P1] (confidence: 7) 07-15-PLAN.md:179 + :39 — The dependent-permission cascade can switch off `admin.permissions` write without passing through the last-admin and seat-lock guards.**

> :39 "`보기`를 끄면 같은 메뉴 `쓰기` · `승인`을 같이 끈다 — … 상한 · 자기 잠금 검사는 같이 바뀌는 칸까지 포함(R7)"
> :179 "`setPermissionCell`은 요청 칸 + 딸린 칸을 한 tx에서 상한 · 자기 잠금 검사(모든 칸 기준) 뒤 저장"

Evidence, domain/permissions/matrix.ts:113-135. The guards fire only on the literal request `input.menu === "admin.permissions" && input.action === "write" && input.allowed === false`:
- SelfLockoutError (:113-120),
- `lockSeatKeys` + re-read + `assertAdminRoleRemains` (last admin, 06.4 D-6403/D-6408/F5/F7, :123-135).

A request "admin.permissions **view** off" for another role cascades into write off. That skips the last-admin assertion, so the last remaining admin role can lose the grid with no recovery except direct DB access, which is banned (CLAUDE.md §2). The plan names only 상한 and 자기 잠금.

**Remedy.**
- Run the existing guard block once per changed cell (requested plus dependent), keyed on `(menu,action,allowed)`, before any upsert.
- Add tests: view-off cascading into the last admin's write is rejected, with no cell changed and no log, and so is view-off on one's own role.

**[P2] (confidence: 7) 07-15-PLAN.md:171 — The R7 "delegate ceiling" case cannot be reached.**

> "(통합 R7) 같이 바뀔 칸 하나가 위임자 상한 밖 → 전체 거부(아무 칸도 안 바뀜)"

Evidence:
- `setPermissionCell` requires `can(viewer,"admin.permissions","write")` (matrix.ts:106-107).
- `assertCanEditRole` returns early for exactly that key (grant-ceiling.ts:101 `if (actor.keys.has(ADMIN_PERMISSIONS_WRITE_KEY)) return;`).
- `setPermissionCell` does not call `assertCanEditRole` at all; only `setVisibilityCell` does, at :203.

The plan's read_first claim "matrix.ts:97-160(`setPermissionCell` — … 상한)" is wrong. A delegate can never reach the cascade, so the test is vacuous or forces an invented fixture.

**Remedy.** Drop the delegate case for `setPermissionCell`. Replace it with the last-admin and self-lock cascade cases (P1 above). If delegates should edit the grid, that is a product decision for a card, not this plan.

**[P2] (confidence: 6) 07-15-PLAN.md:212-214 (R18) — Production roles with `evidence.intake` write but no `evidence` view silently lose all evidence access.**

> "`evidenceScopeFor`에서 `evidence` 보기 검사를 `evidence.intake` 쓰기 검사보다 먼저 — 보기 없으면 none"

Evidence:
- scope-for.ts:168 today returns `all` for intake write regardless of view.
- domain/seed/index.ts:297 says intake is seeded to no role, so any production intake grant was hand-set in the grid (for example for 경영관리), possibly without `evidence` view.
- The R7 cascade is same-menu only, and `evidence.intake` vs `evidence` are different menus (menus.ts:72-73), so it does not repair this.

**Remedy.**
- Make 07-05's D-722 card list every role granted `evidence.intake` write without `evidence` view, and seed `evidence:view` insert-if-absent for them.
- Or add a pre-merge read-only staging query (no prod DB command) and a SUMMARY note.
- Better still, use a `requires` map (see parity: 260907 had cross-menu requirements) so intake write implies evidence view.

**[P2] (confidence: 8) 07-04-PLAN.md:198 + :190 — Adding `changes` to existing detail objects breaks exact-match tests the plan doesn't list.**

> "권한표 칸: `changes = {allowed: [이전 또는 null, 이후]}` + 기존 detail 칸 유지"

Evidence (all `toEqual` on detail):
- test/integration/roles.test.ts:152 `toEqual({ workScope: { from: "team", to: "company" } })`
- test/integration/roles.test.ts:245 `toEqual({ viewScope: … })`
- test/integration/admin-cap-permissions.test.ts:94 `toEqual({ roleId: roleB, menu: "admin.permissions", action: "write", allowed: false })`
- settings.test.ts:141 `toEqual({ key, effectiveFrom, cancelled: true })`, if Task 2 touches `cancelHistorizedValue`

Task 3 verify runs admin-cap-permissions, which will go red, but `files_modified` doesn't allow editing it. roles.test.ts and settings.test.ts are not run at all, so they surface only in CI.

**Remedy.** Add these test files to `files_modified`, change them to `toMatchObject` or include `changes`, and add roles.test.ts and settings.test.ts to verify.

**[P3] (confidence: 5) 07-15-PLAN.md:179 — `setPermissionCell` changes its return from `void` to `{changed}`, but app/ edits are forbidden (:51).** Callers ignoring the value still compile, but the grid client shows stale dependent cells until 07-21. Note AQ-23-style staging drift in the PR body.

---

## 2. Code quality: interfaces the plans assume

| Plan claim | Exists? |
|---|---|
| 07-15 `assertCanEditRole`, `GRANT_FORBIDDEN_MESSAGE`, `loadRoleGrantSnapshots` (grant-ceiling.ts) | ✔ :93, :49, exported |
| 07-15 "setPermissionCell … 상한" | ✘ no ceiling call in setPermissionCell (see P2) |
| 07-09 `resolveOpenFailures(viewer,email,reason,tx)` | ✔ but `reason: "success" \| "admin_unlock"` (login-attempts.ts:45). `admin_reset` needs a union change. The column is plain text with no CHECK (db/schema/login-attempts.ts:15), so the plan's fallback (:115) is unnecessary. |
| 07-09 new advisory-lock helper | ✘ duplicate of `lockLoginEmail` (P2) |
| 07-09 `toKstDate` in domain/holidays/business-day.ts | not verified. Siblings use `seoulToday`/`kstToday` (domain/expenses/index.ts:230, lib/kst-date). Reuse those. |
| 07-13 `markActionLogRowsPruned` | ✔ repositories/action-log.ts:170 |
| 07-11 `code_items.private_to_owner` for the backfill | ✔ db/schema/code-tables.ts:28 |
| 07-05 `insertPermissionIfAbsent` / `insertVisibilityIfAbsent` | ✔ repositories/permissions.ts:60, :142 |
| 07-13 backdate callers to convert | ✔ bank-transfer-export.test.ts:534 and project-status.test.ts:694, :700 are both listed. evidence-card-attach.test.ts:423 (prune UPDATE) stays legal. |

**[P3] (confidence: 6) 07-09-PLAN.md:139 — The retiree boundary is inconsistent across the codebase.** domain/expenses/index.ts:230 treats `resignationDate <= today` as resigned; domain/projects/members.ts:183 and corp-card-usages:265 use `<`. AQ-14 picks `<`. Name the canonical predicate, or extract one helper, and list the outlier.

---

## 3. Tests: coverage of planned paths

```
07-09 auth
 before hook: archived reject ............ [★★★ existing archive.test]
 before hook: retiree reject (same msg) .. [★★★ planned retiree-login]
 getSession retiree (existing cookie) .... [GAP: field not loaded → test can't observe; needs additionalFields + premise test]  CRITICAL
 F1 concurrent 8 → ≤5 checked ............ [★★ planned lockout via lock-race]
 account_lock exactly once under race .... [GAP: action-log.test.ts:134 not in verify]  REGRESSION
 Nth attempt → 403 lock msg .............. [★★ planned]
 resetPassword unlock + log ............... [★★★ planned reset-unlocks]
 resetPassword ceiling (delegate→sysadmin)  [GAP → moved to 07-17 E2E only]
 IP limit default 60 ...................... [★ unit] + rate-limit.test.ts:25 [REGRESSION CRITICAL]
07-13 trigger
 DELETE / TRUNCATE / non-prune UPDATE reject [★★★ planned]
 prune UPDATE passes ...................... [★★★ planned]
 un-prune / re-attribute .................. [GAP]
 resetDatabase() users (4 files) .......... [REGRESSION CRITICAL — not wrapped]
07-15 permissions
 cascade on / off ......................... [★★★ planned]
 cascade → last-admin guard ............... [GAP]  CRITICAL
 cascade delegate ceiling ................. [vacuous — unreachable]
 R16 rename/archive ceiling ............... [★★★ planned]
 R17 members block ........................ [★★★ planned]
 R18 intake w/o view → none ............... [★★ planned] prod-data impact [GAP]
 R19 org-unit fallbacks ................... [★★ planned]
07-04 detail.changes
 settings / permission / role / person ... [★★★ planned] roles.test:152,245 · admin-cap:94 · settings:141 [REGRESSION]
07-02/07-07/07-11 constraints ............. [★★★ planned phase7-s1/s2/s3-constraints]
07-11 R20 backfill ........................ [★★ planned, SQL-constant approach]
07-05 seed insert-if-absent ............... [★★★ planned] + role-smoke [→E2E]
```

---

## 4. Performance

- **07-09 `before` hook.** Adds one short tx with an advisory lock per sign-in. Negligible.
- **07-09 retiree check in `getSession`.** If it is implemented as a users query rather than additionalFields, that is +1 query on every request. Avoid it.
- **07-13 trigger.** Per-row BEFORE UPDATE on bulk prune adds O(rows) plpgsql calls. Prune is a rare admin action, so OK. No INSERT trigger, which is correct.
- **07-11 backfill.** `UPDATE files … WHERE owner_id IN (subquery)` runs under `statement_timeout 5s` (07-11:170). Files are small at 30 users. OK, but put the row-count estimate in the header (the plan says so).
- **07-15 R17.** `countActiveMembersOfRole` with `FOR UPDATE` on the role row is fine.

---

## 5. 260907 parity

Verified citations:
- ✔ 07-02 `db/schema/010_tables.sql:5428` (`payment_due_days`) and `:5448-5449` (supplier-only, 1..180).
- ✘ 07-02:73 cites `db/새판/151_early_pay_request.sql`. The real path is `db/legacy/151_early_pay_request.sql` (P3).
- ✔ 07-09 `020_functions.sql:247-290` `block_inactive_login`, and `server/src/people.ts:~1011` unlock route with `people.edit`.
- ✔ 07-11 `010_tables.sql:5259` (vendor_contacts), `:5314` (vendor_documents), `:2673` (po_number), `:3729` (project_documents), and `:4212-4226` (quotes.approval_evidence purchase_order/email/verbal + approval_note + approval_document_id).
- ✔ 07-15 `server/src/receipts.ts:243-252` (division visibility for people without a team).

**[P2] (confidence: 9) 07-13-PLAN.md:73 — The parity claim is false: 260907 had exactly this trigger set.**

> "260907 대조: 옛 로그는 앱 규약으로만 append-only(`ERP_PLANT8_260907 db/schema/` 행동 로그 표에 트리거 없음 — 260907-compare CMP-D5:97 「불변 트리거 없음」)"

Evidence:
- 260907 `db/schema/020_functions.sql:192-198` defines `audit_log_immutable()` ("감사 기록은 고치거나 지울 수 없습니다").
- `db/schema/080_triggers.sql:111/117/123` defines `audit_log_no_delete`, `audit_log_no_truncate` and `audit_log_no_update`.
- 260907-compare.md:97 (D5) says "옛 `020_functions.sql:192-209` `audit_log_immutable`". "없음" there refers to *our* repo.
- 260907 also blocks UPDATE entirely. Its comment (020:188-190) says the first net is revoking UPDATE/DELETE from the server account.
- Its demo cleanup disables and re-enables the trigger (`150_seed_cleanup.sql:81-83`). That is the parity answer to 07-13:44's Phase 8 question.

**Remedy.**
- Fix the citation.
- Record the deliberate difference: we allow one-way prune marks.
- Note the REVOKE layer as not adopted, with the reason.
- Point Phase 8 cleanup at the 150_seed_cleanup pattern, or keep "no deletes".

**[P2] (confidence: 7) 07-15-PLAN.md:83 — The parity claim misdescribes 260907's dependent permissions.**

> "260907 권한은 역할 고정(`ERP_PLANT8_260907 server/src/auth.ts` 역할 비교 — 260907-compare CMP-D7:99 「딸린 권한 자동 켬끔 = 화면 체크박스 묶음」)"

Evidence: 260907 enforced dependency in the DB through a per-permission `requires` graph:
- `020_functions.sql:1620-1645` `grant_required_permission` ("「지출결의 결재」를 켜면 「지출결의 보기」가 저절로").
- `:4233-4247` `revoke_dependent_permissions` ("보기를 껐는데 결재가 남으면 화면은 막히고 서버는 열린다").

The 07 design is same-menu only, so cross-menu requirements such as `evidence.intake → evidence` are not covered (see the R18 P2).

**Remedy.** Correct the citation. Consider a small `REQUIRES` map in menus.ts (same-menu view by default, plus explicit cross-menu pairs) so R7 and R18 share one rule.

Missing parity items in my area (P3):
- 260907 `block_inactive_login` rejects any set `left_date`, future dates included, and enforces at the DB layer on session insert ("서버가 검사를 빠뜨려도 안 열린다"). Our plan uses past dates only (AQ-14, deliberate) and app-level checks only. Record this as a decision.
- 260907's unlock refuses retirees (people.ts comment above :1011, "퇴사한 사람은 안 푼다"). 07-09 reset/unlock does not check. Harmless because login is blocked anyway, but it leaves unlock log noise. Mention it.

---

## 6. Failure modes (no test + no error handling + silent = critical)

1. **Retiree session survives (07-09).** The `getSession` check reads a field that is never loaded. It is silent, and the planned test can't catch it unless it exercises the real better-auth session. **CRITICAL.**
2. **Cascade removes the last admin's grid write (07-15).** No guard or test is planned, and it is silent: the next login simply has no grid. Recovery needs a direct DB fix, which is banned. **CRITICAL.**
3. **resetDatabase TRUNCATE blocked (07-13).** It is loud (4 test files error in CI), not silent. P2.
4. **Re-attributing a pruned row (07-13).** Silent tampering is allowed by the guard as written, with no test. **Critical, audit integrity.**
5. **R18 in production (07-15).** A role with intake write and no view silently sees zero evidence after deploy. There is no data check. High.

---

## Appendix (suppressed, confidence 3-4)

- (4) Under concurrency, 07-09's pre-recorded failure rows make a correct-password login inside the lock window briefly see "locked" for parallel requests. Acceptable, but say so in the SUMMARY.
- (4) D-725 / 07-CONTEXT.md:91 names branch `claude/project-thread-qvy9gl` for 06.1-15/16, while the brief lists PR #256 as `claude/project-thread-lqo39w`. E1 is checked by SUMMARY files on main, so this is harmless. Fix the name if it is stale.
- (3) 07-07 replaces the `email_status` CHECK on `notifications` with NOT VALID + VALIDATE. Fine at the current size. Production risk only if the notifications table grows to more than about 1M rows before 07 ships.
