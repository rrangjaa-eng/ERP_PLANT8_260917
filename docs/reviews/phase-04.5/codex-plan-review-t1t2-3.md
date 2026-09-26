Reading additional input from stdin...
OpenAI Codex v0.155.1
--------
workdir: /home/user/ERP_PLANT8_260917
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a0d47f-87f2-7150-b6fc-8fea06c5e200
--------
user
ROUND-3 DELTA review of Phase 04.5 plans (Next.js 16 / TypeScript / Drizzle / PostgreSQL READ COMMITTED). Your round-2 output: docs/reviews/phase-04.5/codex-plan-review-t1t2-2.md (tail: MAJOR "새 완화책도 서로 다른 시점의 노출 판정을 합친다", MINOR "domain의 tx = db 기본값").

Change since round 2 (uncommitted, `git diff -- .planning/phases/04.5-custom-field-admin/`): plan 05 adds repository `readVendorFieldAccess(viewer, roleId|null, tx)` in repositories/permissions.ts — ONE SELECT over field_definitions LEFT JOIN two visibility_matrix aliases (cf.vendor.<key>, vendor.value) → {definitions, vendorValueVisible, visibleFieldKeys}; domain `vendorInputFieldKeys(viewer, tx?)` calls it once after `findVendorByIdForUpdate` in the same tx; domain has no `= db` default; 03's round-2 tx additions reverted; structure gate (one await), race test 「거래처 정보 끔 + 칸 켬」; T-04.5-44 row updated.

Scope: (1) each round-2 finding RESOLVED / PARTIAL / OPEN with evidence; (2) new problems only in changed lines (e.g. is the single SELECT correct for missing visibility rows/null role/archived fields; does anything else in the save path still read definitions/visibility separately; layer rules eslint.config.mjs).
Evidence rule: BLOCKER/MAJOR must cite plan file+line AND repo file:line for code claims; else [NOTE].
Output: status table, then findings `[BLOCKER|MAJOR|MINOR|NOTE] title — evidence — fix`. End with exactly one line: `판정: 막는 문제 없음` or `판정: 막는 문제 있음 (N건)`. Do not modify files. Korean. Concise.
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.
codex
라운드 2 지적과 변경된 계획을 대조하고, 저장 경로와 레이어 규칙을 확인하겠습니다. 파일은 수정하지 않습니다.

exec
/bin/bash -lc 'git diff -- .planning/phases/04.5-custom-field-admin/' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
index 402c0e1..7f17f1f 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
@@ -27,7 +27,7 @@ must_haves:
     - "정보 노출표(`/admin/visibility`)의 열은 `INFO_ITEMS` 뒤에 활성 거래처 칸 정의가 정렬 순서대로 이어 붙은 것이다 — 머리글은 칸의 한글 이름(20자 한 줄), 열 id는 `cf.vendor.<key>`. 칸이 0개면 지금과 같은 화면이고, 보관된 칸은 열이 없다. `PermissionGridClient`·`PermissionGrid`와 그 CSS(`white-space: nowrap` 포함)는 바꾸지 않는다(D10-13, ROADMAP 04.5 기준 3, UI-SPEC 화면 4, E5 zero-one-many·overflow·long-text)"
     - "노출표 저장 액션이 커스텀 항목 키를 받는다 — `cf.<entity>.<key>`는 대상이 `FIELD_DEFINITION_TARGETS` 안이고 그 키의 **활성** 정의가 있을 때만 통과하고, 없는 키·보관된 칸·대상 밖(`cf.project.…`)·형식이 틀린 키는 기존 문구 「알 수 없는 정보 항목입니다.」로 거부된다. `INFO_ITEMS` 키는 전처럼 통과한다(ROADMAP 기준 3, RESEARCH Pitfall 4)"
     - "커스텀 열 셀의 저장 실패는 기존 동작 그대로다 — 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」 + 원위치(UI-SPEC E5 error, O18)"
-    - "나중에 만든 계급도 기존 커스텀 항목 행을 받는다 — `createRole`이 계급을 넣은 뒤 대상 상수 안의 모든 칸 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 그 계급의 보임 행을 **없을 때만** 쓴다. 행 쓰기가 실패하면 그 계급에게 칸이 안 보일 뿐(기본 숨김 쪽으로 실패) 계급 생성은 남는다. 칸 생성(01)과 동시에 겹쳐도 행이 빠지지 않는다 — 두 경로가 같은 트랜잭션 잠금(01의 `lockCustomFieldGrants`)을 첫 문장으로 잡고 잠금 **뒤에** 상대 쪽 목록(계급 쪽은 칸 정의)을 **같은 `tx` 연결로** 읽는다(전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀 `DB_POOL_MAX`를 채울 때 보유자가 연결을 못 얻어 교착·시간 초과 — 계급 생성은 그 실패를 삼키므로 노출 행이 영구 누락). 고정 지연 없는 동기화 지점으로 경합을 재현한 통합 테스트와 풀 크기만큼 동시 부여 통합 테스트가 이것을 고정한다(ROADMAP 기준 3, CONTEXT 「분리로 생긴 조정」, T-04.5-07 · Codex final-2 #1·#2)"
+    - "나중에 만든 계급도 기존 커스텀 항목 행을 받는다 — `createRole`이 계급을 넣은 뒤 대상 상수 안의 모든 칸 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 그 계급의 보임 행을 **없을 때만** 쓴다. 행 쓰기가 실패하면 한 번 다시 시도하고, 그래도 실패하면 경고 로그(`role.custom_field_grant_failed`, `roleId`)를 남긴 채 계급 생성은 남는다 — 그 계급에게 칸이 안 보일 뿐(기본 숨김 쪽으로 실패)이고 조용히 남지 않는다(재시도 성공 · 두 번 실패 두 경로를 통합 테스트가 고정, eng review B-2 · T1). 칸 생성(01)과 동시에 겹쳐도 행이 빠지지 않는다 — 두 경로가 같은 트랜잭션 잠금(01의 `lockCustomFieldGrants`)을 첫 문장으로 잡고 잠금 **뒤에** 상대 쪽 목록(계급 쪽은 칸 정의)을 **같은 `tx` 연결로** 읽는다(전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀 `DB_POOL_MAX`를 채울 때 보유자가 연결을 못 얻어 교착·시간 초과 — 계급 생성은 그 실패를 삼키므로 노출 행이 영구 누락). 고정 지연 없는 동기화 지점으로 경합을 재현한 통합 테스트와 풀 크기만큼 동시 부여 통합 테스트가 이것을 고정한다(ROADMAP 기준 3, CONTEXT 「분리로 생긴 조정」, T-04.5-07 · Codex final-2 #1·#2)"
     - "배포 때 도는 시드(`seedMasterData`)는 커스텀 항목 행을 쓰지 않는다 — 관리자가 기획 PM에게서 끈 `cf.vendor.<key>`가 시드를 다시 돌린 뒤에도 꺼져 있다(ROADMAP 기준 3, D10-13)"
     - "칸을 보관해도 노출 행은 지우지 않는다 — 다음 조회에서 열만 빠지고, 복원하면 계급별 값이 그대로 돌아온다(노출 행을 지우는 코드가 이 페이즈에 없다, CONTEXT 「분리로 생긴 조정」)"
     - "거래처 DTO의 `customFields`는 **칸별로** 판정된다 — 거래처 DTO를 만드는 모든 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 활성이면서 보는 사람 계급에 `cf.vendor.<key>` 보임 행이 있는 키만 남긴다. 기존 `vendor.value`(「거래처 정보」) 판정은 그대로 먼저 적용된다 — 칸이 보이려면 「거래처 정보」와 그 칸 둘 다 켜져 있어야 한다(ROADMAP 기준 4, D10-13)"
@@ -135,7 +135,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
 - 노출표 두 출처 합치기(읽는 자리마다 옆에 더함) — **costly**(D10-13 원문의 판정): 노출표 격자·저장 허용·누수 스캔 생성기가 동적 항목을 전제하게 된다. 되돌리려면 네 자리를 함께 걷어낸다.
 - `vendor.value` AND 칸별 판정 — **reversible**: 거래처 DTO 출구 한 곳의 규칙이다.
-- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄이다.
+- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄과 그 1회 재시도·경고 로그다.
 
 </reversibility_notes>
 
@@ -159,6 +159,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - (통합) 칸 둘(정렬 2·1)을 만들면 `readVisibilityGrid`의 열이 `INFO_ITEMS` 순서 그대로 뒤에 정렬 1 → 2 순의 `{ id: "cf.vendor.<key>", label: 한글 이름 }` 둘을 더한다 · 칸 하나를 보관(`archived_at` 직접 설정)하면 그 열이 빠진다 · 칸 0개면 열이 `INFO_ITEMS`와 같다
     - (통합) `isAssignableInfoItem`: 활성 칸 키 참 · `INFO_ITEMS` 키 참 · 없는 키·보관된 칸 키·`cf.project.<key>`·`cf.vendor`·`vendor.nope` 거짓
     - (통합) 칸을 만든 뒤 `createRole`로 새 계급을 만들면 그 계급에 기존 칸(보관 포함) 전부의 보임 행이 있다 · 이미 꺼 둔 행은 덮지 않는다
+    - (통합, 기본 행 쓰기 실패 — eng review B-2 · T1) 칸을 만든 뒤 `vi.spyOn(log, "warn")`(`@/lib/log`)을 걸고 `createRole`에 `grantCustomFieldsToRole` dep을 주입한다. ① 첫 호출만 `new Error("injected")`로 거부하고 두 번째는 진짜 `grantCustomFieldsToRole`에 인자 그대로 넘기는 dep → `createRole`이 `RoleDto`를 돌려주고, 그 계급의 `cf.vendor.<key>` 노출 행이 정확히 하나·`visible = true`이며, dep 호출 2번 · 경고 로그 0번(일시 오류는 재시도로 메워진다). ② 항상 거부하는 dep → `createRole`이 던지지 않고 `RoleDto`를 돌려주며(계급 행이 DB에 있다), dep 호출 정확히 2번, `log.warn`이 `"role.custom_field_grant_failed"`와 `roleId: <새 계급 id>`를 담아 정확히 1번, 그 계급의 `cf.` 노출 행은 0개다(숨김 쪽 실패 · 조용히 남지 않음). 재시도·로그가 없는 구현에서 ①의 행 단언과 ②의 로그 단언이 빨갛다
     - (통합, 칸·계급 동시 생성 경합 — T-04.5-07 · Codex final-2 #2) 01의 `createFieldDefinition`을 시스템 관리자로 부르되 계급 목록 dep에 이 함수를 주입한다: ① 진짜 `listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx)`(dep이 받은 세 번째 인자)로 목록을 읽음 → ② `insertRole`로 계급 R을 직접 넣음(커밋됨) → ③ 프로미스 `defsRead`(와 그 resolve 함수)를 만들고, `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id, { listFieldDefinitions: 래퍼 })`를 **await 없이** 띄워 그 promise를 테스트 변수에 담음 — 래퍼는 진짜 `listFieldDefinitions`에 받은 인자를 그대로 넘겨 행을 받은 뒤 `defsRead`를 풀고 그 행을 돌려준다 → ④ `Promise.race([defsRead, waitForAdvisoryWaiter()])`를 await — `waitForAdvisoryWaiter`는 테스트 파일 안 헬퍼로, `db.execute(sql\`select 1 from pg_locks where locktype = 'advisory' and not granted\`)`가 1행 이상이 될 때까지 조회를 되풀이하는 루프다(타이머로 쉬지 않는다 — 조회 왕복 자체가 간격이고, `Date.now()`로 5초 넘으면 던진다) → ⑤ R이 빠진 목록을 돌려줌. `createFieldDefinition`과 담아 둔 promise를 둘 다 await한 뒤, R의 `cf.vendor.<새 키>` 노출 행이 정확히 하나이고 `visible = true`다. dep 안에서 grant를 await하면 교착이다(칸 트랜잭션이 잠금을 쥔 채 grant가 같은 잠금을 기다린다) — 기다리지 않는다. 고정 지연 없이 결정적이다: 잠금이 **없으면** grant가 곧장 정의를 읽어 `defsRead`가 풀리고(칸은 아직 커밋 전이라 새 칸을 못 봄) 반드시 R 행이 없다(RED). 01이 계급 목록을 잠금 전에 읽는 변형도 grant가 먼저 잠금을 잡고 정의를 읽어 `defsRead`로 끝나 RED다. 잠금이 **있으면** grant는 정의를 읽기 전에 잠금 대기에 걸려 `pg_locks`에 `granted = false` 행이 생기고 → race가 풀려 칸 트랜잭션이 커밋 → grant가 이어서 새 칸을 보고 행을 쓴다(GREEN). 두 경우 모두 관측 가능한 사건으로만 진행한다(`fileParallelism: false`라 다른 파일의 advisory 잠금과 섞이지 않는다)
     - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 거래처 칸 하나를 `createFieldDefinition`으로 만든 뒤 `insertRole`로 계급 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개를 넣고, 그 계급마다 `grantCustomFieldsToRole`을 `Promise.all`로 동시에 부르면 전부 끝나고 계급마다 그 칸의 `cf.vendor.<key>` 노출 행이 정확히 하나다(`createRole`은 grant 실패를 삼키므로 grant를 직접 불러 실패가 드러나게 한다). 정의를 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 시간 초과로 빨갛다
     - (통합) 기획 PM 계급의 `cf.vendor.<key>`를 `setVisibilityCell`로 끈 뒤 `seedMasterData`를 다시 돌려도 꺼져 있다
@@ -167,7 +168,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - (E2E) 시스템 관리자가 칸을 추가 → `/admin/visibility`에 그 이름의 열 머리글이 있고 셀이 전부 켜져 있다 → 기획 PM 행의 그 칸 셀을 끄면 새로 고침 뒤에도 꺼져 있다
   </behavior>
   <action>
-① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다).
+① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다). `createRole` 기본 행 쓰기 실패 케이스(behavior 「eng review B-2 · T1」)도 이 RED에 넣고, 재시도·경고 로그 없이 grant 한 번만 부르는 ⑤ 초안에서 ①·② 단언이 빨간 출력을 SUMMARY에 인용한다.
 
 ② `domain/custom-fields/visibility.ts`에 더한다: `customFieldColumns(viewer)` — `FIELD_DEFINITION_TARGETS`마다 `listFieldDefinitions`에서 `archivedAt`이 null인 정의를 기존 정렬 그대로 `{ id: customFieldInfoItem(entity, key), label }`로. `isAssignableInfoItem(infoItem)` — `INFO_ITEMS`에 있으면 참, 아니면 `parseCustomFieldInfoItem` → 대상이 상수 안 → 그 대상의 활성 정의에 키가 있으면 참(조회는 `SYSTEM_VIEWER`). `grantCustomFieldsToRole(viewer, roleId, deps?)` — `deps`는 `listFieldDefinitions` 하나만 주입 가능(기본값은 리포지토리 함수 · 01의 `*Deps` 선례 · 운영 호출은 두 인자 그대로), 한 `withTransaction`(`lib/db-transaction.ts`) 안에서 **첫 문장** 01의 `lockCustomFieldGrants(viewer, tx)`(01의 칸 생성과 같은 잠금 — T-04.5-07) → 그 **뒤에** 대상 상수 안의 모든 정의(보관 포함)를 `listFieldDefinitions(viewer, entity, tx)`로 읽음(잠금을 쥔 **같은 연결** — 01 Task 1④와 같은 이유: 전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀을 채울 때 보유자가 연결을 못 얻는다. 잠금을 잡은 뒤의 조회라 먼저 커밋된 칸을 전부 본다) → 정의마다 01의 `insertVisibilityIfAbsent(…, { visible: true }, tx)`. 잠금 전에 정의를 읽거나 잠금 없이 돌리면 동시에 만들어지는 칸을 놓쳐 그 계급에게 칸이 영구히 숨는다(칸 쪽은 잠금 뒤 계급 목록을 읽으므로 둘 중 하나만 먼저 돈다). RED 확인은 두 단계다: 잠금 줄 없이 먼저 구현한 grant로 behavior의 경합 케이스가 빨간 것을 보고 → 잠금을 더하되 정의를 `tx` 없이 읽는 상태에서 풀 고갈 케이스가 시간 초과로 빨간 것을 본 뒤(교착이 풀에 남아 뒤 케이스까지 멈추므로 이 확인은 그 케이스만 `-t`로 돌린다) → `tx`를 넘겨 둘 다 초록으로 만든다(두 실패 출력을 SUMMARY에 인용). 이 모듈은 `domain/permissions/roles.ts`를 import하지 않는다(순환 방지).
 
@@ -175,7 +176,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
 ④ `app/(app)/admin/visibility/actions.ts`: `infoItem`의 정적 `Set` refine을 `isAssignableInfoItem` 비동기 refine으로 바꾸고 메시지는 기존 「알 수 없는 정보 항목입니다.」 그대로. 이 변경으로 쓰이지 않게 된 `infoItemKeys`·`INFO_ITEMS` import를 지운다(자기 변경이 만든 고아만).
 
-⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — 계급은 이미 생겼으므로 — 운영 로그 `log.warn` 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패). 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
+⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
 
 ⑥ 시드: `domain/seed/index.ts`는 고치지 않는다 — 통합 테스트로 「시드는 커스텀 항목 행을 쓰지 않는다」를 증명한다.
 
@@ -185,7 +186,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm test:unit</automated>
     <fails_when>eslint·tsc·next build가 error로 끝나거나 vitest unit failed가 1 이상이다 — 특히 `import-cycles`(roles ↔ custom-fields 순환)</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/visibility.test.ts test/integration/roles.test.ts test/integration/seed-permissions.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·기본 행 쓰기 실패 경로(재시도 뒤 행 있음 · 두 번 실패 시 계급 남음 + 경고 로그 1번 + `cf.` 행 0개)·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/permissions-grid.spec.ts</automated>
     <fails_when>playwright failed 개수가 1 이상이다 — 커스텀 열 머리글·셀 토글 저장, 또는 기존 권한표·노출표 E2E 회귀</fails_when>
   </verify>
@@ -193,6 +194,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - `app/(app)/admin/visibility/actions.ts`에 정적 `infoItemKeys` Set이 남아 있지 않고 `isAssignableInfoItem`을 쓴다
     - `test/integration/custom-field-visibility.test.ts`에 `admin.visibility` 쓰기가 없는 계급의 `cf.vendor.` 셀 변경이 `ForbiddenError`이고 행·행동 로그가 그대로인 케이스가 있다(`grep -c "ForbiddenError" test/integration/custom-field-visibility.test.ts`가 1 이상)
     - `grantCustomFieldsToRole` 본문에서 `lockCustomFieldGrants(`가 `listFieldDefinitions(`보다 먼저 오고 같은 `withTransaction` 안이며, 그 `listFieldDefinitions(` 호출(주입 dep 경유 포함)이 `tx)`로 끝난다(같은 연결) · 경합 케이스의 잠금 없는 RED 실패 출력, 풀 고갈 케이스의 `tx` 없는 RED 시간 초과 출력, 둘 다 초록인 출력이 SUMMARY에 있다
+    - `createRole`의 기본 행 쓰기 실패 경로가 고정돼 있다 — `grep -v '^\s*//' domain/permissions/roles.ts | grep -c "role.custom_field_grant_failed"`가 1이고, `grep -c 'spyOn(log, "warn")' test/integration/custom-field-visibility.test.ts`가 1 이상이며, behavior 「eng review B-2 · T1」의 ①(재시도 뒤 행 하나)·②(계급 남음 · dep 2번 · 경고 로그 1번 · `cf.` 행 0개) 두 케이스의 RED 출력과 초록 출력이 SUMMARY에 있다
     - 경합 테스트에 타이머·고정 지연이 없다 — `grep -v '^\s*//' test/integration/custom-field-visibility.test.ts | grep -c "setTimeout"`가 0이다(주석 줄 제외)
     - `git diff origin/main -- domain/permissions/info-items.ts domain/permissions/project.ts domain/permissions/dto-registry.ts ui/permission-grid "app/(app)/admin/permissions"`가 비어 있고, `git diff <이 플랜 시작 커밋> -- domain/seed/index.ts`가 비어 있다(09가 더한 새 메뉴 시드 줄 때문에 main 기준 diff는 비지 않는다)
     - 세 검증 명령이 전부 초록이다
@@ -271,7 +273,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | T-04.5-04 | Information Disclosure | 거래처 DTO 출구 다섯 · 폼 정의 목록 | high | mitigate | 모든 출구가 로컬 DTO 함수 하나로 `pickVisibleCustomFields` — 활성 ∩ 보임 키만. 「거래처 정보」 판정이 먼저라 노출 범위가 넓어지지 않는다. 누수 스캔 커스텀 축 + 끈 계급 화면 HTML E2E로 증명 |
 | T-04.5-06 | Elevation of Privilege | 배포 시드 | medium | mitigate | 시드는 커스텀 항목 행을 쓰지 않는다 — 끈 뒤 재시드 통합 테스트 |
 | T-04.5-07 | Tampering | 칸 생성(01) ↔ 계급 생성(`grantCustomFieldsToRole`) 동시 실행 | medium | mitigate | 01과 같은 위협의 계급 쪽 절반. 두 경로가 같은 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`를 첫 문장으로 잡고 잠금 뒤에 상대 목록을 같은 `tx` 연결로 읽어 직렬화된다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생기고, 잠금 보유자가 두 번째 풀 연결을 요구하지 않아 풀 고갈 교착이 없다. await 없이 띄운 grant와 고정 지연 없는 동기화 지점(`defsRead` · `pg_locks` 대기 행)으로 경합을 재현한 통합 테스트가 잠금 없는 RED → 잠금 뒤 초록으로, 풀 크기만큼 동시 부여 통합 테스트가 같은 연결 조회를 고정한다(Task 1) |
-| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 숨김 쪽으로 실패한다 |
+| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 한 번 재시도 뒤 숨김 쪽으로 실패하고 경고 로그 `role.custom_field_grant_failed`(`roleId`)를 남긴다 — 조용히 행 없는 계급이 남지 않는다(Task 1 통합 테스트, eng review B-2) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — 의존성 객체·lockfile diff 없음 |
 </threat_model>
 
@@ -295,7 +297,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | 종류 | 이름 / 경로 |
 |---|---|
 | 함수(신규, domain) | `customFieldColumns` · `isAssignableInfoItem` · `visibleCustomFieldKeys` · `grantCustomFieldsToRole` · `pickVisibleCustomFields`(`domain/custom-fields/visibility.ts`) |
-| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
+| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행 · 실패 시 1회 재시도 → 경고 로그, `RoleWriteDeps.grantCustomFieldsToRole` 주입 지점) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
 | 테스트 | `test/integration/custom-field-visibility.test.ts`(권한 없는 계급의 `cf.` 셀 거부 · 노출 행 없는 정의의 기본 숨김 포함) · `test/integration/leak-scan.test.ts` 커스텀 칸 축 · `test/e2e/custom-field-visibility.spec.ts` |
 | 다른 플랜에 건 요구 | 01/08 마이그레이션의 기존 거래처 정의 노출 행 일회성 백필과 그 검증(그룹 A 소유 — `<objective>` 선행 조건) |
 | 결정 기록 | `<assumption_delta_decision>` add-alongside(받아들인 빚 — Phase 10에서 promote) |
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
index 29041cc..60c3783 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
@@ -8,6 +8,7 @@ files_modified:
   - domain/custom-fields/preserve.ts
   - domain/vendors/index.ts
   - repositories/vendors.ts
+  - repositories/permissions.ts
   - app/(app)/admin/vendors/actions.ts
   - app/(app)/admin/vendors/vendor-form.tsx
   - test/unit/domain/custom-fields-preserve.test.ts
@@ -26,7 +27,7 @@ must_haves:
   truths:
     - "거래처 저장은 보는 사람이 볼 수 없는 칸의 저장값을 지우거나 바꾸지 않는다 — 보관된 칸, 그 사람 계급에서 끈 칸, `vendor.value`(「거래처 정보」)가 꺼진 사람의 모든 칸이 그렇다. 서버가 저장값에서 입력 칸 밖의 키를 그대로 되살려 합친다. 안내 문구는 없다(UI-SPEC E4 hidden·stale, ROADMAP 04.5 기준 2 값 보존)"
     - "거래처 수정의 합치기와 쓰기는 원자적이다 — `updateVendor`가 `withTransaction` 안에서 그 거래처 행을 `SELECT … FOR UPDATE`로 잠가 읽고, 그 저장값으로 판정·합친 객체를 같은 트랜잭션의 UPDATE로 쓴다. 읽은 뒤 쓰기 전에 다른 사람(관리자)이 숨은 칸을 고쳐도 좁은 계급의 저장이 그 값을 이전 값으로 되돌리지 않는다 — 두 연결 경합 통합 테스트가 고정한다(Codex #1)"
-    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 03의 `visibleCustomFieldKeys(viewer, \"vendor\")`(활성 ∩ 계급별 보임), 아니면 빈 집합. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
+    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 활성 ∩ 계급별 보임(03의 `visibleCustomFieldKeys`와 같은 규칙), 아니면 빈 집합. 정의·`vendor.value` 보임·칸별 보임을 SQL 한 문(`readVendorFieldAccess`, 한 스냅숏)으로 읽어 도출한다. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
     - "거래처 정의에 아예 없는 키(보관 칸까지 포함한 대상 정의 전체 키 `knownKeys` 밖)를 하나라도 보내면 값이 비어 있어도 저장 전체를 거부하고 DB는 그대로다. 화면 문구는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(새 문구 없음)"
     - "정의는 있으나 그 사람의 입력 칸 밖인 키(보관 칸 · 그 계급에서 끈 칸 · `vendor.value`가 꺼진 사람의 모든 칸 · 노출 행 없는 칸)는 거부하지 않는다 — 제출값을 버리고 저장값을 유지하며, 나머지 칸과 기본 필드는 저장된다. 그래서 폼이 열린 사이 관리자가 칸을 보관·노출 해제해도 그 폼의 저장은 성공한다(UI-SPEC E4 stale 「서버가 저장값 되살림(값 유실 없음)」, final judge #5)"
     - "필수 판정은 UI-SPEC 화면 3 표 그대로다 — 등록: 빈칸이면 막힘 · 수정: 저장값도 비고 제출도 비면 안 바꿈(다른 칸 수정 저장 가능) · 저장값이 있는데 지우면 막힘 · 값이 있으면 타입 검증만. 막힘 문구는 텍스트·숫자·날짜 「필수 칸이 비어 있습니다 · 값 입력」, 선택형 「필수 칸이 비어 있습니다 · 선택지 고르기」(ROADMAP 기준 2 「고칠 때」 = 그 칸을 고칠 때, UI-SPEC O1)"
@@ -58,16 +59,16 @@ must_haves:
   key_links:
     - from: "domain/vendors/index.ts"
       to: "repositories/vendors.ts"
-      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
+      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → 같은 `tx`로 정의·노출 한 문 조회(`readVendorFieldAccess`) → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
       pattern: "findVendorByIdForUpdate"
     - from: "domain/vendors/index.ts"
       to: "domain/custom-fields/preserve.ts"
       via: "`createVendor`·`updateVendor`가 입력 칸 정의·`knownKeys`·저장값·제출값으로 `resolveCustomFieldsWrite` 한 번"
       pattern: "resolveCustomFieldsWrite"
     - from: "domain/vendors/index.ts"
-      to: "domain/custom-fields/visibility.ts"
-      via: "입력 칸 집합 = `vendor.value` 보임이면 `visibleCustomFieldKeys`, 아니면 빈 집합 — 폼 정의 목록과 저장 판정이 같은 함수"
-      pattern: "visibleCustomFieldKeys"
+      to: "repositories/permissions.ts"
+      via: "입력 칸 집합 = `vendorInputFieldKeys`가 `readVendorFieldAccess` 한 문으로 읽어 도출 — 폼 정의 목록·등록·수정 판정이 같은 함수"
+      pattern: "readVendorFieldAccess"
     - from: "app/(app)/admin/vendors/actions.ts"
       to: "domain/custom-fields/preserve.ts"
       via: "`CustomFieldsInvalidError`를 잡아 `returnValidationErrors(schema, { customFields: { [key]: { _errors } } })`"
@@ -192,18 +193,21 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 
 <task type="auto" tdd="true">
   <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
-  <files>domain/vendors/index.ts, repositories/vendors.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
+  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   <read_first>
     - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
     - `repositories/vendors.ts` 47–50행(`findVendorById`) · 105–110행(`updateVendor` — 전역 `db`로 쓴다)
     - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
     - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
-    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
+    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`의 규칙) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`) · `repositories/permissions.ts` 1–5행(import) · 86–98행 `findVisibility` · 119–128행 `listVisibility`(한 문으로 합칠 두 조회의 모양 — 이 둘은 바꾸지 않는다) · `repositories/field-definitions.ts` 9–15행(`listFieldDefinitions`의 조건·정렬 — 한 문 조회가 같은 조건·정렬을 쓴다) · `eslint.config.mjs` 40–46행(domain → `db` import 금지)
     - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   </read_first>
   <behavior>
     - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
     - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
+    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
+    - (한 문 조회 — 리포지토리) 거래처 정의 셋(활성 A·B, 보관 C)과 테스트 계급의 `vendor.value` 보임 · `cf.vendor.<A>` 보임 · `cf.vendor.<B>` 꺼짐 · C 행 없음 → `readVendorFieldAccess(SYSTEM_VIEWER, 계급 id)`가 `definitions` 셋(정렬 순서, 보관 포함) · `vendorValueVisible` 참 · `visibleFieldKeys` {A}를 돌려준다 · `vendor.value` 행이 없는 계급은 `vendorValueVisible` 거짓 · `roleId`가 null이면 두 보임 모두 거짓이고 `definitions`는 셋 그대로
+    - (경합 — 거래처 정보 끔 + 칸 켬, Codex t1t2-2 MAJOR 회귀) 테스트 계급에 `vendor.value` 보임 · `cf.vendor.<A>` 꺼짐이고 거래처에 A 값이 있다. 연결 1이 한 트랜잭션에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE(행 잠금)하고, `vendor.value`를 끄고, `cf.vendor.<A>`를 켠 채 커밋하지 않는다 → 사용자 `updateVendor`(A에 「사용자값」)를 기다리지 않고 시작 → `pg_locks`에 `granted = false` 행이 생길 때까지 폴링(50ms, 5초 넘으면 실패) → 커밋 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(두 보임 변경이 모두 반영된 스냅숏에서 `vendor.value`가 꺼져 입력 칸이 0개)
     - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
     - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
     - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
@@ -216,7 +220,7 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   </behavior>
   <action>
-① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
+① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용). 「한 문 조회」는 함수가 없어 빨갛다. 「경합 — 거래처 정보 끔 + 칸 켬」은 두 보임 변경이 저장의 조회 전에 모두 커밋되는 결정적 설계라 여러 문으로 읽는 초안에서도 초록일 수 있다 — 저장의 두 조회 **사이**에 커밋을 끼워 넣는 것은 도메인 안에 테스트 전용 훅 없이는 결정적으로 강제할 수 없으므로, 한 문 구조는 acceptance의 구조 게이트가 고정하고 이 케이스는 끝 상태 회귀를 고정한다(SUMMARY에 이 구분을 적는다).
 
 ② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
 
@@ -224,19 +228,20 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 - `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
 - 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
 - `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
+- `repositories/permissions.ts`에 `readVendorFieldAccess(viewer, roleId: string | null, tx: DbOrTx = db)`를 더한다 — **SELECT 한 문**(READ COMMITTED에서 한 문 = 한 스냅숏, Codex t1t2-2 MAJOR): `field_definitions`(`entity = 'vendor'`, 보관 포함, `orderBy(sortOrder, key)`)에 `visibility_matrix`를 별칭 둘(Drizzle `alias` — 설치된 `drizzle-orm/pg-core`의 기존 export)로 LEFT JOIN한다. 하나는 `(role_id, 'cf.vendor.' || key)`, 하나는 `(role_id, 'vendor.value')`다(`(role_id, info_item)` 유일이라 행이 늘지 않는다). 돌려주는 모양은 `{ definitions: 정의 행[], vendorValueVisible: boolean, visibleFieldKeys: Set<string> }`이고 행 없음·`roleId` 없음은 거짓이다(정의가 0개면 입력 칸도 0개라 `vendorValueVisible`은 쓰이지 않는다). 기존 `findVisibility`·`listVisibility`는 바꾸지 않는다.
 
 ④ `domain/vendors/index.ts`:
-- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
+- 파일 안 함수 `vendorInputFieldKeys(viewer, tx?: DbOrTx)`를 둔다(domain은 `db`를 import할 수 없다 — `eslint.config.mjs` 40–46행. 기본값 없이 받은 `tx`를 그대로 넘기고, `= db` 기본값은 리포지토리에만 있다). `readVendorFieldAccess(viewer, viewer.roleId ?? null, tx)`를 **한 번** 부르고, 그 결과만으로 `{ inputDefs, knownKeys }`를 도출한다 — `inputDefs` = `vendorValueVisible`이 참일 때 `archivedAt`이 null이고 `visibleFieldKeys`에 든 정의(칸 정렬 순서, `archived_options`·`label` 포함), 아니면 빈 배열. `knownKeys` = `definitions` **전체**의 키. 규칙은 03의 `visibleCustomFieldKeys`(활성 ∩ `cf.vendor.<key>` 보임)에 `vendor.value` AND를 건 것과 같다.
 - `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
-- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
+- 입력 칸 정의·`knownKeys`는 둘 다 `vendorInputFieldKeys`의 결과다(정의 조회를 따로 하지 않는다 — `repositories/field-definitions.ts`의 `listFieldDefinitions`는 이 플랜에서 부르지도 고치지도 않는다). 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `listVendorFieldDefinitions`·`createVendor`는 `tx` 없이(행 삽입 전) 부른다. `updateVendor`는 트랜잭션 **안에서** 행 잠금 **뒤에** `vendorInputFieldKeys(viewer, tx)`로 부른다. 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
 - `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
 - `updateVendor`:
   - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
-  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
+  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
-  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
+  - 잠금은 정의·노출 조회(한 문)·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다. 트랜잭션 격리 수준은 기본(READ COMMITTED) 그대로다 — REPEATABLE READ는 `FOR UPDATE` 직렬화 오류 재시도를 부른다.
 - **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
 
 ⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
@@ -247,13 +252,15 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
     <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」·「거래처 정보 끔 + 칸 켬」 경합에서 사용자 제출값이 관리자 값을 덮거나, 한 문 조회의 모양이 어긋나거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
     <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   </verify>
   <acceptance_criteria>
     - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
     - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
+    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `vendorInputFieldKeys(viewer, tx)`보다 먼저 오고, 콜백 안에 다른 정의·노출 조회(`ListFieldDefinitions(`·`visible(`·`findVisibility(`·`listVisibility(`·`visibleCustomFieldKeys(`)가 없다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|vendorInputFieldKeys\(|ListFieldDefinitions\(|visible\(|Visibility\(|visibleCustomFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
+    - 한 문 구조 게이트(Codex t1t2-2 MAJOR): `awk '/export async function readVendorFieldAccess/,/^}/' repositories/permissions.ts | grep -v '^\s*//' | grep -c "await"`가 1이고(쿼리 한 번), `vendorInputFieldKeys` 본문에서 리포지토리 호출은 `readVendorFieldAccess(` 하나뿐이다(`awk '/function vendorInputFieldKeys/,/^}/' domain/vendors/index.ts | grep -v '^\s*//' | grep -cE "await"`가 1) · `grep -v '^\s*//' domain/vendors/index.ts | grep -cE "tx\??: DbOrTx = db"`가 0이다(domain에 `= db` 기본값 없음)
     - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
     - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
     - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
@@ -322,7 +329,10 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | T-04.5-18 | Tampering | 보관 선택지 새 지정(요청 위조 포함) | medium | mitigate | 검증기 선택지에 보관 선택지는 그 행의 저장값 하나만 더한다. 그 밖의 보관 선택지는 칸 오류다(단위·통합) |
 | T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
 | T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
+| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·`vendor.value` 보임·칸별 보임을 `findVendorByIdForUpdate` 뒤 같은 `tx`에서 SQL **한 문**(`readVendorFieldAccess`)으로 읽는다(Task 2 action ③·④) — READ COMMITTED는 문마다 스냅숏이 달라 여러 문으로 읽으면 「거래처 정보 끔 → 칸 켬」 두 커밋 사이에 끼어 둘 다 참인 적 없는 조합으로 판정할 수 있으므로 한 스냅숏으로 판정한다(Codex t1t2-2 MAJOR · REPEATABLE READ는 쓰지 않는다). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」·「경합 — 거래처 정보 끔 + 칸 켬」 · 한 문 구조 게이트) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
+
+eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
 </threat_model>
 
 <verification>
@@ -346,8 +356,8 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | 종류 | 이름 / 경로 |
 |---|---|
 | 모듈(신규, domain 순수) | `domain/custom-fields/preserve.ts` — `resolveCustomFieldsWrite` · `CustomFieldsInvalidError` · `UnknownCustomFieldKeyError` |
-| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
-| 함수(신규) | `vendorInputFieldKeys(viewer)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
+| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션, 잠금 뒤 같은 `tx`로 정의·노출 조회) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
+| 함수(신규) | `vendorInputFieldKeys(viewer, tx?)`(파일 안) · `readVendorFieldAccess(viewer, roleId, tx)`(`repositories/permissions.ts` — 한 문 조회) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
 | 계약 | 수정 제출: 키 없음 = 안 바꿈, 빈 값 = 비움 · 칸 오류 = `validationErrors.customFields.{key}._errors` · 수정의 커스텀 값 합치기·쓰기는 행 잠금 한 트랜잭션 |
 | 테스트 | `test/unit/domain/custom-fields-preserve.test.ts` · `test/integration/vendor-custom-fields-save.test.ts`(두 연결 경합 포함) · `test/integration/custom-fields.test.ts`(노출 행 픽스처 · 거부 이유 단언) |
 | 문구 기록 | 새 문구 0 — 없는 키·타입 오류는 기존 `koreanZodErrorMessage` 줄이 커스텀 칸에 새로 나타난다 |

exec
/bin/bash -lc "cat docs/reviews/phase-04.5/codex-plan-review-t1t2-2.md; rg --files -g AGENTS.md -g eslint.config.mjs -g '*permissions*' -g '*vendor*' -g '*visibility*' -g '*field-definition*'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
Reading additional input from stdin...
OpenAI Codex v0.155.1
--------
workdir: /home/user/ERP_PLANT8_260917
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a0d47a-cf40-78c3-9939-64242f5396df
--------
user
You are an adversarial staff engineer doing ROUND-2 of a DELTA review of Phase 04.5 plans (Next.js 16 / TypeScript / Drizzle / PostgreSQL READ COMMITTED ERP). Your round-1 output: docs/reviews/phase-04.5/codex-plan-review-t1t2.md (last ~30 lines: MAJOR "T2 직렬 순서 동치는 다른 거래처 저장이 끼면 깨짐", MINOR "푸는 변경은 저장 거부 과도한 단정", NOTE on T1).

Change since round 1 (uncommitted, `git diff -- .planning/phases/04.5-custom-field-admin/`): plan 05 Task 2 action ④ now reads field definitions and visibility INSIDE the save transaction, on the same `tx`, AFTER `findVendorByIdForUpdate` locks the vendor row; `findVisibility`/`listVisibility`/`visibleCustomFieldKeys` gain optional `tx` (plans 03/05); new integration test 「경합 — 숨김 후 저장」; T-04.5-44 is now high/mitigate. Rationale: definition/visibility changes never touch vendor rows, so the row lock is the serialization point — changes committed before the lock are seen; changes committed after cannot combine with another save of the same vendor (that save waits on the lock and then reads fresh definitions). You claimed moving reads in-tx is insufficient; if you still think so, give a CONCRETE interleaving under READ COMMITTED with the new plan text.

Scope: (1) each round-1 finding RESOLVED / PARTIAL / OPEN with evidence; (2) new problems only in the changed lines.
Evidence rule: every BLOCKER or MAJOR must cite plan file + line AND, for code claims, repo `file:line`. Otherwise [NOTE].
Output: status table, then `[BLOCKER|MAJOR|MINOR|NOTE] title — evidence — fix`. End with exactly one line: `판정: 막는 문제 없음` or `판정: 막는 문제 있음 (N건)`. Do not modify files. Korean. Concise.
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.
codex
라운드 1 지적과 변경 diff를 대조하고, 새 트랜잭션 순서에서 실제 가능한 경합을 확인하겠습니다. 파일은 수정하지 않겠습니다.

exec
/bin/bash -lc "pwd; rg --files -g 'AGENTS.md' -g '*04.5*' docs/reviews .planning | head -60" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
/home/user/ERP_PLANT8_260917
.planning/phases/04.5-custom-field-admin/04.5-PATTERNS.md
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-RESEARCH.md
.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-VALIDATION.md

exec
/bin/bash -lc 'git diff -- .planning/phases/04.5-custom-field-admin/' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
index 402c0e1..8fa790b 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
@@ -10,6 +10,7 @@ files_modified:
   - app/(app)/admin/visibility/actions.ts
   - domain/permissions/roles.ts
   - domain/vendors/index.ts
+  - repositories/permissions.ts
   - test/integration/leak-scan.test.ts
   - test/integration/custom-field-visibility.test.ts
   - test/e2e/custom-field-visibility.spec.ts
@@ -27,7 +28,7 @@ must_haves:
     - "정보 노출표(`/admin/visibility`)의 열은 `INFO_ITEMS` 뒤에 활성 거래처 칸 정의가 정렬 순서대로 이어 붙은 것이다 — 머리글은 칸의 한글 이름(20자 한 줄), 열 id는 `cf.vendor.<key>`. 칸이 0개면 지금과 같은 화면이고, 보관된 칸은 열이 없다. `PermissionGridClient`·`PermissionGrid`와 그 CSS(`white-space: nowrap` 포함)는 바꾸지 않는다(D10-13, ROADMAP 04.5 기준 3, UI-SPEC 화면 4, E5 zero-one-many·overflow·long-text)"
     - "노출표 저장 액션이 커스텀 항목 키를 받는다 — `cf.<entity>.<key>`는 대상이 `FIELD_DEFINITION_TARGETS` 안이고 그 키의 **활성** 정의가 있을 때만 통과하고, 없는 키·보관된 칸·대상 밖(`cf.project.…`)·형식이 틀린 키는 기존 문구 「알 수 없는 정보 항목입니다.」로 거부된다. `INFO_ITEMS` 키는 전처럼 통과한다(ROADMAP 기준 3, RESEARCH Pitfall 4)"
     - "커스텀 열 셀의 저장 실패는 기존 동작 그대로다 — 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」 + 원위치(UI-SPEC E5 error, O18)"
-    - "나중에 만든 계급도 기존 커스텀 항목 행을 받는다 — `createRole`이 계급을 넣은 뒤 대상 상수 안의 모든 칸 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 그 계급의 보임 행을 **없을 때만** 쓴다. 행 쓰기가 실패하면 그 계급에게 칸이 안 보일 뿐(기본 숨김 쪽으로 실패) 계급 생성은 남는다. 칸 생성(01)과 동시에 겹쳐도 행이 빠지지 않는다 — 두 경로가 같은 트랜잭션 잠금(01의 `lockCustomFieldGrants`)을 첫 문장으로 잡고 잠금 **뒤에** 상대 쪽 목록(계급 쪽은 칸 정의)을 **같은 `tx` 연결로** 읽는다(전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀 `DB_POOL_MAX`를 채울 때 보유자가 연결을 못 얻어 교착·시간 초과 — 계급 생성은 그 실패를 삼키므로 노출 행이 영구 누락). 고정 지연 없는 동기화 지점으로 경합을 재현한 통합 테스트와 풀 크기만큼 동시 부여 통합 테스트가 이것을 고정한다(ROADMAP 기준 3, CONTEXT 「분리로 생긴 조정」, T-04.5-07 · Codex final-2 #1·#2)"
+    - "나중에 만든 계급도 기존 커스텀 항목 행을 받는다 — `createRole`이 계급을 넣은 뒤 대상 상수 안의 모든 칸 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 그 계급의 보임 행을 **없을 때만** 쓴다. 행 쓰기가 실패하면 한 번 다시 시도하고, 그래도 실패하면 경고 로그(`role.custom_field_grant_failed`, `roleId`)를 남긴 채 계급 생성은 남는다 — 그 계급에게 칸이 안 보일 뿐(기본 숨김 쪽으로 실패)이고 조용히 남지 않는다(재시도 성공 · 두 번 실패 두 경로를 통합 테스트가 고정, eng review B-2 · T1). 칸 생성(01)과 동시에 겹쳐도 행이 빠지지 않는다 — 두 경로가 같은 트랜잭션 잠금(01의 `lockCustomFieldGrants`)을 첫 문장으로 잡고 잠금 **뒤에** 상대 쪽 목록(계급 쪽은 칸 정의)을 **같은 `tx` 연결로** 읽는다(전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀 `DB_POOL_MAX`를 채울 때 보유자가 연결을 못 얻어 교착·시간 초과 — 계급 생성은 그 실패를 삼키므로 노출 행이 영구 누락). 고정 지연 없는 동기화 지점으로 경합을 재현한 통합 테스트와 풀 크기만큼 동시 부여 통합 테스트가 이것을 고정한다(ROADMAP 기준 3, CONTEXT 「분리로 생긴 조정」, T-04.5-07 · Codex final-2 #1·#2)"
     - "배포 때 도는 시드(`seedMasterData`)는 커스텀 항목 행을 쓰지 않는다 — 관리자가 기획 PM에게서 끈 `cf.vendor.<key>`가 시드를 다시 돌린 뒤에도 꺼져 있다(ROADMAP 기준 3, D10-13)"
     - "칸을 보관해도 노출 행은 지우지 않는다 — 다음 조회에서 열만 빠지고, 복원하면 계급별 값이 그대로 돌아온다(노출 행을 지우는 코드가 이 페이즈에 없다, CONTEXT 「분리로 생긴 조정」)"
     - "거래처 DTO의 `customFields`는 **칸별로** 판정된다 — 거래처 DTO를 만드는 모든 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 활성이면서 보는 사람 계급에 `cf.vendor.<key>` 보임 행이 있는 키만 남긴다. 기존 `vendor.value`(「거래처 정보」) 판정은 그대로 먼저 적용된다 — 칸이 보이려면 「거래처 정보」와 그 칸 둘 다 켜져 있어야 한다(ROADMAP 기준 4, D10-13)"
@@ -135,7 +136,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
 - 노출표 두 출처 합치기(읽는 자리마다 옆에 더함) — **costly**(D10-13 원문의 판정): 노출표 격자·저장 허용·누수 스캔 생성기가 동적 항목을 전제하게 된다. 되돌리려면 네 자리를 함께 걷어낸다.
 - `vendor.value` AND 칸별 판정 — **reversible**: 거래처 DTO 출구 한 곳의 규칙이다.
-- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄이다.
+- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄과 그 1회 재시도·경고 로그다.
 
 </reversibility_notes>
 
@@ -159,6 +160,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - (통합) 칸 둘(정렬 2·1)을 만들면 `readVisibilityGrid`의 열이 `INFO_ITEMS` 순서 그대로 뒤에 정렬 1 → 2 순의 `{ id: "cf.vendor.<key>", label: 한글 이름 }` 둘을 더한다 · 칸 하나를 보관(`archived_at` 직접 설정)하면 그 열이 빠진다 · 칸 0개면 열이 `INFO_ITEMS`와 같다
     - (통합) `isAssignableInfoItem`: 활성 칸 키 참 · `INFO_ITEMS` 키 참 · 없는 키·보관된 칸 키·`cf.project.<key>`·`cf.vendor`·`vendor.nope` 거짓
     - (통합) 칸을 만든 뒤 `createRole`로 새 계급을 만들면 그 계급에 기존 칸(보관 포함) 전부의 보임 행이 있다 · 이미 꺼 둔 행은 덮지 않는다
+    - (통합, 기본 행 쓰기 실패 — eng review B-2 · T1) 칸을 만든 뒤 `vi.spyOn(log, "warn")`(`@/lib/log`)을 걸고 `createRole`에 `grantCustomFieldsToRole` dep을 주입한다. ① 첫 호출만 `new Error("injected")`로 거부하고 두 번째는 진짜 `grantCustomFieldsToRole`에 인자 그대로 넘기는 dep → `createRole`이 `RoleDto`를 돌려주고, 그 계급의 `cf.vendor.<key>` 노출 행이 정확히 하나·`visible = true`이며, dep 호출 2번 · 경고 로그 0번(일시 오류는 재시도로 메워진다). ② 항상 거부하는 dep → `createRole`이 던지지 않고 `RoleDto`를 돌려주며(계급 행이 DB에 있다), dep 호출 정확히 2번, `log.warn`이 `"role.custom_field_grant_failed"`와 `roleId: <새 계급 id>`를 담아 정확히 1번, 그 계급의 `cf.` 노출 행은 0개다(숨김 쪽 실패 · 조용히 남지 않음). 재시도·로그가 없는 구현에서 ①의 행 단언과 ②의 로그 단언이 빨갛다
     - (통합, 칸·계급 동시 생성 경합 — T-04.5-07 · Codex final-2 #2) 01의 `createFieldDefinition`을 시스템 관리자로 부르되 계급 목록 dep에 이 함수를 주입한다: ① 진짜 `listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx)`(dep이 받은 세 번째 인자)로 목록을 읽음 → ② `insertRole`로 계급 R을 직접 넣음(커밋됨) → ③ 프로미스 `defsRead`(와 그 resolve 함수)를 만들고, `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id, { listFieldDefinitions: 래퍼 })`를 **await 없이** 띄워 그 promise를 테스트 변수에 담음 — 래퍼는 진짜 `listFieldDefinitions`에 받은 인자를 그대로 넘겨 행을 받은 뒤 `defsRead`를 풀고 그 행을 돌려준다 → ④ `Promise.race([defsRead, waitForAdvisoryWaiter()])`를 await — `waitForAdvisoryWaiter`는 테스트 파일 안 헬퍼로, `db.execute(sql\`select 1 from pg_locks where locktype = 'advisory' and not granted\`)`가 1행 이상이 될 때까지 조회를 되풀이하는 루프다(타이머로 쉬지 않는다 — 조회 왕복 자체가 간격이고, `Date.now()`로 5초 넘으면 던진다) → ⑤ R이 빠진 목록을 돌려줌. `createFieldDefinition`과 담아 둔 promise를 둘 다 await한 뒤, R의 `cf.vendor.<새 키>` 노출 행이 정확히 하나이고 `visible = true`다. dep 안에서 grant를 await하면 교착이다(칸 트랜잭션이 잠금을 쥔 채 grant가 같은 잠금을 기다린다) — 기다리지 않는다. 고정 지연 없이 결정적이다: 잠금이 **없으면** grant가 곧장 정의를 읽어 `defsRead`가 풀리고(칸은 아직 커밋 전이라 새 칸을 못 봄) 반드시 R 행이 없다(RED). 01이 계급 목록을 잠금 전에 읽는 변형도 grant가 먼저 잠금을 잡고 정의를 읽어 `defsRead`로 끝나 RED다. 잠금이 **있으면** grant는 정의를 읽기 전에 잠금 대기에 걸려 `pg_locks`에 `granted = false` 행이 생기고 → race가 풀려 칸 트랜잭션이 커밋 → grant가 이어서 새 칸을 보고 행을 쓴다(GREEN). 두 경우 모두 관측 가능한 사건으로만 진행한다(`fileParallelism: false`라 다른 파일의 advisory 잠금과 섞이지 않는다)
     - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 거래처 칸 하나를 `createFieldDefinition`으로 만든 뒤 `insertRole`로 계급 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개를 넣고, 그 계급마다 `grantCustomFieldsToRole`을 `Promise.all`로 동시에 부르면 전부 끝나고 계급마다 그 칸의 `cf.vendor.<key>` 노출 행이 정확히 하나다(`createRole`은 grant 실패를 삼키므로 grant를 직접 불러 실패가 드러나게 한다). 정의를 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 시간 초과로 빨갛다
     - (통합) 기획 PM 계급의 `cf.vendor.<key>`를 `setVisibilityCell`로 끈 뒤 `seedMasterData`를 다시 돌려도 꺼져 있다
@@ -167,7 +169,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - (E2E) 시스템 관리자가 칸을 추가 → `/admin/visibility`에 그 이름의 열 머리글이 있고 셀이 전부 켜져 있다 → 기획 PM 행의 그 칸 셀을 끄면 새로 고침 뒤에도 꺼져 있다
   </behavior>
   <action>
-① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다).
+① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다). `createRole` 기본 행 쓰기 실패 케이스(behavior 「eng review B-2 · T1」)도 이 RED에 넣고, 재시도·경고 로그 없이 grant 한 번만 부르는 ⑤ 초안에서 ①·② 단언이 빨간 출력을 SUMMARY에 인용한다.
 
 ② `domain/custom-fields/visibility.ts`에 더한다: `customFieldColumns(viewer)` — `FIELD_DEFINITION_TARGETS`마다 `listFieldDefinitions`에서 `archivedAt`이 null인 정의를 기존 정렬 그대로 `{ id: customFieldInfoItem(entity, key), label }`로. `isAssignableInfoItem(infoItem)` — `INFO_ITEMS`에 있으면 참, 아니면 `parseCustomFieldInfoItem` → 대상이 상수 안 → 그 대상의 활성 정의에 키가 있으면 참(조회는 `SYSTEM_VIEWER`). `grantCustomFieldsToRole(viewer, roleId, deps?)` — `deps`는 `listFieldDefinitions` 하나만 주입 가능(기본값은 리포지토리 함수 · 01의 `*Deps` 선례 · 운영 호출은 두 인자 그대로), 한 `withTransaction`(`lib/db-transaction.ts`) 안에서 **첫 문장** 01의 `lockCustomFieldGrants(viewer, tx)`(01의 칸 생성과 같은 잠금 — T-04.5-07) → 그 **뒤에** 대상 상수 안의 모든 정의(보관 포함)를 `listFieldDefinitions(viewer, entity, tx)`로 읽음(잠금을 쥔 **같은 연결** — 01 Task 1④와 같은 이유: 전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀을 채울 때 보유자가 연결을 못 얻는다. 잠금을 잡은 뒤의 조회라 먼저 커밋된 칸을 전부 본다) → 정의마다 01의 `insertVisibilityIfAbsent(…, { visible: true }, tx)`. 잠금 전에 정의를 읽거나 잠금 없이 돌리면 동시에 만들어지는 칸을 놓쳐 그 계급에게 칸이 영구히 숨는다(칸 쪽은 잠금 뒤 계급 목록을 읽으므로 둘 중 하나만 먼저 돈다). RED 확인은 두 단계다: 잠금 줄 없이 먼저 구현한 grant로 behavior의 경합 케이스가 빨간 것을 보고 → 잠금을 더하되 정의를 `tx` 없이 읽는 상태에서 풀 고갈 케이스가 시간 초과로 빨간 것을 본 뒤(교착이 풀에 남아 뒤 케이스까지 멈추므로 이 확인은 그 케이스만 `-t`로 돌린다) → `tx`를 넘겨 둘 다 초록으로 만든다(두 실패 출력을 SUMMARY에 인용). 이 모듈은 `domain/permissions/roles.ts`를 import하지 않는다(순환 방지).
 
@@ -175,7 +177,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
 ④ `app/(app)/admin/visibility/actions.ts`: `infoItem`의 정적 `Set` refine을 `isAssignableInfoItem` 비동기 refine으로 바꾸고 메시지는 기존 「알 수 없는 정보 항목입니다.」 그대로. 이 변경으로 쓰이지 않게 된 `infoItemKeys`·`INFO_ITEMS` import를 지운다(자기 변경이 만든 고아만).
 
-⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — 계급은 이미 생겼으므로 — 운영 로그 `log.warn` 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패). 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
+⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
 
 ⑥ 시드: `domain/seed/index.ts`는 고치지 않는다 — 통합 테스트로 「시드는 커스텀 항목 행을 쓰지 않는다」를 증명한다.
 
@@ -185,7 +187,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm test:unit</automated>
     <fails_when>eslint·tsc·next build가 error로 끝나거나 vitest unit failed가 1 이상이다 — 특히 `import-cycles`(roles ↔ custom-fields 순환)</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/visibility.test.ts test/integration/roles.test.ts test/integration/seed-permissions.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·기본 행 쓰기 실패 경로(재시도 뒤 행 있음 · 두 번 실패 시 계급 남음 + 경고 로그 1번 + `cf.` 행 0개)·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/permissions-grid.spec.ts</automated>
     <fails_when>playwright failed 개수가 1 이상이다 — 커스텀 열 머리글·셀 토글 저장, 또는 기존 권한표·노출표 E2E 회귀</fails_when>
   </verify>
@@ -193,6 +195,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - `app/(app)/admin/visibility/actions.ts`에 정적 `infoItemKeys` Set이 남아 있지 않고 `isAssignableInfoItem`을 쓴다
     - `test/integration/custom-field-visibility.test.ts`에 `admin.visibility` 쓰기가 없는 계급의 `cf.vendor.` 셀 변경이 `ForbiddenError`이고 행·행동 로그가 그대로인 케이스가 있다(`grep -c "ForbiddenError" test/integration/custom-field-visibility.test.ts`가 1 이상)
     - `grantCustomFieldsToRole` 본문에서 `lockCustomFieldGrants(`가 `listFieldDefinitions(`보다 먼저 오고 같은 `withTransaction` 안이며, 그 `listFieldDefinitions(` 호출(주입 dep 경유 포함)이 `tx)`로 끝난다(같은 연결) · 경합 케이스의 잠금 없는 RED 실패 출력, 풀 고갈 케이스의 `tx` 없는 RED 시간 초과 출력, 둘 다 초록인 출력이 SUMMARY에 있다
+    - `createRole`의 기본 행 쓰기 실패 경로가 고정돼 있다 — `grep -v '^\s*//' domain/permissions/roles.ts | grep -c "role.custom_field_grant_failed"`가 1이고, `grep -c 'spyOn(log, "warn")' test/integration/custom-field-visibility.test.ts`가 1 이상이며, behavior 「eng review B-2 · T1」의 ①(재시도 뒤 행 하나)·②(계급 남음 · dep 2번 · 경고 로그 1번 · `cf.` 행 0개) 두 케이스의 RED 출력과 초록 출력이 SUMMARY에 있다
     - 경합 테스트에 타이머·고정 지연이 없다 — `grep -v '^\s*//' test/integration/custom-field-visibility.test.ts | grep -c "setTimeout"`가 0이다(주석 줄 제외)
     - `git diff origin/main -- domain/permissions/info-items.ts domain/permissions/project.ts domain/permissions/dto-registry.ts ui/permission-grid "app/(app)/admin/permissions"`가 비어 있고, `git diff <이 플랜 시작 커밋> -- domain/seed/index.ts`가 비어 있다(09가 더한 새 메뉴 시드 줄 때문에 main 기준 diff는 비지 않는다)
     - 세 검증 명령이 전부 초록이다
@@ -202,7 +205,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
 <task type="auto" tdd="true">
   <name>Task 2: 거래처 DTO 칸별 판정 — 모든 출구에서 보이는 키만 · 폼 정의도 보이는 칸만 · 누수 스캔 커스텀 축 · 끈 계급의 화면에 값 없음</name>
-  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
+  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, repositories/permissions.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
   <precondition>01/08이 이 브랜치에 더한 마이그레이션 SQL에 기존 거래처 정의의 노출 행 백필 문장이 있다 — `git diff --name-only origin/main -- db/migrations | grep '\.sql$' | xargs grep -l "visibility_matrix"`가 한 파일 이상을 내고, 그 문장이 `field_definitions`·`roles`에서 SELECT하며 `ON CONFLICT` … `DO NOTHING`으로 끝난다. 없으면 이 태스크를 시작하지 않고 멈춰 오케스트레이터에 알린다(01 마이그레이션은 그룹 A 소유)</precondition>
   <read_first>
     - `domain/vendors/index.ts` 36–70행(`VendorDto`·`VENDOR_DTO_SPEC`) · 89–160행(`listVendors`·`searchVendors`·`listVendorFieldDefinitions`) · 241–366행(`createVendor`·`updateVendor`·`setVendorHidden`의 `project()` 호출 다섯 곳)
@@ -223,7 +226,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
   <action>
 ① RED 먼저.
 
-② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
+② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 끝에 선택 `tx: DbOrTx = db`(`@/repositories/document-counters` 타입 — `domain/quotes/lines.ts` 14행 선례)를 받아 두 조회 `listFieldDefinitions(…, tx)`·`listVisibility(…, tx)`에 넘기고, 그래서 `repositories/permissions.ts`의 `listVisibility`에도 끝의 선택 `tx: DbOrTx = db` 한 인자를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로 · 05가 거래처 행 잠금 트랜잭션 안에서 같은 연결로 부른다, Codex t1t2 MAJOR). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
 
 ③ `domain/vendors/index.ts`: 파일 안 로컬 함수 하나로 DTO를 만든다 — 기존 `project(viewer, row, VENDOR_DTO_SPEC)` 결과의 `customFields`에 `pickVisibleCustomFields`를 적용. 다섯 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 전부 이 함수를 쓰고, 목록·검색은 보이는 키 집합을 호출당 한 번만 계산한다. `VENDOR_DTO_SPEC`(「거래처 정보」 줄 포함)·`registerDto`는 그대로 둔다. `listVendorFieldDefinitions`는 01의 보관 제외에 더해 `visibleCustomFieldKeys`에 있는 정의만 돌려준다. `validatedCustomFields`는 바꾸지 않는다(보이지 않는 칸 값 되살리기는 05).
 
@@ -271,7 +274,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | T-04.5-04 | Information Disclosure | 거래처 DTO 출구 다섯 · 폼 정의 목록 | high | mitigate | 모든 출구가 로컬 DTO 함수 하나로 `pickVisibleCustomFields` — 활성 ∩ 보임 키만. 「거래처 정보」 판정이 먼저라 노출 범위가 넓어지지 않는다. 누수 스캔 커스텀 축 + 끈 계급 화면 HTML E2E로 증명 |
 | T-04.5-06 | Elevation of Privilege | 배포 시드 | medium | mitigate | 시드는 커스텀 항목 행을 쓰지 않는다 — 끈 뒤 재시드 통합 테스트 |
 | T-04.5-07 | Tampering | 칸 생성(01) ↔ 계급 생성(`grantCustomFieldsToRole`) 동시 실행 | medium | mitigate | 01과 같은 위협의 계급 쪽 절반. 두 경로가 같은 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`를 첫 문장으로 잡고 잠금 뒤에 상대 목록을 같은 `tx` 연결로 읽어 직렬화된다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생기고, 잠금 보유자가 두 번째 풀 연결을 요구하지 않아 풀 고갈 교착이 없다. await 없이 띄운 grant와 고정 지연 없는 동기화 지점(`defsRead` · `pg_locks` 대기 행)으로 경합을 재현한 통합 테스트가 잠금 없는 RED → 잠금 뒤 초록으로, 풀 크기만큼 동시 부여 통합 테스트가 같은 연결 조회를 고정한다(Task 1) |
-| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 숨김 쪽으로 실패한다 |
+| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 한 번 재시도 뒤 숨김 쪽으로 실패하고 경고 로그 `role.custom_field_grant_failed`(`roleId`)를 남긴다 — 조용히 행 없는 계급이 남지 않는다(Task 1 통합 테스트, eng review B-2) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — 의존성 객체·lockfile diff 없음 |
 </threat_model>
 
@@ -295,7 +298,7 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | 종류 | 이름 / 경로 |
 |---|---|
 | 함수(신규, domain) | `customFieldColumns` · `isAssignableInfoItem` · `visibleCustomFieldKeys` · `grantCustomFieldsToRole` · `pickVisibleCustomFields`(`domain/custom-fields/visibility.ts`) |
-| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
+| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행 · 실패 시 1회 재시도 → 경고 로그, `RoleWriteDeps.grantCustomFieldsToRole` 주입 지점) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
 | 테스트 | `test/integration/custom-field-visibility.test.ts`(권한 없는 계급의 `cf.` 셀 거부 · 노출 행 없는 정의의 기본 숨김 포함) · `test/integration/leak-scan.test.ts` 커스텀 칸 축 · `test/e2e/custom-field-visibility.spec.ts` |
 | 다른 플랜에 건 요구 | 01/08 마이그레이션의 기존 거래처 정의 노출 행 일회성 백필과 그 검증(그룹 A 소유 — `<objective>` 선행 조건) |
 | 결정 기록 | `<assumption_delta_decision>` add-alongside(받아들인 빚 — Phase 10에서 promote) |
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
index 29041cc..bb1c06a 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
@@ -8,6 +8,7 @@ files_modified:
   - domain/custom-fields/preserve.ts
   - domain/vendors/index.ts
   - repositories/vendors.ts
+  - repositories/permissions.ts
   - app/(app)/admin/vendors/actions.ts
   - app/(app)/admin/vendors/vendor-form.tsx
   - test/unit/domain/custom-fields-preserve.test.ts
@@ -58,7 +59,7 @@ must_haves:
   key_links:
     - from: "domain/vendors/index.ts"
       to: "repositories/vendors.ts"
-      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
+      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → 같은 `tx`로 정의·노출 조회 → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
       pattern: "findVendorByIdForUpdate"
     - from: "domain/vendors/index.ts"
       to: "domain/custom-fields/preserve.ts"
@@ -192,18 +193,19 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 
 <task type="auto" tdd="true">
   <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
-  <files>domain/vendors/index.ts, repositories/vendors.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
+  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   <read_first>
     - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
     - `repositories/vendors.ts` 47–50행(`findVendorById`) · 105–110행(`updateVendor` — 전역 `db`로 쓴다)
     - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
     - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
-    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
+    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`와 03이 더한 끝의 선택 `tx`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem, deps)` — `deps.findVisibility` 주입 지점) · `repositories/permissions.ts` 86–98행 `findVisibility`(전역 `db`) · 119–128행 `listVisibility`(03이 더한 끝의 선택 `tx`)
     - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   </read_first>
   <behavior>
     - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
     - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
+    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
     - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
     - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
     - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
@@ -216,7 +218,7 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   </behavior>
   <action>
-① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
+① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용).
 
 ② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
 
@@ -224,19 +226,20 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 - `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
 - 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
 - `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
+- `repositories/permissions.ts`의 `findVisibility(viewer, roleId, infoItem)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로). `listVisibility`의 `tx`는 03이 더했다.
 
 ④ `domain/vendors/index.ts`:
-- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
+- 파일 안 함수 `vendorInputFieldKeys(viewer, tx: DbOrTx = db)`를 둔다. `visible(viewer, "vendor.value", deps)` — `deps.findVisibility`는 받은 인자 끝에 `tx`를 붙여 `findVisibility`를 부르는 함수 — 가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY, tx)`다. `visible.ts`는 고치지 않는다(기존 `deps` 주입 지점).
 - `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
-- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
+- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `createVendor`는 둘을 행 삽입 전에(트랜잭션 없이, 두 인자 호출) 계산한다. `updateVendor`는 둘을 트랜잭션 **안에서** 행 잠금 **뒤에** 같은 `tx`로 계산한다(`repoListFieldDefinitions(viewer, VENDOR_ENTITY, tx)` — 01이 더한 끝의 선택 `tx` · `vendorInputFieldKeys(viewer, tx)`). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
 - `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
 - `updateVendor`:
   - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
-  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
+  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
-  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
+  - 잠금은 정의·노출 조회·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다.
 - **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
 
 ⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
@@ -247,13 +250,14 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
     <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」 경합에서 사용자 제출값이 관리자 값을 덮거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
     <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   </verify>
   <acceptance_criteria>
     - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
     - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
+    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `ListFieldDefinitions(`·`vendorInputFieldKeys(`보다 먼저 오고, 그 두 호출이 `tx)`로 끝난다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|ListFieldDefinitions\(|vendorInputFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
     - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
     - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
     - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
@@ -322,7 +326,10 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | T-04.5-18 | Tampering | 보관 선택지 새 지정(요청 위조 포함) | medium | mitigate | 검증기 선택지에 보관 선택지는 그 행의 저장값 하나만 더한다. 그 밖의 보관 선택지는 칸 오류다(단위·통합) |
 | T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
 | T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
+| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·노출 조회를 `findVendorByIdForUpdate` 뒤 같은 `tx`로 옮긴다(Task 2 action ④). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
+
+eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
 </threat_model>
 
 <verification>
@@ -346,8 +353,8 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | 종류 | 이름 / 경로 |
 |---|---|
 | 모듈(신규, domain 순수) | `domain/custom-fields/preserve.ts` — `resolveCustomFieldsWrite` · `CustomFieldsInvalidError` · `UnknownCustomFieldKeyError` |
-| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
-| 함수(신규) | `vendorInputFieldKeys(viewer)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
+| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션, 잠금 뒤 같은 `tx`로 정의·노출 조회) · `updateVendor`·`findVisibility`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
+| 함수(신규) | `vendorInputFieldKeys(viewer, tx)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
 | 계약 | 수정 제출: 키 없음 = 안 바꿈, 빈 값 = 비움 · 칸 오류 = `validationErrors.customFields.{key}._errors` · 수정의 커스텀 값 합치기·쓰기는 행 잠금 한 트랜잭션 |
 | 테스트 | `test/unit/domain/custom-fields-preserve.test.ts` · `test/integration/vendor-custom-fields-save.test.ts`(두 연결 경합 포함) · `test/integration/custom-fields.test.ts`(노출 행 픽스처 · 거부 이유 단언) |
 | 문구 기록 | 새 문구 0 — 없는 키·타입 오류는 기존 `koreanZodErrorMessage` 줄이 커스텀 칸에 새로 나타난다 |

exec
/bin/bash -lc 'tail -100 docs/reviews/phase-04.5/codex-plan-review-t1t2.md' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   106	  await db
   107	    .update(vendors)
   108	    .set({ ...input, updatedAt: new Date() })
   109	    .where(eq(vendors.id, id));
   110	}
   111	
   112	// 계좌번호를 바꿀 때 전용 — 암호문 컬럼과 뒤 4자리 컬럼을 같은 UPDATE 문에서
   113	// 함께 교체한다. null을 넘기면 계좌번호를 지운다(둘 다 null).
   114	export async function updateVendorAccountNumber(
   115	  viewer: Viewer,
   116	  id: string,
   117	  input: { accountNumberEncrypted: string | null; accountNumberLast4: string | null },
   118	): Promise<void> {
   119	  await db
   120	    .update(vendors)
   121	    .set({
   122	      accountNumberEncrypted: input.accountNumberEncrypted,
   123	      accountNumberLast4: input.accountNumberLast4,
   124	      updatedAt: new Date(),
   125	    })
   126	    .where(eq(vendors.id, id));
   127	}
   128	
   129	export async function setVendorHidden(viewer: Viewer, id: string, hidden: boolean): Promise<void> {
   130	  await db.update(vendors).set({ hidden, updatedAt: new Date() }).where(eq(vendors.id, id));
   131	}
   132	
   133	// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
   134	export async function setVendorArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
   135	  if (value) {
   136	    await db
   137	      .update(vendors)
   138	      .set({ archivedAt: new Date(), archivedBy: viewer.id })
   139	      .where(and(eq(vendors.id, id), isNull(vendors.archivedAt)));
   140	  } else {
   141	    await db
   142	      .update(vendors)
   143	      .set({ archivedAt: null, archivedBy: null })
   144	      .where(and(eq(vendors.id, id), isNotNull(vendors.archivedAt)));
   145	  }
   146	}
    45	  }
    46	  return null;
    47	}
    48	
    49	// `import type ... from "x"` / `export type ... from "x"`는 건너뛰고 나머지
    50	// import·re-export만 런타임 간선으로 센다.
    51	function runtimeDeps(file: string): string[] {
    52	  const src = readFileSync(file, "utf8");
    53	  const deps = new Set<string>();
    54	  for (const match of src.matchAll(/^(import|export)\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)"/gm)) {
    55	    if (match[2]) continue;
    56	    const target = resolveSpec(file, match[4] ?? "");
    57	    if (target && target !== file) deps.add(target);
    58	  }
    59	  return [...deps];
    60	}
    61	
    62	const graph = new Map(files.map((file) => [file, runtimeDeps(file)]));
    63	
    64	function findCycles(): string[][] {
28:| B-2 | `createRole`이 권한 행 삽입 실패를 삼켜, 일시 오류 시 역할이 가시성 행 없이 남음(=전부 숨김) | P2 | **T1 수용** — 03에 실패 경로 테스트 추가 |
32:커버리지(요약): 잠금 경쟁(01/03 동시성 테스트, pg_locks 폴링) · 숨김 키 보존(05 knownKeys) · 누출 스캔(03 present→absent) · 역할 전용 필드 E2E(06) · 편집자 흐름 E2E(07) · 복원 링크 권한(08 write+admin.archive, write-only 테스트). 빈 곳: B-2 한 곳 → T1.
38:| C-1 | tx 밖 정의 읽기 → tx 사이 TOCTOU | P2 | **T2 수용** — 05 위협 모델에 "허용 위험"으로 문서화(결과가 저장 거부로 끝나 무해) |
52:- D2 B-2: 테스트 추가(T1) — 권장
53:- D3 C-1: 문서화로 수용(T2) — 권장
60:- T2 — 04.5-05: 위협 모델에 "정의 읽기 TOCTOU = 허용 위험(저장 거부로 끝남)" 추가
77:막는 문제 없음. 수용 2건(T1, T2)은 다음 세션에서 플랜에 반영, 이어서 /plan-design-review.
86:| 성능 | P2 1 유지, P2 1 수용(T2) |
88:| VERDICT | 통과(issues_open: T1·T2 반영 대기) |
     1	import { db, type DbOrTx } from "@/db/client";
     2	
     3	// Phase 4(04-01): domain은 db를 직접 import할 수 없다(boundaries,
     4	// `{ from: "domain", allow: ["domain", "repositories", "lib"] }`). 번호
     5	// 부여 + 문서 INSERT를 같은 트랜잭션에 묶어야 하는 domain 함수
     6	// (createProject·saveQuoteLines)는 이 lib 래퍼를 거쳐 트랜잭션을 연다 —
     7	// 실제 쿼리는 여전히 repositories 함수만 한다(domain은 tx를 그 함수들에
     8	// 전달만 한다).
     9	export async function withTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    10	  return db.transaction(fn);
    11	}

codex
- [MAJOR] T2의 직렬 순서 동치는 다른 거래처 저장이 끼면 깨짐 — 근거: [05:325](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L325)는 무조건 동치라고 하지만, [05:235](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L235)는 **옛 정의와 잠근 최신 저장값**을 조합한다. 예: 사용자 A가 보임 상태 조회 → 관리자가 A 계급에서 숨김 → 관리자가 새 비공개 값을 저장 → A가 옛 제출값으로 덮어씀. A 저장을 숨김 직전으로 옮기면 최종값은 관리자 값이어야 하므로 주장한 순서와 다르다. 이는 [05:27](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L27)의 숨은 값 보존 계약도 깨뜨린다. 실제 UPDATE는 전달받은 값을 쓴다(`repositories/vendors.ts:105–109`). DTO 필터는 유출을 막아도 이미 덮어쓴 값을 복구하지 못한다. — 구체적 수정: 정의·노출 변경과 저장이 공유하는 잠금으로 메타데이터 조회부터 쓰기까지 보호하고, 같은 `tx` 연결을 사용한다. 위 세 작업 경합을 회귀 테스트로 추가한다. 단순히 조회를 트랜잭션 안으로 이동하는 것만으로는 부족하다.

- [MINOR] “푸는 변경은 저장 거부”는 과도한 단정 — 근거: [05:325](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L325). 필수 해제·선택지 복원 후에도 옛 조건을 만족하는 제출은 성공한다. 칸 복원·노출 켬은 옛 입력 집합에서 제외되어 제출값을 버리고 성공할 수 있다([05:149](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L149)). — 구체적 수정: “옛 조건에 따라 성공·제출값 무시·거부가 가능”으로 바꾼다. 칸 보관·숨김·선택지 보관·필수화도 **단일 변경과 단일 저장만** 비교하면 변경 전 저장으로 설명되지만, 위 경합까지 일반화하지 않는다.

- [NOTE] T1은 실행 가능한 설계이며, 영구 누락 자체를 해결하는 것은 아님 — 근거: [03:163](.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md#L163), [03:179](.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md#L179). 계급은 먼저 독립 삽입된다(`domain/permissions/roles.ts:109`, `repositories/roles.ts:39–44`). 기존 `Partial<RoleWriteDeps>`와 타입 전용 import 선례(`domain/permissions/roles.ts:6,87–101`)로 주입 가능하고, 동적 기본 함수로 런타임 순환을 피할 수 있다. 한 번 호출하고 실패를 삼키는 초안에서 지정한 RED 단언도 실행 가능하다. 두 번 실패하면 행 없는 계급은 남지만 경고가 기록되므로 **명시한 실패 경로에서는 조용하지 않다**. — 구체적 수정: 필수 수정 없음. 자동 복구 보장으로 해석하지 않는다. T1의 must_haves·검증·수용 기준은 일치하며 T-04.5-44 중복도 없다.

판정: 막는 문제 있음 (1건)
tokens used
48,375
- [MAJOR] T2의 직렬 순서 동치는 다른 거래처 저장이 끼면 깨짐 — 근거: [05:325](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L325)는 무조건 동치라고 하지만, [05:235](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L235)는 **옛 정의와 잠근 최신 저장값**을 조합한다. 예: 사용자 A가 보임 상태 조회 → 관리자가 A 계급에서 숨김 → 관리자가 새 비공개 값을 저장 → A가 옛 제출값으로 덮어씀. A 저장을 숨김 직전으로 옮기면 최종값은 관리자 값이어야 하므로 주장한 순서와 다르다. 이는 [05:27](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L27)의 숨은 값 보존 계약도 깨뜨린다. 실제 UPDATE는 전달받은 값을 쓴다(`repositories/vendors.ts:105–109`). DTO 필터는 유출을 막아도 이미 덮어쓴 값을 복구하지 못한다. — 구체적 수정: 정의·노출 변경과 저장이 공유하는 잠금으로 메타데이터 조회부터 쓰기까지 보호하고, 같은 `tx` 연결을 사용한다. 위 세 작업 경합을 회귀 테스트로 추가한다. 단순히 조회를 트랜잭션 안으로 이동하는 것만으로는 부족하다.

- [MINOR] “푸는 변경은 저장 거부”는 과도한 단정 — 근거: [05:325](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L325). 필수 해제·선택지 복원 후에도 옛 조건을 만족하는 제출은 성공한다. 칸 복원·노출 켬은 옛 입력 집합에서 제외되어 제출값을 버리고 성공할 수 있다([05:149](.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md#L149)). — 구체적 수정: “옛 조건에 따라 성공·제출값 무시·거부가 가능”으로 바꾼다. 칸 보관·숨김·선택지 보관·필수화도 **단일 변경과 단일 저장만** 비교하면 변경 전 저장으로 설명되지만, 위 경합까지 일반화하지 않는다.

- [NOTE] T1은 실행 가능한 설계이며, 영구 누락 자체를 해결하는 것은 아님 — 근거: [03:163](.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md#L163), [03:179](.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md#L179). 계급은 먼저 독립 삽입된다(`domain/permissions/roles.ts:109`, `repositories/roles.ts:39–44`). 기존 `Partial<RoleWriteDeps>`와 타입 전용 import 선례(`domain/permissions/roles.ts:6,87–101`)로 주입 가능하고, 동적 기본 함수로 런타임 순환을 피할 수 있다. 한 번 호출하고 실패를 삼키는 초안에서 지정한 RED 단언도 실행 가능하다. 두 번 실패하면 행 없는 계급은 남지만 경고가 기록되므로 **명시한 실패 경로에서는 조용하지 않다**. — 구체적 수정: 필수 수정 없음. 자동 복구 보장으로 해석하지 않는다. T1의 must_haves·검증·수용 기준은 일치하며 T-04.5-44 중복도 없다.

판정: 막는 문제 있음 (1건)
exit=0

exec
/bin/bash -lc "rg --files -g AGENTS.md -g '"'!node_modules'"' -g '"'!docs/reviews/**'"' . /home/user 2>/dev/null | head -40; git diff -U2 -- .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
index 29041cc..bb1c06a 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
@@ -9,4 +9,5 @@ files_modified:
   - domain/vendors/index.ts
   - repositories/vendors.ts
+  - repositories/permissions.ts
   - app/(app)/admin/vendors/actions.ts
   - app/(app)/admin/vendors/vendor-form.tsx
@@ -59,5 +60,5 @@ must_haves:
     - from: "domain/vendors/index.ts"
       to: "repositories/vendors.ts"
-      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
+      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → 같은 `tx`로 정의·노출 조회 → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
       pattern: "findVendorByIdForUpdate"
     - from: "domain/vendors/index.ts"
@@ -193,5 +194,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 <task type="auto" tdd="true">
   <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
-  <files>domain/vendors/index.ts, repositories/vendors.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
+  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   <read_first>
     - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
@@ -199,5 +200,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
     - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
-    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
+    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`와 03이 더한 끝의 선택 `tx`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem, deps)` — `deps.findVisibility` 주입 지점) · `repositories/permissions.ts` 86–98행 `findVisibility`(전역 `db`) · 119–128행 `listVisibility`(03이 더한 끝의 선택 `tx`)
     - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   </read_first>
@@ -205,4 +206,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
     - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
+    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
     - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
     - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
@@ -217,5 +219,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
   </behavior>
   <action>
-① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
+① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용).
 
 ② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
@@ -225,17 +227,18 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 - 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
 - `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
+- `repositories/permissions.ts`의 `findVisibility(viewer, roleId, infoItem)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로). `listVisibility`의 `tx`는 03이 더했다.
 
 ④ `domain/vendors/index.ts`:
-- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
+- 파일 안 함수 `vendorInputFieldKeys(viewer, tx: DbOrTx = db)`를 둔다. `visible(viewer, "vendor.value", deps)` — `deps.findVisibility`는 받은 인자 끝에 `tx`를 붙여 `findVisibility`를 부르는 함수 — 가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY, tx)`다. `visible.ts`는 고치지 않는다(기존 `deps` 주입 지점).
 - `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
-- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
+- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `createVendor`는 둘을 행 삽입 전에(트랜잭션 없이, 두 인자 호출) 계산한다. `updateVendor`는 둘을 트랜잭션 **안에서** 행 잠금 **뒤에** 같은 `tx`로 계산한다(`repoListFieldDefinitions(viewer, VENDOR_ENTITY, tx)` — 01이 더한 끝의 선택 `tx` · `vendorInputFieldKeys(viewer, tx)`). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
 - `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
 - `updateVendor`:
   - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
-  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
+  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
-  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
+  - 잠금은 정의·노출 조회·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다.
 - **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
 
@@ -248,5 +251,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」 경합에서 사용자 제출값이 관리자 값을 덮거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
     <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
@@ -255,4 +258,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
     - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
+    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `ListFieldDefinitions(`·`vendorInputFieldKeys(`보다 먼저 오고, 그 두 호출이 `tx)`로 끝난다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|ListFieldDefinitions\(|vendorInputFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
     - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
     - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
@@ -323,5 +327,8 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
 | T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
+| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·노출 조회를 `findVendorByIdForUpdate` 뒤 같은 `tx`로 옮긴다(Task 2 action ④). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
+
+eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
 </threat_model>
 
@@ -347,6 +354,6 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 |---|---|
 | 모듈(신규, domain 순수) | `domain/custom-fields/preserve.ts` — `resolveCustomFieldsWrite` · `CustomFieldsInvalidError` · `UnknownCustomFieldKeyError` |
-| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
-| 함수(신규) | `vendorInputFieldKeys(viewer)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
+| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션, 잠금 뒤 같은 `tx`로 정의·노출 조회) · `updateVendor`·`findVisibility`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
+| 함수(신규) | `vendorInputFieldKeys(viewer, tx)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
 | 계약 | 수정 제출: 키 없음 = 안 바꿈, 빈 값 = 비움 · 칸 오류 = `validationErrors.customFields.{key}._errors` · 수정의 커스텀 값 합치기·쓰기는 행 잠금 한 트랜잭션 |
 | 테스트 | `test/unit/domain/custom-fields-preserve.test.ts` · `test/integration/vendor-custom-fields-save.test.ts`(두 연결 경합 포함) · `test/integration/custom-fields.test.ts`(노출 행 픽스처 · 거부 이유 단언) |

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '208,235p'; nl -ba repositories/permissions.ts | sed -n '1,190p'; nl -ba domain/vendors/index.ts | sed -n '1,240p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   208	  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, repositories/permissions.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
   209	  <precondition>01/08이 이 브랜치에 더한 마이그레이션 SQL에 기존 거래처 정의의 노출 행 백필 문장이 있다 — `git diff --name-only origin/main -- db/migrations | grep '\.sql$' | xargs grep -l "visibility_matrix"`가 한 파일 이상을 내고, 그 문장이 `field_definitions`·`roles`에서 SELECT하며 `ON CONFLICT` … `DO NOTHING`으로 끝난다. 없으면 이 태스크를 시작하지 않고 멈춰 오케스트레이터에 알린다(01 마이그레이션은 그룹 A 소유)</precondition>
   210	  <read_first>
   211	    - `domain/vendors/index.ts` 36–70행(`VendorDto`·`VENDOR_DTO_SPEC`) · 89–160행(`listVendors`·`searchVendors`·`listVendorFieldDefinitions`) · 241–366행(`createVendor`·`updateVendor`·`setVendorHidden`의 `project()` 호출 다섯 곳)
   212	    - `domain/permissions/visible.ts`(전문 — 행 없으면 거짓)
   213	    - `test/integration/leak-scan.test.ts`(전문 — main 173행에 09가 `FieldDefinitionAdminDto` 검사 경로를 더한 뒤 모양. `buildDtoCases` 모양·결정적 순서 단언. 09가 더한 줄도 고치지 않고 파일 끝에만 더한다)
   214	    - `test/integration/vendors.test.ts`(거래처 생성·조회 픽스처)
   215	    - `app/(app)/admin/vendors/page.tsx`(거래처 목록·편집 폼이 DTO에서 무엇을 그리는지)
   216	  </read_first>
   217	  <behavior>
   218	    - (단위 성격, 통합 파일 안) `pickVisibleCustomFields({ a: 1, b: 2 }, new Set(["a"]))` → `{ a: 1 }`; 값이 없으면(「거래처 정보」로 이미 가려짐) 그대로 없음
   219	    - (통합) 칸 A·B에 값이 든 거래처를, B를 끈 계급(`admin.vendors` 보기 권한을 테스트에서 켬)으로 `listVendors`·`searchVendors`하면 `customFields`에 A만 있다 · 같은 계급의 `updateVendor`·`setVendorHidden` 반환 DTO에도 B가 없다
   220	    - (통합) 보관된 칸의 값은 시스템 관리자 DTO에도 없다(보관 칸은 목록에서 숨음 — D10-12)
   221	    - (통합, 기본 숨김 — Codex #2) `insertFieldDefinition`으로 직접 넣고 노출 행을 하나도 만들지 않은 거래처 정의(백필 전 운영 데이터와 같은 상태)의 값은 시스템 관리자 DTO에도 없다 — 백필이 왜 선행 조건인지 고정한다. 같은 정의에 `insertVisibilityIfAbsent`로 시스템 관리자 행을 넣으면 값이 보인다
   222	    - (통합) `listVendorFieldDefinitions`가 그 계급에게 A만 돌려준다
   223	    - (통합, 누수 스캔) 결정적 생성기가 (활성 칸 × 시드 계급) 케이스를 만들고, 각 케이스에서 그 계급에 `vendor.value` 보임 행을 켠 상태로 **끄기 전** 거래처 DTO 직렬화에 두 칸 값이 **있음**을 먼저 단언한 뒤, 그 칸을 끄면 그 칸의 값 문자열이 **없고** 다른 칸 값은 남는다(`vendor.value`가 꺼진 계급은 DTO 전체가 비어 헛되이 통과하므로 사전 양성 단언으로 막는다)
   224	    - (E2E) 시스템 관리자가 칸 「E2E비고…」를 만들고 거래처 하나에 값 「누수금지값…」을 저장 → 노출표에서 시스템 관리자 행의 그 칸을 끔 → `/admin/vendors`와 그 거래처 편집 화면 HTML에 칸 이름과 값이 없다 → 다시 켜면 편집 화면에 값이 보인다
   225	  </behavior>
   226	  <action>
   227	① RED 먼저.
   228	
   229	② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 끝에 선택 `tx: DbOrTx = db`(`@/repositories/document-counters` 타입 — `domain/quotes/lines.ts` 14행 선례)를 받아 두 조회 `listFieldDefinitions(…, tx)`·`listVisibility(…, tx)`에 넘기고, 그래서 `repositories/permissions.ts`의 `listVisibility`에도 끝의 선택 `tx: DbOrTx = db` 한 인자를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로 · 05가 거래처 행 잠금 트랜잭션 안에서 같은 연결로 부른다, Codex t1t2 MAJOR). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
   230	
   231	③ `domain/vendors/index.ts`: 파일 안 로컬 함수 하나로 DTO를 만든다 — 기존 `project(viewer, row, VENDOR_DTO_SPEC)` 결과의 `customFields`에 `pickVisibleCustomFields`를 적용. 다섯 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 전부 이 함수를 쓰고, 목록·검색은 보이는 키 집합을 호출당 한 번만 계산한다. `VENDOR_DTO_SPEC`(「거래처 정보」 줄 포함)·`registerDto`는 그대로 둔다. `listVendorFieldDefinitions`는 01의 보관 제외에 더해 `visibleCustomFieldKeys`에 있는 정의만 돌려준다. `validatedCustomFields`는 바꾸지 않는다(보이지 않는 칸 값 되살리기는 05).
   232	
   233	④ `test/integration/leak-scan.test.ts` **끝에** `describe("커스텀 칸 축 — …")` 하나: 테스트 안에서 시스템 관리자로 칸 둘과 거래처 하나(두 칸 값은 서로 다른 고유 문자열)를 만들고, 순수 생성기 `buildCustomFieldCases(defs, roles)`(칸 × `SEED_ROLES`, 결정적 순서)의 케이스마다 그 계급에 `admin.vendors` 보기와 `vendor.value` 보임 행(`upsertVisibility`)을 켜고, **먼저** `listVendors`의 JSON 직렬화에 두 칸 값 문자열이 모두 있음을 단언한 뒤, 그 칸만 끄고 그 값 문자열만 사라지고 다른 칸 값은 남아 있음을 단언한다. `domain/seed/index.ts`에 `vendor.value` 행을 더하지 않는다(테스트 안에서만 켠다 — Task 1 acceptance의 seed diff 0 유지 · `domain/vendors`의 `VENDOR_DTO_SPEC`은 모든 칸이 `vendor.value`에 묶여 있고 시드는 이 행을 시스템 관리자·기본 계급에만 주므로, 켜지 않으면 나머지 시드 계급 케이스가 상위 차단으로 헛되이 통과한다). 기존 `describe`·import·헬퍼는 고치지 않는다.
   234	
   235	⑤ E2E: Task 1 스펙 파일에 케이스를 더한다. 값은 01의 거래처 폼으로 저장하고, 끈 셀은 테스트 끝에 다시 켜며, 칸은 `afterAll`에서 보관한다.
     1	import { and, eq } from "drizzle-orm";
     2	import type { InferSelectModel } from "drizzle-orm";
     3	import { db } from "@/db/client";
     4	import { permissionMatrix, visibilityMatrix } from "@/db/schema";
     5	import type { Viewer } from "@/domain/viewer";
     6	
     7	export type PermissionMatrixRow = InferSelectModel<typeof permissionMatrix>;
     8	export type VisibilityMatrixRow = InferSelectModel<typeof visibilityMatrix>;
     9	
    10	export async function findPermission(
    11	  viewer: Viewer,
    12	  roleId: string,
    13	  menu: string,
    14	  action: string,
    15	): Promise<PermissionMatrixRow | null> {
    16	  void viewer;
    17	  const [row] = await db
    18	    .select()
    19	    .from(permissionMatrix)
    20	    .where(
    21	      and(
    22	        eq(permissionMatrix.roleId, roleId),
    23	        eq(permissionMatrix.menu, menu),
    24	        eq(permissionMatrix.action, action),
    25	      ),
    26	    )
    27	    .limit(1);
    28	  return row ?? null;
    29	}
    30	
    31	// 복합 UNIQUE(permission_matrix_role_menu_action_key)를 onConflictDoUpdate
    32	// 대상으로 써서 같은 셀을 두 번 켜도 행이 하나이고 동시 토글은 마지막 쓰기가
    33	// 이긴다.
    34	export async function upsertPermission(
    35	  viewer: Viewer,
    36	  input: { roleId: string; menu: string; action: string; allowed: boolean; updatedBy?: string | null },
    37	): Promise<void> {
    38	  void viewer;
    39	  await db
    40	    .insert(permissionMatrix)
    41	    .values({
    42	      roleId: input.roleId,
    43	      menu: input.menu,
    44	      action: input.action,
    45	      allowed: input.allowed,
    46	      updatedBy: input.updatedBy ?? null,
    47	    })
    48	    .onConflictDoUpdate({
    49	      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
    50	      set: { allowed: input.allowed, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
    51	    });
    52	}
    53	
    54	// 이미 있는 셀은 건드리지 않는다 — 시드가 반복 실행돼도 관리자가 권한표에서
    55	// 이미 끈 값을 되살리지 않기 위해(onConflictDoUpdate 대신 DoNothing).
    56	export async function insertPermissionIfAbsent(
    57	  viewer: Viewer,
    58	  input: { roleId: string; menu: string; action: string; allowed: boolean; updatedBy?: string | null },
    59	): Promise<void> {
    60	  void viewer;
    61	  await db
    62	    .insert(permissionMatrix)
    63	    .values({
    64	      roleId: input.roleId,
    65	      menu: input.menu,
    66	      action: input.action,
    67	      allowed: input.allowed,
    68	      updatedBy: input.updatedBy ?? null,
    69	    })
    70	    .onConflictDoNothing({
    71	      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
    72	    });
    73	}
    74	
    75	export async function listPermissions(
    76	  viewer: Viewer,
    77	  opts?: { roleId?: string },
    78	): Promise<PermissionMatrixRow[]> {
    79	  void viewer;
    80	  return db
    81	    .select()
    82	    .from(permissionMatrix)
    83	    .where(opts?.roleId ? eq(permissionMatrix.roleId, opts.roleId) : undefined);
    84	}
    85	
    86	export async function findVisibility(
    87	  viewer: Viewer,
    88	  roleId: string,
    89	  infoItem: string,
    90	): Promise<VisibilityMatrixRow | null> {
    91	  void viewer;
    92	  const [row] = await db
    93	    .select()
    94	    .from(visibilityMatrix)
    95	    .where(and(eq(visibilityMatrix.roleId, roleId), eq(visibilityMatrix.infoItem, infoItem)))
    96	    .limit(1);
    97	  return row ?? null;
    98	}
    99	
   100	export async function upsertVisibility(
   101	  viewer: Viewer,
   102	  input: { roleId: string; infoItem: string; visible: boolean; updatedBy?: string | null },
   103	): Promise<void> {
   104	  void viewer;
   105	  await db
   106	    .insert(visibilityMatrix)
   107	    .values({
   108	      roleId: input.roleId,
   109	      infoItem: input.infoItem,
   110	      visible: input.visible,
   111	      updatedBy: input.updatedBy ?? null,
   112	    })
   113	    .onConflictDoUpdate({
   114	      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
   115	      set: { visible: input.visible, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
   116	    });
   117	}
   118	
   119	export async function listVisibility(
   120	  viewer: Viewer,
   121	  opts?: { roleId?: string },
   122	): Promise<VisibilityMatrixRow[]> {
   123	  void viewer;
   124	  return db
   125	    .select()
   126	    .from(visibilityMatrix)
   127	    .where(opts?.roleId ? eq(visibilityMatrix.roleId, opts.roleId) : undefined);
   128	}
     1	import type { Viewer } from "@/domain/viewer";
     2	import { can as defaultCan } from "@/domain/permissions/can";
     3	import { visible as defaultVisible } from "@/domain/permissions/visible";
     4	import { scopeFor } from "@/domain/permissions/scope-for";
     5	import { project, type DtoSpec } from "@/domain/permissions/project";
     6	import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
     7	import { registerDto } from "@/domain/permissions/dto-registry";
     8	import { UserFacingError } from "@/lib/actions/user-facing-error";
     9	import { encrypt, decrypt } from "@/lib/crypto";
    10	import { buildCustomFieldsSchema } from "@/domain/custom-fields/build-schema";
    11	import {
    12	  listVendors as repoListVendors,
    13	  searchVendorsByNormalizedName as repoSearchVendorsByNormalizedName,
    14	  findVendorById as repoFindVendorById,
    15	  findVendorsByNormalizedName as repoFindVendorsByNormalizedName,
    16	  insertVendor as repoInsertVendor,
    17	  updateVendor as repoUpdateVendor,
    18	  updateVendorAccountNumber as repoUpdateVendorAccountNumber,
    19	  setVendorHidden as repoSetVendorHidden,
    20	  type VendorRow,
    21	} from "@/repositories/vendors";
    22	import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";
    23	
    24	export class ForbiddenError extends UserFacingError {}
    25	
    26	// 보관은 사용자에게 "삭제"로 보이는 상태다 — 삭제된 것이 조용히 바뀌면 안 된다.
    27	export class ArchivedVendorError extends UserFacingError {}
    28	
    29	const VENDORS_MENU = "admin.vendors";
    30	const VENDOR_ENTITY = "vendor";
    31	const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";
    32	
    33	// MAST-01: 거래처 Dto — 전체 계좌번호(평문) 필드를 두지 않는다. 뒤 4자리
    34	// (accountNumberLast4)만 실어 목록이 마스킹 표시를 그릴 수 있게 하고, 평문은
    35	// 마스킹 해제 함수(파일 아래쪽)의 반환값으로만 나간다.
    36	export type VendorDto = {
    37	  id: string;
    38	  name: string;
    39	  businessNo: string | null;
    40	  hidden: boolean;
    41	  defaultEvidenceType: string | null;
    42	  accountBank: string | null;
    43	  accountHolder: string | null;
    44	  accountNumberLast4: string | null;
    45	  customFields: Record<string, unknown>;
    46	  archivedAt: Date | null;
    47	};
    48	
    49	export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
    50	  fields: [
    51	    { key: "id", from: "id", infoItem: "vendor.value" },
    52	    { key: "name", from: "name", infoItem: "vendor.value" },
    53	    { key: "businessNo", from: "businessNo", infoItem: "vendor.value" },
    54	    { key: "hidden", from: "hidden", infoItem: "vendor.value" },
    55	    { key: "defaultEvidenceType", from: "defaultEvidenceType", infoItem: "vendor.value" },
    56	    { key: "accountBank", from: "accountBank", infoItem: "vendor.value" },
    57	    { key: "accountHolder", from: "accountHolder", infoItem: "vendor.value" },
    58	    { key: "accountNumberLast4", from: "accountNumberLast4", infoItem: "vendor.value" },
    59	    { key: "customFields", from: "customFields", infoItem: "vendor.value" },
    60	    { key: "archivedAt", from: "archivedAt", infoItem: "vendor.value" },
    61	  ],
    62	};
    63	
    64	registerDto({
    65	  name: "VendorDto",
    66	  fields: VENDOR_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
    67	});
    68	
    69	// 이름 정규화 — NFC + 소문자. 자동완성·중복 후보 탐지 양쪽이 이 함수 하나만
    70	// 쓴다(정본 하나).
    71	export function normalizeVendorName(name: string): string {
    72	  return name.normalize("NFC").trim().toLowerCase();
    73	}
    74	
    75	// 코드 포인트 기준 길이 — 한글이 서로게이트 쌍이 아니어도 이 기준이 일관된다.
    76	function codePointLength(value: string): number {
    77	  return Array.from(value).length;
    78	}
    79	
    80	// 자동완성 일치 점수 — 완전 일치 > 접두어 일치 > 부분 일치. 순수 함수라 DB
    81	// 없이 단위 테스트로 고정한다.
    82	export function scoreVendorNameMatch(normalizedName: string, normalizedQuery: string): number {
    83	  if (normalizedName === normalizedQuery) return 3;
    84	  if (normalizedName.startsWith(normalizedQuery)) return 2;
    85	  if (normalizedName.includes(normalizedQuery)) return 1;
    86	  return 0;
    87	}
    88	
    89	export type VendorListDeps = { can: typeof defaultCan };
    90	
    91	export async function listVendors(
    92	  viewer: Viewer,
    93	  opts?: { includeHidden?: boolean },
    94	): Promise<VendorDto[]> {
    95	  const scope = await scopeFor(viewer, VENDOR_ENTITY);
    96	  const rows = await repoListVendors(viewer, { scope, includeHidden: opts?.includeHidden ?? false });
    97	  return Promise.all(rows.map((row) => project(viewer, row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
    98	}
    99	
   100	// 자동완성 — 검색어를 NFC 정규화 + 소문자로 낮춘 뒤 normalizedName의 부분
   101	// 일치로 후보를 좁히고, 점수(완전>접두어>부분)로 다시 정렬한다. 점수가 같으면
   102	// normalizedName, 그다음 id로 정렬해 순서가 결정적이다. 같은 이름 둘은 둘 다
   103	// 돌아온다 — 이름에 unique 제약이 없다.
   104	export async function searchVendors(viewer: Viewer, query: string, limit = 10): Promise<VendorDto[]> {
   105	  const normalizedQuery = normalizeVendorName(query);
   106	  if (codePointLength(normalizedQuery) === 0) return [];
   107	
   108	  const scope = await scopeFor(viewer, VENDOR_ENTITY);
   109	  const rows = await repoSearchVendorsByNormalizedName(viewer, { normalizedQuery, scope });
   110	
   111	  const scored = rows
   112	    .map((row) => ({ row, score: scoreVendorNameMatch(row.normalizedName, normalizedQuery) }))
   113	    .filter((entry) => entry.score > 0)
   114	    .sort(
   115	      (a, b) =>
   116	        b.score - a.score ||
   117	        a.row.normalizedName.localeCompare(b.row.normalizedName) ||
   118	        a.row.id.localeCompare(b.row.id),
   119	    )
   120	    .slice(0, limit);
   121	
   122	  return Promise.all(scored.map((entry) => project(viewer, entry.row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
   123	}
   124	
   125	// 커스텀 필드 정의 Dto — 필드 정의 자체는 사람 단위 민감 정보가 아니라
   126	// "어떤 필드가 있는지"를 알려주는 구조 메타데이터라 project()/정보 노출표를
   127	// 거치지 않는다(계좌번호 등 값과는 다른 종류). *Row 타입을 그대로 반환하지
   128	// 않도록 필드를 다시 매핑한다(plant8/no-row-type-escape).
   129	export type FieldDefinitionDto = {
   130	  id: string;
   131	  key: string;
   132	  type: "text" | "number" | "date" | "select";
   133	  options: string[] | null;
   134	  required: boolean;
   135	  sortOrder: number;
   136	};
   137	
   138	export type VendorFieldDefinitionsDeps = { can: typeof defaultCan };
   139	
   140	// 거래처 폼(Task 3)이 커스텀 필드 입력을 동적으로 그리는 데 쓴다. 거래처
   141	// 메뉴를 볼 수 없으면 빈 배열 — 화면 진입 자체가 이미 그 판정을 거친다.
   142	export async function listVendorFieldDefinitions(
   143	  viewer: Viewer,
   144	  deps?: Partial<VendorFieldDefinitionsDeps>,
   145	): Promise<FieldDefinitionDto[]> {
   146	  const canFn = deps?.can ?? defaultCan;
   147	  if (!(await canFn(viewer, VENDORS_MENU, "view"))) return [];
   148	
   149	  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
   150	  return defs.map((def) => ({
   151	    id: def.id,
   152	    key: def.key,
   153	    type: def.type as FieldDefinitionDto["type"],
   154	    options: Array.isArray(def.options) ? (def.options as string[]) : null,
   155	    required: def.required,
   156	    sortOrder: def.sortOrder,
   157	  }));
   158	}
   159	
   160	async function validatedCustomFields(
   161	  viewer: Viewer,
   162	  input: Record<string, unknown> | undefined,
   163	): Promise<Record<string, unknown>> {
   164	  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
   165	  const schema = buildCustomFieldsSchema(
   166	    defs.map((def) => ({
   167	      key: def.key,
   168	      type: def.type as "text" | "number" | "date" | "select",
   169	      options: Array.isArray(def.options) ? (def.options as string[]) : undefined,
   170	      required: def.required,
   171	    })),
   172	  );
   173	  return schema.parse(input ?? {}) as Record<string, unknown>;
   174	}
   175	
   176	export type VendorWriteDeps = {
   177	  can: typeof defaultCan;
   178	  findVendorById: typeof repoFindVendorById;
   179	  recordAction: typeof defaultRecordAction;
   180	};
   181	
   182	export type VendorInput = {
   183	  name: string;
   184	  businessNo?: string | null;
   185	  defaultEvidenceType?: string | null;
   186	  accountBank?: string | null;
   187	  accountHolder?: string | null;
   188	  /**
   189	   * 평문 계좌번호 — 저장 전 이 함수 안에서 즉시 암호화한다.
   190	   * updateVendor에서는 세 값이 서로 다르게 해석된다(M-5):
   191	   * undefined = 안 바꿈(기존 암호문·뒤 4자리 유지) · null = 지움(두 컬럼 모두 null) ·
   192	   * 문자열 = 새 값으로 교체. createVendor에서는 undefined·null·빈 문자열 모두
   193	   * "계좌번호 없음"으로 같다 — 지울 기존 값이 없다.
   194	   */
   195	  accountNumber?: string | null;
   196	  /**
   197	   * updateVendor에서 undefined면 기존 customFields를 건드리지 않는다(M-5와 같은
   198	   * 이유 — 필드 정의가 늘어난 뒤 일부 값만 보내는 경우를 생각하면, 전체를 무조건
   199	   * 교체하는 편이 "보내지 않은 값은 지운다"는 뜻이 되어 위험하다). 객체를 보내면
   200	   * (빈 객체 포함) 그 값으로 통째로 교체한다. createVendor에서는 항상 검증해
   201	   * 저장한다.
   202	   */
   203	  customFields?: Record<string, unknown>;
   204	};
   205	
   206	// MAST-01 리뷰 M-5 — 계좌번호 갱신 계획을 순수 함수로 뽑는다. undefined(안 바꿈) ·
   207	// null(지움) · 문자열(새 값)을 구분해, ""가 "지움"으로 잘못 해석돼 암호문·뒤 4자리를
   208	// 함께 날리던 landmine을 없앤다. encryptFn을 주입받아 암호화 키 없이도(단위 테스트)
   209	// 이 분기를 고정할 수 있다.
   210	export type AccountNumberPlan =
   211	  | { kind: "keep" }
   212	  | { kind: "clear" }
   213	  | { kind: "set"; accountNumberEncrypted: string; accountNumberLast4: string };
   214	
   215	export function planAccountNumberUpdate(
   216	  accountNumber: string | null | undefined,
   217	  encryptFn: (plaintext: string) => string = encrypt,
   218	): AccountNumberPlan {
   219	  if (accountNumber === undefined) return { kind: "keep" };
   220	  if (accountNumber === null) return { kind: "clear" };
   221	
   222	  const trimmed = accountNumber.trim();
   223	  // 빈 문자열(공백만 있는 값 포함)은 "지움"이 아니라 "안 바꿈"이다 — 편집 폼에서
   224	  // 칸을 비워 두는 가장 자연스러운 방법이 곧 "지움"이 되어서는 안 된다. 명시적으로
   225	  // 지우려면 null을 보낸다(편집 폼의 「계좌번호 지우기」 체크박스).
   226	  if (trimmed === "") return { kind: "keep" };
   227	
   228	  return {
   229	    kind: "set",
   230	    accountNumberEncrypted: encryptFn(trimmed),
   231	    accountNumberLast4: trimmed.slice(-4),
   232	  };
   233	}
   234	
   235	export type CreateVendorResult = { vendor: VendorDto; duplicateCount: number };
   236	
   237	// 거래처 등록 — 쓰기 권한 확인 → 커스텀 필드 검증 → 계좌번호가 있으면 암호화 +
   238	// 뒤 4자리를 함께 만들어 저장 → recordAction 기록. 이름에 unique 제약이
   239	// 없으므로 같은 정규화 이름의 기존 행을 미리 찾아 duplicateCount로 돌려주되
   240	// 등록 자체는 막지 않는다.

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '220,231p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '226,247p'; nl -ba domain/permissions/visible.ts; rg -n 'domain|boundaries' eslint.config.*; cat lib/db-transaction.ts; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '325,336p'; git diff -U1 -- .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | tail -38" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   220	    - (통합) 보관된 칸의 값은 시스템 관리자 DTO에도 없다(보관 칸은 목록에서 숨음 — D10-12)
   221	    - (통합, 기본 숨김 — Codex #2) `insertFieldDefinition`으로 직접 넣고 노출 행을 하나도 만들지 않은 거래처 정의(백필 전 운영 데이터와 같은 상태)의 값은 시스템 관리자 DTO에도 없다 — 백필이 왜 선행 조건인지 고정한다. 같은 정의에 `insertVisibilityIfAbsent`로 시스템 관리자 행을 넣으면 값이 보인다
   222	    - (통합) `listVendorFieldDefinitions`가 그 계급에게 A만 돌려준다
   223	    - (통합, 누수 스캔) 결정적 생성기가 (활성 칸 × 시드 계급) 케이스를 만들고, 각 케이스에서 그 계급에 `vendor.value` 보임 행을 켠 상태로 **끄기 전** 거래처 DTO 직렬화에 두 칸 값이 **있음**을 먼저 단언한 뒤, 그 칸을 끄면 그 칸의 값 문자열이 **없고** 다른 칸 값은 남는다(`vendor.value`가 꺼진 계급은 DTO 전체가 비어 헛되이 통과하므로 사전 양성 단언으로 막는다)
   224	    - (E2E) 시스템 관리자가 칸 「E2E비고…」를 만들고 거래처 하나에 값 「누수금지값…」을 저장 → 노출표에서 시스템 관리자 행의 그 칸을 끔 → `/admin/vendors`와 그 거래처 편집 화면 HTML에 칸 이름과 값이 없다 → 다시 켜면 편집 화면에 값이 보인다
   225	  </behavior>
   226	  <action>
   227	① RED 먼저.
   228	
   229	② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 끝에 선택 `tx: DbOrTx = db`(`@/repositories/document-counters` 타입 — `domain/quotes/lines.ts` 14행 선례)를 받아 두 조회 `listFieldDefinitions(…, tx)`·`listVisibility(…, tx)`에 넘기고, 그래서 `repositories/permissions.ts`의 `listVisibility`에도 끝의 선택 `tx: DbOrTx = db` 한 인자를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로 · 05가 거래처 행 잠금 트랜잭션 안에서 같은 연결로 부른다, Codex t1t2 MAJOR). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
   230	
   231	③ `domain/vendors/index.ts`: 파일 안 로컬 함수 하나로 DTO를 만든다 — 기존 `project(viewer, row, VENDOR_DTO_SPEC)` 결과의 `customFields`에 `pickVisibleCustomFields`를 적용. 다섯 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 전부 이 함수를 쓰고, 목록·검색은 보이는 키 집합을 호출당 한 번만 계산한다. `VENDOR_DTO_SPEC`(「거래처 정보」 줄 포함)·`registerDto`는 그대로 둔다. `listVendorFieldDefinitions`는 01의 보관 제외에 더해 `visibleCustomFieldKeys`에 있는 정의만 돌려준다. `validatedCustomFields`는 바꾸지 않는다(보이지 않는 칸 값 되살리기는 05).
   226	- `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
   227	- 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
   228	- `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
   229	- `repositories/permissions.ts`의 `findVisibility(viewer, roleId, infoItem)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로). `listVisibility`의 `tx`는 03이 더했다.
   230	
   231	④ `domain/vendors/index.ts`:
   232	- 파일 안 함수 `vendorInputFieldKeys(viewer, tx: DbOrTx = db)`를 둔다. `visible(viewer, "vendor.value", deps)` — `deps.findVisibility`는 받은 인자 끝에 `tx`를 붙여 `findVisibility`를 부르는 함수 — 가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY, tx)`다. `visible.ts`는 고치지 않는다(기존 `deps` 주입 지점).
   233	- `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
   234	- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `createVendor`는 둘을 행 삽입 전에(트랜잭션 없이, 두 인자 호출) 계산한다. `updateVendor`는 둘을 트랜잭션 **안에서** 행 잠금 **뒤에** 같은 `tx`로 계산한다(`repoListFieldDefinitions(viewer, VENDOR_ENTITY, tx)` — 01이 더한 끝의 선택 `tx` · `vendorInputFieldKeys(viewer, tx)`). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
   235	- `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
   236	- `updateVendor`:
   237	  - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
   238	  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   239	  - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   240	  - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   241	  - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
   242	  - 잠금은 정의·노출 조회·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다.
   243	- **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
   244	
   245	⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
   246	
   247	⑥ `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체를 한 번 돌려 거래처·견적 줄·프로젝트 회귀를 확인한다.
     1	import type { Viewer } from "@/domain/viewer";
     2	import { findVisibility as defaultFindVisibility } from "@/repositories/permissions";
     3	
     4	// ADMN-02: 정보 항목 노출 판정 — can()과 완전 독립(D-35). VisibleDeps 타입에
     5	// 메뉴×동작 판정 함수 필드를 두지 않는 것으로 이 독립성이 타입에도 드러나게
     6	// 한다 — 메뉴 접근 판정과 필드 노출 판정이 각자의 표만 읽는다.
     7	export type VisibleDeps = {
     8	  findVisibility: typeof defaultFindVisibility;
     9	};
    10	
    11	export async function visible(
    12	  viewer: Viewer,
    13	  infoItem: string,
    14	  deps?: Partial<VisibleDeps>,
    15	): Promise<boolean> {
    16	  // viewer에 계급 식별자가 없으면 기본 거부 — 노출표를 조회하지도 않는다.
    17	  if (!viewer.roleId) return false;
    18	
    19	  const findVisibility = deps?.findVisibility ?? defaultFindVisibility;
    20	  const row = await findVisibility(viewer, viewer.roleId, infoItem);
    21	  // 행이 없으면 false — 새 기능 정보는 기본 숨김이다.
    22	  return row?.visible === true;
    23	}
5:import boundaries from "eslint-plugin-boundaries";
20:      // 03-03(D-33/D-34, 03-RESEARCH.md Open Question 1): domain 하위 폴더 단위로
21:      // 세분화하지 않는다 — "repositories는 domain 안에서만 호출된다"는 이미 이
24:      "boundaries/elements": [
26:        { type: "domain", pattern: "domain/**" },
36:    plugins: { boundaries, plant8 },
39:      // 4계층 경계(app→domain/lib만, domain→app 금지, db는 아무도 import 안 함) — Issue 1·13A
40:      "boundaries/element-types": [
45:            { from: "app", allow: ["app", "domain", "lib", "ui"] },
46:            { from: "domain", allow: ["domain", "repositories", "lib"] },
47:            { from: "repositories", allow: ["repositories", "db", "domain"] },
49:            // 이므로 db→lib 한 방향은 허용(db→domain은 여전히 금지, 01-01 기존 코드).
51:            { from: "lib", allow: ["lib", "domain", "repositories", "db"] },
52:            { from: "scripts", allow: ["scripts", "domain", "repositories", "db", "lib"] },
61:                "domain",
71:            // ui는 순수 표현 계층 — domain/repositories/db/app을 import할 수 없다(D-26).
import { db, type DbOrTx } from "@/db/client";

// Phase 4(04-01): domain은 db를 직접 import할 수 없다(boundaries,
// `{ from: "domain", allow: ["domain", "repositories", "lib"] }`). 번호
// 부여 + 문서 INSERT를 같은 트랜잭션에 묶어야 하는 domain 함수
// (createProject·saveQuoteLines)는 이 lib 래퍼를 거쳐 트랜잭션을 연다 —
// 실제 쿼리는 여전히 repositories 함수만 한다(domain은 tx를 그 함수들에
// 전달만 한다).
export async function withTransaction<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
   325	| T-04.5-41 | Tampering | 동시 저장 — 읽기와 UPDATE 사이에 다른 사람이 숨은 칸을 고침(`domain/vendors/index.ts` 299행 읽기 · `repositories/vendors.ts` 105행 쓰기가 분리돼 있던 틈) | high | mitigate | `updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate`(`SELECT … FOR UPDATE`)로 잠근 저장값에 합치고 같은 `tx`로 UPDATE한다. 두 연결 경합 통합 테스트가 관리자의 새 값이 남는 것을 고정한다(Task 2) |
   326	| T-04.5-18 | Tampering | 보관 선택지 새 지정(요청 위조 포함) | medium | mitigate | 검증기 선택지에 보관 선택지는 그 행의 저장값 하나만 더한다. 그 밖의 보관 선택지는 칸 오류다(단위·통합) |
   327	| T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
   328	| T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
   329	| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·노출 조회를 `findVendorByIdForUpdate` 뒤 같은 `tx`로 옮긴다(Task 2 action ④). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」) |
   330	| T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
   331	
   332	eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
   333	</threat_model>
   334	
   335	<verification>
   336	- `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` 통과
   <action>
-① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다).
+① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다). `createRole` 기본 행 쓰기 실패 케이스(behavior 「eng review B-2 · T1」)도 이 RED에 넣고, 재시도·경고 로그 없이 grant 한 번만 부르는 ⑤ 초안에서 ①·② 단언이 빨간 출력을 SUMMARY에 인용한다.
 
@@ -177,3 +179,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
-⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — 계급은 이미 생겼으므로 — 운영 로그 `log.warn` 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패). 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
+⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
 
@@ -187,3 +189,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/visibility.test.ts test/integration/roles.test.ts test/integration/seed-permissions.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·기본 행 쓰기 실패 경로(재시도 뒤 행 있음 · 두 번 실패 시 계급 남음 + 경고 로그 1번 + `cf.` 행 0개)·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/permissions-grid.spec.ts</automated>
@@ -195,2 +197,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
     - `grantCustomFieldsToRole` 본문에서 `lockCustomFieldGrants(`가 `listFieldDefinitions(`보다 먼저 오고 같은 `withTransaction` 안이며, 그 `listFieldDefinitions(` 호출(주입 dep 경유 포함)이 `tx)`로 끝난다(같은 연결) · 경합 케이스의 잠금 없는 RED 실패 출력, 풀 고갈 케이스의 `tx` 없는 RED 시간 초과 출력, 둘 다 초록인 출력이 SUMMARY에 있다
+    - `createRole`의 기본 행 쓰기 실패 경로가 고정돼 있다 — `grep -v '^\s*//' domain/permissions/roles.ts | grep -c "role.custom_field_grant_failed"`가 1이고, `grep -c 'spyOn(log, "warn")' test/integration/custom-field-visibility.test.ts`가 1 이상이며, behavior 「eng review B-2 · T1」의 ①(재시도 뒤 행 하나)·②(계급 남음 · dep 2번 · 경고 로그 1번 · `cf.` 행 0개) 두 케이스의 RED 출력과 초록 출력이 SUMMARY에 있다
     - 경합 테스트에 타이머·고정 지연이 없다 — `grep -v '^\s*//' test/integration/custom-field-visibility.test.ts | grep -c "setTimeout"`가 0이다(주석 줄 제외)
@@ -204,3 +207,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
   <name>Task 2: 거래처 DTO 칸별 판정 — 모든 출구에서 보이는 키만 · 폼 정의도 보이는 칸만 · 누수 스캔 커스텀 축 · 끈 계급의 화면에 값 없음</name>
-  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
+  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, repositories/permissions.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
   <precondition>01/08이 이 브랜치에 더한 마이그레이션 SQL에 기존 거래처 정의의 노출 행 백필 문장이 있다 — `git diff --name-only origin/main -- db/migrations | grep '\.sql$' | xargs grep -l "visibility_matrix"`가 한 파일 이상을 내고, 그 문장이 `field_definitions`·`roles`에서 SELECT하며 `ON CONFLICT` … `DO NOTHING`으로 끝난다. 없으면 이 태스크를 시작하지 않고 멈춰 오케스트레이터에 알린다(01 마이그레이션은 그룹 A 소유)</precondition>
@@ -225,3 +228,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 
-② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
+② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 끝에 선택 `tx: DbOrTx = db`(`@/repositories/document-counters` 타입 — `domain/quotes/lines.ts` 14행 선례)를 받아 두 조회 `listFieldDefinitions(…, tx)`·`listVisibility(…, tx)`에 넘기고, 그래서 `repositories/permissions.ts`의 `listVisibility`에도 끝의 선택 `tx: DbOrTx = db` 한 인자를 더한다(쿼리 시작 `db` → `tx`만 · 기존 호출 그대로 · 05가 거래처 행 잠금 트랜잭션 안에서 같은 연결로 부른다, Codex t1t2 MAJOR). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
 
@@ -273,3 +276,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | T-04.5-07 | Tampering | 칸 생성(01) ↔ 계급 생성(`grantCustomFieldsToRole`) 동시 실행 | medium | mitigate | 01과 같은 위협의 계급 쪽 절반. 두 경로가 같은 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`를 첫 문장으로 잡고 잠금 뒤에 상대 목록을 같은 `tx` 연결로 읽어 직렬화된다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생기고, 잠금 보유자가 두 번째 풀 연결을 요구하지 않아 풀 고갈 교착이 없다. await 없이 띄운 grant와 고정 지연 없는 동기화 지점(`defsRead` · `pg_locks` 대기 행)으로 경합을 재현한 통합 테스트가 잠금 없는 RED → 잠금 뒤 초록으로, 풀 크기만큼 동시 부여 통합 테스트가 같은 연결 조회를 고정한다(Task 1) |
-| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 숨김 쪽으로 실패한다 |
+| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 한 번 재시도 뒤 숨김 쪽으로 실패하고 경고 로그 `role.custom_field_grant_failed`(`roleId`)를 남긴다 — 조용히 행 없는 계급이 남지 않는다(Task 1 통합 테스트, eng review B-2) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — 의존성 객체·lockfile diff 없음 |
@@ -297,3 +300,3 @@ Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 
 | 함수(신규, domain) | `customFieldColumns` · `isAssignableInfoItem` · `visibleCustomFieldKeys` · `grantCustomFieldsToRole` · `pickVisibleCustomFields`(`domain/custom-fields/visibility.ts`) |
-| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
+| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행 · 실패 시 1회 재시도 → 경고 로그, `RoleWriteDeps.grantCustomFieldsToRole` 주입 지점) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
 | 테스트 | `test/integration/custom-field-visibility.test.ts`(권한 없는 계급의 `cf.` 셀 거부 · 노출 행 없는 정의의 기본 숨김 포함) · `test/integration/leak-scan.test.ts` 커스텀 칸 축 · `test/e2e/custom-field-visibility.spec.ts` |

codex
라운드 1의 ‘숨김 → 관리자 저장 → 사용자 덮어쓰기’는 새 잠금 순서로 차단됩니다. 다만 여러 노출 조회가 서로 다른 시점의 값을 합칠 수 있어, ‘행 잠금이 전체 판정의 직렬 기준점’이라는 주장은 별도 검증이 필요합니다.

web search: 
web search: https://www.postgresql.org/docs/current/transaction-iso.html
exec
/bin/bash -lc "nl -ba eslint.config.mjs | sed -n '39,48p'; nl -ba repositories/vendors.ts | sed -n '99,110p'; nl -ba domain/permissions/roles.ts | sed -n '100,116p'; nl -ba repositories/roles.ts | sed -n '34,46p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '24,29p'; ls -a /home/user | head" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
    39	      // 4계층 경계(app→domain/lib만, domain→app 금지, db는 아무도 import 안 함) — Issue 1·13A
    40	      "boundaries/element-types": [
    41	        "error",
    42	        {
    43	          default: "disallow",
    44	          rules: [
    45	            { from: "app", allow: ["app", "domain", "lib", "ui"] },
    46	            { from: "domain", allow: ["domain", "repositories", "lib"] },
    47	            { from: "repositories", allow: ["repositories", "db", "domain"] },
    48	            // db/client.ts는 lib/env.ts(환경 변수 계약)를 읽어야 한다 — lib는 횡단 모듈
    99	  accountHolder: string | null;
   100	  customFields: Record<string, unknown>;
   101	}>;
   102	
   103	// 계좌번호를 바꾸지 않는 일반 갱신 — 암호문·뒤 4자리 두 컬럼을 아예 건드리지
   104	// 않는다(T-03-33과 같은 결: 두 번의 쓰기로 나누지 않는다).
   105	export async function updateVendor(viewer: Viewer, id: string, input: VendorUpdateInput): Promise<void> {
   106	  await db
   107	    .update(vendors)
   108	    .set({ ...input, updatedAt: new Date() })
   109	    .where(eq(vendors.id, id));
   110	}
   100	  input: { name: string; sortOrder?: number },
   101	  deps?: Partial<RoleWriteDeps>,
   102	): Promise<RoleDto> {
   103	  const canFn = deps?.can ?? defaultCan;
   104	  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
   105	    throw new ForbiddenError("계급 추가 권한이 없습니다.");
   106	  }
   107	
   108	  const id = `role-${randomUUID()}`;
   109	  const row = await repoInsertRole(viewer, { id, name: normalizeRoleName(input.name), sortOrder: input.sortOrder });
   110	
   111	  const recordAction = deps?.recordAction ?? defaultRecordAction;
   112	  await recordAction(viewer, { actionType: "permission_change", entity: "roles", entityId: row.id });
   113	
   114	  return (await project(viewer, row, ROLE_DTO_SPEC)) as RoleDto;
   115	}
   116	
    34	export async function insertRole(
    35	  viewer: Viewer,
    36	  input: { id: string; name: string; sortOrder?: number },
    37	): Promise<RoleRow> {
    38	  void viewer;
    39	  const [row] = await db
    40	    .insert(roles)
    41	    .values({ id: input.id, name: normalizeRoleName(input.name), sortOrder: input.sortOrder ?? 0 })
    42	    .returning();
    43	  if (!row) throw new Error("roles insert가 행을 반환하지 않았습니다.");
    44	  return row;
    45	}
    46	
    24	  confidence: low
    25	
    26	must_haves:
    27	  truths:
    28	    - "거래처 저장은 보는 사람이 볼 수 없는 칸의 저장값을 지우거나 바꾸지 않는다 — 보관된 칸, 그 사람 계급에서 끈 칸, `vendor.value`(「거래처 정보」)가 꺼진 사람의 모든 칸이 그렇다. 서버가 저장값에서 입력 칸 밖의 키를 그대로 되살려 합친다. 안내 문구는 없다(UI-SPEC E4 hidden·stale, ROADMAP 04.5 기준 2 값 보존)"
    29	    - "거래처 수정의 합치기와 쓰기는 원자적이다 — `updateVendor`가 `withTransaction` 안에서 그 거래처 행을 `SELECT … FOR UPDATE`로 잠가 읽고, 그 저장값으로 판정·합친 객체를 같은 트랜잭션의 UPDATE로 쓴다. 읽은 뒤 쓰기 전에 다른 사람(관리자)이 숨은 칸을 고쳐도 좁은 계급의 저장이 그 값을 이전 값으로 되돌리지 않는다 — 두 연결 경합 통합 테스트가 고정한다(Codex #1)"
.
..
ERP_PLANT8_260917

codex
| 라운드 1 지적 | 상태 | 근거 |
|---|---|---|
| MAJOR: 다른 저장이 끼면 직렬 동치 깨짐 | RESOLVED | `04.5-05-PLAN.md:238`의 잠금 후 조회와 `:208`의 회귀 테스트로 기존 반례 차단. 이 반례에 공유 잠금이 필수라는 이전 주장은 철회한다. |
| MINOR: “푸는 변경은 저장 거부” 단정 | RESOLVED | `04.5-05-PLAN.md:329`가 성공·제출값 무시·거부로 수정됨. |
| NOTE: T1은 영구 누락 복구 보장 아님 | RESOLVED | `04.5-03-PLAN.md:163,179`에 재시도·두 번 실패 시 경고와 계급 유지가 명시됨. 자동 복구 보장은 여전히 없음. |

[MAJOR] 새 완화책도 서로 다른 시점의 노출 판정을 합친다 — **근거:** `04.5-05-PLAN.md:232,234,329`, `04.5-03-PLAN.md:229`. `vendor.value`와 칸별 노출은 별도 SELECT다(`domain/permissions/visible.ts:19–22`, `repositories/permissions.ts:92–96,124–127`). 같은 `tx`에서도 READ COMMITTED는 문장별 스냅샷이다([PostgreSQL 문서](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)).

구체적 순서: 활성 칸 A의 초기 노출은 `(vendor.value=true, cf.A=false)`이고 저장값은 비공개 값이다. 사용자 저장이 거래처를 잠근 뒤 `vendor.value=true`를 읽는다 → 관리자가 `vendor.value=false`를 커밋한다 → 관리자가 `cf.A=true`를 커밋한다 → 사용자 저장이 칸별 노출에서 `true`를 읽고 제출값으로 A를 덮는다. 노출 변경은 거래처 잠금을 기다리지 않는다(`repositories/permissions.ts:100–115`); UPDATE는 전달값을 쓴다(`repositories/vendors.ts:105–109`). **두 조건이 동시에 참인 시점이 전혀 없으므로**, 어느 직렬 위치에서도 허용되지 않는 저장이다. 기존 세 작업 반례와는 별개로, 변경된 완화책의 보장에 남는 구멍이다. — **수정:** 거래처 잠금 뒤 정의·상위 노출·칸별 노출을 **하나의 SQL 스냅샷**으로 읽어 판정하고, 위 순서를 회귀 테스트에 추가한다.

[MINOR] domain의 `tx = db` 기본값이 계층 규칙과 충돌한다 — **근거:** `04.5-03-PLAN.md:229`, `04.5-05-PLAN.md:232`는 domain 함수에 `tx: DbOrTx = db`를 지시하지만 domain의 DB 직접 import는 금지다(`eslint.config.mjs:40–46`). — **수정:** domain은 `tx?: DbOrTx`를 전달만 하고, `= db` 기본값은 repository에만 둔다.

판정: 막는 문제 있음 (1건)
tokens used
42,001
| 라운드 1 지적 | 상태 | 근거 |
|---|---|---|
| MAJOR: 다른 저장이 끼면 직렬 동치 깨짐 | RESOLVED | `04.5-05-PLAN.md:238`의 잠금 후 조회와 `:208`의 회귀 테스트로 기존 반례 차단. 이 반례에 공유 잠금이 필수라는 이전 주장은 철회한다. |
| MINOR: “푸는 변경은 저장 거부” 단정 | RESOLVED | `04.5-05-PLAN.md:329`가 성공·제출값 무시·거부로 수정됨. |
| NOTE: T1은 영구 누락 복구 보장 아님 | RESOLVED | `04.5-03-PLAN.md:163,179`에 재시도·두 번 실패 시 경고와 계급 유지가 명시됨. 자동 복구 보장은 여전히 없음. |

[MAJOR] 새 완화책도 서로 다른 시점의 노출 판정을 합친다 — **근거:** `04.5-05-PLAN.md:232,234,329`, `04.5-03-PLAN.md:229`. `vendor.value`와 칸별 노출은 별도 SELECT다(`domain/permissions/visible.ts:19–22`, `repositories/permissions.ts:92–96,124–127`). 같은 `tx`에서도 READ COMMITTED는 문장별 스냅샷이다([PostgreSQL 문서](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)).

구체적 순서: 활성 칸 A의 초기 노출은 `(vendor.value=true, cf.A=false)`이고 저장값은 비공개 값이다. 사용자 저장이 거래처를 잠근 뒤 `vendor.value=true`를 읽는다 → 관리자가 `vendor.value=false`를 커밋한다 → 관리자가 `cf.A=true`를 커밋한다 → 사용자 저장이 칸별 노출에서 `true`를 읽고 제출값으로 A를 덮는다. 노출 변경은 거래처 잠금을 기다리지 않는다(`repositories/permissions.ts:100–115`); UPDATE는 전달값을 쓴다(`repositories/vendors.ts:105–109`). **두 조건이 동시에 참인 시점이 전혀 없으므로**, 어느 직렬 위치에서도 허용되지 않는 저장이다. 기존 세 작업 반례와는 별개로, 변경된 완화책의 보장에 남는 구멍이다. — **수정:** 거래처 잠금 뒤 정의·상위 노출·칸별 노출을 **하나의 SQL 스냅샷**으로 읽어 판정하고, 위 순서를 회귀 테스트에 추가한다.

[MINOR] domain의 `tx = db` 기본값이 계층 규칙과 충돌한다 — **근거:** `04.5-03-PLAN.md:229`, `04.5-05-PLAN.md:232`는 domain 함수에 `tx: DbOrTx = db`를 지시하지만 domain의 DB 직접 import는 금지다(`eslint.config.mjs:40–46`). — **수정:** domain은 `tx?: DbOrTx`를 전달만 하고, `= db` 기본값은 repository에만 둔다.

판정: 막는 문제 있음 (1건)
exit=0
eslint.config.mjs
db/migrations/0007_vendors_crypto_conventions.sql
db/migrations/0003_permissions_masters_spine.sql
db/schema/permissions.ts
db/schema/vendors.ts
db/schema/field-definitions.ts
test/e2e/mobile-vendors.spec.ts
repositories/permissions.ts
repositories/field-definitions.ts
test/e2e/vendors.spec.ts
test/e2e/vendor-edit.spec.ts
test/e2e/permissions-grid.spec.ts
repositories/vendors.ts
test/integration/quote-line-visibility.test.ts
test/integration/vendors.test.ts
test/integration/seed-permissions.test.ts
test/integration/visibility.test.ts
app/(app)/admin/vendors/vendor-form.tsx
app/(app)/admin/vendors/vendors.module.css

exec
/bin/bash -lc "rg --files -g AGENTS.md; git diff --stat -- .planning/phases/04.5-custom-field-admin/; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '190,280p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
 .../phases/04.5-custom-field-admin/04.5-03-PLAN.md | 16 +++++----
 .../phases/04.5-custom-field-admin/04.5-05-PLAN.md | 40 ++++++++++++++--------
 2 files changed, 34 insertions(+), 22 deletions(-)
   190	  </acceptance_criteria>
   191	  <done>거래처 커스텀 값의 쓰기 규칙이 DB 없이 한 함수로 판정되고, 표의 모든 행이 단위 테스트로 고정되어 있다</done>
   192	</task>
   193	
   194	<task type="auto" tdd="true">
   195	  <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
   196	  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   197	  <read_first>
   198	    - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
   199	    - `repositories/vendors.ts` 47–50행(`findVendorById`) · 105–110행(`updateVendor` — 전역 `db`로 쓴다)
   200	    - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
   201	    - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
   202	    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`의 규칙) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`) · `repositories/permissions.ts` 1–5행(import) · 86–98행 `findVisibility` · 119–128행 `listVisibility`(한 문으로 합칠 두 조회의 모양 — 이 둘은 바꾸지 않는다) · `repositories/field-definitions.ts` 9–15행(`listFieldDefinitions`의 조건·정렬 — 한 문 조회가 같은 조건·정렬을 쓴다) · `eslint.config.mjs` 40–46행(domain → `db` import 금지)
   203	    - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   204	  </read_first>
   205	  <behavior>
   206	    - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
   207	    - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
   208	    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
   209	    - (한 문 조회 — 리포지토리) 거래처 정의 셋(활성 A·B, 보관 C)과 테스트 계급의 `vendor.value` 보임 · `cf.vendor.<A>` 보임 · `cf.vendor.<B>` 꺼짐 · C 행 없음 → `readVendorFieldAccess(SYSTEM_VIEWER, 계급 id)`가 `definitions` 셋(정렬 순서, 보관 포함) · `vendorValueVisible` 참 · `visibleFieldKeys` {A}를 돌려준다 · `vendor.value` 행이 없는 계급은 `vendorValueVisible` 거짓 · `roleId`가 null이면 두 보임 모두 거짓이고 `definitions`는 셋 그대로
   210	    - (경합 — 거래처 정보 끔 + 칸 켬, Codex t1t2-2 MAJOR 회귀) 테스트 계급에 `vendor.value` 보임 · `cf.vendor.<A>` 꺼짐이고 거래처에 A 값이 있다. 연결 1이 한 트랜잭션에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE(행 잠금)하고, `vendor.value`를 끄고, `cf.vendor.<A>`를 켠 채 커밋하지 않는다 → 사용자 `updateVendor`(A에 「사용자값」)를 기다리지 않고 시작 → `pg_locks`에 `granted = false` 행이 생길 때까지 폴링(50ms, 5초 넘으면 실패) → 커밋 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(두 보임 변경이 모두 반영된 스냅숏에서 `vendor.value`가 꺼져 입력 칸이 0개)
   211	    - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
   212	    - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
   213	    - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
   214	    - (없는 키 — 거부) 누구든 어떤 거래처 정의에도 없는 키를 보내면(값이 빈 문자열이어도, 다른 칸 수정과 함께여도) `UnknownCustomFieldKeyError`이고 DB는 그대로다(행 `updated_at` 불변, 행동 로그 없음)
   215	    - (노출 행 없는 정의) 정의만 있고 노출 행이 하나도 없는 거래처 칸(백필 전 상태)은 시스템 관리자에게도 입력 칸이 아니다 — 그 키를 새 값과 함께 보내도 거부하지 않고 제출값을 버리며, 저장값은 되살리기로 남는다
   216	    - (필수 · 나중에 생긴 칸) 거래처를 만든 뒤 필수 칸 C를 추가한다. 다른 칸만 고쳐 수정 저장(C는 빈 문자열)하면 성공하고 C 키는 없다. 같은 거래처에서 C에 값을 넣어 저장한 뒤 C를 빈 문자열로 저장하면 `CustomFieldsInvalidError` `{ C: "필수 칸이 비어 있습니다 · 값 입력" }`
   217	    - (필수 · 등록) C가 빈 등록은 `CustomFieldsInvalidError`이고 거래처 행이 생기지 않는다
   218	    - (보관 선택지) 선택형 D의 저장값 「구형」을, 픽스처가 `options`에서 빼고 `archived_options`에 넣어(02의 수정 기능을 부르지 않는다 — 02는 이 플랜의 depends_on 밖) 보관한 뒤 「구형」 그대로 저장하면 값 유지. 다른 보관 선택지로 바꾸면 D에 보관 선택지 문구
   219	    - (Phase 3 픽스처) `test/integration/custom-fields.test.ts`의 거래처 정의 세 테스트가 노출 행을 명시로 넣은 뒤 초록이다 — 「등록된 키만 저장」은 값이 저장되고, 「등록되지 않은 키」는 `UnknownCustomFieldKeyError`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다
   220	    - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   221	  </behavior>
   222	  <action>
   223	① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용). 「한 문 조회」는 함수가 없어 빨갛다. 「경합 — 거래처 정보 끔 + 칸 켬」은 두 보임 변경이 저장의 조회 전에 모두 커밋되는 결정적 설계라 여러 문으로 읽는 초안에서도 초록일 수 있다 — 저장의 두 조회 **사이**에 커밋을 끼워 넣는 것은 도메인 안에 테스트 전용 훅 없이는 결정적으로 강제할 수 없으므로, 한 문 구조는 acceptance의 구조 게이트가 고정하고 이 케이스는 끝 상태 회귀를 고정한다(SUMMARY에 이 구분을 적는다).
   224	
   225	② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
   226	
   227	③ `repositories/vendors.ts`(Phase 4 브랜치 diff 없음 — 계획 때 확인):
   228	- `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
   229	- 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
   230	- `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
   231	- `repositories/permissions.ts`에 `readVendorFieldAccess(viewer, roleId: string | null, tx: DbOrTx = db)`를 더한다 — **SELECT 한 문**(READ COMMITTED에서 한 문 = 한 스냅숏, Codex t1t2-2 MAJOR): `field_definitions`(`entity = 'vendor'`, 보관 포함, `orderBy(sortOrder, key)`)에 `visibility_matrix`를 별칭 둘(Drizzle `alias` — 설치된 `drizzle-orm/pg-core`의 기존 export)로 LEFT JOIN한다. 하나는 `(role_id, 'cf.vendor.' || key)`, 하나는 `(role_id, 'vendor.value')`다(`(role_id, info_item)` 유일이라 행이 늘지 않는다). 돌려주는 모양은 `{ definitions: 정의 행[], vendorValueVisible: boolean, visibleFieldKeys: Set<string> }`이고 행 없음·`roleId` 없음은 거짓이다(정의가 0개면 입력 칸도 0개라 `vendorValueVisible`은 쓰이지 않는다). 기존 `findVisibility`·`listVisibility`는 바꾸지 않는다.
   232	
   233	④ `domain/vendors/index.ts`:
   234	- 파일 안 함수 `vendorInputFieldKeys(viewer, tx?: DbOrTx)`를 둔다(domain은 `db`를 import할 수 없다 — `eslint.config.mjs` 40–46행. 기본값 없이 받은 `tx`를 그대로 넘기고, `= db` 기본값은 리포지토리에만 있다). `readVendorFieldAccess(viewer, viewer.roleId ?? null, tx)`를 **한 번** 부르고, 그 결과만으로 `{ inputDefs, knownKeys }`를 도출한다 — `inputDefs` = `vendorValueVisible`이 참일 때 `archivedAt`이 null이고 `visibleFieldKeys`에 든 정의(칸 정렬 순서, `archived_options`·`label` 포함), 아니면 빈 배열. `knownKeys` = `definitions` **전체**의 키. 규칙은 03의 `visibleCustomFieldKeys`(활성 ∩ `cf.vendor.<key>` 보임)에 `vendor.value` AND를 건 것과 같다.
   235	- `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
   236	- 입력 칸 정의·`knownKeys`는 둘 다 `vendorInputFieldKeys`의 결과다(정의 조회를 따로 하지 않는다 — `repositories/field-definitions.ts`의 `listFieldDefinitions`는 이 플랜에서 부르지도 고치지도 않는다). 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `listVendorFieldDefinitions`·`createVendor`는 `tx` 없이(행 삽입 전) 부른다. `updateVendor`는 트랜잭션 **안에서** 행 잠금 **뒤에** `vendorInputFieldKeys(viewer, tx)`로 부른다. 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
   237	- `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
   238	- `updateVendor`:
   239	  - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
   240	  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   241	  - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   242	  - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   243	  - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
   244	  - 잠금은 정의·노출 조회(한 문)·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다. 트랜잭션 격리 수준은 기본(READ COMMITTED) 그대로다 — REPEATABLE READ는 `FOR UPDATE` 직렬화 오류 재시도를 부른다.
   245	- **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
   246	
   247	⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
   248	
   249	⑥ `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체를 한 번 돌려 거래처·견적 줄·프로젝트 회귀를 확인한다.
   250	  </action>
   251	  <verify>
   252	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
   253	    <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
   254	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
   255	    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」·「거래처 정보 끔 + 칸 켬」 경합에서 사용자 제출값이 관리자 값을 덮거나, 한 문 조회의 모양이 어긋나거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
   256	    <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
   257	    <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   258	  </verify>
   259	  <acceptance_criteria>
   260	    - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
   261	    - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
   262	    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `vendorInputFieldKeys(viewer, tx)`보다 먼저 오고, 콜백 안에 다른 정의·노출 조회(`ListFieldDefinitions(`·`visible(`·`findVisibility(`·`listVisibility(`·`visibleCustomFieldKeys(`)가 없다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|vendorInputFieldKeys\(|ListFieldDefinitions\(|visible\(|Visibility\(|visibleCustomFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
   263	    - 한 문 구조 게이트(Codex t1t2-2 MAJOR): `awk '/export async function readVendorFieldAccess/,/^}/' repositories/permissions.ts | grep -v '^\s*//' | grep -c "await"`가 1이고(쿼리 한 번), `vendorInputFieldKeys` 본문에서 리포지토리 호출은 `readVendorFieldAccess(` 하나뿐이다(`awk '/function vendorInputFieldKeys/,/^}/' domain/vendors/index.ts | grep -v '^\s*//' | grep -cE "await"`가 1) · `grep -v '^\s*//' domain/vendors/index.ts | grep -cE "tx\??: DbOrTx = db"`가 0이다(domain에 `= db` 기본값 없음)
   264	    - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
   265	    - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
   266	    - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
   267	    - `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체가 초록이다(SUMMARY에 통과 개수 요약)
   268	    - 세 검증 명령이 전부 초록이다
   269	  </acceptance_criteria>
   270	  <done>권한이 좁은 사람이 거래처를 저장해도 보이지 않는 칸의 값은 남고(동시에 관리자가 고친 값도 되돌리지 않는다, 오래 열린 폼이 보낸 보관·끈 칸 키는 버려지고 저장은 성공한다), 정의에 없는 키는 거부되며, 필수 칸은 그 칸을 고칠 때만 막힌다</done>
   271	</task>
   272	
   273	<task type="auto">
   274	  <name>Task 3: 거래처 액션의 칸별 오류 반환 · 폼 수정 제출 모양 · 거래처 E2E 회귀</name>
   275	  <files>app/(app)/admin/vendors/actions.ts, app/(app)/admin/vendors/vendor-form.tsx</files>
   276	  <read_first>
   277	    - `app/(app)/admin/vendors/actions.ts`(전문 — 두 스키마가 `.schema(z.object(…))` 안에 인라인이다) · `node_modules/next-safe-action/dist/index.d.mts`에서 `returnValidationErrors` 시그니처
   278	    - `app/(app)/admin/vendors/vendor-form.tsx` 92–135행(`handleSubmit`의 커스텀 값 수집)
   279	    - `domain/custom-fields/preserve.ts`(Task 1 — `CustomFieldsInvalidError.fieldErrors`)
   280	  </read_first>

exec
/bin/bash -lc 'nl -ba repositories/permissions.ts; nl -ba domain/vendors/index.ts; nl -ba eslint.config.mjs | head -85; nl -ba db/schema/permissions.ts' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
     1	import { and, eq } from "drizzle-orm";
     2	import type { InferSelectModel } from "drizzle-orm";
     3	import { db } from "@/db/client";
     4	import { permissionMatrix, visibilityMatrix } from "@/db/schema";
     5	import type { Viewer } from "@/domain/viewer";
     6	
     7	export type PermissionMatrixRow = InferSelectModel<typeof permissionMatrix>;
     8	export type VisibilityMatrixRow = InferSelectModel<typeof visibilityMatrix>;
     9	
    10	export async function findPermission(
    11	  viewer: Viewer,
    12	  roleId: string,
    13	  menu: string,
    14	  action: string,
    15	): Promise<PermissionMatrixRow | null> {
    16	  void viewer;
    17	  const [row] = await db
    18	    .select()
    19	    .from(permissionMatrix)
    20	    .where(
    21	      and(
    22	        eq(permissionMatrix.roleId, roleId),
    23	        eq(permissionMatrix.menu, menu),
    24	        eq(permissionMatrix.action, action),
    25	      ),
    26	    )
    27	    .limit(1);
    28	  return row ?? null;
    29	}
    30	
    31	// 복합 UNIQUE(permission_matrix_role_menu_action_key)를 onConflictDoUpdate
    32	// 대상으로 써서 같은 셀을 두 번 켜도 행이 하나이고 동시 토글은 마지막 쓰기가
    33	// 이긴다.
    34	export async function upsertPermission(
    35	  viewer: Viewer,
    36	  input: { roleId: string; menu: string; action: string; allowed: boolean; updatedBy?: string | null },
    37	): Promise<void> {
    38	  void viewer;
    39	  await db
    40	    .insert(permissionMatrix)
    41	    .values({
    42	      roleId: input.roleId,
    43	      menu: input.menu,
    44	      action: input.action,
    45	      allowed: input.allowed,
    46	      updatedBy: input.updatedBy ?? null,
    47	    })
    48	    .onConflictDoUpdate({
    49	      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
    50	      set: { allowed: input.allowed, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
    51	    });
    52	}
    53	
    54	// 이미 있는 셀은 건드리지 않는다 — 시드가 반복 실행돼도 관리자가 권한표에서
    55	// 이미 끈 값을 되살리지 않기 위해(onConflictDoUpdate 대신 DoNothing).
    56	export async function insertPermissionIfAbsent(
    57	  viewer: Viewer,
    58	  input: { roleId: string; menu: string; action: string; allowed: boolean; updatedBy?: string | null },
    59	): Promise<void> {
    60	  void viewer;
    61	  await db
    62	    .insert(permissionMatrix)
    63	    .values({
    64	      roleId: input.roleId,
    65	      menu: input.menu,
    66	      action: input.action,
    67	      allowed: input.allowed,
    68	      updatedBy: input.updatedBy ?? null,
    69	    })
    70	    .onConflictDoNothing({
    71	      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
    72	    });
    73	}
    74	
    75	export async function listPermissions(
    76	  viewer: Viewer,
    77	  opts?: { roleId?: string },
    78	): Promise<PermissionMatrixRow[]> {
    79	  void viewer;
    80	  return db
    81	    .select()
    82	    .from(permissionMatrix)
    83	    .where(opts?.roleId ? eq(permissionMatrix.roleId, opts.roleId) : undefined);
    84	}
    85	
    86	export async function findVisibility(
    87	  viewer: Viewer,
    88	  roleId: string,
    89	  infoItem: string,
    90	): Promise<VisibilityMatrixRow | null> {
    91	  void viewer;
    92	  const [row] = await db
    93	    .select()
    94	    .from(visibilityMatrix)
    95	    .where(and(eq(visibilityMatrix.roleId, roleId), eq(visibilityMatrix.infoItem, infoItem)))
    96	    .limit(1);
    97	  return row ?? null;
    98	}
    99	
   100	export async function upsertVisibility(
   101	  viewer: Viewer,
   102	  input: { roleId: string; infoItem: string; visible: boolean; updatedBy?: string | null },
   103	): Promise<void> {
   104	  void viewer;
   105	  await db
   106	    .insert(visibilityMatrix)
   107	    .values({
   108	      roleId: input.roleId,
   109	      infoItem: input.infoItem,
   110	      visible: input.visible,
   111	      updatedBy: input.updatedBy ?? null,
   112	    })
   113	    .onConflictDoUpdate({
   114	      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
   115	      set: { visible: input.visible, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
   116	    });
   117	}
   118	
   119	export async function listVisibility(
   120	  viewer: Viewer,
   121	  opts?: { roleId?: string },
   122	): Promise<VisibilityMatrixRow[]> {
   123	  void viewer;
   124	  return db
   125	    .select()
   126	    .from(visibilityMatrix)
   127	    .where(opts?.roleId ? eq(visibilityMatrix.roleId, opts.roleId) : undefined);
   128	}
     1	import type { Viewer } from "@/domain/viewer";
     2	import { can as defaultCan } from "@/domain/permissions/can";
     3	import { visible as defaultVisible } from "@/domain/permissions/visible";
     4	import { scopeFor } from "@/domain/permissions/scope-for";
     5	import { project, type DtoSpec } from "@/domain/permissions/project";
     6	import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
     7	import { registerDto } from "@/domain/permissions/dto-registry";
     8	import { UserFacingError } from "@/lib/actions/user-facing-error";
     9	import { encrypt, decrypt } from "@/lib/crypto";
    10	import { buildCustomFieldsSchema } from "@/domain/custom-fields/build-schema";
    11	import {
    12	  listVendors as repoListVendors,
    13	  searchVendorsByNormalizedName as repoSearchVendorsByNormalizedName,
    14	  findVendorById as repoFindVendorById,
    15	  findVendorsByNormalizedName as repoFindVendorsByNormalizedName,
    16	  insertVendor as repoInsertVendor,
    17	  updateVendor as repoUpdateVendor,
    18	  updateVendorAccountNumber as repoUpdateVendorAccountNumber,
    19	  setVendorHidden as repoSetVendorHidden,
    20	  type VendorRow,
    21	} from "@/repositories/vendors";
    22	import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";
    23	
    24	export class ForbiddenError extends UserFacingError {}
    25	
    26	// 보관은 사용자에게 "삭제"로 보이는 상태다 — 삭제된 것이 조용히 바뀌면 안 된다.
    27	export class ArchivedVendorError extends UserFacingError {}
    28	
    29	const VENDORS_MENU = "admin.vendors";
    30	const VENDOR_ENTITY = "vendor";
    31	const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";
    32	
    33	// MAST-01: 거래처 Dto — 전체 계좌번호(평문) 필드를 두지 않는다. 뒤 4자리
    34	// (accountNumberLast4)만 실어 목록이 마스킹 표시를 그릴 수 있게 하고, 평문은
    35	// 마스킹 해제 함수(파일 아래쪽)의 반환값으로만 나간다.
    36	export type VendorDto = {
    37	  id: string;
    38	  name: string;
    39	  businessNo: string | null;
    40	  hidden: boolean;
    41	  defaultEvidenceType: string | null;
    42	  accountBank: string | null;
    43	  accountHolder: string | null;
    44	  accountNumberLast4: string | null;
    45	  customFields: Record<string, unknown>;
    46	  archivedAt: Date | null;
    47	};
    48	
    49	export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
    50	  fields: [
    51	    { key: "id", from: "id", infoItem: "vendor.value" },
    52	    { key: "name", from: "name", infoItem: "vendor.value" },
    53	    { key: "businessNo", from: "businessNo", infoItem: "vendor.value" },
    54	    { key: "hidden", from: "hidden", infoItem: "vendor.value" },
    55	    { key: "defaultEvidenceType", from: "defaultEvidenceType", infoItem: "vendor.value" },
    56	    { key: "accountBank", from: "accountBank", infoItem: "vendor.value" },
    57	    { key: "accountHolder", from: "accountHolder", infoItem: "vendor.value" },
    58	    { key: "accountNumberLast4", from: "accountNumberLast4", infoItem: "vendor.value" },
    59	    { key: "customFields", from: "customFields", infoItem: "vendor.value" },
    60	    { key: "archivedAt", from: "archivedAt", infoItem: "vendor.value" },
    61	  ],
    62	};
    63	
    64	registerDto({
    65	  name: "VendorDto",
    66	  fields: VENDOR_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
    67	});
    68	
    69	// 이름 정규화 — NFC + 소문자. 자동완성·중복 후보 탐지 양쪽이 이 함수 하나만
    70	// 쓴다(정본 하나).
    71	export function normalizeVendorName(name: string): string {
    72	  return name.normalize("NFC").trim().toLowerCase();
    73	}
    74	
    75	// 코드 포인트 기준 길이 — 한글이 서로게이트 쌍이 아니어도 이 기준이 일관된다.
    76	function codePointLength(value: string): number {
    77	  return Array.from(value).length;
    78	}
    79	
    80	// 자동완성 일치 점수 — 완전 일치 > 접두어 일치 > 부분 일치. 순수 함수라 DB
    81	// 없이 단위 테스트로 고정한다.
    82	export function scoreVendorNameMatch(normalizedName: string, normalizedQuery: string): number {
    83	  if (normalizedName === normalizedQuery) return 3;
    84	  if (normalizedName.startsWith(normalizedQuery)) return 2;
    85	  if (normalizedName.includes(normalizedQuery)) return 1;
    86	  return 0;
    87	}
    88	
    89	export type VendorListDeps = { can: typeof defaultCan };
    90	
    91	export async function listVendors(
    92	  viewer: Viewer,
    93	  opts?: { includeHidden?: boolean },
    94	): Promise<VendorDto[]> {
    95	  const scope = await scopeFor(viewer, VENDOR_ENTITY);
    96	  const rows = await repoListVendors(viewer, { scope, includeHidden: opts?.includeHidden ?? false });
    97	  return Promise.all(rows.map((row) => project(viewer, row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
    98	}
    99	
   100	// 자동완성 — 검색어를 NFC 정규화 + 소문자로 낮춘 뒤 normalizedName의 부분
   101	// 일치로 후보를 좁히고, 점수(완전>접두어>부분)로 다시 정렬한다. 점수가 같으면
   102	// normalizedName, 그다음 id로 정렬해 순서가 결정적이다. 같은 이름 둘은 둘 다
   103	// 돌아온다 — 이름에 unique 제약이 없다.
   104	export async function searchVendors(viewer: Viewer, query: string, limit = 10): Promise<VendorDto[]> {
   105	  const normalizedQuery = normalizeVendorName(query);
   106	  if (codePointLength(normalizedQuery) === 0) return [];
   107	
   108	  const scope = await scopeFor(viewer, VENDOR_ENTITY);
   109	  const rows = await repoSearchVendorsByNormalizedName(viewer, { normalizedQuery, scope });
   110	
   111	  const scored = rows
   112	    .map((row) => ({ row, score: scoreVendorNameMatch(row.normalizedName, normalizedQuery) }))
   113	    .filter((entry) => entry.score > 0)
   114	    .sort(
   115	      (a, b) =>
   116	        b.score - a.score ||
   117	        a.row.normalizedName.localeCompare(b.row.normalizedName) ||
   118	        a.row.id.localeCompare(b.row.id),
   119	    )
   120	    .slice(0, limit);
   121	
   122	  return Promise.all(scored.map((entry) => project(viewer, entry.row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
   123	}
   124	
   125	// 커스텀 필드 정의 Dto — 필드 정의 자체는 사람 단위 민감 정보가 아니라
   126	// "어떤 필드가 있는지"를 알려주는 구조 메타데이터라 project()/정보 노출표를
   127	// 거치지 않는다(계좌번호 등 값과는 다른 종류). *Row 타입을 그대로 반환하지
   128	// 않도록 필드를 다시 매핑한다(plant8/no-row-type-escape).
   129	export type FieldDefinitionDto = {
   130	  id: string;
   131	  key: string;
   132	  type: "text" | "number" | "date" | "select";
   133	  options: string[] | null;
   134	  required: boolean;
   135	  sortOrder: number;
   136	};
   137	
   138	export type VendorFieldDefinitionsDeps = { can: typeof defaultCan };
   139	
   140	// 거래처 폼(Task 3)이 커스텀 필드 입력을 동적으로 그리는 데 쓴다. 거래처
   141	// 메뉴를 볼 수 없으면 빈 배열 — 화면 진입 자체가 이미 그 판정을 거친다.
   142	export async function listVendorFieldDefinitions(
   143	  viewer: Viewer,
   144	  deps?: Partial<VendorFieldDefinitionsDeps>,
   145	): Promise<FieldDefinitionDto[]> {
   146	  const canFn = deps?.can ?? defaultCan;
   147	  if (!(await canFn(viewer, VENDORS_MENU, "view"))) return [];
   148	
   149	  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
   150	  return defs.map((def) => ({
   151	    id: def.id,
   152	    key: def.key,
   153	    type: def.type as FieldDefinitionDto["type"],
   154	    options: Array.isArray(def.options) ? (def.options as string[]) : null,
   155	    required: def.required,
   156	    sortOrder: def.sortOrder,
   157	  }));
   158	}
   159	
   160	async function validatedCustomFields(
   161	  viewer: Viewer,
   162	  input: Record<string, unknown> | undefined,
   163	): Promise<Record<string, unknown>> {
   164	  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
   165	  const schema = buildCustomFieldsSchema(
   166	    defs.map((def) => ({
   167	      key: def.key,
   168	      type: def.type as "text" | "number" | "date" | "select",
   169	      options: Array.isArray(def.options) ? (def.options as string[]) : undefined,
   170	      required: def.required,
   171	    })),
   172	  );
   173	  return schema.parse(input ?? {}) as Record<string, unknown>;
   174	}
   175	
   176	export type VendorWriteDeps = {
   177	  can: typeof defaultCan;
   178	  findVendorById: typeof repoFindVendorById;
   179	  recordAction: typeof defaultRecordAction;
   180	};
   181	
   182	export type VendorInput = {
   183	  name: string;
   184	  businessNo?: string | null;
   185	  defaultEvidenceType?: string | null;
   186	  accountBank?: string | null;
   187	  accountHolder?: string | null;
   188	  /**
   189	   * 평문 계좌번호 — 저장 전 이 함수 안에서 즉시 암호화한다.
   190	   * updateVendor에서는 세 값이 서로 다르게 해석된다(M-5):
   191	   * undefined = 안 바꿈(기존 암호문·뒤 4자리 유지) · null = 지움(두 컬럼 모두 null) ·
   192	   * 문자열 = 새 값으로 교체. createVendor에서는 undefined·null·빈 문자열 모두
   193	   * "계좌번호 없음"으로 같다 — 지울 기존 값이 없다.
   194	   */
   195	  accountNumber?: string | null;
   196	  /**
   197	   * updateVendor에서 undefined면 기존 customFields를 건드리지 않는다(M-5와 같은
   198	   * 이유 — 필드 정의가 늘어난 뒤 일부 값만 보내는 경우를 생각하면, 전체를 무조건
   199	   * 교체하는 편이 "보내지 않은 값은 지운다"는 뜻이 되어 위험하다). 객체를 보내면
   200	   * (빈 객체 포함) 그 값으로 통째로 교체한다. createVendor에서는 항상 검증해
   201	   * 저장한다.
   202	   */
   203	  customFields?: Record<string, unknown>;
   204	};
   205	
   206	// MAST-01 리뷰 M-5 — 계좌번호 갱신 계획을 순수 함수로 뽑는다. undefined(안 바꿈) ·
   207	// null(지움) · 문자열(새 값)을 구분해, ""가 "지움"으로 잘못 해석돼 암호문·뒤 4자리를
   208	// 함께 날리던 landmine을 없앤다. encryptFn을 주입받아 암호화 키 없이도(단위 테스트)
   209	// 이 분기를 고정할 수 있다.
   210	export type AccountNumberPlan =
   211	  | { kind: "keep" }
   212	  | { kind: "clear" }
   213	  | { kind: "set"; accountNumberEncrypted: string; accountNumberLast4: string };
   214	
   215	export function planAccountNumberUpdate(
   216	  accountNumber: string | null | undefined,
   217	  encryptFn: (plaintext: string) => string = encrypt,
   218	): AccountNumberPlan {
   219	  if (accountNumber === undefined) return { kind: "keep" };
   220	  if (accountNumber === null) return { kind: "clear" };
   221	
   222	  const trimmed = accountNumber.trim();
   223	  // 빈 문자열(공백만 있는 값 포함)은 "지움"이 아니라 "안 바꿈"이다 — 편집 폼에서
   224	  // 칸을 비워 두는 가장 자연스러운 방법이 곧 "지움"이 되어서는 안 된다. 명시적으로
   225	  // 지우려면 null을 보낸다(편집 폼의 「계좌번호 지우기」 체크박스).
   226	  if (trimmed === "") return { kind: "keep" };
   227	
   228	  return {
   229	    kind: "set",
   230	    accountNumberEncrypted: encryptFn(trimmed),
   231	    accountNumberLast4: trimmed.slice(-4),
   232	  };
   233	}
   234	
   235	export type CreateVendorResult = { vendor: VendorDto; duplicateCount: number };
   236	
   237	// 거래처 등록 — 쓰기 권한 확인 → 커스텀 필드 검증 → 계좌번호가 있으면 암호화 +
   238	// 뒤 4자리를 함께 만들어 저장 → recordAction 기록. 이름에 unique 제약이
   239	// 없으므로 같은 정규화 이름의 기존 행을 미리 찾아 duplicateCount로 돌려주되
   240	// 등록 자체는 막지 않는다.
   241	export async function createVendor(
   242	  viewer: Viewer,
   243	  input: VendorInput,
   244	  deps?: Partial<VendorWriteDeps>,
   245	): Promise<CreateVendorResult> {
   246	  const canFn = deps?.can ?? defaultCan;
   247	  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
   248	    throw new ForbiddenError("거래처 등록 권한이 없습니다.");
   249	  }
   250	
   251	  const customFields = await validatedCustomFields(viewer, input.customFields);
   252	  const normalizedName = normalizeVendorName(input.name);
   253	  const duplicates = await repoFindVendorsByNormalizedName(viewer, normalizedName);
   254	
   255	  // create에는 "안 바꿈" 개념이 없다 — keep이든 clear든 지울 기존 값이 없으므로
   256	  // 둘 다 "계좌번호 없음"으로 같다.
   257	  const accountNumberPlan = planAccountNumberUpdate(input.accountNumber);
   258	  const accountNumberEncrypted = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberEncrypted : null;
   259	  const accountNumberLast4 = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberLast4 : null;
   260	
   261	  const row = await repoInsertVendor(viewer, {
   262	    name: input.name,
   263	    normalizedName,
   264	    businessNo: input.businessNo ?? null,
   265	    defaultEvidenceType: input.defaultEvidenceType ?? null,
   266	    accountBank: input.accountBank ?? null,
   267	    accountHolder: input.accountHolder ?? null,
   268	    accountNumberEncrypted,
   269	    accountNumberLast4,
   270	    customFields,
   271	  });
   272	
   273	  const recordAction = deps?.recordAction ?? defaultRecordAction;
   274	  await recordAction(viewer, { actionType: "document_create", entity: VENDOR_ENTITY, entityId: row.id });
   275	
   276	  const vendor = (await project(viewer, row, VENDOR_DTO_SPEC)) as VendorDto;
   277	  return { vendor, duplicateCount: duplicates.length };
   278	}
   279	
   280	// 거래처 수정 — 계좌번호를 바꿀 때만 암호문·뒤 4자리 두 컬럼을 같은 UPDATE
   281	// 문에서 교체한다(updateVendorAccountNumber, planAccountNumberUpdate로 판정).
   282	// 계좌번호를 안 바꾸는 갱신(accountNumber === undefined)은 두 컬럼을 건드리지
   283	// 않는다. customFields도 같은 규칙 — undefined면 기존 값을 그대로 둔다(M-5).
   284	export async function updateVendor(
   285	  viewer: Viewer,
   286	  id: string,
   287	  input: VendorInput,
   288	  deps?: Partial<VendorWriteDeps>,
   289	): Promise<VendorDto | null> {
   290	  const canFn = deps?.can ?? defaultCan;
   291	  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
   292	    throw new ForbiddenError("거래처 수정 권한이 없습니다.");
   293	  }
   294	
   295	  // 목록이 보관된 행에 「수정」 링크를 감추는 것만으로는 부족하다 —
   296	  // /admin/vendors?editId=<보관된 id>를 직접 열면 화면은 수정 모드로 뜨고
   297	  // 저장까지 됐다(DOM 감사 실측). 판정은 화면이 아니라 여기서 한다.
   298	  const findVendorById = deps?.findVendorById ?? repoFindVendorById;
   299	  const existing = await findVendorById(viewer, id);
   300	  if (!existing || existing.archivedAt !== null) {
   301	    throw new ArchivedVendorError("보관되었거나 존재하지 않는 거래처는 수정할 수 없습니다.");
   302	  }
   303	
   304	  const normalizedName = normalizeVendorName(input.name);
   305	
   306	  const updatePayload: Parameters<typeof repoUpdateVendor>[2] = {
   307	    name: input.name,
   308	    normalizedName,
   309	    businessNo: input.businessNo ?? null,
   310	    defaultEvidenceType: input.defaultEvidenceType ?? null,
   311	    accountBank: input.accountBank ?? null,
   312	    accountHolder: input.accountHolder ?? null,
   313	  };
   314	  // customFields를 보내지 않으면(undefined) 기존 값을 그대로 둔다 — 무조건
   315	  // validatedCustomFields(viewer, undefined)를 태우면 필드 정의가 늘어난 뒤
   316	  // 빈 값으로 검증되어 기존에 입력된 값을 조용히 지울 수 있다.
   317	  if (input.customFields !== undefined) {
   318	    updatePayload.customFields = await validatedCustomFields(viewer, input.customFields);
   319	  }
   320	  await repoUpdateVendor(viewer, id, updatePayload);
   321	
   322	  const accountNumberPlan = planAccountNumberUpdate(input.accountNumber);
   323	  if (accountNumberPlan.kind === "clear") {
   324	    await repoUpdateVendorAccountNumber(viewer, id, { accountNumberEncrypted: null, accountNumberLast4: null });
   325	  } else if (accountNumberPlan.kind === "set") {
   326	    await repoUpdateVendorAccountNumber(viewer, id, {
   327	      accountNumberEncrypted: accountNumberPlan.accountNumberEncrypted,
   328	      accountNumberLast4: accountNumberPlan.accountNumberLast4,
   329	    });
   330	  }
   331	  // kind === "keep" → 두 컬럼 모두 건드리지 않는다.
   332	
   333	  // 결함 3: 수정을 document_create로 남기면 생성 9건처럼 보인다(독립 감사가
   334	  // 실측 — 수정 8건이 document_create 9건으로 나타났다). 수정 전용 종류로 남긴다.
   335	  const recordAction = deps?.recordAction ?? defaultRecordAction;
   336	  await recordAction(viewer, { actionType: "document_update", entity: VENDOR_ENTITY, entityId: id });
   337	
   338	  const updated = await repoFindVendorById(viewer, id);
   339	  return updated ? ((await project(viewer, updated, VENDOR_DTO_SPEC)) as VendorDto) : null;
   340	}
   341	
   342	// 숨김 플래그 — 보관함(archived)과는 다른 메커니즘이다(03-UI-SPEC.md 비활성화
   343	// 표현 규칙). 되돌릴 수 있는 상태 변경이라 OPS-05 핵심 행동 종류에 대응하는
   344	// 항목이 없어 recordAction을 부르지 않는다(setCodeItemActive·
   345	// setCorpCardActive와 같은 결).
   346	export async function setVendorHidden(
   347	  viewer: Viewer,
   348	  id: string,
   349	  hidden: boolean,
   350	  deps?: Partial<Pick<VendorWriteDeps, "can">>,
   351	): Promise<VendorDto | null> {
   352	  const canFn = deps?.can ?? defaultCan;
   353	  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
   354	    throw new ForbiddenError("거래처 상태 변경 권한이 없습니다.");
   355	  }
   356	
   357	  const current = await repoFindVendorById(viewer, id);
   358	  if (!current) return null;
   359	  if (current.hidden === hidden) {
   360	    return (await project(viewer, current, VENDOR_DTO_SPEC)) as VendorDto;
   361	  }
   362	
   363	  await repoSetVendorHidden(viewer, id, hidden);
   364	  const updated = await repoFindVendorById(viewer, id);
   365	  return updated ? ((await project(viewer, updated, VENDOR_DTO_SPEC)) as VendorDto) : null;
   366	}
   367	
   368	export type RevealAccountNumberDeps = { visible: typeof defaultVisible; recordAction: typeof defaultRecordAction };
   369	
   370	// 마스킹 해제 — 정보 노출표의 vendor.account_number_unmasked 항목을 노출
   371	// 판정으로 확인하고 거짓이면 ForbiddenError. 통과하면 먼저 recordAction으로
   372	// 기록하고 그 다음에 복호화한다(기록이 실패하면 평문을 돌려주지 않는다 —
   373	// 순서가 바뀌면 기록 없이 열람되는 창이 생긴다). 계좌번호가 없는 거래처는
   374	// 빈 문자열을 돌려주고 복호화를 호출하지 않는다(기록도 남기지 않는다 — 열
   375	// 것이 없다).
   376	export async function revealAccountNumber(
   377	  viewer: Viewer,
   378	  id: string,
   379	  deps?: Partial<RevealAccountNumberDeps>,
   380	): Promise<string> {
   381	  const visibleFn = deps?.visible ?? defaultVisible;
   382	  if (!(await visibleFn(viewer, REVEAL_INFO_ITEM))) {
   383	    throw new ForbiddenError("계좌번호 마스킹 해제 권한이 없습니다.");
   384	  }
   385	
   386	  const row = await repoFindVendorById(viewer, id);
   387	  if (!row?.accountNumberEncrypted) return "";
   388	
   389	  const recordAction = deps?.recordAction ?? defaultRecordAction;
   390	  await recordAction(viewer, { actionType: "mask_reveal", entity: VENDOR_ENTITY, entityId: id });
   391	
   392	  return decrypt(row.accountNumberEncrypted);
   393	}
     1	import { defineConfig, globalIgnores } from "eslint/config";
     2	import nextVitals from "eslint-config-next/core-web-vitals";
     3	import nextTs from "eslint-config-next/typescript";
     4	import tseslint from "typescript-eslint";
     5	import boundaries from "eslint-plugin-boundaries";
     6	import plant8 from "./eslint/index.mjs";
     7	
     8	const eslintConfig = defineConfig([
     9	  ...nextVitals,
    10	  ...nextTs,
    11	  ...tseslint.configs.recommendedTypeChecked,
    12	  {
    13	    languageOptions: {
    14	      parserOptions: {
    15	        projectService: true,
    16	        tsconfigRootDir: import.meta.dirname,
    17	      },
    18	    },
    19	    settings: {
    20	      // 03-03(D-33/D-34, 03-RESEARCH.md Open Question 1): domain 하위 폴더 단위로
    21	      // 세분화하지 않는다 — "repositories는 domain 안에서만 호출된다"는 이미 이
    22	      // 규칙으로 성립하고, 서브모듈별 경계가 필요하다는 실무 혼선 관측이 아직
    23	      // 없다(YAGNI). Phase 7 전 메뉴 검수에서 혼선이 발견되면 그때 세분화한다.
    24	      "boundaries/elements": [
    25	        { type: "app", pattern: "app/**" },
    26	        { type: "domain", pattern: "domain/**" },
    27	        { type: "repositories", pattern: "repositories/**" },
    28	        { type: "db", pattern: "db/**" },
    29	        { type: "lib", pattern: "lib/**" },
    30	        { type: "scripts", pattern: "scripts/**" },
    31	        { type: "test", pattern: "test/**" },
    32	        { type: "eslint", pattern: "eslint/**" },
    33	        { type: "ui", pattern: "ui/**" },
    34	      ],
    35	    },
    36	    plugins: { boundaries, plant8 },
    37	    rules: {
    38	      "@typescript-eslint/no-explicit-any": "error",
    39	      // 4계층 경계(app→domain/lib만, domain→app 금지, db는 아무도 import 안 함) — Issue 1·13A
    40	      "boundaries/element-types": [
    41	        "error",
    42	        {
    43	          default: "disallow",
    44	          rules: [
    45	            { from: "app", allow: ["app", "domain", "lib", "ui"] },
    46	            { from: "domain", allow: ["domain", "repositories", "lib"] },
    47	            { from: "repositories", allow: ["repositories", "db", "domain"] },
    48	            // db/client.ts는 lib/env.ts(환경 변수 계약)를 읽어야 한다 — lib는 횡단 모듈
    49	            // 이므로 db→lib 한 방향은 허용(db→domain은 여전히 금지, 01-01 기존 코드).
    50	            { from: "db", allow: ["db", "lib"] },
    51	            { from: "lib", allow: ["lib", "domain", "repositories", "db"] },
    52	            { from: "scripts", allow: ["scripts", "domain", "repositories", "db", "lib"] },
    53	            {
    54	              from: "test",
    55	              // eslint-rules 테스트가 eslint/rules/*.mjs를 직접 import해 규칙을 검증한다.
    56	              // ui는 D-24의 「내 차례」 단위 테스트가 ui/next-turn/build-next-turn-view.ts를
    57	              // import해야 해서 더했다(02-RESEARCH.md 교차 의존 발견).
    58	              allow: [
    59	                "test",
    60	                "app",
    61	                "domain",
    62	                "repositories",
    63	                "db",
    64	                "lib",
    65	                "scripts",
    66	                "eslint",
    67	                "ui",
    68	              ],
    69	            },
    70	            { from: "eslint", allow: ["eslint"] },
    71	            // ui는 순수 표현 계층 — domain/repositories/db/app을 import할 수 없다(D-26).
    72	            { from: "ui", allow: ["ui", "lib"] },
    73	          ],
    74	        },
    75	      ],
    76	      "plant8/require-action-client": "error",
    77	      "plant8/repository-viewer-param": "error",
    78	      "plant8/money-boundary": "error",
    79	      "plant8/no-row-type-escape": "error",
    80	    },
    81	  },
    82	  // *.mjs는 tsconfig project service 밖(타입 정보 없음) — type-checked 규칙 제외.
    83	  // money-boundary·no-row-type-escape는 타입 정보가 필수라 그 자체를 끈다
    84	  // (설정 오류로 오인되지 않게).
    85	  {
     1	import { pgTable, text, boolean, uuid, timestamp, unique } from "drizzle-orm/pg-core";
     2	import { roles } from "./roles";
     3	
     4	// ADMN-01: 권한표(계급 × 메뉴 × 동작). 복합 UNIQUE가 같은 셀 중복을 막고
     5	// upsertPermission의 onConflictDoUpdate 대상이 된다(같은 셀을 두 번 켜도 행이
     6	// 하나, 동시 토글은 마지막 쓰기가 이긴다).
     7	export const permissionMatrix = pgTable(
     8	  "permission_matrix",
     9	  {
    10	    id: uuid("id").primaryKey().defaultRandom(),
    11	    roleId: text("role_id")
    12	      .notNull()
    13	      .references(() => roles.id),
    14	    menu: text("menu").notNull(),
    15	    action: text("action").notNull(),
    16	    allowed: boolean("allowed").notNull().default(false),
    17	    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    18	    updatedBy: text("updated_by"),
    19	  },
    20	  (table) => [
    21	    unique("permission_matrix_role_menu_action_key").on(table.roleId, table.menu, table.action),
    22	  ],
    23	);
    24	
    25	// ADMN-02: 정보 노출표(계급 × 정보 항목). can()의 판정 표와 완전 독립(D-35) —
    26	// 별개 표, 별개 판정 함수.
    27	export const visibilityMatrix = pgTable(
    28	  "visibility_matrix",
    29	  {
    30	    id: uuid("id").primaryKey().defaultRandom(),
    31	    roleId: text("role_id")
    32	      .notNull()
    33	      .references(() => roles.id),
    34	    infoItem: text("info_item").notNull(),
    35	    visible: boolean("visible").notNull().default(false),
    36	    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    37	    updatedBy: text("updated_by"),
    38	  },
    39	  (table) => [unique("visibility_matrix_role_item_key").on(table.roleId, table.infoItem)],
    40	);

exec
/bin/bash -lc 'git diff -U2 -- .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
diff --git a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
index 29041cc..60c3783 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
@@ -9,4 +9,5 @@ files_modified:
   - domain/vendors/index.ts
   - repositories/vendors.ts
+  - repositories/permissions.ts
   - app/(app)/admin/vendors/actions.ts
   - app/(app)/admin/vendors/vendor-form.tsx
@@ -27,5 +28,5 @@ must_haves:
     - "거래처 저장은 보는 사람이 볼 수 없는 칸의 저장값을 지우거나 바꾸지 않는다 — 보관된 칸, 그 사람 계급에서 끈 칸, `vendor.value`(「거래처 정보」)가 꺼진 사람의 모든 칸이 그렇다. 서버가 저장값에서 입력 칸 밖의 키를 그대로 되살려 합친다. 안내 문구는 없다(UI-SPEC E4 hidden·stale, ROADMAP 04.5 기준 2 값 보존)"
     - "거래처 수정의 합치기와 쓰기는 원자적이다 — `updateVendor`가 `withTransaction` 안에서 그 거래처 행을 `SELECT … FOR UPDATE`로 잠가 읽고, 그 저장값으로 판정·합친 객체를 같은 트랜잭션의 UPDATE로 쓴다. 읽은 뒤 쓰기 전에 다른 사람(관리자)이 숨은 칸을 고쳐도 좁은 계급의 저장이 그 값을 이전 값으로 되돌리지 않는다 — 두 연결 경합 통합 테스트가 고정한다(Codex #1)"
-    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 03의 `visibleCustomFieldKeys(viewer, \"vendor\")`(활성 ∩ 계급별 보임), 아니면 빈 집합. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
+    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 활성 ∩ 계급별 보임(03의 `visibleCustomFieldKeys`와 같은 규칙), 아니면 빈 집합. 정의·`vendor.value` 보임·칸별 보임을 SQL 한 문(`readVendorFieldAccess`, 한 스냅숏)으로 읽어 도출한다. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
     - "거래처 정의에 아예 없는 키(보관 칸까지 포함한 대상 정의 전체 키 `knownKeys` 밖)를 하나라도 보내면 값이 비어 있어도 저장 전체를 거부하고 DB는 그대로다. 화면 문구는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(새 문구 없음)"
     - "정의는 있으나 그 사람의 입력 칸 밖인 키(보관 칸 · 그 계급에서 끈 칸 · `vendor.value`가 꺼진 사람의 모든 칸 · 노출 행 없는 칸)는 거부하지 않는다 — 제출값을 버리고 저장값을 유지하며, 나머지 칸과 기본 필드는 저장된다. 그래서 폼이 열린 사이 관리자가 칸을 보관·노출 해제해도 그 폼의 저장은 성공한다(UI-SPEC E4 stale 「서버가 저장값 되살림(값 유실 없음)」, final judge #5)"
@@ -59,5 +60,5 @@ must_haves:
     - from: "domain/vendors/index.ts"
       to: "repositories/vendors.ts"
-      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
+      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → 같은 `tx`로 정의·노출 한 문 조회(`readVendorFieldAccess`) → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
       pattern: "findVendorByIdForUpdate"
     - from: "domain/vendors/index.ts"
@@ -66,7 +67,7 @@ must_haves:
       pattern: "resolveCustomFieldsWrite"
     - from: "domain/vendors/index.ts"
-      to: "domain/custom-fields/visibility.ts"
-      via: "입력 칸 집합 = `vendor.value` 보임이면 `visibleCustomFieldKeys`, 아니면 빈 집합 — 폼 정의 목록과 저장 판정이 같은 함수"
-      pattern: "visibleCustomFieldKeys"
+      to: "repositories/permissions.ts"
+      via: "입력 칸 집합 = `vendorInputFieldKeys`가 `readVendorFieldAccess` 한 문으로 읽어 도출 — 폼 정의 목록·등록·수정 판정이 같은 함수"
+      pattern: "readVendorFieldAccess"
     - from: "app/(app)/admin/vendors/actions.ts"
       to: "domain/custom-fields/preserve.ts"
@@ -193,5 +194,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 <task type="auto" tdd="true">
   <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
-  <files>domain/vendors/index.ts, repositories/vendors.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
+  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   <read_first>
     - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
@@ -199,5 +200,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
     - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
-    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
+    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`의 규칙) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`) · `repositories/permissions.ts` 1–5행(import) · 86–98행 `findVisibility` · 119–128행 `listVisibility`(한 문으로 합칠 두 조회의 모양 — 이 둘은 바꾸지 않는다) · `repositories/field-definitions.ts` 9–15행(`listFieldDefinitions`의 조건·정렬 — 한 문 조회가 같은 조건·정렬을 쓴다) · `eslint.config.mjs` 40–46행(domain → `db` import 금지)
     - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   </read_first>
@@ -205,4 +206,7 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
     - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
+    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
+    - (한 문 조회 — 리포지토리) 거래처 정의 셋(활성 A·B, 보관 C)과 테스트 계급의 `vendor.value` 보임 · `cf.vendor.<A>` 보임 · `cf.vendor.<B>` 꺼짐 · C 행 없음 → `readVendorFieldAccess(SYSTEM_VIEWER, 계급 id)`가 `definitions` 셋(정렬 순서, 보관 포함) · `vendorValueVisible` 참 · `visibleFieldKeys` {A}를 돌려준다 · `vendor.value` 행이 없는 계급은 `vendorValueVisible` 거짓 · `roleId`가 null이면 두 보임 모두 거짓이고 `definitions`는 셋 그대로
+    - (경합 — 거래처 정보 끔 + 칸 켬, Codex t1t2-2 MAJOR 회귀) 테스트 계급에 `vendor.value` 보임 · `cf.vendor.<A>` 꺼짐이고 거래처에 A 값이 있다. 연결 1이 한 트랜잭션에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE(행 잠금)하고, `vendor.value`를 끄고, `cf.vendor.<A>`를 켠 채 커밋하지 않는다 → 사용자 `updateVendor`(A에 「사용자값」)를 기다리지 않고 시작 → `pg_locks`에 `granted = false` 행이 생길 때까지 폴링(50ms, 5초 넘으면 실패) → 커밋 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(두 보임 변경이 모두 반영된 스냅숏에서 `vendor.value`가 꺼져 입력 칸이 0개)
     - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
     - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
@@ -217,5 +221,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
   </behavior>
   <action>
-① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
+① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용). 「한 문 조회」는 함수가 없어 빨갛다. 「경합 — 거래처 정보 끔 + 칸 켬」은 두 보임 변경이 저장의 조회 전에 모두 커밋되는 결정적 설계라 여러 문으로 읽는 초안에서도 초록일 수 있다 — 저장의 두 조회 **사이**에 커밋을 끼워 넣는 것은 도메인 안에 테스트 전용 훅 없이는 결정적으로 강제할 수 없으므로, 한 문 구조는 acceptance의 구조 게이트가 고정하고 이 케이스는 끝 상태 회귀를 고정한다(SUMMARY에 이 구분을 적는다).
 
 ② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
@@ -225,17 +229,18 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 - 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
 - `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
+- `repositories/permissions.ts`에 `readVendorFieldAccess(viewer, roleId: string | null, tx: DbOrTx = db)`를 더한다 — **SELECT 한 문**(READ COMMITTED에서 한 문 = 한 스냅숏, Codex t1t2-2 MAJOR): `field_definitions`(`entity = 'vendor'`, 보관 포함, `orderBy(sortOrder, key)`)에 `visibility_matrix`를 별칭 둘(Drizzle `alias` — 설치된 `drizzle-orm/pg-core`의 기존 export)로 LEFT JOIN한다. 하나는 `(role_id, 'cf.vendor.' || key)`, 하나는 `(role_id, 'vendor.value')`다(`(role_id, info_item)` 유일이라 행이 늘지 않는다). 돌려주는 모양은 `{ definitions: 정의 행[], vendorValueVisible: boolean, visibleFieldKeys: Set<string> }`이고 행 없음·`roleId` 없음은 거짓이다(정의가 0개면 입력 칸도 0개라 `vendorValueVisible`은 쓰이지 않는다). 기존 `findVisibility`·`listVisibility`는 바꾸지 않는다.
 
 ④ `domain/vendors/index.ts`:
-- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
+- 파일 안 함수 `vendorInputFieldKeys(viewer, tx?: DbOrTx)`를 둔다(domain은 `db`를 import할 수 없다 — `eslint.config.mjs` 40–46행. 기본값 없이 받은 `tx`를 그대로 넘기고, `= db` 기본값은 리포지토리에만 있다). `readVendorFieldAccess(viewer, viewer.roleId ?? null, tx)`를 **한 번** 부르고, 그 결과만으로 `{ inputDefs, knownKeys }`를 도출한다 — `inputDefs` = `vendorValueVisible`이 참일 때 `archivedAt`이 null이고 `visibleFieldKeys`에 든 정의(칸 정렬 순서, `archived_options`·`label` 포함), 아니면 빈 배열. `knownKeys` = `definitions` **전체**의 키. 규칙은 03의 `visibleCustomFieldKeys`(활성 ∩ `cf.vendor.<key>` 보임)에 `vendor.value` AND를 건 것과 같다.
 - `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
-- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
+- 입력 칸 정의·`knownKeys`는 둘 다 `vendorInputFieldKeys`의 결과다(정의 조회를 따로 하지 않는다 — `repositories/field-definitions.ts`의 `listFieldDefinitions`는 이 플랜에서 부르지도 고치지도 않는다). 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `listVendorFieldDefinitions`·`createVendor`는 `tx` 없이(행 삽입 전) 부른다. `updateVendor`는 트랜잭션 **안에서** 행 잠금 **뒤에** `vendorInputFieldKeys(viewer, tx)`로 부른다. 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
 - `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
 - `updateVendor`:
   - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
-  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
+  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
-  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
+  - 잠금은 정의·노출 조회(한 문)·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다. 트랜잭션 격리 수준은 기본(READ COMMITTED) 그대로다 — REPEATABLE READ는 `FOR UPDATE` 직렬화 오류 재시도를 부른다.
 - **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
 
@@ -248,5 +253,5 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
     <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
-    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
+    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」·「거래처 정보 끔 + 칸 켬」 경합에서 사용자 제출값이 관리자 값을 덮거나, 한 문 조회의 모양이 어긋나거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
     <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
     <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
@@ -255,4 +260,6 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
     - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
     - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
+    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `vendorInputFieldKeys(viewer, tx)`보다 먼저 오고, 콜백 안에 다른 정의·노출 조회(`ListFieldDefinitions(`·`visible(`·`findVisibility(`·`listVisibility(`·`visibleCustomFieldKeys(`)가 없다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|vendorInputFieldKeys\(|ListFieldDefinitions\(|visible\(|Visibility\(|visibleCustomFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
+    - 한 문 구조 게이트(Codex t1t2-2 MAJOR): `awk '/export async function readVendorFieldAccess/,/^}/' repositories/permissions.ts | grep -v '^\s*//' | grep -c "await"`가 1이고(쿼리 한 번), `vendorInputFieldKeys` 본문에서 리포지토리 호출은 `readVendorFieldAccess(` 하나뿐이다(`awk '/function vendorInputFieldKeys/,/^}/' domain/vendors/index.ts | grep -v '^\s*//' | grep -cE "await"`가 1) · `grep -v '^\s*//' domain/vendors/index.ts | grep -cE "tx\??: DbOrTx = db"`가 0이다(domain에 `= db` 기본값 없음)
     - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
     - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
@@ -323,5 +330,8 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
 | T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
+| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·`vendor.value` 보임·칸별 보임을 `findVendorByIdForUpdate` 뒤 같은 `tx`에서 SQL **한 문**(`readVendorFieldAccess`)으로 읽는다(Task 2 action ③·④) — READ COMMITTED는 문마다 스냅숏이 달라 여러 문으로 읽으면 「거래처 정보 끔 → 칸 켬」 두 커밋 사이에 끼어 둘 다 참인 적 없는 조합으로 판정할 수 있으므로 한 스냅숏으로 판정한다(Codex t1t2-2 MAJOR · REPEATABLE READ는 쓰지 않는다). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」·「경합 — 거래처 정보 끔 + 칸 켬」 · 한 문 구조 게이트) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
+
+eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
 </threat_model>
 
@@ -347,6 +357,6 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 |---|---|
 | 모듈(신규, domain 순수) | `domain/custom-fields/preserve.ts` — `resolveCustomFieldsWrite` · `CustomFieldsInvalidError` · `UnknownCustomFieldKeyError` |
-| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
-| 함수(신규) | `vendorInputFieldKeys(viewer)`(파일 안) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
+| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션, 잠금 뒤 같은 `tx`로 정의·노출 조회) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
+| 함수(신규) | `vendorInputFieldKeys(viewer, tx?)`(파일 안) · `readVendorFieldAccess(viewer, roleId, tx)`(`repositories/permissions.ts` — 한 문 조회) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |
 | 계약 | 수정 제출: 키 없음 = 안 바꿈, 빈 값 = 비움 · 칸 오류 = `validationErrors.customFields.{key}._errors` · 수정의 커스텀 값 합치기·쓰기는 행 잠금 한 트랜잭션 |
 | 테스트 | `test/unit/domain/custom-fields-preserve.test.ts` · `test/integration/vendor-custom-fields-save.test.ts`(두 연결 경합 포함) · `test/integration/custom-fields.test.ts`(노출 행 픽스처 · 거부 이유 단언) |

exec
/bin/bash -lc "nl -ba repositories/permissions.ts | sed -n '80,140p'; nl -ba repositories/field-definitions.ts | head -65; nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '223,240p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '257,271p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '330,340p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
    80	  return db
    81	    .select()
    82	    .from(permissionMatrix)
    83	    .where(opts?.roleId ? eq(permissionMatrix.roleId, opts.roleId) : undefined);
    84	}
    85	
    86	export async function findVisibility(
    87	  viewer: Viewer,
    88	  roleId: string,
    89	  infoItem: string,
    90	): Promise<VisibilityMatrixRow | null> {
    91	  void viewer;
    92	  const [row] = await db
    93	    .select()
    94	    .from(visibilityMatrix)
    95	    .where(and(eq(visibilityMatrix.roleId, roleId), eq(visibilityMatrix.infoItem, infoItem)))
    96	    .limit(1);
    97	  return row ?? null;
    98	}
    99	
   100	export async function upsertVisibility(
   101	  viewer: Viewer,
   102	  input: { roleId: string; infoItem: string; visible: boolean; updatedBy?: string | null },
   103	): Promise<void> {
   104	  void viewer;
   105	  await db
   106	    .insert(visibilityMatrix)
   107	    .values({
   108	      roleId: input.roleId,
   109	      infoItem: input.infoItem,
   110	      visible: input.visible,
   111	      updatedBy: input.updatedBy ?? null,
   112	    })
   113	    .onConflictDoUpdate({
   114	      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
   115	      set: { visible: input.visible, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
   116	    });
   117	}
   118	
   119	export async function listVisibility(
   120	  viewer: Viewer,
   121	  opts?: { roleId?: string },
   122	): Promise<VisibilityMatrixRow[]> {
   123	  void viewer;
   124	  return db
   125	    .select()
   126	    .from(visibilityMatrix)
   127	    .where(opts?.roleId ? eq(visibilityMatrix.roleId, opts.roleId) : undefined);
   128	}
     1	import { eq } from "drizzle-orm";
     2	import type { InferSelectModel } from "drizzle-orm";
     3	import { db } from "@/db/client";
     4	import { fieldDefinitions } from "@/db/schema";
     5	import type { Viewer } from "@/domain/viewer";
     6	
     7	export type FieldDefinitionRow = InferSelectModel<typeof fieldDefinitions>;
     8	
     9	export async function listFieldDefinitions(viewer: Viewer, entity: string): Promise<FieldDefinitionRow[]> {
    10	  return db
    11	    .select()
    12	    .from(fieldDefinitions)
    13	    .where(eq(fieldDefinitions.entity, entity))
    14	    .orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key);
    15	}
    16	
    17	export async function findFieldDefinitionById(viewer: Viewer, id: string): Promise<FieldDefinitionRow | null> {
    18	  const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1);
    19	  return row ?? null;
    20	}
    21	
    22	export async function insertFieldDefinition(
    23	  viewer: Viewer,
    24	  input: {
    25	    id: string;
    26	    entity: string;
    27	    key: string;
    28	    type: string;
    29	    options?: unknown;
    30	    required?: boolean;
    31	    sortOrder?: number;
    32	  },
    33	): Promise<FieldDefinitionRow> {
    34	  const [row] = await db
    35	    .insert(fieldDefinitions)
    36	    .values({
    37	      id: input.id,
    38	      entity: input.entity,
    39	      key: input.key,
    40	      type: input.type,
    41	      options: input.options ?? null,
    42	      required: input.required ?? false,
    43	      sortOrder: input.sortOrder ?? 0,
    44	    })
    45	    .returning();
    46	  if (!row) throw new Error("field_definitions insert가 행을 반환하지 않았습니다.");
    47	  return row;
    48	}
    49	
    50	// ROADMAP: 필드 타입 변경은 금지한다 — 이 함수는 type 컬럼을 대상으로 받지
    51	// 않는다. 타입을 바꾸려면 새 필드를 만든다.
    52	export async function updateFieldDefinition(
    53	  viewer: Viewer,
    54	  id: string,
    55	  input: { options?: unknown; required?: boolean; sortOrder?: number },
    56	): Promise<void> {
    57	  await db
    58	    .update(fieldDefinitions)
    59	    .set({
    60	      options: input.options,
    61	      required: input.required,
    62	      sortOrder: input.sortOrder,
    63	      updatedAt: new Date(),
    64	    })
    65	    .where(eq(fieldDefinitions.id, id));
   223	    - (E2E) 시스템 관리자가 칸 「E2E비고…」를 만들고 거래처 하나에 값 「누수금지값…」을 저장 → 노출표에서 시스템 관리자 행의 그 칸을 끔 → `/admin/vendors`와 그 거래처 편집 화면 HTML에 칸 이름과 값이 없다 → 다시 켜면 편집 화면에 값이 보인다
   224	  </behavior>
   225	  <action>
   226	① RED 먼저.
   227	
   228	② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
   229	
   230	③ `domain/vendors/index.ts`: 파일 안 로컬 함수 하나로 DTO를 만든다 — 기존 `project(viewer, row, VENDOR_DTO_SPEC)` 결과의 `customFields`에 `pickVisibleCustomFields`를 적용. 다섯 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 전부 이 함수를 쓰고, 목록·검색은 보이는 키 집합을 호출당 한 번만 계산한다. `VENDOR_DTO_SPEC`(「거래처 정보」 줄 포함)·`registerDto`는 그대로 둔다. `listVendorFieldDefinitions`는 01의 보관 제외에 더해 `visibleCustomFieldKeys`에 있는 정의만 돌려준다. `validatedCustomFields`는 바꾸지 않는다(보이지 않는 칸 값 되살리기는 05).
   231	
   232	④ `test/integration/leak-scan.test.ts` **끝에** `describe("커스텀 칸 축 — …")` 하나: 테스트 안에서 시스템 관리자로 칸 둘과 거래처 하나(두 칸 값은 서로 다른 고유 문자열)를 만들고, 순수 생성기 `buildCustomFieldCases(defs, roles)`(칸 × `SEED_ROLES`, 결정적 순서)의 케이스마다 그 계급에 `admin.vendors` 보기와 `vendor.value` 보임 행(`upsertVisibility`)을 켜고, **먼저** `listVendors`의 JSON 직렬화에 두 칸 값 문자열이 모두 있음을 단언한 뒤, 그 칸만 끄고 그 값 문자열만 사라지고 다른 칸 값은 남아 있음을 단언한다. `domain/seed/index.ts`에 `vendor.value` 행을 더하지 않는다(테스트 안에서만 켠다 — Task 1 acceptance의 seed diff 0 유지 · `domain/vendors`의 `VENDOR_DTO_SPEC`은 모든 칸이 `vendor.value`에 묶여 있고 시드는 이 행을 시스템 관리자·기본 계급에만 주므로, 켜지 않으면 나머지 시드 계급 케이스가 상위 차단으로 헛되이 통과한다). 기존 `describe`·import·헬퍼는 고치지 않는다.
   233	
   234	⑤ E2E: Task 1 스펙 파일에 케이스를 더한다. 값은 01의 거래처 폼으로 저장하고, 끈 셀은 테스트 끝에 다시 켜며, 칸은 `afterAll`에서 보관한다.
   235	
   236	⑥ `test/integration/custom-fields.test.ts`는 이 플랜에서 고치지 않는다. 이 플랜은 쓰기 경로(`validatedCustomFields`)를 바꾸지 않는다. 그 파일은 DB 행을 직접 읽어 단언하므로 DTO 거르기와 무관하게 초록이다. 노출 행 픽스처와 거부 이유 단언은 쓰기 판정이 노출 행에 묶이는 05 Task 2가 더한다.
   237	  </action>
   238	  <verify>
   239	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build</automated>
   240	    <fails_when>eslint·tsc·next build 중 하나라도 error를 출력하고 종료 코드가 0이 아니다 — `plant8/no-row-type-escape` 포함</fails_when>
   257	    <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   258	  </verify>
   259	  <acceptance_criteria>
   260	    - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
   261	    - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
   262	    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `vendorInputFieldKeys(viewer, tx)`보다 먼저 오고, 콜백 안에 다른 정의·노출 조회(`ListFieldDefinitions(`·`visible(`·`findVisibility(`·`listVisibility(`·`visibleCustomFieldKeys(`)가 없다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|vendorInputFieldKeys\(|ListFieldDefinitions\(|visible\(|Visibility\(|visibleCustomFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
   263	    - 한 문 구조 게이트(Codex t1t2-2 MAJOR): `awk '/export async function readVendorFieldAccess/,/^}/' repositories/permissions.ts | grep -v '^\s*//' | grep -c "await"`가 1이고(쿼리 한 번), `vendorInputFieldKeys` 본문에서 리포지토리 호출은 `readVendorFieldAccess(` 하나뿐이다(`awk '/function vendorInputFieldKeys/,/^}/' domain/vendors/index.ts | grep -v '^\s*//' | grep -cE "await"`가 1) · `grep -v '^\s*//' domain/vendors/index.ts | grep -cE "tx\??: DbOrTx = db"`가 0이다(domain에 `= db` 기본값 없음)
   264	    - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
   265	    - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
   266	    - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
   267	    - `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체가 초록이다(SUMMARY에 통과 개수 요약)
   268	    - 세 검증 명령이 전부 초록이다
   269	  </acceptance_criteria>
   270	  <done>권한이 좁은 사람이 거래처를 저장해도 보이지 않는 칸의 값은 남고(동시에 관리자가 고친 값도 되돌리지 않는다, 오래 열린 폼이 보낸 보관·끈 칸 키는 버려지고 저장은 성공한다), 정의에 없는 키는 거부되며, 필수 칸은 그 칸을 고칠 때만 막힌다</done>
   271	</task>
   330	| T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
   331	| T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
   332	| T-04.5-44 | Tampering | 정의·노출 조회와 거래처 쓰기 사이 TOCTOU(숨김 후 저장 — 조회가 트랜잭션 밖이면 숨긴 칸에 사용자 제출값이 쓰인다, `repositories/vendors.ts` 105–109행) | high | mitigate | 정의·`vendor.value` 보임·칸별 보임을 `findVendorByIdForUpdate` 뒤 같은 `tx`에서 SQL **한 문**(`readVendorFieldAccess`)으로 읽는다(Task 2 action ③·④) — READ COMMITTED는 문마다 스냅숏이 달라 여러 문으로 읽으면 「거래처 정보 끔 → 칸 켬」 두 커밋 사이에 끼어 둘 다 참인 적 없는 조합으로 판정할 수 있으므로 한 스냅숏으로 판정한다(Codex t1t2-2 MAJOR · REPEATABLE READ는 쓰지 않는다). 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금 시점이 정의 읽기의 직렬 기준점이 된다 — 잠금 전 커밋된 변경은 반영되고, 뒤 커밋되는 변경은 이 거래처의 다른 저장과 조합될 수 없다(그 저장은 잠금 대기 뒤 새 정의를 읽는다). 옛 정의로 판정되는 경우 결과는 성공·제출값 무시·거부 중 하나이며 어느 쪽도 숨은 저장값을 덮지 않는다(통합 「경합 — 숨김 후 저장」·「경합 — 거래처 정보 끔 + 칸 켬」 · 한 문 구조 게이트) |
   333	| T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
   334	
   335	eng 검토 C-1·D3(문서만 수용)은 전제('저장 거부로 끝남')가 틀려 완화로 바꿈 — Codex t1t2 검토 MAJOR
   336	</threat_model>
   337	
   338	<verification>
   339	- `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` 통과
   340	- 통합(`flock /tmp/plant8-erp-test.lock ` 앞에 붙임): `vendor-custom-fields-save`(경합 포함) · `custom-fields`(노출 행 픽스처) · `quote-lines` · `custom-field-visibility` · `leak-scan` 통과, 이어서 `pnpm test:integration` 전체 초록

codex
계획상 두 지적은 해소됐습니다. 누락된 노출 행과 null 계급은 숨김으로 처리하고, 보관 정의는 `knownKeys`에 남기되 입력 대상에서는 제외합니다. 다만 새 경합 테스트는 조회 사이 커밋을 재현하지 않으므로, 이를 보완하는 구조 게이트가 실제로 SQL 한 문을 보장하는지 확인하고 있습니다.

web search: 
web search: https://www.postgresql.org/docs/current/transaction-iso.html
exec
/bin/bash -lc "nl -ba domain/permissions/project.ts | sed -n '1,135p'; nl -ba domain/permissions/visible.ts; nl -ba domain/vendors/index.ts | sed -n '35,82p'; nl -ba repositories/document-counters.ts | head -25; rg -n 'alias' node_modules/drizzle-orm/pg-core/index.d.ts; rg -n 'validatedCustomFields|repoListFieldDefinitions|visibleCustomFieldKeys|vendorInputFieldKeys' .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
     1	import type { Viewer } from "@/domain/viewer";
     2	import { visible as defaultVisible } from "@/domain/permissions/visible";
     3	
     4	// domain의 유일한 출구 — 리포지토리 행 객체를 DTO로 투영한다. spec의 fields를
     5	// 선언 순서대로 순회하며 각 항목의 정보 항목을 visible()로 확인해 통과한 것만
     6	// 결과 객체에 싣는다 — 그래서 결과 키 순서는 spec 선언 순서이고 노출표 행
     7	// 순서와 무관하다. 원본에 from 키가 없으면 조용히 건너뛰어 이미 투영된 결과를
     8	// 다시 투영해도 같은 결과가 나오게 한다(멱등). spec 밖의 키는 결코 결과에
     9	// 실리지 않는다.
    10	export type DtoSpec<Row, Dto> = {
    11	  readonly fields: ReadonlyArray<{ key: keyof Dto & string; from: keyof Row & string; infoItem: string }>;
    12	};
    13	
    14	export type ProjectDeps = {
    15	  visible: typeof defaultVisible;
    16	};
    17	
    18	export async function project<Row extends object, Dto extends object>(
    19	  viewer: Viewer,
    20	  row: Row,
    21	  spec: DtoSpec<Row, Dto>,
    22	  deps?: Partial<ProjectDeps>,
    23	): Promise<Partial<Dto>> {
    24	  const visibleFn = deps?.visible ?? defaultVisible;
    25	  const source = row as Record<string, unknown>;
    26	  const result: Record<string, unknown> = {};
    27	
    28	  for (const field of spec.fields) {
    29	    if (!(field.from in source)) continue;
    30	    const ok = await visibleFn(viewer, field.infoItem);
    31	    if (!ok) continue;
    32	    result[field.key] = source[field.from];
    33	  }
    34	
    35	  return result as Partial<Dto>;
    36	}
     1	import type { Viewer } from "@/domain/viewer";
     2	import { findVisibility as defaultFindVisibility } from "@/repositories/permissions";
     3	
     4	// ADMN-02: 정보 항목 노출 판정 — can()과 완전 독립(D-35). VisibleDeps 타입에
     5	// 메뉴×동작 판정 함수 필드를 두지 않는 것으로 이 독립성이 타입에도 드러나게
     6	// 한다 — 메뉴 접근 판정과 필드 노출 판정이 각자의 표만 읽는다.
     7	export type VisibleDeps = {
     8	  findVisibility: typeof defaultFindVisibility;
     9	};
    10	
    11	export async function visible(
    12	  viewer: Viewer,
    13	  infoItem: string,
    14	  deps?: Partial<VisibleDeps>,
    15	): Promise<boolean> {
    16	  // viewer에 계급 식별자가 없으면 기본 거부 — 노출표를 조회하지도 않는다.
    17	  if (!viewer.roleId) return false;
    18	
    19	  const findVisibility = deps?.findVisibility ?? defaultFindVisibility;
    20	  const row = await findVisibility(viewer, viewer.roleId, infoItem);
    21	  // 행이 없으면 false — 새 기능 정보는 기본 숨김이다.
    22	  return row?.visible === true;
    23	}
    35	// 마스킹 해제 함수(파일 아래쪽)의 반환값으로만 나간다.
    36	export type VendorDto = {
    37	  id: string;
    38	  name: string;
    39	  businessNo: string | null;
    40	  hidden: boolean;
    41	  defaultEvidenceType: string | null;
    42	  accountBank: string | null;
    43	  accountHolder: string | null;
    44	  accountNumberLast4: string | null;
    45	  customFields: Record<string, unknown>;
    46	  archivedAt: Date | null;
    47	};
    48	
    49	export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
    50	  fields: [
    51	    { key: "id", from: "id", infoItem: "vendor.value" },
    52	    { key: "name", from: "name", infoItem: "vendor.value" },
    53	    { key: "businessNo", from: "businessNo", infoItem: "vendor.value" },
    54	    { key: "hidden", from: "hidden", infoItem: "vendor.value" },
    55	    { key: "defaultEvidenceType", from: "defaultEvidenceType", infoItem: "vendor.value" },
    56	    { key: "accountBank", from: "accountBank", infoItem: "vendor.value" },
    57	    { key: "accountHolder", from: "accountHolder", infoItem: "vendor.value" },
    58	    { key: "accountNumberLast4", from: "accountNumberLast4", infoItem: "vendor.value" },
    59	    { key: "customFields", from: "customFields", infoItem: "vendor.value" },
    60	    { key: "archivedAt", from: "archivedAt", infoItem: "vendor.value" },
    61	  ],
    62	};
    63	
    64	registerDto({
    65	  name: "VendorDto",
    66	  fields: VENDOR_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
    67	});
    68	
    69	// 이름 정규화 — NFC + 소문자. 자동완성·중복 후보 탐지 양쪽이 이 함수 하나만
    70	// 쓴다(정본 하나).
    71	export function normalizeVendorName(name: string): string {
    72	  return name.normalize("NFC").trim().toLowerCase();
    73	}
    74	
    75	// 코드 포인트 기준 길이 — 한글이 서로게이트 쌍이 아니어도 이 기준이 일관된다.
    76	function codePointLength(value: string): number {
    77	  return Array.from(value).length;
    78	}
    79	
    80	// 자동완성 일치 점수 — 완전 일치 > 접두어 일치 > 부분 일치. 순수 함수라 DB
    81	// 없이 단위 테스트로 고정한다.
    82	export function scoreVendorNameMatch(normalizedName: string, normalizedQuery: string): number {
     1	import { and, eq, sql } from "drizzle-orm";
     2	import type { InferSelectModel } from "drizzle-orm";
     3	import { db, type DbOrTx } from "@/db/client";
     4	import { documentCounters } from "@/db/schema";
     5	import type { Viewer } from "@/domain/viewer";
     6	
     7	export type DocumentCounterRow = InferSelectModel<typeof documentCounters>;
     8	// db/client.ts가 정본 — 여기서는 repositories 계층 호출자를 위해 재수출만
     9	// 한다(domain은 db를 직접 import할 수 없어 이 재수출을 거친다, boundaries).
    10	export type { DbOrTx };
    11	
    12	// 읽기와 upsert만 둔다 — 실제 번호 부여(원자적 증가)와 행 잠금은 Phase 4다.
    13	export async function findDocumentCounter(
    14	  viewer: Viewer,
    15	  counterKey: string,
    16	  period: string,
    17	): Promise<DocumentCounterRow | null> {
    18	  const [row] = await db
    19	    .select()
    20	    .from(documentCounters)
    21	    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    22	    .limit(1);
    23	  return row ?? null;
    24	}
    25	
1:export * from "./alias.js";
30:    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 활성 ∩ 계급별 보임(03의 `visibleCustomFieldKeys`와 같은 규칙), 아니면 빈 집합. 정의·`vendor.value` 보임·칸별 보임을 SQL 한 문(`readVendorFieldAccess`, 한 스냅숏)으로 읽어 도출한다. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
70:      via: "입력 칸 집합 = `vendorInputFieldKeys`가 `readVendorFieldAccess` 한 문으로 읽어 도출 — 폼 정의 목록·등록·수정 판정이 같은 함수"
198:    - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
202:    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`의 규칙) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`) · `repositories/permissions.ts` 1–5행(import) · 86–98행 `findVisibility` · 119–128행 `listVisibility`(한 문으로 합칠 두 조회의 모양 — 이 둘은 바꾸지 않는다) · `repositories/field-definitions.ts` 9–15행(`listFieldDefinitions`의 조건·정렬 — 한 문 조회가 같은 조건·정렬을 쓴다) · `eslint.config.mjs` 40–46행(domain → `db` import 금지)
234:- 파일 안 함수 `vendorInputFieldKeys(viewer, tx?: DbOrTx)`를 둔다(domain은 `db`를 import할 수 없다 — `eslint.config.mjs` 40–46행. 기본값 없이 받은 `tx`를 그대로 넘기고, `= db` 기본값은 리포지토리에만 있다). `readVendorFieldAccess(viewer, viewer.roleId ?? null, tx)`를 **한 번** 부르고, 그 결과만으로 `{ inputDefs, knownKeys }`를 도출한다 — `inputDefs` = `vendorValueVisible`이 참일 때 `archivedAt`이 null이고 `visibleFieldKeys`에 든 정의(칸 정렬 순서, `archived_options`·`label` 포함), 아니면 빈 배열. `knownKeys` = `definitions` **전체**의 키. 규칙은 03의 `visibleCustomFieldKeys`(활성 ∩ `cf.vendor.<key>` 보임)에 `vendor.value` AND를 건 것과 같다.
236:- 입력 칸 정의·`knownKeys`는 둘 다 `vendorInputFieldKeys`의 결과다(정의 조회를 따로 하지 않는다 — `repositories/field-definitions.ts`의 `listFieldDefinitions`는 이 플랜에서 부르지도 고치지도 않는다). 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `listVendorFieldDefinitions`·`createVendor`는 `tx` 없이(행 삽입 전) 부른다. `updateVendor`는 트랜잭션 **안에서** 행 잠금 **뒤에** `vendorInputFieldKeys(viewer, tx)`로 부른다. 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
262:    - `updateVendor`의 `withTransaction` 콜백 안에서 `findVendorByIdForUpdate(`가 `vendorInputFieldKeys(viewer, tx)`보다 먼저 오고, 콜백 안에 다른 정의·노출 조회(`ListFieldDefinitions(`·`visible(`·`findVisibility(`·`listVisibility(`·`visibleCustomFieldKeys(`)가 없다 — `grep -n -E "withTransaction|findVendorByIdForUpdate\(|vendorInputFieldKeys\(|ListFieldDefinitions\(|visible\(|Visibility\(|visibleCustomFieldKeys\(" domain/vendors/index.ts` 출력의 줄 순서를 SUMMARY에 인용 · 「경합 — 숨김 후 저장」의 RED 출력(트랜잭션 전 조회 초안)과 초록 출력이 SUMMARY에 있다
263:    - 한 문 구조 게이트(Codex t1t2-2 MAJOR): `awk '/export async function readVendorFieldAccess/,/^}/' repositories/permissions.ts | grep -v '^\s*//' | grep -c "await"`가 1이고(쿼리 한 번), `vendorInputFieldKeys` 본문에서 리포지토리 호출은 `readVendorFieldAccess(` 하나뿐이다(`awk '/function vendorInputFieldKeys/,/^}/' domain/vendors/index.ts | grep -v '^\s*//' | grep -cE "await"`가 1) · `grep -v '^\s*//' domain/vendors/index.ts | grep -cE "tx\??: DbOrTx = db"`가 0이다(domain에 `= db` 기본값 없음)
359:| 변경된 기존 심볼 | `validatedCustomFields`(쓰기 판정으로 교체) · `listVendorFieldDefinitions`(입력 칸 집합 하나) · `updateVendor`(domain — 커스텀 값이 있으면 행 잠금 트랜잭션, 잠금 뒤 같은 `tx`로 정의·노출 조회) · `updateVendor`(repository — 선택 `tx` 인자) · `createVendorAction`·`updateVendorAction`(칸별 오류 반환) · `VendorForm.handleSubmit`(수정 제출 모양) |
360:| 함수(신규) | `vendorInputFieldKeys(viewer, tx?)`(파일 안) · `readVendorFieldAccess(viewer, roleId, tx)`(`repositories/permissions.ts` — 한 문 조회) · `findVendorByIdForUpdate(viewer, id, tx)`(`repositories/vendors.ts`) |

codex
| 라운드 2 지적 | 상태 | 근거 |
|---|---|---|
| MAJOR: 서로 다른 시점의 노출 판정 결합 | RESOLVED | `04.5-05-PLAN.md:231,234,236,240`이 행 잠금 뒤 같은 tx의 단일 SELECT 결과만으로 `inputDefs`·`knownKeys`를 도출하도록 명시. 쓰기 판정의 별도 정의·노출 조회도 제거한다. |
| MINOR: domain의 `tx = db` 기본값 | RESOLVED | `04.5-05-PLAN.md:234`는 `tx?: DbOrTx` 전달만 지시하고, `04.5-03-PLAN.md:228`의 tx 추가도 철회됨. `eslint.config.mjs:46–47` 및 `repositories/document-counters.ts:8–10`의 계층 계약과 일치. |

단일 SELECT 설계에 막는 문제는 없습니다. LEFT JOIN으로 노출 행 없는 정의도 유지하고, 누락 행·null 계급은 거짓으로 처리합니다. 보관 정의는 `knownKeys`에 포함하되 입력 대상에서 제외합니다(`04.5-05-PLAN.md:209,231,234`). 조인 행 증식도 복합 UNIQUE가 막습니다(`db/schema/permissions.ts:39`). 일반 SELECT 하나의 스냅샷이라는 전제도 [PostgreSQL 문서](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)와 일치합니다.

[MINOR] `await` 개수는 SQL 문장 수를 보장하지 않는다 — **근거:** `04.5-05-PLAN.md:263`의 게이트는 `await Promise.all([조회1, 조회2])`도 통과합니다. 새 경합 테스트도 다중 조회 구현에서 통과할 수 있다고 `:223`에 명시되어 있어, 재발 검출에 빈틈이 있습니다. — **수정:** repository 호출 중 실제 실행 SQL을 계측하여 SELECT가 정확히 한 문인지 단언하고, 두 LEFT JOIN을 포함한 SQL도 확인하십시오.

[NOTE] 저장 응답의 DTO 조회는 여전히 분리되어 있다 — **근거:** `04.5-05-PLAN.md:243`은 반환 DTO 경로를 유지하며, `04.5-03-PLAN.md:228,230`은 정의·칸별 노출·상위 노출을 따로 읽습니다(`domain/permissions/project.ts:28–32`, `domain/permissions/visible.ts:19–22`). 이번 변경의 쓰기 판정에는 재사용되지 않으므로 라운드 2 해결을 뒤집지는 않습니다. — **수정:** 단일 스냅샷 보장 범위를 “저장 판정”으로 명시하십시오. DTO 경합은 이번 변경에서 새로 생긴 문제로 집계하지 않습니다.

판정: 막는 문제 없음
tokens used
47,766
| 라운드 2 지적 | 상태 | 근거 |
|---|---|---|
| MAJOR: 서로 다른 시점의 노출 판정 결합 | RESOLVED | `04.5-05-PLAN.md:231,234,236,240`이 행 잠금 뒤 같은 tx의 단일 SELECT 결과만으로 `inputDefs`·`knownKeys`를 도출하도록 명시. 쓰기 판정의 별도 정의·노출 조회도 제거한다. |
| MINOR: domain의 `tx = db` 기본값 | RESOLVED | `04.5-05-PLAN.md:234`는 `tx?: DbOrTx` 전달만 지시하고, `04.5-03-PLAN.md:228`의 tx 추가도 철회됨. `eslint.config.mjs:46–47` 및 `repositories/document-counters.ts:8–10`의 계층 계약과 일치. |

단일 SELECT 설계에 막는 문제는 없습니다. LEFT JOIN으로 노출 행 없는 정의도 유지하고, 누락 행·null 계급은 거짓으로 처리합니다. 보관 정의는 `knownKeys`에 포함하되 입력 대상에서 제외합니다(`04.5-05-PLAN.md:209,231,234`). 조인 행 증식도 복합 UNIQUE가 막습니다(`db/schema/permissions.ts:39`). 일반 SELECT 하나의 스냅샷이라는 전제도 [PostgreSQL 문서](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)와 일치합니다.

[MINOR] `await` 개수는 SQL 문장 수를 보장하지 않는다 — **근거:** `04.5-05-PLAN.md:263`의 게이트는 `await Promise.all([조회1, 조회2])`도 통과합니다. 새 경합 테스트도 다중 조회 구현에서 통과할 수 있다고 `:223`에 명시되어 있어, 재발 검출에 빈틈이 있습니다. — **수정:** repository 호출 중 실제 실행 SQL을 계측하여 SELECT가 정확히 한 문인지 단언하고, 두 LEFT JOIN을 포함한 SQL도 확인하십시오.

[NOTE] 저장 응답의 DTO 조회는 여전히 분리되어 있다 — **근거:** `04.5-05-PLAN.md:243`은 반환 DTO 경로를 유지하며, `04.5-03-PLAN.md:228,230`은 정의·칸별 노출·상위 노출을 따로 읽습니다(`domain/permissions/project.ts:28–32`, `domain/permissions/visible.ts:19–22`). 이번 변경의 쓰기 판정에는 재사용되지 않으므로 라운드 2 해결을 뒤집지는 않습니다. — **수정:** 단일 스냅샷 보장 범위를 “저장 판정”으로 명시하십시오. DTO 경합은 이번 변경에서 새로 생긴 문제로 집계하지 않습니다.

판정: 막는 문제 없음
exit=0
