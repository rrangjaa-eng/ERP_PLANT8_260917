#!/usr/bin/env bash
# 스킬 관문 훅 — gsd · gstack · superpowers 스킬을 쓰지 않고 그 일을 하면 도구 단계에서 막는다.
# 사용자 요청(2026-09-23): "gsd, gstack, superpowers 스킬을 반드시 사용하도록 훅으로 설정해".
# 계기: /gsd-plan-phase·/gsd-execute-phase를 부르지 않고 GSD 에이전트를 직접 띄워 워크플로를
# 제멋대로 바꿨다.
#
# 기록(세션 · 에이전트별): Skill 도구 호출, 사용자가 친 /슬래시 명령.
# 관문(첫 인자 = 이벤트):
#   record-skill   PostToolUse(Skill)       — 호출한 스킬 이름을 기록
#   record-prompt  UserPromptSubmit         — /gsd-… 같은 슬래시 명령을 기록
#   agent          PreToolUse(Agent)        — gsd-* 에이전트는 맞는 /gsd-* 스킬을 부른 뒤에만
#   bash           PreToolUse(Bash)         — 코드 커밋은 TDD·검증 스킬 뒤에만, 페이즈 완료는 /review·/qa 뒤에만
#   edit           PreToolUse(Edit|Write)   — 테스트·빌드 실패 뒤 코드 수정은 systematic-debugging 뒤에만
#   failure        PostToolUseFailure(Bash) — 테스트·빌드 실패를 표시
#   merge          PreToolUse(PR 머지)      — /review·/qa 뒤에만
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

normalize() { sed -e 's/^\///' -e 's/^[^:]*://' -e 's/[[:space:]].*$//'; }

record() {
  local name="$1"
  [ -n "$name" ] || return 0
  echo "$name" >> "$skills_file"
  echo "$name" >> "$session_skills"
  if [ "$name" = "systematic-debugging" ]; then rm -f "$debug_flag"; fi
}

has_skill() {  # $1 = 파일, $2.. = 허용 스킬(정규식 조각)
  local file="$1"; shift
  [ -f "$file" ] || return 1
  local pattern
  pattern="^($(IFS='|'; echo "$*"))$"
  grep -Eq "$pattern" "$file"
}

deny() { echo "차단됨(스킬 관문): $1" >&2; exit 2; }

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
    has_skill "$session_skills" "$need" || deny "${sub}는 GSD 워크플로 안에서만 띄운다. 먼저 Skill 도구로 해당 스킬(${need//|/ 또는 })을 호출하고 그 워크플로의 단계를 그대로 따르라. 워크플로를 임의로 바꾸거나 건너뛰려면 먼저 사용자 승인을 받아라."
    ;;

  bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
    # 페이즈 완료 처리 — gstack Post-build 먼저
    if printf '%s' "$cmd" | grep -Eq 'gsd-tools\.cjs.*(phase complete|phase\.complete|milestone complete)'; then
      has_skill "$session_skills" "review" && has_skill "$session_skills" "qa" \
        || deny "페이즈 완료 전에 gstack Post-build를 실제로 호출하라: /review → /qa → (해당 시)/cso → /ship (CLAUDE.md Post-build)."
    fi
    # 코드 커밋 — superpowers TDD·검증 먼저
    if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit|gsd-tools\.cjs[^;&|]*[[:space:]]commit[[:space:]]'; then
      cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
      [ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-.}"
      # 스테이징된 파일 + gsd-tools `--files` 인자 + git commit `--` 뒤 경로
      files="$( { git -C "$cwd" diff --cached --name-only 2>/dev/null || true;
                  printf '%s' "$cmd" | grep -oE -- '(--files|[[:space:]]--)[[:space:]].*' | tr ' ' '\n' | grep -vE -- '^(--files|--)?$' || true; } | sort -u )"
      if printf '%s\n' "$files" | is_code_path; then
        has_skill "$skills_file" "test-driven-development" && has_skill "$skills_file" "verification-before-completion" \
          || deny "코드 커밋 전에 superpowers 스킬을 이 에이전트에서 호출하라: 구현 전 test-driven-development, 완료·커밋 전 verification-before-completion (Skill 도구). 호출 뒤 커밋을 다시 시도하라."
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
    [ -f "$debug_flag" ] || exit 0
    path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
    rel="${path#"${CLAUDE_PROJECT_DIR:-}"/}"
    printf '%s\n' "$rel" | is_code_path || exit 0
    deny "테스트·빌드 실패 뒤 코드를 고치기 전에 Skill 도구로 systematic-debugging을 호출하라(재현 → 원인 → 수정 → 회귀 테스트)."
    ;;

  merge)
    has_skill "$session_skills" "review" && has_skill "$session_skills" "qa" \
      || deny "PR 머지 전에 gstack Post-build를 실제로 호출하라: /review → /qa → (해당 시)/cso → /ship."
    ;;
esac
exit 0
