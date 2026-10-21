# Phase 07 eng review — reviewer B (money: pay schedule · targets · vendors · budget)

Scope: 07-01 · 07-06 · 07-16 · 07-20 · 07-23 · 07-24. Plan branch HEAD 6951904 (PR #257), base origin/main 9122c31.
Method: plans read in full; every interface the plans call was checked on `origin/main` (`git show origin/main:<path>`); 260907 citations opened.

Counts: **P1 6 · P2 6 · P3 10** (appendix: 3 suppressed).

---

## P1

### P1-1 (confidence: 8/10) 07-06-PLAN.md:142 — the detail DTO's effective date feeds the drafter form. Every draft save then stores the auto date as a "manual" value
> "② **GREEN.** `domain/expenses/index.ts`의 목록 · 상세 조립에서 행 묶음에 `loadPaySchedules`를 **한 번** 돌려(행마다 부르지 않음) DTO의 `scheduledPaymentDate`를 `schedule.payDate`로 채운다. 결재 전(작성 중 · 결재 중) 문서도 같은 값"
> 07-06:105 "기안자 입력 칸 교체(희망 지급일 · 사유)는 폼과 같은 PR이어야 해서 07-16 — 그 사이 기안자가 적은 예정일은 수동 지정으로 취급된다(전환기, 07-16에서 닫힘)."

Evidence (origin/main):
- `app/(app)/expenses/[id]/page.tsx:83` `const expense = await getExpense(...)` → `:277` `scheduledPaymentDate: expense.scheduledPaymentDate ?? null` is passed into `<ExpenseForm data=…>`. `getExpense` returns the detail DTO built in `domain/expenses/index.ts:425 loadExpenseDetails` (`:477 scheduledPaymentDate: row.scheduledPaymentDate`), which 07-06 Task 1 changes to the effective date.
- `expense-form.tsx:152` `useState(data.scheduledPaymentDate ?? "")` → save `:414` `scheduledPaymentDate: date || null` / `:457`. The server accepts it at `domain/expenses/draft-fields.ts:26` and `index.ts:806`.

Effect: from the 07-06 merge (W2) until 07-16 (W5), any draft save, re-save after rejection, or submit writes the computed auto date into `expenses.scheduled_payment_date`. That breaks 07-06's own prohibition "자동 예정일을 DB에 저장하지 않는다". Holiday edits and vendor-term edits stop moving those dates (D-705/D-715), and AQ-12 exempts them from the cutoff gate. Phase 7 is executed and merged by the session unattended, so the window spans several merged waves on staging.

Remedy: move the server-side half of 07-16 Task 3 ② into 07-06. Drop `scheduledPaymentDate` from drafter inputs: `draft-fields.ts:26`, `index.ts:830 lineDraftFieldsSchema`, and `app/(app)/expenses/actions.ts:63`. Keep the client field ignored until 07-16, or give the DTO a separate `effectivePaymentDate` and leave `scheduledPaymentDate` as the stored value until 07-16. Add an integration case: "a draft saved after reading the detail DTO keeps `scheduled_payment_date` NULL".

### P1-2 (confidence: 7/10) 07-01-PLAN.md:42 + AQ-12 (:238) — a drafter-typed date counts as "수동 지정", so the drafter bypasses the D-703 cutoff from wave 1
> "현재 차수 마지막 승인 시각 … 마감 시각 이하면 그 주, 1분이라도 넘기면 다음 지급 가능 금요일로 밀리고"
> AQ-12: "수동 지정 예정일은 마감 판정을 면제한다(수동 = 경영관리 판단 …)"
> gate behavior :368 "manual → allowed"

Evidence: the drafter's date input is live on main (`expense-form.tsx:963` `<Form.Field id="scheduledPaymentDate" label="지급 예정일">`). The server accepts any calendar date, including past dates and weekends (`draft-fields.ts:26`). 07-02 adds no provenance column; 07-02:67 says "기존 `expenses.scheduled_payment_date`는 의미만 「수동 값」으로 바뀌고 칸 · 값은 그대로다". From 07-01's merge, a drafter who types this Friday gets `manual = true`, so `gate(payment.cutoff)` returns allowed and the row lands in this week's group even when it was approved after the cutoff. D-714 says only 경영관리 may set the date.

Remedy, either:
- (a) Land the server-side strip of the drafter date (P1-1) in 07-01, so it ships in W1 with the gate.
- (b) Define "manual" as "last written by `saveScheduledPayDate` / 이번 주로". 07-01/07-06 can derive this from the `payment_schedule_change` log, or a provenance column can be added in 07-02 (risk path, user merge).

State the choice in the plan and add a gate test: "a drafter-saved date before approval → cutoff still applies".

### P1-3 (confidence: 8/10) 07-06-PLAN.md:42 / :185 — the plan misses the third `pickTaxDates` caller (`computeExpenseTax`), so the approved tax snapshot and the payment tax use different base dates
> must_have :42 "세금 기준일 「지급 예정일」 규칙을 쓰는 문서의 세액이 유효 예정일로 셈해진다 — 목록 미리보기 · 지급 처리 · 미리보기가 같은 날짜를 넘긴다(P1)"
> threat :271 "모든 `pickTaxDates` 호출처가 유효 예정일"

Evidence: `git grep "pickTaxDates("` on main finds three callers: `domain/payments/targets.ts:79`, `domain/payments/index.ts:279`, and **`domain/expenses/tax.ts:147`** (inside `computeExpenseTax`; `:51` `const scheduled = doc.scheduledPaymentDate ?? opts.todayKst`). `computeExpenseTax` is called at:
- the **submit snapshot**: `domain/expenses/index.ts:1094` (`submitExpense`)
- the draft preview: `:1568`
- the detail drift check: `:1694`
- the list drift check: `:439`

07-06 changes only the first two callers. Across a rate-change boundary (withholding/VAT history rows; the 06.5 기타소득 per-recipient withholding uses the same chain), the approved snapshot is computed on "today" and the payment on the effective date. The pay amount then differs from the approved amount, and every such document shows `세율 바뀜` drift.

Remedy: in 07-06 Task 2, pass the effective date into `computeExpenseTax`'s `ExpenseTaxSource` from the same loader at all four call sites. Add a submit-snapshot case to `effective-date.test.ts` that asserts snapshot = pay-time amount across a rate boundary.

### P1-4 (confidence: 7/10) 07-01-PLAN.md:322 — the holiday loader year range `[최소-1, 최대+2]` hits `LunarTableRangeError` outside 2025–2035, which crashes the payment list and the whole expense list
> "공휴일은 기준일 해들과 오늘 해의 `[최소-1, 최대+2]`를 `loadHolidayLookup` 한 번으로(AQ-08)"

Evidence:
- `domain/holidays/lunar-table.ts:5-6`: `LUNAR_TABLE_FIRST_YEAR = 2025` · `LUNAR_TABLE_LAST_YEAR = 2035`.
- `loadHolidayLookup` (`calendar.ts:21`) calls `ensureHolidayCandidates` → `generateHolidayRules` → `rules.ts:110` `if (!lunar) throw new LunarTableRangeError(year)`. `candidates.ts:77` notes "범위 밖 해는 LunarTableRangeError가 그대로 전파된다".

Any evidence `issued_on` in 2025 or earlier (min-1 ≤ 2024) or 2034 or later throws. That covers old receipts, typos in a user-entered date, and the Phase 8 conversion of 260907 history. After 07-06 the expense list pre-sort loads every approved document (see P2-1), so one such row breaks `/expenses` for everyone. Precedent on main: `domain/leave/guard.ts:28-31` returns `NO_HOLIDAYS` (weekends only) outside the table (D-6306).

Remedy: clamp the loader years to the table range and use a weekends-only lookup outside it, following the guard.ts pattern. Add unit cases for base 2024-12-30 and limit 2036.

### P1-5 (confidence: 7/10) 07-24-PLAN.md:40 + AQ-37 (:131) — the budget delta formula re-bases the whole budget at the current rate, which contradicts the user decision "늘어난 금액 × 원가율" and "예산은 한 번 잡으면 고정"
> "기준 금액(PO 금액, 없으면 승인 견적 합계, 둘 다 없으면 0) × 그때 원가율이 지금 예산과 다르면 그 차이 한 줄"
> AQ-37: "예산 줄은 사건 때 「목표(기준 × 그때 원가율) − 지금 예산」을 쓴다 — 차이가 음수 … 여도 줄을 남긴다"

Decision file `/mnt/project-files/notes/fund-forecast/design.md`:
- :5 "예산은 한 번 잡으면 고정"
- :9 "PO 금액이 바뀌거나(추가 PO), PO 없이 새 승인 차수로 금액이 늘면: 늘어난 금액 × 원가율만큼 자동 더함, 이력"
- :13 "원가율: … 예산 잡을 때의 값을 같이 저장"
- §9.2 same as :9

Counter-example: PO ₩10,000 at a 70% rate gives a budget of 7,000. The rate then changes to 60% and an additional PO raises the total to 11,000.
- Plan: 11,000 × 0.6 − 7,000 = **−400** (the budget drops when the PO grows).
- Decision: +1,000 × 0.6 = **+600**.

Base/usage definitions match the decision: basis = PO ?? approved quote total ?? 0, and usage = sum of 실행가. The plan does not define the budget as the sum of 실행가.

Remedy: `delta = (newBasis − prevBasis) × currentRate`, where `prevBasis` = the last entry's `base_amount_krw` (07-11 already stores it). The switch from quote basis to PO basis uses the same rule. Whether to record decreases is not covered by the decision (it says "늘면"), so put it on the morning card with "increase only" as the default. Unit cases: rate change between events, and PO decrease.

### P1-6 (confidence: 7/10) 07-16-PLAN.md:57 / :198 / :256 — the plan forbids `page.tsx`, but the new values can only reach the form and the payment section through `page.tsx` / `expense-document.tsx` / `payment-action-row.tsx`
> prohibition :57 "`evidence-table.tsx` · `app/(app)/expenses/[id]/page.tsx`를 고치지 않는다(D-725 — 상세 읽기 줄은 `payment-section.tsx` 안에서)"
> Task 2 ④ :198 "`payment-section.tsx` 안에서만(page.tsx 수정 없음 — D-725)"
> acceptance :256 "`git diff --name-only origin/main...HEAD -- 'app/(app)/expenses/[id]/page.tsx' …`가 빈 출력"

Evidence:
- `PaymentFields` (`payment-section.tsx:302`) gets `scheduledPaymentDate` only as a prop, through `expense-document.tsx:244` `<PaymentSection … scheduledPaymentDate={expense.scheduledPaymentDate ?? null} />` → `payment-action-row.tsx:51-54`.
- `ExpenseForm` data is assembled only in `page.tsx:262-285` and `expenses/new/page.tsx:54`.

So 희망 지급일/사유, cutoff, manual, pushReason and the auto date cannot reach these components without editing files that are not in `files_modified` (expense-document.tsx, payment-action-row.tsx, new/page.tsx), plus page.tsx, which the plan forbids. D-725 only holds `page.tsx` back until E1 is merged, and 07-16 already requires E1.

Remedy: drop the page.tsx prohibition and its acceptance grep, and add `expense-document.tsx`, `payment-action-row.tsx` and `new/page.tsx` to `files_modified` and Task 2/3 `<files>`.

---

## P2

### P2-1 (confidence: 8/10) 07-06-PLAN.md:91 / :181 — the approved-group pre-sort is unbounded, because rank 4 includes every paid document ever
> AQ-01: "보이는 승인 건의 최소 칸 … 을 읽어 유효 예정일로 순서를 셈하고, SQL에는 그 id 순서 배열을 정렬 키로 넘긴다(`array_position` 꼴)"

Evidence: `repositories/expenses.ts:561` `… when ${approvalInstances.status} = 'approved' then 4 …`. A payment does not change the approval status, so group 4 holds all approved documents, paid ones included. That is thousands per year at 30 users, plus 260907 history after Phase 8.

Each list request would then run:
- a full scan,
- an evidence `min(issued_on)` over every approved document,
- holiday years spanning all of history (see P1-4),
- an `array_position` over thousands of ids as a bound parameter.

RESEARCH A5 assumes approval counts stay small; that does not hold here.

Remedy: pre-sort only unpaid approved documents (`not exists live payment`). Paid documents keep an SQL key (pay date). Alternatively, use the D-715 fallback: an SQL fragment plus an equivalence test.

### P2-2 (confidence: 7/10) 07-01-PLAN.md:324 — `compareTargetKey` («다음 확인 전» navigation) still sorts by the stored date while the list sorts by the effective date
> "정렬은 도메인에서 유효 예정일 오름차순 → `number` → `id`"

Evidence: `domain/payments/targets.ts:600-609` `compareTargetKey` documents itself as "정렬 키 = 지급 대상 원천의 정렬(지급 예정일 오름 …, repositories/payment-targets.ts selectRows)" and compares `a.scheduledPaymentDate` (raw). `repositories/payment-targets.ts:57` orders by the stored date.

Neither 07-01 nor 07-06 mentions either function. After 07-01, "next unconfirmed" jumps out of list order.

Remedy: add both functions to 07-01 Task 1 ⑤ (or 07-06 Task 2) with a test.

### P2-3 (confidence: 6/10) 07-06-PLAN.md:213 / 07-16:36 — 「이번 주로」 on a weekend or after this week's payday always fails; 260907 rolls over to the next payday
> "이번 주 지급일이 오늘보다 앞이면 `이번 주로 실패 · 영업일이 아닌 날 · 다시 시도`"

Evidence: 260907 `server/src/payments.ts:150-157` (WEEK_SQL comment): "그 주의 실제 지급일이 이미 지났으면 한 주 뒤를 기본으로 잡는다. 지급일 당일은 그대로 그 주다". 07-01 `payWeekGroupLabel` also uses a Mon–Sun week (:377). From Saturday onward, every 「마감 지나 밀림」 row shows an action that cannot succeed, and the error text ("영업일이 아닌 날") is wrong.

Remedy: define the "이번 주 지급일" as the first pay date ≥ today (the 260907 rule) in `pay-schedule.ts`, use it in both the group label and `moveToThisWeek`, and add unit cases for Saturday and post-payday Friday.

### P2-4 (confidence: 7/10) 07-20-PLAN.md:207-208 — for viewers without `vendors.account`, read-only account rows will wipe bank/holder or trip Forbidden
> "`updateVendor`에서 계좌 은행 · 예금주 · 계좌번호가 바뀌면(`planAccountNumberUpdate` 결과로 판정) `can(viewer, "vendors.account", "write")` … 패널은 서버가 준 `canEditAccount` 표지로 계좌 칸을 입력 또는 읽기 줄(마스킹)로."

Evidence: `domain/vendors/index.ts:490-491` `accountBank: present(input.accountBank), accountHolder: present(input.accountHolder)`. `present(undefined)` → null (`account-fields.ts:27`), so a form that no longer submits read-only bank/holder writes null. `planAccountNumberUpdate` (`:353`) sees only the number (keep/clear/set) and cannot detect bank or holder changes.

Remedy:
- Compute "account changed" by comparing bank, holder and number against `existing`.
- For viewers without `vendors.account`, treat omitted account fields as keep.
- Add an integration case: "a non-account viewer saving only the name keeps bank/holder". 07-23's `bankChanged` (AQ-35) needs the same comparison; 260907 `server/src/vendors.ts:1118-1121` compares all three.

### P2-5 (confidence: 7/10) 07-23-PLAN.md:284 (T-07-23-01) — vendors registered from the workplace are not flagged where money leaves (the payment list)
> "`확인 전` 표시(목록 · 패널 · 지급처 칸) · 경영관리 확인 표시 · 계좌 변경 기록 · `/cso` — 지급 막기는 하지 않는다"
> AQ-36 :146 "처음 계좌를 넣은 것(전 값 없음)은 변경이 아니다"

Any expense writer can create a vendor with an account (`registerVendorFromWork`, permission `expenses` write). The first account entry is not a "change", so `계좌 바뀜` never fires for it. The payment targets table (which 07-23 already edits) shows no `확인 전`. The fraud path (an employee registers a vendor with their own account, then files an expense) therefore has no signal on the screen where 경영관리 pays.

Remedy: add `vendorUnconfirmed` to the payment target DTO and a `확인 전` tag in the payment-targets-table cell next to `계좌 바뀜`, plus an integration and E2E case.

### P2-6 (confidence: 6/10) 07-20-PLAN.md:178 — the repository `updateVendor` signature change misses its other caller (06.1 vendor autocreate)
> "저장소 갱신을 `WHERE id = … AND version = expected`로 · `version = version + 1`"

Evidence: `domain/evidence-import/vendor-autocreate.ts:66` `await updateVendor(viewer, target.id, { kind: "both" }, tx)` (repository function, no version). Also `updateVendorAccountNumber` (`repositories/vendors.ts:199`) is a separate UPDATE.

Remedy: every write path bumps `version` (kind add, account number, autocreate). The expected-version check stays optional for system paths. Test: an open panel conflicts after autocreate changes the kind.

---

## P3

- **P3-1** (9/10) 07-01:288 — line citations have drifted. On main, `isBusinessDay` is at `business-day.ts:55` (not :30) and `addBusinessDays` at `:59` (not :55-59); `:30` is `toKstDate`. Harmless; fix the read_first.
- **P3-2** (8/10) 07-01:107 — the cite `server/src/notices.ts:2890-2935` "isodow = 4 고정" points at the 2026-09-02 **fix comment** that describes the old bug ("앞서는 `isodow = 4` 를 박아 두어 …"), not the bug code. Reword it as "옛 버그 설명(수리 주석)".
- **P3-3** (7/10) 07-01:414 — the no-fixed-weekday regex (`getDay() ===`, `getUTCDay() ===`, `isodow`) misses `!==`, `getUTCDay() + 6` (`targets.ts:481`), and `% 7` arithmetic. Broaden it to any `getU?T?C?Day\(` and allowlist the current `targets.ts:481` explicitly.
- **P3-4** (7/10) The term ranges differ: the company default is 1~365 (07-01:320) while the vendor term is 1~180 (07-02:32, 07-20). In 260907 both are 1~180 (`050_seed_settings.sql:220` max 180; `010_tables.sql:5449`). Pick one.
- **P3-5** (8/10) 07-20:121 parity cite — the 260907 column is `payment_due_days` (`010_tables.sql:5428`, CHECK `:5448-5449`), not `payment_term_days`.
- **P3-6** (7/10) 07-23 parity — 260907 `vendor_documents.kind` includes `id_card` (`010_tables.sql:5342`, used for individual payees and 기타소득). 07-11/07-23 cover only `registration|bankbook`. Record the omission in the Source Audit or add it.
- **P3-7** (6/10) 07-24:229 — the hook `seedInitialBudgets` called from `domain/settings/registry.ts` creates a settings→projects dependency. `domain/quotes/lines.ts` already imports settings, so this risks a cycle and a layering inversion. Prefer calling it from the settings save action/use-case layer, or an injected hook.
- **P3-8** (8/10) Gate enforcement: all six plans state `/cso`, which is correct. But `.claude/hooks/plant8-skill-gate.sh:315` money regex covers only `domain/(money|corp-cards|reserves|revenue|approvals)`, not `domain/payments`, `domain/vendors` or `domain/projects`. `/cso` is voluntary for every plan here, so make sure each SUMMARY records the gate run.
- **P3-9** (6/10) 07-16:192 — the E2E "설정 요일을 목요일로 바꾸면" mutates a global setting in the shared test DB, which risks flakes in parallel specs. Use a dedicated serial project or set the setting in a beforeAll/afterAll inside one `test.describe.serial`.
- **P3-10** (5/10) 07-01:322 / AQ-08 — `loadHolidayLookup` on GET renders runs `ensureHolidayCandidates` (a lock + insert tx) for up to max+2 years. It is idempotent, but it is a write on a read path that runs while 이번 주로 holds expense row locks (07-06 Task 3). It is acceptable; note it in the threat model.

---

## 1. Architecture
- D-715 (one pure function) is well formed: `resolvePaySchedule` is pure and the loader is separate. The cutoff formula matches 260907 `020_functions.sql:96-130` exactly: `prevBusiness(pay−1)` + cutoff_time, written as a `+09:00` ISO literal with no DST. The pay date matches `:3415-3462` (limit = base + term → walk back to the pay weekday → `previous_business_day`).
- Edge semantics checked against the plan:
  - Exact-Friday limit → that Friday. ✓
  - Friday holiday → Thursday. ✓
  - Chuseok week → earlier business day. ✓
  - Cutoff-day holiday → earlier business day. ✓
  - Approval exactly at the cutoff → included (≤). ✓
  - No pay weekday within the term → `no-slot` push. ✓
  - The 60-week guard is fine.
- Not covered: there is no rule for when a full Mon–Fri week is holidays (pay falls back into the previous week and repeats the same date). The ≤ comparison handles it, but add a unit case.
- D-701 alert date = `prevBusiness(cutoffDate−1)`, which is 2 business days before pay. ✓
- Holiday re-derive: values are not stored, so the J4 test is the right contract. P1-1 and P1-2 are the ways auto values could get stored after all.
- Production failure per new path:
  - Loader: P1-4 (year range).
  - Expense list pre-sort: P2-1 (unbounded).
  - moveToThisWeek: P2-3 (weekend).
  - Vendor save: P2-4 (null wipe).
  - Budget event: P1-5 (negative line on rate change).
  - Vendor export: a count/rows TOCTOU at the 5,000 cap (benign).

## 2. Code quality (interfaces verified on main)
- Exists as the plans assume: `isBusinessDay(date, lookup)`, `addBusinessDays(date, n, lookup)` (n=0 rolls forward; the plan correctly avoids it), `toKstDate`, `HolidayLookup`, `loadHolidayLookup(years)`, `HolidayYearNotLoadedError`, `statusChangedAtExpr` (`repositories/expenses.ts:625`), the `payment.*` gate rules (`register.ts:353-365`), `EVIDENCE_PREPAID_DUE_DAYS` and namespace `지급` (`keys.ts:1262/1290`), `payableOf` / `listAllPaymentTargets` / `toDto` / `listPaymentTargets` / `payWeekLabel` (`targets.ts:74/160/199/235/477`), `businessNoProblem` / `assertBusinessNoFree` / `planAccountNumberUpdate` / `listVendors` / `searchVendors` / `addVendorKind` (`domain/vendors/index.ts`), `csvEscape` (`lib/csv.ts:15`), `domain/evidence-records/export.ts`, `setCustomerApproval` (`domain/quotes/revisions.ts:163`; it locks the project row, so 07-24's assumption holds).
- `isWeekday` in business-day.ts is private, so pay-schedule.ts will compute the weekday itself. That is fine, and it is the single allowed spot.
- Existing helpers re-implemented: the week-start computation in `payWeekGroupLabel` duplicates `targets.ts:481` and `domain/expenses/list.ts` week bands. That is low value (P3-level, folded into P3-3).
- Consumer coverage for `scheduledPaymentDate` readers. Full list from `git grep` on main:

| Reader | Covered by |
|---|---|
| `domain/payments/targets.ts:80,208,250` | 07-01 / 07-06 |
| `targets.ts:602` `compareTargetKey` | **GAP (P2-2)** |
| `domain/payments/index.ts:273-308,352,661` | 07-06 |
| `domain/expenses/index.ts:343,477` | 07-06 |
| `index.ts:806` (draft write) | 07-16 only (**P1-1**) |
| `domain/expenses/list.ts:78-86,163,197` | 07-06 |
| `domain/expenses/detail.ts:72` | 07-06 |
| `domain/next-turn/phase6-items.ts:20-91` | 07-06 |
| `domain/expenses/tax.ts:51` via `computeExpenseTax` | **GAP (P1-3)** |
| `repositories/expenses.ts:642` | 07-06 |
| `repositories/payment-targets.ts:57` | **GAP (P2-2)**; harmless if domain re-sorts |
| `repositories/expense-payments.ts:58` | 07-06 |
| `scripts/demo-data.ts:213-220` | 07-06 |
| UI: `expenses-table.tsx:82-88`, `payment-targets-table.tsx:832`, `expense-document.tsx:173,244`, `payment-section.tsx:305-328`, `expense-form.tsx` | 07-16 (P1-6 for the wiring) |
| `admin/code-tables/evidence-type-fields.tsx:38`, `domain/code-tables/tax-rule.ts:20` | label only; meaning becomes "유효 예정일" — fine |

## 3. Tests — coverage diagram

```
07-01 pay schedule
 resolvePaySchedule: auto/exact-Fri/Fri-holiday/Chuseok/year-edge/manual ... [★★★ unit planned]
 cutoff ≤ / +1min / approving / no-slot / manual / alertDate .............. [★★★ unit planned]
 full Mon–Fri holiday week (pay jumps back a week) ........................ [GAP]
 base year <2025 or limit >2035 (LunarTableRangeError) .................... [GAP — CRITICAL, P1-4]
 gate payment.cutoff 3 branches ........................................... [★★★ unit]
 drafter-entered date treated as manual → cutoff bypass ................... [GAP — CRITICAL, P1-2]
 approvedAt = current-round max(acted_at) ................................. [★★★ integ approved-at]
 list groups / approvingByWeek / pushReason DTO ........................... [★★ integ + →E2E]
 holiday add/remove re-derive (auto moves, manual stays) .................. [★★★ integ]
 compareTargetKey "next unconfirmed" order ................................ [GAP, P2-2]
 weekday-constant guard ................................................... [★ file scan (narrow, P3-3)]
07-06 consumers
 list/detail effective date ............................................... [★★ →E2E expense-auto-date]
 draft save after detail read keeps column NULL ........................... [GAP — CRITICAL REGRESSION, P1-1]
 approved sort / page split / holiday reorder ............................. [★★★ integ]
 approved group volume (paid history) ..................................... [GAP perf, P2-1]
 tax: targets list + payment use effective date ........................... [★★★ integ effective-date]
 tax: submit snapshot / preview / drift (computeExpenseTax) ............... [GAP — CRITICAL REGRESSION, P1-3]
 manual set: perms / non-business / offWeekday / null→auto / log type ..... [★★★ integ]
 moveToThisWeek / revert / version conflict / mixed rejects ............... [★★★ integ]
 moveToThisWeek on Sat/Sun/after payday ................................... [GAP, P2-3]
 vendor term days → auto date ............................................. [★★ integ]
07-16 screens ............................................................. [★★ →E2E ×3 + DOM audit]
 data wiring through page.tsx / expense-document.tsx ...................... [blocked by prohibition, P1-6]
07-20 vendors
 term range / client clears / version conflict ............................ [★★★ integ]
 account perm: number change denied ....................................... [★★★ integ]
 account perm: non-account viewer name-only save keeps bank/holder ........ [GAP — CRITICAL, P2-4]
 autocreate kind change bumps version ..................................... [GAP, P2-6]
 CSV: mask / formula / 5,000 / log / perm ................................. [★★★ integ]
07-23 vendors 2
 change record same-tx / last4 only / first entry not change .............. [★★★ integ]
 badge clears on payment / re-appears on cancel ........................... [★★★ integ]
 unconfirmed vendor visible in payment list ............................... [GAP, P2-5]
 contacts ≤5 / docs replace / AQ-34 rights / confirm toggle ............... [★★★ integ]
 workplace register + N14 kind (off, once/day) ............................ [★★ integ + →E2E]
07-24 budget
 budgetDelta same-rate increase/decrease .................................. [★★★ unit]
 rate changed between events .............................................. [GAP — wrong formula, P1-5]
 PO save / approval hooks same tx / initial seed .......................... [★★★ integ]
 project DTO has no budget fields (leak scan) ............................. [★★★ integ]
 /projects/budget 404 for others .......................................... [★★ →E2E]
```

## 4. Performance
- **P2-1**: the 07-06 approved-group pre-sort is unbounded (all approved incl. paid). This is the main risk.
- 07-01 targets list: one loader per list, reading evidence `min()` grouped by ids. OK (unpaid approved + approving only). The `approvingByWeek` sibling query has the same scope. OK.
- 07-06 detail: one loader per document. OK. The home bundle (`phase6-items`) loads again on top of `listAllPaymentTargets`. Reuse the schedules already computed by 07-01 rather than calling the loader a second time.
- 07-20 export: a count plus a 5,000-row cap. OK. Search uses ILIKE; at 278 vendors, fine.
- 07-23 `accountChangedSinceLastPayment`: one query per list. OK.
- 07-24 `seedInitialBudgets`: one tx, locking projects in id order. OK at the expected scale.
- Tick cost: N5 and N14 belong to 07-10/07-23. N14 queries per-day keys. OK.

## 260907 parity
Citations opened, all valid:
- `020_functions.sql:3415-3462` (payment_due_date) ✓
- `:96-130` (approval_cutoff_at) ✓
- `:3968-4033` (refresh_expense_from_receipts: base = min receipt issue_date → submitted KST → today; "moved" freeze) ✓
- `050_seed_settings.sql:218-221` (cutoff_time 14:00 / date_rule / term_days 1-180 / weekday fri) ✓
- `server/src/payments.ts:150-165` (WEEK_SQL) ✓
- `080_triggers.sql:406` (holidays_reschedule) ✓
- `010_tables.sql:5259` (vendor_contacts) ✓
- `:5314` (vendor_documents) ✓
- `:2673` (po_number) ✓
- `notices.ts:2890+` — cites the fix comment; see P3-2.

Gaps and divergences:
- 260907 "이번 주" rolls to the next payday once this week's payday has passed (P2-3).
- `vendor_documents.id_card` is omitted (P3-6).
- Range 1~180 vs 365 (P3-4).
- 260907 `urgency_code='urgent'` nulled the scheduled date (`020_functions.sql:3990`). 07 replaces this with 희망 지급일 (07-16 cites `151_early_pay_request`). OK.
- 260907 sent the account-change notice to holders of the payment-date permission and excluded retirees (`server/src/vendors.ts:1131-1170`). 07-23 says "지급 예정일 임박 종류와 같은 경영관리 해석 함수". Confirm that function resolves by permission (not role name) and excludes resigned and archived users.
- 260907 had no budget concept, so no parity is needed for 07-24.

## Failure modes (no test + no error handling + silent = critical)
1. **P1-1**: auto dates silently persisted by draft saves. No test, no guard, invisible: the screen shows the same date either way. **CRITICAL.**
2. **P1-3**: the approved tax snapshot and the pay-time tax diverge across rate dates. No test, and only a drift label shows it. **CRITICAL.**
3. **P1-2**: drafter date exempt from the cutoff. No test, and silent (the row just sits in this week's group). **CRITICAL.**
4. **P1-5**: a negative budget line on a rate change is "valid" per the plan's own unit test, and nothing stops it. **CRITICAL** (wrong money record).
5. P1-4 is loud (500), not silent, but blocks the payment list for everyone.

## Gates (Q5)
Every plan names its gate set:
- 07-01: `/review` + `/cso` + Opus independent review; no screen gates. Correct, since there are no `.tsx` changes.
- 07-06: `/review` + `/cso` + Opus.
- 07-16, 07-20, 07-23, 07-24: `/review` + `/design-review` (Codex) → `/qa` + `/cso` + Opus.

None of the six touches a risk path, so session merge is valid. The hook does not enforce `/cso` for these paths (P3-8). 07-24 touches `domain/settings/registry.ts` and `domain/quotes/revisions.ts`; neither is a risk path.

## Sequencing (Q3)
- **07-16 (W5) and 07-23 (W7)** both edit `payment-targets-table.tsx`, `expense-form.tsx` and `expenses/actions.ts` / `actions.registry.ts`. 07-23 `depends_on` 07-16, and both require E1 (PR #256: `expense-form.tsx`, `page.tsx`). That is fine.
- **07-20 (W6) → 07-23 (W7)** on vendor files: `depends_on` is set, so this is fine. 07-23 and 07-24 run together in W7 with no file overlap (verified from `files_modified`).
- **07-06 (W2)** and 07-20 both touch `repositories/vendors.ts`. This is sequential, so fine.
- **Risk:** P1-1 and P1-2 come from the W2→W5 gap between the domain change (07-01/07-06) and the form change (07-16). The fix is to move the server-side half earlier, not to resequence.

## Appendix (suppressed, confidence 3-4)
- (4/10) 07-24 "사용액 = 지금 차수 견적 줄 실행가 합": if "지금 차수" is an unapproved draft revision, usage can swing while PMs edit. The decision text says "등록된 실행가 합" without naming a revision.
- (4/10) 07-23: personal-payee (user) account changes (`domain/people/account.ts:121-138`) get no `계좌 바뀜`. 260907 was vendor-only too.
- (3/10) 07-06 moveToThisWeek runs the loader, which may open its own holiday-lock tx, while holding expense row locks in another tx. There is a pool-pressure risk only.
