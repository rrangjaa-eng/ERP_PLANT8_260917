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

# Chromium for /browse, /qa, /design-review: the cloud VM ships Playwright
# browsers under $PLAYWRIGHT_BROWSERS_PATH, but not the revision gstack's
# playwright expects, and the Playwright CDN is not reachable through the
# proxy. Link the expected headless-shell revision to the preinstalled one.
# Verified: goto/text/screenshot work with Chromium 141 under playwright 1.62.
PW="${PLAYWRIGHT_BROWSERS_PATH:-}"
BJ="$GSTACK/node_modules/playwright-core/browsers.json"
if [ -n "$PW" ] && [ -d "$PW" ] && [ -f "$BJ" ]; then
  REV="$(node -e '
    const b = require(process.argv[1]).browsers;
    const e = b.find(x => x.name === "chromium-headless-shell") || b.find(x => x.name === "chromium");
    if (e) process.stdout.write(String(e.revision));' "$BJ" 2>/dev/null || true)"
  WANT="$PW/chromium_headless_shell-${REV}/chrome-headless-shell-linux64/chrome-headless-shell"
  if [ -n "$REV" ] && [ ! -e "$WANT" ]; then
    HAVE="$(find "$PW" -maxdepth 3 -type f \( -name chrome-headless-shell -o -name headless_shell \) 2>/dev/null | head -1)"
    if [ -n "$HAVE" ] && mkdir -p "$(dirname "$WANT")" 2>/dev/null; then
      ln -sfn "$HAVE" "$WANT" \
        && touch "$PW/chromium_headless_shell-${REV}/INSTALLATION_COMPLETE" \
                 "$PW/chromium_headless_shell-${REV}/DEPENDENCIES_VALIDATED" \
        && echo "install_pkgs: linked Playwright chromium_headless_shell-${REV} -> $HAVE"
    else
      echo "install_pkgs: no preinstalled headless Chromium found; /browse unavailable this session" >&2
    fi
  fi
fi

exit 0
