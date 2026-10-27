# 07.1 /plan-eng-review — 그룹 C (07.1-05 · 06 · 08 · 10 · 17) + 19플랜 실행 순서 점검

대상: main b9acdd8. 읽기 전용. 테스트 미실행(DB 없음) — 판정은 코드 인용으로.
이미 처리된 지적(plan-checker r1·r2 SUMMARY, plan-design final-check)과 겹치는 것은 뺐다.

합계: **P1 3 · P2 9 · P3 10** · 결정 필요 2

---

## 07.1-05 내보내기 상한 · 확인 필요 풀기 로그 · 홈택스 공유 · 번호 접두

### 1. Architecture

**[P1] (confidence: 8/10) 07.1-05-PLAN.md:147 — 행동 로그 화면 건수로 `PruneControl` 건수를 재사용하라는 지시가 틀린 수다**
- 플랜: `행동 로그 내보내기 단추도 같은 꼴(\`PruneControl\`이 받는 건수 재사용)`
- 코드 `app/(app)/admin/action-log/page.tsx:76`: `const pruneCount = rows.filter((row) => !row.prunedAt && isPrunableActionType(row.actionType)).length;`
- 정리 가능 건수(정리 안 됨 ∧ 정리 가능 종류)는 내보내기 대상(`queryActionLog` 전체 — 끌 수 없는 종류 · `includePruned`면 정리된 행 포함)보다 작다. 서버는 전체 길이로 거부하고 화면은 더 작은 수로 활성 → 버튼이 활성인데 서버가 `5,000건 넘음`으로 거부(토스트 `실패`)하는 어긋남. E2E 5,001 픽스처가 정리 가능 종류로만 만들어지면 시험이 거짓 통과한다.
- 고칠 내용: :147을 「화면 건수는 `rows.length`(page.tsx:70 `queryActionLog` 결과 — 서버 판정과 같은 집합)를 `ExportButton`에 넘긴다」로. E2E 픽스처에 끌 수 없는 종류(`excel_export` 등) 행을 섞어 두 수가 갈리는 사례 하나.

**[P2] (confidence: 7/10) 07.1-05-PLAN.md:145 · :261 — 행동 로그 상한이 「읽기 전 count」가 아니다(위협 표 T-07.1-05-01 완화가 거짓)**
- 플랜 :145 `count 질의를 새로 만들지 않고 \`queryActionLog\` 결과(JS 거름 뒤) 길이로 판정` · :261 `서버 5,000건 상한 · 읽기 전 count`
- 코드 `domain/action-log/index.ts:269-272`: `const rows = await filterActionLog(viewer, filter);` → `// 이중 방어 — SQL where절과 같은 계약을 순수 함수로 다시 확인한다.` 그 뒤 이름 풀기 · 투영까지 전부 끝난 다음에야 길이를 안다.
- A5의 「JS 거름이라 SQL count와 다르다」는 전제가 코드 주석(「SQL where절과 같은 계약」)과 맞지 않는다 — SQL 쪽 `limit 5001`이 같은 수를 낸다.
- 고칠 내용: `filterActionLog`(repositories)에 `limit`을 받아 `LIMIT+1`행만 읽고 길이로 거부(RESEARCH A5의 원안), 또는 위협 표 :261을 「직렬화 전 거부(읽기 비용은 화면과 같음)」로 정정. files_modified에 저장소 파일 추가 필요.

**[P2] (confidence: 7/10) 07.1-05-PLAN.md:143 — 증빙 「읽기 전 count」를 `export.ts`에서 할 재료가 없다**
- 플랜: `listAllEvidenceRecords 전에 countAndSumForScope로 건수를 재`
- 코드 `domain/evidence-records/export.ts:41` `const { filters, rows } = await listAllEvidenceRecords(viewer, query);` — 범위(`scope`)·저장소 거르개는 `domain/evidence-records/index.ts:425` 비공개 `listInputsFor` 안에서만 만들어진다. `countAndSumForScope(viewer, scope, filters)`(repositories/evidence-records.ts:381)는 scope를 받아야 한다.
- 결과: 실행자가 `domain/evidence-records/index.ts`(files_modified에 없음 — 07.1-01 몫 파일)를 고치거나 범위 계산을 export.ts에 복제한다(G6 「화면과 파일이 같다」 위반 위험).
- 고칠 내용: `listAllEvidenceRecords`에 `{ limit }` 옵션을 더해 index.ts 안에서 `countAndSumForScope` 합 > 상한이면 던지게 하고 files_modified에 `domain/evidence-records/index.ts` 추가(05는 01에 depends_on이 있어 순서 문제 없음).

**[P3] (confidence: 5/10) 07.1-05-PLAN.md Task 3 — 접두 refine을 스키마에 넣으면 저장된 값 읽기도 깨진다**
- 코드 `domain/settings/registry.ts:149` `return def.schema.parse(row.value);` — refine은 쓰기뿐 아니라 읽기에도 적용. 운영에 접두 `K`가 이미 저장돼 있으면 구매요청 번호 매기기가 ZodError로 멈춘다(가능성 낮음 — 기본 `C`/`TC`). 또 `K1`처럼 K로 시작하는 접두는 같음 비교로 막히지 않는다.
- 고칠 내용: 머지 전 설정 화면에서 두 값 확인 한 줄을 SUMMARY 체크로, 또는 해당 두 키에 `readInvalidAsDefault`. 「K로 시작」까지 막을지는 260907 규칙(같음만)을 따른다고 한 줄 명시.

### 2. Code quality
- 인용 확인: `VENDOR_EXPORT_LIMIT` :21 · count :72 · 재확인 :78 ✓, `amount.ts:214-221` 풀기 `document_update` ✓, `record.ts:12/:32/:79/:125` ✓, `CARD_USAGE_NUMBER_MARK` :356 ✓, keys.ts :1195 · :1236 `z.string()` ✓, keys.ts가 document-numbering을 import하지 않음 ✓(index.ts:49가 keys를 import — marks.ts 잎 분리 타당).
- **[P3] (confidence: 9/10) 07.1-05-PLAN.md Task 3 read_first** `hometax-invoice.ts:130-155` — 실제 `companyNoOf` :20 · `isHeaderRow` :26(tax-invoice :17 · :23). 줄 번호만 고치면 됨.
- **[P3] (confidence: 8/10) Task 1 acceptance** `grep -c "aria-describedby" export-button.tsx >= 1` — 지금도 1(`aria-describedby={emptyReasonId}`)이라 변경 없이 통과. 고칠 내용: `grep -c "EVIDENCE_EXPORT_LIMIT\|tooMany" export-button.tsx >= 1`로. 또 빈 결과 이유(emptyReasonId)와 상한 이유가 한 `aria-describedby`를 다투므로 「0건 → emptyReasonId, 초과 → 상한 id」 우선순위 한 줄.

### 3. Tests
**[P2] (confidence: 7/10) 07.1-05-PLAN.md:138 — E2E 5,001행 픽스처가 공유 DB에 남아 다른 스펙을 흔든다**
- 플랜 :138 `증빙 목록 5,001건 픽스처 … 행동 로그도 같은 세 가지`
- `db/migrations/0046_phase7_action_log_immutable.sql:37` `CREATE TRIGGER action_log_no_delete BEFORE DELETE ON action_log` — 행동 로그 5,001행은 지울 수 없다. `/admin/action-log`는 쪽 나눔 없이 전부 그린다(page.tsx:70 · :139 `<ActionLogTable rows={tableRows} />`) → 뒤에 도는 행동 로그 · a11y 스펙이 5,000+줄을 렌더. `playwright.config.ts:92` `fullyParallel: false`이나 workers 기본값이라 파일 간 병렬.
- 고칠 내용: 행동 로그 픽스처는 `pruned_at`을 채워 넣고(삽입은 허용, 기본 보기 SQL이 정리 행을 뺀다) 시험은 `includePruned=1` + 고유 `documentId` 필터로 연다. 증빙 픽스처는 고유 묶음(`batch`)으로 만들어 `?batch=` 로 열고 afterAll에서 지우거나 보관.

커버리지:
```
Task1 증빙 서버 5001/5000 ........ 통합 ✓
Task1 행동로그 서버 5001/5000 ..... 통합 ✓ · 단위 ✓
Task1 화면 비활성/이유 ........... E2E ✓ (행동로그 수 출처 GAP — P1)
Task1 0건+상한 aria 우선순위 ..... GAP (P3)
Task2 새 종류 3배열 · always-on ... 단위 ✓ · 통합 ✓
Task2 옛 document_update 행 표시 .. 통합 ✓
Task3 홈택스 전후 동일 ............ 단위 ✓
Task3 접두 K 거부 · 저장값 읽기 ... 단위 ✓ / 저장된 K 읽기 GAP (P3)
```

### 4. Performance
- 행동 로그 화면 자체가 무제한 읽기 · 렌더(page.tsx:70) — 이 플랜 범위 밖, 참고만(P3 아님 — 후속 후보).

### 실패 모드
| 경로 | 실패 | 시험 | 오류 처리 | 사용자 |
|---|---|---|---|---|
| 행동 로그 내보내기 | 화면 활성 · 서버 거부 | 없음(P1) | 토스트 | 보임(혼란) |
| 행동 로그 5,001 E2E | 다른 스펙 느려짐 | — | — | 조용함(CI) |
| 증빙 내보내기 | 세기~읽기 사이 증가 | 재확인 ✓ | 거부 | 보임 |
| 접두 설정 | 저장된 K 읽기 ZodError | 없음 | 없음 | 보임(번호 매기기 실패) |

---

## 07.1-06 회사에 한 명(대표 · 시스템 관리자) · 시드 표 · 삭제 가드

### 1. Architecture

**[P1] (confidence: 8/10) 07.1-06-PLAN.md:135 · :125 — `registerPerson`은 판정 tx와 계정 생성이 갈라져 동시 「대표 새로 만들기」 둘이 모두 성공한다**
- 플랜 :135 `registerPerson · changePersonRole · … 회사 자리 계급을 잠금 입력에 넘긴다(기존 \`admin: true\` 옆)` — `registerPerson`에는 `lockSeatKeys` 호출도 `admin: true`도 없다.
- 코드 `domain/people/index.ts:389-407`: `await withTransaction(async (tx) => { await assertCanGrantRoles(…); if (!seat) return; … await assertSeatsFree(…) });` 다음 :409 `const { userId, tempPassword } = await createAccount(viewer, {…})` — 판정 tx가 커밋되고 advisory xact 잠금이 풀린 뒤 계정이 만들어진다(:415 주석 「계정 생성(better-auth, 다른 연결)은 위 tx 잠금 밖이다」). 팀장 자리는 뒤의 `assignTeam`이 잠금+쓰기를 한 tx에서 다시 판정해 보상하지만, 회사 자리에는 그런 뒷 판정이 없다.
- 또 `if (!seat) return;`(:391) — 팀 없이 만드는 대표(흔한 경우)는 자리 판정에 닿지도 않는다.
- 플랜 :125 동시성 시험이 `changePersonRole`로만 짜이면 거짓 통과.
- 고칠 내용: Task 1 ④에 「registerPerson: (a) 회사 자리 판정을 `if (!seat) return` 앞에, (b) `createAccount` 뒤 계급 재확인(:417 `findRoleForShare` 자리)과 같은 tx에서 회사 키 잠금 → 자기 제외 보유자 재조회 → 있으면 기존 보상 보관(`archive(SYSTEM_VIEWER, …)`) 후 `SeatTakenError`」를 적고, :125 동시성 사례를 `registerPerson` × 2와 `registerPerson` × `changePersonRole` 둘로 명시.

**[P2] (confidence: 7/10) 07.1-06-PLAN.md:131 · :133 — 회사 키를 어디서 잡는지가 기존 `lockSeatKeys` 구조와 맞지 않는다(잠금 순서)**
- 코드 `repositories/seats.ts:48` `await lockKeys(seatLockOrder(viewer, { personIds, admin: input.admin }), tx);` — 사람 키가 있으면 입력을 다시 만들어 넘기므로 `SeatLockInput`에 새 칸을 더해도 이 갈래에서 버려진다. 그 뒤 :55-61이 팀 · 본부 키를 잡는다.
- 플랜 :133은 `assertSeatsFree`가 「잠금 뒤 재조회」 — `assertSeatsFree`(seat-rules.ts:117)는 팀 · 본부 키를 잡는 자리다. 여기서 회사 키를 잡으면 순서가 사람 → 관리자 → 팀 → **회사**가 되어 :131의 문서 순서(관리자 뒤 · 팀 앞)와 반대. 또 seat-rules.ts:114 `if (teams.length === 0 && orgUnits.length === 0) return;`이 회사 판정 전에 빠져나간다.
- 고칠 내용: :131에 「`lockSeatKeys`의 사람 갈래 첫 호출도 회사 계급 목록을 넘긴다」, :133에 「회사 판정은 팀 · 본부 조기 반환 앞, 회사 키는 호출부의 첫 `lockSeatKeys`에서만(assertSeatsFree에서 다시 잡지 않음)」. `seat-lock-order` 단위 시험에 `lockSeatKeys(personIds+company)`가 실제로 회사 키를 내보내는 사례(가짜 tx로 잡힌 키 순서 기록).

**[P2] (confidence: 6/10) 07.1-06-PLAN.md:42 vs :120 — 「퇴사한 대표」의 범위가 두 줄에서 다르다 → 결정 필요 ①**
- :42 `260907 people_one_per_company(퇴사일 없음 · 보관 안 됨)와 같은 범위` — 퇴사일이 **있으면**(미래 포함) 자리를 비운다.
- :120 `기존 대표가 퇴사(퇴사일 오늘 이전) · 보관이면 저장됨` — 미래 퇴사일 대표는 자리를 지킨다.
- 팀 자리는 구간 겹침 규칙(seat-rules.ts:11 「하루라도 겹치면 둘째」 · 퇴직일에서 잘림 — `listSeatHolders` :139 `least(… users.resignationDate)`).
- 결과: 대표 교체(현 대표 퇴사일 10-31 · 후임 입사 11-01)를 미리 등록할 수 있는지가 실행자 해석에 달린다.

### 2. Code quality
- 인용 확인: `seatTakenMessage` :21 ✓ · `assertSeatsFree` :110 ✓ · `ADMIN_SEAT_LOCK_KEY` :10 · `seatLockOrder` :23 · `lockSeatKeys` :43 · `listSeatHolders` :124 ✓ · people/index.ts :406 · :535 · :553 · :773 · :799 ✓ · restore.ts :71 · :94 ✓. 17행 = 연차 4계급×2(시스템 관리자 제외 — index.ts:217 `upsertPermission` 루프가 맡음) + 지출 4×2 + 팀 1 ✓. 물리 삭제 9곳/8파일 실측 일치 ✓.
- **[P3] (confidence: 8/10) Task 2 verify** — 기존 `test/unit/seed/role-defaults.test.ts`(:15 시드 계급만 · :19 중복 없음 · :24 시스템 관리자 행 0)가 이 변경의 첫 방어선인데 verify에 없다. 연차 루프를 `SEED_ROLES`(시스템 관리자 포함, roles.ts:55)째 옮기면 :24가 깨진다. 고칠 내용: Task 2 verify에 `pnpm exec vitest run --project unit test/unit/seed/role-defaults.test.ts` 추가 · ②에 「연차는 시스템 관리자 제외 4계급」 명시.

### 3. Tests
```
회사 자리 문구 ................. 단위 ✓
registerPerson 대표(팀 없음) ... GAP (P1 — if(!seat) return)
registerPerson 동시 2건 ........ GAP (P1)
changePersonRole 동시 ......... 통합 ✓
lockSeatKeys 사람 갈래 회사 키 . GAP (P2)
복원 · 재입사 · 시스템 관리자 .. 통합 ✓
기존 중복 두 대표 이름 고침 ... 통합 ✓
시드 집합 동일 · 함수 단독 0 .. 통합 ✓ / role-defaults 단위 미실행 (P3)
삭제 가드 ..................... 단위 ✓
```

### 4. Performance
- 회사 키는 계급당 하나라 대표 · 시스템 관리자 저장이 직렬화될 뿐(10~30명) — 문제 없음.

### 실패 모드
| 경로 | 실패 | 시험 | 오류 처리 | 사용자 |
|---|---|---|---|---|
| 대표 새로 만들기 동시 | 둘 다 생성 | 없음 | 없음 | 조용함(결재선 엉킴) |
| 팀 없는 대표 만들기 | 판정 건너뜀 | 없음 | 없음 | 조용함 |
| 회사 키 순서 뒤집힘 | 교착(40P01) | 없음 | tx 실패 | 보임(저장 실패) |
| 시드 이동 | 시스템 관리자 행 표에 섞임 | 단위 있음(미실행) | — | 조용함 |

---

## 07.1-08 `.claude/rules/frontend.md` 한 줄(Codex --out 절차)

**[P2] (confidence: 7/10) 07.1-08-PLAN.md:13 · :61 — 「문서만 — 게이트 없음」은 CLAUDE.md §4 분류와 다르다**
- 플랜 :61 `게이트: 문서만 — /review 없음.`
- CLAUDE.md §4: `문서·계획만(*.md·.claude/gates/ 로그, .claude/·이 파일 제외): 게이트 없음` — `.claude/` 아래 `.md`는 「문서만」에서 빠진다. 훅도 같다: `.claude/hooks/plant8-skill-gate.sh:309` `($i ~ /\.md$/ && $i !~ /^\.claude\// …)`.
- 사용자 머지라 훅이 강제하지 않을 뿐, 절차상 `/review` 대상(§4 공통 「건너뛰려면 먼저 승인」).
- 고칠 내용: :13 · :61 · :147을 `/review`(한 줄이라 짧음)로 바꾸거나, PR 본문에 「.claude 한 줄 — /review 생략 승인 요청」을 적고 사용자 답을 받는다.

**[P3] (confidence: 7/10) 07.1-08-PLAN.md Task 2** — `plant8-rule-guard.test.sh`는 `frontend.md`를 읽지 않는다(`grep -c frontend` = 0) → 이 줄이 무엇이든 녹색. 무해하지만 「PJ5 검증」 근거로는 약하다. 고칠 내용: 그대로 두되 done 문구를 「훅 파일 불변 확인」으로.
- 인용 확인: 허용 줄 `.planning/*.md|test-results/*.md) ;;`(scripts/codex-design-review.sh:24) — verify grep 1 ✓.

실패 모드: 문서 줄 오기재 → 다음 /design-review가 `docs/`로 --out → 스크립트가 exit 2(보임). 위험 낮음.

---

## 07.1-10 퇴사 · 보관 계정 세션(better-auth 엔드포인트)

### 1. Architecture

**[P1] (confidence: 8/10) 07.1-10-PLAN.md:33 · :96 · :98 — 새 before 갈래가 앱 경로(`lib/viewer.ts`의 `auth.api.getSession`)에도 걸려 보관 · 퇴사 계정의 화면 요청이 로그인 이동 대신 오류가 된다**
- 플랜 :33 `앱 화면 경로(lib/viewer.ts getSession …)는 그대로` · :98 `경로가 네 세션 엔드포인트 중 하나이면 … 401 APIError`
- 코드 `lib/viewer.ts:33` `const session = await auth.api.getSession({ headers: await headers() });` — better-auth 1.7.5에서 `auth.api.*`는 `dispatchAuthEndpoint`를 지나며 before 훅을 돈다(`node_modules/better-auth/dist/api/dispatch.mjs:209-210` `const { beforeHooks, afterHooks } = getHooks(...); const before = await runBeforeHooks(...)`; 같은 파일 주석 「Calling an endpoint as a plain function deliberately skips hooks」 — 즉 api 호출은 훅을 탄다). `ctx.path`는 `/get-session`.
- 결과: 보관 · 퇴사자가 화면을 열면 `getSession`이 null 대신 APIError를 던져 `requireSession`의 `redirect("/login")`(viewer.ts:76)에 닿지 못하고 오류 경계. 기존 `test/integration/archived-session.test.ts:48-52`(같은 쿠키로 `auth.api.getSession` → `archivedAt` 실려 옴 단언)도 깨진다 — 플랜 :96은 그 단언을 「유지」한다고 해 서로 모순.
- 추가로 재직자의 모든 화면 요청(`getSession` · `getSessionId` 요청당 여러 번)에 세션 · 사용자 조회가 한 번씩 더 붙는다.
- 고칠 내용: :98에 「`ctx.request`가 있을 때(HTTP `/api/auth/*`로 온 요청)만 판정 — 서버 내부 `auth.api` 호출은 건드리지 않는다(after 훅 :137 `if (!ctx.request)`와 같은 구분)」. 앱 경로 회귀 시험: 보관 뒤 `lib/viewer.getSession()`이 null(던지지 않음)과 `archived-session.test.ts:48` 단언 유지.

**[P2] (confidence: 7/10) 07.1-10-PLAN.md:30 — 네 경로 허용 목록 밖의 세션 엔드포인트가 그대로 열린다**
- `app/api/auth/[...all]/route.ts`가 better-auth 라우트 전부를 연다. 세션 미들웨어를 쓰는 경로(`node_modules/better-auth/dist/api/routes/`): `/update-session` · `/revoke-session(s)` · `/revoke-other-sessions` · `/list-accounts` · `/unlink-account` · `/account-info` · `/get-access-token` · `/change-email` · `/delete-user` · `/verify-password`(password.mjs).
- 퇴사자가 남은 쿠키로 `/verify-password`(비밀번호 맞추기)나 `/list-accounts`를 부를 수 있다.
- 고칠 내용: 「HTTP 요청이고 세션 쿠키가 있으며 경로가 `/sign-in/*` · `/sign-out` · `/request-password-reset` · `/reset-password*` · `/ok` · `/error`가 아니면」 판정(거부 기본). 통합 시험에 `/verify-password` · `/update-session` 사례 추가.

**[P2] (confidence: 5/10) 07.1-10-PLAN.md:98 — 「쿠키의 세션으로 사용자를 읽고(better-auth ctx가 주는 방법)」가 비어 있다**
- before 훅 시점에는 `ctx.context.session`이 아직 없다(dispatch.mjs:193 `session: input.context.session ?? null` — 세션은 엔드포인트의 sessionMiddleware가 채움). `auth.api.getSession`을 훅 안에서 부르면 같은 훅으로 재귀.
- 고칠 내용: 「`getSessionFromCtx`(plain 호출 — 훅 안 탐) 또는 서명 쿠키 → `ctx.context.internalAdapter.findSession(token)`」 중 하나를 read_first 확인 항목으로 못박고, 단위 시험에 「훅 안 조회가 before 훅을 다시 부르지 않는다」.

### 2. Code quality
- 인용 확인: `before` :45 · `if (ctx.path !== "/sign-in/email") return;` :46 ✓ · 퇴사 판정 :66 `user.resignationDate < toKstDate(new Date())` ✓ · 거부 :75 ✓ · `after` :96 ✓ · 네 경로 이름은 1.7.5 실물과 같다(`session.mjs:12 "/get-session"` · `:347 "/list-sessions"` · `update-user.mjs:12 "/update-user"` · `:75 "/change-password"`) ✓. 시험 파일 6개 모두 존재 ✓.
- 판정 함수 공유(로그인 · 새 갈래 · `lib/viewer.ts:47-57`)는 viewer.ts가 위험 경로 밖이라 이 PR에서 viewer.ts까지 바꾸지 않는 것이 맞다 — 다만 세 곳의 같은 규칙을 단위 시험 하나가 같은 표로 검사하면 좋다(P3 생략).

### 3. Tests
```
판정 경계(보관 · 퇴사 어제/오늘) ... 단위 ✓
HTTP /get-session 보관 → 401 · 행 0 . 통합 ✓
앱 경로 auth.api.getSession 보관 ... GAP (P1 — 던지면 안 됨)
재직자 네 경로 정상 ............... 통합 ✓
나머지 세션 경로(/verify-password 등) GAP (P2)
로그인 훅 회귀 ................... 통합 ✓
```

### 4. Performance
- P1 고침(`ctx.request` 한정) 없이는 화면 요청마다 세션 · 사용자 재조회 1회 추가. 고치면 `/api/auth/*` 요청에만(SessionRefresh 마운트당 1회).

### 실패 모드
| 경로 | 실패 | 시험 | 오류 처리 | 사용자 |
|---|---|---|---|---|
| 보관자 화면 요청 | getSession 예외 | 없음 | 없음 | 보임(오류 화면) |
| 퇴사자 /verify-password | 통과 | 없음 | 없음 | 조용함 |
| 훅 내 세션 조회 | 재귀/빈 세션 | 없음 | — | 조용함 또는 500 |
| deleteUserSessions 실패 | 401 전 예외 | 없음 | APIError 아님 → 500 | 보임 |

---

## 07.1-17 「내 차례」 Phase 6 줄 · 전표 대기 · 레이아웃 건수

### 1. Architecture

**[P2] (confidence: 6/10) 07.1-17-PLAN.md:218 · :220 — 홈에서 Phase 6 계산이 두 번 돌 수 있는 설계를 「실측 뒤 판단」으로 미룬다**
- 플랜 :218 `없으면 시트 재료 없는 계산을 별도 열쇠로 memo` · :220 `겹치면 … 나빠졌으면 멈추고`
- 코드 `app/(app)/next-turn-request.ts:15` `pending = listNextTurnItems(viewer, { withDetails: true });` — `withDetails`가 바꾸는 것은 결재 단계 · 가능 행동뿐(`domain/approvals/index.ts:1172` · `:1191`)이고, 무거운 Phase 6 원천(`listAllPaymentTargets` · 구매 · 발행 · 완료 전 점검 — phase6-items.ts:87-119)은 두 계산 모두 돈다. App Router는 레이아웃과 페이지를 병렬로 그리므로 홈에서는 「레이아웃 건수(시트 없음) + 홈 목록(시트 포함)」 두 번이 기본값이 된다 — 홈 밖에서 아끼는 것(결재 상세)보다 홈에서 잃는 것(Phase 6 전체 한 번 더)이 클 수 있다.
- 고칠 내용: memo를 두 층으로 — 「기본 목록(시트 없음)」 한 번을 memo하고, 시트 포함 목록은 그 결과 위에 결재 상세만 더하는 함수로(`listNextTurnItems`에 상세 덧붙이기 분리), 또는 PF1을 「홈 밖에서만 건수 함수」로 좁히고 홈 레이아웃은 기존 함수를 그대로. 단위 시험: 홈 경로에서 공급 함수의 Phase 6 부분이 한 번만 불린다.

**[P3] (confidence: 6/10) 07.1-17-PLAN.md:176 — 구매 묶음 집계는 기존 헬퍼를 1순위로**
- `repositories/purchase-requests.ts:141` `listPurchaseRequestEstimates(viewer, { scope, filter })`는 이미 견적 금액만 읽는 가벼운 질의이고, `listPurchaseRequests`의 totals도 이것(`domain/purchase-requests/index.ts:964` `totals: { count: estimates.length, … sumKrw(estimates) }`)이다. 새 SQL 집계를 「같은 정의」로 다시 쓰는 것보다 `listPurchaseRequestEstimates(viewer, { scope: { kind: "all" }, filter: { status: "requested" } })` 직접 호출이 정의 일치를 보장한다. 고칠 내용: :176의 순서를 뒤집어 기존 함수 호출을 기본으로, 새 집계는 쓰지 않음.

**[P3] (confidence: 5/10) 07.1-17-PLAN.md Task 2 behavior — 전표 대기 집계에 보관된 카드 사용 · 보관 요청 사례가 없다**
- read_first는 `corp-card-usages.ts:30-70(… archived_at)`을 읽히지만 behavior에는 보관 사례가 없다. 보관된 카드 사용(전표 없음)이 영원히 「전표 대기」로 남을 수 있다. 고칠 내용: 통합 사례 「카드 사용 보관 → 세지 않음」 한 줄(카드 목록 `증빙` 열과 같은 대상 집합인지 함께).

**[P3] (confidence: 5/10) 07.1-17-PLAN.md:51(truths W4) — 폰 `.why` 한 줄 말줄임은 결재 · 막힘 줄의 이유도 자른다**
- `ui/next-turn/NextTurn.tsx:51` `{item.reason ? <span className={styles.why}> · {item.reason}</span> : null}` — 공용 줄. 터치 기기에서 `title`은 보이지 않는다. 고칠 내용: ⓑ 분기 실측 표에 결재 · 막힘 줄도 포함하고, 그 줄의 이유가 잘리면 /design-review 항목으로 올린다(플랜 범위 결정은 그대로).

### 2. Code quality
- 인용 확인: phase6-items.ts 머리 주석 :16-18 ✓ · `buildPaymentBundle` :25-37 ✓ · `buildPurchaseBundle` :40-50 ✓ · `buildIssueBundle` :53-63 ✓ · `reason: ""` 현재 5개 ✓(acceptance ≤1 타당) · `findOldestRequestedPurchaseAt` ✓ · `aliveFileExists`(files.ts:24) · `liveLinkExists`(evidence-record-links.ts:124)는 SQL 조각을 돌려주는 함수라 「그대로 부른다」 가능 ✓ · layout.tsx:69 `listNextTurnItemsForRequest(viewer)).length` ✓ · 시험 파일 7개 모두 존재 ✓.
- `listPurchaseRequests` import가 고아가 된다 — lint가 잡음(문제 없음).

### 3. Tests
```
Phase6 label/reason 이동 .......... 단위 ✓
폰 375/320 2줄 · title .......... E2E ✓
전표 대기 셈(파일/붙임/없음) ..... 통합 ✓
전표 대기 보관 카드 사용 ......... GAP (P3)
권한 없음 → 줄 0 · 집계 미호출 ... 통합 ✓
구매 묶음 건수 · 합계 동일 ........ 통합 ✓
건수 함수 시트 없음 · memo 재사용 . 단위 ✓
홈에서 Phase6 한 번만 ............ GAP (P2)
홈 밖 N = 홈 N ................... E2E ✓
```

### 4. Performance
- 위 P2(홈 이중 계산)가 핵심. 전표 대기 집계는 `purchase_requests.status` + `corp_card_usages.purchase_request_id`(고유) 조인 · exists 둘 — 30명 규모에서 문제 없음.

### 실패 모드
| 경로 | 실패 | 시험 | 오류 처리 | 사용자 |
|---|---|---|---|---|
| 레이아웃 건수 + 홈 목록 | Phase6 두 번 → 홈 느려짐 | 없음(실측만) | — | 보임(느림) |
| 전표 대기 집계 오류 | 홈 Phase6 전체 실패 | 없음 | 상위 next_turn 처리 | 보임 |
| 보관 카드 사용 | 영구 대기 줄 | 없음 | — | 보임(오탐) |

---

## 19플랜 실행 순서 점검 (frontmatter만)

**files_modified 겹침(다른 플랜과)** — 23개 파일, 전부 웨이브가 다르고 뒤 플랜이 앞 플랜을 depends_on(직접 또는 전이)으로 품는다:
- `evidence-table.tsx` 01→05→18→19 ✓(18←15←05 · 19←05,18) · `evidence-list-audit.spec.ts` 01→05→19 ✓
- `domain/payments/index.ts` 03→12→16 ✓ · `expense-payments.test.ts` 03→12→16 ✓ · `payment-batch.test.ts` 03→16 ✓ · `targets.ts` 03→16 ✓
- `domain/people/index.ts` · `people.test.ts` 06→13→14 ✓ · `repositories/users.ts` 07→14 ✓ · `person-form.tsx` · `people.spec.ts` 02→14 ✓ · `mobile-people.spec.ts` 14→18 ✓(18←15←14)
- `detail-lines.ts`(+단위) 04→13 ✓ · `evidence-import/index.ts` · `evidence-import-concurrency` · `evidence-card-relink` 04→12 ✓ · `domain/evidence/index.ts` 03→12 ✓
- `settings/keys.ts` · `registry.test.ts` 03→05 ✓ · `card-usage-list.tsx` · `mobile-card-usage-320` 11→19 ✓ · `expense-form.tsx` 16→19 ✓
- 같은 웨이브 안 겹침 0(웨이브1: 01·02·03·04·06·08·10 / 2: 05·07·11·12·13 / 3: 14 / 4: 15·16·17 / 5: 18 / 6: 19).

**위험 경로 분리** — 훅 정규식(`plant8-skill-gate.sh:312`)에 걸리는 파일은 07(db/schema · db/migrations · domain/permissions) · 08(.claude/) · 10(domain/auth)뿐이고 셋 다 `merge_owner: user` · 단독 PR ✓. 세션 머지 플랜 중 정규식에 걸리는 파일 0 ✓. 돈 정규식(:316)에 걸리는 03(domain/money) · 12(domain/corp-cards) · 13(domain/revenue)은 모두 gates에 /cso ✓.

**[P3] (confidence: 7/10) 사용자 머지가 임계 경로 위에 있다** — 14(w3) depends_on 07(사용자 머지) → 15 → 18 → 19. 07의 사용자 머지 대기가 그대로 페이즈 끝을 민다. 고칠 내용: 07 PR을 웨이브 2 첫 순서로 열고 「사용자 머지 대기」를 STATE에 표시(계획 변경 불필요).

**[P3] (confidence: 6/10) 16 · 17의 웨이브 4 배치 근거가 사라졌다** — 16(depends 03·09·12 → 3) · 17(depends 01 → 2)은 #296 · #298 대기 때문에 4였는데 둘 다 머지됨(external_depends_on에 SHA 기록). 웨이브를 당기면(17→2, 16→3) 임계 경로와 무관하게 병렬도가 늘어난다. 레인 규칙(만들기 1)상 효과가 작으면 그대로 둬도 됨 — 참고.

**결론**: depends_on · 웨이브 · files_modified 겹침은 실행 순서상 맞다. 위험 경로 PR 분리도 맞다.

---

## 결정 필요

① **대표 교체 시 미리 등록(07.1-06 :42 vs :120)**
- A. 구간 규칙(팀장과 같음 — 퇴사일까지 자리 차지, 후임은 퇴사일 다음 날부터 겹치지 않으면 저장) **← 추천**: 기존 seat-rules 꼴 재사용 · 미리 등록 가능 · 「하루라도 둘」 없음
- B. 260907 그대로(퇴사일이 적히면 즉시 자리 빔)
- C. 오늘 기준(퇴사일 < 오늘이어야 빔 — 플랜 :120 문구) : 교체 당일까지 후임 등록 불가

② **퇴사 · 보관 계정 차단 범위(07.1-10)**
- A. 세션 쿠키가 있는 HTTP auth 요청 전부 거부(로그인 · 로그아웃 · 비밀번호 재설정 경로만 예외) **← 추천**: 허용 목록 밖 경로 틈 없음
- B. 플랜대로 네 경로만 + `/verify-password` · `/update-session` 추가
