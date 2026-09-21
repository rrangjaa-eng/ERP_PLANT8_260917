#!/usr/bin/env bash
# PreToolUse(Bash) 훅 — git push 전에 lint·typecheck를 강제한다.
# 2026-09-21: `pnpm lint`을 grep에 파이프해 exit code가 가려진 채 `&&` 체인이
# 계속 진행됐고, 린트 에러가 그대로 푸시돼 CI가 실패했다. 파이프로는 이 훅을
# 가릴 수 없다(exit 2 = 차단, stderr가 모델에 전달). 실행 시간 약 45초.
set -uo pipefail

payload="$(cat)"
command="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
[ -n "$command" ] || exit 0

case "$command" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

run_gate() {
  local name="$1"
  local output
  if ! output="$(pnpm "$name" 2>&1)"; then
    echo "차단됨: pnpm ${name} 실패 — 푸시 전 게이트다. 고치고 다시 푸시해라. 훅을 우회하지 마라." >&2
    printf '%s\n' "$output" | tail -30 >&2
    exit 2
  fi
}

run_gate lint
run_gate typecheck
exit 0
