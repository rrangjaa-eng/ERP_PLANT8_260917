#!/usr/bin/env bash
# 회귀 테스트 — plant8-status-page-guard.sh
# 가짜 JSONL transcript를 TMPDIR에 만들어 Stop 훅의 막음/통과를 검증한다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS="$(cd "$SCRIPT_DIR/.." && pwd)"

export TMPDIR
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
HOOK_STDOUT=""
HOOK_STDERR=""
HOOK_RC=0

expect_rc() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc (expected rc=$expected, got rc=$actual; stderr=$HOOK_STDERR; stdout=$HOOK_STDOUT)"
  fi
}

expect_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc (expected to contain '$needle', got: $haystack)"
  fi
}

expect_empty() {
  local desc="$1" val="$2"
  if [ -z "$val" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc (expected empty, got: $val)"
  fi
}

run_hook() {
  local json="$1" errfile="$TMPDIR/stderr"
  HOOK_STDOUT="$(printf '%s' "$json" | bash "$HOOKS/plant8-status-page-guard.sh" 2>"$errfile")"
  HOOK_RC=$?
  HOOK_STDERR="$(cat "$errfile")"
}

# transcript 조각
user_prompt() { jq -nc --arg t "$1" '{type:"user",message:{role:"user",content:$t}}'; }
user_text_array() { jq -nc --arg t "$1" '{type:"user",message:{role:"user",content:[{type:"text",text:$t}]}}'; }
tool_result() { jq -nc '{type:"user",message:{role:"user",content:[{type:"tool_result",tool_use_id:"x",content:"ok"}]}}'; }
tool_use() { jq -nc --arg n "$1" --argjson i "${2:-{\}}" '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:"x",name:$n,input:$i}]}}'; }
assistant_text() { jq -nc --arg t "$1" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}'; }

N=0
new_transcript() { N=$((N + 1)); T="$TMPDIR/t$N.jsonl"; : > "$T"; }
add() { printf '%s\n' "$1" >> "$T"; }
stop_payload() { jq -nc --arg p "$T" --argjson a "${1:-false}" '{hook_event_name:"Stop",transcript_path:$p,stop_hook_active:$a}'; }

expect_block() {
  local desc="$1"
  expect_rc "$desc -> rc 0" 0 "$HOOK_RC"
  local d
  d="$(printf '%s' "$HOOK_STDOUT" | jq -r '.decision' 2>/dev/null)"
  expect_contains "$desc -> decision block" "$d" "block"
  expect_contains "$desc -> reason names update_status_page" "$HOOK_STDOUT" "mcp__hearthbot__update_status_page"
}

expect_pass() {
  local desc="$1"
  expect_rc "$desc -> rc 0" 0 "$HOOK_RC"
  expect_empty "$desc -> no output" "$HOOK_STDOUT"
}

# coordinator 기록이 이미 있는 이전 턴
coordinator_history() {
  add "$(user_prompt '스레드 멈춤 점검')"
  add "$(tool_use mcp__hearthbot__post_message '{"text":"안녕"}')"
  add "$(tool_result)"
  add "$(assistant_text '끝')"
}

# 1. stop_hook_active true -> 통과
new_transcript; coordinator_history
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
run_hook "$(stop_payload true)"
expect_pass "stop_hook_active true"

# 2. transcript 없음 -> 통과
run_hook '{"hook_event_name":"Stop","transcript_path":"/nonexistent/x.jsonl","stop_hook_active":false}'
expect_pass "missing transcript"
run_hook '{"hook_event_name":"Stop","stop_hook_active":false}'
expect_pass "no transcript_path"

# 3. 스레드 세션(reply/set_thread_resolved/update_status만) -> 통과
new_transcript
add "$(user_prompt '일 끝내')"
add "$(tool_use mcp__hearthbot__update_status '{"text":"x"}')"
add "$(tool_result)"
add "$(tool_use mcp__hearthbot__reply '{"text":"완료"}')"
add "$(tool_result)"
add "$(tool_use mcp__hearthbot__set_thread_resolved '{"resolved":true}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_pass "thread session with set_thread_resolved"

# 4. coordinator 턴에 start_thread_session, 현황표 없음 -> 막음
new_transcript; coordinator_history
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(tool_result)"
add "$(assistant_text '열었다')"
run_hook "$(stop_payload)"
expect_block "start_thread_session without status page"

# 5. 같은데 update_status_page 있음 -> 통과
add "$(tool_use mcp__hearthbot__update_status_page '{"markdown":"x"}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_pass "start_thread_session with status page"

# 6. set_thread_resolved (coordinator) -> 막음
new_transcript; coordinator_history
add "$(user_prompt '정리해')"
add "$(tool_use mcp__hearthbot__set_thread_resolved '{"thread_id":"cmsg_1","resolved":true}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_block "set_thread_resolved in coordinator"

# 7. merge_pull_request -> 막음
new_transcript; coordinator_history
add "$(user_prompt '머지해')"
add "$(tool_use mcp__github__merge_pull_request '{"pullNumber":3}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_block "merge_pull_request"

# 8. message_thread에 "머지해" -> 막음
new_transcript; coordinator_history
add "$(user_prompt '진행시켜')"
add "$(tool_use mcp__hearthbot__message_thread '{"thread_id":"cmsg_1","message":"PR #3 머지해"}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_block "message_thread with 머지"

# 8b. text 필드에 머지 -> 막음
new_transcript; coordinator_history
add "$(user_prompt '진행시켜')"
add "$(tool_use mcp__hearthbot__message_thread '{"thread_id":"cmsg_1","text":"머지 진행"}')"
run_hook "$(stop_payload)"
expect_block "message_thread text field with 머지"

# 9. message_thread에 머지 없음 -> 통과
new_transcript; coordinator_history
add "$(user_prompt '진행시켜')"
add "$(tool_use mcp__hearthbot__message_thread '{"thread_id":"cmsg_1","message":"테스트 다시 돌려"}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_pass "message_thread without 머지"

# 10. 트리거가 이전 턴에만 있음 -> 통과
new_transcript; coordinator_history
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(tool_result)"
add "$(user_text_array '상태만 알려줘')"
add "$(assistant_text '괜찮다')"
run_hook "$(stop_payload)"
expect_pass "trigger only in previous turn"

# 11. tool_result는 턴 경계가 아님 — 트리거 뒤에 tool_result가 여럿 와도 막음
new_transcript; coordinator_history
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(tool_result)"
add "$(tool_use mcp__hearthbot__reply '{"text":"x"}')"
add "$(tool_result)"
run_hook "$(stop_payload)"
expect_block "tool_result not a turn boundary"

# 12. JSON이 아닌 줄·다른 타입 섞여도 동작
new_transcript; coordinator_history
add 'not json at all'
add '{"type":"summary","summary":"x"}'
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
run_hook "$(stop_payload)"
expect_block "tolerates junk lines"

# 13. isMeta 스킬 본문(배열 text)은 턴 경계가 아님 -> 막음
new_transcript; coordinator_history
add "$(user_prompt '새 스레드 열어')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(tool_result)"
add "$(jq -nc '{type:"user",isMeta:true,message:{role:"user",content:[{type:"text",text:"Base directory for this skill: /x"}]}}')"
add "$(assistant_text '끝')"
run_hook "$(stop_payload)"
expect_block "isMeta skill body not a turn boundary"

# 14. Stop hook feedback(isMeta 문자열)은 턴 경계가 아님 -> 막음
new_transcript; coordinator_history
add "$(user_prompt '머지해')"
add "$(tool_use mcp__github__merge_pull_request '{"pullNumber":3}')"
add "$(tool_result)"
add "$(jq -nc '{type:"user",isMeta:true,message:{role:"user",content:"Stop hook feedback:\n[x.sh]: commit"}}')"
run_hook "$(stop_payload)"
expect_block "isMeta stop hook feedback not a turn boundary"

# 15. 서브에이전트(isSidechain)·압축 요약(isCompactSummary) 항목은 턴 경계가 아님 -> 막음
new_transcript; coordinator_history
add "$(user_prompt '정리해')"
add "$(tool_use mcp__hearthbot__set_thread_resolved '{"thread_id":"cmsg_1","resolved":true}')"
add "$(tool_result)"
add "$(jq -nc '{type:"user",isSidechain:true,message:{role:"user",content:"서브에이전트 지시"}}')"
add "$(jq -nc '{type:"user",isCompactSummary:true,message:{role:"user",content:"This session is being continued"}}')"
run_hook "$(stop_payload)"
expect_block "sidechain and compact summary not turn boundaries"

# 16. 실제 형식: promptId가 턴을 가른다. 이전 턴(P1)의 현황표 갱신이
#     새 턴(P2, isMeta 서브에이전트 인계로 시작)의 머지를 덮지 않는다 -> 막음
new_transcript; coordinator_history
add "$(jq -nc '{type:"user",promptId:"P1",message:{role:"user",content:"새 스레드 열어"}}')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(tool_use mcp__hearthbot__update_status_page '{"markdown":"x"}')"
add "$(jq -nc '{type:"user",promptId:"P1",message:{role:"user",content:[{type:"tool_result",tool_use_id:"x",content:"ok"}]}}')"
add "$(jq -nc '{type:"user",promptId:"P2",isMeta:true,message:{role:"user",content:"Another Claude session sent a message: 끝"}}')"
add "$(tool_use mcp__github__merge_pull_request '{"pullNumber":3}')"
add "$(jq -nc '{type:"user",promptId:"P2",message:{role:"user",content:[{type:"tool_result",tool_use_id:"x",content:"ok"}]}}')"
add "$(jq -nc '{type:"user",promptId:"P2",isMeta:true,message:{role:"user",content:[{type:"text",text:"Base directory for this skill: /x"}]}}')"
run_hook "$(stop_payload)"
expect_block "promptId turn (isMeta peer start) with merge"

# 17. 같은 형식, 새 턴(P2)에 트리거 없음 -> 통과
new_transcript; coordinator_history
add "$(jq -nc '{type:"user",promptId:"P1",message:{role:"user",content:"새 스레드 열어"}}')"
add "$(tool_use mcp__hearthbot__start_thread_session '{"prompt":"x"}')"
add "$(jq -nc '{type:"user",promptId:"P2",isMeta:true,message:{role:"user",content:"Another Claude session sent a message: 끝"}}')"
add "$(assistant_text '확인')"
run_hook "$(stop_payload)"
expect_pass "promptId turn without trigger"

# 18. 같은 턴: 현황표 갱신 -> 스킬 본문(isMeta) -> 해결 처리 -> 통과(갱신이 같은 턴)
new_transcript; coordinator_history
add "$(user_prompt '정리해')"
add "$(tool_use mcp__hearthbot__update_status_page '{"markdown":"x"}')"
add "$(tool_result)"
add "$(jq -nc '{type:"user",isMeta:true,message:{role:"user",content:[{type:"text",text:"Base directory for this skill: /x"}]}}')"
add "$(tool_use mcp__hearthbot__set_thread_resolved '{"thread_id":"cmsg_1","resolved":true}')"
run_hook "$(stop_payload)"
expect_pass "status page before skill body in same turn"

echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
