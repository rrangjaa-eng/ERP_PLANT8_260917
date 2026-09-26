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
# 로케일 고정: 셸·grep·sed는 바이트 단위(C)로 돌리고, 한글 판정은 모두 jq(항상 UTF-8)로 한다.
# 사용자 로케일(C.UTF-8 등)에 따라 결과가 바뀌지 않게 한다.
export LC_ALL=C

PROJECT="${CLAUDE_PROJECT_DIR:-.}"
NOW_EPOCH="${PLANT8_NOW:-$(date +%s 2>/dev/null || echo 0)}"
[[ "$NOW_EPOCH" =~ ^[0-9]+$ ]] || NOW_EPOCH=0
CODEX_UNTIL="${PLANT8_CODEX_BLOCK_UNTIL:-2026-09-29T07:13:00+09:00}"

payload="$(cat 2>/dev/null)"
[ -n "${payload:-}" ] || exit 0

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ -n "${tool:-}" ] || exit 0

emit_warning() {  # $1=경고 본문(여러 줄)
  jq -nc --arg c "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}' 2>/dev/null
}

# GNU date·sed가 없으면(macOS·BSD 기기) 판정이 틀어지므로 막지 않고 경고만 한다.
if ! date -d @0 +%s >/dev/null 2>&1 || ! sed --version >/dev/null 2>&1; then
  emit_warning "[규칙 경고]
- GNU date/sed가 없어 규칙 훅(plant8-rule-guard) 검사를 건너뛰었다. 지침(CLAUDE.md)을 직접 지켜라."
  exit 0
fi
CODEX_UNTIL_EPOCH="$(date -d "$CODEX_UNTIL" +%s 2>/dev/null || echo 0)"

WARNS=()
warn() { WARNS+=("$1"); }
# DOWNGRADE=1이면(명령 해석이 불확실할 때) 차단 대신 경고로 낮춘다.
DOWNGRADE=0
block() {
  if [ "$DOWNGRADE" = "1" ]; then
    warn "(명령 해석이 불확실해 경고만) $1"
    return 0
  fi
  echo "차단됨(규칙): $1" >&2
  exit 2
}
finish() {
  if [ "${#WARNS[@]}" -gt 0 ]; then
    local joined="" w
    for w in "${WARNS[@]}"; do joined="${joined}- ${w}\n"; done
    emit_warning "$(printf '[규칙 경고]\n%b' "$joined")"
  fi
  exit 0
}

codex_active() {
  [ "${PLANT8_CODEX_ALLOW:-0}" != "1" ] && [ "$NOW_EPOCH" -lt "$CODEX_UNTIL_EPOCH" ] 2>/dev/null
}

CODEX_MSG='Codex는 한도로 2026-09-29 07:13 KST까지 호출 금지(지침 §3). 대신 Opus 독립 검토를 하고 "한도 풀리면 Codex 재확인 필요"를 기록하라. 재시도하지 마라.'

# --- 사용자 승인 판정 (R7·R8) ------------------------------------------------
# 사람 글로 인정하는 것은 두 가지뿐이다.
#   (a) origin.kind=="human"인 user 항목의 <wake> 봉투 속 <message from="human"> (외부 이벤트 wake 제외)
#       — 봉투가 없으면 그 항목 전체(사람이 직접 친 글)
#   (b) 코디네이터 중계(<relay from="coordinator">/<coordinator-relay>, isMeta·projects-relay 포함)의
#       줄 머리 <cited author="user">
# 서브에이전트 보고(<agent-message>, origin peer), task-notification·Monitor 출력, tool_result,
# assistant 항목, 사이드체인은 절대 인정하지 않는다. 카드 버튼 누름도 제외.
# 문장 단위로 보고, 질문(?, 될까, 돼?)·부정(하지 마, 안 돼, 말고, 금지, 나중에)은 승인이 아니다.
# 속도: grep으로 후보 줄만 거른 뒤 jq 한 번으로 판정한다(40MB 트랜스크립트도 10초 안).
APPROVAL_JQ='
def epoch: (. // "") | tostring | sub("\\.[0-9]+"; "") | (try fromdateiso8601 catch 0);
def trim: sub("^\\s+"; "") | sub("\\s+$"; "");
def body: .message.content as $c
  | if ($c|type) == "string" then $c
    elif ($c|type) == "array" then ([$c[]? | select(type == "object" and .type == "text") | (.text // "") | strings] | join("\n"))
    else "" end;
def frags:
  select(type == "object" and .type == "user" and .isSidechain != true)
  | (.origin.kind // "") as $k | (.origin.subkind // "") as $sk
  | body as $b | (.timestamp | epoch) as $ts
  | ($b | sub("^\\s+"; "")) as $lb
  | ( if $k == "human" and ($b | test("<wake")) then
        if ($b | test("<event[\\s>]|reason=\"external-event\"")) then empty
        else $b | match("<message\\b(?=[^>]*\\bfrom=\"human\")[^>]*>([\\s\\S]*?)</message>"; "g") | .captures[0].string end
      elif ($sk == "projects-relay" or ($k != "peer" and $k != "task-notification"))
           and ($lb | test("^(<relay from=\"coordinator\"|<coordinator-relay|A message from this project)"))
           and ($b | test("<agent-message|<task-notification") | not) then
        $b | match("(?:^|\\n)[ \\t]*<cited\\b([^>]*)>([\\s\\S]*?)</cited>"; "g")
           | select(.captures[0].string | test("\\bauthor=\"user\"")) | .captures[1].string
      elif $k == "human" then $b
      else empty end )
  | trim | select(. != "" and (startswith("Pressed the button") | not))
  | {ts: $ts, text: .};
def sentences: gsub("(?<p>[.!?。？\\n])"; "\(.p)\u0001") | split("\u0001") | map(trim) | map(select(. != ""));
def isq: test("[?？]$") or test("될까|되나|돼\\s*[?？]|할까|(어|아|여|쳐|해|꿔|워)도\\s*(돼|되|괜찮)");
def isneg: test("지\\s*마|말고|말아|안\\s*(돼|되|된|할|해)|않|금지|나중에|보류|멈춰|취소");
def merge_sent: test("머지\\s*해(줘|주세요|요|라|버려)?(?![도야선서])") and (isq | not) and (isneg | not);
def hook_sent: test("훅|설정|편집") and test("넣어|고쳐|걸어|수정|추가|만들어|허용|바꿔|반영|진행") and (isq | not) and (isneg | not);
def nums: [match("#\\s*([0-9]+)|([0-9]+)\\s*번|(?i:pr)\\s*([0-9]+)"; "g") | [.captures[].string | select(. != null)][0]];
def merge_calls: select(type == "object" and .type == "assistant") | (.timestamp | epoch) as $ts
  | .message.content[]? | select(type == "object" and .type == "tool_use")
  | select(.name == "mcp__github__merge_pull_request" or .name == "mcp__github__enable_pr_auto_merge"
      or (.name == "Bash" and ((.input.command // "") | tostring
          | test("\\bgh\\b[^\\n;&|]*\\bpr\\s+merge\\b") or (test("pulls/[0-9]+/merge") and test("(-X|--method)[\\s=]*PUT"; "i")))))
  | {id: .id, ts: $ts};
def ok_results: select(type == "object" and .type == "user") | .message.content[]?
  | select(type == "object" and .type == "tool_result" and (.is_error != true)) | .tool_use_id;
[inputs | fromjson? ] as $e
| [ $e[] | frags ] as $f
| if $mode == "hook" then
    (if any($f[]; .text | sentences | any(.[]; hook_sent)) then "1" else "0" end)
  else
    [ $e[] | ok_results ] as $ok
    | ([ $e[] | merge_calls | select(.id as $i | any($ok[]; . == $i)) | .ts ] | max // 0) as $lm
    | [ $f[] | select(.text | sentences | any(.[]; merge_sent)) ] as $apps
    | any($apps[]; (.text | nums) as $n
        | if ($n | length) > 0 then ($prn != "" and any($n[]; . == $prn)) else ($lm == 0 or .ts > $lm) end) as $A
    | any($f[]; .ts > 0 and (.text | test("잘게|잘테니|자러")) and ($now - .ts) >= 0 and ($now - .ts) <= 36000) as $Z
    | "\(if $A then 1 else 0 end) \(if $Z then 1 else 0 end)"
  end
'

approval_query() {  # $1=transcript $2=hook|merge $3=pr번호 → hook: "1|0", merge: "승인 잘게"(각 1|0)
  local t="$1" mode="$2" prn="${3:-}" cand mc="" res="" ids
  [ -n "${t:-}" ] && [ -r "$t" ] || { echo ""; return; }
  cand="$(grep -E '"kind": ?"human"|relay' "$t" 2>/dev/null)"
  if [ "$mode" = "merge" ]; then
    mc="$(grep -E 'merge' "$t" 2>/dev/null | grep -F '"tool_use"')"
    ids="$(printf '%s\n' "$mc" | jq -Rr 'fromjson? | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .id // empty' 2>/dev/null)"
    if [ -n "$ids" ]; then
      res="$(grep -F -f <(printf '%s\n' "$ids" | sed 's/.*/"&"/') "$t" 2>/dev/null | grep -F '"tool_result"')"
    fi
  fi
  printf '%s\n%s\n%s\n' "$cand" "$mc" "$res" \
    | jq -Rnr --arg mode "$mode" --arg prn "$prn" --argjson now "$NOW_EPOCH" "$APPROVAL_JQ" 2>/dev/null
}

hook_approved() {  # $1=transcript
  [ "$(approval_query "$1" hook)" = "1" ]
}

kst_night_now() {  # tzdata 없이 epoch 계산(KST=UTC+9)
  [ $(( (NOW_EPOCH + 32400) / 3600 % 24 )) -lt 8 ]
}

R7_APPROVE_MSG='머지는 사용자가 채팅에 「머지해」를 직접 쳤을 때만 한다(지침 §6). 변경 요약·위험·판정을 올리고 「머지해」를 받아라. 카드 버튼·질문은 승인이 아니다.'
R7_NOTRANSCRIPT_MSG='머지 승인을 확인할 수 없다(트랜스크립트 없음). 사용자에게 「머지해」를 받아라.'
R7_NIGHT_WARN='밤 자동 머지: 승인 없이 진행 전 7개 확인 — CI 초록·충돌 없음·Codex 포함 게이트·/review 막는 지적 없음·마이그레이션 재생성+가드 테스트·운영 배포/데이터 변경 없음·남은 사람 확인 없음, 머지 후 채팅 기록.'

r7_check() {  # $1=pr번호(비어 있을 수 있음)
  local prn="$1" transcript r
  transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)"
  if [ -z "${transcript:-}" ] || [ ! -r "$transcript" ]; then
    block "$R7_NOTRANSCRIPT_MSG"
    return 0
  fi
  r="$(approval_query "$transcript" merge "$prn")"
  [ "${r%% *}" = "1" ] && return 0
  if ! codex_active; then
    if [ "${r#* }" = "1" ] || kst_night_now; then
      warn "$R7_NIGHT_WARN"
      return 0
    fi
  fi
  block "$R7_APPROVE_MSG"
}

# --- Bash 명령 해석 -----------------------------------------------------------
# 따옴표·heredoc 본문·주석을 아는 토크나이저. 한 줄 = 단순 명령 하나(;, &&, ||, |, &, 괄호,
# 백틱, $( 로 나눔), 단어는 \037로 구분, 단어 속 줄바꿈은 \036, 리다이렉션 연산자는 \002 접두.
# 큰따옴표 속 $(...) 내용은 \003 줄로 따로 내보낸다(경고용 재검사). 따옴표가 안 닫히면 \004 줄.
TOKENIZER='
BEGIN { RS = "\001"; SEP = "\037"; NLC = "\036"; OPC = "\002" }
function addc(ch) { word = word ch; inword = 1 }
function flush_word() { if (inword) { seg = seg (nw ? SEP : "") word; nw++ } word = ""; inword = 0 }
function flush_seg() { flush_word(); if (nw > 0) { gsub(/\n/, NLC, seg); print seg } seg = ""; nw = 0 }
function emit_op(o) { flush_word(); seg = seg (nw ? SEP : "") OPC o; nw++ }
function read_delim(   d, c, qq) {
  while (i <= n && (substr(s, i, 1) == " " || substr(s, i, 1) == "\t")) i++
  d = ""; qq = ""
  while (i <= n) {
    c = substr(s, i, 1)
    if (qq != "") { if (c == qq) qq = ""; else d = d c; i++; continue }
    if (c == "\047" || c == "\"") { qq = c; i++; continue }
    if (c == "\\") { i++; continue }
    if (c ~ /[ \t\n;&|()<>]/) break
    d = d c; i++
  }
  return d
}
function add_heredoc(   dash, d) {
  dash = 0; if (substr(s, i, 1) == "-") { dash = 1; i++ }
  d = read_delim(); if (d != "") { nhd++; hd[nhd] = d; hdash[nhd] = dash }
}
function skip_heredocs(   k, line, e, t) {
  for (k = 1; k <= nhd; k++) {
    while (i <= n) {
      e = index(substr(s, i), "\n")
      if (e == 0) { line = substr(s, i); i = n + 1 } else { line = substr(s, i, e - 1); i += e }
      t = line; if (hdash[k]) sub(/^\t+/, "", t)
      if (t == hd[k]) break
    }
  }
  nhd = 0
}
function scan_cmdsub(   depth, c, q2, start) {
  depth = 1; q2 = ""; start = i
  while (i <= n) {
    c = substr(s, i, 1)
    if (q2 == "\047") { if (c == "\047") q2 = ""; i++; continue }
    if (q2 == "\"") { if (c == "\\") { i += 2; continue } if (c == "\"") q2 = ""; i++; continue }
    if (c == "\\") { i += 2; continue }
    if (c == "\047" || c == "\"") { q2 = c; i++; continue }
    if (c == "<" && substr(s, i + 1, 1) == "<" && substr(s, i + 2, 1) != "<") { i += 2; add_heredoc(); continue }
    if (c == "\n") { i++; if (nhd > 0) skip_heredocs(); continue }
    if (c == "(") depth++
    else if (c == ")") { depth--; if (depth == 0) { i++; return substr(s, start, i - 1 - start) } }
    i++
  }
  uncertain = 1
  return substr(s, start)
}
{
  s = $0; n = length(s); i = 1; q = ""; word = ""; inword = 0; seg = ""; nw = 0; nhd = 0; nsubs = 0; uncertain = 0
  while (i <= n) {
    c = substr(s, i, 1)
    if (q == "\047") { if (c == "\047") q = ""; else word = word c; i++; continue }
    if (q == "\"") {
      if (c == "\\") {
        d = substr(s, i + 1, 1)
        if (d == "\n") { i += 2; continue }
        if (d == "\\" || d == "\"" || d == "$" || d == "`") { word = word d; i += 2; continue }
        word = word c; i++; continue
      }
      if (c == "$" && substr(s, i + 1, 1) == "(") {
        i += 2; t = scan_cmdsub(); word = word "$(" t ")"
        gsub(/\n/, NLC, t); subs[++nsubs] = t; continue
      }
      if (c == "\"") q = ""; else word = word c
      i++; continue
    }
    if (c == "\\") { d = substr(s, i + 1, 1); i += 2; if (d != "\n") addc(d); continue }
    if (c == "\047" || c == "\"") { q = c; inword = 1; i++; continue }
    if (c == "#" && !inword) { while (i <= n && substr(s, i, 1) != "\n") i++; continue }
    if (c == "\n") { flush_seg(); i++; if (nhd > 0) skip_heredocs(); continue }
    if (c == " " || c == "\t") { flush_word(); i++; continue }
    if (c == "&" && substr(s, i + 1, 1) == ">") { i += 2; if (substr(s, i, 1) == ">") i++; emit_op(">"); continue }
    if (c == "<" && substr(s, i + 1, 2) == "<<") { i += 3; emit_op("<<<"); continue }
    if (c == "<" && substr(s, i + 1, 1) == "<") { flush_word(); i += 2; add_heredoc(); continue }
    if (c == ">" || c == "<") {
      if (inword && word ~ /^[0-9]+$/) { word = ""; inword = 0 } else flush_word()
      o = c; i++
      if (substr(s, i, 1) == ">") { o = o ">"; i++ } else if (substr(s, i, 1) == "|") i++
      if (substr(s, i, 1) == "&") { i++; while (i <= n && substr(s, i, 1) ~ /[0-9-]/) i++; continue }
      emit_op(o); continue
    }
    if (c == "$" && substr(s, i + 1, 1) == "(") { flush_seg(); i += 2; continue }
    if (c ~ /[;|&()`]/) { flush_seg(); i++; continue }
    addc(c); i++
  }
  if (q != "") uncertain = 1
  flush_seg()
  for (k = 1; k <= nsubs; k++) print "\003" subs[k]
  if (uncertain) print "\004"
}'

HOOK_PATH_RE='(^|/)\.claude/(hooks/|settings)'
HOOK_APPROVAL_MSG='훅 스크립트·settings.json 수정은 사용자가 채팅에 직접 친 승인이 필요하다(지침 §3, 카드 선택 불인정). 무엇을 왜 바꾸는지 말하고 「훅 고쳐」 같은 승인을 받아라.'
CLAUDE_MD_MSG='CLAUDE.md는 사용자가 직접 관리한다. Bash로 우회하지 말고 바꿀 문장과 위치를 사용자에게 주고 직접 붙여 넣게 하라.'
PNPM_ONLY_MSG='이 저장소는 pnpm만 쓴다(CLAUDE.md §1). pnpm install / pnpm add로 바꿔라. 새 의존성이면 이유 한 줄 + 사용자 승인 먼저(§5).'
DRAFT_MSG='PR은 draft로 연다(지침 §9). draft: true / --draft를 붙여 다시 호출하라.'
READY_WARN='draft 해제(ready)는 사용자 확인 뒤에(지침 §9). 게이트가 끝났는지 확인하라.'

is_claude_md() { case "$1" in CLAUDE.md|*/CLAUDE.md) return 0 ;; esac; return 1; }
is_hook_path() { [[ "$1" =~ $HOOK_PATH_RE ]]; }

# 파일 쓰기 대상 검사: CLAUDE.md는 항상 차단, 훅·settings는 승인 없으면 차단.
check_write_target() {
  if is_claude_md "$1"; then block "$CLAUDE_MD_MSG"; fi
  if is_hook_path "$1"; then
    hook_approved "$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)" || block "$HOOK_APPROVAL_MSG"
  fi
}

check_push() {
  local force=0 lease=0 main=0 skip=0 dd=0 a r dst
  local -a pos=()
  for a in "$@"; do
    if [ "$skip" -eq 1 ]; then skip=0; continue; fi
    if [ "$dd" -eq 0 ]; then
      case "$a" in
        --) dd=1; continue ;;
        --force-with-lease*|--force-if-includes) lease=1; continue ;;
        --force) force=1; continue ;;
        --repo|--push-option|--receive-pack|--exec) skip=1; continue ;;
        --*) continue ;;
        -*) [[ "$a" =~ ^-[A-Za-z]*f ]] && force=1
            [[ "$a" =~ o$ ]] && skip=1
            continue ;;
      esac
    fi
    pos+=("$a")
  done
  for r in "${pos[@]:1}"; do
    case "$r" in +*) force=1 ;; esac
    dst="${r#+}"; dst="${dst##*:}"; dst="${dst#refs/heads/}"
    case "$dst" in main|master) main=1 ;; esac
  done
  if [ "$force" -eq 1 ]; then
    block "git push --force 금지(CLAUDE.md §2). 되돌려야 하면 새 커밋으로 하고, 정말 필요하면 사용자에게 이유를 말하고 승인받아라."
  elif [ "$lease" -eq 1 ]; then
    warn "git push --force-with-lease/--force-if-includes는 경고만: 정말 필요한지 확인하라(CLAUDE.md §2)."
  fi
  if [ "$main" -eq 1 ]; then
    block "main에 직접 푸시하지 않는다(지침 §9 자기 브랜치에만). PR로 올리고 「머지해」를 받아라."
  fi
}

check_commit() {
  local -a A=("$@")
  local n=$# i=0 a have=0 skip=0 msg="" body j ch rest
  while [ "$i" -lt "$n" ]; do
    a="${A[$i]}"
    case "$a" in
      --) break ;;
      -m|--message) if [ "$have" -eq 0 ]; then msg="${A[$((i + 1))]:-}"; have=1; fi; i=$((i + 2)); continue ;;
      --message=*) if [ "$have" -eq 0 ]; then msg="${a#--message=}"; have=1; fi ;;
      -F|--file|-C|-c|-t|--template|--reuse-message|--reedit-message) skip=1; i=$((i + 2)); continue ;;
      --file=*|--template=*|--reuse-message=*|--reedit-message=*|--fixup*|--squash*|--no-edit) skip=1 ;;
      --*) ;;
      -?*)
        body="${a#-}"
        for ((j = 0; j < ${#body}; j++)); do
          ch="${body:j:1}"; rest="${body:j+1}"
          case "$ch" in
            m) if [ "$have" -eq 0 ]; then
                 if [ -n "$rest" ]; then msg="$rest"; else msg="${A[$((i + 1))]:-}"; i=$((i + 1)); fi
                 have=1
               fi
               break ;;
            F|C|c|t) skip=1; [ -n "$rest" ] || i=$((i + 1)); break ;;
          esac
        done ;;
    esac
    i=$((i + 1))
  done
  [ "$skip" -eq 0 ] && [ "$have" -eq 1 ] || return 0
  msg="${msg//$'\036'/$'\n'}"
  local title delim re_hd
  title="$(printf '%s\n' "$msg" | awk 'NF { print; exit }')"
  title="${title#"${title%%[![:space:]]*}"}"
  re_hd='^\$\(cat[[:space:]]*<<-?[[:space:]]*["'"'"']?([A-Za-z_][A-Za-z0-9_]*)'
  if [[ "$title" =~ $re_hd ]]; then
    delim="${BASH_REMATCH[1]}"
    title="$(printf '%s\n' "$msg" | awk -v d="$delim" 'NR == 1 { next } NF { if ($0 == d) exit; print; exit }')"
    title="${title#"${title%%[![:space:]]*}"}"
  elif [[ "$title" == \$* ]]; then
    return 0   # 변수·명령 치환 메시지: 판정 불가
  fi
  [ -n "$title" ] || return 0
  case "$title" in
    Merge\ *|Revert\ *) return 0 ;;
  esac
  if ! printf '%s' "$title" | grep -Eq '^[A-Za-z]+(\([^)]*\))?!?: .+' 2>/dev/null; then
    block "커밋 제목은 영어 접두어 + 짧은 요약(docs:/feat:/fix:/chore:), 본문은 한국어(CLAUDE.md §5)."
  else
    case "$(printf '%s' "$title" | grep -oE '^[A-Za-z]+' 2>/dev/null)" in
      docs|feat|fix|chore) ;;
      *) warn "커밋 접두어는 docs/feat/fix/chore 권장(CLAUDE.md §5). 나머지는 확인만." ;;
    esac
  fi
}

check_git() {
  local -a A=("$@")
  local n=$# i=0 a
  while [ "$i" -lt "$n" ]; do
    case "${A[$i]}" in
      -C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env) i=$((i + 2)) ;;
      -*) i=$((i + 1)) ;;
      *) break ;;
    esac
  done
  local sub="${A[$i]:-}"
  local -a R=("${A[@]:i+1}")
  case "$sub" in
    push) check_push "${R[@]}" ;;
    commit) check_commit "${R[@]}" ;;
    checkout|restore|apply)
      for a in "${R[@]}"; do
        if is_hook_path "$a"; then
          warn "훅·settings 파일을 cp/mv/rm/chmod/git checkout으로 건드렸다 — 원본 복사가 아니라면 승인 필요(지침 §3)."
          break
        fi
      done ;;
  esac
}

check_gh() {
  local -a A=()
  local skip=0 a prn="" draft=0 put=0 path=""
  for a in "$@"; do
    if [ "$skip" -eq 1 ]; then skip=0; continue; fi
    case "$a" in
      -R|--repo) skip=1; continue ;;
      --repo=*|-R?*) continue ;;
    esac
    A+=("$a")
  done
  if [ "${A[0]:-}" = "pr" ]; then
    case "${A[1]:-}" in
      merge)
        for a in "${A[@]:2}"; do
          if [[ "$a" =~ ^#?([0-9]+)$ ]] || [[ "$a" =~ /pull/([0-9]+) ]]; then prn="${BASH_REMATCH[1]}"; break; fi
        done
        r7_check "$prn" ;;
      create)
        for a in "${A[@]:2}"; do
          case "$a" in --draft|--draft=true|-d) draft=1 ;; esac
        done
        [ "$draft" -eq 1 ] || block "$DRAFT_MSG" ;;
      ready)
        for a in "${A[@]:2}"; do [ "$a" = "--undo" ] && return 0; done
        warn "$READY_WARN" ;;
    esac
  elif [ "${A[0]:-}" = "api" ]; then
    for a in "${A[@]:1}"; do
      case "$a" in
        -XPUT|-Xput|--method=PUT|--method=put) put=1 ;;
        PUT|put) put=1 ;;
      esac
      [[ "$a" =~ pulls/([0-9]+)/merge ]] && path="${BASH_REMATCH[1]}"
    done
    if [ -n "$path" ] && [ "$put" -eq 1 ]; then r7_check "$path"; fi
  fi
}

# 한 단순 명령 검사. $1=토크나이저 한 줄, $2=깊이
check_segment() {
  local -a W=() ARGS=() REDIRS=()
  local depth="$2" k=0 n w cmd a op="" pending=0
  IFS=$'\037' read -r -a W <<< "$1"
  n=${#W[@]}
  while [ "$k" -lt "$n" ]; do
    w="${W[$k]}"
    case "$w" in
      '{'|'}'|'!'|if|then|elif|else|do|while|until|nohup|time|exec|builtin) k=$((k + 1)); continue ;;
      env|sudo|nice)
        k=$((k + 1))
        while [ "$k" -lt "$n" ] && { [[ "${W[$k]}" == -* ]] || [[ "${W[$k]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; }; do k=$((k + 1)); done
        continue ;;
      timeout)
        k=$((k + 1))
        while [ "$k" -lt "$n" ] && [[ "${W[$k]}" == -* ]]; do k=$((k + 1)); done
        k=$((k + 1)); continue ;;
    esac
    if [[ "$w" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then k=$((k + 1)); continue; fi
    break
  done
  [ "$k" -lt "$n" ] || return 0
  cmd="${W[$k]##*/}"
  for a in "${W[@]:k+1}"; do
    if [ "$pending" -eq 1 ]; then
      pending=0
      case "$op" in '>'|'>>') REDIRS+=("${a//$'\036'/$'\n'}") ;; esac
      continue
    fi
    if [[ "$a" == $'\002'* ]]; then op="${a#?}"; pending=1; continue; fi
    ARGS+=("$a")
  done

  for a in "${REDIRS[@]}"; do check_write_target "$a"; done

  case "$cmd" in
    git) check_git "${ARGS[@]}" ;;
    gh) check_gh "${ARGS[@]}" ;;
    codex)
      if codex_active; then
        case "${ARGS[0]:-}" in
          --version|-V|--help|-h|login) ;;
          *) block "$CODEX_MSG" ;;
        esac
      fi ;;
    npx|bunx|pnpm|npm)
      # 실행(npx, bunx, pnpm dlx/exec, npm exec)만 막는다 — 설치는 Codex 호출이 아니다.
      if codex_active && { [ "$cmd" = npx ] || [ "$cmd" = bunx ] || [[ "${ARGS[0]:-}" =~ ^(dlx|exec|x)$ ]]; }; then
        for a in "${ARGS[@]}"; do
          case "$a" in @openai/codex|@openai/codex@*) block "$CODEX_MSG" ;; esac
        done
      fi ;;&
    npm)
      local sub=""
      for a in "${ARGS[@]}"; do case "$a" in -*) ;; *) sub="$a"; break ;; esac; done
      case "$sub" in
        install|i|ci|add|uninstall|remove|rm|update|up)
          local global=0
          for a in "${ARGS[@]}"; do case "$a" in -g|--global) global=1 ;; esac; done
          if [ "$global" -eq 1 ]; then
            warn "npm -g 전역 설치는 pnpm dlx 사용을 검토하라(CLAUDE.md §1)."
          else
            block "$PNPM_ONLY_MSG"
          fi ;;
      esac ;;
    yarn)
      case "${ARGS[0]:-}" in --version|-v) ;; *) block "$PNPM_ONLY_MSG" ;; esac ;;
    bun)
      case "${ARGS[0]:-}" in add|install|i|remove) block "$PNPM_ONLY_MSG" ;; esac ;;
    npx)
      warn "npx 대신 pnpm dlx / pnpm exec를 검토하라(CLAUDE.md §1)." ;;
    pnpm)
      case "${ARGS[0]:-}" in
        add|install|i)
          for a in "${ARGS[@]:1}"; do
            case "$a" in -*) ;; *) warn "새 의존성은 이유 한 줄 + 사용자 승인 후(CLAUDE.md §5)."; break ;; esac
          done ;;
      esac ;;
    tee)
      for a in "${ARGS[@]}"; do case "$a" in -*) ;; *) check_write_target "$a" ;; esac; done ;;
    sed|perl)
      local inplace=0
      for a in "${ARGS[@]}"; do [[ "$a" =~ ^(-[A-Za-z]*i|--in-place) ]] && inplace=1; done
      if [ "$inplace" -eq 1 ]; then
        for a in "${ARGS[@]}"; do case "$a" in -*) ;; *) check_write_target "$a" ;; esac; done
      fi ;;
    cp|mv|rm|chmod)
      local -a P=()
      for a in "${ARGS[@]}"; do case "$a" in -*) ;; *) P+=("$a") ;; esac; done
      if [ "${#P[@]}" -gt 0 ] && { [ "$cmd" = cp ] || [ "$cmd" = mv ]; } && is_claude_md "${P[${#P[@]}-1]}"; then
        block "$CLAUDE_MD_MSG"
      fi
      for a in "${P[@]}"; do
        if is_hook_path "$a"; then
          warn "훅·settings 파일을 cp/mv/rm/chmod/git checkout으로 건드렸다 — 원본 복사가 아니라면 승인 필요(지침 §3)."
          break
        fi
      done ;;
    bash|sh|zsh|eval)
      # 셸 문자열 안의 명령은 확실히 판정할 수 없다 — 같은 검사를 경고로만 한다.
      local inner="" seen_c=0
      if [ "$cmd" = eval ]; then
        inner="${ARGS[*]}"
      else
        for a in "${ARGS[@]}"; do
          if [ "$seen_c" -eq 1 ]; then inner="$a"; break; fi
          [[ "$a" =~ ^-[A-Za-z]*c[A-Za-z]*$ ]] && seen_c=1
        done
      fi
      if [ -n "$inner" ] && [ "$depth" -lt 2 ]; then
        local saved="$DOWNGRADE"
        DOWNGRADE=1
        analyze_bash "${inner//$'\036'/$'\n'}" $((depth + 1))
        DOWNGRADE="$saved"
      fi ;;
  esac
}

analyze_bash() {  # $1=명령 문자열, $2=깊이
  local cmd="$1" depth="${2:-0}" line saved="$DOWNGRADE" unc=0
  local -a segs=() subs=()
  while IFS= read -r line; do
    case "$line" in
      $'\004') unc=1 ;;
      $'\003'*) subs+=("${line#?}") ;;
      *) segs+=("$line") ;;
    esac
  done < <(printf '%s' "$cmd" | awk "$TOKENIZER" 2>/dev/null)
  [ "$unc" -eq 1 ] && DOWNGRADE=1
  for line in "${segs[@]}"; do check_segment "$line" "$depth"; done
  if [ "$depth" -lt 2 ]; then
    DOWNGRADE=1
    for line in "${subs[@]}"; do analyze_bash "${line//$'\036'/$'\n'}" $((depth + 1)); done
  fi
  DOWNGRADE="$saved"
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
# 한글 판정은 jq(Oniguruma, 항상 UTF-8)로 한다 — grep 범위식은 로케일마다 결과가 다르다.
count_hangul_chars() { printf '%s' "$1" | jq -Rrs '[match("[가-힣ㄱ-ㅎㅏ-ㅣ]"; "g")] | length' 2>/dev/null || echo 0; }
count_word_tokens() { printf '%s' "$1" | grep -oE '[A-Za-z]{2,}' 2>/dev/null | wc -l | tr -d ' '; }
count_hangul_tokens() { printf '%s' "$1" | jq -Rrs '[splits("[ \n]+") | select(test("[가-힣ㄱ-ㅎㅏ-ㅣ]"))] | length' 2>/dev/null || echo 0; }

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
    list_lines="$(printf '%s\n' "$list_text" | grep -Ec '^[[:space:]]*(\(?[a-dA-D]\)|[a-dA-D][.:]|①|②|③|④|\(?[1-4]\))[[:space:]]' 2>/dev/null || true)"
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
          elif ! printf '%s' "$args" | grep -Eq -- '--claude' 2>/dev/null; then
            warn "기본 리뷰어에 Codex가 있으면 실제 codex 호출은 막힌다. --claude 레인만 쓰거나 Opus 독립 검토로."
          fi
          ;;
      esac
    fi
    ;;

  Bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"

    # R3 Codex · R5 패키지 매니저 · R6 push · R7 머지 · R8 훅/CLAUDE.md 쓰기 · R11 draft · R12 커밋 제목:
    # 명령을 단순 명령 단위로 나눠 해당 명령의 인자만 본다(따옴표·heredoc·주석 속 글은 무시).
    analyze_bash "$cmd" 0

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

    ;;

  Write|Edit|NotebookEdit)
    fp="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)"
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
      block "$DRAFT_MSG"
    fi
    ;;

  mcp__github__update_pull_request)
    draft="$(printf '%s' "$payload" | jq -r '.tool_input.draft | if . == false then "false" else "" end' 2>/dev/null)"
    [ "$draft" = "false" ] && warn "$READY_WARN"
    ;;

esac

finish
