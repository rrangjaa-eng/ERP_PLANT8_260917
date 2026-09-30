# Phase 4 gap-closure plans — /plan-eng-review (2026-09-29)

Target: `.planning/phases/04-project-quote-ledger/04-52-PLAN.md` · `.planning/phases/04-project-quote-ledger/04-53-PLAN.md` (branch `claude/gsd-verify-work-4`, plan checker passed both — 0 blockers). Reviewer: Opus (this session). No external (Codex) review — CLAUDE.md §4.

## Scope record

feature answers: none proposed (no cuts); structure: A (Original arrangement) — user answer D2 2026-09-29; accepted scope: 04-52 (tests for G-04-4 · G-04-16 · G-04-64, conditional revenue fix) + 04-53 (auto 진행→정산 via `domain/rules.gate`) as written; pending remedies: R1, R2.

## Scope Challenge findings

1. [P2] (confidence: 8/10) `04-52-PLAN.md:80` · `playwright.config.ts:76` — G-04-4 proves a 24-line error boundary (`app/(app)/projects/error.tsx`: `<ListEmpty message="프로젝트 목록 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} />`) by corrupting the shared `fx.recent_rate.USD` row, which forces `workers: 1` on the whole `mobile-375` project for good (~50 phone tests serialized, ~25 per CI shard). The CI cost is permanent; the thing proved is copy + one prop wiring. A unit render test (`test/unit/app/` already holds `projects-loading.test.ts` · `revenue-cells.test.ts`) proves the copy without touching shared state, but cannot click `retry`. → R1
2. [P2] (confidence: 8/10) `04-53-PLAN.md:8` (`wave: 32`) — the two plans sit in separate waves only because both use `erp_test`; CLAUDE.md §4 「세션 하나 = 웨이브 하나」 then means two execution sessions (plus pause/resume) for ~11 files. → R2
3. [P3] (confidence: 7/10) `repositories/projects.ts:489-497` → 04-53 `lockAutoSettleCandidates` — the candidate WHERE (status = from · end_date < todayKst · not archived) stays as a narrowing filter, so the settle condition still exists in SQL as well as in the new rule; if the rule is later broadened, SQL silently narrows it. The plan documents "WHERE ⊇ rule" in a comment and the decision table + boundary tests (a)(d) cover today's rule. No remedy proposed — record only.

## Decision ledger

### R1: G-04-4 proof method (and whether `mobile-375` gets `workers: 1`)
Finding: #1, P2, confidence 8/10, `04-52-PLAN.md:78-82` · `playwright.config.ts:76`, reviewer Opus
Plan baseline: original proposal (04-52 Task 3) — E2E `test/e2e/mobile-projects-error.spec.ts` writes `fx.recent_rate.USD = 0`, opens `/projects?new=1`, asserts copy, restores, clicks 「다시 시도」, asserts list returns; `playwright.config.ts` `mobile-375` gets `workers: 1`. Not yet approved.
Runtime evidence: `error.tsx` is 24 lines, copy + `onClick: retry` (read 2026-09-29). `test/unit/app/*.test.ts` render app components with `renderToStaticMarkup` (node env, no click). `mobile-375` has `dependencies: ["desktop"]`; files inside it run in parallel today; `mobile-320-no-overflow.spec.ts:215` also opens `/projects?new=1`. Extra CI time from serializing phone specs: unmeasured.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 G-04-4 proof | pending (E2E proposed) | E2E as planned: copy + retry click + list returns | unit render test in `test/unit/app/`: copy + button label + `tone="error"`; retry click not proved |
| R1 `mobile-375 workers: 1` | pending (proposed) | added (phone specs serial) | not added (config unchanged) |
| R2 wave/session | pending | unchanged, pending | unchanged, pending |
Question D3:
D3 — G-04-4(목록 오류 화면)를 무엇으로 증명할까요?
Project/branch/task: claude/gsd-verify-work-4, 수정 플랜 04-52 Task 3.
ELI10: 목록을 못 불러오면 「프로젝트 목록 불러오기 실패 · 다시 시도」가 보이는지 확인하는 테스트가 없습니다. 플랜은 공용 환율 설정을 일부러 망가뜨려 실제 화면을 띄우는데, 그동안 다른 폰 테스트가 겹치지 않게 폰 테스트 50개 전부를 한 줄로 세웁니다(workers: 1). 이 비용은 이 테스트 하나 때문에 CI에 영구히 남습니다. 대신 단위 테스트로 화면 글자만 확인하면 설정을 건드리지 않지만, 「다시 시도」를 눌러 목록이 돌아오는 것은 확인하지 못합니다.
Stakes if we pick wrong: A면 폰 E2E가 느려지고, B면 「다시 시도」 연결이 끊겨도 테스트가 모릅니다.
Recommendation: A because 사용자가 「테스트 추가」를 고른 목적이 실제로 오류 화면이 뜨고 복구되는지이고, 폰 직렬화 비용(샤드당 약 25건)은 이미 도는 desktop 전체에 비해 작습니다.
Completeness: A=9/10, B=6/10
Net: CI 몇 분과 「다시 시도」 연결 증거를 맞바꾸는 선택입니다.
Header: G-04-4 증명
Options:
A) E2E 그대로 (recommended)
✅ 실제 서버 오류로 화면을 띄우고 「다시 시도」로 목록이 돌아오는 것까지 확인합니다. ✅ 플랜을 고칠 필요가 없고 플랜 검사도 이미 통과했습니다. ❌ 폰 E2E 50개가 한 줄로 돌아 CI가 느려집니다(샤드당 약 25건, 정확한 시간은 안 쟀음). (human: ~2h / CC: ~15min)
B) 단위 테스트로 바꿈
✅ 공용 설정을 건드리지 않아 다른 테스트와 겹칠 위험이 없습니다. ✅ playwright.config.ts를 바꾸지 않아 CI 시간이 그대로입니다. ❌ 「다시 시도」를 눌러 목록이 돌아오는지는 증명하지 못합니다(한 줄 연결이라 타입 검사만 남음). 플랜 04-52 수정과 재검사가 필요합니다. (human: ~1h / CC: ~10min)

State: approved
Actual answer: A) E2E 그대로 (recommended) — user answer D3, 2026-09-29
Accepted scope: 04-52 Task 3 as written — E2E `test/e2e/mobile-projects-error.spec.ts` (copy + 「다시 시도」 click + list returns, shared setting restored) and `playwright.config.ts` `mobile-375` `workers: 1` (phone specs serial). No plan change.
History: none

### R2: declare 04-53's ordering after 04-52
Finding: #2, P2, confidence 8/10, `04-53-PLAN.md:8-9` (`wave: 32`, `depends_on: ["04-11", "04-20"]`), reviewer Opus (also plan-checker INFO, iteration 2)
Plan baseline: original proposal — 04-53 in wave 32 with depends_on 04-11 · 04-20; the ordering after 04-52 lives only in the wave number and a YAML comment. Two execution sessions (CLAUDE.md §4 one wave per session). Not yet approved.
Runtime evidence: both plans' tests use the single `erp_test` DB; 04-52's E2E globalSetup wipes and reseeds it (`04-53-PLAN.md:5-7`). No smaller arrangement avoids two sessions without running them in parallel against one DB (R1/D2 keep the plan structure).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R2 04-53 depends_on | 04-11 · 04-20 | 04-11 · 04-20 · 04-52 | unchanged |
| R2 wave/session count | wave 32, 2 sessions | wave 32, 2 sessions (unchanged) | wave 32, 2 sessions (unchanged) |
| R1 G-04-4 proof | approved A (D3) | approved A (fixed) | approved A (fixed) |
Question D4:
D4 — 04-53이 04-52 뒤에 돌아야 한다는 것을 플랜에 명시할까요?
Project/branch/task: claude/gsd-verify-work-4, 수정 플랜 04-53 머리.
ELI10: 두 플랜은 같은 테스트 DB를 쓰기 때문에 동시에 돌면 서로를 깹니다. 지금은 04-53을 웨이브 32에 두는 것으로만 순서를 표시했고, 의존 목록(depends_on)에는 04-52가 없습니다. 나중에 누가 웨이브를 다시 짜면 둘이 같은 웨이브로 묶여 병렬로 돌 수 있습니다. 어느 쪽이든 실행은 세션 두 번(웨이브마다 한 번)으로 같습니다.
Stakes if we pick wrong: 명시하지 않으면 재배치 때 두 플랜이 같은 DB를 동시에 써서 테스트가 무작위로 실패할 수 있습니다.
Recommendation: A because 한 줄로 순서를 구조에 박아 두고, 실행 방식은 바뀌지 않습니다.
Completeness: A=9/10, B=7/10
Net: 한 줄 편집으로 재배치 사고를 막는 선택입니다.
Header: 04-53 순서
Options:
A) depends_on에 04-52 추가 (recommended)
✅ 순서가 웨이브 번호가 아니라 의존 목록에 남아 재배치에도 유지됩니다. ✅ 플랜 한 줄 수정이고 실행 방식·세션 수는 그대로입니다. ❌ 04-53이 04-52의 산출물을 쓰지 않는데도 논리 의존처럼 보입니다(주석으로 이유를 적음). (human: ~5min / CC: ~1min)
B) 그대로 둠
✅ 플랜 검사를 통과한 상태 그대로라 추가 편집이 없습니다. ✅ 의존 목록이 실제 코드 의존(04-11 · 04-20)만 담아 읽기 쉽습니다. ❌ 누가 웨이브를 다시 짜면 두 플랜이 같은 테스트 DB를 동시에 쓸 수 있습니다. (human: 0 / CC: 0)

State: approved
Actual answer: A) depends_on에 04-52 추가 (recommended) — user answer D4, 2026-09-29
Accepted scope: `04-53-PLAN.md` frontmatter `depends_on: ["04-11", "04-20", "04-52"]` with a two-line comment that the 04-52 edge is ordering-only (shared erp_test). Wave 32 and two execution sessions unchanged.
History: none

Approval readiness: PASS — R1 (D3, A) · R2 (D4, A). Scope record D2 (A). No other accepted remedies.

## Review sections

### 1. Architecture — No new issues
04-53 keeps the lock set equal to the old sub-select (same WHERE, `FOR UPDATE SKIP LOCKED`) and updates only rows the same tx holds; the rule is pure, so no pool call happens under the lock (`docs/ARCHITECTURE.md` §4-8 (3)). Security: system actor, no permission facts, no risk path touched. Scope finding #3 (SQL narrowing still mirrors the rule) stays record-only.

```
applyAutoSettlement(projectIds?)            loadProjectForGate(viewer, id, {tx})
  └─ withTransaction                          └─ lockProjectForWrite(id, tx)
       ├─ lockAutoSettleCandidates (SKIP LOCKED,     ├─ afterLock?
       │    WHERE = narrowing only)                  ├─ decide(row) ──┐
       ├─ for each row: decide(row) ──┐              │   deny → return row
       ├─ settleProjectsByIds(allowed)│              │   allow → updateStatus → log (same tx)
       └─ recordAction per row (tx)   │              └─ endDate null after allow → throw (fail-closed)
  catch → log + [] (fail-open)        ▼
                          gate(row, "project.auto-settle", ctx)   ← register.ts (single decision point)
```

### 2. Code quality — No new issues
One shared helper inside `auto-transition.ts` for both entry points; no extraction across files proposed (one caller file). 04-52 adds no product code on branch G.

### 3. Tests
```
CODE PATHS                                              USER FLOWS
[+] 04-53 auto-transition                               [+] 매출 입력 중 폭 전환 (G-04-64)
  ├── read entry allow   [★★★ PLANNED] (g1)                ├── [★★★ PLANNED] (A) 기존 줄 1280→1000→375→1280
  ├── read entry deny    [★★★ PLANNED] (g2)                ├── [★★★ PLANNED] (B) 새 발행·입금 줄 → 저장 → DB
  ├── write entry allow  [★★★ PLANNED] (g3)                └── [★★  PLANNED] (C) 타이핑 도중 전환 [→E2E]
  ├── write entry deny   [★★★ PLANNED] (g4)             [+] 목록 오류 경계 (G-04-4)
  ├── rule table         [★★★ PLANNED] 1 allow · 9+ deny   └── [★★★ PLANNED] 오류 → 되돌림 → 다시 시도 → 목록 [→E2E]
  ├── self-registration  [★★  PLANNED] + mutation       [+] Select 오류 우선 (G-04-16)
  └── behaviour kept     [★★★ TESTED] 22 existing           └── [★★★ PLANNED] 4 unit (비제어·제어 × 오류 유무)
REGRESSION: existing project-auto-settlement 22 + 6 related integration specs (CRITICAL — behaviour unchanged)
COVERAGE: all planned paths have a named test · GAPS: 0 (finding #3 SQL⊇rule drift: record-only)
```
Test plan artifact: not persisted to `~/.gstack` (ephemeral container); this section is the record.

### 4. Performance — No new issues
List path locks at most the page's ids (≤50) and runs a pure JS gate per row; the Phase 7 job path has the same lock footprint as before.

## Outside Voice
Unavailable — CLAUDE.md §4 forbids Codex/external review; native fallback not run (no TaskOutput tool in this session). Logged `outside_status: unavailable`.

## NOT in scope
- DR-P4-02 (375 sort header 44px) — deferred to Phase 04.6 by user decision.
- G-04-64 edge cases (`-` alone, half date, rejection line, focus loss) — recorded in 04-52 SUMMARY as awaiting user judgment.
- A test proving the SQL candidate set ⊇ rule (finding #3) — record-only.

## What already exists
`domain/rules/gate.ts` + `register.ts` (rule pattern, `project.transition` precedent) · `status.ts:6-7` self-registration import · `project-period.test.ts:32-36` gate spy pattern · `settings.spec.ts:122-164` shared-setting restore pattern · `test/unit/app/*` and `test/unit/ui/button.test.ts` render patterns.

## Failure modes
| Path | Realistic failure | Covered by | User sees |
|---|---|---|---|
| read entry | rule not registered in a job-only import graph → gate throws → fail-open swallows | self-registration test + mutation | silent stop without test — covered |
| write entry | allow with null endDate | explicit throw (fail-closed) | save error, tx rolled back |
| G-04-4 E2E | bad setting leaks to another spec | `workers: 1` + desktop dependency + double restore | n/a (test infra) |
Critical gaps: 0.

## Worktree parallelization strategy
Sequential implementation, no parallelization opportunity (both plans share erp_test; 04-53 depends_on 04-52).

## Implementation Tasks
- [ ] **T1 (P2, human: ~5min / CC: ~1min)** — 04-53 frontmatter — declare ordering after 04-52 — DONE in this review (`depends_on` + comment)
  - Surfaced by: Scope Challenge #2 — `04-53-PLAN.md:8-9`
  - Files: `.planning/phases/04-project-quote-ledger/04-53-PLAN.md`
  - Verify: `frontmatter.validate --schema plan-gap-closure` valid
_No new tasks from Architecture, Code Quality, Tests, Performance._

## Unresolved decisions
None.

## Completion summary
- Step 0: Scope Challenge — scope accepted as-is (D2 A)
- Architecture Review: 0 issues found
- Code Quality Review: 0 issues found
- Test Review: diagram produced, 0 gaps identified
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, unavailable (CLAUDE.md forbids external review; no native bounded-wait tool)
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: 2/2 (R1 A, R2 A)

## Suppressed findings
- (confidence 5/10) 04-52 (C) typing-while-resizing may be timing-sensitive in CI; mitigated by `expect.poll` and recorder-equality assertion.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex (auto) | Independent 2nd opinion | 1 | unavailable | not run (CLAUDE.md forbids external review) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (resolved) | 3 issues, 0 critical gaps — R1/R2 approved, #3 record-only |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex · plan-review · unavailable · no findings.
- **VERDICT:** ENG reviewed — all findings dispositioned (R1 keep E2E, R2 depends_on added, #3 record-only); ready to implement.

NO UNRESOLVED DECISIONS
