#!/usr/bin/env bash
# 회귀 테스트 — plant8-session-boundary.sh
# payload를 stdin으로 넣어 각 이벤트를 검증한다. 실제 리포를 절대 건드리지 않는다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="$(cd "$HOOKS/../.." && pwd)"

export TMPDIR
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

gates_checksum() {
  find "$REPO/.claude/gates" -type f -name '*.log' 2>/dev/null | sort | xargs -r cat | md5sum | cut -d' ' -f1
}
REAL_GATES_BEFORE="$(gates_checksum)"

PASS=0
FAIL=0

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

expect_true() {
  local desc="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc (expected true, got: $cond)"
  fi
}

new_project() {
  local dir
  dir="$(mktemp -d "$TMPDIR/proj.XXXXXX")"
  mkdir -p "$dir/.planning/phases/04-test" "$dir/.planning/quick" "$dir/.claude/gates" "$dir/docs/designs"
  printf 'current_phase: 4\n' > "$dir/.planning/STATE.md"
  git -C "$dir" init -q
  git -C "$dir" config user.name "test"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" commit -q --allow-empty -m "init"
  printf '%s' "$dir"
}

# hook <script> <event> <json> <project-dir>
hook() {
  local script="$1" event="$2" json="$3" project="$4"
  local errfile
  errfile="$(mktemp "$TMPDIR/stderr.XXXXXX")"
  HOOK_STDOUT="$(printf '%s' "$json" | CLAUDE_PROJECT_DIR="$project" bash "$HOOKS/$script" "$event" 2>"$errfile")"
  HOOK_RC=$?
  HOOK_STDERR="$(cat "$errfile")"
  rm -f "$errfile"
}

payload_skill() {
  local session="$1" skill="$2" agent="${3:-}"
  if [ -n "$agent" ]; then
    jq -nc --arg s "$session" --arg sk "$skill" --arg a "$agent" \
      '{session_id:$s, tool_name:"Skill", tool_input:{skill:$sk}, agent_id:$a}'
  else
    jq -nc --arg s "$session" --arg sk "$skill" \
      '{session_id:$s, tool_name:"Skill", tool_input:{skill:$sk}}'
  fi
}

payload_agent() {
  local session="$1" sub="$2" agent="${3:-}"
  if [ -n "$agent" ]; then
    jq -nc --arg s "$session" --arg sub "$sub" --arg a "$agent" \
      '{session_id:$s, tool_name:"Agent", tool_input:{subagent_type:$sub}, agent_id:$a}'
  else
    jq -nc --arg s "$session" --arg sub "$sub" \
      '{session_id:$s, tool_name:"Agent", tool_input:{subagent_type:$sub}}'
  fi
}

payload_prompt() {
  local session="$1" prompt="$2"
  jq -nc --arg s "$session" --arg p "$prompt" '{session_id:$s, prompt:$p}'
}

payload_tool() {
  local session="$1" tool="$2"
  jq -nc --arg s "$session" --arg t "$tool" '{session_id:$s, tool_name:$t}'
}

record_skill() {
  local project="$1" session="$2" skill="$3" agent="${4:-}"
  local payload
  payload="$(payload_skill "$session" "$skill" "$agent")"
  printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" bash "$HOOKS/plant8-skill-gate.sh" record-skill >/dev/null 2>&1
}

record_prompt() {
  local project="$1" session="$2" prompt="$3"
  local payload
  payload="$(payload_prompt "$session" "$prompt")"
  printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" bash "$HOOKS/plant8-skill-gate.sh" record-prompt >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Control: no gate review -> exit 0
proj="$(new_project)"
S_CTRL="sid-ctrl-$$"
hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S_CTRL" gsd-execute-phase)" "$proj"
expect_rc "control: no gate review -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-01, gate review started via the Skill tool
proj="$(new_project)"
S="sid-d01-skill-$$"
record_skill "$proj" "$S" plan-ceo-review

for sk in gsd-execute-phase gsd-plan-phase gsd-quick gsd-quick-batch gsd-autonomous; do
  hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" "$sk")" "$proj"
  expect_rc "D-01 blocks Skill $sk" 2 "$HOOK_RC"
  expect_contains "D-01 blocks Skill $sk stderr" "$HOOK_STDERR" "게이트 리뷰"
done

hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" "gstack:plan-eng-review")" "$proj"
expect_rc "D-01 blocks gstack:plan-eng-review (normalized)" 2 "$HOOK_RC"
expect_contains "D-01 blocks gstack:plan-eng-review stderr" "$HOOK_STDERR" "게이트 리뷰"

hook plant8-session-boundary.sh pre-tool "$(payload_agent "$S" gsd-planner)" "$proj"
expect_rc "D-01 blocks Agent gsd-planner" 2 "$HOOK_RC"
expect_contains "D-01 blocks Agent gsd-planner stderr" "$HOOK_STDERR" "게이트 리뷰"

hook plant8-session-boundary.sh pre-tool "$(payload_agent "$S" gsd-executor)" "$proj"
expect_rc "D-01 blocks Agent gsd-executor" 2 "$HOOK_RC"
expect_contains "D-01 blocks Agent gsd-executor stderr" "$HOOK_STDERR" "게이트 리뷰"

hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" plan-ceo-review)" "$proj"
expect_rc "D-01 allows re-invoking the same review" 0 "$HOOK_RC"

hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" gsd-pause-work)" "$proj"
expect_rc "D-01 allows gsd-pause-work" 0 "$HOOK_RC"

hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" verification-before-completion)" "$proj"
expect_rc "D-01 allows verification-before-completion" 0 "$HOOK_RC"

hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S" gsd-quick sub1)" "$proj"
expect_rc "D-01 subagent payload passes" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-01, gate review started via a typed slash command
proj2="$(new_project)"
S2="sid-d01-prompt-$$"
record_prompt "$proj2" "$S2" "/plan-eng-review"
hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S2" gsd-execute-phase)" "$proj2"
expect_rc "D-01 typed slash command blocks" 2 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-01, no leak between sessions
S3="sid-d01-noleak-$$"
hook plant8-session-boundary.sh pre-tool "$(payload_skill "$S3" gsd-execute-phase)" "$proj2"
expect_rc "D-01 no leak between sessions" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# Existing behavior still holds: session-boundary does not count gsd-executor dispatches
proj4="$(new_project)"
S4="sid-existing-executor-$$"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$S4" gsd-executor)" "$proj4"
expect_rc "existing: first Agent gsd-executor -> exit 0" 0 "$HOOK_RC"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$S4" gsd-executor)" "$proj4"
expect_rc "existing: second Agent gsd-executor -> exit 0 (D-04 lives in skill-gate)" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# Wiring: settings.json has PreToolUse matcher Skill -> session-boundary pre-tool
WIRED="$(jq -e '[.hooks.PreToolUse[]? | select(.matcher=="Skill") | .hooks[]? | select(.command | test("plant8-session-boundary\\.sh pre-tool"))] | length > 0' "$REPO/.claude/settings.json" 2>/dev/null)"
[ "$WIRED" = "true" ] || WIRED="false"
expect_true "settings.json wires PreToolUse Skill -> plant8-session-boundary.sh pre-tool" "$WIRED"

# ---------------------------------------------------------------------------
# Isolation: real gate logs unchanged
REAL_GATES_AFTER="$(gates_checksum)"
if [ "$REAL_GATES_BEFORE" = "$REAL_GATES_AFTER" ]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: real repo .claude/gates/*.log changed by test run"
fi

echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
