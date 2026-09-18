# infra/names.sh — GCP 리소스 이름 규칙과 상수. `source`로만 쓴다(직접 실행 금지).
#
# 접두어는 순수 `plant8-`다(사용자 결정, 2026-09-18 — 옵션 A "erp-", 옵션 B
# "plant8-erp-" 대신). 서비스·Cloud SQL 인스턴스·SA·Artifact Registry는 결정에
# 명시된 그대로이고, Job 이름도 같은 앱 리소스 계열이라 같은 접두어로 통일했다
# (STATE.md 결정은 "concretely" 예시 5개만 나열했지만, Cloud Run Job은 서비스와
# 같은 Cloud Run 리소스 카테고리라 접두어를 섞으면 오히려 혼란스럽다 — 이 판단은
# 실행 결정으로 SUMMARY.md에 기록한다).
# WIF_POOL·WIF_PROVIDER·DEPLOYER_SA는 사용자 결정 목록에 없는 정체성 연동 식별자라
# 플랜 <interfaces>가 준 값을 그대로 둔다(erp-repo는 리소스 접두어가 아니라
# Workload Identity Pool의 provider ID일 뿐이다).

REGION_DEFAULT=asia-northeast3
AR_REPO=plant8
DB_NAME=plant8
DB_TIER=db-f1-micro
DB_VERSION=POSTGRES_16
DB_STORAGE_GB=10
DB_STORAGE_LIMIT_GB=20   # 자동 증가 상한 — 디스크 참(읽기 전용 전환)과 비용 폭주 사이의 타협(플랜 리뷰 CEO OV-6)
MAX_INSTANCES=3
DB_POOL_MAX=5
NETWORK=default
VPC_RANGE=google-managed-services-default
WIF_POOL=github
WIF_PROVIDER=erp-repo
DEPLOYER_SA=gha-deployer

svc_name()        { echo "plant8-$1"; }              # plant8-staging / plant8-prod
sql_instance()    { echo "plant8-$1-db"; }
runtime_sa()      { echo "plant8-$1-runtime"; }      # 이메일: plant8-$1-runtime@$PROJECT.iam.gserviceaccount.com, IAM DB user: plant8-$1-runtime@$PROJECT.iam
job_name()        { echo "plant8-$1-$2"; }           # $2 ∈ migrate | db-bootstrap | account
secret_name()     { echo "$1-$2"; }                  # base-env: better-auth-secret-staging, app-data-key-v1-staging, db-admin-password-staging, smtp-host-staging …
image_path()      { echo "$3-docker.pkg.dev/$2/$AR_REPO/app:$1"; }   # sha project region
alert_channel()   { echo "ERP Alerts ($1)"; }
policy_5xx()      { echo "[$1] 5xx ratio > 5%"; }
policy_backup()   { echo "[$1] Cloud SQL backup failed"; }
policy_tick()     { echo "[$1] notify tick stale 23h30m"; }
tick_metric()     { echo "notify_tick_success_$1"; }
