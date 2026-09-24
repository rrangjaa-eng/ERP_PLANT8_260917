#!/usr/bin/env bash
# 회귀 테스트 — plant8-skill-gate.sh (D-02: 커밋 전 verification-before-completion,
# D-04: 세션당 gsd-executor 한 번)
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

expect_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qF "$needle"; then
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc (expected NOT to contain '$needle', got: $haystack)"
  else
    PASS=$((PASS + 1))
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

payload_bash() {
  local session="$1" cmd="$2" cwd="$3" agent="${4:-}"
  if [ -n "$agent" ]; then
    jq -nc --arg s "$session" --arg c "$cmd" --arg d "$cwd" --arg a "$agent" \
      '{session_id:$s, tool_name:"Bash", tool_input:{command:$c}, cwd:$d, agent_id:$a}'
  else
    jq -nc --arg s "$session" --arg c "$cmd" --arg d "$cwd" \
      '{session_id:$s, tool_name:"Bash", tool_input:{command:$c}, cwd:$d}'
  fi
}

record_skill() {
  local project="$1" session="$2" skill="$3" agent="${4:-}"
  local payload
  payload="$(payload_skill "$session" "$skill" "$agent")"
  printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" bash "$HOOKS/plant8-skill-gate.sh" record-skill >/dev/null 2>&1
}

# 게이트 로그 줄을 skill-gate와 같은 형식으로 직접 쓴다: '<skill> <분단위 시각> session=<id>'
write_gate_line() {
  local project="$1" skill="$2" session="$3"
  mkdir -p "$project/.claude/gates"
  echo "$skill $(date -u +%Y-%m-%dT%H:%MZ) session=$session" >> "$project/.claude/gates/phase-04.log"
}

stage_file() {
  local project="$1" rel="$2" content="${3:-x}"
  mkdir -p "$(dirname "$project/$rel")"
  printf '%s\n' "$content" > "$project/$rel"
  git -C "$project" add "$rel"
}

# D-04: gsd-executor가 agent 이벤트의 다른 모든 검사를 통과하도록 준비한다.
executor_ready_session() {
  local project="$1" session="$2"
  write_gate_line "$project" plan-ceo-review "$session"
  write_gate_line "$project" plan-eng-review "$session"
  record_skill "$project" "$session" gsd-execute-phase
}

# ---------------------------------------------------------------------------
# D-02, 문서 커밋
projD="$(new_project)"
SD="sid-doc-$$"
stage_file "$projD" docs/note.md "note"
hook plant8-skill-gate.sh bash "$(payload_bash "$SD" 'git commit -m "docs: x"' "$projD")" "$projD"
expect_rc "doc commit without verification -> exit 2" 2 "$HOOK_RC"
expect_contains "doc commit stderr mentions verification-before-completion" "$HOOK_STDERR" "verification-before-completion"
expect_not_contains "doc commit stderr does not demand test-driven-development" "$HOOK_STDERR" "test-driven-development"

record_skill "$projD" "$SD" verification-before-completion
hook plant8-skill-gate.sh bash "$(payload_bash "$SD" 'git commit -m "docs: x"' "$projD")" "$projD"
expect_rc "doc commit after verification -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-02, 코드 커밋
projC="$(new_project)"
SC="sid-code-$$"
stage_file "$projC" app/x.ts "code"
record_skill "$projC" "$SC" verification-before-completion
hook plant8-skill-gate.sh bash "$(payload_bash "$SC" 'git commit -m "feat: x"' "$projC")" "$projC"
expect_rc "code commit with only verification -> exit 2" 2 "$HOOK_RC"
expect_contains "code commit stderr mentions test-driven-development" "$HOOK_STDERR" "test-driven-development"

record_skill "$projC" "$SC" test-driven-development
hook plant8-skill-gate.sh bash "$(payload_bash "$SC" 'git commit -m "feat: x"' "$projC")" "$projC"
expect_rc "code commit with TDD+verification -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-02, gsd-tools 커밋 (에이전트별 검사)
projG="$(new_project)"
SG="sid-gsdtools-$$"
mkdir -p "$projG/.planning"
GSD_CMD='node .claude/gsd-core/bin/gsd-tools.cjs commit "docs: x" --files .planning/x.md'
record_skill "$projG" "$SG" verification-before-completion
hook plant8-skill-gate.sh bash "$(payload_bash "$SG" "$GSD_CMD" "$projG" sub1)" "$projG"
expect_rc "gsd-tools commit: main verified but sub1 not -> exit 2 (per-agent)" 2 "$HOOK_RC"

record_skill "$projG" "$SG" verification-before-completion sub1
hook plant8-skill-gate.sh bash "$(payload_bash "$SG" "$GSD_CMD" "$projG" sub1)" "$projG"
expect_rc "gsd-tools commit: after sub1 verified -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# 커밋 아닌 명령
projN="$(new_project)"
SN="sid-noncommit-$$"
hook plant8-skill-gate.sh bash "$(payload_bash "$SN" 'git status' "$projN")" "$projN"
expect_rc "non-commit command -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-04, 거부된 디스패치는 한 번 허용을 쓰지 않는다
projE1="$(new_project)"
E1="sid-d04-e1-$$"
write_gate_line "$projE1" plan-ceo-review "$E1"
write_gate_line "$projE1" plan-eng-review "$E1"
hook plant8-skill-gate.sh agent "$(payload_agent "$E1" gsd-executor)" "$projE1"
expect_rc "D-04 E1: gsd-execute-phase 미기록 -> exit 2" 2 "$HOOK_RC"
expect_contains "D-04 E1: 기존 메시지(GSD 워크플로 안에서만)" "$HOOK_STDERR" "GSD 워크플로 안에서만"

record_skill "$projE1" "$E1" gsd-execute-phase
hook plant8-skill-gate.sh agent "$(payload_agent "$E1" gsd-executor)" "$projE1"
expect_rc "D-04 E1: 첫 실제 디스패치 -> exit 0" 0 "$HOOK_RC"

hook plant8-skill-gate.sh agent "$(payload_agent "$E1" gsd-executor)" "$projE1"
expect_rc "D-04 E1: 두 번째 디스패치 -> exit 2" 2 "$HOOK_RC"
expect_contains "D-04 E1: 두 번째 디스패치 메시지(플랜 하나)" "$HOOK_STDERR" "플랜 하나"

projE2="$(new_project)"
E2="sid-d04-e2-$$"
write_gate_line "$projE2" plan-ceo-review "$E2"
record_skill "$projE2" "$E2" gsd-execute-phase
hook plant8-skill-gate.sh agent "$(payload_agent "$E2" gsd-executor)" "$projE2"
expect_rc "D-04 E2: plan-eng-review 누락 -> exit 2 (Pre-build 게이트)" 2 "$HOOK_RC"
write_gate_line "$projE2" plan-eng-review "$E2"
hook plant8-skill-gate.sh agent "$(payload_agent "$E2" gsd-executor)" "$projE2"
expect_rc "D-04 E2: plan-eng-review 추가 뒤 -> exit 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-04, 검사 범위
hook plant8-skill-gate.sh agent "$(payload_agent "$E1" gsd-executor sub1)" "$projE1"
expect_rc "D-04 E1: 서브에이전트 payload는 무시 -> exit 0" 0 "$HOOK_RC"

record_skill "$projE1" "$E1" gsd-plan-phase
hook plant8-skill-gate.sh agent "$(payload_agent "$E1" gsd-planner)" "$projE1"
expect_rc "D-04 E1: executor 플래그가 서도 gsd-planner는 허용" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
# D-04, 한 메시지 안 병렬 디스패치
projE3="$(new_project)"
E3="sid-d04-e3-$$"
executor_ready_session "$projE3" "$E3"

f1="$TMPDIR/rc1"
f2="$TMPDIR/rc2"
(
  printf '%s' "$(payload_agent "$E3" gsd-executor)" | CLAUDE_PROJECT_DIR="$projE3" bash "$HOOKS/plant8-skill-gate.sh" agent >/dev/null 2>&1
  echo $? > "$f1"
) &
pid1=$!
(
  printf '%s' "$(payload_agent "$E3" gsd-executor)" | CLAUDE_PROJECT_DIR="$projE3" bash "$HOOKS/plant8-skill-gate.sh" agent >/dev/null 2>&1
  echo $? > "$f2"
) &
pid2=$!
wait "$pid1" "$pid2"
rc1="$(cat "$f1")"
rc2="$(cat "$f2")"
if { [ "$rc1" = "0" ] && [ "$rc2" = "2" ]; } || { [ "$rc1" = "2" ] && [ "$rc2" = "0" ]; }; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: D-04 parallel dispatch expected exactly one 0 and one 2, got rc1=$rc1 rc2=$rc2"
fi

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
