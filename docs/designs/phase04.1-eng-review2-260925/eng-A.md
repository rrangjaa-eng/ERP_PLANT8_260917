# /plan-eng-review 2차 — 레인 A (04.1-01 결재 엔진 트레이서 · 04.1-03 연차 잔고)

- 대상: `.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md`(656줄) · `04.1-03-PLAN.md`(464줄), 브랜치 `claude/phase-04.1-plan-1iqtwe` @ `1ad17aa`(origin/main `0dab476` 병합 뒤)
- 읽기 전용. 1차 리뷰(ENG-1~25) · Codex 4회차 판정 · 범위 밖(B-F04 · A-FF01) · 사용자 잠금 결정(비례 연차 · 입사일 기준 월차 · 월차/연차 분리 · 기안자=담당 → 승인+회수)은 다시 올리지 않았다.
- 판정 규칙: BLOCKER = file:line 근거로 실행 실패/잘못된 동작이 확실한 것. 이번 레인에서는 **BLOCKER 0건**.

## 요약

| 등급 | 건수 | ID |
|---|---|---|
| BLOCKER | 0 | — |
| P2 | 4 | A-01 · A-02 · A-03 · A-04 |
| P3 | 9 | A-05 ~ A-13 |

---

## 0. Scope check

| 항목 | 04.1-01 | 04.1-03 |
|---|---|---|
| 건드리는 파일 | 37(새 23 · 기존 수정 14) | 16(새 7 · 기존 수정 9) |
| 새 모듈 | `domain/approvals/{route,kinds,dto,index,tx-log}.ts` · `domain/leave/{days,dto,index,access}.ts` · `repositories/{approvals,leave-requests,org-snapshot}.ts` · `db/schema/{approvals,leave}.ts` · `lib/dates.ts` · `domain/seed/approvals-leave.ts` | `domain/leave/{balance,balance-service}.ts` · `repositories/{leave-adjustments,leave-usage}.ts` |
| 새 표 | 4(`approval_instances` · `approval_routes` · `approval_steps` · `leave_requests`) | 1(`leave_adjustments`) + `users` 열 2 |
| 설정 키 | 22(결재선 17 · 번호 5) | 1(`leave.annual_days`) |
| 새 의존성 | 0 | 0 |

크기 판단: 01은 여전히 큰 플랜이지만 ENG-22(Task 1 단위 A·B·C 커밋)로 이미 판정된 사안이라 다시 올리지 않는다. 03은 적정.

### 플랜이 가정한 기존 인터페이스 — 실측 대조

| 플랜 가정 | 실측 | 결과 |
|---|---|---|
| `recordAction(viewer, entry, deps?)` · `RecordActionDeps.appendActionLog` · `isActionTypeEnabled` 주입, fail-open | `domain/action-log/record.ts:84-92` · `:102-113` · `:118-145` 그대로 | 일치 |
| `appendActionLog(viewer, entry)`가 전역 `db`로 INSERT, `tx` 인자 없음 | `repositories/action-log.ts:21-36` `const [row] = await db.insert(actionLog).values(entry).returning();` | 일치(01이 선택 `tx` 추가) |
| `DbOrTx` 타입 | `db/client.ts:48` `export type DbOrTx = Pick<typeof db, "insert" \| "update" \| "select">;` | 일치 |
| `withTransaction(fn)` | `lib/db-transaction.ts:9-11` | 일치 |
| `loadDocumentNumberFormat`가 `getSettingValue` 다섯 번 · 비공개 | `domain/document-numbering/index.ts:68-83` `async function loadDocumentNumberFormat(` | 일치(01이 export) |
| `allocateDocumentNumber(viewer, {counterKey, year}, tx?)` | `domain/document-numbering/index.ts:96-106` | 일치 |
| `getSettingValue(def, {asOf?: Date})`, 이력형 asOf = UTC 날짜 | `domain/settings/registry.ts:46-48` `return date.toISOString().slice(0, 10);` · `:75` | 일치 — A-03의 근거 |
| `findSimpleValue` 키 하나 SELECT 하나 | `repositories/settings.ts:10-14` | 일치 |
| `applySettingsImport` 한 트랜잭션 | `repositories/settings.ts:132-160` `await db.transaction(async (tx) => {` | 일치 |
| `insertHistorizedValue` 픽스처 · `upsertSimpleValue` | `repositories/settings.ts:65-81` · `:19-33` | 일치 |
| `project(viewer, row, spec, {visible})` · `visible()` 행 없으면 거짓 | `domain/permissions/project.ts:41-58` · `visible.ts:20-22` | 일치 |
| `registerDto` 중복 name 거부 | `domain/permissions/dto-registry.ts:13-18` | 일치 |
| 누수 스캔은 DTO 레지스트리에서 케이스 생성(파일 수정 없이 새 DTO가 들어감) | `test/integration/leak-scan.test.ts:45-58` `buildDtoCases` | 일치 |
| setup이 barrel의 모든 표를 TRUNCATE | `test/integration/setup.ts:11-15` | 일치 — 새 표는 `export *`만 하면 됨(`db/schema/index.ts` 전부 `export * from`) |
| 대표 계급 id `role-ceo` · 5계급 | `domain/permissions/roles.ts:23-27` | 일치 |
| `role.value` 노출 행은 관리자·PM만 시드 | `domain/seed/index.ts:166-179` | 일치(CXF-A-F01 전제 맞음) |
| 이력형 시드 기준일 2000-01-01 | `domain/seed/index.ts:16` | 일치 |
| registry-coverage: const 이름이 domain/settings 밖에서 참조돼야 함 | `test/unit/settings/registry-coverage.test.ts:27` 정규식 · `:61-71` | 일치 — 17키는 `loadRouteConfig`가 **이름으로** 각각 참조해야 한다 |
| import-cycles가 `import … from`만 셈(side-effect import 제외) | `test/unit/import-cycles.test.ts:55` 정규식 | 일치 |
| `registerPerson` 검증 순서 · 발령 실패 보상 · `register_person_rollback` | `domain/people/index.ts:187-248` | 일치(#65 병합 뒤에도 유지) |
| `people.test.ts` 78–93행 발령 실패 사례 | `test/integration/people.test.ts:78-92` | 일치 |
| `timestamp … withTimezone` 관례 | `db/schema/*` 에 `withTimezone` 0건 · `timestamp(` 55건 | **불일치 — A-07** |
| `git show origin/claude/gsd-progress-e1nzgu:…` | 로컬에 ref 없음(`fatal: invalid object name`) · 원격에는 있음(`git ls-remote`: `15bdf48`) | **불일치 — A-06** |
| `createRole`이 노출 행을 만들지 않음 | `domain/permissions/roles.ts:97-113` | 일치 |
| `DB_POOL_MAX` 기본 5 | `lib/env.ts:54` | 일치 |

---

## 1. Architecture (최대 8)

**[P2] A-01 (confidence: 7/10) 04.1-01-PLAN.md:304 · :473 — 종결 상태 문서(approved · rejected · withdrawn)에도 walkRoute(`before_action`)를 돌리면 「막힘」이 나와 가짜 `approval.route_blocked` 경고 · `담당 없음` 표시가 생긴다**

- 플랜 원문(304): "`getApprovalView(viewer, {kind, documentId})` — 보이는 사람(계획 가정 2)이 아니면 null, 맞으면 단계 표시 목록 · viewer가 할 수 있는 행동 · version(walkRoute `at: "before_action"` — 막힘이면 지금 단계 `담당 없음`이고 승인·반려 행동 없음."
- 플랜 원문(473): "walkRoute가 「막힘」을 돌려준 `approveDocument` · `getApprovalView` · `listMyInbox`는 요청마다 문서당 한 번 `log.warn("approval.route_blocked", {instanceId, kind, round, stepIndex})`를 남긴다"
- 플랜 원문(결정표 W13, 461): "| W13 | 끝(폴백 조건 거짓) | — | — | 1건 이상 | 무관 | 행동 전 | 막힘(고아 최종 — ENG-3 · D2) |"
- 기존 코드: `lib/log.ts:22` `warn(event: string, fields?: Record<string, unknown>): void {` — 경고는 Cloud Logging에 WARNING으로 그대로 남는다.
- 문제: walkRoute 입력에 DB 상태가 없다(`walkRoute({steps, selfApproval, drafterId, snapshot, fallbackRoleId, at})`). **정상적으로 최종 승인된 문서**는 모든 단계가 처리돼 「끝 · 승인 ≥ 1 · 행동 전」 = W13 → 막힘이 된다. 그래서 기안자·처리자가 끝난 문서를 열 때마다(`getApprovalView`, 연차 상세 `canSeeLeaveDocument`가 같은 규칙을 쓰면 `listMyLeave` 행마다) `approval.route_blocked`가 찍히고 화면은 지금 단계를 `담당 없음`으로 그린다. 운영자가 로그로 막힘을 찾는 CEO-18의 목적이 소음에 묻힌다. `rejected` 차수는 `action = rejected`인 단계가 있는데 결정표에 그 칸이 없어 동작이 정의되지 않는다(반려 뒤 단계의 담당이 「지금 단계」로 보일 수 있다). truth 69의 「DB 상태가 `submitted`·`in_review`인데」라는 조건이 구현 지시(「walkRoute 안 한 곳」)로 옮겨지지 않았다.
- 고칠 방향: `getApprovalView` · `canSeeLeaveDocument` · (05의 상세)에 「상태가 `submitted`·`in_review`일 때만 walkRoute를 부른다 — 종결 상태는 저장된 처리 기록만 표시, 현재 단계 없음, route_blocked 로그 없음」 한 줄. 통합 사례 하나: 트레이서 최종 승인 뒤 기안자의 `getApprovalView` → `log.warn` 0회 · 지금 단계 없음.

**[P2] A-02 (confidence: 6/10) 04.1-01-PLAN.md:298 · :300 — 대표 폴백 단계 행의 `step_index`가 정해지지 않았고 `UNIQUE(route_id, step_index)`와 부딪칠 수 있다**

- 플랜 원문(298): "`approval_steps`(id · `route_id` FK · `step_index` int · … UNIQUE(route_id, step_index)"
- 플랜 원문(300): "대표 폴백 단계 행 삽입(`is_fallback` = true · 계급 = 대표 계급 id · 범위 `company` · 대상 id null · 이름 `대표` — …)" — `step_index` 값이 없다.
- 플랜 원문(281·412): "대표의 기록은 4단 행(`step_index` 4 · `is_fallback` 거짓)" · "1~3단 꺼짐 · 4단 대표 × 전사: 단계 행 1개 … 지금 단계 = 4단 자체" — 행이 하나여도 「4단」이라 `step_index`가 **설정 단계 번호**(빈틈 있음)로 읽힌다.
- 기존 코드(같은 UNIQUE 선례의 원시 오류 모양): `db/schema/corp-cards.ts:31` `unique("corp_cards_issuer_last4_key").on(table.issuer, table.numberLast4),` — 위반은 원시 23505로 올라온다.
- 문제: 1·3단만 켠 결재선(2·4단 꺼짐)에서 흔한 구현 `steps.length + 1` = 3이 이미 있는 3단 행과 충돌 → 대표 폴백 승인이 원시 UNIQUE 오류로 실패하고(트랜잭션 롤백) 문서는 영영 최종 승인되지 않는다. CEO-6이 「진 쪽이 원시 DB 오류가 아니라 정확한 문구」를 약속한 경로에서 원시 오류가 난다. 결정표 W7·W8 단위 사례는 순수 함수라 이 충돌을 못 잡고, 통합 CEO-1 사례(04.1-04)는 단계 전부 끈 결재선이라 빈틈이 없다.
- 고칠 방향: 「폴백 행 `step_index` = 그 차수 `max(step_index) + 1`(행 0개면 1)」을 ②에 한 구절로 고정 + 통합 사례 「2·4단 꺼짐 · 3단 빈 자리 → 대표 폴백 승인 성공」.

**[P3] A-05 (confidence: 5/10) 04.1-01-PLAN.md:300 · :465 — 조직 스냅숏만으로는 표시 재료가 모자란다(보관된 처리자 이름 · 단계 `label`의 계급·부서 이름)**

- 플랜 원문(300): "`listOrgSnapshot(viewer, asOf)`: 보관되지 않은 사람마다 id·이름·계급·`asOf` 이하 최신 발령의 팀 id·그 팀의 본부 id"
- 플랜 원문(465): "처리한 단계는 저장된 처리자 이름, 지금·남은 단계는 스냅숏 해석이다." · 401 "이미 승인한 단계의 처리자는 보관 뒤에도 그대로 보인다"
- 기존 코드: `repositories/users.ts:15` `export async function findUserById(viewer: Viewer, id: string)` — 일괄 이름 조회(보관 포함) 함수는 없다. `repositories/roles.ts:27` `findRolesByIds` · `repositories/org-units.ts:19` `findOrgUnitById`는 있다.
- 문제: 스냅숏은 보관자를 빼므로 보관된 처리자의 이름을 줄 수 없고, `label`(「계급 이름 · 없으면 부서 이름」)에 필요한 이름은 스냅숏에 없다. ② 리포지토리 목록에 이 읽기가 없어 실행자가 트랜잭션 안·행마다 읽기로 메울 위험(CEO-2 · N+1).
- 고칠 방향: ②에 `findUserNamesByIds(viewer, ids)`(보관 포함, 한 번) · 트랜잭션 전 `findRolesByIds`/`findOrgUnitById` 사용을 명시.

**[P3] A-09 (confidence: 5/10) 04.1-01-PLAN.md:306 · 04.1-03-PLAN.md:217 — `canSeeLeaveDocument`의 스냅숏 기준일이 `deps.now`를 받지 않는다**

- 플랜 원문(01:306): "`domain/leave/access.ts`의 `canSeeLeaveDocument(viewer, leaveRow, deps?)` 하나에 문서 보임 규칙(계획 가정 2 — 결재 쪽 판정은 `getApprovalView`의 규칙을 그대로 쓴다)"
- 플랜 원문(03:217): "「오늘」(…)은 공개 입구에서 `seoulToday(deps?.now)` **한 번**만 만든다 — … 안쪽 계산 도우미(…)는 `now`나 `today`를 인자로 받을 뿐 스스로 시계를 읽지 않는다"
- 기존 코드(시계를 스스로 읽는 선례): `domain/people/index.ts:38-40` `function todayIsoDate(): string { return new Date().toISOString().slice(0, 10); }`
- 문제: `getLeaveBalanceForRequest`는 잔고를 주입 시각으로 계산하지만 보임 판정(지금 단계 후보 = 스냅숏 at today)은 `canSeeLeaveDocument`의 `deps` 모양이 정해지지 않아 실제 시계로 돌 수 있다. CX-B2 통합 사례(`now` = 2027-03-15)에서 발령 `effectiveFrom`이 실제 오늘보다 뒤면 결재자가 「못 보는 사람」이 되어 null이 나온다.
- 고칠 방향: `canSeeLeaveDocument(viewer, leaveRow, { today })`로 입구의 `today`를 넘긴다고 한 구절.

**[P3] A-06 (confidence: 9/10) 04.1-01-PLAN.md:223 · :272 · :275 — 실행자가 읽어야 할 Phase 4 브랜치가 로컬에 없다**

- 플랜 원문(223): "`git show origin/claude/gsd-progress-e1nzgu:repositories/action-log.ts`" · 272 "`git show origin/claude/gsd-progress-e1nzgu:docs/ARCHITECTURE.md | sed -n 168,190p`"
- 실측: `git show origin/claude/gsd-progress-e1nzgu:repositories/action-log.ts` → `fatal: invalid object name 'origin/claude/gsd-progress-e1nzgu'.` (원격에는 `15bdf48…refs/heads/claude/gsd-progress-e1nzgu`로 존재)
- 기존 코드: `repositories/action-log.ts:21-31` 지금 시그니처(`tx` 없음).
- 고칠 방향: read_first 앞에 `git fetch origin claude/gsd-progress-e1nzgu` 한 줄. 모양은 플랜 본문(`tx?: DbOrTx` · `(tx ?? db)`)에 이미 있어 fetch 실패해도 진행 가능.

---

## 2. Code quality (최대 8)

**[P2] A-03 (confidence: 7/10) 04.1-03-PLAN.md:217 · :350 — `leave.annual_days`를 「Y-01-01 시점」으로 읽을 `Date`를 만들 길과 수락 기준 `new Date(` 0건이 부딪치고, 만드는 방식에 따라 하루가 밀려 전년도 값을 읽는다**

- 플랜 원문(217): "전부 `LEAVE_ANNUAL_DAYS`를 각 회계연도 1월 1일 시점 `asOf`로 읽는다."
- 플랜 원문(350): "(CX-B2) `domain/leave/balance-service.ts`에 `new Date(`가 0건이다(`grep -v '^\s*//' domain/leave/balance-service.ts | grep -c "new Date("`이 0"
- 플랜 원문(01:229): "이력형 설정은 `getSettingValue(def, { asOf })`에 서울 날짜를 명시로 넘긴다(레지스트리 기본 asOf는 UTC 날짜다)."
- 기존 코드: `domain/settings/registry.ts:70` `opts?: { asOf?: Date },` · `:46-48` `function dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }` · `:75` `const asOf = dateOnly(opts?.asOf ?? new Date());`
- 문제: asOf는 문자열이 아니라 `Date`만 받는다 — 「서울 날짜를 넘긴다」가 타입상 불가능하고, 서비스 안에서 `Date`를 만들면 수락 기준(`new Date(` 0건)이 깨진다. 우회로 `new Date(y, 0, 1)`(로컬 자정)을 쓰면 TZ=Asia/Seoul 개발기에서 `toISOString()`이 `Y-1-12-31`이 되어 **전년도 연차 일수**를 읽는다(CI는 UTC라 녹색 — 로컬에서만 틀림, 「이력형 16일」 사례도 CI에서는 못 잡는다).
- 고칠 방향: 변환을 한 곳에 고정 — 예: 03 files_modified에 `lib/dates.ts`를 더하고 `seoulDateToUtcDate("YYYY-01-01")`(= `new Date(\`${d}T00:00:00Z\`)`) 도우미를 두거나, `domain/leave/balance.ts`(순수)에 `yearStartAsOf(y)`를 둔다. 수락 기준의 grep 범위가 이 도우미를 제외하도록 문구를 맞춘다.

**[P3] A-10 (confidence: 6/10) 04.1-01-PLAN.md:56 · :395 · :486 — `nextStep` 허용 칸 표가 플랜에 없다**

- 플랜 원문(56): "`nextStep(status, event)`는 draft→submitted→in_review→approved/rejected/withdrawn 표만 허용하는 순수 함수"
- 플랜 원문(395): "nextStep: 여섯 사건 × 여섯 상태 표 전체를 단언 — 허용 칸은 기대 상태, 나머지는 `InvalidTransitionError`"
- 기존 코드(설계 스케치만 존재): `.planning/phases/04.1-approvals-leave/04.1-RESEARCH.md:203` `// draft → submitted → in_review → (approved | rejected | withdrawn)` — 선형 사슬로만 적혀 있다.
- 문제: 36칸 중 허용 칸(예: `submitted + approve_final → approved`(1단짜리 결재선 · `test_memo`), `submitted + reject/withdraw`, `in_review + approve → in_review`, `rejected + resubmit → submitted`)이 어디에도 표로 없다. 문구를 선형으로 읽으면 `submitted → approved`가 거부된다. 04.1-02의 CX-B1 종결 판정이 「`nextStep` 허용 표와 같은 표에서 읽는다」고 하므로 표가 두 플랜의 계약이다.
- 고칠 방향: Task 3 ②에 허용 칸 표(6×6) 한 장.

**[P3] A-07 (confidence: 9/10) 04.1-01-PLAN.md:298 — 「기존 관례 `withTimezone`」은 사실과 다르다**

- 플랜 원문: "`created_at`·`updated_at` timestamptz … 열 이름·제약은 기존 스키마 파일 관례(snake_case, `withTimezone`)를 그대로 따른다."
- 기존 코드: `db/schema/quote-lines.ts:39` `createdAt: timestamp("created_at").notNull().defaultNow(),` — `db/schema/`에 `withTimezone` 0건.
- 문제: 실행자가 「관례대로」를 택하면 timestamp(무 tz), 「timestamptz」를 택하면 새 표만 다른 타입 — 어느 쪽이든 문장이 모순. 03의 `createdOn`(조정 `created_at` → 서울 날짜)은 무 tz 열 + DB 기본 `now()`일 때 DB 세션 TimeZone이 UTC라는 가정에 기댄다.
- 고칠 방향: 한쪽으로 명시(관례 따르기라면 「`timestamp` 무 tz — 기존 55곳과 같음」).

**[P3] A-11 (confidence: 8/10) 04.1-01-PLAN.md:306 vs :526 — `listMyLeave` 시그니처가 한 플랜 안에서 둘이다**

- 플랜 원문(306): "`getLeave`·`listMyLeave(viewer, fiscalYear)`가 이것만 부른다" / (526): "`domain/leave/index.ts`의 `listMyLeave(viewer, input, deps?)`도 ①과 같은 요청 단위 메모를 만들어"
- 기존 코드(주입 선례): `domain/people/index.ts:107` `export async function listPeople(viewer: Viewer): Promise<PersonDto[]> {`
- 고칠 방향: `listMyLeave(viewer, { fiscalYear }, deps?)` 하나로.

**[P3] A-12 (confidence: 4/10) 04.1-03-PLAN.md:213 — 서비스가 `buildLeaveGrants`에 넘길 `fiscalYears`가 정해지지 않았다**

- 플랜 원문: "`buildLeaveGrants({hireDate, resignationDate, fiscalYears, annualDaysByYear, adjustments, asOf})`"
- 기존 코드: 없음(새 함수) — 인접 근거 `repositories/settings.ts:37-50` `findEffectiveValue`는 키·날짜마다 한 번.
- 문제: 입사 연도 H에 연차 조정(fiscalYear H, 소멸 H-12-31)이 있으면 H의 신청은 그 조정 부여를 월차보다 먼저 써야 하는데(소멸 빠른 순), 서비스가 `[Y]`만 넘기면 H 조정 부여가 목록에 들어가는지가 구현 재량이다. 결과로 H+1 조회의 월차 남음이 틀릴 수 있다.
- 고칠 방향: 「`fiscalYears` = 입사 연도(없으면 Y−1) ~ Y, 조정은 전부」 한 구절.

---

## 3. Tests (최대 8)

**[P2] A-04 (confidence: 8/10) 04.1-03-PLAN.md:372 · :217 — 권한·검증 사례가 threat 표에만 있고 behavior에 없다(T-04.1-16 high)**

- 플랜 원문(372): "| T-04.1-16 | Elevation of Privilege | `setHireDate` · `setResignationDate` · `addLeaveAdjustment` | high | mitigate | 도메인에서 사람 관리 쓰기 권한을 판정하고 거부 시 예외. 통합 테스트가 기획 PM 계급의 호출 거부를 단언한다 |"
- 플랜 원문(217): "`setHireDate` · `setResignationDate`(쓰기 권한 · 날짜 형식 · 퇴직일 ≥ 입사일 검증 · 행동 로그 `document_update` entity `user` detail 필드명)"
- 기존 코드(같은 모양의 기존 사례): `test/integration/people.test.ts:94` `it("사람 메뉴 쓰기 권한이 없는 계급에서 등록이 거부된다", async () => {`
- 문제: Task 1·3 behavior 어디에도 ① `setHireDate`·`setResignationDate`·`addLeaveAdjustment`의 PM 거부, ② `퇴직일 < 입사일` 거부, ③ 두 함수의 행동 로그, ④ `getLeaveBalanceForUser`의 보기 권한 없음 거부가 없다(있는 것은 `listLeaveAdjustmentsForUser` 거부 하나). 퇴직일은 결재선 후보를 지우는 입력이라(03:54) 권한 누락은 결재 우회와 같다. 수락 기준에도 없어 빠진 채 녹색이 된다.
- 고칠 방향: `people.test.ts`·`leave-balance.test.ts`에 네 사례를 behavior로 올린다.

**[P3] A-08 (confidence: 6/10) 04.1-01-PLAN.md:278 · :287 — 번호 `LV26-…`를 단언하는 사례가 시계 주입을 요구하지 않는다(2027-01-01부터 빨간색)**

- 플랜 원문(278): "인스턴스 `submitted`, 번호 `LV26-0001`" · (287) "번호 여섯 개가 서로 다르다(`LV26-0001`~`LV26-0006`"
- 플랜 원문(308 · 01:238): "번호 연도 = 첫 제출 날짜(서울 날짜 `seoulToday` — CEO-11)의 연도"
- 기존 코드(벽시계 기본): `domain/settings/registry.ts:75` `dateOnly(opts?.asOf ?? new Date())`
- 문제: LV27 사례만 `deps.now`를 명시한다. 트레이서·동시 6건 사례가 실제 시계를 쓰면 연도가 바뀌는 날 깨진다(round2 규칙 「no wall-clock dependence」).
- 고칠 방향: 두 behavior에 `deps.now = 2026-09-24T03:00Z` 명시.

### 코드 경로 · 사용자 흐름 커버리지

```
04.1-01 결재 엔진
├─ nextStep(status,event) 36칸 ............................ ★★★ unit next-step (허용 표 미기재 — A-10)
├─ resolveHolders R1~R6 ................................... ★★★ unit resolve-step
├─ walkRoute W1~W13 (at 두 값) ............................ ★★★ unit resolve-step 19칸
│   └─ 종결 상태 문서에 walkRoute ......................... GAP (A-01) — 사례 없음
├─ prepareSubmission / submitLeave
│   ├─ 트레이서 제출·번호·4행 ............................. ★★★ integ route-fixed (시계 주입 — A-08)
│   ├─ LV27 서울 날짜 ..................................... ★★★ integ
│   ├─ 풀 5 · 6건 동시 .................................... ★★☆ integ concurrency (시계 — A-08)
│   ├─ 로그 실패 롤백 · 로그 꺼짐 ......................... ★★★ integ
│   ├─ 설정 한 문장 스냅숏(결정적 · 경주) ................. ★★★ integ + unit route-config
│   └─ 막힘 → 제출 거부(대표 없음) ........................ ★★☆ unit + prepareSubmission
├─ approveDocument
│   ├─ 순서 (1)version (2)종결 (3)후보 (4)(5)(6)(7) ....... ★★★ integ CEO-8 · D1 단독
│   ├─ 대표 폴백 행 삽입 .................................. ★☆☆ unit W7/W8만 — 빈틈 있는 step_index GAP (A-02)
│   └─ 동시 승인 두 순서 .................................. → 04.1-02 Task 3
├─ listMyInbox / getApprovalView (읽기 전용 · D2) ......... ★★★ integ 고아 최종 describe
├─ previewRoute 투영 켜짐/꺼짐/N단 ........................ ★★★ integ inbox-projection
├─ 노출 메모 ≤ 2 (inbox · listMyLeave) .................... ★★★ integ
├─ getLeave/listMyLeave 보임(무관한 사람 404) ............. ★☆☆ 03 잔고 null 사례로 간접, [→E2E] 04.1-06
├─ seedApprovalsLeave 멱등 · 관리자 값 보존 ............... GAP (P3, seed 재실행 사례 없음 — 기존 seed-permissions만)
└─ migration journal 가드 a~f ............................. ★★★ unit

04.1-03 연차 잔고
├─ annualGrantQuarters R1 · ENG-4 ......................... ★★★ unit (다섯 + 경계)
├─ buildLeaveGrants 월차 말일·11번째·퇴직 경계 ............ ★★★ unit
├─ allocateLeave 소멸순·월차 먼저·CX-R02·음수 조정 ........ ★★★ unit
├─ summarize / format* (D3 · D4 · 문자열 원문) ............ ★★★ unit + integ D3 픽스처
├─ 서비스 네 조회 · deps.now(CX-B2) ....................... ★★☆ integ (보임 판정 시계 — A-09)
├─ LEAVE_ANNUAL_DAYS Y-01-01 asOf ......................... ★★☆ integ 이력형 — TZ 개발기 GAP (A-03)
├─ addLeaveAdjustment 검증·원자성·ENG-13 .................. ★★★ integ + unit
├─ addLeaveAdjustment PM 거부 ............................. GAP (A-04)
├─ listLeaveAdjustmentsForUser 연도·키·보기전용·거부 ...... ★★★ integ
├─ setHireDate / setResignationDate 권한·검증·로그 ........ GAP (A-04)
├─ registerPerson 입사일 형식·보상 ........................ ★★★ integ people
├─ org-snapshot 퇴직 경계(당일 포함) ...................... ★★★ integ
└─ 동시 최종 승인 두 건 합계 .............................. ★★★ integ

사용자 흐름
├─ 직원: 연차 신청 → 팀장 승인 → 대표 승인 → 잔고 감소 .... ★★★ integ 트레이서(01 + 03 Task 1)
├─ 대표 본인 연차(폴백 자기 승인) ......................... ★★☆ unit W8 + [→E2E] 04.1-05
├─ 끝난 연차 상세 보기(기안자) ............................ GAP (A-01) [→E2E] 04.1-06
├─ 관리자: 입사일·퇴직일 입력 → 후보 제외 ................ ★★☆ 후보 제외만, 권한 GAP (A-04)
└─ 관리자: 조정 → 잔고 줄 반영 ............................ ★★★ integ
```

### 기존 동작 회귀 위험(CRITICAL 후보 점검)

| 변경 | 회귀 위험 | 근거 · 판정 |
|---|---|---|
| `appendActionLog(v, e, tx?)` | 낮음 | 선택 인자 · `RecordActionDeps.appendActionLog: typeof defaultAppendActionLog`(`record.ts:85`)에 2인자 목도 대입 가능 |
| `allocateDocumentNumber` 선택 `format` | 낮음 | 없으면 기존 경로 — 기존 `document-numbering`·`document-counters-concurrency` 통합이 지킴 |
| `users` 열 2 추가 | 낮음 | better-auth는 `additionalFields`(`lib/auth.ts:28`)에 없는 열을 세션에 싣지 않음 · `PERSON_DTO_SPEC` 투영 |
| `registerPerson` 입사일 | 중간 | 기존 `people.test.ts` 전체가 03 verify에 포함 — 안전망 있음 |
| `INFO_ITEMS` +2 · `SETTING_DEFS` +23 | 낮음 | 시드 루프·registry-coverage가 자동 포함 · 행 수 단언하는 기존 테스트 없음(검색 0건) |
| `listOrgSnapshot` 퇴직 조건 | 없음 | 새 함수(01) — 기존 호출자 없음 |

CRITICAL 등급 회귀 위험은 찾지 못했다.

---

## 4. Performance (최대 8)

**[P3] A-13 (confidence: 5/10) 04.1-01-PLAN.md:300 · :304 — `listMyInbox`의 결재선 읽기가 일괄이라고 적혀 있지 않다(ENG-18로 계수 범위에서 빠진 부분)**

- 플랜 원문(300): "내 결재함 후보 목록용 진행 중 인스턴스 목록(`submitted`·`in_review`)" · (304) "진행 중 인스턴스마다 walkRoute(`at: "before_action"`)를 돌려"
- 기존 코드(묶음 조회 선례): `repositories/team-memberships.ts:27` `export async function findMembershipsAtDate(` (#56 N+1 수정)
- 문제: 결재함 한 번이 회사 전체 진행 중 문서마다 차수·단계를 따로 읽으면 N+1이다. 30명 규모라 치명적이지 않지만 #56과 같은 결함이 다시 생긴다. (ENG-18이 「단언 범위」만 좁혔으므로 구현 지시로 한 줄 두는 것은 다른 문제다.)
- 고칠 방향: 「진행 중 인스턴스 목록은 차수·단계를 `inArray(instance_id)` 한 번으로 함께 읽는다」 한 구절. 부수: `leave_requests(drafter_id)` · `leave_adjustments(user_id)` 인덱스는 30명 규모에서 불필요 — 추가 권고 없음.

잠금·트랜잭션: 번호 카운터 행 잠금이 마지막 쓰기(01:306) · 승인은 version 조건 UPDATE 하나(01:304) · 조정 트랜잭션은 INSERT 2개(03:318) — 풀 5에서 교착 경로 없음을 실측 코드(`repositories/document-counters.ts:47-67`, `record.ts:127-131` 주입 게이트)로 확인했다. 트랜잭션 안에서 풀을 잡는 호출은 플랜 지시대로면 0건.

---

## 실패 모드 표

| 경로 | 현실적 실패 | 테스트? | 오류 처리? | 조용히 틀림? |
|---|---|---|---|---|
| 끝난 문서 `getApprovalView` | W13 막힘 → `route_blocked` 경고 · `담당 없음` 표시 | 없음 | 해당 없음 | **예**(로그 소음 · 잘못된 표시) — A-01 |
| 대표 폴백 승인(빈틈 있는 결재선) | `UNIQUE(route_id, step_index)` 23505 | 없음 | 원시 오류 | 아니오(실패가 보임, 문서 영구 정체) — A-02 |
| 연차 일수 이력 읽기(KST 개발기) | 전년도 값 사용 | CI에서 못 잡음 | 없음 | **예** — A-03 |
| 퇴직일·입사일·조정 권한 누락 | PM이 퇴직일 넣어 결재자 제거 | 없음 | 플랜상 있음 | **예** — A-04 |
| 결재자 잔고의 보임 판정(주입 시계) | 실제 시계 스냅숏으로 null | 부분 | null 반환 | 예 — A-09 |
| 제출 중 설정 변경 | 두 시점 섞임 | 있음(결정적 · 경주) | 한 문장 SELECT | 아니오 |
| 로그 INSERT 실패 | 전이만 커밋 | 있음 | 같은 tx 롤백 | 아니오 |
| 동시 승인 | 이중 기록 | 04.1-02 | version 0행 → 충돌 | 아니오 |
| 담당 전원 소멸 | 고아 최종 | 있음(D2) | 막힘 · 회수 | 아니오 |
| 연도 넘어가는 날 테스트 | `LV26` 단언 실패 | — | — | 아니오(빨간색) — A-08 |
| 동시 제출 6건 · 풀 5 | 풀 고갈 교착 | 있음 | tx 안 풀 호출 0 | 아니오 |

---

## What already exists — 재사용 메모

- **요청 단위 노출 메모**: `domain/people/index.ts:111-124`(`visibleCache` + `memoizedVisible`, #65 병합)가 01 Task 4 ①이 만들 메모와 글자 그대로 같은 모양이다. 01·03·05가 같은 모양을 세 번 쓰게 되므로(2+ 호출자) `domain/permissions/`에 `createVisibleMemo()` 하나를 두는 것이 공유 코드 기준을 충족한다 — 단 `domain/permissions/project.ts`·`visible.ts`는 01에서 수정 금지 파일이니 새 파일로(선택, P3 수준 권고).
- **묶음 소속 조회**: `repositories/team-memberships.ts:27` `findMembershipsAtDate` · `domain/org/index.ts:209` `teamsAtDate` — `listOrgSnapshot`의 「asOf 이하 최신 발령」 쿼리 모양을 그대로 가져올 수 있다(새로 짜지 않는다).
- **version 조건 UPDATE**: `repositories/quote-lines.ts:98-131`(`WHERE version = expectedVersion` · `version + 1` · null = 충돌).
- **원자 번호**: `repositories/document-counters.ts:47-67` — 01은 선택 `format`만 더하면 된다.
- **서울 시각 Intl**: `domain/quotes/lines.ts:455-460`(`timeZone: "Asia/Seoul"`).
- **보상 보관**: `domain/people/index.ts:224-241`(`archive(SYSTEM_VIEWER, …)` + `register_person_rollback`) — 03 `saveHireDate` 실패 경로가 그대로 복사.
- **DB CHECK**: `db/schema/corp-cards.ts:32-35` `check(…, sql\`…\`)`.
- **이력형 픽스처**: `repositories/settings.ts:65` `insertHistorizedValue`(03 계획 가정 6과 일치).
- 새로 만들 필요 없음이 확인된 것: 누수 스캔은 `registerDto`만으로 케이스 생성(`leak-scan.test.ts:45-58`), TRUNCATE는 barrel 자동(`setup.ts:11-15`).

---

## 이미 판정된 것 · 올리지 않은 것

- 01 크기(ENG-22) · 결재함 계수 범위(ENG-18) · 재시드 노출 되돌림(A-FF01) · 설정 화면 보기 전용(B-F04) · 월차 근속 첫 1년(사용자 결정) · 입사 다음 해 비례(사용자 결정) · 퇴직일 ≠ 로그인 종료(Deferred) · 문서 종류 등록 한 곳(CEO-3, 04.1-02) · 이중 제출(CEO-12, 04.1-06).
