---
phase: quick-260924-hgx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - repositories/team-memberships.ts
  - repositories/teams.ts
  - repositories/roles.ts
  - domain/org/index.ts
  - domain/people/index.ts
  - test/integration/people.test.ts
autonomous: true
requirements: [QUICK-260924-hgx, ISSUE-56]

estimate:
  tokens: 50000
  raw_tokens: 50000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "사람이 1명이든 4명이든 listPeople(SYSTEM_VIEWER)가 여는 DB 조회(pool.query) 횟수가 같다. 「사람이 늘어도 DB 조회 횟수가 그대로다」 테스트가 통과한다(수정 전 19 vs 67로 실패)"
    - "목록의 현재 소속은 오늘까지 발령된 가장 최근 팀이다. 미래 발령은 반영되지 않고, 발령이 없는 사람의 currentTeamId/currentTeamName은 null이며, 계급명이 채워진다"
    - "listPeople의 한 항목이 getPerson(...).person과 deep-equal이다. 목록과 상세의 PersonDto 모양·값이 같다"
    - "필드 노출은 여전히 viewer 계급의 visible() 판정을 따른다. 메모이즈 캐시는 listPeople 한 번 호출 안에만 있고 모듈 전역에 두지 않는다"
    - "getPerson · teamAtDate · project() · visible()의 시그니처와 동작이 그대로다. 기존 단위·통합 테스트(team-at-date, team-memberships, people, corp-card-owner-archived)가 통과한다"
    - "DB 마이그레이션·UI·새 의존성 변경이 없다"
  artifacts:
    - path: "repositories/team-memberships.ts"
      provides: "findMembershipsAtDate(viewer, userIds, date): 사람별로 발령일 ≤ date 중 가장 늦은 한 행을 한 번의 조회로 가져온다(selectDistinctOn). ids가 비면 []"
      contains: "selectDistinctOn"
    - path: "repositories/teams.ts"
      provides: "findTeamsByIds(viewer, ids): inArray 한 번 조회, 보관 여부로 거르지 않는다. ids가 비면 []"
      contains: "inArray(teams.id"
    - path: "repositories/roles.ts"
      provides: "findRolesByIds(viewer, ids): inArray 한 번 조회, 보관 여부로 거르지 않는다. ids가 비면 []"
      contains: "inArray(roles.id"
    - path: "domain/org/index.ts"
      provides: "teamsAtDate(viewer, userIds, date, deps?): Map<userId, TeamDto>. teamAtDate와 같은 의미이고 TEAM_DTO_SPEC으로 투영하며 deps.visible을 project()에 넘긴다"
      contains: "export async function teamsAtDate"
    - path: "domain/people/index.ts"
      provides: "listPeople이 팀·계급을 묶음 조회하고, 호출 한 번짜리 메모이즈 visible로 PersonDto를 투영한다. getPerson은 사람 한 명 조회를 그대로 쓴다"
      contains: "teamsAtDate"
    - path: "test/integration/people.test.ts"
      provides: "이슈 #56 회귀 테스트 2개(이미 작성되어 있고 아직 커밋되지 않았다). 수정하지 않고 그대로 커밋한다"
      contains: "listPeople — 조회 횟수와 현재 소속(이슈 #56)"
  key_links:
    - from: "domain/people/index.ts listPeople"
      to: "domain/org/index.ts teamsAtDate"
      via: "사람 id 배열 + 오늘 날짜 + { visible: 메모이즈 함수 }"
      pattern: "teamsAtDate\\("
    - from: "domain/people/index.ts listPeople"
      to: "repositories/roles.ts findRolesByIds"
      via: "사람 행의 null이 아닌 roleId 중복 제거 배열"
      pattern: "RolesByIds\\("
    - from: "domain/org/index.ts teamsAtDate"
      to: "repositories/team-memberships.ts findMembershipsAtDate + repositories/teams.ts findTeamsByIds"
      via: "발령 행의 teamId 중복 제거 배열"
      pattern: "findMembershipsAtDate\\("
    - from: "domain/people/index.ts listPeople"
      to: "domain/permissions/project.ts project(..., { visible })"
      via: "PERSON_DTO_SPEC 투영에 메모이즈 visible 전달(project()·visible() 자체는 수정하지 않는다)"
      pattern: "visible"
---

<objective>
GitHub 이슈 #56. /admin/people 목록(listPeople)의 N+1 조회를 없앤다. 지금은 사람 한 명마다 팀 발령(1) + 팀(1) + TEAM_DTO_SPEC 노출 판정(5) + 계급(1) + PERSON_DTO_SPEC 노출 판정(8)을 따로 조회해 1인당 16쿼리가 나간다. 로컬 190명 기준으로는 3043쿼리, 706 ms다. 수정 후에는 사람 수와 무관하게 조회 횟수가 일정해야 한다.

Purpose: 목록 화면 응답 시간이 사람 수에 비례해 늘어나는 문제를 없앤다. 반환하는 PersonDto의 모양·값·노출 규칙은 그대로다.

Output: 묶음 조회 리포지토리 함수 3개, domain/org의 teamsAtDate, listPeople 재배선을 한 커밋(fix:)으로 만든다. 이미 작성된 RED 테스트도 같은 커밋에 넣는다.

Design은 오케스트레이터가 정했다. 계획은 그 설계를 그대로 따르고 가장 작게 구현한다. project()·visible()을 전역으로 바꾸지 않고, getPerson 동작도 바꾸지 않는다.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@domain/people/index.ts
@domain/org/index.ts
@repositories/team-memberships.ts
@repositories/teams.ts
@repositories/roles.ts
@domain/permissions/project.ts
@domain/permissions/visible.ts

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 계획자가 뽑아 둔 계약 -->

domain/permissions/project.ts (수정 금지):
- export type ProjectDeps = { visible: typeof defaultVisible }
- export async function project<Row, Dto>(viewer, row, spec: DtoSpec<Row, Dto>, deps?: Partial<ProjectDeps>): Promise<Partial<Dto>>
  spec.fields를 순서대로 돌며 필드마다 visibleFn(viewer, field.infoItem)을 await한다. 원본에 from 키가 없으면 건너뛴다.

domain/permissions/visible.ts (수정 금지):
- export async function visible(viewer: Viewer, infoItem: string, deps?: Partial<VisibleDeps>): Promise<boolean>
  viewer.roleId가 없으면 false다. 있으면 findVisibility(viewer, viewer.roleId, infoItem)로 DB를 1회 조회한다.

domain/org/index.ts (현재):
- TEAM_DTO_SPEC: 필드 5개 모두 infoItem "team.value"
- teamAtDate(viewer, userId, date, deps?: Partial<TeamAtDateDeps>): Promise<TeamDto | null>
  membership이 없으면 null, team이 없으면 null, 그 밖에는 project(viewer, team, TEAM_DTO_SPEC)를 돌려준다. 이 함수는 그대로 둔다.
- 이미 import하는 것: project, type DtoSpec from "@/domain/permissions/project"; findTeamById as defaultFindTeamById (teams); findMembershipAtDate as defaultFindMembershipAtDate (team-memberships)

domain/people/index.ts (현재):
- PERSON_DTO_SPEC: infoItem은 person.value(5) · role.value(1) · team.value(2)
- type PersonSource = UserRow & { roleName; currentTeamId; currentTeamName }
- toPersonDto(viewer, row): teamAtDate(viewer, row.id, todayIsoDate())와 findRoleById를 부른 뒤 source를 만들고 project(viewer, source, PERSON_DTO_SPEC)를 돌려준다. getPerson과 listPeople이 둘 다 이 함수를 쓴다.
- listPeople(viewer): scopeFor(viewer, "user") 다음 repoListUsers를 부르고, rows.map(toPersonDto)를 Promise.all로 돈다

repositories 스타일:
- roles.ts는 함수마다 첫 줄에 `void viewer;`가 있고, teams.ts·team-memberships.ts에는 없다. 파일별 기존 스타일을 따른다.
- 묶음 조회 선례: repositories/quote-lines.ts findQuoteLinesByIds(ids가 비면 즉시 [], 그 밖에는 inArray)
- selectDistinctOn 선례: repositories/projects.ts currentRevisionsSubquery(`db.selectDistinctOn([col], ...)`, `.orderBy(col, desc(...))`)
- team_memberships에는 unique(userId, effectiveFrom)이 있어 DISTINCT ON 결과가 결정적이다.
- eslint plant8/repository-viewer-param: repositories의 export 함수는 첫 인자가 viewer여야 한다.
- eslint plant8/no-row-type-escape: domain의 export 함수 반환 타입에 *Row 이름 타입이 나오면 안 된다(Map<string, TeamDto>는 괜찮다).
- eslint boundaries: domain → domain/repositories/lib만 import할 수 있다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: RED 확인 → 목록 경로 묶음 조회(리포지토리 → teamsAtDate → listPeople)로 GREEN</name>
  <files>repositories/team-memberships.ts, repositories/teams.ts, repositories/roles.ts, domain/org/index.ts, domain/people/index.ts</files>
  <read_first>test/integration/people.test.ts (147행 이후의 이슈 #56 describe 블록. 이미 작성되어 있고 수정하지 않는다), repositories/projects.ts 11-22행(selectDistinctOn 선례), repositories/quote-lines.ts 20-27행(inArray 묶음 조회 선례)</read_first>
  <precondition>로컬 Postgres가 떠 있어야 한다(`pnpm db:dev`). 통합 테스트는 테스트마다 모든 표를 TRUNCATE한다(test/integration/setup.ts)</precondition>
  <behavior>
    - 테스트 1 「사람이 늘어도 DB 조회 횟수가 그대로다」: 1명일 때와 4명일 때 listPeople의 pool.query 호출 수가 같다. 지금은 19 vs 67로 실패하는데, 이것이 RED다
    - 테스트 2 「현재 소속은 오늘까지 발령된 가장 최근 팀이고 미래 발령은 아직 반영되지 않는다」: 2020-01-01·2021-06-01·2999-01-01 세 발령 중 2021-06-01 팀이 현재 소속이다. 발령이 없는 사람은 null이고, 목록 항목과 getPerson().person이 deep-equal이다. 지금도 통과하는 특성화 테스트이고 수정 뒤에도 통과해야 한다
  </behavior>
  <action>
먼저 test-driven-development 스킬을 호출한다. 그다음 RED를 실제로 확인한다. `pnpm vitest run --project integration test/integration/people.test.ts -t "사람이 늘어도"`가 「expected N to be M」 형태로 실패하는지 본다. 실패 이유가 조회 횟수 불일치가 아니면(DB 연결 실패 등) 구현하지 말고 systematic-debugging 스킬로 원인부터 찾는다. 테스트 파일은 고치지 않는다.

① repositories/team-memberships.ts에 findMembershipsAtDate(viewer: Viewer, userIds: string[], date: string): Promise<TeamMembershipRow[]>를 findMembershipAtDate 바로 아래에 추가한다.
- userIds가 비면 조회 없이 []를 돌려준다.
- 쿼리는 db.selectDistinctOn([teamMemberships.userId])이다. 조건은 and(inArray(teamMemberships.userId, userIds), lte(teamMemberships.effectiveFrom, date)), 정렬은 orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))다. DISTINCT ON 키가 ORDER BY 맨 앞에 와야 한다.
- drizzle-orm import에 inArray를 더한다.
- 한국어 주석 한두 줄: 「사람별로 발령일 ≤ date 중 가장 늦은 한 행을 한 번에 가져온다(목록 N+1 제거, 이슈 #56). unique(userId, effectiveFrom)이라 결정적이다」.

② repositories/teams.ts에 findTeamsByIds(viewer: Viewer, ids: string[]): Promise<TeamRow[]>를 findTeamById 아래에 추가한다.
- ids가 비면 []를 돌려준다. 그 밖에는 db.select().from(teams).where(inArray(teams.id, ids))다.
- 보관된 팀도 거르지 않는다. findTeamById와 의미를 맞춘다. 현재 소속이 보관된 팀이어도 지금처럼 이름이 나와야 한다.
- import에 inArray를 더한다.

③ repositories/roles.ts에 findRolesByIds(viewer: Viewer, ids: string[]): Promise<RoleRow[]>를 findRoleById 아래에 추가한다.
- 이 파일 관례대로 첫 줄은 `void viewer;`다. ids가 비면 []를 돌려준다. 그 밖에는 inArray(roles.id, ids)다.
- 보관된 계급도 거르지 않는다. findRoleById와 의미를 맞춘다.

④ domain/org/index.ts에 teamsAtDate(viewer: Viewer, userIds: string[], date: string, deps?: Partial<ProjectDeps>): Promise<Map<string, TeamDto>>를 teamAtDate 바로 아래에 추가한다.
- ProjectDeps는 "@/domain/permissions/project"의 기존 import 줄에 type으로 더한다. findMembershipsAtDate와 findTeamsByIds도 기존 import 블록에 더하고, 파일의 alias 관례를 따른다.
- 동작 순서: findMembershipsAtDate로 발령 행을 받는다. 행의 teamId를 중복 없이 모아 findTeamsByIds를 한 번 부른다. 팀마다 project(viewer, team, TEAM_DTO_SPEC, deps)를 한 번씩 해서 teamId → TeamDto 맵을 만든다. 마지막으로 발령 행마다 userId → 해당 팀 TeamDto를 담은 Map을 돌려준다.
- 발령이 없거나(전부 미래 포함) 팀 행이 없는 사람은 Map에 넣지 않는다. 호출자는 이를 null로 다룬다. teamAtDate와 같은 의미다.
- 주석에는 「teamAtDate의 묶음판. deps.visible로 호출자가 노출 판정을 메모이즈할 수 있다」를 적는다.
- teamAtDate와 TeamAtDateDeps는 건드리지 않는다.

⑤ domain/people/index.ts
- 원본 합성과 투영을 한 곳에 모으는 비공개 헬퍼를 둔다. 이름은 projectPerson(viewer, row, team: TeamDto | null | undefined, roleName: string | null, deps?: Partial<ProjectDeps>)이다. 기존 toPersonDto의 PersonSource 합성(roleName, currentTeamId: team?.id ?? null, currentTeamName: team?.name ?? null)을 그대로 옮기고 project(viewer, source, PERSON_DTO_SPEC, deps)를 돌려준다.
- toPersonDto는 기존 lookup(teamAtDate + findRoleById)을 그대로 둔 채 이 헬퍼에 위임한다. 그래서 getPerson 동작은 바뀌지 않고, 목록과 상세의 DTO 모양은 한 곳에서 정해진다(테스트 2의 deep-equal 보장).
- listPeople은 scope·rows를 지금처럼 구한다. 그다음 호출 안 지역 변수로 캐시를 만든다. Map<string, Promise<boolean>>이고 키는 infoItem이다. 이 캐시를 쓰는 메모이즈 함수(viewer, infoItem)는 캐시에 없으면 visible(viewer, infoItem)의 Promise를 저장한 뒤 돌려준다. Promise를 저장하므로 동시에 들어온 같은 infoItem 요청도 한 번만 조회한다.
- 캐시는 반드시 listPeople 함수 안에 둔다. 모듈 전역에 두면 다른 viewer·계급의 판정이 섞이고 노출표 변경을 무시하게 된다(T-q56-01). 주석에 「viewer가 호출 동안 고정이라 infoItem만 키로 쓴다」를 적는다.
- visible은 "@/domain/permissions/visible"에서, ProjectDeps 타입은 기존 project import 줄에서 가져온다.
- 오늘 날짜를 한 번 구한다. 그다음 Promise.all로 두 조회를 동시에 한다. 하나는 teamsAtDate(viewer, rows의 id 배열, 오늘, { visible: 메모이즈 함수 })이고, 다른 하나는 findRolesByIds(viewer, rows의 null이 아닌 roleId 중복 제거 배열)이다. 계급은 id → name 맵으로 바꾼다.
- 마지막으로 rows를 Promise.all로 돌며 projectPerson(viewer, row, teamMap.get(row.id), row.roleId ? roleNameMap.get(row.roleId) ?? null : null, { visible: 메모이즈 함수 })를 부른다.
- listPeople 위에 이슈 #56 한 줄 주석을 더한다. 「사람마다 팀·계급·노출표를 따로 조회하던 N+1을 묶음 조회 + 호출 한정 메모로 바꿨다」.
- 새 import는 기존 import 블록의 default* alias 관례를 따른다.
- any를 쓰지 않는다. project(), visible(), PERSON_DTO_SPEC, registerDto 호출은 바꾸지 않는다.

그다음 GREEN을 확인한다. `pnpm vitest run --project integration test/integration/people.test.ts`에서 이슈 #56 테스트 2개를 포함한 파일 전체가 통과해야 한다. 실패하면 추측으로 고치지 말고 systematic-debugging 스킬로 원인을 찾는다.
  </action>
  <verify>
    <automated>pnpm vitest run --project integration test/integration/people.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 구현 전 `-t "사람이 늘어도"` 실행이 조회 횟수 불일치로 실패한 출력을 SUMMARY에 한 줄로 인용한다(RED 증거)
    - 구현 후 test/integration/people.test.ts가 전부 통과한다(GREEN)
    - `grep -c "export async function findMembershipsAtDate" repositories/team-memberships.ts`가 1이다
    - `grep -c "export async function findTeamsByIds" repositories/teams.ts`가 1이고, `grep -c "export async function findRolesByIds" repositories/roles.ts`가 1이다
    - `grep -c "export async function teamsAtDate" domain/org/index.ts`가 1이다
    - `git diff --stat -- domain/permissions` 출력이 비어 있다(project·visible 무수정)
  </acceptance_criteria>
  <done>listPeople이 사람 수와 무관한 일정한 횟수로 조회하고, 이슈 #56 테스트 2개와 people.test.ts 전체가 통과한다. getPerson은 여전히 사람 한 명 조회 경로(teamAtDate + findRoleById)를 쓴다.</done>
</task>

<task type="auto">
  <name>Task 2: 회귀·정적 게이트 확인 후 한 커밋(fix:)으로 기록</name>
  <files>test/integration/people.test.ts</files>
  <read_first>없음. Task 1의 변경 파일만 대상이다</read_first>
  <action>
"완료"라고 말하기 전에 verification-before-completion 스킬을 호출하고, 아래 게이트를 실제로 실행한다. 출력은 요약만 남기고, 실패하면 실패 부분만 인용한다.
(a) `pnpm typecheck`
(b) `pnpm lint`: repository-viewer-param, no-row-type-escape, boundaries 규칙 포함
(c) `pnpm test:unit`: team-at-date, permissions/project, import-cycles 등 전체 단위 테스트
(d) `pnpm test:integration`: people, team-memberships, corp-card-owner-archived, 그리고 listPeople을 쓰는 domain/projects/references 경로를 포함한 전체 통합 테스트

마이그레이션은 바꾸지 않았으므로 `pnpm lint:sql` 대상(db/migrations/*.sql)은 변화가 없다. `git status --short -- db/migrations`가 비어 있는지만 확인한다.

게이트 중 하나라도 실패하면 systematic-debugging 스킬로 원인을 찾아 고친 뒤 실패한 게이트만 다시 돌린다. 고친 파일은 Task 1의 files 범위를 벗어나지 않아야 한다. 벗어나야 한다면 멈추고 보고한다.

모두 통과하면 커밋한다. 이번 수정 파일 6개만 경로로 지정해 스테이징한다. 대상은 repositories/team-memberships.ts, repositories/teams.ts, repositories/roles.ts, domain/org/index.ts, domain/people/index.ts, test/integration/people.test.ts다. `git add -A`나 `git add .`는 쓰지 않는다. `next dev`가 CLAUDE.md에 다시 쓰는 블록 같은 무관한 변경이 섞이지 않게 하기 위해서다.

커밋 메시지:
- 제목: `fix: batch team/role/visibility lookups in listPeople (#56)`
- 본문(한국어): 원인(1인당 16쿼리, 190명 3043쿼리/706 ms), 수정(묶음 조회 3개 + teamsAtDate + 호출 한정 메모이즈 visible), 회귀 테스트 2개
- 끝에 대화에서 지정한 Co-Authored-By · Claude-Session 줄을 붙인다

push하지 않는다. .planning/STATE.md의 현재 페이즈는 건드리지 않는다. 이 빠른 작업의 SUMMARY 파일만 쓴다.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration</automated>
  </verify>
  <acceptance_criteria>
    - 네 게이트가 모두 0으로 종료된다(SUMMARY에 각 한 줄 요약)
    - `git show --stat HEAD`의 파일 목록이 정확히 이 계획의 files_modified 6개다
    - `git show --stat HEAD -- db/migrations package.json pnpm-lock.yaml app ui` 출력이 비어 있다(마이그레이션·의존성·UI 무변경)
    - `git log -1 --format=%s`가 `fix:`로 시작한다
  </acceptance_criteria>
  <done>타입·린트·단위·통합 게이트가 모두 통과하고, 수정과 회귀 테스트가 fix: 커밋 하나로 기록되었다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| viewer(계급) → PersonDto 필드 노출 | visible() 판정이 필드별로 값을 가린다. 묶음화 뒤에도 이 게이트를 빠짐없이 거쳐야 한다 |
| domain → repositories(SQL) | 사람·팀·계급 id 배열이 inArray 파라미터로 넘어간다. 값의 출처는 DB 행이지 사용자 입력이 아니다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q56-01 | Information Disclosure | domain/people/index.ts listPeople 메모이즈 visible | high | mitigate | 캐시를 listPeople 호출 안의 지역 Map으로만 둔다(모듈 전역 금지). 다른 viewer·계급의 판정이 섞이거나 노출표 변경 뒤 낡은 판정이 쓰이지 않는다. 키는 infoItem이고 viewer는 호출 동안 고정이다 |
| T-q56-02 | Information Disclosure | listPeople · teamsAtDate 투영 | high | mitigate | 모든 필드가 여전히 project(..., PERSON_DTO_SPEC / TEAM_DTO_SPEC, { visible })를 거친다. project()·visible()·spec은 수정하지 않는다(acceptance: domain/permissions diff 없음). 테스트 2가 목록 항목과 getPerson DTO의 deep-equal을 고정한다 |
| T-q56-03 | Tampering | repositories findMembershipsAtDate · findTeamsByIds · findRolesByIds | low | mitigate | drizzle inArray·lte 파라미터 바인딩만 쓰고 sql 템플릿에 문자열을 넣지 않는다. ids의 출처는 DB 행이다 |
| T-q56-04 | Denial of Service | inArray 목록 크기 | low | accept | 대상 규모는 10~30명(로컬 측정 190명)이다. listUsers가 이미 전 행을 읽으므로 IN 목록이 그보다 크지 않고, Postgres 파라미터 한도(65535)보다 훨씬 작다 |
</threat_model>

<verification>
- RED 증거: 수정 전 「사람이 늘어도 DB 조회 횟수가 그대로다」가 조회 횟수 불일치로 실패(Task 1)
- GREEN: test/integration/people.test.ts 전체 통과(Task 1)
- 회귀: pnpm typecheck · pnpm lint · pnpm test:unit · pnpm test:integration 통과(Task 2)
- 범위: 커밋 파일이 정확히 6개이고, domain/permissions·db/migrations·package.json·app·ui 무변경
- E2E·브라우저 QA·/review·/cso는 이 계획의 범위 밖이다. 오케스트레이터가 Post-build 단계(/review → /qa → /ship)에서 돌린다
</verification>

<success_criteria>
- listPeople의 DB 조회 횟수가 사람 수와 무관하다(1명 = 4명)
- 목록의 현재 소속·계급명·노출 규칙이 수정 전과 같고, 목록 항목이 getPerson의 person과 같다
- 기존 테스트 전부 통과, 새 의존성·마이그레이션·UI 변경 없음
- fix: 커밋 하나(제목 영어, 본문 한국어)
</success_criteria>

<output>
Create `.planning/quick/260924-hgx-admin-people-list-n-1-query-fix-issue-56/260924-hgx-SUMMARY.md` when done
</output>
