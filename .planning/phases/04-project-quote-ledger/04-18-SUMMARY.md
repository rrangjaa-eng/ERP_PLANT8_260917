---
phase: 04-project-quote-ledger
plan: 18
subsystem: projects-list
status: complete
tags: [project-list, profit, profit-rate, all-of-visibility, column-collapse, header-sort, aria-sort, end-date-passed]
requires:
  - phase: 04-17
    provides: rowMoneyExpressions(발행 합 · 기준 · 수익금 · 수익률 행 식) · loadProjectList 입구 · 귀속 라벨
  - phase: 04-48
    provides: 목록 URL 정규화 · 기간 필터 · list-view 조합 함수
  - phase: 04-47
    provides: TableColumn pasteRole · 복사 열 선언
  - phase: 04-49
    provides: ui/table collapseBelow(1280 · 1024) 좁은 PC 열 접기
provides:
  - ProjectListItemDto의 revenueKrw(revenue.issued_amount) · profitBasis · profitKrw(D-87 수익금) · profitRate(견적 · 발행 all-of) · endDatePassed
  - domain/projects/list-view.ts listColumnStep(13자 금액이면 narrow) · ProjectListResult.columnStep · ProjectListResult.sort
  - ui/table TableProps.collapseEarly · TableColumn.sort { href, direction } — 머리글 링크 + 현재 열 하나의 aria-sort + 16px 인라인 SVG 방향 아이콘
  - PROJECT_SORT_KEYS 아홉 키(number · client · name · endDate · revenueKrw · quoteAmountKrw · executionAmountKrw · profitKrw · profitRate), 매출 · 수익률 NULLS LAST
  - viewer 인지 normalizeSort — 볼 수 없는 금액 열 키는 기본 정렬
affects: [04-19]
actuals:
  tokens: 19808
  tasks: 3
  commits: 7
plan_head_before: a1a8b16aa81353e7f361d862bfd723913f924d60
requirements-completed: [PROJ-01]
tech-stack:
  added: []
  patterns:
    - 목록 행 금액 정보 항목은 DtoSpec all-of 배열(InfoItemRef)로 선언 — 투영 전 손 삭제 없음, leak-scan이 두 항목을 펼쳐 본다
    - 정렬 허용 = 허용 목록 ∧ 그 열 정보 항목 visible — 도메인에서 한 번, 리포지토리는 허용 목록만 자체 방어
    - 폰 접힌 줄의 추가 정보(귀속 · 종료일 지남)는 기간 열 summary로 싣는다(Table p2 규칙은 그대로)
    - 정렬 머리글은 GET 링크(§10 이동이면 <a>), page 없는 링크로 1쪽 복귀
key-files:
  created:
    - test/unit/ui/table-header-sort.test.ts
  modified:
    - repositories/projects.ts
    - domain/projects/index.ts
    - domain/projects/list-view.ts
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects-table.tsx
    - app/(app)/projects/projects.module.css
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - ui/table/types.ts
    - test/integration/projects-list.test.ts
    - test/integration/leak-scan.test.ts
    - test/unit/domain/project-list-view.test.ts
    - test/e2e/projects-list.spec.ts
key-decisions:
  - 목록 DTO profitKrw · 수익금 열 · profitKrw 정렬은 모두 D-87 수익금(기준 − 실행가) 한 식 — 옛 줄 차익 합(lineSums.profitSum · 행 profitKrw)은 고아로 제거
  - 볼 수 없는 금액 열로 정렬하면 기본 정렬(종료일 오름차순)로 떨어지고, 화면 aria-sort도 실제로 쓴 정렬(ProjectListResult.sort)을 따른다
  - 375 접힌 줄의 귀속 · 종료일 지남은 기간 열 summary로 해결 — Table의 p2 요약 규칙을 바꾸지 않아 다른 Table 사용처(previous-revision 등)에 영향 없음
  - 금액 셀은 nowrap span 없이 글자 그대로 — 오른쪽 정렬 td가 이미 nowrap
duration: 61m (첫 RED 커밋 06:52Z → 마지막 GREEN 07:53Z, 커밋 전 조사 시간 제외)
completed: 2026-09-27
coverage:
  unit: "test/unit/ui + project-list-view 435/435"
  integration: "projects-list + leak-scan 1063/1063 · quote-lines · quote-line-kinds · project-auto-settlement · quote-revisions 119/119"
  e2e_ci: "CI=true projects-list · projects-filter-reset · projects-list-number-nowrap · a11y · mobile-page-chrome · page-chrome · number-format · quote-table · project-register 420/420"
  gates: "lint 0 · typecheck 0 · lint:sql 0 issues"
---

# Phase 04 Plan 18: 목록 행 금액 · 열 폭 단계 · 머리글 정렬 Summary

목록 행이 매출 · 기준 · 수익금(D-87) · 수익률을 견적 · 발행 all-of 노출로 싣고, 클라이언트 열 · `종료일 지남` · 폭별 열 접기(1280/1024/폰)를 갖췄으며, 머리글이 aria-sort · 인라인 SVG 아이콘 · GET 링크로 아홉 키를 정렬하되 볼 수 없는 금액 열 정렬은 기본 정렬로 떨어진다.

## Tasks

| Task | 내용 | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 (tracer) | 목록 DTO 매출 · 기준 · 수익금 · 수익률(all-of) | 429ec2b | a4b9742 |
| 2 | 클라이언트 열 · 종료일 지남 · 열 폭 · 좁은 PC 접기 · 폰 우선순위 | 491df61 | 8c48501 |
| 3 | 머리글 정렬 · 정렬 키 확장 · 보이지 않는 열 정렬 차단 | e3d4cee | 40f54c0 |
| — | 금액 셀 nowrap span 회귀 수정(Task 1 산) | (기존 S15 backstop E2E) | 1927586 |

## 오케스트레이터 인계 결과

1. **수익금 한 식:** DTO `profitKrw`는 `netProfitKrw`(기준 − 실행가)에서, 정렬은 `money.profit`에서 온다. `lineSums.profitSum`과 리포지토리 행 `profitKrw`(줄 차익 합)는 고아라 제거했다. 통합 테스트에 발행 기준 행(줄 차익 5,000,000 ≠ 수익금 2,000,000)과 profitKrw 오름 · 내림 정렬 단언이 있다.
2. **375 접힌 줄 `2027 귀속`:** 실패 테스트 먼저(491df61) → 기간 열 `summary`가 기간 · 귀속 · 종료일 지남을 싣는다(8c48501). Table p2 로직은 바꾸지 않아 다른 Table 사용처 회귀 없음.
3. **DOM 자가 감사 안 함** — 싼 게이트 + 건드린 스펙(CI=true)만 돌렸다. 전체 `pnpm test`는 돌리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 금액 셀 nowrap span이 S15 backstop을 깨뜨림**
- **Found during:** Task 3 CI=true E2E
- **Issue:** Task 1이 금액 셀을 `<span class=nowrap>`로 감싸 `Range.getClientRects()`가 요소 상자 + 글자 상자 2개를 돌려줬다(실측: 줄바꿈 아님, 같은 좌표 두 개). `projects-list-number-nowrap.spec.ts`가 1을 기대해 실패.
- **Fix:** 오른쪽 정렬 td는 이미 `white-space: nowrap`(Table.module.css `.alignRight`)이라 span을 빼고 글자 그대로 렌더.
- **Files modified:** app/(app)/projects/projects-table.tsx
- **Commit:** 1927586

**2. [Rule 3 - Blocking] E2E가 로딩 스켈레톤 표를 읽음**
- **Found during:** Task 1
- **Issue:** loading.tsx 스트리밍 중 `main table`이 aria-hidden 스켈레톤만 가리켰다(실측 머리글 `번호,프로젝트명,담당 PM,기간,견적,상태`).
- **Fix:** 테스트 선택자 `main table:not([aria-hidden='true'])` + 행 링크 attached 대기(테스트 쪽 원인).
- **Files modified:** test/e2e/projects-list.spec.ts
- **Commit:** a4b9742

### 테스트 계약 변경(이유)

- **integration 「(공백 1) 명세 밖」:** 매출 · 기준 · 수익금이 이제 명세 안이라, 명세 밖 부재 단언을 `netProfitKrw` · `issuedCount`로 좁히고 새 키 값을 `toMatchObject`로 단언. C-01 typeof 목록에서 리포지토리 `profitKrw` 삭제(필드 자체가 고아로 제거됨).
- **04-17 E2E `2027 귀속`:** 폰 접힌 줄(PC에서 display:none)에도 같은 글자가 생겨 strict 모드 위반 → `.filter({ visible: true })` 개수 1로 좁힘. 보이는 곳이 하나라는 원 계약은 유지.
- **Task 3 E2E 첫 상태:** RED 때 `th[aria-sort]` 0개로 썼으나, 기본 정렬(종료일 오름차순)도 현재 정렬이므로 기간 머리글 하나가 `aria-sort="ascending"`이 맞다 — 1개 + 기간 단언으로 고침(내가 쓴 테스트의 오류).
- **통합 quote-off 정렬 픽스처:** C 프로젝트에 견적 0 줄을 두어 NULL quoteSum이 DESC NULLS FIRST로 우연히 맞는 경우를 없앰(RED가 진짜로 실패하게).

### 그 밖의 판단

- `ProjectListDeps.visible`을 추가해 투영 · 정렬 정규화가 같은 visible 주입을 쓴다(단위 테스트가 DB 없이 돈다).
- `canSeeAmount` prop 제거 — 열 존재는 DTO 키 존재로 판정(키 부재는 계급 단위).
- RED 커밋들은 새 타입 부재로 lint/typecheck 오류를 지닌 채 커밋됐다(저장소에 커밋 훅 없음). GREEN 커밋마다 게이트 0.

## WINDOWS

- **#27 해소:** 열 머리글 클릭 정렬 · aria-sort가 구현됐다(40f54c0). 창 상태 전환은 GSD 도구 몫 — `.planning/WINDOWS.md`를 손으로 고치지 않았다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 정렬 키는 허용 목록 + 정보 항목 visible 검사를 지나며(T-04-94), 머리글 링크는 서버가 정규화한 필터 값만 싣는다.

## 오케스트레이터 게이트

- **독립 DOM 감사**(별도 에이전트, `CI=true` 프로덕션 빌드, HEAD b315c2f, 1280·1024·700·375): **30 PASS / 0 FAIL** — 보고서 `/mnt/project-files/phase4-prep/04-18-dom-audit.md`. 04-17 FAIL(375 범위 밖 귀속 라벨)은 재현되지 않았다.
- **Opus 독립 리뷰**(`/mnt/project-files/phase4-prep/04-18-review-opus.md`): BLOCKING 0 · SHOULD-FIX 3 · NIT 3.
  - S1 고침 — 견적 · 실행가 정렬이 NULL 합을 최댓값으로 둠: RED 0c8f427 → 701351f(표시와 같은 `money.quote`/`money.execution`으로 정렬).
  - S2 고침(테스트) — 46a959e: 금액 정렬 키 5 × 가시성 4 × 방향 2 단위 표 테스트 + 매출 NULLS LAST 통합 단언. `SORT_INFO_ITEMS`는 유지 — DTO 명세에서 파생하려면 정렬 키 → DTO 키 매핑이 또 필요해 더 단순하지 않다. 변경 전 코드가 맞아 돌연변이로 검증(맵에서 revenueKrw 삭제 → 4건 실패, nullsLast에서 revenueKrw 제외 → 1건 실패).
  - S3 — 이 절로 해소(DOM 감사 · 전체 게이트 결과를 붙임).
  - NIT 1 고침 — 8ef9aa2(새 CSS 블록을 주석 위로, 규칙 순서 불변).
  - NIT 2 고침 — RED 2953973 → 36f8d0a(필터 줄에 정규화된 `list.sort`).
  - NIT 3 — S2 표 테스트가 보완(가드를 실제로 떨어뜨리면 실패함을 돌연변이로 확인).
- **DOM 감사 메모 `collapsedLine` 스코프** — `test/e2e/projects-list.spec.ts`에는 해당 없음, 고치지 않음: 목록 표는 `phoneRowLink`라 행마다 제 `<tbody>`(주 행 + 접힌 줄)다. 실측(임시 프로브, 되돌림): `tbody:has(link)`가 전체 4개 tbody 중 정확히 1개 · 그 안 tr 2개를 잡아 `nth(1)`은 그 행의 접힌 줄이다. 감사 스펙의 멈춤은 그 스펙 쪽 원인으로 본다.
- **전체 게이트** `CI=true pnpm test`(HEAD 8ef9aa2, 단계별 순차): 단위 1692/1692(117 파일) · 통합 1727/1727(64 파일) · E2E 468 passed(실패 · flaky · skip 0). `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql`(0 issues) 통과.
- **Codex 재확인 필요** — Codex 사용 한도로 교차 리뷰를 Opus가 대신했다. 2026-09-29 이후 Codex로 다시 확인한다.

## Self-Check: PASSED

- 파일: test/unit/ui/table-header-sort.test.ts · ui/table/types.ts · ui/table/Table.tsx · repositories/projects.ts · domain/projects/index.ts · app/(app)/projects/projects-table.tsx 존재
- 커밋: 429ec2b · a4b9742 · 491df61 · 8c48501 · e3d4cee · 1927586 · 40f54c0 — `git rev-list --count a1a8b16..HEAD` = 7
