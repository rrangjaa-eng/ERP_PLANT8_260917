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
# browsers under $PLAYWRIGHT_BROWSERS_PATH, but not the revision the caller's
# playwright expects, and the Playwright CDN is not reachable through the
# proxy. Link the expected headless-shell revision to the preinstalled one.
# Verified: goto/text/screenshot work with Chromium 141 under playwright 1.62.
link_chromium_headless_shell() {
  local browsers_json="$1"
  local pw="${PLAYWRIGHT_BROWSERS_PATH:-}"
  if [ -z "$pw" ] || [ ! -d "$pw" ] || [ ! -f "$browsers_json" ]; then
    return 0
  fi
  local rev
  rev="$(node -e '
    const b = require(process.argv[1]).browsers;
    const e = b.find(x => x.name === "chromium-headless-shell") || b.find(x => x.name === "chromium");
    if (e) process.stdout.write(String(e.revision));' "$browsers_json" 2>/dev/null || true)"
  local want="$pw/chromium_headless_shell-${rev}/chrome-headless-shell-linux64/chrome-headless-shell"
  if [ -n "$rev" ] && [ ! -e "$want" ]; then
    local have
    have="$(find "$pw" -maxdepth 3 -type f \( -name chrome-headless-shell -o -name headless_shell \) 2>/dev/null | head -1)"
    if [ -n "$have" ] && mkdir -p "$(dirname "$want")" 2>/dev/null; then
      ln -sfn "$have" "$want" \
        && touch "$pw/chromium_headless_shell-${rev}/INSTALLATION_COMPLETE" \
                 "$pw/chromium_headless_shell-${rev}/DEPENDENCIES_VALIDATED" \
        && echo "install_pkgs: linked Playwright chromium_headless_shell-${rev} -> $have"
    else
      echo "install_pkgs: no preinstalled headless Chromium found; browser skills unavailable this session" >&2
    fi
  fi
}

link_chromium_headless_shell "$GSTACK/node_modules/playwright-core/browsers.json"

# 프로젝트 의존성(pnpm) — 클라우드 세션마다 lockfile 그대로 설치. 실패해도 세션은
# 계속(D-01, dev-db.sh가 이어서 로컬 DB를 준비한다).
if [ -f "$ROOT/package.json" ] && command -v pnpm >/dev/null 2>&1; then
  (cd "$ROOT" && pnpm install --frozen-lockfile) \
    || echo "install_pkgs: pnpm install --frozen-lockfile failed" >&2
fi

# 앱 자체의 Playwright(@playwright/test)도 gstack과 같은 헤드리스 셸 링크가
# 필요하다(test/e2e가 쓰는 Chromium).
link_chromium_headless_shell "$ROOT/node_modules/playwright-core/browsers.json"

exit 0
