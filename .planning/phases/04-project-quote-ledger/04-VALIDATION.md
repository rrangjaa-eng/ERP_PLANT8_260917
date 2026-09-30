---
phase: "04"
slug: "project-quote-ledger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-22"
validated: "2026-09-29"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 4` from `04-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is filled by `/gsd-validate-phase` once PLAN.md files exist.
> **2026-09-23 RECONCILE:** `04-RESEARCH.md § 2026-09-23 추가 연구 — D-75~D-95 § Validation Architecture 추가분`의 13개 행을 반영했다. 기존 행은 삭제하지 않고 유지한다. D-41·D-46·D-47·D-49로 이어지던 PROJ-04 행만 이 세션에서 확인 가능한 기존 매핑이 있어 superseded로 표시했다 — D-51·D-57·D-61은 이 파일에 대응하는 기존 행이 없었다(원래 서사적 CONTEXT 결정이었을 뿐 테스트 행으로 옮겨진 적이 없음); 새 요구는 아래 추가 표(D-84·D-85, D-87~91)가 담당한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`test/unit`, `test/integration`) + Playwright (`test/e2e`) |
| **Config file** | `vitest.config.ts` (2-project: `unit` / `integration`), `playwright.config.ts` |
| **Quick run command** | `pnpm vitest run --project unit` |
| **Full suite command** | `pnpm test` (단위 → 통합 → E2E) |
| **Estimated runtime** | ~90 seconds (unit ~15s; full suite needs `pnpm db:dev`) |

**Note:** 통합·E2E는 로컬 DB가 필요하다 (`pnpm db:dev`). 완료 판정은 `CI=true` — `playwright.config.ts`가 CI에서만 프로덕션 빌드를 쓴다 (CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project unit`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green under `CI=true`
- **Max feedback latency:** 15 seconds (unit project)

---

## Per-Task Verification Map

> 2026-09-29 `/gsd-validate-phase 4`로 채움. 플랜 44개 · 작업 114개 — 플랜 단위로 적는다(작업별 명령은 각 PLAN.md `<automated>`). 「Auto」 = automated verify가 있는 작업 수 / 전체. 자동 검증이 없는 작업 3개는 전부 `checkpoint:decision`(04-01 T1 · 04-07 T1 · 04-51 T1)이고, 04-43은 문서 플랜이라 `node -e` 정적 확인뿐이다. Threat Ref · Secure Behavior는 `/gsd-secure-phase 4`(SECURITY.md) 몫이라 여기서는 비운다.

| Plan | Wave | Requirement | Auto | Test Type | Test files (새로 만든 것 · verify-only는 표시) | Status |
|------|------|-------------|------|-----------|-----------------------------------------------|--------|
| 04-01 | 1 | PROJ-01, PROJ-02, UX-04 | 2/3 | unit+integration+E2E | unit/domain/{money,rules-gate,quote-lines} · integration/{document-counters-concurrency,quote-lines} · e2e/project-register | ✅ green |
| 04-02 | 2 | FX-01, PROJ-03 | 3/3 | unit+integration+E2E | unit/domain/money-tax · integration/revenue-entries · e2e/revenue-section | ✅ green |
| 04-04 | 3 | UX-04, UX-05, PROJ-02 | 3/3 | unit+integration+E2E | unit/ui/dirty-storage · integration/quote-lines-conflict | ✅ green |
| 04-05 | 3 | PROJ-01, ADMN-09 | 2/2 | unit+integration+E2E | unit/domain/document-number-format · integration/{projects-list,document-numbering} · e2e/projects-list | ✅ green |
| 04-06 | 6 | PROJ-04 | 2/2 | unit+integration | integration/{project-status,migration-upgrade} | ✅ green |
| 04-07 | 28 | RSV-01 | 3/4 | unit+integration | unit/domain/reserve-balance · integration/reserve-entries | ✅ green |
| 04-08 | 3 | UX-05, UX-04 | 2/2 | unit+E2E | unit/lib/shortcut | ✅ green |
| 04-09 | 7 | FX-01, UX-04 | 3/3 | unit+integration+E2E | unit/lib/format-number | ✅ green |
| 04-10 | 4 | UX-04 | 2/2 | integration+E2E | integration/code-item-description | ✅ green |
| 04-11 | 10 | PROJ-04 | 3/3 | unit+integration+E2E | unit/domain/auto-transition · integration/project-auto-settlement · e2e/project-period | ✅ green |
| 04-12 | 13 | PROJ-02, UX-04 | 3/3 | unit+integration | unit/domain/quote-edit-scope | ✅ green |
| 04-13 | 17 | PROJ-02 | 2/2 | unit+integration | integration/quote-line-kinds | ✅ green |
| 04-14 | 19 | PROJ-07, PROJ-05 | 3/3 | unit+integration | integration/quote-revisions · unit/domain/quote-revisions | ✅ green |
| 04-15 | 22 | PROJ-05, PROJ-01 | 2/2 | integration+E2E | integration/project-copy · e2e/project-copy | ✅ green |
| 04-16 | 23 | PROJ-03 | 3/3 | unit+integration+E2E | unit/app/revenue-cells · integration/contract-invariant | ✅ green |
| 04-17 | 25 | PROJ-01, UX-04 | 2/2 | unit+integration+E2E | unit/domain/project-list-view | ✅ green |
| 04-18 | 27 | PROJ-01 | 3/3 | unit+integration+E2E | unit/ui/table-header-sort | ✅ green |
| 04-19 | 25 | UX-05, UX-04, PROJ-05 | 2/2 | unit+E2E | unit/ui/table-paging | ✅ green |
| 04-20 | 8 | PROJ-04 | 3/3 | unit+integration | unit/domain/project-status · integration/lock-race.ts(helper) | ✅ green |
| 04-21 | 9 | PROJ-04 | 3/3 | unit+integration+E2E | unit/app/unsaved-edits · e2e/project-lifecycle | ✅ green |
| 04-22 | 11 | PROJ-04, UX-04 | 2/2 | unit+integration+E2E | unit/domain/project-period · integration/project-period · e2e/ledger-save-flow | ✅ green |
| 04-23 | 18 | PROJ-02 | 3/3 | unit+E2E | e2e/quote-line-kinds | ✅ green |
| 04-24 | 21 | PROJ-07, PROJ-05, UX-04 | 4/4 | unit+E2E | e2e/quote-revisions | ✅ green |
| 04-25 | 5 | UX-04 | 2/2 | E2E | verify-only: e2e/code-tables · mobile-code-tables | ✅ green |
| 04-26 | 16 | UX-04, UX-05 | 2/2 | integration+E2E | integration/quote-line-cap | ✅ green |
| 04-27 | 7 | PROJ-04 | 2/2 | integration+E2E | verify-only: integration/roles · e2e/roles · mobile-roles | ✅ green(통합) · E2E 이번 감사 재실행 안 함 |
| 04-28 | 5 | UX-05, UX-04 | 3/3 | unit+integration+E2E | unit/ui/{shortcut-notation,conflict-focus} | ✅ green |
| 04-29 | 5 | PROJ-01, UX-05 | 3/3 | unit | unit/ui/pagination · unit/lib/{kst-date,paging} | ✅ green |
| 04-30 | 14 | PROJ-02, UX-05, UX-04 | 2/2 | unit+E2E | e2e/quote-edit-scope | ✅ green |
| 04-31 | 30 | UX-05, UX-04, PROJ-05 | 3/3 | unit+E2E | e2e/excel-paste-final · fixtures/excel-clipboard.ts | ✅ green |
| 04-32 | 3 | PROJ-02, PROJ-04, UX-04 | 3/3 | unit+integration | integration/tx-safety | ✅ green |
| 04-40 | 20 | PROJ-07, PROJ-02 | 3/3 | unit+integration | integration/{quote-approved-lock,quote-revision-races} | ✅ green |
| 04-41 | 24 | PROJ-03 | 3/3 | integration+E2E | verify-only(revenue-entries · migration-upgrade 확장) | ✅ green |
| 04-42 | 29 | RSV-01 | 3/3 | integration+E2E | e2e/reserves | ✅ green |
| 04-43 | 3 | PROJ-03, PROJ-04 | 1/1 | static | 없음(문서 플랜, `node -e` 문구 확인) | ✅ n/a |
| 04-44 | 12 | PROJ-04, PROJ-07, UX-04, FX-01 | 3/3 | unit+integration+E2E | unit/domain/project-pre-estimate | ✅ green |
| 04-46 | 4 | UX-05, UX-04 | 2/2 | unit+E2E | unit/ui/{confirm-dialog,button} | ✅ green |
| 04-47 | 26 | UX-05, UX-04, PROJ-05 | 2/2 | unit+E2E | unit/ui/{footer-notice,use-clipboard-paste} | ✅ green |
| 04-48 | 26 | PROJ-01, UX-04 | 3/3 | unit+integration+E2E | unit/app/projects-loading | ✅ green |
| 04-49 | 15 | UX-05, UX-04, PROJ-02 | 2/2 | unit+E2E | unit/ui/save-lock | ✅ green |
| 04-50 | 2 | PROJ-04, PROJ-03 | 2/2 | unit | verify-only: unit/deploy/* | ✅ green |
| 04-51 | 29 | ADMN-09 | 1/2 | integration | verify-only: integration/document-numbering(확장) | ✅ green |
| 04-52 | 31 | PROJ-01, PROJ-03, UX-04 | 3/3 | unit+E2E | e2e/mobile-projects-error · unit/ui/select-error-hint | ✅ green |
| 04-53 | 32 | PROJ-04 | 3/3 | unit+integration | unit/domain/auto-settle-gate-registration | ✅ green |

(04-03은 2026-09-23 철회, 04-45는 없음.)

### Requirement → signal map (from RESEARCH.md § Validation Architecture)

| Req ID | Observable signal | Test Type | Automated Command | File Exists |
|--------|-------------------|-----------|-------------------|-------------|
| PROJ-02 | 차익은 서버가 계산해 저장하고, 브라우저가 보낸 계산값은 저장되지 않는다 | unit | `pnpm vitest run --project unit test/unit/domain/quote-lines.test.ts` | ✅ + integration/quote-lines · e2e/project-register — COVERED |
| PROJ-01 | 문서 번호가 `document_counters` 행 잠금으로 원자 부여 — 두 동시 트랜잭션이 서로 다른 번호를 받는다 | integration | `pnpm vitest run --project integration test/integration/document-counters-concurrency.test.ts` | ✅ + integration/{projects-list,projects-create-concurrency,project-copy} — COVERED(p99 500ms는 Phase 9 이월) |
| PROJ-07 | 승인 전 차수의 줄에서 지출결의·구매 요청이 `domain/rules.gate` 단일 진입점으로 막힌다 | unit | `pnpm vitest run --project unit test/unit/domain/rules-gate.test.ts` | ✅ + integration/{quote-revisions,quote-approved-lock} — COVERED(지출결의·구매 요청 소비자는 Phase 5·6) |
| PROJ-04 | ~~상태 전환 4종이 전부 게이트를 지나고, 잠기는 상태는 완료(정산) 하나뿐이다~~ **[SUPERSEDED by D-75·D-76·D-78·D-79·D-80·D-82, 2026-09-23 — 원래 D-41(네 상태)·D-46(전환 주체)·D-47(완료 후 편집 범위)·D-49(기간 요구)에 대응하던 행.]** 다섯 상태(수주중·진행·정산·완료·미수주), 정산=부분 잠금·완료=전체 잠금으로 바뀐다 — 아래 「2026-09-23 추가 — D-75~D-95」 표 참고 | unit + integration | `pnpm vitest run --project unit test/unit/domain/project-status.test.ts` | ✅ 다섯 상태 모델로 재작성됨 + integration/project-status · e2e/project-lifecycle — COVERED(Phase 4 몫, REQUIREMENTS Pending 유지는 사용자 결정) |
| FX-01 | `domain/money` 세금 규칙 4종 × 절사 단위·방식 표가 전부 기대값과 같다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ✅ + unit/domain/money-tax — COVERED |
| PROJ-03 | `grossFromTotal()` 역산값이 입력 합계와 어긋나면 차이가 표시된다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ✅ + integration/{revenue-entries,contract-invariant} — COVERED |
| UX-04 · UX-05 | 키보드만으로 입력 완료 — Tab/Enter·방향키·Esc·저장/새 줄, 여러 칸 붙여넣기가 전부 저장되거나 전부 거부된다 | E2E | `pnpm playwright test test/e2e/quote-table.spec.ts` | ✅ + e2e/excel-paste-final · integration/quote-lines-conflict — COVERED(실제 Excel 붙여넣기는 수동 → 캡처 재생으로 대체) |
| RSV-01 | 리저브 대장 잔액이 서버 계산으로 나오고 음수 잔액은 거부된다 | integration | `pnpm vitest run --project integration test/integration/reserve-entries.test.ts` | ✅ + unit/domain/reserve-balance · e2e/reserves — COVERED |
| ADMN-09 | 설정의 번호 서식(접두어·연도·자릿수·구분자·순번 범위)이 실제 부여된 번호에 반영된다 | integration | `pnpm vitest run --project integration test/integration/document-numbering.test.ts` | ✅ + unit/domain/document-number-format — COVERED |
| PROJ-05 | 연결 문서가 있는 견적 줄은 보관되지 않고 '취소'로만 바뀌며 FK는 RESTRICT다 | integration | `pnpm vitest run --project integration test/integration/quote-lines.test.ts` | ✅ COVERED(연결 문서 경로는 Phase 5 전까지 단위 주입만 — `linkedDocumentsByLine` 의도된 빈 구현) |

### 2026-09-23 추가 — D-75~D-95 (from RESEARCH.md § 2026-09-23 추가 연구 § Validation Architecture 추가분)

| Req/결정 ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-75 | 5개 code_items 값·기존 settled 행 재매핑이 새 마이그레이션으로 이뤄지고 0009는 그대로다 | integration | `pnpm lint:sql && pnpm db:migrate` | ✅ `0012_project_status_five_values.sql` · integration/migration-upgrade (a)(b) — COVERED |
| D-76 | 진행 상태·종료일 지난 프로젝트를 조회하면 정산으로 바뀌고 같은 날 재조회해도 행동 로그가 한 줄이다(멱등) | unit(주입된 `now`) + integration | `pnpm vitest run --project unit test/unit/domain/auto-transition.test.ts` | ✅ + unit/domain/auto-transition-gate-no-end-date(2026-09-29 추가) · integration/project-auto-settlement — COVERED |
| D-78 | 정산 상태에서 실행가 저장은 통과, 수량·단가·항목 저장은 거부된다(같은 배치 안에 섞이면 전부 거부) | unit + integration | `pnpm vitest run --project integration quote-lines` | ✅ + unit/domain/quote-edit-scope · e2e/quote-edit-scope — COVERED |
| D-83 | 경영관리가 아닌 사용자의 조정 줄 저장이 거부되고, 경영관리는 상태 무관하게 통과한다 | unit + integration | `pnpm vitest run --project integration quote-line-kinds` | ✅ integration/quote-line-kinds · e2e/quote-line-kinds — COVERED |
| D-86 | 300줄 도달 시 줄 추가·붙여넣기가 서버에서도 거부된다(클라이언트 우회 흉내) | integration | `pnpm vitest run --project integration quote-line-cap` | ✅ integration/quote-line-cap — COVERED |
| D-84 | `projects.contract_*` 참조가 코드에서 사라지고 계약 금액이 SUM 파생값으로 응답된다 | integration | `pnpm vitest run --project integration contract-invariant revenue-entries migration-upgrade` | ✅ (`projects.test.ts`는 없음 — 이 세 파일이 담당) — COVERED |
| D-85 | 기획본부 viewer로 조회하면 발행 배열은 오고 입금 배열은 빠진다(기존 revenue-entries.test.ts#(d) 기대값 수정) | integration | `pnpm vitest run --project integration revenue-entries` | ✅ (d) 키 집합 · e2e/revenue-section — COVERED |
| D-87~90 | 겹침 필터·귀속 연도 합계·제외 건수가 집계 쿼리 한 번으로 나온다(04-05 공유 필터 원칙 유지 확인) | integration | `pnpm vitest run --project integration projects-list` | ✅ + unit/domain/project-list-view — COVERED |
| D-91(목록) | `page=3` 요청이 올바른 offset을 반환한다(범위 밖 페이지는 마지막 페이지로) | integration | 〃 | ✅ + unit/lib/paging — COVERED |
| D-91(견적 줄) | 31번째 줄부터 클라이언트 페이지 나눔이 그룹 머리글을 반복하고 저장 거부 시 오류 페이지로 자동 이동한다 | E2E | `pnpm playwright test quote-table` | ✅ + unit/ui/table-paging — COVERED |
| D-93 | 코드표 설명 40자 초과 저장이 서버에서 거부된다 | unit + integration | `pnpm vitest run --project integration code-item-description` | ✅ (실제 파일은 `code-item-description.test.ts`) — COVERED |
| D-94 | Ctrl 키 이벤트가 Mac(metaKey)·Windows(ctrlKey) 둘 다에서 같은 동작을 일으킨다 | E2E(키 이벤트 시뮬레이션) | `pnpm playwright test quote-table` | ✅ + unit/lib/shortcut — COVERED(※ 이 행 문구는 낡음: 실제 D-94 = Windows·Ctrl 전용, 테스트는 Meta 무동작을 단언) |
| D-95 | 원화·외화·환율·수량이 화면마다 같은 포맷 모듈을 거쳐 렌더된다(회귀 방지용 스냅샷 또는 유닛) | unit | `pnpm vitest run --project unit test/unit/lib/format-number.test.ts` | ✅ + e2e/number-format — COVERED(2026-09-29 표시 지점 스캔을 app/(app)/projects·ui 전체로 확장) |

*(13개 행, RESEARCH.md의 표를 그대로 옮김 — 새 테스트를 임의로 추가하지 않음)*

---

## Wave 0 Requirements

- [x] `test/unit/domain/money.test.ts` — FX-01 · PROJ-03 (세금 규칙 4종 × 절사 표, `splitWithRemainder` 합계 보존, `grossFromTotal` 정수 안전성)
- [x] `test/unit/domain/rules-gate.test.ts` — PROJ-07 · PROJ-04 (게이트 등록·판정, 단일 진입점)
- [x] `test/unit/domain/quote-lines.test.ts` — PROJ-02 (차익 서버 계산)
- [x] `test/unit/domain/project-status.test.ts` — PROJ-04 (상태 전환 4종) **[SUPERSEDED by D-75~D-82 — 다섯 상태·정산 부분 잠금으로 다시 짜야 함, 아래 D-76 항목과 함께 계획]**
- [x] `test/integration/document-counters-concurrency.test.ts` — PROJ-01 (Issue 10, 두 커넥션 동시 증가)
- [x] `test/integration/document-numbering.test.ts` — ADMN-09 (서식 → 번호)
- [x] `test/integration/quote-lines.test.ts` — PROJ-02 · PROJ-05 (서버 계산·버전 충돌·RESTRICT) · D-78·D-83·D-86 확장분(정산=실행가만 편집·조정 줄 경영관리 전용·300줄 상한)
- [x] `test/integration/reserve-entries.test.ts` — RSV-01 (음수 잔액 거부)
- [x] `test/e2e/quote-table.spec.ts` — UX-04 · UX-05 (키보드·붙여넣기·전부 저장/거부) · D-91(견적 줄)·D-94 확장분(30줄 페이지 경계·Ctrl 키 이벤트)
- [x] `db/migrations/0011_*.sql` (파일명 계획에서 확정) — D-75 (project_status 다섯 값 재매핑, 0009는 고쳐 쓰지 않음)
- [x] `test/unit/domain/projects/auto-transition.test.ts` — D-76 (진행→정산 자동 전환, 주입된 `now`로 멱등성)
- [x] `test/integration/projects.test.ts` — D-84 (계약 금액 칸 제거·SUM 파생값)
- [x] `test/integration/projects-list.test.ts` — D-87~90·D-91(목록) (겹침 필터·귀속 연도 합계·제외 건수·offset 페이지)
- [x] `test/integration/code-tables.test.ts` — D-93 (설명 40자 상한)
- [x] `test/unit/lib/format-number.test.ts` — D-95 (원화·외화·환율·수량 포맷 통합)
- [x] Framework install: 없음 — 기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 Excel에서 복사한 여러 칸을 붙여넣기 (**2026-09-29 사용자 결정: 실제 Windows Excel 캡처 재생 E2E `test/e2e/excel-paste-final.spec.ts`로 갈음**) | UX-05 | Playwright의 클립보드 주입은 브라우저가 쓰는 `text/plain` TSV를 흉내 낼 뿐, 실제 Excel이 쓰는 인용·줄바꿈 이스케이프와 동일하다는 보장이 없다 (RESEARCH.md Gaps) | 실제 Excel에서 3×3 영역(따옴표·줄바꿈 포함 셀 1개)을 복사해 견적 줄 표에 붙여넣고, 저장된 행이 원본과 같은지 확인 |
| 목록 응답 p99 500ms | PROJ-01 성공 기준 1 | 실제 데이터 규모(인트라넷 이전분)가 있어야 의미 있는 측정이 된다 | Phase 8 이전 리허설 데이터로 목록 조회를 반복 측정 — **2026-09-29 사용자 결정으로 Phase 9 이월** |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (예외 3개는 `checkpoint:decision`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (최장 1)
- [x] Wave 0 covers all MISSING references (MISSING 0)
- [x] No watch-mode flags (`vitest run` · `playwright test`만)
- [x] Feedback latency < 15s (파일 단위 단위 테스트 기준. 단위 전체는 36초)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-29 (`/gsd-validate-phase 4`)

---

## Validation Audit 2026-09-29

| Metric | Count |
|--------|-------|
| Gaps found | 3 (D-95 PARTIAL 1 + 사용자가 포함시킨 /review 참고 2 — 둘 다 D-76) |
| Resolved | 3 |
| Escalated | 0 |

- 대조: 요구 11개(PROJ-01·02·03·04·05·07, ADMN-09, UX-04, UX-05, RSV-01, FX-01) + D-75~D-95 13행 → COVERED 23 · PARTIAL 1(D-95) · MISSING 0.
- 재실행(전경 · 순차): 단위 전체 1759 통과 · 통합 39파일 1755 통과 · E2E `CI=true` desktop 311 + mobile-375 3 통과 · `pnpm lint:sql` 0. 재실행하지 않은 것: e2e roles·archive·settings·vendor-edit·action-log(플랜과 접점이 옆줄뿐).
- 채운 테스트(커밋 1dbc5163, 테스트 파일만):
  1. D-95 — `test/unit/lib/format-number.test.ts` 「표시 지점 스캔」을 app/(app)/projects·ui 전체 재귀 스캔으로 확장(`.toLocaleString(` · `new Intl.NumberFormat` 금지). RED: list-totals.tsx에 호출을 넣자 실패 → 되돌림.
  2. D-76 ① — `test/unit/domain/auto-transition-gate-no-end-date.test.ts`: 규칙이 허용했는데 종료일이 없으면 `project.auto_settle_gate_no_end_date`로 던지고 쓰기·로그 없음(gate만 vi.mock, 구현 무수정). RED: 종료일을 넣자 `no_row`로 실패.
  3. D-76 ② — `test/unit/domain/auto-transition.test.ts`: 보관·진행 밖 후보는 applyAutoSettlement의 settle·로그에서 빠짐 + 유효 후보 0이면 settle·recordAction 미호출. RED: 보관 후보의 archivedAt을 비우자 ids가 `['archived','valid']`로 실패.
- 채운 뒤: 단위 전체 128파일 1764 통과 · typecheck 0 · lint 0.
- 문서 정리 메모(테스트 빈틈 아님): Wave 0 경로 추정이 실제와 다른 곳(마이그레이션 0012, D-76·D-84·D-93 파일명)은 위 표에 실제 경로를 적었다. D-94 행 문구는 낡았다(실제 결정은 Ctrl 전용).
