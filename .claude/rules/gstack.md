<!-- gstack 팀 모드(optional)가 CLAUDE.md에 넣는 섹션을 그대로 옮겼다(gstack 1.87.6.0 bin/gstack-team-init).
     루트 CLAUDE.md는 바꾸지 않고, .claude/rules/에 둬서 세션마다 자동으로 읽힌다.
     클라우드 세션에서는 scripts/install-gstack.sh(SessionStart 훅)가 아래 설치를 대신 실행한다. -->

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback). Use ~/.claude/skills/gstack/... for gstack file paths.
