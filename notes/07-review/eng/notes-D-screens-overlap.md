# 07 plan eng review — Reviewer D (screens · file overlap · sequencing)

Scope: 07-12 · 07-17 · 07-18 · 07-21 + phase-wide overlap matrix (25 plans) + PR #256 overlap + screen gates + wave structure.
Repo HEAD 6951904 (PR #257). READ-ONLY. Method: frontmatter parsed by script (files_modified / depends_on / wave / merge_owner); every `<files>` block cross-checked against frontmatter (0 mismatches); #256 file list taken from `git diff origin/main...origin/claude/project-thread-lqo39w`.

Counts: P1 1 · P2 9 · P3 11 (+ appendix 2)

---

## 0. Phase-wide file-overlap matrix (files touched by ≥2 plans)

Same-wave parallel conflicts: **0**. Overlapping pairs with no dependency path (hidden ordering): **0** — every overlapping pair below is ordered by a depends_on chain (direct or transitive). Computed wave = declared wave for all 25 plans.

| File | Plans (wave) |
|---|---|
| app/(app)/admin/people/page.tsx · people.module.css | 07-17(w5) → 07-21(w6) |
| app/(app)/admin/vendors/{actions.registry.ts, actions.ts, page.tsx, vendor-form.tsx, vendors.module.css} | 07-20(w6) → 07-23(w7) |
| app/(app)/expenses/[id]/expense-form.tsx (**#256**) | 07-16(w5) → 07-23(w7) — both E1-gated |
| app/(app)/expenses/{actions.registry.ts, actions.ts, payment-targets-table.tsx} | 07-16(w5) → 07-23(w7) |
| app/(app)/projects/[id]/page.tsx · project-detail.module.css · projects/actions.ts | 07-18(w5) → 07-22(w6) |
| db/migrations/meta/_journal.json | 07-02(w1) → 07-07(w2) → 07-11(w3) → 07-13(w4) (linear chain; all user-merged) |
| db/schema/vendors.ts | 07-02(w1) → 07-11(w3) |
| docs/design/DECISIONS.md · SYSTEM.md (**#256**) | 07-12(w4) → 07-19(w6) → 07-23(w7) |
| domain/archive/index.ts | 07-15(w5) → 07-21(w6) |
| domain/evidence/index.ts | 07-11(w3) → 07-22(w6) → 07-23(w7) |
| domain/expenses/dto.ts | 07-01(w1) → 07-06(w2) |
| domain/expenses/index.ts | 07-06(w2) → 07-16(w5) |
| domain/notify/condition-kinds.ts | 07-10(w3) → 07-14(w4) → 07-22(w6) → 07-23(w7) |
| domain/payments/pay-schedule-load.ts | 07-01 → 07-06 |
| domain/payments/targets.ts | 07-01(w1) → 07-06(w2) → 07-23(w7) |
| domain/people/index.ts | 07-04(w1) → 07-17(w5) → 07-21(w6) |
| domain/permissions/matrix.ts · roles.ts | 07-04(w1) → 07-15(w5) |
| domain/projects/ledger.ts · domain/quotes/revisions.ts | 07-18(w5) → 07-24(w7) |
| domain/seed/role-defaults.ts | 07-05(w2) → 07-15(w5) |
| domain/settings/keys.ts | 07-01(w1) → 07-08(w2) |
| domain/settings/registry.ts | 07-04(w1) → 07-24(w7) |
| domain/vendors/index.ts | 07-20 → 07-23 |
| repositories/expenses.ts | 07-01 → 07-06 |
| repositories/login-attempts.ts | 07-09(w2) → 07-17(w5) |
| repositories/notification-rules.ts | 07-10(w3) → 07-19(w6) |
| repositories/notifications.ts | 07-10 → 07-14 |
| repositories/project-documents.ts | 07-18(w5, creates) → 07-22(w6) |
| repositories/roles.ts | 07-15(w5) → 07-21(w6) |
| repositories/users.ts | 07-17(w5) → 07-21(w6) |
| repositories/vendors.ts | 07-06(w2) → 07-20(w6) → 07-23(w7) |
| test/e2e/payment-schedule.spec.ts | 07-01 → 07-16 → 07-23 |
| test/e2e/role-smoke.spec.ts | 07-03 → 07-05 → 07-25 |
| test/e2e/vendors.spec.ts | 07-20 → 07-23 |
| test/integration/leak-scan.test.ts | 07-03 → 07-24 → 07-25 |
| test/integration/seed-permissions.test.ts | 07-05 → 07-15 |
| test/unit/dto-registry-coverage.test.ts · leak-scan-coverage.test.ts | 07-03 → 07-25 |

Undeclared overlaps the matrix cannot see (files a plan will have to edit but does not list) — see 07-18 P1 (5 E2E specs) and 07-17 P2 (`test/unit/ui/confirm-dialog.test.ts`).

## 0b. PR #256 overlap (06.1-15/16)

#256 actual diff (40 files) app/code part: expense-form.tsx, expenses/[id]/page.tsx, evidence-table.tsx, evidence/page.tsx, cards/page.tsx, lib/evidence-return.ts, SYSTEM.md, DECISIONS.md, ROADMAP.md, test/e2e/evidence-*.spec.ts, test/unit/app/cards-page.test.ts, test/unit/lib/evidence-return.test.ts.

| Plan | #256 file touched | Gate | Machine-checkable? |
|---|---|---|---|
| 07-12 | SYSTEM.md, DECISIONS.md | `external_depends_on: E1` (07-12:20) + `git cat-file -e origin/main:…/06.1-15-SUMMARY.md` & `…16-SUMMARY.md` (07-12:95) | Yes (verified: today exits 128 — #256 not merged) |
| 07-16 | expense-form.tsx | E1 (07-16:29, :116) + prohibition/acceptance `git diff … 'expenses/[id]/page.tsx' 'evidence-table.tsx'` empty (07-16:54, :214) | Yes |
| 07-23 | expense-form.tsx, SYSTEM.md, DECISIONS.md | E1 (07-23:50, :145) | Yes |
| 07-19 | SYSTEM.md, DECISIONS.md | none explicit — transitively via 07-12 on main (07-19:31 comment) | Indirect only (P3-7) |
| others | none of the #256 files in files_modified or `<files>`; 07-05:180 and 07-22:233 only *read/run* evidence page/spec | n/a | n/a |

ROADMAP.md: no plan lists it, but GSD execution updates ROADMAP/STATE per plan → conflict with #256's ROADMAP hunk (P3-9).

## 0c. Wave structure / critical path

- Critical path (8 waves): 07-02(u) → 07-07(u) → 07-10 → **07-12** → 07-18 → 07-22 → 07-24 → 07-25. "(u)" = user-merged. Max user merges on any chain to 07-25 = 3 (e.g. 07-02→07-07→07-11, 07-04→07-05→07-15).
- 07-12 is the single choke point for every screen plan (16·17·18·19·20·21·22·23·24·25) **and** for 07-15 (permissions server, user-merged). Its only upstream edge (07-10) exists for one sentence (§7-12 tick line, 07-12:95/:169). Removing that edge (move tick line to 07-19, which already edits SYSTEM after 07-10/07-14) makes 07-12 wave 1 (E1 only) and the phase **7 waves**: 15/16/17→w3, 18/20/21→w4, 19/22→w5, 23/24→w6, 25→w7 (simulated). See P2-8.
- Fan-in is mostly redundant listing: after transitive reduction 07-25 needs only 07-21 · 07-23 · 07-24 (9 of 12 deps redundant); 07-23 needs 07-16 · 07-19 · 07-20 · 07-22; 07-24 needs 07-15 · 07-22. Harmless but noisy (P3-6).
- 07-13 (action-log immutable trigger, user-merged) is a leaf — nothing depends on it, including 07-25 which relies on it (P2-9).

## 0d. Screen gates (CLAUDE.md:96, :124, :126; rule 10)

All 12 plans touching app/*.tsx|css or ui/ (07-08, 07-12, 07-16..07-25) state: `design-gate` call + checklist in same commit, cheap gates, independent Opus DOM audit at 375·320·768·1280 with CI=true, `/review` + `/design-review` (incl. Codex) → `/qa`. Money/permission screens add `/cso`. SYSTEM amendments (07-12, w4) precede all screen plans that use them (all w5+ screen plans depend on 07-12); 07-08 (w2) explicitly uses no amendment (07-08:103). None names `scripts/codex-design-review.sh` (P3-5).

---

## Findings

### P1

**[P1] (confidence: 8/10) 07-18-PLAN.md:203 / :212 — replacing `기간 바꾸기` · `총 매출 예상가 바꾸기` with `고치기` breaks ~30 selectors in 5 existing E2E specs that the plan neither lists nor runs**
- Plan: ":203 ③ GREEN — 이관. 기간 · 사전견적 칸을 정보 면 `기본` 섹션으로 옮기고 … `pre-estimate-field.tsx` 라벨을 `PO 금액`으로" and must_have :39 "값마다 3차 `고치기`". Verify :212 runs only `project-info-panel.spec.ts test/e2e/project-lifecycle.spec.ts`.
- Evidence: current buttons `quote-table.tsx:2811` "기간 바꾸기", `:2822` "총 매출 예상가 바꾸기"; label `pre-estimate-field.tsx:181` `label="총 매출 예상가"`. Spec hits (`grep -c "기간 바꾸기\|총 매출 예상가 바꾸기"`): test/e2e/project-period.spec.ts 21 · ledger-save-flow.spec.ts 4 (e.g. :286 `getByRole("button", { name: "총 매출 예상가 바꾸기" })`) · quote-edit-scope.spec.ts 3 · hidden-references.spec.ts 1 (:224-228 also `getByLabel("총 매출 예상가")`, `getByText("총 매출 예상가 1,000,000")`) · quote-table.spec.ts 1. None appears in 07-18 files_modified. Also `status-change.tsx:200` modal button "기간 바꾸기" opens the period field via `openPeriodField` (quote-table.tsx:1464 comment) — its target moves into the panel.
- Impact: PR goes red only when marked ready (CLAUDE.md §5 — full E2E runs in CI only), after DOM audit/design-review are spent; executor will then patch specs ad hoc.
- Remedy: add the five specs to files_modified and to the Task 2 verify command; state the new accessible names (see P3-1) and whether the status-change modal's "기간 바꾸기" keeps its label; add `hidden-references.spec.ts` expectations for `PO 금액` text.

### P2

**[P2-1] (confidence: 8/10) 07-12-PLAN.md:172 — amendment 7 (result step) contradicts SYSTEM §7-17 SUCCESS row and §7-7 sheet/modal SUCCESS cell, which the plan does not amend**
- Plan: "개정 7 → §7-17: 결과 단계 — 확인 모달이 실행 뒤 같은 창에서 일회성 값을 보임".
- Evidence: docs/design/SYSTEM.md:1275 `| SUCCESS | 성공하면 바로 닫는다 — 결과 한 줄을 다이얼로그 안에 따로 보이지 않는다(포커스는 트리거…`; test/unit/design-system-docs.test.ts:105-109 locks "§7-7 SUCCESS — 결과 한 줄을 보이지 않고 바로 닫힌다(ConfirmDialog 호출처 전부)".
- Remedy: amendment 7 must also add an explicit exception to the §7-17 SUCCESS row and the §7-7 「시트/모달(§7-8)」 SUCCESS cell ("단 일회성 값(결과 단계)은 같은 창에 값을 보이고 `닫기`로 닫는다 — §7-17 결과 단계"), keeping the asserted substrings so the doc test stays green; add `test/unit/design-system-docs.test.ts` to 07-12 verify.

**[P2-2] (confidence: 8/10) 07-17-PLAN.md:235 / :246 — shared `ui/confirm-dialog` change (≈25 callers) has no unit RED and no caller regression run**
- Plan: ":235 ② GREEN — 결과 단계 … `ConfirmDialog`에 결과 단계 prop … 기존 사용처 시험이 녹색인지 본다(기본 동작 불변)". Verify :246 runs only `people-unlock-reset.spec.ts admin-people-detail-link.spec.ts`.
- Evidence: callers (`grep -rln ConfirmDialog app ui`) include ui/side-panel/SidePanel.tsx, ui/pick-dialog/PickDialog.tsx, approvals/decision-dialogs.tsx, expenses/batch-payment-dialog.tsx, payment-action-row.tsx, quote-table.tsx, revision-dialogs.tsx … (23 app + 2 ui). Existing unit `test/unit/ui/confirm-dialog.test.ts` (static render + `initialFocusTarget` table, ConfirmDialog.tsx:133-142 returns `"evidence" | "primary" | "firstOption"` — no "copy" target) is not in files_modified.
- Remedy: add `test/unit/ui/confirm-dialog.test.ts` to files_modified with RED cases (result step markup, `initialFocusTarget` → copy, no result prop ⇒ markup identical to today); run it plus `test/unit/design-system-docs.test.ts` and 2–3 caller E2E (expense-close.spec.ts, payment-batch.spec.ts, an approvals spec) in Task 3 verify. /dev/components gallery (gallery-client.tsx) should show the new step for the DOM audit.

**[P2-3] (confidence: 7/10) 07-18-PLAN.md:39 — "고치기 취소 (Esc 같음)" silently changes the existing two-step Esc and ignores `saveLocked`**
- Plan must_have: "옆 3차 `고치기 취소`(Esc 같음) → 취소하면 값 원복 · 포커스가 `고치기`로 돌아오고".
- Evidence: quote-table.tsx:1446-1451 `// S17 — Esc는 편집 중 값을 되돌리고, 칸이 모두 원래 값이면 묶음을 닫는다` → `setPreEstimateDraft(preEstimateDirty > 0 ? preEstimateBaselineDraft : null)`; escapePeriod :1495-1505 same two-step; period-field.tsx:71-73 `if (event.key === "Escape") { … if (!saveLocked) onEscape();`. project-period.spec.ts presumably asserts the two-step behaviour.
- Remedy: decide explicitly (one-step revert+close vs keep two-step and make the button = revert+close), write it into amendment 6 (07-12:171) and the plan; button must be inert/aria-disabled while `saveLocked` like Esc; add a spec case for "dirty → 취소 → closed, focus on 고치기".

**[P2-4] (confidence: 7/10) 07-18-PLAN.md:217 — PO 금액 rename is partial; user-visible "총 매출 예상가" remains on registration form, display string and server errors**
- Plan: acceptance ":217 라벨 확인: grep -c "PO 금액" pre-estimate-field.tsx >= 1" and `grep -c "총 매출 예상가" pre-estimate-field.tsx = 0`.
- Evidence: app/(app)/projects/project-form.tsx:43-44,289 (`label="총 매출 예상가"` on registration); pre-estimate-field.tsx:31,33 display text "총 매출 예상가 —"/"총 매출 예상가 ₩…" (covered by the =0 grep, fine); server messages domain/projects/ledger.ts:117 "총 매출 예상가 바꾸기 권한 없음", domain/rules/register.ts:217, domain/projects/pre-estimate.ts:17 "총 매출 예상가는 0 이상 · 금액 수정" — shown as field errors next to a field now labelled `PO 금액`.
- Remedy: decide scope (W1 "이름만") — list project-form.tsx and the three domain strings (and their unit/integration expectations: test/unit/domain/project-pre-estimate.test.ts:17,53, test/integration/project-period.test.ts:711,732,758, project-copy.test.ts:376) or record that registration keeps the old name, with reason.

**[P2-5] (confidence: 7/10) 07-15-PLAN.md:6 + 07-12-PLAN.md:6/:95 — #256 (E1) and wave 3 transitively gate the permissions server plan and every screen; 07-12's two upstream couplings are each one sentence/one array entry**
- 07-15:107 "07-12(`ADMIN_MENUS` 알림 규칙 자리 — 없으면 `admin-menu-registry.test.ts`가 빨강)가 main에 있어야 한다"; 07-12:95 "07-10(알림 엔진 계약)이 main에 있어야 §7-12 한 줄이 실제 동작을 적는다".
- Evidence: test/unit/admin-menu-registry.test.ts:15-23 compares MENUS admin.* keys to `adminIndexGroups` hrefs — the only reason 07-15 needs 07-12. ui/shell/role-menu.ts:84 ADMIN_MENUS is not SYSTEM/DECISIONS (not a D-725 file).
- Impact: if #256 stalls, user-merged 07-15 (and all of w5–w8) stall; phase is 8 waves instead of 7 (simulation in §0c).
- Remedy: move the `ADMIN_MENUS` slot (+ its unit test) into 07-15 (same PR as the MENUS key — keeps the three copies in sync in one commit; ui/ file in a user-merged PR is harmless) or into a tiny E1-free plan; move the §7-12 tick sentence to 07-19 (already edits SYSTEM after 07-10/07-14). 07-12 then depends only on E1 and runs in wave 1.

**[P2-6] (confidence: 7/10) 07-25-PLAN.md:6 / :245 — 07-25 relies on 07-13 but does not depend on it; 07-13 is a leaf**
- :245 "T-07-25-03 | Tampering | 행동 로그 변경 | low | accept | 수정 · 삭제 UI 없음 · 불변 트리거(07-13)"; depends_on (:6) omits 07-13.
- Remedy: add "07-13" to 07-25 depends_on (07-13 is w4, no wave change) so the phase-closing audit cannot run/merge before the immutable trigger (user-merged) is on main.

**[P2-7] (confidence: 6/10) 07-17-PLAN.md:237 — `resetPersonPasswordAction` returns a secret but the plan names no registry DTO / leak-scan treatment**
- Plan: "`[id]/actions.ts`에 `resetPersonPasswordAction` · `unlockPersonAction` … 등록".
- Evidence: app/(app)/admin/people/actions.registry.ts:6-30 — every `registerAction` carries `dtoName` (D-38: leak-scan imports the registry); 07-03 adds `dto-registry-coverage` (all `…Dto` registered) and leak-scan coverage that 07-25 re-runs.
- Remedy: name the result DTO (e.g. `TempPasswordResultDto { tempPassword }`), state how leak-scan classifies it (one-time secret to an `admin.people` writer — explicit exemption with reason), and add the registry/leak-scan tests to Task 3 verify.

**[P2-8] (confidence: 6/10) 07-17-PLAN.md:31 & 07-21-PLAN.md:38-40 — session merge for web password-reset/unlock and permission screens vs CLAUDE.md:98**
- 07-17:31 `merge_owner: session` (comment: "domain/auth/는 부르기만(수정 없음 → 세션 머지)"); 07-21:38-40 "risk: permissions … 위험 경로 파일 … 없음 → 세션 머지".
- Evidence: CLAUDE.md:98 "인증·권한·암호화는 위험 경로라 사용자가 머지하고 … (이 둘은 훅이 강제하지 않는다)"; CONTEXT D-724 (07-CONTEXT.md:90) lists only hook paths and says "나머지는 세션 머지 가능". 07-17 introduces the first web path that mints a credential for another account (T-07-17-01 high).
- Remedy: put this to the user as a morning question (D-724 vs CLAUDE.md:98) and cite the answer in both plans; until then default 07-17 to user merge.

**[P2-9] (confidence: 6/10) 07-17-PLAN.md:127 / :146 — 260907 parity: retired accounts are not unlocked in 260907; plan offers `잠금 풀기` on retired+locked rows**
- :127 "잠금 풀기 · 초기화 권한 = `admin.people` 쓰기 + 대상이 상한 안 … + 자기 자신 제외(초기화만…)"; :146 "퇴직 + 잠김이면 `잠김`(우선순위)".
- Evidence: ERP_PLANT8_260907 server/src/people.ts:1008-1011 "**퇴사한 사람은 안 푼다** — 판이 새 로그인을 막는 자리라(`block_inactive_login`) 풀어도 못 들어오고, 푼 기록만 남는다." (07-09 adds retired-login block in this phase.)
- Remedy: hide `잠금 풀기` (and decide reset) for retired people, or record the deliberate difference; add the E2E case.

### P3

- **[P3-1] (6/10) 07-18-PLAN.md:39** — "값마다 3차 `고치기`": three+ identical `고치기` buttons in one panel → identical accessible names; specs/AT can't distinguish. Remedy: `aria-label="{칸} 고치기"` (visible text `고치기`) and state it in amendment 6.
- **[P3-2] (5/10) 07-18-PLAN.md:203 (Task 1 ④)** — new PO 번호 dirty cell must join the existing unsaved-edit storage/restore and previous-revision carry-over (quote-table.tsx:383-384 keys `preEstimate:*`, restore banner `dirtyStorage.restorableCount` at ~:2857). Not mentioned; state whether `poNumber` participates.
- **[P3-3] (8/10) 07-12-PLAN.md:77 vs :185 / :230** — "Output: DECISIONS 기록 8개" (and :109 "기록 8개") vs acceptance `grep -c "07 SYSTEM 개정" … >= 9` and Artifacts "기록 9개". The tick-line record's title is unspecified, so the ≥9 grep may fail. Fix count and require the tick record title to contain "07 SYSTEM 개정".
- **[P3-4] (5/10) 07-15-PLAN.md:113 (AQ-23)** — ADMIN_MENUS slot (07-12) + key seed (07-15) → `/admin/notification-rules` 404 link on staging until 07-19 merges. Already flagged; P2-5's remedy (slot lives with the key) does not fix it — seed the key to a role only in 07-19.
- **[P3-5] (7/10) 07-12:97, 07-16:117, 07-17:115, 07-18:117, 07-21:138 (all screen plans)** — gate text says "Codex 디자인 검토 포함 — CLAUDE.md §6" but never names `bash scripts/codex-design-review.sh <경로…> --out <보고서>` (exists) or the "건너뜀: 사유" fallback (CLAUDE.md:126). Add one line to each 「화면 검증 묶음」.
- **[P3-6] (8/10) 07-25-PLAN.md:6** — 9 of 12 depends_on are transitively redundant (similar in 07-20/22/23/24). Not wrong; trim or annotate "direct: 07-21 · 07-23 · 07-24".
- **[P3-7] (6/10) 07-19-PLAN.md:31** — edits SYSTEM/DECISIONS (#256 files) with only a comment "07-12가 이미 확인"; add the same `git cat-file -e` E1 precondition for machine-checkability (cheap).
- **[P3-8] (6/10) 07-21 Task 3 verify (~:157 of file)** — `ui/permission-grid/PermissionGrid.tsx` is also used by app/(app)/admin/settings/settings-form-client.tsx:12,334; verify runs permissions-grid/roles/org/mobile specs but not `test/e2e/settings.spec.ts`. Add it.
- **[P3-9] (5/10) phase-wide** — #256 edits `.planning/ROADMAP.md`; GSD executors update ROADMAP/STATE per plan, so the first post-#256 merge of origin/main will conflict in `.planning/` (manual `.planning/` editing is forbidden, CLAUDE.md §2). Note the resolution path (take main's side, rerun the GSD state update).
- **[P3-10] (6/10) 07-21 Task 2 ③ (07-21:234)** — 260907 parity: ERP_PLANT8_260907 server/src/org.ts:298-302 also refuses archiving a 본부 with non-archived teams ("아직 팀이 N개 있습니다. 먼저 정리해 주세요"); plan counts people only, so an empty-team 본부 can be archived leaving active teams under an archived 본부. Decide/record.
- **[P3-11] (6/10) 07-17-PLAN.md:90** — 260907 citation is via the compare doc only; the direct file:lines exist and should be cited: ERP_PLANT8_260907 app/src/pages/Org.tsx:3488 (unlock button) · :3244 (reset) · server/src/people.ts:1011 `/api/people/:id/unlock` · :935 `/api/people/:id/password` (260907 reset = admin types the password + unlock + session kill — 07 auto-generates; record as deliberate). Also Org.tsx:145 search is "이름으로 찾기" (name only; 07 adds email — fine).

### Appendix (suppressed, confidence 3-4)
- 07-17 `listLockedEmails` joins login_attempts.email to users.email; hooks lowercase the attempt email (domain/auth/hooks.ts:21). If any users.email is stored mixed-case the locked flag silently misses → compare `lower()`. (4/10)
- 07-12 Task 1 adds `role-menu-notification-rules.test.ts` under test/unit/ui (ui boundary — can't import domain); fine as written since it only imports ui/shell. (3/10)

---

## Per-plan sections

### 07-12 (SYSTEM amendments bundle)
1. Architecture — doc + `status-map.ts` + `ADMIN_MENUS` slot; filtered by `allowedMenus` (role-menu.ts:159) so no exposure. Production failure: SYSTEM self-contradiction (P2-1) → later screen reviews cite conflicting rows. Sequencing choke point (P2-5).
2. Code quality — claims verified: ADMIN_MENUS at role-menu.ts:84, `adminIndexGroups` :158, admin-menu-registry test only compares MENUS admin.* keys (:15-23) ⇒ slot-without-key stays green; role-menu.test.ts:129-160 requires 12 keys with pages ⇒ §6-10 row correctly deferred to 07-19. Count inconsistency P3-3.
3. Tests
```
status words x6 → STATUS_KIND           [★★★ unit planned]
ADMIN_MENUS slot order / hidden w/o key  [★★★ unit planned]
SYSTEM tokens exist in tokens.css        [★★ shell grep in verify]
§7-17/§7-7 SUCCESS consistency           [GAP → P2-1; design-system-docs.test not run]
/dev/components 4-width                  [→ DOM audit]
```
4. Performance — n/a.
260907 parity — no SYSTEM in 260907; citations carried via UI-SPEC (Projects.tsx:1767-1772 verified, see 07-18).
Failure modes — none silent beyond P2-1.

### 07-17 (people: lock/unlock/reset/paging)
1. Architecture — domain/people wraps domain/auth `unlockAccount`/`resetPassword` (accounts.ts:72,104 — both check only `admin.people` write, no ceiling; the wrapper adds ceiling + self check — OK, but ceiling check and reset are not in one tx; low risk). `lockoutConfig`/`isLocked` exist (lockout.ts:23,38). Index `login_attempts_email_attempted_idx(email, attempted_at)` supports the grouped query. Production failure: reset succeeds but response lost (network) → admin never sees the temp password, account now unusable; recovery = reset again (client shows network error — acceptable, mention in SUMMARY). Merge owner question P2-8.
2. Code quality — `listPeople` is at domain/people/index.ts:128 ✓; people page currently loads all people (page.tsx:38) and derives column visibility from the full array (:59, :71) — with paging, derive from the page rows or keep a cheap separate query; plan silent. Registry/DTO for the secret P2-7.
3. Tests
```
locked badge + row unlock               [★★★ E2E planned]
unauth / ceiling-out direct call reject [★★ E2E planned]
paging/search/locked filter             [★★★ integration + E2E]
reset result step / focus / no-leak     [★★ E2E planned]
ConfirmDialog default behaviour (25 callers) [GAP — CRITICAL regression risk, P2-2]
retired+locked unlock                   [GAP — P2-9]
people.regression-1.spec.ts             [not in verify — add]
```
4. Performance — one grouped query for locks; ILIKE with escaping; 50/page. OK.
260907 parity — verified Org.tsx:3488/3244, people.ts:1011/935; gaps P2-9, P3-11.

### 07-18 (project detail info panel)
1. Architecture — keeps state in quote-table.tsx (3135 lines) — reasonable vs a lift-state refactor. `hasProjectDocument` new repo read; budget kept off (acceptance grep currently 0 hits in projects/[id] — verified). Production failure: field cancel semantics drift (P2-3).
2. Code quality — refs verified: actions.ts:166 `saveProjectLedgerAction`, :326 `setCustomerApprovalAction`, ledger.ts:137 `saveProjectLedger`, revisions.ts:163 `setCustomerApproval` (input `CustomerApprovalInput` at :147 = `{approvedOn, seenTotalKrw, contentToken}` → adding basis/memo), `CustomerApprovalLine` at quote-table.tsx:2803, `ExpenseLineDoorState = "open" | "closed" | "no_vendor" | "none"` (domain/expenses/line-door.ts:7) — the plan's proposed words "수주 전 · 취소된 줄 · 권한 없음" don't map 1:1 onto that enum (only `closed`/`no_vendor`/`none`); executor must derive reasons from `resolveLineDoor` too.
3. Tests
```
PO 번호 save/null/dup/len/perm          [★★★ integration]
approval basis required/memo/legacy     [★★★ integration]
info panel 3 sections / PO 금액 hidden  [★★ E2E]
고치기 취소 + focus                      [★★ E2E]
existing period/pre-estimate E2E (5 specs, ~30 selectors) [GAP — CRITICAL, P1]
status-change modal "기간 바꾸기" path   [GAP]
door reason words / phone sheet          [★★ E2E]
```
4. Performance — one extra existence query per detail render. OK.
260907 parity — Projects.tsx:1767-1772 verified (`expected_revenue === null ? 없음`). Note 260907 label `T.rowExpectedRevenue` = expected revenue; 07 renames to PO 금액 per user decision.

### 07-21 (roles / org / permission grid)
1. Architecture — reuses `canEditRole`/`loadRoleGrantSnapshots` (grant-ceiling.ts; `GRANT_FORBIDDEN_MESSAGE` at :49 verified) server-side; client imports type only (acceptance enforces). Team/본부 archive in one tx with `lockSeatKeys`. `permission-grid-client.tsx` is shared with /admin/visibility (visibility/page.tsx:5,33) — plan keeps `linkedCells` optional and tests visibility no-link (behaviour line ~138) ✓.
2. Code quality — `DeleteToArchive` shared by 8 forms; AQ-30 optional prop keeps others unchanged ✓. Settings grid regression P3-8.
3. Tests
```
roleRowControls order / fail-closed     [★★★ unit + integration]
ceiling lock line once (PC only)        [★★ E2E]
role/team/본부 member block + race      [★★★ integration incl. race]
linkedCells == server dependentCells    [★★★ unit equivalence]
grid optimistic → server `changed`      [★★ E2E]
visibility grid unchanged               [★★ E2E]
settings grid (PermissionGrid)          [GAP — P3-8]
본부 with active empty teams            [GAP — P3-10]
```
4. Performance — `orgMemberCounts` one grouped query; `loadRoleRowControls` batched. OK.
260907 parity — 020_functions.sql:1626 `grant_required_permission`, :4233 `revoke_dependent_permissions`, org.ts:290-302 verified; gap P3-10.

## Failure modes (no test + no handling + silent)
- 07-18: existing project-period/ledger flows broken by relabel are silent until CI on ready (P1).
- 07-17: ConfirmDialog default path regression for 25 callers — no unit/E2E planned (P2-2).
- None found in 07-12 / 07-21 beyond P3 items.
