---
phase: quick-260930-ee9
plan: 01
subsystem: settings-registry, design-docs, e2e
tags: [pr104, review-3, comment, test, doc]
requires: []
provides:
  - getSimpleSettingValues 주석 정정 (E1)
  - 일괄 읽기 표시 없는 키 fail-closed 단위 테스트 (E2)
  - export 실효값 주석 (E5)
  - SYSTEM.md 7-1 / 7-8 to 3 역참조 + design-gate 점검표 (E3)
  - PC 1280/700 「일괄 저장」 높이 32 E2E 가드 (E4)
affects: []
key-files:
  modified:
    - domain/settings/registry.ts
    - domain/settings/export.ts
    - test/unit/settings/registry.test.ts
    - docs/design/SYSTEM.md
    - test/e2e/mobile-touch-targets.spec.ts
  created:
    - docs/design/checks/2026-09-30-머리줄-44-역참조.md
decisions: []
status: complete
commits: 5
plan_head_before: 0c9384b8624d89236c52cc53d4431f51113bf195
actuals:
  tokens: 9000
  tasks: 3
  commits: 5
---

# Quick 260930-ee9: PR104 review-3 E1~E5 Summary

PR #104 /review 3차 참고 E1~E5를 동작 변경 없이 주석·테스트·문서로 닫았다. E2·E4는 임시 변이로 RED를 확인했다.

## Commits

| Item | Hash | Subject | Files |
|------|------|---------|-------|
| E1 | d84123d | docs: correct getSimpleSettingValues comment to parseStoredSimpleValue | domain/settings/registry.ts (주석 3+/1-) |
| E2 | 2888ba0 | test: pin strict batch read for unflagged setting keys | test/unit/settings/registry.test.ts |
| E5 | 156a8ec | docs: note settings export writes effective values, not stored raw | domain/settings/export.ts (주석 1줄) |
| E3 | f2010c3 | docs: point SYSTEM 7-1 and 7-8 to section 3 header exception | docs/design/SYSTEM.md (2+/2-), 점검표 |
| E4 | ab9b818 | test: guard PC 32 height of detail header save button | test/e2e/mobile-touch-targets.spec.ts |

`git diff 0c9384b..HEAD --stat`: 6개 파일(registry.ts, registry.test.ts, export.ts, SYSTEM.md, 점검표, E2E 스펙), app/ ui/ db/ lib/ repositories/ .claude/ CLAUDE.md 변경 0. `.claude/gates/`는 건드리지 않았고 작업 트리에 변경이 없다.

## Mutation RED evidence

### E2 (registry.ts 일괄 경로 표시 무시)
변이: `parseStoredSimpleValue(def, …)` 첫 인자를 `{ ...def, readInvalidAsDefault: true }`로 임시 변경.
`pnpm vitest run --project unit test/unit/settings/registry.test.ts`:
```
× getSimpleSettingValues (일괄 읽기) > 표시 없는 키는 일괄 읽기에서도 범위 밖 저장값을 거부한다 — 기본값 대체·log.error 없음
AssertionError: promise resolved "[ 0.5 ]" instead of rejecting
Tests  1 failed | 20 passed (21)
```
되돌림: `git checkout -- domain/settings/registry.ts`, `git diff --quiet -- domain/settings/registry.ts` 통과(REVERTED_CLEAN). 재실행 설정 단위 78/78 통과.

### E4 (quote-table.tsx 「일괄 저장」 className + project-detail.module.css 폰 블록 밖 규칙)
변이: CSS 최상위에 `.headerActions .saveLeakProbe { min-height: var(--touch-min); }`, 「일괄 저장」 Button className에 `${styles.saveLeakProbe}` 추가.
`CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps` (attempt2): 3 passed, PC 테스트만 실패.
```
Error: 일괄 저장 @1280 높이   Expected: 32   Received: 44
Error: 일괄 저장 @700 높이    Expected: 32   Received: 44
```
다른 단언(상태 바꾸기, 복사 버튼, 정렬 머리글 등)은 통과. 되돌림: `git checkout -- app/...` 두 파일, `git diff --quiet HEAD -- app` 통과(APP_CLEAN). attempt3 재실행 4/4 통과.

## Test / gate results

- 설정 단위 `pnpm vitest run --project unit test/unit/settings`: 6 files, 78/78 통과(새 E2 테스트 포함; 기존 77).
- `pnpm lint` exit 0 (boundaries 플러그인 설정 경고만, 기존), `pnpm typecheck` exit 0.
- E2E `mobile-touch-targets.spec.ts` CI=true: attempt1 4/4 통과(새 단언이 처음부터 통과, 동작이 이미 맞음), attempt3(변이 되돌림 후) 4/4 통과. `toBeCloseTo(32, 0)` 4개, `#period-end` 2개.
- E1·E5 커밋 diff는 `//` 주석 줄뿐. E3 SYSTEM.md 2+/2-, 역참조 문구 정확히 2곳, 점검표 전 항목 [x].

## Deviations from Plan

1. **E4 배치(계획대로)**: 「일괄 저장」 단언은 기존 WIDTHS_PC 루프 안이 아니라 같은 PC 가드 테스트 안에서 그 루프 뒤의 두 번째 `for (const width of WIDTHS_PC)` 루프에 둔다. 회차마다 기간을 편집하면 use-dirty-storage(localStorage)에 남은 저장 안 한 편집이 다음 회차에 복원 줄을 띄우기 때문에, 폰 테스트처럼 한 번 dirty를 만들고 폭만 바꿔 잰다. 의도(PC 1280·700 32 단언)는 같다.
2. E4 변이 CSS 한 줄은 임시로 `printf >>`로 덧붙였다(커밋되지 않고 `git checkout --`로 제거된 일회성 변이 프로브, 코드/테스트 파일 작성이 아님).
3. 커밋 접두어 `test:`는 사용자 제약이 지정한 것이라 CLAUDE.md §5 권장 접두어 밖이지만 그대로 썼다(훅 경고만, 차단 없음).

Auto-fix(Rule 1~3) 없음. 인증 게이트 없음.

## Skill 호출

| Task / Commit | 시작 시 | 커밋 직전 | 그 밖 |
|---|---|---|---|
| Task 1 E1 (d84123d) | test-driven-development | verification-before-completion (단위 77 · lint 0 · typecheck 0) | |
| Task 1 E2 (2888ba0) | (Task 1 시작 호출 유지) | verification-before-completion (단위 78 · lint 0 · typecheck 0, 변이 되돌림 후) | |
| Task 1 E5 (156a8ec) | (Task 1 시작 호출 유지) | verification-before-completion (단위 78 · lint 0 · typecheck 0) | |
| Task 2 E3 (f2010c3) | test-driven-development | verification-before-completion (verify 단언 전부 + lint 0) | design-gate (편집 전, 점검표를 별도 git add 후 커밋) |
| Task 3 E4 (ab9b818) | test-driven-development | verification-before-completion (E2E 4/4 · lint 0 · typecheck 0 · 설정 단위 78) | design-gate는 Task 2에서 호출됨(app/ 변이는 미커밋) |

systematic-debugging은 호출하지 않았다: 두 RED 실패는 변이로 의도한 실패였고 예기치 않은 실패는 없었다.

## Known Stubs

없음.

## Threat Flags

없음. T-q-ee9-01(변이 잔존)은 git diff --quiet 확인으로, -02는 E2 테스트로, -04는 E4 단언으로 완화했고 -03은 E5 주석으로 기록만 했다.

## Self-Check: PASSED

- 커밋 5개 존재: d84123d, 2888ba0, 156a8ec, f2010c3, ab9b818 (`git log 0c9384b..HEAD`)
- 생성 파일 존재: docs/design/checks/2026-09-30-머리줄-44-역참조.md
- `git diff --quiet HEAD -- app ui domain test` 통과, 작업 트리에 추적 파일 변경 없음(.planning 미추적만)
- Do not push: 푸시하지 않음
