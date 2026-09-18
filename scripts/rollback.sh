#!/usr/bin/env bash
set -euo pipefail

# scripts/rollback.sh — 현재 100% 서빙 중인 리비전보다 오래된 최신 리비전으로
# 트래픽 100%를 되돌린다. 스모크에 실패해 0%로 남은 최신 리비전은 서빙 리비전보다
# 먼저(더 최근) 만들어졌으므로 목록에서 자연히 건너뛴다(플랜 리뷰 Eng Issue 3).

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

PREV=""
FOUND_SERVING=0
while IFS= read -r rev; do
  [ -z "$rev" ] && continue
  if [ "$FOUND_SERVING" = "1" ]; then
    PREV="$rev"
    break
  fi
  if [ "$rev" = "$SERVING" ]; then
    FOUND_SERVING=1
  fi
done <<<"$REVISIONS"

if [ -z "$PREV" ]; then
  echo "no previous revision" >&2
  exit 1
fi

gcloud run services update-traffic "$SVC" --region="$REGION" --project="$PROJECT" --to-revisions="${PREV}=100"
echo "rolled back $SVC from $SERVING to $PREV"
