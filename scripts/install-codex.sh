#!/bin/bash
# 클라우드 세션(Claude Code on the web)에서 Codex CLI를 설치하고, 환경 변수
# CODEX_AUTH_JSON_B64에 담긴 PC에서 로그인한 ChatGPT 자격을 ~/.codex/auth.json으로
# 복원한다. 구독 계정은 --with-access-token으로 로그인할 수 없어(agent identity JWT
# 요구) auth.json을 통째로 주입하는 것이 유일한 경로다. 로컬 PC 세션은 건드리지 않고,
# 어떤 실패 경로도 세션 자체를 막지 않는다(SessionStart 훅).

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

CODEX_VERSION=0.155.1

# 멱등 설치: 이미 원하는 버전이면 건너뛴다.
CURRENT_VERSION="$(codex --version 2>/dev/null | awk '{print $NF}')"
if [ "$CURRENT_VERSION" = "$CODEX_VERSION" ]; then
  echo "install-codex: codex $CODEX_VERSION already installed — skipping"
else
  if ! npm install -g "@openai/codex@$CODEX_VERSION" >/dev/null 2>&1; then
    echo "install-codex: npm install -g @openai/codex@$CODEX_VERSION failed" >&2
    exit 0
  fi
fi

if [ -n "${CODEX_AUTH_JSON_B64:-}" ]; then
  # 자격 복원. umask를 먼저 걸어 임시파일이 생기는 순간부터 소유자만 읽게 한다.
  umask 077
  CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
  if ! mkdir -p "$CODEX_DIR" 2>/dev/null; then
    echo "install-codex: failed to create $CODEX_DIR" >&2
    exit 0
  fi
  TMP="$(mktemp "$CODEX_DIR/auth.json.XXXXXX")"
  printf '%s' "$CODEX_AUTH_JSON_B64" | base64 -d > "$TMP" 2>/dev/null

  # 검증: JSON이고 tokens.refresh_token이 비어있지 않은 문자열인지만 본다.
  # try/catch로 감싸 오류 메시지를 절대 출력하지 않는다 — V8 JSON.parse 오류는
  # 입력 일부를 그대로 담아 토큰을 흘릴 수 있다.
  if node -e '
    try {
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof data.tokens?.refresh_token === "string" && data.tokens.refresh_token.length > 0) {
        process.exit(0);
      }
      process.exit(1);
    } catch {
      process.exit(1);
    }
  ' "$TMP" >/dev/null 2>&1; then
    chmod 600 "$TMP"
    mv -f "$TMP" "$CODEX_DIR/auth.json"
    echo "install-codex: restored $CODEX_DIR/auth.json"
  else
    rm -f "$TMP"
    echo "install-codex: CODEX_AUTH_JSON_B64 is not valid base64 JSON with tokens.refresh_token — auth.json not written" >&2
  fi
elif [ -n "${OPENAI_API_KEY:-}" ]; then
  # 대체 경로: API 과금 키. stdin으로 전달해 인자로 노출하지 않는다.
  if ! printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null 2>&1; then
    echo "install-codex: codex login --with-api-key failed" >&2
  fi
else
  echo "install-codex: CODEX_AUTH_JSON_B64 not set — codex installed but not logged in"
fi

codex login status || true

echo "install-codex: network allowlist needs api.openai.com, chatgpt.com, auth.openai.com for /gsd-review --codex to work"

exit 0
