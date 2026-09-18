# API Coverage — Phase 1 외부 API 통합

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> 탐지기(`api-coverage.cjs`)는 ROADMAP Phase 1 절만으로는 `detected:false`를 반환했지만, PLAN 본문은 앱 코드에서 Cloud SQL Admin API(`backupRuns.list`, D-18)를 직접 호출하고 `scripts/deploy.sh`·`scripts/bootstrap-gcp.sh`가 gcloud로 Cloud Run·Cloud SQL·Secret Manager·Artifact Registry·Cloud Monitoring·IAM(WIF)을 조작하므로 seal 시점 재탐지에 대비해 표면을 여기서 결정한다. 앱 런타임이 SDK로 부르는 것은 Cloud SQL Admin API 하나뿐이고, 나머지는 배포 파이프라인이 gcloud CLI로 선언적으로 만드는 인프라 조작이다.

## Cloud SQL Admin API (`@googleapis/sqladmin` v1, 앱 런타임 — `lib/gcp/cloud-sql-admin.ts`)

| capability | decision | reason |
|---|---|---|
| backupRuns.list | INTEGRATE | |
| backupRuns.get | OPT-OUT | not needed — 목록의 첫 항목(최신 백업 상태·종료 시각)만 상태 화면에 보인다 |
| backupRuns.insert | OPT-OUT | explicitly out of scope — 수동 백업 생성은 OPS-03(다른 페이즈), 서비스 계정은 읽기 권한만(D-18) |
| backupRuns.delete | OPT-OUT | explicitly out of scope — 파괴적 조작은 앱에서 하지 않는다(D-18 읽기 전용) |
| instances.get / instances.list | OPT-OUT | not needed yet — 인스턴스 메타(티어·상태)는 상태 화면 항목이 아니다. 이후 페이즈가 항목을 더할 때 재결정 |
| instances.insert / patch / delete / restart | OPT-OUT | explicitly out of scope — 인스턴스 생명주기는 `scripts/deploy.sh`(gcloud)가 담당 |
| databases.* | OPT-OUT | explicitly out of scope — DB 생성은 db-bootstrap Job(SQL)과 deploy.sh가 담당 |
| users.* | OPT-OUT | explicitly out of scope — IAM DB 사용자 생성은 deploy.sh(gcloud sql users)가 담당 |
| operations.* | OPT-OUT | not needed — 앱은 장기 작업을 만들지 않는다 |
| sslCerts.* / connect.* | OPT-OUT | not needed — 연결은 `@google-cloud/cloud-sql-connector`가 IAM으로 처리 |
| flags.list / tiers.list | OPT-OUT | not needed — 티어·플래그 선택은 deploy.sh 인자다 |

## Cloud SQL Node Connector (`@google-cloud/cloud-sql-connector`, 앱 런타임 — `db/client.ts`)

| capability | decision | reason |
|---|---|---|
| Connector.getOptions (authType IAM, ipType PRIVATE) | INTEGRATE | |
| Connector.getTediousOptions / getOptions(authType PASSWORD) | OPT-OUT | not needed — `authType: PASSWORD`는 db-bootstrap Job(`postgres` 관리 사용자, DB 소유권 부여)에만 쓰고 앱 경로는 IAM만(6A) |
| Connector.close | INTEGRATE | |

## gcloud 인프라 조작(배포 파이프라인 — `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/bootstrap-gcp.sh`)

앱이 SDK로 통합하는 API가 아니라 GitHub Actions/Cloud Shell에서 gcloud CLI로 실행하는 인프라 조작이다. 쓰는 동사만 적고, 나머지 gcloud 표면은 "인프라 관리 도구가 아니라 배포 재현 스크립트"라는 이유로 전부 OPT-OUT이다.

| capability | decision | reason |
|---|---|---|
| run services deploy / describe / update-traffic / add-iam-policy-binding | INTEGRATE | |
| run revisions list | INTEGRATE | |
| run jobs deploy / execute --wait | INTEGRATE | |
| run domain-mappings create | OPT-OUT | not needed yet — D-15: `--domain` 인자 자리만, 회사 도메인은 Phase 2~3 |
| sql instances create / describe | INTEGRATE | |
| sql databases create | INTEGRATE | |
| sql users create (cloud_iam_service_account) / set-password (postgres) | INTEGRATE | |
| sql backups create / restore, instances patch·delete | OPT-OUT | explicitly out of scope — 복원 리허설은 OPS-03(다른 페이즈), 삭제는 사람이 콘솔에서 |
| secrets create / versions add / add-iam-policy-binding | INTEGRATE | |
| artifacts repositories create / docker images describe | INTEGRATE | |
| monitoring channels create / list | INTEGRATE | |
| monitoring policies create / update / list | INTEGRATE | |
| logging metrics create / describe | INTEGRATE | |
| iam workload-identity-pools create / providers create-oidc | INTEGRATE | |
| iam service-accounts create / add-iam-policy-binding | INTEGRATE | |
| projects add-iam-policy-binding / describe | INTEGRATE | |
| compute networks describe / addresses create | INTEGRATE | |
| services vpc-peerings connect / list | INTEGRATE | |
| services enable, org-policies describe, projects describe | INTEGRATE | |
| scheduler jobs create | OPT-OUT | not needed yet — Cloud Scheduler tick 잡·SA는 Phase 7이 deploy.sh에 더한다 |
| 그 외 모든 gcloud 서비스(GCS·KMS·Pub/Sub 등) | OPT-OUT | not needed — Phase 1 범위 밖(증빙 GCS는 Phase 6, KMS는 Phase 10) |
