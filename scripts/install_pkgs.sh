#!/bin/bash
# Cloud-session dependency install (Claude Code on the web).
# Runs from the SessionStart hook in .claude/settings.json.
# Exits immediately outside the cloud so local sessions are untouched.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
GSTACK="$ROOT/.claude/skills/gstack"

# gstack: vendored tracked files only; install its JS deps once per VM.
if [ -d "$GSTACK" ] && [ ! -d "$GSTACK/node_modules" ]; then
  cd "$GSTACK" || exit 0
  # bun is pre-installed in the cloud VM but its package fetching can fail
  # behind the security proxy, so fall back to npm.
  bun install || npm install || true
fi

exit 0
