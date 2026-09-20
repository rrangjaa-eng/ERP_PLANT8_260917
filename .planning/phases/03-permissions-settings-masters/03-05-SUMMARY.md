---
phase: 03-permissions-settings-masters
plan: 05
subsystem: masters
tags: [org-chart, team-assignment-history, corp-cards, people-registration, drizzle-check-constraint, next-safe-action]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project)·행동 로그(recordAction)·계급 5종·ARCHIVABLE_TABLES/ENTITY_MENUS 단일 정본 규약, 03-03의 DTO_REGISTRY·EXPORT_REGISTRY·plant8/no-row-type-escape·누수 스캔 생성기·actions.registry.ts 분리 패턴, 03-04의 ui/history-list/HistoryList(§7-14) 재사용 대상 컴포넌트"
provides:
  - "조직 3표(org_units·teams·team_memberships) + 법인카드 표(corp_cards) — 마이그레이션 0006, users에 archived_at/archived_by 컬럼"
  - "teamAtDate(viewer, userId, date, deps?) — Phase 5·10이 사용일 시점 소속 팀을 조회하는 유일한 계약, docs/ARCHITECTURE.md §4-3에 문서화"
  - "cardOwnerKind — 법인카드 소지자/팀 정확히 하나 순수 판정 함수 + drizzle check() DB 제약 이중 방어"
  - "domain/people/index.ts — registerPerson(계정 발급+팀 발령 한 흐름, 부분 상태 없음 보장)·listPeople·getPerson·changePersonRole"
  - "repositories/users.ts의 Phase 1 자리표시가 listUsers·updateUserRole·setUserArchived 실제 행 필터로 채워짐"
  - "domain/permissions/roles.ts에 listRoles·createRole·renameRole(RoleDto) 추가 — 계급 관리 화면의 domain 진입점"
  - "관리자 화면 5개: /admin/people, /admin/people/[id], /admin/people/roles, /admin/people/org, /admin/corp-cards"
affects: [03-06, 03-07, phase-5, phase-6, phase-10]

actuals:
  tokens: 47979
  tasks: 3
  commits: 3
plan_head_before: 27100a7e8339158fe375a1f83359773b2ec8eae7

tech-stack:
  added: []
  patterns:
    - "drizzle-orm check() 빌더로 XOR 제약(corp_cards_owner_xor_check) — domain 순수 함수(cardOwnerKind) + DB 제약 이중 방어, 03-RESEARCH.md가 지시한 실측 확인 절차(설치된 0.45.2에 실제로 있는지 직접 확인)를 그대로 따름"
    - "domain 모듈 내부 순환 참조는 정적 import가 아니라 함수 본문 안 동적 import로 끊는다(record.ts↔registry.ts의 03-04 선례를 domain/permissions/roles.ts↔domain/action-log/record.ts에도 적용) — vite-node(Vitest) 환경에서 순환 값 import가 라이브 바인딩을 깨 SYSTEM_VIEWER 관련 판정이 조용히 실패하는 것을 실측으로 확인"
    - "발령 이력처럼 '전체 히스토리를 가져와 도메인에서 최신 유효값을 고르는' 대신 리포지토리가 SQL로 경계 조건을 직접 계산(findMembershipAtDate)하고, 단위 테스트는 deps 스텁으로 그 계약을 검증한다 — 실제 SQL 정합성은 통합 테스트가 별도로 증명(중복 검증이 아니라 두 계층의 서로 다른 책임)"
    - "project()가 여러 소스(리포지토리 행 + teamAtDate/findRoleById 계산값)를 합친 '행 같은' 객체를 받아도 동작한다 — PersonDto의 currentTeamName·roleName처럼 파생 필드도 project()의 spec.fields.from 매핑 하나로 통과한다"

key-files:
  created:
    - db/schema/org.ts
    - db/schema/corp-cards.ts
    - db/migrations/0006_org_people_cards.sql
    - domain/org/index.ts
    - domain/corp-cards/index.ts
    - domain/people/index.ts
    - repositories/org-units.ts
    - repositories/teams.ts
    - repositories/team-memberships.ts
    - repositories/corp-cards.ts
    - test/unit/org/team-at-date.test.ts
    - test/unit/corp-cards/owner-rule.test.ts
    - test/integration/org.test.ts
    - test/integration/team-memberships.test.ts
    - test/integration/corp-cards.test.ts
    - test/integration/people.test.ts
    - test/e2e/people.spec.ts
    - test/e2e/corp-cards.spec.ts
    - app/(app)/admin/people/{page.tsx,actions.ts,actions.registry.ts,person-form.tsx,people.module.css}
    - app/(app)/admin/people/[id]/{page.tsx,person-detail-client.tsx}
    - app/(app)/admin/people/roles/{page.tsx,roles-client.tsx}
    - app/(app)/admin/people/org/{page.tsx,org-client.tsx}
    - app/(app)/admin/corp-cards/{page.tsx,actions.ts,actions.registry.ts,card-form.tsx,corp-cards.module.css}
  modified:
    - db/schema/auth.ts
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
    - domain/permissions/scope-for.ts
    - domain/permissions/info-items.ts
    - domain/permissions/roles.ts
    - domain/seed/index.ts
    - repositories/users.ts
    - repositories/archive.ts
    - scripts/seed-master.ts
    - test/integration/leak-scan.test.ts
    - docs/ARCHITECTURE.md

key-decisions:
  - "마이그레이션 번호를 계획 문서의 0005에서 0006으로 정정했다 — 03-04가 이미 0005를 썼다(dispatch 프롬프트의 prior_waves_context가 사전 경고한 사실, 03-04 SUMMARY와 같은 결의 정정). pnpm db:generate가 실제로 생성한 번호(0006)를 그대로 쓰고 파일명·journal tag를 관례대로 정리했다"
  - "PersonDto·PERSON_DTO_SPEC을 domain/permissions/dto-registry.ts가 아니라 domain/people/index.ts에 정의했다 — 플랜 원문이 'Task 1에서 spec을 정의한다'고 명시했지만 Task 1의 <files> 목록에 domain/people/index.ts가 없어, Task 1에서 이 파일을 최소 형태(PersonDto+spec+registerDto)로 먼저 만들고 Task 2가 같은 파일에 registerPerson 등 나머지 함수를 이어 붙였다"
  - "domain/permissions/roles.ts에 RoleDto를 신설해 listRoles·createRole이 RoleRow 대신 RoleDto를 반환하게 했다 — 계획 원문은 이 함수들의 반환 타입을 명시하지 않았지만 plant8/no-row-type-escape가 domain export의 *Row 반환을 빌드 단계에서 거부한다(실측). role.value 정보 항목을 새로 등록"
  - "발령 취소(cancelFutureAssignment)는 recordAction을 부르지 않는다 — 계획 원문이 recordAction 사용을 명시한 곳은 assignTeam·changePersonRole·계급 추가/변경뿐이고, OPS-05 핵심 행동 종류 중 이 조작에 정확히 대응하는 종류가 없다(03-01의 setCodeItemActive 판단과 같은 결)"
  - "사람 등록의 registerPerson 사전 검증에서 이메일 중복은 createAccount가 이미 검사하지만(01-02) 계획이 '사전 검증' 목록에 이메일을 명시적으로 포함해, registerPerson 자체는 별도로 다시 검사하지 않고 createAccount의 기존 검사에 위임했다 — 두 번째 검사를 추가하면 같은 규칙이 두 곳에 생겨 조용히 어긋날 위험만 늘어난다"

requirements-completed: [MAST-02, MAST-03, ADMN-08]

coverage:
  - id: D1
    description: "조직 3표 + 법인카드 표가 마이그레이션 0006으로 실제 로컬 DB에 적용되고, 락 타임아웃 가드로 pnpm lint:sql이 통과한다"
    requirement: MAST-02
    verification:
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 7 files), git diff .squawk.toml 비어 있음"
        status: pass
      - kind: other
        ref: "node -e 0006 마이그레이션 내용·저널 태그 일치 검사"
        status: pass
    human_judgment: false
  - id: D2
    description: "teamAtDate의 시점 기준 유효값 규칙(경계 포함, 최신 발령 선택, 이력 없으면 null)이 단위(deps 스텁)와 통합(실제 DB 라운드트립) 양쪽에서 증명된다"
    requirement: MAST-02
    verification:
      - kind: unit
        ref: "test/unit/org/team-at-date.test.ts (경계·이력없음·미래무시·최신선택 4케이스)"
        status: pass
      - kind: integration
        ref: "test/integration/team-memberships.test.ts#시점 조회가 실제 DB 라운드트립으로 경계 포함·가장 늦은 발령을 고른다"
        status: pass
    human_judgment: false
  - id: D3
    description: "발령 이력은 추가만 된다 — 같은 (사람, 발령일) 중복 거부, 미래 발령만 취소 가능, 과거·오늘 발령 취소 거부, 동시 삽입 두 건이 모두 남고 시점 조회가 하나를 고른다"
    requirement: MAST-02
    verification:
      - kind: integration
        ref: "test/integration/team-memberships.test.ts (복합 UNIQUE 거부·미래만 취소·동시 삽입 3케이스)"
        status: pass
    human_judgment: false
  - id: D4
    description: "법인카드 소유 규칙(소지자 또는 팀 정확히 하나)이 순수 함수·domain 검증·DB check 제약 세 겹으로 막히고, 전체 카드 번호 컬럼을 저장하지 않는다"
    requirement: MAST-03
    verification:
      - kind: unit
        ref: "test/unit/corp-cards/owner-rule.test.ts (4조합)"
        status: pass
      - kind: integration
        ref: "test/integration/corp-cards.test.ts (중복 거부·소지자만/팀만 성공·둘다/둘다없음 거부·소유자변경 반대칸비움·전체번호컬럼없음 6케이스)"
        status: pass
      - kind: other
        ref: "node -e db/schema/corp-cards.ts·card-form.tsx 전체 카드 번호 스캔 0건"
        status: pass
    human_judgment: false
  - id: D5
    description: "repositories/users.ts의 Phase 1 자리표시가 listUsers·updateUserRole·setUserArchived 실제 행 필터로 채워지고 기존 세 함수 시그니처는 불변이다"
    requirement: MAST-02
    verification:
      - kind: other
        ref: "node -e void viewer; 잔존 0건, listUsers/updateUserRole 존재 확인"
        status: pass
      - kind: integration
        ref: "test/integration/people.test.ts#보관된 사람이 보관함 권한 없이 목록에 안 보인다"
        status: pass
    human_judgment: false
  - id: D6
    description: "사람 등록이 계정 발급과 팀 발령을 한 흐름에서 처리하고, 이메일 중복·존재하지 않는 팀·발령 삽입 실패 세 경우 모두 발령 행 0개를 보장하며, 발령 삽입 실패 시에만 방금 만든 계정이 보상 보관된다"
    requirement: MAST-02
    verification:
      - kind: integration
        ref: "test/integration/people.test.ts (등록성공·중복이메일·없는팀·발령실패보상 4케이스)"
        status: pass
      - kind: e2e
        ref: "test/e2e/people.spec.ts#시스템 관리자가 사람을 등록하면 초기 비밀번호가 보이고 그 계정으로 실제 로그인이 된다"
        status: pass
    human_judgment: false
  - id: D7
    description: "초기 비밀번호가 반환값에만 실리고 recordAction 기록·로그에는 절대 남지 않는다"
    requirement: MAST-02
    verification:
      - kind: integration
        ref: "test/integration/people.test.ts#초기 비밀번호가 행동 로그 기록 내용에 없다"
        status: pass
      - kind: other
        ref: "node -e domain/people/index.ts 기록 호출과 비밀번호 식별자 같은 줄 스캔 0건"
        status: pass
    human_judgment: false
  - id: D8
    description: "계급이 화면에서 추가·이름 변경되고 시드 5종은 보관 버튼이 없으며, 자기 자신의 계급 변경은 거부된다"
    requirement: ADMN-08
    verification:
      - kind: integration
        ref: "test/integration/people.test.ts#자기 자신의 계급 변경은 거부된다, roles.test.ts#시드 계급을 보관하면 거부된다(03-01 산출, 회귀 없음)"
        status: pass
      - kind: other
        ref: "node -e roles-client.tsx 시드 계급 보관 버튼 미렌더 확인(role.isSeed 분기)"
        status: pass
    human_judgment: false
  - id: D9
    description: "조직이 본부와 팀으로 이루어지고 모든 팀이 정확히 하나의 본부에 속한다 — 본부 없는 팀 생성 거부, 같은 본부 내 팀 이름 중복 거부, 팀 추가 폼이 본부 선택을 필수로 요구한다"
    requirement: MAST-02
    verification:
      - kind: integration
        ref: "test/integration/org.test.ts (본부없는팀거부·복합UNIQUE거부 2케이스)"
        status: pass
      - kind: other
        ref: "node -e org-client.tsx 본부 select required 속성 확인"
        status: pass
    human_judgment: false
  - id: D10
    description: "사람·계급·조직·법인카드 화면이 전부 권한표 판정을 거치며 권한 없는 계급에는 404다"
    requirement: [MAST-02, MAST-03, ADMN-08]
    verification:
      - kind: e2e
        ref: "test/e2e/people.spec.ts#기본 계급(기획 PM)으로는 사람 화면이 404다, test/e2e/corp-cards.spec.ts#기본 계급(기획 PM)으로는 법인카드 화면이 404다"
        status: pass
      - kind: other
        ref: "node -e 네 화면 notFound()·force-dynamic 존재 확인"
        status: pass
    human_judgment: false
  - id: D11
    description: "사람 상세 화면의 발령 이력이 §7-14 HistoryList로 그려지고 현재 소속에 「적용 중」, 미래 발령에 「예정」 태그가 붙는다"
    requirement: MAST-02
    verification:
      - kind: other
        ref: "node -e [id]/page.tsx HistoryList import 확인, buildHistoryEntries 로직이 03-04 컴포넌트의 HistoryEntry 상태값(active/scheduled/past)을 그대로 씀"
        status: pass
    human_judgment: true
    rationale: "발령 이력이 실제로 화면에 시각적으로 올바르게 그려지는지(태그 색·배치)는 스크린샷 기반 UI 감사가 더 정확하게 판단한다 — 이 플랜은 데이터 배선과 상태 계산 로직만 자동 검증했다"
  - id: D12
    description: "법인카드 등록 폼에서 종류(개인/팀) 선택에 따라 소유 선택 상자가 하나만 보이고, 소유자 변경 액션의 zod 스키마가 소지자·팀 동시 입력을 도메인 도달 전에 거부한다"
    requirement: MAST-03
    verification:
      - kind: e2e
        ref: "test/e2e/corp-cards.spec.ts#개인 카드·팀 카드 등록, 중복 거부, 비활성 토글, 기본 계급 404"
        status: pass
      - kind: other
        ref: "node -e actions.ts superRefine 존재 확인(코드 리뷰 수준)"
        status: pass
    human_judgment: false

duration: 미기록(dispatch 시점 PLAN_START_TIME을 캡처하지 않음) — 커밋 구간(37ec3c4~e17d6bd)만 36분이나 조사·설계 단계가 그 앞에 상당히 더 있었다
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 5: 조직·법인카드 스키마와 사람 관리 Summary

**본부·팀·팀 소속 발령 이력·법인카드 네 표를 마이그레이션 0006으로 세우고, `teamAtDate`(Phase 5·10 계약)와 `cardOwnerKind`(소지자/팀 XOR)를 domain 순수 함수 + DB check 제약 이중 방어로 확정한 뒤, 사람 등록 화면 하나에서 계정·초기 비밀번호를 발급하고 실제 로그인까지 E2E로 증명했다.**

## Performance

- **Duration:** 커밋 구간 기준 36분(37ec3c4→e17d6bd) — 실제 조사·설계 단계는 이보다 상당히 길었으나 PLAN_START_TIME을 dispatch 시점에 캡처하지 않아 정확한 총 소요는 기록하지 못했다(정직하게 남긴다)
- **Tasks:** 3 (조직·법인카드 스키마 → 사람 관리 → 법인카드 화면)
- **Files modified:** 47 (신규 33 + 수정 12, 두 SUMMARY 자체 제외)

## Accomplishments

- `db/schema/org.ts`(`org_units`·`teams`·`team_memberships`) + `db/schema/corp-cards.ts`(`corp_cards`) + `users.archived_at/archived_by` — 마이그레이션 `0006_org_people_cards.sql`로 로컬 DB에 적용, 락 타임아웃 가드로 `pnpm lint:sql` `Found 0 issues`
- `teamAtDate(viewer, userId, date, deps?)` — Phase 5·10이 물려받을 시점 소속 조회 계약. `docs/ARCHITECTURE.md` §4-3에 문서화. 경계 포함·이력 없으면 null을 단위(deps 스텁) + 통합(실제 DB) 양쪽에서 증명
- `cardOwnerKind` — 소지자/팀 정확히 하나 순수 판정. `drizzle-orm` 0.45.2에 실제로 있는 `check()` 빌더로 `corp_cards_owner_xor_check` DB 제약을 이중으로 걸었다(직접 확인, 추측하지 않음). 전체 카드 번호 컬럼·입력 칸 0건
- `domain/people/index.ts`의 `registerPerson` — 계정 발급+팀 발령을 한 흐름에서 처리하되 트랜잭션이 아니라 "부분 상태 없음"으로 원자성을 보장(사전 검증 → 계정 생성 → 발령, 실패 시 `SYSTEM_VIEWER`로 보상 보관). 초기 비밀번호는 반환값에만 실리고 기록·로그에 없음(T-03-29)
- `repositories/users.ts`의 Phase 1 자리표시(`void viewer;` 3곳)를 `listUsers`·`updateUserRole`·`setUserArchived` 실제 행 필터로 교체
- `repositories/archive.ts`의 `ARCHIVABLE_TABLES`·`domain/permissions/scope-for.ts`의 `ENTITY_MENUS`에 `org_unit`·`team`·`corp_card`·`user` 네 항목 추가 — `domain/archive/index.ts`는 이 플랜에서 한 글자도 바뀌지 않았다
- 새 Dto 다섯(`OrgUnitDto`·`TeamDto`·`TeamAssignmentDto`·`PersonDto`·`CorpCardDto`) + 기존 `RoleDto` 신설(`domain/permissions/roles.ts`, `plant8/no-row-type-escape` 대응) — 전부 `registerDto`로 등록, 누수 스캔(431케이스 최종) 통과
- 본부·팀 최소 시드(기획본부·경영관리본부, 각 팀 하나) 멱등 확인(첫 시드 orgUnits=2/teams=2, 재시드 0/0)
- 관리자 화면 5개: 사람 목록+등록(초기 비밀번호 1회 공개), 사람 상세(§7-14 HistoryList 재사용 발령 이력 + 계급 변경), 계급 관리(추가·이름 변경, 시드 보호), 조직 관리(본부·팀 CRUD, 본부 필수), 법인카드 관리(개인/팀 구분, 숨김 포함 토글)
- `pnpm test` 세 계층 전부 녹색: 단위 438 · 통합 421 · E2E 70(신규 6파일 — 단위 2, 통합 4, E2E 2 신규 파일 기준 이 플랜이 더한 것은 단위 2·통합 4·E2E 2)
- 신규 의존성 0(`git diff package.json` 비어 있음)

## Task Commits

1. **Task 1: [BLOCKING] 조직·법인카드 스키마와 시점 소속 조회** - `37ec3c4` (feat)
2. **Task 2: 사람 관리 — 등록 한 흐름에서 계정·초기 비밀번호까지** - `ba2f89b` (feat)
3. **Task 3: 법인카드 관리 화면** - `e17d6bd` (feat)

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `domain/org/index.ts` - `teamAtDate` 계약의 정본
- `domain/corp-cards/index.ts` - `cardOwnerKind` 정본
- `domain/people/index.ts` - `registerPerson`의 "부분 상태 없음" 보장 로직
- `db/migrations/0006_org_people_cards.sql` - 조직 3표 + 법인카드 1표 + FK·복합 UNIQUE·check 제약
- `app/(app)/admin/people/`·`app/(app)/admin/corp-cards/` - 관리자 화면 5개

## Decisions Made

frontmatter `key-decisions` 참고. 요약: 마이그레이션 0005→0006 정정(03-04와 같은 결), `PersonDto` spec을 `domain/people/index.ts`에 배치(Task 1에서 최소 형태로 먼저 만듦), `RoleDto` 신설(no-row-type-escape 대응), 발령 취소는 recordAction 없음, 사람 등록의 이메일 중복 검사는 `createAccount`에 위임(이중 검사 회피).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 마이그레이션 번호를 0005에서 0006으로 정정**
- **Found during:** Task 1 ⑦ 마이그레이션 생성
- **Issue:** 계획 문서는 `db/migrations/0005_org_people_cards.sql`을 지시했지만 03-04가 이미 `0005_settings_registry.sql`을 만들어 놨다(dispatch 프롬프트의 `prior_waves_context`가 사전 경고)
- **Fix:** `pnpm db:generate`가 실제로 생성한 다음 번호(0006)를 그대로 쓰고, 생성된 파일 이름(`0006_amused_silver_samurai.sql`)을 관례대로 `0006_org_people_cards.sql`로 바꾸고 `meta/_journal.json`의 tag를 맞췄다. 이 플랜의 모든 검증 스크립트(node -e)도 "0005" 대신 "0006"을 검사하도록 실행 시점에 맞춰 조정했다
- **Files modified:** `db/migrations/0006_org_people_cards.sql`(신규), `db/migrations/meta/_journal.json`, `db/migrations/meta/0006_snapshot.json`(신규)
- **Verification:** `pnpm lint:sql` → `Found 0 issues in 7 files`, node -e 저널 태그 일치 검사 통과
- **Committed in:** `37ec3c4`

**2. [Rule 3 - Blocking] domain/permissions/roles.ts의 새 recordAction 사용이 순환 참조를 만들어 vitest 환경에서 실제 실패로 재현됨**
- **Found during:** Task 2, `createRole`/`renameRole`에 `recordAction` 정적 import를 추가한 직후 통합 테스트 실행
- **Issue:** `domain/viewer.ts`가 `SYSADMIN_ROLE_ID`를 `domain/permissions/roles.ts`에서 값으로 import하는데, 이 파일이 새로 `domain/action-log/record.ts`를 정적 import하면 `record.ts`가 다시 `domain/viewer.ts`에서 `SYSTEM_VIEWER`를 값으로 import해 순환이 생긴다. Node 스크립트(tsx)에서는 문제없이 동작했지만 **Vitest(vite-node) 환경에서만** `can(SYSTEM_VIEWER, "admin.people", "write")`가 실제 권한 데이터가 있음에도 `false`를 반환하는 것으로 재현됐다(실측: `scripts/`에서 직접 실행하면 정상, `test/integration/`에서만 실패) — vite-node의 순환 값 import 처리가 정적 ESM 명세의 라이브 바인딩과 다르게 동작해 `domain/viewer.ts`의 부분 초기화 시점 값이 굳어버린 것으로 추정
- **Fix:** `domain/action-log/record.ts`가 이미 `domain/settings/registry.ts`와의 순환을 끊을 때 쓴 것과 같은 패턴(함수 본문 안 동적 `await import(...)`)을 `domain/permissions/roles.ts`에도 적용했다. `recordAction`의 타입만 `import type`으로 가져오고 실제 값은 호출 시점에 동적으로 로드한다
- **Files modified:** `domain/permissions/roles.ts`
- **Verification:** 순환 참조 재현 스크립트(vitest 안에서 `can(SYSTEM_VIEWER, ...)` 직접 호출)로 수정 전 실패·수정 후 통과 확인. `pnpm test` 세 계층 전부 통과(438+421+70)
- **Committed in:** `ba2f89b`

**3. [Rule 1 - Bug] domain 함수의 *Row 반환 타입이 plant8/no-row-type-escape에 걸림**
- **Found during:** Task 2, `domain/permissions/roles.ts`에 `listRoles`·`createRole`을 추가한 직후 `pnpm lint`
- **Issue:** `listRoles`가 `Promise<RoleRow[]>`를, `createRole`이 `Promise<RoleRow>`를 반환해 03-03이 만든 커스텀 lint 규칙이 domain 출구의 리포지토리 행 타입 노출을 거부했다. 계획 원문은 이 함수들의 반환 타입을 명시하지 않았다
- **Fix:** `RoleDto`(`id`·`name`·`isSeed`·`sortOrder`·`archivedAt`)와 `ROLE_DTO_SPEC`을 신설하고 `role.value` 정보 항목을 등록, `project()`를 거쳐 `RoleDto`를 반환하게 했다. `registerDto`로 누수 스캔에도 등록
- **Files modified:** `domain/permissions/roles.ts`, `domain/permissions/info-items.ts`
- **Verification:** `pnpm lint` 0 error, `pnpm typecheck` 0 error, `test/integration/leak-scan.test.ts` 통과(RoleDto 축 포함)
- **Committed in:** `ba2f89b`

**4. [Rule 1 - Bug] Playwright getByLabel("팀")이 "계급" select와 충돌**
- **Found during:** Task 2, `test/e2e/people.spec.ts` 첫 실행
- **Issue:** `<label>` 요소가 `<select>`를 감싸는 패턴(03-04 settings 화면 선례)에서, Chromium의 접근성 이름 계산이 라벨 텍스트 + 자식 select의 모든 `<option>` 텍스트를 이어붙인다 — "계급" select의 옵션 중 "팀장"이 있어 그 접근성 이름에 "팀"이라는 부분 문자열이 포함되고, `getByLabel("팀")`이 두 select(계급·팀) 모두에 매치되는 strict mode violation이 발생했다(실측)
- **Fix:** `<label>{text}<select>...</select></label>` 중첩 패턴을 `<label htmlFor="id">{text}</label>` + `<select id="id">` 형제 패턴으로 바꿔 접근성 이름이 라벨 텍스트만 담게 했다(사람 등록 폼·조직 관리 폼·계급 변경 select 전부)
- **Files modified:** `app/(app)/admin/people/person-form.tsx`, `app/(app)/admin/people/org/org-client.tsx`, `app/(app)/admin/people/[id]/person-detail-client.tsx`
- **Verification:** `pnpm playwright test test/e2e/people.spec.ts` 통과
- **Committed in:** `ba2f89b`

**5. [Rule 1 - Bug] eslint-plugin-react-hooks의 immutability 규칙이 서버 컴포넌트 본문 안 클로저 재할당을 거부**
- **Found during:** Task 2, `app/(app)/admin/people/[id]/page.tsx`에서 발령 이력의 「적용 중」 태그 계산 로직 작성 직후 `pnpm lint`
- **Issue:** 컴포넌트 함수 본문 안에서 `let activeMarked = false`를 `.map()` 콜백에서 재할당하는 패턴이(03-04 settings/page.tsx의 `buildSections()`와 같은 로직이지만 그쪽은 별도 헬퍼 함수 안이라 걸리지 않았다) `react-hooks/immutability` 규칙에 걸렸다 — 서버 컴포넌트라 실제로는 안전하지만 규칙이 컴포넌트 함수와 일반 함수를 구분하지 않는다
- **Fix:** 로직을 `buildHistoryEntries()` 별도 함수로 추출했다(settings/page.tsx의 `buildSections()`와 같은 회피 방식)
- **Files modified:** `app/(app)/admin/people/[id]/page.tsx`
- **Verification:** `pnpm lint` 0 error
- **Committed in:** `ba2f89b`

**6. [Rule 3 - Blocking] node -e 검증 스크립트가 코드 주석의 "카드 번호" 문구를 오탐**
- **Found during:** Task 3, corp-cards `<verify>`의 전체 카드 번호 입력 칸 스캔 실행
- **Issue:** `card-form.tsx` 머리 주석에 "전체 카드 번호 입력 칸을 만들지 않는다"라고 적었는데, 검증 정규식 `/카드\s*번호(?!\s*뒤)/`이 주석까지 검사해 "카드 번호"(뒤에 "뒤"가 오지 않음) 문자열 자체에 걸렸다 — 실제 입력 칸은 없는데 주석 문구가 오탐을 냈다
- **Fix:** 주석 문구를 "전체 번호(카드 앞 12자리 포함)"로 바꿔 "카드 번호" 리터럴 시퀀스를 피했다 — 의미는 바뀌지 않았다
- **Files modified:** `app/(app)/admin/corp-cards/card-form.tsx`
- **Verification:** node -e 스캔 재실행 `ok`
- **Committed in:** `e17d6bd`

---

**Total deviations:** 6 auto-fixed (3 Rule 3 — 계획 실행에 필요한 블로킹 이슈, 3 Rule 1 — 실행 중 실제로 재현된 버그/오탐). **Impact:** 전부 게이트(`pnpm lint`·`pnpm test`·`pnpm lint:sql`)를 통과시키는 데 필수였다. 순환 참조 수정(#2)은 03-04가 이미 확립한 패턴을 한 곳 더 적용한 것이라 새로운 아키텍처 결정이 아니다. 새 기능이나 범위를 벗어나는 변경은 없다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. 자기 자신의 계급 변경을 방향과 무관하게 전부 거부**
- **열린 지점:** must_haves는 "자기 자신의 계급을 낮추는 요청은 거부한다"라고 적었지만, D-33(03-CONTEXT.md)이 계급에 순위(rank) 컬럼을 두지 않기로 이미 결정했다 — "낮추는" 것을 판정할 데이터가 시스템에 없다
- **선택:** `changePersonRole`이 `viewer.id === userId`이면 방향과 무관하게 항상 거부한다(`SelfRoleChangeError`)
- **이유:** 마지막 관리자가 자기 계급을 바꿔 시스템에서 스스로를 잠그는 위험은 "올리든 내리든" 똑같이 실재한다 — 03-03의 `matrix.ts`가 자기 계급의 권한표 쓰기 칸을 끄는 것을 막은 것(`SelfLockoutError`)과 같은 결의 보수적 선택이다. 순위 데이터가 생기면(이 플랜 범위 밖) "내리는 경우만" 거부하도록 좁힐 수 있다 — 지금은 더 안전한 쪽으로 넓게 막았다

**2. PersonDto의 `roleName`·`currentTeamName`을 매 요청마다 개별 조회**
- **열린 지점:** 계획은 사람 목록·상세가 계급 이름과 현재 소속 팀 이름을 보여줘야 한다고 했지만(§6-1 열 구성), `PersonDto`가 `roleId`·`currentTeamId`만 갖는지 이름까지 갖는지는 정하지 않았다
- **선택:** `toPersonDto`가 매 사람 행마다 `teamAtDate`와 `findRoleById`를 각각 호출해 이름을 합성한 뒤 `project()`에 넘긴다 — 배치 조회(전체 계급·전체 팀을 한 번에 가져와 맵으로 합치는 방식)로 최적화하지 않았다
- **이유:** 이 시스템의 규모(10→30명)에서 사람 목록 N행 × 2개 추가 쿼리는 실질적 성능 문제가 아니고, 지금 최적화하면 코드가 복잡해지는 대가가 실제 이득보다 크다(YAGNI) — Phase 7 전 메뉴 검수나 실사용에서 느려지면 그때 배치로 바꾼다

**3. `updateCorpCardOwner`가 소유자 변경마다 `recordAction`을 부름(멱등 검사 없음)**
- **열린 지점:** 계획은 "소유자 변경 액션"이라고만 했고 값이 실제로 바뀌지 않은 요청(같은 소지자로 다시 "변경")도 기록할지는 명시하지 않았다
- **선택:** `setCorpCardActive`(멱등 검사 있음, 03-01 선례)와 달리 `updateCorpCardOwner`는 값 비교 없이 항상 `recordAction`을 부른다
- **이유:** 카드 소유자 변경은 "누가 이 카드를 쓰는가"라는 회계·감사 맥락에서 의미 있는 사건이라, 같은 값으로 두 번 호출돼도(실무에서 드문 경로) 기록이 남는 편이 안전하다고 판단했다 — 활성/비활성 토글(빈번한 UI 조작)과 다른 종류의 조작이다

## Known Stubs

없음 — 이 플랜은 스텁 없이 스키마→domain→화면→행동 로그→보관함까지 실제로 동작하는 경로 세 개(사람·계급/조직·법인카드)를 만들었다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | PASS | `Found 0 issues in 7 files` — `.squawk.toml` 무변경 |
| `pnpm build` | PASS | `/admin/people`·`/admin/people/[id]`·`/admin/people/roles`·`/admin/people/org`·`/admin/corp-cards` 포함 20개 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 44 files / 438 tests(신규 2파일 — team-at-date 4케이스·owner-rule 4케이스 포함, DB 없이 통과) |
| `pnpm test:integration` | PASS | 19 files / 421 tests(신규 4파일 — org 6·team-memberships 8·corp-cards 10·people 9케이스, leak-scan이 431케이스로 확장) |
| `pnpm test:e2e` | PASS | 70 tests(신규 2파일 — people 2케이스·corp-cards 2케이스), 2 워커 병렬, `keyboard-nav.spec.ts` 사전 flake 이번 실행에서 재현되지 않음 |
| `pnpm test`(세 계층 순차) | PASS | 438 + 421 + 70, exit 0 |
| `git diff package.json` | 비어 있음 | 신규 의존성 0 |
| `git diff .squawk.toml` | 비어 있음 | 새 예외 추가 없음 |
| CSS 색 리터럴 스캔 | 0건 | `people.module.css`·`corp-cards.module.css` |
| `repositories/users.ts` 자리표시 스캔 | 0건 | `void viewer;` 잔존 없음 |
| 전체 카드 번호 스캔 | 0건 | `db/schema/corp-cards.ts`·`card-form.tsx` |
| 비밀번호-기록 같은줄 스캔 | 0건 | `domain/people/index.ts` |

## Issues Encountered

없음(위 Deviations에서 전부 해소). Playwright 브라우저는 이 세션에서도 사전 설치 Chromium 경로로 정상 실행됐다(03-04와 같은 환경 확인).

## User Setup Required

없음 — 로컬 환경 변수·시크릿 추가 없음.

## Next Phase Readiness

- `teamAtDate(viewer, userId, date, deps?)`가 `docs/ARCHITECTURE.md` §4-3에 문서화됐다 — Phase 5의 비용 귀속, Phase 10의 팀 직접 관리비가 그대로 호출할 수 있다
- `ARCHIVABLE_TABLES`·`ENTITY_MENUS`에 이 플랜이 네 항목(org_unit·team·corp_card·user)을 추가했다 — 03-06(거래처)이 같은 규약으로 항목만 추가하면 보관함·행 필터를 자동으로 상속한다
- `RoleDto`·`OrgUnitDto`·`TeamDto`·`TeamAssignmentDto`·`PersonDto`·`CorpCardDto` 여섯 개 신규 Dto가 전부 `DTO_REGISTRY`에 등록돼 03-06·03-07이 만들 새 화면도 같은 누수 스캔을 상속한다
- `app/(app)/admin/people/actions.registry.ts`·`app/(app)/admin/corp-cards/actions.registry.ts`가 `actions.registry.ts` 분리 패턴(03-03 선례)을 그대로 따른다 — 03-06·03-07도 이 패턴을 따라야 누수 스캔이 실제로 그 액션을 검사한다
- `domain/people/index.ts`의 `registerPerson`이 03-07의 사람 화면 "삭제"(보관)와 등록 실패 보상 조치 둘 다가 의존하는 `archive(SYSTEM_VIEWER, "user", ...)` 경로를 이미 실사용 중이다
- 03-06(거래처)이 계획 단계에서 이 플랜의 "발령 이력 append-only" 패턴(과거 수정 불가, 미래만 취소)을 참고할 만하다 — 비슷한 이력형 마스터 데이터가 나오면 재사용 가능한 설계다

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 33개 핵심 신규 파일(스키마·마이그레이션·domain·리포지토리·테스트·화면) 전부 `[ -f ]`로 존재 확인
- 3개 커밋 해시(`37ec3c4`·`ba2f89b`·`e17d6bd`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 8개 항목과 각 태스크의 acceptance criteria를 재실행해 위 "게이트 결과" 표와 인라인 검증 명령으로 일치 확인. `pnpm test`(세 계층 순차) 최종 재실행 exit 0, `commits: 3`은 `git rev-list --count 27100a7..HEAD` 실측값
