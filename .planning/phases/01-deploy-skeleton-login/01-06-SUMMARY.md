---
phase: 01-deploy-skeleton-login
plan: 06
subsystem: infra
tags: [gcp, cloud-run, cloud-sql, github-actions, wif, bash, gcloud]

# Dependency graph
requires:
  - phase: 01-01
    provides: "lib/env.ts 비로컬 refine(BETTER_AUTH_SECRET·BETTER_AUTH_URL 필수) — deploy_jobs·deploy_service가 채워야 하는 계약"
  - phase: 01-02
    provides: "scripts/account-cli.ts parseArgs 규약(플래그·값 별개 argv 항목) — account.yml의 --args 조립이 따라야 하는 형태"
  - phase: 01-04
    provides: ".github/workflows/ci.yml workflow_call 트리거 — deploy.yml이 그대로 재사용"
  - phase: 01-05
    provides: "Dockerfile(같은 이미지의 서비스+Job 3개), scripts/build-cli.mjs, migrate-runner exit 0/1/3 계약(16A)"
provides:
  - "infra/names.sh — plant8- 접두어 리소스 이름 규칙 함수·상수(MAX_INSTANCES=3, DB_POOL_MAX=5, DB_TIER=db-f1-micro)"
  - "infra/ar-cleanup-policy.json — Artifact Registry 정리 정책(최근 20버전 유지, 60일 초과 삭제)"
  - "infra/monitoring/{5xx-ratio,backup-failed,tick-stale}.json.tpl — 경보 정책 템플릿 3개"
  - "scripts/deploy.sh — 인프라 ensure(멱등) → SHA 이미지 → Job 3개 → 0%(신규는 100%) 리비전 → 스모크 3종 → 경보 upsert → 100% 승격"
  - "scripts/rollback.sh — 서빙 중인 리비전보다 오래된 최신 리비전으로 트래픽 복구"
  - "scripts/bootstrap-gcp.sh — Cloud Shell 1회 실행 단일 파일 부트스트랩(WIF·SA·역할·VPC·조직 정책)"
  - ".github/workflows/deploy.yml — staging 자동(push) / production 수동(workflow_dispatch + 스테이징 SHA 가드)"
  - ".github/workflows/account.yml — workflow_dispatch로 Cloud Run Job account 실행(create/reset/unlock)"
  - "test/unit/deploy/fakebin/{gcloud,docker,curl} — 상태 파일 기반 가짜 심"
affects: [01-07, 01-08]

# Actuals (#2632)
actuals:
  tokens: 23200
  tasks: 2
  commits: 2
plan_head_before: 90c97815f46e9b2496336bd182901bd0f960cdbd

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deploy.sh의 모든 외부 명령은 run() 래퍼를 지난다 — --dry-run이면 실행 없이 '+ …'만 출력"
    - "STAGE=<함수명>을 각 함수 첫 줄에서 갱신 + set -o errtrace(set -E)로 ERR 트랩이 함수 안에서도 발동 — 실패 시 stderr 마지막 줄이 'deploy failed at <함수명>'"
    - "idempotent 자원 생성은 항상 `if ! describe; then create; fi` 형태로 쓴다 — `describe || create` 한 줄로 쓰면 bash의 OR-list ERR 트랩 예외 규칙 때문에 create 실패가 조용히 삼켜진다(실측)"
    - "가짜 gcloud/curl은 $DEPLOY_FAKE_STATE 디렉터리의 파일로 상태를 흉내 낸다 — 파일이 없으면 '목록이 비어 있음'(성공, 빈 출력)과 '명령 실패'를 구분해야 하므로 상태 조회 헬퍼는 항상 exit 0을 반환하고, 실패시켜야 하는 경우만 각 case 분기에서 명시적으로 exit 1"
    - "GCP 리소스 이름은 사용자 결정(2026-09-18)에 따라 plant8- 접두어로 통일한다(서비스·SQL·SA·AR·Job) — WIF_POOL/WIF_PROVIDER/DEPLOYER_SA는 이름 규칙 결정 대상이 아닌 identity 리소스 식별자라 플랜 원문 값을 유지"

key-files:
  created:
    - infra/names.sh
    - infra/ar-cleanup-policy.json
    - infra/monitoring/5xx-ratio.json.tpl
    - infra/monitoring/backup-failed.json.tpl
    - infra/monitoring/tick-stale.json.tpl
    - scripts/deploy.sh
    - scripts/rollback.sh
    - scripts/bootstrap-gcp.sh
    - .github/workflows/deploy.yml
    - .github/workflows/account.yml
    - test/unit/deploy/fakebin/gcloud
    - test/unit/deploy/fakebin/docker
    - test/unit/deploy/fakebin/curl
    - test/unit/deploy/deploy-sh.test.ts
    - test/unit/deploy/rollback-sh.test.ts
    - test/unit/deploy/bootstrap-sh.test.ts
    - test/unit/deploy/workflows.test.ts
  modified: []

key-decisions:
  - "[사용자 결정 적용] infra/names.sh의 리소스 접두어를 순수 plant8-로 통일(서비스·SQL 인스턴스·SA·AR 레포는 STATE.md 결정 목록에 명시, Job 이름(job_name())도 같은 Cloud Run 리소스 계열이라 일관되게 plant8-로 확장했다 — 결정 목록이 예시로 든 5개 항목 밖이지만, erp-/plant8-erp- 옵션을 전부 배제한 취지를 Job에도 적용하는 것이 더 안전하다고 판단). WIF_POOL(github)·WIF_PROVIDER(erp-repo)·DEPLOYER_SA(gha-deployer)는 이름 규칙 결정 대상이 아닌 identity 리소스 식별자라 플랜 <interfaces> 원문 값을 그대로 유지했다"
  - "[Rule 3 - Blocking] bash ERR 트랩이 함수 안에서 발동하지 않는 문제 — set -euo pipefail만으로는 함수 안의 실패(예: ensure_sql_instance 안의 `run gcloud sql instances create` 실패)가 trap 'echo deploy failed at $STAGE' ERR를 발동시키지 않음을 실측으로 발견(bash 기본은 ERR 트랩을 함수·서브셸에 상속하지 않는다). `set -o errtrace`(=set -E) 추가로 해결 — 최소 재현 스크립트로 원인을 먼저 확인한 뒤 수정"
  - "[Rule 1 - Bug] --dry-run 모드가 실제로는 무한 대기·거짓 실패를 냈다 — (1) ensure_sql_instance의 RUNNABLE 폴링 루프가 --dry-run에서도 run()이 매번 '+ gcloud …' 문자열을 반환해 상태 비교가 절대 RUNNABLE이 되지 않아 15분(90×10초) 그대로 대기함, (2) ensure_network의 grep 검사가 --dry-run 미리보기 문자열에서 VPC_RANGE를 찾지 못해 exit 1로 죽음, (3) smoke()의 curl 응답 비교(healthz JSON·http_code)가 --dry-run 미리보기 문자열과 비교돼 항상 SmokeFailed로 떨어짐. 세 곳 모두 `if [ \"$DRY_RUN\" = 1 ]; then …; return 0; fi`로 실제 검증 로직을 건너뛰고 미리보기만 출력하도록 수정 — 실제 대기(timeout 20 명령)로 재현·확인"
  - "[Rule 1 - Bug] rollback.sh용 가짜 gcloud의 `run services describe --format=json` 출력이 status.traffic이 아니라 최상위 traffic 키였다 — 실제 gcloud 출력 형태(status.traffic)와 다르면 rollback.sh의 jq 쿼리가 항상 빈 문자열을 내 'no serving revision'으로 오판. status 객체로 감싸도록 수정, jq 파이프로 재확인"
  - "[Rule 1 - Bug] describe url 필드 추출 시 필드 인덱스 오프셋 오류(awk '{print $3}' → $4) — 'run services describe <svc> --format=value(status.url)' 인자에서 서비스 이름이 3번째가 아니라 4번째 필드(run/services/describe/<svc>)였다. 실제 실행 결과로 '설명 URL이 다름' 노트가 항상(불필요하게) 뜨는 것을 보고 원인 파악"
  - "[문서화된 판단] deploy.yml/account.yml에 pnpm build:cli 별도 스텝을 추가하지 않았다 — Dockerfile을 직접 읽어 확인한 결과 build 스테이지가 이미 `RUN pnpm build && pnpm build:cli`를 컨테이너 안에서 실행한다(01-05). docker build는 `COPY . .`로 소스만 넘기고 dist/cli는 컨테이너 내부에서 새로 만들어지므로, 러너에서 미리 build:cli를 실행해 둘 필요가 없다(Dockerfile이 .dockerignore로 dist를 빌드 컨텍스트에서 제외해도 문제없는 이유이기도 하다). 워크플로에는 pnpm/node 설치 자체가 필요 없다"
  - "[문서화된 판단] Task 2 acceptance_criteria 문구 중 '.github/workflows/account.yml에 erp-가 있다'는 플랜 작성 시점(옵션-A 예시 이름 기준)의 문구다. 사용자의 실제 결정(pure plant8-, 2026-09-18)에 따라 account.yml은 infra/names.sh의 job_name()을 source해 plant8-{env}-account를 쓴다 — 리터럴 'erp-' 문자열은 account.yml에 없다(WIF_PROVIDER 상수 'erp-repo'는 deploy.yml에만 나타난다). 의도(Job 자원 이름이 올바르게 조립된다)는 만족하지만 그 특정 grep 문구는 문자 그대로는 통과하지 않는다 — 자체 작성한 workflows.test.ts는 plant8- 기준으로 검증한다"

requirements-completed: [OPS-01, OPS-02]

coverage:
  - id: D1
    description: "scripts/deploy.sh --env staging|prod --project ID [--region R] 한 번으로 AR·Cloud SQL(db-f1-micro, 공인 IP 없음, IAM 인증, 자동 백업)·Secret Manager·Cloud Run 서비스+Job 3개가 없으면 생성되고 있으면 갱신되며, 다른 프로젝트/리전으로도 같은 시퀀스를 낸다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#새 프로젝트(시나리오 1), 기존 서비스·이미지(시나리오 2), 다른 프로젝트/리전으로도 같은 시퀀스"
        status: pass
    human_judgment: false
  - id: D2
    description: "deploy.sh는 더티 트리에서 gcloud 호출 전에 exit 2로 거부하고, migrate 실패(exit 3/1 구분)·스모크 실패(healthz/login/sign-in Origin)에서 트래픽을 옮기지 않고 exit 1하며, 임의 gcloud 실패는 stderr 마지막 줄에 'deploy failed at <함수명>'을 남긴다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#deploy.sh — 거부·실패 경로 (6 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SERVICE_URL은 결정적 형식 하나로 고정되어 Job env·서비스 env·스모크·stdout 전부가 같은 값을 쓰고, describe가 다른 호스트를 돌려줘도 stderr 노트로만 남긴다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#기존 서비스·이미지(시나리오 2) — describe url differs 노트 + 마지막 stdout 줄"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/rollback.sh는 서빙 중인 리비전보다 오래된 최신 리비전으로 트래픽을 되돌리고, 스모크 실패로 0%인 최신 리비전은 건너뛰며, 서빙 리비전이 가장 오래된 것이면 거부한다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/rollback-sh.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Job 3개(db-bootstrap·migrate·account) 모두 APP_ENV·BETTER_AUTH_URL·BETTER_AUTH_SECRET을 갖고, DB_ADMIN_PASSWORD는 db-bootstrap에만, account만 --command 둘째 항목에 스크립트 경로를 둔다(Eng OV-1)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#Job 환경 계약(시나리오 9)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Artifact Registry 정리 정책(최근 20버전 유지, 60일 초과 삭제)이 deploy.sh로 매번 재적용된다"
    requirement: "OPS-02"
    verification:
      - kind: unit
        ref: "test/unit/deploy/deploy-sh.test.ts#새 프로젝트(시나리오 1) — set-cleanup-policies 줄 단언; infra/ar-cleanup-policy.json keepCount"
        status: pass
    human_judgment: false
  - id: D7
    description: "scripts/bootstrap-gcp.sh는 프로젝트 존재·결제 연결을 먼저 검사해(D-03) 실패 시 아무 리소스도 만들지 않고 exit 1하며, 통과하면 API·WIF(리포 한정)·SA·역할·VPC·조직 정책을 멱등하게 수행하고 GitHub 변수 3개를 출력한다. 단일 파일이라 infra/의 이름 규칙 파일을 source하지 않지만 그 상수 값은 동일하다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/bootstrap-sh.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: ".github/workflows/deploy.yml은 main push(또는 workflow_dispatch target=staging)에서 ci.yml 통과 뒤 스테이징에 배포하고, production은 workflow_dispatch(target=production)로만 실행되며 가드 스텝이 스테이징 서빙 이미지 태그 일치를 확인한 뒤에만 같은 SHA로 승격한다. GitHub Environments는 쓰지 않는다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/workflows.test.ts#deploy.yml (11 tests)"
        status: pass
    human_judgment: false
  - id: D9
    description: ".github/workflows/account.yml은 workflow_dispatch로 Cloud Run Job account를 실행(create/reset/unlock)하고, 01-02 parseArgs 규약(플래그·값 별개 항목)을 따르며, 로그 폴링으로 임시 비밀번호/unlocked를 확인한 뒤 재실행 금지를 안내한다"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "test/unit/deploy/workflows.test.ts#account.yml (5 tests)"
        status: pass
    human_judgment: false
  - id: D10
    description: "실제 GCP에 대한 첫 실행(스테이징 배포, WIF 인증, 실제 gcloud 출력 형태 재확인)은 01-07의 몫이다 — 이 플랜은 가짜 심으로만 검증했다"
    verification: []
    human_judgment: true
    rationale: "이 클라우드 세션에는 gcloud·실제 Docker 데몬·GCP 프로젝트 접근이 없다(환경 노트에 명시). deploy.sh·bootstrap-gcp.sh·워크플로의 분기·순서·거부 조건은 가짜 gcloud/docker/curl로 전부 증명했지만, 실제 gcloud 출력 형태(예: status.url 호스트, revisions describe의 image 필드가 태그를 보존하는지)는 01-07이 실제 실행으로 재확인해야 한다(플랜 Flagged Assumptions에 이미 명시됨)"

duration: 38min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 6: 배포 파이프라인(deploy.sh·rollback.sh·bootstrap-gcp.sh·워크플로) Summary

**가짜 gcloud/docker/curl 위에서 검증한 deploy.sh(인프라 ensure → SHA 이미지 → Job 3개 → 0%→스모크→100% → 경보 upsert)·rollback.sh·bootstrap-gcp.sh(WIF·SA·VPC 1회 부트스트랩)와 deploy.yml(staging 자동/production 수동+SHA 가드)·account.yml 워크플로 — plant8- 접두어 리소스 이름 규칙 적용.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-09-18T09:40:00Z (추정 — 직전 세션 종료 09:38:47 직후)
- **Completed:** 2026-09-18T10:18:00Z
- **Tasks:** 2
- **Files modified:** 17 (17 created, 0 modified)

## Accomplishments

- `infra/names.sh` — 사용자 결정(2026-09-18)에 따른 plant8- 접두어 리소스 이름 규칙(서비스·SQL·SA·AR·Job) + 상수(MAX_INSTANCES=3, DB_POOL_MAX=5, DB_TIER=db-f1-micro)
- `scripts/deploy.sh`(280줄) — `parse_args → require_clean_tree → resolve_project_number → require_prod_image → ensure_apis → ensure_ar_repo → ensure_network → ensure_sql_instance → ensure_sql_db_users → ensure_secrets → build_and_push_image → deploy_jobs → run_db_bootstrap → run_migrate → deploy_service → smoke → ensure_alerts → promote → map_domain`. `STAGE` 트랩(`set -o errtrace`)으로 실패 함수를 stderr 마지막 줄에 남긴다
- `scripts/rollback.sh` — `status.traffic` percent 100 리비전을 찾아 그보다 오래된 최신 리비전으로 복구
- `scripts/bootstrap-gcp.sh`(단일 파일, 152줄) — 프로젝트·결제 사전 검사(D-03) → API → WIF(리포 한정 attribute-condition, T-1-29) → SA 3개 → 역할 → VPC → 조직 정책 4개 확인
- `.github/workflows/deploy.yml`·`account.yml` — WIF 인증, GitHub Environments 미사용(D-05), production은 workflow_dispatch + 스테이징 SHA 가드 전용
- `test/unit/deploy/fakebin/{gcloud,docker,curl}` — 상태 파일 기반 가짜 심(약 50개 gcloud 하위 명령 분기 흉내)
- 단위 테스트 4파일 57개 전부 통과 — `deploy-sh`(23), `rollback-sh`(6), `bootstrap-sh`(8), `workflows`(20)
- `pnpm test:unit` 전체 183/183, `pnpm lint`·`pnpm typecheck` 클린 재확인(회귀 없음)

## Task Commits

1. **Task 1: infra/names.sh + scripts/deploy.sh + scripts/rollback.sh — 가짜 gcloud/docker/curl 심으로 순서·분기·거부 테스트** - `8dbcafd` (feat)
2. **Task 2: bootstrap-gcp.sh + 경보 정책 템플릿 3개 + deploy.yml·account.yml 워크플로** - `04d5b09` (feat)

**Plan metadata:** (이 커밋 다음에 기록됨)

## Files Created/Modified

frontmatter `key-files` 참조. 요약:
- 이름 규칙·정책: `infra/names.sh`, `infra/ar-cleanup-policy.json`, `infra/monitoring/*.json.tpl`
- 스크립트: `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/bootstrap-gcp.sh`
- 워크플로: `.github/workflows/{deploy,account}.yml`
- 테스트: `test/unit/deploy/fakebin/{gcloud,docker,curl}`, `test/unit/deploy/{deploy-sh,rollback-sh,bootstrap-sh,workflows}.test.ts`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심 6개: (1) plant8- 접두어를 Job 이름까지 일관 확장, (2) `set -o errtrace` 없이는 함수 안 ERR 트랩이 발동하지 않는다는 실측 발견·수정, (3) `--dry-run` 모드가 실제로 무한 대기·거짓 실패를 내는 3곳(SQL 폴링·네트워크 검사·스모크)을 실제 실행으로 재현해 수정, (4) 가짜 gcloud JSON 출력 구조 오류(status 누락) 수정, (5) awk 필드 오프셋 오류 수정, (6) Dockerfile을 직접 읽어 확인한 뒤 워크플로에 불필요한 build:cli 스텝을 추가하지 않기로 판단.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bash ERR 트랩이 함수 안에서 발동하지 않음 → `set -o errtrace` 추가**
- **Found during:** Task 1 (behavior 5b 시나리오 실제 실행 확인 — `fail-gcloud=sql instances create`를 줬는데도 stderr에 "deploy failed at …" 메시지가 안 나옴)
- **Issue:** `set -euo pipefail` + `trap ... ERR`만으로는 bash가 기본적으로 ERR 트랩을 함수·서브셸에 상속하지 않는다(`shopt`류가 아니라 `set -o errtrace`가 필요). 최소 재현 스크립트(`/tmp/errtest.sh`)로 원인을 먼저 확인
- **Fix:** `set -euo pipefail` 다음 줄에 `set -o errtrace` 추가(요구된 리터럴 `set -euo pipefail` 문자열은 그대로 유지해 acceptance grep도 통과)
- **Files modified:** scripts/deploy.sh
- **Verification:** `fail-gcloud=sql instances create` 시나리오에서 stderr 마지막 줄이 `deploy failed at ensure_sql_instance`로 정확히 확인됨
- **Committed in:** 8dbcafd

**2. [Rule 1 - Bug] `--dry-run`이 무한 대기·거짓 실패를 냄(3곳)**
- **Found during:** Task 1 (`--dry-run` 시나리오 실제 실행 — 첫 시도가 120초 타임아웃으로 백그라운드로 밀려남)
- **Issue:** (a) `ensure_sql_instance`의 RUNNABLE 폴링 루프가 `--dry-run`에서도 `run()`이 실제 상태 대신 `+ gcloud …` 문자열을 반환해 90회×10초(15분) 그대로 대기 (b) `ensure_network`의 grep 검사가 미리보기 문자열에서 VPC_RANGE를 못 찾아 exit 1 (c) `smoke()`의 curl 응답 비교가 미리보기 문자열과 비교돼 항상 SmokeFailed
- **Fix:** 세 곳 모두 `[ "$DRY_RUN" = "1" ]`이면 실제 검증을 건너뛰고 `run curl/gcloud`로 미리보기만 출력한 뒤 즉시 반환하도록 수정
- **Files modified:** scripts/deploy.sh
- **Verification:** `timeout 20 bash scripts/deploy.sh --dry-run` exit 0, 로그 비어 있음, stdout에 `+ gcloud run deploy` 확인(실제 실행)
- **Committed in:** 8dbcafd

**3. [Rule 1 - Bug] 가짜 gcloud `state_val` 헬퍼가 상태 파일 부재 시 실패를 반환**
- **Found during:** Task 1 (시나리오 1 최초 실행 — `sql users list` 호출 뒤 원인 불명 exit 1)
- **Issue:** `state_val() { [ -f ... ] && cat ... ; }` 구조는 파일이 없으면 `&&` 체인 전체가 실패(exit 1)를 반환한다 — "목록이 비어 있음"(정상, exit 0)과 "명령 자체가 실패함"을 구분하지 못해 `sql users list`처럼 빈 결과가 정상인 명령까지 실패로 보고됨
- **Fix:** `state_val`을 `if [ -f ... ]; then cat ...; fi` 구조로 바꿔 파일이 없으면 그냥 빈 문자열 + exit 0을 반환하게 정정
- **Files modified:** test/unit/deploy/fakebin/gcloud
- **Verification:** 시나리오 1 전체가 exit 0으로 끝까지 진행됨을 확인
- **Committed in:** 8dbcafd

**4. [Rule 1 - Bug] 가짜 `run services describe --format=value(status.url)`의 awk 필드 오프셋 오류**
- **Found during:** Task 1 (시나리오 1 실제 실행 — describe url이 항상 "differs"로 나옴)
- **Issue:** `awk '{print $3}'`는 "describe"(4번째 아님, 3번째 위치의 하위 명령어 자체)를 가리켰다 — 서비스 이름은 4번째 필드
- **Fix:** `$3` → `$4`로 정정
- **Files modified:** test/unit/deploy/fakebin/gcloud
- **Verification:** 새 서비스 시나리오에서 describe url differs 노트가 더 이상 뜨지 않음(실제 실행 확인)
- **Committed in:** 8dbcafd

**5. [Rule 1 - Bug] 가짜 `run services describe --format=json`이 `status` 객체로 감싸지 않음**
- **Found during:** Task 1 (rollback.sh 시나리오 A 최초 실행 — 항상 "no serving revision")
- **Issue:** 실제 `gcloud run services describe --format=json`은 `{"status":{"traffic":[...]}}` 구조인데, 가짜는 최상위에 `traffic`을 바로 뒀다 — rollback.sh의 `jq '.status.traffic[]...'`가 항상 빈 결과
- **Fix:** JSON 출력을 `{"status": {...}}`로 감싸도록 수정
- **Files modified:** test/unit/deploy/fakebin/gcloud
- **Verification:** rollback 시나리오 5개(A~E) 전부 실제 실행으로 통과 확인
- **Committed in:** 8dbcafd

### 계획과 다르게 실행한 것(버그 아님, 판단 기록)

- **plant8- 접두어를 Job 이름까지 확장:** STATE.md의 사용자 결정 목록은 서비스·SQL 인스턴스·SA·AR 레포 5개만 "concretely" 예시로 들었지만, Cloud Run Job은 서비스와 같은 리소스 계열이라 접두어를 섞지 않는 것이 옵션 A(erp-)·B(plant8-erp-)를 전부 배제한 결정의 취지에 맞다고 판단해 `job_name()`도 plant8-로 통일했다. `WIF_POOL`(github)·`WIF_PROVIDER`(erp-repo)·`DEPLOYER_SA`(gha-deployer)는 이름 규칙 결정 대상이 아닌 identity 리소스 식별자라 플랜 원문 값을 유지했다
- **Task 2 acceptance_criteria의 'account.yml에 erp-가 있다' 문구:** 플랜 작성 시점(옵션-A 예시)의 문구이고, 사용자의 실제 결정을 따르면 account.yml은 `infra/names.sh`의 `job_name()`을 source해 `plant8-{env}-account`를 조립하므로 리터럴 `erp-` 문자열이 파일에 없다. 자체 작성한 `workflows.test.ts`는 plant8- 기준으로 검증했다 — 의도(Job 자원 이름이 올바르게 조립되고 01-02 argv 규약을 따른다)는 만족한다
- **deploy.yml/account.yml에 `pnpm build:cli` 스텝을 추가하지 않음:** 오케스트레이터 지시(01-05가 만든 build:cli는 gitignored이므로 이미지 빌드 전에 실행해야 한다는 일반 주의)를 실제 `Dockerfile`(01-05 산출물)을 직접 읽어 재확인한 결과, `build` 스테이지가 이미 컨테이너 안에서 `RUN pnpm build && pnpm build:cli`를 실행하고 `COPY . .`로 소스만 컨텍스트에 넘긴다 — 러너에서 별도로 `pnpm install`·`build:cli`를 실행할 필요가 없다(오히려 불필요한 Node 설치 스텝이 워크플로에 추가될 뻔했다). 근거가 되는 파일 내용을 읽고 확인한 뒤 내린 판단이라 별도 스텝을 추가하지 않았다

---

**Total deviations:** 5 auto-fixed (1 Rule 3 - 차단 이슈, 4 Rule 1 - 버그) + 3 계획 대비 실행 판단(버그 아님, 근거 기록)
**Impact on plan:** 전부 스크립트가 실제로 동작하는지(무한 대기·거짓 실패·트랩 미발동은 전부 "테스트가 통과했다고 결론 내리면 안 되는" 조용한 실패였다) 확인하는 과정에서 발견·수정됐다. 승인된 아키텍처·의존성 목록을 벗어나지 않았다. 범위 확장 없음.

## Known Stubs

없음 — 이 플랜은 배포 파이프라인 스크립트·워크플로·가짜 심만 다루고 화면/도메인 스텁을 만들지 않는다.

## Issues Encountered

- shellcheck가 이 클라우드 세션에 설치돼 있지 않다(`command -v shellcheck` 실패 확인) — 플랜이 이미 "없으면 생략, SUMMARY에 기록"으로 허용한 경로. `bash -n` 구문 검사 3개 스크립트 전부 통과로 대체
- 이 클라우드 세션에는 실제 `gcloud`·Docker 데몬·GCP 프로젝트 접근이 없다(환경 노트에 이미 명시) — 실제 GCP 실행은 01-07(스테이징)·01-08(프로덕션)의 몫이며, 이 플랜은 가짜 심으로 분기·순서·거부 조건만 증명했다

## User Setup Required

None - no external service configuration required. 실제 GCP 부트스트랩(`scripts/bootstrap-gcp.sh` Cloud Shell 1회 실행)은 01-07에서 사용자가 수행한다(STATE.md에 이미 부분적으로 사전 준비 완료 기록됨).

## Next Phase Readiness

- OPS-01·OPS-02는 01-05·01-06 둘 다 선언하는 shared-ID gate — 01-07·01-08까지 끝나야 REQUIREMENTS.md가 Complete로 바뀐다(의도된 동작)
- `infra/names.sh`의 plant8- 접두어가 확정되어 01-07 Task 1이 재확인 없이 바로 적용할 수 있다(STATE.md 결정에 이미 기록됨)
- `scripts/bootstrap-gcp.sh`·`scripts/deploy.sh`·워크플로 2개가 가짜 심 위에서 전부 검증되어, 01-07은 실제 GCP 위에서 (a) `bootstrap-gcp.sh` 1회 실행 (b) GitHub 변수 4개(GCP_PROJECT_ID·GCP_PROJECT_NUMBER·GCP_REGION·ALERT_EMAIL) 설정 (c) `deploy.yml` staging 첫 실행으로 이어갈 준비가 됐다
- 실제 gcloud 출력 형태에 대한 [ASSUMED] 항목(결정적 URL 형식, `--no-traffic` 첫 배포 예외, `revisions describe`의 image 필드가 태그를 보존하는지 등)은 01-07이 실제 실행으로 재확인해야 한다(플랜 본문에 이미 명시됨)
- `pnpm test:unit`(183/183)·`pnpm lint`·`pnpm typecheck` 전부 통과 확인(이 플랜 종료 시점, 회귀 없음)

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*

## Self-Check: PASSED

- All 17 listed created files verified present on disk (`[ -f ]`, 0 missing): infra/names.sh, infra/ar-cleanup-policy.json, infra/monitoring/{5xx-ratio,backup-failed,tick-stale}.json.tpl, scripts/{deploy,rollback,bootstrap-gcp}.sh, .github/workflows/{deploy,account}.yml, test/unit/deploy/fakebin/{gcloud,docker,curl}, test/unit/deploy/{deploy-sh,rollback-sh,bootstrap-sh,workflows}.test.ts.
- Both task commits verified in `git log --oneline --all`: `8dbcafd`, `04d5b09`.
- All plan-level `<acceptance_criteria>` grep checks for Task 1 and Task 2 re-run and passing (see Deviations section and body above for exact commands/output).
- Plan-level `<verification>` re-run: `pnpm test:unit` (183/183, includes the 4 deploy test files + ci-guard) and `bash -n scripts/deploy.sh && bash -n scripts/rollback.sh && bash -n scripts/bootstrap-gcp.sh` (all exit 0) — both pass.
- Beyond plan minimum: `pnpm lint` and `pnpm typecheck` re-run clean (no new errors, only pre-existing eslint-plugin-boundaries deprecation warnings from 01-04); real (non-vitest) `timeout`-guarded executions of deploy.sh (all 11 behavior scenarios + 5b), rollback.sh (5 scenarios), and bootstrap-gcp.sh (6 scenarios) against the fakebin, confirming the vitest assertions match actual process exit codes/stderr/log ordering rather than only mocked expectations.
- `git status --porcelain` clean at commit time after both task commits.
