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
# 소수점 페이즈(04.1 …)는 Phase 4 로그와 섞이지 않는다
# payload: Skill 도구 호출(args 포함)
payload_skill_args() {
  jq -nc --arg s "$1" --arg sk "$2" --arg ar "$3" \
    '{session_id:$s, tool_name:"Skill", tool_input:{skill:$sk, args:$ar}}'
}
gate_lines() { cat "$1/.claude/gates/phase-$2.log" 2>/dev/null | awk '{print $1}' | tr '\n' ' '; }

# STATE current_phase가 소수점이면 그 페이즈 로그에 쓴다
projP1="$(new_project)"
P1="sid-dec-state-$$"
printf 'current_phase: 04.1\n' > "$projP1/.planning/STATE.md"
record_skill "$projP1" "$P1" review
expect_contains "STATE 04.1: review가 phase-04.1.log에" "$(gate_lines "$projP1" 04.1)" "review"
expect_not_contains "STATE 04.1: phase-04.log에는 없음" "$(gate_lines "$projP1" 04)" "review"

# STATE는 4(Phase 4 외부 세션)인데 이 세션은 GSD 스킬 인자로 04.3을 다룬다
projP2="$(new_project)"
P2="sid-dec-args-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P2" gsd-execute-phase 04.3)" "$projP2"
record_skill "$projP2" "$P2" cso
expect_contains "args 04.3: cso가 phase-04.3.log에" "$(gate_lines "$projP2" 04.3)" "cso"
expect_not_contains "args 04.3: phase-04.log에는 없음" "$(gate_lines "$projP2" 04)" "cso"

# 사용자가 친 슬래시 명령의 페이즈 인자도 같다
projP3="$(new_project)"
P3="sid-dec-prompt-$$"
hook plant8-skill-gate.sh record-prompt "$(jq -nc --arg s "$P3" '{session_id:$s, prompt:"/gsd-plan-phase 04.2 --skip-research"}')" "$projP3"
record_skill "$projP3" "$P3" plan-ceo-review
expect_contains "prompt 04.2: plan-ceo-review가 phase-04.2.log에" "$(gate_lines "$projP3" 04.2)" "plan-ceo-review"

# Phase 4의 게이트 기록은 04.1 게이트를 통과시키지 않는다
projP4="$(new_project)"
P4="sid-dec-gate-$$"
mkdir -p "$projP4/.planning/phases/04.1-test"
write_gate_line "$projP4" plan-ceo-review "old-phase4"
write_gate_line "$projP4" plan-eng-review "old-phase4"
write_gate_line "$projP4" review "old-phase4"
write_gate_line "$projP4" qa "old-phase4"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P4" gsd-execute-phase 04.1)" "$projP4"
hook plant8-skill-gate.sh agent "$(payload_agent "$P4" gsd-executor)" "$projP4"
expect_rc "04.1 executor: Phase 4 게이트 기록으로 통과 안 함 -> exit 2" 2 "$HOOK_RC"
expect_contains "04.1 executor: 메시지에 Phase 04.1" "$HOOK_STDERR" "Phase 04.1"
hook plant8-skill-gate.sh merge "$(jq -nc --arg s "$P4" '{session_id:$s}')" "$projP4"
expect_rc "04.1 merge: Phase 4 review·qa로 통과 안 함 -> exit 2" 2 "$HOOK_RC"
record_skill "$projP4" "$P4" plan-ceo-review
record_skill "$projP4" "$P4" plan-eng-review
hook plant8-skill-gate.sh agent "$(payload_agent "$P4" gsd-executor)" "$projP4"
expect_rc "04.1 executor: 04.1 게이트 기록 뒤 -> exit 0" 0 "$HOOK_RC"

# 04.1의 UI 판정은 04.1 폴더만 본다(Phase 4 UI-SPEC은 무관)
projP5="$(new_project)"
P5="sid-dec-ui-$$"
mkdir -p "$projP5/.planning/phases/04.1-test"
: > "$projP5/.planning/phases/04-test/04-UI-SPEC.md"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P5" gsd-execute-phase 04.1)" "$projP5"
record_skill "$projP5" "$P5" plan-ceo-review
record_skill "$projP5" "$P5" plan-eng-review
hook plant8-skill-gate.sh agent "$(payload_agent "$P5" gsd-executor)" "$projP5"
expect_rc "04.1 executor: UI-SPEC 없는 04.1은 디자인 리뷰 불요 -> exit 0" 0 "$HOOK_RC"
: > "$projP5/.planning/phases/04.1-test/04.1-UI-SPEC.md"
P5b="sid-dec-ui-b-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P5b" gsd-execute-phase 04.1)" "$projP5"
hook plant8-skill-gate.sh agent "$(payload_agent "$P5b" gsd-executor)" "$projP5"
expect_rc "04.1 executor: 04.1 UI-SPEC 있으면 디자인 리뷰 필요 -> exit 2" 2 "$HOOK_RC"
expect_contains "04.1 executor: plan-design-review 요구" "$HOOK_STDERR" "/plan-design-review"

# 소수점 페이즈는 /plan-ceo-review 없이 실행 가능(사용자 결정 2026-09-24 22:04 KST), 엔지 리뷰는 그대로 필요
projP14="$(new_project)"
P14="sid-dec-noceo-$$"
mkdir -p "$projP14/.planning/phases/04.2-test"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P14" gsd-execute-phase 04.2)" "$projP14"
hook plant8-skill-gate.sh agent "$(payload_agent "$P14" gsd-executor)" "$projP14"
expect_rc "04.2 executor: 엔지 리뷰 없음 -> exit 2" 2 "$HOOK_RC"
expect_contains "04.2 executor: plan-eng-review 요구" "$HOOK_STDERR" "/plan-eng-review"
expect_not_contains "04.2 executor: plan-ceo-review는 요구 안 함" "$HOOK_STDERR" "/plan-ceo-review"
record_skill "$projP14" "$P14" plan-eng-review
hook plant8-skill-gate.sh agent "$(payload_agent "$P14" gsd-executor)" "$projP14"
expect_rc "04.2 executor: CEO 리뷰 없이 엔지 리뷰만으로 -> exit 0" 0 "$HOOK_RC"

# 정수 페이즈는 여전히 /plan-ceo-review 필요
projP15="$(new_project)"
P15="sid-int-noceo-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P15" gsd-execute-phase 4)" "$projP15"
record_skill "$projP15" "$P15" plan-eng-review
hook plant8-skill-gate.sh agent "$(payload_agent "$P15" gsd-executor)" "$projP15"
expect_rc "04 executor: CEO 리뷰 없음 -> exit 2" 2 "$HOOK_RC"
expect_contains "04 executor: plan-ceo-review 요구" "$HOOK_STDERR" "/plan-ceo-review"

# 소수 부분이 없거나 0인 페이즈(4. · 4.0)는 소수점 페이즈가 아니다 — CEO 리뷰 필요
for bad in "4." "4.0"; do
  projP16="$(new_project)"
  P16="sid-bad-dec-$$-$bad"
  printf 'current_phase: %s\n' "$bad" > "$projP16/.planning/STATE.md"
  hook plant8-skill-gate.sh record-skill "$(payload_skill "$P16" gsd-execute-phase)" "$projP16"
  record_skill "$projP16" "$P16" plan-eng-review
  hook plant8-skill-gate.sh agent "$(payload_agent "$P16" gsd-executor)" "$projP16"
  expect_rc "STATE $bad executor: CEO 리뷰 없음 -> exit 2" 2 "$HOOK_RC"
  expect_contains "STATE $bad executor: plan-ceo-review 요구" "$HOOK_STDERR" "/plan-ceo-review"
done

# Phase 4 동작은 그대로: 인자 4 → phase-04.log (STATE가 달라도 인자가 이긴다), 인자 없음 → STATE
projP6="$(new_project)"
P6="sid-dec-p4-$$"
printf 'current_phase: 5\n' > "$projP6/.planning/STATE.md"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P6" gsd-execute-phase 4)" "$projP6"
record_skill "$projP6" "$P6" review
record_skill "$projP6" "sid-dec-p4-noarg-$$" qa
expect_contains "Phase 4: 인자 4의 review가 phase-04.log에" "$(gate_lines "$projP6" 04)" "review"
expect_contains "Phase 4: 인자 없는 세션 qa는 STATE(05)로" "$(gate_lines "$projP6" 05)" "qa"

# 채우지 않은 소수점 인자 4.1 → 04.1, 0으로 채운 08 · 09.1 STATE(8진수 아님)
projP8="$(new_project)"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "sid-dec-41-$$" gsd-verify-work 4.1)" "$projP8"
record_skill "$projP8" "sid-dec-41-$$" qa
expect_contains "인자 4.1: qa가 phase-04.1.log에" "$(gate_lines "$projP8" 04.1)" "qa"
printf 'current_phase: 08\n' > "$projP8/.planning/STATE.md"
record_skill "$projP8" "sid-dec-08-$$" review
expect_contains "STATE 08: review가 phase-08.log에" "$(gate_lines "$projP8" 08)" "review"
printf 'current_phase: "09.1"\n' > "$projP8/.planning/STATE.md"
record_skill "$projP8" "sid-dec-091-$$" review
expect_contains "STATE 09.1: review가 phase-09.1.log에" "$(gate_lines "$projP8" 09.1)" "review"

# 같은 세션에서 다른 페이즈 스킬을 부르면 그 페이즈로 바뀐다
projP9="$(new_project)"
P9="sid-dec-switch-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P9" gsd-execute-phase 04.1)" "$projP9"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P9" gsd-plan-phase 05)" "$projP9"
record_skill "$projP9" "$P9" review
expect_contains "전환: review가 phase-05.log에" "$(gate_lines "$projP9" 05)" "review"
expect_not_contains "전환: phase-04.1.log에는 없음" "$(gate_lines "$projP9" 04.1)" "review"

# 04.1 페이즈 완료도 Phase 4 기록으로 통과하지 않는다
projP10="$(new_project)"
P10="sid-dec-complete-$$"
for g in gsd-verify-work review qa; do write_gate_line "$projP10" "$g" "old-phase4"; done
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P10" gsd-verify-work 04.1)" "$projP10"
hook plant8-skill-gate.sh bash "$(payload_bash "$P10" 'node .claude/gsd-core/bin/gsd-tools.cjs phase complete 04.1' "$projP10")" "$projP10"
expect_rc "04.1 phase complete: Phase 4 기록으로 통과 안 함 -> exit 2" 2 "$HOOK_RC"
expect_contains "04.1 phase complete: 메시지에 Phase 04.1" "$HOOK_STDERR" "Phase 04.1"

# 슬래시로 시작하지 않는 글은 페이즈를 바꾸지 않는다
projP11="$(new_project)"
P11="sid-dec-plain-$$"
hook plant8-skill-gate.sh record-prompt "$(jq -nc --arg s "$P11" '{session_id:$s, prompt:"gsd-execute-phase 9 은 왜 느려?"}')" "$projP11"
record_skill "$projP11" "$P11" review
expect_contains "슬래시 없는 글: review는 STATE(04)에" "$(gate_lines "$projP11" 04)" "review"

# 여러 줄 인자는 첫 페이즈만 쓴다(로그 파일 이름에 줄바꿈 금지)
projP12="$(new_project)"
P12="sid-dec-multiline-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P12" gsd-execute-phase "$(printf '04.1\ngsd-execute-phase 7')")" "$projP12"
record_skill "$projP12" "$P12" review
expect_contains "여러 줄 인자: review가 phase-04.1.log에" "$(gate_lines "$projP12" 04.1)" "review"
expect_rc "여러 줄 인자: gates 폴더에 다른 로그 없음" 0 "$(find "$projP12/.claude/gates" -type f ! -name 'phase-04.1.log' | wc -l | tr -d ' ')"

# 빈 세션 페이즈 파일은 무시하고 STATE를 쓴다
projP13="$(new_project)"
P13="sid-dec-empty-$$"
mkdir -p "$TMPDIR/plant8-skill-gate"
: > "$TMPDIR/plant8-skill-gate/${P13}.phase"
record_skill "$projP13" "$P13" review
expect_contains "빈 페이즈 파일: review는 STATE(04)에" "$(gate_lines "$projP13" 04)" "review"

# 페이즈를 받지 않는 GSD 스킬의 숫자 인자는 페이즈로 보지 않는다
projP7="$(new_project)"
P7="sid-dec-quick-$$"
hook plant8-skill-gate.sh record-skill "$(payload_skill_args "$P7" gsd-quick "3 buttons fix")" "$projP7"
record_skill "$projP7" "$P7" review
expect_contains "gsd-quick 3: review는 STATE 페이즈(04)에" "$(gate_lines "$projP7" 04)" "review"

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
