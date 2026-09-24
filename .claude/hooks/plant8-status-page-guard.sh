#!/usr/bin/env bash
# Stop 훅 — 조정(coordinator) 세션이 새 스레드·해결 처리·머지(지시)를 한 턴에
# 현황표(update_status_page)를 갱신하지 않고 끝내면 한 번 막는다.
# 현황표가 실제 상태보다 뒤처져 사용자가 틀린 "하실 일"을 보는 일이 있었다.
# 사용자 승인(2026-09-25 KST, 「훅 걸어」).
#
# 조정 세션 판별: transcript 어디에든 update_status_page·post_message·
# start_thread_session·message_thread 사용이 있어야 한다. 스레드 세션도
# set_thread_resolved를 쓰므로 그것만으로는 조정 세션으로 보지 않는다.
# 이번 턴: 마지막 user 항목의 promptId를 처음 가진 항목부터(한 턴의 tool_result·
# 스킬 본문·Stop 훅 피드백은 같은 promptId). promptId가 없으면 마지막 "진짜"
# 사용자 프롬프트(tool_result·isMeta·isSidechain·isCompactSummary가 아닌 user 항목) 뒤.
set -euo pipefail

payload="$(cat)"
[ "$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
[ -n "$transcript" ] && [ -r "$transcript" ] || exit 0

verdict="$(jq -R 'fromjson? // empty' "$transcript" | jq -rs '
  def uses: [.[] | select(.type == "assistant") | .message.content
             | if type == "array" then .[] else empty end
             | select(type == "object" and .type == "tool_use")];
  def real_prompt: .type == "user" and .isMeta != true and .isSidechain != true
    and .isCompactSummary != true and (.message.content
      | if type == "string" then true
        elif type == "array" then all(.[]; (type == "object" and .type == "tool_result") | not)
        else false end);
  (uses | map(.name)) as $all
  | if ($all | any(. == "mcp__hearthbot__update_status_page" or . == "mcp__hearthbot__post_message"
                   or . == "mcp__hearthbot__start_thread_session" or . == "mcp__hearthbot__message_thread")) | not
    then "pass"
    else
      [to_entries[] | select(.value.type == "user" and .value.isSidechain != true
                             and (.value.promptId | type) == "string")] as $pe
      | (if ($pe | length) > 0
         then ($pe[-1].value.promptId) as $pid
              | ([$pe[] | select(.value.promptId == $pid) | .key] | first)
         else ([to_entries[] | select(.value | real_prompt) | .key] | last // -1) + 1
         end) as $start
      | (.[$start:] | uses) as $turn
      | if ($turn | any(.name == "mcp__hearthbot__update_status_page")) then "pass"
        elif ($turn | any(
               .name == "mcp__hearthbot__start_thread_session"
               or .name == "mcp__hearthbot__set_thread_resolved"
               or .name == "mcp__github__merge_pull_request"
               or (.name == "mcp__hearthbot__message_thread"
                   and ([.input | .. | strings] | any(contains("머지"))))))
        then "block" else "pass" end
    end
' 2>/dev/null || echo pass)"

if [ "$verdict" = "block" ]; then
  jq -nc '{decision:"block", reason:"이번 턴에 새 스레드·해결 처리·머지(지시)가 있었는데 현황표를 갱신하지 않았다. mcp__hearthbot__update_status_page로 현황표를 갱신한 뒤 끝낸다."}'
fi
exit 0
