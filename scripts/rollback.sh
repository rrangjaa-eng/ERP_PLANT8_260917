#!/usr/bin/env bash
set -euo pipefail

# scripts/rollback.sh — 현재 100% 서빙 중인 리비전보다 오래된 **다른 배포**로
# 트래픽 100%를 되돌린다. 되돌릴 단위는 리비전이 아니라 배포(APP_GIT_SHA)다 —
# 한 번의 배포가 리비전을 둘 만들기 때문이다(아래 주석 참고).
#
# 카나리(0% → 스모크 → 100%)는 01-07에서 제거됐다. 새 리비전은 스모크 **전에**
# 이미 100%를 받으므로 스모크 실패는 나쁜 리비전이 서빙 중이라는 뜻이다.
# deploy.sh가 스모크에 실패하면 이 스크립트를 한 번 호출해 자동으로 되돌린다
# (smoke_failed()). 그래도 수동 실행이 필요한 경우가 남는다 — 자동 롤백 자체가
# 실패했을 때, 그리고 스모크는 통과했지만 나중에 문제가 드러났을 때다.
#
# 스키마 하한(E2-04): 체크아웃의 가장 최신 `-- rollback-floor:` 마이그레이션을
# 더한 커밋을 조상으로 갖지 않는 배포로는 되돌리지 않는다 — 트래픽 롤백은 DB를
# 되돌리지 않는다. 수동 실행은 최신 main 체크아웃에서.

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

# 배포 하나가 리비전을 둘 만들던 시기가 있다(01-07·01-08 실측: staging
# 00024→00025, prod 00001→00002). deploy.sh가 계산 URL을 BETTER_AUTH_URL로 넣어
# 먼저 배포한 뒤 실제 status.url과 다르면 환경변수를 고쳐 재배포했기 때문이다.
# 그 첫 리비전은 틀린 BETTER_AUTH_URL을 들고 있어 로그인 POST가 better-auth
# Origin 검사에 걸린다. deploy.sh는 이제 기존 서비스의 status.url을 배포 전에
# 확정해 배포당 리비전을 하나만 만들지만(01-08 실측: staging 00028 단일),
# 그 이전에 만들어진 짝 리비전들은 서비스에 그대로 남아 있다. 그래서 "바로
# 직전 리비전"으로 되돌리면 사고 중에 로그인이 막힌 리비전에 착륙할 수 있다.
# 되돌릴 단위는 리비전이 아니라 **배포**(APP_GIT_SHA)다.
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

# 스키마 하한(E2-04): db/migrations/*.sql 중 첫 줄이 `-- rollback-floor:`인 파일을
# 이름순으로 모아 가장 최신 파일을 고른다(디렉터리 자체가 없거나 표시가 없으면
# 판정을 건너뛰어 지금 동작 그대로 유지한다). 그 파일을 더한 커밋을 하한으로 삼고,
# PREV의 APP_GIT_SHA가 그 커밋을 조상으로 갖지 않으면(또는 SHA가 없거나 로컬 git
# 이력에 없으면) update-traffic을 부르지 않고 거부한다.
FLOOR_FILE=""
if [ -d "$ROOT_DIR/db/migrations" ]; then
  FLOOR_FILE="$( (grep -l '^-- rollback-floor:' "$ROOT_DIR"/db/migrations/*.sql 2>/dev/null || true) \
    | sort | tail -n1)"
  FLOOR_FILE="${FLOOR_FILE##*/}"
fi

if [ -n "$FLOOR_FILE" ]; then
  FLOOR_SHA="$(git -C "$ROOT_DIR" log --diff-filter=A --format=%H -1 -- "db/migrations/$FLOOR_FILE")"
  CAND_SHA="$(rev_git_sha "$PREV")"
  REASON=""
  if [ -z "$CAND_SHA" ]; then
    REASON="candidate has no APP_GIT_SHA"
  elif ! git -C "$ROOT_DIR" cat-file -e "${CAND_SHA}^{commit}" 2>/dev/null; then
    REASON="candidate SHA not found in local git history — git fetch and re-run from a checkout with the latest main"
  elif ! git -C "$ROOT_DIR" merge-base --is-ancestor "$FLOOR_SHA" "$CAND_SHA" 2>/dev/null; then
    REASON="candidate is older than the schema floor (not a descendant)"
  fi
  if [ -n "$REASON" ]; then
    echo "rollback rejected: candidate revision $PREV (APP_GIT_SHA=${CAND_SHA:-<none>}) is not compatible with the current schema" >&2
    echo "  floor migration: $FLOOR_FILE" >&2
    echo "  floor commit:    $FLOOR_SHA" >&2
    echo "  reason:          $REASON" >&2
    echo "  recovery: fix forward first (new commit -> main -> deploy). If unavoidable, stop writes, apply the migration's reverse SQL, then move traffic manually. See docs/design/DECISIONS.md 04-50." >&2
    exit 1
  fi
fi

gcloud run services update-traffic "$SVC" --region="$REGION" --project="$PROJECT" --to-revisions="${PREV}=100"
echo "rolled back $SVC from $SERVING to $PREV"
