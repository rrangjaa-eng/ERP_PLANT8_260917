#!/bin/bash
# Rewrite GSD's machine-specific absolute @-includes to project-relative paths.
#
# GSD's `--local` installer writes the installing machine's absolute path
# (e.g. F:/CLAUDE/ERP_PLANT8_260917/.claude/gsd-core/...) into
# .claude/commands, .claude/agents and .claude/gsd-core. Claude Code resolves
# @-paths in those files from the project root, so the prefix is unnecessary
# and breaks every other checkout, including claude.ai/code cloud sessions.
#
# Run once after every `/gsd-update` (or any re-install), then commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

DIRS=".claude/commands .claude/agents .claude/gsd-core"
PREFIX="$({ grep -rhoE '@(/|[A-Za-z]:/)[^ ]*\.claude/gsd-core/' $DIRS 2>/dev/null || true; } | head -1 \
  | sed -E 's#^@##; s#\.claude/gsd-core/$##')"

if [ -z "$PREFIX" ]; then
  echo "gsd-relativize: no absolute @-includes found; nothing to do"
  exit 0
fi

echo "gsd-relativize: stripping prefix '$PREFIX'"
grep -rlF "$PREFIX" $DIRS | xargs -r sed -i "s#${PREFIX}##g"
LEFT="$(grep -rF "$PREFIX" $DIRS | wc -l)"
echo "gsd-relativize: done, remaining occurrences: $LEFT"
[ "$LEFT" -eq 0 ]
