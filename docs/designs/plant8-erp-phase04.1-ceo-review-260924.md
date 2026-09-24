# Phase 04.1 CEO 리뷰 (plan-ceo-review) — 2026-09-24

- 대상: `.planning/phases/04.1-approvals-leave/` 플랜 7개(04.1-01~07, 직렬 체인 01→03→02→04→05→06→07) · 브랜치 `claude/phase-04.1-plan-1iqtwe` · HEAD `eefaa57`
- 모드: HOLD SCOPE(범위는 사용자가 머지한 PR #49의 ROADMAP 04.1) · 깊이: 구현 준비 · 자동 결정(스레드 진행 중 사용자 부재, 사용자 선택이 필요한 것은 카드)
- Outside Voice: **미실행.** 이 세션의 `codex`는 인증이 없다(`CODEX_MODE: not_authed`). 사용자 지시(2026-09-24 10:10·10:10:45)로 Codex를 Claude 하위 에이전트로 대체하지 않는다. Codex 검토는 인증된 새 세션이 같은 브랜치에서 계획 문서 전체에 대해 돌린다.

## 요약

범위를 바꾸는 항목은 없다. 치명 공백 둘: (1) 관리자가 결재 단계를 모두 끄거나 팀장이 기안하고 2~4단을 끈 경우 **결재자 0명으로 최종 승인**되는 경로(CEO-1, 입력 §2 「결재 없이 통과하는 문서는 없다」 위반), (2) 「오늘」·회계연도·번호 연도가 UTC로 계산되어 한국 시간 0~9시에 조용히 틀린다(CEO-11). 나머지 21건은 경고다. 사용자 선택 셋(CEO-5·10·20) 가운데 CEO-5는 카드로 물었고, CEO-10·20은 기본값을 적고 배포 때 다시 묻는다.

## 발견과 결정

| ID | 심각도 | 플랜 | 발견 | 결정 |
|---|---|---|---|---|
| CEO-1 | 치명 | 01 T3 | 결재자 0명으로 최종 승인되는 경로 | 수용: 차수 끝까지 승인 0건이면 대표 폴백(대표가 기안자면 본인 승인, 대표 없으면 제출 거부) + 단위 4·통합 1 |
| CEO-2 | 경고 | 01·02 | 트랜잭션 안에서 전역 풀 조회(04-32 §4-8 규약 위반, 풀 고갈) | 수용: 설정·조직 스냅숏·권한은 트랜잭션 전에 읽고, 안에서는 tx 리포지토리만, 번호 할당은 마지막 |
| CEO-3 | 경고 | 01·02·04·05 | 문서 종류 등록이 side-effect import 순서에 기댐 | 수용: `app/(app)/document-kinds.ts` 한 곳 + 가드 단위 테스트 |
| CEO-4 | 경고 | 03·05 | `domain/leave/index.ts` ↔ `balance-service.ts` 순환 import | 수용: `domain/leave/access.ts`로 노출 규칙 분리 |
| CEO-5 | 경고 | 01 T3 | 한 사람이 같은 차수에서 두 단계를 승인 | **사용자 카드**(기본값 A: 이번 차수 승인자는 뒤 단계 후보에서 제외, 비면 빈 자리) |
| CEO-6 | 경고 | 01·02 | 승인·회수 판정/쓰기 순서 미정 → 진 쪽이 틀린 문구·원시 오류 | 수용: 버전 → 종결 → 후보 → UPDATE 먼저 → 단계 기록 순서 고정 + 폴백 경합·중복 재제출 테스트 |
| CEO-7 | 경고 | 01 | 3단 `org_unit_id` 설정 없으면 모든 신청이 원시 오류 | 수용: 없으면 ""로 읽어 빈 자리 처리 + 단위·통합 |
| CEO-8 | 경고 | 01·02 | 비후보 승인·반려 거부 테스트 없음 | 수용: 거부 3종, 단계 행 0, 버전 불변 단언 |
| CEO-9 | 경고 | 03·05 | 결재자용 잔고 DTO에 입사일·퇴직일이 실릴 수 있음 | 수용: 신청용 잔고 DTO 분리 + 키 부재 단언 |
| CEO-10 | 경고 | 01 | 나중에 만든 계급은 결재·연차 정보 노출 행이 없어 결재함 빈 줄 | 기본값 A: 알려진 한계로 기록 + TODOS + 동작 기록 테스트(`roles.ts`는 손대지 않음) |
| CEO-11 | 치명 | 01·03·06 | 「오늘」·회계연도·번호 연도 UTC 계산 | 수용: `lib/dates.ts` `seoulToday()`를 04.1 전부에 사용 + 12/31 15:30Z → LV27 테스트 |
| CEO-12 | 경고 | 06 T2 | 신청 두 번 누르기 → 문서 두 개 | 수용: pending 버튼 + E2E 단언(서버 멱등키는 도입 안 함) |
| CEO-13 | 경고 | 01 | `walkRoute` 분기 과밀 | 수용: 동작 보존 도우미 분해 |
| CEO-14 | 경고 | 04 | 설정 E2E가 공유 `erp_test` 결재선을 되돌리지 않음 | 수용: finally 복원 + 별도 Playwright 프로젝트 |
| CEO-15 | 경고 | 06 | E2E 기대값이 연도·공유 픽스처에 묶임 | 수용: `seoulToday` 연도 + 전용 픽스처 사용자 |
| CEO-16 | 경고 | 01·03·07 | 「빈 DB부터」 검증이 실제로 빈 DB를 만들지 않음 | 수용: `pnpm db:reset:test` + `erp` 재생성, 07 되돌림 문구 수정 |
| CEO-17 | 경고 | 01·05 | 결재함 한 번에 노출 조회 수백 번 | 수용: 메모이즈 `visible` 주입 + `approval_steps(acted_by)` 인덱스, 20행 ≤2회 |
| CEO-18 | 경고 | 01·02 | 막힌 결재선·거부가 운영자에게 안 보임 | 수용: 구조화 로그 + 런북 한 줄 |
| CEO-19 | 경고 | 07 | Phase 4 병합 판정을 `0016_` 태그 하나로 | 수용: Phase 4 완료 + 마지막 Phase 4 태그 확인 |
| CEO-20 | 경고 | 07 | 알림·「내 차례」·입사일 없이 공개하면 첫 주 문제 | 기본값 A: 07 SUMMARY에 공개 전 점검표(전 직원 입사일 입력, 결재자 매일 확인). 공개 시점(바로 vs 04.2 알림 뒤)은 배포 때 사용자 결정 |
| CEO-21 | 경고 | 없음 | 결재 모듈 계약이 ARCHITECTURE에 없음 | 수용: `docs/ARCHITECTURE.md` §4-9 20줄 이하 |
| CEO-22 | 경고 | 문서 | 낡은 문장(UI-SPEC 「Phase 7 공휴일(EXP-11)」 등) | 수용: 04.2 공휴일 표(ADMN-11)로 정정, 부록 목록 전부 |
| CEO-23 | 경고 | UI-SPEC·UI 플랜 | 사용자가 요구한 GPT(Codex) 디자인 검토가 계획에 없음 | 부분 수용: 07 T2 Post-build에 `/design-review`와 나란히 Codex 적대적 검토 추가(실행 불가면 보고, 대체 금지). 계획 단계 Codex 검토는 인증된 새 세션이 한다 |

## 반영 지시 (다음 세션이 `/gsd-plan-phase 04.1` 수정 경로로 적용)

1. 위 표의 「수용」·「기본값」 항목을 해당 플랜의 must_haves·task·acceptance·verify에 반영한다. 세부 증거·검증 명령은 부록의 각 CEO-n과 「Implementation Tasks」 목록에 있다.
2. CEO-5는 카드 답이 오기 전까지 기본값 A로 넣고 「사용자 카드 대기 — 기본값 A」라고 적어 한 줄로 바꿀 수 있게 한다.
3. 직렬 체인·마이그레이션 예약(0017~0020, 「병렬 머지 시 drizzle _journal.json 재번호 필요」)·Deferred 구분은 그대로 둔다. 플랜당 태스크 4개 이하.
4. 반영 뒤 gsd-plan-checker로 재검증하고, 이어서 `/plan-eng-review` → `/plan-design-review`를 각각 새 세션에서 한다(세션 경계 훅 D-01).

## NOT in scope

- 지출결의 화면·문서 종류(Phase 5), 회사 대납 세율 8.8% vs 22%(Phase 5/11) — 코디네이터 지시로 범위 밖
- ADMN-04 알림 시점·대상(Phase 7/04.2), ADMN-04 세율·수식(Phase 5), 「내 차례」 [결재] 행(Phase 4 병합 뒤), 공휴일 제외 일수(04.2 ADMN-11) — ROADMAP이 다른 페이즈에 배정
- 승인된 연차 취소(관리자 조정으로 대체), 기존 직원 입사일 일괄 입력(사람별 수동), 연차 수당 금액(D-97)
- 이번 리뷰에서 거절한 확장 제안: 없음(HOLD SCOPE)

---

# 부록 — 상세 검토 원문 (Sections 1–11, 레지스트리, 도식)

## Pre-review system audit

| Check | Result |
|---|---|
| `git log --oneline -30` | Last code merges: PR #57 (skill-gate), #52 (E2E flake fixes: "reset E2E schema in one transaction", "isolate … spec on a temp role" ×2 — shared-`erp_test` E2E interference is a *recurring* defect class here), #50 04.2 insert, #53 04.3 insert. Phase 4 partially on main (0009/0010, `status_change` action type). |
| `git diff origin/main --stat` | Only `.planning/` (7 PLAN + RESEARCH/UI-SPEC/VALIDATION/PATTERNS + ROADMAP/REQUIREMENTS). |
| TODO/FIXME in touched code | None relevant in `domain/settings`, `domain/action-log`, `repositories/quote-lines.ts`, `ui/shell`. |
| `repositories/quote-lines.ts:98-131` | Confirmed `WHERE version = expected … version + 1 … RETURNING`, null = conflict. Precedent is real. |
| `domain/settings/registry.ts` | `SettingDef` has no option/label fields (plan 01 adds 3 types). `getSettingValue` historized default asOf = `dateOnly(new Date())` = **UTC date** (`toISOString`, line 46-48). Missing simple key with no default → **throws `SettingNotFoundError`** (line 88-90). `setSettingValue`/`addHistorizedValue` names confirmed. |
| `domain/action-log/record.ts` | `document_submit/approve/reject/withdraw` already in `CORE_ACTION_TYPES` (no edit needed — matches plan). They are *optional* types (settable off via `action_log.optional_types`, default all on). No `tx` param yet — Phase 4 **04-32** adds `deps.tx` (see CEO-2). |
| `domain/org/index.ts:188` | `teamAtDate` exists; ARCHITECTURE §4-3: returns `null` when no assignment. |
| `domain/permissions/roles.ts:23` | `role-ceo` id confirmed. `createRole` (line 98) does **not** seed visibility rows. |
| `domain/permissions/visible.ts` | No row → `false` (hidden). `project.ts` calls `visible()` **per field per row** (N+1). |
| `test/integration/leak-scan.test.ts` | Side-effect `actions.registry` imports end at line 36 — append-only pattern viable. |
| `test/integration/setup.ts` | Truncates every table in the schema barrel + reseeds before each test (new tables covered automatically). `fileParallelism: false`. |
| `test/integration/global-setup.ts` | Runs drizzle `migrate()` **incrementally** on `erp_test` (no drop). |
| `scripts/dev-db.sh:77-86` | `create_db_if_missing` only — **never drops or recreates** `erp`/`erp_test`. Plans claim otherwise (CEO-16). |
| `scripts/reset-test-db.sh` | Drops/recreates `erp_test` (`pnpm db:reset:test`). `test:e2e:ci` calls it; E2E global-setup drops `public`+`drizzle` schemas. |
| `db/migrations/meta/_journal.json` | 11 entries idx 0–10, `when` strictly increasing. |
| `node_modules/drizzle-orm/pg-core/dialect.js:57-62` | Confirmed: applies a migration only if `lastDb.created_at < migration.folderMillis` — older-`when` migrations are silently skipped. (`scripts/migrate-runner.ts:54` only *calls* `migrate()`; plan 01 read_first misattributes the skip to the runner — cosmetic.) |
| `playwright.config.ts:50` | `fullyParallel: false` but `workers` unset → multiple **files** run in parallel workers against one `erp_test`. mobile-375 depends on desktop. |
| `ui/shell/role-menu.ts` | Top bar has static `결재` link; bottom tab `결재` for ceo/division-head/team-lead/sysadmin; PMs reach it via 더보기 (`BottomTabs.tsx:45`). Entry point exists for all approvers. |
| Dockerfile / deploy.sh | No `TZ` set → Cloud Run process is UTC. Deploy order: migrate job → **seed job (every deploy)** → service. |
| `DB_POOL_MAX` | default **5** (`lib/env.ts:54`). |

---

## Current scope (Step 0E handoff, HOLD SCOPE)

- **Mode:** HOLD SCOPE — scope fixed by ROADMAP "### Phase 04.1" (user merged PR #49, user decision 2026-09-24 to run parallel with Phase 4). Rationale carried from orchestrator Step 0: the phase is a foundation (approval engine + leave) that Phase 5 extends; expansion would collide with Phase 4/04.2/04.3 parallel work.
- **Accepted scope:** EXP-03, EXP-04, EXP-05, LEAV-01, ADMN-04 (결재 부분) via plans 01–07; success criteria 1–5 as written in ROADMAP.
- **Deferred (settled, 04.1-07 probe_fallback):** (a) 지출결의 화면·문서 종류 → Phase 5; 회사 대납 세율 8.8% vs 22% → Phase 5/11. (b) ADMN-04 알림 → Phase 7/04.2; ADMN-04 세율·수식 → Phase 5; 「내 차례」 [결재] 행 → Phase 4 병합 뒤; 공휴일 제외 → 04.2 (ADMN-11).
- **Ledger:** no scope answers pending. All findings below are repairs to meet stated criteria/invariants, or hygiene; four are flagged **NEEDS USER DECISION**.

---

## Section 1: Architecture Review

### System architecture (new components ← existing)

```
                        ┌──────────────── app/(app) ─────────────────────────────────┐
  phone/PC ──RSC/SA──►  │ /leave  /leave/new  /leave/[id]  /approvals  /admin/settings│
                        │ /admin/people/[id] (leave-section)   ui/shell role-menu     │
                        │ actions.ts + actions.registry.ts (authedActionClient)        │
                        └───────┬───────────────────────┬──────────────────────────────┘
                 side-effect    │ import "@/domain/leave"│ (registers kind — CEO-3)
                                ▼                       ▼
   ┌──────────── domain/leave ─────────────┐   ┌──────── domain/approvals ─────────────┐
   │ index.ts  registerDocumentKind(leave) │──►│ kinds.ts   registry (Map)             │
   │   submitLeave/getLeave/listMyLeave    │   │ route.ts   nextStep·resolveHolders·   │
   │   loadDetail (05) ──► balance-service │   │            walkRoute (PURE)           │
   │ resubmit.ts (02)                      │   │ index.ts   submit/approve/reject/     │
   │ days.ts (PURE)  balance.ts (PURE)     │   │            withdraw/resubmit/preview/ │
   │ balance-service.ts ──► index.getLeave │   │            listMyInbox/getApprovalView│
   │   ▲ CYCLE (CEO-4)                     │   │ conflict-message.ts  settings-warnings│
   └───┬───────────────────────────────────┘   └───┬─────────────┬─────────────────────┘
       │                                           │             │ (no import of leave)
       ▼                                           ▼             ▼
  domain/settings/registry (17+5+1 keys)   domain/document-numbering   domain/action-log.recordAction
  domain/people (setHireDate…)             domain/permissions project()/visible()/can()
       │                                           │
       ▼                                           ▼
  repositories/: approvals · leave-requests · leave-adjustments · leave-usage ·
                 org-snapshot(listOrgSnapshot — 1 query) · users(+2 cols) · permissions(+insertVisibilityIfAbsent)
       │
       ▼
  PostgreSQL: approval_instances(version) · approval_routes(round) · approval_steps(role×scope, acted_by)
              leave_requests(days_quarters) · leave_adjustments(append-only) · users.hire_date/resignation_date
```

Coupling before → after: before, `domain/*` modules only knew org/permissions/settings. After, `domain/approvals` is a hub that knows *nothing* about leave (enforced by grep + import-cycles test), `domain/leave` depends on approvals (one-way). Justified. New *runtime* coupling: approvals behavior depends on registration side-effects happening before use (CEO-3).

### Findings

**CEO-1 — CRITICAL GAP — 04.1-01 (Task 3) — 결재 없이 최종 승인되는 경로가 규칙에 남아 있다**
- Evidence: 04.1-01 truth line 96 "결재 없이 최종 승인되는 문서는 없다". But the fallback trigger in Task 3 ② (line 348) is "진행 위치에서 **남은 단계가 있는데** 전부 빈 자리면 폴백", and "자기 승인 `skip`으로 통과한 단계는 빈 자리가 아니다(「통과」로 센다)". ADMN-04 lets the admin turn any `stepN.enabled` off (04.1-04 truth 2).
- Failure: (a) admin disables all 4 steps → `submitDocument` stores 0 step rows → no "remaining step" → walkRoute returns 「최종」 → leave is approved at submission and deducted with no approver. (b) steps 2–4 disabled, drafter is 팀장, self-approval `skip` → step 1 passes as 「통과」 → no remaining step → final with zero approvals. Nobody sees it (no notification, not in any inbox). No test in any plan covers either case.
- Recommended remedy (PENDING): in `walkRoute`, add one rule: *reaching the end of the round with zero `approved` actions in this round → CEO fallback* (candidates = 대표 계급 재직자; if the only candidate is the drafter → 본인 승인 per 결정 4; if none → 「막힘」, and `submitDocument` rejects with the existing `대표 없음 · 관리자에게 대표 계급 확인 요청`). Unit cases in `test/unit/domain/approvals/resolve-step.test.ts`: all 4 disabled → fallback to 대표; team-lead drafter + only step 1 + skip → fallback to 대표; all disabled + drafter is 대표 → `self_approved`; all disabled + no 대표 → submit rejected. One integration case in `settings-approval-route.test.ts` (04.1-04): disable all steps via `setSettingValue` → submit → current step = 대표, status `submitted`. Failure visibility: the blocked case already surfaces the 「막힘」 copy.
- Alternatives: (B) reject submission when the round would have zero approvers (simpler, but a drafter-is-team-lead with steps 2–4 off can never file leave — worse UX). (C) do nothing — violates a stated invariant; not acceptable in HOLD SCOPE.
- Effort S · Risk low. Not a scope change (enforces the plan's own truth / 입력 §2).

**CEO-2 — WARNING — 04.1-01 ④⑤, 04.1-02 T2/T3 — 트랜잭션 경계가 Phase 4 04-32의 §4-8 규약과 어긋나고 풀 고갈 위험이 있다**
- Evidence: 04.1-01 ⑤ `submitLeave`: `withTransaction` → insert → `allocateDocumentNumber(tx)` (counter row lock) → `submitDocument(…, tx)` which calls `loadRouteConfig()` (17 × `getSettingValue`, global pool) and `listOrgSnapshot` (no tx arg in the plan) *inside* the tx. `approveDocument` reads snapshot inside the tx the same way. Phase 4 plan `04-32-PLAN.md:177` adds ARCHITECTURE §4-8 rule (3): 「잠근 트랜잭션 안에서는 전역 db(풀)를 부르지 않는다 — 설정 값·소속 팀은 트랜잭션을 열기 전에 읽는다」 and `withTransaction` gets `lock_timeout 5s`. 04.1-07's precondition requires Phase 4 (incl. 04-32) on main before 04.1 merges, so 04.1 will land violating a rule already in ARCHITECTURE. `DB_POOL_MAX` = 5.
- Failure: each submit/approve holds 1 pooled connection (+ the counter lock for submit) and needs further pool connections for settings/snapshot; ≥3 concurrent submits/approvals can exhaust a 5-connection pool and hang until the pool timeout; all leave submissions serialize behind the counter lock while 17 settings round-trips run. Post-build `/review` of the merged tree will flag the rule breach.
- Recommended remedy (PENDING): in 04.1-01 ④⑤ and 04.1-02 ① state the order explicitly: read `loadRouteConfig()`, `listOrgSnapshot(asOf)`, `can()` and the drafter's team **before** `withTransaction`; inside the tx call only tx-bound repository functions (instance/step/route/leave rows, `allocateDocumentNumber(tx)` last); `project()` and `recordAction` after commit (switch to `recordAction(…, {tx})` only if 04-32 is on main at execution time — 04.1-07 ③ merge note). Verification: add to `approvals-concurrency.test.ts` a case with 6 concurrent `submitLeave` calls under the default pool that all finish (no hang) — and a grep acceptance that `domain/approvals/index.ts` passes `tx` to every repository call inside `withTransaction`.
- Alternatives: (B) pass `tx` into `listOrgSnapshot` and a new tx-aware settings read — keeps reads inside but still violates 04-32's "settings before tx" rule. (C) do nothing — acceptable at 30 users but the merged tree breaks an ARCHITECTURE rule.
- Effort S · Risk low.

**CEO-3 — WARNING — 04.1-01 ④, 02 ⑤, 04 ③, 05 ③ — 문서 종류 등록이 side-effect import 순서에 기대고 있다**
- Evidence: `getDocumentKind` throws when unregistered (04.1-01 ④). Registration happens only when `domain/leave/index.ts` is loaded. Plans add `import "@/domain/leave"` to `approvals/page.tsx` (02 ⑤) and `admin/settings/page.tsx` (04 ③) only. `resubmitLeave` lives in `domain/leave/resubmit.ts`, deliberately *not* wired to `index.ts` (02 T2 ②), and calls `resubmitDocument` → `loadRouteConfig` via the kind. `approveAction` needs kind data for the toast (`2일 차감`). The import-cycles test regex (`test/unit/import-cycles.test.ts`, `from "…"` only) doesn't even see side-effect imports.
- Failure: on a cold Cloud Run instance whose first request is a route/action graph that lacks the side-effect import, the user gets a generic error ("처리하지 못했습니다" via `handleServerError`) for resubmit/approve; it passes locally because dev keeps modules warm.
- Recommended remedy (PENDING): one file `app/(app)/document-kinds.ts` containing only `import "@/domain/leave";` (Phase 5 adds its line), imported by every `app/` file that calls `domain/approvals` (approvals page/actions, leave pages/actions, settings page); `domain/leave/resubmit.ts` imports `./index` for the same guarantee. Add a unit guard modeled on `test/unit/page-auth-guard.test.ts`: every `app/**` file importing `@/domain/approvals` or `@/domain/leave/resubmit` also imports `document-kinds`.
- Alternatives: (B) `getDocumentKind` lazily `await import("@/domain/leave")` — approvals would then name leave (breaks the no-hardcode prohibition). (C) do nothing — rely on each page's import (works today, fragile for Phase 5).
- Effort S · Risk low.

**CEO-4 — WARNING — 04.1-03 ⑤ + 04.1-05 ③ — `domain/leave/index.ts` ↔ `balance-service.ts` 순환 import가 예정되어 있다**
- Evidence: 03 ⑤ `getLeaveBalanceForRequest` "04.1-01 `getLeave`의 보임 규칙 재사용" (getLeave is in `domain/leave/index.ts`); 05 ③ makes `domain/leave/index.ts` implement `loadDetail` calling `getLeaveBalanceForRequest`. 05 Task 1 verify runs `import-cycles.test.ts` — it will go red mid-plan-05. Runtime cycles kill the seed/account Cloud Run Jobs (test header comment) if a CLI path ever pulls `domain/leave`.
- Recommended remedy (PENDING): in 04.1-01 (or 03 at the latest) put the document visibility rule in `domain/leave/access.ts` (`canSeeLeaveDocument(viewer, leaveRow, instanceView)`), imported by both `index.ts` and `balance-service.ts`. Acceptance: `pnpm vitest run --project unit test/unit/import-cycles.test.ts` green at the end of 04.1-03 and 04.1-05.
- Alternatives: (B) dynamic `await import("./balance-service")` inside `loadDetail`. (C) do nothing — executor discovers it in 05 and refactors under time pressure.
- Effort S · Risk low.

**CEO-5 — WARNING — NEEDS USER DECISION — 04.1-01 Task 3 — 한 사람이 같은 차수에서 두 단계를 승인할 수 있다**
- Evidence: 3단 = 경영관리본부 아래 팀 소속 누구나, 계급 조건 없음 (결정 1). Prior-approver exclusion exists only for the 대표 폴백 (계획 가정 3, line 212). For a 경영관리팀 drafter, 경영관리팀 팀장 approves 1단 and is again a 3단 candidate; a 대표 who has a 경영관리팀 membership appears at 3단 and 4단.
- Failure: the same person sees the document twice and must tap 승인 twice; the route shows their name twice. Not unsafe, but looks broken to users.
- Recommended remedy (PENDING, needs user choice): extend 계획 가정 3 to every step — candidates of a step = holders − drafter − *anyone who already approved in this round*; a step left with zero candidates is an empty seat (skip). Unit case: 경영관리팀 drafter → 3단 skipped when its only other holder approved 1단.
- Alternatives: (B) keep double approval (current plan) — explicit in UI via the route list. (C) auto-approve the repeated step on the person's first approval (records two rows from one tap).
- Effort S · Risk low. User-visible behavior → user decides.

### Data flows (four paths)

```
SUBMIT (leave)
  happy : form → zod → countLeaveQuarters → [tx: insert leave · number · route+steps] → recordAction → /leave/[id]
  nil   : kind/startDate missing → zod field error, input kept (S2 copy) ............... handled
  empty : weekend-only range → 0 quarters → "주말만" error; zero enabled steps → CEO-1 GAP
  error : settings key missing (step3 org_unit) → SettingNotFoundError → generic error → CEO-7
          no 대표 → 「막힘」 → UserFacing reject ................................. handled

APPROVE / REJECT
  happy : action(instanceId, expectedVersion) → tx: read → walkRoute → candidate? → step write → nextStep → version UPDATE → commit → log
  nil   : unknown instanceId → getApprovalView null → 404 / 지금 담당이 아님 ........... handled
  empty : reason "" / "   " / 501자 → reject refused (02 T2) ................................ handled
  error : version 0 rows → ApprovalConflictError; fallback INSERT race → 23505 → generic → CEO-6

INBOX (read)
  happy : in-progress instances × walkRoute(snapshot) → mine / processed(50) → describeDocuments → project()
  nil   : viewer has no role → visible() false → empty DTO fields ....................... CEO-10
  empty : 0 items → ListEmpty "결재할 건이 없습니다 · 연차 목록 보기" ........................ handled
  error : DB error → error.tsx "결재함을 불러오지 못했습니다 · 다시 시도" (05 T3) .............. handled

BALANCE (read, derived)
  happy : grants(annual@Y-01-01, monthly by hire date, adjustments) + usage → allocateLeave → strings
  nil   : hire_date null → 연차 정상 · "월차 계산 불가 · 입사일 없음" ............................ handled
  empty : no requests → 사용 0 ............................................................ handled
  error : leave.annual_days row missing → default 15 (historized default) .................. handled
```

### State machine (approval_instances.status)

```
            submit                 approve(not last)            approve_final
  [draft] ─────────► [submitted] ─────────────────► [in_review] ───────────────► [approved]■
                        │   │                          │  │  ▲ approve(not last) (self-loop)
                        │   └── approve_final ─────────┼──┼──┘──────────────────► [approved]■
                        │ reject                        │  │ reject
                        ├────────────────► [rejected] ◄─┘  │
                        │ withdraw                 │       │ withdraw
                        └────────────────► [withdrawn]■◄───┘
                                                   │
                        [rejected] ── resubmit (round+1, new route fixed) ──► [submitted]

  ■ terminal. Invalid transitions → InvalidTransitionError (36-cell table test, 01 T3):
    approved/withdrawn × any event; draft × approve/reject/withdraw; rejected × approve/withdraw;
    submitted/in_review × resubmit.
  Guards beyond the table: approve/reject → viewer ∈ current candidates (walkRoute, in tx);
    withdraw/resubmit → viewer = drafter; every transition → UPDATE … WHERE version = expected.
  GAP: "submit → approved with 0 approvals" is reachable through walkRoute (CEO-1) even though the
    table itself has no submit→approved edge — the engine calls approve_final on its own.
```

### Scaling, SPOF, security architecture, prod failures, rollback

- **10×/100×** (300/3 000 users): `listMyInbox` walks *every* in-progress instance per render — fine to ~1 000 open docs; first to break is `project()` N+1 (CEO-17), then the 17 settings reads per submit/preview.
- **SPOF:** (1) 대표 계급 holder — no 대표 → submissions blocked (intended, visible). (2) step-3 `org_unit_id` setting row (CEO-7). (3) document-kind registration (CEO-3). (4) single Postgres (pre-existing).
- **Security architecture (new mutations):** `submitLeaveAction` — `leave` write; `approveAction`/`rejectAction` — any session, authorized only by walkRoute candidacy in-tx; `withdraw/resubmitLeaveAction` — drafter only; `previewLeaveAction` — `leave` view, self only; admin `setHireDate/ResignationDate/addLeaveAdjustment` — `admin.people` write; settings — `admin.settings` write (unchanged). Reads: `/leave/[id]` & inbox detail — drafter/current candidate/past actor else 404.
- **Prod failure per integration point:** settings registry missing value (CEO-7, not handled); org snapshot returns no 대표 (handled: blocked copy); document counter lock contention (CEO-2); action-log write failing after commit (state committed, log lost — accepted, step rows are the second record).
- **Rollback posture:** migrations are additive (3 new tables + `leave_*` + 2 nullable `users` columns) → `scripts/rollback.sh` (previous revision) is safe in ~2 min; new rows stay and are ignored by old code. No down-migration needed.

---

## Section 2: Error & Rescue Map

```
  METHOD/CODEPATH                     | WHAT CAN GO WRONG                              | EXCEPTION CLASS
  ------------------------------------|-----------------------------------------------|-------------------------------
  submitLeaveAction → submitLeave     | invalid dates/kind/half                        | ZodError / leave validation list
                                      | step3 org_unit key has no row                  | SettingNotFoundError  ← CEO-7
                                      | no 대표 / all empty                            | ApprovalBlockedError (UserFacing)
                                      | zero enabled steps                             | none — silently final ← CEO-1
                                      | pool exhausted while in tx                     | pg pool timeout Error ← CEO-2
                                      | kind not registered (cold path)                | UnknownDocumentKind Error ← CEO-3
  approveAction → approveDocument     | stale version                                  | ApprovalConflictError (UserFacing)
                                      | viewer not candidate                           | NotCurrentHolderError (UserFacing)
                                      | stale version checked AFTER candidacy          | wrong message ← CEO-6
                                      | concurrent fallback-row INSERT                 | DrizzleQueryError 23505 ← CEO-6
                                      | final already                                  | UserFacing 「최종 승인됨 · 새로 고침」
  rejectAction → rejectDocument       | reason empty/>500                              | UserFacing (field)
                                      | same as approve                                | same
  withdrawLeaveAction                 | not drafter / approved                         | UserFacing
  resubmitLeaveAction                 | not rejected / not drafter                     | UserFacing
                                      | double resubmit → route (instance,round) dup   | 23505 ← CEO-6
  previewLeaveAction                  | same settings/snapshot errors as submit        | SettingNotFoundError ← CEO-7
  getApprovalView / listMyInbox       | role lacks approval.value visibility           | none — blank fields ← CEO-10
  addLeaveAdjustmentAction            | 0 / 0.3 / blank reason                         | UserFacing (field)
  setResignationDate                  | resign < hire                                  | UserFacing
  addHistorizedValue (year_start)     | effectiveFrom not 01-01                        | new UserFacing subclass
  recordAction (after commit)         | settings read fails                            | fail-open (logs anyway) — existing
                                      | append fails                                   | Error → generic, state already committed

  EXCEPTION CLASS               | RESCUED? | RESCUE ACTION                                 | USER SEES
  ------------------------------|----------|-----------------------------------------------|---------------------------------
  ZodError / validation list    | Y        | field errors, input kept                      | field line (S2 copy)
  ApprovalConflictError         | Y        | no retry; server-built line + 새로 고침        | "박서연이 14:01에 회수함 · 새로 고침"
  NotCurrentHolderError         | Y        | refuse                                        | "지금 담당이 아님 · 새로 고침"
  ApprovalBlockedError          | Y        | refuse submit                                 | "대표 없음 · 관리자에게 …"
  SettingNotFoundError (step3)  | N ← GAP  | should map to empty seat (CEO-7)              | generic error ← BAD
  23505 on fallback/round insert| N ← GAP  | should be prevented by UPDATE-first (CEO-6)   | generic error ← BAD
  UnknownDocumentKind           | N ← GAP  | prevent via single import (CEO-3)             | generic error ← BAD
  pg pool timeout               | N ← GAP  | prevent via reads-before-tx (CEO-2)           | generic error after wait
  Silent zero-approval final    | N ← GAP  | CEO-1 rule                                    | nothing (silent) ← CRITICAL
  Blank DTO (visibility off)    | N ← GAP  | CEO-10                                        | empty rows, cannot act
```

**CEO-6 — WARNING — 04.1-01 ④ / 04.1-02 T3 ②③ — 승인 경로의 판정 순서와 쓰기 순서가 정해지지 않아 진 쪽이 틀린 문구 또는 원시 오류를 받는다**
- Evidence: 01 ④ orders approve as "walkRoute → 후보 아니면 `지금 담당이 아님` → 최종이면 … → 단계 처리 기록(폴백이면 폴백 행 삽입) → … → version 조건 갱신". 02 T3 behavior (sequential Order B): 기안자 회수 → 결재자 version 1로 승인 → must get "…회수함 · 새로 고침". With candidacy checked first, a withdrawn instance has no candidates → "지금 담당이 아님". 02 T3 ③ allows either "step write after UPDATE" or "rollback on 0 rows" — with step-first ordering two concurrent 대표-fallback approvals both `INSERT` a fallback row → the second blocks on `UNIQUE(route_id, step_index)` and raises 23505 → `handleServerError` → generic message (not the conflict line). Same for concurrent `resubmit` (`UNIQUE(instance_id, round)`).
- Recommended remedy (PENDING): fix one order in the shared transition function (02 T2 ①): (1) read instance; if `version !== expectedVersion` → `ApprovalConflictError` built from `updated_by`/status (before any candidacy check); (2) terminal status → 「최종 승인됨」; (3) candidacy → 「지금 담당이 아님」; (4) compute outcome in memory; (5) `UPDATE approval_instances … WHERE version = expected RETURNING` **first** (row lock serializes racers; 0 rows → re-read → conflict message); (6) then step/fallback/route inserts. Tests: Order B asserts the exact 「회수함」 string (already in 02 T3); add "two 대표 fallback candidates approve concurrently → one success, other gets 「…승인함」, one fallback row" and "double resubmit → one round 2".
- Alternatives: (B) keep order, catch 23505 via `isUniqueViolation` and translate — two code paths for one race. (C) do nothing — tests written as specified will fail and the executor improvises.
- Effort S · Risk low.

**CEO-7 — WARNING — 04.1-01 ⑥⑦ — 3단 `org_unit_id` 설정 값이 없으면 모든 연차 신청이 원시 오류로 막힌다**
- Evidence: 01 ⑥ "3단 `org_unit_id`만 default 없음 — 시드가 채운다"; ⑦ seed sets it only if `findOrgUnitByName("경영관리본부")` succeeds. `getSettingValue` throws `SettingNotFoundError` for a simple key with no row and no default (`registry.ts:88-90`). The seed runs every deploy, but a renamed/archived 경영관리본부 (admin can rename org units) leaves no row on a fresh environment.
- Failure: every `/leave/new` preview and submit returns the generic error; the settings screen shows the field empty but nothing says why submissions fail.
- Recommended remedy (PENDING): `loadRouteConfig` reads that key with a local fallback — `SettingNotFoundError` → `""` (empty → 특정 부서 없음 → 빈 자리 → skip → CEO fallback), which is exactly what 04.1-04's warning already tells the admin (`부서 없음 · 이 단계는 빈 자리로 건너뜀`). Unit test: loader with a `deps.findSimpleValue` returning null for the step-3 key yields `orgUnitId: ""`; integration: delete the row → submit succeeds and route shows `— … · 담당 없음` for 3단.
- Alternatives: (B) give the key `default: ""` and make the seed *overwrite* `""` with the 경영관리본부 id (changes seed semantics, risk of clobbering an admin's deliberate `—`). (C) do nothing.
- Effort S · Risk low.

---

## Section 3: Security & Threat Model

Attack surface: 9 new server actions, 5 new routes, 3 new tables, 23 new settings keys, 2 info items, 1 menu. No new secrets, no new dependencies (verified by plans' `package.json` diff checks), no LLM, no file paths, no background jobs. Injection: Drizzle parameterized; React text rendering, `dangerouslySetInnerHTML` banned by acceptance greps. CSRF: Next default Origin check (T-04.1-15 accept) — OK. Audit: submit/approve/reject/withdraw/resubmit/hire/resign/adjust logged; adjustments append-only — OK.

| Threat | Likelihood | Impact | Mitigated by plan? |
|---|---|---|---|
| Non-candidate calls approve/reject with a guessed instanceId (IDOR) | Med | High | Mechanism yes (in-tx walkRoute); **test missing** → CEO-8 |
| Approver learns a colleague's confidential future resignation date through the balance DTO | Med | Med | **No** → CEO-9 |
| Direct URL `/leave/[id]` by unrelated user | Med | Med | Yes — 404 + E2E (02 T1) |
| Admin sets resignation date to drop an approver | Low | Med | Yes — admin-only, logged |
| Custom role with no visibility rows → approver cannot act | Med | Med | **No** → CEO-10 |
| Settings tampering by non-admin | Low | High | Yes — existing `admin.settings` write gate |
| Reason/note XSS | Low | Med | Yes — React text, grep acceptance |

**CEO-8 — WARNING — 04.1-01 T3 / 04.1-02 T2 — 비후보의 승인·반려 거부를 증명하는 테스트가 어느 behavior 목록에도 없다**
- Evidence: T-04.1-01 (01 threat table) says "통합 테스트가 비후보 승인 거부를 단언한다" and T-04.1-08 (02) repeats it, but 01 T1/T3 behavior lists and 02 T2/T3 behavior lists contain no such case (02 T3 only unit-tests the *string* 「지금 담당이 아님」). This is the core authorization of the module (결재선이 권한).
- Recommended remedy (PENDING): add to `approvals-route-fixed.test.ts` (01 T3) — the drafter, an unrelated PM, and the 대표 *before* step 4 each call `approveDocument` with the correct version → `NotCurrentHolderError`, zero step rows written, version unchanged; add the same for `rejectDocument` to `approvals-lifecycle.test.ts` (02 T2).
- Alternatives: (B) E2E only (slower, weaker). (C) do nothing — the threat register claims a test that won't exist.
- Effort S · Risk low.

**CEO-9 — WARNING — 04.1-03 ⑤ / 04.1-05 ③ — 결재자에게 가는 잔고 DTO에 퇴직일·입사일이 실릴 수 있다**
- Evidence: 03 ⑤ "04.1-01의 잔고 DTO 명세로 project() … 필드가 모자라면 dto.ts에 더한다 — 모든 필드는 `leave.value`"; `formatResignationLine` needs the resignation date, so the natural spec carries it. `getLeaveBalanceForRequest` returns the same DTO to the approver (03 T3 behavior "문서의 결재자는 그 기안자의 잔고 행을 받고"), and 05 ③ passes it into `loadDetail` → client sheet. `leave.value` is visible to all 5 roles (01 ⑦).
- Failure: a 팀장 approving a leave receives (in the RSC payload) the drafter's planned resignation date entered by HR before it is announced. Silent; no test.
- Recommended remedy (PENDING): split the spec — `LEAVE_BALANCE_ROW_DTO_SPEC` (for-request: 남음·결재 중·이번 신청·차감 예정·초과 only) vs the self/admin spec (adds hire/resignation); `getLeaveBalanceForRequest` uses the row spec. Integration assertion in `leave-balance.test.ts`: approver's DTO has no `hireDate`/`resignationDate` keys even when set.
- Alternatives: (B) new info item `leave.hr_dates` with `staffDefault: false`. (C) do nothing.
- Effort S · Risk low.

**CEO-10 — WARNING — NEEDS USER DECISION — 04.1-01 ⑦ — 나중에 만든 계급은 결재·연차 정보 노출 행이 없어 결재함이 빈 줄이 된다**
- Evidence: 01 ⑦ inserts visibility for the 5 seeded roles only; `createRole` (`domain/permissions/roles.ts:98`) adds no visibility rows; `visible()` returns false with no row; `project()` drops hidden fields. 3단 has **no role condition**, so a 경영관리팀 member with a custom role is a candidate. `domain/permissions/roles.ts` is a no-touch file for this phase.
- Failure: that person's `/approvals` shows rows with no title/instanceId/version → they cannot approve; their own `/leave` shows nothing. Pre-existing platform rule ("새 기능 정보는 기본 숨김"), but here it breaks a routing guarantee rather than hiding a number.
- Recommended remedy (PENDING, user decides): record it as a known limitation in 04.1-07 SUMMARY + a TODOS.md entry ("새 계급 만들 때 정보 노출표에서 결재 정보·연차 정보 켜기"), and add one integration test documenting the behavior. Alternatives: (B) treat `approval.value`/`leave.value` fields needed for routing (instanceId, version, allowed actions) as non-hidable — changes the D-35 visibility model; (C) seed visibility in `createRole` — touches a no-touch file (Phase 4 conflict).
- Effort S · Risk low (A).

---

## Section 4: Data Flow & Interaction Edge Cases

### Data flow with shadow paths (submit → approve → deduct)

```
 INPUT              VALIDATION                 TRANSFORM                     PERSIST                          OUTPUT
 form(kind,dates,   zod enum/date/500 ─┐       countLeaveQuarters            leave_requests(days_quarters)     /leave/[id]
 half,note) ──────► countLeaveQuarters ├─────► route cfg (17 keys, 1 read) ─► approval_instances v1            toast
                    fiscal-year guard  │       snapshot(asOf=today★)        approval_routes r1 (team/org ids)
                                       │       walkRoute → first holder     approval_steps (role×scope×target)
   shadow: nil→field err  empty→"주말만"  │  shadow: 0 steps→CEO-1  key missing→CEO-7  dup submit→2 docs (CEO-12)
           >500→zod err   wrong type→zod│          today in UTC→CEO-11  pool→CEO-2
                                       ▼
 APPROVE(instanceId,v) ─► version==v? ─► terminal? ─► candidate? ─► outcome ─► UPDATE…WHERE version=v ─► step rows ─► log
   shadow: stale v → conflict line (order CEO-6)   not candidate → 지금 담당이 아님   race → 1 winner (02 T3)
           fallback insert race → 23505 (CEO-6)     blocked → 담당 없음, nobody's inbox (CEO-18)
                                       ▼ (status approved)
 BALANCE (read-time, no write): grants(annual@Y-01-01 historized, monthly(hire_date), adjustments)
        + usage(approved) + pending(submitted/in_review) → allocateLeave(start date, earliest expiry, 월차 first)
   shadow: hire_date null → 월차 계산 불가; setting changed later → Y-01-01 asOf keeps past years;
           concurrent approvals → no lost update (derived); 2026 hire without hire_date → 15-day over-grant (CEO-20)
```
★ `today` is UTC unless fixed (CEO-11).

### Async ordering — approve ∥ withdraw on one instance

Invariant: at most one of {approve, withdraw} commits for a given `version`; no step row survives from the loser.

```
 time │ T_A approve(v1)                 │ T_W withdraw(v1)               │ approval_instances
 ─────┼─────────────────────────────────┼────────────────────────────────┼─────────────────────
  t1  │ BEGIN; read v1; candidate ok    │                                │ v1 in_review
  t2  │                                 │ BEGIN; read v1; drafter ok     │ v1
  t3  │ UPDATE … WHERE v=1 → 1 row (lock)│                               │ v2 (uncommitted)
  t4  │                                 │ UPDATE … WHERE v=1 → blocks    │
  t5  │ insert step; COMMIT             │                                │ v2 committed
  t6  │                                 │ re-eval WHERE v=1 → 0 rows →   │
      │                                 │ conflict "이수아가 14:01에 승인함"│ v2
 Reverse order (T_W wins at t3): T_A gets 0 rows → "박서연이 14:01에 회수함"; T_A wrote no step because
 step writes come after the UPDATE (CEO-6 order). With the plan's current step-first order, T_A's step
 write happens at t3' and is rolled back only because the whole tx throws — safe for approve↔withdraw,
 but the fallback INSERT variant raises 23505 instead (CEO-6).
 Mechanism: Postgres row lock + READ COMMITTED re-evaluation of the version predicate.
 Regression proof: 02 T3 two orders + 20-iteration Promise.all; add fallback-race case (CEO-6).
```

Other shared-state pairs: submit ∥ admin settings save (01 backstop: config read once — torn read across 17 keys equals an intermediate admin state; acceptable, per-field saves); approve(final) ∥ admin adjustment (derived balance — no conflict); two approvals of same user's leaves (derived — 03 T3 concurrency test).

### Interaction edge cases

| INTERACTION | EDGE CASE | HANDLED? | HOW |
|---|---|---|---|
| 연차 신청 submit | double click / two tabs | Partly | UI `pending` (UI-SPEC S2 284); no server idempotency; no test → CEO-12 |
| 연차 신청 | navigate away with input | Yes | 입력 버리기 confirm (06 T2) |
| 승인 (phone sheet) | double tap | Yes | `aria-disabled` + version conflict, E2E (05 T1) |
| 승인 | doc withdrawn meanwhile | Yes* | conflict line + 새로 고침 (*message depends on CEO-6 order) |
| 반려 | empty/whitespace/501 reason | Yes | server + `aria-disabled` |
| 결재함 | 0 / 1 / many rows | Yes | ListEmpty; group header disappears; 05 backstop |
| 결재함 | approver in 2 steps | Partly | CEO-5 |
| 결재선 | holder archived / resigned mid-flight | Yes | skip → next / 대표 (01 T3, 03 T1) |
| 결재선 | all holders gone and no 대표 | Visible to drafter only | 「담당 없음」; operators blind → CEO-18 |
| /leave year select | ?year=garbage / future | Yes | falls back to current year (06 T1) |
| 설정 | admin disables all steps | **No** | CEO-1 |
| 날짜 | 00:00–09:00 KST | **No** | CEO-11 |

**CEO-11 — CRITICAL GAP (registry rule: rescued N · test N · silent) — 01 ⑤, 03 ②⑤, 06 ③ — 「오늘」·회계연도·번호 연도가 UTC로 계산된다**
- Evidence: Cloud Run has no `TZ` (Dockerfile/deploy.sh); `getSettingValue` uses `toISOString().slice(0,10)` (`registry.ts:46`); precedent `domain/projects/index.ts:255` `new Date().getFullYear()`. The plans never define "today": snapshot `asOf` (03 ②), 퇴직일 < 오늘 (03 truth), 월차 accrual "기준일", 번호 연도 = 첫 제출 날짜의 연도 (01 가정 1), `/leave` default year (06 ③), drafter team at submission (01 ④). Only the conflict-message time is explicitly Seoul (02 가정 3). Seoul precedent exists: `domain/quotes/lines.ts:459` `timeZone: "Asia/Seoul"`.
- Failure (silent): between 00:00 and 09:00 KST — a 1 Jan submission gets an `LV25-…` number; `/leave` opens on last year; 월차 accrues 9 h late; a resigned approver remains a candidate until 09:00 the day after; a same-day 발령 is ignored. No test would notice (CI runs UTC; tests use fixed dates).
- Recommended remedy (PENDING): add `lib/dates.ts` `seoulToday(now = new Date()): string` (Intl `Asia/Seoul`, same approach as `domain/quotes/lines.ts:459`) and use it for every 04.1 `asOf`/fiscal-year/number-year/default-year computation; pass `new Date(\`${seoulToday()}T00:00:00Z\`)` when calling `getSettingValue` for historized keys. Unit test: `seoulToday(new Date("2026-12-31T15:30:00Z")) === "2027-01-01"`; integration: submit with injected clock 2026-12-31T15:30Z → number `LV27-0001`, fiscal year 2027.
- Alternatives: (B) set `TZ=Asia/Seoul` on the Cloud Run service/jobs (deploy.sh) — fixes `new Date().getFullYear()` everywhere but not `toISOString()` in the registry; infra change outside the phase. (C) do nothing — bounded, silent.
- Effort S · Risk low.

**CEO-12 — WARNING — 04.1-06 T2 — 신청 두 번 누르기가 두 문서를 만든다(서버 멱등성 없음)**
- Evidence: `submitLeave` inserts a new `leave_requests` row per call; `UNIQUE(document_kind, document_id)` doesn't dedupe separate documents. UI-SPEC S2 line 284 defines `연차 신청…` pending, but no plan behavior asserts it (05 covers only approve double-tap).
- Recommended remedy (PENDING): add to 06 T2 behavior: rapid double `Ctrl+Enter`/click on `/leave/new` → exactly one new request (spec counts via domain query); implementation uses `ui/button` `pending`. Server-side dedupe not required (duplicates are withdrawable).
- Alternatives: (B) idempotency key hidden field + unique index (schema change). (C) do nothing.
- Effort S · Risk low.

---

## Section 5: Code Quality Review

- Organization fits existing patterns: repositories take viewer first + optional `DbOrTx`; domain uses `deps?: Partial<…>` injection; DTOs via `registerDto`/`project()`; actions via `authedActionClient` + `actions.registry.ts`; settings via registry — OK.
- DRY — good: one transition function for approve/reject/withdraw/resubmit (02 T2 ①), `previewRoute` shares the submit assembler (06 T2 ①), one status→color map (`status-display.ts`), one balance-string module (03), one form in two modes (05/06). OK.
- Over-engineering: none material; `routeSettings` + `loadRouteConfig` on the kind overlap slightly (the loader could be derived from `routeSettings`), but the test-only kind needs an in-memory loader — acceptable.
- Naming: clear (`walkRoute`, `resolveHolders`, `allocateLeave`, `buildLeaveGrants`) — OK.

**CEO-13 — WARNING — 04.1-01 ③ / T3 ② — `walkRoute` 한 함수에 분기가 여섯 이상 모인다**
- Evidence: walkRoute handles processed steps, empty seat, self-approval skip vs self_approve, fallback (with prior-approver exclusion), blocked, final, display-name formatting (1/2/3+), and (after CEO-1/CEO-5) zero-approval and repeated-approver rules.
- Recommended remedy (PENDING): keep one exported `walkRoute`, but compose it from three private helpers in `route.ts`: `candidatesFor(step, snapshot, ctx)`, `advance(steps, actions, ctx)` (skip/self-approval/processed), `fallback(ctx)` (대표 · 본인 승인 · 막힘); display formatting in `describeHolders(names)`. Existing unit tables stay unchanged (behavior-preserving).
- Alternatives: (B) do nothing — the exhaustive unit tables in 01 T3 contain the risk.
- Effort S · Risk low.

---

## Section 6: Test Review

### New-item coverage map

| Item | Type | In plan? | Happy | Failure | Edge |
|---|---|---|---|---|---|
| nextStep table | Unit | 01 T3 (36 cells) | yes | invalid → throw | all cells |
| walkRoute rules | Unit | 01 T3 | yes | blocked | skip/self/fallback/archive; **missing zero-approval (CEO-1), repeated approver (CEO-5)** |
| submit→final tracer | Integration | 01 T1 | yes | — | route fixed after setting change |
| non-candidate refusal | Integration | **missing** | — | — | CEO-8 |
| reject/withdraw/resubmit | Integration | 02 T2 | yes | empty/501 reason, wrong state, non-drafter | round 2 keeps round 1 |
| concurrency | Integration | 02 T3 | — | both orders ×2, race ×20, 2 candidates, same-user double | **fallback race (CEO-6)** |
| conflict strings | Unit | 02 T3 | yes | — | 받침 |
| balance/accrual | Unit+Int | 03 T1/T3 | yes | 0/0.3/blank adj | month-end, leap, 11th, expiry, same-expiry order |
| request balance privacy | Integration | 03 T3 (null for unrelated) | yes | — | **resignation field (CEO-9)** |
| settings → new docs only | Integration+E2E | 04 T1 | yes | — | **all steps off (CEO-1)** |
| year_start rule | Unit | 04 T2 | yes | 03-01 rejected | rule-less keys unchanged |
| phone approve | E2E mobile | 05 T1 | yes | double tap | — |
| document actions | E2E | 05 T2 | yes | conflict line | 4 branches |
| a11y | E2E axe | 05 T3 | yes | — | focus return |
| /leave list, form, admin section | E2E | 06 | yes | empty reason / 0.3 | empty year; **double submit (CEO-12)** |
| journal guard | Unit | 01 T2 | yes | — | — |
| merged-tree tracer | Int+E2E | 07 T1 | yes | — | — |
| `seoulToday` | Unit | **missing** | — | — | CEO-11 |

Pyramid: many unit (route, days, balance, strings, registry), moderate integration, 9 E2E specs — healthy, slightly E2E-heavy but each spec is justified by a UI-SPEC surface.

2am-Friday test: 01 T1 tracer + 02 T3 race. Hostile QA: approve someone else's document by instanceId (CEO-8); disable all steps then submit (CEO-1). Chaos test: submit 6 leaves concurrently with pool=5 (CEO-2).

Flakiness: time-dependent assertions (CEO-15); shared `erp_test` mutation across parallel E2E files (CEO-14); `Promise.all` race asserts only "exactly one wins" — deterministic, OK.

LLM/prompt: none — N/A.

**CEO-14 — WARNING — 04.1-04 T1/T2 — 설정 E2E가 공유 `erp_test`의 전역 결재선을 바꾸고 되돌리지 않는다**
- Evidence: 04 T1 E2E "`2단 사용` 체크를 끄면 … 새로 고쳐도 꺼져 있다"; T2 E2E "`3단 특정 부서`를 `—`로 바꾸면 … 저장되어 있다". No restore step. `playwright.config.ts` runs different files in parallel workers (`workers` unset) on one `erp_test`; 02 T1 `leave-approval.spec.ts` expects 4 steps with a 3단 경영관리 approver and a `→ {본부 책임자}` toast; 05's specs likewise. Repo history shows this defect class twice already ("isolate … spec on a temp role", commits 337d9b8, 8ce0587) — but settings cannot be isolated on a temp role.
- Failure: order-dependent/flaky CI reds in `leave-approval`/`leave-document`/`mobile-leave-approval`.
- Recommended remedy (PENDING): (1) the persistence check toggles `approval_route.leave.self_approval` (no other spec drafts as a holder) instead of `2단 사용`; (2) the 3단 warning case restores the original value in `finally`; (3) put `settings-approval-route.spec.ts` in its own Playwright project that `dependencies: ["mobile-375"]` (runs after all other specs), mirroring the existing mobile-after-desktop serialization (adds `playwright.config.ts` to 04's files).
- Alternatives: (B) make every leave E2E route-agnostic (approve until final, assert patterns not names) — weaker assertions. (C) do nothing.
- Effort S · Risk low.

**CEO-15 — WARNING — 04.1-06 T1/T3 — E2E 기대값이 연도·공유 픽스처 상태에 묶여 있다**
- Evidence: 06 T1 "`2026 회계연도`", "`연차 15일 · 사용 0일 · 결재 중 0일 · 남음 15일`" for "기획 PM" (not stated as a dedicated fixture; the PM fixture drafts leave in 02/05 specs). 03/01 integration tests use fixed dates (fine).
- Failure: red from 2027-01-01 (or 00:00–09:00 KST in CI UTC boundary cases); red when another spec's leave exists for the same PM.
- Recommended remedy (PENDING): E2E computes the expected year with `seoulToday()` (CEO-11 helper) and uses a spec-dedicated user with `hire_date` null and no history.
- Alternatives: (B) freeze the clock in the app (not supported today). (C) do nothing.
- Effort S · Risk low.

**CEO-16 — WARNING — 04.1-01 T2, 03 T2, 07 T1/T2 — 「빈 DB부터」 검증 명령이 빈 DB를 만들지 않는다**
- Evidence: `scripts/dev-db.sh:77-86` only creates missing DBs; plans say "`bash scripts/dev-db.sh && pnpm db:migrate`로 빈 DB부터 전부 적용" (01 T2 ②, 03 T2 ②, 07 T1 ④) and 07 reversibility "옛 번호로 이미 적용한 로컬 개발 DB는 `bash scripts/dev-db.sh`로 다시 만들어야". Integration global-setup migrates `erp_test` incrementally; `pnpm db:migrate` targets `erp`.
- Failure: after 07 regenerates, `erp`/`erp_test` still hold the old 04.1 migrations (`created_at` newer than Phase 4's `when`) → drizzle **silently skips** Phase 4's 0011–0016 (dialect.js:57-62) and the regenerated 04.1 SQL fails with "relation already exists". Same trap whenever a migration is regenerated during 01/03 TDD. The "empty-DB apply" proof for T-04.1-37 only really happens inside `pnpm test:e2e:ci` (which resets).
- Recommended remedy (PENDING): in those verify blocks use `pnpm db:reset:test && DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp_test pnpm db:migrate` for the empty-DB proof, run integration after `pnpm db:reset:test`, and for the dev DB state a psql drop/recreate of `erp` (same form as `scripts/reset-test-db.sh`); correct the 07 reversibility sentence.
- Alternatives: (B) add a `db:reset:dev` script (new file — needs approval). (C) do nothing — failures are loud but misdiagnosed.
- Effort S · Risk low.

---

## Section 7: Performance Review

- N+1: `project()` calls `visible()` per field per row (`domain/permissions/project.ts`). `/approvals` = up to 50 processed + N mine rows × ~8 fields ≈ 400–500 visibility queries per render, plus 05's per-row `loadDetail` prefetch (getLeave + balance ≈ 5 queries each). Phase 4 04-32 adds `projectMany`/per-item memo, but only after merge.
- Memory: snapshot = ≤30 users; inbox ≤ in-progress docs + 50 — trivial.
- Indexes: `approval_steps(acted_by)` (processed list) and `leave_requests(drafter_id)` are not declared; tables are tiny (≈600 leave rows/yr) — acceptable now.
- Caching: settings route config (17 reads) per submit/preview/resubmit — acceptable at this scale; single-query read would remove the torn-read nuance.
- Slow paths (est. p99, Cloud SQL private IP ~1–2 ms/query): (1) `/approvals` render with 20 mine rows ≈ 600+ queries → ~0.8–1.5 s; (2) `previewLeaveAction` per change ≈ 17 settings + snapshot + balance (~25 queries) → ~80 ms; (3) admin person detail balance ≈ 20 queries.
- Pool pressure: see CEO-2 (pool 5).

**CEO-17 — WARNING — 04.1-01 ④ listMyInbox / 04.1-05 ④ — 결재함 한 번 그리는 데 노출 조회가 수백 번 돈다**
- Recommended remedy (PENDING): in `listMyInbox`/`listMyLeave`/`getInboxItemDetail` pass a per-request memoized `visible` through the existing `project(viewer, row, spec, { visible })` deps (or 04-32's `projectMany` if present on main at execution time); declare an index on `approval_steps(acted_by)`. Verification: integration test wraps `findVisibility` with a counter and asserts ≤ 2 calls (one per info item) for a 20-row inbox.
- Alternatives: (B) wait for 04-32 and switch at 07 merge. (C) do nothing (30 users).
- Effort S · Risk low.

---

## Section 8: Observability & Debuggability Review

- Logging: state changes → action log (good, plus step rows as second record). `handleServerError` logs only non-UserFacing errors, so conflicts/refusals/blocked routes leave no operational trace.
- Metrics/alerts/dashboards: none new; at 10–30 users an alert is overkill. Existing 5xx alert covers raw errors (CEO-6/7/3 paths).
- Debuggability 3 weeks later: "why did my leave skip 2단?" — reconstructable from stored step rows (label, role, scope target) + `acted_by` + action log detail (step index, round) — good. "Why was it stuck?" — not reconstructable (CEO-18).
- Admin tooling: no list of stuck/blocked documents; admin person detail shows balance only.
- Runbooks: none; 07 SUMMARY records deferred items only.

**CEO-18 — WARNING — 04.1-01 ④ / 04.1-02 T3 — 막힌 결재선과 결재 거부가 운영자에게 보이지 않는다**
- Evidence: 01 T3 ② "막힘 … 누구의 결재함에도 뜨지 않는다 — 관리자가 조직을 고쳐야 풀린다"; nobody but the drafter sees it. UserFacing refusals aren't logged.
- Recommended remedy (PENDING): `log.warn("approval.route_blocked", {instanceId, kind, round, stepIndex})` when walkRoute returns 「막힘」 during approve/getApprovalView/listMyInbox (once per request), and `log.info("approval.refused", {instanceId, viewerId, reason: "conflict"|"not_holder"|"final", expectedVersion, actualVersion})` in the transition function. Unit test with a `log` spy. Add a one-paragraph runbook line to 07 SUMMARY: blocked → fix 대표 계급/조직, drafter can 회수.
- Alternatives: (B) admin "막힌 결재" list screen — scope expansion (not in HOLD). (C) do nothing.
- Effort S · Risk low.

---

## Section 9: Deployment & Rollout Review

- Migration safety: 2 additive migrations regenerated into 1 at merge (07); new tables + nullable columns → no rewrites, no long locks; squawk gate — OK.
- Rollout order: deploy.sh runs migrate job → seed job (sets step-3 org unit, leave permissions, visibility) → service — correct.
- Deploy-time window: old revision + new schema → unaffected (new tables unused) — OK.
- Rollback: `scripts/rollback.sh` → previous revision (~2 min); schema stays; no data repair needed — OK.
- Environment parity: staging via promote guard; VALIDATION Manual-Only (real phone) kept as staging item (07 T2 ③) — OK.
- Smoke: existing `/api/health` smoke only; no 04.1 smoke — acceptable; staging manual check covers.

**CEO-19 — WARNING — 04.1-07 T1 precondition — Phase 4 병합 여부를 `0016_` 태그 하나로 판정한다**
- Evidence: 07 T1 verify: `tags.some(t => t.startsWith('0016_'))`. Phase 4's migration count is a plan (ROADMAP 228–313: 0011…0016) and may change (Phase 4 plans are still being revised; 04-41 bundles a deploy).
- Failure: Phase 4 lands 5 migrations → 04.1 blocked forever; lands 7 → precondition passes and 04.1 becomes 0018 (reported, fine) — but a *partial* Phase 4 merge that reached 0016 early would also pass.
- Recommended remedy (PENDING): precondition = ROADMAP Phase 4 marked complete on `origin/main` **and** the last Phase 4 migration tag listed in Phase 4's final SUMMARY is present in `origin/main`'s journal; report the actual last tag.
- Alternatives: (B) keep `0016_` and let the user override manually. (C) do nothing.
- Effort S · Risk low.

**CEO-20 — WARNING — NEEDS USER DECISION — 04.1-07 T2 — 알림·「내 차례」 없이, 입사일 없이 공개하면 첫 주에 무슨 일이 생기나**
- Evidence: notifications (04.2) and 「내 차례」 [결재] row (Phase 4 merge) are deferred by ROADMAP; the only approver signal is opening 결재 (top bar / role tab / 더보기). 06 계획 가정 3: existing people get no hire date backfill (2026-09-23 decision) → with `hire_date` null, a 2026 hire gets the full 15-day annual grant for 2026 instead of monthly leave (03 truth 4) — an over-grant visible only as "월차 계산 불가 · 입사일 없음".
- Recommended remedy (PENDING, user decides the rollout): (A) add a launch checklist to 04.1-07 SUMMARY — before announcing 연차 to staff, admins fill 입사일 for every current employee on `/admin/people/[id]`; approvers told to check 결재 daily until 04.2 ships; (B) keep 04.1 dark for staff (deploy but don't announce) until 04.2 notify merges; (C) do nothing.
- Effort S · Risk low. User-visible product rollout → user decides.

---

## Section 10: Long-Term Trajectory Review

- Debt introduced: UTC "today" (CEO-11), side-effect registry (CEO-3), visibility N+1 until 04-32 (CEO-17), UI-SPEC/RESEARCH stale text (CEO-22).
- Path dependency: fixed route = role × scope × target stored per step; Phase 5 adds a kind (routeSettings + loadDetail + describeDocuments). Good trajectory; the grant-list balance model (03 assumption_delta) generalizes to new leave sources.
- Reversibility: approval tables/engine **3/5** (data model persisted per document, but additive); leave grant derivation **4/5** (no stored balances); settings keys **4/5**; migration regeneration **4/5**.
- Ecosystem fit: follows the 4-layer rules, registry, leak scan, action client — good.
- 1-year question: the engine is understandable from `route.ts` + tests, but the *contract Phase 5 must follow* is scattered across 7 plan files.

**CEO-21 — WARNING — (no plan owns it) — 결재 모듈 계약이 `docs/ARCHITECTURE.md`에 없다**
- Evidence: ARCHITECTURE §4-x covers registry, org-at-date, numbering, etc.; no plan touches `docs/ARCHITECTURE.md`. Phase 5 must learn `registerDocumentKind({kind,label,loadRouteConfig,href,describeDocuments,routeSettings?,loadDetail?})`, the fixed-route/re-resolve rule, version-first transition, and "no `scopeFor()` for inbox" from plan files.
- Recommended remedy (PENDING): 04.1-05 (or 07) adds §4-9 「결재 모듈 계약(Phase 04.1 → Phase 5)」 ≤ 20 lines (docs-limits 300-line cap: 237 now + 04-32's ≤ 20). Verification: `pnpm vitest run --project unit test/unit/docs-limits.test.ts`.
- Alternatives: (B) a README in `domain/approvals/` (new doc file). (C) do nothing.
- Effort S · Risk low.

**CEO-22 — WARNING — planning docs — 계획 문서의 낡은 문장(기록된 알려진 것 포함)**
- `04.1-UI-SPEC.md:279` and `:499` — "공휴일 제외는 Phase 7 공휴일(EXP-11)" → holiday table moved to **Phase 04.2 (ADMN-11)** (PR #50). *(known, recorded as instructed)*
- `04.1-UI-SPEC.md:198` and `:431` — empty CTA "지출결의 목록 보기" superseded by 결정 11 → "연차 목록 보기" (02 truth 3).
- `04.1-UI-SPEC.md:473-476` — U1–U4 still "⚠ unresolved" though resolved by 결정 1/3/4/5; `:525-535` checker sign-off unchecked, "Approval: pending".
- `04.1-RESEARCH.md:112-142` — architecture diagram shows a `leave_balances` table, `scopeFor(viewer)` row filtering, and "승인 완료 시 leave_balances 차감" — all contradicted by the plans (derived balance, no scopeFor, 03 prohibition 1).
- `04.1-01-PLAN.md:176` — "설정 키 23개" vs 17 + 5 = 22 (ROADMAP line 21 says 22).
- `04.1-01-PLAN.md:295` — skip logic attributed to `scripts/migrate-runner.ts:54`; it lives in `drizzle-orm/pg-core/dialect.js:57-62`.
- `04.1-VALIDATION.md` — `nyquist_compliant: false`, per-task map not filled (expected before `/gsd-validate-phase`).
- Recommended remedy (PENDING): one GSD-driven doc revision (CLAUDE.md forbids hand-editing `.planning/`) correcting the lines above before execution starts. Alternatives: (B) leave, since plans override (risk: executor reads UI-SPEC copy literally — 02 T1 read_first includes UI-SPEC 178–224). (C) do nothing.
- Effort S · Risk low.

---

## Section 11: Design & UX Review (UI scope present)

- **Information architecture:** entry = 계정 그룹 「연차」 (A1) → `/leave` (잔고 줄 first, then status groups 반려→결재 중→승인→회수) → `/leave/new` (kind → dates → hint → 잔고 행 → 결재선 한 줄). Approver: 결재 tab/link → `내 결재` group first → row → sheet (phone) / document (PC). Clear hierarchy; the "one fact once" rule (no total row) is deliberate.
- **Emotional arc:** employee — "how much do I have?" (잔고 줄) → "who will approve?" (route preview) → "done, it's with 김팀장" (toast) → silence until outcome (no notification yet — CEO-20). Approver — opens 결재 by habit → one tap → toast names next person. Drafter after rejection — sees reason inline, fixes in the same form, same number.
- **AI-slop risk:** low — UI-SPEC binds every string and state to SYSTEM.md sections; no generic cards/hero patterns.
- **DESIGN.md alignment:** SYSTEM.md exists → §4 applies; A1–A4 revisions go DECISIONS → SYSTEM → code with commit-order acceptance checks. Good.
- **Responsive:** 1280/1024/375 + 700 px modal↔sheet boundary, independent DOM audit with `CI=true` in 02/05/06/07 — intentional, not afterthought.
- **Accessibility:** caption, focus-first, Esc, focus return, trap, axe (05 T3), 44 px rows — covered.

Interaction state coverage:

```
 FEATURE              | LOADING            | EMPTY                          | ERROR                        | SUCCESS            | PARTIAL
 ---------------------|--------------------|--------------------------------|------------------------------|--------------------|---------------------------
 /approvals           | skeleton 3 rows    | 결재할 건이 없습니다 · 연차 목록  | 결재함을 불러오지 못했습니다    | row → 처리함 + toast| 내 결재 empty → header gone
 phone sheet          | 승인… aria-disabled| n/a                            | conflict line + 새로 고침      | toast, sheet closes| 담당 없음 row
 /leave/[id]          | skeleton           | n/a (404)                      | 연차 문서를 불러오지 못했습니다 | toast, tag change  | 담당 없음 / 회수 line
 /leave               | skeleton           | 2026 회계연도에 … · 연차 신청    | 연차를 불러오지 못했습니다      | n/a                | 월차 줄 absent / 입사일 없음
 /leave/new           | keeps prior preview| n/a                            | field lines + 신청하지 못했습니다| redirect + toast   | 잔여 초과 warning (not blocked)
 admin leave section  | skeleton           | 연차 조정 기록이 없습니다        | field lines                   | row on top         | 퇴직 single line
 settings 연차 결재선  | (server render)    | n/a                            | year_start error              | immediate save     | 부서 없음 warning
```

User flow:

```
 [employee]  계정 그룹「연차」 ─► /leave ──[연차 신청]──► /leave/new ──submit──► /leave/[id] (결재 중)
                                  ▲                          │ Esc+dirty → 입력 버리기    │ 회수 → confirm → (회수)■
                                  └──────── toast/back ───────┘                            │ rejected → edit form → 다시 신청 ─┐
                                                                                            ◄───────────────────────────────┘
 [approver phone] 결재 tab ─► /approvals (내 결재) ─tap row─► sheet ─승인─► toast, row → 처리함
                                                               └─반려─► reject sheet (reason) ─► toast
 [approver PC]    /approvals ─3차 승인 (no confirm)─► 처리함 ;  ─3차 반려─► modal 480 ; row link ─► /leave/[id] 행동 줄
 [admin]          /admin/settings 연차 결재선 (17 fields) ; /admin/people/[id] 연차 (입사일·퇴직일·조정)
```

**CEO-23 — WARNING — 04.1-UI-SPEC / 02·04·05·06 — 소유자가 요구한 GPT(Codex) 디자인 검토가 계획·검토 단계 어디에도 없다**
- Evidence: owner's timeline messages (relayed as context to this review): 화면 디자인 검토 때와 계획 때 GPT 검토를 넣으라. UI verification chains in 02/04/05/06 are: 싼 게이트 → 독립 DOM 감사 → 전체 게이트, then Post-build `/design-review` → `/qa`; UI-SPEC checker sign-off is still pending (`04.1-UI-SPEC.md:525-535`). No `/codex` step.
- Recommended remedy (PENDING — orchestrator to confirm it matches the owner's instruction): run `/codex` review on `04.1-UI-SPEC.md` + the UI sections of 02/04/05/06 now (planning gate, before Build), fold its findings through the GSD revision, and add a `/codex` design review next to `/design-review` in the Post-build note of 04.1-07 T2 ④. Consider `/plan-design-review` as well for depth (standard recommendation for significant UI scope).
- Alternatives: (B) Codex at Post-build only. (C) do nothing — contradicts the owner's instruction.
- Effort S · Risk low.

Post-implementation: run `/design-review` on the live staging build (CLAUDE.md UI completion rule).

---

## Required outputs

### NOT in scope

Deferred (settled; each already in ROADMAP/04.1-07 — TODOS.md entries only where no other phase owns it):

| Item | Answer / owner | Rationale |
|---|---|---|
| 지출결의 화면·문서 종류 | Phase 5 (user-confirmed brief) | adds one kind to the engine |
| 회사 대납 세율 8.8% vs 22% | Phase 5/11 (user-confirmed) | tax, not approvals |
| ADMN-04 알림 시점·대상 | Phase 7 / 04.2 (ROADMAP 04.1 criterion 2) | notify infra is 04.2 |
| ADMN-04 세율·수식 | Phase 5 (ROADMAP/REQUIREMENTS) | same |
| 「내 차례」 [결재] 행 | after Phase 4 merge (ROADMAP Depends on) | Phase 4 owns `ui/next-turn` |
| 공휴일 제외 일수 | Phase 04.2 ADMN-11 (PR #50) | holiday table |
| 승인된 연차 취소 | UI-SPEC Assumptions #6 — no path; admin adjustment is the workaround | settled by UI-SPEC |
| 기존 직원 입사일 일괄 입력 | 2026-09-23 decision (06 가정 3) | manual per person (see CEO-20) |
| 연차 수당 금액 | D-97 | out of system |

Rejected in this review: none (HOLD SCOPE — no expansion proposals made). Proposals considered and *not* raised as scope: admin "막힌 결재" screen, approver badge count (would be expansions).

### What already exists (reused?)

| Existing | Where | Reused by plan? |
|---|---|---|
| Optimistic lock pattern | `repositories/quote-lines.ts:98-131`, `db/schema/quote-lines.ts:34` | Yes (01 ②) |
| `withTransaction` | `lib/db-transaction.ts` | Yes |
| Document numbering + counter lock | `domain/document-numbering`, `repositories/document-counters.ts` | Yes (`leave` counter) |
| Settings registry (simple/historized, default, audit) | `domain/settings/registry.ts` | Yes (+3 optional fields) |
| Action types `document_*` | `domain/action-log/record.ts:10-33` | Yes, no edit |
| `teamAtDate` / org units / teams | `domain/org/index.ts` | Pattern reused; snapshot is a new reverse query |
| `can`/`visible`/`project`/`registerDto`/leak scan | `domain/permissions/*`, `test/integration/leak-scan.test.ts` | Yes |
| `authedActionClient` + `registerAction` | `lib/actions/*` | Yes |
| `menus.approvals`, `/approvals` placeholder, 결재 nav/tab | `domain/permissions/menus.ts:22`, `app/(app)/approvals/page.tsx`, `ui/shell/role-menu.ts:54,176-192` | Yes (page replaced) |
| Bottom sheet mechanics | `ui/shell/MoreSheet.tsx` | Pattern copied (not imported) |
| `ui/table` groups, `ui/list-empty`, `ui/kv-list`, `ui/button pending` | `ui/*` | Yes, no edits |
| Seed on every deploy | `scripts/deploy.sh:668 run_seed` | Yes (step-3 value, permissions) |
| Seoul-time formatting precedent | `domain/quotes/lines.ts:459` | **No** — CEO-11 |
| `pnpm db:reset:test` | `scripts/reset-test-db.sh` | **No** — CEO-16 |
| `project(…, deps.visible)` injection | `domain/permissions/project.ts` | **No** — CEO-17 |

### Dream state delta

12-month ideal: one approval engine for leave, 지출결의, 정산, with notifications, a 「내 차례」 queue, admin visibility of stuck documents, and holiday-aware leave counts. After 04.1: engine, fixed routes, leave, balances, settings and mobile approval exist; missing — notifications (04.2), 내 차례 row (Phase 4), holidays (04.2), expense kinds (Phase 5), stuck-document admin view (not planned), batch visibility projection (04-32). The 04.1 structure supports all of them without rework, provided CEO-1/2/3 are fixed now.

### Error & Rescue Registry (implementation-ready)

| Method | Exception classes | Rescued | Rescue action | User impact |
|---|---|---|---|---|
| `submitLeave` / `submitDocument` | Zod/validation · ApprovalBlocked · SettingNotFound · pool timeout · UnknownKind · (none: zero-approval) | partial | field errors / blocked copy; GAPs CEO-7, CEO-2, CEO-3, CEO-1 | error line, or silent auto-approval (CEO-1) |
| `approveDocument` | ApprovalConflict · NotCurrentHolder · final · 23505 (fallback) · pool timeout | partial | conflict line, no retry; GAP CEO-6 | exact line or generic |
| `rejectDocument` | reason validation · same as approve | partial | same | same |
| `withdrawDocument` | not drafter · final · conflict | Y | UserFacing | line |
| `resubmitDocument`/`resubmitLeave` | not rejected · not drafter · validation · 23505 (round) · UnknownKind | partial | GAP CEO-6, CEO-3 | line or generic |
| `previewRoute`/`previewLeaveAction` | SettingNotFound · validation | partial | GAP CEO-7 | generic |
| `listMyInbox`/`getApprovalView`/`getInboxItemDetail` | DB error · hidden fields | partial | error.tsx; GAP CEO-10 | error line / blank rows |
| `getMy/ForUser/ForRequest LeaveBalance` | forbidden → null · DB error | Y | 404/null, error.tsx | line |
| `addLeaveAdjustment` | 0 · non-0.25 · blank reason · forbidden | Y | field lines | line |
| `setHireDate`/`setResignationDate` | format · resign<hire · forbidden | Y | field lines | line |
| `addHistorizedValue` (year_start) | new UserFacing subclass | Y | existing error slot | line |
| `listApprovalRouteSettingWarnings` | none (pure + list read) | — | — | warning line |
| `recordAction` after commit | append failure | N (accepted) | state committed; step rows remain | generic error after success (rare) |

### Failure Modes Registry

```
  CODEPATH                         | FAILURE MODE                                  | RESCUED? | TEST? | USER SEES?          | LOGGED?
  ---------------------------------|-----------------------------------------------|----------|-------|---------------------|--------
  submitDocument/walkRoute         | 0 enabled steps / skip+rest disabled → final  | N        | N     | Silent              | action log only  ← CRITICAL (CEO-1)
  seoulToday (absent)              | UTC date 00–09 KST: year/number/asOf wrong    | N        | N     | Silent              | N               ← CRITICAL (CEO-11)
  getLeaveBalanceForRequest DTO    | resignation date to approver                  | N        | N     | Silent (leak)       | N               ← GAP (CEO-9, test pending)
  loadRouteConfig                  | step-3 key missing → throw                    | N        | N     | generic error       | Y (handleServerError)  (CEO-7)
  approveDocument                  | fallback INSERT race → 23505                  | N        | N     | generic error       | Y              (CEO-6)
  approveDocument                  | sequential loser → wrong message              | N        | Y*    | wrong line          | N              (CEO-6) *test will fail as written
  submit/approve in tx             | pool exhaustion                               | N        | N     | hang then error     | Y              (CEO-2)
  kind registry                    | unregistered on cold path                     | N        | N     | generic error       | Y              (CEO-3)
  project()/visible                | custom role → blank DTO                       | N        | N     | blank rows          | N              (CEO-10, user decision)
  walkRoute                        | blocked mid-flight                            | Y (shown)| Y     | 담당 없음 (drafter)  | N              (CEO-18)
  approve ∥ withdraw/reject        | lost update                                   | Y        | Y     | conflict line       | N              OK
  concurrent final approvals       | double deduction                              | Y (derived)| Y   | correct numbers     | —              OK
  settings change mid-flight       | route drift                                   | Y        | Y     | none                | Y (settings_change) OK
  _journal.json order              | silent skip in prod                           | Y        | Y     | —                   | —              OK (guard test + regen)
  local DB after regen             | skip Phase 4 / already-exists                 | N        | N     | dev confusion       | Y (migrate error) (CEO-16)
  E2E settings mutation            | flaky leave specs                             | N        | —     | CI red              | —              (CEO-14)
```

### Diagrams

1. System architecture — Section 1.
2. Data flow with shadow paths — Section 4 ("submit → approve → deduct").
3. State machine — Section 1.
4. Error flow:
```
 action ─► domain fn ─┬─ UserFacingError ─► handleServerError returns message ─► field/line/conflict (no retry)
                      ├─ ZodError ─────────► zod-error-message ─► field lines
                      └─ other Error ──────► log.error("action.unhandled_error") ─► generic line
                                              ▲ CEO-3/6/7/2 currently land here; target: prevent or map to UserFacing
```
5. Deployment sequence:
```
 PR merged (after Phase 4 on main) ─► CI (lint·typecheck·squawk·unit·integration·E2E both projects)
   ─► deploy.sh staging: build image ─► migrate job (04.1 regenerated SQL, when > Phase 4) ─► seed job
      (step-3 org unit, leave perms, visibility) ─► service revision ─► /api/health smoke ─► manual phone check
   ─► promote guard ─► production same sequence ─► launch checklist (CEO-20)
```
6. Rollback flowchart:
```
 smoke fails ─► deploy.sh auto-reverts to previous revision ─► done (schema additive, stays)
 bug found later ─► scripts/rollback.sh (traffic → previous revision, ~2 min)
     ─► data: leave/approval rows remain, ignored by old code ─► fix forward; no down-migration
 migration job fails ─► deploy stops before service; DB unchanged beyond the failed tx (drizzle migrate runs in one tx)
```

### Stale Diagram Audit

| Diagram / text | File:lines | Still accurate? |
|---|---|---|
| System Architecture Diagram | `04.1-RESEARCH.md:112-142` | **No** — `leave_balances` table, `scopeFor` filtering, "승인 시 차감" contradict plans (CEO-22) |
| Pattern 1 `nextStep` sketch (`stepIndex/totalSteps`) | `04.1-RESEARCH.md:177-205` | Partially — plans use `(status, event)` with 6 events incl. `approve_final`, `resubmit`; labeled "설계 스케치", acceptable |
| S1 list ASCII | `04.1-UI-SPEC.md:~236-250` | Yes |
| U1–U4 state rows | `04.1-UI-SPEC.md:473-476` | **No** — resolved by rulings |
| Holiday assumption | `04.1-UI-SPEC.md:279, 499` | **No** — Phase 04.2 ADMN-11 |
| Empty CTA | `04.1-UI-SPEC.md:198, 431` | **No** — 결정 11 |
| ARCHITECTURE §10 (no approvals entry) | `docs/ARCHITECTURE.md:227-237` | Incomplete after 04.1 (CEO-21) |
| SYSTEM.md §6-0/§6-1/§6-3/§7-5/§7-8/§1-2 | `docs/design/SYSTEM.md` | Will be revised by A1–A4 in 02/05/06 (planned) |

### Implementation Tasks (pending remedies only — none approved)

```markdown
- [ ] CEO-1 (01 T3, 04 T1) zero-approval → CEO fallback rule in walkRoute + 4 unit cases + 1 integration case. Files: domain/approvals/route.ts, test/unit/domain/approvals/resolve-step.test.ts, test/integration/settings-approval-route.test.ts. Verify: `pnpm vitest run --project unit test/unit/domain/approvals` and the integration file green; "all steps disabled" submit lands on 대표.
- [ ] CEO-2 (01 ④⑤, 02 T2 ①) reads (route config, snapshot, can, drafter team) before withTransaction; tx-only repo calls inside; number allocation last. Files: domain/approvals/index.ts, domain/leave/index.ts, test/integration/approvals-concurrency.test.ts. Verify: 6 concurrent submitLeave finish under pool 5.
- [ ] CEO-3 single `app/(app)/document-kinds.ts` side-effect import + guard unit test. Files: app/(app)/document-kinds.ts, app/(app)/{approvals,leave,admin/settings}/**, domain/leave/resubmit.ts, test/unit/document-kinds-import.test.ts. Verify: unit guard green.
- [ ] CEO-4 visibility rule in domain/leave/access.ts. Files: domain/leave/access.ts, domain/leave/index.ts, domain/leave/balance-service.ts. Verify: import-cycles test green after 03 and 05.
- [ ] CEO-5 [NEEDS USER DECISION] exclude this-round approvers from later-step candidates. Files: domain/approvals/route.ts, resolve-step.test.ts. Verify: 경영관리팀-drafter case.
- [ ] CEO-6 fixed transition order (version check → terminal → candidacy → UPDATE first → step writes) + fallback-race and double-resubmit tests. Files: domain/approvals/index.ts, test/integration/approvals-concurrency.test.ts. Verify: Order B message exact; one fallback row.
- [ ] CEO-7 loader maps missing step-3 org unit to "" + unit/integration. Files: domain/leave/index.ts, test/unit/domain/leave/route-config.test.ts, test/integration/approvals-route-fixed.test.ts. Verify: submit succeeds with row deleted.
- [ ] CEO-8 non-candidate approve/reject refusal tests. Files: test/integration/approvals-route-fixed.test.ts, test/integration/approvals-lifecycle.test.ts. Verify: 3 refusals, 0 step rows, version unchanged.
- [ ] CEO-9 split request-balance DTO spec (no hire/resignation) + assertion. Files: domain/leave/dto.ts, domain/leave/balance-service.ts, test/integration/leave-balance.test.ts. Verify: approver DTO lacks both keys.
- [ ] CEO-10 [NEEDS USER DECISION] record limitation + TODOS entry + documenting test. Files: TODOS.md (via /ship docs), 04.1-07 SUMMARY, test/integration/approvals-route-fixed.test.ts.
- [ ] CEO-11 lib/dates.ts seoulToday + use in all 04.1 date/year computations. Files: lib/dates.ts, test/unit/lib/dates.test.ts, domain/approvals/index.ts, domain/leave/*.ts, app/(app)/leave/page.tsx. Verify: 2026-12-31T15:30Z → 2027-01-01; LV27 number.
- [ ] CEO-12 double-submit E2E assertion. Files: test/e2e/leave-list.spec.ts. Verify: one request after double Ctrl+Enter.
- [ ] CEO-13 walkRoute helper decomposition (behavior-preserving). Files: domain/approvals/route.ts. Verify: unit tables unchanged and green.
- [ ] CEO-14 settings E2E: toggle self_approval, restore in finally, own Playwright project after mobile-375. Files: test/e2e/settings-approval-route.spec.ts, playwright.config.ts. Verify: `pnpm test:e2e:ci` green 3 runs.
- [ ] CEO-15 year from seoulToday + dedicated fixture user. Files: test/e2e/leave-list.spec.ts, test/e2e/mobile-leave-list.spec.ts, test/e2e/admin-person-leave.spec.ts. Verify: spec green with faked year expectation.
- [ ] CEO-16 replace "dev-db.sh = empty DB" with db:reset:test + erp drop/recreate; fix 07 reversibility text. Files: 04.1-01/03/07 PLAN verify blocks (GSD revision). Verify: 07 T1 empty-DB apply succeeds after regeneration.
- [ ] CEO-17 memoized visible via project deps (or projectMany) + approval_steps(acted_by) index. Files: domain/approvals/index.ts, domain/leave/index.ts, db/schema/approvals.ts, test/integration/approvals-inbox-projection.test.ts. Verify: ≤2 findVisibility calls for 20 rows.
- [ ] CEO-18 structured logs for blocked/refused + runbook line. Files: domain/approvals/index.ts, test/unit/domain/approvals/logging.test.ts. Verify: log spy assertions.
- [ ] CEO-19 07 precondition = Phase 4 complete + last Phase 4 tag present. Files: 04.1-07 PLAN (GSD revision). Verify: precondition command reports actual tag.
- [ ] CEO-20 [NEEDS USER DECISION] launch checklist (hire dates, approver habit) or dark launch. Files: 04.1-07 SUMMARY.
- [ ] CEO-21 ARCHITECTURE §4-9 결재 모듈 계약 ≤20 lines. Files: docs/ARCHITECTURE.md. Verify: docs-limits unit test green.
- [ ] CEO-22 GSD doc revision of stale lines (UI-SPEC 198/279/431/473-476/499/525-535, RESEARCH 112-142, 01 L176/L295). Verify: grep for "Phase 7 공휴일", "지출결의 목록 보기", "leave_balances" returns 0 in 04.1 docs.
- [ ] CEO-23 `/codex` design review of UI-SPEC + UI plans now; add `/codex` beside `/design-review` in 07 T2 ④. Verify: Codex findings folded via GSD revision before /gsd-execute-phase.
```

JSONL task artifact: **not persisted** (review-only run; no plan/report write permitted in the repo).

### Completion Summary

- Mode HOLD SCOPE · depth implementation-ready · Sections 1–10 evaluated, Section 11 evaluated (UI scope).
- Findings: **2 CRITICAL GAP** (CEO-1, CEO-11) · **21 WARNING** · OK items noted inline (rollback, migration additivity, action-type reuse, lock precedent, derived balances, leak scan, a11y/responsive coverage).
- NEEDS USER DECISION: CEO-5, CEO-10, CEO-20 (and CEO-23 needs orchestrator confirmation against the owner's instruction).
- Registries: Error & Rescue 13 method rows; Failure Modes 16 codepath rows (2 flagged CRITICAL, 1 leak GAP).
- Status: **issues_open** — all remedies PENDING; nothing approved, nothing verified by execution.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | mode: HOLD_SCOPE, 2 critical gaps (23건: 치명 2 · 경고 21, 20건 수용 · 기본값 2 · 카드 1) |
| Outside Review | codex (plan-ceo-review) | Independent 2nd opinion | 0 | unavailable | codex not_authed — no completed external review; 인증된 새 세션에서 실행 예정 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | 아직 안 함 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 아직 안 함 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 해당 없음 |

**OUTSIDE COVERAGE:** codex, plan-ceo-review 단계, 미실행(not_authed), 발견 없음이 아니라 검토 없음.

**VERDICT:** CEO 조건부 통과 — 반영 지시 1~4를 적용한 뒤 체커로 재검증. eng review required.

**UNRESOLVED DECISIONS:**
- CEO-5 한 사람이 두 단계에 걸릴 때 한 번만 승인할지(사용자 카드 대기, 기본값 A)
