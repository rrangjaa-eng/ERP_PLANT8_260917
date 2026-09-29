#!/usr/bin/env bash
# plant8-wave.sh — plant8-skill-gate.sh·plant8-session-boundary.sh가 공유하는 웨이브 계산.
# 세션 단위 = 웨이브(사용자 결정 2026-09-27; 전엔 플랜 하나). GSD는 웨이브를 순서대로
# 실행하므로 "SUMMARY가 없는 플랜 중 가장 낮은 wave"가 지금 실행 중인 웨이브다.
# 모든 함수는 판정 불가 시 빈 문자열(또는 rc 1)만 내고 절대 세션을 막지 않는다 —
# 훅은 그때 옛 규칙(세션당 플랜 하나)으로 돌아간다.

# p8_current_phase_pad <project> <session> → 04 · 04.1 … (skill-gate가 기록한 세션 페이즈 우선, 없으면 STATE.md)
p8_current_phase_pad() {
  local project="$1" session="$2" phase="" f int
  f="${TMPDIR:-/tmp}/plant8-skill-gate/${session}.phase"
  [ -s "$f" ] && phase="$(cat "$f")"
  [ -n "$phase" ] || phase="$(sed -n 's/^current_phase: *"\{0,1\}\([0-9.]*\)"\{0,1\}$/\1/p' "$project/.planning/STATE.md" 2>/dev/null | head -n1)"
  int="${phase%%.*}"
  [[ "$int" =~ ^[0-9]+$ ]] || { printf ''; return 0; }
  printf '%02d%s' "$((10#$int))" "${phase#"$int"}"
}

# p8_phase_dir <project> <phase_pad> → .planning/phases/<pad>-*/ 첫 디렉터리(없으면 빈 문자열)
p8_phase_dir() {
  local project="$1" pad="$2" d
  [ -n "$pad" ] || { printf ''; return 0; }
  for d in "$project"/.planning/phases/"$pad"-*/; do
    [ -d "$d" ] && { printf '%s' "${d%/}"; return 0; }
  done
  printf ''
}

# p8_plan_wave <PLAN.md> → frontmatter의 wave 값(없으면 빈 문자열)
p8_plan_wave() {
  awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} /^wave:/{sub(/^wave:[[:space:]]*/,""); gsub(/[[:space:]"]/,""); print; exit}' "$1" 2>/dev/null
}

# p8_lowest_incomplete_wave <phase_dir> → SUMMARY 없는 플랜의 최소 wave(플랜·wave 정보가 없으면 빈 문자열)
p8_lowest_incomplete_wave() {
  local dir="$1" f w min="" base
  [ -n "$dir" ] || { printf ''; return 0; }
  for f in "$dir"/*-PLAN.md; do
    [ -f "$f" ] || continue
    base="${f%-PLAN.md}"
    [ -f "${base}-SUMMARY.md" ] && continue
    w="$(p8_plan_wave "$f")"
    [[ "$w" =~ ^[0-9]+$ ]] || continue
    if [ -z "$min" ] || [ "$w" -lt "$min" ]; then min="$w"; fi
  done
  printf '%s' "$min"
}

# p8_wave_complete <phase_dir> <wave> → 그 wave의 플랜이 하나 이상 있고 전부 SUMMARY가 있으면 rc 0
p8_wave_complete() {
  local dir="$1" wave="$2" f w n=0 base
  [ -n "$dir" ] && [ -n "$wave" ] || return 1
  for f in "$dir"/*-PLAN.md; do
    [ -f "$f" ] || continue
    w="$(p8_plan_wave "$f")"
    [ "$w" = "$wave" ] || continue
    n=$((n + 1))
    base="${f%-PLAN.md}"
    [ -f "${base}-SUMMARY.md" ] || return 1
  done
  [ "$n" -gt 0 ]
}
