---
phase: 06-payment-evidence-cards
plan: 27
subsystem: database
tags: [drizzle, postgres, migration, squawk, permissions, corp-cards]
status: complete

requires:
  - phase: 05-expense-approval-leave
    provides: "expenses · files(sha256 포함) · corp_cards · money-columns · lib/pg-errors · 05 통합 픽스처(setupExpenseProject · makePerson)"
provides:
  - "새 표 다섯: expense_payments · expense_evidence_reviews · corp_card_usages · purchase_requests · revenue_issue_requests(「표 명세」 이름 그대로)"
  - "expenses 칸 일곱(prepaid · prepaid_reason · evidence_amount · evidence_date · closed_at · closed_by · closed_reason) + CHECK 셋 + expenses_closed_by_users_id_fk"
  - "files_owner_kind_check 값 넷('expense','quote_revision','reserve_entry','corp_card_usage')"
  - "corp_cards_owner_kind_check(종류 ↔ 소유 칸 짝 — personal 소지자만 · team 팀만 · shared 둘 다 없음), 옛 corp_cards_owner_xor_check 제거"
  - "메뉴 키 셋(expenses.payments 지급 처리 · cards.purchases 구매 처리 · cards.proxy 카드 대리 등록)"
  - "정보 항목 넷(card_usage.value · card_usage.amount · purchase_request.value · purchase_request.amount, staffDefault 참)"
  - "마이그레이션 두 파일: 0025_phase6_tables.sql(NOT VALID 6 · SET LOCAL) · 0026_phase6_tables_validate.sql(VALIDATE 6 · SET LOCAL)"
affects: [06-03, 06-05, 06-06, 06-08, 06-10, 06-12, 06-16, 06-18, 06-25, 06-28, 06-30, PR-A]

actuals:
  tokens: 15801     # chars/4 over the realized diff, 생성 스냅숏 둘 제외(포함하면 115805 — 도구 산출 JSON)
  tasks: 3
  commits: 5        # MEASURED: git rev-list --count b9f85ab4..HEAD (SUMMARY 커밋 전)
plan_head_before: b9f85ab4497444d70a1322dd69b6843f232672fa

tech-stack:
  added: []
  patterns:
    - "기존 표 제약은 생성 파일에서 NOT VALID + 이유 주석, 검증은 --custom *_validate.sql 별도 파일(0003 · 0004 선례)"
    - "DB 제약 통합 테스트는 db.insert 직접 + DrizzleQueryError.cause.code · cause.constraint 단언(E-42)"

key-files:
  created:
    - db/schema/expense-payments.ts
    - db/schema/corp-card-usages.ts
    - db/schema/purchase-requests.ts
    - db/migrations/0025_phase6_tables.sql
    - db/migrations/0026_phase6_tables_validate.sql
    - db/migrations/meta/0025_snapshot.json
    - db/migrations/meta/0026_snapshot.json
    - test/integration/phase6-schema.test.ts
    - test/e2e/phase6-menus.spec.ts
  modified:
    - db/schema/corp-cards.ts
    - db/schema/revenue-entries.ts
    - db/schema/expenses.ts
    - db/schema/files.ts
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
    - domain/permissions/menus.ts
    - domain/permissions/info-items.ts
    - test/unit/permissions/can.test.ts

key-decisions:
  - "06-27: corp_card_usages_link_kind_check · purchase_requests_link_kind_check는 각 표의 *_link_check에 논리적으로 포함된다(모르는 link_kind면 link_check도 거짓) — 위반 행은 PG가 이름 순서로 먼저 걸린 *_link_check로 보고한다. 이름 · 식은 명세 그대로 두고, 통합 테스트는 「23514 거부(둘 중 한 이름) + pg_get_constraintdef로 link_kind_check 정의 존재」로 단언한다. 소비 플랜이 link_kind 위반을 *_link_kind_check 이름으로 잡으려 하면 안 된다"
  - "06-27: 로컬 CI=true E2E는 콜드 빌드가 webServer 60초를 넘는다 — CI=true pnpm build로 데운 뒤 돌린다(261001-5zp 선례, playwright.config.ts 그대로)"
  - "06-27: PR-A는 오케스트레이터가 연다(번호는 STATE 결정 줄에 기록) — 실행자는 PR 브랜치 · 푸시 · /review · /cso를 하지 않았다"

patterns-established:
  - "Phase 6 스키마 정본: 다른 플랜은 db/schema · db/migrations · domain/permissions를 만지지 않고 이 플랜 「표 명세」 이름으로 쓰기만 한다"

requirements-completed: [EXP-06, EXP-07, EXP-10, EXP-13, EXP-16, EVID-02, EVID-03, PROJ-06]

coverage:
  - id: D1
    description: "새 표 다섯이 명세의 칸 · CHECK · 유니크 · 인덱스로 서고, 제약마다 위반 행은 그 이름 · 코드로 거부되고 맞는 행은 들어간다"
    requirement: EXP-06
    verification:
      - kind: integration
        ref: "test/integration/phase6-schema.test.ts (expense_payments · expense_evidence_reviews · corp_card_usages · purchase_requests · revenue_issue_requests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "expenses 칸 일곱 · CHECK 셋 · 종결자 FK, files 주인 종류 넷"
    requirement: EVID-03
    verification:
      - kind: integration
        ref: "test/integration/phase6-schema.test.ts (expenses 06 칸 · files 주인 종류)"
        status: pass
    human_judgment: false
  - id: D3
    description: "corp_cards 주인 짝 CHECK — 통과 셋 · 거부 여섯 · 옛 이름 없음, 기존 카드 도메인 · 통합 회귀 녹색"
    requirement: EXP-07
    verification:
      - kind: integration
        ref: "test/integration/phase6-schema.test.ts#corp_cards 주인 CHECK"
        status: pass
      - kind: integration
        ref: "test/integration/corp-cards.test.ts · corp-card-owner-edit.test.ts · corp-card-owner-archived.test.ts"
        status: pass
      - kind: unit
        ref: "test/unit/corp-cards/owner-rule.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "메뉴 키 셋은 상위 메뉴 write로 대신 통과하지 않고, 정보 항목 넷이 staffDefault 참으로 있으며, 관리자가 권한표 · 노출표에서 새 줄을 본다"
    requirement: EXP-13
    verification:
      - kind: unit
        ref: "test/unit/permissions/can.test.ts#Phase 6 메뉴 키 · 정보 항목 (06-27)"
        status: pass
      - kind: integration
        ref: "test/integration/seed-permissions.test.ts · leak-scan.test.ts"
        status: pass
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/phase6-menus.spec.ts test/e2e/permissions-grid.spec.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "마이그레이션 두 파일(NOT VALID 6 · VALIDATE 6 · SET LOCAL 각 1), squawk 0, 빈 DB 적용, 두 번째 generate No schema changes"
    verification:
      - kind: other
        ref: "pnpm lint:sql && pnpm db:reset:test && pnpm db:migrate && pnpm db:generate → No schema changes"
        status: pass
      - kind: unit
        ref: "test/unit/db/migration-journal.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "PR-A(위험 경로) — 사용자가 머지 전 스테이징 읽기 전용 R-6 SQL을 돌리고 GitHub에서 직접 머지"
    verification: []
    human_judgment: true
    rationale: "PR은 오케스트레이터가 열고 /review · /cso 뒤 사용자가 스테이징 데이터를 확인해 머지한다 — 실행자가 증명할 수 없다"

duration: 26min
completed: 2026-10-06
---

# Phase 6 Plan 27: Phase 6 스키마 · 권한 키 묶음(PR-A, 06-26 흡수) Summary

**Phase 6 새 표 다섯 · expenses 칸 일곱 · files/corp_cards 주인 CHECK 교체(카드는 종류 ↔ 소유 칸 짝) · 메뉴 키 셋 · 정보 항목 넷을 마이그레이션 두 파일(생성 + VALIDATE)로 세우고, 제약마다 DB 직접 거부를 통합 테스트로 고정**

## Performance

- **Duration:** 26 min
- **Started:** 2026-10-06T03:18:50Z
- **Completed:** 2026-10-06T03:45Z
- **Tasks:** 3
- **Files modified:** 18 (files_modified 16 + 생성 스냅숏 2 — 17번째 손 파일 없음)

## ⓪ 실행 게이트 결과 (아홉 줄 모두 통과)

| id | 결과 |
|---|---|
| C15 | `.planning/phases/05-expense-approval-leave/05-13-SUMMARY.md`가 origin/main에 있음 |
| C15-05기준 | 여덟 grep 모두 1건 — `BlockedCandidateFilter`(repositories/approvals.ts) · `blockedAfterApprovalCandidates?: BlockedCandidateFilter` · `async function listNumberedByLineChain(` · `evidenceTypeInactive: boolean` · `건 · 먼저 결재`(A8) · `export function installmentSeqFor` · `function seqStartGuardFor(key: string)` · `export async function shareLockDocumentCounter(` |
| C15-체커 | 05 머지 `acf1cf2f5762` ⊂ 기록 커밋 `b4955bcc774345e4994c3debb53c7e32f2792706`(종료 0) |
| A-05-EXP | `expenses = pgTable` 1 · `files_owner_kind_check` 1 · `lockExpenseForUpdate` 1 |
| A-05-SHA | `sha256: text("sha256")` 1 |
| A-CARD | `corp_cards_owner_xor_check` 1(아직 옛 이름) |
| A-CARD-DOM | `export function cardOwnerKind` 1 |
| A-CARD-KIND | 쓰기 경로 grep 출력 그대로: `origin/main:repositories/corp-cards.ts`(한 줄) · `cardOwnerKind(` 3 |
| 6.1 | `evidence_records · evidence_import_batches · approval_no` 출력 없음 |

`git merge origin/main`(b55de77e): 시작 · Task 3 모두 `Already up to date`.

## Accomplishments

- 새 표 다섯과 기존 표 변경이 명세 이름 그대로 서고, 스키마 리터럴 이름 35개 전부 확인(36번째 `expenses_closed_by_users_id_fk`는 `.references()`에서 drizzle이 만드는 이름 — 마이그레이션과 통합 23503 테스트로 확인)
- `corp_cards_owner_kind_check`가 옛 XOR를 대체 — 공용 카드(shared · 둘 다 null)에 카드 사용 행이 들어가고, 어긋난 조합 여섯은 그 이름으로 거부된다. 카드 도메인 · 리포지토리 · 화면 · 카드 테스트 diff 0
- 메뉴 키 셋 · 정보 항목 넷 — `can()` · 시드 코드 무변경, 정확 일치 판정을 단위 테스트로 고정(D-601)
- 마이그레이션은 Task 3에서 한 번 재생성해 `0025_phase6_tables.sql` + `0026_phase6_tables_validate.sql` 두 파일

## Task Commits

1. **Task 1: expense_payments 트레이서** — `4bb44e54` (test, RED) · `a4e51fd8` (feat, GREEN)
2. **Task 2: 나머지 표 · 칸 · 주인 CHECK · 메뉴 키 · 정보 항목** — `7e820114` (test, RED) · `2056796a` (feat, GREEN)
3. **Task 3: 마이그레이션 한 번 재생성** — `92607b4b` (chore)

## TDD Gate Compliance

- Task 1 RED: `check tdd-red-evidence` → `RED_EVIDENCE_OK`(대상: 「취소 칸 중 취소 시각만 채우면 expense_payments_cancel_check로 거부된다」 — 단언 실패 code undefined)
- Task 2 RED: 통합 `RED_EVIDENCE_OK`(대상: 「personal + none 카드는 corp_cards_owner_kind_check로 거부된다」 — 옛 xor 이름으로 거부돼 단언 실패) · 단위 `RED_EVIDENCE_OK`(대상: 「MENUS에 세 키가 명세 라벨로 있다」)
- vitest TAP 출력에는 node:test의 `# tests/# pass/# fail` 꼬리가 없어, 증거 레코드에 실제 TAP `ok`/`not ok` 줄을 센 꼬리를 붙여 검증했다(스크래치 스크립트)
- `can()` 정확 일치 단위 여섯(상위 메뉴 write → 거짓 · 새 키 write → 참)은 RED 단계에서 이미 녹색 — 기존 동작을 고정하는 테스트(D-601 「테스트로 고정한다」)라 의도된 결과
- E2E RED는 돌리지 않았다 — CI=true 실행이 프로덕션 빌드를 요구하고, 단위 RED가 같은 원인(MENUS · INFO_ITEMS에 키 없음)을 이미 보였다. GREEN에서 CI=true 녹색

## 검증 기록

| 명령 | 결과 |
|---|---|
| Task 1: `pnpm lint:sql` · `vitest --project integration phase6-schema` | squawk 0건(26파일) · 4/4 |
| Task 2 단위: can · admin-menu-registry · role-menu · admin-index-link · migration-journal · owner-rule | 6파일 90/90 |
| Task 2 통합: phase6-schema · leak-scan · seed-permissions · corp-cards · corp-card-owner-edit · corp-card-owner-archived | 6파일 2952/2952 · squawk 0건(28파일) |
| Task 2 E2E: `CI=true pnpm playwright test test/e2e/phase6-menus.spec.ts test/e2e/permissions-grid.spec.ts --grep-invert @wave-merge` | 25 passed · 18 skipped(visual 프로젝트) |
| `pnpm lint && pnpm typecheck` | Task 1 · Task 2 뒤 각각 종료 0 |
| Task 3: `pnpm lint:sql && pnpm db:reset:test && pnpm db:migrate && pnpm db:generate` | squawk 0건(27파일) · 적용 · 아래 인용 |
| Task 3 파일 모양 검사(두 파일 · 주석 뺀 NOT VALID 6 · VALIDATE 6 · SET LOCAL 각 1) | 종료 0 |
| Task 3 뒤 재실행: 통합 6파일 · 단위 6파일 · E2E | 2952/2952 · 90/90 · 25 passed |

두 번째 `pnpm db:generate` 출력(그대로):

```
No schema changes, nothing to migrate 😴
```

## PR-A

PR-A는 오케스트레이터가 연다(번호는 STATE 결정 줄에 기록). 사용자 머지 대기 — 위험 경로(`db/schema/` · `db/migrations/` · `domain/permissions/`). `/review` · `/cso` 기록 위치도 오케스트레이터가 PR에 남긴다.

PR 본문 「머지 전 사용자 확인」용 SQL(스테이징 읽기 전용 — 사용자가 실행):

```sql
SELECT kind, holder_user_id IS NOT NULL AS has_holder, team_id IS NOT NULL AS has_team, count(*) FROM corp_cards GROUP BY 1, 2, 3;
```

허용 두 줄: (`personal`, t, f) · (`team`, f, t). 그 밖의 행이 있으면 머지하지 말고 관리자 화면에서 고친 뒤 다시 확인한다.

**같은 SQL의 로컬 dev DB 결과**(127.0.0.1:5432/erp — `DROP/CREATE` 뒤 `pnpm db:migrate` · `pnpm db:seed`):

```
 kind | has_holder | has_team | count
------+------------+----------+-------
(0 rows)
```

마스터 시드는 법인카드를 만들지 않아 0행이다(어긋난 행 없음). 실행자는 스테이징 · 프로덕션 DB에 어떤 명령도 보내지 않았다.

PR-A 경로(`git diff --name-only origin/main...HEAD`, `.planning` 제외): files_modified 16(NNNN → 0025 · 0026) + `db/migrations/meta/0025_snapshot.json` · `0026_snapshot.json`.

## Files Created/Modified

- `db/schema/expense-payments.ts` — `expensePayments` · `expenseEvidenceReviews`
- `db/schema/corp-card-usages.ts` — `corpCardUsages`(합 CHECK · 연결 XOR · 등록 경로 · 구매 고리 · 인덱스 셋)
- `db/schema/purchase-requests.ts` — `purchaseRequests`(번호 uniqueIndex · 연결 · 링크 스킴 · 상태 셋)
- `db/schema/revenue-entries.ts` — `revenueIssueRequests` 추가
- `db/schema/expenses.ts` — 칸 일곱 · CHECK 셋 · 종결자 FK
- `db/schema/files.ts` — `files_owner_kind_check` 값 넷(다른 칸 · sha256 무변경)
- `db/schema/corp-cards.ts` — `corp_cards_owner_kind_check` · 머리 주석 규칙 문장
- `db/schema/index.ts` — 새 파일 셋 export
- `db/migrations/0025_phase6_tables.sql` · `0026_phase6_tables_validate.sql` · 스냅숏 둘 · `_journal.json`
- `domain/permissions/menus.ts` · `info-items.ts` — 키 셋 · 항목 넷
- `test/integration/phase6-schema.test.ts` · `test/unit/permissions/can.test.ts` · `test/e2e/phase6-menus.spec.ts`

## Decisions Made

- `link_kind_check` 포함 관계 — 테스트 단언 방식(위 key-decisions 첫 줄)
- 종결 전용 메뉴 키 없음(「열린 선택」 C9-종결키 기본값 그대로)
- 정보 항목 RS-19 기본값 그대로

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] link_kind 위반 테스트가 다른 제약 이름을 받았다**
- **Found during:** Task 2 GREEN
- **Issue:** 모르는 `link_kind` 행은 `*_link_kind_check`와 `*_link_check`를 함께 어기고(명세 식상 link_check가 link_kind_check를 포함), PG는 이름 순서로 먼저인 `*_link_check`를 보고했다 — `link_kind_check` 이름만 단독으로 어기는 행은 존재할 수 없다
- **Fix:** 스키마 · 이름은 명세 그대로 두고, 두 테스트를 「23514 + 두 이름 중 하나 + `pg_get_constraintdef`로 link_kind_check 정의 존재」로 바꿨다
- **Files modified:** test/integration/phase6-schema.test.ts
- **Verification:** 통합 2952/2952
- **Committed in:** 2056796a

**2. [Rule 3 - Blocking] 로컬 CI=true E2E의 webServer 60초 시간 초과**
- **Found during:** Task 2 E2E
- **Issue:** 콜드 `pnpm build`가 webServer 기본 60초를 넘어 「Timed out waiting 60000ms from config.webServer」
- **Fix:** `CI=true pnpm build`로 데운 뒤 같은 명령 재실행(261001-5zp 선례). `playwright.config.ts` 무변경
- **Files modified:** 없음
- **Verification:** 25 passed
- **Committed in:** — (코드 변경 없음)

**3. [Rule 3 - Blocking] Task 3 재생성 뒤 로컬 dev DB 재생성**
- **Found during:** Task 3
- **Issue:** 로컬 dev DB(`erp`)에 옛 0025~0027이 적용돼 있어 재생성 파일을 `pnpm db:migrate`할 수 없다
- **Fix:** 로컬 `erp`만 `DROP DATABASE … WITH (FORCE)` · `CREATE` 뒤 migrate · seed(05-13 선례). 스테이징 · 운영 무관
- **Files modified:** 없음
- **Verification:** `db.migrate applied:true` · 두 번째 generate No schema changes
- **Committed in:** —

---

**Total deviations:** 3 auto-fixed (1 bug · 2 blocking). **Impact:** 테스트 단언 방식 하나만 바뀌었고 스키마 명세 · 이름 · 파일 수는 그대로다.

## Issues Encountered

- `tdd-red-evidence` 검증기가 node:test TAP 꼬리를 요구 — vitest TAP 줄을 센 꼬리를 붙여 검증(위 TDD 절)

## Known Stubs

None — 화면 코드 없음. 권한표 · 노출표는 기존 화면이 새 행을 그린다(DOM 감사 대상 없음).

## User Setup Required

None — 다만 PR-A 머지 전 사용자가 스테이징에서 위 R-6 SQL을 읽기 전용으로 돌린다.

## Next Phase Readiness

- PR-A 사용자 머지 뒤 06-03 · 05 · 06 · 08 · 10 · 12 · 16 · 18 · 25 · 28 · 30이 「표 명세」 이름으로 쓴다
- 06-30 전까지 도메인 `CardOwnerKind`는 `personal` · `team`뿐 — DB는 shared를 받지만 만들 길이 없다(의도)
- 소비 플랜 주의: link_kind 위반은 `*_link_check` 이름으로 보고된다

## Self-Check: PASSED

- 파일: key-files.created 9개 모두 존재(`git diff --name-only origin/main...HEAD`에 나열)
- 커밋: 4bb44e54 · a4e51fd8 · 7e820114 · 2056796a · 92607b4b 모두 `git log b9f85ab4..HEAD`에 있음
- 수용 기준: Task 1(4건) · Task 2(10건) · Task 3 로컬 항목 재실행 통과. Task 3의 PR 번호 · `/review` · `/cso` 항목은 오케스트레이터 몫

---
*Phase: 06-payment-evidence-cards*
*Completed: 2026-10-06*
