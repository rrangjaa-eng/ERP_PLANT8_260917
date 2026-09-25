# Phase 04.5 — Codex final-3 판정 (Fable, 읽기 전용)

대상: `docs/reviews/phase-04.5/codex-plan-review-final-3.md`. 인용된 코드·플랜 줄을 직접 확인했다. 파일은 고치지 않았다.

## 1. [MAJOR] `lockCustomFieldGrants(tx)`가 `repository-viewer-param` 린트 위반 — **사실. 판정: MINOR fix(교정 필수, 한 줄 시그니처)**

인용 검증
- `eslint/rules/repository-viewer-param.mjs:29–34`: `repositories/` 경로의 모든 `export` 함수 선언·화살표 함수의 `params[0]`이 식별자 `viewer`가 아니면 report. 예외 없음. `eslint.config.mjs:77` `"plant8/repository-viewer-param": "error"`. 맞음.
- 01 T1③(184행) 「`lockCustomFieldGrants(tx: DbOrTx)`」 · 01 37·75·186·206·271·301행 · 03 30·74·172·195·272행 전부 `lockCustomFieldGrants(tx)` 모양. 첫 인자가 `viewer`가 아니므로 `pnpm lint`가 빨갛다. 맞음.
- 같은 파일의 선례는 전부 `(viewer, …, tx: DbOrTx = db)` 모양(`repositories/quote-lines.ts:23`). 잠금 함수만 `viewer`를 빼는 것은 규칙의 취지(모든 repository 진입점이 viewer를 받는다)에도 어긋난다. `eslint-disable`은 답이 아니다.

BLOCKER가 아닌 이유: 실행자가 lint에서 즉시 발견하고 고칠 수 있는 기계적 오류. 다만 플랜 두 개가 호출 모양을 여러 번 못 박고 있어 실행 전 문구를 맞춰야 SUMMARY·검증 grep이 어긋나지 않는다.

정확한 최소 수정
1. **01 T1③** 184행: 「`lockCustomFieldGrants(tx: DbOrTx)`」 → 「`lockCustomFieldGrants(viewer: Viewer, tx: DbOrTx)`(`viewer`는 `plant8/repository-viewer-param` 때문에 첫 인자로 받기만 하고 쓰지 않는다 — 다른 repository 함수와 같은 모양)」. 기본값 `= db`는 두지 않는다(잠금은 트랜잭션 안에서만 의미가 있다).
2. **01** 37·75·186·206·271행, **03** 30·74·172·195·272행: `lockCustomFieldGrants(tx)` → `lockCustomFieldGrants(viewer, tx)`. 03 74행 `pattern: "lockCustomFieldGrants"`와 03 195행 「`lockCustomFieldGrants(`가 `listFieldDefinitions(`보다 먼저」는 함수명 기준이라 그대로 통과한다.
3. **01 T1 acceptance** 206행 「`lockCustomFieldGrants(tx)`가 첫 await」 → 「`lockCustomFieldGrants(viewer, tx)`가 첫 await」. 추가 검증은 `pnpm lint`가 이미 덮는다.

## 2. [MAJOR] 다른 워커의 계급 생성이 06 「노출 행 = 1」 단언·격리를 깨뜨림 — **절반 사실. 판정: MINOR fix(단언을 좁히고 전용 계급을 리포지토리 `insertRole`로 만든다). 별도 Playwright 실행(프로세스 격리)은 채택하지 않는다**

인용 검증
- 06 162행: 「`listVisibility(SYSTEM_VIEWER)`에서 `infoItem`이 `cf.vendor.<key>`인 행이 **정확히 1개**」, 185행 같은 단언. 맞음.
- 03 T1⑤(178행): `domain/permissions/roles.ts`의 `createRole`이 `repoInsertRole` 뒤 `grantCustomFieldsToRole` → 03 ②: 대상 상수 안의 **모든 정의(보관 포함)**에 보임 행. 맞음.
- `playwright.config.ts:48` `fullyParallel: false`이지만 `workers` 미지정 → 파일 단위로 여러 워커가 `erp_test` 하나를 나눠 쓴다(설정 주석 「함정 6」·06 98행도 같은 인식). 맞음.
- 계급을 만드는 기존 스펙 — 두 갈래다. Codex가 이 구분을 놓쳤다:
  - **UI로(→ domain `createRole` → 03의 grant가 돈다)**: `roles.spec.ts:25·39·43`, `admin-master-list-first.spec.ts:164`, `single-column.spec.ts:152` 근방. 이 스펙들은 만든 계급으로 **로그인하지 않고** 거래처 폼도 열지 않는다.
  - **리포지토리 `insertRole`로(→ grant가 돌지 않는다)**: `vendors.spec.ts:72`, `permissions-grid.spec.ts:27·117`, `code-tables-write-gate.spec.ts:18`. 이 계급의 사용자가 하는 일은 목록 조회·404 확인뿐, 거래처 등록·수정 없음.
  - 거래처를 등록·수정하는 스펙(`vendors.spec.ts:17·130·192`, `vendor-edit.spec.ts:23`, `mobile-vendors.spec.ts:12`, `admin-master-list-first.spec.ts:43`)은 전부 **시스템 관리자**로 한다. 06의 칸은 시스템 관리자에게 행이 없으므로 안전하다(06 98행의 격리 논리는 그대로 유효).

따라서
- **단언 결함(사실)**: UI 계급 생성 스펙이 06 칸 커밋과 `listVisibility` 사이에 계급을 커밋하면 행이 2개가 되어 06 픽스처가 던진다. 창은 ms 단위라 드물지만 존재한다. 그리고 「정확히 1」은 애초에 필요 이상의 주장이다 — 나중에 만든 계급이 행을 받는 것은 03의 **의도된** 동작이지 격리 위반이 아니다.
- **격리 결함(Codex가 말한 기존 스펙에는 없음, 그러나 07에 있음)**: 07 Task 1(158행)은 06의 `createE2EVendorEditor()`로 전용 계급을 만들고 **그 사용자로 거래처 수정을 저장**한다. 06 ④ 153행은 이 픽스처가 「domain 계급 생성 함수」를 부르므로 03의 grant가 돌고, 06 스펙이 같은 시각에 살아 있으면(06 칸은 `afterAll` 보관까지 스펙 내내 존재) 07의 계급에 06의 **필수** 칸 보임 행이 생긴다 → 05의 필수 판정은 보이는 칸에만 적용(06 98행)되므로 07 사용자의 수정 폼에 빈 필수 칸이 뜨고 06이 더한 칸 오류가 제출을 막는다 → 07 여정이 빨갛다. 이 창은 06 스펙 전체 길이라 ms 창이 아니다. Codex의 「07도 전용 계급을 만든다」 지적은 맞지만 왜 위험한지(사용자로 저장한다)는 짚지 않았다.

프로세스 격리를 거부하는 이유: 별도 Playwright 실행은 07 전체 게이트·CI 명령·`mobile-375` 의존 순서를 전부 건드리고, 근본 원인(전용 계급이 03의 전 칸 부여를 받는 것)은 그대로 둔다. 원인을 없애는 편이 두 줄이다.

정확한 최소 수정
1. **06 T1④** 153행(`createE2EVendorEditor`): 「domain 계급 생성 함수를 `SYSTEM_VIEWER`로 부른다」 → 「`repositories/roles.ts`의 `insertRole(SYSTEM_VIEWER, { id: \`role-e2e-${randomUUID()}\`, name, sortOrder: 99 })`로 넣는다(`vendors.spec.ts:72`·`permissions-grid.spec.ts:27` 선례). domain `createRole`을 부르지 않는다 — 그러면 03의 grant가 돌아 같은 시각 다른 워커 스펙이 만든 필수 칸의 보임 행까지 이 계급에 생기고, 그 사용자의 거래처 저장이 05의 필수 판정에 막힌다」. 07은 이 픽스처를 **칸을 만들기 전에** 부르면 01의 생성 경로(잠금 뒤 `listRoles(includeArchived: true)`)가 이 계급에 행을 주므로 03의 grant가 필요 없다.
2. **06 T1④** 162행 단언: 「`cf.vendor.<key>` 행이 정확히 1개」 → 「`cf.vendor.<key>` 행 중 `roleId === onlyRoleId`인 행이 있고 `visible === true`이며, `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID` 행은 없다(주입이 무시되면 01이 그 순간의 전 계급에 행을 써 시드 계급에도 생기므로 이 둘의 부재가 곧 주입 증명이다. 다른 워커가 뒤에 만드는 계급이 03으로 행을 받는 것은 의도된 동작이라 세지 않는다)」. 185행 acceptance도 같은 문구로. 시드 계급만 보는 이유: 스냅샷 방식(생성 전 `listRoles` 목록의 계급에 행 없음)은 방금 삽입되고 grant가 아직 도는 계급이 스냅샷에 들어와 거짓 실패를 내는 창이 남는다. 시드 계급은 globalSetup에서 만들어져 grant가 다시 돌 일이 없다.
3. **07 T1 behavior** 158행 첫 문장: 「전용 계급은 06의 `createE2EVendorEditor()`로 만든다」에 「**칸을 추가하기 전에** 만든다(그래야 01의 생성 경로가 이 계급에 보임 행을 주고 노출표 셀이 켜진 상태로 시작한다 — 픽스처는 `insertRole`이라 03의 grant가 돌지 않는다)」를 더한다. 155행 순서 문장은 그대로여도 되지만 첫 단계에 픽스처 호출을 명시하면 실행자가 헷갈리지 않는다.
4. Codex의 「생성 직후 계급을 추가하는 재현 검사」는 두지 않는다 — 좁힌 단언 아래에서는 그 시나리오가 통과해야 맞고, 이미 03 T1 통합 테스트(162행)가 「칸 커밋 뒤 만든 계급이 행을 받는다」를 고정한다.

부수 관찰(Codex 밖, 실행 시 주의): 07 여정의 칸은 관리 화면으로 만들어 **전 계급 보임**이다. 07 ②에 「필수 체크는 끈다」를 한 줄 두면 같은 시각 시스템 관리자로 등록하는 `vendors.spec.ts` 등이 막힐 일이 없다(현재 behavior에 required 언급이 없어 기본값 그대로일 가능성이 높지만 명시가 안전하다). 03 ⑦ E2E·01 E2E도 같은 원칙.

## 3. [MINOR] 05 T2② 픽스처에 필수 `id` 없음 — **사실. 판정: MINOR fix**

`repositories/field-definitions.ts:22–25`: `input.id: string` 필수, 자동 생성 없음. 01 T1③은 `insertFieldDefinition`에 `label`·`tx`만 더하고 `id` 필수는 유지(01 186행 호출도 `id: randomUUID()`를 넘긴다). 05 221행 호출 객체 `{ entity, key, label, type, options?, required, sortOrder }`에 `id` 없음 → typecheck 실패. 맞음.

정확한 최소 수정 — **05 T2②** 221행: `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", … })`. `test/integration/quote-lines.test.ts:80–90` 선례와 같은 모양.

## 4. [MINOR] 03 T2④ 누수 스캔이 `vendor.value` 없는 계급에서 헛되이 통과 — **사실. 판정: MINOR fix**

- `domain/vendors/index.ts:50–60`: `VENDOR_DTO_SPEC`의 모든 칸(`customFields` 포함)이 `infoItem: "vendor.value"`. `vendor.value`가 꺼진 계급은 DTO 전체가 비어 커스텀 칸을 끄든 말든 값 문자열이 없다.
- `domain/seed/index.ts:165–178`: `vendor.value` 보임 행은 `SYSADMIN_ROLE_ID`(true)·`DEFAULT_ROLE_ID`(`staffDefault` true)에만. `SEED_ROLES`(`domain/permissions/roles.ts:23–27`) 5개 중 `role-ceo`·`role-division-head`·`role-team-lead`는 행이 없어 숨김 → 그 3계급 × 칸 케이스는 상위 차단으로 헛되이 통과. 03 230행은 `admin.vendors` 보기만 켠다. 맞음.

정확한 최소 수정 — **03 T2④** 230행: 「케이스마다 그 계급에 `admin.vendors` 보기를 켜고」 → 「케이스마다 그 계급에 `admin.vendors` 보기와 `vendor.value` 보임 행(`upsertVisibility`)을 켜고, **먼저** `listVendors` 직렬화에 두 칸 값이 있음을 단언한 뒤 그 칸만 끄고 그 값만 사라지고 다른 칸 값은 남아 있음을 단언한다」. 03 behavior 16행(216행 근방)에도 「끄기 전 값 존재 → 끈 뒤 부재」 한 구절. Codex의 「재활성 후 복귀」 단계는 선택 — 상위 차단 헛통과를 없애는 데는 사전 양성 단언이면 충분하다. 시드 `vendor.value` 행은 만들지 않는다(`domain/seed` diff 0 유지 — 03 197행).

## 5. [MINOR] 03 T1 acceptance 셸 명령의 `app/(app)/admin/permissions` 미인용 — **사실이나 실행 명령이 아님. 판정: MINOR fix(한 글자 단위)**

03 197행은 `<acceptance>` 산문 불릿이고 `<automated>` 블록에는 미인용 `app/(app)` 경로가 없다(grep 확인). 사람이 그대로 붙여 넣으면 Bash 괄호 구문 오류가 나므로 고칠 가치는 있다.

정확한 최소 수정 — **03 T1 acceptance** 197행: `"app/(app)/admin/permissions"`로 감싼다. 07 312행의 `<automated>`는 이미 `"app/(app)/admin/archive/actions.ts"`로 인용돼 있어 그 모양과 맞는다.

## 총평

BLOCKER 0 · MINOR fix 5(전부 실행 전 플랜 문구 교정). Codex가 MAJOR로 올린 둘 중 #1은 기계적 시그니처 오류, #2는 진짜 결함이 있으나 지목한 곳(기존 스펙)이 아니라 07의 전용 계급 사용자 저장 경로에 있고, 고침은 프로세스 격리가 아니라 「전용 계급을 `insertRole`로 + 단언을 시드 계급 부재로 좁힘 + 07은 칸보다 계급을 먼저」다. 실행 순서·게이트 명령은 바꾸지 않는다.
