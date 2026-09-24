#!/usr/bin/env bash
# 회귀 테스트 — plant8-rule-guard.sh
# 출처: /mnt/project-files/rules-hook/table.md B절 + 사용자 결정(2026-09-24 세션):
#   1) 머지 승인: Codex 기한 전엔 「머지해」만(밤 예외 없음), 기한 뒤엔 「머지해」/「잘게」/00~08 KST
#   2) git push --force/-f/+refspec 차단, --force-with-lease는 경고만
#   3) 커밋 접두어 docs/feat/fix/chore 외 경고만, 접두어 자체 없으면 차단(단 Merge/Revert 제목,
#      -m/-F 없는 commit, -F 파일은 항상 통과)
#   4) Codex 기한 2026-09-29 07:13 KST, PLANT8_CODEX_BLOCK_UNTIL/PLANT8_CODEX_ALLOW/PLANT8_NOW로 조정
#   5) 훅·settings 승인 = 사용자 글에 "훅"+(넣어/고쳐/걸어/수정/추가/만들어), 물음표로 끝나면 불인정
# payload를 stdin으로 넣어 각 이벤트를 검증한다. 실제 리포를 절대 건드리지 않는다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT="$HOOKS/plant8-rule-guard.sh"

export TMPDIR
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

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

# hook <json> [env assignments...]
# HOOK_ENV can be set by caller before calling
hook() {
  local json="$1"
  local errfile
  errfile="$(mktemp "$TMPDIR/stderr.XXXXXX")"
  HOOK_STDOUT="$(printf '%s' "$json" | env CLAUDE_PROJECT_DIR="$PROJECT" PLANT8_NOW="${PLANT8_NOW:-}" PLANT8_CODEX_BLOCK_UNTIL="${PLANT8_CODEX_BLOCK_UNTIL:-}" PLANT8_CODEX_ALLOW="${PLANT8_CODEX_ALLOW:-}" bash "$SCRIPT" 2>"$errfile")"
  HOOK_RC=$?
  HOOK_STDERR="$(cat "$errfile")"
  rm -f "$errfile"
}

PROJECT="$(mktemp -d "$TMPDIR/proj.XXXXXX")"
mkdir -p "$PROJECT/.claude/gates" "$PROJECT/.planning"

# ---------------------------------------------------------------------------
# transcript helpers
new_transcript() {
  mktemp "$TMPDIR/t.XXXXXX.jsonl"
}

# human envelope line (real format): <wake><project><thread><message from="human">TEXT</message>
line_human_envelope() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false,
      message:{role:"user", content:("<wake reason=\"mention\"><project><thread><message trigger=\"true\" from=\"human\" trust=\"principal\" author=\"랑쟈\">" + $t + "</message></thread></project></wake>")},
      timestamp:$ts, origin:{kind:"human"}}'
}

line_agent_envelope() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false,
      message:{role:"user", content:("<wake reason=\"mention\"><project><thread><message from=\"agent\">" + $t + "</message></thread></project></wake>")},
      timestamp:$ts, origin:{kind:"human"}}'
}

line_plain_human() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false, message:{role:"user", content:$t}, timestamp:$ts, origin:{kind:"human"}}'
}

line_cited() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false,
      message:{role:"user", content:("<cited author=\"user\">" + $t + "</cited>")},
      timestamp:$ts, origin:{kind:"agent"}}'
}

line_plain_agent() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false, message:{role:"user", content:$t}, timestamp:$ts, origin:{kind:"agent"}}'
}

line_button_press() {
  local text="$1" ts="$2"
  jq -nc --arg t "$text" --arg ts "$ts" \
    '{type:"user", isSidechain:false, isMeta:false,
      message:{role:"user", content:("Pressed the button \"" + $t + "\" (action_id: x) on card cmsg_x")},
      timestamp:$ts, origin:{kind:"human"}}'
}

line_merge_success() {
  local ts="$1"
  jq -nc --arg ts "$ts" \
    '{type:"assistant", message:{content:[{type:"tool_use", id:"tu1", name:"mcp__github__merge_pull_request", input:{}}]}, timestamp:$ts}'
  jq -nc '{type:"user", message:{content:[{type:"tool_result", tool_use_id:"tu1", is_error:false, content:"ok"}]}}'
}

# ---------------------------------------------------------------------------
echo "== R1/R2: Agent model =="

payload_agent() { jq -nc --arg sub "$1" --arg model "${2-null}" --arg prompt "${3:-}" '
  {tool_name:"Agent", tool_input:({subagent_type:$sub, prompt:$prompt} + (if $model=="null" then {} else {model:$model} end))}'; }

hook "$(payload_agent worker null x)"
expect_rc "R1-1: no model, non-gsd -> 2" 2 "$HOOK_RC"
expect_contains "R1-1: message mentions model" "$HOOK_STDERR" "model"

hook "$(payload_agent worker sonnet x)"
expect_rc "R1-2: sonnet model, non-gsd -> 0" 0 "$HOOK_RC"
expect_empty "R1-2: no warning" "$HOOK_STDOUT"

hook "$(payload_agent gsd-executor null '...')"
expect_rc "R1-3: gsd-* no model -> 0 (inherit)" 0 "$HOOK_RC"

hook "$(jq -nc '{tool_name:"Agent", tool_input:{subagent_type:"general-purpose", model:""}}')"
expect_rc "R1-4: empty model string, non-gsd -> 2" 2 "$HOOK_RC"

hook "$(payload_agent worker fable 'Phase 04.1 최종 전체 검토')"
expect_rc "R2-5: fable + exempt phrase -> 0" 0 "$HOOK_RC"
expect_empty "R2-5: no warning" "$HOOK_STDOUT"

hook "$(payload_agent worker fable 'PR 상태 조회')"
expect_rc "R2-6: fable without exempt phrase -> 0" 0 "$HOOK_RC"
expect_contains "R2-6: warns about fable" "$HOOK_STDOUT" "Fable"

hook "$(payload_agent worker haiku 'plan-eng-review 결과 판단')"
expect_rc "R2-7: haiku + judgement word -> 0" 0 "$HOOK_RC"
expect_contains "R2-7: warns opus" "$HOOK_STDOUT" "opus"

hook "$(payload_agent worker sonnet 'E2E 테스트 작성')"
expect_rc "R2-8: sonnet + non-review task -> 0" 0 "$HOOK_RC"
expect_empty "R2-8: no warning" "$HOOK_STDOUT"

hook "$(payload_agent worker opus '보안 검토')"
expect_rc "R2-9: opus + security review -> 0" 0 "$HOOK_RC"
expect_empty "R2-9: no warning" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
echo "== R3: Codex 차단(기한 전) =="
export PLANT8_NOW
PLANT8_NOW="$(date -d '2026-09-26T00:00:00+09:00' +%s)"

payload_bash() { jq -nc --arg c "$1" '{tool_name:"Bash", tool_input:{command:$c}}'; }
payload_skill() { jq -nc --arg s "$1" --arg a "$2" '{tool_name:"Skill", tool_input:{skill:$s, args:$a}}'; }

hook "$(payload_bash 'codex exec "review"')"
expect_rc "R3-1: codex exec -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'cd /repo && codex review --base main')"
expect_rc "R3-2: cd && codex review -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'timeout 600 codex exec -')"
expect_rc "R3-3: timeout codex -> 2" 2 "$HOOK_RC"

hook "$(payload_bash '~/.local/bin/codex exec x')"
expect_rc "R3-4: path-qualified codex -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'command -v codex')"
expect_rc "R3-5: command -v codex (arg, not cmd word) -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'codex --version')"
expect_rc "R3-6: codex --version -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'grep -rn codex docs/')"
expect_rc "R3-7: grep codex (not a command word) -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'bash scripts/install-codex.sh')"
expect_rc "R3-8: install-codex.sh filename, not word 'codex' -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'cat /mnt/project-files/hook-coordinator/codex-r2-prompt.md')"
expect_rc "R3-9: cat codex-*.md filename -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'echo "codex exec 나중에"')"
expect_rc "R3-10: quoted string containing codex -> 0" 0 "$HOOK_RC"

hook "$(payload_skill codex '')"
expect_rc "R3-11a: Skill codex -> 2" 2 "$HOOK_RC"
hook "$(payload_skill gstack:codex '')"
expect_rc "R3-11b: Skill gstack:codex -> 2" 2 "$HOOK_RC"

hook "$(payload_skill gsd-review '04.3 --codex')"
expect_rc "R3-12a: gsd-review --codex -> 2" 2 "$HOOK_RC"
hook "$(payload_skill gsd-review '04.3 --claude')"
expect_rc "R3-12b: gsd-review --claude -> 0" 0 "$HOOK_RC"
expect_empty "R3-12b: no warning" "$HOOK_STDOUT"
hook "$(payload_skill gsd-review '04.3')"
expect_rc "R3-12c: gsd-review no lane flag -> 0" 0 "$HOOK_RC"
expect_contains "R3-12c: warns about default reviewer" "$HOOK_STDOUT" "Codex"

hook "$(payload_bash 'codex exec "review"')"
PLANT8_NOW="$(date -d '2026-09-29T07:14:00+09:00' +%s)"
hook "$(payload_bash 'codex exec "review"')"
expect_rc "R3-13: after cutoff -> 0" 0 "$HOOK_RC"

PLANT8_NOW="$(date -d '2026-09-26T00:00:00+09:00' +%s)"
export PLANT8_CODEX_ALLOW=1
hook "$(payload_bash 'codex exec "review"')"
expect_rc "R3-14: PLANT8_CODEX_ALLOW=1 -> 0" 0 "$HOOK_RC"
unset PLANT8_CODEX_ALLOW

# ---------------------------------------------------------------------------
echo "== R4: 사용자에게 보이는 글 한국어 =="

payload_reply() { jq -nc --arg t "$1" '{tool_name:"mcp__hearthbot__reply", tool_input:{text:$t}}'; }
payload_status() { jq -nc --arg t "$1" '{tool_name:"mcp__hearthbot__update_status", tool_input:{text:$t}}'; }

hook "$(payload_reply 'PR #70 머지했습니다. CI 초록.')"
expect_rc "R4-1: korean with PR/CI acronyms -> 0" 0 "$HOOK_RC"
expect_empty "R4-1: no warning" "$HOOK_STDOUT"

hook "$(payload_reply 'I merged the PR and CI is green now, next step is QA.')"
expect_rc "R4-2: all-english sentence -> 2" 2 "$HOOK_RC"

hook "$(payload_reply 'https://github.com/rrangjaa-eng/ERP_PLANT8_260917/pull/70')"
expect_rc "R4-3: URL only -> 0" 0 "$HOOK_RC"
expect_empty "R4-3: no warning" "$HOOK_STDOUT"

hook "$(payload_reply '`pnpm test:unit` 통과')"
expect_rc "R4-4: inline code + korean -> 0" 0 "$HOOK_RC"
expect_empty "R4-4: no warning" "$HOOK_STDOUT"

hook "$(payload_reply 'LGTM')"
expect_rc "R4-5: acronym only -> 0" 0 "$HOOK_RC"
expect_empty "R4-5: no warning" "$HOOK_STDOUT"

hook "$(payload_reply 'Done.')"
expect_rc "R4-6: single english word -> 0" 0 "$HOOK_RC"
expect_empty "R4-6: no warning" "$HOOK_STDOUT"

hook "$(payload_reply "$(printf '완료\n\`\`\`\nError: Cannot find module x imported from y and more words here\n\`\`\`')")"
expect_rc "R4-7: code block stripped -> 0" 0 "$HOOK_RC"
expect_empty "R4-7: no warning" "$HOOK_STDOUT"

hook "$(payload_status "$(printf 'Phase 4 실행 04-28\n\n체크 lint·typecheck\n진행 전체 테스트')")"
expect_rc "R4-8: korean status -> 0" 0 "$HOOK_RC"

hook "$(payload_status "$(printf 'Phase 4 execution\n\nran lint and typecheck\nrunning the full test suite')")"
expect_rc "R4-9: english status -> 2" 2 "$HOOK_RC"

payload_decision() { jq -nc --arg q "$1" '{tool_name:"mcp__hearthbot__ask_decision", tool_input:{question:$q, context:"", reason:"", options:[{label:$ARGS.positional[0], consequence:$ARGS.positional[1]},{label:$ARGS.positional[2], consequence:$ARGS.positional[3]}]}}' --args "$2" "$3" "$4" "$5"; }

hook "$(payload_decision '지금 진행할까요?' 'Proceed now' '바로 진행' '기다림' '나중에')"
expect_rc "R4-10: korean question, short english labels -> 0" 0 "$HOOK_RC"
expect_contains "R4-10: warns (short english label)" "$HOOK_STDOUT" "한국어"

hook "$(payload_decision 'Should we proceed with the deploy right now' 'Proceed now' 'go ahead' 'Wait' 'later on')"
expect_rc "R4-11: all-english decision -> 2" 2 "$HOOK_RC"

payload_widget() { jq -nc --arg t "$1" '{tool_name:"mcp__hearthbot__post_widget", tool_input:{input:{title:"ci_status_board", widget_code:"<svg></svg>"}, text:$t}}'; }
hook "$(payload_widget 'CI 현황 그림')"
expect_rc "R4-12: widget text korean (title/code excluded) -> 0" 0 "$HOOK_RC"
expect_empty "R4-12: no warning" "$HOOK_STDOUT"

payload_label() { jq -nc --arg l "$1" '{tool_name:"mcp__hearthbot__set_thread_label", tool_input:{label:$l}}'; }
hook "$(payload_label '04.4 review fixes')"
expect_rc "R4-13: thread label short english -> 0" 0 "$HOOK_RC"
expect_contains "R4-13: warning present" "$HOOK_STDOUT" "한국어"

hook "$(payload_reply '수정: plant8-skill-gate.sh, .claude/settings.json, e2e/revenue-section.spec.ts 반영')"
expect_rc "R4-14: file paths excluded from word count -> 0" 0 "$HOOK_RC"
expect_empty "R4-14: no warning" "$HOOK_STDOUT"

hook "$(payload_reply 'CI는 18:04Z에 끝남')"
expect_rc "R4-15: UTC time in text -> 0" 0 "$HOOK_RC"
expect_contains "R4-15: warns about KST" "$HOOK_STDOUT" "KST"

hook "$(payload_reply "$(printf '어느 쪽?\na) 지금 머지\nb) 내일')")"
expect_rc "R4-16: a/b list in reply text -> 0" 0 "$HOOK_RC"
expect_contains "R4-16: warns ask_decision card" "$HOOK_STDOUT" "ask_decision"

hook "$(payload_reply 'PR 반영함 We still need to update the docs and add more tests for this soon')"
expect_rc "R4-17: korean 2 words + long english sentence -> 0" 0 "$HOOK_RC"
expect_contains "R4-17: warns ratio" "$HOOK_STDOUT" "한국어"

# ---------------------------------------------------------------------------
echo "== R5: 패키지 매니저 =="

hook "$(payload_bash 'npm install')"
expect_rc "R5-1: npm install -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'npm i lodash')"
expect_rc "R5-2: npm i pkg -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'yarn add x')"
expect_rc "R5-3: yarn add -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'bun add x')"
expect_rc "R5-4: bun add -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'npm view next version')"
expect_rc "R5-5: npm view (not install) -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'npm --version')"
expect_rc "R5-6: npm --version -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'pnpm install')"
expect_rc "R5-7: pnpm install -> 0" 0 "$HOOK_RC"
expect_empty "R5-7: no warning" "$HOOK_STDOUT"
hook "$(payload_bash 'pnpm install --frozen-lockfile')"
expect_rc "R5-8: pnpm install --frozen-lockfile -> 0" 0 "$HOOK_RC"
expect_empty "R5-8: no warning" "$HOOK_STDOUT"
hook "$(payload_bash 'pnpm add zod')"
expect_rc "R5-9: pnpm add pkg -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R5-9: warns approval" "$HOOK_STDOUT" "승인"
hook "$(payload_bash 'npm install -g @openai/codex')"
expect_rc "R5-10: npm -g -> 0 with warning" 0 "$HOOK_RC"
hook "$(payload_bash 'npx playwright test')"
expect_rc "R5-11: npx -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R5-11: warns pnpm dlx" "$HOOK_STDOUT" "pnpm"
hook "$(payload_bash 'grep "npm install" README.md')"
expect_rc "R5-12: grep with npm string arg -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'echo npm ci')"
expect_rc "R5-13: echo npm ci (arg, not cmd word) -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== R6: git push =="

hook "$(payload_bash 'git push -u origin HEAD')"
expect_rc "R6-1: normal push -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'git push origin HEAD:claude/gsd-progress-e1nzgu')"
expect_rc "R6-2: push to own branch -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'git push --force origin x')"
expect_rc "R6-3: --force -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'git push -f')"
expect_rc "R6-4: -f -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'git push origin +HEAD:x')"
expect_rc "R6-5: +refspec -> 2" 2 "$HOOK_RC"
# 사용자 결정 2: --force-with-lease는 경고만(차단 아님) — spec 원안(차단)을 덮어쓴다
hook "$(payload_bash 'git push --force-with-lease')"
expect_rc "R6-6: --force-with-lease -> 0 (경고만, 사용자 결정)" 0 "$HOOK_RC"
expect_contains "R6-6: warns force-with-lease" "$HOOK_STDOUT" "force-with-lease"
hook "$(payload_bash 'git push origin main')"
expect_rc "R6-7: push to main -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'git push origin HEAD:main')"
expect_rc "R6-8: push to HEAD:main -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'git push origin feature/maintenance')"
expect_rc "R6-9: branch name containing 'main' substring -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'git log --format=%s | grep force')"
expect_rc "R6-10: not a push command -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== R7: 머지 승인 =="

payload_merge() { jq -nc --arg n "$1" --arg tp "$2" '{tool_name:"mcp__github__merge_pull_request", tool_input:{pullNumber:($n|tonumber)}, transcript_path:$tp}'; }

T1="$(new_transcript)"
line_human_envelope '#71 머지해' "2026-09-26T10:00:00Z" > "$T1"
hook "$(payload_merge 71 "$T1")"
expect_rc "R7-1: 머지해 with matching PR number -> 0" 0 "$HOOK_RC"

hook "$(payload_merge 72 "$T1")"
expect_rc "R7-2: 머지해 with different PR number -> 2" 2 "$HOOK_RC"

T3="$(new_transcript)"
line_human_envelope '머지해' "2026-09-26T10:00:00Z" > "$T3"
hook "$(payload_merge 71 "$T3")"
expect_rc "R7-3: 머지해 no number, no prior merge -> 0" 0 "$HOOK_RC"

T4="$(new_transcript)"
{
  line_human_envelope '머지해' "2026-09-26T10:00:00Z"
  line_merge_success "2026-09-26T10:05:00Z"
} > "$T4"
hook "$(payload_merge 71 "$T4")"
expect_rc "R7-4: approval already used for a prior merge -> 2" 2 "$HOOK_RC"

T5="$(new_transcript)"
line_human_envelope '머지해도 돼?' "2026-09-26T10:00:00Z" > "$T5"
hook "$(payload_merge 71 "$T5")"
expect_rc "R7-5: question form is not approval -> 2" 2 "$HOOK_RC"

T6="$(new_transcript)"
line_agent_envelope '머지해' "2026-09-26T10:00:00Z" > "$T6"
hook "$(payload_merge 71 "$T6")"
expect_rc "R7-6: from=agent only -> 2" 2 "$HOOK_RC"

T7="$(new_transcript)"
line_cited '머지해' "2026-09-26T10:00:00Z" > "$T7"
hook "$(payload_merge 71 "$T7")"
expect_rc "R7-7: coordinator relay via cited author=user -> 0" 0 "$HOOK_RC"

T8="$(new_transcript)"
line_plain_agent '사용자에게 머지해를 받아라' "2026-09-26T10:00:00Z" > "$T8"
hook "$(payload_merge 71 "$T8")"
expect_rc "R7-8: coordinator plaintext (no cited tag) -> 2" 2 "$HOOK_RC"

T9="$(new_transcript)"
line_button_press '머지해' "2026-09-26T10:00:00Z" > "$T9"
hook "$(payload_merge 71 "$T9")"
expect_rc "R7-9: button press is not approval -> 2" 2 "$HOOK_RC"

hook "$(jq -nc '{tool_name:"mcp__github__merge_pull_request", tool_input:{pullNumber:71}}')"
expect_rc "R7-10: no transcript_path -> 2" 2 "$HOOK_RC"

hook "$(jq -nc --arg tp "$T1" '{tool_name:"Bash", tool_input:{command:"gh pr merge 71 --squash"}, transcript_path:$tp}')"
expect_rc "R7-11a: gh pr merge with approval -> 0" 0 "$HOOK_RC"
hook "$(jq -nc --arg tp "$T3" '{tool_name:"Bash", tool_input:{command:"gh pr merge 99 --squash"}, transcript_path:$tp}')"
expect_rc "R7-11b: gh pr merge different PR, approval has no number, no prior merge -> 0" 0 "$HOOK_RC"

hook "$(jq -nc --arg tp "$T1" '{tool_name:"Bash", tool_input:{command:"gh pr view 71"}, transcript_path:$tp}')"
expect_rc "R7-12: gh pr view is not a merge command -> 0" 0 "$HOOK_RC"

PLANT8_NOW="$(date -d '2026-09-26T03:00:00+09:00' +%s)"
T13="$(new_transcript)"
: > "$T13"
hook "$(payload_merge 71 "$T13")"
expect_rc "R7-13: before codex cutoff, no approval, night hours -> 2 (no night exception)" 2 "$HOOK_RC"

PLANT8_NOW="$(date -d '2026-09-30T03:00:00+09:00' +%s)"
T14="$(new_transcript)"
: > "$T14"
hook "$(payload_merge 71 "$T14")"
expect_rc "R7-14: after cutoff, no approval, 00-08 KST -> 0 (night exception)" 0 "$HOOK_RC"
expect_contains "R7-14: warns 7-condition checklist" "$HOOK_STDOUT" "CI"

PLANT8_NOW="$(date -d '2026-09-30T14:00:00+09:00' +%s)"
T15A="$(new_transcript)"
line_human_envelope '잘게' "$(date -u -d "@$((PLANT8_NOW - 9*3600))" +%Y-%m-%dT%H:%M:%SZ)" > "$T15A"
hook "$(payload_merge 71 "$T15A")"
expect_rc "R7-15a: 잘게 9h ago, after cutoff -> 0 (night exception)" 0 "$HOOK_RC"

T15B="$(new_transcript)"
line_human_envelope '잘게' "$(date -u -d "@$((PLANT8_NOW - 11*3600))" +%Y-%m-%dT%H:%M:%SZ)" > "$T15B"
hook "$(payload_merge 71 "$T15B")"
expect_rc "R7-15b: 잘게 11h ago -> 2 (too old)" 2 "$HOOK_RC"

PLANT8_NOW="$(date -d '2026-09-26T00:00:00+09:00' +%s)"
hook "$(jq -nc --arg tp "$T13" '{tool_name:"mcp__github__enable_pr_auto_merge", tool_input:{pullNumber:71}, transcript_path:$tp}')"
expect_rc "R7-16: enable_pr_auto_merge, no approval -> 2" 2 "$HOOK_RC"

echo "== R7: 실제 트랜스크립트 포맷(JSONL, <message from=human>) =="
T_REAL="$(new_transcript)"
jq -nc --arg ts "2026-09-24T18:04:03Z" '
{type:"user", isSidechain:false, isMeta:false,
 message:{role:"user", content:"<wake reason=\"mention\" current-time=\"2026-09-24T18:04:24Z\">\n  <project id=\"chan_1\" name=\"plant8\" type=\"project\">\n    <thread ts=\"cmsg_1\">\n      <message trigger=\"true\" from=\"human\" trust=\"principal\" role=\"initiator\" author=\"랑쟈\" author-id=\"user_1\" id=\"cmsg_1\" sent-at=\"2026-09-24T18:04:03Z\" mention=\"true\">#71 머지해</message>\n    </thread>\n  </project>\n  <system-note>note</system-note>\n</wake>\n"},
 timestamp:$ts, origin:{kind:"human"}}' > "$T_REAL"
hook "$(payload_merge 71 "$T_REAL")"
expect_rc "R7-real: real multi-attribute <wake> transcript format -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== R8: 훅·settings·CLAUDE.md 보호 =="

payload_edit() { jq -nc --arg p "$1" --arg tp "$2" '{tool_name:"Edit", tool_input:{file_path:$p}, transcript_path:$tp}'; }
payload_write() { jq -nc --arg p "$1" --arg tp "$2" '{tool_name:"Write", tool_input:{file_path:$p}, transcript_path:$tp}'; }

TE="$(new_transcript)"; : > "$TE"
hook "$(payload_edit "$PROJECT/.claude/hooks/plant8-skill-gate.sh" "$TE")"
expect_rc "R8-1: hook edit without approval -> 2" 2 "$HOOK_RC"

TA="$(new_transcript)"
line_human_envelope '훅 고쳐' "2026-09-26T10:00:00Z" > "$TA"
hook "$(payload_edit "$PROJECT/.claude/hooks/plant8-skill-gate.sh" "$TA")"
expect_rc "R8-2: hook edit with 훅 고쳐 approval -> 0" 0 "$HOOK_RC"

TQ="$(new_transcript)"
line_human_envelope '훅 고쳐도 돼?' "2026-09-26T10:00:00Z" > "$TQ"
hook "$(payload_edit "$PROJECT/.claude/hooks/plant8-skill-gate.sh" "$TQ")"
expect_rc "R8-3: question form is not approval -> 2" 2 "$HOOK_RC"

TB="$(new_transcript)"
line_button_press '훅 고쳐' "2026-09-26T10:00:00Z" > "$TB"
hook "$(payload_edit "$PROJECT/.claude/hooks/plant8-skill-gate.sh" "$TB")"
expect_rc "R8-4: button-pressed approval doesn't count -> 2" 2 "$HOOK_RC"

hook "$(payload_write "$PROJECT/.claude/settings.json" "$TE")"
expect_rc "R8-5: write settings.json without approval -> 2" 2 "$HOOK_RC"
hook "$(payload_write "$PROJECT/.claude/settings.local.json" "$TE")"
expect_rc "R8-6: write settings.local.json without approval -> 2" 2 "$HOOK_RC"
hook "$(payload_write "$PROJECT/.claude/skills/x.md" "$TE")"
expect_rc "R8-7: write unrelated .claude path -> 0" 0 "$HOOK_RC"
hook "$(payload_write "$PROJECT/docs/hooks.md" "$TE")"
expect_rc "R8-8: write docs about hooks -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'cat .claude/hooks/plant8-pre-push-gate.sh')"
expect_rc "R8-9: read hook file -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'bash .claude/hooks/tests/plant8-skill-gate.test.sh')"
expect_rc "R8-10: run hook test -> 0" 0 "$HOOK_RC"

hook "$(jq -nc --arg tp "$TE" '{tool_name:"Bash", tool_input:{command:"sed -i 's/a/b/' .claude/hooks/x.sh"}, transcript_path:$tp}')"
expect_rc "R8-11: sed -i on hook file without approval -> 2" 2 "$HOOK_RC"

hook "$(jq -nc --arg tp "$TE" '{tool_name:"Bash", tool_input:{command:"echo x >> .claude/settings.json"}, transcript_path:$tp}')"
expect_rc "R8-12: append to settings.json without approval -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'cp .claude/hooks/x.sh /tmp/')"
expect_rc "R8-13: cp hook file elsewhere -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R8-13: warns" "$HOOK_STDOUT" "승인"

hook "$(jq -nc --arg tp "$TA" '{tool_name:"Bash", tool_input:{command:"sed -i 's/x/y/' CLAUDE.md"}, transcript_path:$tp}')"
expect_rc "R8-14: bash bypass edit of CLAUDE.md always blocked (even with 훅 approval) -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'git restore CLAUDE.md')"
expect_rc "R8-15: git restore CLAUDE.md -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'grep -n Fable CLAUDE.md')"
expect_rc "R8-16: grep CLAUDE.md -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== R9: .planning/ 직접 편집(경고) =="

session_r9="sid-r9-$$"
state_dir="${TMPDIR:-/tmp}/plant8-skill-gate"
mkdir -p "$state_dir"

hook "$(jq -nc --arg p "$PROJECT/.planning/STATE.md" --arg s "$session_r9" '{tool_name:"Edit", tool_input:{file_path:$p}, session_id:$s}')"
expect_rc "R9-1: .planning/ edit without gsd skill recorded -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R9-1: warns gsd skill" "$HOOK_STDOUT" "gsd"

session_r9b="sid-r9b-$$"
echo "gsd-plan-phase" > "$state_dir/${session_r9b}.skills"
hook "$(jq -nc --arg p "$PROJECT/.planning/STATE.md" --arg s "$session_r9b" '{tool_name:"Edit", tool_input:{file_path:$p}, session_id:$s}')"
expect_rc "R9-2: .planning/ edit with gsd skill recorded -> 0 no warning" 0 "$HOOK_RC"
expect_empty "R9-2: no warning" "$HOOK_STDOUT"

hook "$(jq -nc --arg p "$PROJECT/docs/x.md" --arg s "$session_r9" '{tool_name:"Edit", tool_input:{file_path:$p}, session_id:$s}')"
expect_rc "R9-3: unrelated docs edit -> 0 no warning" 0 "$HOOK_RC"
expect_empty "R9-3: no warning" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
echo "== R10: 프로덕션 DB · 출력 저장(경고) =="

hook "$(payload_bash 'gcloud sql connect plant8-prod')"
expect_rc "R10-1: prod-looking gcloud sql connect -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R10-1: warns prod db" "$HOOK_STDOUT" "프로덕션"

hook "$(payload_bash 'pnpm db:dev')"
expect_rc "R10-2: local dev db -> 0 no warning" 0 "$HOOK_RC"
expect_empty "R10-2: no warning" "$HOOK_STDOUT"

hook "$(payload_bash 'psql postgres://u@localhost:5432/x')"
expect_rc "R10-3: psql localhost -> 0 no warning" 0 "$HOOK_RC"
expect_empty "R10-3: no warning" "$HOOK_STDOUT"

hook "$(payload_bash 'pnpm test:unit')"
expect_rc "R10-4: test output not saved -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R10-4: warns save output" "$HOOK_STDOUT" "요약"

hook "$(payload_bash 'pnpm test:unit > /tmp/u.log 2>&1; tail -20 /tmp/u.log')"
expect_rc "R10-5: test output saved to file -> 0 no warning" 0 "$HOOK_RC"
expect_empty "R10-5: no warning" "$HOOK_STDOUT"

# ---------------------------------------------------------------------------
echo "== R11: PR draft =="

payload_create_pr() { jq -nc --arg d "$1" '{tool_name:"mcp__github__create_pull_request", tool_input:(if $d=="" then {} else {draft:($d=="true")} end)}'; }
hook "$(payload_create_pr true)"
expect_rc "R11-1: draft:true -> 0" 0 "$HOOK_RC"
hook "$(payload_create_pr false)"
expect_rc "R11-2: draft:false -> 2" 2 "$HOOK_RC"
hook "$(payload_create_pr '')"
expect_rc "R11-3: draft missing -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'gh pr create --draft --title x')"
expect_rc "R11-4: gh pr create --draft -> 0" 0 "$HOOK_RC"
hook "$(payload_bash 'gh pr create --title x')"
expect_rc "R11-5: gh pr create without --draft -> 2" 2 "$HOOK_RC"
hook "$(payload_bash 'gh pr list')"
expect_rc "R11-6: gh pr list (not create) -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== R12: 커밋 제목 =="

hook "$(payload_bash 'git commit -m "fix: 머지 승인 확인"')"
expect_rc "R12-1: fix: prefix -> 0" 0 "$HOOK_RC"
expect_empty "R12-1: no warning" "$HOOK_STDOUT"

hook "$(payload_bash 'git commit -m "docs(04.1): 계획 갱신"')"
expect_rc "R12-2: docs(scope): prefix -> 0" 0 "$HOOK_RC"
expect_empty "R12-2: no warning" "$HOOK_STDOUT"

hook "$(jq -nc '{tool_name:"Bash", tool_input:{command:"git commit -m \"$(cat <<'"'"'EOF'"'"'\nfeat: add rule guard\n\n한국어 본문\nEOF\n)\""}}')"
expect_rc "R12-3: heredoc commit message -> 0" 0 "$HOOK_RC"
expect_empty "R12-3: no warning" "$HOOK_STDOUT"

hook "$(payload_bash 'git commit -m "훅 추가"')"
expect_rc "R12-4: no english prefix -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'git commit -m "Update CLAUDE.md"')"
expect_rc "R12-5: no colon prefix -> 2" 2 "$HOOK_RC"

hook "$(payload_bash 'git commit -m "test(04-28): 회귀 테스트"')"
expect_rc "R12-6: test: prefix -> 0 with warning" 0 "$HOOK_RC"
expect_contains "R12-6: warns non-standard prefix" "$HOOK_STDOUT" "접두어"

hook "$(payload_bash 'git commit --amend --no-edit')"
expect_rc "R12-7: amend --no-edit, no title to check -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'git commit -F msg.txt')"
expect_rc "R12-8: -F file, unparsed -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'git log --grep "fix:"')"
expect_rc "R12-9: not a commit command -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'git commit -m "Merge branch '"'"'main'"'"' into feature"')"
expect_rc "R12-10: Merge title never blocked -> 0" 0 "$HOOK_RC"

hook "$(payload_bash 'git commit')"
expect_rc "R12-11: commit without -m/-F (editor) -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "== 안전망: 잘못된 입력에 절대 차단하지 않는다 =="

HOOK_STDOUT="$(printf 'not json at all' | bash "$SCRIPT" 2>/tmp/rgstderr)"
HOOK_RC=$?
expect_rc "safety-1: invalid JSON payload -> 0 (never crash)" 0 "$HOOK_RC"

HOOK_STDOUT="$(printf '' | bash "$SCRIPT" 2>/tmp/rgstderr)"
HOOK_RC=$?
expect_rc "safety-2: empty payload -> 0" 0 "$HOOK_RC"

HOOK_STDOUT="$(jq -nc '{tool_name:"UnknownTool", tool_input:{}}' | bash "$SCRIPT" 2>/tmp/rgstderr)"
HOOK_RC=$?
expect_rc "safety-3: unrecognized tool -> 0" 0 "$HOOK_RC"

# ---------------------------------------------------------------------------
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
