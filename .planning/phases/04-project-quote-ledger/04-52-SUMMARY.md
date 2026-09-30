---
phase: 04-project-quote-ledger
plan: 52
subsystem: testing
tags: [playwright, vitest, e2e, uat-gap, revenue-section, select, error-boundary]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-31 매출 입력 폭 판정(canEditEntries · editableWidth) · 04-25 공용 Select · 04-05 프로젝트 목록 error.tsx"
provides:
  - "G-04-64 재현 겸 회귀 E2E 3건 (매출 입력을 연 채 1024 미만 전환 — 값 유지)"
  - "G-04-4 프로젝트 목록 오류 경계 E2E (375, 잘못된 USD 환율 → 오류 → 다시 시도 → 목록 복귀)"
  - "G-04-16 Select 오류 우선 단위 테스트 4건"
affects: [04-53, gsd-verify-work UAT 4 · 16 · 64 재실행]

actuals:
  tokens: 3570
  tasks: 3
  commits: 3
plan_head_before: 68c78d7e0db906e1a077e37e666ab8e51bfa4f4b

tech-stack:
  added: []
  patterns:
    - "공용 설정을 잠깐 바꾸는 E2E는 mobile-* 스펙 + mobile-375 workers: 1로 다른 스펙과 겹치지 않게 한다"
    - "폭 전환 재현은 setViewportSize만 쓰고 reload·goto를 섞지 않는다"

key-files:
  created:
    - test/e2e/mobile-projects-error.spec.ts
    - test/unit/ui/select-error-hint.test.ts
  modified:
    - test/e2e/revenue-section.spec.ts
    - playwright.config.ts

key-decisions:
  - "G-04-64 갈래 G — 재현 (A)(B)(C) 전부 초록이라 결함 없음, 제품 코드 변경 없음"
  - "G-04-4를 폰 스펙에 두고 mobile-375에 workers: 1을 둔다(공용 설정 겹침을 구조로 차단)"

requirements-completed: [PROJ-01, PROJ-03, UX-04]

coverage:
  - id: D1
    description: "G-04-64 — 매출 입력(기존 발행 줄 · 새 발행·입금 줄 · 타이핑 도중)을 연 채 1024 미만으로 줄여도 읽기 표 · 「일괄 저장 N」 · 복귀 값 · 저장 뒤 DB 값이 유지된다"
    requirement: "PROJ-03"
    verification:
      - kind: e2e
        ref: "test/e2e/revenue-section.spec.ts#매출 입력을 연 채 1024 미만 전환 — 값 유지 (G-04-64 · UAT 64) (A)(B)(C)"
        status: pass
    human_judgment: false
  - id: D2
    description: "G-04-4 — 잘못된 fx.recent_rate.USD로 프로젝트 목록 오류 화면(문구 · 다시 시도)이 뜨고, 값을 되돌린 뒤 다시 시도로 새로고침 없이 목록이 돌아온다"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "test/e2e/mobile-projects-error.spec.ts#폰 375 프로젝트 목록 오류 경계 (G-04-4 · UAT 4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "G-04-16 — Select에 error와 설명 있는 옵션이 함께 오면 오류 문구만 보이고 aria-describedby=<id>-error · aria-invalid=true, error 없으면 설명 힌트 · <id>-hint"
    requirement: "UX-04"
    verification:
      - kind: unit
        ref: "test/unit/ui/select-error-hint.test.ts (4건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "G-04-64 (2) 모서리 넷(해석 안 되는 금액 글자 · 미완성 날짜 칸 · 거부 이유 줄 · 포커스 상실 뒤 키) — 값 유실로 볼지 사용자 판단"
    verification: []
    human_judgment: true
    rationale: "진단(.planning/debug/phase4-uat-gaps.md 67행)이 사용자 판단으로 분류했다 — 이 플랜의 판정 기준이 아니다"

duration: 10min
completed: 2026-09-29
status: complete
---

# Phase 4 Plan 52: UAT 공백 셋(G-04-64 · G-04-4 · G-04-16) 테스트 종결 Summary

**갈래: G** — 매출 입력 폭 전환 재현 E2E 3건이 전부 초록이라 결함 없음, 제품 코드 변경 0. 프로젝트 목록 오류 경계 E2E와 Select 오류 우선 단위 테스트 4건을 커밋했고 mobile-375에 `workers: 1`을 두어 공용 설정 조작이 다른 스펙과 겹치지 않게 했다.

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-29T11:10:51Z
- **Completed:** 2026-09-29T11:20:11Z
- **Tasks:** 3
- **Files modified:** 4 (새 파일 2 · 수정 2)

## Accomplishments

- G-04-64 재현 (A) 기존 발행 줄 금액 · (B) 새 발행·입금 줄 · (C) 타이핑 도중 전환이 CI=true로 전부 초록이다. 제품 코드는 그대로다.
- G-04-4 오류 경계를 데이터로 열었다: `fx.recent_rate.USD`=0 → `/projects?new=1`에서 서버 ZodError로 「프로젝트 목록 불러오기 실패」 · 「다시 시도」 → 값 복구 → 클릭 → 문서 표식 유지(새로고침 없음) · 프로젝트 필터 폼 복귀 · 설정 원래 값.
- G-04-16 Select 오류 우선을 비제어·제어 × 오류 있음·없음 4건으로 고정했다.

## G-04-64 재현

- **(A) 초록** — 발행액을 키로 4500000으로 고친 채(blur 없음) 1000 · 375에서 읽기 표에 「4,500,000」 · 발행액 입력 0개 · 「일괄 저장 1」 유지, 1280 복귀 뒤 칸 값 「4,500,000」 유지.
- **(B) 초록** — 새 발행 줄(2026-09-10 · 1,200,000 · 「G-04-64 메모」)과 새 입금 줄(2026-09-12 · 1,320,000, 입금액 칸 포커스)에서 1000 → 1280. 읽기 표 글자 · 「일괄 저장 2」 · 복귀 뒤 다섯 칸 값 유지, 저장 · 새로고침 뒤 DB에 issue 2줄(새 줄 entryDate 2026-09-10 · note · amountAmountKrw 1200000)과 payment 1줄(2026-09-12).
- **(C) 초록** — `keyboard.type("123456789", { delay: 100 })` 도중 칸 값이 3자 이상일 때 1000으로 줄임. 기록기 마지막 숫자열 `1234`(길이 4/9) — 칸이 사라진 뒤 친 키 5개. 읽기 표에 「1,234」가 그대로 있고(칸에 들어간 값이 하나도 빠지지 않음), 1280 복귀 · 저장 · 새로고침 뒤에도 같다. 도중 전환이 실제로 일어났음을 이 길이가 보인다(테스트 annotation `G-04-64 recorder`에도 남는다).
- **결론: 결함 없음 — 재현 E2E를 회귀 테스트로 승격.** 원인 · 수정 · design-gate · DOM 감사는 해당 없음(갈래 F 아님).
- `revenue-section.spec.ts` 전체(CI=true) 16 passed — 기존 매출 스펙 회귀 없음.

### 사용자 판단 대기 (G-04-64 (2) 모서리 넷 — 이 플랜의 판정 기준 아님)

- 사용자 판단 대기: 해석 안 되는 금액 글자(`-` 한 글자)가 창을 줄일 때 사라지는 것
- 사용자 판단 대기: 미완성 날짜 칸(`type="date"`)이 창을 줄일 때 사라지는 것
- 사용자 판단 대기: 거부 이유 줄(`useCommaInput` error)이 창을 줄일 때 사라지는 것
- 사용자 판단 대기: 칸이 사라질 때의 포커스 상실과 그 뒤에 친 키(C에서 5개가 문서로 감)

## Task Commits

1. **Task 1 (tracer): G-04-64 재현 (A)** - `05449580` (test) — 초록, 트레이서 게이트 통과(auto 아님: 기록용 verify가 초록이라 확장 진행)
2. **Task 2: (B)(C) 확장 + 갈래 판정** - `68d13213` (test) — 갈래 G
3. **Task 3: G-04-4 E2E + G-04-16 단위 + workers: 1** - `13bf0c1b` (test)

**Plan metadata:** SUMMARY 커밋(docs)은 이 파일과 함께 남는다.

## Files Created/Modified

- `test/e2e/revenue-section.spec.ts` - G-04-64 describe 3건((A)(B)(C)) 추가, 기존 헬퍼·describe 무변경
- `test/e2e/mobile-projects-error.spec.ts` - 프로젝트 목록 오류 경계 E2E(새 파일, 375)
- `test/unit/ui/select-error-hint.test.ts` - Select 오류 우선 단위 테스트 4건(새 파일)
- `playwright.config.ts` - mobile-375 프로젝트 `workers: 1` 한 줄 + 주석 두 줄

## Decisions Made

- 갈래 G 확정: (A)(B)(C) 전부 초록 → 제품 경로(app · ui · domain · lib · repositories · db) 변경 0(`git log --grep=04-52 -- <경로>` 빈 출력).
- G-04-4 겹침 차단은 스펙 파일 목록이 아니라 구조로 한다: desktop은 `dependencies: ["desktop"]`, 폰 스펙끼리는 `workers: 1`.
- **대가:** 폰 스펙(약 50건, CI 샤드당 약 25건)이 직렬이 된다. desktop 전체가 샤드마다 도는 CI 시간에 비하면 작다. 전용 프로젝트를 새로 만드는 대안은 버렸다(샤딩이 안 되는 의존 프로젝트가 되거나, 이 테스트 하나가 빨가면 폰 스펙 전체가 안 돈다).
- UAT 4 기대 문구의 "reset"은 옛 이름이고 코드의 `retry`(Next 16.3 표준)가 맞다. UAT 4 · 16 · 64의 pass 기록은 `/gsd-verify-work` 재실행 몫이다.

## Deviations from Plan

None - plan executed exactly as written.

(참고: TDD RED — 세 묶음 모두 이미 있는 동작을 고정하는 테스트라 처음부터 초록이었다. 플랜이 예고한 경우다. 헛돌지 않도록 G-04-16은 「오류 있음 ↔ 없음」, G-04-4는 「잘못된 값 → 오류 ↔ 되돌림 → 복귀」 대조 쌍을 두었고, G-04-4는 실행 중 서버가 실제 ZodError(`Too small: expected number to be >0`)를 던지는 것을 확인했다. (C)에는 `test.info().annotations` 한 줄을 더해 기록기 숫자열을 남겼다.)

## Issues Encountered

None

## 게이트 결과

- 단위 `select-error-hint.test.ts` 4/4 passed · `pnpm test:unit` 126 files / 1752 tests passed
- `pnpm lint` exit 0(eslint · stylelint, boundaries 설정 폐기 경고만) · `pnpm typecheck` exit 0 · `pnpm build` exit 0
- E2E(CI=true): `revenue-section.spec.ts` 16 passed(G-04-64 3건 포함) · `mobile-projects-error.spec.ts --project=mobile-375 --no-deps` 1 passed
- `playwright test --list --project=mobile-375 --no-deps`에 새 스펙 1건, `workers: 1` 있음
- `package.json` · `pnpm-lock.yaml` · `tokens.css` diff 빈 출력, `.planning/debug/` 변경 0

## 후속 (이 플랜 밖)

- 화면 파일 변경이 없어 `/design-review`는 이 플랜 몫이 아니다. PR은 Post-build `/review` → `/qa`를 거친다(인증·권한·외부 입력 변경 없음 → `/cso` 해당 없음). 전체 E2E는 PR CI가 한 번 돈다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

UAT 4 · 16 · 64가 테스트 이름으로 pass를 기록할 수 있다(`/gsd-verify-work` 재실행). 모서리 넷은 사용자 판단 대기.

## Self-Check: PASSED

- 파일 존재: `test/e2e/mobile-projects-error.spec.ts` · `test/unit/ui/select-error-hint.test.ts` · `test/e2e/revenue-section.spec.ts` · `playwright.config.ts` 확인
- 커밋 존재: `05449580` · `68d13213` · `13bf0c1b` 확인

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-29*
