# Phase 07 eng review — Reviewer C (notification engine · audit/leak scan)

Scope: 07-03, 07-08, 07-10, 07-14, 07-19, 07-22, 07-25. Read-only review at HEAD 6951904.
Reviewer: Opus (independent). Format: gstack plan-eng-review.

Counts: **P1 = 2 · P2 = 13 · P3 = 7** (+ appendix 2 suppressed)

---

## P1

### [P1] (confidence: 9/10) 07-10-PLAN.md:158 — `since` window from `findLastTickRun` silently drops events (weekends, cap overflow, commit race); same flaw inherited by 07-14 `expense-result`

Plan line (07-10:158):
> `since`는 `findLastTickRun`의 `startedAt`(없으면 7일 전)으로 한 번 셈해 모든 종류에 넘긴다(D-716 창 — 이 태스크의 종류는 쓰지 않음).

07-10:234 (proxy-registered): > 대리 등록: 지난 tick 이후 생긴 대리 등록 건 → 그 프로젝트 담당 PM 한 건 … · 지난 tick 이전 건은 창 밖이어도 dedup이 막음
07-14:148 (expense-result): > `ctx.since` 이후 지출결의 결재 인스턴스의 마지막 단계가 승인된 사건(원천 = 결재 단계 `acted_at`, 서버 시각)마다 기안자 후보 하나
07-14:189: > 반려 · 지급 완료 · 지급 취소 · 금액 바뀜 … 갈래를 같은 `since` 창 · 사건 id 키로.

Evidence in current code:
- `domain/notify/tick.ts:106` evaluates kinds only `if (businessDay)`, but `insertTickRun` at `tick.ts:144-158` runs **every** day (business or not). Cloud Scheduler fires daily `--schedule="0 9 * * *"` (`scripts/deploy.sh:643`). So on Monday, `findLastTickRun` (`repositories/notifications.ts:328-343`, ordered by `startedAt desc`, no `business_day` filter) returns **Sunday 09:00**. Every proxy registration / approval / payment event between Friday 09:00 and Sunday 09:00 is outside the window and never notified. Same on every holiday.
- Cap overflow: `tick.ts:135-138` slices `fresh.slice(0, max)` (batch_max default 200, `domain/settings/keys.ts:455-461`); the leftover is only safe because kinds re-emit "all due occurrences" next day. A window kind's leftover is outside the next window → lost.
- Commit race: event `acted_at` is app time at tx start; a tx that commits after the tick's snapshot but with `acted_at < startedAt` of that tick is never seen (next window starts at that `startedAt`).
- The registry contract already forbids this: `domain/notify/condition-kinds.ts:21` "evaluate는 today까지 기한이 된 발생을 모두 안정된 키로 돌려준다 — 그날 기한만 돌려주면 주말·상한 초과분을 잃는다".
- `findLastTickRun(viewer)` has no `tx` parameter (`notifications.ts:328`) and reads via `db`, not the lock tx.

Remedy (replan 07-10 Task 1 ③ + Task 3 + 07-14 Tasks 1–2): drop the "since = last run" window. Either (a) fixed lookback (e.g. `since = today − 14 days`, constant in the kind) + the event-id dedup key, which is already unique and idempotent; or (b) `since = startedAt of the last run with business_day = true AND evaluation_failed = false AND remaining = 0`, minus an overlap margin (e.g. 10 min). (a) is simpler and fits the existing contract. To stop old events flooding the first run after a rule is switched on, use `max(lookback, rule.updated_at)` (07-07 has `updated_at`). Add integration cases: event on Saturday → notified Monday; event in the cap overflow → notified next business day; event with `acted_at` before the previous tick's `startedAt` but committed after it → notified once.

### [P1] (confidence: 7/10) 07-08-PLAN.md:116 — Narrowing the lockout key schemas makes any stored out-of-range value throw on read, which breaks every login

Plan line (07-08:116):
> 기존 저장값이 새 범위 밖(예: 임계값 2)이면 읽기는 그대로 되고 다음 저장 때만 범위 오류 — 저장값을 고치는 데이터 작업은 하지 않는다(운영 값 보존).

07-08:142: > 두 잠금 키 스키마를 `.min(3).max(10)` · `.min(1).max(60)`으로

Evidence: reads are validated with the schema. `domain/settings/registry.ts:155` `return parseStoredSimpleValue(def, row.value);` → `:161` `if (!def.readInvalidAsDefault || def.default === undefined) return def.schema.parse(raw);`. `AUTH_LOCKOUT_THRESHOLD` / `AUTH_LOCKOUT_WINDOW_MINUTES` (`domain/settings/keys.ts:15-33`) have no `readInvalidAsDefault`, and today they only enforce `.min(1)`, so any stored value 1–2 or ≥11 (threshold), or ≥61 (window), is valid today. `domain/auth/lockout.ts:27-29` `lockoutConfig()` reads both on every login attempt. A ZodError there takes login down. The plan's own statement "읽기는 그대로 된다" is false. Settings import (`settings-export` path) also validates with the schema, so an older export that holds such a value would fail on import.

Remedy: before narrowing, (1) add a unit/integration case "stored 2 / 20 → `lockoutConfig()` still returns a usable value", and (2) choose one approach: set `readInvalidAsDefault: true` on both keys (read falls back to the env default 5/15 and logs `log.error`), or clamp on read. Either way, record the choice in a DECISIONS/AQ line, because it silently changes a security parameter. Also check staging and prod values before merge. Use a read-only query through the normal ops path, never a direct prod DB command. Because the PR changes behaviour that `domain/auth/lockout.ts` relies on, consider adding `/cso` by judgment (CLAUDE.md §4 "인증 … 판단해서 /cso").

---

## P2

### [P2] (confidence: 8/10) 07-10-PLAN.md:160 & 07-14-PLAN.md:191 — "=== today" deadline kinds break the registry contract and lose the alert when a tick fails or overflows

07-10:160: > 그 주 지급 대상 …의 `alertDate === today`인 묶음을 경영관리 받는 사람마다 한 후보로
07-14:191: > `마감일 − days영업일 === today`이면 기안자 후보(entity `expense`, entityId = 지출결의 id, referenceDate = 마감일 — 같은 마감에 한 번)

Evidence: `condition-kinds.ts:21` contract quoted above. Scheduler has `--max-retry-attempts=0` (`deploy.sh:646`), and catch-up is "운영자가 같은 날 수동 실행" only. If the 09:00 tick fails or locks, or the pay-week row is cut by the cap, the EXP-12 alert (success criterion 1) is never sent.
Remedy: emit while `alertDate <= today < cutoffDate` (pay-week-alert) and `cutoff − N ≤ today ≤ cutoff date` (pre-cutoff), with dedup on (pay week / expense, cutoff date). Add an integration case: tick skipped on alertDate → sent the next business day if that day is still before the cutoff.

### [P2] (confidence: 8/10) 07-10-PLAN.md:189 / :197 — The ladder emits every past round at once, and nothing caps the backlog on first deploy or when a rule is switched on

07-10:189: > 첫 기한 월요일 · 오늘 같은 날 → 회차 [1] · +3영업일 → [1,2] · +6영업일 → [1,2,3]
07-10:197: > `ladderRounds(firstDue, today, lookup)` → 회차 배열(3영업일마다, 상한 3)

With "return all due occurrences" plus dedup, an item already 6+ business days overdue on the first 09:00 tick after deploy inserts rounds 1, 2 and 3 for the same person in one tick (plus the team lead on rounds 2 and 3). All existing historical data (paid-no-evidence, project-end-no-expense, approvals) floods at once. 260907 had to add a digest after a 977-row inbox incident (260907-compare.md:87, C21).
Remedy: emit only the **highest due round** per (entity, entityId), so dedup still blocks repeats, and set a backlog floor (first due ≥ deploy or `rule.updated_at` − N days, or a constant go-live date). Add a test: an item 9 business days overdue on its first evaluation produces exactly one row (round 3).

### [P2] (confidence: 8/10) 07-10-PLAN.md:7-26 / :240 — files_modified leaves out the repository read functions every kind needs; layering forces them; the money/approval hook may then demand `/cso`

07-10:240: > 판정 쿼리는 종류 파일이 repository 읽기 함수(viewer = SYSTEM_VIEWER, …)를 부른다
07-10:124: > 게이트 `/review`(코드 — 결재 · 지급은 읽기만이라 돈 · 결재 게이트 해당 없음, RESEARCH N6 노트)

Evidence: eslint boundaries `{ from: "domain", allow: ["domain", "repositories", "lib"] }` (eslint.config, boundaries block), so domain cannot query `db`. No "holders of permission X" query exists (`domain/permissions/*`, `repositories/permissions.ts` only have per-role lookups), and there is no project-end, paid-no-evidence or proxy query for notify. These need new repository functions that are not in files_modified, and the same gap exists in 07-14 (settle/quote/rejected) and 07-22. If any of them lands in `repositories/approvals.ts` (approval-waiting step reads), the hook `.claude/hooks/plant8-skill-gate.sh:315` (`repositories/(corp-cards|approvals|reserve-entries|revenue-entries)\.ts`, `domain/(…|approvals)/`) requires a `/cso` record, which contradicts the stated gate. File overlap detection for parallel lanes also relies on files_modified.
Remedy: name the repository files, for example a new `repositories/notify-sources.ts` holding all kind queries, so no money/approval path is touched and `/review` alone stays correct. Otherwise state `/cso` for 07-10.

### [P2] (confidence: 8/10) 07-10-PLAN.md:199 — The time an approval step opened has no column; the plan does not define how to derive it

07-10:199: > 현재 차수의 열린 단계마다 첫 기한 = 단계 열린 날(KST)에서 N영업일

Evidence: `db/schema/approvals.ts:61-80` `approval_steps` has `actedAt` but no opened/arrived timestamp. Approvers are role + scope (`roleId`, `scopeKind`, `scopeTargetId`), not a user id.
Remedy: specify the derivation: previous non-skipped step's `acted_at`, else route/submission time; self-approved and skipped steps excluded. Specify recipient resolution by reusing the approval-inbox resolver (`approvalInboxItem` projection), batched across all open steps rather than per step (N+1). Add a case for multi-holder steps.

### [P2] (confidence: 8/10) 07-14-PLAN.md:152 — "기존 viewer 로더" does not exist, and the email bundle cannot build a viewer

07-14:152: > `email-phase.ts`는 묶음 받는 사람의 viewer(기존 viewer 로더 — SYSTEM_VIEWER 아님)로 `notificationHref`를 한 번 불러

Evidence: `domain/viewer.ts:11` `export type Viewer = { id: string; roleId: string | null }`. The only builder is the session hook (`domain/auth/hooks.ts:83`). `claimNextEmailBundle` returns `{ recipientId, email, rows: {id, message}[] }` (`repositories/notifications.ts:377-439`) with no `role_id`, `entity` or `entity_id`.
Remedy: extend the claim's user select to `role_id` and the claimed rows to `condition_kind, entity, entity_id`, which are already in the 07-14 files. State that the viewer is `{ id, roleId: users.role_id }` and that archived or role-less users get no links (`can()` returns false for null roleId, `can.ts:24`).

### [P2] (confidence: 8/10) 07-19-PLAN.md:245 — The inbox DTO needs `condition_kind/entity/entity_id`, but `repositories/notifications.ts` is not in 07-19 files

07-19:245: > `domain/notify/inbox.ts`가 행마다 `notificationHref(viewer, rows)`(07-14 — 한 번에 묶음) 결과와 종류 `label`을 싣는다

Evidence: `listInbox` selects only `id, message, createdAt, readAt, emailStatus` (`repositories/notifications.ts:186-193`), and `openInbox` has a raw-SQL `page` CTE with the same columns (`:262`).
Remedy: add `repositories/notifications.ts` to the 07-19 files (Task 3) and update both queries. 07-14 also edits this file in wave 4, which is sequenced, so there is no conflict.

### [P2] (confidence: 7/10) 07-19-PLAN.md:49 / :245 — Kind label and folding assume every notification kind is in `CONDITION_KINDS`; 04.3 certificate event kinds are not

07-19:49: > 같은 날짜 그룹 안 같은 종류 5건 이상은 접힘 줄 `{종류 이름} · N건`

Evidence: immediate-path rows use `conditionKind: "cert_submit_limit"` (`domain/certs/intake.ts:282,300`), `"cert_qr_request"` (`domain/certs/events.ts:504`) and `"cert_qr_created"` (`:783`), none of which are registered. `kindLabel` would be undefined, so the folded row shows a blank name. They also cannot be switched off from the rules screen (D-719 "알림 끄기 = 규칙 켬/끔").
Remedy: add a label map for the non-registry kinds (or a `label` fallback) and a fold test with cert rows. State explicitly in 07-19 that cert event notifications stay outside the rules screen, and note it in D-719 scope.

### [P2] (confidence: 7/10) 07-03-PLAN.md:154 / :147 — The DTO-name extraction rule does not match how `registerDto` is called

07-03:154: > `app` · `domain`의 `registerDto(` 첫 인자 문자열을 모아 대조

Evidence: `registerDto(entry: DtoRegistryEntry)` takes an object (`domain/permissions/dto-registry.ts:20`): `registerDto({ name: "evidenceFile", … })` (`domain/evidence/dto.ts:35`). About half the names are camelCase and do not match type names (`expenseListRow`, `paymentTargetRow`, `approvalView`, …), and one is not `*Dto` (`ProjectListTotals`). `domain/certs/events.ts:233-241` registers in a loop over a tuple array (`registerDto({ name, fields: … })`), so a regex on the call site sees a variable, not a string. There are 83 `export type …Dto` in domain against roughly 74 registrations.
Remedy: compare at **runtime**. In the leak-scan integration test, which already imports every registering module, assert `DTO_REGISTRY.map(e => e.name)` against the regex-collected `*Dto` type names plus an explicit type→registry-name map. Keep the static unit test only for "the module is imported". Otherwise the executor will pad `DTO_COVERAGE_EXEMPT` with the cert DTOs to get green, which the plan's own prohibition (07-03:35) forbids.

### [P2] (confidence: 6/10) 07-03-PLAN.md:30 / 07-25-PLAN.md:37 — The ROADMAP's "Excel export" part of criterion 5 has no automated check

ROADMAP.md:1122: "누수 스캔 생성기가 Phase 3~7의 모든 액션·DTO 타입·**Excel 내보내기 함수**를 덮고"
07-03:30 covers only `registerDto` module loading. 07-25:37 covers "07의 모든 새 액션 · DTO".
Evidence: exports are covered only when they call `registerExport` (`lib/actions/registry.ts:40`, four registrants: `domain/evidence-records/export.ts:47`, `domain/payments/bank-transfer.ts:59`, `domain/action-log/export.ts:129`, `app/(app)/admin/settings/actions.registry.ts:48`). Nothing fails when a new file producer forgets to register; 07-20 adds 거래처 내려받기.
Remedy: add an `export-registry-coverage` unit test. Every module that builds a file (imports `buildTextSheetXlsx` from `lib/xlsx-server.ts` or a CSV builder, or returns file bytes from an action) must contain `registerExport(` and be imported by leak-scan. Alternatively, record in the plan why the four are complete.

### [P2] (confidence: 6/10) 07-08-PLAN.md:172 / :181 — The first nullable simple setting has no defined clear/empty path

07-08:172: > 새 키 `project.cost_rate_pct`: null 허용(기본 null) · 0 · 100 · 12.5 받음
07-08:181: > 기본 null — 원가율 기본 비움 확정 2번

Evidence: no existing key has `default: null` or a nullable schema (grep of `domain/settings/keys.ts`). Repo keys use `z.coerce.number()`, which turns `""` into `0`, so emptying the field would store 0% rather than "unset". `getSettingValue` returns `def.default` only when no row exists (`registry.ts:151-153`).
Remedy: state the schema (`z.preprocess(v => v === "" ? null : v, z.number().min(0).max(100).multipleOf(0.1).nullable())` or similar), how the form clears a stored value (store null, or delete the row), and add a test "save 12.5 → clear → read null". Check that `multipleOf(0.1)` accepts 12.3 under the installed zod version.

### [P2] (confidence: 8/10) 07-22-PLAN.md:178 — The collection due date drops 260907's "pull back to the previous business day" rule

07-22:178: > 발행 줄을 날짜순으로 누적해 입금 합계를 넘는 첫 줄의 `entryDate + dueDays`가 예정일
07-22:100 cites `020_functions.sql:754`.
Evidence (260907): `db/schema/020_functions.sql:754-760` `collect_due_date … previous_business_day(p_base + coalesce(p_term_days, setting_int('payment.collect_term_days')))`, with the comment "기한 그날로 잡고 쉬는 날이면 앞 영업일로 당긴다". The cited line exists, but the plan copies only half the formula.
Remedy: either apply `prevBusinessOnOrBefore` with the holiday lookup, in the same helper family 07-01 uses, or record a decision for calendar days. Add a unit case where the due date falls on a holiday or weekend.

### [P2] (confidence: 6/10) 07-22-PLAN.md:53 / :294 — The collection-overdue alert skips the `revenue.paid_amount` gate the list badge uses

07-22:182: > 목록 DTO에 `collectionOverdue`(정보 항목 `revenue.paid_amount` — 잔액 칸과 같은 항목)
07-22:53: > 받는 사람 담당 PM · 문장 `수금 지연 · {프로젝트} · 예정 MM-DD`
T-07-22-02 (:294) treats "덜 받음" itself as the protected fact.
A PM whose role lacks `revenue.paid_amount` cannot see the badge but would get the same fact by notification, and by email outside the company.
Remedy: in `collection-overdue` evaluate, drop recipients for whom `visible(viewer, "revenue.paid_amount")` is false (batch per role), or record an explicit decision that the alert is allowed. Add an integration case.

### [P2] (confidence: 6/10) 07-10-PLAN.md:158 (tick budget) — 13+ kinds now run inside the 25 s lock transaction with no per-kind budget

Evidence: kinds run inside `withNotifyTickLock` (`tick.ts:97-162`) with `NOTIFY_TX_DEADLINE_MS = 25_000` (`notifications.ts:12`). Kind queries run on the pool (`kind.evaluate({ today })` gets no tx), so `statement_timeout 5s` does not cover them, yet their time counts against the tx deadline. 07-10, 07-14, 07-22 and 07-23 add 14 kinds, including `loadPaySchedules` over all in-review expenses and recipient resolution. Exceeding the deadline rolls back the whole tick, and the scheduler does not retry.
Remedy: add a per-kind elapsed log (`notify.condition_ms`) and one integration timing guard with seeded volume (for example 2,000 expenses), or evaluate kinds **before** opening the lock tx (dedup and insert stay inside). Also state the evaluation cap per kind query, which the registry comment requires (`condition-kinds.ts:21`) and the plans mention only generically.

---

## P3

- [P3] (confidence: 7/10) 07-03-PLAN.md:185: "A가 B 알림 id로 열기(읽음) 시도". `openMyInbox(viewer)` takes no id (`domain/notify/inbox.ts:64-86`; repository filters `recipient_id = ${opts.recipientId}` from `viewer.id`, `notifications.ts:257`). Rewrite the case as "A opens → B's unread rows unchanged; cursor built from B's row returns only A rows".
- [P3] (confidence: 6/10) 07-14-PLAN.md:193: `markStepNotificationsRead(tx, { recipientId, stepIds })` has no `viewer` first parameter. The repository convention is "viewer 필수" (07-01:322 cites "viewer 필수 4계층 관례"). Also, for multi-holder steps, the other holders' `approval-waiting` rows stay unread forever once the step is acted. Decide whether to mark all holders' rows for that step as read.
- [P3] (confidence: 6/10) 07-22-PLAN.md:260: "사건 키 = 프로젝트 id + 예정일 … entity = 프로젝트". The dedup key has no date column, so the entityId must be `{projectId}:{dueDate}`. 07-14's `href.ts` `project` branch must then parse the prefix, as `expense-result` does (07-14:148). State the entityId format explicitly.
- [P3] (confidence: 5/10) 07-19-PLAN.md:245 "DTO spec · `registerDto` 갱신" conflicts with 07-03 AQ-07 (inbox is own-scope, actions not registered). `InboxNotification` is not currently registered and is not named `*Dto`. Pick one approach and note it.
- [P3] (confidence: 5/10) 07-14/07-22 append kinds to `CONDITION_KINDS` "SC-07 표 순서". Waves 3→4→6→7 are serialized (07-23 depends on 07-22), so there is no merge conflict. If the SC-07 order interleaves 07-14 kinds with 07-22/07-23 kinds, though, plain appends will not match it. 07-19 shows registry order. Ask the 07-19 executor to assert the SC-07 order once.
- [P3] (confidence: 5/10) 07-08 changes `domain/settings/keys.ts`, the only 07 plan to do so after 07-01, confirmed from frontmatter: 07-01 is wave 1, 07-08 wave 2, and 07-08 depends on 07-01, so there is no conflict. 07-08 T-07-08-03 transfers the "settings change log" to 07-04, which 07-08 does not depend on. 07-04 is user-merged (D-724, `domain/permissions/`). If 07-08 merges first, the new keys are logged without `detail.changes` until 07-04 lands. Acceptable; add one line to the SUMMARY.
- [P3] (confidence: 5/10) `leak-scan.test.ts` (07-03 → 07-24 → 07-25) and `role-smoke.spec.ts` (07-03 → 07-05 → 07-25) are touched in waves 1, 2, 7 and 8 with depends_on chains (07-05 depends on 07-03; 07-25 depends on all). There is no parallel conflict, but 07-24 (wave 7) also edits `leak-scan.test.ts` while 07-23 runs in the same wave. 07-23 adds registry modules that the 07-03 coverage test will force into `leak-scan.test.ts`, which 07-23 does not list in its files. Add it to 07-23 files, or sequence 07-23 → 07-24.

---

## 1. Architecture

- Data flow: the 09:00 Scheduler POST (`/internal/notify-tick`, OIDC) → `runTick` → per-kind `evaluate` (pool) inside the advisory-lock tx → dedup → insert → email phase after commit. The plans keep this skeleton (good: no immediate path, D-716; dedup unique key reused; `skipped_rule_off` insert-time status keeps the email phase untouched).
- One realistic production failure for each new path:
  - Window kinds (proxy-registered, expense-result): weekend events are lost on Monday. **P1 above.**
  - pay-week-alert: a single failed or locked 09:00 tick loses the EXP-12 alert. P2.
  - First deploy: legacy backlog sends round 1+2+3 nudges together. P2.
  - Approval auto-read (07-14): `FOR UPDATE SKIP LOCKED` chosen correctly, so approve never waits on the email claim. The claim (`notifications.ts:400-420`) holds row locks only during its short tx.
  - href (07-14): the recipient viewer cannot be built from the bundle. P2.
  - Lockout key narrowing (07-08): login outage if a stored value is out of range. **P1.**
  - Collection overdue (07-22): an info-item gate bypass through the alert. P2.
- Security: href is decided per recipient viewer (good, T-07-14-01). Extra-role recipients receive document titles they may not be allowed to see (accepted, T-07-10-02). Note that this also reaches email.

## 2. Code quality: verified interfaces

| Plan assumption | Exists? | Evidence |
|---|---|---|
| `ConditionKind`, `CONDITION_KINDS = []`, `evaluate({today})` | yes | `domain/notify/condition-kinds.ts:13-23` |
| `runTick` per-kind isolation, `oldestFirst`, `batchMax`, `insertNotifications` | yes | `tick.ts:60-142` |
| `findExistingDedupKeys` / `insertNotifications` (ON CONFLICT) | yes | `notifications.ts:50-108` |
| `findLastTickRun` (used for `since`) | yes, but **no tx param, includes non-business-day runs** | `notifications.ts:328-343` |
| `claimNextEmailBundle` 55P03 source | yes: blocking `pg_advisory_xact_lock` + `lock_timeout 5s` | `notifications.ts:382-385`, `:350` |
| `openInbox` read_at = session `now()` | yes (P3 #4 target) | `notifications.ts:254` |
| `createTestConditionKind` | yes | `test/support/notify-tick.ts:34` |
| `evidence.prepaid_due_days` | yes | `domain/settings/keys.ts:1263` |
| proxy registration marker | yes: `corp_card_usages.registered_via = 'proxy'` | `db/schema/corp-card-usages.ts:65` |
| `approveDocument` / `rejectDocument` | yes | `domain/approvals/index.ts:682`, `:780` |
| step "opened at" | **no column** | `db/schema/approvals.ts:61-80` |
| holders-of-permission query (경영관리 = `expenses.payments` write) | **none**; needs new repository function | `domain/permissions/*`, `repositories/permissions.ts` |
| viewer loader by user id | **none** | `domain/viewer.ts:11-14` |
| `registerDto("Name", …)` call shape | **no**: object arg, mixed names, loop | `dto-registry.ts:20`, `certs/events.ts:241` |
| `listAllPaymentTargets` needs a payer viewer | yes: `assertPayer` → SYSTEM_VIEWER must hold `expenses.payments` write (sysadmin seed) | `domain/payments/targets.ts:153-165` |
| `role-menu.test.ts` `ADMIN_MENU_KEYS` = 12 | yes; 07-19 bumps to 13, coordinated with 07-12/07-15 | `test/unit/ui/role-menu.test.ts:134,162` |

## 3. Tests: coverage diagram

```
NOTIFY ENGINE (07-10)
 effectiveRule merge (off/range/null/extraRoles) ........ [★★★ unit rules.test]
 tick reads rules once in lock tx, skips off kinds ....... [★★ integ pay-week-alert/rules-merge]
 pay-week-alert alertDate===today, 경영관리 only .......... [★★★ integ]
   └ tick missed on alertDate / cap overflow ............ [GAP]  → P2
 approval-waiting N / N=0 weekend arrival ................ [★★★ integ kinds-core]
   └ multi-holder step, step-opened derivation ......... [GAP]  → P2
 ladder rounds 3bd, cap 3, holiday shift ................. [★★★ unit ladder]
   └ first evaluation already overdue (rounds 1..3 at once) [GAP] → P2
 extra roles / email off → skipped_rule_off .............. [★★ integ rules-merge]
 proxy-registered via since window ....................... [★ integ "next tick no repeat"]
   └ Saturday event → Monday (non-business run row) .... [GAP CRITICAL] → P1
   └ cap overflow / commit race ......................... [GAP CRITICAL] → P1
 P3 #4 read_at UTC · #5 55P03 · #6 2034 warn ............. [★★ integ]
 tick duration with 13+ kinds under 25s deadline ......... [GAP] → P2

EVENT/OFF KINDS + LINKS (07-14)
 off by default (no row → 0) ............................. [★★★ integ kinds-off]
 expense-result events once, via since ................... [★★ integ]  (inherits P1 gap)
 auto-read in approve tx, SKIP LOCKED, two connections ... [★★★ integ approval-auto-read]
 digest format SC-07 + 열기 ................................ [★★★ unit digest]
 href per viewer, batched ................................ [★★ integ href]
 D-718 no purchase-result kind ........................... [★ integ registry assertion]

RULES SCREEN / INBOX (07-19)
 list/save/version/action log ............................ [★★★ integ rule-admin]
 404 without permission, admin index link ................ [→E2E]
 inbox href + fold ≥5 .................................... [→E2E] [★ integ inbox-links]
   └ cert_* kinds (unregistered) label/fold ............ [GAP] → P2

COLLECTION / DOCS (07-22)
 collectionStatus pure (partial pay, multi issue) ........ [★★★ unit]
   └ due date on holiday/weekend (260907 prev-business) [GAP] → P2
 collection-overdue kind once per (project,due) .......... [★★ integ]
   └ PM without revenue.paid_amount ...................... [GAP] → P2
 documents / invoice file rights ......................... [★★★ integ] [→E2E]

SETTINGS (07-08)
 lockout range accept/reject on write .................... [★★★ unit]
   └ stored out-of-range value on READ (login path) .... [GAP CRITICAL] → P1
 cost_rate nullable clear ................................ [GAP] → P2

AUDIT (07-03 / 07-25)
 role smoke table 5 roles ................................ [→E2E]
 registerDto module imported by leak-scan ................ [★★★ unit]
 *Dto ↔ DTO_REGISTRY ..................................... [★ unit — extraction rule wrong] → P2
 Excel/file export producers registered .................. [GAP] → P2
 inbox own scope ......................................... [★★ integ] (open-by-id case invalid, P3)
 action-log detail lines, sensitive mask ................. [★★★ unit] [→E2E]
```

REGRESSION risks flagged CRITICAL:
- 07-08 lockout schema narrowing on the login read path (P1).
- 07-14 `composeDigest` signature change and new subject (`알림 N건 · MM-DD`). Existing `notify-email.test.ts` expectations change. The plan covers this ("기존 digest · email 시험의 기대 문자열을 새 형식으로"), so it is fine as long as the run includes `test/integration/notify-email.test.ts`. Task 1 verify runs only `expense-result.test.ts`, so **add `notify-email.test.ts` to 07-14 Task 1 verify.**
- 07-14 edits `approveDocument`/`rejectDocument` (approvals tx): covered by `approvals-lifecycle`/`approvals-concurrency` in verify, plus `/cso` and an Opus reviewer. Good.

## 4. Performance

- Tick: all kinds evaluated serially inside one 25 s deadline tx (P2 above). Recipient resolution per open approval step is N+1 unless batched (P2 07-10:199).
- `href.ts` is explicitly batched per branch, and the test asserts "행 50개에 질의 수가 갈래 수 이하". Good.
- `collectionOverdueByProject` makes a single query per page (50). The kind runs over all 진행/정산/완료 projects with no cap. Add `limit` / `oldestFirst` per the registry comment.
- Dedup lookup uses `unnest` arrays, so its cost is independent of candidate count (existing). Fine.

## 5. Failure modes (no test + no handling + silent)

1. **Weekend/holiday event loss in window kinds** (proxy-registered, expense-result 5 branches): silent, no test, no handling. **Critical** (P1).
2. **Stored out-of-range lockout value → ZodError on login**: not silent (500), but no test and no handling. Critical (P1).
3. pay-week-alert lost after one failed 09:00 tick: silent, no test (P2).
4. Cert-kind fold label blank: visible defect, no test (P2).

## 6. 260907 parity (citations verified)

| Plan citation | Exists? | Note |
|---|---|---|
| 07-10:95 `server/src/notices.ts:2890-2935` (목요일 고정) | yes: `주간마감` with the `isodow = 4` history at :2899, function at :2921 | OK. CONTEXT cites :2896-2918, also inside |
| 07-10:95 `db/schema/020_functions.sql:96-130` | yes: `approval_cutoff_at` at :96 | OK |
| 07-14:88 `server/src/payments.ts:938-985` (지급 시 기안자 알림) | yes (:940-945 comment "돈이 나갔다는 것을 올린 사람에게 알린다") | OK |
| 07-14 CMP-C12/C14/C15 (compare.md:78/80/81) | yes; originals `FINISH_REMIND_SQL` :2254, `QUOTE_REMIND_SQL` :2352, `REJECT_REMIND_SQL` :2536, `ORPHAN_RECEIPT_REMIND_SQL` :1747 all exist | OK. 07-10 says "원본 줄 미확인"; now confirmed |
| 07-19 CMP-C3:69 / C17:83 / C21:87 | yes | C21: 260907 needed a digest for the collect-overdue inbox flood (977 rows). 07-19 folding helps the inbox display only; 07-22 still inserts one row per project. Acceptable with folding |
| 07-22 `020_functions.sql:754` | yes, but the formula includes `previous_business_day(...)` (:758-760), which the plan omits | **P2** |
| 07-22 `010_tables.sql:3729-3777` project_documents | yes (:3729 header, :3731 table) | OK |
| 07-08 `050_seed_settings.sql:363-364` lockout 3~10 / 1~60 | yes | Semantics: 260907 `login_lock_minutes` = lock duration. Ours `auth.lockout.window_minutes` = counting window, which in practice also gives the auto-unlock time. Label `잠금 시간` is OK |
| 07-03/07-25 "260907 없음" | correct: no automated leak scan or role smoke in 260907 | — |

Missing parity items in my area:
- 260907 escalation to the team lead used **the project/expense's team** (`QUOTE_REMIND_SQL('v.team_id = $1::bigint …', 2)` notices.ts:2423, `REJECT_REMIND_SQL('coalesce(pj.team_id, e.team_id) = $1 …', 2)` :2634). AQ-04 picks "approval-route team-lead step holder". This is a deliberate difference, but the AQ card should cite these lines so the user's morning answer is informed.
- 260907 had round caps configurable (`회차상한`, notices.ts:532-549, 0 = unlimited). We hard-code 3 (D-708). Fine.
- 260907 KST date-shift bug (notices.ts:226-227 "경과일·독촉 회차 … 하루씩 밀렸다"). Our plans compute in KST through `toKstDate`. Keep a unit case for the 00:00–09:00 KST boundary in `ladder.test.ts`.

## 7. Specific questions from brief

1. Engine on 04.2: extensions are consistent with existing signatures, except `since` (P1), the viewer loader (P2) and the inbox columns (P2). Idempotency: advisory lock + unique key + ON CONFLICT, so a double run or Scheduler retry (retry is 0) is safe. Missed-day catch-up holds only for "all due occurrences" kinds; pay-week-alert and pre-cutoff (P2) and window kinds (P1) break it. Holiday skip: kinds are skipped on non-business days (existing), which is exactly what poisons `since`. Timezone: P3 #4 fix planned; acted_at and startedAt are both naive UTC, so they are comparable. Per-run cap: existing `batch_max` 200 plus `incompleteRecipientIds`.
2. `condition-kinds.ts` edited by 07-10 (w3) → 07-14 (w4) → 07-22 (w6) → 07-23 (w7, depends on 07-22). Serialized, no conflict; order caveat only (P3). 07-14 touches `domain/approvals/index.ts`: `risk: approvals`, Opus executor, `/review` + `/cso` + Opus reviewer all stated (07-14:28-29, :113). Good.
3. Leak scan: auto-load is feasible; the "unmapped DTO = 0" extraction rule is wrong (P2); Excel exports are not covered (P2); test file sequencing is fine, with one caveat that 07-23 is missing `leak-scan.test.ts` (P3). The inbox own-scope test contains an invalid case (P3).
4. 07-08 `keys.ts`: no conflict with 07-01 (sequenced). Lockout read P1. Nullable key P2. The settings change log comes from 07-04 (user merge), so the timing note is P3.
5. 07-22: `risk: money`, Opus, `/cso` stated (07-22:38-39, :136). Good. Hook regex matches `domain/revenue/` and `repositories/revenue-entries.ts`.
6. 07-19: key `admin.notification-rules` from 07-15 (`domain/permissions/menus.ts`, risk path, user merge). AQ-23 404 window acknowledged. D-717 fields match CONTEXT:61 (켬/끔 · N일 · 계급 추가 · 이메일). D-718: no purchase-result kind, asserted in 07-14 Task 3. No per-person off switch (D-719).

---

## Appendix (suppressed, confidence 3–4)

- (4/10) 07-10 `recipients.ts` "경영관리 = `expenses.payments` write holders" includes the sysadmin role (seeded with all menus), so sysadmins get pay-week alerts. Possibly unintended; CONTEXT says "경영관리만".
- (3/10) 07-19 SYSTEM.md / DECISIONS.md edits overlap open PR #256 (it touches the same two files). Wave 6 is far later, so only a normal merge is needed. Note for the 07-19 executor: run `git merge origin/main` first (CLAUDE.md:152).
