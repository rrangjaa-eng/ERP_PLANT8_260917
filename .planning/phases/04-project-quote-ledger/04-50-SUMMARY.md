---
phase: 04-project-quote-ledger
plan: 50
subsystem: infra
tags: [deploy, rollback, cloud-run, github-actions, bash, schema-migration, ci-cd]

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: PR #38(묶음 ① — 04-01·02·04·05)가 main에 머지된 상태(04-01의 depends_on 근거, 산출물 자체는 쓰지 않음)
provides:
  - "scripts/rollback.sh — 스키마 하한 판정(E2-04): `-- rollback-floor:` 최신 마이그레이션을 더한 커밋을 조상으로 갖지 않는 배포로는 트래픽을 옮기지 않는다"
  - ".github/workflows/deploy.yml — staging·production 잡 main 전용 ref-guard(ENG-D12, 04-31 Task 2에서 옮김)"
  - "docs/design/DECISIONS.md 04-50 항목 — 표시 규약 · 하한 판정 규칙 · Phase 4 세 머지 묶음 배포 규칙 · 복구 절차 · 배포 창 사실"
  - "docs/OPERATIONS.md §5 갱신 — 하한 거부 · 복구 절차 반영"
affects: [04-06(0012 하한 표시), 04-41(0015 하한 표시), 04-10(이 플랜에 depends_on), 04-31(최종 표시 위치 게이트)]

# Actuals (#2632) — 실측(chars/4, 실제 diff 기준), 커밋 4개(플랜 코드 커밋만, 이 SUMMARY 커밋 제외)
actuals:
  tokens: 4385
  tasks: 2
  commits: 4
plan_head_before: 4e3e7b1a8e1d67d08590f31c8d248ca7c0aa4dfb

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "스키마 하한 판정: 마이그레이션 파일 표시 → git 커밋 조상 관계 확인(merge-base --is-ancestor) → 트래픽 이동 전 거부"
    - "GitHub Actions ref-guard: 입력을 env로만 받고 run: 본문은 그 변수만 읽어 인증 스텝 전에 exit 1(T-1-32 셸 인젝션 규약과 동일 패턴)"

key-files:
  created: []
  modified:
    - scripts/rollback.sh
    - test/unit/deploy/rollback-sh.test.ts
    - docs/design/DECISIONS.md
    - docs/OPERATIONS.md
    - .github/workflows/deploy.yml
    - test/unit/deploy/workflows.test.ts

key-decisions:
  - "스키마 하한 = 체크아웃의 db/migrations/*.sql 중 가장 최신 `-- rollback-floor:` 표시 파일을 더한 커밋. 후보 배포(APP_GIT_SHA)가 그 커밋을 조상으로 갖지 않거나 SHA가 없거나 로컬 이력에 없으면 update-traffic 전에 거부(fail-closed)"
  - "우회 옵션을 만들지 않는다 — 하한 아래로 되돌려야 하는 사고는 전진 수정이 먼저, 불가피하면 쓰기를 멈추고 역 SQL을 적용한 뒤 사람이 수동으로 트래픽을 옮긴다"
  - "Phase 4 남은 플랜은 세 머지 묶음(② 상태 전환 04-50~04-23 · ③ 차수·승인 04-14~04-41 · ④ 목록·리저브 04-17~04-31)으로 묶음마다 PR 하나로 main에 머지, 배포는 main에서만(ENG-D12 가드로 강제)"
  - "ENG-D12 ref-guard를 04-31 Task 2에서 04-50으로 옮겼다 — 하한 판정이 main 이력을 전제하므로 묶음 ② 첫 배포부터 필요"

patterns-established:
  - "마이그레이션 첫 줄 `-- rollback-floor: <이유>` 표시 규약 — 04-06(0012) · 04-41(0015)이 사용, 04-31 최종 게이트가 위치를 재확인"

requirements-completed: [PROJ-04, PROJ-03]

coverage:
  - id: D1
    description: "rollback.sh가 스키마 하한 아래 배포로는 트래픽을 옮기지 않고(update-traffic 미호출), 이유·복구 절차를 stderr에 적는다. 하한 표시가 없으면 기존 여덟 케이스 그대로 동작한다"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "test/unit/deploy/rollback-sh.test.ts#스키마 하한(E2-04)"
        status: pass
      - kind: unit
        ref: "test/unit/deploy/rollback-sh.test.ts (기존 8개 — 회귀 없음)"
        status: pass
    human_judgment: false
  - id: D2
    description: "deploy.yml의 staging·production 잡이 main이 아닌 ref의 workflow_dispatch를 클라우드 인증(id: auth) 전에 거부한다"
    requirement: "PROJ-03"
    verification:
      - kind: unit
        ref: "test/unit/deploy/workflows.test.ts#deploy.yml (ref-guard 신설 2개 + 기존 33개)"
        status: pass
    human_judgment: false

duration: ~15min (세션 중 감지된 HEAD detached 상태로 오케스트레이터의 git 복구를 기다리는 정지 구간 포함 — 실제 편집·검증 시간은 약 9분)
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 50: 롤백 스키마 하한 · main 전용 배포 가드 Summary

**`rollback.sh`에 마이그레이션 표시 기반 스키마 하한 판정(E2-04)을 추가하고 `deploy.yml`의 staging·production 잡에 main 전용 ref-guard(ENG-D12)를 세워, Phase 4 세 머지 묶음 배포 동안 트래픽 롤백이 새 스키마와 어긋나는 옛 코드로 조용히 착륙하지 않게 했다.**

## Performance

- **Duration:** ~15 min (세션 중간에 HEAD가 detached 상태가 되어 오케스트레이터의 git 복구를 기다린 정지 구간 포함)
- **Tasks:** 2/2 완료
- **Files modified:** 6
- **Commits:** 4 (RED/GREEN × 2 태스크)

## Accomplishments

- `scripts/rollback.sh`가 `db/migrations/*.sql` 중 가장 최신 `-- rollback-floor:` 표시 파일을 더한 커밋을 스키마 하한으로 삼아, 후보 배포(APP_GIT_SHA)가 그 커밋을 조상으로 갖지 않거나 SHA가 없거나 로컬 git 이력에 없으면 `update-traffic` 호출 전에 거부하고 이유·복구 절차를 stderr에 적는다. 표시가 없으면(디렉터리·마커 부재) 기존 동작 그대로다.
- `.github/workflows/deploy.yml`의 `staging`·`production` 두 잡 모두 첫 스텝으로 `id: ref-guard`를 두어, `github.ref`가 `refs/heads/main`이 아니면 WIF 인증(`id: auth`) 전에 `exit 1`한다. ref는 env `REF`로만 받아 `run:` 본문에 표현식 보간이 없다(T-1-32 규약).
- `docs/design/DECISIONS.md`에 04-50 항목(표시 규약 · 하한 판정 규칙 · Phase 4 세 머지 묶음 배포 규칙 · 복구 절차 · 배포 창 사실)을 남기고, `docs/OPERATIONS.md` §5의 "DB는 확장-축소 규칙이라 되돌릴 필요가 없다"는 옛 문장을 하한 거부 사실과 DECISIONS 참조로 교체했다(300줄 상한 유지 — 255줄).

## Task Commits

TDD로 RED와 GREEN을 별도 커밋으로 나눴다:

1. **Task 1 RED:** `5a55b2c` — `test(04-50): add failing test for rollback.sh schema floor rejection`
2. **Task 1 GREEN:** `0b85305` — `feat(04-50): reject rollback traffic moves below the schema floor` (scripts/rollback.sh + docs/design/DECISIONS.md + docs/OPERATIONS.md, 계획 지시대로 한 커밋)
3. **Task 2 RED:** `7a72883` — `test(04-50): add failing test for deploy.yml main-only ref-guard`
4. **Task 2 GREEN:** `a2cfd47` — `feat(04-50): reject deploy workflow_dispatch on non-main ref`

**Plan metadata:** (이 SUMMARY 커밋 — 아래 참고)

_TDD RED→GREEN 두 사이클, 각 2커밋(REFACTOR 없음 — GREEN 구현이 이미 최소했다)._

## Files Created/Modified

- `scripts/rollback.sh` — 기존 `PREV` 선택 뒤, `update-traffic` 호출 전에 스키마 하한 판정 블록 추가(36줄). `deploy.sh`는 무변경(diff 0줄) — `smoke_failed()` 자동 롤백 경로가 같은 스크립트를 부르므로 하한 거부가 자동으로 적용된다.
- `test/unit/deploy/rollback-sh.test.ts` — `describe("스키마 하한(E2-04)")` 신설(5개 새 `it` + `commitFile`/`headSha` 도우미). 기존 8개 `it`은 무변경, 전부 초록.
- `docs/design/DECISIONS.md` — 04-50 항목(하한 규칙 · 표시 규약 · 머지 묶음 배포 규칙 · 복구 절차 · 배포 창 사실).
- `docs/OPERATIONS.md` — §5 롤백 절의 "되돌릴 필요가 없다" 문장을 하한 거부 사실로 교체(255줄, 300줄 상한 이내).
- `.github/workflows/deploy.yml` — `staging`·`production` 잡 첫 스텝으로 `ref-guard` 추가(각 9줄) + 머리 주석 2줄. `on:` 블록 · `ci` 잡 · 기존 스텝은 무변경(diff = 머리 주석 2줄 + ref-guard 스텝 2개뿐).
- `test/unit/deploy/workflows.test.ts` — `describe("deploy.yml")`에 ref-guard 위치·env 전달·인젝션 방지를 검사하는 `it` 2개 추가. 기존 33개는 무변경, 전부 초록.

## RED 증거 (구현 전 실제 실행 출력)

**Task 1** — `pnpm vitest run --project unit test/unit/deploy/rollback-sh.test.ts`(구현 전 `scripts/rollback.sh` 기준):
- 5개 새 `it` 중 4개 실패 — 전부 `AssertionError: expected +0 to be 1`(하한 판정이 없어 `update-traffic`이 그대로 불려 종료 코드 0으로 끝남): "하한 아래(0012 이전) 후보로는 트래픽을 옮기지 않는다", "후보에 APP_GIT_SHA가 없으면 거부한다", "후보 SHA가 로컬 git 이력에 없으면 거부한다", "표시 둘(0012·0015) — 가장 최신 표시가 하한이다".
- 1개("하한 커밋을 포함하는(그 자체이거나 뒤인) 후보는 허용한다")는 구현 전에도 통과 — **정직하게 기록**: 이 케이스는 새 판정 없이도 기존 `PREV` 선택 로직이 이미 같은 리비전을 골라 `update-traffic`을 부르므로, 새 코드가 필요 없는 "허용" 방향 케이스였다(회귀 방지 목적으로는 유효, RED 목적으로는 트리비얼).
- 기존 8개 `it`은 그대로 초록.

**Task 2** — `pnpm vitest run --project unit test/unit/deploy/workflows.test.ts`(구현 전 `deploy.yml` 기준):
- 2개 새 `it` 모두 실패: "staging·production 블록에 id: ref-guard가 각각 하나 있고 id: auth보다 앞이다" → `AssertionError: expected +0 to be 1`(ref-guard 스텝이 아직 없음), "ref-guard는 env REF로 github.ref를 받고…" → `AssertionError: expected -1 to be greater than -1`(같은 이유).
- 기존 33개 `it`은 그대로 초록.

## Decisions Made

DECISIONS.md 04-50 항목에 전부 기록. 핵심 셋:
1. 스키마 하한 = 체크아웃의 가장 최신 `-- rollback-floor:` 표시 파일을 더한 커밋 — DB 접속 없이 체크아웃만으로 판정(rollback.sh는 gcloud만 부른다).
2. 우회 옵션 없음 — 하한 아래 롤백이 필요한 사고는 전진 수정 우선, 불가피하면 쓰기 중지 후 역 SQL + 수동 트래픽 이동.
3. ENG-D12 ref-guard를 04-31 Task 2에서 이 플랜(묶음 ② 첫 웨이브)으로 옮김 — 하한 판정이 main 이력을 전제하므로 다른 브랜치의 workflow_dispatch가 묶음 중간 상태를 배포하면 두 장치 모두 깨진다.

## Deviations from Plan

None - plan executed exactly as written. (probe_fallback의 계획 단계 가정 4개 — 하한 출처=체크아웃 · 표시 규약=파일 첫 줄 주석 · 우회 플래그 없음 · 배포 창은 accept — 그대로 구현에 반영했고 별도 이탈 없음.)

## Issues Encountered

**세션 중 HEAD detached 상태 발견 및 정지.** Task 1의 RED/GREEN을 완료하고 첫 커밋을 시도하기 직전, 저장소 HEAD가 브랜치 없이 detached 상태(`4e3e7b1`, `origin/claude/gsd-progress-e1nzgu`와 동일 커밋)임을 발견했다. 로컬 브랜치 `claude/gsd-progress-e1nzgu`는 204커밋 뒤(`a283a5c`)에 있었다. 이 실행자의 필수 커밋 전 안전장치("HEAD가 detached면 FATAL, 자체 복구 금지")에 따라 커밋 없이 정지하고 오케스트레이터에게 상태를 보고했다(git 상태 조사는 읽기 전용 명령만 사용, `stash`·`clean`·`reset --hard` 등 파괴적 명령 없음). 오케스트레이터가 브랜치를 현재 커밋으로 fast-forward 재연결한 뒤(리베이스·이력 손실 없음, origin과 동일) 이어서 실행하라고 지시해 재개했다. 미커밋 파일 2개(`scripts/rollback.sh`, `test/unit/deploy/rollback-sh.test.ts`)는 온전히 보존됐다. 이후 작업(Task 1 커밋 2개 + Task 2 TDD 전체)은 정상 진행했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 묶음 ②(웨이브 2~18, 04-50~04-23)의 첫 플랜이 완료됐다 — 다음은 04-10(0011, 웨이브 4)을 비롯한 나머지 웨이브다.
- 하한 표시 규약이 확정됐으므로 04-06(0012)·04-41(0015)이 이 플랜의 규약대로 표시를 달면 된다. 04-31 Task 3 최종 게이트가 표시 위치를 다시 확인한다.
- T-04-372(배포 창 — migrate 뒤 새 리비전 100% 전 옛 리비전이 새 스키마 위에서 도는 구간)는 이 플랜이 DECISIONS에 사실만 기록했다. 처리(프로덕션 승격 시각 선택 등)는 계획대로 묶음 ②·③ `/ship` 전에 사용자 확인이 필요하다(objective의 계획 인계 질문 — 아직 미결).
- `/gsd-verify-work`가 rollback.sh의 unit 검증과 deploy.yml의 텍스트 메타 검증을 재확인할 수 있다. 이 플랜은 실제 GCP 호출을 하지 않았으므로 스테이징 실동작 확인은 별도(Post-build `/qa`/배포 단계)에서 이뤄진다.

---
*Phase: 04-project-quote-ledger*
*Plan: 50*
*Completed: 2026-09-24*
