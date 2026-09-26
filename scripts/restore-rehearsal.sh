#!/usr/bin/env bash
# scripts/restore-rehearsal.sh — D8-08 복원 리허설. restore-rehearsal.yml이 부른다.
#
#   guard <이름>  임시 인스턴스 이름 가드만(gcloud를 부르지 않는다)
#   rehearse      원본의 최신 성공 자동 백업을 임시 인스턴스 plant8-<env>-rehearsal-<실행 id>-<시도>에
#                 복원하고 plant8-<env>-restore Job의 verify로 확인한다. 끝나면(EXIT trap) 임시를 지운다.
#                 결과는 기록하지 않는다.
#   finalize      마지막 정리 뒤 상태 파일로 결과를 정하고 같은 Job의 record로 그 환경 DB에 한 번 남긴다.
#
# 원본은 조회(백업 목록 · 디스크 크기)와 --backup-instance로만 나온다. 변경 명령의 대상은
# 임시 이름 하나뿐이다(C2). 모든 gcloud는 gc() 하나로 부르고, 하위 명령마다 정한 마감 하나까지
# 남은 시간으로 자른다 — 남은 시간이 0 이하면 부르지 않는다(timeout 0은 제한을 끈다).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../infra/names.sh
source "$SCRIPT_DIR/../infra/names.sh"

REHEARSE_BUDGET_SEC=3420 # 57분 < rehearse 단계 60분
FINALIZE_BUDGET_SEC=2280 # 38분 < finalize 단계 40분 = 정리 몫 ≤ 20분 + record 예비 + 요약 예비
RECORD_RESERVE_SEC=1020  # record Job --task-timeout=15m(scripts/deploy.sh) + 시작·대기 2분
SUMMARY_RESERVE_SEC=60

REHEARSAL_NAME_RE='^plant8-(staging|prod)-rehearsal-[0-9]+-[0-9]+$'
DEPLOY_OVERLAP="배포가 겹쳐 실패로 남김 — 다시 돌리면 됩니다"

: "${GITHUB_STEP_SUMMARY:=/dev/null}"
DEADLINE=0

fail() {
  echo "$*" >&2
  exit 1
}

# ── 공통 준비(rehearse · finalize가 첫 gcloud 전에 똑같이 거친다) ──────────────
map_env() {
  case "${INPUT_ENV:-}" in
    staging) ENV_SHORT=staging ;;
    production) ENV_SHORT=prod ;;
    *)
      echo "INPUT_ENV는 staging 또는 production이어야 합니다." >&2
      exit 2
      ;;
  esac
  SOURCE="$(sql_instance "$ENV_SHORT")"
}

guard_name() {
  local name="$1"
  if ! [[ "$name" =~ $REHEARSAL_NAME_RE ]]; then
    echo "임시 인스턴스 이름 규칙에 맞지 않아 멈췄습니다: $name" >&2
    return 3
  fi
  case "$name" in
    "plant8-$ENV_SHORT-rehearsal-"*) ;;
    *)
      echo "임시 인스턴스의 환경 접두가 달라 멈췄습니다: $name" >&2
      return 3
      ;;
  esac
  if [ "$name" = "plant8-staging-db" ] || [ "$name" = "plant8-prod-db" ] || [ "$name" = "$SOURCE" ]; then
    echo "운영 인스턴스 이름은 임시로 쓸 수 없어 멈췄습니다: $name" >&2
    return 3
  fi
}

prepare() {
  map_env
  RUN_ID="${GITHUB_RUN_ID:-}"
  ATTEMPT="${GITHUB_RUN_ATTEMPT:-}"
  if ! [[ "$RUN_ID" =~ ^[0-9]+$ && "$ATTEMPT" =~ ^[0-9]+$ ]]; then
    echo "GITHUB_RUN_ID·GITHUB_RUN_ATTEMPT가 숫자가 아니어서 멈췄습니다." >&2
    exit 2
  fi
  RUN_KEY="$RUN_ID-$ATTEMPT"
  TEMP="plant8-$ENV_SHORT-rehearsal-$RUN_ID-$ATTEMPT"
  guard_name "$TEMP" || exit 3
  if [ "$ENV_SHORT" = "prod" ] && [ "${CONFIRM_PRODUCTION:-}" != "plant8-prod-db" ]; then
    echo "production은 confirm_production에 plant8-prod-db를 그대로 적어야 돕니다." >&2
    exit 3
  fi
  if [ -z "${PROJECT:-}" ] || [ -z "${REGION:-}" ] || [ -z "${RUNNER_TEMP:-}" ]; then
    echo "PROJECT·REGION·RUNNER_TEMP가 필요합니다." >&2
    exit 2
  fi
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

# ── 시간 ───────────────────────────────────────────────────────────────────
now() { date +%s; }
iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# 마감까지 남은 초(예비를 뺀 값). 0 이하도 자르지 않고 그대로 돌려준다.
remaining() { echo $((DEADLINE - $1 - $(now))); }

# 모든 gcloud 호출: gc <예비 초> <gcloud 인자…>
gc() {
  local reserve="$1" left
  shift
  left="$(remaining "$reserve")"
  if [ "$left" -le 0 ]; then
    echo "마감을 넘겨 부르지 않았습니다: gcloud $1 $2 ${3:-}" >&2
    return 124
  fi
  timeout "$left" gcloud "$@"
}

# ── 이미지 ─────────────────────────────────────────────────────────────────
# Job 지금 이미지: "<참조> <digest>" 한 줄(못 읽으면 실패)
job_image() {
  local ref digest
  ref="$(gc "$1" run jobs describe "$JOB" --region="$REGION" --project="$PROJECT" \
    --format='value(spec.template.spec.template.spec.containers[0].image)')" && [ -n "$ref" ] || return 1
  digest="$(gc "$1" artifacts docker images describe "$ref" --format='value(image_summary.digest)')" &&
    [ -n "$digest" ] || return 1
  printf '%s %s\n' "$ref" "$digest"
}

# 그 실행이 실제로 쓴 이미지의 digest(못 읽으면 실패)
exec_digest() {
  local ref digest
  ref="$(gc "$1" run jobs executions describe "$2" --region="$REGION" --project="$PROJECT" \
    --format='value(spec.template.spec.containers[0].image)')" && [ -n "$ref" ] || return 1
  digest="$(gc "$1" artifacts docker images describe "$ref" --format='value(image_summary.digest)')" &&
    [ -n "$digest" ] || return 1
  printf '%s\n' "$digest"
}

# ── 로그(account.yml poll_logs와 같은 규칙: 12회 × 10초, 실행 이름으로 좁힘, severity 필터 없음) ──
poll_logs() {
  local reserve="$1" exec_name="$2" want="$3" out lines
  for _ in $(seq 1 12); do
    out="$(gc "$reserve" logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND labels.\"run.googleapis.com/execution_name\"=\"$exec_name\"" \
      --project="$PROJECT" --freshness=1h --limit=30 --format='value(textPayload)' || true)"
    lines="$(printf '%s\n' "$out" | grep -E -- "$want" || true)"
    if [ -n "$lines" ]; then
      printf '%s\n' "$lines"
      return 0
    fi
    [ "$(remaining "$reserve")" -gt 10 ] || return 1
    sleep 10
  done
  return 1
}

# ── Cloud SQL ──────────────────────────────────────────────────────────────
wait_runnable() {
  local state
  for _ in $(seq 1 90); do
    if [ "$(remaining 0)" -le 10 ]; then
      echo "대기 시간을 넘겼습니다(마감): $TEMP가 RUNNABLE이 되지 않았습니다." >&2
      return 1
    fi
    state="$(gc 0 sql instances describe "$TEMP" --project="$PROJECT" --format='value(state)' || true)"
    if [ "$state" = "RUNNABLE" ]; then
      return 0
    fi
    sleep 10
  done
  echo "대기 시간을 넘겼습니다: $TEMP가 RUNNABLE이 되지 않았습니다." >&2
  return 1
}

# 임시 인스턴스의 끝나지 않은 작업을 기다린다. 작업 목록 조회가 실패하면 기다리지 않는다.
wait_pending_ops() {
  local reserve="$1" ops op left
  ops="$(gc "$reserve" sql operations list --instance="$TEMP" --project="$PROJECT" \
    --filter="status!=DONE" --format='value(name)')" || return 0
  for op in $ops; do
    left="$(remaining "$reserve")"
    [ "$left" -gt 0 ] || return 0
    [ "$left" -le 600 ] || left=600
    gc "$reserve" sql operations wait "$op" --project="$PROJECT" --timeout="$left" >/dev/null || true
  done
}

# 정리(EXIT trap과 finalize가 같이 쓴다). 결과는 CLEANUP_RESULT = absent | present | unknown.
# 부재는 정확한 이름 목록이 성공하고 그 이름이 없을 때만 확인된 것이다.
cleanup_temp() {
  local reserve="$1" listed attempt=0
  CLEANUP_RESULT=unknown
  guard_name "$TEMP" || return 1
  while :; do
    if ! listed="$(gc "$reserve" sql instances list --project="$PROJECT" --filter="name=$TEMP" --format='value(name)')"; then
      echo "임시 인스턴스 목록을 조회하지 못해 남았는지 확인 불가입니다: $TEMP" >&2
      CLEANUP_RESULT=unknown
      return 1
    fi
    if ! printf '%s\n' "$listed" | grep -qxF "$TEMP"; then
      CLEANUP_RESULT=absent
      return 0
    fi
    [ "$attempt" -lt 3 ] || break
    if [ "$attempt" -gt 0 ]; then
      [ "$(remaining "$reserve")" -gt 30 ] || break
      sleep 30
    fi
    attempt=$((attempt + 1))
    wait_pending_ops "$reserve"
    if gc "$reserve" sql instances delete "$TEMP" --project="$PROJECT" --async --quiet >/dev/null; then
      wait_pending_ops "$reserve"
    fi
    [ "$(remaining "$reserve")" -gt 0 ] || break
  done
  echo "임시 인스턴스가 남았습니다: $TEMP" >&2
  CLEANUP_RESULT=present
  return 1
}

# ── rehearse ───────────────────────────────────────────────────────────────
on_exit() {
  local rc=$?
  trap - EXIT
  set +e
  cleanup_temp 0
  state_set CLEANUP "$CLEANUP_RESULT"
  if [ "$rc" = 0 ] && [ "$CLEANUP_RESULT" != "absent" ]; then
    rc=1
  fi
  exit "$rc"
}

cmd_rehearse() {
  prepare
  DEADLINE=$(($(now) + REHEARSE_BUDGET_SEC))
  : >"$STATE_FILE"
  state_set STARTED_AT "$(iso_now)"
  state_set STARTED_EPOCH "$(now)"
  state_set STAGE started
  trap on_exit EXIT

  # 기준선 — 배포 겹침 감지의 비교 기준. 첫 gcloud 호출이다.
  local baseline
  if ! baseline="$(job_image 0)"; then
    fail "Job 이미지 기준선을 읽지 못해 아무것도 만들지 않았습니다."
  fi
  state_set IMAGE "${baseline% *}"
  state_set DIGEST "${baseline#* }"

  # 고아 점검 — 남은 임시가 있거나 못 보면 아무것도 만들지 않는다(고아는 지우지 않는다).
  local orphans
  if ! orphans="$(gc 0 sql instances list --project="$PROJECT" \
    --filter="name~^plant8-$ENV_SHORT-rehearsal-" --format='value(name)')"; then
    state_set ORPHANS unknown
    echo "- 남은 임시 인스턴스 확인 불가 — 시작하지 않았습니다. 정리 절차는 docs/RESTORE.md에 있습니다." >>"$GITHUB_STEP_SUMMARY"
    fail "남은 임시 인스턴스 확인 불가 — 시작하지 않았습니다."
  fi
  if [ -n "$orphans" ]; then
    orphans="$(printf '%s\n' "$orphans" | paste -sd, -)"
    state_set ORPHANS "$orphans"
    echo "- 남은 임시 인스턴스가 있어 시작하지 않았습니다: $orphans — docs/RESTORE.md 절차로 지웁니다." >>"$GITHUB_STEP_SUMMARY"
    fail "남은 임시 인스턴스가 있어 시작하지 않았습니다: $orphans"
  fi

  state_set STAGE restore
  local backup_id disk
  if ! backup_id="$(gc 0 sql backups list --instance="$SOURCE" --project="$PROJECT" \
    --filter="type=AUTOMATED AND status=SUCCESSFUL" --sort-by=~startTime --limit=1 --format='value(id)')"; then
    fail "백업 목록을 읽지 못했습니다."
  fi
  [[ "$backup_id" =~ ^[0-9]+$ ]] || fail "성공한 자동 백업이 없습니다: $SOURCE"
  state_set BACKUP_ID "$backup_id"
  if ! disk="$(gc 0 sql instances describe "$SOURCE" --project="$PROJECT" --format='value(settings.dataDiskSizeGb)')" ||
    ! [[ "$disk" =~ ^[0-9]+$ ]]; then
    fail "원본 디스크 크기를 읽지 못했습니다."
  fi

  gc 0 sql instances create "$TEMP" --project="$PROJECT" --region="$REGION" \
    --database-version="$DB_VERSION" --tier="$DB_TIER" --edition=ENTERPRISE \
    --storage-type=HDD --storage-size="$disk" --availability-type=ZONAL --no-backup \
    --no-assign-ip --network="projects/$PROJECT/global/networks/$NETWORK" \
    --database-flags=cloudsql.iam_authentication=on || fail "임시 인스턴스를 만들지 못했습니다."
  wait_runnable || exit 1
  gc 0 sql backups restore "$backup_id" --restore-instance="$TEMP" --backup-instance="$SOURCE" \
    --project="$PROJECT" --quiet || fail "백업을 임시 인스턴스에 복원하지 못했습니다."
  wait_runnable || exit 1

  # 복원이 IAM DB 사용자를 가져온다고 가정하지 않는다(멱등 보정).
  local iam_user users conn
  iam_user="$(runtime_sa "$ENV_SHORT")@${PROJECT}.iam"
  users="$(gc 0 sql users list --instance="$TEMP" --project="$PROJECT" --format='value(name)')" ||
    fail "임시 인스턴스 사용자 목록을 읽지 못했습니다."
  if ! printf '%s\n' "$users" | grep -qxF "$iam_user"; then
    gc 0 sql users create "$iam_user" --instance="$TEMP" --project="$PROJECT" --type=cloud_iam_service_account ||
      fail "임시 인스턴스에 IAM 사용자를 만들지 못했습니다."
  fi
  conn="$(gc 0 sql instances describe "$TEMP" --project="$PROJECT" --format='value(connectionName)')" ||
    fail "임시 인스턴스 연결 이름을 읽지 못했습니다."
  [ "${conn##*:}" = "$TEMP" ] || fail "연결 이름이 임시 인스턴스가 아니어서 멈췄습니다: $conn"

  state_set STAGE verify
  local exec_name verify_digest
  if ! exec_name="$(gc 0 run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --args="verify,--target,$conn" --update-env-vars="CLOUD_SQL_CONNECTION_NAME=$conn" \
    --wait --format='value(metadata.name)')" || [ -z "$exec_name" ]; then
    echo "verify Job이 실패했습니다." >&2
    exec_name="$(gc 0 run jobs executions list --job="$JOB" --region="$REGION" --project="$PROJECT" \
      --limit=1 --format='value(metadata.name)' || true)"
    if [ -n "$exec_name" ]; then
      poll_logs 0 "$exec_name" '.' >&2 || true
    fi
    exit 1
  fi
  poll_logs 0 "$exec_name" '.' || true
  state_set STAGE verified

  if verify_digest="$(exec_digest 0 "$exec_name")"; then
    state_set VERIFY_DIGEST "$verify_digest"
  else
    state_set VERIFY_DIGEST unknown
  fi
}

# ── finalize ───────────────────────────────────────────────────────────────
outcome_text() {
  case "$1" in
    success) echo "성공" ;;
    restore) echo "실패 · 복원" ;;
    verify) echo "실패 · 검증" ;;
    cleanup) echo "실패 · 정리" ;;
  esac
}

# 판정(위에서부터 처음 맞는 하나): 정리 > 복원 > 검증, 성공은 verified · 부재 확인 · 고아 없음 ·
# 두 digest가 시작 기준선과 같을 때뿐. OUTCOME과 IMAGE_NOTE를 정한다.
judge() {
  local pre="$1" digest verify_digest
  digest="$(state_get DIGEST)"
  verify_digest="$(state_get VERIFY_DIGEST)"
  IMAGE_NOTE=""
  if [ "$(state_get CLEANUP)" != "absent" ] || [ -n "$(state_get ORPHANS)" ]; then
    OUTCOME=cleanup
    return
  fi
  case "$(state_get STAGE)" in
    verified) ;;
    verify)
      OUTCOME=verify
      return
      ;;
    *)
      OUTCOME=restore
      return
      ;;
  esac
  OUTCOME=verify
  if [ -z "$digest" ] || [ -z "$verify_digest" ] || [ "$verify_digest" = "unknown" ] || [ "$pre" = "unknown" ]; then
    IMAGE_NOTE="이미지 확인 불가 — 성공으로 남기지 않았습니다."
  elif [ "$verify_digest" != "$digest" ] || [ "$pre" != "$digest" ]; then
    IMAGE_NOTE="$DEPLOY_OVERLAP (시작 $digest · verify 실행 $verify_digest · 기록 직전 $pre)"
  else
    OUTCOME=success
  fi
}

# 요약 공통 줄: 남은 임시 인스턴스(접두 목록이 성공했을 때만 숫자)와 이번 임시의 정리 결과
leftover_lines() {
  local names count
  if names="$(gc 0 sql instances list --project="$PROJECT" \
    --filter="name~^plant8-$ENV_SHORT-rehearsal-" --format='value(name)')"; then
    count="$(printf '%s\n' "$names" | grep -c . || true)"
    if [ "$count" = 0 ]; then
      LEFTOVER="남은 임시 인스턴스 0개입니다."
    else
      LEFTOVER="남은 임시 인스턴스 ${count}개입니다: $(printf '%s\n' "$names" | paste -sd' ' -) — 정리 절차는 docs/RESTORE.md에 있습니다."
    fi
  else
    LEFTOVER="남은 임시 인스턴스 확인 불가입니다 — docs/RESTORE.md 절차로 확인합니다."
  fi
  case "$CLEANUP_RESULT" in
    present) TEMP_LEFT="이번 실행의 임시 인스턴스가 남았습니다: $TEMP" ;;
    unknown) TEMP_LEFT="이번 실행의 임시 인스턴스가 남았는지 확인 불가입니다: $TEMP" ;;
    *) TEMP_LEFT="" ;;
  esac
}

cmd_finalize() {
  prepare
  DEADLINE=$(($(now) + FINALIZE_BUDGET_SEC))
  local cleanup_reserve=$((RECORD_RESERVE_SEC + SUMMARY_RESERVE_SEC))

  if [ ! -f "$STATE_FILE" ]; then
    cleanup_temp "$cleanup_reserve" || true
    leftover_lines
    {
      echo "## 복원 리허설 ($ENV_SHORT)"
      echo ""
      echo "- 상태 파일이 없어 결과를 기록하지 않았습니다."
      echo "- 임시 인스턴스: $TEMP"
      echo "- $LEFTOVER"
      if [ -n "$TEMP_LEFT" ]; then echo "- $TEMP_LEFT"; fi
    } >>"$GITHUB_STEP_SUMMARY"
    exit 1
  fi

  # 마지막 정리 시도
  cleanup_temp "$cleanup_reserve" || true
  state_set CLEANUP "$CLEANUP_RESULT"

  # 기록 직전 Job 이미지(시작 기준선과 비교)
  local pre pre_digest=unknown
  if pre="$(job_image "$SUMMARY_RESERVE_SEC")"; then
    pre_digest="${pre#* }"
  fi
  judge "$pre_digest"

  local backup_id started_at
  backup_id="$(state_get BACKUP_ID)"
  [[ "$backup_id" =~ ^[0-9]+$ ]] || backup_id=""
  started_at="$(state_get STARTED_AT)"
  [[ "$started_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || started_at="$(iso_now)"

  # 기록 — 한 번 기록의 보장은 DB(run_key UNIQUE)다. RECORDED=1은 지름길이다.
  local stored="" rec_exec="" record_note="" rc line args
  if [ "$(state_get RECORDED)" = "1" ]; then
    stored="$(state_get STORED_OUTCOME)"
    rec_exec="$(state_get RECORD_EXEC)"
    record_note="이미 기록된 실행입니다."
  else
    if [ "$OUTCOME" = "success" ]; then
      args="--succeeded,true"
    else
      args="--succeeded,false,--failed-stage,$OUTCOME"
    fi
    if [ -n "$backup_id" ]; then
      args="$args,--backup-id,$backup_id"
    fi
    args="$args,--started-at,$started_at,--finished-at,$(iso_now)"
    args="$args,--run-url,${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/$RUN_ID,--run-key,$RUN_KEY"
    rc=0
    rec_exec="$(gc "$SUMMARY_RESERVE_SEC" run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
      --args=record,"$args" --wait --format='value(metadata.name)')" || rc=$?
    if [ "$rc" = 0 ]; then
      stored="$OUTCOME"
      record_note="기록했습니다."
    elif [ "$rc" != 124 ]; then
      # 실행이 실패했다(같은 키에 다른 결과 = 종료 코드 4 포함) — 그 실행 로그의 자기 키 줄이 저장된 결과다.
      if [ -z "$rec_exec" ]; then
        rec_exec="$(gc 0 run jobs executions list --job="$JOB" --region="$REGION" --project="$PROJECT" \
          --limit=1 --format='value(metadata.name)' || true)"
      fi
      if [ -n "$rec_exec" ] &&
        line="$(poll_logs 0 "$rec_exec" "^stored_outcome=(success|restore|verify|cleanup) run_key=${RUN_KEY}\$")"; then
        stored="$(printf '%s\n' "$line" | head -n 1 | sed -E 's/^stored_outcome=([a-z]+) .*/\1/')"
        record_note="이미 기록된 실행입니다."
      fi
    else
      echo "record가 시간 안에 끝나지 않았습니다." >&2
    fi
    if [ -n "$stored" ]; then
      state_set RECORDED 1
      state_set STORED_OUTCOME "$stored"
      state_set RECORD_EXEC "$rec_exec"
    else
      rec_exec=""
      record_note="기록 실패(저장된 결과 확인 불가)입니다 — 워크플로를 다시 돌립니다(새 실행으로 기록됩니다). 남은 임시 인스턴스는 docs/RESTORE.md 2절로 확인합니다."
    fi
  fi

  # 기록 뒤 확인 — record 실행이 실제로 쓴 이미지. 한 번 구한 값은 상태 파일에 남아 재시도에도 쓴다.
  local digest post="" rec_digest=""
  digest="$(state_get DIGEST)"
  if [ "$stored" = "success" ]; then
    post="$(state_get POST_RECORD)"
    if [ -z "$post" ]; then
      post=unknown
      if [ -n "$rec_exec" ] && [ -n "$digest" ] && rec_digest="$(exec_digest 0 "$rec_exec")"; then
        if [ "$rec_digest" = "$digest" ]; then post=ok; else post=mismatch; fi
      fi
      state_set POST_RECORD "$post"
    fi
  fi

  leftover_lines
  local started_epoch took="알 수 없음" image
  started_epoch="$(state_get STARTED_EPOCH)"
  if [[ "$started_epoch" =~ ^[0-9]+$ ]]; then
    took="$((($(now) - started_epoch) / 60))분"
    [ "$took" != "0분" ] || took="1분 미만"
  fi
  image="$(state_get IMAGE)"

  {
    echo "## 복원 리허설 ($ENV_SHORT)"
    echo ""
    if [ -n "$stored" ]; then echo "- 기록된 결과: $(outcome_text "$stored")"; fi
    echo "- 원본: $SOURCE"
    echo "- 백업 id: ${backup_id:-없음}"
    echo "- 임시 인스턴스: $TEMP"
    echo "- 소요: $took"
    echo "- $LEFTOVER"
    if [ -n "$TEMP_LEFT" ]; then echo "- $TEMP_LEFT"; fi
    if [ -n "$image" ] && [ -n "$digest" ]; then
      echo "- 이미지 $image@$digest"
    else
      echo "- 이미지 기준선을 읽지 못했습니다."
    fi
    if [ -n "$IMAGE_NOTE" ] && { [ -z "$stored" ] || [ "$stored" = "$OUTCOME" ]; }; then echo "- $IMAGE_NOTE"; fi
    echo "- $record_note"
    if [ -n "$stored" ] && [ "$stored" != "$OUTCOME" ]; then
      echo "- 이번 정리: $LEFTOVER (이번 판정: $(outcome_text "$OUTCOME"))"
    fi
    if [ "$post" = "mismatch" ] || [ "$post" = "unknown" ]; then
      echo "- 기록 뒤 확인: $DEPLOY_OVERLAP (시작 ${digest:-확인 불가} · record 실행 ${rec_digest:-확인 불가})"
    fi
  } >>"$GITHUB_STEP_SUMMARY"

  if [ "$stored" = "success" ] && [ "$post" = "ok" ]; then
    exit 0
  fi
  exit 1
}

cmd_guard() {
  map_env
  guard_name "${1:-}" || exit 3
}

case "${1:-}" in
  guard) cmd_guard "${2:-}" ;;
  rehearse) cmd_rehearse ;;
  finalize) cmd_finalize ;;
  *)
    echo "사용법: restore-rehearsal.sh <guard <이름>|rehearse|finalize>" >&2
    exit 2
    ;;
esac
