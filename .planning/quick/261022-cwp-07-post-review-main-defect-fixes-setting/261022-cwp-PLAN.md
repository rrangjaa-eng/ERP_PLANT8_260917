---
phase: quick-261022-cwp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - "domain/settings/registry.ts"
  - "test/unit/settings/registry.test.ts"
  - "domain/approvals/route-step-settings.ts"
  - "test/unit/domain/route-step-settings-changes.test.ts"
  - "domain/settings/keys.ts"
  - "test/unit/settings/phase7-keys.test.ts"
  - "test/e2e/role-smoke.spec.ts"
autonomous: true
requirements: [NOTI-03, EXP-11, EXP-12]
risk: "결재 — domain/approvals/route-step-settings.ts(결재선 설정 로그의 이전 값, 잠금 순서 · 결재 판정 불변). Post-build 묶음 게이트: /review + /cso(domain/approvals 포함). 위험 경로(db/ · domain/auth/ · domain/permissions/ · lib/crypto* · .github/workflows/ · infra/ · .claude/) 변경 없음 · 화면 파일(app/ .tsx·.css · ui/) 변경 없음"

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "저장값이 없는 `payment.term_days`(기본 60)에 30을 처음 저장하면 settings_change 기록이 `changes: {value: [60, 30]}`이고, 60을 저장하면 기록 한 줄은 남되 `changes: {}`다(고치기 전 `[null, 30]` · `[null, 60]`). 기본값이 없는 키의 첫 저장은 그대로 `[null, 값]`이다(통합 action-log-changes.test.ts:73 녹색)"
    - "결재선 단계 저장에서 기본값 없는 「특정 부서」 칸(연차 · 지출 · 정산 3단 등)이 저장값 없음 → 빈 값으로 바뀌지 않았으면 그 칸 기록은 `changes: {}`다(고치기 전 `[null, \"\"]`). 빈 값 → 부서 id로 바뀌면 `[\"\", id]`다"
    - "원가율 `PROJECT_COST_RATE_PCT.schema`가 공백만 있는 문자열(\" \" · \"\\t\")을 null(비움)로 읽는다(고치기 전 0). 빈 문자열 → null, \"0\" · 0 → 0은 그대로다(D-734)"
    - "role-smoke의 `open` 행은 상태 200에 더해 최종 URL 경로가 요청 경로와 같아야 통과한다 — 리다이렉트 뒤 200(예: 세션 없이 `/admin/permissions` → `/login`)은 실패로 잡힌다(임시 탐침으로 고치기 전 통과 · 고친 뒤 실패를 실제 출력으로 증명)"
  artifacts:
    - path: "domain/settings/registry.ts"
      provides: "setSettingValue — 저장값이 없으면 이전 값 = 기본값(없으면 null)"
      contains: "def.default ?? null"
    - path: "domain/approvals/route-step-settings.ts"
      provides: "특정 부서 칸 이전 값에도 새 값과 같은 빈 값 대체"
    - path: "domain/settings/keys.ts"
      provides: "PROJECT_COST_RATE_PCT preprocess — 공백 문자열도 비움"
      contains: "trim()"
    - path: "test/unit/domain/route-step-settings-changes.test.ts"
      provides: "결재선 단계 저장의 특정 부서 칸 changes 단위 시험(모든 문서 종류 · 단계)"
    - path: "test/e2e/role-smoke.spec.ts"
      provides: "open 행 최종 경로 단언"
      contains: "page.url()"
  key_links:
    - from: "domain/settings/registry.ts setSettingValue"
      to: "domain/action-log/changes.ts buildChanges"
      via: "이전 값이 기본값과 같으면 buildChanges가 칸을 싣지 않는다(sameValue)"
      pattern: "buildChanges\\(\\{ value: previous \\}"
    - from: "domain/approvals/route-step-settings.ts entries[orgUnitId].previous"
      to: "withOrgUnitFallback(input.values)"
      via: "이전 · 이후 둘 다 빈 값 대체가 같아야 바뀌지 않은 칸이 빈 changes"
      pattern: "simpleValueOrDefault\\(step\\.orgUnitId"
---

<objective>
07 실행 사후 검토 2회차가 main에서 확정한 결함 네 건을 실패 테스트 → 수정 순서로 고친다. ① 단순 설정 첫 저장의 행동 로그 이전 값이 기본값이 아니라 null인 것 ② 결재선 단계 저장이 바뀌지 않은 「특정 부서」 칸을 `[null, ""]`로 기록하는 것 ③ 원가율 공백 입력이 0이 되는 것 ⑤ role-smoke가 리다이렉트 뒤 200을 「열림」으로 세는 것.

범위 밖: ④ 07-03 R11 「종류별 복원 상한」 시험은 이 quick에서 뺀다(오케스트레이터 결정) — 07-03-SUMMARY:62 · 06.4 시험(admin-cap-restore.test.ts:295)이 「나머지 종류는 보관함 쓰기 게이트」를 현재 설계로 고정하고, 종류별 「자기 상한」은 결정에 없는 새 정의라 권한 설계 판단으로 사용자에게 따로 올라간다. 이 플랜은 admin-cap-restore.test.ts · domain/archive/를 건드리지 않는다.

Purpose: 감사 기록(행동 로그 changes)이 화면이 보인 값과 같은 이전 값을 남기고 가짜 변경이 없게 한다. 원가율 「비움 ≠ 0」(D-734)을 가져오기 · 액션 직접 호출 경로까지 지킨다. role-smoke 검수 시험이 실제로 「그 경로가 열렸다」를 시험하게 한다.
Output: 수정 커밋 4개(①②③⑤), 결함마다 한 커밋.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

근거 보고서(읽기 전용, 필요한 절만): /mnt/project-files/07-review/exec-review/round2-money.md(F1 · F2 · 테스트 공백 4) · /mnt/project-files/07-review/exec-review/round2-ui.md(F2 · F3).

확정된 해석(오케스트레이터 지시 — 다시 묻지 않는다):
- ① 이전 값 규칙: 저장 행이 있으면 저장된 원값, 없으면 `def.default ?? null`. 같은 파일 `effectiveValueAt`(registry.ts:217-220)과 가져오기 경로(domain/settings/export.ts:223 `stored.has(key) ? stored.get(key) : (def?.default ?? null)`)와 같은 꼴이다. 07-04-PLAN.md:139의 「이전 값이 없으면 null」 문구와 다르다 — 같은 플랜 must_haves truth 1 · 결재선 · 가져오기 경로에 맞추는 오케스트레이터 확정이다. 「같으면 기록하지 않음」은 changes에 그 칸을 싣지 않는다(`changes: {}`)는 뜻이다. settings_change 한 줄 자체는 지금처럼 남긴다 — 결재선 경로의 통합 시험 「바뀌지 않은 칸은 빈 changes」(test/integration/action-log-changes.test.ts:159-174)와 같은 동작.
- ② 「바뀐 칸만 기록」도 같은 뜻이다: 단계 저장은 지금처럼 네 칸 각각 한 줄을 남기고, 바뀌지 않은 칸은 `changes: {}`. 고칠 곳은 특정 부서 칸의 이전 값에 새 값과 같은 빈 값 대체(`?? ""`)를 거는 것 하나다(route-step-settings.ts:33-35 `withOrgUnitFallback`이 새 값에만 건다).

실행 규율(CLAUDE.md §4 Build · §5 · .claude/rules/tests.md):
- 구현 전에 Skill 도구로 `superpowers:test-driven-development`를 호출한다. 「완료」를 말하기 전에 `superpowers:verification-before-completion`을 호출한다. 시험이 예상과 다르게 실패하면 원인을 쫓기 전에 `superpowers:systematic-debugging`을 호출한다.
- 결함마다 RED 커밋을 따로 두지 않는다. 「실패 테스트 → 수정」을 한 커밋에 넣고, 고치기 전 실패 출력(실패한 단언 · 실제값 줄)을 SUMMARY에 그대로 옮긴다.
- 커밋 제목은 영어 접두어(fix: / test:) + 짧은 요약, 본문은 한국어. 한 커밋 한 결함. 커밋에는 frontmatter `files_modified`의 파일만 넣는다. PLAN · SUMMARY · STATE는 커밋하지 않는다.
- 통합 · E2E는 테스트 DB `erp_test` 하나를 쓴다(이미 떠 있음, `postgres://erp:erp@127.0.0.1:5432/erp_test` — test/integration/global-setup.ts:12 기본값이라 환경 변수는 필요 없다). DB · Playwright 명령은 한 번에 하나만 돌린다. 전체 통합 · 전체 E2E는 돌리지 않는다(CI 몫).
- 모든 시험 출력은 실행자 세션의 scratchpad 디렉터리에 `> <파일> 2>&1`로 저장하고 `tail` · `grep`으로 요약만 읽는다.
- 화면 파일(app/의 .tsx · .css, ui/) · 위험 경로(db/migrations · db/schema · domain/auth · domain/permissions · .claude · .github/workflows)는 건드리지 않는다.
- 요청받지 않은 리팩터 · 주석 정리 금지. 바꾼 줄 위 주석은 한 줄(「quick 261022-cwp: …」 꼴)까지만.

이미 확인한 위치(필요한 범위만 Read):
- domain/settings/registry.ts:222-258 `setSettingValue`(:248이 이전 값 줄) · :466-470 `simpleValueOrDefault`
- domain/action-log/changes.ts:20-40 `buildChanges`(같은 값이면 칸을 싣지 않음, undefined는 null)
- domain/approvals/route-step-settings.ts:32-35 `withOrgUnitFallback` · :52-58 entries(:57이 특정 부서 칸) · :79-92 기록 루프. 특정 부서 스키마는 keys.ts:535 `z.union([z.literal(""), z.string().uuid()])`, 연차 3단 키는 keys.ts:643-672(역할 기본 "" · 범위 기본 "org_unit" · 특정 부서 기본 없음)
- domain/settings/keys.ts:829-845 `PROJECT_COST_RATE_PCT`(:835가 preprocess)
- test/unit/settings/registry.test.ts:150-194(setSettingValue describe — deps 주입 꼴, :167-185 이전 값 단언 예)
- test/unit/domain/set-simple-setting-tx.test.ts:1-50(`vi.hoisted` + `vi.mock("@/lib/db-transaction")` · `vi.mock("@/repositories/settings")` 꼴 — 새 결재선 단위 시험이 따른다)
- test/unit/settings/phase7-keys.test.ts:107-147(원가율 describe, :117-122 비움 ≠ 0 사례)
- test/e2e/role-smoke.spec.ts 전체(63줄) · playwright.config.ts의 프로젝트 이름 `desktop`(:116)
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 설정 저장 로그의 이전 값 = 화면이 보인 값 (① registry · ② 결재선 특정 부서)</name>
  <files>test/unit/settings/registry.test.ts, domain/settings/registry.ts, test/unit/domain/route-step-settings-changes.test.ts, domain/approvals/route-step-settings.ts</files>
  <behavior>
    - ①-1: `setSettingValue(viewer, PAYMENT_TERM_DAYS, 30, deps)`에서 `findSimpleValue`가 undefined(저장 행 없음)면 recordAction 두 번째 인자의 `detail`이 `{ key: "payment.term_days", changes: { value: [60, 30] } }`다.
    - ①-2: 같은 조건에서 60을 저장하면 recordAction은 한 번 불리고 `detail.changes`가 `{}`다.
    - ①-3(기존 유지): 저장 행 `{ value: 0.1 }`이 있으면 `[0.1, 0.4]`(registry.test.ts:167-185 그대로 녹색).
    - ②-1: 연차 결재선 3단(`kind` = 연차 문서 종류 키, `stepIndex: 3`)에 `{ enabled: true, roleId: "", scope: "company" }`(특정 부서 생략)를 저장하고 잠금 읽기가 빈 배열(저장 행 없음)이면, 특정 부서 키(`approval_route.leave.step3.org_unit_id`)로 기록된 `detail.changes`가 `{}`다(고치기 전 `{ value: [null, ""] }` — 검토 재현 tmp-rev-money-c와 같은 입력).
    - ②-2: `listDocumentKinds()`의 모든 종류 × `routeSettings.steps` 중 특정 부서 정의에 `default`가 없는 단계마다, 각 칸을 기본값으로(특정 부서는 생략) 저장 행 없이 저장하면 특정 부서 키 기록이 `changes: {}`다 — 지출 · 정산 3단도 덮는다. 기본값이 없어 스키마를 통과하지 못하는 칸이 있는 단계는 그 칸에 스키마를 통과하는 값을 직접 준다(빈 값으로 덮지 않는다).
    - ②-3: 같은 단계에 특정 부서로 uuid 하나를 주면 그 키 기록이 `{ value: ["", 그 uuid] }`다.
  </behavior>
  <action>
    Skill 도구로 `superpowers:test-driven-development`를 먼저 호출한다.

    ① RED: registry.test.ts의 `describe("setSettingValue (비이력형 전용)")` 안에 behavior ①-1 · ①-2 사례를 더한다. `PAYMENT_TERM_DAYS`는 `@/domain/settings/keys`에서 import하고, deps는 :167-185와 같은 꼴(can · upsertSimpleValue · recordAction · withTransaction · findSimpleValue(undefined로 resolve) · lockSimpleKey)로 주입한다. `pnpm vitest run test/unit/settings/registry.test.ts`를 돌려 두 사례가 `[null, 30]` · `{ value: [null, 60] }` 실제값으로 실패하는 것을 확인하고 그 출력 줄을 저장한다.
    ① GREEN: registry.ts:248 한 줄만 바꾼다 — `findSimpleValue` 결과 행을 받아 행이 있으면 `row.value`, 없으면 `def.default ?? null`을 이전 값으로 쓴다(가져오기 경로 export.ts:223 · `effectiveValueAt`과 같은 규칙, 저장된 원값이 스키마 밖이어도 원값 그대로 — 기본값으로 바꾸지 않는다). 잠금 · 읽기 · 저장 · 기록 순서와 tx는 그대로 둔다. 다시 돌려 녹색. 커밋: `fix: use setting default as previous value in settings_change log` — 본문에 「저장값 없는 키의 첫 저장 이전 값을 기본값으로(07-04 truth 1 · 가져오기 · 결재선 경로와 같게), 기본값과 같으면 changes 빈 객체 — round2-money F1」.

    ② RED: 새 파일 test/unit/domain/route-step-settings-changes.test.ts를 set-simple-setting-tx.test.ts 꼴로 만든다 — `vi.hoisted`로 `withTransaction`(받은 함수를 가짜 tx로 바로 실행) · `lockRouteStep`(resolve) · `lockSimpleValues`(빈 배열 resolve)를 만들고 `vi.mock("@/lib/db-transaction")` · `vi.mock("@/repositories/settings")`에서 원본을 펼친 뒤 그 셋만 갈아 끼운다. `saveRouteStepSettings`는 동적 import한다. `can` · `upsertSimpleValue` · `recordAction`은 deps로 주입한다(RouteStepSettingsDeps). 연차 종류 키 · 단계 정의는 `@/domain/approvals/kinds`의 `listDocumentKinds` · `getDocumentKind`로 읽는다(문자열을 하드코딩하지 않는다). behavior ②-1 · ②-2 · ②-3을 작성하고 돌려 ②-1 · ②-2가 `[null, ""]`로 실패하는 출력을 저장한다(②-3은 고치기 전 `[null, uuid]`로 실패할 수 있다 — 그것도 기록).
    ② GREEN: route-step-settings.ts:57 특정 부서 entry의 `previous`만 `simpleValueOrDefault(step.orgUnitId, row) ?? ""`로 바꾼다 — 새 값에 거는 `withOrgUnitFallback`과 같은 빈 값 대체(이전 = 화면이 보인 값). 나머지 세 entry · 기대값 비교(:67-78) · 기록 루프(:79-92)는 그대로. 다시 돌려 녹색. 커밋: `fix: skip unchanged empty org unit in route step change log` — 본문에 「기본값 없는 특정 부서 칸의 이전 값에도 빈 값 대체를 걸어 바뀌지 않은 저장이 [null, ""] 가짜 변경을 남기지 않게 — round2-money F2(연차 · 지출 · 정산 3단)」.

    끝으로 관련 통합 시험을 한 명령으로 돌린다(verify 두 번째 줄). `action-log-changes.test.ts:73`의 `[null, 10]`은 기본값 없는 시험 키라 그대로 녹색이어야 한다. 빨가면 Skill `superpowers:systematic-debugging`을 호출하고 원인을 밝힌다 — 기대값이 고치기 전 동작(기본값 있는 키의 `[null, x]` · 특정 부서 `[null, ""]`)을 담은 시험이면 그 파일은 이 플랜 범위 밖이므로 고치지 말고 멈춰 SUMMARY · 반환 메시지에 파일 · 사례 · 전후 값을 적는다.
  </action>
  <verify>
    <automated>pnpm vitest run test/unit/settings/registry.test.ts test/unit/domain/route-step-settings-changes.test.ts test/unit/domain/set-simple-setting-tx.test.ts</automated>
    <automated>pnpm vitest run --project integration test/integration/action-log-changes.test.ts test/integration/settings-approval-route.test.ts</automated>
  </verify>
  <done>behavior ①-1~②-3 단위 사례가 녹색이고 고치기 전 실패 출력이 저장됨. 통합 두 파일 녹색. 커밋 2개(각 두 파일), registry.ts · route-step-settings.ts의 제품 코드 변경은 각각 이전 값 한 줄(+ 주석 한 줄 이내).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 원가율 공백 = 비움 (③) · role-smoke 열림 = 그 경로 (⑤)</name>
  <files>test/unit/settings/phase7-keys.test.ts, domain/settings/keys.ts, test/e2e/role-smoke.spec.ts</files>
  <behavior>
    - ③: `PROJECT_COST_RATE_PCT.schema.parse(" ")`와 `parse("\t")`와 `parse("   ")`가 null이다. 기존 :117-122(빈 문자열 · null → null, 0 · "0" → 0)와 범위 거부 문구 사례는 그대로 녹색.
    - ⑤: `open` 행은 `response.status() === 200`이고 `new URL(page.url()).pathname === row.path`다. `404` 행 판정은 지금 그대로(상태 404).
  </behavior>
  <action>
    ③ RED: phase7-keys.test.ts의 `describe("원가율 키 (D-734 · C-P2-10)")`에 「공백만 있는 문자열은 비움(null)이다」 사례를 더해 behavior ③의 세 입력을 단언한다. `pnpm vitest run test/unit/settings/phase7-keys.test.ts`로 `" "`가 0으로 읽혀 실패하는 출력을 저장한다.
    ③ GREEN: keys.ts:835 preprocess의 빈 값 판정에 「문자열이고 trim() 결과가 빈 문자열」을 더한다(null · undefined 판정은 그대로, 숫자 강제 변환 · 범위 refine · nullable은 그대로). 다른 키의 preprocess는 건드리지 않는다. 녹색 확인 뒤 커밋: `fix: treat whitespace-only cost rate as empty` — 본문에 「공백 문자열이 z.coerce.number()에서 0이 되던 것을 비움(null)으로 — D-734 비움 ≠ 0, 가져오기 · 액션 직접 호출 경로 — round2-ui F2」.

    ⑤ RED(시험의 시험): role-smoke.spec.ts에서 행 하나를 판정하는 부분(:58-59)을 같은 파일 안의 작은 함수(예: `expectRow(page, row, label)` — 이동 · 상태 단언)로 꺼내 loop가 그 함수를 부르게 한다. 같은 파일 끝에 임시 탐침 test를 하나 더한다 — 로그인 없이 `expectRow`로 `{ path: "/admin/permissions", expect: "open" }`을 판정한다(세션이 없으면 `/login`으로 리다이렉트된 뒤 200). `pnpm exec playwright test test/e2e/role-smoke.spec.ts --project=desktop --no-deps --reporter=line`을 돌려 탐침이 **통과**하는 출력(리다이렉트가 열림으로 세어지는 구멍)을 저장한다.
    ⑤ GREEN: `expectRow`의 open 분기에 최종 경로 단언을 더한다 — `new URL(page.url()).pathname`이 `row.path`와 같아야 하고, 단언 메시지에 계급 이름 · 경로를 넣는다(:59와 같은 꼴). 같은 명령을 다시 돌려 탐침이 「기대 /admin/permissions · 실제 /login」으로 **실패**하고 계급 다섯 사례는 통과하는 출력을 저장한다. 그다음 탐침 test를 지우고 완료 판정 명령(verify 두 번째 줄, `CI=true` — 프로덕션 빌드라 수 분 걸리므로 timeout을 넉넉히, 필요하면 백그라운드)으로 계급 사례 전부 녹색을 확인한다. 계급 사례가 빨가면(어떤 open 행이 실제로 리다이렉트되는 경우) 표의 기대값을 고치지 말고(파일 머리 주석 :14 규칙) 멈춰 SUMMARY · 반환 메시지에 계급 · 경로 · 최종 URL을 적는다. 커밋(탐침 없는 상태): `test: assert final path for open rows in role smoke` — 본문에 「page.goto는 리다이렉트를 따라간 최종 응답을 주므로 open 행에 최종 경로 단언 — round2-ui F3, 탐침으로 고치기 전 통과 · 고친 뒤 실패 확인」.
  </action>
  <verify>
    <automated>pnpm vitest run test/unit/settings/phase7-keys.test.ts</automated>
    <automated>CI=true pnpm exec playwright test test/e2e/role-smoke.spec.ts --project=desktop --no-deps --reporter=line</automated>
  </verify>
  <done>phase7-keys 녹색(공백 사례 포함). role-smoke가 `CI=true`에서 녹색이고 커밋된 파일에 탐침 test가 없다. 탐침의 고치기 전 통과 · 고친 뒤 실패 출력이 SUMMARY에 있다. 커밋 2개(③ 두 파일 · ⑤ 한 파일).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 관리자 → 설정 저장 액션 · 설정 가져오기 | 입력 값(원가율 문자열 등)이 스키마를 지나 저장되고 행동 로그에 전후 값이 남는다 |
| E2E 검수 → 권한 회귀 | 리다이렉트 꼴 권한 회귀가 「열림」으로 세어지면 검수를 지난다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cwp-01 | Repudiation | registry.ts setSettingValue · route-step-settings.ts 기록 | low | mitigate | Task 1 — 이전 값 = 화면이 보인 값(기본값 · 빈 값 대체), 바뀌지 않은 칸은 빈 changes. 단위 + 통합 action-log-changes 녹색 |
| T-cwp-02 | Tampering | keys.ts PROJECT_COST_RATE_PCT | low | mitigate | Task 2 — 공백 문자열을 비움(null)으로, 0과 구분(D-734) |
| T-cwp-03 | Elevation of Privilege | test/e2e/role-smoke.spec.ts | low | mitigate | Task 2 — open 행 최종 경로 단언, 탐침으로 리다이렉트 검출 증명 |
</threat_model>

<verification>
- `pnpm vitest run test/unit/settings/registry.test.ts test/unit/domain/route-step-settings-changes.test.ts test/unit/domain/set-simple-setting-tx.test.ts test/unit/settings/phase7-keys.test.ts` 녹색
- `pnpm vitest run --project integration test/integration/action-log-changes.test.ts test/integration/settings-approval-route.test.ts` 녹색(한 명령)
- `CI=true pnpm exec playwright test test/e2e/role-smoke.spec.ts --project=desktop --no-deps --reporter=line` 녹색
- `pnpm typecheck` · `pnpm lint` 녹색
- `git diff --name-only origin/main...HEAD`가 frontmatter `files_modified` 안의 파일만 담는다(app/ · ui/ · 위험 경로 없음)
- 「완료」 전에 Skill `superpowers:verification-before-completion`을 호출하고 위 명령들의 실제 출력 요약(통과 수 · 실패 수)과 고치기 전 실패 출력을 SUMMARY에 적는다
</verification>

<success_criteria>
- payment.term_days 첫 저장 30 → `[60, 30]`, 60 → `{}`; 기본값 없는 키 첫 저장 → `[null, 값]` 그대로
- 결재선 단계 저장: 바뀌지 않은 빈 특정 부서 칸 → `{}`(모든 문서 종류 · 단계), 빈 값 → uuid → `["", uuid]`
- 원가율 " " · "\t" → null, "" → null, "0" → 0
- role-smoke: open 행이 최종 경로까지 단언, CI=true 녹색, 탐침 증명 기록
- 커밋 4개, 결함마다 한 커밋, 고치기 전 실패 출력이 SUMMARY에 있음
- test/integration/admin-cap-restore.test.ts · domain/archive/ 변경 없음(④는 범위 밖)
</success_criteria>

<output>
Create `.planning/quick/261022-cwp-07-post-review-main-defect-fixes-setting/261022-cwp-SUMMARY.md` when done (커밋하지 않는다). 결함별 절(① · ② · ③ · ⑤)마다: 고치기 전 실패 출력 발췌 · 바꾼 줄 · 커밋 해시 · 녹색 출력 요약. ④는 「범위 밖 — 사용자 결정 대기(권한 설계)」 한 줄만.
</output>
