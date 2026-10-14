---
phase: 06-payment-evidence-cards
plan: 32
subsystem: testing
tags: [playwright, webkit, hydration, codex-design-review, harness]
gap_closure: true
gap_ids: [G-06-G]
plan_head_before: 9ddea44fcabb89e8cb9abe3ba362d736d5c45f30
commits: 1

requires:
  - phase: 06-payment-evidence-cards
    provides: 선결제 칸을 더한 /expenses/new (EXP-13 화면) — 하네스가 WebKit에서 못 찍던 화면
provides:
  - 캡처 하네스 로그인이 이메일 칸의 React 하이드레이션(__reactProps$ 키)을 본 뒤에만 칸을 채우고 로그인을 누른다
  - safari-capture 워크플로 두 번(이 브랜치) 크롬 17/17 · WebKit 17/17 성공 기록
affects: [07 실기기 사파리 확인, Codex 디자인 검토]

actuals:
  tokens: 150
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "하이드레이션 신호 대기: expect.poll로 호스트 요소의 __reactProps$ 키 확인(test/e2e/leave-org.ts waitForHydration과 같은 판정을 scripts 안에 복제 — scripts는 test를 import할 수 없다)"

key-files:
  created: []
  modified:
    - scripts/codex-design-review/capture.spec.ts

key-decisions:
  - "재시도 반복 · 고정 대기 없이 하이드레이션 신호를 기다린다 — 기본 expect.poll 제한(5초)이면 충분하다(JS 청크 2초 지연 스트레스에서 3/3 통과), 명시 제한 시간은 더하지 않았다"
  - "이메일 칸 하나만 기다린다(가정 A-1 확인) — 로그인 폼이 클라이언트 컴포넌트 하나라 같은 하이드레이션 단위"

requirements-completed: [EXP-13]

coverage:
  - id: D1
    description: "캡처 하네스 로그인이 하이드레이션 신호를 본 뒤에 입력한다 — 하이드레이션을 늦춘 크롬 스트레스에서 RED 3/3 → GREEN 3/3, 원래 꼴 경로 넷 캡처 통과"
    requirement: EXP-13
    verification:
      - kind: other
        ref: "CI=true playwright -c playwright.codex-design.config.ts (CODEX_REVIEW_ROUTES 경로 넷) 4 passed · measurements-*.json 4 · PNG 16"
        status: pass
      - kind: other
        ref: "pnpm lint · pnpm typecheck 종료 코드 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "safari-capture 워크플로를 이 브랜치로 두 번 돌려 크롬 · WebKit 캡처 실패 0 (17경로)"
    requirement: EXP-13
    verification:
      - kind: other
        ref: "gh run 38539080720 · 38539095335 conclusion success, 크롬 17 passed · WebKit 17 passed"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-14
status: complete
---

# Phase 06 Plan 32: 캡처 하네스 로그인 하이드레이션 대기 Summary

**Codex 디자인 검토 · 사파리 비교 캡처 하네스의 로그인이 이메일 칸에 React `__reactProps$` 키가 붙은 뒤에만 입력하도록 4줄을 더해, WebKit에서 간헐로 `/login`에 남던 경합(G-06-G)을 닫았다 — 크롬 스트레스로 RED → GREEN을 재현하고 safari-capture 두 번 모두 17/17 성공**

## Performance

- **Duration:** 약 70분 (Task 1 실행 · 스트레스 재현에 대부분)
- **Tasks:** 2 (Task 1 하네스 수정 커밋 · Task 2 워크플로 두 번 실행 — 푸시는 오케스트레이터가 수행)
- **Files modified:** 1 (`scripts/codex-design-review/capture.spec.ts`, +4 / -0)

## Accomplishments

- `capture.spec.ts` 로그인 블록: `page.goto("/login")` 뒤 이메일 `fill` 앞에 `expect.poll(...)`로 이메일 칸 요소의 `__reactProps$` 키를 기다리는 대기 + 주석 한 줄(`G-06-G`). `test/` import 없음, `page.route` · `waitUntil` · `waitForTimeout` 0.
- 캡처 · 측정 · 산출물 꼴(경로당 4폭 스크린샷 이름 · `measurements-*.json` · DOM 실측 칸) 불변.
- 앱 코드와 `.github/workflows/safari-capture.yml`은 건드리지 않았다.

## Task Commits

1. **Task 1: 트레이서 — 하이드레이션 전 로그인 경합 RED 재현 → 대기로 GREEN** — `1d6d176` (fix)
2. **Task 2: WebKit 확인** — 코드 변경 없음(커밋 없음). 푸시 · 워크플로 실행은 오케스트레이터가 했다(아래 표).

## RED → GREEN 기록 (Task 1)

| 단계 | 변형 | 결과 |
|---|---|---|
| 계획 원문 변형 | `goto("/login", { waitUntil: "commit" })`만 | 9/9 통과 — 재현 안 됨. 계측으로 fill 시점에 이미 하이드레이션됨(`hydrated-before-fill=true` 6/6)을 확인 |
| CPU 40배 감속 + commit | 하이드레이션을 늦춤 | 수정 전 `toHaveURL(/\/account$/)` 4/4 실패(`/login`에 남음, 하이드레이션 계측 `false`). 단 감속이 로그인 요청까지 늦춰 수정 뒤에도 5초 기본 URL 대기에 걸려 깨끗한 GREEN을 못 냄 |
| **채택: JS 청크 2초 지연(`page.route` `**/_next/static/**/*.js`) + commit** | 입력 칸은 있고 하이드레이션만 늦음 | **RED 3/3**: `expect(page).toHaveURL(/\/account$/) failed — Received "http://127.0.0.1:3100/login?email=e2e-…%40example.test&password=…"` (하이드레이션 전 클릭이 기본 폼 제출로 흘러 자격이 URL에 실림, 테스트 DB 임시 계정이라 T-06-32-01 accept 범위) → **GREEN 3/3**(같은 스트레스 + 하이드레이션 대기, 약 26초씩) |
| 변형 제거 · 원래 꼴 | 경로 넷(`/account` `/expenses/new` `/projects` `/pnl/reserves`) `CI=true` | 4 passed(37초), `measurements-*.json` 4 · PNG 16, `pnpm lint` · `pnpm typecheck` 종료 코드 0 |

스트레스 변형은 커밋하지 않았다(`git diff`가 더한 4줄만, 지운 줄 0 · `page.route` 0 · `waitUntil` 0).

## Task 2 실측 — safari-capture 두 번 (오케스트레이터 확인, gh api)

브랜치는 origin/main 머지(`877a5e2`, 머지 커밋 · force push 없음) 뒤 푸시, draft PR #219. 워크플로는 `.github/workflows/safari-capture.yml`(수정 안 함) `workflow_dispatch`, 입력 `ref`=`877a5e23c0bd6b4a2d03b690d196f3ede63d1c52`, `routes`=17경로(기본 14 + `/expenses/new` · `/pnl/reserves` · `/cards/purchases`).

| 실행 | ref SHA | 결론 | 크롬 캡처 | WebKit 캡처 | 아티팩트 |
|---|---|---|---|---|---|
| 38539080720 | 877a5e2 | success | 17 passed (2.0m) | 17 passed (1.6m) | WebKit measurements 17 · 전체 34 · PNG 136 |
| 38539095335 | 877a5e2 | success | 17 passed | 17 passed | WebKit measurements 17 · 전체 34 · PNG 136 |

두 번 모두 WebKit 캡처 실패 0 — G-06-G 닫음. 로그에서 checkout HEAD가 `877a5e2`임을 확인(A-2: `gh workflow run`이 거부되지 않아 `human-check` 불필요).

## Decisions Made

- **채택한 RED 스트레스를 계획 문구보다 강화**: 계획 원문(이동 대기를 `commit`으로만 낮춤)은 크롬에서 재현되지 않았다(Playwright `fill`의 자동 대기가 하이드레이션을 기다려 줌). 하이드레이션만 늦추는 JS 청크 지연을 임시로 더해 결정적으로 재현했다.
- **명시 제한 시간 없음**: CPU 감속 스트레스에서 5초 기본 poll이 모자랐지만 그건 로그인 요청까지 늦추는 스트레스의 부작용이었다. 청크 지연 스트레스에서는 기본값으로 충분해 계획(T-06-32-03: 기본 제한 안에서 실패로 끝남)대로 뒀다.
- **A-1 판단**: 이메일 칸 하나만 기다려도 충분하다(GREEN 3/3 · 경로 넷 4/4 · WebKit 17/17 ×2). 버튼까지 기다리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - 검증 도구] RED 스트레스 변형을 계획 문구보다 강화**
- **Found during:** Task 1 ① RED
- **Issue:** `waitUntil: "commit"`만으로는 9/9 통과(재현 안 됨). 계획의 「세 번 재현 안 되면 계측」 경로로 하이드레이션 시점을 계측해 fill 시점에 이미 하이드레이션됨을 확인했다.
- **Fix:** 임시 스트레스를 CPU 감속(실패 원인에 로그인 요청 지연이 섞여 폐기) → JS 청크 2초 지연으로 바꿨다. 둘 다 커밋하지 않았다. 하네스 수정 자체(대기 4줄)는 계획과 같다.
- **Files modified:** 없음(임시 변형, 원복 확인)
- **Commit:** 없음

**Total deviations:** 1 (스트레스 변형 강화, 산출 코드 영향 없음). **Impact:** 없음 — 커밋된 변경은 계획 그대로 4줄 추가.

## Issues Encountered

- 이 세션의 `git rev-list --count 9ddea44..HEAD`는 4이지만 이 플랜 몫은 1이다: 나머지는 origin/main 머지 커밋(`877a5e2`), main 쪽 `00f2487`, 같은 브랜치의 06-31 후속 `86c491d`. `commits: 1`은 이 플랜의 커밋(`1d6d176`)만 센다.
- `pnpm lint`의 boundaries 플러그인 설정 형식 경고는 기존 것이다(범위 밖, 건드리지 않음).

## 검증 요약

- 로컬(CI=true 프로덕션 빌드 · 크롬): 경로 넷 4 passed, `measurements-*.json` 4 · PNG 16.
- `pnpm lint` · `pnpm typecheck` 종료 코드 0.
- acceptance: `__reactProps$` 2줄(주석 · poll), `G-06-G` 1, `page.route` · `waitUntil` · `waitForTimeout` 0, 이메일 `fill`(27행)보다 앞(23 · 25행), `.github/` diff 0, 지운 줄 0.
- 엣지 프로브 EXP-13: 미분류 유지(동작 변경 없음 — 그 화면을 찍는 하네스만 고쳤다).

## Known Stubs

None.

## Threat Flags

None — 새 네트워크 · 인증 · 파일 접근 면이 없다(하네스 대기 4줄).

## 호출한 스킬 · 대조 기록

- `superpowers:test-driven-development` · `superpowers:systematic-debugging` · `superpowers:verification-before-completion`을 호출했다.
- 260907 대조: 옛 저장소에 `__reactProps` 하이드레이션 대기 없음(GitHub 코드 검색 0건, 클론은 이 세션에서 막힘) — 대응 없음.

## Next Plan Readiness

PR-G1(06-31 + 06-32) 코드 `/review` 한 번 남음(화면 · 돈 · 위험 경로 없음 → 세션 머지 가능). WebKit 캡처가 로그인 플레이크 없이 돌아 07 실기기 사파리 확인의 바탕이 된다.

## Self-Check: PASSED

- `scripts/codex-design-review/capture.spec.ts` 존재, 커밋 `1d6d176` 존재(`git log`로 확인).
- 이 SUMMARY의 `commits: 1`은 `git log --no-merges`로 본 이 플랜 커밋 수와 같다.
