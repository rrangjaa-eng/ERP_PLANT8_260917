# Codex 계획 리뷰 1차 근거 확인 (04.5-custom-field-admin)

모든 판정은 1차 검토(증거 확인) 기준. 코드/계획 수정 없음.

## 1. 칸·계급 동시 생성 시 노출 행 누락 — **CONFIRMED**

- `.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:226`(Task 1④ 본문):
  `createFieldDefinition(viewer, ...)`: "계급 목록(`repositories/roles.ts`의 `listRoles(viewer, { includeArchived: true })`)을 **트랜잭션 전에 읽음** → 키 생성 → `withTransaction` 안에서 ... 계급마다 `insertVisibilityIfAbsent(...)`"
  → roles 목록 조회가 트랜잭션 시작보다 먼저 일어난다. 이 시점 이후 새로 생긴 role은 이 루프에 포함되지 않는다.
- `.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:172`(Task 1⑤):
  `createRole`: "`repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)`" — role INSERT **후** field definitions를 읽는다(`04.5-03-PLAN.md:166`의 `grantCustomFieldsToRole`이 `listFieldDefinitions`로 대상 상수 안 정의를 읽음).
- 두 계획 어디에도 advisory lock, 공유 트랜잭션, `SELECT … FOR UPDATE` 언급이 없다. `04.5-03-PLAN.md:112`의 "트랜잭션·행 잠금을 쓰지 않는다"는 02(버전 조건부 수정) 문맥이고 이 경합과 무관.
- 실제 리포지토리 확인:
  - `repositories/roles.ts:10-16` `listRoles`는 매개변수 `tx` 자체가 없고 항상 전역 `db`로 조회(트랜잭션 인지 불가).
  - `repositories/field-definitions.ts:9-15` `listFieldDefinitions`도 동일 — `tx` 없이 전역 `db`.
- 교차 순서(필드 생성이 roles를 읽은 직후 새 role INSERT가 커밋되고, 그 role의 `grantCustomFieldsToRole`이 필드 생성의 `insertFieldDefinition` 커밋보다 먼저 field definitions를 읽는 경우) 양쪽 모두 상대를 놓친다 — Codex 주장과 정확히 일치.
- 시드/백필: `04.5-01-PLAN.md` Task 2가 "기존 거래처 칸의 노출 행 채움"(마이그레이션 1회성 SQL)을 명시하지만, 이는 배포 시 1회 실행되는 마이그레이션이지 런타임 경합을 복구하는 장치가 아니다. 런타임에 누락된 행을 나중에 채우는 매커니즘은 어느 계획에도 없다.
- **경합 재현 테스트**: 두 플랜의 통합 테스트 목록(각 Task의 `<behavior>`)에 "동시" "concurrent" "race" 케이스가 없다 — 순차 실행 케이스만 있음.

## 2. 선택형 수정의 서버 최소 선택지 검증 누락 — **CONFIRMED**

- `domain/custom-fields/build-schema.ts:29`: `case "select": return z.enum((def.options ?? []) as [string, ...string[]]);` — `options`가 빈 배열이면 `z.enum([])`가 되어(타입 강제 캐스트로 컴파일은 통과하지만) 빈 enum은 어떤 입력도 못 받거나 zod가 예외를 던진다. 즉 빈 배열 저장은 이 기존 검증기를 깨뜨린다는 Codex 주장이 코드로 확인됨.
- `04.5-02-PLAN.md:198`(Task 2②, `updateFieldDefinitionInput`): "선택지는 생성과 같은 **원소** 규칙"(각 1~40자, 중복 없음, 최대 30개)만 명시. 생성 스키마(`04.5-02-PLAN.md:153`, Task 1③)의 "선택형이면 1개 이상, 아니면 비어 있어야 한다"는 **타입이 입력에 함께 오는** 생성 전용 규칙이다.
- 수정 입력에는 `type`이 없다(`04.5-02-PLAN.md:34`: "수정 입력 스키마(`.strict()`)에 `type`·`entity`가 없고"). 따라서 "선택형이면 최소 1개"를 판정하려면 **DB에서 읽은 기존 행의 type**과 대조해야 하는데,
- `04.5-02-PLAN.md:202`(Task 2④ `updateFieldDefinition` 처리 순서): "권한 → 행 읽기 → 대상 밖 → 보관 → 버전 → 이름 예약 → **선택형이 아닌 칸에 선택지가 오면 거부** → `updateFieldDefinitionIfVersion`" — 이 판정은 "선택형인데 선택지가 없거나 비었을 때 거부"의 **반대 방향**만 다룬다. "선택형인데 활성 선택지 0개(제출 `[]` 또는 생략)"를 거부하는 문장이 없다.
- Task 3(`04.5-02-PLAN.md:243`)의 보관 파생 로직도 제출된 활성 배열을 그대로 받아 `deriveArchivedOptions`에 넘길 뿐, 빈 배열 자체를 거부하지 않는다.
- **결론**: Codex 주장대로 서버 domain 레벨에 "조회한 타입이 선택형이면 활성 선택지 1~30개" 재판정이 명시돼 있지 않다. 클라이언트 버튼 비활성(`04.5-02-PLAN.md:31-32`의 UI 문구)만으로는 위조 요청을 막지 못한다.

## 3. 수정 성공 직후 폼 재마운트가 성공 상태를 지움 — **CONFIRMED (계획이 다루지 않음)**

- `04.5-02-PLAN.md:204`(Task 2⑤): "`actions.ts`: `updateFieldDefinitionAction`(... 같은 세 경로 `revalidatePath`)" — 저장 성공 시 `revalidatePath`를 호출(01의 생성 액션과 같은 패턴, `04.5-01-PLAN.md`의 `createFieldDefinitionAction`도 `revalidatePath("/admin/field-definitions")` 등 3곳).
- `04.5-02-PLAN.md:206`(Task 2⑥): "`page.tsx`: ... 수정 폼을 `key={id}:{version}`로 렌더" — 폼은 서버 컴포넌트인 `page.tsx`가 매 렌더마다 최신 DB 행의 `version`으로 `key`를 만든다.
- 기존 선례: `app/(app)/admin/vendors/actions.ts:28` 부근(`createVendorAction`) — `revalidatePath("/admin/vendors")`를 저장 직후 호출하는 동일 패턴이 이미 존재. Next.js에서 `revalidatePath`는 그 경로를 그리는 서버 컴포넌트(`page.tsx`)를 다음 요청에서 다시 렌더하게 하므로, `version`이 `version+1`로 바뀐 새 데이터가 내려오면 `key={id}:{version}`이 바뀌어 폼(클라이언트 컴포넌트, `useAction`의 `result` 상태를 보유)이 통째로 재마운트된다.
- `04.5-02-PLAN.md:206` 끝부분은 "1차 「화면 항목 수정」, 성공 결과 줄 「화면 항목 수정 · {이름} 수정됨」 + 2차 「닫기」"라고만 적고, 성공 상태를 **폼 바깥**(page 또는 별도 wrapper)에 보관하는 설계나 "재검증 완료 후에도 결과 줄이 유지되는" 검증 케이스가 없다.
- **결론**: Codex가 지적한 저장 직후 재마운트 vs 성공 줄 유지 계약의 충돌은 계획에 해소책이 없다. CONFIRMED.

## 4. 06 Task1④ E2E 전용 계급 격리의 시간 틈 — **CONFIRMED**

- `04.5-06-PLAN.md:151-160`(Task 1④, `createE2EFieldDefinition`): "01의 domain 생성 함수를 `SYSTEM_VIEWER`로 부른다. **그 칸의 `cf.vendor.<key>` 노출 행을 `onlyRoleId` 밖 모든 계급에서 `visible = false`로 바꾼다.**" — 즉 (a) 01의 `createFieldDefinition` 호출로 **전 계급에 `visible = true`**인 정의가 커밋되고, (b) **그 다음** 별도 단계로 다른 계급들을 끈다. 두 단계 사이에 시간 창이 있다(01의 `createFieldDefinition`은 전 계급 노출을 한 트랜잭션에 커밋하며 그 트랜잭션은 (a)에서 이미 끝난다 — (b)는 별도 호출).
- `04.5-06-PLAN.md:98`: "이 스펙이 만든 필수 칸이 시스템 관리자에게 보이면, 동시에 도는 `vendors.spec.ts`의 등록이 막힌다"고 계획 스스로 인지하고 있으나, 해결책은 (a)→(b) 순서로 "만들고 끈다"는 방식뿐이며 (a)~(b) 사이 창은 다루지 않는다.
- `playwright.config.ts:50`: `fullyParallel: false`는 **파일 내부** 테스트를 순차 실행할 뿐, 여러 스펙 파일(워커)이 병렬로 도는 것은 막지 않는다. 같은 파일의 주석(`playwright.config.ts:76-84`, "함정 6")도 "두 프로젝트는 erp_test 하나를 공유한다... 동시에 돌면 서로의 데이터를 본다"고 명시 — desktop/mobile-375 프로젝트 간 이미 알려진 공유 DB 경합이다. `workers` 옵션이 별도로 지정돼 있지 않아 기본값(복수 워커)로 동작한다.
- `test/e2e/vendors.spec.ts:25-41` (거래처 등록 테스트)은 이름·사업자번호·계좌 정보만 채우고 커스텀 필드 값을 보내지 않는다 — 06이 만드는 "필수" 커스텀 칸이 이 계급에 보이는 순간 이 등록 폼 제출이 서버 필수 검증에 걸려 실패할 수 있다.
- **결론**: (a)→(b) 사이 창에서 다른 워커의 `vendors.spec.ts`가 시스템 관리자로 거래처를 등록하면 실패할 수 있다는 Codex 주장이 코드·계획 문구로 뒷받침됨. 격리는 "만들고 곧바로 끈다"뿐, 트랜잭션 결합이나 단일 워커 격리 언급 없음. CONFIRMED.

## 5. 05 오래 열린 거래처 폼 stale 키 vs UI-SPEC E4 — **CONFIRMED**

- `04.5-UI-SPEC.md:187`(E4 stale): "칸이 보관·노출 해제됨 → **서버가 저장값 되살림(값 유실 없음)**." — 즉 스펙은 "칸이 옵션에서 사라져도 저장은 성공하고 서버가 값을 보존"해야 한다고 요구.
- `04.5-05-PLAN.md:30`: "입력 칸 밖의 키(숨은 칸·보관 칸·없는 칸)를 하나라도 보내면 값이 비어 있어도 **저장 전체를 거부**하고 DB는 그대로다." — 이 규칙은 "숨은 칸"(그 사람 계급에서 방금 꺼진 칸)까지 포함해 **무조건 전체 거부**로 처리한다.
- `04.5-05-PLAN.md:27`은 "보는 사람이 볼 수 없는 칸의 저장값을 지우거나 바꾸지 않는다... 서버가 저장값에서 입력 칸 밖의 키를 그대로 되살려 합친다"라고 하지만, 이건 **제출 페이로드에 그 키가 아예 없는 경우**(서버가 기존 값을 보존해 merge)를 말한다. 반면 실제 폼은 아래처럼 열 때 받은 정의 키를 계속 제출하므로 "그 키가 없는" 상황이 아니라 "그 키가 있는데 서버가 이제 그 키를 모르는" 상황이 된다.
- `app/(app)/admin/vendors/vendor-form.tsx:96-101`(`handleSubmit`): `for (const def of fieldDefs) { ... customFields[def.key] = raw; }` — `fieldDefs`는 폼이 처음 열릴 때 서버가 내려준 정의 배열(리렌더 전까지 고정)이다. 폼을 연 뒤 관리자가 그 칸을 보관하거나 이 사용자 계급에서 노출을 끄면, 폼은 여전히 그 키를 제출한다.
- 결과적으로 이 시나리오는 "위조 키"(line 30) 규칙에 걸려 저장 전체가 거부된다 — UI-SPEC이 요구하는 "값 유실 없이 조용히 저장 성공"과 어긋난다.
- `04.5-05-PLAN.md:122`("5-B")는 이 문구를 "정상 화면에서는 나오지 않는다"는 전제로 새 문구를 만들지 않기로 했는데, 이는 정확히 Codex가 지적한 "정상 사용자가 이 오류를 받을 수 있다"는 전제 자체가 깨지는 지점이다.
- 계획 어디에도 vendor-form이 저장 실패 시(또는 저장 전) 최신 정의를 재조회해 폼을 복구하는 경로, 혹은 입력값을 보존한 채 재조회하는 E2E가 명시돼 있지 않다.
- **결론**: CONFIRMED. UI-SPEC E4 stale의 "값 유실 없이 저장 성공"과 05의 "밖의 키 = 전체 거부" 규칙이 실제로 충돌하며, 복구 경로가 없다.

## 6. 플랜 간 생산·소비 심볼 불일치 — **CONFIRMED (양쪽 다)**

### findFieldDefinitionByLabel
- `04.5-02-PLAN.md:181,202`: "`domain/custom-fields/admin.ts`의 이름 예약 부분(01·08 — `findFieldDefinitionByLabel`·`DuplicateFieldNameError`)" / "이름 예약(01·08의 `findFieldDefinitionByLabel`, 자기 제외, ...)" — 02는 이 함수가 01·08에 의해 만들어진다고 전제하고 그대로 소비한다.
- `04.5-08-PLAN.md:105`: "**이름 예약 조회:** 새 리포지토리 함수를 만들지 않는다 — `listFieldDefinitions(viewer, "vendor")`(보관 포함 전 행...)에서 자른 이름과 같은 `label`을 찾는다." — 08은 명시적으로 별도 함수를 만들지 않고 `listFieldDefinitions` + 인라인 필터로 대체하기로 결정했다.
- 즉 02가 기대하는 이름의 함수(`findFieldDefinitionByLabel`)가 08의 실제 산출물에 없다 — Codex 주장과 일치. CONFIRMED.

### version (06이 01의 생성 반환값에 기대)
- `04.5-01-PLAN.md:226`(Task 1④ 끝부분): "반환은 새 행의 `{ id, key }`만(행 타입을 그대로 돌려주지 않는다 — `plant8/no-row-type-escape`)." — 01의 `createFieldDefinition`은 `version`을 반환하지 않는다.
- `04.5-06-PLAN.md:160`: "`createE2EFieldDefinition({...})` ... 01의 domain 생성 함수를 `SYSTEM_VIEWER`로 부른다 ... **칸 정의 행(`id`·`key`·`version`)을 돌려준다.**" — 06의 픽스처는 `version`을 포함해 반환하겠다고 선언했지만, 그 값의 출처인 01의 생성 함수가 `version`을 주지 않는다.
- 픽스처가 `version`을 얻으려면 별도로 재조회(`findFieldDefinitionById` 등)해야 하는데 그 재조회 단계가 06 계획 문구에 없다 — Codex가 지적한 "E2E 픽스처의 version 재조회 단계 누락"과 일치. CONFIRMED.

## NOTE. Phase 4 브랜치 대조 — **부분 대조 완료, 모순 없음, 단 선행조건 타이밍 이슈 발견**

`origin/claude/gsd-progress-e1nzgu`는 이번 세션에서 fetch됨(`git fetch origin claude/gsd-progress-e1nzgu` 성공, HEAD `15bdf487`, "pause work after session J (plan 04-25)").

- **03의 04-32 호환성**: `git show origin/claude/gsd-progress-e1nzgu:domain/permissions/project.ts` 확인 — `InfoItemRef = string | readonly string[]`, `projectMany`가 이 목록 형태를 순회하는 모양이 존재하고 03-PLAN.md:108의 read_first 설명("문자열 또는 목록 — all-of")과 일치. **모순 발견되지 않음.**
- **07의 병합 전제(`insertVisibilityIfAbsent` + 04-20 두 인자 모양)**: `git show origin/claude/gsd-progress-e1nzgu:repositories/permissions.ts`에는 `insertVisibilityIfAbsent`가 **아직 없음**(export 목록: `findPermission`·`upsertPermission`·`insertPermissionIfAbsent`·`listPermissions`·`findVisibility`·`upsertVisibility`·`listVisibility`뿐). 04-20-PLAN.md(계획 문서, 아직 미실행)에서 `insertVisibilityIfAbsent(viewer, row)`를 `onConflictDoNothing`으로, **두 인자만**(뒤에 tx 없음) 추가하겠다고 명시(04-20-PLAN.md:215, :405) — 이는 07-PLAN.md의 "04-20의 인자 둘 모양과 합칠 때 선택 `tx`를 지킨다"는 전제와 **일치**한다(모순 없음, 오히려 뒷받침).
- **타이밍 이슈(신규 관찰)**: 이 브랜치에서 `.planning/phases/04-project-quote-ledger/`에 SUMMARY가 존재하는 플랜은 `04-01·02·04·05·08·10·25·32·43·46·50`뿐이다. 03-PLAN.md의 선행조건 체크(`04.5-03-PLAN.md:81`)는 `04-07·14·18·27·32·42`의 SUMMARY 존재를, 07-PLAN.md의 선행조건 체크(`04.5-07-PLAN.md:77`)는 `04-01·02·06·07·08·10·13·20·25·27·29·41·46`의 SUMMARY 존재를 요구한다. 이 브랜치 시점(session J, plan 04-25 직후 일시정지)에는 `04-07·14·18·27·42·06·13·20·29·41`의 SUMMARY가 아직 없다 — 즉 03·07 두 계획 모두 "이 Phase 4 브랜치가 작업 브랜치에 들어온 뒤에만 실행"이라는 자체 가드에 **지금은 걸려서 멈춰야 하는 상태**다. 이는 계획 내용의 오류가 아니라 실행 시점의 사실 확인이며, 04.5 실행자가 Task 착수 전 이 가드 스크립트를 실제로 돌려 종료 코드를 확인해야 함을 재확인시켜 준다(계획이 이미 규정한 대로).

## 요약

| # | 제목 | 판정 |
|---|---|---|
| 1 | 칸·계급 동시 생성 경합 | CONFIRMED |
| 2 | 선택형 수정 최소 선택지 서버 검증 누락 | CONFIRMED |
| 3 | 수정 성공 직후 재마운트가 성공 상태 삭제 | CONFIRMED |
| 4 | 06 E2E 전용 계급 격리 시간 틈 | CONFIRMED |
| 5 | 05 stale 키 거부 vs E4 값 보존 요구 | CONFIRMED |
| 6 | 심볼 불일치(`findFieldDefinitionByLabel`, `version`) | CONFIRMED |
| NOTE | Phase 4 브랜치 대조 | 완료 — 내용 모순 없음, 단 선행조건(SUMMARY 존재) 현재 미충족 확인 |
