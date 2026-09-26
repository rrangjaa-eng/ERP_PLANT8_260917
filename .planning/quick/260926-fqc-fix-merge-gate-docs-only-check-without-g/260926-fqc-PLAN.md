---
phase: quick-260926-fqc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .claude/hooks/plant8-skill-gate.sh
  - .claude/hooks/tests/plant8-skill-gate.test.sh
autonomous: true
requirements: [QUICK-260926-fqc]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "gh가 없거나(rc 127) gh api가 실패(rc 1)해도, origin의 refs/pull/N/head 커밋과 로컬 refs/remotes/origin/main의 diff가 문서만이면 /review 기록만으로 머지 훅이 exit 0이다"
    - "같은 대체 경로에서 PR에 코드 파일이 있거나 코드 파일을 문서로 이름 바꿨으면(옛 경로 포함) /qa 기록 없이는 exit 2다"
    - "판정을 못 하면(origin이 payload owner/repo와 다름, origin에 refs/pull/N/head 없음, PR 헤드 커밋이나 origin/main이 로컬에 없음, expectedHeadSha가 PR 헤드와 다름, ls-remote 실패·시간 초과) /qa 기록 없이는 정확히 exit 2다. set -e 때문에 다른 코드로 끝나 머지가 통과하는 일이 없다"
    - "대체 판정은 로컬 HEAD가 아니라 원격이 알려 준 PR 헤드 sha로 한다. 로컬에 푸시하지 않은 코드 커밋이 더 있어도 PR 헤드가 문서만이면 통과한다"
    - "gh가 동작하면 결과가 이전과 같다. 기존 merge 테스트가 모두 통과하고, gh가 코드 PR이라고 하면 로컬 판정이 문서만이어도 exit 2다"
    - "문서 판정 규칙(awk)은 훅 안에 한 곳뿐이다. gh 경로와 대체 경로가 같은 awk를 쓴다"
    - "판정을 못 해 막을 때 메시지가 git fetch origin을 안내한다. 전체 테스트는 PASS=82 FAIL=0이고 실제 리포 .claude/gates/*.log는 바뀌지 않는다"
  artifacts:
    - path: ".claude/hooks/plant8-skill-gate.sh"
      provides: "merge 분기: gh가 없거나 실패하면 ls-remote로 PR 헤드를 특정하고 로컬 git diff로 문서만 판정하는 대체 경로"
      contains: "ls-remote origin"
    - path: ".claude/hooks/tests/plant8-skill-gate.test.sh"
      provides: "gh 없음·실패 회귀 테스트 11개와 안내 문구 테스트 1개. 로컬 bare 원격과 refs/pull/7/head로 네트워크 없이 재현한다"
      contains: "refs/pull/7/head"
  key_links:
    - from: "plant8-skill-gate.sh merge 분기의 gh 실패 쪽 else"
      to: "기존 docs-only awk(한 곳)"
      via: "대체 경로가 채운 pr_files를 gh 경로와 같은 awk에 넘긴다"
      pattern: "ls-remote origin"
    - from: "대체 경로의 git diff"
      to: "이름 바꾸기 옛 경로 검사"
      via: "--no-renames --name-only라서 이름 바꾸기가 옛 경로 삭제 + 새 경로 추가 두 줄로 나온다"
      pattern: "--no-renames"
    - from: "merge_hook 테스트 도우미"
      to: "훅의 대체 경로"
      via: "GH_STUB_RC=127(gh 없음) 또는 1(gh 실패)로 gh 경로를 끄고, 로컬 bare 원격의 refs/pull/7/head를 ls-remote가 읽는다"
      pattern: "GH_STUB_RC"
---

<objective>
머지 훅(.claude/hooks/plant8-skill-gate.sh의 `merge)` 분기)은 "문서만 바뀐 PR은 /qa 면제"를 `gh api`로만 판정한다. 클라우드 세션에는 gh가 없어서(`gh: command not found`) 목록이 비고 docs_only=0이 된다. 그래서 문서 PR인 #78도 /qa 기록을 요구받아 `mcp__github__merge_pull_request`가 막혔다(2026-09-26).

gh가 없거나 실패할 때 쓰는 대체 경로를 더한다. 이 경로도 같은 규칙으로 판정한다. 판정할 수 없으면 지금처럼 막는다. 추측으로 면제하지 않는다.

Purpose: 문서 PR에 쓸데없이 /qa를 돌리지 않게 한다. 코드 PR은 여전히 /qa 없이 머지되지 않는다.
Output: 훅의 merge 분기 수정과 회귀 테스트 12개를 fix: 커밋 한 번에 담는다.

계획 단계의 설계 결정(오케스트레이터가 제안한 내용과 다른 점과 그 이유):
1. PR은 `git ls-remote origin refs/pull/N/head`로 특정한다. 이 명령은 GitHub가 가진 PR 헤드 sha를 돌려준다. 제안된 방식은 "로컬 HEAD가 푸시되어 있으면 믿는다"였는데, 이 방식은 pullNumber와 로컬 브랜치를 묶어 주지 않는다. 세션 브랜치가 문서만 바꿨다면, 같은 세션에서 다른 코드 PR을 머지할 때도 면제가 나간다. 이 클라우드 환경에서 실제로 확인했다. `git ls-remote origin refs/pull/78/head`는 0.6초 만에 `<sha><TAB>refs/pull/78/head`를 돌려준다. 없는 PR 번호는 rc 0에 빈 출력이다.
2. diff는 로컬 HEAD가 아니라 그 PR 헤드 sha로 한다: `refs/remotes/origin/main...<head>`. sha는 커밋 내용 자체를 가리키므로 이 diff는 곧 그 PR의 내용이다. 그래서 푸시하지 않은 로컬 커밋은 판정에 들어가지 않는다. 제안의 "푸시 안 됨 → 막음" 대신 "PR 헤드 커밋이 로컬에 없음 → 막음"을 쓴다. 로컬 origin/main이 오래됐으면 diff가 실제보다 커질 뿐이다. 문서만인 PR이 막힐 수는 있어도 코드 PR이 면제되지는 않는다.
3. 이름 바꾸기의 옛 경로는 `--name-status -M`을 파싱하지 않고 `--no-renames --name-only`로 얻는다. 이러면 이름 바꾸기가 옛 경로 삭제와 새 경로 추가 두 줄로 나와 기존 awk에 그대로 들어간다.
4. expectedHeadSha는 payload에 있을 때 PR 헤드와 같은지 교차 확인만 한다. 이 값을 PR을 특정하는 근거로는 쓰지 않는다. 머지 도구가 이 값을 실제로 강제하는지 계획 단계에서 확인하지 못했기 때문이다.
5. gh가 동작하면(두 `gh api`가 모두 rc 0) 판정은 지금과 한 글자도 다르지 않다. 대체 경로는 gh가 없거나 실패할 때만 탄다.

Source audit(빠진 항목 없음):
| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | gh 없거나 실패해도 문서 PR 판정 | Task 1 |
| GOAL | 판정 불가 시 지금처럼 막음 | Task 1 (N4·N5·N6·N7·N10) |
| 제약 | 로컬 git 대체 경로 + PR 동일성 확인 | Task 1 (결정 1·2) |
| 제약 | 이름 바꾸기 옛 경로 포함 | Task 1 (N3, 결정 3) |
| 제약 | 같은 awk 재사용, 규칙 중복 금지 | Task 1 (grep 게이트) |
| 제약 | gh 동작 시 경로 불변 | Task 1 (기존 테스트 + N11) |
| 제약 | 새 의존성 없음, 판정에 파이프 없음 | Task 1 |
| 제약 | TDD(RED 확인 뒤 구현), 전체 테스트 파일 실행 | Task 1·2 |
| 제약 | 스킬 호출 명시(TDD·verification) | Task 1·2 |
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.claude/hooks/plant8-skill-gate.sh
@.claude/hooks/tests/plant8-skill-gate.test.sh

<interfaces>
훅(plant8-skill-gate.sh, 193줄):
- 24행 `set -euo pipefail`. 대체 경로에서 가드 없이 실패하는 명령이 하나라도 있으면 스크립트가 2가 아닌 코드로 끝난다. Claude Code는 이것을 막지 않는 오류로 보고 머지를 통과시킨다(fail-open). 기존 코드는 실패할 수 있는 명령마다 `|| true`를 붙인다.
- 27행 `payload="$(cat)"`, 63행 `project="${CLAUDE_PROJECT_DIR:-.}"`, 144-145행(bash 분기)은 cwd를 payload `.cwd`에서 읽고 비면 `$project`를 쓴다.
- 82행 `gate_has <skill>`: 현재 페이즈 게이트 로그에 그 스킬이 있는지 본다.
- 177-191행 merge 분기: 181행 `pr=` 조립, 182-183행 `gh api` 두 번(`|| true`), 184-188행 docs_only 판정. 186-187행의 awk가 유일한 문서 규칙이다: 탭으로 나눈 모든 필드가 `.planning/`·`.claude/gates/` 아래이거나, `.md`이면서 `.claude/` 아래가 아니고 CLAUDE.md가 아니어야 한다. 입력은 here-string이다(파이프 없음, SIGPIPE 방지). 189-190행은 최종 조건과 deny 메시지.
- settings.json의 merge 훅 timeout은 10초다. 훅이 시간 초과로 죽어도 fail-open이 된다.

테스트(plant8-skill-gate.test.sh, 498줄, 현재 기준 `PASS=70 FAIL=0`, 약 10초):
- 53-63행 `new_project`: 임시 git 리포. `current_phase: 4`이고 빈 init 커밋이 기본 브랜치에 있다.
- 117-121행 `write_gate_line <proj> <skill> <session>`: phase-04.log에 기록한다. 123-128행 `stage_file <proj> <rel> [content]`.
- 426-436행 gh 스텁: `GH_STUB_RC`가 0이 아니면 그 코드로 곧바로 끝난다. 437-439행 `payload_merge <session>`: tool_input은 owner "o", repo "r", pullNumber 7이다. 440-449행 `merge_hook <session> <project> <files> [gh rc] [changed_files]`: payload에 cwd가 없어서 훅은 `$project`(=CLAUDE_PROJECT_DIR)를 쓴다.
- 484행이 마지막 merge 테스트이고, 486행 `# Isolation` 블록이 실제 리포 게이트 로그가 그대로인지 확인한다.

계획 단계에서 실제로 확인한 것(읽기 전용):
- 이 리포에서 `git diff --no-renames --name-only origin/main...b1e6e2d`(PR #78 헤드)를 돌리면 38줄이 나오고 전부 .planning/·.claude/gates/다.
- PR #82 헤드 커밋은 로컬에 없다. diff는 `fatal: Invalid symmetric difference expression`을 내고 0이 아닌 코드로 끝난다.
- `timeout`은 /usr/bin/timeout에 있고, git은 2.43.0이다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: gh 없이 문서 PR 판정. RED 회귀 테스트 11개를 먼저 쓰고, 대체 경로를 구현해 GREEN</name>
  <files>.claude/hooks/tests/plant8-skill-gate.test.sh, .claude/hooks/plant8-skill-gate.sh</files>
  <precondition>사용자가 채팅에 훅 수정 승인을 직접 쳤다. 확인 방법: .claude/hooks/ 아래 파일을 처음 Edit할 때 plant8-rule-guard가 「훅 스크립트·settings.json 수정은 사용자가 채팅에 직접 친 승인이 필요하다」로 막지 않아야 한다. 막히면 멈춘다. 무엇을 왜 바꾸는지 적고, 사용자의 「훅 고쳐」를 받는 체크포인트로 돌아간다. 가드를 우회하지 않는다.</precondition>
  <behavior>
    gh 스텁 rc 127은 gh 없음, rc 1은 gh 실패다. 대체 경로 판정은 origin/main과 PR 헤드의 diff로 한다. 모든 프로젝트에는 review 게이트 기록만 있고 qa 기록은 없다.
    - N1 「merge(gh 없음): 문서만 바뀐 PR + review만 -> 통과」: owner/repo가 o/r인 원격. PR 헤드에서 docs/x.md와 .planning/quick/x.md만 바뀜. rc 127 → 0
    - N11 「merge(gh 동작): gh가 코드 PR이라 하면 로컬 판정과 무관하게 -> exit 2」: N1과 같은 프로젝트. gh rc 0, 목록 app/page.tsx → 2
    - N8 「merge(gh 실패): expectedHeadSha가 PR 헤드와 같음 -> 통과」: N1 프로젝트. gh rc 1, expectedHeadSha = PR 헤드 sha → 0
    - N7 「merge(gh 없음): expectedHeadSha가 PR 헤드와 다름 -> exit 2」: N1 프로젝트. expectedHeadSha = main sha → 2
    - N9 「merge(gh 없음): 로컬 HEAD에 푸시 안 한 코드 커밋이 있어도 PR 헤드가 문서만 -> 통과」: N1 프로젝트에 app/extra.ts를 커밋만 하고 푸시하지 않음 → 0
    - N2 「merge(gh 없음): 코드 파일 섞인 PR + review만 -> exit 2」: PR 헤드에 docs/x.md와 app/page.tsx → 2
    - N3 「merge(gh 없음): 코드를 문서로 이름 바꾼 PR + review만 -> exit 2」: `git mv app/moved.ts docs/moved.md` → 2
    - N4 「merge(gh 없음): PR 헤드 커밋이 로컬에 없음 -> exit 2」: 다른 클론에서 만든 문서 커밋을 refs/pull/7/head로 푸시 → 2
    - N5 「merge(gh 없음): origin에 refs/pull/7/head 없음 -> exit 2」: 문서 커밋을 브랜치로만 푸시 → 2
    - N6 「merge(gh 없음): origin이 payload owner/repo와 다름 -> exit 2」: 원격 경로가 .../x/y.git이고 PR 헤드는 문서만 → 2
    - N10 「merge(gh 없음): 로컬에 origin/main이 없음 -> exit 2」: 문서 PR을 푸시한 뒤 `git update-ref -d refs/remotes/origin/main` → 2
    - RED(훅 수정 전): 정확히 N1·N8·N9 세 개만 FAIL, 결과 `PASS=78 FAIL=3`. GREEN(훅 수정 뒤): `PASS=81 FAIL=0`
  </behavior>
  <action>
먼저 Skill 도구로 `test-driven-development`(Superpowers)를 호출한다(CLAUDE.md §4·§5). RED 결과가 behavior와 다르거나 GREEN이 실패하면, 원인을 쫓거나 코드를 고치기 전에 Skill 도구로 `systematic-debugging`을 호출한다.

[RED — 테스트 파일만 고친다]
1. `payload_merge`에 선택 인자 두 번째(`sha`)를 더한다. 값이 있을 때만 tool_input에 `expectedHeadSha`를 넣고, 없으면 지금과 같은 JSON을 만든다. `merge_hook`은 선택 인자 여섯 번째를 `payload_merge`의 두 번째 인자로 넘긴다. 440행 인자 설명 주석에 `$6=expectedHeadSha`를 더한다. 기존 호출은 바꾸지 않는다.
2. 484행 뒤, `# Isolation` 블록 앞에 새 구역을 연다. 구역 머리 주석은 "merge: gh가 없거나 실패하면 origin ls-remote의 PR 헤드 커밋을 로컬 git diff로 판정"으로 쓴다. 이 구역에만 쓰는 도우미를 둔다.
   - `pr_project <owner> <repo>`: `new_project`로 리포를 만들고 review 게이트 줄을 쓴다(`write_gate_line`). `$(mktemp -d "$TMPDIR/remote.XXXXXX")/<owner>/<repo>.git`에 `git init -q --bare`로 원격을 만들어 origin으로 등록한다. app/moved.ts를 커밋하고 `git branch -M main`, `git push -q origin main`, `git checkout -q -b feature`를 차례로 한다. 끝에 프로젝트 경로만 출력한다. git 명령의 stdout은 모두 /dev/null로 보내야 `$(pr_project …)`에 경로만 담긴다.
   - `pr_commit <proj> <rel>`: `stage_file` 뒤 `git commit -q`.
   - `pr_push <proj>`: `git push -q -f origin HEAD:refs/pull/7/head`.
   - `pr_clone <proj>`: 그 프로젝트의 origin을 `git clone -q -b main`으로 임시 폴더에 받는다. user.name·user.email을 설정하고 경로를 출력한다. `-b main`이 없으면 bare 원격의 HEAD가 가리키는 브랜치가 없어 체크아웃이 안 된다.
3. behavior의 N1·N11·N8·N7·N9를 한 프로젝트(o/r)에서 이 순서로 쓴다. N9가 로컬 HEAD를 옮기므로 마지막에 둔다. N8·N7의 sha는 `git -C <proj> rev-parse` 결과를 쓴다(N8은 PR 헤드, N7은 main). N2·N3·N4·N5·N6·N10은 각각 새 프로젝트에서 쓴다. 테스트 이름은 behavior의 「」 안 문구를 그대로 쓰고, 판정은 모두 `expect_rc`로 한다.
4. `bash .claude/hooks/tests/plant8-skill-gate.test.sh`를 돌려 RED를 확인한다. `PASS=78 FAIL=3`이어야 하고, FAIL 줄 셋은 N1·N8·N9 이름이어야 한다. 다르면 구현으로 넘어가지 말고 테스트부터 바로잡는다.

[GREEN — 훅 merge 분기만 고친다]
5. 181행 `pr=` 줄은 그대로 둔다. 182-188행은 이렇게 바꾼다. `docs_only=0`으로 시작한다. 조건문 `if pr_files="$(gh api …)" && pr_changed="$(gh api …)"`는 두 gh 호출 모두 지금과 같은 인자와 `2>/dev/null`로 쓴다. then 쪽은 지금의 목록 수 검사를 그대로 둔다. 비었거나 수가 다르면 pr_files를 비운다. else 쪽은 대체 경로로, pr_files를 채우거나 비운 채로 둔다. 그 뒤 `[ -n "$pr_files" ]`일 때만 기존 awk(186-187행 그대로)를 돌려 docs_only=1로 만든다. awk와 규칙은 옮기기만 하고 복사하거나 고치지 않는다.
6. 대체 경로(else 안, 한 번만 쓰이니 함수로 빼지 않는다)는 다음 순서로 가드한다. 가드 하나라도 실패하면 pr_files는 빈 채로 남는다.
   a. cwd는 payload `.cwd`에서 읽고, 비면 `$project`를 쓴다(bash 분기와 같은 방식). owner, repo, pullNumber, expectedHeadSha는 `.tool_input`에서 `// empty`로 읽는다.
   b. pullNumber는 숫자로만 이뤄져야 하고, owner와 repo는 비어 있으면 안 된다. `git -C "$cwd" config --get remote.origin.url`에서 끝의 `.git`을 뗀 값이 `/owner/repo` 또는 `:owner/repo`로 끝나야 한다. 비교할 때 owner/repo는 따옴표로 감싸 글자 그대로 맞춘다.
   c. `GIT_TERMINAL_PROMPT=0 timeout 5 git -C "$cwd" ls-remote origin "refs/pull/$pullNumber/head"`의 출력을 out에 받는다. head는 out에서 첫 탭 앞부분이다. out이 정확히 head + 탭 + `refs/pull/<N>/head` 한 줄이고 head가 소문자 16진 40자일 때만 계속한다. expectedHeadSha가 있으면 head와 같아야 한다. 훅 전체 timeout이 10초라서 5초 제한과 터미널 프롬프트 차단은 필수다. 넘기면 fail-open이 된다. 훅 안에서 git fetch는 하지 않는다.
   d. `git -C "$cwd" -c core.quotePath=false diff --no-renames --name-only "refs/remotes/origin/main...$head"`의 결과를 pr_files에 담는다. 이 명령이 실패하면 pr_files를 비운다(`|| pr_files=""`). 한글 경로 문서도 인식하도록 quotePath를 끈다. 이름 바꾸기 옛 경로는 --no-renames로 얻는다(결정 3). `origin/main` 대신 `refs/remotes/origin/main`으로 완전히 적는 이유는, 같은 이름의 로컬 브랜치가 먼저 해석되지 않게 하려는 것이다.
   e. set -e 규칙: 대체 경로 안에서 실패할 수 있는 명령(git config, ls-remote, diff, jq)은 모두 `|| true` 또는 if 조건 안에 둔다. 파이프(`|`)는 쓰지 않는다. 출력은 명령 치환과 here-string·매개변수 확장으로만 다룬다.
7. 178-180행 주석을 새 동작에 맞게 고친다. gh가 우선이다. gh가 없거나 실패하면 origin ls-remote의 PR 헤드 sha와 로컬 origin/main의 diff(옛 경로 포함)에 같은 규칙을 쓴다. origin이 owner/repo와 다르거나, PR 헤드나 origin/main이 로컬에 없거나, expectedHeadSha가 다르면 판정하지 않고 막는다. 22행 헤더와 189-190행은 이 태스크에서 건드리지 않는다.
8. 전체 테스트 파일을 다시 돌려 `PASS=81 FAIL=0`을 확인한다. 이 태스크에서는 커밋하지 않는다(Task 2에서 한 번).
  </action>
  <verify>
    <automated>bash -n .claude/hooks/plant8-skill-gate.sh && bash .claude/hooks/tests/plant8-skill-gate.test.sh && test "$(grep -cF '(\.planning|\.claude\/gates)\/' .claude/hooks/plant8-skill-gate.sh)" = 1 && grep -q 'ls-remote origin' .claude/hooks/plant8-skill-gate.sh && grep -q -- '--no-renames' .claude/hooks/plant8-skill-gate.sh</automated>
  </verify>
  <done>RED 실행에서 정확히 N1·N8·N9 세 개가 실패하는 것(`PASS=78 FAIL=3`)을 확인하고 실행 기록에 남겼다. 훅 수정 뒤 전체 테스트는 `PASS=81 FAIL=0`, rc 0이다. 문서 규칙 awk 정규식은 훅에 한 번만 나온다. 기존 merge 테스트 13개가 모두 그대로 통과한다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 판정을 못 해 막을 때 git fetch origin 안내. 실환경 확인 후 커밋</name>
  <files>.claude/hooks/tests/plant8-skill-gate.test.sh, .claude/hooks/plant8-skill-gate.sh</files>
  <behavior>
    - N12 「merge(gh 없음): 판정 못 하면 메시지에 git fetch origin 안내」: N10(로컬에 origin/main 없음)의 HOOK_STDERR에 `git fetch origin`이 들어 있다(`expect_contains`). RED 결과 `PASS=81 FAIL=1`, GREEN 결과 `PASS=82 FAIL=0`
  </behavior>
  <action>
Task 1에서 부른 `test-driven-development`의 규율을 그대로 따른다. 새 에이전트 컨텍스트라면 Skill 도구로 다시 호출한다.

1. RED: N10 expect_rc 바로 뒤에 N12 `expect_contains`를 더하고 전체 테스트를 돌려 `PASS=81 FAIL=1`(N12만 실패)을 확인한다.
2. GREEN: 190행 deny 메시지 끝에 한 문장을 덧붙인다. "gh가 없으면 PR 헤드 커밋과 origin/main이 로컬에 있어야 문서 PR로 판정한다(git fetch origin)." 대체 경로가 판정하지 못했을 때 에이전트가 쓸데없이 /qa를 돌리지 않고 fetch 뒤 다시 시도하게 하려는 것이다(#78 사고의 재발 방지). 메시지 앞부분과 최종 조건식은 바꾸지 않는다. 전체 테스트는 `PASS=82 FAIL=0`이어야 한다.
3. 실환경 확인(읽기 전용, 이 클라우드 세션에서): 새 임시 폴더를 `TMPDIR`로 잡고 훅을 직접 부른다. 먼저 record-skill 이벤트로 세션 페이즈를 06으로 맞춘다. payload는 session_id가 같고 tool_input이 `{skill:"gsd-plan-phase", args:"06"}`인 것을 쓴다. phase-06.log에는 review가 있고 qa가 없다. 이 동작은 TMPDIR에만 쓰고 게이트 로그는 건드리지 않는다. 이어서 같은 session_id로 merge 이벤트를 보낸다. tool_input은 `{owner:"rrangjaa-eng", repo:"ERP_PLANT8_260917", pullNumber:78}`이고 기대값은 rc 0(문서만)이다. `pullNumber:82`는 rc 2다(코드 PR, 헤드가 로컬에 없음). gh가 있는 환경이면 gh 경로로도 같은 결과가 나와야 한다. 네트워크 문제로 78이 2가 나오면 고치지 말고 그 출력을 SUMMARY에 그대로 적는다. 끝나면 `git status --short -- .claude/gates`가 비어 있는지 확인한다.
4. "완료"라고 말하거나 커밋하기 전에 Skill 도구로 `verification-before-completion`을 호출한다(스킬 관문이 커밋을 막는다). 그 규율대로 전체 테스트, `bash -n`, 3번 결과를 새로 실행한 출력으로 확인한다.
5. 두 파일만 스테이징해 커밋 한 번을 만든다. 제목은 영어 접두어로 `fix: judge docs-only merges without gh via ls-remote + local diff`, 본문은 한국어로 원인(gh 없음 → 목록 비어 docs_only=0), 대체 경로와 동일성 가드, 판정 불가 시 막음, 테스트 수(70 → 82)를 적는다. 세션 attribution 줄을 붙인다. 이 커밋에 .planning/ 파일은 넣지 않는다.
  </action>
  <verify>
    <automated>bash -n .claude/hooks/plant8-skill-gate.sh && bash .claude/hooks/tests/plant8-skill-gate.test.sh && grep -q 'git fetch origin' .claude/hooks/plant8-skill-gate.sh && test -z "$(git status --short -- .claude/gates)"</automated>
  </verify>
  <done>N12의 RED(`PASS=81 FAIL=1`)와 GREEN(`PASS=82 FAIL=0`)을 확인했다. 실환경에서 PR 78은 rc 0, PR 82는 rc 2였다(또는 네트워크 실패 출력을 SUMMARY에 그대로 남겼다). verification-before-completion 호출 뒤 두 파일만 담은 fix: 커밋 하나가 있고, 실제 .claude/gates/*.log는 바뀌지 않았다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 에이전트 → 훅(payload) | owner·repo·pullNumber·expectedHeadSha·cwd는 모델이 채운 값이다. 믿지 않고 검증한다 |
| 로컬 git → 훅 | 로컬 refs와 객체는 에이전트가 바꿀 수 있다. 커밋 객체 sha는 내용 자체를 가리키지만 refs는 그렇지 않다 |
| GitHub(ls-remote) → 훅 | PR 번호와 헤드 sha를 묶어 주는 유일한 근거다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-fqc-01 | Elevation | merge 대체 경로 PR 특정 | high | mitigate | 로컬 HEAD·브랜치가 아니라 `ls-remote origin refs/pull/N/head`의 sha로 diff한다. 출력은 정확히 한 줄 + 40자 16진이어야 한다. 테스트 N4·N5·N9 |
| T-fqc-02 | Spoofing | payload owner/repo | medium | mitigate | origin URL이 `/owner/repo`(또는 `:owner/repo`)로 끝나야 한다. 테스트 N6 |
| T-fqc-03 | Tampering | pullNumber 주입(ref 패턴·경로) | medium | mitigate | 숫자로만 이뤄졌는지 확인하고 ls-remote 출력의 ref 이름을 정확히 비교한다 |
| T-fqc-04 | Denial of Service → fail-open | ls-remote 지연·자격 증명 프롬프트, set -e 조기 종료 | high | mitigate | `timeout 5` + `GIT_TERMINAL_PROMPT=0`을 쓰고, 실패할 수 있는 명령은 모두 가드한다. 테스트는 rc가 정확히 2인지 본다(N4·N5·N10, 기존 "목록 못 읽음"은 origin 없음) |
| T-fqc-05 | Tampering | 이름 바꾸기로 코드 경로 숨기기 | medium | mitigate | `--no-renames`로 옛 경로도 awk에 넣는다. 테스트 N3 |
| T-fqc-06 | Tampering | 로컬 refs/remotes/origin/main 조작 | low | accept | 이 훅은 절차를 빼먹지 않게 하는 관문이지 적대적 방어가 아니다(게이트 로그도 리포 파일이다). 조작하지 않은 오래된 origin/main은 diff를 키울 뿐이다(막는 쪽). /review는 계속 필요하다 |
| T-fqc-07 | Tampering | 판정과 머지 사이 PR 갱신(경쟁) | low | accept | gh 경로에도 똑같이 있는 한계다. expectedHeadSha가 있으면 PR 헤드와 같은지 확인한다(N7·N8) |
| T-fqc-08 | Tampering | main이 아닌 base로 연 PR | low | accept | 이 리포의 PR은 모두 main으로 간다. 틀려도 /qa 면제에만 영향이 있고 /review는 그대로다 |
| T-fqc-09 | Information Disclosure | 테스트가 실제 리포 게이트 로그를 건드림 | low | mitigate | 모든 테스트 리포와 원격은 TMPDIR 안에 둔다. 기존 Isolation 검사를 유지하고, Task 2는 `git status -- .claude/gates`를 확인한다 |

새 의존성이 없으므로 패키지 설치 공급망 항목(T-SC)은 해당하지 않는다.
</threat_model>

<verification>
- `bash .claude/hooks/tests/plant8-skill-gate.test.sh` → `PASS=82 FAIL=0`, rc 0(기존 70 + 신규 12)
- `bash -n .claude/hooks/plant8-skill-gate.sh` 통과
- 훅의 문서 규칙 awk 정규식은 한 번만 나온다(`grep -cF '(\.planning|\.claude\/gates)\/'` = 1)
- 실환경: PR 78 → rc 0, PR 82 → rc 2(이 세션 기준)
- `git status --short -- .claude/gates` 비어 있음, 커밋 하나에 두 파일만
- 이후 절차(오케스트레이터 몫, 이 플랜 밖): PR은 CLAUDE.md §4 Post-build(/review → 해당 시 /cso → /ship)를 거쳐 머지한다. 이 변경은 게이트(권한) 로직이다
</verification>

<success_criteria>
- gh가 없는 클라우드 세션에서 문서만 바뀐 PR은 /review 기록만으로 머지 훅을 통과한다
- 코드가 섞였거나, 이름 바꾸기로 코드를 숨겼거나, PR을 특정할 수 없으면 /qa 없이는 여전히 exit 2다
- gh가 있으면 판정이 이전과 같다
- 회귀 테스트 12개가 RED를 거쳐 GREEN이 되었고 전체 파일이 초록이다
</success_criteria>

<output>
Create `.planning/quick/260926-fqc-fix-merge-gate-docs-only-check-without-g/260926-fqc-SUMMARY.md` when done
</output>
