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
session id: 01a0d474-8b2c-7991-86ce-50f1148be9e2
--------
user
You are an adversarial staff engineer doing a DELTA review of two small edits to the Phase 04.5 「화면 항목 관리」 implementation plans (Next.js 16 / TypeScript / Drizzle / PostgreSQL ERP). The full plan set already passed your final full review (docs/reviews/phase-04.5/codex-plan-review-final-4.md, 판정: 막는 문제 없음). Review ONLY the uncommitted diff: `git diff -- .planning/phases/04.5-custom-field-admin/` (plans 03 and 05).

Context (from /plan-eng-review, docs/designs/plant8-erp-phase04.5-eng-review-260925.md):
- T1 (plan 03): createRole used to swallow a failure when granting per-field visibility rows to a new role, leaving the role with every custom field hidden. Edit: retry once, then log.warn `role.custom_field_grant_failed` with roleId; the role stays; a test pins both paths via an injectable `RoleWriteDeps.grantCustomFieldsToRole`. Code facts: domain/permissions/roles.ts createRole (insert via global db, not in a tx), repositories/roles.ts insertRole.
- T2 (plan 05): new threat row T-04.5-44 accepting the TOCTOU between reading definitions/visibility outside the tx and writing inside it, justified as equivalent to a serial order (save committed just before the definition change). The eng review's original reason "ends in rejected save" was corrected because tightening changes (archive/hide/required) are written once under the old definition.

Questions: (1) Is T1's retry+log design sound and is the test executable as specified (RED first, injection hook typed without runtime import cycle)? Would a role still be left silently without rows? (2) Is T2's serial-order argument actually true for every change kind (archive field, hide for role, archive option, make required, relax changes)? Any case where the stale write corrupts data or leaks a hidden value? (3) Any new inconsistency the edits introduce with the rest of plans 03/05 (must_haves, acceptance criteria, threat IDs).

Evidence rule: every BLOCKER or MAJOR must cite a plan file + line AND, for code claims, a repo `file:line`. Otherwise label it [NOTE].
Output: findings as `[BLOCKER|MAJOR|MINOR|NOTE] title — evidence — concrete fix`. End with exactly one verdict line: `판정: 막는 문제 없음` if no BLOCKER/MAJOR, otherwise `판정: 막는 문제 있음 (N건)`. Do not modify files. Answer in Korean. Be concise.
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.
codex
미커밋 diff를 기준으로 두 변경과 직접 관련된 계획·코드만 대조하겠습니다. 재시도 테스트의 실행 가능성과 TOCTOU의 직렬 순서 주장을 집중 확인하겠습니다.

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
index 29041cc..792f5e8 100644
--- a/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
+++ b/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
@@ -322,7 +322,10 @@ Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의
 | T-04.5-18 | Tampering | 보관 선택지 새 지정(요청 위조 포함) | medium | mitigate | 검증기 선택지에 보관 선택지는 그 행의 저장값 하나만 더한다. 그 밖의 보관 선택지는 칸 오류다(단위·통합) |
 | T-04.5-19 | Information Disclosure | 칸 오류 메시지 | low | mitigate | 칸 오류는 입력 칸(그 사람이 볼 수 있는 칸) 키에만 붙는다. 없는 키 거부는 키 이름을 담지 않은 일반 문구이고, 입력 밖 존재 키 버림은 응답에 아무것도 더하지 않는다. 보이지 않는 칸의 이름·값이 응답에 없다. 거부/성공 차이로 드러나는 것은 서버가 만든 무작위 키(`cf_` + 8자리 16진)의 존재뿐이다 |
 | T-04.5-20 | Tampering | 필수 칸 우회(키 생략) | low | accept | 수정에서 필수 칸 키를 빼면 저장값이 그대로 남는다. 필수 칸을 비우는 효과가 없다(저장값이 비어 있었으면 표 2행의 「안 바꿈」과 같다). 우회로 얻는 것이 없다 |
+| T-04.5-44 | Tampering | 정의·노출 조회(tx 밖, Task 2 action ④ — L231·L239)와 tx 안 쓰기 사이 TOCTOU | low | accept | 정의 변경은 거래처 행을 건드리지 않아 결과가 「저장이 변경 직전에 커밋된」 직렬 순서와 같다 — 조이는 변경(보관·끔·필수)은 옛 정의로 한 번 쓰이고, 되살리기(Task 1 behavior 「되살리기」)와 03의 읽기 경로 칸별 판정(03 Task 2 `pickVisibleCustomFields`)이 그 값을 보존·숨긴다. 푸는 변경은 저장 거부(재시도)로 끝난다(eng review C-1 · T2) |
 | T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — `returnValidationErrors`는 설치된 next-safe-action 8.7.3의 기존 export다. 의존성 객체·lockfile diff 없음 |
+
+근거 정정: eng 검토 C-1의 '저장 거부로만 끝남'은 조이는 변경엔 맞지 않음 — 직렬 순서 동치로 수용
 </threat_model>
 
 <verification>

exec
/bin/bash -lc "rg --files -g AGENTS.md -g '*roles*' -g '*03*PLAN*' -g '*05*PLAN*' -g '*260925*' -g '*final-4*'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
test/e2e/mobile-roles.spec.ts
test/e2e/roles.spec.ts
domain/permissions/roles.ts
app/(app)/admin/people/roles/roles-client.tsx
docs/reviews/phase-04.5/codex-plan-prompt-final-4.md
docs/reviews/phase-04.5/codex-plan-review-final-4.md
test/integration/roles.test.ts
repositories/roles.ts
db/schema/roles.ts
docs/designs/plant8-erp-phase04.5-eng-review-260925.md

exec
/bin/bash -lc "pwd; rg --files --hidden -g AGENTS.md -g '"'!node_modules'"' -g '"'!.git'"'; nl -ba domain/permissions/roles.ts | head -180; nl -ba repositories/roles.ts | head -150; nl -ba lib/log.ts" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
/home/user/ERP_PLANT8_260917
     1	import { randomUUID } from "node:crypto";
     2	import type { Viewer } from "@/domain/viewer";
     3	import { can as defaultCan } from "@/domain/permissions/can";
     4	import { project, type DtoSpec } from "@/domain/permissions/project";
     5	import { registerDto } from "@/domain/permissions/dto-registry";
     6	import type { recordAction as RecordActionFn } from "@/domain/action-log/record";
     7	import { UserFacingError } from "@/lib/actions/user-facing-error";
     8	import { normalizeRoleName } from "@/domain/permissions/role-name";
     9	import {
    10	  findRoleById as defaultFindRoleById,
    11	  listRoles as repoListRoles,
    12	  insertRole as repoInsertRole,
    13	  renameRole as repoRenameRole,
    14	  type RoleRow,
    15	} from "@/repositories/roles";
    16	
    17	// ADMN-08: 계급 5종 시드 상수. Task 1 결정(옵션 A, 03-01-DECISION-TASK1.md ①) —
    18	// 이름은 데이터라 화면에서 바꿀 수 있지만 식별자 문자열은 영구다. 시드 권한표와
    19	// 이후 페이즈의 테스트 픽스처가 이 문자열을 참조한다.
    20	export type SeedRole = { id: string; name: string; isSeed: true; sortOrder: number };
    21	
    22	export const SEED_ROLES: SeedRole[] = [
    23	  { id: "role-ceo", name: "대표", isSeed: true, sortOrder: 0 },
    24	  { id: "role-division-head", name: "본부 책임자", isSeed: true, sortOrder: 1 },
    25	  { id: "role-team-lead", name: "팀장", isSeed: true, sortOrder: 2 },
    26	  { id: "role-pm", name: "기획 PM", isSeed: true, sortOrder: 3 },
    27	  { id: "role-sysadmin", name: "시스템 관리자", isSeed: true, sortOrder: 4 },
    28	];
    29	
    30	export { normalizeRoleName };
    31	
    32	export const SYSADMIN_ROLE_ID = "role-sysadmin";
    33	
    34	// 백필 규칙(Task 1 결정 ④)의 대상 — 관리자 여부 잔여 컬럼이 거짓인 행이 옮겨가는 기본 계급.
    35	export const DEFAULT_ROLE_ID = "role-pm";
    36	
    37	
    38	// T-03-17: 권한표·정보 노출표 셀 저장 액션의 zod 스키마가 roleId를 검증할 때
    39	// 쓰는 domain 진입점 — `app`은 `repositories`를 직접 import할 수 없으므로
    40	// (boundaries) 이 얇은 래퍼가 그 경계를 지킨다. ADMN-08이 계급을 관리 화면
    41	// 밖(CLI·시드)에서도 늘릴 수 있어 SEED_ROLES 정적 집합이 아니라 DB를
    42	// 확인한다.
    43	export type RoleExistsDeps = { findRoleById: typeof defaultFindRoleById };
    44	
    45	export async function roleExists(viewer: Viewer, roleId: string, deps?: Partial<RoleExistsDeps>): Promise<boolean> {
    46	  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
    47	  return (await findRoleById(viewer, roleId)) !== null;
    48	}
    49	
    50	export class ForbiddenError extends UserFacingError {}
    51	
    52	const PEOPLE_MENU = "admin.people";
    53	
    54	// ADMN-08: 계급 DTO — plant8/no-row-type-escape가 domain 출구의 RoleRow
    55	// 노출을 막는다. 구조/식별 정보 하나뿐이라 code_item 패턴처럼 항목 하나로
    56	// 게이트한다.
    57	export type RoleDto = {
    58	  id: string;
    59	  name: string;
    60	  isSeed: boolean;
    61	  sortOrder: number;
    62	  archivedAt: Date | null;
    63	};
    64	
    65	export const ROLE_DTO_SPEC: DtoSpec<RoleRow, RoleDto> = {
    66	  fields: [
    67	    { key: "id", from: "id", infoItem: "role.value" },
    68	    { key: "name", from: "name", infoItem: "role.value" },
    69	    { key: "isSeed", from: "isSeed", infoItem: "role.value" },
    70	    { key: "sortOrder", from: "sortOrder", infoItem: "role.value" },
    71	    { key: "archivedAt", from: "archivedAt", infoItem: "role.value" },
    72	  ],
    73	};
    74	
    75	registerDto({
    76	  name: "RoleDto",
    77	  fields: ROLE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
    78	});
    79	
    80	// ADMN-08: 계급 관리 화면(03-05)의 domain 진입점 — 03-01-SUMMARY에 없어 이
    81	// 플랜이 더한다. app은 repositories를 직접 import할 수 없다(boundaries).
    82	export async function listRoles(viewer: Viewer, opts?: { includeArchived?: boolean }): Promise<RoleDto[]> {
    83	  const rows = await repoListRoles(viewer, opts);
    84	  return Promise.all(rows.map((row) => project(viewer, row, ROLE_DTO_SPEC))) as Promise<RoleDto[]>;
    85	}
    86	
    87	export type RoleWriteDeps = { can: typeof defaultCan; recordAction: typeof RecordActionFn };
    88	
    89	// domain/action-log/record.ts를 정적으로 import하면 순환이 생긴다 —
    90	// domain/viewer.ts가 SYSADMIN_ROLE_ID를 이 파일에서 값으로 import하고,
    91	// record.ts는 SYSTEM_VIEWER를 domain/viewer.ts에서 값으로 import한다
    92	// (record.ts가 registry.ts와 순환을 끊을 때 쓴 것과 같은 동적 import 패턴).
    93	async function defaultRecordAction(...args: Parameters<typeof RecordActionFn>): ReturnType<typeof RecordActionFn> {
    94	  const { recordAction } = await import("@/domain/action-log/record");
    95	  return recordAction(...args);
    96	}
    97	
    98	export async function createRole(
    99	  viewer: Viewer,
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
   117	export async function renameRole(
   118	  viewer: Viewer,
   119	  id: string,
   120	  name: string,
   121	  deps?: Partial<RoleWriteDeps>,
   122	): Promise<void> {
   123	  const canFn = deps?.can ?? defaultCan;
   124	  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
   125	    throw new ForbiddenError("계급 이름 변경 권한이 없습니다.");
   126	  }
   127	
   128	  await repoRenameRole(viewer, id, normalizeRoleName(name));
   129	
   130	  const recordAction = deps?.recordAction ?? defaultRecordAction;
   131	  await recordAction(viewer, { actionType: "permission_change", entity: "roles", entityId: id });
   132	}
     1	import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
     2	import type { InferSelectModel } from "drizzle-orm";
     3	import { db } from "@/db/client";
     4	import { roles } from "@/db/schema";
     5	import type { Viewer } from "@/domain/viewer";
     6	import { normalizeRoleName } from "@/domain/permissions/role-name";
     7	
     8	export type RoleRow = InferSelectModel<typeof roles>;
     9	
    10	export async function listRoles(viewer: Viewer, opts?: { includeArchived?: boolean }): Promise<RoleRow[]> {
    11	  void viewer;
    12	  return db
    13	    .select()
    14	    .from(roles)
    15	    .where(opts?.includeArchived ? undefined : isNull(roles.archivedAt))
    16	    .orderBy(roles.sortOrder, roles.name);
    17	}
    18	
    19	export async function findRoleById(viewer: Viewer, id: string): Promise<RoleRow | null> {
    20	  void viewer;
    21	  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    22	  return row ?? null;
    23	}
    24	
    25	// 목록 묶음 조회(이슈 #56) — findRoleById와 같은 의미로 보관 여부로 거르지
    26	// 않는다. ids가 비면 조회 없이 []를 돌려준다.
    27	export async function findRolesByIds(viewer: Viewer, ids: string[]): Promise<RoleRow[]> {
    28	  void viewer;
    29	  if (ids.length === 0) return [];
    30	  return db.select().from(roles).where(inArray(roles.id, ids));
    31	}
    32	
    33	// 같은 이름 중복은 name UNIQUE 제약이 거부한다(NFC 정규화 후 비교, D-33①).
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
    47	export async function renameRole(viewer: Viewer, id: string, name: string): Promise<void> {
    48	  void viewer;
    49	  await db
    50	    .update(roles)
    51	    .set({ name: normalizeRoleName(name), updatedAt: new Date() })
    52	    .where(eq(roles.id, id));
    53	}
    54	
    55	// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다 — archived_at이 이미
    56	// 있으면(보관) / 없으면(복원) WHERE절이 걸러 0행이 갱신되고 원래 값이 유지된다.
    57	export async function setRoleArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
    58	  if (value) {
    59	    await db
    60	      .update(roles)
    61	      .set({ archivedAt: new Date(), archivedBy: viewer.id })
    62	      .where(and(eq(roles.id, id), isNull(roles.archivedAt)));
    63	  } else {
    64	    await db
    65	      .update(roles)
    66	      .set({ archivedAt: null, archivedBy: null })
    67	      .where(and(eq(roles.id, id), isNotNull(roles.archivedAt)));
    68	  }
    69	}
    70	
    71	// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing).
    72	export async function seedRole(
    73	  viewer: Viewer,
    74	  input: { id: string; name: string; isSeed: boolean; sortOrder: number },
    75	): Promise<boolean> {
    76	  void viewer;
    77	  const inserted = await db
    78	    .insert(roles)
    79	    .values({ id: input.id, name: input.name, isSeed: input.isSeed, sortOrder: input.sortOrder })
    80	    .onConflictDoNothing({ target: roles.id })
    81	    .returning({ id: roles.id });
    82	  return inserted.length > 0;
    83	}
     1	// 한 줄 JSON 로그. Cloud Logging이 severity·message를 특수 필드로 파싱한다.
     2	// next import 없음(01-05가 CLI 번들에 포함한다).
     3	
     4	type LogSeverity = "INFO" | "WARNING" | "ERROR";
     5	
     6	function write(severity: LogSeverity, event: string, fields?: Record<string, unknown>): void {
     7	  console.log(
     8	    JSON.stringify({
     9	      severity,
    10	      message: event,
    11	      time: new Date().toISOString(),
    12	      event,
    13	      ...fields,
    14	    }),
    15	  );
    16	}
    17	
    18	export const log = {
    19	  info(event: string, fields?: Record<string, unknown>): void {
    20	    write("INFO", event, fields);
    21	  },
    22	  warn(event: string, fields?: Record<string, unknown>): void {
    23	    write("WARNING", event, fields);
    24	  },
    25	  error(event: string, fields?: Record<string, unknown>): void {
    26	    write("ERROR", event, fields);
    27	  },
    28	};

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '1,270p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
     1	---
     2	phase: 04.5-custom-field-admin
     3	plan: 05
     4	type: execute
     5	wave: 5
     6	depends_on: ["04.5-03"]
     7	files_modified:
     8	  - domain/custom-fields/preserve.ts
     9	  - domain/vendors/index.ts
    10	  - repositories/vendors.ts
    11	  - app/(app)/admin/vendors/actions.ts
    12	  - app/(app)/admin/vendors/vendor-form.tsx
    13	  - test/unit/domain/custom-fields-preserve.test.ts
    14	  - test/integration/vendor-custom-fields-save.test.ts
    15	  - test/integration/custom-fields.test.ts
    16	autonomous: true
    17	requirements: []
    18	
    19	estimate:
    20	  tokens: 110000
    21	  raw_tokens: 110000
    22	  tasks: 3
    23	  confidence: low
    24	
    25	must_haves:
    26	  truths:
    27	    - "거래처 저장은 보는 사람이 볼 수 없는 칸의 저장값을 지우거나 바꾸지 않는다 — 보관된 칸, 그 사람 계급에서 끈 칸, `vendor.value`(「거래처 정보」)가 꺼진 사람의 모든 칸이 그렇다. 서버가 저장값에서 입력 칸 밖의 키를 그대로 되살려 합친다. 안내 문구는 없다(UI-SPEC E4 hidden·stale, ROADMAP 04.5 기준 2 값 보존)"
    28	    - "거래처 수정의 합치기와 쓰기는 원자적이다 — `updateVendor`가 `withTransaction` 안에서 그 거래처 행을 `SELECT … FOR UPDATE`로 잠가 읽고, 그 저장값으로 판정·합친 객체를 같은 트랜잭션의 UPDATE로 쓴다. 읽은 뒤 쓰기 전에 다른 사람(관리자)이 숨은 칸을 고쳐도 좁은 계급의 저장이 그 값을 이전 값으로 되돌리지 않는다 — 두 연결 경합 통합 테스트가 고정한다(Codex #1)"
    29	    - "입력 칸 집합은 하나다 — `vendor.value`가 보이면 03의 `visibleCustomFieldKeys(viewer, \"vendor\")`(활성 ∩ 계급별 보임), 아니면 빈 집합. 거래처 폼이 그리는 정의(`listVendorFieldDefinitions`)와 서버의 저장 판정이 같은 집합을 쓴다(03의 `vendor.value` AND 결정과 같은 규칙)"
    30	    - "거래처 정의에 아예 없는 키(보관 칸까지 포함한 대상 정의 전체 키 `knownKeys` 밖)를 하나라도 보내면 값이 비어 있어도 저장 전체를 거부하고 DB는 그대로다. 화면 문구는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(새 문구 없음)"
    31	    - "정의는 있으나 그 사람의 입력 칸 밖인 키(보관 칸 · 그 계급에서 끈 칸 · `vendor.value`가 꺼진 사람의 모든 칸 · 노출 행 없는 칸)는 거부하지 않는다 — 제출값을 버리고 저장값을 유지하며, 나머지 칸과 기본 필드는 저장된다. 그래서 폼이 열린 사이 관리자가 칸을 보관·노출 해제해도 그 폼의 저장은 성공한다(UI-SPEC E4 stale 「서버가 저장값 되살림(값 유실 없음)」, final judge #5)"
    32	    - "필수 판정은 UI-SPEC 화면 3 표 그대로다 — 등록: 빈칸이면 막힘 · 수정: 저장값도 비고 제출도 비면 안 바꿈(다른 칸 수정 저장 가능) · 저장값이 있는데 지우면 막힘 · 값이 있으면 타입 검증만. 막힘 문구는 텍스트·숫자·날짜 「필수 칸이 비어 있습니다 · 값 입력」, 선택형 「필수 칸이 비어 있습니다 · 선택지 고르기」(ROADMAP 기준 2 「고칠 때」 = 그 칸을 고칠 때, UI-SPEC O1)"
    33	    - "수정 제출의 모양 — 키가 없으면 안 바꿈(저장값 유지), 빈 문자열·공백만이면 비움. 거래처 폼은 수정 모드에서 그린 칸을 빈 값까지 모두 보낸다. 그래서 폼이 열린 사이 새로 보이게 된 칸(복원·노출 켬)의 저장값도 지워지지 않는다. 등록에는 저장값이 없어 키 없음 = 빈칸이다"
    34	    - "보관된 선택지 — 제출값이 그 거래처의 저장값과 같으면 통과(안 바꿈), 저장값이 아닌 보관 선택지면 그 칸에 「보관된 선택지입니다 · 다른 선택지 고르기」. 거래처 경로만 검증기에 `options ∪ {저장값 — 저장값이 archived_options에 있을 때만}`을 넘기고 `buildCustomFieldsSchema`·프로젝트·견적 줄 검증은 바뀌지 않는다(UI-SPEC O2·O11)"
    35	    - "칸 오류는 서버 액션 결과의 `validationErrors.customFields.{key}._errors`로 돌아간다(폼 전체 `serverError`가 아니다). 여러 칸이 틀리면 칸 정렬 순서대로 모두 담는다 — 06이 칸 아래 오류와 이유 자리 요약으로 그린다"
    36	    - "Phase 4 호출부 불변 — `listFieldDefinitions(viewer, entity)`의 호출 모양·결과(`orderBy(sortOrder, key)`)와 `domain/projects/*`·`domain/quotes/*`는 바뀌지 않고 `quote-lines` 통합 테스트가 수정 없이 초록이다"
    37	    - "Phase 3 `custom-fields` 통합 테스트는 **수정해서** 초록이다 — 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트가 그 칸의 노출 행(`cf.vendor.<key>`, 시스템 관리자 계급, 보임)을 명시로 더하고, 거부 두 테스트는 제 이유(`UnknownCustomFieldKeyError` · `CustomFieldsInvalidError`)로 거부됨을 단언한다. 노출 행이 없는 정의는 이제 입력 칸이 아니므로 「수정 없이 초록」은 성립하지 않는다(Codex #2)"
    38	  prohibitions:
    39	    - statement: "보는 사람이 볼 수 없거나 보관된 칸의 저장값이 거래처 저장으로 지워지거나 바뀌어서는 안 된다 — 권한이 좁은 사람의 평범한 저장이 다른 사람이 채운 값을 조용히 없애는 것은 데이터 유실이다"
    40	      status: resolved
    41	      verification: judgment
    42	    - statement: "입력 칸 밖의 커스텀 키의 제출값이 저장되어서는 안 된다 — 계급별로 끈 칸이나 보관된 칸을 요청 위조로 쓰는 경로가 없어야 한다(없는 키는 거부, 있는 칸이면 제출값을 버리고 저장값 유지)"
    43	      status: resolved
    44	      verification: judgment
    45	  artifacts:
    46	    - path: "domain/custom-fields/preserve.ts"
    47	      provides: "거래처 커스텀 값 쓰기 판정(순수) — 없는 키 거부 · 입력 밖 존재 키의 제출값 버림 · 필수 판정 표 · 보관 선택지 · 타입 검증 · 보이지 않는 저장값 되살리기"
    48	      exports: ["resolveCustomFieldsWrite", "CustomFieldsInvalidError", "UnknownCustomFieldKeyError"]
    49	    - path: "test/unit/domain/custom-fields-preserve.test.ts"
    50	      provides: "필수 판정 표 4행 × 타입 · 보관 선택지 · 없는 키 거부 · 입력 밖 존재 키 버림 · 키 없음/빈 값 구분 · 되살리기"
    51	      min_lines: 80
    52	    - path: "test/integration/vendor-custom-fields-save.test.ts"
    53	      provides: "끈 계급·보관 칸·`vendor.value` 끈 사람의 저장이 값을 지우지 않음 · 두 연결 경합에서 숨은 칸 값이 되돌아가지 않음 · 입력 밖 존재 키를 보낸 저장 성공(저장값 불변) · 없는 키 거부 · 필수 표 · 보관 선택지 — 실제 DB"
    54	      min_lines: 110
    55	    - path: "repositories/vendors.ts"
    56	      provides: "행 잠금 조회 `findVendorByIdForUpdate(viewer, id, tx)` · `updateVendor`의 선택 `tx` 인자"
    57	      contains: "findVendorByIdForUpdate"
    58	  key_links:
    59	    - from: "domain/vendors/index.ts"
    60	      to: "repositories/vendors.ts"
    61	      via: "`updateVendor`가 `withTransaction` 안에서 `findVendorByIdForUpdate(…, tx)` → `resolveCustomFieldsWrite` → `repoUpdateVendor(…, tx)` — 잠근 저장값으로 합치고 같은 트랜잭션에서 쓴다"
    62	      pattern: "findVendorByIdForUpdate"
    63	    - from: "domain/vendors/index.ts"
    64	      to: "domain/custom-fields/preserve.ts"
    65	      via: "`createVendor`·`updateVendor`가 입력 칸 정의·`knownKeys`·저장값·제출값으로 `resolveCustomFieldsWrite` 한 번"
    66	      pattern: "resolveCustomFieldsWrite"
    67	    - from: "domain/vendors/index.ts"
    68	      to: "domain/custom-fields/visibility.ts"
    69	      via: "입력 칸 집합 = `vendor.value` 보임이면 `visibleCustomFieldKeys`, 아니면 빈 집합 — 폼 정의 목록과 저장 판정이 같은 함수"
    70	      pattern: "visibleCustomFieldKeys"
    71	    - from: "app/(app)/admin/vendors/actions.ts"
    72	      to: "domain/custom-fields/preserve.ts"
    73	      via: "`CustomFieldsInvalidError`를 잡아 `returnValidationErrors(schema, { customFields: { [key]: { _errors } } })`"
    74	      pattern: "returnValidationErrors"
    75	---
    76	
    77	<objective>
    78	거래처를 저장해도 보는 사람이 볼 수 없는 칸의 값은 절대 지워지지 않는다. 정의에 없는 키는 서버가 거부하고, 정의는 있으나 입력 칸 밖인 키는 제출값을 버리고 저장값을 유지하며, 필수 칸은 「그 칸을 고칠 때」만 막으며, 보관된 선택지는 그대로 두면 유지되고 새로 고르면 거부된다. 칸 오류는 칸별로 돌아간다.
    79	
    80	Purpose: ROADMAP 04.5 기준 2(필수 판정 · 값 보존)와 기준 4(끈 계급의 저장이 값을 지우지 않음)의 서버 절반. 03이 읽기 경로(DTO 출구)를 칸별로 막았고, 이 플랜은 쓰기 경로를 막는다. 06이 이 계약 위에 칸 오류·이유 자리 화면을 그린다.
    81	
    82	Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의 입력 칸 집합 하나 · 수정의 행 잠금 합치기·쓰기(한 트랜잭션) · 거래처 액션의 칸별 오류 반환 · 거래처 폼 수정 제출 모양 한 줄 · 단위·통합(경합 포함) 테스트 · Phase 3 `custom-fields` 픽스처의 노출 행.
    83	
    84	**실행 순서 — Phase 4 선행:** `app/(app)/admin/vendors/vendor-form.tsx`(04-25)를 Phase 4도 고치므로 그 Phase 4 플랜이 작업 브랜치에 들어온 뒤에만 실행한다 — 먼저 `sh -c 'for p in 04-25; do git ls-tree --name-only HEAD .planning/phases/04-project-quote-ledger/ | grep -q "/$p-SUMMARY.md" || exit 1; done'`를 돌려(01이 착수 때 main을 합쳤다 — 여기서는 합치지 않는다, 마이그레이션 번호 조정은 07 의식만) 종료 코드가 0이 아니면 멈추고 사용자에게 알린다.
    85	
    86	**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. 새 의존성 0개.
    87	
    88	**공유 테스트 환경:** 같은 wave(4)의 04와 공유 `erp_test` DB·E2E 포트 3100·`next build` 디렉터리를 같이 쓴다. 그래서 통합 테스트·`pnpm build`·E2E 명령은 모두 `flock /tmp/plant8-erp-test.lock `을 앞에 붙여 한 번에 하나씩 돈다(단위·lint·typecheck는 잠금 없음). `pnpm db:dev`는 로컬 Postgres를 띄울 뿐 DB를 다시 만들지 않는다. 통합 테스트 DB는 vitest `test/integration/global-setup.ts`가, E2E DB는 `test/e2e/global-setup.ts`(14–46행: 스키마 비움 → 마이그레이션 → `seedMasterData`)가 준비하고, 각 테스트가 자기 픽스처를 넣는다. 이 플랜은 DB를 따로 준비하지 않는다.
    89	
    90	**운영 데이터 선행 조건(01/08 — 그룹 A 소유):** 기존 거래처 정의의 노출 행 일회성 백필은 03 `<objective>`의 선행 조건과 같다. 이 플랜은 그 백필을 전제로 「노출 행 없음 = 입력 칸 아님」을 판정한다.
    91	
    92	**병렬 페이즈 규칙:** `domain/projects/*`·`domain/quotes/*`·프로젝트·견적 폼·`domain/custom-fields/build-schema.ts`·`repositories/field-definitions.ts`의 `listFieldDefinitions`는 고치지 않는다(조건·정렬 불변 — 01이 더한 끝의 선택 `tx`는 두 인자 호출 모양을 바꾸지 않는다). `domain/permissions/project.ts`·`domain/permissions/dto-registry.ts`도 건드리지 않는다.
    93	</objective>
    94	
    95	<execution_context>
    96	@.claude/gsd-core/workflows/execute-plan.md
    97	@.claude/gsd-core/templates/summary.md
    98	</execution_context>
    99	
   100	<context>
   101	@.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md
   102	@.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md
   103	@.planning/phases/04.5-custom-field-admin/04.5-03-SUMMARY.md
   104	@CLAUDE.md
   105	# 범위 Read(UI-SPEC 개정 3, 75ae245 기준):
   106	# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 3」 267–301행(필수 판정 표 · 보관된 선택지가 현재 값 · 보이지 않는 칸) · Copywriting 거래처 폼 줄(140·145–148행) · E4 줄(184–189행) · Assumptions O1·O2·O11
   107	# .planning/phases/04.5-custom-field-admin/04.5-RESEARCH.md Pitfall 3
   108	</context>
   109	
   110	<probe_fallback>
   111	⚠ spec-less probe fallback skipped: phase has no requirement IDs to probe (visible skip). 수용 기준은 ROADMAP 04.5 기준 2·4, UI-SPEC(개정 3) 화면 3 「필수 판정」·「보관된 선택지가 현재 값」과 `## UI Considerations`의 E4 hidden·stale·partial·archived value, Assumptions O1·O2·O11, RESEARCH Pitfall 3에서 끌어왔다.
   112	
   113	**계획 단계 결정(표면화):**
   114	
   115	- **수정 제출에서 「키 없음」과 「빈 값」을 가른다.** UI-SPEC E4 stale은 「칸이 보관·노출 해제됨 → 서버가 저장값 되살림」만 적었다. 반대 방향(폼이 열린 사이 칸이 복원되거나 노출이 켜짐)에서는 폼이 그 칸을 그리지 않았는데 서버는 입력 칸으로 본다. 키 없음 = 비움이면 그 저장값이 지워진다. 그래서 수정 모드에서는 키 없음 = 안 바꿈, 빈 문자열 = 비움으로 정하고, 거래처 폼이 그린 칸을 빈 값까지 모두 보내게 한 줄 바꾼다. 서버 계약과 그 유일한 호출부를 한 커밋에 둔다. 등록에는 저장값이 없어 둘이 같다.
   116	- **입력 칸 집합에 `vendor.value`를 AND로 건다.** 03이 DTO에서 `vendor.value`가 꺼진 사람에게 `customFields`를 통째로 숨긴다. 그런데 폼만 칸을 그리면 기본값이 빈 채로 그려지고, 저장하면 값이 지워진다. 그래서 `vendor.value`가 꺼진 사람의 입력 칸은 0개이고 폼에도 커스텀 칸이 없다. `listVendorFieldDefinitions`가 이 집합을 쓰도록 03의 구현을 좁힌다(같은 파일, 03 다음 wave).
   117	- **입력 밖 존재 키는 버린다(final judge #5).** 거래처 폼은 열 때 받은 칸의 키를 보내므로(`vendor-form.tsx` 96–101행, 수정 모드는 빈 값까지), 폼이 열린 사이 관리자가 칸을 보관·노출 해제하면 정상 사용자도 입력 칸 밖 키를 보낸다. 이를 거부하면 새로 고침 말고 길이 없어 UI-SPEC E4 stale(저장 성공 · 값 유실 없음)과 어긋난다. 그래서 대상 정의 전체 키(`knownKeys`, 보관 포함) 안이면서 입력 칸 밖인 키는 제출값을 버리고 저장값을 유지한다. 위조한 값은 어느 쪽이든 쓰이지 않으므로 T-04.5-05는 그대로 막힌다. `knownKeys` 밖(정의에 없는 키)만 거부해 클라이언트 버그는 크게 드러낸다. 재조회 복구 경로·E2E는 더하지 않는다.
   118	- **없는 키 문구:** UI-SPEC에 없는 상황(정상 화면·오래 열린 폼 모두 정의에 없는 키를 보내지 않는다)이라 새 문구를 만들지 않는다. `UnknownCustomFieldKeyError`(`UserFacingError` 하위)는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(`lib/actions/zod-error-message.ts` 기본 줄과 같은 문자열)를 쓴다.
   119	- **타입 오류 문구:** UI-SPEC은 커스텀 칸의 타입 오류 문구를 따로 정하지 않았다. 칸별 메시지는 기존 `koreanZodErrorMessage`가 그 칸의 이슈만 담은 ZodError를 접어 만든다. 예: 숫자 칸 「abc」 → 「형식이 올바르지 않습니다 · 값을 확인해 주세요」, 없는 선택지 → 「허용되지 않은 값입니다 · {선택지들} 중에서 선택해 주세요」. `lib/actions/zod-error-message.ts`는 바꾸지 않는다. 화면에 새로 나타나는 이 기존 문구를 SUMMARY에 적는다.
   120	- **숨은 필수 칸:** 입력 칸 밖의 필수 칸(보관·끔)은 판정하지 않는다. 볼 수 없는 칸을 채우라고 막을 수 없다.
   121	
   122	**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3이 비워 둔 자리를 기존 문구로 메운 곳 — SUMMARY에만 두지 않는다):**
   123	- **5-A** 커스텀 칸 타입 오류 문구 = 기존 `koreanZodErrorMessage` 줄(예 「형식이 올바르지 않습니다 · 값을 확인해 주세요」). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   124	- **5-B** 없는 키(정의에 없는 키) 거부 문구 = 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(정상 화면·오래 열린 폼에서는 나오지 않는다 — 보관·노출 해제된 칸의 키는 거부하지 않고 버린다). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   125	</probe_fallback>
   126	
   127	<reversibility_notes>
   128	
   129	- 「키 없음 = 안 바꿈, 빈 값 = 비움」 수정 제출 계약 — **reversible**: `preserve.ts` 한 분기와 폼 한 줄이다. 되돌리면 폼이 열린 사이 새로 보이게 된 칸의 값이 지워질 수 있다.
   130	- 입력 칸 집합의 `vendor.value` AND — **reversible**: 판정 함수 한 곳이다.
   131	- 수정의 행 잠금 트랜잭션(`findVendorByIdForUpdate` + `withTransaction`) — **reversible**: `updateVendor` 한 분기와 리포지토리 함수 하나다. 되돌리면 동시 저장이 숨은 칸 값을 되돌리는 틈이 다시 생긴다.
   132	
   133	</reversibility_notes>
   134	
   135	<tasks>
   136	
   137	<task type="auto" tdd="true">
   138	  <name>Task 1: 순수 쓰기 판정 `resolveCustomFieldsWrite` — 없는 키 거부 · 입력 밖 존재 키 버림 · 필수 판정 표 · 보관 선택지 · 타입 검증(칸별 메시지) · 보이지 않는 저장값 되살리기</name>
   139	  <files>domain/custom-fields/preserve.ts, test/unit/domain/custom-fields-preserve.test.ts</files>
   140	  <read_first>
   141	    - `domain/custom-fields/build-schema.ts`(전문 — `FieldDef`, `buildCustomFieldsSchema`, 필수 아닌 칸만 optional, `.strict()`)
   142	    - `lib/actions/zod-error-message.ts`(전문 — `koreanZodErrorMessage`, 기본 줄 문자열) · `lib/actions/user-facing-error.ts`
   143	    - `domain/code-tables/tax-rule.ts`(순수 domain 모듈 선례 — DB·세션 import 없음) · `test/unit/domain/custom-fields-admin.test.ts`(01의 단위 테스트 관례)
   144	    - UI-SPEC 「화면 3」 필수 판정 표·「보관된 선택지가 현재 값」 문단 · Copywriting 거래처 폼 줄
   145	  </read_first>
   146	  <behavior>
   147	    - 입력 모양: `{ mode: "create" | "update", inputDefs, knownKeys, stored, submitted }` — `inputDefs`는 `{ key, label, type, options, archivedOptions, required }`의 칸 정렬 순서 배열, `knownKeys`는 그 대상 정의 전체 키 집합(보관 칸·노출 행 없는 칸 포함, `inputDefs` 키를 모두 포함), `stored`는 그 거래처의 저장 객체(등록이면 빈 객체), `submitted`는 액션이 받은 `customFields` 객체
   148	    - (없는 키) `submitted`에 `knownKeys` 밖 키가 하나라도 있으면(값이 빈 문자열이어도) `UnknownCustomFieldKeyError`를 던지고, 메시지는 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」
   149	    - (입력 밖 존재 키 — E4 stale·hidden) `knownKeys` 안·`inputDefs` 밖 키는 값과 함께 와도 오류가 없다. 그 제출값은 버린다 — 결과의 그 키는 저장값 그대로(저장값이 없으면 결과에 없음, 등록이면 결과에 없음)이고, 필수·보관 선택지·타입 판정에 쓰이지 않는다. 같은 제출의 입력 칸 값은 그대로 반영된다
   150	    - (빈 값) `undefined`·`null`·공백만인 문자열은 빈 값이다. `0`과 `"0"`은 빈 값이 아니다
   151	    - (필수 · 등록) 필수 텍스트 칸이 비면 그 키에 「필수 칸이 비어 있습니다 · 값 입력」, 필수 선택형이 비면 「필수 칸이 비어 있습니다 · 선택지 고르기」
   152	    - (필수 · 수정) 저장값도 비고 제출도 비면 오류가 없고 결과에 그 키가 없다 · 저장값이 있는데 제출이 빈 문자열이면 위와 같은 막힘 문구 · 필수 칸의 키가 제출에 아예 없으면 저장값 그대로(막지 않는다)
   153	    - (필수 아님 · 수정) 제출이 빈 문자열이면 결과에서 그 키가 빠진다(비움) · 키가 없으면 저장값 그대로
   154	    - (보관 선택지) 저장값 「구형」이 `archivedOptions`에 있고 제출도 「구형」이면 통과하고 값 유지 · 제출이 다른 보관 선택지 「폐기」면 그 키에 「보관된 선택지입니다 · 다른 선택지 고르기」 · 등록에서 보관 선택지를 보내도 같은 문구 · 저장값이 활성 선택지면 보관 선택지를 새로 고를 수 없다
   155	    - (타입) 숫자 칸에 「abc」면 그 키에 기존 한국어 한 줄(`koreanZodErrorMessage` 결과) · 선택형에 없는 값이면 기존 「허용되지 않은 값입니다 · … 중에서 선택해 주세요」 · 통과한 값은 기존 검증기가 바꾼 모양 그대로(숫자는 number, 날짜는 기존 `z.coerce.date()` 결과)
   156	    - (여러 칸) 오류가 여럿이면 `CustomFieldsInvalidError.fieldErrors`가 `inputDefs` 순서대로 모든 키를 담는다. 한 칸에는 메시지 하나만 둔다(필수 막힘 → 보관 선택지 → 타입 순으로 첫 것)
   157	    - (되살리기) `stored`에서 `inputDefs` 밖 키(보관 칸·끈 칸·정의가 없어진 키)는 결과에 그대로 들어간다. 입력 칸 값과 합친 새 객체를 돌려주고 인자 객체는 바꾸지 않는다
   158	  </behavior>
   159	  <action>
   160	① RED 먼저. behavior를 표 주도 단위 테스트로 쓰고 빨간 것을 확인한다.
   161	
   162	② `domain/custom-fields/preserve.ts`(순수 — DB·세션·서버 전용 표시 모듈 import 없음):
   163	- 오류 클래스 두 개를 둔다. 둘 다 `UserFacingError` 하위다.
   164	  - `CustomFieldsInvalidError`: `fieldErrors: Record<string, string>`(키 → 메시지 한 줄)를 갖고, `message`는 첫 칸 메시지다. `message`는 액션이 잡지 못했을 때의 폴백이다.
   165	  - `UnknownCustomFieldKeyError`: 메시지는 위 기존 일반 문구다.
   166	- 필수 막힘·보관 선택지 문구는 파일 안 상수로 둔다. 문자열은 UI-SPEC Copywriting 원문 그대로다.
   167	- `resolveCustomFieldsWrite(input)`는 behavior 순서대로 판정한다. 순서는 없는 키(`knownKeys` 밖 → 거부) → 입력 밖 존재 키(`knownKeys` 안·`inputDefs` 밖 → 제출에서 버림) → 칸마다(필수 판정 표 → 보관 선택지) → 타입 검증 → 되살리기다. 버림은 판정 전에 제출 사본에서 그 키를 빼는 것이라 뒤 단계는 `inputDefs` 키만 본다.
   168	- 타입 검증은 기존 `buildCustomFieldsSchema`를 그대로 부른다.
   169	  - 정의는 제출이 비지 않은 입력 칸만 넘기고 `required: false`다. 필수는 이미 위에서 판정했다.
   170	  - 선택형 선택지는 `options`에 `stored[key]`를 더한다. 저장값이 `archivedOptions`에 있을 때만 더한다.
   171	  - `safeParse`의 이슈를 `path[0]`별로 모아, 그 칸 이슈만 담은 ZodError로 `koreanZodErrorMessage`를 부른다.
   172	- 검증기·Phase 4 경로는 바꾸지 않는다. 거래처 경로 어댑터가 이 파일 안에 있다(UI-SPEC O11).
   173	
   174	③ 결과 모양은 `Record<string, unknown>` 새 객체다. 수정 모드의 합치기 규칙:
   175	- 키 없음 → 저장값 유지
   176	- 빈 값 → 뺌
   177	- 값 있음 → 검증된 값
   178	- 입력 칸 밖 저장 키 → 그대로(그 키가 제출에 와도 제출값은 버려져 그대로)
   179	  </action>
   180	  <verify>
   181	    <automated>pnpm vitest run --project unit test/unit/domain/custom-fields-preserve.test.ts &amp;&amp; pnpm typecheck &amp;&amp; pnpm lint</automated>
   182	    <fails_when>vitest failed 개수가 1 이상이거나 tsc·eslint가 error로 끝난다 — 필수 표 네 행 · 보관 선택지 세 경우 · 없는 키 거부(빈 값 포함) · 입력 밖 존재 키 버림(오류 없음 · 저장값 그대로 · 다른 칸 반영) · 키 없음/빈 값 구분 · 되살리기 · 여러 칸 순서 중 하나라도 어긋나면 빨간색이다</fails_when>
   183	  </verify>
   184	  <acceptance_criteria>
   185	    - `grep -v '^\s*//' domain/custom-fields/preserve.ts | grep -cE "from \"@/(repositories|db)|server-only"`가 0이다(순수 모듈)
   186	    - `git diff origin/main -- domain/custom-fields/build-schema.ts lib/actions/zod-error-message.ts`가 비어 있다
   187	    - 막힘·보관 선택지 문구 세 개가 UI-SPEC Copywriting 원문과 글자까지 같다
   188	    - 검증 명령이 초록이다
   189	  </acceptance_criteria>
   190	  <done>거래처 커스텀 값의 쓰기 규칙이 DB 없이 한 함수로 판정되고, 표의 모든 행이 단위 테스트로 고정되어 있다</done>
   191	</task>
   192	
   193	<task type="auto" tdd="true">
   194	  <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
   195	  <files>domain/vendors/index.ts, repositories/vendors.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   196	  <read_first>
   197	    - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
   198	    - `repositories/vendors.ts` 47–50행(`findVendorById`) · 105–110행(`updateVendor` — 전역 `db`로 쓴다)
   199	    - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
   200	    - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
   201	    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
   202	    - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   203	  </read_first>
   204	  <behavior>
   205	    - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
   206	    - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
   207	    - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
   208	    - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
   209	    - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
   210	    - (없는 키 — 거부) 누구든 어떤 거래처 정의에도 없는 키를 보내면(값이 빈 문자열이어도, 다른 칸 수정과 함께여도) `UnknownCustomFieldKeyError`이고 DB는 그대로다(행 `updated_at` 불변, 행동 로그 없음)
   211	    - (노출 행 없는 정의) 정의만 있고 노출 행이 하나도 없는 거래처 칸(백필 전 상태)은 시스템 관리자에게도 입력 칸이 아니다 — 그 키를 새 값과 함께 보내도 거부하지 않고 제출값을 버리며, 저장값은 되살리기로 남는다
   212	    - (필수 · 나중에 생긴 칸) 거래처를 만든 뒤 필수 칸 C를 추가한다. 다른 칸만 고쳐 수정 저장(C는 빈 문자열)하면 성공하고 C 키는 없다. 같은 거래처에서 C에 값을 넣어 저장한 뒤 C를 빈 문자열로 저장하면 `CustomFieldsInvalidError` `{ C: "필수 칸이 비어 있습니다 · 값 입력" }`
   213	    - (필수 · 등록) C가 빈 등록은 `CustomFieldsInvalidError`이고 거래처 행이 생기지 않는다
   214	    - (보관 선택지) 선택형 D의 저장값 「구형」을, 픽스처가 `options`에서 빼고 `archived_options`에 넣어(02의 수정 기능을 부르지 않는다 — 02는 이 플랜의 depends_on 밖) 보관한 뒤 「구형」 그대로 저장하면 값 유지. 다른 보관 선택지로 바꾸면 D에 보관 선택지 문구
   215	    - (Phase 3 픽스처) `test/integration/custom-fields.test.ts`의 거래처 정의 세 테스트가 노출 행을 명시로 넣은 뒤 초록이다 — 「등록된 키만 저장」은 값이 저장되고, 「등록되지 않은 키」는 `UnknownCustomFieldKeyError`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다
   216	    - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   217	  </behavior>
   218	  <action>
   219	① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
   220	
   221	② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
   222	
   223	③ `repositories/vendors.ts`(Phase 4 브랜치 diff 없음 — 계획 때 확인):
   224	- `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
   225	- 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
   226	- `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
   227	
   228	④ `domain/vendors/index.ts`:
   229	- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
   230	- `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
   231	- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
   232	- `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
   233	- `updateVendor`:
   234	  - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
   235	  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   236	  - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   237	  - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   238	  - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
   239	  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
   240	- **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
   241	
   242	⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
   243	
   244	⑥ `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체를 한 번 돌려 거래처·견적 줄·프로젝트 회귀를 확인한다.
   245	  </action>
   246	  <verify>
   247	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
   248	    <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
   249	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
   250	    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
   251	    <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
   252	    <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   253	  </verify>
   254	  <acceptance_criteria>
   255	    - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
   256	    - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
   257	    - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
   258	    - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
   259	    - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
   260	    - `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체가 초록이다(SUMMARY에 통과 개수 요약)
   261	    - 세 검증 명령이 전부 초록이다
   262	  </acceptance_criteria>
   263	  <done>권한이 좁은 사람이 거래처를 저장해도 보이지 않는 칸의 값은 남고(동시에 관리자가 고친 값도 되돌리지 않는다, 오래 열린 폼이 보낸 보관·끈 칸 키는 버려지고 저장은 성공한다), 정의에 없는 키는 거부되며, 필수 칸은 그 칸을 고칠 때만 막힌다</done>
   264	</task>
   265	
   266	<task type="auto">
   267	  <name>Task 3: 거래처 액션의 칸별 오류 반환 · 폼 수정 제출 모양 · 거래처 E2E 회귀</name>
   268	  <files>app/(app)/admin/vendors/actions.ts, app/(app)/admin/vendors/vendor-form.tsx</files>
   269	  <read_first>
   270	    - `app/(app)/admin/vendors/actions.ts`(전문 — 두 스키마가 `.schema(z.object(…))` 안에 인라인이다) · `node_modules/next-safe-action/dist/index.d.mts`에서 `returnValidationErrors` 시그니처

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '205,300p'; rg -n 'T-04.5-44|import type|cycle' test/unit/import-cycles*; nl -ba domain/vendors/index.ts | head -300" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   205	<task type="auto" tdd="true">
   206	  <name>Task 2: 거래처 DTO 칸별 판정 — 모든 출구에서 보이는 키만 · 폼 정의도 보이는 칸만 · 누수 스캔 커스텀 축 · 끈 계급의 화면에 값 없음</name>
   207	  <files>domain/custom-fields/visibility.ts, domain/vendors/index.ts, test/integration/leak-scan.test.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
   208	  <precondition>01/08이 이 브랜치에 더한 마이그레이션 SQL에 기존 거래처 정의의 노출 행 백필 문장이 있다 — `git diff --name-only origin/main -- db/migrations | grep '\.sql$' | xargs grep -l "visibility_matrix"`가 한 파일 이상을 내고, 그 문장이 `field_definitions`·`roles`에서 SELECT하며 `ON CONFLICT` … `DO NOTHING`으로 끝난다. 없으면 이 태스크를 시작하지 않고 멈춰 오케스트레이터에 알린다(01 마이그레이션은 그룹 A 소유)</precondition>
   209	  <read_first>
   210	    - `domain/vendors/index.ts` 36–70행(`VendorDto`·`VENDOR_DTO_SPEC`) · 89–160행(`listVendors`·`searchVendors`·`listVendorFieldDefinitions`) · 241–366행(`createVendor`·`updateVendor`·`setVendorHidden`의 `project()` 호출 다섯 곳)
   211	    - `domain/permissions/visible.ts`(전문 — 행 없으면 거짓)
   212	    - `test/integration/leak-scan.test.ts`(전문 — main 173행에 09가 `FieldDefinitionAdminDto` 검사 경로를 더한 뒤 모양. `buildDtoCases` 모양·결정적 순서 단언. 09가 더한 줄도 고치지 않고 파일 끝에만 더한다)
   213	    - `test/integration/vendors.test.ts`(거래처 생성·조회 픽스처)
   214	    - `app/(app)/admin/vendors/page.tsx`(거래처 목록·편집 폼이 DTO에서 무엇을 그리는지)
   215	  </read_first>
   216	  <behavior>
   217	    - (단위 성격, 통합 파일 안) `pickVisibleCustomFields({ a: 1, b: 2 }, new Set(["a"]))` → `{ a: 1 }`; 값이 없으면(「거래처 정보」로 이미 가려짐) 그대로 없음
   218	    - (통합) 칸 A·B에 값이 든 거래처를, B를 끈 계급(`admin.vendors` 보기 권한을 테스트에서 켬)으로 `listVendors`·`searchVendors`하면 `customFields`에 A만 있다 · 같은 계급의 `updateVendor`·`setVendorHidden` 반환 DTO에도 B가 없다
   219	    - (통합) 보관된 칸의 값은 시스템 관리자 DTO에도 없다(보관 칸은 목록에서 숨음 — D10-12)
   220	    - (통합, 기본 숨김 — Codex #2) `insertFieldDefinition`으로 직접 넣고 노출 행을 하나도 만들지 않은 거래처 정의(백필 전 운영 데이터와 같은 상태)의 값은 시스템 관리자 DTO에도 없다 — 백필이 왜 선행 조건인지 고정한다. 같은 정의에 `insertVisibilityIfAbsent`로 시스템 관리자 행을 넣으면 값이 보인다
   221	    - (통합) `listVendorFieldDefinitions`가 그 계급에게 A만 돌려준다
   222	    - (통합, 누수 스캔) 결정적 생성기가 (활성 칸 × 시드 계급) 케이스를 만들고, 각 케이스에서 그 계급에 `vendor.value` 보임 행을 켠 상태로 **끄기 전** 거래처 DTO 직렬화에 두 칸 값이 **있음**을 먼저 단언한 뒤, 그 칸을 끄면 그 칸의 값 문자열이 **없고** 다른 칸 값은 남는다(`vendor.value`가 꺼진 계급은 DTO 전체가 비어 헛되이 통과하므로 사전 양성 단언으로 막는다)
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
   241	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts test/integration/vendors.test.ts test/integration/custom-fields.test.ts</automated>
   242	    <fails_when>통합 failed 개수가 1 이상이다 — 칸별 거르기·노출 행 없는 정의의 기본 숨김·폼 정의 거르기·누수 스캔 커스텀 축, 또는 기존 거래처·커스텀 필드 테스트 회귀</fails_when>
   243	    <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts</automated>
   244	    <fails_when>playwright failed 개수가 1 이상이다 — 끈 칸의 이름·값이 거래처 화면 HTML에 남았거나, 다시 켠 값이 안 보이거나, 기존 거래처 화면 회귀</fails_when>
   245	  </verify>
   246	  <acceptance_criteria>
   247	    - `domain/vendors/index.ts`에서 `project(viewer, … VENDOR_DTO_SPEC)`를 직접 부르는 곳이 로컬 DTO 함수 하나뿐이다(`grep -v '^\s*//' domain/vendors/index.ts | grep -c "VENDOR_DTO_SPEC)"`가 1 — 주석 줄 제외, 결과를 SUMMARY에 인용)
   248	    - `VENDOR_DTO_SPEC`의 필드 목록 diff가 비어 있다
   249	    - `leak-scan.test.ts` diff가 파일 끝 추가뿐이다(삭제 줄 없음)
   250	    - 커스텀 칸 축의 케이스마다 `vendor.value` 보임 행을 켜는 호출이 있고, 칸을 끄는 호출보다 **앞에** 그 값 문자열이 직렬화에 있다는 단언(양성)이, 뒤에 없다는 단언(음성)이 있다 — 시드 계급 5개 × 칸 2개 케이스 전부에서 양성 단언이 실제로 통과한 출력을 SUMMARY에 인용
   251	    - 세 검증 명령이 전부 초록이다
   252	  </acceptance_criteria>
   253	  <done>관리자가 계급별로 끈 칸은 그 계급의 거래처 DTO·화면·누수 스캔 어디에도 값이 없다</done>
   254	</task>
   255	
   256	</tasks>
   257	
   258	<threat_model>
   259	## Trust Boundaries
   260	
   261	| Boundary | Description |
   262	|----------|-------------|
   263	| 브라우저 → `setVisibilityCellAction` | 계급 id·정보 항목 문자열이 들어온다 — 항목 문자열은 위조될 수 있다 |
   264	| 거래처 DTO → 계급별 사용자 화면 | JSONB에 든 모든 칸 값이 한 행에 있다 — 판정 없이 나가면 끈 칸이 샌다 |
   265	
   266	## STRIDE Threat Register
   267	
   268	| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
   269	|-----------|----------|-----------|----------|-------------|-----------------|
   270	| T-04.5-03 | Tampering | `setVisibilityCellAction`의 `infoItem` | high | mitigate | 비동기 refine `isAssignableInfoItem` — `INFO_ITEMS` 또는 대상 상수 안의 **활성** 정의가 실제로 있는 `cf.` 키만. 위조 키로 임의 노출 행을 만들 수 없다(통합: 없는 키·보관·대상 밖·형식 오류 거부) |
   271	| T-04.5-42 | Elevation of Privilege | `setVisibilityCell`의 `cf.` 키 | high | mitigate | 셀 쓰기 권한(`admin.visibility` write)은 기존 domain 게이트(`domain/permissions/matrix.ts` 165행) 그대로다. 권한이 없는 계급(기획 PM)이 `cf.vendor.<key>` 셀을 바꾸면 `ForbiddenError`이고 행·행동 로그가 그대로인 통합 테스트가 커스텀 항목 쪽을 고정한다(Task 1, checker WARNING) |
   272	| T-04.5-43 | Denial of Service | 01 이전에 만든 거래처 정의의 값(노출 행 없음 → 기본 숨김) | medium | transfer | 01/08 마이그레이션의 일회성 백필(기존 거래처 정의 × 모든 계급, 없을 때만 보임 행)이 맡는다(그룹 A 소유). 이 플랜은 Task 2 `<precondition>`으로 그 문장의 존재를 확인하고, 노출 행 없는 정의가 누구에게도 안 보인다는 것을 통합 테스트로 고정한다 |
   273	| T-04.5-04 | Information Disclosure | 거래처 DTO 출구 다섯 · 폼 정의 목록 | high | mitigate | 모든 출구가 로컬 DTO 함수 하나로 `pickVisibleCustomFields` — 활성 ∩ 보임 키만. 「거래처 정보」 판정이 먼저라 노출 범위가 넓어지지 않는다. 누수 스캔 커스텀 축 + 끈 계급 화면 HTML E2E로 증명 |
   274	| T-04.5-06 | Elevation of Privilege | 배포 시드 | medium | mitigate | 시드는 커스텀 항목 행을 쓰지 않는다 — 끈 뒤 재시드 통합 테스트 |
   275	| T-04.5-07 | Tampering | 칸 생성(01) ↔ 계급 생성(`grantCustomFieldsToRole`) 동시 실행 | medium | mitigate | 01과 같은 위협의 계급 쪽 절반. 두 경로가 같은 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`를 첫 문장으로 잡고 잠금 뒤에 상대 목록을 같은 `tx` 연결로 읽어 직렬화된다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생기고, 잠금 보유자가 두 번째 풀 연결을 요구하지 않아 풀 고갈 교착이 없다. await 없이 띄운 grant와 고정 지연 없는 동기화 지점(`defsRead` · `pg_locks` 대기 행)으로 경합을 재현한 통합 테스트가 잠금 없는 RED → 잠금 뒤 초록으로, 풀 크기만큼 동시 부여 통합 테스트가 같은 연결 조회를 고정한다(Task 1) |
   276	| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 한 번 재시도 뒤 숨김 쪽으로 실패하고 경고 로그 `role.custom_field_grant_failed`(`roleId`)를 남긴다 — 조용히 행 없는 계급이 남지 않는다(Task 1 통합 테스트, eng review B-2) |
   277	| T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — 의존성 객체·lockfile diff 없음 |
   278	</threat_model>
   279	
   280	<verification>
   281	- `pnpm lint` · `pnpm typecheck` · `pnpm build`(`flock /tmp/plant8-erp-test.lock ` 앞에 붙임) · `pnpm test:unit` 통과
   282	- 통합(같은 잠금): `custom-field-visibility`(권한 거부·기본 숨김 포함)·`leak-scan`·`visibility`·`roles`·`seed-permissions`·`vendors`·`custom-fields` 통과
   283	- `CI=true` E2E(같은 잠금): `custom-field-visibility`·`permissions-grid`·`vendors`·`vendor-edit` 통과
   284	- 선행 조건: 01/08 마이그레이션에 기존 거래처 정의의 노출 행 백필 문장이 있다(Task 2 `<precondition>`)
   285	- 금지 파일(`project.ts`·`dto-registry.ts`·`seed/index.ts`·`info-items.ts`) diff 없음(`seed/index.ts`는 이 플랜 시작 커밋 기준)
   286	- `package.json` 의존성 객체·`pnpm-lock.yaml` 변경 없음
   287	</verification>
   288	
   289	<success_criteria>
   290	- 새 칸이 노출표 열로 올라오고 계급별로 끌 수 있다
   291	- 끈 칸의 값이 그 계급의 DTO·화면·누수 스캔에 없다
   292	- 나중에 만든 계급이 기본 보임 행을 받고, 시드는 끈 칸을 되살리지 않는다
   293	</success_criteria>
   294	
   295	## Artifacts this phase produces
   296	
   297	| 종류 | 이름 / 경로 |
   298	|---|---|
   299	| 함수(신규, domain) | `customFieldColumns` · `isAssignableInfoItem` · `visibleCustomFieldKeys` · `grantCustomFieldsToRole` · `pickVisibleCustomFields`(`domain/custom-fields/visibility.ts`) |
   300	| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행 · 실패 시 1회 재시도 → 경고 로그, `RoleWriteDeps.grantCustomFieldsToRole` 주입 지점) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
14:// 타입만 쓰는 import(`import type ...`)는 컴파일에서 지워져 런타임 순환이
49:// `import type ... from "x"` / `export type ... from "x"`는 건너뛰고 나머지
67:  const cycles: string[][] = [];
72:      if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
79:  return cycles;
88:    const rendered = findCycles().map((cycle) => cycle.map((p) => p.replace(`${ROOT}/`, "")).join(" -> "));
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
   239	// 없으므로 같은 정규화 이름의 기존 행을 미nl: write error: Broken pipe
리 찾아 duplicateCount로 돌려주되
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

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '211,260p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '222,245p'; nl -ba repositories/field-definitions.ts; nl -ba domain/permissions/visible.ts; rg -n 'T-04.5-44' .planning/phases/04.5-custom-field-admin; cat docs/reviews/phase-04.5/codex-plan-review-final-4.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   211	    - (노출 행 없는 정의) 정의만 있고 노출 행이 하나도 없는 거래처 칸(백필 전 상태)은 시스템 관리자에게도 입력 칸이 아니다 — 그 키를 새 값과 함께 보내도 거부하지 않고 제출값을 버리며, 저장값은 되살리기로 남는다
   212	    - (필수 · 나중에 생긴 칸) 거래처를 만든 뒤 필수 칸 C를 추가한다. 다른 칸만 고쳐 수정 저장(C는 빈 문자열)하면 성공하고 C 키는 없다. 같은 거래처에서 C에 값을 넣어 저장한 뒤 C를 빈 문자열로 저장하면 `CustomFieldsInvalidError` `{ C: "필수 칸이 비어 있습니다 · 값 입력" }`
   213	    - (필수 · 등록) C가 빈 등록은 `CustomFieldsInvalidError`이고 거래처 행이 생기지 않는다
   214	    - (보관 선택지) 선택형 D의 저장값 「구형」을, 픽스처가 `options`에서 빼고 `archived_options`에 넣어(02의 수정 기능을 부르지 않는다 — 02는 이 플랜의 depends_on 밖) 보관한 뒤 「구형」 그대로 저장하면 값 유지. 다른 보관 선택지로 바꾸면 D에 보관 선택지 문구
   215	    - (Phase 3 픽스처) `test/integration/custom-fields.test.ts`의 거래처 정의 세 테스트가 노출 행을 명시로 넣은 뒤 초록이다 — 「등록된 키만 저장」은 값이 저장되고, 「등록되지 않은 키」는 `UnknownCustomFieldKeyError`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다
   216	    - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   217	  </behavior>
   218	  <action>
   219	① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다.
   220	
   221	② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
   222	
   223	③ `repositories/vendors.ts`(Phase 4 브랜치 diff 없음 — 계획 때 확인):
   224	- `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
   225	- 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
   226	- `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
   227	
   228	④ `domain/vendors/index.ts`:
   229	- 파일 안 함수 `vendorInputFieldKeys(viewer)`를 둔다. `visible(viewer, "vendor.value")`가 거짓이면 빈 집합이고, 아니면 03의 `visibleCustomFieldKeys(viewer, VENDOR_ENTITY)`다.
   230	- `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
   231	- 입력 칸 정의 = `repoListFieldDefinitions(viewer, VENDOR_ENTITY)`(호출 모양 그대로) 중 입력 칸 집합에 있는 정의(칸 정렬 순서 그대로, `archived_options`·`label` 포함). `knownKeys` = 같은 조회 결과 **전체**의 키(입력 칸 집합으로 거르기 전)다. `listFieldDefinitions`는 `entity` 조건만 걸어 보관 칸·노출 행 없는 칸까지 돌려주므로(`repositories/field-definitions.ts` 9–15행 — 01은 끝에 선택 `tx`만 더하고 조건·정렬은 01·08 모두 바꾸지 않는다. `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로다) 추가 조회가 없다. 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. 둘 다 거래처 행과 무관하므로 트랜잭션 **전에** 계산하고, `createVendor`·`updateVendor`가 `resolveCustomFieldsWrite`에 함께 넘긴다.
   232	- `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
   233	- `updateVendor`:
   234	  - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
   235	  - `input.customFields !== undefined`이면: 입력 칸 정의를 계산한 뒤 `withTransaction(async (tx) => …)` 안에서 `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   236	  - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   237	  - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   238	  - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
   239	  - 잠금은 순수 판정과 UPDATE 한 번 동안만 잡힌다. 정의·노출 조회는 트랜잭션 전이라, 트랜잭션 안에서 전역 `db` 연결을 하나 더 잡지 않는다.
   240	- **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
   241	
   242	⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
   243	
   244	⑥ `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체를 한 번 돌려 거래처·견적 줄·프로젝트 회귀를 확인한다.
   245	  </action>
   246	  <verify>
   247	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
   248	    <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
   249	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
   250	    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>
   251	    <automated>flock /tmp/plant8-erp-test.lock pnpm test:integration</automated>
   252	    <fails_when>통합 전체 failed 개수가 1 이상이다 — 거래처·견적 줄·프로젝트 등 다른 통합 테스트가 트랜잭션 도입·쓰기 판정으로 회귀하면 빨간색이다</fails_when>
   253	  </verify>
   254	  <acceptance_criteria>
   255	    - `grep -v '^\s*//' repositories/vendors.ts | grep -c 'for("update")'`가 1이다(행 잠금 조회 하나)
   256	    - `grep -v '^\s*//' domain/vendors/index.ts | grep -c "findVendorByIdForUpdate"`가 1 이상이고 같은 파일에 `withTransaction`이 있다
   257	    - `git diff origin/main -- test/unit/vendors/update-archived.test.ts test/integration/quote-lines.test.ts`가 비어 있다
   258	    - `git diff origin/main -- domain/projects domain/quotes domain/custom-fields/build-schema.ts domain/permissions/project.ts domain/permissions/dto-registry.ts`가 비어 있다
   259	    - `repositories/field-definitions.ts`의 `listFieldDefinitions`(`where`·`orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key)` 줄과 01이 더한 선택 `tx`까지의 시그니처)가 이 플랜에서 바뀌지 않았다
   260	    - `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체가 초록이다(SUMMARY에 통과 개수 요약)
   222	    - (통합, 누수 스캔) 결정적 생성기가 (활성 칸 × 시드 계급) 케이스를 만들고, 각 케이스에서 그 계급에 `vendor.value` 보임 행을 켠 상태로 **끄기 전** 거래처 DTO 직렬화에 두 칸 값이 **있음**을 먼저 단언한 뒤, 그 칸을 끄면 그 칸의 값 문자열이 **없고** 다른 칸 값은 남는다(`vendor.value`가 꺼진 계급은 DTO 전체가 비어 헛되이 통과하므로 사전 양성 단언으로 막는다)
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
   241	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts test/integration/vendors.test.ts test/integration/custom-fields.test.ts</automated>
   242	    <fails_when>통합 failed 개수가 1 이상이다 — 칸별 거르기·노출 행 없는 정의의 기본 숨김·폼 정의 거르기·누수 스캔 커스텀 축, 또는 기존 거래처·커스텀 필드 테스트 회귀</fails_when>
   243	    <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts</automated>
   244	    <fails_when>playwright failed 개수가 1 이상이다 — 끈 칸의 이름·값이 거래처 화면 HTML에 남았거나, 다시 켠 값이 안 보이거나, 기존 거래처 화면 회귀</fails_when>
   245	  </verify>
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
    66	}
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
.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:325:| T-04.5-44 | Tampering | 정의·노출 조회(tx 밖, Task 2 action ④ — L231·L239)와 tx 안 쓰기 사이 TOCTOU | low | accept | 정의 변경은 거래처 행을 건드리지 않아 결과가 「저장이 변경 직전에 커밋된」 직렬 순서와 같다 — 조이는 변경(보관·끔·필수)은 옛 정의로 한 번 쓰이고, 되살리기(Task 1 behavior 「되살리기」)와 03의 읽기 경로 칸별 판정(03 Task 2 `pickVisibleCustomFields`)이 그 값을 보존·숨긴다. 푸는 변경은 저장 거부(재시도)로 끝난다(eng review C-1 · T2) |
codex
| 이전 지적 | 상태 | 현재 계획의 근거 |
|---|---|---|
| final: 칸·계급 동시 생성 시 노출 누락 | RESOLVED | 01 Task 1③④·03 Task 1②: 동일 잠금 뒤 같은 `tx`로 목록 조회·삽입 |
| final: 선택형 수정 최소 선택지 검증 누락 | RESOLVED | 02 Task 2④·behavior: 저장된 타입 기준 빈 배열·생략 거부, 행·버전·로그 불변 검사 |
| final: 수정 성공 결과 소실 | RESOLVED | 02 Task 2⑥: 바깥 액션 상태 유지, 본문만 `key={version}` |
| final: E2E 필수 칸의 일시적 공개 | RESOLVED | 06 Task 1④: 생성 트랜잭션부터 전용 계급만 노출 |
| final: 오래 열린 거래처 폼 저장 실패 | RESOLVED | 05 Task 1②·Task 2④: 존재하지만 입력 대상 밖인 키는 버리고 저장값 유지 |
| final: 생산·소비 심볼 불일치 | RESOLVED | 02 Task 2④: 목록 기반 이름 조회. 06 Task 1④: 생성 후 `version` 재조회 |
| final: Phase 4 브랜치 미대조 | RESOLVED | ref `15bdf48` 대조 완료. `project.ts:73` 호출 계약 및 `repositories/field-definitions.ts:9`의 두 인자 호출 유지 가능 |
| final-2: 잠금 보유 중 별도 연결 조회 | RESOLVED | 01 Task 1③④·03 Task 1②: 운영 경로에 선택 `tx` 전달, 풀 크기 동시 호출 검사 |
| final-2: 200ms 경합 테스트 | RESOLVED | 03 Task 1 behavior: `defsRead` 또는 실제 advisory-lock 대기 관측 |
| final-2: 입력 초기화 컴포넌트 경계 모순 | RESOLVED | 02 Task 2⑥·Task 3③: 별도 본문 컴포넌트에 선택지 상태 배치 |
| final-3: 공유 잠금 함수의 린트 위반 | RESOLVED | 01 Task 1③·03 Task 1②: `lockCustomFieldGrants(viewer, tx)`로 통일 |
| final-3: 새 계급 생성이 E2E 격리 단언을 깨뜨림 | RESOLVED | 06 Task 1④: 전체 행 수 단언 제거, 전용 계급 보임·시드 계급 행 부재 검사. 여정 계급도 repository로 생성 |
| final-3: 거래처 저장 픽스처의 필수 `id` 누락 | RESOLVED | 05 Task 2②: `id: randomUUID()` 명시 |
| final-3: 누수 스캔의 상위 차단으로 인한 공허한 통과 | RESOLVED | 03 Task 2④: `vendor.value` 활성화 후 값 존재→칸 차단 후 부재 검사 |
| final-3: 셸 경로 인용부호 누락 | RESOLVED | 03 Task 1 acceptance: `"app/(app)/admin/permissions"`로 수정 |

`01` 등은 `.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md`를 뜻합니다. 상태는 **계획 수정 여부** 기준입니다. 9개 계획과 상위 계약·현재 코드·Phase 4 ref를 대조했으며, 파일 수정과 DB·E2E 실행은 하지 않았습니다.

- **[MINOR] 복원 안내 링크가 404로 연결될 수 있음** — **근거:** `04.5-08-PLAN.md` Task 2②④는 두 메뉴의 **write**만으로 링크를 표시한다. 실제 보관함 페이지는 별도로 **view**를 요구한다(`app/(app)/admin/archive/page.tsx:15`). 권한은 동작별 독립 조회다(`domain/permissions/can.ts:27`). 승인 UI-SPEC O22도 view를 요구한다. — **수정:** 두 쓰기 권한에 `admin.archive` view도 AND로 추가하고, write만 있는 경우 링크가 없는 테스트를 넣는다.

- **[MINOR] E2E 주입 함수가 동일 연결 규칙을 다시 벗어남** — **근거:** `04.5-06-PLAN.md` Task 1④는 잠금 안에서 호출되는 계급 목록 dep에 `findRoleById` 조회를 넣는다. 해당 함수는 전역 `db`를 사용한다(`repositories/roles.ts:19–21`). 운영 경로의 수정은 유효하지만 테스트 픽스처에는 추가 연결 의존이 남는다. — **수정:** 생성 함수를 부르기 전에 전용 계급을 조회하고, dep는 확보한 행 배열만 반환하게 한다.

- **[MINOR] CSS 수용 기준이 요구한 구분선을 거부함** — **근거:** `04.5-06-PLAN.md` Task 1③(b)는 `border-top: 1px solid var(--line)`을 요구하면서 같은 Task acceptance는 새 px 리터럴이 없고 값이 전부 `var(--…)`일 것을 요구한다. — **수정:** 승인 UI-SPEC의 `1px` 구분선 두께를 명시적 예외로 둔다.

- **[NOTE] 한 세션 범위가 여전히 큼** — **근거:** 02·04·05·06·07의 `estimate`가 각각 10만~12만 토큰이며 모두 「한 세션에 플랜 하나」다. 특히 07은 여정·독립 감사·수정·병합·마이그레이션 재생성·전체 게이트를 묶는다. — **수정:** 최소한 07의 감사와 병합 검증을 별도 실행 단위로 나누고 산출물·검증 계약을 유지한다.

판정: 막는 문제 없음
tokens used

codex
T1의 주입·타입·재시도 테스트는 기존 코드 구조에서 구현 가능합니다. T2는 정의 변경과 저장 둘만 비교하면 설명이 성립하지만, 그 사이 다른 거래처 저장까지 끼면 같은 직렬 순서로 설명할 수 없는 경우가 있어 값 보존 계약과 대조하고 있습니다.

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '148,174p;199,211p'; nl -ba repositories/vendors.ts | sed -n '100,175p'; nl -ba test/unit/import-cycles.test.ts | sed -n '45,64p'; rg -n 'C-1|T2|TOCTOU|B-2' docs/designs/plant8-erp-phase04.5-eng-review-260925.md; nl -ba lib/db-transaction.ts" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   148	    - (없는 키) `submitted`에 `knownKeys` 밖 키가 하나라도 있으면(값이 빈 문자열이어도) `UnknownCustomFieldKeyError`를 던지고, 메시지는 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」
   149	    - (입력 밖 존재 키 — E4 stale·hidden) `knownKeys` 안·`inputDefs` 밖 키는 값과 함께 와도 오류가 없다. 그 제출값은 버린다 — 결과의 그 키는 저장값 그대로(저장값이 없으면 결과에 없음, 등록이면 결과에 없음)이고, 필수·보관 선택지·타입 판정에 쓰이지 않는다. 같은 제출의 입력 칸 값은 그대로 반영된다
   150	    - (빈 값) `undefined`·`null`·공백만인 문자열은 빈 값이다. `0`과 `"0"`은 빈 값이 아니다
   151	    - (필수 · 등록) 필수 텍스트 칸이 비면 그 키에 「필수 칸이 비어 있습니다 · 값 입력」, 필수 선택형이 비면 「필수 칸이 비어 있습니다 · 선택지 고르기」
   152	    - (필수 · 수정) 저장값도 비고 제출도 비면 오류가 없고 결과에 그 키가 없다 · 저장값이 있는데 제출이 빈 문자열이면 위와 같은 막힘 문구 · 필수 칸의 키가 제출에 아예 없으면 저장값 그대로(막지 않는다)
   153	    - (필수 아님 · 수정) 제출이 빈 문자열이면 결과에서 그 키가 빠진다(비움) · 키가 없으면 저장값 그대로
   154	    - (보관 선택지) 저장값 「구형」이 `archivedOptions`에 있고 제출도 「구형」이면 통과하고 값 유지 · 제출이 다른 보관 선택지 「폐기」면 그 키에 「보관된 선택지입니다 · 다른 선택지 고르기」 · 등록에서 보관 선택지를 보내도 같은 문구 · 저장값이 활성 선택지면 보관 선택지를 새로 고를 수 없다
   155	    - (타입) 숫자 칸에 「abc」면 그 키에 기존 한국어 한 줄(`koreanZodErrorMessage` 결과) · 선택형에 없는 값이면 기존 「허용되지 않은 값입니다 · … 중에서 선택해 주세요」 · 통과한 값은 기존 검증기가 바꾼 모양 그대로(숫자는 number, 날짜는 기존 `z.coerce.date()` 결과)
   156	    - (여러 칸) 오류가 여럿이면 `CustomFieldsInvalidError.fieldErrors`가 `inputDefs` 순서대로 모든 키를 담는다. 한 칸에는 메시지 하나만 둔다(필수 막힘 → 보관 선택지 → 타입 순으로 첫 것)
   157	    - (되살리기) `stored`에서 `inputDefs` 밖 키(보관 칸·끈 칸·정의가 없어진 키)는 결과에 그대로 들어간다. 입력 칸 값과 합친 새 객체를 돌려주고 인자 객체는 바꾸지 않는다
   158	  </behavior>
   159	  <action>
   160	① RED 먼저. behavior를 표 주도 단위 테스트로 쓰고 빨간 것을 확인한다.
   161	
   162	② `domain/custom-fields/preserve.ts`(순수 — DB·세션·서버 전용 표시 모듈 import 없음):
   163	- 오류 클래스 두 개를 둔다. 둘 다 `UserFacingError` 하위다.
   164	  - `CustomFieldsInvalidError`: `fieldErrors: Record<string, string>`(키 → 메시지 한 줄)를 갖고, `message`는 첫 칸 메시지다. `message`는 액션이 잡지 못했을 때의 폴백이다.
   165	  - `UnknownCustomFieldKeyError`: 메시지는 위 기존 일반 문구다.
   166	- 필수 막힘·보관 선택지 문구는 파일 안 상수로 둔다. 문자열은 UI-SPEC Copywriting 원문 그대로다.
   167	- `resolveCustomFieldsWrite(input)`는 behavior 순서대로 판정한다. 순서는 없는 키(`knownKeys` 밖 → 거부) → 입력 밖 존재 키(`knownKeys` 안·`inputDefs` 밖 → 제출에서 버림) → 칸마다(필수 판정 표 → 보관 선택지) → 타입 검증 → 되살리기다. 버림은 판정 전에 제출 사본에서 그 키를 빼는 것이라 뒤 단계는 `inputDefs` 키만 본다.
   168	- 타입 검증은 기존 `buildCustomFieldsSchema`를 그대로 부른다.
   169	  - 정의는 제출이 비지 않은 입력 칸만 넘기고 `required: false`다. 필수는 이미 위에서 판정했다.
   170	  - 선택형 선택지는 `options`에 `stored[key]`를 더한다. 저장값이 `archivedOptions`에 있을 때만 더한다.
   171	  - `safeParse`의 이슈를 `path[0]`별로 모아, 그 칸 이슈만 담은 ZodError로 `koreanZodErrorMessage`를 부른다.
   172	- 검증기·Phase 4 경로는 바꾸지 않는다. 거래처 경로 어댑터가 이 파일 안에 있다(UI-SPEC O11).
   173	
   174	③ 결과 모양은 `Record<string, unknown>` 새 객체다. 수정 모드의 합치기 규칙:
   199	    - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
   200	    - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
   201	    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`)
   202	    - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   203	  </read_first>
   204	  <behavior>
   205	    - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
   206	    - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
   207	    - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
   208	    - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
   209	    - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
   210	    - (없는 키 — 거부) 누구든 어떤 거래처 정의에도 없는 키를 보내면(값이 빈 문자열이어도, 다른 칸 수정과 함께여도) `UnknownCustomFieldKeyError`이고 DB는 그대로다(행 `updated_at` 불변, 행동 로그 없음)
   211	    - (노출 행 없는 정의) 정의만 있고 노출 행이 하나도 없는 거래처 칸(백필 전 상태)은 시스템 관리자에게도 입력 칸이 아니다 — 그 키를 새 값과 함께 보내도 거부하지 않고 제출값을 버리며, 저장값은 되살리기로 남는다
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
