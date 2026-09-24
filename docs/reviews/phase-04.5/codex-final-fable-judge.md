# Codex 최종 리뷰 6건 — Fable 판정 (Phase 04.5 플랜)

기준: 계획을 그대로 실행하면 수용 기준·위협 모델·UI-SPEC과 어긋나는 결과가 나오는가(BLOCKER = 승인 전 플랜 수정 필수) / 실행은 되지만 고치는 게 맞음(MINOR) / 근거 없음(FALSE). 모든 고침은 CLAUDE.md §3.2에 따라 가장 작은 것으로 골랐다. 인용 줄은 직접 확인했다.

| # | 제목 | 판정 | 고칠 플랜 |
|---|---|---|---|
| 1 | 칸·계급 동시 생성 노출 행 누락 | **BLOCKER**(고침은 3줄) | 01 T1④ · 03 T1② · 03 통합 테스트 1건 |
| 2 | 선택형 수정 시 활성 선택지 0개 서버 검증 없음 | **BLOCKER**(1문장 + 테스트 1건) | 02 T2④ · T2 behavior |
| 3 | 수정 성공 직후 재마운트가 결과 줄을 지움 | **BLOCKER**(플랜 자체 모순 — key 위치만 바꿈) | 02 T2⑥ · T2 E2E 1줄 |
| 4 | 06 E2E 전용 계급 격리의 시간 창 | **BLOCKER**(CI 플레이크 — 기존 deps 주입으로 0줄 신규) | 06 T1④ |
| 5 | 오래 열린 거래처 폼의 stale 키 전체 거부 | **MINOR**(UI-SPEC E4와 충돌 — `knownKeys` 하나 추가) | 05 T1·T2 + must_have 30행 |
| 6 | 심볼 불일치(`findFieldDefinitionByLabel`·`version`) | **MINOR**(문구 2곳) | 02 181·202행 · 06 162행 |

---

## 1. 칸·계급 동시 생성 — BLOCKER

**근거.** `04.5-01-PLAN.md:181`(T1④)는 계급 목록을 「트랜잭션 **전에**」 읽고 `withTransaction` 안에서 정의 + 노출 행을 쓴다. `04.5-03-PLAN.md:172`(T1⑤)는 `repoInsertRole` **뒤** 별도 호출 `grantCustomFieldsToRole`이 `listFieldDefinitions`(03:166)로 정의를 읽는다. 둘 다 전역 `db`로 도는 별도 조회다(`repositories/roles.ts:10-16`, `repositories/field-definitions.ts:9-15` — `tx` 인자 없음). READ COMMITTED에서 「필드가 계급을 읽음 → 계급 INSERT 커밋 → 계급이 정의를 읽음(정의 미커밋) → 정의 커밋」 순서면 양쪽 모두 상대를 놓치고, `visible()`의 「행 없음 = 숨김」(01:35, D10-13) 때문에 그 계급에게 그 칸이 영구히 숨는다. 회복 경로 없음(01 T2②의 채움 SQL은 1회성 마이그레이션). 01의 위협표 `T-04.5-07`(01:264)이 「반쪽 상태가 남지 않는다」를 약속하므로 플랜 자체의 약속 위반이다. 확률은 낮지만(관리자 둘의 ms 창) 고침이 3줄이라 받아들일 이유가 없다.

**최소 고침 — 한 advisory lock을 두 경로가 같이 쓴다.** 별도 SELECT FOR UPDATE·직렬화 격리·재시도 불필요.
- `04.5-01-PLAN.md` T1④: 「계급 목록을 트랜잭션 **전에** 읽음 → 키 생성 → `withTransaction` 안에서 …」를 「키 생성 → `withTransaction` 안에서 **첫 문장** `SELECT pg_advisory_xact_lock(<상수>)`(상수는 `domain/custom-fields/admin.ts`가 export — 03이 같은 상수를 쓴다) → 계급 목록 읽음 → `insertFieldDefinition(…, tx)` → 계급마다 `insertVisibilityIfAbsent(…, tx)`」로 바꾼다. T2③의 키 충돌 재시도는 「`withTransaction` 전체를 다시 연다」 그대로라 잠금도 함께 다시 잡힌다. `listRoles`의 시그니처는 건드리지 않아도 된다(잠금을 잡은 뒤의 조회는 커밋된 계급을 모두 본다).
- `04.5-03-PLAN.md` T1②: `grantCustomFieldsToRole(viewer, roleId)`를 「`withTransaction` 안에서 01의 같은 상수로 `pg_advisory_xact_lock` → `listFieldDefinitions` → 정의마다 `insertVisibilityIfAbsent(…, tx)`」로 적는다. T1⑤(실패 시 `log.warn` 뒤 계속)는 그대로.
- **테스트(03 `test/integration/custom-field-visibility.test.ts`에 통합 1건):** 「01의 계급 목록 deps에 *진짜 목록을 읽은 뒤* `insertRole(R)`을 직접 넣고 `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id)`를 **await 없이** 띄운 다음 R이 빠진 목록을 돌려주는 함수」를 주입해 `createFieldDefinition`을 부른다 → 둘 다 끝난 뒤 R의 `cf.vendor.<key>` 행이 `visible = true`로 있다. 잠금이 없으면 grant가 정의 커밋 전에 읽어 빨갛고, 있으면 grant가 필드 커밋까지 막혀 초록이다(dep 안에서 grant를 await하면 교착이므로 하지 않는다 — 플랜 문장에 이 주의를 적는다).

## 2. 선택형 수정 활성 0개 — BLOCKER

**근거.** must_have `04.5-02-PLAN.md:32`는 「서버도 선택형의 활성 선택지 1~30개 …를 다시 판정한다(수정 모드 포함)」고 약속하지만, 이를 실행하는 문장이 없다. T2②(02:198)의 `updateFieldDefinitionInput`은 「생성과 같은 **원소** 규칙」만이고 `type`이 입력에 없어(02:34) 스키마로는 「선택형이면 1개 이상」을 판정할 수 없다. T2④(02:202)의 처리 순서는 「선택형이 **아닌** 칸에 선택지가 오면 거부」만 있고 반대 방향(선택형인데 `[]`·생략)이 없다. T3②(02:243)는 제출 배열을 그대로 `options`에 쓴다. `domain/custom-fields/build-schema.ts:29`는 `z.enum((def.options ?? []) as [string, ...])`라 빈 배열이 저장되면 그 칸이 있는 거래처 폼 검증이 통째로 깨진다(필수 칸이면 모든 거래처 저장이 막힌다). 위조 요청 한 번이면 되므로 T2 behavior에 테스트가 없는 것도 구멍이다.

**최소 고침.**
- `04.5-02-PLAN.md` T2④: 「→ 선택형이 아닌 칸에 선택지가 오면 거부」 뒤에 「· **읽은 행이 선택형인데 `options`가 없거나 활성 0개면 거부**(같은 `UserFacingError` 계열, 문구는 UI-SPEC 「선택지 0개 · 선택지 추가」의 수정 모드 원문 — 30개·40자·중복 상한은 스키마가 이미 본다)」 한 구절을 더한다. Task 3 ②는 그대로(이 판정을 지난 배열만 파생에 쓴다).
- **테스트(T2 behavior 통합 1건):** 「선택형 칸에 `options: []`로, 그리고 `options` 생략으로 저장하면 둘 다 거부되고 `options`·`archived_options`·`version`·로그가 그대로다」.

## 3. 수정 성공 뒤 재마운트 — BLOCKER

**근거.** T2⑤(02:204)는 저장 성공 시 세 경로 `revalidatePath`, T2⑥(02:206)은 페이지가 폼을 `key={id}:{version}`로 렌더 + 같은 폼 안에 성공 결과 줄 「화면 항목 수정 · {이름} 수정됨」 + 「닫기」. 서버 액션 응답에 재검증된 RSC 트리가 함께 실려 오므로(`app/(app)/admin/vendors/actions.ts:28`과 같은 선례) 저장 성공 = `version+1` = key 변경 = `useAction` 상태를 가진 폼 인스턴스 교체다. 결과 줄은 그려지지 않거나 순간 사라진다. T2 behavior의 E2E(02:190 「결과 줄 → 닫기」)가 그대로 빨개져 실행자가 즉석 설계를 하게 된다 — 플랜 안의 모순이므로 승인 전에 정한다.

**최소 고침 — key를 한 층 안으로 옮긴다(새 컴포넌트·파일 없음).**
- `04.5-02-PLAN.md` T2⑥: 「수정 폼을 `key={id}:{version}`로 렌더」→「수정 폼을 `key={id}`로 렌더한다. 폼 컴포넌트 안에서 `useAction`·결과 줄은 바깥 층에 두고 **입력 칸 묶음만 안쪽 `key={version}`**으로 감싼다. 숨은 `version`은 prop에서 읽는다(저장 뒤 이어서 저장해도 충돌이 아니다). 저장 성공 → 재검증으로 새 `version`이 오면 입력 칸만 저장된 값으로 다시 마운트되고 결과 줄은 남는다. 「새로 불러오기」의 `router.refresh()`도 같은 안쪽 key로 다시 마운트되고 이름 입력으로 포커스한다」.
- **테스트(T2 behavior E2E 기존 줄 보강):** 「결과 줄 「… 수정됨」이 보인 뒤 숨은 `version` 입력값이 v+1이고(재검증이 적용된 뒤에도 결과 줄이 남는다는 증거), 이어서 이름을 한 번 더 바꿔 저장하면 충돌 없이 성공한다」.

## 4. 06 E2E 전용 계급 시간 창 — BLOCKER

**근거.** `04.5-06-PLAN.md:158-162`: 01의 생성 함수를 부른 **뒤**(전 계급 `visible = true` 커밋 완료) 별도 단계로 다른 계급을 끈다. 06:98이 이 위험을 스스로 적었지만 창은 남는다. `playwright.config.ts`에 `workers` 지정이 없어 기본값(코어 절반 — GitHub 러너 4코어 = 2워커)으로 desktop 스펙 파일들이 동시에 돌고 `erp_test` 하나를 나눠 쓴다(config 76-84행 주석). `test/e2e/vendors.spec.ts:36-41`의 등록은 커스텀 값을 보내지 않으므로, 그 창에 시스템 관리자로 등록하면 05의 필수 판정에 걸려 실패한다. `flock`은 프로세스 밖 직렬화라 워커 간에는 무력하다. CI 플레이크는 ship을 막는다.

**최소 고침 — 01이 이미 주는 deps 주입을 쓴다(신규 코드 0줄, 단계 하나 삭제).**
- `04.5-06-PLAN.md` T1④ `createE2EFieldDefinition`: 「01의 domain 생성 함수를 `SYSTEM_VIEWER`로 부르되 **계급 목록 deps에 `[findRoleById(SYSTEM_VIEWER, onlyRoleId)]` 한 행만 돌려주는 함수를 주입**한다. 노출 행은 그 계급에만 한 트랜잭션에서 생기고 다른 계급은 행 없음 = 숨김(D10-13)이다」로 바꾸고, 「다른 계급에서 `visible = false`로 바꾼다」 줄을 지운다. (1번 고침 뒤에도 성립 — 잠금 안에서 주입된 dep이 불린다.)
- **테스트:** 픽스처 끝에 단언 한 줄 「그 키의 `cf.vendor.<key>` 노출 행 수 = 1(`listVisibility`)」. 시간 창은 E2E로 못 잡으므로 구조(한 트랜잭션)로 증명한다. 기존 「(E2E 0칸) 시스템 관리자의 거래처 폼에는 이 스펙의 칸이 없다」는 그대로.

## 5. 오래 열린 거래처 폼의 stale 키 — MINOR(고친다)

**근거.** `04.5-UI-SPEC.md:187` E4 stale: 「칸이 보관·노출 해제됨 → 서버가 저장값 되살림(값 유실 없음)」 = 저장은 성공해야 한다. `04.5-05-PLAN.md:30`은 「입력 칸 밖의 키(숨은 칸·보관 칸·없는 칸) 하나라도 → 저장 **전체** 거부」. `app/(app)/admin/vendors/vendor-form.tsx:96-101`은 열 때 받은 `fieldDefs`의 키를 전부 보내고, 05:114는 수정 모드에서 빈 값까지 다 보내게 바꾼다. 따라서 폼을 연 뒤 관리자가 그 칸을 보관/끄면 정상 사용자가 「입력값이 올바르지 않습니다」를 반복해서 받고(05:122 「정상 화면에서는 나오지 않는다」 전제가 깨짐) 새로 고침 말고는 길이 없다. 사용자 제안대로 **존재하지만 입력 밖인 키는 조용히 버리고 저장값을 유지**하면 충분하다 — 위조 값은 어차피 쓰이지 않으므로 T-05 위협(05:41 「위조로 쓰는 경로가 없어야 한다」)은 그대로 막히고, 없는 키만 계속 거부해 클라이언트 버그는 크게 잡는다. 재조회 복구 경로·E2E(Codex 제안)는 불필요하다.

**최소 고침.**
- `04.5-05-PLAN.md` T1②·③ `resolveCustomFieldsWrite(input)`: 입력에 `knownKeys`(대상 정의 **전체** 키 — 보관 포함, T2에서 `listFieldDefinitions(viewer, "vendor")`로 채움)를 더하고 판정 첫 단계를 「제출 키가 `knownKeys`에 없으면 `UnknownCustomFieldKeyError`(그대로) · `knownKeys`에는 있으나 `inputDefs` 밖(보관·계급에서 끔·`vendor.value` 끔)이면 **제출값을 버리고 저장값 유지**(E4 stale·hidden)」로 적는다. must_have 30행·116행·122행의 「숨은 칸·보관 칸」을 「없는 키」로 좁힌다.
- **테스트:** T1 단위 「`inputDefs` 밖·`knownKeys` 안의 키를 값과 함께 보내면 오류 없이 그 키는 저장값 그대로(저장값이 없으면 결과에 없음), 다른 칸 저장은 반영」 · T2 통합 206행을 둘로 나눔 「끈 계급 사용자가 A 키(존재)를 보내면 저장 성공, A 저장값 불변」 / 「없는 키 → 거부, DB 그대로」.

## 6. 심볼 불일치 — MINOR(문구만)

**근거.** `04.5-02-PLAN.md:181, 202`는 `findFieldDefinitionByLabel`을 01·08 산출물로 소비하지만 `04.5-08-PLAN.md:105`는 「새 리포지토리 함수를 만들지 않는다 — `listFieldDefinitions`에서 같은 `label`을 찾는다」. `04.5-06-PLAN.md:162`는 `version`을 돌려준다고 하지만 `04.5-01-PLAN.md:181` 끝의 반환은 `{ id, key }`뿐. 실행자는 read_first로 실제 코드를 보므로 막히진 않지만 이름이 틀린 포인터는 고친다.

**최소 고침.** 02 181·202행: 「08의 이름 예약 판정(`admin.ts` 안 — `listFieldDefinitions(viewer, "vendor")`에서 같은 `label` 찾기, 실제 함수 이름은 08 SUMMARY)」로 바꾼다. 06 162행: 「`{ id, key }`를 받고 `version`은 `findFieldDefinitionById(SYSTEM_VIEWER, id)`로 다시 읽어 함께 돌려준다」 한 줄. 테스트 없음.

## NOTE(Phase 4 브랜치 대조)
Sonnet 1차가 fetch해 대조 완료 — 03·07의 호출 계약 모순 없음. 다만 03:81·07:77의 선행 SUMMARY 가드가 현재 브랜치 시점에서는 미충족이라 실행 순서상 멈추는 상태다(계획 결함 아님, 실행 시 가드 실행 필수).

## 총평
6건 모두 실제(FALSE 0). 4건 BLOCKER는 각각 플랜 문장 1~3줄 + 테스트 1건으로 닫힌다 — Codex가 제안한 「바깥 컴포넌트」「복구 경로 + E2E」「경합 테스트 인프라」보다 작은 고침으로 충분하다. 승인은 1~4 반영 뒤, 5·6은 같은 편집에서 함께.
