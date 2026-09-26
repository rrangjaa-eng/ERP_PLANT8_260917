---
phase: 04-project-quote-ledger
plan: 43
subsystem: docs
tags: [requirements, roadmap, wording, D16]

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: "04-01(다섯 상태 모델 실 적용 시작)·04-05(계약 금액 파생 전제 화면) 의사결정 원장 D-75~D-84"
provides:
  - "REQUIREMENTS.md PROJ-04(다섯 상태·자동 정산·대표/시스템 관리자 직접 완료·정산 편집 범위) 문구"
  - "REQUIREMENTS.md PROJ-03(파생 계약 금액) 문구"
  - "ROADMAP.md Phase 4 성공 기준 4(사람·자동 전환 5종 + 정산 편집 범위 + 파생 계약 금액) 문구"
affects: ["04-06", "04-11", "04-16", "04-20", "04-21", "gsd-verify-work"]

# Actuals (#2632)
actuals:
  tokens: 2832
  tasks: 1
  commits: 1
plan_head_before: 1480ffc8d5c54de81883e824583597d4c7957d25

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "D16 승인 범위(PROJ-04·PROJ-03·ROADMAP 기준 4) 세 곳만 고치고 그 밖의 낡은 문구는 손대지 않는다 — 아래 「남은 낡은 문구」 표로 남긴다"

patterns-established: []

requirements-completed: []  # PROJ-03·PROJ-04는 04-06·04-11·04-16·04-20·04-21 등 다른 미완료 플랜도 선언 중 — requirements.ready-ids가 blocked 반환, mark-complete 미호출(계획 규율 5)

coverage:
  - id: D1
    description: "REQUIREMENTS.md PROJ-04가 다섯 상태(수주중·진행·정산·완료·미수주)·진행→정산 자동 전환(D-76)·정산→완료의 Phase4 대표/시스템 관리자 직접 전환(D-79)·정산에서 PM의 실행가 편집+견적가 0 새 줄(D-78, 사용자 D10·D12)을 말한다"
    requirement: "PROJ-04"
    verification:
      - kind: other
        ref: "node -e 검증 1 (REQUIREMENTS PROJ-04/PROJ-03 필수 어휘 포함 확인, 본문 Verification Output 참조)"
        status: pass
    human_judgment: false
  - id: D2
    description: "REQUIREMENTS.md PROJ-03이 계약 금액을 입력 칸이 아니라 고객 승인된 현재 차수 견적 합계(공급가)로 말한다(D-84)"
    requirement: "PROJ-03"
    verification:
      - kind: other
        ref: "node -e 검증 1 (동일 명령, PROJ-03 '고객 승인' 포함 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ROADMAP.md Phase 4 성공 기준 4가 같은 모델(사람 전환 5종 + 자동 전환 1종 + 정산 편집 범위 + 파생 계약 금액)로 바뀌고 그 밖 줄은 diff 0이다"
    verification:
      - kind: other
        ref: "node -e 검증 2 (ROADMAP c4 옛 전환 문구·계약 금액 입력 문구 부재 확인) + node -e 검증 3 (REQUIREMENTS 커밋 기준 ROADMAP diff ≤2줄) + git log -1 --format=%s (docs(04): 접두어 확인)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-24
status: complete
---

# Phase 04 Plan 43: REQUIREMENTS·ROADMAP D16 2차 보강 Summary

**D-75~D-84 다섯 상태·파생 계약 금액 모델로 PROJ-04·PROJ-03·ROADMAP Phase 4 기준 4 세 줄만 고친 GSD 도구 커밋 하나**

## Performance

- **Duration:** 10min
- **Started:** 2026-09-24T08:36:00Z (근사)
- **Completed:** 2026-09-24T08:46:25Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `.planning/REQUIREMENTS.md` PROJ-04를 옛 네 상태(수주중·진행·완료(정산)·미수주) 문구에서 다섯 상태(수주중·진행·정산·완료·미수주) + 자동 전환(D-76) + 사람 전환 5종(D-82·D11·D79·D80) + 정산 편집 범위(D-78, 사용자 D10·D12) 문구로 교체(PNL-07 관련 기존 문장은 그대로 유지)
- `.planning/REQUIREMENTS.md` PROJ-03을 "계약 금액 입력 칸" 문구에서 "고객 승인된 현재 차수 견적 합계(공급가)에서 파생" 문구(D-84)로 교체
- `.planning/ROADMAP.md` Phase 4 성공 기준 4를 옛 전환 4종·계약 금액 입력 가능 문구에서 사람 전환 5종 + 자동 전환 1종 + 정산 편집 범위 + 파생 계약 금액 문구로 교체(괄호 안 Phase 5·6·9 문장, 음수 규칙 문장, 취소 상태 문장은 원문 그대로 보존)
- 두 파일을 `node .claude/gsd-core/bin/gsd-tools.cjs query commit`으로 한 커밋(`1111278`)에 담음 — 1차 보강(`edd0d73`)과 같은 GSD 도구 경로, 손 커밋 아님

## Task Commits

Each task was committed atomically:

1. **Task 1: 트레이서 — REQUIREMENTS·ROADMAP 세 문구(D16)를 고치고 GSD 도구 커밋 하나로 남긴다** - `1111278` (docs)

**Plan metadata:** (다음 커밋 — SUMMARY.md·STATE.md·ROADMAP.md progress 갱신)

## Files Created/Modified
- `.planning/REQUIREMENTS.md` - PROJ-04(다섯 상태·자동 정산·전환 5종·정산 편집 범위)·PROJ-03(파생 계약 금액) 두 줄
- `.planning/ROADMAP.md` - Phase 4 성공 기준 4 한 줄(전환 5+1종, 정산 편집 범위, 파생 계약 금액)

## Decisions Made
- D16 승인 범위(세 곳만)를 엄격히 지켜 그 밖의 `.planning/` 문서를 손으로 고치지 않았다. 승인 밖 낡은 문구는 아래 「남은 낡은 문구」 표로 남겨 사용자가 `/gsd-phase` 편집 여부를 정하게 한다.

## Deviations from Plan

None - plan executed exactly as written. (얕은 clone 문제만 있었다 — 아래 「Issues Encountered」 참조.)

## Issues Encountered
- 체크아웃이 얕은 clone(`git rev-parse --is-shallow-repository` → `true`)이라 `git cat-file -e d6b41cf`가 처음 `fatal: Not a valid object name`을 냈다. `git fetch --deepen=400 origin claude/gsd-progress-e1nzgu` 실행 뒤 `edd0d73`·`d6b41cf` 둘 다 유효한 object로 확인됐고(`is-shallow-repository` → `false`), threat T-04-SC 검증(`git diff d6b41cf..HEAD --stat -- package.json pnpm-lock.yaml` 빈 출력)을 정상적으로 돌렸다. 계획의 「얕은 clone」 절차(project_discipline 6번) 그대로 해소됐다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- REQUIREMENTS·ROADMAP이 D-75~D-84 모델과 일치해 `/gsd-verify-work`가 옛 네 상태 문구로 Phase 4를 판정하지 않는다.
- PROJ-03·PROJ-04는 04-06·04-11·04-16·04-20·04-21 등 다른 미완료 플랜도 아직 선언 중이라 `requirements.ready-ids`가 두 ID 모두 `blocked`로 반환했다 — `requirements.mark-complete`는 호출하지 않았다(계획 규율 5번대로). 그 플랜들이 각자 작업을 끝내야 체크박스가 채워진다.
- 04-08과 파일이 겹치지 않아 같은 웨이브 3에서 서로 기다리지 않는다.

## 남은 낡은 문구

D16이 승인한 세 곳(PROJ-04·PROJ-03·ROADMAP 기준 4) 밖에 남아 있는, 이번 플랜이 고치지 않은 낡은 문구:

| 자리 | 지금 문구 | 결정 ID | D16으로 고치지 않은 이유 |
|---|---|---|---|
| ROADMAP.md `### Phase 4` Goal 문단 | `수주중→진행→완료(정산)` 흐름 서술(네 상태 시절 표현, grep으로 원문 위치 확인 가능) | D-75 | 사용자 D16이 「PROJ-04·PROJ-03·ROADMAP 기준 4 세 곳만」으로 승인 — Goal 문단은 승인 범위 밖 |
| ROADMAP.md `### Phase 4` 성공 기준 1 | `목록 합계(견적·실행가·차익)` — 매출·수익금·수익률 열이 반영 안 됨 | D-87·D-88·D-90(수익금 기준은 DR-8·DR-38) | 승인 범위 밖. 목록 열 재정의(매출·견적·실행가·수익금·수익률)는 기준 1이 아니라 별도 플랜(04-1x대) 소관으로 보임 |
| ROADMAP.md `### Phase 4` 성공 기준 5 | `매출 칸의 계약 금액·발행액은 공급가액으로 적고` — "계약 금액"을 여전히 입력 칸처럼 서술 | D-84 | 승인 범위 밖. 기준 5는 `domain/money` 금액 모델 전체를 다루는 별도 문단이라 기준 4만 고치라는 D16과 별개 |
| ROADMAP.md `### Phase 4` 트레일링 문단(기준 4 인접 서술) | `완료(정산)` 표기가 아직 남은 자리 (예: 기준 3의 "완료 프로젝트 잠금" 인접 서술은 이미 정리됐으나, 기준 1·5 등 다른 기준의 부수 서술에 잔존 가능) | D-75·D-79 | 승인 범위 밖 — 기준 4 한 줄만 승인됨 |
| REQUIREMENTS.md PROJ-06 | `완료(정산) 처리 시 시스템이 미결 지출결의·미매칭 견적 줄·매출 미입력을 점검해...` — "완료(정산)" 표기가 다섯 상태의 "완료"로 갱신되지 않음 | D-75·D-79 | 사용자 D16 승인이 PROJ-04·PROJ-03·기준 4 세 곳으로 명시적으로 한정됨. PROJ-06은 범위 밖 |

사용자가 `/gsd-phase` 편집으로 위 다섯 자리를 고칠지 정한다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*

## Self-Check: PASSED
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/ROADMAP.md
- FOUND: .planning/phases/04-project-quote-ledger/04-43-SUMMARY.md
- FOUND commit: 1111278
