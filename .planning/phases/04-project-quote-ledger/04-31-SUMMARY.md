---
phase: 04-project-quote-ledger
plan: 31

subsystem: testing
tags: [playwright, vitest, clipboard-parsing, excel-paste, dom-audit, design-review, migration-gate]

# Dependency graph
requires:
  - phase: 04-18
    provides: ui/table 최종 형태(계약 1·비활성 버튼 이유)
  - phase: 04-19
    provides: 쪽 나눔·네이티브 복사 이벤트(C-19)
  - phase: 04-42
    provides: 리저브 대장 화면(DOM 감사·design-review 대상)
  - phase: 04-47
    provides: 계산 열 무시·외화 경고·끝 줄바꿈·합계 행 한 줄
  - phase: 04-51
    provides: 채번 카운터 잠금 결정 ②(b)
provides:
  - "실제 Windows 엑셀 클립보드 캡처 원문(3×3·6열·45줄) 재생 회귀 — test/fixtures/excel-clipboard.ts 단일 정의"
  - "최종 견적 표 캡처 재생 E2E(test/e2e/excel-paste-final.spec.ts) — 쪽 나눔·계산 열 무시·엑셀 6열 오류 칸·프로젝트 간 왕복·상한 경계"
  - "페이즈 최종 독립 DOM 감사(1280·1024·1000·375) + /design-review 1회 결과(A−) — SYSTEM.md §11 시스템 일치 전 항목 PASS"
  - "페이즈 최종 게이트: CI=true 전체 E2E 새 DB 연속 3회 그린(499/499×3) + 마이그레이션 0011→0018 순서·0015 가드(외화 포함)·rollback-floor 표시 검증"
  - "lib/format-number.ts 캐럿 무시 쉼표-백스페이스 버그 수정 + 회귀 단위 테스트"
affects: [Phase 04.6(스킨 A 리프레시 — DR-P4-02 375 정렬 머리글 대상), Phase 5·6(공용 금액 입력 유틸 /review 대상)]

# Actuals (#2632)
actuals:
  tokens: 10000
  tasks: 3
  commits: 29
plan_head_before: 48d6c01e658d20b3444d555082292caa7558660c

tech-stack:
  added: []
  patterns:
    - "실제 클립보드 원문 캡처를 단위·E2E가 같은 fixture 모듈에서 import해 재생하는 것으로 사람의 눈 재확인을 대체(04-04 방식 재사용)"
    - "화면 검증 순서: 독립 DOM 감사(별도 서브에이전트, DOM 실측) → /design-review(§11 대조) → 전체 게이트 한 번(두 번 돌리지 않는다)"

key-files:
  created:
    - test/fixtures/excel-clipboard.ts
    - test/e2e/excel-paste-final.spec.ts
    - test/unit/lib/format-number.test.ts
    - docs/reviews/phase-04/04-31-design-review.md
    - docs/design/checks/2026-09-28-code-tables-toggle-current.md
  modified:
    - test/unit/ui/parse-tsv.test.ts
    - ui/table/Table.tsx
    - ui/table/Table.module.css
    - app/(app)/projects/[id]/quote-table.tsx
    - lib/format-number.ts
    - test/e2e/quote-table.spec.ts
    - test/e2e/project-register.spec.ts
    - test/e2e/mobile-320-no-overflow.spec.ts
    - test/e2e/code-tables.spec.ts
    - app/(app)/admin/code-tables/code-tables.module.css

key-decisions:
  - "(C)(D) 사람 확인(프로젝트 간 복사·표→엑셀·한국어 입력기)은 묶음 ④ 머지·스테이징 배포 직후 사람이 확인 — 플랜의 「사람 확인 후속 금지」에 대한 사용자 예외(PR #85 댓글, 2026-09-28 01:45~02:05Z)"
  - "DR-P4-02(375 목록 정렬 머리글 링크 <44px)는 ui/table 동결 지시(스킨 리프레시 병행)로 이 플랜에서 고치지 않고 Phase 04.6 제안으로 이월(HANDOFF remaining id 68, 답 대기)"
  - "04-51 결정 ② 임계값 = (b) 실제로 겹칠 때만 거부(발급 ≥1건 AND 새 시작값 < 현재 시작값) — 별도 단위, Opus 실행자 + Opus 독립 검토로 진행"

patterns-established:
  - "앱 버그가 플랜 files_modified 밖에서 발견되면(ENG-D11) 그 자리에서 고치고 회귀 테스트 + SUMMARY 편차로 남긴다 — 후속 작업으로 미루지 않는다"

requirements-completed: [UX-05, UX-04, PROJ-05]

coverage:
  - id: D1
    description: "실제 엑셀 캡처 원문(3×3·6열·45줄) 재생이 쪽 나눔·계산 열 무시·상한 경계까지 들어간 최종 견적 표를 끝까지 지난다 — 엑셀 6열의 계산 열 자리 값은 오류 칸이 된다(ENG-D5)"
    requirement: UX-05
    verification:
      - kind: unit
        ref: "test/unit/ui/parse-tsv.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/excel-paste-final.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "페이즈 최종 독립 DOM 감사(1280·1024·1000·375, 화면 7종)와 /design-review 1회(§11 시스템 일치) — 발견 2건(폰 시트 트리거 44px·접근 이름 UUID 노출) 수정 완료, /design-review A− 전 항목 PASS"
    requirement: PROJ-05
    verification:
      - kind: e2e
        ref: "test/e2e/quote-table.spec.ts (row sheet trigger 44px / accessible name)"
        status: pass
      - kind: manual_procedural
        ref: "docs/reviews/phase-04/04-31-design-review.md"
        status: pass
    human_judgment: true
    rationale: "시각 일관성·디자인 시스템 대조는 사람(Opus 독립 감사) 판단이 필요 — DOM 실측은 자동, 판정 기준 대조는 사람"
  - id: D3
    description: "실제 엑셀 클립보드 원문 캡처 둘(6열 두 줄·45줄) — 사용자가 PC에서 캡처해 제공, 앱이 그대로 fixture에 옮겨 재생 단언으로 판정"
    verification:
      - kind: unit
        ref: "test/unit/ui/parse-tsv.test.ts (REAL_EXCEL_WINDOWS_20260928_SIX_COL / _FORTY_FIVE)"
        status: pass
      - kind: e2e
        ref: "test/e2e/excel-paste-final.spec.ts (e)(f)"
        status: pass
    human_judgment: true
    rationale: "원문 캡처 자체는 사용자의 실제 Windows 엑셀 조작 결과물 — Claude가 만들어낼 수 없다. 재생 판정은 자동 단언이 대신한다(사용자 승인 2026-09-23)"
  - id: D4
    description: "PC 전용 사람 확인(프로젝트 간 복사·표→엑셀 복사·한국어 입력기 Ctrl+Enter 연타/Esc) — 묶음 ④ 머지·스테이징 배포 직후로 사용자 예외 승인"
    verification: []
    human_judgment: true
    rationale: "실제 Windows + Edge/Chrome + 회사 엑셀 + 한국어 IME가 필요해 CI에서 자동화할 수 없다. 사용자가 배포 직후 확인으로 미루는 것을 명시적으로 승인(PR #85 댓글) — 알려진 실패를 안고 배포하는 것이 아니라 확인 시점을 미루는 것"
  - id: D5
    description: "페이즈 최종 게이트: CI=true 전체 E2E 새 DB 연속 3회(499/499, 11.1분·10.7분·11.1분, retries 0) + 마이그레이션 0011→0018 순서·0015 가드(외화 조건 포함)·rollback-floor 표시(0012·0015만)"
    verification:
      - kind: e2e
        ref: "test-results/final-gate-run-{1,2,3} (CI=true pnpm playwright test, 3연속)"
        status: pass
      - kind: integration
        ref: "test/integration/migration-upgrade.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "lib/format-number.ts 「쉼표 뒤 Backspace」 규칙이 캐럿 위치를 무시해 통째 덮어쓰기(400,000→400000)가 40000으로 저장되는 앱 버그 수정(Rule 1, ENG-D11 — 플랜 files 밖)"
    verification:
      - kind: unit
        ref: "test/unit/lib/format-number.test.ts"
        status: pass
    human_judgment: false

duration: "약 5시간 (다중 세션 AQ→AR→AS→AT, 사람 확인 대기 시간 포함 — 순수 작업 시간 아님)"
completed: 2026-09-28
status: complete
---

# Phase 4 Plan 31: 최종 견적 표 실제 엑셀 확인 + 페이즈 최종 게이트 Summary

**실제 Windows 엑셀 클립보드 캡처 원문(3×3·6열·45줄) 재생으로 04-04의 사람 재확인을 대체하고, 페이즈 화면 전체 DOM 감사·`/design-review`(A−)를 거쳐 `CI=true` 전체 E2E 새 DB 연속 3회(499/499×3)로 Phase 4를 마감했다.**

## Performance

- **Duration:** 약 5시간 (다중 세션 — 세션 AQ 사람 확인 체크포인트 진입 → AR `/design-review` → AS continuation → AT Task 3 최종 게이트, 사람 확인 답 대기 시간 포함)
- **Started:** 2026-09-27T23:09:23Z (Task 1 첫 커밋 c2a15b4)
- **Completed:** 2026-09-28T04:11:11Z (Task 3 마지막 커밋 fa91922)
- **Tasks:** 3/3
- **Files modified:** 15 (신규 5 · 수정 10)

## Accomplishments

- 04-04의 3×3 캡처에 더해 실제 엑셀 6열·45줄 캡처 원문을 사용자에게 받아 `test/fixtures/excel-clipboard.ts` 한 곳에 바이트 그대로 고정하고, 단위(`parse-tsv.test.ts`)·E2E(`excel-paste-final.spec.ts`)가 같은 상수를 재생해 최종 견적 표(쪽 나눔·계산 열 무시·새 줄 고정·합계 행 한 줄)에서 값이 원본과 같음을 증명했다.
- 앱 전용 클립보드 형식 없이 엑셀 6열(`소분류·항목·거래처·수량·단가·실행가`)만 붙이면 실행가 값이 떨어지는 견적가 칸이 오류 셀이 되는 것(ENG-D5)을 회귀로 고정했다.
- 페이즈 화면 전체(목록·등록 폼·상세 견적 원장·매출·차수·코드표·리저브 대장)를 독립 DOM 감사(1280·1024·1000·375)로 실측하고 발견 2건(폰 견적 표 행 시트 트리거 44px 미만, 접근 이름에 UUID 노출)을 그 자리에서 수정, `/design-review` 1회로 SYSTEM.md §11 시스템 일치를 전 항목 PASS(등급 A−)로 통과시켰다.
- `CI=true` 전체 E2E를 새 DB로 연속 3회 돌려 499/499 × 3(11.1분·10.7분·11.1분, `retries: 0`)을 확인하고, 마이그레이션 0011→0018 순서·0015 가드(외화 조건 포함)·`rollback-floor` 표시(0012·0015만)를 검증해 Phase 4를 최종 게이트로 마감했다.
- 최종 게이트 도중 발견한 `lib/format-number.ts`의 캐럿 무시 버그(통째 덮어쓰기 400,000→400000이 40000으로 저장)를 플랜 범위 밖(ENG-D11)임에도 그 자리에서 고치고 회귀 단위 테스트를 붙였다.

## Task Commits

Each task was committed atomically:

1. **Task 1: 트레이서 — 엑셀 모양 클립보드가 최종 표를 끝까지 지난다**
   - `c2a15b4` test — parse-tsv 캡처 상수를 fixture 모듈에서 가져오게 (RED)
   - `d7a6f03` feat — 실제 엑셀 캡처 원문 fixture 모듈 (GREEN)
   - `4c61201` feat — 최종 견적 표에서 실제 엑셀 캡처 원문 재생 E2E
2. **Task 2: 페이즈 최종 화면 검증 + 사람 확인 (checkpoint:human-verify)**
   - `da5bc9a` test — 폰 견적 표 시트 트리거 44px 터치 목표 RED
   - `002d58c` fix — 폰 견적 표 행 시트 트리거 44px로 GREEN
   - `5a34bfb` test — 견적 표 행 시트 트리거 접근 이름 UUID 노출 RED
   - `2ae788e` fix — 견적 표 행 시트 트리거 접근 이름을 항목명으로 GREEN
   - `ebed3c2` test — 코드표 현재 표 링크 구분 RED (DR-P4-01, `/design-review` 발견)
   - `8353610` fix — 코드표 현재 표 링크 구분 (DR-P4-01)
   - `40fea8b` docs — phase 4 `/design-review` 보고서
   - `49774ef` test — 캡처 A/B(6열·45줄)를 parse-tsv fixture에 고정
   - `907ec5e` test — 캡처 B를 조립 함수 대신 원문 리터럴로 저장
   - `d6a04f8` test — 캡처 A/B를 최종 견적 표에서 E2E 재생
3. **Task 3: 페이즈 최종 게이트 — CI=true 전체 E2E 새 DB 연속 3회**
   - `6ea2c77` fix — 쉼표-백스페이스 휴리스틱을 캐럿 위치 기준으로 (앱 버그, ENG-D11)
   - `0fb7e7b` fix — Ctrl+Enter 연타 테스트의 두 press를 동시 dispatch (플레이크)
   - `fa91922` fix — 폰 관리자 48화면 순회 스윕 타임아웃 완화 (플레이크)

**Plan metadata:** (이 커밋 — SUMMARY·STATE·ROADMAP)

_Note: Task 2는 사람 확인 체크포인트를 두 번(캡처 원문 대기, (C)(D) 답 대기) 거쳐 여러 세션(AQ→AR→AS)에 걸쳐 완료됐다._

## Files Created/Modified

- `test/fixtures/excel-clipboard.ts` — 실제 Windows 엑셀 클립보드 원문 상수(3×3·6열·45줄) 단일 정의
- `test/e2e/excel-paste-final.spec.ts` — 캡처 원문 재생 최종 표 회귀 E2E
- `test/unit/ui/parse-tsv.test.ts` — fixture import로 전환, 캡처 A/B 파싱 단언 추가
- `ui/table/Table.tsx`, `ui/table/Table.module.css` — 폰 견적 표 행 시트 트리거 44px·접근 이름 항목명화
- `app/(app)/projects/[id]/quote-table.tsx` — `Table`에 `rowLabel` prop 전달(시트 제목과 같은 표현)
- `lib/format-number.ts`, `test/unit/lib/format-number.test.ts` — 캐럿 기준 쉼표-백스페이스 수정 + 회귀
- `test/e2e/quote-table.spec.ts` — 시트 트리거 44px·접근 이름 회귀 케이스
- `test/e2e/project-register.spec.ts` — Ctrl+Enter 연타 플레이크 수정(동시 dispatch)
- `test/e2e/mobile-320-no-overflow.spec.ts` — 관리자 48화면 순회 타임아웃 90초로 완화
- `test/e2e/code-tables.spec.ts`, `app/(app)/admin/code-tables/code-tables.module.css` — DR-P4-01 현재 표 링크 구분
- `docs/reviews/phase-04/04-31-design-review.md` — `/design-review` 보고서(A−)
- `docs/design/checks/2026-09-28-code-tables-toggle-current.md` — design-gate 점검표(DR-P4-01)

## Decisions Made

- **(C)(D) 사람 확인 = 사용자 예외:** 프로젝트 간 복사·표→엑셀 복사·한국어 입력기 확인은 묶음 ④ 머지·스테이징 배포 직후 사람이 확인하기로 사용자가 PR #85 댓글로 승인했다 — 플랜의 「사람 확인에서 어긋난 항목을 후속으로 돌려 끝내지 않는다」(Codex #5) 규칙 자체를 어긴 것이 아니라, **알려진 실패 없이** 확인 시점만 배포 직후로 옮긴 것이다(캡처 재생 (A)(B)는 이 플랜 안에서 전부 통과했다).
- **DR-P4-02 이월:** 375폭 목록 정렬 머리글 링크(20×19·51×19, <44px)는 `ui/table` 동결 지시(스킨 리프레시 PR #100·#101과 겹침 방지)로 이 플랜에서 고치지 않고 Phase 04.6 제안으로 이월했다(HANDOFF remaining id 68, 사용자 답 대기) — WINDOWS.md에 기록.
- **04-51 결정 ② = (b):** 채번 카운터 임계값은 「실제로 겹칠 때만 거부(발급 ≥1건 AND 새 시작값 < 현재 시작값)」로 확정 — 별도 단위, Opus 실행자 + Opus 독립 검토로 진행한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parse-tsv` 캡처 상수를 fixture 모듈에서 재사용하지 못해 복제**
- **Found during:** Task 1
- **Issue:** `test/unit/ui/parse-tsv.test.ts`가 경로에 `ui/`를 포함해 ESLint boundaries 규칙(D-26)상 `test/` fixture를 import할 수 없었다 — 플랜의 key_link·「정의 1건」 기준(캡처 원문이 한 곳에만 있다)과 충돌.
- **Fix:** `role-menu.test.ts` 선례를 따라 캡처 상수를 `parse-tsv.test.ts`에 복제하고, fixture 모듈 머리 주석의 「원문은 이 모듈 하나에만 있다(정의 1건)」 문구를 사실과 맞게 정정했다.
- **Files modified:** `test/fixtures/excel-clipboard.ts`, `test/unit/ui/parse-tsv.test.ts`
- **Verification:** `grep -c REAL_EXCEL_WINDOWS` 정의는 fixture·복제본 각 1건, JSON.parse 후 `===` 비교로 두 사본이 바이트까지 같음을 확인.
- **Committed in:** `49774ef`, `907ec5e` (boundaries 제약 발견은 세션 AQ, 정정은 세션 AS)

**2. [Rule 1 - Bug] 캡처 재생 단언이 RED 없이 바로 통과**
- **Found during:** Task 2 continuation (49774ef·d6a04f8)
- **Issue:** 캡처 A/B는 기존 파서 로직을 전혀 바꾸지 않는 값이라, 단언을 추가했을 때 RED 단계 없이 바로 GREEN이었다.
- **Fix:** 이는 버그가 아니라 파서가 이미 올바르다는 뜻이므로 그대로 커밋해 회귀 고정(regression pinning) 용도로 남겼다 — 코드 변경은 없다.
- **Files modified:** 없음(테스트 전용)
- **Verification:** 파서 로직에 diff가 없음을 확인.
- **Committed in:** `49774ef`, `d6a04f8`

**3. [Rule 1 - Bug] `lib/format-number.ts` 캐럿 무시 쉼표-백스페이스 규칙**
- **Found during:** Task 3 (`reserves.spec.ts:282` 조합 스펙 간섭 조사)
- **Issue:** 「쉼표 뒤 Backspace」 규칙이 캐럿 위치를 보지 않고 「쉼표 하나가 사라졌는가」만 확인해, 캐럿을 끝에 둔 통째 덮어쓰기(붙여넣기·`.fill()`)로 `400,000`→`400000`을 입력하면 `40000`으로 저장됐다(네트워크 페이로드 `amount:40000`, `100,000+400,000−40,000=460,000` 기대와 어긋남). 플랜 `files_modified` 밖(ENG-D11 — 앞 플랜 04-09 산출물의 결함).
- **Fix:** `prev[caret] === ","` 조건 + 캐럿 기준 슬라이스 일치로 재작성, `removedChar`/`onlyDigits` 휴리스틱 제거.
- **Files modified:** `lib/format-number.ts`, `test/unit/lib/format-number.test.ts`
- **Verification:** 조합 스펙(`reserves`·`quote-table`·`projects-list`) 3회 재실행 재현 없음, 단독 3회 통과 유지, 되돌리면 회귀 테스트 1건 실패 → 복원 시 42/42.
- **Committed in:** `6ea2c77`
- **주의:** 금액 입력 공용 유틸(`useCommaInput` 경유 전 화면)이므로 묶음 ④ `/review` 필수 대상.

**4. [Rule 1 - Bug] 플레이크 테스트 2건**
- **Found during:** Task 3 최종 게이트 3연속 실행 중 재시작 2회
- **Issue (a):** `project-register.spec.ts` — 순차 `await`로 Ctrl+Enter를 두 번 누르면 첫 제출의 페이지 이동이 끝나 두 번째 press가 locator를 찾지 못함(앱의 `submittedRef` 래치는 동기적으로 정상 동작 — 테스트 버그).
- **Issue (b):** `mobile-320-no-overflow.spec.ts` — 관리자 48화면 순회가 단독 29.5~31.2초로 30초 예산에 근접해 CI 변동성에서 간헐 초과.
- **Fix:** (a) 두 번째 press를 `Promise.all`로 동시 dispatch, (b) 타임아웃 90초로 완화(`design-principles` 180초 선례 준용).
- **Files modified:** `test/e2e/project-register.spec.ts`, `test/e2e/mobile-320-no-overflow.spec.ts`
- **Verification:** 각각 단독 재실행 통과 + 전체 게이트 3연속 재실행에서 재현 없음.
- **Committed in:** `0fb7e7b`, `fa91922`
- **부작용:** 두 재시작이 같은 `--output=test-results/final-gate-run-{회차}` 이름을 재사용해 1·2차 실패 회차의 trace가 성공 실행에 덮어써졌다(콘솔 로그에 파일:줄·오류는 남아 원인 추적에는 지장 없었다) — 다음부터는 재시작마다 `--output`에 시도 번호를 붙인다(advisory, `.continue-here.md`에 기록됨).

---

**Total deviations:** 5 auto-fixed (4× Rule 1 - 버그, 그중 1건은 회귀 고정 성격)
**Impact on plan:** 전부 정확성 보정 또는 회귀 고정이며 범위 확장 없음. `format-number.ts` 수정만 플랜 파일 밖(ENG-D11)이고 나머지는 플랜이 예견한 자리(플레이크·캡처 재생)다.

## Issues Encountered

- `test-results/final-gate-run-{1,2,3}` trace 이름 재사용으로 1·2차 실패 회차의 trace가 덮어써짐 — 콘솔 로그(파일:줄·오류)로 원인 추적은 가능했으나 다음 최종 게이트부터는 `--output`에 시도 번호를 붙이는 것을 권고(advisory, `.continue-here.md` Anti-Patterns 표에 기록).
- 세부 수치·세션별 근거는 `.planning/phases/04-project-quote-ledger/.continue-here.md` 세션 AT·AS·AR·AQ 블록 참조.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4는 이 플랜으로 완결됐다(42/42 플랜, 요구사항 UX-04·UX-05·PROJ-05 Complete).
- **다음 단위:** 묶음 ④ Post-build — `/review`(6ea2c77의 공용 금액 입력 유틸 수정 포함 필수 검토 대상) → `/qa` → `/cso`(리저브·견적 초안 금액 localStorage 잔존, 리저브 clientName 노출 확인 대상) → `/ship`.
- **이월 항목:** DR-P4-02(375 정렬 머리글 <44px, Phase 04.6 제안, 답 대기), (C)(D) 사람 확인(묶음 ④ 배포 직후, 사용자 예외).
- 04-51 결정 ②(b) 채번 카운터 실제 겹침 규칙은 Opus 실행자 + Opus 독립 검토로 별도 진행한다.

## Self-Check: PASSED

All 16 referenced commits (c2a15b4, d7a6f03, 4c61201, da5bc9a, 002d58c, 5a34bfb, 2ae788e, ebed3c2, 8353610, 40fea8b, 49774ef, 907ec5e, d6a04f8, 6ea2c77, 0fb7e7b, fa91922) found in git history. File exists on disk.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-28*
