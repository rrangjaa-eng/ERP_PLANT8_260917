#!/usr/bin/env bash
set -euo pipefail
set -o errtrace  # ERR 트랩이 함수 안에서도 발동하도록(그렇지 않으면 STAGE 메시지가 나오지 않는다)

# scripts/deploy.sh — OPS-01: 인프라 ensure(멱등) → 이미지(SHA 태그) → Job 3개 →
# 0%(신규는 100%) 리비전 → 스모크 3종 → 경보 3개 upsert → 100% 승격.
# 프로젝트 ID·리전·이메일은 인자/환경에서만 온다(D-03) — 이 파일·infra/names.sh에
# 실제 프로젝트 번호·이메일 등 식별자를 절대 적지 않는다.
#
# 실패 시 stderr 마지막 줄이 항상 "deploy failed at <함수명>"이거나(트랩), 명시적
# 종료 경로(dirty tree·ProdImageMissing·PoolRuleViolation·SmokeFailed)의 메시지다.

STAGE=init
trap 'echo "deploy failed at $STAGE" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../infra/names.sh
source "$ROOT_DIR/infra/names.sh"

ENV=""
PROJECT=""
REGION=""
SHA=""
DOMAIN=""
ALLOW_DIRTY=0
DRY_RUN=0
IMAGE=""
PROJECT_NUMBER=""
SERVICE_URL=""
CONN_NAME=""
EXISTS=0
TAGGED_URL=""

usage() {
  cat >&2 <<'USAGE'
Usage: deploy.sh --env staging|prod --project ID [--region R] [--sha S] [--domain D] [--allow-dirty] [--dry-run]
USAGE
}

# --dry-run이면 실제 명령을 실행하지 않고 "+ …"만 출력한다.
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "+ $*"
    return 0
  fi
  "$@"
}

parse_args() {
  STAGE=parse_args
  while [ $# -gt 0 ]; do
    case "$1" in
      --env)
        ENV="${2:-}"
        shift 2
        ;;
      --project)
        PROJECT="${2:-}"
        shift 2
        ;;
      --region)
        REGION="${2:-}"
        shift 2
        ;;
      --sha)
        SHA="${2:-}"
        shift 2
        ;;
      --domain)
        DOMAIN="${2:-}"
        shift 2
        ;;
      --allow-dirty)
        ALLOW_DIRTY=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      *)
        echo "deploy.sh: unknown argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  if [ "$ENV" != "staging" ] && [ "$ENV" != "prod" ]; then
    echo "deploy.sh: --env must be staging or prod" >&2
    usage
    exit 2
  fi
  if [ -z "$PROJECT" ]; then
    echo "deploy.sh: --project is required" >&2
    usage
    exit 2
  fi
  if [ -z "${ALERT_EMAIL:-}" ]; then
    echo "deploy.sh: ALERT_EMAIL env var is required" >&2
    exit 2
  fi

  REGION="${REGION:-$REGION_DEFAULT}"
  if [ -z "$SHA" ]; then
    SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  fi
}

# 더티 트리(git status --porcelain 비어 있지 않음)에서는 gcloud 호출 전에 거부한다
# (Issue 4).
require_clean_tree() {
  STAGE=require_clean_tree
  if [ "$ALLOW_DIRTY" = "1" ]; then
    return 0
  fi
  local dirty
  dirty="$(git -C "$ROOT_DIR" status --porcelain)"
  if [ -n "$dirty" ]; then
    echo "refusing to deploy from a dirty tree" >&2
    exit 2
  fi
}

resolve_project_number() {
  STAGE=resolve_project_number
  PROJECT_NUMBER="$(run gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  SERVICE_URL="https://$(svc_name "$ENV")-${PROJECT_NUMBER}.${REGION}.run.app"
}

# 프로덕션은 절대 빌드하지 않는다(D-05) — 이미지가 없으면 다른 ensure 단계보다
# 앞에서 멈춘다.
require_prod_image() {
  STAGE=require_prod_image
  if [ "$ENV" != "prod" ]; then
    return 0
  fi
  IMAGE="$(image_path "$SHA" "$PROJECT" "$REGION")"
  if ! run gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" >/dev/null 2>&1; then
    echo "ProdImageMissing: image for $SHA not in Artifact Registry — production never builds; deploy this SHA to staging first (D-05)" >&2
    exit 1
  fi
}

ensure_apis() {
  STAGE=ensure_apis
  run gcloud services enable \
    run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
    artifactregistry.googleapis.com monitoring.googleapis.com logging.googleapis.com \
    compute.googleapis.com servicenetworking.googleapis.com \
    --project="$PROJECT"
}

ensure_ar_repo() {
  STAGE=ensure_ar_repo
  if ! run gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    run gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location="$REGION" --project="$PROJECT"
  fi
  # 멱등 — 정리 정책은 매번 다시 적용한다.
  run gcloud artifacts repositories set-cleanup-policies "$AR_REPO" \
    --location="$REGION" --project="$PROJECT" \
    --policy="$ROOT_DIR/infra/ar-cleanup-policy.json" --no-dry-run
}

ensure_network() {
  STAGE=ensure_network
  local peering
  peering="$(run gcloud services vpc-peerings list --network="$NETWORK" --service=servicenetworking.googleapis.com --project="$PROJECT")"
  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  if ! printf '%s\n' "$peering" | grep -qF "$VPC_RANGE"; then
    echo "private services access missing — run scripts/bootstrap-gcp.sh first" >&2
    exit 1
  fi
}

ensure_sql_instance() {
  STAGE=ensure_sql_instance
  local instance
  instance="$(sql_instance "$ENV")"

  if ! run gcloud sql instances describe "$instance" --project="$PROJECT" >/dev/null 2>&1; then
    # --storage-auto-increase-limit is beta-only in gcloud's stable track
    # (real staging deploy run, 2026-09-18) — this script already uses
    # `gcloud beta`/`gcloud alpha` elsewhere (monitoring), so match that.
    run gcloud beta sql instances create "$instance" \
      --project="$PROJECT" --region="$REGION" \
      --database-version="$DB_VERSION" --tier="$DB_TIER" --edition=ENTERPRISE \
      --storage-type=HDD --storage-size="$DB_STORAGE_GB" \
      --storage-auto-increase --storage-auto-increase-limit="$DB_STORAGE_LIMIT_GB" \
      --availability-type=ZONAL --backup --backup-start-time=18:00 --retained-backups-count=7 \
      --no-assign-ip --network="projects/$PROJECT/global/networks/$NETWORK" \
      --database-flags=cloudsql.iam_authentication=on --deletion-protection
  fi

  if [ "$DRY_RUN" != "1" ]; then
    local state=""
    local attempt
    for attempt in $(seq 1 90); do
      state="$(run gcloud sql instances describe "$instance" --project="$PROJECT" --format='value(state)')"
      if [ "$state" = "RUNNABLE" ]; then
        break
      fi
      sleep 10
    done
  fi

  CONN_NAME="$(run gcloud sql instances describe "$instance" --project="$PROJECT" --format='value(connectionName)')"
}

ensure_sql_db_users() {
  STAGE=ensure_sql_db_users
  local instance
  instance="$(sql_instance "$ENV")"

  if ! run gcloud sql databases describe "$DB_NAME" --instance="$instance" --project="$PROJECT" >/dev/null 2>&1; then
    run gcloud sql databases create "$DB_NAME" --instance="$instance" --project="$PROJECT"
  fi

  local iam_user
  iam_user="$(runtime_sa "$ENV")@${PROJECT}.iam"
  local existing_users
  existing_users="$(run gcloud sql users list --instance="$instance" --project="$PROJECT" --format='value(name)')"
  if ! printf '%s\n' "$existing_users" | grep -qF "$iam_user"; then
    run gcloud sql users create "$iam_user" --instance="$instance" --project="$PROJECT" --type=cloud_iam_service_account
  fi

  local admin_secret
  admin_secret="$(secret_name db-admin-password "$ENV")"
  local has_version
  has_version="$(run gcloud secrets versions list --secret="$admin_secret" --project="$PROJECT" --filter='state:ENABLED' --format='value(name)' 2>/dev/null || true)"
  if [ -z "$has_version" ]; then
    if ! run gcloud secrets describe "$admin_secret" --project="$PROJECT" >/dev/null 2>&1; then
      run gcloud secrets create "$admin_secret" --replication-policy=user-managed --locations="$REGION" --project="$PROJECT"
    fi
    local admin_password
    admin_password="$(openssl rand -base64 32)"
    printf '%s' "$admin_password" | run gcloud secrets versions add "$admin_secret" --project="$PROJECT" --data-file=-
    # 값은 로그·trace에 절대 남기지 않는다(디버그 트레이스 플래그를 켜지 않는다).
    run gcloud sql users set-password postgres --instance="$instance" --project="$PROJECT" --password="$admin_password"
  fi
}

_ensure_secret() {
  local base="$1" seed_bytes="$2"
  local name
  name="$(secret_name "$base" "$ENV")"
  if ! run gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    run gcloud secrets create "$name" --replication-policy=user-managed --locations="$REGION" --project="$PROJECT"
  fi
  local has_version
  has_version="$(run gcloud secrets versions list --secret="$name" --project="$PROJECT" --filter='state:ENABLED' --format='value(name)' 2>/dev/null || true)"
  if [ -z "$has_version" ]; then
    if [ "$seed_bytes" = "sentinel" ]; then
      printf '__unset__' | run gcloud secrets versions add "$name" --project="$PROJECT" --data-file=-
    else
      openssl rand -base64 "$seed_bytes" | run gcloud secrets versions add "$name" --project="$PROJECT" --data-file=-
    fi
  fi
  local runtime_email
  runtime_email="$(runtime_sa "$ENV")@${PROJECT}.iam.gserviceaccount.com"
  run gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT" \
    --member="serviceAccount:${runtime_email}" --role=roles/secretmanager.secretAccessor
}

ensure_secrets() {
  STAGE=ensure_secrets
  _ensure_secret better-auth-secret 48
  _ensure_secret app-data-key-v1 48
  _ensure_secret smtp-host sentinel
  _ensure_secret smtp-user sentinel
  _ensure_secret smtp-password sentinel
  _ensure_secret smtp-from sentinel

  local runtime_email
  runtime_email="$(runtime_sa "$ENV")@${PROJECT}.iam.gserviceaccount.com"
  run gcloud secrets add-iam-policy-binding "$(secret_name db-admin-password "$ENV")" --project="$PROJECT" \
    --member="serviceAccount:${runtime_email}" --role=roles/secretmanager.secretAccessor
}

# D-05 빌드 1회: prod는 require_prod_image가 이미 존재를 보장했으므로 이 describe는
# 항상 성공해 건너뛴다.
build_and_push_image() {
  STAGE=build_and_push_image
  IMAGE="$(image_path "$SHA" "$PROJECT" "$REGION")"
  if run gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" >/dev/null 2>&1; then
    return 0
  fi
  run gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  run docker build --build-arg GIT_SHA="$SHA" -t "$IMAGE" "$ROOT_DIR"
  run docker push "$IMAGE"
}

# 세 Job 모두 lib/env.ts의 비로컬 refine(BETTER_AUTH_SECRET·BETTER_AUTH_URL)을
# 만족해야 한다(01-01 계약). DB_ADMIN_PASSWORD는 db-bootstrap에만(T-1-27).
deploy_jobs() {
  STAGE=deploy_jobs
  local runtime_email
  runtime_email="$(runtime_sa "$ENV")@${PROJECT}.iam.gserviceaccount.com"
  local iam_user
  iam_user="$(runtime_sa "$ENV")@${PROJECT}.iam"
  local better_auth_secret
  better_auth_secret="$(secret_name better-auth-secret "$ENV")"
  local db_admin_secret
  db_admin_secret="$(secret_name db-admin-password "$ENV")"
  local common_env="APP_ENV=${ENV},BETTER_AUTH_URL=${SERVICE_URL},CLOUD_SQL_CONNECTION_NAME=${CONN_NAME},DB_IAM_USER=${iam_user},DB_NAME=${DB_NAME}"

  local job_common=(
    --image="$IMAGE" --region="$REGION" --project="$PROJECT"
    --service-account="$runtime_email"
    --network="$NETWORK" --subnet="$NETWORK" --vpc-egress=private-ranges-only
    --set-cloudsql-instances="$CONN_NAME"
    --max-retries=0 --task-timeout=15m
  )

  run gcloud run jobs deploy "$(job_name "$ENV" db-bootstrap)" \
    "${job_common[@]}" \
    --command=node --args=dist/cli/db-bootstrap.mjs \
    --set-env-vars="$common_env" \
    --set-secrets="BETTER_AUTH_SECRET=${better_auth_secret}:latest,DB_ADMIN_PASSWORD=${db_admin_secret}:latest"

  run gcloud run jobs deploy "$(job_name "$ENV" migrate)" \
    "${job_common[@]}" \
    --command=node --args=dist/cli/migrate-runner.mjs \
    --set-env-vars="${common_env},MAX_INSTANCES=${MAX_INSTANCES},DB_POOL_MAX=${DB_POOL_MAX}" \
    --set-secrets="BETTER_AUTH_SECRET=${better_auth_secret}:latest"

  # account Job만 스크립트 경로를 --command 둘째 항목에 둔다 — account.yml의
  # `execute --args=<action>,...`가 배포 시 args를 대체하기 때문(Eng OV-1).
  run gcloud run jobs deploy "$(job_name "$ENV" account)" \
    "${job_common[@]}" \
    --command=node,dist/cli/account-cli.mjs \
    --set-env-vars="$common_env" \
    --set-secrets="BETTER_AUTH_SECRET=${better_auth_secret}:latest"
}

run_db_bootstrap() {
  STAGE=run_db_bootstrap
  if ! run gcloud run jobs execute "$(job_name "$ENV" db-bootstrap)" --region="$REGION" --project="$PROJECT" --wait; then
    echo "db-bootstrap failed" >&2
    # gcloud는 컨테이너 실패 이유를 전파하지 않는다(16A와 같은 이유) — 실제
    # 에러 메시지는 Cloud Logging에서 가져와야 진단할 수 있다.
    run gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$(job_name "$ENV" db-bootstrap)\" AND severity>=ERROR" \
      --project="$PROJECT" --freshness=10m --limit=20 --format='value(textPayload, jsonPayload.message)' >&2 || true
    exit 1
  fi
}

# 실제 gcloud는 컨테이너 exit 3을 전파하지 않고 exit 1만 돌려준다 — 로그 조회로
# 원인을 구분한다(16A).
run_migrate() {
  STAGE=run_migrate
  if ! run gcloud run jobs execute "$(job_name "$ENV" migrate)" --region="$REGION" --project="$PROJECT" --wait; then
    local logs
    logs="$(run gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$(job_name "$ENV" migrate)\" AND jsonPayload.event=\"deploy.pool_rule_violation\"" --project="$PROJECT" --freshness=10m --limit=5 || true)"
    if printf '%s' "$logs" | grep -q 'deploy.pool_rule_violation'; then
      echo "PoolRuleViolation: max_instances × pool exceeds max_connections − 5" >&2
    else
      echo "migration failed" >&2
    fi
    exit 1
  fi
}

deploy_service() {
  STAGE=deploy_service
  local svc
  svc="$(svc_name "$ENV")"
  local runtime_email
  runtime_email="$(runtime_sa "$ENV")@${PROJECT}.iam.gserviceaccount.com"
  local iam_user
  iam_user="$(runtime_sa "$ENV")@${PROJECT}.iam"
  local instance
  instance="$(sql_instance "$ENV")"
  local better_auth_secret app_data_key_secret smtp_host_secret smtp_user_secret smtp_password_secret smtp_from_secret
  better_auth_secret="$(secret_name better-auth-secret "$ENV")"
  app_data_key_secret="$(secret_name app-data-key-v1 "$ENV")"
  smtp_host_secret="$(secret_name smtp-host "$ENV")"
  smtp_user_secret="$(secret_name smtp-user "$ENV")"
  smtp_password_secret="$(secret_name smtp-password "$ENV")"
  smtp_from_secret="$(secret_name smtp-from "$ENV")"

  EXISTS=0
  if run gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    EXISTS=1
  fi

  local deployed_at
  deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local env_vars="APP_ENV=${ENV},APP_GIT_SHA=${SHA},APP_DEPLOYED_AT=${deployed_at},CLOUD_SQL_CONNECTION_NAME=${CONN_NAME},DB_IAM_USER=${iam_user},DB_NAME=${DB_NAME},DB_POOL_MAX=${DB_POOL_MAX},BETTER_AUTH_URL=${SERVICE_URL},AUTH_PROVIDER=email,GCP_PROJECT_ID=${PROJECT},CLOUD_SQL_INSTANCE_ID=${instance}"
  local secrets="BETTER_AUTH_SECRET=${better_auth_secret}:latest,APP_DATA_KEY_v1=${app_data_key_secret}:latest,SMTP_HOST=${smtp_host_secret}:latest,SMTP_USER=${smtp_user_secret}:latest,SMTP_PASSWORD=${smtp_password_secret}:latest,SMTP_FROM=${smtp_from_secret}:latest"

  local extra_flags=()
  if [ "$EXISTS" = "1" ]; then
    extra_flags+=(--no-traffic "--tag=rev-${SHA:0:8}")
  fi

  local deploy_output
  if ! deploy_output="$(run gcloud run deploy "$svc" \
    --image="$IMAGE" --region="$REGION" --project="$PROJECT" --platform=managed \
    --service-account="$runtime_email" \
    --min-instances=0 --max-instances="$MAX_INSTANCES" --concurrency=80 --cpu=1 --memory=512Mi --port=3000 \
    --network="$NETWORK" --subnet="$NETWORK" --vpc-egress=private-ranges-only \
    --set-cloudsql-instances="$CONN_NAME" \
    --allow-unauthenticated \
    --set-env-vars="$env_vars" \
    --set-secrets="$secrets" \
    "${extra_flags[@]}" 2>&1)"; then
    printf '%s\n' "$deploy_output" >&2
    echo "org policy blocks unauthenticated ingress (iam.allowedPolicyMemberDomains) — ask the GCP org admin" >&2
    exit 1
  fi
  printf '%s\n' "$deploy_output"

  # 카나리 배포(EXISTS=1)는 gcloud가 배포 출력 자체에 태그 리비전의 실제
  # 도달 가능 URL을 알려준다("The revision can be reached directly at …") —
  # 계산한 결정적 URL 패턴을 다시 조립해 추측하지 않고 이 실측값을 그대로
  # 쓴다(실제 스테이징 배포에서 재현, 2026-09-18: 계산값으로 스모크하면
  # 404). 트래픽은 여전히 0%로 남아있으므로(--no-traffic) 안전하다.
  if [ "$EXISTS" = "1" ]; then
    TAGGED_URL="$(printf '%s\n' "$deploy_output" | grep -oE 'https://rev-[A-Za-z0-9.-]+' | head -1 || true)"
    if [ -z "$TAGGED_URL" ] && [ "$DRY_RUN" != "1" ]; then
      echo "could not find tagged revision URL in gcloud run deploy output" >&2
      exit 1
    fi
  fi

  local describe_url
  describe_url="$(run gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" --format='value(status.url)')"
  if [ "$describe_url" != "$SERVICE_URL" ]; then
    echo "note: describe url differs ($describe_url); canonical is $SERVICE_URL" >&2
    # 실제 스테이징 첫 배포에서 재현(2026-09-18): 계산한 결정적 URL이 실제
    # Cloud Run이 부여한 URL과 다른 경우가 있다([ASSUMED] 항목 검증 실패).
    # 새 서비스(EXISTS=0)는 아직 트래픽이 없으므로 실측 URL로 바로잡아도
    # 안전하다 — 이후 스모크·최종 출력이 계산값이 아니라 실측값을 쓰게
    # 하고, 컨테이너에 이미 구운 BETTER_AUTH_URL도 맞춰야 better-auth의
    # origin 검사(baseURL 기준)가 통과한다. 기존 서비스 카나리 배포
    # (EXISTS=1)는 이 보정을 하지 않는다 — `services update`가 기본으로
    # 새 리비전에 트래픽 100%를 즉시 넘겨 0%→스모크→100% 안전장치를
    # 깨기 때문이다(이 경로는 아직 실측으로 확인된 바 없다).
    if [ "$EXISTS" = "0" ]; then
      SERVICE_URL="$describe_url"
      run gcloud run services update "$svc" --region="$REGION" --project="$PROJECT" \
        --update-env-vars="BETTER_AUTH_URL=${SERVICE_URL}"
    fi
  fi
}

# GET만으로는 잡히지 않는 "화면은 뜨는데 로그인만 안 됨"을 배포 시점에 잡는다.
smoke() {
  STAGE=smoke
  local target
  if [ "$EXISTS" = "1" ]; then
    target="$TAGGED_URL"
  else
    target="$SERVICE_URL"
  fi

  if [ "$DRY_RUN" = "1" ]; then
    run curl -fsS --retry 30 --retry-delay 10 --retry-all-errors "${target}/healthz"
    run curl -s -o /dev/null -w '%{http_code}' "${target}/login"
    run curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H "Origin: ${SERVICE_URL}" -H 'content-type: application/json' \
      -d '{"email":"smoke@example.invalid","password":"smoke-not-a-password"}' \
      "${target}/api/auth/sign-in/email"
    return 0
  fi

  if ! run curl -fsS --retry 30 --retry-delay 10 --retry-all-errors "${target}/healthz" | grep -q '"ok":true'; then
    echo "SmokeFailed: traffic left unchanged" >&2
    exit 1
  fi

  local login_code
  login_code="$(run curl -s -o /dev/null -w '%{http_code}' "${target}/login")"
  if [ "$login_code" != "200" ]; then
    echo "SmokeFailed: traffic left unchanged" >&2
    exit 1
  fi

  local signin_code
  signin_code="$(run curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Origin: ${SERVICE_URL}" -H 'content-type: application/json' \
    -d '{"email":"smoke@example.invalid","password":"smoke-not-a-password"}' \
    "${target}/api/auth/sign-in/email")"

  if [ "$signin_code" = "403" ]; then
    echo "SmokeFailed(origin): BETTER_AUTH_URL does not match the served origin" >&2
    exit 1
  fi
  case "$signin_code" in
    4*) : ;;
    *)
      echo "SmokeFailed: traffic left unchanged" >&2
      exit 1
      ;;
  esac
}

# 스모크 뒤·승격 앞 — 경보 upsert가 실패하면 트래픽을 옮기기 전에 멈춘다(Eng OV-8).
ensure_alerts() {
  STAGE=ensure_alerts
  local channel_display
  channel_display="$(alert_channel "$ENV")"
  local channel_name
  channel_name="$(run gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName='${channel_display}'" --format='value(name)')"
  if [ -z "$channel_name" ]; then
    run gcloud beta monitoring channels create --project="$PROJECT" --display-name="$channel_display" --type=email --channel-labels="email_address=${ALERT_EMAIL}"
    channel_name="$(run gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName='${channel_display}'" --format='value(name)')"
  fi

  local metric
  metric="$(tick_metric "$ENV")"
  if ! run gcloud logging metrics describe "$metric" --project="$PROJECT" >/dev/null 2>&1; then
    run gcloud logging metrics create "$metric" \
      --project="$PROJECT" \
      --description="notify tick success for ${ENV}" \
      --log-filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$(svc_name "$ENV")\" AND jsonPayload.event=\"notify.tick\" AND jsonPayload.ok=true"
  fi

  local instance
  instance="$(sql_instance "$ENV")"
  _upsert_policy "$(policy_5xx "$ENV")" "$ROOT_DIR/infra/monitoring/5xx-ratio.json.tpl" "$channel_name" "$metric" "$instance"
  _upsert_policy "$(policy_backup "$ENV")" "$ROOT_DIR/infra/monitoring/backup-failed.json.tpl" "$channel_name" "$metric" "$instance"
  _upsert_policy "$(policy_tick "$ENV")" "$ROOT_DIR/infra/monitoring/tick-stale.json.tpl" "$channel_name" "$metric" "$instance"
}

_upsert_policy() {
  local display_name="$1" template="$2" channel_name="$3" metric="$4" instance="$5"
  local existing
  existing="$(run gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName='${display_name}'" --format='value(name)')"
  local tmpfile
  tmpfile="$(mktemp)"
  sed \
    -e "s|__ENV__|${ENV}|g" \
    -e "s|__CHANNEL__|${channel_name}|g" \
    -e "s|__SERVICE__|$(svc_name "$ENV")|g" \
    -e "s|__PROJECT__|${PROJECT}|g" \
    -e "s|__INSTANCE__|${instance}|g" \
    -e "s|__METRIC__|${metric}|g" \
    "$template" >"$tmpfile"
  if [ -n "$existing" ]; then
    run gcloud alpha monitoring policies update "$existing" --project="$PROJECT" --policy-from-file="$tmpfile"
  else
    run gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$tmpfile"
  fi
  rm -f "$tmpfile"
}

promote() {
  STAGE=promote
  if [ "$EXISTS" = "1" ]; then
    run gcloud run services update-traffic "$(svc_name "$ENV")" --region="$REGION" --project="$PROJECT" --to-latest
  fi
}

# Phase 1은 자리만 — 도메인 매핑 gcloud 명령은 호출하지 않는다(D-15). 리전 지원
# 확인(A1)은 scripts/bootstrap-gcp.sh 몫이다.
map_domain() {
  STAGE=map_domain
  if [ -n "$DOMAIN" ]; then
    echo "--domain $DOMAIN accepted but deferred: custom domain mapping is Phase 2~3 (D-15); region support is checked by scripts/bootstrap-gcp.sh" >&2
  fi
}

main() {
  parse_args "$@"
  require_clean_tree
  resolve_project_number
  require_prod_image
  ensure_apis
  ensure_ar_repo
  ensure_network
  ensure_sql_instance
  ensure_sql_db_users
  ensure_secrets
  build_and_push_image
  deploy_jobs
  run_db_bootstrap
  run_migrate
  deploy_service
  smoke
  ensure_alerts
  promote
  map_domain

  echo "SERVICE_URL=$SERVICE_URL"
}

main "$@"
