# 04.1 /plan-eng-review 2차 — 후보 9건 판정 (Fable, 읽기 전용 · 플랜·코드 직접 대조)

판정 기준: BLOCKER = 플랜대로 실행하면 실패하거나 틀린·불안전한 동작이 나온다(실행 전 플랜 수정 필수) · 경고 = 같은 수정 회차에 고친다(막지는 않음) · 참고 · 기각.
"실행자가 자연히 잡는가"는 07 최종 게이트에서만 드러나면 완화 요인으로 보되 등급을 없애지 않았다.

---

## 1. Codex B-NEW01 — 취소 경로가 04.1-04의 지난 연도 보호를 우회 → **경고**

- 플랜 `04.1-04-PLAN.md:42`: "형식·1월 1일·지난 연도 판정은 공통 검증 함수 `validateEffectiveFrom(def, effectiveFrom, today)` 하나에 있고 **두 쓰기 경로**가 모두 부른다 — 일반 저장 `addHistorizedValue` … 와 설정 JSON 가져오기 `importSettings`". `253–256`(①-a·①-b)도 두 경로만. `cancelHistorizedValue`는 플랜 어디에도 없다(grep 0건). files_modified에 `domain/settings/registry.ts`는 있다.
- 코드 `domain/settings/registry.ts:172-175`: `const today = dateOnly(new Date()); if (effectiveFrom <= today) { throw new FutureCancelOnlyError(…) }` — 문자열 대소 비교만, 형식 검증 없음, `dateOnly`(:46)는 `toISOString()` = UTC. `app/(app)/admin/settings/actions.ts:43`: `.schema(z.object({ key: z.string().min(1), effectiveFrom: z.string().min(1) }))`. `repositories/settings.ts:93`: `eq(settingsHistorized.effectiveFrom, effectiveFrom)` — `effective_from`은 `date` 열(`db/schema/settings.ts:23`)이라 Postgres가 `'January 1, 2025'`를 2025-01-01로 캐스팅해 지난 행을 지운다. `"J" > "2"`이므로 문자열 비교는 미래로 본다. 재현 성립.
- 완화: 화면은 DB 행의 정규형 날짜를 그대로 넘긴다(`settings-form-client.tsx:207-208` `onCancel={async (effectiveFrom) => executeCancel({ key, effectiveFrom })}`). 우회는 `admin.settings` write 권한자가 액션을 직접 조작할 때만 성립(위협 모델 T-04.1-24 low와 같은 급). UTC 편차는 서울 1/1 0~9시에 **올해** 1/1 행을 취소할 수 있게 하는데, 올해 1/1 행은 저장 경로에서도 바꿀 수 있는 값이라 "지난 연도 불변" 위반은 아니다.
- 실행자가 잡는가: 아니다 — 어느 테스트도 취소 경로를 지난 연도 날짜로 두드리지 않는다.
- BLOCKER가 아닌 이유: 정상 실행·정상 UI에서는 플랜의 truth가 참이고, 구멍은 특권 사용자의 비정규 입력에만 열린다. 다만 플랜이 세운 불변식("지난 연도 잔고는 소급해 바뀌지 않는다")에 셋째 경로가 빠진 것은 사실이라 같은 회차에 닫는다.
- 고칠 방향: 04.1-04 Task 2 ①에 ①-c "`cancelHistorizedValue`도 `validateEffectiveFrom`의 형식 검사 + `seoulToday(deps?.now)` 기준 `past_year`/이미 적용 판정을 거친다" 한 구절 + 단위 사례(`January 1, 2025` 거부 · 연초 서울 경계).

## 2. Codex B-NEW02 — `org_unit_id` z.string() → 비uuid 저장 → 제출 INSERT 실패 → **경고(상)**

- 플랜 `04.1-01-PLAN.md:308`: "`org_unit_id`는 z.string() + dynamicOptions `org_units`". `:298`: "`scope_target_id` uuid null". `:304`(`prepareSubmission`): "범위 … `org_unit`은 설정의 부서 id" — 존재·형식 해석 없이 그대로 단계 행에 쓴다. `04.1-04-PLAN.md:150`: "동적 옵션 값의 서버 측 존재 검증은 하지 않는다 — 없는 id는 결재 엔진에서 빈 자리가 되어 건너뛰거나 대표에게 간다" — **없는 uuid**만 가정하고 **uuid가 아닌 문자열**은 다루지 않는다. `01:66`의 `""` 처리는 행이 없을 때만이다.
- 코드 `domain/settings/export.ts:127-132`: 비이력형은 `def.schema.safeParse(raw)` 통과 시 `simple.push(…)` → `repositories/settings.ts:135-`(`applySettingsImport`) upsert. `not-a-uuid`가 저장된다. 제출 때 `scope_target_id`(uuid) INSERT는 22P02로 실패 → 트랜잭션 롤백 → 그 단계가 켜진 동안 **모든** 신규 연차 신청이 원시 오류로 막힌다(플랜 문장 "결재 없이 통과하지 않는다"는 지키지만 "신청이 막히지 않는다"(CEO-7, 01:66)는 깨진다).
- 완화: 가져오기는 CLI 전용(`actions.ts` 주석: `pnpm settings:import`, SYSTEM/관리자 입력), 화면 select는 서버가 채운 id만 낸다. 그래도 `setSimpleSettingAction`도 같은 z.string()이라 조작 요청은 가능.
- 실행자가 잡는가: 아니다 — 형식 오류 가져오기 사례가 없다(settings-export (c)는 스키마 실패 케이스일 뿐 org_unit_id 형식은 스키마가 통과시킨다).
- 고칠 방향: 01:308 키 정의를 `z.union([z.literal(""), z.string().uuid()])`(또는 `.uuid().or(z.literal(""))`)로 고치고, 04 settings-export 통합에 "비uuid `org_unit_id` 가져오기 → `ImportValidationError`, 아무것도 안 씀" 한 사례. `role_id`도 같은 모양이면 함께(`role_id`는 text 열이라 INSERT는 안 깨지지만 일관성).

## 3. Codex C-N01 = Opus C-03 — 섹션 연도 결정에 필요한 퇴직일의 선행 조회 경로 없음 → **경고**

- 플랜 `04.1-06-PLAN.md:337`: "섹션 연도 = `resolveLeaveYear(searchParams.year, seoulToday()의 연도, 대체 연도)` … 사람 상세는 퇴직일이 있으면 min(퇴직 연도, 올해)를 넘긴다 … 그 값 하나를 `getLeaveBalanceForUser`의 `fiscalYear` · `listLeaveAdjustmentsForUser`의 `fiscalYear` … 에 같이 넘긴다".
- 플랜 `04.1-03-PLAN.md:217`: "`getLeaveBalanceForUser(viewer, userId, {fiscalYear}, deps?)` … `LEAVE_BALANCE_DTO_SPEC`(퇴직 줄에 필요한 입사일·퇴직일을 **여기에만** 둔다)". 즉 퇴직일의 유일한 도메인 출처가 연도를 먼저 요구한다.
- 코드 `domain/people/index.ts:46-55` `PersonDto = { id, name, email, roleId, roleName, archivedAt, currentTeamId, currentTeamName }` — 입사일·퇴직일 없음. `getPerson`/`PersonDto` 언급은 7개 플랜 모두 0건.
- 실행자가 잡는가: 부분적으로 — 타입 오류로 바로 드러나 실행자가 (a) 올해로 한 번 읽어 퇴직일을 얻고 다른 연도면 다시 읽는 우회를 스스로 택할 수 있다(수락 기준 "`resolveLeaveYear(` 정확히 1"은 유지 가능). 실행이 실패하지는 않으므로 BLOCKER는 아니다. 다만 순서 계약이 없어 실행자마다 다르게 풀고(두 번 읽기 vs 리포지토리 직접 import → eslint 경계 위반), `leave.value` 꺼진 계급에게는 퇴직일이 투영에서 빠져 기본 연도가 올해로 떨어지는 조용한 차이가 남는다.
- 고칠 방향: 06 Task 3 ③에 "첫 읽기 `getLeaveBalanceForUser(…, {fiscalYear: 올해})`로 입사일·퇴직일을 얻고, 섹션 연도 ≠ 올해일 때만 그 연도로 한 번 더 읽는다(최대 2회)"를 고정하거나, 03에 연도 없는 좁은 읽기(`getPersonDates` · `admin.people` 보기 판정 · `leave.value` 투영)를 하나 더한다. 둘 중 하나를 read_first/interfaces에 적는다.

## 4. Opus C-01 — 입사일 필수화가 06 files 밖 E2E 4개를 깨고 플랜의 grep이 못 찾음 → **BLOCKER**

- 플랜 `04.1-06-PLAN.md:339`: "등록 zod에 `hireDate` 필수 … `people.spec.ts` · `mobile-people.spec.ts`(와 grep으로 찾은 등록 폼 사용 스펙)의 등록 단계에 입사일 채우기를 더한다". `:315`: "`grep -rln \"people?new=1\" test/e2e`로 등록 폼을 쓰는 다른 스펙이 있는지 확인한다". `:308` files: `test/e2e/people.spec.ts, test/e2e/mobile-people.spec.ts`만. `:348` 검증: `pnpm playwright test test/e2e/admin-person-leave.spec.ts test/e2e/people.spec.ts test/e2e/mobile-people.spec.ts test/e2e/admin-people-detail-link.spec.ts`.
- 실측: `grep -rln "people?new=1" test/e2e` → **0건**. `grep -rn 'name: "사람 등록" }).click' test/e2e` → 6파일: `people.spec.ts:32` · `mobile-people.spec.ts:31` · **`admin-master-list-first.spec.ts:108` · `corp-cards.spec.ts:27` · `mobile-corp-cards.spec.ts:34` · `single-column.spec.ts:104`**. `grep -rln 입사일 test/e2e` → 0건. 예 `corp-cards.spec.ts:24-27`: 이름·이메일·계급만 채우고 `사람 등록` 버튼 → `초기 비밀번호 —` 기대. 입사일 필수화 뒤 서버 zod가 막아 넷이 전부 RED.
- 실행자가 잡는가: 06의 검증 명령은 넷을 돌리지 않아 06은 **거짓 녹색**으로 끝난다. 07 Task 2 `pnpm test:e2e:ci`에서 넷이 한꺼번에 깨지는데, 넷은 어느 플랜의 files에도 없어 07에서 고치면 스코프 위반이고 06으로 되돌리면 병합 절차(재생성 커밋 뒤 검증)가 다시 돈다. 플랜이 잡으려고 둔 장치(grep)가 잘못돼 잡지 못하는 것이라 완화가 아니다.
- 고칠 방향: 06 read_first grep을 `grep -rln 'name: "사람 등록" }).click' test/e2e`로 바꾸고, 네 스펙을 files_modified · Task 3 ④ · 셋째 검증 명령에 더한다(각 스펙의 등록 단계에 `page.getByLabel("입사일").fill(…)` 한 줄).

## 5. Opus A-01 — 종결 문서에도 walkRoute(before_action) → W13 막힘 → 가짜 `route_blocked` 경고·`담당 없음` → **경고**

- 플랜 `04.1-01-PLAN.md:304`: "`getApprovalView(viewer, {kind, documentId})` — … version(walkRoute `at: \"before_action\"` — 막힘이면 지금 단계 `담당 없음`이고 승인·반려 행동 없음". 상태 조건 없음. `:461`: "| W13 | 끝(폴백 조건 거짓) | — | — | 1건 이상 | 무관 | 행동 전 | 막힘(고아 최종 — ENG-3 · D2) |". `:473`: "walkRoute가 「막힘」을 돌려준 `approveDocument` · `getApprovalView` · `listMyInbox`는 요청마다 문서당 한 번 `log.warn(\"approval.route_blocked\", …)`".
- `:69` truth는 조건을 갖고 있다: "행동 전 계산에서 DB 상태가 `submitted`·`in_review`인데 walkRoute가 최종을 내면 … 막힘과 똑같이 다룬다" — 그러나 이 조건이 ④ 구현 지시(304)에는 옮겨지지 않았다. walkRoute 입력에 인스턴스 상태가 없으므로(`{steps, selfApproval, drafterId, snapshot, fallbackRoleId, at}`) 정상 최종 승인된 문서 = 모든 단계 처리됨·승인 ≥1·행동 전 = W13. 02·05 플랜에도 "종결이면 walkRoute 생략" 문장 없음(grep 0건).
- 영향: 끝난 문서를 열 때마다 WARNING 로그(CEO-18의 운영 신호가 소음에 묻힘) + 화면 `담당 없음`. 데이터 변경 없음(`listMyInbox`는 진행 중만 돌려 무관). `rejected` 차수(`action=rejected` 단계 존재)는 결정표에 칸이 없어 동작 미정의.
- 실행자가 잡는가: 트레이서 통합 사례가 "최종 승인 뒤 `getApprovalView`"를 단언하지 않는다(grep 0건). 실행자가 truth 69를 읽고 스스로 상태 분기를 넣을 개연성은 있으나 보장 없음.
- 고칠 방향: 304에 "`getApprovalView` · `canSeeLeaveDocument` · 05 상세는 상태가 `submitted`·`in_review`일 때만 walkRoute — 종결 상태는 저장된 처리 기록만 표시, 지금 단계 없음, `route_blocked` 로그 없음" 한 줄 + 통합 사례(최종 승인 뒤 기안자 `getApprovalView` → `log.warn` 0회).

## 6. Opus A-02 — 폴백 행 `step_index` 미지정, `UNIQUE(route_id, step_index)`와 충돌 가능 → **경고**

- 플랜 `04.1-01-PLAN.md:298`: "`approval_steps`(… `step_index` int … UNIQUE(route_id, step_index)". `:300`: "대표 폴백 단계 행 삽입(`is_fallback` = true · 계급 = 대표 계급 id · 범위 `company` · 대상 id null · 이름 `대표` …)" — `step_index` 값 없음. `:281`: "대표의 기록은 4단 행(`step_index` 4 · `is_fallback` 거짓)" → `step_index`는 **설정 단계 번호**(빈틈 가능)로 읽힌다.
- 문제: 1·3단만 켠 결재선(행 index 1, 3)에서 흔한 `steps.length + 1 = 3` → 기존 3단 행과 UNIQUE 충돌(23505) → `approveDocument`(6) 단계에서 원시 오류·롤백, 문서는 영구 정체. CEO-6이 "원시 DB 오류가 아니라 정확한 문구"를 약속한 경로.
- 실행자가 잡는가: `:416` W4/W13 사례는 "2·4단 꺼짐 · 1단 승인 · 3단 통과"라 빈틈 있는 결재선이 이미 있지만 `before_action`=막힘 · `after_approval` 판정을 단위(순수 함수)로만 본다 — 행 삽입까지 가지 않는다. 04의 CEO-1 통합은 단계 전부 꺼짐이라 빈틈 없음. 실행자가 `max+1` 또는 `5`를 택하면 우연히 안전.
- 고칠 방향: ② 리포지토리 항목에 "폴백 행 `step_index` = 그 차수 `max(step_index) + 1`(행 0개면 1)" 한 구절 + 통합 사례 "2·4단 꺼짐 · 3단 빈 자리 → 대표 폴백 승인 성공, 행 `step_index` 4".

## 7. Opus B A1 — 액션 반환값(다음 담당 이름·기안자 이름·차감 일수)이 `approval.value`·`leave.value` 투영을 건너뜀 → **경고**

- 플랜 `04.1-02-PLAN.md:224`: "`approveAction`({instanceId, expectedVersion}) → `approveDocument` → 다음 담당 이름 또는 최종 여부·차감 일수를 돌려준다(토스트 문구 재료). … 액션이 돌려주는 DTO 이름을 등록한다". `project()`·투영 언급은 02 플랜에 0건(grep `반환값|토스트 재료|project\(` → 224만).
- 비교 `04.1-01-PLAN.md:84`(CX-R3): "담당 이름(`holderNames`)과 기안자 이름(`drafterName`)은 viewer가 `approval.value` 노출 투영 … 을 통과할 때만 실리고". 즉 미리보기·상세에서 막은 이름 누수를 액션 반환 경로가 다시 연다(`N일 차감`은 `leave.value`).
- 실행자가 잡는가: `test/integration/leak-scan.test.ts:138-140` 액션 축은 `dtoName` 등록 여부만 본다 — 실제 반환값 투영은 검사하지 않으므로 녹색으로 지나간다.
- 완화: 누수 대상은 결재자 자신(승인·반려한 사람)과 기안자다 — 자기 문서의 다음 담당·기안자 이름은 대부분 그 사람이 화면에서 이미 볼 수 있는 값이며, `approval.value`가 꺼진 계급이 결재자가 되는 배치는 드물다. 데이터 무결성 문제 아님.
- 고칠 방향: 02 ④에 "네 액션(`submitLeaveAction`·`resubmitLeaveAction`·`approveAction`·`rejectAction`)의 결과를 등록 DTO(`nextHolderNames`→`approval.value`, `drafterName`→`approval.value`, `deductedDays`→`leave.value`)로 `project()`하고, 필드가 빠지면 토스트를 `승인 · 결재 요청됨`/`반려 · 기안자에게 돌아감`으로 줄인다" + 통합 사례(계급 `approval.value` 끄면 반환 JSON에 이름 없음).

## 8. Codex C-N02 — 07에 기존 데이터 위 증분 마이그레이션 검증 없음 → **참고**

- 플랜 `04.1-07-PLAN.md:143-147`(④·⑤): "빈 DB 증명은 **실제로 빈** `erp_test`에서 한다: `pnpm db:reset:test && … pnpm db:migrate`" · "병합 트레이서: `pnpm db:reset:test` 뒤 …". 검증 4개 명령 전부 reset 기준. `test/e2e/global-setup.ts:46`도 빈 스키마 시작. 사실.
- 그러나 운영 경로 `scripts/migrate-runner.ts:54` `await migrate(db, { migrationsFolder: … })` — drizzle 증분 적용(적용 이력 대비 새 항목만). 재생성 뒤 journal은 "main 항목 전부 보존 · 새 항목 하나 · idx = main 마지막 + 1"(07:141, 둘째 검증 명령이 단언)이라 운영 DB가 보는 것은 "이미 적용된 main 항목 + 새 SQL 하나"이고, 그 새 SQL은 빈 DB 증명이 적용한 것과 같은 파일이다. 04.1 스키마 변경은 새 테이블 4개(01:298)와 `users`의 **null 허용** 열 둘(03:217 "추가만")이라 기존 행에 의존하는 문장(NOT NULL 추가·기존 표 CHECK)이 없다 → 데이터 위 증분 적용이 빈 DB와 다르게 실패할 경로가 현재 스키마 변경에서는 보이지 않는다. 다만 "기존 데이터 있는 DB에 재생성 파일만 적용 → 행 보존 · 재실행 무변경"을 한 번 도는 검증은 값이 있고 비용이 작다.
- 고칠 방향(선택): 07 ④에 "`MAIN_SHA`의 마이그레이션까지 적용한 `erp_test`에 대표 행(사용자 1·설정 1)을 넣고 재생성 파일만 `pnpm db:migrate` → 행 수 동일 · 두 번째 `db:migrate` 무변경" 한 사례를 VALIDATION에 추가. 이번 회차에 안 넣어도 실행을 막지 않는다.

## 9. Opus B A2 — 가져오기 지난 연도 가드가 빈 환경 복원을 막는다 → **참고**(기결정의 파생 결과 · 새 사안이나 결정 번복 요구 아님)

- 플랜 `04.1-04-PLAN.md:255`: "`past_year`면 그 항목이 **무변화 행**인지 본다 — `getSettingValue(def, {asOf: 그 날짜}, deps)`(대상 환경에서 그날 이미 유효한 값: 기존 행 또는 기본값)와 … 같으면 통과, 다르면 issue … issue가 하나라도 있으면 기존대로 `ImportValidationError`로 아무것도 쓰지 않는다".
- 기결정 `docs/designs/phase04.1-revision-260924/tests-01-and-open-notes.md:19`: "8. ENG-5 편차(오케스트레이터 수용): 설정 가져오기는 지난 연도 행이 **값을 바꿀 때만** 거부한다. 지금 유효한 값과 같은 지난 연도 행은 받는다(기존 내보내기에 2000-01-01 기준 행이 늘 들어 있어 전부 거부하면 재가져오기가 불가능)". 플랜 255는 이 결정을 그대로 구현한다.
- 새 점: 결정의 근거는 시드 `2000-01-01` 행과 같은 환경 재가져오기만 들었고, "운영에서 실제로 넣은 지난 연도 행(예 2027-01-01 = 16)을 **빈 새 환경**에 복원하면 대상의 그날 값이 기본 15라 전체 거부"라는 결과(ADMN-06 복원 용도 상실 · `test/integration/settings-export.test.ts:19` (a)는 시드 행만 있어 못 잡음)는 논의된 흔적이 없다. 그러나 이는 결정된 규칙("값을 바꾸면 거부")의 직접 결과이고, CLAUDE.md §7 "사용자가 이미 정한 결정은 바꾸지 않는다"에 따라 여기서 등급을 올려 되묻지 않는다.
- 고칠 방향(오케스트레이터 메모): 04.1 안에서는 04:255에 "새 환경 복원은 이 가드에 걸린다 — 복원 절차는 지난 연도 행을 연차 조정으로 옮기거나 후속 페이즈(04.4 복원 리허설)의 `--restore`(SYSTEM viewer 한정) 모드로 한다"를 `docs/OPERATIONS.md` 한 줄로 남기고, 복원 모드 자체는 04.4 후보로 넘긴다.

---

## 요약

| # | 후보 | 판정 |
|---|------|------|
| 1 | B-NEW01 취소 경로 우회 | 경고 |
| 2 | B-NEW02 org_unit_id 비uuid → 제출 INSERT 실패 | 경고(상) |
| 3 | C-N01 = C-03 퇴직일 선행 조회 경로 없음 | 경고 |
| 4 | C-01 입사일 필수화 · E2E 4개 미포함 | **BLOCKER** |
| 5 | A-01 종결 문서 walkRoute → W13 | 경고 |
| 6 | A-02 폴백 행 step_index 미지정 | 경고 |
| 7 | B A1 액션 반환값 투영 누락 | 경고 |
| 8 | C-N02 증분 마이그레이션 검증 없음 | 참고 |
| 9 | B A2 빈 환경 복원 거부 | 참고(기결정 파생) |

BLOCKER 1건(06 E2E 범위). 경고 6건은 전부 플랜 문장 한두 줄 + 테스트 사례 하나로 닫히며 01·02·04·06에 분산된다.
