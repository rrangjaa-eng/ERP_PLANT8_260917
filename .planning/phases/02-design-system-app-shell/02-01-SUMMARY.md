---
phase: 02-design-system-app-shell
plan: 01
subsystem: design-system
tags: [design-system, documentation, tokens, accessibility, contract]

requires:
  - phase: 02-design-system-app-shell
    provides: 02-CONTEXT.md D-19~D-32(스타일링 기계장치·셸 구성·컴포넌트 인벤토리), 02-RESEARCH.md(CSS 배선·stylelint·boundaries)
provides:
  - "SYSTEM.md 신설 절 5개: §6-7 로그인 화면 · §6-8 시스템 상태 화면 · §6-9 오류 페이지 · §7-11 배너 · §7-12 알림함·배지"
  - "SYSTEM.md 보강 4곳: §6-0(PC 사용자 메뉴 진입점 · 관리자/직원 탭 행 · 소속 미표기 주석 · 시스템 상태 진입점) · §7-1(1차 버튼 위 kbd 테두리) · §7-7(6행 추가, 7→13) · §1-2(비활성 대비값 정정)"
  - "tokens.css: --viz-2 주석 정정 + --on-accent-weak 토큰 신설"
  - "DECISIONS.md 2026-09-19 기록 6건"
  - "test/unit/design-system-docs.test.ts — 위 계약을 고정하는 회귀 테스트"
affects: [02-03, 02-04, 02-05, 02-06, 02-07]

actuals:
  tokens: 7736
  tasks: 3
  commits: 2
plan_head_before: 787225b566cb94d5429bd4f2f44cb089128d4933

tech-stack:
  added: []
  patterns:
    - "다섯 상태(LOADING/EMPTY/ERROR/SUCCESS/PARTIAL) 계약에서 해당 없는 상태는 빈칸이 아니라 「해당 없음 — 이유」로 명시한다(A⑤·E⑤ 확정, 전체 신설 계약에 일반화)"
    - "실물 HTML의 반투명 리터럴(rgba)을 stylelint 리터럴 금지와 화해시킬 때는 값이 같은 새 의미 토큰을 신설한다(픽셀 불변 + 예외 0개)"

key-files:
  created:
    - test/unit/design-system-docs.test.ts
  modified:
    - docs/design/SYSTEM.md
    - docs/design/tokens.css
    - docs/design/DECISIONS.md

key-decisions:
  - "체크포인트 A~I 24개 항목 전부 사용자가 직접 결정(추천안 22개 + A⑤·E⑤ 변경). 에이전트가 지어낸 제품 동작 0건"
  - "F-1①·F-2① 채택 — 기존 E2E 스펙(change-password.spec.ts, login-logout.spec.ts) 무수정 통과 경로를 선택, 재계획 회피"
  - "I② 채택 — 새 토큰 --on-accent-weak 신설로 stylelint 예외 없이 화면 픽셀 불변 유지"
  - "다섯 상태 표시 규칙을 A⑤·E⑤ 국소 예외가 아니라 신설 5개 계약 전체에 일반화 적용"

patterns-established:
  - "SYSTEM.md 신설 절은 §6-3(폼 화면) 서술 밀도를 기준으로 삼는다 — ASCII 목업 + 불릿 규칙 + 다섯 상태 순"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "SYSTEM.md에 로그인·시스템 상태·오류 페이지·배너·알림함 다섯 계약이 신설되고 §6-0/§7-1/§7-7/§1-2가 보강됨"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts"
        status: pass
      - kind: other
        ref: "node -e 자동 검증 스크립트(Task 2 <verify>, 편집 전 실패 확인됨)"
        status: pass
    human_judgment: false
  - id: D2
    description: "tokens.css 대비값 서술 오류 2건 정정 및 새 토큰 --on-accent-weak 신설(픽셀 불변)"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (tokens.css 참조 무결성 검사)"
        status: pass
      - kind: other
        ref: "node -e 자동 검증 스크립트(Task 3 <verify>, --viz-2 주석 정정 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DECISIONS.md에 2026-09-19 기록 6건(이탈 4건 + D-20 범위 기록 1건 + kbd 토큰 신설 1건) 추가"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (DECISIONS.md 기록 개수 단언)"
        status: pass
    human_judgment: false
  - id: D4
    description: "24개 백지 설계 결정이 전부 사람에게서 왔다는 것(에이전트 추측 0건)"
    verification: []
    human_judgment: true
    rationale: "결정의 출처가 사람인지는 텍스트 대조로는 완전히 자동 검증할 수 없다 — 체크포인트 응답과 SYSTEM.md 반영 내용의 일치는 코드 리뷰로 확인 필요"

duration: 조회 불가(체크포인트로 분리된 세션 — Task 1 응답 대기 시간 제외, Task 2·3 실행분만 이 세션에서 측정)
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 1: 디자인 시스템 문서 확정 Summary

**SYSTEM.md에 로그인·시스템 상태·오류 페이지·배너·알림함 5개 계약을 신설하고 4곳을 보강, tokens.css 대비값 2건 정정 + 새 토큰 1개, DECISIONS.md 6건 기록, 회귀 테스트 신설 — 24개 백지 설계 항목 전부 사람이 결정**

## Performance

- **Completed:** 2026-09-19T15:46:42Z
- **Tasks:** 3 (Task 1 체크포인트 결정 + Task 2 문서 편집 + Task 3 토큰·기록·테스트)
- **Files modified:** 4 (SYSTEM.md, tokens.css, DECISIONS.md, design-system-docs.test.ts 신설)
- **Commits:** 2 (docs 커밋 + test 커밋 — Task 1은 커밋 없음)

## Accomplishments

- SYSTEM.md에 §6-7 로그인 화면 · §6-8 시스템 상태 화면 · §6-9 오류 페이지 · §7-11 배너 · §7-12 알림함·배지 다섯 절을 신설했다. 다섯 절 모두 LOADING/EMPTY/ERROR/SUCCESS/PARTIAL을 빠짐없이 명시하고, 해당 없는 상태는 「해당 없음 — 이유」로 적었다(A⑤·E⑤ 확정 규칙을 전체 신설 계약에 일반화)
- §6-0에 PC 사용자 메뉴 진입점(G①, 내 정보·로그아웃·관리자만 시스템 상태), 관리자·직원 임시 탭 행, 소속 미표기 주석, §7-1에 1차 버튼 위 kbd 테두리 규칙(I②), §7-7에 버튼·시트/모달·공통 셸·토스트·상태 태그·배너 6행(7→13)을 보강했다
- §1-2 비활성 텍스트 대비 서술 오류(3.3→4.95, AA 통과)와 tokens.css `--viz-2` 주석의 상충하는 두 대비값(6.3/5.6 → 6.44 하나)을 정정했다
- `--on-accent-weak` 토큰을 신설해 실물의 `rgba(255,255,255,.5)` kbd 테두리를 stylelint 예외 없이, 화면 픽셀 변화 없이 이관할 수 있게 했다
- DECISIONS.md에 2026-09-19 기록 6건(표 미구현 이탈 · 임시 역할 행 · 소속 미표기 · D-20 리터럴 금지 범위 기록 · 대비값 정정 2건 · kbd 토큰 신설)을 남겼다
- `test/unit/design-system-docs.test.ts`를 신설해 위 계약 전부를 회귀 고정했다 — §6-0·§7-7 구간 단위 검증, tokens.css 참조 무결성, DECISIONS.md 기록 개수까지 포함. 회귀 방향은 두 가지 파괴적 편집(§6-0 문장 삭제, 존재하지 않는 토큰 참조 삽입)으로 직접 확인 후 되돌렸다

## Task Commits

Task 1(checkpoint:decision)은 순수 결정 태스크라 커밋이 없다. Task 2·3은 원자적으로 커밋했다:

1. **Task 2: SYSTEM.md 신설 절 5개 + 기존 절 4곳 보강** - `32d6c54` (docs)
2. **Task 3: tokens.css 정정 · DECISIONS.md 기록 6건 · 문서 회귀 테스트** - `4e6ec65` (test)

## Files Created/Modified

- `docs/design/SYSTEM.md` - §6-7·§6-8·§6-9·§7-11·§7-12 신설, §6-0·§7-1·§7-7·§1-2 보강
- `docs/design/tokens.css` - `--viz-2` 주석 정정 + `--on-accent-weak` 신설
- `docs/design/DECISIONS.md` - 2026-09-19 기록 6건
- `test/unit/design-system-docs.test.ts` - 회귀 테스트(신규, 29개 테스트 케이스)

## Decisions Made

체크포인트(Task 1)에서 사용자가 A~I 아홉 묶음 24개 항목 전부를 확정했다. 22개는 추천안 그대로, A⑤·E⑤(다섯 상태를 하나도 비우지 않고 「해당 없음 — 이유」로 명시)만 변경 확정. 상세는 위 `key-decisions` 참고. 재계획 방아쇠(F-1③·F-2②·stylelint 예외) 중 어느 것도 선택되지 않아 Task 2→3을 그대로 진행했다.

## Deviations from Plan

None - 체크포인트 확정값을 그대로 반영했고, 계획된 세 태스크를 순서대로 실행했다. 자동 검증(편집 전 실패 → 편집 후 통과) 전부 계획대로 동작했다.

## Issues Encountered

None.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- SYSTEM.md가 Phase 2가 만들 로그인·내 계정(§6-3 재사용)·시스템 상태·셸·오류 페이지 다섯 화면을 전부 계약으로 덮는다. `ui/` 디렉터리는 여전히 비어 있다(이 플랜은 문서만 다뤘다) — Task 2·3 커밋 어디에도 `ui/**` 파일이 없음을 확인했다
- 02-02(스타일링 기계장치: eslint boundaries `ui` 타입 · stylelint · CI 경로 필터)는 `depends_on: []`로 같은 wave 1에서 병렬 실행됐고 완료됐다(02-02-SUMMARY.md 확인). `--on-accent-weak` 토큰명은 02-03 Task 1이 그대로 참조할 유일한 출처(SYSTEM.md §7-1)와 일치한다
- 02-03(로그인 화면 · 버튼 · 폼)·02-04(PC 사용자 메뉴 · 셸)·02-05(「설정」 라우트)·02-06(오류 페이지 · 배너)이 이 플랜의 결정(G①·H①·F-1①·F-2①·I②)에 의존한다 — 전부 확정되어 각 플랜이 재확인 없이 바로 실행 가능하다
- 표(§7-3) 구현은 여전히 Phase 4 범위, 알림함(§7-12) 실제 구현은 여전히 Phase 7 범위 — 이 플랜은 계약만 남겼다

## Self-Check

- [x] `docs/design/SYSTEM.md` 존재 및 신설 절 5개 확인
- [x] `docs/design/tokens.css` 존재 및 `--on-accent-weak` 정의 확인
- [x] `docs/design/DECISIONS.md` 존재 및 2026-09-19 기록 6건 확인
- [x] `test/unit/design-system-docs.test.ts` 존재 및 통과 확인
- [x] 커밋 `32d6c54`·`4e6ec65` 존재 확인(아래 self-check 절 참고)

---
*Phase: 02-design-system-app-shell*
*Completed: 2026-09-19*
