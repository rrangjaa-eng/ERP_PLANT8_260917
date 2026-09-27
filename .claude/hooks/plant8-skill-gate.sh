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
#                                            메인 에이전트의 gsd-executor 디스패치는 세션당 웨이브 하나(D-04,
#                                            2026-09-27 개정: 같은 웨이브의 플랜은 몇 개든, 다음 웨이브는 새 세션).
#                                            플랜에 wave 정보가 없으면 옛 규칙(세션당 한 번) — 검사가 마지막이라
#                                            거부된 디스패치는 그 한 번을 쓰지 않는다. 웨이브 계산은 lib/plant8-wave.sh
#   bash           PreToolUse(Bash)         — 모든 커밋(문서 포함)은 verification-before-completion 뒤에만,
#                                            코드 커밋은 test-driven-development도 더해서(D-02, 사용자 결정
#                                            2026-09-23). 페이즈 완료는 /review·/qa 뒤에만
#   edit           PreToolUse(Edit|Write)   — 코드 작성은 test-driven-development 뒤에만,
#                                            테스트·빌드 실패 뒤 코드 수정은 systematic-debugging 뒤에만
#   failure        PostToolUseFailure(Bash) — 테스트·빌드 실패를 표시
#   merge          PreToolUse(PR 머지)      — 페이즈 기록에 /review·/qa가 있을 때만(문서만 바뀐 PR은 /review만,
#                                            화면 파일이 바뀐 PR은 /design-review도). 위험 경로(마이그레이션·스키마·
#                                            인증·권한·암호화·배포·.claude·CLAUDE.md)는 세션이 머지하지 않는다 —
#                                            사용자가 GitHub에서 머지(2026-09-27). 그 밖은 세션이 머지한다
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
executor_flag="$state_dir/${session}.executor-dispatched"  # D-04(옛 규칙): 플랜에 wave 정보가 없을 때 세션당 gsd-executor 한 번
wave_file="$state_dir/${session}.wave"                     # D-04(웨이브): 이 세션이 실행 중인 "phase_pad wave"
# shellcheck source=lib/plant8-wave.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/plant8-wave.sh"

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

is_ui_path() {  # 화면 경로 — 디자인 관문(사용자 결정 2026-09-28): 브리프·원칙을 확인하지 않고 화면을 만들지 않는다
  grep -Eq '^(app/.*\.(tsx|css)|ui/|docs/design/)'
}
is_ui_code_path() {  # 커밋 때 점검표를 요구하는 화면 코드(문서 제외)
  grep -Eq '^(app|ui)/.*\.(tsx|css)$'
}

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
      # 세션 하나 = 웨이브 하나(사용자 결정 2026-09-27). 지금 웨이브 = SUMMARY 없는 플랜의 최소 wave.
      # 첫 디스패치 때 기록하고 같은 웨이브면 몇 번이든 허용(병렬 플랜), 웨이브가 넘어가면 새 세션.
      phase_dir="$(p8_phase_dir "$project" "$phase_pad")"
      cur_wave="$(p8_lowest_incomplete_wave "$phase_dir")"
      if [ -n "$cur_wave" ]; then
        if [ -s "$wave_file" ]; then
          rec="$(cat "$wave_file")"
          [ "$rec" = "${phase_pad} ${cur_wave}" ] \
            || deny "이 세션은 웨이브 ${rec#* }(Phase ${rec% *})를 실행했다 — 세션 하나에 웨이브 하나. 다음 웨이브(${cur_wave})는 새 세션에서 실행한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)."
        else
          printf '%s %s' "$phase_pad" "$cur_wave" > "$wave_file"
        fi
      elif ! ( set -o noclobber; : > "$executor_flag" ) 2>/dev/null; then
        deny "이 세션에서 이미 gsd-executor를 띄웠다 — 플랜에 wave 정보가 없어 세션 하나에 플랜 하나로 본다. 다음 플랜은 새 세션에서 실행한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)."
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
      # 디자인 관문: 화면 코드 커밋은 빈칸 없는 점검표(docs/design/checks/*.md)를 함께 스테이징해야 한다
      if printf '%s\n' "$files" | is_ui_code_path; then
        # 이번 커밋에 스테이징한 점검표 + 이 브랜치에서 이미 커밋한 점검표(origin/main 이후) — 같은 작업의 화면 커밋이 여러 번이어도 된다
        branch_base="$(git -C "$cwd" merge-base origin/main HEAD 2>/dev/null || true)"
        checks="$( { printf '%s\n' "$files";
                     [ -z "$branch_base" ] || git -C "$cwd" diff --name-only --diff-filter=d "$branch_base" HEAD -- docs/design/checks/ 2>/dev/null || true; } \
                   | grep -E '^docs/design/checks/[^/]+\.md$' | sort -u || true)"
        [ -n "$checks" ] || deny "화면 코드(app/·ui/의 .tsx·.css) 커밋에는 점검표가 함께 있어야 한다 — design-gate 스킬의 점검표를 docs/design/checks/<날짜>-<작업>.md로 채워 스테이징하라(같은 브랜치에서 이미 커밋한 점검표도 인정)."
        while IFS= read -r c; do
          body="$(git -C "$cwd" show ":$c" 2>/dev/null || true)"
          printf '%s\n' "$body" | grep -Eq '^[[:space:]]*- \[x\]' || deny "점검표 ${c}에 확인한 항목(- [x])이 없다."
          if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*- \[ \]'; then
            deny "점검표 ${c}에 빈칸(- [ ])이 남았다 — 항목마다 확인하고 근거를 한 줄 적어라. 지킬 수 없는 항목은 사용자 승인을 받고 이유를 적는다."
          fi
        done <<<"$checks"
      fi
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
    if printf '%s\n' "$rel" | is_ui_path; then
      has_skill "$skills_file" "design-gate" \
        || deny "화면 파일(app/의 .tsx·.css, ui/, docs/design/)을 고치기 전에 Skill 도구로 design-gate를 호출하라 — 브리프·화면 사용성 원칙·사용자 디자인 결정을 읽고 점검표를 준비한다. 호출 뒤 다시 시도하라."
    fi
    printf '%s\n' "$rel" | is_code_path || exit 0
    has_skill "$skills_file" "test-driven-development" \
      || deny "코드를 쓰기 전에 Skill 도구로 test-driven-development를 호출하라(실패 테스트 → 최소 구현 → 리팩터). 호출 뒤 다시 시도하라."
    [ -f "$debug_flag" ] || exit 0
    deny "테스트·빌드 실패 뒤 코드를 고치기 전에 Skill 도구로 systematic-debugging을 호출하라(재현 → 원인 → 수정 → 회귀 테스트)."
    ;;

  merge)
    # 문서만 바꾼 PR(.planning/·.claude/gates/ 아래 파일, *.md — 단 CLAUDE.md와 .claude/ 아래 .md 제외)은
    # /qa 면제(사용자 승인 2026-09-25). gh가 우선이다: 목록을 못 읽거나 받은 수가 changed_files와
    # 다르면 문서만으로 보지 않는다. gh가 없거나 실패하면(클라우드 세션) origin ls-remote로 얻은
    # GitHub 병합 커밋(refs/pull/N/merge)의 첫 부모(PR 대상 브랜치) 대비 diff(옛 경로 포함, 사용자
    # 승인 2026-09-26)에 같은 규칙을 쓴다. 로컬 origin/main은 쓰지 않는다(대상이 main이 아니거나 위조).
    # origin이 owner/repo와 다르거나(대소문자 무시), expectedHeadSha가 없거나 PR 헤드와 다르거나,
    # 병합 커밋이 없거나 로컬에 없거나 그 둘째 부모가 PR 헤드가 아니면 판정하지 않고 막는다.
    # 이름 바꾸기는 옛 경로도 본다.
    # 판정은 파이프 없이(SIGPIPE가 결과를 뒤집지 않게).
    pr="$(printf '%s' "$payload" | jq -r '.tool_input | "repos/\(.owner // "")/\(.repo // "")/pulls/\(.pullNumber // "")"')"
    pull_number="$(printf '%s' "$payload" | jq -r '.tool_input.pullNumber // empty')"
    docs_only=0
    if pr_files="$(gh api "$pr/files" --paginate --jq '.[] | [.filename, .previous_filename // empty] | @tsv' 2>/dev/null)" \
      && pr_changed="$(gh api "$pr" --jq '.changed_files' 2>/dev/null)"; then
      if [ -z "$pr_files" ] || [ "$(grep -c . <<<"$pr_files")" != "$pr_changed" ]; then
        pr_files=""
      fi
    else
      pr_files=""
      # gh가 없거나 실패했다 — origin ls-remote + 로컬 diff 대체 경로.
      cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
      [ -n "$cwd" ] || cwd="$project"
      owner="$(printf '%s' "$payload" | jq -r '.tool_input.owner // empty')"
      repo="$(printf '%s' "$payload" | jq -r '.tool_input.repo // empty')"
      pull_number="$(printf '%s' "$payload" | jq -r '.tool_input.pullNumber // empty')"
      expected_head_sha="$(printf '%s' "$payload" | jq -r '.tool_input.expectedHeadSha // empty')"
      origin_ok=0
      if [[ "$pull_number" =~ ^[0-9]+$ ]] && [ -n "$owner" ] && [ -n "$repo" ] && [ -n "$expected_head_sha" ]; then
        origin_url="$(git -C "$cwd" config --get remote.origin.url 2>/dev/null || true)"
        origin_url="${origin_url%.git}"
        origin_url="${origin_url,,}" owner="${owner,,}" repo="${repo,,}"
        case "$origin_url" in
          */"$owner"/"$repo") origin_ok=1 ;;
          *:"$owner"/"$repo") origin_ok=1 ;;
        esac
      fi
      if [ "$origin_ok" = 1 ]; then
        ls_out="$(GIT_TERMINAL_PROMPT=0 timeout 5 git -C "$cwd" ls-remote origin "refs/pull/$pull_number/head" "refs/pull/$pull_number/merge" 2>/dev/null || true)"
        head_sha="" merge_sha=""
        while IFS=$'\t' read -r sha ref; do
          case "$ref" in
            "refs/pull/$pull_number/head") head_sha="$sha" ;;
            "refs/pull/$pull_number/merge") merge_sha="$sha" ;;
          esac
        done <<<"$ls_out"
        if [ "$(grep -c . <<<"$ls_out")" = 2 ] \
          && [[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] && [[ "$merge_sha" =~ ^[0-9a-f]{40}$ ]] \
          && [ "$expected_head_sha" = "$head_sha" ]; then
          # 병합 커밋의 부모는 정확히 둘(대상 브랜치, PR 헤드)이어야 한다.
          parents="$(git -C "$cwd" rev-list --parents -n 1 "$merge_sha" 2>/dev/null || true)"
          if [[ "$parents" =~ ^$merge_sha\ ([0-9a-f]{40})\ $head_sha$ ]]; then
            pr_files="$(git -C "$cwd" -c core.quotePath=false diff --no-renames --name-only "${BASH_REMATCH[1]}" "$merge_sha" 2>/dev/null || true)"
          fi
        fi
      fi
    fi
    # 변경 파일을 모르면 위험 경로·문서만 판정을 할 수 없다 — review·qa가 있어도 막는다
    # (2026-09-27 #96: 훅·CLAUDE.md PR이 refs/pull/96/merge 미수신 상태에서 phase 로그의 review·qa로 통과했다).
    [ -n "$pr_files" ] || deny "PR 변경 파일을 판정할 수 없어 머지하지 않는다(gh 없음·실패, 또는 PR 병합 커밋이 로컬에 없음). git fetch origin pull/${pull_number:-N}/head pull/${pull_number:-N}/merge 뒤 다시 시도하라."
    ui_changed=0
    if [ -n "$pr_files" ]; then
      awk -F'\t' '{ for (i = 1; i <= NF; i++) if (!($i ~ /^(\.planning|\.claude\/gates)\// || ($i ~ /\.md$/ && $i !~ /^\.claude\// && $i !~ /(^|\/)CLAUDE\.md$/))) bad = 1 }
                  END { exit bad }' <<<"$pr_files" && docs_only=1
      # 위험 경로(마이그레이션·스키마·인증·권한·암호화·배포·훅/규칙·CLAUDE.md)는 세션이 머지하지 않는다 —
      # 사용자가 GitHub에서 직접 머지한다(사용자 결정 2026-09-27: 그 밖의 PR은 조건 충족 시 세션이 머지).
      # 이름 바꾸기의 옛 경로(탭 뒤)도 본다. .claude/gates/ 로그는 모든 PR이 건드리므로 제외.
      risky="$(printf '%s\n' "$pr_files" | tr '\t' '\n' \
        | { grep -E '^(db/migrations/|db/schema/|domain/auth/|domain/permissions/|lib/crypto|scripts/(deploy|rollback|bootstrap-gcp|promote-guard)\.sh$|\.github/workflows/|infra/|\.claude/|CLAUDE\.md$)' || true; } \
        | { grep -vE '^\.claude/gates/' || true; } | head -n 3 | tr '\n' ' ')"
      [ -z "$risky" ] || deny "위험 경로가 바뀐 PR(${risky% })은 세션이 머지하지 않는다 — 마이그레이션·스키마·인증·권한·암호화·배포·훅·규칙·CLAUDE.md는 사용자가 GitHub에서 직접 머지한다."
      if printf '%s\n' "$pr_files" | tr '\t' '\n' | grep -Eq '^(app|ui)/.*\.(tsx|css)$'; then ui_changed=1; fi
    fi
    gate_has review && { [ "$docs_only" = 1 ] || gate_has qa; } \
      || deny "PR 머지 전에 gstack Post-build를 실제로 호출하라: /review → /qa(문서만 바뀐 PR은 면제) → (해당 시)/cso → /ship. gh가 없으면 expectedHeadSha를 넣고 PR 커밋을 받아 둬야 문서 PR로 판정한다(git fetch origin pull/${pull_number:-N}/head pull/${pull_number:-N}/merge)."
    if [ "$ui_changed" = 1 ] && ! gate_has design-review; then
      deny "화면 파일(app/·ui/의 .tsx·.css)이 바뀐 PR은 /design-review 통과 기록이 있어야 머지한다(CLAUDE.md §6: UI 완료 판정 = /design-review → /qa). 호출 뒤 다시 시도하라."
    fi
    ;;
esac
exit 0
