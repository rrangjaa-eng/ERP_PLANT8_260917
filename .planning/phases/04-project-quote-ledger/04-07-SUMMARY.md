---
phase: 04-project-quote-ledger
plan: 07
subsystem: database
tags: [reserve, ledger, drizzle, postgres, row-lock, for-no-key-update, permissions, archive]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-01 moneyColumns · 04-40 normalizeMoneyInput · 04-12 DOMAIN_RESTORERS · 04-20 denyWrite·lock-race · 04-32 withTransaction(lock_timeout)·recordAction {tx}·projectMany · 그룹 C lib/paging · PR #82 bigint 원화 금액(결정 ① (b))"
provides:
  - "reserve_entries 표 + 0018_reserve_entries 마이그레이션(잔액·sort_key 컬럼 없음, 구분 CHECK는 CREATE TABLE 안)"
  - "repositories/reserve-entries — lockReserveClients(id 오름차순 FOR NO KEY UPDATE) · 멱등 삽입 · 버전·클라이언트 조건 수정 · 보관"
  - "domain/reserves — compareReserveRows · runningBalance(날짜 마감) · saveReserves · restoreReserve · listReserves · RESERVE_DTO_SPEC · ReserveBalanceRejectedError"
  - "정보 항목 reserve.amount(기본 숨김) · 보관함 reserve_entry(보호 행) · DOMAIN_RESTORERS reserve_entry"
affects: [04-42, 04-31, phase-9-RSV-02]

actuals:
  tokens: 44000
  tasks: 3
  commits: 6
plan_head_before: 1d993ef03d52cc7e2e7d162bbb0303bdc2d8fd10

tech-stack:
  added: []
  patterns:
    - "리저브 쓰기 직렬화: 트랜잭션 앞 권한·코드표 → 대상 줄의 저장된 클라이언트 → vendors 행 id 오름차순 FOR NO KEY UPDATE → 잠긴 tx로 원장 재조회 → 배치를 메모리에 적용한 날짜 마감 판정 → 같은 tx 쓰기·로그 → 커밋 뒤 환율"
    - "잔액 거부의 배치 수준 정보(ReserveBalanceRejectedError.rejection) — 목록과 같은 정렬 함수로 쪽 번호"

key-files:
  created:
    - db/schema/reserve-entries.ts
    - db/migrations/0018_reserve_entries.sql
    - db/migrations/meta/0018_snapshot.json
    - repositories/reserve-entries.ts
    - domain/reserves/index.ts
    - test/unit/domain/reserve-balance.test.ts
    - test/integration/reserve-entries.test.ts
  modified:
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
    - domain/permissions/info-items.ts
    - domain/archive/index.ts
    - repositories/archive.ts
    - test/integration/leak-scan.test.ts

key-decisions:
  - "결정 ①(Task 0)은 이미 사용자 답 (b) bigint가 DECISIONS 2026-09-26 항목과 PR #82(7e589fb)로 구현돼 있어 다시 묻지 않았다 — 리저브 금액은 buildAmountKrw(bigint)이고 상한은 KRW_COLUMN_MAX 999,999,999,999"
  - "마이그레이션은 생성기 출력 그대로 0018_reserve_entries(계획의 0016은 0016 bigint·0017 04.2 뒤라 낡음)"
  - "잔액은 순수 함수 runningBalance로 JS에서 계산한다 — 클라이언트당 수십~수백 줄 규모, 거부 문구에 날짜가 필요, 산술 단일 지점. 줄 수가 약 2만을 넘으면 윈도 함수(SUM() OVER)로 바꿀 자리"
  - "재전송 판정은 04-12 견적 줄(같은 차수 활성 줄이면 값 비교 없이 재전송)과 달리 값까지 비교한다 — 잔액 이중 반영과 재전송 사이 편집의 조용한 유실을 막는다"
  - "오류 문구는 2026-09-26 결정 「오류 문구 명사형 통일」을 따른다(UI-SPEC rev 5의 높임말 문구보다 뒤의 사용자 결정)"

patterns-established:
  - "리저브(그리고 Phase 9 RSV-02)의 모든 쓰기는 lockReserveClients 뒤 runningBalance 판정을 지난다"

requirements-completed: [RSV-01]

coverage:
  - id: D1
    description: "리저브 표·마이그레이션(0018) — 잔액 컬럼 없음, 구분 CHECK, (client_id, entry_date) 인덱스, 락 타임아웃 한 쌍"
    requirement: "RSV-01"
    verification:
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 19 files) · pnpm db:migrate · 마이그레이션 번호 검증 node 명령(ok 0018_reserve_entries)"
        status: pass
    human_judgment: false
  - id: D2
    description: "날짜 마감 잔액 판정(중간 날짜 음수 · 같은 날 입금 먼저 · 원화 누적 · 클라이언트 분리)"
    requirement: "RSV-01"
    verification:
      - kind: unit
        ref: "test/unit/domain/reserve-balance.test.ts (7)"
        status: pass
      - kind: integration
        ref: "test/integration/reserve-entries.test.ts#트레이서 3건"
        status: pass
    human_judgment: false
  - id: D3
    description: "입력 계약·재전송·클라이언트 잠김·커밋 뒤 환율·수정 로그·write.denied"
    requirement: "RSV-01"
    verification:
      - kind: integration
        ref: "test/integration/reserve-entries.test.ts#04-07 Task 2 (18)"
        status: pass
    human_judgment: false
  - id: D4
    description: "권한(pnl 쓰기 + reserve.amount, 숫자 없는 거부) · 노출 키 집합 · 배치 보관/범용 보관 차단/복원 위임 · 50건 페이지 · 거부 줄 쪽 번호 · 두 연결 경합"
    requirement: "RSV-01"
    verification:
      - kind: integration
        ref: "test/integration/reserve-entries.test.ts#04-07 Task 3 (10) · archive · visibility · leak-scan (4 files 1139 passed)"
        status: pass
    human_judgment: false

duration: 36min
completed: 2026-09-27
status: complete
---

# Phase 4 Plan 07: 리저브 대장 서버 Summary

**클라이언트 행 `FOR NO KEY UPDATE` 잠금 아래 날짜 마감 잔액으로 음수를 막는 리저브 대장(reserve_entries · 0018) — 저장·수정·보관·복원·동시 저장 어느 경로도 음수를 커밋하지 못하고, `pnl` + `reserve.amount` 없는 계급에는 줄·건수가 없다**

**결정 ① (Task 0 `checkpoint:decision`):** 사용자 답 **(b) bigint** — 근거: 「금액이 99억 이상이면 오류」 보고, 줄당 상한은 1조 원 미만(사용자 답 2026-09-24 · 상한 2026-09-26). 기록: `docs/design/DECISIONS.md` 「2026-09-26 — 결정 ① (b) 원화 금액 bigint 전환 · 줄당 상한 1조 원 미만 · 0016 롤백 하한 없음」 · 구현 PR #82(7e589fb, `0016_money_krw_bigint`). 이 실행자는 답을 고르지 않았고 다시 묻지도 않았다.

## Performance

- **Duration:** 36 min
- **Started:** 2026-09-27T17:31:25Z
- **Completed:** 2026-09-27T18:08:17Z
- **Tasks:** 3 실행(트레이서 · Task 2 · Task 3) + Task 0 기록으로 해소
- **Files modified:** 13

## Accomplishments
- `reserve_entries` 표와 생성기 번호 그대로의 `0018_reserve_entries.sql`(락 타임아웃 한 쌍, squawk 0)
- `saveReserves`: 트랜잭션 앞 권한·형식·코드표 → 클라이언트 잠금 → 원장 재조회 → 참조·상태·재전송 판정 → 날짜 마감 판정 → 같은 tx 쓰기·행동 로그 → 커밋 뒤 최근 환율
- `restoreReserve`(보관함 `DOMAIN_RESTORERS`), 범용 `archive()` 보호 행, 경영관리는 `admin.archive` 없이 배치 `archivedIds`로 보관
- `listReserves`: 노출 게이트(빈 결과에 건수·그룹 키 없음) · 전체 원장 잔액 뒤 50건 쪽 · `projectMany` 투영 · 서버 셀 단계
- 잔액 음수 거부의 `{ entryId, entryDate, clientId, clientName, balanceKrw, page }`(Codex #7)

## Task Commits

1. **Task 0: 결정 ①** — 커밋 없음(DECISIONS 2026-09-26 · PR #82로 해소)
2. **Task 1: 트레이서** — RED `f2eb2d5` (test) · GREEN `d443301` (feat)
3. **Task 2: 결정표 + 입력 계약** — RED `3135423` (test) · GREEN `c999d41` (feat)
4. **Task 3: 권한·노출·보관/복원·페이지·경합** — RED `774edff` (test) · GREEN `1d56bf9` (feat)

## Files Created/Modified
- `db/schema/reserve-entries.ts` · `db/schema/index.ts` — 표 정의와 배럴(통합 setup의 TRUNCATE는 배럴을 순회해 자동 포함)
- `db/migrations/0018_reserve_entries.sql` · `meta/0018_snapshot.json` · `meta/_journal.json` — 생성기 출력 + 락 타임아웃 머리
- `repositories/reserve-entries.ts` — 잠금·조회·멱등 삽입·버전 수정·보관·보관함 이름
- `domain/reserves/index.ts` — 잔액·저장·복원·목록·DTO 등록
- `domain/permissions/info-items.ts` — `reserve.amount`(기본 숨김)
- `domain/archive/index.ts` · `repositories/archive.ts` — 복원 위임 · 보호 행 항목
- `test/unit/domain/reserve-balance.test.ts` · `test/integration/reserve-entries.test.ts` · `test/integration/leak-scan.test.ts`

## Decisions Made
- 위 key-decisions 다섯 줄. 추가로: 페이지 크기는 `lib/paging.ts`의 `LIST_PAGE_SIZE`(50)를 그대로 쓴다. 금액 > 0 거부 문구 `금액 0 이하 · 금액 수정`은 UI-SPEC에 없어 04-40의 `환율 0 이하 · 환율 수정` 꼴을 따랐다. 보관된 줄 방어 거부 `보관된 줄 · 새로 고침`(rev 5 밖 — 명사형).

## Deviations from Plan

### Superseded by PR #82 / orchestrator facts (계획 (b) 항목 — 실행하지 않음)

**1. 결정 ① (b)의 구현은 이미 끝나 있었다**
- **Issue:** 계획 ②-b (b)는 `KRW_COLUMN_MAX = Number.MAX_SAFE_INTEGER`, 0016 첫 줄 `-- rollback-floor:`, 타입 변경 ALTER를 리저브 마이그레이션에 싣기, 앞 플랜 테스트의 상한 리터럴 수정, migration-upgrade 케이스, DECISIONS 새 항목을 요구했다.
- **Fix:** 하지 않았다 — PR #82가 사용자 결정(상한 999,999,999,999 · 롤백 하한 없음)으로 이미 대체 구현했다. 리저브 금액은 `buildAmountKrw`(bigint)를 물려받는다. `grep -rnE 'integer\("[a-z_]*_krw' db/schema/` 0건 확인. 새 표 마이그레이션에는 타입 변경이 없어 migration-upgrade 케이스를 더하지 않았다.

**2. 마이그레이션 번호 0016 → 0018**
- 계획의 `0016_reserve_entries.sql`은 낡았다(0016 bigint · 0017 04.2). 생성기 출력 `0018_reserve_entries`를 그대로 두었고 번호 검증 명령이 `ok 0018_reserve_entries`다.

**3. 상한 초과 테스트 값**
- 계획의 「원화 환산 2,147,483,648 이상 → 거부」는 상한이 1조 원 미만으로 바뀌어 `1,000,000,000,000`으로 테스트했다.

### Auto-fixed Issues

**4. [Rule 1 - Bug / CLAUDE.md 규칙] 오류 문구를 명사형으로**
- **Found during:** Task 3 전체 단위 실행(`test/unit/error-copy-noun-style.test.ts` 1 failed)
- **Issue:** 계획·UI-SPEC rev 5의 높임말 문구(`… 새 줄로 적어 주세요`, `클라이언트를 찾을 수 없습니다`, `리저브를 기록할 권한이 없습니다` 등 7개 + 복원 문구)가 뒤에 내려진 사용자 결정(DECISIONS 2026-09-26 「오류 문구 명사형 통일」, SYSTEM.md §7-2 3번)을 어겼다.
- **Fix:** `클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적기` · `클라이언트 없음 · 클라이언트 다시 고르기` · `다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기` · `코드표에 없는 증빙 종류 · 증빙 종류 고르기` · `구분 없음 · 구분 고르기` · `금액 0 이하 · 금액 수정` · `리저브 기록 권한 없음` · 복원 `복원하면 {날짜} 잔액 {잔액} · 리저브 대장에서 출금 줄 먼저 고치기`. 잔액 문구 `이 줄 뒤 잔액 {잔액} · 금액을 줄이거나 입금 줄 먼저`와 재전송 `이미 저장된 줄과 값이 다름 · 새로 고침`은 그대로. 04-42 화면·UI-SPEC 예시 문구가 이 문구를 따라야 한다.
- **Files modified:** domain/reserves/index.ts, test/integration/reserve-entries.test.ts
- **Verification:** 단위 118 files 1703 passed · 통합 4 files 1139 passed
- **Committed in:** 1d56bf9

**5. [Rule 3 - Blocking] `test/integration/setup.ts`는 고치지 않았다**
- setup이 `db/schema` 배럴의 모든 표를 한 문장으로 TRUNCATE해, 배럴 export만으로 리저브 표가 포함된다(계획의 「TRUNCATE 목록에 더한다」가 불필요).

**6. 검증 명령의 기준 커밋 `d6b41cf`**
- `git diff --stat d6b41cf -- .squawk.toml menus.ts role-menu.ts`는 비어 있지 않다 — 앞 플랜(04.2-11 · 04-13 · 04-22)의 변경이다. 이 플랜 시작점 `1d993ef` 기준 diff는 0줄(`.squawk.toml` · `menus.ts` · `role-menu.ts` · `package.json` · `pnpm-lock.yaml`).

**7. `CI=true pnpm test` 전체 게이트는 실행하지 않았다**
- 오케스트레이터 지시(전체 E2E는 오케스트레이터가 한 번 돈다)로 단위 전체 + 건드린 통합 파일만 돌렸다.

---

**Total deviations:** 3 superseded(계획 (b) 항목 · 번호 · 상한 값) + 1 auto-fix(Rule 1 문구) + 3 절차 기록. **Impact:** 범위 확장 없음. 04-42가 새 문구를 화면에 그대로 쓴다.

## TDD Gate Compliance
- 세 태스크 모두 `test(04-07)` RED 커밋이 `feat(04-07)` GREEN 앞에 있다.
- RED 시점에 이미 초록이던 테스트(트레이서·Task 2 구현이 먼저 만든 동작): Task 2의 결정표 7건 전부 · 위조 KRW 환율 · 같은 클라이언트 프로젝트 저장 · 잔액 음수 경고 / Task 3의 보기 권한 저장 거부 · 입금 보관 중간 음수 · 경합. 결정표는 두 변이(줄마다 판정 · 마지막 잔액만 판정)를 넣어 각각 1건이 실패하는 것을 확인한 뒤 원복했다.

## Issues Encountered
- None beyond the deviations above.

## Next Phase Readiness
- 04-42(화면·액션·E2E·문서)가 `saveReserves` · `listReserves` · `ReserveBalanceRejectedError.rejection` · `newRowCellEditability`를 얹으면 된다. 액션 레지스트리의 누수 스캔 import는 04-42 몫.
- Phase 9 RSV-02는 같은 `lockReserveClients` + `runningBalance`를 재사용한다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-27*

## Self-Check: PASSED

- 파일 7개 FOUND · 커밋 6개(f2eb2d5 · d443301 · 3135423 · c999d41 · 774edff · 1d56bf9) FOUND
