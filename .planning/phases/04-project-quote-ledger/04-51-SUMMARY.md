---
phase: 04-project-quote-ledger
plan: 51
subsystem: document-numbering
tags: [document-numbering, settings, postgres, admn-09]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-05 순번 시작값 = 카운터 위 표시 오프셋 · 04-07 DECISIONS 결정 ① 항목"
provides:
  - "순번 시작값 저장 검증 — 올해 이미 매긴 최대 표시 순번 이하 값 거부(결정 ②(a))"
  - "domain/document-numbering assertSeqStartAvailable · SeqStartOverlapError"
  - "DECISIONS 결정 ② 항목"
affects: [04-31, admin-settings, project-create]

actuals:
  tokens: 3000
  tasks: 2
  commits: 2
plan_head_before: 61e326b5dc6a2908f34117bef9a8d121edbceb37

tech-stack:
  added: []
  patterns:
    - "키별 저장 검증은 도메인 함수(assertX)로 두고 \"use server\" 액션이 저장 전에 부른다 — 통합 테스트가 같은 순서로 부른다"

key-files:
  created: []
  modified:
    - domain/document-numbering/index.ts
    - app/(app)/admin/settings/actions.ts
    - test/integration/document-numbering.test.ts
    - docs/design/DECISIONS.md

key-decisions:
  - "결정 ② = (a) 설정 검증 — 사용자 답 2026-09-24(STATE.md 「04 열린 질문 사용자 답」, 세션 C 채팅). 제안 문구는 사용자가 바꾸지 않음"
  - "확정 문구(명사형 변환): 순번 시작값이 이미 매긴 번호({최대})와 겹침 · {최대 + 1} 이상 입력"
  - "최대 표시 순번 = 올해 카운터 + 현재 시작값 − 1 — 이 검증을 거쳐 온 시작값이면 실제 최대 이상(거부 쪽으로만 틀림)"

patterns-established:
  - "설정 키별 검증: 도메인 assert 함수 + 액션 한 줄 호출, 다른 키는 no-op"

requirements-completed: [ADMN-09]

coverage:
  - id: D1
    description: "순번 시작값을 올해 이미 매긴 최대 이하로 낮추는 저장은 확정 문구로 거부되고 설정 값은 그대로다(50·102 거부, 103 통과 뒤 다음 번호가 겹치지 않음)"
    requirement: ADMN-09
    verification:
      - kind: integration
        ref: "test/integration/document-numbering.test.ts#순번 시작값 낮추기(결정 ②)"
        status: pass
    human_judgment: false
  - id: D2
    description: "올해 매긴 번호가 없으면 어떤 값이든 저장 · 다른 키는 검증을 지나지 않음 · 권한 없는 호출은 최대 번호를 알리지 않고 권한 거부"
    requirement: ADMN-09
    verification:
      - kind: integration
        ref: "test/integration/document-numbering.test.ts#순번 시작값 낮추기(결정 ②)"
        status: pass
    human_judgment: false
  - id: D3
    description: "시작값을 바꾼 뒤에도 두 연결의 동시 발급은 서로 다른 번호(04-01 동시성 단언 유지)"
    requirement: ADMN-09
    verification:
      - kind: integration
        ref: "test/integration/document-numbering.test.ts#공통: 시작값을 올린 뒤에도 두 연결이 동시에 매긴 번호는 서로 다르다"
        status: pass
      - kind: integration
        ref: "test/integration/document-counters-concurrency.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "설정 화면에서 거부 문구가 순번 시작값 칸의 기존 오류 자리(저장 실패 · …)에 보인다"
    verification: []
    human_judgment: true
    rationale: "액션 배선(\"use server\")은 Vitest에서 import할 수 없어 통합 테스트는 같은 순서로 도메인 함수를 부른다 — 화면 표시는 /qa에서 확인"

duration: 30min
completed: 2026-09-27
status: complete
---

# Phase 4 Plan 51: 결정 ② 순번 시작값 하향 충돌 — 설정 검증 Summary

**순번 시작값 저장이 올해 이미 매긴 최대 표시 순번(카운터 + 시작값 − 1) 이하이면 명사형 필드 오류로 거부 — 채번 코드는 그대로, 통합 테스트 8건으로 고정**

## Performance

- **Duration:** 30 min
- **Started:** 2026-09-27T19:00:08Z
- **Completed:** 2026-09-27T19:30:48Z
- **Tasks:** 2 (Task 1 기록된 답 적용 · Task 2 구현)
- **Files modified:** 4

## Task 1 — 결정 ② 사용자 답(기록에서 적용)

- **답:** (a) 설정 검증 — 현재 발급 최대 이하 값 거부
- **출처:** `.planning/STATE.md` 「04 열린 질문 사용자 답 … ② 채번 순번 시작값 하향 충돌 → (a) 설정 검증(현재 발급 최대 이하 값 거부, 04-51 Task 1 = a) — 사용자 결정 2026-09-24(세션 C 채팅)」
- **근거 한 줄:** 저장된 시작값이 늘 실제로 쓰이고 이미 매긴 번호와 겹칠 수 없으며 채번 코드는 그대로다.
- **확정 문구:** 사용자가 제안 문구를 바꾸지 않았다. 제안 원문 `순번 시작값이 이미 매긴 번호 {최대}와 겹칩니다 · {최대 + 1} 이상으로 적어 주세요`는 이후 규칙(아래 편차 1)에 따라 `순번 시작값이 이미 매긴 번호({최대})와 겹침 · {최대 + 1} 이상 입력`으로 옮겼다. 실행자는 답을 고르지 않았다(자동 승인 없음).

## Accomplishments

- `assertSeqStartAvailable(viewer, def, value, now)` — 시작값 키일 때만, 올해(KST) 카운터가 있으면 최대 표시 순번을 계산해 이하 값을 `SeqStartOverlapError`(UserFacingError)로 거부
- 설정 저장 액션 `setSimpleSettingAction`이 `setSettingValue` 전에 한 줄로 부른다 — 오류는 기존 `저장 실패 · {문구}` 필드 오류 자리로 간다
- describe `순번 시작값 낮추기(결정 ②)` 8건: 준비(100·101·102) · 50 거부+값 유지(DB 재조회) · 102 거부 · 103 통과 후 26106·26107 · 올해 번호 없음 → 1 저장 후 26001 · 다른 키 no-op · 권한 없음 → ForbiddenError · 동시 발급 서로 다름
- DECISIONS 결정 ② 항목(답 · 날짜 · 근거 · 버린 대안 · 범위)

## Task Commits

1. **Task 1: 결정 ② 답 적용** — 코드 변경 없음(답은 Task 2 커밋의 DECISIONS와 이 SUMMARY에 기록)
2. **Task 2 RED:** `42677ab` (test) — 실패 테스트 8건(`assertSeqStartAvailable is not a function`), 기존 10건 통과
3. **Task 2 GREEN:** `be5275e` (feat) — 검증 함수 · 액션 배선 · DECISIONS 결정 ②

## Files Created/Modified

- `domain/document-numbering/index.ts` — `SeqStartOverlapError` · `assertSeqStartAvailable`(문구 리터럴 한 곳)
- `app/(app)/admin/settings/actions.ts` — 저장 전 검증 호출 한 줄 + import
- `test/integration/document-numbering.test.ts` — describe `순번 시작값 낮추기(결정 ②)`
- `docs/design/DECISIONS.md` — 2026-09-27 결정 ② 항목

## Verification

- `pnpm lint` exit 0 · `pnpm typecheck` exit 0 · `pnpm lint:sql` 0 issues
- 단위 `design-system-docs.test.ts` + `error-copy-noun-style.test.ts` 99/99
- 통합(CI=true) `document-numbering` · `settings` · `document-counters-concurrency` · `document-counters` 37/37
- 변이 확인: `<=`→`<` 하면 102 케이스 실패 · 권한 판정 줄을 지우면 권한 케이스 실패
- 전체 게이트 `CI=true pnpm test` exit 0 — 단위 1703 · 통합 1836 · E2E 468 passed
- `package.json`·`pnpm-lock.yaml` diff 없음(새 의존성 0)

## Decisions Made

- 검사 자리: registry의 키별 훅이 아니라 `domain/document-numbering`의 assert 함수 + 액션 한 줄. registry.ts는 이 플랜 파일 목록 밖이고, registry가 document-numbering을 부르면 순환 import가 된다.
- 최대 표시 순번은 `findDocumentCounter`(기존 export)로 읽는다 — `document-counters.test.ts`가 리포지토리 export 목록을 고정하므로 repositories는 바꾸지 않았다.
- 권한 없는 호출은 검증을 건너뛰고 `setSettingValue`의 권한 거부로 끝낸다 — 최대 번호(올해 프로젝트 수)를 알리지 않는다.
- 형식이 틀린 값(zod 실패)은 검증을 건너뛰어 기존 형식 오류가 그대로 나게 한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 규칙 준수] 확정 문구를 명사형으로 변환**
- **Found during:** Task 2
- **Issue:** 제안 문구 `…겹칩니다 · … 이상으로 적어 주세요`는 main PR #87의 `test/unit/error-copy-noun-style.test.ts`(HONORIFIC_OR_PERIOD — 원인 자리 「니다 ·」, 끝 「세요」)와 DECISIONS 2026-09-26 「오류 문구 명사형 통일」(SYSTEM.md §8-3)에 어긋난다.
- **Fix:** 같은 뜻(원인 · 다음 행동, {최대} · {최대 + 1})의 명사형 `순번 시작값이 이미 매긴 번호({최대})와 겹침 · {최대 + 1} 이상 입력`. 숫자를 괄호에 넣어 조사 「와」가 「번호」에 붙게 했다 — `{최대}와`는 100(백)·101(일)처럼 받침으로 끝나는 숫자에서 「과」여야 해 틀린다. 리터럴은 `domain/document-numbering/index.ts` 한 곳.
- **Verification:** 노운 스타일 단위 테스트 통과 · 통합 테스트가 정확한 문구를 단언
- **Committed in:** be5275e

**2. [Rule 2 - 보안] 권한 없는 호출에 최대 번호 비노출**
- **Found during:** Task 2
- **Issue:** 검증이 `setSettingValue`의 권한 판정보다 먼저 돌아, 설정 쓰기 권한 없는 로그인 사용자가 시작값 저장을 시도하면 올해 최대 번호를 볼 수 있었다.
- **Fix:** 검증 함수가 `can(viewer, "admin.settings", "write")`가 아니면 판정 없이 돌아가 권한 거부를 `setSettingValue`에 맡긴다. 통합 테스트 한 건.
- **Committed in:** be5275e

---

**Total deviations:** 2 auto-fixed (Rule 2 ×2). **Impact:** 문구 모양과 정보 노출만 — 결정 ②의 규칙은 그대로.

## Issues Encountered

- 전체 게이트가 Bash 20분 한도를 넘어 백그라운드로 넘어갔고, 끝까지 기다려 exit 0을 확인했다. E2E 로그의 `[WebServer] Error: The destination stream closed early.`는 실패 없이 468 passed로 끝나는 서버 로그 잡음이다.

## Known Limitations

- **최대가 크게 계산되는 경우:** 시작값을 올린 뒤 아직 번호를 매기지 않았으면 「카운터 + 현재 시작값 − 1」이 실제 최대보다 커서 사이 값이 거부된다(거부 쪽으로만 틀림, 문구의 숫자도 그 계산값). 정확히 하려면 매긴 최대 순번을 따로 저장해야 한다(스키마 변경).
- **동시 경합:** 등록이 서식(옛 시작값)을 트랜잭션 전에 읽은 뒤 그 사이 관리자가 시작값을 낮춰 저장하면(올해 번호가 없을 때 등) 이론상 겹침이 남는다. 서식을 트랜잭션 전에 읽는 것은 풀 소진 교착을 피하는 기존 설계라 바꾸지 않았다. `UNIQUE(format_key, number)`가 마지막 방어선이다.
- 노운 스타일 스캐너는 `domain/document-numbering/`을 개발자 전용으로 제외한다 — 이 문구는 스캐너가 보지 않으므로 통합 테스트의 정확한 문구 단언이 지킨다(스캐너 목록은 이 플랜 파일 밖이라 손대지 않음).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-31(사람 확인)이 이 플랜에 기댄다 — 설정 화면에서 거부 문구 표시(D4)를 /qa에서 확인.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-27*

## Self-Check: PASSED

## Review follow-up (2026-09-27 — 독립 Opus 리뷰: BLOCKING 1 · SHOULD-FIX 2 · NIT 5)

거부 기준(「현재 발급 최대 이하 값 거부」)은 사용자 결정 그대로 두고, 결함만 고쳤다.

| 항목 | 커밋 | 내용 |
|---|---|---|
| B1 | `3fe33fb` (fix) | 바꾸지 않은 현재 시작값의 재저장(설정 화면 blur)은 검증 없이 통과 — 올해 번호를 매긴 뒤 칸을 지나가기만 해도 겹침 오류가 나던 문제. 회귀 2건(시작값 100·3건 뒤 100 재저장 · 기본값 1·첫 번호 뒤 1 재저장) RED(겹침 오류) → GREEN |
| S1 | `867fce2` (fix) | 채번이 카운터 행 잠금 뒤 같은 tx로 순번 시작값을 다시 읽는다 · 설정 저장은 `setSimpleSettingValue` 한 곳에서 `lockDocumentCounter`(행 없으면 0 행 → `SELECT … FOR UPDATE`)로 같은 행을 잠그고 검증·저장·행동 로그를 한 트랜잭션으로(권한은 잠금 전 판정, lock_timeout 5s는 `withTransaction` 그대로). 테스트 3건: 옛 서식 뒤 시작값 1 저장 → 26001(RED 26100) · 커밋 전 등록 중 시작값 1 저장 → 거부(RED 저장됨) · 커밋 전 시작값 저장이 행을 잠그면 등록이 기다렸다 26001(FOR UPDATE 제거 변이에서 26100) |
| S2 | `6c7ce5c` (test) | 화면 문자열 입력("50" 거부 · "100" 통과 · "103" 저장) · 실제 `createProject` 경로(UNIQUE 살아 있음)로 낮추기 시도 뒤 등록 + 카운터 행 없는 2027년 첫 등록, `projects.number` 전부 서로 다름. 변이 두 가지(거부 끔 · B1 예외 뺌)에서 둘 다 실패 확인 |

**편차(리뷰 수정):**
- `assertSeqStartAvailable`은 검증+저장을 한 트랜잭션으로 묶는 `setSimpleSettingValue(viewer, def, value, now)`로 대체(액션은 이 함수 한 줄). 시작값 키가 아니면 `setSettingValue` 그대로.
- `repositories/document-counters.ts`에 `lockDocumentCounter` 추가 → `test/integration/document-counters.test.ts`의 export 목록 고정에 한 줄 추가(플랜 files_modified 밖 — 이 export 고정 때문에 꼭 필요). `domain/projects/index.ts`는 건드리지 않았다(시작값 재읽기는 `allocateDocumentNumber` 안).
- 순번 시작값을 저장하면 그해 카운터 행이 값 0으로 먼저 생길 수 있다(잠글 행이 필요) — 첫 등록은 그대로 1부터.

**검증:** `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues · 단위 118파일 1704 passed · 통합 전체(`CI=true pnpm test:integration`) 65파일 1848 passed. E2E·`pnpm build`는 돌리지 않았다(PR CI 몫).

**넘기는 NIT(고치지 않음):**
- N1 이 검증 배포 전에 이미 낮춰 둔 시작값은 감지하지 못한다(최대 = 카운터 + 현재 시작값 − 1이 실제 최대보다 작을 수 있음) — 배포 때 올해 `projects.number` 최대를 한 번 확인하는 방법이 있다. `pnpm settings:import` 경로도 이 검증을 지나지 않는다.
- N2 노운 스타일 스캐너가 `domain/document-numbering/`을 개발자 전용으로 빼서 이 사용자 문구를 보지 않는다(통합 테스트의 정확한 문구 단언이 지킨다).
- N3 「이미 매긴 번호(102)」는 프로젝트 번호(26102)가 아니라 표시 순번이다.
- N4 빈 칸은 `z.coerce.number()`로 0이 되어 형식 오류 대신 겹침 문구가 난다(기존 강제 변환 동작).
- N5 `8e962dc`에 한국어 본문·트레일러가 없다(이미 푸시 — 이력 재작성 안 함).

**사용자 결정 필요(열린 질문):** 결정 ② 임계값 — 지금 규칙(발급 최대 이하 거부)은 오프셋 모델에서 안전한 값(예: 시작 100·3건 발급 뒤 101·102)도 거부하고 올리면 번호를 건너뜀; 수학적으로 충돌하는 경우는 `새 시작값 < 현재 시작값`(올해 1건 이상 발급)뿐 — 규칙을 바꿀지 사용자 결정 필요
