#!/usr/bin/env bash
# 규칙 준수 훅(PreToolUse) — table.md B·C절 신규 R1~R12.
# 출처: CLAUDE.md, .claude/rules/*, /mnt/project-files/rules-hook/table.md
# 사용자 승인: 2026-09-24 세션 「훅도 넣어」/「훅 걸어」
#
# 판정: 확실한 위반만 차단(exit 2, stderr), 모호하면 경고(hookSpecificOutput.additionalContext, exit 0).
# 원칙: jq 파싱 실패·입력 없음 등 예상 못 한 상황에서는 절대 차단하지 않는다(exit 0).
#
# 결정 사항(spec 열린 질문 D 대체):
#   1) 머지 승인: Codex 기한 전엔 사용자 타이핑 「머지해」만(밤 예외 없음).
#      기한 뒤엔 「머지해」 또는 「잘게」(10시간 안) 또는 현재 KST 00~08시.
#   2) git push --force/-f/+refspec 차단. --force-with-lease는 경고만(차단 아님).
#   3) 커밋 접두어 docs/feat/fix/chore 외(test/style/perf/refactor…)는 경고만.
#      접두어 자체가 없으면 차단하되 Merge/Revert 제목, -m/-F 없는 commit, -F 파일은 항상 통과.
#   4) Codex 해제 시각은 KST로 본다.
set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-.}"
NOW_EPOCH="${PLANT8_NOW:-$(date +%s 2>/dev/null || echo 0)}"
CODEX_UNTIL="${PLANT8_CODEX_BLOCK_UNTIL:-2026-09-29T07:13:00+09:00}"
CODEX_UNTIL_EPOCH="$(date -d "$CODEX_UNTIL" +%s 2>/dev/null || echo 0)"

payload="$(cat 2>/dev/null)"
[ -n "${payload:-}" ] || exit 0

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ -n "${tool:-}" ] || exit 0

WARNS=()
warn() { WARNS+=("$1"); }
block() { echo "차단됨(규칙): $1" >&2; exit 2; }
finish() {
  if [ "${#WARNS[@]}" -gt 0 ]; then
    local joined="" w
    for w in "${WARNS[@]}"; do joined="${joined}- ${w}\n"; done
    jq -nc --arg c "$(printf '[규칙 경고]\n%b' "$joined")" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}' 2>/dev/null
  fi
  exit 0
}

codex_active() {
  [ "${PLANT8_CODEX_ALLOW:-0}" != "1" ] && [ "$NOW_EPOCH" -lt "$CODEX_UNTIL_EPOCH" ] 2>/dev/null
}

# 명령어 "위치" 판정: 인자·문자열 속 단어(grep codex, echo "npm install")는 안 걸린다.
cmdword() {
  local cmd="$1" word="$2"
  [[ "$cmd" =~ (^|[\;\&\|\(\`]|\$\()[[:space:]]*((env|nohup|time|timeout[[:space:]]+[^[:space:]]+|sudo)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*([^[:space:]]*/)?($word)([[:space:]]|$) ]]
}

is_git_push() {
  [[ "$1" =~ (^|[\;\&\|\(\`]|\$\()[[:space:]]*git[[:space:]]+push([[:space:]]|$) ]]
}

is_git_commit() {
  [[ "$1" =~ (^|[\;\&\|\(\`]|\$\()[[:space:]]*git[[:space:]]+commit([[:space:]]|$) ]]
}

CODEX_MSG='Codex는 한도로 2026-09-29 07:13 KST까지 호출 금지(지침 §3). 대신 Opus 독립 검토를 하고 "한도 풀리면 Codex 재확인 필요"를 기록하라. 재시도하지 마라.'

# --- 사용자 글 추출 (R7·R8) -------------------------------------------------
# transcript에서 사람이 직접 친 글만 뽑는다: <wake> 봉투면 from="human" 메시지 +
# 코디네이터 중계 <cited author="user">, 봉투 없고 origin.kind==human이면 전체,
# 그 외엔 <cited author="user">만. 카드 버튼 누름("Pressed the button")은 제외.
extract_between() {  # $1=단일 줄 텍스트, $2=\K를 쓴 PCRE
  printf '%s' "$1" | grep -oP "$2" 2>/dev/null
}

user_fragments() {  # $1=transcript path; "TS<TAB>TEXT" 줄들을 순서대로 찍는다
  local transcript="$1"
  [ -n "${transcript:-}" ] && [ -r "$transcript" ] || return 1
  jq -R 'fromjson? // empty' "$transcript" 2>/dev/null | jq -r '
    select(.type=="user" and (.isSidechain!=true) and (.isMeta!=true))
    | ( if (.message.content|type)=="string" then .message.content
        elif (.message.content|type)=="array" then
          ([.message.content[]? | select(.type!="tool_result") | (.text // "")] | join(""))
        else "" end ) as $body
    | select($body != "")
    | [(.timestamp // ""), (.origin.kind // ""), $body] | @tsv
  ' 2>/dev/null | while IFS=$'\t' read -r ts origin body; do
      if printf '%s' "$body" | grep -q '<wake'; then
        extract_between "$body" '<message(?=[^>]*\bfrom="human")[^>]*>\K.*?(?=</message>)' | while IFS= read -r frag; do
          printf '%s\t%s\n' "$ts" "$frag"
        done
        extract_between "$body" '<cited(?=[^>]*\bauthor="user")[^>]*>\K.*?(?=</cited>)' | while IFS= read -r frag; do
          printf '%s\t%s\n' "$ts" "$frag"
        done
      elif [ "$origin" = "human" ]; then
        printf '%s\t%s\n' "$ts" "$body"
      else
        extract_between "$body" '<cited(?=[^>]*\bauthor="user")[^>]*>\K.*?(?=</cited>)' | while IFS= read -r frag; do
          printf '%s\t%s\n' "$ts" "$frag"
        done
      fi
    done | grep -Pv '^[^\t]*\tPressed the button' 2>/dev/null
}

# --- R8: 훅·settings 승인 ---------------------------------------------------
# 사용자 결정 5: 「훅」+(넣어/고쳐/걸어/수정/추가/만들어) 있으면 승인. 물음표로
# 끝나는 조각(질문)은 승인으로 치지 않는다.
hook_approved_frag() {
  local text="$1" trimmed
  trimmed="${text%"${text##*[![:space:]]}"}"
  case "$trimmed" in
    *\?) return 1 ;;
  esac
  printf '%s' "$text" | grep -Eq '훅[^$]{0,30}(넣어|고쳐|걸어|수정|추가|만들어)' 2>/dev/null
}

hook_approved() {
  local transcript="$1" ts text
  [ -n "${transcript:-}" ] && [ -r "$transcript" ] || return 1
  while IFS=$'\t' read -r ts text; do
    [ -n "$text" ] || continue
    hook_approved_frag "$text" && return 0
  done < <(user_fragments "$transcript")
  return 1
}

# --- R7: 머지 승인 -----------------------------------------------------------
last_merge_ts() {
  local transcript="$1"
  jq -R 'fromjson? // empty' "$transcript" 2>/dev/null | jq -s -r '
    ( [ .[] | select(.type=="assistant") | . as $a
        | ($a.message.content[]? | select(.type=="tool_use" and (.name=="mcp__github__merge_pull_request")))
        | {tuid: .id, ts: $a.timestamp} ] ) as $calls
    | ( [ .[] | select(.type=="user") | (.message.content[]? // empty) | select(.type=="tool_result")
        | {tuid: .tool_use_id, err: (.is_error // false)} ] ) as $results
    | ( [ $calls[] as $c | $results[] | select(.tuid==$c.tuid and (.err|not)) | $c.ts ] | sort | last // "" )
  ' 2>/dev/null
}

merge_approved() {  # $1=transcript, $2=pr number(있을 수 있음)
  local transcript="$1" prn="$2"
  local ts text last_ts="" last_text="" found=0
  local approve_re='머지[[:space:]]?해(줘|주세요|요|라)?([^도야?]|$)'
  while IFS=$'\t' read -r ts text; do
    [ -n "$text" ] || continue
    if printf '%s' "$text" | grep -Eq "$approve_re" 2>/dev/null; then
      last_ts="$ts"; last_text="$text"; found=1
    fi
  done < <(user_fragments "$transcript")
  [ "$found" -eq 1 ] || return 1
  local num
  num="$(printf '%s' "$last_text" | grep -oE '#[0-9]+' | head -1 | tr -d '#')"
  if [ -n "$num" ]; then
    [ -n "$prn" ] && [ "$num" = "$prn" ] && return 0
    return 1
  fi
  # 번호 없는 승인: 그 뒤로 성공한 머지가 없어야 재사용이 아니다
  local lm lm_ep last_ep
  lm="$(last_merge_ts "$transcript")"
  [ -n "$lm" ] || return 0
  [ -n "$last_ts" ] || return 0
  lm_ep="$(date -d "$lm" +%s 2>/dev/null || echo 0)"
  last_ep="$(date -d "$last_ts" +%s 2>/dev/null || echo 0)"
  [ "$last_ep" -gt "$lm_ep" ] && return 0
  return 1
}

zalge_recent() {
  local transcript="$1" ts text ep
  while IFS=$'\t' read -r ts text; do
    [ -n "$text" ] || continue
    if printf '%s' "$text" | grep -Eq '잘게|잘테니|자러' 2>/dev/null; then
      ep="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
      if [ "$ep" -gt 0 ] && [ $((NOW_EPOCH - ep)) -ge 0 ] && [ $((NOW_EPOCH - ep)) -le 36000 ]; then
        return 0
      fi
    fi
  done < <(user_fragments "$transcript")
  return 1
}

kst_night_now() {
  local h
  h="$(TZ=Asia/Seoul date -d "@$NOW_EPOCH" +%H 2>/dev/null)"
  [ -n "$h" ] && [ "$((10#$h))" -lt 8 ]
}

R7_APPROVE_MSG='머지는 사용자가 채팅에 「머지해」를 직접 쳤을 때만 한다(지침 §6). 변경 요약·위험·판정을 올리고 「머지해」를 받아라. 카드 버튼·질문은 승인이 아니다.'
R7_NOTRANSCRIPT_MSG='머지 승인을 확인할 수 없다(트랜스크립트 없음). 사용자에게 「머지해」를 받아라.'
R7_NIGHT_WARN='밤 자동 머지: 승인 없이 진행 전 7개 확인 — CI 초록·충돌 없음·Codex 포함 게이트·/review 막는 지적 없음·마이그레이션 재생성+가드 테스트·운영 배포/데이터 변경 없음·남은 사람 확인 없음, 머지 후 채팅 기록.'

r7_check() {  # $1=pr번호(비어 있을 수 있음)
  local prn="$1" transcript
  transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)"
  if [ -z "${transcript:-}" ] || [ ! -r "$transcript" ]; then
    block "$R7_NOTRANSCRIPT_MSG"
  fi
  merge_approved "$transcript" "$prn" && return 0
  if ! codex_active; then
    if zalge_recent "$transcript" || kst_night_now; then
      warn "$R7_NIGHT_WARN"
      return 0
    fi
  fi
  block "$R7_APPROVE_MSG"
}

# --- R4: 사용자에게 보이는 글 한국어 -----------------------------------------
clean_field() {
  local s="$1"
  # 여러 줄에 걸친 코드 블록도 지우려면 줄을 한 패턴 공간으로 모은다.
  s="$(printf '%s' "$s" | sed -E ':a;N;$!ba;s/```[^`]*```//g')"
  s="$(printf '%s' "$s" | sed -E ':a;N;$!ba;s/`[^`]*`//g')"
  s="$(printf '%s' "$s" | sed -E 's#https?://[^[:space:]]+##g')"
  s="$(printf '%s' "$s" | sed -E 's/[A-Za-z0-9]+([\/._:#@=-][A-Za-z0-9]+)+//g')"
  s="$(printf '%s' "$s" | sed -E 's/#[0-9]+//g')"
  s="$(printf '%s' "$s" | sed -E 's/[0-9a-fA-F]{7,}//g')"
  s="$(printf '%s' "$s" | sed -E 's/\b[A-Z]{2,}[0-9]*\b//g' 2>/dev/null || printf '%s' "$s")"
  printf '%s' "$s"
}
count_hangul_chars() { printf '%s' "$1" | grep -oE '[가-힣ㄱ-ㅎㅏ-ㅣ]' 2>/dev/null | wc -l | tr -d ' '; }
count_word_tokens() { printf '%s' "$1" | grep -oE '[A-Za-z]{2,}' 2>/dev/null | wc -l | tr -d ' '; }
count_hangul_tokens() { printf '%s' "$1" | tr ' ' '\n' | grep -c '[가-힣ㄱ-ㅎㅏ-ㅣ]' 2>/dev/null || true; }

R4_KOREAN_ONLY_MSG='사용자에게 보이는 글(답글·상태·카드)은 한국어로 쓴다(지침·메모 korean-only-user-text). 한국어로 다시 써서 호출하라. 코드·경로·URL은 그대로 둬도 된다.'

r4_check() {  # $1=필드들(줄마다 base64로 인코딩된 값), $2=목록 검사용 원문(reply/update_message의 .text만, 없으면 빈 문자열)
  local fields="$1" list_text="${2:-}"
  [ -n "$fields" ] || return 0
  local totalH=0 totalW=0 totalK=0 any_ge8=0 any_2to8=0
  local f cf h w k
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    f="$(printf '%s' "$f" | base64 -d 2>/dev/null)"
    [ -n "$f" ] || continue
    cf="$(clean_field "$f")"
    h="$(count_hangul_chars "$cf")"
    w="$(count_word_tokens "$cf")"
    k="$(count_hangul_tokens "$cf")"
    totalH=$((totalH + h)); totalW=$((totalW + w)); totalK=$((totalK + k))
    if [ "$h" -eq 0 ] && [ "$w" -ge 8 ]; then any_ge8=1; fi
    if [ "$h" -eq 0 ] && [ "$w" -ge 2 ] && [ "$w" -lt 8 ]; then any_2to8=1; fi
  done <<< "$fields"

  if { [ "$totalH" -eq 0 ] && [ "$totalW" -ge 6 ]; } || [ "$any_ge8" -eq 1 ]; then
    block "$R4_KOREAN_ONLY_MSG"
  fi

  local denom=$((totalW + totalK))
  if { [ "$totalW" -ge 10 ] && [ "$denom" -gt 0 ] && [ $((totalW * 2)) -gt "$denom" ]; } || [ "$any_2to8" -eq 1 ]; then
    warn "사용자에게 보이는 글은 한국어 비중을 높여라(지침·메모 korean-only-user-text)."
  fi

  local raw_all="" partly
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    f="$(printf '%s' "$f" | base64 -d 2>/dev/null)"
    [ -n "$f" ] || continue
    partly="$(printf '%s' "$f" | sed -E ':a;N;$!ba;s/```[^`]*```//g; s/`[^`]*`//g')"
    raw_all="$raw_all $partly"
  done <<< "$fields"
  if printf '%s' "$raw_all" | grep -Eq '\b([01]?[0-9]|2[0-3]):[0-5][0-9] ?(UTC|Z)\b|T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z' 2>/dev/null; then
    warn "사용자에게 보이는 시각은 KST로(지침 §1)."
  fi

  if [ -n "$list_text" ]; then
    local list_lines
    list_lines="$(printf '%s\n' "$list_text" | grep -Ec '^[[:space:]]*(\(?[a-dA-D]\)|[a-dA-D][.:]|[①②③④]|\(?[1-4]\))[[:space:]]' 2>/dev/null || echo 0)"
    if [ "$list_lines" -ge 2 ] && printf '%s' "$list_text" | grep -q '?'; then
      warn "결정은 ask_decision 카드로 한 질문씩(지침 §6)."
    fi
  fi
}

# ---------------------------------------------------------------------------
case "$tool" in

  Agent)
    model="$(printf '%s' "$payload" | jq -r '.tool_input.model // .model // empty' 2>/dev/null)"
    sub="$(printf '%s' "$payload" | jq -r '.tool_input.subagent_type // .subagent_type // empty' 2>/dev/null)"
    prompt="$(printf '%s' "$payload" | jq -r '((.tool_input.prompt // .prompt // "") + " " + (.tool_input.description // .description // ""))' 2>/dev/null)"
    is_gsd=0
    case "$sub" in gsd-*) is_gsd=1 ;; esac
    if [ -z "${model:-}" ] && [ "$is_gsd" -eq 0 ]; then
      block "서브에이전트는 model을 명시한다(CLAUDE.md §8). 판단·검토·계획 opus, 조사·실행·문서 sonnet, 단순 조회 haiku, fable은 최종 전체 검토·되돌리기 어려운 결정에만. model을 넣어 다시 호출하라."
    fi
    lower_model="$(printf '%s' "$model" | tr 'A-Z' 'a-z')"
    if [ "$lower_model" = "fable" ]; then
      if ! printf '%s' "$prompt" | grep -Eqi '최종 전체 검토|최종 검토|전체 검토|final( full)? review|되돌리기 어려운|irreversible|아키텍처|architecture|보안 결정|반복 불일치|판단이 갈|명시 요청|사용자가 요청|user (explicitly )?requested' 2>/dev/null; then
        warn "Fable은 페이즈 최종 전체 검토·되돌리기 어려운 결정·Opus 반복 불일치·명시 요청에만(한도 소모 큼). 해당하지 않으면 opus로."
      fi
    fi
    if [ "$lower_model" = "haiku" ] && printf '%s' "$prompt" | grep -Eqi '검토|리뷰|review|계획|plan|보안|security|판단|결론|감사|audit' 2>/dev/null; then
      warn "판단·검토·보안·디자인 리뷰는 opus(지침 §4)."
    fi
    if [ "$lower_model" = "sonnet" ] && printf '%s' "$prompt" | grep -Eqi '코드 리뷰|보안|security|/cso|plan-(ceo|eng|design)-review|/review|디자인 리뷰|design-review|계획 검토|결론' 2>/dev/null; then
      warn "판단·검토·보안·디자인 리뷰는 opus(지침 §4)."
    fi
    ;;

  Skill)
    if codex_active; then
      skill="$(printf '%s' "$payload" | jq -r '.tool_input.skill // empty' 2>/dev/null | sed -e 's/^\///' -e 's/^[^:]*://' -e 's/[[:space:]].*$//')"
      args="$(printf '%s' "$payload" | jq -r '.tool_input.args // empty' 2>/dev/null)"
      if [ "$skill" = "codex" ]; then
        block "$CODEX_MSG"
      fi
      case "$skill" in
        gsd-review|gsd-plan-review-convergence)
          if printf '%s' "$args" | grep -Eq -- '--codex' 2>/dev/null; then
            block "$CODEX_MSG"
          elif ! printf '%s' "$args" | grep -Eq -- '--all|--claude' 2>/dev/null; then
            warn "기본 리뷰어에 Codex가 있으면 실제 codex 호출은 막힌다. --claude 레인만 쓰거나 Opus 독립 검토로."
          fi
          ;;
      esac
    fi
    ;;

  Bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"

    # R3: Codex
    if codex_active; then
      if cmdword "$cmd" 'codex'; then
        if ! printf '%s' "$cmd" | grep -Eq 'codex[[:space:]]+(--version|-V|--help|-h)([[:space:]]|$)' 2>/dev/null; then
          block "$CODEX_MSG"
        fi
      elif printf '%s' "$cmd" | grep -Eq 'npx[[:space:]]+(-y[[:space:]]+)?@openai/codex' 2>/dev/null; then
        block "$CODEX_MSG"
      fi
    fi

    # R5: 패키지 매니저 · 의존성
    if cmdword "$cmd" 'npm'; then
      if printf '%s' "$cmd" | grep -Eq 'npm[[:space:]]+(install|i|ci|add|uninstall|remove|rm|update|up)([[:space:]]|$)' 2>/dev/null; then
        if printf '%s' "$cmd" | grep -Eq -- '(-g|--global)' 2>/dev/null; then
          warn "npm -g 전역 설치는 pnpm dlx 사용을 검토하라(CLAUDE.md §1)."
        else
          block "이 저장소는 pnpm만 쓴다(CLAUDE.md §1). pnpm install / pnpm add로 바꿔라. 새 의존성이면 이유 한 줄 + 사용자 승인 먼저(§5)."
        fi
      fi
    fi
    if cmdword "$cmd" 'yarn' && ! printf '%s' "$cmd" | grep -Eq 'yarn[[:space:]]+--version' 2>/dev/null; then
      block "이 저장소는 pnpm만 쓴다(CLAUDE.md §1). pnpm install / pnpm add로 바꿔라. 새 의존성이면 이유 한 줄 + 사용자 승인 먼저(§5)."
    fi
    if cmdword "$cmd" 'bun' && printf '%s' "$cmd" | grep -Eq 'bun[[:space:]]+(add|install|i|remove)([[:space:]]|$)' 2>/dev/null; then
      block "이 저장소는 pnpm만 쓴다(CLAUDE.md §1). pnpm install / pnpm add로 바꿔라. 새 의존성이면 이유 한 줄 + 사용자 승인 먼저(§5)."
    fi
    if cmdword "$cmd" 'npx'; then
      warn "npx 대신 pnpm dlx / pnpm exec를 검토하라(CLAUDE.md §1)."
    fi
    if cmdword "$cmd" 'pnpm' && printf '%s' "$cmd" | grep -Eq 'pnpm[[:space:]]+(add|install)[[:space:]]+[^-][^[:space:]]*' 2>/dev/null; then
      warn "새 의존성은 이유 한 줄 + 사용자 승인 후(CLAUDE.md §5)."
    fi

    # R6: git push
    if is_git_push "$cmd"; then
      if printf '%s' "$cmd" | grep -Eq -- '--force-with-lease|--force-if-includes' 2>/dev/null; then
        warn "git push --force-with-lease/--force-if-includes는 경고만: 정말 필요한지 확인하라(CLAUDE.md §2)."
      elif printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])(--force|-[a-zA-Z]*f[a-zA-Z]*)([[:space:]]|$)' 2>/dev/null \
        || printf '%s' "$cmd" | grep -Eq '[[:space:]]\+[^[:space:]]*:' 2>/dev/null; then
        block "git push --force 금지(CLAUDE.md §2). 되돌려야 하면 새 커밋으로 하고, 정말 필요하면 사용자에게 이유를 말하고 승인받아라."
      fi
      if printf '%s' "$cmd" | grep -Eq '(origin|upstream)?[[:space:]]+(main|master)([[:space:]]|$)|:[[:space:]]*(refs/heads/)?(main|master)([[:space:]]|$)' 2>/dev/null; then
        block "main에 직접 푸시하지 않는다(지침 §9 자기 브랜치에만). PR로 올리고 「머지해」를 받아라."
      fi
    fi

    # R7: gh pr merge / gh api .../pulls/N/merge
    if printf '%s' "$cmd" | grep -Eq '(^|[\;\&\|])[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)' 2>/dev/null; then
      prn="$(printf '%s' "$cmd" | grep -oE 'pr[[:space:]]+merge[[:space:]]+[0-9]+' | grep -oE '[0-9]+$')"
      r7_check "$prn"
    elif printf '%s' "$cmd" | grep -Eq 'gh[[:space:]]+api.*pulls/[0-9]+/merge' 2>/dev/null; then
      prn="$(printf '%s' "$cmd" | grep -oE 'pulls/[0-9]+/merge' | grep -oE '[0-9]+')"
      r7_check "$prn"
    fi

    # R8: 훅·settings 우회 수정, CLAUDE.md 우회 수정
    if printf '%s' "$cmd" | grep -Eq '\.claude/(hooks/|settings)' 2>/dev/null; then
      is_write=0
      if printf '%s' "$cmd" | grep -Eq '(>{1,2}|tee([[:space:]]+-a)?)[[:space:]]*["'"'"']?[^ ;|&]*\.claude/(hooks/|settings)' 2>/dev/null; then is_write=1; fi
      if printf '%s' "$cmd" | grep -Eq '(sed|perl)[[:space:]]+-[a-z]*i[^;|&]*\.claude/(hooks/|settings)' 2>/dev/null; then is_write=1; fi
      if [ "$is_write" -eq 1 ]; then
        transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)"
        hook_approved "$transcript" || block "훅 스크립트·settings.json 수정은 사용자가 채팅에 직접 친 승인이 필요하다(지침 §3, 카드 선택 불인정). 무엇을 왜 바꾸는지 말하고 「훅 고쳐」 같은 승인을 받아라."
      elif printf '%s' "$cmd" | grep -Eq '(^|[\;\&\|]|[[:space:]])(cp|mv|rm|chmod)([[:space:]]|$)|git[[:space:]]+(checkout|restore|apply)' 2>/dev/null; then
        warn "훅·settings 파일을 cp/mv/rm/chmod/git checkout으로 건드렸다 — 원본 복사가 아니라면 승인 필요(지침 §3)."
      fi
    fi
    if printf '%s' "$cmd" | grep -Eq '(>{1,2}|tee([[:space:]]+-a)?)[[:space:]]*["'"'"']?[^ ;|&]*CLAUDE\.md' 2>/dev/null \
      || printf '%s' "$cmd" | grep -Eq '(sed|perl)[[:space:]]+-[a-z]*i[^;|&]*CLAUDE\.md' 2>/dev/null \
      || printf '%s' "$cmd" | grep -Eq '(cp|mv)[^;|&]*[[:space:]][^ ]*CLAUDE\.md[[:space:]]*($|[;&|])' 2>/dev/null; then
      block "CLAUDE.md는 사용자가 직접 관리한다. Bash로 우회하지 말고 바꿀 문장과 위치를 사용자에게 주고 직접 붙여 넣게 하라."
    fi

    # R10: 프로덕션 DB · 출력 저장
    if printf '%s' "$cmd" | grep -Eq 'gcloud[[:space:]]+sql[[:space:]]+(connect|import|export|databases|users|instances[[:space:]]+(patch|delete|restart))' 2>/dev/null \
      || printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(psql|pg_dump|pg_restore)([[:space:]]|$)' 2>/dev/null \
      || printf '%s' "$cmd" | grep -Eq 'drizzle-kit[[:space:]]+(push|migrate)' 2>/dev/null \
      || printf '%s' "$cmd" | grep -Eq 'pnpm[[:space:]]+db:(migrate|push)' 2>/dev/null; then
      is_prod=0
      printf '%s' "$cmd" | grep -Eq 'plant8-509002|/cloudsql/|prod' 2>/dev/null && is_prod=1
      dburl="$(printf '%s' "$cmd" | grep -oE 'DATABASE_URL=[^ ]+' 2>/dev/null)"
      if [ -n "$dburl" ]; then
        host="$(printf '%s' "$dburl" | sed -E 's#.*://[^@]*@##; s#[/:].*##')"
        case "$host" in localhost|127.0.0.1|"") ;; *) is_prod=1 ;; esac
      fi
      [ "$is_prod" -eq 1 ] && warn "프로덕션 DB 직접 명령 금지(CLAUDE.md §2). 운영이면 멈추고 사용자에게 말하라."
    fi
    if printf '%s' "$cmd" | grep -Eq 'pnpm[[:space:]]+(-s[[:space:]]+)?(test(:[a-z:]+)?|lint(:sql)?|typecheck|build)([[:space:]]|$)' 2>/dev/null; then
      if ! printf '%s' "$cmd" | grep -Eq '>|\||tee' 2>/dev/null; then
        warn "출력은 파일로 저장하고 요약·실패만 읽어라(지침 §5)."
      fi
    fi

    # R11: PR draft (Bash gh pr create)
    if printf '%s' "$cmd" | grep -Eq '(^|[\;\&\|])[[:space:]]*gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' 2>/dev/null; then
      if ! printf '%s' "$cmd" | grep -Eq -- '--draft|(^|[[:space:]])-d([[:space:]]|$)' 2>/dev/null; then
        block "PR은 draft로 연다(지침 §9). draft: true / --draft를 붙여 다시 호출하라."
      fi
    fi

    # R12: 커밋 제목
    if is_git_commit "$cmd"; then
      if printf '%s' "$cmd" | grep -Eq -- '--no-edit' 2>/dev/null \
        || ! printf '%s' "$cmd" | grep -Eq -- '(-m[[:space:]]|-F[[:space:]])' 2>/dev/null; then
        :
      elif printf '%s' "$cmd" | grep -Eq -- '-F[[:space:]]' 2>/dev/null; then
        :
      else
        title=""
        if printf '%s' "$cmd" | grep -q -- "<<'\\?EOF'\\?"; then
          title="$(printf '%s' "$cmd" | awk '/<<.?EOF.?$/{f=1;next} f{ if (NF==0) next; print; exit }')"
        else
          title="$(printf '%s' "$cmd" | grep -oP -- '-m[[:space:]]+"\K[^"]*' 2>/dev/null | head -1)"
          [ -n "$title" ] || title="$(printf '%s' "$cmd" | grep -oP -- "-m[[:space:]]+'\K[^']*" 2>/dev/null | head -1)"
        fi
        if [ -n "$title" ]; then
          case "$title" in
            Merge\ *|Revert\ *) ;;
            *)
              if ! printf '%s' "$title" | grep -Eq '^[A-Za-z]+(\([^)]*\))?!?: .+' 2>/dev/null; then
                block "커밋 제목은 영어 접두어 + 짧은 요약(docs:/feat:/fix:/chore:), 본문은 한국어(CLAUDE.md §5)."
              else
                prefix="$(printf '%s' "$title" | grep -oE '^[A-Za-z]+' 2>/dev/null)"
                case "$prefix" in
                  docs|feat|fix|chore) ;;
                  *) warn "커밋 접두어는 docs/feat/fix/chore 권장(CLAUDE.md §5). 나머지는 확인만." ;;
                esac
              fi
              ;;
          esac
        fi
      fi
    fi
    ;;

  Write|Edit|NotebookEdit)
    fp="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
    if printf '%s' "$fp" | grep -Eq '(^|/)\.claude/(hooks/|settings(\.local)?\.json$)' 2>/dev/null; then
      transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)"
      hook_approved "$transcript" || block "훅 스크립트·settings.json 수정은 사용자가 채팅에 직접 친 승인이 필요하다(지침 §3, 카드 선택 불인정). 무엇을 왜 바꾸는지 말하고 「훅 고쳐」 같은 승인을 받아라."
    fi
    if printf '%s' "$fp" | grep -Eq '(^|/)\.planning/' 2>/dev/null; then
      session="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
      state_dir="${TMPDIR:-/tmp}/plant8-skill-gate"
      skills_file="$state_dir/${session}.skills"
      if [ -f "$skills_file" ] && grep -Eq '^gsd-' "$skills_file" 2>/dev/null; then
        :
      else
        warn ".planning/은 GSD 스킬·gsd-tools로만 바꾼다(CLAUDE.md §2). 해당 /gsd-* 스킬을 먼저 호출하라."
      fi
    fi
    ;;

  mcp__hearthbot__reply|mcp__hearthbot__update_message)
    fields="$(printf '%s' "$payload" | jq -r '
      [ (.tool_input.text // empty),
        (.tool_input.card.blocks[]? | (.text // empty), (.label // empty)),
        (.tool_input.card.blocks[]?.fields[]? | (.value // empty)),
        (.tool_input.card.blocks[]?.columns[]? | (.value // empty)),
        (.tool_input.card.blocks[]?.accessory? | (.text // empty), (.done_label // empty)),
        (.tool_input.card.blocks[]?.elements[]? | (.label // empty), (.done_label // empty)),
        (.tool_input.card.blocks[]?.table?.headers[]? // empty),
        (.tool_input.card.blocks[]?.table?.rows[]?[]? // empty)
      ] | .[] | select(.!="") | @base64
    ' 2>/dev/null)"
    list_text="$(printf '%s' "$payload" | jq -r '.tool_input.text // empty' 2>/dev/null)"
    r4_check "$fields" "$list_text"
    ;;

  mcp__hearthbot__update_status)
    fields="$(printf '%s' "$payload" | jq -r '[(.tool_input.text // empty)] | .[] | select(.!="") | @base64' 2>/dev/null)"
    r4_check "$fields" ""
    ;;

  mcp__hearthbot__post_message|mcp__hearthbot__message_thread)
    fields="$(printf '%s' "$payload" | jq -r '[(.tool_input.text//empty),(.tool_input.message//empty),(.tool_input.body//empty),(.tool_input.title//empty)] | .[] | select(.!="") | @base64' 2>/dev/null)"
    r4_check "$fields" ""
    ;;

  mcp__hearthbot__ask_decision)
    fields="$(printf '%s' "$payload" | jq -r '[(.tool_input.question//empty),(.tool_input.context//empty),(.tool_input.reason//empty),(.tool_input.options[]?.label//empty),(.tool_input.options[]?.consequence//empty)] | .[] | select(.!="") | @base64' 2>/dev/null)"
    r4_check "$fields" ""
    ;;

  mcp__hearthbot__post_widget)
    fields="$(printf '%s' "$payload" | jq -r '[(.tool_input.text//empty)] | .[] | select(.!="") | @base64' 2>/dev/null)"
    r4_check "$fields" ""
    ;;

  mcp__hearthbot__set_thread_label)
    fields="$(printf '%s' "$payload" | jq -r '[(.tool_input.label//empty)] | .[] | select(.!="") | @base64' 2>/dev/null)"
    r4_check "$fields" ""
    ;;

  mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge)
    prn="$(printf '%s' "$payload" | jq -r '.tool_input.pullNumber // empty' 2>/dev/null)"
    r7_check "$prn"
    ;;

  mcp__github__create_pull_request)
    draft="$(printf '%s' "$payload" | jq -r '.tool_input.draft // empty' 2>/dev/null)"
    if [ "$draft" != "true" ]; then
      block "PR은 draft로 연다(지침 §9). draft: true / --draft를 붙여 다시 호출하라."
    fi
    ;;

esac

finish
