#!/usr/bin/env bash
# 세션 경계 훅 — 웨이브 하나가 끝나면 그 세션에서 더 나아가지 않고 새 세션으로 넘긴다.
# 사용자 요청(2026-09-23): "플랜이 종료되면 새 세션으로 넘어가게 해" → 2026-09-27 개정: 단위를
# 플랜에서 웨이브로 넓힘(세션 교체 비용이 플랜 실행 시간과 비슷했다). quick 완료는 경계가 아니다.
# 사용자 결정(2026-09-23, D-01): 게이트 리뷰(/plan-ceo-review, /plan-eng-review,
# /plan-design-review)의 종료는 여전히 세션 경계다.
#
# 경계로 보는 것(메인 에이전트 기준):
#   - gsd-executor를 띄운 세션: 첫 디스패치 때 기록한 웨이브의 플랜이 전부 SUMMARY를 가짐(웨이브 종료)
#   - 플랜에 wave 정보가 없는 옛 형식: 이 세션 시작 뒤 새 `.planning/phases/*/*-SUMMARY.md`가 생김
#   - `state.planned-phase` 실행(/gsd-plan-phase 13b — 계획 완료)
#   - 이 세션에서 게이트 리뷰를 시작했고 그 보고서(docs/designs/*review*)가 커밋됨(D-01)
#   웨이브 계산은 lib/plant8-wave.sh(skill-gate와 공유)
#
# 동작(첫 인자 = 이벤트):
#   session-start : 지금 있는 SUMMARY 목록을 기준으로 저장(재개 때는 기준이 없을 때만)
#   post-tool     : 경계를 처음 감지하면 인계 순서를 컨텍스트에 넣는다
#   pre-tool      : 게이트 리뷰 시작 중·후에 다른 단위를 새로 시작하려 하면 막는다(exit 2).
#                   경계 뒤 gsd-executor를 띄우려 해도 막는다(exit 2)
#   stop          : 경계가 났는데 인계를 안 했으면 한 번 멈춤을 막고 인계를 시킨다
set -euo pipefail

event="${1:-}"
payload="$(cat)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // empty')"
project="${CLAUDE_PROJECT_DIR:-.}"

state_dir="${TMPDIR:-/tmp}/plant8-session-boundary"
mkdir -p "$state_dir"
baseline="$state_dir/${session}.baseline"
branch_file="$state_dir/${session}.branch"
flag_plan_phase="$state_dir/${session}.plan-phase-done"
announced="$state_dir/${session}.announced"
stop_reminded="$state_dir/${session}.stop-reminded"
own="$state_dir/${session}.own"  # 처음 볼 때 main에 없던(이 세션이 만든) SUMMARY
wave_file="$state_dir/${session}.wave"  # 이 세션이 실행 중인 "phase_pad wave"(첫 gsd-executor 디스패치 때 기록)
# shellcheck source=lib/plant8-wave.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/plant8-wave.sh"

gate_reviews="plan-ceo-review|plan-eng-review|plan-design-review"

normalize() { sed -e 's/^\///' -e 's/^[^:]*://' -e 's/[[:space:]].*$//'; }

# quick(.planning/quick) 완료는 2026-09-27부터 경계가 아니다(D-03 폐기) — 페이즈 플랜만 본다.
list_summaries() {
  { find "$project/.planning/phases" -name '*-SUMMARY.md' -type f 2>/dev/null || true; } | sort
}

# 이 세션의 실행 경계 문구. 웨이브가 기록됐으면(gsd-executor를 띄운 세션) 그 웨이브의 플랜이 전부
# 끝났을 때만 "웨이브 N 종료", 기록이 없으면(플랜에 wave 정보가 없는 옛 형식) 새 SUMMARY가 생기면 "플랜 종료".
plans_boundary() {
  local rec done_plans
  if [ -s "$wave_file" ]; then
    rec="$(cat "$wave_file")"
    if p8_wave_complete "$(p8_phase_dir "$project" "${rec% *}")" "${rec#* }"; then
      printf '웨이브 %s 종료(Phase %s)' "${rec#* }" "${rec% *}"
    fi
    return 0
  fi
  done_plans="$(new_summaries)"
  [ -n "$done_plans" ] && printf '플랜 종료: %s' "$done_plans"
  return 0
}

current_branch() {
  git -C "$project" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# 세션이 시작된 뒤 브랜치를 바꿨는지 본다(브랜치 기록이 없는 옛 형식 베이스라인도
# 바뀐 것으로 취급). 바뀌었고 이 세션이 아직 아무 경계도 넘지 않았으면(SUMMARY도,
# 계획 완료 플래그도 없음) 베이스라인을 지금 브랜치 기준으로 다시 잡는다 — 그
# 브랜치에 이미 있던, 다른 세션이 끝낸 플랜이 이 세션의 것으로 잡히지 않게.
# 이미 경계를 넘었다면 다시 잡지 않는다(브랜치를 바꿔 카운트를 초기화하지 못하게).
maybe_rebase_baseline_for_branch() {
  [ -f "$baseline" ] || return 0
  local recorded cur
  cur="$(current_branch)"
  recorded=""
  [ -f "$branch_file" ] && recorded="$(cat "$branch_file")"
  if [ "$recorded" = "$cur" ]; then
    return 0
  fi
  if [ ! -f "$flag_plan_phase" ] && [ ! -s "$announced" ]; then
    list_summaries > "$baseline"
  fi
  printf '%s' "$cur" > "$branch_file"
}

# 이 세션에서 시작된 게이트 리뷰의 로그 줄(스킬 이름 · 시각 · session=)을 모두 출력한다.
gate_review_lines() {
  local f
  for f in "$project"/.claude/gates/phase-*.log; do
    [ -e "$f" ] || continue
    grep -E "^(${gate_reviews}) [^ ]+ session=${session}([[:space:]]|\$)" "$f" 2>/dev/null || true
  done
}

# 이 세션에서 시작된 게이트 리뷰 이름을 한 줄에 하나씩 출력한다(없으면 아무것도 안 씀).
gate_reviews_started() {
  gate_review_lines | awk '{print $1}' | sort -u
}

# 게이트 리뷰가 끝났으면(리뷰 시작 이후 docs/designs/*review* 보고서 커밋) 시작된
# 이름을 "/name1 /name2" 형태로 출력한다. 안 끝났으면 아무것도 안 쓴다.
gate_review_done() {
  local start end names
  names="$(gate_reviews_started)"
  [ -n "$names" ] || return 0
  start="$(gate_review_lines | awk '{print $2}' | sort | head -n1)"
  [ -n "$start" ] || return 0
  end="$(TZ=UTC git -C "$project" log -1 --date=format-local:%Y-%m-%dT%H:%MZ --format=%cd -- 'docs/designs/*review*' 2>/dev/null || true)"
  [ -n "$end" ] || return 0
  if [[ "$end" < "$start" ]]; then
    return 0
  fi
  printf '%s\n' "$names" | sed 's#^#/#' | tr '\n' ' ' | sed 's/ *$//'
}

# 베이스라인 뒤 새로 보이는 SUMMARY를 처음 볼 때 origin/main에 이미 있으면 세션 도중 main 병합으로
# 들어온 다른 플랜이라 뺀다. 없으면 이 세션 것으로 기록해, 나중에 PR 머지로 main에 들어가도 계속 센다.
new_summaries() {
  [ -f "$baseline" ] || return 0
  local f
  comm -13 "$baseline" <(list_summaries) | while IFS= read -r f; do
    if grep -Fqx "$f" "$own" 2>/dev/null; then
      printf '%s\n' "$f"
    elif [ -z "$(git -C "$project" ls-tree --name-only origin/main -- "${f#"$project"/}" 2>/dev/null)" ]; then
      printf '%s\n' "$f" >> "$own"
      printf '%s\n' "$f"
    fi
  done | xargs -r -n1 basename | sed 's/-SUMMARY\.md$//' | tr '\n' ' '
}

boundary_text() {
  local what="$1"
  # 계정마다 자기 plant8 환경 id를 PLANT8_ENV_ID로 준다(2026-09-27, 두 계정 운영). 없으면 이 계정의 plant8.
  local env_id="${PLANT8_ENV_ID:-env_01BjvDha7fqn18V6L1UywqDh}"
  cat <<EOF
[세션 경계 — ${what}]
이 세션에서 다음 웨이브(또는 다음 계획·실행 단위)를 시작하지 마라. 순서대로 한다:
1. verification-before-completion 스킬로 방금 끝난 결과를 확인한다.
2. 남은 변경을 커밋하고 푸시한다(훅 우회 금지). 푸시 전에 origin/main을 머지 커밋으로 반영한다.
3. /gsd-pause-work로 인계 문서를 만들고 커밋·푸시한다.
4. 다음 세션을 만든다 — mcp__Claude_Code_Remote__create_session에 아래를 모두 명시한다(하나라도 빠지면 환경이 제대로 뜨지 않는다 — 2026-09-23 시험으로 확인):
   environment_id = ${env_id} (환경 변수 PLANT8_ENV_ID — 계정마다 자기 plant8 환경 id; 「기본값」 환경은 시크릿·허용 목록이 없다, 2026-09-27), source_url = 이 리포 URL, source_revision = 현재 브랜치, outcome_branch = 현재 브랜치(같은 PR을 계속 쓴다), model = 이 세션과 같은 모델.
   prompt에는: "/gsd-progress로 재개하라. 다음은 {다음 웨이브 또는 단계}. 브랜치 {브랜치}, PR #{번호}를 계속 쓴다. 웨이브 하나가 끝나면 같은 방식으로 다음 세션을 만들어 넘긴다."
   create_session 도구가 없는 환경이면 사용자에게 붙여 넣을 첫 메시지를 코드 블록 하나로 준다.
5. 새 세션 id를 사용자에게 알리고 이 세션의 작업을 끝낸다.
EOF
}

case "$event" in
  session-start)
    source="$(printf '%s' "$payload" | jq -r '.source // "startup"')"
    if [ "$source" = "startup" ] || [ ! -f "$baseline" ]; then
      list_summaries > "$baseline"
      current_branch > "$branch_file"
      rm -f "$flag_plan_phase" "$announced" "$stop_reminded" "$own" "$wave_file"
    fi
    exit 0
    ;;

  post-tool)
    [ -z "$agent" ] || exit 0
    maybe_rebase_baseline_for_branch
    tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"
    if [ "$tool" = "Bash" ] && printf '%s' "$payload" | jq -r '.tool_input.command // empty' | grep -Eq 'gsd-tools\.cjs[^;&|]*state\.planned-phase'; then
      touch "$flag_plan_phase"
    fi
    what="$(plans_boundary)"
    [ -f "$flag_plan_phase" ] && what="${what:+$what · }계획(/gsd-plan-phase) 완료 — 13b 뒤 남은 13c~14단계는 끝내고, 15단계 자동 실행 대신 새 세션으로"
    review_done="$(gate_review_done)"
    [ -n "$review_done" ] && what="${what:+$what · }게이트 리뷰 종료(${review_done}) — 남은 정리(보고서·게이트 기록 커밋·푸시)만 끝내고, 다음 게이트 리뷰·계획·실행은 새 세션으로"
    [ -n "$what" ] || exit 0
    key="$(printf '%s' "$what" | md5sum | cut -d' ' -f1)"
    grep -qx "$key" "$announced" 2>/dev/null && exit 0
    echo "$key" >> "$announced"
    jq -nc --arg ctx "$(boundary_text "$what")" \
      '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
    ;;

  pre-tool)
    [ -z "$agent" ] || exit 0
    subagent="$(printf '%s' "$payload" | jq -r '.tool_input.subagent_type // empty')"
    skill="$(printf '%s' "$payload" | jq -r '.tool_input.skill // empty' | normalize)"

    started="$(gate_reviews_started)"
    if [ -n "$started" ]; then
      is_new_unit=0
      case "$subagent" in
        gsd-executor|gsd-planner) is_new_unit=1 ;;
      esac
      case "$skill" in
        gsd-plan-phase|gsd-execute-phase|gsd-quick|gsd-quick-batch|gsd-autonomous) is_new_unit=1 ;;
      esac
      if [ -n "$skill" ] && printf '%s\n' "$skill" | grep -Eq "^(${gate_reviews})\$"; then
        printf '%s\n' "$started" | grep -Fqx "$skill" || is_new_unit=1
      fi
      if [ "$is_new_unit" = "1" ]; then
        started_fmt="$(printf '%s\n' "$started" | sed 's#^#/#' | tr '\n' ' ' | sed 's/ *$//')"
        unit="${skill:-${subagent:-알 수 없음}}"
        echo "차단됨: 이 세션에서 게이트 리뷰(${started_fmt})를 시작했다 — 게이트 리뷰 종료가 세션 경계다. ${unit}은(는) 새 세션에서 시작한다 — 리뷰 보고서 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
        exit 2
      fi
    fi

    [ "$subagent" = "gsd-executor" ] || exit 0
    maybe_rebase_baseline_for_branch
    if [ -f "$flag_plan_phase" ]; then
      echo "차단됨: 이 세션에서 계획이 끝났다(계획 완료). 실행은 새 세션에서 한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
      exit 2
    fi
    # 웨이브가 기록된 세션: 그 웨이브가 전부 끝났으면 다음 웨이브는 새 세션, 아니면 같은 웨이브의 플랜이라 허용
    if [ -s "$wave_file" ]; then
      rec="$(cat "$wave_file")"
      if p8_wave_complete "$(p8_phase_dir "$project" "${rec% *}")" "${rec#* }"; then
        echo "차단됨: 이 세션의 웨이브 ${rec#* }(Phase ${rec% *})가 끝났다 — 세션 하나에 웨이브 하나. 다음 웨이브는 새 세션에서 실행한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
        exit 2
      fi
      exit 0
    fi
    # 첫 디스패치: 플랜에 wave 정보가 있으면 지금 웨이브를 기록한다. 없으면 옛 규칙(이 세션에서 끝난 플랜이 있으면 막는다)
    pad="$(p8_current_phase_pad "$project" "$session")"
    cur="$(p8_lowest_incomplete_wave "$(p8_phase_dir "$project" "$pad")")"
    if [ -n "$cur" ]; then
      printf '%s %s' "$pad" "$cur" > "$wave_file"
      exit 0
    fi
    done_plans="$(new_summaries)"
    if [ -n "$done_plans" ]; then
      echo "차단됨: 이 세션에서 이미 플랜이 끝났다(${done_plans}). 다음 플랜 실행은 새 세션에서 한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
      exit 2
    fi
    exit 0
    ;;

  stop)
    pb="$(plans_boundary)"
    review_done="$(gate_review_done)"
    { [ -n "$pb" ] || [ -f "$flag_plan_phase" ] || [ -n "$review_done" ]; } || exit 0
    [ -f "$stop_reminded" ] && exit 0
    touch "$stop_reminded"
    jq -nc --arg reason "$(boundary_text "${review_done:+게이트 리뷰 종료: $review_done · }${pb:+$pb · }계획/실행 경계 — 인계를 마쳤는지 확인")
이미 1~5를 모두 마쳤다면 그렇다고 한 줄로 말하고 끝내라." \
      '{decision:"block", reason:$reason}'
    ;;
esac
