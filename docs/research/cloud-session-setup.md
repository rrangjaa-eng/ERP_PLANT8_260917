# 클라우드 세션(claude.ai/code)에서 gstack / GSD / superpowers 쓰기

조사일: 2026-09-17. 출처는 각 항목에 표기. "확인됨" = 공식 문서 또는 로컬 설치 파일에서 직접 확인. "추정" = 문서에 없음.

## A. 클라우드 세션이 리포에서 자동으로 가져가는 것

- **확인됨** (code.claude.com/docs/en/cloud-environments, "What carries over from your setup" 표): 리포의 `CLAUDE.md`, `.claude/settings.json`의 hooks, `.mcp.json`, `.claude/rules/`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/`는 전부 "Yes, part of the clone".
- **확인됨** (같은 표): `~/.claude/CLAUDE.md`, `~/.claude/skills/`·`agents/`·`commands/`, `~/.claude/settings.json`의 사용자 범위 `enabledPlugins`는 전부 "No. Live on your machine, not in the repo. Commit them to the repo's `.claude/` directory instead."
- **확인됨** (code.claude.com/docs/en/skills): "Cowork sessions and cloud sessions don't read `~/.claude/skills/` on your machine."

즉 이 PC의 `~/.claude`에 전역 설치한 것은 클라우드에 없다. 리포 안 `.claude/`에 넣고 커밋해야 한다.

## B. 플러그인 자동 설치와 설정 스크립트

- **확인됨** (cloud-environments 표): "Plugins declared in `.claude/settings.json`: Yes. Installed at session start from the marketplace you declared. Requires network access to reach the marketplace source." 프로젝트 `.claude/settings.json`의 `enabledPlugins` + `extraKnownMarketplaces`는 세션 시작 시 자동 설치된다.
- **확인됨**: 사용자 범위 `enabledPlugins`(`~/.claude/settings.json`)는 클라우드에 반영되지 않는다. "Declare them in the repo's `.claude/settings.json` instead."
- **확인됨** (같은 문서 "Setup scripts" 절): 환경별 Setup script는 claude.ai/code의 환경 선택기(Add/Edit environment)에서 편집하는 Bash 스크립트. Claude Code 실행 전 1회 실행되고 약 7일간 캐시된다. `npx @opengsd/gsd-core@latest --claude --local` 같은 명령을 여기 넣을 수 있다.
- **확인됨**: 대안으로 리포에 커밋하는 `SessionStart` hook + `CLAUDE_CODE_REMOTE` 환경변수 분기 패턴이 문서 예시로 있다(로컬·클라우드 모두 실행되므로 클라우드 전용으로 조건을 걸어야 함).

## C. 도구별 방법

### gstack

- **확인됨** (`~/.claude/skills/gstack/bin/gstack-skill-start` 190~196행): `VENDORED_GSTACK`는 `.claude/skills/gstack`가 심볼릭 링크가 아닌 실제 디렉터리이고 `VERSION` 파일 또는 `.git`이 있을 때 "yes". 지원되는 vendoring = gstack 트리를 프로젝트의 `.claude/skills/gstack`에 실파일로 복사·커밋.
- **확인됨** (README.md 55~63행): `./setup --team`(팀 모드)은 "No vendored files in your repo"이고 `~/.claude/skills/gstack`에 의존하므로 **클라우드에서는 동작하지 않는다**.

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git /tmp/gstack-vendor
```
```bash
rm -rf /tmp/gstack-vendor/.git /tmp/gstack-vendor/.github /tmp/gstack-vendor/test
```
```bash
cp -r /tmp/gstack-vendor <repo>/.claude/skills/gstack
```
```bash
git add .claude/skills/gstack && git commit -m "vendor gstack for cloud sessions"
```

- **확인됨** (README.md 44~47, 590~602행): 요구사항은 Git, **Bun v1.0+**, Windows에서는 Node.js. `/browse`·`/qa`·`/design-review`·`/make-pdf`·`/diagram`·`/pair-agent`는 `bun install && bun run build`로 만든 번들 Chromium이 필요하다. 파일 복사만으로는 빌드가 안 되므로 클라우드 Setup script에 `bun install && bun run build`를 넣거나, 브라우저 없이 쓰려면 환경변수 `GSTACK_SKIP_PLAYWRIGHT=1`로 Chromium 설치를 생략한다. Aside 브라우저는 macOS 전용이라 Ubuntu 클라우드 VM에는 해당 없음.
- **추정**: `/cso`는 특수 Bun 빌드 플래그 + 네이티브 컴파일러가 필요해(README 45행) 클라우드 샌드박스에서 별도 설정 없이는 동작하지 않을 가능성이 높다. gstack에 클라우드 전용 문서는 없다.

### GSD

- **확인됨** (`~/.claude/gsd-core/workflows/*.md`에 내장된 리졸버): 프로젝트 로컬 런타임 경로는 `<repo>/.claude/gsd-core/bin/gsd-tools.cjs`. 못 찾으면 정확히 `Run: npx -y @opengsd/gsd-core@latest --claude --local`을 출력한다.
- **확인됨** (`~/.claude/gsd-core/bin/lib/init.cjs` 3652~3733행): 현재 Claude 스킬 루트는 `.claude/skills`(scope project). `.claude/commands/gsd`·`.claude/gsd-core/skills`는 deprecated 레거시. `--claude --local`은 `<repo>/.claude/gsd-core/`(런타임)와 `<repo>/.claude/skills/gsd-*`(스킬)에 쓴다.

```bash
npx -y @opengsd/gsd-core@latest --claude --local
```
```bash
git add .claude/gsd-core .claude/skills .claude/commands .claude/agents
```
```bash
git commit -m "vendor GSD project-local for cloud sessions"
```

- **확인됨**: A에서 본 대로 `.claude/skills`·`agents`·`commands`는 클론에 포함되므로 커밋이 곧 공유 방법이다.

### superpowers

- **확인됨** (`~/.claude/settings.json` 215~222, 268~270행, 사용자 범위):

```json
"extraKnownMarketplaces": {"superpowers-marketplace": {"source": {"source": "github", "repo": "obra/superpowers-marketplace"}}},
"enabledPlugins": {"superpowers@superpowers-marketplace": true}
```

- **확인됨** (discover-plugins 문서): 이 두 블록을 **프로젝트** `.claude/settings.json`으로 옮겨 커밋해야 클라우드에서 자동 설치된다(GitHub는 기본 허용 도메인).

## D. 전달되지 않는 것과 최소 커밋 세트

- **확인됨**: `~/.claude/*`(사용자 범위)와 이 PC 전용 설정은 클라우드에 없다.
- **확인됨** (`~/.gstack/` 실재 파일): `config.yaml`, `projects/rrangjaa-eng-ERP_PLANT8_260917/*-design-*.md` 등은 클라우드에 안 간다. 설계 문서는 리포 `docs/designs/`에 복사본이 있다.
- **추정**: `~/.gsd/defaults.json`은 이 PC에 파일 자체가 없다. GSD는 프로젝트 안 `.planning/config.json`을 쓴다.
- 이 세션의 Claude 메모리(`~/.claude/projects/.../memory/`)도 안 간다. 회사 성격·브랜치 규칙·모델 규칙은 `CLAUDE.md`와 설계 문서에 이미 적혀 있다.

**최소 커밋 세트**: `CLAUDE.md`, `.claude/settings.json`, `.claude/gsd-core/`, `.claude/skills/`(gstack + gsd-*), `.claude/commands/`, `.claude/agents/`, `.mcp.json`(있다면), `.planning/` 전체(STATE.md, ROADMAP.md, PROJECT.md, config.json, phases/). 이걸 커밋해야 클라우드에서 `/gsd-progress`·`/gsd-resume-work`가 이어진다.

## 적용 순서 (제안, 사용자 확인 뒤)

1. `npx -y @opengsd/gsd-core@latest --claude --local` → `.claude/gsd-core/`, `.claude/skills/gsd-*` 생성 → 커밋
2. gstack 트리를 `.claude/skills/gstack`에 복사(`.git`·`.github`·`test` 제외) → 커밋. 크기가 크면 브라우저 번들은 빼고 Setup script에서 `bun install && bun run build`
3. 프로젝트 `.claude/settings.json`에 superpowers `extraKnownMarketplaces` + `enabledPlugins` 추가 → 커밋
4. claude.ai/code 환경 설정 (2026-09-17 확인, code.claude.com/docs/en/cloud-environments):
   - 위치: claude.ai/code 메시지 입력창 윗줄의 구름 아이콘("Default") → **Add cloud environment**, 또는 기존 환경에 마우스 올려 톱니바퀴. 데스크톱 앱 입력창에도 같은 선택기가 있다.
   - 대화상자 칸: Name / Network access(Trusted 유지) / Environment variables(.env 형식) / Setup script(Bash).
   - **bun은 클라우드 VM에 이미 설치돼 있다**(Node.js 행: npm, yarn, pnpm, bun). 단 "Bun is installed but has known proxy compatibility issues for package fetching" 이므로 실패 시 npm으로 넘어가게 쓴다.
   - **Setup script 칸은 비워 둔다.** 2026-09-17 실측: 설정 스크립트는 리포가 복제되기 전에 돌아서 `git rev-parse`가 "not a git repository"로 실패했다. 문서 규칙대로 VM 도구 설치(설정 스크립트)와 프로젝트 의존성 설치(SessionStart hook)를 나눈다. bun은 이미 있으니 설정 스크립트에 넣을 게 없다.
   - 프로젝트 의존성은 리포에 커밋된 SessionStart hook이 설치한다: `.claude/settings.json`의 `hooks.SessionStart` → `scripts/install_pkgs.sh`. 스크립트는 `CLAUDE_CODE_REMOTE=true`가 아니면 즉시 종료하고, 클라우드에서만 `.claude/skills/gstack`에 `bun install || npm install`을 한다(`node_modules`가 있으면 건너뜀). 매 세션 시작·재개 때 돈다.
   - Environment variables: `GSTACK_SKIP_PLAYWRIGHT=1` (브라우저 QA를 클라우드에서 안 쓸 때)
   - Setup script는 첫 세션에서 한 번 실행되고 약 7일간 파일시스템 스냅샷으로 캐시된다. 스크립트나 허용 도메인을 바꾸면 다시 실행. 5분 안에 끝나야 한다. root로 실행. 이 칸의 값은 환경을 쓰는 누구나 볼 수 있으니 비밀값 금지.
5. 클라우드 세션에서 `/gsd-progress`로 확인. 필요하면 `check-tools`를 실행해 달라고 해서 설치 도구 버전을 본다.
