---
phase: "04"
slug: "project-quote-ledger"
status: open
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 1
asvs_level: 1
created: "2026-09-29"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

- 기준: ASVS Level 1 · block_on: high · 대상 HEAD `21d68269`(브랜치 `claude/gsd-verify-work-4`)
- 등록부: 계획 시점에 작성된 44개 PLAN의 `<threat_model>` 전부(고유 위협 228행 — T-04-210은 04-40·04-41이 서로 다른 위협에 같은 ID를 써서 두 행으로 셈) + 모든 플랜에 반복되는 공통 T-04-SC 1행 = 229행. SUMMARY 「Threat Flags」 13건은 모두 「새 표면 없음」.
- 방식: gsd-security-auditor(Opus) 4명이 플랜 묶음을 나눠 병렬 대조(A 04-01~11 · B 04-12~19 · C 04-20~31 · D 04-32~53 + T-04-SC). 읽기·grep·git만, 테스트 실행 없음(`pnpm lint:sql` 0건만 실행). 오케스트레이터가 열린 항목과 표본 증거를 직접 재확인.
- 집계: **229행 · 닫힘 227(완화 202 · 수락 25) · 열림 2(차단 1 = T-04-31 high · 비차단 1 = T-04-373 medium)** — T-04-318(medium)은 감사에서 열림이었으나 사용자 결정(04-31 (C)(D) 자동 테스트로 갈음)을 근거로 수락 위험에 기록해 닫힘에 셈.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| 브라우저 → Server Action | 견적 줄·매출·기간·상태 전환 페이로드. 계산 필드(견적가·차익·원화 환산액)는 넘어와도 무시되고 서버가 재계산 | 금액·수량·환율(업무 민감) |
| app/ → domain/ | 입력은 zod를 지나 domain으로, 리포지토리 행 객체는 역방향으로 넘지 못함(DTO 투영만) | 사용자 입력 |
| domain 출구 → 화면 | 정보 항목 visible() 판정을 통과한 필드만 DTO에 실림(견적·실행가·차익·발행/입금액) | 금액·거래처(계급별 비공개) |
| domain → 게이트(rules.gate) | 완료 잠금·조정 권한·기간 편집·자동 정산이 화면이 아니라 서버 규칙에서 판정 | 권한 사실 |
| domain → DB(트랜잭션) | 채번+문서 INSERT, 줄 배치 저장, 프로젝트 행 잠금이 한 트랜잭션 | 문서 번호·버전 |
| 브라우저 URL → 목록 서버 페이지 | 정렬·필터·연도·페이지 파라미터는 허용 목록 정규화 뒤에만 SQL에 닿음 | 검색 파라미터 |
| 클립보드 ↔ 표 | 붙여넣기는 상한(줄 300)·형식 검증, 복사는 이미 보이는 열만 | 표 데이터 |
| 마이그레이션 → 운영 DB / 트래픽 롤백 → 새 스키마 | 코드표 교체·컬럼 DROP(0015) 가드, rollback.sh 스키마 하한 | 스키마·업무 데이터 |
| 설정 화면 → 문서 번호 서식 | 서식 키 스키마가 자릿수·구분자를 검증(구분자 검증 빠짐 — T-04-31) | 번호 서식 |

---

## 열린 위협

### T-04-31 — Tampering · high · **OPEN (차단)** — 사용자 판단 필요

- 계획(04-05): 「서식 키 스키마가 자릿수·구분자를 검증하고, 순번이 자릿수를 넘쳐도 번호를 자르지 않는다(유일성 보존). UNIQUE 제약이 최후 방어선」.
- 있음: 연도 자릿수 1~4 `domain/settings/keys.ts:273` · 순번 자릿수 ≥1 `:283` · 순번 넘침 무절단 `domain/document-numbering/index.ts:44-48`(테스트 `test/unit/domain/document-number-format.test.ts:42`) · UNIQUE `projects_number_key`(`db/schema/projects.ts:44`).
- 없음: **구분자 검증** — `DOCUMENT_NUMBER_PROJECT_SEPARATOR.schema`가 `z.string()` 그대로(`domain/settings/keys.ts:294-302`), 길이·문자 제한 없음. 04-05-SUMMARY key-decisions가 「빈 구분자 거부」를 기본 서식 `26001`(구분자 없음)과 충돌해 풀었고, 그 과정에서 문자 허용 목록도 빠졌다.
- 실제 위험: 낮음 — 설정 쓰기 권한자만 바꿀 수 있고, 번호 유일성은 무절단+UNIQUE로 유지, 화면 출력은 React 텍스트 노드. 다만 계획이 정한 완화가 코드에 없으므로 규칙상 OPEN.
- 위험 경로(권한·인증·암호화) 아님 — 고치면 `domain/settings/keys.ts` 한 곳 + 단위 테스트.
- **결정 필요(사용자)**: (1) 허용 목록 추가 — 빈 문자열 포함, 예 `z.string().regex(/^[-_./]?$/)`(한 글자 기호만) · 허용 문자 집합은 사용자가 정함, `/gsd-quick`로 TDD 수정 후 `/gsd-secure-phase 4` 재실행 (2) 수락 위험으로 기록.

### T-04-373 — Repudiation · medium · OPEN (비차단, high 미만)

- 있음: `playwright.config.ts:51` `retries: 0` · 04-31-SUMMARY:111,150 새 DB `CI=true` 전체 E2E 3회 연속 499/499 · 실패 원인 기록 :220-237.
- 없음: 「첫 실패 trace 보존」 — 04-31-SUMMARY:239가 1·2차 실패 trace가 같은 `--output` 이름으로 덮어써졌다고 기록(콘솔 로그의 파일:줄·오류는 남음).
- 권고: 다음 최종 게이트부터 재시작마다 다른 `--output`. 코드 변경 대상 아님.

---

## Threat Register

> 원래 Component·Mitigation Plan 문구는 각 `04-NN-PLAN.md`의 `<threat_model>`에 있다. 여기서는 감사 판정과 현재 코드 증거(file:line)를 싣는다. Status: CLOSED · OPEN(차단) · OPEN(비차단 — high 미만).

### 묶음 A — 04-01 · 04-02 · 04-04~04-11

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-04-01 (04-01) | Tampering | high | mitigate | CLOSED | Schema has no computed fields: domain/quotes/lines.ts:520-574 (money = currency/amount/fxRate only; z.object strips unknown keys); server recompute writePayload→computeQuoteLineAmounts lines.ts:448-465,665-686 via domain/money; test test/integration/quote-lines.test.ts:84-105 (forged quoteAmountKrw/profitKrw → stored = recomputed) |
| T-04-02 (04-01) | Tampering | high | mitigate | CLOSED | UPDATE…RETURNING repositories/document-counters.ts:47-63; same tx as INSERT domain/projects/index.ts:617-639; UNIQUE projects_number_key db/schema/projects.ts:44 + 0009:29; test test/integration/document-counters-concurrency.test.ts:20-28 (+ rollback :30) |
| T-04-03 (04-01) | Elevation of Privilege | high | mitigate | CLOSED | Lock in server gate: domain/rules/register.ts:61-108 (project.line-edit) + domain/quotes/edit-scope.ts:56,96,128 (completed→locked); called per changed field lines.ts:931,935; test test/integration/project-status.test.ts:108-140 (completed save rejects GateBlockedError "완료 · 견적 줄 잠김", DB unchanged) |
| T-04-04 (04-01) | Information Disclosure | high | mitigate | CLOSED | quote.amount gating: domain/projects/index.ts:118-134,194-207,270-277; domain/quotes/lines.ts:177-189; projection omits failing keys domain/permissions/project.ts:62-66; no role branching in app/(app)/projects (grep role/rank = 0); test test/integration/quote-line-visibility.test.ts:43-57; leak-scan test/integration/leak-scan.test.ts |
| T-04-05 (04-01) | Tampering | medium | mitigate | CLOSED | Apply-time guard RAISE EXCEPTION db/migrations/0009_project_quote_ledger_spine.sql:96-113; explicit 4-value DELETE :115-117 (no wildcard); count test now reflects 0012 (five values) test/integration/project-status.test.ts:85-97; migration-upgrade.test.ts:148-181 starts from 0009's four values |
| T-04-06 (04-01) | Repudiation | medium | mitigate | CLOSED | ALWAYS_ON_ACTION_TYPES incl. status_change domain/action-log/record.ts:73-79; settings lookup bypassed for always-on types :150-154 |
| T-04-07 (04-01) | Denial of Service | medium | accept | CLOSED (accepted) | Accepted: plan 04-01 handles single-cell edits only; body-size limit location deferred to 04-04 (later mitigated by T-04-22, lib/actions/client.ts:26-30) |
| T-04-08 (04-01) | Denial of Service | low | mitigate | CLOSED | lock_timeout/statement_timeout before first lock stmt 0009:5-6; lint:sql 0 issues |
| T-04-09 (04-02) | Information Disclosure | high | mitigate | CLOSED | REVENUE_DTO_SPEC gates arrays/totals domain/revenue/index.ts:142-156 → project() omits keys :256; revenue.paid_amount staffDefault false domain/permissions/info-items.ts:54; key-set test test/integration/revenue-entries.test.ts:147-161 (PM DTO keys = contract, issuedEntries, issuedTotalKrw — paid fields absent). Note: revenue.issued_amount default changed to visible by user decision D-85 (04-16, info-items.ts:49-53) — intentional superseding, gating mechanism intact |
| T-04-10 (04-02) | Tampering | high | mitigate | CLOSED | Revenue row schema has no VAT/total/supply fields app/(app)/projects/actions.ts:105-114 (comment :116-118); server VAT via applyTaxRule domain/revenue/index.ts:70-82, gross back-calc :93-97; write subject judged server-side (projects.revenue write) :397-398,414-416 (contract-amount writer path removed by 04-16/04-41 D-84); test revenue-entries.test.ts:195-202 |
| T-04-11 (04-02) | Tampering | medium | mitigate | CLOSED | Remember only when fx touched: revenue/index.ts:389, lines.ts:961, reserves/index.ts:495, ledger.ts:367; only after commit of authorized save (rememberFxAfterCommit lines.ts:1035-1045); value validated domain/money/currency.ts:55; no other write path (grep rememberFxRate) |
| T-04-12 (04-02) | Tampering | medium | mitigate | CLOSED | ApplyTaxRuleOpts requires paymentDate/evidenceDate domain/money/tax.ts:30-32; historized reads use them :82-99; revenue passes asOf revenue/index.ts:75-79,93-94,194; grep of TAX_* historized reads without basis date = 0 |
| T-04-13 (04-02) | Repudiation | medium | mitigate | CLOSED | Save logs document_update in same tx domain/revenue/index.ts:426-430; no physical delete path for revenue_entries (repositories/revenue-entries.ts has only list/find/insert/update; grep delete(revenueEntries) = 0) |
| T-04-14 (04-02) | Denial of Service | low | mitigate | CLOSED | 0010_revenue_entries.sql:4-5 lock/statement timeouts; lint:sql 0 issues |
| T-04-21 (04-04) | Tampering | high | mitigate | CLOSED | Version compare + reject-before-write in one tx domain/quotes/lines.ts:923,935,950,994; test test/integration/quote-lines-conflict.test.ts:98-175 (DB re-read asserts no change), :229 format error blocks all |
| T-04-22 (04-04) | Denial of Service | high | mitigate | CLOSED | Single limit in authedActionClient before getSession lib/actions/client.ts:26-30; 256KB check with reason lib/actions/payload-size.ts:7-19; raw actionClient not used by any action (grep); test quote-lines-conflict.test.ts:276-291 |
| T-04-23 (04-04) | Tampering | medium | mitigate | CLOSED | Key = project/scope + revision ui/table/use-dirty-storage.ts:22; used quote-table.tsx:1224; unit test test/unit/ui/dirty-storage.test.ts:34-44; restored edits go through same versioned save (lines.ts:923) |
| T-04-24 (04-04) | Information Disclosure | medium | accept | CLOSED (accepted) | Accepted: 10–30 person internal system; stored draft is the user's own just-typed quote amounts, not session-grade secret; cleared on save success / 「버림」 |
| T-04-25 (04-04) | Tampering | medium | mitigate | CLOSED | Quote-aware state machine ui/table/parse-tsv.ts:1-40 (tryParseQuotedField); failures become error cells ui/table/use-clipboard-paste.ts:64,137-166; tests test/unit/ui/parse-tsv.test.ts:9-124 incl. real Excel captures (human check 2026-09-23 recorded in parse-tsv.ts header) |
| T-04-26 (04-04) | Elevation of Privilege | high | mitigate | CLOSED | Server re-judges each changed field vs DB row domain/quotes/lines.ts:926-935 via gate project.line-edit domain/rules/register.ts:75-86 (readonly/locked → reject); test quote-lines.test.ts:321 (forged settling payload fully rejected) |
| T-04-27 (04-04) | Repudiation | low | mitigate | CLOSED | test quote-lines-conflict.test.ts:253-270 (success +1 log row, rejection +0) |
| T-04-28 (04-05) | Information Disclosure | high | mitigate | CLOSED | Shared row-filter descriptor projectFilterConditions repositories/projects.ts:150-165 used by both listProjectsPage :251 and aggregateProjects :314; both short-circuit scope none :244,307; tests projects-list.test.ts:294 (same filter), :423 (archived excluded), :883. Note: no team-lead row scope exists (Scope = all\|none, domain/permissions/scope-for.ts:11), so the planned "팀장 범위" test has no target; parity tests cover the descriptor |
| T-04-29 (04-05) | Information Disclosure | high | mitigate | CLOSED | Server-side key gating domain/projects/index.ts:194-227,270-285; key-set tests projects-list.test.ts:446,476,643 |
| T-04-30 (04-05) | Tampering | medium | mitigate | CLOSED | Allowlist PROJECT_SORT_KEYS repositories/projects.ts:104-114; fallback to DEFAULT_SORT domain/projects/index.ts:237-243; typed switch resolveSortColumn repositories/projects.ts:205+ |
| T-04-31 (04-05) | Tampering | high | mitigate | OPEN | Present: digit validation domain/settings/keys.ts:273 (year 1–4), :283 (seq ≥1); no truncation domain/document-numbering/index.ts:44-48 + test test/unit/domain/document-number-format.test.ts:42; UNIQUE projects_number_key. MISSING: separator validation — DOCUMENT_NUMBER_PROJECT_SEPARATOR schema is bare z.string() (keys.ts:294-302; also prefix keys.ts:263), plan Task ② required "구분자는 허용 문자만"; no allowlist anywhere (grep). 04-05-SUMMARY:55 documents keeping z.string() only to allow the empty separator |
| T-04-32 (04-05) | Denial of Service | medium | mitigate | CLOSED | "더 보기" count param replaced by numbered pages with fixed server size: LIST_PAGE_SIZE=50 lib/paging.ts:3, clampPage :7-13; resolveListPage limit fixed domain/projects/list-view.ts:99-106; no client-controlled size |
| T-04-33 (04-05) | Denial of Service | low | accept | CLOSED (accepted) | Accepted: p99 500ms only meaningful at real data scale (04-VALIDATION Manual-Only); indexes documented, measurement deferred to Phase 8 rehearsal |
| T-04-40 (04-06) | Tampering | medium | mitigate | CLOSED | 0012_project_status_five_values.sql: RAISE guards on code table + projects rows :24,:31, projects remapped by UPDATE settled→completed :35 (not DELETE), lock timeouts :7-8; tests migration-upgrade.test.ts:148 (a), :182 (b RAISE, nothing changed) |
| T-04-371 (04-06) | Tampering | high | mitigate | CLOSED | 0012 line 1 `-- rollback-floor:`; scripts/rollback.sh:124-153 refuses non-descendant candidates; tests test/unit/deploy/rollback-sh.test.ts:198-280; recovery procedure docs/design/DECISIONS.md:596 (04-50) |
| T-04-42 (04-07) | Information Disclosure | high | mitigate | CLOSED | RESERVE_DTO_SPEC all fields → reserve.amount domain/reserves/index.ts:612-623; listReserves requires pnl view + reserve.amount else empty without count :698 (reserveRights :244-250); key-set test test/integration/reserve-entries.test.ts:875; leak-scan imports domain/reserves + reserves actions.registry leak-scan.test.ts:26,40 |
| T-04-43 (04-07) | Tampering | high | mitigate | CLOSED | No balance in action schema app/(app)/pnl/reserves/actions.ts:14-27 or DB (0018/schema grep = 0); computed from full client ledger in locked tx domain/reserves/index.ts:316-324 |
| T-04-44 (04-07) | Tampering | high | mitigate | CLOSED | runningBalance judges every date close domain/reserves/index.ts:77-101; save/update/archive batch :316-325, restore :543-548; tests test/unit/domain/reserve-balance.test.ts (mid-date, same-day order), integration reserve-entries.test.ts:103,785,841 |
| T-04-44b (04-07) | Tampering | high | mitigate | CLOSED | Client lock id-ascending FOR NO KEY UPDATE repositories/reserve-entries.ts:14-22; sorted lockIds domain/reserves/index.ts:308-309, restore :539; race test reserve-entries.test.ts:928 |
| T-04-44c (04-07) | Elevation of Privilege | high | mitigate | CLOSED | reserve_entry isProtected in generic archive repositories/archive.ts:200-213 → ProtectedRowError domain/archive/index.ts:62-63; restore via DOMAIN_RESTORERS→restoreReserve :74-77; tests reserve-entries.test.ts:830,841 |
| T-04-44d (04-07) | Tampering | medium | mitigate | CLOSED | normalizeMoneyInput (KRW fx=1, USD fx>0, range) domain/money/index.ts:108-124 via moneyToColumns :150-156; reserves prepareRows amount>0, calendar date, uuid shapes, evidence code :183-227; client existence/same-client project/archived-row/client-immutable :361-420; tests reserve-entries.test.ts:164,192,203,219,324,382,598 |
| T-04-44e (04-07) | EoP / Info Disclosure | high | mitigate | CLOSED | pnl write AND reserve.amount checked before tx, numberless ForbiddenError domain/reserves/index.ts:244-250,284-286 (save), :530-532 (restore); test reserve-entries.test.ts:696,706 |
| T-04-45 (04-07) | Repudiation | medium | mitigate | CLOSED | create/update([before,after])/archive/restore logs in tx domain/reserves/index.ts:502,508-512,517,550 (changedFields :483-489); archive = archivedAt only (repositories/reserve-entries.ts:136); denials via denyWrite id-only log domain/rules/deny-write.ts; tests reserve-entries.test.ts:642,661 |
| T-04-45b (04-07) | Tampering | medium | mitigate | CLOSED | Replay detection after lock domain/reserves/index.ts:365-371; insert ON CONFLICT (id) DO NOTHING repositories/reserve-entries.ts:103, null → reject :501; test reserve-entries.test.ts:489,503 |
| T-04-45c (04-07) | Denial of Service | medium | mitigate | CLOSED | can/visible/code table read before tx domain/reserves/index.ts:284-302; in-tx reads/logs use tx :305-327; fx remembered after commit :329; FOR NO KEY UPDATE; test reserve-entries.test.ts:624 (rejected batch leaves fx setting) |
| T-04-46 (04-07) | Denial of Service | low | accept | CLOSED (accepted) | Accepted: tens–hundreds of rows per client, lock limited to that client row (10–30 users); balance calc is a pure function replaceable by window function if scale grows |
| T-04-47 (04-07) | Denial of Service | low | mitigate | CLOSED | 0018_reserve_entries.sql:3-4 lock/statement timeouts; lint:sql 0 issues |
| T-04-100 (04-07) | Tampering | low | mitigate | CLOSED | clampPage lib/paging.ts:7-13; listReserves computes balance over all rows then slices domain/reserves/index.ts:702-709; test reserve-entries.test.ts:891 |
| T-04-379 (04-07) | Denial of Service | medium | mitigate | CLOSED | Decision ① = (b) bigint (DECISIONS.md:895, PR #82): reserve amount bigint 0018:14; per-line cap KRW_COLUMN_MAX domain/money/index.ts:78-79 enforced in normalizeMoneyInput :121-123 (field error, no PG 22003); 0016 rollback floor intentionally omitted per same user decision (0016 header lines 1-6) |
| T-04-48 (04-08) | Tampering | medium | mitigate | CLOSED | Ctrl+Enter → form.requestSubmit() app/(app)/projects/project-form.tsx:170-173 → same onSubmit/createProjectAction (authedActionClient) :141-144,253; E2E test/e2e/project-register.spec.ts:189 (number assigned) |
| T-04-130 (04-08) | Tampering | medium | mitigate | CLOSED | isCtrlCombo rejects repeat/IME lib/shortcut.ts:13-19; submittedRef latch project-form.tsx:98,143-144,171; E2E project-register.spec.ts:207 (b), :233 (b2) |
| T-04-49 (04-08) | Denial of Service | low | accept | CLOSED (accepted) | Accepted: form intercepts only Ctrl+Enter and Esc; quote-table composition blocking limited to in-table focus (04-28) |
| T-04-51 (04-09) | Tampering | high | mitigate | CLOSED | `Number(x) \|\| 0` in app/ui = 0 (only a comment hit quote-table.tsx:2005); parseNumberInput lib/format-number.ts:118-122 + Number.isFinite on save paths quote-table.tsx:770-772, revenue-section.tsx:177, reserves-table.tsx:370-372; E2E test/e2e/number-format.spec.ts:100,223,253,293,354 (save + reload) |
| T-04-52 (04-09) | Tampering | low | mitigate | CLOSED | Rounding in domain/money round() domain/money/index.ts:35; client Math.round only for display preview (quote-table.tsx:420,1765); server schema ignores client amountKrw (lines.ts:520-524) |
| T-04-53 (04-09) | Information Disclosure | low | accept | CLOSED (accepted) | Accepted: display formatting only reshapes values already received; unrelated to visible() disclosure decisions |
| T-04-160 (04-09) | Tampering | low | accept | CLOSED (accepted) | Accepted: integer *_amount_krw overflow fails INSERT loudly (no silent change); max realistic amount pending user confirmation — later superseded by 0016 bigint + KRW_COLUMN_MAX (domain/money/index.ts:78-79) |
| T-04-54 (04-10) | Elevation of Privilege | high | mitigate | CLOSED | authedActionClient app/(app)/admin/code-tables/actions.ts:48; can(admin.code-tables, write) domain/code-tables/index.ts:188-189; archived rejected :195; tests test/integration/code-item-description.test.ts:67,78 |
| T-04-55 (04-10) | Tampering | medium | mitigate | CLOSED | dangerouslySetInnerHTML in app/ + ui/ = 0 (grep); 40-char server cap domain/code-tables/description-max.ts + index.ts:174; test code-item-description.test.ts:33 |
| T-04-56 (04-10) | Information Disclosure | low | mitigate | CLOSED | description gated by code_item.label domain/code-tables/index.ts:64; registerDto :75; leak-scan imports domain/code-tables leak-scan.test.ts:17,29 |
| T-04-57 (04-10) | Denial of Service | low | mitigate | CLOSED | 0011_code_item_descriptions.sql: nullable ADD COLUMN :8 after lock/statement timeouts :5-6; ~14 small UPDATEs; lint:sql 0 issues |
| T-04-78 (04-11) | Spoofing | medium | mitigate | CLOSED | Auto-transition as SYSTEM_VIEWER domain/projects/auto-transition.ts:85,94,98,171; test test/integration/project-auto-settlement.test.ts:142 (c) actor null |
| T-04-79 (04-11) | Tampering | medium | mitigate | CLOSED | todayKst from injected clock auto-transition.ts:83,152 passed as query arg repositories/projects.ts:496; tests project-auto-settlement.test.ts:107 (session TZ UTC), :116 (boundary) |
| T-04-81 (04-11) | Denial of Service | low | mitigate | CLOSED | Separate short tx + SKIP LOCKED repositories/projects.ts:501; failure swallowed/logged auto-transition.ts:117-121; project.auto_settle info count :115; tests e3 :212, i :335, f3/f4 :289,:302, e4 :230, l :406 |
| T-04-82 (04-11) | Repudiation | low | mitigate | CLOSED | effectiveOn = max(end+1, last change) auto-transition.ts:57,107,180; status change + log same tx :94-111,157-187 |
| T-04-162 (04-11) | Tampering | high | mitigate | CLOSED | loadProjectForGate (FOR UPDATE repositories/projects.ts:397) on all write paths: domain/quotes/lines.ts:812,1080; domain/projects/ledger.ts:188,330; domain/quotes/revisions.ts:83,182; domain/projects/status.ts:281; fail-closed auto-transition.ts:155,164; tests project-auto-settlement.test.ts:318 (h), :370 (j) |
| T-04-308 (04-11) | Denial of Service | low | mitigate | CLOSED | Single query teamLeadCandidatesAtDate repositories/team-memberships.ts:85-115; called only when name needed app/(app)/projects/[id]/page.tsx:205-207, domain/projects/ledger.ts:178-180 |

### 묶음 B — 04-12~04-19

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-04-58 | Elevation of Privilege | high | mitigate | CLOSED | domain/quotes/lines.ts:701-704 changedFields(DB row vs normalized payload), :926-933 per-changed-field gate; domain/rules/register.ts:72-86; test/integration/quote-lines.test.ts:321-352 (b) forged settling unitPrice rejected |
| T-04-59 | Tampering | high | mitigate | CLOSED | repositories/quote-lines.ts:46-58,162,231 revision_id scoped find/archive/update; domain/quotes/lines.ts:846 count mismatch deny, :847 archived id deny, :975-978 new id in other revision deny, :1007 archive count check; tests quote-lines.test.ts:433 (f), :630 (w2), :707 (l) |
| T-04-61 | Repudiation | medium | mitigate | CLOSED | repositories/quote-lines.ts:152-165 archived_at/archived_by (no delete); domain/quotes/lines.ts:1017 log detail archivedLineIds; :1106 restore log {tx}; test quote-lines.test.ts:837 (s4) |
| T-04-62 | Tampering | medium | mitigate | CLOSED | domain/quotes/lines.ts:248-253 single linkedDocumentsByLine used by projectLines :267-280, write :820-827, restore :1086; domain/quotes/edit-scope.ts:60 readonly; register.ts:82 (lookup returns empty until Phase 5 fills it — by design) |
| T-04-166 | Elevation of Privilege | high | mitigate | CLOSED | domain/archive/index.ts:74-88 DOMAIN_RESTORERS.quote_line -> restoreQuoteLine; domain/quotes/lines.ts:1079-1107 lock+gate+unarchive+log in one tx; test quote-lines.test.ts:797 (s1) completed restore rejected |
| T-04-167 | Tampering | high | mitigate | CLOSED | repositories/projects.ts:395-398 FOR UPDATE; domain/projects/auto-transition.ts:148; lines.ts:812,1080; status.ts:281; tests quote-lines.test.ts:851-968 (p)(q)(r) |
| T-04-168 | Tampering | medium | mitigate | CLOSED | domain/quotes/edit-scope.ts:103-110 quoteCellsZero; lines.ts:912; register.ts:92-94; tests quote-lines.test.ts:455 (g), :472 (h) |
| T-04-174 | Repudiation | low | mitigate | CLOSED | domain/rules/deny-write.ts:30-40 allowlist ids only; lines.ts:949,816,977,980,1097,1102; test quote-lines.test.ts:321-352 (b) spy: one write.denied, no amount keys |
| T-04-169 | Tampering | low | mitigate | CLOSED | domain/quotes/lines.ts:539 lineStatus enum, :528,:530 line/dup id uuid, :572-573 order/archived uuid; app/(app)/projects/actions.ts:141 projectId uuid; test quote-lines.test.ts:762 (o). Info: revisionId is z.string().min(1) (lines.ts:570) — outside declared scope, parameterized SQL |
| T-04-310 | Tampering | medium | mitigate | CLOSED | repositories/quote-lines.ts:129 onConflictDoNothing(id); lines.ts:973-981 replay/mismatch/membership; tests quote-lines.test.ts:615 (w), :630 (w2), :646 (w3) |
| T-04-311 | Repudiation | medium | mitigate | CLOSED | lines.ts:1011-1020 recordAction {tx}; domain/revenue/index.ts:429 {tx}; test quote-lines.test.ts:972-989 (t) |
| T-04-312 | Denial of Service | medium | mitigate | CLOSED | lines.ts:617-645 prepare before tx, :798-1032 all repo calls take tx; ledger.ts:161 before :186; test test/integration/tx-safety.test.ts:218-265 pool=2, three saves all fulfilled |
| T-04-63 | Elevation of Privilege | high | mitigate | CLOSED | register.ts:54-66 adjustment only via actorCanAdjust; edit-scope.ts:55,91-94; tests quote-line-kinds.test.ts:145 (t3), :259 (k1), :283 (k2) |
| T-04-64 | Tampering | high | mitigate | CLOSED | lines.ts:657-661 resolveLineKind, :894-897 kind from locked-tx DB row, mismatch -> deny; test quote-line-kinds.test.ts:444 (k7) |
| T-04-63d | Elevation of Privilege | high | mitigate | CLOSED | lines.ts:624-627 entry opens on either perm; register.ts:67 WRITE_DENIED per line; tests quote-line-kinds.test.ts:330 (k5), :344 (k6), :434 (k13) |
| T-04-63e | Denial of Service | medium | mitigate | CLOSED | lines.ts:624 two can() in prepareQuoteLineSave (pre-tx), :1070 restore pre-tx; ledger.ts:161 before withTransaction :186 |
| T-04-65 | Tampering | medium | mitigate | CLOSED | lines.ts:727-732 negative execution only for non-quote kinds, negative unitPrice always rejected; test quote-line-kinds.test.ts:517 (o4) |
| T-04-66 | Information Disclosure | medium | mitigate | CLOSED | repositories/quote-lines.ts:13-20 no kind filter; lines.ts:186-189 quote.amount spec; test projects-list.test.ts:525-551 (g) detail = list = totals sum incl. adjustment |
| T-04-67 | Denial of Service | low | mitigate | CLOSED | db/migrations/0014_quote_line_kind.sql:5-8 lock_timeout 1s/statement_timeout 5s + ADD COLUMN DEFAULT NOT NULL inline CHECK |
| T-04-63b | Repudiation | low | mitigate | CLOSED | deny-write.ts:30-40; lines.ts:949; tests quote-line-kinds.test.ts:218-223 expectOneDenied, :259 (k1), :330 (k5) |
| T-04-63c | Elevation of Privilege | medium | mitigate | CLOSED | lines.ts:1091 restore ctx carries lineKind+actorCanAdjust; register.ts:60 restore->insert; test quote-line-kinds.test.ts:300 (k3) |
| T-04-68 | Elevation of Privilege | high | mitigate | CLOSED | domain/quotes/revisions.ts:204-205 pmUserId===viewer.id + canWrite; register.ts:272-274; revisions.ts:213 future date; tests quote-revisions.test.ts:386 (a2), :401 (a3), :421 (a5), :452 (a7) |
| T-04-69 | Tampering | high | mitigate | CLOSED | revisions.ts:196-198 server-side linkedDocuments lookup (off input is null — no client claim); register.ts:280; test quote-revisions.test.ts:429 (a6) |
| T-04-70 | Tampering | medium | mitigate | CLOSED | revisions.ts:82-121 single tx, :88-89 fromRevisionId check, :83 row lock, :104 unique-violation deny; db/schema/quote-revisions.ts:24 unique(project_id,seq); register.ts:218-228; tests quote-revisions.test.ts:237 (r4), :251 (r5), :267 (r6), :309 (r8); quote-revision-races.test.ts:115,138 |
| T-04-71 | Elevation of Privilege | high | mitigate | CLOSED | revisions.ts:240-255 ctx from latest revision in caller tx; register.ts:243-252 only gate-off + bidding/lost exempt; test quote-revisions.test.ts:520 (a10). Info: gate has no caller until Phase 5 |
| T-04-72 | Repudiation | low | mitigate | CLOSED | revisions.ts:220-229 document_update kind customer_approval {tx}; :137 customer_approved_by; :212-213 denyWrite; tests quote-revisions.test.ts:366 (a1), :429 (a6) |
| T-04-72b | Tampering | medium | mitigate | CLOSED | revisions.ts:132-142 kstDayStart/kstDateOf only; lib/kst-date.ts; no SQL ::date on customer_approved_at (grep); actions.ts:273 z.iso.date(); test quote-revisions.test.ts:366 (a1) |
| T-04-72c | Information Disclosure | medium | mitigate | CLOSED | revisions.ts:291 totalKrw->quote.amount, :299-302 registerDto; :347 previous-revision view via listQuoteLines; tests quote-revisions.test.ts:588 (s2), :614 (s3) |
| T-04-72g | Information Disclosure | medium | mitigate | CLOSED | actions.ts:289-291 -> revisions.ts:339-356 findProject(scopeFor) + listQuoteLines(QUOTE_LINE_DTO_SPEC); app/(app)/projects/actions.registry.ts:46; tests quote-revisions.test.ts:614 (s3), :643 (s4) |
| T-04-72d | Tampering | high | mitigate | CLOSED | revisions.ts:192-195 basis recomputed in tx (repositories/quote-revisions.ts:98-110); register.ts:277; tests quote-revisions.test.ts:477 (a9); quote-revision-races.test.ts:240 (D) |
| T-04-72e | Tampering | medium | mitigate | CLOSED | register.ts:276 approvableLineCount===0 deny; test quote-revisions.test.ts:460 (a8) |
| T-04-72f | Denial of Service | medium | mitigate | CLOSED | revisions.ts:78 and :172-176 can()/scope pre-tx; in-tx reads/log all tx (:83-119, :182-229); lib/db-transaction.ts:47 SET LOCAL lock_timeout 5s |
| T-04-73 | Information Disclosure | high | mitigate | CLOSED | domain/projects/index.ts:542-548 findCopySourceRow(scopeFor, non-archived), :561-567, :613-615 denyWrite project.copy-source; tests project-copy.test.ts:255 (c4), :274 (c5) |
| T-04-74 | Tampering | high | mitigate | CLOSED | repositories/quote-lines.ts:238-245 COPYABLE_KINDS + excludeCancelled; domain/projects/index.ts:646-653 withLineage:false; test project-copy.test.ts:170 (c1) (adjustment/archived/cancelled/period/pre-estimate/revenue/lineage/approval excluded; linked docs structurally excluded — quote_lines-only INSERT…SELECT) |
| T-04-75 | Tampering | medium | mitigate | CLOSED | domain/projects/index.ts:515-535 validatePreEstimateChange + normalizeMoneyInput, :591 moneyToColumns, :659-661 fx after commit only if touched; domain/money/index.ts:108-125; domain/projects/pre-estimate.ts:16-18; test project-copy.test.ts:326 (p2) |
| T-04-76 | Denial of Service | low | accept | CLOSED (accepted) | Accepted: copied line count is bounded by per-revision cap (04-26, default 300 — domain/settings/keys.ts:193-201) and runs in one transaction |
| T-04-83 | Information Disclosure | high | mitigate | CLOSED | domain/revenue/index.ts:142-156 paidEntries/paidGrossTotalKrw/balanceKrw -> revenue.paid_amount, issuedTotal -> issued_amount, registerDto; test revenue-entries.test.ts:147 (d) PM key set |
| T-04-85 | Tampering | medium | mitigate | CLOSED | domain/revenue/index.ts:185-203 server-derived contract (latest revision only, KST approval date VAT); repositories/quote-lines.ts:33-40 bigint SUM; tests revenue-entries.test.ts:296,315,331,348,363; contract-invariant.test.ts:134-205 |
| T-04-85b | Information Disclosure | medium | mitigate | CLOSED | domain/revenue/index.ts:144 contract -> quote.amount; test revenue-entries.test.ts:378 (B-19) |
| T-04-85c | Tampering | low | accept | CLOSED (accepted) | Accepted: <1024px view-only and save-time lock are UI edit-loss guards, not authorization; revenue write authz/validation is server-side (saveRevenue, 04-41) regardless of width/lock |
| T-04-87 | Information Disclosure | low | mitigate | CLOSED | domain/seed/index.ts:221-231 issued_amount upsert only for role-pm (unedited), team-lead/division-head insert-if-absent hidden; test visibility.test.ts:94 (e), :103 (f), :113 (g); admin item in 04-16-SUMMARY.md:218-220 (B-29) |
| T-04-88 | Information Disclosure | high | mitigate | CLOSED | repositories/projects.ts:158-168 shared projectFilterConditions (:249 list, :313 aggregate); domain/projects/index.ts:270-286 totals spec all-of PROFIT_INFO_ITEMS + registerDto ProjectListTotals; test projects-list.test.ts:446 four-class key sets |
| T-04-89 | Information Disclosure | high | mitigate | CLOSED | domain/projects/index.ts:429 projectMany(PROJECT_LIST_DTO_SPEC) only; repo list fns imported only by domain/projects/index.ts:40-41 (no app import); tests projects-list.test.ts:446, :476 |
| T-04-91 | Denial of Service | medium | mitigate | CLOSED | lib/paging.ts:3 LIST_PAGE_SIZE=50; domain/projects/list-view.ts:104-106; repositories/projects.ts:317-334 GROUP BY bucket, bigint sums :40-41,:266-271,:321-326; test projects-list.test.ts:238 (C-01) |
| T-04-370 | Tampering | low | accept | CLOSED (accepted) | Accepted: totals and list are two statements; an auto-settle commit between them can briefly skew basis within one request — 30-user scale, refresh corrects; shared snapshot tx rejected (conflicts with 04-32 pool rule/parallel reads) |
| T-04-92 | Tampering | low | mitigate | CLOSED | domain/projects/index.ts:356 settle first, then aggregate :386, then list :389; domain/projects/auto-transition.ts:81 try (fail-open) |
| T-04-315 | Denial of Service | medium | mitigate | CLOSED | domain/projects/index.ts:429 one projectMany; repositories/projects.ts:32-47 current-revision-only line sums, :51-60 LATERAL issued; test projects-list.test.ts:488 same call count 1 vs 50 rows; EXPLAIN in 04-17-SUMMARY.md:96 |
| T-04-93 | Information Disclosure | high | mitigate | CLOSED | domain/projects/index.ts:189,208-210 all-of PROFIT_INFO_ITEMS; domain/permissions/project.ts:64 every(); test projects-list.test.ts:643 four-class row key sets |
| T-04-94 | Information Disclosure | medium | mitigate | CLOSED | domain/projects/index.ts:222-244 normalizeSort visibility check; tests projects-list.test.ts:708, :718 |
| T-04-95 | Tampering | medium | mitigate | CLOSED | domain/projects/index.ts:238 allowlist; repositories/projects.ts:104-114, :205-232 default fallback, :253 fixed asc/desc literal |
| T-04-96 | Information Disclosure | low | accept | CLOSED (accepted) | Accepted: columnStep is a display hint computed only from amounts the viewer already received (always `full` without amount keys); reveals no hidden magnitude |
| T-04-97 | Tampering | high | mitigate | CLOSED | ui/table/Table.tsx:264 splitPages view-only; app/(app)/projects/[id]/quote-table.tsx:1509,1519-1520 save built from full `lines`; E2E test/e2e/quote-table.spec.ts:842 (45-line total on both pages), :889 (edits on both pages saved) |
| T-04-98 | Information Disclosure | low | accept | CLOSED (accepted) | Accepted: Ctrl+C copies only columns already rendered for that viewer (04-24 copyText) plus currency code; fields the server withheld have no column |
| T-04-99 | Denial of Service | low | accept | CLOSED (accepted) | Accepted: 300-line per-revision server cap (04-26) bounds lines per screen; paging is client-side array slicing, no extra requests |
| T-04-316 | Tampering | medium | mitigate | CLOSED | ui/table/paging.ts:6 FocusCell {rowId,colKey}; ui/table/use-grid-keyboard.ts:21,28,201,297 row-id handlers; ui/table/Table.tsx:387-401; unit test/unit/ui/table-paging.test.ts:202-230; E2E quote-table.spec.ts:991 (Alt+↓ across page), :1009 (page-2 Delete) |

### 묶음 C — 04-20~04-31

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-04-34 (04-20 + 04-21) | Elevation of Privilege | high | mitigate | CLOSED | Server: domain/projects/status.ts:221-223 (can projects.status/complete), :271-273 (rowScope none → denyWrite ProjectNotFound), :288-297 (archived/authz before from-check); scope-for.ts:54. PM direct call denied: test/integration/project-status.test.ts:229-240, :312-326. UI: app/(app)/projects/[id]/page.tsx:116,179-181 (render only if statusDestinations non-empty); E2E test/e2e/project-lifecycle.spec.ts:128,267 |
| T-04-35 (04-20 + 04-21) | Elevation of Privilege | high | mitigate | CLOSED | register.ts:136 (settling→completed needs projects.complete); seed domain/seed/index.ts:202 (CEO only) + :159-170 (sysadmin all-menu loop); menus.ts:24. Integration (h) project-status.test.ts:328-350; A-05 :518-519 (team lead has none). E2E (c) project-lifecycle.spec.ts:248-281 |
| T-04-106 | Elevation of Privilege | high | mitigate | CLOSED | status.ts:71-90 (workScope + findMembershipAtDate(todayKst)); register.ts:138; integration (j) project-status.test.ts:352-381 (other-team lead denied, division head passes, moved lead denied) |
| T-04-305 | Elevation of Privilege | high | mitigate | CLOSED | status.ts:61-85 reads repositories/roles findRoleById + team-memberships findMembershipAtDate directly (grep: no project()/teamAtDate in status/ledger/period); seed-only tracer project-status.test.ts:206-241; (l) visibility off :400-408 |
| T-04-36 | Tampering | high | mitigate | CLOSED | app/(app)/projects/actions.ts:237-238 z.enum(PROJECT_STATUSES); status-transitions.ts:71-76 (no →settling); register.ts:134-135 unknown pair denied; integration (c) project-status.test.ts:296-297 (in_progress→lost/settling rejected) |
| T-04-37 | Tampering | medium | mitigate | CLOSED | repositories/projects.ts:395-398 FOR UPDATE via auto-transition.ts:142-148; conditional UPDATE projects.ts:418 (WHERE status = expected); OV-3 race project-status.test.ts:473-511 (one success, one log) |
| T-04-105 | Tampering | medium | mitigate | CLOSED | status.ts:301 (row.status !== input.from → StatusChangedError); A-11 project-status.test.ts:438-451 |
| T-04-104 | Repudiation | high | mitigate | CLOSED | status.ts:314-323 recordAction(..., { tx }) inside withTransaction :326-327; A-01 project-status.test.ts:416-436; A-23 :588-603 |
| T-04-38 | Repudiation | medium | mitigate | CLOSED | domain/action-log/record.ts:79 status_change in ALWAYS_ON (:150 bypasses settings); domain/rules/deny-write.ts:98-118 allow-list write.denied; unit test/unit/domain/rules-gate.test.ts:341-358; integration project-status.test.ts:555-586; denied transitions leave no status log (:287-310) |
| T-04-103 | Elevation of Privilege | high | mitigate | CLOSED | domain/seed/index.ts:181,205 insertPermissionIfAbsent; :228,232,234 insertVisibilityIfAbsent (sysadmin-only upsert :161,:215); tests project-status.test.ts:513-530 (A-05), :532-553 (ENG-D3 ③) |
| T-04-306 | Denial of Service | medium | mitigate | CLOSED | status.ts:271 facts loaded before withTransaction :327 (loadStatusChangeFacts :155-165); in-tx only tx; test/integration/tx-safety.test.ts:320-376 (pool 2, 3 concurrent, <10s, 1 ok/2 StatusChanged) |
| T-04-161 | Elevation of Privilege | high | mitigate | CLOSED | page.tsx:116 statusDestinations → status.ts:175-185,202-216 (coversProjectTeam, same as actorCoversProjectTeam :93-100); E2E (g) project-lifecycle.spec.ts:399-422; server (j) project-status.test.ts:352 |
| T-04-39 | Information Disclosure | medium | mitigate | CLOSED | status.ts:243-252 lastStatusChangeOn returns date only (no actor); page.tsx:118,222 subtitle `${label} ${date}`; repositories/action-log.ts has no groupBy/count aggregation; only caller page.tsx |
| T-04-307 | Elevation of Privilege | medium | mitigate | CLOSED | test/e2e/project-lifecycle.spec.ts:15-17 contract comment; grep permission/visibility setters in spec = 0 (only role-id constants import :8) |
| T-04-330 | Tampering | medium | mitigate | CLOSED | status-change.tsx:135-138,196 (unsavedEditsReason → trigger disabled/aria-disabled, both labels via one trigger, REVERT_LABEL :47); E2E (i) project-lifecycle.spec.ts:459-503; server seenStatus ledger.ts:196-198 (see T-04-332) |
| T-04-331 | Spoofing | low | mitigate | CLOSED | status-change.tsx:131-134 revertNeedsConfirm; server-computed inputs page.tsx:196-198; E2E (b)(b2)(b3) project-lifecycle.spec.ts:167,204,227; server gate status.ts:294-304 |
| T-04-77 | Elevation of Privilege | high | mitigate | CLOSED | domain/projects/period.ts:17-20 (settling → only lead), :88 (PM can't save end < today on resolved value, A-02); ledger.ts:202-228 gate project.period-edit; integration project-period.test.ts (a):148, (b):173, (b2):228, (h):326 |
| T-04-78 | Spoofing | medium | mitigate | CLOSED | ledger.ts:312-326 revert logged as viewer; auto-transition.ts:171 SYSTEM_VIEWER; tests (a) project-period.test.ts:160 (actor=lead), (c) :250 (actor null) |
| T-04-80 | Tampering | medium | mitigate | CLOSED | ledger.ts:216-218 baseline conflict → PERIOD_CONFLICT; repositories/projects.ts:426-448 IS NOT DISTINCT FROM expected (no version); lock via loadProjectForGate ledger.ts:188; tests (l):424, (m):439, (m2):457 |
| T-04-309 | Tampering | medium | mitigate | CLOSED | ledger.ts order: period write :259 → revert :303 → rejudge :330 → quote lines :336 → revenue :346; test (n) project-period.test.ts:469-508 (line gate sees settling, seq order) |
| T-04-163 | Tampering | high | mitigate | CLOSED | ledger.ts:148-158 revision.projectId !== projectId → denyWrite quote.revision-project before any write; test (i) project-period.test.ts:379-401 |
| T-04-164 | Repudiation | medium | mitigate | CLOSED | ledger.ts:294-298, :312-326, :330, :338-347 all recordAction with { tx } inside withTransaction :186; test (k) project-period.test.ts:403-422 |
| T-04-175 | Repudiation | low | mitigate | CLOSED | ledger.ts:151-156, :244-249 denyWrite({projectId}) only, no action_log; tests (b) project-period.test.ts:189-193 (1 write.denied, no date/amount keys, 0 document_update), (i) :396-400 |
| T-04-332 | Tampering | high | mitigate | CLOSED | ledger.ts:196-198 locked.status !== seenStatus → StatusChangedError after lock, before period write; actions.ts:143 seenStatus z.enum; tests (g):512, (g2):536, (g3):558, no write.denied :573 |
| T-04-63 | Elevation of Privilege | high | mitigate | CLOSED | page.tsx:55,87-96 server-computed canAdjust/adjustment cells; E2E test/e2e/quote-line-kinds.spec.ts:253-289 (PM Enter/Delete/Alt no-op); server test/integration/quote-line-kinds.test.ts:145-150 |
| T-04-66 | Information Disclosure | medium | mitigate | CLOSED | E2E quote-line-kinds.spec.ts:232-251 (PM sees adjustment row in same table) |
| T-04-66c | Tampering | low | mitigate | CLOSED | E2E quote-line-kinds.spec.ts:291-312 (skip count 「조정 줄 2칸 건너뜀」); server register.ts:51 ADJUSTMENT_DENIED + quote-line-kinds.test.ts:145-150,273,289 |
| T-04-66b | Information Disclosure | low | accept | CLOSED (accepted) | Rationale: vendor/subcategory reference lists already go to projects-write holders and carry no amounts — giving them to adjustment holders exposes nothing new. (Note: page.tsx:112 now also serves id·name-only list to view-only ranks — still amount-free) |
| T-04-68 | Elevation of Privilege | high | mitigate | CLOSED | page.tsx:146,152-160 (assigned PM + write + not completed + amount visible); E2E quote-revisions.spec.ts:295-328, :409-423; server test/integration/quote-revisions.test.ts:386 (a2), :401 (a3) |
| T-04-70b | Tampering | medium | mitigate | CLOSED | revision-dialogs.tsx:65 sends fromRevisionId; actions.ts:252-253; E2E dblclick quote-revisions.spec.ts:115-152 (revisionCount 2); server (r4) quote-revisions.test.ts:237 |
| T-04-70c | Denial of Service | medium | mitigate | CLOSED | E2E quote-revisions.spec.ts:154-188 & :368-389 (unsaved blocks primary), :733-756 (previous revision section leaves ledger/URL), :886-941 (displaced stash restore row) |
| T-04-70d | Tampering | high | mitigate | CLOSED | page.tsx:156 carries totalKrw+contentToken; actions.ts:273-276 required seenTotalKrw/contentToken; E2E quote-revisions.spec.ts:440-476 (「견적이 바뀜 · 새로 고침」), :368; server (a9) quote-revisions.test.ts:477 |
| T-04-124b | Tampering | medium | mitigate | CLOSED | domain/quotes/lines.ts:270-277 DTO cellEditability via lineCellEditability(approvedSeq); page.tsx:78; server gate lines.ts:929-931 (quoteAmountUnchanged); E2E quote-revisions.spec.ts:526 |
| T-04-71 | Elevation of Privilege | high | mitigate | CLOSED | domain/quotes/revisions.ts:347 locked:true, canWrite:false; previous-revision.tsx:1-20 imports only listRevisionLinesAction (no save/edit, no searchParams — grep 0); E2E quote-revisions.spec.ts:670-756 |
| T-04-71c | Tampering | low | mitigate | CLOSED | previous-revision.tsx:394-411 copy → clipboard only (no merge into ledger); paste path re-validated client + server (lines.ts:949-950) |
| T-04-71d | Information Disclosure | low | accept | CLOSED (accepted) | Rationale: copy is a user action; content is the user's already-visible DTO projection (no hidden amount keys) plus values they typed — no new exposure |
| T-04-55 | Tampering | medium | mitigate | CLOSED | ui/select/Select.tsx:66 text node; app/(app)/admin/vendors/vendor-form.tsx:167-168 text node; repo-wide dangerouslySetInnerHTML/innerHTML = 0; server limit domain/code-tables/index.ts:171-177 + description-max.ts:7 |
| T-04-60 | Denial of Service | medium | mitigate | CLOSED | domain/settings/keys.ts:193-200 default 300; lines.ts:943-945 cap gate; lib/actions/client.ts:27-29 + payload-size.ts:11-19 body limit; test/integration/quote-line-cap.test.ts:205 (bypass batch rejected) |
| T-04-171 | Tampering | medium | mitigate | CLOSED | lines.ts:812 lock (FOR UPDATE) before count :943; restore lines.ts:1080-1102 same cap gate under lock; tests quote-line-cap.test.ts:179 (restore), :237 (two-connection race) |
| T-04-101 | Elevation of Privilege | high | mitigate | CLOSED | app/(app)/admin/people/actions.ts:79-83 authedActionClient + z.enum(ROLE_WORK_SCOPES); domain/permissions/roles.ts:147-157 can(admin.people, write); DB CHECK db/schema/roles.ts:34 / migration 0013; tests test/integration/roles.test.ts:132-135, :152-158 |
| T-04-102 | Tampering | medium | mitigate | CLOSED | repositories/roles.ts:96 onConflictDoNothing; test roles.test.ts:137-141 (reseed keeps company) |
| T-04-173 | Repudiation | low | mitigate | CLOSED | domain/permissions/roles.ts:163-169 permission_change detail {workScope:{from,to}}; test roles.test.ts:119-130 |
| T-04-49 | Denial of Service | low | accept | CLOSED (accepted) | Rationale: only the three combos the app uses are blocked; copy/paste/select-all keep native behavior while editing a cell; blocking scoped to grid focus |
| T-04-365 | Information Disclosure | low | mitigate | CLOSED | Envelope only after prepareQuoteLineSave (lines.ts:~626-631 write + quote.amount) and revision-scoped rows (:831,:846); conflicts only for rows in request (:923); gate denial thrown first (:949) ; actions.ts:198-213 maps only SaveRejectedError |
| T-04-366 | Tampering | medium | mitigate | CLOSED | quote-table.tsx:2079-2092 resolveConflict raises version to server theirVersion; server re-checks version lines.ts:923; unresolved conflicts block save entirely quote-table.tsx:1324,1503-1504 |
| T-04-314 | Tampering | medium | mitigate | CLOSED | lib/shortcut.ts:13-19 isCtrlCombo (repeat/isComposing); ui/table/use-grid-keyboard.ts:206; quote-table.tsx:1501-1502 savingRef/isExecuting guard; E2E test/e2e/quote-table.spec.ts:553 (d) |
| T-04-79 | Tampering | medium | mitigate | CLOSED | lib/kst-date.ts:1-34 (Asia/Seoul formatter, all fns take now/ymd; no Date.now/new Date()/TZ reads); test/unit/lib/kst-date.test.ts:8-16 (boundary), :42-43 (round-trip) |
| T-04-58 | Elevation of Privilege | high | mitigate | CLOSED | quote-table.tsx:283,1269-1271 cells from DTO cellEditability / newLineCells; no status-name branching for editability (only refresh compare :1106); page.tsx:69-96; server test/integration/quote-lines.test.ts:321 (settling forged), :354 (completed) |
| T-04-170 | Tampering | low | mitigate | CLOSED | page.tsx:78 newLineCells (isNewLine); quote-table.tsx:1913-1918 paste uses same cells; E2E test/e2e/quote-edit-scope.spec.ts:337,394; server quote-lines.test.ts:472 (h) |
| T-04-313 | Tampering | low | mitigate | CLOSED | quote-table.tsx:290-292 new id minted once (crypto.randomUUID → clientKey); :1521 full active order; server quote-lines.test.ts:561 (u), :615 (w); E2E quote-edit-scope.spec.ts:498 (h), :518 (i) |
| T-04-165 | Tampering | medium | mitigate | CLOSED | Real captures test/fixtures/excel-clipboard.ts:17-19 (+ 2026-09-28 A/B); unit test/unit/ui/parse-tsv.test.ts:63-64,116-133; E2E test/e2e/excel-paste-final.spec.ts; server all-or-nothing lines.ts:949-950. Human "blocking" check = user-supplied real Excel captures + automated replay judgment (user-approved 2026-09-23, sanctioned by T-04-318 text) |
| T-04-318 | Repudiation | medium | mitigate | CLOSED (accepted — 사용자 결정 2026-09-29) | Declared: PC items (C)(D) final human answers all 「같다」 recorded. Found: never answered — 04-31-SUMMARY.md:198 deferred, then STATE.md:299 / 04-VERIFICATION.md:295 substituted automated tests (user decision 2026-09-29); 04-UAT.md:156-160 records `result: pass` with "사람 확인 생략". Excel item via capture replay = present. Fix: run (C)(D) on real Windows Excel/IME and record, or log as accepted risk (user decision exists). No code file. |
| T-04-369 | Tampering | low | mitigate | CLOSED | test/fixtures/excel-clipboard.ts:1-9 no-byte-edit rule, raw literals :17-19; unit asserts raw parse parse-tsv.test.ts:63-70,116-133; example values only (무대 설치 · 현수막) |
| T-04-373 | Repudiation | medium | mitigate | OPEN (non-blocking) | Present: playwright.config.ts:51 retries:0; 04-31-SUMMARY.md:111,150 3 consecutive fresh-DB CI=true runs 499/499 (per-run times), root-cause records :220-237 + restart. Missing: 「첫 실패 trace를 보존」 — SUMMARY:239 admits run 1/2 failure traces overwritten (same --output). No test-results artifacts in repo. Fix: per-attempt --output on next final gate or accept risk. No code file. |

### 묶음 D — 04-32 · 04-40~04-44 · 04-46~04-53 · T-04-SC

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-04-SC | Tampering (supply chain) | high | mitigate | CLOSED | Phase-04 commits touching package.json: fbe26a16 (04-03, +2 `scripts` entries only) and 6b7519fa (removed them) = net 0; no phase-04 commit touched pnpm-lock.yaml. Only dep diff a25d0fb0^..HEAD is `nodemailer 10.0.10` (+9 lockfile lines) from e33d7c61 feat(04.2-15), arrived via merge 379b837d (PR #73, phase 04.2) — NOT phase 04. vs d6b41cf: devDependencies/optionalDependencies/peerDependencies equal; dependencies differ only by that nodemailer. |
| T-04-301 (04-32) | Denial of Service | high | mitigate | CLOSED | lib/db-transaction.ts:47 `SET LOCAL lock_timeout='5s'` + :19-38 55P03/pool-timeout -> UserFacing; db/client.ts:20,35,41 `connectionTimeoutMillis` 5000; docs/ARCHITECTURE.md:169-185 §4-8; test/integration/tx-safety.test.ts:150-215 (c) pool 2 × 3 saves <10s, :218-265 (g) all three succeed |
| T-04-302 (04-32) | Repudiation | medium | mitigate | CLOSED | domain/action-log/record.ts:107,141-178 (`deps.tx` for log write + setting lookup); test/integration/action-log.test.ts:34-44 rollback => no action_log row |
| T-04-303 (04-32) | Information Disclosure | high | mitigate | CLOSED | domain/permissions/project.ts:46-83 (spec-only keys, all-of `every`); domain/permissions/dto-registry.ts:15-28 EmptyInfoItemsError (empty all-of rejected); test/unit/permissions/project.test.ts:24-35, 117-133 (all-of three combos) |
| T-04-304 (04-32) | Denial of Service | medium | mitigate | CLOSED | domain/permissions/project.ts:53-56 (one visible() per distinct item); test/unit/permissions/project.test.ts:92-115 (300 rows -> 2 calls) |
| T-04-201 (04-40) | Tampering | high | mitigate | CLOSED | domain/quotes/lines.ts:812-816 (loadProjectForGate then same-tx latest revision != revisionId -> denyWrite); shared by saveQuoteLines :1119 and ledger.ts:338; test/integration/quote-revision-races.test.ts:115 (A), :156, :171 (composite) |
| T-04-202 (04-40) | Elevation of Privilege | high | mitigate | CLOSED | repositories/quote-lines.ts:57 (find by ids AND revision_id), :230-231 (update WHERE id+revision_id+version); domain/quotes/lines.ts:831,846 (found != sent -> deny all); test/integration/quote-lines.test.ts:1065 (m1), :1081 (m2) |
| T-04-203 (04-40) | Tampering | medium | mitigate | CLOSED | domain/projects/ledger.ts:148-157 (`quote.revision-project` denyWrite before any write); test/integration/quote-lines.test.ts:1101-1121 (m3, quote+revenue unchanged, write.denied once) |
| T-04-204 (04-40) | Tampering | high | mitigate | CLOSED | loadProjectForGate (domain/projects/auto-transition.ts:136-150 -> repositories/projects.ts:397 `.for("update")`) in save lines.ts:812, new revision domain/quotes/revisions.ts:82-83, approval :181-182; races test/integration/quote-revision-races.test.ts:115-275 (A)(B)(C)(C')(D) with waitForLockWaiter (:18,:98-104) |
| T-04-205 (04-40) | Tampering | high | mitigate | CLOSED | domain/rules/register.ts:68-104 (approval lock on qty/price/status/subcategory, insert/archive/restore, quoteAmountUnchanged); domain/quotes/lines.ts:817-818, 914-915, 928-931 (GAP 1 recompute vs locked row); test/integration/quote-approved-lock.test.ts:154-250, :273 (composite) |
| T-04-205b (04-40) | Tampering | high | mitigate | CLOSED | domain/quotes/revisions.ts:181-195 (lock then basisMatches), domain/rules/register.ts:277; race (D) test/integration/quote-revision-races.test.ts:240-262 |
| T-04-209 (04-40) | Tampering | medium | mitigate | CLOSED | domain/money/index.ts:108-125 (KRW fx=1, USD fx>0, ranges), :156 moneyToColumns calls it first; domain/quotes/lines.ts:752-763 cell errors; used by projects/ledger/revenue/reserves; test/integration/quote-lines.test.ts n1-n3 (~:1148-1180) |
| T-04-210 (04-40) — ID collision with 04-41 | Denial of Service | medium | mitigate | CLOSED | domain/quotes/lines.ts:765-768 quoteAmountWithinBound -> qty+unitPrice cell errors before write; domain/money/index.ts:178; test/integration/quote-lines.test.ts:1222-1275 (d1 standalone, d1b, d2 composite; pgCodes == []) |
| T-04-206 (04-40) | Elevation of Privilege | medium | mitigate | CLOSED | domain/quotes/lines.ts:1079-1098 (restore: same lock, latest revision check, approval gate); test/integration/quote-approved-lock.test.ts:252-270 |
| T-04-207 (04-40) | Repudiation | low | mitigate | CLOSED | domain/rules/deny-write.ts:30-40 (write.denied, allow-listed ids, no amounts); single call sites lines.ts:949, ledger.ts:151; spy "한 번" asserts quote-approved-lock.test.ts:159, quote-revision-races.test.ts:156 |
| T-04-208 (04-40) | Denial of Service | low | accept | CLOSED (accepted) | Lock is one project row; tx is a short write within 300-line cap (10–30 users); pre-judgement inside same locked tx so no self-lock wait (04-11, A-13). |
| T-04-84 (04-41) | Tampering | medium | mitigate | CLOSED | app/(app)/projects/actions.ts:146-150 (revenue schema has no contract keys; zod strips); reference scan of app/domain/repositories/db/schema = 0 hits; test/integration/revenue-entries.test.ts:397-470 (3 cases incl. fs scan) |
| T-04-86 (04-41) | Denial of Service | medium | accept | CLOSED (accepted) | Deploy window: migrate Job runs before new revision; bundle ② revision reading dropped contract columns errors for minutes during bundle ③ deploy. Pending user confirmation before bundle /ship (04-50 T-04-372); rollback risk covered by T-04-371 floor; recovery in DECISIONS (docs/design/DECISIONS.md:887). |
| T-04-86b (04-41) | Tampering | high | mitigate | CLOSED | db/migrations/0015_drop_project_contract_columns.sql:10-21 RAISE guard (source<>'demo' AND amount<>0 OR foreign NOT NULL); test/integration/migration-upgrade.test.ts:238-338 (c)(c2)(d) |
| T-04-86c (04-41) | Tampering | low | mitigate | CLOSED | 0015 inline `-- squawk-ignore ban-drop-column` + reason above each DROP (:22-34); .squawk.toml unchanged since ae0862cf (01-04), ban-drop-column not in excluded_rules |
| T-04-210 (04-41) — ID collision with 04-40 | Tampering / Elevation of Privilege | high | mitigate | CLOSED | repositories/revenue-entries.ts:95-102 (WHERE id+version+project_id+kind); domain/revenue/index.ts:371-379 (0 rows -> same-tx re-read -> denyWrite ENTRY_SCOPE); test/integration/revenue-entries.test.ts:531 (other project id), :552 (payment id into issue table) |
| T-04-211 (04-41) | Tampering | medium | mitigate | CLOSED | repositories/revenue-entries.ts:64 onConflictDoNothing(id); domain/revenue/index.ts:333-368 sameStoredEntry (archived/project/kind/values) else denyWrite; tests revenue-entries.test.ts:569 (one row), :584 (value mismatch), :598 (other id), :657 (archived id) |
| T-04-212 (04-41) | Tampering | medium | mitigate | CLOSED | domain/revenue/index.ts:301-329 moneyToColumns -> `amount` cell SaveRejectedError; test/integration/revenue-entries.test.ts:693-720 |
| T-04-213 (04-41) | Denial of Service | medium | mitigate | CLOSED | domain/revenue/index.ts:397-399,407-431 (rights precomputed, recordAction {tx}), :441-443 fx after commit; ledger.ts:162,347,370; tests revenue-entries.test.ts:817-900 (rejected batch leaves fx.recent_rate, rights required) |
| T-04-41 (04-42) | Information Disclosure | high | mitigate | CLOSED | app/(app)/pnl/reserves/page.tsx:17-18 (can pnl view AND visible reserve.amount else notFound); domain/reserves/index.ts:698 (list gated); test/e2e/reserves.spec.ts:709-722 (PM + exposure-off role -> 404) |
| T-04-41b (04-42) | Information Disclosure | medium | mitigate | CLOSED | app/(app)/pnl/page.tsx:19,24 (link only when both); test/e2e/reserves.spec.ts:714,721 link count 0 |
| T-04-42b (04-42) | Information Disclosure | medium | mitigate | CLOSED | test/integration/leak-scan.test.ts:26,40 (imports domain/reserves + reserves actions.registry), :156-164 |
| T-04-43b (04-42) | Tampering | low | mitigate | CLOSED | app/(app)/pnl/reserves/actions.ts:12-25 rowSchema has no balance/lock/stage keys (zod strips); server client-lock domain/reserves/index.ts:384-386,439 |
| T-04-43e (04-42) | Denial of Service | medium | mitigate | CLOSED | ui/pagination/Pagination.tsx:1 next/link; reserves-table.tsx:81 (row-id edit map), :838,1254 saveLocked; E2E reserves.spec.ts:257 (DR-18), :664 (DR-3) |
| T-04-43c (04-42) | Denial of Service | medium | mitigate | CLOSED | app/(app)/pnl/reserves/reserves-table.tsx:1189-1240 (batch error + Link to page); E2E reserves.spec.ts:321 |
| T-04-43d (04-42) | Tampering | medium | mitigate | CLOSED | reserves-table.tsx:721 crypto.randomUUID(); repositories/reserve-entries.ts:103 onConflictDoNothing; test/integration/reserve-entries.test.ts:489 |
| T-04-50 (04-43) | Repudiation | low | mitigate | CLOSED | commit 1111278e `docs(04):` via gsd-tools (04-43-SUMMARY:88); touches only REQUIREMENTS (2 lines) + ROADMAP (1 line); decision IDs D-75/76/78/79/80/82/84, D10/D11/D12 present in added text |
| T-04-364 (04-43) | Tampering | low | mitigate | CLOSED | `git show --stat 1111278`: ROADMAP.md 1+/1- (<=2 lines), subject `docs(04):` |
| T-04-333 (04-44) | Elevation of Privilege | medium | mitigate | CLOSED | domain/rules/register.ts:191-199 (rights none or !canSeeAmount -> deny); domain/projects/ledger.ts:168-178 (can + visible quote.amount pre-tx), :237,248 gate + denyWrite; test/integration/project-period.test.ts:680 (o2), :699 (o2b) |
| T-04-334 (04-44) | Information Disclosure | medium | mitigate | CLOSED | domain/projects/index.ts:134 preEstimate infoItem quote.amount (leak-scan imports domain/projects :22); ledger.ts:289 detail `preEstimateChanged: true` only; test project-period.test.ts:660 (o) |
| T-04-337 (04-44) | Tampering | low | mitigate | CLOSED | domain/projects/ledger.ts:367-370 (only fxRateTouched && committed && non-KRW, after commit); :272-276 moneyToColumns; test project-period.test.ts:764 (o4) |
| T-04-360 (04-46) | Elevation of Privilege | medium | mitigate | CLOSED | ui/button/Button.tsx:68-76 (inactive -> preventDefault, no onClick), :83 aria-disabled; test/unit/ui/button.test.ts:17-46; test/e2e/action-log.spec.ts:160 |
| T-04-361 (04-46) | Tampering | medium | mitigate | CLOSED | ui/confirm-dialog/ConfirmDialog.tsx:88,143-166 (submitting ignores Esc/backdrop/close, Ctrl+Enter guarded); lib/shortcut.ts:13-19 isCtrlCombo rejects repeat/composing |
| T-04-362 (04-46) | Denial of Service | low | mitigate | CLOSED | app/(app)/projects/project-form.tsx:195,399-401 「입력 버리기」 confirm; test/e2e/project-register.spec.ts:281 (c2) |
| T-04-363 (04-46) | Spoofing | low | accept | CLOSED (accepted) | Rejection strings are fixed server copy (rules.gate etc.) rendered only as React text nodes; no HTML injection path. |
| T-04-97b (04-47) | Tampering | high | mitigate | CLOSED | paste fills beyond page into full line array; test/e2e/quote-table.spec.ts:1467 (142 rows, paste 45 at row 20, save + reload asserts rows 20–64) |
| T-04-172 (04-47) | Tampering | low | mitigate | CLOSED (drift note) | ui/table/use-clipboard-paste.ts:25-38 (parse failure/row mismatch -> external), :126-129 (app + computed -> ignored, never stored); sourceCurrencies used only for notice count (quote-table.tsx:1955-1964, reserves-table.tsx:1119-1128). DRIFT: since PR #85 (/qa ISSUE-003) app format also sets new-row lineKind (use-clipboard-paste.ts:41-49,108; quote-table.tsx:1915-1934) — limited to `out_of_quote` (same as UI button), server gate re-judges kind (lines.ts:895-915); register text "근거로만" is no longer literal |
| T-04-368 (04-47) | Tampering | low | mitigate | CLOSED | app/(app)/projects/[id]/quote-table.tsx:1322-1330, 1501-1503 (goToFirstIssue before send); E2E quote-table.spec.ts:1575, :1606 (server requests 0), reserves.spec.ts:346 |
| T-04-90 (04-48) | Tampering | medium | mitigate | CLOSED | domain/projects/list-view.ts:157-187 (first value, UUID shape + team membership, year 2000–2100); domain/projects/index.ts:365,371 normalize + parseListPeriod; list-view.ts:105 clampPage; app/(app)/projects/page.tsx:77-81 status/sort allowlists; test/integration/projects-list.test.ts:820 (C-08), :855 |
| T-04-367 (04-48) | Tampering | low | mitigate | CLOSED | app/(app)/projects/page.tsx:54-66 relative `/projects?` + URLSearchParams, year from reconcileListYear (list-view.ts:230-237: 4-digit or `all`); test/unit/domain/project-list-view.test.ts:441 idempotence |
| T-04-335 (04-49) | Tampering | medium | mitigate | CLOSED | ui/table/save-lock.ts:19, Table.tsx:208, use-grid-keyboard.ts:195 (isGridActionAllowed); period-field.tsx:104, pre-estimate-field.tsx:189,220 readOnly; quote-table.tsx:1501 savingRef; E2E test/e2e/ledger-save-flow.spec.ts:106-195 (one held request) |
| T-04-336 (04-49) | Elevation of Privilege | low | accept | CLOSED (accepted) | Width-hidden edit controls are display only; rights/cell stage judged server-side (04-12) regardless of width. |
| T-04-371 (04-50) | Tampering | high | mitigate | CLOSED | scripts/rollback.sh:124-157 (latest `-- rollback-floor:` file -> adding commit; reject no SHA / unknown SHA / non-descendant before update-traffic, exit 1); deploy.sh:571 auto path calls rollback.sh; markers 0012:1, 0015:1; test/unit/deploy/rollback-sh.test.ts:178-280 (6 cases) |
| T-04-317 (04-50) | Elevation of Privilege | high | mitigate | CLOSED | .github/workflows/deploy.yml:59-67 (staging) and :93-101 (production) ref-guard first step, env REF, exit 1 if != refs/heads/main; auth at :71,:105 after; test/unit/deploy/workflows.test.ts:130,147 |
| T-04-372 (04-50) | Denial of Service | medium | accept | CLOSED (accepted) | Deploy window (migrate -> seed -> deploy_service, minutes) where old revision runs on new schema; fact recorded in docs/design/DECISIONS.md:603; handling (prod promote timing via workflow_dispatch) awaiting user decision before bundle ②/③ /ship; rollback side covered by T-04-371. |
| T-04-380 (04-51) | Tampering | medium | mitigate | CLOSED | domain/document-numbering/index.ts:141-153 assertSeqStartNotLowered (counter row lock, reject lower than current when issued>=1) used by settings save :163-182 and import domain/settings/export.ts:146; test/integration/document-numbering.test.ts:118-360 |
| T-04-381 (04-52) | Tampering | medium | mitigate | CLOSED | test/e2e/mobile-projects-error.spec.ts:23-54 (restore twice incl. finally, re-read assert); playwright.config.ts:101-104 (mobile-375 depends on desktop, workers 1), :7 erp_test default; test/e2e/global-setup.ts:41-42 rejects non-_test DB |
| T-04-382 (04-52) | Elevation of Privilege | medium | mitigate | CLOSED | app/(app)/projects/[id]/revenue-section.tsx:241 `canWriteEntries && editableWidth`; server gate domain/revenue/index.ts:397-399,414 unchanged; E2E revenue-section.spec.ts:450-451 (PM read table) |
| T-04-383 (04-52) | Information Disclosure | low | accept | CLOSED (accepted) | Width is not an exposure decision; issued/paid table exposure decided by server DTO key absence (D-85), outside fix scope. |
| T-04-384 (04-52) | Repudiation | low | accept | CLOSED (accepted) | Error-boundary induction only in erp_test local/CI prod builds; error.tsx shows digest only (Next default). |
| T-04-391 (04-53) | Denial of Service | high | mitigate | CLOSED | domain/projects/auto-transition.ts:5 `import "@/domain/rules/register"`; test/unit/domain/auto-settle-gate-registration.test.ts:1-11 (imports only gate + auto-transition) |
| T-04-392 (04-53) | Tampering | medium | mitigate | CLOSED | auto-transition.ts:31-44 allowsAutoSettle (single gate helper) used at :91 and :152; negative grep `endDate (<\|>=\|>\|<=) \|status !== AUTO_SETTLE` = 0 hits; test/integration/project-auto-settlement.test.ts:517-594 (g1)-(g4) |
| T-04-393 (04-53) | Denial of Service | medium | mitigate | CLOSED | repositories/projects.ts:483-501 lockAutoSettleCandidates `.for("update", { skipLocked: true })`, WHERE unchanged; tests project-auto-settlement.test.ts:126 (b), :335 (i) |
| T-04-394 (04-53) | Repudiation | low | mitigate | CLOSED | auto-transition.ts:97-110 recordAction(SYSTEM_VIEWER, detail from/to/trigger/effectiveOn, {tx}); tests project-auto-settlement.test.ts:142 (c), :189 (e2), :212 (e3), :370 (j) |
| T-04-395 (04-53) | Elevation of Privilege | low | accept | CLOSED (accepted) | System-actor date transition has no permission fact; human transitions still go through `project.transition` (menu + team scope); domain/permissions/ unchanged. |

---

## Accepted Risks Log

> 「계획 수락」 = 계획 게이트(/plan-eng-review 등)를 통과한 PLAN의 `<threat_model>`이 disposition accept로 정한 것. 근거 원문은 위 등록부 Evidence 열.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-07 | 한 칸 편집만 다루는 04-01 범위, 본문 한도는 04-04로 넘김(뒤에 T-04-22 `lib/actions/client.ts:26-30`로 완화) | 계획 수락(04-01) | 2026-09 |
| AR-04-02 | T-04-24 | 10~30명 내부 시스템, 저장되는 초안은 본인이 방금 입력한 값 — 저장 성공·「버림」 때 지움 | 계획 수락(04-04) | 2026-09 |
| AR-04-03 | T-04-33 | p99 500ms는 실데이터 규모에서만 의미 — 측정은 Phase 9로 이월(사용자 결정) | 계획 수락(04-05) · 사용자 결정 | 2026-09 |
| AR-04-04 | T-04-46 | 거래처당 수십~수백 행, 잠금은 그 거래처 행 하나 | 계획 수락(04-07) | 2026-09 |
| AR-04-05 | T-04-49 (04-08) | 폼은 Ctrl+Enter·Esc만 가로챔, 표 조합 차단은 표 포커스 안 | 계획 수락(04-08) | 2026-09 |
| AR-04-06 | T-04-53 | 표시 서식은 이미 받은 값만 바꿈 — 공개 판정과 무관 | 계획 수락(04-09) | 2026-09 |
| AR-04-07 | T-04-160 | 정수 원화 컬럼 넘침은 INSERT 실패로 드러남 — 뒤에 0016 bigint + `KRW_COLUMN_MAX`로 대체 | 계획 수락(04-09) | 2026-09 |
| AR-04-08 | T-04-76 | 복사 줄 수는 차수당 상한 300(04-26)으로 묶이고 한 트랜잭션 | 계획 수락 | 2026-09 |
| AR-04-09 | T-04-85c | 1024px 미만 보기 전용·저장 잠금은 편집 손실 방지 UI, 권한은 서버(saveRevenue) | 계획 수락 | 2026-09 |
| AR-04-10 | T-04-370 | 합계·목록 두 문장 사이 자동 정산으로 잠깐 어긋날 수 있음 — 새로 고침으로 정정, 공유 스냅샷은 04-32 풀 규칙과 충돌 | 계획 수락 | 2026-09 |
| AR-04-11 | T-04-96 | columnStep은 이미 받은 금액으로만 계산하는 표시 힌트 | 계획 수락 | 2026-09 |
| AR-04-12 | T-04-98 | Ctrl+C는 그 사람에게 이미 그려진 열만 복사 | 계획 수락 | 2026-09 |
| AR-04-13 | T-04-99 | 차수당 서버 상한 300줄, 페이지는 클라이언트 배열 자르기 | 계획 수락 | 2026-09 |
| AR-04-14 | T-04-66b | 거래처·세목 참조 목록은 금액 없음 — 조정 권한자에게 줘도 새 노출 없음 | 계획 수락 | 2026-09 |
| AR-04-15 | T-04-71d | 복사는 사용자 행동, 내용은 이미 보이는 DTO 투영 + 본인 입력 | 계획 수락 | 2026-09 |
| AR-04-16 | T-04-49 (04-2x 표) | 앱이 쓰는 세 조합만 차단, 셀 편집 중 복사·붙여넣기·전체 선택은 기본 동작 | 계획 수락 | 2026-09 |
| AR-04-17 | T-04-208 | 잠금은 프로젝트 행 하나, 300줄 상한 안 짧은 쓰기, 같은 잠금 트랜잭션 안 사전 판정 | 계획 수락(04-40) | 2026-09 |
| AR-04-18 | T-04-86 | 배포 창: migrate Job이 새 리비전보다 먼저 — 묶음 ③ 배포 중 몇 분 오류. 업무 시간 밖 승격, 몇 분 오류 수용(STATE.md:218) · 롤백은 T-04-371 하한 | 사용자 결정(2026-09-24 세션 H) | 2026-09-24 |
| AR-04-19 | T-04-372 | 배포 창(migrate → seed → deploy_service 몇 분) 옛 리비전이 새 스키마에서 동작 — 같은 결정(STATE.md:218, DECISIONS.md:603) | 사용자 결정(2026-09-24 세션 H) | 2026-09-24 |
| AR-04-20 | T-04-363 | 거부 문구는 고정 서버 문구, React 텍스트 노드로만 출력 | 계획 수락(04-46) | 2026-09 |
| AR-04-21 | T-04-336 | 폭에 따라 숨긴 편집 컨트롤은 표시만, 권한·셀 단계는 서버 판정(04-12) | 계획 수락(04-49) | 2026-09 |
| AR-04-22 | T-04-383 | 폭은 노출 판정이 아님 — 발행/입금 노출은 서버 DTO 키 유무(D-85) | 계획 수락(04-52) | 2026-09 |
| AR-04-23 | T-04-384 | 오류 경계 유도는 erp_test 로컬·CI 빌드에서만, error.tsx는 digest만 표시 | 계획 수락(04-52) | 2026-09 |
| AR-04-24 | T-04-395 | 시스템 행위자의 날짜 전환은 권한 사실 없음 — 사람 전환은 `project.transition` 그대로, domain/permissions/ 변경 없음 | 계획 수락(04-53) | 2026-09 |
| AR-04-25 | T-04-318 | 04-31 (C)(D) 실제 엑셀·MS 입력기 사람 확인 대신 자동 테스트로 갈음(STATE.md:299 · 04-VERIFICATION.md:295) — 엑셀 붙여넣기는 캡처 재생으로 판정 | 사용자 결정 | 2026-09-29 |

*Accepted risks do not resurface in future audit runs.*

---

## 감사 메모 (비차단 — 위협 아님)

- T-04-09: 발행 매출액은 D-85(04-16) 사용자 결정으로 기획 PM에게 기본 공개 — 의도된 변경. 입금액은 여전히 기본 비공개, DTO 필드명 테스트 `revenue-entries.test.ts:147`.
- T-04-28: 계획의 「팀장 범위 합계」 테스트는 대상 없음 — 프로젝트 읽기 범위가 all/none뿐(`domain/permissions/scope-for.ts:11`). 목록·합계가 같은 필터(`repositories/projects.ts:150-165`)를 쓰고 테스트가 일치를 확인.
- T-04-172: 앱 클립보드 형식이 PR #85(/qa ISSUE-003) 이후 새로 붙인 행의 종류도 정함(`ui/table/use-clipboard-paste.ts:41-49,108`) — 위조해도 UI 버튼으로 가능한 `out_of_quote`만 되고 서버 게이트(`domain/quotes/lines.ts:895-915`)가 종류를 다시 검사. 계산 열 값은 여전히 저장 안 됨. 등록부 문구가 「경고·계산 열 판단에만」으로 좁음.
- T-04-210: 04-40(DoS, 견적 금액 상한, medium)과 04-41(Tampering, 매출 줄 id 위조, high)이 같은 ID — 두 행 모두 유지.
- T-04-379: 0016 마이그레이션 롤백 하한 없음은 사용자 결정(DECISIONS.md:895).
- 계획의 마이그레이션 번호(0004·0005·0016)는 실제 파일 0009·0010·0018로 바뀜.
- `domain/quotes/lines.ts:570` `revisionId`가 `z.string().min(1)`(uuid 아님) — T-04-169는 프로젝트·줄 id만 uuid를 요구하며 그건 지켜짐. 파라미터화 SQL이라 최악 PG 22P02 오류.
- `linkedDocumentsByLine`(`lines.ts:248-253`) 빈 반환 · `quote.customer-approval` 게이트 호출처 없음 — Phase 5 연결 예정(설계대로).
- T-04-SC: Phase 04 자체 커밋의 의존성 추가 0 — package.json을 건드린 두 커밋(fbe26a16 scripts 2개 추가 · 6b7519fa 제거)은 순증 0, pnpm-lock.yaml 변경 커밋 없음. a25d0fb0^ 대비 유일한 차이 `nodemailer 10.0.10`은 04.2-15(e33d7c61)가 main 병합(379b837d, PR #73)으로 들어온 것.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-29 | 229 | 227 | 2 (차단 1 · 비차단 1) | gsd-security-auditor(Opus) ×4 병렬 + 오케스트레이터 재확인 — 세션 01RVH7oW |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed — **T-04-31 사용자 결정 대기**
- [ ] `status: verified` set in frontmatter

**Approval:** pending
