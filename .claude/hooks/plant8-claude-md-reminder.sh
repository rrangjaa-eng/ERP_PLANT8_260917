#!/usr/bin/env bash
# PostToolUse 훅 — 도구를 N번 쓸 때마다 CLAUDE.md 전문을 컨텍스트에 다시 넣는다.
# 매 턴 체크리스트(plant8-procedure-checklist.sh)만으로는 긴 세션에서 절차를
# 제멋대로 바꾸는 일을 막지 못했다(2026-09-23, /gsd-plan-phase를 워크플로대로
# 돌리지 않음). 사용자 요청으로 전문을 주기적으로 다시 읽힌다.
# 서브에이전트는 agent_id별로 따로 센다.
set -euo pipefail

INTERVAL="${PLANT8_CLAUDE_MD_INTERVAL:-25}"
payload="$(cat)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // "main"')"

state_dir="${TMPDIR:-/tmp}/plant8-claude-md-reminder"
mkdir -p "$state_dir"
counter_file="$state_dir/${session}-${agent}"

count=0
[ -f "$counter_file" ] && count="$(cat "$counter_file")"
count=$((count + 1))
echo "$count" > "$counter_file"

[ $((count % INTERVAL)) -eq 0 ] || exit 0

claude_md="${CLAUDE_PROJECT_DIR:-.}/CLAUDE.md"
[ -f "$claude_md" ] || exit 0

ctx="[CLAUDE.md 주기 상기 — 도구 ${count}회째. 아래 전문을 지금 다시 읽고, 지금 하는 일이 어긋나 있으면 먼저 멈추고 사용자에게 말하라]
$(cat "$claude_md")"

jq -nc --arg ctx "$ctx" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
