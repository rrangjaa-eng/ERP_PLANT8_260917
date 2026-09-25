#!/usr/bin/env bash
# 스킬 관문 훅 — gsd · gstack · superpowers 스킬을 쓰지 않고 그 일을 하면 도구 단계에서 막는다.
# 사용자 요청(2026-09-23): "gsd, gstack, superpowers 스킬을 반드시 사용하도록 훅으로 설정해".
# 계기: /gsd-plan-phase·/gsd-execute-phase를 부르지 않고 GSD 에이전트를 직접 띄워 워크플로를
# 제멋대로 바꿨다.
#
# 기록(세션 · 에이전트별): Skill 도구 호출, 사용자가 친 /슬래시 명령.
# 관문(첫 인자 = 이벤트):
#   record-skill   PostToolUse(Skill)       — 호출한 스킬 이름을 기록(GSD 페이즈 스킬의 페이즈 인자는 세션 페이즈로)
#   record-prompt  UserPromptSubmit         — /gsd-… 같은 슬래시 명령을 기록(페이즈 인자도 같다)
#   agent          PreToolUse(Agent)        — gsd-* 에이전트는 맞는 /gsd-* 스킬을 부른 뒤에만,
#                                            gsd-executor는 페이즈 계획 게이트(CEO·엔지·UI면 디자인 리뷰) 기록 뒤에만.
#                                            검사를 모두 통과한 메인 에이전트 gsd-executor 디스패치는 세션당
#                                            한 번만(D-04, 사용자 결정 2026-09-23) — 검사가 마지막이라 거부된
#                                            디스패치는 그 한 번을 쓰지 않는다
#   bash           PreToolUse(Bash)         — 모든 커밋(문서 포함)은 verification-before-completion 뒤에만,
#                                            코드 커밋은 test-driven-development도 더해서(D-02, 사용자 결정
#                                            2026-09-23). 페이즈 완료는 /review·/qa 뒤에만
#   edit           PreToolUse(Edit|Write)   — 코드 작성은 test-driven-development 뒤에만,
#                                            테스트·빌드 실패 뒤 코드 수정은 systematic-debugging 뒤에만
#   failure        PostToolUseFailure(Bash) — 테스트·빌드 실패를 표시
#   merge          PreToolUse(PR 머지)      — 페이즈 기록에 /review·/qa가 있을 때만(문서만 바뀐 PR은 /review만)
# 게이트 기록(.claude/gates/phase-NN[.N].log)은 커밋해 세션을 넘어 남긴다.
set -euo pipefail

event="${1:-}"
payload="$(cat)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // "main"')"

state_dir="${TMPDIR:-/tmp}/plant8-skill-gate"
mkdir -p "$state_dir"
skills_file="$state_dir/${session}-${agent}.skills"      # 이 에이전트가 부른 스킬
session_skills="$state_dir/${session}.skills"           # 세션 전체(메인 + 서브)
debug_flag="$state_dir/${session}-${agent}.debug-required"
executor_flag="$state_dir/${session}.executor-dispatched"  # D-04: 세션당 gsd-executor 한 번

normalize() { sed -e 's/^\///' -e 's/^[^:]*://' -e 's/[[:space:]].*$//'; }

record() {
  local name="$1"
  [ -n "$name" ] || return 0
  echo "$name" >> "$skills_file"
  echo "$name" >> "$session_skills"
  if [ "$name" = "systematic-debugging" ]; then rm -f "$debug_flag"; fi
  if printf '%s' "$name" | grep -Eqx "$gate_skills"; then
    mkdir -p "$(dirname "$gate_log")"
    echo "$name $(date -u +%Y-%m-%dT%H:%MZ) session=$session" >> "$gate_log"
  fi
}

has_skill() {  # $1 = 파일, $2.. = 허용 스킬(정규식 조각)
  local file="$1"; shift
  [ -f "$file" ] || return 1
  local pattern
  pattern="^($(IFS='|'; echo "$*"))$"
  grep -Eq "$pattern" "$file"
}

deny() { echo "차단됨(스킬 관문): $1" >&2; exit 2; }

# 게이트 스킬은 페이즈별로 리포 안(.claude/gates/phase-NN[.N].log)에 남겨 세션을 넘어 확인한다.
project="${CLAUDE_PROJECT_DIR:-.}"
# 페이즈: 이 세션에서 부른 GSD 페이즈 스킬의 인자(예: /gsd-execute-phase 04.1)가 우선, 없으면 STATE.md.
# 병렬 소수점 페이즈(04.1 …)는 STATE의 현재 페이즈(4)를 바꾸지 않으므로 인자로만 알 수 있다.
session_phase_file="$state_dir/${session}.phase"
case "$event" in
  record-skill) invocation="$(printf '%s' "$payload" | jq -r '"\(.tool_input.skill // "") \(.tool_input.args // "")"')" ;;
  record-prompt) invocation="$(printf '%s' "$payload" | jq -r '.prompt // empty' | head -n1 | grep '^/' || true)" ;;
  *) invocation="" ;;
esac
arg_phase="$(printf '%s\n' "$invocation" \
  | grep -oE '^/?([^:[:space:]]+:)?gsd-([a-z-]+-phase|verify-work|code-review|ui-review|add-tests)[[:space:]]+[0-9]+(\.[0-9]+)*([[:space:]]|$)' \
  | awk '{print $2}' | head -n1 || true)"
[ -z "$arg_phase" ] || { echo "$arg_phase" > "$session_phase_file.$$" && mv "$session_phase_file.$$" "$session_phase_file"; }
phase="$( { [ -s "$session_phase_file" ] && cat "$session_phase_file"; } || sed -n 's/^current_phase: *"\{0,1\}\([0-9.]*\)"\{0,1\}$/\1/p' "$project/.planning/STATE.md" 2>/dev/null | head -n1)"
phase_int="${phase%%.*}"
phase_pad="$(printf '%02d' "$((10#${phase_int:-0}))")${phase#"$phase_int"}"  # 4 → 04, 4.1 · 04.1 → 04.1
gate_log="$project/.claude/gates/phase-${phase_pad}.log"
gate_skills="plan-ceo-review|plan-eng-review|plan-design-review|review|qa|cso|design-review|gsd-verify-work|ship"
phase_has_ui() { ls "$project"/.planning/phases/${phase_pad}-*/*-UI-SPEC.md >/dev/null 2>&1; }
gate_has() { [ -f "$gate_log" ] && awk '{print $1}' "$gate_log" | grep -qx "$1"; }

is_code_path() {  # 저장소 코드 경로(문서·계획 제외)
  grep -Eq '^(app|domain|repositories|ui|db|lib|components|scripts|test|e2e)/|\.(ts|tsx|js|mjs|cjs|sql|css)$'
}

case "$event" in
  record-skill)
    record "$(printf '%s' "$payload" | jq -r '.tool_input.skill // empty' | normalize)"
    ;;

  record-prompt)
    prompt="$(printf '%s' "$payload" | jq -r '.prompt // empty')"
    first="$(printf '%s' "$prompt" | head -n1)"
    case "$first" in
      /*) record "$(printf '%s' "$first" | normalize)" ;;
    esac
    ;;

  agent)
    [ "$agent" = "main" ] || exit 0
    sub="$(printf '%s' "$payload" | jq -r '.tool_input.subagent_type // empty')"
    case "$sub" in gsd-*) ;; *) exit 0 ;; esac
    case "$sub" in
      gsd-executor) need="gsd-execute-phase|gsd-quick|gsd-quick-batch|gsd-autonomous|gsd-fast" ;;
      gsd-planner|gsd-plan-checker|gsd-phase-researcher|gsd-pattern-mapper)
        need="gsd-plan-phase|gsd-quick|gsd-mvp-phase|gsd-autonomous|gsd-ultraplan-phase|gsd-plan-review-convergence" ;;
      gsd-ui-researcher|gsd-ui-checker) need="gsd-ui-phase|gsd-autonomous" ;;
      gsd-ui-auditor) need="gsd-ui-review" ;;
      gsd-verifier|gsd-integration-checker) need="gsd-verify-work|gsd-execute-phase|gsd-audit-milestone|gsd-autonomous" ;;
      gsd-code-reviewer|gsd-code-fixer) need="gsd-code-review|gsd-audit-fix" ;;
      gsd-roadmapper) need="gsd-new-project|gsd-new-milestone|gsd-phase" ;;
      gsd-debugger|gsd-debug-session-manager) need="gsd-debug" ;;
      *) need="gsd-[a-z0-9-]+" ;;
    esac
    if [ "$sub" = "gsd-executor" ]; then
      missing=""
      # 소수점 페이즈(04.1 …)는 /plan-ceo-review 생략(사용자 결정 2026-09-24 22:04 KST)
      [[ "$phase" =~ ^[0-9]+\.0*[1-9][0-9]*$ ]] || gate_has plan-ceo-review || missing="$missing /plan-ceo-review"
      gate_has plan-eng-review || missing="$missing /plan-eng-review"
      phase_has_ui && ! gate_has plan-design-review && missing="$missing /plan-design-review"
      [ -z "$missing" ] || deny "Phase ${phase_pad} 계획이 Pre-build 게이트를 통과하지 않았다(없음:${missing}). CLAUDE.md: 게이트를 통과한 계획만 Build로 넘긴다. 그 스킬들을 먼저 호출하라(기록: ${gate_log#"$project"/})."
    fi
    has_skill "$session_skills" "$need" || deny "${sub}는 GSD 워크플로 안에서만 띄운다. 먼저 Skill 도구로 해당 스킬(${need//|/ 또는 })을 호출하고 그 워크플로의 단계를 그대로 따르라. 워크플로를 임의로 바꾸거나 건너뛰려면 먼저 사용자 승인을 받아라."
    if [ "$sub" = "gsd-executor" ]; then
      if ! ( set -o noclobber; : > "$executor_flag" ) 2>/dev/null; then
        deny "이 세션에서 이미 gsd-executor를 띄웠다 — 세션 하나에 플랜 하나. 다음 플랜(같은 웨이브의 병렬 플랜, 체크포인트 이어가기 포함)은 새 세션에서 실행한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)."
      fi
    fi
    ;;

  bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
    # 페이즈 완료 처리 — gstack Post-build 먼저
    if printf '%s' "$cmd" | grep -Eq 'gsd-tools\.cjs.*(phase complete|phase\.complete|milestone complete)'; then
      missing=""
      for g in gsd-verify-work review qa; do gate_has "$g" || missing="$missing /$g"; done
      phase_has_ui && ! gate_has design-review && missing="$missing /design-review"
      [ -z "$missing" ] || deny "Phase ${phase_pad} 완료 전에 실제로 호출하라(없음:${missing}) — /gsd-verify-work, Post-build /review → /qa(UI면 /design-review) → (해당 시)/cso → /ship."
    fi
    # 커밋 — 문서·계획 포함 전부 verification-before-completion 먼저, 코드 경로는 TDD도 더해서
    if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit|gsd-tools\.cjs[^;&|]*[[:space:]]commit[[:space:]]'; then
      cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
      [ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-.}"
      # 스테이징된 파일 + gsd-tools `--files` 인자 + git commit `--` 뒤 경로
      files="$( { git -C "$cwd" diff --cached --name-only 2>/dev/null || true;
                  printf '%s' "$cmd" | grep -oE -- '(--files|[[:space:]]--)[[:space:]].*' | tr ' ' '\n' | grep -vE -- '^(--files|--)?$' || true; } | sort -u )"
      if printf '%s\n' "$files" | is_code_path; then
        has_skill "$skills_file" "test-driven-development" && has_skill "$skills_file" "verification-before-completion" \
          || deny "코드 커밋 전에 superpowers 스킬을 이 에이전트에서 호출하라: 구현 전 test-driven-development, 완료·커밋 전 verification-before-completion (Skill 도구). 호출 뒤 커밋을 다시 시도하라."
      else
        has_skill "$skills_file" "verification-before-completion" \
          || deny "커밋 전에 superpowers 스킬을 이 에이전트에서 호출하라: 완료·커밋 전 verification-before-completion (Skill 도구). 문서·계획 커밋도 같다. 호출 뒤 커밋을 다시 시도하라."
      fi
    fi
    ;;

  failure)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
    if printf '%s' "$cmd" | grep -Eq '(pnpm|npx|npm)[[:space:]]+(-s[[:space:]]+)?(test|lint|typecheck|build|vitest|playwright|exec[[:space:]]+(vitest|playwright|tsc))|vitest|playwright[[:space:]]+test|tsc([[:space:]]|$)'; then
      touch "$debug_flag"
      jq -nc '{hookSpecificOutput:{hookEventName:"PostToolUseFailure", additionalContext:"[스킬 관문] 테스트·빌드·린트가 실패했다. 원인을 쫓거나 코드를 고치기 전에 Skill 도구로 systematic-debugging을 호출하라(CLAUDE.md). 호출 전 코드 수정은 hook이 막는다."}}'
    fi
    ;;

  edit)
    path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
    rel="${path#"${CLAUDE_PROJECT_DIR:-}"/}"
    printf '%s\n' "$rel" | is_code_path || exit 0
    has_skill "$skills_file" "test-driven-development" \
      || deny "코드를 쓰기 전에 Skill 도구로 test-driven-development를 호출하라(실패 테스트 → 최소 구현 → 리팩터). 호출 뒤 다시 시도하라."
    [ -f "$debug_flag" ] || exit 0
    deny "테스트·빌드 실패 뒤 코드를 고치기 전에 Skill 도구로 systematic-debugging을 호출하라(재현 → 원인 → 수정 → 회귀 테스트)."
    ;;

  merge)
    # 문서만 바꾼 PR(.planning/·docs/·.claude/gates/·*.md)은 /qa 면제(사용자 승인 2026-09-25).
    # 파일 목록을 못 읽으면 문서만으로 보지 않는다.
    pr="$(printf '%s' "$payload" | jq -r '.tool_input | "repos/\(.owner // "")/\(.repo // "")/pulls/\(.pullNumber // "")/files"')"
    pr_files="$(gh api "$pr" --paginate --jq '.[].filename' 2>/dev/null || true)"
    docs_only=0
    [ -n "$pr_files" ] && ! printf '%s\n' "$pr_files" | grep -Evq '^(\.planning/|docs/|\.claude/gates/)|\.md$' && docs_only=1
    gate_has review && { [ "$docs_only" = 1 ] || gate_has qa; } \
      || deny "PR 머지 전에 gstack Post-build를 실제로 호출하라: /review → /qa(문서만 바뀐 PR은 면제) → (해당 시)/cso → /ship."
    ;;
esac
exit 0
