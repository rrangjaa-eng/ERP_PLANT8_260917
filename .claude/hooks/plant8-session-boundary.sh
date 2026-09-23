#!/usr/bin/env bash
# 세션 경계 훅 — 플랜 하나가 끝나면 그 세션에서 더 나아가지 않고 새 세션으로 넘긴다.
# 사용자 요청(2026-09-23): "플랜이 종료되면 새 세션으로 넘어가게 해".
#
# 플랜 종료로 보는 것(메인 에이전트 기준):
#   - 이 세션 시작 뒤 새 `.planning/phases/*/*-SUMMARY.md`가 생김(플랜 실행 완료)
#   - `state.planned-phase` 실행(/gsd-plan-phase 13b — 계획 완료)
#
# 동작(첫 인자 = 이벤트):
#   session-start : 지금 있는 SUMMARY 목록을 기준으로 저장(재개 때는 기준이 없을 때만)
#   post-tool     : 경계를 처음 감지하면 인계 순서를 컨텍스트에 넣는다
#   pre-tool      : 경계 뒤 gsd-executor를 띄우려 하면 막는다(exit 2)
#   stop          : 경계가 났는데 인계를 안 했으면 한 번 멈춤을 막고 인계를 시킨다
set -euo pipefail

event="${1:-}"
payload="$(cat)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // empty')"
project="${CLAUDE_PROJECT_DIR:-.}"

state_dir="${TMPDIR:-/tmp}/plant8-session-boundary"
mkdir -p "$state_dir"
baseline="$state_dir/${session}.baseline"
flag_plan_phase="$state_dir/${session}.plan-phase-done"
announced="$state_dir/${session}.announced"
stop_reminded="$state_dir/${session}.stop-reminded"

list_summaries() {
  find "$project/.planning/phases" -name '*-SUMMARY.md' -type f 2>/dev/null | sort
}

new_summaries() {
  [ -f "$baseline" ] || return 0
  comm -13 "$baseline" <(list_summaries) | xargs -r -n1 basename | sed 's/-SUMMARY\.md$//' | tr '\n' ' '
}

boundary_text() {
  local what="$1"
  cat <<EOF
[세션 경계 — ${what}]
이 세션에서 다음 플랜(또는 실행)을 시작하지 마라. 순서대로 한다:
1. verification-before-completion 스킬로 방금 끝난 결과를 확인한다.
2. 남은 변경을 커밋하고 푸시한다(훅 우회 금지).
3. /gsd-pause-work로 인계 문서를 만들고 커밋·푸시한다.
4. 새 세션을 연다 — 클라우드 세션이면 mcp__Claude_Code_Remote__create_session으로 같은 리포·같은 브랜치(outcome_branch 포함)에 prompt "/gsd-progress"를 넣어 만든다. 그 도구가 없으면 사용자에게 "새 세션에서 /gsd-progress"라고 알린다.
5. 사용자에게 새 세션을 알리고 이 세션의 작업을 끝낸다.
EOF
}

case "$event" in
  session-start)
    source="$(printf '%s' "$payload" | jq -r '.source // "startup"')"
    if [ "$source" = "startup" ] || [ ! -f "$baseline" ]; then
      list_summaries > "$baseline"
      rm -f "$flag_plan_phase" "$announced" "$stop_reminded"
    fi
    exit 0
    ;;

  post-tool)
    [ -z "$agent" ] || exit 0
    tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"
    if [ "$tool" = "Bash" ] && printf '%s' "$payload" | jq -r '.tool_input.command // empty' | grep -q 'state\.planned-phase'; then
      touch "$flag_plan_phase"
    fi
    done_plans="$(new_summaries)"
    what=""
    [ -n "$done_plans" ] && what="플랜 종료: ${done_plans}"
    [ -f "$flag_plan_phase" ] && what="${what:+$what · }계획(/gsd-plan-phase) 완료 — 13b 뒤 남은 13c~14단계는 끝내고, 15단계 자동 실행 대신 새 세션으로"
    [ -n "$what" ] || exit 0
    key="$(printf '%s' "$what" | md5sum | cut -d' ' -f1)"
    grep -qx "$key" "$announced" 2>/dev/null && exit 0
    echo "$key" >> "$announced"
    jq -nc --arg ctx "$(boundary_text "$what")" \
      '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
    ;;

  pre-tool)
    [ -z "$agent" ] || exit 0
    subagent="$(printf '%s' "$payload" | jq -r '.tool_input.subagent_type // empty')"
    [ "$subagent" = "gsd-executor" ] || exit 0
    done_plans="$(new_summaries)"
    if [ -n "$done_plans" ] || [ -f "$flag_plan_phase" ]; then
      echo "차단됨: 이 세션에서 이미 플랜이 끝났다(${done_plans:-계획 완료}). 다음 플랜 실행은 새 세션에서 한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
      exit 2
    fi
    exit 0
    ;;

  stop)
    done_plans="$(new_summaries)"
    { [ -n "$done_plans" ] || [ -f "$flag_plan_phase" ]; } || exit 0
    [ -f "$stop_reminded" ] && exit 0
    touch "$stop_reminded"
    jq -nc --arg reason "$(boundary_text "${done_plans:+플랜 종료: $done_plans}${done_plans:+ · }계획/실행 경계 — 인계를 마쳤는지 확인")
이미 1~5를 모두 마쳤다면 그렇다고 한 줄로 말하고 끝내라." \
      '{decision:"block", reason:$reason}'
    ;;
esac
