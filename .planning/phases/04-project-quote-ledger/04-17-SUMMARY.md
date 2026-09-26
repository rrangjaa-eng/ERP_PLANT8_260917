---
phase: 04-project-quote-ledger
plan: 17
subsystem: projects-list
status: complete
tags: [project-list, this-year-view, attribution, totals-above-table, profit-basis, bigint, pagination, offset]
requires:
  - phase: 04-29
    provides: lib/paging(clampPage · pageCountFrom · LIST_PAGE_SIZE) · ui/pagination(Pagination · pageRangeText)
  - phase: 04-11
    provides: settleForProjectList(목록 진입 자동 전환 판정)
  - phase: 04-12
    provides: 견적 줄 보관 · 현재 차수
  - phase: 04-16
    provides: revenue_entries(발행·입금 줄)
provides:
  - domain/projects/list-view.ts — resolveListRange · attributionLabel · exclusionText · totalsTitle · profitBasisFor · bucketTotal · resolveListPage
  - loadProjectList(viewer, query, deps?) — 목록 화면의 유일한 입구(판정 → 집계 → 쪽 보정 → 그 쪽 목록 → projectMany 투영), 결과 { year, rows, totals, total, page, pageCount }
  - 리포지토리 listProjectsPage({ scope, filter, sort, offset, limit }) · aggregateProjects(귀속 구간별 한 문장 GROUP BY)
  - ProjectListRow의 revenueKrw · issuedCount · profitBasis · netProfitKrw(수익금) · profitRate
  - ProjectListTotals DTO(registerDto) · app/(app)/projects/list-totals.tsx(표 위 합계 줄)
  - 목록 50건 번호 페이지(Pagination 배선, 범위 밖 번호는 마지막 쪽)
affects: [04-18, 04-48, 04-19]
actuals:
  tokens: 30918
  tasks: 2
  commits: 4
plan_head_before: 93590d89b11234c8d3b1ef13e0f39947a7aaf471
tech-stack:
  added: []
  patterns:
    - 돈 합계는 SQL에서 ::bigint, 리포지토리 경계에서 mapWith(Number) — 21억 초과도 정확한 JS number
    - 발행 합은 행 필터를 지난 프로젝트마다 LEFT JOIN LATERAL(revenue_entries_project_kind_date_idx), 견적 줄 합은 현재 차수만
    - 귀속 구간 CASE는 GROUP BY 1 — 날짜 파라미터가 식 반복으로 다른 번호를 받지 않게
    - 쪽 보정은 lib/paging 한 곳, 목록 도메인은 조합만(resolveListPage)
key-files:
  created:
    - domain/projects/list-view.ts
    - app/(app)/projects/list-totals.tsx
    - test/unit/domain/project-list-view.test.ts
  modified:
    - repositories/projects.ts
    - domain/projects/index.ts
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects-table.tsx
    - app/(app)/projects/projects.module.css
    - app/(app)/projects/filter-bar.tsx
    - test/integration/projects-list.test.ts
    - test/integration/project-auto-settlement.test.ts
    - test/integration/quote-lines.test.ts
    - test/integration/quote-revisions.test.ts
    - test/integration/quote-line-kinds.test.ts
    - test/e2e/projects-list.spec.ts
    - test/e2e/projects-filter-reset.spec.ts
key-decisions:
  - "04-17: 목록 입구는 loadProjectList 하나 — 옛 도메인 listProjects·aggregateProjects·ProjectAggregateDto를 지우고 호출자 테스트를 옮겼다"
  - "04-17: 리포지토리 행의 netProfitKrw가 수익금(기준 − 실행가)이고 profitKrw는 04-18이 DTO 뜻을 바꿀 때까지 줄 차익 합으로 남긴다"
  - "04-17: 쪽 수·쪽 보정은 list-view.resolveListPage가 lib/paging(clampPage·pageCountFrom)을 조합해 만든다 — 0건이면 목록 문장을 보내지 않는다"
requirements-completed: [PROJ-01, UX-04]
duration: 43min
completed: 2026-09-26
---

# Phase 4 Plan 17: 올해 보기 · 표 위 귀속 합계 · 50건 번호 페이지 Summary

**조건 없는 목록을 올해(KST) 보기로 열고, 종료 해 귀속으로 합계를 표 위 한 줄에 더하며(수익금 기준은 계약 7 — 정산·완료 + 발행 줄 있음일 때만 발행), 목록을 OFFSET 50건 번호 페이지로 나눴다 — 돈 합계는 전부 bigint → JS number.**

## Performance

- 시작 2026-09-26T08:47Z · 끝 09:30Z 무렵(약 43분)
- 작업 2개 · 커밋 4개(RED 2 · GREEN 2) + 이 문서 커밋
- 파일 16개 변경(+1,449 / −435), 의존성 · 마이그레이션 변경 없음(`package.json`·`pnpm-lock.yaml`·`drizzle/` diff 0 — T-04-SC)

## Tasks

| Task | 이름 | RED | GREEN |
|------|------|-----|-------|
| 1 (tracer) | 올해 보기 · 표 위 귀속 합계 · 수익금 기준 · bigint 합계 | 016c8e5 | 43e66d1 |
| 2 | 번호 페이지 50건 — Pagination 배선 · OFFSET · 범위 밖 번호 보정 · 그룹 머리글 반복 · 읽기 순서 | e330e68 | 6d2bc70 |

Task 1 트레이서 게이트: `auto_advance` false · `human_verify_mode` end-of-phase이고 verify가 자동 검증뿐이라 verify를 다시 돌려 초록을 확인한 뒤 Task 2로 넘어갔다.

## RED 증거

- Task 1 — 단위 14건 · 통합 18건이 단언으로 실패(list-view · loadProjectList는 빈 골격만 둬서 import 오류가 아닌 단언 실패).
- Task 2 — 단위 4건(`expected +0 to be 56` · offset 0 ≠ 50 · 0건에서 listPage 호출), 통합 1건(`[50, 50, 50]` ≠ `[50, 50, 25]`), `CI=true` E2E 1건(페이지 줄 `1–50 / 51건` 없음)이 단언으로 실패. 프로덕션 빌드의 타입 검사가 테스트 파일까지 보므로 `offset`·`page`·`pageCount` 타입과 `bucketTotal`은 빈 골격으로 RED 커밋에 넣었다.

## 검증(실행 결과)

- 단위: `project-list-view` · `ui/pagination` · `lib/paging` — 3 파일 74/74 통과
- 통합: `projects-list` · `project-auto-settlement` · `quote-lines` · `leak-scan` · `quote-revisions` · `quote-line-kinds` — 6 파일 1,114/1,114 통과
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues
- `bash scripts/reset-test-db.sh && CI=true pnpm playwright test test/e2e/projects-list.spec.ts test/e2e/projects-filter-reset.spec.ts` — 6/6 통과(webServer가 `pnpm build && pnpm start`로 프로덕션 빌드 성공)
- 수용 grep: `더 보기|loadMore`(filter-bar 제외) 0 · `PROJECT_LIST_*_LIMIT`·`params.count` 0 · `.offset(` 1 · `list-view.ts`가 `lib/paging` import, 쪽 보정 정의 0 · `sum(...)::int` 0 · 도메인 `listProjects`·`aggregateProjects` 호출 0

## 기준 쿼리 계획(EXPLAIN — 엔지 리뷰 C §4 P2 · T-04-315)

로컬 `erp_test`, 프로젝트 250행 중 검색어로 125행이 걸리는 2026 보기, `loadProjectList(SYSTEM_VIEWER, { year: 2026, search, page: 1 })`가 보낸 두 문장을 같은 파라미터로 `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)`.

집계(귀속 구간 GROUP BY — Execution 1.019 ms):
```
GroupAggregate (rows=1)
  -> Sort (rows=125)
     -> Nested Loop Left Join (rows=125)
        -> Nested Loop Left Join  Join Filter: quote_lines.revision_id = quote_revisions.id
           -> Nested Loop Left Join  Filter: name/number/vendor ILIKE
              -> Merge Left Join (projects.id = quote_revisions.project_id)
                 -> Seq Scan on projects  Filter: archived_at IS NULL AND (겹침 조건 OR 기간 미정 규칙)
                 -> Unique -> Sort (project_id, seq DESC) -> Seq Scan on quote_revisions   ← 현재 차수
              -> Index Scan using vendors_pkey
           -> GroupAggregate (quote_lines.revision_id)
              -> Nested Loop Semi Join (revision_id IN 현재 차수)  -> Seq Scan on quote_lines Filter: archived_at IS NULL
        -> Aggregate (loops=125)
           -> Index Scan using revenue_entries_project_kind_date_idx  Index Cond: project_id = projects.id AND kind = 'issue'
```
목록(1쪽 50행 — Execution 1.395 ms):
```
Limit (rows=50)
  -> Sort  Key: (end_date IS NULL), date_trunc('month', end_date), end_date, projects.id   top-N heapsort
     -> (집계와 같은 조인 트리 + teams_pkey · users_pkey Index Scan)
        -> Aggregate (loops=125) -> Index Scan using revenue_entries_project_kind_date_idx (kind = 'issue')
```
두 선택의 근거: 견적 줄 합은 현재 차수 id 반세미 조인으로 줄여 모든 차수·모든 프로젝트 GROUP BY를 피했고, 발행 합은 필터를 지난 프로젝트마다 LATERAL 인덱스 스캔이다. 규모가 커지면 `projects` Seq Scan과 `quote_lines` Seq Scan이 먼저 보일 지점이다(지금 30명 규모에서는 1~2 ms).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `filter-bar.tsx` 「전체 연도」 옵션 값 `""` → `"all"`**
- 04-48 소유 파일이지만 D-89(`year=all`이 전체 연도, 조건 없는 URL은 올해)가 이 값 없이는 성립하지 않아 한 줄만 바꿨다. 11행 머리 주석은 04-48에 남겼다. 커밋 43e66d1

**2. [Rule 1 - Bug] 기존 E2E `projects-filter-reset.spec.ts`의 연도 기본값 기대를 올해로**
- D-89로 기본 연도가 빈 값에서 올해(KST)가 됐다. 커밋 43e66d1

**3. [Rule 1 - Bug] 04-12 `quote-lines` (k)에 종료일 부여**
- D-90으로 종료일 없는 건은 합계 밖(기간 미정)이라 합계 0이 됐다 — 케이스의 뜻(목록·합계 실행가 일치)을 지키려고 `endDate`를 넣었다. 커밋 43e66d1

**4. [Rule 3 - Blocking] `loadProjectList` deps에 `scope`·`settle` 추가**
- DB 없는 단위 테스트(`list_failed` 로그 · 읽기 순서)에 필요했다. `emptyKind`용 건수 조회는 04-48 몫이라 넣지 않았다.

**5. [계획 해석] 리포지토리 행 `netProfitKrw` = 수익금, `profitKrw`는 줄 차익 합 유지**
- DTO 명세의 `profitKrw` 뜻을 바꾸는 것은 04-18이다 — 그때까지 두 칸이 함께 있다.

**6. [Rule 3 - Blocking] 옛 입구 호출자 테스트 이관**
- 04-05 `projects-list` 케이스 · 04-11 (f)·(f2 — 판정 없는 리포지토리 직접 호출)·(f3)·(l) · 04-12 (k) · 04-13 `quote-revisions`·`quote-line-kinds`의 `listedExecution`을 `loadProjectList`로 옮겼다. 옛 (b) `limit: 1` 케이스는 Task 2의 125행 페이지 케이스로 바꿨다.

**7. [Rule 1 - Bug] 통합 (a) 픽스처 수정**
- 2027-01-15 종료 픽스처가 2026 범위와 겹치지 않아 필터가 옳게 뺐다 — `startDate 2026-12-20`을 넣어 걸침 건으로 만들었다(systematic-debugging으로 원인 확인).

**8. [계획 해석] `projectFilterConditions`가 scope를 받지 않는다**
- D18로 보관 제외가 늘 켜져 `includeArchived` 분기가 사라졌다.

**9. [계획 해석] `resolveListPage`를 `list-view.ts`에 둠**
- 수용 기준(`list-view.ts`가 `lib/paging`을 import, 쪽 보정 정의는 없음)을 지키려고 `bucketTotal` 옆에 lib/paging의 `pageCountFrom`·`clampPage`를 조합만 하는 순수 함수를 뒀다. 새 보정 규칙은 없다.

## 04-18에 넘기는 메모

- 리포지토리 `ProjectListRow.netProfitKrw`가 수익금(기준 − 실행가), `profitKrw`는 아직 줄 차익 합. `revenueKrw`·`issuedCount`·`profitBasis`·`profitRate`도 행에 실려 있으나 DTO 명세에는 아직 없다(투영이 응답에서 뺀다 — 통합 「명세 밖 행 칸」 단언).
- 목록과 합계는 두 문장이다(E2-08 · T-04-370 accept).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: domain/projects/list-view.ts · app/(app)/projects/list-totals.tsx · test/unit/domain/project-list-view.test.ts
- FOUND 커밋: 016c8e5 · 43e66d1 · e330e68 · 6d2bc70 (`git rev-list --count 93590d8..HEAD` = 4)
