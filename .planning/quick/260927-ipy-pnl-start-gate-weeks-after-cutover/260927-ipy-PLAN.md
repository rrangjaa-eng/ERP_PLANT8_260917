---
phase: quick-260927-ipy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - test/unit/settings/registry.test.ts
  - domain/settings/keys.ts
autonomous: true
requirements: [QUICK-260927-ipy]

estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "SETTING_DEFS에 키 pnl.start_gate.weeks_after_cutover가 없다. 이를 단언하는 단위 테스트가 먼저 실패(RED)하는 것을 확인했고, 삭제 뒤 통과(GREEN)한다"
    - "관리자 설정 화면(/admin/settings)은 SETTING_DEFS를 순회하므로 '손익 착수 대기 주수' 필드와 '손익' 섹션이 더는 나오지 않는다. 다른 키의 섹션·필드는 그대로다"
    - "시드(domain/seed/index.ts)와 설정 내보내기(domain/settings/export.ts)도 SETTING_DEFS를 순회하므로 이 키를 새로 시드하거나 내보내지 않는다. 이미 저장된 DB 행은 마이그레이션 없이 그대로 두며, 저장 액션이 SETTING_DEFS에 없는 키를 거부하므로 그 행은 아무 데서도 읽히지 않는다"
    - "domain·app·lib·repositories·scripts 어디에도 이 설정의 키 문자열이나 상수 이름이 남지 않는다"
    - "pnpm test:unit(registry-coverage 포함)·pnpm lint·pnpm typecheck가 모두 통과한다. 변경은 테스트 파일 1개와 keys.ts 1개뿐이다"
  artifacts:
    - path: "test/unit/settings/registry.test.ts"
      provides: "SETTING_DEFS에 삭제된 손익 착수 대기 키가 없음을 단언하는 회귀 테스트 1개"
      contains: "SETTING_DEFS"
    - path: "domain/settings/keys.ts"
      provides: "손익 착수 대기 설정 정의와 SETTING_DEFS 항목이 빠진 레지스트리"
  key_links:
    - from: "test/unit/settings/registry.test.ts"
      to: "domain/settings/keys.ts의 SETTING_DEFS"
      via: "@/domain/settings/keys에서 SETTING_DEFS를 import해 key 목록을 검사"
      pattern: "from \"@/domain/settings/keys\""
    - from: "domain/settings/keys.ts의 SETTING_DEFS"
      to: "app/(app)/admin/settings/page.tsx·actions.ts, domain/seed/index.ts, domain/settings/export.ts"
      via: "소비자 네 곳이 모두 SETTING_DEFS 배열 하나만 순회·조회한다 — 배열에서 빼는 것만으로 화면·저장·시드·내보내기에서 사라진다"
      pattern: "SETTING_DEFS"
---

<objective>
설정 키 pnl.start_gate.weeks_after_cutover(상수 PNL_START_GATE_WEEKS_AFTER_CUTOVER, 화면 이름 "손익 착수 대기 주수")를 설정 레지스트리에서 삭제한다.

Purpose: 2026-09-27 사용자 결정 — Phase 9(프로젝트 손익)는 전환 후 N주 실입력을 기다리지 않고 테스트 데이터로 검증한다. ROADMAP Phase 9는 이미 고쳤고(커밋 5ee66f1, "설정 `pnl.start_gate.weeks_after_cutover`는 삭제한다"), 이 작업은 코드 쪽 반영이다. 이 키는 ADMN-05 레지스트리의 readBy 예외(phase 9)로만 존재했고 settings 밖에서 읽는 곳이 없다.

Output: 실패→통과를 확인한 회귀 테스트 1개(test/unit/settings/registry.test.ts), 정의·배열 항목이 빠진 domain/settings/keys.ts. 커밋 2개(test: RED, chore: GREEN).
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

계획 시점 실측(HEAD 5ee66f1) — 편집 범위는 이 관찰에서만 나온다:
- domain/settings/keys.ts 314~323행: 정의 블록(export const 한 개, simple, namespace "손익", default 2, readBy phase "9"). 324행은 빈 줄, 325행부터 "// Phase 04.2(D-4202)" 주석과 NOTIFY_TICK_BATCH_MAX 정의.
- domain/settings/keys.ts 367행: SETTING_DEFS 배열 안의 항목 한 줄(PROJECT_CUSTOMER_APPROVAL_GATE와 NOTIFY_TICK_BATCH_MAX 사이).
- 저장소 전체(node_modules·.git·.planning·.next 제외)에서 이 키 문자열·상수 이름·라벨이 나오는 파일은 domain/settings/keys.ts 하나뿐이다.
- SETTING_DEFS 소비자: app/(app)/admin/settings/page.tsx(순회해 화면 생성), app/(app)/admin/settings/actions.ts(없는 키 거부), domain/seed/index.ts(기본값 시드), domain/settings/export.ts(내보내기 순회, 가져오기 시 없는 키는 issue). 어느 것도 수정하지 않는다.
- test/unit/settings/keys-hint-style.test.ts가 이미 @/domain/settings/keys를 단위 프로젝트에서 import한다 — keys.ts는 단위 테스트에서 로드된다(lib/env 포함).
- test/unit/settings/registry-coverage.test.ts는 keys.ts를 소스 검색으로 파싱해 readBy 예외를 검사한다. 키가 빠지면 readBy 목록에서 사라질 뿐 수정할 필요 없다.
- 커밋 전 훅(.claude/hooks/plant8-skill-gate.sh): 코드 파일을 쓰기 전에 Skill test-driven-development, 커밋 전에 Skill verification-before-completion을 **실행 에이전트 자신이** 호출해야 한다(안 하면 Edit·commit이 거부된다).

tracer 과제를 두지 않는다: 새 경로를 잇는 작업이 아니라 레지스트리 배열의 항목 하나를 빼는 삭제다. 모든 소비자가 SETTING_DEFS 하나만 보므로 Task 1의 RED→Task 2의 GREEN이 곧 끝에서 끝까지의 증명이다.
</context>

<!-- planner-discipline-allow: weeks_after_cutover -->
<!-- planner-discipline-allow: pnl.start_gate.weeks_after_cutover -->
<!-- planner-discipline-allow: PNL_START_GATE_WEEKS_AFTER_CUTOVER -->

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — SETTING_DEFS에 손익 착수 대기 키가 없음을 단언하는 실패 테스트</name>
  <files>test/unit/settings/registry.test.ts</files>
  <read_first>test/unit/settings/registry.test.ts (1~20행 import 구역과 229~244행 마지막 describe만), test/unit/settings/keys-hint-style.test.ts 1~5행(keys import 전례)</read_first>
  <behavior>
    - SETTING_DEFS의 key 목록에 문자열 "pnl.start_gate.weeks_after_cutover"가 들어 있지 않다
    - 지금(삭제 전)은 이 키가 배열에 있으므로 테스트가 단언 실패로 RED가 된다 — import 오류·타입 오류로 실패하면 안 된다
  </behavior>
  <action>
    시작 전에 Skill 도구로 test-driven-development를 호출한다(훅이 강제한다).

    test/unit/settings/registry.test.ts 상단 import 구역의 "@/domain/settings/registry" import 바로 뒤에 "@/domain/settings/keys"에서 SETTING_DEFS를 가져오는 import 한 줄을 추가한다(keys-hint-style.test.ts와 같은 형태).

    파일 맨 끝(listSettingHistory describe 뒤)에 describe 블록 하나를 추가한다. describe 이름은 "SETTING_DEFS", it 이름은 한국어 한 문장으로 "손익 착수 대기 주수 키가 등록돼 있지 않다(손익은 테스트 데이터로 검증 — 2026-09-27 결정)". 본문은 SETTING_DEFS를 key로 map한 배열이 문자열 "pnl.start_gate.weeks_after_cutover"를 포함하지 않는다는 expect 하나(not.toContain)뿐이다. 상수 이름으로 import하지 않는다 — Task 2에서 상수가 사라지면 컴파일 오류가 나므로 키 문자열로만 검사한다. 헬퍼·추가 주석·다른 테스트 수정은 하지 않는다.

    실행: pnpm exec vitest run test/unit/settings/registry.test.ts --project unit. 결과가 "새 테스트 1개만 실패, 나머지는 통과"이고 실패 사유가 not.toContain 단언(배열에 키가 들어 있음)인지 출력에서 확인한다. 다른 사유로 실패하면 Skill systematic-debugging을 호출하고 원인을 고친 뒤 다시 RED를 확인한다.

    RED 확인 뒤 Skill verification-before-completion을 호출하고, 이 파일만 스테이징해 커밋한다. 제목 "test: assert P&L start-gate setting is not registered", 본문은 한국어로 "손익은 테스트 데이터로 검증하기로 해(2026-09-27) 전환 후 대기 주수 설정을 지운다. 삭제 전 실패(RED) 확인." 정도의 두 줄. 커밋 메시지 끝에 세션이 알려 준 attribution 줄을 붙인다.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && OUT=$(pnpm exec vitest run test/unit/settings/registry.test.ts --project unit 2>&1); echo "$OUT" | grep -Eq "Tests +1 failed" && echo "$OUT" | grep -q "to not include"</automated>
  </verify>
  <acceptance_criteria>
    - registry.test.ts에 "@/domain/settings/keys" import가 1줄 있고, 키 문자열 "pnl.start_gate.weeks_after_cutover"가 정확히 1번 나온다(grep -c 결과 1)
    - 테스트 실행 결과 실패 1개(새 테스트), 기존 테스트는 전부 통과
    - 실패 메시지가 단언 실패다(모듈 로드·타입 오류가 아니다)
    - 방금 만든 커밋의 sha를 기록하고(SUMMARY에 남긴다), git show --stat 그 sha 의 제목이 "test:"로 시작하며 변경 파일은 test/unit/settings/registry.test.ts 하나
  </acceptance_criteria>
  <done>새 단위 테스트가 단언 실패로 RED이고, 그 상태가 test: 커밋 하나로 남아 있다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — keys.ts에서 정의와 SETTING_DEFS 항목 삭제</name>
  <files>domain/settings/keys.ts</files>
  <read_first>domain/settings/keys.ts 310~330행과 341~369행만(파일 전체를 읽지 않는다)</read_first>
  <behavior>
    - Task 1의 테스트가 통과한다
    - test/unit 전체, lint, typecheck가 통과한다(registry-coverage의 readBy 검사 포함)
  </behavior>
  <action>
    domain/settings/keys.ts에서 두 곳만 지운다(2026-09-27 사용자 승인 요청 범위 그대로).

    (1) 정의 블록: PNL_START_GATE_WEEKS_AFTER_CUTOVER를 선언하는 export const 줄부터 그 블록을 닫는 "};" 줄까지, 그리고 바로 뒤의 빈 줄 하나를 지운다. 결과적으로 DOCUMENT_NUMBER_PROJECT_SEQ_START 블록의 "};" 다음에 빈 줄 하나, 그다음 "// Phase 04.2(D-4202)" 주석이 온다.

    (2) SETTING_DEFS 배열 안의 PNL_START_GATE_WEEKS_AFTER_CUTOVER 항목 한 줄을 지운다. PROJECT_CUSTOMER_APPROVAL_GATE 다음 줄이 NOTIFY_TICK_BATCH_MAX가 된다.

    그 밖의 줄(섹션 머리 주석 "뒤 페이즈가 읽는 키 (readBy 표시 있음)" 포함 — 다른 readBy 키가 남아 있다)·다른 파일·DB 마이그레이션·시드·설정 화면 코드는 건드리지 않는다. 이미 시드된 DB 행은 그대로 둔다(저장 액션이 SETTING_DEFS 밖의 키를 거부하고 화면·내보내기도 SETTING_DEFS만 순회하므로 그 행은 읽히지 않는다).

    검증 순서: pnpm exec vitest run test/unit/settings --project unit → pnpm test:unit → pnpm lint → pnpm typecheck. 출력은 요약만 본다. 실패하면 Skill systematic-debugging을 호출하고 추측 수정하지 않는다.

    모두 통과하면 Skill verification-before-completion을 호출하고, keys.ts만 스테이징해 커밋한다. 제목 "chore: remove P&L start-gate weeks setting", 본문은 한국어로 "Phase 9 손익을 전환 후 N주 실입력 대신 테스트 데이터로 검증하기로 해(2026-09-27, ROADMAP 5ee66f1) 설정 정의와 SETTING_DEFS 항목을 지운다. 이미 저장된 DB 행은 SETTING_DEFS 밖이라 읽히지 않으므로 마이그레이션은 두지 않는다." 정도. 끝에 세션 attribution 줄을 붙인다.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && pnpm exec vitest run test/unit/settings --project unit && pnpm test:unit && pnpm lint && pnpm typecheck && ! grep -rn "weeks_after_cutover\|PNL_START_GATE_WEEKS_AFTER_CUTOVER\|손익 착수 대기" domain app lib repositories scripts</automated>
  </verify>
  <acceptance_criteria>
    - grep -rn 로 domain·app·lib·repositories·scripts를 검색했을 때 키 문자열·상수 이름·라벨 "손익 착수 대기"가 0건
    - registry.test.ts의 키 문자열은 여전히 1건(회귀 테스트가 남아 있다)
    - 이 과제의 커밋 sha로 git show --stat 그 sha 를 보면 domain/settings/keys.ts 한 파일, 12줄 삭제·0줄 추가(정의 10줄 + 뒤 빈 줄 1줄 + 배열 항목 1줄)
    - pnpm exec vitest run test/unit/settings --project unit, pnpm test:unit, pnpm lint, pnpm typecheck 모두 exit 0
    - 이 과제 커밋의 제목이 "chore:"로 시작하고, 그 부모가 Task 1의 test: 커밋 sha다(git show -s --format=%P 그 sha)
  </acceptance_criteria>
  <done>설정이 레지스트리에서 사라졌고 단위 테스트·lint·typecheck가 통과하며, chore: 커밋 하나로 남아 있다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 관리자 브라우저 → 설정 저장 Server Action | 클라이언트가 보낸 key를 SETTING_DEFS에서 찾는다(없으면 거부) |
| 설정 가져오기 파일 → importSettings | 파일의 키를 SETTING_DEFS에서 찾는다(없으면 issue로 전체 거부) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q260927-01 | Tampering | app/(app)/admin/settings/actions.ts | low | accept | 지운 키로 저장을 시도해도 기존 allowlist(SETTING_DEFS.find 실패 → 거부)가 막는다. 이 작업은 그 코드를 건드리지 않는다 |
| T-q260927-02 | Information Disclosure | DB에 남은 고아 설정 행 | low | accept | 값은 정수 주수(기본 2)로 민감하지 않다. 화면·내보내기가 SETTING_DEFS만 순회해 노출되지 않는다. 마이그레이션 없음(요청 범위) |
| T-q260927-03 | Denial of Service | domain/settings/export.ts 가져오기 | low | accept | 삭제 전에 받은 내보내기 파일을 다시 가져오면 "등록되지 않은 키"로 전체가 거부된다. 관리자가 그 줄을 지우고 다시 가져오면 된다. 기존 동작(없는 키 거부)을 바꾸지 않는다 |
</threat_model>

<verification>
- Task 1에서 RED(단언 실패 1건) 확인 → Task 2에서 GREEN 확인
- pnpm exec vitest run test/unit/settings --project unit, pnpm test:unit, pnpm lint, pnpm typecheck 모두 exit 0
- 프로덕션 디렉터리(domain·app·lib·repositories·scripts)에 키 문자열·상수·라벨 0건
- 커밋 2개(test:, chore:), 각 커밋의 변경 파일이 1개씩
</verification>

<success_criteria>
- SETTING_DEFS에서 손익 착수 대기 키가 빠져 관리자 설정 화면·시드·내보내기에서 사라졌다
- 회귀 테스트가 실패→통과를 거쳐 남아 있다
- 단위 테스트·lint·typecheck 통과, 변경 파일은 정확히 2개
</success_criteria>

<output>
Create `.planning/quick/260927-ipy-pnl-start-gate-weeks-after-cutover/260927-ipy-SUMMARY.md` when done
</output>
