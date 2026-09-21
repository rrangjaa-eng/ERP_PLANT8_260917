#!/usr/bin/env bash
# PreToolUse(Write|Edit) 훅 — CLAUDE.md는 사용자가 직접 관리한다.
# 사용자가 "claude.md는 내가 수정했으니까 하지 마"라고 명시했다. 승인 없이
# 고치는 일이 없도록 도구 단계에서 막는다(exit 2 = 차단, stderr가 모델에 전달).
set -euo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
[ -n "$file_path" ] || exit 0

case "$(basename "$file_path")" in
  CLAUDE.md)
    echo "차단됨: CLAUDE.md는 사용자가 직접 관리하는 파일이다. 수정이 필요하면 무엇을 왜 바꾸려는지 사용자에게 먼저 말하고 승인을 받아라. 승인 없이 우회하지 마라." >&2
    exit 2
    ;;
esac
exit 0
