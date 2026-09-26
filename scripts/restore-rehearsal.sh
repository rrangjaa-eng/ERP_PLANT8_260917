#!/usr/bin/env bash
# scripts/restore-rehearsal.sh — D8-08 복원 리허설. restore-rehearsal.yml이 부른다.
#
#   rehearse  원본의 최신 성공 자동 백업을 임시 인스턴스 plant8-<env>-rehearsal-<실행 id>-<시도>에
#             복원하고 plant8-<env>-restore Job의 verify로 확인한다. 끝나면(EXIT trap) 임시를 지운다.
#             결과는 기록하지 않는다.
#   finalize  마지막 정리 뒤 상태 파일로 결과를 정하고 같은 Job의 record로 그 환경 DB에 한 번 남긴다.
#
# 원본은 조회(백업 목록 · 디스크 크기)와 --backup-instance로만 나온다. 변경 명령의 대상은
# 임시 이름 하나뿐이다(C2).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../infra/names.sh
source "$SCRIPT_DIR/../infra/names.sh"

: "${GITHUB_STEP_SUMMARY:=/dev/null}"

# ── 공통 준비 ───────────────────────────────────────────────────────────────
prepare() {
  case "${INPUT_ENV:-}" in
    staging) ENV_SHORT=staging ;;
    production) ENV_SHORT=prod ;;
  esac
  RUN_ID="${GITHUB_RUN_ID:-}"
  ATTEMPT="${GITHUB_RUN_ATTEMPT:-}"
  RUN_KEY="$RUN_ID-$ATTEMPT"
  SOURCE="$(sql_instance "$ENV_SHORT")"
  TEMP="plant8-$ENV_SHORT-rehearsal-$RUN_ID-$ATTEMPT"
  JOB="$(job_name "$ENV_SHORT" restore)"
  STATE_FILE="$RUNNER_TEMP/restore-rehearsal-$RUN_KEY.state"
}

# ── 상태 파일(key=value 줄 — source하지 않고 줄 단위로 읽는다) ───────────────────
state_get() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" | tail -n 1 | cut -d= -f2- || true
}

state_set() {
  local tmp="$STATE_FILE.tmp"
  if [ -f "$STATE_FILE" ]; then
    grep -v "^$1=" "$STATE_FILE" >"$tmp" || true
  else
    : >"$tmp"
  fi
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  mv "$tmp" "$STATE_FILE"
}

now() { date +%s; }
iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

gc() { gcloud "$@"; }

# ── 이미지 ─────────────────────────────────────────────────────────────────
job_image_ref() {
  gc run jobs describe "$JOB" --region="$REGION" --project="$PROJECT" \
    --format='value(spec.template.spec.template.spec.containers[0].image)'
}

exec_image_ref() {
  gc run jobs executions describe "$1" --region="$REGION" --project="$PROJECT" \
    --format='value(spec.template.spec.containers[0].image)'
}

image_digest() {
  gc artifacts docker images describe "$1" --format='value(image_summary.digest)'
}

# ── Cloud SQL ──────────────────────────────────────────────────────────────
wait_runnable() {
  local state
  for _ in $(seq 1 90); do
    state="$(gc sql instances describe "$TEMP" --project="$PROJECT" --format='value(state)')"
    if [ "$state" = "RUNNABLE" ]; then
      return 0
    fi
    sleep 10
  done
  return 1
}

wait_pending_ops() {
  local ops op
  ops="$(gc sql operations list --instance="$TEMP" --project="$PROJECT" --filter="status!=DONE" --format='value(name)')"
  for op in $ops; do
    gc sql operations wait "$op" --project="$PROJECT" --timeout=600
  done
}

cleanup_temp() {
  local listed
  listed="$(gc sql instances list --project="$PROJECT" --filter="name=$TEMP" --format='value(name)')"
  if [ -n "$listed" ]; then
    wait_pending_ops
    gc sql instances delete "$TEMP" --project="$PROJECT" --async --quiet >/dev/null
    wait_pending_ops
    listed="$(gc sql instances list --project="$PROJECT" --filter="name=$TEMP" --format='value(name)')"
  fi
  if [ -z "$listed" ]; then
    state_set CLEANUP absent
  fi
}

poll_logs() {
  gc logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND labels.\"run.googleapis.com/execution_name\"=\"$1\"" \
    --project="$PROJECT" --freshness=1h --limit=30 --format='value(textPayload)'
}

# ── rehearse ───────────────────────────────────────────────────────────────
on_exit() {
  local rc=$?
  trap - EXIT
  set +e
  cleanup_temp
  exit "$rc"
}

cmd_rehearse() {
  prepare
  : >"$STATE_FILE"
  state_set STARTED_AT "$(iso_now)"
  state_set STARTED_EPOCH "$(now)"
  state_set STAGE started
  trap on_exit EXIT

  # 기준선 — 배포 겹침 감지의 비교 기준(첫 gcloud 호출)
  local image digest
  image="$(job_image_ref)"
  digest="$(image_digest "$image")"
  state_set IMAGE "$image"
  state_set DIGEST "$digest"

  # 고아 점검
  gc sql instances list --project="$PROJECT" --filter="name~^plant8-$ENV_SHORT-rehearsal-" --format='value(name)' >/dev/null

  state_set STAGE restore
  local backup_id disk
  backup_id="$(gc sql backups list --instance="$SOURCE" --project="$PROJECT" \
    --filter="type=AUTOMATED AND status=SUCCESSFUL" --sort-by=~startTime --limit=1 --format='value(id)')"
  state_set BACKUP_ID "$backup_id"
  disk="$(gc sql instances describe "$SOURCE" --project="$PROJECT" --format='value(settings.dataDiskSizeGb)')"

  gc sql instances create "$TEMP" --project="$PROJECT" --region="$REGION" \
    --database-version="$DB_VERSION" --tier="$DB_TIER" --edition=ENTERPRISE \
    --storage-type=HDD --storage-size="$disk" --availability-type=ZONAL --no-backup \
    --no-assign-ip --network="projects/$PROJECT/global/networks/$NETWORK" \
    --database-flags=cloudsql.iam_authentication=on
  wait_runnable
  gc sql backups restore "$backup_id" --restore-instance="$TEMP" --backup-instance="$SOURCE" \
    --project="$PROJECT" --quiet
  wait_runnable

  local iam_user users conn
  iam_user="$(runtime_sa "$ENV_SHORT")@${PROJECT}.iam"
  users="$(gc sql users list --instance="$TEMP" --project="$PROJECT" --format='value(name)')"
  if ! printf '%s\n' "$users" | grep -qxF "$iam_user"; then
    gc sql users create "$iam_user" --instance="$TEMP" --project="$PROJECT" --type=cloud_iam_service_account
  fi
  conn="$(gc sql instances describe "$TEMP" --project="$PROJECT" --format='value(connectionName)')"

  state_set STAGE verify
  local exec_name
  exec_name="$(gc run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --args="verify,--target,$conn" --update-env-vars="CLOUD_SQL_CONNECTION_NAME=$conn" \
    --wait --format='value(metadata.name)')"
  poll_logs "$exec_name"
  state_set STAGE verified

  local verify_image
  verify_image="$(exec_image_ref "$exec_name")"
  state_set VERIFY_DIGEST "$(image_digest "$verify_image")"
}

# ── finalize ───────────────────────────────────────────────────────────────
cmd_finalize() {
  prepare
  cleanup_temp

  local image digest pre_image pre_digest outcome
  image="$(state_get IMAGE)"
  digest="$(state_get DIGEST)"
  pre_image="$(job_image_ref)"
  pre_digest="$(image_digest "$pre_image")"

  outcome=restore
  if [ "$(state_get STAGE)" = verified ] && [ "$(state_get CLEANUP)" = absent ] &&
    [ "$(state_get VERIFY_DIGEST)" = "$digest" ] && [ "$pre_digest" = "$digest" ]; then
    outcome=success
  fi

  local args backup_id rec_exec
  backup_id="$(state_get BACKUP_ID)"
  if [ "$outcome" = success ]; then
    args="--succeeded,true"
  else
    args="--succeeded,false,--failed-stage,$outcome"
  fi
  if [ -n "$backup_id" ]; then
    args="$args,--backup-id,$backup_id"
  fi
  args="$args,--started-at,$(state_get STARTED_AT),--finished-at,$(iso_now)"
  args="$args,--run-url,${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID},--run-key,$RUN_KEY"

  rec_exec="$(gc run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --args=record,"$args" --wait --format='value(metadata.name)')"
  state_set RECORDED 1
  state_set STORED_OUTCOME "$outcome"
  state_set RECORD_EXEC "$rec_exec"

  local post=unknown rec_digest
  rec_digest="$(image_digest "$(exec_image_ref "$rec_exec")")"
  if [ "$rec_digest" = "$digest" ]; then
    post=ok
  fi
  state_set POST_RECORD "$post"

  local remaining_list count
  remaining_list="$(gc sql instances list --project="$PROJECT" --filter="name~^plant8-$ENV_SHORT-rehearsal-" --format='value(name)')"
  count="$(printf '%s' "$remaining_list" | grep -c . || true)"

  local started_epoch minutes
  started_epoch="$(state_get STARTED_EPOCH)"
  minutes="$(( ($(now) - started_epoch) / 60 ))"

  {
    echo "## 복원 리허설 ($ENV_SHORT)"
    echo ""
    echo "- 기록된 결과: 성공"
    echo "- 원본: $SOURCE"
    echo "- 백업 id: $backup_id"
    echo "- 임시 인스턴스: $TEMP"
    echo "- 소요: ${minutes}분"
    echo "- 남은 임시 인스턴스 $count"
    echo "- 이미지 $image@$digest"
    echo "- 기록했습니다."
  } >>"$GITHUB_STEP_SUMMARY"

  if [ "$outcome" = success ] && [ "$post" = ok ]; then
    exit 0
  fi
  exit 1
}

case "${1:-}" in
  rehearse) cmd_rehearse ;;
  finalize) cmd_finalize ;;
  *)
    echo "사용법: restore-rehearsal.sh <rehearse|finalize>" >&2
    exit 2
    ;;
esac
