# Phase 04.5 — Codex final-2 delta 판정 (Fable, 읽기 전용)

대상: `docs/reviews/phase-04.5/codex-plan-review-final-2.md` (commit 24d69ed 기준). 코드·플랜 인용을 직접 확인했다.

## 1. [MAJOR] 공유 잠금 + 전역 `db` 조회 → 풀 고갈 — **사실. 판정: MINOR fix(교정 필수, 실행 전 플랜에 반영)**

인용 검증
- `lib/env.ts:54` `DB_POOL_MAX: numberWithDefault(5)`, `db/client.ts:29·34` `max: env.DB_POOL_MAX` — 맞음. 현재 브랜치에는 `connectionTimeoutMillis`가 없다(무한 대기). Phase 4 브랜치(`origin/claude/gsd-progress-e1nzgu` `db/client.ts` +7줄, 04-32)는 `POOL_CONNECTION_TIMEOUT_MS = 5000` — 5초 뒤 실패. 맞음.
- `repositories/roles.ts:12` `listRoles` → `db.select()`, `repositories/field-definitions.ts:10` `listFieldDefinitions` → `db.select()` — 맞음. 둘 다 `tx` 인자 없음.
- `lib/db-transaction.ts` `withTransaction = db.transaction(fn)` — tx는 풀 연결 하나를 콜백 끝까지 점유한다.
- 플랜 01 T1④: `withTransaction` 안 첫 문장 `lockCustomFieldGrants(tx)` → **`listRoles(viewer, { includeArchived: true })` 시그니처 그대로** → insert. 03 T1②: 같은 잠금 → **`listFieldDefinitions` 시그니처 그대로**. 03 T1⑤: grant 실패는 `log.warn` 뒤 계속(삼킴). 전부 맞음.

시나리오(확인): 풀 5. 잠금 경합 트랜잭션 5개가 각각 연결을 쥐면(1개 보유자 + 4개 `pg_advisory_xact_lock` 대기) 보유자의 `listRoles`/`listFieldDefinitions`는 6번째 연결을 기다린다 → 현재 브랜치는 영구 교착, Phase 4 머지 뒤엔 5초 후 실패. 03 경로에서 실패하면 삼켜져 그 계급의 노출 행이 영구 누락(D10-13 「행 없음 = 숨김」). **정합성(잠금 뒤 다른 연결의 READ COMMITTED 스냅샷도 상대 커밋을 본다)은 유지되므로 순서 경합 수정 자체는 유효하고, 남는 것은 활성(liveness) 결함이다.** 10~30명 규모에서 잠금 경합 트랜잭션 5개 동시는 드물지만(일반 쿼리는 연결을 바로 놓으므로 셈에 안 들어감), 고침이 선택 인자 둘이라 비용이 거의 0이고 「잠금·조회·삽입을 같은 연결에서」가 올바른 모양이다. BLOCKER는 아니지만 실행 전 플랜 교정은 필수.

`tx?: DbOrTx` 추가 허용 여부 — **허용.**
- `repositories/roles.ts`·`repositories/field-definitions.ts`는 PATTERNS.md 「Append-Only / 공유 파일 주의 목록」(386행~)에 **없다**. Phase 4 브랜치의 `roles.ts` diff(-9/+1)는 main의 #65 `findRolesByIds`가 그 브랜치에 아직 없는 것뿐(브랜치가 main보다 뒤) — Phase 4 플랜이 `roles.ts`·`field-definitions.ts`를 고치지 않는다.
- Phase 4 호출 제약은 CONTEXT.md 43행 「`listFieldDefinitions(viewer, entity)` 호출 모양을 바꾸지 않는다」 뿐이다. 끝에 `tx: DbOrTx = db`를 더하면 `domain/projects/index.ts:30`·`domain/quotes/lines.ts:27`의 두 인자 호출은 그대로다. 같은 방식의 선례가 이미 있다: `repositories/quote-lines.ts:23 findQuoteLinesByIds(viewer, ids, tx: DbOrTx = db)`, `projects.ts:246`, `document-counters.ts:51`. 01 T1③이 `insertFieldDefinition`에 쓰는 것과 같은 모양.
- 막는 것은 **플랜 내부 자기 제약**뿐이다: 01 98행 「`listFieldDefinitions`는 바꾸지 않는다」·180행 「`listFieldDefinitions`…은 바꾸지 않는다」·206행 「본문 diff가 비어 있다」, 05 92행·231행·259행, 02 201행. 이들은 「조건·정렬 본문 보존」이 의도이므로 문구를 「조건·정렬은 바꾸지 않는다(선택 `tx`만 추가)」로 좁힌다.

정확한 최소 수정(어느 플랜, 어느 태스크)
1. **01 T1③** (리포지토리): `insertFieldDefinition`과 같은 줄에 「`listFieldDefinitions`에도 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 쿼리를 그 `tx`로 돌린다(조건·정렬 불변, 두 인자 호출은 그대로 — `quote-lines.ts:23` 선례). `repositories/roles.ts`의 `listRoles`도 같은 모양으로 `tx: DbOrTx = db`를 끝에 더한다(`db` import 유지 — 기본값에 쓴다).」 180행의 「`listFieldDefinitions`·…은 바꾸지 않는다」→「`findFieldDefinitionById`·`updateFieldDefinition`은 바꾸지 않는다. `listFieldDefinitions`는 선택 `tx`만 더한다」.
2. **01 T1④** (domain): 「계급 목록(`listRoles(viewer, { includeArchived: true }, tx)` — **잠금을 쥔 같은 연결**에서 읽는다. 전역 `db`로 읽으면 풀(`DB_POOL_MAX`=5)이 잠금 대기 트랜잭션으로 차면 보유자가 6번째 연결을 영구히(Phase 4 머지 뒤 5초) 기다린다)」. 계급 목록 dep 타입은 `(viewer, opts, tx: DbOrTx) => Promise<…>` — 06 픽스처(`findRoleById` 한 행)·03 경합 테스트의 주입 함수는 세 번째 인자를 받기만 하면 된다(06 160행 「deps의 실제 이름은 01 SUMMARY 기준」이라 문구 변경 불필요).
3. **01 T1 verification**: 202행 뒤에 「`domain/custom-fields/admin.ts`에 `listRoles(` 호출이 `tx`를 넘긴다(`grep -c "includeArchived: true }, tx)"` ≥ 1)」 추가. 206행 「`listFieldDefinitions`의 본문 diff가 비어 있다」→「`listFieldDefinitions`의 `where`·`orderBy` 줄 diff가 비어 있고, 시그니처 변경은 끝의 `tx: DbOrTx = db` 한 인자뿐」. 01 98행 「`listFieldDefinitions`는 바꾸지 않는다」→「조건·정렬은 바꾸지 않는다(선택 `tx`만)」. 01 287행은 그대로(호출부 결과 불변).
4. **03 T1②**: 「`listFieldDefinitions(viewer, entity, tx)`로 읽음(같은 연결 — 01 T1④와 같은 이유)」. 194행 검증에 「`listFieldDefinitions(`가 `tx)`로 끝난다」 추가.
5. **03 T1 behavior** 회귀 테스트 한 줄 추가(Codex 제안 채택, 단순형): 「(통합, 풀 고갈 — T-04.5-07) `createFieldDefinition`을 `DB_POOL_MAX`(5)개 `Promise.all`로 동시에 부르면 5개 전부 성공하고 계급마다 5칸의 노출 행이 있다(전역 `db` 조회면 보유자가 연결을 못 얻어 테스트 타임아웃으로 빨갛다 — RED가 타임아웃 형태임을 SUMMARY에 적는다).」
6. **05 92·231·259행, 02 201행** 문구: 「`listFieldDefinitions`의 조건·정렬은 고치지 않는다(01이 더한 선택 `tx`는 호출 모양을 바꾸지 않는다)」로 통일. `domain/vendors`의 `repoListFieldDefinitions(viewer, VENDOR_ENTITY)` 두 인자 호출은 그대로.

## 2. [MINOR] 경합 테스트 200ms 대기 — **사실. 판정: MINOR fix(03 T1 behavior·②)**

03 162행: 「약 200ms 쉼 … 쉬는 시간은 RED를 결정적으로 만든다」. 잠금 없는 grant가 200ms 안에 정의 조회를 못 끝내면(느린 CI·첫 연결 워밍업) 조회가 칸 커밋 뒤에 돌아 잠금 없이도 초록 → RED 확인(171행 「잠금 줄 없이 먼저 구현… 빨간 것을 본 뒤」)이 시간 의존. 맞음.

결정적 동기화 지점(단순형, 양방향 종료 보장):
- **03 T1②**에 `grantCustomFieldsToRole(viewer, roleId, deps?)` — `deps.listFieldDefinitions`(기본 리포지토리 함수) 하나만 주입 가능(01의 `*Deps` 선례). 운영 호출은 그대로.
- **03 T1 behavior 162행** 교체: 「01의 계급 목록 dep에 주입한 함수는 ① 진짜 `listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx)`로 읽음 → ② `insertRole`로 R 삽입(커밋) → ③ `defsRead` 프로미스를 만들고, `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id, { listFieldDefinitions: async (...a) => { const rows = await listFieldDefinitions(...a); resolveDefsRead(); return rows; } })`를 **await 없이** 띄워 담아 둠 → ④ `await Promise.race([defsRead, waitForAdvisoryWaiter()])` — `waitForAdvisoryWaiter`는 20ms마다 `db.execute(sql\`select 1 from pg_locks where locktype = 'advisory' and not granted\`)`가 1행 이상일 때 끝나는 폴링(`test/integration/setup.ts`가 이미 `db`·`sql`을 쓴다; 안전판 5초 넘으면 던진다) → ⑤ R이 빠진 목록을 돌려줌. 이후 단언은 그대로(R의 `cf.vendor.<키>` 행 정확히 1개·`visible = true`).」
- 왜 결정적인가: 잠금 **없으면** grant가 곧장 정의를 읽어 `defsRead`가 풀린다 → 칸이 아직 커밋 전이라 grant는 새 칸을 못 봄 → 행 없음 → 반드시 RED. 잠금 **있으면** grant는 정의를 읽기 전에 `pg_advisory_xact_lock` 대기에 걸려 `pg_locks`에 `granted = false` 행이 보인다 → race가 풀려 칸 트랜잭션이 커밋 → grant가 이어서 새 칸을 보고 행을 씀 → GREEN. 두 경우 모두 고정 지연 없이 관측 가능한 사건으로 진행한다(01이 잠금 전에 계급을 읽는 변형도 `defsRead`로 끝나 RED).
- 194행 검증에 「경합 테스트에 `setTimeout`/고정 지연이 없다(`grep -c "setTimeout" test/integration/custom-field-visibility.test.ts` = 0)」 추가.

## 3. [NOTE] 02 T2⑥ 입력 상태 초기화 경계 — **사실. 판정: MINOR fix(02 T2⑥ 문구)**

02 207행: 「폼 컴포넌트 안은 두 층이다(**새 컴포넌트·파일 없음**): … 폼 본문(입력 칸 묶음·**선택지 React 상태**·…)은 안쪽 `key={version}`으로 감싸」. React에서 key는 **컴포넌트 인스턴스**의 동일성을 바꾼다 — 같은 함수 컴포넌트 안의 `<div key={version}>`/Fragment는 DOM만 다시 만들고 그 함수의 `useState`(선택지 상태)는 남는다. 「새로 불러오기」 뒤 선택지 편집기가 옛 값을 유지하므로 38행·193행의 「최신 행(…활성/보관 선택지)을 채우고」가 깨진다. 유효한 지적.

최소 수정(**02 T2⑥**): 「(새 컴포넌트·파일 없음)」→「(새 **파일** 없음 — 같은 파일 안의 내부 컴포넌트 하나)」. 「안쪽 `key={version}`으로 감싸」→「같은 파일의 비공개 함수 컴포넌트(예: `EditFormBody`)에 선택지 `useState`·숨은 `version`·`Form.Actions`를 두고 `<EditFormBody key={version} … />`로 렌더한다 — 훅 상태는 컴포넌트 인스턴스에 붙으므로 요소 key로는 초기화되지 않는다(`vendor-form.tsx:210 VendorCustomField` 같은 파일 내 보조 컴포넌트 선례).」 **02 T2 behavior 193행(E2E)** 끝에 「선택형 칸이면 새로 불러오기 뒤 선택지 편집기의 활성·보관 목록도 먼저 저장된 값이다」 추가. UI-SPEC 178행 `key={id}:{version}`과 의미는 동일하므로 UI-SPEC 변경 없음.

## 총평
BLOCKER 없음. 셋 다 사실이며 실행 전 플랜 문구 교정으로 닫힌다(코드 변경 규모: 선택 `tx` 인자 2개 + grant `deps` 1개 + 내부 컴포넌트 1개). 01 T1③④·03 T1②·behavior, 02 T2⑥, 05·02의 「`listFieldDefinitions` 불변」 자기 제약 문구를 위 목록대로 고친 뒤 Codex 재확인 없이 실행 가능하다고 본다.
