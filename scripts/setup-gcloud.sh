#!/usr/bin/env bash
# Claude Code 클라우드 세션용 gcloud 준비(SessionStart 훅). 환경 변수
# GCP_VERIFIER_SA_KEY_B64(읽기 전용 검증 SA 키 JSON의 base64 한 줄)가 있을 때만
# 동작하고, 없으면 아무것도 하지 않는다 — 로컬·CI에는 이 변수가 없다.
# 어떤 실패도 세션 시작을 막지 않는다(항상 exit 0).
set -u

if [ -z "${GCP_VERIFIER_SA_KEY_B64:-}" ]; then
  exit 0
fi

SDK_DIR=/opt/google-cloud-sdk
if ! command -v gcloud >/dev/null 2>&1; then
  if [ ! -x "$SDK_DIR/bin/gcloud" ]; then
    # 허용 도메인: sdk.cloud.google.com → dl.google.com. 설치 스크립트를 먼저 받아
    # 두고 실행한다 — 파이프로 바로 넘기면 curl 실패가 bash의 exit 0에 가려진다.
    INSTALLER="$(mktemp)"
    if ! curl -sSL https://sdk.cloud.google.com -o "$INSTALLER" 2>/dev/null \
      || ! bash "$INSTALLER" --disable-prompts --install-dir=/opt >/dev/null 2>&1 \
      || [ ! -x "$SDK_DIR/bin/gcloud" ]; then
      rm -f "$INSTALLER"
      echo "setup-gcloud: gcloud 설치 실패 (네트워크 정책에 sdk.cloud.google.com·dl.google.com 허용 필요)" >&2
      exit 0
    fi
    rm -f "$INSTALLER"
  fi
  ln -sf "$SDK_DIR/bin/gcloud" /usr/local/bin/gcloud 2>/dev/null || export PATH="$SDK_DIR/bin:$PATH"
fi

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
if ! printf '%s' "$GCP_VERIFIER_SA_KEY_B64" | base64 -d > "$KEY_FILE" 2>/dev/null; then
  echo "setup-gcloud: GCP_VERIFIER_SA_KEY_B64가 base64가 아니다" >&2
  exit 0
fi
if gcloud auth activate-service-account --key-file="$KEY_FILE" >/dev/null 2>&1 \
  && gcloud config set project plant8-509002 >/dev/null 2>&1; then
  echo "setup-gcloud: $(gcloud config get-value account 2>/dev/null) @ plant8-509002"
else
  echo "setup-gcloud: 서비스 계정 인증 실패 — 키 값과 *.googleapis.com 허용 여부를 확인" >&2
fi
exit 0
