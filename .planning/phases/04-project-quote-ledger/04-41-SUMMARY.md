---
phase: 04-project-quote-ledger
plan: 41
subsystem: revenue
tags: [revenue, contract-amount, migration, drop-column, idempotency, eng-d10, money-normalization, save-rejected, fx-after-commit, s-4]
status: complete

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: 04-16 파생 계약 금액(D-84) · 매출 칸 거부 봉투 라우팅(routeRejectedRevenueCells) · 04-12 원장 트랜잭션 규약 · 04-40 normalizeMoneyInput · 04-50 rollback-floor 표시
provides:
  - "계약 금액 쓰기 경로 제거(액션 스키마 → domain/revenue → repositories/projects → db/schema)"
  - "db/migrations/0015_drop_project_contract_columns.sql — 업무 값 가드 + projects.contract_* 네 칸 DROP(rollback-floor 표시)"
  - "매출 줄 쓰기 굳히기: 행 범위(Codex #1) · 화면 uuid 멱등 삽입(ENG-D10 · I1) · 금액 정규화 → SaveRejectedError 칸 오류(B3) · 커밋 뒤 환율 기억 · 트랜잭션 전 권한(B §1)"
  - "saveRevenueInTx · revenueWriteRights (원장 합성 저장용)"
  - "매출 표 Ctrl+S 저장(Table: 비격자 표도 keyboard.onSave)"
  - "S-4: 견적 줄 표 합계 행이 자기 칸만 센다(quoteTableRejectionText)"
affects: [04-31(머지 묶음 ③ 배포 · 0015 하한), 04-49(1024 미만 매출 입력 유실 — 미처리)]

requirements-completed: [PROJ-03]

# Actuals (#2632) — chars/4, 실제 diff 기준. 생성 파일 0015_snapshot.json 포함 39,842 / 제외 21,226
actuals:
  tokens: 39842
  tasks: 3
  commits: 6
plan_head_before: 51102450d4e0e531dd941e13e1ac5419638ef98a

tech-stack:
  added: []
  patterns:
    - "매출 새 줄 멱등 삽입: 화면 uuid + isNew → INSERT … ON CONFLICT (id) DO NOTHING → 없으면 같은 tx로 다시 읽어 같은 프로젝트·종류·활성·같은 값이면 no-op, 아니면 write.denied 후 거부"
    - "금액 선검증: 쓰기 전에 표별 전체 줄을 moneyToColumns(normalizeMoneyInput)로 돌려 MoneyInputError를 칸 오류로 모아 SaveRejectedError 한 번"
    - "트랜잭션 안 단계는 fxToRemember만 돌려주고, 트랜잭션을 연 쪽이 커밋 뒤 rememberFxAfterCommit"

key-files:
  created:
    - db/migrations/0015_drop_project_contract_columns.sql
    - db/migrations/meta/0015_snapshot.json
  modified:
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/revenue-cells.ts
    - ui/table/Table.tsx
    - domain/revenue/index.ts
    - domain/projects/ledger.ts
    - domain/projects/index.ts
    - repositories/revenue-entries.ts
    - repositories/projects.ts
    - db/schema/projects.ts
    - db/migrations/meta/_journal.json
    - docs/design/DECISIONS.md
    - test/integration/revenue-entries.test.ts
    - test/integration/migration-upgrade.test.ts
    - test/unit/app/revenue-cells.test.ts
    - test/e2e/revenue-section.spec.ts

key-decisions:
  - "계약 금액은 쓰기 경로 없이 파생값 하나(D-84 · 사용자 D9) — 0015가 업무 값 가드 뒤 projects.contract_* 네 칸을 지운다(ARCHITECTURE §5 예외 한 건, DECISIONS 04-41)"
  - "매출 줄 거부 규칙 이름: revenue.entry-scope(기존 id가 다른 프로젝트·종류) · revenue.replay-mismatch(새 줄 id 재전송 불일치·보관 줄) — write.denied에는 id만"
  - "비격자 Table도 keyboard.onSave를 받으면 칸 안 Ctrl+S가 저장이다(매출 두 표만 해당)"

duration: 약 60분(첫 커밋 03:27Z → 04:05Z, 앞선 읽기 포함 추정)
completed: 2026-09-26
---

# Phase 4 Plan 41: 계약 금액 쓰기 경로 제거 · 0015 DROP · 매출 쓰기 경로 굳히기 Summary

계약 금액을 입력 경로 없이 파생값 하나로 만들고(0015가 업무 값 가드 뒤 `projects.contract_*` 네 칸 DROP), 매출 줄 쓰기를 자기 프로젝트·종류로 가두고 화면 uuid로 재전송에 멱등하게 만들었다. 금액은 한 규칙으로 정규화해 칸 오류로 거부하고, 최근 환율은 커밋 뒤에 기억하며, 권한은 트랜잭션 앞에서 읽는다. 04-16 검토 S-4(견적 표 합계 행이 매출 칸까지 세던 문제)도 고쳤다.

## 커밋

| Task | 종류 | 커밋 | 내용 |
|------|------|------|------|
| 1 (tracer) | RED | 196a91e | 계약 쓰기 경로 없음 테스트(옛 계약 필드 → 발행 줄만 저장 · 스키마가 계약 키 제거 · 참조 스캔 0건) |
| 1 (tracer) | GREEN | 9ca2d56 | 액션 → domain/revenue → repositories/projects → db/schema 계약 경로 제거 |
| 2 (tdd) | RED | 6292105 | 업그레이드 테스트 (c)(c2)(d) — 0010 상태에서 업무 계약 값이 있으면 멈춤, demo만이면 삭제 |
| 2 (tdd) | GREEN | 2dd528b | 0015 마이그레이션(가드 + DROP 넷, squawk-ignore 각 줄) + DECISIONS 04-41 항목 |
| 3 (tdd) | RED | d097f3f | 행 범위 · 재전송 · 금액 칸 오류 · 커밋 뒤 환율 · 권한 선계산 통합 + S-4 단위 + B3 E2E |
| 3 (tdd) | GREEN | 48d5cec | 매출 쓰기 경로 굳히기 + 매출 표 Ctrl+S + S-4 수정 |

마이그레이션 이름: `0015_drop_project_contract_columns` (drizzle 번호 유지, 첫 줄 `-- rollback-floor: 0015 …`).

## TDD Gate Compliance

- Task 1: RED 196a91e → GREEN 9ca2d56
- Task 2: RED 6292105 → GREEN 2dd528b. 뮤테이션(가드의 외화 조건 제거) → (c2) 실패 확인 후 원복. ignore 없이 squawk 돌리면 ban-drop-column이 걸림(ignore가 실제로 작동함) 확인
- Task 3: RED d097f3f(통합 34건 중 16건 실패 · 단위 15건 중 2건 실패, 둘 다 RED_EVIDENCE_OK · E2E는 매출 칸 Ctrl+S가 저장을 보내지 않아 실패) → GREEN 48d5cec

## 검증(실행한 것과 결과)

- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` Found 0 issues(16 files)
- 단위 전체 `vitest --project unit`: 95 files / 1,288 통과
- 통합(영향 파일):
  - revenue-entries · ledger-ownership · fx-remember-concurrency · tx-safety · quote-lines · settings · action-log: 7 files / 121 통과
  - migration-upgrade · project-copy · project-period · quote-approved-lock · quote-revision-races: 5 files / 72 통과
  - 스키마 id 필수 전환 뒤 revenue-entries를 다시 돌림: 34/34
- E2E `CI=true`(프로덕션 build + start): revenue-section · quote-table · project-period · ledger-save-flow · number-format · quote-edit-scope 6 specs / 94 통과
- 가드 테스트: `test/integration/migration-upgrade.test.ts` 통과. `test/unit/db/migration-journal.test.ts`는 이 저장소에 없다(`_journal`은 migration-upgrade만 참조)
- `package.json` · `pnpm-lock.yaml` 무변경(새 의존성 없음)
- 전체 `pnpm test`는 돌리지 않음(지시대로)

## 이전 웨이브에서 반영한 것

- **S-4(04-16 Opus 검토) — 고침.** 봉투에 매출 칸이 섞이면 견적 줄 표 합계 행이 봉투 요약(`오류 3칸`)을 그대로 쓰던 것을, 매출 줄 id가 아닌 칸만 세도록 바꿨다(충돌은 줄 수, 오류는 칸 수 — SaveRejectedError와 같은 규칙). RED 단위 2건 → GREEN. E2E B3에서 견적 표 합계 행이 `전부 거부 · 다른 칸 오류 1칸`인 것도 확인했다.
- **04-49 이월(1024 미만에서 열린 매출 입력이 사라질 수 있음) — 미처리(손대지 않음).** 이번 변경은 매출 표 Ctrl+S 연결뿐이고 폭 전환 경로는 건드리지 않았다. 여전히 열려 있다.

## 바뀐 화면(직접 DOM 감사는 하지 않음)

- 프로젝트 상세 › 매출 섹션(발행·입금 표): 칸 안 Ctrl+S가 일괄 저장, 범위 밖 금액이 그 셀의 고정 오류 + 표 합계 행 `오류 N칸 · 전부 거부`
- 프로젝트 상세 › 견적 줄 표 합계 행: 매출 칸을 빼고 자기 칸만 센다
- 공용 `ui/table/Table.tsx`: 격자 키보드를 켜지 않은 표가 `keyboard.onSave`를 받을 때만 동작이 바뀐다(지금은 매출 두 표만)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] db/schema의 계약 컬럼 제거를 Task 2에서 Task 1로 앞당김**
- **Found during:** Task 1
- **Issue:** repositories의 insert에서 계약 필드를 빼자 Drizzle 타입이 NOT NULL인 `contractAmountKrw`를 요구(TS2769)
- **Fix:** Task 1에서 `moneyColumns("contract")`를 스키마에서 뺐다. DB 기본값이 0015 DROP 전까지 채운다
- **Commit:** 9ca2d56

**2. [Rule 1 - Bug] 매출 표 안 Ctrl+S가 아무것도 하지 않음**
- **Found during:** Task 3(E2E RED · systematic-debugging)
- **Issue:** 매출 두 Table에 keyboard 연결이 없고, 비격자 Table 셀의 keydown은 Enter/Space만 처리해 Ctrl+S가 저장으로 이어지지 않았다(키보드만으로 저장 — CLAUDE.md §7)
- **Fix:** Table 비격자 분기에서 `keyboard.onSave`가 있으면 Ctrl+S를 저장으로 처리(saveLocked 게이트 동일), RevenueSection에 `onSave` prop 추가 → 견적 표와 같은 저장 요청
- **Files:** ui/table/Table.tsx, app/(app)/projects/[id]/revenue-section.tsx, app/(app)/projects/[id]/quote-table.tsx
- **Commit:** 48d5cec

**3. [Rule 1 - Test bug] E2E 줄 로케이터가 늘 0개**
- **Issue:** `filter({ has: 표 기준 로케이터 })`는 줄 안에서 표를 다시 찾아 매칭이 불가능했다
- **Fix:** 새 줄 = 발행 표 마지막 줄로 선택. 단언 자체(그 줄의 `td[aria-invalid]` 정확히 1개 + CAP 문구)는 그대로. 뮤테이션(newEntryDraft에서 id 제거)으로 `toHaveCount(1)` 실패 확인 후 원복
- **Commit:** 48d5cec

**4. [Rule 3 - Blocking] EntryDraft.id 필수화**
- **Issue:** 액션 스키마가 매출 줄 id를 UUID 필수로 받자(플랜 acceptance) 화면 페이로드 타입이 `string | undefined`(TS2322)
- **Fix:** 모든 매출 초안이 id를 가지므로(`entriesFromDto`·`newEntryDraft`) `EntryDraft.id`를 필수로
- **Commit:** 48d5cec

### 기타 차이

- 플랜 verify가 가리키는 기준 커밋 `d6b41cf`는 이 저장소에 없어 5110245로 대신 확인했다(0010·.squawk.toml diff 없음).
- Task 1에서 기존 테스트 「경영관리 viewer로는 계약 금액 저장이 거부된다」를 지웠고(쓰기 경로 자체가 없어짐), (f)는 USD 발행 줄로 같은 환율 규칙을 보도록 바꿨다.
- 정규화 호출 위치: `saveEntries` 안이 아니라 그 앞의 `prepareEntries`가 `moneyToColumns`(내부에서 `normalizeMoneyInput`)를 부른다 — 쓰기 전에 배치 전체를 거부하기 위해서다. 파일에 KRW 환율 고정·범위 비교를 손으로 쓴 코드는 없다.
- `saveRevenue(…, tx)` 호출은 기억할 환율을 버린다(스냅샷 null과 같은 이유). 원장 합성 저장은 `saveRevenueInTx`로 그 목록을 받는다. 지금 `tx`로 `saveRevenue`를 부르는 곳은 테스트뿐이다.
- 절차상 누락: Task 2 RED 테스트를 쓴 뒤에 `test-driven-development`를 불렀다. 다시 부르고 RED를 재실행해 기록했다(스킬 로그에 남김).

## 검토·게이트

- 독립 DOM 감사(Sonnet, `CI=true`): **PASS 24 · FAIL 0 · INFO 3**(`/mnt/project-files/phase4-prep/04-41-dom-audit.md`). 04-49 이월은 단순 폭 축소로는 재현 안 됨(리사이즈만으로는 값·dirty 표시가 유지됨) — 기존 줄 편집 중 리사이즈, 여러 줄 동시 편집, 리사이즈 도중 blur 타이밍은 이번 감사 범위 밖이라 미확인이며 이월은 열린 채 유지한다.
- Opus 검토(Codex 대체 — 한도 풀리면 Codex 재확인 필요): **BLOCKING 0 · SHOULD-FIX 2 · NIT 7**(`/mnt/project-files/phase4-prep/04-41-review-opus.md`)
  - SF-1(`saveRevenueInTx` 권한 대체 경로가 잠긴 tx 안에서 전역 풀로 권한 조회 · 환율 기억 유실) → f0461ba로 반영
  - SF-2(응답 유실 뒤 재전송에 기존 줄 수정이 섞이면 자기 저장을 남의 충돌로 오판) → a36716b로 반영
  - N-6(0015 `lock_timeout` 1s로 배포 창에 락을 못 잡을 때 대응 문구 누락) → bf1169f로 반영
  - 나머지 NIT 6개 이월(고치지 않음, 기록만):
    - N-1: 견적 줄 쓰기가 먼저 거부되면 매출 칸 오류는 `prepareEntries`가 안 돌아 다음 저장에야 보임
    - N-2: 수정 경로 WHERE에 `archivedAt` 필터가 없어 보관 줄도 version만 맞으면 고쳐짐(기존 동작)
    - N-3: 매출 표 Ctrl+S가 변경 없음·쓰기 권한 없음에도 저장 요청을 보냄(견적 격자와 같은 동작)
    - N-4: 교차 종류 수정·남의 id 새 줄 케이스의 write.denied 단언 누락, 원장 경로 유령 로그 미검증, 잠긴 tx 무풀호출 검증이 `saveRevenue(tx)` 목 한 건뿐
    - N-5: `MoneyInputError.field`를 늘 `"amount"`로 고정하는 이유 주석 없음, fxRate 오류일 때 `label` 부정확
    - N-7: `quoteTableRejectionText`의 `outsideCount`가 항상 0이라 실사용 안 됨, `rejectedCells.quote`와 매출 표 기준이 여전히 다름(기존 동작)
- 전체 게이트(`CI=true`): lint 0 · typecheck 0 · lint:sql 0 issues(16 files) · 단위 95 files/1,288 통과 · 통합 54 files/1,431 통과 · E2E 344 통과

## 남은 일 · 결정 필요

- 전체 게이트 CI=true: 완료(위 「검토·게이트」 수치 참고)
- 04-49 이월(1024 미만 매출 입력 유실): 미처리 — 이번 DOM 감사에서도 단순 리사이즈로는 재현 안 됨, 기존 줄 편집 중 리사이즈·blur 타이밍은 미확인이라 열린 채 유지
- 새 사용자 결정 필요 항목: 없음

## Known Stubs

없음.

## Threat Flags

없음 — 새 엔드포인트나 인증 경로는 없다. 매출 쓰기의 소속·재전송 거부는 플랜 위협 모델(Codex #1 · ENG-D10) 범위 안이다.

## Self-Check: PASSED

- FOUND: db/migrations/0015_drop_project_contract_columns.sql · db/migrations/meta/0015_snapshot.json · docs/design/DECISIONS.md · app/(app)/projects/[id]/revenue-cells.ts · ui/table/Table.tsx
- FOUND 커밋: 196a91e · 9ca2d56 · 6292105 · 2dd528b · d097f3f · 48d5cec
