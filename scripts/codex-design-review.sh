#!/bin/bash
# Codex 디자인 검토 진입점 — Codex는 디자인 검토(/design-review·/plan-design-review)에서만 쓴다
# (사용자 결정 2026-10-01, CLAUDE.md §6). 이 스크립트는 맨 `codex` 명령이 아니라 디자인 전용 경로다.
#
#   bash scripts/codex-design-review.sh <경로…> --out <보고서.md> [--base <ref>] [--plan <파일>]… [--sections 6-10,7-5]
#
# CI=true 프로덕션 빌드 화면을 375·320·768·1280 폭으로 찍고 DOM 실측표를 만든 뒤, 변경(diff 또는
# 계획)·SYSTEM.md 관련 절·실측표·스크린샷을 codex exec에 넘긴다. Codex 지적은 후보이고 판정은 실측.
# codex CLI나 ChatGPT 로그인이 없으면 보고서에 한 줄만 남기고 0으로 끝낸다(건너뜀, 실패 아님).
# 캡처는 E2E와 같은 globalSetup으로 erp_test를 초기화한다 — E2E와 동시에 돌리지 않는다.

cd "$(dirname "$0")/.." || exit 1

out=""
prev=""
for arg in "$@"; do
  [ "$prev" = "--out" ] && out="$arg"
  prev="$arg"
done
# 보고서는 .planning/·test-results/ 아래 .md에만 쓴다(보호 파일 덮어쓰기 방지 — lib.ts parseArgs와 같은 규칙).
case "$out" in
  *..*) out="" ;;
  .planning/*.md|test-results/*.md) ;;
  *) out="" ;;
esac
# 링크를 따라가면 보호 파일을 덮을 수 있다 — 링크 자체와, 실제 경로가 허용 폴더 밖인 경우를 거부한다.
if [ -n "$out" ]; then
  root="$(pwd -P)"
  real="$(realpath -m -- "$out")"
  case "$real" in
    "$root"/.planning/*|"$root"/test-results/*) ;;
    *) out="" ;;
  esac
  [ -L "$out" ] && out=""
  # 하드링크(링크 수 > 1)도 보호 파일과 내용을 같이 쓴다 — 거부한다.
  [ -n "$out" ] && [ -e "$out" ] && [ "$(stat -c %h -- "$out")" -gt 1 ] && out=""
fi
if [ -z "$out" ]; then
  echo "--out은 .planning/·test-results/ 아래 .md여야 한다" >&2
  echo "사용법: bash scripts/codex-design-review.sh <경로…> --out <보고서.md> [--base <ref>] [--plan <파일>]… [--sections <id,…>]" >&2
  exit 2
fi

reason=""
if ! command -v codex >/dev/null 2>&1; then
  reason="codex CLI 없음 (scripts/install-codex.sh)"
elif ! codex login status 2>&1 | grep -q '^Logged in using ChatGPT'; then
  reason="ChatGPT 로그인 안 됨 (CODEX_AUTH_JSON_B64)"
fi

if [ -n "$reason" ]; then
  mkdir -p "$(dirname "$out")"
  line="Codex 디자인 검토 건너뜀: $reason"
  printf '%s\n' "$line" > "$out"
  echo "$line"
  exit 0
fi

exec pnpm exec tsx scripts/codex-design-review/run.ts "$@"
