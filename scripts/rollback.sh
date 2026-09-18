#!/usr/bin/env bash
set -euo pipefail

# scripts/rollback.sh — 현재 100% 서빙 중인 리비전보다 오래된 **다른 배포**로
# 트래픽 100%를 되돌린다. 되돌릴 단위는 리비전이 아니라 배포(APP_GIT_SHA)다 —
# 한 번의 배포가 리비전을 둘 만들기 때문이다(아래 주석 참고).
#
# 카나리(0% → 스모크 → 100%)는 01-07에서 제거됐다. 새 리비전은 스모크 **전에**
# 이미 100%를 받으므로 스모크 실패는 나쁜 리비전이 서빙 중이라는 뜻이고,
# 자동 롤백은 없다 — 이 스크립트가 유일한 복구 수단이다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../infra/names.sh
source "$ROOT_DIR/infra/names.sh"

ENV=""
PROJECT=""
REGION=""

usage() {
  cat >&2 <<'USAGE'
Usage: rollback.sh --env staging|prod --project ID --region R
USAGE
}

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
    *)
      echo "rollback.sh: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [ "$ENV" != "staging" ] && [ "$ENV" != "prod" ]; then
  echo "rollback.sh: --env must be staging or prod" >&2
  usage
  exit 2
fi
if [ -z "$PROJECT" ] || [ -z "$REGION" ]; then
  echo "rollback.sh: --project and --region are required" >&2
  usage
  exit 2
fi

SVC="$(svc_name "$ENV")"

SERVING="$(gcloud run services describe "$SVC" --region="$REGION" --project="$PROJECT" --format=json \
  | jq -r '.status.traffic[]? | select(.percent == 100) | .revisionName' | head -n1)"

if [ -z "$SERVING" ]; then
  echo "no serving revision" >&2
  exit 1
fi

REVISIONS="$(gcloud run revisions list --service="$SVC" --region="$REGION" --project="$PROJECT" \
  --sort-by='~metadata.creationTimestamp' --format='value(metadata.name)')"

# 배포 하나가 리비전을 둘 만든다(01-07·01-08 실측: staging 00024→00025,
# prod 00001→00002). deploy.sh가 계산 URL을 BETTER_AUTH_URL로 넣어 먼저 배포한
# 뒤 실제 status.url과 다르면 환경변수를 고쳐 재배포하기 때문이다. 첫 리비전은
# 틀린 BETTER_AUTH_URL을 들고 있어 로그인 POST가 better-auth Origin 검사에
# 걸린다. 그래서 "바로 직전 리비전"으로 되돌리면 사고 중에 로그인이 막힌
# 리비전에 착륙한다. 되돌릴 단위는 리비전이 아니라 **배포**(APP_GIT_SHA)다.
rev_git_sha() {
  gcloud run revisions describe "$1" --region="$REGION" --project="$PROJECT" --format=json 2>/dev/null \
    | jq -r '.spec.containers[0].env[]? | select(.name == "APP_GIT_SHA") | .value' | head -n1
}

SERVING_SHA="$(rev_git_sha "$SERVING")"

PREV=""
FOUND_SERVING=0
SAW_OLDER=0
while IFS= read -r rev; do
  [ -z "$rev" ] && continue
  if [ "$FOUND_SERVING" = "1" ]; then
    SAW_OLDER=1
    # APP_GIT_SHA를 못 읽는 옛 리비전(그 환경변수가 생기기 전)은 다른 배포로 본다.
    cand_sha="$(rev_git_sha "$rev")"
    if [ -n "$SERVING_SHA" ] && [ "$cand_sha" = "$SERVING_SHA" ]; then
      continue
    fi
    PREV="$rev"
    break
  fi
  if [ "$rev" = "$SERVING" ]; then
    FOUND_SERVING=1
  fi
done <<<"$REVISIONS"

if [ -z "$PREV" ]; then
  if [ "$SAW_OLDER" = "1" ]; then
    echo "no previous deployment (every older revision carries the serving APP_GIT_SHA ${SERVING_SHA:-<none>})" >&2
  else
    echo "no previous revision" >&2
  fi
  exit 1
fi

gcloud run services update-traffic "$SVC" --region="$REGION" --project="$PROJECT" --to-revisions="${PREV}=100"
echo "rolled back $SVC from $SERVING to $PREV"
