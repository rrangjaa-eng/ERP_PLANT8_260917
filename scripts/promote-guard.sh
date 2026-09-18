#!/usr/bin/env bash
set -euo pipefail

# scripts/promote-guard.sh — D-05 승격 가드. deploy.yml의 production 잡이
# 배포 스텝 **앞에서** 부른다. "스테이징이 지금 실제로 서빙 중인 SHA만
# 프로덕션에 올린다"를 강제한다. 통과하면 stdout에 다음 두 줄을 찍고 exit 0,
# 그렇지 않으면 이유를 stderr에 찍고 exit 1 한다(워크플로가 여기서 멈춘다).
#
#   STAGING_SHA=<40자 hex>   # 스테이징이 서빙 중인 SHA
#   PROMOTE_SHA=<40자 hex>   # 프로덕션에 올릴 SHA (= STAGING_SHA)
#
# 배포 SHA는 리비전의 `APP_GIT_SHA` 환경변수에서 읽는다 — deploy.sh가
# `--set-env-vars`로 심는 값이고, `/api/health`가 돌려주는 `sha`와 같다.
#
# ⚠️ 이미지 태그(`…/app:<sha>`)에서 읽으면 안 된다: Cloud Run은 배포 시점에
# 태그를 다이제스트로 해석해 `…/app@sha256:…`로 저장하기 때문에(2026-09-18
# 스테이징 실측, 01-07-DEPLOY-LOG "deploy.yml 프로덕션 가드 전제 — 기각됨"),
# 마지막 `:` 뒤를 git SHA로 간주하면 다이제스트를 얻어 비교가 항상 어긋나고
# 승격이 영구히 막힌다. 회귀 테스트: test/unit/deploy/promote-guard-sh.test.ts.
#
# 프로젝트 ID·리전은 인자로만 온다(D-03) — 이 파일에 실제 식별자를 적지 않는다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../infra/names.sh
source "$ROOT_DIR/infra/names.sh"

PROJECT=""
REGION="$REGION_DEFAULT"
SHA_INPUT=""

usage() {
  cat >&2 <<'USAGE'
Usage: promote-guard.sh --project ID [--region R] [--sha S]
  --sha 를 비우면 스테이징이 현재 서빙 중인 SHA가 승격 대상이 된다.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --sha)
      SHA_INPUT="${2:-}"
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [ -z "$PROJECT" ]; then
  usage
  exit 2
fi

SVC="$(svc_name staging)"

# 1) 스테이징이 100% 트래픽을 주고 있는 리비전. 폐기된 카나리 시도가 남긴
#    태그 전용 항목(percent 없음)이 traffic[]에 섞여 있어 select가 필요하다.
REV="$(gcloud run services describe "$SVC" --region "$REGION" --project "$PROJECT" --format=json \
  | jq -r '.status.traffic[]? | select(.percent == 100) | .revisionName' | head -n1)"
if [ -z "$REV" ] || [ "$REV" = "null" ]; then
  echo "staging is not serving any revision at 100% — deploy staging first (D-05)" >&2
  exit 1
fi

# 2) 그 리비전이 실제로 들고 있는 배포 SHA. 이미지 문자열이 아니라 환경변수다.
REVISION_JSON="$(gcloud run revisions describe "$REV" --region "$REGION" --project "$PROJECT" --format=json)"
STAGING_SHA="$(printf '%s' "$REVISION_JSON" \
  | jq -r '.spec.containers[0].env[]? | select(.name == "APP_GIT_SHA") | .value' | head -n1)"
if [ -z "$STAGING_SHA" ] || [ "$STAGING_SHA" = "null" ]; then
  echo "staging revision $REV has no APP_GIT_SHA env var — it predates deploy.sh setting it; redeploy staging (D-05)" >&2
  exit 1
fi
if ! [[ "$STAGING_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "staging revision $REV has a malformed APP_GIT_SHA — redeploy staging (D-05)" >&2
  exit 1
fi

# 3) 승격 대상 SHA 결정. 입력이 있으면 형식을 검증하고 40자로 펼친다.
if [ -z "$SHA_INPUT" ]; then
  SHA="$STAGING_SHA"
else
  if ! [[ "$SHA_INPUT" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "sha must be 7-40 hex chars" >&2
    exit 1
  fi
  if [[ "$SHA_INPUT" =~ ^[0-9a-f]{40}$ ]]; then
    SHA="$SHA_INPUT"
  else
    # 짧은 SHA는 체크아웃된 저장소에서 펼친다(deploy.yml은 fetch-depth: 0).
    if ! SHA="$(git rev-parse --verify --quiet "${SHA_INPUT}^{commit}")"; then
      echo "sha $SHA_INPUT is not a commit in this repository" >&2
      exit 1
    fi
  fi
fi

# 4) 그 SHA 태그의 이미지가 Artifact Registry에 있어야 한다(빌드 없이 승격).
if ! gcloud artifacts docker images describe "$(image_path "$SHA" "$PROJECT" "$REGION")" --project "$PROJECT" >/dev/null 2>&1; then
  echo "image for $SHA not found in Artifact Registry — deploy it to staging first (D-05)" >&2
  exit 1
fi

# 5) 그리고 그 SHA가 스테이징이 지금 서빙 중인 SHA여야 한다.
if [ "$SHA" != "$STAGING_SHA" ]; then
  echo "staging is serving $STAGING_SHA, not $SHA — deploy $SHA to staging first (D-05)" >&2
  exit 1
fi

echo "STAGING_SHA=$STAGING_SHA"
echo "PROMOTE_SHA=$SHA"
