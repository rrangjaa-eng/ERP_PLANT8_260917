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

payload_session_start() {
  local session="$1" source="${2:-startup}"
  jq -nc --arg s "$session" --arg src "$source" '{session_id:$s, source:$src}'
}

payload_session() {
  local session="$1"
  jq -nc --arg s "$session" '{session_id:$s}'
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
# D-01, review not yet done (fresh project, session G)
projG="$(new_project)"
G="sid-d01-done-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$G" startup)" "$projG"
record_skill "$projG" "$G" plan-ceo-review

hook plant8-session-boundary.sh post-tool "$(payload_tool "$G" Read)" "$projG"
expect_empty "D-01 review not done: post-tool empty" "$HOOK_STDOUT"

hook plant8-session-boundary.sh stop "$(payload_session "$G")" "$projG"
expect_rc "D-01 review not done: stop exit 0" 0 "$HOOK_RC"
expect_empty "D-01 review not done: stop empty stdout" "$HOOK_STDOUT"

# D-01, review done (same project, session G)
echo "review" > "$projG/docs/designs/x-ceo-review-test.md"
git -C "$projG" add docs/designs/x-ceo-review-test.md
git -C "$projG" commit -q -m "docs: ceo review report"

hook plant8-session-boundary.sh post-tool "$(payload_tool "$G" Read)" "$projG"
expect_contains "D-01 review done: post-tool announces 게이트 리뷰 종료" "$HOOK_STDOUT" "게이트 리뷰 종료"
expect_contains "D-01 review done: post-tool mentions /plan-ceo-review" "$HOOK_STDOUT" "/plan-ceo-review"
expect_contains "D-01 announcement names plant8 environment id (fallback when PLANT8_ENV_ID unset)" "$HOOK_STDOUT" "env_01BjvDha7fqn18V6L1UywqDh"
expect_contains "D-01 announcement names the PLANT8_ENV_ID variable so another account knows what to set" "$HOOK_STDOUT" "PLANT8_ENV_ID"

hook plant8-session-boundary.sh post-tool "$(payload_tool "$G" Read)" "$projG"
expect_empty "D-01 review done: second post-tool empty (announced once)" "$HOOK_STDOUT"

hook plant8-session-boundary.sh stop "$(payload_session "$G")" "$projG"
expect_contains "D-01 review done: stop decision block" "$HOOK_STDOUT" '"decision":"block"'
expect_contains "D-01 review done: stop reason mentions 게이트 리뷰 종료" "$HOOK_STDOUT" "게이트 리뷰 종료"

hook plant8-session-boundary.sh stop "$(payload_session "$G")" "$projG"
expect_empty "D-01 review done: second stop empty" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
# D-01, older report commits don't count
projOld="$(new_project)"
Sold="sid-d01-old-$$"
echo "review" > "$projOld/docs/designs/old-review.md"
git -C "$projOld" add docs/designs/old-review.md
GIT_COMMITTER_DATE="2000-01-01T00:00:00Z" GIT_AUTHOR_DATE="2000-01-01T00:00:00Z" \
  git -C "$projOld" commit -q -m "docs: old review report"
record_skill "$projOld" "$Sold" plan-ceo-review

hook plant8-session-boundary.sh post-tool "$(payload_tool "$Sold" Read)" "$projOld"
expect_empty "D-01 older report commit doesn't count: post-tool empty" "$HOOK_STDOUT"

hook plant8-session-boundary.sh stop "$(payload_session "$Sold")" "$projOld"
expect_empty "D-01 older report commit doesn't count: stop empty" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
# 다른 계정의 환경: PLANT8_ENV_ID가 있으면 그 값을 쓰고 이 계정의 id는 나오지 않는다
projEnv="$(new_project)"
SEnv="sid-env-other-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$SEnv" startup)" "$projEnv"
record_skill "$projEnv" "$SEnv" plan-eng-review
echo "review" > "$projEnv/docs/designs/x-eng-review-test.md"
git -C "$projEnv" add docs/designs && git -C "$projEnv" commit -q -m "docs: eng review report"
HOOK_STDOUT_OTHER="$(printf '%s' "$(payload_tool "$SEnv" Read)" | PLANT8_ENV_ID=env_01OtherAccountPlant8 CLAUDE_PROJECT_DIR="$projEnv" bash "$HOOKS/plant8-session-boundary.sh" post-tool 2>/dev/null)"
expect_contains "env: PLANT8_ENV_ID set -> announcement uses that id" "$HOOK_STDOUT_OTHER" "env_01OtherAccountPlant8"
expect_true "env: PLANT8_ENV_ID set -> this account's id must not appear" "$(printf '%s' "$HOOK_STDOUT_OTHER" | grep -qF env_01BjvDha7fqn18V6L1UywqDh && echo false || echo true)"

# ---------------------------------------------------------------------------
# 사용자 결정(2026-10-01): 플랜·웨이브·quick 종료는 세션 경계가 아니다 — 같은 세션에서 다음 웨이브를 이어 간다.
# 세션 종료는 문맥 크기(gsd-context-monitor)나 독립 검토(게이트 리뷰·계획 완료) 경계로 정한다.
projWv="$(new_project)"
WV="sid-wave-$$"
printf -- '---\nwave: 1\n---\n' > "$projWv/.planning/phases/04-test/04-01-PLAN.md"
printf -- '---\nwave: 2\n---\n' > "$projWv/.planning/phases/04-test/04-02-PLAN.md"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$WV" startup)" "$projWv"
expect_rc "session-start exit 0" 0 "$HOOK_RC"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$WV" gsd-executor)" "$projWv"
expect_rc "wave: first executor dispatch -> exit 0" 0 "$HOOK_RC"
echo "summary" > "$projWv/.planning/phases/04-test/04-01-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$WV" Write)" "$projWv"
expect_empty "wave: wave 1 complete -> no announce" "$HOOK_STDOUT"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$WV" gsd-executor)" "$projWv"
expect_rc "wave: after wave 1 complete, executor (wave 2) allowed in same session" 0 "$HOOK_RC"
hook plant8-session-boundary.sh stop "$(payload_session "$WV")" "$projWv"
expect_empty "wave: stop not blocked after wave complete" "$HOOK_STDOUT"

# 옛 형식(wave 없는 플랜)도 SUMMARY가 생겨도 경계가 아니다
projE="$(new_project)"
E="sid-plan-summary-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$E" startup)" "$projE"
echo "summary" > "$projE/.planning/phases/04-test/04-01-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$E" Read)" "$projE"
expect_empty "plan SUMMARY: post-tool does not announce" "$HOOK_STDOUT"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$E" gsd-executor)" "$projE"
expect_rc "plan SUMMARY: next gsd-executor allowed" 0 "$HOOK_RC"

# quick SUMMARY도 경계가 아니다
projQ="$(new_project)"
Q="sid-quick-not-boundary-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$Q" startup)" "$projQ"
mkdir -p "$projQ/.planning/quick/260101-abc-x"
echo "summary" > "$projQ/.planning/quick/260101-abc-x/260101-abc-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$Q" Read)" "$projQ"
expect_empty "quick SUMMARY: post-tool does not announce" "$HOOK_STDOUT"
hook plant8-session-boundary.sh stop "$(payload_session "$Q")" "$projQ"
expect_empty "quick SUMMARY: stop not blocked" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
# 계획 완료(state.planned-phase)는 여전히 경계 — 실행 전 독립 게이트 리뷰
projP="$(new_project)"
P="sid-plan-done-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$P" startup)" "$projP"
PLAN_DONE="$(jq -nc --arg s "$P" '{session_id:$s, tool_name:"Bash", tool_input:{command:"node .claude/gsd-core/bin/gsd-tools.cjs state.planned-phase 04"}}')"
hook plant8-session-boundary.sh post-tool "$PLAN_DONE" "$projP"
expect_contains "plan done: post-tool announces 계획" "$HOOK_STDOUT" "계획(/gsd-plan-phase) 완료"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$P" gsd-executor)" "$projP"
expect_rc "plan done: gsd-executor blocked" 2 "$HOOK_RC"
expect_contains "plan done: block message mentions 계획 완료" "$HOOK_STDERR" "계획 완료"
hook plant8-session-boundary.sh stop "$(payload_session "$P")" "$projP"
expect_contains "plan done: stop blocks once" "$HOOK_STDOUT" '"decision":"block"'
hook plant8-session-boundary.sh session-start "$(payload_session_start "$P" startup)" "$projP"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$P" gsd-executor)" "$projP"
expect_rc "plan done: fresh startup clears the flag" 0 "$HOOK_RC"

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
