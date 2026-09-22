#!/usr/bin/env bash
# .github/workflows/verify.yml이 실행한다. 입력은 환경 변수로만 받는다(T-1-32).
#   INPUT_CHECK=policies|alert-test  INPUT_ENV=staging|production  PROJECT  REGION
# 각 명령의 실패를 삼키지 않는다 — 권한이 없으면 PERMISSION_DENIED가 그대로 로그에
# 남고, 마지막에 실패 수로 종료한다.
set -u
cd "$(dirname "$0")/.."
source infra/names.sh

FAILED=0
run_check() {
  local title="$1"; shift
  echo "::group::${title}"
  if "$@"; then
    echo "::endgroup::"
  else
    echo "::endgroup::"
    echo "::error::${title} 실패"
    FAILED=$((FAILED + 1))
  fi
}

ENV_SHORT="$INPUT_ENV"
[ "$ENV_SHORT" = "production" ] && ENV_SHORT="prod"

case "$INPUT_CHECK" in
  policies)
    # (a) 조직 정책 4개 — scripts/bootstrap-gcp.sh (g)와 같은 목록, 실효값 원문.
    for c in iam.allowedPolicyMemberDomains run.allowedIngress compute.restrictVpcPeering iam.workloadIdentityPoolProviders; do
      run_check "org policy ${c}" gcloud org-policies describe "$c" --project="$PROJECT" --effective
    done
    # (b) 런타임 SA(staging·prod)와 배포 SA(gha-deployer)의 프로젝트 역할.
    for sa in "$(runtime_sa staging)" "$(runtime_sa prod)" gha-deployer; do
      run_check "roles of ${sa}" gcloud projects get-iam-policy "$PROJECT" \
        --flatten='bindings[].members' \
        --filter="bindings.members:serviceAccount:${sa}@${PROJECT}.iam.gserviceaccount.com" \
        --format='table(bindings.role)'
    done
    ;;
  alert-test)
    # infra/monitoring/backup-failed.json.tpl 필터: resource.type="cloudsql_database"
    # AND database_id="PROJECT:INSTANCE" AND (methodName=~backup OR jsonPayload.message=~backup)
    # AND severity>=ERROR. gcloud logging write는 monitored resource type을 못 정하므로
    # Logging API entries:write를 직접 부른다. 합성 항목임을 본문에 남긴다.
    instance="$(sql_instance "$ENV_SHORT")"
    stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    body=$(cat <<JSON
{
  "entries": [{
    "logName": "projects/${PROJECT}/logs/plant8-verify-alert-test",
    "resource": {
      "type": "cloudsql_database",
      "labels": { "project_id": "${PROJECT}", "database_id": "${PROJECT}:${instance}", "region": "${REGION}" }
    },
    "severity": "ERROR",
    "jsonPayload": { "message": "backup failed — SYNTHETIC alert filter test from verify.yml (${stamp})", "synthetic": true }
  }]
}
JSON
)
    write_entry() {
      curl -sS --fail-with-body -X POST "https://logging.googleapis.com/v2/entries:write" \
        -H "Authorization: Bearer $(gcloud auth print-access-token)" \
        -H "Content-Type: application/json" \
        --data "$body"
    }
    run_check "write synthetic backup-failed entry (${ENV_SHORT}, ${instance})" write_entry
    echo "합성 항목 시각: ${stamp}. 경보 정책 '$(policy_backup "$ENV_SHORT")'의 알림 채널 '$(alert_channel "$ENV_SHORT")' 메일 도달을 확인한다(정책 notificationRateLimit 3600s)."
    ;;
  *)
    echo "::error::알 수 없는 INPUT_CHECK: ${INPUT_CHECK}"
    FAILED=1
    ;;
esac

echo "failed checks: ${FAILED}"
exit "$FAILED"
