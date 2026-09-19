---
phase: 02-design-system-app-shell
plan: 02
subsystem: infra
tags: [eslint-plugin-boundaries, stylelint, docker, github-actions, ci]

# Dependency graph
requires:
  - phase: 01-deploy-skeleton-login
    provides: eslint.config.mjs 4계층 boundaries, .dockerignore/Dockerfile 멀티스테이지, ci.yml/deploy.yml paths-ignore 트리거, docs/ARCHITECTURE.md 4계층 문서
provides:
  - "eslint boundaries `ui` 타입(패턴 `ui/**`) — 첫 `ui/` 파일보다 먼저 선 경계"
  - "stylelint@17.15.0 + 규칙(색·서체·radius 리터럴 금지, 간격 제외) + `pnpm lint` 배선"
  - "Docker 빌드 컨텍스트가 `docs/design/tokens.css`를 포함(D-21의 직접 import 실현 조건)"
  - "CI/배포 워크플로 트리거가 `paths` + `!` 형태로 `docs/design/tokens.css`만 예외 복원"
affects: [02-03, 02-04, 02-05, 02-06, 02-07]

actuals:
  tokens: 3834
  tasks: 3
  commits: 3

tech-stack:
  added: [stylelint@17.15.0]
  patterns:
    - "boundaries `ui` 타입: `{ from: 'ui', allow: ['ui', 'lib'] }` — 순수 표현 계층, domain/repositories/db/app import 금지"
    - "stylelint 내장 규칙 조합(allowed-list/disallowed-list)만으로 리터럴 금지 — 별도 플러그인 없음"
    - "CI/배포 트리거: `paths` + `!` 4패턴(전체 포함 → `.planning` 부정 → `docs` 부정 → `docs/design/tokens.css` 긍정) — `paths-ignore`는 부정 패턴을 문서가 지원하지 않아 폐기"

key-files:
  created:
    - stylelint.config.mjs
    - test/unit/stylelint-config.test.ts
  modified:
    - eslint.config.mjs
    - docs/ARCHITECTURE.md
    - package.json
    - pnpm-lock.yaml
    - .dockerignore
    - .github/workflows/ci.yml
    - .github/workflows/deploy.yml
    - test/unit/ci-guard.test.ts
    - test/unit/deploy/workflows.test.ts

key-decisions:
  - "간격(margin/padding/gap) 리터럴은 stylelint 금지 대상에서 제외했다 — D-20 2026-09-19 사용자 비준을 그대로 따랐다(실물 HTML 간격 리터럴 283건 중 175건이 4px 토큰 스케일에 대응하지 않는다)"
  - ".dockerignore의 `docs` 라인은 부분 예외가 아니라 통째로 제거했다 — build 스테이지가 `COPY . .`로 컨텍스트 전체를 한 레이어에 담아 캐시 보존 이점이 없고, `!docs/design/tokens.css` 같은 부정 패턴 의미론을 Docker 데몬 없는 이 환경에서 확인할 수 없기 때문이다"
  - "CI/배포 트리거는 `paths-ignore`에서 `paths` + `!`로 전환했다 — GitHub 문서가 부정 패턴을 지원한다고 명시하는 필터는 `paths`뿐이다. 실제 트리거 동작은 로컬에서 판정 불가하여 사람 체크로 남겼다"

patterns-established:
  - "규칙 자체에 단위 테스트를 붙인다(stylelint.config.mjs → test/unit/stylelint-config.test.ts) — Phase 1의 eslint 커스텀 규칙 + rule-tester 전례를 stylelint의 standalone API로 재현"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "eslint boundaries에 `ui` 타입 신설 — 첫 `ui/` 파일이 생기기 전에 경계가 서 있고, 금지 import를 실제로 error로 막는다"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "pnpm lint (전체 앱 스캔, 0 errors)"
        status: pass
      - kind: other
        ref: "boundaries 프로브 — ui/ probe importing lib/viewer(허용) vs domain/viewer(금지): EXIT_OK=0, EXIT_BAD=1 (boundaries/element-types 에러로 실제 확인)"
        status: pass
      - kind: unit
        ref: "test/unit/docs-limits.test.ts (26 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/ARCHITECTURE.md §2에 `ui/` 계층을 다섯 번째 요소로 반영, 300줄 상한 이내(126줄)"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/docs-limits.test.ts#'300줄 이하다'"
        status: pass
    human_judgment: false
  - id: D3
    description: "stylelint@17.15.0 도입 — 색·서체·radius 리터럴 금지, 간격/box-shadow 오프셋은 제외, 규칙 자체에 12개 단위 테스트"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/stylelint-config.test.ts (12 tests)"
        status: pass
      - kind: other
        ref: "pnpm lint 프로브 — #fff 리터럴(색)은 error, var(--bg)+padding+box-shadow 오프셋(간격/오프셋)은 통과"
        status: pass
    human_judgment: false
  - id: D4
    description: "Docker 빌드 컨텍스트가 docs/design/tokens.css를 포함하도록 .dockerignore 수정 — D-21의 직접 import가 프로덕션 이미지 빌드에서 깨지지 않는다"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/dockerfile.test.ts (필수 목록에 docs 없었음을 확인, 8 tests)"
        status: pass
    human_judgment: true
    rationale: "이 환경에 Docker 데몬이 없어 실제 docker build로 재현하지 못했다(리서치가 이미 문서화한 환경 제약) — .dockerignore·Dockerfile 텍스트 검사로만 확인했다"
  - id: D5
    description: "CI(pull_request)·배포(push) 트리거를 paths-ignore에서 paths + ! 형태로 교체 — docs/design/tokens.css만 바뀐 커밋도 CI·배포를 탄다"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/ci-guard.test.ts, test/unit/deploy/workflows.test.ts (42 tests 합계, 신설 케이스 포함)"
        status: pass
      - kind: other
        ref: "node -e 패턴 존재·순서 검증 스크립트 (ok 출력)"
        status: pass
    human_judgment: true
    rationale: "실제 GitHub Actions 트리거 동작(tokens.css 단독 PR이 CI를 타는지, 일반 소스 PR도 여전히 타는지)은 GitHub 서버만 판정할 수 있다 — 로컬 검증은 패턴의 존재·순서만 증명한다. PLAN.md의 <human-check> 두 항목이 아직 수행되지 않았다"

duration: 11min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 2: 경계 도구·빌드 배선 Summary

**`ui/**` 경계 타입을 첫 컴포넌트보다 먼저 등록하고, 색·서체·radius 리터럴을 막는 stylelint를 배선하고, D-21의 직접 tokens.css import가 프로덕션 Docker 빌드·CI·배포에서 깨지지 않도록 `.dockerignore`와 두 워크플로 트리거를 고쳤다.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-19T14:35:33Z
- **Completed:** 2026-09-19T14:46:41Z
- **Tasks:** 3
- **Files modified:** 11 (9 modified, 2 created)

## Accomplishments
- `eslint.config.mjs`에 boundaries `ui` 타입(패턴 `ui/**`)과 `{ from: "ui", allow: ["ui","lib"] }` 정책을 신설하고, `app`·`test` 정책 allow 목록에도 `"ui"`를 더했다 — D-24가 요구하는 「내 차례」 단위 테스트가 `ui/` 파일을 import할 수 있게 됐다. 프로브로 실제 강제(EXIT_OK=0/EXIT_BAD=1)를 확인했다.
- `docs/ARCHITECTURE.md` §2에 `ui/` 계층을 다섯 번째 요소로 반영(126줄, 300줄 상한 이내).
- `stylelint@17.15.0`을 설치(D-20이 승인한 유일한 신규 devDependency)하고 `stylelint.config.mjs`에 색·서체·radius 리터럴 금지 규칙을 내장 규칙만으로 조합했다. 간격은 범위 밖으로 명시적으로 제외했다(D-20 2026-09-19 비준).
- `test/unit/stylelint-config.test.ts`에 규칙 자체를 검증하는 12개 케이스를 붙였다(색/서체/radius 리터럴 걸림, 토큰 참조 통과, box-shadow 오프셋 통과 vs 색 리터럴 걸림, 간격 무관, `#fff`↔`var(--bg)` 등가).
- `.dockerignore`에서 `docs` 라인을 제거해 Docker 빌드 컨텍스트에 `docs/design/tokens.css`가 존재하게 했다.
- `ci.yml`·`deploy.yml`의 트리거를 `paths-ignore`에서 `paths` + `!` 4패턴(전체 포함 → `!.planning/**` → `!docs/**` → `docs/design/tokens.css`)으로 바꿨다. 두 기존 테스트를 새 형태에 맞게 고쳤다.

## Task Commits

Each task was committed atomically:

1. **Task 1: eslint boundaries에 `ui` 타입 신설 + ARCHITECTURE.md 계층 반영** - `1408190` (feat)
2. **Task 2: stylelint 도입 — 색·서체·radius 리터럴 금지 + 규칙 테스트** - `91a050d` (feat)
3. **Task 3: 빌드 컨텍스트와 CI 트리거 — D-21이 프로덕션까지 닿게 한다** - `02bd7f3` (fix)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified
- `eslint.config.mjs` - boundaries `ui` 타입 + `app`/`test`/`ui` 정책 편집
- `docs/ARCHITECTURE.md` - §2에 `ui/` 계층 반영, §8 린트 규칙 표에 `ui` 경계 추가
- `stylelint.config.mjs` - 색·서체·radius 리터럴 금지 규칙(신규)
- `test/unit/stylelint-config.test.ts` - 규칙 단위 테스트 12개(신규)
- `package.json` - `lint` 스크립트에 stylelint 이어 붙임, `stylelint` devDependency 추가
- `pnpm-lock.yaml` - stylelint 설치 반영
- `.dockerignore` - `docs` 제외 라인 제거
- `.github/workflows/ci.yml` - `pull_request` 트리거를 `paths` + `!`로 교체
- `.github/workflows/deploy.yml` - `push` 트리거를 `paths` + `!`로 교체
- `test/unit/ci-guard.test.ts` - 새 트리거 형태(paths-ignore 부재·패턴 존재·순서) 검증으로 교체
- `test/unit/deploy/workflows.test.ts` - 동일 검증을 deploy.yml에 적용

## Decisions Made
- 간격(margin/padding/gap) 리터럴은 stylelint 금지 대상이 아니다(D-20 비준 그대로) — 실물 HTML의 간격 리터럴 대다수가 tokens.css 4px 스케일에 대응하지 않아, 금지하면 SYSTEM.md가 이관을 지시한 마크업 자체가 거부된다.
- `.dockerignore`의 `docs` 제외는 부분 예외가 아니라 통째 제거했다 — 캐시 보존 이점이 없고(단일 `COPY . .` 레이어), 부정 패턴 의미론을 Docker 데몬 없는 이 환경에서 검증할 수 없기 때문이다. 비용은 빌드 컨텍스트 전송량 약 9.2MB 증가뿐이고 최종 이미지 크기는 불변이다.
- CI/배포 트리거는 `paths-ignore`가 아니라 `paths` + `!`를 썼다 — GitHub 문서가 부정 패턴 지원을 명시하는 쪽이 `paths`뿐이기 때문이다. 필터 기본값이 뒤집히는 위험(전체 미실행) 때문에 첫 패턴을 반드시 전체 포함(`**`)으로 두었다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `test/unit/stylelint-config.test.ts`의 TS strict `noUncheckedIndexedAccess` 위반 수정**
- **Found during:** Task 2 (`pnpm typecheck` 검증)
- **Issue:** `results[0].warnings`가 `results[0]`이 `undefined`일 수 있어 strict 모드에서 타입 에러(TS2532)
- **Fix:** 구조 분해 `const [result] = results;` + 런타임 가드(`if (!result) throw ...`)로 변경
- **Files modified:** test/unit/stylelint-config.test.ts
- **Verification:** `pnpm typecheck` 0 errors, `pnpm vitest run --project unit test/unit/stylelint-config.test.ts` 12/12 pass
- **Committed in:** 91a050d (Task 2 commit)

**2. [Rule 1 - Bug] `stylelint.config.mjs`의 eslint `import/no-anonymous-default-export` 경고 제거**
- **Found during:** Task 3 (`pnpm lint` 재검증 중 발견 — stylelint.config.mjs도 eslint의 `.` glob 스캔 대상)
- **Issue:** `export default { ... }` 형태가 eslint 경고를 냈다(에러는 아니지만 `pnpm lint` 출력을 오염)
- **Fix:** `eslint.config.mjs`와 같은 컨벤션(named const → `export default`)으로 변경
- **Files modified:** stylelint.config.mjs
- **Verification:** `pnpm lint` 경고 0개, `pnpm vitest run --project unit test/unit/stylelint-config.test.ts` 12/12 pass
- **Committed in:** 02bd7f3 (Task 3 commit, 함께 바뀐 파일이라 Task 3 커밋에 포함)

---

**Total deviations:** 2 auto-fixed (모두 Rule 1 — 발견된 즉시 고친 타입/린트 버그)
**Impact on plan:** 둘 다 코드 품질·타입 안전성 수정이며 범위 확장 없음.

## Issues Encountered

**Task 2 프로브 검증의 리터럴 종료 코드 불일치.** PLAN.md의 Task 2 `<verify>`는 색 리터럴이 걸린 `pnpm lint`가 `EXIT_BAD=1`을 출력한다고 명시했지만, 실측 결과 stylelint@17.15.0 CLI는 린트 위반을 찾으면 종료 코드 **2**를 반환한다(1은 stylelint의 사용법/설정 오류 전용 — `pnpm exec stylelint`로 직접 확인). 기능적 계약(색 리터럴이 있으면 실패, 없으면 `pnpm lint`가 정확히 exit 0)은 실측으로 증명됐다 — `EXIT_BAD=2`(nonzero, 실패) / `EXIT_OK=0`(성공). 리터럴 숫자 `1`은 PLAN.md 작성 시점의 가정이었고 실제 CLI 동작과 다르다는 점을 여기 기록한다. 스크립트를 인위적으로 감싸 종료 코드를 `1`로 강제하는 것은 D-20 범위 밖의 불필요한 작업이라 하지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `ui/` 경계가 서 있어 02-03 이후 플랜이 실제 `ui/` 컴포넌트를 만들 때부터 즉시 boundaries가 강제된다.
- stylelint가 `pnpm lint`에 배선되어 이후 CSS Modules 작성 시 리터럴 위반이 즉시 잡힌다.
- **미해결(사람 체크 필요):** PLAN.md Task 3의 `<human-check>` 두 항목 — (1) `docs/design/tokens.css`만 바뀐 PR에서 `ci` 워크플로가 실제로 트리거되는지, (2) 무관한 소스 파일만 바뀐 PR에서도 `ci`가 여전히 트리거되는지(필터 기본값 뒤집힘 검사). 이 둘이 GitHub에서 확인되기 전까지 트리거 변경은 미검증 상태다. (2)가 실패하면 즉시 `paths-ignore` 형태로 되돌리고 tokens.css 예외는 포기해야 한다.
- Pretendard 서체 도입(D-32)의 사람 체크포인트(Windows Chrome/Edge 자릿수 정렬·전송량)는 아직 이 플랜 범위가 아니다 — 이후 플랜에서 처리.

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: stylelint.config.mjs
- FOUND: test/unit/stylelint-config.test.ts
- FOUND: commit 1408190 (Task 1)
- FOUND: commit 91a050d (Task 2)
- FOUND: commit 02bd7f3 (Task 3)
- Re-ran all acceptance criteria for Tasks 1-3: all PASS
- Re-ran plan-level `<verification>`: `pnpm lint` (exit 0, 0 errors), `pnpm typecheck` (exit 0), `pnpm test:unit` (216/216 pass), boundaries probe (EXIT_OK=0/EXIT_BAD=1), stylelint probe (color literal → error, token+padding+box-shadow offset → pass), `.dockerignore`/workflow pattern-order script → `ok`
- `git status --porcelain ui/` empty (no leftover probe files; empty `ui/` directory removed)
