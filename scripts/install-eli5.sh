#!/bin/bash
# 클라우드 세션에서 eli5 스킬(/eli5 <주제>)을 쓸 수 있게 한다(사용자 승인 2026-10-06).
# 로컬 PC에는 플러그인 eli5@claude-community로 설치돼 있지만, 클라우드는 세션마다 새 컨테이너라
# 플러그인이 없고 프로젝트 enabledPlugins만으로는 설치되지 않았다(2026-10-06 headless 시험).
# 그래서 install-gstack.sh처럼 ~/.claude/skills에 스킬 파일을 직접 받는다. 로컬은 건드리지 않고,
# 어떤 실패도 세션을 막지 않는다(SessionStart 훅).

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

SKILL_FILE="$HOME/.claude/skills/eli5/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
  echo "install-eli5: already installed — skipping"
  exit 0
fi

# 버전 고정: anthropics/claude-plugins-community의 eli5 1.0.0 커밋.
ELI5_PIN="${ELI5_PIN:-f60f0454df3045f724c43c6346ec80bdcc3472b2}"
URL="https://raw.githubusercontent.com/anthropics/claude-plugins-community/$ELI5_PIN/eli5/skills/eli5/SKILL.md"
mkdir -p "$(dirname "$SKILL_FILE")"
if ! curl -fsS -m 30 -o "$SKILL_FILE.tmp" "$URL"; then
  rm -f "$SKILL_FILE.tmp"
  echo "install-eli5: download failed ($ELI5_PIN) — eli5 unavailable this session" >&2
  exit 0
fi
mv "$SKILL_FILE.tmp" "$SKILL_FILE"
echo "install-eli5: installed ($ELI5_PIN)"
