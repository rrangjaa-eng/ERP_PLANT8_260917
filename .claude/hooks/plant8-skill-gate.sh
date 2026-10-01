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
#                                            세션당 실행 횟수·웨이브 제한(D-04)은 없앴다(사용자 결정 2026-10-01 —
#                                            세션 종료는 문맥 크기·독립 검토로 정한다)
#   bash           PreToolUse(Bash)         — 모든 커밋(문서 포함)은 verification-before-completion 뒤에만,
#                                            코드 커밋은 test-driven-development도 더해서(D-02, 사용자 결정
#                                            2026-09-23). 페이즈 완료는 /gsd-verify-work·/review 뒤에만
#                                            (화면 페이즈는 /qa·/design-review도)
#   edit           PreToolUse(Edit|Write)   — 코드 작성은 test-driven-development 뒤에만,
#                                            테스트·빌드 실패 뒤 코드 수정은 systematic-debugging 뒤에만
#   failure        PostToolUseFailure(Bash) — 테스트·빌드 실패를 표시
#   merge          PreToolUse(PR 머지)      — 변경 종류에 맞는 게이트만(사용자 결정 2026-10-01): 문서만 바뀐 PR은
#                                            게이트 없음, 코드는 /review, 화면 영향(app/의 .tsx·.css, ui/ 전부,
#                                            docs/design/tokens.css)은 /qa·/design-review 더, 돈·결재 경로는 /cso 더. 위험 경로(마이그레이션·스키마·
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
pr_gates=0 pr_gate_added=""  # merge: PR이 게이트 로그를 건드렸으면 1 — 그 PR이 더한 줄(pr_gate_added)로만 판정
gate_has() {
  if [ "$pr_gates" = 1 ]; then grep -Eq "^$1( |\$)" <<<"$pr_gate_added"; return; fi
  [ -f "$gate_log" ] && awk '{print $1}' "$gate_log" | grep -qx "$1"
}

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
    ;;

  bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
    # 페이즈 완료 처리 — gstack Post-build 먼저
    if printf '%s' "$cmd" | grep -Eq 'gsd-tools\.cjs.*(phase complete|phase\.complete|milestone complete)'; then
      missing=""
      for g in gsd-verify-work review; do gate_has "$g" || missing="$missing /$g"; done
      if phase_has_ui; then
        for g in qa design-review; do gate_has "$g" || missing="$missing /$g"; done
      fi
      [ -z "$missing" ] || deny "Phase ${phase_pad} 완료 전에 실제로 호출하라(없음:${missing}) — /gsd-verify-work, Post-build /review(화면 페이즈는 /qa·/design-review도) → (해당 시)/cso → /ship."
    fi
    # 커밋 — 문서·계획 포함 전부 verification-before-completion 먼저, 코드 경로는 TDD도 더해서
    if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit|gsd-tools\.cjs[^;&|]*[[:space:]]commit[[:space:]]'; then
      cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
      [ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-.}"
      # 스테이징된 파일 + gsd-tools `--files` 인자 + git commit `--` 뒤 경로
      files="$( { git -C "$cwd" diff --cached --name-only 2>/dev/null || true;
                  printf '%s' "$cmd" | grep -oE -- '(--files|[[:space:]]--)[[:space:]].*' | tr ' ' '\n' | grep -vE -- '^(--files|--)?$' || true; } | sort -u )"
      # 디자인 관문: 화면 코드 커밋은 빈칸 없는 점검표(docs/design/checks/*.md)가 있어야 한다.
      # 한글 파일 이름을 그대로 받으려고 core.quotePath=false, 지운 파일은 빼고(--diff-filter=d),
      # `git commit -a/--all`이면 스테이징 안 된 추적 파일도 본다.
      design_files="$( { git -C "$cwd" -c core.quotePath=false diff --cached --name-only --diff-filter=d 2>/dev/null || true;
                         if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+commit([[:space:]]+[^;&|]*)?[[:space:]](-[a-zA-Z]*a[a-zA-Z]*|--all)([[:space:]]|$)'; then
                           git -C "$cwd" -c core.quotePath=false diff --name-only --diff-filter=d 2>/dev/null || true
                         fi
                         printf '%s' "$cmd" | grep -oE -- '(--files|[[:space:]]--)[[:space:]].*' | tr ' ' '\n' | grep -vE -- '^(--files|--)?$' || true; } | sort -u )"
      if printf '%s\n' "$design_files" | is_ui_code_path; then
        # 이번 커밋의 점검표 + 이 브랜치에서 이미 커밋한 점검표(origin/main 이후) — 같은 작업의 화면 커밋이 여러 번이어도 된다
        branch_base="$(git -C "$cwd" merge-base origin/main HEAD 2>/dev/null || true)"
        checks="$( { printf '%s\n' "$design_files";
                     [ -z "$branch_base" ] || git -C "$cwd" -c core.quotePath=false diff --name-only --diff-filter=d "$branch_base" HEAD -- docs/design/checks/ 2>/dev/null || true; } \
                   | grep -E '^docs/design/checks/[^/]+\.md$' | sort -u || true)"
        covered=""
        [ -n "$checks" ] || deny "화면 코드(app/·ui/의 .tsx·.css) 커밋에는 점검표가 함께 있어야 한다 — design-gate 스킬의 점검표를 docs/design/checks/<날짜>-<작업>.md로 채워 스테이징하라(같은 브랜치에서 이미 커밋한 점검표도 인정)."
        while IFS= read -r c; do
          [ -n "$c" ] || continue
          git -C "$cwd" cat-file -e ":$c" 2>/dev/null || continue   # 이번 커밋에서 지우는 점검표
          body="$(git -C "$cwd" show ":$c" 2>/dev/null || true)"
          printf '%s\n' "$body" | grep -Eq '^[[:space:]]*([-*+]|[0-9]+\.) \[[xX]\]' || deny "점검표 ${c}에 확인한 항목(- [x])이 없다."
          if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*([-*+]|[0-9]+\.) \[ \]'; then
            deny "점검표 ${c}에 빈칸(- [ ])이 남았다 — 항목마다 확인하고 근거를 한 줄 적어라. 지킬 수 없는 항목은 사용자 승인을 받고 이유를 적는다."
          fi
          if printf '%s\n' "$body" | grep -Eq '근거:[[:space:]]*$'; then
            deny "점검표 ${c}에 빈 근거(「근거:」 뒤가 비었다)가 있다 — 무엇을 보고 확인했는지 한 줄 적어라."
          fi
          # 엄격 모드(사용자 결정 2026-09-28): 「화면:」 줄에 적은 파일·폴더만 이 점검표가 덮는다
          covered="$covered
$(printf '%s\n' "$body" | sed -n 's/^[[:space:]]*화면:[[:space:]]*//p' | tr ',·' '  ' | tr -s ' \t' '\n\n' | tr -d '`' || true)"
        done <<<"$checks"
        uncovered=""
        while IFS= read -r f; do
          ok=0
          while IFS= read -r e; do
            case "$e" in ""|app|app/|ui|ui/|"app/(app)"|"app/(app)/") continue ;; esac
            if [ "$f" = "$e" ] || { [ "${e%/}/" = "$e" ] && [ "${f#"$e"}" != "$f" ]; } || [ "${f#"$e"/}" != "$f" ]; then ok=1; break; fi
          done <<<"$covered"
          [ "$ok" = 1 ] || uncovered="$uncovered $f"
        done < <(printf '%s\n' "$design_files" | grep -E '^(app|ui)/.*\.(tsx|css)$' || true)
        [ -z "$uncovered" ] || deny "점검표 「화면:」 줄에 없는 화면을 커밋한다:${uncovered} — 이 화면을 점검표 「화면:」 줄에 더하고(파일이나 그 폴더, app/·ui/처럼 넓게 적기는 안 됨) 항목을 이 화면 기준으로 다시 확인하라."
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
    # 게이트는 변경 종류로 정한다(사용자 결정 2026-10-01): 문서만 바꾼 PR(.claude/gates/ 로그, *.md — 단 CLAUDE.md와
    # .claude/ 아래 .md 제외. .planning/도 .md만)은 게이트 없음, 코드는 /review, 화면 영향(app/의 .tsx·.css, ui/ 전부,
    # docs/design/tokens.css)은 /qa·/design-review 더, 돈·결재 경로(domain/money·corp-cards·reserves·revenue·approvals,
    # repositories/의 같은 저장소)는 /cso 더. gh가 우선이다: 목록을 못 읽거나 받은 수가 changed_files와
    # 다르면 문서만으로 보지 않는다. gh가 없거나 실패하면(클라우드 세션) origin ls-remote로 얻은
    # GitHub 병합 커밋(refs/pull/N/merge)의 첫 부모(PR 대상 브랜치) 대비 diff(옛 경로 포함, 사용자
    # 승인 2026-09-26)에 같은 규칙을 쓴다. 로컬 origin/main은 쓰지 않는다(대상이 main이 아니거나 위조).
    # origin이 owner/repo와 다르거나(대소문자 무시), expectedHeadSha가 없거나 PR 헤드와 다르거나,
    # 병합 커밋이 없거나 로컬에 없거나 그 둘째 부모가 PR 헤드가 아니면 판정하지 않고 막는다.
    # 이름 바꾸기는 옛 경로도 본다.
    # 판정은 파이프 없이(SIGPIPE가 결과를 뒤집지 않게).
    # PR이 .claude/gates/*.log를 건드렸으면 review·qa·design-review는 그 로그에 이 PR이 더한 줄(대상 대비 +)에서만 찾는다(사용자 결정 2026-10-01).
    pr="$(printf '%s' "$payload" | jq -r '.tool_input | "repos/\(.owner // "")/\(.repo // "")/pulls/\(.pullNumber // "")"')"
    pull_number="$(printf '%s' "$payload" | jq -r '.tool_input.pullNumber // empty')"
    docs_only=0 base_sha="" push_note=""
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
            base_sha="${BASH_REMATCH[1]}"
            pr_files="$(git -C "$cwd" -c core.quotePath=false diff --no-renames --name-only "$base_sha" "$merge_sha" 2>/dev/null || true)"
          fi
        fi
      fi
    fi
    # 변경 파일을 모르면 위험 경로·문서만 판정을 할 수 없다 — review·qa가 있어도 막는다
    # (2026-09-27 #96: 훅·CLAUDE.md PR이 refs/pull/96/merge 미수신 상태에서 phase 로그의 review·qa로 통과했다).
    [ -n "$pr_files" ] || deny "PR 변경 파일을 판정할 수 없어 머지하지 않는다(gh 없음·실패, 또는 PR 병합 커밋이 로컬에 없음). git fetch origin pull/${pull_number:-N}/head pull/${pull_number:-N}/merge 뒤 다시 시도하라."
    ui_changed=0 money_changed=0
    if [ -n "$pr_files" ]; then
      awk -F'\t' '{ for (i = 1; i <= NF; i++) if (!($i ~ /^\.claude\/gates\// || ($i ~ /\.md$/ && $i !~ /^\.claude\// && $i !~ /(^|\/)CLAUDE\.md$/))) bad = 1 }
                  END { exit bad }' <<<"$pr_files" && docs_only=1
      # 위험 경로(마이그레이션·스키마·인증·권한·암호화·배포·훅/규칙·CLAUDE.md)는 세션이 머지하지 않는다 —
      # 사용자가 GitHub에서 직접 머지한다(사용자 결정 2026-09-27: 그 밖의 PR은 조건 충족 시 세션이 머지).
      # 이름 바꾸기의 옛 경로(탭 뒤)도 본다. .claude/gates/ 로그는 모든 PR이 건드리므로 제외.
      risky="$(printf '%s\n' "$pr_files" | tr '\t' '\n' \
        | { grep -E '^(db/migrations/|db/schema/|domain/auth/|domain/permissions/|lib/crypto|scripts/(deploy|rollback|bootstrap-gcp|promote-guard)\.sh$|\.github/workflows/|infra/|\.claude/|CLAUDE\.md$)' || true; } \
        | { grep -vE '^\.claude/gates/' || true; } | head -n 3 | tr '\n' ' ')"
      [ -z "$risky" ] || deny "위험 경로가 바뀐 PR(${risky% })은 세션이 머지하지 않는다 — 마이그레이션·스키마·인증·권한·암호화·배포·훅·규칙·CLAUDE.md는 사용자가 GitHub에서 직접 머지한다."
      if printf '%s\n' "$pr_files" | tr '\t' '\n' | grep -Eq '^(app/.*\.(tsx|css)$|ui/|docs/design/tokens\.css$)'; then ui_changed=1; fi
      if printf '%s\n' "$pr_files" | tr '\t' '\n' | grep -Eq '^(domain/(money|corp-cards|reserves|revenue|approvals)/|repositories/(corp-cards|approvals|reserve-entries|revenue-entries)\.ts$)'; then money_changed=1; fi
    fi
    [ "$docs_only" = 1 ] && exit 0
    if awk -F'\t' '{ for (i = 1; i <= NF; i++) if ($i ~ /^\.claude\/gates\/[^\/]+\.log$/) hit = 1 } END { exit !hit }' <<<"$pr_files"; then
      pr_gates=1
      # 대상 브랜치의 그 로그들(이름 바꾸기 옛 경로 포함)에 이미 있는 줄은 빼고 본다 — gh 패치는 merge-base 기준이라
      # squash된 앞 PR의 줄이 +로 남고, 끝 줄바꿈 없는 옛 줄·이름 바꾼 로그도 +로 나온다(/review 2026-10-01).
      gate_files="$(awk -F'\t' '{ for (i = 1; i <= NF; i++) if ($i ~ /^\.claude\/gates\/[^\/]+\.log$/) print $i }' <<<"$pr_files")"
      base_gate_lines=""
      if [ -n "$base_sha" ]; then
        pr_gate_added="$(git -C "$cwd" diff --no-renames -U0 "$base_sha" "$merge_sha" -- ':(top,glob).claude/gates/*.log' 2>/dev/null || true)"
        while IFS= read -r f; do base_gate_lines+="$(git -C "$cwd" show "$base_sha:$f" 2>/dev/null || true)"$'\n'; done <<<"$gate_files"
      else
        pr_gate_added="$(gh api "$pr/files" --paginate --jq '.[] | select(.filename | test("^\\.claude/gates/[^/]+\\.log$")) | .patch // ""' 2>/dev/null || true)"
        base_ref="$(gh api "$pr" --jq '.base.ref' 2>/dev/null || true)"
        [ -n "$base_ref" ] || deny "PR 대상 브랜치를 읽지 못해 게이트 로그를 판정할 수 없다(gh api ${pr} .base.ref). 다시 시도하라."
        base_ref="$(jq -rn --arg s "$base_ref" '$s|@uri')"   # release#1 같은 이름이 쿼리를 자르지 않게
        while IFS= read -r f; do
          [[ "$f" =~ ^\.claude/gates/[A-Za-z0-9._-]+\.log$ ]] || deny "게이트 로그 이름(${f})을 판정할 수 없다 — .claude/gates/ 로그 이름은 영문·숫자·._-만 쓴다."
          # 대상 브랜치에 없는 새 로그(404)만 빈 내용으로 보고, 그 밖의 실패는 막는다(빼기가 꺼지면 앞 PR 줄로 통과한다)
          if ! base_log="$(gh api "${pr%/pulls/*}/contents/$f?ref=$base_ref" -H 'Accept: application/vnd.github.raw' 2>&1)"; then
            # gh는 404 본문(JSON)을 stdout에, 「gh: Not Found (HTTP 404)」를 stderr에 낸다 — 어느 쪽이든 404로 본다
            case "$base_log" in *'"Not Found"'*|*'(HTTP 404)'*) base_log="" ;; *) deny "대상 브랜치의 게이트 로그(${f})를 읽지 못했다(gh api contents). 다시 시도하라." ;; esac
          fi
          base_gate_lines+="$base_log"$'\n'
        done <<<"$gate_files"
      fi
      pr_gate_added="$(sed -n 's/^+\([^+]\)/\1/p' <<<"$pr_gate_added")"
      pr_gate_added="$(grep -vxF -f <(printf '%s\n' "$base_gate_lines") <<<"$pr_gate_added" || true)"
      push_note=" — 이 PR이 .claude/gates/*.log를 바꿨으므로 게이트 줄은 이 PR이 대상 브랜치 대비 더한 줄(커밋·푸시한 줄)에서만 찾는다. 기록을 커밋·푸시한 뒤 다시 시도하라."
    fi
    gate_has review \
      || deny "코드가 바뀐 PR은 머지 전에 /review를 실제로 호출하라(문서만 바뀐 PR은 게이트 없음). gh가 없으면 expectedHeadSha를 넣고 PR 커밋을 받아 둬야 문서 PR로 판정한다(git fetch origin pull/${pull_number:-N}/head pull/${pull_number:-N}/merge).${push_note}"
    if [ "$ui_changed" = 1 ]; then
      missing=""
      for g in qa design-review; do gate_has "$g" || missing="$missing /$g"; done
      [ -z "$missing" ] || deny "화면에 영향을 주는 파일(app/의 .tsx·.css, ui/, docs/design/tokens.css)이 바뀐 PR은 브라우저 검증 기록이 있어야 머지한다(없음:${missing}, CLAUDE.md §6: UI 완료 판정 = /design-review → /qa). 호출 뒤 다시 시도하라.${push_note}"
    fi
    if [ "$money_changed" = 1 ] && ! gate_has cso; then
      deny "돈·결재 경로(domain/money·corp-cards·reserves·revenue·approvals와 그 저장소)가 바뀐 PR은 독립 검토 /cso 기록이 있어야 머지한다. 호출 뒤 다시 시도하라.${push_note}"
    fi
    ;;
esac
exit 0
