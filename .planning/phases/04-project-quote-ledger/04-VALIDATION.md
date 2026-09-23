---
phase: "04"
slug: "project-quote-ledger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-22"
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by `/gsd-validate-phase 4` after plans exist)* | | | | | | | | | ⬜ pending |

### Requirement → signal map (from RESEARCH.md § Validation Architecture)

| Req ID | Observable signal | Test Type | Automated Command | File Exists |
|--------|-------------------|-----------|-------------------|-------------|
| PROJ-02 | 차익은 서버가 계산해 저장하고, 브라우저가 보낸 계산값은 저장되지 않는다 | unit | `pnpm vitest run --project unit test/unit/domain/quote-lines.test.ts` | ❌ W0 |
| PROJ-01 | 문서 번호가 `document_counters` 행 잠금으로 원자 부여 — 두 동시 트랜잭션이 서로 다른 번호를 받는다 | integration | `pnpm vitest run --project integration test/integration/document-counters-concurrency.test.ts` | ❌ W0 |
| PROJ-07 | 승인 전 차수의 줄에서 지출결의·구매 요청이 `domain/rules.gate` 단일 진입점으로 막힌다 | unit | `pnpm vitest run --project unit test/unit/domain/rules-gate.test.ts` | ❌ W0 |
| PROJ-04 | ~~상태 전환 4종이 전부 게이트를 지나고, 잠기는 상태는 완료(정산) 하나뿐이다~~ **[SUPERSEDED by D-75·D-76·D-78·D-79·D-80·D-82, 2026-09-23 — 원래 D-41(네 상태)·D-46(전환 주체)·D-47(완료 후 편집 범위)·D-49(기간 요구)에 대응하던 행.]** 다섯 상태(수주중·진행·정산·완료·미수주), 정산=부분 잠금·완료=전체 잠금으로 바뀐다 — 아래 「2026-09-23 추가 — D-75~D-95」 표 참고 | unit + integration | `pnpm vitest run --project unit test/unit/domain/project-status.test.ts` | ❌ W0 |
| FX-01 | `domain/money` 세금 규칙 4종 × 절사 단위·방식 표가 전부 기대값과 같다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ❌ W0 |
| PROJ-03 | `grossFromTotal()` 역산값이 입력 합계와 어긋나면 차이가 표시된다 | unit | `pnpm vitest run --project unit test/unit/domain/money.test.ts` | ❌ W0 |
| UX-04 · UX-05 | 키보드만으로 입력 완료 — Tab/Enter·방향키·Esc·저장/새 줄, 여러 칸 붙여넣기가 전부 저장되거나 전부 거부된다 | E2E | `pnpm playwright test test/e2e/quote-table.spec.ts` | ❌ W0 |
| RSV-01 | 리저브 대장 잔액이 서버 계산으로 나오고 음수 잔액은 거부된다 | integration | `pnpm vitest run --project integration test/integration/reserve-entries.test.ts` | ❌ W0 |
| ADMN-09 | 설정의 번호 서식(접두어·연도·자릿수·구분자·순번 범위)이 실제 부여된 번호에 반영된다 | integration | `pnpm vitest run --project integration test/integration/document-numbering.test.ts` | ❌ W0 |
| PROJ-05 | 연결 문서가 있는 견적 줄은 보관되지 않고 '취소'로만 바뀌며 FK는 RESTRICT다 | integration | `pnpm vitest run --project integration test/integration/quote-lines.test.ts` | ❌ W0 |

### 2026-09-23 추가 — D-75~D-95 (from RESEARCH.md § 2026-09-23 추가 연구 § Validation Architecture 추가분)

| Req/결정 ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-75 | 5개 code_items 값·기존 settled 행 재매핑이 새 마이그레이션으로 이뤄지고 0009는 그대로다 | integration | `pnpm lint:sql && pnpm db:migrate` | ❌ W0(새 마이그레이션 파일) |
| D-76 | 진행 상태·종료일 지난 프로젝트를 조회하면 정산으로 바뀌고 같은 날 재조회해도 행동 로그가 한 줄이다(멱등) | unit(주입된 `now`) + integration | `pnpm vitest run --project unit domain/projects/auto-transition` | ❌ W0 |
| D-78 | 정산 상태에서 실행가 저장은 통과, 수량·단가·항목 저장은 거부된다(같은 배치 안에 섞이면 전부 거부) | unit + integration | `pnpm vitest run --project integration quote-lines` | ❌ W0(기존 파일 확장) |
| D-83 | 경영관리가 아닌 사용자의 조정 줄 저장이 거부되고, 경영관리는 상태 무관하게 통과한다 | unit + integration | 〃 | ❌ W0(기존 파일 확장) |
| D-86 | 300줄 도달 시 줄 추가·붙여넣기가 서버에서도 거부된다(클라이언트 우회 흉내) | integration | 〃 | ❌ W0(기존 파일 확장) |
| D-84 | `projects.contract_*` 참조가 코드에서 사라지고 계약 금액이 SUM 파생값으로 응답된다 | integration | `pnpm vitest run --project integration projects` | ❌ W0 |
| D-85 | 기획본부 viewer로 조회하면 발행 배열은 오고 입금 배열은 빠진다(기존 revenue-entries.test.ts#(d) 기대값 수정) | integration | `pnpm vitest run --project integration revenue-entries` | 기존 파일 수정 |
| D-87~90 | 겹침 필터·귀속 연도 합계·제외 건수가 집계 쿼리 한 번으로 나온다(04-05 공유 필터 원칙 유지 확인) | integration | `pnpm vitest run --project integration projects-list` | 기존 파일 확장 |
| D-91(목록) | `page=3` 요청이 올바른 offset을 반환한다(범위 밖 페이지는 마지막 페이지로) | integration | 〃 | 기존 파일 확장 |
| D-91(견적 줄) | 31번째 줄부터 클라이언트 페이지 나눔이 그룹 머리글을 반복하고 저장 거부 시 오류 페이지로 자동 이동한다 | E2E | `pnpm playwright test quote-table` | 기존 스펙 확장 |
| D-93 | 코드표 설명 40자 초과 저장이 서버에서 거부된다 | unit + integration | `pnpm vitest run --project integration code-tables` | 기존 파일 확장 |
| D-94 | Ctrl 키 이벤트가 Mac(metaKey)·Windows(ctrlKey) 둘 다에서 같은 동작을 일으킨다 | E2E(키 이벤트 시뮬레이션) | `pnpm playwright test quote-table` | 기존 스펙 확장 |
| D-95 | 원화·외화·환율·수량이 화면마다 같은 포맷 모듈을 거쳐 렌더된다(회귀 방지용 스냅샷 또는 유닛) | unit | `pnpm vitest run --project unit lib/format-number` | ❌ W0 |

*(13개 행, RESEARCH.md의 표를 그대로 옮김 — 새 테스트를 임의로 추가하지 않음)*

---

## Wave 0 Requirements

- [ ] `test/unit/domain/money.test.ts` — FX-01 · PROJ-03 (세금 규칙 4종 × 절사 표, `splitWithRemainder` 합계 보존, `grossFromTotal` 정수 안전성)
- [ ] `test/unit/domain/rules-gate.test.ts` — PROJ-07 · PROJ-04 (게이트 등록·판정, 단일 진입점)
- [ ] `test/unit/domain/quote-lines.test.ts` — PROJ-02 (차익 서버 계산)
- [ ] `test/unit/domain/project-status.test.ts` — PROJ-04 (상태 전환 4종) **[SUPERSEDED by D-75~D-82 — 다섯 상태·정산 부분 잠금으로 다시 짜야 함, 아래 D-76 항목과 함께 계획]**
- [ ] `test/integration/document-counters-concurrency.test.ts` — PROJ-01 (Issue 10, 두 커넥션 동시 증가)
- [ ] `test/integration/document-numbering.test.ts` — ADMN-09 (서식 → 번호)
- [ ] `test/integration/quote-lines.test.ts` — PROJ-02 · PROJ-05 (서버 계산·버전 충돌·RESTRICT) · D-78·D-83·D-86 확장분(정산=실행가만 편집·조정 줄 경영관리 전용·300줄 상한)
- [ ] `test/integration/reserve-entries.test.ts` — RSV-01 (음수 잔액 거부)
- [ ] `test/e2e/quote-table.spec.ts` — UX-04 · UX-05 (키보드·붙여넣기·전부 저장/거부) · D-91(견적 줄)·D-94 확장분(30줄 페이지 경계·Ctrl 키 이벤트)
- [ ] `db/migrations/0011_*.sql` (파일명 계획에서 확정) — D-75 (project_status 다섯 값 재매핑, 0009는 고쳐 쓰지 않음)
- [ ] `test/unit/domain/projects/auto-transition.test.ts` — D-76 (진행→정산 자동 전환, 주입된 `now`로 멱등성)
- [ ] `test/integration/projects.test.ts` — D-84 (계약 금액 칸 제거·SUM 파생값)
- [ ] `test/integration/projects-list.test.ts` — D-87~90·D-91(목록) (겹침 필터·귀속 연도 합계·제외 건수·offset 페이지)
- [ ] `test/integration/code-tables.test.ts` — D-93 (설명 40자 상한)
- [ ] `test/unit/lib/format-number.test.ts` — D-95 (원화·외화·환율·수량 포맷 통합)
- [ ] Framework install: 없음 — 기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 Excel에서 복사한 여러 칸을 붙여넣기 | UX-05 | Playwright의 클립보드 주입은 브라우저가 쓰는 `text/plain` TSV를 흉내 낼 뿐, 실제 Excel이 쓰는 인용·줄바꿈 이스케이프와 동일하다는 보장이 없다 (RESEARCH.md Gaps) | 실제 Excel에서 3×3 영역(따옴표·줄바꿈 포함 셀 1개)을 복사해 견적 줄 표에 붙여넣고, 저장된 행이 원본과 같은지 확인 |
| 목록 응답 p99 500ms | PROJ-01 성공 기준 1 | 실제 데이터 규모(인트라넷 이전분)가 있어야 의미 있는 측정이 된다 | Phase 8 이전 리허설 데이터로 목록 조회를 반복 측정 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
