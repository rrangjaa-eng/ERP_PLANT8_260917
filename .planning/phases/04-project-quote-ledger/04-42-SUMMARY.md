---
phase: 04-project-quote-ledger
plan: 42
subsystem: ui
tags: [reserve, ledger, next-link, pagination, ui-table, confirm-dialog, e2e]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-07 saveReserves · listReserves · ReserveBalanceRejectedError.rejection · 서버 셀 단계 · 04-29 Pagination href(next/link) · 04-46 ConfirmDialog · 04-49 saveLocked · useEditableWidth · collapseBelow · 04-04 useDirtyStorage · 04-09 useCommaInput"
provides:
  - "/pnl 「리저브 대장」 링크(pnl 보기 + reserve.amount일 때만)"
  - "/pnl/reserves 대장 화면 — 9열 편집 표 · 50건 번호 페이지 · 행 id 편집 맵(쪽 이동 보존) · 다른 쪽 잔액 거부 링크 · 삭제 확인 · 좁은 PC 열 접기/보기 전용 · 저장 중 잠금"
  - "saveReservesAction(줄 + archivedIds) + 레지스트리 · 누수 스캔 등록"
  - "domain listReserveReferences · RESERVE_INPUT_REASONS · repositories listProjectOptions"
affects: [04-31, phase-9-RSV-02]

actuals:
  tokens: 21900
  tasks: 3
  commits: 3
plan_head_before: 8e962dc2bdbf80af32397c0f13bb41f57bfb1ee5

tech-stack:
  added: []
  patterns:
    - "서버 페이지 편집 표의 편집 맵 = 행 id → { base(처음 고친 서버 줄), patch } — next/link 쪽 이동에도 남아 다른 쪽 줄을 base로 저장한다"
    - "loading.tsx가 있는 라우트의 권한 404는 레이아웃에서 한 번 더 판정한다(스트리밍 뒤 페이지 notFound는 200)"

key-files:
  created:
    - app/(app)/pnl/reserves/page.tsx
    - app/(app)/pnl/reserves/layout.tsx
    - app/(app)/pnl/reserves/reserves-table.tsx
    - app/(app)/pnl/reserves/actions.ts
    - app/(app)/pnl/reserves/actions.registry.ts
    - app/(app)/pnl/reserves/reserves.module.css
    - app/(app)/pnl/reserves/error.tsx
    - app/(app)/pnl/reserves/loading.tsx
    - test/e2e/reserves.spec.ts
  modified:
    - app/(app)/pnl/page.tsx
    - domain/reserves/index.ts
    - repositories/reserve-entries.ts
    - test/integration/leak-scan.test.ts
    - .planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md

key-decisions:
  - "04-42: 대장 참조(클라이언트·프로젝트·증빙 종류)는 새 domain listReserveReferences가 대장과 같은 두 조건으로 싣는다 — 관리자 메뉴 권한 없는 경영관리도 고를 수 있게"
  - "04-42: /pnl/reserves는 layout.tsx와 page.tsx가 같은 두 조건을 판정한다 — loading.tsx 스트리밍 뒤에도 상태 코드 404"
  - "04-42: 그룹 머리글 잔액은 ui/table groupBy가 글자만 받아 `{클라이언트} · 잔액 {잔액}` 한 글자로 그린다 — 오른쪽 정렬·굵게는 ui/table 변경이 필요해 보고만 했다"

patterns-established:
  - "편집 맵 base+patch: 쪽을 넘는 편집 표는 처음 고친 서버 줄을 들고 있어 그 쪽을 벗어나도 저장 페이로드를 만든다"

requirements-completed: [RSV-01]

coverage:
  - id: D1
    description: "/pnl 링크와 /pnl/reserves 게이트(pnl 보기 + reserve.amount) — 기획 PM·노출 꺼진 계급은 링크 없음 + 404"
    requirement: "RSV-01"
    verification:
      - kind: e2e
        ref: "test/e2e/reserves.spec.ts#기획 PM · 노출 꺼진 계급 — /pnl에 링크가 없고 대장은 404(B-13 · B-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "트레이서 — 링크 → 새 줄 클라이언트 선택 → 저장 → 머리글·줄 잔액 → 저장 뒤 클라이언트 칸 잠김"
    requirement: "RSV-01"
    verification:
      - kind: e2e
        ref: "test/e2e/reserves.spec.ts#리저브 대장 트레이서"
        status: pass
    human_judgment: false
  - id: D3
    description: "50건 번호 페이지(2쪽 같은 머리글·잔액, 범위 밖 → 마지막 쪽) · 쪽 이동 편집 보존(DR-18) · 다른 쪽 잔액 거부 링크(Codex #7)"
    requirement: "RSV-01"
    verification:
      - kind: e2e
        ref: "test/e2e/reserves.spec.ts#51건은 번호 페이지 · 쪽 번호·「이전」 · 다른 쪽 줄의 잔액 거부"
        status: pass
    human_judgment: false
  - id: D4
    description: "음수 거부 오류 셀 + 전부 거부 · 같은 날 입금 뒤 배치 저장 · 삭제 확인 → 일괄 저장 보관 · 쉼표·USD 환율·증빙 설명·kbd"
    requirement: "RSV-01"
    verification:
      - kind: e2e
        ref: "test/e2e/reserves.spec.ts#리저브 대장 — 쪽 · 오류 · 삭제 · 입력"
        status: pass
    human_judgment: false
  - id: D5
    description: "읽기 전용 viewer · 잔액 셀 편집 불가 · 1024 일곱 열 / 1000 여섯 열 보기 전용 · R1 · 저장 중 잠금(DR-3)"
    requirement: "RSV-01"
    verification:
      - kind: e2e
        ref: "test/e2e/reserves.spec.ts#리저브 대장 — 읽기 · 좁은 PC · 저장 중 잠금 · 차단"
        status: pass
    human_judgment: false
  - id: D6
    description: "누수 스캔에 이 라우트 actions.registry 등록(D-38)"
    requirement: "RSV-01"
    verification:
      - kind: integration
        ref: "test/integration/leak-scan.test.ts (CI=true 통합 65 files 1841 passed)"
        status: pass
    human_judgment: false
  - id: D7
    description: "폭별 열 수 · 375 가로 스크롤 0 · 잔액 --fg · 세금계산서 nowrap · 메모 말줄임 · 페이지 번호 44×44 · N=0/1/51 렌더 · 그룹 머리글 잔액 모양"
    verification: []
    human_judgment: true
    rationale: "backstop — 오케스트레이터의 독립 DOM 감사(CI=true, 1280·1024·1000·375)가 실측한다. 실행자는 감사하지 않았다"

duration: 59min
completed: 2026-09-27
status: complete
---

# Phase 4 Plan 42: 리저브 대장 화면 Summary

**`/pnl` 링크(pnl 보기 + reserve.amount)로 들어가는 클라이언트별 리저브 대장 — 9열 ui/table 편집 표, 행 id 편집 맵이 next/link 50건 쪽 이동에도 남아 한 번에 저장되고, 다른 쪽 줄의 잔액 거부는 표 위 한 줄과 그 쪽 링크로, 삭제는 ConfirmDialog → archivedIds 일괄 저장으로 간다. 기획 PM·노출 꺼진 계급은 링크 없음 + 404**

## Performance

- **Duration:** 59 min
- **Started:** 2026-09-27T19:34:13Z
- **Completed:** 2026-09-27T20:33:10Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- 링크·페이지 게이트(B-13 · B-15): `/pnl`은 두 조건일 때만 링크, `/pnl/reserves`는 레이아웃·페이지가 같은 두 조건으로 404
- `saveReservesAction`: zod 가장자리에서 줄 id · clientId · projectId · archivedIds uuid와 구분을 04-07 칸 이유로 검사(PG 22P02 아님, 04-07 리뷰 의무) → `saveReserves` → 거부 봉투(칸 + 잔액 거부 쪽 정보) / 성공 시 지금 쪽 대장
- 표: 날짜 · 구분 · 금액(통화·쉼표·USD 기본 환율·touched) · 잔액(읽기 전용, --fg) · 프로젝트(클라이언트의 것만) · 증빙 종류(설명 한 줄) · 세금계산서 번호(nowrap) · 메모(말줄임) · 클라이언트(새 줄만, 추가 시 열림)
- 50건 번호 페이지 · 편집 맵 base+patch(DR-18) · 다른 쪽 잔액 거부 한 줄 + `{n}쪽에서 고치기`(Codex #7) · 삭제 확인(DR-12) · 1024~1279 일곱 열 / 1024 미만 보기 전용 + R1 · 저장 중 잠금(DR-3) · 힌트 줄 · 복원 줄 · 버림 되돌리기 토스트
- 로드 실패 error.tsx, 로딩 뼈대 loading.tsx
- 04-OPEN-ITEMS 네 줄(S9 해소 · 진입 경로 · D19-1 · D19-11)

## Task Commits

1. **Task 1: 트레이서** — `03af6d9` (feat)
2. **Task 2: 대장 나머지 계약 + 차단 E2E** — `af17080` (feat)
3. **Task 3: 04-OPEN-ITEMS 기록 + 전체 게이트** — `cc161c5` (docs)

## Files Created/Modified
- `app/(app)/pnl/page.tsx` — 리저브 대장 링크(can + visible)
- `app/(app)/pnl/reserves/{page,layout}.tsx` — 두 조건 게이트, 데이터 Promise.all
- `app/(app)/pnl/reserves/reserves-table.tsx` — 편집 표 · 편집 맵 · 거부 · 삭제 · 폭 · 잠금 · 페이지 · 복원
- `app/(app)/pnl/reserves/actions.ts` · `actions.registry.ts` — 액션 + D-38 등록
- `app/(app)/pnl/reserves/reserves.module.css` · `error.tsx` · `loading.tsx`
- `domain/reserves/index.ts` — `listReserveReferences` · `RESERVE_INPUT_REASONS`(기존 칸 이유 상수 재사용)
- `repositories/reserve-entries.ts` — `listProjectOptions`
- `test/integration/leak-scan.test.ts` — 이 라우트 레지스트리 import
- `test/e2e/reserves.spec.ts` — 13케이스

## Decisions Made
- 위 key-decisions 셋. 새 줄 기본값: 날짜 오늘(KST) · 구분 입금 · KRW(알 수 있는 값은 채운다). 새 줄은 만든 쪽에만 보인다(§7-3 (자) 새 줄 고정과 같은 결). 저장 성공 뒤 대장은 액션이 돌려준 지금 쪽으로 바꾼다(revalidatePath와 같은 값).

## Deviations from Plan

### Copy conversions (명사형 규칙 — DECISIONS 2026-09-26 · test/unit/error-copy-noun-style.test.ts)
1. **로드 실패** `리저브 대장을 불러오지 못했습니다 · 다시 시도` → `리저브 대장 불러오기 실패` + 2차 「다시 시도」(projects/error.tsx `프로젝트 목록 불러오기 실패` 꼴 재사용). `app/(app)/pnl/reserves/error.tsx`.
2. **클라이언트 잠김** `클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적어 주세요` → 서버 문자열 `클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적기`(04-07이 이미 바꾼 것) 그대로. 그래서 Task 3 검증 `grep -c '… 적어 주세요' domain/reserves/index.ts`는 0이다(명사형 문구는 1).
3. 가장자리 검증 실패 요약은 견적 원장의 `저장 실패 · 입력값 확인`, 칸 이유는 04-07 상수(`RESERVE_INPUT_REASONS`)를 재사용 — 새 문구 없음. 재전송 불일치 `이미 저장된 줄과 값이 다름 · 새로 고침`, 잔액 `이 줄 뒤 잔액 … · 금액을 줄이거나 입금 줄 먼저`, 다른 쪽 `{날짜} {클라이언트} 잔액 {잔액} · {n}쪽에서 고치기`는 이미 명사형이라 그대로. EMPTY 문구(`리저브 기록이 없습니다 …`)는 규칙 제외(빈 목록)라 스펙 그대로.

### Auto-fixed / 범위 밖 파일
4. **[Rule 3 - Blocking] 참조 목록 도메인 함수** — 관리자 메뉴(admin.vendors · admin.code-tables · projects) 권한 없이 대장을 적는 사람이 클라이언트·프로젝트·증빙 종류를 고를 경로가 없었다. `domain/reserves` `listReserveReferences`(대장과 같은 두 조건) + `repositories/reserve-entries` `listProjectOptions` 추가, 칸 이유 상수를 `RESERVE_INPUT_REASONS`로 내보냄. 커밋 `03af6d9`.
5. **[Rule 1 - Bug] 서버 컴포넌트에서 클라이언트 모듈 함수 호출** — `/pnl`이 `buttonLinkClassName`(Button.tsx `"use client"`)을 불러 렌더 오류. `ui/button/Button.module.css`의 같은 3차 클래스를 직접 씀(ui 무변경). `03af6d9`.
6. **[Rule 1 - Bug] loading.tsx 스트리밍 뒤 404가 200** — 페이지 안 `notFound()`는 이미 나간 200 응답에 찾을 수 없음 화면만 그렸다(loading.tsx를 빼면 404 — 재현 확인). `layout.tsx`가 같은 두 조건을 스트리밍 앞에서 판정, 페이지 판정은 유지(WR-07). `error.tsx`·`loading.tsx`·`layout.tsx`는 files_modified 밖. `af17080`.

### 계약 미달 · 보고(ui 변경 필요 또는 범위 결정)
7. **그룹 머리글 오른쪽 굵은 잔액** — `ui/table` `groupBy`가 글자만 받아 `<td colSpan>` 하나로 그린다. `ui/` 수정 금지라 `{클라이언트} · 잔액 {잔액}` 한 글자로 그렸다(값·서버 계산은 계약대로, 오른쪽 정렬·700 굵기는 미달). 해소하려면 ui/table에 그룹 머리글 보조 칸(prop) 추가가 필요 — 오케스트레이터 판단 대상.
8. **붙여넣기(Ctrl+V) 미구현** — plan behavior·E2E에 없고 applyPaste 배선이 커서 이번 범위에서 뺐다. 힌트 줄에서 제외(되는 키만: 이동 · 복사 · 취소 · 새 줄 · 줄 삭제). 「숨은 열은 붙여넣기 논리 순서에 남는다」는 해당 없음.
9. Codex #7 E2E 숫자는 준비 데이터 차이로 `-310,000`(plan 예시 `-800,000`). 「보관함에 리저브 항목」은 보관함 화면 대신 DB `archived_at`으로 확인(경영관리 테스트 계급에 `admin.archive` 없음).
10. **Task 3 ② 독립 DOM 감사**는 하지 않았다(오케스트레이터 지시 — 별도 에이전트). 전체 E2E는 PR CI 몫(CLAUDE.md §5·§6) — 로컬은 lint · typecheck · lint:sql · build · 단위 · 통합(CI=true) · reserves.spec(CI=true)만.

**Total deviations:** 3 문구 전환 + 3 auto-fix + 4 보고. **Impact:** 7번(머리글 모양)과 8번(붙여넣기)은 계약 미달 — 나머지는 범위 확장 없음.

## Issues Encountered
- WebServer 로그 `The destination stream closed early` — 스트리밍 중 이동(page.goto) 때 나는 로그, 테스트 결과와 무관.

## Checks
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues(19 files) · `pnpm build` 0
- 단위 118 files 1704 passed · 통합(CI=true) 65 files 1841 passed(leak-scan 포함) · `CI=true` reserves.spec 13 passed · revenue-section.spec 함께 26 passed(Task 2 검증)
- 금지 경로(ui/table · ui/shell · tokens.css · menus.ts) 작업 트리·(04-42) 커밋 변경 0 · package.json/pnpm-lock 변경 0

## For the DOM audit (orchestrator)
- 폭 1280(9열) · 1024(7열, 편집) · 1000(6열 읽기 표, 추가·1차 없음) · 375(P1 날짜·구분·금액 + 접힌 줄 프로젝트·잔액·메모)에서 가로 스크롤 0
- 잔액 셀 색 `--fg` · 세금계산서 번호 nowrap · 긴 메모 한 줄 말줄임 · 폰 페이지 번호 44×44 · N=0/1/51 · 그룹 머리글 글자(7번 편차)

## Next Phase Readiness
- 7번(머리글 보조 칸)은 ui/table 소유 플랜이나 사용자 결정이 필요하다. Phase 9 RSV-02는 같은 액션·편집 맵 위에 충당을 얹는다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-27*

## Self-Check: PASSED
- 파일 14개 FOUND · 커밋 03af6d9 · af17080 · cc161c5 FOUND
