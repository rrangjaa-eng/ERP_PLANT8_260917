---
phase: 06-payment-evidence-cards
plan: 30
subsystem: payments
tags: [corp-cards, drizzle, postgres, check-constraint, next-safe-action, zod, playwright]

requires:
  - phase: 06-payment-evidence-cards
    provides: "06-27(06-26 흡수) corp_cards_owner_kind_check — 종류 ↔ 소유 칸 짝 CHECK(shared = 둘 다 없음 허용, R-6)"
provides:
  - "CardOwnerKind = personal | team | shared · CardOwnerInput.kind(사람이 고른 종류, 필수)"
  - "cardOwnerKind(input) — 종류별 소유 칸 조합 판정(FK 유무로 유도하지 않음), 거부 문구 「소유 칸 조합 오류 · {종류}에 맞는 칸만」"
  - "관리자 카드 폼 · 소유자 변경 폼 종류 「공용」(소유 칸 미렌더) · 목록 종류 「공용」 · 소유 「—」"
  - "관리자 카드 액션 zod kind enum · 소유자 변경 superRefine 종류별 칸 조합 검사"
affects: [06-05, 06-09]

actuals:
  tokens: 10600
  tasks: 2
  commits: 2
plan_head_before: 13fdca0aabc5e5ee6ec1466150355643625d5b0c

tech-stack:
  added: []
  patterns:
    - "종류 promote: 사람이 고른 종류 + 종류별 칸 조합 판정 — 도메인 표 = DB CHECK 표(세 조합)"

key-files:
  created:
    - docs/design/checks/2026-10-06-06-30-admin-corp-cards.md
  modified:
    - domain/corp-cards/index.ts
    - app/(app)/admin/corp-cards/actions.ts
    - app/(app)/admin/corp-cards/card-form.tsx
    - app/(app)/admin/corp-cards/page.tsx
    - test/unit/corp-cards/owner-rule.test.ts
    - test/integration/corp-cards.test.ts
    - test/e2e/corp-cards.spec.ts
    - test/integration/corp-card-owner-archived.test.ts
    - test/integration/corp-card-owner-edit.test.ts
    - test/e2e/table-row-min.spec.ts

key-decisions:
  - "06-30: 법인카드 종류는 사람이 고른 값(CardOwnerInput.kind 필수) — cardOwnerKind는 FK 유무로 종류를 유도하지 않고 종류별 칸 조합(personal 소지자만 · team 팀만 · shared 둘 다 없음)만 판정, 06-27 corp_cards_owner_kind_check와 같은 세 조합"
  - "06-30: 소유자 변경 superRefine의 개인 · 팀 거부 문구는 기존 「소지자·팀 중 하나 필요 · 하나만 선택」 유지(화면 문구 불변 · panel-select-errors E2E), 공용 + 소유 칸 위조만 「소유 칸 조합 오류 · 공용에 맞는 칸만」"
  - "06-30: 등록 액션에는 superRefine을 더하지 않는다 — CardForm이 validationErrors.holderUserId를 그리지 않아(QA-1 함정) 판정은 도메인 cardOwnerKind가 serverError(패널 이유 한 줄)로 돌려준다"

patterns-established:
  - "종류 ↔ 칸 짝 불변 표: 단위 it.each(종류 셋 × 칸 조합) — 뒤 플랜이 FK 유무로 종류를 다시 유도하면 빨개진다"

requirements-completed: [EXP-07]

coverage:
  - id: D1
    description: "cardOwnerKind 종류 셋 × 소유 칸 조합 판정(promote) — 누락 입력이 공용으로 떨어지지 않음"
    requirement: EXP-07
    verification:
      - kind: unit
        ref: "test/unit/corp-cards/owner-rule.test.ts#cardOwnerKind — 종류 셋 × 소유 칸 조합 (12 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "공용 카드 등록 · 소유자 변경 개인 → 공용 · 공용 → 팀 · 공용 → 보관된 사람 거부 · 행동 로그 document_update"
    requirement: EXP-07
    verification:
      - kind: integration
        ref: "test/integration/corp-cards.test.ts (19 cases)"
        status: pass
      - kind: integration
        ref: "test/integration/corp-card-owner-archived.test.ts · corp-card-owner-edit.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "DB 이중 거부 — 도메인을 거치지 않은 두 칸 행 · shared + 소지자 행이 23514 corp_cards_owner_kind_check"
    requirement: EXP-07
    verification:
      - kind: integration
        ref: "test/integration/corp-cards.test.ts#도메인을 거치지 않은 … 23514 corp_cards_owner_kind_check"
        status: pass
      - kind: integration
        ref: "test/integration/phase6-schema.test.ts#corp_cards 주인 CHECK"
        status: pass
    human_judgment: false
  - id: D4
    description: "관리자 카드 폼 · 소유자 변경 폼 「공용」(소유 칸 미렌더) · 목록 종류 「공용」 · 소유 「—」"
    requirement: EXP-07
    verification:
      - kind: e2e
        ref: "CI=true playwright test/e2e/corp-cards.spec.ts#공용 법인카드 (06-30 · Q5 · C8)"
        status: pass
    human_judgment: false
  - id: D5
    description: "공용 갈래 화면 배치 1280 · 375 · 320(빈 칸 자리 · 남은 라벨 없음, 목록 공용 행 소유 「—」) — backstop DOM 감사"
    verification: []
    human_judgment: true
    rationale: "must_haves backstop — 실행자가 아닌 별도 에이전트의 CI=true 독립 DOM 감사 몫(실행자는 에이전트를 띄울 수 없음)"

duration: 1h 5m
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 30: 공용 법인카드 카드 마스터 Summary

**법인카드 종류를 사람이 고른 값으로 올리고(`CardOwnerKind` + `shared`, `cardOwnerKind`는 종류별 칸 조합만 판정 — 06-27 DB CHECK와 같은 세 조합), 관리자 카드 폼 · 소유자 변경 폼에 「공용」을 더해 공용 카드가 등록 · 변경 양방향으로 오간다**

## Performance

- **Duration:** 1h 5m (E2E CI=true 빌드 · 의존 사슬 오실행 재시도 포함)
- **Started:** 2026-10-06T05:47:38Z
- **Completed:** 2026-10-06T06:53:00Z
- **Tasks:** 2
- **Files modified:** 11 (생성 1 · 수정 10)

## ⓪ 실행 게이트 결과

- 06-27: `.planning/phases/06-payment-evidence-cards/06-27-SUMMARY.md` 추적됨 · `db/schema/corp-cards.ts:32` `corp_cards_owner_kind_check`(식: personal 소지자만 · team 팀만 · shared 둘 다 없음) — 통과. 제약 이름이 플랜과 같아 대응표 불필요.
- main: `domain/corp-cards/index.ts:45` `export type CardOwnerKind` · `:21` `export class InvalidCardOwnerError` · `card-form.tsx:99 · :201` `value="team"` — 통과. `repositories/corp-cards.ts`의 `insertCorpCard` · `updateCorpCardOwner`가 `kind`와 소유 칸을 한 문장에서 이미 쓴다 — 저장소 무변경(멈춤 방아쇠 해당 없음).

## Accomplishments

- `domain/corp-cards`: `CardOwnerKind = "personal" | "team" | "shared"`, `CardOwnerInput.kind` 필수(선택 칸 우회 없음 — promote). `cardOwnerKind`가 종류별 칸 조합을 판정하고 그 밖은 `InvalidCardOwnerError("소유 칸 조합 오류 · {개인|팀|공용}에 맞는 칸만")`. `createCorpCard` · `updateCorpCardOwner`가 고른 `kind`를 저장소 한 문장 쓰기로 넘긴다. 공용은 소유 칸이 없어 보관 검사가 자연히 건너뛰어진다.
- 관리자 액션: zod `kind: z.enum(["personal","team","shared"])`(등록 · 변경), 소유자 변경 `superRefine`이 종류별 칸 조합 검사.
- 관리자 화면: 종류 select에 `공용`(새 카드 · 소유자 변경 둘 다) — 고르면 소지자 · 팀 칸을 렌더하지 않음. 소유자 변경 폼은 카드의 지금 종류(공용 포함)에서 시작. 목록 종류 열 `개인` · `팀` · `공용`, 공용 행 소유 `—`.
- 짝 불변 단위 표(it.each 12행) · 통합(공용 등록 · 변경 셋 · DB 이중 거부) · E2E(공용 등록 → 목록, 개인 → 공용 → 팀).

## Task Commits

1. **Task 1: 트레이서 — 공용 종류 판정 → 저장 → 목록 「공용」** - `f86f3690` (feat)
2. **Task 2: 공용 ↔ 개인 · 팀 소유자 변경 · DB 이중 거부 통합 케이스** - `336c1220` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `domain/corp-cards/index.ts` - `CardOwnerKind` + shared · `CardOwnerInput.kind` · 종류별 칸 조합 판정
- `app/(app)/admin/corp-cards/actions.ts` - zod `kind` enum · 소유자 변경 superRefine 종류별
- `app/(app)/admin/corp-cards/card-form.tsx` - 종류 `공용` 옵션 · 공용이면 소유 칸 없음 · `kind` 전송
- `app/(app)/admin/corp-cards/page.tsx` - 종류 열 `공용` · 공용 행 소유 `—`
- `test/unit/corp-cards/owner-rule.test.ts` - 종류 셋 × 칸 조합 표
- `test/integration/corp-cards.test.ts` - 공용 등록 · 변경 · 위조 · DB 이중 거부, 옛 「둘 다 없음 거부」 → 「개인인데 소지자 없음 거부」
- `test/e2e/corp-cards.spec.ts` - 「공용 법인카드 (06-30 · Q5 · C8)」 두 케이스
- `test/integration/corp-card-owner-archived.test.ts` · `test/integration/corp-card-owner-edit.test.ts` · `test/e2e/table-row-min.spec.ts` - (N-5) 기존 호출부에 케이스 소유 칸대로 `kind`
- `docs/design/checks/2026-10-06-06-30-admin-corp-cards.md` - design-gate 점검표(`- [ ]` 0)

## Test Results (이 실행에서 직접 돌린 것)

| 명령 | 결과 |
|---|---|
| `vitest --project unit test/unit/corp-cards/owner-rule.test.ts` | 12 passed (RED 때 6 failed — shared 행 · 거부 행 단언 실패) |
| `vitest --project unit`(전체) | 262 files · 4026 passed |
| `vitest --project integration` corp-card-owner-archived · corp-card-owner-edit · corp-cards | 19 passed(Task 1 시점) |
| `vitest --project integration` corp-cards · phase6-schema | 80 passed |
| `CI=true playwright --project=desktop --project=mobile-375 --no-deps` corp-cards · mobile-corp-cards · table-row-min · panel-select-errors · master-edit | 40 passed (RED 때 공용 두 케이스 `selectOption("shared")` 「did not find some options」 실패) |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | 모두 exit 0 |
| 변이 검사(통합 corp-cards) | shared 갈래 제거 → 4 failed · shared 칸 검사 제거 → 1 failed(위조 공용) · 복구 뒤 19 passed |

## Decisions Made

- 소유자 변경 superRefine의 개인 · 팀 거부 문구는 기존 그대로 — `panel-select-errors.spec.ts`(플랜 파일 밖)가 원문과 「소지자·팀」 설명을 단언하고, 플랜이 기존 화면 문구 불변을 요구한다. 위조(공용 + 소유 칸)에만 도메인과 같은 새 문구.
- 등록 액션에는 superRefine을 두지 않았다 — 등록 폼(`CardForm`)은 `validationErrors.holderUserId`를 그리지 않아 버튼이 아무 일도 안 하는 것처럼 보이는 QA-1 함정이 된다. 등록의 칸 조합 판정은 도메인이 `serverError`(패널 이유 한 줄)로 돌려준다(기존 동작과 같은 경로).
- 공용 행 소유 칸은 `공용`을 되풀이하지 않고 `—`(같은 말 두 번 금지).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 커밋에 `test/integration/corp-cards.test.ts` 기존 호출부 `kind` 추가**
- **Found during:** Task 1 (`pnpm typecheck`)
- **Issue:** 필수 `kind` 때문에 Task 2 파일(corp-cards.test.ts)의 기존 `createCorpCard` · `updateCorpCardOwner` 호출이 타입 오류 — Task 1 커밋이 typecheck를 통과하려면 함께 고쳐야 했다.
- **Fix:** 케이스 소유 칸대로 `kind`만 더했다(옛 「둘 다 없음」 케이스는 `kind: "personal"` — 거부 뜻 그대로). 이름 · 입력 변경은 Task 2에서.
- **Files modified:** test/integration/corp-cards.test.ts (플랜 files_modified 안)
- **Committed in:** f86f3690

**2. [계획 순서] Task 2 통합 케이스가 첫 실행부터 녹색**
- **Found during:** Task 2
- **Issue:** Task 1 트레이서가 끝까지 서려면 `updateCorpCardOwner` 공용 갈래(kind 전달 · 보관 검사 · 반대 칸 비우기)가 이미 필요해 Task 1에 들어갔다 — Task 2의 「RED 확인 뒤 맞춘다」는 할 것이 남지 않았다.
- **Fix:** RED 대신 변이 검사로 케이스가 비어 있지 않음을 증명(shared 갈래 제거 → 4건 빨강, shared 칸 검사 제거 → 1건 빨강). 커밋 접두어는 `test(06-30)`.
- **Committed in:** 336c1220

**3. [도구 한계] `gsd-tools check tdd-red-evidence`가 vitest TAP를 읽지 못함**
- **Issue:** 검사기는 `node:test` TAP 요약(`# tests N`)만 파싱해 vitest `tap-flat` 출력에 `INVALID_RED (zero_tests_discovered)`를 낸다 — 실제로는 대상 테스트(`shared + 둘 다 없음 → 통과`) 포함 6건이 단언으로 실패했다(위 표). 이 플랜은 `type: execute`라 plan-level TDD 게이트 대상은 아니다. 기록: scratchpad `red-06-30-t1.json`.

---

**Total deviations:** 1 auto-fixed (blocking) + 2 기록(순서 · 도구)
**Impact on plan:** 범위 밖 파일 0 · 06-05 몫(`domain/corp-card-usages/` · `app/(app)/cards/`) 0건 · 저장소 · 스키마 무변경.

## Issues Encountered

- **E2E 의존 사슬:** `CI=true`에서 `mobile-375` 프로젝트가 `desktop`에 의존해 파일 필터를 줘도 desktop 전 스펙(1057개)이 돌았다. 내가 띄운 프로세스만 멈추고 `--project=desktop --project=mobile-375 --no-deps`로 다시 돌렸다(playwright.config.ts 무변경). 그 오실행 중 부하 아래에서 `master-edit.spec.ts:152`(사람 목록 보관 단계 `보관됨` 미표시)가 한 번 빨갰는데, 실패 지점은 `/admin/people` 보관 단계이고 카드 등록 단계는 통과했다. 격리 재실행에서는 녹색(40 passed에 포함) — 이 플랜 변경과 무관한 부하성으로 판단.

## 독립 DOM 감사로 넘기는 항목 (실행자 비독립 — 감사 미실시)

실행자는 에이전트를 띄울 수 없어 DOM 실측 감사를 하지 않았다. 아래는 오케스트레이터의 독립 감사(CI=true, 1280 · 375 · 320) 항목:
1. `/admin/corp-cards?new=1` 종류 `공용` 선택 뒤 — 소지자 · 팀 칸 자리가 남지 않음(빈 간격 · 라벨 잔존 없음), 행동 줄 위치.
2. `/admin/corp-cards?editId=<공용 카드>` — 종류가 `공용`으로 시작, 소유 칸 없음, 1차 `소유자 변경`.
3. 목록 공용 행 — 종류 `공용` · 소유 `—`, 폰(375 · 320) 접힌 줄(P2)에서 `공용 · —` 표시와 가로 넘침 없음.
4. 공용 → 개인/팀 전환 시 소유 칸이 빈 값으로 새로 서는지(`required` 미충족 → 제출 막힘 · 오류 한 줄).

## 독립 검토(risk: money) 판정 한 줄

미실시 — 오케스트레이터가 띄우는 Opus 독립 검토 몫(`cardOwnerKind` 판정 · `updateCorpCardOwner` 공용 갈래 · 소유자 변경 zod `superRefine`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-05가 `CardOwnerKind` `shared` 위에 공용 카드 사용 자격(U-2 — `cards.proxy`만) · `cardOptionsForUsage` 공용 갈래 · `precheckCardUsage` 공용 거부를 짓는다.
- Post-build(묶음마다 한 번): `/review` + `/cso`(돈 경로 `domain/corp-cards`) + `/design-review` · `/qa`(관리자 화면).

---
*Phase: 06-payment-evidence-cards*
*Completed: 2026-10-06*

## Self-Check: PASSED

- FOUND: domain/corp-cards/index.ts · app/(app)/admin/corp-cards/card-form.tsx · test/unit/corp-cards/owner-rule.test.ts · docs/design/checks/2026-10-06-06-30-admin-corp-cards.md
- FOUND: f86f3690 · 336c1220 (`git rev-list --count 13fdca0a..HEAD` = 2)
