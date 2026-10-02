#!/usr/bin/env bash
# 세션 경계 훅 — 독립 검토가 필요한 지점에서만 새 세션으로 넘긴다.
# 사용자 요청(2026-09-23): "플랜이 종료되면 새 세션으로 넘어가게 해" → 2026-09-27 개정: 단위를
# 플랜에서 웨이브로 넓힘 → 2026-10-01 개정(사용자 결정): 웨이브·플랜 종료는 더 이상 경계가 아니다
# ("세션 하나 = 웨이브 하나"가 같은 웨이브의 지적 반영까지 끊었다 — #88 웨이브 6). 세션 종료는
# 독립 검토 경계에서만 끊고, 문맥은 자동 압축(autoCompactWindow)으로 이어 간다(PR #124).
# 사용자 결정(2026-09-23, D-01): 게이트 리뷰(/plan-ceo-review, /plan-eng-review,
# /plan-design-review)의 종료는 여전히 세션 경계다 — 계획·실행과 다른 눈으로 본다.
#
# 경계로 보는 것(메인 에이전트 기준):
#   - `state.planned-phase` 실행(/gsd-plan-phase 13b — 계획 완료) — 다음은 독립 게이트 리뷰
#   - 이 세션에서 게이트 리뷰를 시작했고 그 보고서(docs/designs/*review*)가 커밋됨(D-01)
#
# 동작(첫 인자 = 이벤트):
#   session-start : 새 세션이면 이 세션의 경계 기록을 지운다
#   post-tool     : 경계를 처음 감지하면 인계 순서를 컨텍스트에 넣는다
#   pre-tool      : 게이트 리뷰 시작 중·후에 다른 단위를 새로 시작하려 하면 막는다(exit 2).
#                   계획 완료 뒤 게이트 리뷰·계획·실행 단위를 시작하려 해도 막는다(exit 2)
#   stop          : 경계가 났는데 인계를 안 했으면 한 번 멈춤을 막고 인계를 시킨다
set -euo pipefail

event="${1:-}"
payload="$(cat)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // empty')"
project="${CLAUDE_PROJECT_DIR:-.}"

state_dir="${TMPDIR:-/tmp}/plant8-session-boundary"
mkdir -p "$state_dir"
flag_plan_phase="$state_dir/${session}.plan-phase-done"
announced="$state_dir/${session}.announced"
stop_reminded="$state_dir/${session}.stop-reminded"

gate_reviews="plan-ceo-review|plan-eng-review|plan-design-review"

normalize() { sed -e 's/^\///' -e 's/^[^:]*://' -e 's/[[:space:]].*$//'; }

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

boundary_text() {
  local what="$1"
  # 계정마다 자기 plant8 환경 id를 PLANT8_ENV_ID로 준다(2026-09-27, 두 계정 운영). 없으면 이 계정의 plant8.
  local env_id="${PLANT8_ENV_ID:-env_01BjvDha7fqn18V6L1UywqDh}"
  cat <<EOF
[세션 경계 — ${what}]
이 세션에서 다음 게이트 리뷰·계획·실행 단위를 시작하지 마라(독립 검토 경계). 순서대로 한다:
1. verification-before-completion 스킬로 방금 끝난 결과를 확인한다.
2. 남은 변경을 커밋하고 푸시한다(훅 우회 금지). 푸시 전에 origin/main을 머지 커밋으로 반영한다.
3. /gsd-pause-work로 인계 문서를 만들고 커밋·푸시한다.
4. 다음 세션을 만든다 — mcp__Claude_Code_Remote__create_session에 아래를 모두 명시한다(하나라도 빠지면 환경이 제대로 뜨지 않는다 — 2026-09-23 시험으로 확인):
   environment_id = ${env_id} (환경 변수 PLANT8_ENV_ID — 계정마다 자기 plant8 환경 id; 「기본값」 환경은 시크릿·허용 목록이 없다, 2026-09-27), source_url = 이 리포 URL, source_revision = 현재 브랜치, outcome_branch = 현재 브랜치(같은 PR을 계속 쓴다), model = 이 세션과 같은 모델.
   prompt에는: "/gsd-progress로 재개하라. 다음은 {다음 단계}. 브랜치 {브랜치}, PR #{번호}를 계속 쓴다. 세션은 독립 검토 경계(계획 완료·게이트 리뷰 종료)에서만 같은 방식으로 넘기고, 문맥은 자동 압축으로 이어 간다."
   create_session 도구가 없는 환경이면 사용자에게 붙여 넣을 첫 메시지를 코드 블록 하나로 준다.
5. 새 세션 id를 사용자에게 알리고 이 세션의 작업을 끝낸다.
EOF
}

case "$event" in
  session-start)
    source="$(printf '%s' "$payload" | jq -r '.source // "startup"')"
    if [ "$source" = "startup" ]; then
      rm -f "$flag_plan_phase" "$announced" "$stop_reminded"
    fi
    exit 0
    ;;

  post-tool)
    [ -z "$agent" ] || exit 0
    tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"
    if [ "$tool" = "Bash" ] && printf '%s' "$payload" | jq -r '.tool_input.command // empty' | grep -Eq 'gsd-tools\.cjs[^;&|]*state\.planned-phase'; then
      touch "$flag_plan_phase"
    fi
    what=""
    [ -f "$flag_plan_phase" ] && what="계획(/gsd-plan-phase) 완료 — 13b 뒤 남은 13c~14단계는 끝내고, 15단계 자동 실행 대신 새 세션으로"
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

    # 계획 완료 뒤에는 실행·다른 계획·게이트 리뷰를 이 세션에서 시작하지 않는다 — 게이트 리뷰는 계획과 다른 눈으로(Codex 지적, PR #122)
    [ -f "$flag_plan_phase" ] || exit 0
    is_new_unit=0
    case "$subagent" in
      gsd-executor|gsd-planner) is_new_unit=1 ;;
    esac
    case "$skill" in
      gsd-plan-phase|gsd-execute-phase|gsd-quick|gsd-quick-batch|gsd-autonomous) is_new_unit=1 ;;
    esac
    if [ -n "$skill" ] && printf '%s\n' "$skill" | grep -Eq "^(${gate_reviews})\$"; then is_new_unit=1; fi
    [ "$is_new_unit" = 1 ] || exit 0
    echo "차단됨: 이 세션에서 계획이 끝났다(계획 완료). 게이트 리뷰·실행은 계획과 다른 눈으로 보도록 새 세션에서 한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress)." >&2
    exit 2
    ;;

  stop)
    review_done="$(gate_review_done)"
    { [ -f "$flag_plan_phase" ] || [ -n "$review_done" ]; } || exit 0
    [ -f "$stop_reminded" ] && exit 0
    touch "$stop_reminded"
    jq -nc --arg reason "$(boundary_text "${review_done:+게이트 리뷰 종료: $review_done · }계획/검토 경계 — 인계를 마쳤는지 확인")
이미 1~5를 모두 마쳤다면 그렇다고 한 줄로 말하고 끝내라." \
      '{decision:"block", reason:$reason}'
    ;;
esac
