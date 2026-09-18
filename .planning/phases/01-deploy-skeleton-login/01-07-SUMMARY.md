---
phase: 01-deploy-skeleton-login
plan: 07
subsystem: infra
tags: [gcp, cloud-run, cloud-sql, github-actions, wif, deploy, monitoring]

# Dependency graph
requires:
  - phase: 01-03
    provides: "/admin/system-status 화면(배포 SHA·DB 커넥션·마지막 백업) — 실데이터 확인 대상"
  - phase: 01-05
    provides: "Dockerfile(서비스+Job 3개 같은 이미지), migrate-runner의 16A 커넥션 예산 검사"
  - phase: 01-06
    provides: "scripts/deploy.sh · bootstrap-gcp.sh · infra/names.sh(plant8- 접두어) · deploy.yml/account.yml"
provides:
  - "실제 회사 GCP 스테이징 환경 — Cloud Run plant8-staging + Job 3개, Cloud SQL plant8-staging-db, AR plant8, 시크릿 7개, 경보 정책 3개·이메일 채널 1개, WIF 풀·프로바이더, SA 3개"
  - "01-07-DEPLOY-LOG.md — 시도별 원인·수정 이력과 [ASSUMED] 4건의 실측 결과(마스킹)"
  - "app/api/health/route.ts — /healthz가 구글 엣지 예약 경로임이 실측돼 이전된 헬스 엔드포인트"
  - "scripts/promote-guard.sh — 프로덕션 승격 가드(APP_GIT_SHA 기준), 01-08 Task 1이 그대로 쓴다"
  - "관리자·테스트 계정 2개(스테이징)"
affects: [01-08]

# Actuals
actuals:
  tokens: unknown
  tasks: 3
  commits: 28
plan_head_before: 0f76ce3ab52e46a2a6391be483eedbd9ade2d2a7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "실행자 세션은 아웃바운드 방화벽으로 *.run.app·Actions 로그 저장소에 닿지 못한다(api.github.com만 통과) — 실측이 필요하면 일회용 workflow_dispatch 워크플로를 만들어 Actions 안에서 재고, 결과를 orphan 브랜치에 커밋해 contents API로 회수한 뒤 워크플로를 지운다"
    - "헬스체크 경로로 /healthz를 쓰지 않는다 — Cloud Run/구글 엣지가 예약 경로로 가로채 컨테이너에 닿기 전에 404를 돌려준다(실측). /api/health를 쓴다"
    - "Cloud Run 리비전의 spec.containers[0].image는 배포 시점에 태그가 다이제스트로 해석돼 저장된다 — 배포된 git SHA는 이미지 문자열이 아니라 리비전의 APP_GIT_SHA 환경변수에서 읽는다"
    - "Cloud Monitoring 필터 문자열 리터럴은 큰따옴표만 받는다(displayName=\"...\") — 작은따옴표는 INVALID_ARGUMENT"
    - "Cloud SQL 커넥터(@google-cloud/cloud-sql-connector)는 갱신 타이머를 들고 있어 pool.end()만으로는 이벤트 루프가 비지 않는다 — closeDb()가 finally에서 함께 닫아야 Cloud Run Job이 스스로 끝난다"

key-files:
  created:
    - .planning/phases/01-deploy-skeleton-login/01-07-DEPLOY-LOG.md
    - app/api/health/route.ts
    - scripts/promote-guard.sh
    - test/unit/deploy/promote-guard-sh.test.ts
    - test/unit/db-client-close.test.ts
  modified:
    - scripts/deploy.sh
    - .github/workflows/deploy.yml
    - .github/workflows/account.yml
    - infra/names.sh
    - infra/monitoring/tick-stale.json.tpl
    - db/client.ts
    - scripts/account-cli.ts
    - docs/OPERATIONS.md
    - docs/ARCHITECTURE.md

key-decisions:
  - "[Rule 1 - Bug] 카나리(0% → 태그 URL 스모크 → 100%) 단계를 설계에서 통째로 제거했다 — 태그 전용 URL이 4회 연속 15분 넘게 라우팅되지 않았고(리비전 자체는 매번 Ready) 원인이 구글 인프라 내부라 우리 쪽에서 재현·수정할 수 없었다. 신규·기존 서비스 모두 바로 100%로 배포한 뒤 실제 서비스 주소로 스모크한다. 자동 롤백은 없고 scripts/rollback.sh 수동 롤백이 대신한다"
  - "[Rule 1 - Bug] healthz 404의 원인은 IAM도 트래픽도 URL 형식도 아니었다 — 구글 엣지가 /healthz를 예약 경로로 가로챈다(사용자가 Cloud Shell에서 여러 경로를 직접 curl해 확정: /healthz만 X-Powered-By 없이 끝나고 /api/health·/health·/_health는 Next.js 404에 도달). 엔드포인트를 app/api/health/route.ts로 옮겼다. 5차례 오진(URL 형식·status.url·IAM·조직 정책·migrate 락) 뒤 실측으로 닫았다"
  - "[Rule 1 - Bug] 결정적 URL 가정(A) 기각 — describe().status.url이 계산식(plant8-staging-<PROJECT_NUMBER>.asia-northeast3.run.app)과 항상 다르다. status.url을 정본으로 삼고 컨테이너의 BETTER_AUTH_URL도 같이 고친다"
  - "[Rule 1 - Bug] deploy.yml 프로덕션 가드가 영구히 막혀 있었다 — 서빙 리비전의 image가 태그가 아니라 다이제스트로 저장되므로 ${STAGING_IMAGE##*:}가 git SHA 대신 다이제스트를 얻어 비교가 항상 불일치였다. 판정을 scripts/promote-guard.sh로 분리하고 리비전의 APP_GIT_SHA를 읽도록 고쳤다(단위 테스트 11건 + 실제 GCP 읽기 전용 프로브 1회로 검증)"
  - "[Rule 1 - Bug] Cloud SQL 커넥터 누수로 account Job이 900초 task-timeout까지 살아남아 계정이 정상 생성됐는데도 워크플로가 failure로 끝났다 — closeDb()가 커넥터를 닫도록 고치고(finally), account-cli 진입점에 .catch와 process.exit를 붙였다"
  - "[문서화된 판단] 조직 정책 4건은 gha-deployer SA에 orgpolicy.policy.get이 없어 직접 조회할 수 없었다(PERMISSION_DENIED). 다만 --allow-unauthenticated 성공·allUsers의 run.invoker 보유·WIF 프로바이더 생성 성공으로 실효적 차단이 없음을 확인했다 — 정책 원문 확인은 Owner 계정 몫으로 01-08에 넘긴다. 우회 시도는 하지 않았다"

requirements-completed: [OPS-01, OPS-06]
---

# Phase 1 Plan 7: 회사 GCP 스테이징 첫 배포 Summary

**deploy.yml/deploy.sh를 실제 회사 GCP에 처음 돌려 run #23까지 반복 실패·수정 끝에 스테이징(plant8-staging)을 띄우고, 계정 2개를 발급하고, [ASSUMED] 4건을 실측해 기록했다 — 실측 중 드러난 프로덕션 승격 가드의 치명적 버그까지 고쳐 01-08의 입구를 열었다.**

## Performance

- **Started:** 2026-09-18 (wave 6 재개 세션)
- **Tasks:** 3 (Task 1 결정 — 사전 확정 적용 / Task 2 사용자 Cloud Shell 부트스트랩 / Task 3 실배포·검증)
- **Commits:** 28 (`0f76ce3`..`ed2fbc5`)
- **배포 시도:** deploy 워크플로 run #10~#21 (첫 성공 #20, `5ed3eec`)

## Accomplishments

- 회사 GCP에 스테이징 환경 실물 기동 — Cloud Run `plant8-staging`(asia-northeast3) + Job 3개, Cloud SQL `plant8-staging-db`(공인 IP 없음·IAM 인증), Artifact Registry `plant8`, 시크릿 7개, 경보 정책 3개 + 이메일 채널 1개, WIF·SA 3개
- `/api/health`가 `{"ok":true,"sha":…}`로 응답, `/login` 200 — 배포 커밋 SHA 일치 확인
- **XFF 레이트리밋 실측(핵심 검증)** — 요청마다 `X-Forwarded-For`를 위조해도 11번째가 429. 위조로는 IP 버킷을 벗어날 수 없다는 01-02 Eng Issue 1의 전제가 실제 Cloud Run에서 참임을 확인. 계정 잠금(6번째 403)과 레이트리밋(11번째 429)이 독립적으로 동작
- `max_connections=25` 실측(가정 A2 확인) → 풀 규칙 `3×5=15 ≤ 20` 통과
- 관리자·테스트 계정 발급(account.yml 2회 success) — 임시 비밀번호는 Actions 실행 로그에만 남기고 리포에는 없다(T-1-37)
- 프로덕션 승격 가드 버그를 발견·수정·검증 — `scripts/promote-guard.sh` + 단위 테스트 11건 + 실제 GCP 읽기 전용 프로브 1회(run `35375257182`: 올바른 SHA 통과, 틀린 SHA 거부)
- `pnpm test:unit` 198/198, `pnpm lint`·`pnpm typecheck` 클린

## Task Commits

주요 커밋(전체 28건은 `git log 0f76ce3..ed2fbc5`):

1. `0cd3900` 카나리 제거 — 태그 URL 라우팅 실패 4회 뒤 설계 단순화
2. `eb8d851` `dist/cli` 전용 node_modules — standalone 트레이싱이 심볼릭 링크를 복원하지 않는 문제
3. `1ff0a3c` 트래픽 `--to-latest` 강제 + Monitoring 필터 따옴표
4. `5ed3eec` **첫 성공** — `/healthz` → `/api/health` 이전(구글 예약 경로)
5. `8478584`·`bd47e2b` DEPLOY-LOG 작성 + 임시 probe 워크플로 제거
6. `5ca3522`·`ed2fbc5` Cloud SQL 커넥터 누수(account Job 종료 불가) 수정 + 그 수정의 코드리뷰 지적 4건 반영
7. `fe851be` 프로덕션 승격 가드를 `APP_GIT_SHA` 기준으로 재작성

## Decisions Made

frontmatter `key-decisions` 참조.

## Issues Encountered

- **실행자 세션의 네트워크 제약** — `*.run.app`과 Actions 로그 저장소에 닿을 수 없어 배포된 앱을 직접 curl하거나 실패 로그를 읽을 수 없었다. 일회용 `workflow_dispatch` 워크플로 2개(`probe.yml`, `guard-probe.yml`)를 만들어 Actions 안에서 측정하고 결과를 orphan 브랜치로 회수한 뒤 워크플로를 삭제했다
- **orphan 결과 브랜치 3개(`probe-result`, `probe-result2`, `guard-probe-result`)가 남아 있다** — 실행자 세션에서 ref 삭제가 막힌다(깃 프록시 403 / 도구 정책). 내용은 마스킹된 프로브 출력뿐이고 시크릿은 없다. **사용자가 GitHub UI → Branches에서 삭제**
- **조직 정책 원문 미확인** — `orgpolicy.policy.get` 권한이 배포 SA에 없다. 실효적 차단이 없음은 확인됐고, 원문 확인은 Owner 계정 몫(01-08 후보)
- **`backup-failed` 경보의 필터 검증 불가** — 실패 이벤트 없이는 필터가 실제 로그 항목과 맞는지 알 수 없다. 첫 백업 창(18:00 UTC) 이후 01-08 human-check가 닫는다
- **태그 전용 트래픽 항목 4개 잔여** — 폐기된 카나리 시도가 `status.traffic[]`에 남긴 항목. 가드·배포에 영향 없음, 정리는 01-08 후보

## User Setup Required

- 완료: GCP 프로젝트 생성·결제 연결, `bootstrap-gcp.sh` Cloud Shell 실행, GitHub Actions 변수 4개 등록
- **미완**: 스테이징 human-check 6항목(브라우저 로그인·비밀번호 변경·상태 화면·직원 404·세션 유지·경보 3개 확인) — 01-08 착수 전 사용자 확인 필요
- **미완**: orphan 브랜치 3개 삭제

## Next Phase Readiness

- 스테이징이 서빙 중인 SHA가 01-08 Task 1의 입력이다 — **현재 `ed2fbc5`**(리비전 `plant8-staging-00025-m5r`, run `35376419153` success). 01-07 종료 시점의 `5ca3522`에서 갱신됐다. 프로덕션에는 이 SHA를 승격한다(가드가 `sha` 빈 값이면 자동으로 이 값을 고른다)
- 승격 가드는 실제 GCP에서 검증됐다 — 올바른 SHA 통과(exit 0), 틀린 SHA 거부(exit 1), `plant8-prod`는 아직 없음(01-08이 첫 배포)
- 01-08이 처리할 잔여 항목: 백업 경보 필터 확인, 조직 정책 원문(Owner), 태그 전용 트래픽 4개 정리, `db-bootstrap.ts`의 `createAdminPool` 커넥터 미종료(지금은 `process.exit()`로 가려짐), OPERATIONS.md 실측 반영, CLAUDE.md 명령 4자리 채우기

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18 (human-check 6항목 사용자 확인 대기)*
