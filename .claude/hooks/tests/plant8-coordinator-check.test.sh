#!/usr/bin/env bash
# 회귀 테스트 — plant8-coordinator-check.sh
# payload를 stdin으로 넣어 "스레드 멈춤 점검" 프롬프트에만 체크리스트가 주입되는지 검증한다.
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
  HOOK_STDOUT="$(printf '%s' "$json" | bash "$HOOKS/plant8-coordinator-check.sh" 2>"$errfile")"
  HOOK_RC=$?
  HOOK_STDERR="$(cat "$errfile")"
}

# 문구가 있으면 체크리스트 주입
run_hook '{"prompt":"스레드 멈춤 점검 (예약 실행)","hook_event_name":"UserPromptSubmit"}'
expect_rc "phrase present -> rc 0" 0 "$HOOK_RC"
EVENT="$(printf '%s' "$HOOK_STDOUT" | jq -r '.hookSpecificOutput.hookEventName' 2>/dev/null)"
expect_contains "valid JSON with hookEventName" "$EVENT" "UserPromptSubmit"
CTX="$(printf '%s' "$HOOK_STDOUT" | jq -r '.hookSpecificOutput.additionalContext' 2>/dev/null)"
expect_contains "header" "$CTX" "[스레드 멈춤 점검 — 7개 모두, 빠짐없이]"
for n in 1 2 3 4 5 6 7; do
  expect_contains "item $n present" "$CTX" "$n. "
done
expect_contains "item 1 thread" "$CTX" "next_cursor를 끝까지"
expect_contains "item 5 status page" "$CTX" "update_status_page"
expect_contains "item 7 reschedule" "$CTX" "+20분"
expect_contains "chat rule" "$CTX" "채팅에는 사용자가 할 일이나 마일스톤만 올린다."

# 문구가 없으면 아무것도 출력하지 않음
run_hook '{"prompt":"PR 상태 알려줘","hook_event_name":"UserPromptSubmit"}'
expect_rc "phrase absent -> rc 0" 0 "$HOOK_RC"
expect_empty "phrase absent -> no output" "$HOOK_STDOUT"

# prompt 필드가 없어도 조용히 통과
run_hook '{"hook_event_name":"UserPromptSubmit"}'
expect_rc "no prompt -> rc 0" 0 "$HOOK_RC"
expect_empty "no prompt -> no output" "$HOOK_STDOUT"

echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
