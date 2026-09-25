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
# D-03, new quick SUMMARY
projQ="$(new_project)"
Q="sid-d03-quick-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$Q" startup)" "$projQ"
mkdir -p "$projQ/.planning/quick/260101-abc-x"
echo "summary" > "$projQ/.planning/quick/260101-abc-x/260101-abc-SUMMARY.md"

hook plant8-session-boundary.sh post-tool "$(payload_tool "$Q" Read)" "$projQ"
expect_contains "D-03 new quick SUMMARY: post-tool announces" "$HOOK_STDOUT" "260101-abc"

hook plant8-session-boundary.sh pre-tool "$(payload_agent "$Q" gsd-executor)" "$projQ"
expect_rc "D-03 new quick SUMMARY: pre-tool blocks gsd-executor" 2 "$HOOK_RC"
expect_contains "D-03 new quick SUMMARY: pre-tool message" "$HOOK_STDERR" "이미 플랜이 끝났다"

hook plant8-session-boundary.sh stop "$(payload_session "$Q")" "$projQ"
expect_contains "D-03 new quick SUMMARY: stop blocks once" "$HOOK_STDOUT" '"decision":"block"'
hook plant8-session-boundary.sh stop "$(payload_session "$Q")" "$projQ"
expect_empty "D-03 new quick SUMMARY: second stop empty" "$HOOK_STDOUT"

# D-03, quick SUMMARY that existed before session start
projQ2="$(new_project)"
mkdir -p "$projQ2/.planning/quick/260102-xyz-y"
echo "summary" > "$projQ2/.planning/quick/260102-xyz-y/260102-xyz-SUMMARY.md"
Q2="sid-d03-baseline-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$Q2" startup)" "$projQ2"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$Q2" Read)" "$projQ2"
expect_empty "D-03 pre-existing quick SUMMARY not announced" "$HOOK_STDOUT"

# D-03, missing quick dir
projQ3="$(new_project)"
rm -rf "$projQ3/.planning/quick"
Q3="sid-d03-missing-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$Q3" startup)" "$projQ3"
expect_rc "D-03 missing quick dir: session-start exit 0" 0 "$HOOK_RC"
expect_rc "D-03 missing quick dir: baseline file written" 0 "$([ -f "${TMPDIR}/plant8-session-boundary/${Q3}.baseline" ] && echo 0 || echo 1)"

# ---------------------------------------------------------------------------
# Existing behavior still holds: new phase SUMMARY still announces
projE="$(new_project)"
E="sid-existing-phase-summary-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$E" startup)" "$projE"
mkdir -p "$projE/.planning/phases/04-test"
echo "summary" > "$projE/.planning/phases/04-test/04-01-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$E" Read)" "$projE"
expect_contains "existing: phase SUMMARY still announces 04-01" "$HOOK_STDOUT" "04-01"

# ---------------------------------------------------------------------------
# Branch-switch: baseline taken on main, then session checks out a branch that
# already has SUMMARYs finished by earlier sessions -> those must not block
# this session's first gsd-executor dispatch or be announced as "new".
projB="$(new_project)"
B="sid-branch-switch-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$B" startup)" "$projB"
git -C "$projB" checkout -qb phase-branch
mkdir -p "$projB/.planning/phases/04-test"
echo "summary" > "$projB/.planning/phases/04-test/04-08-SUMMARY.md"
echo "summary" > "$projB/.planning/phases/04-test/04-10-SUMMARY.md"

hook plant8-session-boundary.sh post-tool "$(payload_tool "$B" Read)" "$projB"
expect_empty "branch-switch: pre-existing branch SUMMARYs not announced" "$HOOK_STDOUT"

hook plant8-session-boundary.sh pre-tool "$(payload_agent "$B" gsd-executor)" "$projB"
expect_rc "branch-switch: gsd-executor not blocked by branch's own finished plans" 0 "$HOOK_RC"

# After the rebase, a genuinely new SUMMARY from this session must still block.
echo "summary" > "$projB/.planning/phases/04-test/04-25-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$B" Read)" "$projB"
expect_contains "branch-switch: own new SUMMARY still announces after rebase" "$HOOK_STDOUT" "04-25"

hook plant8-session-boundary.sh pre-tool "$(payload_agent "$B" gsd-executor)" "$projB"
expect_rc "branch-switch: own new SUMMARY still blocks gsd-executor" 2 "$HOOK_RC"

# Once a boundary was already crossed this session, switching branches again
# must not reset the count (D-01 must still hold).
projB2="$(new_project)"
B2="sid-branch-switch-noreset-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$B2" startup)" "$projB2"
mkdir -p "$projB2/.planning/phases/04-test"
echo "summary" > "$projB2/.planning/phases/04-test/04-01-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$B2" Read)" "$projB2"
expect_contains "branch-switch-noreset: own SUMMARY announced on main" "$HOOK_STDOUT" "04-01"

git -C "$projB2" checkout -qb phase-branch2
echo "summary" > "$projB2/.planning/phases/04-test/04-40-SUMMARY.md"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$B2" gsd-executor)" "$projB2"
expect_rc "branch-switch-noreset: gsd-executor still blocked after switch" 2 "$HOOK_RC"

# Old-format baseline (no recorded branch) is treated the same as a mismatch:
# a switch is detected and, with no boundary crossed yet, the baseline rebases.
projB3="$(new_project)"
B3="sid-branch-switch-oldformat-$$"
hook plant8-session-boundary.sh session-start "$(payload_session_start "$B3" startup)" "$projB3"
rm -f "${TMPDIR}/plant8-session-boundary/${B3}.branch"
git -C "$projB3" checkout -qb phase-branch3
mkdir -p "$projB3/.planning/phases/04-test"
echo "summary" > "$projB3/.planning/phases/04-test/04-08-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$B3" Read)" "$projB3"
expect_empty "branch-switch old-format baseline: pre-existing SUMMARY not announced" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
# main 병합: 세션 도중 origin/main을 병합해 들어온 다른 플랜의 SUMMARY는 이 세션의
# 플랜 종료로 세지 않는다. 이 세션이 새로 만든 SUMMARY는 그대로 센다.
projMg="$(new_project)"
Mg="sid-main-merge-$$"
git -C "$projMg" branch -q -M main
git -C "$projMg" checkout -qb work
hook plant8-session-boundary.sh session-start "$(payload_session_start "$Mg" startup)" "$projMg"
git -C "$projMg" checkout -q main
echo "summary" > "$projMg/.planning/phases/04-test/04-30-SUMMARY.md"
git -C "$projMg" add .planning && git -C "$projMg" commit -qm "other plan"
git -C "$projMg" update-ref refs/remotes/origin/main main
git -C "$projMg" checkout -q work
git -C "$projMg" merge -q --no-edit origin/main

hook plant8-session-boundary.sh post-tool "$(payload_tool "$Mg" Bash)" "$projMg"
expect_empty "main-merge: 병합으로 들어온 SUMMARY는 알리지 않음" "$HOOK_STDOUT"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$Mg" gsd-executor)" "$projMg"
expect_rc "main-merge: 병합으로 들어온 SUMMARY는 gsd-executor를 막지 않음" 0 "$HOOK_RC"
hook plant8-session-boundary.sh stop "$(payload_tool "$Mg" Stop)" "$projMg"
expect_empty "main-merge: 병합으로 들어온 SUMMARY로 stop을 막지 않음" "$HOOK_STDOUT"

echo "summary" > "$projMg/.planning/phases/04-test/04-31-SUMMARY.md"
hook plant8-session-boundary.sh post-tool "$(payload_tool "$Mg" Write)" "$projMg"
expect_contains "main-merge: 이 세션이 만든 SUMMARY는 알림" "$HOOK_STDOUT" "04-31"
expect_true "main-merge: 알림에 병합된 SUMMARY는 없음" "$(printf '%s' "$HOOK_STDOUT" | grep -q '04-30' && echo false || echo true)"
hook plant8-session-boundary.sh pre-tool "$(payload_agent "$Mg" gsd-executor)" "$projMg"
expect_rc "main-merge: 이 세션이 만든 SUMMARY는 gsd-executor를 막음" 2 "$HOOK_RC"

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
