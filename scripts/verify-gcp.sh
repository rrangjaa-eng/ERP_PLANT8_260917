#!/usr/bin/env bash
# .github/workflows/verify.yml이 실행한다. 입력은 환경 변수로만 받는다(T-1-32).
#   INPUT_CHECK=policies|notify-tick|evidence-bucket  PROJECT  REGION
# 각 명령의 실패를 삼키지 않는다 — 권한이 없으면 PERMISSION_DENIED가 그대로 로그에
# 남고, 마지막에 실패 수로 종료한다.
set -u
cd "$(dirname "$0")/.."
source infra/names.sh

FAILED=0
# 명령 출력을 보여 주고, 실패했거나 출력이 비었으면 실패로 돌려준다.
nonempty() {
  local out
  out="$("$@")" || return 1
  [ -n "$out" ] || { echo "(결과 없음)"; return 1; }
  printf '%s\n' "$out"
}

# JSON 문자열에 jq -e 조건을 건다(참이 아니거나 입력이 비면 실패).
jq_true() {
  local json="$1"; shift
  printf '%s' "$json" | jq -e "$@" >/dev/null
}

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
  notify-tick)
    # (c) 스테이징 notify-tick — 스케줄러 잡 설정·상태, 잡 실행 기록, 앱의 notify.*·holiday.* 로그(최근 7일).
    # 읽기만 한다(gha-deployer에 이미 있는 cloudscheduler.admin·logging.admin으로 조회).
    # gcloud logging read는 결과가 없어도 0으로 끝나므로, 실행 기록·ok=true 틱이 없거나 잡이 ENABLED가 아니면 실패로 센다.
    job="$(scheduler_job staging)"
    region="${REGION:-$REGION_DEFAULT}"
    run_check "scheduler job ${job}" gcloud scheduler jobs describe "$job" --location="$region" --project="$PROJECT" \
      --format='yaml(schedule,timeZone,state,lastAttemptTime,status,httpTarget.uri,httpTarget.oidcToken)'
    run_check "scheduler job ${job} is ENABLED" test \
      "$(gcloud scheduler jobs describe "$job" --location="$region" --project="$PROJECT" --format='value(state)')" = ENABLED
    run_check "scheduler runs ${job}" nonempty gcloud logging read \
      "resource.type=\"cloud_scheduler_job\" AND resource.labels.job_id=\"${job}\"" \
      --project="$PROJECT" --freshness=7d --limit=40 \
      --format='table(timestamp,severity,httpRequest.status,jsonPayload.status,jsonPayload.debugInfo)'
    run_check "successful notify.tick (ok=true) in 7d" nonempty gcloud logging read \
      "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$(svc_name staging)\" AND jsonPayload.event=\"notify.tick\" AND jsonPayload.ok=true" \
      --project="$PROJECT" --freshness=7d --limit=5 \
      --format='table(timestamp,jsonPayload.businessDay,jsonPayload.sent,jsonPayload.skipped,jsonPayload.remaining,jsonPayload.emailSent,jsonPayload.emailFailed,jsonPayload.emailUnknown)'
    # 진단용 — 실패·잠김·인증 거부 등 모든 notify.*·holiday.* 이벤트(통과 조건 아님).
    run_check "app logs notify.* holiday.* (diagnostics)" gcloud logging read \
      "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$(svc_name staging)\" AND jsonPayload.event=~\"^(notify|holiday)[.]\"" \
      --project="$PROJECT" --freshness=7d --limit=40 \
      --format='table(timestamp,severity,jsonPayload.event,jsonPayload.ok,jsonPayload.businessDay,jsonPayload.sent,jsonPayload.skipped,jsonPayload.remaining,jsonPayload.emailSent,jsonPayload.emailFailed,jsonPayload.emailUnknown,jsonPayload.reason,jsonPayload.message)'
    ;;
  evidence-bucket)
    # (d) 증빙 버킷(05-12, docs/EVIDENCE-STORAGE.md) — 읽기만(gha-deployer는 이 버킷에 storage.admin, 서비스 조회는 run.admin).
    # 런타임 SA 자기 signBlob 바인딩은 SA IAM 정책이라 배포 SA가 읽을 수 없다 — 스파이크(scripts/gcs-sign-smoke.ts)의 서명 PUT이 증명한다.
    # 첫 배포 전에는 CORS · 런타임 objectUser가 아직 없어 실패가 정상이다(배포의 ensure_evidence_bucket · ensure_evidence_cors가 맞춘다).
    staging_url="$(gcloud run services describe "$(svc_name staging)" --region="${REGION:-$REGION_DEFAULT}" --project="$PROJECT" --format='value(status.url)')"
    for env in staging prod; do
      bucket="gs://$(evidence_bucket "$env" "$PROJECT")"
      runtime="serviceAccount:$(runtime_sa "$env")@${PROJECT}.iam.gserviceaccount.com"
      desc="$(gcloud storage buckets describe "$bucket" --project="$PROJECT" --format=json)"
      policy="$(gcloud storage buckets get-iam-policy "$bucket" --project="$PROJECT" --format=json)"
      run_check "${bucket} (원문)" nonempty printf '%s' "$desc"
      run_check "${bucket} 균일 접근 · 공개 접근 방지 enforced · asia-northeast3" jq_true "$desc" \
        '.uniform_bucket_level_access == true and .public_access_prevention == "enforced" and ((.location // "") | ascii_downcase) == "asia-northeast3"'
      run_check "${bucket} 수명 주기 incoming/ 7일 삭제 · evidence/를 지우는 규칙 없음" jq_true "$desc" \
        '[.lifecycle_config.rule[]? | select(.action.type == "Delete")] as $d
         | ($d | any(.condition.age == 7 and .condition.matchesPrefix == ["incoming/"]))
           and ($d | all((.condition.matchesPrefix // []) as $p | ($p | length) > 0 and ($p | all(startswith("incoming/")))))'
      run_check "${bucket} 런타임 roles/storage.objectUser" jq_true "$policy" --arg m "$runtime" \
        '[.bindings[]? | select(.role == "roles/storage.objectUser") | .members[]] | index($m) != null'
      run_check "${bucket} 배포 SA roles/storage.admin" jq_true "$policy" --arg m "serviceAccount:gha-deployer@${PROJECT}.iam.gserviceaccount.com" \
        '[.bindings[]? | select(.role == "roles/storage.admin") | .members[]] | index($m) != null'
      if [ "$env" = staging ]; then
        run_check "${bucket} cors 원점 = 스테이징 status.url" jq_true "$desc" --arg u "$staging_url" \
          '[.cors_config[]? | .origin] == [[$u]]'
      fi
    done
    ;;
  *)
    echo "::error::알 수 없는 INPUT_CHECK: ${INPUT_CHECK}"
    FAILED=1
    ;;
esac

echo "failed checks: ${FAILED}"
exit "$FAILED"
