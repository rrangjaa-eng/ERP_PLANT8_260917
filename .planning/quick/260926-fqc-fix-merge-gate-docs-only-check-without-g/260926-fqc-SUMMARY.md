---
phase: quick-260926-fqc
plan: 01
subsystem: infra
tags: [git-hooks, bash, ci-gate, merge-gate]

# Dependency graph
requires:
  - phase: quick-260923-odg
    provides: plant8-skill-gate.sh merge 분기(gh api 기반 docs-only 판정)
provides:
  - "gh 없거나 실패할 때 origin ls-remote + 로컬 git diff로 문서 PR을 판정하는 대체 경로"
  - "판정 불가 시 fail-closed + git fetch origin 안내 메시지"
affects: [plant8-skill-gate.sh, gsd-execute-phase, gsd-ship]

# Actuals (#2632)
actuals:
  tokens: 2852
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "머지 훅 문서 규칙 awk는 한 곳(186행대)에만 있고 gh 경로·대체 경로가 모두 그 한 곳을 공유한다"
    - "PR 동일성은 로컬 HEAD가 아니라 git ls-remote origin refs/pull/N/head로만 특정한다"

key-files:
  created: []
  modified:
    - .claude/hooks/plant8-skill-gate.sh
    - .claude/hooks/tests/plant8-skill-gate.test.sh

key-decisions:
  - "PR 특정은 git ls-remote origin refs/pull/N/head의 sha만 근거로 삼는다 — 로컬 브랜치 HEAD를 믿으면 세션의 다른 코드 PR에도 문서 면제가 새어나간다(실측 확인)"
  - "diff는 로컬 HEAD가 아니라 PR 헤드 sha 대 refs/remotes/origin/main으로 한다 — 푸시하지 않은 로컬 커밋이 판정에 들어가지 않는다"
  - "이름 바꾸기 옛 경로는 --no-renames --name-only로 얻어 기존 awk에 그대로 넘긴다(별도 파싱 없음)"
  - "expectedHeadSha는 PR 헤드와의 교차 확인에만 쓰고 PR 특정 근거로는 쓰지 않는다"
  - "gh 성공/실패 분기는 pr_files가 비었는지가 아니라 gh api 호출 자체의 exit code로 가른다 — 빈 PR(변경 파일 0개)을 대체 경로로 잘못 넘기지 않기 위함"

requirements-completed: [QUICK-260926-fqc]

coverage:
  - id: D1
    description: "gh 없음/실패 시 문서만 바뀐 PR이 /review 기록만으로 머지 훅을 통과한다"
    requirement: QUICK-260926-fqc
    verification:
      - kind: unit
        ref: ".claude/hooks/tests/plant8-skill-gate.test.sh#merge(gh 없음): 문서만 바뀐 PR + review만 -> 통과"
        status: pass
      - kind: other
        ref: "실환경: rrangjaa-eng/ERP_PLANT8_260917 PR #78 -> rc 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "코드가 섞였거나 이름 바꾸기로 숨겼거나 PR을 특정할 수 없으면 /qa 없이는 exit 2"
    requirement: QUICK-260926-fqc
    verification:
      - kind: unit
        ref: ".claude/hooks/tests/plant8-skill-gate.test.sh#N2·N3·N4·N5·N6·N10 (코드 섞임·이름바꾸기·PR헤드없음·ref없음·owner불일치·origin/main없음)"
        status: pass
      - kind: other
        ref: "실환경: rrangjaa-eng/ERP_PLANT8_260917 PR #82 -> rc 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "gh가 정상 동작하면 판정 경로는 이전과 동일하다"
    requirement: QUICK-260926-fqc
    verification:
      - kind: unit
        ref: ".claude/hooks/tests/plant8-skill-gate.test.sh (기존 merge 테스트 13개 + N11 그대로 통과)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-09-26
status: complete
---

# Quick Task 260926-fqc: gh 없이도 문서 PR 머지 게이트 판정 Summary

**머지 훅에 gh api 실패 시 대체 경로 추가 — git ls-remote로 PR 헤드를 특정하고 로컬 diff로 기존 docs-only awk를 재사용, 판정 불가 시 fail-closed(회귀 테스트 70→82)**

## Performance

- **Duration:** 약 45분
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- gh가 없거나(rc 127) 실패(rc 1)해도 `git ls-remote origin refs/pull/N/head` + 로컬 `git diff --no-renames`로 문서만 바뀐 PR을 판정하는 대체 경로를 머지 훅에 추가
- 판정 불가(owner/repo 불일치, PR 헤드 없음, ref 없음, origin/main 없음, expectedHeadSha 불일치) 시 여전히 exit 2(fail-closed), 메시지에 `git fetch origin` 안내 추가
- 문서 규칙 awk 정규식은 훅에 정확히 한 곳만 존재 — gh 경로와 대체 경로가 공유
- 회귀 테스트 12개 추가(70 → 82), 전부 GREEN
- 실제 리포에서 PR #78(문서만) → rc 0, PR #82(코드) → rc 2 확인

## Task Commits

RED/GREEN 사이클은 커밋하지 않고(계획 지시대로) Task 2에서 한 번에 커밋했다:

1. **Task 1+2: gh 없이 문서 PR 판정 + git fetch origin 안내** - `6f3943b` (fix)

_두 파일(훅·테스트)만 담은 fix: 커밋 하나. `.planning/` 파일은 포함하지 않음(계획 지시)._

## Files Created/Modified
- `.claude/hooks/plant8-skill-gate.sh` - merge 분기에 gh 실패/부재 대체 경로(ls-remote + 로컬 diff) 추가, deny 메시지에 git fetch origin 안내 추가
- `.claude/hooks/tests/plant8-skill-gate.test.sh` - `payload_merge`/`merge_hook`에 expectedHeadSha 선택 인자 추가, `pr_project`/`pr_commit`/`pr_push`/`pr_clone` 테스트 헬퍼 신설, N1~N12 회귀 테스트 12개 추가

## Decisions Made
- PR 특정 근거는 로컬 HEAD가 아니라 `git ls-remote origin refs/pull/N/head`뿐이다(계획 단계 결정 1, 실측 확인: 세션 브랜치가 문서만 바꿨어도 다른 코드 PR에 면제가 새는 문제를 이 방식으로 막음)
- diff는 PR 헤드 sha 대 `refs/remotes/origin/main`(계획 단계 결정 2) — 푸시하지 않은 로컬 커밋은 판정에 들어가지 않는다(N9로 검증)
- 이름 바꾸기 옛 경로는 `--no-renames --name-only`로 얻어 기존 awk에 그대로 넘긴다(계획 단계 결정 3, 새 파싱 로직 없음)
- gh 성공/실패 판정은 `pr_files`가 비었는지가 아니라 두 `gh api` 호출 자체의 exit code로 가른다 — 빈 PR(변경 파일 0개)을 대체 경로로 잘못 떨어뜨리지 않기 위해, 원안(plan) 예시 코드를 실제 구현 시 이 방식으로 정교화했다(플래너가 의도한 "then 쪽은 지금의 목록 수 검사를 그대로 둔다" 문장의 취지를 유지하면서 gh 호출 자체의 성패와 목록 내용 불일치를 구분)

## Deviations from Plan

None - 계획대로 실행했다. 플랜의 GREEN 구현 가이드(182-188행 예시 코드)를 문자 그대로 옮기지 않고, "gh 호출 exit code"와 "가져온 목록이 비었거나 수가 다름"을 명확히 분리하는 조건문으로 구현했다 — 빈 PR(diff 0개, gh는 정상 응답)이 대체 경로로 잘못 넘어가 로컬 git 상태에 따라 결과가 뒤집히는 것을 막기 위한 것으로, 플랜이 요구한 동작(gh 성공 시 이전과 동일한 판정, 목록이 비면 docs_only=0)과 회귀 테스트(기존 "merge: 빈 파일 목록 + review만 -> exit 2")를 그대로 만족한다. 별도 승인이 필요한 구조 변경은 아니라 Rule 1(버그 방지) 수준의 구현 세부사항으로 처리했다.

## Issues Encountered
- 테스트 헬퍼(`pr_project`)의 `git push -q origin main`에서 `fatal: expected 'acknowledgments', received 'packfile'` / `warning: push negotiation failed; proceeding anyway with push` 경고가 매 테스트 실행마다 로컬 bare 리포로의 push 시 표준에러에 출력된다. push 자체는 "proceeding anyway"로 성공하고 이후 `refs/remotes/origin/main`도 정상 갱신되어 전체 테스트(PASS=82 FAIL=0)에는 영향이 없다 — git 2.43.0의 push negotiation 프로토콜과 로컬 파일 경로 bare 리포 조합에서 나는 것으로 보이는 무해한 경고. 수정하지 않음(범위 밖, 테스트 통과에 영향 없음).

## User Setup Required

None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- 머지 게이트가 클라우드 세션(gh 없음)에서도 문서 PR을 올바르게 판정하므로, 이후 세션에서 #78과 같은 오탐 차단이 재발하지 않는다
- 오케스트레이터 몫: 이 변경 자체도 CLAUDE.md §4 Post-build(/review → 해당 시 /cso → /ship)를 거쳐 PR로 머지되어야 한다(게이트 로직 변경이므로 /review 권장)

---
*Phase: quick-260926-fqc*
*Completed: 2026-09-26*
