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

# gstack browser/PDF bundles: needed by /browse, /qa, /design-review,
# /make-pdf, /diagram. `bun run build` also compiles bin/gstack-global-discover.ts
# and the cso stack, whose sources are not vendored, so compile the four
# bundles directly. Outputs are gitignored (~100 MB each). Set
# GSTACK_SKIP_BUILD=1 in the cloud environment to skip.
if [ -d "$GSTACK/node_modules" ] && [ ! -x "$GSTACK/browse/dist/browse" ] \
   && [ "${GSTACK_SKIP_BUILD:-0}" != "1" ]; then
  cd "$GSTACK" || exit 0
  bun build --compile browse/src/cli.ts --outfile browse/dist/browse \
    && bun build --compile browse/src/find-browse.ts --outfile browse/dist/find-browse \
    && bun build --compile design/src/cli.ts --outfile design/dist/design \
    && bun build --compile make-pdf/src/cli.ts --outfile make-pdf/dist/pdf \
    || echo "install_pkgs: gstack bundle build failed; browser skills unavailable this session" >&2
fi

exit 0
