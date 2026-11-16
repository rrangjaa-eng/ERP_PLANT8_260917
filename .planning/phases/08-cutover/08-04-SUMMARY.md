---
phase: 08-cutover
plan: 04
subsystem: infra
tags: [cutover, github-actions, cloud-run-job, deploy, risk-path]
status: complete

requires:
  - phase: 08-cutover
    provides: "08-02 CLI dist/cli/cutover-cli.mjs — 인자(no args = dry-run · --apply --confirm <N-xxxxxxxx> · --run-url) · 종료 0/1/2/3 · 로그 cutover.done · cutover.refused · cutover.objects(.pending)"
  - phase: 08-cutover
    provides: "08-01 docs/CUTOVER.md §3 — 입력 이름 · 순서(시험이 이름을 대조)"
provides:
  - ".github/workflows/cutover.yml — workflow_dispatch 입력 넷 · 인증 전 input-guard · Job 실행 · jsonPayload 로그 요약"
  - "scripts/deploy.sh deploy_cutover_job — 스모크 · 자동 파기 Job 뒤 plant8-{env}-cutover Job 배포(실행 안 함)"
  - "전환 확인 면: 전환 뒤 dry-run 요약 「전환됨 <marker> (서울 …) · demo 남은 행 N」(08-07 Task 1 · 08-08이 본다)"
affects: [08-07, 08-08]

actuals:
  tokens: 12000
  tasks: 2
  commits: 2
plan_head_before: 749e7aaab8de12236a651d86f0d724079e214278

tech-stack:
  added: []
  patterns:
    - "워크플로 run 본문을 시험이 꺼내 가짜 gcloud · sleep 위에서 bash로 실행(입력 검사 · 로그 대기 갈래)"
    - "gcloud json(jsonPayload) 출력을 jq 없이 awk로 읽는다 — 이벤트 비교는 닫는 따옴표까지"
    - "execute 전 최근 실행 이름(PREV)과 비교해 새 실행이 없으면 직전 실행 로그를 읽지 않는다"

key-files:
  created:
    - .github/workflows/cutover.yml
    - test/unit/deploy/cutover-workflow.test.ts
  modified:
    - scripts/deploy.sh
    - infra/names.sh
    - test/unit/deploy/deploy-sh.test.ts

key-decisions:
  - "거부 문구 둘을 수락 grep 쪽으로 맞춤 — 「CUTOVER §3 5번 dry-run부터 다시」 · 「§3 4번 수동 백업부터 다시」(플랜 문구의 괄호 꼴은 플랜 자신의 grep `dry-run부터 다시` · behavior 「수동 백업부터 다시」와 어긋남)"
  - "already_cut_over 줄은 「이미 전환됨 · 다시 돌리지 않음」 — CLI cutover.refused에 marker 칸이 없어 시각을 싣지 못한다(must_haves 문구 그대로)"
  - "execute가 새 실행을 만들지 못한 실패(권한 · 인자 오류)는 직전 실행 이름을 받아 그 로그를 이번 결과로 보이지 않게 즉시 「실행 실패」로 끝낸다"
  - "input-guard가 env · mode 값도 choice 밖이면 멈춘다(API 디스패치 방어) · LC_ALL=C로 정규식 범위를 고정"
  - "로그 조회 정규식은 `^cutover[.]`(Logging 질의 문자열의 역슬래시 해석을 피함) · --freshness=30m(15분 Job + 대기)"

patterns-established:
  - "위험 경로 워크플로의 run 본문은 시험이 실제로 실행해 종료 코드 · 요약 문구를 고정한다"

requirements-completed: [MIG-05]

coverage:
  - id: D1
    description: "입력 넷(env · mode · confirm · confirm_production) · 기본 staging · dry-run · permissions 두 줄 · concurrency deploy 공유 · environment 없음 · 식별자 없음 · job 30분 > Job 15분"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "test/unit/deploy/cutover-workflow.test.ts#cutover.yml — 입력 · 권한 · 그룹(D8-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "input-guard가 checkout · auth보다 먼저 · 입력 조합 14개(통과 4 · 멈춤 10)를 bash로 실제 실행해 종료 코드 고정 · run 본문에 ${{ 없음(B8 · T-08-04-01/02)"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "test/unit/deploy/cutover-workflow.test.ts#cutover.yml — 입력 검사는 인증보다 먼저, 입력은 env로만"
        status: pass
    human_judgment: false
  - id: D3
    description: "run 본문 — 끝 기록까지 로그 읽기 · 늦은 로그 경고(exit 0) · 정리 중 끊김(exit 1) · dry-run 확인 문자열 · 전환됨 요약 · cutover.done JSON 그대로(B3 · B7 · E4 · F10 · F12 · D3)"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "test/unit/deploy/cutover-workflow.test.ts#cutover.yml — run 본문 실행(가짜 gcloud · eng 검토 2회차 로그 대기)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실패 경로 세 갈래(실행 실패 · 거부 · 요약 없음)가 요약 한 줄 + 종료 1 · 거부 사유별 원인 · 다음 행동 · 백업 조회 불가 사유"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "test/unit/deploy/cutover-workflow.test.ts#cutover.yml — 실패 경로 세 갈래는 요약 한 줄 + 종료 1(Task 2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "deploy.sh가 cutover Job을 스모크 · 자동 파기 Job 뒤에만 만들고 실행하지 않는다 · Job 8개 · 환경 변수 · 비밀은 인증 비밀만 · migrate/스모크 실패면 배포 없음(B2)"
    requirement: MIG-05
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#deploy.sh — Job 환경 계약(시나리오 9)"
        status: pass
    human_judgment: false
  - id: D6
    description: "스테이징 한 바퀴(Task 2 human-check) — 머지 뒤 스테이징 dry-run 요약 · 틀린 확인 문자열 거부 · 데이터 무변경"
    verification: []
    human_judgment: true
    rationale: "위험 경로 PR이라 사용자가 머지하고, 스테이징 배포가 Job을 만든 뒤에만 돌 수 있다 — 이 실행 환경은 GCP에 닿지 않는다"

duration: 35min
completed: 2026-11-15
---

# Phase 8 Plan 04: 전환 워크플로(cutover.yml) · 스모크 뒤 cutover Job 배포 Summary

**운영 · 스테이징 demo 삭제를 GitHub Actions 수동 워크플로 하나로만 — 인증 전 입력 검사(main · plant8-prod-db · 확인 문자열 꼴), Cloud Run Job dry-run/apply 실행, 실행 이름으로 좁힌 jsonPayload 로그를 끝 기록까지 읽어 요약(확인 문자열 · 전환 표시 서울 시각 · 거부 사유와 다음 행동 · 고아 키), 배포는 스모크 뒤에 Job을 만들기만 한다**

## Performance

- **Duration:** 약 35분
- **Completed:** 2026-11-15T16:14Z
- **Tasks:** 2/2 자동 부분(Task 1 트레이서 TDD RED → GREEN · Task 2 실패 경로 시험은 Task 1 RED 커밋에 함께) — Task 2 human-check는 사용자 머지 · 스테이징 배포 뒤
- **Files modified:** 5 (새 2 · 수정 3)

## Accomplishments

- `cutover.yml`: 입력 env(staging 기본) · mode(dry-run 기본) · confirm · confirm_production. 첫 단계 `input-guard`가 checkout · 인증보다 먼저 main · env/mode 값 · production 확인 · apply 확인 문자열 `^[0-9]+-[0-9a-f]{8}$` · dry-run에 confirm 있으면 멈춤을 검사한다. 모든 입력은 `env:`로만 셸에 닿는다.
- `run` 단계: `job_name "$ENV_SHORT" cutover` · apply면 `--args=--apply,--confirm,$CONFIRM,--run-url,$RUN_URL`, dry-run은 `--args` 없음 · `--wait`. 실패면 executions list로 이름을 얻되 실행 전 이름(PREV)과 같으면 새 실행이 없는 것으로 보고 즉시 「실행 실패」.
- 로그: `jsonPayload.event=~"^cutover[.]"` · `json(jsonPayload)` · 실행 이름으로 좁힘 · 12회 × 10초 · **끝 기록이 보일 때만 멈춤**(성공 dry-run = done · 성공 apply = objects 또는 objects 0인 done · 실패 = refused 또는 objects). 이벤트 비교는 닫는 따옴표까지라 `cutover.objects.pending`을 끝으로 세지 않는다.
- 요약(전부 `tee -a "$GITHUB_STEP_SUMMARY"` — 같은 줄이 실행 로그에도): 「환경 · 모드」 머리 · dry-run 총건수 · 카운터 · 객체 · kept 한 줄 · **「다음 apply의 confirm: N-xxxxxxxx」** · 전환 뒤 dry-run **「전환됨 <marker> (서울 YYYY-MM-DD HH:mm) · demo 남은 행 N」** · apply **「전환 표시 <marker> (서울 …)」** · `cutover.done` JSON 블록 그대로(`"marker"` · `"demoRemaining"` grep 대상) · 객체 정리 결과와 고아 키 · 「객체 정리 중 끊김」(실행 실패 + pending만 → 종료 1) · 「정리 결과 로그 늦음」(실행 성공 → `::warning::` + 종료 0) · 거부 사유별 원인 · 다음 행동(backup_not_fresh는 backup 칸 · 조회 불가 갈래) · 실패 · 거부 갈래의 textPayload · `status.backup_unavailable` 사유 · 「요약 없음 — apply를 다시 돌리지 말고 …」.
- `deploy.sh deploy_cutover_job`: main에서 `deploy_purge_auto_job` 바로 다음 — `--command=node,dist/cli/cutover-cli.mjs` · `--args` 없음 · `GCP_PROJECT_ID` · `CLOUD_SQL_INSTANCE_ID` · `STORAGE_DRIVER=gcs` · `GCS_EVIDENCE_BUCKET` · 비밀은 `BETTER_AUTH_SECRET`뿐 · 실행하지 않음.

## Task Commits

1. **Task 1 트레이서(+ Task 2 실패 경로 시험)** — RED `21d30c7` · GREEN `1122e7c`
2. **Task 2** — 코드 변경 없음(실패 경로 세 갈래 시험은 RED `21d30c7`에 있고 GREEN에서 통과). human-check는 머지 뒤.

트레이서 게이트: end-of-phase · 자동 검증만 → Task 1 `<verify>`(`vitest run --project unit test/unit/deploy` · `bash -n` · lint)를 GREEN 커밋 뒤 다시 돌려 통과.

## Verification (마지막 실행)

- `pnpm exec vitest run --project unit test/unit/deploy` — 10파일 313/313 통과(cutover-workflow 40 · deploy-sh 84 포함, workflows · restore-rehearsal · cli-bundle 등 같이 초록)
- `bash -n scripts/deploy.sh` 0 · `pnpm lint` 0 · 바뀐 시험 파일 eslint 0 · `pnpm typecheck` 0(`NODE_OPTIONS=--max-old-space-size=8192`)
- 수락 grep 전부 기준 이상(prod-db 3 · group deploy 1 · environment 0 · cutover-cli.mjs 1 · names cutover 1 · deploy_cutover_job 3 · tee 4 · 직접 `>>` 0 · backup_unavailable 2 · textPayload 3 · pending 2 · spawnSync 3 · 늦음 2/5 · warning 1 · dry-run부터 다시 1 · Asia/Seoul 1 · 전환됨 2 · STEP_SUMMARY 4)
- 변이 확인(전부 빨강 뒤 되돌림): 정규식 따옴표 2 실패 · `!=`→`=` 4 · `&&`→`||` 4 · dry-run confirm 검사 뒤집기 3 · 첫 줄에서 멈춤 3 · 닫는 따옴표 없는 이벤트 비교 3 · 늦은 로그를 끊김으로 1 · PREV 비교 제거 1
- 워크플로 YAML은 python yaml로 파싱 확인(단계 id 순서 input-guard → checkout → auth → setup-gcloud → run). actionlint · shellcheck는 저장소 · 환경에 없음(새 도구 설치 안 함).
- 전체 통합 · E2E는 돌리지 않음(CLAUDE.md §5 — CI 몫 · 이 플랜은 DB를 건드리지 않는다).

## 실행자가 부른 스킬

- `superpowers:test-driven-development` — 구현 전
- `superpowers:verification-before-completion` — 완료 판단 전(위 실행 증거)
- `superpowers:systematic-debugging` — 부르지 않음: 실패는 RED 의도 실패 · 시험 과잉 단언 1 · 플랜 문구 충돌 2 · typecheck 타입 1로, 원인이 메시지에 바로 드러나 추적이 필요 없었다

## PR 본문 자료

PR 본문 첫 줄: **「위험 경로 — 사용자 머지」**(.github/workflows · scripts/deploy.sh · infra/).

### 260907 대조

옛 저장소(`/home/user/erp_plant8_260907`)가 이 실행 환경에 없어 줄 번호는 다시 확인하지 못했다 — 플랜의 2026-11-04 확인값이다.

| 영역 | 260907 (file:line) | 이 플랜 |
|---|---|---|
| 실판 열쇠 | `server/도구/이관/gates.mjs:74-75` `--실판허용` · `--백업했다` · `:98-101` 「열쇠 둘을 함께 — 하나만이면 손버릇이 된다」 | 같은 결 · 셋으로 — confirm_production(운영 이름) + confirm(dry-run 건수 해시) + 백업 최신성 자동 가드(08-02) · 사람이 「백업했다」고 말하는 열쇠 대신 실제 백업을 조회 |
| 배포 전 관문 | `배포전확인.cmd:3-20` 여섯 관문을 다 통과해야 명령을 찍어 줌 · 건너뛴 걸음을 「통과」로 안 찍는다 | 같은 결 — 입력 검사가 하나라도 어긋나면 인증 전에 멈춘다 · dry-run에 confirm이 있으면 apply로 착각하지 않게 멈춘다 |
| 실행 수단 | `docs/90_결정-기록.md:1596-1600` 사용자가 SQL 파일 둘을 손으로 차례로 적용 | **다르게 간다** — 사람 손 명령 없이 워크플로 → Job, 실행 기록은 Actions · 행동 로그 둘 |

### 결정 변경 기록 (decision delta)

플랜의 기록(concurrency `deploy` 공유 · jsonPayload 로그 읽기 · 「정리 결과 로그 늦음」 = 경고 · 전환 확인 면 하나)은 그대로 구현했다. 실행 중 더하거나 바꾼 것:

- **거부 문구 두 개:** 플랜 action의 「CUTOVER §3 5번(dry-run)부터 다시」 · 「§3 4번(수동 백업)부터 다시」는 플랜 자신의 수락 grep `dry-run부터 다시`와 behavior 「수동 백업부터 다시」를 만족하지 못한다 → 괄호를 걷어 「CUTOVER §3 5번 dry-run부터 다시」 · 「§3 4번 수동 백업부터 다시」. 뜻은 같다.
- **already_cut_over 시각 없음:** action은 「이미 전환됨 <marker> · 다시 돌리지 않음」이지만 08-02 `cutover.refused`에 marker 칸이 없다(CLI는 이 플랜 파일 밖) → must_haves 문구 「이미 전환됨 · 다시 돌리지 않음」 그대로. 시각은 같은 워크플로 dry-run의 「전환됨」 요약이 보인다.
- **새 실행 없는 실패(추가 · Rule 2):** execute가 실행을 만들지 못하고 실패하면 executions list가 직전 실행을 돌려준다 → 실행 전 이름(PREV)과 같으면 그 로그를 읽지 않고 「실행 실패 — Job 실행이 생기지 않음(전환 안 됨)」으로 끝낸다. 직전 dry-run의 확인 문자열이 apply 실패 요약에 섞이는 것을 막는다.
- **input-guard env · mode 값 검사(추가 · Rule 2):** choice 밖 값(API 디스패치)도 멈춘다 · `LC_ALL=C`로 `[0-9a-f]` 범위를 고정 · 줄바꿈 덧붙인 confirm도 시험.
- **로그 질의:** 정규식 `^cutover[.]`(플랜 `^cutover\.` — Logging 질의 문자열의 역슬래시 해석 위험을 피함) · `--freshness=30m`(account.yml 15m → 15분 Job + 대기).
- **요약 JSON 블록:** `cutover.done` 항목을 gcloud 출력 줄 그대로 `{ "jsonPayload": { … } }`로 감싸 ```json 블록에 싣는다(칸 이름 · 값 그대로).

### 겹침 표

| 상대 | 상태 | 겹치는 파일 |
|---|---|---|
| 08-02(선행 · 같은 페이즈) | 이 워크트리 base(749e7aa)에 있음 · main 머지 전 | 없음 — 08-02는 domain · repositories · scripts/cutover-cli.ts · scripts/build-cli.mjs · lib/gcp. 단 **이 브랜치의 origin/main 대비 diff에는 08-02 커밋이 같이 보인다** — C4R PR은 08-02(C2)가 main에 들어간 뒤 main 위에 이 두 커밋만 얹어야 수락 기준(위험 경로 전용)을 만족한다 |
| 08-01 | main에 있음(#395) | 없음 — docs/CUTOVER.md는 읽기만(시험 대조) |
| 08-05 ~ 08-09 | 계획만 | 확인 안 함 — 이 플랜 파일 5개 밖 |
| 07.x 플랜 | 전부 SUMMARY 있음(main 반영) | 없음 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 플랜 문구 충돌] 거부 문구 두 개를 수락 grep에 맞춤**
- **Found during:** Task 1 GREEN
- **Issue:** action 문구(괄호 꼴)가 behavior · 수락 grep 글자와 어긋남
- **Fix:** 괄호를 걷음 · 시험의 정확 문자열도 같이
- **Commit:** 1122e7c

**2. [Rule 1 - 시험] 과잉 단언 제거**
- **Issue:** 이름 대조 시험이 워크플로 자신에 `cutover.yml` 글자를 요구 — behavior는 CUTOVER.md만 요구
- **Fix:** 워크플로 쪽 대조에서 `cutover.yml`만 뺌
- **Commit:** 1122e7c

**3. [Rule 2] 새 실행 없는 실패 · env/mode 값 검사**
- 위 decision delta 두 항목. 시험: 「execute가 새 실행을 만들지 못하고 실패」 · input-guard 「모르는 env」 · 「모르는 mode」 · 「줄바꿈 뒤 덧붙임」. 새 실행 시험은 RED 커밋 뒤 · 워크플로를 쓰기 전에 더했지만 그 사이에 따로 돌리지는 않았다 — 시험이 무는지는 변이 「PREV 비교 제거」(1 실패)로 확인했다.
- **Commit:** 21d30c7(입력 조합) · 1122e7c(새 실행 시험 · 구현)

**4. [Rule 3 - typecheck] 시험 child env 타입**
- **Issue:** 저장소 `ProcessEnv`가 `NODE_ENV`를 요구 — `{ PATH, HOME, ... }` 리터럴이 TS2769
- **Fix:** deploy-sh.test.ts처럼 `{ ...process.env, ...env }`
- **Commit:** 1122e7c

**Total deviations:** 4 (Rule 1 ×2 · Rule 2 ×1 · Rule 3 ×1). **Impact:** 범위는 플랜 그대로 — 문구 두 개 · 방어 검사 둘 · 시험 정리.

## 환경 메모

- 워크트리에 node_modules가 없어 `pnpm install --frozen-lockfile --offline`(잠금 파일 그대로 · 새 의존성 없음)으로 채웠다.
- `pnpm lint` · `pnpm typecheck`는 `NODE_OPTIONS=--max-old-space-size=8192`로 돌렸다(기본 힙 OOM — 08-02 메모와 같음).
- GCP · Actions에는 닿지 않았다 — Task 2 human-check · 실제 Cloud Logging 출력 꼴(`json(jsonPayload)` 들여쓰기 · 키 정렬)은 스테이징 첫 실행에서만 확인된다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표면(workflow_dispatch 입력 · Job 실행 · 로그 읽기)은 플랜 위협 모델 T-08-04-01~07에 있다.

## Next

- C4R PR(위험 경로 전용): 08-02(C2)가 main에 들어간 뒤 main 위에 `21d30c7` · `1122e7c`만 얹어 연다 → draft CI → ready · 전체 CI → `/review` → `/cso` → Opus 독립 검토 1명 → **사용자 머지** → 스테이징 배포 초록 → Task 2 human-check(스테이징 dry-run · 틀린 confirm `0-00000000` 거부 · 두 실행 링크를 「[완료 보고]」 댓글에).
- 이 SUMMARY 커밋(`.planning/`)은 C4R PR에 섞지 않는다(수락 기준 — 위험 경로 전용).

## Self-Check: PASSED

- 만든 파일 2개(.github/workflows/cutover.yml · test/unit/deploy/cutover-workflow.test.ts) 디스크에 있음 · 커밋 2개(21d30c7 · 1122e7c) 로그에 있음
- 749e7aa 대비 바뀐 파일 5개가 전부 플랜 files_modified 안
- STATE.md · ROADMAP.md 무변경
