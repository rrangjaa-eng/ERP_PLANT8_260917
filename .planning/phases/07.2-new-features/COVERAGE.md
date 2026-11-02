# API Coverage — Google Cloud Scheduler · Cloud Run Admin API (v2) · IAM (07.2-03 확인증 자동 파기)

> 기본은 전체 사용. 빼는 기능은 이유를 적은 명시 결정이다.
> 이 페이즈의 외부 API 사용은 07.2-03(PU21 · D-7278) 하나뿐이다 — `scripts/deploy.sh`(ensure_purge_scheduler) · `scripts/bootstrap-gcp.sh` · `scripts/verify-gcp.sh`가 gcloud CLI로 부른다. 앱 코드(app/ · domain/ · repositories/)는 이 API를 부르지 않는다.
> 나머지 18개 플랜은 외부 API를 새로 붙이지 않는다(이미 있는 GCS · Secret Manager 사용 범위 변경 0).

## Cloud Scheduler (v1 · projects.locations.jobs)

| capability | decision | reason |
|---|---|---|
| scheduler.jobs.create (HTTP 대상 · OAuth 토큰 · 월 1회 cron · 재시도 0) | INTEGRATE | |
| scheduler.jobs.get (describe — create/update 분기 · verify-gcp ENABLED 확인) | INTEGRATE | |
| scheduler.jobs.patch (update http — 이미 있을 때 인자 맞춤) | INTEGRATE | |
| scheduler.jobs.run (강제 실행) | INTEGRATE | |
| scheduler.jobs.delete | OPT-OUT | not needed — 잡 제거는 배포 범위 밖, 끄기는 pause로 충분 |
| scheduler.jobs.list | OPT-OUT | not needed — 이름이 infra/names.sh로 정해져 describe 한 건으로 충분 |
| scheduler.jobs.pause | OPT-OUT | not needed yet — 운영 중 멈춤은 런북 수동 명령(docs/CERT-PURGE.md)으로, 배포 스크립트가 부르지 않는다 |
| scheduler.jobs.resume | OPT-OUT | not needed yet — pause와 짝, 같은 이유 |
| scheduler.OIDC 토큰 대상(oidcToken) | OPT-OUT | explicitly out of scope — Run Admin API 호출은 OAuth 토큰이 맞는 꼴(OIDC는 Run 서비스 URL용) |
| scheduler.Pub/Sub · App Engine 대상 | OPT-OUT | explicitly out of scope — HTTP 대상 하나로 Job 실행 |

## Cloud Run Admin API (v2 · projects.locations.jobs)

| capability | decision | reason |
|---|---|---|
| run.jobs.create / jobs.patch (run jobs deploy plant8-{env}-purge-certs-auto) | INTEGRATE | |
| run.jobs.run (Scheduler가 :run POST로 부름 — overrides 본문 없음) | INTEGRATE | |
| run.jobs.getIamPolicy / jobs.setIamPolicy (job 단위 roles/run.invoker 바인딩) | INTEGRATE | |
| run.jobs.executions.list (verify-gcp purge-scheduler 실행 기록 읽기) | INTEGRATE | |
| run.jobs.get | INTEGRATE | |
| run.jobs.run overrides(args · env · taskCount) | OPT-OUT | explicitly out of scope — 모드는 Job 정의 인자로 굳혀 재배포로만 바꾼다(D-7278 · 사용자 머지 모드 파일) |
| run.jobs.delete | OPT-OUT | not needed — 자동 Job 제거는 배포 범위 밖 |
| run.jobs.list | OPT-OUT | not needed — 이름 고정, get으로 충분 |
| run.jobs.executions.get / cancel / delete | OPT-OUT | not needed yet — 실행 하나 들여다보기·취소는 사람 콘솔 조작, 스크립트가 부르지 않는다 |
| run.jobs.testIamPermissions | OPT-OUT | not needed — 권한 부족은 verify-gcp가 첫 실행 기록 없음으로 드러낸다(RESEARCH A1) |

## IAM · Cloud Logging (bootstrap · 검사)

| capability | decision | reason |
|---|---|---|
| iam.serviceAccounts.create (plant8-{env}-purge-sched · 없을 때만) | INTEGRATE | |
| iam.serviceAccounts.get (describe) | INTEGRATE | |
| iam.serviceAccounts.setIamPolicy (배포자에게 그 SA의 serviceAccountUser) | INTEGRATE | |
| logging.entries.list (Scheduler 실행 기록 읽기) | INTEGRATE | |
| iam.serviceAccounts.keys.create | OPT-OUT | explicitly out of scope — 키 없음(OAuth · T-07.2-03-01) |
| projects.setIamPolicy (프로젝트 수준 역할) | OPT-OUT | explicitly out of scope — 프로젝트 수준 바인딩 0이 보안 요구(T-07.2-03-01) |
